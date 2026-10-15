# License Policy — Meme Search Engine

Hard rule, same as every engine in this family:

**Unknown license NEVER becomes free.**

Memes are user-generated content with murky rights. This engine labels every
result honestly:

| Status    | Meaning                                                                 |
|-----------|-------------------------------------------------------------------------|
| `free`    | License verified live from the source API (CC-BY, CC-BY-SA, CC0, public |
|           | domain, …). Carries `license.name`, `license.url`, and `attribution`.   |
| `unknown` | UGC from a meme site (Imgflip templates, Reddit posts). Downloadable   |
|           | for personal use, but NOT marked free — check the source page's terms.  |
| `blocked` | Filtered out (NSFW when `--no-nsfw`, non-image URL, failed fetch).      |

## What each source gives you

- **Imgflip** (`api.imgflip.com/get_memes`): the 100 most-captioned templates.
  Images are user-uploaded; Imgflip's own terms apply. Status: `unknown`.
- **meme-api** (`meme-api.com`, Reddit-backed): live posts from meme
  subreddits incl. r/pepethefrog. Reddit's content policy + the post's own
  context apply. Status: `unknown`.
- **Wikimedia Commons**: real CC/PD files with machine-readable license
  metadata (`LicenseShortName` + `LicenseUrl`). These are the ONLY results
  ever marked `free`, and every download writes an attribution sidecar.

## Key-gated sources — deliberately excluded

Giphy and Tenor need API keys, so their adapters ship as `auth_required`
stubs (see `src/sources/index.cjs`). Supply a key via env var to enable;
they are never faked.

## Downloads

Every download writes `<file>.license.json` next to the image containing
the source, page URL, author, license status, and attribution text.
If the license is `unknown`, the sidecar says so in plain words.
