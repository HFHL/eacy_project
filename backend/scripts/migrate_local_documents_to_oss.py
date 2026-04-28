import argparse
import asyncio
from pathlib import Path

from sqlalchemy import text

from app.storage.document_storage import AliyunOssDocumentStorage
from core.config import config
from core.db import session_factory


def build_storage() -> AliyunOssDocumentStorage:
    return AliyunOssDocumentStorage(
        access_key_id=config.OSS_ACCESS_KEY_ID or "",
        access_key_secret=config.OSS_ACCESS_KEY_SECRET or "",
        bucket_name=config.OSS_BUCKET_NAME or "",
        endpoint=config.OSS_ENDPOINT or "",
        base_prefix=config.OSS_BASE_PREFIX,
        public_base_url=config.OSS_PUBLIC_BASE_URL,
    )


def resolve_local_path(backend_root: Path, stored_path: str | None) -> Path | None:
    if not stored_path:
        return None
    candidate = Path(stored_path)
    if candidate.is_absolute():
        return candidate
    return backend_root / candidate


async def migrate(dry_run: bool, only_document_id: str | None) -> None:
    backend_root = Path(__file__).resolve().parents[1]
    storage = build_storage()

    where_clause = "where coalesce(storage_provider, '') <> 'oss' and status <> 'deleted'"
    params: dict[str, str] = {}
    if only_document_id:
        where_clause += " and id = :document_id"
        params["document_id"] = only_document_id

    async with session_factory() as db:
        result = await db.execute(
            text(
                f"""
                select id, original_filename, file_ext, storage_path, file_path
                from documents
                {where_clause}
                order by created_at asc
                """
            ),
            params,
        )
        rows = result.mappings().all()

        migrated = 0
        skipped = 0
        for row in rows:
            source_path = resolve_local_path(backend_root, row["storage_path"]) or resolve_local_path(
                backend_root, row["file_path"]
            )
            if source_path is None or not source_path.exists():
                skipped += 1
                print(f"SKIP missing local file document_id={row['id']}")
                continue

            suffix = row["file_ext"] or Path(row["original_filename"] or "").suffix
            object_key = f"documents/migrated/{row['id']}{suffix}"
            file_url = storage._object_url(object_key)

            if dry_run:
                print(f"DRY_RUN document_id={row['id']} source={source_path} object_key={object_key}")
                continue

            storage._put_object(object_key, source_path.read_bytes())
            await db.execute(
                text(
                    """
                    update documents
                    set storage_provider = 'oss',
                        storage_path = :storage_path,
                        file_path = :storage_path,
                        file_url = :file_url
                    where id = :document_id
                    """
                ),
                {"document_id": row["id"], "storage_path": object_key, "file_url": file_url},
            )
            migrated += 1
            print(f"MIGRATED document_id={row['id']} object_key={object_key}")

        if not dry_run:
            await db.commit()

    print(f"SUMMARY total={len(rows)} migrated={migrated} skipped={skipped} dry_run={dry_run}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate legacy local document records to OSS.")
    parser.add_argument("--execute", action="store_true", help="Upload files to OSS and update database records.")
    parser.add_argument("--document-id", help="Only migrate one document id.")
    args = parser.parse_args()

    asyncio.run(migrate(dry_run=not args.execute, only_document_id=args.document_id))


if __name__ == "__main__":
    main()
