/**
 * Schema 验证器门面。
 * 结构校验、设计模型校验和值校验拆分在 ./validators/ 下。
 */
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import {
  validateSchemaFormat,
  validateFolders,
  validateGroups,
  validateFields,
} from './validators/schemaFormat'
import {
  validateDesignModel,
  validateFolderModel,
  validateGroupModel,
  validateFieldModel,
} from './validators/designModel'
import { validateFieldValue } from './validators/fieldValue'
import { normalizeSchemaForDesigner as normalizeSchema } from './validators/normalize'

export class SchemaValidator {
  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false })
    addFormats(this.ajv)
  }

  normalizeSchemaForDesigner(schema) {
    return normalizeSchema(schema)
  }

  validateSchemaFormat(schema) {
    return validateSchemaFormat(schema)
  }

  _validateFolders(properties) {
    return validateFolders(properties)
  }

  _validateGroups(properties, folderName) {
    return validateGroups(properties, folderName)
  }

  _validateFields(properties, folderName, groupName) {
    return validateFields(properties, folderName, groupName)
  }

  validateDesignModel(designModel) {
    return validateDesignModel(designModel)
  }

  _validateFolderModel(folder) {
    return validateFolderModel(folder)
  }

  _validateGroupModel(group, folderName) {
    return validateGroupModel(group, folderName)
  }

  _validateFieldModel(field, groupName, folderName) {
    return validateFieldModel(field, groupName, folderName)
  }

  validateFieldValue(value, fieldSchema) {
    return validateFieldValue(value, fieldSchema)
  }
}

export const schemaValidator = new SchemaValidator()

export const normalizeSchemaForDesigner = (schema) => (
  schemaValidator.normalizeSchemaForDesigner(schema)
)
