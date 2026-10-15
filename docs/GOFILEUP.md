# ABIX -gofileup

Reply to an image, video, audio file, sticker, or document and send:

```text
-gofileup
```

The bot downloads the replied WhatsApp media to a temporary file, uploads it to GoFile's public upload endpoint, replies **after the upload has completed**, then deletes the temporary file.

Aliases:

```text
gfu
gofup
gofileupload
```

Optional environment variables:

```env
GOFILE_UPLOAD_ENDPOINT=https://upload.gofile.io/uploadfile
GOFILE_UPLOAD_TIMEOUT_MS=1800000
GOFILEUP_MAX_MB=200
GOFILE_API_TOKEN=
```

`GOFILE_API_TOKEN` is optional. Without it, GoFile's guest upload flow is used. Do not place credentials in the command or user-visible messages.
