from .common import *

def test_llm_ehr_extractor_normalizes_records_to_flat_fields():
    extractor = LlmEhrExtractor()
    state = {
        "document_id": "document-1",
        "field_specs": [
            {
                "field_key": "患者姓名",
                "field_path": "基本信息.人口学情况.身份信息.患者姓名",
                "field_title": "患者姓名",
                "value_type": "text",
                "record_form_key": "基本信息.人口学情况",
            },
            {
                "field_key": "联系电话",
                "field_path": "基本信息.人口学情况.联系方式.联系电话",
                "field_title": "联系电话",
                "value_type": "text",
                "record_form_key": "基本信息.人口学情况",
            },
        ],
        "raw_output": {
            "records": [
                {
                    "form_path": "基本信息.人口学情况",
                    "record": {
                        "身份信息": {"患者姓名": "张三"},
                        "联系方式": [{"联系电话": "13800138001"}],
                    },
                    "confidence": 0.91,
                    "evidences": [{"source_type": "line", "source_id": "p1-l1", "quote_text": "姓名：张三 电话：13800138001"}],
                }
            ]
        },
    }

    result = extractor._node_normalize(state)

    assert result["fields_output"] == [
        {
            "field_key": "患者姓名",
            "field_path": "基本信息.人口学情况.身份信息.患者姓名",
            "field_title": "患者姓名",
            "record_form_key": "基本信息.人口学情况",
            "value_type": "text",
            "value_text": "张三",
            "confidence": 0.91,
            "quote_text": "姓名：张三 电话：13800138001",
            "evidences": [{"source_type": "line", "source_id": "p1-l1", "quote_text": "姓名：张三 电话：13800138001"}],
            "evidence_type": "llm_extract",
        },
        {
            "field_key": "联系电话",
            "field_path": "基本信息.人口学情况.联系方式.联系电话",
            "field_title": "联系电话",
            "record_form_key": "基本信息.人口学情况",
            "value_type": "text",
            "value_text": "13800138001",
            "confidence": 0.91,
            "quote_text": "姓名：张三 电话：13800138001",
            "evidences": [{"source_type": "line", "source_id": "p1-l1", "quote_text": "姓名：张三 电话：13800138001"}],
            "evidence_type": "llm_extract",
            "repeat_index": 0,
            "path_indexes": [0],
        },
    ]


def test_llm_ehr_extractor_does_not_share_record_evidences_across_unrelated_fields():
    extractor = LlmEhrExtractor()
    state = {
        "document_id": "document-1",
        "field_specs": [
            {
                "field_key": "患者姓名",
                "field_path": "基本信息.人口学情况.身份信息.患者姓名",
                "field_title": "患者姓名",
                "value_type": "text",
                "record_form_key": "基本信息.人口学情况",
            },
            {
                "field_key": "婚姻状况",
                "field_path": "基本信息.人口学情况.人口统计学.婚姻状况",
                "field_title": "婚姻状况",
                "value_type": "text",
                "record_form_key": "基本信息.人口学情况",
            },
        ],
        "raw_output": {
            "records": [
                {
                    "form_path": "基本信息.人口学情况",
                    "record": {
                        "身份信息": {"患者姓名": "胡世涛"},
                        "人口统计学": {"婚姻状况": "已婚"},
                    },
                    "confidence": 1.0,
                    "evidences": [
                        {"source_type": "block", "source_id": "b4", "quote_text": "姓名：胡世涛", "page_no": 1},
                        {"source_type": "block", "source_id": "b9", "quote_text": "已婚", "page_no": 1},
                    ],
                }
            ]
        },
    }

    result = extractor._node_normalize(state)
    fields_by_path = {field["field_path"]: field for field in result["fields_output"]}

    name_field = fields_by_path["基本信息.人口学情况.身份信息.患者姓名"]
    marriage_field = fields_by_path["基本信息.人口学情况.人口统计学.婚姻状况"]
    assert name_field["value_text"] == "胡世涛"
    assert name_field["quote_text"] == "姓名：胡世涛"
    assert name_field["evidences"] == [{"source_type": "block", "source_id": "b4", "quote_text": "姓名：胡世涛", "page_no": 1}]
    assert marriage_field["value_text"] == "已婚"
    assert marriage_field["quote_text"] == "已婚"
    assert marriage_field["evidences"] == [{"source_type": "block", "source_id": "b9", "quote_text": "已婚", "page_no": 1}]


def test_llm_ehr_extractor_record_evidence_falls_back_to_shared_when_field_value_not_in_quote():
    """派生数值/枚举：record 级 evidence 中没有任何一条字面包含字段值时，
    应保留全部 record 共享 evidence 并打 record_shared=True，避免该字段彻底丢失溯源。"""
    extractor = LlmEhrExtractor()
    state = {
        "document_id": "document-1",
        "field_specs": [
            {
                "field_key": "入院时间",
                "field_path": "出院情况.出院记录.入院时间",
                "field_title": "入院时间",
                "value_type": "date",
                "record_form_key": "出院情况.出院记录",
            },
            {
                "field_key": "在院天数",
                "field_path": "出院情况.出院记录.在院天数",
                "field_title": "在院天数",
                "value_type": "number",
                "record_form_key": "出院情况.出院记录",
            },
        ],
        "raw_output": {
            "records": [
                {
                    "form_path": "出院情况.出院记录",
                    "record": {"入院时间": "2021-11-02", "在院天数": 10},
                    "confidence": 0.9,
                    "evidences": [
                        {"source_type": "line", "source_id": "p1-l1", "quote_text": "入院时间：2021-11-02", "page_no": 1},
                        {"source_type": "line", "source_id": "p1-l5", "quote_text": "出院日期：2021-11-12", "page_no": 1},
                    ],
                }
            ]
        },
    }

    result = extractor._node_normalize(state)
    fields_by_path = {field["field_path"]: field for field in result["fields_output"]}

    # 入院时间 严格匹配命中 → 只拿到 p1-l1，且不带 record_shared 标记
    admit = fields_by_path["出院情况.出院记录.入院时间"]
    assert admit["value_date"] == "2021-11-02"
    assert [ev["source_id"] for ev in admit["evidences"]] == ["p1-l1"]
    assert all(not ev.get("record_shared") for ev in admit["evidences"])

    # 在院天数 没有任何 quote 包含 "10"，回退到全部 record 共享 evidence，且每条打 record_shared=True
    stay = fields_by_path["出院情况.出院记录.在院天数"]
    assert stay["value_number"] == 10
    shared_ids = sorted(ev["source_id"] for ev in stay["evidences"])
    assert shared_ids == ["p1-l1", "p1-l5"]
    assert all(ev.get("record_shared") is True for ev in stay["evidences"])


def test_llm_ehr_extractor_preserves_repeat_index_from_fields_output():
    extractor = LlmEhrExtractor()
    state = {
        "document_id": "document-1",
        "field_specs": [
            {
                "field_key": "诊断名称",
                "field_path": "诊断记录.诊断记录.诊断名称",
                "field_title": "诊断名称",
                "value_type": "text",
                "record_form_key": "诊断记录.诊断记录",
            },
        ],
        "raw_output": {
            "fields": [
                {
                    "field_path": "诊断记录.诊断记录.0.诊断名称",
                    "value_type": "text",
                    "value_text": "肺癌",
                    "repeat_index": 2,
                    "confidence": 0.88,
                    "evidences": [{"source_type": "line", "source_id": "p1-l8", "quote_text": "诊断：肺癌"}],
                }
            ]
        },
    }

    result = extractor._node_normalize(state)

    assert result["fields_output"] == [
        {
            "field_key": "诊断名称",
            "field_path": "诊断记录.诊断记录.诊断名称",
            "field_title": "诊断名称",
            "record_form_key": "诊断记录.诊断记录",
            "value_type": "text",
            "value_text": "肺癌",
            "confidence": 0.88,
            "quote_text": "诊断：肺癌",
            "evidences": [{"source_type": "line", "source_id": "p1-l8", "quote_text": "诊断：肺癌"}],
            "evidence_type": "llm_extract",
            "repeat_index": 2,
            "path_indexes": [0],
        }
    ]


def test_llm_ehr_extractor_accepts_nested_table_field_as_value_json():
    extractor = LlmEhrExtractor()
    state = {
        "document_id": "document-1",
        "field_specs": [
            {
                "field_key": "检验结果",
                "field_path": "实验室检查.血常规.检验结果",
                "field_title": "检验结果",
                "value_type": "json",
                "record_form_key": "实验室检查.血常规",
                "record_form_title": "血常规",
                "display_type": "table",
                "schema_type": "array",
            },
        ],
        "raw_output": {
            "fields": [
                {
                    "field_path": "实验室检查.血常规.检验结果",
                    "value_type": "json",
                    "value_json": [
                        {"指标名称(中文)": "白细胞", "检测值": "12.00", "单位": "10^9/L"},
                        {"指标名称(中文)": "血红蛋白", "检测值": "146", "单位": "g/L"},
                    ],
                    "confidence": 0.9,
                    "evidences": [{"source_type": "line", "source_id": "p1-l1", "quote_text": "白细胞 12.00 血红蛋白 146"}],
                }
            ]
        },
    }

    result = extractor._node_normalize(state)

    assert result["fields_output"] == [
        {
            "field_key": "检验结果",
            "field_path": "实验室检查.血常规.检验结果",
            "field_title": "检验结果",
            "record_form_key": "实验室检查.血常规",
            "record_form_title": "血常规",
            "value_type": "json",
            "value_json": [
                {"指标名称(中文)": "白细胞", "检测值": "12.00", "单位": "10^9/L"},
                {"指标名称(中文)": "血红蛋白", "检测值": "146", "单位": "g/L"},
            ],
            "confidence": 0.9,
            "quote_text": "白细胞 12.00 血红蛋白 146",
            "evidences": [{"source_type": "line", "source_id": "p1-l1", "quote_text": "白细胞 12.00 血红蛋白 146"}],
            "evidence_type": "llm_extract",
        }
    ]


def test_llm_ehr_extractor_collapses_legacy_split_table_fields_to_value_json():
    extractor = LlmEhrExtractor()
    table_spec = {
        "field_key": "检验结果",
        "field_path": "实验室检查.血常规.检验结果",
        "field_title": "检验结果",
        "value_type": "json",
        "record_form_key": "实验室检查.血常规",
        "record_form_title": "血常规",
        "display_type": "table",
        "schema_type": "array",
        "merge_binding": "anchor=采样日期;fallback=报告日期",
    }
    state = {
        "document_id": "document-1",
        "field_specs": [table_spec],
        "raw_output": {
            "fields": [
                {
                    "field_path": "实验室检查.血常规.检验结果.指标名称(中文)",
                    "value_type": "text",
                    "value_text": "白细胞",
                    "repeat_index": 0,
                    "confidence": 0.9,
                    "evidences": [{"source_type": "line", "source_id": "p1-l1", "quote_text": "白细胞 12.00"}],
                },
                {
                    "field_path": "实验室检查.血常规.检验结果.检测值",
                    "value_type": "text",
                    "value_text": "12.00",
                    "repeat_index": 0,
                    "confidence": 0.9,
                    "evidences": [{"source_type": "line", "source_id": "p1-l1", "quote_text": "白细胞 12.00"}],
                },
                {
                    "field_path": "实验室检查.血常规.检验结果.单位",
                    "value_type": "text",
                    "value_text": "10^9/L",
                    "repeat_index": 0,
                    "confidence": 0.9,
                    "evidences": [{"source_type": "line", "source_id": "p1-l1", "quote_text": "白细胞 12.00"}],
                },
                {
                    "field_path": "实验室检查.血常规.检验结果.指标名称(中文)",
                    "value_type": "text",
                    "value_text": "血红蛋白",
                    "repeat_index": 1,
                    "confidence": 0.9,
                    "evidences": [{"source_type": "line", "source_id": "p1-l2", "quote_text": "血红蛋白 146"}],
                },
                {
                    "field_path": "实验室检查.血常规.检验结果.检测值",
                    "value_type": "text",
                    "value_text": "146",
                    "repeat_index": 1,
                    "confidence": 0.9,
                    "evidences": [{"source_type": "line", "source_id": "p1-l2", "quote_text": "血红蛋白 146"}],
                },
                {
                    "field_path": "实验室检查.血常规.检验结果.单位",
                    "value_type": "text",
                    "value_text": "g/L",
                    "repeat_index": 1,
                    "confidence": 0.9,
                    "evidences": [{"source_type": "line", "source_id": "p1-l2", "quote_text": "血红蛋白 146"}],
                },
            ]
        },
    }

    result = extractor._node_normalize(state)

    assert result["fields_output"] == [
        {
            "field_key": "检验结果",
            "field_path": "实验室检查.血常规.检验结果",
            "field_title": "检验结果",
            "record_form_key": "实验室检查.血常规",
            "record_form_title": "血常规",
            "merge_binding": "anchor=采样日期;fallback=报告日期",
            "value_type": "json",
            "value_json": [
                {"指标名称(中文)": "白细胞", "检测值": "12.00", "单位": "10^9/L"},
                {"指标名称(中文)": "血红蛋白", "检测值": "146", "单位": "g/L"},
            ],
            "confidence": 0.9,
            "quote_text": "白细胞 12.00",
            "evidences": [
                {"source_type": "line", "source_id": "p1-l1", "quote_text": "白细胞 12.00"},
                {"source_type": "line", "source_id": "p1-l2", "quote_text": "血红蛋白 146"},
            ],
            "evidence_type": "llm_extract",
        }
    ]


def test_llm_ehr_extractor_collapses_record_nested_table_to_value_json():
    extractor = LlmEhrExtractor()
    state = {
        "document_id": "document-1",
        "field_specs": [
            {
                "field_key": "采样日期",
                "field_path": "实验室检查.血常规.采样日期",
                "field_title": "采样日期",
                "value_type": "date",
                "record_form_key": "实验室检查.血常规",
                "record_form_title": "血常规",
            },
            {
                "field_key": "检验结果",
                "field_path": "实验室检查.血常规.检验结果",
                "field_title": "检验结果",
                "value_type": "json",
                "record_form_key": "实验室检查.血常规",
                "record_form_title": "血常规",
                "display_type": "table",
                "schema_type": "array",
            },
        ],
        "raw_output": {
            "records": [
                {
                    "form_path": "实验室检查.血常规",
                    "record": {
                        "采样日期": "2025-08-13",
                        "检验结果": [
                            {"指标名称(中文)": "白细胞", "检测值": "12.00", "单位": "10^9/L"},
                            {"指标名称(中文)": "血红蛋白", "检测值": "146", "单位": "g/L"},
                        ],
                    },
                    "confidence": 0.9,
                    "evidences": [{"source_type": "line", "source_id": "p1-l1", "quote_text": "2025-08-13 白细胞 12.00 血红蛋白 146"}],
                }
            ]
        },
    }

    result = extractor._node_normalize(state)
    fields_by_path = {field["field_path"]: field for field in result["fields_output"]}

    assert fields_by_path["实验室检查.血常规.采样日期"]["value_date"] == "2025-08-13"
    assert fields_by_path["实验室检查.血常规.检验结果"]["value_json"] == [
        {"指标名称(中文)": "白细胞", "检测值": "12.00", "单位": "10^9/L"},
        {"指标名称(中文)": "血红蛋白", "检测值": "146", "单位": "g/L"},
    ]


def test_llm_ehr_extractor_validates_record_nested_table_json_field():
    extractor = LlmEhrExtractor()
    errors, warnings, status_hint = extractor._validate_raw_output(
        {
            "records": [
                {
                    "form_path": "实验室检查.血常规",
                    "record": {
                        "检验结果": [
                            {"指标名称(中文)": "白细胞", "检测值": "12.00", "单位": "10^9/L"},
                        ],
                    },
                    "confidence": 0.9,
                    "evidences": [{"source_type": "line", "source_id": "p1-l1", "quote_text": "白细胞 12.00"}],
                }
            ]
        },
        [
            {
                "field_key": "检验结果",
                "field_path": "实验室检查.血常规.检验结果",
                "field_title": "检验结果",
                "value_type": "json",
                "record_form_key": "实验室检查.血常规",
                "display_type": "table",
                "schema_type": "array",
            }
        ],
        text="白细胞 12.00",
    )

    assert errors == []
    assert status_hint is None


def test_llm_ehr_extractor_validates_legacy_split_table_fields():
    extractor = LlmEhrExtractor()
    errors, warnings, status_hint = extractor._validate_raw_output(
        {
            "fields": [
                {
                    "field_path": "实验室检查.血常规.检验结果.指标名称(中文)",
                    "value_type": "text",
                    "value_text": "白细胞",
                    "repeat_index": 0,
                    "confidence": 0.9,
                    "evidences": [{"source_type": "line", "source_id": "p1-l1", "quote_text": "白细胞"}],
                },
                {
                    "field_path": "实验室检查.血常规.检验结果.检测值",
                    "value_type": "text",
                    "value_text": "12.00",
                    "repeat_index": 0,
                    "confidence": 0.9,
                    "evidences": [{"source_type": "line", "source_id": "p1-l1", "quote_text": "12.00"}],
                },
            ]
        },
        [
            {
                "field_key": "检验结果",
                "field_path": "实验室检查.血常规.检验结果",
                "field_title": "检验结果",
                "value_type": "json",
                "record_form_key": "实验室检查.血常规",
                "display_type": "table",
                "schema_type": "array",
            }
        ],
        text="白细胞 12.00",
    )

    assert errors == []
    assert status_hint is None
