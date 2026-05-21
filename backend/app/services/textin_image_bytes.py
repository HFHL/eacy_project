from __future__ import annotations

import base64
import binascii
import json
from typing import Any


class TextInImageDecodeError(ValueError):
    pass


def _detect_image_content_type(content: bytes) -> str:
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    return "application/octet-stream"


def decode_binary_image_content(content: bytes, *, content_type: str | None = None) -> tuple[bytes, str]:
    if not content:
        raise TextInImageDecodeError("Image content is empty")

    stripped = content.lstrip()
    if stripped.startswith(b"{") or stripped.startswith(b"["):
        try:
            payload = json.loads(content)
        except json.JSONDecodeError as exc:
            raise TextInImageDecodeError("Image payload is not valid JSON") from exc
        decoded, mime = _decode_textin_json_payload(payload)
        return decoded, mime or content_type or _detect_image_content_type(decoded)

    mime = content_type or _detect_image_content_type(content)
    return content, mime


def _decode_textin_json_payload(payload: Any) -> tuple[bytes, str]:
    if not isinstance(payload, dict):
        raise TextInImageDecodeError("TextIn image payload must be a JSON object")

    code = payload.get("code")
    if code not in (None, 200, "200"):
        message = payload.get("message") or payload.get("msg") or "unknown TextIn image error"
        raise TextInImageDecodeError(f"TextIn image payload failed: code={code}, message={message}")

    data = payload.get("data")
    image_value: str | None = None
    if isinstance(data, dict):
        for key in ("image", "image_data", "img"):
            candidate = data.get(key)
            if isinstance(candidate, str) and candidate.strip():
                image_value = candidate.strip()
                break
    elif isinstance(data, str) and data.strip():
        image_value = data.strip()

    if not image_value:
        raise TextInImageDecodeError("TextIn image payload missing image data")

    if image_value.startswith("data:"):
        _, _, image_value = image_value.partition(",")

    try:
        decoded = base64.b64decode(image_value, validate=False)
    except (ValueError, binascii.Error) as exc:
        raise TextInImageDecodeError("TextIn image payload is not valid base64") from exc

    if not decoded:
        raise TextInImageDecodeError("TextIn image payload decoded to empty bytes")

    return decoded, _detect_image_content_type(decoded)
