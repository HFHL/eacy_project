import React, { useCallback, useMemo } from 'react'
import { Tooltip, Typography } from 'antd'
import { FileSearchOutlined } from '@ant-design/icons'
import { appThemeToken } from '../../../styles/themeTokens'

const { Text } = Typography

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

  const handleTrace = useCallback((event) => {
    event.stopPropagation()
    if (onSourceClick) {
      onSourceClick(path, fieldSchema, fieldName, {
        forceOpen: true,
        trigger: 'source-icon',
        rowUid,
        recordInstanceId,
      })
    }
  }, [fieldName, fieldSchema, onSourceClick, path, recordInstanceId, rowUid])

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

export default CellWithSource
