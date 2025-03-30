import React, { useEffect, useState } from 'react';
import { Card, Button, Input, List, Modal, Form, message, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import classNames from 'classnames';
import { Annotation } from '../types';
import { computeLighterColor } from './utils';
import { useCrossViewStateStore } from 'crossState';

interface AnnotationPanelProps {
  className?: string;
  annotations: Annotation[];
  currentAnnotation?: Annotation | null;
  onAnnotationCreate?: (category: string) => void;
  onAnnotationSelect?: (annotation: Annotation) => void;
  onAnnotationDelete?: (annotationId: string) => void;
  onAnnotationRename?: (annotationId: string, annotationName: string) => void;
}

const AnnotationItem = ({
  annotation,
  selected,
  onClick,
  onDelete,
  onChangeName
}: {
  annotation: Annotation;
  selected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onChangeName: (name: string) => void;
}) => {
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
                {limitNameLength(annotation.category)}
              </div>
            )
        }
        <div className="stats">
          <div className="stat-tag">文档片段: {annotation.documentRanges.length}</div>
          <div className="stat-tag">代码片段: {annotation.codeRanges.length}</div>
        </div>
      </div>
      {(annotation.documentRanges.length > 0 || annotation.codeRanges.length > 0) && (
        <div className="range-preview">
          {annotation.documentRanges.map((range, index) => (
            <div key={`doc-${index}`} className="preview-content">
              {range.content}
            </div>
          ))}
          {annotation.codeRanges.map((range, index) => (
            <div key={`code-${index}`} className="preview-content">
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
  onAnnotationRename
}) => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();

  const showCreateModal = () => {
    setIsModalVisible(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const newAnnotationId = await onAnnotationCreate?.(values.category);
      if (!newAnnotationId) {
        message.error('创建标注失败');
        return;
      }
      setIsModalVisible(false);
      form.resetFields();
      message.success('创建标注成功');
    } catch (error) {
      console.error('Validation failed:', error);
      message.error('创建标注失败');
    }
  };

  const handleModalCancel = () => {
    setIsModalVisible(false);
    form.resetFields();
  };

  return (
    <Card
      title="标注"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={showCreateModal}
        >
          新建标注
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
              />
            </List.Item>
          )}
        />
      </div>

      <Modal
        title="新建标注"
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
      >
        <Form form={form} autoComplete='off'>
          <Form.Item
            name="category"
            label="标注名称"
            rules={[{ required: true, message: '请输入标注名称' }]}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default AnnotationPanel;

function limitNameLength(name: string, limit: number = 12) {
  if (name.length <= limit) {
    return name;
  }

  return name.slice(0, limit - 2) + '...';
}
