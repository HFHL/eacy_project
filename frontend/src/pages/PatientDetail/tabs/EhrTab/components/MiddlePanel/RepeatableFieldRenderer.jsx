/**
 * 可重复字段组渲染器组件
 * 负责渲染repeatable=true的字段组，支持多个记录实例
 */
import React, { useRef, useCallback } from 'react'
import {
  Card,
  Typography,
  Button,
  Space,
  Tag,
  Tooltip
} from 'antd'
import {
  PlayCircleOutlined,
  FileTextOutlined,
  EditOutlined,
  DeleteOutlined,
  AimOutlined
} from '@ant-design/icons'
import TableFieldRenderer from './TableFieldRenderer'
import FieldEditRenderer from './FieldEditRenderer'

const { Text } = Typography

const RepeatableFieldRenderer = ({
  // 字段组数据
  groupData,
  
  // 编辑状态
  editingEhrField,
  editingEhrValue,
  setEditingEhrValue,
  
  // 事件处理函数
  onEdit,
  onSave,
  onCancel,
  onEditRecord,
  onDeleteRecord,
  onAddNewGroup,
  onViewSource,
  
  // 工具函数
  getEhrConfidenceColor
}) => {
  // 如果没有记录，显示空状态
  if (!groupData.records || groupData.records.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
        <FileTextOutlined style={{ fontSize: 32, marginBottom: 12 }} />
        <div>暂无{groupData.name}记录</div>
        <Button 
          type="dashed" 
          icon={<PlayCircleOutlined />}
          style={{ marginTop: 12 }}
          onClick={() => console.log('添加新记录')}
        >
          + 添加{groupData.name}
        </Button>
      </div>
    )
  }

  // 用于区分单击（溯源）与双击（编辑）的计时器
  const clickTimerRef = useRef(null)

  // 从 record 或 field 中提取 apiFieldId
  const getApiFieldId = useCallback((record) => {
    if (!record?.fields || record.fields.length === 0) return null
    const apiFieldId = record.fields[0].apiFieldId
    if (apiFieldId) return apiFieldId
    const fieldWithApiFieldId = record.fields.find(f => f.apiFieldId)
    return fieldWithApiFieldId?.apiFieldId || null
  }, [])

  // 处理可重复字段组的溯源 - 传入整个 record 信息
  const handleRecordViewSource = (record, index) => {
    if (!onViewSource) return
    
    const apiFieldId = getApiFieldId(record)
    
    if (!apiFieldId) {
      console.warn('⚠️ 无法确定可重复字段组的 apiFieldId:', { 
        record, 
        groupData,
        fields: record.fields?.map(f => ({ id: f.id, apiFieldId: f.apiFieldId }))
      })
      return
    }
    
    // 构造一个虚拟的字段对象，用于溯源
    const virtualField = {
      id: record.id,
      name: `${groupData.name} #${index + 1}`,
      apiFieldId: apiFieldId,
      value: record.fields?.map(f => f.value).filter(Boolean).join(', ') || '',
      source: record.fields?.[0]?.source
    }
    
    console.log('🔍 可重复字段组溯源:', virtualField)
    onViewSource(virtualField)
  }

  // 处理单个字段的单击溯源（与双击编辑区分）
  const handleFieldSingleClick = (field, record, recordIndex) => {
    if (!onViewSource) return
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
    }
    clickTimerRef.current = setTimeout(() => {
      const apiFieldId = field.apiFieldId || getApiFieldId(record)
      if (!apiFieldId) return
      const virtualField = {
        id: field.id,
        name: `${groupData.name} #${recordIndex + 1} - ${field.name}`,
        apiFieldId: apiFieldId,
        value: field.value || '',
        source: field.source
      }
      console.log('🔍 可重复字段组-字段溯源:', virtualField)
      onViewSource(virtualField)
      clickTimerRef.current = null
    }, 250)
  }

  // 处理双击编辑（取消单击溯源计时器）
  const handleFieldDoubleClick = (field) => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    onEdit(field.id, field.value)
  }

  return (
    <div>
      {groupData.records.map((record, index) => (
        <Card
          key={record.id}
          size="small"
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <Text strong style={{ fontSize: 14 }}>{groupData.name} #{index + 1}</Text>
                {/* 溯源按钮 - 在标题旁边 */}
                <Tooltip title="查看文档溯源">
                  <Button
                    type="text"
                    size="small"
                    icon={<AimOutlined />}
                    onClick={() => handleRecordViewSource(record, index)}
                    style={{ 
                      padding: '0 4px',
                      height: 22,
                      minWidth: 22,
                      color: '#1890ff',
                      opacity: 0.7
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = 0.7}
                  />
                </Tooltip>
              </Space>
              <Space>
                <Button 
                  type="text" 
                  size="small" 
                  icon={<DeleteOutlined />} 
                  danger
                  onClick={() => onDeleteRecord(record.id)}
                >
                  删除
                </Button>
              </Space>
            </div>
          }
          style={{ 
            marginBottom: 16,
            border: '1px solid #f0f0f0',
            borderRadius: 6
          }}
          styles={{ body: { padding: '16px' } }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 先渲染所有table_fields类型的字段 */}
            {record.fields.filter(field => field.fieldType === 'table_fields').map(field => (
              <div key={field.id} style={{ width: '100%' }}>
                <TableFieldRenderer
                  field={field}
                  editingEhrField={editingEhrField}
                  editingEhrValue={editingEhrValue}
                  setEditingEhrValue={setEditingEhrValue}
                  onEdit={onEdit}
                  onSave={onSave}
                  onCancel={onCancel}
                  onExtract={(fieldId) => console.log('抽取字段:', fieldId)}
                  getEhrConfidenceColor={getEhrConfidenceColor}
                />
              </div>
            ))}
            
            {/* 然后渲染普通字段，使用网格布局 */}
            {(() => {
              const normalFields = record.fields.filter(field => 
                field.fieldType === 'fields' || // 新格式
                (field.type && !field.fieldType) // 旧格式：有type属性但没有fieldType属性
              )
              
              if (normalFields.length === 0) return null
              
              return (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                  gap: '12px',
                  maxWidth: '100%'
                }}>
                  {normalFields.map(field => (
                    <div key={field.id} style={{ marginBottom: 8 }}>
                      <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Text strong style={{ fontSize: 12, color: '#666' }}>
                          {field.name.replace(/.*_/, '')}
                        </Text>
                        {/* 溯源按钮 */}
                        <Tooltip title="查看文档溯源">
                          <Button
                            type="text"
                            size="small"
                            icon={<AimOutlined />}
                            onClick={() => handleFieldSingleClick(field, record, index)}
                            style={{ 
                              padding: '0 2px',
                              height: 18,
                              minWidth: 18,
                              color: '#1890ff',
                              opacity: 0.6
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = 0.6}
                          />
                        </Tooltip>
                      </div>
                      {editingEhrField === field.id ? (
                        // 编辑状态 - 使用智能编辑组件
                        <FieldEditRenderer
                          field={field}
                          value={editingEhrValue}
                          onChange={setEditingEhrValue}
                          onSave={onSave}
                          onCancel={onCancel}
                          getEhrConfidenceColor={getEhrConfidenceColor}
                        />
                      ) : (
                        // 显示状态：单击溯源 / 双击编辑
                        <Tooltip
                          title={<span style={{ fontSize: 11 }}>单击溯源 / 双击编辑</span>}
                          mouseEnterDelay={0.5}
                        >
                          <div
                            style={{
                              padding: '6px 8px',
                              borderRadius: 4,
                              background: field.extractable ? '#fafafa' : `${getEhrConfidenceColor(field.confidence)}15`,
                              border: field.extractable ? '1px dashed #d9d9d9' : `1px solid ${getEhrConfidenceColor(field.confidence)}40`,
                              cursor: 'pointer',
                              minHeight: 28,
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            onClick={() => handleFieldSingleClick(field, record, index)}
                            onDoubleClick={() => handleFieldDoubleClick(field)}
                          >
                            <Text style={{ fontSize: 12 }}>
                              {field.value || '暂无数据'}
                            </Text>
                          </div>
                        </Tooltip>
                      )}
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        </Card>
      ))}
      
      {/* 新增字段组按钮 */}
      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <Button 
          type="dashed" 
          icon={<PlayCircleOutlined />}
          onClick={() => onAddNewGroup && onAddNewGroup(groupData.name)}
          style={{ 
            width: '100%',
            height: 48,
            fontSize: 14,
            borderStyle: 'dashed',
            borderColor: '#d9d9d9'
          }}
        >
          + 添加新的{groupData.name}
        </Button>
      </div>
    </div>
  )
}

export default RepeatableFieldRenderer