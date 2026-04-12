import React, { Suspense, useEffect, useRef } from 'react'
import { RouterProvider } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { Spin } from 'antd'
import router from './router'
import { updateLastActivity } from './store/slices/userSlice'
import { softLogin } from './api/auth'
import './styles/global.css'

// 全局加载组件
const GlobalLoading = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    flexDirection: 'column',
    gap: 16
  }}>
    <Spin size="large" />
    <div style={{ color: 'rgba(0, 0, 0, 0.65)' }}>
      曦栋智能CRF数据平台加载中...
    </div>
  </div>
)

// 页面加载组件
const PageLoading = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '400px',
    flexDirection: 'column',
    gap: 16
  }}>
    <Spin size="large" />
    <div style={{ color: 'rgba(0, 0, 0, 0.65)' }}>
      页面加载中...
    </div>
  </div>
)

function App() {
  const dispatch = useDispatch()
  const { isAuthenticated } = useSelector(state => state.user)
  const { global: globalLoading } = useSelector(state => state.ui.loading)
  const softLoginExecuted = useRef(false)

  // 用户软登录 - 应用启动时调用（用户设置仅在硬登录后拉取并缓存在 localStorage）
  useEffect(() => {
    const executeSoftLogin = async () => {
      // 只在用户已认证且未执行过软登录时执行
      if (isAuthenticated && !softLoginExecuted.current) {
        try {
          const response = await softLogin()
          if (response?.success) {
            console.log('软登录成功:', response.data)
          }
        } catch (error) {
          console.error('软登录失败:', error)
        } finally {
          softLoginExecuted.current = true
        }
      }
    }

    executeSoftLogin()
  }, [isAuthenticated])

  // 用户活动监听
  useEffect(() => {
    const handleUserActivity = () => {
      if (isAuthenticated) {
        dispatch(updateLastActivity())
      }
    }

    // 监听用户活动事件
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']
    events.forEach(event => {
      document.addEventListener(event, handleUserActivity, true)
    })

    // 定期更新活动时间
    const activityInterval = setInterval(handleUserActivity, 60000) // 每分钟更新一次

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleUserActivity, true)
      })
      clearInterval(activityInterval)
    }
  }, [dispatch, isAuthenticated])

  // 全局错误处理
  useEffect(() => {
    const handleError = (event) => {
      console.error('Global error:', event.error)
      // 这里可以添加错误上报逻辑
    }

    const handleUnhandledRejection = (event) => {
      console.error('Unhandled promise rejection:', event.reason)
      // 这里可以添加错误上报逻辑
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  // 全局加载状态
  if (globalLoading) {
    return <GlobalLoading />
  }

  return (
    <div className="app">
      <Suspense fallback={<PageLoading />}>
        <RouterProvider router={router} />
      </Suspense>
    </div>
  )
}

export default App