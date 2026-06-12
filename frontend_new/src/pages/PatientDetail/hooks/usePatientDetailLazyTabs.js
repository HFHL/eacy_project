import { useEffect, useRef } from 'react'

export const usePatientDetailLazyTabs = ({
  activeTab,
  fetchAiSummary,
  fetchPatientDocuments,
  patientId,
}) => {
  const documentsTabLoadedRef = useRef(false)
  const aiSummaryTabLoadedRef = useRef(false)

  useEffect(() => {
    documentsTabLoadedRef.current = false
    aiSummaryTabLoadedRef.current = false
  }, [patientId])

  useEffect(() => {
    if (!patientId || activeTab !== 'documents') return
    if (documentsTabLoadedRef.current) return

    documentsTabLoadedRef.current = true
    fetchPatientDocuments()
  }, [patientId, activeTab, fetchPatientDocuments])

  useEffect(() => {
    if (!patientId || activeTab !== 'ai-summary') return
    if (aiSummaryTabLoadedRef.current) return

    aiSummaryTabLoadedRef.current = true
    fetchAiSummary()
  }, [patientId, activeTab, fetchAiSummary])

  return {
    documentsTabLoadedRef,
  }
}
