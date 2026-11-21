"""POLYMODEL-Vault online edition — Flask application factory."""
from __future__ import annotations

import time
from datetime import timedelta

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

from . import config
from .auth import ApiError, load_current_user


def create_app() -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config.update(
        SECRET_KEY=config.SECRET_KEY,
        SESSION_COOKIE_NAME="mv_session",
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=config.ON_VERCEL,
        PERMANENT_SESSION_LIFETIME=timedelta(days=config.SESSION_DAYS),
        # Only the local-storage dev backend receives file bodies; S3 uploads bypass the server.
        MAX_CONTENT_LENGTH=config.MAX_GLB_SIZE + 1024 * 1024,
        JSON_SORT_KEYS=False,
    )
    app.json.ensure_ascii = False
    app.json.sort_keys = False

    from . import admin, assets, auth
    from .db import close_db

    app.register_blueprint(auth.bp)
    app.register_blueprint(assets.bp)
    app.register_blueprint(admin.bp)
    app.teardown_appcontext(close_db)

    @app.before_request
    def before_api():
        if not request.path.startswith("/api/"):
            return None
        g.request_started = time.perf_counter()
        # CSRF protection: state-changing API calls must carry a custom header, which
        # browsers refuse to send cross-site without a CORS preflight we never allow.
        if request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get("X-Requested-With") != "ModelVault":
            return jsonify({"error": "请求来源无效"}), 403
        load_current_user()
        return None

    @app.after_request
    def security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        if request.path.startswith("/api/") and "Cache-Control" not in response.headers:
            response.headers["Cache-Control"] = "no-store"
        started = g.get("request_started")
        if started is not None:
            # Visible in the browser's DevTools (Network → Timing) to see where time goes.
            timings = []
            if "db_connect_ms" in g:
                timings.append(f"db-connect;dur={g.db_connect_ms:.1f}")
            timings.append(f"app;dur={(time.perf_counter() - started) * 1000:.1f}")
            response.headers["Server-Timing"] = ", ".join(timings)
        return response

    @app.errorhandler(ApiError)
    def handle_api_error(error: ApiError):
        db = g.get("db")
        if db is not None:
            db.rollback()
        return jsonify({"error": error.message}), error.status

    @app.errorhandler(HTTPException)
    def handle_http(error: HTTPException):
        if request.path.startswith("/api/"):
            if error.code == 413:
                return jsonify({"error": "文件过大，请上传小于 1GB 的文件"}), 413
            return jsonify({"error": error.description or error.name}), error.code
        return error

    @app.errorhandler(Exception)
    def handle_unexpected(error: Exception):
        app.logger.exception("Unhandled error")
        db = g.get("db")
        if db is not None:
            db.rollback()
        return jsonify({"error": f"服务器错误：{type(error).__name__}"}), 500

    # Static pages. On Vercel the files in public/ are served by the CDN directly;
    # these routes make local development and clean URLs work too.
    pages = {"/": "index.html", "/login": "login.html", "/admin": "admin.html"}

    for route, filename in pages.items():
        app.add_url_rule(
            route,
            f"page_{filename}",
            (lambda filename=filename: send_from_directory(config.PUBLIC_DIR, filename)),
        )

    @app.get("/<path:filename>")
    def public_file(filename: str):
        if filename.startswith("api/"):
            return jsonify({"error": "Not found"}), 404
        return send_from_directory(config.PUBLIC_DIR, filename)

    @app.get("/api/health")
    def health():
        from .db import IS_PG, get_db

        get_db().scalar("SELECT 1 AS ok")
        return jsonify({"ok": True, "database": "postgres" if IS_PG else "sqlite"})

    return app
