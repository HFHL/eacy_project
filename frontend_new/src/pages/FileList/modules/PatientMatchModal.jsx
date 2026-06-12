import React from 'react'
import {
  Button,
  Descriptions,
  Input,
  List,
  Modal,
  Spin,
  Typography,
} from 'antd'
import { maskName } from '../../../utils/sensitiveUtils'
import { modalBodyPreset, modalWidthPreset } from '../../../styles/themeTokens'
import { formatMatchScorePercent } from './formatters'

const { Text } = Typography

export const PatientMatchModal = ({
  archivingLoading,
  handleConfirmMatch,
  handleConfirmPatientMatch,
  handlePatientSearch,
  matchInfoLoading,
  matchModalMode,
  patientMatchVisible,
  patientSearchLoading,
  patientSearchResults,
  patientSearchValue,
  selectedMatchDocument,
  selectedMatchPatient,
  setPatientMatchVisible,
  setPatientSearchValue,
  setSelectedMatchDocument,
  setSelectedMatchPatient,
  setShowSearchResults,
  showSearchResults,
  token,
}) => (
  <Modal
    title={matchModalMode === 'archive' ? '手动选择' : '更换归档患者'}
    open={patientMatchVisible}
    onCancel={() => { setPatientMatchVisible(false); setSelectedMatchDocument(null) }}
    footer={null}
    width={modalWidthPreset.standard}
    styles={modalBodyPreset}
    centered
    zIndex={1400}
  >
    {matchInfoLoading ? (
      <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
    ) : selectedMatchDocument ? (
      <div>
        <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
          <Descriptions.Item label="文件名">{selectedMatchDocument.fileName}</Descriptions.Item>
          <Descriptions.Item label="类型">{selectedMatchDocument.documentSubType || selectedMatchDocument.documentType || '--'}</Descriptions.Item>
        </Descriptions>

        {selectedMatchDocument.candidates?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>AI 推荐候选：</Text>
            <List
              size="small"
              dataSource={selectedMatchDocument.candidates}
              renderItem={(c) => (
                <List.Item
                  style={{ cursor: 'pointer', background: selectedMatchPatient?.id === c.id ? token.colorPrimaryBg : undefined }}
                  onClick={() => { setSelectedMatchPatient(c); setPatientSearchValue(c.name) }}
                  extra={
                    <Button
                      type="primary"
                      size="small"
                      onClick={(e) => { e.stopPropagation(); handleConfirmMatch(selectedMatchDocument.id, c.id) }}
                    >
                      选择
                    </Button>
                  }
                >
                  <List.Item.Meta
                    title={`${c.name || '未知'} ${c.gender || ''} ${c.age || ''}`}
                    description={`匹配度: ${formatMatchScorePercent(c.similarity || 0)}`}
                  />
                </List.Item>
              )}
            />
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>搜索患者：</Text>
          <Input.Search
            placeholder="输入姓名或编号搜索"
            value={patientSearchValue}
            onChange={(e) => handlePatientSearch(e.target.value)}
            loading={patientSearchLoading}
            allowClear
          />
        </div>

        {showSearchResults && (
          <List
            size="small"
            bordered
            style={{ maxHeight: 200, overflow: 'auto' }}
            dataSource={patientSearchResults}
            locale={{ emptyText: '未找到匹配的患者' }}
            renderItem={(p) => (
              <List.Item
                style={{ cursor: 'pointer', background: selectedMatchPatient?.id === p.id ? token.colorPrimaryBg : token.colorBgContainer }}
                onClick={() => { setSelectedMatchPatient(p); setPatientSearchValue(p.name); setShowSearchResults(false) }}
              >
                <List.Item.Meta title={p.name ? maskName(p.name) : '-'} description={`${p.gender || '--'} | ${p.age ? p.age + '岁' : '--'}`} />
              </List.Item>
            )}
          />
        )}

        {selectedMatchPatient && (
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <Button
              type="primary"
              loading={archivingLoading}
              onClick={handleConfirmPatientMatch}
            >
              确认{matchModalMode === 'archive' ? '归档' : '更换'}到：{selectedMatchPatient.name ? maskName(selectedMatchPatient.name) : '-'}
            </Button>
          </div>
        )}
      </div>
    ) : null}
  </Modal>
)
