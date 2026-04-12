/**
 * 共享的溯源匹配工具模块
 * 统一患者数据池 (SchemaForm) 和科研数据集 (ProjectDatasetView) 的 audit 匹配逻辑。
 */

export function toAuditPath(dotPath) {
  if (!dotPath || typeof dotPath !== 'string') return ''
  return dotPath.split('.').join(' / ')
}

export function toAuditPathWithoutIndex(dotPath) {
  if (!dotPath || typeof dotPath !== 'string') return ''
  const parts = dotPath.split('.').filter(p => !/^\d+$/.test(p))
  return parts.join(' / ')
}

/**
 * 归一化 audit key 或路径字符串，统一为 "a/b/c" 的纯斜杠无索引格式。
 */
export function normalizePathKey(path) {
  if (!path || typeof path !== 'string') return ''
  return path
    .replace(/\[(\d+|\*)\]/g, '')
    .replace(/\s*[./]\s*/g, '/')
    .replace(/\/\d+(?=\/|$)/g, '')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '')
}

export function getNestedValue(obj, dotPath) {
  if (!obj || typeof obj !== 'object') return undefined
  const parts = dotPath.split('.')
  let cur = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[p]
  }
  return cur
}

export function hasNestedKey(obj, dotPath) {
  if (!obj || typeof obj !== 'object') return false
  const parts = dotPath.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur == null || typeof cur !== 'object') return false
    cur = cur[parts[i]]
  }
  if (cur == null || typeof cur !== 'object') return false
  return parts[parts.length - 1] in cur
}

export function formatAuditDisplayValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) {
    if (value.length === 0) return '（空数组）'
    const first = value[0]
    if (typeof first === 'object' && first !== null) {
      return `（数组，共 ${value.length} 项）`
    }
    const preview = value.slice(0, 5).map(v => String(v)).join('，')
    return value.length > 5 ? `${preview}… (+${value.length - 5})` : preview
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v != null && v !== '')
    if (entries.length === 0) return '—'
    const preview = entries.slice(0, 5).map(([k, v]) => `${k}: ${String(v)}`).join('，')
    return entries.length > 5 ? `${preview}…` : preview
  }
  return String(value) || '—'
}

/**
 * 从扁平化的 audit fields 映射中，按 dotPath 做 4 级匹配。
 * 返回 audit 对象，可能附带 _index_stripped / _fuzzy_match 标志。
 *
 * @param {Object} flatAuditFields - { normalizedKey: auditValue, ... }
 *    或 allFieldMaps 数组（兼容患者数据池传入多个 fieldMap）
 * @param {string} dotPath - 前端字段点路径，如 "影像检查.超声.2.所见描述"
 * @returns {Object|null}
 */
export function resolveFieldAudit(fieldMaps, dotPath) {
  if (!dotPath) return null
  if (!Array.isArray(fieldMaps)) {
    fieldMaps = fieldMaps ? [fieldMaps] : []
  }
  if (fieldMaps.length === 0) return null

  const pathHasIndex = /\.\d+(\.|$)/.test(dotPath)

  const markIfNeeded = (v, fuzzy = false) => {
    if (!v || typeof v !== 'object') return v
    const flags = {}
    if (pathHasIndex) flags._index_stripped = true
    if (fuzzy) flags._fuzzy_match = true
    if (Object.keys(flags).length === 0) return v
    return { ...v, ...flags }
  }

  const normalizedMaps = fieldMaps.map(fields => {
    const m = new Map()
    for (const [key, value] of Object.entries(fields)) {
      if (value && typeof value === 'object') {
        m.set(normalizePathKey(key), value)
      }
    }
    return m
  })

  const pathVariants = [
    toAuditPath(dotPath),
    toAuditPathWithoutIndex(dotPath),
  ]

  // 方法1：精确匹配
  for (let vi = 0; vi < pathVariants.length; vi++) {
    const auditPath = pathVariants[vi]
    if (!auditPath) continue
    const normPath = normalizePathKey(auditPath)
    const isStripped = vi > 0
    for (const fields of fieldMaps) {
      const direct = fields[auditPath]
      if (direct && typeof direct === 'object') return isStripped ? markIfNeeded(direct) : direct
    }
    for (const nMap of normalizedMaps) {
      const hit = nMap.get(normPath)
      if (hit) return isStripped ? markIfNeeded(hit) : hit
    }
  }

  // 方法2：路径重叠匹配
  const basePathWithoutIndex = toAuditPathWithoutIndex(dotPath)
  if (basePathWithoutIndex) {
    const normBase = normalizePathKey(basePathWithoutIndex)
    const baseParts = normBase.split('/')
    let bestMatch = null
    for (const nMap of normalizedMaps) {
      for (const [normKey, value] of nMap.entries()) {
        if (!normKey) continue
        if (normKey.startsWith(normBase + '/') || normBase.endsWith('/' + normKey) || normBase === normKey) {
          if (!bestMatch || (value.document_id && value.bbox)) bestMatch = value
          if (bestMatch.document_id && bestMatch.bbox) return markIfNeeded(bestMatch, true)
          continue
        }
        for (let i = 1; i < baseParts.length; i++) {
          const suffix = baseParts.slice(i).join('/')
          if (normKey === suffix || normKey.startsWith(suffix + '/')) {
            if (!bestMatch || (value.document_id && value.bbox)) bestMatch = value
            break
          }
        }
      }
    }
    if (bestMatch) return markIfNeeded(bestMatch, true)
  }

  // 方法3：字段名后缀回退
  const segments = dotPath.split('.').filter(p => !/^\d+$/.test(p))
  const fieldName = segments[segments.length - 1]
  if (fieldName) {
    const suffix = '/' + fieldName
    for (const nMap of normalizedMaps) {
      for (const [normKey, value] of nMap.entries()) {
        if (normKey.endsWith(suffix) && (value.bbox || value.raw || value.value)) {
          return markIfNeeded(value, true)
        }
      }
    }
  }

  // 方法4：同层兄弟匹配
  if (basePathWithoutIndex) {
    const normBase = normalizePathKey(basePathWithoutIndex)
    const parentPath = normBase.includes('/') ? normBase.substring(0, normBase.lastIndexOf('/')) : ''
    if (parentPath) {
      const parentPrefix = parentPath + '/'
      let siblingMatch = null
      for (const nMap of normalizedMaps) {
        for (const [normKey, value] of nMap.entries()) {
          if (!normKey) continue
          if (normKey.startsWith(parentPrefix) && !normKey.substring(parentPrefix.length).includes('/')) {
            if (!siblingMatch || (value.document_id && value.bbox)) siblingMatch = value
            if (siblingMatch.document_id && siblingMatch.bbox) return markIfNeeded(siblingMatch, true)
          }
        }
      }
      if (!siblingMatch) {
        const parentParts = parentPath.split('/')
        for (const nMap of normalizedMaps) {
          for (const [normKey, value] of nMap.entries()) {
            if (!normKey) continue
            const keyParent = normKey.includes('/') ? normKey.substring(0, normKey.lastIndexOf('/')) : ''
            if (!keyParent) continue
            for (let i = 1; i < parentParts.length; i++) {
              const pSuffix = parentParts.slice(i).join('/')
              if (keyParent === pSuffix || keyParent.endsWith('/' + pSuffix) || pSuffix.endsWith('/' + keyParent)) {
                if (!siblingMatch || (value.document_id && value.bbox)) siblingMatch = value
                break
              }
            }
          }
        }
      }
      if (siblingMatch) return markIfNeeded(siblingMatch, true)
    }
  }

  return null
}

/**
 * 从患者数据池的 _extraction_metadata 中提取 audit field maps。
 */
export function collectPatientAuditFieldMaps(data) {
  const meta = data && typeof data === 'object' ? data._extraction_metadata : null
  const audit = meta && typeof meta === 'object' ? meta.audit : null
  if (!audit || typeof audit !== 'object') return []

  const allFieldMaps = []
  if (audit.fields && typeof audit.fields === 'object') {
    allFieldMaps.push(audit.fields)
  }
  for (const v of Object.values(audit)) {
    if (v && typeof v === 'object' && v.fields && typeof v.fields === 'object') {
      allFieldMaps.push(v.fields)
    }
  }
  return allFieldMaps
}

/**
 * 从科研数据集的 _task_results 中构建扁平化的 audit field maps。
 */
export function collectProjectAuditFieldMaps(taskResults) {
  if (!Array.isArray(taskResults)) return []
  const allFieldMaps = []
  for (const task of taskResults) {
    const auditFields = task?.audit?.fields
    if (auditFields && typeof auditFields === 'object') {
      allFieldMaps.push(auditFields)
    }
  }
  return allFieldMaps
}

/**
 * 科研数据集专用: 基于评分的 audit 匹配，考虑 task path 上下文。
 * 返回 { score, taskName, key, value } 或 null。
 */
export function findBestFieldAuditScored(taskResults, { fieldName, fieldPath, rowIndex = null, groupName = null }) {
  if (!Array.isArray(taskResults) || taskResults.length === 0) return null

  const getLeafName = (fp) => {
    if (!fp) return ''
    const parts = String(fp).split(/[./]/).filter(Boolean)
    return parts[parts.length - 1] || ''
  }

  const leafName = getLeafName(fieldPath || fieldName)
  const candidates = new Set(
    [fieldName, fieldPath, leafName]
      .filter(Boolean)
      .map(v => String(v))
  )
  if (Number.isInteger(rowIndex)) {
    const idx = Number(rowIndex)
    const basePath = fieldPath || fieldName || ''
    candidates.add(`${basePath}/[${idx}]`)
    candidates.add(`${basePath}/[${idx}]/${leafName}`)
    candidates.add(`[${idx}]/${leafName}`)
  }

  const simpleNormalize = (key) => String(key || '').replace(/\s+/g, '').replace(/\/+/g, '/')

  let best = null
  const normalizedCandidates = Array.from(candidates).map(simpleNormalize)

  for (const task of taskResults) {
    const auditFields = task?.audit?.fields || {}
    for (const [auditKey, auditValue] of Object.entries(auditFields)) {
      const normKey = simpleNormalize(auditKey)
      const exactMatch = candidates.has(auditKey) || normalizedCandidates.includes(normKey)
      const leafMatch = leafName && (auditKey.endsWith(`/${leafName}`) || auditKey === leafName)
      if (!exactMatch && !leafMatch) continue

      let score = exactMatch ? 3 : 1
      if (Array.isArray(task?.path) && task.path.length > 0 && fieldPath) {
        const normTaskPath = simpleNormalize(task.path.join('/'))
        const normField = simpleNormalize(String(fieldPath))
        if (normField.startsWith(normTaskPath + '/') || normField === normTaskPath) {
          score += 2
        }
      } else if (groupName && task?.task_name === groupName) {
        score += 2
      }
      if (Number.isInteger(rowIndex) && auditKey.includes(`[${Number(rowIndex)}]`)) score += 2

      if (!best || score > best.score) {
        best = { score, taskName: task?.task_name, key: auditKey, value: auditValue }
      }
    }
  }
  return best
}

/**
 * 科研数据集专用：从 crf_data 构建 FieldSourceModal 需要的 sourceContext。
 */
export function buildProjectFieldSourceContext(patientRecord, fieldData, options = {}) {
  const { fieldName, fieldPath, rowIndex = null, groupName = null } = options
  const crfData = patientRecord?.crf_data || {}
  const taskResults = crfData._task_results || []
  const documents = crfData._documents || {}
  const meta = {
    _extracted_at: crfData._extracted_at,
    _extraction_mode: crfData._extraction_mode,
    _stats: crfData._stats,
    _errors: crfData._errors,
    _edited_at: crfData._edited_at,
    _edited_by: crfData._edited_by,
    _task_results: taskResults,
  }

  const getLeafName = (fp) => {
    if (!fp) return ''
    const parts = String(fp).split(/[./]/).filter(Boolean)
    return parts[parts.length - 1] || ''
  }

  const bestAudit = findBestFieldAuditScored(taskResults, { fieldName, fieldPath, rowIndex, groupName })
  const aliases = [fieldName, fieldPath, getLeafName(fieldPath || fieldName), bestAudit?.key]
    .filter(Boolean)
    .map(v => String(v))
  const uniqueAliases = Array.from(new Set(aliases))

  const auditFields = {}
  if (bestAudit?.value) {
    uniqueAliases.forEach(alias => { auditFields[alias] = bestAudit.value })
  } else {
    uniqueAliases.forEach(alias => { auditFields[alias] = fieldData })
  }

  return {
    documents,
    audit: { fields: auditFields, ...meta },
  }
}
