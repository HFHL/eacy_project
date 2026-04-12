import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import {
  Layout,
  Menu,
  Avatar,
  Dropdown,
  Button,
  Badge,
  Input,
  Breadcrumb,
  Space,
  Typography,
  Divider,
  Spin,
  Empty,
  Tag,
  theme
} from 'antd'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DashboardOutlined,
  FileTextOutlined,
  FormOutlined,
  TeamOutlined,
  ExperimentOutlined,
  UploadOutlined,
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  SearchOutlined,
  QuestionCircleOutlined,
  GithubOutlined,
  CloseOutlined,
  FileOutlined,
  FolderOutlined
} from '@ant-design/icons'
import { toggleSider, setActiveMenuKey, setBreadcrumbs } from '../../store/slices/uiSlice'
import { logout } from '../../store/slices/userSlice'
import { logout as logoutApi } from '../../api/auth'
import { routeConfig } from '../../router'
import NotificationBell from './NotificationBell'
import { getPatientList } from '../../api/patient'
import { getDocumentList } from '../../api/document'

const { Header, Sider, Content } = Layout
const { Search } = Input
const { Text } = Typography

// 图标映射
const iconMap = {
  DashboardOutlined,
  FileTextOutlined,
  FormOutlined,
  TeamOutlined,
  ExperimentOutlined,
  UploadOutlined,
  UserOutlined,
  SettingOutlined,
  LogoutOutlined
}

const MainLayout = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { token } = theme.useToken()
  
  const { siderCollapsed } = useSelector(state => state.ui.layout)
  const { activeMenuKey } = useSelector(state => state.ui.navigation)
  const { userInfo, isAuthenticated } = useSelector(state => state.user)
  
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState({ patients: [], documents: [], pages: [] })
  const searchTimerRef = useRef(null)
  const searchInputRef = useRef(null)

  // 页面导航快捷入口
  const pageEntries = [
    { label: '仪表板', path: '/dashboard', icon: <DashboardOutlined />, keywords: '仪表板 首页 dashboard home' },
    { label: '上传文档', path: '/document/upload', icon: <UploadOutlined />, keywords: '上传 导入 upload import' },
    { label: '患者数据池', path: '/patient/pool', icon: <TeamOutlined />, keywords: '患者 数据池 patient pool' },
    { label: '科研数据集', path: '/research/projects', icon: <ExperimentOutlined />, keywords: '科研 项目 数据集 research project' },
    { label: '个人资料', path: '/user/profile', icon: <UserOutlined />, keywords: '个人 资料 profile' },
    { label: '系统设置', path: '/user/settings', icon: <SettingOutlined />, keywords: '设置 系统 settings' },
  ]

  const handleSearchChange = useCallback((value) => {
    setSearchQuery(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!value.trim()) {
      setSearchResults({ patients: [], documents: [], pages: [] })
      setSearchLoading(false)
      return
    }
    // 立即搜索页面导航
    const q = value.trim().toLowerCase()
    const matchedPages = pageEntries.filter(p => p.label.toLowerCase().includes(q) || p.keywords.toLowerCase().includes(q))
    setSearchResults(prev => ({ ...prev, pages: matchedPages }))
    // 防抖搜索后端
    setSearchLoading(true)
    searchTimerRef.current = setTimeout(async () => {
      try {
        const [patientRes, docRes] = await Promise.all([
          getPatientList({ search: value.trim(), page: 1, page_size: 5 }).catch(() => null),
          getDocumentList({ search: value.trim(), page: 1, page_size: 5 }).catch(() => null),
        ])
        setSearchResults(prev => ({
          ...prev,
          patients: patientRes?.data?.items || patientRes?.data || [],
          documents: docRes?.data?.items || docRes?.data || [],
        }))
      } catch {
        // 搜索失败不阻断
      } finally {
        setSearchLoading(false)
      }
    }, 350)
  }, [])

  const handleSearchResultClick = useCallback((type, item) => {
    setSearchVisible(false)
    setSearchQuery('')
    setSearchResults({ patients: [], documents: [], pages: [] })
    if (type === 'page') {
      navigate(item.path)
    } else if (type === 'patient') {
      navigate(`/patient/detail/${item.id}`)
    } else if (type === 'document') {
      navigate('/document/upload')
    }
  }, [navigate])

  // 打开搜索时自动聚焦
  useEffect(() => {
    if (searchVisible) {
      setTimeout(() => searchInputRef.current?.focus(), 100)
    } else {
      setSearchQuery('')
      setSearchResults({ patients: [], documents: [], pages: [] })
    }
  }, [searchVisible])

  // 全局快捷键: Ctrl+K 或 Cmd+K 打开搜索
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchVisible(v => !v)
      }
      if (e.key === 'Escape' && searchVisible) {
        setSearchVisible(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchVisible])
  
  // 已关闭登录拦截，直接进入业务页面

  // 根据路径设置活动菜单和面包屑
  useEffect(() => {
    const path = location.pathname
    let menuKey = 'dashboard'
    let breadcrumbs = ['仪表板']

    // 简单的路由匹配逻辑
    if (path.startsWith('/document')) {
      if (path.includes('/upload')) {
        menuKey = 'document-upload'
        breadcrumbs = ['智能文档处理', '文档上传']
      } else if (path.includes('/processing')) {
        menuKey = 'document-upload'
        breadcrumbs = ['智能文档处理', '归档及审核']
      }
    } else if (path.startsWith('/crf')) {
      menuKey = 'crf'
      breadcrumbs = ['CRF设计器']
    } else if (path.startsWith('/patient')) {
      if (path.includes('/pool')) {
        menuKey = 'patient-pool'
        breadcrumbs = ['患者数据池']
      } else if (path.includes('/detail')) {
        menuKey = 'patient-pool'
        breadcrumbs = ['患者数据池', '患者详情']
      }
    } else if (path.startsWith('/research')) {
      menuKey = 'research'
      breadcrumbs = ['科研数据集管理']
    } else if (path.startsWith('/user')) {
      if (path.includes('/profile')) {
        breadcrumbs = ['用户中心', '个人资料']
      } else if (path.includes('/settings')) {
        breadcrumbs = ['用户中心', '系统设置']
      }
    }

    dispatch(setActiveMenuKey(menuKey))
    dispatch(setBreadcrumbs(breadcrumbs))
  }, [location.pathname, dispatch])

  // 菜单点击处理
  const handleMenuClick = ({ key }) => {
    const findPathRecursive = (items) => {
      for (const item of items) {
        if (item.key === key) return item.path
        if (item.children) {
          const childPath = findPathRecursive(item.children)
          if (childPath) return childPath
        }
      }
      return null
    }
    
    const path = findPathRecursive(routeConfig.mainMenu)
    if (path) navigate(path)
  }

  // 用户菜单点击处理
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
        window.location.href = '/patient/pool'
        break
      default:
        break
    }
  }

  // 渲染菜单项
  const renderMenuItems = (items) => {
    return items.map(item => {
      const Icon = iconMap[item.icon]
      
      if (item.children) {
        return {
          key: item.key,
          icon: Icon ? <Icon /> : null,
          label: item.label,
          children: renderMenuItems(item.children)
        }
      }
      
      return {
        key: item.key,
        icon: Icon ? <Icon /> : null,
        label: item.label
      }
    })
  }

  // 用户下拉菜单
  const userMenuItems = [
    {
      key: 'user-profile',
      icon: <UserOutlined />,
      label: '个人中心'
    },
    {
      key: 'user-settings',
      icon: <SettingOutlined />,
      label: '系统设置'
    },
    {
      type: 'divider'
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true
    }
  ]

  return (
    <Layout className="main-layout" style={{ minHeight: '100vh' }}>
      {/* Logo 区域：独立于 Sider 的固定条，避免被 Sider 内部 overflow 裁剪，展开时显示 "EACY Data" */}
      <div
        onClick={() => navigate('/')}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          zIndex: 101,
          height: 64,
          width: siderCollapsed ? 80 : 256,
          display: 'flex',
          alignItems: 'center',
          justifyContent: siderCollapsed ? 'center' : 'flex-start',
          gap: 10,
          background: '#fff',
          transition: 'width 0.2s',
          borderBottom: '1px solid #f0f0f0',
          padding: 0,
          paddingLeft: siderCollapsed ? 8 : 16,
          paddingRight: siderCollapsed ? 8 : 16,
          boxShadow: '2px 0 8px 0 rgba(29, 35, 41, 0.05)',
          borderRight: '1px solid #f0f0f0',
          cursor: 'pointer'
        }}
      >
        <img
          src="/logo/eacy_logo.png"
          alt="EACY"
          style={{
            height: 64,
            width: 'auto',
            flexShrink: 0,
            objectFit: 'contain',
            display: 'block'
          }}
        />
        {!siderCollapsed && (
          <span
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: 'rgba(0,0,0,0.85)',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            EACY Data
          </span>
        )}
      </div>

      {/* 侧边栏 - 浅色主题 */}
      <Sider
        trigger={null}
        collapsible
        collapsed={siderCollapsed}
        width={256}
        theme="light"
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          boxShadow: '2px 0 8px 0 rgba(29, 35, 41, 0.05)',
          borderRight: '1px solid #f0f0f0'
        }}
      >
        {/* 占位：为顶部固定 logo 条留出高度，避免菜单与 logo 重叠 */}
        <div style={{ height: 64, flexShrink: 0 }} />
        {/* 主菜单 - 浅色主题 */}
        <Menu
          mode="inline"
          theme="light"
          selectedKeys={[activeMenuKey]}
          items={renderMenuItems(routeConfig.mainMenu)}
          onClick={handleMenuClick}
          style={{ borderRight: 0 }}
        />
      </Sider>

      {/* 主内容区 */}
      <Layout style={{ marginLeft: siderCollapsed ? 80 : 256, transition: 'margin-left 0.2s' }}>
        {/* 顶部导航 */}
        <Header style={{
          padding: '0 24px',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,21,41,.08)',
          position: 'sticky',
          top: 0,
          zIndex: 99,
          height: 64
        }}>
          {/* 左侧: 折叠按钮 + 面包屑 */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Button
              type="text"
              icon={siderCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => dispatch(toggleSider())}
              style={{ fontSize: 16, width: 46, height: 46, marginRight: 16 }}
            />
            
            <Breadcrumb
              items={useSelector(state => state.ui.navigation.breadcrumbs).map((crumb, index) => ({
                title: crumb,
                key: index
              }))}
            />
          </div>

          {/* 右侧: 工具栏 */}
          <Space size={24}>
            <SearchOutlined 
              style={{ fontSize: 18, cursor: 'pointer', color: token.colorTextSecondary }} 
              onClick={() => setSearchVisible(!searchVisible)}
            />
            
            <NotificationBell />

            <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }} placement="bottomRight">
              <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <Avatar size="small" icon={<UserOutlined />} src="https://gw.alipayobjects.com/zos/rmsportal/BiazfanxmamNRoxxVxka.png" style={{ marginRight: 8 }} />
                <Text>{userInfo?.name || '管理员'}</Text>
              </div>
            </Dropdown>
          </Space>
        </Header>

        {/* 全站搜索面板 */}
        {searchVisible && (
          <>
            {/* 遮罩层 */}
            <div
              onClick={() => setSearchVisible(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 999 }}
            />
            {/* 搜索弹窗 */}
            <div style={{
              position: 'fixed', top: '12%', left: '50%', transform: 'translateX(-50%)',
              width: 560, maxHeight: '68vh', background: '#fff', borderRadius: 12,
              boxShadow: '0 16px 48px rgba(0,0,0,0.2)', zIndex: 1000,
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              animation: 'slideDown 0.15s ease-out'
            }}>
              {/* 搜索输入 */}
              <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 12 }}>
                <SearchOutlined style={{ fontSize: 18, color: '#bbb' }} />
                <Input
                  ref={searchInputRef}
                  placeholder="搜索患者、文档、页面…  (Esc 关闭)"
                  variant="borderless"
                  size="large"
                  value={searchQuery}
                  onChange={e => handleSearchChange(e.target.value)}
                  style={{ flex: 1, fontSize: 16 }}
                />
                {searchQuery && <CloseOutlined style={{ cursor: 'pointer', color: '#999' }} onClick={() => { setSearchQuery(''); handleSearchChange('') }} />}
                <Tag style={{ fontSize: 11, lineHeight: '20px' }}>ESC</Tag>
              </div>

              {/* 搜索结果 */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                {searchLoading && (
                  <div style={{ textAlign: 'center', padding: 24 }}><Spin size="small" /><span style={{ marginLeft: 8, color: '#999' }}>搜索中…</span></div>
                )}

                {!searchQuery.trim() && !searchLoading && (
                  <div style={{ padding: '12px 20px', color: '#999', fontSize: 13 }}>
                    <div style={{ marginBottom: 8, fontWeight: 500, color: '#666' }}>快速导航</div>
                    {pageEntries.map(p => (
                      <div
                        key={p.path}
                        onClick={() => handleSearchResultClick('page', p)}
                        style={{ padding: '8px 12px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, color: '#333' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span style={{ color: '#1890ff' }}>{p.icon}</span>
                        <span>{p.label}</span>
                      </div>
                    ))}
                    <Divider style={{ margin: '8px 0' }} />
                    <div style={{ fontSize: 12, color: '#bbb', textAlign: 'center' }}>
                      提示：<Tag style={{ fontSize: 11 }}>Ctrl+K</Tag> 随时打开搜索
                    </div>
                  </div>
                )}

                {searchQuery.trim() && !searchLoading && (
                  <>
                    {/* 页面导航 */}
                    {searchResults.pages.length > 0 && (
                      <div style={{ padding: '4px 20px' }}>
                        <div style={{ fontSize: 11, color: '#999', fontWeight: 500, marginBottom: 4 }}>页面</div>
                        {searchResults.pages.map(p => (
                          <div
                            key={p.path}
                            onClick={() => handleSearchResultClick('page', p)}
                            style={{ padding: '8px 12px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <span style={{ color: '#1890ff' }}>{p.icon}</span>
                            <span>{p.label}</span>
                            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#bbb' }}>{p.path}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 患者 */}
                    {searchResults.patients.length > 0 && (
                      <div style={{ padding: '4px 20px' }}>
                        <div style={{ fontSize: 11, color: '#999', fontWeight: 500, marginBottom: 4 }}>患者</div>
                        {searchResults.patients.slice(0, 5).map(p => (
                          <div
                            key={p.id}
                            onClick={() => handleSearchResultClick('patient', p)}
                            style={{ padding: '8px 12px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <TeamOutlined style={{ color: '#52c41a' }} />
                            <span style={{ fontWeight: 500 }}>{p.name || '未命名'}</span>
                            {p.patient_code && <Tag style={{ fontSize: 11 }}>{p.patient_code}</Tag>}
                            {p.gender && <span style={{ fontSize: 12, color: '#999' }}>{p.gender}</span>}
                            {p.age && <span style={{ fontSize: 12, color: '#999' }}>{p.age}岁</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 文档 */}
                    {searchResults.documents.length > 0 && (
                      <div style={{ padding: '4px 20px' }}>
                        <div style={{ fontSize: 11, color: '#999', fontWeight: 500, marginBottom: 4 }}>文档</div>
                        {searchResults.documents.slice(0, 5).map(d => (
                          <div
                            key={d.id}
                            onClick={() => handleSearchResultClick('document', d)}
                            style={{ padding: '8px 12px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <FileOutlined style={{ color: '#faad14' }} />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.file_name || d.original_filename || '未命名文档'}</span>
                            {d.doc_type && <Tag color="blue" style={{ fontSize: 11 }}>{d.doc_type}</Tag>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 无结果 */}
                    {!searchLoading && searchResults.pages.length === 0 && searchResults.patients.length === 0 && searchResults.documents.length === 0 && (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ color: '#999' }}>未找到 "{searchQuery}" 的相关结果</span>} style={{ padding: 32 }} />
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* 页面内容容器 */}
        <Content style={{
          margin: 24,
          minHeight: 280,
          background: 'transparent'
        }}>
          <Outlet />
        </Content>
        
        {/* 简单的底部 */}
        <div style={{ textAlign: 'center', padding: '0 0 24px 0', color: 'rgba(0,0,0,0.45)' }}>
          EACY Data Platform ©2024 Created by Xidong Tech
        </div>
      </Layout>
    </Layout>
  )
}

export default MainLayout
