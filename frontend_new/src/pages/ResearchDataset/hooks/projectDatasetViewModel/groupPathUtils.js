export const buildFieldLabelKeys = (groupId, fieldKey) => [
  `${groupId}.${fieldKey}`,
  `${groupId}/${fieldKey}`,
  fieldKey,
]

export const resolveFieldLabel = (groupId, fieldKey, fieldMapping) => {
  const candidates = buildFieldLabelKeys(groupId, fieldKey)
  for (const key of candidates) {
    if (fieldMapping?.[key]) return String(fieldMapping[key])
  }
  return String(fieldKey || '-')
}

export const parseGroupPath = (groupName) => {
  const text = String(groupName || '').trim()
  if (!text) return { folderName: '未分类', groupName: '未命名字段组' }
  const parts = text.split('/').map((item) => item.trim()).filter(Boolean)
  if (parts.length <= 1) {
    return {
      folderName: parts[0] || text,
      groupName: parts[0] || text,
    }
  }
  return {
    folderName: parts[0],
    groupName: parts.slice(1).join(' / '),
  }
}

export const buildFolderKey = (folderName) => {
  return String(folderName || '未分类').replace(/\s+/g, '_')
}

export const normalizeSegmentForCompare = (rawSegment) => {
  return String(rawSegment || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .trim()
}

export const getMatchedPrefixLength = (fieldSegments, groupSegments) => {
  if (!Array.isArray(fieldSegments) || !Array.isArray(groupSegments)) return 0
  const maxLen = Math.min(fieldSegments.length, groupSegments.length)
  let matchedLength = 0
  for (let index = 0; index < maxLen; index += 1) {
    const fieldSegment = normalizeSegmentForCompare(fieldSegments[index])
    const groupSegment = normalizeSegmentForCompare(groupSegments[index])
    if (!fieldSegment || !groupSegment || fieldSegment !== groupSegment) break
    matchedLength += 1
  }
  return matchedLength
}
