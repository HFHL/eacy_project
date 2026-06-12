import { useCallback, useEffect, useState } from 'react'
import { Form, message } from 'antd'
import { getPatientList } from '../../../api/patient'
import { getProjects } from '../../../api/project'
import { getCRFTemplates } from '../../../api/crfTemplate'
import { pickMostRecentlyUpdatedItem } from '../../../utils/researchProjectSelection'
import {
  researchHome,
  researchProjectDetail,
  templateView,
} from '../../../utils/researchPaths'
import {
  REQUEST_PATIENT_CREATE_EVENT,
  REQUEST_PROJECT_CREATE_EVENT,
  REQUEST_TEMPLATE_CREATE_EVENT,
} from '../../../utils/createIntentEvents'

export const useMainCreateFlows = ({ navigate, pathname, setActiveToolbarPanel }) => {
  const [patientCreateVisible, setPatientCreateVisible] = useState(false)
  const [projectCreateVisible, setProjectCreateVisible] = useState(false)
  const [templateCreateVisible, setTemplateCreateVisible] = useState(false)
  const [templateCsvImportVisible, setTemplateCsvImportVisible] = useState(false)
  const [templateCreateForm] = Form.useForm()

  const goFirstPatientDetail = useCallback(async () => {
    try {
      const response = await getPatientList({ page: 1, page_size: 50 })
      const items = Array.isArray(response?.data?.items)
        ? response.data.items
        : (Array.isArray(response?.data) ? response.data : [])
      const first = [...items].sort((left, right) => {
        const leftTs = new Date(left?.updated_at || left?.created_at || 0).getTime()
        const rightTs = new Date(right?.updated_at || right?.created_at || 0).getTime()
        return rightTs - leftTs
      })[0]
      if (first?.id) {
        navigate(`/patient/detail/${first.id}`, { state: { from: '/patient/pool' } })
        return
      }
      navigate('/patient/pool?emptyState=patient')
    } catch {
      message.error('获取患者列表失败，请稍后重试')
      navigate('/patient/pool?emptyState=patient')
    }
  }, [navigate])

  const goFirstProjectDetail = useCallback(async () => {
    try {
      const response = await getProjects({ page: 1, page_size: 50 })
      const items = Array.isArray(response?.data?.items)
        ? response.data.items
        : (Array.isArray(response?.data) ? response.data : [])
      const first = pickMostRecentlyUpdatedItem(items, [
        (item) => item.updated_at,
        (item) => item.created_at,
      ])
      if (first?.id) {
        navigate(researchProjectDetail(first.id))
        return
      }
      navigate(`${researchHome()}?emptyState=project`)
    } catch {
      message.error('获取科研项目失败，请稍后重试')
      navigate(`${researchHome()}?emptyState=project`)
    }
  }, [navigate])

  const openCreatePatientFlow = useCallback(async () => {
    const inPatientDomain = pathname.startsWith('/patient/')
    if (!inPatientDomain) {
      await goFirstPatientDetail()
    }
    setPatientCreateVisible(true)
  }, [goFirstPatientDetail, pathname])

  const openCreateProjectFlow = useCallback(async () => {
    const inResearchDomain = pathname.startsWith('/research/')
    if (!inResearchDomain) {
      await goFirstProjectDetail()
    }
    setProjectCreateVisible(true)
  }, [goFirstProjectDetail, pathname])

  const openCreateTemplateFlow = useCallback(() => {
    setTemplateCreateVisible(true)
  }, [])

  const openTemplateCsvImportFlow = useCallback(() => {
    setActiveToolbarPanel('')
    setTemplateCsvImportVisible(true)
  }, [setActiveToolbarPanel])

  const goFirstTemplateView = useCallback(async () => {
    try {
      const response = await getCRFTemplates()
      const items = Array.isArray(response?.data)
        ? response.data
        : (Array.isArray(response?.data?.items) ? response.data.items : [])
      const first = [...items].sort((left, right) => {
        const leftTs = new Date(left?.updated_at || left?.created_at || left?.updatedAt || 0).getTime()
        const rightTs = new Date(right?.updated_at || right?.created_at || right?.updatedAt || 0).getTime()
        return rightTs - leftTs
      })[0]
      const firstId = first?.id || first?.template_id
      if (firstId) {
        navigate(templateView(firstId))
        return
      }
      openCreateTemplateFlow()
    } catch {
      message.error('获取模板列表失败，请稍后重试')
      openCreateTemplateFlow()
    }
  }, [navigate, openCreateTemplateFlow])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handlePatientCreateRequest = () => {
      openCreatePatientFlow()
    }
    const handleProjectCreateRequest = () => {
      openCreateProjectFlow()
    }
    const handleTemplateCreateRequest = () => {
      openCreateTemplateFlow()
    }
    window.addEventListener(REQUEST_PATIENT_CREATE_EVENT, handlePatientCreateRequest)
    window.addEventListener(REQUEST_PROJECT_CREATE_EVENT, handleProjectCreateRequest)
    window.addEventListener(REQUEST_TEMPLATE_CREATE_EVENT, handleTemplateCreateRequest)
    return () => {
      window.removeEventListener(REQUEST_PATIENT_CREATE_EVENT, handlePatientCreateRequest)
      window.removeEventListener(REQUEST_PROJECT_CREATE_EVENT, handleProjectCreateRequest)
      window.removeEventListener(REQUEST_TEMPLATE_CREATE_EVENT, handleTemplateCreateRequest)
    }
  }, [openCreatePatientFlow, openCreateProjectFlow, openCreateTemplateFlow])

  return {
    goFirstPatientDetail,
    goFirstProjectDetail,
    goFirstTemplateView,
    openCreatePatientFlow,
    openCreateProjectFlow,
    openCreateTemplateFlow,
    openTemplateCsvImportFlow,
    patientCreateVisible,
    projectCreateVisible,
    setPatientCreateVisible,
    setProjectCreateVisible,
    setTemplateCreateVisible,
    setTemplateCsvImportVisible,
    templateCreateForm,
    templateCreateVisible,
    templateCsvImportVisible,
  }
}
