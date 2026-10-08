#!/usr/bin/env bash
# CRM C4.2-fix + C4.4-fix2 ▸ production build + `next start` of THIS worktree (shark-crm-cui) on port 3218 against QC1 ◂
#   (modelled on scripts/pending/c44f/serve-qc3.sh — that one targets QC3; this one asserts the QC1 host)
# Use (as a systemd unit so the server survives the caller; values from .env.qc are never printed):
#   systemd-run --unit=cui-serve-N --collect -p RemainAfterExit=yes -p WorkingDirectory=$PWD --setenv=PATH=$PATH \
#     bash scripts/pending/cui/serve-qc1.sh [build|start]
#   bash scripts/pending/cui/serve-qc1.sh stop
# 🔴 port 3215 = the controller's server — never touched here · build goes through scripts/with-gate-lock.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
ROOT="$PWD"; PORT=3218; OUT="$ROOT/.qc-shots/crm/cui"; PIDFILE="$OUT/server.pid"; LOGFILE="$OUT/server.log"
mkdir -p "$OUT"
CMD="${1:-build}"
alive() { [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }
if [ "$CMD" = stop ]; then
  if alive; then PID="$(cat "$PIDFILE")"; kill -TERM -"$(ps -o pgid= "$PID" | tr -d ' ')" 2>/dev/null || kill "$PID" 2>/dev/null || true; sleep 1; kill -9 "$PID" 2>/dev/null || true; echo "stopped $PID"; fi
  rm -f "$PIDFILE"; exit 0
fi
case "$ROOT" in */shark-crm-cui) : ;; *) echo "not the cui worktree" >&2; exit 4 ;; esac
ENVFILE="$ROOT/.env.qc"
[ -f "$ENVFILE" ] || { echo "no .env.qc" >&2; exit 2; }
readarray -d '' ENVARR < <(node -e '
const fs = require("fs");
const out = [];
for (const line of fs.readFileSync(process.argv[1], "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z_0-9]*)=(.*)$/);
  if (!m) continue;
  if (["APP_URL", "WEBHOOK_ALLOW_PRIVATE", "PORT", "SHARK_AI_MOCK", "QC_OTP_PREVIEW"].includes(m[1])) continue;
  out.push(m[1] + "=" + m[2].replace(/^"(.*)"$/, "$1"));
}
for (const k of ["DATABASE_URL=", "DIRECT_URL="]) {
  const v = out.find((x) => x.startsWith(k));
  if (!v || !v.includes("ep-plain-art") || v.includes("ep-royal-night")) { console.error("NOT_QC1 (" + k.slice(0, -1) + ")"); process.exit(1); }
}
if (!out.some((x) => x === "APP_ENV=development")) { console.error("APP_ENV must be development"); process.exit(1); }
process.stdout.write(out.join("\0") + "\0");
' "$ENVFILE")
EXTRA=(APP_URL="http://127.0.0.1:$PORT" SHARK_AI_MOCK=1 QC_OTP_PREVIEW=1)
export NODE_OPTIONS="--max-old-space-size=5120"
if [ "$CMD" = build ]; then
  if alive; then echo "server running — stop it before building" >&2; exit 3; fi
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
