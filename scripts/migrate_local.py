"""Migrate data from the old local edition (data/assets.sqlite3 + data/uploads/)
into the online edition (Postgres + S3).

Run it on the machine that has the old data, with the production settings in the
environment, e.g. in PowerShell:

    $env:DATABASE_URL = "postgresql://..."      # the Neon/Vercel Postgres URL
    $env:SECRET_KEY   = "<same SECRET_KEY as on Vercel>"
    python scripts/migrate_local.py --dry-run
    python scripts/migrate_local.py

S3 settings are read from the online database (what the admin saved in the console),
falling back to S3_* / AWS_* environment variables. Assets already migrated
(same name + code + created_at) are skipped, so the script can be re-run safely.
"""
from __future__ import annotations

import argparse
import shutil
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from server import storage  # noqa: E402
from server.db import IS_PG, connect  # noqa: E402

OLD_DB = ROOT / "data" / "assets.sqlite3"
OLD_UPLOADS = ROOT / "data" / "uploads"
FIELDS = ("photo", "screenshot", "glb")


def upload(cfg: dict, kind: str, stored_name: str, original_name: str, dry_run: bool) -> tuple[str | None, int]:
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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="只检查，不上传也不写数据库")
    parser.add_argument("--owner", default="", help="把迁移的任务记为该用户名创建（可选）")
    args = parser.parse_args()

    if not OLD_DB.exists():
        sys.exit(f"找不到旧数据库：{OLD_DB}")
    if not IS_PG:
        print("提示：未设置 DATABASE_URL，将迁移到本地 SQLite（data/vault.sqlite3）。")

    old = sqlite3.connect(OLD_DB)
    old.row_factory = sqlite3.Row
    rows = old.execute("SELECT * FROM assets ORDER BY id").fetchall()

    db = connect()
    cfg = storage.load_config(db)
    if cfg["backend"] == "none":
        sys.exit("存储未配置：请先在后台保存 S3 设置，或设置 S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY")
    print(f"目标数据库：{'Postgres' if IS_PG else 'SQLite'}；目标存储：{cfg['backend']} {cfg['bucket']}")

    owner_id = None
    if args.owner:
        owner = db.one("SELECT id FROM users WHERE username = ?", (args.owner.lower(),))
        if not owner:
            sys.exit(f"用户不存在：{args.owner}")
        owner_id = owner["id"]

    migrated = skipped = 0
    for row in rows:
        row = dict(row)
        exists = db.one(
            "SELECT id FROM assets WHERE name = ? AND code = ? AND created_at = ?",
            (row["name"], row.get("code") or "", row["created_at"]),
        )
        if exists:
            skipped += 1
            continue
        print(f"  - {row['name']} ({row.get('code') or '无编号'})")
        files = {}
        for field in FIELDS:
            files[field] = upload(
                cfg, field, row.get(f"{field}_path") or "", row.get(f"{field}_name") or "", args.dry_run
            )
        if args.dry_run:
            migrated += 1
            continue
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
                row.get("photo_name") or "" if files["photo"][0] else "",
                files["screenshot"][0],
                row.get("screenshot_name") or "" if files["screenshot"][0] else "",
                glb_key,
                row.get("glb_name") or "" if glb_key else "",
                files["glb"][1],
                owner_id,
                owner_id,
                row["created_at"],
                row["updated_at"],
                (row.get("completed_at") or row["updated_at"]) if glb_key else None,
            ),
        )
        db.commit()
        migrated += 1

    db.close()
    action = "将迁移" if args.dry_run else "已迁移"
    print(f"完成：{action} {migrated} 条，跳过已存在 {skipped} 条。")


if __name__ == "__main__":
    main()
