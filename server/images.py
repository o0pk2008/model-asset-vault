"""Batch compression of stored reference photos and screenshots (max 1024×1024, WebP)."""
from __future__ import annotations

import io
import time

from . import storage
from .db import Database

MAX_EDGE = 1024
WEBP_QUALITY = 82
IMAGE_FIELDS = ("photo", "screenshot")
# Images already in WebP were produced by the browser-side or batch compression;
# GIFs are left alone so animations survive.
_DONE_PATTERNS = ("%.webp", "%.gif")


def compress(data: bytes) -> tuple[bytes, tuple[int, int]]:
    from PIL import Image, ImageOps

    with Image.open(io.BytesIO(data)) as source:
        source.draft("RGB", (MAX_EDGE * 2, MAX_EDGE * 2))  # fast JPEG decode at reduced size
        image = ImageOps.exif_transpose(source)
        has_alpha = "A" in image.getbands() or "transparency" in image.info
        image = image.convert("RGBA" if has_alpha else "RGB")
        image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        image.save(output, "WEBP", quality=WEBP_QUALITY, method=4)
        return output.getvalue(), image.size


def _needs_clause(field: str) -> str:
    return f"({field}_key IS NOT NULL AND {field}_key != '' AND {field}_key NOT LIKE ? AND {field}_key NOT LIKE ?)"


def pending_count(db: Database) -> int:
    total = 0
    for field in IMAGE_FIELDS:
        total += int(db.scalar(f"SELECT COUNT(*) AS n FROM assets WHERE {_needs_clause(field)}", _DONE_PATTERNS) or 0)
    return total


def webp_name(name: str) -> str:
    base = name.rsplit(".", 1)[0] if "." in name else name
    return f"{base or 'image'}.webp"


def run_batch(db: Database, cfg: dict, after_id: int, time_budget: float = 18.0) -> dict:
    """Compress pending images for assets with id > after_id until the time budget is used."""
    started = time.monotonic()
    where = " OR ".join(_needs_clause(field) for field in IMAGE_FIELDS)
    rows = db.all(
        f"SELECT id, photo_key, photo_name, screenshot_key, screenshot_name FROM assets "
        f"WHERE id > ? AND ({where}) ORDER BY id LIMIT 200",
        (after_id, *_DONE_PATTERNS * len(IMAGE_FIELDS)),
    )
    result = {"processed": 0, "failed": 0, "before": 0, "after": 0, "cursor": after_id, "errors": []}
    for row in rows:
        if time.monotonic() - started > time_budget:
            break
        for field in IMAGE_FIELDS:
            key = row.get(f"{field}_key")
            if not key or key.endswith((".webp", ".gif")):
                continue
            try:
                original = storage.read_bytes(cfg, key)
                data, _size = compress(original)
                name = webp_name(row.get(f"{field}_name") or key.rsplit("/", 1)[-1])
                new_key = storage.new_key(cfg, field, name)
                storage.write_bytes(cfg, new_key, data, "image/webp")
                cursor = db.execute(
                    f"UPDATE assets SET {field}_key = ?, {field}_name = ? WHERE id = ? AND {field}_key = ?",
                    (new_key, name, row["id"], key),
                )
                db.commit()
                if cursor.rowcount:
                    storage.delete_objects(cfg, [key])
                    result["processed"] += 1
                    result["before"] += len(original)
                    result["after"] += len(data)
                else:  # the asset changed meanwhile; drop the copy we just wrote
                    storage.delete_objects(cfg, [new_key])
            except Exception as error:  # keep going; report the failure
                db.rollback()
                result["failed"] += 1
                if len(result["errors"]) < 5:
                    result["errors"].append(f"#{row['id']} {field}: {type(error).__name__}")
        result["cursor"] = row["id"]
    else:
        result["cursor"] = None if not rows or len(rows) < 200 else result["cursor"]
    if result["cursor"] is None:
        result["done"] = True
    else:
        result["done"] = False
    result["pending"] = pending_count(db)
    return result
