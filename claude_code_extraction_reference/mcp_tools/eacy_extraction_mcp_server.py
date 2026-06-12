from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[3]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from eacy_extraction_mcp_protocol import JsonRpcMcpServer  # noqa: E402
from eacy_extraction_workspace_tools import ExtractionWorkspaceTools  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", required=True)
    args = parser.parse_args()
    JsonRpcMcpServer(ExtractionWorkspaceTools(args.workspace)).serve()


if __name__ == "__main__":
    main()
