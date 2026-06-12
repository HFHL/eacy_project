import React from 'react'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Dropdown,
  Input,
  Row,
  Select,
  Space,
  TreeSelect,
  Typography,
} from 'antd'
import {
  FilterOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
} from '@ant-design/icons'

const { Text } = Typography
const { Search } = Input

const getAdvancedFilterCount = (advancedFilters) => (
  (advancedFilters.diagnosisKeywords ? 1 : 0) +
  (advancedFilters.dateRange ? 1 : 0) +
  (advancedFilters.projectStatus?.length > 0 ? 1 : 0) +
  ((advancedFilters.docCountMin !== null || advancedFilters.docCountMax !== null) ? 1 : 0)
)

const PatientFilterToolbar = ({
  filters,
  advancedFilters,
  departmentLoading,
  departmentTreeData,
  visibleColumns,
  columnOptions,
  patientCount,
  totalCount,
  onSearch,
  onFiltersChange,
  onPageReset,
  onResetFilters,
  onOpenAdvancedFilters,
  onVisibleColumnsChange,
}) => {
  const updateFilter = (key, value) => {
    onFiltersChange({ ...filters, [key]: value || '' })
    onPageReset()
  }

  return (
    <Card size="small" style={{ marginBottom: 12 }}>
      <Row gutter={[16, 16]} align="middle">
        <Col xs={24} sm={8} md={6}>
          <Search
            placeholder="搜索患者姓名、ID或诊断"
            allowClear
            enterButton={<SearchOutlined />}
            onChange={(event) => onSearch(event.target.value)}
            style={{ width: '100%' }}
          />
        </Col>
        <Col xs={12} sm={4} md={3}>
          <Select
            placeholder="性别"
            allowClear
            style={{ width: '100%' }}
            value={filters.gender || undefined}
            onChange={(value) => updateFilter('gender', value)}
          >
            <Select.Option value="男">男</Select.Option>
            <Select.Option value="女">女</Select.Option>
          </Select>
        </Col>
        <Col xs={12} sm={6} md={5}>
          <TreeSelect
            placeholder="科室"
            allowClear
            loading={departmentLoading}
            style={{ width: '100%' }}
            value={filters.department || undefined}
            treeData={departmentTreeData}
            onChange={(value) => updateFilter('department', value)}
          />
        </Col>
        <Col xs={12} sm={4} md={3}>
          <Select
            placeholder="项目状态"
            allowClear
            style={{ width: '100%' }}
            value={filters.projectStatus || undefined}
            onChange={(value) => updateFilter('projectStatus', value)}
          >
            <Select.Option value="unlinked">未关联</Select.Option>
            <Select.Option value="linked">已关联</Select.Option>
          </Select>
        </Col>
        <Col flex={1}>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={onResetFilters}>重置</Button>
            <Badge count={getAdvancedFilterCount(advancedFilters)} size="small" offset={[-5, 5]}>
              <Button icon={<FilterOutlined />} onClick={onOpenAdvancedFilters}>高级筛选</Button>
            </Badge>
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'column-control',
                    label: (
                      <div style={{ padding: '8px 0' }}>
                        <Text strong style={{ marginBottom: 8, display: 'block' }}>显示列设置</Text>
                        <Checkbox.Group
                          value={visibleColumns}
                          onChange={onVisibleColumnsChange}
                          style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                        >
                          {columnOptions.map(option => (
                            <Checkbox key={option.value} value={option.value}>
                              {option.label}
                            </Checkbox>
                          ))}
                        </Checkbox.Group>
                      </div>
                    )
                  }
                ]
              }}
              trigger={['click']}
              placement="bottomRight"
            >
              <Button icon={<SettingOutlined />}>列设置</Button>
            </Dropdown>
          </Space>
        </Col>
        <Col>
          <Text type="secondary" style={{ fontSize: 12 }}>
            显示 {patientCount} / {totalCount} 名患者
          </Text>
        </Col>
      </Row>
    </Card>
  )
}

export default PatientFilterToolbar
