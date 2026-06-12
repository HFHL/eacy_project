import { createSlice } from '@reduxjs/toolkit'

import { initialState } from './crfSlice/initialState'
import { crfReducers } from './crfSlice/reducers'

const crfSlice = createSlice({
  name: 'crf',
  initialState,
  reducers: crfReducers,
})

export const {
  setTemplates,
  setTemplatesLoading,
  updateTemplateFilters,
  addTemplate,
  updateTemplate,
  removeTemplate,
  setCurrentTemplate,
  updateCurrentTemplate,
  setCurrentTemplateLoading,
  setCurrentTemplateSaving,
  markTemplateAsSaved,
  addFieldGroup,
  updateFieldGroup,
  removeFieldGroup,
  reorderFieldGroups,
  addField,
  updateField,
  removeField,
  reorderFields,
  setSelectedGroup,
  setSelectedField,
  toggleGroupExpanded,
  setDraggedItem,
  setPreviewMode,
  setFieldTemplates,
  setFieldTemplatesLoading,
  setPreviewVisible,
  setPreviewData,
  resetCurrentTemplate,
} = crfSlice.actions

export default crfSlice.reducer
