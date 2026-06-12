import { Spin } from 'antd'
import FieldGroupTable from '../FieldGroupTable'
import SinglePatientGroupCards from '../SinglePatientGroupCards'

const FieldGroupTabsBody = ({
  currentGroup,
  enableConsistencyDebug,
  initialFolderLoading,
  loading,
  onOpenNestedDetail,
  rightRenderPatients,
  scrollY,
}) => (
  <div className="project-dataset-v2-right-table">
    <Spin
      spinning={loading || initialFolderLoading}
      tip={initialFolderLoading ? '正在加载首个文件夹表单...' : undefined}
    >
      {rightRenderPatients.length === 1 ? (
        <SinglePatientGroupCards
          patient={rightRenderPatients[0] || null}
          groups={currentGroup ? [currentGroup] : []}
          onOpenNestedDetail={onOpenNestedDetail}
        />
      ) : (
        <FieldGroupTable
          loading={loading}
          group={currentGroup}
          patients={rightRenderPatients}
          enableConsistencyDebug={enableConsistencyDebug}
          scrollY={scrollY}
          onOpenNestedDetail={onOpenNestedDetail}
        />
      )}
    </Spin>
  </div>
)

export default FieldGroupTabsBody
