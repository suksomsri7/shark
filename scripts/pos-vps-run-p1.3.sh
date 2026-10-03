#!/usr/bin/env bash
# pos-vps-run-p1.3.sh — CONTROLLER-RUN ของใบ P1.3 บน VPS (ไม่ต้องเปิด Claude บนเครื่อง = ไม่กินโควต้า)
#
# ทำอะไร (ตามลำดับ · ล้มขั้นไหนบันทึก exit แล้วเดินต่อ ยกเว้นด่านก่อนเริ่ม):
#   0 ด่านก่อนเริ่ม: tree ถูกตัว · ไม่มีไฟล์แก้ค้าง · .env.qc / .env.qc4 ชี้ QC4 (ep-frosty-lab) · ff ไปหัว wip/pos-p1.3 · ต่อ DB ได้
#   1 typecheck · fitness (มี/ไม่มี env) · fitness-pos
#   2 ข้อสอบ qc-pos-p1.3 แบบบังคับ ×2 + ไม่บังคับ ×1
#   3 ชุดถดถอย (POS + hotfix + เงิน COMMON §7)
#   4 seed-pos-qc (คืน scripts/pos-expected.json หลังรัน) → build + server :3225 → visual-pos p1.3 (owner · cashier · EN)
#     + หน้าขายเดิมตอนธงปิด (ปิดธงชั่วคราวที่ร้าน QC ครัว → ถ่าย → เปิดคืน)
#   5 รวมผล → commit + push ขึ้น branch ใหม่ `wip/pos-runs-p1.3-<เวลา>` (ไม่แตะ wip/pos-p1.3 · ไม่แตะ main)
#
# ใช้ (บน VPS · Hostinger Web Terminal):
#   cd /root/projects/shark-pos && git pull --ff-only origin session/pos
#   nohup bash scripts/pos-vps-run-p1.3.sh > /root/pos-run-p1.3.log 2>&1 &
#   tail -f /root/pos-run-p1.3.log          # ปิดหน้าต่างได้ งานยังเดิน · จบแล้วบรรทัดสุดท้ายบอกชื่อ branch ผล
#
# ตัวแปร (ไม่ต้องตั้งถ้าใช้ค่าปกติ): TREE=/root/projects/shark-pos-p11 · EXPECT_HEAD=653db842 · PORT=3225
#   ONLY_VISUAL=1 = ข้ามขั้น 1–3 (typecheck/ข้อสอบ/ถดถอย) ทำเฉพาะ seed + build + ภาพ (รอบ 1 ข้อสอบผ่านครบแล้ว)
#   BUILD_HEAP_MB=5632 = heap ของ next build/start (รอบ 1: ค่าปริยาย 3584 ของ acc-v2-serve.sh = OOM)
# 🔴 ห้ามแตะ: main · .env (prod) · QC1–QC3 · พอร์ต 3215 · ไม่ prisma migrate · ไม่ลบข้อมูลนอกร้าน QC POS
set -uo pipefail
# กันรันซ้อน: tree/DB เดียวกันห้ามมีสองรอบพร้อมกัน
exec 9>/tmp/pos-vps-run-p1.3.lock
flock -n 9 || { echo "🔴 มีรอบอื่นกำลังรันอยู่ (lock /tmp/pos-vps-run-p1.3.lock) — ไม่เริ่มซ้ำ"; exit 5; }

TREE="${TREE:-/root/projects/shark-pos-p11}"
EXPECT_HEAD="${EXPECT_HEAD:-653db842}"
PORT="${PORT:-3225}"
ONLY_VISUAL="${ONLY_VISUAL:-0}"
BUILD_HEAP_MB="${BUILD_HEAP_MB:-5632}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="/root/pos-runs/p1.3-$STAMP"
RUNS_BRANCH="wip/pos-runs-p1.3-$STAMP"
SUMMARY="$OUT/SUMMARY.md"
HELPER="scripts/_vps-flag.mts"
N=0

say() { echo "[$(date -u +%H:%M:%S)] $*"; }
die() { say "🔴 STOP: $*"; echo "- 🔴 STOP: $*" >> "$SUMMARY" 2>/dev/null; exit 3; }

mkdir -p "$OUT" || die "mkdir $OUT"
{
  echo "# P1.3 controller run on VPS — $STAMP"
  echo
  echo "| # | step | exit | seconds |"
  echo "|---|---|---|---|"
} > "$SUMMARY"

# run <name> <cmd…> — log เต็มลงไฟล์ · บันทึก exit + เวลาในตาราง · ไม่หยุดเมื่อแดง
run() {
  local name="$1"; shift
  N=$((N + 1))
  local log; log="$OUT/$(printf %02d "$N")-$name.log"
  local t0; t0=$(date +%s)
  say "▶ $N $name"
  ( cd "$TREE" && "$@" ) > "$log" 2>&1
  local ec=$?
  local dt=$(( $(date +%s) - t0 ))
  echo "| $N | $name | $ec | $dt |" >> "$SUMMARY"
  say "  $name → exit $ec (${dt}s)"
  return 0
}

QC4="bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh"

server_stop() { ( cd "$TREE" && ACC_V2_PORT="$PORT" bash scripts/acc-v2-serve.sh stop ) >/dev/null 2>&1 || true; }
helper_rm() { rm -f "$TREE/$HELPER"; }
cleanup() {
  server_stop
  helper_rm
  ( cd "$TREE" && git checkout -q -- scripts/pos-expected.json 2>/dev/null ) || true
}
trap cleanup EXIT
trap 'say "🔴 ถูกสั่งหยุด"; exit 130' INT TERM HUP


# ตัวช่วยเล็ก (ping DB · เปิด/ปิดธง registerV2 ของระบบ POS ในร้าน QC เท่านั้น) — เขียนลง tree ชั่วคราว ลบทันทีหลังใช้
helper_write() {
  cat > "$TREE/$HELPER" <<'TS'
import { loadPosQcEnv } from "./pos-qc-env.mjs";
loadPosQcEnv("vps-flag");
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const [mode, sysId] = process.argv.slice(2);
if (mode === "ping") {
  const r = await P.$queryRawUnsafe("SELECT 1 AS ok");
  console.log("ping ok", JSON.stringify(r));
} else if (mode === "on" || mode === "off") {
  if (!sysId || !sysId.startsWith("posqc-")) throw new Error("QC POS system only");
  const row = await P.appSystem.findUnique({ where: { id: sysId } });
  if (!row || row.type !== "POS") throw new Error("not a POS system: " + sysId);
  const cur = row.settings && typeof row.settings === "object" && !Array.isArray(row.settings) ? row.settings : {};
  const pos = cur.pos && typeof cur.pos === "object" && !Array.isArray(cur.pos) ? cur.pos : {};
  await P.appSystem.update({ where: { id: sysId }, data: { settings: { ...cur, pos: { ...pos, registerV2: mode === "on" } } } });
  console.log("flag", mode, sysId);
} else {
  console.error("usage: ping | on <sysId> | off <sysId>");
  process.exitCode = 2;
}
await P.$disconnect();
TS
}
helper() { helper_write; ( cd "$TREE" && bash scripts/iso.sh bash scripts/qc4.sh pnpm exec tsx "$HELPER" "$@" ); local ec=$?; helper_rm; return $ec; }

# ───────────────────────── 0 ด่านก่อนเริ่ม ─────────────────────────
say "tree $TREE · out $OUT"
[ -d "$TREE/.git" ] || [ -f "$TREE/.git" ] || die "ไม่พบ tree $TREE"
cd "$TREE" || die "cd $TREE"
for f in .env.qc .env.qc4; do
  [ -f "$f" ] || die "ไม่มี $f ใน $TREE"
  for k in DATABASE_URL DIRECT_URL; do
    v="$(grep -m1 "^$k=" "$f" | cut -d= -f2-)"
    case "$v" in *ep-frosty-lab*) : ;; *) die "$f $k ไม่ใช่ QC4 (ep-frosty-lab)" ;; esac
  done
done
grep -q '^SESSION_SECRET=' .env.qc || die ".env.qc ไม่มี SESSION_SECRET (server ต้องใช้)"
dirty="$(git status --porcelain --untracked-files=normal)"
[ -z "$dirty" ] || { echo "$dirty" > "$OUT/dirty.txt"; die "tree มีไฟล์แก้/ไฟล์ใหม่ค้าง (ดู $OUT/dirty.txt) — ส่งรายการให้ผู้คุมงานก่อน ไม่ลบเอง"; }
git fetch -q origin wip/pos-p1.3 session/pos || die "git fetch"
cur="$(git rev-parse --abbrev-ref HEAD)"
[ "$cur" = "wip/pos-p1.3" ] || die "tree อยู่ branch $cur (ต้องเป็น wip/pos-p1.3)"
git merge -q --ff-only origin/wip/pos-p1.3 || die "ff ไป origin/wip/pos-p1.3 ไม่ได้ (มี commit ในเครื่องที่ไม่ได้ push?)"
head="$(git rev-parse --short=8 HEAD)"
case "$head" in "$EXPECT_HEAD"*) : ;; *) die "หัว $head ≠ ที่คาด $EXPECT_HEAD (ตั้ง EXPECT_HEAD ถ้าตั้งใจ)" ;; esac
echo "- head \`$head\` · tree \`$TREE\` · port $PORT" >> "$SUMMARY"
run install pnpm install --frozen-lockfile
helper ping > "$OUT/00-db-ping.log" 2>&1 || die "ต่อ QC4 ไม่ได้ (ดู 00-db-ping.log — รหัสใน .env.qc/.env.qc4 ยังเป็นรหัสเก่า?)"
say "DB ping ok"

if [ "$ONLY_VISUAL" != 1 ]; then
# ───────────────────────── 1 typecheck · fitness ─────────────────────────
run typecheck env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck
run fitness-env bash scripts/iso.sh bash scripts/qc4.sh pnpm fitness
run fitness-noenv env -u DATABASE_URL -u DIRECT_URL -u QC_ENV_FILE pnpm fitness
run fitness-pos env -u DATABASE_URL -u DIRECT_URL bash scripts/iso.sh pnpm exec tsx scripts/fitness-pos.mts

# ───────────────────────── 2 ข้อสอบ P1.3 ─────────────────────────
# QC_FORCE ต้องอยู่ "ข้างใน" wrapper (บทเรียน 1 ต.ค.: ใส่หน้า iso.sh = SKIP หลอก)
run p13-forced-1 $QC4 env QC_FORCE=1 pnpm exec tsx scripts/qc-pos-p1.3.mts
run p13-forced-2 $QC4 env QC_FORCE=1 pnpm exec tsx scripts/qc-pos-p1.3.mts
run p13-unforced $QC4 pnpm exec tsx scripts/qc-pos-p1.3.mts

# ───────────────────────── 3 ถดถอย ─────────────────────────
for s in qc-pos-p1.1 qc-pos-p0.2 qc-pos-register qc-pos-inventory qc-pos-account qc-hf-inventory-atomic qc-hf-pos-page-authz \
         qc-account-cpa qc-restaurant-money qc-shop-refund qc-hotel-money qc-ticket-money qc-subscription-money qc-crm-c2.7 qc-branding-b3; do
  run "$s" $QC4 pnpm exec tsx "scripts/$s.mts"
done

else
  echo "- ONLY_VISUAL=1: ข้ามขั้น 1–3 (ผลข้อสอบอยู่ในรอบก่อน)" >> "$SUMMARY"
fi

# ───────────────────────── 4 seed · build · ภาพ ─────────────────────────
run seed $QC4 pnpm exec tsx scripts/seed-pos-qc.mts
cp -f "$TREE/scripts/pos-expected.json" "$OUT/pos-expected.after-seed.json" 2>/dev/null || true
( cd "$TREE" && git diff --stat -- scripts/pos-expected.json ) > "$OUT/pos-expected.diffstat.txt" 2>&1
( cd "$TREE" && git checkout -q -- scripts/pos-expected.json ) || true   # ไฟล์ tracked — ห้าม commit ผลของ seed

run serve-build env ACC_V2_PORT="$PORT" NODE_OPTIONS="--max-old-space-size=$BUILD_HEAP_MB" bash scripts/acc-v2-serve.sh
if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/login"; then
  B="--base http://127.0.0.1:$PORT"
  run visual-owner   bash scripts/iso.sh bash scripts/qc4.sh pnpm exec tsx scripts/visual-pos.mts p1.3 --user owner   --tenant coffee $B
  run visual-cashier bash scripts/iso.sh bash scripts/qc4.sh pnpm exec tsx scripts/visual-pos.mts p1.3 --user cashier --tenant coffee $B
  run visual-owner-en bash scripts/iso.sh bash scripts/qc4.sh env LOCALE=en pnpm exec tsx scripts/visual-pos.mts p1.3 --user owner --tenant coffee $B
  # หน้าขายเดิมตอนธงปิด (ข้อ N6 ของผู้ตรวจ) — ร้าน QC ครัว · เปิดธงคืนเสมอ
  if helper off posqc-resto-sys-pos > "$OUT/flag-off.log" 2>&1; then
    run visual-legacy-flagoff bash scripts/iso.sh bash scripts/qc4.sh pnpm exec tsx scripts/visual-pos.mts p13-legacy --user owner --tenant resto --page register $B
    helper on posqc-resto-sys-pos > "$OUT/flag-on.log" 2>&1 || say "⚠️ เปิดธงคืนไม่สำเร็จ — ดู flag-on.log (seed-pos-qc รอบหน้าจะเปิดคืนให้)"
  else
    echo "| - | visual-legacy-flagoff | skipped (flag off failed) | - |" >> "$SUMMARY"
  fi
else
  echo "| - | visual-* | skipped (server :$PORT ไม่ตอบ — ดู serve-build log + $TREE/.qc-shots/acc-v2/server.log) | - |" >> "$SUMMARY"
  cp -f "$TREE/.qc-shots/acc-v2/server.log" "$OUT/server.log" 2>/dev/null || true
fi
server_stop
mkdir -p "$OUT/shots"
cp -r "$TREE/.qc-shots/pos/p1.3" "$TREE/.qc-shots/pos/p13-legacy" "$OUT/shots/" 2>/dev/null || true
cp -f "$TREE/.qc-shots/acc-v2/server.log" "$OUT/server.log" 2>/dev/null || true

# residue: tree ต้องสะอาดเหมือนตอนเริ่ม
( cd "$TREE" && git status --porcelain --untracked-files=normal ) > "$OUT/residue-tree.txt"
[ -s "$OUT/residue-tree.txt" ] && echo "- ⚠️ tree มีไฟล์ค้างหลังรัน (ดู residue-tree.txt)" >> "$SUMMARY"

# ───────────────────────── 5 ส่งผลขึ้น git ─────────────────────────
for f in "$OUT"/*.log; do
  { echo; echo "### $(basename "$f") (ท้าย 12 บรรทัด)"; echo '```'; tail -n 12 "$f"; echo '```'; } >> "$SUMMARY"
done
RW="/root/pos-runs/worktree-$STAMP"
cd "$TREE" || exit 3
git worktree add -q -b "$RUNS_BRANCH" "$RW" origin/session/pos || die "สร้าง worktree ผลไม่ได้"
mkdir -p "$RW/ledger/runs/p1.3-$STAMP"
cp -r "$OUT"/. "$RW/ledger/runs/p1.3-$STAMP/"
cd "$RW" || exit 3
git add "ledger/runs/p1.3-$STAMP"
git commit -q --no-verify -m "runs(pos): P1.3 controller run บน VPS $STAMP (head $head)" || die "commit ผลไม่ได้"
ok=0
for i in 1 2 3 4; do git push -q -u origin "$RUNS_BRANCH" && { ok=1; break; }; sleep $((2 ** i)); done
cd "$TREE" && git worktree remove --force "$RW" >/dev/null 2>&1 || true
[ "$ok" = 1 ] || die "push ไม่สำเร็จ — ผลอยู่ใน $OUT"
say "✅ เสร็จ · ผลอยู่ branch $RUNS_BRANCH (และ $OUT) — บอกผู้คุมงานชื่อ branch นี้"
