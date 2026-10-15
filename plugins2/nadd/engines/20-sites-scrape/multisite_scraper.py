#!/usr/bin/env python3
"""
multisite_scraper.py — polite multi-site article scraper (stdlib only).

Scrapes 20 public sites: homepage -> article links -> bounded article crawl.
Saves one JSON per site + index.json. Failures are recorded, never fatal.

Usage:
    python3 multisite_scraper.py [--max 12] [--delay 1.5] [--out ./sites_out]
                                 [--only bbc,guardian] [--workers 1]

Notes: sequential (1 worker default) to stay polite. Some JS-heavy or
bot-walled sites may degrade — that's reported in index.json, not fatal.
"""

import argparse, html, json, os, re, sys, time, urllib.request, urllib.error
from urllib.parse import urljoin, urlparse

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"}

SITES = [
    # (key, label, homepage, article-path regex)
    ("bbc",        "BBC News",          "https://www.bbc.com/news",            r"/news/(articles/[a-z0-9]+|world|uk|business|technology|science)"),
    ("guardian",   "The Guardian",      "https://www.theguardian.com",         r"/\d{4}/[a-z]{3}/\d{1,2}/[a-z0-9\-]+"),
    ("techcrunch", "TechCrunch",        "https://techcrunch.com",              r"/\d{4}/\d{2}/\d{2}/[a-z0-9\-]+/"),
    ("verge",      "The Verge",         "https://www.theverge.com",            r"/\d{4}/\d{1,2}/\d{1,2}/\d+/[a-z0-9\-]+"),
    ("arstechnica","Ars Technica",      "https://arstechnica.com",             r"/[a-z\-]+/\d{4}/\d{1,2}/[a-z0-9\-]+/"),
    ("wired",      "WIRED",             "https://www.wired.com",               r"/story/[a-z0-9\-]+/"),
    ("npr",        "NPR",               "https://www.npr.org",                 r"/\d{4}/\d{2}/\d{2}/\d+/[a-z0-9\-]+"),
    ("apnews",     "AP News",           "https://apnews.com",                  r"/article/[a-z0-9\-]+"),
    ("aljazeera",  "Al Jazeera",        "https://www.aljazeera.com",           r"/(news|features|opinion)/\d{4}/\d{1,2}/\d{1,2}/[a-z0-9\-]+"),
    ("dw",         "Deutsche Welle",    "https://www.dw.com/en",               r"/en/[a-z0-9\-]+/a\-\d+"),
    ("france24",   "France 24",         "https://www.france24.com/en/",        r"/en/\d{8}\-[a-z0-9\-]+"),
    ("devto",      "DEV Community",     "https://dev.to",                    r"^/[a-zA-Z0-9_\-]+/[a-z0-9\-]{6,}$"),
    ("lobsters",   "Lobsters",          "https://lobste.rs",                 r"^/s/[a-z0-9]+/[a-z0-9_\-]+$"),
    ("github",     "GitHub Trending",   "https://github.com/trending",       r"^/[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+$"),
    ("arxiv",      "arXiv cs.AI",       "https://arxiv.org/list/cs.AI/recent", r"^/abs/\d{4}\.\d+(v\d+)?$"),
    ("nasa",       "NASA",              "https://www.nasa.gov",                r"/(news|feature|image\-detail)/[a-z0-9\-]+"),
    ("so_blog",    "Stack Overflow Blog","https://stackoverflow.blog",        r"/\d{4}/\d{2}/\d{2}/[a-z0-9\-]+/"),
    ("python",     "Python.org",        "https://www.python.org",              r"/(blogs|news)/[a-z0-9\-/]+"),
    ("nature",     "Nature News",       "https://www.nature.com",              r"/articles/[a-z0-9\-]+"),
    ("economist",  "The Economist",     "https://www.economist.com",           r"/[a-z\-]+/\d{4}/\d{2}/\d{2}/[a-z0-9\-]+"),
]

def fetch(url, timeout=25, retries=2):
    last = None
    for _ in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                ct = r.headers.get("Content-Type", "")
                if "text/html" not in ct and "text/plain" not in ct and "xml" not in ct:
                    raise ValueError("non-HTML: " + ct)
                return r.read().decode("utf-8", "replace"), r.status
        except Exception as e:
            last = e
            time.sleep(1)
    raise last

def links(html, base, host):
    out = []
    for m in re.finditer(r'href\s*=\s*["\']([^"\']+)["\']', html):
        u = urljoin(base, m.group(1)).split("#")[0]
        p = urlparse(u)
        if p.netloc == host and p.scheme in ("http", "https"):
            out.append(u)
    return out

def clean_text(t):
    t = re.sub(r"<script[\s\S]*?</script>", " ", t, flags=re.I)
    t = re.sub(r"<style[\s\S]*?</style>", " ", t, flags=re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    t = html.unescape(t)
    return re.sub(r"\s+", " ", t).strip()

def extract_article(page_html):
    def meta(name):
        m = re.search(r'<meta[^>]+(?:property|name)=["\']%s["\'][^>]+content=["\']([^"\']+)' % name, page_html, re.I) or \
            re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']%s["\']' % name, page_html, re.I)
        return html.unescape(m.group(1)).strip() if m else ""
    title = meta("og:title")
    if not title:
        m = re.search(r"<title[^>]*>(.*?)</title>", page_html, re.I | re.S)
        title = clean_text(m.group(1)).split("|")[0].strip() if m else ""
    desc = meta("og:description") or meta("description")
    pub = meta("article:published_time")
    scope = re.search(r"<article[\s\S]*?</article>", page_html, re.I) or \
            re.search(r"<main[\s\S]*?</main>", page_html, re.I)
    body_html = scope.group(0) if scope else page_html
    paras = [clean_text(p) for p in re.findall(r"<p[^>]*>(.*?)</p>", body_html, re.I | re.S)]
    paras = [p for p in paras if len(p) > 40]
    return {"title": title, "description": desc, "published": pub,
            "body": "\n".join(paras)[:6000]}

def scrape_site(key, label, home, art_re, max_a, delay):
    host = urlparse(home).netloc
    rec = {"site": label, "home": home, "status": "ok", "articles": [], "errors": []}
    try:
        hhtml, _ = fetch(home)
    except Exception as e:
        rec["status"] = "failed"; rec["errors"].append("homepage: " + str(e)[:120]); return rec
    seen, urls = set(), []
    for u in links(hhtml, home, host):
        cu = u.split("?")[0].rstrip("/")
        if re.search(art_re, urlparse(cu).path) and cu not in seen and cu != home.rstrip("/"):
            seen.add(cu); urls.append(cu)
    rec["links_found"] = len(urls)
    for i, u in enumerate(urls[:max_a]):
        try:
            phtml, _ = fetch(u)
            a = extract_article(phtml)
            a["url"] = u
            rec["articles"].append(a)
        except Exception as e:
            rec["errors"].append(u[:80] + ": " + str(e)[:100])
        time.sleep(delay)
    if not rec["articles"]:
        rec["status"] = "degraded"
    return rec

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=12)
    ap.add_argument("--delay", type=float, default=1.5)
    ap.add_argument("--out", default="./sites_out")
    ap.add_argument("--only", default="")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    only = set(x for x in args.only.split(",") if x)
    targets = [s for s in SITES if not only or s[0] in only]

    index = []
    for key, label, home, art_re in targets:
        print(f"[{key}] {label} ...", flush=True)
        t0 = time.time()
        rec = scrape_site(key, label, home, art_re, args.max, args.delay)
        fp = os.path.join(args.out, key + ".json")
        json.dump(rec, open(fp, "w"), indent=1, ensure_ascii=False)
        dt = round(time.time() - t0, 1)
        print(f"  -> {rec['status']}: {len(rec['articles'])} articles ({dt}s)")
        index.append({"key": key, "label": label, "status": rec["status"],
                      "articles": len(rec["articles"]), "seconds": dt,
                      "errors": rec["errors"][:3]})
    json.dump(index, open(os.path.join(args.out, "index.json"), "w"), indent=1)
    ok = sum(1 for i in index if i["status"] == "ok")
    print(f"\nDone: {ok}/{len(index)} ok, {sum(i['articles'] for i in index)} articles total -> {args.out}")

if __name__ == "__main__":
    main()
