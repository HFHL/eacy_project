"""邮箱验证码：生成、发送、校验、消费。

使用 Redis 存储：
- ``verify:{purpose}:{email}``           → 验证码本体（TTL=VERIFICATION_CODE_TTL_SECONDS）
- ``verify:{purpose}:{email}:cooldown``  → 冷却锁（TTL=VERIFICATION_CODE_RESEND_COOLDOWN）
- ``verify:{purpose}:{email}:daily``     → 当日发送计数（TTL=86400）

冷却 / 日上限超出时抛 HTTPException，由路由直接返回 429。
"""

from __future__ import annotations

import logging
import secrets
from typing import Literal

from fastapi import HTTPException, status

from app.services.email_service import EmailNotConfiguredError, EmailSendError, EmailService
from core.config import config
from core.helpers.redis import redis_client

logger = logging.getLogger(__name__)

CodePurpose = Literal["register", "reset"]
ALLOWED_PURPOSES: set[str] = {"register", "reset"}


def _normalize(email: str) -> str:
    return email.strip().lower()


def _code_key(purpose: str, email: str) -> str:
    return f"verify:{purpose}:{_normalize(email)}"


def _cooldown_key(purpose: str, email: str) -> str:
    return f"verify:{purpose}:{_normalize(email)}:cooldown"


def _daily_key(purpose: str, email: str) -> str:
    return f"verify:{purpose}:{_normalize(email)}:daily"


def _generate_code(length: int) -> str:
    upper = 10 ** length
    n = secrets.randbelow(upper)
    return str(n).zfill(length)


class VerificationCodeService:
    def __init__(self, email_service: EmailService | None = None):
        self.email_service = email_service or EmailService()

    async def request_code(self, *, email: str, purpose: CodePurpose) -> dict:
        if purpose not in ALLOWED_PURPOSES:
            raise HTTPException(status_code=400, detail=f"不支持的验证码类型：{purpose}")

        normalized = _normalize(email)

        # 频控：冷却（同邮箱 N 秒内只能发 1 次）
        cooldown_key = _cooldown_key(purpose, normalized)
        ttl = await redis_client.ttl(cooldown_key)
        if ttl and ttl > 0:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"请求过于频繁，请 {ttl} 秒后再试",
            )

        # 频控：单日上限
        daily_key = _daily_key(purpose, normalized)
        sent_today = int(await redis_client.get(daily_key) or 0)
        if sent_today >= config.VERIFICATION_CODE_DAILY_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="今日验证码发送次数已达上限，请明日再试",
            )

        # 生成 + 写入
        code = _generate_code(config.VERIFICATION_CODE_LENGTH)
        await redis_client.set(
            _code_key(purpose, normalized),
            code,
            ex=config.VERIFICATION_CODE_TTL_SECONDS,
        )
        await redis_client.set(
            cooldown_key,
            "1",
            ex=config.VERIFICATION_CODE_RESEND_COOLDOWN,
        )
        # 计数 +1（首次设置 24h TTL）
        new_count = await redis_client.incr(daily_key)
        if new_count == 1:
            await redis_client.expire(daily_key, 86400)

        # 发送邮件
        try:
            await self.email_service.send_verification_code(
                to_email=normalized,
                code=code,
                purpose=purpose,
            )
        except EmailNotConfiguredError as exc:
            logger.error("邮件未配置：%s", exc)
            # 回滚冷却与配额，否则会"扣额度不发邮件"
            await redis_client.delete(cooldown_key)
            await redis_client.decr(daily_key)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="邮件服务未配置，无法发送验证码",
            ) from exc
        except EmailSendError as exc:
            logger.exception("邮件发送失败：%s", exc)
            await redis_client.delete(cooldown_key)
            await redis_client.decr(daily_key)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="验证码邮件发送失败，请稍后重试",
            ) from exc

        return {
            "email": normalized,
            "purpose": purpose,
            "ttl_seconds": config.VERIFICATION_CODE_TTL_SECONDS,
            "cooldown_seconds": config.VERIFICATION_CODE_RESEND_COOLDOWN,
        }

    async def verify(self, *, email: str, purpose: CodePurpose, code: str) -> None:
        """校验验证码；失败抛 400。校验通过 **不** 删除（由调用方决定何时 consume）。"""
        if purpose not in ALLOWED_PURPOSES:
            raise HTTPException(status_code=400, detail=f"不支持的验证码类型：{purpose}")
        if not code or not code.strip():
            raise HTTPException(status_code=400, detail="请填写验证码")

        stored = await redis_client.get(_code_key(purpose, email))
        if not stored:
            raise HTTPException(status_code=400, detail="验证码已过期，请重新获取")
        if stored != code.strip():
            raise HTTPException(status_code=400, detail="验证码错误")

    async def consume(self, *, email: str, purpose: CodePurpose) -> None:
        """删除验证码（用完即焚）。"""
        await redis_client.delete(_code_key(purpose, email))

    async def verify_and_consume(self, *, email: str, purpose: CodePurpose, code: str) -> None:
        await self.verify(email=email, purpose=purpose, code=code)
        await self.consume(email=email, purpose=purpose)
