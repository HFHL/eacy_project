/**
 * 搜索筛选组件
 * 提供文档的搜索和筛选功能
 */
import React, { useState } from 'react'
import { Row, Col, Input, Select, Button, Space, DatePicker } from 'antd'
import { SearchOutlined, FilterOutlined, ClearOutlined } from '@ant-design/icons'

const { Search } = Input
const { RangePicker } = DatePicker

const SearchFilter = ({
  onSearch,
  onFilter,
  onClear,
  loading = false
}) => {
  const [filters, setFilters] = useState({
    searchText: '',
    documentType: '',
    organization: '',
    dateRange: [],
    status: ''
  })

  // 处理搜索
  const handleSearch = (value) => {
    const newFilters = { ...filters, searchText: value }
    setFilters(newFilters)
    onSearch?.(newFilters)
  }

  // 处理筛选条件变化
  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    onFilter?.(newFilters)
  }

  // 清空所有筛选条件
  const handleClear = () => {
    const emptyFilters = {
      searchText: '',
      documentType: '',
      organization: '',
      dateRange: [],
      status: '',
      extractStatus: ''
    }
    setFilters(emptyFilters)
    onClear?.(emptyFilters)
  }

  // 检查是否有活跃的筛选条件
  const hasActiveFilters = () => {
    return filters.searchText || 
           filters.documentType || 
           filters.organization || 
           filters.dateRange?.length > 0 || 
           filters.status ||
           filters.extractStatus
  }

  return (
    <div className="search-filter-container">
      {/* 第一行：搜索框 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={24} md={12} lg={8}>
          <Search
            placeholder="搜索文档名称、内容关键词..."
            allowClear
            enterButton={<SearchOutlined />}
            size="middle"
            value={filters.searchText}
            onChange={(e) => setFilters({ ...filters, searchText: e.target.value })}
            onSearch={handleSearch}
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={24} md={12} lg={16}>
          <Space wrap>
            <Button
              icon={<FilterOutlined />}
              type={hasActiveFilters() ? 'primary' : 'default'}
            >
              筛选 {hasActiveFilters() && `(${Object.values(filters).filter(v => v && v.length > 0).length})`}
            </Button>
            {hasActiveFilters() && (
              <Button
                icon={<ClearOutlined />}
                onClick={handleClear}
              >
                清空
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      {/* 第二行：筛选条件 */}
      <Row gutter={[16, 8]}>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Select
            placeholder="文档类型"
            allowClear
            style={{ width: '100%' }}
            value={filters.documentType || undefined}
            onChange={(value) => handleFilterChange('documentType', value)}
          >
            <Select.Option value="病历记录">病历记录</Select.Option>
            <Select.Option value="实验室检查">实验室检查</Select.Option>
            <Select.Option value="影像检查">影像检查</Select.Option>
            <Select.Option value="病理报告">病理报告</Select.Option>
            <Select.Option value="基因检测">基因检测</Select.Option>
            <Select.Option value="治疗记录">治疗记录</Select.Option>
            <Select.Option value="其他材料">其他材料</Select.Option>
          </Select>
        </Col>

        <Col xs={12} sm={8} md={6} lg={4}>
          <Select
            placeholder="医疗机构"
            allowClear
            style={{ width: '100%' }}
            value={filters.organization || undefined}
            onChange={(value) => handleFilterChange('organization', value)}
          >
            <Select.Option value="中山大学附属第三医院">中山大学附属第三医院</Select.Option>
            <Select.Option value="广州协和医院">广州协和医院</Select.Option>
            <Select.Option value="解放军总医院">解放军总医院</Select.Option>
            <Select.Option value="北京协和医院">北京协和医院</Select.Option>
            <Select.Option value="复旦大学附属华山医院">复旦大学附属华山医院</Select.Option>
          </Select>
        </Col>

        <Col xs={12} sm={8} md={6} lg={4}>
          <Select
            placeholder="处理状态"
            allowClear
            style={{ width: '100%' }}
            value={filters.status || undefined}
            onChange={(value) => handleFilterChange('status', value)}
          >
            <Select.Option value="extracted">已抽取</Select.Option>
            <Select.Option value="pending">待处理</Select.Option>
            <Select.Option value="processing">处理中</Select.Option>
            <Select.Option value="error">处理失败</Select.Option>
          </Select>
        </Col>

        <Col xs={12} sm={8} md={6} lg={4}>
          <Select
            placeholder="抽取状态"
            allowClear
            style={{ width: '100%' }}
            value={filters.extractStatus || undefined}
            onChange={(value) => handleFilterChange('extractStatus', value)}
          >
            <Select.Option value="pending">待抽取</Select.Option>
            <Select.Option value="running">抽取中</Select.Option>
            <Select.Option value="completed">已抽取</Select.Option>
            <Select.Option value="failed">抽取失败</Select.Option>
          </Select>
        </Col>

        <Col xs={12} sm={12} md={6} lg={5}>
          <RangePicker
            placeholder={['开始日期', '结束日期']}
            style={{ width: '100%' }}
            value={filters.dateRange}
            onChange={(dates) => handleFilterChange('dateRange', dates)}
            format="YYYY-MM-DD"
          />
        </Col>
      </Row>
    </div>
  )
}

export default SearchFilter