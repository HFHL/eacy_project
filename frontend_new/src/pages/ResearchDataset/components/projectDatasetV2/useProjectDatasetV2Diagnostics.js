import { useEffect } from 'react'
import { getScopedFieldRawValue } from '../cellRenderers'
import {
  PROJECT_DATASET_GROUP_MATCH_MODE,
} from '../../config/datasetContract'
import { readFieldValueFromGroupFields } from './groupFieldReader'
import { getActiveGroupSourceFieldKeys, normalizeSlashPath } from './groupPathUtils'

const getGroupMap = (patient) => (
  patient?.crf_data?.groups && typeof patient.crf_data.groups === 'object'
    ? patient.crf_data.groups
    : {}
)

export function useProjectDatasetV2Diagnostics({
  activeGroup,
  enableConsistencyDebug,
  enableLegacyGroupFallback,
  groupMatchMode,
  rowIndexByPatientId,
  visiblePatientRenderRows,
  visiblePatients,
}) {
  useEffect(() => {
    if (!enableConsistencyDebug) return
    const leftIds = visiblePatients.map((patient) => patient.patient_id)
    const missingIds = leftIds.filter((patientId) => !rowIndexByPatientId.has(patientId))
    if (missingIds.length > 0) {
      console.warn('[ProjectDatasetV2] rowIndexByPatientId 缺失映射', {
        missingIds,
        leftIds,
      })
    }
  }, [enableConsistencyDebug, rowIndexByPatientId, visiblePatients])

  useEffect(() => {
    if (groupMatchMode !== PROJECT_DATASET_GROUP_MATCH_MODE.COMPATIBLE) return
    if (!import.meta?.env?.DEV) return
    if (!enableConsistencyDebug) return
    console.warn('[ProjectDatasetV2] 当前处于兼容匹配模式（legacy fallback 开启）', {
      groupMatchMode,
      rollbackHint: 'set groupMatchMode=strict to enforce contract-first matching',
    })
  }, [enableConsistencyDebug, groupMatchMode])

  useEffect(() => {
    if (!enableConsistencyDebug || !activeGroup) return
    const activeFieldPaths = getActiveGroupSourceFieldKeys(activeGroup)
    const patientRows = Array.isArray(visiblePatients) ? visiblePatients : []
    const preferredGroupKeys = new Set([
      activeGroup?.group_id,
      activeGroup?.groupPath,
      activeGroup?.repeatableDataPath,
    ].map((key) => normalizeSlashPath(key)).filter(Boolean))
    const normalizedFolderName = normalizeSlashPath(activeGroup?.folderName)
    const isRepeatableGroup = Boolean(activeGroup?.groupRenderMeta?.isRepeatable)

    let resolvedGroupHitCount = 0
    let strictGroupKeyHitCount = 0
    let folderFallbackHitCount = 0
    let strictMissCount = 0
    let shapeMatchedCount = 0
    let rowExpansionMismatchCount = 0
    const mismatchPatientSamples = []
    const contractKeyStyleStats = {
      secStyleKeyPatients: 0,
      folderOnlyKeyPatients: 0,
      pathStyleKeyPatients: 0,
      mixedKeyPatients: 0,
      emptyGroupMapPatients: 0,
    }

    const expandedPatientCount = patientRows.filter((patient) => {
      return visiblePatientRenderRows.some((row) => row?.patient_id === patient?.patient_id && Number(row?.__groupRowCount) > 1)
    }).length

    patientRows.forEach((patient) => {
      const patientRenderRows = visiblePatientRenderRows.filter((row) => row?.patient_id === patient?.patient_id)
      const firstResolvedRow = patientRenderRows[0] || null
      const groupMap = getGroupMap(patient)
      const availableKeys = Object.keys(groupMap)
      const hasSecStyleKey = availableKeys.some((rawKey) => /^sec_[a-z0-9]+$/i.test(String(rawKey || '')))
      const hasPathStyleKey = availableKeys.some((rawKey) => String(rawKey || '').includes('/'))
      const hasFolderStyleKey = availableKeys.some((rawKey) => !String(rawKey || '').includes('/') && !/^sec_[a-z0-9]+$/i.test(String(rawKey || '')))

      if (availableKeys.length === 0) {
        contractKeyStyleStats.emptyGroupMapPatients += 1
      } else {
        const activeStyleCount = [hasSecStyleKey, hasPathStyleKey, hasFolderStyleKey].filter(Boolean).length
        if (activeStyleCount > 1) contractKeyStyleStats.mixedKeyPatients += 1
        else if (hasSecStyleKey) contractKeyStyleStats.secStyleKeyPatients += 1
        else if (hasPathStyleKey) contractKeyStyleStats.pathStyleKeyPatients += 1
        else if (hasFolderStyleKey) contractKeyStyleStats.folderOnlyKeyPatients += 1
      }

      const groupNode = firstResolvedRow?.__resolvedGroupNode || null
      const matchedGroupKeyRaw = firstResolvedRow?.__resolvedGroupKey || null
      const matchedCandidateKeyRaw = firstResolvedRow?.__resolvedCandidateKey || null
      const matchedModeRaw = firstResolvedRow?.__resolvedMatchMode || 'missing'
      if ((Number(firstResolvedRow?.__groupRowCount) || 1) !== patientRenderRows.length) {
        rowExpansionMismatchCount += 1
      }
      const matchedGroupKey = normalizeSlashPath(matchedGroupKeyRaw)
      if (groupNode) {
        resolvedGroupHitCount += 1
        if (preferredGroupKeys.has(matchedGroupKey)) strictGroupKeyHitCount += 1
        if (normalizedFolderName && matchedGroupKey === normalizedFolderName) folderFallbackHitCount += 1
      } else if (matchedModeRaw === 'strict-miss') {
        strictMissCount += 1
      }

      const isStrictHit = preferredGroupKeys.has(matchedGroupKey)
      const isFolderFallback = normalizedFolderName && matchedGroupKey === normalizedFolderName
      if (mismatchPatientSamples.length < 5 && (!isStrictHit || !groupNode || isFolderFallback)) {
        mismatchPatientSamples.push({
          patientId: patient?.patient_id,
          matchedGroupKey: matchedGroupKeyRaw,
          matchedCandidateKey: matchedCandidateKeyRaw,
          matchedMode: matchedModeRaw,
          candidateKeys: firstResolvedRow?.__groupMatchMeta?.candidateKeys || [],
          availableGroupKeys: Object.keys(groupMap),
          isStrictHit,
          isFolderFallback: Boolean(isFolderFallback),
        })
      }

      if (groupNode && typeof groupNode === 'object') {
        if (Array.isArray(groupNode.records) && groupNode.records.length > 0) {
          shapeMatchedCount += 1
        } else {
          const fields = groupNode?.fields && typeof groupNode.fields === 'object' ? groupNode.fields : {}
          const hasAnyField = activeFieldPaths.some((fieldPath) => {
            const rawValue = readFieldValueFromGroupFields(fields, fieldPath, activeGroup)
            return rawValue !== null && rawValue !== undefined && rawValue !== ''
          })
          if (hasAnyField) shapeMatchedCount += 1
        }
      }
    })

    const complexColumns = (Array.isArray(activeGroup.columns) ? activeGroup.columns : []).filter((column) => column?.nodeKind !== 'scalar')
    let nonEmptyComplexCellCount = 0
    let totalComplexCellCount = 0
    patientRows.forEach((patient) => {
      complexColumns.forEach((column) => {
        totalComplexCellCount += 1
        const sourceFieldKey = Array.isArray(column?.sourceFieldKeys) && column.sourceFieldKeys.length > 0
          ? column.sourceFieldKeys[0]
          : column?.key
        const rawValue = getScopedFieldRawValue(patient, activeGroup?.group_id, sourceFieldKey, {
          groupName: activeGroup?.group_name,
          groupPathTokens: activeGroup?.groupPathTokens,
          strictPathOnly: true,
        })
        if (rawValue !== null && rawValue !== undefined && rawValue !== '') {
          nonEmptyComplexCellCount += 1
        }
      })
    })

    const ratio = (count) => (patientRows.length > 0 ? Number((count / patientRows.length).toFixed(4)) : 1)
    const nestedTableNonEmptyRate = totalComplexCellCount > 0 ? Number((nonEmptyComplexCellCount / totalComplexCellCount).toFixed(4)) : 1
    const repeatableGroupHitRate = isRepeatableGroup && patientRows.length > 0 ? Number((expandedPatientCount / patientRows.length).toFixed(4)) : 1
    const strictGroupKeyHitRate = ratio(strictGroupKeyHitCount)
    const folderFallbackHitRate = patientRows.length > 0 ? Number((folderFallbackHitCount / patientRows.length).toFixed(4)) : 0

    console.info('[ProjectDatasetV2] 渲染链路门禁指标', {
      activeGroupId: activeGroup?.group_id,
      activeGroupName: activeGroup?.group_name,
      groupMatchMode,
      enableLegacyGroupFallback,
      fallbackModeActive: enableLegacyGroupFallback,
      isRepeatableGroup,
      patientCount: patientRows.length,
      expandedPatientCount,
      repeatableGroupHitRate,
      rowExpansionMismatchCount,
      nestedTableNonEmptyRate,
      resolvedGroupKeyHitRate: ratio(resolvedGroupHitCount),
      strictGroupKeyHitRate,
      folderFallbackHitRate,
      strictMissCount,
      groupNodeShapeHitRate: ratio(shapeMatchedCount),
      contractKeyStyleStats,
    })

    if (strictGroupKeyHitRate < 1 || folderFallbackHitRate > 0) {
      console.warn('[ProjectDatasetV2] 组键命中异常样本', {
        activeGroupId: activeGroup?.group_id,
        activeGroupName: activeGroup?.group_name,
        strictGroupKeyHitRate,
        folderFallbackHitRate,
        mismatchPatientSamples,
      })
    }
  }, [activeGroup, enableConsistencyDebug, enableLegacyGroupFallback, groupMatchMode, visiblePatientRenderRows, visiblePatients])

  useEffect(() => {
    if (!enableConsistencyDebug || !activeGroup || !Array.isArray(activeGroup.columns)) return
    const targetColumns = activeGroup.columns.filter((column) => {
      const title = String(column?.title || '')
      return title.includes('基因突变详情') || title.includes('胚系突变详情')
    })
    if (targetColumns.length === 0) return
    console.info('[ProjectDatasetV2] 突变详情列定义对照', targetColumns.map((column) => ({
      key: column?.key || null,
      title: column?.title || null,
      sourceFieldKeyCount: Array.isArray(column?.sourceFieldKeys) ? column.sourceFieldKeys.length : 0,
      sourceFieldKeys: column?.sourceFieldKeys || [],
      nodeKind: column?.nodeKind || null,
      schemaNodeKind: column?.schemaNodeKind || null,
      legacyNodeKind: column?.legacyNodeKind || null,
      schemaResolved: Boolean(column?.schemaResolved),
    })))
  }, [activeGroup, enableConsistencyDebug])
}
