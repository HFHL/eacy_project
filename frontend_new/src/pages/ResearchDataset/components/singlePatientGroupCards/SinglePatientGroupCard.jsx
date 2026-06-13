import { useEffect, useMemo, useState } from 'react'
import { Card, Space, Tag } from 'antd'
import StructuredValueRenderer from '../nestedDetailDrawer/StructuredValueRenderer'
import {
  getGroupColumns,
} from './singlePatientGroupModel'
import { buildSinglePatientGroupPayload } from './groupNestedPayload'

const SinglePatientGroupCard = ({ group, patient }) => {
  const groupColumns = getGroupColumns(group)
  const leafFieldCount = Array.isArray(group?.db_fields) ? group.db_fields.length : groupColumns.length
  const groupPath = group?.groupPath || group?.group_id || 'root'
  const groupPayload = useMemo(() => buildSinglePatientGroupPayload({ group, patient }), [group, patient])
  const [customExpandedKeys, setCustomExpandedKeys] = useState([])

  useEffect(() => {
    setCustomExpandedKeys([])
  }, [groupPath, groupPayload])

  const handleTogglePanel = (panelKey) => {
    if (!panelKey) return
    setCustomExpandedKeys((prev) => (
      prev.includes(panelKey)
        ? prev.filter((key) => key !== panelKey)
        : [...prev, panelKey]
    ))
  }

  return (
    <Card
      key={group.group_id}
      size="small"
      title={group.group_name}
      className="project-dataset-v2-single-form-card"
      extra={(
        <Space size={6}>
          <Tag>{`${leafFieldCount} 字段`}</Tag>
          {groupColumns.length !== leafFieldCount ? <Tag color="blue">{`${groupColumns.length} 区块`}</Tag> : null}
        </Space>
      )}
      styles={{ body: { padding: 12 } }}
    >
      <StructuredValueRenderer
        value={groupPayload}
        schemaNode={group?.groupSchemaNode || null}
        label={group.group_name}
        path={groupPath}
        depth={0}
        expandMode="custom"
        customExpandedKeys={customExpandedKeys}
        onTogglePanel={handleTogglePanel}
        showDiagnostics={false}
      />
    </Card>
  )
}

export default SinglePatientGroupCard
