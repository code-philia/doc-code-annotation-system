import React, { useState, useRef, useEffect } from 'react';
import { Card, Button, Upload, message, Divider } from 'antd';
import { DownloadOutlined, DownOutlined, RightOutlined, PlusOutlined, CloseOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import classNames from 'classnames';
import { DocumentationItem, Range, Annotation } from '../types';
import * as api from '../services/api';
import { getCaretCharacterOffsetWithin } from './utils';

interface DocumentationPanelProps {
  className?: string;
  onUpload?: (result: { id: string; name: string }) => void;
  onAddToAnnotation?: (range: Range, annotationId: string, createNew?: boolean) => void;
  onRemoveAnnotationRange?: (range: Range) => void;
  onCreateAnnotation?: () => void;
  annotations: Annotation[];
  currentAnnotation?: Annotation | null;
}

const DocumentationPanel: React.FC<DocumentationPanelProps> = ({
  className,
  onUpload,
  onAddToAnnotation,
  onRemoveAnnotationRange,
  onCreateAnnotation,
  annotations,
  currentAnnotation
}) => {
  const [documents, setDocuments] = useState<DocumentationItem[]>([]);
  const [selectedRange, setSelectedRange] = useState<Range | null>(null);
  const [toolbarPosition, setToolbarPosition] = useState<{ top: number; left: number } | null>(null);
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
      const result = await api.uploadDocument(file);

      // 更新本地状态
      const newDoc: DocumentationItem = {
        id: file.url ?? `url-unknown-file-${result.id}`,
        name: file.name,
        content,
        isExpanded: true,
      };
      setDocuments(prev => [...prev, newDoc]);
      onUpload?.(result);
      message.success(`成功导入文档：${file.name}`);
    } catch (error) {
      console.error('Failed to upload document:', error);
      message.error('文档导入失败');
    }
    return false;
  };

  const toggleDocument = (id: string) => {
    setDocuments(docs =>
      docs.map(doc =>
        doc.id === id ? { ...doc, isExpanded: !doc.isExpanded } : doc
      )
    );
  };

  const handleTextSelection = (documentId: string) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setSelectedRange(null);
      setToolbarPosition(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // 计算工具栏位置，确保不会超出视口
    const toolbarTop = rect.top - 40; // 工具栏高度 + 间距
    const toolbarLeft = rect.left + (rect.width / 2);

    setToolbarPosition({
      top: Math.max(0, toolbarTop),
      left: Math.max(0, toolbarLeft)
    });


    const documentElement = range.startContainer.parentElement;
    const documentFileElement = documentElement?.closest('.document-content');

    const selectedText = range.toString();
    const start = getCaretCharacterOffsetWithin(documentFileElement!) ?? 0;
    const end = start + selectedText.length;

    setSelectedRange({
      start,
      end,
      content: range.toString(),
      documentId
    });
  };

  const handleMouseDown = () => {
    // 在开始新的选择时，清除之前的选择状态
    setSelectedRange(null);
    setToolbarPosition(null);
  };

  const handleAddToAnnotation = (annotationId: string, createNew = false) => {
    if (!selectedRange) {
      message.warning('请先选择要标注的文本');
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
      message.warning('请先选择要标注的文本');
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
    setToolbarPosition(null);
    window.getSelection()?.removeAllRanges();
  };

  // 渲染文档内容，包括高亮
  const renderDocumentationContent = (documentId: string, content: string, annotations: Annotation[]) => {
    const inDocumentationAnnotations: Annotation[] = [];
    annotations.forEach(a => {
      const inDocumentationRanges: Range[] = a.documentRanges.filter(r => r.documentId === documentId);
      if (inDocumentationRanges.length > 0) {
        inDocumentationAnnotations.push({
          ...a,
          codeRanges: inDocumentationRanges
        })
      }
    });

    if (inDocumentationAnnotations.length === 0) return content;

    let lastIndex = 0;
    const parts: JSX.Element[] = [];

    type tempRangeInfo = {
      key: string,
      annotationId: string,
      color: string,
      lighterColor: string,
      range: Range
    };
    let sortedRangeInfo: tempRangeInfo[] = inDocumentationAnnotations.flatMap(a => {
      return a.codeRanges.map((r, i): tempRangeInfo => ({
        key: `${a.id}-${i}`,
        annotationId: a.id,
        color: a.color ?? '#000000',
        lighterColor: a.lighterColor ?? 'rgba(103, 103, 103, 0.1)',
        range: r
      }));
    });
    sortedRangeInfo.sort((a, b) => a.range.start - b.range.start);

    sortedRangeInfo.forEach((rangeInfo, index) => {
      // 添加未高亮的文本
      if (rangeInfo.range.start > lastIndex) {
        parts.push(
          <span key={`text-${index}`}>
            {content.slice(lastIndex, rangeInfo.range.start)}
          </span>
        );
      }

      // 添加高亮的文本，支持点击取消标注
      parts.push(
        <span
          key={`highlight-${rangeInfo.key}`}
          className="highlighted-text"
          onClick={() => onRemoveAnnotationRange?.(rangeInfo.range)}
          title="点击取消标注"
          style={{
            cursor: 'pointer',
            backgroundColor: rangeInfo.lighterColor,
            borderBottom: `2px solid ${rangeInfo.color}`
          }}
        >
          {content.slice(rangeInfo.range.start, rangeInfo.range.end)}
        </span>
      );

      lastIndex = rangeInfo.range.end;
    });

    // 添加剩余的未高亮文本
    if (lastIndex < content.length) {
      parts.push(
        <span key="text-last">
          {content.slice(lastIndex)}
        </span>
      );
    }

    return parts;
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contentRef.current && !contentRef.current.contains(event.target as Node)) {
        setSelectedRange(null);
        setToolbarPosition(null);
        // 清除文本选择
        window.getSelection()?.removeAllRanges();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <Card
      title="文档"
      extra={
        <Upload
          accept=".txt,.md,.json,.py,.js,.ts,.html,.css"
          beforeUpload={handleFileImport}
          showUploadList={false}
        >
          <Button icon={<DownloadOutlined />}>导入</Button>
        </Upload>
      }
      className={classNames('panel', className)}
    >
      <div className="panel-content" ref={contentRef}>
        {documents.map(doc => (
          <div key={doc.id} className="document-item">
            <Button
              type="text"
              icon={doc.isExpanded ? <DownOutlined /> : <RightOutlined />}
              onClick={() => toggleDocument(doc.id)}
              block
              className="document-header"
            >
              {doc.name}
            </Button>
            {doc.isExpanded && (
              <div
                className="document-content"
                onMouseDown={handleMouseDown}
                onMouseUp={() => handleTextSelection(doc.id)}
              >
                {renderDocumentationContent(
                  doc.id,
                  doc.content,
                  annotations
                )}
              </div>
            )}
          </div>
        ))}
        {selectedRange && toolbarPosition && (
          <div
            className="floating-toolbar"
            style={{
              top: toolbarPosition.top,
              left: toolbarPosition.left,
              transform: 'translateX(-50%)'
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
            {/* <Button
              size="small"
              type="text"
              icon={<CloseOutlined />}
              onClick={handleCancelSelection}
            >
              取消
            </Button> */}
          </div>
        )}
      </div>
    </Card>
  );
};

export default DocumentationPanel;
