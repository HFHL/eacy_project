export const initialState = {
  templates: {
    list: [],
    total: 0,
    loading: false,
    filters: {
      search: '',
      status: '',
      createdBy: '',
    },
  },
  currentTemplate: {
    id: null,
    name: '',
    description: '',
    version: '1.0.0',
    fieldGroups: [],
    status: 'draft',
    createdBy: null,
    createdAt: null,
    updatedAt: null,
    loading: false,
    saving: false,
    hasUnsavedChanges: false,
  },
  fieldGroupEditor: {
    selectedGroupId: null,
    selectedFieldId: null,
    expandedGroups: [],
    draggedItem: null,
    previewMode: false,
  },
  fieldTemplates: {
    categories: [],
    loading: false,
  },
  preview: {
    visible: false,
    mode: 'form',
    data: null,
  },
}
