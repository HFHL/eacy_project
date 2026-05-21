import { getCrfDocTypes } from '../../../api/crfTemplate.js'
import { parseJsonAsset, resolveTemplateAssets } from '../../../utils/templateAssetResolver.js'
import {
  loadTemplateIntoDesigner,
  loadTemplateIntoDesignerDetailed,
} from '../../../utils/templateDesignerLoader.js'

export { buildFieldGroupsForBackend, mapDisplayType } from './designerFieldGroups.js'

export { resolveTemplateAssets }
export { loadTemplateIntoDesigner, loadTemplateIntoDesignerDetailed }

export const fetchCrfDocTypeOptions = async () => {
  try {
    const res = await getCrfDocTypes()
    const options = res?.data?.options
    return Array.isArray(options) ? options : []
  } catch (e) {
    return []
  }
}
