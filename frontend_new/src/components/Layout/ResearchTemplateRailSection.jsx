import React from 'react'
import {
  Button,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  SafetyCertificateOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import CompactRailToolbar from './CompactRailToolbar'
import { templateView } from '../../utils/researchPaths'

const { Text } = Typography

const ResearchTemplateRailSection = ({
  activeTemplateId,
  activeToolbarPanel,
  deletingTemplateId,
  hoveredRailCardKey,
  itemHeight,
  items,
  loading,
  navigate,
  onCloneTemplate,
  onCreate,
  onCsvImport,
  onDeleteTemplate,
  onOpenTemplateMeta,
  onPreviewTemplate,
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
      <Text strong style={{ fontSize: 14 }}>CRF 模板</Text>
      <CompactRailToolbar
        activePanel={activeToolbarPanel}
        createTooltip="新建模板"
        extraToolbarActions={(
          <Tooltip title="CSV 导入">
            <Button
              size="small"
              shape="circle"
              icon={<UploadOutlined />}
              onClick={onCsvImport}
              style={{ borderColor: token.colorBorder }}
            />
          </Tooltip>
        )}
        onCreate={onCreate}
        onPanelChange={onSetToolbarPanel}
        onSearchChange={(event) => setSearch(event.target.value)}
        onSortChange={setSort}
        panelPrefix="template"
        searchPlaceholder="搜索模板"
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
          onClick={() => navigate(templateView(item.id))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              navigate(templateView(item.id))
            }
          }}
          onMouseEnter={() => setHoveredRailCardKey(`template:${item.id}`)}
          onMouseLeave={() => setHoveredRailCardKey('')}
          style={{
            marginBottom: 8,
            borderRadius: 10,
            border: String(activeTemplateId) === String(item.id) ? `1px solid ${token.colorPrimaryBorder}` : `1px solid ${token.colorFillSecondary}`,
            background: String(activeTemplateId) === String(item.id) ? token.colorPrimaryBg : token.colorBgContainer,
            padding: '10px 10px 8px 10px',
            cursor: 'pointer',
          }}
        >
          <div style={{ width: '100%', lineHeight: 1.3 }}>
            <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
            <div style={{ marginTop: 4, fontSize: 12, color: token.colorTextSecondary, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag color="blue" style={{ marginInlineEnd: 0 }}>{item.category || '未分类'}</Tag>
              {item.isPublished === true ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: token.colorSuccess }}>
                  <SafetyCertificateOutlined />
                  已发布
                </span>
              ) : item.isPublished === false ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: token.colorWarning }}>
                  <EditOutlined />
                  草稿
                </span>
              ) : null}
            </div>
          </div>
          {hoveredRailCardKey === `template:${item.id}` ? (
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                字段组 {item.fieldGroupsCount != null ? item.fieldGroupsCount : '--'}
              </Text>
              <Space size={2}>
                <Tooltip title="预览模板">
                  <Button
                    type="text"
                    size="small"
                    shape="circle"
                    icon={<EyeOutlined />}
                    onClick={(event) => {
                      event.stopPropagation()
                      onPreviewTemplate(item)
                    }}
                  />
                </Tooltip>
                <Tooltip title="编辑模板信息">
                  <Button
                    type="text"
                    size="small"
                    shape="circle"
                    icon={<EditOutlined />}
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpenTemplateMeta(item.id)
                    }}
                  />
                </Tooltip>
                <Tooltip title="复制为新模板">
                  <Button
                    type="text"
                    size="small"
                    shape="circle"
                    icon={<CopyOutlined />}
                    onClick={(event) => {
                      event.stopPropagation()
                      onCloneTemplate(item)
                    }}
                  />
                </Tooltip>
                {item.deletable ? (
                  <Tooltip title="删除模板">
                    <Button
                      type="text"
                      size="small"
                      shape="circle"
                      danger
                      loading={deletingTemplateId === String(item.id)}
                      icon={<DeleteOutlined />}
                      onClick={(event) => {
                        event.stopPropagation()
                        onDeleteTemplate(item)
                      }}
                    />
                  </Tooltip>
                ) : null}
              </Space>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  </div>
)

export default ResearchTemplateRailSection
