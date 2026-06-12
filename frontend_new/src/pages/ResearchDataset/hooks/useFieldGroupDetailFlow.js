import { useCallback, useState } from 'react'
import {
  getTemplateGroupConfig,
  normalizeGroupForDisplay,
} from '../modules/groupDisplayModel'

export function useFieldGroupDetailFlow({ templateFieldGroups, templateSchemaJson }) {
  const [fieldGroupDetailVisible, setFieldGroupDetailVisible] = useState(false)
  const [currentFieldGroup, setCurrentFieldGroup] = useState(null)
  const [currentPatient, setCurrentPatient] = useState(null)

  const handleViewFieldGroupDetail = useCallback((patient, groupName, groupData) => {
    setCurrentPatient(patient)
    const groupConfig = getTemplateGroupConfig(templateFieldGroups, groupData, groupName)
    const displayModel = normalizeGroupForDisplay(groupData, groupConfig, templateSchemaJson)
    const completeness = groupData?.completeness ?? (
      displayModel.totalCount > 0 ? Math.round((displayModel.filledCount / displayModel.totalCount) * 100) : 0
    )

    setCurrentFieldGroup({
      name: groupName,
      data: {
        ...groupData,
        groupConfig,
        records: displayModel.rows,
        displayModel,
        completeness,
      },
    })
    setFieldGroupDetailVisible(true)
  }, [templateFieldGroups, templateSchemaJson])

  const closeFieldGroupDetail = useCallback(() => {
    setFieldGroupDetailVisible(false)
    setCurrentFieldGroup(null)
    setCurrentPatient(null)
  }, [])

  return {
    closeFieldGroupDetail,
    currentFieldGroup,
    currentPatient,
    fieldGroupDetailVisible,
    handleViewFieldGroupDetail,
  }
}
