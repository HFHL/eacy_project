import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useMatches, useNavigate, Navigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import {
  Layout,
  theme,
} from 'antd'
import {
  LogoutOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { toggleSider, setActiveMenuKey, setBreadcrumbs, setSiderCollapsed } from '../../store/slices/uiSlice'
import { logout } from '../../store/slices/userSlice'
import { logout as logoutApi } from '../../api/auth'
import GlobalSearchOverlay from './GlobalSearchOverlay'
import MainContextRail from './MainContextRail'
import MainHeader from './MainHeader'
import MainLayoutModals from './MainLayoutModals'
import MainWorkspace from './MainWorkspace'
import {
  PRIMARY_NAV_CONFIG,
  PRIMARY_NAV_ORDER,
  isResearchDesignerRoute,
  resolveActiveMenuKey,
  resolveFallbackBreadcrumbs,
  resolvePrimaryNavKey,
} from './layoutShellConfig'
import { RESEARCH_RETURN_FROM_TEMPLATE_KEY, buildTemplatePreviewModel } from './layoutRailModel'
import { useGlobalLayoutSearch } from './hooks/useGlobalLayoutSearch'
import { useDocumentRailCounts } from './hooks/useDocumentRailCounts'
import { usePatientRailController } from './hooks/usePatientRailController'
import { useResearchRailController } from './hooks/useResearchRailController'
import { useResearchPaneLayout } from './hooks/useResearchPaneLayout'
import { useMainCreateFlows } from './hooks/useMainCreateFlows'

const MainLayout = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const matches = useMatches()
  const dispatch = useDispatch()
  const { token } = theme.useToken()

  const { siderCollapsed } = useSelector((state) => state.ui.layout)
  const { userInfo, isAuthenticated } = useSelector((state) => state.user)
  const isAdminUser = userInfo?.role === 'admin' || (Array.isArray(userInfo?.permissions) && userInfo.permissions.includes('*'))

  const [hoveredRailCardKey, setHoveredRailCardKey] = useState('')
  const [activeToolbarPanel, setActiveToolbarPanel] = useState('')
  const activePatientId = useMemo(() => {
    const match = location.pathname.match(/^\/patient\/detail\/([^/]+)/)
    return match?.[1] || null
  }, [location.pathname])

  const activePrimaryNavKey = useMemo(() => resolvePrimaryNavKey(location.pathname), [location.pathname])
  const showContextRail = useMemo(() => {
    if (!['document', 'patient', 'research'].includes(activePrimaryNavKey)) return false
    if (activePrimaryNavKey === 'research' && isResearchDesignerRoute(location.pathname)) return false
    return true
  }, [activePrimaryNavKey, location.pathname])
  const patientController = usePatientRailController({
    activePatientId,
    activePrimaryNavKey,
    navigate,
    token,
  })

  const activeResearchProjectId = useMemo(() => {
    const match = location.pathname.match(/^\/research\/projects\/([^/]+)/)
    if (!match?.[1] || match[1] === 'projects') return null
    return match[1]
  }, [location.pathname])

  const {
    goFirstPatientDetail,
    goFirstProjectDetail,
    goFirstTemplateView,
    openCreatePatientFlow,
    openCreateProjectFlow,
    openCreateTemplateFlow,
    openTemplateCsvImportFlow,
    patientCreateVisible,
    projectCreateVisible,
    setPatientCreateVisible,
    setProjectCreateVisible,
    setTemplateCreateVisible,
    setTemplateCsvImportVisible,
    templateCreateForm,
    templateCreateVisible,
    templateCsvImportVisible,
  } = useMainCreateFlows({
    navigate,
    pathname: location.pathname,
    setActiveToolbarPanel,
  })

  const activeResearchTemplateId = useMemo(() => {
    const match = location.pathname.match(/^\/research\/templates\/([^/]+)/)
    return match?.[1] || null
  }, [location.pathname])
  const researchController = useResearchRailController({
    activePrimaryNavKey,
    activeResearchProjectId,
    activeResearchTemplateId,
    navigate,
    openCreateTemplateFlow,
  })
  const templatePreviewModel = useMemo(
    () => buildTemplatePreviewModel(researchController.templatePreviewModal.detail || {}),
    [researchController.templatePreviewModal.detail]
  )
  const paneLayout = useResearchPaneLayout({
    activePrimaryNavKey,
    pathname: location.pathname,
    siderCollapsed,
  })

  const documentTab = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const tab = params.get('tab')
    return ['all', 'parse', 'todo', 'archived'].includes(tab) ? tab : 'all'
  }, [location.search])

  const documentView = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const view = params.get('view')
    return ['patient', 'table'].includes(view) ? view : 'patient'
  }, [location.search])

  const documentCounts = useDocumentRailCounts({
    activePrimaryNavKey,
    pathname: location.pathname,
    search: location.search,
  })

  const {
    searchOverlayProps,
    toggleSearch,
  } = useGlobalLayoutSearch({ documentView, location, navigate })

  const handleUserMenuClick = ({ key }) => {
    switch (key) {
      case 'user-profile':
        navigate('/user/profile')
        break
      case 'user-settings':
        navigate('/user/settings')
        break
      case 'logout':
        logoutApi().catch(() => {})
        dispatch(logout())
        window.location.href = '/login'
        break
      default:
        break
    }
  }

  useEffect(() => {
    const matchedCrumbs = matches
      .filter((match) => match.handle?.crumb)
      .map((match) => (typeof match.handle.crumb === 'function' ? match.handle.crumb(match.params) : match.handle.crumb))
      .filter(Boolean)

    const nextBreadcrumbs = matchedCrumbs.length > 0
      ? matchedCrumbs
      : resolveFallbackBreadcrumbs(location.pathname)

    dispatch(setActiveMenuKey(resolveActiveMenuKey(location.pathname)))
    dispatch(setBreadcrumbs(nextBreadcrumbs))
  }, [dispatch, location.pathname, matches])

  /**
   * 从模板设计页返回科研页时，跳过一次“自动进入最新项目详情”。
   */
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!location.pathname.startsWith('/research/templates/')) return
    window.sessionStorage.setItem(RESEARCH_RETURN_FROM_TEMPLATE_KEY, '1')
  }, [location.pathname])

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (location.pathname.startsWith('/admin') && !isAdminUser) {
    return <Navigate to="/dashboard" replace />
  }

  const userMenuItems = [
    { key: 'user-profile', icon: <UserOutlined />, label: '个人中心' },
    { key: 'user-settings', icon: <SettingOutlined />, label: '系统设置' },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
  ]

  const primaryNavItems = PRIMARY_NAV_ORDER
    .filter((key) => key !== 'admin' || isAdminUser)
    .map((key) => ({
      key,
      label: PRIMARY_NAV_CONFIG[key].label,
    }))

  return (
    <Layout className="main-layout" style={{ minHeight: '100vh', background: token.colorBgLayout }}>
      <MainHeader
        activePrimaryNavKey={activePrimaryNavKey}
        goFirstPatientDetail={goFirstPatientDetail}
        goFirstProjectDetail={goFirstProjectDetail}
        navigate={navigate}
        onSearchToggle={toggleSearch}
        onUserMenuClick={handleUserMenuClick}
        primaryNavItems={primaryNavItems}
        token={token}
        userInfo={userInfo}
        userMenuItems={userMenuItems}
      />

      <MainWorkspace
        onToggleSider={() => dispatch(toggleSider())}
        railContent={(
          <MainContextRail
            activePatientId={activePatientId}
            activePrimaryNavKey={activePrimaryNavKey}
            activeProjectId={activeResearchProjectId}
            activeTemplateId={activeResearchTemplateId}
            activeToolbarPanel={activeToolbarPanel}
            documentCounts={documentCounts}
            documentTab={documentTab}
            documentView={documentView}
            goFirstPatientDetail={goFirstPatientDetail}
            goFirstProjectDetail={goFirstProjectDetail}
            goFirstTemplateView={goFirstTemplateView}
            hoveredRailCardKey={hoveredRailCardKey}
            location={location}
            navigate={navigate}
            onCreatePatient={openCreatePatientFlow}
            onCreateProject={openCreateProjectFlow}
            onCreateTemplate={openCreateTemplateFlow}
            onCsvImport={openTemplateCsvImportFlow}
            onSetSiderExpanded={() => dispatch(setSiderCollapsed(false))}
            onSetToolbarPanel={setActiveToolbarPanel}
            paneLayout={paneLayout}
            patientController={patientController}
            researchController={researchController}
            setHoveredRailCardKey={setHoveredRailCardKey}
            siderCollapsed={siderCollapsed}
            token={token}
          />
        )}
        showContextRail={showContextRail}
        siderCollapsed={siderCollapsed}
        token={token}
      />

      <GlobalSearchOverlay
        {...searchOverlayProps}
        token={token}
      />
      <MainLayoutModals
        cloneTemplateModal={researchController.cloneTemplateModal}
        location={location}
        navigate={navigate}
        patientCreateVisible={patientCreateVisible}
        projectCreateVisible={projectCreateVisible}
        refreshResearchTemplateRail={researchController.refreshResearchTemplateRail}
        setCloneTemplateModal={researchController.setCloneTemplateModal}
        setPatientCreateVisible={setPatientCreateVisible}
        setProjectCreateVisible={setProjectCreateVisible}
        setTemplateCreateVisible={setTemplateCreateVisible}
        setTemplateCsvImportVisible={setTemplateCsvImportVisible}
        setTemplatePreviewModal={researchController.setTemplatePreviewModal}
        templateCreateForm={templateCreateForm}
        templateCreateVisible={templateCreateVisible}
        templateCsvImportVisible={templateCsvImportVisible}
        templatePreviewModal={researchController.templatePreviewModal}
        templatePreviewModel={templatePreviewModel}
        token={token}
      />
    </Layout>
  )
}

export default MainLayout
