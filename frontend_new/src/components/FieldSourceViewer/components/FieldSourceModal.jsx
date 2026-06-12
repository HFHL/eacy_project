import React, { useEffect, useState } from 'react'
import { Modal, Space, Tabs } from 'antd'
import {
  FileImageOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  LinkOutlined,
} from '@ant-design/icons'

import { getCrfFieldEvidence } from '../../../api/project'
import { buildFieldTraceContext } from '../utils/fieldSourceTrace'
import { EvidenceDocumentViewer } from './EvidenceDocumentViewer'
import { FieldHistoryTab } from './FieldHistoryTab'
import { SourceInfoTab } from './SourceInfoTab'

export const FieldSourceModal = ({
  visible,
  onClose,
  fieldName,
  fieldValue,
  fieldData,
  audit,
  documents,
  changeLogs,
  projectId,
  projectPatientId,
  fieldPath,
}) => {
  const [activeTab, setActiveTab] = useState('info')
  const [evidences, setEvidences] = useState([])
  const [evidenceLoading, setEvidenceLoading] = useState(false)

  useEffect(() => {
    if (!visible || !projectId || !projectPatientId || !fieldPath) {
      setEvidences([])
      return undefined
    }

    let cancelled = false
    setEvidenceLoading(true)
    getCrfFieldEvidence(projectId, projectPatientId, fieldPath)
      .then((res) => {
        if (cancelled) return
        setEvidences(res?.success && Array.isArray(res.data) ? res.data : [])
      })
      .catch((error) => {
        console.error('加载字段证据失败:', error)
        if (!cancelled) setEvidences([])
      })
      .finally(() => {
        if (!cancelled) setEvidenceLoading(false)
      })

    return () => { cancelled = true }
  }, [visible, projectId, projectPatientId, fieldPath])

  const {
    displayFieldName,
    docId,
    docInfo,
    fieldAudit,
    traceLevel,
  } = buildFieldTraceContext({
    audit,
    documents,
    fieldData,
    fieldName,
  })

  const tabItems = [
    {
      key: 'info',
      label: (
        <Space>
          <FileTextOutlined />
          来源信息
        </Space>
      ),
      children: (
        <SourceInfoTab
          displayFieldName={displayFieldName}
          docId={docId}
          docInfo={docInfo}
          fieldAudit={fieldAudit}
          fieldValue={fieldValue}
          traceLevel={traceLevel}
        />
      ),
    },
    {
      key: 'preview',
      label: (
        <Space>
          <FileImageOutlined />
          文档定位
        </Space>
      ),
      disabled: !evidenceLoading && evidences.length === 0,
      children: (
        <EvidenceDocumentViewer
          evidences={evidences}
          loading={evidenceLoading}
        />
      ),
    },
    {
      key: 'history',
      label: (
        <Space>
          <InfoCircleOutlined />
          操作历史
        </Space>
      ),
      children: (
        <FieldHistoryTab
          audit={audit}
          changeLogs={changeLogs}
          displayFieldName={displayFieldName}
          fieldName={fieldName}
        />
      ),
    },
  ]

  return (
    <Modal
      title={(
        <Space>
          <LinkOutlined />
          字段来源追踪 - {displayFieldName}
        </Space>
      )}
      open={visible}
      onCancel={onClose}
      footer={null}
      width="85vw"
      style={{ top: 24, maxWidth: 1400 }}
      styles={{ body: { padding: '12px 24px', maxHeight: 'calc(95vh - 110px)', overflow: 'auto' } }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
      />
    </Modal>
  )
}
