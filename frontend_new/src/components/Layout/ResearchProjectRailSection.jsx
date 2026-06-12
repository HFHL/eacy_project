import React from 'react'
import {
  Button,
  Space,
  Spin,
  Tooltip,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import CompactRailToolbar from './CompactRailToolbar'
import { getProjectStatusMeta } from './layoutRailModel'
import {
  researchProjectDetail,
  researchProjectTemplateEdit,
} from '../../utils/researchPaths'
import { dispatchRequestProjectEdit } from '../../utils/createIntentEvents'

const { Text } = Typography

const ResearchProjectRailSection = ({
  activeProjectId,
  activeToolbarPanel,
  deletingProjectId,
  hoveredRailCardKey,
  itemHeight,
  items,
  loading,
  location,
  navigate,
  onCreate,
  onDeleteProject,
  onSetToolbarPanel,
  search,
  setHoveredRailCardKey,
  setSearch,
  setSort,
  sort,
  token,
}) => (
  <div style={{
    height: Number.isFinite(itemHeight) ? itemHeight : undefined,
    flex: Number.isFinite(itemHeight) ? undefined : 1,
    minHeight: 56,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
      <Text strong style={{ fontSize: 14 }}>科研项目</Text>
      <CompactRailToolbar
        activePanel={activeToolbarPanel}
        createTooltip="新建项目"
        onCreate={onCreate}
        onPanelChange={onSetToolbarPanel}
        onSearchChange={(event) => setSearch(event.target.value)}
        onSortChange={setSort}
        panelPrefix="project"
        searchPlaceholder="搜索项目"
        searchValue={search}
        sortOptions={[
          { value: 'updated_desc', label: '最近更新' },
          { value: 'name_asc', label: '按名称排序' },
        ]}
        sortValue={sort}
        token={token}
      />
    </div>
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 2 }}>
      {loading ? <div style={{ textAlign: 'center', padding: '8px 0' }}><Spin size="small" /></div> : null}
      {!loading && items.map((item) => (
        <div
          key={item.id}
          role="button"
          tabIndex={0}
          onClick={() => navigate(researchProjectDetail(item.id))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              navigate(researchProjectDetail(item.id))
            }
          }}
          onMouseEnter={() => setHoveredRailCardKey(`project:${item.id}`)}
          onMouseLeave={() => setHoveredRailCardKey('')}
          style={{
            marginBottom: 8,
            borderRadius: 10,
            border: String(activeProjectId) === String(item.id) ? `1px solid ${token.colorPrimaryBorder}` : `1px solid ${token.colorFillSecondary}`,
            background: String(activeProjectId) === String(item.id) ? token.colorPrimaryBg : token.colorBgContainer,
            padding: '10px 10px 8px 10px',
            cursor: 'pointer',
          }}
        >
          <div style={{ width: '100%', lineHeight: 1.3 }}>
            <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
            <div style={{ marginTop: 4, fontSize: 12, color: token.colorTextSecondary, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: item.statusColor || getProjectStatusMeta(item.status).color }}>
                {getProjectStatusMeta(item.status).icon}
                {item.statusLabel || getProjectStatusMeta(item.status).label}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <TeamOutlined />
                {item.patientCount}
              </span>
            </div>
          </div>
          {hoveredRailCardKey === `project:${item.id}` ? (
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                完整度 {Number.isFinite(item.avgCompleteness) ? `${Math.round(item.avgCompleteness)}%` : '--'}
              </Text>
              <Space size={2}>
                <Tooltip title="编辑项目">
                  <Button
                    type="text"
                    size="small"
                    shape="circle"
                    icon={<EditOutlined />}
                    onClick={(event) => {
                      event.stopPropagation()
                      const targetPath = researchProjectDetail(item.id)
                      if (location.pathname !== targetPath) {
                        navigate(targetPath, {
                          state: {
                            openProjectEdit: true,
                            projectId: item.id,
                          },
                        })
                        return
                      }
                      dispatchRequestProjectEdit(item.id)
                    }}
                  />
                </Tooltip>
                <Tooltip title="编辑项目模板">
                  <Button
                    type="text"
                    size="small"
                    shape="circle"
                    icon={<FileTextOutlined />}
                    onClick={(event) => {
                      event.stopPropagation()
                      navigate(researchProjectTemplateEdit(item.id))
                    }}
                  />
                </Tooltip>
                <Tooltip title="删除项目">
                  <Button
                    type="text"
                    size="small"
                    shape="circle"
                    danger
                    loading={deletingProjectId === String(item.id)}
                    icon={<DeleteOutlined />}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onDeleteProject(item)
                    }}
                  />
                </Tooltip>
              </Space>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  </div>
)

export default ResearchProjectRailSection
