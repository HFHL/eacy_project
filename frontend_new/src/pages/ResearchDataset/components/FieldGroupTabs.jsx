import { useMemo } from 'react'
import { Empty } from 'antd'
import NestedDetailDrawer from './NestedDetailDrawer'
import FieldGroupTabsBody from './fieldGroupTabs/FieldGroupTabsBody'
import FieldGroupTabsHeader from './fieldGroupTabs/FieldGroupTabsHeader'
import { useFieldGroupFolderState } from './fieldGroupTabs/useFieldGroupFolderState'
import { useFieldGroupTabsDebug } from './fieldGroupTabs/useFieldGroupTabsDebug'
import { useNestedDetailDrawerState } from './fieldGroupTabs/useNestedDetailDrawerState'

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

  const folderState = useFieldGroupFolderState({
    loading,
    fieldGroups: safeFieldGroups,
    folders,
    groupsByFolder,
    hasPatients,
    hasFieldGroups,
    activeGroupKey,
    onGroupChange,
  })

  const drawerState = useNestedDetailDrawerState()

  useFieldGroupTabsDebug({
    activeFolderKey: folderState.activeFolderKey,
    currentGroup: folderState.currentGroup,
    enableConsistencyDebug,
    rightRenderPatients,
    useSchemaKernelDrawer: drawerState.useSchemaKernelDrawer,
    visiblePatientIds,
  })

  if (!loading && !hasPatients) {
    return <Empty description="无患者数据" />
  }

  if (!hasFieldGroups) {
    return <Empty description="暂无字段组定义" />
  }

  return (
    <div className="project-dataset-v2-right-shell">
      <FieldGroupTabsHeader
        activeFolderGroups={folderState.activeFolderGroups}
        activeFolderKey={folderState.activeFolderKey}
        folderItems={folderState.folderItems}
        onFolderChange={folderState.handleFolderChange}
        onGroupChange={folderState.handleGroupChange}
        previewGroupId={folderState.previewGroupId}
      />
      <FieldGroupTabsBody
        currentGroup={folderState.currentGroup}
        enableConsistencyDebug={enableConsistencyDebug}
        initialFolderLoading={folderState.initialFolderLoading}
        loading={loading}
        onOpenNestedDetail={drawerState.openNestedDetail}
        rightRenderPatients={rightRenderPatients}
        scrollY={scrollY}
      />
      <NestedDetailDrawer
        open={drawerState.nestedDetailOpen}
        title={drawerState.nestedDetailTitle}
        node={drawerState.nestedDetailPayload?.node || null}
        schemaNode={drawerState.nestedDetailPayload?.schemaNode || null}
        rawValue={drawerState.nestedDetailPayload?.rawValue}
        useSchemaKernel={drawerState.useSchemaKernelDrawer}
        onClose={drawerState.closeNestedDetail}
      />
    </div>
  )
}

export default FieldGroupTabs
