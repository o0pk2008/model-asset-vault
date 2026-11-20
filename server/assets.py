"""Asset (task) API: list, create, update, delete, download, upload signing."""
from __future__ import annotations

from flask import Blueprint, abort, g, jsonify, redirect, request, send_file

from . import config, storage
from .audit import log_action
from .auth import ApiError, body, has_perm, login_required, permission_required
from .db import get_db

bp = Blueprint("assets", __name__, url_prefix="/api")

FILE_FIELDS = ("photo", "screenshot", "glb")
TEXT_LIMITS = {
    "name": 120,
    "code": 80,
    "category": 80,
    "tags": 240,
    "description": 2000,
    "creator": 80,
    "maker": 80,
}
OWNER_FIELDS = {"name", "code", "category", "tags", "description", "creator"}
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


def storage_cfg() -> dict:
    if "storage_cfg" not in g:
        g.storage_cfg = storage.load_config(get_db())
    return g.storage_cfg


def can_edit_asset(user: dict, asset: dict) -> str | None:
    """Return 'full' for editors, 'owner' for the creator of the task, else None."""
    if has_perm(user, "edit"):
        return "full"
    if has_perm(user, "create") and asset.get("created_by") == user["id"]:
        return "owner"
    return None


def asset_to_dict(row: dict) -> dict:
    cfg = storage_cfg()
    data = {k: v for k, v in row.items() if not k.endswith("_key")}
    data["glb_size"] = int(data.get("glb_size") or 0)
    for field in FILE_FIELDS:
        data[f"{field}_url"] = storage.file_url(cfg, row.get(f"{field}_key"))
    data["has_glb"] = bool(row.get("glb_key"))
    access = can_edit_asset(g.user, row)
    data["can_edit"] = bool(access)
    data["edit_scope"] = access or ""
    data["can_delete"] = has_perm(g.user, "delete")
    return data


def get_asset(asset_id: int) -> dict | None:
    return get_db().one("SELECT * FROM assets WHERE id = ?", (asset_id,))


def text_value(data: dict, name: str) -> str:
    return str(data.get(name) or "").strip()[: TEXT_LIMITS[name]]


def resolve_file(cfg: dict, field: str, value, existing: dict | None) -> tuple[str | None, str, int]:
    """Validate an uploaded object reference from the client.

    value: dict {key, name} for a new file; None to remove; existing values are kept by the caller.
    """
    if value is None:
        return None, "", 0
    if not isinstance(value, dict):
        raise ApiError("文件参数无效")
    key = str(value.get("key") or "")
    name = str(value.get("name") or "").strip()[:200] or key.rsplit("/", 1)[-1]
    if existing and existing.get(f"{field}_key") == key:
        return key, existing.get(f"{field}_name") or name, int(existing.get(f"{field}_size") or 0)
    if not storage.key_matches_kind(cfg, key, field):
        raise ApiError("文件参数无效")
    clash = get_db().one(
        "SELECT id FROM assets WHERE photo_key = ? OR screenshot_key = ? OR glb_key = ?",
        (key, key, key),
    )
    if clash:
        raise ApiError("文件参数无效")
    size = storage.head_size(cfg, key)
    if size is None:
        raise ApiError("文件尚未上传完成，请重试")
    if size > storage.max_size(field):
        storage.delete_objects(cfg, [key])
        raise ApiError("文件过大，请上传小于 1GB 的文件")
    return key, name, size


# ------------------------------------------------------------------ list / read

@bp.get("/assets")
@login_required
def list_assets():
    db = get_db()
    query = (request.args.get("query") or "").strip().lower()
    category = (request.args.get("category") or "").strip()
    status = (request.args.get("status") or "").strip()
    sort = request.args.get("sort") or "created_desc"
    mine = request.args.get("mine") == "1"

    clauses: list[str] = []
    params: list = []
    if query:
        clauses.append(
            "(LOWER(name) LIKE ? OR LOWER(code) LIKE ? OR LOWER(tags) LIKE ? "
            "OR LOWER(description) LIKE ? OR LOWER(creator) LIKE ? OR LOWER(maker) LIKE ?)"
        )
        like = f"%{query}%"
        params.extend([like] * 6)
    if category:
        clauses.append("category = ?")
        params.append(category)
    if status:
        clauses.append("status = ?")
        params.append(status)
    if mine:
        clauses.append("created_by = ?")
        params.append(g.user["id"])

    where_sql = " WHERE " + " AND ".join(clauses) if clauses else ""
    order_map = {
        "updated_desc": "updated_at DESC, id DESC",
        "created_desc": "created_at DESC, id DESC",
        "name_asc": "LOWER(name) ASC, id ASC",
        "name_desc": "LOWER(name) DESC, id DESC",
        "size_desc": "glb_size DESC, id DESC",
    }
    order_sql = order_map.get(sort, order_map["created_desc"])

    try:
        page_size = int(request.args.get("page_size") or DEFAULT_PAGE_SIZE)
        page = int(request.args.get("page") or 1)
    except ValueError:
        raise ApiError("分页参数无效")
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))
    filtered = int(db.scalar(f"SELECT COUNT(*) AS n FROM assets{where_sql}", params) or 0)
    pages = max(1, -(-filtered // page_size))
    page = max(1, min(page, pages))
    rows = db.all(
        f"SELECT * FROM assets{where_sql} ORDER BY {order_sql} LIMIT {page_size} OFFSET {(page - 1) * page_size}",
        params,
    )
    summary = db.one(
        "SELECT COUNT(*) AS total, "
        "SUM(CASE WHEN glb_key IS NOT NULL AND glb_key != '' THEN 1 ELSE 0 END) AS completed, "
        "COALESCE(SUM(glb_size), 0) AS total_size FROM assets"
    ) or {}
    categories = [
        row["category"]
        for row in db.all("SELECT DISTINCT category FROM assets WHERE category != '' ORDER BY category")
    ]
    last_row = db.one("SELECT name, code, category FROM assets ORDER BY id DESC LIMIT 1")

    total = int(summary.get("total") or 0)
    completed = int(summary.get("completed") or 0)
    items = [asset_to_dict(row) for row in rows]
    stats = {
        "total": total,
        "filtered": filtered,
        "pending": total - completed,
        "completed": completed,
        "withModel": completed,
        "totalSize": int(summary.get("total_size") or 0),
        "categories": categories,
        "lastCreated": last_row,
    }
    pagination = {"page": page, "pageSize": page_size, "total": filtered, "pages": pages}
    return jsonify({"items": items, "stats": stats, "pagination": pagination, "storage": storage_cfg()["backend"]})


@bp.get("/assets/<int:asset_id>")
@login_required
def read_asset(asset_id: int):
    row = get_asset(asset_id)
    if row is None:
        raise ApiError("资产不存在", 404)
    return jsonify(asset_to_dict(row))


# ------------------------------------------------------------------ uploads

@bp.post("/uploads/presign")
@login_required
def presign_upload():
    if not (has_perm(g.user, "create") or has_perm(g.user, "edit")):
        raise ApiError("没有权限执行此操作", 403)
    data = body()
    kind = str(data.get("kind") or "")
    filename = str(data.get("filename") or "")
    size = int(data.get("size") or 0)
    if kind not in FILE_FIELDS:
        raise ApiError("文件参数无效")
    if size > storage.max_size(kind):
        raise ApiError("文件过大，请上传小于 1GB 的文件" if kind == "glb" else "图片过大，请上传小于 50MB 的图片")
    try:
        return jsonify(storage.presign_upload(storage_cfg(), kind, filename))
    except storage.StorageError as error:
        raise ApiError(str(error)) from error


@bp.post("/local-storage/upload")
@login_required
def local_upload():
    cfg = storage_cfg()
    if cfg["backend"] != "local":
        abort(404)
    info = storage.verify_local_token(request.form.get("token", ""))
    file = request.files.get("file")
    if file is None:
        raise ApiError("缺少文件")
    path = storage.local_path(info["key"])
    path.parent.mkdir(parents=True, exist_ok=True)
    file.save(path)
    if path.stat().st_size > info["limit"]:
        path.unlink(missing_ok=True)
        raise ApiError("文件过大，请上传小于 1GB 的文件")
    return ("", 204)


@bp.get("/local-storage/files/<path:key>")
@login_required
def local_file(key: str):
    cfg = storage_cfg()
    if cfg["backend"] != "local":
        abort(404)
    path = storage.local_path(key)
    if not path.exists():
        abort(404)
    download = request.args.get("download")
    response = send_file(path, as_attachment=bool(download), download_name=download or None)
    response.headers["Cache-Control"] = "private, max-age=86400"
    return response


# ------------------------------------------------------------------ create / update / delete

@bp.post("/assets")
@permission_required("create")
def create_asset():
    data = body()
    cfg = storage_cfg()
    name = text_value(data, "name")
    if not name:
        raise ApiError("请填写模型名称")

    files = {}
    for field in FILE_FIELDS:
        value = data.get(field)
        files[field] = resolve_file(cfg, field, value, None) if value else (None, "", 0)

    now = config.now_text()
    glb_key = files["glb"][0]
    asset_id = get_db().insert(
        """
        INSERT INTO assets (
            name, code, category, status, tags, description, creator, maker,
            photo_key, photo_name, screenshot_key, screenshot_name,
            glb_key, glb_name, glb_size, created_by, updated_by,
            created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            name,
            text_value(data, "code"),
            text_value(data, "category"),
            "已完成" if glb_key else "待制作",
            text_value(data, "tags"),
            text_value(data, "description"),
            text_value(data, "creator") or g.user["display_name"] or g.user["username"],
            text_value(data, "maker"),
            files["photo"][0],
            files["photo"][1],
            files["screenshot"][0],
            files["screenshot"][1],
            glb_key,
            files["glb"][1],
            files["glb"][2],
            g.user["id"],
            g.user["id"],
            now,
            now,
            now if glb_key else None,
        ),
    )
    log_action("asset.create", f"asset:{asset_id}", name)
    return jsonify(asset_to_dict(get_asset(asset_id))), 201


@bp.put("/assets/<int:asset_id>")
@login_required
def update_asset(asset_id: int):
    existing = get_asset(asset_id)
    if existing is None:
        raise ApiError("资产不存在", 404)
    scope = can_edit_asset(g.user, existing)
    if not scope:
        raise ApiError("没有权限执行此操作", 403)
    data = body()
    cfg = storage_cfg()

    values = {}
    for field in TEXT_LIMITS:
        if field not in data:
            values[field] = existing[field]
            continue
        if scope == "owner" and field not in OWNER_FIELDS:
            raise ApiError("没有权限执行此操作", 403)
        values[field] = text_value(data, field)
    if not values["name"]:
        raise ApiError("请填写模型名称")

    old_keys: list[str] = []
    for field in FILE_FIELDS:
        current = (existing[f"{field}_key"], existing[f"{field}_name"] or "", int(existing["glb_size"] or 0) if field == "glb" else 0)
        if field not in data:
            values[field] = current
            continue
        if scope == "owner" and field != "photo":
            raise ApiError("没有权限执行此操作", 403)
        value = data.get(field)
        if value is None:
            values[field] = (None, "", 0)
        else:
            fake_existing = {f"{field}_key": current[0], f"{field}_name": current[1], f"{field}_size": current[2]}
            values[field] = resolve_file(cfg, field, value, fake_existing)
        if current[0] and current[0] != values[field][0]:
            old_keys.append(current[0])

    glb_key = values["glb"][0]
    completed_at = existing["completed_at"]
    if glb_key and not completed_at:
        completed_at = config.now_text()
    if not glb_key:
        completed_at = None

    get_db().execute(
        """
        UPDATE assets SET
            name = ?, code = ?, category = ?, status = ?, tags = ?, description = ?,
            creator = ?, maker = ?,
            photo_key = ?, photo_name = ?, screenshot_key = ?, screenshot_name = ?,
            glb_key = ?, glb_name = ?, glb_size = ?, completed_at = ?, updated_at = ?, updated_by = ?
        WHERE id = ?
        """,
        (
            values["name"],
            values["code"],
            values["category"],
            "已完成" if glb_key else "待制作",
            values["tags"],
            values["description"],
            values["creator"],
            values["maker"],
            values["photo"][0],
            values["photo"][1],
            values["screenshot"][0],
            values["screenshot"][1],
            glb_key,
            values["glb"][1],
            values["glb"][2],
            completed_at,
            config.now_text(),
            g.user["id"],
            asset_id,
        ),
    )
    get_db().commit()
    storage.delete_objects(cfg, old_keys)
    detail = "上传 GLB" if glb_key and glb_key != existing["glb_key"] else ""
    log_action("asset.update", f"asset:{asset_id}", f"{values['name']} {detail}".strip())
    return jsonify(asset_to_dict(get_asset(asset_id)))


@bp.delete("/assets/<int:asset_id>")
@permission_required("delete")
def delete_asset(asset_id: int):
    existing = get_asset(asset_id)
    if existing is None:
        raise ApiError("资产不存在", 404)
    db = get_db()
    db.execute("DELETE FROM assets WHERE id = ?", (asset_id,))
    db.commit()
    storage.delete_objects(storage_cfg(), [existing[f"{field}_key"] for field in FILE_FIELDS])
    log_action("asset.delete", f"asset:{asset_id}", existing["name"])
    return jsonify({"success": True})


@bp.get("/assets/<int:asset_id>/download")
@login_required
def download_asset(asset_id: int):
    row = get_asset(asset_id)
    if row is None or not row["glb_key"]:
        raise ApiError("该资产没有 GLB 文件", 404)
    filename = row["glb_name"] or f"asset-{asset_id}.glb"
    try:
        url = storage.download_url(storage_cfg(), row["glb_key"], filename)
    except storage.StorageError as error:
        raise ApiError(str(error)) from error
    log_action("asset.download", f"asset:{asset_id}", row["name"])
    return redirect(url, code=302)
