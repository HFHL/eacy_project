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
import { buildFieldGroupsForBackend, fetchCrfDocTypeOptions, loadTemplateIntoDesigner } from '../../components/FormDesigner/utils/designerBridge'

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
    navigate(`/research/projects/${projectId}`)
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
      const res = await saveProjectTemplateDesigner(projectId, { designer })
      if (!res?.success) {
        message.error(res?.message || '保存失败')
        return
      }
      const data = res?.data || {}
      message.success(`保存成功：已迁移 ${data.migrated || 0} 个患者（跳过 ${data.skipped || 0}）`)
      // 保存后回到项目页，让表头立即刷新
      navigate(`/research/projects/${projectId}?refresh=${Date.now()}`, { replace: true })
    } catch (e) {
      message.error(e?.message || '保存失败')
    } finally {
      setLoading(false)
    }
  }, [navigate, projectId])

  useEffect(() => {
    if (!projectId) return
    const load = async () => {
      setLoading(true)
      try {
        const res = await getProjectTemplateDesigner(projectId)
        if (!res?.success) {
          message.error(res?.message || '加载失败')
          return
        }
        const data = res?.data || {}
        setTemplateName(data.template_name || '项目模板')
        setSchemaVersion(data.schema_version || '')
        const designer = data.designer
        const schema = data.schema_json
        // 与全局 CRF 设计器共用同一套自动判断逻辑：
        // 如果 designer 明显不完整或 schema 含有更多复杂结构，则自动优先 schema。
        const loadedFrom = await loadTemplateIntoDesigner(formDesignerRef, { designer, schema, mode: 'auto' })
        if (!loadedFrom) {
          message.warning('未找到项目模板快照（designer/schema）')
        }
      } catch (e) {
        message.error(`加载失败: ${e?.message || '未知错误'}`)
      } finally {
        setLoading(false)
      }
    }
    load()
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

