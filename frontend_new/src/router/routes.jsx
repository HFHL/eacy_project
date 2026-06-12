import { Navigate } from 'react-router-dom'

import ErrorBoundary from '../components/Common/ErrorBoundary'
import MainLayout from '../components/Layout/MainLayout'
import {
  Admin,
  AIProcessing,
  CRFDesigner,
  Dashboard,
  DocumentUpload,
  ExtractionDebugger,
  ExtractionV2,
  FileList,
  Login,
  PatientDetail,
  PatientPool,
  ProjectDatasetView,
  ProjectPatientDetail,
  ProjectTemplateDesigner,
  ResearchProjectsEntry,
  SystemSettings,
  UserProfile,
} from './pageComponents'

const documentRoutes = [
  {
    path: 'upload',
    element: <DocumentUpload />,
    handle: {
      crumb: () => '文档上传',
      title: '智能文档处理中心 - 文档上传',
    },
  },
  {
    path: 'processing',
    element: <AIProcessing />,
    handle: {
      crumb: () => '归档及审核',
      title: '智能文档处理中心 - 归档及审核',
    },
  },
  {
    path: 'file-list',
    element: <FileList />,
    handle: {
      crumb: () => '文件列表',
      title: '智能文档处理中心 - 文件列表',
    },
  },
  {
    path: 'extraction-v2',
    element: <ExtractionV2 />,
    handle: {
      crumb: () => 'V2抽取测试',
      title: '智能文档处理中心 - V2抽取测试',
    },
  },
]

const patientRoutes = [
  {
    path: 'pool',
    element: <PatientPool />,
    handle: {
      crumb: () => '患者数据池',
      title: '患者数据池管理',
    },
  },
  {
    path: 'detail/:patientId',
    element: <PatientDetail />,
    handle: {
      crumb: () => '患者详情',
      title: '患者详情管理',
    },
  },
]

const researchRoutes = [
  {
    path: 'projects',
    element: <ResearchProjectsEntry />,
    handle: {
      crumb: () => '科研项目',
      title: '科研数据集管理',
    },
  },
  {
    path: 'projects/:projectId',
    element: <ProjectDatasetView />,
    handle: {
      crumb: () => '项目数据集',
      title: '科研数据集管理 - 项目数据集',
    },
  },
  {
    path: 'projects/:projectId/template/edit',
    element: <ProjectTemplateDesigner />,
    handle: {
      crumb: () => '编辑项目CRF模板',
      title: '科研数据集管理 - 编辑项目CRF模板',
    },
  },
  {
    path: 'projects/:projectId/patients/:patientId',
    element: <ProjectPatientDetail />,
    handle: {
      crumb: () => '项目患者详情',
      title: '科研数据集管理 - 项目患者详情',
    },
  },
  {
    path: 'templates/create',
    element: <CRFDesigner />,
    handle: {
      crumb: () => '创建CRF模版',
      title: '科研数据集管理 - 创建CRF模版',
    },
  },
  {
    path: 'templates/:templateId/edit',
    element: <CRFDesigner />,
    handle: {
      crumb: () => '编辑CRF模版',
      title: '科研数据集管理 - 编辑CRF模版',
    },
  },
  {
    path: 'templates/:templateId/view',
    element: <CRFDesigner />,
    handle: {
      crumb: () => '查看CRF模版',
      title: '科研数据集管理 - 查看CRF模版',
    },
  },
]

const userRoutes = [
  {
    path: 'profile',
    element: <UserProfile />,
    handle: {
      crumb: () => '个人中心',
      title: '个人中心',
    },
  },
  {
    path: 'settings',
    element: <SystemSettings />,
    handle: {
      crumb: () => '系统设置',
      title: '系统设置',
    },
  },
]

export const routes = [
  {
    path: '/login',
    element: <Login />,
    errorElement: <ErrorBoundary />,
  },
  {
    path: '/',
    element: <MainLayout />,
    errorElement: <ErrorBoundary />,
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <Dashboard />,
        handle: {
          crumb: () => '仪表板',
          title: '仪表板',
        },
      },
      {
        path: 'document',
        children: documentRoutes,
      },
      {
        path: 'debug',
        children: [
          {
            path: 'extraction',
            element: <ExtractionDebugger />,
            handle: {
              crumb: () => 'AI抽取调试器',
              title: '开发者工具 - AI抽取流程调试器',
            },
          },
        ],
      },
      {
        path: 'patient',
        children: patientRoutes,
      },
      {
        path: 'research',
        children: researchRoutes,
      },
      {
        path: 'admin',
        element: <Admin />,
        handle: {
          crumb: () => '管理后台',
          title: '管理后台',
        },
      },
      {
        path: 'user',
        children: userRoutes,
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
]
