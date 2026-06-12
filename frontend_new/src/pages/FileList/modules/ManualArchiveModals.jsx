import React from 'react'
import { Alert, Input, List, Modal, Typography } from 'antd'
import { CheckCircleOutlined } from '@ant-design/icons'
import { maskName } from '../../../utils/sensitiveUtils'
import { modalBodyPreset, modalWidthPreset } from '../../../styles/themeTokens'

const { Text } = Typography

export const ManualArchiveModals = ({
  batchManualArchiveVisible,
  batchPatientSearchLoading,
  batchPatientSearchResults,
  batchPatientSearchValue,
  batchProcessing,
  groupManualArchiveVisible,
  groupPatientSearchLoading,
  groupPatientSearchResults,
  groupPatientSearchValue,
  handleBatchPatientSearch,
  handleConfirmBatchManualArchive,
  handleConfirmGroupManualArchive,
  handleGroupPatientSearch,
  selectedBatchPatient,
  selectedGroupPatient,
  setBatchManualArchiveVisible,
  setGroupManualArchiveVisible,
  setSelectedBatchPatient,
  setSelectedGroupPatient,
  token,
}) => (
  <>
    <Modal
      title="手动选择（按组）"
      open={groupManualArchiveVisible}
      onCancel={() => setGroupManualArchiveVisible(false)}
      onOk={handleConfirmGroupManualArchive}
      okButtonProps={{ disabled: !selectedGroupPatient?.id }}
      width={modalWidthPreset.standard}
      styles={modalBodyPreset}
      centered
    >
      <Alert type="info" showIcon message="将把该分组下所有文档归档到你选择的患者" style={{ marginBottom: 12 }} />
      <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
        可直接在下方列表中点选；也可输入关键词筛选
      </Text>
      <Input.Search
        placeholder="输入姓名以筛选（不输入则显示最近更新的患者）"
        value={groupPatientSearchValue}
        onChange={(e) => handleGroupPatientSearch(e.target.value)}
        loading={groupPatientSearchLoading}
        allowClear
      />
      <div style={{ marginTop: 12, maxHeight: 320, overflow: 'auto', border: `1px solid ${token.colorBorder}`, borderRadius: 6 }}>
        <List
          size="small"
          dataSource={groupPatientSearchResults}
          locale={{
            emptyText: groupPatientSearchLoading ? '加载中…' : (groupPatientSearchValue.trim() ? '未找到匹配的患者' : '暂无可选患者'),
          }}
          renderItem={(p) => (
            <List.Item
              style={{ cursor: 'pointer', background: selectedGroupPatient?.id === p.id ? token.colorPrimaryBg : token.colorBgContainer }}
              onClick={() => setSelectedGroupPatient(p)}
            >
              <List.Item.Meta title={p.name ? maskName(p.name) : '-'} description={`${p.gender || '--'} | ${p.age ? p.age + '岁' : '--'} | ${p.patient_code || '--'}`} />
              {selectedGroupPatient?.id === p.id && <CheckCircleOutlined style={{ color: token.colorPrimary }} />}
            </List.Item>
          )}
        />
      </div>
    </Modal>

    <Modal
      title="手动选择（批量）"
      open={batchManualArchiveVisible}
      onCancel={() => setBatchManualArchiveVisible(false)}
      onOk={handleConfirmBatchManualArchive}
      okButtonProps={{ disabled: !selectedBatchPatient?.id }}
      confirmLoading={batchProcessing}
      width={modalWidthPreset.standard}
      styles={modalBodyPreset}
      centered
    >
      <Alert type="info" showIcon message="将把你选中的所有文档归档到你选择的患者" style={{ marginBottom: 12 }} />
      <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
        可直接在下方列表中点选；也可输入关键词筛选
      </Text>
      <Input.Search
        placeholder="输入姓名以筛选（不输入则显示最近更新的患者）"
        value={batchPatientSearchValue}
        onChange={(e) => handleBatchPatientSearch(e.target.value)}
        loading={batchPatientSearchLoading}
        allowClear
      />
      <div style={{ marginTop: 12, maxHeight: 320, overflow: 'auto', border: `1px solid ${token.colorBorder}`, borderRadius: 6 }}>
        <List
          size="small"
          dataSource={batchPatientSearchResults}
          locale={{
            emptyText: batchPatientSearchLoading ? '加载中…' : (batchPatientSearchValue.trim() ? '未找到匹配的患者' : '暂无可选患者'),
          }}
          renderItem={(p) => (
            <List.Item
              style={{ cursor: 'pointer', background: selectedBatchPatient?.id === p.id ? token.colorPrimaryBg : token.colorBgContainer }}
              onClick={() => setSelectedBatchPatient(p)}
            >
              <List.Item.Meta title={p.name ? maskName(p.name) : '-'} description={`${p.gender || '--'} | ${p.age ? p.age + '岁' : '--'} | ${p.patient_code || '--'}`} />
              {selectedBatchPatient?.id === p.id && <CheckCircleOutlined style={{ color: token.colorPrimary }} />}
            </List.Item>
          )}
        />
      </div>
    </Modal>
  </>
)
