# Annotator

Draw a box. Name it. Next.

A fast, quiet bounding-box annotation tool for images and PDFs. It runs on your
own machine, saves as you work, and exports standard COCO.

## Start

```bash
pip install -r requirements.txt
python app.py
```

Your browser opens at `http://127.0.0.1:8000`. That is all: the interface is
already built and shipped in `frontend/dist`, so Node.js is not needed.

Options: `python app.py --port 9000 --data ./my-session --no-browser`
(`--host 0.0.0.0` makes it reachable from other machines on your network).

## How it works

1. **Add files.** Drop images or PDFs anywhere in the window. Every PDF page
   becomes one image.
2. **Draw.** Drag on the image. A small label list opens next to the new box
   with the label you used last already ticked: press Enter to keep it, click
   or press `1`–`9` for another one, or type a new name to create a label on
   the spot.
3. **Export.** `Export → COCO JSON`, or `COCO dataset (.zip)` for the
   annotations together with all images.

There is no save button. Every change is written to the session folder
(`./data`) a moment after you make it, and the session is still there when you
come back.

### Labels

- Define labels up front on the welcome screen (`car, person, bike` adds
  three), or create them at any time from the right panel or the picker.
- Each label gets its own colour, used for its boxes everywhere. Click the
  colour swatch to change it; double-click a name to rename it.
- To change a box's label, select the box and click a label in the panel or
  press `1`–`9`. Enter, `L` or a double-click opens the label list instead.
- Annotating a long run of one class? Switch off **Ask for a label on every
  new box**: new boxes then reuse the last label without asking, and `1`–`9`
  switches the label you draw with.
- Show or hide any label with its eye icon (Alt-click shows only that one),
  or use **Show all** / **Hide all**. `H` hides every box for a clean look at
  the image and brings them back exactly as they were.

### Smart tools

Small, classical computer-vision helpers (GrabCut, template matching, flood
fill, morphology). No language model, no neural network, no weights to
download, no GPU.

| Tool | Key | What it does |
| --- | --- | --- |
| Magic | `M` | Click an object to box it, or drag a rough box and it tightens itself. On pages, a click boxes the paragraph, figure or table under the pointer. |
| Snap | `S` | Shrinks the selected box so it hugs the object inside it. |
| Find similar | `F` | Finds look-alikes of the selected box on the same image and offers them with the same label. |
| Suggest | `G` | Proposes boxes for the whole image: text blocks on documents, salient shapes on photos. |
| Copy previous | `P` | Copies the boxes of the previous image. Handy for forms and video frames. |

Suggestions appear as dashed boxes: click one to keep it, `Enter` keeps them
all, `Esc` dismisses them. These tools are assistants, not oracles; every
result can be adjusted or undone.

### Keyboard

| Keys | Action |
| --- | --- |
| Drag | Draw a box |
| Click | Select a box (click again for the one beneath) |
| Drag a box / its edge | Move / resize |
| Arrow keys | Nudge the selected box 1 px (Shift: 10 px) |
| `Delete` | Remove the selected box |
| `1`–`9` | Set the label of the selected box (and for new boxes) |
| `Enter` or `L`, or double-click | Open the label list for a box |
| `Tab` | Select the next box |
| `Cmd/Ctrl+Z`, `Shift+Cmd/Ctrl+Z` | Undo, redo |
| `D` / `A` (or `→` / `←`) | Next / previous image |
| Scroll, Space + drag | Pan |
| Pinch, or `Cmd/Ctrl` + scroll | Zoom |
| `+` `-` `0` | Zoom in, out, fit |
| `?` | Show all shortcuts |

## Export format

Standard COCO object detection:

```json
{
  "info": { "description": "Annotator export", "year": 2026, "date_created": "..." },
  "licenses": [],
  "images": [{ "id": 1, "file_name": "street.jpg", "width": 1920, "height": 1080 }],
  "annotations": [
    { "id": 1, "image_id": 1, "category_id": 1, "bbox": [412.0, 230.5, 180.0, 96.0],
      "area": 17280.0, "iscrowd": 0, "segmentation": [] }
  ],
  "categories": [{ "id": 1, "name": "car", "supercategory": "none" }]
}
```

`bbox` is `[x, y, width, height]` in pixels from the top-left corner. Ids are
contiguous from 1. Images without boxes are included as negatives. In the zip,
images sit in `images/` next to `annotations.json`.

Uploads are normalised so the pixels you annotate are the pixels you export:
phone photos have their EXIF rotation baked in, and PDF pages are rendered to
PNG at 150 DPI (named `<file>_p001.png`, `<file>_p002.png`, …).

## Project layout

```
app.py              start everything
requirements.txt
backend/
  server.py         HTTP API, serves the interface
  store.py          session state on disk (labels, images, boxes)
  ingest.py         image normalisation, PDF pages
  coco.py           COCO export
  smart.py          classical computer-vision assists
  palette.py        label colours
frontend/
  src/              React source
  dist/             built interface served by app.py
data/               your session (created on first run, not in git)
```

To change the interface: `cd frontend && npm install && npm run build`.
For live reload while developing, run `python app.py --no-browser` and
`npm run dev` side by side.

OpenCV and pypdfium2 are optional at runtime: without them the app still
starts, and only the smart tools or PDF import are switched off.

---

(c) 2026 - Prof. Shahab Anbarjafari
