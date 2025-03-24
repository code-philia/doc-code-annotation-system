import React, { useState } from 'react';
import { Card, Button, Input, Space, List, Typography, Collapse, Tag, Modal, Form, message, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import classNames from 'classnames';
import { Annotation, Range } from '../types';

const { Text } = Typography;
const { Panel } = Collapse;

interface AnnotationItem {
  id: string;
  name: string;
  isSelected: boolean;
  documentRanges: Array<{ start: number; end: number; }>;
  codeRanges: Array<{ start: number; end: number; }>;
}

interface AnnotationPanelProps {
  className?: string;
  annotations: Annotation[];
  currentAnnotation?: Annotation | null;
  onAnnotationCreate?: (category: string) => void;
  onAnnotationSelect?: (annotation: Annotation) => void;
  onAnnotationDelete?: (annotationId: string) => void;
}

const AnnotationItem = ({ 
  annotation, 
  selected, 
  onClick,
  onDelete 
}: { 
  annotation: Annotation; 
  selected: boolean; 
  onClick: () => void;
  onDelete: () => void;
}) => {
  const handleDelete = (e?: React.MouseEvent<HTMLElement, MouseEvent> | undefined) => {
    if (e) {
      e.stopPropagation();
      onDelete();
    }
  };

  return (
    <div className={`annotation-item ${selected ? 'selected' : ''}`} onClick={onClick}>
      <div className="annotation-header">
        <div className="category">{annotation.category}</div>
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