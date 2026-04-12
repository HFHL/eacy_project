/**
 * EHR布局管理Hook
 * 封装三栏布局的宽度状态和拖拽调整逻辑
 */
import { useState, useCallback } from 'react'
import { DEFAULT_LAYOUT } from '../../../data/constants'

export const useEhrLayout = () => {
  // 布局宽度状态
  const [ehrLeftWidth, setEhrLeftWidth] = useState(DEFAULT_LAYOUT.EHR_LEFT_WIDTH)
  const [ehrRightWidth, setEhrRightWidth] = useState(DEFAULT_LAYOUT.EHR_RIGHT_WIDTH)
  
  // 布局模式状态
  const [layoutMode, setLayoutMode] = useState('three-column') // 'three-column' | 'two-column'
  const [rightPanelVisible, setRightPanelVisible] = useState(true)
  const [savedRightWidth, setSavedRightWidth] = useState(DEFAULT_LAYOUT.EHR_RIGHT_WIDTH)

  // 左侧拖拽调整处理函数
  const handleLeftResize = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = ehrLeftWidth
    
    const handleMouseMove = (moveEvent) => {
      moveEvent.preventDefault()
      const newWidth = Math.max(250, Math.min(500, startWidth + (moveEvent.clientX - startX)))
      setEhrLeftWidth(newWidth)
    }
    
    const handleMouseUp = (upEvent) => {
      upEvent.preventDefault()
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'default'
      document.body.style.userSelect = 'auto'
    }
    
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [ehrLeftWidth])

  // 右侧拖拽调整处理函数（悬浮面板从左边缘调整宽度）
  const handleRightResize = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = ehrRightWidth
    
    const handleMouseMove = (moveEvent) => {
      moveEvent.preventDefault()
      // 允许最大到屏幕宽度的70%
      const maxWidth = Math.round(window.innerWidth * 0.7)
      const delta = startX - moveEvent.clientX // 向左拖=变宽
      const newWidth = Math.max(300, Math.min(maxWidth, startWidth + delta))
      setEhrRightWidth(newWidth)
    }
    
    const handleMouseUp = (upEvent) => {
      upEvent.preventDefault()
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'default'
      document.body.style.userSelect = 'auto'
    }
    
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [ehrRightWidth])

  // 重置布局到默认值
  const resetLayout = useCallback(() => {
    setEhrLeftWidth(DEFAULT_LAYOUT.EHR_LEFT_WIDTH)
    setEhrRightWidth(DEFAULT_LAYOUT.EHR_RIGHT_WIDTH)
  }, [])

  // 布局模式切换函数
  const toggleLayoutMode = useCallback(() => {
    if (layoutMode === 'three-column') {
      // 切换到两栏：保存当前右侧宽度，隐藏右侧栏
      console.log('切换到两栏模式，隐藏右侧面板')
      setSavedRightWidth(ehrRightWidth)
      setRightPanelVisible(false)
      setLayoutMode('two-column')
    } else {
      // 切换到三栏：恢复保存的宽度，显示右侧栏
      console.log('切换到三栏模式，显示右侧面板')
      setEhrRightWidth(savedRightWidth)
      setRightPanelVisible(true)
      setLayoutMode('three-column')
    }
  }, [layoutMode, ehrRightWidth, savedRightWidth])

  // 强制显示右侧面板（用于手动打开文档溯源）
  const showRightPanel = useCallback(() => {
    if (!rightPanelVisible) {
      console.log('手动显示右侧面板')
      setEhrRightWidth(savedRightWidth)
      setRightPanelVisible(true)
      setLayoutMode('three-column')
    }
  }, [rightPanelVisible, savedRightWidth])

  // 设置预定义布局
  const setPresetLayout = useCallback((preset) => {
    console.log('设置预设布局:', preset)
    switch (preset) {
      case 'compact':
        console.log('应用紧凑布局: 左200px, 右250px')
        setEhrLeftWidth(200)
        if (rightPanelVisible) {
          setEhrRightWidth(250)
          setSavedRightWidth(250)
        }
        break
      case 'wide':
        console.log('应用宽松布局: 左400px, 右450px')
        setEhrLeftWidth(400)
        if (rightPanelVisible) {
          setEhrRightWidth(450)
          setSavedRightWidth(450)
        }
        break
      case 'focus-middle':
        console.log('应用聚焦中间布局: 左250px, 右300px')
        setEhrLeftWidth(250)
        if (rightPanelVisible) {
          setEhrRightWidth(300)
          setSavedRightWidth(300)
        }
        break
      default:
        console.log('重置为默认布局')
        resetLayout()
    }
  }, [rightPanelVisible, resetLayout])

  return {
    // 布局宽度状态
    ehrLeftWidth,
    ehrRightWidth,
    
    // 布局模式状态
    layoutMode,
    rightPanelVisible,
    savedRightWidth,
    
    // 状态设置函数
    setEhrLeftWidth,
    setEhrRightWidth,
    
    // 拖拽处理函数
    handleLeftResize,
    handleRightResize,
    
    // 布局控制函数
    resetLayout,
    setPresetLayout,
    
    // 布局切换函数
    toggleLayoutMode,
    showRightPanel
  }
}

export default useEhrLayout