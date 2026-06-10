from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import Any

import httpx

from app.integrations.textin_ocr import TextInOcrClient


SUPPORTED_EXTS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


async def persist_page_assets(
    payload: dict[str, Any],
    run_dir: Path,
    *,
    page_offset: int = 0,
    entry: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    pages_dir = run_dir / "pages"
    pages_dir.mkdir(parents=True, exist_ok=True)
    client = TextInOcrClient()
    assets: list[dict[str, Any]] = []
    for page in payload.get("pages") or []:
        if not isinstance(page, dict):
            continue
        source_page_no = int(page.get("page_no") or len(assets) + 1)
        page_no = page_offset + source_page_no
        source_path = Path(str(page.get("source_path") or (entry or {}).get("source_path") or "")).expanduser()
        image_bytes = await download_page_image(client, page)
        ext = guess_image_ext(image_bytes, default=".jpg")
        if image_bytes is None and is_source_image(source_path) and source_page_no == 1:
            image_bytes = source_path.read_bytes()
            ext = source_path.suffix.lower() if source_path.suffix.lower() in SUPPORTED_EXTS else ".jpg"
        image_url = None
        if image_bytes:
            target = pages_dir / f"page-{page_no}{ext}"
            target.write_bytes(image_bytes)
            image_url = f"/api/runs/{run_dir.name}/page/{page_no}"
        assets.append(
            {
                "page_no": page_no,
                "image_url": image_url,
                "width": page.get("width"),
                "height": page.get("height"),
                "angle": page.get("angle") or 0,
                "source_name": page.get("source_name") or (entry or {}).get("source_name"),
                "relative_path": page.get("relative_path") or (entry or {}).get("relative_path"),
                "source_page_no": source_page_no,
            }
        )
    return assets


def is_source_image(path: Path) -> bool:
    if not path.exists():
        return False
    return (mimetypes.guess_type(path.name)[0] or "").startswith("image/")


def guess_image_ext(content: bytes | None, *, default: str) -> str:
    if not content:
        return default
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if content.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return ".webp"
    if content.startswith((b"II*\x00", b"MM\x00*")):
        return ".tif"
    return default


async def download_page_image(client: TextInOcrClient, page: dict[str, Any]) -> bytes | None:
    image_id = page.get("image_id") or page.get("origin_image_id")
    if image_id:
        try:
            return await client.download_image(str(image_id))
        except Exception:
            pass
    url = page.get("page_image_url")
    if url:
        try:
            async with httpx.AsyncClient(timeout=60, follow_redirects=True) as http_client:
                response = await http_client.get(str(url))
            if 200 <= response.status_code < 300 and response.content:
                return response.content
        except Exception:
            return None
    return None
