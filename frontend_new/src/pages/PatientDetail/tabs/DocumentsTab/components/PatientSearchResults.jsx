import React from 'react'
import { Avatar, List, Space, Typography } from 'antd'
import { LoadingOutlined, TeamOutlined } from '@ant-design/icons'
import { appThemeToken } from '../../../../../styles/themeTokens'

const { Text } = Typography

const PatientSearchResults = ({
  loading,
  onSelectPatient,
  results,
  searchValue,
  visible,
}) => {
  if (!visible) return null

  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        zIndex: 1000,
        background: appThemeToken.colorBgContainer,
        border: `1px solid ${appThemeToken.colorBorder}`,
        borderRadius: '4px',
        marginTop: 4,
        maxHeight: '300px',
        overflowY: 'auto',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}
    >
      {loading ? (
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <LoadingOutlined /> 搜索中...
        </div>
      ) : results.length > 0 ? (
        <List
          size="small"
          dataSource={results}
          renderItem={patient => (
            <List.Item
              style={{ cursor: 'pointer', padding: '8px 12px' }}
              onClick={() => onSelectPatient(patient)}
              onMouseEnter={(event) => { event.currentTarget.style.background = appThemeToken.colorFillTertiary }}
              onMouseLeave={(event) => { event.currentTarget.style.background = appThemeToken.colorBgContainer }}
            >
              <List.Item.Meta
                avatar={<Avatar icon={<TeamOutlined />} />}
                title={
                  <Space>
                    <Text strong>{patient.name}</Text>
                    {patient.patient_code && <Text type="secondary" style={{ fontSize: 12 }}>({patient.patient_code})</Text>}
                  </Space>
                }
                description={
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {patient.gender && `${patient.gender} `}
                    {patient.age && `${patient.age}岁`}
                  </Text>
                }
              />
            </List.Item>
          )}
        />
      ) : searchValue.trim() ? (
        <div style={{ padding: '16px', textAlign: 'center', color: appThemeToken.colorTextTertiary }}>
          未找到匹配的患者
        </div>
      ) : null}
    </div>
  )
}

export default PatientSearchResults
