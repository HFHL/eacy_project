import dayjs from 'dayjs'

const normalizeStr = (value) => (value === null || value === undefined ? '' : String(value)).trim()

const isPlaceholder = (value) => {
  const text = normalizeStr(value)
  if (!text) return true
  return ['--', '未知', '不详', '待AI提取', '待AI分析'].includes(text)
}

const pickMeaningful = (value) => (isPlaceholder(value) ? '' : normalizeStr(value))

const normalizeGender = (value) => {
  const text = pickMeaningful(value)
  if (text === '男' || text === '女') return text
  return ''
}

const parseAge = (value) => {
  const text = pickMeaningful(value)
  if (!text) return null
  const match = text.match(/(\d{1,3})/)
  if (!match) return null
  const age = parseInt(match[1], 10)
  if (!Number.isFinite(age) || age <= 0 || age > 150) return null
  return age
}

const parseBirthDate = (value) => {
  const text = pickMeaningful(value)
  if (!text) return null
  const normalized = text.replace(/年|月/g, '-').replace(/日/g, '').replace(/\//g, '-')
  const date = dayjs(normalized, 'YYYY-MM-DD', true)
  return date.isValid() ? date : null
}

const normalizePhone = (value) => {
  const text = pickMeaningful(value)
  if (!text) return ''
  const digits = text.replace(/\D/g, '')
  if (digits.length < 7) return ''
  return digits
}

const normalizeIdNumber = (value) => {
  const text = pickMeaningful(value)
  if (!text) return ''
  const idNumber = text.replace(/\s+/g, '')
  if (!/^\d{15}$|^\d{17}[\dXx]$/.test(idNumber)) return ''
  return idNumber.toUpperCase()
}

const normalizeAddress = (value) => {
  const text = pickMeaningful(value)
  if (!text || text.length < 4) return ''
  return text
}

const normalizeBirthDateValue = (value) => {
  if (!value) return null
  if (dayjs.isDayjs(value)) return value.isValid() ? value : null
  return parseBirthDate(value)
}

const computeScore = (fields = {}) => {
  let score = 0
  if (fields.name) score += 6
  if (fields.idNumber) score += 5
  if (fields.phone) score += 4
  if (fields.birthDate) score += 4
  if (typeof fields.age === 'number') score += 3
  if (fields.gender) score += 2
  if (fields.address) score += 1
  return score
}

const getResultValue = (metadata = {}, key) => {
  const result = metadata?.result && typeof metadata.result === 'object' ? metadata.result : {}
  return result[key]
}

const collectIdentifierLists = (metadata = {}, summary = {}) => {
  const lists = []
  const fromResult = getResultValue(metadata, '唯一标识符')
  if (Array.isArray(fromResult)) lists.push(fromResult)
  if (Array.isArray(metadata?.identifiers)) lists.push(metadata.identifiers)
  if (Array.isArray(summary?.identifiers)) lists.push(summary.identifiers)
  return lists
}

const isIdCardIdentifierType = (type) => {
  const text = normalizeStr(type)
  if (!text) return false
  return text === '身份证号' || text === '身份证' || text.includes('身份证')
}

const extractIdNumberFromIdentifiers = (metadata = {}, summary = {}) => {
  for (const identifiers of collectIdentifierLists(metadata, summary)) {
    for (const item of identifiers) {
      if (!item) continue
      if (typeof item === 'string' || typeof item === 'number') {
        const normalized = normalizeIdNumber(item)
        if (normalized) return normalized
        continue
      }
      if (typeof item !== 'object') continue
      const type = item['标识符类型'] || item.type || item.identifier_type
      const value = item['标识符编号'] || item.value || item.id || item.identifier || item['编号']
      if (isIdCardIdentifierType(type)) {
        const normalized = normalizeIdNumber(value)
        if (normalized) return normalized
      }
    }
  }

  for (const identifiers of collectIdentifierLists(metadata, summary)) {
    for (const item of identifiers) {
      if (!item || typeof item !== 'object') continue
      const normalized = normalizeIdNumber(
        item['标识符编号'] || item.value || item.id || item.identifier || item['编号']
      )
      if (normalized) return normalized
    }
  }

  return ''
}

export const normalizePatientPrefill = (source = {}) => {
  const metadata = source.document_metadata || source.metadata || source.metadata_json || {}
  const summary = source.document_metadata_summary || {}
  const extracted = source.extracted_info || source.extracted || {}
  const patientInfo = source.patient_info || {}

  return {
    id: source.id,
    name: pickMeaningful(
      extracted.name || extracted.patient_name ||
      metadata.patientName || metadata.patient_name || summary.patient_name || getResultValue(metadata, '患者姓名') ||
      patientInfo.name || source.name
    ),
    gender: normalizeGender(
      extracted.gender || extracted.patient_gender ||
      metadata.gender || metadata.patient_gender || summary.patient_gender || getResultValue(metadata, '患者性别') ||
      patientInfo.gender || source.gender
    ),
    age: parseAge(
      extracted.age || extracted.patient_age ||
      metadata.age || metadata.patient_age || summary.patient_age || getResultValue(metadata, '患者年龄') ||
      patientInfo.age || source.age
    ),
    birthDate: normalizeBirthDateValue(
      extracted.birth_date || extracted.birthDate ||
      metadata.birthDate || metadata.birth_date || summary.birth_date || getResultValue(metadata, '出生日期') ||
      patientInfo.birth_date || source.birthDate || source.birth_date
    ),
    phone: normalizePhone(
      extracted.phone || metadata.phone || summary.phone || getResultValue(metadata, '联系电话') || source.phone
    ),
    idNumber: normalizeIdNumber(
      extracted.id_number || extracted.idCard || extracted.id_card ||
      metadata.id_number || metadata.idCard || metadata.id_card ||
      source.idNumber || source.id_number || source.id_card ||
      extractIdNumberFromIdentifiers(metadata, summary)
    ),
    address: normalizeAddress(
      extracted.address || metadata.address || summary.address ||
      getResultValue(metadata, '地址') || getResultValue(metadata, '家庭住址') ||
      source.address
    )
  }
}

export const mergePatientPrefills = (sources = []) => {
  const normalized = sources
    .map(normalizePatientPrefill)
    .map((fields) => ({ fields, score: computeScore(fields) }))
    .filter((item) => item.score > 0)

  const empty = {
    name: '',
    gender: '',
    age: '',
    birthDate: null,
    phone: '',
    idNumber: '',
    address: ''
  }

  if (!normalized.length) return empty

  normalized.sort((a, b) => b.score - a.score)
  const orderedFields = normalized.map((item) => item.fields)
  const firstFrom = (getter) => {
    for (const fields of orderedFields) {
      const value = getter(fields)
      if (value) return value
    }
    return null
  }

  return {
    name: firstFrom((fields) => fields.name) || '',
    gender: firstFrom((fields) => fields.gender) || '',
    age: firstFrom((fields) => (typeof fields.age === 'number' ? String(fields.age) : '')) || '',
    birthDate: firstFrom((fields) => fields.birthDate) || null,
    phone: firstFrom((fields) => fields.phone) || '',
    idNumber: firstFrom((fields) => fields.idNumber) || '',
    address: firstFrom((fields) => fields.address) || ''
  }
}

export const toPatientFormValues = (prefill = {}) => ({
  name: prefill.name || '',
  gender: prefill.gender || '',
  age: prefill.age || '',
  birthDate: normalizeBirthDateValue(prefill.birthDate || prefill.birth_date) || null,
  phone: prefill.phone || '',
  idNumber: prefill.idNumber || prefill.id_number || prefill.id_card || '',
  address: prefill.address || ''
})
