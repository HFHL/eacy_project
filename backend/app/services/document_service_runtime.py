from __future__ import annotations

from importlib import import_module


def document_service_session():
    return getattr(import_module("app.services.document_service"), "session")
