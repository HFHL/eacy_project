import { useCallback, useMemo, useState } from 'react'
import { message } from 'antd'
import { createPatient } from '../../../api/patient'
import {
  getDepartmentIdByName,
  getFlatDepartmentNames,
  parseExcelFile,
  validatePatientData,
} from '../modules/batchImportUtils'

const buildCreatePatientPayload = (patient, departmentId) => ({
  name: patient.name,
  gender: patient.gender,
  age: parseInt(patient.age),
  phone: patient.phone || '',
  id_card: patient.idCard || '',
  address: patient.address || '',
  department_id: departmentId,
  attending_doctor_name: patient.doctor || '',
  diagnosis: patient.diagnosis ? patient.diagnosis.split(/[,，、;；]/).map(item => item.trim()).filter(Boolean) : []
})

const formatImportRow = (row, index, validation) => ({
  key: index,
  rowIndex: index + 1,
  excelRow: index + 2,
  name: row['患者姓名'] || '',
  gender: row['性别'] || '',
  age: row['年龄'] || '',
  idCard: row['身份证号'] || '',
  phone: row['联系电话'] || '',
  address: row['住址'] || '',
  department: row['科室'] || '',
  doctor: row['主治医师'] || '',
  diagnosis: row['主要诊断'] || '',
  icdCodes: row['ICD编码'] || '',
  medicalHistory: row['既往病史'] || '',
  allergyHistory: row['过敏史'] || '',
  currentMedication: row['当前用药'] || '',
  notes: row['备注'] || '',
  status: validation.hasError ? 'error' : 'success',
  errors: validation.errors,
  warnings: validation.warnings
})

const usePatientBatchImport = ({
  departmentTreeData,
  fetchPatients,
  emitPatientRailRefresh,
  onCloseModal,
}) => {
  const [batchImportStep, setBatchImportStep] = useState(0)
  const [importFileList, setImportFileList] = useState([])
  const [importData, setImportData] = useState([])
  const [selectedImportKeys, setSelectedImportKeys] = useState([])
  const [importLoading, setImportLoading] = useState(false)

  const closeBatchImportModal = useCallback(() => {
    onCloseModal()
    setImportLoading(false)
    setBatchImportStep(0)
    setImportFileList([])
    setImportData([])
  }, [onCloseModal])

  const goPrevBatchImportStep = useCallback(() => {
    setBatchImportStep(prev => Math.max(prev - 1, 0))
  }, [])

  const downloadTemplate = useCallback(() => {
    const link = document.createElement('a')
    link.href = '/resource/患者批量导入模版_v2.0.xlsx'
    link.download = '患者批量导入模版_v2.0.xlsx'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    message.success('模版下载成功')
  }, [])

  const handleBatchImport = useCallback(async () => {
    if (batchImportStep === 0) {
      setBatchImportStep(1)
      return
    }

    if (batchImportStep === 1) {
      if (importFileList.length === 0) {
        message.warning('请先选择Excel文件')
        return
      }

      if (importData.length > 0) {
        const validKeys = importData.filter(item => item.status === 'success').map(item => item.key)
        setSelectedImportKeys(validKeys)
        setBatchImportStep(2)
      } else {
        message.warning('请等待文件解析完成或重新选择文件')
      }
      return
    }

    if (batchImportStep !== 2) return

    const selectedPatients = importData.filter(item => selectedImportKeys.includes(item.key))
    if (selectedPatients.length === 0) {
      message.warning('请选择要导入的患者')
      return
    }

    setImportLoading(true)
    message.loading({ content: `正在创建患者 (0/${selectedPatients.length})...`, key: 'importing', duration: 0 })

    let successCount = 0
    let failCount = 0

    for (const patient of selectedPatients) {
      try {
        message.loading({
          content: `正在创建患者 (${successCount + failCount + 1}/${selectedPatients.length})...`,
          key: 'importing'
        })

        const departmentId = getDepartmentIdByName(patient.department, departmentTreeData)
        if (!departmentId) {
          throw new Error(`无法找到科室: ${patient.department}`)
        }

        const response = await createPatient(buildCreatePatientPayload(patient, departmentId))

        if (response.success && response.code === 0) {
          successCount += 1
          setImportData(prev => prev.map(item =>
            item.key === patient.key
              ? { ...item, createStatus: 'success', createMessage: '创建成功' }
              : item
          ))
        } else {
          throw new Error(response.message || '创建失败')
        }
      } catch (error) {
        failCount += 1
        setImportData(prev => prev.map(item =>
          item.key === patient.key
            ? { ...item, createStatus: 'error', createMessage: error.message || '创建失败' }
            : item
        ))
      }
    }

    setImportLoading(false)

    if (failCount === 0) {
      message.success({ content: `批量导入完成！成功创建 ${successCount} 名患者`, key: 'importing', duration: 3 })
      setTimeout(async () => {
        onCloseModal()
        setBatchImportStep(0)
        setImportFileList([])
        setImportData([])
        setSelectedImportKeys([])
        await fetchPatients()
        emitPatientRailRefresh()
      }, 2000)
    } else {
      message.warning({
        content: `批量导入完成：成功 ${successCount} 个，失败 ${failCount} 个`,
        key: 'importing',
        duration: 5
      })
    }
  }, [
    batchImportStep,
    departmentTreeData,
    emitPatientRailRefresh,
    fetchPatients,
    importData,
    importFileList,
    onCloseModal,
    selectedImportKeys,
  ])

  const handleFileChange = useCallback(async (file) => {
    try {
      message.loading({ content: '正在解析Excel文件...', key: 'parsing' })

      const rawData = await parseExcelFile(file)
      if (!rawData || rawData.length === 0) {
        message.error({ content: 'Excel文件中没有数据', key: 'parsing' })
        return
      }

      const validDepartments = getFlatDepartmentNames(departmentTreeData)
      const processedData = rawData.map((row, index) => {
        const validation = validatePatientData(row, index, validDepartments)
        return formatImportRow(row, index, validation)
      })

      setImportData(processedData)

      const validCount = processedData.filter(item => item.status === 'success').length
      const errorCount = processedData.filter(item => item.status === 'error').length

      if (errorCount === 0) {
        message.success({ content: `文件解析成功，共 ${processedData.length} 条数据`, key: 'parsing' })
      } else {
        message.warning({
          content: `文件解析完成：${validCount} 条有效，${errorCount} 条有错误`,
          key: 'parsing'
        })
      }

      setSelectedImportKeys(processedData.filter(item => item.status === 'success').map(item => item.key))
      setBatchImportStep(2)
    } catch (error) {
      console.error('文件处理错误:', error)
      message.error({ content: '文件解析失败，请检查文件格式', key: 'parsing' })
    }
  }, [departmentTreeData])

  const uploadProps = useMemo(() => ({
    name: 'file',
    multiple: false,
    accept: '.xlsx,.xls',
    fileList: importFileList,
    beforeUpload: (file) => {
      const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.type === 'application/vnd.ms-excel'
      if (!isExcel) {
        message.error('只能上传Excel文件')
        return false
      }

      if (file.size / 1024 / 1024 >= 10) {
        message.error('文件大小不能超过10MB')
        return false
      }

      handleFileChange(file)
      return false
    },
    onChange: (info) => {
      setImportFileList(info.fileList.slice(-1))
    },
    onRemove: () => {
      setImportFileList([])
      setImportData([])
      setBatchImportStep(1)
    }
  }), [handleFileChange, importFileList])

  return {
    batchImportStep,
    importLoading,
    importData,
    selectedImportKeys,
    uploadProps,
    setSelectedImportKeys,
    closeBatchImportModal,
    goPrevBatchImportStep,
    handleBatchImport,
    downloadTemplate,
  }
}

export default usePatientBatchImport
