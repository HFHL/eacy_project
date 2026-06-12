import { appThemeToken } from '../../../styles/themeTokens'

export const initialState = {
  layout: {
    siderCollapsed: false,
    siderWidth: 256,
    headerHeight: 64,
    contentPadding: 24,
  },
  navigation: {
    currentPath: '/',
    breadcrumbs: [],
    activeMenuKey: 'dashboard',
    openMenuKeys: [],
  },
  theme: {
    mode: 'light',
    primaryColor: appThemeToken.colorPrimary,
    componentSize: 'middle',
    borderRadius: 6,
  },
  loading: {
    global: false,
    page: false,
    components: {},
  },
  notifications: {
    list: [],
    unreadCount: 0,
  },
  modals: {
    visible: {},
    data: {},
  },
  drawers: {
    visible: {},
    data: {},
  },
  tables: {
    selections: {},
    filters: {},
    sorters: {},
    pagination: {},
  },
  search: {
    global: {
      visible: false,
      keyword: '',
      results: [],
      loading: false,
    },
  },
  pages: {
    documentUpload: {
      activeTab: 'upload',
      uploadProgress: 0,
    },
    aiProcessing: {
      activeTab: 'review',
      selectedDocuments: [],
    },
    crfDesigner: {
      activeTab: 'design',
      selectedGroup: null,
      selectedField: null,
    },
    patientPool: {
      activeTab: 'list',
      selectedPatients: [],
      viewMode: 'table',
    },
    researchDataset: {
      activeTab: 'projects',
      selectedProject: null,
    },
    patientDetail: {
      activeTab: 'overview',
      selectedDocument: null,
    },
  },
}
