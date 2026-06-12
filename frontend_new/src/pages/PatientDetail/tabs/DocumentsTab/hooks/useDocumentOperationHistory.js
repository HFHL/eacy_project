import { useCallback, useEffect, useRef, useState } from 'react'
import { getDocumentOperationHistory } from '../../../../../api/document'

export const useDocumentOperationHistory = ({ activeTab, document, visible }) => {
  const historyLoadedForDocRef = useRef(null)
  const [operationHistory, setOperationHistory] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  const fetchOperationHistory = useCallback(async (documentId) => {
    setHistoryLoading(true)
    try {
      const response = await getDocumentOperationHistory(documentId, {
        include_upload: true,
        include_extractions: true,
        include_field_changes: true,
        include_conflict_resolves: true,
      })

      if (response.success && response.data) {
        setOperationHistory(response.data)
      } else {
        console.error('获取操作历史失败:', response.message)
      }
    } catch (error) {
      console.error('获取操作历史失败:', error)
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  const resetOperationHistory = useCallback(() => {
    setOperationHistory(null)
    historyLoadedForDocRef.current = null
  }, [])

  const refreshOperationHistory = useCallback(() => {
    if (document?.id) {
      fetchOperationHistory(document.id)
    }
  }, [document?.id, fetchOperationHistory])

  useEffect(() => {
    if (!visible || !document?.id || activeTab !== 'history') return
    if (historyLoadedForDocRef.current === document.id) return
    historyLoadedForDocRef.current = document.id
    fetchOperationHistory(document.id)
  }, [activeTab, document?.id, fetchOperationHistory, visible])

  return {
    historyLoading,
    operationHistory,
    refreshOperationHistory,
    resetOperationHistory,
  }
}
