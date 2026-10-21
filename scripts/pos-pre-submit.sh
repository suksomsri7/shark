#!/usr/bin/env bash
# pos-pre-submit.sh — ผู้คุม POS (B · 21 ต.ค. 2026 · มติเจ้าของ "ประหยัด token แต่คุณภาพเท่าเดิม" ข้อ 2):
#   ชุดมาตรฐานก่อนส่งงานของ builder = suite ของใบ (forced ×2 + --no-db) + ชุด regression จากแมนิเฟสต์ (ผ่าน pos-gates-all.sh --only)
#   แล้วพิมพ์ "ตารางสรุปบรรทัดเดียวต่อชุด" (exit · passed/total · id ที่ล้ม · บรรทัดแดงแรก ๆ) — builder วางตารางนี้ในรายงาน ไม่ต้องอ่าน log ยาว
#   กติกาเดิมทั้งหมด: QC4 ผ่าน qc4.sh · ล็อก POS /tmp/shark-gate-pos.lock · iso.sh unit แยก · ไม่ export CI · ทรีต้องสะอาด (commit ก่อน) · ไม่ build/serve
#   typecheck ไม่อยู่ในชุดนี้ (หนัก · ≤ 2 ครั้งต่อใบ) — ใส่ --tc เฉพาะครั้งสุดท้ายที่ head จริง
# ใช้: bash scripts/pos-pre-submit.sh <tree> [--wo <suite>] [--env K=V ...] [--set core,money,pins,all] [--also a,b] [--skip a,b] [--tc] [--out <dir>]
#   --wo   = suite ของใบ (รัน forced ×2 + --no-db · ยังไม่ต้องอยู่ในแมนิเฟสต์) · --env = ตัวแปรหมุด เช่น --env P36_PIN=c9c8e9ba (ใส่ซ้ำได้)
#   --set  = core (p1.1 p1.3 p1.6 p1.18 hf-fu hf-fu2 hf-tx fitness ±env fitness-pos gen-check) · money (cpa + money set + acc-v2-pos-lines) ·
#            pins (p2.7–p2.14 ชุดที่มีหมุดเลน — แดงเฉพาะ ST* ระหว่างเลนถือว่าคาดไว้) · all (ทั้งแมนิเฟสต์ ยกเว้น typecheck/visual-*) · ค่าเริ่มต้น core,money
#   ตัวอย่าง builder: bash scripts/pos-pre-submit.sh /root/projects/shark-pos-b --wo qc-pos-p3.6 --env P36_PIN=c9c8e9ba --set core,money,pins --also qc-pos-p3.5,qc-pos-p3.4,qc-pos-p2.1
set -uo pipefail
unset CI VERCEL
TREE="${1:-}"; shift || { echo "ใช้: $0 <tree> [--wo suite] [--env K=V] [--set ..] [--also ..] [--skip ..] [--tc] [--out dir]" >&2; exit 2; }
TREE="$(readlink -f "$TREE")"
[ -f "$TREE/scripts/pos-gates-all.sh" ] || { echo "🔴 ไม่มี $TREE/scripts/pos-gates-all.sh" >&2; exit 2; }
WO=""; SETS="core,money"; ALSO=""; SKIP=""; TC=0; OUT=""; ENVS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --wo) WO="${2:-}"; shift ;; --env) ENVS+=("${2:-}"); shift ;; --set) SETS="${2:-}"; shift ;; --also) ALSO="${2:-}"; shift ;;
    --skip) SKIP="${2:-}"; shift ;; --tc) TC=1 ;; --out) OUT="${2:-}"; shift ;; *) echo "🔴 ไม่รู้จัก $1" >&2; exit 2 ;;
  esac; shift
done
PORC="$(git -C "$TREE" status --porcelain)"
[ -z "$PORC" ] || { echo "🔴 ทรีมีไฟล์ค้าง ($(printf '%s\n' "$PORC" | wc -l)) — commit ก่อน (ชุดด่านต้องผูกกับ head เดียว):" >&2; printf '%s\n' "$PORC" | head -20 >&2; exit 2; }
HEAD8="$(git -C "$TREE" rev-parse --short=8 HEAD)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
[ -n "$OUT" ] || OUT="/root/pos-runs/presubmit-$(basename "$TREE")-$STAMP"
mkdir -p "$OUT"
echo "🟢 pos-pre-submit tree=$TREE head=$HEAD8 → $OUT"

# รายชื่อ regression จากแมนิเฟสต์ (กรองชื่อที่ไม่มี — pos-gates-all --only ล้มทั้งชุดถ้าชื่อไม่ตรง)
ONLY="$(python3 - "$TREE/scripts/pos-gates.json" "$SETS" "$ALSO" "$SKIP" "$TC" "$WO" <<'PY'
import json, sys
man = json.load(open(sys.argv[1])); sets, also, skip, tc, wo = sys.argv[2:7]
names = [s["suite"] for s in man.get("suites", [])] + [c["name"] for c in man.get("commands", [])]
S = {
 "core": ["qc-pos-p1.1","qc-pos-p1.3","qc-pos-p1.6","qc-pos-p1.18","qc-hf-fu","qc-hf-fu2","qc-hf-tx","fitness-noenv","fitness-qc4","fitness-pos","gen-check"],
 "money": ["qc-account-cpa","qc-restaurant-money","qc-shop-refund","qc-hotel-money","qc-ticket-money","qc-subscription-money","qc-acc-v2-pos-lines"],
 "pins": ["qc-pos-p2.7","qc-pos-p2.8","qc-pos-p2.9","qc-pos-p2.9b","qc-pos-p2.10","qc-pos-p2.11","qc-pos-p2.12","qc-pos-p2.13","qc-pos-p2.14"],
 "all": [n for n in names if n != "typecheck" and not n.startswith("visual-")],
}
want = []
for s in [x for x in sets.split(",") if x]:
    if s not in S: print(f"UNKNOWN-SET {s}", file=sys.stderr); sys.exit(2)
    want += S[s]
want += [x for x in also.split(",") if x]
if tc == "1": want.append("typecheck")
skips = set(x for x in skip.split(",") if x) | ({wo} if wo else set())
seen = []; missing = []
for n in want:
    if n in skips or n in seen: continue
    (seen if n in names else missing).append(n)
if missing: print("MISSING " + ",".join(missing), file=sys.stderr)
print(",".join(seen))
PY
)" || { echo "🔴 สร้างรายชื่อชุดไม่ได้" >&2; exit 2; }
# รายงานชื่อที่ไม่อยู่ในแมนิเฟสต์ (ถูกตัดออก)
python3 - "$TREE/scripts/pos-gates.json" "$ALSO" <<'PY' 2>/dev/null
import json, sys
man = json.load(open(sys.argv[1])); names = {s["suite"] for s in man.get("suites", [])} | {c["name"] for c in man.get("commands", [])}
m = [x for x in sys.argv[2].split(",") if x and x not in names]
if m: print("🟡 ไม่อยู่ใน pos-gates.json จึงไม่รันใน --only: " + ", ".join(m) + " (รันแยกเองหรือเพิ่มในแมนิเฟสต์)")
PY

run_suite() { # $1 = suite · $2 = label · $3.. = extra args
  local s="$1" label="$2"; shift 2
  local log="$OUT/$label.log" t0 t1 rc
  t0=$(date +%s)
  ISO_MEM=5G bash "$TREE/scripts/iso.sh" env QC_FORCE=1 "${ENVS[@]}" bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$s.mts" "$@" > "$log" 2>&1
  rc=$?; t1=$(date +%s)
  echo "EXIT $rc" >> "$log"; echo "$label $rc $((t1-t0))" >> "$OUT/WO.txt"
  echo "  $label → $rc (${t1}-${t0}s)" | sed "s/(\([0-9]*\)-\([0-9]*\)s)/($((t1-t0))s)/"
}
: > "$OUT/WO.txt"
if [ -n "$WO" ]; then
  [ -f "$TREE/scripts/$WO.mts" ] || { echo "🔴 ไม่มี $TREE/scripts/$WO.mts" >&2; exit 2; }
  echo "▶ suite ของใบ $WO (forced ×2 + --no-db · env: ${ENVS[*]:-ไม่มี})"
  run_suite "$WO" "wo-$WO-run1"
  run_suite "$WO" "wo-$WO-run2"
  run_suite "$WO" "wo-$WO-nodb" --no-db
fi
REG_RC=0
if [ -n "$ONLY" ]; then
  echo "▶ regression --only ($(echo "$ONLY" | tr ',' '\n' | wc -l) รายการ)"
  bash "$TREE/scripts/pos-gates-all.sh" --only "$ONLY" --out "$OUT/reg" > "$OUT/reg-runner.log" 2>&1; REG_RC=$?
fi

# ตารางสรุป (บรรทัดเดียวต่อชุด + บรรทัดแดงแรก ๆ ของชุดที่ล้ม)
python3 - "$OUT" "$HEAD8" "$TREE" "$WO" <<'PY'
import json, os, re, sys
out, head, tree, wo = sys.argv[1:5]
def summ(log):
    j = None; reds = []
    try: L = open(log, errors="replace").read().splitlines()
    except Exception: return None, [], None
    for l in L:
        if l.startswith("JSON_SUMMARY "):
            try: j = json.loads(l[len("JSON_SUMMARY "):])
            except Exception: j = None
        elif re.search(r"❌|🔴|\bFAIL\b|Error:|error TS\d+", l) and not l.startswith("EXIT"): reds.append(l.strip()[:150])
    ex = [l for l in L if l.startswith("EXIT ")]
    return j, reds, (int(ex[-1].split()[1]) if ex else None)
rows = []
def fmt(j):
    if not isinstance(j, dict): return "-", ""
    t, p = j.get("total"), j.get("passed")
    f = j.get("failed") or j.get("findings") or []
    ids = [str(x.get("id", "")) if isinstance(x, dict) else str(x).split()[0] for x in f][:6]
    return f"{p}/{t}", ",".join(ids) + (" …" if len(f) > 6 else "")
# WO rows
try:
    for l in open(os.path.join(out, "WO.txt")):
        label, rc, secs = l.split()
        j, reds, _ = summ(os.path.join(out, f"{label}.log")); pt, ids = fmt(j)
        rows.append((label, int(rc), pt, ids, int(secs), reds))
except FileNotFoundError: pass
# regression rows (ลำดับ + เวลาโดยประมาณจาก mtime ของ log ที่เขียนต่อกัน)
reg = os.path.join(out, "reg"); verdict = ""
if os.path.isdir(reg):
    prev = os.path.getmtime(os.path.join(reg, "HEAD.txt")) if os.path.exists(os.path.join(reg, "HEAD.txt")) else None
    acc = {}
    for l in open(os.path.join(reg, "SUMMARY.txt"), errors="replace"):
        if l.startswith(("RED ", "ACCEPTED ")): acc[l.split()[1]] = l.strip()
        if l.startswith("VERDICT "): verdict = l.strip()
    for l in open(os.path.join(reg, "SUMMARY.txt"), errors="replace"):
        p = l.split()
        if len(p) == 2 and p[1].lstrip("-").isdigit():
            log = os.path.join(reg, f"{p[0]}.log"); mt = os.path.getmtime(log) if os.path.exists(log) else None
            secs = int(mt - prev) if (mt and prev) else -1; prev = mt or prev
            j, reds, _ = summ(log); pt, ids = fmt(j)
            note = acc.get(p[0], "")
            if note.startswith("ACCEPTED"): ids = (ids + " ").strip() + " [accepted]"
            rows.append((p[0], int(p[1]), pt, ids, secs, reds))
pins = {"qc-pos-p2.7","qc-pos-p2.8","qc-pos-p2.9","qc-pos-p2.9b","qc-pos-p2.10","qc-pos-p2.11","qc-pos-p2.12","qc-pos-p2.13","qc-pos-p2.14","qc-hf-fu","qc-hf-fu2","qc-pos-p3.4","qc-pos-p3.5","qc-pos-p3.9","qc-pos-p3.7","qc-pos-p3.8"}
print(f"\nPRESUBMIT-TABLE head={head} tree={tree}")
print(f"{'suite':28} {'exit':4} {'pass/total':10} {'s':>5}  failed")
green = red = 0; rednames = []; expected = []
for name, rc, pt, ids, secs, reds in rows:
    tag = ""
    if rc != 0 and name in pins and ids and all(re.search(r"-(ST|K|G)\d", i) for i in ids.replace(" [accepted]","").split(",") if i and i != "…"):
        tag = "  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)"; expected.append(name)
    print(f"{name:28} {rc:<4} {pt:10} {secs:5}  {ids}{tag}")
    if rc == 0: green += 1
    else:
        red += 1; rednames.append(name)
        if not tag:
            for r in reds[:3]: print(f"{'':28}      ↳ {r}")
wo_line = " · ".join(f"{n.replace('wo-','')}={pt}" for n, rc, pt, ids, secs, reds in rows if n.startswith("wo-"))
print(f"PRESUBMIT head={head} green={green} red={red} expected-lane-pin={len(expected)} unexpected-red={','.join(n for n in rednames if n not in expected) or '-'}" + (f" · wo: {wo_line}" if wo_line else "") + (f" · {verdict}" if verdict else ""))
print(f"logs: {out}")
PY
echo "✅ pos-pre-submit จบ — $OUT"
