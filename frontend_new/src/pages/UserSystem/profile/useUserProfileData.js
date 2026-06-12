import { useEffect, useState } from 'react'
import { Form, message } from 'antd'
import { useDispatch } from 'react-redux'

import { getCurrentUser, updateUserInfo } from '../../../api/auth'
import { getDepartmentTree } from '../../../api/patient'
import { updateUserInfo as updateUserInfoAction } from '../../../store/slices/userSlice'

const emptyUsageStats = {
  patientsManaged: 0,
  projectsCreated: 0,
  documentsUploaded: 0,
  monthlyActive: 0,
  totalSessions: 0,
}

const mapUserInfo = (userData) => ({
  id: userData.id || '',
  name: userData.name || '',
  email: userData.email || '',
  phone: userData.phone || '',
  avatar: userData.avatar || null,
  organization: userData.organization || '',
  department: userData.department || '',
  position: userData.job_title || '',
  researchFields: userData.research_fields || [],
  registeredAt: userData.created_at ? new Date(userData.created_at).toLocaleDateString() : '',
  lastLoginAt: userData.login_at ? new Date(userData.login_at).toLocaleString() : '',
  loginDays: userData.accumulated_days || 0,
  status: userData.status || 'active',
})

const mapUsageStats = (userData) => ({
  patientsManaged: userData.patients_managed || 0,
  projectsCreated: userData.projects_created || 0,
  documentsUploaded: userData.documents_uploaded || 0,
  monthlyActive: userData.current_month_active_days || 0,
  totalSessions: userData.total_logins || 0,
})

export const useUserProfileData = () => {
  const dispatch = useDispatch()
  const [form] = Form.useForm()
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userInfo, setUserInfo] = useState(null)
  const [departmentTree, setDepartmentTree] = useState([])
  const [usageStats, setUsageStats] = useState(emptyUsageStats)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [userResponse, deptResponse] = await Promise.all([
          getCurrentUser(),
          getDepartmentTree(),
        ])

        if (deptResponse.success) {
          setDepartmentTree(deptResponse.data || [])
        }

        if (userResponse.success && userResponse.data) {
          const userData = userResponse.data
          setUserInfo(mapUserInfo(userData))
          setUsageStats(mapUsageStats(userData))
          dispatch(updateUserInfoAction(userData))
        }
      } catch (error) {
        console.error('加载数据失败:', error)
        message.error('加载用户信息失败')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [dispatch])

  const handleEditProfile = () => {
    form.setFieldsValue(userInfo)
    setEditModalVisible(true)
  }

  const handleSaveProfile = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)
      const response = await updateUserInfo({
        name: values.name,
        email: values.email,
        phone: values.phone,
        job_title: values.position,
        organization: values.organization,
        department: values.department,
        research_fields: values.researchFields,
      })

      if (response.success && response.data) {
        const userData = response.data
        setUserInfo((prev) => ({
          ...prev,
          name: userData.name,
          email: userData.email,
          phone: userData.phone,
          organization: userData.organization,
          department: userData.department,
          position: userData.job_title,
          researchFields: userData.research_fields || [],
        }))
        dispatch(updateUserInfoAction(userData))
        setEditModalVisible(false)
        message.success('个人信息已更新')
      } else {
        message.error(response.message || '更新失败')
      }
    } catch (error) {
      console.error('保存个人信息失败:', error)
      message.error('请检查输入信息或网络连接')
    } finally {
      setLoading(false)
    }
  }

  return {
    departmentTree,
    editModalVisible,
    form,
    handleEditProfile,
    handleSaveProfile,
    loading,
    setEditModalVisible,
    usageStats,
    userInfo,
  }
}
