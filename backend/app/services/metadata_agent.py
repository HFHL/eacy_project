import json
import re
from typing import Any

import httpx

from app.services.metadata_normalizer import empty_metadata_result
from app.services.metadata_prompt_builder import MetadataPromptBuilder
from core.config import config


class MetadataExtractionError(RuntimeError):
    pass


class RuleBasedMetadataExtractionAgent:
    def extract(self, payload: dict[str, Any]) -> dict[str, Any]:
        text = str(payload.get("ocr_text") or "")
        filename = str(payload.get("original_filename") or "")
        result: dict[str, Any] = {
            "唯一标识符": self._extract_identifiers(text),
            "机构名称": self._first_match(text, [r"([^\n]{2,40}(?:医院|中心|诊所))"]),
            "科室信息": self._first_match(text, [r"科室[:：\s]*([^\n\s，,；;]{2,20})", r"([^\n\s，,；;]{2,20}科)"], trim=True),
            "患者姓名": self._first_match(text, [r"姓名[:：\s]*([\u4e00-\u9fa5·]{2,12})", r"患者[:：\s]*([\u4e00-\u9fa5·]{2,12})"], trim=True),
            "患者性别": self._first_match(text, [r"性别[:：\s]*(男|女|不详|未知)", r"\b(男|女)\b"], trim=True),
            "患者年龄": self._first_match(text, [r"年龄[:：\s]*(\d{1,3})\s*岁?"], trim=True),
            "出生日期": self._first_match(text, [r"出生日期[:：\s]*(\d{4}[年\-/\.]\d{1,2}[月\-/\.]\d{1,2})"], trim=True),
            "联系电话": self._first_match(text, [r"(?:联系电话|电话|手机)[:：\s]*([+\d][\d\-\s]{6,18}\d)"], trim=True),
            "诊断": self._first_match(text, [r"(?:出院诊断|临床诊断|诊断)[:：\s]*([^\n]{2,80})"], trim=True),
            "文档类型": self._guess_document_type(text, filename),
            "文档子类型": self._guess_document_subtype(text, filename),
            "文档标题": self._guess_title(text, filename),
            "文档生效日期": self._first_match(
                text,
                [
                    r"(?:报告日期|检查日期|出院日期|入院日期|记录日期|日期)[:：\s]*(\d{4}[年\-/\.]\d{1,2}[月\-/\.]\d{1,2})",
                    r"(\d{4}[年\-/\.]\d{1,2}[月\-/\.]\d{1,2})",
                ],
                trim=True,
            ),
        }
        return {"result": result}

    def _first_match(self, text: str, patterns: list[str], *, trim: bool = False) -> str | None:
        for pattern in patterns:
            match = re.search(pattern, text, flags=re.IGNORECASE)
            if not match:
                continue
            value = match.group(1).strip()
            if trim:
                value = re.split(r"[\s，,；;|]", value)[0].strip()
            return value or None
        return None

    def _extract_identifiers(self, text: str) -> list[dict[str, str]]:
        patterns = [
            ("住院号", r"住院号[:：\s]*([A-Za-z0-9\-]+)"),
            ("门诊号", r"门诊号[:：\s]*([A-Za-z0-9\-]+)"),
            ("急诊号", r"急诊号[:：\s]*([A-Za-z0-9\-]+)"),
            ("病案号", r"病案号[:：\s]*([A-Za-z0-9\-]+)"),
            ("健康卡号", r"健康卡号[:：\s]*([A-Za-z0-9\-]+)"),
            ("身份证号", r"身份证(?:号)?[:：\s]*([0-9Xx]{15,18})"),
            ("MRN", r"MRN[:：\s]*([A-Za-z0-9\-]+)"),
            ("ID号", r"ID(?:号)?[:：\s]*([A-Za-z0-9\-]+)"),
        ]
        identifiers: list[dict[str, str]] = []
        for identifier_type, pattern in patterns:
            for match in re.finditer(pattern, text, flags=re.IGNORECASE):
                identifiers.append({"标识符类型": identifier_type, "标识符编号": match.group(1).strip()})
        return identifiers

    def _guess_title(self, text: str, filename: str) -> str | None:
        for line in text.splitlines():
            line = line.strip(" #\t")
            if 2 <= len(line) <= 40 and any(keyword in line for keyword in ("报告", "记录", "检查", "小结", "病历")):
                return line
        return filename or None

    def _guess_document_type(self, text: str, filename: str) -> str | None:
        haystack = f"{filename}\n{text}"
        if any(keyword in haystack for keyword in ("血常规", "尿常规", "生化", "检验", "化验")):
            return "实验室检查"
        if any(keyword in haystack for keyword in ("CT", "MRI", "超声", "X光", "影像")):
            return "影像检查"
        if "病理" in haystack:
            return "病理报告"
        if any(keyword in haystack for keyword in ("入院记录", "出院小结", "病程记录", "门诊病历", "病案首页")):
            return "病历记录"
        if any(keyword in haystack for keyword in ("胃镜", "肠镜", "内镜")):
            return "内镜检查"
        return None

    def _guess_document_subtype(self, text: str, filename: str) -> str | None:
        haystack = f"{filename}\n{text}"
        aliases = {
            "血常规": "血常规",
            "尿常规": "尿常规",
            "生化": "生化检查",
            "CT": "CT检查",
            "MRI": "MRI检查",
            "超声": "超声检查",
            "X光": "X光检查",
            "门诊病历": "门诊病历",
            "入院记录": "入院记录",
            "病程记录": "病程记录",
            "出院小结": "出院小结_记录",
            "病案首页": "病案首页",
            "胃镜": "胃肠镜检查",
            "肠镜": "胃肠镜检查",
        }
        for keyword, subtype in aliases.items():
            if keyword in haystack:
                return subtype
        return None


class MetadataExtractionAgent:
    def __init__(
        self,
        prompt_builder: MetadataPromptBuilder | None = None,
        fallback_agent: RuleBasedMetadataExtractionAgent | None = None,
    ):
        self.prompt_builder = prompt_builder or MetadataPromptBuilder()
        self.fallback_agent = fallback_agent or RuleBasedMetadataExtractionAgent()

    def extract(self, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            return self._extract_with_llm(payload)
        except Exception as exc:
            if config.METADATA_LLM_ENABLE_RULE_FALLBACK:
                fallback = self.fallback_agent.extract(payload)
                fallback["_llm_error"] = {"type": exc.__class__.__name__, "message": str(exc)}
                return fallback
            raise

    def _extract_with_llm(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not config.OPENAI_API_KEY:
            raise MetadataExtractionError("Missing OPENAI_API_KEY for metadata extraction")
        base_url = (config.OPENAI_API_BASE_URL or "https://api.openai.com/v1").rstrip("/")
        request_payload = {
            "model": config.OPENAI_MODEL,
            "messages": [
                {"role": "system", "content": self.prompt_builder.build_system_prompt(payload.get("schema_context") or {})},
                {"role": "user", "content": self.prompt_builder.build_user_prompt(payload)},
            ],
            "temperature": config.METADATA_LLM_TEMPERATURE,
            "response_format": {"type": "json_object"},
        }
        headers = {
            "Authorization": f"Bearer {config.OPENAI_API_KEY}",
            "Content-Type": "application/json",
        }
        with httpx.Client(timeout=config.METADATA_LLM_TIMEOUT_SECONDS) as client:
            response = client.post(f"{base_url}/chat/completions", headers=headers, json=request_payload)
            if response.status_code >= 400 and request_payload.get("response_format"):
                request_payload.pop("response_format", None)
                response = client.post(f"{base_url}/chat/completions", headers=headers, json=request_payload)
            response.raise_for_status()
            data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content")
        if not content:
            raise MetadataExtractionError("Metadata LLM returned empty content")
        return self._parse_json_content(content)

    def _parse_json_content(self, content: str) -> dict[str, Any]:
        cleaned = content.strip()
        if "</think>" in cleaned:
            cleaned = cleaned.split("</think>")[-1].strip()
        fence_match = re.search(r"```(?:json)?\s*(.*?)\s*```", cleaned, flags=re.DOTALL | re.IGNORECASE)
        if fence_match:
            cleaned = fence_match.group(1).strip()
        parsed = json.loads(cleaned)
        if not isinstance(parsed, dict):
            raise MetadataExtractionError("Metadata LLM output must be a JSON object")
        if "result" not in parsed:
            parsed = {"result": parsed if parsed else empty_metadata_result()}
        return {"result": parsed.get("result")}
