"""Asset (task) API: list, create, update, delete, download, upload signing."""
from __future__ import annotations

import re
from collections import Counter

from flask import Blueprint, abort, g, jsonify, redirect, request, send_file

from . import config, storage
from .audit import log_action
from .auth import ApiError, body, has_perm, login_required, permission_required
from .db import IS_PG, get_db

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
    "ai_tool": 80,
}
OWNER_FIELDS = {"name", "code", "category", "tags", "description", "creator", "ai_tool", "method"}
# 制作方式: AI-generated, hand-modelled, or AI-generated then refined by hand.
METHODS = ("ai", "manual", "hybrid")
BATCH_LIMIT = 500
POPULAR_TAG_LIMIT = 24
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
    data["has_opt"] = bool(row.get("glb_opt_key")) and data["has_glb"]
    data["glb_opt_url"] = storage.file_url(cfg, row.get("glb_opt_key")) if data["has_opt"] else ""
    data["glb_opt_size"] = int(row.get("glb_opt_size") or 0)
    access = can_edit_asset(g.user, row)
    data["can_edit"] = bool(access)
    data["edit_scope"] = access or ""
    data["can_delete"] = has_perm(g.user, "delete")
    return data


def get_asset(asset_id: int, *, trashed: bool = False, lock: bool = False) -> dict | None:
    db = get_db()
    condition = "id = ? AND deleted_at IS NOT NULL" if trashed else "id = ? AND deleted_at IS NULL"
    if lock and not IS_PG:
        # SQLite has no row locks. Take a write lock before reading data for a mutation.
        db.execute(f"UPDATE assets SET id = id WHERE {condition}", (asset_id,))
    suffix = " FOR UPDATE" if lock and IS_PG else ""
    return db.one(f"SELECT * FROM assets WHERE {condition}{suffix}", (asset_id,))


def get_working_asset(asset_id: int, *, trashed: bool, lock: bool = False) -> dict:
    if trashed and not has_perm(g.user, "delete"):
        raise ApiError("没有权限执行此操作", 403)
    asset = get_asset(asset_id, trashed=trashed, lock=lock)
    if asset is None:
        raise ApiError("资产不存在", 404)
    if trashed and asset["purge_started"]:
        raise ApiError("该资产已开始彻底删除，无法修改", 409)
    return asset


def method_value(value) -> str:
    method = str(value or "").strip()
    if method not in METHODS:
        raise ApiError("请选择制作方式")
    return method


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
        "SELECT id FROM assets WHERE photo_key = ? OR screenshot_key = ? OR glb_key = ? OR glb_opt_key = ?",
        (key, key, key, key),
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

def asset_list_filters(*, models_only: bool = False) -> tuple[str, list, str]:
    db = get_db()
    query = (request.args.get("query") or "").strip().lower()
    category = (request.args.get("category") or "").strip()
    status = (request.args.get("status") or "").strip()
    sort = request.args.get("sort") or "created_desc"
    mine = request.args.get("mine") == "1"
    method = (request.args.get("method") or "").strip()

    clauses = ["deleted_at IS NULL"]
    params: list = []
    if query:
        like = f"%{query}%"
        search_sql = (
            "LOWER(name) LIKE ? OR LOWER(code) LIKE ? OR LOWER(tags) LIKE ? "
            "OR LOWER(description) LIKE ? OR LOWER(creator) LIKE ? OR LOWER(maker) LIKE ? "
            "OR LOWER(ai_tool) LIKE ?"
        )
        search_params = [like] * 7
        # English search in the English UI: map English names back to the stored Chinese terms.
        for row in db.all(
            "SELECT term FROM term_translations WHERE en != '' AND LOWER(en) LIKE ? LIMIT 20", (like,)
        ):
            term_like = f"%{row['term'].lower()}%"
            search_sql += " OR LOWER(tags) LIKE ? OR LOWER(category) LIKE ?"
            search_params += [term_like, term_like]
        clauses.append(f"({search_sql})")
        params.extend(search_params)
    if category:
        clauses.append("category = ?")
        params.append(category)
    if status:
        clauses.append("status = ?")
        params.append(status)
    if method in METHODS:
        clauses.append("method = ?")
        params.append(method)
    optimized = (request.args.get("optimized") or "").strip()
    if optimized == "1":
        clauses.append("(glb_opt_key IS NOT NULL AND glb_opt_key != '')")
    elif optimized == "0":
        clauses.append("(glb_key IS NOT NULL AND glb_key != '' AND (glb_opt_key IS NULL OR glb_opt_key = ''))")
    if mine:
        clauses.append("created_by = ?")
        params.append(g.user["id"])
    if models_only:
        clauses.append("(glb_key IS NOT NULL AND glb_key != '')")

    where_sql = " WHERE " + " AND ".join(clauses)
    order_map = {
        "updated_desc": "updated_at DESC, id DESC",
        "created_desc": "created_at DESC, id DESC",
        "name_asc": "LOWER(name) ASC, id ASC",
        "name_desc": "LOWER(name) DESC, id DESC",
        "size_desc": "glb_size DESC, id DESC",
    }
    order_sql = order_map.get(sort, order_map["created_desc"])
    return where_sql, params, order_sql


@bp.get("/assets/slideshow")
@login_required
def list_slideshow_models():
    where_sql, params, order_sql = asset_list_filters(models_only=True)
    rows = get_db().all(f"SELECT id, name, code FROM assets{where_sql} ORDER BY {order_sql}", params)
    return jsonify({"items": rows})


@bp.get("/assets")
@login_required
def list_assets():
    db = get_db()
    where_sql, params, order_sql = asset_list_filters()
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
        "COALESCE(SUM(glb_size), 0) AS total_size, "
        "SUM(CASE WHEN method = 'ai' THEN 1 ELSE 0 END) AS method_ai, "
        "SUM(CASE WHEN method = 'manual' THEN 1 ELSE 0 END) AS method_manual, "
        "SUM(CASE WHEN method = 'hybrid' THEN 1 ELSE 0 END) AS method_hybrid FROM assets WHERE deleted_at IS NULL"
    ) or {}
    categories = [
        row["category"]
        for row in db.all("SELECT DISTINCT category FROM assets WHERE deleted_at IS NULL AND category != '' ORDER BY category")
    ]
    last_row = db.one("SELECT name, code, category FROM assets WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1")
    tag_counts: Counter = Counter()
    for tag_row in db.all("SELECT tags FROM assets WHERE deleted_at IS NULL AND tags != ''"):
        seen = {tag.strip() for tag in re.split(r"[,，]", tag_row["tags"] or "") if tag.strip()}
        tag_counts.update(seen)
    popular_tags = [{"tag": tag, "count": count} for tag, count in tag_counts.most_common(POPULAR_TAG_LIMIT)]

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
        "popularTags": popular_tags,
        "methods": {m: int(summary.get(f"method_{m}") or 0) for m in METHODS},
        "aiTools": [
            row["ai_tool"]
            for row in db.all("SELECT DISTINCT ai_tool FROM assets WHERE deleted_at IS NULL AND ai_tool != '' ORDER BY ai_tool LIMIT 50")
        ],
        # 术语翻译: stored Chinese tag/category -> English display name.
        "terms": {row["term"]: row["en"] for row in db.all("SELECT term, en FROM term_translations WHERE en != ''")},
    }
    pagination = {"page": page, "pageSize": page_size, "total": filtered, "pages": pages}
    return jsonify({"items": items, "stats": stats, "pagination": pagination, "storage": storage_cfg()["backend"]})


@bp.get("/assets/<int:asset_id>")
@login_required
def read_asset(asset_id: int):
    row = get_asset(asset_id)
    if row is None:
        raise ApiError("资产不存在", 404)
    if request.method == "HEAD":
        return "", 204
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
    create_method = method_value(data.get("method") or "ai")
    asset_id = get_db().insert(
        """
        INSERT INTO assets (
            name, code, category, status, tags, description, creator, maker,
            photo_key, photo_name, screenshot_key, screenshot_name,
            glb_key, glb_name, glb_size, method, ai_tool, created_by, updated_by,
            created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            create_method,
            text_value(data, "ai_tool") if create_method != "manual" else "",
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
@bp.put("/assets/trash/<int:asset_id>", defaults={"trashed": True})
@login_required
def update_asset(asset_id: int, trashed: bool = False):
    existing = get_working_asset(asset_id, trashed=trashed, lock=True)
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
    values["method"] = method_value(data["method"]) if "method" in data else existing["method"]
    if values["method"] == "manual":
        values["ai_tool"] = ""

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
            creator = ?, maker = ?, method = ?, ai_tool = ?,
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
            values["method"],
            values["ai_tool"],
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
    if glb_key != existing["glb_key"] and existing.get("glb_opt_key"):
        old_keys.append(existing["glb_opt_key"])
        clear_optimized(asset_id)
    updated = get_asset(asset_id, trashed=trashed)
    get_db().commit()
    storage.delete_objects(cfg, old_keys)
    detail = "上传 GLB" if glb_key and glb_key != existing["glb_key"] else ""
    log_action("asset.update", f"asset:{asset_id}", f"{values['name']} {detail}".strip())
    return jsonify(asset_to_dict(updated))


@bp.post("/assets/batch-method")
@permission_required("edit")
def batch_set_method():
    """Set 制作方式 for many assets at once (used to reclassify existing models)."""
    data = body()
    method = method_value(data.get("method"))
    try:
        ids = sorted({int(i) for i in data.get("ids") or []})
    except (TypeError, ValueError):
        raise ApiError("参数无效")
    if not ids:
        raise ApiError("请先选择资产")
    if len(ids) > BATCH_LIMIT:
        raise ApiError(f"一次最多修改 {BATCH_LIMIT} 条")
    placeholders = ", ".join("?" for _ in ids)
    ai_tool_sql = ", ai_tool = ''" if method == "manual" else ""
    cursor = get_db().execute(
        f"UPDATE assets SET method = ?, updated_by = ?{ai_tool_sql} WHERE deleted_at IS NULL AND id IN ({placeholders})",
        (method, g.user["id"], *ids),
    )
    changed = cursor.rowcount
    log_action("asset.batch_method", f"{changed} assets", f"method={method} ids={','.join(map(str, ids[:50]))}")
    return jsonify({"updated": changed, "method": method})


def clear_optimized(asset_id: int) -> None:
    get_db().execute(
        "UPDATE assets SET glb_opt_key = NULL, glb_opt_size = 0, glb_opt_at = NULL, tri_before = 0, tri_after = 0 "
        "WHERE id = ?",
        (asset_id,),
    )


def _triangles(value) -> int:
    try:
        return max(0, min(int(value or 0), 2_000_000_000))
    except (TypeError, ValueError):
        return 0


@bp.post("/assets/<int:asset_id>/optimized")
@bp.post("/assets/trash/<int:asset_id>/optimized", defaults={"trashed": True})
@permission_required("edit")
def save_optimized(asset_id: int, trashed: bool = False):
    """Store a MeshPilot-simplified GLB next to the original (the original is never replaced)."""
    existing = get_working_asset(asset_id, trashed=trashed, lock=True)
    if not existing["glb_key"]:
        raise ApiError("该资产没有 GLB 文件")
    data = body()
    cfg = storage_cfg()
    key, _name, size = resolve_file(cfg, "glb", {"key": data.get("key"), "name": "optimized.glb"}, None)
    old_key = existing.get("glb_opt_key")
    before = _triangles(data.get("triangles_before"))
    after = _triangles(data.get("triangles_after"))
    get_db().execute(
        "UPDATE assets SET glb_opt_key = ?, glb_opt_size = ?, glb_opt_at = ?, tri_before = ?, tri_after = ?, "
        "updated_by = ? WHERE id = ?",
        (key, size, config.now_text(), before, after, g.user["id"], asset_id),
    )
    updated = get_asset(asset_id, trashed=trashed)
    get_db().commit()
    if old_key:
        storage.delete_objects(cfg, [old_key])
    reduction = f"{(1 - after / before) * 100:.0f}%" if before and after else "?"
    log_action(
        "asset.optimize",
        f"asset:{asset_id}",
        f"{existing['name']} 面数 {before} → {after}（-{reduction}） 大小 {existing['glb_size']} → {size}",
    )
    return jsonify(asset_to_dict(updated))


@bp.delete("/assets/<int:asset_id>/optimized")
@permission_required("edit")
def delete_optimized(asset_id: int):
    existing = get_asset(asset_id, lock=True)
    if existing is None:
        raise ApiError("资产不存在", 404)
    old_key = existing.get("glb_opt_key")
    clear_optimized(asset_id)
    updated = get_asset(asset_id)
    get_db().commit()
    if old_key:
        storage.delete_objects(storage_cfg(), [old_key])
        log_action("asset.optimize_delete", f"asset:{asset_id}", existing["name"])
    return jsonify(asset_to_dict(updated))


@bp.delete("/assets/<int:asset_id>")
@permission_required("delete")
def delete_asset(asset_id: int):
    existing = get_asset(asset_id, lock=True)
    if existing is None:
        raise ApiError("资产不存在", 404)
    get_db().execute("UPDATE assets SET deleted_at = ? WHERE id = ?", (config.now_text(), asset_id))
    log_action("asset.trash", f"asset:{asset_id}", existing["name"])
    return jsonify({"success": True})


@bp.get("/assets/trash")
@permission_required("delete")
def list_trashed_assets():
    db = get_db()
    try:
        page = int(request.args.get("page") or 1)
    except ValueError:
        raise ApiError("分页参数无效")
    total = int(db.scalar("SELECT COUNT(*) FROM assets WHERE deleted_at IS NOT NULL") or 0)
    pages = max(1, -(-total // DEFAULT_PAGE_SIZE))
    page = max(1, min(page, pages))
    rows = db.all(
        "SELECT id, name, code, status, created_by, deleted_at, purge_started, photo_key, screenshot_key, glb_key, "
        "glb_opt_key FROM assets WHERE deleted_at IS NOT NULL "
        "ORDER BY deleted_at DESC, id DESC LIMIT ? OFFSET ?",
        (DEFAULT_PAGE_SIZE, (page - 1) * DEFAULT_PAGE_SIZE),
    )
    cfg = storage_cfg()
    items = []
    for row in rows:
        item = {field: row[field] for field in ("id", "name", "code", "status", "deleted_at", "purge_started")}
        if not row["purge_started"]:
            item["edit_scope"] = can_edit_asset(g.user, row) or ""
            item["has_glb"] = bool(row["glb_key"])
            item["has_opt"] = item["has_glb"] and bool(row["glb_opt_key"])
            for field in ("photo", "screenshot"):
                item[f"{field}_url"] = storage.file_url(cfg, row[f"{field}_key"])
        items.append(item)
    return jsonify({"items": items, "page": page, "pages": pages})


@bp.get("/assets/trash/<int:asset_id>")
@permission_required("delete")
def read_trashed_asset(asset_id: int):
    return jsonify(asset_to_dict(get_working_asset(asset_id, trashed=True)))


@bp.post("/assets/<int:asset_id>/restore")
@permission_required("delete")
def restore_asset(asset_id: int):
    existing = get_asset(asset_id, trashed=True, lock=True)
    if existing is None:
        raise ApiError("资产不存在", 404)
    if existing["purge_started"]:
        raise ApiError("该资产已开始彻底删除，无法恢复", 409)
    get_db().execute("UPDATE assets SET deleted_at = NULL WHERE id = ?", (asset_id,))
    log_action("asset.restore", f"asset:{asset_id}", existing["name"])
    return jsonify({"success": True})


@bp.delete("/assets/<int:asset_id>/purge")
@permission_required("delete")
def purge_asset(asset_id: int):
    db = get_db()
    existing = get_asset(asset_id, trashed=True, lock=True)
    if existing is None:
        raise ApiError("资产不存在", 404)
    if not existing["purge_started"]:
        # Persist this state first. A partial storage deletion must not be restorable.
        db.execute("UPDATE assets SET purge_started = 1 WHERE id = ?", (asset_id,))
        db.commit()
        existing = get_asset(asset_id, trashed=True, lock=True)
        if existing is None:  # Another request finished the purge.
            return jsonify({"success": True})
    keys = [existing[f"{field}_key"] for field in FILE_FIELDS] + [existing["glb_opt_key"]]
    try:
        storage.delete_objects(storage_cfg(), keys, strict=True)
    except storage.StorageError as error:
        raise ApiError("存储文件未完全删除，请检查存储权限后重试", 502) from error
    db.execute("DELETE FROM assets WHERE id = ?", (asset_id,))
    log_action("asset.purge", f"asset:{asset_id}", existing["name"])
    return jsonify({"success": True})


@bp.get("/assets/<int:asset_id>/download")
@login_required
def download_asset(asset_id: int):
    row = get_asset(asset_id)
    if row is None or not row["glb_key"]:
        raise ApiError("该资产没有 GLB 文件", 404)
    filename = row["glb_name"] or f"asset-{asset_id}.glb"
    key = row["glb_key"]
    use_optimized = request.args.get("version") != "original" and bool(row.get("glb_opt_key"))
    if use_optimized:
        key = row["glb_opt_key"]
        base = filename[:-4] if filename.lower().endswith(".glb") else filename
        filename = f"{base}-optimized.glb"
    try:
        url = storage.download_url(storage_cfg(), key, filename)
    except storage.StorageError as error:
        raise ApiError(str(error)) from error
    log_action("asset.download", f"asset:{asset_id}", f"{row['name']}{' (优化版)' if use_optimized else ''}")
    return redirect(url, code=302)
