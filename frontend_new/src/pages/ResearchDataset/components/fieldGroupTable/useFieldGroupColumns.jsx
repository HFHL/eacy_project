import React, { useMemo } from 'react'
import { Tooltip, Tag } from 'antd'

import { formatFieldValue, getScopedFieldRawValue } from '../cellRenderers'
import { buildNestedFieldNode } from '../../parsers/nestedFieldNodeParser'
import { resolveCrfCellPresentation } from '../../renderers/crfRenderRules'
import {
  buildColumnRawValue,
  toDebugPreview,
} from './fieldGroupValueBuilder'

const estimateColumnWidth = ({ title, key, group, sampleRows }) => {
  const minWidth = 80
  const maxWidth = 180
  let maxTextLength = String(title || '').length

  sampleRows.forEach((row) => {
    const rawValue = getScopedFieldRawValue(row, group?.group_id, key, {
      groupName: group?.group_name,
      groupPathTokens: group?.groupPathTokens,
      strictPathOnly: true,
    })
    const displayText = formatFieldValue(rawValue)
    maxTextLength = Math.max(maxTextLength, String(displayText || '').length)
  })

  const estimatedWidth = (maxTextLength * 12) + 28
  return Math.min(maxWidth, Math.max(minWidth, estimatedWidth))
}

const renderFieldValue = ({
  column,
  enableConsistencyDebug,
  group,
  onOpenNestedDetail,
  record,
}) => {
  const scopedResult = buildColumnRawValue({ record, column, group, includeSource: true })
  const rowScopedValue = scopedResult?.value
  const node = buildNestedFieldNode(rowScopedValue, {
    path: `${group?.group_id}.${column.key}`,
    label: column.title,
    schemaHints: column.schemaHints || null,
  })
  const presentation = resolveCrfCellPresentation({ rawValue: rowScopedValue, node })

  if (enableConsistencyDebug && presentation.mode === 'detail' && presentation.summaryText === '0 条') {
    console.warn('[FieldGroupTable] 0条专项诊断', {
      patientId: record?.patient_id || null,
      subjectId: record?.subject_id || null,
      groupId: group?.group_id || null,
      groupName: group?.group_name || null,
      columnKey: column?.key || null,
      columnTitle: column?.title || null,
      sourceFieldKeys: column?.sourceFieldKeys || [column?.key],
      scopedSource: scopedResult?.source || 'unknown',
      scopedDiagnostics: scopedResult?.diagnostics || null,
      valuePreview: toDebugPreview(rowScopedValue),
      nodeType: node?.nodeType || null,
      nodeRowCount: Number.isFinite(node?.rowCount) ? node.rowCount : null,
    })
  }

  if (presentation.mode === 'detail') {
    return (
      <Tag
        color="blue"
        style={{ cursor: 'pointer', marginInlineEnd: 0 }}
        onClick={() => onOpenNestedDetail?.({
          title: `${record?.subject_id || record?.name || '患者'} / ${group?.group_name} / ${column.title}`,
          node,
          schemaNode: column?.schemaNode || null,
          rawValue: rowScopedValue,
        })}
      >
        {presentation.summaryText}
      </Tag>
    )
  }

  return (
    <Tooltip title={formatFieldValue(rowScopedValue)}>
      <span>{presentation.displayText || formatFieldValue(rowScopedValue)}</span>
    </Tooltip>
  )
}

export function useFieldGroupColumns({
  enableConsistencyDebug,
  group,
  onOpenNestedDetail,
  patients,
}) {
  return useMemo(() => {
    const groupColumns = Array.isArray(group?.columns) ? group.columns : []
    const sampleRows = Array.isArray(patients) ? patients.slice(0, 20) : []

    return groupColumns.map((column) => ({
      title: (
        <Tooltip title={column.key}>
          <span>{column.title}</span>
        </Tooltip>
      ),
      key: column.key,
      dataIndex: column.key,
      width: estimateColumnWidth({ title: column.title, key: column.key, group, sampleRows }),
      ellipsis: true,
      render: (_unused, record) => renderFieldValue({
        column,
        enableConsistencyDebug,
        group,
        onOpenNestedDetail,
        record,
      }),
    }))
  }, [enableConsistencyDebug, group, onOpenNestedDetail, patients])
}
