import React, { useState } from 'react'
import { Button, Typography } from 'antd'
import { HolderOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { DndContext, closestCenter } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { appThemeToken } from '../../../../../styles/themeTokens'
import { EditableText } from './EditableText'
import { SimpleFieldPreview } from './SimpleFieldPreview'

const { Text } = Typography

const TableChildField = ({
  child,
  index,
  onSelect,
  onNameEdit,
  onDelete,
  dragHandleProps,
}) => {
  const [childHovered, setChildHovered] = useState(false)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        background: appThemeToken.colorBgContainer,
        borderRadius: 4,
        border: childHovered ? `1px solid ${appThemeToken.colorPrimary}` : `1px solid ${appThemeToken.colorBorder}`,
        cursor: 'pointer',
        transition: 'all 0.2s',
        boxShadow: childHovered ? '0 2px 8px rgba(0, 0, 0, 0.1)' : 'none',
      }}
      onMouseEnter={() => setChildHovered(true)}
      onMouseLeave={() => setChildHovered(false)}
      onClick={(event) => {
        event.stopPropagation()
        onSelect?.()
      }}
    >
      {dragHandleProps && (
        <span
          style={{
            cursor: 'grab',
            color: appThemeToken.colorTextTertiary,
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
          {...dragHandleProps.attributes}
          {...dragHandleProps.listeners}
        >
          <HolderOutlined />
        </span>
      )}

      <div style={{ minWidth: 80, flexShrink: 0 }}>
        <EditableText
          value={child.name || `列${index + 1}`}
          onChange={onNameEdit}
          textStyle={{
            fontSize: 14,
            color: appThemeToken.colorText,
            fontWeight: 500,
          }}
          hoverBorder={childHovered}
        />
      </div>

      <div style={{ flex: 1 }}>
        <SimpleFieldPreview field={child} />
      </div>

      {childHovered && onDelete && (
        <Button
          type="text"
          size="small"
          danger
          icon={<MinusCircleOutlined style={{ fontSize: 14 }} />}
          onClick={(event) => {
            event.stopPropagation()
            onDelete?.()
          }}
          style={{ flexShrink: 0 }}
        />
      )}
    </div>
  )
}

const SortableTableChildField = (props) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.child.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <TableChildField {...props} dragHandleProps={{ attributes, listeners }} />
    </div>
  )
}

export const TableChildrenList = ({
  tableChildren = [],
  isHovered = false,
  tablePath = [],
  level = 0,
  onChildSelect,
  onTableChildNameEdit,
  onDeleteTableChild,
  onReorderTableChildren,
  onAddTableChild,
}) => {
  const currentChildren = Array.isArray(tableChildren) ? tableChildren : []
  if (currentChildren.length === 0) {
    return (
      <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
        暂无子字段，点击"添加列"添加表格列
      </Text>
    )
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragEnd={(event) => {
        const { active, over } = event
        if (!over || active.id === over.id) return
        const oldIndex = currentChildren.findIndex((child) => child.id === active.id)
        const newIndex = currentChildren.findIndex((child) => child.id === over.id)
        if (oldIndex === -1 || newIndex === -1) return
        onReorderTableChildren?.(arrayMove(currentChildren, oldIndex, newIndex), tablePath)
      }}
    >
      <SortableContext
        items={currentChildren.map((child) => child.id)}
        strategy={verticalListSortingStrategy}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {currentChildren.map((child, idx) => {
            const childPath = [...tablePath, child.id]
            const childIsTable = child?.displayType === 'table' || child?.isTable === true
            return (
              <div key={child.id || `${child.name}_${idx}`}>
                <SortableTableChildField
                  child={child}
                  index={idx}
                  onSelect={() => onChildSelect?.(childPath)}
                  onNameEdit={(newName) => onTableChildNameEdit?.(newName, childPath)}
                  onDelete={() => onDeleteTableChild?.(idx, childPath)}
                />
                {childIsTable && (
                  <div
                    style={{
                      marginTop: 8,
                      marginLeft: Math.min((level + 1) * 20, 60),
                      padding: 10,
                      border: `1px solid ${appThemeToken.colorPrimaryBorder}`,
                      borderRadius: 6,
                      background: appThemeToken.colorBgContainer,
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: -8,
                        left: 14,
                        width: 1,
                        height: 8,
                        background: appThemeToken.colorPrimaryBorder,
                      }}
                    />
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 8,
                        padding: '4px 8px',
                        borderRadius: 4,
                        background: appThemeToken.colorPrimaryBg,
                      }}
                    >
                      <Text style={{ fontSize: 12, color: appThemeToken.colorPrimary, fontWeight: 500 }}>
                        嵌套子表：{child?.name || '未命名子表'}（{child?.config?.tableRows === 'multiRow' || child?.multiRow ? '多行' : '单行'}）
                      </Text>
                      {isHovered && (
                        <Button
                          type="link"
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={(event) => {
                            event.stopPropagation()
                            onAddTableChild?.(childPath)
                          }}
                        >
                          添加列
                        </Button>
                      )}
                    </div>
                    <TableChildrenList
                      tableChildren={child?.children || []}
                      isHovered={isHovered}
                      tablePath={childPath}
                      level={level + 1}
                      onChildSelect={onChildSelect}
                      onTableChildNameEdit={onTableChildNameEdit}
                      onDeleteTableChild={onDeleteTableChild}
                      onReorderTableChildren={onReorderTableChildren}
                      onAddTableChild={onAddTableChild}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </SortableContext>
    </DndContext>
  )
}
