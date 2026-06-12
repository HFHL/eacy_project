export const scrollbarStyle = `
  .schema-modal-scrollable::-webkit-scrollbar,
  .schema-table-wrapper .ant-table-body::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }
  .schema-modal-scrollable::-webkit-scrollbar-track,
  .schema-table-wrapper .ant-table-body::-webkit-scrollbar-track {
    background: transparent;
  }
  .schema-modal-scrollable::-webkit-scrollbar-thumb,
  .schema-table-wrapper .ant-table-body::-webkit-scrollbar-thumb {
    background: rgb(217, 217, 217);
    border-radius: 2px;
  }
  .schema-modal-scrollable::-webkit-scrollbar-thumb:hover,
  .schema-table-wrapper .ant-table-body::-webkit-scrollbar-thumb:hover {
    background: rgb(191, 191, 191);
  }
  .schema-table-wrapper .ant-table-header::-webkit-scrollbar { height: 0; }
  .schema-table-wrapper .ant-table-row.selected-row > td { background: rgb(230, 244, 255) !important; }
  .schema-table-wrapper .ant-table-row.selected-row:hover > td { background: rgb(186, 224, 255) !important; }
  .schema-table-wrapper .ant-table-row:hover > td { background: rgb(250, 250, 250); }
  .schema-table-wrapper .row-actions { opacity: 0; transition: opacity 0.2s ease; }
  .schema-table-wrapper .ant-table-row:hover .row-actions { opacity: 1; }
  .repeatable-form-card .card-hover-action { opacity: 0; transition: opacity 0.2s ease; }
  .repeatable-form-card:hover .card-hover-action { opacity: 1; }
`
