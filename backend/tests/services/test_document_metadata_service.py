from datetime import datetime
from types import SimpleNamespace

import pytest

from app.services.document_metadata_service import DocumentMetadataService


class MutableFakeDocumentRepository:
    def __init__(self, document):
        self.document = document

    async def get_visible_by_id(self, document_id):
        if self.document.id != document_id or self.document.status == "deleted":
            return None
        return self.document

    async def save(self, document):
        self.document = document
        return document


class FakeSession:
    async def commit(self):
        return None

    async def rollback(self):
        return None


class FakeMetadataAgent:
    def extract(self, payload):
        return {
            "result": {
                "唯一标识符": [{"标识符类型": "住院号", "标识符编号": "ZY12345"}],
                "机构名称": "上海市第一人民医院",
                "科室信息": "呼吸内科",
                "患者姓名": "张三",
                "患者性别": "男",
                "患者年龄": "45",
                "出生日期": None,
                "联系电话": None,
                "诊断": "肺部感染",
                "文档类型": "实验室检查",
                "文档子类型": "血常规",
                "文档标题": "上海市第一人民医院 血常规报告",
                "文档生效日期": "2026-04-27",
            }
        }


@pytest.mark.asyncio
async def test_process_document_metadata_extracts_and_persists_result(monkeypatch):
    document = SimpleNamespace(
        id="document-1",
        original_filename="血常规报告.pdf",
        mime_type="application/pdf",
        status="ocr_completed",
        ocr_status="completed",
        ocr_text="""
        上海市第一人民医院 血常规报告
        科室：呼吸内科
        姓名：张三 性别：男 年龄：45岁
        住院号：ZY12345
        临床诊断：肺部感染
        报告日期：2026-04-27
        """,
        ocr_payload_json={},
        meta_status="queued",
        metadata_json=None,
        doc_type=None,
        doc_subtype=None,
        doc_title=None,
        effective_at=None,
        updated_at=None,
    )
    monkeypatch.setattr("app.services.document_metadata_service.session", FakeSession())

    service = DocumentMetadataService(document_repository=MutableFakeDocumentRepository(document), agent=FakeMetadataAgent())

    updated = await service.process_document_metadata("document-1")

    assert updated.meta_status == "completed"
    assert updated.metadata_json["schema_version"] == "doc_metadata.v1"
    assert updated.metadata_json["result"]["患者姓名"] == "张三"
    assert updated.metadata_json["result"]["唯一标识符"] == [{"标识符类型": "住院号", "标识符编号": "ZY12345"}]
    assert updated.doc_type == "实验室检查"
    assert updated.doc_subtype == "血常规"
    assert updated.doc_title == "上海市第一人民医院 血常规报告"
    assert updated.effective_at == datetime(2026, 4, 27)
