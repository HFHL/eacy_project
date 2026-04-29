import hashlib
import base64
import email.utils
import hmac
import http.client
import time
import uuid
from dataclasses import dataclass
from datetime import datetime
from urllib.parse import quote, urlparse

from fastapi import UploadFile

from core.config import config


@dataclass(slots=True)
class StoredDocumentFile:
    provider: str
    path: str
    url: str | None
    size: int
    sha256: str


class DocumentStorage:
    async def save(self, file: UploadFile, *, original_filename: str, file_ext: str | None) -> StoredDocumentFile:
        raise NotImplementedError


class AliyunOssDocumentStorage(DocumentStorage):
    def __init__(
        self,
        *,
        access_key_id: str,
        access_key_secret: str,
        bucket_name: str,
        endpoint: str,
        base_prefix: str = "documents",
        public_base_url: str | None = None,
    ):
        normalized_endpoint = endpoint
        if not normalized_endpoint.startswith(("http://", "https://")):
            normalized_endpoint = f"https://{normalized_endpoint}"

        self.access_key_id = access_key_id
        self.access_key_secret = access_key_secret
        self.bucket_name = bucket_name
        self.endpoint = normalized_endpoint.rstrip("/")
        self.base_prefix = base_prefix.strip("/")
        self.public_base_url = public_base_url.rstrip("/") if public_base_url else None

    def _object_key(self, file_ext: str | None) -> str:
        parts = [self.base_prefix] if self.base_prefix else []
        parts.extend([datetime.utcnow().strftime("%Y/%m"), f"{uuid.uuid4()}{file_ext or ''}"])
        return "/".join(parts)

    def _object_url(self, key: str) -> str:
        if self.public_base_url:
            return f"{self.public_base_url}/{key}"
        host = self.endpoint.removeprefix("https://").removeprefix("http://")
        return f"https://{self.bucket_name}.{host}/{key}"

    def _sign(
        self,
        method: str,
        key: str,
        *,
        expires: int | None = None,
        date_header: str | None = None,
        content_type: str = "",
        subresources: dict[str, str] | None = None,
    ) -> str:
        date_or_expires = str(expires) if expires is not None else date_header or email.utils.formatdate(usegmt=True)
        canonical_resource = f"/{self.bucket_name}/{quote(key, safe='/')}"
        if subresources:
            canonical_resource += "?" + "&".join(
                f"{name}={value}"
                for name, value in sorted(subresources.items())
            )
        string_to_sign = f"{method}\n\n{content_type}\n{date_or_expires}\n{canonical_resource}"
        return base64.b64encode(
            hmac.new(
                self.access_key_secret.encode("utf-8"),
                string_to_sign.encode("utf-8"),
                hashlib.sha1,
            ).digest()
        ).decode("utf-8")

    def get_signed_url(
        self,
        key: str,
        *,
        expires_in: int = 3600,
        response_content_disposition: str | None = None,
    ) -> str:
        object_url = self._object_url(key)
        response_params = {}
        extra_params = []
        if response_content_disposition:
            response_params["response-content-disposition"] = response_content_disposition
            extra_params.append(
                "response-content-disposition="
                f"{quote(response_content_disposition, safe='')}"
            )
        if self.public_base_url:
            if not extra_params:
                return object_url
            separator = "&" if "?" in object_url else "?"
            return f"{object_url}{separator}{'&'.join(extra_params)}"
        expires = int(time.time()) + max(1, int(expires_in))
        signature = quote(self._sign("GET", key, expires=expires, subresources=response_params), safe="")
        access_key_id = quote(self.access_key_id, safe="")
        separator = "&" if "?" in object_url else "?"
        query_params = [
            f"OSSAccessKeyId={access_key_id}",
            f"Expires={expires}",
            f"Signature={signature}",
            *extra_params,
        ]
        return f"{object_url}{separator}{'&'.join(query_params)}"

    def _put_object(self, key: str, content: bytes) -> None:
        parsed = urlparse(self.endpoint)
        endpoint_host = parsed.netloc or parsed.path
        host = f"{self.bucket_name}.{endpoint_host}"
        path = f"/{quote(key, safe='/')}"
        content_type = "application/octet-stream"
        date_header = email.utils.formatdate(usegmt=True)
        signature = self._sign("PUT", key, date_header=date_header, content_type=content_type)

        connection_cls = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
        connection = connection_cls(host, timeout=60)
        try:
            connection.putrequest("PUT", path)
            connection.putheader("Host", host)
            connection.putheader("Date", date_header)
            connection.putheader("Content-Type", content_type)
            connection.putheader("Content-Length", str(len(content)))
            connection.putheader("Authorization", f"OSS {self.access_key_id}:{signature}")
            connection.endheaders()
            connection.send(content)
            response = connection.getresponse()
            response_body = response.read().decode("utf-8", errors="replace")
            if response.status < 200 or response.status >= 300:
                raise RuntimeError(f"OSS upload failed: {response.status} {response.reason} {response_body}")
        finally:
            connection.close()

    async def save(self, file: UploadFile, *, original_filename: str, file_ext: str | None) -> StoredDocumentFile:
        key = self._object_key(file_ext)
        file_hash = hashlib.sha256()
        content = await file.read()
        file_hash.update(content)

        self._put_object(key, content)

        return StoredDocumentFile(
            provider="oss",
            path=key,
            url=self._object_url(key),
            size=len(content),
            sha256=file_hash.hexdigest(),
        )


def build_document_storage() -> DocumentStorage:
    provider = (config.DOCUMENT_STORAGE_PROVIDER or "oss").lower()
    if provider == "oss":
        required = {
            "OSS_ACCESS_KEY_ID": config.OSS_ACCESS_KEY_ID,
            "OSS_ACCESS_KEY_SECRET": config.OSS_ACCESS_KEY_SECRET,
            "OSS_BUCKET_NAME": config.OSS_BUCKET_NAME,
            "OSS_ENDPOINT": config.OSS_ENDPOINT,
        }
        missing = [key for key, value in required.items() if not value]
        if missing:
            raise RuntimeError(f"Missing OSS configuration: {', '.join(missing)}")
        return AliyunOssDocumentStorage(
            access_key_id=config.OSS_ACCESS_KEY_ID or "",
            access_key_secret=config.OSS_ACCESS_KEY_SECRET or "",
            bucket_name=config.OSS_BUCKET_NAME or "",
            endpoint=config.OSS_ENDPOINT or "",
            base_prefix=config.OSS_BASE_PREFIX,
            public_base_url=config.OSS_PUBLIC_BASE_URL,
        )
    raise RuntimeError(f"Unsupported document storage provider: {provider}. EACY document storage is OSS-only.")
