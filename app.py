"""Annotator - draw boxes on images and PDFs, export COCO.

Run it with:

    python app.py

(c) 2026 - Prof. Shahab Anbarjafari
"""

import argparse
import importlib.util
import shutil
import socket
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT / "frontend"
WEB_DIR = FRONTEND_DIR / "dist"

REQUIRED = {
    "fastapi": "fastapi",
    "uvicorn": "uvicorn",
    "PIL": "pillow",
}
OPTIONAL = {
    "cv2": ("opencv-python-headless", "smart tools (snap, magic click, find similar, suggest)"),
    "numpy": ("numpy", "smart tools (snap, magic click, find similar, suggest)"),
    "pypdfium2": ("pypdfium2", "PDF import"),
}


def _has(module: str) -> bool:
    return importlib.util.find_spec(module) is not None


def _check_dependencies() -> None:
    missing = [package for module, package in REQUIRED.items() if not _has(module)]
    if not (_has("python_multipart") or _has("multipart")):
        missing.append("python-multipart")
    if missing:
        print("Annotator needs a few packages that are not installed: " + ", ".join(missing))
        print("Install everything with:\n\n    pip install -r requirements.txt\n")
        sys.exit(1)
    for module, (package, feature) in OPTIONAL.items():
        if not _has(module):
            print("Note: {} is not installed, so {} will be unavailable.".format(package, feature))


def _ensure_frontend() -> None:
    """The built interface ships with the project; rebuild only if it is gone."""
    if (WEB_DIR / "index.html").is_file():
        return
    npm = shutil.which("npm")
    if npm is None:
        print("The interface has not been built and npm was not found.")
        print("Install Node.js, then run: cd frontend && npm install && npm run build")
        return
    print("Building the interface (first run only)...")
    try:
        subprocess.run([npm, "install"], cwd=str(FRONTEND_DIR), check=True)
        subprocess.run([npm, "run", "build"], cwd=str(FRONTEND_DIR), check=True)
    except (subprocess.CalledProcessError, OSError) as exc:
        print("The interface could not be built: {}".format(exc))


def _free_port(host: str, preferred: int) -> int:
    for port in range(preferred, preferred + 30):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            try:
                probe.bind((host, port))
            except OSError:
                continue
            return port
    return preferred


def main() -> None:
    parser = argparse.ArgumentParser(description="Annotator: bounding boxes on images and PDFs, COCO export.")
    parser.add_argument("--host", default="127.0.0.1", help="address to listen on (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="preferred port (default: 8000)")
    parser.add_argument("--data", default=str(ROOT / "data"), help="folder for the session (default: ./data)")
    parser.add_argument("--no-browser", action="store_true", help="do not open the browser automatically")
    args = parser.parse_args()

    _check_dependencies()
    _ensure_frontend()

    import uvicorn

    from backend.server import create_app

    port = _free_port(args.host, args.port)
    shown_host = "127.0.0.1" if args.host in ("0.0.0.0", "::") else args.host
    url = "http://{}:{}".format(shown_host, port)

    print("\n  Annotator is running at  {}".format(url))
    print("  Session folder           {}".format(Path(args.data).resolve()))
    print("  Press Ctrl+C to stop.\n")

    if not args.no_browser:
        threading.Timer(1.0, webbrowser.open, args=(url,)).start()

    uvicorn.run(create_app(Path(args.data), WEB_DIR), host=args.host, port=port, log_level="warning")


if __name__ == "__main__":
    main()
