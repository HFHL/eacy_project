export function collectPatientAuditFieldMaps(data) {
  const meta = data && typeof data === 'object' ? data._extraction_metadata : null
  const audit = meta && typeof meta === 'object' ? meta.audit : null
  if (!audit || typeof audit !== 'object') return []

  const allFieldMaps = []
  if (audit.fields && typeof audit.fields === 'object') {
    allFieldMaps.push(audit.fields)
  }
  for (const value of Object.values(audit)) {
    if (value && typeof value === 'object' && value.fields && typeof value.fields === 'object') {
      allFieldMaps.push(value.fields)
    }
  }
  return allFieldMaps
}

export function collectProjectAuditFieldMaps(taskResults) {
  if (!Array.isArray(taskResults)) return []
  const allFieldMaps = []
  for (const task of taskResults) {
    const auditFields = task?.audit?.fields
    if (auditFields && typeof auditFields === 'object') {
      allFieldMaps.push(auditFields)
    }
  }
  return allFieldMaps
}
