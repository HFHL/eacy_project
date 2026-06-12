import { DISPLAY_TYPES } from '../constants.js'

export const generateTableField = (field) => {
  const isMultiRow = field.config?.tableRows === 'multiRow' || field.multiRow === true
  const schema = {
    type: isMultiRow ? 'array' : 'object',
    ...(isMultiRow ? {
      items: {
        type: 'object',
        properties: {},
        unevaluatedProperties: false,
      },
    } : {
      properties: {},
      unevaluatedProperties: false,
    }),
  }
  const target = isMultiRow ? schema.items : schema
  const childOrder = []

  for (const childField of field.children) {
    childOrder.push(childField.name)
    target.properties[childField.name] = childField?.isTable && Array.isArray(childField.children)
      ? generateTableField(childField)
      : generateField(childField)
  }
  if (childOrder.length > 0) {
    target['x-property-order'] = childOrder
  }

  if (field.uid) schema['x-field-uid'] = field.uid
  if (field.fieldId) schema['x-field-id'] = field.fieldId
  if (field.displayName) schema['x-display-name'] = field.displayName
  if (field.sensitive) schema['x-sensitive'] = true
  if (field.primary) schema['x-primary'] = true
  if (field.config?.tableRows) {
    const extConfig = schema['x-extended-config'] || {}
    extConfig.tableRows = field.config.tableRows
    schema['x-extended-config'] = extConfig
  }
  if (field.formTemplate) schema['x-form-template'] = field.formTemplate
  if (field.fileType) schema['x-file-type'] = field.fileType
  schema['x-display'] = DISPLAY_TYPES.TABLE
  return schema
}

export const generateField = (field) => {
  const schema = {
    type: field.dataType || 'string',
  }

  if (field.displayType === DISPLAY_TYPES.DATE && !field.format) {
    schema.format = 'date'
  }
  if (field.displayType === DISPLAY_TYPES.DATETIME && !field.format) {
    schema.format = 'date-time'
  }
  if (field.format) schema.format = field.format
  if (typeof field.minimum === 'number') schema.minimum = field.minimum
  if (typeof field.maximum === 'number') schema.maximum = field.maximum
  if (field.pattern) schema.pattern = field.pattern

  if (field.options && field.options.length > 0) {
    if (field.displayType === DISPLAY_TYPES.CHECKBOX ||
        field.displayType === DISPLAY_TYPES.MULTISELECT) {
      schema.type = 'array'
      schema.items = {
        type: 'string',
        enum: field.options,
      }
    } else {
      schema.type = 'string'
      schema.enum = field.options
    }
    if (field.optionsId) {
      schema.allOf = [{ $ref: `#/$defs/${field.optionsId}` }]
    }
  }

  if (field.uid) schema['x-field-uid'] = field.uid
  if (field.fieldId) schema['x-field-id'] = field.fieldId
  if (field.displayName) schema['x-display-name'] = field.displayName
  if (field.unit) schema['x-unit'] = field.unit
  if (field.sensitive) schema['x-sensitive'] = true
  if (field.primary) schema['x-primary'] = true
  if (!field.editable) schema['x-editable'] = false
  if (field.displayType) schema['x-display'] = field.displayType
  if (field.description) schema.description = field.description
  if (field.extractionPrompt) schema['x-extraction-prompt'] = field.extractionPrompt
  if (field.skipExtraction) schema['x-skip-extraction'] = true
  schema['x-nullable'] = field.nullable !== false
  if (field.config) schema['x-extended-config'] = field.config
  if (field.formTemplate) schema['x-form-template'] = field.formTemplate
  if (field.fileType) schema['x-file-type'] = field.fileType
  if (field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== '') {
    schema.default = field.defaultValue
  }

  return schema
}

export const generateDefs = (enums) => {
  const defs = {}
  for (const [enumId, enumData] of Object.entries(enums)) {
    defs[enumId] = {
      type: enumData.type || 'string',
      enum: enumData.values,
    }
  }
  return defs
}
