"""Smart tools: annotation assists built on classical computer vision.

No neural network, no weights to download, no GPU. Everything here runs in
a fraction of a second on a laptop:

    snap_box         tighten a rough box around the object inside it (GrabCut)
    click_box        one click -> a box around the region under the cursor
    find_similar     find look-alikes of a box on the same image (template matching)
    propose_regions  suggest boxes: text blocks on pages, salient shapes on photos

All boxes are (x, y, w, h) in pixels of the full-size image.

(c) 2026 - Prof. Shahab Anbarjafari
"""

from __future__ import annotations

import math
import threading
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

Box = Tuple[float, float, float, float]
IntBox = Tuple[int, int, int, int]


class SmartError(Exception):
    """The image could not be analysed."""


# ------------------------------------------------------------------ image I/O

_CACHE_SIZE = 3
_cache: Dict[str, Tuple[float, np.ndarray]] = {}
_cache_lock = threading.Lock()


def load_image(path: Path) -> np.ndarray:
    """Read an image as BGR, keeping the last few in memory.

    Annotators run several tools in a row on the same image, so a tiny cache
    makes every call after the first one feel instant.
    """
    key = str(path)
    try:
        stamp = Path(path).stat().st_mtime
    except OSError as exc:
        raise SmartError("The image file is missing.") from exc
    with _cache_lock:
        hit = _cache.get(key)
        if hit is not None and hit[0] == stamp:
            return hit[1]
    # fromfile + imdecode copes with non-ASCII paths on every platform.
    image = cv2.imdecode(np.fromfile(key, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise SmartError("The image could not be read.")
    with _cache_lock:
        _cache.pop(key, None)
        _cache[key] = (stamp, image)
        while len(_cache) > _CACHE_SIZE:
            _cache.pop(next(iter(_cache)))
    return image


# ------------------------------------------------------------------- geometry


def _clip_box(box: Sequence[float], width: int, height: int) -> Box:
    x, y, w, h = (float(v) for v in box)
    x1, y1 = min(max(x, 0.0), float(width)), min(max(y, 0.0), float(height))
    x2, y2 = min(max(x + w, 0.0), float(width)), min(max(y + h, 0.0), float(height))
    return (round(x1, 2), round(y1, 2), round(max(0.0, x2 - x1), 2), round(max(0.0, y2 - y1), 2))


def _iou(a: Sequence[float], b: Sequence[float]) -> float:
    ix = max(0.0, min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = a[2] * a[3] + b[2] * b[3] - inter
    return inter / union if union > 0 else 0.0


def _downscale(image: np.ndarray, max_side: float) -> Tuple[np.ndarray, float]:
    height, width = image.shape[:2]
    scale = min(1.0, float(max_side) / float(max(height, width)))
    if scale >= 1.0:
        return image, 1.0
    size = (max(1, int(round(width * scale))), max(1, int(round(height * scale))))
    return cv2.resize(image, size, interpolation=cv2.INTER_AREA), scale


def _upscale_box(box: Sequence[float], scale: float, width: int, height: int) -> Box:
    return _clip_box([v / scale for v in box], width, height)


def _foreground_bounds(mask: np.ndarray) -> Optional[IntBox]:
    """Bounding box of the meaningful blobs in a 0/1 mask (ignores specks)."""
    count, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if count <= 1:
        return None
    blobs = stats[1:]
    areas = blobs[:, cv2.CC_STAT_AREA]
    keep = blobs[areas >= max(3.0, 0.05 * float(areas.max()))]
    if len(keep) == 0:
        return None
    left = int(keep[:, cv2.CC_STAT_LEFT].min())
    top = int(keep[:, cv2.CC_STAT_TOP].min())
    right = int((keep[:, cv2.CC_STAT_LEFT] + keep[:, cv2.CC_STAT_WIDTH]).max())
    bottom = int((keep[:, cv2.CC_STAT_TOP] + keep[:, cv2.CC_STAT_HEIGHT]).max())
    return (left, top, right - left, bottom - top)


# ----------------------------------------------------------------------- snap


def _grabcut_bounds(image: np.ndarray, rect: IntBox) -> Optional[IntBox]:
    height, width = image.shape[:2]
    rx, ry, rw, rh = rect
    if rw * rh >= 0.97 * width * height:
        return None  # no surrounding background to learn from
    mask = np.zeros((height, width), np.uint8)
    background = np.zeros((1, 65), np.float64)
    foreground = np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(image, mask, (rx, ry, rw, rh), background, foreground, 4, cv2.GC_INIT_WITH_RECT)
    except cv2.error:
        return None
    object_mask = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8)
    if int(object_mask.sum()) < max(12.0, 0.03 * rw * rh):
        return None
    return _foreground_bounds(object_mask)


def _trim_bounds(image: np.ndarray, rect: IntBox) -> Optional[IntBox]:
    """Fallback: trim the margin that looks like the box's own border colour."""
    rx, ry, rw, rh = rect
    region = image[ry : ry + rh, rx : rx + rw].astype(np.int16)
    if region.shape[0] < 4 or region.shape[1] < 4:
        return None
    border = np.concatenate([region[0], region[-1], region[:, 0], region[:, -1]], axis=0)
    backdrop = np.median(border, axis=0)
    content = (np.abs(region - backdrop).max(axis=2) > 30).astype(np.uint8)
    share = float(content.mean())
    if share < 0.01 or share > 0.97:
        return None
    bounds = _foreground_bounds(content)
    if bounds is None:
        return None
    return (rx + bounds[0], ry + bounds[1], bounds[2], bounds[3])


def snap_box(image: np.ndarray, box: Sequence[float]) -> Optional[Box]:
    """Shrink a rough box so it hugs the object inside it.

    Returns None when there is nothing better than the box that was given.
    """
    height, width = image.shape[:2]
    x, y, w, h = _clip_box(box, width, height)
    if w < 6 or h < 6:
        return None

    # Work on the box plus a margin: the margin is what GrabCut treats as
    # certain background.
    margin_x, margin_y = max(6.0, w * 0.18), max(6.0, h * 0.18)
    left, top = int(max(0, math.floor(x - margin_x))), int(max(0, math.floor(y - margin_y)))
    right = int(min(width, math.ceil(x + w + margin_x)))
    bottom = int(min(height, math.ceil(y + h + margin_y)))
    crop, scale = _downscale(np.ascontiguousarray(image[top:bottom, left:right]), 420)
    crop_h, crop_w = crop.shape[:2]
    if crop_h < 6 or crop_w < 6:
        return None

    rx = min(max(int(round((x - left) * scale)), 0), crop_w - 2)
    ry = min(max(int(round((y - top) * scale)), 0), crop_h - 2)
    rw = max(2, min(int(round(w * scale)), crop_w - rx))
    rh = max(2, min(int(round(h * scale)), crop_h - ry))
    rect = (rx, ry, rw, rh)

    tight = _grabcut_bounds(crop, rect) or _trim_bounds(crop, rect)
    if tight is None:
        return None

    snapped = _clip_box(
        (left + tight[0] / scale, top + tight[1] / scale, tight[2] / scale, tight[3] / scale),
        width,
        height,
    )
    if snapped[2] < 3 or snapped[3] < 3:
        return None
    if snapped[2] * snapped[3] < 0.04 * w * h:
        return None  # collapsed onto a speck: trust the human instead
    return snapped


# ------------------------------------------------------------ document layout


def _looks_like_document(image: np.ndarray) -> bool:
    """True for scans and PDF pages: one light tone dominates the picture."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    histogram = np.bincount(gray.ravel(), minlength=256)
    mode = int(histogram.argmax())
    share = float(histogram[max(0, mode - 10) : min(255, mode + 10) + 1].sum()) / float(gray.size)
    return mode >= 180 and share >= 0.5


def _document_blocks(image: np.ndarray) -> List[IntBox]:
    """Paragraphs, headings, figures and tables on a page.

    Ink is smeared just far enough to join letters into lines and lines into
    blocks, while the wider gaps between blocks stay open.
    """
    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, ink = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
    kernel_w = max(3, int(round(width * 0.022)))
    kernel_h = max(3, int(round(height * 0.011)))
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_w, kernel_h))
    smeared = cv2.dilate(ink, kernel, iterations=1)
    count, _, stats, _ = cv2.connectedComponentsWithStats(smeared, connectivity=8)

    page_area = float(width * height)
    blocks: List[IntBox] = []
    for index in range(1, count):
        x, y, w, h = (int(v) for v in stats[index, :4])
        # Shrink back onto the real ink inside the smeared blob.
        bx, by, bw, bh = cv2.boundingRect(np.ascontiguousarray(ink[y : y + h, x : x + w]))
        if bw < 4 or bh < 4:
            continue
        area = float(bw * bh)
        if area < 0.0006 * page_area or area > 0.9 * page_area:
            continue
        blocks.append((x + bx, y + by, bw, bh))
    blocks.sort(key=lambda b: (b[1], b[0]))
    return blocks


def _photo_proposals(image: np.ndarray) -> List[IntBox]:
    """Closed shapes with strong outlines on a photo."""
    height, width = image.shape[:2]
    gray = cv2.GaussianBlur(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), (5, 5), 0)
    median = float(np.median(gray))
    low, high = int(max(10.0, 0.66 * median)), int(min(250.0, 1.33 * median))
    if high - low < 30:
        low, high = 40, 120
    edges = cv2.Canny(gray, low, high)
    size = max(3, int(round(max(height, width) * 0.012)))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)
    contours = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[-2]

    image_area = float(width * height)
    candidates: List[IntBox] = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if w < 12 or h < 12:
            continue
        area = float(w * h)
        if area < 0.004 * image_area or area > 0.7 * image_area:
            continue
        candidates.append((int(x), int(y), int(w), int(h)))

    candidates.sort(key=lambda b: b[2] * b[3], reverse=True)
    kept: List[IntBox] = []
    for candidate in candidates:
        if all(_iou(candidate, other) < 0.7 for other in kept):
            kept.append(candidate)
        if len(kept) >= 24:
            break
    kept.sort(key=lambda b: (b[1], b[0]))
    return kept


def propose_regions(image: np.ndarray, exclude: Sequence[Sequence[float]] = ()) -> List[Box]:
    """Suggest boxes for the whole image, skipping what is already annotated."""
    height, width = image.shape[:2]
    small, scale = _downscale(image, 900)
    found = _document_blocks(small) if _looks_like_document(small) else _photo_proposals(small)
    boxes = [_upscale_box(b, scale, width, height) for b in found]
    boxes = [b for b in boxes if b[2] >= 2 and b[3] >= 2 and all(_iou(b, e) < 0.5 for e in exclude)]
    return boxes[:80]


# ---------------------------------------------------------------- magic click


def _flood_region(image: np.ndarray, sx: int, sy: int) -> Optional[IntBox]:
    """Grow a region of similar colour from the clicked pixel.

    The tolerance is raised step by step and we stop just before the region
    "leaks" into its surroundings (a sudden jump in size).
    """
    height, width = image.shape[:2]
    lab = cv2.cvtColor(cv2.GaussianBlur(image, (5, 5), 0), cv2.COLOR_BGR2LAB)
    total = float(height * width)
    flags = 4 | cv2.FLOODFILL_FIXED_RANGE | cv2.FLOODFILL_MASK_ONLY | (255 << 8)

    best: Optional[IntBox] = None
    previous_area = 0.0
    for tolerance in (5, 8, 12, 16, 21, 27, 34):
        mask = np.zeros((height + 2, width + 2), np.uint8)
        # Lightness varies more than hue across one object (shading), so it
        # gets a wider band than the two colour channels.
        band = (int(tolerance * 1.6), tolerance, tolerance)
        cv2.floodFill(lab, mask, (sx, sy), (0, 0, 0), band, band, flags)
        region = np.ascontiguousarray(mask[1:-1, 1:-1])
        area = float(cv2.countNonZero(region))
        if area > 0.55 * total:
            break  # this is background, not an object
        if best is not None and previous_area >= 0.002 * total and area > 3.0 * previous_area:
            break  # leaked
        best = tuple(int(v) for v in cv2.boundingRect(region))  # type: ignore[assignment]
        previous_area = area

    if best is None or best[2] < 4 or best[3] < 4:
        return None
    return best


def click_box(image: np.ndarray, x: float, y: float) -> Optional[Box]:
    """Return a box around whatever sits under the point (x, y), if anything."""
    height, width = image.shape[:2]
    if not (0 <= x < width and 0 <= y < height):
        return None
    small, scale = _downscale(image, 900)
    small_h, small_w = small.shape[:2]
    sx = min(small_w - 1, max(0, int(x * scale)))
    sy = min(small_h - 1, max(0, int(y * scale)))

    if _looks_like_document(small):
        under = [
            b for b in _document_blocks(small) if b[0] <= sx < b[0] + b[2] and b[1] <= sy < b[1] + b[3]
        ]
        if under:
            return _upscale_box(min(under, key=lambda b: b[2] * b[3]), scale, width, height)

    region = _flood_region(small, sx, sy)
    if region is None:
        return None
    return _upscale_box(region, scale, width, height)


# --------------------------------------------------------------- find similar


def find_similar(
    image: np.ndarray,
    box: Sequence[float],
    exclude: Sequence[Sequence[float]] = (),
    threshold: float = 0.62,
    limit: int = 60,
) -> List[Box]:
    """Find other places on the image that look like the given box."""
    height, width = image.shape[:2]
    x, y, w, h = _clip_box(box, width, height)
    if w < 4 or h < 4:
        return []

    # Search on a reduced copy for speed, but never shrink the template so far
    # that it loses its detail.
    longest = float(max(height, width))
    scale = min(1.0, 1100.0 / longest)
    if min(w, h) * scale < 10.0:
        scale = min(1.0, max(scale, min(10.0 / min(w, h), 2400.0 / longest)))
    if scale < 1.0:
        size = (max(1, int(round(width * scale))), max(1, int(round(height * scale))))
        small = cv2.resize(image, size, interpolation=cv2.INTER_AREA)
    else:
        small = image
    small_h, small_w = small.shape[:2]

    tw, th = max(2, int(round(w * scale))), max(2, int(round(h * scale)))
    if tw >= small_w or th >= small_h:
        return []
    tx = min(max(int(round(x * scale)), 0), small_w - tw)
    ty = min(max(int(round(y * scale)), 0), small_h - th)
    template = np.ascontiguousarray(small[ty : ty + th, tx : tx + tw])
    if float(template.std()) < 4.0:
        return []  # a flat patch matches everywhere and nowhere

    scores = cv2.matchTemplate(small, template, cv2.TM_CCOEFF_NORMED)
    scores = np.nan_to_num(scores, nan=-1.0, posinf=-1.0, neginf=-1.0)

    source = (x, y, w, h)
    taken = [source] + [tuple(float(v) for v in e) for e in exclude]
    matches: List[Box] = []
    for _ in range(limit * 4):
        _, score, _, (px, py) = cv2.minMaxLoc(scores)
        if score < threshold:
            break
        # Blank out this peak so the next pass finds a different one.
        scores[
            max(0, py - th // 2) : min(scores.shape[0], py + th // 2 + 1),
            max(0, px - tw // 2) : min(scores.shape[1], px + tw // 2 + 1),
        ] = -1.0
        candidate = _clip_box((px / scale, py / scale, w, h), width, height)
        if candidate[2] < 2 or candidate[3] < 2:
            continue
        if any(_iou(candidate, other) > 0.3 for other in taken):
            continue
        matches.append(candidate)
        taken.append(candidate)
        if len(matches) >= limit:
            break
    matches.sort(key=lambda b: (b[1], b[0]))
    return matches
