# Google Images plugin for myBOT

Drop-in Google Images search for the existing myBOT command registry.

## Commands

- `-image <query>`
- `-img <query>`
- `-pic <query>`
- `-images <query>`
- `-googleimage <query>`
- `-gis <query>`
- `-imgsafe` / `-imgsafe status`
- `-imgsafe on`
- `-imgsafe off` (configured owner only)

SafeSearch defaults to **ON** and is persisted in `data/google-image-search.json`.
No new npm dependency is required on Node.js 20+.

The plugin tries the native WhatsApp carousel first. When the native payload cannot be sent/rendered, it falls back to individual images plus text navigation so the search does not end in a blank response.
