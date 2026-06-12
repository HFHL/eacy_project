from __future__ import annotations

from datetime import timedelta


ADMIN_TASK_STALE_AFTER = timedelta(minutes=15)
ACTIVE_STATUSES = {"pending", "queued", "running", "stale"}
TERMINAL_FAILURE_STATUSES = {"failed", "timeout"}
VALID_USER_ROLES = {"admin", "user"}


class AdminTaskNotFoundError(ValueError):
    pass


class AdminUserNotFoundError(ValueError):
    pass


class AdminTemplateNotFoundError(ValueError):
    pass
