import {
  archiveDocument,
  batchArchiveDocuments,
  confirmGroupArchive,
  matchGroup,
  resolveDocumentRecommendedPatientId,
} from '../../../api/document'
import { getGroupRecommendedPatient } from './formatters'

const getDocName = (doc) => {
  if (!doc) return ''
  return doc.file_name || doc.fileName || doc.name || (doc.id ? String(doc.id).slice(0, 8) : '')
}

const getDocNameById = (fileRecordMap, docId) => {
  const row = fileRecordMap.get(docId)
  return getDocName(row) || String(docId).slice(0, 8)
}

const enrichBatchRecord = ({ activeGroupKey, fileRecordMap, groupDocsMap, record, treeData, viewMode }) => {
  if (!record?.id) return record
  const merged = fileRecordMap.get(record.id) || record
  if (merged._groupId) return merged

  const treeGroup = (treeData?.todo_groups || []).find(
    (group) => Array.isArray(group.document_ids) && group.document_ids.includes(record.id)
  )
  if (treeGroup?.group_id) return { ...merged, _groupId: treeGroup.group_id }

  if (viewMode === 'patient' && activeGroupKey?.startsWith('group:')) {
    const groupId = activeGroupKey.slice('group:'.length)
    const cachedItems = groupDocsMap[groupId]?.items
    if (Array.isArray(cachedItems) && cachedItems.some((item) => item.id === record.id)) {
      return { ...merged, _groupId: groupId }
    }
  }

  return merged
}

export const getRecommendedArchiveBatchRecords = ({
  activeGroupKey,
  fileRecordMap,
  groupDocsMap,
  selectedRowKeys,
  treeData,
  viewMode,
}) => {
  const selectedRecords = selectedRowKeys
    .map((id) => enrichBatchRecord({
      activeGroupKey,
      fileRecordMap,
      groupDocsMap,
      record: fileRecordMap.get(id),
      treeData,
      viewMode,
    }))
    .filter(Boolean)

  return {
    eligible: selectedRecords.filter((record) => record?.id && record.task_status !== 'archived'),
    selectedRecords,
  }
}

export const confirmRecommendedArchiveBatch = async ({
  eligible,
  fileRecordMap,
  groupDocsMap,
  treeData,
}) => {
  let successCount = 0
  let skippedNoMatchCount = 0
  let failedArchiveCount = 0
  const skippedNoMatchDocNames = new Set()
  const failedArchiveDocNames = new Set()
  const processedGroupIds = new Set()
  const groupArchives = []
  const soloArchives = []

  for (const doc of eligible) {
    const groupId = doc._groupId
    if (!groupId) {
      soloArchives.push(doc)
      continue
    }
    if (processedGroupIds.has(groupId)) continue

    let matchedPatientId = getGroupRecommendedPatient(groupDocsMap[groupId]?.matchInfo).patientId
    if (!matchedPatientId) {
      try {
        const matchResponse = await matchGroup(groupId)
        matchedPatientId = getGroupRecommendedPatient(matchResponse?.data?.match_info || matchResponse?.data).patientId
      } catch {
        matchedPatientId = ''
      }
    }

    if (!matchedPatientId) {
      soloArchives.push(doc)
      continue
    }

    processedGroupIds.add(groupId)
    const selectedDocs = eligible.filter((item) => item._groupId === groupId)
    const cachedGroupItems = groupDocsMap[groupId]?.items
    const totalInGroup = Array.isArray(cachedGroupItems) && cachedGroupItems.length
      ? cachedGroupItems.length
      : (treeData?.todo_groups || []).find((group) => group.group_id === groupId)?.count

    groupArchives.push({
      archiveWholeGroup: !totalInGroup || selectedDocs.length >= totalInGroup,
      groupId,
      matchedPatientId,
      selectedDocs,
    })
  }

  for (const { archiveWholeGroup, groupId, matchedPatientId, selectedDocs } of groupArchives) {
    try {
      if (archiveWholeGroup) {
        const response = await confirmGroupArchive(groupId, matchedPatientId, true)
        if (response?.success) {
          successCount += response.data?.archived_count || 0
          failedArchiveCount += response.data?.failed_count || 0
          const errors = Array.isArray(response.data?.errors) ? response.data.errors : []
          errors.forEach((error) => {
            const docId = error?.document_id
            if (docId) failedArchiveDocNames.add(getDocNameById(fileRecordMap, docId))
          })
          if ((response.data?.archived_count || 0) > 0) continue
        }
      } else {
        const response = await batchArchiveDocuments(
          selectedDocs.map((doc) => doc.id),
          matchedPatientId,
          true
        )
        const ok = Number(response?.data?.total ?? response?.data?.items?.length ?? 0)
        if (response?.success && ok > 0) {
          successCount += ok
          continue
        }
      }
    } catch {}

    failedArchiveCount += selectedDocs.length
    selectedDocs.forEach((doc) => failedArchiveDocNames.add(getDocName(doc)))
  }

  for (const doc of soloArchives) {
    try {
      const resolved = await resolveDocumentRecommendedPatientId(doc.id, {
        fetchGroupMatchInfo: matchGroup,
        groupId: doc._groupId,
        groupMatchInfo: doc._groupId ? groupDocsMap[doc._groupId]?.matchInfo : null,
        treeGroups: treeData?.todo_groups || [],
      })
      const matchedPatientId = resolved.patientId
      if (!matchedPatientId) {
        skippedNoMatchCount += 1
        skippedNoMatchDocNames.add(getDocName(doc))
        continue
      }

      const response = await archiveDocument(doc.id, matchedPatientId, true)
      if (response?.success) successCount += 1
      else {
        failedArchiveCount += 1
        failedArchiveDocNames.add(getDocName(doc))
      }
    } catch {
      failedArchiveCount += 1
      failedArchiveDocNames.add(getDocName(doc))
    }
  }

  return {
    failedArchiveCount,
    failedArchiveDocNames,
    skippedNoMatchCount,
    skippedNoMatchDocNames,
    successCount,
  }
}
