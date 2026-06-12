import { useCallback } from 'react'

export function useCandidateApplication({
  actions,
  draftData,
  onFieldCandidateSolidified,
  onSave,
  projectMode,
  setHistoryRefreshKey,
}) {
  return useCallback((fieldPath, value, rowUid = null) => {
    if (!fieldPath) return

    const nextData = JSON.parse(JSON.stringify(draftData || {}))
    const parts = String(fieldPath).split('.').filter(Boolean)
    if (parts.length === 0) return

    let cursor = nextData
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i]
      const nextPart = parts[i + 1]
      const nextIsArray = /^\d+$/.test(nextPart)
      if (/^\d+$/.test(part)) {
        const index = parseInt(part, 10)
        if (!Array.isArray(cursor)) return
        while (cursor.length <= index) cursor.push(nextIsArray ? [] : {})
        if (cursor[index] == null || typeof cursor[index] !== 'object') {
          cursor[index] = nextIsArray ? [] : {}
        }
        cursor = cursor[index]
      } else {
        if (cursor[part] == null || typeof cursor[part] !== 'object') {
          cursor[part] = nextIsArray ? [] : {}
        }
        cursor = cursor[part]
      }
    }

    const lastKey = parts[parts.length - 1]
    if (/^\d+$/.test(lastKey)) {
      const index = parseInt(lastKey, 10)
      if (!Array.isArray(cursor)) return
      while (cursor.length <= index) cursor.push(null)
      cursor[index] = value
    } else {
      cursor[lastKey] = value
    }

    if (rowUid) {
      let uidCursor = nextData
      for (const part of parts) {
        if (/^\d+$/.test(part)) {
          const index = parseInt(part, 10)
          if (!Array.isArray(uidCursor) || !uidCursor[index] || typeof uidCursor[index] !== 'object') {
            break
          }
          uidCursor[index]._row_uid = uidCursor[index]._row_uid || rowUid
          uidCursor = uidCursor[index]
          continue
        }
        if (!uidCursor || typeof uidCursor !== 'object') {
          break
        }
        uidCursor = uidCursor[part]
      }
    }

    actions.setPatientData(nextData)
    if (typeof onSave === 'function') {
      Promise.resolve(onSave(nextData, 'candidate')).catch((error) => {
        console.error('[SchemaForm] persist candidate failed:', error)
      })
    }
    setHistoryRefreshKey((tick) => tick + 1)
    if (projectMode && typeof onFieldCandidateSolidified === 'function') {
      Promise.resolve(onFieldCandidateSolidified({ fieldPath, value, nextData })).catch((error) => {
        console.error('[SchemaForm] onFieldCandidateSolidified failed:', error)
      })
    }
  }, [actions, draftData, onFieldCandidateSolidified, onSave, projectMode, setHistoryRefreshKey])
}
