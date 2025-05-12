import React, { useEffect, useState } from 'react';
import { Card, Button, Input, List, Modal, Form, message, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import classNames from 'classnames';
import { Annotation } from '../types';
import { computeLighterColor } from './utils';
import { useCrossViewStateStore } from 'crossViewState';

interface AnnotationItemProps {
  annotation: Annotation;
  selected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onChangeName: (name: string) => void;
  onReveal: (rangeType: string, rangeIndex: number) => void;
}

interface AnnotationPanelProps {
  className?: string;
  annotations: Annotation[];
  currentAnnotation?: Annotation | null;
  onAnnotationCreate?: (category?: string) => void;
  onAnnotationSelect?: (annotation: Annotation) => void;
  onAnnotationDelete?: (annotationId: string) => void;
  onAnnotationRename?: (annotationId: string, annotationName: string) => void;
  onAnnotationReveal?: (annotationId: string, rangeType: string, rangeIndex: number) => void;
}

const AnnotationItem = ({
  annotation,
  selected,
  onClick,
  onDelete,
  onChangeName,
  onReveal
}: AnnotationItemProps) => {
  const [isNameBeingEdited, setIsNameBeingEdited] = useState(false);
  const shouldFocusOnRenameId = useCrossViewStateStore((state) => state.shouldFocusOnRenameId);
  const setShouldFocusOnRenameId = useCrossViewStateStore((state) => state.setShouldFocusOnRenameId);

  const handleDelete = (e?: React.MouseEvent<HTMLElement, MouseEvent> | undefined) => {
    if (e) {
      e.stopPropagation();
      onDelete();
    }
  };

  useEffect(() => {
    if (selected && shouldFocusOnRenameId === annotation.id) {
      setIsNameBeingEdited(true);
      setShouldFocusOnRenameId(undefined);
    }
  }, [selected, shouldFocusOnRenameId])

  return (
    <div
      className={`annotation-item ${selected ? 'selected' : ''}`}
      onClick={onClick}
      style={{
        outlineColor: annotation.color ?? '#000000',
        backgroundColor: annotation.color ? computeLighterColor(annotation.color) : computeLighterColor('#000000'),
        outlineWidth: selected ? '2px' : '1px',
        outlineStyle: 'solid'
      }}
    >
      <div className="annotation-header">
        {
          isNameBeingEdited
            ? (
              <input
                className="category"
                title={annotation.category}
                style={{
                  color: annotation.color ?? '#000000'
                }}
                value={annotation.category}
                onBlur={() => setIsNameBeingEdited(false)}
                onChange={(e) => onChangeName(e.target.value)}
                onFocus={(e) => {
                  e.target.select();
                  e.target.scrollLeft = 0;
                  e.target.scrollIntoView({ block: 'nearest' });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                autoFocus
              />
            )
            : (
              <div
                className="category"
                onClick={() => setIsNameBeingEdited(!isNameBeingEdited)}
                title={annotation.category}
                style={{
                  color: annotation.color ?? '#000000'
                }}
              >
                {annotation.category}
              </div>
            )
        }
        <div className="stats">
          <div className="stat-tag">文档片段: {annotation.docRanges.length}</div>
          <div className="stat-tag">代码片段: {annotation.codeRanges.length}</div>
        </div>
      </div>
      {(annotation.docRanges.length > 0 || annotation.codeRanges.length > 0) && (
        <div className="range-preview">
          {annotation.docRanges.map((range, index) => (
            <div key={`doc-${index}`} className="preview-content"
            onClick={() => onReveal('doc', index)}>
              {range.content.replace(/!\[.*?\]\((.*?)\)/g, `![image](data:image/png;base64)`)}
            </div>
          ))}
          {annotation.codeRanges.map((range, index) => (
            <div key={`code-${index}`} className="preview-content"
            onClick={() => onReveal('code', index)}>
              {range.content}
            </div>
          ))}
        </div>
      )}
      <div className="update-time">
        更新于 {new Date(annotation.updateTime).toLocaleString()}
        <div className="actions">
          <Popconfirm
            title="确定要删除这个标注吗？"
            description="使用 Ctrl+Z 撤销刚刚删除的标注"
            onConfirm={handleDelete}
            okText="确定"
            cancelText="取消"
            placement="topRight"
          >
            <Button
              type="text"
              className="delete-btn"
              onClick={(e) => e.stopPropagation()}
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </div>
      </div>
    </div>
  );
};

const AnnotationPanel: React.FC<AnnotationPanelProps> = ({
  className,
  annotations = [],
  currentAnnotation,
  onAnnotationCreate,
  onAnnotationSelect,
  onAnnotationDelete,
  onAnnotationRename,
  onAnnotationReveal
}) => {
  return (
    <Card
      title="标注"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => onAnnotationCreate?.()}
        >
        </Button>
      }
      className={classNames('panel', className)}
    >
      <div className="panel-content">
        <List
          dataSource={annotations}
          renderItem={(annotation) => (
            <List.Item>
              <AnnotationItem
                annotation={annotation}
                selected={currentAnnotation?.id === annotation.id}
                onClick={() => onAnnotationSelect?.(annotation)}
                onDelete={() => onAnnotationDelete?.(annotation.id)}
                onChangeName={(name) => onAnnotationRename?.(annotation.id, name)}
                onReveal={(rangeType, rangeIndex) => onAnnotationReveal?.(annotation.id, rangeType, rangeIndex)}
              />
            </List.Item>
          )}
        />
      </div>
    </Card>
  );
};

export default AnnotationPanel;

function limitNameLength(name: string, limit: number = 7) {
  const textEncoder = new TextEncoder();
  const utf8Bytes = textEncoder.encode(name)

  if (utf8Bytes.length <= limit) {
    return name;
  }

  const textDecoder = new TextDecoder();
  return textDecoder.decode(utf8Bytes).slice(0, limit - 2) + '...';
}
