"""Entry point.

- On Vercel this module is detected as the Flask entrypoint and `app` is served.
- Locally: `python app.py` starts a development server on http://127.0.0.1:8765
  (SQLite + local file storage unless DATABASE_URL / S3 settings are provided).
"""
import os

from server import create_app

app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", os.environ.get("ASSET_PORT", "8765")))
    host = os.environ.get("ASSET_HOST", "127.0.0.1")
    print("=" * 56)
    print("ModelVault 在线版（本地开发模式）")
    print(f"访问地址: http://{host}:{port}")
    print("=" * 56)
    try:
        from waitress import serve

        serve(app, host=host, port=port, threads=8, max_request_body_size=1100 * 1024 * 1024)
    except ImportError:
        app.run(host=host, port=port, debug=False, threaded=True)
