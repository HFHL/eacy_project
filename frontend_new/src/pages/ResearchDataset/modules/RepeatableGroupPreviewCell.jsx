import React from 'react'
import { Tag, Tooltip } from 'antd'
import {
  formatAnyValueForText,
  isEmptyFieldValue,
  normalizeGroupForDisplay,
} from './groupDisplayModel'

const RepeatableTooltipContent = ({ displayModel, groupName }) => {
  if (displayModel.rowCount > 0) {
    return (
      <div style={{ maxWidth: 350, maxHeight: 300, overflow: 'auto' }}>
        <div style={{ fontWeight: 'bold', marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.3)', paddingBottom: 4 }}>
          {groupName} ({displayModel.rowCount} 条记录)
        </div>
        {displayModel.rows.map((rowItem, index) => (
          <div
            key={index}
            style={{
              marginBottom: index < displayModel.rows.length - 1 ? 8 : 0,
              paddingBottom: index < displayModel.rows.length - 1 ? 8 : 0,
              borderBottom: index < displayModel.rows.length - 1 ? '1px dashed rgba(255,255,255,0.2)' : 'none',
            }}
          >
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
              记录 #{index + 1}
            </div>
            {rowItem.cells.map((cell) => (
              <div key={cell.fieldPath} style={{ fontSize: 12, marginBottom: 2 }}>
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>{cell.fieldName}:</span>{' '}
                <span style={{ color: 'rgb(255, 255, 255)' }}>{formatAnyValueForText(cell.value)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (displayModel.scalarCells.some(cell => !isEmptyFieldValue(cell.value))) {
    return (
      <div style={{ maxWidth: 350, maxHeight: 300, overflow: 'auto' }}>
        <div style={{ fontWeight: 'bold', marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.3)', paddingBottom: 4 }}>
          {groupName}（标量字段）
        </div>
        {displayModel.scalarCells
          .filter(cell => !isEmptyFieldValue(cell.value))
          .slice(0, 12)
          .map((cell) => (
            <div key={cell.fieldPath} style={{ fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>{cell.fieldName}:</span>{' '}
              <span style={{ color: 'rgb(255, 255, 255)' }}>{formatAnyValueForText(cell.value)}</span>
            </div>
          ))}
        <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
          点击标签可查看该字段组详情
        </div>
      </div>
    )
  }

  return `${groupName}: 暂无数据`
}

const RepeatableGroupPreviewCell = ({
  group,
  groupData,
  onViewDetail,
  record,
  templateSchemaJson,
  token,
}) => {
  if (!groupData || !groupData.fields) {
    return <span style={{ color: token.colorTextSecondary }}>-</span>
  }

  const displayModel = normalizeGroupForDisplay(groupData, group, templateSchemaJson)
  return (
    <Tooltip
      title={<RepeatableTooltipContent displayModel={displayModel} groupName={group.group_name} />}
      overlayStyle={{ maxWidth: 400 }}
      placement="left"
    >
      <Tag
        color={displayModel.hasData ? 'blue' : 'default'}
        style={{ cursor: 'pointer', display: 'inline-block', maxWidth: 300, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '18px' }}
        onClick={() => onViewDetail(record, group.group_name, groupData)}
      >
        {displayModel.previewText || '暂无数据'}
      </Tag>
    </Tooltip>
  )
}

export default RepeatableGroupPreviewCell
