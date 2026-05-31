from __future__ import annotations

import json
import sys
from pathlib import Path

import fitz


def get_page_label(document, page, index):
    try:
        if hasattr(page, "get_label"):
            label = page.get_label()
            if label:
                return str(label)
    except Exception:
        pass

    try:
        if hasattr(document, "get_page_label"):
            label = document.get_page_label(index)
            if label:
                return str(label)
    except Exception:
        pass

    return None


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python extract-pdf-page-labels.py <source_pdf>")

    source_pdf = Path(sys.argv[1])
    document = fitz.open(source_pdf)
    labels = []

    try:
        for index in range(document.page_count):
            page = document.load_page(index)
            labels.append(get_page_label(document, page, index))
    finally:
        document.close()

    print(json.dumps({"pageCount": len(labels), "labels": labels}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
