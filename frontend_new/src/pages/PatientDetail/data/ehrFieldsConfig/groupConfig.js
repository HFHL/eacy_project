export const ehrFieldGroupsConfig = [
  {
    key: 'basicInfo',
    name: '基本信息',
    children: [
      { key: 'personalInfo', name: '个人信息', fieldCount: 6 },
      { key: 'contactInfo', name: '联系方式', fieldCount: 5 },
      { key: 'demographics', name: '人口学', fieldCount: 5 },
      { key: 'emergencyContact', name: '紧急联系人', fieldCount: 3 }
    ]
  },
  {
    key: 'healthStatus',
    name: '健康状况',
    children: [
      { key: 'lifestyle', name: '生活史', fieldCount: 8 },
      { key: 'personalHistory', name: '个体史', fieldCount: 5 },
      { key: 'immunization', name: '免疫接种史', fieldCount: 1 },
      { key: 'reproductive', name: '生育史', fieldCount: 1 },
      { key: 'menstrual', name: '生理史', fieldCount: 5 },
      { key: 'pastMedical', name: '既往病史', fieldCount: 2 },
      { key: 'surgical', name: '手术史', fieldCount: 3 },
      { key: 'family', name: '家族史', fieldCount: 1 },
      { key: 'comorbidity', name: '合并症', fieldCount: 1 },
      { key: 'allergy', name: '过敏史', fieldCount: 1 }
    ]
  },
  {
    key: 'clinicalInfo',
    name: '诊疗信息',
    children: [
      { key: 'diagnosis', name: '诊断记录', fieldCount: 7 },
      { key: 'treatment', name: '治疗记录', fieldCount: 9 },
      { key: 'medication', name: '用药记录', fieldCount: 10 }
    ]
  },
  {
    key: 'examination',
    name: '检查检验',
    children: [
      { key: 'pathology', name: '病理报告', fieldCount: 9 },
      { key: 'genetics', name: '基因检测', fieldCount: 8 },
      { key: 'imaging', name: '影像检查', fieldCount: 8 },
      { key: 'laboratory', name: '实验室检查', fieldCount: 8 },
      { key: 'otherExam', name: '其他检查', fieldCount: 8 }
    ]
  },
  {
    key: 'otherMaterials',
    name: '其他材料',
    children: [
      { key: 'materialInfo', name: '材料信息', fieldCount: 8 }
    ]
  }
]

export default ehrFieldsData
