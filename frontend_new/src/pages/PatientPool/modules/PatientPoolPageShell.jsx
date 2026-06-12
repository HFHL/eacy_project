import PatientFilterToolbar from './PatientFilterToolbar'
import PatientListCard from './PatientListCard'
import PatientPoolModals from './PatientPoolModals'
import PatientStatisticsPanel from './PatientStatisticsPanel'

const PatientPoolPageShell = ({
  filterToolbarProps,
  listCardProps,
  modalsProps,
  statisticsProps,
}) => (
  <div className="page-container fade-in">
    <PatientStatisticsPanel {...statisticsProps} />
    <PatientFilterToolbar {...filterToolbarProps} />
    <PatientListCard {...listCardProps} />
    <PatientPoolModals {...modalsProps} />
  </div>
)

export default PatientPoolPageShell
