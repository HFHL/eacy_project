export const examFields = {
// 检查检验 - 病理报告（可重复）
  pathology: {
    name: '病理报告',
    repeatable: true,
    records: [
      {
        id: 'pathology_1',
        fields: [
          { id: 'CORE089', name: '报告类型', value: '病理', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'CORE090', name: '标本部位', value: '右肺下叶', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE091', name: '标本类型', value: '石蜡切片', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'CORE092', name: '病理诊断', value: '低分化腺癌', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'textarea' },
          { id: 'CORE093', name: '附加描述', value: '可见腺体浸润，部分神经侵犯', confidence: 'medium', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'textarea' },
          { id: 'CORE094', name: '报告编号', value: '2024-PL001238', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE095', name: '报告医生', value: '王医师', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true },
          { id: 'CORE096', name: '送检日期', value: '2024-01-10', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'datepicker' },
          { id: 'CORE097', name: '报告日期', value: '2024-01-12', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'datepicker' }
        ]
      },
      {
        id: 'pathology_2',
        fields: [
          { id: 'CORE089_2', name: '报告类型', value: '免疫组化', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'CORE090_2', name: '标本部位', value: '右肺下叶', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE091_2', name: '标本类型', value: '石蜡切片', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'CORE092_2', name: '病理诊断', value: 'TTF-1(+), CK7(+), CK20(-)', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'textarea' },
          { id: 'CORE093_2', name: '附加描述', value: '符合肺腺癌免疫组化表型', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'textarea' },
          { id: 'CORE094_2', name: '报告编号', value: '2024-IHC001239', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE095_2', name: '报告医生', value: '李医师', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true },
          { id: 'CORE096_2', name: '送检日期', value: '2024-01-10', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'datepicker' },
          { id: 'CORE097_2', name: '报告日期', value: '2024-01-13', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'datepicker' }
        ]
      }
    ]
  },

// 检查检验 - 实验室检查（可重复）
  laboratory: {
    name: '实验室检查',
    repeatable: true,
    records: [
      {
        id: 'laboratory_1',
        fields: [
          // fields类型字段（普通字段）
          { id: 'CORE131', name: '检查机构', value: '中山大学附属第三医院检验科', confidence: 'high', source: 'ehr_doc2', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE132', name: '报告编号', value: 'LAB2024-001567', confidence: 'high', source: 'ehr_doc2', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE133', name: '检查日期', value: '2024-01-15', confidence: 'high', source: 'ehr_doc2', editable: true, fieldType: 'fields', uiType: 'date' },
          { id: 'CORE134', name: '报告日期', value: '2024-01-15', confidence: 'high', source: 'ehr_doc2', editable: true, fieldType: 'fields', uiType: 'date' },
          { id: 'CORE135', name: '标本类型', value: '血液', confidence: 'high', source: 'ehr_doc2', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'CORE136', name: '项目组名称', value: '血常规+生化全套', confidence: 'high', source: 'ehr_doc2', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE137', name: '报告医生', value: '张医师', confidence: 'medium', source: 'ehr_doc2', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true },

          // table_fields类型字段（表格字段）
          {
            id: 'CORE138_TABLE',
            name: '检验指标',
            fieldType: 'table_fields',
            confidence: 'high',
            source: 'ehr_doc2',
            editable: true,
            tableData: [
              {
                id: 'lab_item_1',
                '指标名称（中文）': '甲胎蛋白',
                '英文简称': 'AFP',
                '检测值': '3.2',
                '单位': 'ng/mL',
                '参考范围': '0-10',
                '是否异常': false,
                '异常标志': ''
              },
              {
                id: 'lab_item_2',
                '指标名称（中文）': '癌胚抗原',
                '英文简称': 'CEA',
                '检测值': '15.8',
                '单位': 'ng/mL',
                '参考范围': '0-5',
                '是否异常': true,
                '异常标志': '↑'
              },
              {
                id: 'lab_item_3',
                '指标名称（中文）': '白细胞计数',
                '英文简称': 'WBC',
                '检测值': '6.5',
                '单位': '×10⁹/L',
                '参考范围': '3.5-9.5',
                '是否异常': false,
                '异常标志': ''
              }
            ]
          }
        ]
      },
      {
        id: 'laboratory_2',
        fields: [
          // fields类型字段（普通字段）
          { id: 'CORE131_2', name: '检查机构', value: '中山大学附属第三医院检验科', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE132_2', name: '报告编号', value: 'LAB2024-001789', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE133_2', name: '检查日期', value: '2024-02-01', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'date' },
          { id: 'CORE134_2', name: '报告日期', value: '2024-02-01', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'date' },
          { id: 'CORE135_2', name: '标本类型', value: '血液', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'CORE136_2', name: '项目组名称', value: '肿瘤标志物检测', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE137_2', name: '报告医生', value: '李医师', confidence: 'medium', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true },

          // table_fields类型字段（表格字段）
          {
            id: 'CORE138_TABLE_2',
            name: '检验指标',
            fieldType: 'table_fields',
            confidence: 'high',
            source: 'ehr_doc5',
            editable: true,
            tableData: [
              {
                id: 'lab_item_4',
                '指标名称（中文）': 'CA199',
                '英文简称': 'CA199',
                '检测值': '45.2',
                '单位': 'U/mL',
                '参考范围': '0-37',
                '是否异常': true,
                '异常标志': '↑'
              },
              {
                id: 'lab_item_5',
                '指标名称（中文）': 'CA125',
                '英文简称': 'CA125',
                '检测值': '28.5',
                '单位': 'U/mL',
                '参考范围': '0-35',
                '是否异常': false,
                '异常标志': ''
              }
            ]
          }
        ]
      }
    ]
  },

// 检查检验 - 影像检查（可重复）
  imaging: {
    name: '影像检查',
    repeatable: true,
    records: [
      {
        id: 'imaging_1',
        fields: [
          { id: 'CORE118', name: '检查机构', value: '中山大学附属第三医院影像科', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE119', name: '检查日期', value: '2024-01-12', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'datepicker' },
          { id: 'CORE120', name: '报告日期', value: '2024-01-12', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'datepicker' },
          { id: 'CORE121', name: '检查项目名称', value: '胸部增强CT', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE122', name: '检查方式', value: 'CT', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'CORE123', name: '检查部位', value: '胸部', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'CORE125', name: '所见描述', value: '左肺下叶结节，大小约2.5cm', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'textarea' },
          { id: 'CORE126', name: '诊断印象/结论', value: '左肺下叶占位性病变，考虑恶性', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'textarea' }
        ]
      },
      {
        id: 'imaging_2',
        fields: [
          { id: 'CORE118_2', name: '检查机构', value: '中山大学附属第三医院影像科', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE119_2', name: '检查日期', value: '2024-02-15', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'datepicker' },
          { id: 'CORE120_2', name: '报告日期', value: '2024-02-15', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'datepicker' },
          { id: 'CORE121_2', name: '检查项目名称', value: 'PET-CT全身显像', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE122_2', name: '检查方式', value: 'PET-CT', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'CORE123_2', name: '检查部位', value: '全身', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'CORE125_2', name: '所见描述', value: '左肺下叶结节FDG摄取增高，SUVmax=8.5，纵隔淋巴结肿大', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'textarea' },
          { id: 'CORE126_2', name: '诊断印象/结论', value: '左肺下叶恶性肿瘤，纵隔淋巴结转移', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'textarea' }
        ]
      }
    ]
  },

// 检查检验 - 基因检测（可重复）
  genetics: {
    name: '基因检测',
    repeatable: true,
    records: [
      {
        id: 'genetics_1',
        fields: [
          // fields类型字段（普通字段）
          { id: 'CORE099', name: '检测类型', value: 'NGS', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'CORE100', name: '标本类型', value: '组织切片', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'CORE101', name: '检测项目名称', value: '肿瘤靶向药物基因检测', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE113', name: '报告编号', value: 'NGS2024-001234', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE114', name: '医疗机构', value: '华大基因', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE116', name: '送检日期', value: '2024-01-10', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'datepicker' },
          { id: 'CORE117', name: '报告日期', value: '2024-01-14', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'datepicker' },

          // table_fields类型字段（表格字段）
          {
            id: 'CORE102_TABLE',
            name: '突变结果',
            fieldType: 'table_fields',
            confidence: 'high',
            source: 'ehr_doc5',
            editable: true,
            tableData: [
              {
                id: 'mutation_1',
                '基因名称': 'EGFR',
                '突变位点': 'L858R',
                '突变效应类型': '敏感突变',
                '突变频率': '35%',
                '外显子编号': 'Exon 21',
                '变异类型': '错义突变'
              },
              {
                id: 'mutation_2',
                '基因名称': 'TP53',
                '突变位点': 'R273H',
                '突变效应类型': '未知意义',
                '突变频率': '42%',
                '外显子编号': 'Exon 8',
                '变异类型': '错义突变'
              }
            ]
          }
        ]
      },
      {
        id: 'genetics_2',
        fields: [
          // fields类型字段（普通字段）
          { id: 'CORE099_2', name: '检测类型', value: 'PCR', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'CORE100_2', name: '标本类型', value: '血液', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'CORE101_2', name: '检测项目名称', value: 'EGFR突变检测', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE113_2', name: '报告编号', value: 'PCR2024-001456', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE114_2', name: '医疗机构', value: '中山大学附属第三医院检验科', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE116_2', name: '送检日期', value: '2024-02-05', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'datepicker' },
          { id: 'CORE117_2', name: '报告日期', value: '2024-02-07', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'datepicker' },

          // table_fields类型字段（表格字段）
          {
            id: 'CORE102_TABLE_2',
            name: '突变结果',
            fieldType: 'table_fields',
            confidence: 'high',
            source: 'ehr_doc7',
            editable: true,
            tableData: [
              {
                id: 'mutation_3',
                '基因名称': 'EGFR',
                '突变位点': 'L858R',
                '突变效应类型': '敏感突变',
                '突变频率': '38%',
                '外显子编号': 'Exon 21',
                '变异类型': '错义突变'
              }
            ]
          }
        ]
      }
    ]
  },

// 检查检验 - 其他检查（可重复）
   otherExam: {
     name: '其他检查',
     repeatable: true,
     records: [
       {
         id: 'other_exam_1',
         fields: [
           // fields类型字段
           { id: 'CORE146', name: '报告项目名称', value: '肺功能检查', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'text' },
           { id: 'CORE147', name: '检查机构', value: '中山大学附属第三医院呼吸科', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'text' },
           { id: 'CORE148', name: '检查日期', value: '2024-01-08', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'date-picker' },
           { id: 'CORE149', name: '报告日期', value: '2024-01-08', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'date-picker' },
           { id: 'CORE150', name: '检查编号', value: 'PFT2024-001234', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'text' },
           { id: 'CORE153', name: '报告结论文字', value: '肺功能轻度受限，FEV1/FVC比值降低', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'textarea' },
           { id: 'CORE154', name: '报告医生', value: '李医师', confidence: 'medium', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true },
           { id: 'CORE155', name: '审核医生', value: '王主任', confidence: 'medium', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true }
         ]
       }
     ]
   }
}
