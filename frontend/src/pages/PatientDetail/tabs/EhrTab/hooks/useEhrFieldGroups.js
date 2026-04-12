/**
 * EHR字段组管理Hook
 * 封装字段组的选择状态和展开状态管理
 */
import { useState, useCallback } from 'react'
import { DEFAULT_EXPANDED_GROUPS } from '../../../data/constants'

export const useEhrFieldGroups = () => {
  // 字段组相关状态
  const [selectedEhrGroup, setSelectedEhrGroup] = useState('personalInfo')
  const [expandedGroups, setExpandedGroups] = useState(DEFAULT_EXPANDED_GROUPS)

  // 字段组选择处理
  const handleEhrGroupSelect = useCallback((groupKey) => {
    setSelectedEhrGroup(groupKey)
    console.log('选中字段组:', groupKey)
  }, [])

  // 字段组展开/收起处理
  const handleGroupToggle = useCallback((groupKey) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }))
    console.log('切换字段组展开状态:', groupKey)
  }, [])

  // 展开所有字段组
  const expandAllGroups = useCallback((ehrFieldGroups) => {
    const allExpanded = {}
    const walk = (groups) => {
      groups.forEach(group => {
        // 有 children 的节点才需要展开状态
        if (group.children && group.children.length > 0) {
          allExpanded[group.key] = true
          walk(group.children)
        }
      })
    }
    walk(ehrFieldGroups || [])
    setExpandedGroups(allExpanded)
  }, [])

  // 收起所有字段组
  const collapseAllGroups = useCallback(() => {
    setExpandedGroups({})
  }, [])

  // 重置到默认展开状态
  const resetExpandedGroups = useCallback(() => {
    setExpandedGroups(DEFAULT_EXPANDED_GROUPS)
  }, [])

  // 选择下一个字段组
  const selectNextGroup = useCallback((ehrFieldGroups) => {
    const currentIndex = ehrFieldGroups.findIndex(group => group.key === selectedEhrGroup)
    if (currentIndex < ehrFieldGroups.length - 1) {
      setSelectedEhrGroup(ehrFieldGroups[currentIndex + 1].key)
    }
  }, [selectedEhrGroup])

  // 选择上一个字段组
  const selectPrevGroup = useCallback((ehrFieldGroups) => {
    const currentIndex = ehrFieldGroups.findIndex(group => group.key === selectedEhrGroup)
    if (currentIndex > 0) {
      setSelectedEhrGroup(ehrFieldGroups[currentIndex - 1].key)
    }
  }, [selectedEhrGroup])

  return {
    // 状态
    selectedEhrGroup,
    expandedGroups,
    
    // 状态设置函数
    setSelectedEhrGroup,
    setExpandedGroups,
    
    // 事件处理函数
    handleEhrGroupSelect,
    handleGroupToggle,
    
    // 批量操作函数
    expandAllGroups,
    collapseAllGroups,
    resetExpandedGroups,
    
    // 导航函数
    selectNextGroup,
    selectPrevGroup
  }
}

export default useEhrFieldGroups