export const normalizeSlashPath = (rawPath) => {
  return String(rawPath || '')
    .normalize('NFKC')
    .replace(/\s*\/\s*/g, '/')
    .trim()
}

export const getActiveGroupSourceFieldKeys = (activeGroup) => {
  if (!activeGroup || !Array.isArray(activeGroup.columns)) return []

  const pathSet = new Set()
  activeGroup.columns.forEach((column) => {
    const sourceFieldKeys = Array.isArray(column?.sourceFieldKeys) && column.sourceFieldKeys.length > 0
      ? column.sourceFieldKeys
      : [column?.key]
    sourceFieldKeys.forEach((fieldPath) => {
      const normalizedPath = normalizeSlashPath(fieldPath)
      if (normalizedPath) pathSet.add(normalizedPath)
    })
  })
  return [...pathSet]
}

export const buildActiveGroupCandidateKeys = (activeGroup) => {
  if (!activeGroup) return []

  const rawGroupName = String(activeGroup.group_name || '')
  const slashSegments = rawGroupName.split('/').map((segment) => segment.trim()).filter(Boolean)
  const slashSegmentsSpace = rawGroupName.split(' / ').map((segment) => segment.trim()).filter(Boolean)
  const groupPathTokens = Array.isArray(activeGroup.groupPathTokens) ? activeGroup.groupPathTokens : []
  const keys = [
    activeGroup.group_id,
    activeGroup.groupPath,
    activeGroup.repeatableDataPath,
    activeGroup.folderName,
    activeGroup.groupShortName,
    rawGroupName,
    groupPathTokens[0],
    slashSegments[0],
    slashSegmentsSpace[0],
  ].filter(Boolean)
  return [...new Set(keys)]
}
