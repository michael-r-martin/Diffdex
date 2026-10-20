#!/bin/sh
# Finder-friendly entry point; LaunchServices detaches the GUI from Terminal.
set -eu
LAB_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec /bin/sh "$LAB_ROOT/prototype/launch-copy.sh"
