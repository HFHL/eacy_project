/**
 * FieldConfigPanel - 字段配置面板
 * 右侧面板：配置选中字段的详细属性
 */

import React, { useEffect } from 'react';
import {
  Form,
  Input,
  Select,
  Switch,
  InputNumber,
  Space,
  Alert,
  Typography
} from 'antd';
import { DISPLAY_TYPES } from '../../core/constants';
import { getFieldTypeLabel } from '../../utils/schemaHelpers';
import {
  fromFieldFormValues,
  isOptionDisplayType,
  isTableDisplayType,
  TABLE_MULTI_ROW_DISPLAY_TYPE,
  TABLE_SINGLE_ROW_DISPLAY_TYPE,
  toFieldFormValues,
} from '../../utils/fieldContract';
import { appThemeToken } from '../../../../styles/themeTokens';

const { TextArea } = Input;
const { Text } = Typography;
/**
 * 是否显示字段“复用模式/来源表单”配置区块。
 * 仅隐藏前端展示，不移除字段契约和数据处理逻辑。
 * @type {boolean}
 */
const SHOW_FIELD_REUSE_SECTION = false;
/**
 * 是否显示“格式化”配置项。
 * 仅控制前端展示，不影响字段契约中的 format 数据读写。
 * @type {boolean}
 */
const SHOW_FORMAT_FIELD = false;
/**
 * 是否显示“正则表达式”配置项。
 * 仅控制前端展示，不影响字段契约中的 pattern 数据读写。
 * @type {boolean}
 */
const SHOW_PATTERN_FIELD = false;
/**
 * 是否显示“主键字段”配置项。
 * 仅控制前端展示，不影响字段契约中的 isPrimary 数据读写。
 * @type {boolean}
 */
const SHOW_PRIMARY_FIELD = false;
/**
 * 是否显示“配置说明”提示区块。
 * 仅控制前端展示，不影响字段能力与运行时行为。
 * @type {boolean}
 */
const SHOW_CONFIG_NOTICE = false;
/**
 * 是否显示“字段信息”提示区块。
 * 仅控制前端展示，不影响字段 UID/ID 等底层数据。
 * @type {boolean}
 */
const SHOW_FIELD_INFO = false;
/**
 * 是否显示“字段 ID (x-field-id)”配置项。
 * 仅控制前端展示，不影响字段契约中的 fieldId 数据读写。
 * @type {boolean}
 */
const SHOW_FIELD_ID = false;
/**
 * 是否显示“显示名称 (x-display-name)”配置项。
 * 仅控制前端展示，不影响 displayName 数据读写。
 * @type {boolean}
 */
const SHOW_DISPLAY_NAME = false;
/**
 * 是否显示“数据类型（自动推断）”只读项。
 * 仅控制前端展示，数据类型仍会按展示类型自动推断并写回。
 * @type {boolean}
 */
const SHOW_DATA_TYPE = false;
/**
 * 按展示类型推断字段数据类型。
 * 说明：checkbox 在“无选项”场景视为布尔值，有选项时视为数组。
 *
 * @param {string} displayType 展示类型。
 * @param {string[]} [options=[]] 选项列表。
 * @returns {string} 推断后的数据类型。
 */
function inferDataTypeByDisplayType(displayType, options = []) {
  if (displayType === DISPLAY_TYPES.NUMBER) return 'number';
  if (displayType === DISPLAY_TYPES.DATETIME) return 'string';
  if (displayType === TABLE_SINGLE_ROW_DISPLAY_TYPE || displayType === TABLE_MULTI_ROW_DISPLAY_TYPE) return 'array';
  if (displayType === DISPLAY_TYPES.MULTISELECT) return 'array';
  if (displayType === DISPLAY_TYPES.CHECKBOX) {
    return Array.isArray(options) && options.length > 0 ? 'array' : 'boolean';
  }
  return 'string';
}

/**
 * 获取字段配置面板的展示类型选项。
 * 表格在UI层拆分为“单行表格/多行表格”，底层仍映射为 table。
 *
 * @returns {{ label: string, value: string }[]}
 */
function getDisplayTypeOptions() {
  const baseOptions = Object.entries(DISPLAY_TYPES).map(([_key, value]) => ({
    label: getFieldTypeLabel(value),
    value,
  }));
  const optionsWithoutTable = baseOptions.filter((item) => item.value !== DISPLAY_TYPES.TABLE);
  return [
    ...optionsWithoutTable,
    { label: '单行表格', value: TABLE_SINGLE_ROW_DISPLAY_TYPE },
    { label: '多行表格', value: TABLE_MULTI_ROW_DISPLAY_TYPE },
  ];
}

/**
 * 右侧配置分组标题。
 * 使用轻量化左对齐样式，降低视觉噪音并与表单正文层级保持一致。
 *
 * @param {{ title: React.ReactNode }} props
 * @returns {JSX.Element}
 */
const SectionTitle = ({ title }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      margin: '16px 0 10px',
      paddingTop: 12,
      borderTop: `1px solid ${appThemeToken.colorBorder}`
    }}
  >
    <span
      style={{
        fontSize: 12,
        fontWeight: 500,
        lineHeight: '20px',
        color: appThemeToken.colorTextSecondary
      }}
    >
      {title}
    </span>
  </div>
);

/**
 * 字段配置面板组件
 */
const FieldConfigPanel = ({
  field = null,
  onUpdate = null,
  readonly = false,
  version = 0
}) => {
  const [form] = Form.useForm();

  const displayType = Form.useWatch('displayType', form);
  const options = Form.useWatch('options', form);
  const isOptionType = isOptionDisplayType(displayType);

  useEffect(() => {
    if (field) {
      form.setFieldsValue(toFieldFormValues(field));
    } else {
      form.resetFields();
    }
  }, [field, form, version]);

  useEffect(() => {
    if (!displayType) return;
    const inferredDataType = inferDataTypeByDisplayType(displayType, options);
    const currentDataType = form.getFieldValue('dataType');
    if (currentDataType !== inferredDataType) {
      form.setFieldValue('dataType', inferredDataType);
    }
  }, [displayType, options, form]);

  const handleValuesChange = (changedValues, allValues) => {
    if (!onUpdate) return;
    const updates = fromFieldFormValues(allValues);
    // 修改字段名称时同步更新显示名称，双入口保持一致。
    if ('name' in changedValues) {
      updates.displayName = changedValues.name;
    }
    onUpdate(updates);
  };

  if (!field) {
    return (
      <div style={{ 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: appThemeToken.colorBgContainer,
        borderRadius: 4,
        padding: 16
      }}>
        <Alert
          message="未选中字段"
          description="请从左侧选择字段进行配置"
          type="info"
          showIcon
          style={{ width: '100%' }}
        />
      </div>
    );
  }

  return (
    <div className="field-config-panel hover-scrollbar">
      <Form
        form={form}
        layout="vertical"
        onValuesChange={handleValuesChange}
        disabled={readonly}
      >
        <SectionTitle title="基础属性" />

        <Form.Item
          label="字段名称"
          name="name"
          rules={[{ required: true, message: '请输入字段名称' }]}
        >
          <Input placeholder="请输入字段名称" />
        </Form.Item>

        {SHOW_DISPLAY_NAME && (
          <Form.Item label="显示名称 (x-display-name)" name="displayName">
            <Input placeholder="用于界面展示" />
          </Form.Item>
        )}

        <Form.Item label="字段 UID (x-field-uid)" name="uid">
          <Input disabled placeholder="系统生成" />
        </Form.Item>

        {SHOW_FIELD_ID && (
          <Form.Item label="字段 ID (x-field-id)" name="fieldId">
            <Input placeholder="用于复用一致性校验" />
          </Form.Item>
        )}

        <Form.Item
          label="展示类型"
          name="displayType"
          rules={[{ required: true, message: '请选择展示类型' }]}
        >
          <Select placeholder="请选择展示类型">
            {getDisplayTypeOptions().map((option) => (
              <Select.Option key={option.value} value={option.value}>
                {option.label}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {SHOW_DATA_TYPE && (
          <Form.Item label="数据类型（自动推断）" name="dataType" tooltip="由展示类型自动推断，避免配置漂移">
            <Input disabled />
          </Form.Item>
        )}

        <Form.Item label="数据单位" name="unit" hidden={isTableDisplayType(displayType)}>
          <Input placeholder="例如：岁、kg、元" />
        </Form.Item>

        {displayType === DISPLAY_TYPES.FILE && (
          <Form.Item label="文件类型 (x-file-type)" name="fileType">
            <Input placeholder="如: pdf,image" />
          </Form.Item>
        )}

        {isOptionType && (
          <Form.Item
            label="选项值"
            name="options"
            rules={[{ required: true, message: '请配置选项值' }]}
            tooltip="多个选项用逗号分隔"
          >
            <Select
              mode="tags"
              placeholder="输入选项，按回车添加"
              style={{ width: '100%' }}
            />
          </Form.Item>
        )}

        <SectionTitle title="字段说明" />

        <Form.Item
          label="字段说明"
          name="description"
          tooltip="字段的业务含义说明，用于前端tooltip显示"
        >
          <TextArea rows={2} placeholder="请输入字段说明" />
        </Form.Item>

        <Form.Item
          label="抽取提示词"
          name="extractionPrompt"
          tooltip="LLM抽取该字段时的指导提示词"
        >
          <TextArea rows={3} placeholder="请输入抽取提示词" />
        </Form.Item>

        <Form.Item
          label="不参与 AI 抽取"
          name="skipExtraction"
          valuePropName="checked"
          tooltip="开启后，自动抽取将跳过该字段，保留手工填写值"
        >
          <Switch checkedChildren="跳过" unCheckedChildren="参与" />
        </Form.Item>

        <SectionTitle title="验证规则" />

        <Form.Item
          label="必填"
          name="isRequired"
          valuePropName="checked"
        >
          <Switch checkedChildren="必填" unCheckedChildren="可选" />
        </Form.Item>

        <Form.Item
          label="可为空"
          name="isNullable"
          valuePropName="checked"
        >
          <Switch checkedChildren="是" unCheckedChildren="否" />
        </Form.Item>

        <Form.Item label="最小值/长度" name="minimum">
          <InputNumber placeholder="不限制" style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item label="最大值/长度" name="maximum">
          <InputNumber placeholder="不限制" style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          label="默认值"
          name="defaultValue"
          tooltip="字段的默认值"
        >
          <Input placeholder="请输入默认值" />
        </Form.Item>

        {SHOW_PATTERN_FIELD && (
          <Form.Item label="正则表达式" name="pattern">
            <Input placeholder="请输入正则表达式" />
          </Form.Item>
        )}

        <SectionTitle title="高级属性" />

        <Form.Item
          label="敏感字段"
          name="isSensitive"
          valuePropName="checked"
          tooltip="敏感字段将进行脱敏处理"
        >
          <Switch checkedChildren="敏感" unCheckedChildren="普通" />
        </Form.Item>

        {SHOW_PRIMARY_FIELD && (
          <Form.Item
            label="主键字段"
            name="isPrimary"
            valuePropName="checked"
            tooltip="主键字段用于数据去重"
          >
            <Switch checkedChildren="主键" unCheckedChildren="普通" />
          </Form.Item>
        )}

        <Form.Item
          label="可编辑"
          name="isEditable"
          valuePropName="checked"
        >
          <Switch checkedChildren="可编辑" unCheckedChildren="只读" />
        </Form.Item>

        {SHOW_FIELD_REUSE_SECTION && (
          <>
            <SectionTitle title="字段复用" />
            <Form.Item label="复用模式 (x-form-template)" name="reuseMode">
              <Input placeholder="full_reuse / original / copied_modified" />
            </Form.Item>
            <Form.Item label="来源表单 (source_form)" name="sourceForm">
              <Input placeholder="可选" />
            </Form.Item>
          </>
        )}

        {SHOW_FORMAT_FIELD && (
          <Form.Item
            label="格式化"
            name="format"
            tooltip="日期或字符串的格式化规则"
          >
            <Input placeholder="例如：yyyy-MM-dd、手机号、邮箱等" />
          </Form.Item>
        )}

        {SHOW_CONFIG_NOTICE && (
          <>
            <SectionTitle title="配置说明" />
            <Alert
              type="warning"
              showIcon
              message="以下能力暂未纳入运行时渲染"
              description="数据来源、合并绑定、枚举引用和扩展属性目前不参与 SchemaForm 渲染链路。为避免误导，相关编辑项已下线，后续会在契约收敛后再恢复。"
            />
          </>
        )}

        {SHOW_FIELD_INFO && (
          <>
            <SectionTitle title="字段信息" />
            {field.uid && (
              <Alert
                message={
                  <Space direction="vertical" size={0}>
                    <Text><strong>字段UID:</strong> {field.uid}</Text>
                    {field.id && (
                      <Text type="secondary"><strong>字段ID:</strong> {field.id}</Text>
                    )}
                  </Space>
                }
                description="UID用于版本管理，确保数据兼容性。编辑时UID将保持不变。"
                type="info"
                showIcon
              />
            )}
          </>
        )}
      </Form>
    </div>
  );
};

export default FieldConfigPanel;
