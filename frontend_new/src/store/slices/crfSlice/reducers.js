import { initialState } from './initialState'

export const crfReducers = {
  setTemplates: (state, action) => {
    state.templates.list = action.payload.templates
    state.templates.total = action.payload.total
  },
  setTemplatesLoading: (state, action) => {
    state.templates.loading = action.payload
  },
  updateTemplateFilters: (state, action) => {
    state.templates.filters = { ...state.templates.filters, ...action.payload }
  },
  addTemplate: (state, action) => {
    state.templates.list.unshift(action.payload)
    state.templates.total += 1
  },
  updateTemplate: (state, action) => {
    const { id, updates } = action.payload
    const templateIndex = state.templates.list.findIndex((template) => template.id === id)
    if (templateIndex !== -1) {
      state.templates.list[templateIndex] = { ...state.templates.list[templateIndex], ...updates }
    }
  },
  removeTemplate: (state, action) => {
    state.templates.list = state.templates.list.filter((template) => template.id !== action.payload)
    state.templates.total -= 1
  },

  setCurrentTemplate: (state, action) => {
    state.currentTemplate = { ...initialState.currentTemplate, ...action.payload }
    state.currentTemplate.hasUnsavedChanges = false
  },
  updateCurrentTemplate: (state, action) => {
    state.currentTemplate = { ...state.currentTemplate, ...action.payload }
    if (action.payload.fieldGroups || action.payload.name || action.payload.description) {
      state.currentTemplate.hasUnsavedChanges = true
    }
  },
  setCurrentTemplateLoading: (state, action) => {
    state.currentTemplate.loading = action.payload
  },
  setCurrentTemplateSaving: (state, action) => {
    state.currentTemplate.saving = action.payload
  },
  markTemplateAsSaved: (state) => {
    state.currentTemplate.hasUnsavedChanges = false
    state.currentTemplate.updatedAt = new Date().toISOString()
  },

  addFieldGroup: (state, action) => {
    const newGroup = {
      id: `group_${Date.now()}`,
      name: action.payload.name || '新字段组',
      description: action.payload.description || '',
      repeatable: action.payload.repeatable || false,
      order: state.currentTemplate.fieldGroups.length,
      fields: [],
      sampleDocuments: [],
      aiPrompt: '',
    }
    state.currentTemplate.fieldGroups.push(newGroup)
    state.currentTemplate.hasUnsavedChanges = true
  },
  updateFieldGroup: (state, action) => {
    const { groupId, updates } = action.payload
    const groupIndex = state.currentTemplate.fieldGroups.findIndex((group) => group.id === groupId)
    if (groupIndex !== -1) {
      state.currentTemplate.fieldGroups[groupIndex] = {
        ...state.currentTemplate.fieldGroups[groupIndex],
        ...updates,
      }
      state.currentTemplate.hasUnsavedChanges = true
    }
  },
  removeFieldGroup: (state, action) => {
    state.currentTemplate.fieldGroups = state.currentTemplate.fieldGroups.filter(
      (group) => group.id !== action.payload,
    )
    state.currentTemplate.hasUnsavedChanges = true

    if (state.fieldGroupEditor.selectedGroupId === action.payload) {
      state.fieldGroupEditor.selectedGroupId = null
      state.fieldGroupEditor.selectedFieldId = null
    }
  },
  reorderFieldGroups: (state, action) => {
    const { sourceIndex, destinationIndex } = action.payload
    const groups = [...state.currentTemplate.fieldGroups]
    const [removed] = groups.splice(sourceIndex, 1)
    groups.splice(destinationIndex, 0, removed)
    groups.forEach((group, index) => {
      group.order = index
    })
    state.currentTemplate.fieldGroups = groups
    state.currentTemplate.hasUnsavedChanges = true
  },

  addField: (state, action) => {
    const { groupId, field } = action.payload
    const groupIndex = state.currentTemplate.fieldGroups.findIndex((group) => group.id === groupId)
    if (groupIndex === -1) return
    const newField = {
      id: `field_${Date.now()}`,
      name: field.name || '新字段',
      type: field.type || 'text',
      category: field.category || 'fields',
      tableName: field.tableName || '',
      description: field.description || '',
      exampleValues: field.exampleValues || [],
      options: field.options || [],
      required: field.required || false,
      validation: field.validation || {},
      order: state.currentTemplate.fieldGroups[groupIndex].fields.length,
      aiPrompt: '',
    }
    state.currentTemplate.fieldGroups[groupIndex].fields.push(newField)
    state.currentTemplate.hasUnsavedChanges = true
  },
  updateField: (state, action) => {
    const { groupId, fieldId, updates } = action.payload
    const groupIndex = state.currentTemplate.fieldGroups.findIndex((group) => group.id === groupId)
    if (groupIndex === -1) return
    const fieldIndex = state.currentTemplate.fieldGroups[groupIndex].fields.findIndex(
      (field) => field.id === fieldId,
    )
    if (fieldIndex !== -1) {
      state.currentTemplate.fieldGroups[groupIndex].fields[fieldIndex] = {
        ...state.currentTemplate.fieldGroups[groupIndex].fields[fieldIndex],
        ...updates,
      }
      state.currentTemplate.hasUnsavedChanges = true
    }
  },
  removeField: (state, action) => {
    const { groupId, fieldId } = action.payload
    const groupIndex = state.currentTemplate.fieldGroups.findIndex((group) => group.id === groupId)
    if (groupIndex === -1) return
    state.currentTemplate.fieldGroups[groupIndex].fields =
      state.currentTemplate.fieldGroups[groupIndex].fields.filter((field) => field.id !== fieldId)
    state.currentTemplate.hasUnsavedChanges = true

    if (state.fieldGroupEditor.selectedFieldId === fieldId) {
      state.fieldGroupEditor.selectedFieldId = null
    }
  },
  reorderFields: (state, action) => {
    const { groupId, sourceIndex, destinationIndex } = action.payload
    const groupIndex = state.currentTemplate.fieldGroups.findIndex((group) => group.id === groupId)
    if (groupIndex === -1) return
    const fields = [...state.currentTemplate.fieldGroups[groupIndex].fields]
    const [removed] = fields.splice(sourceIndex, 1)
    fields.splice(destinationIndex, 0, removed)
    fields.forEach((field, index) => {
      field.order = index
    })
    state.currentTemplate.fieldGroups[groupIndex].fields = fields
    state.currentTemplate.hasUnsavedChanges = true
  },

  setSelectedGroup: (state, action) => {
    state.fieldGroupEditor.selectedGroupId = action.payload
    state.fieldGroupEditor.selectedFieldId = null
  },
  setSelectedField: (state, action) => {
    state.fieldGroupEditor.selectedFieldId = action.payload
  },
  toggleGroupExpanded: (state, action) => {
    const groupId = action.payload
    if (state.fieldGroupEditor.expandedGroups.includes(groupId)) {
      state.fieldGroupEditor.expandedGroups = state.fieldGroupEditor.expandedGroups.filter((id) => id !== groupId)
    } else {
      state.fieldGroupEditor.expandedGroups.push(groupId)
    }
  },
  setDraggedItem: (state, action) => {
    state.fieldGroupEditor.draggedItem = action.payload
  },

  setFieldTemplates: (state, action) => {
    state.fieldTemplates.categories = action.payload
  },
  setFieldTemplatesLoading: (state, action) => {
    state.fieldTemplates.loading = action.payload
  },
  setPreviewVisible: (state, action) => {
    state.preview.visible = action.payload
  },
  setPreviewMode: (state, action) => {
    state.preview.mode = action.payload
  },
  setPreviewData: (state, action) => {
    state.preview.data = action.payload
  },
  resetCurrentTemplate: (state) => {
    state.currentTemplate = { ...initialState.currentTemplate }
    state.fieldGroupEditor = { ...initialState.fieldGroupEditor }
  },
}
