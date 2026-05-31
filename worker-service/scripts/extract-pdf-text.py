from __future__ import annotations

import json
import sys
from pathlib import Path

import fitz


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    if len(sys.argv) != 3:
        raise SystemExit("Usage: python extract-pdf-text.py <source_pdf> <max_pages>")

    source_pdf = Path(sys.argv[1])
    max_pages = int(sys.argv[2])
    document = fitz.open(source_pdf)
    pages = []
    total_page_count = document.page_count

    try:
        page_count = total_page_count if max_pages <= 0 else min(total_page_count, max_pages)
        for index in range(page_count):
            page = document.load_page(index)
            text = page.get_text("text").strip()
            pages.append({"page": index + 1, "text": text})
    finally:
        document.close()

    print(json.dumps({"pageCount": total_page_count, "pages": pages}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
