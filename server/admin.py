"""Admin back office API: users, storage, system settings, audit log."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from flask import Blueprint, g, jsonify, request

from . import config, storage
from .audit import log_action
from .auth import (
    PERMISSIONS,
    REGISTRATION_MODES,
    ApiError,
    admin_required,
    body,
    hash_password,
    registration_mode,
    user_public,
    validate_password,
    validate_username,
)
from .db import IS_PG, get_db, set_setting

bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def admin_user_dict(user: dict) -> dict:
    data = user_public(user)
    data.update({k: bool(user[k]) for k in PERMISSIONS})
    data["locked"] = bool(user["locked_until"] and user["locked_until"] > config.now_text())
    return data


def active_admin_count() -> int:
    return int(get_db().scalar("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'") or 0)


def get_user_or_404(user_id: int) -> dict:
    user = get_db().one("SELECT * FROM users WHERE id = ?", (user_id,))
    if not user:
        raise ApiError("用户不存在", 404)
    return user


# ------------------------------------------------------------------ overview

@bp.get("/overview")
@admin_required
def overview():
    db = get_db()
    users = db.one(
        "SELECT COUNT(*) AS total, "
        "SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active, "
        "SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending, "
        "SUM(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END) AS disabled, "
        "SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admins FROM users"
    ) or {}
    assets = db.one(
        "SELECT COUNT(*) AS total, "
        "SUM(CASE WHEN glb_key IS NOT NULL AND glb_key != '' THEN 1 ELSE 0 END) AS completed, "
        "COALESCE(SUM(glb_size), 0) AS glb_size FROM assets"
    ) or {}
    cfg = storage.load_config(db)
    recent = db.all("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 8")
    return jsonify(
        {
            "users": {k: int(v or 0) for k, v in users.items()},
            "assets": {k: int(v or 0) for k, v in assets.items()},
            "storage": storage.public_config(cfg),
            "registration": registration_mode(db),
            "database": "postgres" if IS_PG else "sqlite",
            "recentLogs": recent,
        }
    )


# ------------------------------------------------------------------ users

@bp.get("/users")
@admin_required
def list_users():
    query = (request.args.get("query") or "").strip().lower()
    status = (request.args.get("status") or "").strip()
    clauses, params = [], []
    if query:
        clauses.append("(LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?)")
        params += [f"%{query}%"] * 2
    if status in ("active", "pending", "disabled"):
        clauses.append("status = ?")
        params.append(status)
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    rows = get_db().all(
        f"SELECT * FROM users{where} ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, id ASC", params
    )
    return jsonify({"items": [admin_user_dict(row) for row in rows]})


@bp.post("/users")
@admin_required
def create_user():
    data = body()
    db = get_db()
    username = validate_username(data.get("username"))
    password = str(data.get("password") or "")
    validate_password(password)
    if db.one("SELECT id FROM users WHERE username = ?", (username,)):
        raise ApiError("该用户名已被注册", 409)
    role = "admin" if data.get("role") == "admin" else "user"
    perms = {k: 1 if data.get(k) else 0 for k in PERMISSIONS}
    now = config.now_text()
    user_id = db.insert(
        "INSERT INTO users (username, display_name, password_hash, role, status, can_create, can_edit, "
        "can_delete, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)",
        (
            username,
            str(data.get("display_name") or "").strip()[:40] or username,
            hash_password(password),
            role,
            perms["can_create"],
            perms["can_edit"],
            perms["can_delete"],
            now,
            now,
        ),
    )
    log_action("admin.user_create", f"user:{username}", role)
    return jsonify(admin_user_dict(get_user_or_404(user_id))), 201


@bp.patch("/users/<int:user_id>")
@admin_required
def update_user(user_id: int):
    user = get_user_or_404(user_id)
    data = body()
    updates: dict = {}
    if "display_name" in data:
        name = str(data.get("display_name") or "").strip()[:40]
        if not name:
            raise ApiError("请填写显示名称")
        updates["display_name"] = name
    for perm in PERMISSIONS:
        if perm in data:
            updates[perm] = 1 if data[perm] else 0
    if "role" in data:
        role = "admin" if data["role"] == "admin" else "user"
        if role != user["role"]:
            if user["id"] == g.user["id"]:
                raise ApiError("不能修改自己的管理员身份")
            if role == "user" and user["status"] == "active" and active_admin_count() <= 1:
                raise ApiError("至少需要保留一名启用状态的管理员")
            updates["role"] = role
    if "status" in data:
        status = data["status"]
        if status not in ("active", "pending", "disabled"):
            raise ApiError("状态无效")
        if status != user["status"]:
            if user["id"] == g.user["id"]:
                raise ApiError("不能停用自己的账号")
            if user["role"] == "admin" and user["status"] == "active" and active_admin_count() <= 1:
                raise ApiError("至少需要保留一名启用状态的管理员")
            updates["status"] = status
            if status != "active":
                updates["session_version"] = int(user["session_version"]) + 1
    if data.get("unlock"):
        updates["failed_logins"] = 0
        updates["locked_until"] = None
    if not updates:
        return jsonify(admin_user_dict(user))

    updates["updated_at"] = config.now_text()
    assignments = ", ".join(f"{k} = ?" for k in updates)
    get_db().execute(f"UPDATE users SET {assignments} WHERE id = ?", (*updates.values(), user_id))
    changed = ", ".join(f"{k}={v}" for k, v in updates.items() if k != "updated_at")
    log_action("admin.user_update", f"user:{user['username']}", changed)
    return jsonify(admin_user_dict(get_user_or_404(user_id)))


@bp.post("/users/<int:user_id>/reset-password")
@admin_required
def reset_password(user_id: int):
    user = get_user_or_404(user_id)
    password = str(body().get("password") or "")
    validate_password(password)
    get_db().execute(
        "UPDATE users SET password_hash = ?, session_version = ?, failed_logins = 0, locked_until = NULL, "
        "updated_at = ? WHERE id = ?",
        (hash_password(password), int(user["session_version"]) + 1, config.now_text(), user_id),
    )
    log_action("admin.password_reset", f"user:{user['username']}")
    return jsonify({"success": True})


@bp.delete("/users/<int:user_id>")
@admin_required
def delete_user(user_id: int):
    user = get_user_or_404(user_id)
    if user["id"] == g.user["id"]:
        raise ApiError("不能删除自己的账号")
    if user["role"] == "admin" and user["status"] == "active" and active_admin_count() <= 1:
        raise ApiError("至少需要保留一名启用状态的管理员")
    db = get_db()
    db.execute("UPDATE assets SET created_by = NULL WHERE created_by = ?", (user_id,))
    db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    log_action("admin.user_delete", f"user:{user['username']}")
    return jsonify({"success": True})


# ------------------------------------------------------------------ system settings

@bp.get("/settings")
@admin_required
def get_settings():
    db = get_db()
    return jsonify(
        {
            "registration_mode": registration_mode(db),
            "storage": storage.public_config(storage.load_config(db)),
            "origin": request.host_url.rstrip("/"),
        }
    )


@bp.put("/settings/system")
@admin_required
def update_system():
    mode = body().get("registration_mode")
    if mode not in REGISTRATION_MODES:
        raise ApiError("注册模式无效")
    set_setting(get_db(), "registration_mode", mode)
    log_action("admin.settings", "system", f"registration_mode={mode}")
    return jsonify({"registration_mode": mode})


# ------------------------------------------------------------------ storage

def _storage_error(error: Exception):
    raise ApiError(str(error)) from error


@bp.put("/storage")
@admin_required
def update_storage():
    data = body()
    if data.get("url_expires") not in (None, ""):
        try:
            int(data["url_expires"])
        except (TypeError, ValueError):
            raise ApiError("链接有效期无效")
    db = get_db()
    storage.save_config(db, data)
    log_action(
        "admin.storage_update",
        "storage",
        f"bucket={data.get('bucket', '')} region={data.get('region', '')}"
        + (" secret=updated" if data.get("secret_access_key") else ""),
    )
    return jsonify({"storage": storage.public_config(storage.load_config(db))})


@bp.post("/storage/test")
@admin_required
def test_storage():
    try:
        result = storage.test_connection(storage.load_config(get_db()))
    except storage.StorageError as error:
        _storage_error(error)
    return jsonify(result)


@bp.post("/storage/cors")
@admin_required
def storage_cors():
    origins = body().get("origins") or [request.host_url.rstrip("/")]
    origins = [str(o).strip().rstrip("/") for o in origins if str(o).strip()]
    if not origins:
        raise ApiError("请至少填写一个访问域名")
    try:
        rules = storage.apply_cors(storage.load_config(get_db()), origins)
    except storage.StorageError as error:
        _storage_error(error)
    log_action("admin.storage_cors", "storage", ", ".join(origins))
    return jsonify({"rules": rules})


def _referenced_keys() -> set[str]:
    rows = get_db().all("SELECT photo_key, screenshot_key, glb_key FROM assets")
    return {value for row in rows for value in row.values() if value}


@bp.get("/storage/usage")
@admin_required
def storage_usage():
    cfg = storage.load_config(get_db())
    try:
        objects = storage.list_objects(cfg)
    except storage.StorageError as error:
        _storage_error(error)
    except Exception as error:  # botocore errors
        raise ApiError(f"读取存储失败：{error}") from error
    referenced = _referenced_keys()
    by_kind: dict[str, dict] = {}
    orphan_count = orphan_size = 0
    for obj in objects:
        rest = obj["key"][len(cfg["prefix"]) :] if obj["key"].startswith(cfg["prefix"]) else obj["key"]
        kind = rest.split("/", 1)[0] or "other"
        bucket = by_kind.setdefault(kind, {"count": 0, "size": 0})
        bucket["count"] += 1
        bucket["size"] += obj["size"]
        if obj["key"] not in referenced:
            orphan_count += 1
            orphan_size += obj["size"]
    return jsonify(
        {
            "objects": len(objects),
            "size": sum(o["size"] for o in objects),
            "byKind": by_kind,
            "orphans": {"count": orphan_count, "size": orphan_size},
            "truncated": len(objects) >= 20000,
        }
    )


@bp.post("/storage/cleanup")
@admin_required
def storage_cleanup():
    """Delete objects no asset references and that are older than 24 hours."""
    cfg = storage.load_config(get_db())
    try:
        objects = storage.list_objects(cfg)
    except storage.StorageError as error:
        _storage_error(error)
    referenced = _referenced_keys()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    targets = [
        o for o in objects
        if o["key"] not in referenced and o["modified"] < cutoff and "/_healthcheck/" not in o["key"]
    ]
    storage.delete_objects(cfg, [o["key"] for o in targets])
    freed = sum(o["size"] for o in targets)
    log_action("admin.storage_cleanup", "storage", f"deleted={len(targets)} size={freed}")
    return jsonify({"deleted": len(targets), "size": freed})


# ------------------------------------------------------------------ audit log

@bp.get("/logs")
@admin_required
def list_logs():
    page = max(1, int(request.args.get("page") or 1))
    size = 50
    query = (request.args.get("query") or "").strip().lower()
    action = (request.args.get("action") or "").strip()
    clauses, params = [], []
    if query:
        clauses.append("(LOWER(username) LIKE ? OR LOWER(target) LIKE ? OR LOWER(detail) LIKE ?)")
        params += [f"%{query}%"] * 3
    if action:
        clauses.append("action LIKE ?")
        params.append(f"{action}%")
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    db = get_db()
    total = int(db.scalar(f"SELECT COUNT(*) AS n FROM audit_logs{where}", params) or 0)
    rows = db.all(
        f"SELECT * FROM audit_logs{where} ORDER BY id DESC LIMIT {size} OFFSET {(page - 1) * size}", params
    )
    return jsonify({"items": rows, "total": total, "page": page, "pageSize": size})
