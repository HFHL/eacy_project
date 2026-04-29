from types import SimpleNamespace

from app.services.metadata_normalizer import MetadataNormalizer, get_document_subtype_by_type, get_document_type_enum
from app.services.metadata_prompt_builder import MetadataPromptBuilder


def test_metadata_prompt_builder_flattens_blocks_lines_segments_and_hints():
    builder = MetadataPromptBuilder()
    document = SimpleNamespace(
        id="document-1",
        original_filename="report.pdf",
        mime_type="application/pdf",
        ocr_text="",
        ocr_payload_json={
            "blocks": [
                {"type": "text", "text": "上海市第一人民医院 检验报告"},
                {"type": "text", "text": "姓名：李四 性别：女"},
                {"type": "text", "text": "门诊号：MZ001 报告日期：2026-04-27"},
            ]
        },
    )

    payload = builder.build_input(document)

    assert "姓名：李四" in payload["ocr_text"]
    assert "门诊号：MZ001" in payload["rule_hints"]["candidate_identifier_lines"][0]
    assert "实验室检查" in payload["schema_context"]["document_type_enum"]


def test_metadata_normalizer_uses_current_schema_enums_and_subtypes():
    assert "实验室检查" in get_document_type_enum()
    assert "血常规" in get_document_subtype_by_type()["实验室检查"]

    result = MetadataNormalizer().normalize(
        {
            "result": {
                "唯一标识符": [{"标识符类型": "住院号", "标识符编号": "ZY123"}],
                "患者年龄": "45岁",
                "患者性别": "男性",
                "文档类型": "实验室检查",
                "文档子类型": "不存在的子类型",
                "文档生效日期": "2026/04/27",
            }
        }
    )

    assert result["患者年龄"] == 45
    assert result["患者性别"] == "男"
    assert result["文档类型"] == "实验室检查"
    assert result["文档子类型"] is None
    assert result["文档生效日期"] == "2026-04-27T00:00:00"
