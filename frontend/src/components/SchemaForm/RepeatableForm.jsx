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
  Popconfirm,
  Typography,
  Space,
  Badge,
  Tooltip,
  Table,
  Modal,
  Tag
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  TableOutlined,
  EditOutlined,
  EyeOutlined,
  FileSearchOutlined,
  LinkOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons'
import FieldRenderer from './FieldRenderer'
import { useSchemaForm } from './SchemaFormContext'

const { Text } = Typography

const scrollbarStyle = `
  .schema-modal-scrollable::-webkit-scrollbar,
  .schema-table-wrapper .ant-table-body::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }
  .schema-modal-scrollable::-webkit-scrollbar-track,
  .schema-table-wrapper .ant-table-body::-webkit-scrollbar-track {
    background: transparent;
  }
  .schema-modal-scrollable::-webkit-scrollbar-thumb,
  .schema-table-wrapper .ant-table-body::-webkit-scrollbar-thumb {
    background: #d9d9d9;
    border-radius: 2px;
  }
  .schema-modal-scrollable::-webkit-scrollbar-thumb:hover,
  .schema-table-wrapper .ant-table-body::-webkit-scrollbar-thumb:hover {
    background: #bfbfbf;
  }
  .schema-table-wrapper .ant-table-header::-webkit-scrollbar { height: 0; }
  .schema-table-wrapper .ant-table-row.selected-row > td { background: #e6f4ff !important; }
  .schema-table-wrapper .ant-table-row.selected-row:hover > td { background: #bae0ff !important; }
  .schema-table-wrapper .ant-table-row:hover > td { background: #fafafa; }
  .schema-table-wrapper .row-actions { opacity: 0; transition: opacity 0.2s ease; }
  .schema-table-wrapper .ant-table-row:hover .row-actions { opacity: 1; }
  .repeatable-form-card .card-hover-action { opacity: 0; transition: opacity 0.2s ease; }
  .repeatable-form-card:hover .card-hover-action { opacity: 1; }
`

function getRecordTitle(record, itemSchema, index) {
  if (!record || !itemSchema?.properties) return `记录 ${index + 1}`
  for (const [key, fieldSchema] of Object.entries(itemSchema.properties)) {
    if (fieldSchema['x-primary'] && record[key]) return record[key]
  }
  for (const [key, fieldSchema] of Object.entries(itemSchema.properties)) {
    if (fieldSchema.type === 'string' && record[key])
      return record[key].length > 30 ? record[key].substring(0, 30) + '...' : record[key]
  }
  return `记录 ${index + 1}`
}

function createEmptyRecord(itemSchema) {
  if (!itemSchema?.properties) return {}
  const record = {}
  for (const [key, fieldSchema] of Object.entries(itemSchema.properties)) {
    if (fieldSchema.type === 'array') record[key] = []
    else if (fieldSchema.type === 'object') record[key] = {}
    else if (fieldSchema.type === 'number') record[key] = null
    else record[key] = ''
  }
  return record
}

function getFieldSourceSummary(fieldSchema) {
  const sources = fieldSchema?.['x-sources']
  if (!sources) return null
  const primarySources = sources.primary || []
  const secondarySources = sources.secondary || []
  if (primarySources.length === 0 && secondarySources.length === 0) return null
  return {
    primary: primarySources,
    secondary: secondarySources,
    prompt: fieldSchema?.['x-extraction-prompt']
  }
}

const CellWithSource = ({ value, fieldSchema, fieldName, onSourceClick, path }) => {
  const sourceInfo = getFieldSourceSummary(fieldSchema)
  const hasSource = false
  const displayValue = useMemo(() => {
    if (value === null || value === undefined || value === '') return <Text type="secondary">-</Text>
    if (typeof value === 'boolean') return value ? '是' : '否'
    return value
  }, [value])
  if (!hasSource) return <span>{displayValue}</span>
  const tooltipContent = (
    <div style={{ maxWidth: 280, fontSize: 12 }}>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>
        <LinkOutlined style={{ marginRight: 4 }} /> 字段来源: {fieldName}
      </div>
      {sourceInfo.primary.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <Text type="secondary">主要来源:</Text>
          <div style={{ paddingLeft: 8 }}>
            {sourceInfo.primary.slice(0, 2).map((s, i) => (
              <div key={i} style={{ color: '#52c41a' }}>• {s}</div>
            ))}
            {sourceInfo.primary.length > 2 && <div style={{ color: '#999' }}>...还有{sourceInfo.primary.length - 2}个</div>}
          </div>
        </div>
      )}
      {sourceInfo.prompt && (
        <div style={{ marginTop: 4, padding: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 4, fontSize: 11, color: '#aaa' }}>
          提取规则: {sourceInfo.prompt.substring(0, 50)}...
        </div>
      )}
      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: 11, color: '#8c8c8c' }}>点击查看详细来源信息</div>
    </div>
  )
  return (
    <Tooltip title={tooltipContent} placement="topLeft" color="#333">
      <span style={{ cursor: 'pointer', borderBottom: '1px dashed #d9d9d9' }} onClick={(e) => { e.stopPropagation(); if (onSourceClick) onSourceClick(path, fieldSchema, fieldName); }}>
        {displayValue}
      </span>
    </Tooltip>
  )
}

function getTableColumns(itemSchema, onEdit, onDelete, onCopy, onRowSource, disabled, basePath) {
  if (!itemSchema?.properties) return []
  const columns = []
  const nestedArrayFields = []
  for (const [fieldName, fieldSchema] of Object.entries(itemSchema.properties)) {
    if (fieldSchema.type === 'array' && fieldSchema.items?.properties) {
      nestedArrayFields.push({ fieldName, fieldSchema })
    } else if (fieldSchema.type !== 'object' || !fieldSchema.properties) {
      const hasSource = getFieldSourceSummary(fieldSchema)
      columns.push({
        title: (
          <Space size={4}>
            <span>{fieldName}</span>
            {hasSource && <Tooltip title="此字段有来源配置"><LinkOutlined style={{ fontSize: 10, color: '#1890ff' }} /></Tooltip>}
          </Space>
        ),
        dataIndex: fieldName,
        key: fieldName,
        ellipsis: true,
        width: 150,
        render: (value, record, index) => (
          <CellWithSource value={value} fieldSchema={fieldSchema} fieldName={fieldName} path={`${basePath}.${index}.${fieldName}`} onSourceClick={onRowSource} />
        )
      })
    }
  }
  for (const { fieldName, fieldSchema } of nestedArrayFields) {
    columns.push({
      title: fieldName,
      dataIndex: fieldName,
      key: fieldName,
      width: 120,
      render: (value) => {
        const count = Array.isArray(value) ? value.length : 0
        return (
          <Space>
            <Badge count={count} size="small" style={{ backgroundColor: count > 0 ? '#52c41a' : '#d9d9d9' }} />
            <Text type="secondary">{count}条</Text>
          </Space>
        )
      }
    })
  }
  columns.push({
    title: '',
    key: '_action',
    width: 80,
    fixed: 'right',
    render: (_, record, index) => (
      <Space size={4} className="row-actions">
        <Tooltip title="编辑" placement="top">
          <Button type="text" size="small" icon={<EditOutlined style={{ fontSize: 14 }} />} onClick={(e) => { e.stopPropagation(); onEdit(index, record); }} disabled={disabled} style={{ padding: '2px 4px', height: 'auto' }} />
        </Tooltip>
        <Tooltip title="复制" placement="top">
          <Button type="text" size="small" icon={<CopyOutlined style={{ fontSize: 14 }} />} onClick={(e) => { e.stopPropagation(); onCopy(index); }} disabled={disabled} style={{ padding: '2px 4px', height: 'auto' }} />
        </Tooltip>
        <Popconfirm title="确定删除此记录？" onConfirm={() => onDelete(index)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
          <Tooltip title="删除" placement="top">
            <Button type="text" size="small" icon={<DeleteOutlined style={{ fontSize: 14 }} />} danger disabled={disabled} style={{ padding: '2px 4px', height: 'auto' }} />
          </Tooltip>
        </Popconfirm>
      </Space>
    )
  })
  return { columns, nestedArrayFields }
}

const RecordEditModal = ({ visible, record, itemSchema, index, path, onSave, onCancel, disabled, onSourceClick, selectedFieldPath }) => {
  const [editingRecord, setEditingRecord] = useState(record)
  React.useEffect(() => { setEditingRecord(record) }, [record])
  if (!itemSchema?.properties) return null
  const requiredFields = itemSchema.required || []
  const { simpleFields, nestedArrays } = useMemo(() => {
    const simple = [], arrays = []
    for (const [fieldName, fieldSchema] of Object.entries(itemSchema.properties)) {
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

const NestedTableViewer = ({ title, arraySchema, path, data = [], onDataChange, onSourceClick, selectedFieldPath, disabled = false }) => {
  const [modalVisible, setModalVisible] = useState(false)
  const [editingIndex, setEditingIndex] = useState(-1)
  const [editingRecord, setEditingRecord] = useState(null)
  const itemSchema = arraySchema?.items
  const columns = useMemo(() => {
    if (!itemSchema?.properties) return []
    const cols = []
    for (const [fieldName, fieldSchema] of Object.entries(itemSchema.properties)) {
      if (fieldSchema.type !== 'array' && fieldSchema.type !== 'object') {
        cols.push({ title: fieldName, dataIndex: fieldName, key: fieldName, ellipsis: true, render: (value) => value === null || value === undefined || value === '' ? <Text type="secondary">-</Text> : value })
      }
    }
    cols.push({
      title: '操作',
      key: '_action',
      width: 80,
      render: (_, record, index) => (
        <Space size="small">
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditingIndex(index); setEditingRecord({ ...record }); setModalVisible(true); }} disabled={disabled} />
          <Popconfirm title="确定删除？" onConfirm={() => { const newData = [...data]; newData.splice(index, 1); onDataChange(newData); }}>
            <Button type="text" size="small" icon={<DeleteOutlined />} danger disabled={disabled} />
          </Popconfirm>
        </Space>
      )
    })
    return cols
  }, [itemSchema, data, onDataChange, disabled])
  const handleAdd = () => { const newRecord = createEmptyRecord(itemSchema); setEditingIndex(data.length); setEditingRecord(newRecord); setModalVisible(true); }
  const handleSave = () => {
    const newData = [...data]
    if (editingIndex >= data.length) newData.push(editingRecord)
    else newData[editingIndex] = editingRecord
    onDataChange(newData)
    setModalVisible(false)
    setEditingRecord(null)
  }
  const handleFieldChange = (fieldName, value) => { setEditingRecord(prev => ({ ...prev, [fieldName]: value })) }
  const requiredFields = itemSchema?.required || []
  return (
    <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 6, border: '1px solid #e8e8e8' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Space>
          <TableOutlined style={{ color: '#1890ff' }} />
          <Text strong>{title}</Text>
          <Badge count={data.length} size="small" style={{ backgroundColor: data.length > 0 ? '#52c41a' : '#d9d9d9' }} />
        </Space>
        <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={handleAdd} disabled={disabled}>添加</Button>
      </div>
      {data.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" style={{ padding: '12px 0' }} />
      ) : (
        <div className="schema-table-wrapper">
          <Table dataSource={data.map((item, i) => ({ ...item, _key: i }))} columns={columns} rowKey="_key" size="small" pagination={false} scroll={{ x: 'max-content' }} rowClassName={(record, index) => (selectedFieldPath?.startsWith(`${path}.${index}`) ? 'selected-row' : '')} onRow={(record, index) => ({ onClick: () => { if (onSourceClick) onSourceClick(`${path}.${index}`, itemSchema, `记录 #${index + 1}`); }, style: { cursor: 'pointer' } })} />
        </div>
      )}
      <Modal title={editingIndex >= data.length ? '添加记录' : `编辑记录 #${editingIndex + 1}`} open={modalVisible} onCancel={() => { setModalVisible(false); setEditingRecord(null); }} onOk={handleSave} okText="保存" cancelText="取消" width={600} className="schema-edit-modal">
        <style>{scrollbarStyle}</style>
        <div className="schema-modal-scrollable" style={{ maxHeight: '60vh', overflowY: 'auto', overflowX: 'hidden', paddingRight: 8 }}>
          {itemSchema?.properties && Object.entries(itemSchema.properties).map(([fieldName, fieldSchema]) => {
            if (fieldSchema.type === 'array' || (fieldSchema.type === 'object' && fieldSchema.properties)) return null
            const fieldPath = `${path}.${editingIndex}.${fieldName}`
            return (
              <FieldRenderer key={fieldName} fieldName={fieldName} fieldSchema={fieldSchema} path={fieldPath} value={editingRecord?.[fieldName]} onChange={(value) => handleFieldChange(fieldName, value)} disabled={disabled} required={requiredFields.includes(fieldName)} onSourceClick={onSourceClick} isSelected={selectedFieldPath === fieldPath} />
            )
          })}
        </div>
      </Modal>
    </div>
  )
}

const RepeatableForm = ({ title, arraySchema, path, data = [], onDataChange, onSourceClick, selectedFieldPath, disabled = false, maxItems = 100, minItems = 0, defaultExpanded = true }) => {
  const { actions } = useSchemaForm()
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editingIndex, setEditingIndex] = useState(-1)
  const [editingRecord, setEditingRecord] = useState(null)
  const itemSchema = arraySchema?.items
  const normalizedData = useMemo(() => (Array.isArray(data) ? data : []), [data])
  const { columns } = useMemo(() => getTableColumns(itemSchema, (index, record) => { setEditingIndex(index); setEditingRecord({ ...record }); setEditModalVisible(true); }, (index) => { if (normalizedData.length <= minItems) return; const newData = [...normalizedData]; newData.splice(index, 1); onDataChange ? onDataChange(newData) : actions.updateFieldValue(path, newData); }, (index) => { if (normalizedData.length >= maxItems) return; const copiedRecord = JSON.parse(JSON.stringify(normalizedData[index])); const newData = [...normalizedData]; newData.splice(index + 1, 0, copiedRecord); onDataChange ? onDataChange(newData) : actions.updateFieldValue(path, newData); }, onSourceClick, disabled, path), [itemSchema, normalizedData, disabled, minItems, maxItems, onDataChange, actions, path, onSourceClick])
  const handleAdd = useCallback(() => { if (normalizedData.length >= maxItems) return; const newRecord = createEmptyRecord(itemSchema); setEditingIndex(normalizedData.length); setEditingRecord(newRecord); setEditModalVisible(true); }, [normalizedData.length, maxItems, itemSchema])
  const handleSaveEdit = useCallback((index, record) => { const newData = [...normalizedData]; if (index >= normalizedData.length) newData.push(record); else newData[index] = record; onDataChange ? onDataChange(newData) : actions.updateFieldValue(path, newData); setEditModalVisible(false); setEditingRecord(null); }, [normalizedData, path, onDataChange, actions])
  const tableData = useMemo(() => normalizedData.map((item, index) => ({ ...item, _rowKey: index })), [normalizedData])
  return (
    <Card size="small" className="repeatable-form-card" title={<Space><TableOutlined style={{ color: '#1890ff' }} /><Text strong>{title || '数据表'}</Text><Badge count={normalizedData.length} style={{ backgroundColor: normalizedData.length > 0 ? '#52c41a' : '#d9d9d9' }} /></Space>} extra={<Tooltip title="添加新记录"><Button type="text" size="small" icon={<PlusOutlined style={{ fontSize: 14 }} />} onClick={handleAdd} disabled={disabled || normalizedData.length >= maxItems} className="card-hover-action" style={{ color: '#1890ff', padding: '2px 6px', height: 'auto' }} /></Tooltip>} style={{ marginBottom: 16, borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
      {normalizedData.length === 0 ? (
        <div style={{ padding: 24 }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">暂无记录，点击"新增记录"添加</Text>}>
            <Button type="dashed" icon={<PlusOutlined />} onClick={handleAdd} disabled={disabled}>添加第一条记录</Button>
          </Empty>
        </div>
      ) : (
        <div className="schema-table-wrapper">
          <style>{scrollbarStyle}</style>
          <Table dataSource={tableData} columns={columns} rowKey="_rowKey" size="small" pagination={normalizedData.length > 10 ? { pageSize: 10, showSizeChanger: true } : false} scroll={{ x: 'max-content' }} style={{ margin: 0 }} rowClassName={(record) => (selectedFieldPath?.startsWith(`${path}.${record._rowKey}`) ? 'selected-row' : '')} onRow={(record) => ({ onClick: () => { if (onSourceClick) onSourceClick(`${path}.${record._rowKey}`, itemSchema, `记录 #${record._rowKey + 1}`); }, style: { cursor: 'pointer' } })} />
        </div>
      )}
      <RecordEditModal visible={editModalVisible} record={editingRecord} itemSchema={itemSchema} index={editingIndex} path={path} onSave={handleSaveEdit} onCancel={() => { setEditModalVisible(false); setEditingRecord(null); }} disabled={disabled} onSourceClick={onSourceClick} selectedFieldPath={selectedFieldPath} />
    </Card>
  )
}

export default RepeatableForm
export { createEmptyRecord, getRecordTitle, NestedTableViewer }
