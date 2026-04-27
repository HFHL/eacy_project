import { emptyList, emptySuccess } from './_empty'

export const getCRFTemplates = async () => emptySuccess({ list: [], items: [], total: 0 })
export const getCRFTemplate = async (templateId = '') => emptySuccess({ id: templateId, schema_json: {}, field_groups: [] })
export const updateCrfTemplateMeta = async (_templateId, payload = {}) => emptySuccess(payload)
export const getCRFCategories = async () => emptySuccess([])
export const getCrfDocTypes = async () => emptySuccess([])
export const assignTemplateToProject = async () => emptySuccess(null)
export const getProjectTemplate = async () => emptySuccess(null)
export const convertTemplate = async () => emptySuccess(null)
export const importCrfTemplateFromCsv = async () => emptySuccess(null)
export const publishCrfTemplate = async () => emptySuccess(null)
export const saveCrfTemplateDesigner = async (_templateId, payload = {}) => emptySuccess(payload)
export const createCrfTemplateDesigner = async (payload = {}) => emptySuccess({ id: '', ...payload })
export const cloneCrfTemplate = async (_templateId, payload = {}) => emptySuccess({ id: '', ...payload })
export const deleteCrfTemplate = async () => emptySuccess(null)
export const listCrfTemplateVersions = async () => emptyList()
export const getCrfTemplateVersion = async () => emptySuccess(null)
export const activateCrfTemplateVersion = async () => emptySuccess(null)

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
  activateCrfTemplateVersion,
}
