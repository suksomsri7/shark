#!/usr/bin/env bash
# pos-gates-all.sh — POS P2.14 ▸ G1 (มติ 5): ชุดด่าน P2 ("qc:all เขียว" ของ POS) ตามแมนิเฟสต์ scripts/pos-gates.json — รันทีละรายการตามลำดับในแมนิเฟสต์
#   ชุดข้อสอบ: QC4 เท่านั้น (scripts/qc4.sh) ใต้ล็อกของ POS /tmp/shark-gate-pos.lock (with-gate-lock.sh) ใน systemd unit แยก (scripts/iso.sh)
#     forced = env QC_FORCE=1 (ชุดที่มีด่าน SKIP — ของที่ขาดต้องแดง ไม่ใช่ข้าม) · unforced = ไม่ตั้ง QC_FORCE
#   คำสั่ง (fitness ±env · fitness-pos · gen-check · typecheck heap 8192 / ISO_MEM 10500M บนล็อก /tmp/pos-gate.lock · visual --list/--dry) = bash -c <run> ที่รากทรี
#   ผล: /root/pos-runs/p214-close-<ทรี>-<เวลา UTC>/ — HEAD.txt (tree= head= dirty= เวลา) · <name>.log (บรรทัดแรก = HEAD · บรรทัดท้าย EXIT <code>) ·
#        SUMMARY.txt ("<name> <exit>" ต่อรายการตามลำดับแมนิเฟสต์ · บรรทัดสุดท้าย DONE)
# ใช้: bash scripts/pos-gates-all.sh [--dry] [--out <dir>] [--only <name,name,…>]
#   --dry = พิมพ์ "PLAN <name> <forced|unforced|command>" ทุกรายการตามลำดับ แล้วจบ (ไม่รันอะไร · ไม่แตะ DB)
#   รันยาว (≈ 1 ชม.): systemd-run --unit=pos-gates-$(date +%s) --collect /usr/bin/bash <ทรี>/scripts/pos-gates-all.sh
# 🔴 ไม่ส่งออก CI (with-gate-lock.sh ข้าม flock เมื่อ CI ถูกตั้ง) — ล้าง CI/VERCEL ของสภาพแวดล้อมก่อนเสมอ · path เต็มทุกที่ (systemd-run ไม่สืบ cwd) · ไม่ใช้ cd
set -uo pipefail
unset CI VERCEL
ROOT="$(dirname "$(readlink -f "$0")")/.."
ROOT="$(readlink -f "$ROOT")"
MANIFEST="$ROOT/scripts/pos-gates.json"
[ -f "$MANIFEST" ] || { echo "🔴 ไม่มี $MANIFEST" >&2; exit 2; }

DRY=0
OUT=""
ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry) DRY=1 ;;
    --out) OUT="${2:-}"; shift ;;
    --only) ONLY="${2:-}"; shift ;;
    *) echo "🔴 ไม่รู้จักอาร์กิวเมนต์ $1" >&2; exit 2 ;;
  esac
  shift
done

# แมนิเฟสต์ → บรรทัด "<kind>\t<name>\t<mode|run>" ตามลำดับ (ชุดก่อน แล้วคำสั่ง)
PLAN="$(python3 - "$MANIFEST" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
for s in m.get("suites", []):
    print("suite\t%s\t%s" % (s["suite"], s["mode"]))
for c in m.get("commands", []):
    print("command\t%s\t%s" % (c["name"], c["run"].replace("\t", " ")))
PY
)" || { echo "🔴 อ่าน $MANIFEST ไม่ได้" >&2; exit 2; }

# กติกาของ typecheck ในแมนิเฟสต์ (heap 8192 · ISO_MEM 10500M · ล็อกเครื่อง /tmp/pos-gate.lock) — ไม่ตรง = ไม่รัน (กัน OOM / แย่งล็อกกับ build)
TYPECHECK_MEM="10500M"
TYPECHECK_LOCK="/tmp/pos-gate.lock"
TC_RUN="$(printf '%s\n' "$PLAN" | awk -F'\t' '$1 == "command" && $2 == "typecheck" { print $3 }')"
case "$TC_RUN" in
  *"$TYPECHECK_MEM"*) case "$TC_RUN" in *"$TYPECHECK_LOCK"*) ;; *) echo "🔴 typecheck ในแมนิเฟสต์ไม่ถือ $TYPECHECK_LOCK" >&2; exit 2 ;; esac ;;
  *) echo "🔴 typecheck ในแมนิเฟสต์ไม่ใช้ ISO_MEM=$TYPECHECK_MEM" >&2; exit 2 ;;
esac

if [ "$DRY" -eq 1 ]; then
  while IFS=$'\t' read -r kind name rest; do
    [ -z "$kind" ] && continue
    if [ "$kind" = "suite" ]; then echo "PLAN $name $rest"; else echo "PLAN $name command"; fi
  done <<< "$PLAN"
  exit 0
fi

TREE="$(basename "$ROOT")"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
[ -n "$OUT" ] || OUT="/root/pos-runs/p214-close-${TREE}-${STAMP}"
mkdir -p "$OUT"
HEADLINE="tree=$ROOT head=$(git -C "$ROOT" rev-parse --short=8 HEAD) dirty=$(git -C "$ROOT" status --porcelain | wc -l) $(date -u +%FT%TZ)"
echo "$HEADLINE" > "$OUT/HEAD.txt"
: > "$OUT/SUMMARY.txt"
echo "🟢 pos-gates-all → $OUT"

wanted() { [ -z "$ONLY" ] && return 0; case ",$ONLY," in *",$1,"*) return 0 ;; esac; return 1; }

while IFS=$'\t' read -r kind name rest; do
  [ -z "$kind" ] && continue
  wanted "$name" || continue
  LOG="$OUT/$name.log"
  echo "$HEADLINE" > "$LOG"
  if [ "$kind" = "suite" ]; then
    if [ "$rest" = "forced" ]; then FORCE=(env QC_FORCE=1); else FORCE=(env); fi
    # QC4 + ล็อก POS + unit แยก (iso.sh cd ไปรากทรีเอง) · ชุดใหญ่ (p2.14 สองโปรเซสลูก) ใช้ ISO_MEM 7G
    MEM="5G"; [ "$name" = "qc-pos-p2.14" ] && MEM="7G"
    ISO_MEM="$MEM" bash "$ROOT/scripts/iso.sh" "${FORCE[@]}" bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$name.mts" >> "$LOG" 2>&1
    RC=$?
  else
    # คำสั่งของแมนิเฟสต์ (typecheck = env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M … flock /tmp/pos-gate.lock) ที่รากทรี
    env -C "$ROOT" bash -c "$rest" >> "$LOG" 2>&1
    RC=$?
  fi
  echo "EXIT $RC" >> "$LOG"
  echo "$name $RC" >> "$OUT/SUMMARY.txt"
  echo "  $name → $RC"
done <<< "$PLAN"
echo "DONE" >> "$OUT/SUMMARY.txt"
echo "✅ pos-gates-all จบ — $OUT/SUMMARY.txt"
