# ABIX-AE Pinterest Video Downloader

## Command

`-pindl <Pinterest Pin URL>`

Aliases:

- `-pinterestdl`
- `-pindownload`
- `-pinterestvideo`
- `-pinvideo`
- `-pinterestdownloader`

## Why the old video was not playable

The previous sender could fall back to sending a remote URL as a WhatsApp `video` object without first checking the response bytes. Pinterest/CDN URLs can expire or return HTML/JSON error pages. WhatsApp then receives a tiny non-video file, which appears as a grey/blank media item such as the ~0.9 KB file shown in the reported screenshot.

## Current flow

1. Resolve the public Pin through the configured Apify Pinterest video actor.
2. Use the bot's existing `APIFY_TOKEN_1 ... APIFY_TOKEN_N` token pool.
3. Collect multiple video URL variants returned by the actor.
4. Download the bytes server-side.
5. Reject HTML/JSON/error responses and empty files.
6. Reject files above 50 MB.
7. Send normal MP4 directly when the bytes are already ISO-BMFF/MP4.
8. Convert WebM/other supported video containers to H.264/AAC MP4 with the system `ffmpeg` when required.
9. Send the verified MP4 buffer to WhatsApp; never send an unverified CDN URL as a video.

## Environment

```env
APIFY_TOKEN_1=your_token
APIFY_TOKEN_2=your_token
APIFY_TOKEN_3=your_token
# ...
APIFY_TOKEN_10=your_token

# Optional actor override
PINTEREST_VIDEO_ACTOR=maximedupre~pinterest-video-downloader
```

The implementation also accepts higher token indexes and the compatibility names `APIFY_TOKEN` and `APIFY_API_TOKEN`.

## Abix

The project root contains `package.json` and `.npmrc`. There is no `pin_v3/` duplicate directory. The active files are:

```text
lib/pinterestDownloader.js
plugins2/pindl.js
install-pinterest-plugin.js
```

Restart after updating the archive:

```bash
npm install
npm start
```

Then test:

```text
-pindl https://www.pinterest.com/pin/930556341749585575/
```
