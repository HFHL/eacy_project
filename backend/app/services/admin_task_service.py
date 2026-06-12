from __future__ import annotations

from app.services.admin_task_admin_views import AdminTaskAdminViewsMixin
from app.services.admin_task_detail import AdminTaskDetailMixin
from app.services.admin_task_formatters import AdminTaskFormattersMixin
from app.services.admin_task_list import AdminTaskListMixin
from app.services.admin_task_llm_calls import AdminTaskLlmCallMixin
from app.services.admin_task_types import (
    ACTIVE_STATUSES,
    ADMIN_TASK_STALE_AFTER,
    TERMINAL_FAILURE_STATUSES,
    VALID_USER_ROLES,
    AdminTaskNotFoundError,
    AdminTemplateNotFoundError,
    AdminUserNotFoundError,
)


class AdminTaskService(
    AdminTaskAdminViewsMixin,
    AdminTaskListMixin,
    AdminTaskDetailMixin,
    AdminTaskLlmCallMixin,
    AdminTaskFormattersMixin,
):
    pass
