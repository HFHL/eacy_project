import React from 'react'
import { Col, Row, Tooltip, Typography } from 'antd'
import { CheckCircleOutlined, ExperimentOutlined, InfoCircleOutlined, TeamOutlined } from '@ant-design/icons'

const { Text } = Typography

const StatTile = ({ background, icon, label, tooltip, token, children }) => (
  <div style={{ background, borderRadius: 8, padding: '10px 12px', minHeight: 72 }}>
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
      {icon}
      <Text style={{ color: token.colorTextSecondary, fontSize: 12 }}>{label}</Text>
      <Tooltip title={tooltip}>
        <InfoCircleOutlined style={{ fontSize: 12, color: token.colorTextSecondary, marginLeft: 6 }} />
      </Tooltip>
    </div>
    {children}
  </div>
)

const ProjectOverviewStats = ({ collapsed, projectInfo, patientDataset, token }) => {
  if (collapsed) return null

  const extractedCount = patientDataset ? patientDataset.filter(patient => patient.overallCompleteness > 0).length : 0

  return (
    <div style={{ marginBottom: 16 }}>
      <Row gutter={[10, 10]}>
        <Col xs={24} sm={8}>
          <StatTile
            background={token.colorPrimaryBg}
            label="患者统计"
            token={token}
            tooltip={projectInfo.expectedPatients ? `实际入组人数 / 当前入组总数；预期患者 ${projectInfo.expectedPatients}` : '实际入组人数 / 当前入组总数'}
            icon={<TeamOutlined style={{ fontSize: 16, marginRight: 6, color: token.colorPrimary }} />}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: token.colorText, lineHeight: 1.2 }}>
              {projectInfo.extractedPatients}/{projectInfo.totalPatients}
            </div>
          </StatTile>
        </Col>
        <Col xs={24} sm={8}>
          <StatTile
            background={token.colorSuccessBg}
            label="数据完整度"
            token={token}
            tooltip="目标: 90% 以上"
            icon={<CheckCircleOutlined style={{ fontSize: 16, marginRight: 6, color: token.colorSuccess }} />}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: token.colorText, lineHeight: 1.2 }}>
              {projectInfo.completeness}%
            </div>
          </StatTile>
        </Col>
        <Col xs={24} sm={8}>
          <StatTile
            background={token.colorWarningBg}
            label="已抽取患者"
            token={token}
            tooltip="有抽取数据的患者数"
            icon={<ExperimentOutlined style={{ fontSize: 16, marginRight: 6, color: token.colorWarning }} />}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: token.colorText, lineHeight: 1.2 }}>
              {extractedCount}
              <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4 }}>/ {projectInfo.extractedPatients}</span>
            </div>
          </StatTile>
        </Col>
      </Row>
    </div>
  )
}

export default ProjectOverviewStats
