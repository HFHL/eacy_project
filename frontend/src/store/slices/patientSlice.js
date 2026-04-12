import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  // 患者数据池状态
  patientPool: {
    patients: [],
    total: 0,
    loading: false,
    filters: {
      search: '',
      gender: '',
      ageRange: '',
      department: '',
      diagnosis: '',
      projectStatus: '',
      completeness: '',
      dateRange: null
    },
    pagination: {
      current: 1,
      pageSize: 20,
      total: 0
    },
    selectedPatients: [],
    sortBy: 'updatedAt',
    sortOrder: 'desc'
  },
  
  // 当前患者详情
  currentPatient: {
    info: null,
    documents: [],
    extractedData: {},
    projects: [],
    loading: false
  },
  
  // 统计信息
  statistics: {
    totalPatients: 0,
    totalDocuments: 0,
    averageCompleteness: 0,
    recentlyAdded: 0,
    departmentDistribution: {},
    genderDistribution: {},
    ageDistribution: {},
    completenessDistribution: {}
  }
}

const patientSlice = createSlice({
  name: 'patient',
  initialState,
  reducers: {
    // 患者数据池操作
    setPatients: (state, action) => {
      state.patientPool.patients = action.payload.patients
      state.patientPool.total = action.payload.total
      state.patientPool.pagination.total = action.payload.total
    },
    
    setLoading: (state, action) => {
      state.patientPool.loading = action.payload
    },
    
    updateFilters: (state, action) => {
      state.patientPool.filters = { ...state.patientPool.filters, ...action.payload }
      state.patientPool.pagination.current = 1 // 重置到第一页
    },
    
    updatePagination: (state, action) => {
      state.patientPool.pagination = { ...state.patientPool.pagination, ...action.payload }
    },
    
    updateSort: (state, action) => {
      state.patientPool.sortBy = action.payload.sortBy
      state.patientPool.sortOrder = action.payload.sortOrder
    },
    
    selectPatients: (state, action) => {
      state.patientPool.selectedPatients = action.payload
    },
    
    addSelectedPatient: (state, action) => {
      if (!state.patientPool.selectedPatients.includes(action.payload)) {
        state.patientPool.selectedPatients.push(action.payload)
      }
    },
    
    removeSelectedPatient: (state, action) => {
      state.patientPool.selectedPatients = state.patientPool.selectedPatients.filter(
        id => id !== action.payload
      )
    },
    
    clearSelectedPatients: (state) => {
      state.patientPool.selectedPatients = []
    },
    
    // 当前患者操作
    setCurrentPatient: (state, action) => {
      state.currentPatient.info = action.payload
    },
    
    setCurrentPatientLoading: (state, action) => {
      state.currentPatient.loading = action.payload
    },
    
    setCurrentPatientDocuments: (state, action) => {
      state.currentPatient.documents = action.payload
    },
    
    setCurrentPatientData: (state, action) => {
      state.currentPatient.extractedData = action.payload
    },
    
    setCurrentPatientProjects: (state, action) => {
      state.currentPatient.projects = action.payload
    },
    
    updatePatientInfo: (state, action) => {
      if (state.currentPatient.info) {
        state.currentPatient.info = { ...state.currentPatient.info, ...action.payload }
      }
      
      // 同时更新患者池中的数据
      const patientIndex = state.patientPool.patients.findIndex(
        p => p.id === action.payload.id
      )
      if (patientIndex !== -1) {
        state.patientPool.patients[patientIndex] = {
          ...state.patientPool.patients[patientIndex],
          ...action.payload
        }
      }
    },
    
    // 统计信息
    setStatistics: (state, action) => {
      state.statistics = { ...state.statistics, ...action.payload }
    },
    
    // 批量操作
    batchUpdatePatients: (state, action) => {
      const { patientIds, updates } = action.payload
      state.patientPool.patients = state.patientPool.patients.map(patient => {
        if (patientIds.includes(patient.id)) {
          return { ...patient, ...updates }
        }
        return patient
      })
    },
    
    // 添加新患者
    addPatient: (state, action) => {
      state.patientPool.patients.unshift(action.payload)
      state.patientPool.total += 1
      state.patientPool.pagination.total += 1
      state.statistics.totalPatients += 1
    },
    
    // 删除患者
    removePatient: (state, action) => {
      state.patientPool.patients = state.patientPool.patients.filter(
        p => p.id !== action.payload
      )
      state.patientPool.total -= 1
      state.patientPool.pagination.total -= 1
      state.statistics.totalPatients -= 1
      
      // 从选中列表中移除
      state.patientPool.selectedPatients = state.patientPool.selectedPatients.filter(
        id => id !== action.payload
      )
    }
  }
})

export const {
  setPatients,
  setLoading,
  updateFilters,
  updatePagination,
  updateSort,
  selectPatients,
  addSelectedPatient,
  removeSelectedPatient,
  clearSelectedPatients,
  setCurrentPatient,
  setCurrentPatientLoading,
  setCurrentPatientDocuments,
  setCurrentPatientData,
  setCurrentPatientProjects,
  updatePatientInfo,
  setStatistics,
  batchUpdatePatients,
  addPatient,
  removePatient
} = patientSlice.actions

export default patientSlice.reducer