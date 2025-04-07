import React, { useState, useEffect, useRef } from 'react';
import { Layout, Button, Space, message, Upload, Flex, Modal, Input } from 'antd';
import { RobotOutlined, DownloadOutlined, QuestionOutlined, SettingOutlined, UploadOutlined } from '@ant-design/icons';
import AnnotationPanel from './components/AnnotationPanel';
import { Annotation, CodeItem, DocumentRange } from './types';
import './App.css';
import type { UploadProps } from 'antd';
import { computeLighterColor, getRandomColor } from 'components/utils';
import { useCrossViewStateStore } from 'crossState';
import BaseAnnotationTargetPanel from 'components/BaseAnnotationTargetPanel';
import OpenAI from "openai";

const { Sider, Content } = Layout;

interface HistoryState {
  annotations: Annotation[];
  currentAnnotation: Annotation | null;
}

interface HelpModalItem {
  id: string;
  title: string;
  staticContent: JSX.Element;
}
const helpModalItems: HelpModalItem[] = [
  {
    id: 'basicUsage',
    title: '基本使用',
    staticContent: (
      <div>
        <p>文档、代码、标注会自动保存于该应用的本地存储。</p>
        <p>使用 <code>Ctrl + Z</code> 和 <code>Ctrl + Y</code> 撤销和重做对标注的改动。</p>
        <p>如需使用 AI，设置中填写 DeepSeek API Key。</p>
        <p style={{ fontSize: 'smaller', color: '#00000055' }}>注意：联网使用 AI 时，文档和代码可能会分享给 DeepSeek。</p>
      </div>
    )
  },
  {
    id: 'about',
    title: '关于',
    staticContent: (<>作者：Yuhuan Huang & Code Philia Research Group.</>)
  }
];
const helpModalOptions = helpModalItems.map(x => x.id);

interface SettingsModalItem {
  id: string;
  title: string;
}
const settingsModalItems: SettingsModalItem[] = [
  {
    id: 'ai',
    title: 'AI'
  }
];

const App: React.FC = () => {
  const isFirstLoaded = useRef(true);
  const setShouldFocusOnRename = useCrossViewStateStore((state) => state.setShouldFocusOnRenameId);

  const [docFiles, setDocFiles] = useState<CodeItem[]>([]);
  const [codeFiles, setCodeFiles] = useState<CodeItem[]>([]);
  const pendingAnnotations = useRef<{ annotationId: string, targetType: string, range: DocumentRange }[]>([]);

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 历史记录状态
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);

  // 设置对话框
  const [isSettingsModalShow, setIsSettingsModalShow] = useState(false);
  const [currentSettingsModalOption, setCurrentSettingsModalOption] = useState('ai');
  const [apiToken, setApiToken] = useState('');

  // 帮助对话框
  const [isHelpModalShown, setIsHelpModalShown] = useState(false);
  const [currentHelpModalOption, setCurrentHelpModalOption] = useState('basicUsage');

  const getExistingColorIterable = function* () {
    for (const a of annotations) {
      yield a.color ?? '#FFFFFF';
    }
  }

  // 添加新的历史记录
  const addToHistory = (newState: HistoryState) => {
    const newHistory = history.slice(0, currentHistoryIndex + 1);
    newHistory.push(newState);
    setHistory(newHistory);
    setCurrentHistoryIndex(newHistory.length - 1);
  };

  // 更新标注时同时更新历史记录
  const updateAnnotations = (newAnnotations: Annotation[], newCurrentAnnotation: Annotation | null = currentAnnotation) => {
    setAnnotations(newAnnotations);
    setCurrentAnnotation(newCurrentAnnotation);
    addToHistory({
      annotations: newAnnotations,
      currentAnnotation: newCurrentAnnotation
    });
  };

  // 撤销
  const handleUndo = () => {
    if (currentHistoryIndex > 0) {
      const newIndex = currentHistoryIndex - 1;
      const previousState = history[newIndex];
      setCurrentHistoryIndex(newIndex);
      setAnnotations(previousState.annotations);
      setCurrentAnnotation(previousState.currentAnnotation);
    }
  };

  // 重做
  const handleRedo = () => {
    if (currentHistoryIndex < history.length - 1) {
      const newIndex = currentHistoryIndex + 1;
      const nextState = history[newIndex];
      setCurrentHistoryIndex(newIndex);
      setAnnotations(nextState.annotations);
      setCurrentAnnotation(nextState.currentAnnotation);
    }
  };

  // 删除标注
  const handleDeleteAnnotation = (annotationId: string) => {
    const newAnnotations = annotations.filter(a => a.id !== annotationId);
    const newCurrentAnnotation = currentAnnotation?.id === annotationId ? null : currentAnnotation;
    updateAnnotations(newAnnotations, newCurrentAnnotation);
    message.success('标注已删除');
  };

  const handleRenameAnnotation = (annotationId: string, name: string) => {
    const updatedAnnotations = [...annotations]
    const matchedAnnotation = updatedAnnotations.find(a => a.id === annotationId);
    if (matchedAnnotation) {
      matchedAnnotation.category = name;
    }

    setAnnotations(updatedAnnotations);
  }

  // 删除文件
  const handleDeleteFile = (fileId: string, targetType: string) => {
    if (targetType === 'document') {
      const updatedDocFiles = docFiles.filter(file => file.id !== fileId);
      setDocFiles(updatedDocFiles);

      // 删除标注中该文档的范围
      const updatedAnnotations = annotations.map(annotation => ({
        ...annotation,
        documentRanges: annotation.documentRanges.filter(range => range.documentId !== fileId),
      }));
      setAnnotations(updatedAnnotations);

      message.success('文档已删除');
    } else if (targetType === 'code') {
      const updatedCodeFiles = codeFiles.filter(file => file.id !== fileId);
      setCodeFiles(updatedCodeFiles);

      // 删除标注中该代码的范围
      const updatedAnnotations = annotations.map(annotation => ({
        ...annotation,
        codeRanges: annotation.codeRanges.filter(range => range.documentId !== fileId),
      }));
      setAnnotations(updatedAnnotations);

      message.success('代码已删除');
    }
  };

  // 初始化历史记录
  useEffect(() => {
    if (history.length === 0) {
      addToHistory({
        annotations: annotations,
        currentAnnotation: currentAnnotation
      });
    }
  }, []);

  // 添加键盘快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentHistoryIndex, history]);

  const handleCreateAnnotation = async (category?: string) => {
    const newColor = getRandomColor(getExistingColorIterable);
    const newLighterColor = computeLighterColor(newColor);

    const id = String(annotations.length + 1);

    const newAnnotation: Annotation = {
      id: id,
      category: category ?? '未命名标注',
      documentRanges: [],
      codeRanges: [],
      updateTime: new Date().toISOString(),
      color: newColor,
      lighterColor: newLighterColor
    };

    let updateAnnotation = [newAnnotation, ...annotations];
    setAnnotations(updateAnnotation);
    setCurrentAnnotation(newAnnotation);

    if (category === undefined) {
      setShouldFocusOnRename(id);
    }

    return newAnnotation.id;
  };

  // 检查范围是否重叠
  const isRangeOverlap = (range1: DocumentRange, range2: DocumentRange): boolean => {
    // 如果是不同文档的范围，不算重叠
    if (range1.documentId !== range2.documentId) {
      return false;
    }
    return !(range1.end <= range2.start || range1.start >= range2.end);
  };

  // 检查新范围是否与现有范围重叠
  const hasOverlappingRange = (range: DocumentRange, existingRanges: DocumentRange[]): boolean => {
    return existingRanges.some(existing => isRangeOverlap(range, existing));
  };

  const handleAddToAnnotation = async (range: DocumentRange, type: string, id: string | undefined = undefined, createNew = false) => {
    let selectedAnnotation: Annotation | null = id === undefined ? null : (annotations.find(a => a.id === id) ?? null);
    if (selectedAnnotation === undefined) {
      selectedAnnotation = currentAnnotation;
    }

    let annotation = selectedAnnotation;
    let _annotations = annotations;

    if (!annotation || createNew) {
      // 如果没有选中的标注项，自动创建一个新的
      const newId = String(annotations.length + 1);
      const newColor = getRandomColor(getExistingColorIterable);
      const newLighterColor = computeLighterColor(newColor);

      const newAnnotation: Annotation = {
        id: String(annotations.length + 1),
        category: '未命名标注',
        documentRanges: [],
        codeRanges: [],
        updateTime: new Date().toISOString(),
        color: newColor,
        lighterColor: newLighterColor
      };

      _annotations = [newAnnotation, ...annotations];

      annotation = _annotations.find(a => a.id === newId) || null;

      if (!annotation) {
        message.error('创建标注失败');
        return;
      } else {
        setShouldFocusOnRename(newId);
      }
    }

    // 检查是否与当前标注的范围重叠
    const existingRanges = type === 'document'
      ? annotation.documentRanges
      : annotation.codeRanges;

    if (hasOverlappingRange(range, existingRanges)) {
      message.warning('该范围与现有标注重叠，请选择其他范围');
      return;
    }

    // 检查是否与其他标注的范围重叠
    const hasOverlapWithOther = _annotations.some(a => {
      if (a.id === annotation?.id) return false;
      const ranges = type === 'document' ? a.documentRanges : a.codeRanges;
      return hasOverlappingRange(range, ranges);
    });

    if (hasOverlapWithOther) {
      message.warning('该范围与其他标注重叠，请选择其他范围');
      return;
    }

    const newAnnotations = _annotations.map(a => {
      if (a.id === annotation?.id) {
        return {
          ...a,
          documentRanges: type === 'document'
            ? [...a.documentRanges, range]
            : a.documentRanges,
          codeRanges: type === 'code'
            ? [...a.codeRanges, range]
            : a.codeRanges,
          updateTime: new Date().toISOString(),
        };
      }
      return a;
    });

    const newCurrentAnnotation = {
      ...annotation,
      documentRanges: type === 'document'
        ? [...annotation.documentRanges, range]
        : annotation.documentRanges,
      codeRanges: type === 'code'
        ? [...annotation.codeRanges, range]
        : annotation.codeRanges,
      updateTime: new Date().toISOString(),
    };

    setAnnotations(newAnnotations);
    setCurrentAnnotation(newCurrentAnnotation);

    // 添加到历史记录
    addToHistory({
      annotations: newAnnotations,
      currentAnnotation: newCurrentAnnotation
    });

    message.success('添加标注内容成功');
  };

  const handleRemoveAnnotationRange = (range: DocumentRange, type: string, annotationId: string) => {
    if (!currentAnnotation) {
      message.warning('请先选择一个标注项');
      return;
    }

    const filterAnnotationRanges = (annotation: Annotation) => ({
      ...annotation,
      documentRanges: type === 'document'
        ? annotation.documentRanges.filter(r =>
            r.start !== range.start || r.end !== range.end
          )
        : annotation.documentRanges,
      codeRanges: type === 'code'
        ? annotation.codeRanges.filter(r =>
            r.start !== range.start || r.end !== range.end
          )
        : annotation.codeRanges,
      updatedAt: new Date().toISOString(),
    });

    const newAnnotations = annotations.map(annotation => {
      if (annotation.id === annotationId) {
        return filterAnnotationRanges(annotation);
      }
      return annotation;
    });

    const newCurrentAnnotation = newAnnotations.find(a => a.id === currentAnnotation.id) ?? null;

    setAnnotations(newAnnotations);
    setCurrentAnnotation(newCurrentAnnotation);

    // 添加到历史记录
    addToHistory({
      annotations: newAnnotations,
      currentAnnotation: newCurrentAnnotation
    });

    message.success('取消标注成功');
  };

  const handleDocumentUpload = (result: { id: string; name: string }) => {
    // message.success(`文档 ${result.name} 上传成功`);
  };

  const handleCodeUpload = (result: { id: string; name: string }) => {
    // message.success(`代码 ${result.name} 上传成功`);
  };

  // 加载保存的标注数据
  useEffect(() => {
    if (!isFirstLoaded.current) {
      return;
    }

    const savedAnnotations = localStorage.getItem('annotations');
    if (savedAnnotations) {
      try {
        const parsed = JSON.parse(savedAnnotations);
        setAnnotations(parsed);
        message.success('已加载保存的标注');
      } catch (error) {
        console.error('Failed to load annotations:', error);
        message.error('加载标注失败');
      }
    }

    const savedTargetFiles = localStorage.getItem('annotationTargetFiles');
    if (savedTargetFiles) {
      try {
        const { docFiles: _docFiles, codeFiles: _codeFiles } = JSON.parse(savedTargetFiles);

        removeRenderedInfo(_docFiles);
        removeRenderedInfo(_codeFiles);

        setDocFiles(_docFiles);
        setCodeFiles(_codeFiles);
        message.success('已加载保存的代码和文档');
      } catch (error) {
        console.error('Failed to load doc and code:', error);
        message.error('加载代码和文档失败');
      }
    }

    const savedSettings = localStorage.getItem('settings');
    if (savedSettings) {
      try {
        const { apiToken } = JSON.parse(savedSettings);
        setApiToken(apiToken);
        // message.success('已加载保存的设置');
      } catch (error) {
        console.error('Failed to load settings:', error);
        // message.error('加载设置失败');
      }
    }

    isFirstLoaded.current = false;
  }, [isFirstLoaded]);

  // 自动保存标注数据
  useEffect(() => {
    try {
      localStorage.setItem('annotations', JSON.stringify(annotations));
    } catch (error) {
      console.error('Failed to save annotations:', error);
      message.error('自动保存标注失败');
    }
  }, [annotations]);

  useEffect(() => {
    try {
      const _docFiles = Array.from(docFiles);
      const _codeFiles = Array.from(codeFiles);

      removeRenderedInfo(_docFiles);
      removeRenderedInfo(_codeFiles);

      localStorage.setItem('annotationTargetFiles', JSON.stringify({
        docFiles: docFiles,
        codeFiles: codeFiles
      }));
    } catch (error) {
      console.error('Failed to save doc and code:', error);
      message.error('自动保存文档和代码失败');
    }
  }, [docFiles, codeFiles]);

  useEffect(() => {
    try {
      localStorage.setItem('settings', JSON.stringify({
        apiToken: apiToken
      }));
    } catch (error) {
      console.error('Failed to save settings:', error);
      message.error('保存设置失败');
    }
  }, [apiToken]);

  // 手动保存标注数据
  const handleSaveAnnotations = () => {
    try {
      // 创建要保存的数据
      const data = JSON.stringify({
        annotations,
        docFiles,
        codeFiles
      }, null, 2);

      // 创建 Blob 对象
      const blob = new Blob([data], { type: 'application/json' });

      // 创建下载链接
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // 设置文件名，使用当前时间戳
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `annotations-${timestamp}.json`;

      // 触发下载
      document.body.appendChild(link);
      link.click();

      // 清理
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      message.success('标注数据已保存到文件');
    } catch (error) {
      console.error('Failed to save annotations:', error);
      message.error('保存标注失败');
    }
  };

  // 加载保存的标注数据
  const handleLoadAnnotations = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const { annotations, docFiles, codeFiles } = JSON.parse(content);
        setAnnotations(annotations);
        setDocFiles(docFiles);
        setCodeFiles(codeFiles);
        message.success('标注数据加载成功');
      } catch (error) {
        console.error('Failed to load annotations:', error);
        message.error('加载标注数据失败');
      }
    };
    reader.readAsText(file);
  };

  const handleGenerateAnnotations = async () => {
    if (apiToken.trim() === '') {
      message.info(<span>使用 AI 前, 先填写 <a href='https://platform.deepseek.com/api_keys' target='_blank' rel='noopener noreferrer'>DeepSeek API Key.</a></span>);
      setIsSettingsModalShow(true);
      return;
    }

    setIsLoading(true);
    try {
      const documentContent = docFiles[0]?.content ?? '';
      const codeContent = codeFiles[0]?.content ?? ''; // Replace with actual code content

      const openai = new OpenAI({
        baseURL: 'https://api.deepseek.com',
        apiKey: apiToken,
        dangerouslyAllowBrowser: true   // FIXME
      });

      // const getExistingAnnotationsOnDocAndCode = (docId: string, codeId: string) => {
      //   const existingAnnotations: Annotation[] = [];
      //   for (const a of annotations) {
      //     const rangesInDoc = a.docrange
      //   }
      // }

      const completion = await openai.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant on software engineering. Suggest a single new annotation on the documentation and code with annotations.\n\n" +
              "Documentation:\n```\n" + documentContent + "\n```\n\n" +
              "Code:\n```\n" + codeContent + "\n```\n\n" +
              "Please abide by the following format in RegEx: `/annotation name: (.+?) document:<label>(.+?)<\/label> code: <label>(.+?)<\/label>/` .\n" +
              "Fill in the annotation name with Chinese. Fill in the content with the original language (Chinese/English). I will extract the result with that." + ""
              // (annotations.length === 0 ? "" : "Note that there are some existing annotations, do not replicate: " +
              //   annotations
              // )
          },
          {
            role: "user",
            content: `Document: ${documentContent}\nCode: ${codeContent}`
          }
        ],
        model: "deepseek-chat"
      });

      const response = completion.choices[0].message.content;
      if (response === null) {
        throw new Error('无法从 API 响应中解析内容');
      }

      const annotationRegex = /annotation name: (.+?) document:<label>(.+?)<\/label> code: <label>(.+?)<\/label>/;
      const match = response.match(annotationRegex);

      if (match) {
        const [, category, documentLabel, codeLabel] = match;

        const newAnnotationId = await handleCreateAnnotation(category);
        if (newAnnotationId) {
          const documentStart = documentContent.indexOf(documentLabel);
          const documentEnd = documentStart + documentLabel.length;
          const documentRange: DocumentRange = {
            documentId: docFiles[0]?.id ?? '',
            start: documentStart,
            end: documentEnd,
            content: documentContent.slice(documentStart, documentEnd)
          };

          const codeStart = codeContent.indexOf(codeLabel);
          const codeEnd = codeStart + codeLabel.length;
          const codeRange: DocumentRange = {
            documentId: codeFiles[0]?.id ?? 0,
            start: codeStart,
            end: codeEnd,
            content: codeContent.slice(codeStart, codeEnd)
          };

          pendingAnnotations.current.push({
            annotationId: newAnnotationId,
            targetType: 'document',
            range: documentRange
          });
          pendingAnnotations.current.push({
            annotationId: newAnnotationId,
            targetType: 'code',
            range: codeRange
          });
        }
      } else {
        message.error("无法解析 DeepSeek API 的响应");
      }
    } catch (error) {
      console.error("Failed to generate annotations:", error);
      message.error("生成标注失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    console.log(`clearing pended annotation`);
    if (pendingAnnotations.current.length > 0) {
      const { annotationId, targetType, range } = pendingAnnotations.current[0];
      handleAddToAnnotation(range, targetType, annotationId);
      pendingAnnotations.current.splice(0, 1);
    }
  });

  const uploadProps: UploadProps = {
    beforeUpload: (file) => {
      if (file.type !== 'application/json') {
        message.error('只能上传 JSON 文件！');
        return Upload.LIST_IGNORE;
      }
      handleLoadAnnotations(file);
      return false;
    },
    showUploadList: false,
  };

  return (
    <Layout className="app-layout">
      <Sider width={64} className="toolbar" theme="light">
        <Flex style={{ height: "100%" }} vertical={true} justify='space-between'>
          <Space direction="vertical" size="middle" style={{ width: '100%', padding: '20px 0', alignItems: 'center' }}>
            <Upload {...uploadProps}>
              <Button
                icon={<DownloadOutlined />}
                title="导入标注"
              />
            </Upload>
            <Button
              icon={<UploadOutlined />}
              onClick={handleSaveAnnotations}
              title="导出标注"
            />
            <Button
              icon={<RobotOutlined />}
              onClick={handleGenerateAnnotations}
              loading={isLoading}
              title="AI自动生成标注"
            />
          </Space>
          <Space direction="vertical" size="middle" style={{ width: '100%', padding: '20px 0', alignItems: 'center' }}>
            <Button
              icon={<SettingOutlined />}
              onClick={() => { setIsSettingsModalShow(!isSettingsModalShow); }}
              title="设置"
            />
            <Button
              icon={<QuestionOutlined />}
              onClick={() => { setIsHelpModalShown(!isHelpModalShown); }}
              title="帮助"
            />
          </Space>
        </Flex>
      </Sider>

      <Layout>
        <Content className="main-content">
        <BaseAnnotationTargetPanel
            files={docFiles}
            onSetFiles={setDocFiles}
            targetType="document"
            targetTypeName='文档'
            className="panel"
            onUpload={handleCodeUpload}
            onAddToAnnotation={(range, targetType, annotationId, createNew) => handleAddToAnnotation(range, targetType, annotationId, createNew)}
            onRemoveAnnotationRange={(range, targetType, annotationId) => handleRemoveAnnotationRange(range, targetType, annotationId)}
            onRemoveFile={handleDeleteFile}
            annotations={annotations}
            cssOnPre={{ whiteSpace: 'pre-wrap' }}
          />
          <BaseAnnotationTargetPanel
            files={codeFiles}
            onSetFiles={setCodeFiles}
            targetType="code"
            targetTypeName='代码'
            className="panel"
            onUpload={handleCodeUpload}
            onAddToAnnotation={(range, targetType, annotationId, createNew) => handleAddToAnnotation(range, targetType, annotationId, createNew)}
            onRemoveAnnotationRange={(range, targetType, annotationId) => handleRemoveAnnotationRange(range, targetType, annotationId)}
            onRemoveFile={handleDeleteFile}
            annotations={annotations}
          />
          <AnnotationPanel
            annotations={annotations}
            currentAnnotation={currentAnnotation}
            onAnnotationCreate={handleCreateAnnotation}
            onAnnotationSelect={setCurrentAnnotation}
            onAnnotationDelete={handleDeleteAnnotation}
            onAnnotationRename={handleRenameAnnotation}
            className="annotation-panel"
          />
        </Content>
      </Layout>
      <Modal
        className='help-modal'
        title="设置"
        open={isSettingsModalShow}
        footer={null}
        onCancel={() => {
          setIsSettingsModalShow(!isSettingsModalShow);
          setCurrentSettingsModalOption('ai');
        }}
        mask={false}
      >
        <Layout>
          <Sider className="toolbar" width='100px' theme='light'>
            <Space direction='vertical' size='middle' style={{ width: '100%', padding: '20px 12px 20px 0px', alignItems: 'center' }}>
            {
                settingsModalItems.map(x =>
                  <Button
                    color='default'
                    variant='text'
                    style={{ width: '100%' }}
                    className={x.id === currentSettingsModalOption ? 'selected-help-modal-option' : undefined}
                    onClick={() => { setCurrentSettingsModalOption(x.id) }}
                    key={x.id}
                  >
                    {x.title}
                  </Button>
                )
              }
            </Space>
          </Sider>
          <Content className='modal-content'>
            {
              currentSettingsModalOption === 'ai'
                ?
                <div>
                  <div style={{ padding: '0 0 2px 0', margin: 0, fontWeight: 'bold' }}>DeepSeek API Key</div>
                  <Input
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                  />
                </div>
                :
                ''
            }
          </Content>
        </Layout>
      </Modal>
      <Modal
        className='help-modal'
        title="帮助"
        open={isHelpModalShown}
        footer={null}
        onCancel={() => {
          setIsHelpModalShown(!isHelpModalShown);
          setCurrentHelpModalOption('basicUsage');
        }}
        mask={false}
      >
        <Layout>
          <Sider className="toolbar" width='100px' theme='light'>
            <Space direction='vertical' size='middle' style={{ width: '100%', padding: '20px 12px 20px 0px', alignItems: 'center' }}>
              {
                helpModalItems.map(x =>
                  <Button
                    color='default'
                    variant='text'
                    style={{ width: '100%' }}
                    className={x.id === currentHelpModalOption ? 'selected-help-modal-option' : undefined}
                    onClick={() => { setCurrentHelpModalOption(x.id) }}
                    key={x.id}
                  >
                    {x.title}
                  </Button>
                )
              }
            </Space>
          </Sider>
          <Content className='modal-content'>
            {
              helpModalItems.find(x => x.id === currentHelpModalOption)?.staticContent ?? ''
            }
          </Content>
        </Layout>
      </Modal>
    </Layout>
  );
};

export default App;

function removeRenderedInfo(files: CodeItem[]) {
  for (const f of files) {
    delete f.renderedDocument;
  }
}
