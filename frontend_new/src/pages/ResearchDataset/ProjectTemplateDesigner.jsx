/**
 * 项目内 CRF 模板编辑器（项目快照）
 * - 不涉及全局模板版本
 * - 保存后会写入项目 snapshot，并按 UID 迁移已抽取数据
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Space, message } from 'antd'
import { SaveOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons'

import FormDesigner from '../../components/FormDesigner'
import DesignerPageFrame from '../../components/FormDesigner/components/shared/DesignerPageFrame'
import { getProjectTemplateDesigner, saveProjectTemplateDesigner } from '../../api/project'
import {
  buildFieldGroupsForBackend,
  fetchCrfDocTypeOptions,
  loadTemplateIntoDesignerDetailed,
} from '../../components/FormDesigner/utils/designerBridge'
import { resolveTemplateAssets } from '../../utils/templateAssetResolver'
import { researchProjectDetail } from '../../utils/researchPaths'

const ProjectTemplateDesigner = () => {
  const navigate = useNavigate()
  const { projectId } = useParams()
  const formDesignerRef = useRef(null)

  const [loading, setLoading] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [schemaVersion, setSchemaVersion] = useState('')
  const [docTypeOptions, setDocTypeOptions] = useState([])

  useEffect(() => {
    const loadDocTypes = async () => {
      const options = await fetchCrfDocTypeOptions()
      setDocTypeOptions(options)
    }
    loadDocTypes()
  }, [])

  const handleBack = useCallback(() => {
    navigate(researchProjectDetail(projectId))
  }, [navigate, projectId])

  const handlePreview = useCallback(() => {
    formDesignerRef.current?.preview()
  }, [])

  const handleSave = useCallback(async () => {
    if (!projectId) return
    const designData = formDesignerRef.current?.getData()
    if (!designData) {
      message.error('未获取到设计器数据')
      return
    }
    setLoading(true)
    try {
      const fieldGroups = buildFieldGroupsForBackend(designData)
      const designer = { ...designData, fieldGroups }
      const schemaJson = formDesignerRef.current?.exportSchema?.() || {}
      const res = await saveProjectTemplateDesigner(projectId, {
        designer,
        schema_json: schemaJson,
        template_name: templateName,
      })
      if (!res?.success) {
        message.error(res?.message || '保存失败')
        return
      }
      message.success('保存成功')
      // 保存后回到项目页，让表头立即刷新
      navigate(`${researchProjectDetail(projectId)}?refresh=${Date.now()}`, { replace: true })
    } catch (e) {
      message.error(e?.message || '保存失败')
    } finally {
      setLoading(false)
    }
  }, [navigate, projectId, templateName])

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      formDesignerRef.current?.clearData?.({ silent: true })
      try {
        const res = await getProjectTemplateDesigner(projectId)
        if (cancelled) return
        // eslint-disable-next-line no-console
        console.log('[ProjectTemplateDesigner] getProjectTemplateDesigner response:', {
          success: res?.success,
          message: res?.message,
          dataKeys: res?.data ? Object.keys(res.data) : null,
          template_id: res?.data?.template_id,
          schema_version: res?.data?.schema_version,
          hasDesigner: !!res?.data?.designer,
          designerFolders: Array.isArray(res?.data?.designer?.folders) ? res.data.designer.folders.length : null,
          hasSchemaJson: !!res?.data?.schema_json,
          schemaJsonTopKeys: res?.data?.schema_json && typeof res.data.schema_json === 'object'
            ? Object.keys(res.data.schema_json).slice(0, 10) : null,
        })
        if (!res?.success) {
          message.error(res?.message || '加载失败')
          return
        }
        const data = res?.data || {}
        setTemplateName(data.template_name || '项目模板')
        setSchemaVersion(data.schema_version || '')
        const assets = resolveTemplateAssets(data)
        const { designer, schema } = assets
        // eslint-disable-next-line no-console
        console.log('[ProjectTemplateDesigner] resolveTemplateAssets:', {
          designerSource: assets.sources?.designer,
          schemaSource: assets.sources?.schema,
          designerFolders: Array.isArray(designer?.folders) ? designer.folders.length : null,
          schemaHasProperties: !!schema?.properties,
          warnings: assets.warnings,
        })
        // 与全局 CRF 设计器共用同一套自动判断逻辑：
        // 如果 designer 明显不完整或 schema 含有更多复杂结构，则自动优先 schema。
        const { loadedFrom, reason } = await loadTemplateIntoDesignerDetailed(formDesignerRef, { designer, schema, mode: 'auto' })
        if (cancelled) return
        // eslint-disable-next-line no-console
        console.log('[ProjectTemplateDesigner] loadTemplateIntoDesignerDetailed:', { loadedFrom, reason })
        if (!loadedFrom) {
          if (reason === 'missing-assets' || reason === 'designer-schema-empty') {
            message.warning('未找到项目模板快照（designer/schema）')
          } else if (reason === 'schema-parse-failed') {
            message.warning('模板 schema 解析失败，设计器已清空（请查看控制台日志）')
          }
        }
      } catch (e) {
        if (cancelled) return
        // eslint-disable-next-line no-console
        console.error('[ProjectTemplateDesigner] load error:', e)
        message.error(`加载失败: ${e?.message || '未知错误'}`)
      } finally {
        if (cancelled) return
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [projectId])

  return (
    <DesignerPageFrame
      backLabel="返回项目"
      onBack={handleBack}
      headerContent={(
        <Space>
          <span>项目模板: {templateName || '-'}</span>
          <span>|</span>
          <span>schema: {schemaVersion || '-'}</span>
        </Space>
      )}
      actions={(
        <Space>
          <Button icon={<EyeOutlined />} onClick={handlePreview}>
            预览
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => window.location.reload()}>
            重置
          </Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={loading}>
            保存并应用
          </Button>
        </Space>
      )}
    >
      <div style={{ height: '100%' }}>
        <FormDesigner
          ref={formDesignerRef}
          schemaPath={null}
          onSave={handleSave}
          onBack={handleBack}
          readonly={false}
          showToolbar={false}
          docTypeOptions={docTypeOptions}
        />
      </div>
    </DesignerPageFrame>
  )
}

export default ProjectTemplateDesigner

