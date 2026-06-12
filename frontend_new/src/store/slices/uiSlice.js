import { createSlice } from '@reduxjs/toolkit'

import { initialState } from './uiSlice/initialState'
import { uiReducers } from './uiSlice/reducers'

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: uiReducers,
})

export const {
  toggleSider,
  setSiderCollapsed,
  setSiderWidth,
  updateLayout,
  setCurrentPath,
  setBreadcrumbs,
  setActiveMenuKey,
  setOpenMenuKeys,
  updateNavigation,
  setThemeMode,
  setPrimaryColor,
  setComponentSize,
  updateTheme,
  setGlobalLoading,
  setPageLoading,
  setComponentLoading,
  clearComponentLoading,
  addNotification,
  hydrateNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  removeNotification,
  clearNotifications,
  showModal,
  hideModal,
  updateModalData,
  showDrawer,
  hideDrawer,
  updateDrawerData,
  setTableSelection,
  setTableFilters,
  setTableSorter,
  setTablePagination,
  clearTableState,
  setGlobalSearchVisible,
  setGlobalSearchKeyword,
  setGlobalSearchResults,
  setGlobalSearchLoading,
  clearGlobalSearch,
  updatePageState,
  setPageActiveTab,
  resetPageState,
  resetAllStates,
} = uiSlice.actions

export default uiSlice.reducer
