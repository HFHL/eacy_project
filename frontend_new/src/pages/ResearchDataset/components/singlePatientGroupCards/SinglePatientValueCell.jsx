import { Tag, Tooltip } from 'antd'
import { buildNestedFieldNode } from '../../parsers/nestedFieldNodeParser'
import { resolveCrfCellPresentation } from '../../renderers/crfRenderRules'
import { formatFieldValue } from '../cellRenderers'

const SinglePatientValueCell = ({ group, column, rawValue, onOpenNestedDetail }) => {
  const node = buildNestedFieldNode(rawValue, {
    path: `${group.group_id}.${column.key}`,
    label: column.title,
  })
  const presentation = resolveCrfCellPresentation({ rawValue, node })

  if (presentation.mode === 'detail') {
    return (
      <Tag
        color="blue"
        style={{ cursor: 'pointer', marginInlineEnd: 0 }}
        onClick={() => onOpenNestedDetail({
          title: `${group.group_name} / ${column.title}`,
          node,
          schemaNode: column?.schemaNode || null,
          rawValue,
        })}
      >
        {presentation.summaryText}
      </Tag>
    )
  }

  return (
    <Tooltip title={formatFieldValue(rawValue)}>
      <span>{presentation.displayText || formatFieldValue(rawValue)}</span>
    </Tooltip>
  )
}

export default SinglePatientValueCell
