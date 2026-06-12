import React from 'react'
import { MailOutlined, WechatOutlined } from '@ant-design/icons'

import { appThemeToken } from '../../../styles/themeTokens'
import { auxiliaryStyles } from './promoStyles'
import { styles } from './loginStyles'

export const LoginFooter = ({
  activeTab,
  isRegisterMode,
  setActiveTab,
}) => (
  <>
    {!isRegisterMode && (
      <div style={styles.divider}>
        <span style={styles.dividerText}>其他方式</span>
      </div>
    )}

    {!isRegisterMode && (
      <div style={styles.otherMethods}>
        {activeTab === 'wechat' ? (
          <div style={styles.otherMethodItem} onClick={() => setActiveTab('email')}>
            <div style={styles.otherMethodIcon}>
              <MailOutlined style={{ fontSize: 16, color: appThemeToken.colorPrimary }} />
            </div>
            <span>邮箱登录</span>
          </div>
        ) : (
          <div style={styles.otherMethodItem} onClick={() => setActiveTab('wechat')}>
            <div style={{ ...styles.otherMethodIcon, background: 'rgba(82, 196, 26, 0.12)' }}>
              <WechatOutlined style={{ fontSize: 16, color: appThemeToken.colorSuccess }} />
            </div>
            <span>微信登录</span>
          </div>
        )}
      </div>
    )}

    <div style={auxiliaryStyles.helpLinks}>
      <a href="#" style={auxiliaryStyles.helpLink}>忘记账号</a>
      <span style={auxiliaryStyles.helpDivider}>|</span>
      <a href="#" style={auxiliaryStyles.helpLink}>忘记密码</a>
      <span style={auxiliaryStyles.helpDivider}>|</span>
      <a href="#" style={auxiliaryStyles.helpLink}>登录帮助</a>
    </div>
  </>
)
