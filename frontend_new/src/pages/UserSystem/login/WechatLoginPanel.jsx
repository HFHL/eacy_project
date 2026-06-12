import React from 'react'
import { Button, Spin } from 'antd'
import { ReloadOutlined, WechatOutlined } from '@ant-design/icons'

import { appThemeToken } from '../../../styles/themeTokens'
import { styles } from './loginStyles'

export const WechatLoginPanel = ({
  handleRefreshQR,
  qrExpired,
  qrLoading,
  qrUrl,
}) => (
  <div style={styles.qrSection}>
    <div style={styles.qrContainer}>
      {qrLoading ? (
        <div style={styles.qrLoading}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: appThemeToken.colorTextSecondary }}>正在生成二维码...</div>
        </div>
      ) : qrExpired ? (
        <div style={styles.qrExpired}>
          <div style={styles.qrExpiredText}>二维码已过期</div>
          <Button type="primary" icon={<ReloadOutlined />} onClick={handleRefreshQR} style={{ marginTop: 12 }}>
            刷新二维码
          </Button>
        </div>
      ) : (
        <img src={qrUrl} alt="微信登录二维码" style={styles.qrImage} />
      )}
    </div>
    <div style={styles.qrTips}>
      <WechatOutlined style={{ fontSize: 20, color: appThemeToken.colorSuccess, marginRight: 8 }} />
      使用微信扫一扫登录
    </div>
    <div style={styles.qrSubTips}>扫描上方二维码，关注公众号完成登录</div>
  </div>
)
