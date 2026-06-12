import { orderedPropertyEntries } from '../SchemaFormContext'
import { hasEffectiveValue } from '../../../utils/valuePresence'

export function getNestedValue(obj, path) {
  if (!path || !obj) return undefined
  const keys = path.split('.')
  let result = obj
  for (const key of keys) {
    if (result == null) return undefined
    result = result[key]
  }
  return result
}

export function hasAnyData(data) {
  return hasEffectiveValue(data)
}

export function calculateFormProgress(schemaNode, data) {
  if (!schemaNode?.properties) return { filled: 0, total: 0 }

  let filled = 0
  let total = 0

  const countFields = (props, dataObj, parentNode) => {
    for (const [key, fieldSchema] of orderedPropertyEntries(props, parentNode)) {
      if (fieldSchema.type === 'array') {
        total += 1
        const arr = dataObj?.[key]
        if (hasEffectiveValue(arr)) filled += 1
      } else if (fieldSchema.type === 'object' && fieldSchema.properties) {
        countFields(fieldSchema.properties, dataObj?.[key], fieldSchema)
      } else {
        total += 1
        const value = dataObj?.[key]
        if (hasEffectiveValue(value)) filled += 1
      }
    }
  }

  countFields(schemaNode.properties, data, schemaNode)
  return { filled, total }
}

export function calculateFolderProgress(folderSchema, folderData) {
  if (!folderSchema?.properties) return { filled: 0, total: 0 }

  let totalFilled = 0
  let totalCount = 0

  for (const [formName, formSchema] of orderedPropertyEntries(folderSchema.properties, folderSchema)) {
    const formData = folderData?.[formName]
    const progress = calculateFormProgress(formSchema, formData)
    totalFilled += progress.filled
    totalCount += progress.total
  }

  return { filled: totalFilled, total: totalCount }
}

export function getSchemaAtPath(schema, path) {
  if (!path || !schema) return null

  const keys = path.split('.')
  let current = schema

  for (const key of keys) {
    if (!current) return null
    if (current.properties && current.properties[key]) {
      current = current.properties[key]
    } else if (current.items?.properties && current.items.properties[key]) {
      current = current.items.properties[key]
    } else {
      return null
    }
  }

  return current
}

export function isRepeatableForm(schema) {
  return !!(
    schema &&
    typeof schema === 'object' &&
    schema?.type === 'array' &&
    schema?.items?.type === 'object' &&
    schema?.items?.properties
  )
}

export function getRepeatableNaming(formName, schema) {
  const naming = schema?.['x-repeatable-naming']
  if (naming?.pattern) return naming.pattern
  return `${formName}`
}

export function generateInstanceName(pattern, index, startIndex = 1) {
  if (pattern.includes('{index}')) {
    return pattern.replace('{index}', index + startIndex)
  }
  return `${pattern}_${index + startIndex}`
}

export function createEmptyTemplate(itemSchema) {
  if (!itemSchema?.properties) return {}

  const template = {}
  for (const [key, fieldSchema] of orderedPropertyEntries(itemSchema.properties, itemSchema)) {
    if (fieldSchema.type === 'array') {
      template[key] = []
    } else if (fieldSchema.type === 'number') {
      template[key] = null
    } else if (fieldSchema.type === 'string') {
      template[key] = ''
    } else {
      template[key] = null
    }
  }
  return template
}

export function buildTreeData(schema, draftData) {
  if (!schema?.properties) return []

  const treeData = []
  for (const [folderName, folderSchema] of orderedPropertyEntries(schema.properties, schema)) {
    const folderPath = folderName
    const folderData = draftData ? getNestedValue(draftData, folderPath) : null
    const folderProgress = calculateFolderProgress(folderSchema, folderData)
    const folderNode = {
      key: folderPath,
      title: folderName,
      path: folderPath,
      level: 0,
      schemaNode: folderSchema,
      isFolder: true,
      isLeaf: false,
      hasData: hasAnyData(folderData),
      progress: folderProgress,
      children: [],
    }

    if (folderSchema.type === 'object' && folderSchema.properties) {
      for (const [formName, formSchema] of orderedPropertyEntries(folderSchema.properties, folderSchema)) {
        const formPath = `${folderPath}.${formName}`
        const formData = draftData ? getNestedValue(draftData, formPath) : null
        const hasData = hasAnyData(formData)
        const repeatable = isRepeatableForm(formSchema)

        if (repeatable) {
          const dataArray = Array.isArray(formData) ? formData : []
          const formProgress = calculateFormProgress(formSchema, formData)
          const namingPattern = getRepeatableNaming(formName, formSchema)
          const startIndex = formSchema?.['x-repeatable-naming']?.startIndex || 1
          const totalInstances = dataArray.length

          if (dataArray.length === 0) {
            folderNode.children.push({
              key: formPath,
              title: formName,
              path: formPath,
              level: 1,
              schemaNode: formSchema,
              isFolder: false,
              isForm: true,
              isFormInstance: false,
              isLeaf: true,
              isArray: true,
              isRepeatableForm: true,
              isEmptyPlaceholder: true,
              hasData: false,
              progress: formProgress,
              recordCount: 0,
            })
            continue
          }

          dataArray.forEach((itemData, index) => {
            const instanceName = generateInstanceName(namingPattern, index, startIndex)
            const instancePath = `${formPath}.${index}`
            const itemSchema = formSchema.items
            const progress = calculateFormProgress(itemSchema, itemData)
            folderNode.children.push({
              key: instancePath,
              title: instanceName,
              path: instancePath,
              level: 1,
              schemaNode: itemSchema,
              originalFormName: formName,
              originalFormPath: formPath,
              originalFormSchema: formSchema,
              isFolder: false,
              isForm: true,
              isFormInstance: true,
              isLeaf: true,
              isArray: false,
              isRepeatableForm: true,
              isEmptyPlaceholder: !hasAnyData(itemData),
              hasData: hasAnyData(itemData),
              progress,
              recordCount: totalInstances,
              instanceIndex: index,
              totalInstances,
            })
          })
        } else {
          const progress = calculateFormProgress(formSchema, formData)
          folderNode.children.push({
            key: formPath,
            title: formName,
            path: formPath,
            level: 1,
            schemaNode: formSchema,
            isFolder: false,
            isForm: true,
            isFormInstance: false,
            isLeaf: true,
            isArray: false,
            isRepeatableForm: false,
            isEmptyPlaceholder: !hasData,
            recordCount: 0,
            hasData: hasAnyData(formData),
            progress,
          })
        }
      }
    }

    treeData.push(folderNode)
  }

  return treeData
}

export function getFirstFormPath(treeData) {
  if (!Array.isArray(treeData) || treeData.length === 0) return null
  for (const folder of treeData) {
    const firstChild = Array.isArray(folder?.children) ? folder.children[0] : null
    if (firstChild?.path) return firstChild.path
  }
  return null
}
