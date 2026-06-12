import React from 'react'
import { Alert, Table } from 'antd'

import { usePatientSelectionColumns } from './usePatientSelectionColumns'

export const PatientSelectStep = ({
  patientLoading,
  patientRowIds,
  patients,
  selectedPatientIdSet,
  togglePatientSelection,
  toggleSelectAllPatients,
}) => {
  const patientSelectionColumns = usePatientSelectionColumns({
    patientRowIds,
    selectedPatientIdSet,
    togglePatientSelection,
    toggleSelectAllPatients,
  })

  return (
    <div>
      <Alert
        message="选择入组患者"
        description="可在创建时直接选择患者入组，也可以创建后再到项目内添加。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <Table
        rowKey={(record) => String(record.id)}
        loading={patientLoading}
        dataSource={patients}
        columns={patientSelectionColumns}
        size="small"
        pagination={{ pageSize: 8 }}
        onRow={(record) => ({
          onClick: (event) => {
            const target = event?.target
            if (
              target instanceof Element
              && (
                target.closest('.project-patient-select-checkbox-input')
                || target.closest('.project-patient-select-control')
                || target.closest('.project-patient-select-cell')
                || target.closest('.ant-checkbox-wrapper')
                || target.closest('.ant-checkbox')
                || target.closest('input[type="checkbox"]')
              )
            ) {
              return
            }
            togglePatientSelection(record?.id)
          },
          style: { cursor: 'pointer' },
        })}
      />
    </div>
  )
}
