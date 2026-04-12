import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  // 布局状态
  layout: {
    siderCollapsed: false,
    siderWidth: 256,
    headerHeight: 64,
    contentPadding: 24
  },
  
  // 导航状态
  navigation: {
    currentPath: '/',
    breadcrumbs: [],
    activeMenuKey: 'dashboard',
    openMenuKeys: []
  },
  
  // 主题设置
  theme: {
    mode: 'light', // light | dark
    primaryColor: '#6366f1',
    componentSize: 'middle', // 'small' | 'middle' | 'large'
    borderRadius: 6
  },
  
  // 全局加载状态
  loading: {
    global: false,
    page: false,
    components: {}
  },
  
  // 消息通知
  notifications: {
    list: [],
    unreadCount: 0
  },
  
  // 模态框状态
  modals: {
    visible: {},
    data: {}
  },
  
  // 抽屉状态
  drawers: {
    visible: {},
    data: {}
  },
  
  // 表格状态
  tables: {
    selections: {},
    filters: {},
    sorters: {},
    pagination: {}
  },
  
  // 搜索状态
  search: {
    global: {
      visible: false,
      keyword: '',
      results: [],
      loading: false
    }
  },
  
  // 页面状态
  pages: {
    documentUpload: {
      activeTab: 'upload',
      uploadProgress: 0
    },
    aiProcessing: {
      activeTab: 'review',
      selectedDocuments: []
    },
    crfDesigner: {
      activeTab: 'design',
      selectedGroup: null,
      selectedField: null
    },
    patientPool: {
      activeTab: 'list',
      selectedPatients: [],
      viewMode: 'table' // 'table' | 'card'
    },
    researchDataset: {
      activeTab: 'projects',
      selectedProject: null
    },
    patientDetail: {
      activeTab: 'overview',
      selectedDocument: null
    }
  }
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    // 布局操作
    toggleSider: (state) => {
      state.layout.siderCollapsed = !state.layout.siderCollapsed
    },
    
    setSiderCollapsed: (state, action) => {
      state.layout.siderCollapsed = action.payload
    },
    
    setSiderWidth: (state, action) => {
      state.layout.siderWidth = action.payload
    },
    
    updateLayout: (state, action) => {
      state.layout = { ...state.layout, ...action.payload }
    },
    
    // 导航操作
    setCurrentPath: (state, action) => {
      state.navigation.currentPath = action.payload
    },
    
    setBreadcrumbs: (state, action) => {
      state.navigation.breadcrumbs = action.payload
    },
    
    setActiveMenuKey: (state, action) => {
      state.navigation.activeMenuKey = action.payload
    },
    
    setOpenMenuKeys: (state, action) => {
      state.navigation.openMenuKeys = action.payload
    },
    
    updateNavigation: (state, action) => {
      state.navigation = { ...state.navigation, ...action.payload }
    },
    
    // 主题操作
    setThemeMode: (state, action) => {
      state.theme.mode = action.payload
    },
    
    setPrimaryColor: (state, action) => {
      state.theme.primaryColor = action.payload
    },
    
    setComponentSize: (state, action) => {
      state.theme.componentSize = action.payload
    },
    
    updateTheme: (state, action) => {
      state.theme = { ...state.theme, ...action.payload }
    },
    
    // 加载状态操作
    setGlobalLoading: (state, action) => {
      state.loading.global = action.payload
    },
    
    setPageLoading: (state, action) => {
      state.loading.page = action.payload
    },
    
    setComponentLoading: (state, action) => {
      const { component, loading } = action.payload
      state.loading.components[component] = loading
    },
    
    clearComponentLoading: (state, action) => {
      delete state.loading.components[action.payload]
    },
    
    // 通知操作
    addNotification: (state, action) => {
      const MAX_NOTIFICATIONS = 200
      const notification = {
        id: action.payload?.id || `notification_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        timestamp: action.payload?.timestamp || new Date().toISOString(),
        read: false,
        ...action.payload
      }
      state.notifications.list.unshift(notification)
      state.notifications.unreadCount += 1

      // 限制列表长度，避免无限增长
      while (state.notifications.list.length > MAX_NOTIFICATIONS) {
        const removed = state.notifications.list.pop()
        if (removed && removed.read === false) {
          state.notifications.unreadCount = Math.max(0, state.notifications.unreadCount - 1)
        }
      }
    },

    hydrateNotifications: (state, action) => {
      const { list = [] } = action.payload || {}
      state.notifications.list = Array.isArray(list) ? list : []
      state.notifications.unreadCount = state.notifications.list.filter(n => !n.read).length
    },
    
    markNotificationAsRead: (state, action) => {
      const notificationIndex = state.notifications.list.findIndex(n => n.id === action.payload)
      if (notificationIndex !== -1 && !state.notifications.list[notificationIndex].read) {
        state.notifications.list[notificationIndex].read = true
        state.notifications.unreadCount -= 1
      }
    },
    
    markAllNotificationsAsRead: (state) => {
      state.notifications.list.forEach(notification => {
        notification.read = true
      })
      state.notifications.unreadCount = 0
    },
    
    removeNotification: (state, action) => {
      const notificationIndex = state.notifications.list.findIndex(n => n.id === action.payload)
      if (notificationIndex !== -1) {
        const notification = state.notifications.list[notificationIndex]
        if (!notification.read) {
          state.notifications.unreadCount -= 1
        }
        state.notifications.list.splice(notificationIndex, 1)
      }
    },
    
    clearNotifications: (state) => {
      state.notifications.list = []
      state.notifications.unreadCount = 0
    },
    
    // 模态框操作
    showModal: (state, action) => {
      const { modalKey, data } = action.payload
      state.modals.visible[modalKey] = true
      if (data) {
        state.modals.data[modalKey] = data
      }
    },
    
    hideModal: (state, action) => {
      const modalKey = action.payload
      state.modals.visible[modalKey] = false
      delete state.modals.data[modalKey]
    },
    
    updateModalData: (state, action) => {
      const { modalKey, data } = action.payload
      state.modals.data[modalKey] = { ...state.modals.data[modalKey], ...data }
    },
    
    // 抽屉操作
    showDrawer: (state, action) => {
      const { drawerKey, data } = action.payload
      state.drawers.visible[drawerKey] = true
      if (data) {
        state.drawers.data[drawerKey] = data
      }
    },
    
    hideDrawer: (state, action) => {
      const drawerKey = action.payload
      state.drawers.visible[drawerKey] = false
      delete state.drawers.data[drawerKey]
    },
    
    updateDrawerData: (state, action) => {
      const { drawerKey, data } = action.payload
      state.drawers.data[drawerKey] = { ...state.drawers.data[drawerKey], ...data }
    },
    
    // 表格操作
    setTableSelection: (state, action) => {
      const { tableKey, selection } = action.payload
      state.tables.selections[tableKey] = selection
    },
    
    setTableFilters: (state, action) => {
      const { tableKey, filters } = action.payload
      state.tables.filters[tableKey] = filters
    },
    
    setTableSorter: (state, action) => {
      const { tableKey, sorter } = action.payload
      state.tables.sorters[tableKey] = sorter
    },
    
    setTablePagination: (state, action) => {
      const { tableKey, pagination } = action.payload
      state.tables.pagination[tableKey] = pagination
    },
    
    clearTableState: (state, action) => {
      const tableKey = action.payload
      delete state.tables.selections[tableKey]
      delete state.tables.filters[tableKey]
      delete state.tables.sorters[tableKey]
      delete state.tables.pagination[tableKey]
    },
    
    // 搜索操作
    setGlobalSearchVisible: (state, action) => {
      state.search.global.visible = action.payload
    },
    
    setGlobalSearchKeyword: (state, action) => {
      state.search.global.keyword = action.payload
    },
    
    setGlobalSearchResults: (state, action) => {
      state.search.global.results = action.payload
    },
    
    setGlobalSearchLoading: (state, action) => {
      state.search.global.loading = action.payload
    },
    
    clearGlobalSearch: (state) => {
      state.search.global.keyword = ''
      state.search.global.results = []
      state.search.global.loading = false
    },
    
    // 页面状态操作
    updatePageState: (state, action) => {
      const { page, updates } = action.payload
      if (state.pages[page]) {
        state.pages[page] = { ...state.pages[page], ...updates }
      }
    },
    
    setPageActiveTab: (state, action) => {
      const { page, tab } = action.payload
      if (state.pages[page]) {
        state.pages[page].activeTab = tab
      }
    },
    
    // 重置操作
    resetPageState: (state, action) => {
      const page = action.payload
      if (initialState.pages[page]) {
        state.pages[page] = { ...initialState.pages[page] }
      }
    },
    
    resetAllStates: (state) => {
      return { ...initialState, theme: state.theme, layout: state.layout }
    }
  }
})

export const {
  // 布局
  toggleSider,
  setSiderCollapsed,
  setSiderWidth,
  updateLayout,
  
  // 导航
  setCurrentPath,
  setBreadcrumbs,
  setActiveMenuKey,
  setOpenMenuKeys,
  updateNavigation,
  
  // 主题
  setThemeMode,
  setPrimaryColor,
  setComponentSize,
  updateTheme,
  
  // 加载状态
  setGlobalLoading,
  setPageLoading,
  setComponentLoading,
  clearComponentLoading,
  
  // 通知
  addNotification,
  hydrateNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  removeNotification,
  clearNotifications,
  
  // 模态框
  showModal,
  hideModal,
  updateModalData,
  
  // 抽屉
  showDrawer,
  hideDrawer,
  updateDrawerData,
  
  // 表格
  setTableSelection,
  setTableFilters,
  setTableSorter,
  setTablePagination,
  clearTableState,
  
  // 搜索
  setGlobalSearchVisible,
  setGlobalSearchKeyword,
  setGlobalSearchResults,
  setGlobalSearchLoading,
  clearGlobalSearch,
  
  // 页面状态
  updatePageState,
  setPageActiveTab,
  resetPageState,
  resetAllStates
} = uiSlice.actions

export default uiSlice.reducer