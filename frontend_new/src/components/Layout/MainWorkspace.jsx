import React from 'react'
import { Outlet } from 'react-router-dom'
import {
  Button,
  Layout,
  Tooltip,
} from 'antd'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons'
import {
  CONTEXT_RAIL_COLLAPSED_WIDTH,
  CONTEXT_RAIL_WIDTH,
} from './layoutRailModel'

const { Content, Sider } = Layout

const MainWorkspace = ({
  onToggleSider,
  railContent,
  showContextRail,
  siderCollapsed,
  token,
}) => (
  <Layout style={{ height: 'calc(100vh - 64px)', minHeight: 0, overflow: 'hidden' }}>
    {showContextRail ? (
      <Sider
        trigger={null}
        collapsible
        collapsed={siderCollapsed}
        width={CONTEXT_RAIL_WIDTH}
        collapsedWidth={CONTEXT_RAIL_COLLAPSED_WIDTH}
        theme="light"
        style={{
          borderRight: `1px solid ${token.colorBorder}`,
          background: token.colorBgContainer,
          position: 'relative',
          height: '100%',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <div className="context-rail-shell">
          <div className="context-rail-content">
            {railContent}
          </div>
          <div className="context-rail-footer">
            <Tooltip title={siderCollapsed ? '展开侧栏' : '收起侧栏'} placement="top">
              <Button
                type="text"
                onClick={onToggleSider}
                title={siderCollapsed ? '展开侧栏' : '收起侧栏'}
                aria-label={siderCollapsed ? '展开侧栏' : '收起侧栏'}
                className="context-rail-footer-toggle"
                icon={siderCollapsed ? <MenuUnfoldOutlined style={{ fontSize: 14 }} /> : <MenuFoldOutlined style={{ fontSize: 14 }} />}
              />
            </Tooltip>
          </div>
        </div>
      </Sider>
    ) : null}

    <Layout style={{ minHeight: 0, height: '100%', overflow: 'hidden', position: 'relative' }}>
      <Content
        style={{
          margin: 10,
          minHeight: 0,
          background: 'transparent',
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingBottom: 28,
        }}
      >
        <Outlet />
      </Content>

      <div
        className="main-layout-footer-watermark"
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 6,
          transform: 'translateX(-50%)',
          color: 'rgba(0,0,0,0.45)',
          fontSize: 12,
          lineHeight: 1.4,
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: 2,
          whiteSpace: 'nowrap',
        }}
      >
        EACY Data Platform ©2024 Created by Xidong Tech
      </div>
    </Layout>
  </Layout>
)

export default MainWorkspace
