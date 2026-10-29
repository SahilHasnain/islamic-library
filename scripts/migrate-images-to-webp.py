#!/usr/bin/env python3
"""Convert published PNG pages/covers in the Appwrite public bucket to WebP.

The Appwrite bucket is the source of truth: this script downloads every page and
cover referenced by the published catalog, re-encodes it as WebP, uploads the
result under a deterministic `.webp` file ID, then rewrites the manifest,
metadata and catalog JSON so clients keep working without any migration on
their side.

Existing PNGs are kept by default (rollback/legacy safety). Pass `--delete-png`
to remove them once the WebP files and JSON are published.

Usage:
  python scripts/migrate-images-to-webp.py --dry-run
  python scripts/migrate-images-to-webp.py --book addawatul-makkiyyah
  python scripts/migrate-images-to-webp.py --quality 82 --concurrency 4
  python scripts/migrate-images-to-webp.py --delete-png

Requires: Python 3, Pillow (WebP support), requests.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import sys
import threading
from pathlib import Path
from urllib.parse import urlparse

import requests
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_CANDIDATES = [
    REPO_ROOT / "admin-console" / ".env.local",
    REPO_ROOT / ".env.local",
]

RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}
MAX_ATTEMPTS = 6

_thread_local = threading.local()


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for env_path in ENV_CANDIDATES:
        if not env_path.exists():
            continue
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    # Real environment variables win over file values.
    for key in ("APPWRITE_ENDPOINT", "APPWRITE_PROJECT_ID", "APPWRITE_API_KEY",
                "APPWRITE_PUBLIC_BUCKET_ID"):
        if os.environ.get(key):
            env[key] = os.environ[key]
    return env


ENV = load_env()
ENDPOINT = ENV.get("APPWRITE_ENDPOINT", "").rstrip("/")
PROJECT_ID = ENV.get("APPWRITE_PROJECT_ID", "")
API_KEY = ENV.get("APPWRITE_API_KEY", "")
BUCKET_ID = ENV.get("APPWRITE_PUBLIC_BUCKET_ID", "public_assets")
CATALOG_FILE_ID = "catalog"

if not ENDPOINT or not PROJECT_ID or not API_KEY:
    raise SystemExit(
        "Missing APPWRITE_ENDPOINT / APPWRITE_PROJECT_ID / APPWRITE_API_KEY "
        "(checked admin-console/.env.local and root .env.local)."
    )


# ---------------------------------------------------------------------------
# Appwrite helpers
# ---------------------------------------------------------------------------


def session() -> requests.Session:
    current = getattr(_thread_local, "session", None)
    if current is None:
        current = requests.Session()
        current.headers.update(
            {
                "X-Appwrite-Project": PROJECT_ID,
                "X-Appwrite-Key": API_KEY,
            }
        )
        _thread_local.session = current
    return current


def request_with_retry(method: str, url: str, **kwargs) -> requests.Response:
    import time

    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = session().request(method, url, timeout=120, **kwargs)
            if response.status_code not in RETRYABLE_STATUS:
                return response
            last_error = RuntimeError(f"HTTP {response.status_code}")
        except requests.RequestException as error:  # noqa: PERF203
            last_error = error
        if attempt == MAX_ATTEMPTS:
            break
        time.sleep(min(0.5 * (2 ** (attempt - 1)), 8))
    raise RuntimeError(f"{method} {url} failed after {MAX_ATTEMPTS} attempts: {last_error}")


def normalize_language_id(value: str) -> str:
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", (value or "").lower().strip()))


def file_id_for(seed: str) -> str:
    return hashlib.md5(seed.encode("utf-8")).hexdigest()


def public_file_url(file_id: str) -> str:
    return f"{ENDPOINT}/storage/buckets/{BUCKET_ID}/files/{file_id}/view?project={PROJECT_ID}"


def get_file_info(file_id: str) -> dict | None:
    response = request_with_retry(
        "GET", f"{ENDPOINT}/storage/buckets/{BUCKET_ID}/files/{file_id}"
    )
    if response.status_code == 404:
        return None
    if not response.ok:
        raise RuntimeError(f"file info {file_id} failed ({response.status_code}): {response.text[:200]}")
    return response.json()


def upload_file(file_id: str, content: bytes, file_name: str, content_type: str) -> None:
    request_with_retry(
        "DELETE", f"{ENDPOINT}/storage/buckets/{BUCKET_ID}/files/{file_id}"
    )
    files = {"file": (file_name, content, content_type)}
    data = {"fileId": file_id}
    response = request_with_retry(
        "POST", f"{ENDPOINT}/storage/buckets/{BUCKET_ID}/files", data=data, files=files
    )
    if not response.ok:
        raise RuntimeError(
            f"upload {file_name} ({file_id}) failed ({response.status_code}): {response.text[:300]}"
        )


def delete_file(file_id: str) -> None:
    response = request_with_retry(
        "DELETE", f"{ENDPOINT}/storage/buckets/{BUCKET_ID}/files/{file_id}"
    )
    if not response.ok and response.status_code != 404:
        raise RuntimeError(f"delete {file_id} failed ({response.status_code}): {response.text[:200]}")


def download_bytes(url: str) -> bytes:
    response = request_with_retry("GET", url)
    if not response.ok:
        raise RuntimeError(f"download {url} failed ({response.status_code})")
    return response.content


def get_json(url: str) -> dict:
    response = request_with_retry("GET", url)
    if not response.ok:
        raise RuntimeError(f"download {url} failed ({response.status_code}): {response.text[:200]}")
    return response.json()


def upload_json(file_id: str, payload: dict, file_name: str) -> None:
    body = json.dumps(payload, indent=2).encode("utf-8")
    upload_file(file_id, body, file_name, "application/json")


def file_id_from_url(url: str) -> str | None:
    match = re.search(r"/files/([^/]+)/", url or "")
    return match.group(1) if match else None


# ---------------------------------------------------------------------------
# Image conversion
# ---------------------------------------------------------------------------


def to_webp(content: bytes, quality: int) -> tuple[bytes, tuple[int, int]]:
    image = Image.open(io.BytesIO(content))
    image.load()
    if image.mode not in ("RGB", "RGBA", "L"):
        image = image.convert("RGB")
    output = io.BytesIO()
    image.save(output, "WEBP", quality=quality, method=4)
    return output.getvalue(), image.size


def webp_file_name(file_name: str, page: int | None = None) -> str:
    base = file_name or (f"page-{page:03d}.png" if page else "")
    if base.lower().endswith(".webp"):
        return base
    if re.search(r"\.(png|jpe?g)$", base, re.IGNORECASE):
        return re.sub(r"\.(png|jpe?g)$", ".webp", base, flags=re.IGNORECASE)
    return f"{base}.webp"


# ---------------------------------------------------------------------------
# Migration
# ---------------------------------------------------------------------------


class Stats:
    def __init__(self) -> None:
        self.pages_converted = 0
        self.pages_skipped = 0
        self.covers_converted = 0
        self.bytes_before = 0
        self.bytes_after = 0

    def add_page(self, before: int, after: int) -> None:
        self.pages_converted += 1
        self.bytes_before += before
        self.bytes_after += after

    def summary(self) -> str:
        if not self.bytes_before:
            return f"pages converted: {self.pages_converted}, covers converted: {self.covers_converted}"
        saved = 100 * (1 - self.bytes_after / self.bytes_before)
        return (
            f"pages converted: {self.pages_converted} (skipped {self.pages_skipped}), "
            f"covers converted: {self.covers_converted}, "
            f"{self.bytes_before / 1024 / 1024:.2f} MB -> "
            f"{self.bytes_after / 1024 / 1024:.2f} MB (-{saved:.1f}%)"
        )


def convert_cover(book_slug: str, cover_url: str, quality: int, dry_run: bool, stats: Stats) -> str:
    if not cover_url or cover_url.lower().endswith(".webp") or "/files/" not in cover_url:
        return cover_url

    target_id = file_id_for(f"{book_slug}:cover:cover.webp")
    target_url = public_file_url(target_id)

    if get_file_info(target_id):
        return target_url

    content = download_bytes(cover_url)
    converted, _ = to_webp(content, quality)
    stats.covers_converted += 1
    stats.bytes_before += len(content)
    stats.bytes_after += len(converted)
    print(
        f"  cover  {len(content) / 1024:8.1f} KB -> {len(converted) / 1024:7.1f} KB "
        f"(-{100 * (1 - len(converted) / len(content)):.1f}%)"
    )
    if not dry_run:
        upload_file(target_id, converted, "cover.webp", "image/webp")
    return target_url


def process_page(
    page: dict,
    book_slug: str,
    language_id: str,
    volume_id: str,
    base_url: str,
    manifest_file_pattern: str,
    quality: int,
    dry_run: bool,
) -> tuple[dict, int, int, bool]:
    """Convert one page, reusing an existing WebP file so re-runs stay cheap."""
    source_name = page.get("fileName") or webp_file_name(
        manifest_file_pattern.replace("{page}", f"{page['page']:03d}"), page["page"]
    )
    target_name = webp_file_name(source_name, page.get("page"))
    target_id = file_id_for(f"{book_slug}:{language_id}:{volume_id}:page:{target_name}")
    target_url = public_file_url(target_id)

    updated = {**page, "fileName": target_name, "url": target_url}

    if target_name.lower().endswith(".webp") and source_name.lower().endswith(".webp"):
        info = get_file_info(target_id)
        if info:
            updated["size"] = info.get("sizeOriginal", page.get("size"))
            return updated, 0, 0, False

    existing = get_file_info(target_id)
    if existing:
        updated["size"] = existing.get("sizeOriginal", page.get("size"))
        return updated, 0, 0, False

    source_url = page.get("url")
    if not source_url and base_url:
        source_url = f"{base_url.rstrip('/')}/{source_name}"
    if not source_url:
        raise RuntimeError(f"page {page.get('page')} has no URL")

    content = download_bytes(source_url)
    converted, _ = to_webp(content, quality)
    updated["size"] = len(converted)

    if not dry_run:
        upload_file(target_id, converted, target_name, "image/webp")

    return updated, len(content), len(converted), True


def migrate_volume(
    book_slug: str,
    language_id: str,
    volume_id: str,
    manifest: dict,
    cover_url: str,
    quality: int,
    dry_run: bool,
    stats: Stats,
    concurrency: int,
) -> dict:
    from concurrent.futures import ThreadPoolExecutor

    pages = manifest.get("pages") or []
    base_url = manifest.get("baseUrl") or ""
    file_pattern = manifest.get("filePattern") or "page-{page}.png"

    def run(page: dict):
        return process_page(
            page, book_slug, language_id, volume_id, base_url, file_pattern,
            quality, dry_run,
        )

    updated_pages: list[dict] = []
    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
        for index, result in enumerate(pool.map(run, pages), start=1):
            page, before, after, converted = result
            updated_pages.append(page)
            if converted:
                stats.add_page(before, after)
            else:
                stats.pages_skipped += 1
            if index % 50 == 0 or index == len(pages):
                print(f"    {book_slug}/{language_id}/{volume_id}: {index}/{len(pages)} pages")

    next_pattern = webp_file_name(file_pattern)

    return {
        **manifest,
        "extension": "webp",
        "filePattern": next_pattern,
        "coverImage": cover_url or manifest.get("coverImage"),
        "pages": updated_pages,
    }


def migrate_book(
    book_entry: dict,
    quality: int,
    dry_run: bool,
    delete_png: bool,
    force: bool,
    stats: Stats,
    concurrency: int,
) -> tuple[dict, list[str]]:
    book_slug = book_entry["id"]
    metadata_url = book_entry.get("metadataUrl")
    if not metadata_url:
        print(f"skip {book_slug}: no metadataUrl")
        return book_entry, []

    metadata = get_json(metadata_url)
    cover_source = (
        metadata.get("coverImage")
        or book_entry.get("coverImage")
        or next(
            (
                volume.get("coverImage")
                for language in metadata.get("languages", [])
                for volume in language.get("volumes", [])
                if volume.get("coverImage")
            ),
            "",
        )
    )

    new_cover_url = convert_cover(book_slug, cover_source, quality, dry_run, stats)

    old_ids: list[str] = []
    cover_source_id = file_id_from_url(cover_source)
    if delete_png and not dry_run:
        # Covers published so far always used the deterministic `cover.png` seed.
        old_ids.append(file_id_for(f"{book_slug}:cover:cover.png"))
        if cover_source_id:
            old_ids.append(cover_source_id)

    changed = False
    for language in metadata.get("languages", []):
        language_id = language.get("id") or "urdu"
        for volume in language.get("volumes", []):
            manifest_url = volume.get("manifestUrl")
            if not manifest_url:
                continue
            manifest = get_json(manifest_url)
            normalized_language_id = normalize_language_id(language_id)
            manifest_pages = manifest.get("pages") or []

            if delete_png and not dry_run:
                for page in manifest_pages:
                    page_number = int(page.get("page") or 0)
                    if page_number > 0:
                        old_ids.append(
                            file_id_for(
                                f"{book_slug}:{normalized_language_id}:{volume.get('id')}"
                                f":page:page-{page_number:03d}.png"
                            )
                        )
                    old_url_id = file_id_from_url(page.get("url", ""))
                    if old_url_id:
                        old_ids.append(old_url_id)

            already_webp = (
                manifest.get("extension") == "webp"
                and str(manifest.get("filePattern", "")).lower().endswith(".webp")
                and all(
                    str(page.get("fileName", "")).lower().endswith(".webp")
                    for page in manifest_pages
                )
            )
            if already_webp and not force:
                stats.pages_skipped += len(manifest.get("pages") or [])
                print(f"  skip {book_slug}/{normalized_language_id}/{volume.get('id')}: already WebP")
                continue

            print(f"  convert {book_slug}/{normalized_language_id}/{volume.get('id')} ({len(manifest.get('pages') or [])} pages)")
            updated_manifest = migrate_volume(
                book_slug,
                normalized_language_id,
                volume.get("id"),
                manifest,
                new_cover_url,
                quality,
                dry_run,
                stats,
                concurrency,
            )
            changed = True
            if not dry_run:
                manifest_file_id = file_id_for(
                    f"{book_slug}:{normalized_language_id}:{volume.get('id')}:manifest"
                )
                upload_json(manifest_file_id, updated_manifest, "manifest.json")

            if "coverImage" in volume and volume.get("coverImage"):
                volume["coverImage"] = new_cover_url

    if new_cover_url and new_cover_url != cover_source:
        metadata["coverImage"] = new_cover_url
        changed = True
    book_entry = {**book_entry, "coverImage": new_cover_url or book_entry.get("coverImage")}

    if changed and not dry_run:
        upload_json(file_id_for(f"{book_slug}:metadata"), metadata, "metadata.json")

    return book_entry, old_ids


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="convert in memory only, write nothing")
    parser.add_argument("--book", action="append", default=[], help="limit to a book slug (repeatable)")
    parser.add_argument("--limit", type=int, default=0, help="process at most N books")
    parser.add_argument("--quality", type=int, default=int(os.environ.get("PDF_WEBP_QUALITY", "82")))
    parser.add_argument("--concurrency", type=int, default=int(os.environ.get("WEBP_CONCURRENCY", "4")))
    parser.add_argument("--delete-png", action="store_true", help="delete PNGs after WebP is published")
    parser.add_argument("--force", action="store_true", help="reconvert volumes already marked WebP")
    args = parser.parse_args()

    quality = max(1, min(args.quality, 100))

    print(f"Appwrite endpoint: {ENDPOINT}")
    print(f"Project: {PROJECT_ID}  Bucket: {BUCKET_ID}")
    print(f"WebP quality: {quality}  concurrency: {args.concurrency}")
    if args.dry_run:
        print("DRY RUN - nothing will be uploaded or deleted.")
    if args.delete_png:
        print("DELETE PNG - original PNGs are removed after their WebP replacement is published.")

    catalog = get_json(f"{ENDPOINT}/storage/buckets/{BUCKET_ID}/files/{CATALOG_FILE_ID}/download")
    books = catalog.get("books") or []
    selected = [book for book in books if not args.book or book.get("id") in args.book]
    if args.limit:
        selected = selected[: args.limit]

    print(f"books: {len(selected)} of {len(books)}\n")

    stats = Stats()
    updated_books: dict[str, dict] = {}
    for index, book in enumerate(selected, start=1):
        print(f"[{index}/{len(selected)}] {book.get('id')}")
        updated_book, old_ids = migrate_book(
            book, quality, args.dry_run, args.delete_png, args.force, stats, args.concurrency
        )
        updated_books[book["id"]] = updated_book

        if not args.dry_run:
            catalog["books"] = [
                updated_books.get(entry["id"], entry) for entry in catalog.get("books", [])
            ]
            upload_json(CATALOG_FILE_ID, catalog, "catalog.json")

            # Only drop the originals after every JSON file points at the WebP copies.
            for old_id in dict.fromkeys(old_ids):
                if old_id != file_id_for(f"{book.get('id')}:cover:cover.webp"):
                    delete_file(old_id)

    print("\nDone.")
    print(f"  {stats.summary()}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nInterrupted. Re-run to resume; already-published WebP files are skipped.")
        sys.exit(130)
