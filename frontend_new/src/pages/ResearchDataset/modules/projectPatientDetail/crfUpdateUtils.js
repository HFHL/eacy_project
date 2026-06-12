import { getValueAtDotPath } from './crfPathUtils'

const isInternalSchemaFormKey = (key) => String(key || '').startsWith('_')

export const flattenEditableLeafValues = (data) => {
  const leaves = []
  const visit = (value, pathParts) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...pathParts, String(index)]))
      if (value.length === 0 && pathParts.length > 0) {
        leaves.push({ path: pathParts.join('.'), value })
      }
      return
    }

    if (value && typeof value === 'object') {
      const entries = Object.entries(value).filter(([key]) => !isInternalSchemaFormKey(key))
      if (entries.length === 0 && pathParts.length > 0) {
        leaves.push({ path: pathParts.join('.'), value })
      }
      entries.forEach(([key, child]) => visit(child, [...pathParts, key]))
      return
    }

    if (pathParts.length > 0) {
      leaves.push({ path: pathParts.join('.'), value })
    }
  }
  visit(data || {}, [])
  return leaves
}

export const buildProjectCrfFieldUpdates = (draftData, originalData, isValueEqual) => {
  return flattenEditableLeafValues(draftData)
    .filter(({ path, value }) => !isValueEqual(value === undefined ? null : value, getValueAtDotPath(originalData, path)))
    .map(({ path, value }) => ({
      field_path: `/${path.split('.').filter(Boolean).join('/')}`,
      value: value === undefined ? null : value,
    }))
}
