#!/usr/bin/env bash
# pos-gates-all.sh — POS P2.14 ▸ G1 (มติ 5): ชุดด่าน P2 ("qc:all เขียว" ของ POS) ตามแมนิเฟสต์ scripts/pos-gates.json — รันทีละรายการตามลำดับในแมนิเฟสต์
#   ชุดข้อสอบ: QC4 เท่านั้น (scripts/qc4.sh) ใต้ล็อกของ POS /tmp/shark-gate-pos.lock (with-gate-lock.sh) ใน systemd unit แยก (scripts/iso.sh)
#     forced = env QC_FORCE=1 (ชุดที่มีด่าน SKIP — ของที่ขาดต้องแดง ไม่ใช่ข้าม) · unforced = ไม่ตั้ง QC_FORCE
#   คำสั่ง (fitness ±env · fitness-pos · gen-check · typecheck heap 8192 / ISO_MEM 10500M บนล็อก /tmp/pos-gate.lock · visual --list/--dry) = bash -c <run> ที่รากทรี
#   ผล: /root/pos-runs/p214-close-<ทรี>-<เวลา UTC>/ — HEAD.txt (tree= head= dirty= เวลา) · <name>.log (บรรทัดแรก = HEAD · บรรทัดท้าย EXIT <code>) ·
#        SUMMARY.txt ("<name> <exit>" ต่อรายการตามลำดับแมนิเฟสต์ · แล้ว ACCEPTED/RED ต่อรายการที่ exit ≠ 0 · "VERDICT green|red" · บรรทัดสุดท้าย DONE)
#   POS P2.14 ▸ fix1 H5: VERDICT = green เมื่อทุกรายการ exit 0 หรือ accepted ในแมนิเฟสต์ (accepted ต้องมี evidence · มี checks = ยอมเฉพาะ id เหล่านั้นใน JSON_SUMMARY.failed) ·
#     exit 1 เมื่อ red หรือชื่อใน --only ไม่ตรงแมนิเฟสต์ (บอกชื่อ) · ทรีมีไฟล์ค้าง (dirty > 0) = ไม่รัน (พิมพ์ porcelain) ◂
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

# POS P2.14 ▸ fix1 H5: --only ต้องตรงชื่อในแมนิเฟสต์ทุกชื่อ · ทรีต้องสะอาด ◂
if [ -n "$ONLY" ]; then
  UNMATCHED=""
  IFS=',' read -ra WANT <<< "$ONLY"
  for w in "${WANT[@]}"; do
    [ -z "$w" ] && continue
    printf '%s\n' "$PLAN" | awk -F'\t' -v n="$w" '$2 == n { f = 1 } END { exit f ? 0 : 1 }' || UNMATCHED="$UNMATCHED $w"
  done
  if [ -n "$UNMATCHED" ]; then
    echo "🔴 --only ไม่ตรงแมนิเฟสต์:$UNMATCHED" >&2
    echo "VERDICT red (unmatched --only:$UNMATCHED)"
    exit 1
  fi
fi
PORC="$(git -C "$ROOT" status --porcelain)"
if [ -n "$PORC" ]; then
  echo "🔴 ทรีมีไฟล์ค้าง (dirty $(printf '%s\n' "$PORC" | wc -l)) — commit ก่อนรันชุดด่าน:" >&2
  printf '%s\n' "$PORC" >&2
  exit 2
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
# POS P2.14 ▸ fix1 H5: คำตัดสิน — exit ≠ 0 ที่ไม่ accepted (หรือ accepted แบบ checks แต่ล้มนอกรายการ / ไม่มี evidence) = red ◂
python3 - "$MANIFEST" "$OUT" <<'PY' >> "$OUT/SUMMARY.txt"
import json, os, sys
man = json.load(open(sys.argv[1])); out = sys.argv[2]
acc = {s["suite"]: s.get("accepted") for s in man.get("suites", []) if s.get("accepted")}
acc.update({c["name"]: c.get("accepted") for c in man.get("commands", []) if c.get("accepted")})
red = []
for line in open(os.path.join(out, "SUMMARY.txt")).read().splitlines():
    parts = line.split()
    if len(parts) != 2 or not parts[1].lstrip("-").isdigit() or parts[1] == "0":
        continue
    name, rc = parts
    a = acc.get(name)
    if not a or not str(a.get("evidence", "")).strip():
        print(f"RED {name} {rc}" + (" (accepted ไม่มี evidence)" if a else ""))
        red.append(name)
        continue
    checks = a.get("checks")
    if checks:
        failed = None
        try:
            for l in open(os.path.join(out, f"{name}.log"), errors="replace"):
                if l.startswith("JSON_SUMMARY "):
                    j = json.loads(l[len("JSON_SUMMARY "):])
                    failed = j.get("failed")
                    if j.get("crashed"):
                        failed = ["CRASH"]
        except Exception:
            failed = None
        extra = sorted(set(failed or ["(no JSON_SUMMARY)"]) - set(checks)) if failed is not None else ["(no JSON_SUMMARY)"]
        if extra:
            print(f"RED {name} {rc} (ล้มนอก accepted.checks: {','.join(extra)})")
            red.append(name)
            continue
    print(f"ACCEPTED {name} {rc} — {a.get('reason', '')[:120]}")
print(f"VERDICT {'red' if red else 'green'}" + (f" ({len(red)}: {' '.join(red)})" if red else ""))
PY
VERDICT_LINE="$(grep '^VERDICT ' "$OUT/SUMMARY.txt" | tail -1)"
echo "DONE" >> "$OUT/SUMMARY.txt"
echo "$VERDICT_LINE"
echo "✅ pos-gates-all จบ — $OUT/SUMMARY.txt"
case "$VERDICT_LINE" in "VERDICT green"*) exit 0 ;; *) exit 1 ;; esac
