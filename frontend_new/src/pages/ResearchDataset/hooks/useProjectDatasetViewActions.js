import { useCallback, useEffect } from 'react'
import { researchProjectPatientDetail } from '../../../utils/researchPaths'
import { useProjectPatientRemoval } from './useProjectPatientRemoval'

export const useProjectDatasetViewActions = ({
  currentTemplateId,
  exportFlow,
  fetchProjectDetail,
  fetchProjectPatients,
  fetchProjectTemplateSchema,
  location,
  navigate,
  pagination,
  projectId,
  selectedPatients,
  setBindTemplateVisible,
  setSelectedPatients,
}) => {
  const handleNavigatePatientDetail = useCallback((patientId) => {
    if (!patientId) return
    navigate(researchProjectPatientDetail(projectId, patientId))
  }, [navigate, projectId])

  useEffect(() => {
    if (location?.state?.openExport) {
      exportFlow.openExportModal()
      navigate(`${location.pathname}${location.search || ''}`, { replace: true, state: {} })
    }
  }, [exportFlow.openExportModal, location?.pathname, location.search, location?.state, navigate])

  const handleViewProjectTemplate = useCallback(() => {
    if (!currentTemplateId) {
      setBindTemplateVisible(true)
      return
    }
    navigate(`/research/projects/${projectId}/template/edit`)
  }, [currentTemplateId, navigate, projectId, setBindTemplateVisible])

  const handleTemplateBound = useCallback(async () => {
    setBindTemplateVisible(false)
    await fetchProjectDetail()
    await fetchProjectTemplateSchema()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('research-project-rail-refresh'))
    }
  }, [fetchProjectDetail, fetchProjectTemplateSchema, setBindTemplateVisible])

  const handleRemovePatients = useProjectPatientRemoval({
    fetchProjectDetail,
    fetchProjectPatients,
    pagination,
    projectId,
    selectedPatients,
    setSelectedPatients,
  })

  return {
    handleNavigatePatientDetail,
    handleRemovePatients,
    handleTemplateBound,
    handleViewProjectTemplate,
  }
}
