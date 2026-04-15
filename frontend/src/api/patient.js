const ok = (data = null, message = '本地模式') =>
  Promise.resolve({ success: true, code: 0, message, data })

export const getPatientList = async (params) => {
  try {
    const query = new URLSearchParams()
    if (params?.page) query.append('page', params.page)
    if (params?.page_size) query.append('page_size', params.page_size)
    if (params?.search) query.append('search', params.search)
    if (params?.department_id) query.append('department_id', params.department_id)
    if (params?.project_id) query.append('project_id', params.project_id)
    
    const response = await fetch(`/api/v1/patients?${query.toString()}`)
    const text = await response.text()
    if (!text?.trim()) {
      return {
        success: false,
        code: response.status || 500,
        message: response.status >= 500 ? '服务器错误（空响应）' : `请求失败 (${response.status})`,
        data: [],
      }
    }
    let json
    try {
      json = JSON.parse(text)
    } catch {
      return {
        success: false,
        code: response.status || 500,
        message: '响应不是有效的 JSON',
        data: [],
      }
    }
    return json
  } catch (error) {
    console.error('API Error:', error)
    return { success: false, code: 500, message: error.message, data: [] }
  }
}
export const createPatient = (data) => ok(data || {})
export const batchDeletePatients = () => ok({ deleted_count: 0 })
export const batchDeleteCheck = () => ok({ related_projects: [] })
export const exportPatients = () => ok(new Blob(['local export'], { type: 'text/plain' }))
export const getDepartmentTree = () => ok([])
export const getPatientDetail = (patientId) => ok({ id: patientId })
export const updatePatient = (patientId, data) => ok({ id: patientId, ...(data || {}) })
export const getPatientEhr = () => ok({})
export const getPatientEhrSchemaData = async (patientId) => {
  try {
    const response = await fetch(`/api/v1/patients/${patientId}/ehr-schema-data`)
    return await response.json()
  } catch (error) {
    console.error('获取病历夹数据失败:', error)
    return { success: false, code: 500, message: error.message, data: { schema: {}, data: {} } }
  }
}
export const updatePatientEhrSchemaData = async (patientId, data) => {
  try {
    const response = await fetch(`/api/v1/patients/${patientId}/ehr-schema-data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    return await response.json()
  } catch (error) {
    console.error('保存病历夹数据失败:', error)
    return { success: false, code: 500, message: error.message }
  }
}
export const updatePatientEhr = () => ok({})
export const getPatientDocuments = async (patientId) => {
  try {
    const response = await fetch(`/api/v1/documents?patientId=${patientId}`);
    return await response.json();
  } catch (error) {
    console.error('获取患者文档失败:', error);
    return { success: false, code: 500, message: error.message, data: [] };
  }
}
export const mergeEhrData = async (patientId, body) => {
  try {
    const response = await fetch(`/api/v1/patients/${patientId}/merge-ehr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return await response.json()
  } catch (error) {
    console.error('合并EHR数据失败:', error)
    return { success: false, code: 500, message: error.message }
  }
}
export const updatePatientEhrFolder = async (patientId) => {
  try {
    const response = await fetch(`/api/v1/patients/${patientId}/ehr-folder/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    return await response.json()
  } catch (error) {
    console.error('更新病历夹失败:', error)
    return { success: false, code: 500, message: error.message }
  }
}
export const getConflictsByExtractionId = () => ok([])
export const resolveConflict = () => ok({})
export const startPatientExtraction = () => ok({ task_id: 'local-task' })
export const getExtractionTaskStatus = () => ok({ status: 'completed', progress: 100 })
export const getEhrFieldHistory = async (patientId, fieldId) => {
  try {
    const response = await fetch(`/api/v1/patients/${patientId}/ehr-field-history?field_path=${encodeURIComponent(fieldId)}`)
    return await response.json()
  } catch (error) {
    console.error('获取字段历史失败:', error)
    return { success: false, code: 500, message: error.message, data: { history: [] } }
  }
}
export const getEhrFieldHistoryV2 = async (patientId, fieldPath) => {
  try {
    const response = await fetch(`/api/v1/patients/${patientId}/ehr-field-history?field_path=${encodeURIComponent(fieldPath)}`)
    return await response.json()
  } catch (error) {
    console.error('获取字段历史失败:', error)
    return { success: false, code: 500, message: error.message, data: { history: [] } }
  }
}
export const uploadAndExtractField = () => ok({ task_id: 'local-task' })
export const getFieldConflicts = () => ok([])
export const resolveFieldConflict = () => ok({})
export const generateAiSummary = () => ok({ content: '本地模式，无后端生成内容。' })
export const getAiSummary = () => ok({ content: '本地模式，无后端生成内容。' })

export default {
  getPatientList,
  createPatient,
  batchDeletePatients,
  batchDeleteCheck,
  exportPatients,
  getDepartmentTree,
  getPatientDetail,
  updatePatient,
  getPatientEhr,
  getPatientEhrSchemaData,
  updatePatientEhrSchemaData,
  updatePatientEhr,
  getPatientDocuments,
  mergeEhrData,
  updatePatientEhrFolder,
  getConflictsByExtractionId,
  resolveConflict,
  startPatientExtraction,
  getExtractionTaskStatus,
  getEhrFieldHistory,
  getEhrFieldHistoryV2,
  uploadAndExtractField,
  getFieldConflicts,
  resolveFieldConflict,
  generateAiSummary,
  getAiSummary
}
