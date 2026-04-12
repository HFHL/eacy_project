/**
 * CRF Designer - guide prototype based designer
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Button, Space, message, Modal, Form, Input } from 'antd'
import {
  InfoCircleOutlined,
  SaveOutlined,
  UploadOutlined,
  EyeOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import FormDesigner from '../../components/FormDesigner'
import DesignerPageFrame from '../../components/FormDesigner/components/shared/DesignerPageFrame'
import { CSVConverter } from '../../components/FormDesigner/utils/csvConverter'
import { getCRFTemplate, saveCrfTemplateDesigner, createCrfTemplateDesigner, updateCrfTemplateMeta } from '../../api/crfTemplate'
import { buildFieldGroupsForBackend, fetchCrfDocTypeOptions, loadTemplateIntoDesigner } from '../../components/FormDesigner/utils/designerBridge'

const CRFDesigner = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { templateId } = useParams()
  const formDesignerRef = useRef(null)

  // 判断是否为只读查看模式（URL 以 /view 结尾）
  const isViewMode = location.pathname.endsWith('/view')

  const [templateInfoVisible, setTemplateInfoVisible] = useState(false)
  const [templateInfo, setTemplateInfo] = useState({
    id: templateId || '',
    name: '新建 CRF 模板',
    category: '通用',
    description: '',
    version: '1',
    status: 'draft'
  })
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
    const designer = { ...designData, fieldGroups }

    try {
      if (!templateId) {
        const res = await createCrfTemplateDesigner({
          template_name,
          category,
          description,
          publish,
          designer
        })
        if (!res?.success) {
          message.error(res?.message || '创建失败')
          return
        }
        message.success(publish ? '创建并发布成功' : '创建成功')
        const newId = res?.data?.id
        if (newId) {
          navigate(`/research/templates/${newId}/edit`, { replace: true })
        }
        return
      }

      const res = await saveCrfTemplateDesigner(templateId, {
        template_name,
        category,
        description,
        publish,
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
    navigate('/research/projects?tab=templates')
  }, [navigate])

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

  const handlePreview = useCallback(() => {
    formDesignerRef.current?.preview()
  }, [])

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
      message.success(templateId ? '模板信息已保存并同步' : '模板信息已暂存')
      setTemplateInfoVisible(false)
    } catch (error) {
      message.error('请检查输入信息')
    }
  }, [templateForm, templateId])

  useEffect(() => {
    if (!templateId) {
      setTemplateInfoVisible(true)
      return
    }
    let cancelled = false
    const loadTemplate = async () => {
      try {
        const res = await getCRFTemplate(templateId)
        if (cancelled) return
        if (!res?.success) {
          message.error(res?.message || '加载模板失败')
          return
        }
        const tpl = res?.data
        if (!tpl) return
        const nextTemplateInfo = {
          id: tpl.id || templateId,
          name: tpl.template_name || tpl.name || '未命名模板',
          category: tpl.category || '通用',
          description: tpl.description || '',
          version: tpl.version != null ? String(tpl.version) : '1',
          status: tpl.is_published ? 'published' : 'draft'
        }
        setTemplateInfo(nextTemplateInfo)
        templateForm.setFieldsValue({
          name: nextTemplateInfo.name,
          category: nextTemplateInfo.category,
          description: nextTemplateInfo.description
        })

        const layoutCfg = tpl.layout_config && typeof tpl.layout_config === 'object' ? tpl.layout_config : null
        const designer = layoutCfg?.designer || tpl.designer
        let schema = layoutCfg?.schema_json || tpl.schema_json || tpl.content_json
        if (typeof schema === 'string') {
          try {
            schema = JSON.parse(schema)
          } catch {
            schema = null
          }
        }

        const mode = schema && (!designer?.folders?.length) ? 'schema' : 'auto'
        const tryInject = async () => {
          for (let i = 0; i < 20 && !cancelled; i++) {
            if (formDesignerRef.current) {
              await loadTemplateIntoDesigner(formDesignerRef, { designer, schema, mode })
              return true
            }
            await new Promise((r) => setTimeout(r, 50))
          }
          return false
        }
        if (!(await tryInject()) && !cancelled) {
          message.warning('设计器尚未就绪，请稍后点击「重置」或刷新页面重试')
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
  }, [templateId, templateForm])

  return (
    <>
      <DesignerPageFrame
        backLabel="返回CRF模版"
        onBack={handleBack}
        headerContent={(
          <Space>
            <span>模版: {templateInfo.name}</span>
            <span>|</span>
            <span>版本: {templateInfo.version}</span>
            <span>|</span>
            <span>模板代码: {templateId || '-'}</span>
          </Space>
        )}
        actions={(
          <Space>
            <Button icon={<InfoCircleOutlined />} onClick={() => setTemplateInfoVisible(true)}>
              模版信息
            </Button>
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
            <Button icon={<EyeOutlined />} onClick={handlePreview}>
              预览
            </Button>
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
              <Button type="primary" onClick={() => navigate(`/research/templates/${templateId}/edit`)}>
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
        />
      </DesignerPageFrame>
      <Modal
        title="模板信息"
        open={templateInfoVisible}
        onCancel={() => setTemplateInfoVisible(false)}
        onOk={handleSaveTemplateInfo}
        width={600}
      >
        <Form
          form={templateForm}
          layout="vertical"
          initialValues={templateInfo}
        >
          <Form.Item label="模板名称" name="name" rules={[{ required: true, message: '请输入模板名称' }]}>
            <Input placeholder="请输入模板名称" />
          </Form.Item>
          <Form.Item label="分类" name="category">
            <Input placeholder="如: 肝胆外科" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} placeholder="模板描述" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default CRFDesigner
