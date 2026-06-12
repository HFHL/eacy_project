import { useEffect, useState } from 'react'
import { getFileListV2Counts } from '../../../api/document'

export const useDocumentRailCounts = ({
  activePrimaryNavKey,
  pathname,
  search,
}) => {
  const [documentCounts, setDocumentCounts] = useState({ all: 0, parse: 0, todo: 0, archived: 0 })

  useEffect(() => {
    let cancelled = false
    if (activePrimaryNavKey !== 'document') return () => { cancelled = true }

    const loadDocumentCounts = async () => {
      try {
        const response = await getFileListV2Counts()
        if (!response?.success || cancelled) return
        const counts = response.data?.counts || {}
        setDocumentCounts({
          all: Number(response.data?.total || 0),
          parse: Number(counts.parse_total || 0),
          todo: Number(counts.todo_total || 0),
          archived: Number(counts.archived_total || 0),
        })
      } catch {
        if (!cancelled) {
          setDocumentCounts({ all: 0, parse: 0, todo: 0, archived: 0 })
        }
      }
    }

    loadDocumentCounts()
    const timer = window.setInterval(loadDocumentCounts, 30000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activePrimaryNavKey, pathname, search])

  return documentCounts
}
