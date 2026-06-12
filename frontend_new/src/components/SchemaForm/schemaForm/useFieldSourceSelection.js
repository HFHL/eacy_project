import { useCallback, useState } from 'react'

const resolveRowUidByPath = (sourceData, sourcePath) => {
  const parts = String(sourcePath || '').split('.').filter(Boolean)
  if (parts.length === 0) return null

  let node = sourceData
  let matchedRowUid = null
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      const index = Number(part)
      if (!Array.isArray(node) || node[index] == null) break
      const rowItem = node[index]
      if (rowItem && typeof rowItem === 'object' && rowItem._row_uid) {
        matchedRowUid = String(rowItem._row_uid)
      }
      node = rowItem
      continue
    }
    if (!node || typeof node !== 'object') break
    node = node[part]
  }
  return matchedRowUid
}

const resolveRecordInstanceIdByPath = (sourceData, sourcePath) => {
  const parts = String(sourcePath || '').split('.').filter(Boolean)
  if (parts.length === 0) return null

  let node = sourceData
  let matchedRecordInstanceId = null
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      const index = Number(part)
      if (!Array.isArray(node) || node[index] == null) break
      const rowItem = node[index]
      if (rowItem && typeof rowItem === 'object' && rowItem._record_instance_id) {
        matchedRecordInstanceId = String(rowItem._record_instance_id)
      }
      node = rowItem
      continue
    }
    if (!node || typeof node !== 'object') break
    node = node[part]
  }
  return matchedRecordInstanceId
}

export function useFieldSourceSelection({ draftData, rightCollapsed, setRightCollapsed }) {
  const [selectedField, setSelectedField] = useState(null)
  const [activeCoordinates, setActiveCoordinates] = useState(null)

  const handleFieldSourceClick = useCallback((path, schema, name, options = {}) => {
    const inferredRowUid = String(options?.rowUid || '').trim() || resolveRowUidByPath(draftData, path)
    const inferredRecordInstanceId = (
      String(options?.recordInstanceId || '').trim() ||
      String(options?.record_instance_id || '').trim() ||
      resolveRecordInstanceIdByPath(draftData, path)
    )

    setSelectedField({
      path,
      schema,
      name,
      rowUid: inferredRowUid || null,
      recordInstanceId: inferredRecordInstanceId || null,
    })
    setActiveCoordinates(null)
    if (options.forceOpen && rightCollapsed) setRightCollapsed(false)
  }, [draftData, rightCollapsed, setRightCollapsed])

  return {
    activeCoordinates,
    handleFieldSourceClick,
    selectedField,
  }
}
