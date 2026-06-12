from datetime import timedelta


TERMINAL_STATUSES = {"succeeded", "succeeded_empty", "failed", "cancelled"}
ACTIVE_BATCH_STATUSES = {"created", "queued", "running"}
ITEM_STALE_AFTER = timedelta(minutes=15)
ITEM_STALE_MESSAGE = "任务长时间无进度更新，已自动标记失败（可重新提交）"
