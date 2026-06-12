import React from 'react'
import {
  Button,
  Input,
  Popover,
  Select,
  Tooltip,
} from 'antd'
import {
  PlusOutlined,
  SearchOutlined,
  SortAscendingOutlined,
} from '@ant-design/icons'

const CompactRailToolbar = ({
  activePanel,
  createTooltip,
  defaultSortValue = 'updated_desc',
  extraToolbarActions = null,
  onCreate,
  onPanelChange,
  onSearchChange,
  onSortChange,
  panelPrefix,
  searchPlaceholder,
  searchValue,
  sortOptions,
  sortValue,
  token,
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <Tooltip title={createTooltip}>
      <Button
        size="small"
        shape="circle"
        icon={<PlusOutlined />}
        onClick={onCreate}
        style={{ borderColor: token.colorBorder }}
      />
    </Tooltip>
    {extraToolbarActions}
    <Popover
      trigger="click"
      placement="bottomLeft"
      open={activePanel === `${panelPrefix}:search`}
      onOpenChange={(open) => onPanelChange(open ? `${panelPrefix}:search` : '')}
      content={(
        <div style={{ width: 220 }}>
          <Input
            size="small"
            placeholder={searchPlaceholder}
            prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
            value={searchValue}
            onChange={onSearchChange}
            allowClear
            autoFocus
          />
        </div>
      )}
    >
      <Tooltip title="搜索">
        <Button
          size="small"
          shape="circle"
          icon={<SearchOutlined />}
          type={searchValue ? 'primary' : 'default'}
          style={{ borderColor: searchValue ? undefined : token.colorBorder }}
        />
      </Tooltip>
    </Popover>
    <Popover
      trigger="click"
      placement="bottomLeft"
      open={activePanel === `${panelPrefix}:sort`}
      onOpenChange={(open) => onPanelChange(open ? `${panelPrefix}:sort` : '')}
      content={(
        <div style={{ width: 220 }}>
          <Select
            size="small"
            value={sortValue}
            onChange={onSortChange}
            options={sortOptions}
            style={{ width: '100%' }}
            suffixIcon={<SortAscendingOutlined />}
          />
        </div>
      )}
    >
      <Tooltip title="排序">
        <Button
          size="small"
          shape="circle"
          icon={<SortAscendingOutlined />}
          type={sortValue !== defaultSortValue ? 'primary' : 'default'}
          style={{ borderColor: sortValue !== defaultSortValue ? undefined : token.colorBorder }}
        />
      </Tooltip>
    </Popover>
  </div>
)

export default CompactRailToolbar
