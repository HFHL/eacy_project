import { appThemeToken } from '../../../styles/themeTokens'
import { FileListContent } from './FileListContent'
import { FileListFilterOverlay } from './FileListFilterOverlay'
import { FileListModals } from './FileListModals'
import { FileListToolbar } from './FileListToolbar'
import { FileListUploadWidgets } from './FileListUploadWidgets'

export const FileListPageShell = ({
  contentProps,
  filterProps,
  modalsProps,
  toolbarProps,
  uploadProps,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
    <FileListFilterOverlay {...filterProps} />
    <div style={{
      background: appThemeToken.colorBgContainer,
      borderRadius: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      padding: '12px 14px 10px',
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
    }}>
      <FileListToolbar {...toolbarProps} />
      <FileListContent {...contentProps} />
    </div>
    <FileListUploadWidgets {...uploadProps} />
    <FileListModals {...modalsProps} />
  </div>
)
