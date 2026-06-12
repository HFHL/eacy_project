import { isRepeatableFormSchema } from '../../../../components/SchemaForm/schemaRenderKernel'
import {
  inferColumnNodeKindBySchema,
  resolveGroupSchemaBinding,
  resolveSchemaNodeByPath,
  resolveSchemaNodeByFieldPath,
} from '../../adapters/schemaKernelAdapter'
import { deriveFieldGroupsFromPatientCrfData } from './deriveFieldGroups'
import {
  buildFolderKey,
  parseGroupPath,
  resolveFieldLabel,
} from './groupPathUtils'
import { buildSecondLevelColumns } from './secondLevelColumns'

const buildColumn = ({ columnMeta, group, templateFieldMapping, templateSchemaJson }) => {
  const sourceFieldKeys = Array.isArray(columnMeta.sourceFieldKeys) ? columnMeta.sourceFieldKeys : []
  const schemaNodes = sourceFieldKeys.map((fieldPath) => {
    return resolveSchemaNodeByFieldPath(templateSchemaJson, group.group_name, fieldPath)
  })
  const schemaNode = schemaNodes.find(Boolean) || null
  const schemaNodeKind = inferColumnNodeKindBySchema(schemaNodes, sourceFieldKeys.length)
  return {
    schemaNode,
    schemaHints: {
      display: schemaNode?.['x-display'] || null,
      rowConstraint: schemaNode?.['x-row-constraint'] || null,
    },
    key: columnMeta.key,
    title: resolveFieldLabel(group.group_id, columnMeta.key, templateFieldMapping),
    sourceFieldKeys: columnMeta.sourceFieldKeys,
    nodeKind: schemaNodeKind,
    schemaNodeKind,
    legacyNodeKind: columnMeta.nodeKind,
    schemaResolved: Boolean(schemaNode),
  }
}

const buildSchemaShadowMetrics = (columns) => {
  const schemaResolvedColumnCount = columns.filter((column) => column.schemaResolved).length
  const nodeKindMismatchCount = columns.filter((column) => column.legacyNodeKind !== column.schemaNodeKind).length
  return {
    totalColumns: columns.length,
    schemaResolvedColumns: schemaResolvedColumnCount,
    schemaResolvedRate: columns.length > 0 ? Number((schemaResolvedColumnCount / columns.length).toFixed(4)) : 0,
    nodeKindMismatchCount,
    nodeKindMismatchRate: columns.length > 0 ? Number((nodeKindMismatchCount / columns.length).toFixed(4)) : 0,
  }
}

const buildSortedGroups = ({ effectiveFieldGroups, templateFieldMapping, templateSchemaJson }) => {
  return [...effectiveFieldGroups]
    .filter((group) => group && group.group_id)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .map((group) => {
      const parsedPath = parseGroupPath(group.group_name)
      const folderKey = buildFolderKey(parsedPath.folderName)
      const schemaBinding = resolveGroupSchemaBinding(templateSchemaJson, group.group_name, group.db_fields || [])
      const groupSchemaNode = schemaBinding.groupSchemaNode || resolveSchemaNodeByPath(templateSchemaJson, group.group_name)
      const columns = buildSecondLevelColumns(group.group_name, group.db_fields || []).map((columnMeta) => (
        buildColumn({ columnMeta, group, templateFieldMapping, templateSchemaJson })
      ))

      return {
        ...group,
        folderKey,
        folderName: parsedPath.folderName,
        groupShortName: parsedPath.groupName,
        groupSchemaNode,
        groupPathTokens: schemaBinding.groupPathTokens,
        groupPath: schemaBinding.groupPath,
        repeatableDataPath: schemaBinding.repeatableDataPath,
        groupRenderMeta: {
          isRepeatable: isRepeatableFormSchema(groupSchemaNode) || Boolean(group?.is_repeatable),
        },
        columns,
        schemaShadowMetrics: buildSchemaShadowMetrics(columns),
      }
    })
}

const buildFolders = (sortedGroups) => {
  const groupsByFolder = {}
  sortedGroups.forEach((group) => {
    if (!groupsByFolder[group.folderKey]) groupsByFolder[group.folderKey] = []
    groupsByFolder[group.folderKey].push(group)
  })
  const folders = Object.entries(groupsByFolder).map(([folderKey, groups]) => ({
    folderKey,
    folderName: groups[0]?.folderName || folderKey,
    groups,
  }))
  return { folders, groupsByFolder }
}

export const buildProjectDatasetViewModel = ({
  activeGroupKey,
  patientDataset,
  projectData,
  selectedPatients,
  templateFieldGroups,
  templateFieldMapping,
  templateSchemaJson,
}) => {
  const effectiveFieldGroups = Array.isArray(templateFieldGroups) && templateFieldGroups.length > 0
    ? templateFieldGroups
    : deriveFieldGroupsFromPatientCrfData(patientDataset)
  const sortedGroups = buildSortedGroups({ effectiveFieldGroups, templateFieldMapping, templateSchemaJson })
  const { folders, groupsByFolder } = buildFolders(sortedGroups)
  const firstGroupKey = sortedGroups[0]?.group_id || null
  const currentActiveGroupKey = activeGroupKey && sortedGroups.some((group) => group.group_id === activeGroupKey)
    ? activeGroupKey
    : firstGroupKey
  const patients = Array.isArray(patientDataset) ? patientDataset : []
  const selectedPatientIds = Array.isArray(selectedPatients) ? selectedPatients : []

  return {
    projectMeta: projectData || {},
    patients,
    selectedPatientIds,
    fieldGroups: sortedGroups,
    folders,
    groupsByFolder,
    activeGroupKey: currentActiveGroupKey,
    visiblePatients: patients,
    selectionSummary: {
      selected: selectedPatientIds.length,
      total: patients.length,
    },
    extractionContext: {
      selectedPatientIds,
    },
  }
}
