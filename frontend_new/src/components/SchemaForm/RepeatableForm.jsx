/**
 * 可重复表单组件
 * 处理Schema中type为array的字段组，支持新增、删除、编辑多条记录
 * - 第一层Table：完整渲染为表格
 * - 嵌套Table：摘要显示，点击弹窗展开
 */
import React, { useMemo, useCallback, useState } from 'react'
import {
  Card,
  Button,
  Empty,
  Typography,
  Space,
  Badge,
  Tooltip,
  Table,
  Modal
} from 'antd'
import {
  PlusOutlined,
  TableOutlined,
  EditOutlined,
  FileSearchOutlined
} from '@ant-design/icons'
import FieldRenderer from './FieldRenderer'
import { useSchemaForm, orderedPropertyEntries } from './SchemaFormContext'
import { appThemeToken } from '../../styles/themeTokens'
import NestedTableViewer from './repeatableForm/NestedTableViewer'
import { scrollbarStyle } from './repeatableForm/repeatableFormStyles'
import {
  cloneRecordForInsert,
  createEmptyRecord,
  ensureRecordRowUid,
  getRecordTitle,
} from './repeatableForm/repeatableRecordUtils'
import { getTableColumns } from './repeatableForm/tableColumns'

const { Text } = Typography

const RecordEditModal = ({ visible, record, itemSchema, index, path, onSave, onCancel, disabled, onSourceClick, selectedFieldPath }) => {
  const [editingRecord, setEditingRecord] = useState(record)
  React.useEffect(() => { setEditingRecord(record) }, [record])
  if (!itemSchema?.properties) return null
  const requiredFields = itemSchema.required || []
  const { simpleFields, nestedArrays } = useMemo(() => {
    const simple = [], arrays = []
    for (const [fieldName, fieldSchema] of orderedPropertyEntries(itemSchema.properties, itemSchema)) {
      if (fieldSchema.type === 'array' && fieldSchema.items?.properties) arrays.push({ fieldName, fieldSchema })
      else if (fieldSchema.type !== 'object' || !fieldSchema.properties) simple.push({ fieldName, fieldSchema })
    }
    return { simpleFields: simple, nestedArrays: arrays }
  }, [itemSchema])
  const handleFieldChange = useCallback((fieldName, value) => { setEditingRecord(prev => ({ ...prev, [fieldName]: value })) }, [])
  return (
    <Modal title={<Space><EditOutlined /><span>编辑记录 #{index + 1}</span></Space>} open={visible} onCancel={onCancel} onOk={() => onSave(index, editingRecord)} okText="保存" cancelText="取消" width={800} style={{ top: 20 }} styles={{ body: { maxHeight: '70vh', overflowY: 'auto', overflowX: 'hidden' } }} className="schema-edit-modal">
      <style>{scrollbarStyle}</style>
      <div className="schema-modal-scrollable" style={{ maxHeight: '65vh', overflowY: 'auto', overflowX: 'hidden', paddingRight: 8 }}>
        {simpleFields.map(({ fieldName, fieldSchema }) => {
          const fieldPath = `${path}.${index}.${fieldName}`
          return (
            <FieldRenderer key={fieldName} fieldName={fieldName} fieldSchema={fieldSchema} path={fieldPath} value={editingRecord?.[fieldName]} onChange={(value) => handleFieldChange(fieldName, value)} disabled={disabled} required={requiredFields.includes(fieldName)} onSourceClick={onSourceClick} isSelected={selectedFieldPath === fieldPath} />
          )
        })}
        {nestedArrays.map(({ fieldName, fieldSchema }) => (
          <NestedTableViewer key={fieldName} title={fieldName} arraySchema={fieldSchema} path={`${path}.${index}.${fieldName}`} data={editingRecord?.[fieldName] || []} onDataChange={(newData) => handleFieldChange(fieldName, newData)} onSourceClick={onSourceClick} selectedFieldPath={selectedFieldPath} disabled={disabled} />
        ))}
      </div>
    </Modal>
  )
}

const RepeatableForm = ({ title, arraySchema, path, data = [], onDataChange, onSourceClick, selectedFieldPath, disabled = false, maxItems = 100, minItems = 0, defaultExpanded = true }) => {
  const { actions } = useSchemaForm()
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editingIndex, setEditingIndex] = useState(-1)
  const [editingRecord, setEditingRecord] = useState(null)
  const itemSchema = arraySchema?.items
  const normalizedData = useMemo(() => (Array.isArray(data) ? data : []), [data])
  // 路径中含有 .数字. 说明这是第二层（或更深）嵌套数组，icon 放标题，单元格不显示
  const isNested = useMemo(() => /\.\d+\./.test(path), [path])
  const { columns } = useMemo(() => getTableColumns(itemSchema, (index, record) => { setEditingIndex(index); setEditingRecord({ ...ensureRecordRowUid(record) }); setEditModalVisible(true); }, (index) => { if (normalizedData.length <= minItems) return; const newData = [...normalizedData]; newData.splice(index, 1); onDataChange ? onDataChange(newData) : actions.updateFieldValue(path, newData); }, (index) => { if (normalizedData.length >= maxItems) return; const copiedRecord = cloneRecordForInsert(JSON.parse(JSON.stringify(normalizedData[index] || {}))); const newData = [...normalizedData]; newData.splice(index + 1, 0, copiedRecord); onDataChange ? onDataChange(newData) : actions.updateFieldValue(path, newData); }, onSourceClick, disabled, path, !isNested), [itemSchema, normalizedData, disabled, minItems, maxItems, onDataChange, actions, path, onSourceClick, isNested])
  const handleAdd = useCallback(() => { if (normalizedData.length >= maxItems) return; const newRecord = ensureRecordRowUid(createEmptyRecord(itemSchema)); setEditingIndex(normalizedData.length); setEditingRecord(newRecord); setEditModalVisible(true); }, [normalizedData.length, maxItems, itemSchema])
  const handleSaveEdit = useCallback((index, record) => { const newData = [...normalizedData]; const normalizedRecord = ensureRecordRowUid(record); if (index >= normalizedData.length) newData.push(normalizedRecord); else newData[index] = normalizedRecord; onDataChange ? onDataChange(newData) : actions.updateFieldValue(path, newData); setEditModalVisible(false); setEditingRecord(null); }, [normalizedData, path, onDataChange, actions])
  const tableData = useMemo(() => normalizedData.map((item, index) => ({ ...ensureRecordRowUid(item), _rowKey: index })), [normalizedData])
  const cardTitle = (
    <Space>
      <TableOutlined style={{ color: appThemeToken.colorPrimary }} />
      <Text strong>{title || '数据表'}</Text>
      <Badge count={normalizedData.length} style={{ backgroundColor: normalizedData.length > 0 ? appThemeToken.colorSuccess : appThemeToken.colorTextTertiary }} />
      {isNested && (
        <Tooltip title="查看溯源">
          <FileSearchOutlined
            style={{ fontSize: 14, color: appThemeToken.colorPrimary, cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation()
              if (onSourceClick) onSourceClick(path, arraySchema, title, { forceOpen: true, trigger: 'source-icon' })
            }}
          />
        </Tooltip>
      )}
    </Space>
  )
  return (
    <Card size="small" className="repeatable-form-card" title={cardTitle} extra={<Tooltip title="添加新记录"><Button type="text" size="small" icon={<PlusOutlined style={{ fontSize: 14 }} />} onClick={handleAdd} disabled={disabled || normalizedData.length >= maxItems} className="card-hover-action" style={{ color: appThemeToken.colorPrimary, padding: '2px 6px', height: 'auto' }} /></Tooltip>} style={{ marginBottom: 16, borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
      {normalizedData.length === 0 ? (
        <div style={{ padding: 24 }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">暂无记录，点击"新增记录"添加</Text>}>
            <Button type="dashed" icon={<PlusOutlined />} onClick={handleAdd} disabled={disabled}>添加第一条记录</Button>
          </Empty>
        </div>
      ) : (
        <div className="schema-table-wrapper">
          <style>{scrollbarStyle}</style>
          <Table
            dataSource={tableData}
            columns={columns}
            rowKey={(record) => record?._row_uid || record?._rowKey}
            size="small"
            pagination={normalizedData.length > 10 ? { pageSize: 10, showSizeChanger: true } : false}
            scroll={{ x: 'max-content' }}
            style={{ margin: 0 }}
            rowClassName={(record) => (selectedFieldPath?.startsWith(`${path}.${record._rowKey}`) ? 'selected-row' : '')}
          />
        </div>
      )}
      <RecordEditModal visible={editModalVisible} record={editingRecord} itemSchema={itemSchema} index={editingIndex} path={path} onSave={handleSaveEdit} onCancel={() => { setEditModalVisible(false); setEditingRecord(null); }} disabled={disabled} onSourceClick={onSourceClick} selectedFieldPath={selectedFieldPath} />
    </Card>
  )
}

export default RepeatableForm
export { createEmptyRecord, getRecordTitle, NestedTableViewer }
