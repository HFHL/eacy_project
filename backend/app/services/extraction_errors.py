from typing import Any


class ExtractionServiceError(ValueError):
    pass


class ExtractionNotFoundError(ExtractionServiceError):
    pass


class ExtractionConflictError(ExtractionServiceError):
    pass


class ExtractionTargetValidationError(ExtractionConflictError):
    def __init__(
        self,
        message: str,
        *,
        invalid_form_keys: list[str] | None = None,
        invalid_field_paths: list[str] | None = None,
        invalid_field_keys: list[str] | None = None,
        available_form_keys: list[str] | None = None,
        available_field_paths: list[str] | None = None,
        available_field_keys: list[str] | None = None,
        available_fields: list[dict[str, Any]] | None = None,
    ):
        super().__init__(message)
        self.invalid_form_keys = invalid_form_keys or []
        self.invalid_field_paths = invalid_field_paths or []
        self.invalid_field_keys = invalid_field_keys or []
        self.available_form_keys = available_form_keys or []
        self.available_field_paths = available_field_paths or []
        self.available_field_keys = available_field_keys or []
        self.available_fields = available_fields or []

    def to_detail(self) -> dict[str, Any]:
        return {
            "error": "invalid_extraction_target",
            "message": str(self),
            "invalid_form_keys": self.invalid_form_keys,
            "invalid_field_paths": self.invalid_field_paths,
            "invalid_field_keys": self.invalid_field_keys,
            "available_form_keys": self.available_form_keys,
            "available_field_paths": self.available_field_paths,
            "available_field_keys": self.available_field_keys,
            "available_fields": self.available_fields,
        }


class ExtractionCancelledError(ExtractionConflictError):
    pass
