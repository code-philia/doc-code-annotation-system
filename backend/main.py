from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
import json
from datetime import datetime
import os
import openai
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 配置OpenAI
openai.api_key = os.getenv("OPENAI_API_KEY")

# 数据模型
class Range(BaseModel):
    start: int
    end: int
    content: str

class AnnotationCategory(BaseModel):
    name: str
    document_ranges: List[Range]
    code_ranges: List[Range]

class Annotation(BaseModel):
    id: str
    document_id: str
    code_id: str
    categories: Dict[str, AnnotationCategory]

class AIAnnotationRequest(BaseModel):
    document_id: str
    code_id: str

# 内存中的数据存储
documents = {}
code_files = {}
annotations = {}

@app.post("/api/documents/upload")
async def upload_document(file: UploadFile = File(...)):
    content = await file.read()
    doc_id = str(datetime.now().timestamp())
    documents[doc_id] = {
        "id": doc_id,
        "name": file.filename,
        "content": content.decode()
    }
    return {"id": doc_id, "name": file.filename}

@app.post("/api/code/upload")
async def upload_code(file: UploadFile = File(...)):
    content = await file.read()
    code_id = str(datetime.now().timestamp())
    code_files[code_id] = {
        "id": code_id,
        "name": file.filename,
        "content": content.decode()
    }
    return {"id": code_id, "name": file.filename}

@app.post("/api/annotations")
async def create_annotation(annotation: Annotation):
    annotation_id = str(datetime.now().timestamp())
    annotations[annotation_id] = annotation.dict()
    return {"id": annotation_id, **annotation.dict()}

@app.get("/api/annotations/{annotation_id}")
async def get_annotation(annotation_id: str):
    if annotation_id not in annotations:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return annotations[annotation_id]

@app.get("/api/documents/{doc_id}")
async def get_document(doc_id: str):
    if doc_id not in documents:
        raise HTTPException(status_code=404, detail="Document not found")
    return documents[doc_id]

@app.get("/api/code/{code_id}")
async def get_code(code_id: str):
    if code_id not in code_files:
        raise HTTPException(status_code=404, detail="Code file not found")
    return code_files[code_id]

@app.post("/api/annotations/{annotation_id}/save")
async def save_annotation(annotation_id: str, annotation: Annotation):
    if annotation_id not in annotations:
        raise HTTPException(status_code=404, detail="Annotation not found")
    annotations[annotation_id] = annotation.dict()
    
    # 保存到文件
    save_dir = "saved_annotations"
    os.makedirs(save_dir, exist_ok=True)
    
    filename = f"{save_dir}/annotation_{annotation_id}.json"
    with open(filename, "w") as f:
        json.dump(annotation.dict(), f, indent=2)
    
    return {"message": "Annotation saved successfully"}

@app.post("/api/annotations/generate")
async def generate_annotation(request: AIAnnotationRequest):
    if request.document_id not in documents:
        raise HTTPException(status_code=404, detail="Document not found")
    if request.code_id not in code_files:
        raise HTTPException(status_code=404, detail="Code file not found")

    doc = documents[request.document_id]
    code = code_files[request.code_id]

    # 使用OpenAI API生成标注
    prompt = f"""
    请分析以下文档和代码，找出它们之间的对应关系：

    文档内容：
    {doc['content']}

    代码内容：
    {code['content']}

    请以JSON格式返回标注结果，格式如下：
    {{
        "categories": {{
            "category_name": {{
                "name": "类别名称",
                "document_ranges": [
                    {{ "start": 0, "end": 10, "content": "文档中的内容" }}
                ],
                "code_ranges": [
                    {{ "start": 0, "end": 10, "content": "代码中的内容" }}
                ]
            }}
        }}
    }}
    """

    response = await openai.ChatCompletion.acreate(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "你是一个代码文档标注助手，擅长分析代码和文档之间的对应关系。"},
            {"role": "user", "content": prompt}
        ],
        temperature=0.7,
    )

    try:
        result = json.loads(response.choices[0].message.content)
        annotation = {
            "id": str(datetime.now().timestamp()),
            "document_id": request.document_id,
            "code_id": request.code_id,
            "categories": result["categories"]
        }
        return annotation
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate annotation: {str(e)}") 