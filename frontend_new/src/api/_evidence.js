/**
 * Evidence 标准化工具：将后端 *_field_evidence 接口的原始记录
 * 统一为前端渲染所需的 source_location 结构（polygon / page_width / page_height / page）。
 *
 * 同时被 EHR (api/patient.js) 与科研 CRF (api/project.js) 复用，
 * 保证两边的坐标渲染走同一条数据归一化路径。
 */

export const hasRenderablePolygon = (location = {}) => {
  const polygon = Array.isArray(location.polygon)
    ? location.polygon
    : Array.isArray(location.textin_position)
      ? location.textin_position
      : Array.isArray(location.position)
        ? location.position
        : null
  return Array.isArray(polygon) && polygon.length >= 8 && location.renderable !== false
}

export const normalizeEvidenceLocation = (evidence = {}) => {
  let rawLocation = evidence.bbox_json
  if (typeof rawLocation === 'string') {
    try {
      rawLocation = JSON.parse(rawLocation)
    } catch {
      rawLocation = null
    }
  }
  const location = rawLocation && typeof rawLocation === 'object' ? rawLocation : {}
  const pageNo = evidence.page_no || location.page_no || location.page || 1
  const polygon = Array.isArray(location.polygon)
    ? location.polygon
    : Array.isArray(location.textin_position)
      ? location.textin_position
      : Array.isArray(location.position)
        ? location.position
        : null
  const pageAngle = Number(location.page_angle)
  const normalizedAngle = Number.isFinite(pageAngle) ? ((pageAngle % 360) + 360) % 360 : 0

  return {
    ...location,
    page: pageNo,
    page_no: pageNo,
    polygon,
    page_angle: normalizedAngle,
    renderable: location.renderable ?? hasRenderablePolygon({ ...location, polygon }),
    coord_space: location.coord_space || 'pixel',
    page_width: location.page_width,
    page_height: location.page_height,
    quote_text: evidence.quote_text || location.quote_text || '',
    evidence_id: evidence.id,
    evidence_type: evidence.evidence_type,
    document_id: evidence.document_id,
    fallback_strategy: location.fallback_strategy || null,
    coord_warning: location.coord_warning || null,
  }
}

export const normalizeFieldEvidence = (evidence = {}) => ({
  ...evidence,
  source_location: normalizeEvidenceLocation(evidence),
})

export const resolvePreviewRotation = (sourceLocation) => {
  const locations = Array.isArray(sourceLocation)
    ? sourceLocation.filter(Boolean)
    : (sourceLocation ? [sourceLocation] : [])
  const primary = locations.find((item) => item?.page_angle != null) || locations[0]
  const angle = Number(primary?.page_angle)
  return Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : 0
}

export const getEvidenceQualityFlags = (sourceLocation) => {
  const locations = Array.isArray(sourceLocation)
    ? sourceLocation.filter(Boolean)
    : (sourceLocation ? [sourceLocation] : [])
  return {
    siblingFallback: locations.some((item) => (
      item?.fallback_strategy === 'sibling_field_location'
      || item?.fallback_strategy === 'sibling_page_hint'
    )),
    coordWarning: locations.find((item) => item?.coord_warning)?.coord_warning || null,
    nonRenderable: locations.length > 0 && locations.every((item) => !hasRenderablePolygon(item)),
  }
}
