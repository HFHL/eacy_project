import { useProjectOverviewColumns } from './useProjectOverviewColumns'
import { useProjectPenetrationColumns } from './useProjectPenetrationColumns'

export const useProjectDatasetColumns = ({
  confirmAndStartExtraction,
  getCompletenessColor,
  handleNavigatePatientDetail,
  handleViewFieldGroupDetail,
  handleViewFieldSource,
  isAllCurrentPageSelected,
  isSomeCurrentPageSelected,
  renderSourcePopover,
  selectedPatients,
  setSelectedPatients,
  templateFieldGroups,
  templateFieldMapping,
  templateSchemaJson,
  token,
  toggleSelectAllCurrentPage,
}) => {
  const overviewColumns = useProjectOverviewColumns({
    confirmAndStartExtraction,
    getCompletenessColor,
    handleNavigatePatientDetail,
    isAllCurrentPageSelected,
    isSomeCurrentPageSelected,
    renderSourcePopover,
    selectedPatients,
    setSelectedPatients,
    templateFieldGroups,
    token,
    toggleSelectAllCurrentPage,
  })

  const penetrationColumns = useProjectPenetrationColumns({
    confirmAndStartExtraction,
    getCompletenessColor,
    handleNavigatePatientDetail,
    handleViewFieldGroupDetail,
    isAllCurrentPageSelected,
    isSomeCurrentPageSelected,
    onViewFieldSource: handleViewFieldSource,
    renderSourcePopover,
    selectedPatients,
    setSelectedPatients,
    templateFieldGroups,
    templateFieldMapping,
    templateSchemaJson,
    token,
    toggleSelectAllCurrentPage,
  })

  return {
    overviewColumns,
    penetrationColumns,
  }
}
