import { createBrowserRouter, Navigate } from 'react-router-dom'
import MainLayout from '../components/Layout/MainLayout'
import ErrorBoundary from '../components/Common/ErrorBoundary'

// 页面组件懒加载
import { lazy } from 'react'

// 懒加载页面组件
const Dashboard = lazy(() => import('../pages/Dashboard'))
const DocumentUpload = lazy(() => import('../pages/DocumentUpload'))
const AIProcessing = lazy(() => import('../pages/AIProcessing'))
const BatchArchiveWorkspace = lazy(() => import('../pages/BatchArchiveWorkspace'))
const CRFDesigner = lazy(() => import('../pages/CRFDesigner'))
const PatientPool = lazy(() => import('../pages/PatientPool'))
const ResearchDataset = lazy(() => import('../pages/ResearchDataset'))
const ProjectDatasetView = lazy(() => import('../pages/ResearchDataset/ProjectDatasetView'))
const ProjectPatientDetail = lazy(() => import('../pages/ResearchDataset/ProjectPatientDetail'))
const ProjectTemplateDesigner = lazy(() => import('../pages/ResearchDataset/ProjectTemplateDesigner'))
const PatientDetail = lazy(() => import('../pages/PatientDetail'))
const UserProfile = lazy(() => import('../pages/UserSystem/UserProfile'))
const SystemSettings = lazy(() => import('../pages/UserSystem/SystemSettings'))

// 临时测试组件
const RightPanelTest = lazy(() => import('../pages/PatientDetail/tabs/EhrTab/test'))
const LayoutTest = lazy(() => import('../pages/PatientDetail/tabs/EhrTab/layoutTest'))
const LeftPanelTest = lazy(() => import('../pages/PatientDetail/tabs/EhrTab/leftPanelTest'))
const EhrTabIntegrationTest = lazy(() => import('../pages/PatientDetail/tabs/EhrTab/integrationTest'))
const MiddlePanelTest = lazy(() => import('../pages/PatientDetail/tabs/EhrTab/middlePanelTest'))
const ExtractionDashboard = lazy(() => import('../pages/ExtractionDashboard'))
const ExtractionHistory = lazy(() => import('../pages/ExtractionDashboard/HistoryPage'))
const OcrViewer = lazy(() => import('../pages/OcrViewer'))
const ExtractionV2 = lazy(() => import('../pages/ExtractionV2'))
const ExtractionDebugger = lazy(() => import('../pages/ExtractionDebugger'))

// 路由配置
const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    errorElement: <ErrorBoundary />,
    children: [
      {
        index: true,
        /* 默认进入患者病历夹列表（患者数据池） */
        element: <Navigate to="/patient/pool" replace />
      },
      {
        path: 'dashboard',
        element: <Dashboard />,
        handle: {
          crumb: () => '仪表板',
          title: '仪表板'
        }
      },
      {
        path: 'document',
        children: [
          {
            path: 'upload',
            element: <DocumentUpload />,
            handle: {
              crumb: () => '文档上传',
              title: '智能文档处理中心 - 文档上传'
            }
          },
          {
            path: 'archive',
            element: <BatchArchiveWorkspace />,
            handle: {
              crumb: () => '批量归档',
              title: '智能文档处理中心 - 批量归档'
            }
          },
          {
            path: 'processing',
            element: <AIProcessing />,
            handle: {
              crumb: () => '归档及审核',
              title: '智能文档处理中心 - 归档及审核'
            }
          },
          /* #隐藏 AI抽取工作流 & OCR坐标溯源 */
          // {
          //   path: 'extraction',
          //   element: <ExtractionDashboard />,
          //   handle: {
          //     crumb: () => 'AI抽取工作流',
          //     title: '智能文档处理中心 - AI抽取工作流'
          //   }
          // },
          // {
          //   path: 'extraction/history',
          //   element: <ExtractionHistory />,
          //   handle: {
          //     crumb: () => '历史记录',
          //     title: '智能文档处理中心 - 抽取历史记录'
          //   }
          // },
          // {
          //   path: 'ocr-viewer',
          //   element: <OcrViewer />,
          //   handle: {
          //     crumb: () => 'OCR坐标溯源',
          //     title: '智能文档处理中心 - OCR坐标溯源可视化'
          //   }
          // },
          // {
          //   path: 'ocr-viewer/:documentId',
          //   element: <OcrViewer />,
          //   handle: {
          //     crumb: () => 'OCR坐标溯源',
          //     title: '智能文档处理中心 - OCR坐标溯源可视化'
          //   }
          // },
          {
            path: 'extraction-v2',
            element: <ExtractionV2 />,
            handle: {
              crumb: () => 'V2抽取测试',
              title: '智能文档处理中心 - V2抽取测试'
            }
          }
        ]
      },
      {
        path: 'debug',
        children: [
          {
            path: 'extraction',
            element: <ExtractionDebugger />,
            handle: {
              crumb: () => 'AI抽取调试器',
              title: '开发者工具 - AI抽取流程调试器'
            }
          }
        ]
      },

      {
        path: 'patient',
        children: [
          {
            path: 'pool',
            element: <PatientPool />,
            handle: {
              crumb: () => '患者数据池',
              title: '患者数据池管理'
            }
          },
          {
            path: 'detail/:patientId',
            element: <PatientDetail />,
            handle: {
              crumb: () => '患者详情',
              title: '患者详情管理'
            }
          },
          {
            path: 'test/right-panel',
            element: <RightPanelTest />,
            handle: {
              crumb: () => 'RightPanel测试',
              title: 'RightPanel组件测试'
            }
          },
          {
            path: 'test/layout',
            element: <LayoutTest />,
            handle: {
              crumb: () => '布局Hook测试',
              title: '布局Hook功能测试'
            }
          },
          {
            path: 'test/left-panel',
            element: <LeftPanelTest />,
            handle: {
              crumb: () => 'LeftPanel测试',
              title: 'LeftPanel组件测试'
            }
          },
          {
            path: 'test/integration',
            element: <EhrTabIntegrationTest />,
            handle: {
              crumb: () => 'EhrTab集成测试',
              title: 'EhrTab组件集成测试'
            }
          },
          {
            path: 'test/middle-panel',
            element: <MiddlePanelTest />,
            handle: {
              crumb: () => 'MiddlePanel测试',
              title: 'MiddlePanel组件测试'
            }
          }
        ]
      },
      {
        path: 'research',
        children: [
          {
            path: 'projects',
            element: <ResearchDataset />,
            handle: {
              crumb: () => '科研项目',
              title: '科研数据集管理'
            }
          },
          {
            path: 'projects/:projectId',
            element: <ProjectDatasetView />,
            handle: {
              crumb: () => '项目数据集',
              title: '科研数据集管理 - 项目数据集'
            }
          },
          {
            path: 'projects/:projectId/template/edit',
            element: <ProjectTemplateDesigner />,
            handle: {
              crumb: () => '编辑项目CRF模板',
              title: '科研数据集管理 - 编辑项目CRF模板'
            }
          },
          {
            path: 'projects/:projectId/patients/:patientId',
            element: <ProjectPatientDetail />,
            handle: {
              crumb: () => '项目患者详情',
              title: '科研数据集管理 - 项目患者详情'
            }
          },
          {
            path: 'templates/create',
            element: <CRFDesigner />,
            handle: {
              crumb: () => '创建CRF模版',
              title: '科研数据集管理 - 创建CRF模版'
            }
          },
          {
            path: 'templates/:templateId/edit',
            element: <CRFDesigner />,
            handle: {
              crumb: () => '编辑CRF模版',
              title: '科研数据集管理 - 编辑CRF模版'
            }
          },
          {
            path: 'templates/:templateId/view',
            element: <CRFDesigner />,
            handle: {
              crumb: () => '查看CRF模版',
              title: '科研数据集管理 - 查看CRF模版'
            }
          }
        ]
      },
      {
        path: 'user',
        children: [
          {
            path: 'profile',
            element: <UserProfile />,
            handle: {
              crumb: () => '个人中心',
              title: '个人中心'
            }
          },
          {
            path: 'settings',
            element: <SystemSettings />,
            handle: {
              crumb: () => '系统设置',
              title: '系统设置'
            }
          },
 
        ]
      }
    ]
  },
  {
    path: '*',
    element: <Navigate to="/patient/pool" replace />
  }
])

// 路由元数据配置
export const routeConfig = {
  // 主导航菜单配置
  mainMenu: [
    {
      key: 'dashboard',
      path: '/dashboard',
      icon: 'DashboardOutlined',
      label: '仪表板',
      description: '数据概览和快速入口'
    },
    {
      key: 'document-upload',
      path: '/document/upload',
      icon: 'UploadOutlined',
      label: '文档上传',
      description: '上传并处理文档'
    },
    {
      key: 'document-archive',
      path: '/document/archive',
      icon: 'InboxOutlined',
      label: '批量归档',
      description: '批量处理归档数据'
    },
        {
      key: 'patient-pool',
      path: '/patient/pool',
      icon: 'TeamOutlined',
          label: '患者数据池',
          description: '全集患者档案管理'
    },
    {
      key: 'research',
      path: '/research/projects',
      icon: 'ExperimentOutlined',
      label: '科研数据集',
      description: '科研项目和数据集管理'
    }
    /* #隐藏 归档及审核 */
    // {
    //   key: 'document-processing',
    //   path: '/document/processing',
    //   label: '归档及审核',
    //   description: '智能处理结果审核和确认'
    // },
    /* #隐藏 开发者工具 */
    // {
    //   key: 'debug',
    //   icon: 'BugOutlined',
    //   label: '🔧 开发者工具',
    //   children: [
    //     {
    //       key: 'debug-extraction',
    //       path: '/debug/extraction',
    //       label: 'AI抽取调试器',
    //       description: '可视化抽取流程的每个步骤'
    //     }
    //   ]
    // }
  ],
  
  // 用户菜单配置
  userMenu: [
    {
      key: 'user-profile',
      path: '/user/profile',
      icon: 'UserOutlined',
      label: '个人资料'
    },
    {
      key: 'user-settings',
      path: '/user/settings',
      icon: 'SettingOutlined',
      label: '系统设置'
    },
    {
      key: 'logout',
      icon: 'LogoutOutlined',
      label: '退出登录'
    }
  ],
  
  // 快捷操作配置
  quickActions: [
    {
      key: 'upload-documents',
      path: '/document/upload',
      icon: 'UploadOutlined',
      label: '上传文档',
      description: '快速上传医疗文档'
    },
    {
      key: 'create-crf',
      path: '/research/projects',
      icon: 'FormOutlined',
      label: '管理CRF',
      description: 'CRF模版管理'
    },
    {
      key: 'create-project',
      path: '/research/projects',
      icon: 'ExperimentOutlined',
      label: '新建项目',
      description: '创建科研项目'
    },
    {
      key: 'view-patients',
      path: '/patient/pool',
      icon: 'TeamOutlined',
      label: '查看患者',
      description: '浏览患者数据池'
    }
  ],
  
  // 面包屑配置
  breadcrumbConfig: {
    '/dashboard': ['仪表板'],
    '/document/upload': ['智能文档处理', '文档上传中心'],
    '/document/archive': ['智能文档处理', '批量归档'],
    '/document/processing': ['智能文档处理', '归档及审核'],
    '/patient/pool': ['患者数据池'],
    '/patient/detail': ['患者数据池', '患者详情'],
    '/research/projects': ['科研数据集管理'],
    '/research/templates/create': ['科研数据集管理', 'CRF模版管理', '创建模版'],
    '/research/templates/edit': ['科研数据集管理', 'CRF模版管理', '编辑模版'],
    '/user/profile': ['用户中心', '个人中心'],
    '/user/credits': ['用户中心', '积分管理'],
    '/user/settings': ['用户中心', '系统设置'],
    '/user/notifications': ['用户中心', '消息通知']
  }
}

// 权限配置
export const permissionConfig = {
  // 页面访问权限
  pagePermissions: {
    '/dashboard': ['*'], // 所有用户都可访问
    '/document/upload': ['document:upload'],
    '/document/archive': ['document:process'],
    '/document/processing': ['document:process'],
    '/patient/pool': ['patient:view'],
    '/patient/detail': ['patient:view'],
    '/research/projects': ['project:view'],
    '/research/templates/create': ['crf:design'],
    '/research/templates/edit': ['crf:design'],
    '/user/profile': ['*'],
    '/user/settings': ['system:settings']
  },
  
  // 功能权限
  featurePermissions: {
    'document:upload': '文档上传权限',
    'document:process': '文档处理权限',
    'patient:view': '患者查看权限',
    'patient:edit': '患者编辑权限',
    'crf:design': 'CRF设计权限',
    'project:create': '项目创建权限',
    'project:manage': '项目管理权限',
    'data:export': '数据导出权限',
    'system:settings': '系统设置权限'
  }
}

export default router