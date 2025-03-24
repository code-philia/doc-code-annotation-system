import React, { useState, useRef, useEffect } from 'react';
import { Card, Button, Upload, message, Divider } from 'antd';
import { DownloadOutlined, DownOutlined, RightOutlined, PlusOutlined, CloseOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import classNames from 'classnames';
import Prism from 'prismjs';
import 'prismjs/themes/prism.css';
import { CodeItem, Range, Annotation } from '../types';
import * as api from '../services/api';
import { getCaretCharacterOffsetWithin } from './utils';

interface CodePanelProps {
  className?: string;
  onUpload?: (result: { id: string; name: string }) => void;
  onAddToAnnotation?: (range: Range, annotationId: string, createNew?: boolean) => void;
  onRemoveAnnotationRange?: (range: Range) => void;
  onCreateAnnotation?: () => void;
  annotations: Annotation[];
  currentAnnotation?: Annotation | null;
}

const CodePanel: React.FC<CodePanelProps> = ({
  className,
  onUpload,
  onAddToAnnotation,
  onRemoveAnnotationRange,
  onCreateAnnotation,
  annotations,
  currentAnnotation
}) => {
  const [codeFiles, setCodeFiles] = useState<CodeItem[]>([]);
  const [selectedRange, setSelectedRange] = useState<Range | null>(null);
  const [selectionPosition, setSelectionPosition] = useState<{ top: number; left: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleFileImport = async (file: UploadFile) => {
    try {
      if (!(file instanceof File)) {
        message.error('无效的文件');
        return false;
      }

      // 检查文件大小（例如：限制为10MB）
      if (file.size > 10 * 1024 * 1024) {
        message.error('文件太大，请选择小于10MB的文件');
        return false;
      }

      // 读取文件内容
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsText(file);
      })
        .then((text) => text.replace(/\r\n?/g, '\n'));

      // 上传到服务器
      const result = await api.uploadCode(file);

      // 更新本地状态
      const newFile: CodeItem = {
        id: result.id,
        name: file.name,
        content,
        isExpanded: true,
      };
      setCodeFiles(prev => [...prev, newFile]);
      onUpload?.(result);
      message.success(`成功导入代码：${file.name}`);
    } catch (error) {
      console.error('Failed to upload code:', error);
      message.error('代码导入失败');
    }
    return false;
  };

  const toggleCode = (id: string) => {
    setCodeFiles(files =>
      files.map(file =>
        file.id === id ? { ...file, isExpanded: !file.isExpanded } : file
      )
    );
  };

  const handleCodeSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.toString().trim() === '') {
      setSelectedRange(null);
      setSelectionPosition(null);
      return;
    }

    try {
      const range = selection.getRangeAt(0);
      const content = range.toString().trim();

      // 找到当前选中的代码文件
      const codeElement = range.startContainer.parentElement;
      const codeFileElement = codeElement?.closest('.code-block');
      const fileId = codeElement?.closest('.code-item')?.getAttribute('data-file-id');

      if (!fileId) {
        console.error('Cannot find code file id');
        return;
      }

      if (content && contentRef.current) {
        // 获取选区的位置
        const rect = range.getBoundingClientRect();

        // 计算工具栏位置，确保在视口内
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const toolbarHeight = 48;
        const toolbarWidth = 400;

        // 计算初始位置（在选区上方）
        let top = rect.top - toolbarHeight - 10;
        let left = rect.left;

        // 如果上方空间不足，则显示在选区下方
        if (top < 10) {
          top = rect.bottom + 10;
        }

        // 确保不超出右边界
        if (left + toolbarWidth > viewportWidth - 10) {
          left = viewportWidth - toolbarWidth - 10;
        }

        // 确保不超出左边界
        if (left < 10) {
          left = 10;
        }

        // 确保不超出底部边界
        if (top + toolbarHeight > viewportHeight - 10) {
          top = viewportHeight - toolbarHeight - 10;
        }

        // 设置位置
        setSelectionPosition({ top, left });

        const selectedText = range.toString();
        const start = getCaretCharacterOffsetWithin(codeFileElement!) ?? 0;
        const end = start + selectedText.length;

        setSelectedRange({
          start,
          end,
          content: selectedText,
          documentId: fileId
        });
      }
    } catch (error) {
      console.error('Selection error:', error);
      setSelectedRange(null);
      setSelectionPosition(null);
    }
  };

  const handleMouseDown = () => {
    // 在开始新的选择时，清除之前的选择状态
    setSelectedRange(null);
    setSelectionPosition(null);
  };

  const handleAddToAnnotation = (annotationId: string, createNew = false) => {
    if (!selectedRange) {
      message.warning('请先选择要标注的代码');
      return;
    }
    onAddToAnnotation?.({
      start: selectedRange.start,
      end: selectedRange.end,
      content: selectedRange.content,
      documentId: selectedRange.documentId
    }, annotationId, createNew);
    setSelectedRange(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleCreateAndApplyAnnotation = async (annotationId: string) => {
    if (!selectedRange) {
      message.warning('请先选择要标注的代码');
      return;
    }
    try {
      // const newAnnotationId = await onCreateAnnotation?.();
      // if (!newAnnotationId) {
      //   message.error('创建标注失败');
      //   return;
      // }
      handleAddToAnnotation(annotationId, true);
    } catch (error) {
      console.error('Failed to create annotation:', error);
      message.error('创建标注失败');
    }
  };

  const handleCancelSelection = () => {
    setSelectedRange(null);
    setSelectionPosition(null);
    window.getSelection()?.removeAllRanges();
  };

  // 渲染代码内容，包括高亮
  const renderCodeContent = (fileId: string, content: string, codeRanges: Range[]) => {
    // 只显示属于当前文件的标注
    const currentFileRanges = codeRanges.filter(range => range.documentId === fileId);

    if (!currentFileRanges.length) {
      return <code className="language-python">{content}</code>;
    }

    let lastIndex = 0;
    const parts: JSX.Element[] = [];

    // 按照范围的起始位置排序
    const sortedRanges = [...currentFileRanges].sort((a, b) => a.start - b.start);

    sortedRanges.forEach((range, index) => {
      // 添加未高亮的代码
      if (range.start > lastIndex) {
        parts.push(
          <code key={`code-${index}`} className="language-python">
            {content.slice(lastIndex, range.start)}
          </code>
        );
      }

      // 添加高亮的代码，支持点击取消标注
      parts.push(
        <code
          key={`highlight-${index}`}
          className="language-python highlighted-code"
          onClick={() => onRemoveAnnotationRange?.(range)}
          title="点击取消标注"
          style={{ cursor: 'pointer' }}
        >
          {content.slice(range.start, range.end)}
        </code>
      );

      lastIndex = range.end;
    });

    // 添加剩余的未高亮代码
    if (lastIndex < content.length) {
      parts.push(
        <code key="code-last" className="language-python">
          {content.slice(lastIndex)}
        </code>
      );
    }

    return parts;
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contentRef.current && !contentRef.current.contains(event.target as Node)) {
        setSelectedRange(null);
        setSelectionPosition(null);
        // 清除文本选择
        window.getSelection()?.removeAllRanges();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    // 高亮代码
    if (contentRef.current) {
      Prism.highlightAllUnder(contentRef.current);
    }
  }, [codeFiles, annotations]); // 当标注改变时也需要重新高亮

  return (
    <Card
      title="代码"
      extra={
        <Upload
          accept=".py,.js,.ts,.jsx,.tsx,.java,.cpp,.c,.h,.hpp,.cs,.go,.rb,.php"
          beforeUpload={handleFileImport}
          showUploadList={false}
        >
          <Button icon={<DownloadOutlined />}>导入</Button>
        </Upload>
      }
      className={classNames('panel', className)}
    >
      <div className="panel-content" ref={contentRef}>
        {codeFiles.map(file => (
          <div key={file.id} className="code-item" data-file-id={file.id}>
            <Button
              type="text"
              icon={file.isExpanded ? <DownOutlined /> : <RightOutlined />}
              onClick={() => toggleCode(file.id)}
              block
              className="code-header"
            >
              {file.name}
            </Button>
            {file.isExpanded && (
              <div
                className="code-content"
                onMouseDown={handleMouseDown}
                onMouseUp={handleCodeSelection}
              >
                <pre className="code-block">
                  {renderCodeContent(
                    file.id,
                    file.content,
                    annotations.flatMap(a => a.codeRanges)
                  )}
                </pre>
              </div>
            )}
          </div>
        ))}
        {selectedRange && selectionPosition && (
          <div
            className="floating-toolbar"
            style={{
              top: `${selectionPosition.top}px`,
              left: `${selectionPosition.left}px`,
            }}
          >
            {annotations.map((annotation) => (
              <Button
                key={annotation.id}
                size="small"
                type={annotation.id === currentAnnotation?.id ? "primary" : "default"}
                onClick={() => handleAddToAnnotation(annotation.id)}
              >
                {annotation.category}
              </Button>
            ))}
            <Button
              size="small"
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => { handleCreateAndApplyAnnotation('code'); }}
            >
              新建标注
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
};

export default CodePanel;
