#!/usr/bin/env bash
# เซิร์ฟเวอร์ QC ของงานบัญชี V2 — build + start บน DB QC (`.env.qc`) ที่พอร์ต 3215
#
# ใช้:
#   bash scripts/acc-v2-serve.sh          # build (ผ่าน gate lock) → start → รอจนหน้าตอบ
#   bash scripts/acc-v2-serve.sh start    # ข้าม build — ใช้ .next เดิม (ของ build ล่าสุด) → start ตรง ๆ
#                                          # (WO 1.6 รอบ 4: ให้ sub-agent ไล่ debug ฝั่ง client ซ้ำได้เร็วโดยไม่ต้อง
#                                          #  build ใหม่ทุกรอบ — ใช้ได้เฉพาะตอนยังไม่ได้แก้โค้ดฝั่ง app หลัง build ล่าสุด)
#   bash scripts/acc-v2-serve.sh stop     # ปิด
#   bash scripts/acc-v2-serve.sh status   # ดูว่ายังรันอยู่ไหม
#
# 🔴 ต้องเป็น production build ไม่ใช่ `next dev` — dev ไม่ hydrate ใน headless (บทเรียน 13 ส.ค.)
# 🔴 env มาจาก `.env.qc` เท่านั้น (`.env` = prod) · ไม่ source ไฟล์ตรง ๆ เพราะค่ามี & ในสตริง
#    (`A=b&c` ใน bash จะกลายเป็นสั่ง `c` เบื้องหลัง) → อ่านผ่าน node แล้วส่งเป็น env ให้ลูก
# 🔴 build เดินผ่าน scripts/with-gate-lock.sh — เครื่อง 2 คอร์ ห้าม build ซ้อนกับ session อื่น
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
PORT="${ACC_V2_PORT:-3215}"
OUT="$ROOT/.qc-shots/acc-v2"
PIDFILE="$OUT/server.pid"
LOGFILE="$OUT/server.log"
ENVFILE="$ROOT/.env.qc"
CMD="${1:-build}"

mkdir -p "$OUT"

alive() { [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }

stop() {
  if alive; then
    PID="$(cat "$PIDFILE")"
    # next start แตกลูก → ฆ่าทั้งกลุ่ม (ไม่งั้นพอร์ตค้างและรอบหน้า build เสร็จแล้ว start ไม่ขึ้น)
    kill -TERM -"$(ps -o pgid= "$PID" | tr -d ' ')" 2>/dev/null || kill "$PID" 2>/dev/null || true
    sleep 1
    kill -9 "$PID" 2>/dev/null || true
    echo "🛑 ปิดเซิร์ฟเวอร์ QC (pid $PID) แล้ว"
  else
    echo "(ไม่มีเซิร์ฟเวอร์ QC ทำงานอยู่)"
  fi
  rm -f "$PIDFILE"
}

case "$CMD" in
  stop) stop; exit 0 ;;
  status)
    if alive; then echo "🟢 กำลังทำงาน pid $(cat "$PIDFILE") ที่ http://127.0.0.1:$PORT"; else echo "⚪ ไม่ได้ทำงาน"; fi
    exit 0
    ;;
  build) DO_BUILD=1 ;;
  start) DO_BUILD=0 ;;
  *) echo "ใช้: acc-v2-serve.sh [build|start|stop|status]"; exit 1 ;;
esac

[ -f "$ENVFILE" ] || { echo "❌ ไม่พบ $ENVFILE — ดู ledger/wo-notes/0.1.md"; exit 1; }

# อ่าน .env.qc → อาเรย์ KEY=VALUE (คั่นด้วย NUL) + กันชี้ production
readarray -d '' ENVARR < <(node -e '
const fs = require("fs");
const out = [];
for (const line of fs.readFileSync(process.argv[1], "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z_0-9]*)=(.*)$/);
  if (!m) continue;
  out.push(m[1] + "=" + m[2].replace(/^"(.*)"$/, "$1"));
}
const db = out.find((x) => x.startsWith("DATABASE_URL="));
if (!db || db.includes("ep-royal-night")) { console.error("PROD_DB"); process.exit(1); }
if (!out.some((x) => x === "APP_ENV=development")) { console.error("APP_ENV ต้องเป็น development"); process.exit(1); }
process.stdout.write(out.join("\0") + "\0");
' "$ENVFILE")

if alive; then
  echo "🟢 เซิร์ฟเวอร์ QC ทำงานอยู่แล้ว (pid $(cat "$PIDFILE")) — ข้าม build"
  exit 0
fi

if [ "$DO_BUILD" = 1 ]; then
  echo "🔨 build (ต่อคิว gate lock — อาจรอถ้ามี session อื่น build อยู่)…"
  env "${ENVARR[@]}" bash "$ROOT/scripts/with-gate-lock.sh" pnpm exec next build 2>&1 | tail -25
else
  [ -d "$ROOT/.next" ] || { echo "❌ ไม่มี .next อยู่เลย — ต้อง 'bash scripts/acc-v2-serve.sh build' (หรือเปล่า arg) ก่อนอย่างน้อย 1 ครั้ง"; exit 1; }
  echo "⏭️  ข้าม build — ใช้ .next เดิม (โค้ดฝั่ง app ต้องไม่เปลี่ยนตั้งแต่ build ล่าสุด ไม่งั้นภาพ/ผลไม่ตรงโค้ดจริง)"
fi

echo "🚀 start ที่ http://127.0.0.1:$PORT (log: $LOGFILE)"
: > "$LOGFILE"
setsid env "${ENVARR[@]}" PORT="$PORT" pnpm exec next start -p "$PORT" >> "$LOGFILE" 2>&1 &
echo $! > "$PIDFILE"

for i in $(seq 1 60); do
  if curl -sf -o /dev/null "http://127.0.0.1:$PORT/login"; then
    echo "✅ พร้อมใช้งานที่ http://127.0.0.1:$PORT (pid $(cat "$PIDFILE"))"
    exit 0
  fi
  alive || { echo "❌ เซิร์ฟเวอร์ตายระหว่างสตาร์ท:"; tail -20 "$LOGFILE"; exit 1; }
  sleep 2
done
echo "❌ รอ 120 วิแล้วหน้ายังไม่ตอบ:"; tail -20 "$LOGFILE"; stop; exit 1
