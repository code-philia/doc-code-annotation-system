import React, { useState, useRef, useEffect, MouseEventHandler } from 'react';
import { Card, Button, Upload, Modal, message } from 'antd';
import { DownloadOutlined, CaretDownOutlined, CaretRightOutlined, PlusOutlined, DeleteFilled } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import classNames from 'classnames';
import Prism from 'prismjs';
import 'prismjs/themes/prism.css';
import jschardet from 'jschardet';

import * as api from '../services/api';
import { AnnotationDocumentItem, DocumentRange, Annotation } from '../types';
import { ColorSetUp, computeLighterColor, RenderedDocument } from './utils';

interface BaseAnnotationContentPanelProps {
  files: AnnotationDocumentItem[];
  targetType: string;
  targetTypeName: string;
  annotations: Annotation[];
  onSetFiles: (files: AnnotationDocumentItem[]) => void;
  onUpload?: (result: { id: string; name: string }) => void;
  onAddToAnnotation?: (range: DocumentRange, targetType: string, annotationId?: string, createNew?: boolean) => void;
  onRemoveAnnotationRange?: (range: DocumentRange, targetType: string, annotationId: string) => void;
  onRemoveFile?: (fileId: string, targetType: string) => void;
}

const BaseAnnotationDocumentPanel: React.FC<BaseAnnotationContentPanelProps> = ({
  files,
  targetType,
  targetTypeName,
  annotations,
  onSetFiles,
  onUpload,
  onAddToAnnotation,
  onRemoveAnnotationRange,
  onRemoveFile
}) => {
  const [selectedRange, setSelectedRange] = useState<DocumentRange | null>(null);
  const [selectionPosition, setSelectionPosition] = useState<{ top: number; left: number } | null>(null);

  const contentRef = useRef<HTMLDivElement | null>(null);
  const cachedSelectedRange = useRef<Range | null>(null);

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

      let content: string | undefined = '';
      const contentBytesBuffer = Buffer.from(contentBytes);

      if (['.doc', '.docx'].some(suffix => file.name.endsWith(suffix))) {
        if (window.localFunctionality) {    // this is only present in electron build
          content = await window.localFunctionality.wordDocumentResolve(new Uint8Array(contentBytesBuffer).buffer);

          if (content === undefined) {
            throw new Error('Failed to upload file to the server');
          }
        } else {
          // console.log(`The build is not electron. Reading response from port 5050.`);
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
        }
      } else {
        const encoding = jschardet.detect(contentBytesBuffer).encoding ?? 'GB18030';  // 难以检测，所以默认为 GB18030，见 https://github.com/aadsm/jschardet/issues/49
        content = new TextDecoder(encoding).decode(contentBytesBuffer);
      }

      // 上传到服务器
      const result = await api.uploadCode(file);

      // 更新本地状态
      const newFile: AnnotationDocumentItem = {
        id: file.url ?? `url-unknown-file-${result.id}`,
        name: file.name,
        content: content.replace(/\r?\n|\r/g, '\n'),
        isExpanded: true,
      };

      // Electron imported path
      const localPath: string = (file as any).path;
      if (localPath) {
        newFile.localPath = localPath;
      }

      onSetFiles([...files, newFile]);
      onUpload?.(result);
      message.success(`成功导入${targetTypeName}：${file.name}`);
    } catch (error) {
      console.error('Failed to upload code:', error);
      message.error(`${targetTypeName}导入失败`);
    }
    return false;
  };

  const toggleExpansion = (id: string) => {
    onSetFiles(
      files.map(file =>
        file.id === id ? { ...file, isExpanded: !file.isExpanded } : file
      )
    );
  };

  const handleCodeSelection = async () => {
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
      const codeFileElement = codeElement?.closest('.document-block');
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

        // 设置悬浮位置
        setSelectionPosition({ top, left });

        const targetFile = files.find(f => f.id === fileId);
        if (!targetFile) {
          return;
        }
        if (!(targetFile.renderedDocument)) {
          targetFile.renderedDocument = new RenderedDocument(targetFile.content, targetType === 'code' ? 'code' : 'markdown');
        }

        const f = targetFile.content;
        const r = targetFile.renderedDocument;

        const selectedPre = codeFileElement;
        if (selectedPre && selectedPre instanceof HTMLElement) {
          const [start, end] = r.getSourceDocumentRange(selectedPre, range);
          if (end - start > 0) {
            cachedSelectedRange.current = range;

            setSelectedRange({
              start: start,
              end: end,
              content: f.slice(start, end),
              documentId: fileId
            });
          }
        }
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
  useEffect(() => {
    if (!(contentRef.current)) {
      return;
    }

    const targetRangesType = targetType === 'code' ? 'codeRanges' : 'docRanges';

    for (const codeItem of contentRef.current.querySelectorAll('.code-item')) {
      const documentId = codeItem.getAttribute('data-file-id');
      const documentBlock = codeItem.querySelector('.document-block');
      if (documentId === null || documentBlock === null || !(documentBlock instanceof HTMLElement)) {
        continue;
      }

      const targetFile = files.find(f => f.id === documentId);
      if (!targetFile) {
        return;
      }

      (async () => {
        if (!(targetFile.renderedDocument)) {
          targetFile.renderedDocument = new RenderedDocument(targetFile.content, targetType === 'code' ? 'code' : 'markdown');  // FIXME Same logic as above
        }

        const r = targetFile.renderedDocument;
        documentBlock.innerHTML = await r.render();

        // calculate ranges
        const coloredRanges: ColorSetUp[] = annotations
          .map(a => {
            const rangesInDocument = a[targetRangesType].filter(r => r.documentId === documentId)
            if (rangesInDocument.length === 0) {
              return undefined;
            }
            return {
              id: a.id,
              originalAnnotation: a,
              color: a.color ?? '#000000',
              lighterColor: a.lighterColor ?? 'rgba(103, 103, 103, 0.1)',
              ranges: a[targetRangesType]
                .filter(r => r.documentId === documentId),
              handleClick: (e: MouseEvent, range: DocumentRange) => onRemoveAnnotationRange?.(range, targetType, a.id)
            }
          })
          .flatMap(a =>       // each click event should cancel one colored range only, so flat them
            a === undefined
              ? []
              : a.ranges.map(r => ({
                ...a,
                ranges: [r]
              }))
          )
          .filter(x => x !== undefined);

        r.colorAll(documentBlock, coloredRanges);

        if (cachedSelectedRange.current) {
          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(cachedSelectedRange.current);
          }

          cachedSelectedRange.current = null;
        }
      })().then(() => {
        if (targetFile.afterRender) {
          targetFile.afterRender();
          targetFile.afterRender = undefined;
        }
      })
    }
  }, [files, annotations]);

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
      className={classNames('panel', `panel-${targetType}`)}
    >
      <div className="panel-content" ref={contentRef}>
        {files.map(file => (
          <BaseAnnotationDocumentBlock
            key={file.id}
            file={file}
            targetType={targetType}
            toggleExpansion={toggleExpansion}
            onDeleteFile={handleDeleteFile}
            onContentMouseDown={handleMouseDown}
            onContentMouseUp={handleCodeSelection}
          />
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

interface BaseAnnotationDocumentBlockProps {
  file: AnnotationDocumentItem;
  targetType: string;
  toggleExpansion: (fileId: string) => void;
  onDeleteFile: (fileId: string) => void;
  onContentMouseDown: MouseEventHandler<HTMLDivElement>;
  onContentMouseUp: MouseEventHandler<HTMLDivElement>;
}

const BaseAnnotationDocumentBlock = ({
  file,
  targetType,
  toggleExpansion,
  onDeleteFile,
  onContentMouseDown,
  onContentMouseUp
}: BaseAnnotationDocumentBlockProps) => {
  return (<div key={file.id} className="code-item" data-file-id={file.id}>
    <Button
      type="text"
      onClick={() => toggleExpansion(file.id)}
      onMouseOver={(e) => e.currentTarget.querySelector('.delete-icon')?.classList.add('show')}
      onMouseLeave={(e) => e.currentTarget.querySelector('.delete-icon')?.classList.remove('show')}
      block
      className="document-header"
      title={file.name}
    >
      {file.isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
      <div className='file-label'>
        <div className='file-name'>{file.name}</div>
        {file.localPath && <div className='file-path' title={file.localPath}>{file.localPath}</div>}
      </div>

      <DeleteFilled
        className='delete-icon'
        onClick={(e) => {
          onDeleteFile(file.id);
          e.stopPropagation();
        }}
      />
    </Button>
    {file.isExpanded && (
      <div
        className="document-content"
        onMouseDown={onContentMouseDown}
        onMouseUp={onContentMouseUp}
      >
        {
          targetType === 'code'
            ?
            (<pre
              className="document-block document-block"
            />)
            :
            (<div
              className="document-block doc-block"
            />)
        }
      </div>
    )}
  </div>)
}

export default BaseAnnotationDocumentPanel;
