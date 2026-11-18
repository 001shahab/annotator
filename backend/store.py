"""Session state: labels, images and their boxes, persisted to disk.

Everything lives in one folder so a session survives a restart:

    data/
      session.json   labels, image records and annotations
      images/        normalised uploads and rendered PDF pages
      thumbs/        small previews for the image list

(c) 2026 - Prof. Shahab Anbarjafari
"""

from __future__ import annotations

import copy
import json
import math
import os
import re
import shutil
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .palette import next_color

_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
_MAX_LABEL_LENGTH = 60
_MIN_BOX_SIDE = 1.0


class StoreError(Exception):
    """A request that cannot be fulfilled; carries an HTTP status."""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def _clean_label_name(name: Any) -> str:
    cleaned = " ".join(str(name or "").split())[:_MAX_LABEL_LENGTH].strip()
    if not cleaned:
        raise StoreError("A label needs a name.")
    return cleaned


def _clean_color(color: Any) -> str:
    if not isinstance(color, str) or not _HEX_COLOR.match(color):
        raise StoreError("Colours must look like #RRGGBB.")
    return color.upper()


class Store:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.images_dir = self.root / "images"
        self.thumbs_dir = self.root / "thumbs"
        self.state_path = self.root / "session.json"
        self._lock = threading.RLock()
        self._reserved: set = set()
        self._ensure_dirs()
        self._state = self._load()

    # ------------------------------------------------------------------ disk

    def _ensure_dirs(self) -> None:
        self.images_dir.mkdir(parents=True, exist_ok=True)
        self.thumbs_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _blank() -> Dict[str, Any]:
        return {
            "version": 1,
            "next_image_id": 1,
            "next_label_id": 1,
            "labels": [],
            "images": [],
        }

    def _load(self) -> Dict[str, Any]:
        state = self._blank()
        if not self.state_path.is_file():
            return state
        try:
            loaded = json.loads(self.state_path.read_text(encoding="utf-8"))
            if not isinstance(loaded, dict):
                raise ValueError("session file is not an object")
            if not isinstance(loaded.get("labels", []), list):
                raise ValueError("labels is not a list")
            if not isinstance(loaded.get("images", []), list):
                raise ValueError("images is not a list")
            state.update(loaded)
            for image in state["images"]:
                image.setdefault("annotations", [])
            # Counters must stay ahead of every id already in use.
            state["next_image_id"] = max(
                [int(state.get("next_image_id", 1))] + [int(i["id"]) + 1 for i in state["images"]]
            )
            state["next_label_id"] = max(
                [int(state.get("next_label_id", 1))] + [int(l["id"]) + 1 for l in state["labels"]]
            )
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            # Never overwrite a session we could not read; set it aside instead.
            backup = self.root / "session.unreadable-{}.json".format(int(time.time()))
            try:
                os.replace(self.state_path, backup)
            except OSError:
                pass
            return self._blank()
        return state

    def _save(self) -> None:
        tmp = self.state_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(self._state, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, self.state_path)

    # ---------------------------------------------------------------- reading

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "labels": copy.deepcopy(self._state["labels"]),
                "images": copy.deepcopy(self._state["images"]),
            }

    def _image(self, image_id: int) -> Dict[str, Any]:
        for image in self._state["images"]:
            if image["id"] == image_id:
                return image
        raise StoreError("That image is no longer in the session.", 404)

    def _label(self, label_id: int) -> Dict[str, Any]:
        for label in self._state["labels"]:
            if label["id"] == label_id:
                return label
        raise StoreError("That label no longer exists.", 404)

    def get_image(self, image_id: int) -> Dict[str, Any]:
        with self._lock:
            return copy.deepcopy(self._image(image_id))

    def image_path(self, image_id: int) -> Path:
        with self._lock:
            return self.images_dir / self._image(image_id)["file_name"]

    def thumb_path(self, image_id: int) -> Path:
        with self._lock:
            return self.thumb_path_for(self._image(image_id)["file_name"])

    def thumb_path_for(self, file_name: str) -> Path:
        return self.thumbs_dir / (file_name + ".jpg")

    # ----------------------------------------------------------------- labels

    def add_label(self, name: Any, color: Optional[str] = None) -> Tuple[Dict[str, Any], bool]:
        """Create a label, or return the existing one with the same name."""
        cleaned = _clean_label_name(name)
        with self._lock:
            for label in self._state["labels"]:
                if label["name"].casefold() == cleaned.casefold():
                    return dict(label), False
            label = {
                "id": self._state["next_label_id"],
                "name": cleaned,
                "color": _clean_color(color)
                if color
                else next_color(l["color"] for l in self._state["labels"]),
            }
            self._state["next_label_id"] += 1
            self._state["labels"].append(label)
            self._save()
            return dict(label), True

    def update_label(
        self, label_id: int, name: Optional[str] = None, color: Optional[str] = None
    ) -> Dict[str, Any]:
        with self._lock:
            label = self._label(label_id)
            if name is not None:
                cleaned = _clean_label_name(name)
                for other in self._state["labels"]:
                    if other["id"] != label_id and other["name"].casefold() == cleaned.casefold():
                        raise StoreError('A label named "{}" already exists.'.format(other["name"]), 409)
                label["name"] = cleaned
            if color is not None:
                label["color"] = _clean_color(color)
            self._save()
            return dict(label)

    def delete_label(self, label_id: int) -> int:
        """Remove a label together with every box that uses it."""
        with self._lock:
            self._label(label_id)
            self._state["labels"] = [l for l in self._state["labels"] if l["id"] != label_id]
            removed = 0
            for image in self._state["images"]:
                kept = [a for a in image["annotations"] if a["label_id"] != label_id]
                removed += len(image["annotations"]) - len(kept)
                image["annotations"] = kept
            self._save()
            return removed

    # ----------------------------------------------------------------- images

    def reserve_file_name(self, stem: str, ext: str) -> str:
        """Pick a file name that is free on disk and in the session."""
        with self._lock:
            taken = {i["file_name"].casefold() for i in self._state["images"]}
            taken |= {name.casefold() for name in self._reserved}
            candidate = stem + ext
            counter = 2
            while candidate.casefold() in taken or (self.images_dir / candidate).exists():
                candidate = "{}-{}{}".format(stem, counter, ext)
                counter += 1
            self._reserved.add(candidate)
            return candidate

    def release_file_name(self, file_name: str) -> None:
        with self._lock:
            self._reserved.discard(file_name)

    def add_image(
        self,
        *,
        name: str,
        file_name: str,
        width: int,
        height: int,
        page: Optional[int] = None,
        pages: Optional[int] = None,
    ) -> Dict[str, Any]:
        with self._lock:
            image = {
                "id": self._state["next_image_id"],
                "name": name,
                "file_name": file_name,
                "width": int(width),
                "height": int(height),
                "page": page,
                "pages": pages,
                "annotations": [],
            }
            self._state["next_image_id"] += 1
            self._state["images"].append(image)
            self._reserved.discard(file_name)
            self._save()
            return copy.deepcopy(image)

    def delete_image(self, image_id: int) -> None:
        with self._lock:
            image = self._image(image_id)
            self._state["images"] = [i for i in self._state["images"] if i["id"] != image_id]
            self._save()
            for path in (self.images_dir / image["file_name"], self.thumb_path_for(image["file_name"])):
                try:
                    path.unlink()
                except OSError:
                    pass

    # ------------------------------------------------------------ annotations

    def set_annotations(self, image_id: int, annotations: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Replace every box on an image. Boxes are clamped to the image."""
        with self._lock:
            image = self._image(image_id)
            width, height = float(image["width"]), float(image["height"])
            valid_labels = {l["id"] for l in self._state["labels"]}
            cleaned: List[Dict[str, Any]] = []
            seen: set = set()
            for raw in annotations:
                if raw.get("label_id") not in valid_labels:
                    continue
                try:
                    x, y = float(raw["x"]), float(raw["y"])
                    w, h = float(raw["w"]), float(raw["h"])
                except (KeyError, TypeError, ValueError):
                    continue
                if not all(math.isfinite(v) for v in (x, y, w, h)):
                    continue
                x1, y1 = min(max(x, 0.0), width), min(max(y, 0.0), height)
                x2, y2 = min(max(x + w, 0.0), width), min(max(y + h, 0.0), height)
                if x2 - x1 < _MIN_BOX_SIDE or y2 - y1 < _MIN_BOX_SIDE:
                    continue
                box_id = str(raw.get("id") or "")[:64]
                if not box_id or box_id in seen:
                    box_id = uuid.uuid4().hex
                seen.add(box_id)
                cleaned.append(
                    {
                        "id": box_id,
                        "label_id": raw["label_id"],
                        "x": round(x1, 2),
                        "y": round(y1, 2),
                        "w": round(x2 - x1, 2),
                        "h": round(y2 - y1, 2),
                    }
                )
            image["annotations"] = cleaned
            self._save()
            return copy.deepcopy(cleaned)

    # ------------------------------------------------------------------ reset

    def reset(self, keep_labels: bool = True) -> None:
        """Start a new session. Ids keep counting so nothing is ever reused."""
        with self._lock:
            self._state["images"] = []
            if not keep_labels:
                self._state["labels"] = []
            self._reserved.clear()
            for folder in (self.images_dir, self.thumbs_dir):
                shutil.rmtree(folder, ignore_errors=True)
            self._ensure_dirs()
            self._save()
