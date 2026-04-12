import { createSlice } from '@reduxjs/toolkit'

/**
 * 从localStorage恢复登录状态
 */
const getInitialState = () => {
  const accessToken = localStorage.getItem('access_token')
  const userInfoStr = localStorage.getItem('user_info')
  
  if (accessToken && userInfoStr) {
    try {
      const userInfo = JSON.parse(userInfoStr)
      let userSettings = null
      try {
        const settingsStr = localStorage.getItem('user_settings')
        if (settingsStr) userSettings = JSON.parse(settingsStr)
      } catch (_) {}
      return {
        isAuthenticated: true,
        userInfo,
        preferences: {
          theme: 'light',
          language: 'zh-CN',
          pageSize: 20,
          autoSave: true
        },
        userSettings, // 从 localStorage 恢复，硬登录后由接口拉取并写入
        loginTime: localStorage.getItem('login_time') || new Date().toISOString(),
        lastActivity: new Date().toISOString()
      }
    } catch (e) {
      // JSON解析失败，清除无效数据
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user_info')
      localStorage.removeItem('user_settings')
    }
  }
  
  // 未登录状态
  return {
    isAuthenticated: false,
    userInfo: null,
    preferences: {
      theme: 'light',
      language: 'zh-CN',
      pageSize: 20,
      autoSave: true
    },
    userSettings: null,
    loginTime: null,
    lastActivity: null
  }
}

const initialState = getInitialState()

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    /**
     * 登录成功
     * @param {object} action.payload - 登录返回数据
     * @param {string} action.payload.access_token - 访问token
     * @param {string} action.payload.refresh_token - 刷新token
     * @param {object} action.payload.user - 用户信息
     */
    loginSuccess: (state, action) => {
      const { access_token, refresh_token, user } = action.payload
      
      // 保存到localStorage
      localStorage.setItem('access_token', access_token)
      localStorage.setItem('refresh_token', refresh_token)
      localStorage.setItem('user_info', JSON.stringify(user))
      localStorage.setItem('login_time', new Date().toISOString())
      
      // 更新state
      state.isAuthenticated = true
      state.userInfo = user
      state.userSettings = null // 登录后由调用方拉取并 setUserSettings
      state.loginTime = new Date().toISOString()
      state.lastActivity = new Date().toISOString()
    },
    
    /**
     * 登出
     */
    logout: (state) => {
      // 清除认证相关 localStorage
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user_info')
      localStorage.removeItem('user_settings')
      localStorage.removeItem('login_time')

      // 清除业务数据缓存（防止新账号登录看到旧数据）
      localStorage.removeItem('eacy_task_store_v1')
      localStorage.removeItem('eacy_ui_notifications_v1')
      
      // 重置state
      state.isAuthenticated = false
      state.userInfo = null
      state.userSettings = null
      state.loginTime = null
      state.lastActivity = null
    },

    /**
     * 设置用户设置缓存（硬登录后或系统设置页保存后写入，同时持久化到 localStorage）
     */
    setUserSettings: (state, action) => {
      state.userSettings = action.payload
      try {
        if (action.payload != null) {
          localStorage.setItem('user_settings', JSON.stringify(action.payload))
        } else {
          localStorage.removeItem('user_settings')
        }
      } catch (_) {}
    },
    
    /**
     * 更新用户信息
     */
    updateUserInfo: (state, action) => {
      state.userInfo = { ...state.userInfo, ...action.payload }
      localStorage.setItem('user_info', JSON.stringify(state.userInfo))
    },
    
    /**
     * 更新偏好设置
     */
    updatePreferences: (state, action) => {
      state.preferences = { ...state.preferences, ...action.payload }
    },
    
    /**
     * 更新最后活动时间
     */
    updateLastActivity: (state) => {
      state.lastActivity = new Date().toISOString()
    },
    
    /**
     * 刷新Token成功
     */
    refreshTokenSuccess: (state, action) => {
      const { access_token, refresh_token } = action.payload
      localStorage.setItem('access_token', access_token)
      if (refresh_token) {
        localStorage.setItem('refresh_token', refresh_token)
      }
    }
  }
})

export const {
  loginSuccess,
  logout,
  updateUserInfo,
  updatePreferences,
  updateLastActivity,
  refreshTokenSuccess,
  setUserSettings
} = userSlice.actions

// 兼容旧的login action（别名）
export const login = loginSuccess

export default userSlice.reducer
