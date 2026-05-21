import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Empty, Input, Select, Space } from 'antd'
import PatientKeyTable from './PatientKeyTable'
import FieldGroupTabs from './FieldGroupTabs'
import { getScopedFieldRawValue } from './cellRenderers'
import {
  PROJECT_DATASET_GROUP_MATCH_MODE,
  resolveProjectDatasetGroupMatchMode,
} from '../config/datasetContract'

/**
 * 项目详情页 V2 主渲染容器。
 *
 * @param {{
 *  loading: boolean;
 *  patients: Array<Record<string, any>>;
 *  fieldGroups: Array<Record<string, any>>;
 *  folders: Array<{folderKey:string,folderName:string,groups:Array<Record<string, any>>}>;
 *  groupsByFolder: Record<string, Array<Record<string, any>>>;
 *  activeGroupKey: string | null;
 *  onGroupChange: (groupKey: string) => void;
 *  selectedPatientIds: string[];
 *  onToggleSelectPatient: (patientId: string, checked: boolean) => void;
 *  onNavigatePatient: (patientId: string) => void;
 *  onExtractPatient: (patient: Record<string, any>) => void;
 *  patientExtractionById?: Record<string, { status?: string; progress?: number; label?: string; modeLabel?: string }>;
 *  pagination: Record<string, any>;
 *  onPageChange: (page: number, pageSize: number) => void;
 *  leftScrollY: number;
 *  rightScrollY: number;
 * }} props 组件参数。
 * @returns {JSX.Element}
 */
const ProjectDatasetV2 = ({
  loading,
  groupFieldsLoading = false,
  patients,
  fieldGroups,
  folders,
  groupsByFolder,
  activeGroupKey,
  onGroupChange,
  selectedPatientIds,
  onToggleSelectPatient,
  onNavigatePatient,
  onExtractPatient,
  patientExtractionById = {},
  pagination,
  onPageChange,
  leftScrollY,
  rightScrollY,
}) => {
  /**
   * 解析调试开关：
   * 1) URL: ?debugV2=1/true 开启，0/false 关闭
   * 2) localStorage: projectDatasetV2Debug=true/false
   * 3) 默认值：开发环境开启
   *
   * @returns {boolean}
   */
  const resolveConsistencyDebugFlag = () => {
    const defaultFlag = Boolean(import.meta?.env?.DEV)
    if (typeof window === 'undefined') return defaultFlag

    const queryValue = new URLSearchParams(window.location.search).get('debugV2')
    if (queryValue === '1' || queryValue === 'true') return true
    if (queryValue === '0' || queryValue === 'false') return false

    const storageValue = window.localStorage?.getItem('projectDatasetV2Debug')
    if (storageValue === 'true') return true
    if (storageValue === 'false') return false

    return defaultFlag
  }

  const [keyword, setKeyword] = useState('')
  const [completenessFilter, setCompletenessFilter] = useState('all')
  const [enableConsistencyDebug] = useState(resolveConsistencyDebugFlag)
  const [groupMatchMode] = useState(resolveProjectDatasetGroupMatchMode)
  const leftPanelRef = useRef(null)
  const rightPanelRef = useRef(null)
  const enableLegacyGroupFallback = groupMatchMode === PROJECT_DATASET_GROUP_MATCH_MODE.COMPATIBLE

  /**
   * 左右两栏共享的唯一患者可见数据源。
   * 后续任何筛选/排序都必须只在此处处理。
   */
  const visiblePatients = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    return (patients || []).filter((patient) => {
      if (completenessFilter === 'high' && (Number(patient.overallCompleteness) || 0) < 0.9) return false
      if (completenessFilter === 'middle') {
        const value = Number(patient.overallCompleteness) || 0
        if (value < 0.6 || value >= 0.9) return false
      }
      if (completenessFilter === 'low' && (Number(patient.overallCompleteness) || 0) >= 0.6) return false
      if (!normalizedKeyword) return true
      const subjectId = String(patient.subject_id || '').toLowerCase()
      const name = String(patient.name || '').toLowerCase()
      return subjectId.includes(normalizedKeyword) || name.includes(normalizedKeyword)
    })
  }, [completenessFilter, keyword, patients])

  /**
   * 可见患者行顺序快照（左右一致性锚点）。
   */
  const visiblePatientIds = useMemo(() => {
    return visiblePatients.map((patient) => patient.patient_id).filter(Boolean)
  }, [visiblePatients])

  const activeGroup = useMemo(() => {
    const groupList = Array.isArray(fieldGroups) ? fieldGroups : []
    return groupList.find((group) => group.group_id === activeGroupKey) || groupList[0] || null
  }, [activeGroupKey, fieldGroups])

  /**
   * 规范化 slash 路径，兼容全角斜杠与空格差异。
   *
   * @param {string} rawPath 原始路径。
   * @returns {string}
   */
  const normalizeSlashPath = (rawPath) => {
    return String(rawPath || '')
      .normalize('NFKC')
      .replace(/\s*\/\s*/g, '/')
      .trim()
  }

  /**
   * 计算当前激活字段组的源字段路径集合（完整路径）。
   *
   * @returns {string[]}
   */
  const getActiveGroupSourceFieldKeys = () => {
    if (!activeGroup || !Array.isArray(activeGroup.columns)) return []
    const pathSet = new Set()
    activeGroup.columns.forEach((column) => {
      const sourceFieldKeys = Array.isArray(column?.sourceFieldKeys) && column.sourceFieldKeys.length > 0
        ? column.sourceFieldKeys
        : [column?.key]
      sourceFieldKeys.forEach((fieldPath) => {
        const normalizedPath = normalizeSlashPath(fieldPath)
        if (normalizedPath) pathSet.add(normalizedPath)
      })
    })
    return [...pathSet]
  }

  /**
   * 基于字段路径读取 groupNode.fields 的值。
   *
   * @param {Record<string, any>} fields 分组字段对象。
   * @param {string} fieldPath 字段路径。
   * @returns {any}
   */
  const readFieldValueFromGroupFields = (fields, fieldPath) => {
    if (!fields || typeof fields !== 'object') return null
    const readValueBySegments = (rootValue, segments) => {
      if (!Array.isArray(segments) || segments.length === 0) {
        if (rootValue && typeof rootValue === 'object' && Object.prototype.hasOwnProperty.call(rootValue, 'value')) {
          return rootValue.value
        }
        return rootValue
      }
      if (Array.isArray(rootValue)) {
        const mapped = rootValue.map((item) => readValueBySegments(item, segments))
        const hasAny = mapped.some((item) => item !== null && item !== undefined)
        return hasAny ? mapped : undefined
      }
      if (!rootValue || typeof rootValue !== 'object') return undefined
      const [head, ...rest] = segments
      if (!Object.prototype.hasOwnProperty.call(rootValue, head)) return undefined
      return readValueBySegments(rootValue[head], rest)
    }
    const normalizedFieldPath = normalizeSlashPath(fieldPath)
    const pathSegments = normalizedFieldPath.split('/').filter(Boolean)
    const pathCandidates = [normalizedFieldPath]
    const normalizedGroupName = normalizeSlashPath(activeGroup?.group_name || '')
    if (normalizedGroupName && normalizedFieldPath.startsWith(`${normalizedGroupName}/`)) {
      pathCandidates.push(normalizedFieldPath.slice(normalizedGroupName.length + 1))
    }
    if (pathSegments.length > 1) {
      pathCandidates.push(pathSegments.slice(1).join('/'))
    }

    // 1) 先做精确键命中（含规范化比较）
    const fieldEntries = Object.entries(fields)
    for (const pathKey of pathCandidates) {
      const directEntry = fieldEntries.find(([key]) => normalizeSlashPath(key) === pathKey)
      if (!directEntry) continue
      const rawFieldItem = directEntry[1]
      if (rawFieldItem && typeof rawFieldItem === 'object' && Object.prototype.hasOwnProperty.call(rawFieldItem, 'value')) {
        return rawFieldItem.value
      }
      return rawFieldItem
    }
    for (const pathKey of pathCandidates) {
      const suffixMatches = fieldEntries.filter(([rawKey]) => {
        const normalizedRawKey = normalizeSlashPath(rawKey)
        return pathKey.endsWith(`/${normalizedRawKey}`) || normalizedRawKey.endsWith(`/${pathKey}`)
      })
      if (suffixMatches.length > 0) {
        suffixMatches.sort((a, b) => String(b[0]).length - String(a[0]).length)
        const rawFieldItem = suffixMatches[0][1]
        if (rawFieldItem && typeof rawFieldItem === 'object' && Object.prototype.hasOwnProperty.call(rawFieldItem, 'value')) {
          return rawFieldItem.value
        }
        return rawFieldItem
      }
    }

    // 3) 容器前缀命中：支持 fields 仅存父级 key（例如“诊断记录”）而叶子字段来自该容器。
    for (const pathKey of pathCandidates) {
      const prefixMatches = fieldEntries
        .map(([rawKey, rawValue]) => ({
          rawKey,
          rawValue,
          normalizedRawKey: normalizeSlashPath(rawKey),
        }))
        .filter((entry) => {
          return entry.normalizedRawKey
            && pathKey.startsWith(`${entry.normalizedRawKey}/`)
        })
      if (prefixMatches.length === 0) continue
      prefixMatches.sort((a, b) => b.normalizedRawKey.length - a.normalizedRawKey.length)
      const bestMatch = prefixMatches[0]
      const baseValue = bestMatch.rawValue && typeof bestMatch.rawValue === 'object' && Object.prototype.hasOwnProperty.call(bestMatch.rawValue, 'value')
        ? bestMatch.rawValue.value
        : bestMatch.rawValue
      const restPath = pathKey.slice(bestMatch.normalizedRawKey.length + 1)
      const restSegments = restPath.split('/').filter(Boolean)
      const nestedValue = readValueBySegments(baseValue, restSegments)
      if (nestedValue !== null && nestedValue !== undefined) return nestedValue
    }

    // 4) 同组内对象路径读取（用于嵌套结构 fields）
    for (const pathKey of pathCandidates) {
      const segments = pathKey.split('/').filter(Boolean)
      let cursor = fields
      let matched = true
      for (const segment of segments) {
        if (cursor && typeof cursor === 'object' && Object.prototype.hasOwnProperty.call(cursor, segment)) {
          cursor = cursor[segment]
        } else {
          matched = false
          break
        }
      }
      if (!matched) continue
      if (cursor && typeof cursor === 'object' && Object.prototype.hasOwnProperty.call(cursor, 'value')) {
        return cursor.value
      }
      return cursor
    }

    return null
  }

  /**
   * 构建当前激活字段组的候选分组 key（兼容 sec_xxx 与中文组名）。
   *
   * @returns {string[]}
   */
  const buildActiveGroupCandidateKeys = () => {
    if (!activeGroup) return []
    const rawGroupName = String(activeGroup.group_name || '')
    const slashSegments = rawGroupName.split('/').map((segment) => segment.trim()).filter(Boolean)
    const slashSegmentsSpace = rawGroupName.split(' / ').map((segment) => segment.trim()).filter(Boolean)
    const groupPathTokens = Array.isArray(activeGroup.groupPathTokens) ? activeGroup.groupPathTokens : []
    const keys = [
      activeGroup.group_id,
      activeGroup.groupPath,
      activeGroup.repeatableDataPath,
      activeGroup.folderName,
      activeGroup.groupShortName,
      rawGroupName,
      groupPathTokens[0],
      slashSegments[0],
      slashSegmentsSpace[0],
    ].filter(Boolean)
    return [...new Set(keys)]
  }

  /**
   * 选择当前患者命中的激活字段组节点，并返回命中元信息。
   *
   * @param {Record<string, any>} patient 患者行。
   * @returns {{
   *  groupNode: Record<string, any> | null;
   *  matchedGroupKey: string | null;
   *  matchedCandidateKey: string | null;
   *  matchedMode: string;
   *  candidateKeys: string[];
   * }}
   */
  const resolveActiveGroupMatch = (patient) => {
    const groupMap = patient?.crf_data?.groups && typeof patient.crf_data.groups === 'object'
      ? patient.crf_data.groups
      : {}
    const allCandidateKeys = buildActiveGroupCandidateKeys()
    const normalizedFolderName = normalizeSlashPath(activeGroup?.folderName)
    const strictCandidateKeys = allCandidateKeys.filter((candidateKey) => {
      const normalizedCandidate = normalizeSlashPath(candidateKey)
      return normalizedCandidate && normalizedCandidate !== normalizedFolderName
    })
    const fallbackCandidateKeys = allCandidateKeys.filter((candidateKey) => {
      const normalizedCandidate = normalizeSlashPath(candidateKey)
      return normalizedCandidate && normalizedCandidate === normalizedFolderName
    })
    const activeFieldPaths = getActiveGroupSourceFieldKeys()
    const normalizedEntries = Object.entries(groupMap).map(([rawKey, node]) => ({
      rawKey,
      normalizedKey: normalizeSlashPath(rawKey),
      node,
    }))

    /**
     * 计算 fields 与当前激活组字段的覆盖命中数（支持前后缀路径兼容）。
     *
     * @param {Record<string, any>} fields 字段字典。
     * @returns {number}
     */
    const evaluateFieldsCoverage = (fields) => {
      if (!fields || typeof fields !== 'object') return 0
      if (!Array.isArray(activeFieldPaths) || activeFieldPaths.length === 0) return 0
      const normalizedFieldEntries = Object.keys(fields)
        .map((rawFieldKey) => normalizeSlashPath(rawFieldKey))
        .filter(Boolean)
      let hitCount = 0
      activeFieldPaths.forEach((fieldPath) => {
        const normalizedFieldPath = normalizeSlashPath(fieldPath)
        const isKeyHit = normalizedFieldEntries.some((entryPath) => (
          entryPath === normalizedFieldPath
          || entryPath.endsWith(`/${normalizedFieldPath}`)
          || normalizedFieldPath.endsWith(`/${entryPath}`)
        ))
        if (isKeyHit) {
          hitCount += 1
          return
        }
        // 键名未命中时，退回到实际读值探测（兼容容器字段/嵌套对象/records形态）。
        const probedValue = readFieldValueFromGroupFields(fields, fieldPath)
        const isValueHit = probedValue !== null && probedValue !== undefined && probedValue !== ''
        if (isValueHit) hitCount += 1
      })
      return hitCount
    }

    /**
     * 计算分组节点覆盖度（同时支持 fields 与 records[].fields）。
     *
     * @param {Record<string, any> | null | undefined} groupNode 分组节点。
     * @returns {number}
     */
    const evaluateGroupNodeCoverage = (groupNode) => {
      if (!groupNode || typeof groupNode !== 'object') return 0
      let bestCoverage = 0
      const fields = groupNode?.fields && typeof groupNode.fields === 'object' ? groupNode.fields : {}
      bestCoverage = Math.max(bestCoverage, evaluateFieldsCoverage(fields))
      const records = Array.isArray(groupNode?.records) ? groupNode.records : []
      records.forEach((record) => {
        if (!record || typeof record !== 'object') return
        const recordFields = record?.fields && typeof record.fields === 'object'
          ? record.fields
          : record
        bestCoverage = Math.max(bestCoverage, evaluateFieldsCoverage(recordFields))
      })
      return bestCoverage
    }

    /**
     * 从“可能是文件夹容器”的节点中挑选覆盖度最高的子节点。
     *
     * @param {Record<string, any>} containerNode 容器节点。
     * @returns {{node: Record<string, any> | null; childKey: string | null; coverage: number}}
     */
    const resolveBestChildNodeFromContainer = (containerNode) => {
      if (!containerNode || typeof containerNode !== 'object') {
        return { node: null, childKey: null, coverage: 0 }
      }
      const nestedGroups = containerNode?.groups && typeof containerNode.groups === 'object'
        ? containerNode.groups
        : {}
      let bestNode = null
      let bestChildKey = null
      let bestCoverage = 0
      Object.entries(nestedGroups).forEach(([childKey, childNode]) => {
        if (!childNode || typeof childNode !== 'object') return
        const coverage = evaluateGroupNodeCoverage(childNode)
        if (coverage > bestCoverage) {
          bestCoverage = coverage
          bestNode = childNode
          bestChildKey = childKey
        }
      })
      return {
        node: bestNode,
        childKey: bestChildKey,
        coverage: bestCoverage,
      }
    }

    const tryMatchByCandidateKeys = (candidateKeys) => {
      for (const groupKey of candidateKeys) {
        const normalizedCandidateKey = normalizeSlashPath(groupKey)
        const matchedEntry = normalizedEntries.find((entry) => entry.normalizedKey === normalizedCandidateKey)
        if (matchedEntry && matchedEntry.node && typeof matchedEntry.node === 'object') {
          const directCoverage = evaluateGroupNodeCoverage(matchedEntry.node)
          if (directCoverage > 0) {
            return {
              groupNode: matchedEntry.node,
              matchedGroupKey: matchedEntry.rawKey,
              matchedCandidateKey: groupKey,
              candidateKeys: allCandidateKeys,
            }
          }
          const bestChild = resolveBestChildNodeFromContainer(matchedEntry.node)
          if (bestChild.node && bestChild.coverage > 0) {
            return {
              groupNode: bestChild.node,
              matchedGroupKey: `${matchedEntry.rawKey}/${bestChild.childKey}`,
              matchedCandidateKey: '__container_child_match__',
              candidateKeys: allCandidateKeys,
            }
          }
          return {
            groupNode: matchedEntry.node,
            matchedGroupKey: matchedEntry.rawKey,
            matchedCandidateKey: groupKey,
            candidateKeys: allCandidateKeys,
          }
        }
      }
      return null
    }
    const strictMatch = tryMatchByCandidateKeys(strictCandidateKeys)
    if (strictMatch) return { ...strictMatch, matchedMode: 'strict-key' }
    if (!enableLegacyGroupFallback) {
      return {
        groupNode: null,
        matchedGroupKey: null,
        matchedCandidateKey: null,
        matchedMode: 'strict-miss',
        candidateKeys: allCandidateKeys,
      }
    }

    /**
     * 通过“字段覆盖度”在现有 group 节点中反向选最优节点，避免仅靠 key 命中失败。
     *
     * @param {Record<string, any>} groupNode 分组节点。
     * @returns {number}
     */
    const evaluateFieldCoverage = (groupNode) => {
      return evaluateGroupNodeCoverage(groupNode)
    }
    let bestCoverageMatch = null
    normalizedEntries.forEach((entry) => {
      const directCoverage = evaluateFieldCoverage(entry.node)
      const bestChild = resolveBestChildNodeFromContainer(entry.node)
      let candidateCoverage = directCoverage
      let candidateNode = entry.node
      let candidateGroupKey = entry.rawKey
      let candidateKey = '__field_coverage_match__'
      if (bestChild?.node && bestChild.coverage > candidateCoverage) {
        candidateCoverage = bestChild.coverage
        candidateNode = bestChild.node
        candidateGroupKey = `${entry.rawKey}/${bestChild.childKey}`
        candidateKey = '__field_coverage_child_match__'
      }
      if (candidateCoverage <= 0) return
      if (!bestCoverageMatch || candidateCoverage > bestCoverageMatch.coverage) {
        bestCoverageMatch = {
          coverage: candidateCoverage,
          groupNode: candidateNode,
          matchedGroupKey: candidateGroupKey,
          matchedCandidateKey: candidateKey,
        }
      }
    })
    if (bestCoverageMatch?.groupNode && typeof bestCoverageMatch.groupNode === 'object') {
      return {
        groupNode: bestCoverageMatch.groupNode,
        matchedGroupKey: bestCoverageMatch.matchedGroupKey,
        matchedCandidateKey: bestCoverageMatch.matchedCandidateKey,
        matchedMode: 'field-coverage',
        candidateKeys: allCandidateKeys,
      }
    }

    const fallbackMatch = tryMatchByCandidateKeys(fallbackCandidateKeys)
    if (fallbackMatch) return { ...fallbackMatch, matchedMode: 'folder-fallback' }

    for (const groupKey of allCandidateKeys) {
      const normalizedCandidateKey = normalizeSlashPath(groupKey)
      const matchedEntry = normalizedEntries.find((entry) => entry.normalizedKey === normalizedCandidateKey)
      if (matchedEntry && matchedEntry.node && typeof matchedEntry.node === 'object') {
        return {
          groupNode: matchedEntry.node,
          matchedGroupKey: matchedEntry.rawKey,
          matchedCandidateKey: groupKey,
          matchedMode: 'candidate-relaxed',
          candidateKeys: allCandidateKeys,
        }
      }
    }
    return {
      groupNode: null,
      matchedGroupKey: null,
      matchedCandidateKey: null,
      matchedMode: 'missing',
      candidateKeys: allCandidateKeys,
    }
  }

  /**
   * 将分组节点映射为行记录数组（用于当前组多行展开）。
   *
   * @param {Record<string, any> | null} groupNode 分组节点。
   * @returns {Array<Record<string, any>>}
   */
  const buildGroupRecords = (patient, groupNode) => {
    const isRepeatableGroup = Boolean(activeGroup?.groupRenderMeta?.isRepeatable)
    if (!isRepeatableGroup) return []
    if (!groupNode || typeof groupNode !== 'object') return []
    /**
     * 归一化重复组单行记录，仅保留字段字典（不混入容器元信息）。
     *
     * @param {Record<string, any> | null | undefined} rawRecord 原始记录。
     * @returns {Record<string, any>}
     */
    const normalizeRowFields = (rawRecord) => {
      if (!rawRecord || typeof rawRecord !== 'object') return { value: rawRecord }
      const unwrapped = rawRecord.fields && typeof rawRecord.fields === 'object'
        ? rawRecord.fields
        : rawRecord
      if (!unwrapped || typeof unwrapped !== 'object') return { value: unwrapped }
      return Object.entries(unwrapped).reduce((acc, [fieldKey, fieldValue]) => {
        if (String(fieldKey).startsWith('__')) return acc
        acc[fieldKey] = fieldValue
        return acc
      }, {})
    }
    if (Array.isArray(groupNode.records) && groupNode.records.length > 0) {
      return groupNode.records.map((record) => normalizeRowFields(record))
    }

    const fields = groupNode.fields && typeof groupNode.fields === 'object' ? groupNode.fields : {}
    const activeFieldPaths = getActiveGroupSourceFieldKeys()
    if (activeFieldPaths.length === 0) return []
    /**
     * 判定候选值是否为“可用命中”：
     * - null/undefined/空串：无效；
     * - 空数组：无效（允许继续尝试更精确路径，避免被空数组误命中）；
     * - 其他值：有效。
     *
     * @param {any} value 候选值。
     * @returns {boolean}
     */
    const isMeaningfulValue = (value) => {
      if (value === null || value === undefined || value === '') return false
      if (Array.isArray(value)) return value.length > 0
      return true
    }
    let maxCount = 0
    let hasAnyValue = false
    const scopedFieldValues = {}
    activeFieldPaths.forEach((fieldPath) => {
      let candidateValue = readFieldValueFromGroupFields(fields, fieldPath)
      if (!isMeaningfulValue(candidateValue)) {
        candidateValue = getScopedFieldRawValue({
          ...patient,
          __resolvedGroupNode: groupNode,
          __groupMatchMeta: { groupNode },
          __groupRowIndex: 0,
          __groupRowCount: Math.max(1, maxCount || 1),
        }, activeGroup?.group_id, fieldPath, {
          groupName: activeGroup?.group_name,
          groupPathTokens: activeGroup?.groupPathTokens,
          strictPathOnly: true,
        })
      }
      scopedFieldValues[fieldPath] = candidateValue
      if (isMeaningfulValue(candidateValue)) {
        hasAnyValue = true
      }
      if (Array.isArray(candidateValue) && candidateValue.length > maxCount) {
        maxCount = candidateValue.length
      }
    })

    if (maxCount === 0 && hasAnyValue) {
      maxCount = 1
    }
    if (maxCount <= 0) return []

    return Array.from({ length: maxCount }, (_unused, index) => {
      const rowRecord = {}
      Object.entries(scopedFieldValues).forEach(([fieldPath, candidateValue]) => {
        rowRecord[fieldPath] = Array.isArray(candidateValue) ? (candidateValue[index] ?? null) : candidateValue
      })
      return rowRecord
    })
  }

  /**
   * 解析患者在当前激活字段组下的标准化上下文。
   * 该上下文会作为右侧渲染与诊断的唯一来源，避免重复走多套解析入口。
   *
   * @param {Record<string, any>} patient 患者对象。
   * @returns {{
   *  groupMatch: Record<string, any>;
   *  groupNode: Record<string, any> | null;
   *  groupRecords: Array<Record<string, any>>;
   *  groupRowCount: number;
   * }}
   */
  const resolvePatientActiveGroupContext = (patient) => {
    const groupMatch = resolveActiveGroupMatch(patient)
    const groupNode = groupMatch?.groupNode || null
    const groupRecords = buildGroupRecords(patient, groupNode)
    const groupRowCount = Math.max(groupRecords.length || 0, 1)
    return {
      groupMatch,
      groupNode,
      groupRecords,
      groupRowCount,
    }
  }

  /**
   * 当前激活字段组对应的左右统一行模型（左侧 rowSpan、右侧逐行对齐共用）。
   */
  const visiblePatientRenderRows = useMemo(() => {
    return visiblePatients.flatMap((patient) => {
      const {
        groupMatch,
        groupNode,
        groupRecords,
        groupRowCount,
      } = resolvePatientActiveGroupContext(patient)
      if (enableConsistencyDebug) {
        console.info('[ProjectDatasetV2] 组级行数估算', {
          patientId: patient?.patient_id,
          activeGroupId: activeGroup?.group_id,
          matchedGroupKey: groupMatch?.matchedGroupKey,
          matchedCandidateKey: groupMatch?.matchedCandidateKey,
          matchedMode: groupMatch?.matchedMode,
          isRepeatableGroup: Boolean(activeGroup?.groupRenderMeta?.isRepeatable),
          scopedSourceFieldCount: getActiveGroupSourceFieldKeys().length,
          resolvedRowCount: groupRowCount,
        })
      }
      return Array.from({ length: groupRowCount }, (_unused, groupRowIndex) => ({
        ...patient,
        __groupRowIndex: groupRowIndex,
        __groupRowCount: groupRowCount,
        __activeGroupRecord: groupRecords[groupRowIndex] || null,
        __groupMatchMeta: groupMatch,
        __resolvedGroupNode: groupNode,
        __resolvedGroupKey: groupMatch?.matchedGroupKey || null,
        __resolvedCandidateKey: groupMatch?.matchedCandidateKey || null,
        __resolvedMatchMode: groupMatch?.matchedMode || 'missing',
        __rowKey: `${patient.patient_id}__${groupRowIndex}`,
      }))
    })
  }, [activeGroup, enableConsistencyDebug, groupMatchMode, visiblePatients])

  /**
   * 可见患者行索引映射（patient_id -> rowIndex）。
   */
  const rowIndexByPatientId = useMemo(() => {
    const indexMap = new Map()
    visiblePatientIds.forEach((patientId, index) => {
      indexMap.set(patientId, index)
    })
    return indexMap
  }, [visiblePatientIds])

  const isAllVisibleSelected = visiblePatients.length > 0
    && visiblePatients.every((patient) => selectedPatientIds.includes(patient.patient_id))
  const isSomeVisibleSelected = visiblePatients.some((patient) => selectedPatientIds.includes(patient.patient_id))
    && !isAllVisibleSelected

  const handleToggleAllVisible = (checked) => {
    visiblePatients.forEach((patient) => {
      onToggleSelectPatient(patient.patient_id, checked)
    })
  }

  useEffect(() => {
    const leftBody = leftPanelRef.current?.querySelector('.ant-table-body')
    const rightBody = rightPanelRef.current?.querySelector('.ant-table-body')
    if (!leftBody || !rightBody) return undefined

    let syncing = false
    const syncFromLeft = () => {
      if (syncing) return
      syncing = true
      rightBody.scrollTop = leftBody.scrollTop
      requestAnimationFrame(() => { syncing = false })
    }
    const syncFromRight = () => {
      if (syncing) return
      syncing = true
      leftBody.scrollTop = rightBody.scrollTop
      requestAnimationFrame(() => { syncing = false })
    }

    leftBody.addEventListener('scroll', syncFromLeft)
    rightBody.addEventListener('scroll', syncFromRight)
    return () => {
      leftBody.removeEventListener('scroll', syncFromLeft)
      rightBody.removeEventListener('scroll', syncFromRight)
    }
  }, [activeGroupKey, visiblePatients.length])

  useEffect(() => {
    if (!enableConsistencyDebug) return
    const leftIds = visiblePatients.map((patient) => patient.patient_id)
    const missingIds = leftIds.filter((patientId) => !rowIndexByPatientId.has(patientId))
    if (missingIds.length > 0) {
      console.warn('[ProjectDatasetV2] rowIndexByPatientId 缺失映射', {
        missingIds,
        leftIds,
      })
    }
  }, [enableConsistencyDebug, rowIndexByPatientId, visiblePatients])

  useEffect(() => {
    if (groupMatchMode !== PROJECT_DATASET_GROUP_MATCH_MODE.COMPATIBLE) return
    if (!import.meta?.env?.DEV) return
    if (!enableConsistencyDebug) return
    console.warn('[ProjectDatasetV2] 当前处于兼容匹配模式（legacy fallback 开启）', {
      groupMatchMode,
      rollbackHint: 'set groupMatchMode=strict to enforce contract-first matching',
    })
  }, [enableConsistencyDebug, groupMatchMode])

  useEffect(() => {
    if (!enableConsistencyDebug || !activeGroup) return
    const isRepeatableGroup = Boolean(activeGroup?.groupRenderMeta?.isRepeatable)
    const patientRows = Array.isArray(visiblePatients) ? visiblePatients : []
    const activeFieldPaths = getActiveGroupSourceFieldKeys()
    const preferredGroupKeys = new Set(
      [
        activeGroup?.group_id,
        activeGroup?.groupPath,
        activeGroup?.repeatableDataPath,
      ].map((key) => normalizeSlashPath(key)).filter(Boolean),
    )
    const normalizedFolderName = normalizeSlashPath(activeGroup?.folderName)
    let resolvedGroupHitCount = 0
    let strictGroupKeyHitCount = 0
    let folderFallbackHitCount = 0
    let strictMissCount = 0
    let shapeMatchedCount = 0
    const mismatchPatientSamples = []
    const contractKeyStyleStats = {
      secStyleKeyPatients: 0,
      folderOnlyKeyPatients: 0,
      pathStyleKeyPatients: 0,
      mixedKeyPatients: 0,
      emptyGroupMapPatients: 0,
    }

    const expandedPatientCount = patientRows.filter((patient) => {
      return visiblePatientRenderRows.some((row) => row?.patient_id === patient?.patient_id && Number(row?.__groupRowCount) > 1)
    }).length
    const repeatableGroupHitRate = isRepeatableGroup && patientRows.length > 0
      ? Number((expandedPatientCount / patientRows.length).toFixed(4))
      : 1

    let rowExpansionMismatchCount = 0
    patientRows.forEach((patient) => {
      const patientRenderRows = visiblePatientRenderRows.filter((row) => row?.patient_id === patient?.patient_id)
      const firstResolvedRow = patientRenderRows[0] || null
      const groupMap = patient?.crf_data?.groups && typeof patient.crf_data.groups === 'object'
        ? patient.crf_data.groups
        : {}
      const availableKeys = Object.keys(groupMap)
      const hasSecStyleKey = availableKeys.some((rawKey) => /^sec_[a-z0-9]+$/i.test(String(rawKey || '')))
      const hasPathStyleKey = availableKeys.some((rawKey) => String(rawKey || '').includes('/'))
      const hasFolderStyleKey = availableKeys.some((rawKey) => !String(rawKey || '').includes('/') && !/^sec_[a-z0-9]+$/i.test(String(rawKey || '')))
      if (availableKeys.length === 0) {
        contractKeyStyleStats.emptyGroupMapPatients += 1
      } else {
        const activeStyleCount = [hasSecStyleKey, hasPathStyleKey, hasFolderStyleKey].filter(Boolean).length
        if (activeStyleCount > 1) {
          contractKeyStyleStats.mixedKeyPatients += 1
        } else if (hasSecStyleKey) {
          contractKeyStyleStats.secStyleKeyPatients += 1
        } else if (hasPathStyleKey) {
          contractKeyStyleStats.pathStyleKeyPatients += 1
        } else if (hasFolderStyleKey) {
          contractKeyStyleStats.folderOnlyKeyPatients += 1
        }
      }

      const groupNode = firstResolvedRow?.__resolvedGroupNode || null
      const matchedGroupKeyRaw = firstResolvedRow?.__resolvedGroupKey || null
      const matchedCandidateKeyRaw = firstResolvedRow?.__resolvedCandidateKey || null
      const matchedModeRaw = firstResolvedRow?.__resolvedMatchMode || 'missing'
      const expectedRows = Number(firstResolvedRow?.__groupRowCount) || 1
      const actualRows = patientRenderRows.length
      if (expectedRows !== actualRows) rowExpansionMismatchCount += 1
      const matchedGroupKey = normalizeSlashPath(matchedGroupKeyRaw)
      if (groupNode) {
        resolvedGroupHitCount += 1
        if (preferredGroupKeys.has(matchedGroupKey)) strictGroupKeyHitCount += 1
        if (normalizedFolderName && matchedGroupKey === normalizedFolderName) folderFallbackHitCount += 1
      } else if (matchedModeRaw === 'strict-miss') {
        strictMissCount += 1
      }
      if (mismatchPatientSamples.length < 5) {
        const isStrictHit = preferredGroupKeys.has(matchedGroupKey)
        const isFolderFallback = normalizedFolderName && matchedGroupKey === normalizedFolderName
        if (!isStrictHit || !groupNode || isFolderFallback) {
          mismatchPatientSamples.push({
            patientId: patient?.patient_id,
            matchedGroupKey: matchedGroupKeyRaw,
            matchedCandidateKey: matchedCandidateKeyRaw,
            matchedMode: matchedModeRaw,
            candidateKeys: firstResolvedRow?.__groupMatchMeta?.candidateKeys || [],
            availableGroupKeys: Object.keys(groupMap),
            isStrictHit,
            isFolderFallback: Boolean(isFolderFallback),
          })
        }
      }
      if (groupNode && typeof groupNode === 'object') {
        if (Array.isArray(groupNode.records) && groupNode.records.length > 0) {
          shapeMatchedCount += 1
        } else {
          const fields = groupNode?.fields && typeof groupNode.fields === 'object' ? groupNode.fields : {}
          const hasAnyField = activeFieldPaths.some((fieldPath) => {
            const rawValue = readFieldValueFromGroupFields(fields, fieldPath)
            return rawValue !== null && rawValue !== undefined && rawValue !== ''
          })
          if (hasAnyField) shapeMatchedCount += 1
        }
      }
    })

    const complexColumns = (Array.isArray(activeGroup.columns) ? activeGroup.columns : [])
      .filter((column) => column?.nodeKind !== 'scalar')
    let nonEmptyComplexCellCount = 0
    let totalComplexCellCount = 0
    patientRows.forEach((patient) => {
      complexColumns.forEach((column) => {
        totalComplexCellCount += 1
        const sourceFieldKey = Array.isArray(column?.sourceFieldKeys) && column.sourceFieldKeys.length > 0
          ? column.sourceFieldKeys[0]
          : column?.key
        const rawValue = getScopedFieldRawValue(patient, activeGroup?.group_id, sourceFieldKey, {
          groupName: activeGroup?.group_name,
          groupPathTokens: activeGroup?.groupPathTokens,
          strictPathOnly: true,
        })
        if (rawValue !== null && rawValue !== undefined && rawValue !== '') {
          nonEmptyComplexCellCount += 1
        }
      })
    })
    const nestedTableNonEmptyRate = totalComplexCellCount > 0
      ? Number((nonEmptyComplexCellCount / totalComplexCellCount).toFixed(4))
      : 1
    const resolvedGroupKeyHitRate = patientRows.length > 0
      ? Number((resolvedGroupHitCount / patientRows.length).toFixed(4))
      : 1
    const strictGroupKeyHitRate = patientRows.length > 0
      ? Number((strictGroupKeyHitCount / patientRows.length).toFixed(4))
      : 1
    const folderFallbackHitRate = patientRows.length > 0
      ? Number((folderFallbackHitCount / patientRows.length).toFixed(4))
      : 0
    const groupNodeShapeHitRate = patientRows.length > 0
      ? Number((shapeMatchedCount / patientRows.length).toFixed(4))
      : 1

    console.info('[ProjectDatasetV2] 渲染链路门禁指标', {
      activeGroupId: activeGroup?.group_id,
      activeGroupName: activeGroup?.group_name,
      groupMatchMode,
      enableLegacyGroupFallback,
      fallbackModeActive: enableLegacyGroupFallback,
      isRepeatableGroup,
      patientCount: patientRows.length,
      expandedPatientCount,
      repeatableGroupHitRate,
      rowExpansionMismatchCount,
      nestedTableNonEmptyRate,
      resolvedGroupKeyHitRate,
      strictGroupKeyHitRate,
      folderFallbackHitRate,
      strictMissCount,
      groupNodeShapeHitRate,
      contractKeyStyleStats,
    })
    const strictGateStatus = {
      isStrictMode: groupMatchMode === PROJECT_DATASET_GROUP_MATCH_MODE.STRICT,
      fallbackClosed: !enableLegacyGroupFallback,
      folderFallbackCleared: folderFallbackHitRate === 0,
      strictMissCleared: strictMissCount === 0,
      repeatableAligned: rowExpansionMismatchCount === 0,
    }
    console.info('[ProjectDatasetV2] strict收口门禁状态', {
      activeGroupId: activeGroup?.group_id,
      activeGroupName: activeGroup?.group_name,
      ...strictGateStatus,
    })
    if (
      strictGateStatus.isStrictMode
      && (!strictGateStatus.folderFallbackCleared || !strictGateStatus.strictMissCleared)
    ) {
      console.warn('[ProjectDatasetV2] strict模式门禁未通过', {
        activeGroupId: activeGroup?.group_id,
        activeGroupName: activeGroup?.group_name,
        strictMissCount,
        folderFallbackHitRate,
        mismatchPatientSamples,
      })
    }
    if (strictGroupKeyHitRate < 1 || folderFallbackHitRate > 0) {
      console.warn('[ProjectDatasetV2] 组键命中异常样本', {
        activeGroupId: activeGroup?.group_id,
        activeGroupName: activeGroup?.group_name,
        strictGroupKeyHitRate,
        folderFallbackHitRate,
        mismatchPatientSamples,
      })
    }
  }, [activeGroup, enableConsistencyDebug, enableLegacyGroupFallback, groupMatchMode, visiblePatientRenderRows, visiblePatients])

  useEffect(() => {
    if (!enableConsistencyDebug || !activeGroup || !Array.isArray(activeGroup.columns)) return
    const targetColumns = activeGroup.columns.filter((column) => {
      const title = String(column?.title || '')
      return title.includes('基因突变详情') || title.includes('胚系突变详情')
    })
    if (targetColumns.length === 0) return
    console.info('[ProjectDatasetV2] 突变详情列定义对照', targetColumns.map((column) => ({
      key: column?.key || null,
      title: column?.title || null,
      sourceFieldKeyCount: Array.isArray(column?.sourceFieldKeys) ? column.sourceFieldKeys.length : 0,
      sourceFieldKeys: column?.sourceFieldKeys || [],
      nodeKind: column?.nodeKind || null,
      schemaNodeKind: column?.schemaNodeKind || null,
      legacyNodeKind: column?.legacyNodeKind || null,
      schemaResolved: Boolean(column?.schemaResolved),
    })))
  }, [activeGroup, enableConsistencyDebug])

  if (!patients?.length) {
    return <Empty description="暂无患者数据" />
  }

  return (
    <div className="project-dataset-v2-layout">
      <div ref={leftPanelRef} className="project-dataset-v2-panel project-dataset-v2-left-panel">
        <div className="project-dataset-v2-left-header">
          <Input.Search
            id="project-dataset-v2-patient-search"
            name="projectDatasetV2PatientSearch"
            allowClear
            size="small"
            placeholder="搜索编号/姓名"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <Space size={8}>
            <Select
              size="small"
              value={completenessFilter}
              style={{ width: 108 }}
              onChange={setCompletenessFilter}
              options={[
                { label: '完整度: 全部', value: 'all' },
                { label: '高(>=90%)', value: 'high' },
                { label: '中(60-90%)', value: 'middle' },
                { label: '低(<60%)', value: 'low' },
              ]}
            />
          </Space>
        </div>
        <PatientKeyTable
          patients={visiblePatientRenderRows}
          selectedPatientIds={selectedPatientIds}
          isAllCurrentPageSelected={isAllVisibleSelected}
          isSomeCurrentPageSelected={isSomeVisibleSelected}
          onToggleSelectAll={handleToggleAllVisible}
          onToggleSelectPatient={onToggleSelectPatient}
          onNavigatePatient={onNavigatePatient}
          onExtractPatient={onExtractPatient}
          patientExtractionById={patientExtractionById}
          pagination={pagination}
          onPageChange={onPageChange}
          loading={loading}
          scrollY={leftScrollY}
        />
      </div>
      <div ref={rightPanelRef} className="project-dataset-v2-panel project-dataset-v2-right-panel">
        <FieldGroupTabs
          loading={loading || groupFieldsLoading}
          fieldGroups={fieldGroups}
          folders={folders}
          groupsByFolder={groupsByFolder}
          patients={visiblePatientRenderRows}
          visiblePatientIds={visiblePatientIds}
          rowIndexByPatientId={rowIndexByPatientId}
          enableConsistencyDebug={enableConsistencyDebug}
          activeGroupKey={activeGroupKey}
          onGroupChange={onGroupChange}
          scrollY={rightScrollY}
        />
      </div>
    </div>
  )
}

export default ProjectDatasetV2

