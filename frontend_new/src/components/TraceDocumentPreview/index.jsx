import PdfPageWithHighlight from '../PdfPageWithHighlight'
import HighlightedImage from '../HighlightedImage'
import RotatedDocumentPreview from '../RotatedDocumentPreview'
import EvidenceQualityTags from '../EvidenceQualityTags'
import { resolvePreviewRotation } from '../../api/_evidence'

/**
 * 字段溯源文档预览：统一处理 OCR page_angle 旋转与证据质量提示。
 */
export function TraceDocumentPreview({
  pdfUrl,
  imageUrl,
  isPdf = false,
  sourceLocation,
  pageNumber = null,
  loading = false,
  containerStyle,
  previewStyle,
}) {
  const locations = Array.isArray(sourceLocation)
    ? sourceLocation.filter(Boolean)
    : (sourceLocation ? [sourceLocation] : [])
  const rotation = resolvePreviewRotation(locations)
  const resolvedPageNumber = pageNumber ?? locations[0]?.page ?? locations[0]?.page_no ?? null

  return (
    <div style={containerStyle}>
      <EvidenceQualityTags sourceLocation={locations} />
      <RotatedDocumentPreview rotation={rotation} style={previewStyle}>
        {isPdf && pdfUrl ? (
          <PdfPageWithHighlight
            pdfUrl={pdfUrl}
            pageNumber={resolvedPageNumber}
            locations={locations}
            loading={loading}
          />
        ) : imageUrl ? (
          <HighlightedImage
            imageUrl={imageUrl}
            sourceLocation={locations}
            loading={loading}
          />
        ) : null}
      </RotatedDocumentPreview>
    </div>
  )
}

export default TraceDocumentPreview
