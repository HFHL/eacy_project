from types import SimpleNamespace

from app.services.ehr_service import EhrService


def _polygon_bbox(quote: str) -> dict:
    return {
        "polygon": [0, 0, 100, 0, 100, 20, 0, 20],
        "renderable": True,
        "page_no": 1,
        "text": quote,
    }


def test_ehr_service_filters_unrelated_evidence_for_field_source_text():
    service = EhrService()
    evidences = [
        SimpleNamespace(quote_text="姓名：胡世涛", bbox_json=None),
        SimpleNamespace(quote_text="年龄： 38岁", bbox_json=None),
        SimpleNamespace(quote_text="已婚", bbox_json=None),
    ]

    relevant = service._relevant_evidences_for_field(
        evidences,
        field_path="基本信息.人口学情况.身份信息.患者姓名",
        field_key="患者姓名",
        field_title="患者姓名",
        value="胡世涛",
    )

    assert [evidence.quote_text for evidence in relevant] == ["姓名：胡世涛"]


def test_ehr_service_falls_back_to_polygon_evidence_when_no_textual_match():
    service = EhrService()
    evidences = [
        SimpleNamespace(quote_text="入院日期：2021-11-02 出院日期：2021-11-12", bbox_json=_polygon_bbox("入院日期：2021-11-02")),
        SimpleNamespace(quote_text="出院记录章节", bbox_json=None),
    ]

    relevant = service._relevant_evidences_for_field(
        evidences,
        field_path="出院情况.出院记录.在院天数",
        field_key="在院天数",
        field_title="在院天数",
        value="10",
    )

    assert len(relevant) == 1
    assert relevant[0].quote_text.startswith("入院日期")


def test_ehr_service_returns_empty_when_no_textual_or_polygon_evidence():
    service = EhrService()
    evidences = [
        SimpleNamespace(quote_text="完全不相关的句子", bbox_json=None),
    ]

    relevant = service._relevant_evidences_for_field(
        evidences,
        field_path="基本信息.人口学情况.身份信息.患者姓名",
        field_key="患者姓名",
        field_title="患者姓名",
        value="胡世涛",
    )

    assert relevant == []
