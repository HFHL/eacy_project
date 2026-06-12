import React from 'react'
import { Badge, Button, Tooltip } from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  InboxOutlined,
} from '@ant-design/icons'

const documentRailItems = [
  { key: 'all', label: '全部', icon: <FileTextOutlined /> },
  { key: 'parse', label: '待解析', icon: <ClockCircleOutlined /> },
  { key: 'todo', label: '待归档', icon: <InboxOutlined /> },
  { key: 'archived', label: '已归档', icon: <CheckCircleOutlined /> },
]

const DocumentRail = ({
  counts,
  documentTab,
  documentView,
  navigate,
  siderCollapsed,
  token,
}) => {
  if (siderCollapsed) {
    return (
      <div style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        {documentRailItems.map((item) => (
          <Tooltip key={item.key} title={`${item.label}（${counts[item.key] || 0}）`} placement="right">
            <Badge count={counts[item.key] || 0} size="small" showZero>
              <Button
                type={documentTab === item.key ? 'primary' : 'text'}
                shape="circle"
                icon={item.icon}
                onClick={() => navigate(`/document/file-list?tab=${item.key}&view=${documentView}`)}
              />
            </Badge>
          </Tooltip>
        ))}
      </div>
    )
  }

  return (
    <div style={{ padding: 12 }}>
      {documentRailItems.map((item) => (
        <Button
          key={item.key}
          type={documentTab === item.key ? 'primary' : 'text'}
          block
          onClick={() => navigate(`/document/file-list?tab=${item.key}&view=${documentView}`)}
          style={{ justifyContent: 'space-between', marginBottom: 6, height: 38 }}
        >
          <span>{item.label}</span>
          <Badge
            count={counts[item.key] || 0}
            size="small"
            showZero
            style={{
              backgroundColor: documentTab === item.key ? token.colorBgContainer : token.colorFillTertiary,
              color: documentTab === item.key ? token.colorPrimary : token.colorTextTertiary,
            }}
          />
        </Button>
      ))}
    </div>
  )
}

export default DocumentRail
