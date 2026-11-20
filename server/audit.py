"""Operation log for the admin panel."""
from __future__ import annotations

from flask import g, has_request_context, request

from . import config
from .db import get_db


def client_ip() -> str:
    if not has_request_context():
        return ""
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return (request.remote_addr or "")[:64]


def log_action(action: str, target: str = "", detail: str = "", user: dict | None = None) -> None:
    actor = user if user is not None else g.get("user")
    try:
        get_db().execute(
            "INSERT INTO audit_logs (user_id, username, action, target, detail, ip, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                actor["id"] if actor else None,
                actor["username"] if actor else "",
                action,
                target[:200],
                detail[:1000],
                client_ip(),
                config.now_text(),
            ),
        )
    except Exception:
        # Logging must never break the actual request.
        pass
