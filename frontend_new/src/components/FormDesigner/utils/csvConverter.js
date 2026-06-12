/**
 * CSV 转换器门面。
 * 具体解析、模型构建和文件 IO 分散在 ./csvConverter/ 下的小模块中。
 */
import SchemaGenerator from '../core/SchemaGenerator.js'
import {
  buildField,
  csvToDesignModel,
  ensureFolder,
  ensureGroup,
  ensureTableField,
  ensureTablePath,
  mergeGroupMeta,
} from './csvConverter/modelBuilder.js'
import {
  buildHeaderIndex,
  extractHeaderAndRows,
  getValue,
  isHeaderRow,
  normalizeHeaders,
  normalizeHeaderToken,
  validateCSVHeaders,
} from './csvConverter/headerUtils.js'
import {
  importCSV,
  downloadCSV,
  validateCSV,
} from './csvConverter/fileIO.js'
import {
  makeId,
  parseBoolean,
  parseDataType,
  parseDisplayType,
  parseEditable,
  parseJsonConfig,
  parseList,
  parseNullable,
  parseRepeatable,
  parseTableRows,
} from './csvConverter/parseUtils.js'

export class CSVConverter {
  static designModelToCSV(designModel) {
    const { headers, rows } = SchemaGenerator.generateCSV(designModel)
    return [headers, ...rows]
  }

  static csvToDesignModel(csvData) {
    return csvToDesignModel(csvData)
  }

  static downloadCSV(csvData, filename = 'schema.csv') {
    return downloadCSV(csvData, filename)
  }

  static importCSV(file) {
    return importCSV(file)
  }

  static validateCSV(csvData) {
    return validateCSV(csvData)
  }

  static _extractHeaderAndRows(csvData) {
    return extractHeaderAndRows(csvData)
  }

  static _isHeaderRow(headers) {
    return isHeaderRow(headers)
  }

  static _normalizeHeaders(headers) {
    return normalizeHeaders(headers)
  }

  static _validateCSVHeaders(headers) {
    return validateCSVHeaders(headers)
  }

  static _buildHeaderIndex(headers) {
    return buildHeaderIndex(headers)
  }

  static _normalizeHeaderToken(token) {
    return normalizeHeaderToken(token)
  }

  static _getValue(row, headerIndex, key) {
    return getValue(row, headerIndex, key)
  }

  static _ensureFolder(folderMap, folderName) {
    return ensureFolder(folderMap, folderName)
  }

  static _ensureGroup(folder, groupName) {
    return ensureGroup(folder, groupName)
  }

  static _mergeGroupMeta(group, row, headerIndex, displayType) {
    return mergeGroupMeta(group, row, headerIndex, displayType)
  }

  static _ensureTableField(group, tableName, row, headerIndex, options = {}) {
    return ensureTableField(group, tableName, row, headerIndex, options)
  }

  static _ensureTablePath(group, tableLevels, row, headerIndex, options = {}) {
    return ensureTablePath(group, tableLevels, row, headerIndex, options)
  }

  static _buildField(fieldName, row, headerIndex, displayType) {
    return buildField(fieldName, row, headerIndex, displayType)
  }

  static _parseDisplayType(value) {
    return parseDisplayType(value)
  }

  static _parseDataType(value, displayType, options = []) {
    return parseDataType(value, displayType, options)
  }

  static _parseRepeatable(value) {
    return parseRepeatable(value)
  }

  static _parseTableRows(value) {
    return parseTableRows(value)
  }

  static _parseNullable(value) {
    return parseNullable(value)
  }

  static _parseEditable(value) {
    return parseEditable(value)
  }

  static _parseBoolean(value) {
    return parseBoolean(value)
  }

  static _parseList(value) {
    return parseList(value)
  }

  static _parseJsonConfig(value) {
    return parseJsonConfig(value)
  }

  static _makeId(prefix) {
    return makeId(prefix)
  }
}

export default CSVConverter
