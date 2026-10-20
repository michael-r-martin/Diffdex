#!/bin/sh
set -eu
LAB_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
LAB_PROFILE=''
if [ -f "$LAB_ROOT/.prototype-runtime/last-profile.txt" ]; then
  LAB_PROFILE=$(cat "$LAB_ROOT/.prototype-runtime/last-profile.txt")
fi
if [ -z "$LAB_PROFILE" ] || [ ! -d "$LAB_PROFILE" ]; then
  LAB_PROFILE=$(mktemp -d /tmp/codex-diff-lab.XXXXXX)
  mkdir -p "$LAB_PROFILE/User"
  cp "$LAB_ROOT/.prototype-runtime/user-data/User/settings.json" "$LAB_PROFILE/User/settings.json"
fi
printf '%s\n' "$LAB_PROFILE" > "$LAB_ROOT/.prototype-runtime/last-profile.txt"
# Restricted Mode disables even built-in extensions located inside the workspace.
# Clone the bundled resources outside the checkout; preserve workspace trust.
if [ ! -d "$LAB_PROFILE/builtin-extensions" ]; then
  cp -cR "$LAB_ROOT/.prototype-runtime/Codex Diff Lab.app/Contents/Resources/app/extensions" "$LAB_PROFILE/builtin-extensions"
fi
# LaunchServices owns the GUI process, not the invoking Terminal session.
# A separate launch keeps our profile isolated from normal VS Code; Electron
# forwards repeated launches to the instance already using this profile.
exec /usr/bin/open -n "$LAB_ROOT/.prototype-runtime/Codex Diff Lab.app" --args \
  --user-data-dir "$LAB_PROFILE" \
  --shared-data-dir "$LAB_PROFILE/shared-data" \
  --builtin-extensions-dir "$LAB_PROFILE/builtin-extensions" \
  --extensions-dir "$LAB_ROOT/.prototype-runtime/extensions" \
  --extensionDevelopmentPath "$LAB_ROOT" \
  --reuse-window \
  "$LAB_ROOT"
