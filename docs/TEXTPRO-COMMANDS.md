# Multi-site text effects — WhatsApp + Telegram

The shared effect generator is available on **WhatsApp (Baileys)** and **Telegram**. All three providers use the same catalog, input validation, job concurrency limit, user cooldown, and Axios form-submit/polling engine.

- WhatsApp uses the configured command prefix (default `-`).
- Telegram uses slash commands.
- Main site menus are `-textpro`, `-ephoto`, `-birthdaycake` and `/textpro`, `/ephoto`, `/birthdaycake`.
- Only HTTPS effect URLs from `textpro.me`, `en.ephoto360.com`, and `birthdaycake24.com` are accepted. The CAPTCHA-protected `ephoto360.com` main host is intentionally not enabled.
- The catalog is a curated set of known effect URLs, not a guarantee that a remote page's form will never change. The provider can change or rate-limit form endpoints.

## Main menu and discovery commands

| Site | WhatsApp main | Telegram main | Popular | New/latest | Search | Categories |
|---|---|---|---|---|---|---|
| TextPro.me | `-textpro` | `/textpro` | `-tppopular` / `/tppopular` | `-tpnew` / `/tpnew` | `-tpsearch neon` / `/tpsearch neon` | `-tpcategories` / `/tpcategories` |
| Ephoto360 English | `-ephoto` | `/ephoto` | `-epopular` / `/epopular` | `-epnew` / `/epnew` | `-epsearch neon` / `/epsearch neon` | `-epcategories` / `/epcategories` |
| BirthdayCake24 | `-birthdaycake` | `/birthdaycake` | `-bcpopular` / `/bcpopular` | `-bcnew` / `/bcnew` | `-bcsearch cake` / `/bcsearch cake` | `-bccategories` / `/bccategories` |

The WhatsApp side follows `BOT_PREFIX`; if the configured prefix is not `-`, use that prefix instead.

## TextPro.me individual templates

Popular:

- `tpneon` — Neon Light
- `tpgreenneon` — Green Neon
- `tpglitch` — Glitch / TikTok effect (2 text fields)
- `tpthunder` — Thunder
- `tpglow` — Advanced Glow
- `tpmatrix` — Matrix
- `tpgold` — Deluxe Gold
- `tplava` — Lava
- `tpmetallic` — Metallic
- `tp3dneon` — 3D Neon
- `tpwood` — Wood
- `tpblackmetal` — Black Metal

New / recently featured:

- `tpcouple` — Couple Name Typography (3 text fields)
- `tpcandy` — Cute 3D Candy
- `tpcrystal` — Sparkling Crystal
- `tpchrome` — Glossy Metallic Chrome
- `tpmysticalpink` — Mystical Neon Pink Logo
- `tpiceblue` — Cold Blue Metallic
- `tpcorn` — 3D Corn Kernel
- `tpbluemarble` — Blue Marble
- `tppearl` — 3D Pearl
- `tphologram` — Hologram Glass
- `tpdeadpool` — Deadpool Logo Style
- `tpreflected` — Reflected Neon
- `tpthunder3d` — 3D Thunder
- `tpliquidmetal` — 3D Liquid Metal

## Ephoto360 English individual templates

Popular:

- `epmagic` — Magic Purple Text
- `epbokeh` — Bokeh
- `epcolor` — Color Text Effects
- `epcloud` — Realistic Cloud Text
- `eppapercut` — Art Paper-Cut Text
- `epname` — Create Text by Name
- `eppavement` — Typography on Pavement
- `epretro` — Retro Neon Text (3 fields)

New / featured:

- `epdeadpool` — Deadpool Logo Text (2 fields)
- `epcomic` — 3D Comic Text
- `epdragonball` — Dragon Ball Text
- `epblackpink` — BLACKPINK Logo Text
- `epsilver` — Glossy Silver 3D Text
- `epneon` — Colorful Neon Light Text

## BirthdayCake24 individual templates

Popular:

- `bdfireworks` — Birthday Fireworks Greeting
- `bdbeauty` — Beautiful Birthday Cake with Name
- `bdwrite` — Write Name on Birthday Cake
- `bdtextcake` — Text Birthday Cake
- `bdcake` — Birthday Cake with Name Edit
- `bdwishcake` — Birthday Cake Wishes
- `bdroses` — Birthday Cake Roses with Name

New / featured:

- `bdstrawberry` — Romantic Strawberry Heart Cake
- `bdcustomcake` — Strawberry Chocolate Birthday Cake
- `bdorangrose` — Orange Rose Birthday Cake
- `bdcandles` — Lovely Candles Birthday Cake
- `bdsunflower` — Sunflowers Birthday Cake
- `bdsister` — Birthday Wishes Card for Sister
- `bdcrown` — Birthday Cake with Crown

## Usage examples

Single text input:

```text
-tpneon ABIX-AE
/tpneon ABIX-AE
-epmagic ABIX-AE
/epmagic ABIX-AE
-bdfireworks HAPPY BIRTHDAY JALAL
/bdfireworks HAPPY BIRTHDAY JALAL
```

Multiple text fields use `|` separators:

```text
-tpglitch ABIX | NEON BOT
/tpglitch ABIX | NEON BOT
-epdeadpool SMALL TEXT | LARGE TEXT
/epdeadpool SMALL TEXT | LARGE TEXT
-tpcouple NAME ONE | NAME TWO | EXTRA TEXT
/tpcouple NAME ONE | NAME TWO | EXTRA TEXT
```

For a known template, the generic command accepts a template key or URL:

```text
-textpro neon | ABIX-AE
/textpro neon | ABIX-AE
-ephoto https://en.ephoto360.com/magic-text-effect-278.html | ABIX-AE
/ephoto https://en.ephoto360.com/magic-text-effect-278.html | ABIX-AE
-birthdaycake https://birthdaycake24.com/create-a-happy-birthday-firework-effect-with-name-891.html | JALAL
/birthdaycake https://birthdaycake24.com/create-a-happy-birthday-firework-effect-with-name-891.html | JALAL
```

Each curated template also has its own direct command on both transports. Telegram's `/ephoto` and `/birthdaycake` show inline menu controls; WhatsApp equivalents send a text menu with each individual command.

## Environment options

```dotenv
TEXT_PRO_ENABLED=true
TEXT_PRO_BASE_URL=https://textpro.me
TEXT_PRO_POLL_INTERVAL_MS=3500
TEXT_PRO_MAX_POLL_ATTEMPTS=10
TEXT_PRO_MAX_TEXT_LENGTH=240
TEXT_PRO_MAX_CONCURRENT_JOBS=2
TEXT_PRO_USER_COOLDOWN_MS=7000
TEXT_PRO_NEW_CACHE_MS=600000
TEXT_PRO_VERBOSE=false
```

`TEXT_PRO_ENABLED` controls all three providers. There are no separate API keys for these sites in this Axios flow. `TEXT_PRO_BASE_URL` is retained for compatibility with the CLI/default TextPro configuration; the dual-platform service uses the allowlisted origin configured for each selected site.

## Operational notes

- Generation happens remotely and can take up to about a minute.
- The shared service limits concurrent jobs and applies a per-user cooldown.
- The Telegram transport deletes its temporary output file after upload; the WhatsApp plugin sends the returned image buffer.
- `tpnew`, `epnew`, and `bcnew` try live site listing and use curated fallback catalogs if remote listing fails.
- Search tries the selected provider and falls back to matching known catalog entries when live search is unavailable.
- These are normal public website integrations; the bot does not solve or bypass an interactive CAPTCHA. If a provider changes fields, requires CAPTCHA, or rate-limits requests, generation can fail and return an explanatory error.
