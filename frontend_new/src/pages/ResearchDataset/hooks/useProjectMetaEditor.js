import { useCallback, useEffect, useState } from 'react'
import { Form, message } from 'antd'
import { updateProject } from '../../../api/project'
import { REQUEST_PROJECT_EDIT_EVENT } from '../../../utils/createIntentEvents'
import {
  buildProjectMetaFormValues,
  buildProjectMetaUpdatePayload,
} from '../../../utils/projectMetaForm'
import { getProjectStatusOptions } from '../../../constants/projectStatusMeta'

export function useProjectMetaEditor({
  fetchProjectDetail,
  location,
  navigate,
  projectData,
  projectId,
}) {
  const [editProjectVisible, setEditProjectVisible] = useState(false)
  const [editForm] = Form.useForm()
  const projectStatusOptions = getProjectStatusOptions()

  const openProjectEditModal = useCallback(() => {
    setEditProjectVisible(true)
  }, [])

  const handleSaveProjectMeta = useCallback(async () => {
    try {
      const values = await editForm.validateFields()
      const payload = buildProjectMetaUpdatePayload(values)
      const response = await updateProject(projectId, payload)

      if (!response?.success) {
        message.error(response?.message || '项目更新失败')
        return
      }

      message.success('项目更新成功')
      setEditProjectVisible(false)
      await fetchProjectDetail()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('research-project-rail-refresh'))
      }
    } catch (error) {
      console.error('项目更新失败:', error)
      message.error('项目更新失败')
    }
  }, [editForm, fetchProjectDetail, projectId])

  useEffect(() => {
    if (!location?.state?.openProjectEdit) return
    if (String(location?.state?.projectId || projectId) !== String(projectId)) return
    openProjectEditModal()
    navigate(`${location.pathname}${location.search || ''}`, { replace: true, state: {} })
  }, [location?.pathname, location?.search, location?.state, navigate, openProjectEditModal, projectId])

  useEffect(() => {
    if (!editProjectVisible || !projectData) return
    editForm.setFieldsValue(buildProjectMetaFormValues(projectData))
  }, [editForm, editProjectVisible, projectData])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleProjectEditRequest = (event) => {
      if (String(event?.detail?.projectId) !== String(projectId)) return
      openProjectEditModal()
    }

    window.addEventListener(REQUEST_PROJECT_EDIT_EVENT, handleProjectEditRequest)
    return () => {
      window.removeEventListener(REQUEST_PROJECT_EDIT_EVENT, handleProjectEditRequest)
    }
  }, [openProjectEditModal, projectId])

  return {
    editForm,
    editProjectVisible,
    handleSaveProjectMeta,
    openProjectEditModal,
    projectStatusOptions,
    setEditProjectVisible,
  }
}
