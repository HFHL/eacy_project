import { useCallback } from 'react'
import { buildGroupActionNodes } from './groupActions'
import {
  renderFileGroupRow,
  renderPatientGroupCard as renderPatientGroupCardContent,
} from './groupRows'

export const useFileListGroupRenderers = ({
  activeGroupKey,
  autoArchivingGroupIds,
  expandedGroups,
  groupDocsMap,
  handleAutoArchiveGroup,
  handleCreatePatientForGroup,
  hoveredGroupKey,
  loadArchivedPatientDocs,
  loadGroupDocs,
  navigate,
  openManualArchiveForGroup,
  setActiveGroupKey,
  setExpandedGroups,
  setHoveredGroupKey,
  token,
}) => {
  const toggleGroup = useCallback(
    (record) => {
      const key = record.key
      const isExpanded = expandedGroups.includes(key)
      if (isExpanded) {
        setExpandedGroups((prev) => prev.filter((itemKey) => itemKey !== key))
        return
      }

      setExpandedGroups((prev) => [...prev, key])
      if (record._groupType === 'todo' && record._groupId) {
        const cached = groupDocsMap[record._groupId]
        if (!cached || (!cached.loading && !Array.isArray(cached.items))) loadGroupDocs(record._groupId)
      }
      if (record._groupType === 'archived' && record._patientId) {
        const cached = groupDocsMap[`patient:${record._patientId}`]
        if (!cached || (!cached.loading && !Array.isArray(cached.items))) {
          loadArchivedPatientDocs(record._patientId)
        }
      }
    },
    [expandedGroups, groupDocsMap, loadArchivedPatientDocs, loadGroupDocs, setExpandedGroups]
  )

  const handleGroupMouseEnter = useCallback((record) => {
    setHoveredGroupKey(record.key)
    if (record._groupType === 'todo' && record._groupId) {
      const cached = groupDocsMap[record._groupId]
      if (!cached || (!cached.loading && !cached.matchInfo && !Array.isArray(cached.items))) {
        loadGroupDocs(record._groupId)
      }
    }
  }, [groupDocsMap, loadGroupDocs, setHoveredGroupKey])

  const getGroupActionNodes = useCallback((record, options = {}) => buildGroupActionNodes(record, options, {
    autoArchivingGroupIds,
    handleAutoArchiveGroup,
    handleCreatePatientForGroup,
    navigate,
    openManualArchiveForGroup,
    toggleGroup,
  }), [
    autoArchivingGroupIds,
    handleAutoArchiveGroup,
    handleCreatePatientForGroup,
    navigate,
    openManualArchiveForGroup,
    toggleGroup,
  ])

  const renderGroupRow = useCallback((record) => renderFileGroupRow(record, {
    autoArchivingGroupIds,
    expandedGroups,
    getGroupActionNodes,
    handleGroupMouseEnter,
    hoveredGroupKey,
    navigate,
    setHoveredGroupKey,
    token,
    toggleGroup,
  }), [
    autoArchivingGroupIds,
    expandedGroups,
    getGroupActionNodes,
    handleGroupMouseEnter,
    hoveredGroupKey,
    navigate,
    setHoveredGroupKey,
    token,
    toggleGroup,
  ])

  const renderPatientGroupCard = useCallback((record) => renderPatientGroupCardContent(record, {
    activeGroupKey,
    getGroupActionNodes,
    handleGroupMouseEnter,
    hoveredGroupKey,
    setActiveGroupKey,
    setHoveredGroupKey,
    token,
  }), [
    activeGroupKey,
    getGroupActionNodes,
    handleGroupMouseEnter,
    hoveredGroupKey,
    setActiveGroupKey,
    setHoveredGroupKey,
    token,
  ])

  return {
    renderGroupRow,
    renderPatientGroupCard,
    toggleGroup,
  }
}
