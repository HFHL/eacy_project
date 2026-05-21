const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** 内置不可删除的模板编码 */
const PROTECTED_TEMPLATE_CODES = new Set(['ehr_default'])

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export const isUuidString = (value) =>
  typeof value === 'string' && UUID_PATTERN.test(value.trim())

/**
 * 判断 CRF 模板是否允许归档删除。
 *
 * @param {Record<string, unknown>} template
 * @returns {boolean}
 */
export const isCrfTemplateDeletable = (template = {}) => {
  const deleteId = getCrfTemplateDeleteId(template)
  if (!deleteId) return false
  if (template.status === 'archived') return false
  if (Boolean(template.is_system)) return false
  if (PROTECTED_TEMPLATE_CODES.has(template.template_code)) return false
  return true
}

/**
 * @param {Record<string, unknown>} template
 * @returns {string}
 */
export const getCrfTemplateDeleteId = (template = {}) => {
  const raw = template.id || template.template_id || null
  return isUuidString(raw) ? String(raw).trim() : ''
}
