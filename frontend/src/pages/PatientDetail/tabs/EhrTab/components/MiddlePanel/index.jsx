/**
 * 中间面板组件 - 字段详情展示
 * 根据选中的字段组显示对应的字段详情和编辑功能
 */
import React from 'react'
import {
  Card,
  Typography,
  Button,
  Space,
  Tag
} from 'antd'
import {
  PlayCircleOutlined,
  FileTextOutlined
} from '@ant-design/icons'
import FieldRenderer from './FieldRenderer'
import TableFieldRenderer from './TableFieldRenderer'
import RepeatableFieldRenderer from './RepeatableFieldRenderer'

const { Text } = Typography

const MiddlePanel = ({
  // 字段组数据
  currentGroup,
  
  // 编辑状态
  editingEhrField,
  editingEhrValue,
  setEditingEhrValue,
  
  // 事件处理函数
  handleEhrFieldEdit,
  handleEhrSaveEdit,
  handleEhrCancelEdit,
  handleEhrGroupExtract,
  handleEhrViewSource,
  handleEhrEditRecord,
  handleEhrDeleteRecord,
  onDeleteTableRow,
  onAddTableRow,
  onAddNewGroup,
  
  // 工具函数
  getEhrConfidenceColor
}) => {
  return (
    <Card
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <span>{currentGroup.name}</span>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {currentGroup.fields?.length || 0} 个字段
            </Text>
          </Space>
          <Button 
            type="primary" 
            size="small" 
            icon={<PlayCircleOutlined />}
            onClick={handleEhrGroupExtract}
            style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
          >
            AI抽取
          </Button>
        </div>
      }
      size="small"
      style={{ 
        border: '1px solid #e8e8e8',
        borderRadius: '6px'
      }}
      styles={{ body: { padding: '16px' } }}
    >
      {(() => {
        // 调试日志
        console.log('🎯 MiddlePanel 渲染:', {
          groupName: currentGroup.name,
          repeatable: currentGroup.repeatable,
          fieldsLength: currentGroup.fields?.length,
          recordsLength: currentGroup.records?.length,
          fields: currentGroup.fields
        })
        
        // 根据字段组是否可重复选择渲染方式
        // repeatable = true: 可重复字段组，使用记录形式渲染
        if (currentGroup.repeatable) {
          return (
            <RepeatableFieldRenderer
              groupData={currentGroup}
              editingEhrField={editingEhrField}
              editingEhrValue={editingEhrValue}
              setEditingEhrValue={setEditingEhrValue}
              onEdit={handleEhrFieldEdit}
              onSave={handleEhrSaveEdit}
              onCancel={handleEhrCancelEdit}
              onEditRecord={handleEhrEditRecord}
              onDeleteRecord={handleEhrDeleteRecord}
              onAddNewGroup={onAddNewGroup}
              onViewSource={handleEhrViewSource}
              getEhrConfidenceColor={getEhrConfidenceColor}
            />
          )
        }
        
        // 不可重复字段组渲染（repeatable = false: 单一实例字段组）
        // 修改逻辑：即使字段值为空也要显示字段结构
        if (currentGroup.fields && currentGroup.fields.length > 0) {
          // 分离表格字段和普通字段
          const tableFields = currentGroup.fields.filter(field => field.fieldType === 'table_fields')
          const normalFields = currentGroup.fields.filter(field => field.fieldType !== 'table_fields')
          
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* 表格字段单独渲染，占满宽度 */}
               {tableFields.map(field => (
                 <TableFieldRenderer
                   key={field.id}
                   field={field}
                   editingEhrField={editingEhrField}
                   editingEhrValue={editingEhrValue}
                   setEditingEhrValue={setEditingEhrValue}
                   onEdit={handleEhrFieldEdit}
                   onSave={handleEhrSaveEdit}
                   onCancel={handleEhrCancelEdit}
                   onExtract={handleEhrGroupExtract}
                   onDeleteTableRow={onDeleteTableRow}
                   onAddTableRow={onAddTableRow}
                   getEhrConfidenceColor={getEhrConfidenceColor}
                 />
               ))}
               
               {/* 普通字段使用响应式网格布局 */}
               {normalFields.length > 0 && (
                 <div style={{ 
                   display: 'grid', 
                   gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                   gap: '12px',
                   maxWidth: '100%'
                 }}>
                   {normalFields.map(field => (
                     <FieldRenderer
                       key={field.id}
                       field={field}
                       isEditing={editingEhrField === field.id}
                       editingValue={editingEhrValue}
                       setEditingValue={setEditingEhrValue}
                       onEdit={handleEhrFieldEdit}
                       onSave={handleEhrSaveEdit}
                       onCancel={handleEhrCancelEdit}
                       onViewSource={handleEhrViewSource}
                       getEhrConfidenceColor={getEhrConfidenceColor}
                     />
                   ))}
                 </div>
               )}
            </div>
          )
        }
        
        // 空状态
        return (
          <div style={{ 
            minHeight: '200px',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: '#999',
            fontSize: 14
          }}>
            <div style={{ textAlign: 'center' }}>
              <FileTextOutlined style={{ fontSize: 48, marginBottom: 16 }} />
              <div>选择左侧字段组查看详细信息</div>
              <div style={{ fontSize: 12, marginTop: 8 }}>
                电子病历夹字段展示区域
              </div>
            </div>
          </div>
        )
      })()}
    </Card>
  )
}

export default MiddlePanel