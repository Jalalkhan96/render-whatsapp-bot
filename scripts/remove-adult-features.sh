#!/usr/bin/env bash
set -euo pipefail
ROOT="$(pwd)"
if [[ ! -f "$ROOT/package.json" || ! -d "$ROOT/lib" || ! -d "$ROOT/plugins2" ]]; then
  echo "Run this script from the ABIX bot root directory." >&2
  exit 2
fi
remove_path() {
  local target="$1"
  if [[ -e "$ROOT/$target" ]]; then
    rm -rf -- "$ROOT/$target"
    printf 'Removed %s\n' "$target"
  fi
}
remove_path "plugins2/nadd/engines/licensed-adult-finder"
remove_path "plugins2/video-downloader-suite/app/extractors/adult"
remove_path "plugins2/video-downloader-suite/tests/test_adult_extractors.py"
remove_path "plugins2/video-downloader-suite/scripts/test_adult_extractors.py"
remove_path "database/neko_settings.json"
echo "Adult command/source removal complete. Restart both WhatsApp and Telegram bot processes."
