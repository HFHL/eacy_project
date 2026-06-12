from importlib import import_module
from typing import Any


def extraction_service_attr(name: str) -> Any:
    return getattr(import_module("app.services.extraction_service"), name)


def extract_document_text(document: Any) -> str:
    return extraction_service_attr("extract_document_text")(document)


async def release_db_connection() -> None:
    await extraction_service_attr("release_db_connection")()
