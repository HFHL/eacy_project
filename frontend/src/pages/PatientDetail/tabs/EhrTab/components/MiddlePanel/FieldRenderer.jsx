/**
 * 普通字段渲染器组件
 * 负责渲染单个普通字段的显示和编辑功能
 */
import React, { useRef } from 'react'
import {
  Typography,
  Tooltip,
  Button
} from 'antd'
import {
  WarningOutlined,
  InfoCircleOutlined,
  AimOutlined
} from '@ant-design/icons'
import FieldEditRenderer from './FieldEditRenderer'
import { maskSensitiveField } from '@/utils/sensitiveUtils'

const { Text } = Typography

const FieldRenderer = ({
  // 字段数据
  field,
  
  // 编辑状态
  isEditing,
  editingValue,
  setEditingValue,
  
  // 事件处理函数
  onEdit,
  onSave,
  onCancel,
  onViewSource,
  
  // 工具函数
  getEhrConfidenceColor
}) => {
  // 用于区分单击（溯源）与双击（编辑）
  const clickTimerRef = useRef(null)

  const handleSingleClick = () => {
    if (!onViewSource) return
    // 延迟触发，若发生双击则会取消
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
    }
    clickTimerRef.current = setTimeout(() => {
      onViewSource(field)
      clickTimerRef.current = null
    }, 250)
  }

  const handleDoubleClick = () => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    onEdit(field.id, field.value)
  }

  return (
    <div
      key={field.id}
      style={{
        padding: '12px',
        border: '1px solid #f0f0f0',
        borderRadius: '6px',
        background: field.extractable ? '#fafafa' : 'white',
        transition: 'all 0.2s ease'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* 字段标签 */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 8
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Text strong style={{ fontSize: 13, color: '#333' }}>
            {field.name}
          </Text>
          {/* 溯源按钮 */}
          <Tooltip title="查看文档溯源">
            <Button
              type="text"
              size="small"
              icon={<AimOutlined />}
              onClick={() => onViewSource(field)}
              style={{ 
                padding: '0 4px',
                height: 20,
                minWidth: 20,
                color: '#1890ff',
                opacity: 0.7
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
              onMouseLeave={(e) => e.currentTarget.style.opacity = 0.7}
            />
          </Tooltip>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {field.sensitive && (
            <Tooltip title="敏感字段">
              <WarningOutlined style={{ fontSize: 10, color: '#faad14' }} />
            </Tooltip>
          )}
          {!field.editable && (
            <Tooltip title="只读字段">
              <InfoCircleOutlined style={{ fontSize: 10, color: '#999' }} />
            </Tooltip>
          )}
        </div>
      </div>

      {/* 字段值 */}
      {isEditing ? (
        // 编辑状态 - 使用智能编辑组件
        <FieldEditRenderer
          field={field}
          value={editingValue}
          onChange={setEditingValue}
          onSave={onSave}
          onCancel={onCancel}
          getEhrConfidenceColor={getEhrConfidenceColor}
        />
      ) : (
        // 显示状态
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 4,
            background: field.extractable ? '#fafafa' : `${getEhrConfidenceColor(field.confidence)}15`,
            border: field.extractable ? '1px dashed #d9d9d9' : `1px solid ${getEhrConfidenceColor(field.confidence)}40`,
            cursor: 'pointer',
            minHeight: 32,
            display: 'flex',
            alignItems: 'center'
          }}
          onClick={handleSingleClick}
          onDoubleClick={handleDoubleClick}
        >
          <Tooltip
            title={
              <div>
                <div>UI类型: {field.uiType}</div>
                <div>字段渲染类型: {field.fieldType}</div>
                <div>置信度: {field.confidence === 'high' ? '高置信度' : field.confidence === 'medium' ? '中置信度' : '低置信度'}</div>
                <div>来源: {field.source}</div>
                {field.sensitive && <div style={{ color: '#faad14' }}>⚠️ 敏感字段</div>}
                {!field.editable && <div style={{ color: '#999' }}>🔒 只读字段</div>}
                <div style={{ marginTop: 4, fontSize: 11 }}>
                  单击溯源 / 双击编辑
                </div>
              </div>
            }
          >
            <Text style={{ 
              fontSize: 13,
              color: field.value ? '#333' : '#999',
              fontStyle: field.value ? 'normal' : 'italic'
            }}>
              {field.value
                ? (field.sensitive
                    ? maskSensitiveField(field.value, field.name, field.id)
                    : field.value)
                : (field.extractable ? '点击AI抽取获取数据' : '暂无数据，双击编辑')}
            </Text>
          </Tooltip>
        </div>
      )}
    </div>
  )
}

export default FieldRenderer