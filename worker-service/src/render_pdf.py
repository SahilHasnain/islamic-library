from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import fitz


def main() -> int:
    if len(sys.argv) != 6:
        raise SystemExit(
            "Usage: python render_pdf.py <source_pdf> <pages_dir> <cover_path> <manifest_path> <dpi>"
        )

    source_pdf = Path(sys.argv[1])
    pages_dir = Path(sys.argv[2])
    cover_path = Path(sys.argv[3])
    manifest_path = Path(sys.argv[4])
    dpi = int(sys.argv[5])

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
          pixmap = page.get_pixmap(matrix=matrix, alpha=False)
          page_name = f"page-{index + 1:03d}.webp"
          page_path = pages_dir / page_name
          pixmap.save(page_path)

          pages.append(
              {
                  "page": index + 1,
                  "fileName": page_name,
                  "width": pixmap.width,
                  "height": pixmap.height,
                  "size": page_path.stat().st_size,
              }
          )

          if index == 0:
              pixmap.save(cover_path)
    finally:
        document.close()

    output = {
        "totalPages": len(pages),
        "coverFileName": cover_path.name,
        "pages": pages,
        "dpi": dpi,
    }
    manifest_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
