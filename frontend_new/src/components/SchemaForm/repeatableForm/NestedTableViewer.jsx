import React, { useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Empty,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tooltip,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  FileSearchOutlined,
  PlusOutlined,
  TableOutlined,
} from '@ant-design/icons'
import FieldRenderer from '../FieldRenderer'
import { orderedPropertyEntries } from '../SchemaFormContext'
import { appThemeToken } from '../../../styles/themeTokens'
import CellWithSource from './CellWithSource'
import { scrollbarStyle } from './repeatableFormStyles'
import { createEmptyRecord, ensureRecordRowUid } from './repeatableRecordUtils'

const { Text } = Typography

const NestedObjectEditor = ({
  title,
  objectSchema,
  path,
  value = {},
  onChange,
  onSourceClick,
  selectedFieldPath,
  disabled = false,
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

const NestedTableViewer = ({
  title,
  arraySchema,
  path,
  data = [],
  onDataChange,
  onSourceClick,
  selectedFieldPath,
  disabled = false,
}) => {
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
          render: (value, record, index) => (
            <CellWithSource
              value={value}
              fieldSchema={fieldSchema}
              fieldName={fieldName}
              path={`${path}.${index}.${fieldName}`}
              rowUid={record?._row_uid || null}
              recordInstanceId={record?._record_instance_id || null}
              onSourceClick={onSourceClick}
              showIcon
            />
          ),
        })
      }
    }

    cols.push({
      title: '操作',
      key: '_action',
      width: 80,
      render: (_, record, index) => (
        <Space size="small">
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditingIndex(index); setEditingRecord({ ...record }); setModalVisible(true) }} disabled={disabled} />
          <Popconfirm title="确定删除？" onConfirm={() => { const newData = [...data]; newData.splice(index, 1); onDataChange(newData) }}>
            <Button type="text" size="small" icon={<DeleteOutlined />} danger disabled={disabled} />
          </Popconfirm>
        </Space>
      ),
    })

    return cols
  }, [data, disabled, itemSchema, onDataChange, onSourceClick, path])

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

  const handleFieldChange = (fieldName, value) => {
    setEditingRecord((previous) => ({ ...previous, [fieldName]: value }))
  }

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
              onClick={(event) => {
                event.stopPropagation()
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
            dataSource={data.map((item, index) => ({ ...ensureRecordRowUid(item), _key: index }))}
            columns={columns}
            rowKey={(record) => record?._row_uid || record?._key}
            size="small"
            pagination={false}
            scroll={{ x: 'max-content' }}
            rowClassName={(record, index) => (selectedFieldPath?.startsWith(`${path}.${index}`) ? 'selected-row' : '')}
          />
        </div>
      )}

      <Modal title={editingIndex >= data.length ? '添加记录' : `编辑记录 #${editingIndex + 1}`} open={modalVisible} onCancel={() => { setModalVisible(false); setEditingRecord(null) }} onOk={handleSave} okText="保存" cancelText="取消" width={600} className="schema-edit-modal">
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
              <FieldRenderer
                key={fieldName}
                fieldName={fieldName}
                fieldSchema={fieldSchema}
                path={fieldPath}
                value={editingRecord?.[fieldName]}
                onChange={(value) => handleFieldChange(fieldName, value)}
                disabled={disabled}
                required={requiredFields.includes(fieldName)}
                onSourceClick={onSourceClick}
                isSelected={selectedFieldPath === fieldPath}
                showSourceIcon={false}
              />
            )
          })}
        </div>
      </Modal>
    </div>
  )
}

export default NestedTableViewer
