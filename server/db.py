"""Thin database layer that works with Postgres (production, e.g. Neon on Vercel)
and SQLite (local development fallback when DATABASE_URL is not set).

SQL is written with `?` placeholders; they are converted to `%s` for Postgres.
Never put a literal `?` or `%` inside SQL text — pass such values as parameters.
"""
from __future__ import annotations

import atexit
import os
import sqlite3
import threading
import time
from typing import Any, Iterable

from flask import g

from . import config

IS_PG = config.DATABASE_URL.startswith(("postgres://", "postgresql://"))
SQLITE_PATH = config.DATA_DIR / "vault.sqlite3"

_schema_ready = False
_schema_lock = threading.Lock()


class Database:
    def __init__(self, conn):
        self.conn = conn

    def _sql(self, sql: str) -> str:
        return sql.replace("?", "%s") if IS_PG else sql

    def execute(self, sql: str, params: Iterable[Any] = ()):
        cur = self.conn.cursor()
        cur.execute(self._sql(sql), tuple(params))
        return cur

    def one(self, sql: str, params: Iterable[Any] = ()) -> dict | None:
        row = self.execute(sql, params).fetchone()
        return dict(row) if row is not None else None

    def all(self, sql: str, params: Iterable[Any] = ()) -> list[dict]:
        return [dict(row) for row in self.execute(sql, params).fetchall()]

    def scalar(self, sql: str, params: Iterable[Any] = ()):
        row = self.execute(sql, params).fetchone()
        if row is None:
            return None
        return list(dict(row).values())[0]

    def insert(self, sql: str, params: Iterable[Any] = ()) -> int:
        cur = self.execute(sql + " RETURNING id", params)
        row = cur.fetchone()
        return int(dict(row)["id"])

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        try:
            if self.pool is not None:
                self.pool.putconn(self.conn)  # back to the pool; rolled back if needed
            else:
                self.conn.close()
        except Exception:
            pass

    pool = None


# Postgres connections are expensive to open (TCP + TLS + auth = several round trips),
# so each serverless instance keeps a small pool and reuses connections across requests.
_pool = None
_pool_lock = threading.Lock()


def _pg_kwargs() -> dict:
    from psycopg.rows import dict_row

    # prepare_threshold=None: no server-side prepared statements, safe behind PgBouncer
    # (Neon's pooled endpoint runs in transaction mode).
    return {"row_factory": dict_row, "connect_timeout": 10, "prepare_threshold": None}


def _get_pool():
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                from psycopg_pool import ConnectionPool

                _pool = ConnectionPool(
                    config.DATABASE_URL,
                    min_size=0,
                    max_size=int(os.environ.get("DB_POOL_SIZE", "4")),
                    kwargs=_pg_kwargs(),
                    check=ConnectionPool.check_connection,  # drop connections that went stale while frozen
                    max_idle=240,
                    max_lifetime=1800,
                    timeout=15,
                    open=True,
                    name="vault",
                )
                atexit.register(_pool.close)
    return _pool


def connect(pooled: bool = False) -> Database:
    """Open a database handle. Request handlers use the pool; scripts use a direct connection."""
    if IS_PG:
        if pooled:
            pool = _get_pool()
            db = Database(pool.getconn())
            db.pool = pool
        else:
            import psycopg

            db = Database(psycopg.connect(config.DATABASE_URL, **_pg_kwargs()))
    else:
        config.DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(SQLITE_PATH, timeout=15)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        db = Database(conn)
    ensure_schema(db)
    return db


def get_db() -> Database:
    if "db" not in g:
        started = time.perf_counter()
        g.db = connect(pooled=True)
        g.db_connect_ms = (time.perf_counter() - started) * 1000
    return g.db


def close_db(exc=None):
    db = g.pop("db", None)
    if db is None:
        return
    try:
        if exc is None:
            db.commit()
        else:
            db.rollback()
    finally:
        db.close()


ID_COLUMN = "SERIAL PRIMARY KEY" if IS_PG else "INTEGER PRIMARY KEY AUTOINCREMENT"

SCHEMA = [
    f"""
    CREATE TABLE IF NOT EXISTS users (
        id {ID_COLUMN},
        username TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        status TEXT NOT NULL DEFAULT 'active',
        can_create INTEGER NOT NULL DEFAULT 0,
        can_edit INTEGER NOT NULL DEFAULT 0,
        can_delete INTEGER NOT NULL DEFAULT 0,
        session_version INTEGER NOT NULL DEFAULT 1,
        failed_logins INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        last_login_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    f"""
    CREATE TABLE IF NOT EXISTS assets (
        id {ID_COLUMN},
        name TEXT NOT NULL,
        code TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '待制作',
        tags TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        creator TEXT NOT NULL DEFAULT '',
        maker TEXT NOT NULL DEFAULT '',
        photo_key TEXT,
        photo_name TEXT,
        screenshot_key TEXT,
        screenshot_name TEXT,
        glb_key TEXT,
        glb_name TEXT,
        glb_size BIGINT NOT NULL DEFAULT 0,
        method TEXT NOT NULL DEFAULT 'ai',
        ai_tool TEXT NOT NULL DEFAULT '',
        created_by INTEGER,
        updated_by INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    """,
    f"""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id {ID_COLUMN},
        user_id INTEGER,
        username TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL,
        target TEXT NOT NULL DEFAULT '',
        detail TEXT NOT NULL DEFAULT '',
        ip TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_assets_updated ON assets (updated_at)",
    "CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at)",
]

# Columns added after the first release: (table, column, definition). Existing rows get
# the default, e.g. every asset created before 制作方式 existed counts as AI-generated.
COLUMN_MIGRATIONS = [
    ("assets", "method", "TEXT NOT NULL DEFAULT 'ai'"),
    ("assets", "ai_tool", "TEXT NOT NULL DEFAULT ''"),
]


def ensure_columns(db: Database) -> None:
    for table, column, definition in COLUMN_MIGRATIONS:
        if IS_PG:
            db.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {definition}")
        else:
            existing = {row["name"] for row in db.all(f"PRAGMA table_info({table})")}
            if column not in existing:
                db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
    db.execute("CREATE INDEX IF NOT EXISTS idx_assets_method ON assets (method)")


def ensure_schema(db: Database) -> None:
    global _schema_ready
    if _schema_ready:
        return
    with _schema_lock:
        if _schema_ready:
            return
        from .auth import bootstrap_admin

        # Several serverless instances may cold-start at once; if they race on DDL or on
        # creating the bootstrap admin, the loser rolls back and simply retries.
        for attempt in range(3):
            try:
                for statement in SCHEMA:
                    db.execute(statement)
                ensure_columns(db)
                db.commit()
                bootstrap_admin(db)
                db.commit()
                break
            except Exception:
                db.rollback()
                if attempt == 2:
                    raise
        _schema_ready = True


# ---------------------------------------------------------------- settings

def get_setting(db: Database, key: str, default: str | None = None) -> str | None:
    row = db.one("SELECT value FROM settings WHERE key = ?", (key,))
    return row["value"] if row else default


def set_setting(db: Database, key: str, value: str) -> None:
    db.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) "
        "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
