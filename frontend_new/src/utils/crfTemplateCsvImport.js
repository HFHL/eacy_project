import { CSVConverter } from '../components/FormDesigner/utils/csvConverter'
import SchemaGenerator from '../components/FormDesigner/core/SchemaGenerator'
import { buildFieldGroupsForBackend } from '../components/FormDesigner/utils/designerFieldGroups'

/**
 * 将 CSV 文件解析为 CRF 设计器落库载荷（designer + schema_json + field_groups）。
 * 与 CRF 设计器内「导入 CSV」使用同一套 CSVConverter 规则，保证配置项可回填。
 *
 * @param {File} file CSV 文件
 * @param {Object} meta 模板元数据
 * @param {string} [meta.template_name]
 * @param {string} [meta.category]
 * @param {string} [meta.description]
 * @param {boolean} [meta.publish]
 * @returns {Promise<Object>}
 */
export async function buildDesignerPayloadFromCsvFile(file, meta = {}) {
  if (!file) {
    throw new Error('请选择 CSV 文件')
  }

  const designModel = await CSVConverter.importCSV(file)
  const templateName = String(meta.template_name || meta.templateName || '').trim()

  if (templateName) {
    designModel.meta = {
      ...(designModel.meta || {}),
      title: templateName,
    }
  }

  const fieldGroups = buildFieldGroupsForBackend(designModel)
  const schema_json = SchemaGenerator.generateSchema(designModel)
  const designer = { ...designModel, fieldGroups }

  const folderCount = designModel.folders?.length || 0
  const groupCount = designModel.folders?.reduce((sum, folder) => sum + (folder.groups?.length || 0), 0) || 0
  let fieldCount = 0
  const walkFields = (items) => {
    ;(items || []).forEach((item) => {
      if (Array.isArray(item.children) && item.children.length > 0) {
        walkFields(item.children)
        return
      }
      fieldCount += 1
    })
  }
  designModel.folders?.forEach((folder) => {
    ;(folder.groups || []).forEach((group) => walkFields(group.fields))
  })

  if (folderCount === 0 || groupCount === 0) {
    throw new Error('CSV 未解析出有效的访视/表单结构，请检查表头与必填列')
  }

  return {
    template_name: templateName || designModel.meta?.title || '从CSV导入的模板',
    category: meta.category || '',
    description: meta.description || '',
    publish: !!meta.publish,
    schema_json,
    designer,
    field_groups: fieldGroups,
    import_stats: {
      folders: folderCount,
      groups: groupCount,
      fields: fieldCount,
    },
  }
}
