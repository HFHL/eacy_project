from types import SimpleNamespace

from app.services.research_project_service import ResearchProjectService


def test_research_project_service_filters_unrelated_evidence_for_crf_field_source_text():
    service = ResearchProjectService()
    evidences = [
        SimpleNamespace(quote_text="姓名：胡世涛"),
        SimpleNamespace(quote_text="年龄： 38岁"),
        SimpleNamespace(quote_text="已婚"),
    ]

    relevant = service._relevant_evidences_for_field(
        evidences,
        field_path="基本信息.人口学情况.身份信息.患者姓名",
        field_key="患者姓名",
        field_title="患者姓名",
        value="胡世涛",
    )

    assert [evidence.quote_text for evidence in relevant] == ["姓名：胡世涛"]
