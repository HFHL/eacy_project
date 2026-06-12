/**
 * GroupCard - 字段组卡片组件
 * 中间面板：设计画布中的字段组（表单）容器
 */

import React, { useEffect, useState } from 'react';
import { Empty, Alert } from 'antd';
import { DndContext, closestCenter } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable';
import { EditableGroupTitle } from './groupCard/EditableGroupTitle';
import { SortableFieldCard } from './groupCard/SortableFieldCard';

/**
 * 字段组卡片组件
 */
const GroupCard = ({
  folderId = null,
  group = {},
  selected = false,
  selectedFieldId = null,
  onSelect = null,
  onAddField = null,
  onEditField = null,
  onDeleteField = null,
  onCopyField = null,
  onEditGroup = null,
  onFieldReorder = null,
  onFieldNameChange = null,
  onOptionsChange = null,
  onGroupNameChange = null,
  onChildSelect = null,
  onAddTableChild = null,
  onAddTableRow = null,
  onDeleteTableChild = null,
  onAddMatrixRow = null,
  onAddMatrixCol = null,
  onCopyMatrixRow = null,
  onDeleteMatrixRow = null,
  onMatrixConfigChange = null,
  onTableChildNameChange = null,
  onReorderTableChildren = null,
  readonly = false,
  version = 0 // 接收版本号
}) => {
  const [fields, setFields] = useState(group.fields || []);
  const [titleHovered, setTitleHovered] = useState(false);

  // 当group.fields变化或版本号变化时，同步本地state
  useEffect(() => {
    // 创建新数组引用以确保触发更新，即使 group.fields 引用未变
    setFields([...(group.fields || [])]);
  }, [group.fields, version]);

  // 处理字段重新排序
  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const newFields = arrayMove(fields, oldIndex, newIndex);
    setFields(newFields);

    // 通知父组件更新顺序
    if (onFieldReorder) {
      onFieldReorder(newFields);
    }
  };

  // 处理组点击（不传 fieldId 表示只选中组，清除字段选择）
  const handleGroupClick = (e) => {
    // 只有直接点击组卡片背景时才触发（不是点击字段）
    if (e.target === e.currentTarget || e.target.closest('.group-header')) {
      if (onSelect) onSelect(null); // 传 null 清除字段选择
    }
  };

  // 处理字段选择
  const handleFieldSelect = (fieldId) => {
    if (onSelect) onSelect(fieldId);
  };

  // 处理表单名称修改
  const handleGroupNameChange = (newName) => {
    if (onGroupNameChange) {
      onGroupNameChange(group.id, newName);
    }
  };

  return (
    <div
      className={`group-card ${selected ? 'selected' : ''}`}
      onClick={handleGroupClick}
    >
      <div
        className="group-header"
        onMouseEnter={() => setTitleHovered(true)}
        onMouseLeave={() => setTitleHovered(false)}
      >
        <EditableGroupTitle
          value={group.name || '未命名表单'}
          onChange={handleGroupNameChange}
          isHovered={titleHovered}
        />
      </div>

      <div className="group-body hover-scrollbar">
        {fields.length === 0 ? (
          <Empty
            description="暂无字段，请从左侧组件库拖拽添加"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ margin: '20px 0' }}
          />
        ) : (
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={fields.map(f => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="group-fields">
                {fields.map((field, index) => (
                  <SortableFieldCard
                    key={field.id}
                    field={field}
                    index={index}
                    selected={selectedFieldId === field.id}
                    onSelect={() => handleFieldSelect(field.id)}
                    onEdit={() => onEditField && onEditField(field.id)}
                    onDelete={() => onDeleteField && onDeleteField(field.id)}
                    onCopy={() => onCopyField && onCopyField(field.id)}
                    onFieldNameChange={onFieldNameChange}
                    onOptionsChange={onOptionsChange}
                    onChildSelect={onChildSelect}
                    onAddTableChild={onAddTableChild}
                    onAddTableRow={onAddTableRow}
                    onDeleteTableChild={onDeleteTableChild}
                    onAddMatrixRow={onAddMatrixRow}
                    onAddMatrixCol={onAddMatrixCol}
                    onCopyMatrixRow={onCopyMatrixRow}
                    onDeleteMatrixRow={onDeleteMatrixRow}
                    onMatrixConfigChange={onMatrixConfigChange}
                    onTableChildNameChange={onTableChildNameChange}
                    onReorderTableChildren={onReorderTableChildren}
                    readonly={readonly}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {group.repeatable && (
          <Alert
            message="可重复表单（多行）"
            description="该表单支持多条记录录入，如既往史、检验结果等"
            type="info"
            showIcon
            style={{ marginTop: 12 }}
          />
        )}
      </div>
    </div>
  );
};

export default GroupCard;
