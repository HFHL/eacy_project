import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  groupDocumentsByIdentifiers,
  isolateGroupsByPatientName,
} from './documentGrouping'
import {
  loadAutoArchivedDocuments,
  loadNeedsReviewDocuments,
  loadNewPatientDocuments,
} from './documentListLoaders'

export const useAIProcessingDocumentQueues = ({ message, processedDocs }) => {
  const [needsReviewDocs, setNeedsReviewDocs] = useState([])
  const [needsReviewLoading, setNeedsReviewLoading] = useState(false)
  const [needsReviewSort, setNeedsReviewSort] = useState(null)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  })

  const [autoArchivedDocs, setAutoArchivedDocs] = useState([])
  const [autoArchivedLoading, setAutoArchivedLoading] = useState(false)
  const [autoArchivedSort, setAutoArchivedSort] = useState(null)
  const [autoArchivedPagination, setAutoArchivedPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  })

  const [newPatientDocs, setNewPatientDocs] = useState([])
  const [newPatientLoading, setNewPatientLoading] = useState(false)
  const [newPatientSort, setNewPatientSort] = useState(null)
  const [newPatientPagination, setNewPatientPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  })

  const fetchNeedsReviewDocs = useCallback(async () => {
    setNeedsReviewLoading(true)
    try {
      const { docs, total } = await loadNeedsReviewDocuments({
        page: pagination.current,
        pageSize: pagination.pageSize,
      })
      setNeedsReviewDocs(docs)
      setPagination(prev => ({ ...prev, total }))
    } catch (error) {
      console.error('获取待确认文档失败:', error)
      message.error('获取待确认文档失败')
    } finally {
      setNeedsReviewLoading(false)
    }
  }, [message, pagination.current, pagination.pageSize])

  const fetchAutoArchivedDocs = useCallback(async () => {
    setAutoArchivedLoading(true)
    try {
      const { docs, total } = await loadAutoArchivedDocuments({
        page: autoArchivedPagination.current,
        pageSize: autoArchivedPagination.pageSize,
      })
      setAutoArchivedDocs(docs)
      setAutoArchivedPagination(prev => ({ ...prev, total }))
    } catch (error) {
      console.error('获取自动归档文档失败:', error)
      message.error('获取自动归档文档失败')
    } finally {
      setAutoArchivedLoading(false)
    }
  }, [autoArchivedPagination.current, autoArchivedPagination.pageSize, message])

  const fetchNewPatientDocs = useCallback(async () => {
    setNewPatientLoading(true)
    try {
      const { docs, total } = await loadNewPatientDocuments({
        page: newPatientPagination.current,
        pageSize: newPatientPagination.pageSize,
      })
      setNewPatientDocs(docs)
      setNewPatientPagination(prev => ({ ...prev, total }))
    } catch (error) {
      console.error('获取新建患者文档失败:', error)
      message.error('获取新建患者文档失败')
    } finally {
      setNewPatientLoading(false)
    }
  }, [message, newPatientPagination.current, newPatientPagination.pageSize])

  useEffect(() => {
    fetchNeedsReviewDocs()
    fetchAutoArchivedDocs()
    fetchNewPatientDocs()
  }, [fetchNeedsReviewDocs, fetchAutoArchivedDocs, fetchNewPatientDocs])

  const sortedNeedsReviewDocs = useMemo(() => {
    const docs = [...needsReviewDocs]
    if (needsReviewSort === 'confidence_desc') {
      docs.sort((a, b) => (b.confidence || b.matchScore || 0) - (a.confidence || a.matchScore || 0))
    } else if (needsReviewSort === 'confidence_asc') {
      docs.sort((a, b) => (a.confidence || a.matchScore || 0) - (b.confidence || b.matchScore || 0))
    }
    return docs
  }, [needsReviewDocs, needsReviewSort])

  const sortedNewPatientDocs = useMemo(() => {
    const docs = [...newPatientDocs]
    if (newPatientSort === 'name_desc' || newPatientSort === 'name_asc') {
      docs.sort((a, b) => {
        const nameA = a.extractedInfo?.name || ''
        const nameB = b.extractedInfo?.name || ''
        return newPatientSort === 'name_desc'
          ? nameB.localeCompare(nameA, 'zh-CN')
          : nameA.localeCompare(nameB, 'zh-CN')
      })
    }
    return docs
  }, [newPatientDocs, newPatientSort])

  const visibleNewPatientDocs = useMemo(
    () => sortedNewPatientDocs.filter(doc => !processedDocs.includes(doc.id)),
    [sortedNewPatientDocs, processedDocs]
  )

  const groupedNewPatientDocs = useMemo(() => {
    const groups = groupDocumentsByIdentifiers(visibleNewPatientDocs)
    return isolateGroupsByPatientName(groups)
  }, [visibleNewPatientDocs])

  const sortedAutoArchivedDocs = useMemo(() => {
    const docs = [...autoArchivedDocs]
    if (autoArchivedSort === 'confidence_desc') {
      docs.sort((a, b) => (b.matchScore || b.confidence || 0) - (a.matchScore || a.confidence || 0))
    } else if (autoArchivedSort === 'confidence_asc') {
      docs.sort((a, b) => (a.matchScore || a.confidence || 0) - (b.matchScore || b.confidence || 0))
    }
    return docs
  }, [autoArchivedDocs, autoArchivedSort])

  const groupedAutoArchivedDocs = useMemo(
    () => groupDocumentsByIdentifiers(sortedAutoArchivedDocs),
    [sortedAutoArchivedDocs]
  )

  return {
    autoArchivedDocs,
    autoArchivedLoading,
    autoArchivedPagination,
    autoArchivedSort,
    fetchAutoArchivedDocs,
    fetchNeedsReviewDocs,
    fetchNewPatientDocs,
    groupedAutoArchivedDocs,
    groupedNewPatientDocs,
    needsReviewDocs,
    needsReviewLoading,
    needsReviewSort,
    newPatientDocs,
    newPatientLoading,
    newPatientPagination,
    newPatientSort,
    pagination,
    setAutoArchivedDocs,
    setAutoArchivedSort,
    setNeedsReviewSort,
    setNewPatientSort,
    sortedAutoArchivedDocs,
    sortedNeedsReviewDocs,
    sortedNewPatientDocs,
    visibleNewPatientDocs,
  }
}
