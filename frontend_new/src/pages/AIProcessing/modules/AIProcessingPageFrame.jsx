import React from 'react'

const AIProcessingPageFrame = ({ children }) => (
  <div className="page-container fade-in">
    <style>{`
      .confirm-modal-up .ant-modal {
        transform: translateY(-20%) !important;
      }
    `}</style>
    {children}
  </div>
)

export default AIProcessingPageFrame
