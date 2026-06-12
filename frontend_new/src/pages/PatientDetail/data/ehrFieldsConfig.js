import { basicFields } from './ehrFieldsConfig/basicFields'
import { healthFields } from './ehrFieldsConfig/healthFields'
import { clinicalFields } from './ehrFieldsConfig/clinicalFields'
import { examFields } from './ehrFieldsConfig/examFields'
import { materialFields } from './ehrFieldsConfig/materialFields'

export const ehrFieldsData = {
  ...basicFields,
  ...healthFields,
  ...clinicalFields,
  ...examFields,
  ...materialFields,
}

export { ehrFieldGroupsConfig } from './ehrFieldsConfig/groupConfig'

export default ehrFieldsData
