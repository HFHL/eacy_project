import React, { useState } from 'react'
import { Space, Tooltip, Typography } from 'antd'

import { appThemeToken } from '../../../styles/themeTokens'
import { formatDisplayValue } from '../utils/fieldSourceFormatters'
import { FieldSourceModal } from './FieldSourceModal'
import { SourceTag } from './SourceTag'

const { Text } = Typography

export const ClickableFieldValue = ({
  fieldName,
  fieldValue,
  fieldData,
  audit,
  documents,
  changeLogs,
  showSourceTag = true,
  projectId,
  projectPatientId,
  fieldPath,
}) => {
  const [modalVisible, setModalVisible] = useState(false)

  const fieldAudit = audit?.fields?.[fieldName] || {}
  const hasAudit = fieldAudit.document_id || fieldAudit.raw || fieldAudit.document_type
  const source = fieldData?.source || (hasAudit ? 'from_document' : null)
  const documentType = fieldAudit.document_type || fieldData?.document_type
  const displayValue = formatDisplayValue(fieldValue)

  const handleClick = () => {
    setModalVisible(true)
  }

  return (
    <>
      <Space size={4} wrap>
        <Tooltip title="点击查看来源详情">
          <Text
            style={{ cursor: 'pointer', color: appThemeToken.colorPrimary }}
            onClick={handleClick}
          >
            {displayValue}
          </Text>
        </Tooltip>
        {showSourceTag && source && (
          <SourceTag
            source={source}
            documentType={documentType}
            onClick={handleClick}
          />
        )}
      </Space>

      <FieldSourceModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        fieldName={fieldName}
        fieldValue={fieldValue}
        fieldData={fieldData}
        audit={audit}
        documents={documents}
        changeLogs={changeLogs}
        projectId={projectId}
        projectPatientId={projectPatientId}
        fieldPath={fieldPath}
      />
    </>
  )
}
