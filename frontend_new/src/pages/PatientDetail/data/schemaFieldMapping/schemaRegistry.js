import {
  allergySchema,
  familyHistorySchema,
  immunizationSchema,
  pastMedicalSchema,
  reproductiveSchema,
  surgicalSchema,
} from './historySchemas'
import {
  diagnosisSchema,
  medicationSchema,
  radiationSchema,
  surgicalTreatmentSchema,
} from './treatmentSchemas'
import {
  biopsyPathologySchema,
  chromosomeAnalysisSchema,
  cytologyPathologySchema,
  frozenPathologySchema,
  postoperativePathologySchema,
} from './pathologySchemas'
import {
  endoscopySchema,
  geneticsSchema,
  imagingSchema,
  laboratorySchema,
  otherExamSchema,
} from './examSchemas'

export const allSchemas = {
  family_history_records: familyHistorySchema,
  allergy_records: allergySchema,
  past_medical_records: pastMedicalSchema,
  surgical_records: surgicalSchema,
  immunization_records: immunizationSchema,
  reproductive_records: reproductiveSchema,
  diagnosis_records: diagnosisSchema,
  medication_records: medicationSchema,
  treatment_records: surgicalTreatmentSchema,
  '病理.细胞学病理': cytologyPathologySchema,
  '病理.活检组织病理': biopsyPathologySchema,
  '病理.冰冻病理': frozenPathologySchema,
  '病理.术后组织病理': postoperativePathologySchema,
  '病理.染色体分析': chromosomeAnalysisSchema,
  laboratory_records: laboratorySchema,
  imaging_records: imagingSchema,
  genetics_records: geneticsSchema,
  other_exam_records: otherExamSchema,
}

export const pathologySubSchemas = {
  '细胞学病理': cytologyPathologySchema,
  '活检组织病理': biopsyPathologySchema,
  '冰冻病理': frozenPathologySchema,
  '术后组织病理': postoperativePathologySchema,
  '染色体分析': chromosomeAnalysisSchema,
}

export {
  allergySchema,
  biopsyPathologySchema,
  chromosomeAnalysisSchema,
  cytologyPathologySchema,
  diagnosisSchema,
  endoscopySchema,
  familyHistorySchema,
  frozenPathologySchema,
  geneticsSchema,
  imagingSchema,
  immunizationSchema,
  laboratorySchema,
  medicationSchema,
  otherExamSchema,
  pastMedicalSchema,
  postoperativePathologySchema,
  radiationSchema,
  reproductiveSchema,
  surgicalSchema,
  surgicalTreatmentSchema,
}
