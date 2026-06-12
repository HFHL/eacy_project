import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { Form, message } from 'antd'

import {
  getUserSettings,
  loginByEmail,
  register,
  resetPasswordByEmail,
  sendRegisterEmailCode,
  sendResetPasswordEmailCode,
} from '../../../api/auth'
import { loginSuccess, setUserSettings } from '../../../store/slices/userSlice'

export const useLoginFlow = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [registerForm] = Form.useForm()
  const [resetForm] = Form.useForm()
  const [activeTab, setActiveTab] = useState('email')
  const [qrLoading, setQrLoading] = useState(true)
  const [qrExpired, setQrExpired] = useState(false)
  const [qrUrl, setQrUrl] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [isResetMode, setIsResetMode] = useState(false)
  const [registerLoading, setRegisterLoading] = useState(false)
  const [sendingEmailCode, setSendingEmailCode] = useState(false)
  const [emailCodeCountdown, setEmailCodeCountdown] = useState(0)

  const generateQRCode = () => {
    setQrLoading(true)
    setQrExpired(false)
    setTimeout(() => {
      const qrData = `https://eacy.ai/login/wechat?state=${Date.now()}`
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`
      setQrUrl(qrApiUrl)
      setQrLoading(false)
      setTimeout(() => {
        setQrExpired(true)
      }, 120000)
    }, 1000)
  }

  useEffect(() => {
    if (activeTab === 'wechat') {
      generateQRCode()
    }
  }, [activeTab])

  useEffect(() => {
    if (!emailCodeCountdown) return undefined
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

  const handleEmailLogin = async (values) => {
    setLoginLoading(true)
    try {
      const response = await loginByEmail({ email: values.email, password: values.password })
      if (response.success && response.code === 0) {
        const { access_token, refresh_token, user } = response.data
        dispatch(loginSuccess({ access_token, refresh_token, user }))
        try {
          const settingsRes = await getUserSettings()
          if (settingsRes?.success && settingsRes?.data?.settings != null) {
            dispatch(setUserSettings(settingsRes.data.settings))
          }
        } catch (_) {
          // ignore settings loading failure
        }
        message.success('登录成功')
        navigate('/')
      }
    } catch (error) {
      console.error('登录失败:', error)
    } finally {
      setLoginLoading(false)
    }
  }

  const handleSendRegisterEmailCode = async () => {
    try {
      const email = registerForm.getFieldValue('email')
      if (!email) {
        message.warning('请先填写邮箱地址')
        return
      }
      await registerForm.validateFields(['email'])
      if (emailCodeCountdown > 0 || sendingEmailCode) return

      setSendingEmailCode(true)
      const res = await sendRegisterEmailCode({ email })
      if (res?.success && res?.code === 0) {
        message.success('验证码已发送，请前往邮箱查收')
        setEmailCodeCountdown(60)
      } else {
        message.error(res?.message || '发送验证码失败，请稍后重试')
      }
    } catch (error) {
      if (!error?.errorFields) console.error('发送注册邮箱验证码失败:', error)
    } finally {
      setSendingEmailCode(false)
    }
  }

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

  const handleSendResetEmailCode = async () => {
    try {
      const email = resetForm.getFieldValue('email')
      if (!email) {
        message.warning('请先填写邮箱地址')
        return
      }
      await resetForm.validateFields(['email'])
      if (emailCodeCountdown > 0 || sendingEmailCode) return

      setSendingEmailCode(true)
      const res = await sendResetPasswordEmailCode({ email })
      if (res?.success && res?.code === 0) {
        message.success('验证码已发送，请前往邮箱查收')
        setEmailCodeCountdown(60)
      } else {
        message.error(res?.message || '发送验证码失败，请稍后重试')
      }
    } catch (error) {
      if (!error?.errorFields) console.error('发送重置密码邮箱验证码失败:', error)
    } finally {
      setSendingEmailCode(false)
    }
  }

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

  return {
    activeTab,
    emailCodeCountdown,
    handleEmailLogin,
    handleRefreshQR: generateQRCode,
    handleRegister,
    handleResetPassword,
    handleSendRegisterEmailCode,
    handleSendResetEmailCode,
    isRegisterMode,
    isResetMode,
    loginLoading,
    qrExpired,
    qrLoading,
    qrUrl,
    registerForm,
    registerLoading,
    resetForm,
    sendingEmailCode,
    setActiveTab,
    switchToLogin: () => { setIsRegisterMode(false); setIsResetMode(false) },
    switchToRegister: () => { setIsRegisterMode(true); setIsResetMode(false) },
    switchToResetPassword: () => { setIsRegisterMode(false); setIsResetMode(true) },
  }
}
