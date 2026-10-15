#!/usr/bin/env bash
set -eu

# Run from the ABIX bot project root after extracting the update ZIP.
if [ ! -f "index.js" ] || [ ! -f "lib/telegramBot.js" ]; then
  echo "Run this script from the ABIX bot project root." >&2
  exit 1
fi

rm -f \
  "lib/dropboxUpload.cjs" \
  "plugins2/dropboxup.js" \
  "docs/DROPBOXUP-SOUNDCLOUD.md"

# Preserve a backup before removing old Dropbox-only environment entries.
if [ -f ".env" ] && grep -qE '^[[:space:]]*DROPBOX_[A-Z0-9_]*[[:space:]]*=' ".env"; then
  backup=".env.before-dropbox-removal.$(date +%Y%m%d%H%M%S).bak"
  cp -p ".env" "$backup"
  tmp=".env.dropbox-cleanup.tmp"
  awk '!/^[[:space:]]*DROPBOX_[A-Z0-9_]*[[:space:]]*=/' ".env" > "$tmp"
  mv "$tmp" ".env"
  echo "Removed DROPBOX_* entries from .env (backup: $backup)."
fi

echo "Removed legacy Dropbox files. SoundCloud commands remain enabled."
