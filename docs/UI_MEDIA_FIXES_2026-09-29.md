# UI & Media Fixes — 2026-09-29

- `-menu` defaults to native quick-reply UI with three buttons matching the takeIDEA pattern.
- `-menu categories` uses a native `single_select` menu so category rows are vertically scrollable.
- `-slidermenu` remains the horizontal media carousel and now receives the full native-flow `biz` + `quality_control` relay nodes.
- Native interactive UI is the default; set `ABIX_NATIVE_INTERACTIVE=false` only to force text fallback.
- Interactive reply parsing now accepts the common native-flow selection field variants.
- Duplicate `image` registration was removed; Google Images is the canonical `-image/-img` command.
- Duplicate `googleimage` alias was removed from legacy `gimage`, eliminating command/alias shadowing.
- Google Image Search tries the established `ischj` response, balanced JSON extraction, and a normal `tbm=isch` HTML fallback. SafeSearch follows the owner-controlled setting.
- `-nekogif` downloads the GIF/video source, transcodes it to browser/WhatsApp-friendly MP4, and sends with `gifPlayback:true`.
- `-nekogif sticker <category>` converts the fetched animation directly to an animated WebP sticker.
- `-gif2sticker` accepts replied video/GIF/document media and uses system `ffmpeg`, with `FFMPEG_PATH` override.
- The corrected Font Downloader remains in `plugin3` and its loader bridge remains in `plugins2`.

Live WhatsApp-client rendering and live API calls still require runtime testing on KataBump/WhatsApp.
