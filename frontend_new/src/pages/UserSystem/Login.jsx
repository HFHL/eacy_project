import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import {
  Form,
  Input,
  Button,
  Checkbox,
  message,
  Spin
} from 'antd'
import {
  MailOutlined,
  LockOutlined,
  WechatOutlined,
  QuestionCircleOutlined,
  ArrowRightOutlined,
  ReloadOutlined,
  UserOutlined,
  PhoneOutlined,
  BankOutlined,
  IdcardOutlined
} from '@ant-design/icons'
import { loginSuccess, setUserSettings } from '../../store/slices/userSlice'
import {
  loginByEmail,
  register,
  getUserSettings,
  sendResetPasswordEmailCode,
  resetPasswordByEmail,
} from '../../api/auth'
import { appThemeToken } from '../../styles/themeTokens'

const Login = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [registerForm] = Form.useForm()
  const [resetForm] = Form.useForm()
  const [activeTab, setActiveTab] = useState('wechat') // 'wechat' | 'email'
  const [qrLoading, setQrLoading] = useState(true)
  const [qrExpired, setQrExpired] = useState(false)
  const [qrUrl, setQrUrl] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [isRegisterMode, setIsRegisterMode] = useState(false) // 注册模式开关
  const [isResetMode, setIsResetMode] = useState(false)       // 忘记密码模式开关
  const [registerLoading, setRegisterLoading] = useState(false)
  const [sendingEmailCode, setSendingEmailCode] = useState(false)
  const [emailCodeCountdown, setEmailCodeCountdown] = useState(0)

  // 模拟生成二维码
  useEffect(() => {
    if (activeTab === 'wechat') {
      generateQRCode()
    }
  }, [activeTab])

  // 注册/找回密码邮箱验证码倒计时
  useEffect(() => {
    if (!emailCodeCountdown) return
    const timer = setInterval(() => {
      setEmailCodeCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [emailCodeCountdown])

  const generateQRCode = () => {
    setQrLoading(true)
    setQrExpired(false)
    
    // 模拟二维码生成延迟
    // TODO: 后续接入真实的微信二维码接口
    setTimeout(() => {
      const qrData = `https://eacy.ai/login/wechat?state=${Date.now()}`
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`
      setQrUrl(qrApiUrl)
      setQrLoading(false)
      
      // 2分钟后二维码过期
      setTimeout(() => {
        setQrExpired(true)
      }, 120000)
    }, 1000)
  }

  const handleEmailLogin = async (values) => {
    setLoginLoading(true)
    
    try {
      const response = await loginByEmail({
        email: values.email,
        password: values.password
      })
      
      // 登录成功
      if (response.success && response.code === 0) {
        const { access_token, refresh_token, user } = response.data
        
        // 更新Redux状态
        dispatch(loginSuccess({
          access_token,
          refresh_token,
          user
        }))
        
        // 拉取用户设置并写入缓存
        try {
          const settingsRes = await getUserSettings()
          if (settingsRes?.success && settingsRes?.data?.settings != null) {
            dispatch(setUserSettings(settingsRes.data.settings))
          }
        } catch (_) {
          // 忽略，不影响登录
        }
        
        message.success('登录成功')
        navigate('/')
      }
    } catch (error) {
      // 错误已在request拦截器中处理
      console.error('登录失败:', error)
    } finally {
      setLoginLoading(false)
    }
  }

  const handleRefreshQR = () => {
    generateQRCode()
  }

  // 处理注册
  const handleRegister = async (values) => {
    setRegisterLoading(true)
    
    try {
      const response = await register({
        email: values.email,
        code: values.code,
        password: values.password,
        name: values.name,
        phone: values.phone || undefined,
        organization: values.organization || undefined,
        department: values.department || undefined,
        job_title: values.job_title || undefined,
      })
      
      if (response.success && response.code === 0) {
        message.success('注册成功！请使用邮箱和密码登录')
        // 清空注册表单和验证码倒计时
        registerForm.resetFields()
        setEmailCodeCountdown(0)
        setIsRegisterMode(false)
        setActiveTab('email')
      } else {
        message.error(response?.message || '注册失败，请稍后重试')
      }
    } catch (error) {
      console.error('注册失败:', error)
    } finally {
      setRegisterLoading(false)
    }
  }

  // 切换到注册模式
  const switchToRegister = () => {
    setIsRegisterMode(true)
    setIsResetMode(false)
  }

  // 切换到登录模式
  const switchToLogin = () => {
    setIsRegisterMode(false)
    setIsResetMode(false)
  }

  // 切换到忘记密码模式
  const switchToResetPassword = () => {
    setIsRegisterMode(false)
    setIsResetMode(true)
  }

  // 发送忘记密码邮箱验证码
  const handleSendResetEmailCode = async () => {
    try {
      const email = resetForm.getFieldValue('email')
      if (!email) {
        message.warning('请先填写邮箱地址')
        return
      }
      await resetForm.validateFields(['email'])

      if (emailCodeCountdown > 0 || sendingEmailCode) {
        return
      }

      setSendingEmailCode(true)
      const res = await sendResetPasswordEmailCode({ email })
      if (res?.success && res?.code === 0) {
        message.success('验证码已发送，请前往邮箱查收')
        setEmailCodeCountdown(60)
      } else {
        message.error(res?.message || '发送验证码失败，请稍后重试')
      }
    } catch (error) {
      if (error?.errorFields) {
        // 表单校验错误交给 antd 自己展示
      } else {
        console.error('发送重置密码邮箱验证码失败:', error)
      }
    } finally {
      setSendingEmailCode(false)
    }
  }

  // 处理忘记密码-重置密码
  const handleResetPassword = async (values) => {
    try {
      const res = await resetPasswordByEmail({
        email: values.email,
        code: values.code,
        new_password: values.new_password,
      })
      if (res?.success && res?.code === 0) {
        message.success('密码重置成功，请使用新密码登录')
        resetForm.resetFields()
        setEmailCodeCountdown(0)
        setIsResetMode(false)
        setActiveTab('email')
      } else {
        message.error(res?.message || '密码重置失败，请稍后重试')
      }
    } catch (error) {
      console.error('密码重置失败:', error)
    }
  }

  return (
    <div style={styles.container}>
      {/* 左侧宣传区域 */}
      <div style={styles.promoPanel}>
        {/* 背景装饰 */}
        <div style={styles.promoShapes}>
          <div style={{...styles.shape, ...styles.shape1}}></div>
          <div style={{...styles.shape, ...styles.shape2}}></div>
          <div style={{...styles.shape, ...styles.shape3}}></div>
          <div style={{...styles.shape, ...styles.shape4}}></div>
        </div>
        
        <div style={styles.promoContent}>
          <div style={styles.promoLogo}>
            <span style={styles.logoText}>易悉</span>
            <span style={styles.logoSubtext}>EACY</span>
          </div>
          <h1 style={styles.promoTitle}>智能医疗数据平台</h1>
          <div style={styles.promoSubtitle}>
            <div style={styles.promoFeature}>
              <span style={styles.featureDot}></span>
              AI驱动的科研数据管理
            </div>
            <div style={styles.promoFeature}>
              <span style={styles.featureDot}></span>
              智能文档识别与结构化
            </div>
            <div style={styles.promoFeature}>
              <span style={styles.featureDot}></span>
              标准化CRF设计与数据采集
            </div>
          </div>
          <button style={styles.promoButton} onClick={() => window.open('#', '_blank')}>
            了解更多
            <ArrowRightOutlined style={{ marginLeft: 8 }} />
          </button>
        </div>

        {/* 底部版权 */}
        <div style={styles.copyright}>
          © 2024 易悉EACY. All rights reserved.
        </div>
      </div>

      {/* 右侧登录面板 */}
      <div style={styles.loginPanel}>
        <div style={styles.loginHeader}>
          <div style={styles.registerLink}>
            {isRegisterMode || isResetMode ? (
              <a href="#" style={styles.link} onClick={(e) => { e.preventDefault(); switchToLogin(); }}>
                返回登录
              </a>
            ) : (
              <a href="#" style={styles.link} onClick={(e) => { e.preventDefault(); switchToRegister(); }}>
                注册账号
              </a>
            )}
          </div>
          
          {/* Tab切换 - 仅在登录模式显示 */}
          {!isRegisterMode && !isResetMode && (
            <div style={styles.loginTabs}>
              <div 
                style={{
                  ...styles.tab,
                  ...(activeTab === 'wechat' ? styles.tabActive : {})
                }}
                onClick={() => setActiveTab('wechat')}
              >
                <WechatOutlined style={{ marginRight: 6 }} />
                微信登录
              </div>
              <div 
                style={{
                  ...styles.tab,
                  ...(activeTab === 'email' ? styles.tabActive : {})
                }}
                onClick={() => setActiveTab('email')}
              >
                <MailOutlined style={{ marginRight: 6 }} />
                邮箱登录
              </div>
            </div>
          )}

          {/* 注册 / 忘记密码 模式标题 */}
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

        {/* 注册表单 */}
        {isRegisterMode && (
          <div style={styles.registerSection}>
            <Form
              name="register"
              form={registerForm}
              onFinish={handleRegister}
              autoComplete="off"
              size="large"
              layout="vertical"
            >
              <Form.Item
                name="name"
                rules={[
                  { required: true, message: '请输入您的姓名' },
                  { min: 2, message: '姓名至少2个字符' }
                ]}
              >
                <Input 
                  prefix={<UserOutlined style={{ color: appThemeToken.colorTextTertiary }} />} 
                  placeholder="请输入姓名" 
                  style={styles.input}
                />
              </Form.Item>

              <Form.Item
                name="email"
                rules={[
                  { required: true, message: '请输入邮箱地址' },
                  { type: 'email', message: '请输入有效的邮箱地址' }
                ]}
              >
                <Input 
                  prefix={<MailOutlined style={{ color: appThemeToken.colorTextTertiary }} />} 
                  placeholder="请输入邮箱地址" 
                  style={styles.input}
                />
              </Form.Item>

              <Form.Item
                name="code"
                rules={[
                  { required: true, message: '请输入验证码' },
                  { len: 4, message: '验证码为 4 位' },
                  {
                    pattern: /^0000$/,
                    message: '请输入固定验证码 0000',
                  },
                ]}
              >
                <Input
                  prefix={<LockOutlined style={{ color: appThemeToken.colorTextTertiary }} />}
                  placeholder="固定验证码：0000"
                  maxLength={4}
                  style={styles.input}
                  autoComplete="off"
                />
              </Form.Item>

              <Form.Item
                name="password"
                rules={[
                  { required: true, message: '请输入密码' },
                  { min: 6, message: '密码至少6位' }
                ]}
              >
                <Input.Password 
                  prefix={<LockOutlined style={{ color: appThemeToken.colorTextTertiary }} />} 
                  placeholder="请输入密码（至少6位）"
                  style={styles.input}
                />
              </Form.Item>

              <Form.Item
                name="confirmPassword"
                dependencies={['password']}
                rules={[
                  { required: true, message: '请确认密码' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) {
                        return Promise.resolve()
                      }
                      return Promise.reject(new Error('两次输入的密码不一致'))
                    },
                  }),
                ]}
              >
                <Input.Password 
                  prefix={<LockOutlined style={{ color: appThemeToken.colorTextTertiary }} />} 
                  placeholder="请再次输入密码"
                  style={styles.input}
                />
              </Form.Item>

              <Form.Item
                name="phone"
              >
                <Input 
                  prefix={<PhoneOutlined style={{ color: appThemeToken.colorTextTertiary }} />} 
                  placeholder="手机号（选填）" 
                  style={styles.input}
                />
              </Form.Item>

              <Form.Item
                name="organization"
              >
                <Input 
                  prefix={<BankOutlined style={{ color: appThemeToken.colorTextTertiary }} />} 
                  placeholder="所属机构（选填）" 
                  style={styles.input}
                />
              </Form.Item>

              <Form.Item>
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  block
                  loading={registerLoading}
                  style={styles.loginButton}
                >
                  注册
                </Button>
              </Form.Item>
            </Form>

            <div style={styles.registerTips}>
              已有账号？
              <a href="#" style={styles.link} onClick={(e) => { e.preventDefault(); switchToLogin(); }}>
                立即登录
              </a>
            </div>
          </div>
        )}

        {/* 忘记密码表单 */}
        {isResetMode && (
          <div style={styles.registerSection}>
            <Form
              name="resetPassword"
              form={resetForm}
              onFinish={handleResetPassword}
              autoComplete="off"
              size="large"
              layout="vertical"
            >
              <Form.Item
                name="email"
                rules={[
                  { required: true, message: '请输入账户邮箱地址' },
                  { type: 'email', message: '请输入有效的邮箱地址' },
                ]}
              >
                <Input
                  prefix={<MailOutlined style={{ color: appThemeToken.colorTextTertiary }} />}
                  placeholder="请输入账户邮箱地址"
                  style={styles.input}
                />
              </Form.Item>

              <Form.Item
                name="code"
                rules={[
                  { required: true, message: '请输入邮箱验证码' },
                  { len: 6, message: '验证码为6位数字' },
                  {
                    pattern: /^\d{6}$/,
                    message: '验证码格式不正确，应为6位数字',
                  },
                ]}
              >
                <div style={styles.emailWithCodeRow}>
                  <Input
                    prefix={<MailOutlined style={{ color: appThemeToken.colorTextTertiary }} />}
                    placeholder="请输入邮箱验证码"
                    maxLength={6}
                    style={styles.emailInput}
                  />
                  <Button
                    type="primary"
                    ghost
                    size="middle"
                    style={styles.sendCodeButton}
                    onClick={handleSendResetEmailCode}
                    loading={sendingEmailCode}
                    disabled={!!emailCodeCountdown || sendingEmailCode}
                  >
                    {emailCodeCountdown > 0 ? `${emailCodeCountdown}s 后重试` : '发送验证码'}
                  </Button>
                </div>
              </Form.Item>

              <Form.Item
                name="new_password"
                rules={[
                  { required: true, message: '请输入新密码' },
                  { min: 6, message: '密码至少6位' },
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined style={{ color: appThemeToken.colorTextTertiary }} />}
                  placeholder="请输入新密码（至少6位）"
                  style={styles.input}
                />
              </Form.Item>

              <Form.Item
                name="confirm_new_password"
                dependencies={['new_password']}
                rules={[
                  { required: true, message: '请确认新密码' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('new_password') === value) {
                        return Promise.resolve()
                      }
                      return Promise.reject(new Error('两次输入的新密码不一致'))
                    },
                  }),
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined style={{ color: appThemeToken.colorTextTertiary }} />}
                  placeholder="请再次输入新密码"
                  style={styles.input}
                />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  block
                  style={styles.loginButton}
                >
                  重置密码
                </Button>
              </Form.Item>
            </Form>

            <div style={styles.registerTips}>
              想起密码了？
              <a
                href="#"
                style={styles.link}
                onClick={(e) => {
                  e.preventDefault()
                  switchToLogin()
                }}
              >
                返回登录
              </a>
            </div>
          </div>
        )}

        {/* 微信扫码登录 */}
        {!isRegisterMode && activeTab === 'wechat' && (
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
                  <Button 
                    type="primary" 
                    icon={<ReloadOutlined />}
                    onClick={handleRefreshQR}
                    style={{ marginTop: 12 }}
                  >
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
            <div style={styles.qrSubTips}>
              扫描上方二维码，关注公众号完成登录
            </div>
          </div>
        )}

        {/* 邮箱密码登录 */}
        {!isRegisterMode && !isResetMode && activeTab === 'email' && (
          <div style={styles.emailSection}>
            <Form
              name="login"
              onFinish={handleEmailLogin}
              autoComplete="off"
              size="large"
              initialValues={{
                email: '',
                password: '',
                remember: true
              }}
            >
              <Form.Item
                name="email"
                rules={[
                  { required: true, message: '请输入邮箱地址' },
                  { type: 'email', message: '请输入有效的邮箱地址' }
                ]}
              >
                <Input 
                  prefix={<MailOutlined style={{ color: appThemeToken.colorTextTertiary }} />} 
                  placeholder="请输入邮箱地址" 
                  style={styles.input}
                />
              </Form.Item>

              <Form.Item
                name="password"
                rules={[{ required: true, message: '请输入密码' }]}
              >
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
                    onClick={(e) => {
                      e.preventDefault()
                      switchToResetPassword()
                    }}
                  >
                    忘记密码？
                  </a>
                </div>
              </Form.Item>

              <Form.Item>
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  block
                  loading={loginLoading}
                  style={styles.loginButton}
                >
                  登录
                </Button>
              </Form.Item>
            </Form>

            {/* <div style={styles.demoAccount}>
              <QuestionCircleOutlined style={{ marginRight: 6 }} />
              演示账号: lisi@eacy.com / 1593572468
            </div> */}
          </div>
        )}

        {/* 分割线 - 仅在登录模式显示 */}
        {!isRegisterMode && (
          <div style={styles.divider}>
            <span style={styles.dividerText}>其他方式</span>
          </div>
        )}

        {/* 其他登录方式切换 - 仅在登录模式显示 */}
        {!isRegisterMode && <div style={styles.otherMethods}>
          {activeTab === 'wechat' ? (
            <div 
              style={styles.otherMethodItem}
              onClick={() => setActiveTab('email')}
            >
              <div style={styles.otherMethodIcon}>
                <MailOutlined style={{ fontSize: 16, color: appThemeToken.colorPrimary }} />
              </div>
              <span>邮箱登录</span>
            </div>
          ) : (
            <div 
              style={styles.otherMethodItem}
              onClick={() => setActiveTab('wechat')}
            >
              <div style={{...styles.otherMethodIcon, background: 'rgba(82, 196, 26, 0.12)'}}>
                <WechatOutlined style={{ fontSize: 16, color: appThemeToken.colorSuccess }} />
              </div>
              <span>微信登录</span>
            </div>
          )}
        </div>}

        {/* 帮助链接 */}
        <div style={styles.helpLinks}>
          <a href="#" style={styles.helpLink}>忘记账号</a>
          <span style={styles.helpDivider}>|</span>
          <a href="#" style={styles.helpLink}>忘记密码</a>
          <span style={styles.helpDivider}>|</span>
          <a href="#" style={styles.helpLink}>登录帮助</a>
        </div>
      </div>

      {/* 添加动画样式 */}
      <style>{`
        @keyframes float1 {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-30px) rotate(5deg); }
        }
        @keyframes float2 {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(-5deg); }
        }
        @keyframes float3 {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-25px) scale(1.1); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    width: '100%',
    minHeight: '100vh',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    background: appThemeToken.colorBgLayout,
  },
  
  // 右侧登录面板
  loginPanel: {
    width: 440,
    background: 'white',
    padding: '50px 50px 30px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '-2px 0 20px rgba(0, 0, 0, 0.06)',
    position: 'relative',
    zIndex: 10,
  },
  
  loginHeader: {
    marginBottom: 30,
  },
  
  registerLink: {
    textAlign: 'right',
    marginBottom: 24,
  },
  
  link: {
    color: appThemeToken.colorPrimary,
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 500,
  },
  
  loginTabs: {
    display: 'flex',
    borderBottom: `1px solid ${appThemeToken.colorBorder}`,
  },
  
  tab: {
    flex: 1,
    padding: '14px 0',
    textAlign: 'center',
    fontSize: 16,
    color: appThemeToken.colorTextSecondary,
    cursor: 'pointer',
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    transition: 'all 0.3s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  tabActive: {
    color: appThemeToken.colorPrimary,
    borderBottomColor: appThemeToken.colorPrimary,
    fontWeight: 500,
  },
  
  // 微信扫码区域
  qrSection: {
    textAlign: 'center',
    padding: '20px 0 30px',
    flex: 1,
  },
  
  qrContainer: {
    width: 220,
    height: 220,
    margin: '0 auto 24px',
    background: 'rgba(0, 0, 0, 0.02)',
    border: `1px solid ${appThemeToken.colorBorder}`,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  
  qrLoading: {
    textAlign: 'center',
  },
  
  qrExpired: {
    textAlign: 'center',
    padding: 20,
  },
  
  qrExpiredText: {
    color: appThemeToken.colorTextSecondary,
    fontSize: 14,
  },
  
  qrImage: {
    width: '100%',
    height: '100%',
    padding: 15,
    objectFit: 'contain',
  },
  
  qrTips: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: appThemeToken.colorText,
    fontSize: 16,
    fontWeight: 500,
    marginBottom: 8,
  },
  
  qrSubTips: {
    color: appThemeToken.colorTextSecondary,
    fontSize: 14,
  },
  
  // 邮箱登录区域
  emailSection: {
    padding: '20px 0 10px',
    flex: 1,
  },

  // 注册区域
  registerSection: {
    padding: '10px 0 10px',
    flex: 1,
  },

  registerTitle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    fontWeight: 500,
    color: appThemeToken.colorText,
    padding: '14px 0',
    borderBottom: `2px solid ${appThemeToken.colorPrimary}`,
  },

  registerTips: {
    textAlign: 'center',
    fontSize: 14,
    color: appThemeToken.colorTextSecondary,
    marginTop: 16,
  },
  
  input: {
    height: 46,
    borderRadius: 8,
    fontSize: 14,
  },
  emailWithCodeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  emailInput: {
    height: 46,
    borderRadius: 8,
    fontSize: 14,
    flex: 1,
  },
  sendCodeButton: {
    borderRadius: 999,
    padding: '0 18px',
    fontSize: 14,
    fontWeight: 500,
  },
  
  formOptions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  
  forgotLink: {
    color: appThemeToken.colorPrimary,
    fontSize: 14,
    textDecoration: 'none',
  },
  
  loginButton: {
    height: 46,
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 500,
    background: `linear-gradient(135deg, ${appThemeToken.colorPrimary} 0%, rgba(24, 144, 255, 0.82) 100%)`,
    border: 'none',
  },
  
  demoAccount: {
    textAlign: 'center',
    color: appThemeToken.colorTextSecondary,
    fontSize: 12,
    padding: '12px 0',
    background: 'rgba(0, 0, 0, 0.02)',
    borderRadius: 6,
    marginTop: 10,
  },
  
  // 分割线
  divider: {
    height: 1,
    background: appThemeToken.colorBorder,
    margin: '20px 0',
    position: 'relative',
  },
  
  dividerText: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'white',
    padding: '0 16px',
    color: appThemeToken.colorTextSecondary,
    fontSize: 12,
  },
  
  // 其他登录方式
  otherMethods: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 24,
  },
  
  otherMethodItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    color: appThemeToken.colorTextSecondary,
    fontSize: 14,
    transition: 'color 0.3s',
    padding: '8px 16px',
  },
  
  otherMethodIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    background: 'rgba(24, 144, 255, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s',
  },
  
  // 帮助链接
  helpLinks: {
    textAlign: 'center',
    fontSize: 12,
    color: appThemeToken.colorTextSecondary,
    paddingTop: 20,
    borderTop: `1px solid ${appThemeToken.colorBorder}`,
    marginTop: 'auto',
  },
  
  helpLink: {
    color: appThemeToken.colorTextSecondary,
    textDecoration: 'none',
    transition: 'color 0.3s',
  },
  
  helpDivider: {
    margin: '0 12px',
    color: appThemeToken.colorTextTertiary,
  },
  
  // 左侧宣传区域
  promoPanel: {
    flex: 1,
    background: `linear-gradient(135deg, ${appThemeToken.colorPrimary} 0%, rgba(24, 144, 255, 0.82) 50%, rgba(24, 144, 255, 0.68) 100%)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  
  promoShapes: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  },
  
  shape: {
    position: 'absolute',
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.1)',
  },
  
  shape1: {
    width: 300,
    height: 300,
    top: '-5%',
    right: '-5%',
    animation: 'float1 8s ease-in-out infinite',
  },
  
  shape2: {
    width: 200,
    height: 200,
    bottom: '10%',
    left: '5%',
    animation: 'float2 10s ease-in-out infinite',
  },
  
  shape3: {
    width: 150,
    height: 150,
    top: '40%',
    right: '20%',
    animation: 'float3 7s ease-in-out infinite',
  },
  
  shape4: {
    width: 100,
    height: 100,
    bottom: '30%',
    right: '10%',
    animation: 'pulse 4s ease-in-out infinite',
  },
  
  promoContent: {
    textAlign: 'center',
    zIndex: 1,
    padding: 40,
    color: 'white',
  },
  
  promoLogo: {
    marginBottom: 30,
  },
  
  logoText: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: 8,
    textShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
  },
  
  logoSubtext: {
    fontSize: 24,
    fontWeight: 300,
    marginLeft: 12,
    opacity: 0.9,
    letterSpacing: 4,
  },
  
  promoTitle: {
    fontSize: 24,
    fontWeight: 500,
    marginBottom: 32,
    opacity: 0.95,
    letterSpacing: 2,
  },
  
  promoSubtitle: {
    marginBottom: 40,
  },
  
  promoFeature: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    opacity: 0.85,
    marginBottom: 12,
    letterSpacing: 1,
  },
  
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.8)',
    marginRight: 12,
  },
  
  promoButton: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '14px 36px',
    background: 'rgba(255, 255, 255, 0.15)',
    color: 'white',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.3s',
    backdropFilter: 'blur(10px)',
  },
  
  copyright: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
  },
}

export default Login
