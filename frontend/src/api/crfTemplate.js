const ok = (data = null, message = '本地模式') =>
  Promise.resolve({ success: true, code: 0, message, data })

export const getCRFTemplates = () => ok({ items: [], total: 0 })
export const getCRFTemplate = (templateId) => ok({ id: templateId })
export const updateCrfTemplateMeta = () => ok({})
export const getCRFCategories = () => ok([])
export const getCrfDocTypes = () => ok([])
export const assignTemplateToProject = () => ok({})
export const getProjectTemplate = () => ok(null)
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
