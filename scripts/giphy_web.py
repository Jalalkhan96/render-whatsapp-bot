#!/usr/bin/env python3
"""GIPHY website scraper/downloader for ABIX-AE.

No GIPHY API and no API key. Uses Playwright Chromium to load the public GIPHY
search pages exactly like a browser, extracts unique item pages and downloads
one playable rendition per item into a supplied temporary directory.
"""
from __future__ import annotations

import argparse
import json
import random
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

MAX_N = 20
WORDS = (
    "happy funny cat dog dance love wow lol cool omg hello bye yes no thanks sad angry excited "
    "party food cute fail win sleepy hungry celebrate clap facepalm shrug mindblown thumbs-up hi "
    "good-morning good-night anime meme reaction eye-roll high-five money tableflip"
).split()
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
MEDIA_RE = re.compile(
    r"https?://(?:media\d*|i|media-assets)\.giphy\.com/[^\"'<>\\\s)]+?\.(?:mp4|gif|webp|webm)(?:\?[^\"'<>\\\s)]*)?",
    re.I,
)
ID_RE = re.compile(r"/media/(?:v1\.[^/]+/)?([A-Za-z0-9]{6,})/", re.I)


def search_url(kind: str, query: str, random_mode: bool) -> str:
    q = query.strip()
    if random_mode:
        q = random.choice(WORDS).replace("-", " ")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", q.lower()).strip("-") or "funny"
    if kind == "gif":
        return f"https://giphy.com/search/{quote(slug)}"
    if kind == "sticker":
        return f"https://giphy.com/search/{quote(slug + '-stickers')}"
    if kind == "clip":
        return f"https://giphy.com/search/{quote(slug + '-clips')}"
    raise ValueError(f"Unsupported kind: {kind}")


def safe_name(value: str, fallback: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._-")
    return (value[:100] or fallback)


def unique_id_from_url(url: str) -> str | None:
    m = ID_RE.search(url)
    if m:
        return m.group(1)
    # Many GIPHY item links end with the same content ID.
    m = re.search(r"[-/]([A-Za-z0-9]{8,})(?:$|[?#])", url)
    return m.group(1) if m else None


def collect_item_links(page, kind: str, wanted: int) -> list[str]:
    if kind == "gif":
        prefixes = ("/gifs/",)
    elif kind == "sticker":
        prefixes = ("/stickers/", "/gifs/")
    else:
        prefixes = ("/clips/", "/gifs/")

    seen: set[str] = set()
    out: list[str] = []

    def scan() -> None:
        links = page.locator("a[href]").evaluate_all(
            "els => els.map(e => e.href).filter(Boolean)"
        )
        for href in links:
            try:
                if not re.match(r"^https?://(?:www\\.)?giphy\\.com/", href, re.I):
                    continue
                path = re.sub(r"^https?://(?:www\\.)?giphy\\.com", "", href, flags=re.I)
                if not any(path.lower().startswith(p) for p in prefixes):
                    continue
                href = href.split("#", 1)[0]
                if href not in seen:
                    seen.add(href)
                    out.append(href)
            except Exception:
                continue

    for _ in range(45):
        scan()
        if len(out) >= max(wanted * 5, 20):
            break
        try:
            page.mouse.wheel(0, 3000)
            page.wait_for_timeout(550)
        except Exception:
            break
    return out


def media_candidates(page) -> list[str]:
    scripts = page.locator("script").evaluate_all(
        "els => els.map(e => e.textContent || '').join('\\n')"
    )
    html = page.content()
    dom_urls = page.locator("img[src],img[data-src],video[src],source[src],meta[property='og:video'],meta[property='og:image']").evaluate_all(
        "els => els.flatMap(e => [e.src, e.getAttribute('data-src'), e.content, e.currentSrc].filter(Boolean))"
    )
    raw = "\n".join([html, scripts, *dom_urls])
    found: list[str] = []
    seen: set[str] = set()
    for m in MEDIA_RE.finditer(raw):
        url = m.group(0).replace('\\/', '/').replace('\\u002F', '/')
        if url not in seen:
            seen.add(url)
            found.append(url)
    return found


def media_identity(url: str) -> str:
    ident = unique_id_from_url(url)
    return f"id:{ident}" if ident else url.split('?', 1)[0]


def choose_media(urls: list[str], kind: str) -> tuple[str, str] | None:
    unique: list[str] = []
    seen: set[str] = set()
    for url in urls:
        clean = url.replace('\\/', '/').strip()
        if not re.match(r"^https?://", clean, re.I):
            continue
        ident = media_identity(clean)
        if ident in seen:
            continue
        seen.add(ident)
        unique.append(clean)

    if kind == 'clip':
        order = ('.mp4', '.webm', '.gif', '.webp')
    else:
        order = ('.mp4', '.gif', '.webp', '.webm')
    lower = [(u, u.split('?', 1)[0].lower()) for u in unique]
    for suffix in order:
        for url, low in lower:
            if low.endswith(suffix):
                return url, media_identity(url)
    return None


def download_with_page(context, url: str, dest: Path) -> None:
    resp = context.request.get(
        url,
        headers={"User-Agent": UA, "Referer": "https://giphy.com/"},
        timeout=45_000,
        fail_on_status_code=True,
    )
    body = resp.body()
    if not body:
        raise RuntimeError("empty GIPHY media response")
    if len(body) > 25 * 1024 * 1024:
        raise RuntimeError("media exceeds 25MB limit")
    dest.write_bytes(body)


def run(kind: str, query: str, count: int, random_mode: bool, out_dir: Path) -> list[dict]:
    count = max(1, min(count, MAX_N))
    out_dir.mkdir(parents=True, exist_ok=True)
    search = search_url(kind, query, random_mode)
    results: list[dict] = []
    seen_media: set[str] = set()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=UA,
            viewport={"width": 1440, "height": 1000},
            locale="en-US",
            extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
        )
        page = context.new_page()
        try:
            page.goto(search, wait_until="domcontentloaded", timeout=60_000)
            try:
                page.wait_for_load_state("networkidle", timeout=15_000)
            except PlaywrightTimeoutError:
                pass
            page.wait_for_timeout(2500)

            links = collect_item_links(page, kind, count)
            if random_mode:
                random.shuffle(links)

            # Resolve item pages until we have the requested number of unique media IDs.
            for idx, item_url in enumerate(links[: max(count * 10, 40)]):
                if len(results) >= count:
                    break
                item = context.new_page()
                try:
                    item.goto(item_url, wait_until="domcontentloaded", timeout=45_000)
                    try:
                        item.wait_for_load_state("networkidle", timeout=8_000)
                    except PlaywrightTimeoutError:
                        pass
                    item.wait_for_timeout(800)
                    chosen = choose_media(media_candidates(item), kind)
                    if not chosen:
                        continue
                    media_url, identity = chosen
                    if identity in seen_media:
                        continue
                    seen_media.add(identity)
                    ext = '.mp4' if media_url.split('?', 1)[0].lower().endswith('.mp4') else (
                        '.webm' if media_url.split('?', 1)[0].lower().endswith('.webm') else '.gif'
                    )
                    item_id = unique_id_from_url(media_url) or unique_id_from_url(item_url) or str(idx + 1)
                    dest = out_dir / f"{safe_name(item_id, 'giphy')}_{len(results)+1}{ext}"
                    download_with_page(context, media_url, dest)
                    results.append({
                        "kind": kind,
                        "id": item_id,
                        "page": item_url,
                        "url": media_url,
                        "path": str(dest),
                        "ext": ext,
                    })
                except Exception as exc:
                    print(f"item skip: {exc}", file=sys.stderr)
                finally:
                    item.close()

            # If the site changes its item markup, scan the search page's direct media as a fallback.
            if len(results) < count:
                for media_url in media_candidates(page):
                    if len(results) >= count:
                        break
                    try:
                        identity = media_identity(media_url)
                        if identity in seen_media:
                            continue
                        chosen = choose_media([media_url], kind)
                        if not chosen:
                            continue
                        media_url, identity = chosen
                        seen_media.add(identity)
                        ext = '.mp4' if media_url.split('?', 1)[0].lower().endswith('.mp4') else '.gif'
                        item_id = unique_id_from_url(media_url) or f"fallback_{len(results)+1}"
                        dest = out_dir / f"{safe_name(item_id, 'giphy')}_{len(results)+1}{ext}"
                        download_with_page(context, media_url, dest)
                        results.append({"kind": kind, "id": item_id, "page": search, "url": media_url, "path": str(dest), "ext": ext})
                    except Exception as exc:
                        print(f"fallback skip: {exc}", file=sys.stderr)
        finally:
            context.close()
            browser.close()
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--kind', choices=['gif', 'sticker', 'clip'], required=True)
    parser.add_argument('--query', default='')
    parser.add_argument('--count', type=int, default=1)
    parser.add_argument('--random', action='store_true')
    parser.add_argument('--out', required=True)
    args = parser.parse_args()

    try:
        result = run(args.kind, args.query, args.count, args.random, Path(args.out))
        print(json.dumps({"ok": True, "items": result}, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
