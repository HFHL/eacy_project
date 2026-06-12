import { readFieldValueFromGroupFields } from './groupFieldReader'
import {
  buildActiveGroupCandidateKeys,
  getActiveGroupSourceFieldKeys,
  normalizeSlashPath,
} from './groupPathUtils'

export const evaluateFieldsCoverage = (fields, activeFieldPaths, activeGroup) => {
  if (!fields || typeof fields !== 'object') return 0
  if (!Array.isArray(activeFieldPaths) || activeFieldPaths.length === 0) return 0

  const normalizedFieldEntries = Object.keys(fields)
    .map((rawFieldKey) => normalizeSlashPath(rawFieldKey))
    .filter(Boolean)

  let hitCount = 0
  activeFieldPaths.forEach((fieldPath) => {
    const normalizedFieldPath = normalizeSlashPath(fieldPath)
    const isKeyHit = normalizedFieldEntries.some((entryPath) => (
      entryPath === normalizedFieldPath
      || entryPath.endsWith(`/${normalizedFieldPath}`)
      || normalizedFieldPath.endsWith(`/${entryPath}`)
    ))
    if (isKeyHit) {
      hitCount += 1
      return
    }

    const probedValue = readFieldValueFromGroupFields(fields, fieldPath, activeGroup)
    if (probedValue !== null && probedValue !== undefined && probedValue !== '') {
      hitCount += 1
    }
  })
  return hitCount
}

export const evaluateGroupNodeCoverage = (groupNode, activeFieldPaths, activeGroup) => {
  if (!groupNode || typeof groupNode !== 'object') return 0

  let bestCoverage = 0
  const fields = groupNode?.fields && typeof groupNode.fields === 'object' ? groupNode.fields : {}
  bestCoverage = Math.max(bestCoverage, evaluateFieldsCoverage(fields, activeFieldPaths, activeGroup))

  const records = Array.isArray(groupNode?.records) ? groupNode.records : []
  records.forEach((record) => {
    if (!record || typeof record !== 'object') return
    const recordFields = record?.fields && typeof record.fields === 'object'
      ? record.fields
      : record
    bestCoverage = Math.max(bestCoverage, evaluateFieldsCoverage(recordFields, activeFieldPaths, activeGroup))
  })
  return bestCoverage
}

const resolveBestChildNodeFromContainer = (containerNode, activeFieldPaths, activeGroup) => {
  if (!containerNode || typeof containerNode !== 'object') {
    return { node: null, childKey: null, coverage: 0 }
  }

  const nestedGroups = containerNode?.groups && typeof containerNode.groups === 'object'
    ? containerNode.groups
    : {}
  let bestNode = null
  let bestChildKey = null
  let bestCoverage = 0

  Object.entries(nestedGroups).forEach(([childKey, childNode]) => {
    if (!childNode || typeof childNode !== 'object') return
    const coverage = evaluateGroupNodeCoverage(childNode, activeFieldPaths, activeGroup)
    if (coverage > bestCoverage) {
      bestCoverage = coverage
      bestNode = childNode
      bestChildKey = childKey
    }
  })
  return { node: bestNode, childKey: bestChildKey, coverage: bestCoverage }
}

export const resolveActiveGroupMatch = ({ activeGroup, enableLegacyGroupFallback, patient }) => {
  const groupMap = patient?.crf_data?.groups && typeof patient.crf_data.groups === 'object'
    ? patient.crf_data.groups
    : {}
  const allCandidateKeys = buildActiveGroupCandidateKeys(activeGroup)
  const normalizedFolderName = normalizeSlashPath(activeGroup?.folderName)
  const strictCandidateKeys = allCandidateKeys.filter((candidateKey) => {
    const normalizedCandidate = normalizeSlashPath(candidateKey)
    return normalizedCandidate && normalizedCandidate !== normalizedFolderName
  })
  const fallbackCandidateKeys = allCandidateKeys.filter((candidateKey) => {
    const normalizedCandidate = normalizeSlashPath(candidateKey)
    return normalizedCandidate && normalizedCandidate === normalizedFolderName
  })
  const activeFieldPaths = getActiveGroupSourceFieldKeys(activeGroup)
  const normalizedEntries = Object.entries(groupMap).map(([rawKey, node]) => ({
    rawKey,
    normalizedKey: normalizeSlashPath(rawKey),
    node,
  }))

  const tryMatchByCandidateKeys = (candidateKeys) => {
    for (const groupKey of candidateKeys) {
      const normalizedCandidateKey = normalizeSlashPath(groupKey)
      const matchedEntry = normalizedEntries.find((entry) => entry.normalizedKey === normalizedCandidateKey)
      if (!matchedEntry || !matchedEntry.node || typeof matchedEntry.node !== 'object') continue

      const directCoverage = evaluateGroupNodeCoverage(matchedEntry.node, activeFieldPaths, activeGroup)
      if (directCoverage > 0) {
        return {
          groupNode: matchedEntry.node,
          matchedGroupKey: matchedEntry.rawKey,
          matchedCandidateKey: groupKey,
          candidateKeys: allCandidateKeys,
        }
      }

      const bestChild = resolveBestChildNodeFromContainer(matchedEntry.node, activeFieldPaths, activeGroup)
      if (bestChild.node && bestChild.coverage > 0) {
        return {
          groupNode: bestChild.node,
          matchedGroupKey: `${matchedEntry.rawKey}/${bestChild.childKey}`,
          matchedCandidateKey: '__container_child_match__',
          candidateKeys: allCandidateKeys,
        }
      }

      return {
        groupNode: matchedEntry.node,
        matchedGroupKey: matchedEntry.rawKey,
        matchedCandidateKey: groupKey,
        candidateKeys: allCandidateKeys,
      }
    }
    return null
  }

  const strictMatch = tryMatchByCandidateKeys(strictCandidateKeys)
  if (strictMatch) return { ...strictMatch, matchedMode: 'strict-key' }
  if (!enableLegacyGroupFallback) {
    return {
      groupNode: null,
      matchedGroupKey: null,
      matchedCandidateKey: null,
      matchedMode: 'strict-miss',
      candidateKeys: allCandidateKeys,
    }
  }

  let bestCoverageMatch = null
  normalizedEntries.forEach((entry) => {
    const directCoverage = evaluateGroupNodeCoverage(entry.node, activeFieldPaths, activeGroup)
    const bestChild = resolveBestChildNodeFromContainer(entry.node, activeFieldPaths, activeGroup)
    let candidateCoverage = directCoverage
    let candidateNode = entry.node
    let candidateGroupKey = entry.rawKey
    let candidateKey = '__field_coverage_match__'
    if (bestChild?.node && bestChild.coverage > candidateCoverage) {
      candidateCoverage = bestChild.coverage
      candidateNode = bestChild.node
      candidateGroupKey = `${entry.rawKey}/${bestChild.childKey}`
      candidateKey = '__field_coverage_child_match__'
    }
    if (candidateCoverage <= 0) return
    if (!bestCoverageMatch || candidateCoverage > bestCoverageMatch.coverage) {
      bestCoverageMatch = {
        coverage: candidateCoverage,
        groupNode: candidateNode,
        matchedGroupKey: candidateGroupKey,
        matchedCandidateKey: candidateKey,
      }
    }
  })
  if (bestCoverageMatch?.groupNode && typeof bestCoverageMatch.groupNode === 'object') {
    return {
      groupNode: bestCoverageMatch.groupNode,
      matchedGroupKey: bestCoverageMatch.matchedGroupKey,
      matchedCandidateKey: bestCoverageMatch.matchedCandidateKey,
      matchedMode: 'field-coverage',
      candidateKeys: allCandidateKeys,
    }
  }

  const fallbackMatch = tryMatchByCandidateKeys(fallbackCandidateKeys)
  if (fallbackMatch) return { ...fallbackMatch, matchedMode: 'folder-fallback' }

  for (const groupKey of allCandidateKeys) {
    const normalizedCandidateKey = normalizeSlashPath(groupKey)
    const matchedEntry = normalizedEntries.find((entry) => entry.normalizedKey === normalizedCandidateKey)
    if (matchedEntry && matchedEntry.node && typeof matchedEntry.node === 'object') {
      return {
        groupNode: matchedEntry.node,
        matchedGroupKey: matchedEntry.rawKey,
        matchedCandidateKey: groupKey,
        matchedMode: 'candidate-relaxed',
        candidateKeys: allCandidateKeys,
      }
    }
  }

  return {
    groupNode: null,
    matchedGroupKey: null,
    matchedCandidateKey: null,
    matchedMode: 'missing',
    candidateKeys: allCandidateKeys,
  }
}
