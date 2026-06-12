import React from 'react'
import { Button, Form, Input } from 'antd'
import { LockOutlined, MailOutlined } from '@ant-design/icons'

import { appThemeToken } from '../../../styles/themeTokens'
import { AuthCodeInput } from './AuthCodeInput'
import { styles } from './loginStyles'

export const ResetPasswordForm = ({
  countdown,
  form,
  handleResetPassword,
  onSendCode,
  sendingEmailCode,
  switchToLogin,
}) => (
  <div style={styles.registerSection}>
    <Form name="resetPassword" form={form} onFinish={handleResetPassword} autoComplete="off" size="large" layout="vertical">
      <Form.Item name="email" rules={[{ required: true, message: '请输入账户邮箱地址' }, { type: 'email', message: '请输入有效的邮箱地址' }]}>
        <Input prefix={<MailOutlined style={{ color: appThemeToken.colorTextTertiary }} />} placeholder="请输入账户邮箱地址" style={styles.input} />
      </Form.Item>

      <Form.Item
        name="code"
        rules={[
          { required: true, message: '请输入邮箱验证码' },
          { len: 6, message: '验证码为6位数字' },
          { pattern: /^\d{6}$/, message: '验证码格式不正确，应为6位数字' },
        ]}
      >
        <AuthCodeInput countdown={countdown} icon="mail" loading={sendingEmailCode} onSend={onSendCode} />
      </Form.Item>

      <Form.Item name="new_password" rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '密码至少6位' }]}>
        <Input.Password prefix={<LockOutlined style={{ color: appThemeToken.colorTextTertiary }} />} placeholder="请输入新密码（至少6位）" style={styles.input} />
      </Form.Item>

      <Form.Item
        name="confirm_new_password"
        dependencies={['new_password']}
        rules={[
          { required: true, message: '请确认新密码' },
          ({ getFieldValue }) => ({
            validator(_, value) {
              if (!value || getFieldValue('new_password') === value) return Promise.resolve()
              return Promise.reject(new Error('两次输入的新密码不一致'))
            },
          }),
        ]}
      >
        <Input.Password prefix={<LockOutlined style={{ color: appThemeToken.colorTextTertiary }} />} placeholder="请再次输入新密码" style={styles.input} />
      </Form.Item>

      <Form.Item>
        <Button type="primary" htmlType="submit" block style={styles.loginButton}>
          重置密码
        </Button>
      </Form.Item>
    </Form>

    <div style={styles.registerTips}>
      想起密码了？
      <a href="#" style={styles.link} onClick={(event) => { event.preventDefault(); switchToLogin() }}>
        返回登录
      </a>
    </div>
  </div>
)
