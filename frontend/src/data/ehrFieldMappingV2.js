/**
 * 患者电子病历 V2 字段映射（与后端 app/ehr_config/ehr_field_mapping_v2.py 保持一致）
 * 用于前端：知道「表单路径（中文点分隔）」与「数据库字段名」的对应关系。
 * 可与接口返回的 field_mapping 一起使用，或单独用于本地判断、脏检查等。
 */

// 表单路径（中文，点分隔）→ 数据库字段名（camelCase）
export const AI_TO_DB_FIELD_MAPPING = {
  '基本信息.人口学情况.入院日期': 'basicInfo_demography_admissionDate',
  '基本信息.人口学情况.身份信息.患者姓名': 'basicInfo_demography_identityInfo_patientName',
  '基本信息.人口学情况.身份信息.曾用名姓名': 'basicInfo_demography_identityInfo_formerName',
  '基本信息.人口学情况.身份信息.性别': 'basicInfo_demography_identityInfo_gender',
  '基本信息.人口学情况.身份信息.出生日期': 'basicInfo_demography_identityInfo_birthDate',
  '基本信息.人口学情况.身份信息.年龄': 'basicInfo_demography_identityInfo_age',
  '基本信息.人口学情况.身份信息.身份ID': 'basicInfo_demography_identityInfo_identityID',
  '基本信息.人口学情况.人口统计学.婚姻状况': 'basicInfo_demography_maritalStatus',
  '基本信息.人口学情况.人口统计学.教育水平': 'basicInfo_demography_educationLevel',
  '基本信息.人口学情况.人口统计学.职业': 'basicInfo_demography_occupation',
  '基本信息.人口学情况.人口统计学.国籍': 'basicInfo_demography_nationality',
  '基本信息.人口学情况.人口统计学.民族': 'basicInfo_demography_ethnicity',
  '基本信息.人口学情况.人口统计学.医保类型': 'basicInfo_demography_insuranceType',
  '基本信息.人口学情况.医疗事件标识符': 'basicInfo_demography_medicalEventIdentifier',
  '基本信息.人口学情况.联系方式': 'basicInfo_demography_contactInfo',
  '基本信息.人口学情况.紧急联系人': 'basicInfo_demography_emergencyContact',
  '既往情况及家族史.健康情况.入院日期': 'pastHistory_health_admissionDate',
  '既往情况及家族史.健康情况.过敏史.是否存在过敏史': 'pastHistory_health_allergy_hasAllergy',
  '既往情况及家族史.健康情况.过敏史.过敏源(食物或药物)': 'pastHistory_health_allergy_allergen',
  '既往情况及家族史.健康情况.过敏史.过敏反应': 'pastHistory_health_allergy_reaction',
  '既往情况及家族史.健康情况.既往史.是否存在既往疾病或合并症': 'pastHistory_health_medicalHistory_hasHistory',
  '既往情况及家族史.健康情况.既往史.既往疾病': 'pastHistory_health_medicalHistory_disease',
  '既往情况及家族史.健康情况.既往史.治疗方案或药物': 'pastHistory_health_medicalHistory_treatment',
  '既往情况及家族史.健康情况.既往史.确诊日期': 'pastHistory_health_medicalHistory_diagnosisDate',
  '既往情况及家族史.健康情况.个人史.出生史': 'pastHistory_health_personalHistory_birthHistory',
  '既往情况及家族史.健康情况.个人史.生长发育史': 'pastHistory_health_personalHistory_growthDevelopment',
  '既往情况及家族史.健康情况.个人史.居住史': 'pastHistory_health_personalHistory_residenceHistory',
  '既往情况及家族史.健康情况.个人史.疫区旅行史': 'pastHistory_health_personalHistory_epidemicTravel',
  '既往情况及家族史.健康情况.个人史.职业暴露史': 'pastHistory_health_personalHistory_occupationalExposure',
  '既往情况及家族史.健康情况.个人史.免疫接种情况': 'pastHistory_health_personalHistory_immunization',
  '既往情况及家族史.健康情况.生育史（女性）.生育史详情': 'pastHistory_health_obstetricHistory_detail',
  '既往情况及家族史.健康情况.生育史（女性）.生育史描述': 'pastHistory_health_obstetricHistory_description',
  '既往情况及家族史.健康情况.生理史（女性月经史）.生理史情况描述（女性月经史）': 'pastHistory_health_menstrualHistory_description',
  '既往情况及家族史.健康情况.生理史（女性月经史）.初潮年龄': 'pastHistory_health_menstrualHistory_menarcheAge',
  '既往情况及家族史.健康情况.生理史（女性月经史）.月经周期长度(单位：天）': 'pastHistory_health_menstrualHistory_cycleDays',
  '既往情况及家族史.健康情况.生理史（女性月经史）.月经量': 'pastHistory_health_menstrualHistory_flow',
  '既往情况及家族史.健康情况.生理史（女性月经史）.周期规律性': 'pastHistory_health_menstrualHistory_regularity',
  '既往情况及家族史.健康情况.生理史（女性月经史）.是否有绝经': 'pastHistory_health_menstrualHistory_hasMenopause',
  '既往情况及家族史.健康情况.生理史（女性月经史）.末次月经日期': 'pastHistory_health_menstrualHistory_lastMenstrualDate',
  '既往情况及家族史.健康情况.手术史': 'pastHistory_health_surgeryHistory',
  '既往情况及家族史.健康情况.家族遗传病及肿瘤病史': 'pastHistory_health_familyGeneticTumorHistory',
  '诊断记录.诊断记录': 'diagnosisRecords_records',
  '治疗情况.药物治疗': 'treatment_medication',
  '治疗情况.手术治疗': 'treatment_surgery',
  '治疗情况.外放射治疗': 'treatment_externalRadiation',
  '治疗情况.放射粒子植入（内放疗）': 'treatment_internalRadiation',
  '治疗情况.置管情况': 'treatment_catheterization',
  '治疗情况.其他治疗': 'treatment_other',
  '病理.细胞学病理': 'pathology_cytology',
  '病理.活检组织病理': 'pathology_biopsy',
  '病理.冰冻病理': 'pathology_frozen',
  '病理.术后组织病理': 'pathology_postoperative',
  '病理.染色体分析': 'pathology_chromosome',
  '基因检测.基因突变/扩增/重排/融合及相关标志物检测': 'geneticTesting_geneMutation',
  '基因检测.DNA倍体分析检测': 'geneticTesting_dnaPloidy',
  '基因检测.循环肿瘤细胞（CTC）检测': 'geneticTesting_ctc',
  '基因检测.ctDNA检测': 'geneticTesting_ctDNA',
  '影像检查.X线': 'imaging_xray',
  '影像检查.CT': 'imaging_ct',
  '影像检查.MRI': 'imaging_mri',
  '影像检查.PET-CT/PET-MR': 'imaging_petCtMr',
  '影像检查.超声': 'imaging_ultrasound',
  '影像检查.骨扫描': 'imaging_boneScan',
  '内镜检查.胃肠镜检查': 'endoscopy_gastrointestinal',
  '内镜检查.支气管镜检查': 'endoscopy_bronchoscopy',
  '内镜检查.喉镜检查': 'endoscopy_laryngoscopy',
  '特殊检查.其他检查': 'specialExamination_other',
  '实验室检查.血常规': 'laboratory_bloodRoutine',
  '实验室检查.生化检查': 'laboratory_biochemistry',
  '实验室检查.血气分析': 'laboratory_bloodGas',
  '实验室检查.传染学检测': 'laboratory_infectious',
  '实验室检查.免疫学检测': 'laboratory_immunology',
  '实验室检查.肿瘤标志物': 'laboratory_tumorMarker',
  '实验室检查.感染性指标': 'laboratory_infectionIndicator',
  '实验室检查.血型': 'laboratory_bloodType',
  '实验室检查.其他检测': 'laboratory_other'
}

// 数据库字段名 → 表单路径（中文）
export const DB_TO_AI_PATH_MAPPING = Object.fromEntries(
  Object.entries(AI_TO_DB_FIELD_MAPPING).map(([k, v]) => [v, k])
)

export default {
  AI_TO_DB_FIELD_MAPPING,
  DB_TO_AI_PATH_MAPPING
}
