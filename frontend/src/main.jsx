import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'

import App from './App'
import store from './store'
import './styles/global.css'
import { setupMessageToNotificationBridge, setupNotificationPersistence } from './utils/notificationBridge'

// 设置dayjs中文语言
dayjs.locale('zh-cn')

// Ant Design 主题配置
const theme = {
  token: {
    // 主色调 - Ele Admin 风格通常使用鲜艳的蓝色
    colorPrimary: '#1890ff',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff4d4f',
    
    // 字体配置
    fontSize: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
    
    // 圆角配置 - 稍微大一点的圆角更现代
    borderRadius: 6,
    
    // 间距配置
    marginXS: 8,
    marginSM: 12,
    margin: 16,
    marginMD: 20,
    marginLG: 24,
    marginXL: 32,
    
    // 布局配置
    colorBgContainer: '#ffffff',
    colorBgLayout: '#f0f2f5', // 浅灰背景
    colorBorder: '#f0f0f0',
    
    // 文本颜色
    colorText: 'rgba(0, 0, 0, 0.85)',
    colorTextSecondary: 'rgba(0, 0, 0, 0.45)',
    colorTextTertiary: 'rgba(0, 0, 0, 0.25)',
  },
  components: {
    // 表格组件定制
    Table: {
      headerBg: '#fafafa',
      headerColor: 'rgba(0, 0, 0, 0.85)',
      rowHoverBg: '#f5f7fa',
    },
    // 按钮组件定制
    Button: {
      borderRadius: 4,
    },
    // 卡片组件
    Card: {
      borderRadius: 8, // 卡片圆角
      boxShadowTertiary: '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)',
    },
    // 布局组件
    Layout: {
      siderBg: '#ffffff', // 浅色侧边栏
      headerBg: '#ffffff',
      bodyBg: '#f0f2f5', // 页面主体背景
    },
    // 菜单组件
    Menu: {
      darkItemBg: '#001529',
      darkItemSelectedBg: '#1890ff',
    }
  }
}

// 医疗数据界面特殊配置 (保留)
const medicalUIConfig = {
  // 数据完整度颜色配置
  dataCompleteness: {
    high: '#10b981',    // >90% 绿色
    medium: '#f59e0b',  // 70-90% 黄色
    low: '#ef4444'      // <70% 红色
  },
  // 置信度颜色配置
  confidence: {
    high: { bg: '#f6ffed', border: '#b7eb8f', color: '#52c41a' },
    medium: { bg: '#fffbe6', border: '#ffe58f', color: '#faad14' },
    low: { bg: '#fff2f0', border: '#ffccc7', color: '#ff4d4f' }
  }
}

// 将医疗UI配置添加到全局
window.MEDICAL_UI_CONFIG = medicalUIConfig

// 通知中心：拦截 antd message.* 并持久化通知列表
setupMessageToNotificationBridge(store)
setupNotificationPersistence(store)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <ConfigProvider 
        locale={zhCN} 
        theme={theme}
        componentSize="middle"
      >
        <App />
      </ConfigProvider>
    </Provider>
  </React.StrictMode>
)
