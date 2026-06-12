import { DISPLAY_TYPES } from '../constants.js'
import {
  generateId,
  inferDataType,
  inferDisplayType,
  inferOptionsId,
  orderedPropertyEntries,
  parseExtendedConfig,
  parseOptions,
  parseTableRows,
} from './utils.js'

export const parseField = (name, schema, isRequired = false, enums = {}) => {
  const displayType = schema['x-display'] || inferDisplayType(schema)
  const dataType = schema.type || inferDataType(displayType)
  const options = parseOptions(schema, enums)
  const nullableFromExt = typeof schema['x-nullable'] === 'boolean' ? schema['x-nullable'] : null
  const nullable = nullableFromExt === null ? !isRequired : nullableFromExt

  return {
    id: generateId('field'),
    uid: schema['x-field-uid'] || null,
    fieldId: schema['x-field-id'] || schema['x-field-uid'] || null,
    name,
    displayName: schema['x-display-name'] || name,
    displayType,
    dataType,
    options,
    optionsId: schema['x-options-id'] || inferOptionsId(schema) || null,
    unit: schema['x-unit'] || null,
    nullable,
    sensitive: !!schema['x-sensitive'],
    primary: !!schema['x-primary'],
    editable: schema['x-editable'] !== false,
    formTemplate: schema['x-form-template'] || null,
    fileType: schema['x-file-type'] || null,
    description: schema.description || '',
    extractionPrompt: schema['x-extraction-prompt'] || '',
    skipExtraction: !!schema['x-skip-extraction'],
    conflictPolicy: schema['x-conflict-policy'] || null,
    required: isRequired,
    format: schema.format || null,
    defaultValue: schema.default || null,
    minimum: typeof schema.minimum === 'number' ? schema.minimum : undefined,
    maximum: typeof schema.maximum === 'number' ? schema.maximum : undefined,
    pattern: schema.pattern || undefined,
    children: null,
    config: parseExtendedConfig(schema),
    category: 'single',
  }
}

export const parseFields = (groupSchema, required, folderName, groupName, enums) => {
  const fields = []
  if (!groupSchema.properties) return fields

  for (const [fieldName, fieldSchema] of orderedPropertyEntries(groupSchema.properties, groupSchema)) {
    if (fieldSchema.type === 'object' ||
        (fieldSchema.type === 'array' && fieldSchema.items?.type === 'object')) {
      const nestedTarget = fieldSchema.type === 'array' ? fieldSchema.items : fieldSchema
      const nestedRequired = nestedTarget?.required || []
      const nestedFields = parseFields(nestedTarget, nestedRequired, folderName, `${groupName}/${fieldName}`, enums)
      if (nestedFields.length > 0) {
        const isMultiRow = parseTableRows(fieldSchema) === 'multiRow'
        fields.push({
          id: generateId('field'),
          uid: fieldSchema['x-field-uid'] || null,
          fieldId: fieldSchema['x-field-id'] || fieldSchema['x-field-uid'] || null,
          name: fieldName,
          displayName: fieldName,
          displayType: DISPLAY_TYPES.TABLE,
          dataType: 'array',
          repeatable: isMultiRow,
          multiRow: isMultiRow,
          isTable: true,
          nullable: true,
          sensitive: !!fieldSchema['x-sensitive'],
          primary: !!fieldSchema['x-primary'],
          editable: fieldSchema['x-editable'] !== false,
          description: fieldSchema.description || '',
          required: false,
          children: nestedFields,
          config: {
            tableRows: isMultiRow ? 'multiRow' : 'singleRow',
          },
        })
      }
      continue
    }

    fields.push(parseField(fieldName, fieldSchema, required.includes(fieldName), enums))
  }

  return fields
}
