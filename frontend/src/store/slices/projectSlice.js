import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  // 项目列表
  projects: {
    list: [],
    total: 0,
    loading: false,
    filters: {
      search: '',
      status: '',
      createdBy: '',
      dateRange: null
    },
    pagination: {
      current: 1,
      pageSize: 10,
      total: 0
    }
  },
  
  // 当前项目
  currentProject: {
    info: null,
    patients: [],
    crfTemplate: null,
    extractionTasks: [],
    dataSet: {},
    statistics: {
      totalPatients: 0,
      extractedPatients: 0,
      completeness: 0,
      lastUpdated: null
    },
    loading: false
  },
  
  // 患者筛选
  patientSelection: {
    availablePatients: [],
    selectedPatients: [],
    filters: {
      search: '',
      gender: '',
      ageRange: '',
      department: '',
      diagnosis: '',
      completeness: '',
      excludeExisting: true
    },
    loading: false,
    total: 0
  },
  
  // 数据抽取
  extraction: {
    tasks: [],
    currentTask: null,
    progress: {
      total: 0,
      completed: 0,
      failed: 0,
      inProgress: 0
    },
    settings: {
      mode: 'smart', // 'fast' | 'accurate' | 'smart'
      batchSize: 10,
      retryFailed: true
    },
    loading: false
  },
  
  // 数据导出
  export: {
    formats: ['excel', 'csv', 'json'],
    settings: {
      format: 'excel',
      includeMetadata: true,
      maskSensitiveData: true,
      selectedFields: [],
      selectedPatients: []
    },
    tasks: [],
    loading: false
  }
}

const projectSlice = createSlice({
  name: 'project',
  initialState,
  reducers: {
    // 项目列表操作
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
      const projectIndex = state.projects.list.findIndex(p => p.id === id)
      if (projectIndex !== -1) {
        state.projects.list[projectIndex] = { ...state.projects.list[projectIndex], ...updates }
      }
      
      // 如果更新的是当前项目，同时更新当前项目信息
      if (state.currentProject.info?.id === id) {
        state.currentProject.info = { ...state.currentProject.info, ...updates }
      }
    },
    
    removeProject: (state, action) => {
      state.projects.list = state.projects.list.filter(p => p.id !== action.payload)
      state.projects.total -= 1
      state.projects.pagination.total -= 1
      
      // 如果删除的是当前项目，清除当前项目
      if (state.currentProject.info?.id === action.payload) {
        state.currentProject = { ...initialState.currentProject }
      }
    },
    
    // 当前项目操作
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
      if (!state.currentProject.patients.find(p => p.id === patient.id)) {
        state.currentProject.patients.push(patient)
        state.currentProject.statistics.totalPatients += 1
      }
    },
    
    removePatientFromProject: (state, action) => {
      const patientId = action.payload
      state.currentProject.patients = state.currentProject.patients.filter(p => p.id !== patientId)
      state.currentProject.statistics.totalPatients -= 1
      
      // 如果患者已经抽取过数据，需要更新统计
      if (state.currentProject.dataSet[patientId]) {
        delete state.currentProject.dataSet[patientId]
        state.currentProject.statistics.extractedPatients -= 1
      }
    },
    
    batchAddPatientsToProject: (state, action) => {
      const patients = action.payload
      const existingIds = new Set(state.currentProject.patients.map(p => p.id))
      const newPatients = patients.filter(p => !existingIds.has(p.id))
      
      state.currentProject.patients.push(...newPatients)
      state.currentProject.statistics.totalPatients += newPatients.length
    },
    
    // 患者筛选操作
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
        id => id !== action.payload
      )
    },
    
    clearSelectedPatients: (state) => {
      state.patientSelection.selectedPatients = []
    },
    
    // 数据抽取操作
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
      const taskIndex = state.extraction.tasks.findIndex(t => t.id === taskId)
      if (taskIndex !== -1) {
        state.extraction.tasks[taskIndex] = { ...state.extraction.tasks[taskIndex], ...updates }
      }
      
      if (state.extraction.currentTask?.id === taskId) {
        state.extraction.currentTask = { ...state.extraction.currentTask, ...updates }
      }
    },
    
    // 数据导出操作
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
      const taskIndex = state.export.tasks.findIndex(t => t.id === taskId)
      if (taskIndex !== -1) {
        state.export.tasks[taskIndex] = { ...state.export.tasks[taskIndex], ...updates }
      }
    },
    
    // 重置状态
    resetCurrentProject: (state) => {
      state.currentProject = { ...initialState.currentProject }
      state.patientSelection = { ...initialState.patientSelection }
      state.extraction = { ...initialState.extraction }
    },
    
    resetPatientSelection: (state) => {
      state.patientSelection = { ...initialState.patientSelection }
    }
  }
})

export const {
  // 项目列表
  setProjects,
  setProjectsLoading,
  updateProjectFilters,
  updateProjectPagination,
  addProject,
  updateProject,
  removeProject,
  
  // 当前项目
  setCurrentProject,
  setCurrentProjectLoading,
  setCurrentProjectPatients,
  setCurrentProjectCRF,
  setCurrentProjectDataSet,
  updateCurrentProjectStatistics,
  addPatientToProject,
  removePatientFromProject,
  batchAddPatientsToProject,
  
  // 患者筛选
  setAvailablePatients,
  setPatientSelectionLoading,
  updatePatientSelectionFilters,
  setSelectedPatients,
  addSelectedPatient,
  removeSelectedPatient,
  clearSelectedPatients,
  
  // 数据抽取
  setExtractionTasks,
  setCurrentExtractionTask,
  updateExtractionProgress,
  updateExtractionSettings,
  setExtractionLoading,
  addExtractionTask,
  updateExtractionTask,
  
  // 数据导出
  updateExportSettings,
  setExportLoading,
  addExportTask,
  updateExportTask,
  
  // 重置
  resetCurrentProject,
  resetPatientSelection
} = projectSlice.actions

export default projectSlice.reducer