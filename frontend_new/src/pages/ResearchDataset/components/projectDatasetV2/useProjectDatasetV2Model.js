import { useMemo, useState } from 'react'
import {
  PROJECT_DATASET_GROUP_MATCH_MODE,
  resolveProjectDatasetGroupMatchMode,
} from '../../config/datasetContract'
import { resolveActiveGroupMatch } from './groupMatchResolver'
import { resolvePatientActiveGroupContext } from './groupRecords'

const resolveConsistencyDebugFlag = () => {
  const defaultFlag = Boolean(import.meta?.env?.DEV)
  if (typeof window === 'undefined') return defaultFlag

  const queryValue = new URLSearchParams(window.location.search).get('debugV2')
  if (queryValue === '1' || queryValue === 'true') return true
  if (queryValue === '0' || queryValue === 'false') return false

  const storageValue = window.localStorage?.getItem('projectDatasetV2Debug')
  if (storageValue === 'true') return true
  if (storageValue === 'false') return false

  return defaultFlag
}

export function useProjectDatasetV2Model({
  activeGroupKey,
  fieldGroups,
  onToggleSelectPatient,
  patients,
  selectedPatientIds,
}) {
  const [keyword, setKeyword] = useState('')
  const [completenessFilter, setCompletenessFilter] = useState('all')
  const [enableConsistencyDebug] = useState(resolveConsistencyDebugFlag)
  const [groupMatchMode] = useState(resolveProjectDatasetGroupMatchMode)
  const enableLegacyGroupFallback = groupMatchMode === PROJECT_DATASET_GROUP_MATCH_MODE.COMPATIBLE

  const visiblePatients = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    return (patients || []).filter((patient) => {
      if (completenessFilter === 'high' && (Number(patient.overallCompleteness) || 0) < 0.9) return false
      if (completenessFilter === 'middle') {
        const value = Number(patient.overallCompleteness) || 0
        if (value < 0.6 || value >= 0.9) return false
      }
      if (completenessFilter === 'low' && (Number(patient.overallCompleteness) || 0) >= 0.6) return false
      if (!normalizedKeyword) return true
      const subjectId = String(patient.subject_id || '').toLowerCase()
      const name = String(patient.name || '').toLowerCase()
      return subjectId.includes(normalizedKeyword) || name.includes(normalizedKeyword)
    })
  }, [completenessFilter, keyword, patients])

  const visiblePatientIds = useMemo(() => {
    return visiblePatients.map((patient) => patient.patient_id).filter(Boolean)
  }, [visiblePatients])

  const activeGroup = useMemo(() => {
    const groupList = Array.isArray(fieldGroups) ? fieldGroups : []
    return groupList.find((group) => group.group_id === activeGroupKey) || groupList[0] || null
  }, [activeGroupKey, fieldGroups])

  const visiblePatientRenderRows = useMemo(() => {
    return visiblePatients.flatMap((patient) => {
      const {
        groupMatch,
        groupNode,
        groupRecords,
        groupRowCount,
      } = resolvePatientActiveGroupContext({
        activeGroup,
        enableLegacyGroupFallback,
        patient,
        resolveActiveGroupMatch,
      })
      if (enableConsistencyDebug) {
        console.info('[ProjectDatasetV2] 组级行数估算', {
          patientId: patient?.patient_id,
          activeGroupId: activeGroup?.group_id,
          matchedGroupKey: groupMatch?.matchedGroupKey,
          matchedCandidateKey: groupMatch?.matchedCandidateKey,
          matchedMode: groupMatch?.matchedMode,
          isRepeatableGroup: Boolean(activeGroup?.groupRenderMeta?.isRepeatable),
          resolvedRowCount: groupRowCount,
        })
      }
      return Array.from({ length: groupRowCount }, (_unused, groupRowIndex) => ({
        ...patient,
        __groupRowIndex: groupRowIndex,
        __groupRowCount: groupRowCount,
        __activeGroupRecord: groupRecords[groupRowIndex] || null,
        __groupMatchMeta: groupMatch,
        __resolvedGroupNode: groupNode,
        __resolvedGroupKey: groupMatch?.matchedGroupKey || null,
        __resolvedCandidateKey: groupMatch?.matchedCandidateKey || null,
        __resolvedMatchMode: groupMatch?.matchedMode || 'missing',
        __rowKey: `${patient.patient_id}__${groupRowIndex}`,
      }))
    })
  }, [activeGroup, enableConsistencyDebug, enableLegacyGroupFallback, visiblePatients])

  const rowIndexByPatientId = useMemo(() => {
    const indexMap = new Map()
    visiblePatientIds.forEach((patientId, index) => {
      indexMap.set(patientId, index)
    })
    return indexMap
  }, [visiblePatientIds])

  const isAllVisibleSelected = visiblePatients.length > 0
    && visiblePatients.every((patient) => selectedPatientIds.includes(patient.patient_id))
  const isSomeVisibleSelected = visiblePatients.some((patient) => selectedPatientIds.includes(patient.patient_id))
    && !isAllVisibleSelected

  const handleToggleAllVisible = (checked) => {
    visiblePatients.forEach((patient) => {
      onToggleSelectPatient(patient.patient_id, checked)
    })
  }

  return {
    activeGroup,
    completenessFilter,
    enableConsistencyDebug,
    enableLegacyGroupFallback,
    groupMatchMode,
    handleToggleAllVisible,
    isAllVisibleSelected,
    isSomeVisibleSelected,
    keyword,
    rowIndexByPatientId,
    setCompletenessFilter,
    setKeyword,
    visiblePatientIds,
    visiblePatientRenderRows,
    visiblePatients,
  }
}
