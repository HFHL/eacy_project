import React from 'react'
import {
  Button,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  AppstoreOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { getPatientRailDisplayName } from './patientRailDisplay'
import { getGenderMeta } from './layoutRailModel'
import CompactRailToolbar from './CompactRailToolbar'

const { Text } = Typography

const PatientRail = ({
  activePatientId,
  activeToolbarPanel,
  deletingPatientId,
  ehrExtractingMap,
  goFirstPatientDetail,
  hoveredRailCardKey,
  location,
  navigate,
  onDeletePatient,
  onOpenCreatePatient,
  onSetToolbarPanel,
  onTriggerPatientRefresh,
  patientRailItems,
  patientRailLoading,
  patientRailSearch,
  patientRailSort,
  setHoveredRailCardKey,
  setPatientRailSearch,
  setPatientRailSort,
  setSiderExpanded,
  siderCollapsed,
  token,
}) => {
  const navigateToPatient = (patientId) => {
    navigate(`/patient/detail/${patientId}`, { state: { from: '/patient/pool' } })
  }

  const hasActivePatient = activePatientId
    ? patientRailItems.some((item) => String(item.id) === String(activePatientId))
    : false

  if (siderCollapsed) {
    return (
      <div style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <Tooltip title="患者列表" placement="right">
          <Button
            shape="circle"
            type="primary"
            icon={<TeamOutlined />}
            onClick={async () => {
              setSiderExpanded()
              await goFirstPatientDetail()
            }}
          />
        </Tooltip>
        <Tooltip title="新建患者" placement="right">
          <Button shape="circle" icon={<PlusOutlined />} onClick={onOpenCreatePatient} />
        </Tooltip>
      </div>
    )
  }

  return (
    <div style={{ padding: 12 }}>
      <CompactRailToolbar
        activePanel={activeToolbarPanel}
        createTooltip="新建患者"
        onCreate={onOpenCreatePatient}
        onPanelChange={onSetToolbarPanel}
        onSearchChange={(event) => setPatientRailSearch(event.target.value)}
        onSortChange={setPatientRailSort}
        panelPrefix="patient"
        searchPlaceholder="搜索患者"
        searchValue={patientRailSearch}
        sortOptions={[
          { value: 'updated_desc', label: '最近更新' },
          { value: 'name_asc', label: '按姓名排序' },
        ]}
        sortValue={patientRailSort}
        token={token}
      />
      <div style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto', paddingRight: 2, marginTop: 8 }}>
        {patientRailLoading ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <Spin size="small" />
          </div>
        ) : null}
        {!patientRailLoading && !patientRailItems.length ? (
          <Text type="secondary" style={{ fontSize: 12 }}>暂无患者</Text>
        ) : null}
        {patientRailItems.map((item) => (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            onClick={() => navigateToPatient(item.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                navigateToPatient(item.id)
              }
            }}
            onMouseEnter={() => setHoveredRailCardKey(`patient:${item.id}`)}
            onMouseLeave={() => setHoveredRailCardKey('')}
            style={{
              marginBottom: 8,
              borderRadius: 10,
              border: String(item.id) === String(activePatientId) ? `1px solid ${token.colorPrimaryBorder}` : `1px solid ${token.colorFillSecondary}`,
              background: String(item.id) === String(activePatientId) ? token.colorPrimaryBg : token.colorBgContainer,
              padding: '10px 10px 8px 10px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getPatientRailDisplayName(item.name)}</div>
              <Tooltip title={ehrExtractingMap[String(item.id)] ? '电子病历夹更新中…' : '刷新患者信息'}>
                <Button
                  type="text"
                  size="small"
                  loading={!!ehrExtractingMap[String(item.id)]}
                  icon={<ReloadOutlined />}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (String(item.id) === String(activePatientId) && location.pathname.startsWith('/patient/detail/')) {
                      onTriggerPatientRefresh(item.id)
                      message.success('已刷新患者信息')
                      return
                    }
                    navigateToPatient(item.id)
                  }}
                />
              </Tooltip>
            </div>
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, color: token.colorTextSecondary, fontSize: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {getGenderMeta(item.gender).icon}
                {getGenderMeta(item.gender).label}
              </span>
              <span>{item.age != null ? `${item.age}岁` : '--'}</span>
              <span style={{ color: token.colorTextSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.diagnosis || '暂无诊断'}
              </span>
            </div>
            {hoveredRailCardKey === `patient:${item.id}` ? (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: token.colorTextSecondary, fontSize: 12 }}>
                  <Tooltip title="已归档文档数量">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <FileTextOutlined />
                      {item.documentCount}
                    </span>
                  </Tooltip>
                  <Tooltip title="关联科研项目数量">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <AppstoreOutlined />
                      {item.projectsCount}
                    </span>
                  </Tooltip>
                </div>
                <Space
                  size={2}
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <Tooltip title="修改患者">
                    <Button
                      type="text"
                      size="small"
                      shape="circle"
                      icon={<EditOutlined />}
                      onClick={(event) => {
                        event.stopPropagation()
                        navigate(`/patient/detail/${item.id}`, {
                          state: {
                            from: '/patient/pool',
                            openPatientEdit: true,
                          },
                        })
                      }}
                    />
                  </Tooltip>
                  <Tooltip title="删除患者">
                    <Button
                      type="text"
                      size="small"
                      shape="circle"
                      danger
                      loading={deletingPatientId === String(item.id)}
                      icon={<DeleteOutlined />}
                      onMouseDown={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        onDeletePatient(item)
                      }}
                    />
                  </Tooltip>
                </Space>
              </div>
            ) : null}
          </div>
        ))}
        {activePatientId && !hasActivePatient ? (
          <Tag color="blue" style={{ marginTop: 6, width: '100%', textAlign: 'center' }}>当前患者</Tag>
        ) : null}
      </div>
    </div>
  )
}

export default PatientRail
