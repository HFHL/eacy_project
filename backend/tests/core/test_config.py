from core.config import Config


def test_document_ocr_auto_enqueue_defaults_to_enabled():
    config = Config(_env_file=None)

    assert config.DOCUMENT_OCR_AUTO_ENQUEUE is True
