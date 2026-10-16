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
VERDICT_DIR="" # POS P2.14 ▸ fix2 H3 ◂
while [ $# -gt 0 ]; do
  case "$1" in
    --dry) DRY=1 ;;
    --out) OUT="${2:-}"; shift ;;
    --only) ONLY="${2:-}"; shift ;;
    --verdict) VERDICT_DIR="${2:-}"; shift ;; # POS P2.14 ▸ fix2 H3 ◂
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

# POS P2.14 ▸ fix2 H3/G5: คำตัดสินของโฟลเดอร์ผล — รายการ exit ≠ 0 ยอมรับได้เมื่อ (1) แมนิเฟสต์มี accepted ที่มี evidence และ checks (id ตรงตัว หรือ CRASH)
#   (2) exit = 1 และ log มีบรรทัด JSON_SUMMARY (exit 137 / ไม่มีสรุป = red) (3) id ที่ล้ม (failed ∪ findings คำแรก · crashed = CRASH) อยู่ใน checks ทั้งหมด ·
#   พิมพ์ SET full|partial n/N · HEAD-end/dirty-end — head หรือ dirty ต่างจาก HEAD.txt = red ◂
verdict() {
  python3 - "$MANIFEST" "$1" "$ROOT" "${2:-0}" <<'PY' >> "$1/SUMMARY.txt"
import json, os, subprocess, sys
man = json.load(open(sys.argv[1])); out = sys.argv[2]; root = sys.argv[3]; nset = int(sys.argv[4] or 0)
acc = {s["suite"]: s.get("accepted") for s in man.get("suites", []) if s.get("accepted")}
acc.update({c["name"]: c.get("accepted") for c in man.get("commands", []) if c.get("accepted")})
total = len(man.get("suites", [])) + len(man.get("commands", []))
rows = []
for line in open(os.path.join(out, "SUMMARY.txt")).read().splitlines():
    parts = line.split()
    if len(parts) == 2 and parts[1].lstrip("-").isdigit():
        rows.append((parts[0], int(parts[1])))
n = nset or len(rows)
print(f"SET {'full' if n == total and len(rows) == total else 'partial'} {len(rows)}/{total}")
def ids_of(log):
    j = None
    try:
        for l in open(log, errors="replace"):
            if l.startswith("JSON_SUMMARY "):
                j = json.loads(l[len("JSON_SUMMARY "):])
    except Exception:
        return None
    if j is None:
        return None
    ids = []
    for k in ("failed", "findings"):
        v = j.get(k)
        if isinstance(v, list):
            for x in v:
                t = str(x.get("id", "")) if isinstance(x, dict) else (str(x).split() or [""])[0]
                if t:
                    ids.append(t)
    if j.get("crashed"):
        ids.append("CRASH")
    return ids
red = []
for name, rc in rows:
    if rc == 0:
        continue
    a = acc.get(name)
    why = ""
    if not a:
        why = "ไม่ accepted"
    elif not str(a.get("evidence", "")).strip():
        why = "accepted ไม่มี evidence"
    elif not isinstance(a.get("checks"), list) or not a.get("checks"):
        why = "accepted ไม่มี checks"
    elif rc != 1:
        why = f"exit {rc} (ยอมรับเฉพาะ 1)"
    else:
        ids = ids_of(os.path.join(out, f"{name}.log"))
        if ids is None:
            why = "ไม่มีบรรทัด JSON_SUMMARY"
        else:
            extra = sorted(set(ids) - set(a["checks"]))
            if extra:
                why = f"ล้มนอก accepted.checks: {','.join(extra)}"
    if why:
        print(f"RED {name} {rc} ({why})")
        red.append(name)
    else:
        print(f"ACCEPTED {name} {rc} — {a.get('reason', '')[:120]}")
head0 = dirty0 = None
try:
    for tok in open(os.path.join(out, "HEAD.txt")).read().split():
        if tok.startswith("head="):
            head0 = tok[5:]
        if tok.startswith("dirty="):
            dirty0 = tok[6:]
except Exception:
    pass
head1 = subprocess.run(["git", "-C", root, "rev-parse", "--short=8", "HEAD"], capture_output=True, text=True).stdout.strip()
dirty1 = str(len([l for l in subprocess.run(["git", "-C", root, "status", "--porcelain"], capture_output=True, text=True).stdout.splitlines() if l.strip()]))
print(f"HEAD-end={head1} dirty-end={dirty1}")
if head0 != head1 or dirty0 != dirty1:
    print(f"RED (head/dirty เปลี่ยนระหว่างรัน: เริ่ม head={head0} dirty={dirty0} · จบ head={head1} dirty={dirty1})")
    red.append("HEAD")
print(f"VERDICT {'red' if red else 'green'}" + (f" ({len(red)}: {' '.join(red)})" if red else ""))
PY
}
# POS P2.14 ▸ fix2 H3: --verdict <dir> = คิดคำตัดสินใหม่ของโฟลเดอร์ผลที่มีอยู่ (ทดสอบตัวตัดสิน · ไม่รันอะไร) ◂
if [ -n "$VERDICT_DIR" ]; then
  [ -f "$VERDICT_DIR/SUMMARY.txt" ] || { echo "🔴 ไม่มี $VERDICT_DIR/SUMMARY.txt" >&2; exit 2; }
  sed -i '/^\(SET\|HEAD-end=\|RED\|ACCEPTED\|VERDICT\|DONE\)\b/d' "$VERDICT_DIR/SUMMARY.txt"
  verdict "$VERDICT_DIR" 0
  grep -E '^(SET|HEAD-end=|RED|VERDICT)' "$VERDICT_DIR/SUMMARY.txt"
  case "$(grep '^VERDICT ' "$VERDICT_DIR/SUMMARY.txt" | tail -1)" in "VERDICT green"*) exit 0 ;; *) exit 1 ;; esac
fi

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
# POS P2.14 ▸ fix1 H5 · fix2 H3/G5: คำตัดสิน (ฟังก์ชันเดียว — ใช้ทั้งท้ายการรันและ --verdict <dir>) ◂
verdict "$OUT" 0
VERDICT_LINE="$(grep '^VERDICT ' "$OUT/SUMMARY.txt" | tail -1)"
echo "DONE" >> "$OUT/SUMMARY.txt"
echo "$VERDICT_LINE"
echo "✅ pos-gates-all จบ — $OUT/SUMMARY.txt"
case "$VERDICT_LINE" in "VERDICT green"*) exit 0 ;; *) exit 1 ;; esac # POS P2.14 ▸ fix1 H5: exit ตามคำตัดสิน ◂
