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
  Modal
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  TableOutlined,
  EditOutlined,
  FileSearchOutlined
} from '@ant-design/icons'
import FieldRenderer from './FieldRenderer'
import { useSchemaForm, orderedPropertyEntries } from './SchemaFormContext'
import { appThemeToken } from '../../styles/themeTokens'

const { Text } = Typography

/**
 * 生成稳定行标识。
 * @returns {string}
 */
function createRowUid() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  return `row_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

/**
 * 确保重复行对象存在 `_row_uid`。
 * @param {Record<string, any>} record
 * @returns {Record<string, any>}
 */
function ensureRecordRowUid(record) {
  const target = (record && typeof record === 'object') ? record : {}
  const current = String(target._row_uid || '').trim()
  if (!current) {
    target._row_uid = createRowUid()
  }
  return target
}

function stripRecordIdentity(value) {
  if (Array.isArray(value)) return value.map((item) => stripRecordIdentity(item))
  if (!value || typeof value !== 'object') return value
  const output = {}
  for (const [key, child] of Object.entries(value)) {
    if (['_row_uid', '_record_instance_id', '_rowKey', '_key'].includes(key)) continue
    output[key] = stripRecordIdentity(child)
  }
  return output
}

function cloneRecordForInsert(record) {
  return { ...stripRecordIdentity(record), _row_uid: createRowUid() }
}

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
    background: rgb(217, 217, 217);
    border-radius: 2px;
  }
  .schema-modal-scrollable::-webkit-scrollbar-thumb:hover,
  .schema-table-wrapper .ant-table-body::-webkit-scrollbar-thumb:hover {
    background: rgb(191, 191, 191);
  }
  .schema-table-wrapper .ant-table-header::-webkit-scrollbar { height: 0; }
  .schema-table-wrapper .ant-table-row.selected-row > td { background: rgb(230, 244, 255) !important; }
  .schema-table-wrapper .ant-table-row.selected-row:hover > td { background: rgb(186, 224, 255) !important; }
  .schema-table-wrapper .ant-table-row:hover > td { background: rgb(250, 250, 250); }
  .schema-table-wrapper .row-actions { opacity: 0; transition: opacity 0.2s ease; }
  .schema-table-wrapper .ant-table-row:hover .row-actions { opacity: 1; }
  .repeatable-form-card .card-hover-action { opacity: 0; transition: opacity 0.2s ease; }
  .repeatable-form-card:hover .card-hover-action { opacity: 1; }
`

function getRecordTitle(record, itemSchema, index) {
  if (!record || !itemSchema?.properties) return `记录 ${index + 1}`
  for (const [key, fieldSchema] of orderedPropertyEntries(itemSchema.properties, itemSchema)) {
    if (fieldSchema['x-primary'] && record[key]) return record[key]
  }
  for (const [key, fieldSchema] of orderedPropertyEntries(itemSchema.properties, itemSchema)) {
    if (fieldSchema.type === 'string' && record[key])
      return record[key].length > 30 ? record[key].substring(0, 30) + '...' : record[key]
  }
  return `记录 ${index + 1}`
}

function createEmptyRecord(itemSchema) {
  if (!itemSchema?.properties) return {}
  const record = { _row_uid: createRowUid() }
  for (const [key, fieldSchema] of orderedPropertyEntries(itemSchema.properties, itemSchema)) {
    if (fieldSchema.type === 'array') record[key] = []
    else if (fieldSchema.type === 'object') record[key] = {}
    else if (fieldSchema.type === 'number') record[key] = null
    else record[key] = ''
  }
  return record
}


const CellWithSource = ({
  value,
  fieldSchema,
  fieldName,
  onSourceClick,
  path,
  rowUid = null,
  recordInstanceId = null,
  showIcon = true,
}) => {
  const displayValue = useMemo(() => {
    if (value === null || value === undefined || value === '') return <Text type="secondary">-</Text>
    if (typeof value === 'boolean') return value ? '是' : '否'
    return value
  }, [value])
  const handleTrace = useCallback((e) => {
    e.stopPropagation()
    if (onSourceClick) {
      onSourceClick(path, fieldSchema, fieldName, {
        forceOpen: true,
        trigger: 'source-icon',
        rowUid,
        recordInstanceId,
      })
    }
  }, [path, fieldSchema, fieldName, onSourceClick, rowUid, recordInstanceId])
  if (!showIcon) return <span>{displayValue}</span>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span>{displayValue}</span>
      <Tooltip title="查看溯源">
        <FileSearchOutlined
          style={{ fontSize: 12, color: appThemeToken.colorPrimary, cursor: 'pointer', flexShrink: 0 }}
          onClick={handleTrace}
        />
      </Tooltip>
    </span>
  )
}

function getTableColumns(itemSchema, onEdit, onDelete, onCopy, onRowSource, disabled, basePath, showCellIcons = true) {
  if (!itemSchema?.properties) return []
  const columns = []
  const nestedArrayFields = []
  for (const [fieldName, fieldSchema] of orderedPropertyEntries(itemSchema.properties, itemSchema)) {
    if (fieldSchema.type === 'array' && fieldSchema.items?.properties) {
      nestedArrayFields.push({ fieldName, fieldSchema })
    } else if (fieldSchema.type !== 'object' || !fieldSchema.properties) {
      columns.push({
        title: fieldName,
        dataIndex: fieldName,
        key: fieldName,
        ellipsis: true,
        width: 150,
        render: (value, record, index) => (
          <CellWithSource
            value={value}
            fieldSchema={fieldSchema}
            fieldName={fieldName}
            path={`${basePath}.${index}.${fieldName}`}
            rowUid={record?._row_uid || null}
            recordInstanceId={record?._record_instance_id || null}
            onSourceClick={onRowSource}
            showIcon={showCellIcons}
          />
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
            <Badge count={count} size="small" style={{ backgroundColor: count > 0 ? appThemeToken.colorSuccess : appThemeToken.colorTextTertiary }} />
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

const NestedObjectEditor = ({
  title,
  objectSchema,
  path,
  value = {},
  onChange,
  onSourceClick,
  selectedFieldPath,
  disabled = false
}) => {
  if (!objectSchema?.properties) return null
  const requiredFields = objectSchema.required || []
  return (
    <div style={{ marginTop: 12, padding: 12, background: appThemeToken.colorFillQuaternary, border: `1px solid ${appThemeToken.colorBorderSecondary}`, borderRadius: 6 }}>
      <Text strong style={{ display: 'block', marginBottom: 8 }}>{title}</Text>
      {orderedPropertyEntries(objectSchema.properties, objectSchema).map(([fieldName, fieldSchema]) => {
        const fieldPath = `${path}.${fieldName}`
        if (fieldSchema.type === 'array' && fieldSchema.items?.properties) {
          return (
            <NestedTableViewer
              key={fieldName}
              title={fieldName}
              arraySchema={fieldSchema}
              path={fieldPath}
              data={value?.[fieldName] || []}
              onDataChange={(newData) => onChange({ ...(value || {}), [fieldName]: newData })}
              onSourceClick={onSourceClick}
              selectedFieldPath={selectedFieldPath}
              disabled={disabled}
            />
          )
        }
        if (fieldSchema.type === 'object' && fieldSchema.properties) {
          return (
            <NestedObjectEditor
              key={fieldName}
              title={fieldName}
              objectSchema={fieldSchema}
              path={fieldPath}
              value={value?.[fieldName] || {}}
              onChange={(nextValue) => onChange({ ...(value || {}), [fieldName]: nextValue })}
              onSourceClick={onSourceClick}
              selectedFieldPath={selectedFieldPath}
              disabled={disabled}
            />
          )
        }
        return (
          <FieldRenderer
            key={fieldName}
            fieldName={fieldName}
            fieldSchema={fieldSchema}
            path={fieldPath}
            value={value?.[fieldName]}
            onChange={(next) => onChange({ ...(value || {}), [fieldName]: next })}
            disabled={disabled}
            required={requiredFields.includes(fieldName)}
            onSourceClick={onSourceClick}
            isSelected={selectedFieldPath === fieldPath}
            showSourceIcon={false}
          />
        )
      })}
    </div>
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
    for (const [fieldName, fieldSchema] of orderedPropertyEntries(itemSchema.properties, itemSchema)) {
      if (fieldSchema.type !== 'array' && fieldSchema.type !== 'object') {
        cols.push({
          title: fieldName,
          dataIndex: fieldName,
          key: fieldName,
          ellipsis: true,
          render: (value, _record, index) => (
            <CellWithSource
              value={value}
              fieldSchema={fieldSchema}
              fieldName={fieldName}
              path={`${path}.${index}.${fieldName}`}
              rowUid={_record?._row_uid || null}
              recordInstanceId={_record?._record_instance_id || null}
              onSourceClick={onSourceClick}
              showIcon={true}
            />
          )
        })
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
  }, [itemSchema, data, onDataChange, disabled, path, onSourceClick])
  const handleAdd = () => {
    const newRecord = ensureRecordRowUid(createEmptyRecord(itemSchema))
    setEditingIndex(data.length)
    setEditingRecord(newRecord)
    setModalVisible(true)
  }
  const handleSave = () => {
    const newData = [...data]
    const normalizedRecord = ensureRecordRowUid(editingRecord)
    if (editingIndex >= data.length) newData.push(normalizedRecord)
    else newData[editingIndex] = normalizedRecord
    onDataChange(newData)
    setModalVisible(false)
    setEditingRecord(null)
  }
  const handleFieldChange = (fieldName, value) => { setEditingRecord(prev => ({ ...prev, [fieldName]: value })) }
  const requiredFields = itemSchema?.required || []
  return (
    <div style={{ marginTop: 16, padding: 12, background: appThemeToken.colorFillTertiary, borderRadius: 6, border: `1px solid ${appThemeToken.colorBorder}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Space>
          <TableOutlined style={{ color: appThemeToken.colorPrimary }} />
          <Text strong>{title}</Text>
          <Badge count={data.length} size="small" style={{ backgroundColor: data.length > 0 ? appThemeToken.colorSuccess : appThemeToken.colorTextTertiary }} />
          <Tooltip title="查看溯源">
            <FileSearchOutlined
              style={{ fontSize: 14, color: appThemeToken.colorPrimary, cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation()
                if (onSourceClick) onSourceClick(path, arraySchema, title, { forceOpen: true, trigger: 'source-icon' })
              }}
            />
          </Tooltip>
        </Space>
        <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={handleAdd} disabled={disabled}>添加</Button>
      </div>
      {data.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" style={{ padding: '12px 0' }} />
      ) : (
        <div className="schema-table-wrapper">
          <Table
            dataSource={data.map((item, i) => ({ ...ensureRecordRowUid(item), _key: i }))}
            columns={columns}
            rowKey={(record) => record?._row_uid || record?._key}
            size="small"
            pagination={false}
            scroll={{ x: 'max-content' }}
            rowClassName={(record, index) => (selectedFieldPath?.startsWith(`${path}.${index}`) ? 'selected-row' : '')}
          />
        </div>
      )}
      <Modal title={editingIndex >= data.length ? '添加记录' : `编辑记录 #${editingIndex + 1}`} open={modalVisible} onCancel={() => { setModalVisible(false); setEditingRecord(null); }} onOk={handleSave} okText="保存" cancelText="取消" width={600} className="schema-edit-modal">
        <style>{scrollbarStyle}</style>
        <div className="schema-modal-scrollable" style={{ maxHeight: '60vh', overflowY: 'auto', overflowX: 'hidden', paddingRight: 8 }}>
          {itemSchema?.properties && orderedPropertyEntries(itemSchema.properties, itemSchema).map(([fieldName, fieldSchema]) => {
            const fieldPath = `${path}.${editingIndex}.${fieldName}`
            if (fieldSchema.type === 'array' && fieldSchema.items?.properties) {
              return (
                <NestedTableViewer
                  key={fieldName}
                  title={fieldName}
                  arraySchema={fieldSchema}
                  path={fieldPath}
                  data={editingRecord?.[fieldName] || []}
                  onDataChange={(newData) => handleFieldChange(fieldName, newData)}
                  onSourceClick={onSourceClick}
                  selectedFieldPath={selectedFieldPath}
                  disabled={disabled}
                />
              )
            }
            if (fieldSchema.type === 'object' && fieldSchema.properties) {
              return (
                <NestedObjectEditor
                  key={fieldName}
                  title={fieldName}
                  objectSchema={fieldSchema}
                  path={fieldPath}
                  value={editingRecord?.[fieldName] || {}}
                  onChange={(nextValue) => handleFieldChange(fieldName, nextValue)}
                  onSourceClick={onSourceClick}
                  selectedFieldPath={selectedFieldPath}
                  disabled={disabled}
                />
              )
            }
            return (
              <FieldRenderer key={fieldName} fieldName={fieldName} fieldSchema={fieldSchema} path={fieldPath} value={editingRecord?.[fieldName]} onChange={(value) => handleFieldChange(fieldName, value)} disabled={disabled} required={requiredFields.includes(fieldName)} onSourceClick={onSourceClick} isSelected={selectedFieldPath === fieldPath} showSourceIcon={false} />
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
