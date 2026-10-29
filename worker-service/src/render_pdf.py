from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import fitz
from PIL import Image


DEFAULT_WEBP_QUALITY = 82
WEBP_METHOD = int(os.environ.get("PDF_WEBP_METHOD", "4"))


def pixmap_to_image(pixmap):
    mode = {1: "L", 3: "RGB", 4: "RGBA"}.get(pixmap.n)
    if mode is None:
        raise RuntimeError(f"Unsupported pixmap component count: {pixmap.n}")
    return Image.frombytes(mode, (pixmap.width, pixmap.height), pixmap.samples)


def save_webp(image, path, quality):
    image.save(path, "WEBP", quality=quality, method=WEBP_METHOD)


def get_pdf_page_label(document, page, index):
    try:
        if hasattr(page, "get_label"):
            label = page.get_label()
            if label:
                return str(label)
    except Exception:
        pass

    try:
        if hasattr(document, "get_page_labels"):
            labels = document.get_page_labels()
            if labels:
                return str(document.get_page_label(index))
    except Exception:
        pass

    return None


def main() -> int:
    if len(sys.argv) not in (6, 7):
        raise SystemExit(
            "Usage: python render_pdf.py <source_pdf> <pages_dir> <cover_path> <manifest_path> <dpi> [webp_quality]"
        )

    source_pdf = Path(sys.argv[1])
    pages_dir = Path(sys.argv[2])
    cover_path = Path(sys.argv[3])
    manifest_path = Path(sys.argv[4])
    dpi = int(sys.argv[5])
    quality = int(sys.argv[6]) if len(sys.argv) == 7 else DEFAULT_WEBP_QUALITY
    quality = max(1, min(quality, 100))

    pages_dir.mkdir(parents=True, exist_ok=True)
    cover_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    zoom = dpi / 72
    matrix = fitz.Matrix(zoom, zoom)

    document = fitz.open(source_pdf)
    pages = []

    try:
      for index in range(document.page_count):
          page = document.load_page(index)
          printed_page_label = get_pdf_page_label(document, page, index)
          pixmap = page.get_pixmap(matrix=matrix, alpha=False)
          page_image = pixmap_to_image(pixmap)
          page_name = f"page-{index + 1:03d}.webp"
          page_path = pages_dir / page_name
          save_webp(page_image, page_path, quality)

          page_entry = {
              "page": index + 1,
              "fileName": page_name,
              "width": pixmap.width,
              "height": pixmap.height,
              "size": page_path.stat().st_size,
          }

          if printed_page_label and printed_page_label != str(index + 1):
              page_entry["printedPageLabel"] = printed_page_label

          pages.append(page_entry)

          if index == 0:
              save_webp(page_image, cover_path, quality)
    finally:
        document.close()

    output = {
        "totalPages": len(pages),
        "coverFileName": cover_path.name,
        "pages": pages,
        "dpi": dpi,
        "format": "webp",
        "webpQuality": quality,
    }
    manifest_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
