import os
import json
import logging
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent.resolve()
CONFIG_PATH = ROOT_DIR / "llms_config.json"

def get_llm_configs(strategy="fallback"):
    """
    Get a list of LLM configurations based on the specified routing strategy.
    
    Strategy:
    - fallback: Sort models by 'priority' (ascending). Starts with priority 1, falls back to priority 2, etc.
    - random: Shuffle the list of models randomly.
    """
    configs = []
    
    # 1. Try reading from llms_config.json
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    configs = data
        except Exception as e:
            logging.error(f"[LLM Router] Failed to load {CONFIG_PATH}: {e}")

    # 2. If no config found or invalid, fallback to .env legacy mode
    if not configs:
        api_key = os.getenv("OPENAI_API_KEY")
        if api_key:
            configs.append({
                "id": "legacy-env",
                "base_url": os.getenv("OPENAI_API_BASE_URL", "https://api.openai.com/v1"),
                "api_key": api_key,
                "model": os.getenv("OPENAI_MODEL", "gpt-4o"),
                "priority": 1
            })

    if not configs:
        raise RuntimeError("No LLM configurations found. Please setup llms_config.json or OPENAI_API_KEY in .env.")

    # 3. Apply Strategy
    if strategy == "fallback":
        configs.sort(key=lambda x: x.get("priority", 99))
    elif strategy == "random":
        import random
        random.shuffle(configs)
        
    return configs
