"""Extract first ~40 pages text from each book PDF and save summaries."""

import json, os, sys
import fitz  # PyMuPDF

UPLOAD = os.path.join(os.path.dirname(__file__), "..", "upload")

NEED_DESC = [
    "addawatul-makkiyyah",
    "ahle-sunaat-ki-pehchan",
    "al-amna-wal-ula",
    "anwaar-e-shariat",
    "aqaid-e-ahle-sunnat",
    "ikhteyarat-e-mustafa",
    "kanzul-iman",
    "maqalaat-e-ahsani",
    "mukashafatul-quloob",
    "qayamat-kab-aayegi",
    "seerat-e-mustafa",
    "shifa-shareef",
]

def extract_text(pdf_path, max_pages=40):
    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        return None, f"Error opening PDF: {e}"

    total = min(len(doc), max_pages)
    pages_text = []

    for i in range(total):
        page = doc[i]
        text = page.get_text().strip()
        pages_text.append({"page": i + 1, "len": len(text), "text": text})

    doc.close()
    return pages_text, total

for slug in NEED_DESC:
    pdf_path = os.path.join(UPLOAD, f"{slug}.pdf")
    if not os.path.exists(pdf_path):
        print(f"\nSKIP: {slug} - PDF not found")
        continue

    print(f"\n{slug}...", end="", flush=True)

    pages_text, total_pages = extract_text(pdf_path)

    if pages_text is None:
        print(f" ERROR: {total_pages}")
        continue

    total_chars = sum(p["len"] for p in pages_text)
    pages_with_text = sum(1 for p in pages_text if p["len"] > 50)

    out_path = os.path.join(UPLOAD, f"{slug}-text.txt")
    with open(out_path, "w", encoding="utf-8") as f:
        for p in pages_text:
            f.write(f"\n--- Page {p['page']} ---\n")
            f.write(p["text"])
            f.write("\n")

    print(f" {len(pages_text)}pgs, {total_chars}chars, {pages_with_text}pgs with text")
