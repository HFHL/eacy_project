import { normalizeRepeatableTableSchema } from '../../../../components/SchemaForm/schemaRenderKernel'
import { getScopedFieldRawValue } from '../cellRenderers'

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const isEmptyValue = (value) => {
  if (value === null || value === undefined || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (isPlainObject(value)) return Object.keys(value).length === 0
  return false
}

const unwrapFieldValue = (rawValue) => {
  if (rawValue && typeof rawValue === 'object' && Object.prototype.hasOwnProperty.call(rawValue, 'value')) {
    return rawValue.value
  }
  return rawValue
}

const normalizePath = (rawPath) => (
  String(rawPath || '')
    .normalize('NFKC')
    .replace(/\./g, '/')
    .replace(/\s*\/\s*/g, '/')
    .trim()
)

const pathSegments = (rawPath) => normalizePath(rawPath).split('/').filter(Boolean)

const hasNumericSegment = (rawPath) => pathSegments(rawPath).some((segment) => /^\d+$/.test(segment))

const canonicalPath = (rawPath) => pathSegments(rawPath).filter((segment) => !/^\d+$/.test(segment)).join('/')

const getGroupFields = (patient, group) => {
  const groupId = group?.group_id
  const fromCrfData = patient?.crf_data?.groups?.[groupId]?.fields
  const fromCrfGroups = patient?.crfGroups?.[groupId]?.fields
  return {
    ...(fromCrfData && typeof fromCrfData === 'object' ? fromCrfData : {}),
    ...(fromCrfGroups && typeof fromCrfGroups === 'object' ? fromCrfGroups : {}),
  }
}

const getGroupPrefixCandidates = (group) => {
  const candidates = [
    group?.groupPath,
    group?.group_id,
    group?.group_name,
  ]
  if (group?.folderName && group?.groupShortName) {
    candidates.push(`${group.folderName}/${group.groupShortName}`)
  }
  return [...new Set(candidates.map(normalizePath).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
}

const toRelativeSegments = (rawPath, group) => {
  const normalizedPath = normalizePath(rawPath)
  const matchedPrefix = getGroupPrefixCandidates(group).find((prefix) => (
    normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
  ))
  const relativePath = matchedPrefix
    ? normalizedPath.slice(matchedPrefix.length).replace(/^\//, '')
    : normalizedPath
  return relativePath.split('/').filter(Boolean)
}

const ensureContainer = (parent, segment, nextSegment) => {
  const shouldBeArray = /^\d+$/.test(nextSegment || '')
  if (shouldBeArray) {
    if (!Array.isArray(parent[segment])) parent[segment] = []
    return parent[segment]
  }
  if (!isPlainObject(parent[segment])) parent[segment] = {}
  return parent[segment]
}

const setNestedValue = (payload, segments, value) => {
  if (!payload || !Array.isArray(segments) || segments.length === 0) return

  let cursor = payload
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    const isLast = index === segments.length - 1
    const isIndex = /^\d+$/.test(segment)
    const nextSegment = segments[index + 1]

    if (isLast) {
      if (isIndex && Array.isArray(cursor)) {
        cursor[Number(segment)] = value
      } else {
        cursor[segment] = value
      }
      return
    }

    if (isIndex) {
      if (!Array.isArray(cursor)) return
      const rowIndex = Number(segment)
      const nextShouldBeArray = /^\d+$/.test(nextSegment || '')
      if (!cursor[rowIndex] || typeof cursor[rowIndex] !== 'object') {
        cursor[rowIndex] = nextShouldBeArray ? [] : {}
      }
      cursor = cursor[rowIndex]
      continue
    }

    cursor = ensureContainer(cursor, segment, nextSegment)
  }
}

const normalizeValueBySchema = (schemaNode, value) => {
  const normalizedSchema = normalizeRepeatableTableSchema(schemaNode)
  if (!normalizedSchema || typeof normalizedSchema !== 'object') return value

  if (normalizedSchema.type === 'array') {
    const itemSchema = normalizedSchema.items && typeof normalizedSchema.items === 'object'
      ? normalizedSchema.items
      : null
    if (Array.isArray(value)) {
      return value.map((item) => normalizeValueBySchema(itemSchema, item))
    }
    if (isPlainObject(value) && !isEmptyValue(value)) {
      const entries = Object.entries(value)
      const rowCount = entries.reduce((maxCount, [, fieldValue]) => (
        Array.isArray(fieldValue) ? Math.max(maxCount, fieldValue.length) : maxCount
      ), 0)
      if (rowCount > 0) {
        return Array.from({ length: rowCount }, (_unused, rowIndex) => {
          const row = {}
          entries.forEach(([fieldKey, fieldValue]) => {
            row[fieldKey] = Array.isArray(fieldValue) ? (fieldValue[rowIndex] ?? null) : fieldValue
          })
          return normalizeValueBySchema(itemSchema, row)
        })
      }
      return [normalizeValueBySchema(itemSchema, value)]
    }
    return []
  }

  if (normalizedSchema.type !== 'object' || !normalizedSchema.properties) {
    return value
  }

  const objectValue = isPlainObject(value) ? { ...value } : {}
  Object.entries(normalizedSchema.properties).forEach(([fieldKey, fieldSchema]) => {
    const childSchema = normalizeRepeatableTableSchema(fieldSchema)
    const childType = childSchema?.type
    if (Object.prototype.hasOwnProperty.call(objectValue, fieldKey)) {
      objectValue[fieldKey] = normalizeValueBySchema(childSchema, objectValue[fieldKey])
      return
    }
    if (childType === 'array') {
      objectValue[fieldKey] = []
    } else if (childType === 'object') {
      objectValue[fieldKey] = normalizeValueBySchema(childSchema, {})
    }
  })
  return objectValue
}

const buildPayloadFromFieldEntries = ({ entries, group }) => {
  const payload = {}
  const indexedCanonicals = new Set(
    entries
      .map(([fieldPath]) => normalizePath(fieldPath))
      .filter((fieldPath) => hasNumericSegment(fieldPath))
      .map(canonicalPath)
      .filter(Boolean),
  )
  const indexedBranches = new Set(
    entries
      .map(([fieldPath]) => toRelativeSegments(fieldPath, group))
      .map((segments) => {
        const indexPosition = segments.findIndex((segment) => /^\d+$/.test(segment))
        return indexPosition > 0 ? segments.slice(0, indexPosition).join('/') : ''
      })
      .filter(Boolean),
  )

  entries.forEach(([fieldPath, rawFieldValue]) => {
    const normalizedPath = normalizePath(fieldPath)
    const relativeSegments = toRelativeSegments(normalizedPath, group)
    const isIndexedPath = hasNumericSegment(normalizedPath)
    const isUnindexedArrayFallback = !isIndexedPath && [...indexedBranches].some((branchPath) => (
      relativeSegments.join('/').startsWith(`${branchPath}/`)
    ))
    if (
      !isIndexedPath
      && (indexedCanonicals.has(canonicalPath(normalizedPath)) || isUnindexedArrayFallback)
    ) {
      return
    }
    if (relativeSegments.length === 0) return
    setNestedValue(payload, relativeSegments, unwrapFieldValue(rawFieldValue))
  })

  return payload
}

const buildFallbackEntries = ({ group, patient }) => (
  (Array.isArray(group?.db_fields) ? group.db_fields : [])
    .map((fieldPath) => [
      fieldPath,
      getScopedFieldRawValue(patient, group?.group_id, fieldPath, {
        groupName: group?.group_name,
        groupPathTokens: group?.groupPathTokens,
        strictPathOnly: true,
      }),
    ])
)

export const buildSinglePatientGroupPayload = ({ group, patient }) => {
  const groupFields = getGroupFields(patient, group)
  const rawEntries = Object.entries(groupFields).filter(([fieldPath]) => !String(fieldPath).startsWith('__'))
  const entries = rawEntries.length > 0
    ? rawEntries
    : buildFallbackEntries({ group, patient })
  const payload = buildPayloadFromFieldEntries({ entries, group })
  return normalizeValueBySchema(group?.groupSchemaNode, payload)
}
