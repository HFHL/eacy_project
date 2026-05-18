"""SMTP 邮件发送（用于发送邮箱验证码）。

为了不引入新依赖，这里使用标准库 ``smtplib``，通过 ``asyncio.to_thread`` 包成
异步调用，避免阻塞 FastAPI 事件循环。SMTP_SSL（默认端口 465）适配腾讯企业邮箱。
"""

from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from core.config import config

logger = logging.getLogger(__name__)


class EmailNotConfiguredError(RuntimeError):
    """SMTP 必要参数未配置。"""


class EmailSendError(RuntimeError):
    """SMTP 发送过程中出错（鉴权、连接、其它）。"""


def _purpose_label(purpose: str) -> str:
    return {
        "register": "账号注册",
        "reset": "找回密码",
    }.get(purpose, "身份验证")


def _build_message(
    *,
    to_email: str,
    code: str,
    purpose: str,
    ttl_minutes: int,
) -> EmailMessage:
    label = _purpose_label(purpose)
    subject = f"【易悉 EACY】{label}验证码：{code}"

    text_body = (
        f"您正在进行【{label}】操作，验证码为：{code}\n"
        f"验证码有效期 {ttl_minutes} 分钟，请勿向他人泄露。\n"
        f"如非本人操作，请忽略本邮件。\n\n"
        f"-- 易悉 EACY"
    )
    html_body = f"""
    <div style="font-family:-apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;
                max-width:520px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:12px;">
      <h2 style="margin:0 0 16px;color:#1f2937;">易悉 EACY · {label}验证码</h2>
      <p style="color:#4b5563;line-height:1.6;">您正在进行 <b>{label}</b> 操作，请使用以下验证码完成验证：</p>
      <div style="text-align:center;margin:24px 0;">
        <span style="display:inline-block;font-size:28px;letter-spacing:8px;font-weight:700;
                     color:#1677ff;background:#f0f6ff;padding:14px 24px;border-radius:8px;">
          {code}
        </span>
      </div>
      <p style="color:#6b7280;font-size:13px;line-height:1.6;">
        验证码 <b>{ttl_minutes} 分钟</b>内有效，请勿向他人泄露。<br>
        如非本人操作，请忽略本邮件。
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
      <div style="color:#9ca3af;font-size:12px;text-align:center;">易悉 EACY · 智能医疗数据平台</div>
    </div>
    """

    msg = EmailMessage()
    msg["Subject"] = subject
    sender_name = config.SMTP_FROM_NAME or "易悉 EACY"
    sender_addr = config.SMTP_FROM or config.SMTP_USER or ""
    msg["From"] = formataddr((sender_name, sender_addr))
    msg["To"] = to_email
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")
    return msg


def _send_sync(msg: EmailMessage) -> None:
    host = config.SMTP_HOST
    port = config.SMTP_PORT
    user = config.SMTP_USER
    password = config.SMTP_PASSWORD
    timeout = config.SMTP_TIMEOUT_SECONDS

    if not (host and user and password):
        raise EmailNotConfiguredError("SMTP_HOST / SMTP_USER / SMTP_PASSWORD 未配置")

    context = ssl.create_default_context()
    try:
        if config.SMTP_USE_SSL:
            with smtplib.SMTP_SSL(host, port, context=context, timeout=timeout) as server:
                server.login(user, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=timeout) as server:
                server.starttls(context=context)
                server.login(user, password)
                server.send_message(msg)
    except smtplib.SMTPAuthenticationError as exc:
        raise EmailSendError(f"SMTP 鉴权失败：{exc.smtp_code} {exc.smtp_error!r}") from exc
    except (smtplib.SMTPException, OSError) as exc:
        raise EmailSendError(f"SMTP 发送失败：{type(exc).__name__}: {exc}") from exc


class EmailService:
    """简单的邮件发送门面。"""

    @staticmethod
    def is_configured() -> bool:
        return bool(config.SMTP_HOST and config.SMTP_USER and config.SMTP_PASSWORD)

    async def send_verification_code(
        self,
        *,
        to_email: str,
        code: str,
        purpose: str,
    ) -> None:
        ttl_minutes = max(1, int(config.VERIFICATION_CODE_TTL_SECONDS // 60))

        if not self.is_configured():
            if config.VERIFICATION_CODE_DEBUG_FALLBACK:
                logger.warning(
                    "SMTP 未配置；调试模式下不真发邮件。purpose=%s to=%s code=%s",
                    purpose, to_email, code,
                )
                return
            raise EmailNotConfiguredError("SMTP 未配置")

        msg = _build_message(
            to_email=to_email,
            code=code,
            purpose=purpose,
            ttl_minutes=ttl_minutes,
        )
        await asyncio.to_thread(_send_sync, msg)
        logger.info("验证码邮件已发送 purpose=%s to=%s", purpose, to_email)
