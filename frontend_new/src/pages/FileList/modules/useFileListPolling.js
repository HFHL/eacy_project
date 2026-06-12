import { useEffect, useRef } from 'react'
import {
  getDocumentTaskProgress,
  getFileStatusesByIds,
} from '../../../api/document'

export const useFileListPolling = ({
  fileListVersionRef,
  matchTaskMap,
  message,
  pollingAiMatchIds,
  pollingParseIds,
  refreshAll,
  setFileList,
  setMatchingDocIds,
  setMatchTaskMap,
  setPollingAiMatchIds,
  setPollingParseIds,
}) => {
  const pollingParseIdsRef = useRef(pollingParseIds)
  const matchTaskMapRef = useRef(matchTaskMap)
  const pollingAiMatchIdsRef = useRef(pollingAiMatchIds)
  const pollingTimerRef = useRef(null)
  const pollingInFlightRef = useRef(false)

  useEffect(() => { pollingParseIdsRef.current = pollingParseIds }, [pollingParseIds])
  useEffect(() => { matchTaskMapRef.current = matchTaskMap }, [matchTaskMap])
  useEffect(() => { pollingAiMatchIdsRef.current = pollingAiMatchIds }, [pollingAiMatchIds])

  useEffect(() => {
    const pollInterval = 2500
    const inProgress = new Set(['uploaded', 'parsing', 'ai_matching'])
    const aiMatchDone = new Set([
      'pending_confirm_new',
      'pending_confirm_review',
      'pending_confirm_uncertain',
      'auto_archived',
    ])

    const patchFileListById = (items) => {
      if (!items?.length) return
      const byId = new Map(items.map((item) => [item.id, item]))
      setFileList((prev) => prev.map((item) => {
        const updated = byId.get(item.id)
        return updated ? { ...item, ...updated } : item
      }))
    }

    const tick = async () => {
      if (pollingInFlightRef.current) return
      const parseIds = Array.from(pollingParseIdsRef.current || [])
      const aiMatchIds = Array.from(pollingAiMatchIdsRef.current || [])
      const matchEntries = Array.from(matchTaskMapRef.current?.entries() || [])
      if (!parseIds.length && !aiMatchIds.length && !matchEntries.length) return

      pollingInFlightRef.current = true
      const versionBefore = fileListVersionRef.current
      try {
        const statusIdSet = new Set([...parseIds, ...aiMatchIds])
        const [statusResponse, ...matchResults] = await Promise.all([
          statusIdSet.size
            ? getFileStatusesByIds([...statusIdSet])
            : Promise.resolve(null),
          ...matchEntries.map(([documentId, taskId]) => (
            getDocumentTaskProgress(taskId, { silent: true })
              .then((response) => ({ documentId, taskId, response }))
              .catch(() => ({ documentId, taskId, response: null }))
          )),
        ])

        if (fileListVersionRef.current !== versionBefore) return

        if (statusResponse?.success && statusResponse?.data?.items?.length) {
          const items = statusResponse.data.items
          patchFileListById(items)

          if (parseIds.length) {
            const completedParse = items.filter((item) => item.task_status && !inProgress.has(item.task_status))
            if (completedParse.length) {
              setPollingParseIds((prev) => {
                const next = new Set(prev)
                completedParse.forEach((item) => next.delete(item.id))
                return next
              })
              if (completedParse.some((item) => !['uploaded', 'parse_failed'].includes(item.task_status))) {
                refreshAll({ forceTree: true })
              }
            }
          }

          if (aiMatchIds.length) {
            const completedAi = items.filter((item) => item.task_status && item.task_status !== 'ai_matching')
            if (completedAi.length) {
              setPollingAiMatchIds((prev) => {
                const next = new Set(prev)
                completedAi.forEach((item) => next.delete(item.id))
                return next
              })
              setMatchingDocIds((prev) => {
                const next = new Set(prev)
                completedAi.forEach((item) => next.delete(item.id))
                return next
              })
              const matched = completedAi.filter((item) => aiMatchDone.has(item.task_status)).length
              if (matched) {
                message.success(`${matched} 个文档 AI 匹配完成`)
                refreshAll({ forceTree: true })
              }
            }
          }
        }

        if (matchEntries.length) {
          const completedDocIds = []
          const failedDocIds = []
          matchResults.forEach(({ documentId, response }) => {
            if (response?.success && response?.data) {
              if (response.data.status === 'completed') completedDocIds.push(documentId)
              else if (response.data.status === 'failed') failedDocIds.push(documentId)
            }
          })
          if (completedDocIds.length || failedDocIds.length) {
            setMatchingDocIds((prev) => {
              const next = new Set(prev)
              completedDocIds.forEach((id) => next.delete(id))
              failedDocIds.forEach((id) => next.delete(id))
              return next
            })
            setMatchTaskMap((prev) => {
              const next = new Map(prev)
              completedDocIds.forEach((id) => next.delete(id))
              failedDocIds.forEach((id) => next.delete(id))
              return next
            })
            const allDone = [...completedDocIds, ...failedDocIds]
            if (allDone.length && fileListVersionRef.current === versionBefore) {
              try {
                const response = await getFileStatusesByIds(allDone)
                if (response?.success && response?.data?.items && fileListVersionRef.current === versionBefore) {
                  patchFileListById(response.data.items)
                }
              } catch {
                // ignore
              }
            }
            if (completedDocIds.length) {
              message.success(`${completedDocIds.length} 个文档 AI 匹配完成`)
              refreshAll({ forceTree: true })
            }
            if (failedDocIds.length) message.error(`${failedDocIds.length} 个文档 AI 匹配失败`)
          }
        }
      } catch (error) {
        console.error('文件列表轮询失败:', error)
      } finally {
        pollingInFlightRef.current = false
      }
    }

    const hasWork = () => (
      (pollingParseIdsRef.current?.size || 0) > 0
      || (pollingAiMatchIdsRef.current?.size || 0) > 0
      || (matchTaskMapRef.current?.size || 0) > 0
    )
    const start = () => {
      if (pollingTimerRef.current) return
      setTimeout(tick, 0)
      pollingTimerRef.current = setInterval(tick, pollInterval)
    }
    const stop = () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current)
        pollingTimerRef.current = null
      }
    }

    if (hasWork()) start()
    else stop()
    return stop
  }, [fileListVersionRef, matchTaskMap.size, message, pollingAiMatchIds.size, pollingParseIds.size, refreshAll, setFileList, setMatchingDocIds, setMatchTaskMap, setPollingAiMatchIds, setPollingParseIds])

  useEffect(() => () => {
    if (pollingTimerRef.current) clearInterval(pollingTimerRef.current)
  }, [])
}
