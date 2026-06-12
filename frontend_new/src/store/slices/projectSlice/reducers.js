import { initialState } from './initialState'

export const projectReducers = {
  setProjects: (state, action) => {
    state.projects.list = action.payload.projects
    state.projects.total = action.payload.total
    state.projects.pagination.total = action.payload.total
  },
  setProjectsLoading: (state, action) => {
    state.projects.loading = action.payload
  },
  updateProjectFilters: (state, action) => {
    state.projects.filters = { ...state.projects.filters, ...action.payload }
    state.projects.pagination.current = 1
  },
  updateProjectPagination: (state, action) => {
    state.projects.pagination = { ...state.projects.pagination, ...action.payload }
  },
  addProject: (state, action) => {
    state.projects.list.unshift(action.payload)
    state.projects.total += 1
    state.projects.pagination.total += 1
  },
  updateProject: (state, action) => {
    const { id, updates } = action.payload
    const projectIndex = state.projects.list.findIndex((project) => project.id === id)
    if (projectIndex !== -1) {
      state.projects.list[projectIndex] = { ...state.projects.list[projectIndex], ...updates }
    }
    if (state.currentProject.info?.id === id) {
      state.currentProject.info = { ...state.currentProject.info, ...updates }
    }
  },
  removeProject: (state, action) => {
    state.projects.list = state.projects.list.filter((project) => project.id !== action.payload)
    state.projects.total -= 1
    state.projects.pagination.total -= 1

    if (state.currentProject.info?.id === action.payload) {
      state.currentProject = { ...initialState.currentProject }
    }
  },

  setCurrentProject: (state, action) => {
    state.currentProject.info = action.payload
  },
  setCurrentProjectLoading: (state, action) => {
    state.currentProject.loading = action.payload
  },
  setCurrentProjectPatients: (state, action) => {
    state.currentProject.patients = action.payload
  },
  setCurrentProjectCRF: (state, action) => {
    state.currentProject.crfTemplate = action.payload
  },
  setCurrentProjectDataSet: (state, action) => {
    state.currentProject.dataSet = action.payload
  },
  updateCurrentProjectStatistics: (state, action) => {
    state.currentProject.statistics = { ...state.currentProject.statistics, ...action.payload }
  },
  addPatientToProject: (state, action) => {
    const patient = action.payload
    if (!state.currentProject.patients.find((item) => item.id === patient.id)) {
      state.currentProject.patients.push(patient)
      state.currentProject.statistics.totalPatients += 1
    }
  },
  removePatientFromProject: (state, action) => {
    const patientId = action.payload
    state.currentProject.patients = state.currentProject.patients.filter((patient) => patient.id !== patientId)
    state.currentProject.statistics.totalPatients -= 1

    if (state.currentProject.dataSet[patientId]) {
      delete state.currentProject.dataSet[patientId]
      state.currentProject.statistics.extractedPatients -= 1
    }
  },
  batchAddPatientsToProject: (state, action) => {
    const patients = action.payload
    const existingIds = new Set(state.currentProject.patients.map((patient) => patient.id))
    const newPatients = patients.filter((patient) => !existingIds.has(patient.id))
    state.currentProject.patients.push(...newPatients)
    state.currentProject.statistics.totalPatients += newPatients.length
  },

  setAvailablePatients: (state, action) => {
    state.patientSelection.availablePatients = action.payload.patients
    state.patientSelection.total = action.payload.total
  },
  setPatientSelectionLoading: (state, action) => {
    state.patientSelection.loading = action.payload
  },
  updatePatientSelectionFilters: (state, action) => {
    state.patientSelection.filters = { ...state.patientSelection.filters, ...action.payload }
  },
  setSelectedPatients: (state, action) => {
    state.patientSelection.selectedPatients = action.payload
  },
  addSelectedPatient: (state, action) => {
    if (!state.patientSelection.selectedPatients.includes(action.payload)) {
      state.patientSelection.selectedPatients.push(action.payload)
    }
  },
  removeSelectedPatient: (state, action) => {
    state.patientSelection.selectedPatients = state.patientSelection.selectedPatients.filter(
      (id) => id !== action.payload,
    )
  },
  clearSelectedPatients: (state) => {
    state.patientSelection.selectedPatients = []
  },

  setExtractionTasks: (state, action) => {
    state.extraction.tasks = action.payload
  },
  setCurrentExtractionTask: (state, action) => {
    state.extraction.currentTask = action.payload
  },
  updateExtractionProgress: (state, action) => {
    state.extraction.progress = { ...state.extraction.progress, ...action.payload }
  },
  updateExtractionSettings: (state, action) => {
    state.extraction.settings = { ...state.extraction.settings, ...action.payload }
  },
  setExtractionLoading: (state, action) => {
    state.extraction.loading = action.payload
  },
  addExtractionTask: (state, action) => {
    state.extraction.tasks.unshift(action.payload)
  },
  updateExtractionTask: (state, action) => {
    const { taskId, updates } = action.payload
    const taskIndex = state.extraction.tasks.findIndex((task) => task.id === taskId)
    if (taskIndex !== -1) {
      state.extraction.tasks[taskIndex] = { ...state.extraction.tasks[taskIndex], ...updates }
    }
    if (state.extraction.currentTask?.id === taskId) {
      state.extraction.currentTask = { ...state.extraction.currentTask, ...updates }
    }
  },

  updateExportSettings: (state, action) => {
    state.export.settings = { ...state.export.settings, ...action.payload }
  },
  setExportLoading: (state, action) => {
    state.export.loading = action.payload
  },
  addExportTask: (state, action) => {
    state.export.tasks.unshift(action.payload)
  },
  updateExportTask: (state, action) => {
    const { taskId, updates } = action.payload
    const taskIndex = state.export.tasks.findIndex((task) => task.id === taskId)
    if (taskIndex !== -1) {
      state.export.tasks[taskIndex] = { ...state.export.tasks[taskIndex], ...updates }
    }
  },

  resetCurrentProject: (state) => {
    state.currentProject = { ...initialState.currentProject }
    state.patientSelection = { ...initialState.patientSelection }
    state.extraction = { ...initialState.extraction }
  },
  resetPatientSelection: (state) => {
    state.patientSelection = { ...initialState.patientSelection }
  },
}
