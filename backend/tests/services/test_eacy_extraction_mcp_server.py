import json

from app.services.agent.eacy_extraction_mcp_server import ExtractionWorkspaceTools, JsonRpcMcpServer


def _workspace(tmp_path):
    workspace = tmp_path / "workspace"
    (workspace / "input").mkdir(parents=True)
    (workspace / "output").mkdir()
    (workspace / "input" / "field_specs.json").write_text(
        json.dumps(
            [
                {
                    "field_path": "诊断记录.诊断.诊断名称",
                    "field_key": "诊断名称",
                    "field_title": "诊断名称",
                    "value_type": "text",
                    "options": None,
                    "display_type": "text",
                },
                {
                    "field_path": "症状记录.主诉.症状",
                    "field_key": "症状",
                    "field_title": "症状",
                    "value_type": "json",
                    "options": ["腹痛", "黄疸"],
                    "display_type": "checkbox",
                },
                {
                    "field_path": "治疗情况.药物治疗.药物名称",
                    "field_key": "药物名称",
                    "field_title": "药物名称",
                    "value_type": "text",
                    "options": None,
                    "display_type": "text",
                },
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (workspace / "input" / "reading_units.json").write_text(
        json.dumps(
            [
                {
                    "source_type": "line",
                    "source_id": "p1-l1",
                    "page_no": 1,
                    "text": "入院诊断：胰腺癌，伴腹痛、黄疸",
                }
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (workspace / "input" / "ocr_text.md").write_text("入院诊断：胰腺癌，伴腹痛、黄疸", encoding="utf-8")
    return workspace


def test_workspace_tools_search_field_validate_and_save(tmp_path):
    workspace = _workspace(tmp_path)
    tools = ExtractionWorkspaceTools(workspace)

    field_spec = tools.get_field_spec(field_path="诊断记录/诊断/诊断名称")
    assert field_spec["found"] is True
    assert field_spec["field_spec"]["display_type"] == "text"

    matches = tools.search_ocr(query="胰腺癌")
    assert matches["matches"][0]["source_id"] == "p1-l1"

    result = {
        "fields": [
            {
                "field_path": "诊断记录.诊断.诊断名称",
                "value_type": "text",
                "value_text": "胰腺癌",
                "confidence": 0.95,
                "evidences": [
                    {
                        "source_type": "line",
                        "source_id": "p1-l1",
                        "quote_text": "入院诊断：胰腺癌，伴腹痛、黄疸",
                        "page_no": 1,
                    }
                ],
            },
            {
                "field_path": "症状记录.主诉.症状",
                "value_type": "json",
                "value_json": ["腹痛", "黄疸"],
                "confidence": 0.9,
                "evidences": [
                    {
                        "source_type": "line",
                        "source_id": "p1-l1",
                        "quote_text": "入院诊断：胰腺癌，伴腹痛、黄疸",
                        "page_no": 1,
                    }
                ],
            },
        ]
    }

    validation = tools.validate_candidate_fields(result=result)
    assert validation == {"valid": True, "status": "valid", "errors": [], "warnings": []}

    saved = tools.save_result_json(result=result)
    assert saved["saved"] is True
    assert json.loads((workspace / "output" / "result.json").read_text(encoding="utf-8")) == result


def test_workspace_tools_reject_invalid_result_without_writing(tmp_path):
    workspace = _workspace(tmp_path)
    tools = ExtractionWorkspaceTools(workspace)

    saved = tools.save_result_json(
        result={
            "fields": [
                {
                    "field_path": "不存在.字段",
                    "value_type": "text",
                    "value_text": "胰腺癌",
                    "confidence": 0.9,
                }
            ]
        }
    )

    assert saved["saved"] is False
    assert saved["valid"] is False
    assert "not in schema" in saved["errors"][0]
    assert not (workspace / "output" / "result.json").exists()


def test_workspace_tools_reject_indexed_field_path_when_not_allowed(tmp_path):
    workspace = _workspace(tmp_path)
    tools = ExtractionWorkspaceTools(workspace)

    validation = tools.validate_candidate_fields(
        result={
            "fields": [
                {
                    "field_path": "治疗情况.药物治疗.0.药物名称",
                    "value_type": "text",
                    "value_text": "头孢呋辛",
                    "confidence": 0.9,
                    "evidences": [
                        {
                            "source_type": "line",
                            "source_id": "p1-l1",
                            "quote_text": "入院诊断：胰腺癌，伴腹痛、黄疸",
                            "page_no": 1,
                        }
                    ],
                }
            ]
        }
    )

    assert validation["valid"] is False
    assert "use 治疗情况.药物治疗.药物名称" in validation["errors"][0]
    assert "repeat_index=0" in validation["errors"][0]


def test_jsonrpc_server_lists_and_calls_tools(tmp_path):
    workspace = _workspace(tmp_path)
    server = JsonRpcMcpServer(ExtractionWorkspaceTools(workspace))

    listed = server._handle({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    names = [tool["name"] for tool in listed["result"]["tools"]]
    assert "search_ocr" in names

    called = server._handle(
        {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": "search_ocr", "arguments": {"query": "黄疸"}},
        }
    )
    payload = json.loads(called["result"]["content"][0]["text"])
    assert payload["matches"][0]["source_id"] == "p1-l1"
