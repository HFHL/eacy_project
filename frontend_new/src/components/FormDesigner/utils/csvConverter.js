/**
 * CSV转换器
 * 提供 CSV 导入导出功能，并兼容当前层级式 CRF CSV 模板。
 */

import Papa from 'papaparse';
import { CSV_COLUMNS, CSV_COLUMN_ALIASES, DISPLAY_TYPES } from '../core/constants.js';
import SchemaGenerator from '../core/SchemaGenerator.js';

const LEVEL_HEADERS = [CSV_COLUMNS.LEVEL1, ...CSV_COLUMNS.LEVEL2_10];
const HEADER_KEYWORDS = new Set([
  CSV_COLUMNS.FOLDER,
  '文件夹',
  CSV_COLUMNS.LEVEL1,
  '层级1',
  '层级2',
  CSV_COLUMNS.DISPLAY_TYPE,
  CSV_COLUMNS.DATA_TYPE
]);

/**
 * CSV转换器类
 */
export class CSVConverter {
  /**
   * 将设计模型转换为当前层级式 CSV。
   * @param {Object} designModel
   * @returns {Array}
   */
  static designModelToCSV(designModel) {
    const { headers, rows } = SchemaGenerator.generateCSV(designModel);
    return [headers, ...rows];
  }

  /**
   * 将 CSV 数据转换为设计模型。
   * @param {Array} csvData
   * @returns {Object}
   */
  static csvToDesignModel(csvData) {
    if (!Array.isArray(csvData) || csvData.length < 2) {
      throw new Error('CSV数据为空或格式不正确');
    }

    const { headers, rows } = this._extractHeaderAndRows(csvData);
    const headerIndex = this._buildHeaderIndex(headers);
    this._validateCSVHeaders(headerIndex);

    const folderMap = new Map();

    rows.forEach((row) => {
      if (!Array.isArray(row) || !row.some((cell) => String(cell || '').trim())) return;

      const folderName = this._getValue(row, headerIndex, CSV_COLUMNS.FOLDER);
      const levelValues = LEVEL_HEADERS.map((header) => this._getValue(row, headerIndex, header));
      const groupName = levelValues[0];
      const nestedLevels = levelValues.slice(1).filter(Boolean);
      const displayType = this._parseDisplayType(this._getValue(row, headerIndex, CSV_COLUMNS.DISPLAY_TYPE));

      if (!folderName || !groupName || !displayType) return;

      const folder = this._ensureFolder(folderMap, folderName);
      const group = this._ensureGroup(folder, groupName);
      this._mergeGroupMeta(group, row, headerIndex, displayType);

      if (displayType === DISPLAY_TYPES.GROUP) {
        return;
      }

      if (displayType === DISPLAY_TYPES.TABLE) {
        // 兼容“层级1本身就是 table 容器”的定义行（例如：身份信息=单行 table）。
        if (nestedLevels.length === 0) {
          const tableRows = this._parseTableRows(this._getValue(row, headerIndex, CSV_COLUMNS.TABLE_MULTI_ROW));
          const isMultiRow = tableRows === 'multiRow';
          group.type = DISPLAY_TYPES.TABLE;
          group.repeatable = isMultiRow;
          group.multiRow = isMultiRow;
          group.config = { ...(group.config || {}), tableRows };
          return;
        }
        this._ensureTablePath(group, nestedLevels, row, headerIndex, {
          applyTableRowsOnLeaf: true
        });
        return;
      }

      if (nestedLevels.length === 0) {
        return;
      }

      if (nestedLevels.length === 1) {
        group.fields.push(this._buildField(nestedLevels[0], row, headerIndex, displayType));
        return;
      }

      // 字段行用于补充列定义，不应反向覆盖 tableRows。
      const tableField = this._ensureTablePath(group, nestedLevels.slice(0, -1), row, headerIndex, {
        applyTableRowsOnLeaf: false
      });
      if (!tableField) return;
      const childName = nestedLevels[nestedLevels.length - 1];
      tableField.children.push(this._buildField(childName, row, headerIndex, displayType));
    });

    return {
      meta: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'generated-from-csv',
        title: '从CSV导入的Schema',
        version: '1.0.0',
        projectId: 'csv-import',
        createdAt: new Date().toISOString()
      },
      folders: Array.from(folderMap.values()),
      enums: {}
    };
  }

  /**
   * 提取表头与数据行，兼容“首行为说明、次行为表头”的 CSV。
   * @param {Array} csvData
   * @returns {{headers: string[], rows: Array}}
   */
  static _extractHeaderAndRows(csvData) {
    const firstRow = this._normalizeHeaders(csvData[0] || []);
    if (this._isHeaderRow(firstRow)) {
      return { headers: firstRow, rows: csvData.slice(1) };
    }
    const secondRow = this._normalizeHeaders(csvData[1] || []);
    if (this._isHeaderRow(secondRow)) {
      return { headers: secondRow, rows: csvData.slice(2) };
    }
    throw new Error('CSV表头格式不正确');
  }

  /**
   * 判断某一行是否为表头。
   * @param {string[]} headers
   * @returns {boolean}
   */
  static _isHeaderRow(headers) {
    return headers.some((header) => {
      const normalized = this._normalizeHeaderToken(header);
      if (!normalized) return false;
      for (const keyword of HEADER_KEYWORDS) {
        if (this._normalizeHeaderToken(keyword) === normalized) return true;
      }
      return false;
    });
  }

  /**
   * 规范化表头文本。
   * @param {Array} headers
   * @returns {string[]}
   */
  static _normalizeHeaders(headers) {
    return headers.map((header, index) => {
      const text = String(header || '').trim();
      if (index === 0) {
        return text.replace(/^\ufeff/, '');
      }
      return text;
    });
  }

  /**
   * 验证 CSV 表头。
   * @param {Map<string, number>} headers
   */
  static _validateCSVHeaders(headers) {
    const requiredHeaders = [
      CSV_COLUMNS.FOLDER,
      CSV_COLUMNS.LEVEL1,
      CSV_COLUMNS.DISPLAY_TYPE
    ];

    const missingHeaders = requiredHeaders.filter((required) => headers.get(required) === undefined);
    if (missingHeaders.length > 0) {
      throw new Error(`CSV缺少必需的列: ${missingHeaders.join(', ')}`);
    }
  }

  /**
   * 构建标准列索引（支持别名和格式变体）。
   * @param {string[]} headers
   * @returns {Map<string, number>}
   */
  static _buildHeaderIndex(headers) {
    const normalizedIndex = new Map();
    headers.forEach((header, index) => {
      normalizedIndex.set(this._normalizeHeaderToken(header), index);
    });

    const columnIndex = new Map();
    const register = (key, label) => {
      const idx = normalizedIndex.get(this._normalizeHeaderToken(label));
      if (idx !== undefined && columnIndex.get(key) === undefined) {
        columnIndex.set(key, idx);
      }
    };

    for (const [key, canonicalName] of Object.entries(CSV_COLUMNS)) {
      if (key === 'LEVEL2_10') continue;
      register(canonicalName, canonicalName);
      const aliases = CSV_COLUMN_ALIASES[key] || [];
      aliases.forEach((alias) => register(canonicalName, alias));
    }

    LEVEL_HEADERS.forEach((header) => register(header, header));
    return columnIndex;
  }

  /**
   * 归一化列名文本（消除空格/括号/BOM差异）。
   * @param {string} token
   * @returns {string}
   */
  static _normalizeHeaderToken(token) {
    return String(token || '')
      .replace(/^\ufeff/, '')
      .trim()
      .replace(/\s+/g, '')
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .toLowerCase();
  }

  /**
   * 获取单元格值。
   * @param {Array} row
   * @param {Map} headerIndex
   * @param {string} key
   * @returns {string}
   */
  static _getValue(row, headerIndex, key) {
    const index = headerIndex.get(key);
    if (index === undefined || index >= row.length) return '';
    return String(row[index] || '').trim();
  }

  /**
   * 确保 folder 存在。
   * @param {Map} folderMap
   * @param {string} folderName
   * @returns {Object}
   */
  static _ensureFolder(folderMap, folderName) {
    if (!folderMap.has(folderName)) {
      folderMap.set(folderName, {
        id: this._makeId('folder'),
        name: folderName,
        groups: []
      });
    }
    return folderMap.get(folderName);
  }

  /**
   * 确保 group 存在。
   * @param {Object} folder
   * @param {string} groupName
   * @returns {Object}
   */
  static _ensureGroup(folder, groupName) {
    let group = folder.groups.find((item) => item.name === groupName);
    if (!group) {
      group = {
        id: this._makeId('group'),
        name: groupName,
        displayName: groupName,
        description: '',
        type: DISPLAY_TYPES.GROUP,
        repeatable: false,
        multiRow: false,
        isExtractionUnit: false,
        mergeBinding: '',
        sources: null,
        config: {},
        fields: [],
        required: []
      };
      folder.groups.push(group);
    }
    return group;
  }

  /**
   * 合并 group 元数据。
   * @param {Object} group
   * @param {Array} row
   * @param {Map} headerIndex
   */
  static _mergeGroupMeta(group, row, headerIndex, displayType) {
    const repeatable = this._parseRepeatable(this._getValue(row, headerIndex, CSV_COLUMNS.GROUP_REPEATABLE));
    const extractionUnit = this._parseBoolean(this._getValue(row, headerIndex, CSV_COLUMNS.IS_EXTRACTION_UNIT));
    const primarySources = this._parseList(this._getValue(row, headerIndex, CSV_COLUMNS.PRIMARY_SOURCES));
    const secondarySources = this._parseList(this._getValue(row, headerIndex, CSV_COLUMNS.SECONDARY_SOURCES));
    const mergeBinding = this._getValue(row, headerIndex, CSV_COLUMNS.TIME_BINDING);
    const groupPrompt = this._getValue(row, headerIndex, CSV_COLUMNS.EXTRACTION_PROMPT);

    if (repeatable !== null) group.repeatable = repeatable;
    if (extractionUnit !== null) group.isExtractionUnit = extractionUnit;
    if (primarySources.length > 0 || secondarySources.length > 0) {
      group.sources = {
        primary: primarySources,
        secondary: secondarySources,
      };
      group.primarySources = primarySources;
      group.secondarySources = secondarySources;
      group.isExtractionUnit = extractionUnit !== null ? extractionUnit : true;
    } else if (extractionUnit !== null) {
      group.isExtractionUnit = extractionUnit;
      group.sources = null;
    }
    if (mergeBinding) group.mergeBinding = mergeBinding;
    if (displayType === DISPLAY_TYPES.GROUP && groupPrompt && !group.description) {
      group.description = groupPrompt;
    }
  }

  /**
   * 确保 table 字段存在。
   * @param {Object} group
   * @param {string} tableName
   * @param {Array} row
   * @param {Map} headerIndex
   * @returns {Object}
   */
  static _ensureTableField(group, tableName, row, headerIndex, options = {}) {
    const { applyTableRows = true } = options;
    const childList = Array.isArray(group.fields) ? group.fields : group.children;
    if (!Array.isArray(childList)) return null;

    let field = childList.find((item) => item.name === tableName && item.isTable);
    if (!field) {
      field = {
        id: this._makeId('field'),
        name: tableName,
        displayName: tableName,
        displayType: DISPLAY_TYPES.TABLE,
        dataType: 'array',
        repeatable: true,
        multiRow: true,
        isTable: true,
        nullable: true,
        sensitive: false,
        primary: false,
        editable: true,
        description: '',
        required: false,
        children: [],
        config: { tableRows: 'multiRow' }
      };
      childList.push(field);
    }

    if (applyTableRows) {
      const tableRows = this._parseTableRows(this._getValue(row, headerIndex, CSV_COLUMNS.TABLE_MULTI_ROW));
      field.repeatable = tableRows === 'multiRow';
      field.multiRow = tableRows === 'multiRow';
      field.config = { ...(field.config || {}), tableRows };
    }
    return field;
  }

  /**
   * 按完整层级确保 table 路径存在（支持 table 内嵌 table）。
   * @param {Object} group
   * @param {string[]} tableLevels
   * @param {Array} row
   * @param {Map} headerIndex
   * @param {{applyTableRowsOnLeaf?: boolean}} options
   * @returns {Object|null}
   */
  static _ensureTablePath(group, tableLevels, row, headerIndex, options = {}) {
    const { applyTableRowsOnLeaf = true } = options;
    if (!Array.isArray(tableLevels) || tableLevels.length === 0) return null;

    let currentContainer = group;
    tableLevels.forEach((tableName, index) => {
      currentContainer = this._ensureTableField(currentContainer, tableName, row, headerIndex, {
        applyTableRows: applyTableRowsOnLeaf && index === tableLevels.length - 1
      });
    });
    return currentContainer;
  }

  /**
   * 构建普通字段。
   * @param {string} fieldName
   * @param {Array} row
   * @param {Map} headerIndex
   * @param {string} displayType
   * @returns {Object}
   */
  static _buildField(fieldName, row, headerIndex, displayType) {
    const parsedOptions = this._parseList(this._getValue(row, headerIndex, CSV_COLUMNS.OPTIONS));
    const nullable = this._parseNullable(this._getValue(row, headerIndex, CSV_COLUMNS.IS_NULLABLE));
    const editable = this._parseEditable(this._getValue(row, headerIndex, CSV_COLUMNS.IS_EDITABLE));
    const config = this._parseJsonConfig(this._getValue(row, headerIndex, CSV_COLUMNS.EXTENDED_CONFIG));
    const minimum = typeof config?.minimum === 'number' ? config.minimum : undefined;
    const maximum = typeof config?.maximum === 'number' ? config.maximum : undefined;
    const pattern = typeof config?.pattern === 'string' ? config.pattern : undefined;
    const normalizedConfig = config ? { ...config } : undefined;
    if (normalizedConfig) {
      delete normalizedConfig.minimum;
      delete normalizedConfig.maximum;
      delete normalizedConfig.pattern;
    }

    return {
      id: this._makeId('field'),
      uid: this._getValue(row, headerIndex, CSV_COLUMNS.FIELD_UID) || undefined,
      name: fieldName,
      displayName: fieldName,
      displayType,
      dataType: this._parseDataType(
        this._getValue(row, headerIndex, CSV_COLUMNS.DATA_TYPE),
        displayType,
        parsedOptions
      ),
      unit: this._getValue(row, headerIndex, CSV_COLUMNS.DATA_UNIT) || '',
      options: parsedOptions,
      nullable,
      sensitive: this._parseBoolean(this._getValue(row, headerIndex, CSV_COLUMNS.IS_SENSITIVE)) === true,
      primary: this._parseBoolean(this._getValue(row, headerIndex, CSV_COLUMNS.IS_PRIMARY)) === true,
      editable,
      description: this._getValue(row, headerIndex, CSV_COLUMNS.FIELD_DESC) || '',
      extractionPrompt: this._getValue(row, headerIndex, CSV_COLUMNS.EXTRACTION_PROMPT) || '',
      required: !nullable,
      minimum,
      maximum,
      pattern,
      config: normalizedConfig && Object.keys(normalizedConfig).length > 0 ? normalizedConfig : undefined
    };
  }

  /**
   * 解析展示类型。
   * @param {string} value
   * @returns {string}
   */
  static _parseDisplayType(value) {
    const normalized = String(value || '').trim();
    const typeMap = {
      text: DISPLAY_TYPES.TEXT,
      textarea: DISPLAY_TYPES.TEXTAREA,
      number: DISPLAY_TYPES.NUMBER,
      date: DISPLAY_TYPES.DATE,
      datetime: DISPLAY_TYPES.DATETIME,
      radio: DISPLAY_TYPES.RADIO,
      checkbox: DISPLAY_TYPES.CHECKBOX,
      select: DISPLAY_TYPES.SELECT,
      multiselect: DISPLAY_TYPES.MULTISELECT,
      file: DISPLAY_TYPES.FILE,
      group: DISPLAY_TYPES.GROUP,
      table: DISPLAY_TYPES.TABLE,
      文本: DISPLAY_TYPES.TEXT,
      多行文本: DISPLAY_TYPES.TEXTAREA,
      数字: DISPLAY_TYPES.NUMBER,
      日期: DISPLAY_TYPES.DATE,
      日期时间: DISPLAY_TYPES.DATETIME,
      单选: DISPLAY_TYPES.RADIO,
      多选: DISPLAY_TYPES.CHECKBOX,
      下拉单选: DISPLAY_TYPES.SELECT,
      下拉多选: DISPLAY_TYPES.MULTISELECT,
      文件: DISPLAY_TYPES.FILE,
      分组: DISPLAY_TYPES.GROUP,
      表格: DISPLAY_TYPES.TABLE
    };
    return typeMap[normalized] || normalized || DISPLAY_TYPES.TEXT;
  }

  /**
   * 解析数据类型。
   * @param {string} value
   * @param {string} displayType
   * @param {string[]} [options=[]]
   * @returns {string}
   */
  static _parseDataType(value, displayType, options = []) {
    const normalized = String(value || '').trim();
    const dataTypeMap = {
      文本: 'string',
      数字: 'number',
      日期: 'string',
      日期时间: 'string',
      布尔: 'boolean',
      布尔值: 'boolean',
      数组: 'array',
      boolean: 'boolean',
      string: 'string',
      number: 'number',
      array: 'array'
    };
    if (dataTypeMap[normalized]) return dataTypeMap[normalized];
    if (displayType === DISPLAY_TYPES.NUMBER) return 'number';
    if (displayType === DISPLAY_TYPES.MULTISELECT) return 'array';
    if (displayType === DISPLAY_TYPES.CHECKBOX) {
      return Array.isArray(options) && options.length > 0 ? 'array' : 'boolean';
    }
    return 'string';
  }

  /**
   * 解析可重复标记。
   * @param {string} value
   * @returns {boolean|null}
   */
  static _parseRepeatable(value) {
    if (!value) return null;
    if (value === '可重复') return true;
    if (value === '不可重复') return false;
    return this._parseBoolean(value);
  }

  /**
   * 解析 table 行数。
   * @param {string} value
   * @returns {'singleRow'|'multiRow'}
   */
  static _parseTableRows(value) {
    return value === '单行' ? 'singleRow' : 'multiRow';
  }

  /**
   * 解析是否为空。
   * @param {string} value
   * @returns {boolean}
   */
  static _parseNullable(value) {
    if (value === '否') return false;
    return true;
  }

  /**
   * 解析是否可编辑。
   * @param {string} value
   * @returns {boolean}
   */
  static _parseEditable(value) {
    if (value === '否') return false;
    return true;
  }

  /**
   * 解析通用布尔值。
   * @param {string} value
   * @returns {boolean|null}
   */
  static _parseBoolean(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return null;
    if (['是', 'true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['否', 'false', '0', 'no', 'n'].includes(normalized)) return false;
    return null;
  }

  /**
   * 解析列表值。
   * @param {string} value
   * @returns {string[]}
   */
  static _parseList(value) {
    if (!value) return [];
    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  /**
   * 解析 JSON 扩展配置。
   * @param {string} value
   * @returns {Object|null}
   */
  static _parseJsonConfig(value) {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * 生成稳定度足够的临时 ID。
   * @param {string} prefix
   * @returns {string}
   */
  static _makeId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * 导出 CSV 文件。
   * @param {Array} csvData
   * @param {string} filename
   */
  static downloadCSV(csvData, filename = 'schema.csv') {
    const csvString = Papa.unparse(csvData);
    const blob = new Blob(['\ufeff' + csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * 导入 CSV 文件。
   * @param {File} file
   * @returns {Promise<Object>}
   */
  static importCSV(file) {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        encoding: 'UTF-8',
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const designModel = this.csvToDesignModel(results.data);
            resolve(designModel);
          } catch (error) {
            reject(error);
          }
        },
        error: (error) => {
          reject(error);
        }
      });
    });
  }

  /**
   * 验证 CSV 数据。
   * @param {Array} csvData
   * @returns {{valid: boolean, errors: string[], warnings: string[]}}
   */
  static validateCSV(csvData) {
    const errors = [];
    const warnings = [];

    try {
      this.csvToDesignModel(csvData);
    } catch (error) {
      errors.push(error.message || 'CSV校验失败');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

export default CSVConverter;
