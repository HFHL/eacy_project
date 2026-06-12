import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import {
  dispatchRequestPatientCreate,
  dispatchRequestProjectCreate,
  dispatchRequestTemplateCreate,
} from '../../../utils/createIntentEvents'
import { researchHome, researchProjectDetail } from '../../../utils/researchPaths'

export const useDashboardNavigation = () => {
  const navigate = useNavigate()
  const location = useLocation()

  const navigateToFileList = useCallback((options = {}) => {
    if (options.openUpload) {
      navigate('/document/upload')
      return
    }
    const params = new URLSearchParams()
    params.set('tab', options.tab || 'all')
    if (options.taskStatus?.length) params.set('taskStatus', options.taskStatus.join(','))
    if (options.statusInfo?.length) params.set('statusInfo', options.statusInfo.join(','))
    if (options.q) params.set('q', options.q)
    navigate(`/document/file-list?${params.toString()}`)
  }, [navigate])

  const handleActivityClick = useCallback((activity) => {
    if (activity?.entity?.project_id) {
      navigate(researchProjectDetail(activity.entity.project_id))
      return
    }
    if (activity?.entity?.patient_id) {
      navigate(`/patient/detail/${activity.entity.patient_id}`, {
        state: { from: `${location.pathname}${location.search || ''}` },
      })
      return
    }
    if (activity?.entity?.document_id) {
      navigateToFileList({ tab: 'all' })
      return
    }
    if (activity?.type === 'crf') {
      dispatchRequestTemplateCreate()
      return
    }
    navigate('/dashboard')
  }, [location.pathname, location.search, navigate, navigateToFileList])

  const handleNotificationClick = useCallback((item) => {
    if (item.kind === 'document_failed') {
      navigateToFileList({ tab: 'parse', taskStatus: ['parse_failed'] })
      return
    }
    if (item.kind === 'document_todo') {
      navigateToFileList({ tab: 'todo' })
      return
    }
    if (item.kind === 'patient_conflict') {
      navigate('/patient/pool')
      return
    }
    if (item.kind === 'project_task' && item.projectId) {
      navigate(researchProjectDetail(item.projectId))
      return
    }
    navigate(researchHome())
  }, [navigate, navigateToFileList])

  return {
    dispatchRequestPatientCreate,
    dispatchRequestProjectCreate,
    dispatchRequestTemplateCreate,
    handleActivityClick,
    handleNotificationClick,
    navigate,
    navigateToFileList,
  }
}
