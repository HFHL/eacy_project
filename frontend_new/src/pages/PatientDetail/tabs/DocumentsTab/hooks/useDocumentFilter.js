/**
 * 文档筛选逻辑Hook
 * 处理文档的搜索、筛选和排序逻辑
 */
import { useState, useMemo } from 'react'
import { documentMatchesKeyword } from '@/utils/documentSearch'
import { getDocumentGroup, sortDocumentGroups } from './documentFilterUtils'

const useDocumentFilter = (documents = []) => {
  const [filters, setFilters] = useState({
    searchText: '',
    documentType: '',
    organization: '',
    dateRange: [],
    status: ''
  })

  const [sortConfig, setSortConfig] = useState({
    field: 'effectiveDate',
    direction: 'desc' // 默认按时间倒序（由近到远）
  })

  const [groupConfig, setGroupConfig] = useState({
    // date=上传时间，effectiveDate=生效时间
    groupBy: 'effectiveDate', // 默认按生效时间分组
    sortOrder: 'desc' // desc, asc, count, priority
  })

  // 筛选后的文档列表
  const filteredDocuments = useMemo(() => {
    let result = [...documents]

    // 文本搜索
    if (filters.searchText) {
      result = result.filter((doc) => documentMatchesKeyword(doc, filters.searchText))
    }

    // 文档类型筛选
    if (filters.documentType) {
      result = result.filter(doc =>
        doc.metadata?.documentType === filters.documentType
      )
    }

    // 医疗机构筛选
    if (filters.organization) {
      result = result.filter(doc =>
        doc.metadata?.organizationName === filters.organization
      )
    }

    // 处理状态筛选
    if (filters.status) {
      result = result.filter(doc => (
        doc.task_status === filters.status ||
        doc.taskStatus === filters.status ||
        doc.status === filters.status
      ))
    }

    // 日期范围筛选
    if (filters.dateRange && filters.dateRange.length === 2) {
      const [startDate, endDate] = filters.dateRange
      result = result.filter(doc => {
        if (!doc.metadata?.effectiveDate) return false
        const docDate = new Date(doc.metadata.effectiveDate)
        return docDate >= startDate.toDate() && docDate <= endDate.toDate()
      })
    }

    return result
  }, [documents, filters])

  // 排序后的文档列表
  const sortedDocuments = useMemo(() => {
    const result = [...filteredDocuments]

    result.sort((a, b) => {
      let aValue, bValue

      switch (sortConfig.field) {
        case 'effectiveDate':
          aValue = new Date(a.metadata?.effectiveDate || 0)
          bValue = new Date(b.metadata?.effectiveDate || 0)
          break
        case 'uploadTime':
          aValue = new Date(a.uploadTime || 0)
          bValue = new Date(b.uploadTime || 0)
          break
        case 'fileName':
          aValue = (a.fileName || '').toLowerCase()
          bValue = (b.fileName || '').toLowerCase()
          break
        case 'documentType':
          aValue = (a.metadata?.documentType || '').toLowerCase()
          bValue = (b.metadata?.documentType || '').toLowerCase()
          break
        case 'organizationName':
          aValue = (a.metadata?.organizationName || '').toLowerCase()
          bValue = (b.metadata?.organizationName || '').toLowerCase()
          break
        default:
          return 0
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1
      }
      return 0
    })

    return result
  }, [filteredDocuments, sortConfig])

  // 更新筛选条件
  const updateFilters = (newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }))
  }

  // 清空筛选条件
  const clearFilters = () => {
    setFilters({
      searchText: '',
      documentType: '',
      organization: '',
      dateRange: [],
      status: ''
    })
  }

  // 更新排序配置
  const updateSort = (field, direction) => {
    setSortConfig({ field, direction })
  }

  // 获取筛选统计信息
  const getFilterStats = () => {
    return {
      total: documents.length,
      filtered: filteredDocuments.length,
      hasActiveFilters: Object.values(filters).some(value =>
        value && (Array.isArray(value) ? value.length > 0 : true)
      )
    }
  }

  // 分组后的文档列表
  const groupedDocuments = useMemo(() => {
    const groups = {}

    sortedDocuments.forEach(doc => {
      const { key, title, subtitle } = getDocumentGroup(doc, groupConfig.groupBy)

      if (!groups[key]) {
        groups[key] = {
          key,
          title,
          subtitle,
          documents: [],
          type: groupConfig.groupBy
        }
      }

      groups[key].documents.push(doc)
    })

    return sortDocumentGroups(groups, groupConfig.sortOrder)
  }, [sortedDocuments, groupConfig])

  // 更新分组配置
  const updateGroupConfig = (newConfig) => {
    setGroupConfig(prev => ({ ...prev, ...newConfig }))
  }

  return {
    filters,
    sortConfig,
    groupConfig,
    filteredDocuments: sortedDocuments,
    groupedDocuments,
    updateFilters,
    clearFilters,
    updateSort,
    updateGroupConfig,
    getFilterStats
  }
}

export default useDocumentFilter
