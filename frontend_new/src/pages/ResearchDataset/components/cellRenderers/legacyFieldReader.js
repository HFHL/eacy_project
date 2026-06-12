import {
  normalizeSlashPath,
  readObjectPath,
} from './fieldPathUtils'

const extractFieldValue = (fieldData) => {
  if (fieldData === null || fieldData === undefined) return null
  if (typeof fieldData !== 'object') return fieldData
  if (Object.prototype.hasOwnProperty.call(fieldData, 'value')) return fieldData.value
  return fieldData
}

const buildPathCandidates = (normalizedFieldKey, pathSegments, groupName) => {
  const candidates = [normalizedFieldKey]
  const normalizedGroupName = normalizeSlashPath(groupName || '')
  if (normalizedGroupName && normalizedFieldKey.startsWith(`${normalizedGroupName}/`)) {
    candidates.push(normalizedFieldKey.slice(normalizedGroupName.length + 1))
  }
  if (pathSegments.length > 1) {
    candidates.push(pathSegments.slice(1).join('/'))
  }
  return [...new Set(candidates.filter(Boolean))]
}

const readFromGroup = (groupNode, pathCandidates, strictPathOnly) => {
  const fields = groupNode?.fields && typeof groupNode.fields === 'object' ? groupNode.fields : {}
  const fieldEntries = Object.entries(fields)
  for (const pathKey of pathCandidates) {
    const matchedEntry = fieldEntries.find(([rawKey]) => normalizeSlashPath(rawKey) === pathKey)
    if (matchedEntry) return extractFieldValue(matchedEntry[1])
  }

  for (const pathKey of pathCandidates) {
    const suffixMatches = fieldEntries.filter(([rawKey]) => {
      const normalizedRawKey = normalizeSlashPath(rawKey)
      return pathKey.endsWith(`/${normalizedRawKey}`) || normalizedRawKey.endsWith(`/${pathKey}`)
    })
    if (suffixMatches.length > 0) {
      suffixMatches.sort((a, b) => String(b[0]).length - String(a[0]).length)
      return extractFieldValue(suffixMatches[0][1])
    }
  }

  if (!strictPathOnly) {
    for (const pathKey of pathCandidates) {
      const nestedValue = readObjectPath(fields, pathKey)
      if (nestedValue !== null && nestedValue !== undefined) return nestedValue
    }
  }
  return null
}

const buildGroupCandidates = ({ groupId, groupName, groupPathTokens, pathSegments }) => {
  const normalizedGroupName = normalizeSlashPath(groupName || '')
  const normalizedGroupPathTokens = Array.isArray(groupPathTokens)
    ? groupPathTokens.map((token) => normalizeSlashPath(token)).filter(Boolean)
    : []
  const groupSegments = normalizedGroupName.split('/').map((segment) => segment.trim()).filter(Boolean)
  const candidates = [
    normalizeSlashPath(groupId),
    normalizedGroupName,
    ...normalizedGroupPathTokens,
    groupSegments[0],
    pathSegments[0],
  ].filter(Boolean)
  return [...new Set(candidates)]
}

export const getFieldRawValue = (patient, groupId, fieldKey, options = {}) => {
  const normalizedFieldKey = normalizeSlashPath(fieldKey)
  const pathSegments = normalizedFieldKey.split('/').filter(Boolean)
  const strictPathOnly = options?.strictPathOnly !== false
  const crfGroups = patient?.crfGroups && typeof patient.crfGroups === 'object' ? patient.crfGroups : {}
  const pathCandidates = buildPathCandidates(normalizedFieldKey, pathSegments, options?.groupName || '')
  const groupCandidates = buildGroupCandidates({
    groupId,
    groupName: options?.groupName,
    groupPathTokens: options?.groupPathTokens,
    pathSegments,
  })
  const normalizedGroupEntries = Object.entries(crfGroups).map(([rawKey, groupNode]) => ({
    rawKey,
    normalizedKey: normalizeSlashPath(rawKey),
    groupNode,
  }))

  for (const candidateKey of groupCandidates) {
    const matchedGroup = normalizedGroupEntries.find((entry) => entry.normalizedKey === normalizeSlashPath(candidateKey))
    if (!matchedGroup) continue
    const value = readFromGroup(matchedGroup.groupNode, pathCandidates, strictPathOnly)
    if (value !== null) return value
  }

  if (!strictPathOnly) {
    const crfDataRoot = patient?.crf_data?.data
    for (const pathKey of pathCandidates) {
      const value = readObjectPath(crfDataRoot, pathKey)
      if (value !== null && value !== undefined) return value
    }
  }

  return null
}
