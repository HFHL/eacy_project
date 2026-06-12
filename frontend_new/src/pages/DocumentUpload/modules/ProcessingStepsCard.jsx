import React from 'react'
import { Card, Steps } from 'antd'
import { CloudUploadOutlined, FolderOpenOutlined, PlayCircleOutlined } from '@ant-design/icons'

export const ProcessingStepsCard = ({ currentStep }) => (
  <Card size="small" style={{ marginBottom: 24 }}>
    <Steps
      current={currentStep}
      items={[
        {
          title: '选择文件',
          description: '添加需要处理的医疗文档',
          icon: <FolderOpenOutlined />,
        },
        {
          title: '上传文件',
          description: '将文件上传到云端',
          icon: <CloudUploadOutlined />,
        },
        {
          title: 'AI处理',
          description: '智能识别和分类文档',
          icon: <PlayCircleOutlined />,
        },
      ]}
    />
  </Card>
)
