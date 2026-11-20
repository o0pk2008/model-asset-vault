from __future__ import annotations

import os
import socket
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "assets.sqlite3"

IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif", "bmp"}
MODEL_EXTENSIONS = {"glb"}
MAX_CONTENT_LENGTH = 1024 * 1024 * 1024

app = Flask(__name__, static_folder=str(BASE_DIR / "static"), static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH
app.config["JSON_SORT_KEYS"] = False


def db_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def ensure_column(connection: sqlite3.Connection, name: str, definition: str) -> None:
    columns = {row[1] for row in connection.execute("PRAGMA table_info(assets)").fetchall()}
    if name not in columns:
        connection.execute(f"ALTER TABLE assets ADD COLUMN {name} {definition}")


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with db_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS assets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                code TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT '待制作',
                tags TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                creator TEXT NOT NULL DEFAULT '',
                maker TEXT NOT NULL DEFAULT '',
                photo_path TEXT,
                photo_name TEXT,
                screenshot_path TEXT,
                screenshot_name TEXT,
                glb_path TEXT,
                glb_name TEXT,
                glb_size INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                completed_at TEXT
            )
            """
        )
        ensure_column(connection, "creator", "TEXT NOT NULL DEFAULT ''")
        ensure_column(connection, "maker", "TEXT NOT NULL DEFAULT ''")
        ensure_column(connection, "completed_at", "TEXT")
        connection.execute(
            """
            UPDATE assets SET
                status = CASE WHEN glb_path IS NOT NULL AND glb_path != '' THEN '已完成' ELSE '待制作' END,
                completed_at = CASE
                    WHEN glb_path IS NOT NULL AND glb_path != '' THEN COALESCE(completed_at, updated_at)
                    ELSE NULL
                END
            """
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at DESC)"
        )
        connection.commit()


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def allowed_file(filename: str, extensions: set[str]) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in extensions


def save_upload(file_storage, extensions: set[str]) -> tuple[str, str, int] | None:
    if file_storage is None or not file_storage.filename:
        return None

    original_name = secure_filename(file_storage.filename)
    if not allowed_file(original_name, extensions):
        raise ValueError(f"不支持的文件类型：{original_name}")

    extension = original_name.rsplit(".", 1)[1].lower()
    stored_name = f"{uuid.uuid4().hex}.{extension}"
    file_path = UPLOAD_DIR / stored_name
    file_storage.save(file_path)
    return stored_name, original_name, file_path.stat().st_size


def remove_file(filename: str | None) -> None:
    if not filename:
        return
    try:
        (UPLOAD_DIR / filename).unlink(missing_ok=True)
    except OSError:
        pass


def row_to_dict(row: sqlite3.Row) -> dict:
    data = dict(row)
    data["glb_size"] = int(data.get("glb_size") or 0)
    for field in ("photo", "screenshot", "glb"):
        path = data.get(f"{field}_path")
        if path:
            data[f"{field}_url"] = f"/uploads/{path}"
    return data


def get_asset(asset_id: int) -> sqlite3.Row | None:
    with db_connection() as connection:
        return connection.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone()


def form_text(name: str, limit: int | None = None) -> str:
    value = (request.form.get(name) or "").strip()
    if limit:
        value = value[:limit]
    return value


def form_text_or(name: str, fallback: str, limit: int | None = None) -> str:
    if name not in request.form:
        return fallback
    return form_text(name, limit)


@app.before_request
def ensure_storage() -> None:
    init_db()


@app.get("/")
def index():
    return send_from_directory(BASE_DIR / "static", "index.html")


@app.get("/uploads/<path:filename>")
def uploaded_file(filename: str):
    return send_from_directory(UPLOAD_DIR, filename)


@app.get("/api/assets")
def list_assets():
    query = (request.args.get("query") or "").strip().lower()
    category = (request.args.get("category") or "").strip()
    status = (request.args.get("status") or "").strip()
    sort = request.args.get("sort") or "updated_desc"

    clauses: list[str] = []
    params: list[str] = []
    if query:
        clauses.append(
            "(LOWER(name) LIKE ? OR LOWER(code) LIKE ? OR LOWER(tags) LIKE ? "
            "OR LOWER(description) LIKE ? OR LOWER(creator) LIKE ? OR LOWER(maker) LIKE ?)"
        )
        like = f"%{query}%"
        params.extend([like, like, like, like, like, like])
    if category:
        clauses.append("category = ?")
        params.append(category)
    if status:
        clauses.append("status = ?")
        params.append(status)

    where_sql = " WHERE " + " AND ".join(clauses) if clauses else ""
    order_map = {
        "updated_desc": "updated_at DESC, id DESC",
        "created_desc": "created_at DESC, id DESC",
        "name_asc": "name COLLATE NOCASE ASC",
        "name_desc": "name COLLATE NOCASE DESC",
        "size_desc": "glb_size DESC, id DESC",
    }
    order_sql = order_map.get(sort, order_map["updated_desc"])

    with db_connection() as connection:
        rows = connection.execute(
            f"SELECT * FROM assets{where_sql} ORDER BY {order_sql}", params
        ).fetchall()
        all_rows = connection.execute(
            "SELECT status, category, glb_path, glb_size FROM assets"
        ).fetchall()
        last_row = connection.execute(
            "SELECT name, code, category FROM assets ORDER BY id DESC LIMIT 1"
        ).fetchone()

    status_counts = {"待制作": 0, "已完成": 0}
    for row in all_rows:
        key = "已完成" if row["glb_path"] else "待制作"
        status_counts[key] += 1

    items = [row_to_dict(row) for row in rows]
    stats = {
        "total": len(all_rows),
        "filtered": len(items),
        "pending": status_counts["待制作"],
        "completed": status_counts["已完成"],
        "withModel": sum(1 for row in all_rows if row["glb_path"]),
        "totalSize": sum(int(row["glb_size"] or 0) for row in all_rows),
        "categories": sorted({row["category"] for row in all_rows if row["category"]}),
        "lastCreated": dict(last_row) if last_row else None,
    }
    return jsonify({"items": items, "stats": stats})


@app.get("/api/assets/<int:asset_id>")
def read_asset(asset_id: int):
    row = get_asset(asset_id)
    if row is None:
        return jsonify({"error": "资产不存在"}), 404
    return jsonify(row_to_dict(row))


@app.post("/api/assets")
def create_asset():
    photo = screenshot = glb = None
    try:
        name = form_text("name", 120)
        if not name:
            return jsonify({"error": "请填写模型名称"}), 400

        photo = save_upload(request.files.get("photo"), IMAGE_EXTENSIONS)
        screenshot = save_upload(request.files.get("screenshot"), IMAGE_EXTENSIONS)
        glb = save_upload(request.files.get("glb"), MODEL_EXTENSIONS)
    except ValueError as error:
        for upload in (photo, screenshot, glb):
            if upload:
                remove_file(upload[0])
        return jsonify({"error": str(error)}), 400

    timestamp = now_text()
    try:
        with db_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO assets (
                    name, code, category, status, tags, description, creator,
                    photo_path, photo_name, screenshot_path, screenshot_name,
                    glb_path, glb_name, glb_size, created_at, updated_at, completed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    name,
                    form_text("code", 80),
                    form_text("category", 80),
                    "已完成" if glb else "待制作",
                    form_text("tags", 240),
                    form_text("description", 2000),
                    form_text("creator", 80),
                    photo[0] if photo else None,
                    photo[1] if photo else "",
                    screenshot[0] if screenshot else None,
                    screenshot[1] if screenshot else "",
                    glb[0] if glb else None,
                    glb[1] if glb else "",
                    glb[2] if glb else 0,
                    timestamp,
                    timestamp,
                    timestamp if glb else None,
                ),
            )
            asset_id = cursor.lastrowid
            connection.commit()
    except Exception:
        for upload in (photo, screenshot, glb):
            if upload:
                remove_file(upload[0])
        raise

    return jsonify(row_to_dict(get_asset(asset_id))), 201


@app.put("/api/assets/<int:asset_id>")
def update_asset(asset_id: int):
    existing = get_asset(asset_id)
    if existing is None:
        return jsonify({"error": "资产不存在"}), 404

    photo = screenshot = glb = None
    try:
        name = form_text_or("name", existing["name"], 120) or existing["name"]
        photo = save_upload(request.files.get("photo"), IMAGE_EXTENSIONS)
        screenshot = save_upload(request.files.get("screenshot"), IMAGE_EXTENSIONS)
        glb = save_upload(request.files.get("glb"), MODEL_EXTENSIONS)
    except ValueError as error:
        for upload in (photo, screenshot, glb):
            if upload:
                remove_file(upload[0])
        return jsonify({"error": str(error)}), 400

    remove_photo = (request.form.get("remove_photo") or "").lower() == "true"
    remove_screenshot = (request.form.get("remove_screenshot") or "").lower() == "true"
    remove_glb = (request.form.get("remove_glb") or "").lower() == "true"

    photo_path = photo[0] if photo else (None if remove_photo else existing["photo_path"])
    photo_name = photo[1] if photo else ("" if remove_photo else existing["photo_name"])
    screenshot_path = screenshot[0] if screenshot else (None if remove_screenshot else existing["screenshot_path"])
    screenshot_name = screenshot[1] if screenshot else ("" if remove_screenshot else existing["screenshot_name"])
    glb_path = glb[0] if glb else (None if remove_glb else existing["glb_path"])
    glb_name = glb[1] if glb else ("" if remove_glb else existing["glb_name"])
    glb_size = glb[2] if glb else (0 if remove_glb else existing["glb_size"])

    status = "已完成" if glb_path else "待制作"
    completed_at = existing["completed_at"]
    if glb_path and not completed_at:
        completed_at = now_text()
    if not glb_path:
        completed_at = None

    with db_connection() as connection:
        connection.execute(
            """
            UPDATE assets SET
                name = ?, code = ?, category = ?, status = ?, tags = ?, description = ?,
                creator = ?, maker = ?,
                photo_path = ?, photo_name = ?, screenshot_path = ?, screenshot_name = ?,
                glb_path = ?, glb_name = ?, glb_size = ?, completed_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                name,
                form_text_or("code", existing["code"], 80),
                form_text_or("category", existing["category"], 80),
                status,
                form_text_or("tags", existing["tags"], 240),
                form_text_or("description", existing["description"], 2000),
                form_text_or("creator", existing["creator"], 80),
                form_text_or("maker", existing["maker"], 80),
                photo_path,
                photo_name,
                screenshot_path,
                screenshot_name,
                glb_path,
                glb_name,
                glb_size,
                completed_at,
                now_text(),
                asset_id,
            ),
        )
        connection.commit()

    if photo and existing["photo_path"]:
        remove_file(existing["photo_path"])
    if screenshot and existing["screenshot_path"]:
        remove_file(existing["screenshot_path"])
    if glb and existing["glb_path"]:
        remove_file(existing["glb_path"])
    if remove_photo and not photo:
        remove_file(existing["photo_path"])
    if remove_screenshot and not screenshot:
        remove_file(existing["screenshot_path"])
    if remove_glb and not glb:
        remove_file(existing["glb_path"])

    return jsonify(row_to_dict(get_asset(asset_id)))


@app.delete("/api/assets/<int:asset_id>")
def delete_asset(asset_id: int):
    existing = get_asset(asset_id)
    if existing is None:
        return jsonify({"error": "资产不存在"}), 404

    with db_connection() as connection:
        connection.execute("DELETE FROM assets WHERE id = ?", (asset_id,))
        connection.commit()

    for key in ("photo_path", "screenshot_path", "glb_path"):
        remove_file(existing[key])
    return jsonify({"success": True})


@app.get("/api/assets/<int:asset_id>/download")
def download_asset(asset_id: int):
    row = get_asset(asset_id)
    if row is None or not row["glb_path"]:
        return jsonify({"error": "该资产没有 GLB 文件"}), 404
    return send_from_directory(
        UPLOAD_DIR,
        row["glb_path"],
        as_attachment=True,
        download_name=row["glb_name"] or f"asset-{asset_id}.glb",
    )


@app.errorhandler(413)
def too_large(_error):
    return jsonify({"error": "文件过大，请上传小于 1GB 的文件"}), 413


@app.errorhandler(500)
def server_error(error):
    return jsonify({"error": f"服务器错误：{error}"}), 500


def lan_ip() -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("10.255.255.255", 1))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def main() -> None:
    init_db()
    port = int(os.environ.get("ASSET_PORT", "8765"))
    host = os.environ.get("ASSET_HOST", "0.0.0.0")
    print("=" * 56)
    print("模型资产库已启动")
    print(f"本机访问: http://127.0.0.1:{port}")
    print(f"局域网访问: http://{lan_ip()}:{port}")
    print("按 Ctrl+C 退出")
    print("=" * 56)
    try:
        from waitress import serve

        serve(app, host=host, port=port, threads=8, max_request_body_size=MAX_CONTENT_LENGTH)
    except ImportError:
        app.run(host=host, port=port, debug=False, threaded=True)


if __name__ == "__main__":
    main()
