import { RESEARCH_HOME_PATH, RESEARCH_TEMPLATE_CREATE_PATH } from '../utils/researchPaths'

export const routeConfig = {
  mainMenu: [
    {
      key: 'dashboard',
      path: '/dashboard',
      icon: 'DashboardOutlined',
      label: '仪表板',
      description: '数据概览和快速入口',
    },
    {
      key: 'document-file-list',
      path: '/document/file-list',
      icon: 'FileTextOutlined',
      label: '文件列表',
      description: '查看所有已上传的文件',
    },
    {
      key: 'patient-pool',
      path: '/patient/pool',
      icon: 'TeamOutlined',
      label: '患者数据池',
      description: '全集患者档案管理',
    },
    {
      key: 'research',
      path: RESEARCH_HOME_PATH,
      icon: 'ExperimentOutlined',
      label: '科研数据集',
      description: '科研项目和数据集管理',
    },
    {
      key: 'admin',
      path: '/admin',
      icon: 'SettingOutlined',
      label: '管理后台',
      description: '系统数据总览与管理',
    },
  ],

  userMenu: [
    {
      key: 'user-profile',
      path: '/user/profile',
      icon: 'UserOutlined',
      label: '个人资料',
    },
    {
      key: 'user-settings',
      path: '/user/settings',
      icon: 'SettingOutlined',
      label: '系统设置',
    },
    {
      key: 'logout',
      icon: 'LogoutOutlined',
      label: '退出登录',
    },
  ],

  quickActions: [
    {
      key: 'upload-documents',
      path: '/document/upload',
      icon: 'UploadOutlined',
      label: '上传文档',
      description: '快速上传医疗文档',
    },
    {
      key: 'create-crf',
      path: RESEARCH_HOME_PATH,
      icon: 'FormOutlined',
      label: '管理CRF',
      description: 'CRF模版管理',
    },
    {
      key: 'create-project',
      path: RESEARCH_HOME_PATH,
      icon: 'ExperimentOutlined',
      label: '新建项目',
      description: '创建科研项目',
    },
    {
      key: 'view-patients',
      path: '/patient/pool',
      icon: 'TeamOutlined',
      label: '查看患者',
      description: '浏览患者数据池',
    },
  ],

  breadcrumbConfig: {
    '/dashboard': ['仪表板'],
    '/document/upload': ['智能文档处理', '文档上传中心'],
    '/document/processing': ['智能文档处理', '归档及审核'],
    '/document/file-list': ['文件列表'],
    '/patient/pool': ['患者数据池'],
    '/patient/detail': ['患者数据池', '患者详情'],
    [RESEARCH_HOME_PATH]: ['科研数据集管理'],
    [RESEARCH_TEMPLATE_CREATE_PATH]: ['科研数据集管理', 'CRF模版管理', '创建模版'],
    '/user/profile': ['用户中心', '个人中心'],
    '/user/credits': ['用户中心', '积分管理'],
    '/user/settings': ['用户中心', '系统设置'],
    '/user/notifications': ['用户中心', '消息通知'],
    '/admin': ['管理后台'],
  },
}

export const permissionConfig = {
  pagePermissions: {
    '/dashboard': ['*'],
    '/document/upload': ['document:upload'],
    '/document/processing': ['document:process'],
    '/patient/pool': ['patient:view'],
    '/patient/detail': ['patient:view'],
    [RESEARCH_HOME_PATH]: ['project:view'],
    '/research/projects/:projectId/template/edit': ['crf:design'],
    [RESEARCH_TEMPLATE_CREATE_PATH]: ['crf:design'],
    '/research/templates/edit': ['crf:design'],
    '/user/profile': ['*'],
    '/user/settings': ['system:settings'],
    '/admin': ['*'],
  },

  featurePermissions: {
    'document:upload': '文档上传权限',
    'document:process': '文档处理权限',
    'patient:view': '患者查看权限',
    'patient:edit': '患者编辑权限',
    'crf:design': 'CRF设计权限',
    'project:create': '项目创建权限',
    'project:manage': '项目管理权限',
    'data:export': '数据导出权限',
    'system:settings': '系统设置权限',
  },
}
