/**
 * 字段编辑状态管理Hook
 * 管理字段的编辑状态、编辑值和相关操作
 */
import { useState, useCallback } from 'react'
import { message } from 'antd'
import { saveEhrFieldValueV3 } from '@/api/patient'

/**
 * 将字段路径标准化为候选值接口可识别的点分路径。
 * @param {string} fieldId
 * @returns {string}
 */
const normalizeFieldPath = (fieldId) => String(fieldId || '')
  .replace(/\[\*\]/g, '')
  .replace(/\[(\d+)\]/g, '.$1')
  .replace(/\//g, '.')
  .replace(/\.+/g, '.')
  .replace(/^\./, '')
  .replace(/\.$/, '')

export const useEhrFieldEdit = (patientId = null, onSaveSuccess = null) => {
  // 编辑状态
  const [editingEhrField, setEditingEhrField] = useState(null)
  const [editingEhrValue, setEditingEhrValue] = useState('')
  const [saving, setSaving] = useState(false)

  // 开始编辑字段
  const handleEhrFieldEdit = useCallback((fieldId, currentValue) => {
    console.log('开始编辑字段:', fieldId, '当前值:', currentValue)
    setEditingEhrField(fieldId)
    setEditingEhrValue(currentValue || '')
  }, [])

  // 保存编辑
  const handleEhrSaveEdit = useCallback(async (fieldId) => {
    console.log('保存字段编辑:', fieldId, '新值:', editingEhrValue)
    
    if (!patientId) {
      console.warn('未提供 patientId，无法保存')
      message.warning('保存失败：未找到患者信息')
      return { success: false, message: '未找到患者信息' }
    }
    
    setSaving(true)
    try {
      const normalizedFieldPath = normalizeFieldPath(fieldId)
      const res = await saveEhrFieldValueV3(patientId, normalizedFieldPath, editingEhrValue)
      
      if (res.success) {
        message.success('保存成功')
    // 清空编辑状态
    setEditingEhrField(null)
    setEditingEhrValue('')
    
        // 调用刷新回调
        if (onSaveSuccess) {
          onSaveSuccess()
        }
        
        return { success: true, fieldId, newValue: editingEhrValue }
      } else {
        message.error(res.message || '保存失败')
        return { success: false, message: res.message }
      }
    } catch (error) {
      console.error('保存字段编辑失败:', error)
      message.error('保存失败，请稍后重试')
      return { success: false, message: error.message }
    } finally {
      setSaving(false)
    }
  }, [editingEhrValue, patientId, onSaveSuccess])

  // 取消编辑
  const handleEhrCancelEdit = useCallback(() => {
    console.log('取消字段编辑')
    setEditingEhrField(null)
    setEditingEhrValue('')
  }, [])

  // 批量编辑相关函数（为表格编辑等复杂场景预留）
  const handleEhrBatchEdit = useCallback(async (fieldUpdates) => {
    console.log('批量编辑字段:', fieldUpdates)
    
    if (!patientId) {
      console.warn('未提供 patientId，无法保存')
      message.warning('保存失败：未找到患者信息')
      return { success: false, message: '未找到患者信息' }
    }
    
    setSaving(true)
    try {
      const results = await Promise.all(
        fieldUpdates.map((fieldUpdate) => {
          const normalizedFieldPath = normalizeFieldPath(fieldUpdate?.fieldId)
          return saveEhrFieldValueV3(
            patientId,
            normalizedFieldPath,
            fieldUpdate?.value,
          )
        }),
      )
      const res = {
        success: results.every((item) => item?.success),
        message: results.find((item) => !item?.success)?.message || '',
      }
      
      if (res.success) {
        message.success('批量保存成功')
        
        // 调用刷新回调
        if (onSaveSuccess) {
          onSaveSuccess()
        }
        
        return { success: true, updatedFields: fieldUpdates }
      } else {
        message.error(res.message || '批量保存失败')
        return { success: false, message: res.message }
      }
    } catch (error) {
      console.error('批量保存失败:', error)
      message.error('批量保存失败，请稍后重试')
      return { success: false, message: error.message }
    } finally {
      setSaving(false)
    }
  }, [patientId, onSaveSuccess])

  // 检查字段是否正在编辑
  const isFieldEditing = useCallback((fieldId) => {
    return editingEhrField === fieldId
  }, [editingEhrField])

  // 重置所有编辑状态
  const resetEditState = useCallback(() => {
    setEditingEhrField(null)
    setEditingEhrValue('')
  }, [])

  return {
    // 编辑状态
    editingEhrField,
    editingEhrValue,
    saving,
    
    // 状态设置函数
    setEditingEhrField,
    setEditingEhrValue,
    
    // 编辑操作函数
    handleEhrFieldEdit,
    handleEhrSaveEdit,
    handleEhrCancelEdit,
    handleEhrBatchEdit,
    
    // 工具函数
    isFieldEditing,
    resetEditState
  }
}

export default useEhrFieldEdit
