import { DISPLAY_TYPES } from '../constants'

export const validateDesignModel = (designModel) => {
  const errors = []

  if (!designModel.folders || !Array.isArray(designModel.folders)) {
    return {
      valid: false,
      errors: [{ message: '设计模型必须包含folders数组', field: 'folders' }],
    }
  }

  if (designModel.folders.length === 0) {
    return {
      valid: false,
      errors: [{ message: '至少需要一个文件夹', field: 'folders' }],
    }
  }

  for (const folder of designModel.folders) {
    errors.push(...validateFolderModel(folder))
  }
  return errors.length > 0 ? { valid: false, errors } : { valid: true, errors: [] }
}

export const validateFolderModel = (folder) => {
  const errors = []
  if (!folder.id) {
    errors.push({ message: '文件夹缺少id', field: 'folder.id' })
  }
  if (!folder.name || folder.name.trim() === '') {
    errors.push({ message: '文件夹名称不能为空', field: 'folder.name' })
  }
  if (!folder.groups || !Array.isArray(folder.groups)) {
    errors.push({ message: '文件夹必须包含groups数组', field: 'folder.groups' })
  }

  if (folder.groups) {
    for (const group of folder.groups) {
      errors.push(...validateGroupModel(group, folder.name))
    }
  }
  return errors
}

export const validateGroupModel = (group, folderName) => {
  const errors = []
  if (!group.id) {
    errors.push({ message: '字段组缺少id', field: 'group.id' })
  }
  if (!group.name || group.name.trim() === '') {
    errors.push({ message: '字段组名称不能为空', field: 'group.name' })
  }
  if (!group.fields || !Array.isArray(group.fields)) {
    errors.push({ message: `字段组"${group.name}"必须包含fields数组`, field: 'group.fields' })
  }

  if (group.fields) {
    for (const field of group.fields) {
      errors.push(...validateFieldModel(field, group.name, folderName))
    }
  }
  return errors
}

export const validateFieldModel = (field) => {
  const errors = []
  if (!field.id) {
    errors.push({ message: '字段缺少id', field: 'field.id' })
  }
  if (!field.name || field.name.trim() === '') {
    errors.push({ message: '字段名称不能为空', field: 'field.name' })
  }
  if (!field.displayType) {
    errors.push({ message: `字段"${field.name}"缺少displayType`, field: 'field.displayType' })
  } else if (!Object.values(DISPLAY_TYPES).includes(field.displayType)) {
    errors.push({
      message: `字段"${field.name}"的displayType无效: ${field.displayType}`,
      field: 'field.displayType',
    })
  }

  if (['radio', 'checkbox', 'select', 'multiselect'].includes(field.displayType)) {
    if (!field.options || !Array.isArray(field.options) || field.options.length === 0) {
      errors.push({
        message: `字段"${field.name}"是选项类型但缺少options配置`,
        field: 'field.options',
      })
    }
  }
  return errors
}
