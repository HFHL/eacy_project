/**
 * @file 项目详情页 V2 ViewModel Hook。
 */

import { useMemo } from 'react'

import { buildProjectDatasetViewModel } from './projectDatasetViewModel/buildProjectDatasetViewModel'

export const useProjectDatasetViewModel = (params) => {
  const {
    projectData = null,
    patientDataset = [],
    templateFieldGroups = [],
    templateFieldMapping = {},
    templateSchemaJson = null,
    selectedPatients = [],
    activeGroupKey = null,
  } = params || {}

  return useMemo(() => buildProjectDatasetViewModel({
    activeGroupKey,
    patientDataset,
    projectData,
    selectedPatients,
    templateFieldGroups,
    templateFieldMapping,
    templateSchemaJson,
  }), [
    activeGroupKey,
    patientDataset,
    projectData,
    selectedPatients,
    templateFieldGroups,
    templateFieldMapping,
    templateSchemaJson,
  ])
}
