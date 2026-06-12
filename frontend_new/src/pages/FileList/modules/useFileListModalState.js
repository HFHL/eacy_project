import { useRef, useState } from 'react'

export const useFileListModalState = () => {
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false)
  const [autoArchivingGroupIds, setAutoArchivingGroupIds] = useState(new Set())

  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState(null)
  const detailModalRef = useRef(null)

  const [createPatientDrawerOpen, setCreatePatientDrawerOpen] = useState(false)
  const [createPatientDocIds, setCreatePatientDocIds] = useState([])
  const [createPatientMode, setCreatePatientMode] = useState('docs')
  const [createPatientGroupId, setCreatePatientGroupId] = useState(null)
  const [createPatientPrefillValues, setCreatePatientPrefillValues] = useState(null)

  const [patientMatchVisible, setPatientMatchVisible] = useState(false)
  const [selectedMatchDocument, setSelectedMatchDocument] = useState(null)
  const [matchModalMode, setMatchModalMode] = useState('change')
  const [patientSearchValue, setPatientSearchValue] = useState('')
  const [patientSearchResults, setPatientSearchResults] = useState([])
  const [patientSearchLoading, setPatientSearchLoading] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [selectedMatchPatient, setSelectedMatchPatient] = useState(null)
  const [archivingLoading, setArchivingLoading] = useState(false)
  const [matchInfoLoading, setMatchInfoLoading] = useState(false)

  const [groupManualArchiveVisible, setGroupManualArchiveVisible] = useState(false)
  const [groupManualArchiveGroupId, setGroupManualArchiveGroupId] = useState(null)
  const [groupPatientSearchValue, setGroupPatientSearchValue] = useState('')
  const [groupPatientSearchResults, setGroupPatientSearchResults] = useState([])
  const [groupPatientSearchLoading, setGroupPatientSearchLoading] = useState(false)
  const [selectedGroupPatient, setSelectedGroupPatient] = useState(null)

  return {
    archivingLoading,
    autoArchivingGroupIds,
    batchDeleteLoading,
    createPatientDocIds,
    createPatientDrawerOpen,
    createPatientGroupId,
    createPatientMode,
    createPatientPrefillValues,
    detailModalRef,
    detailModalVisible,
    groupManualArchiveGroupId,
    groupManualArchiveVisible,
    groupPatientSearchLoading,
    groupPatientSearchResults,
    groupPatientSearchValue,
    matchInfoLoading,
    matchModalMode,
    patientMatchVisible,
    patientSearchLoading,
    patientSearchResults,
    patientSearchValue,
    selectedDocument,
    selectedGroupPatient,
    selectedMatchDocument,
    selectedMatchPatient,
    setArchivingLoading,
    setAutoArchivingGroupIds,
    setBatchDeleteLoading,
    setCreatePatientDocIds,
    setCreatePatientDrawerOpen,
    setCreatePatientGroupId,
    setCreatePatientMode,
    setCreatePatientPrefillValues,
    setDetailModalVisible,
    setGroupManualArchiveGroupId,
    setGroupManualArchiveVisible,
    setGroupPatientSearchLoading,
    setGroupPatientSearchResults,
    setGroupPatientSearchValue,
    setMatchInfoLoading,
    setMatchModalMode,
    setPatientMatchVisible,
    setPatientSearchLoading,
    setPatientSearchResults,
    setPatientSearchValue,
    setSelectedDocument,
    setSelectedGroupPatient,
    setSelectedMatchDocument,
    setSelectedMatchPatient,
    setShowSearchResults,
    showSearchResults,
  }
}
