/**
 * 文档筛选逻辑Hook
 * 处理文档的搜索、筛选和排序逻辑
 */
import { useState, useMemo } from 'react'

const useDocumentFilter = (documents = []) => {
  const formatLocalYYYYMMDD = (d) => {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  /**
   * 将各种时间输入规整成 YYYY-MM-DD 的分组 key（避免 toISOString() 引入的时区偏移）
   * 支持：
   * - '2025-08-13'
   * - '2025-08-13 00:00:00' / '2025-08-13T00:00:00'
   * - '2025/08/13' / '2025/08/13 08:00:00'
   * - Date / timestamp
   */
  const getDateKey = (value) => {
    if (!value) return null

    if (typeof value === 'string') {
      const s = value.trim()
      const m1 = s.match(/\b\d{4}-\d{2}-\d{2}\b/)
      if (m1?.[0]) return m1[0]
      const m2 = s.match(/\b\d{4}\/\d{2}\/\d{2}\b/)
      if (m2?.[0]) return m2[0].replaceAll('/', '-')

      const d = new Date(s)
      if (!Number.isNaN(d.getTime())) return formatLocalYYYYMMDD(d)
      return null
    }

    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return formatLocalYYYYMMDD(d)
  }

  const getUploadDateKey = (doc) => {
    return (
      getDateKey(doc?.uploadTime) ||
      getDateKey(doc?.uploaded_at) ||
      getDateKey(doc?.createdAt) ||
      getDateKey(doc?.created_at) ||
      null
    )
  }

  const getEffectiveDateKey = (doc) => {
    return (
      getDateKey(doc?.metadata?.effectiveDate) ||
      getDateKey(doc?.metadata?.effective_at) ||
      getDateKey(doc?.metadata?.effectiveAt) ||
      getDateKey(doc?.metadata?.effective_date) ||
      null
    )
  }

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
      const searchLower = filters.searchText.toLowerCase()
      result = result.filter(doc => {
        const fileName = (doc.fileName || '').toLowerCase()
        const orgName = (doc.metadata?.organizationName || '').toLowerCase()
        const docType = (doc.metadata?.documentType || '').toLowerCase()
        const docSubtype = (doc.metadata?.documentSubtype || '').toLowerCase()
        
        return fileName.includes(searchLower) ||
               orgName.includes(searchLower) ||
               docType.includes(searchLower) ||
               docSubtype.includes(searchLower)
      })
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
      result = result.filter(doc => doc.status === filters.status)
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
    const result = [...sortedDocuments]
    
    // 根据分组类型进行分组
    const groups = {}
    
    result.forEach(doc => {
      let groupKey
      let groupTitle
      let groupSubtitle = ''
      
      switch (groupConfig.groupBy) {
        case 'date':
          groupKey = getUploadDateKey(doc) || 'unknown'
          groupTitle = groupKey === 'unknown' ? '未知上传日期' : groupKey
          break
        case 'effectiveDate':
          groupKey = getEffectiveDateKey(doc) || 'unknown'
          groupTitle = groupKey === 'unknown' ? '未知生效日期' : groupKey
          break
        case 'type':
          groupKey = doc.metadata?.documentType || 'unknown'
          groupTitle = groupKey === 'unknown' ? '未知类型' : groupKey
          groupSubtitle = doc.metadata?.documentSubtype || ''
          break
        case 'organization':
          groupKey = doc.metadata?.organizationName || 'unknown'
          groupTitle = groupKey === 'unknown' ? '未知机构' : groupKey
          break
        case 'status':
          groupKey = doc.status || 'unknown'
          const statusMap = {
            'extracted': '已抽取',
            'pending': '待处理', 
            'processing': '处理中',
            'error': '处理失败',
            'unknown': '未知状态'
          }
          groupTitle = statusMap[groupKey] || groupKey
          break
        case 'confidence':
          if (!doc.confidence && doc.confidence !== 0) {
            groupKey = 'unknown'
            groupTitle = '未知置信度'
          } else if (doc.confidence >= 0.9) {
            groupKey = 'high'
            groupTitle = '高置信度 (≥90%)'
          } else if (doc.confidence >= 0.7) {
            groupKey = 'medium'
            groupTitle = '中置信度 (70-89%)'
          } else {
            groupKey = 'low'
            groupTitle = '低置信度 (<70%)'
          }
          break
        default:
          groupKey = 'all'
          groupTitle = '所有文档'
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = {
          key: groupKey,
          title: groupTitle,
          subtitle: groupSubtitle,
          documents: [],
          type: groupConfig.groupBy
        }
      }
      
      groups[groupKey].documents.push(doc)
    })
    
    // 对分组进行排序
    const sortedGroups = Object.values(groups).sort((a, b) => {
      switch (groupConfig.sortOrder) {
        case 'asc':
          return a.title.localeCompare(b.title)
        case 'desc':
          return b.title.localeCompare(a.title)
        case 'count':
          return b.documents.length - a.documents.length
        case 'priority':
          // 状态优先级排序
          const statusPriority = { 'error': 0, 'pending': 1, 'processing': 2, 'extracted': 3, 'unknown': 4 }
          return (statusPriority[a.key] || 4) - (statusPriority[b.key] || 4)
        default:
          return 0
      }
    })
    
    return sortedGroups
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