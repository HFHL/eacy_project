import { useCallback, useEffect, useMemo } from 'react'
import { PAGE_LAYOUT_HEIGHTS, toViewportHeight } from '../../../constants/pageLayout'
import { formatIsoDateDisplay } from '../../../utils/dateDisplay'
import { useProjectDatasetViewModel } from './useProjectDatasetViewModel'

const PROJECT_DATASET_MIN_ROWS_FOR_VERTICAL_SCROLL = 6
const PROJECT_DATASET_TABLE_SCROLL_Y = toViewportHeight(PAGE_LAYOUT_HEIGHTS.researchDataset.tableScrollOffset)
const PROJECT_DATASET_V2_LAYOUT_TOKENS = {
  leftRailWidth: 320,
  headerHeight: 46,
  rowHeight: 40,
  panelGap: 1,
  cellPaddingY: 6,
  cellPaddingX: 6,
}

export function useProjectDatasetDerivedState({
  activeGroupKey,
  enrolledPatientCount,
  patientDataset,
  projectData,
  projectId,
  selectedPatients,
  setActiveGroupKey,
  templateFieldGroups,
  templateFieldMapping,
  templateSchemaJson,
  token,
}) {
  const computedAvgCompleteness = useMemo(() => {
    if (patientDataset && patientDataset.length > 0) {
      const total = patientDataset.reduce((sum, patient) => sum + (patient.overallCompleteness || 0), 0)
      return Math.round(total / patientDataset.length)
    }
    if (projectData?.avg_completeness != null) {
      return Math.round(projectData.avg_completeness)
    }
    return 0
  }, [patientDataset, projectData])

  const actualPatientTotal = enrolledPatientCount || projectData?.actual_patient_count || 0
  const expectedPatientTotal = projectData?.expected_patient_count || null
  const projectInfo = projectData ? {
    id: projectData.id,
    name: projectData.project_name,
    description: projectData.description,
    status: projectData.status,
    totalPatients: actualPatientTotal,
    expectedPatients: expectedPatientTotal,
    extractedPatients: actualPatientTotal,
    completeness: computedAvgCompleteness,
    crfTemplate: projectData?.template_info?.template_name
      || projectData?.template_scope_config?.template_name
      || projectData?.template_scope_config?.template_id
      || (projectData?.crf_template_id ? '已关联模板' : '未关联模板'),
    lastUpdate: projectData.updated_at,
  } : {
    id: projectId,
    name: '加载中...',
    description: '项目信息加载中...',
    status: 'unknown',
    totalPatients: 0,
    expectedPatients: null,
    extractedPatients: 0,
    completeness: 0,
    crfTemplate: '未关联模板',
    lastUpdate: '-',
  }

  const currentTemplateId = projectData?.template_info?.template_id
    || projectData?.template_scope_config?.template_id
    || projectData?.crf_template_id

  const projectDatasetViewModel = useProjectDatasetViewModel({
    projectData,
    patientDataset,
    templateFieldGroups,
    templateFieldMapping,
    templateSchemaJson,
    selectedPatients,
    activeGroupKey,
  })

  useEffect(() => {
    if (!activeGroupKey && projectDatasetViewModel.activeGroupKey) {
      setActiveGroupKey(projectDatasetViewModel.activeGroupKey)
    }
  }, [activeGroupKey, projectDatasetViewModel.activeGroupKey, setActiveGroupKey])

  const crfFieldGroups = useMemo(() => {
    if (!templateFieldGroups || templateFieldGroups.length === 0) return []
    return templateFieldGroups.map((group) => {
      const fieldCount = (group.db_fields || []).length
      let avgPercent = 0
      if (patientDataset && patientDataset.length > 0 && fieldCount > 0) {
        let totalFilled = 0
        let totalPatientFields = 0
        patientDataset.forEach((patient) => {
          const groupData = patient.crfGroups?.[group.group_id]
          if (groupData) {
            totalFilled += (groupData.filled_count || 0)
            totalPatientFields += (groupData.total_count || fieldCount)
          } else {
            totalPatientFields += fieldCount
          }
        })
        avgPercent = totalPatientFields > 0 ? Math.round((totalFilled / totalPatientFields) * 100) : 0
      }
      const status = avgPercent >= 90 ? 'completed' : avgPercent > 0 ? 'partial' : 'incomplete'
      return {
        group_id: group.group_id,
        name: group.group_name,
        fields: (group.db_fields || []).map((field) => field.split('/').pop()),
        status,
        completeness: avgPercent,
      }
    })
  }, [patientDataset, templateFieldGroups])

  const getCompletenessColor = useCallback((completeness) => {
    if (completeness >= 90) return token.colorSuccess
    if (completeness >= 70) return token.colorWarning
    return token.colorError
  }, [token])

  const projectDatasetTableScrollY = patientDataset.length > PROJECT_DATASET_MIN_ROWS_FOR_VERTICAL_SCROLL
    ? PROJECT_DATASET_TABLE_SCROLL_Y
    : undefined

  return {
    cardMinHeight: PAGE_LAYOUT_HEIGHTS.researchDataset.cardMinHeight,
    crfFieldGroups,
    currentSchemaVersion: projectData?.template_scope_config?.schema_version,
    currentTemplateId,
    getCompletenessColor,
    projectDatasetTableScrollY,
    projectDatasetViewModel,
    projectInfo,
    projectUpdateDisplay: formatIsoDateDisplay(projectInfo.lastUpdate),
    v2LayoutTokens: PROJECT_DATASET_V2_LAYOUT_TOKENS,
  }
}
