import { emptySuccess } from '../_empty'

export const toArray = (value) => {
  if (Array.isArray(value)) return value
  if (value === undefined || value === null || value === '') return []
  return String(value).split(/[,\u3001;\uff1b]/).map((item) => item.trim()).filter(Boolean)
}

const pickExtra = (patient = {}) => (
  patient.extra_json && typeof patient.extra_json === 'object' ? patient.extra_json : {}
)

export const normalizePatient = (patient = {}) => {
  const extra = pickExtra(patient)
  const diagnosis = toArray(extra.diagnosis ?? patient.diagnosis ?? patient.main_diagnosis)
  const department = patient.department ?? extra.department_name ?? extra.department ?? ''
  const doctor = patient.doctor_name ?? extra.attending_doctor_name ?? extra.doctor ?? ''

  return {
    ...extra,
    ...patient,
    patient_code: extra.patient_code || patient.patient_code || patient.id,
    department,
    department_id: extra.department_id || department,
    department_name: extra.department_name || department,
    diagnosis,
    main_diagnosis: patient.main_diagnosis ?? diagnosis.join(', '),
    doctor_name: doctor,
    attending_doctor_name: doctor,
    doctor,
    phone: extra.phone || patient.phone || '',
    id_card: extra.id_card || patient.id_card || '',
    address: extra.address || patient.address || '',
    admission_date: extra.admission_date || patient.admission_date || '',
    notes: extra.notes || patient.notes || '',
    tags: Array.isArray(extra.tags) ? extra.tags : [],
    projects: Array.isArray(patient.projects)
      ? patient.projects
      : (Array.isArray(extra.projects) ? extra.projects : []),
    // 后端已聚合返回 document_count / data_completeness；extra_json 仅作兼容兜底。
    document_count: Number(patient.document_count ?? extra.document_count ?? 0) || 0,
    pending_field_conflict_count: Number(extra.pending_field_conflict_count || 0),
    has_pending_field_conflicts: !!extra.has_pending_field_conflicts,
    data_completeness: Number(patient.data_completeness ?? extra.data_completeness ?? 0) || 0,
    status: patient.deleted_at ? 'deleted' : (extra.status || patient.status || 'active'),
    merged_data: {
      ...(extra.merged_data || {}),
      admission_date: extra.admission_date || patient.admission_date || extra.merged_data?.admission_date || '',
      notes: extra.notes || patient.notes || extra.merged_data?.notes || '',
    },
    source_document_ids: Array.isArray(extra.source_document_ids) ? extra.source_document_ids : [],
  }
}

export const normalizeListPayload = (payload = {}) => {
  const page = Number(payload.page || 1)
  const pageSize = Number(payload.page_size || 20)
  const total = Number(payload.total || 0)
  const items = (Array.isArray(payload.items) ? payload.items : []).map(normalizePatient)

  items.items = items
  items.list = items
  items.total = total
  items.page = page
  items.page_size = pageSize

  const backendStats = (payload.statistics && typeof payload.statistics === 'object') ? payload.statistics : null
  const fallbackStats = {
    total_documents: items.reduce((sum, item) => sum + Number(item.document_count || 0), 0),
    average_completeness: items.length
      ? items.reduce((sum, item) => sum + Number(item.data_completeness || 0), 0) / items.length
      : 0,
    recently_added: 0,
  }
  const statistics = backendStats ? {
    total_documents: Number(backendStats.total_documents ?? fallbackStats.total_documents) || 0,
    average_completeness: Number(backendStats.average_completeness ?? fallbackStats.average_completeness) || 0,
    recently_added: Number(backendStats.recently_added_today ?? backendStats.recently_added ?? 0) || 0,
  } : fallbackStats

  return emptySuccess(items, {
    pagination: { total, page, page_size: pageSize },
    total,
    page,
    page_size: pageSize,
    statistics,
  })
}

export const normalizeListParams = (params = {}) => {
  const next = {
    page: params.page || 1,
    page_size: params.page_size || params.pageSize || 20,
  }

  const keyword = params.keyword ?? params.search
  if (keyword) next.keyword = keyword

  const department = params.department ?? params.department_id ?? params.department_name
  if (department) next.department = department

  return next
}

export const normalizePatientPayload = (data = {}) => {
  const diagnosis = toArray(data.diagnosis ?? data.main_diagnosis)
  const department = data.department ?? data.department_name ?? data.department_id ?? null
  const doctor = data.doctor_name ?? data.attending_doctor_name ?? data.doctor ?? null
  const extraJson = {
    ...(data.extra_json || {}),
    patient_code: data.patient_code,
    department_id: data.department_id ?? department,
    department_name: data.department_name ?? department,
    diagnosis,
    attending_doctor_name: doctor,
    phone: data.phone,
    id_card: data.id_card,
    address: data.address,
    admission_date: data.admission_date,
    notes: data.notes,
    tags: data.tags,
    projects: data.projects,
    merged_data: {
      ...(data.merged_data || {}),
      admission_date: data.admission_date ?? data.merged_data?.admission_date,
      notes: data.notes ?? data.merged_data?.notes,
    },
  }

  Object.keys(extraJson).forEach((key) => {
    if (extraJson[key] === undefined) delete extraJson[key]
  })

  return {
    name: data.name,
    gender: data.gender || null,
    birth_date: data.birth_date || data.birthDate || null,
    age: data.age === undefined || data.age === null || data.age === '' ? null : Number(data.age),
    department,
    main_diagnosis: (data.main_diagnosis ?? diagnosis.join(', ')) || null,
    doctor_name: doctor,
    extra_json: extraJson,
  }
}
