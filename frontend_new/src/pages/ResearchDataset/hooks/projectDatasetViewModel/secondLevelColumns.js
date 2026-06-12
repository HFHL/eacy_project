import { normalizeSlashPath } from '../../adapters/schemaKernelAdapter'
import {
  getMatchedPrefixLength,
  normalizeSegmentForCompare,
  parseGroupPath,
} from './groupPathUtils'

const resolveRelativeSegments = ({ fieldSegments, fullPath, groupName, parsedGroupPath }) => {
  const normalizedGroupPath = normalizeSlashPath(groupName)
  const normalizedFullPath = normalizeSlashPath(fullPath)
  const groupPathSegments = String(groupName || '').split('/').map((segment) => segment.trim()).filter(Boolean)
  let relativeSegments = fieldSegments
  let usedWholePathPrefix = false

  if (normalizedGroupPath && normalizedFullPath.startsWith(`${normalizedGroupPath}/`)) {
    const normalizedRelative = normalizedFullPath.slice(normalizedGroupPath.length + 1)
    const normalizedRelativeSegments = normalizedRelative.split('/').map((segment) => segment.trim()).filter(Boolean)
    if (normalizedRelativeSegments.length > 0) {
      relativeSegments = normalizedRelativeSegments
      usedWholePathPrefix = true
    }
  }

  if (!usedWholePathPrefix) {
    const matchedPrefixLength = getMatchedPrefixLength(fieldSegments, groupPathSegments)
    if (matchedPrefixLength > 0 && fieldSegments.length > matchedPrefixLength) {
      relativeSegments = fieldSegments.slice(matchedPrefixLength)
    } else if (matchedPrefixLength === 0) {
      const folderPrefixLength = getMatchedPrefixLength(fieldSegments, [parsedGroupPath.folderName].filter(Boolean))
      if (folderPrefixLength > 0 && fieldSegments.length > folderPrefixLength) {
        relativeSegments = fieldSegments.slice(folderPrefixLength)
      }
    }
  }

  return { groupPathSegments, relativeSegments }
}

const resolveSecondLevelKey = ({ fieldSegments, groupPathSegments, relativeSegments }) => {
  const normalizedGroupSegments = groupPathSegments.map((segment) => normalizeSegmentForCompare(segment))
  const firstRelativeSegment = relativeSegments[0] || ''
  const normalizedFirstRelative = normalizeSegmentForCompare(firstRelativeSegment)
  const shouldSkipFirstRelative = relativeSegments.length > 1
    && normalizedGroupSegments.includes(normalizedFirstRelative)
  return shouldSkipFirstRelative
    ? relativeSegments[1]
    : (firstRelativeSegment || fieldSegments[fieldSegments.length - 1])
}

export const buildSecondLevelColumns = (groupName, dbFields) => {
  const parsedGroupPath = parseGroupPath(groupName)
  const bucketMap = new Map()

  dbFields.forEach((fieldPath) => {
    const fullPath = String(fieldPath || '').trim()
    if (!fullPath) return
    const fieldSegments = fullPath.split('/').map((segment) => segment.trim()).filter(Boolean)
    const { groupPathSegments, relativeSegments } = resolveRelativeSegments({
      fieldSegments,
      fullPath,
      groupName,
      parsedGroupPath,
    })
    const secondLevelKey = resolveSecondLevelKey({ fieldSegments, groupPathSegments, relativeSegments })
    if (!secondLevelKey) return

    const existingBucket = bucketMap.get(secondLevelKey) || {
      key: secondLevelKey,
      title: secondLevelKey,
      sourceFieldKeys: [],
      maxDepth: 1,
    }
    existingBucket.sourceFieldKeys.push(fullPath)
    existingBucket.maxDepth = Math.max(existingBucket.maxDepth, relativeSegments.length)
    bucketMap.set(secondLevelKey, existingBucket)
  })

  return [...bucketMap.values()].map((bucket) => ({
    key: bucket.key,
    title: bucket.title,
    sourceFieldKeys: bucket.sourceFieldKeys,
    nodeKind: bucket.sourceFieldKeys.length === 1 && bucket.maxDepth <= 1 ? 'scalar' : 'complex',
  }))
}
