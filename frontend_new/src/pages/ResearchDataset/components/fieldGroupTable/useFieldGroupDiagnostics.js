import { useEffect } from 'react'

import { buildColumnRawValue } from './fieldGroupValueBuilder'

const buildPatientStructureSamples = (patientRows) => {
  return patientRows.slice(0, 3).map((patient) => {
    const crfData = patient?.crf_data && typeof patient.crf_data === 'object' ? patient.crf_data : {}
    const groups = crfData?.groups && typeof crfData.groups === 'object' ? crfData.groups : {}
    const dataRoot = crfData?.data && typeof crfData.data === 'object' ? crfData.data : {}
    return {
      patientId: patient?.patient_id,
      crfDataTopKeys: Object.keys(crfData),
      groupIds: Object.keys(groups),
      resolvedGroupKey: patient?.__resolvedGroupKey || patient?.__groupMatchMeta?.matchedGroupKey || null,
      resolvedMatchMode: patient?.__resolvedMatchMode || patient?.__groupMatchMeta?.matchedMode || null,
      dataTopKeys: Object.keys(dataRoot),
      hasCrfData: Object.keys(crfData).length > 0,
    }
  })
}

const collectActualFields = (patientRows) => {
  const allGroupIds = new Set()
  const actualFieldSet = new Set()
  const actualFieldLeafSet = new Set()
  const patientsWithoutGroup = []
  const firstRowsByPatient = new Map()
  patientRows.forEach((row) => {
    const patientId = row?.patient_id
    if (!patientId || firstRowsByPatient.has(patientId)) return
    firstRowsByPatient.set(patientId, row)
  })

  firstRowsByPatient.forEach((row, patientId) => {
    const resolvedGroupNode = row?.__resolvedGroupNode || row?.__groupMatchMeta?.groupNode
    const resolvedGroupKey = row?.__resolvedGroupKey || row?.__groupMatchMeta?.matchedGroupKey
    if (resolvedGroupKey) allGroupIds.add(String(resolvedGroupKey))
    if (!resolvedGroupNode) {
      patientsWithoutGroup.push(patientId)
      return
    }
    const fields = resolvedGroupNode?.fields && typeof resolvedGroupNode.fields === 'object' ? resolvedGroupNode.fields : {}
    Object.keys(fields).forEach((fieldKey) => {
      actualFieldSet.add(fieldKey)
      actualFieldLeafSet.add(String(fieldKey).split('/').pop())
    })
  })

  return { actualFieldLeafSet, actualFieldSet, allGroupIds, patientsWithoutGroup }
}

const collectCellDiagnostics = ({ group, groupColumns, patientRows }) => {
  let nonEmptyCellCount = 0
  const sourceCounters = { groupRecord: 0, groupFields: 0, patientArray: 0, patientScalar: 0, empty: 0 }
  const fallbackCounters = { fallbackUsed: 0, fallbackStages: {} }

  patientRows.forEach((patient) => {
    groupColumns.forEach((column) => {
      const scopedResult = buildColumnRawValue({ record: patient, column, group, includeSource: true })
      const rowScopedValue = scopedResult?.value
      const valueSource = scopedResult?.source || 'empty'
      const diagnostics = scopedResult?.diagnostics || null
      sourceCounters[valueSource] = (sourceCounters[valueSource] || 0) + 1
      if (diagnostics?.fallbackUsed) {
        fallbackCounters.fallbackUsed += 1
        const stage = diagnostics?.fallbackStage || 'unknown'
        fallbackCounters.fallbackStages[stage] = (fallbackCounters.fallbackStages[stage] || 0) + 1
      }
      if (rowScopedValue !== null && rowScopedValue !== undefined && rowScopedValue !== '') {
        nonEmptyCellCount += 1
      }
    })
  })

  return { fallbackCounters, nonEmptyCellCount, sourceCounters }
}

export function useFieldGroupDiagnostics({ enableConsistencyDebug, group, patients }) {
  useEffect(() => {
    if (!enableConsistencyDebug || !group?.group_id) return
    const patientRows = Array.isArray(patients) ? patients : []
    if (patientRows.length === 0) {
      console.info('[FieldGroupTable] 右侧表格诊断摘要', {
        groupId: group.group_id,
        patientCount: 0,
        reason: 'no-patients',
      })
      return
    }

    const expectedGroupId = String(group.group_id)
    const groupColumns = Array.isArray(group.columns) ? group.columns : []
    const expectedFields = groupColumns.map((column) => String(column?.key || '')).filter(Boolean)
    const expectedFieldSet = new Set(expectedFields)
    const expectedFieldLeafSet = new Set(expectedFields.map((fieldKey) => fieldKey.split('/').pop()))
    const { actualFieldLeafSet, actualFieldSet, allGroupIds, patientsWithoutGroup } = collectActualFields(patientRows)
    const { fallbackCounters, nonEmptyCellCount, sourceCounters } = collectCellDiagnostics({ group, groupColumns, patientRows })
    const missingGroup = !allGroupIds.has(expectedGroupId)
    const missingFieldsExact = expectedFields.filter((fieldKey) => !actualFieldSet.has(fieldKey))
    const extraFieldsExact = [...actualFieldSet].filter((fieldKey) => !expectedFieldSet.has(fieldKey))
    const missingFieldsByLeaf = expectedFields.filter((fieldKey) => !actualFieldLeafSet.has(fieldKey.split('/').pop()))
    const extraFieldsByLeaf = [...actualFieldSet].filter((fieldKey) => !expectedFieldLeafSet.has(String(fieldKey).split('/').pop()))
    const totalCellCount = Math.max(1, Object.values(sourceCounters).reduce((count, value) => count + value, 0))

    console.info('[FieldGroupTable] 右侧表格诊断摘要', {
      groupId: expectedGroupId,
      patientCount: patientRows.length,
      expectedFieldCount: expectedFields.length,
      actualFieldCount: actualFieldSet.size,
      nonEmptyCellCount,
      cellValueSourceRate: {
        groupRecord: Number((sourceCounters.groupRecord / totalCellCount).toFixed(4)),
        groupFields: Number((sourceCounters.groupFields / totalCellCount).toFixed(4)),
        patientArray: Number((sourceCounters.patientArray / totalCellCount).toFixed(4)),
        patientScalar: Number((sourceCounters.patientScalar / totalCellCount).toFixed(4)),
        empty: Number((sourceCounters.empty / totalCellCount).toFixed(4)),
      },
      fallbackUsedRate: Number((fallbackCounters.fallbackUsed / totalCellCount).toFixed(4)),
      fallbackStages: fallbackCounters.fallbackStages,
    })

    if (missingGroup || missingFieldsExact.length > 0 || extraFieldsExact.length > 0 || nonEmptyCellCount === 0) {
      console.warn('[FieldGroupTable] 右侧真实数据对齐诊断', {
        groupId: expectedGroupId,
        patientCount: patientRows.length,
        missingGroup,
        patientsWithoutGroup: patientsWithoutGroup.slice(0, 20),
        expectedFields,
        actualFields: [...actualFieldSet],
        missingFieldsExact,
        extraFieldsExact,
        missingFieldsByLeaf,
        extraFieldsByLeaf,
        nonEmptyCellCount,
        patientStructureSamples: buildPatientStructureSamples(patientRows),
        sourceCounters,
        fallbackCounters,
      })
    }
  }, [enableConsistencyDebug, group, patients])
}
