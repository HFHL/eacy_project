from app.integrations.textin_ocr import build_textin_api_url


def test_build_textin_api_url_appends_parse_and_image_params(monkeypatch):
    monkeypatch.setenv("TEXTIN_PARSE_MODE", "auto")
    monkeypatch.setenv("TEXTIN_GET_IMAGE", "page")
    url = build_textin_api_url("https://api.textin.com/ai/service/v1/pdf_to_markdown")
    assert "parse_mode=auto" in url
    assert "get_image=page" in url


def test_build_textin_api_url_merges_existing_query_params(monkeypatch):
    monkeypatch.setenv("TEXTIN_PARSE_MODE", "auto")
    monkeypatch.setenv("TEXTIN_GET_IMAGE", "page")
    url = build_textin_api_url("https://api.textin.com/ai/service/v1/pdf_to_markdown?dpi=144")
    assert "dpi=144" in url
    assert "parse_mode=auto" in url
    assert "get_image=page" in url
