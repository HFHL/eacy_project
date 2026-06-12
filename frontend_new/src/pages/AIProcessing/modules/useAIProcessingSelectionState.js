import { useState } from 'react'

export const useAIProcessingSelectionState = () => {
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [patientMatchVisible, setPatientMatchVisible] = useState(false)
  const [selectedDocs, setSelectedDocs] = useState([])
  const [selectedAutoDocs, setSelectedAutoDocs] = useState([])
  const [selectedNewPatientDocs, setSelectedNewPatientDocs] = useState([])
  const [processedDocs, setProcessedDocs] = useState([])
  const [archivingLoading, setArchivingLoading] = useState(false)

  return {
    archivingLoading,
    patientMatchVisible,
    processedDocs,
    selectedAutoDocs,
    selectedDocs,
    selectedDocument,
    selectedNewPatientDocs,
    setArchivingLoading,
    setPatientMatchVisible,
    setProcessedDocs,
    setSelectedAutoDocs,
    setSelectedDocs,
    setSelectedDocument,
    setSelectedNewPatientDocs,
  }
}
