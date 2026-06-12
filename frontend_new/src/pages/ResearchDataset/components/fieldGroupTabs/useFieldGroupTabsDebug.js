import { useEffect } from 'react'

const normalizeSlashPath = (rawPath) => (
  String(rawPath || '')
    .normalize('NFKC')
    .replace(/\s*\/\s*/g, '/')
    .trim()
)

const readScopedValue = (groupRecord, fieldPath) => {
  if (!groupRecord || typeof groupRecord !== 'object') return null

  const normalizedFieldPath = normalizeSlashPath(fieldPath)
  const pathSegments = normalizedFieldPath.split('/').filter(Boolean)
  const pathCandidates = [normalizedFieldPath]
  if (pathSegments.length > 1) {
    pathCandidates.push(pathSegments.slice(1).join('/'))
  }

  const entries = Object.entries(groupRecord)
  for (const pathKey of pathCandidates) {
    const matched = entries.find(([rawKey]) => normalizeSlashPath(rawKey) === pathKey)
    if (!matched) continue

    const rawValue = matched[1]
    if (rawValue && typeof rawValue === 'object' && Object.prototype.hasOwnProperty.call(rawValue, 'value')) {
      return rawValue.value
    }
    return rawValue
  }
  return null
}

export const useFieldGroupTabsDebug = ({
  activeFolderKey,
  currentGroup,
  enableConsistencyDebug,
  rightRenderPatients,
  useSchemaKernelDrawer,
  visiblePatientIds,
}) => {
  useEffect(() => {
    if (!enableConsistencyDebug) return
    const rightIds = rightRenderPatients.map((patient) => patient?.patient_id).filter(Boolean)
    const missingInRight = visiblePatientIds.filter((patientId) => !rightIds.includes(patientId))
    const extraInRight = rightIds.filter((patientId) => !visiblePatientIds.includes(patientId))

    console.info('[FieldGroupTabs] 右侧渲染摘要', {
      activeGroupKey: currentGroup?.group_id || null,
      activeFolderKey,
      renderMode: rightRenderPatients.length === 1 ? 'single-patient-cards' : 'multi-patient-table',
      leftVisibleCount: visiblePatientIds.length,
      rightRenderCount: rightIds.length,
      rightIdsSample: rightIds.slice(0, 10),
    })

    if (missingInRight.length > 0 || extraInRight.length > 0) {
      console.warn('[FieldGroupTabs] 左右患者集合不一致', {
        missingInRight,
        extraInRight,
        leftIds: visiblePatientIds,
        rightIds,
      })
    }
  }, [activeFolderKey, currentGroup?.group_id, enableConsistencyDebug, rightRenderPatients, visiblePatientIds])

  useEffect(() => {
    if (!enableConsistencyDebug || !currentGroup) return
    const columns = Array.isArray(currentGroup.columns) ? currentGroup.columns : []
    const legacyScalarCount = columns.filter((column) => column?.legacyNodeKind === 'scalar').length
    const schemaScalarCount = columns.filter((column) => column?.schemaNodeKind === 'scalar').length
    const unresolvedColumns = columns
      .filter((column) => !column?.schemaResolved)
      .map((column) => column?.key)
      .filter(Boolean)

    console.info('[FieldGroupTabs] 影子并跑结构诊断', {
      groupId: currentGroup.group_id,
      groupName: currentGroup.group_name,
      legacyScalarCount,
      schemaScalarCount,
      unresolvedColumnCount: unresolvedColumns.length,
      unresolvedColumns: unresolvedColumns.slice(0, 20),
      schemaShadowMetrics: currentGroup.schemaShadowMetrics || null,
      useSchemaKernelDrawer,
    })
  }, [currentGroup, enableConsistencyDebug, useSchemaKernelDrawer])

  useEffect(() => {
    if (!enableConsistencyDebug || !currentGroup) return
    const renderedRows = Array.isArray(rightRenderPatients) ? rightRenderPatients : []
    const columns = Array.isArray(currentGroup.columns) ? currentGroup.columns : []
    const complexColumns = columns.filter((column) => column?.nodeKind !== 'scalar')
    let totalChecks = 0
    let nonEmptyChecks = 0

    renderedRows.forEach((row) => {
      complexColumns.forEach((column) => {
        totalChecks += 1
        const sourceFieldKey = Array.isArray(column?.sourceFieldKeys) && column.sourceFieldKeys.length > 0
          ? column.sourceFieldKeys[0]
          : column?.key
        const value = readScopedValue(row?.__activeGroupRecord || null, sourceFieldKey)
        if (value !== null && value !== undefined && value !== '') {
          nonEmptyChecks += 1
        }
      })
    })

    const nestedTableNonEmptyRate = totalChecks > 0
      ? Number((nonEmptyChecks / totalChecks).toFixed(4))
      : 1

    console.info('[FieldGroupTabs] 右侧渲染门禁指标', {
      groupId: currentGroup?.group_id,
      groupName: currentGroup?.group_name,
      renderRows: renderedRows.length,
      complexColumnCount: complexColumns.length,
      nestedTableNonEmptyRate,
    })
  }, [currentGroup, enableConsistencyDebug, rightRenderPatients])
}
