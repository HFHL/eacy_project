import React from 'react'
import { Typography } from 'antd'
import StructuredDataView from '../../../../../components/Common/StructuredDataView'
import { normalizeDisplayValue } from './ehrFieldLabels'
import { getArrayFieldLabel } from './extractedFieldUtils'

const { Text } = Typography

const LabItemsTable = ({ items }) => {
  if (!Array.isArray(items) || items.length === 0) {
    return <Text type="secondary">（无检验指标）</Text>
  }

  return (
    <table className="lab-items-table">
      <thead>
        <tr>
          <th>指标名称</th>
          <th>检测值</th>
          <th>单位</th>
          <th>参考范围</th>
          <th>异常</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => (
          <tr key={index} className={item.is_abnormal ? 'abnormal' : ''}>
            <td>{item.item_name || '-'}</td>
            <td>{item.value || '-'}</td>
            <td>{item.unit || '-'}</td>
            <td>{item.reference_range || '-'}</td>
            <td>{item.is_abnormal ? '↑↓' : '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const ArrayFieldRecordContent = ({ record }) => {
  const normalizedRecord = normalizeDisplayValue(record)

  if (normalizedRecord === undefined) {
    return <Text type="secondary" style={{ fontStyle: 'italic' }}>无可展示字段</Text>
  }

  if (typeof normalizedRecord !== 'object' || normalizedRecord === null) {
    return <Text>{String(normalizedRecord)}</Text>
  }

  const normalFields = []
  let itemsData = null

  Object.entries(normalizedRecord).forEach(([key, value]) => {
    if (key.startsWith('_')) return
    if (key === 'items' && Array.isArray(value)) {
      itemsData = value
    } else {
      normalFields.push({ key, value })
    }
  })

  return (
    <div>
      {normalFields.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            marginBottom: itemsData ? 16 : 0,
          }}
        >
          {normalFields.map(({ key, value }) => (
            <div key={key} style={{ marginBottom: 8 }}>
              <div style={{ marginBottom: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {getArrayFieldLabel(key)}
                </Text>
              </div>
              <div>
                {typeof value === 'object'
                  ? <StructuredDataView data={value} />
                  : <Text>{String(value)}</Text>}
              </div>
            </div>
          ))}
        </div>
      )}

      {itemsData && (
        <div>
          <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
            检验指标（共 {itemsData.length} 项）
          </Text>
          <LabItemsTable items={itemsData} />
        </div>
      )}
    </div>
  )
}

export const renderArrayRecordFields = (record) => (
  <ArrayFieldRecordContent record={record} />
)

export default ArrayFieldRecordContent
