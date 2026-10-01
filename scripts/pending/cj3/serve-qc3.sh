#!/usr/bin/env bash
# C4.4-fix3 (J3): production build + `next start` of THIS worktree on port 3219 against QC3 (screenshots / journeys) · stop = `… stop`
# Use (env comes ONLY from $QC_ENV_FILE set by scripts/qc3.sh — values never printed):
#   bash scripts/qc3.sh bash scripts/pending/cj3/serve-qc3.sh [build|start|stop]
set -euo pipefail
cd "$(dirname "$0")/../../.."
ROOT="$PWD"; PORT=3219; OUT="$ROOT/.qc-shots/crm/cj3"; PIDFILE="$OUT/server.pid"; LOGFILE="$OUT/server.log"
mkdir -p "$OUT"
CMD="${1:-build}"
alive() { [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }
if [ "$CMD" = stop ]; then
  if alive; then PID="$(cat "$PIDFILE")"; kill -TERM -"$(ps -o pgid= "$PID" | tr -d ' ')" 2>/dev/null || kill "$PID" 2>/dev/null || true; sleep 1; kill -9 "$PID" 2>/dev/null || true; echo "stopped $PID"; fi
  rm -f "$PIDFILE"; exit 0
fi
case "${QC_ENV_FILE:-}" in *.env.qc3) : ;; *) echo "run me through scripts/qc3.sh" >&2; exit 4 ;; esac
readarray -d '' ENVARR < <(node -e '
const fs = require("fs");
const out = [];
for (const line of fs.readFileSync(process.argv[1], "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z_0-9]*)=(.*)$/);
  if (!m) continue;
  if (["APP_URL", "WEBHOOK_ALLOW_PRIVATE", "PORT"].includes(m[1])) continue;
  out.push(m[1] + "=" + m[2].replace(/^"(.*)"$/, "$1"));
}
const db = out.find((x) => x.startsWith("DATABASE_URL="));
if (!db || !db.includes("ep-weathered-river")) { console.error("NOT_QC3"); process.exit(1); }
if (!out.some((x) => x === "APP_ENV=development")) { console.error("APP_ENV must be development"); process.exit(1); }
process.stdout.write(out.join("\0") + "\0");
' "$QC_ENV_FILE")
EXTRA=(APP_URL="http://127.0.0.1:$PORT" WEBHOOK_ALLOW_PRIVATE=1 QC_OTP_PREVIEW=1)
export NODE_OPTIONS="--max-old-space-size=5120"
if [ "$CMD" = build ]; then
  env "${ENVARR[@]}" "${EXTRA[@]}" bash "$ROOT/scripts/with-gate-lock.sh" pnpm exec next build > "$OUT/build.log" 2>&1 || { tail -30 "$OUT/build.log"; exit 1; }
  tail -5 "$OUT/build.log"
fi
alive && { echo "already running"; exit 0; }
: > "$LOGFILE"
setsid env "${ENVARR[@]}" "${EXTRA[@]}" PORT="$PORT" pnpm exec next start -p "$PORT" >> "$LOGFILE" 2>&1 &
echo $! > "$PIDFILE"
for i in $(seq 1 60); do
  curl -sf -o /dev/null "http://127.0.0.1:$PORT/login" && { echo "up on $PORT (pid $(cat "$PIDFILE"))"; exit 0; }
  alive || { echo "server died"; tail -20 "$LOGFILE"; exit 1; }
  sleep 2
done
echo "not answering"; tail -20 "$LOGFILE"; exit 1
