from core.config import Config


def test_document_ocr_auto_enqueue_defaults_to_enabled():
    config = Config(_env_file=None)

    assert config.DOCUMENT_OCR_AUTO_ENQUEUE is True


def test_metadata_llm_config_defaults_are_declared():
    config = Config(_env_file=None)

    assert config.OPENAI_MODEL == "gpt-4o-mini"
    assert config.OPENAI_API_BASE_URL == "https://api.openai.com/v1"
    assert config.METADATA_LLM_ENABLE_RULE_FALLBACK is True
