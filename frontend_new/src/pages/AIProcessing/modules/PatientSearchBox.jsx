import React from 'react'
import { Input, Typography } from 'antd'
import { SearchOutlined } from '@ant-design/icons'

const { Text } = Typography

const PatientSearchBox = ({
  selectedPatient,
  value,
  loading,
  results,
  showResults,
  onSearchChange,
  onFocus,
  onBlur,
  onClear,
  onSelectPatient,
}) => {
  const placeholder = selectedPatient
    ? `${selectedPatient.gender || ''} ${selectedPatient.age ? `${selectedPatient.age}岁` : ''}`
    : '搜索患者姓名、ID或诊断'

  return (
    <div style={{ position: 'relative' }}>
      <Input
        placeholder={placeholder}
        size="small"
        prefix={<SearchOutlined style={{ color: '#999', fontSize: 13 }} />}
        value={value}
        onChange={(event) => onSearchChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        style={{ fontSize: 13 }}
        allowClear
        onClear={onClear}
      />

      {showResults && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#fff',
          border: '1px solid #d9d9d9',
          borderRadius: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          maxHeight: 200,
          overflowY: 'auto',
          zIndex: 1000,
          marginTop: 4
        }}>
          {loading ? (
            <div style={{ padding: '10px 12px', textAlign: 'center' }}>
              <Text style={{ fontSize: 13, color: '#999' }}>搜索中...</Text>
            </div>
          ) : results.length > 0 ? (
            results.map(patient => (
              <div
                key={patient.id}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f0f0f0',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = '#f5f5f5'
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = '#fff'
                }}
                onMouseDown={() => onSelectPatient(patient)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Text strong style={{ fontSize: 13, color: '#1677ff' }}>
                    {patient.patient_code || patient.patientCode}
                  </Text>
                  <Text style={{ fontSize: 13 }}>{patient.name}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {patient.gender} {patient.age}岁
                  </Text>
                </div>
                {patient.diagnosis && patient.diagnosis.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      诊断: {patient.diagnosis.slice(0, 2).join('、')}
                      {patient.diagnosis.length > 2 && '...'}
                    </Text>
                  </div>
                )}
              </div>
            ))
          ) : value ? (
            <div style={{ padding: '10px 12px', textAlign: 'center' }}>
              <Text style={{ fontSize: 13, color: '#999' }}>未找到匹配的患者</Text>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default PatientSearchBox
