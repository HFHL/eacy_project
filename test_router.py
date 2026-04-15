import sys
from pathlib import Path
sys.path.append(str(Path("metadata-worker").resolve()))
from llm_router import get_llm_configs

configs = get_llm_configs()
for i, c in enumerate(configs):
    print(f"[{i}] {c['id']} -> {c['model']}")
