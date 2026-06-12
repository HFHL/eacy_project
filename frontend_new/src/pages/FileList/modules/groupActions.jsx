import React from 'react'
import { Button, Dropdown, Tag } from 'antd'
import {
  CheckCircleOutlined,
  LoadingOutlined,
  MoreOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  getGroupRecommendedPatient,
  getRecommendedArchiveLabel,
} from './formatters'
import { renderGroupPrimaryActionLabel } from './statusUi'

export const buildGroupActionNodes = (record, options = {}, deps = {}) => {
  const {
    autoArchivingGroupIds,
    handleAutoArchiveGroup,
    handleCreatePatientForGroup,
    navigate,
    openManualArchiveForGroup,
    toggleGroup,
  } = deps
  const { expandDetailLabel = true } = options
  const actions = []
  const isTodo = record?._groupType === 'todo'
  const isArchived = record?._groupType === 'archived'

  if (isTodo) {
    const statusSet = record?._statusSet || []
    const isPendingProcessGroup = statusSet.includes('parse') || statusSet.includes('parsing')
    const hasAutoArchived = statusSet.includes('auto_archived')
    const hasPendingReview = statusSet.includes('pending_confirm_review')
    const hasPendingNew = statusSet.includes('pending_confirm_new')
    const isUncertainGroup = statusSet.includes('pending_confirm_uncertain')
    const matchInfo = record?._matchInfo
    const { patientId: matchedPatientId, candidate: matchedCandidate } = getGroupRecommendedPatient(matchInfo)
    const matchedPatientNameRaw = matchedCandidate?.name || matchedCandidate?.patient_name
    const recommendedArchiveLabel = getRecommendedArchiveLabel(matchedPatientNameRaw, matchInfo?.match_score)

    if (isPendingProcessGroup) {
      actions.push(
        <Button
          key="pending"
          size="small"
          icon={<LoadingOutlined />}
          onClick={(event) => { event.stopPropagation(); toggleGroup(record) }}
        >
          {renderGroupPrimaryActionLabel('查看')}
        </Button>
      )
    } else if (hasAutoArchived || hasPendingReview || isUncertainGroup) {
      actions.push(
        <Button
          key="confirm"
          size="small"
          type="primary"
          icon={<CheckCircleOutlined />}
          loading={autoArchivingGroupIds.has(record._groupId)}
          disabled={!matchedPatientId}
          onClick={(event) => { event.stopPropagation(); handleAutoArchiveGroup(record._groupId) }}
        >
          {renderGroupPrimaryActionLabel(recommendedArchiveLabel)}
        </Button>
      )
    } else if (hasPendingNew && !isUncertainGroup) {
      actions.push(
        <Button
          key="create"
          size="small"
          type="primary"
          icon={<UserAddOutlined />}
          onClick={(event) => { event.stopPropagation(); handleCreatePatientForGroup(record._groupId) }}
        >
          {renderGroupPrimaryActionLabel('新建患者')}
        </Button>
      )
    } else {
      actions.push(
        <Button
          key="manual"
          size="small"
          type="primary"
          icon={<TeamOutlined />}
          onClick={(event) => { event.stopPropagation(); openManualArchiveForGroup(record._groupId) }}
        >
          {renderGroupPrimaryActionLabel('手动选择')}
        </Button>
      )
    }

    const moreItems = isPendingProcessGroup ? [] : [
      {
        key: 'auto',
        icon: <CheckCircleOutlined />,
        label: recommendedArchiveLabel,
        disabled: !matchedPatientId,
        onClick: () => handleAutoArchiveGroup(record._groupId),
      },
      {
        key: 'manual',
        icon: <TeamOutlined />,
        label: '手动选择',
        onClick: () => openManualArchiveForGroup(record._groupId),
      },
    ]
    if (!isPendingProcessGroup && !isUncertainGroup) {
      moreItems.splice(1, 0, {
        key: 'new_patient',
        icon: <UserAddOutlined />,
        label: '新建患者',
        onClick: () => handleCreatePatientForGroup(record._groupId),
      })
    }
    if (moreItems.length) {
      actions.push(
        <Dropdown key="more" trigger={['click']} menu={{ items: moreItems }}>
          <Button size="small" icon={<MoreOutlined />} onClick={(event) => event.stopPropagation()} />
        </Dropdown>
      )
    }
  }

  if (isArchived && record?._patientId) {
    if (record?._patientDeleted) {
      actions.push(
        <Tag
          key="deleted"
          color="red"
          style={{ marginLeft: 4, cursor: 'default' }}
          onClick={(event) => event.stopPropagation()}
        >
          患者已删除
        </Tag>
      )
    } else {
      actions.push(
        <Button
          key="detail"
          size="small"
          type="link"
          icon={<UserOutlined />}
          aria-label="查看患者"
          onClick={(event) => { event.stopPropagation(); navigate(`/patient/detail/${record._patientId}`) }}
          style={{ paddingInline: expandDetailLabel ? 8 : 4 }}
        >
          <span
            style={{
              display: 'inline-block',
              maxWidth: expandDetailLabel ? 72 : 0,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              opacity: expandDetailLabel ? 1 : 0,
              marginLeft: expandDetailLabel ? 4 : 0,
              transition: 'max-width 0.2s ease, opacity 0.2s ease, margin-left 0.2s ease',
            }}
          >
            查看患者
          </span>
        </Button>
      )
    }
  }

  return actions
}
