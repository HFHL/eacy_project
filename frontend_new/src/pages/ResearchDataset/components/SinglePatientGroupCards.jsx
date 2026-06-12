import { Empty } from 'antd'
import SinglePatientGroupCard from './singlePatientGroupCards/SinglePatientGroupCard'

/**
 * 单患者视图：字段组卡片渲染。
 *
 * @param {{
 *  patient: Record<string, any> | null;
 *  groups: Array<Record<string, any>>;
 *  onOpenNestedDetail: (payload: {title:string,node:Record<string, any>}) => void;
 * }} props 组件参数。
 * @returns {JSX.Element}
 */
const SinglePatientGroupCards = ({ patient, groups, onOpenNestedDetail }) => {
  if (!patient) {
    return <Empty description="暂无患者数据" />
  }

  return (
    <div
      className="project-dataset-v2-single-cards hover-scrollbar"
      style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, overflow: 'auto' }}
    >
      {(groups || []).map((group) => (
        <SinglePatientGroupCard
          key={group.group_id}
          group={group}
          patient={patient}
          onOpenNestedDetail={onOpenNestedDetail}
        />
      ))}
    </div>
  )
}

export default SinglePatientGroupCards
