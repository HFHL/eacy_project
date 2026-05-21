import { RESTRICTED_DISPLAY_TYPES } from '../core/constants.js'

export const mapDisplayType = (displayType) => {
  if (RESTRICTED_DISPLAY_TYPES.includes(displayType)) {
    return 'text'
  }
  switch (displayType) {
    case 'text':
    case 'textarea':
    case 'number':
    case 'date':
    case 'radio':
    case 'checkbox':
    case 'select':
    case 'file':
      return displayType
    case 'multiselect':
      return 'checkbox'
    default:
      return 'text'
  }
}

const buildGroupDisplayName = (folderName, groupName, includeFolderPrefix = true) => {
  if (!includeFolderPrefix) return groupName || ''
  return [folderName, groupName].filter(Boolean).join(' / ')
}

const escapePathSegment = (s) => String(s || '').replace(/\//g, '\uff0f')

const flattenDesignerField = (field, parentPath = '') => {
  if (!field) return []
  const thisName = escapePathSegment(field.name)
  const nextParent = parentPath ? `${parentPath}/${thisName}` : thisName
  if (Array.isArray(field.children) && field.children.length > 0) {
    let flattened = []
    field.children.forEach((child) => {
      flattened = flattened.concat(flattenDesignerField(child, nextParent))
    })
    return flattened
  }
  return [{ field, parentPath }]
}

const normalizeFieldId = (field, fallbackFieldId) => {
  let fieldId = field.fieldId || field.field_id || ''
  if (fieldId && field.name) {
    const parts = String(fieldId).split('/')
    if (parts.length < 2) {
      return fallbackFieldId || fieldId
    }
    const lastPart = parts[parts.length - 1]
    if (lastPart !== field.name) {
      parts[parts.length - 1] = escapePathSegment(field.name)
      fieldId = parts.join('/')
    }
  }
  return fieldId || fallbackFieldId || field.uid || field.fieldUid || field.field_uid || ''
}

export const buildFieldGroupsForBackend = (designData, options = {}) => {
  const { includeFolderPrefix = true, orderOffsetPerFolder = 100 } = options
  const groups = []
  const folders = designData?.folders || []

  folders.forEach((folder, folderIndex) => {
    const folderGroups = folder.groups || []
    folderGroups.forEach((group, groupIndex) => {
      const groupDisplayName = buildGroupDisplayName(folder?.name || '', group?.name || '', includeFolderPrefix)
      const primarySources = group.primarySources || group.sources?.primary || []
      const secondarySources = group.secondarySources || group.sources?.secondary || []

      const fields = (group.fields || [])
        .flatMap((field) => flattenDesignerField(field, ''))
        .map(({ field, parentPath }) => {
          const validation = {}
          if (field.minimum !== undefined && field.minimum !== null) validation.min = field.minimum
          if (field.maximum !== undefined && field.maximum !== null) validation.max = field.maximum
          if (field.pattern) validation.pattern = field.pattern

          const escapedFieldName = escapePathSegment(field?.name || '')
          const composedPath = parentPath ? `${parentPath}/${escapedFieldName}` : escapedFieldName
          const fallbackFieldId = [escapePathSegment(folder?.name || ''), escapePathSegment(group?.name || ''), composedPath].filter(Boolean).join('/')

          const normalizedType = mapDisplayType(field.displayType)
          const extConfig = {
            ...(field.config || {}),
          }
          if (normalizedType !== field.displayType) {
            extConfig.originalDisplayType = field.displayType
            extConfig.restrictedType = true
          }
          return {
            name: field.name,
            displayName: field.displayName || field.name,
            type: normalizedType,
            required: !!field.required,
            options: field.options || [],
            validation,
            aiPrompt: field.extractionPrompt || '',
            description: field.description || '',
            unit: field.unit || '',
            sensitive: !!field.sensitive,
            primary: !!field.primary,
            editable: field.editable !== false,
            nullable: field.nullable !== false,
            fieldUid: field.uid || field.fieldUid || field.field_uid,
            fieldId: normalizeFieldId(field, fallbackFieldId),
            formTemplate: field.formTemplate || {},
            fileType: field.fileType || '',
            formName: group.name,
            category: 'form',
            extConfig,
            mergeBinding: field.mergeBinding || ''
          }
        })

      groups.push({
        name: groupDisplayName || group.name,
        repeatable: !!group.repeatable,
        order: group.order ?? (folderIndex + 1) * orderOffsetPerFolder + (groupIndex + 1),
        description: group.description || '',
        mergeBinding: group.mergeBinding || '',
        extConfig: group.formTemplate || group.config || {},
        _sourcesByDocType: {
          [group.name]: { primary: primarySources, secondary: secondarySources }
        },
        fields
      })
    })
  })

  return groups
}
