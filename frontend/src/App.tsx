import React, { useEffect, useRef, useState } from 'react';

import { DownloadOutlined, FileAddOutlined, QuestionOutlined, RobotOutlined, SettingOutlined, UploadOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { Button, Flex, Input, Layout, message, Modal, Space, Upload } from 'antd';
import AnnotationDocumentPanel from 'components/AnnotationContentPanel';
import OpenAI from "openai";
import { useCrossViewStateStore } from 'state';
import { computeLighterColor, generateUUID, getRandomColor } from 'utils';

import './App.css';
import AnnotationPanel from './components/AnnotationPanel';
import { Annotation, AnnotationDocumentItem, DocumentRange } from './types';

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

  const [docFiles, setDocFiles] = useState<AnnotationDocumentItem[]>([]);
  const [codeFiles, setCodeFiles] = useState<AnnotationDocumentItem[]>([]);
  const pendingAnnotations = useRef<{ annotationId: string, targetType: string, range: DocumentRange }[]>([]);

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [recentAnnotations, setRecentAnnotations] = useState<Annotation[]>([]);

  const raiseToRecentAnnotation = (annotation: Annotation) => {
    recentAnnotations.unshift(annotation);
    setRecentAnnotations(recentAnnotations.slice(0, 3));
  }

  const searchAnnotations = (keyword: string) => {
    const limit = 3;
    let candidate = 0;

    const result: Annotation[] = [];

    const searchArray = (annotations: Annotation[], refAnnotations?: Annotation[]) => {
      for (let i = 0; candidate < limit && i < annotations.length; ++i) {
        const a = annotations[i];

        if (refAnnotations && !refAnnotations.includes(a)) {
          return;
        }

        if ((!keyword || a.category.includes(keyword)) && !result.includes(a)) {    // if keyword is '' pick it
          result.push(a);
          ++candidate;
        }
      }
    }

    searchArray(recentAnnotations, annotations);

    if (candidate >= limit) {
      return result;
    }

    searchArray(annotations);

    return result;
  }

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

  // 新标注任务对话框
  const [isNewAnnotationTaskConfirmationModalShown, setIsNewAnnotationTaskConfirmationModalShown] = useState(false);

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

      raiseToRecentAnnotation(matchedAnnotation);
    }

    setAnnotations(updatedAnnotations);
  }

  // 删除文件
  const handleDeleteFile = (fileId: string, targetType: string) => {
    if (targetType === 'doc') {
      const updatedDocFiles = docFiles.filter(file => file.id !== fileId);
      setDocFiles(updatedDocFiles);

      // 删除标注中该文档的范围
      const updatedAnnotations = annotations.map(annotation => ({
        ...annotation,
        docRanges: annotation.docRanges.filter(range => range.documentId !== fileId),
      }));
      setAnnotations(updatedAnnotations);
    } else if (targetType === 'code') {
      const updatedCodeFiles = codeFiles.filter(file => file.id !== fileId);
      setCodeFiles(updatedCodeFiles);

      // 删除标注中该代码的范围
      const updatedAnnotations = annotations.map(annotation => ({
        ...annotation,
        codeRanges: annotation.codeRanges.filter(range => range.documentId !== fileId),
      }));
      setAnnotations(updatedAnnotations);
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

  const createAnnotation = (options?: Partial<Annotation>) => {
    const newId = generateUUID();
    const newColor = getRandomColor(getExistingColorIterable);
    const newLighterColor = computeLighterColor(newColor);

    const newAnnotation: Annotation = {
      id: newId,
      category: '未命名标注',
      docRanges: [],
      codeRanges: [],
      updateTime: new Date().toISOString(),
      color: newColor,
      lighterColor: newLighterColor,
      ...(options ?? {})
    };

    return newAnnotation;
  }

  const handleCreateAnnotation = async (category?: string) => {
    const newAnnotation = createAnnotation(category ? { category } : undefined);
    const updateAnnotation = [newAnnotation, ...annotations];

    setAnnotations(updateAnnotation);
    setCurrentAnnotation(newAnnotation);

    if (category === undefined) {
      setShouldFocusOnRename(newAnnotation.id);
    }

    raiseToRecentAnnotation(newAnnotation);

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
      const newAnnotation = createAnnotation();

      annotation = newAnnotation;
      _annotations = [newAnnotation, ...annotations];

      setShouldFocusOnRename(newAnnotation.id);
    }

    // 检查是否与当前标注的范围重叠
    const existingRanges = type === 'doc'
      ? annotation.docRanges
      : annotation.codeRanges;

    if (hasOverlappingRange(range, existingRanges)) {
      message.warning('该范围与同一标注范围重叠，请选择其他范围');
      return;
    }

    // // 检查是否与其他标注的范围重叠
    // const hasOverlapWithOther = _annotations.some(a => {
    //   if (a.id === annotation?.id) return false;
    //   const ranges = type === 'doc' ? a.docRanges : a.codeRanges;
    //   return hasOverlappingRange(range, ranges);
    // });

    // if (hasOverlapWithOther) {
    //   message.warning('该范围与其他标注重叠，请选择其他范围');
    //   return;
    // }

    const newAnnotations = _annotations.map(a => {
      if (a.id === annotation?.id) {
        raiseToRecentAnnotation(a);

        return {
          ...a,
          docRanges: type === 'doc'
            ? [...a.docRanges, range]
            : a.docRanges,
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
      docRanges: type === 'doc'
        ? [...annotation.docRanges, range]
        : annotation.docRanges,
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
    const filterAnnotationRanges = (annotation: Annotation) => ({
      ...annotation,
      docRanges: type === 'doc'
        ? annotation.docRanges.filter(r =>
          r.start !== range.start || r.end !== range.end
        )
        : annotation.docRanges,
      codeRanges: type === 'code'
        ? annotation.codeRanges.filter(r =>
          r.start !== range.start || r.end !== range.end
        )
        : annotation.codeRanges,
      updatedAt: new Date().toISOString(),
    });

    const newAnnotations = annotations.map(annotation => {
      if (annotation.id === annotationId) {
        raiseToRecentAnnotation(annotation);

        return filterAnnotationRanges(annotation);
      }
      return annotation;
    });

    let historyCurrentAnnotation = currentAnnotation;
    if (currentAnnotation) {
      const newCurrentAnnotation = newAnnotations.find(a => a.id === currentAnnotation.id) ?? null;
      historyCurrentAnnotation = newCurrentAnnotation;
      setCurrentAnnotation(newCurrentAnnotation);
    }

    setAnnotations(newAnnotations);

    // 添加到历史记录
    addToHistory({
      annotations: newAnnotations,
      currentAnnotation: historyCurrentAnnotation
    });

    message.success('取消标注成功');
  };

  const handleCodeUpload = (result: { id: string; name: string }) => {
    // message.success(`代码 ${result.name} 上传成功`);
  };

  const handleRevealRange = (annotationId: string, rangeType: string, rangeIndex: number) => {
    const annotation = annotations.find(a => a.id === annotationId);
    if (!annotation) {
      return;
    }

    raiseToRecentAnnotation(annotation);

    const ranges = annotation[rangeType === 'code' ? 'codeRanges' : 'docRanges'];
    const range = ranges.at(rangeIndex);
    if (!range) {
      return;
    }

    const files = rangeType === 'code' ? codeFiles : docFiles;
    const file = files.find(file => file.id === range.documentId);
    if (!file) {
      return;
    }

    const panelClassName = `panel-${rangeType === 'code' ? 'code' : 'doc'}`;
    const panelBlock = document.querySelector(`.${panelClassName}`);
    if (!panelBlock) {
      return;
    }

    const revealRange = () => {
      const editorBlock = panelBlock
        .querySelector('.editor-view');
      if (!editorBlock || !(editorBlock instanceof HTMLElement)) {
        return;
      }

      const contentBlock = editorBlock
        .querySelector('.document-block');
      if (!contentBlock || !(contentBlock instanceof HTMLElement)) {
        return;
      }

      let rd = file.renderedDocument!;
      if (!rd) {
        return;
      }

      const htmlRange = rd.getTargetDocumentRange(contentBlock, range.start, range.end);
      if (!htmlRange) {
        return;
      }

      // 添加光效
      if (range.coloredElements) {
        for (const element of range.coloredElements) {
          console.log('color elements', range.coloredElements);
          (element as any).originalBoxShadow = element.style.boxShadow;
          element.style.boxShadow = `0 0 10px ${annotation.color}`;
        }

        const timeout = setTimeout(() => {
          for (const element of range.coloredElements!) {
            element.style.boxShadow = (element as any).originalBoxShadow ?? '';
          }
        }, 2000);
      }

      // 范围居中
      const rangeRect = htmlRange.getBoundingClientRect();
      const blockRect = editorBlock.getBoundingClientRect();
      const scrollTop = editorBlock.scrollTop + rangeRect.top - blockRect.top - editorBlock.clientHeight / 2;

      editorBlock.scrollTo({
        top: scrollTop,
        behavior: 'smooth'
      });
    }

    // 显示文件并在渲染后滚动
    const setFiles = rangeType === 'code' ? setCodeFiles : setDocFiles;
    setFiles(files.map(_file =>
      _file === file ? { ..._file, isNewlySelectedInPanel: true, afterRender: revealRange } : _file // Changed isExpanded to isNewlySelectedInPanel
    ));
  }

  const handleRevealRangeFromAnnotations = (annotationId: string, rangeType: string, rangeIndex: number) => {
    const annotationPanel = document.querySelector('.annotation-panel');
    const annotationItem = annotationPanel?.querySelector(`.annotation-item-${annotationId}`);
    if (annotationItem) {
      setCurrentAnnotation(annotations.find(a => a.id === annotationId) ?? null);
      annotationItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // 加载保存的标注数据
  useEffect(() => {
    if (!isFirstLoaded.current) {
      return;
    }

    const savedAnnotations = localStorage.getItem('annotations');
    if (savedAnnotations) {
      try {
        const parsed = JSON.parse(savedAnnotations);

        // compatible with old documentRanges
        for (const a of parsed) {
          a.docRanges = [...(a.documentRanges ?? []), ...(a.docRanges ?? [])];
        }

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
      const _docFiles = docFiles.map(file => ({ ...file }));
      const _codeFiles = codeFiles.map(file => ({ ...file }));

      removeRenderedInfo(_docFiles);
      removeRenderedInfo(_codeFiles);

      localStorage.setItem('annotationTargetFiles', JSON.stringify({
        docFiles: _docFiles,
        codeFiles: _codeFiles
      }));
    } catch (error) {
      console.error('Failed to save doc and code:', error);
      message.error('自动保存文档和代码失败');
    }
  }, [docFiles, codeFiles]);    // FIXME update too frequent

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

  const handleNewAnnotationTask = () => {
    setIsNewAnnotationTaskConfirmationModalShown(true);
  }

  const clearAnnotationTask = () => {
    setDocFiles([]);
    setCodeFiles([]);
    setAnnotations([]);
    setCurrentAnnotation(null);
  }

  const createNewAnnotationTask = () => {
    clearAnnotationTask();
    message.success('已新建标注任务');
  }

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

        // compatible with old documentRanges
        for (const a of annotations) {
          a.docRanges = [...(a.documentRanges ?? []), ...(a.docRanges ?? [])];
        }

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
            targetType: 'doc',
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
      <Sider width={56} className="toolbar" theme="light">
        <Flex style={{ height: "100%" }} vertical={true} justify='space-between'>
          <Space direction="vertical" size="middle" style={{ width: '100%', padding: '12px 0', alignItems: 'center' }}>
            <Button
              icon={<FileAddOutlined />}
              onClick={handleNewAnnotationTask}
              title="新建标注任务"
            />
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
          <Space direction="vertical" size="middle" style={{ width: '100%', padding: '12px 0', alignItems: 'center' }}>
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
          <AnnotationDocumentPanel
            files={docFiles}
            onSetFiles={setDocFiles}
            handleSearchAnnotations={searchAnnotations}
            targetType='doc'
            targetTypeName='文档'
            onUpload={handleCodeUpload}
            onAddToAnnotation={(range, targetType, annotationId, createNew) => handleAddToAnnotation(range, targetType, annotationId, createNew)}
            onRevealAnnotationRange={handleRevealRangeFromAnnotations}
            onRemoveAnnotationRange={(range, targetType, annotationId) => handleRemoveAnnotationRange(range, targetType, annotationId)}
            onRemoveFile={handleDeleteFile}
            annotations={annotations}
          />
          <AnnotationDocumentPanel
            files={codeFiles}
            onSetFiles={setCodeFiles}
            handleSearchAnnotations={searchAnnotations}
            targetType="code"
            targetTypeName='代码'
            onUpload={handleCodeUpload}
            onAddToAnnotation={(range, targetType, annotationId, createNew) => handleAddToAnnotation(range, targetType, annotationId, createNew)}
            onRevealAnnotationRange={handleRevealRangeFromAnnotations}
            onRemoveAnnotationRange={(range, targetType, annotationId) => handleRemoveAnnotationRange(range, targetType, annotationId)}
            onRemoveFile={handleDeleteFile}
            annotations={annotations}
          />
          <AnnotationPanel
            annotations={annotations}
            currentAnnotation={currentAnnotation}
            onAnnotationCreate={handleCreateAnnotation}
            onAnnotationSelect={(annotation) => { setCurrentAnnotation(annotation); raiseToRecentAnnotation(annotation); }}
            onAnnotationDelete={handleDeleteAnnotation}
            onAnnotationRename={handleRenameAnnotation}
            onAnnotationReveal={handleRevealRange}
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
      <Modal
        title="新建标注任务"
        open={isNewAnnotationTaskConfirmationModalShown}
        okText="保存"
        cancelText="取消"
        onOk={() => {
          setIsNewAnnotationTaskConfirmationModalShown(false);
          handleSaveAnnotations();
          createNewAnnotationTask();
        }}
        onCancel={() => {
          setIsNewAnnotationTaskConfirmationModalShown(false);
        }}
        footer={(_, { OkBtn, CancelBtn }) => (
          <>
            <Button
              onClick={() => {
                setIsNewAnnotationTaskConfirmationModalShown(false);
                createNewAnnotationTask();
              }}
            >
              不保存并继续
            </Button>
            <OkBtn />
          </>
        )}
      >
        <p>将清空所有文件和标注。要保存当前标注任务吗？</p>
      </Modal>
    </Layout>
  );
};

export default App;

function removeRenderedInfo(files: AnnotationDocumentItem[]) {
  for (const f of files) {
    delete f.renderedDocument;
    delete f.isExpanded; // Also remove isExpanded here if it was persisted
    delete f.afterRender; // Ensure afterRender is not persisted
    delete f.isNewlySelectedInPanel; // Ensure isNewlySelectedInPanel is not persisted
  }
}
