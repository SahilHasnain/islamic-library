#!/usr/bin/env python3
"""Restore missing WebP page files for books already marked as WebP.

A bad `--delete-png` pass in the migration script removed the freshly uploaded
WebP pages for a handful of books (their manifests, covers and catalog entries
were left intact, so every page URL now returns 404). This script rebuilds those
pages from the original PNG renders that still exist locally, uploads them with
the *same* deterministic file IDs the manifests already point at, and rewrites
the manifest sizes so nothing client-side changes.

Sources, in order:
  1. `worker-service/runs/<job>/pages/page-NNN.png` matching the book/language/
     volume recorded in that run's `summary.json`.
  2. `--assets-root/books/<slug>/<language>/<volume>/page-NNN.png`
     (default: `D:/Projects/islamic-library-assets`).

Usage:
  python scripts/restore-missing-webp.py --book achhi-betiyan
  python scripts/restore-missing-webp.py --book achhi-betiyan --book bahar-e-shariat
  python scripts/restore-missing-webp.py --book bahar-e-shariat --dry-run
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import random
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
RUNS_DIR = REPO_ROOT / "worker-service" / "runs"
DEFAULT_ASSETS_ROOT = Path("D:/Projects/islamic-library-assets")

# Reuse the migration script's session/upload/encode helpers so both scripts
# produce byte-identical file IDs and encoder settings.
_spec = importlib.util.spec_from_file_location(
    "webp_migration", Path(__file__).with_name("migrate-images-to-webp.py")
)
mig = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mig)


def discover_run_sources() -> dict[tuple[str, str, str], Path]:
    """Map (book, language, volume) -> pages dir from worker run summaries."""
    found: dict[tuple[str, str, str], Path] = {}
    if not RUNS_DIR.exists():
        return found
    for job_dir in sorted(RUNS_DIR.iterdir()):
        summary_path = job_dir / "summary.json"
        if not summary_path.exists():
            continue
        try:
            summary = json.loads(summary_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        slug = summary.get("bookSlug")
        language = summary.get("languageId")
        volume = summary.get("volumeId")
        pages_dir = job_dir / "pages"
        if slug and language and volume and pages_dir.is_dir():
            # Later runs win: they reflect the most recent render.
            found[(slug, mig.normalize_language_id(language), volume)] = pages_dir
    return found


def assets_source(assets_root: Path, slug: str, language: str, volume: str) -> Path | None:
    candidate = assets_root / "books" / slug / language / volume
    return candidate if candidate.is_dir() else None


def resolve_source(
    run_sources: dict[tuple[str, str, str], Path],
    assets_root: Path,
    slug: str,
    language: str,
    volume: str,
    expected_pages: int,
) -> Path:
    candidates: list[tuple[str, Path]] = []
    run_dir = run_sources.get((slug, language, volume))
    if run_dir:
        candidates.append(("worker run", run_dir))
    assets_dir = assets_source(assets_root, slug, language, volume)
    if assets_dir:
        candidates.append(("assets repo", assets_dir))

    details = []
    for label, directory in candidates:
        count = len(list(directory.glob("page-*.png")))
        details.append(f"{label} ({count} pages)")
        if count >= expected_pages:
            print(f"  source: {label} {directory} ({count} PNG pages)", flush=True)
            return directory

    raise RuntimeError(
        f"no local PNG source with {expected_pages} pages for {slug}/{language}/{volume}; "
        f"tried: {', '.join(details) or 'nothing'}"
    )


def restore_page(
    page: dict,
    source_dir: Path,
    slug: str,
    language: str,
    volume: str,
    quality: int,
    dry_run: bool,
) -> dict:
    page_number = int(page.get("page") or 0)
    if page_number <= 0:
        raise RuntimeError(f"{slug}/{language}/{volume}: page entry without a number")

    source_path = source_dir / f"page-{page_number:03d}.png"
    if not source_path.exists():
        raise RuntimeError(f"missing source {source_path}")

    target_name = page.get("fileName") or f"page-{page_number:03d}.webp"
    if not target_name.lower().endswith(".webp"):
        target_name = mig.webp_file_name(target_name, page_number)
    target_id = mig.file_id_for(f"{slug}:{language}:{volume}:page:{target_name}")
    target_url = mig.public_file_url(target_id)

    content = source_path.read_bytes()
    converted, _ = mig.to_webp(content, quality)

    if not dry_run:
        mig.upload_file(target_id, converted, target_name, "image/webp")

    return {**page, "fileName": target_name, "url": target_url, "size": len(converted)}


def restore_volume(
    slug: str,
    language: str,
    volume: str,
    manifest: dict,
    source_dir: Path,
    quality: int,
    dry_run: bool,
    concurrency: int,
) -> dict:
    pages = manifest.get("pages") or []

    def run(page: dict) -> dict:
        return restore_page(page, source_dir, slug, language, volume, quality, dry_run)

    restored: list[dict] = []
    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
        for index, page in enumerate(pool.map(run, pages), start=1):
            restored.append(page)
            if index % 50 == 0 or index == len(pages):
                print(f"    {slug}/{language}/{volume}: {index}/{len(pages)} pages", flush=True)

    updated = {
        **manifest,
        "extension": "webp",
        "filePattern": mig.webp_file_name(manifest.get("filePattern") or "page-{page}.png"),
        "pages": restored,
    }
    if not dry_run:
        mig.upload_json(
            mig.file_id_for(f"{slug}:{language}:{volume}:manifest"), updated, "manifest.json"
        )
    return updated


def verify_volume(slug: str, language: str, volume: str, pages: list[dict]) -> list[str]:
    if not pages:
        return []
    picks = {0, len(pages) // 2, len(pages) - 1}
    failures: list[str] = []
    for index in sorted(picks):
        page = pages[index]
        response = mig.request_with_retry("HEAD", page["url"], allow_redirects=True)
        status = response.status_code
        if status != 200:
            failures.append(f"{slug}/{language}/{volume} page {page.get('page')}: HTTP {status}")
    return failures


def restore_book(
    book: dict,
    run_sources: dict[tuple[str, str, str], Path],
    assets_root: Path,
    quality: int,
    dry_run: bool,
    concurrency: int,
) -> tuple[list[str], int]:
    slug = book["id"]
    metadata = mig.get_json(book["metadataUrl"])
    failures: list[str] = []
    restored_pages = 0

    for language in metadata.get("languages", []):
        language_id = mig.normalize_language_id(language.get("id") or "urdu")
        for volume in language.get("volumes", []):
            manifest_url = volume.get("manifestUrl")
            if not manifest_url:
                continue
            manifest = mig.get_json(manifest_url)
            pages = manifest.get("pages") or []
            if not pages:
                continue
            volume_id = volume.get("id") or "volume1"
            print(
                f"  {slug}/{language_id}/{volume_id} ({len(pages)} pages, "
                f"extension={manifest.get('extension') or 'png'})",
                flush=True,
            )
            try:
                source_dir = resolve_source(
                    run_sources, assets_root, slug, language_id, volume_id, len(pages)
                )
                updated = restore_volume(
                    slug, language_id, volume_id, manifest, source_dir,
                    quality, dry_run, concurrency,
                )
            except Exception as error:  # keep going, report at the end
                failures.append(f"{slug}/{language_id}/{volume_id}: {error}")
                print(f"  FAILED {slug}/{language_id}/{volume_id}: {error}", flush=True)
                continue
            restored_pages += len(updated["pages"])
            if not dry_run:
                failures.extend(verify_volume(slug, language_id, volume_id, updated["pages"]))

    return failures, restored_pages


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--book", action="append", default=[], help="book slug (repeatable)")
    parser.add_argument("--dry-run", action="store_true", help="convert but upload nothing")
    parser.add_argument(
        "--quality", type=int, default=int(os.environ.get("PDF_WEBP_QUALITY", "82"))
    )
    parser.add_argument(
        "--concurrency", type=int, default=int(os.environ.get("WEBP_CONCURRENCY", "3"))
    )
    parser.add_argument(
        "--assets-root", type=Path, default=DEFAULT_ASSETS_ROOT,
        help="fallback tree containing books/<slug>/<language>/<volume>/page-NNN.png",
    )
    args = parser.parse_args()

    if not args.book:
        raise SystemExit("Pass at least one --book (auto-detection is not attempted).")

    quality = max(1, min(args.quality, 100))
    print(f"Appwrite endpoint: {mig.ENDPOINT}")
    print(f"Project: {mig.PROJECT_ID}  Bucket: {mig.BUCKET_ID}")
    print(f"WebP quality: {quality}  concurrency: {args.concurrency}")
    if args.dry_run:
        print("DRY RUN - nothing will be uploaded.")

    catalog = mig.get_json(
        f"{mig.ENDPOINT}/storage/buckets/{mig.BUCKET_ID}/files/{mig.CATALOG_FILE_ID}/download"
    )
    by_id = {entry.get("id"): entry for entry in catalog.get("books") or []}
    missing = [slug for slug in args.book if slug not in by_id]
    if missing:
        raise SystemExit(f"unknown book(s): {', '.join(missing)}")

    run_sources = discover_run_sources()
    print(f"worker runs indexed: {len(run_sources)}\n")

    all_failures: list[str] = []
    total = 0
    for index, slug in enumerate(args.book, start=1):
        print(f"[{index}/{len(args.book)}] {slug}", flush=True)
        failures, restored = restore_book(
            by_id[slug], run_sources, args.assets_root, quality, args.dry_run, args.concurrency
        )
        all_failures.extend(failures)
        total += restored

    print(f"\nRestored pages: {total}")
    if all_failures:
        print(f"{len(all_failures)} problem(s):")
        for failure in all_failures:
            print(f"  {failure}")
        return 1
    if args.dry_run:
        print("Dry run complete (nothing uploaded, nothing verified).")
    else:
        print("All restored pages verified (200).")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nInterrupted. Re-run to resume; already-uploaded pages are overwritten safely.")
        sys.exit(130)
