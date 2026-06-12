import { Row } from 'antd'
import AutoArchivedPanel from './AutoArchivedPanel'
import NeedsReviewPanel from './NeedsReviewPanel'
import NewPatientPanel from './NewPatientPanel'

const AIProcessingReviewGrid = ({
  autoArchivedProps,
  needsReviewProps,
  newPatientProps,
}) => (
  <Row gutter={[16, 16]}>
    <NeedsReviewPanel {...needsReviewProps} />
    <NewPatientPanel {...newPatientProps} />
    <AutoArchivedPanel {...autoArchivedProps} />
  </Row>
)

export default AIProcessingReviewGrid
