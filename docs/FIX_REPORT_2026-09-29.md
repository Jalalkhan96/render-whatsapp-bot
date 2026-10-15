# myBOT UI / Google Images / Nekogif Fix Report — 2026-09-29

## Menu
- `-menu` now defaults to native quick-reply buttons, matching the 3-button takeIDEA pattern.
- `-menu categories` uses `single_select` rows for a scrollable category picker.
- Stable IDs: `menu_categories`, `menu_all`, `menu_group`, `menu_category:<category>`, `menu_open:<command>`.
- `-slidermenu` remains a real horizontal carousel with image cards and NEXT/BACK navigation.
- Native interactive relay nodes include `biz`, `interactive/native_flow`, and `quality_control`; private chats also receive `bot biz_bot=1`.
- Native UI is default. `ABIX_NATIVE_INTERACTIVE=false` intentionally forces text fallback.

## Google Images
- Removed duplicate `image` registration from the legacy image plugin.
- Removed duplicate `googleimage` alias from `gimage`.
- Google Images is now the only canonical `image/img/images/googleimage/gis` command path.
- Parser supports the known Google `ischj` response and a guarded HTML URL fallback.
- The request uses SafeSearch `active` by default and the owner-only `-imgsafe on/off/status` control.

## Nekogif / sticker
- `-nekogif <category>` fetches the source, converts GIF/WebM/MP4 to a WhatsApp-friendly MP4, and sends it as playable `gifPlayback`.
- `-nekogif sticker <category>` converts the fetched animation into a real animated WebP sticker.
- `-gif2sticker` accepts replied video/GIF/document media and validates animated WebP output.
- System `ffmpeg` is used when available, with `FFMPEG_PATH` override.

## Validation
- All JS/MJS syntax checks: PASS.
- Command duplicate/forbidden scan: PASS (0 duplicates; 0 forbidden declarations).
- Menu/action/media static tests: PASS.
- Protected downloader files `-dl` and `-gdl` unchanged.
- Live WhatsApp Android/iOS rendering: NOT TESTABLE in sandbox.
- Live Google / NekosBest network calls: NOT TESTABLE in sandbox because outbound DNS is unavailable.
