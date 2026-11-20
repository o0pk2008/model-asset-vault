"""Runtime configuration, read from environment variables."""
from __future__ import annotations

import os
import secrets
import sys
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DIR = BASE_DIR / "public"
DATA_DIR = BASE_DIR / "data"

ON_VERCEL = bool(os.environ.get("VERCEL"))

DATABASE_URL = (
    os.environ.get("DATABASE_URL")
    or os.environ.get("POSTGRES_URL")
    or os.environ.get("NEON_DATABASE_URL")
    or ""
).strip()

_secret = os.environ.get("SECRET_KEY", "").strip()
if not _secret:
    if ON_VERCEL:
        raise RuntimeError("SECRET_KEY 环境变量未设置。请在 Vercel 项目设置中添加一个足够长的随机字符串。")
    # Local development only: a stable key stored under data/ so sessions survive restarts.
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    key_file = DATA_DIR / ".dev_secret_key"
    if not key_file.exists():
        key_file.write_text(secrets.token_urlsafe(48), encoding="utf-8")
    _secret = key_file.read_text(encoding="utf-8").strip()
    print("[POLYMODEL-Vault] SECRET_KEY 未设置，使用本地开发密钥 data/.dev_secret_key", file=sys.stderr)
SECRET_KEY = _secret

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "").strip().lower()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

APP_TIMEZONE = os.environ.get("APP_TIMEZONE", "Asia/Shanghai")

MAX_IMAGE_SIZE = 50 * 1024 * 1024
MAX_GLB_SIZE = int(os.environ.get("MAX_GLB_MB", "1024")) * 1024 * 1024
IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif", "bmp"}
MODEL_EXTENSIONS = {"glb"}

SESSION_DAYS = int(os.environ.get("SESSION_DAYS", "7"))
LOGIN_MAX_FAILURES = 5
LOGIN_LOCK_MINUTES = 15

try:
    from zoneinfo import ZoneInfo

    _TZ = ZoneInfo(APP_TIMEZONE)
except Exception:  # pragma: no cover - tzdata missing
    _TZ = None


def now_text() -> str:
    return datetime.now(_TZ).strftime("%Y-%m-%d %H:%M:%S")


def now_dt() -> datetime:
    return datetime.now(_TZ).replace(tzinfo=None)
