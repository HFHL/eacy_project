export const normalizeSchemaForDesigner = (schema) => {
  try {
    if (!schema || typeof schema !== 'object') return schema
    const normalizedSchema = JSON.parse(JSON.stringify(schema))
    if (!normalizedSchema.properties || typeof normalizedSchema.properties !== 'object') {
      return normalizedSchema
    }

    for (const [rootKey, rootNode] of Object.entries(normalizedSchema.properties)) {
      if (!rootNode || typeof rootNode !== 'object') continue

      const hasProps = !!(rootNode.properties && typeof rootNode.properties === 'object')
      const isFolderShape = rootNode.type === 'object' || (!rootNode.type && hasProps)

      if (isFolderShape) {
        rootNode.type = 'object'
        rootNode.properties = rootNode.properties || {}
        if (rootNode.unevaluatedProperties === undefined) {
          rootNode.unevaluatedProperties = false
        }
        continue
      }

      const looksLikeGroup =
        rootNode.type === 'array' ||
        rootNode.type === 'object' ||
        hasProps ||
        (rootNode.items && typeof rootNode.items === 'object')

      if (looksLikeGroup) {
        normalizedSchema.properties[rootKey] = {
          type: 'object',
          unevaluatedProperties: false,
          properties: {
            [rootKey]: rootNode,
          },
        }
      }
    }

    return normalizedSchema
  } catch (_error) {
    return schema
  }
}
