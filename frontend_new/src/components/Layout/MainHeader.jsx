import React from 'react'
import {
  Avatar,
  Dropdown,
  Layout,
  Menu,
  Space,
  Typography,
} from 'antd'
import {
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons'
import NotificationBell from './NotificationBell'
import { PRIMARY_NAV_CONFIG } from './layoutShellConfig'

const { Header } = Layout
const { Text } = Typography

const MainHeader = ({
  activePrimaryNavKey,
  goFirstPatientDetail,
  goFirstProjectDetail,
  navigate,
  onSearchToggle,
  onUserMenuClick,
  primaryNavItems,
  token,
  userInfo,
  userMenuItems,
}) => (
  <Header
    style={{
      padding: '0 16px',
      background: token.colorBgContainer,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      boxShadow: '0 1px 4px rgba(0,21,41,.08)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      height: 64,
    }}
  >
    <div onClick={() => navigate('/dashboard')} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minWidth: 180 }}>
      <img src="/logo/eacy_logo.png" alt="EACY" style={{ height: 36, width: 'auto', objectFit: 'contain', display: 'block' }} />
      <span style={{ fontSize: 16, fontWeight: 600, color: 'rgba(0,0,0,0.85)', whiteSpace: 'nowrap' }}>
        EACY Data
      </span>
    </div>

    <div style={{ flex: 1, minWidth: 280 }}>
      <Menu
        mode="horizontal"
        style={{ justifyContent: 'center' }}
        selectedKeys={[activePrimaryNavKey]}
        items={primaryNavItems}
        onClick={async ({ key }) => {
          if (key === 'patient') {
            await goFirstPatientDetail()
            return
          }
          if (key === 'research') {
            await goFirstProjectDetail()
            return
          }
          navigate(PRIMARY_NAV_CONFIG[key].path)
        }}
      />
    </div>

    <Space size={20}>
      <SearchOutlined
        style={{ fontSize: 16, cursor: 'pointer', color: token.colorTextSecondary }}
        onClick={onSearchToggle}
      />
      <NotificationBell />
      <Dropdown menu={{ items: userMenuItems, onClick: onUserMenuClick }} placement="bottomRight">
        <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          <Avatar size="small" icon={<UserOutlined />} src="https://gw.alipayobjects.com/zos/rmsportal/BiazfanxmamNRoxxVxka.png" style={{ marginRight: 8 }} />
          <Text>{userInfo?.name || '管理员'}</Text>
        </div>
      </Dropdown>
    </Space>
  </Header>
)

export default MainHeader
