import React from 'react'
import { Button, Form, Input } from 'antd'
import { BankOutlined, LockOutlined, MailOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons'

import { appThemeToken } from '../../../styles/themeTokens'
import { AuthCodeInput } from './AuthCodeInput'
import { styles } from './loginStyles'

export const RegisterForm = ({
  countdown,
  form,
  handleRegister,
  onSendCode,
  registerLoading,
  sendingEmailCode,
  switchToLogin,
}) => (
  <div style={styles.registerSection}>
    <Form name="register" form={form} onFinish={handleRegister} autoComplete="off" size="large" layout="vertical">
      <Form.Item name="name" rules={[{ required: true, message: '请输入您的姓名' }, { min: 2, message: '姓名至少2个字符' }]}>
        <Input prefix={<UserOutlined style={{ color: appThemeToken.colorTextTertiary }} />} placeholder="请输入姓名" style={styles.input} />
      </Form.Item>

      <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱地址' }, { type: 'email', message: '请输入有效的邮箱地址' }]}>
        <Input prefix={<MailOutlined style={{ color: appThemeToken.colorTextTertiary }} />} placeholder="请输入邮箱地址" style={styles.input} />
      </Form.Item>

      <Form.Item
        name="code"
        rules={[
          { required: true, message: '请输入邮箱验证码' },
          { len: 6, message: '验证码为 6 位数字' },
          { pattern: /^\d{6}$/, message: '验证码格式不正确，应为 6 位数字' },
        ]}
      >
        <AuthCodeInput countdown={countdown} loading={sendingEmailCode} onSend={onSendCode} />
      </Form.Item>

      <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少6位' }]}>
        <Input.Password prefix={<LockOutlined style={{ color: appThemeToken.colorTextTertiary }} />} placeholder="请输入密码（至少6位）" style={styles.input} />
      </Form.Item>

      <Form.Item
        name="confirmPassword"
        dependencies={['password']}
        rules={[
          { required: true, message: '请确认密码' },
          ({ getFieldValue }) => ({
            validator(_, value) {
              if (!value || getFieldValue('password') === value) return Promise.resolve()
              return Promise.reject(new Error('两次输入的密码不一致'))
            },
          }),
        ]}
      >
        <Input.Password prefix={<LockOutlined style={{ color: appThemeToken.colorTextTertiary }} />} placeholder="请再次输入密码" style={styles.input} />
      </Form.Item>

      <Form.Item name="phone">
        <Input prefix={<PhoneOutlined style={{ color: appThemeToken.colorTextTertiary }} />} placeholder="手机号（选填）" style={styles.input} />
      </Form.Item>
      <Form.Item name="organization">
        <Input prefix={<BankOutlined style={{ color: appThemeToken.colorTextTertiary }} />} placeholder="所属机构（选填）" style={styles.input} />
      </Form.Item>

      <Form.Item>
        <Button type="primary" htmlType="submit" block loading={registerLoading} style={styles.loginButton}>
          注册
        </Button>
      </Form.Item>
    </Form>

    <div style={styles.registerTips}>
      已有账号？
      <a href="#" style={styles.link} onClick={(event) => { event.preventDefault(); switchToLogin() }}>
        立即登录
      </a>
    </div>
  </div>
)
