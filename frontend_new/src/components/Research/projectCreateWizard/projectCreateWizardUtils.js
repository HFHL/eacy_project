export const normalizePatientId = (patientId) => String(patientId || '')

export const normalizeTemplateId = (template = {}) => (
  String(template.id || template.template_id || template.template_code || '')
)

export const mapPatientForSelection = (item) => ({
  id: item.id,
  name: item.name || '未知',
  gender: item.gender || '未知',
  age: item.age ?? '-',
  diagnosis: Array.isArray(item.diagnosis)
    ? item.diagnosis.join('、')
    : (item.diagnosis || '-'),
  completeness: Number(item.data_completeness || 0),
})
