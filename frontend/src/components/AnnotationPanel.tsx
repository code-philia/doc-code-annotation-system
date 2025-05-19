import React, { useEffect, useState } from 'react';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, List, Popconfirm } from 'antd';
import classNames from 'classnames';
import { useCrossViewStateStore } from 'state';

import { Annotation } from '../types';
import { computeLighterColor } from '../utils';

interface AnnotationItemProps {
  className?: string;
  annotation: Annotation;
  selected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onChangeName: (name: string) => void;
  onReveal: (rangeType: string, rangeIndex: number) => void;
}

const AnnotationItem = (props: AnnotationItemProps) => {
  const [isNameBeingEdited, setIsNameBeingEdited] = useState(false);
  const shouldFocusOnRenameId = useCrossViewStateStore((state) => state.shouldFocusOnRenameId);
  const setShouldFocusOnRenameId = useCrossViewStateStore((state) => state.setShouldFocusOnRenameId);

  const handleDelete = (e?: React.MouseEvent<HTMLElement, MouseEvent> | undefined) => {
    if (e) {
      e.stopPropagation();
      props.onDelete();
    }
  };

  useEffect(() => {
    if (props.selected && shouldFocusOnRenameId === props.annotation.id) {
      setIsNameBeingEdited(true);
      setShouldFocusOnRenameId(undefined);
    }
  }, [props.selected, shouldFocusOnRenameId])

  return (
    <div
      className={`annotation-item${props.selected ? ' selected' : ''}${props.className ? ` ${props.className}` : ''}`}
      onClick={props.onClick}
      style={{
        outlineColor: props.annotation.color ?? '#000000',
        backgroundColor: props.annotation.color ? computeLighterColor(props.annotation.color) : computeLighterColor('#000000'),
        outlineWidth: props.selected ? '2px' : '1px',
        outlineStyle: 'solid',
        boxShadow: props.selected ? `0 0 6px ${props.annotation.color ?? '#000000'}` : 'none'
      }}
    >
      <div className="annotation-header">
        {
          isNameBeingEdited
            ? (
              <input
                className="category"
                title={props.annotation.category}
                style={{
                  color: props.annotation.color ?? '#000000'
                }}
                value={props.annotation.category}
                onBlur={() => setIsNameBeingEdited(false)}
                onChange={(e) => props.onChangeName(e.target.value)}
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
                title={props.annotation.category}
                style={{
                  color: props.annotation.color ?? '#000000'
                }}
              >
                {props.annotation.category}
              </div>
            )
        }
        <div className="stats">
          <div className="stat-tag">文档片段: {props.annotation.docRanges.length}</div>
          <div className="stat-tag">代码片段: {props.annotation.codeRanges.length}</div>
        </div>
      </div>
      {(props.annotation.docRanges.length > 0 || props.annotation.codeRanges.length > 0) && (
        <div className="range-preview">
          {props.annotation.docRanges.map((range, index) => (
            <div key={`doc-${index}`} className={`preview-content doc-content doc-range-${index}`}
            onClick={() => props.onReveal('doc', index)}>
              {range.content.replace(/!\[.*?\]\((.*?)\)/g, `![image](data:image/png;base64)`)}
            </div>
          ))}
          {props.annotation.codeRanges.map((range, index) => (
            <div key={`code-${index}`} className={`preview-content code-content code-range-${index}`}
            onClick={() => props.onReveal('code', index)}>
              {range.content}
            </div>
          ))}
        </div>
      )}
      <div className="update-time">
        更新于 {new Date(props.annotation.updateTime).toLocaleString()}
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

const AnnotationPanel = (props: AnnotationPanelProps) => {
  return (
    <Card
      title="标注"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => props.onAnnotationCreate?.()}
        >
        </Button>
      }
      className={classNames('panel', props.className)}
    >
      <div className="panel-content">
        <List
          dataSource={props.annotations}
          renderItem={(annotation, _index) => (
            <List.Item>
              <AnnotationItem
                className = {`annotation-item-${annotation.id}`}
                annotation={annotation}
                selected={props.currentAnnotation?.id === annotation.id}
                onClick={() => props.onAnnotationSelect?.(annotation)}
                onDelete={() => props.onAnnotationDelete?.(annotation.id)}
                onChangeName={(name) => props.onAnnotationRename?.(annotation.id, name)}
                onReveal={(rangeType, rangeIndex) => props.onAnnotationReveal?.(annotation.id, rangeType, rangeIndex)}
              />
            </List.Item>
          )}
        />
      </div>
    </Card>
  );
};

export default AnnotationPanel;
