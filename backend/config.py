"""集中读取 .env 配置。"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# backend 目录即为 config.py 所在目录
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
SAVED_DIR = BASE_DIR / "saved"

# 优先加载 backend/.env，其次 workspace/.env
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / ".env")


def _get(key: str, default: str = "") -> str:
    return os.getenv(key, default).strip()


LLM_API_KEY: str = _get("LLM_API_KEY")
LLM_BASE_URL: str = _get(
    "LLM_BASE_URL", "https://open.bigmodel.cn/api/paas/v4"
)
LLM_MODEL: str = _get("LLM_MODEL", "glm-4-flash")
LLM_TIMEOUT: int = int(_get("LLM_TIMEOUT", "60") or "60")

# 确保存档目录存在
SAVED_DIR.mkdir(parents=True, exist_ok=True)
