const ProjectDatasetStyles = ({ token, layoutTokens }) => (
  <style>{`
        .ant-table-row-disabled {
          background-color: ${token.colorBgLayout} !important;
          opacity: 0.7;
        }
        .ant-table-row-disabled td { color: ${token.colorTextSecondary} !important; }
        .ant-table-row-disabled:hover > td { background-color: ${token.colorBgLayout} !important; }
        .compact-table .ant-table-tbody > tr { min-height: 44px; }
        .compact-table .ant-table-cell {
          padding: 8px 10px !important;
          vertical-align: middle !important;
        }
        .compact-table .ant-table-thead > tr > th {
          padding: 10px 10px !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          min-height: 44px;
          white-space: normal !important;
          word-break: break-word !important;
          line-height: 1.4 !important;
        }
        .compact-table .ant-table-tbody > tr > td {
          font-size: 13px !important;
          line-height: 1.5 !important;
        }
        .compact-table .ant-table-cell > div { word-break: break-word; }
        .compact-table .ant-table-thead th.ant-table-cell {
          text-align: center !important;
          background: ${token.colorBgLayout} !important;
        }
        .project-dataset-table-region {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .project-dataset-table.ant-table-wrapper,
        .project-dataset-table.ant-table-wrapper .ant-spin-nested-loading,
        .project-dataset-table.ant-table-wrapper .ant-spin-container {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .project-dataset-table.ant-table-wrapper .ant-table {
          flex: 1;
          min-height: 0;
        }
        .project-dataset-table.ant-table-wrapper .ant-table-pagination {
          position: sticky;
          bottom: 0;
          z-index: 3;
          margin: 0 !important;
          padding: 8px 0 0;
          background: ${token.colorBgContainer};
          border-top: 1px solid ${token.colorBorder};
        }
        .project-dataset-v2-layout {
          --project-v2-left-rail-width: ${layoutTokens.leftRailWidth}px;
          --project-v2-header-height: ${layoutTokens.headerHeight}px;
          --project-v2-row-height: ${layoutTokens.rowHeight}px;
          --project-v2-panel-gap: ${layoutTokens.panelGap}px;
          --project-v2-cell-padding-y: ${layoutTokens.cellPaddingY}px;
          --project-v2-cell-padding-x: ${layoutTokens.cellPaddingX}px;
          display: grid;
          grid-template-columns: var(--project-v2-left-rail-width) minmax(0, 1fr);
          gap: var(--project-v2-panel-gap);
          min-height: 0;
          flex: 1;
          overflow: hidden;
          background: ${token.colorBorderSecondary};
          border-radius: 8px;
        }
        .project-dataset-v2-panel {
          min-width: 0;
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          background: ${token.colorBgContainer};
        }
        .project-dataset-v2-left-header,
        .project-dataset-v2-right-header {
          height: 72px;
          min-height: 72px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 8px 10px;
          border-bottom: 1px solid ${token.colorBorderSecondary};
          background: ${token.colorBgContainer};
          box-sizing: border-box;
        }
        .project-dataset-v2-left-header .ant-input-search { margin-bottom: 8px; }
        .project-dataset-v2-right-shell {
          display: flex;
          flex-direction: column;
          min-height: 0;
          height: 100%;
        }
        .project-dataset-v2-right-table {
          min-height: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .project-dataset-v2-right-table > .ant-spin-nested-loading,
        .project-dataset-v2-right-table > .ant-spin-nested-loading > .ant-spin-container {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .project-dataset-v2-right-table
          > .ant-spin-nested-loading
          > .ant-spin-container
          > .project-dataset-v2-single-cards {
          flex: 1;
          min-height: 0;
        }
        .project-dataset-v2-folder-tabs .ant-tabs-nav {
          margin-bottom: 6px;
        }
        .project-dataset-v2-folder-tabs .ant-tabs-tab {
          padding: 4px 0;
        }
        .project-dataset-v2-group-pills {
          min-height: 26px;
          min-width: 0;
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: thin;
        }
        .project-dataset-v2-group-pills .ant-segmented {
          width: max-content;
          max-width: none;
          min-width: 0;
          display: inline-flex;
          vertical-align: top;
        }
        .project-dataset-v2-group-pills .ant-segmented-group {
          display: flex;
          flex-wrap: nowrap;
        }
        .project-dataset-v2-group-pills .ant-segmented-item {
          flex: 0 0 auto;
        }
        .project-dataset-v2-group-pills .ant-segmented-item-label {
          padding: 0 8px;
          max-width: 220px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .project-dataset-v2-row > td {
          height: var(--project-v2-row-height) !important;
          min-height: var(--project-v2-row-height) !important;
          max-height: var(--project-v2-row-height) !important;
          line-height: 20px !important;
          padding-top: var(--project-v2-cell-padding-y) !important;
          padding-bottom: var(--project-v2-cell-padding-y) !important;
          box-sizing: border-box !important;
        }
        .project-dataset-v2-left-panel .ant-table-tbody > tr.ant-table-measure-row,
        .project-dataset-v2-right-panel .ant-table-tbody > tr.ant-table-measure-row {
          height: 0 !important;
          min-height: 0 !important;
          max-height: 0 !important;
          visibility: hidden !important;
          overflow: hidden !important;
        }
        .project-dataset-v2-left-panel .ant-table-thead > tr > th,
        .project-dataset-v2-right-panel .ant-table-thead > tr > th {
          height: var(--project-v2-header-height) !important;
          min-height: var(--project-v2-header-height) !important;
          padding-top: 8px !important;
          padding-bottom: 8px !important;
          white-space: nowrap !important;
        }
        .project-dataset-v2-patient-cell {
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-width: 0;
          min-height: 20px;
          line-height: 1.1;
          gap: 0;
        }
        .project-dataset-v2-patient-main-line {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-width: 0;
        }
        .project-dataset-v2-patient-main-line .ant-btn-link {
          max-width: 70px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .project-dataset-v2-patient-main-line .ant-typography {
          white-space: nowrap;
        }
        .project-dataset-v2-left-panel .project-dataset-table .ant-table-container {
          border-inline-end-width: 0 !important;
        }
        .project-dataset-v2-left-panel .project-dataset-table .ant-table-cell {
          padding-left: var(--project-v2-cell-padding-x) !important;
          padding-right: var(--project-v2-cell-padding-x) !important;
          padding-top: var(--project-v2-cell-padding-y) !important;
          padding-bottom: var(--project-v2-cell-padding-y) !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        .project-dataset-v2-left-panel .project-dataset-table .ant-table-thead > tr > th:first-child,
        .project-dataset-v2-left-panel .project-dataset-table .ant-table-tbody > tr > td:first-child {
          padding-left: 4px !important;
          padding-right: 4px !important;
          text-align: center !important;
        }
        .project-dataset-v2-left-panel .project-dataset-table .ant-checkbox-wrapper,
        .project-dataset-v2-left-panel .project-dataset-table .ant-checkbox {
          transform: scale(0.92);
        }
        .project-dataset-v2-left-panel .project-dataset-table .project-dataset-v2-row-anchor-col {
          width: 1px !important;
          min-width: 1px !important;
          max-width: 1px !important;
          padding: 0 !important;
          border-left: 0 !important;
          border-right: 0 !important;
          background: transparent !important;
        }
        .project-dataset-v2-left-panel .project-dataset-table .project-dataset-v2-row-anchor {
          display: block;
          width: 0;
          height: 0;
          overflow: hidden;
          pointer-events: none;
        }
        .project-dataset-v2-table .ant-btn.ant-btn-sm {
          height: 22px !important;
          min-width: 22px !important;
          line-height: 20px !important;
        }
        .project-dataset-v2-table .ant-progress {
          margin: 0 !important;
        }
        .project-dataset-v2-right-panel .project-dataset-table .ant-table-container {
          border-inline-start-width: 0 !important;
        }
        .project-dataset-v2-right-panel .project-dataset-table .ant-table-cell {
          padding-left: var(--project-v2-cell-padding-x) !important;
          padding-right: var(--project-v2-cell-padding-x) !important;
          padding-top: var(--project-v2-cell-padding-y) !important;
          padding-bottom: var(--project-v2-cell-padding-y) !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        .project-dataset-v2-panel .project-dataset-v2-table .ant-table-tbody > tr > td {
          font-size: 13px !important;
          line-height: 20px !important;
          vertical-align: middle !important;
        }
        .project-dataset-v2-left-panel .ant-table-thead > tr,
        .project-dataset-v2-right-panel .ant-table-thead > tr {
          height: var(--project-v2-header-height) !important;
          min-height: var(--project-v2-header-height) !important;
          max-height: var(--project-v2-header-height) !important;
        }
        .project-dataset-v2-left-panel .ant-table-thead > tr > th .ant-table-cell-content,
        .project-dataset-v2-right-panel .ant-table-thead > tr > th .ant-table-cell-content {
          display: flex;
          align-items: center;
          min-height: calc(var(--project-v2-header-height) - (var(--project-v2-cell-padding-y) * 2));
        }
        @media (max-width: 1360px) {
          .project-dataset-v2-layout {
            grid-template-columns: 320px minmax(0, 1fr);
          }
        }
        @media (max-width: 1180px) {
          .project-dataset-v2-layout {
            grid-template-columns: minmax(0, 1fr);
            grid-template-rows: auto auto;
          }
        }
  `}</style>
)

export default ProjectDatasetStyles
