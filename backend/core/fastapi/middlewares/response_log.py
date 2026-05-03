from pydantic import BaseModel, Field, ConfigDict
from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class ResponseInfo(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    headers: Headers | None = Field(default=None, title="Response header")
    body: str = Field(default="", title="응답 바디")
    status_code: int | None = Field(default=None, title="Status code")


class ResponseLogMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        response_info = ResponseInfo()
        should_capture_body = False

        async def _logging_send(message: Message) -> None:
            nonlocal should_capture_body
            if message.get("type") == "http.response.start":
                response_info.headers = Headers(raw=message.get("headers"))
                response_info.status_code = message.get("status")
                content_type = response_info.headers.get("content-type", "") if response_info.headers else ""
                should_capture_body = (
                    content_type.startswith("text/")
                    or "json" in content_type
                    or "xml" in content_type
                )
            elif message.get("type") == "http.response.body":
                if should_capture_body and (body := message.get("body")):
                    try:
                        response_info.body += body.decode("utf8")
                    except UnicodeDecodeError:
                        should_capture_body = False

            await send(message)

        await self.app(scope, receive, _logging_send)
