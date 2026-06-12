import { initialState } from './initialState'

const MAX_NOTIFICATIONS = 200

export const uiReducers = {
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

  addNotification: (state, action) => {
    const notification = {
      id: action.payload?.id || `notification_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      timestamp: action.payload?.timestamp || new Date().toISOString(),
      read: false,
      ...action.payload,
    }
    state.notifications.list.unshift(notification)
    state.notifications.unreadCount += 1

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
    state.notifications.unreadCount = state.notifications.list.filter((item) => !item.read).length
  },
  markNotificationAsRead: (state, action) => {
    const notificationIndex = state.notifications.list.findIndex((item) => item.id === action.payload)
    if (notificationIndex !== -1 && !state.notifications.list[notificationIndex].read) {
      state.notifications.list[notificationIndex].read = true
      state.notifications.unreadCount -= 1
    }
  },
  markAllNotificationsAsRead: (state) => {
    state.notifications.list.forEach((notification) => {
      notification.read = true
    })
    state.notifications.unreadCount = 0
  },
  removeNotification: (state, action) => {
    const notificationIndex = state.notifications.list.findIndex((item) => item.id === action.payload)
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

  showModal: (state, action) => {
    const { modalKey, data } = action.payload
    state.modals.visible[modalKey] = true
    if (data) state.modals.data[modalKey] = data
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

  showDrawer: (state, action) => {
    const { drawerKey, data } = action.payload
    state.drawers.visible[drawerKey] = true
    if (data) state.drawers.data[drawerKey] = data
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
  resetPageState: (state, action) => {
    const page = action.payload
    if (initialState.pages[page]) {
      state.pages[page] = { ...initialState.pages[page] }
    }
  },
  resetAllStates: (state) => ({ ...initialState, theme: state.theme, layout: state.layout }),
}
