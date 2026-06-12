/**
 * Schema 解析器门面。
 * 具体 JSON Schema -> 设计模型解析逻辑拆分在 ./schemaParser/ 下。
 */
import {
  inferDataType,
  inferDisplayType,
  inferOptionsId,
  orderedPropertyEntries,
  parseEnums,
  parseExtendedConfig,
  parseExtractionUnit,
  parseOptions,
  parseTableRows,
  generateId,
} from './schemaParser/utils.js'
import {
  parseField,
  parseFields,
} from './schemaParser/fieldParser.js'
import {
  parseFolders,
  parseGroup,
  parseGroupType,
  parseMeta,
  parseSchema,
} from './schemaParser/modelParser.js'

export class SchemaParser {
  static _orderedPropertyEntries(properties, parentNode) {
    return orderedPropertyEntries(properties, parentNode)
  }

  static parseSchema(schema) {
    return parseSchema(schema)
  }

  static _parseMeta(schema) {
    return parseMeta(schema)
  }

  static _parseFolders(schema, enums) {
    return parseFolders(schema, enums)
  }

  static _parseGroup(name, schema, folderName, enums) {
    return parseGroup(name, schema, folderName, enums)
  }

  static _parseGroupType(schema) {
    return parseGroupType(schema)
  }

  static _parseFields(groupSchema, required, folderName, groupName, enums) {
    return parseFields(groupSchema, required, folderName, groupName, enums)
  }

  static _parseField(name, schema, isRequired = false, enums = {}) {
    return parseField(name, schema, isRequired, enums)
  }

  static _inferOptionsId(schema) {
    return inferOptionsId(schema)
  }

  static _inferDisplayType(schema) {
    return inferDisplayType(schema)
  }

  static _inferDataType(displayType) {
    return inferDataType(displayType)
  }

  static _parseOptions(schema, enums = {}) {
    return parseOptions(schema, enums)
  }

  static _parseEnums(schema) {
    return parseEnums(schema)
  }

  static _parseExtendedConfig(schema) {
    return parseExtendedConfig(schema)
  }

  static _parseTableRows(schema) {
    return parseTableRows(schema)
  }

  static _parseExtractionUnit(schemaNode) {
    return parseExtractionUnit(schemaNode)
  }

  static _generateId(prefix) {
    return generateId(prefix)
  }
}

export default SchemaParser
