import { useState } from 'react'
import { Form, message } from 'antd'
import { createPatient, updatePatient } from '../../../api/patient'

const buildPatientPayload = ({ values, isEditing }) => {
  const payload = {
    name: values.name,
    gender: values.gender,
    age: Number(values.age),
    id_card: values.idCard || '',
    phone: values.phone || '',
    address: values.address || '',
    diagnosis: values.diagnosis || [],
    attending_doctor_name: values.doctor || ''
  }

  if (values.department) {
    payload.department_id = values.department
  } else if (!isEditing) {
    payload.department_id = ''
  }

  return payload
}

const usePatientEditor = ({
  fetchPatients,
  emitPatientRailRefresh,
}) => {
  const [form] = Form.useForm()
  const [open, setOpen] = useState(false)
  const [editingPatientId, setEditingPatientId] = useState('')
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const isEditing = !!editingPatientId

  const close = () => {
    setOpen(false)
    setStep(0)
    setEditingPatientId('')
    form.resetFields()
  }

  const goPrev = () => {
    setStep(prev => prev - 1)
  }

  const handleSubmit = async () => {
    if (step === 0) {
      const requiredFields = isEditing ? ['name', 'gender', 'age'] : ['name', 'gender', 'age', 'department']
      form.validateFields(requiredFields).then(() => {
        setStep(1)
      }).catch(() => {
        message.error('请完善必填信息')
      })
      return
    }

    if (step === 1) {
      setStep(2)
      return
    }

    if (step !== 2) return

    try {
      const values = form.getFieldsValue(true)
      setLoading(true)

      const requestData = buildPatientPayload({ values, isEditing })
      console.log('创建患者请求数据:', requestData)

      const response = isEditing
        ? await updatePatient(editingPatientId, requestData)
        : await createPatient(requestData)

      if (response.success && response.code === 0) {
        message.success(isEditing ? '患者信息已更新' : '患者信息已成功添加')
        close()
        await fetchPatients()
        emitPatientRailRefresh()
      }
    } catch (error) {
      console.error(isEditing ? '更新患者失败:' : '创建患者失败:', error)
    } finally {
      setLoading(false)
    }
  }

  return {
    form,
    open,
    isEditing,
    step,
    loading,
    setOpen,
    setEditingPatientId,
    close,
    goPrev,
    handleSubmit,
  }
}

export default usePatientEditor
