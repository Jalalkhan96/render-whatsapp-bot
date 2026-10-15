# Google Fonts plugin for myBOT

Implementation: `plugin3/googleFonts.js`
Loader bridge: `plugins2/googleFonts-loader.js`

No new npm package is required. The plugin uses Node.js 20+ `fetch()`.

## Commands

- `-fontmenu` — font menu
- `-font random` — random Google Font
- `-font random urdu` — random Urdu-supporting Google Font
- `-font urdu` — random Urdu font
- `-font language <language>` — random font for a supported language
- `-font name <font name> [style] [size]` — download a named font
- `-font search <name>` — search the built-in list, or full Google Fonts metadata when an API key is configured
- `-font styles <font name>` — probe common styles
- `-font <font name> [style] [size]` — direct shorthand

Examples:

```text
-fontmenu
-font random
-font urdu
-font language Arabic bold 32
-font name Poppins bold 32
-font name Noto Nastaliq Urdu regular 40
-font styles Poppins
```

`size` is treated as the requested preview/metadata size and is limited to 10–96px. Google Fonts' downloadable files do not have a font "size" parameter; style/weight selects the font variant.

## Download format

When `GOOGLE_FONTS_API_KEY` is configured, the plugin prefers the Google Fonts Developer API and downloads TTF when available. Without a key, it falls back to the public Google Fonts CSS2 endpoint and downloads WOFF2.

The Developer API exposes family metadata, variants, subsets, and file URLs; its `webfonts.list` endpoint requires an API key. citeturn325589search2turn554439search0

The public CSS2 API supports family/style requests and delivers browser-specific font files through the stylesheet endpoint. citeturn106032search0turn106032search5

## Integration

`myBOT` normally scans `plugins2/`, so the small bridge keeps the actual implementation inside `plugin3/` without requiring the whole `plugin3/` experimental directory to become command modules.
