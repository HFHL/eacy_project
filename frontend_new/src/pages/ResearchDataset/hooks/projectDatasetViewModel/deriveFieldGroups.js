const collectFieldKeys = (targetSet, fields) => {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return
  Object.keys(fields).forEach((fieldKey) => {
    if (fieldKey && !String(fieldKey).startsWith('__')) targetSet.add(String(fieldKey))
  })
}

const readPatientGroups = (patient) => {
  if (patient?.crf_data?.groups && typeof patient.crf_data.groups === 'object') {
    return patient.crf_data.groups
  }
  if (patient?.crfGroups && typeof patient.crfGroups === 'object') {
    return patient.crfGroups
  }
  return {}
}

export const deriveFieldGroupsFromPatientCrfData = (patientDataset) => {
  const groupMap = new Map()
  ;(Array.isArray(patientDataset) ? patientDataset : []).forEach((patient) => {
    const groups = readPatientGroups(patient)
    Object.entries(groups).forEach(([groupId, groupNode]) => {
      if (!groupId || !groupNode || typeof groupNode !== 'object') return
      if (String(groupId).startsWith('_')) return
      const existing = groupMap.get(groupId) || {
        group_id: String(groupId),
        group_name: String(groupNode.group_name || groupNode.name || groupId),
        dbFieldSet: new Set(),
        is_repeatable: Boolean(groupNode.is_repeatable),
        order: groupMap.size,
      }

      collectFieldKeys(existing.dbFieldSet, groupNode.fields)
      ;(Array.isArray(groupNode.records) ? groupNode.records : []).forEach((record) => {
        collectFieldKeys(existing.dbFieldSet, record?.fields && typeof record.fields === 'object' ? record.fields : record)
      })
      existing.is_repeatable = existing.is_repeatable
        || Boolean(groupNode.is_repeatable)
        || (Array.isArray(groupNode.records) && groupNode.records.length > 0)
      groupMap.set(groupId, existing)
    })
  })

  return [...groupMap.values()].map((group) => ({
    group_id: group.group_id,
    group_name: group.group_name,
    db_fields: [...group.dbFieldSet],
    is_repeatable: group.is_repeatable,
    order: group.order,
    sources: null,
  }))
}
