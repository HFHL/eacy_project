/**
 * Schema 生成器门面。
 * JSON Schema 和 CSV 导出逻辑拆分在 ./schemaGenerator/ 下。
 */
import {
  generateDefs,
  generateField,
  generateTableField,
} from './schemaGenerator/fieldSchema.js'
import {
  generateGroup,
  generateMeta,
  generateProperties,
  generateSchema,
} from './schemaGenerator/objectSchema.js'
import {
  appendFieldRows,
  buildLevelColumns,
  generateCSV,
  generateFieldCSVRow,
  generateGroupCSVRow,
  generateNestedTableCSVRow,
  generateTableCSVRow,
  mapDataTypeToCSV,
} from './schemaGenerator/csvExport.js'

export class SchemaGenerator {
  static generateSchema(designModel) {
    return generateSchema(designModel)
  }

  static generateCSV(designModel) {
    return generateCSV(designModel)
  }

  static _generateProperties(folders) {
    return generateProperties(folders)
  }

  static _generateGroup(group) {
    return generateGroup(group)
  }

  static _generateTableField(field) {
    return generateTableField(field)
  }

  static _generateField(field) {
    return generateField(field)
  }

  static _generateDefs(enums) {
    return generateDefs(enums)
  }

  static _generateMeta(designModel) {
    return generateMeta(designModel)
  }

  static _generateGroupCSVRow(folder, group) {
    return generateGroupCSVRow(folder, group)
  }

  static _generateTableCSVRow(folder, group, field) {
    return generateTableCSVRow(folder, group, field)
  }

  static _generateNestedTableCSVRow(folder, group, parentTables, field) {
    return generateNestedTableCSVRow(folder, group, parentTables, field)
  }

  static _generateFieldCSVRow(folder, group, parentTables, field) {
    return generateFieldCSVRow(folder, group, parentTables, field)
  }

  static _appendFieldRows(rows, folder, group, field, parentTables) {
    return appendFieldRows(rows, folder, group, field, parentTables)
  }

  static _buildLevelColumns(levels) {
    return buildLevelColumns(levels)
  }

  static _mapDataTypeToCSV(dataType, displayType) {
    return mapDataTypeToCSV(dataType, displayType)
  }
}

export default SchemaGenerator
