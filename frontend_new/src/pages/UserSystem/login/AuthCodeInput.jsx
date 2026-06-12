import React from 'react'
import { Button, Input } from 'antd'
import { LockOutlined, MailOutlined } from '@ant-design/icons'

import { appThemeToken } from '../../../styles/themeTokens'
import { styles } from './loginStyles'

export const AuthCodeInput = ({
  countdown,
  icon = 'lock',
  loading,
  onSend,
  value,
  onChange,
  onBlur,
}) => {
  const Icon = icon === 'mail' ? MailOutlined : LockOutlined

  return (
    <div style={styles.emailWithCodeRow}>
      <Input
        prefix={<Icon style={{ color: appThemeToken.colorTextTertiary }} />}
        placeholder="请输入邮箱验证码"
        maxLength={6}
        style={styles.emailInput}
        autoComplete="off"
        value={value}
        onBlur={onBlur}
        onChange={onChange}
      />
      <Button
        type="primary"
        ghost
        size="middle"
        style={styles.sendCodeButton}
        onClick={onSend}
        loading={loading}
        disabled={!!countdown || loading}
      >
        {countdown > 0 ? `${countdown}s 后重试` : '发送验证码'}
      </Button>
    </div>
  )
}
