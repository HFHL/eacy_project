import asyncio
import sys
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import (
    DataContext,
    Document,
    FieldCurrentValue,
    FieldValueEvent,
    FieldValueEvidence,
    RecordInstance,
    SchemaTemplate,
    SchemaTemplateVersion,
)
from app.services.schema_field_planner import schema_top_level_forms
from core.db.session import EngineType, engines

PATIENT_ID = "fd0f5c01-34ba-4a2c-9fde-01df69cf6a00"
SESSION_FACTORY = async_sessionmaker(bind=engines[EngineType.WRITER], expire_on_commit=False)

CURRENT_VALUES: dict[str, tuple[str, Any]] = {
    "基本信息.人口学情况.身份信息.身份ID.0.证件类型": ("text", "身份证"),
    "基本信息.人口学情况.身份信息.身份ID.0.证件号码": ("text", "310101197806152318"),
    "基本信息.人口学情况.身份信息.身份ID.1.证件类型": ("text", "医保号"),
    "基本信息.人口学情况.身份信息.身份ID.1.证件号码": ("text", "YB-HST-20260429"),
    "基本信息.人口学情况.身份信息.身份ID.2.证件类型": ("text", "病案号"),
    "基本信息.人口学情况.身份信息.身份ID.2.证件号码": ("text", "BA-2026-0009"),
    "基本信息.人口学情况.身份信息.患者姓名": ("text", "胡世涛"),
    "基本信息.人口学情况.身份信息.曾用名姓名": ("text", "胡涛"),
    "基本信息.人口学情况.身份信息.性别": ("text", "男"),
    "基本信息.人口学情况.身份信息.出生日期": ("date", date(1978, 6, 15)),
    "基本信息.人口学情况.身份信息.年龄": ("number", 47),
    "基本信息.人口学情况.医疗事件标识符.0.标识符类型": ("text", "住院号"),
    "基本信息.人口学情况.医疗事件标识符.0.标识符编号": ("text", "ZY20260429001"),
    "基本信息.人口学情况.医疗事件标识符.1.标识符类型": ("text", "门诊号"),
    "基本信息.人口学情况.医疗事件标识符.1.标识符编号": ("text", "MZ20260418088"),
    "基本信息.人口学情况.医疗事件标识符.2.标识符类型": ("text", "MRN"),
    "基本信息.人口学情况.医疗事件标识符.2.标识符编号": ("text", "MRN-HST-0001"),
    "基本信息.人口学情况.联系方式.0.联系电话": ("text", "13800138001"),
    "基本信息.人口学情况.联系方式.0.出生地": ("text", "上海市黄浦区"),
    "基本信息.人口学情况.联系方式.0.现住址": ("text", "上海市浦东新区张江路88号"),
    "基本信息.人口学情况.联系方式.1.联系电话": ("text", "021-55667788"),
    "基本信息.人口学情况.联系方式.1.出生地": ("text", "上海市黄浦区"),
    "基本信息.人口学情况.联系方式.1.现住址": ("text", "上海市徐汇区示例路66号"),
    "基本信息.人口学情况.联系方式.2.联系电话": ("text", "13900139002"),
    "基本信息.人口学情况.联系方式.2.出生地": ("text", "江苏省苏州市"),
    "基本信息.人口学情况.联系方式.2.现住址": ("text", "上海市静安区演示弄18号"),
    "基本信息.人口学情况.紧急联系人.0.姓名": ("text", "李梅"),
    "基本信息.人口学情况.紧急联系人.0.关系": ("text", "配偶"),
    "基本信息.人口学情况.紧急联系人.0.电话": ("text", "13900139001"),
    "基本信息.人口学情况.紧急联系人.1.姓名": ("text", "胡小涛"),
    "基本信息.人口学情况.紧急联系人.1.关系": ("text", "子女"),
    "基本信息.人口学情况.紧急联系人.1.电话": ("text", "13700137001"),
    "基本信息.人口学情况.紧急联系人.2.姓名": ("text", "胡建国"),
    "基本信息.人口学情况.紧急联系人.2.关系": ("text", "父母"),
    "基本信息.人口学情况.紧急联系人.2.电话": ("text", "13600136001"),
    "基本信息.人口学情况.人口统计学.婚姻状况": ("text", "已婚"),
    "基本信息.人口学情况.人口统计学.教育水平": ("text", "本科"),
    "基本信息.人口学情况.人口统计学.职业": ("text", "专业技术人员"),
    "基本信息.人口学情况.人口统计学.国籍": ("text", "中国"),
    "基本信息.人口学情况.人口统计学.民族": ("text", "汉族"),
    "基本信息.人口学情况.人口统计学.医保类型": ("text", "城镇职工基本医疗保险"),
}

CANDIDATE_VALUES = {
    "基本信息.人口学情况.身份信息.患者姓名": "胡士涛",
    "基本信息.人口学情况.身份信息.年龄": 46,
    "基本信息.人口学情况.联系方式.0.联系电话": "13800138000",
    "基本信息.人口学情况.紧急联系人.0.电话": "13900139009",
    "基本信息.人口学情况.人口统计学.教育水平": "大专",
}


def record_key_for_path(path: str) -> str:
    parts = path.split(".")
    return ".".join(parts[:2]) if len(parts) >= 2 else "ehr"


def value_columns(value_type: str, value: Any) -> dict[str, Any]:
    values = {"value_text": None, "value_number": None, "value_date": None, "value_datetime": None, "value_json": None}
    if value_type == "number":
        values["value_number"] = value
    elif value_type == "date":
        values["value_date"] = value
    elif value_type == "datetime":
        values["value_datetime"] = value
    elif value_type == "json":
        values["value_json"] = value
    else:
        values["value_text"] = str(value)
    return values


async def latest_ehr_schema(db) -> SchemaTemplateVersion:
    result = await db.execute(
        select(SchemaTemplateVersion)
        .join(SchemaTemplate, SchemaTemplate.id == SchemaTemplateVersion.template_id)
        .where(SchemaTemplate.template_type == "ehr")
        .where(SchemaTemplate.status == "active")
        .where(SchemaTemplateVersion.status == "published")
        .order_by(desc(SchemaTemplateVersion.version_no))
        .limit(1)
    )
    version = result.scalars().first()
    if version is None:
        raise RuntimeError("No published EHR schema found")
    return version


async def get_or_create_context(db, schema_version: SchemaTemplateVersion) -> DataContext:
    result = await db.execute(
        select(DataContext)
        .where(DataContext.context_type == "patient_ehr")
        .where(DataContext.patient_id == PATIENT_ID)
        .where(DataContext.schema_version_id == schema_version.id)
        .limit(1)
    )
    context = result.scalars().first()
    if context is not None:
        return context
    context = DataContext(
        context_type="patient_ehr",
        patient_id=PATIENT_ID,
        schema_version_id=schema_version.id,
        status="draft",
        created_by=None,
    )
    db.add(context)
    await db.flush()
    return context


async def ensure_records(db, context: DataContext, schema_json: dict[str, Any]) -> list[RecordInstance]:
    result = await db.execute(select(RecordInstance).where(RecordInstance.context_id == context.id))
    records = list(result.scalars().all())
    records_by_form = {record.form_key: record for record in records}
    for form in schema_top_level_forms(schema_json):
        form_key = form["form_key"]
        if form_key in records_by_form:
            continue
        record = RecordInstance(
            context_id=context.id,
            group_key=form.get("group_key"),
            group_title=form.get("group_title"),
            form_key=form_key,
            form_title=form["form_title"] or form_key,
            repeat_index=0,
            instance_label=form["form_title"] or form_key,
            review_status="unreviewed",
        )
        db.add(record)
        records.append(record)
        records_by_form[form_key] = record
    await db.flush()
    return records


async def insert_event(db, *, context, record, document, field_path, value_type, value, confidence, review_status, evidence_type):
    now = datetime.utcnow()
    field_key = field_path.split(".")[-1]
    event = FieldValueEvent(
        context_id=context.id,
        record_instance_id=record.id,
        field_key=field_key,
        field_path=field_path,
        field_title=field_key,
        event_type="ai_extracted",
        value_type=value_type,
        confidence=confidence,
        source_document_id=document.id,
        review_status=review_status,
        created_at=now,
        **value_columns(value_type, value),
    )
    db.add(event)
    await db.flush()
    db.add(FieldValueEvidence(
        value_event_id=event.id,
        document_id=document.id,
        page_no=1,
        bbox_json={"x": 100, "y": 160, "w": 200, "h": 28},
        quote_text=f"演示抽取证据：{field_key} = {value}",
        evidence_type=evidence_type,
        evidence_score=confidence,
        created_at=now,
    ))
    return event


async def upsert_current(db, *, event: FieldValueEvent) -> None:
    result = await db.execute(
        select(FieldCurrentValue)
        .where(FieldCurrentValue.context_id == event.context_id)
        .where(FieldCurrentValue.record_instance_id == event.record_instance_id)
        .where(FieldCurrentValue.field_path == event.field_path)
        .limit(1)
    )
    current = result.scalars().first()
    values = value_columns(event.value_type, event.value_json if event.value_type == "json" else event.value_number if event.value_type == "number" else event.value_date if event.value_type == "date" else event.value_datetime if event.value_type == "datetime" else event.value_text)
    now = datetime.utcnow()
    if current is None:
        current = FieldCurrentValue(
            context_id=event.context_id,
            record_instance_id=event.record_instance_id,
            field_key=event.field_key,
            field_path=event.field_path,
            selected_event_id=event.id,
            value_type=event.value_type,
            review_status="unreviewed",
            selected_at=now,
            updated_at=now,
            **values,
        )
        db.add(current)
    else:
        current.selected_event_id = event.id
        current.value_type = event.value_type
        current.review_status = "unreviewed"
        current.selected_at = now
        current.updated_at = now
        for key, value in values.items():
            setattr(current, key, value)
    event.review_status = "accepted"


async def main() -> None:
    async with SESSION_FACTORY() as db:
        schema_version = await latest_ehr_schema(db)
        context = await get_or_create_context(db, schema_version)
        records = await ensure_records(db, context, schema_version.schema_json)
        records_by_form = {record.form_key: record for record in records}
        documents = list((await db.execute(
            select(Document).where(Document.patient_id == PATIENT_ID).where(Document.status != "deleted").limit(20)
        )).scalars().all())
        if not documents:
            raise RuntimeError("No archived documents found for patient")

        accepted_count = 0
        for index, (field_path, (value_type, value)) in enumerate(CURRENT_VALUES.items()):
            record = records_by_form.get(record_key_for_path(field_path)) or records[0]
            event = await insert_event(
                db,
                context=context,
                record=record,
                document=documents[index % len(documents)],
                field_path=field_path,
                value_type=value_type,
                value=value,
                confidence=0.91,
                review_status="candidate",
                evidence_type="demo_seed",
            )
            await upsert_current(db, event=event)
            accepted_count += 1

        candidate_count = 0
        for index, (field_path, value) in enumerate(CANDIDATE_VALUES.items()):
            value_type = CURRENT_VALUES[field_path][0]
            record = records_by_form.get(record_key_for_path(field_path)) or records[0]
            await insert_event(
                db,
                context=context,
                record=record,
                document=documents[(index + 3) % len(documents)],
                field_path=field_path,
                value_type=value_type,
                value=value,
                confidence=0.62,
                review_status="candidate",
                evidence_type="demo_candidate",
            )
            candidate_count += 1

        await db.commit()
        print({
            "patient_id": PATIENT_ID,
            "context_id": str(context.id),
            "records": len(records),
            "accepted_events": accepted_count,
            "candidate_events": candidate_count,
            "documents_used": len(documents),
        })


if __name__ == "__main__":
    asyncio.run(main())
