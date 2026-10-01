#!/usr/bin/env bash
# cd2: export SESSION_SECRET from .env.qc3 (value never printed) then exec the command — for probes that do not load the QC env file
#   (systemd-run expands $… in its argv, so this cannot be an inline `bash -c` under iso.sh)
set -euo pipefail
cd "$(dirname "$0")/../../.."
SESSION_SECRET="$(grep -m1 '^SESSION_SECRET=' .env.qc3 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
[ "${#SESSION_SECRET}" -ge 32 ] || { echo "🔴 with-qc3-secret: no SESSION_SECRET in .env.qc3" >&2; exit 9; }
export SESSION_SECRET
exec "$@"
