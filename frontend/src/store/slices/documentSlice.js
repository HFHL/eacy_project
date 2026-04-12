import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  // 文档上传状态
  upload: {
    files: [],
    uploading: false,
    progress: 0,
    completed: [],
    failed: [],
    settings: {
      csvMode: 'single', // 'single' | 'multiple'
      tags: []
    }
  },
  
  // AI处理状态
  processing: {
    tasks: [],
    currentTask: null,
    statistics: {
      total: 0,
      autoProcessed: 0,
      needsReview: 0,
      newPatients: 0,
      errors: 0
    },
    documents: [],
    loading: false
  },
  
  // 文档库
  library: {
    documents: [],
    total: 0,
    filters: {
      search: '',
      type: '',
      status: '',
      patient: '',
      dateRange: null
    },
    pagination: {
      current: 1,
      pageSize: 20,
      total: 0
    },
    loading: false
  }
}

const documentSlice = createSlice({
  name: 'document',
  initialState,
  reducers: {
    // 文档上传操作
    setUploadFiles: (state, action) => {
      state.upload.files = action.payload
    },
    
    addUploadFile: (state, action) => {
      state.upload.files.push(action.payload)
    },
    
    removeUploadFile: (state, action) => {
      state.upload.files = state.upload.files.filter(file => file.id !== action.payload)
    },
    
    updateUploadFile: (state, action) => {
      const { id, updates } = action.payload
      const fileIndex = state.upload.files.findIndex(file => file.id === id)
      if (fileIndex !== -1) {
        state.upload.files[fileIndex] = { ...state.upload.files[fileIndex], ...updates }
      }
    },
    
    setUploading: (state, action) => {
      state.upload.uploading = action.payload
    },
    
    setUploadProgress: (state, action) => {
      state.upload.progress = action.payload
    },
    
    addCompletedFile: (state, action) => {
      state.upload.completed.push(action.payload)
    },
    
    addFailedFile: (state, action) => {
      state.upload.failed.push(action.payload)
    },
    
    updateUploadSettings: (state, action) => {
      state.upload.settings = { ...state.upload.settings, ...action.payload }
    },
    
    resetUpload: (state) => {
      state.upload.files = []
      state.upload.uploading = false
      state.upload.progress = 0
      state.upload.completed = []
      state.upload.failed = []
    },
    
    // AI处理操作
    setProcessingTasks: (state, action) => {
      state.processing.tasks = action.payload
    },
    
    setCurrentTask: (state, action) => {
      state.processing.currentTask = action.payload
    },
    
    updateTaskStatus: (state, action) => {
      const { taskId, status, progress } = action.payload
      const taskIndex = state.processing.tasks.findIndex(task => task.id === taskId)
      if (taskIndex !== -1) {
        state.processing.tasks[taskIndex] = {
          ...state.processing.tasks[taskIndex],
          status,
          progress: progress || state.processing.tasks[taskIndex].progress
        }
      }
      
      if (state.processing.currentTask?.id === taskId) {
        state.processing.currentTask = {
          ...state.processing.currentTask,
          status,
          progress: progress || state.processing.currentTask.progress
        }
      }
    },
    
    setProcessingStatistics: (state, action) => {
      state.processing.statistics = { ...state.processing.statistics, ...action.payload }
    },
    
    setProcessingDocuments: (state, action) => {
      state.processing.documents = action.payload
    },
    
    updateProcessingDocument: (state, action) => {
      const { documentId, updates } = action.payload
      const docIndex = state.processing.documents.findIndex(doc => doc.id === documentId)
      if (docIndex !== -1) {
        state.processing.documents[docIndex] = {
          ...state.processing.documents[docIndex],
          ...updates
        }
      }
    },
    
    setProcessingLoading: (state, action) => {
      state.processing.loading = action.payload
    },
    
    // 文档库操作
    setLibraryDocuments: (state, action) => {
      state.library.documents = action.payload.documents
      state.library.total = action.payload.total
      state.library.pagination.total = action.payload.total
    },
    
    setLibraryLoading: (state, action) => {
      state.library.loading = action.payload
    },
    
    updateLibraryFilters: (state, action) => {
      state.library.filters = { ...state.library.filters, ...action.payload }
      state.library.pagination.current = 1
    },
    
    updateLibraryPagination: (state, action) => {
      state.library.pagination = { ...state.library.pagination, ...action.payload }
    },
    
    addLibraryDocument: (state, action) => {
      state.library.documents.unshift(action.payload)
      state.library.total += 1
      state.library.pagination.total += 1
    },
    
    removeLibraryDocument: (state, action) => {
      state.library.documents = state.library.documents.filter(doc => doc.id !== action.payload)
      state.library.total -= 1
      state.library.pagination.total -= 1
    },
    
    updateLibraryDocument: (state, action) => {
      const { id, updates } = action.payload
      const docIndex = state.library.documents.findIndex(doc => doc.id === id)
      if (docIndex !== -1) {
        state.library.documents[docIndex] = { ...state.library.documents[docIndex], ...updates }
      }
    }
  }
})

export const {
  // 上传相关
  setUploadFiles,
  addUploadFile,
  removeUploadFile,
  updateUploadFile,
  setUploading,
  setUploadProgress,
  addCompletedFile,
  addFailedFile,
  updateUploadSettings,
  resetUpload,
  
  // 处理相关
  setProcessingTasks,
  setCurrentTask,
  updateTaskStatus,
  setProcessingStatistics,
  setProcessingDocuments,
  updateProcessingDocument,
  setProcessingLoading,
  
  // 文档库相关
  setLibraryDocuments,
  setLibraryLoading,
  updateLibraryFilters,
  updateLibraryPagination,
  addLibraryDocument,
  removeLibraryDocument,
  updateLibraryDocument
} = documentSlice.actions

export default documentSlice.reducer