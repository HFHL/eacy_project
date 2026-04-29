import argparse
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import desc, select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.models import SchemaTemplate, SchemaTemplateVersion
from core.config import config
from core.db import session_factory


DEFAULT_TEMPLATE_CODE = "ehr_default"
DEFAULT_TEMPLATE_NAME = "默认电子病历夹"
DEFAULT_TEMPLATE_TYPE = "ehr"


def load_schema(schema_path: Path) -> dict[str, Any]:
    with schema_path.open("r", encoding="utf-8") as file:
        payload = json.load(file)
    if not isinstance(payload, dict):
        raise ValueError("Schema file root must be a JSON object")
    if payload.get("type") != "object" or not isinstance(payload.get("properties"), dict):
        raise ValueError("Schema must be a JSON Schema object with properties")
    return payload


def compact_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


async def import_schema(
    *,
    schema_path: Path,
    template_code: str,
    template_name: str,
    version_name: str | None,
    publish: bool,
    force_new_version: bool,
    execute: bool,
) -> None:
    schema_json = load_schema(schema_path)
    schema_digest = compact_json(schema_json)

    async with session_factory() as db:
        template_result = await db.execute(
            select(SchemaTemplate).where(SchemaTemplate.template_code == template_code).limit(1)
        )
        template = template_result.scalars().first()

        if template is None:
            template = SchemaTemplate(
                template_code=template_code,
                template_name=template_name,
                template_type=DEFAULT_TEMPLATE_TYPE,
                description=f"Imported from {schema_path.name}",
                status="active",
                created_by=None,
            )
            db.add(template)
            await db.flush()
            print(f"CREATE template id={template.id} code={template.template_code}")
        else:
            print(f"FOUND template id={template.id} code={template.template_code} status={template.status}")
            if template.template_type != DEFAULT_TEMPLATE_TYPE:
                raise ValueError(
                    f"Template {template_code!r} exists but template_type={template.template_type!r}, expected 'ehr'"
                )
            if template.status != "active":
                template.status = "active"
                print("UPDATE template status=active")

        versions_result = await db.execute(
            select(SchemaTemplateVersion)
            .where(SchemaTemplateVersion.template_id == template.id)
            .order_by(desc(SchemaTemplateVersion.version_no))
        )
        versions = list(versions_result.scalars().all())

        matching_version = next(
            (version for version in versions if compact_json(version.schema_json) == schema_digest),
            None,
        )

        if matching_version is not None and not force_new_version:
            version = matching_version
            print(
                "FOUND matching version "
                f"id={version.id} version_no={version.version_no} status={version.status}"
            )
        else:
            next_version_no = (versions[0].version_no + 1) if versions else 1
            version = SchemaTemplateVersion(
                template_id=template.id,
                version_no=next_version_no,
                version_name=version_name or schema_json.get("$id") or f"v{next_version_no}",
                schema_json=schema_json,
                status="draft",
                published_at=None,
                created_by=None,
            )
            db.add(version)
            await db.flush()
            print(f"CREATE version id={version.id} version_no={version.version_no}")

        if publish:
            if version.status != "published":
                version.status = "published"
                version.published_at = datetime.utcnow()
                print(f"PUBLISH version id={version.id} version_no={version.version_no}")
            else:
                print(f"KEEP published version id={version.id} version_no={version.version_no}")

        if execute:
            await db.commit()
            print("COMMIT complete")
        else:
            await db.rollback()
            print("DRY_RUN rollback complete; pass --execute to write changes")

    print(f"DB writer={config.WRITER_DB_URL.split('@')[-1] if '@' in config.WRITER_DB_URL else config.WRITER_DB_URL}")


def main() -> None:
    project_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="Import ehr_schema.json into schema template tables.")
    parser.add_argument("--schema", default=str(project_root / "ehr_schema.json"), help="Path to EHR JSON schema.")
    parser.add_argument("--template-code", default=DEFAULT_TEMPLATE_CODE)
    parser.add_argument("--template-name", default=DEFAULT_TEMPLATE_NAME)
    parser.add_argument("--version-name", default=None)
    parser.add_argument("--no-publish", action="store_true", help="Create/reuse version without publishing it.")
    parser.add_argument("--force-new-version", action="store_true", help="Create a new version even if schema is unchanged.")
    parser.add_argument("--execute", action="store_true", help="Actually write changes. Without this, the script rolls back.")
    args = parser.parse_args()

    asyncio.run(
        import_schema(
            schema_path=Path(args.schema).resolve(),
            template_code=args.template_code,
            template_name=args.template_name,
            version_name=args.version_name,
            publish=not args.no_publish,
            force_new_version=args.force_new_version,
            execute=args.execute,
        )
    )


if __name__ == "__main__":
    main()
