"""HTTP API and static hosting for Annotator.

(c) 2026 - Prof. Shahab Anbarjafari
"""

import json
import os
import tempfile
import zipfile
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

from . import coco, ingest
from .store import Store, StoreError

try:  # The smart tools need OpenCV; everything else works without it.
    from . import smart
except Exception:  # pragma: no cover - depends on the environment
    smart = None


# ------------------------------------------------------------------ payloads


class BoxModel(BaseModel):
    x: float
    y: float
    w: float
    h: float


class AnnotationModel(BoxModel):
    id: Optional[str] = None
    label_id: int


class AnnotationsBody(BaseModel):
    annotations: List[AnnotationModel] = Field(default_factory=list)


class LabelCreate(BaseModel):
    name: str
    color: Optional[str] = None


class LabelUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


class ResetBody(BaseModel):
    keep_labels: bool = True


class SnapBody(BaseModel):
    image_id: int
    box: BoxModel


class ClickBody(BaseModel):
    image_id: int
    x: float
    y: float


class SimilarBody(BaseModel):
    image_id: int
    box: BoxModel
    exclude: List[BoxModel] = Field(default_factory=list)


class ProposeBody(BaseModel):
    image_id: int
    exclude: List[BoxModel] = Field(default_factory=list)


def _dump(model: BaseModel) -> dict:
    return model.model_dump() if hasattr(model, "model_dump") else model.dict()


def _box_tuple(box: BoxModel) -> tuple:
    return (box.x, box.y, box.w, box.h)


def _box_dict(box) -> dict:
    return {"x": float(box[0]), "y": float(box[1]), "w": float(box[2]), "h": float(box[3])}


_MISSING_FRONTEND = """<!doctype html>
<meta charset="utf-8">
<title>Annotator</title>
<body style="font: 16px/1.6 -apple-system, system-ui, sans-serif; max-width: 34rem; margin: 18vh auto; color: #1d1d1f">
<h1 style="font-weight: 600">Annotator</h1>
<p>The interface has not been built yet. From the project folder run:</p>
<pre style="background: #f5f5f7; padding: 1rem; border-radius: 10px">cd frontend
npm install
npm run build</pre>
<p>then start <code>python app.py</code> again.</p>
</body>
"""


# ----------------------------------------------------------------------- app


def create_app(data_dir: Path, web_dir: Path) -> FastAPI:
    store = Store(Path(data_dir))
    web_dir = Path(web_dir)
    app = FastAPI(title="Annotator", docs_url=None, redoc_url=None, openapi_url=None)

    @app.exception_handler(StoreError)
    async def _on_store_error(_request, exc: StoreError):
        return JSONResponse({"detail": exc.message}, status_code=exc.status)

    # ------------------------------------------------------------- session

    @app.get("/api/state")
    def get_state():
        state = store.snapshot()
        state["capabilities"] = {"smart": smart is not None, "pdf": ingest.PDF_AVAILABLE}
        return state

    @app.post("/api/reset")
    def reset(body: ResetBody):
        store.reset(keep_labels=body.keep_labels)
        return {"ok": True}

    # -------------------------------------------------------------- images

    @app.post("/api/upload")
    def upload(files: List[UploadFile] = File(...)):
        added, errors = [], []
        for item in files:
            name = item.filename or "untitled"
            try:
                records, warnings = ingest.ingest_file(store, name, item.file.read())
                added.extend(records)
                errors.extend({"file": name, "error": warning} for warning in warnings)
            except ingest.IngestError as exc:
                errors.append({"file": name, "error": str(exc)})
            except OSError as exc:
                errors.append({"file": name, "error": "Could not be saved: {}".format(exc)})
            finally:
                item.file.close()
        return {"images": added, "errors": errors}

    @app.get("/api/images/{image_id}/file")
    def image_file(image_id: int):
        path = store.image_path(image_id)
        if not path.is_file():
            raise HTTPException(404, "The image file is missing.")
        return FileResponse(path)

    @app.get("/api/images/{image_id}/thumb")
    def image_thumb(image_id: int):
        path = store.thumb_path(image_id)
        if not path.is_file():
            path = store.image_path(image_id)
        if not path.is_file():
            raise HTTPException(404, "The image file is missing.")
        return FileResponse(path)

    @app.delete("/api/images/{image_id}")
    def delete_image(image_id: int):
        store.delete_image(image_id)
        return {"ok": True}

    @app.put("/api/images/{image_id}/annotations")
    def put_annotations(image_id: int, body: AnnotationsBody):
        saved = store.set_annotations(image_id, [_dump(a) for a in body.annotations])
        return {"ok": True, "count": len(saved)}

    # -------------------------------------------------------------- labels

    @app.post("/api/labels")
    def create_label(body: LabelCreate):
        label, created = store.add_label(body.name, body.color)
        return {"label": label, "created": created}

    @app.patch("/api/labels/{label_id}")
    def update_label(label_id: int, body: LabelUpdate):
        return {"label": store.update_label(label_id, name=body.name, color=body.color)}

    @app.delete("/api/labels/{label_id}")
    def delete_label(label_id: int):
        return {"removed_annotations": store.delete_label(label_id)}

    # --------------------------------------------------------- smart tools

    def _load_for_smart(image_id: int):
        if smart is None:
            raise HTTPException(
                501, "Smart tools need OpenCV. Install it with: pip install opencv-python-headless numpy"
            )
        try:
            return smart.load_image(store.image_path(image_id))
        except smart.SmartError as exc:
            raise HTTPException(422, str(exc))

    def _run_smart(tool, *args):
        """Smart tools are helpers: a failure must never break annotating."""
        try:
            return tool(*args)
        except Exception as exc:
            raise HTTPException(422, "This image could not be analysed ({}).".format(type(exc).__name__))

    @app.post("/api/smart/snap")
    def smart_snap(body: SnapBody):
        image = _load_for_smart(body.image_id)
        snapped = _run_smart(smart.snap_box, image, _box_tuple(body.box))
        return {"box": _box_dict(snapped) if snapped else None}

    @app.post("/api/smart/click")
    def smart_click(body: ClickBody):
        image = _load_for_smart(body.image_id)
        found = _run_smart(smart.click_box, image, body.x, body.y)
        return {"box": _box_dict(found) if found else None}

    @app.post("/api/smart/similar")
    def smart_similar(body: SimilarBody):
        image = _load_for_smart(body.image_id)
        exclude = [_box_tuple(b) for b in body.exclude]
        boxes = _run_smart(smart.find_similar, image, _box_tuple(body.box), exclude)
        return {"boxes": [_box_dict(b) for b in boxes]}

    @app.post("/api/smart/propose")
    def smart_propose(body: ProposeBody):
        image = _load_for_smart(body.image_id)
        boxes = _run_smart(smart.propose_regions, image, [_box_tuple(b) for b in body.exclude])
        return {"boxes": [_box_dict(b) for b in boxes]}

    # -------------------------------------------------------------- export

    @app.get("/api/export/coco")
    def export_coco():
        document = coco.build_coco(store.snapshot())
        return Response(
            json.dumps(document, indent=2, ensure_ascii=False),
            media_type="application/json",
            headers={"Content-Disposition": 'attachment; filename="annotations_coco.json"'},
        )

    @app.get("/api/export/coco.zip")
    def export_coco_zip():
        """A ready-to-train dataset: annotations.json plus an images/ folder."""
        state = store.snapshot()
        document = coco.build_coco(state)
        handle, tmp_name = tempfile.mkstemp(prefix="annotator-", suffix=".zip")
        os.close(handle)
        try:
            # Images are already compressed, so they are stored as they are.
            with zipfile.ZipFile(tmp_name, "w", zipfile.ZIP_STORED) as archive:
                archive.writestr(
                    "annotations.json",
                    json.dumps(document, indent=2, ensure_ascii=False),
                    compress_type=zipfile.ZIP_DEFLATED,
                )
                for image in state["images"]:
                    path = store.images_dir / image["file_name"]
                    if path.is_file():
                        archive.write(path, "images/" + image["file_name"])
        except Exception:
            os.unlink(tmp_name)
            raise
        return FileResponse(
            tmp_name,
            media_type="application/zip",
            filename="annotations_coco.zip",
            background=BackgroundTask(os.unlink, tmp_name),
        )

    # ----------------------------------------------------------- interface

    if (web_dir / "index.html").is_file():
        # Registered last so the API routes above always win.
        app.mount("/", StaticFiles(directory=str(web_dir), html=True), name="web")
    else:

        @app.get("/")
        def missing_frontend():
            return HTMLResponse(_MISSING_FRONTEND)

    return app
