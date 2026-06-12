import { useCallback } from 'react'
import { message } from 'antd'

import {
  createCrfTemplateDesigner,
  deleteCrfTemplate,
  saveCrfTemplateDesigner,
  updateCrfTemplateMeta,
} from '../../../api/crfTemplate'
import { CSVConverter } from '../../../components/FormDesigner/utils/csvConverter'
import { buildFieldGroupsForBackend } from '../../../components/FormDesigner/utils/designerBridge'
import { confirmDeleteCrfTemplate } from '../../../utils/crfTemplateDeleteFlow'
import { getCrfTemplateDeleteId } from '../../../utils/crfTemplateGuards'
import { templateEdit, templateFallback } from '../../../utils/researchPaths'
import {
  clearPendingTemplateCreateMeta,
  clearPendingTemplateCreateReturnTo,
  readPendingTemplateCreateReturnTo,
} from '../../../utils/templateCreateFlow'
import { resolveTemplateBackTarget } from '../../../utils/templatePageState'

const refreshTemplateRail = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('research-template-rail-refresh'))
  }
}

export const useCrfDesignerActions = ({
  canDeleteTemplate,
  formDesignerRef,
  isViewMode,
  navigate,
  setCloneModalOpen,
  setDeletingTemplate,
  setTemplateInfo,
  setTemplateInfoVisible,
  templateForm,
  templateId,
  templateInfo,
  templateRaw,
}) => {
  const handleSaveSchema = useCallback(async (publish = false) => {
    const designData = formDesignerRef.current?.getData()
    if (!designData) {
      message.error('未获取到设计器数据')
      return
    }

    const values = await templateForm.validateFields()
    const template_name = values.name || templateInfo.name
    const category = values.category || templateInfo.category
    const description = values.description || templateInfo.description
    const fieldGroups = buildFieldGroupsForBackend(designData)
    const schema_json = formDesignerRef.current?.exportSchema?.() || {}
    const designer = { ...designData, fieldGroups }

    try {
      if (!templateId) {
        const res = await createCrfTemplateDesigner({
          template_name,
          category,
          description,
          publish,
          schema_json,
          designer,
        })
        if (!res?.success) {
          message.error(res?.message || '创建失败')
          return
        }

        message.success(publish ? '创建并发布成功' : '创建成功')
        const newId = res?.data?.id
        refreshTemplateRail()
        clearPendingTemplateCreateMeta()
        clearPendingTemplateCreateReturnTo()
        if (newId) {
          navigate(templateEdit(newId), { replace: true })
        }
        return
      }

      const res = await saveCrfTemplateDesigner(templateId, {
        template_name,
        category,
        description,
        publish,
        schema_json,
        designer,
      })
      if (!res?.success) {
        message.error(res?.message || '保存失败')
        return
      }

      setTemplateInfo((prev) => ({
        ...prev,
        name: res?.data?.template_name || template_name,
        category,
        description,
        status: res?.data?.is_published ? 'published' : 'draft',
        version: res?.data?.version ? String(res.data.version) : prev.version,
      }))
      templateForm.setFieldsValue({
        name: res?.data?.template_name || template_name,
        category,
        description,
      })
      message.success(publish ? '保存并发布成功' : '保存成功')
    } catch (error) {
      message.error(error?.message || '保存失败')
    }
  }, [formDesignerRef, navigate, setTemplateInfo, templateForm, templateId, templateInfo])

  const handleBack = useCallback(() => {
    const returnTo = readPendingTemplateCreateReturnTo()
    const nextTarget = resolveTemplateBackTarget({
      templateId,
      isViewMode,
      returnTo,
      canGoBack: typeof window !== 'undefined' && window.history.length > 1,
    })

    if (!templateId) {
      clearPendingTemplateCreateMeta()
    }
    if (!templateId && returnTo) {
      clearPendingTemplateCreateReturnTo()
    }
    if (nextTarget.type === 'history') {
      navigate(-1)
      return
    }
    navigate(nextTarget.target || templateFallback())
  }, [isViewMode, navigate, templateId])

  const handleImportCSV = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv'
    input.onchange = async (event) => {
      const file = event.target.files[0]
      if (!file) return
      try {
        await formDesignerRef.current?.importCSV(file)
        message.success('CSV导入成功')
      } catch (error) {
        message.error(`导入失败: ${error.message}`)
      }
    }
    input.click()
  }, [formDesignerRef])

  const handleExportCSV = useCallback(() => {
    try {
      const csvData = formDesignerRef.current?.exportCSV()
      if (!csvData || csvData.length === 0) {
        message.error('没有可导出的CSV数据')
        return
      }
      CSVConverter.downloadCSV(csvData, `${templateInfo.name || 'template'}_${templateInfo.version}.csv`)
      message.success('CSV导出成功')
    } catch (error) {
      message.error(`导出失败: ${error.message}`)
    }
  }, [formDesignerRef, templateInfo])

  const handleSaveTemplateInfo = useCallback(async () => {
    try {
      const values = await templateForm.validateFields()
      if (templateId) {
        const res = await updateCrfTemplateMeta(templateId, {
          template_name: values.name,
          category: values.category,
          description: values.description,
        })
        if (!res?.success) {
          message.error(res?.message || '模板信息保存失败')
          return
        }
      }

      setTemplateInfo((prev) => ({
        ...prev,
        name: values.name,
        category: values.category,
        description: values.description,
      }))
      refreshTemplateRail()
      message.success(templateId ? '模板信息已保存并同步' : '模板信息已暂存')
      setTemplateInfoVisible(false)
    } catch (error) {
      message.error('请检查输入信息')
    }
  }, [setTemplateInfo, setTemplateInfoVisible, templateForm, templateId])

  const handleDeleteTemplate = useCallback(async () => {
    if (!templateId || !canDeleteTemplate) return

    const deleteId = getCrfTemplateDeleteId(templateRaw || { id: templateId })
    if (!deleteId) {
      message.error('无法解析可删除的模板 ID，请刷新后重试')
      return
    }

    await confirmDeleteCrfTemplate({
      templateId: deleteId,
      templateName: templateInfo.name,
      onConfirm: async ({ affectedProjectCount = 0 } = {}) => {
        setDeletingTemplate(true)
        try {
          const res = await deleteCrfTemplate(deleteId)
          if (res?.success === false) {
            message.error(res?.message || '删除模板失败')
            return
          }

          refreshTemplateRail()
          if (affectedProjectCount > 0) {
            message.success(`模板已删除，已保留 ${affectedProjectCount} 个项目的 CRF 副本`)
          } else {
            message.success('模板已删除')
          }
          navigate(templateFallback())
        } catch (error) {
          message.error(error?.message || '删除模板失败，请稍后重试')
          throw error
        } finally {
          setDeletingTemplate(false)
        }
      },
    })
  }, [canDeleteTemplate, navigate, setDeletingTemplate, templateId, templateInfo.name, templateRaw])

  const handleEditTemplate = useCallback(() => {
    if (templateId) {
      navigate(templateEdit(templateId))
    }
  }, [navigate, templateId])

  const handleTemplateCloned = useCallback((newId) => {
    setCloneModalOpen(false)
    refreshTemplateRail()
    navigate(templateEdit(newId))
  }, [navigate, setCloneModalOpen])

  return {
    handleBack,
    handleDeleteTemplate,
    handleEditTemplate,
    handleExportCSV,
    handleImportCSV,
    handleSaveSchema,
    handleSaveTemplateInfo,
    handleTemplateCloned,
  }
}
