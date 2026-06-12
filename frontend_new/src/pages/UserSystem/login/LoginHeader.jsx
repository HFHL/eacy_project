import React from 'react'
import { LockOutlined, MailOutlined, UserOutlined, WechatOutlined } from '@ant-design/icons'

import { styles } from './loginStyles'

export const LoginHeader = ({
  activeTab,
  isRegisterMode,
  isResetMode,
  setActiveTab,
  switchToLogin,
  switchToRegister,
}) => (
  <div style={styles.loginHeader}>
    <div style={styles.registerLink}>
      {isRegisterMode || isResetMode ? (
        <a href="#" style={styles.link} onClick={(event) => { event.preventDefault(); switchToLogin() }}>
          返回登录
        </a>
      ) : (
        <a href="#" style={styles.link} onClick={(event) => { event.preventDefault(); switchToRegister() }}>
          注册账号
        </a>
      )}
    </div>

    {!isRegisterMode && !isResetMode && (
      <div style={styles.loginTabs}>
        <div
          style={{ ...styles.tab, ...(activeTab === 'wechat' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('wechat')}
        >
          <WechatOutlined style={{ marginRight: 6 }} />
          微信登录
        </div>
        <div
          style={{ ...styles.tab, ...(activeTab === 'email' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('email')}
        >
          <MailOutlined style={{ marginRight: 6 }} />
          邮箱登录
        </div>
      </div>
    )}

    {isRegisterMode && (
      <div style={styles.registerTitle}>
        <UserOutlined style={{ marginRight: 8, fontSize: 20 }} />
        创建新账号
      </div>
    )}
    {isResetMode && (
      <div style={styles.registerTitle}>
        <LockOutlined style={{ marginRight: 8, fontSize: 20 }} />
        找回密码
      </div>
    )}
  </div>
)
