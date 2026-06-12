import { Segmented, Tabs } from 'antd'

const FieldGroupTabsHeader = ({
  activeFolderGroups,
  activeFolderKey,
  folderItems,
  onFolderChange,
  onGroupChange,
  previewGroupId,
}) => (
  <div className="project-dataset-v2-right-header">
    <Tabs
      activeKey={activeFolderKey}
      onChange={onFolderChange}
      items={folderItems}
      className="project-dataset-v2-folder-tabs"
      size="small"
    />
    <div className="project-dataset-v2-group-pills">
      <Segmented
        size="small"
        value={previewGroupId}
        onChange={onGroupChange}
        options={activeFolderGroups.map((group) => ({
          value: group.group_id,
          label: group.groupShortName || group.group_name,
        }))}
      />
    </div>
  </div>
)

export default FieldGroupTabsHeader
