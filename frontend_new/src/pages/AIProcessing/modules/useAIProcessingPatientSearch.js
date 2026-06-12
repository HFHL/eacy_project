import { useEffect, useRef, useState } from 'react'
import { getPatientList } from '../../../api/patient'

export const useAIProcessingPatientSearch = () => {
  const [patientSearchValue, setPatientSearchValue] = useState('')
  const [patientSearchResults, setPatientSearchResults] = useState([])
  const [patientSearchLoading, setPatientSearchLoading] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [selectedMatchPatient, setSelectedMatchPatient] = useState(null)
  const searchTimerRef = useRef(null)
  const searchVersionRef = useRef(0)

  const handlePatientSearch = (value) => {
    setPatientSearchValue(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchVersionRef.current += 1
    const currentVersion = searchVersionRef.current

    if (!value || value.trim().length < 1) {
      setShowSearchResults(false)
      setPatientSearchResults([])
      setPatientSearchLoading(false)
      return
    }

    setPatientSearchLoading(true)
    setShowSearchResults(true)
    setPatientSearchResults([])
    searchTimerRef.current = setTimeout(async () => {
      try {
        const response = await getPatientList({
          page: 1,
          page_size: 10,
          search: value.trim(),
        })
        if (currentVersion === searchVersionRef.current) {
          setPatientSearchResults(response.success && response.data ? response.data : [])
          setPatientSearchLoading(false)
        }
      } catch (error) {
        console.error('搜索患者失败:', error)
        if (currentVersion === searchVersionRef.current) {
          setPatientSearchResults([])
          setPatientSearchLoading(false)
        }
      }
    }, 500)
  }

  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
  }, [])

  const handleSelectSearchPatient = (patient) => {
    setSelectedMatchPatient(patient)
    setPatientSearchValue(patient.name)
    setShowSearchResults(false)
  }

  return {
    handlePatientSearch,
    handleSelectSearchPatient,
    patientSearchLoading,
    patientSearchResults,
    patientSearchValue,
    selectedMatchPatient,
    setPatientSearchResults,
    setPatientSearchValue,
    setSelectedMatchPatient,
    setShowSearchResults,
    showSearchResults,
  }
}
