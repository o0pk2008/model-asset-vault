"""Migrate data from the old local edition (data/assets.sqlite3 + data/uploads/)
into the online edition (Postgres + S3).

Usage (from the project folder):

    python scripts/migrate_local.py

The script asks for the online DATABASE_URL and SECRET_KEY without echoing them
(values already set as environment variables are used as-is). If the SECRET_KEY is
not available, leave it empty and enter the S3 Secret Access Key instead.

It first lists what will be migrated, asks for confirmation, then uploads the files
to the S3 bucket saved in the admin console and writes the tasks to the online
database. Assets already migrated (same name + code + created_at) are skipped, so
the script can be re-run safely after an interruption.

Options:
    --dry-run        only list what would be migrated
    --owner admin    record migrated tasks as created by this username
    --yes            do not ask for confirmation
"""
from __future__ import annotations

import argparse
import getpass
import os
import shutil
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

OLD_DB = ROOT / "data" / "assets.sqlite3"
OLD_UPLOADS = ROOT / "data" / "uploads"
FIELDS = ("photo", "screenshot", "glb")


def ask_secret(name: str, prompt: str, required: bool) -> None:
    if os.environ.get(name, "").strip():
        return
    value = getpass.getpass(prompt).strip()
    if required and not value:
        sys.exit(f"未输入 {name}，已退出。")
    if value:
        os.environ[name] = value


def format_mb(size: int) -> str:
    return f"{size / 1024 / 1024:.1f} MB"


def upload(storage, cfg: dict, kind: str, stored_name: str, original_name: str, dry_run: bool) -> tuple[str | None, int]:
    if not stored_name:
        return None, 0
    source = OLD_UPLOADS / stored_name
    if not source.exists():
        print(f"    ! 缺少文件 {source}，已跳过")
        return None, 0
    key = storage.new_key(cfg, kind, original_name or stored_name)
    size = source.stat().st_size
    if dry_run:
        return key, size
    ext = storage.file_extension(key)
    if cfg["backend"] == "s3":
        storage.s3_client(cfg).upload_file(
            str(source),
            cfg["bucket"],
            key,
            ExtraArgs={
                "ContentType": storage.CONTENT_TYPES.get(ext, "application/octet-stream"),
                "CacheControl": "private, max-age=31536000, immutable",
            },
        )
    else:
        target = storage.local_path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    return key, size


def pending_rows(db, rows: list[dict]) -> tuple[list[dict], int]:
    todo, skipped = [], 0
    for row in rows:
        exists = db.one(
            "SELECT id FROM assets WHERE name = ? AND code = ? AND created_at = ?",
            (row["name"], row.get("code") or "", row["created_at"]),
        )
        if exists:
            skipped += 1
        else:
            todo.append(row)
    return todo, skipped


def file_size(stored_name: str | None) -> int:
    if not stored_name:
        return 0
    path = OLD_UPLOADS / stored_name
    return path.stat().st_size if path.exists() else 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="只列出将要迁移的内容，不上传也不写数据库")
    parser.add_argument("--owner", default="", help="把迁移的任务记为该用户名创建（可选）")
    parser.add_argument("--yes", action="store_true", help="不再询问确认")
    parser.add_argument("--local", action="store_true", help="迁移到本地开发环境（SQLite + 本地存储），用于测试")
    args = parser.parse_args()

    if not OLD_DB.exists():
        sys.exit(f"找不到旧数据库：{OLD_DB}")
    if not OLD_UPLOADS.exists():
        sys.exit(f"找不到旧文件目录：{OLD_UPLOADS}")

    if not args.local:
        print("请输入线上环境信息（输入内容不会显示，粘贴后直接回车）。")
        ask_secret("DATABASE_URL", "DATABASE_URL（Postgres 连接串）: ", required=True)
        ask_secret("SECRET_KEY", "SECRET_KEY（与 Vercel 相同；没有可直接回车）: ", required=False)
        if not os.environ.get("SECRET_KEY"):
            ask_secret("S3_SECRET_ACCESS_KEY", "S3 Secret Access Key: ", required=True)
            os.environ["SECRET_KEY"] = "migration-only-placeholder"

    # Import after the environment is ready: server.config reads it at import time.
    from server import storage
    from server.db import IS_PG, connect

    if not args.local and not IS_PG:
        sys.exit("DATABASE_URL 不是 Postgres 连接串（应以 postgresql:// 开头）。")

    old = sqlite3.connect(OLD_DB)
    old.row_factory = sqlite3.Row
    rows = [dict(row) for row in old.execute("SELECT * FROM assets ORDER BY id").fetchall()]
    old.close()

    db = connect()
    cfg = storage.load_config(db)
    if not args.local:
        if cfg["backend"] != "s3":
            sys.exit(
                "无法使用 S3：后台未保存存储设置，或 SECRET_KEY 与线上不一致导致无法解密 S3 密钥。\n"
                "请重新运行，SECRET_KEY 留空并输入 S3 Secret Access Key。"
            )
        try:
            storage.s3_client(cfg).head_bucket(Bucket=cfg["bucket"])
        except Exception as error:  # botocore errors
            sys.exit(f"无法访问存储桶 {cfg['bucket']}：{error}")
    print(f"目标数据库：{'Postgres' if IS_PG else 'SQLite'}；目标存储：{cfg['backend']} {cfg['bucket']}（前缀 {cfg['prefix']}）")

    owner_id = None
    if args.owner:
        owner = db.one("SELECT id FROM users WHERE username = ?", (args.owner.lower(),))
        if not owner:
            sys.exit(f"用户不存在：{args.owner}")
        owner_id = owner["id"]

    todo, skipped = pending_rows(db, rows)
    total_files = sum(1 for row in todo for f in FIELDS if row.get(f"{f}_path"))
    total_bytes = sum(file_size(row.get(f"{f}_path")) for row in todo for f in FIELDS)
    print(
        f"旧数据共 {len(rows)} 条；已迁移过 {skipped} 条；"
        f"本次待迁移 {len(todo)} 条，{total_files} 个文件，共 {format_mb(total_bytes)}。"
    )
    if args.dry_run or not todo:
        db.close()
        return
    if not args.yes:
        answer = input("确认开始迁移？输入 y 继续：").strip().lower()
        if answer not in ("y", "yes"):
            print("已取消。")
            db.close()
            return

    done_bytes = 0
    for index, row in enumerate(todo, 1):
        files = {}
        for field in FIELDS:
            files[field] = upload(
                storage, cfg, field, row.get(f"{field}_path") or "", row.get(f"{field}_name") or "", False
            )
            done_bytes += files[field][1]
        glb_key = files["glb"][0]
        db.execute(
            """
            INSERT INTO assets (
                name, code, category, status, tags, description, creator, maker,
                photo_key, photo_name, screenshot_key, screenshot_name,
                glb_key, glb_name, glb_size, created_by, updated_by,
                created_at, updated_at, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["name"],
                row.get("code") or "",
                row.get("category") or "",
                "已完成" if glb_key else "待制作",
                row.get("tags") or "",
                row.get("description") or "",
                row.get("creator") or "",
                row.get("maker") or "",
                files["photo"][0],
                (row.get("photo_name") or "") if files["photo"][0] else "",
                files["screenshot"][0],
                (row.get("screenshot_name") or "") if files["screenshot"][0] else "",
                glb_key,
                (row.get("glb_name") or "") if glb_key else "",
                files["glb"][1],
                owner_id,
                owner_id,
                row["created_at"],
                row["updated_at"],
                (row.get("completed_at") or row["updated_at"]) if glb_key else None,
            ),
        )
        db.commit()
        percent = done_bytes * 100 // max(total_bytes, 1)
        print(f"  [{index}/{len(todo)}] {percent:3d}%  {row['name']} ({row.get('code') or '无编号'})")

    db.close()
    print(f"完成：已迁移 {len(todo)} 条，跳过已存在 {skipped} 条。")


if __name__ == "__main__":
    main()
