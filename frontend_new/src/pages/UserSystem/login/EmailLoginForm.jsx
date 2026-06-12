import React from 'react'
import { Button, Checkbox, Form, Input } from 'antd'
import { LockOutlined, MailOutlined } from '@ant-design/icons'

import { appThemeToken } from '../../../styles/themeTokens'
import { styles } from './loginStyles'

export const EmailLoginForm = ({
  handleEmailLogin,
  loginLoading,
  switchToResetPassword,
}) => (
  <div style={styles.emailSection}>
    <Form
      name="login"
      onFinish={handleEmailLogin}
      autoComplete="off"
      size="large"
      initialValues={{
        email: '',
        password: '',
        remember: true,
      }}
    >
      <Form.Item
        name="email"
        rules={[
          { required: true, message: '请输入邮箱地址' },
          { type: 'email', message: '请输入有效的邮箱地址' },
        ]}
      >
        <Input
          prefix={<MailOutlined style={{ color: appThemeToken.colorTextTertiary }} />}
          placeholder="请输入邮箱地址"
          style={styles.input}
        />
      </Form.Item>

      <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
        <Input.Password
          prefix={<LockOutlined style={{ color: appThemeToken.colorTextTertiary }} />}
          placeholder="请输入密码"
          style={styles.input}
        />
      </Form.Item>

      <Form.Item>
        <div style={styles.formOptions}>
          <Form.Item name="remember" valuePropName="checked" noStyle>
            <Checkbox>记住登录</Checkbox>
          </Form.Item>
          <a
            href="#"
            style={styles.forgotLink}
            onClick={(event) => {
              event.preventDefault()
              switchToResetPassword()
            }}
          >
            忘记密码？
          </a>
        </div>
      </Form.Item>

      <Form.Item>
        <Button type="primary" htmlType="submit" block loading={loginLoading} style={styles.loginButton}>
          登录
        </Button>
      </Form.Item>
    </Form>
  </div>
)
