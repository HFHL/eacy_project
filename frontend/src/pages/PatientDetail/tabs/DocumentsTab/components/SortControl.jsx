/**
 * 排序控制器组件
 * 支持时间、类型、机构、状态、置信度等多种分组和排序方式
 */
import React from 'react'
import { Select, Space, Typography } from 'antd'
import { 
  ClockCircleOutlined, 
  FileTextOutlined, 
  BankOutlined, 
  CheckCircleOutlined,
  StarOutlined 
} from '@ant-design/icons'

const { Text } = Typography

const SortControl = ({ 
  groupBy, 
  sortOrder, 
  onGroupByChange, 
  onSortOrderChange 
}) => {
  const groupOptions = [
    {
      value: 'date',
      label: (
        <Space>
          <ClockCircleOutlined />
          按上传时间分组
        </Space>
      )
    },
    {
      value: 'effectiveDate',
      label: (
        <Space>
          <ClockCircleOutlined />
          按生效时间分组
        </Space>
      )
    },
    {
      value: 'type',
      label: (
        <Space>
          <FileTextOutlined />
          按类型分组
        </Space>
      )
    },
    {
      value: 'organization',
      label: (
        <Space>
          <BankOutlined />
          按机构分组
        </Space>
      )
    },
    {
      value: 'status',
      label: (
        <Space>
          <CheckCircleOutlined />
          按状态分组
        </Space>
      )
    },
    {
      value: 'confidence',
      label: (
        <Space>
          <StarOutlined />
          按置信度分组
        </Space>
      )
    }
  ]

  const getSortOptions = (groupBy) => {
    switch (groupBy) {
      case 'date':
      case 'effectiveDate':
        return [
          { value: 'desc', label: '由近到远' },
          { value: 'asc', label: '由远到近' }
        ]
      case 'type':
        return [
          { value: 'asc', label: 'A-Z排序' },
          { value: 'desc', label: 'Z-A排序' },
          { value: 'count', label: '按数量排序' }
        ]
      case 'organization':
        return [
          { value: 'asc', label: 'A-Z排序' },
          { value: 'desc', label: 'Z-A排序' },
          { value: 'count', label: '按数量排序' }
        ]
      case 'status':
        return [
          { value: 'priority', label: '按优先级' },
          { value: 'count', label: '按数量排序' }
        ]
      case 'confidence':
        return [
          { value: 'desc', label: '高到低' },
          { value: 'asc', label: '低到高' }
        ]
      default:
        return [
          { value: 'desc', label: '降序' },
          { value: 'asc', label: '升序' }
        ]
    }
  }

  return (
    <div className="sort-control">
      <Space size="middle">
        <div className="sort-control-item">
          <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
            分组方式：
          </Text>
          <Select
            value={groupBy}
            onChange={onGroupByChange}
            style={{ width: 140 }}
            size="small"
          >
            {groupOptions.map(option => (
              <Select.Option key={option.value} value={option.value}>
                {option.label}
              </Select.Option>
            ))}
          </Select>
        </div>

        <div className="sort-control-item">
          <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
            排序：
          </Text>
          <Select
            value={sortOrder}
            onChange={onSortOrderChange}
            style={{ width: 120 }}
            size="small"
          >
            {getSortOptions(groupBy).map(option => (
              <Select.Option key={option.value} value={option.value}>
                {option.label}
              </Select.Option>
            ))}
          </Select>
        </div>
      </Space>
    </div>
  )
}

export default SortControl