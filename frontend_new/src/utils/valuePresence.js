/**
 * 判断一个值是否包含真实内容。
 *
 * 用于表单进度、字段组统计等场景。数组/对象本身存在不代表已填写；
 * 只有递归到叶子值后存在非空内容，才算有效。
 *
 * @param {any} value 待判断值。
 * @returns {boolean}
 */
export const hasEffectiveValue = (value) => {
  if (value === undefined || value === null) return false

  if (typeof value === 'string') {
    return value.trim() !== ''
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasEffectiveValue(item))
  }

  if (typeof value === 'object') {
    return Object.values(value)
      .filter((item) => typeof item !== 'function')
      .some((item) => hasEffectiveValue(item))
  }

  return true
}

export const isEffectivelyEmpty = (value) => !hasEffectiveValue(value)
