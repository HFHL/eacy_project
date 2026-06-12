export function getNestedValue(obj, path) {
  if (!path) return obj
  const keys = path.split('.')
  let result = obj

  for (const key of keys) {
    if (result == null) return undefined
    if (/^\d+$/.test(key)) {
      result = result[parseInt(key, 10)]
    } else {
      result = result[key]
    }
  }

  return result
}

export function setNestedValue(obj, path, value) {
  if (!path) return
  const keys = path.split('.')
  let current = obj

  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i]
    const nextKey = keys[i + 1]
    const isNextArray = /^\d+$/.test(nextKey)

    if (/^\d+$/.test(key)) {
      const index = parseInt(key, 10)
      if (current[index] == null) {
        current[index] = isNextArray ? [] : {}
      }
      current = current[index]
    } else {
      if (current[key] == null) {
        current[key] = isNextArray ? [] : {}
      }
      current = current[key]
    }
  }

  const lastKey = keys[keys.length - 1]
  if (/^\d+$/.test(lastKey)) {
    current[parseInt(lastKey, 10)] = value
  } else {
    current[lastKey] = value
  }
}

/**
 * 按 x-property-order 遍历 schema properties，保留 CSV/设计器原始顺序
 * （PostgreSQL JSONB 会重排 object key，x-property-order 数组记录了正确顺序）
 */
export function orderedPropertyEntries(properties, parentNode) {
  if (!properties || typeof properties !== 'object') return []

  const order = parentNode && parentNode['x-property-order']
  if (Array.isArray(order) && order.length > 0) {
    const seen = new Set()
    const out = []
    for (const key of order) {
      if (Object.prototype.hasOwnProperty.call(properties, key) && !seen.has(key)) {
        out.push([key, properties[key]])
        seen.add(key)
      }
    }
    for (const key of Object.keys(properties)) {
      if (!seen.has(key)) {
        out.push([key, properties[key]])
        seen.add(key)
      }
    }
    return out
  }

  return Object.entries(properties)
}
