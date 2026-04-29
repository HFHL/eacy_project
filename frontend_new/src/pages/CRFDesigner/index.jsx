/**
 * CRF Designer - guide prototype based designer
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Button, Space, Tooltip, message, Form } from 'antd'
import {
  EditOutlined,
  SaveOutlined,
  UploadOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import FormDesigner from '../../components/FormDesigner'
import DesignerPageFrame from '../../components/FormDesigner/components/shared/DesignerPageFrame'
import { CSVConverter } from '../../components/FormDesigner/utils/csvConverter'
import { getCRFTemplate, saveCrfTemplateDesigner, createCrfTemplateDesigner, updateCrfTemplateMeta } from '../../api/crfTemplate'
import {
  buildFieldGroupsForBackend,
  fetchCrfDocTypeOptions,
  loadTemplateIntoDesignerDetailed,
} from '../../components/FormDesigner/utils/designerBridge'
import { resolveTemplateAssets } from '../../utils/templateAssetResolver'
import TemplateMetaModal from '../../components/Research/TemplateMetaModal'
import { templateEdit, templateFallback, templateView } from '../../utils/researchPaths'
import { PAGE_LAYOUT_HEIGHTS, toViewportHeight } from '../../constants/pageLayout'
import {
  clearPendingTemplateCreateMeta,
  clearPendingTemplateCreateReturnTo,
  consumePendingTemplateCreateMeta,
  readPendingTemplateCreateReturnTo,
} from '../../utils/templateCreateFlow'
import {
  buildCreateTemplateInfo,
  createDefaultTemplateInfo,
  resolveTemplateBackTarget,
} from '../../utils/templatePageState'

const RESEARCH_OPEN_TEMPLATE_META_KEY = 'research:open-template-meta'

const CRFDesigner = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { templateId } = useParams()
  const formDesignerRef = useRef(null)

  // 判断是否为只读查看模式（URL 以 /view 结尾）
  const isViewMode = location.pathname.endsWith('/view')

  const [templateInfoVisible, setTemplateInfoVisible] = useState(false)
  const [templateInfo, setTemplateInfo] = useState(createDefaultTemplateInfo(templateId || ''))
  const [templateForm] = Form.useForm()
  const [docTypeOptions, setDocTypeOptions] = useState([])

  useEffect(() => {
    const loadDocTypes = async () => {
      const options = await fetchCrfDocTypeOptions()
      setDocTypeOptions(options)
    }
    loadDocTypes()
  }, [])

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

    // template_code 不再由用户输入：后端会根据模板名自动生成（全局唯一）

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
          designer
        })
        if (!res?.success) {
          message.error(res?.message || '创建失败')
          return
        }
        message.success(publish ? '创建并发布成功' : '创建成功')
        const newId = res?.data?.id
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('research-template-rail-refresh'))
        }
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
        designer
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
        version: res?.data?.version ? String(res.data.version) : prev.version
      }))
      templateForm.setFieldsValue({
        name: res?.data?.template_name || template_name,
        category,
        description
      })
      message.success(publish ? '保存并发布成功' : '保存成功')
    } catch (error) {
      message.error(error?.message || '保存失败')
    }
  }, [templateId, templateForm, templateInfo, navigate])

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
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return
      try {
        await formDesignerRef.current?.importCSV(file)
        message.success('CSV导入成功')
      } catch (error) {
        message.error(`导入失败: ${error.message}`)
      }
    }
    input.click()
  }, [])

  const handleExportCSV = useCallback(() => {
    try {
      const csvData = formDesignerRef.current?.exportCSV()
      if (!csvData || csvData.length === 0) {
        message.error('没有可导出的CSV数据')
        return
      }
      // template_code 由后端生成；导出文件名用模板名兜底即可
      CSVConverter.downloadCSV(csvData, `${templateInfo.name || 'template'}_${templateInfo.version}.csv`)
      message.success('CSV导出成功')
    } catch (error) {
      message.error(`导出失败: ${error.message}`)
    }
  }, [templateInfo])

  const handleSaveTemplateInfo = useCallback(async () => {
    try {
      const values = await templateForm.validateFields()
      if (templateId) {
        const res = await updateCrfTemplateMeta(templateId, {
          template_name: values.name,
          category: values.category,
          description: values.description
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
        description: values.description
      }))
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('research-template-rail-refresh'))
      }
      message.success(templateId ? '模板信息已保存并同步' : '模板信息已暂存')
      setTemplateInfoVisible(false)
    } catch (error) {
      message.error('请检查输入信息')
    }
  }, [templateForm, templateId])

  /**
   * 监听来自侧栏的“编辑模板信息”事件。
   * - 命中当前模板：直接打开弹窗。
   * - 非当前模板：跳转到目标模板 view，并在目标页自动打开弹窗。
   */
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleOpenTemplateMeta = (event) => {
      const targetId = String(event?.detail?.templateId || '')
      if (!targetId) return
      if (String(templateId || '') === targetId) {
        setTemplateInfoVisible(true)
        return
      }
      window.sessionStorage.setItem(RESEARCH_OPEN_TEMPLATE_META_KEY, targetId)
      navigate(templateView(targetId))
    }
    window.addEventListener('research-template-meta-open', handleOpenTemplateMeta)
    return () => {
      window.removeEventListener('research-template-meta-open', handleOpenTemplateMeta)
    }
  }, [navigate, templateId])

  /**
   * 处理跨页带入的“打开模板信息”请求。
   */
  useEffect(() => {
    if (typeof window === 'undefined' || !templateId) return
    const pendingTemplateId = window.sessionStorage.getItem(RESEARCH_OPEN_TEMPLATE_META_KEY)
    if (!pendingTemplateId) return
    if (String(pendingTemplateId) !== String(templateId)) return
    window.sessionStorage.removeItem(RESEARCH_OPEN_TEMPLATE_META_KEY)
    setTemplateInfoVisible(true)
  }, [templateId])

  useEffect(() => {
    if (!templateId) {
      const pendingMeta = consumePendingTemplateCreateMeta()
      const nextTemplateInfo = buildCreateTemplateInfo(pendingMeta)
      formDesignerRef.current?.clearData?.({ silent: true })
      setTemplateInfo(nextTemplateInfo)
      templateForm.resetFields()
      templateForm.setFieldsValue({
        name: nextTemplateInfo.name,
        category: nextTemplateInfo.category,
        description: nextTemplateInfo.description,
      })
      setTemplateInfoVisible(!pendingMeta)
      return
    }
    clearPendingTemplateCreateMeta()
    let cancelled = false
    const loadTemplate = async () => {
      formDesignerRef.current?.clearData?.({ silent: true })
      try {
        const res = await getCRFTemplate(templateId)
        if (cancelled) return
        const tpl = res?.data
        if (!tpl) return
        const nextTemplateInfo = {
          id: tpl.id || templateId,
          name: tpl.template_name || tpl.name || '未命名模板',
          category: tpl.category || '通用',
          description: tpl.description || '',
          version: tpl.version ? String(tpl.version) : '1',
          status: tpl.is_published ? 'published' : 'draft'
        }
        if (cancelled) return
        setTemplateInfo(nextTemplateInfo)
        templateForm.setFieldsValue({
          name: nextTemplateInfo.name,
          category: nextTemplateInfo.category,
          description: nextTemplateInfo.description
        })

        const { designer, schema } = resolveTemplateAssets(tpl)
        const { loadedFrom, reason } = await loadTemplateIntoDesignerDetailed(formDesignerRef, { designer, schema, mode: 'auto' })
        if (cancelled) return
        if (!loadedFrom) {
          console.warn('[CRFDesigner] template assets load failed', {
            reason,
            hasSchema: !!schema,
            hasDesigner: !!designer,
            schemaKeys: schema && typeof schema === 'object' ? Object.keys(schema).slice(0, 8) : null,
          })
          if (reason === 'missing-assets' || reason === 'designer-schema-empty') {
            message.warning('模板未包含可用的 designer/schema 资产，设计器已清空')
          } else if (reason === 'schema-parse-failed') {
            message.warning('模板 schema 解析失败，设计器已清空（请查看控制台日志）')
          }
        }
      } catch (error) {
        if (cancelled) return
        message.error(`加载模板失败: ${error.message}`)
      }
    }
    loadTemplate()
    return () => {
      cancelled = true
    }
  }, [location.key, templateId, templateForm])

  /**
   * CRF 模板设计页统一容器高度（view/edit 共用）。
   */
  const TEMPLATE_DESIGNER_CONTAINER_HEIGHT = toViewportHeight(PAGE_LAYOUT_HEIGHTS.templateDesigner.containerOffset)

  return (
    <>
      <DesignerPageFrame
        backLabel="返回"
        showBackButton={!isViewMode}
        singleLineHeader
        containerPadding={0}
        containerHeight={TEMPLATE_DESIGNER_CONTAINER_HEIGHT}
        containerMinHeight={PAGE_LAYOUT_HEIGHTS.templateDesigner.containerMinHeight}
        unifiedContainer
        onBack={handleBack}
        headerContent={(
          <Space size={8}>
            <span>模版: {templateInfo.name}</span>
            <span>|</span>
            <span>版本: {templateInfo.version}</span>
            <Tooltip title="编辑模版信息">
              <Button
                type="text"
                size="small"
                shape="circle"
                icon={<EditOutlined />}
                onClick={() => setTemplateInfoVisible(true)}
              />
            </Tooltip>
          </Space>
        )}
        actions={(
          <Space>
            {!isViewMode && (
              <>
                <Button icon={<UploadOutlined />} onClick={handleImportCSV}>
                  导入CSV
                </Button>
                <Button onClick={handleExportCSV}>
                  导出CSV
                </Button>
              </>
            )}
            {!isViewMode && (
              <>
                <Button icon={<ReloadOutlined />} onClick={() => window.location.reload()}>
                  重置
                </Button>
                <Button icon={<SaveOutlined />} onClick={() => handleSaveSchema(false)}>
                  保存草稿
                </Button>
                <Button type="primary" icon={<SaveOutlined />} onClick={() => handleSaveSchema(true)}>
                  发布模版
                </Button>
              </>
            )}
            {isViewMode && (
              <Button type="primary" onClick={() => navigate(templateEdit(templateId))}>
                进入编辑
              </Button>
            )}
          </Space>
        )}
      >
        <FormDesigner
          ref={formDesignerRef}
          schemaPath={null}
          onSave={() => handleSaveSchema(false)}
          onBack={handleBack}
          readonly={isViewMode}
          showToolbar={false}
          docTypeOptions={docTypeOptions}
          borderless
        />
      </DesignerPageFrame>
      <TemplateMetaModal
        open={templateInfoVisible}
        form={templateForm}
        title={!templateId ? '新建模板' : '模板信息'}
        confirmText={!templateId ? '开始设计' : '保存'}
        initialValues={{
          name: templateInfo.name,
          category: templateInfo.category,
          description: templateInfo.description,
        }}
        onCancel={() => setTemplateInfoVisible(false)}
        onOk={handleSaveTemplateInfo}
      />
    </>
  )
}

export default CRFDesigner
