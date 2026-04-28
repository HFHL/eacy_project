from typing import Any


def not_implemented_payload(*, task: str, **identifiers: Any) -> dict[str, Any]:
    return {
        "status": "not_implemented",
        "task": task,
        **identifiers,
    }
