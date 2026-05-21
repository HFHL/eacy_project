import { Tag, Typography } from 'antd'
import { getEvidenceQualityFlags } from '../../api/_evidence'

const { Text } = Typography

const COORD_WARNING_LABELS = {
  missing_page_dimensions: '缺少页尺寸，坐标可能不准',
  missing_polygon: '缺少有效坐标，无法精确定位',
  low_confidence_fuzzy_match: '模糊匹配置信度不足，未绘制精确红框',
  sibling_page_only: '仅继承相邻字段页码，无精确红框',
}

export function EvidenceQualityTags({ sourceLocation, style }) {
  const flags = getEvidenceQualityFlags(sourceLocation)
  if (!flags.siblingFallback && !flags.coordWarning && !flags.nonRenderable) {
    return null
  }

  return (
    <div style={{ marginBottom: 8, ...style }}>
      {flags.siblingFallback && (
        <Tag color="warning" style={{ marginBottom: 4 }}>
          仅继承相邻字段页码，无精确红框
        </Tag>
      )}
      {flags.coordWarning && (
        <Tag color="orange" style={{ marginBottom: 4 }}>
          {COORD_WARNING_LABELS[flags.coordWarning] || flags.coordWarning}
        </Tag>
      )}
      {flags.nonRenderable && (
        <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
          当前证据缺少可渲染坐标，仅展示文档原文
        </Text>
      )}
    </div>
  )
}

export default EvidenceQualityTags
