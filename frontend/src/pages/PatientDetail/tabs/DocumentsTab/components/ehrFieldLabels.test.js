/**
 * 电子病历字段标签映射测试
 */
import { getFieldLabel, isArrayField, isEmptyValue, normalizeDisplayValue, EHR_FIELD_LABELS } from './ehrFieldLabels'

describe('EHR Field Labels', () => {
  test('getFieldLabel 应该返回正确的中文标签', () => {
    expect(getFieldLabel('personal_info_name')).toBe('患者姓名')
    expect(getFieldLabel('contact_info_phone')).toBe('手机号码')
    expect(getFieldLabel('diagnosis_records')).toBe('诊断记录')
    expect(getFieldLabel('unknown_field')).toBe('unknown field') // 未知字段返回格式化的英文
  })

  test('isArrayField 应该正确识别数组字段', () => {
    expect(isArrayField('diagnosis_records')).toBe(true)
    expect(isArrayField('medication_records')).toBe(true)
    expect(isArrayField('personal_info_name')).toBe(false)
    expect(isArrayField('contact_info_phone')).toBe(false)
  })

  test('isEmptyValue 应该正确判断空值', () => {
    expect(isEmptyValue(null)).toBe(true)
    expect(isEmptyValue(undefined)).toBe(true)
    expect(isEmptyValue('')).toBe(true)
    expect(isEmptyValue('   ')).toBe(true)
    expect(isEmptyValue([])).toBe(true)
    expect(isEmptyValue({})).toBe(true)
    expect(isEmptyValue({ a: '', b: [] })).toBe(true)
    expect(isEmptyValue([{ a: '' }, null])).toBe(true)
    
    expect(isEmptyValue('test')).toBe(false)
    expect(isEmptyValue(0)).toBe(false)
    expect(isEmptyValue(false)).toBe(false)
    expect(isEmptyValue([1, 2])).toBe(false)
    expect(isEmptyValue({ key: 'value' })).toBe(false)
  })

  test('normalizeDisplayValue 应该递归清洗空值', () => {
    expect(normalizeDisplayValue({
      a: '',
      b: 'test',
      c: [],
      d: {
        nested1: '',
        nested2: 0,
        nested3: [{ x: '' }, { x: 'ok' }]
      }
    })).toEqual({
      b: 'test',
      d: {
        nested2: 0,
        nested3: [{ x: 'ok' }]
      }
    })
  })

  test('应该包含所有必需的字段标签', () => {
    // 个人信息字段
    expect(EHR_FIELD_LABELS.personal_info_name).toBeDefined()
    expect(EHR_FIELD_LABELS.personal_info_gender).toBeDefined()
    
    // 联系方式字段
    expect(EHR_FIELD_LABELS.contact_info_phone).toBeDefined()
    expect(EHR_FIELD_LABELS.contact_info_address).toBeDefined()
    
    // 可重复字段组
    expect(EHR_FIELD_LABELS.diagnosis_records).toBeDefined()
    expect(EHR_FIELD_LABELS.medication_records).toBeDefined()
    expect(EHR_FIELD_LABELS.laboratory_records).toBeDefined()
  })
})

