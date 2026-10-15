# Webtoon + Open Media Kit

Four tools. Zero dependencies (plain Node 18+). Everything here respects
licenses — nothing rips paid or copyrighted content.

## 1. webtoon-tracker.cjs — new-episode tracker for webtoons.com

Watches the series YOU follow and tells you when new episodes drop.
Reads episode **titles + dates only** — it never downloads comic pages.
Reading happens on webtoons.com; this just watches the listings.

```bash
node webtoon-tracker.cjs add "https://www.webtoons.com/en/fantasy/suitor-armor/list?title_no=2159"
node webtoon-tracker.cjs check            # check all series
node webtoon-tracker.cjs check --json     # machine-readable (for cron/scripts)
node webtoon-tracker.cjs list
node webtoon-tracker.cjs remove "Suitor Armor"
```

The first `add` baselines to the latest episode, so you only hear about
*future* episodes. Run `check` from a cron job / scheduled task every few hours.
State lives in `webtoon-tracker.state.json` next to the script.

## 2. webcomic-platforms-roundup.md

Fact-checked (Oct 2026) comparison of legal webcomic platforms —
WEBTOON, Tapas, Manta, Tappytoon, Lezhin, INKR, Netcomics, GlobalComix,
MANGA Plus — with cost models, free tiers, and offline-reading notes.

## 3. open-comics.cjs — comics ONLY from open-license / public-domain sources

```bash
node open-comics.cjs xkcd --from 1 --to 20 --out ./xkcd     # official xkcd API (CC BY-NC 2.5)
node open-comics.cjs xkcd --latest 10 --out ./xkcd
node open-comics.cjs ia-search "thriller comics" --rows 10  # Internet Archive, open-license only
node open-comics.cjs ia-download <identifier> --out ./comics [--dry-run]
```

- xkcd downloads always include `LICENSE-ATTRIBUTION.txt` (CC BY-NC 2.5:
  personal, non-commercial, attribution to Randall Munroe required).
- Internet Archive downloads are **license-checked**: the item must carry a
  public-domain or Creative Commons `licenseurl`, or the download is REFUSED.
  Unknown license NEVER becomes free. Each download writes a `.license.json`
  record. `--dry-run` previews files/sizes first.

## 4. cc-video.cjs — video ONLY from Creative Commons / public-domain sources

```bash
node cc-video.cjs ia-search "prelinger" --rows 10
node cc-video.cjs ia-download <identifier> --out ./videos [--dry-run]
node cc-video.cjs commons-search "waterfall iceland" --rows 10
node cc-video.cjs commons-download "File:Name.webm" --out ./videos [--dry-run]
```

- Internet Archive: same license-check rule as open-comics.cjs.
- Wikimedia Commons: every file is freely licensed by site policy; each
  download writes an `.attribution.json` (artist, license, source URL) —
  keep it if you reuse the file, the license requires attribution.

## Notes

- Polite by default: delays between requests, retries with backoff on 429/503.
- If a site changes its page layout or API, the affected tool prints a clear
  error instead of silently returning junk — re-check the README section.
- Tested end-to-end Oct 2026: tracker add/check/new-episode detection,
  xkcd range download, IA comic download (PD item), Commons video download
  with attribution.
