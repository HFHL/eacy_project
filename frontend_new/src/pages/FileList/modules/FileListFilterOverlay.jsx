import React from 'react'
import { createPortal } from 'react-dom'
import { FilterDropdownOverlayContent } from './filterDropdowns'

const getOverlayOptions = ({
  filterKey,
  availableFileTypeCategories,
  availableTaskStatusOptions,
  availableStatusInfoOptions,
}) => {
  if (filterKey === 'dateRange') return null
  if (filterKey === 'fileType') return availableFileTypeCategories
  if (filterKey === 'taskStatus') return availableTaskStatusOptions
  return availableStatusInfoOptions
}

export const FileListFilterOverlay = ({
  availableFileTypeCategories,
  availableStatusInfoOptions,
  availableTaskStatusOptions,
  closeFilterOverlay,
  openFilterKey,
  overlayPosition,
  resetFilter,
  applyFilter,
  setTempFilters,
  tempFilters,
}) => {
  if (!openFilterKey || !overlayPosition) return null

  return createPortal(
    <>
      <div
        role="presentation"
        style={{ position: 'fixed', inset: 0, zIndex: 1040 }}
        onClick={() => closeFilterOverlay(openFilterKey)}
      />
      <div
        style={{
          position: 'fixed',
          left: overlayPosition.left,
          top: overlayPosition.top,
          zIndex: 1050,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <FilterDropdownOverlayContent
          filterKey={openFilterKey}
          tempFilters={tempFilters}
          setTempFilters={setTempFilters}
          onApply={applyFilter}
          onReset={resetFilter}
          options={getOverlayOptions({
            filterKey: openFilterKey,
            availableFileTypeCategories,
            availableTaskStatusOptions,
            availableStatusInfoOptions,
          })}
        />
      </div>
    </>,
    document.body
  )
}
