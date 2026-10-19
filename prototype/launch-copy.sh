#!/bin/sh
set -eu
LAB_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
LAB_PROFILE=$(mktemp -d /tmp/codex-diff-lab.XXXXXX)
mkdir -p "$LAB_PROFILE/User"
cp "$LAB_ROOT/.prototype-runtime/user-data/User/settings.json" "$LAB_PROFILE/User/settings.json"
printf '%s\n' "$LAB_PROFILE" > "$LAB_ROOT/.prototype-runtime/last-profile.txt"
exec "$LAB_ROOT/.prototype-runtime/Codex Diff Lab.app/Contents/MacOS/Code" \
  --user-data-dir "$LAB_PROFILE" \
  --shared-data-dir "$LAB_PROFILE/shared-data" \
  --extensions-dir "$LAB_ROOT/.prototype-runtime/extensions" \
  --new-window \
  --goto "$LAB_ROOT/demo/view-zone-demo.js:4:3"
