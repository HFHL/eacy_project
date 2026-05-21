import base64
import json

import pytest

from app.services.textin_image_bytes import TextInImageDecodeError, decode_binary_image_content


def test_decode_binary_image_content_accepts_raw_jpeg():
    raw = base64.b64decode(
        "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a"
        "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy"
        "MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEB"
        "AxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQ"
        "AxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAA"
        "AAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAA"
        "AAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z"
    )
    decoded, content_type = decode_binary_image_content(raw, content_type="image/jpeg")
    assert decoded.startswith(b"\xff\xd8\xff")
    assert content_type == "image/jpeg"


def test_decode_binary_image_content_parses_textin_json_payload():
    raw = b"\xff\xd8\xff\xe0" + b"fake-jpeg-body"
    payload = {"code": 200, "data": {"image": base64.b64encode(raw).decode("ascii")}, "msg": "success"}
    decoded, content_type = decode_binary_image_content(json.dumps(payload).encode("utf-8"))
    assert decoded == raw
    assert content_type == "image/jpeg"


def test_decode_binary_image_content_rejects_invalid_json_payload():
    with pytest.raises(TextInImageDecodeError):
        decode_binary_image_content(b'{"code":500,"msg":"failed"}')
