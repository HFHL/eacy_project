/**
 * 时间线Tab组件
 * 显示患者相关事件的时间线
 */
import React from 'react'
import { Timeline, Typography } from 'antd'

const { Text } = Typography

const TimelineTab = () => {
  return (
    <Timeline
      items={[
        {
          color: 'green',
          children: (
            <div>
              <Text strong>患者档案创建</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                2024-01-08 | 系统自动创建
              </Text>
            </div>
          )
        },
        {
          color: 'blue',
          children: (
            <div>
              <Text strong>上传用药记录</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                2024-01-08 | 用药记录.xlsx
              </Text>
            </div>
          )
        },
        {
          color: 'blue',
          children: (
            <div>
              <Text strong>上传病理报告</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                2024-01-10 | 病理报告_20240110.pdf
              </Text>
            </div>
          )
        },
        {
          color: 'blue',
          children: (
            <div>
              <Text strong>上传CT影像</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                2024-01-12 | CT影像_20240112.jpg
              </Text>
            </div>
          )
        },
        {
          color: 'green',
          children: (
            <div>
              <Text strong>上传血常规报告</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                2024-01-15 | 血常规报告_20240115.pdf
              </Text>
            </div>
          )
        }
      ]}
    />
  )
}

export default TimelineTab