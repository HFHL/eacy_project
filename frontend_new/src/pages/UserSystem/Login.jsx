import React from 'react'

import { EmailLoginForm } from './login/EmailLoginForm'
import { LoginFooter } from './login/LoginFooter'
import { LoginHeader } from './login/LoginHeader'
import { PromoPanel } from './login/PromoPanel'
import { RegisterForm } from './login/RegisterForm'
import { ResetPasswordForm } from './login/ResetPasswordForm'
import { WechatLoginPanel } from './login/WechatLoginPanel'
import { animationStyle } from './login/promoStyles'
import { styles } from './login/loginStyles'
import { useLoginFlow } from './login/useLoginFlow'

const Login = () => {
  const flow = useLoginFlow()

  return (
    <div style={styles.container}>
      <PromoPanel />

      <div style={styles.loginPanel}>
        <LoginHeader
          activeTab={flow.activeTab}
          isRegisterMode={flow.isRegisterMode}
          isResetMode={flow.isResetMode}
          setActiveTab={flow.setActiveTab}
          switchToLogin={flow.switchToLogin}
          switchToRegister={flow.switchToRegister}
        />

        {flow.isRegisterMode && (
          <RegisterForm
            countdown={flow.emailCodeCountdown}
            form={flow.registerForm}
            handleRegister={flow.handleRegister}
            onSendCode={flow.handleSendRegisterEmailCode}
            registerLoading={flow.registerLoading}
            sendingEmailCode={flow.sendingEmailCode}
            switchToLogin={flow.switchToLogin}
          />
        )}

        {flow.isResetMode && (
          <ResetPasswordForm
            countdown={flow.emailCodeCountdown}
            form={flow.resetForm}
            handleResetPassword={flow.handleResetPassword}
            onSendCode={flow.handleSendResetEmailCode}
            sendingEmailCode={flow.sendingEmailCode}
            switchToLogin={flow.switchToLogin}
          />
        )}

        {!flow.isRegisterMode && flow.activeTab === 'wechat' && (
          <WechatLoginPanel
            handleRefreshQR={flow.handleRefreshQR}
            qrExpired={flow.qrExpired}
            qrLoading={flow.qrLoading}
            qrUrl={flow.qrUrl}
          />
        )}

        {!flow.isRegisterMode && !flow.isResetMode && flow.activeTab === 'email' && (
          <EmailLoginForm
            handleEmailLogin={flow.handleEmailLogin}
            loginLoading={flow.loginLoading}
            switchToResetPassword={flow.switchToResetPassword}
          />
        )}

        <LoginFooter
          activeTab={flow.activeTab}
          isRegisterMode={flow.isRegisterMode}
          setActiveTab={flow.setActiveTab}
        />
      </div>

      <style>{animationStyle}</style>
    </div>
  )
}

export default Login
