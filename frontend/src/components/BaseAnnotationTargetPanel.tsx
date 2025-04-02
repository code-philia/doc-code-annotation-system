import React, { useState, useRef, useEffect } from 'react';
import { Card, Button, Upload, message } from 'antd';
import { DownloadOutlined, CaretDownOutlined, CaretRightOutlined, PlusOutlined, DeleteFilled } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import classNames from 'classnames';
import Prism from 'prismjs';
import 'prismjs/themes/prism.css';
import { CodeItem, Range, Annotation } from '../types';
import * as api from '../services/api';
import { computeLighterColor, getCaretCharacterOffsetWithin } from './utils';
import jschardet from 'jschardet';
import { Modal } from 'antd';

interface BaseAnnotationTargetPanelPanelProps {
  files: CodeItem[];
  onSetFiles: (files: CodeItem[]) => void;
  targetType: string;
  targetTypeName: string;
  className?: string;
  onUpload?: (result: { id: string; name: string }) => void;
  onAddToAnnotation?: (range: Range, targetType: string, annotationId?: string, createNew?: boolean) => void;
  onRemoveAnnotationRange?: (range: Range, targetType: string, annotationId: string) => void;
  onRemoveFile?: (fileId: string, targetType: string) => void;
  annotations: Annotation[];
  cssOnPre?: React.CSSProperties;
}

const BaseAnnotationTargetPanelPanel: React.FC<BaseAnnotationTargetPanelPanelProps> = ({
  files,
  onSetFiles,
  targetType,
  targetTypeName,
  className,
  onUpload,
  onAddToAnnotation,
  onRemoveAnnotationRange,
  onRemoveFile,
  annotations,
  cssOnPre
}) => {
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
      const contentBytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
        reader.onerror = () => reject(new Error('文件读取失败'));

        reader.readAsArrayBuffer(file);
      });

      let content = '';
      const contentBytesBuffer = Buffer.from(contentBytes);

      if (['.doc', '.docx'].some(suffix => file.name.endsWith(suffix))) {
        const response = await fetch('http://localhost:5050/word-resolve', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream'
          },
          body: contentBytesBuffer,
        });

        if (!response.ok) {
          throw new Error('Failed to upload file to the server');
        }

        content = await response.text();
      } else {
        const encoding = jschardet.detect(contentBytesBuffer).encoding ?? 'GB18030';  // 难以检测，所以默认为 GB18030，见 https://github.com/aadsm/jschardet/issues/49
        content = new TextDecoder(encoding).decode(contentBytesBuffer);
      }

      // 上传到服务器
      const result = await api.uploadCode(file);

      // 更新本地状态
      const newFile: CodeItem = {
        id: file.url ?? `url-unknown-file-${result.id}`,
        name: file.name,
        content,
        isExpanded: true,
      };
      onSetFiles([...files, newFile]);
      onUpload?.(result);
      message.success(`成功导入${targetTypeName}：${file.name}`);
    } catch (error) {
      console.error('Failed to upload code:', error);
      message.error(`${targetTypeName}导入失败`);
    }
    return false;
  };

  const toggleCode = (id: string) => {
    onSetFiles(
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

      // 找到当前选中的文件
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

  const handleAddToAnnotation = (annotationId?: string, createNew = false) => {
    if (!selectedRange) {
      message.warning(`请先选择要标注的${targetTypeName}`);
      return;
    }
    onAddToAnnotation?.({
      start: selectedRange.start,
      end: selectedRange.end,
      content: selectedRange.content,
      documentId: selectedRange.documentId
    }, targetType, annotationId, createNew);
    setSelectedRange(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleCreateAndApplyAnnotation = async () => {
    if (!selectedRange) {
      message.warning(`请先选择要标注的${targetTypeName}`);
      return;
    }
    try {
      // const newAnnotationId = await onCreateAnnotation?.();
      // if (!newAnnotationId) {
      //   message.error('创建标注失败');
      //   return;
      // }
      handleAddToAnnotation(undefined, true);
    } catch (error) {
      console.error('Failed to create annotation:', error);
      message.error('创建标注失败');
    }
  };

  const handleDeleteFile = (fileId: string) => {
    // 使用 antd 的 Modal.confirm

    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该文件吗？',
      okText: '确认',
      cancelText: '取消',
      onOk: () => {
        onRemoveFile?.(fileId, targetType);
      },
    });
  };

  const handleCancelSelection = () => {
    setSelectedRange(null);
    setSelectionPosition(null);
    window.getSelection()?.removeAllRanges();
  };

  // 渲染内容，包括高亮
  const renderCodeContent = (fileId: string, content: string, annotations: Annotation[]) => {
    const inCodeAnnotations: Annotation[] = [];
    annotations.forEach(a => {
      // FIXME bad way to discriminate codeRanges and documentRanges
      const inCodeRanges: Range[] = (targetType === 'code' ? a.codeRanges : a.documentRanges).filter(r => r.documentId === fileId);
      if (inCodeRanges.length > 0) {
        inCodeAnnotations.push({
          ...a,
          [(targetType === 'code' ? 'codeRange' : 'documentRanges')]: inCodeRanges
        })
      }
    });

    if (inCodeAnnotations.length === 0) return content;

    let lastIndex = 0;
    const parts: JSX.Element[] = [];

    type tempRangeInfo = {
      key: string,
      annotationId: string,
      color: string,
      lighterColor: string,
      range: Range
    };
    let sortedRangeInfo: tempRangeInfo[] = inCodeAnnotations.flatMap(a => {
      return (targetType === 'code' ? a.codeRanges : a.documentRanges).map((r, i): tempRangeInfo => ({
        key: `${a.id}-${i}`,
        annotationId: a.id,
        color: a.color ?? '#000000',
        lighterColor: a.lighterColor ?? 'rgba(103, 103, 103, 0.1)',
        range: r
      }));
    });
    sortedRangeInfo.sort((a, b) => a.range.start - b.range.start);

    sortedRangeInfo.forEach((rangeInfo, index) => {
      // 添加未高亮的内容
      if (rangeInfo.range.start > lastIndex) {
        parts.push(
          <code className="language-python">
            {content.slice(lastIndex, rangeInfo.range.start)}
          </code>
        );
      }

      // 添加高亮的内容，支持点击取消标注
      parts.push(
        <code
          id={`highlight-${Date.now()}-${rangeInfo.annotationId}-${index}`}
          className="language-python highlighted-code"
          onClick={() => onRemoveAnnotationRange?.(rangeInfo.range, targetType, rangeInfo.annotationId)}
          title="点击取消标注"
          style={{
            cursor: 'pointer',
            backgroundColor: rangeInfo.lighterColor,
            borderBottom: `2px solid ${rangeInfo.color}`,
            backgroundClip: "border-box"
          }}
        >
          {content.slice(rangeInfo.range.start, rangeInfo.range.end)}
        </code>
      );

      lastIndex = rangeInfo.range.end;
    });

    // 添加剩余的未高亮内容
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
    // 高亮内容
    if (contentRef.current) {
      Prism.highlightAllUnder(contentRef.current);
    }
  }, [files, annotations]); // 当标注改变时也需要重新高亮

  return (
    <Card
      title={targetTypeName}
      extra={
        <Upload
          beforeUpload={handleFileImport}
          showUploadList={false}
        >
          <Button icon={<DownloadOutlined />}>导入</Button>
        </Upload>
      }
      className={classNames('panel', className)}
    >
      <div className="panel-content" ref={contentRef}>
        {files.map(file => (
          <div key={file.id} className="code-item" data-file-id={file.id}>
            <Button
              type="text"
              onClick={() => toggleCode(file.id)}
              onMouseOver={(e) => e.currentTarget.querySelector('.delete-icon')?.classList.add('show')}
              onMouseLeave={(e) => e.currentTarget.querySelector('.delete-icon')?.classList.remove('show')}
              block
              className="code-header"
              title={file.name}
            >
              {file.isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis " [..]"' }}>{file.name}</span>
              <DeleteFilled
                className='delete-icon'
                onClick={(e) => {
                  handleDeleteFile(file.id);
                  e.stopPropagation();
                }}
              />
            </Button>
            {file.isExpanded && (
              <div
                className="code-content"
                onMouseDown={handleMouseDown}
                onMouseUp={handleCodeSelection}
              >
                <pre
                  className={"code-block" + (cssOnPre ? ' doc-block' : '')}
                >
                  {renderCodeContent(
                    file.id,
                    file.content,
                    annotations
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
                type="default"
                onClick={() => handleAddToAnnotation(annotation.id)}
                style={{
                  color: annotation.color ?? '#000000',
                  outlineColor: annotation.color ?? '#000000',
                  border: 'none',
                  backgroundColor: annotation.color ? computeLighterColor(annotation.color) : computeLighterColor('#000000'),
                  outlineStyle: 'solid'
                }}
              >
                {annotation.category}
              </Button>
            ))}
            <Button
              size="small"
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => { handleCreateAndApplyAnnotation(); }}
            >
              新建标注
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
};

export default BaseAnnotationTargetPanelPanel;
