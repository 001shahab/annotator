"""Turn uploads into annotatable images.

Images are normalised so that what the annotator sees is exactly what the
exported COCO file describes: EXIF rotation is baked into the pixels and
exotic formats become PNG. Each PDF page becomes one PNG image.

(c) 2026 - Prof. Shahab Anbarjafari
"""

from __future__ import annotations

import io
import re
from pathlib import Path
from typing import Any, Dict, List, Tuple

from PIL import Image, ImageOps

from .store import Store

try:  # PDF support is optional at runtime; the app still works without it.
    import pypdfium2 as pdfium

    PDF_AVAILABLE = True
except Exception:  # pragma: no cover - depends on the environment
    pdfium = None
    PDF_AVAILABLE = False

PDF_DPI = 150.0
PDF_MAX_SIDE = 3200.0
THUMB_SIDE = 360
_EXIF_ORIENTATION = 0x0112


class IngestError(Exception):
    """An upload that could not be turned into an image."""


def _safe_stem(filename: str) -> str:
    base = Path(str(filename).replace("\\", "/")).name
    stem = re.sub(r"[^\w.\-]+", "_", Path(base).stem).strip("._")
    return stem[:80] or "image"


def _display_name(filename: str) -> str:
    return Path(str(filename).replace("\\", "/")).name or "untitled"


def _to_rgb(image: Image.Image) -> Image.Image:
    """Flatten any mode to RGB, placing transparency on white."""
    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        rgba = image.convert("RGBA")
        flat = Image.new("RGB", rgba.size, (255, 255, 255))
        flat.paste(rgba, mask=rgba.split()[-1])
        return flat
    return image.convert("RGB")


def _write_thumb(image: Image.Image, path: Path) -> None:
    thumb = _to_rgb(image)
    thumb.thumbnail((THUMB_SIDE, THUMB_SIDE))
    thumb.save(path, "JPEG", quality=82)


def _store_image(
    store: Store,
    *,
    stem: str,
    ext: str,
    payload: bytes,
    preview: Image.Image,
    name: str,
    page: Any = None,
    pages: Any = None,
) -> Dict[str, Any]:
    file_name = store.reserve_file_name(stem, ext)
    image_path = store.images_dir / file_name
    try:
        image_path.write_bytes(payload)
        try:
            _write_thumb(preview, store.thumb_path_for(file_name))
        except Exception:
            pass  # a missing thumbnail falls back to the full image
        return store.add_image(
            name=name,
            file_name=file_name,
            width=preview.size[0],
            height=preview.size[1],
            page=page,
            pages=pages,
        )
    except Exception:
        store.release_file_name(file_name)
        try:
            image_path.unlink()
        except OSError:
            pass
        raise


def _ingest_image(store: Store, filename: str, data: bytes) -> List[Dict[str, Any]]:
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Exception as exc:
        raise IngestError("Not a supported image or PDF.") from exc

    fmt = (image.format or "").upper()
    try:
        orientation = image.getexif().get(_EXIF_ORIENTATION, 1) or 1
    except Exception:
        orientation = 1

    untouched = orientation == 1 and (
        (fmt == "JPEG" and image.mode in ("RGB", "L"))
        or (fmt == "PNG" and image.mode in ("RGB", "RGBA", "L", "LA", "P"))
    )
    if untouched:
        # Already browser- and COCO-friendly: keep the original bytes.
        final = image
        payload = data
        ext = ".jpg" if fmt == "JPEG" else ".png"
    else:
        try:
            final = _to_rgb(ImageOps.exif_transpose(image))
            buffer = io.BytesIO()
            if fmt in ("JPEG", "MPO"):
                final.save(buffer, "JPEG", quality=95, subsampling=0)
                ext = ".jpg"
            else:
                final.save(buffer, "PNG", compress_level=4)
                ext = ".png"
            payload = buffer.getvalue()
        except Exception as exc:
            raise IngestError("This image could not be converted.") from exc

    record = _store_image(
        store,
        stem=_safe_stem(filename),
        ext=ext,
        payload=payload,
        preview=final,
        name=_display_name(filename),
    )
    return [record]


def _ingest_pdf(store: Store, filename: str, data: bytes) -> Tuple[List[Dict[str, Any]], List[str]]:
    if not PDF_AVAILABLE:
        raise IngestError("PDF support needs the pypdfium2 package (pip install pypdfium2).")
    try:
        document = pdfium.PdfDocument(data)
    except Exception as exc:
        raise IngestError("This PDF could not be opened. It may be encrypted or damaged.") from exc

    stem = _safe_stem(filename)
    name = _display_name(filename)
    records: List[Dict[str, Any]] = []
    skipped: List[int] = []
    try:
        total = len(document)
        if total == 0:
            raise IngestError("This PDF has no pages.")
        digits = max(3, len(str(total)))
        for index in range(total):
            try:
                page = document[index]
                try:
                    width_pt, height_pt = page.get_size()
                    scale = min(PDF_DPI / 72.0, PDF_MAX_SIDE / max(width_pt, height_pt, 1.0))
                    # convert() copies the pixels, so the page can be released.
                    rendered = page.render(scale=scale).to_pil().convert("RGB")
                finally:
                    page.close()
                buffer = io.BytesIO()
                rendered.save(buffer, "PNG", compress_level=4)
                records.append(
                    _store_image(
                        store,
                        stem="{}_p{:0{}d}".format(stem, index + 1, digits),
                        ext=".png",
                        payload=buffer.getvalue(),
                        preview=rendered,
                        name=name,
                        page=index + 1,
                        pages=total,
                    )
                )
            except Exception:
                skipped.append(index + 1)
    finally:
        document.close()

    if not records:
        raise IngestError("No page of this PDF could be rendered.")
    warnings = []
    if skipped:
        warnings.append(
            "Skipped {} page(s) that could not be rendered: {}.".format(
                len(skipped), ", ".join(str(n) for n in skipped[:12]) + ("…" if len(skipped) > 12 else "")
            )
        )
    return records, warnings


def ingest_file(store: Store, filename: str, data: bytes) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Add one uploaded file to the session.

    Returns the new image records and any warnings worth showing the user.
    Raises IngestError when nothing could be added.
    """
    if not data:
        raise IngestError("This file is empty.")
    is_pdf = data[:1024].lstrip().startswith(b"%PDF") or str(filename).lower().endswith(".pdf")
    if is_pdf:
        return _ingest_pdf(store, filename, data)
    return _ingest_image(store, filename, data), []
