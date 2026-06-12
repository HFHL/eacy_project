const getLeafName = (fieldPath) => {
  if (!fieldPath) return ''
  const parts = String(fieldPath).split(/[./]/).filter(Boolean)
  return parts[parts.length - 1] || ''
}

const simpleNormalize = (key) => String(key || '').replace(/\s+/g, '').replace(/\/+/g, '/')

export function findBestFieldAuditScored(taskResults, { fieldName, fieldPath, rowIndex = null, groupName = null }) {
  if (!Array.isArray(taskResults) || taskResults.length === 0) return null

  const leafName = getLeafName(fieldPath || fieldName)
  const candidates = new Set(
    [fieldName, fieldPath, leafName]
      .filter(Boolean)
      .map((value) => String(value)),
  )
  if (Number.isInteger(rowIndex)) {
    const index = Number(rowIndex)
    const basePath = fieldPath || fieldName || ''
    candidates.add(`${basePath}/[${index}]`)
    candidates.add(`${basePath}/[${index}]/${leafName}`)
    candidates.add(`[${index}]/${leafName}`)
  }

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
        if (normField.startsWith(`${normTaskPath}/`) || normField === normTaskPath) {
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

  const bestAudit = findBestFieldAuditScored(taskResults, { fieldName, fieldPath, rowIndex, groupName })
  const aliases = [fieldName, fieldPath, getLeafName(fieldPath || fieldName), bestAudit?.key]
    .filter(Boolean)
    .map((value) => String(value))
  const uniqueAliases = Array.from(new Set(aliases))

  const auditFields = {}
  if (bestAudit?.value) {
    uniqueAliases.forEach((alias) => { auditFields[alias] = bestAudit.value })
  } else {
    uniqueAliases.forEach((alias) => { auditFields[alias] = fieldData })
  }

  return {
    documents,
    audit: { fields: auditFields, ...meta },
  }
}
