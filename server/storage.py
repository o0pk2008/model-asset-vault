"""Object storage: AWS S3 (or S3-compatible) in production, local disk for development.

Uploads go straight from the browser to S3 with a presigned POST, so large GLB files
never pass through the Vercel function (which has a ~4.5 MB request body limit).
Read URLs are presigned GET URLs whose signing time is bucketed, so the same object
gets the same URL for a while and browsers can cache thumbnails and models.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from cryptography.fernet import Fernet, InvalidToken
from itsdangerous import BadSignature, URLSafeTimedSerializer

from . import config
from .db import Database, get_setting, set_setting

LOCAL_UPLOAD_DIR = config.DATA_DIR / "storage"
URL_WINDOW_SECONDS = 6 * 3600  # signing time bucket -> stable URLs for caching
DEFAULT_URL_EXPIRES = 12 * 3600

KIND_EXTENSIONS = {
    "photo": config.IMAGE_EXTENSIONS,
    "screenshot": config.IMAGE_EXTENSIONS,
    "glb": config.MODEL_EXTENSIONS,
}
CONTENT_TYPES = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "gif": "image/gif",
    "bmp": "image/bmp",
    "glb": "model/gltf-binary",
}

_fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256((config.SECRET_KEY + ":storage").encode()).digest()))


def encrypt(value: str) -> str:
    return _fernet.encrypt(value.encode()).decode() if value else ""


def decrypt(value: str) -> str:
    if not value:
        return ""
    try:
        return _fernet.decrypt(value.encode()).decode()
    except InvalidToken:
        return ""


# ------------------------------------------------------------------ config

class StorageError(Exception):
    pass


def _env(name: str) -> str:
    import os

    return (os.environ.get(name) or "").strip()


def load_config(db: Database) -> dict:
    """Storage settings saved by the admin, falling back to environment variables."""
    raw = get_setting(db, "storage")
    saved = json.loads(raw) if raw else {}
    cfg = {
        "bucket": saved.get("bucket") or _env("S3_BUCKET"),
        "region": saved.get("region") or _env("S3_REGION") or _env("AWS_REGION") or "us-east-1",
        "access_key_id": saved.get("access_key_id") or _env("S3_ACCESS_KEY_ID") or _env("AWS_ACCESS_KEY_ID"),
        "secret_access_key": decrypt(saved.get("secret_access_key_enc", ""))
        or _env("S3_SECRET_ACCESS_KEY")
        or _env("AWS_SECRET_ACCESS_KEY"),
        "prefix": normalize_prefix(saved.get("prefix") if "prefix" in saved else _env("S3_PREFIX") or "modelvault/"),
        "endpoint": (saved.get("endpoint") or _env("S3_ENDPOINT")).rstrip("/"),
        "url_expires": int(saved.get("url_expires") or DEFAULT_URL_EXPIRES),
        "source": "admin" if saved.get("bucket") else ("env" if _env("S3_BUCKET") else "none"),
    }
    cfg["configured"] = bool(cfg["bucket"] and cfg["access_key_id"] and cfg["secret_access_key"])
    if cfg["configured"]:
        cfg["backend"] = "s3"
    elif not config.ON_VERCEL:
        cfg["backend"] = "local"
    else:
        cfg["backend"] = "none"
    return cfg


def save_config(db: Database, data: dict) -> None:
    raw = get_setting(db, "storage")
    saved = json.loads(raw) if raw else {}
    for field in ("bucket", "region", "access_key_id", "endpoint"):
        if field in data:
            saved[field] = str(data[field] or "").strip()
    if "prefix" in data:
        saved["prefix"] = normalize_prefix(data["prefix"])
    if "url_expires" in data:
        saved["url_expires"] = max(900, min(int(data["url_expires"] or DEFAULT_URL_EXPIRES), 7 * 24 * 3600))
    secret = str(data.get("secret_access_key") or "").strip()
    if secret:
        saved["secret_access_key_enc"] = encrypt(secret)
    set_setting(db, "storage", json.dumps(saved))


def public_config(cfg: dict) -> dict:
    secret = cfg.get("secret_access_key") or ""
    return {
        "bucket": cfg["bucket"],
        "region": cfg["region"],
        "access_key_id": cfg["access_key_id"],
        "secret_set": bool(secret),
        "secret_hint": ("•" * 8 + secret[-4:]) if secret else "",
        "prefix": cfg["prefix"],
        "endpoint": cfg["endpoint"],
        "url_expires": cfg["url_expires"],
        "configured": cfg["configured"],
        "backend": cfg["backend"],
        "source": cfg["source"],
    }


def normalize_prefix(prefix) -> str:
    text = str(prefix or "").strip().strip("/")
    return f"{text}/" if text else ""


# ------------------------------------------------------------------ boto3

_client_cache: dict = {}
_client_lock = threading.Lock()


def s3_client(cfg: dict):
    import boto3
    from botocore.config import Config

    cache_key = (cfg["access_key_id"], cfg["secret_access_key"], cfg["region"], cfg["endpoint"])
    with _client_lock:
        client = _client_cache.get(cache_key)
        if client is None:
            client = boto3.client(
                "s3",
                aws_access_key_id=cfg["access_key_id"],
                aws_secret_access_key=cfg["secret_access_key"],
                region_name=cfg["region"],
                endpoint_url=cfg["endpoint"] or None,
                config=Config(
                    signature_version="s3v4",
                    s3={"addressing_style": "path" if cfg["endpoint"] else "virtual"},
                    connect_timeout=8,
                    read_timeout=20,
                    retries={"max_attempts": 2},
                ),
            )
            _client_cache.clear()
            _client_cache[cache_key] = client
    return client


def _require(cfg: dict) -> None:
    if cfg["backend"] == "none":
        raise StorageError("存储尚未配置，请联系管理员在后台填写 AWS S3 信息")


# ------------------------------------------------------------------ keys

def file_extension(filename: str) -> str:
    return filename.rsplit(".", 1)[1].lower() if "." in filename else ""


def new_key(cfg: dict, kind: str, filename: str) -> str:
    ext = file_extension(filename)
    now = datetime.now(timezone.utc)
    return f"{cfg['prefix']}{kind}/{now:%Y/%m}/{uuid.uuid4().hex}.{ext}"


def key_matches_kind(cfg: dict, key: str, kind: str) -> bool:
    if not key or ".." in key or key.startswith("/"):
        return False
    return key.startswith(f"{cfg['prefix']}{kind}/") and file_extension(key) in KIND_EXTENSIONS[kind]


def max_size(kind: str) -> int:
    return config.MAX_GLB_SIZE if kind == "glb" else config.MAX_IMAGE_SIZE


# ------------------------------------------------------------------ upload

_local_signer = URLSafeTimedSerializer(config.SECRET_KEY, salt="local-upload")


def presign_upload(cfg: dict, kind: str, filename: str) -> dict:
    _require(cfg)
    ext = file_extension(filename)
    if ext not in KIND_EXTENSIONS.get(kind, set()):
        raise StorageError(f"不支持的文件类型：{filename}")
    key = new_key(cfg, kind, filename)
    content_type = CONTENT_TYPES[ext]
    limit = max_size(kind)

    if cfg["backend"] == "local":
        token = _local_signer.dumps({"key": key, "limit": limit})
        return {
            "key": key,
            "method": "POST",
            "url": "/api/local-storage/upload",
            "fields": {"token": token, "Content-Type": content_type},
            "contentType": content_type,
            "maxSize": limit,
        }

    client = s3_client(cfg)
    fields = {"Content-Type": content_type, "Cache-Control": "private, max-age=31536000, immutable"}
    post = client.generate_presigned_post(
        Bucket=cfg["bucket"],
        Key=key,
        Fields=fields,
        Conditions=[
            {"Content-Type": content_type},
            {"Cache-Control": fields["Cache-Control"]},
            ["content-length-range", 1, limit],
        ],
        ExpiresIn=3600,
    )
    return {
        "key": key,
        "method": "POST",
        "url": post["url"],
        "fields": post["fields"],
        "contentType": content_type,
        "maxSize": limit,
    }


def verify_local_token(token: str) -> dict:
    try:
        return _local_signer.loads(token, max_age=3600)
    except BadSignature as error:
        raise StorageError("上传凭证无效或已过期") from error


def local_path(key: str) -> Path:
    path = (LOCAL_UPLOAD_DIR / key).resolve()
    if LOCAL_UPLOAD_DIR.resolve() not in path.parents:
        raise StorageError("非法文件路径")
    return path


def head_size(cfg: dict, key: str) -> int | None:
    """Return the object's size in bytes, or None if it does not exist."""
    _require(cfg)
    if cfg["backend"] == "local":
        path = local_path(key)
        return path.stat().st_size if path.exists() else None
    from botocore.exceptions import ClientError

    try:
        response = s3_client(cfg).head_object(Bucket=cfg["bucket"], Key=key)
        return int(response["ContentLength"])
    except ClientError as error:
        code = str(error.response.get("Error", {}).get("Code", ""))
        if code in ("404", "NoSuchKey", "NotFound"):
            return None
        raise StorageError(f"读取存储失败：{code}") from error


def delete_objects(cfg: dict, keys: list[str]) -> None:
    keys = [key for key in keys if key]
    if not keys or cfg["backend"] == "none":
        return
    if cfg["backend"] == "local":
        for key in keys:
            try:
                local_path(key).unlink(missing_ok=True)
            except (OSError, StorageError):
                pass
        return
    try:
        client = s3_client(cfg)
        for start in range(0, len(keys), 1000):
            chunk = keys[start : start + 1000]
            client.delete_objects(
                Bucket=cfg["bucket"],
                Delete={"Objects": [{"Key": key} for key in chunk], "Quiet": True},
            )
    except Exception:
        # Deleting is best effort; orphans can be cleaned up from the admin panel.
        pass


# ------------------------------------------------------------------ download URLs

def _uri_encode(value: str, safe: str = "-_.~") -> str:
    return quote(value, safe=safe)


def _sign(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _object_location(cfg: dict, key: str) -> tuple[str, str, str]:
    """Return (scheme, host, canonical_uri) for an object."""
    encoded_key = _uri_encode(key, safe="-_.~/")
    if cfg["endpoint"]:
        scheme, _, rest = cfg["endpoint"].partition("://")
        host, _, base_path = rest.partition("/")
        base = f"/{base_path.strip('/')}" if base_path.strip("/") else ""
        return scheme or "https", host, f"{base}/{_uri_encode(cfg['bucket'])}/{encoded_key}"
    region = cfg["region"]
    if "." in cfg["bucket"]:
        return "https", f"s3.{region}.amazonaws.com", f"/{cfg['bucket']}/{encoded_key}"
    return "https", f"{cfg['bucket']}.s3.{region}.amazonaws.com", f"/{encoded_key}"


def presign_get_s3(cfg: dict, key: str, extra: dict | None = None, signed_at: datetime | None = None) -> str:
    """SigV4 query-string presigned GET with a bucketed signing time (stable URLs)."""
    if signed_at is None:
        epoch = int(time.time()) // URL_WINDOW_SECONDS * URL_WINDOW_SECONDS
        signed_at = datetime.fromtimestamp(epoch, timezone.utc)
    amz_date = signed_at.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = signed_at.strftime("%Y%m%d")
    region = cfg["region"]
    scope = f"{date_stamp}/{region}/s3/aws4_request"
    scheme, host, canonical_uri = _object_location(cfg, key)
    expires = min(cfg["url_expires"] + URL_WINDOW_SECONDS, 7 * 24 * 3600)

    params = {
        "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
        "X-Amz-Credential": f"{cfg['access_key_id']}/{scope}",
        "X-Amz-Date": amz_date,
        "X-Amz-Expires": str(expires),
        "X-Amz-SignedHeaders": "host",
    }
    params.update(extra or {})
    canonical_query = "&".join(
        f"{_uri_encode(k)}={_uri_encode(v)}" for k, v in sorted(params.items())
    )
    canonical_request = "\n".join(
        ["GET", canonical_uri, canonical_query, f"host:{host}\n", "host", "UNSIGNED-PAYLOAD"]
    )
    string_to_sign = "\n".join(
        ["AWS4-HMAC-SHA256", amz_date, scope, hashlib.sha256(canonical_request.encode()).hexdigest()]
    )
    signing_key = _sign(
        _sign(_sign(_sign(("AWS4" + cfg["secret_access_key"]).encode(), date_stamp), region), "s3"),
        "aws4_request",
    )
    signature = hmac.new(signing_key, string_to_sign.encode(), hashlib.sha256).hexdigest()
    return f"{scheme}://{host}{canonical_uri}?{canonical_query}&X-Amz-Signature={signature}"


def content_disposition(filename: str) -> str:
    ascii_name = "".join(ch if 32 <= ord(ch) < 127 and ch not in '"\\' else "_" for ch in filename) or "download"
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename, safe='')}"


def file_url(cfg: dict, key: str | None) -> str:
    if not key or cfg["backend"] == "none":
        return ""
    if cfg["backend"] == "local":
        return f"/api/local-storage/files/{quote(key)}"
    return presign_get_s3(cfg, key)


def download_url(cfg: dict, key: str, filename: str) -> str:
    _require(cfg)
    if cfg["backend"] == "local":
        return f"/api/local-storage/files/{quote(key)}?download={quote(filename)}"
    return presign_get_s3(cfg, key, {"response-content-disposition": content_disposition(filename)})


# ------------------------------------------------------------------ admin tools

def test_connection(cfg: dict) -> dict:
    if cfg["backend"] == "local":
        return {"ok": True, "message": "本地开发存储（data/storage）可用"}
    if not cfg["configured"]:
        raise StorageError("请先填写存储桶、Access Key 和 Secret Key")
    from botocore.exceptions import BotoCoreError, ClientError

    client = s3_client(cfg)
    try:
        client.head_bucket(Bucket=cfg["bucket"])
        probe = f"{cfg['prefix']}_healthcheck/{uuid.uuid4().hex}.txt"
        client.put_object(Bucket=cfg["bucket"], Key=probe, Body=b"ok")
        client.delete_object(Bucket=cfg["bucket"], Key=probe)
    except ClientError as error:
        err = error.response.get("Error", {})
        raise StorageError(f"连接失败：{err.get('Code', '')} {err.get('Message', '')}".strip()) from error
    except BotoCoreError as error:
        raise StorageError(f"连接失败：{error}") from error
    cors = None
    try:
        cors = client.get_bucket_cors(Bucket=cfg["bucket"]).get("CORSRules", [])
    except ClientError:
        cors = []
    return {"ok": True, "message": "连接成功，读写权限正常", "cors": cors}


def apply_cors(cfg: dict, origins: list[str]) -> list[dict]:
    if cfg["backend"] != "s3":
        raise StorageError("仅 S3 存储需要配置 CORS")
    rules = [
        {
            "AllowedOrigins": origins,
            "AllowedMethods": ["GET", "HEAD", "POST", "PUT"],
            "AllowedHeaders": ["*"],
            "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
            "MaxAgeSeconds": 3600,
        }
    ]
    from botocore.exceptions import ClientError

    try:
        s3_client(cfg).put_bucket_cors(Bucket=cfg["bucket"], CORSConfiguration={"CORSRules": rules})
    except ClientError as error:
        err = error.response.get("Error", {})
        raise StorageError(f"设置 CORS 失败：{err.get('Code', '')} {err.get('Message', '')}".strip()) from error
    return rules


def list_objects(cfg: dict, max_items: int = 20000) -> list[dict]:
    """List stored objects under the prefix: [{key, size, modified(datetime utc)}]."""
    if cfg["backend"] == "local":
        items = []
        base = LOCAL_UPLOAD_DIR
        if base.exists():
            for path in base.rglob("*"):
                if path.is_file():
                    stat = path.stat()
                    items.append(
                        {
                            "key": path.relative_to(base).as_posix(),
                            "size": stat.st_size,
                            "modified": datetime.fromtimestamp(stat.st_mtime, timezone.utc),
                        }
                    )
        return items[:max_items]
    _require(cfg)
    client = s3_client(cfg)
    items: list[dict] = []
    token = None
    while len(items) < max_items:
        kwargs = {"Bucket": cfg["bucket"], "Prefix": cfg["prefix"], "MaxKeys": 1000}
        if token:
            kwargs["ContinuationToken"] = token
        response = client.list_objects_v2(**kwargs)
        for obj in response.get("Contents", []):
            items.append({"key": obj["Key"], "size": int(obj["Size"]), "modified": obj["LastModified"]})
        if not response.get("IsTruncated"):
            break
        token = response.get("NextContinuationToken")
    return items
