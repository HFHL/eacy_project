"""列出后端已有的 SchemaTemplate + 各 published 版本，方便你挑一个填 base.env。

用法：
    python -m scripts.discover_templates

它会：
1. 用 base.env 里的 EACY_BASE_URL
2. 注册一个一次性账户（你的系统应允许任意 user 看模板列表）
3. GET /api/v1/schema-templates 列全部模板
4. 对每个模板 GET 详情拿 versions
5. 打印：template_id / template_code / template_type / 已发布版本 id

如果你的系统模板列表需要管理员权限：直接登录你已有账户用浏览器开发者工具拿 token，
然后 STRESS_DISCOVER_TOKEN=<token> python -m scripts.discover_templates。
"""
from __future__ import annotations

import os
import sys
import time
from urllib import request as urlrequest
from urllib import parse as urlparse
import json


def _load_cfg():
    """轻量读 base.env（不依赖 python-dotenv，方便直接 python3 跑）。"""
    env_path = os.path.join(os.path.dirname(__file__), "..", "config", "base.env")
    if os.path.isfile(env_path):
        for line in open(env_path):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())
    base = os.environ.get("EACY_BASE_URL", "").rstrip("/")
    if not base:
        print("ERROR: EACY_BASE_URL not set in config/base.env", file=sys.stderr)
        sys.exit(2)
    return base


def _req(method: str, url: str, *, token: str | None = None, body: dict | None = None) -> dict | list:
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urlrequest.Request(url, data=data, headers=headers, method=method)
    try:
        with urlrequest.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode() or "null")
    except Exception as e:
        # 把响应体也吐出来
        body_txt = ""
        if hasattr(e, "read"):
            try:
                body_txt = e.read().decode()[:500]  # type: ignore[attr-defined]
            except Exception:
                pass
        print(f"ERROR {method} {url}: {e} body={body_txt}", file=sys.stderr)
        sys.exit(3)


def _get_token(base: str) -> str:
    """优先用环境变量里的 token；否则注册一次性账户。"""
    tok = os.environ.get("STRESS_DISCOVER_TOKEN")
    if tok:
        print(f"[discover] using STRESS_DISCOVER_TOKEN")
        return tok
    suffix = f"discover_{int(time.time())}"
    payload = {
        "email": f"{suffix}@stress.test",
        "password": "Stress@123456",
        "username": suffix,
        "name": suffix,
    }
    resp = _req("POST", f"{base}/api/v1/auth/register", body=payload)
    tok = resp.get("access_token")  # type: ignore[union-attr]
    if not tok:
        print(f"ERROR: register did not return access_token: {resp}", file=sys.stderr)
        sys.exit(4)
    print(f"[discover] registered temp account: {payload['email']}")
    return tok


def main() -> int:
    base = _load_cfg()
    print(f"[discover] target = {base}")
    token = _get_token(base)

    # 列模板：可能要翻页，先尽量大
    list_url = f"{base}/api/v1/schema-templates?" + urlparse.urlencode({"page": 1, "page_size": 100})
    resp = _req("GET", list_url, token=token)
    items = resp.get("items", []) if isinstance(resp, dict) else []
    total = resp.get("total", len(items)) if isinstance(resp, dict) else len(items)
    print(f"[discover] {len(items)}/{total} templates returned")
    print()

    for tpl in items:
        tid = tpl.get("id")
        code = tpl.get("template_code")
        name = tpl.get("template_name")
        ttype = tpl.get("template_type")
        status = tpl.get("status")
        print(f"━━ {name}")
        print(f"   template_id   : {tid}")
        print(f"   template_code : {code}")
        print(f"   template_type : {ttype}    status: {status}")

        # 拿详情看版本
        detail = _req("GET", f"{base}/api/v1/schema-templates/{tid}", token=token)
        versions = detail.get("versions", []) if isinstance(detail, dict) else []
        if not versions:
            print(f"   versions      : (none)")
        else:
            for v in versions:
                vid = v.get("id")
                vno = v.get("version_no")
                vstatus = v.get("status")
                marker = " ◄ published" if vstatus == "published" else ""
                print(f"   version {vno:>3} : id={vid}  status={vstatus}{marker}")
        print()

    # 建议
    print("─" * 60)
    print("挑一个 status=published 的版本，把这两行填进 config/base.env：")
    print("  TEMPLATE_ID=<template_id>")
    print("  TEMPLATE_VERSION_ID=<version_id>")
    print()
    print("如果你要用于科研项目 CRF 抽取，挑 template_type 不是 'ehr' 的那个；")
    print("'ehr' 类型是病历夹用的，后端自动拉，不需要在压测里绑。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
