"""Locust 入口。

跑法（不要直接调，用 run.sh）：

    locust -f scripts/locustfile.py --headless -u <N> -r 1 -t 30m \\
           --host $EACY_BASE_URL --csv results/<run_id>/locust

每个 VU：
  on_start → 准备 fixtures + 生成 vu_id
  @task    → 跑一次完整 9 步流程 → 然后 raise StopUser()
             ⇒ Locust 自动 spawn 新 VU（= 新账户），保持并发数恒定
"""
from __future__ import annotations

import itertools
import os
import sys
import time

# locust 直接 exec 本文件，没有包上下文 → 手动把 scripts/ 加到 sys.path 用绝对 import
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
from locust import HttpUser, between, events, task
from locust.exception import StopUser

import workflow  # noqa: E402


# --------------------------------------------------------------------- env

# 在所有 import locust 之前/之后均可，但要在 User 被实例化之前
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "config", "base.env"))

CFG = {
    "EACY_BASE_URL": os.environ.get("EACY_BASE_URL", "").rstrip("/"),
    "TEMPLATE_ID": os.environ.get("TEMPLATE_ID", ""),
    "TEMPLATE_VERSION_ID": os.environ.get("TEMPLATE_VERSION_ID", ""),
    "FIXTURES_DIR": os.environ.get("FIXTURES_DIR", "./fixtures"),
    "DOCS_PER_VU": int(os.environ.get("DOCS_PER_VU", "5")),
    "STEP_TIMEOUT_OCR": os.environ.get("STEP_TIMEOUT_OCR", "300"),
    "STEP_TIMEOUT_EHR": os.environ.get("STEP_TIMEOUT_EHR", "300"),
    "STEP_TIMEOUT_CRF": os.environ.get("STEP_TIMEOUT_CRF", "480"),
}

# run_id 通过环境变量从 run.sh 传进来；没有就当场生成
RUN_ID = os.environ.get("STRESS_RUN_ID") or time.strftime("%Y%m%d_%H%M%S")

# 全局 vu 序号：每个 spawn 一个就递增（保证 email 唯一）
_VU_COUNTER = itertools.count(1)

# 启动时扫一次 fixtures，缓存全量文件列表
_FIXTURE_FILES: list[str] | None = None


def _ensure_fixtures() -> list[str]:
    global _FIXTURE_FILES
    if _FIXTURE_FILES is None:
        _FIXTURE_FILES = workflow.list_fixture_files(CFG["FIXTURES_DIR"])
        print(
            f"[locust] loaded {len(_FIXTURE_FILES)} files from {CFG['FIXTURES_DIR']} "
            f"(each VU will randomly sample {CFG['DOCS_PER_VU']})"
        )
    return _FIXTURE_FILES


# --------------------------------------------------------------------- 启动校验

@events.test_start.add_listener
def _on_start(environment, **kw):
    if not CFG["EACY_BASE_URL"]:
        raise RuntimeError("EACY_BASE_URL not set; copy config/base.env.example to config/base.env")
    if not CFG["TEMPLATE_ID"] or not CFG["TEMPLATE_VERSION_ID"]:
        raise RuntimeError(
            "TEMPLATE_ID / TEMPLATE_VERSION_ID not set in config/base.env "
            "(run `python -m scripts.discover_templates` to find IDs)"
        )
    _ensure_fixtures()
    print(f"[locust] run_id={RUN_ID} target={CFG['EACY_BASE_URL']}")


# --------------------------------------------------------------------- VU

class StressUser(HttpUser):
    # 跑完一次就退出，让 Locust 拉新 VU = 新账户。这里 wait_time 几乎用不上。
    wait_time = between(0, 0)

    def on_start(self):
        self.vu_id = next(_VU_COUNTER)
        pool = _ensure_fixtures()
        self.files = workflow.pick_fixture(self.vu_id, pool, n=CFG["DOCS_PER_VU"])

    @task
    def full_pipeline(self):
        ctx = {
            "run_id": RUN_ID,
            "vu_id": self.vu_id,
            "files": self.files,
        }
        try:
            workflow.run_pipeline(self.client, ctx, CFG)
        except Exception as e:
            print(f"[VU {self.vu_id}] pipeline FAILED: {e}")
            # 让 locust 记录失败（异常已经被 step() 上报过了）
        # 不管成功失败都退出，让 spawner 创建新 VU = 新账户
        raise StopUser()
