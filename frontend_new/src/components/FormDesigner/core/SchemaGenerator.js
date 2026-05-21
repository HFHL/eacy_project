/**
 * Schema生成器 - 将设计器数据转换为JSON Schema
 */

import { DISPLAY_TYPES } from './constants.js';

/**
 * Schema生成器类
 */
export class SchemaGenerator {
  /**
   * 生成完整Schema
   * @param {Object} designModel - 设计器数据模型
   * @returns {Object} JSON Schema对象
   */
  static generateSchema(designModel) {
    const properties = this._generateProperties(designModel.folders);
    const folderOrder = designModel.folders.map(f => f.name);

    const schema = {
      "$schema": designModel.meta.$schema || "https://json-schema.org/draft/2020-12/schema",
      "$id": designModel.meta.$id || "generated.schema.json",
      "type": "object",
      "unevaluatedProperties": false,
      "properties": properties,
      "x-property-order": folderOrder,
      "$defs": this._generateDefs(designModel.enums),
      "x-schema-meta": this._generateMeta(designModel)
    };

    return schema;
  }

  /**
   * 生成properties（文件夹结构）
   */
  static _generateProperties(folders) {
    const properties = {};

    for (const folder of folders) {
      const groupOrder = folder.groups.map(g => g.name);
      const groupProps = {};

      for (const group of folder.groups) {
        groupProps[group.name] = this._generateGroup(group);
      }

      properties[folder.name] = {
        type: "object",
        properties: groupProps,
        unevaluatedProperties: false,
        "x-property-order": groupOrder
      };
    }

    return properties;
  }

  /**
   * 生成字段组Schema
   */
  static _generateGroup(group) {
    const isRepeatable = group.repeatable;
    const schema = {
      type: isRepeatable ? "array" : "object",
      ...(isRepeatable ? {
        items: {
          type: "object",
          properties: {},
          unevaluatedProperties: false,
          required: []
        }
      } : {
        properties: {},
        unevaluatedProperties: false,
        required: []
      })
    };

    // 获取目标对象（array的items或object本身）
    const target = isRepeatable ? schema.items : schema;

    // 添加字段
    const requiredFields = [];
    const fieldOrder = [];
    for (const field of group.fields) {
      fieldOrder.push(field.name);
      if (field.isTable && field.children) {
        const tableSchema = this._generateTableField(field);
        target.properties[field.name] = tableSchema;
      } else {
        const fieldSchema = this._generateField(field);
        target.properties[field.name] = fieldSchema;

        if (field.required) {
          requiredFields.push(field.name);
        }
      }
    }

    if (requiredFields.length > 0) {
      target.required = requiredFields;
    }
    if (fieldOrder.length > 0) {
      target["x-property-order"] = fieldOrder;
    }

    // 添加x-扩展字段
    if (group.mergeBinding) {
      target["x-merge-binding"] = group.mergeBinding;
    }
    const hasPrimarySources = Array.isArray(group.sources?.primary) && group.sources.primary.length > 0;
    const hasSecondarySources = Array.isArray(group.sources?.secondary) && group.sources.secondary.length > 0;
    if (hasPrimarySources || hasSecondarySources) {
      target["x-sources"] = group.sources;
    }
    if (group.isExtractionUnit !== undefined) {
      target["x-is-extraction-unit"] = !!group.isExtractionUnit;
    }
    if (group.formTemplate) {
      target["x-form-template"] = group.formTemplate;
    }
    if (group.description) {
      target.description = group.description;
      target["x-extraction-prompt"] = group.description;
    }
    if (group.uid) {
      target["x-group-uid"] = group.uid;
    }
    if (group.config?.tableRows) {
      const extConfig = {};
      if (group.config.tableRows === 'singleRow') {
        extConfig.tableRows = 'singleRow';
      } else {
        extConfig.tableRows = 'multiRow';
      }
      if (Object.keys(extConfig).length > 0) {
        target["x-extended-config"] = extConfig;
      }
    }

    // 添加x-display用于标识group/table
    if (group.type) {
      target["x-display"] = group.type;
    }
    if (isRepeatable) {
      if (typeof group.minItems === 'number') {
        schema.minItems = group.minItems;
      }
      if (typeof group.maxItems === 'number') {
        schema.maxItems = group.maxItems;
      }
    }

    return schema;
  }

  /**
   * 生成table字段Schema
   */
  static _generateTableField(field) {
    const isMultiRow = field.config?.tableRows === 'multiRow' || field.multiRow === true;
    const schema = {
      type: isMultiRow ? "array" : "object",
      ...(isMultiRow ? {
        items: {
          type: "object",
          properties: {},
          unevaluatedProperties: false
        }
      } : {
        properties: {},
        unevaluatedProperties: false
      })
    };

    const target = isMultiRow ? schema.items : schema;

    // 添加子字段
    const childOrder = [];
    for (const childField of field.children) {
      childOrder.push(childField.name);
      if (childField?.isTable && Array.isArray(childField.children)) {
        target.properties[childField.name] = this._generateTableField(childField);
      } else {
        target.properties[childField.name] = this._generateField(childField);
      }
    }
    if (childOrder.length > 0) {
      target["x-property-order"] = childOrder;
    }

    // 添加x-扩展字段
    if (field.uid) {
      schema["x-field-uid"] = field.uid;
    }
    if (field.fieldId) {
      schema["x-field-id"] = field.fieldId;
    }
    if (field.displayName) {
      schema["x-display-name"] = field.displayName;
    }
    if (field.sensitive) {
      schema["x-sensitive"] = true;
    }
    if (field.primary) {
      schema["x-primary"] = true;
    }
    if (field.config?.tableRows) {
      const extConfig = schema["x-extended-config"] || {};
      extConfig.tableRows = field.config.tableRows;
      schema["x-extended-config"] = extConfig;
    }
    if (field.formTemplate) {
      schema["x-form-template"] = field.formTemplate;
    }
    if (field.fileType) {
      schema["x-file-type"] = field.fileType;
    }

    // 添加x-display标识为table
    schema["x-display"] = DISPLAY_TYPES.TABLE;

    return schema;
  }

  /**
   * 生成字段Schema
   */
  static _generateField(field) {
    let schema = {
      type: field.dataType || "string"
    };

    // 根据展示类型补齐标准 format，避免隐藏配置项后丢失时间语义。
    if (field.displayType === DISPLAY_TYPES.DATE && !field.format) {
      schema.format = 'date';
    }
    if (field.displayType === DISPLAY_TYPES.DATETIME && !field.format) {
      schema.format = 'date-time';
    }

    // 添加format
    if (field.format) {
      schema.format = field.format;
    }
    if (typeof field.minimum === 'number') {
      schema.minimum = field.minimum;
    }
    if (typeof field.maximum === 'number') {
      schema.maximum = field.maximum;
    }
    if (field.pattern) {
      schema.pattern = field.pattern;
    }

    // 添加枚举
    if (field.options && field.options.length > 0) {
      if (field.displayType === DISPLAY_TYPES.CHECKBOX ||
          field.displayType === DISPLAY_TYPES.MULTISELECT) {
        schema.type = "array";
        schema.items = {
          type: "string",
          enum: field.options
        };
      } else {
        schema.type = "string";
        schema.enum = field.options;
      }

      // 如果有optionsId，添加allOf引用
      if (field.optionsId) {
        const ref = { "$ref": `#/$defs/${field.optionsId}` };
        schema.allOf = [ref];
      }
    }

    // 添加x-扩展字段
    if (field.uid) {
      schema["x-field-uid"] = field.uid;
    }
    if (field.fieldId) {
      schema["x-field-id"] = field.fieldId;
    }
    if (field.displayName) {
      schema["x-display-name"] = field.displayName;
    }
    if (field.unit) {
      schema["x-unit"] = field.unit;
    }
    if (field.sensitive) {
      schema["x-sensitive"] = true;
    }
    if (field.primary) {
      schema["x-primary"] = true;
    }
    if (!field.editable) {
      schema["x-editable"] = false;
    }
    if (field.displayType) {
      schema["x-display"] = field.displayType;
    }
    if (field.description) {
      schema.description = field.description;
    }
    if (field.extractionPrompt) {
      schema["x-extraction-prompt"] = field.extractionPrompt;
    }
    if (field.skipExtraction) {
      schema["x-skip-extraction"] = true;
    }
    schema["x-nullable"] = field.nullable !== false;
    if (field.config) {
      schema["x-extended-config"] = field.config;
    }
    if (field.formTemplate) {
      schema["x-form-template"] = field.formTemplate;
    }
    if (field.fileType) {
      schema["x-file-type"] = field.fileType;
    }
    if (field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== '') {
      schema.default = field.defaultValue;
    }

    return schema;
  }

  /**
   * 生成枚举定义
   */
  static _generateDefs(enums) {
    const defs = {};
    for (const [enumId, enumData] of Object.entries(enums)) {
      defs[enumId] = {
        type: enumData.type || "string",
        enum: enumData.values
      };
    }
    return defs;
  }

  /**
   * 生成元信息
   */
  static _generateMeta(designModel) {
    return {
      version: designModel.meta.version,
      created: designModel.meta.created || new Date().toISOString(),
      modified: new Date().toISOString(),
      projectId: designModel.meta.projectId,
      author: designModel.meta.author || '',
      description: designModel.meta.description || ''
    };
  }

  /**
   * 生成CSV数据
   * @param {Object} designModel - 设计器数据模型
   * @returns {Array} CSV行数据数组
   */
  static generateCSV(designModel) {
    const rows = [];

    // CSV表头
    const headers = [
      '文件（访视层）',
      '层级1（表单层）',
      '层级2', '层级3', '层级4', '层级5', '层级6', '层级7', '层级8', '层级9', '层级10',
      '展示类型',
      '可选项值',
      '数据类型',
      '数据单位',
      'group是否可重复',
      'table是否多行',
      '是否为抽取单位组',
      '主要来源',
      '次要来源',
      '时间属性字段组绑定',
      '是否为敏感字段',
      '是否为主键级字段',
      '字段是否可编辑',
      '字段可否为空（nullable）',
      '提示词-字段说明',
      '抽取提示词（示例）',
      '字段冲突处理规则',
      '扩展配置',
      '字段UID'
    ];

    for (const folder of designModel.folders) {
      for (const group of folder.groups) {
        // 添加字段组行
        rows.push(this._generateGroupCSVRow(folder, group));

        // 添加字段行
        for (const field of group.fields) {
          this._appendFieldRows(rows, folder, group, field, []);
        }
      }
    }

    return { headers, rows };
  }

  /**
   * 生成字段组CSV行
   */
  static _generateGroupCSVRow(folder, group) {
    const isGroupTable = group.type === DISPLAY_TYPES.TABLE;
    const groupTableRows = (group.config?.tableRows || (group.repeatable ? 'multiRow' : 'singleRow'));
    const levelColumns = this._buildLevelColumns([]);
    return [
      folder.name,
      group.name,
      ...levelColumns,  // 层级2-10
      group.type || DISPLAY_TYPES.GROUP,  // 展示类型
      '',  // 可选项值
      '',  // 数据类型
      '',  // 数据单位
      group.repeatable ? '可重复' : '不可重复',  // group是否可重复
      isGroupTable ? (groupTableRows === 'multiRow' ? '多行' : '单行') : '',  // table是否多行
      group.isExtractionUnit ? '是' : '',  // 是否为抽取单位组
      group.sources?.primary?.join(',') || '',  // 主要来源
      group.sources?.secondary?.join(',') || '',  // 次要来源
      group.mergeBinding || '',  // 时间属性字段组绑定
      '',  // 是否为敏感字段
      '',  // 是否为主键级字段
      '',  // 字段是否可编辑
      '',  // 字段可否为空（nullable）
      '',  // 提示词-字段说明
      group.description || '',  // 抽取提示词（示例）
      '',  // 字段冲突处理规则
      '',  // 扩展配置
      ''   // 字段UID
    ];
  }

  /**
   * 生成table字段CSV行
   */
  static _generateTableCSVRow(folder, group, field) {
    const levelColumns = this._buildLevelColumns([field.name]);
    const tableRows = field.config?.tableRows || 'multiRow';
    return [
      folder.name,
      group.name,
      ...levelColumns,
      DISPLAY_TYPES.TABLE,  // 展示类型
      '',  // 可选项值
      '',  // 数据类型
      '',  // 数据单位
      '',  // group是否可重复
      tableRows === 'multiRow' ? '多行' : '单行',  // table是否多行
      '', '', '', '', '', '', '', '', '', '', '', '', ''
    ];
  }

  /**
   * 生成嵌套 table 字段 CSV 行。
   * @param {Object} folder
   * @param {Object} group
   * @param {string[]} parentTables
   * @param {Object} field
   * @returns {Array}
   */
  static _generateNestedTableCSVRow(folder, group, parentTables, field) {
    const levelColumns = this._buildLevelColumns([...parentTables, field.name]);
    const tableRows = field.config?.tableRows || 'multiRow';
    return [
      folder.name,
      group.name,
      ...levelColumns,
      DISPLAY_TYPES.TABLE,  // 展示类型
      '',  // 可选项值
      '',  // 数据类型
      '',  // 数据单位
      '',  // group是否可重复
      tableRows === 'multiRow' ? '多行' : '单行',  // table是否多行
      '', '', '', '', '', '', '', '', '', '', '', '', ''
    ];
  }

  /**
   * 生成字段CSV行
   */
  static _generateFieldCSVRow(folder, group, parentTables, field) {
    const levelColumns = this._buildLevelColumns([...(parentTables || []), field.name]);

    // 构建主要来源和次要来源
    let primarySources = '';
    let secondarySources = '';
    if (group.sources) {
      primarySources = group.sources.primary?.join(',') || '';
      secondarySources = group.sources.secondary?.join(',') || '';
    }

    // 构建扩展配置（用于 CSV 往返保留运行时生效规则）
    let extendedConfig = '';
    const mergedConfig = {
      ...(field.config || {}),
    };
    if (typeof field.minimum === 'number') mergedConfig.minimum = field.minimum;
    if (typeof field.maximum === 'number') mergedConfig.maximum = field.maximum;
    if (field.pattern) mergedConfig.pattern = field.pattern;
    if (Object.keys(mergedConfig).length > 0) {
      extendedConfig = JSON.stringify(mergedConfig);
    }

    return [
      folder.name,
      group.name,
      ...levelColumns,
      field.displayType || '',  // 展示类型
      field.options?.join(',') || '',  // 可选项值
      this._mapDataTypeToCSV(field.dataType, field.displayType),  // 数据类型
      field.unit || '',  // 数据单位
      '',  // group是否可重复（字段不填）
      '',  // table是否多行（字段不填）
      '',  // 是否为抽取单位组（字段不填）
      primarySources,  // 主要来源
      secondarySources,  // 次要来源
      '',  // 时间属性字段组绑定
      field.sensitive ? '是' : '',  // 是否为敏感字段
      field.primary ? '是' : '',  // 是否为主键级字段
      field.editable ? '是' : '否',  // 字段是否可编辑
      field.nullable ? '是' : '否',  // 字段可否为空
      field.description || '',  // 提示词-字段说明
      field.extractionPrompt || '',  // 抽取提示词
      '',  // 字段冲突处理规则（新契约停止写入）
      extendedConfig,  // 扩展配置
      field.uid || ''  // 字段UID
    ];
  }

  /**
   * 递归展开字段行，支持 table 内再嵌套 table。
   * @param {Array} rows
   * @param {Object} folder
   * @param {Object} group
   * @param {Object} field
   * @param {string[]} parentTables
   */
  static _appendFieldRows(rows, folder, group, field, parentTables) {
    if (field?.isTable && Array.isArray(field.children)) {
      if (parentTables.length === 0) {
        rows.push(this._generateTableCSVRow(folder, group, field));
      } else {
        rows.push(this._generateNestedTableCSVRow(folder, group, parentTables, field));
      }
      for (const childField of field.children) {
        this._appendFieldRows(rows, folder, group, childField, [...parentTables, field.name]);
      }
      return;
    }
    rows.push(this._generateFieldCSVRow(folder, group, parentTables, field));
  }

  /**
   * 生成 CSV 的层级2-10列。
   * @param {string[]} levels
   * @returns {string[]}
   */
  static _buildLevelColumns(levels) {
    const normalized = Array.from({ length: 9 }, (_unused, index) => levels[index] || '');
    return normalized;
  }

  /**
   * 映射数据类型到CSV格式
   */
  static _mapDataTypeToCSV(dataType, displayType) {
    if (displayType === DISPLAY_TYPES.DATE) return '日期';
    if (displayType === DISPLAY_TYPES.DATETIME) return '日期时间';
    if (displayType === DISPLAY_TYPES.FILE) return '文件';
    if (dataType === 'number') return '数字';
    if (dataType === 'boolean') return '布尔值';
    if (dataType === 'array') return '数组';
    return '文本';
  }
}

export default SchemaGenerator;
