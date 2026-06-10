from types import SimpleNamespace

from app.services.extraction_planner import ExtractionPlanner


def _document(*, doc_subtype: str):
    return SimpleNamespace(
        id="doc-1",
        doc_type="影像检查",
        doc_subtype=doc_subtype,
        document_type=None,
        document_sub_type=None,
        doc_title=doc_subtype,
        original_filename=f"{doc_subtype}.pdf",
        metadata_json={},
    )


def _schema():
    return {
        "properties": {
            "影像检查": {
                "properties": {
                    "CT": {
                        "type": "object",
                        "x-sources": {"primary": ["CT检查"]},
                        "properties": {"部位": {"type": "string"}},
                    },
                    "PET-CT_PET-MR": {
                        "type": "object",
                        "x-sources": {"primary": ["PET-CT检查", "PET-MR检查"]},
                        "properties": {"部位": {"type": "string"}},
                    },
                }
            }
        }
    }


def test_ct_document_does_not_match_pet_ct_form():
    plan = ExtractionPlanner().plan(
        document=_document(doc_subtype="CT检查"),
        schema_json=_schema(),
        source_roles={"primary"},
    )

    assert [item.target_form_key for item in plan] == ["影像检查.CT"]


def test_pet_ct_document_matches_pet_ct_form_not_ct_form():
    plan = ExtractionPlanner().plan(
        document=_document(doc_subtype="PET-CT检查"),
        schema_json=_schema(),
        source_roles={"primary"},
    )

    assert [item.target_form_key for item in plan] == ["影像检查.PET-CT_PET-MR"]
