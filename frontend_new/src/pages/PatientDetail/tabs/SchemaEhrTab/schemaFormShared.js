/**
 * SchemaEhrTab 共享工具：
 * 1) 解析 Schema $defs 枚举
 * 2) 统一三栏布局 props 协议
 */

/**
 * 患者详情页 SchemaForm 布局默认配置。
 * @type {{siderWidth:number, sourcePanelWidth:undefined|number, collapsible:boolean, showSourcePanel:boolean, contentAdaptive:boolean, collapsedTitle:string}}
 */
export const PATIENT_SCHEMA_FORM_LAYOUT_DEFAULTS = Object.freeze({
  siderWidth: 220,
  sourcePanelWidth: undefined,
  collapsible: true,
  showSourcePanel: true,
  contentAdaptive: false,
  collapsedTitle: '目录'
})

/**
 * 科研患者详情页 SchemaForm 布局默认配置。
 * @type {{siderWidth:number, sourcePanelWidth:undefined|number, collapsible:boolean, showSourcePanel:boolean, contentAdaptive:boolean, collapsedTitle:string}}
 */
export const PROJECT_SCHEMA_FORM_LAYOUT_DEFAULTS = Object.freeze({
  siderWidth: 260,
  sourcePanelWidth: undefined,
  collapsible: true,
  showSourcePanel: true,
  contentAdaptive: false,
  collapsedTitle: '目录'
})

/**
 * 解析 Schema 中的 $defs 枚举定义。
 * @param {Object} schema - JSON Schema 对象。
 * @returns {Record<string, {id:string, type:string, values:Array}>} 枚举映射。
 */
export function parseSchemaDefsToEnums(schema) {
  const enums = {}
  if (schema?.$defs) {
    for (const [enumId, enumDef] of Object.entries(schema.$defs)) {
      if (enumDef?.enum) {
        enums[enumId] = {
          id: enumId,
          type: enumDef.type || 'string',
          values: [...enumDef.enum]
        }
      }
    }
  }
  return enums
}

/**
 * 合并并标准化三栏布局 props（忽略 undefined 覆盖）。
 * @param {Object} defaults - 默认布局配置。
 * @param {Object} [overrides={}] - 页面级覆盖配置。
 * @returns {{siderWidth:number, sourcePanelWidth:undefined|number, collapsible:boolean, showSourcePanel:boolean, contentAdaptive:boolean, collapsedTitle:string}} 标准化后的配置。
 */
/**
 * 从患者/项目 JSON Schema 解析可靶向抽取的表单列表（与后端 ExtractionPlanner 的 form_key 一致）。
 * @param {Object} schema
 * @returns {Array<{key:string, name:string, group_key:string, form_key:string}>}
 */
export function buildTargetFormGroupsFromSchema(schema) {
  const groups = []
  const properties = schema?.properties || {}
  for (const [groupKey, groupSchema] of Object.entries(properties)) {
    const groupProperties = groupSchema?.properties || {}
    for (const [formKey, formSchema] of Object.entries(groupProperties)) {
      if (!formSchema || typeof formSchema !== 'object') continue
      const targetSchema =
        formSchema.type === 'array' && formSchema.items && typeof formSchema.items === 'object'
          ? formSchema.items
          : formSchema
      const fullKey = `${groupKey}.${formKey}`
      const name =
        targetSchema?.['x-display-name'] ||
        formSchema?.['x-display-name'] ||
        formKey
      groups.push({
        key: fullKey,
        name,
        group_key: groupKey,
        form_key: formKey,
      })
    }
  }
  return groups
}

export function createSchemaFormLayoutProps(defaults, overrides = {}) {
  const normalizedOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined)
  )
  return {
    ...defaults,
    ...normalizedOverrides
  }
}
