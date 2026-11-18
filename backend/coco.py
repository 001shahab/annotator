"""COCO object-detection export.

Produces the standard layout:

    {"info", "licenses", "images", "annotations", "categories"}

with boxes as [x, y, width, height] in pixels, measured from the top-left
corner of the image.

(c) 2026 - Prof. Shahab Anbarjafari
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List


def build_coco(state: Dict[str, Any]) -> Dict[str, Any]:
    """Turn a session snapshot into a COCO dictionary.

    Ids are renumbered 1..N so the file is contiguous even after labels or
    images were deleted during the session. Images without boxes are kept:
    they are valid negatives.
    """
    now = datetime.now()

    category_ids: Dict[int, int] = {}
    categories: List[Dict[str, Any]] = []
    for index, label in enumerate(state.get("labels", []), start=1):
        category_ids[label["id"]] = index
        categories.append({"id": index, "name": label["name"], "supercategory": "none"})

    images: List[Dict[str, Any]] = []
    annotations: List[Dict[str, Any]] = []
    for image_index, image in enumerate(state.get("images", []), start=1):
        images.append(
            {
                "id": image_index,
                "file_name": image["file_name"],
                "width": int(image["width"]),
                "height": int(image["height"]),
            }
        )
        for box in image.get("annotations", []):
            category_id = category_ids.get(box["label_id"])
            if category_id is None:
                continue
            x, y = round(float(box["x"]), 2), round(float(box["y"]), 2)
            w, h = round(float(box["w"]), 2), round(float(box["h"]), 2)
            annotations.append(
                {
                    "id": len(annotations) + 1,
                    "image_id": image_index,
                    "category_id": category_id,
                    "bbox": [x, y, w, h],
                    "area": round(w * h, 2),
                    "iscrowd": 0,
                    "segmentation": [],
                }
            )

    return {
        "info": {
            "description": "Annotator export",
            "version": "1.0",
            "year": now.year,
            "date_created": now.strftime("%Y-%m-%d %H:%M:%S"),
        },
        "licenses": [],
        "images": images,
        "annotations": annotations,
        "categories": categories,
    }
