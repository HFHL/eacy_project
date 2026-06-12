import { useEffect } from 'react'
import { message } from 'antd'

import { getCRFTemplate } from '../../../api/crfTemplate'
import { loadTemplateIntoDesignerDetailed } from '../../../components/FormDesigner/utils/designerBridge'
import { resolveTemplateAssets } from '../../../utils/templateAssetResolver'
import { templateFallback } from '../../../utils/researchPaths'
import {
  clearPendingTemplateCreateMeta,
  consumePendingTemplateCreateMeta,
} from '../../../utils/templateCreateFlow'
import { buildCreateTemplateInfo } from '../../../utils/templatePageState'

export const useCrfTemplateLoader = ({
  formDesignerRef,
  locationKey,
  navigate,
  setTemplateInfo,
  setTemplateInfoVisible,
  setTemplateRaw,
  templateForm,
  templateId,
}) => {
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

        if (tpl.status === 'archived') {
          message.warning('该模板已删除')
          navigate(templateFallback(), { replace: true })
          return
        }

        setTemplateRaw(tpl)
        const nextTemplateInfo = {
          id: tpl.id || templateId,
          name: tpl.template_name || tpl.name || '未命名模板',
          category: tpl.category || '通用',
          description: tpl.description || '',
          version: tpl.version ? String(tpl.version) : '1',
          status: tpl.is_published ? 'published' : 'draft',
        }

        if (cancelled) return
        setTemplateInfo(nextTemplateInfo)
        templateForm.setFieldsValue({
          name: nextTemplateInfo.name,
          category: nextTemplateInfo.category,
          description: nextTemplateInfo.description,
        })

        const { designer, schema } = resolveTemplateAssets(tpl)
        const { loadedFrom, reason } = await loadTemplateIntoDesignerDetailed(
          formDesignerRef,
          { designer, schema, mode: 'auto' },
        )
        if (cancelled || loadedFrom) return

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
      } catch (error) {
        if (!cancelled) {
          message.error(`加载模板失败: ${error.message}`)
        }
      }
    }

    loadTemplate()
    return () => {
      cancelled = true
    }
  }, [
    formDesignerRef,
    locationKey,
    navigate,
    setTemplateInfo,
    setTemplateInfoVisible,
    setTemplateRaw,
    templateForm,
    templateId,
  ])
}
