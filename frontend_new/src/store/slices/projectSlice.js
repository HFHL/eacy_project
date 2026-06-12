import { createSlice } from '@reduxjs/toolkit'

import { initialState } from './projectSlice/initialState'
import { projectReducers } from './projectSlice/reducers'

const projectSlice = createSlice({
  name: 'project',
  initialState,
  reducers: projectReducers,
})

export const {
  setProjects,
  setProjectsLoading,
  updateProjectFilters,
  updateProjectPagination,
  addProject,
  updateProject,
  removeProject,
  setCurrentProject,
  setCurrentProjectLoading,
  setCurrentProjectPatients,
  setCurrentProjectCRF,
  setCurrentProjectDataSet,
  updateCurrentProjectStatistics,
  addPatientToProject,
  removePatientFromProject,
  batchAddPatientsToProject,
  setAvailablePatients,
  setPatientSelectionLoading,
  updatePatientSelectionFilters,
  setSelectedPatients,
  addSelectedPatient,
  removeSelectedPatient,
  clearSelectedPatients,
  setExtractionTasks,
  setCurrentExtractionTask,
  updateExtractionProgress,
  updateExtractionSettings,
  setExtractionLoading,
  addExtractionTask,
  updateExtractionTask,
  updateExportSettings,
  setExportLoading,
  addExportTask,
  updateExportTask,
  resetCurrentProject,
  resetPatientSelection,
} = projectSlice.actions

export default projectSlice.reducer
