import { useMemo } from 'react'
import { orderedPropertyEntries } from '../SchemaFormContext'
import { normalizeRepeatableTableSchema } from '../schemaRenderKernel'

export function getRenderableSchemaParts(schemaNode) {
  if (schemaNode?.type === 'array' && schemaNode.items?.properties) {
    return {
      iterableOwner: schemaNode.items,
      propertiesToIterate: schemaNode.items.properties,
      requiredFields: schemaNode.items.required || [],
    }
  }
  if (schemaNode?.properties) {
    return {
      iterableOwner: schemaNode,
      propertiesToIterate: schemaNode.properties,
      requiredFields: schemaNode.required || [],
    }
  }
  return {
    iterableOwner: null,
    propertiesToIterate: null,
    requiredFields: [],
  }
}

export function useSchemaFieldGroups(schemaNode, path) {
  const { iterableOwner, propertiesToIterate, requiredFields } = getRenderableSchemaParts(schemaNode)

  const groups = useMemo(() => {
    if (!propertiesToIterate || !iterableOwner) {
      return { simpleFields: [], nestedArrays: [], nestedObjects: [] }
    }

    const simpleFields = []
    const nestedArrays = []
    const nestedObjects = []

    console.log('[FullFormRenderer] 开始分析字段，path:', path)

    for (const [fieldName, rawFieldSchema] of orderedPropertyEntries(propertiesToIterate, iterableOwner)) {
      const fieldSchema = normalizeRepeatableTableSchema(rawFieldSchema)
      const isTableType = rawFieldSchema['x-display'] === 'table' || fieldSchema['x-display'] === 'table'
      const fieldNameLower = fieldName.toLowerCase()
      const isLikelyTable = fieldNameLower.includes('表') || fieldNameLower.includes('table') || isTableType

      if (isLikelyTable || isTableType) {
        console.group(`[FullFormRenderer] 表格字段分析: ${fieldName}`)
        console.log('原始Schema类型:', rawFieldSchema.type)
        console.log('标准化后类型:', fieldSchema.type)
        console.log('x-display:', rawFieldSchema['x-display'])
        console.log('x-row-constraint:', rawFieldSchema['x-row-constraint'])
        console.log('x-table-config:', rawFieldSchema['x-table-config'])
        console.log('x-extended-config:', rawFieldSchema['x-extended-config'])
        console.log('是否有 items:', !!fieldSchema.items)
        console.log('items.properties 是否存在:', !!fieldSchema.items?.properties)
        console.log('properties 是否存在:', !!fieldSchema.properties)
        console.log('判定结果:', {
          isArray: fieldSchema.type === 'array',
          hasItemsProperties: !!(fieldSchema.items?.properties),
          isObject: fieldSchema.type === 'object',
          hasProperties: !!fieldSchema.properties,
          最终归类: fieldSchema.type === 'array' && fieldSchema.items?.properties
            ? 'arrays'
            : (fieldSchema.type === 'object' && fieldSchema.properties ? 'objects' : 'simple'),
        })
        console.groupEnd()
      }

      if (fieldSchema.type === 'array' && fieldSchema.items?.properties) {
        nestedArrays.push({ fieldName, fieldSchema })
      } else if (fieldSchema.type === 'object' && fieldSchema.properties) {
        nestedObjects.push({ fieldName, fieldSchema })
      } else {
        simpleFields.push({ fieldName, fieldSchema })
      }
    }

    console.log('[FullFormRenderer] 字段分类统计:', {
      简单字段: simpleFields.length,
      数组字段: nestedArrays.length,
      对象字段: nestedObjects.length,
      数组字段列表: nestedArrays.map((item) => item.fieldName),
      对象字段列表: nestedObjects.map((item) => item.fieldName),
    })

    return { simpleFields, nestedArrays, nestedObjects }
  }, [iterableOwner, path, propertiesToIterate])

  return {
    ...groups,
    propertiesToIterate,
    requiredFields,
  }
}
