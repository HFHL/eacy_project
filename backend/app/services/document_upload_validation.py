from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from core.config import config

LEGACY_DOC_MIME = "application/msword"
SUPPORTED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".docx", ".xlsx", ".csv"}
SUPPORTED_MIME_TYPES = {
    "application/pdf",
    "image/jpg",
    "image/jpeg",
    "image/png",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "application/csv",
}


def validate_upload_file(*, filename: str, content_type: str | None, size: int) -> None:
    original_filename = Path(filename or "upload.bin").name
    file_ext = Path(original_filename).suffix.lower()
    mime = (content_type or "").lower()

    if file_ext == ".doc" or mime == LEGACY_DOC_MIME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不支持旧版 .doc，请转换为 .docx 或 PDF 后上传",
        )

    if file_ext and file_ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的文件格式: {file_ext}",
        )

    if mime and mime not in SUPPORTED_MIME_TYPES and file_ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不支持的文件格式",
        )

    max_size = int(config.DOCUMENT_MAX_FILE_SIZE_BYTES)
    if size > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"文件大小超过限制（最大 {max_size // (1024 * 1024)}MB）",
        )


async def read_upload_bytes(file: UploadFile) -> bytes:
    content = await file.read()
    await file.seek(0)
    return content
