# 电子病历字段映射使用说明

## 概述

`ehrFieldLabels.js` 提供了电子病历字段的中文名称映射，确保前端展示时所有字段都有正确的中文标签。

## 字段映射

完全对应后端数据库 `patient_ehr` 表的字段结构（见 `backend/eacy sql/02_cdm_patient_data.sql`）

### 字段分类

#### 1. 基本信息 - 个人信息
- `personal_info_name` → 患者姓名
- `personal_info_gender` → 性别
- `personal_info_birth_date` → 出生日期
- `personal_info_age` → 年龄
- `personal_info_id_type` → 证件类型
- `personal_info_id_number` → 证件号码

#### 2. 基本信息 - 联系方式
- `contact_info_phone` → 手机号码
- `contact_info_address` → 家庭住址
- `contact_info_emergency_name` → 紧急联系人姓名
- `contact_info_emergency_phone` → 紧急联系人电话
- `contact_info_emergency_relation` → 紧急联系人关系

#### 3. 基本信息 - 人口学
- `demographics_marital_status` → 婚姻状况
- `demographics_education` → 教育水平
- `demographics_occupation` → 职业
- `demographics_ethnicity` → 民族
- `demographics_insurance_type` → 医保类型

#### 4. 健康状况 - 生活史
- `lifestyle_smoking_status` → 吸烟状态
- `lifestyle_smoking_years` → 吸烟年数
- `lifestyle_smoking_daily` → 日均吸烟支数
- `lifestyle_smoking_quit_year` → 戒烟年份
- `lifestyle_drinking_status` → 饮酒状态
- `lifestyle_drinking_frequency` → 饮酒频率
- `lifestyle_drinking_type` → 饮酒类型
- `lifestyle_drinking_quit_year` → 戒酒年份

#### 5. 可重复字段组（JSONB 数组）
- `diagnosis_records` → 诊断记录
- `treatment_records` → 治疗记录
- `medication_records` → 用药记录
- `pathology_records` → 病理报告
- `laboratory_records` → 实验室检查
- `imaging_records` → 影像检查
- `genetics_records` → 基因检测
- `surgical_records` → 手术史
- `past_medical_records` → 既往病史
- `family_history_records` → 家族史
- `allergy_records` → 过敏史
- `immunization_records` → 免疫接种史
- `reproductive_records` → 生育史（孕产史）
- `comorbidity_records` → 合并症
- `other_exam_records` → 其他检查
- `material_records` → 其他材料

## API 使用

### 1. 获取字段标签

```javascript
import { getFieldLabel } from './ehrFieldLabels'

const label = getFieldLabel('personal_info_name') // "患者姓名"
const unknownLabel = getFieldLabel('unknown_field') // "unknown field"
```

### 2. 判断是否为数组字段

```javascript
import { isArrayField } from './ehrFieldLabels'

isArrayField('diagnosis_records') // true
isArrayField('personal_info_name') // false
```

### 3. 判断字段值是否为空

```javascript
import { isEmptyValue } from './ehrFieldLabels'

isEmptyValue(null) // true
isEmptyValue('') // true
isEmptyValue([]) // true
isEmptyValue({}) // true
isEmptyValue('有值') // false
isEmptyValue([1, 2]) // false
```

### 4. 完整示例：转换 API 数据为展示字段

```javascript
import { getFieldLabel, isArrayField, isEmptyValue } from './ehrFieldLabels'

function convertEhrDataToFields(ehrData) {
  const fields = []
  
  Object.entries(ehrData).forEach(([key, value]) => {
    // 跳过空值
    if (isEmptyValue(value)) {
      return
    }
    
    // 处理数组字段
    let displayValue = value
    if (Array.isArray(displayValue)) {
      displayValue = `共 ${displayValue.length} 条记录`
    }
    
    fields.push({
      fieldId: key,
      fieldName: getFieldLabel(key),  // 获取中文标签
      value: displayValue,
      isArray: isArrayField(key)
    })
  })
  
  return fields
}

// 使用示例
const ehrData = {
  personal_info_name: '张三',
  personal_info_gender: '男',
  personal_info_age: '45',
  contact_info_phone: '13800138000',
  diagnosis_records: [
    { 诊断名称: '高血压', 确诊时间: '2023-01-15' },
    { 诊断名称: '糖尿病', 确诊时间: '2023-03-20' }
  ],
  medication_records: [],  // 空数组会被过滤
  unknown_field: null       // null 会被过滤
}

const fields = convertEhrDataToFields(ehrData)
// 结果：
// [
//   { fieldId: 'personal_info_name', fieldName: '患者姓名', value: '张三', isArray: false },
//   { fieldId: 'personal_info_gender', fieldName: '性别', value: '男', isArray: false },
//   { fieldId: 'personal_info_age', fieldName: '年龄', value: '45', isArray: false },
//   { fieldId: 'contact_info_phone', fieldName: '手机号码', value: '13800138000', isArray: false },
//   { fieldId: 'diagnosis_records', fieldName: '诊断记录', value: '共 2 条记录', isArray: true }
// ]
```

## 数据结构说明

### extracted_ehr_data 数据格式

从文档详情 API 获取的 `extracted_ehr_data` 可能有两种格式：

#### 格式 1：直接值
```json
{
  "personal_info_name": "张三",
  "personal_info_age": "45",
  "diagnosis_records": [...]
}
```

#### 格式 2：包含置信度的对象
```json
{
  "personal_info_name": {
    "value": "张三",
    "confidence": 0.95,
    "source_index": 0
  },
  "personal_info_age": {
    "value": "45",
    "confidence": 0.88,
    "source_index": 1
  }
}
```

`convertEhrDataToFields` 函数会自动处理这两种格式。

## 维护说明

当后端 `patient_ehr` 表字段发生变化时：

1. 更新 `ehrFieldLabels.js` 中的 `EHR_FIELD_LABELS` 字典
2. 如果新增数组字段，更新 `isArrayField` 函数中的数组
3. 如果需要分组展示，更新 `EHR_FIELD_GROUPS` 配置
4. 更新本文档说明

## 注意事项

1. **字段命名规则**：所有字段名使用下划线命名（snake_case），如 `personal_info_name`
2. **空值过滤**：展示时会自动过滤空值（null、undefined、空字符串、空数组、空对象）
3. **数组字段显示**：数组字段会显示为 "共 N 条记录"
4. **未知字段**：如果字段不在字典中，会将下划线替换为空格后显示

