import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getDocumentList } from '../../../api/document'
import {
  calculateUploadStats,
  getCombinedUploadFiles,
  mapParsingDocument,
  mapUploadedDocument,
} from './documentUploadUtils'

const DEFAULT_PAGINATION = {
  current: 1,
  pageSize: 20,
  total: 0,
}

export const useDocumentUploadData = (uploadFiles) => {
  const [unparsedDocuments, setUnparsedDocuments] = useState([])
  const [unparsedLoading, setUnparsedLoading] = useState(false)
  const [unparsedPagination, setUnparsedPagination] = useState(DEFAULT_PAGINATION)
  const [parsingDocuments, setParsingDocuments] = useState([])
  const [parsingLoading, setParsingLoading] = useState(false)
  const [parsingPagination, setParsingPagination] = useState(DEFAULT_PAGINATION)
  const pollingTimerRef = useRef(null)

  const fetchUnparsedDocuments = useCallback(async () => {
    setUnparsedLoading(true)
    try {
      const response = await getDocumentList({
        page: unparsedPagination.current,
        page_size: unparsedPagination.pageSize,
        task_status: 'uploaded',
      })

      if (response.success && response.code === 0) {
        const documents = response.data.map(mapUploadedDocument)
        setUnparsedDocuments(documents)
        setUnparsedPagination((prev) => ({
          ...prev,
          total: response.pagination?.total || documents.length,
        }))
      }
    } catch (error) {
      console.error('获取未解析文件列表失败:', error)
    } finally {
      setUnparsedLoading(false)
    }
  }, [unparsedPagination.current, unparsedPagination.pageSize])

  const fetchParsingDocuments = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setParsingLoading(true)
    }
    try {
      const response = await getDocumentList({
        page: parsingPagination.current,
        page_size: parsingPagination.pageSize,
        task_status: 'parsing,parsed,parse_failed',
      })

      if (response.success && response.code === 0) {
        const documents = response.data.map(mapParsingDocument)
        setParsingDocuments(documents)
        setParsingPagination((prev) => ({
          ...prev,
          total: response.pagination?.total || documents.length,
        }))
      }
    } catch (error) {
      console.error('获取解析文件列表失败:', error)
    } finally {
      if (showLoading) {
        setParsingLoading(false)
      }
    }
  }, [parsingPagination.current, parsingPagination.pageSize])

  useEffect(() => {
    fetchUnparsedDocuments()
    fetchParsingDocuments()
  }, [fetchUnparsedDocuments, fetchParsingDocuments])

  useEffect(() => {
    const hasParsingDocs = parsingDocuments.some(
      (doc) => doc.taskStatus === 'parsing' || doc.status === 'parsing',
    )

    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current)
      pollingTimerRef.current = null
    }

    if (hasParsingDocs) {
      console.log('[轮询] 检测到解析中的文档，启动3秒轮询')
      pollingTimerRef.current = setInterval(() => {
        console.log('[轮询] 刷新解析列表...')
        fetchParsingDocuments(false)
      }, 3000)
    }

    return () => {
      if (pollingTimerRef.current) {
        console.log('[轮询] 清除定时器')
        clearInterval(pollingTimerRef.current)
        pollingTimerRef.current = null
      }
    }
  }, [parsingDocuments, fetchParsingDocuments])

  const allFiles = useMemo(
    () => getCombinedUploadFiles(uploadFiles, unparsedDocuments),
    [uploadFiles, unparsedDocuments],
  )
  const uploadStats = useMemo(() => calculateUploadStats(allFiles), [allFiles])

  return {
    allFiles,
    fetchParsingDocuments,
    fetchUnparsedDocuments,
    parsingDocuments,
    parsingLoading,
    parsingPagination,
    setUnparsedDocuments,
    unparsedLoading,
    unparsedPagination,
    uploadStats,
  }
}
