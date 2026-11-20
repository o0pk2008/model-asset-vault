"""Accounts, sessions and permission checks."""
from __future__ import annotations

import re
from datetime import timedelta
from functools import wraps

from flask import Blueprint, g, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from . import config
from .audit import log_action
from .db import Database, get_db, get_setting

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

USERNAME_RE = re.compile(r"^[a-z0-9_.\-]{3,32}$")
PERMISSIONS = ("can_create", "can_edit", "can_delete")
REGISTRATION_MODES = ("open", "approval", "closed")


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


# ------------------------------------------------------------------ helpers

def hash_password(password: str) -> str:
    return generate_password_hash(password, method="scrypt")


def validate_password(password: str) -> None:
    if len(password) < 8:
        raise ApiError("密码至少需要 8 位")
    if len(password) > 128:
        raise ApiError("密码过长")
    if not (re.search(r"[A-Za-z]", password) and re.search(r"\d", password)):
        raise ApiError("密码需同时包含字母和数字")


def validate_username(username: str) -> str:
    username = (username or "").strip().lower()
    if not USERNAME_RE.match(username):
        raise ApiError("用户名需为 3-32 位小写字母、数字、下划线、点或短横线")
    return username


def registration_mode(db: Database) -> str:
    mode = get_setting(db, "registration_mode", "open")
    return mode if mode in REGISTRATION_MODES else "open"


def user_public(user: dict) -> dict:
    is_admin = user["role"] == "admin"
    return {
        "id": user["id"],
        "username": user["username"],
        "display_name": user["display_name"] or user["username"],
        "role": user["role"],
        "status": user["status"],
        "is_admin": is_admin,
        "permissions": {
            "view": True,
            "download": True,
            "create": is_admin or bool(user["can_create"]),
            "edit": is_admin or bool(user["can_edit"]),
            "delete": is_admin or bool(user["can_delete"]),
        },
        "last_login_at": user.get("last_login_at"),
        "created_at": user.get("created_at"),
    }


def has_perm(user: dict | None, perm: str) -> bool:
    if not user:
        return False
    if user["role"] == "admin":
        return True
    return bool(user.get(f"can_{perm}"))


def bootstrap_admin(db: Database) -> None:
    """Create the first administrator from ADMIN_USERNAME / ADMIN_PASSWORD if none exists."""
    if not (config.ADMIN_USERNAME and config.ADMIN_PASSWORD):
        return
    exists = db.one("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
    if exists:
        return
    now = config.now_text()
    existing = db.one("SELECT id FROM users WHERE username = ?", (config.ADMIN_USERNAME,))
    if existing:
        db.execute(
            "UPDATE users SET role = 'admin', status = 'active', updated_at = ? WHERE id = ?",
            (now, existing["id"]),
        )
        return
    db.execute(
        "INSERT INTO users (username, display_name, password_hash, role, status, can_create, can_edit, "
        "can_delete, created_at, updated_at) VALUES (?, ?, ?, 'admin', 'active', 1, 1, 1, ?, ?)",
        (config.ADMIN_USERNAME, "管理员", hash_password(config.ADMIN_PASSWORD), now, now),
    )


def load_current_user() -> None:
    g.user = None
    uid = session.get("uid")
    if not uid:
        return
    user = get_db().one("SELECT * FROM users WHERE id = ?", (uid,))
    if not user or user["status"] != "active" or user["session_version"] != session.get("sv"):
        session.clear()
        return
    g.user = user


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not g.get("user"):
            return jsonify({"error": "请先登录", "code": "unauthorized"}), 401
        return view(*args, **kwargs)

    return wrapper


def permission_required(perm: str):
    def decorator(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            if not g.get("user"):
                return jsonify({"error": "请先登录", "code": "unauthorized"}), 401
            if not has_perm(g.user, perm):
                return jsonify({"error": "没有权限执行此操作", "code": "forbidden"}), 403
            return view(*args, **kwargs)

        return wrapper

    return decorator


def admin_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not g.get("user"):
            return jsonify({"error": "请先登录", "code": "unauthorized"}), 401
        if g.user["role"] != "admin":
            return jsonify({"error": "需要管理员权限", "code": "forbidden"}), 403
        return view(*args, **kwargs)

    return wrapper


def start_session(user: dict) -> None:
    session.clear()
    session.permanent = True
    session["uid"] = user["id"]
    session["sv"] = user["session_version"]


def body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


# ------------------------------------------------------------------ routes

@bp.get("/config")
def auth_config():
    db = get_db()
    from .storage import load_config

    return jsonify(
        {
            "registration": registration_mode(db),
            "storageReady": load_config(db)["backend"] != "none",
        }
    )


@bp.post("/register")
def register():
    db = get_db()
    mode = registration_mode(db)
    if mode == "closed":
        raise ApiError("当前未开放注册，请联系管理员创建账号", 403)
    data = body()
    username = validate_username(data.get("username"))
    password = str(data.get("password") or "")
    validate_password(password)
    display_name = str(data.get("display_name") or "").strip()[:40] or username
    if db.one("SELECT id FROM users WHERE username = ?", (username,)):
        raise ApiError("该用户名已被注册", 409)

    status = "active" if mode == "open" else "pending"
    now = config.now_text()
    user_id = db.insert(
        "INSERT INTO users (username, display_name, password_hash, role, status, created_at, updated_at) "
        "VALUES (?, ?, ?, 'user', ?, ?, ?)",
        (username, display_name, hash_password(password), status, now, now),
    )
    user = db.one("SELECT * FROM users WHERE id = ?", (user_id,))
    log_action("user.register", f"user:{username}", "需审批" if status == "pending" else "", user=user)
    if status == "pending":
        return jsonify({"pending": True, "message": "注册成功，请等待管理员审核后登录"})
    start_session(user)
    return jsonify({"user": user_public(user)})


@bp.post("/login")
def login():
    db = get_db()
    data = body()
    username = str(data.get("username") or "").strip().lower()
    password = str(data.get("password") or "")
    user = db.one("SELECT * FROM users WHERE username = ?", (username,))
    now_dt = config.now_dt()

    if user and user["locked_until"] and user["locked_until"] > now_dt.strftime("%Y-%m-%d %H:%M:%S"):
        raise ApiError(f"登录失败次数过多，账号已临时锁定，请 {config.LOGIN_LOCK_MINUTES} 分钟后再试", 429)

    if not user or not check_password_hash(user["password_hash"], password):
        if user:
            failures = int(user["failed_logins"] or 0) + 1
            locked = None
            if failures >= config.LOGIN_MAX_FAILURES:
                locked = (now_dt + timedelta(minutes=config.LOGIN_LOCK_MINUTES)).strftime("%Y-%m-%d %H:%M:%S")
                failures = 0
            db.execute(
                "UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?",
                (failures, locked, user["id"]),
            )
            log_action("user.login_failed", f"user:{username}", user=user)
            db.commit()
        raise ApiError("用户名或密码错误", 401)

    if user["status"] == "pending":
        raise ApiError("账号正在等待管理员审核", 403)
    if user["status"] != "active":
        raise ApiError("账号已被停用，请联系管理员", 403)

    now = config.now_text()
    db.execute(
        "UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?",
        (now, user["id"]),
    )
    user["last_login_at"] = now
    start_session(user)
    log_action("user.login", f"user:{username}", user=user)
    return jsonify({"user": user_public(user)})


@bp.post("/logout")
def logout():
    session.clear()
    return jsonify({"success": True})


@bp.get("/me")
@login_required
def me():
    return jsonify({"user": user_public(g.user)})


@bp.put("/profile")
@login_required
def update_profile():
    data = body()
    display_name = str(data.get("display_name") or "").strip()[:40]
    if not display_name:
        raise ApiError("请填写显示名称")
    get_db().execute(
        "UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?",
        (display_name, config.now_text(), g.user["id"]),
    )
    g.user["display_name"] = display_name
    return jsonify({"user": user_public(g.user)})


@bp.post("/password")
@login_required
def change_password():
    data = body()
    old = str(data.get("old_password") or "")
    new = str(data.get("new_password") or "")
    if not check_password_hash(g.user["password_hash"], old):
        raise ApiError("原密码不正确")
    validate_password(new)
    db = get_db()
    version = int(g.user["session_version"]) + 1
    db.execute(
        "UPDATE users SET password_hash = ?, session_version = ?, updated_at = ? WHERE id = ?",
        (hash_password(new), version, config.now_text(), g.user["id"]),
    )
    g.user["session_version"] = version
    start_session(g.user)  # keep this browser signed in, sign out other devices
    log_action("user.password_change", f"user:{g.user['username']}")
    return jsonify({"success": True})
