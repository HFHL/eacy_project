import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Empty, Segmented, Spin, Tabs } from 'antd'
import FieldGroupTable from './FieldGroupTable'
import NestedDetailDrawer from './NestedDetailDrawer'
import SinglePatientGroupCards from './SinglePatientGroupCards'

/**
 * 字段组 Tabs 容器。
 *
 * @param {{
 *  loading?: boolean;
 *  fieldGroups: Array<Record<string, any>>;
 *  folders: Array<{folderKey:string,folderName:string,groups:Array<Record<string, any>>}>;
 *  groupsByFolder: Record<string, Array<Record<string, any>>>;
 *  patients: Array<Record<string, any>>;
 *  visiblePatientIds?: string[];
 *  rowIndexByPatientId?: Map<string, number>;
 *  enableConsistencyDebug?: boolean;
 *  activeGroupKey: string | null;
 *  onGroupChange: (groupKey: string) => void;
 *  scrollY: number;
 * }} props 组件参数。
 * @returns {JSX.Element}
 */
const FieldGroupTabs = ({
  loading = false,
  fieldGroups,
  folders,
  groupsByFolder,
  patients,
  visiblePatientIds = [],
  rowIndexByPatientId = new Map(),
  enableConsistencyDebug = false,
  activeGroupKey,
  onGroupChange,
  scrollY,
}) => {
  const safeFieldGroups = Array.isArray(fieldGroups) ? fieldGroups : []
  const safePatients = Array.isArray(patients) ? patients : []
  const hasPatients = safePatients.length > 0
  const hasFieldGroups = safeFieldGroups.length > 0

  const folderList = Array.isArray(folders) && folders.length > 0
    ? folders
    : [{
      folderKey: 'all',
      folderName: '全部字段组',
      groups: safeFieldGroups,
    }]

  const activeGroup = safeFieldGroups.find((group) => group.group_id === activeGroupKey)
  const [activeFolderKey, setActiveFolderKey] = useState(
    activeGroup?.folderKey || folderList[0]?.folderKey || 'all',
  )
  const folderGroupMemoryRef = useRef(
    activeGroup?.group_id ? { [activeGroup.folderKey]: activeGroup.group_id } : {},
  )
  const [isFolderInitialized, setIsFolderInitialized] = useState(false)

  const activeFolderGroups = useMemo(() => {
    if (!activeFolderKey) return safeFieldGroups
    return groupsByFolder?.[activeFolderKey] || safeFieldGroups.filter((group) => group.folderKey === activeFolderKey)
  }, [activeFolderKey, groupsByFolder, safeFieldGroups])

  const isActiveGroupInCurrentFolder = activeFolderGroups.some((group) => group.group_id === activeGroupKey)
  const rememberedGroupId = folderGroupMemoryRef.current[activeFolderKey]
  const fallbackGroupId = rememberedGroupId || activeFolderGroups[0]?.group_id
  const previewGroupId = isActiveGroupInCurrentFolder
    ? activeGroupKey
    : fallbackGroupId
  const currentGroup = safeFieldGroups.find((group) => group.group_id === previewGroupId) || safeFieldGroups[0]

  const rightRenderPatients = useMemo(() => {
    const rows = [...safePatients]
    rows.sort((a, b) => {
      const indexA = rowIndexByPatientId.get(a?.patient_id)
      const indexB = rowIndexByPatientId.get(b?.patient_id)
      if (Number.isFinite(indexA) && Number.isFinite(indexB)) return indexA - indexB
      if (Number.isFinite(indexA)) return -1
      if (Number.isFinite(indexB)) return 1
      return String(a?.patient_id || '').localeCompare(String(b?.patient_id || ''))
    })
    return rows
  }, [rowIndexByPatientId, safePatients])

  const folderItems = folderList.map((folder) => ({
    key: folder.folderKey,
    label: folder.folderName,
  }))

  /**
   * 确保当前激活文件夹存在；当文件夹列表重建后回退到首个文件夹。
   */
  useEffect(() => {
    if (!folderList.length) return
    const folderExists = folderList.some((folder) => folder.folderKey === activeFolderKey)
    if (folderExists) return
    setActiveFolderKey(folderList[0].folderKey)
  }, [activeFolderKey, folderList])

  /**
   * 首次进入页面时，自动选择首个文件夹并渲染该文件夹下首个字段组。
   */
  useEffect(() => {
    if (!folderList.length || !safeFieldGroups.length) return
    if (isFolderInitialized) return

    const firstFolderKey = folderList[0]?.folderKey
    const firstFolderGroups = groupsByFolder?.[firstFolderKey]
      || safeFieldGroups.filter((group) => group.folderKey === firstFolderKey)
    const firstGroupId = firstFolderGroups[0]?.group_id

    if (!firstFolderKey || !firstGroupId) return

    folderGroupMemoryRef.current[firstFolderKey] = firstGroupId
    setActiveFolderKey(firstFolderKey)
    if (activeGroupKey !== firstGroupId) {
      onGroupChange(firstGroupId)
    }
    setIsFolderInitialized(true)
  }, [activeGroupKey, folderList, groupsByFolder, isFolderInitialized, onGroupChange, safeFieldGroups])

  /**
   * 保证“当前文件夹”至少有一个可渲染字段组，并同步到父级 activeGroupKey。
   */
  useEffect(() => {
    if (!activeFolderKey || !activeFolderGroups.length) return

    const currentFolderHasActive = activeFolderGroups.some((group) => group.group_id === activeGroupKey)
    if (currentFolderHasActive) {
      folderGroupMemoryRef.current[activeFolderKey] = activeGroupKey
      return
    }

    const nextGroupId = folderGroupMemoryRef.current[activeFolderKey] || activeFolderGroups[0]?.group_id
    if (!nextGroupId) return
    folderGroupMemoryRef.current[activeFolderKey] = nextGroupId
    if (activeGroupKey !== nextGroupId) {
      onGroupChange(nextGroupId)
    }
  }, [activeFolderGroups, activeFolderKey, activeGroupKey, onGroupChange])

  const initialFolderLoading = !loading && hasPatients && hasFieldGroups && !isFolderInitialized

  /**
   * 解析抽屉 schema 内核渲染开关。
   *
   * @returns {boolean}
   */
  const resolveDrawerKernelFlag = () => {
    if (typeof window === 'undefined') return true
    const queryValue = new URLSearchParams(window.location.search).get('drawerKernel')
    if (queryValue === '1' || queryValue === 'true') return true
    if (queryValue === '0' || queryValue === 'false') return false
    const storageValue = window.localStorage?.getItem('projectDatasetV2DrawerKernel')
    if (storageValue === 'true') return true
    if (storageValue === 'false') return false
    return true
  }

  const [useSchemaKernelDrawer] = useState(resolveDrawerKernelFlag)
  const [nestedDetailOpen, setNestedDetailOpen] = useState(false)
  const [nestedDetailTitle, setNestedDetailTitle] = useState('')
  const [nestedDetailPayload, setNestedDetailPayload] = useState(null)

  useEffect(() => {
    if (!enableConsistencyDebug) return
    const rightIds = rightRenderPatients.map((patient) => patient?.patient_id).filter(Boolean)
    const missingInRight = visiblePatientIds.filter((patientId) => !rightIds.includes(patientId))
    const extraInRight = rightIds.filter((patientId) => !visiblePatientIds.includes(patientId))

    console.info('[FieldGroupTabs] 右侧渲染摘要', {
      activeGroupKey: currentGroup?.group_id || null,
      activeFolderKey,
      renderMode: rightRenderPatients.length === 1 ? 'single-patient-cards' : 'multi-patient-table',
      leftVisibleCount: visiblePatientIds.length,
      rightRenderCount: rightIds.length,
      rightIdsSample: rightIds.slice(0, 10),
    })

    if (missingInRight.length > 0 || extraInRight.length > 0) {
      console.warn('[FieldGroupTabs] 左右患者集合不一致', {
        missingInRight,
        extraInRight,
        leftIds: visiblePatientIds,
        rightIds,
      })
    }
  }, [activeFolderKey, currentGroup?.group_id, enableConsistencyDebug, rightRenderPatients, visiblePatientIds])

  useEffect(() => {
    if (!enableConsistencyDebug || !currentGroup) return
    const columns = Array.isArray(currentGroup.columns) ? currentGroup.columns : []
    const legacyScalarCount = columns.filter((column) => column?.legacyNodeKind === 'scalar').length
    const schemaScalarCount = columns.filter((column) => column?.schemaNodeKind === 'scalar').length
    const unresolvedColumns = columns
      .filter((column) => !column?.schemaResolved)
      .map((column) => column?.key)
      .filter(Boolean)
    console.info('[FieldGroupTabs] 影子并跑结构诊断', {
      groupId: currentGroup.group_id,
      groupName: currentGroup.group_name,
      legacyScalarCount,
      schemaScalarCount,
      unresolvedColumnCount: unresolvedColumns.length,
      unresolvedColumns: unresolvedColumns.slice(0, 20),
      schemaShadowMetrics: currentGroup.schemaShadowMetrics || null,
      useSchemaKernelDrawer,
    })
  }, [currentGroup, enableConsistencyDebug, useSchemaKernelDrawer])

  useEffect(() => {
    if (!enableConsistencyDebug || !currentGroup) return
    const normalizeSlashPath = (rawPath) => {
      return String(rawPath || '')
        .normalize('NFKC')
        .replace(/\s*\/\s*/g, '/')
        .trim()
    }
    const readScopedValue = (groupRecord, fieldPath) => {
      if (!groupRecord || typeof groupRecord !== 'object') return null
      const normalizedFieldPath = normalizeSlashPath(fieldPath)
      const pathSegments = normalizedFieldPath.split('/').filter(Boolean)
      const pathCandidates = [normalizedFieldPath]
      if (pathSegments.length > 1) {
        pathCandidates.push(pathSegments.slice(1).join('/'))
      }
      const entries = Object.entries(groupRecord)
      for (const pathKey of pathCandidates) {
        const matched = entries.find(([rawKey]) => normalizeSlashPath(rawKey) === pathKey)
        if (!matched) continue
        const rawValue = matched[1]
        if (rawValue && typeof rawValue === 'object' && Object.prototype.hasOwnProperty.call(rawValue, 'value')) {
          return rawValue.value
        }
        return rawValue
      }
      return null
    }

    const renderedRows = Array.isArray(rightRenderPatients) ? rightRenderPatients : []
    const columns = Array.isArray(currentGroup.columns) ? currentGroup.columns : []
    const complexColumns = columns.filter((column) => column?.nodeKind !== 'scalar')
    let totalChecks = 0
    let nonEmptyChecks = 0
    renderedRows.forEach((row) => {
      complexColumns.forEach((column) => {
        totalChecks += 1
        const sourceFieldKey = Array.isArray(column?.sourceFieldKeys) && column.sourceFieldKeys.length > 0
          ? column.sourceFieldKeys[0]
          : column?.key
        const value = readScopedValue(row?.__activeGroupRecord || null, sourceFieldKey)
        if (value !== null && value !== undefined && value !== '') {
          nonEmptyChecks += 1
        }
      })
    })
    const nestedTableNonEmptyRate = totalChecks > 0
      ? Number((nonEmptyChecks / totalChecks).toFixed(4))
      : 1
    console.info('[FieldGroupTabs] 右侧渲染门禁指标', {
      groupId: currentGroup?.group_id,
      groupName: currentGroup?.group_name,
      renderRows: renderedRows.length,
      complexColumnCount: complexColumns.length,
      nestedTableNonEmptyRate,
    })
  }, [currentGroup, enableConsistencyDebug, rightRenderPatients])

  if (!loading && !hasPatients) {
    return <Empty description="无患者数据" />
  }

  if (!hasFieldGroups) {
    return <Empty description="暂无字段组定义" />
  }

  return (
    <div className="project-dataset-v2-right-shell">
      <div className="project-dataset-v2-right-header">
        <Tabs
          activeKey={activeFolderKey}
          onChange={(nextFolderKey) => {
            setActiveFolderKey(nextFolderKey)
            const nextFolderGroups = groupsByFolder?.[nextFolderKey]
              || safeFieldGroups.filter((group) => group.folderKey === nextFolderKey)
            const nextGroupId = folderGroupMemoryRef.current[nextFolderKey] || nextFolderGroups[0]?.group_id
            if (!nextGroupId) return
            folderGroupMemoryRef.current[nextFolderKey] = nextGroupId
            // 切换第一层目录时，默认渲染该目录下“当前字段组（记忆值/首项）”。
            onGroupChange(nextGroupId)
          }}
          items={folderItems}
          className="project-dataset-v2-folder-tabs"
          size="small"
        />
        <div className="project-dataset-v2-group-pills">
          <Segmented
            size="small"
            value={previewGroupId}
            onChange={(nextGroupKey) => {
              const nextGroupId = String(nextGroupKey)
              folderGroupMemoryRef.current[activeFolderKey] = nextGroupId
              // 只有点击第二层字段组时才更新下方表格渲染。
              onGroupChange(nextGroupId)
            }}
            options={activeFolderGroups.map((group) => ({
              value: group.group_id,
              label: group.groupShortName || group.group_name,
            }))}
          />
        </div>
      </div>
      <div className="project-dataset-v2-right-table">
        <Spin spinning={loading || initialFolderLoading} tip={initialFolderLoading ? '正在加载首个文件夹表单...' : undefined}>
          {rightRenderPatients.length === 1 ? (
            <SinglePatientGroupCards
              patient={rightRenderPatients[0] || null}
              groups={currentGroup ? [currentGroup] : []}
              onOpenNestedDetail={(payload) => {
                const safePayload = payload || {}
                setNestedDetailTitle(safePayload.title || '')
                setNestedDetailPayload({
                  node: safePayload.node || null,
                  schemaNode: safePayload.schemaNode || null,
                  rawValue: safePayload.rawValue,
                })
                setNestedDetailOpen(true)
              }}
            />
          ) : (
            <FieldGroupTable
              loading={loading}
              group={currentGroup}
              patients={rightRenderPatients}
              enableConsistencyDebug={enableConsistencyDebug}
              scrollY={scrollY}
              onOpenNestedDetail={(payload) => {
                const safePayload = payload || {}
                setNestedDetailTitle(safePayload.title || '')
                setNestedDetailPayload({
                  node: safePayload.node || null,
                  schemaNode: safePayload.schemaNode || null,
                  rawValue: safePayload.rawValue,
                })
                setNestedDetailOpen(true)
              }}
            />
          )}
        </Spin>
      </div>
      <NestedDetailDrawer
        open={nestedDetailOpen}
        title={nestedDetailTitle}
        node={nestedDetailPayload?.node || null}
        schemaNode={nestedDetailPayload?.schemaNode || null}
        rawValue={nestedDetailPayload?.rawValue}
        useSchemaKernel={useSchemaKernelDrawer}
        onClose={() => {
          setNestedDetailOpen(false)
          setNestedDetailPayload(null)
        }}
      />
    </div>
  )
}

export default FieldGroupTabs
