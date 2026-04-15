const ok = (data = null, message = '本地模式') =>
  Promise.resolve({ success: true, code: 0, message, data })

async function parseJsonResponse(response) {
  const text = await response.text()
  if (!text?.trim()) {
    return { success: false, code: response.status, message: '空响应', data: [] }
  }
  try {
    return JSON.parse(text)
  } catch {
    return { success: false, code: response.status, message: '无效 JSON', data: [] }
  }
}

/**
 * CRF 模板列表：对接后端 schemas 表（新建项目时 schema_id 即模板 id）
 */
export const getCRFTemplates = async () => {
  try {
    const response = await fetch('/api/v1/schemas?schema_type=crf')
    const json = await parseJsonResponse(response)
    if (!json.success) {
      return { success: false, code: json.code, message: json.message || '加载失败', data: [] }
    }
    const rows = Array.isArray(json.data) ? json.data : []
    const data = rows.map((s) => ({
      id: s.id,
      template_name: s.name || s.code || s.id,
      description: `${s.schema_type || 'schema'} · ${s.code || ''} v${s.version ?? ''}`.trim(),
      category: '通用',
      is_published: !!s.is_active,
      field_count: 0,
      custom_field_count: 0,
      version: s.version,
      code: s.code,
      schema_type: s.schema_type,
      /** 与列表「编辑」按钮条件一致：来自后端 schemas，可进设计器 */
      source: 'database',
      is_system: false,
    }))
    return { success: true, code: 0, message: 'ok', data }
  } catch (e) {
    console.error('getCRFTemplates:', e)
    return { success: false, code: 500, message: e.message, data: [] }
  }
}
/**
 * 单条 CRF / schema 模板（含 schema_json），供设计器加载
 */
export const getCRFTemplate = async (templateId) => {
  if (!templateId) {
    return { success: false, code: 400, message: '缺少模板 id', data: null }
  }
  try {
    const response = await fetch(`/api/v1/schemas/${encodeURIComponent(templateId)}`)
    const json = await parseJsonResponse(response)
    if (!response.ok) {
      return {
        success: false,
        code: json.code || response.status,
        message: json.message || `请求失败 (${response.status})`,
        data: null,
      }
    }
    return json
  } catch (e) {
    console.error('getCRFTemplate:', e)
    return { success: false, code: 500, message: e.message, data: null }
  }
}
export const updateCrfTemplateMeta = () => ok({})
export const getCRFCategories = () => ok([])
export const getCrfDocTypes = () => ok([])
export const assignTemplateToProject = () => ok({})
export const getProjectTemplate = async (projectId) => {
  if (!projectId) {
    return { success: false, code: 400, message: '缺少项目 id', data: null }
  }
  try {
    const response = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}`)
    const json = await parseJsonResponse(response)
    if (!response.ok || !json.success) {
      return {
        success: false,
        code: json.code || response.status || 500,
        message: json.message || '项目模板获取失败',
        data: null,
      }
    }
    return {
      success: true,
      code: 0,
      message: 'ok',
      data: {
        template_id: json?.data?.schema_id || json?.data?.template_info?.template_id || null,
        template_name: json?.data?.template_info?.template_name || json?.data?.template_scope_config?.template_name || null,
        schema_json: json?.data?.schema_json || null,
        template_info: json?.data?.template_info || null,
        layout_config: null,
      },
    }
  } catch (e) {
    console.error('getProjectTemplate:', e)
    return { success: false, code: 500, message: e.message, data: null }
  }
}
export const convertTemplate = () => ok({})
export const importCrfTemplateFromCsv = () => ok({})
export const publishCrfTemplate = () => ok({})
export const saveCrfTemplateDesigner = () => ok({})
export const createCrfTemplateDesigner = () => ok({})
export const cloneCrfTemplate = () => ok({})
export const deleteCrfTemplate = () => ok({})
export const listCrfTemplateVersions = () => ok([])
export const getCrfTemplateVersion = () => ok({})
export const activateCrfTemplateVersion = () => ok({})

export default {
  getCRFTemplates,
  getCRFTemplate,
  updateCrfTemplateMeta,
  getCRFCategories,
  getCrfDocTypes,
  assignTemplateToProject,
  getProjectTemplate,
  convertTemplate,
  importCrfTemplateFromCsv,
  publishCrfTemplate,
  saveCrfTemplateDesigner,
  createCrfTemplateDesigner,
  cloneCrfTemplate,
  deleteCrfTemplate,
  listCrfTemplateVersions,
  getCrfTemplateVersion,
  activateCrfTemplateVersion
}
