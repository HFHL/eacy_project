import { useCallback, useEffect, useRef } from 'react'

const SENSITIVE_MODIFIED_RESET = { phone: false, idCard: false, address: false }

export const usePatientEditIntent = ({
  form,
  handleEditPatient,
  loading,
  location,
  navigate,
  patientId,
  patientInfo,
  setEditModalVisible,
  setSensitiveModified,
}) => {
  const autoEditHandledRef = useRef(false)

  const openPatientEditModal = useCallback(() => {
    handleEditPatient(form)
    setSensitiveModified(SENSITIVE_MODIFIED_RESET)
    setEditModalVisible(true)
  }, [form, handleEditPatient, setEditModalVisible, setSensitiveModified])

  const consumeOpenPatientEditIntent = useCallback(() => {
    if (!location.state?.openPatientEdit) return

    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: {
        ...location.state,
        openPatientEdit: false,
      },
    })
  }, [location.pathname, location.search, location.state, navigate])

  useEffect(() => {
    autoEditHandledRef.current = false
  }, [patientId])

  useEffect(() => {
    if (!location.state?.openPatientEdit) return
    if (autoEditHandledRef.current) return
    if (loading) return
    if (!patientInfo?.id) return
    if (String(patientInfo.id) !== String(patientId || '')) return

    autoEditHandledRef.current = true
    consumeOpenPatientEditIntent()
    openPatientEditModal()
  }, [
    consumeOpenPatientEditIntent,
    loading,
    location.state,
    openPatientEditModal,
    patientId,
    patientInfo,
  ])

  return {
    openPatientEditModal,
  }
}
