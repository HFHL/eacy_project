import { useCallback, useEffect, useState } from 'react'
import { Modal, message } from 'antd'
import { deleteProject, getProjects } from '../../../api/project'
import { deleteCrfTemplate, getCRFTemplate, getCRFTemplates } from '../../../api/crfTemplate'
import { confirmDeleteCrfTemplate } from '../../../utils/crfTemplateDeleteFlow'
import { getCrfTemplateDeleteId } from '../../../utils/crfTemplateGuards'
import { researchHome, templateView } from '../../../utils/researchPaths'
import { mapProjectRailItems, mapTemplateRailItems, RESEARCH_OPEN_TEMPLATE_META_KEY } from '../layoutRailModel'

export const useResearchRailController = ({
  activePrimaryNavKey,
  activeResearchProjectId,
  activeResearchTemplateId,
  navigate,
  openCreateTemplateFlow,
}) => {
  const [researchProjectSearch, setResearchProjectSearch] = useState('')
  const [researchProjectSort, setResearchProjectSort] = useState('updated_desc')
  const [researchProjectLoading, setResearchProjectLoading] = useState(false)
  const [researchProjectItems, setResearchProjectItems] = useState([])
  const [researchTemplateSearch, setResearchTemplateSearch] = useState('')
  const [researchTemplateSort, setResearchTemplateSort] = useState('updated_desc')
  const [researchTemplateLoading, setResearchTemplateLoading] = useState(false)
  const [researchTemplateItems, setResearchTemplateItems] = useState([])
  const [deletingTemplateId, setDeletingTemplateId] = useState('')
  const [cloneTemplateModal, setCloneTemplateModal] = useState({ open: false, templateId: '', templateName: '' })
  const [templatePreviewModal, setTemplatePreviewModal] = useState({ open: false, loading: false, detail: null })
  const [deletingProjectId, setDeletingProjectId] = useState('')

  const refreshResearchProjectRail = useCallback(async () => {
    setResearchProjectLoading(true)
    try {
      const projectResponse = await getProjects({ page: 1, page_size: 100 }).catch(() => null)
      const projectRaw = Array.isArray(projectResponse?.data)
        ? projectResponse.data
        : (Array.isArray(projectResponse?.data?.items) ? projectResponse.data.items : [])
      setResearchProjectItems(mapProjectRailItems(projectRaw, researchProjectSearch, researchProjectSort))
    } finally {
      setResearchProjectLoading(false)
    }
  }, [researchProjectSearch, researchProjectSort])

  const refreshResearchTemplateRail = useCallback(async () => {
    setResearchTemplateLoading(true)
    try {
      const templateResponse = await getCRFTemplates().catch(() => null)
      const templateRaw = Array.isArray(templateResponse?.data)
        ? templateResponse.data
        : (Array.isArray(templateResponse?.data?.items) ? templateResponse.data.items : [])
      setResearchTemplateItems(mapTemplateRailItems(templateRaw, researchTemplateSearch, researchTemplateSort))
    } finally {
      setResearchTemplateLoading(false)
    }
  }, [researchTemplateSearch, researchTemplateSort])

  const handleDeleteProjectFromRail = useCallback((item) => {
    if (!item?.id) return
    Modal.confirm({
      title: '确认删除项目',
      content: `确定删除项目「${item.name || '未命名项目'}」吗？删除后不可恢复。`,
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setDeletingProjectId(String(item.id))
        try {
          const response = await deleteProject(item.id)
          if (!response?.success) {
            message.error(response?.message || '删除项目失败，请稍后重试')
            return
          }
          message.success('项目删除成功')
          await refreshResearchProjectRail()
          if (String(activeResearchProjectId) === String(item.id)) {
            navigate(researchHome())
          }
        } catch (error) {
          console.error('删除项目失败:', error)
          message.error(error?.message || '删除项目失败')
          throw error
        } finally {
          setDeletingProjectId('')
        }
      },
    })
  }, [activeResearchProjectId, navigate, refreshResearchProjectRail])

  const handleOpenTemplateMeta = useCallback((templateId) => {
    if (!templateId || typeof window === 'undefined') return
    const targetId = String(templateId)
    const activeId = String(activeResearchTemplateId || '')
    if (targetId === activeId) {
      window.dispatchEvent(new CustomEvent('research-template-meta-open', { detail: { templateId: targetId } }))
      return
    }
    window.sessionStorage.setItem(RESEARCH_OPEN_TEMPLATE_META_KEY, targetId)
    navigate(templateView(targetId))
  }, [activeResearchTemplateId, navigate])

  const resolveTemplateDeleteId = useCallback(async (item) => {
    const directId = item?.backendId || getCrfTemplateDeleteId({ id: item?.id })
    if (directId) return directId
    const routeId = item?.id
    if (!routeId) return ''

    const detail = await getCRFTemplate(String(routeId))
    return getCrfTemplateDeleteId(detail?.data || {})
  }, [])

  const handleCloneTemplateFromRail = useCallback((item) => {
    if (!item?.id) return
    setCloneTemplateModal({
      open: true,
      templateId: String(item.id),
      templateName: item.name || '未命名模板',
    })
  }, [])

  const handlePreviewTemplateFromRail = useCallback(async (item) => {
    if (!item?.id) return
    setTemplatePreviewModal({ open: true, loading: true, detail: { id: item.id, template_name: item.name } })
    try {
      const response = await getCRFTemplate(String(item.id))
      setTemplatePreviewModal({ open: true, loading: false, detail: response?.data || null })
    } catch (error) {
      message.error(error?.message || '加载模板预览失败')
      setTemplatePreviewModal({ open: false, loading: false, detail: null })
    }
  }, [])

  const handleDeleteTemplateFromRail = useCallback(async (item) => {
    if (!item?.id || !item.deletable) return
    const currentId = String(item.id)
    const currentIndex = researchTemplateItems.findIndex((row) => String(row.id) === currentId)
    const fallbackNext = currentIndex >= 0
      ? (researchTemplateItems[currentIndex + 1] || researchTemplateItems[currentIndex - 1] || null)
      : null

    const deleteId = await resolveTemplateDeleteId(item)
    if (!deleteId) {
      message.error('无法解析可删除的数据库模板 ID，请刷新后重试')
      return
    }

    await confirmDeleteCrfTemplate({
      templateId: deleteId,
      templateName: item.name,
      onConfirm: async ({ affectedProjectCount = 0 } = {}) => {
        setDeletingTemplateId(currentId)
        try {
          await deleteCrfTemplate(deleteId, { _silent: true })
          if (affectedProjectCount > 0) {
            message.success(`模板已删除，已保留 ${affectedProjectCount} 个项目的 CRF 副本`)
          } else {
            message.success('模板已删除')
          }
          await refreshResearchTemplateRail()
          if (fallbackNext?.id) {
            navigate(templateView(fallbackNext.id))
            return
          }
          openCreateTemplateFlow()
        } catch (error) {
          const fallbackMessage = error instanceof Error && error.message
            ? error.message
            : '删除模板失败，请稍后重试'
          message.error(fallbackMessage)
          throw error
        } finally {
          setDeletingTemplateId('')
        }
      },
    })
  }, [navigate, openCreateTemplateFlow, refreshResearchTemplateRail, researchTemplateItems, resolveTemplateDeleteId])

  useEffect(() => {
    let cancelled = false
    if (activePrimaryNavKey !== 'research') return () => { cancelled = true }

    const loadResearchItems = async () => {
      setResearchProjectLoading(true)
      setResearchTemplateLoading(true)
      try {
        const [projectResponse, templateResponse] = await Promise.all([
          getProjects({ page: 1, page_size: 100 }).catch(() => null),
          getCRFTemplates().catch(() => null),
        ])
        if (cancelled) return
        const projectRaw = Array.isArray(projectResponse?.data) ? projectResponse.data : (Array.isArray(projectResponse?.data?.items) ? projectResponse.data.items : [])
        const templateRaw = Array.isArray(templateResponse?.data) ? templateResponse.data : (Array.isArray(templateResponse?.data?.items) ? templateResponse.data.items : [])

        setResearchProjectItems(mapProjectRailItems(projectRaw, researchProjectSearch, researchProjectSort))
        setResearchTemplateItems(mapTemplateRailItems(templateRaw, researchTemplateSearch, researchTemplateSort))
      } finally {
        if (!cancelled) {
          setResearchProjectLoading(false)
          setResearchTemplateLoading(false)
        }
      }
    }

    loadResearchItems()
    return () => {
      cancelled = true
    }
  }, [activePrimaryNavKey, researchProjectSearch, researchProjectSort, researchTemplateSearch, researchTemplateSort])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleResearchProjectRailRefresh = () => {
      if (activePrimaryNavKey !== 'research') return
      refreshResearchProjectRail()
    }
    window.addEventListener('research-project-rail-refresh', handleResearchProjectRailRefresh)
    return () => {
      window.removeEventListener('research-project-rail-refresh', handleResearchProjectRailRefresh)
    }
  }, [activePrimaryNavKey, refreshResearchProjectRail])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleResearchTemplateRailRefresh = () => {
      if (activePrimaryNavKey !== 'research') return
      refreshResearchTemplateRail()
    }
    window.addEventListener('research-template-rail-refresh', handleResearchTemplateRailRefresh)
    return () => {
      window.removeEventListener('research-template-rail-refresh', handleResearchTemplateRailRefresh)
    }
  }, [activePrimaryNavKey, refreshResearchTemplateRail])

  return {
    cloneTemplateModal,
    deletingProjectId,
    deletingTemplateId,
    handleCloneTemplateFromRail,
    handleDeleteProjectFromRail,
    handleDeleteTemplateFromRail,
    handleOpenTemplateMeta,
    handlePreviewTemplateFromRail,
    refreshResearchTemplateRail,
    researchProjectItems,
    researchProjectLoading,
    researchProjectSearch,
    researchProjectSort,
    researchTemplateItems,
    researchTemplateLoading,
    researchTemplateSearch,
    researchTemplateSort,
    setCloneTemplateModal,
    setResearchProjectSearch,
    setResearchProjectSort,
    setResearchTemplateSearch,
    setResearchTemplateSort,
    setTemplatePreviewModal,
    templatePreviewModal,
  }
}
