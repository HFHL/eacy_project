from typing import Any

import asyncio

import httpx

from core.config import config


class TextInOcrError(RuntimeError):
    pass


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

    def _headers(self, *, filename: str | None = None, mime_type: str | None = None) -> dict[str, str]:
        if not self.app_id or not self.secret_code:
            raise TextInOcrError("Missing TextIn credentials: TEXTIN_APP_ID and TEXTIN_SECRET_CODE are required")
        headers = {
            "x-ti-app-id": self.app_id,
            "x-ti-secret-code": self.secret_code,
            "Content-Type": "application/octet-stream",
        }
        if filename:
            headers["x-ti-filename"] = filename
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
                        self.api_url,
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
        if not self.api_url:
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
