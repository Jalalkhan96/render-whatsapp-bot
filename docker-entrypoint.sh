#!/bin/sh
set -eu

APP_ROOT="${APP_ROOT:-/app}"
PERSISTENT_DATA_DIR="${PERSISTENT_DATA_DIR:-/var/data}"
mkdir -p "$PERSISTENT_DATA_DIR"

persist_dir() {
  app_path="$1"
  disk_name="$2"
  disk_path="$PERSISTENT_DATA_DIR/$disk_name"

  if [ -L "$app_path" ]; then
    current_target="$(readlink -f "$app_path" 2>/dev/null || true)"
    if [ "$current_target" = "$disk_path" ]; then return 0; fi
    rm -f "$app_path"
  fi

  mkdir -p "$disk_path"
  if [ -d "$app_path" ]; then
    # Copy new shipped defaults without overwriting live user state.
    cp -an "$app_path"/. "$disk_path"/ 2>/dev/null || true
  fi

  rm -rf "$app_path"
  mkdir -p "$(dirname "$app_path")"
  ln -s "$disk_path" "$app_path"
}

persist_file() {
  app_path="$1"
  disk_name="$2"
  disk_path="$PERSISTENT_DATA_DIR/$disk_name"

  if [ -L "$app_path" ]; then
    current_target="$(readlink -f "$app_path" 2>/dev/null || true)"
    if [ "$current_target" = "$disk_path" ]; then return 0; fi
    rm -f "$app_path"
  fi

  mkdir -p "$(dirname "$disk_path")"
  if [ ! -e "$disk_path" ] && [ -f "$app_path" ]; then cp -p "$app_path" "$disk_path"; fi
  rm -f "$app_path"
  mkdir -p "$(dirname "$app_path")"
  ln -s "$disk_path" "$app_path"
}

persist_dir "$APP_ROOT/data" data
persist_dir "$APP_ROOT/database" database
persist_dir "$APP_ROOT/plugins2/wa-broadcast-suite/auth" broadcast-auth
persist_file "$APP_ROOT/baileys_store.json" baileys_store.json
mkdir -p "${SESSION_DIR:-$PERSISTENT_DATA_DIR/session}" "$APP_ROOT/tmp" "$APP_ROOT/temp"

exec "$@"
