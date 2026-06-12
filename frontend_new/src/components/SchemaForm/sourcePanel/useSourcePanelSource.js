import { useCallback, useMemo } from 'react'
import {
  buildCandidateDocuments,
  getDocumentDisplayName,
} from '../utils/documentCandidateUtils'
import {
  buildSourceLocationFromAudit,
  resolveFieldAuditFromExtractionMetadata,
  sourceLocationToCoordinates,
} from '../utils/sourceLocationUtils'

const normalizeSourceRules = (arr) => (
  (Array.isArray(arr) ? arr : [])
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean)
)

const docMatchesSourceRule = (doc, rule) => {
  const content = [
    doc?.file_name,
    doc?.fileName,
    doc?.name,
    doc?.document_type,
    doc?.document_sub_type,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const normalizedRule = String(rule || '').trim().toLowerCase()
  if (!content || !normalizedRule) return false
  if (content.includes(normalizedRule)) return true
  return normalizedRule
    .split(/[\/、,，\s]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .some((token) => content.includes(token))
}

export function useSourcePanelSource({
  draftData,
  fallbackDocuments,
  preferredDocument,
  projectId,
  selectedField,
  selectedHistoryItem,
  suppressAutoSourceDoc,
}) {
  const candidateDocuments = useMemo(
    () => buildCandidateDocuments(draftData, fallbackDocuments),
    [draftData, fallbackDocuments]
  )

  const metadataAudit = useMemo(() => {
    if (!selectedField?.path || !projectId) return null
    return resolveFieldAuditFromExtractionMetadata(draftData, selectedField.path)
  }, [draftData, projectId, selectedField?.path])

  const getSchemaSourceRules = useCallback(() => {
    const src = selectedField?.schema?.['x-sources']
    if (!src || typeof src !== 'object') return { primary: [], secondary: [] }
    return {
      primary: normalizeSourceRules(src.primary),
      secondary: normalizeSourceRules(src.secondary),
    }
  }, [selectedField])

  const resolveFallbackDocument = useCallback(() => {
    if (!selectedField || candidateDocuments.length === 0) return null
    const sourceRules = getSchemaSourceRules()

    for (const doc of candidateDocuments) {
      if (sourceRules.primary.some((rule) => docMatchesSourceRule(doc, rule))) return doc
    }
    for (const doc of candidateDocuments) {
      if (sourceRules.secondary.some((rule) => docMatchesSourceRule(doc, rule))) return doc
    }
    if (preferredDocument?.id) {
      const matchedPreferred = candidateDocuments.find((doc) => String(doc.id) === String(preferredDocument.id))
      if (matchedPreferred) return matchedPreferred
    }

    const pathText = String(selectedField.path || selectedField.name || '').toLowerCase()
    const pathTokens = pathText.split(/[./_\-\s]+/).map((token) => token.trim()).filter(Boolean)
    const scored = candidateDocuments.map((doc, idx) => {
      const content = [
        doc.file_name,
        doc.fileName,
        doc.name,
        doc.document_type,
        doc.document_sub_type,
      ].filter(Boolean).join(' ').toLowerCase()
      let score = 0
      for (const token of pathTokens) {
        if (token && content.includes(token)) score += 2
      }
      return { doc, score, idx }
    })
    scored.sort((a, b) => (b.score - a.score) || (a.idx - b.idx))
    return scored[0]?.doc || candidateDocuments[0]
  }, [candidateDocuments, getSchemaSourceRules, preferredDocument, selectedField])

  const mergedDisplaySource = useMemo(() => {
    if (!selectedHistoryItem && !metadataAudit) return null
    if (!selectedHistoryItem) {
      const metaSourceLocation = buildSourceLocationFromAudit(metadataAudit)
      return metaSourceLocation
        ? { ...metadataAudit, source_location: metaSourceLocation }
        : metadataAudit
    }
    if (!metadataAudit) return selectedHistoryItem

    const merged = {
      ...metadataAudit,
      ...selectedHistoryItem,
      source_document_id: selectedHistoryItem.source_document_id || metadataAudit.source_document_id || metadataAudit.document_id || null,
      document_id: selectedHistoryItem.document_id || metadataAudit.document_id || selectedHistoryItem.source_document_id || null,
      document_type: selectedHistoryItem.document_type || metadataAudit.document_type,
      raw: selectedHistoryItem.raw || metadataAudit.raw,
      page_idx: typeof selectedHistoryItem.page_idx === 'number' ? selectedHistoryItem.page_idx : metadataAudit.page_idx,
      bbox: selectedHistoryItem.bbox || metadataAudit.bbox,
      trace_level: selectedHistoryItem.trace_level || metadataAudit.trace_level,
    }
    if (!merged.source_location) {
      merged.source_location = buildSourceLocationFromAudit(metadataAudit)
    }
    return merged
  }, [metadataAudit, selectedHistoryItem])

  const metadataCoordinates = useMemo(() => {
    const metaSourceLocation = buildSourceLocationFromAudit(metadataAudit)
    return metaSourceLocation ? sourceLocationToCoordinates(metaSourceLocation) : null
  }, [metadataAudit])

  const isHistorySourceSuppressed = !!(
    selectedHistoryItem &&
    selectedHistoryItem.change_type === 'revoke' &&
    suppressAutoSourceDoc
  )
  const historySourceDocId = isHistorySourceSuppressed ? null : (selectedHistoryItem?.source_document_id ?? null)
  const metadataSourceDocId = metadataAudit?.source_document_id || metadataAudit?.document_id || null
  const sourceDocId = isHistorySourceSuppressed ? null : (historySourceDocId || metadataSourceDocId || null)
  const fallbackDoc = !sourceDocId ? resolveFallbackDocument() : null
  const effectiveCoordinates = selectedHistoryItem
    ? (sourceLocationToCoordinates(mergedDisplaySource?.source_location) || metadataCoordinates)
    : metadataCoordinates
  const sourcePageIdx = Array.isArray(effectiveCoordinates)
    ? (effectiveCoordinates[0]?.pageIdx ?? 0)
    : (effectiveCoordinates?.pageIdx ?? 0)
  const sourceDocumentName =
    mergedDisplaySource?.source_document_name ||
    mergedDisplaySource?.document_name ||
    mergedDisplaySource?.file_name ||
    mergedDisplaySource?.fileName ||
    (sourceDocId && fallbackDoc ? getDocumentDisplayName(fallbackDoc) : '')

  return {
    candidateDocuments,
    displaySource: mergedDisplaySource,
    effectiveCoordinates,
    fallbackDoc,
    isCurrentFieldSensitive: !!(selectedField?.schema?.['x-sensitive']),
    sourceDocId,
    sourceDocumentName,
    sourcePageIdx,
  }
}
