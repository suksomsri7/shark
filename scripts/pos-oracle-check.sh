#!/usr/bin/env bash
# pos-oracle-check.sh — ผู้คุม POS (B · 21 ต.ค. 2026 · มติเจ้าของ "ประหยัด token แต่คุณภาพเท่าเดิม" ข้อ 1):
#   ด่านตรวจ oracle (scripts/qc-pos-*.mts) + prompt builder ก่อนเปิด builder — จับสาเหตุรอบแก้ที่ไม่ใช่บั๊กสินค้า
#   (merge-base แทนหมุดคงที่ · ไม่มีหมุดเลนแยก (CD-RP4) · หมุดไฟล์ร้อนไม่ทนรอยต่อของใบอื่น (W21) · ไม่มี JSON_SUMMARY ·
#    prompt ค้าง __BASE__/__TREE__ · ใบที่แตะ *actions*.ts ไม่สั่ง qc-pos-p1.6 · env หมุดไม่ตรงฐาน)
#   อ่านอย่างเดียว · ไม่แตะ DB · ไม่แก้ไฟล์ · exit 0 = green/warn · exit 1 = red
# ใช้: bash scripts/pos-oracle-check.sh <tree> <suite> [--base <sha8>] [--prompt <file>]
#   <suite> = ชื่อไฟล์ไม่มี .mts เช่น qc-pos-p3.6 · --base = ฐานที่ builder จะใช้จริง (tip) · --prompt = prompt builder ที่จะส่ง
set -uo pipefail
unset CI VERCEL
TREE="${1:-}"; SUITE="${2:-}"; shift 2 || { echo "ใช้: $0 <tree> <suite> [--base sha] [--prompt file]" >&2; exit 2; }
BASE=""; PROMPT=""
while [ $# -gt 0 ]; do case "$1" in --base) BASE="${2:-}"; shift ;; --prompt) PROMPT="${2:-}"; shift ;; *) echo "🔴 ไม่รู้จัก $1" >&2; exit 2 ;; esac; shift; done
[ -d "$TREE/.git" ] || [ -f "$TREE/.git" ] || { echo "🔴 ไม่ใช่ทรี git: $TREE" >&2; exit 2; }
python3 - "$TREE" "$SUITE" "$BASE" "$PROMPT" <<'PY'
import os, re, subprocess, sys, json
tree, suite, base, prompt = sys.argv[1:5]
path = os.path.join(tree, "scripts", f"{suite}.mts")
rows = []
def add(level, cid, text): rows.append((level, cid, text))
def git(*a):
    r = subprocess.run(["git", "-C", tree, *a], capture_output=True, text=True)
    return r.returncode, r.stdout.strip()
HOT = ["outbox-consumers.ts", "order.ts", "src/messages", "fitness.mts", "ai/skills.ts", "ai/tools.ts", "src/lib/api/", "api-keys", "qc-all.mts", "package.json", "account/index.ts", "kanban/integrations.ts", "chat/index.ts", "cron/hourly"]
if not os.path.isfile(path):
    add("RED", "O1", f"ไม่มีไฟล์ {path}"); src = ""
else:
    src = open(path, errors="replace").read(); add("OK", "O1", f"{path} ({len(src.splitlines())} บรรทัด)")
# O2 merge-base
if "merge-base" in src: add("RED", "O2", "ใช้ merge-base (บทเรียน 17 ต.ค. p2.14 K3: oracle ต้องใช้หมุดคงที่ env-override — P3.7/P3.8 โดนทั้งคู่)")
else: add("OK", "O2", "ไม่ใช้ merge-base")
# O3/O4 pins
env_pins = re.findall(r'const\s+(\w+)\s*=\s*process\.env\.(\w+)\s*\|\|\s*"([0-9a-f]{7,40})"', src)
lit_pins = re.findall(r'const\s+(PIN|BASE|LANE_PIN|LANE_REV)\s*=\s*"([0-9a-f]{7,40})"', src)
if env_pins:
    for name, env, sha in env_pins:
        rc, _ = git("cat-file", "-e", f"{sha}^{{commit}}")
        where = "มีในทรี" if rc == 0 else "ไม่มีในทรี"
        lvl = "OK" if rc == 0 else "RED"
        add(lvl, "O3", f"หมุด {name} = env {env} || {sha} ({where})")
        if base and name in ("PIN", "BASE") and not sha.startswith(base[:7]) and not base.startswith(sha[:7]):
            add("WARN", "O3", f"ค่าเริ่มต้นของ {name} ({sha}) ≠ ฐานที่จะใช้ ({base}) — prompt ต้องตั้ง {env}={base} ทุกคำสั่ง หรือ ORACLE-EDIT ค่าเริ่มต้นก่อนเปิด builder")
else:
    add("RED", "O3", 'ไม่มีหมุดคงที่แบบ env-override (คาด `const PIN = process.env.Pxx_PIN || "<sha8>"`)')
for name, sha in lit_pins:
    if name in ("PIN", "BASE"): add("RED", "O4", f"หมุดใบ {name} เป็นค่าตายตัว {sha} (ไม่มี process.env override) — builder/ผู้คุมย้ายฐานไม่ได้")
    else: add("OK", "O4", f"{name} ค่าตายตัว {sha} (แบบ repin-lane.sh — ยอมรับ)")
# O5 lane pin separation when diffing against pin
uses_diff = bool(re.search(r'\["diff"', src) or re.search(r'git diff', src))
has_lane = bool(re.search(r'\bLANE_PIN\b|\bLANE_REV\b', src))
if uses_diff and not has_lane:
    add("RED", "O5", "ใช้ git diff เทียบหมุด แต่ไม่มี LANE_PIN/LANE_REV แยกจากหมุดใบ (บทเรียน CD-RP4 17 ต.ค.: หลัง merge ข้อ 'ไฟล์ห้ามแตะ' ต้องย้ายหมุดเลนโดยไม่ขยับหมุดใบ) — เพิ่ม `const LANE_PIN = process.env.Pxx_LANE_PIN || PIN` ตั้งแต่เขียน")
elif uses_diff: add("OK", "O5", "มีหมุดเลนแยก (LANE_PIN/LANE_REV)")
else: add("OK", "O5", "ไม่มีข้อ diff เทียบหมุด")
# O6 W21-class: own marker on hot files without tolerance for other cards' markers
m = re.search(r'qc-pos-(p\d+(?:\.\d+)?|hf-\w+)', suite)
tag = suite.replace("qc-pos-", "").upper() if m else suite
own_marker = re.search(r'POS P\\?\.?\d+\\?\.\d+ ▸|POS P\d+\\\.\d+ ▸|POS ' + re.escape(tag) + r' ▸', src)
hot_hit = [h for h in HOT if h in src]
generic = bool(re.search(r'POS P\\d|POS P\\\\d|POS P\[0-9\]|POS \(?P\\d|▸/\.test|/▸/', src))
if own_marker and hot_hit and uses_diff and not generic:
    add("WARN", "O6", f"W21-class: ข้อ diff ไฟล์ร้อน ({', '.join(hot_hit[:5])}) ยอมรับเฉพาะรอยต่อของใบนี้ — ใบอื่นที่ merge ทีหลังจะทำให้แดง · ให้ยอมรับบรรทัดในรอยต่อ `POS P\\d+… ▸ … ◂` ของใบอื่นด้วย + probe ลบ (บรรทัดไม่ marked ยังแดง)")
elif own_marker and hot_hit: add("OK", "O6", f"ข้อไฟล์ร้อน ({', '.join(hot_hit[:4])}) มีการทนรอยต่อแบบทั่วไป หรือไม่ใช้ diff")
else: add("OK", "O6", "ไม่พินไฟล์ร้อนด้วยรอยต่อของใบเดียว")
# O7 JSON_SUMMARY
if "JSON_SUMMARY" in src and re.search(r'total', src) and re.search(r'passed', src): add("OK", "O7", "พิมพ์ JSON_SUMMARY (total/passed)")
else: add("RED", "O7", "ไม่พิมพ์ JSON_SUMMARY พร้อม total/passed — pos-gates-all N6 จะแดงแม้ exit 0")
# O8 flags
flags = [f for f in ("--list", "--no-db") if f in src]
if len(flags) == 2: add("OK", "O8", "รองรับ --list และ --no-db")
else: add("WARN", "O8", f"ขาดแฟล็ก {set(['--list','--no-db']) - set(flags)} (ผู้คุมใช้ --no-db ตรวจข้อสถิตโดยไม่กินเวลา DB)")
# O9 manifest
try:
    man = json.load(open(os.path.join(tree, "scripts", "pos-gates.json")))
    names = [s["suite"] for s in man.get("suites", [])]
    if suite in names: add("OK", "O9", "อยู่ใน pos-gates.json แล้ว")
    else: add("WARN", "O9", "ยังไม่อยู่ใน pos-gates.json — builder ต้องเพิ่ม (qc-pos-p2.14 G1) และ pos-pre-submit จะรัน suite นี้แยกจาก --only")
except Exception as e: add("WARN", "O9", f"อ่าน pos-gates.json ไม่ได้: {e}")
# O10 ORACLE-EDIT exceptions must come with a delete-probe note
exc = len(re.findall(r'ORACLE-EDIT', src)); probe = len(re.findall(r'probe', src, re.I))
if exc and not probe: add("WARN", "O10", f"มี ORACLE-EDIT {exc} จุด แต่ไม่มีบันทึก probe ลบในไฟล์ — ข้อยกเว้นทุกจุดต้องมี probe ว่าบรรทัดไม่ marked ยังแดง (จดใน wo-notes อย่างน้อย)")
else: add("OK", "O10", f"ORACLE-EDIT {exc} จุด · probe {probe} จุด")
# O11 prompt lint
if prompt:
    if not os.path.isfile(prompt): add("RED", "O11", f"ไม่มี prompt {prompt}")
    else:
        p = open(prompt, errors="replace").read()
        left = sorted(set(re.findall(r'__[A-Z_]+__', p)))
        if left: add("RED", "O11", f"prompt ยังมี placeholder {left}")
        else: add("OK", "O11", "prompt ไม่มี placeholder ค้าง")
        if re.search(r'actions?\.ts|-actions', p) and "qc-pos-p1.6" not in p: add("RED", "O11", "prompt กล่าวถึงไฟล์ *actions*.ts แต่ไม่สั่งรัน qc-pos-p1.6 (บทเรียน gates115)")
        elif "qc-pos-p1.6" in p: add("OK", "O11", "สั่ง qc-pos-p1.6 แล้ว")
        if "export CI" not in p: add("WARN", "O11", "prompt ไม่มีข้อห้าม `export CI`")
        for name, env, sha in env_pins:
            if base and name in ("PIN", "BASE") and not sha.startswith(base[:7]) and env + "=" not in p:
                add("RED", "O11", f"ค่าเริ่มต้น {name}={sha} ≠ ฐาน {base} และ prompt ไม่ตั้ง {env}= — builder จะเทียบผิดฐาน")
        if "pos-pre-submit" not in p: add("WARN", "O11", "prompt ยังไม่ใช้ scripts/pos-pre-submit.sh (ให้ builder รันชุดมาตรฐานแล้ววางตารางแทนอ่าน log)")
        if base and base[:7] not in p: add("WARN", "O11", f"prompt ไม่กล่าวถึงฐาน {base}")
for lvl, cid, text in rows:
    print(f"{ {'OK':'🟢','WARN':'🟡','RED':'🔴'}[lvl] } {lvl:4} {cid:3} {text}")
reds = [r for r in rows if r[0] == "RED"]; warns = [r for r in rows if r[0] == "WARN"]
print(f"VERDICT {'red' if reds else ('warn' if warns else 'green')} ({suite} · red {len(reds)} · warn {len(warns)})")
sys.exit(1 if reds else 0)
PY
