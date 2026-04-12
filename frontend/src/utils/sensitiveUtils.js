/**
 * 敏感字段前端脱敏工具函数
 * 后端返回解密明文，由前端统一负责脱敏展示
 */

/**
 * 手机号脱敏：保留前3位和后4位，中间用 **** 替换
 * 例：13812345678 → 138****5678
 */
export function maskPhone(phone) {
  if (!phone) return phone
  const s = String(phone).trim()
  if (s.length < 7) return s
  return `${s.slice(0, 3)}****${s.slice(-4)}`
}

/**
 * 身份证号脱敏：保留前3位和后4位，中间用11个*替换
 * 例：110101197901011234 → 110***********1234
 */
export function maskIdCard(idCard) {
  if (!idCard) return idCard
  const s = String(idCard).trim()
  if (s.length < 8) return s
  return `${s.slice(0, 3)}***********${s.slice(-4)}`
}

/**
 * 姓名脱敏：保留首字和末字，中间用*替换
 * 例：张三 → 张*；张三丰 → 张*丰
 */
export function maskName(name) {
  if (!name) return name
  const s = String(name).trim()
  if (s.length <= 1) return s
  if (s.length === 2) return `${s[0]}*`
  return `${s[0]}*${s[s.length - 1]}`
}

/**
 * 地址脱敏：保留到区/县/镇级别，详细地址用****替换
 * 例：北京市朝阳区建国路123号 → 北京市朝阳区****
 */
export function maskAddress(address) {
  if (!address) return address
  const s = String(address).trim()
  if (s.length < 6) return s
  const keywords = ['区', '县', '镇', '乡', '街道', '市']
  for (const kw of keywords) {
    const idx = s.indexOf(kw)
    if (idx !== -1 && idx < s.length - 1) {
      return `${s.slice(0, idx + 1)}****`
    }
  }
  return `${s.slice(0, 6)}****`
}

/**
 * 日期脱敏：隐藏月日，只保留年份
 * 例：1980-05-23 → 1980-**-**
 */
export function maskDate(date) {
  if (!date) return date
  const s = String(date).trim()
  // YYYY-MM-DD 格式
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return `${s.slice(0, 4)}-**-**`
  }
  return s
}

/**
 * 通用脱敏：保留前后少量字符，中间用*替换
 */
export function maskGeneric(value) {
  if (!value) return value
  const s = String(value).trim()
  if (s.length <= 2) return `${s[0]}*`
  const keep = Math.max(1, Math.floor(s.length / 5))
  const stars = '*'.repeat(Math.max(2, s.length - keep * 2))
  return `${s.slice(0, keep)}${stars}${s.slice(-keep)}`
}

/**
 * 根据字段名/ID 自动判断脱敏类型并脱敏
 * 适用于 EHR 字段、表单字段等场景
 *
 * @param {string} value    字段明文值
 * @param {string} fieldName 字段显示名称（中文，如 "手机号码"）
 * @param {string} fieldId   字段 ID（英文，如 "contact_info_phone"）
 * @returns {string} 脱敏后的值
 */
export function maskSensitiveField(value, fieldName = '', fieldId = '') {
  if (value === null || value === undefined || value === '') return value
  const key = `${fieldName} ${fieldId}`.toLowerCase()

  // 手机号 / 电话
  if (
    key.includes('phone') ||
    key.includes('tel') ||
    key.includes('手机') ||
    key.includes('电话')
  ) {
    return maskPhone(String(value))
  }

  // 身份证 / 证件号
  if (
    key.includes('id_card') ||
    key.includes('id_number') ||
    key.includes('idcard') ||
    key.includes('证件号') ||
    key.includes('身份证')
  ) {
    return maskIdCard(String(value))
  }

  // 姓名
  if (key.includes('姓名') || key === 'name' || (key.includes('name') && !key.includes('filename') && !key.includes('document'))) {
    return maskName(String(value))
  }

  // 地址
  if (key.includes('address') || key.includes('addr') || key.includes('地址')) {
    return maskAddress(String(value))
  }

  // 出生日期
  if (key.includes('birth') || key.includes('出生')) {
    return maskDate(String(value))
  }

  // 其他敏感字段通用脱敏
  return maskGeneric(String(value))
}
