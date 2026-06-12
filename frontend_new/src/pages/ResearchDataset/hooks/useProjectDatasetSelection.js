import { useCallback, useMemo, useState } from 'react'

export const useProjectDatasetSelection = (patientDataset = []) => {
  const [selectedPatients, setSelectedPatients] = useState([])

  const currentPagePatientIds = useMemo(() => {
    return (patientDataset || []).map(patient => patient?.patient_id).filter(Boolean)
  }, [patientDataset])

  const isAllCurrentPageSelected = useMemo(() => {
    return currentPagePatientIds.length > 0 && currentPagePatientIds.every(id => selectedPatients.includes(id))
  }, [currentPagePatientIds, selectedPatients])

  const isSomeCurrentPageSelected = useMemo(() => {
    return currentPagePatientIds.some(id => selectedPatients.includes(id)) && !isAllCurrentPageSelected
  }, [currentPagePatientIds, selectedPatients, isAllCurrentPageSelected])

  const toggleSelectAllCurrentPage = useCallback((checked) => {
    if (!currentPagePatientIds.length) return
    if (checked) {
      const merged = Array.from(new Set([...(selectedPatients || []), ...currentPagePatientIds]))
      setSelectedPatients(merged)
    } else {
      const rest = (selectedPatients || []).filter(id => !currentPagePatientIds.includes(id))
      setSelectedPatients(rest)
    }
  }, [currentPagePatientIds, selectedPatients])

  const toggleSelectPatient = useCallback((patientId, checked) => {
    if (!patientId) return
    setSelectedPatients((prev) => {
      if (checked) return Array.from(new Set([...(prev || []), patientId]))
      return (prev || []).filter((id) => id !== patientId)
    })
  }, [])

  return {
    isAllCurrentPageSelected,
    isSomeCurrentPageSelected,
    selectedPatients,
    setSelectedPatients,
    toggleSelectAllCurrentPage,
    toggleSelectPatient,
  }
}
