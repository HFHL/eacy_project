/**
 * @file 字段契约适配工具
 * 统一 FieldModal / FieldConfigPanel 的读写口径，避免双入口漂移。
 */

/**
 * 将任意选项结构归一化为 string[]。
 * @param {any} rawOptions
 * @returns {string[]}
 */
export function normalizeOptions(rawOptions) {
  if (!Array.isArray(rawOptions)) return []
  return rawOptions
    .map((option) => {
      if (option && typeof option === 'object') {
        if (option.value !== undefined && option.value !== null) return String(option.value).trim()
        if (option.label !== undefined && option.label !== null) return String(option.label).trim()
      }
      return String(option ?? '').trim()
    })
    .filter(Boolean)
}

/**
 * 判断字段是否为选项类型。
 * @param {string} displayType
 * @returns {boolean}
 */
export function isOptionDisplayType(displayType) {
  return ['radio', 'checkbox', 'select', 'multiselect'].includes(displayType)
}

/**
 * 表格展示类型的UI值：单行。
 * @type {string}
 */
export const TABLE_SINGLE_ROW_DISPLAY_TYPE = 'table_single_row'
/**
 * 表格展示类型的UI值：多行。
 * @type {string}
 */
export const TABLE_MULTI_ROW_DISPLAY_TYPE = 'table_multi_row'

/**
 * 判断是否为UI层的表格类型值。
 * @param {string} displayType
 * @returns {boolean}
 */
export function isTableDisplayType(displayType) {
  return [TABLE_SINGLE_ROW_DISPLAY_TYPE, TABLE_MULTI_ROW_DISPLAY_TYPE, 'table'].includes(displayType)
}

/**
 * 将底层字段对象映射为UI层展示类型。
 * @param {Object} field
 * @returns {string}
 */
export function toDisplayTypeFormValue(field = {}) {
  if (field.displayType !== 'table') {
    return field.displayType
  }
  const tableRows = field.config?.tableRows
    || (field.multiRow ? 'multiRow' : 'singleRow')
  return tableRows === 'multiRow'
    ? TABLE_MULTI_ROW_DISPLAY_TYPE
    : TABLE_SINGLE_ROW_DISPLAY_TYPE
}

/**
 * 由UI层展示类型推导表格模式。
 * @param {string} displayType
 * @returns {'singleRow' | 'multiRow' | null}
 */
export function toTableRowsByDisplayType(displayType) {
  if (displayType === TABLE_MULTI_ROW_DISPLAY_TYPE) return 'multiRow'
  if (displayType === TABLE_SINGLE_ROW_DISPLAY_TYPE) return 'singleRow'
  return null
}

/**
 * 从字段对象生成表单初始值。
 * @param {Object} field
 * @returns {Object}
 */
export function toFieldFormValues(field = {}) {
  const displayType = toDisplayTypeFormValue(field)
  return {
    ...field,
    displayType,
    options: normalizeOptions(field.options),
    isSensitive: !!field.sensitive,
    isPrimary: !!field.primary,
    isEditable: field.editable !== false,
    isRequired: !!field.required,
    isNullable: field.nullable !== false,
    skipExtraction: !!field.skipExtraction,
    reuseMode: field.formTemplate?.reuse_mode || 'none',
    sourceForm: field.formTemplate?.source_form || '',
  }
}

/**
 * 将表单值映射回字段契约更新对象。
 * - 停止新写入 conflictPolicy / warnOnConflict。
 * - 统一 options 为 string[]。
 * @param {Object} values
 * @returns {Object}
 */
export function fromFieldFormValues(values = {}) {
  const normalizedOptions = normalizeOptions(values.options)
  const tableRows = toTableRowsByDisplayType(values.displayType)
  const normalizedDisplayType = tableRows ? 'table' : values.displayType
  const reuseMode = values.reuseMode && values.reuseMode !== 'none' ? values.reuseMode : undefined
  const sourceForm = values.sourceForm || undefined
  const config = {
    ...(values.config || {})
  }
  if (tableRows) {
    config.tableRows = tableRows
  }
  return {
    name: values.name,
    displayName: values.displayName,
    uid: values.uid,
    fieldId: values.fieldId,
    displayType: normalizedDisplayType,
    dataType: values.dataType,
    options: normalizedOptions,
    unit: values.unit || null,
    fileType: values.fileType || '',
    minimum: values.minimum,
    maximum: values.maximum,
    pattern: values.pattern || undefined,
    description: values.description || '',
    extractionPrompt: values.extractionPrompt || '',
    defaultValue: values.defaultValue,
    format: values.format || undefined,
    sensitive: !!values.isSensitive,
    primary: !!values.isPrimary,
    editable: values.isEditable !== false,
    required: !!values.isRequired,
    nullable: values.isNullable !== false,
    skipExtraction: !!values.skipExtraction,
    multiRow: tableRows === 'multiRow',
    isTable: normalizedDisplayType === 'table',
    config: Object.keys(config).length > 0 ? config : undefined,
    formTemplate: {
      reuse_mode: reuseMode,
      source_form: sourceForm,
    }
  }
}

