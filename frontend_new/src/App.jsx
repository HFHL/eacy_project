import React, { Suspense, useEffect, useRef } from 'react'
import { RouterProvider } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { Spin, App as AntdApp } from 'antd'
import router from './router'
import { updateLastActivity } from './store/slices/userSlice'
import { softLogin } from './api/auth'
import { startGlobalBackgroundTaskPoller, stopGlobalBackgroundTaskPoller } from './utils/globalBackgroundTaskPoller'
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
  const lastActivityDispatchAt = useRef(0)

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
    /**
     * 节流更新用户活动时间，避免高频事件触发 Redux 连续更新。
     *
     * @param {boolean} [force=false] 是否强制更新（用于定时心跳）。
     * @returns {void}
     */
    const handleUserActivity = (force = false) => {
      if (isAuthenticated) {
        const now = Date.now()
        if (!force && (now - lastActivityDispatchAt.current) < 5000) return
        lastActivityDispatchAt.current = now
        dispatch(updateLastActivity())
      }
    }

    // 监听用户活动事件
    const events = ['mousedown', 'keypress', 'touchstart', 'click']
    events.forEach(event => {
      document.addEventListener(event, handleUserActivity, true)
    })

    // 定期更新活动时间
    const activityInterval = setInterval(() => handleUserActivity(true), 60000) // 每分钟更新一次

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleUserActivity, true)
      })
      clearInterval(activityInterval)
    }
  }, [dispatch, isAuthenticated])

  // 后台抽取 / 病历夹批量任务：全局轮询完成后提醒并触发页面刷新事件
  useEffect(() => {
    if (isAuthenticated) {
      startGlobalBackgroundTaskPoller()
      return () => stopGlobalBackgroundTaskPoller()
    }
    stopGlobalBackgroundTaskPoller()
    return undefined
  }, [isAuthenticated])

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
      <AntdApp>
        <Suspense fallback={<PageLoading />}>
          <RouterProvider
            router={router}
            future={{ v7_startTransition: true }}
          />
        </Suspense>
      </AntdApp>
    </div>
  )
}

export default App