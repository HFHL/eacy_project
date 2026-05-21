from typing import Any
from urllib.parse import parse_qsl, quote, urlencode, urlparse, urlunparse

import asyncio

import httpx

from core.config import config
from app.services.textin_image_bytes import TextInImageDecodeError, decode_binary_image_content


class TextInOcrError(RuntimeError):
    pass


TEXTIN_IMAGE_DOWNLOAD_URL = "https://api.textin.com/ocr_image/download"


def build_textin_api_url(base_url: str | None = None) -> str:
    raw_url = (base_url or config.TEXTIN_API_URL or "").strip()
    if not raw_url:
        return ""

    parse_mode = (config.TEXTIN_PARSE_MODE or "auto").strip() or "auto"
    get_image = (config.TEXTIN_GET_IMAGE or "page").strip() or "page"
    extra_params = {
        "parse_mode": parse_mode,
        "get_image": get_image,
    }

    parsed = urlparse(raw_url)
    existing = dict(parse_qsl(parsed.query, keep_blank_values=True))
    existing.update(extra_params)
    return urlunparse(parsed._replace(query=urlencode(existing)))


class TextInOcrClient:
    def __init__(
        self,
        *,
        app_id: str | None = None,
        secret_code: str | None = None,
        api_url: str | None = None,
        timeout_seconds: float | None = None,
    ):
        self.app_id = app_id if app_id is not None else config.TEXTIN_APP_ID
        self.secret_code = secret_code if secret_code is not None else config.TEXTIN_SECRET_CODE
        self.api_url = api_url if api_url is not None else config.TEXTIN_API_URL
        self.timeout_seconds = timeout_seconds if timeout_seconds is not None else config.TEXTIN_TIMEOUT_SECONDS

    @property
    def request_api_url(self) -> str:
        return build_textin_api_url(self.api_url)

    def _headers(self, *, filename: str | None = None, mime_type: str | None = None) -> dict[str, str]:
        if not self.app_id or not self.secret_code:
            raise TextInOcrError("Missing TextIn credentials: TEXTIN_APP_ID and TEXTIN_SECRET_CODE are required")
        headers = {
            "x-ti-app-id": self.app_id,
            "x-ti-secret-code": self.secret_code,
            "Content-Type": "application/octet-stream",
        }
        if filename:
            try:
                filename.encode("ascii")
                headers["x-ti-filename"] = filename
            except UnicodeEncodeError:
                headers["x-ti-filename"] = quote(filename, safe="")
                headers["x-ti-filename-encoding"] = "url"
        return headers

    async def _post_document_bytes(
        self,
        content: bytes,
        *,
        filename: str | None = None,
        mime_type: str | None = None,
    ) -> httpx.Response:
        retryable_errors = (
            httpx.ConnectError,
            httpx.ConnectTimeout,
            httpx.ReadError,
            httpx.ReadTimeout,
            httpx.RemoteProtocolError,
            httpx.WriteError,
            httpx.WriteTimeout,
        )
        last_error: Exception | None = None
        for attempt in range(1, 4):
            try:
                async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                    return await client.post(
                        self.request_api_url,
                        content=content,
                        headers=self._headers(filename=filename, mime_type=mime_type),
                    )
            except retryable_errors as exc:
                last_error = exc
                if attempt == 3:
                    break
                await asyncio.sleep(attempt * 1.5)
        raise TextInOcrError(f"TextIn HTTP request failed after retries: {last_error}") from last_error

    async def parse_document_bytes(
        self,
        content: bytes,
        *,
        filename: str | None = None,
        mime_type: str | None = None,
    ) -> dict[str, Any]:
        if not self.request_api_url:
            raise TextInOcrError("Missing TextIn API URL: TEXTIN_API_URL is required")
        if not content:
            raise TextInOcrError("Cannot OCR an empty document")

        response = await self._post_document_bytes(
            content,
            filename=filename,
            mime_type=mime_type,
        )

        if response.status_code < 200 or response.status_code >= 300:
            raise TextInOcrError(f"TextIn HTTP request failed: {response.status_code} {response.text[:500]}")

        try:
            payload = response.json()
        except ValueError as exc:
            raise TextInOcrError("TextIn returned a non-JSON response") from exc

        code = payload.get("code")
        if code not in (None, 200, "200"):
            message = payload.get("message") or payload.get("msg") or "unknown TextIn error"
            raise TextInOcrError(f"TextIn OCR failed: code={code}, message={message}")

        return payload

    async def parse_document_url(
        self,
        document_url: str,
        *,
        filename: str | None = None,
        mime_type: str | None = None,
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            download_response = await client.get(document_url)
        if download_response.status_code < 200 or download_response.status_code >= 300:
            raise TextInOcrError(
                f"Document download failed before OCR: {download_response.status_code} "
                f"{download_response.text[:500]}"
            )
        return await self.parse_document_bytes(
            download_response.content,
            filename=filename,
            mime_type=mime_type,
        )

    async def download_image(self, image_id: str) -> bytes:
        if not image_id:
            raise TextInOcrError("Cannot download TextIn image without image_id")
        retryable_errors = (
            httpx.ConnectError,
            httpx.ConnectTimeout,
            httpx.ReadError,
            httpx.ReadTimeout,
            httpx.RemoteProtocolError,
            httpx.WriteError,
            httpx.WriteTimeout,
        )
        last_error: Exception | None = None
        for attempt in range(1, 4):
            try:
                async with httpx.AsyncClient(timeout=self.timeout_seconds, follow_redirects=True) as client:
                    response = await client.get(
                        TEXTIN_IMAGE_DOWNLOAD_URL,
                        params={"image_id": image_id},
                        headers={
                            "x-ti-app-id": self.app_id or "",
                            "x-ti-secret-code": self.secret_code or "",
                        },
                    )
                if response.status_code < 200 or response.status_code >= 300:
                    raise TextInOcrError(
                        f"TextIn image download failed: {response.status_code} {response.text[:500]}"
                    )
                if not response.content:
                    raise TextInOcrError("TextIn image download returned empty content")
                try:
                    decoded, _content_type = decode_binary_image_content(
                        response.content,
                        content_type=(response.headers.get("content-type") or "").split(";")[0].strip() or None,
                    )
                except TextInImageDecodeError as exc:
                    raise TextInOcrError(str(exc)) from exc
                return decoded
            except retryable_errors as exc:
                last_error = exc
                if attempt == 3:
                    break
                await asyncio.sleep(attempt * 1.5)
        raise TextInOcrError(f"TextIn image download failed after retries: {last_error}") from last_error
