import { useMemo } from 'react'
import { Typography } from 'antd'
import { CheckOutlined } from '@ant-design/icons'

import { appThemeToken } from '../../../styles/themeTokens'
import { normalizePatientId } from './projectCreateWizardUtils'

const { Text } = Typography

const patientColumns = [
  { title: '患者姓名', dataIndex: 'name', key: 'name' },
  { title: '性别', dataIndex: 'gender', key: 'gender', width: 80 },
  { title: '年龄', dataIndex: 'age', key: 'age', width: 80 },
  {
    title: '诊断',
    dataIndex: 'diagnosis',
    key: 'diagnosis',
    render: (value) => <Text type="secondary">{value || '-'}</Text>,
  },
  {
    title: '完整度',
    dataIndex: 'completeness',
    key: 'completeness',
    width: 100,
    render: (value) => `${Math.round(Number(value || 0))}%`,
  },
]

const createIndicatorStyles = () => {
  const baseIndicatorStyle = {
    width: 16,
    height: 16,
    borderRadius: 4,
    border: `1px solid ${appThemeToken.colorBorder}`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    background: appThemeToken.colorBgContainer,
    color: appThemeToken.colorBgContainer,
    fontSize: 12,
    lineHeight: 1,
    userSelect: 'none',
  }

  return {
    baseIndicatorStyle,
    checkedIndicatorStyle: {
      ...baseIndicatorStyle,
      borderColor: appThemeToken.colorPrimary,
      background: appThemeToken.colorPrimary,
      color: appThemeToken.colorBgContainer,
    },
    indeterminateIndicatorStyle: {
      ...baseIndicatorStyle,
      borderColor: appThemeToken.colorPrimary,
      background: appThemeToken.colorPrimaryBg,
      color: appThemeToken.colorPrimary,
      fontWeight: 700,
    },
  }
}

export const usePatientSelectionColumns = ({
  patientRowIds,
  selectedPatientIdSet,
  togglePatientSelection,
  toggleSelectAllPatients,
}) => {
  const selectedCurrentPageCount = useMemo(() => (
    patientRowIds.filter((id) => selectedPatientIdSet.has(id)).length
  ), [patientRowIds, selectedPatientIdSet])

  const isAllPatientsSelected = useMemo(() => (
    patientRowIds.length > 0 && selectedCurrentPageCount === patientRowIds.length
  ), [patientRowIds.length, selectedCurrentPageCount])

  const isPatientSelectionIndeterminate = useMemo(() => (
    selectedCurrentPageCount > 0 && selectedCurrentPageCount < patientRowIds.length
  ), [patientRowIds.length, selectedCurrentPageCount])

  return useMemo(() => {
    const {
      baseIndicatorStyle,
      checkedIndicatorStyle,
      indeterminateIndicatorStyle,
    } = createIndicatorStyles()

    const headerControl = isPatientSelectionIndeterminate ? (
      <span
        className="project-patient-select-control"
        role="checkbox"
        aria-checked="mixed"
        tabIndex={0}
        style={indeterminateIndicatorStyle}
        onClick={(event) => {
          event.stopPropagation()
          toggleSelectAllPatients(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            toggleSelectAllPatients(true)
          }
        }}
      >
        -
      </span>
    ) : (
      <span
        className="project-patient-select-control"
        role="checkbox"
        aria-checked={isAllPatientsSelected}
        tabIndex={0}
        style={isAllPatientsSelected ? checkedIndicatorStyle : baseIndicatorStyle}
        onClick={(event) => {
          event.stopPropagation()
          toggleSelectAllPatients(!isAllPatientsSelected)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            toggleSelectAllPatients(!isAllPatientsSelected)
          }
        }}
      >
        {isAllPatientsSelected ? <CheckOutlined /> : null}
      </span>
    )

    return [
      {
        title: headerControl,
        dataIndex: '__selection__',
        key: '__selection__',
        width: 56,
        className: 'project-patient-select-cell',
        render: (_, record) => {
          const checked = selectedPatientIdSet.has(normalizePatientId(record?.id))
          return (
            <span
              className="project-patient-select-control"
              role="checkbox"
              aria-checked={checked}
              tabIndex={0}
              style={checked ? checkedIndicatorStyle : baseIndicatorStyle}
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  togglePatientSelection(record?.id)
                }
              }}
              onDoubleClick={(event) => event.stopPropagation()}
              onMouseUp={(event) => event.stopPropagation()}
              onPointerUp={(event) => {
                event.stopPropagation()
                togglePatientSelection(record?.id)
              }}
            >
              {checked ? <CheckOutlined /> : null}
            </span>
          )
        },
      },
      ...patientColumns,
    ]
  }, [
    isAllPatientsSelected,
    isPatientSelectionIndeterminate,
    selectedPatientIdSet,
    togglePatientSelection,
    toggleSelectAllPatients,
  ])
}
