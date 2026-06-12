import { useCallback, useEffect, useRef, useState } from 'react'
import { batchArchiveDocuments, parseDocument } from '../../../api/document'
import { getPatientList } from '../../../api/patient'
import { mergePatientPrefills } from '../../../components/Patient/patientPrefill'
import {
  confirmRecommendedArchiveBatch,
  getRecommendedArchiveBatchRecords,
} from './batchRecommendedArchive'

export const useFileListBatchActions = ({
  activeGroupKey,
  fileRecordMap,
  groupDocsMap,
  message,
  refreshAll,
  selectedRowKeys,
  setCreatePatientDocIds,
  setCreatePatientDrawerOpen,
  setCreatePatientGroupId,
  setCreatePatientMode,
  setCreatePatientPrefillValues,
  setFileList,
  setPollingParseIds,
  setSelectedRowKeys,
  setStartingParseIds,
  treeData,
  viewMode,
}) => {
  const [batchProcessing, setBatchProcessing] = useState(false)
  const [batchReidentifyLoading, setBatchReidentifyLoading] = useState(false)
  const [batchConfirmArchiveLoading, setBatchConfirmArchiveLoading] = useState(false)
  const [batchManualArchiveVisible, setBatchManualArchiveVisible] = useState(false)
  const [batchPatientSearchValue, setBatchPatientSearchValue] = useState('')
  const [batchPatientSearchResults, setBatchPatientSearchResults] = useState([])
  const [batchPatientSearchLoading, setBatchPatientSearchLoading] = useState(false)
  const [selectedBatchPatient, setSelectedBatchPatient] = useState(null)
  const batchSearchTimerRef = useRef(null)
  const batchSearchVersionRef = useRef(0)

  useEffect(() => () => {
    if (batchSearchTimerRef.current) clearTimeout(batchSearchTimerRef.current)
  }, [])

  const handleBatchPatientSearch = useCallback((value) => {
    setBatchPatientSearchValue(value)
    setSelectedBatchPatient(null)
    if (batchSearchTimerRef.current) clearTimeout(batchSearchTimerRef.current)
    batchSearchVersionRef.current += 1
    const version = batchSearchVersionRef.current
    const trimmed = (value || '').trim()
    const debounceMs = trimmed.length < 1 ? 0 : 400
    batchSearchTimerRef.current = setTimeout(async () => {
      if (version !== batchSearchVersionRef.current) return
      setBatchPatientSearchLoading(true)
      try {
        const response = await getPatientList({ page: 1, page_size: 50, ...(trimmed ? { search: trimmed } : {}) })
        if (version !== batchSearchVersionRef.current) return
        setBatchPatientSearchResults(response?.success && response?.data ? response.data : [])
      } catch {
        if (version === batchSearchVersionRef.current) setBatchPatientSearchResults([])
      } finally {
        if (version === batchSearchVersionRef.current) setBatchPatientSearchLoading(false)
      }
    }, debounceMs)
  }, [])

  useEffect(() => {
    if (!batchManualArchiveVisible) return
    if (batchSearchTimerRef.current) clearTimeout(batchSearchTimerRef.current)
    batchSearchVersionRef.current += 1
    const version = batchSearchVersionRef.current
    setBatchPatientSearchLoading(true)
    getPatientList({ page: 1, page_size: 50 })
      .then((response) => {
        if (version !== batchSearchVersionRef.current) return
        setBatchPatientSearchResults(response?.success && response?.data ? response.data : [])
      })
      .catch(() => {
        if (version === batchSearchVersionRef.current) setBatchPatientSearchResults([])
      })
      .finally(() => {
        if (version === batchSearchVersionRef.current) setBatchPatientSearchLoading(false)
      })
  }, [batchManualArchiveVisible])

  const handleConfirmBatchManualArchive = useCallback(async () => {
    if (!selectedRowKeys.length || !selectedBatchPatient?.id) {
      message.warning('请先选择文档和患者')
      return
    }
    const documentIds = selectedRowKeys
      .map((key) => fileRecordMap.get(key))
      .filter((item) => item?.id && item.task_status !== 'archived')
      .map((item) => item.id)
    if (!documentIds.length) {
      message.warning('当前选中文档没有可归档的文档')
      return
    }
    setBatchProcessing(true)
    try {
      const response = await batchArchiveDocuments(documentIds, selectedBatchPatient.id, true)
      const ok = Number(response?.data?.total ?? response?.data?.items?.length ?? 0)
      if (response?.success && ok > 0) {
        message.success(`已归档 ${ok} 个文档到患者「${selectedBatchPatient.name || '未知'}」`)
        setSelectedRowKeys([])
        setBatchManualArchiveVisible(false)
        refreshAll({ forceTree: true })
      } else {
        message.error(response?.message || '归档失败')
      }
    } catch {
      message.error('批量归档失败')
    } finally {
      setBatchProcessing(false)
    }
  }, [fileRecordMap, message, refreshAll, selectedBatchPatient, selectedRowKeys, setSelectedRowKeys])

  const handleBatchCreatePatientFromSelection = useCallback(() => {
    if (!selectedRowKeys.length) return message.warning('请先选择文档')
    const selected = selectedRowKeys.map((key) => fileRecordMap.get(key)).filter(Boolean)
    const eligible = selected
      .filter((record) => record?.id && record.task_status !== 'archived')
      .map((record) => record.id)
    if (!eligible.length) return message.warning('当前选中文档中没有可「新建患者」并归档的文档')
    const groupIds = new Set(
      selected
        .filter((record) => eligible.includes(record.id) && record._groupId)
        .map((record) => record._groupId)
    )
    if (groupIds.size > 1) {
      return message.warning('所选文档来自多个分组，无法合并创建为同一新患者，请按分组分别操作')
    }
    setCreatePatientMode('docs')
    setCreatePatientGroupId(null)
    setCreatePatientDocIds(eligible)
    setCreatePatientPrefillValues(mergePatientPrefills(selected.filter((record) => eligible.includes(record.id))))
    setCreatePatientDrawerOpen(true)
  }, [
    fileRecordMap,
    message,
    selectedRowKeys,
    setCreatePatientDocIds,
    setCreatePatientDrawerOpen,
    setCreatePatientGroupId,
    setCreatePatientMode,
    setCreatePatientPrefillValues,
  ])

  const handleBatchParseArchive = useCallback(async () => {
    if (!selectedRowKeys.length) return message.warning('请先选择需要处理的文件')
    const selectedRecords = selectedRowKeys.map((key) => fileRecordMap.get(key)).filter(Boolean)
    if (!selectedRecords.length) return message.warning('当前无可处理文件')

    const successIds = []
    const failedIds = []
    const skippedIds = []
    const processRecord = async (record) => {
      if (record.task_status === 'parsing') {
        skippedIds.push(record.id)
        return
      }
      setStartingParseIds((prev) => new Set([...prev, record.id]))
      try {
        const response = await parseDocument(record.id)
        if (response?.success) {
          successIds.push(record.id)
          setFileList((prev) => prev.map((item) => (item.id === record.id ? { ...item, task_status: 'parsing' } : item)))
          setPollingParseIds((prev) => new Set([...prev, record.id]))
        } else {
          failedIds.push(record.id)
        }
      } catch {
        failedIds.push(record.id)
      } finally {
        setStartingParseIds((prev) => {
          const next = new Set(prev)
          next.delete(record.id)
          return next
        })
      }
    }

    setBatchReidentifyLoading(true)
    try {
      const limit = 3
      let index = 0
      const runners = Array.from({ length: Math.min(limit, selectedRecords.length) }).map(async () => {
        while (index < selectedRecords.length) {
          const current = selectedRecords[index]
          index += 1
          await processRecord(current)
        }
      })
      await Promise.all(runners)
      setSelectedRowKeys([])
      await refreshAll({ forceTree: true })
      if (successIds.length) message.success(`已启动 ${successIds.length} 个文档的批量重新识别`)
      if (skippedIds.length) message.info(`${skippedIds.length} 个文档已在识别中，已跳过`)
      if (failedIds.length) message.error(`${failedIds.length} 个文档启动失败`)
    } finally {
      setBatchReidentifyLoading(false)
    }
  }, [
    fileRecordMap,
    message,
    refreshAll,
    selectedRowKeys,
    setFileList,
    setPollingParseIds,
    setSelectedRowKeys,
    setStartingParseIds,
  ])

  const handleBatchConfirmRecommendedArchive = useCallback(async () => {
    if (!selectedRowKeys.length) return message.warning('请先选择文档')
    const { eligible, selectedRecords } = getRecommendedArchiveBatchRecords({
      activeGroupKey,
      fileRecordMap,
      groupDocsMap,
      selectedRowKeys,
      treeData,
      viewMode,
    })
    if (!selectedRecords.length) return message.warning('没有找到可处理的文档')
    if (!eligible.length) return message.warning('选中文档中没有可确认推荐归档的文档')

    setBatchConfirmArchiveLoading(true)
    try {
      const result = await confirmRecommendedArchiveBatch({ eligible, fileRecordMap, groupDocsMap, treeData })
      setSelectedRowKeys([])
      refreshAll({ forceTree: true })
      const skippedNames = result.skippedNoMatchDocNames.size
        ? Array.from(result.skippedNoMatchDocNames).join('、')
        : `${result.skippedNoMatchCount}个`
      const failedNames = result.failedArchiveDocNames.size
        ? Array.from(result.failedArchiveDocNames).join('、')
        : `${result.failedArchiveCount}个`
      const tip = `归档成功 ${result.successCount} 个，缺少匹配患者跳过：${skippedNames}，归档失败：${failedNames}`
      if (result.failedArchiveCount === 0 && result.skippedNoMatchCount === 0) message.success(tip)
      else message.warning(tip)
    } finally {
      setBatchConfirmArchiveLoading(false)
    }
  }, [activeGroupKey, fileRecordMap, groupDocsMap, message, refreshAll, selectedRowKeys, setSelectedRowKeys, treeData, viewMode])

  return {
    batchConfirmArchiveLoading,
    batchManualArchiveVisible,
    batchPatientSearchLoading,
    batchPatientSearchResults,
    batchPatientSearchValue,
    batchProcessing,
    batchReidentifyLoading,
    handleBatchConfirmRecommendedArchive,
    handleBatchCreatePatientFromSelection,
    handleBatchParseArchive,
    handleBatchPatientSearch,
    handleConfirmBatchManualArchive,
    selectedBatchPatient,
    setBatchManualArchiveVisible,
    setBatchPatientSearchLoading,
    setBatchPatientSearchResults,
    setBatchPatientSearchValue,
    setSelectedBatchPatient,
  }
}
