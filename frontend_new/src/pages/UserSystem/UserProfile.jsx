import React from 'react'
import { Col, Row, Spin } from 'antd'
import { useNavigate } from 'react-router-dom'

import { EditProfileModal } from './profile/EditProfileModal'
import { ProfileDetailsCard } from './profile/ProfileDetailsCard'
import { QuickActionsCard } from './profile/QuickActionsCard'
import { UsageStatsCard } from './profile/UsageStatsCard'
import { UserOverviewCard } from './profile/UserOverviewCard'
import { useUserProfileData } from './profile/useUserProfileData'

const UserProfile = () => {
  const navigate = useNavigate()
  const {
    departmentTree,
    editModalVisible,
    form,
    handleEditProfile,
    handleSaveProfile,
    loading,
    setEditModalVisible,
    usageStats,
    userInfo,
  } = useUserProfileData()

  if (loading || !userInfo) {
    return (
      <div className="page-container fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip="加载用户信息..." />
      </div>
    )
  }

  return (
    <div className="page-container fade-in">
      <UserOverviewCard
        userInfo={userInfo}
        onEdit={handleEditProfile}
        onSettings={() => navigate('/user/settings')}
      />

      <Row gutter={24}>
        <Col span={16}>
          <UsageStatsCard usageStats={usageStats} />
        </Col>

        <Col span={8}>
          <ProfileDetailsCard userInfo={userInfo} />
          <QuickActionsCard navigate={navigate} />
        </Col>
      </Row>

      <EditProfileModal
        departmentTree={departmentTree}
        form={form}
        onCancel={() => setEditModalVisible(false)}
        onSave={handleSaveProfile}
        visible={editModalVisible}
      />
    </div>
  )
}

export default UserProfile
