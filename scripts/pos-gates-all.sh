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
# POS HF-FU2 ▸ U: กติกาเพิ่ม (a) accepted: จำนวน id ที่ล้ม (ไม่ซ้ำ) < total−passed = red (แดงซ่อน) · ไม่มี total/passed = red
#   (b) accepted.checks มี CRASH หรือ *-ERR ⇒ ต้องมี accepted.match (สตริง) และสตริงนั้นต้องอยู่ใน <name>.log
#   (c) HEAD.txt มีโทเค็น only=<csv|-> (ไม่มี = -) · SET partial + only=- = red · only=<csv> ⇒ แถวต้องตรงชื่อที่ระบุ (จำนวน + ชื่อ)
#   (d) บรรทัด 1 ของ <name>.log ทุกแถวต้อง = บรรทัด 1 ของ HEAD.txt (red log-head) · ชื่อแถวต้องอยู่ในแมนิเฟสต์และไม่ซ้ำ
#   --verdict อ่านเฉพาะ $ROOT/scripts/pos-gates.json + git ของ $ROOT (self-contained · ไม่มีตัวเลือก path แมนิเฟสต์) ◂
verdict() {
  python3 - "$MANIFEST" "$1" "$ROOT" "${2:-0}" <<'PY' >> "$1/SUMMARY.txt"
import json, os, subprocess, sys
man = json.load(open(sys.argv[1])); out = sys.argv[2]; root = sys.argv[3]; nset = int(sys.argv[4] or 0)
acc = {s["suite"]: s.get("accepted") for s in man.get("suites", []) if s.get("accepted")}
acc.update({c["name"]: c.get("accepted") for c in man.get("commands", []) if c.get("accepted")})
total = len(man.get("suites", [])) + len(man.get("commands", []))
# POS HF-FU2 ▸ fix2 N6: ชุดข้อสอบที่จริงไม่พิมพ์ JSON_SUMMARY (exit 0 ได้โดยไม่มีสรุป) — นอกจากนี้ทุก suite ที่ exit 0 ต้องมีสรุปบรรทัดเดียว ◂
NO_JSON_SUITES = ["qc-restaurant", "qc-nav-functions", "qc-payroll-reverse"]  # POS HF-FU2 ▸ ctl 17 ต.ค.: + qc-payroll-reverse (HR suite พิมพ์แต่สรุปข้อความ · gates114) ◂
suite_mode = {s["suite"]: s.get("mode") for s in man.get("suites", [])}  # POS HF-FU2 ▸ fix2 N6: kind=suite + mode ◂
accepted_skip = []  # POS P3.12 ▸ CD-P312-N6b ◂
rows = []
for line in open(os.path.join(out, "SUMMARY.txt")).read().splitlines():
    parts = line.split()
    if len(parts) == 2 and parts[1].lstrip("-").isdigit():
        rows.append((parts[0], int(parts[1])))
n = nset or len(rows)
partial = not (n == total and len(rows) == total)  # POS HF-FU2 ▸ U(c) ◂
print(f"SET {'partial' if partial else 'full'} {len(rows)}/{total}")
# POS HF-FU2 ▸ U(c)(d): HEAD.txt บรรทัด 1 + โทเค็น only= (ไม่มี = "-" · โฟลเดอร์เก่าก่อน HF-FU2) ◂
head_line = None
only = "-"
head_lines = 0
head_toks = {}
try:
    head_txt = open(os.path.join(out, "HEAD.txt"), errors="replace").read()
    head_lines = len(head_txt.splitlines())
    head_line = (head_txt.splitlines() or [""])[0]
    # POS HF-FU2 ▸ fix1 N2: อ่าน head/dirty/only จากบรรทัด 1 เท่านั้น (บรรทัดต่อท้ายปลอมไม่มีผล) · นับโทเค็นซ้ำ ◂
    for tok in head_line.split():
        for k in ("head=", "dirty=", "only="):
            if tok.startswith(k):
                head_toks.setdefault(k, []).append(tok[len(k):])
    if head_toks.get("only="):
        only = head_toks["only="][0] or "-"
except Exception:
    pass
names_all = [s["suite"] for s in man.get("suites", [])] + [c["name"] for c in man.get("commands", [])]
def ids_of(log):  # POS HF-FU2 ▸ U(a): คืน (ids, total, passed) ◂
    j = None
    try:
        for l in open(log, errors="replace"):
            if l.startswith("JSON_SUMMARY "):
                j = json.loads(l[len("JSON_SUMMARY "):])
    except Exception:
        return None
    if not isinstance(j, dict):  # POS HF-FU2 ▸ U(a) ◂
        return None
    ids = []
    per = {}  # POS HF-FU2 ▸ fix1 N4: id แยกตามคีย์ — นับ (a) จากรายการเดียว ◂
    shape = [k for k in ("failed", "findings") if k in j and not isinstance(j.get(k), list)]  # POS HF-FU2 ▸ fix2 N7: failed/findings ต้องเป็นรายการ ◂
    for k in ("failed", "findings"):
        v = j.get(k)
        if isinstance(v, list):
            per[k] = []  # POS HF-FU2 ▸ fix1 N4 ◂
            for x in v:
                t = str(x.get("id", "")) if isinstance(x, dict) else (str(x).split() or [""])[0]
                if t:
                    ids.append(t)
                    per[k].append(t)  # POS HF-FU2 ▸ fix1 N4 ◂
    if j.get("crashed"):
        ids.append("CRASH")
    # POS HF-FU2 ▸ fix1 N4: (a) นับเฉพาะ failed เมื่อชุดรายงาน failed (findings ไม่เติมจำนวน) · ชุดที่รายงานแค่ findings = นับ findings · crashed = CRASH ◂
    counted = list(per["failed"]) if "failed" in per else list(per.get("findings", []))
    if j.get("crashed"):
        counted.append("CRASH")
    t, p = j.get("total"), j.get("passed")  # POS HF-FU2 ▸ U(a) ◂
    return ids, (t if isinstance(t, int) and not isinstance(t, bool) else None), (p if isinstance(p, int) and not isinstance(p, bool) else None), counted, shape  # POS HF-FU2 ▸ fix2 N7 ◂
def is_crash_id(x):  # POS HF-FU2 ▸ U(b) ◂
    return x == "CRASH" or str(x).endswith("-ERR")
red = []
# POS HF-FU2 ▸ fix1 N2: HEAD.txt ต้องมีบรรทัดเดียว · โทเค็น head= dirty= only= ไม่ซ้ำ ◂
if head_lines != 1:
    print(f"RED HEAD.txt {head_lines} บรรทัด (ต้องมีบรรทัดเดียว)")
    red.append("HEADTXT")
for k, v in head_toks.items():
    if len(v) > 1:
        print(f"RED HEAD.txt มีโทเค็น {k} {len(v)} ตัว (ต้องมีไม่เกิน 1)")
        red.append("HEADTXT")
# POS HF-FU2 ▸ U(c): ชุดไม่ครบต้องมาจาก --only และแถวต้องตรงรายชื่อของ --only ◂
if partial and only == "-":
    print(f"RED SET partial {len(rows)}/{total} (only=- — ชุดไม่ครบที่ไม่ได้มาจาก --only)")
    red.append("SET")
if only != "-":
    want = [w for w in only.split(",") if w]
    got = [nm for nm, _ in rows]
    if len(got) != len(set(want)) or sorted(set(got)) != sorted(set(want)):
        print(f"RED SET only (only={only} {len(set(want))} ชื่อ · แถวใน SUMMARY {len(got)}: {','.join(got)[:200]})")
        red.append("ONLY")
# POS HF-FU2 ▸ U(d): ชื่อแถวต้องอยู่ในแมนิเฟสต์ ไม่ซ้ำ · log บรรทัด 1 = HEAD.txt บรรทัด 1 ◂
seen = set()
for name, rc in rows:
    if name not in names_all:
        print(f"RED {name} {rc} (ไม่มีชื่อนี้ในแมนิเฟสต์)")
        red.append(name)
    if name in seen:
        print(f"RED {name} {rc} (แถวซ้ำใน SUMMARY)")
        red.append(name)
    seen.add(name)
    l1 = None
    try:
        with open(os.path.join(out, f"{name}.log"), errors="replace") as fh:
            l1 = fh.readline().rstrip("\n")
    except Exception:
        pass
    if head_line is None or l1 != head_line:
        print(f"RED {name} {rc} (log-head: บรรทัด 1 ของ {name}.log ≠ HEAD.txt บรรทัด 1)")
        red.append(name)
# POS HF-FU2 ▸ fix1 N3: JSON_SUMMARY ต้องมีบรรทัดเดียว และต้องเป็นบรรทัดก่อน EXIT ตัวสุดท้าย (สรุปปลอมที่ต่อท้าย/แทรกกลาง = red) ◂
_logs = {}
def log_lines(name):
    if name not in _logs:
        try:
            _logs[name] = open(os.path.join(out, f"{name}.log"), errors="replace").read().splitlines()
        except Exception:
            _logs[name] = None
    return _logs[name]
def exit_idx(L):  # POS HF-FU2 ▸ fix1 N3: ดัชนีบรรทัด EXIT ตัวสุดท้าย (None = ไม่มี) ◂
    ix = [i for i, l in enumerate(L) if l.startswith("EXIT ")]
    return ix[-1] if ix else None
for name, rc in rows:
    L = log_lines(name)
    if L is None:
        continue  # ไม่มี log = red ที่ log-head แล้ว
    js = [i for i, l in enumerate(L) if l.startswith("JSON_SUMMARY ")]
    ex = exit_idx(L)
    if len(js) > 1:
        print(f"RED {name} {rc} (JSON_SUMMARY {len(js)} บรรทัด — ต้องมีบรรทัดเดียว)")
        red.append(name)
    elif js and ex is not None and js[0] != ex - 1:
        print(f"RED {name} {rc} (JSON_SUMMARY ไม่ใช่บรรทัดก่อน EXIT)")
        red.append(name)
    # POS HF-FU2 ▸ fix1 N1: exit ใน SUMMARY ต้อง = บรรทัดสุดท้าย "EXIT n" ของ log · แถว exit 0 ต้องมีสรุปที่ไม่ล้ม (failed/findings ว่าง · ไม่ crashed · passed = total) ◂
    tail = [l for l in L if l.strip()]
    last = tail[-1].split() if tail else []
    if len(last) != 2 or last[0] != "EXIT" or last[1] != str(rc):
        print(f"RED {name} {rc} (exit ใน SUMMARY ≠ บรรทัดท้ายของ log: {' '.join(last)[:40] or 'ว่าง'})")
        red.append(name)
    if rc == 0 and js:
        try:
            j0 = json.loads(L[js[-1]][len("JSON_SUMMARY "):])
        except Exception:
            j0 = None
        bad0 = ""
        if not isinstance(j0, dict):
            bad0 = "JSON_SUMMARY อ่านไม่ได้"
        elif any(k in j0 and not isinstance(j0[k], list) for k in ("failed", "findings")):  # POS HF-FU2 ▸ fix2 N7 ◂
            bad0 = "failed/findings ไม่ใช่รายการ"
        elif j0.get("failed") or j0.get("findings"):
            bad0 = "failed/findings ไม่ว่าง"
        elif j0.get("crashed"):
            bad0 = "crashed"
        elif isinstance(j0.get("total"), int) and isinstance(j0.get("passed"), int) and j0["passed"] != j0["total"]:
            bad0 = f"passed {j0['passed']} ≠ total {j0['total']}"
        if bad0:
            print(f"RED {name} 0 (exit 0 แต่สรุปล้ม: {bad0})")
            red.append(name)
    # POS HF-FU2 ▸ fix2 N6: suite ที่ exit 0 — ต้องมี JSON_SUMMARY บรรทัดเดียว (ยกเว้น NO_JSON_SUITES) · total = passed > 0 เป็นจำนวนเต็ม ·
    #   skipped:true = red · mode forced ต้องไม่รายงาน forced:false (ชุด forced ที่ SKIP แล้ว exit 0 = red) · แถวคำสั่ง (typecheck/fitness/…) ไม่ตรวจ ◂
    if rc == 0 and name in suite_mode:
        bad6 = ""
        j6 = None
        if js:
            try:
                j6 = json.loads(L[js[-1]][len("JSON_SUMMARY "):])
            except Exception:
                j6 = None
        if not js:
            if name not in NO_JSON_SUITES:
                bad6 = "suite exit 0 ไม่มี JSON_SUMMARY"
        elif not isinstance(j6, dict):
            bad6 = "JSON_SUMMARY อ่านไม่ได้"
        elif j6.get("skipped") is True and isinstance((acc.get(name) or {}).get("skipMatch"), str) and acc[name]["skipMatch"] in "\n".join(L):
            # POS P3.12 ▸ CD-P312-N6b (ผู้คุม B 22.10): ชุด unforced ที่ SKIP เพราะต้องมีเซิร์ฟเวอร์/ของนอก QC4 (คลาส NEEDS-SERVER) — ยอมรับได้เมื่อแมนิเฟสต์มี accepted.skipMatch และสตริงนั้นอยู่ใน log · ชุดอื่นที่ skipped:true ยังแดงตามเดิม ◂
            print(f"ACCEPTED {name} 0 — skip: {acc[name].get('reason', '')[:120]}")
            accepted_skip.append(name)
        else:
            t6, p6 = j6.get("total"), j6.get("passed")
            isint = lambda v: isinstance(v, int) and not isinstance(v, bool)
            if not isint(t6) or not isint(p6) or t6 != p6 or t6 <= 0:
                bad6 = f"total/passed ต้องเป็นจำนวนเต็มเท่ากันและ > 0 (total {t6!r} · passed {p6!r})"
            elif j6.get("skipped") is True:
                bad6 = "skipped:true"
            elif suite_mode.get(name) == "forced" and "forced" in j6 and j6.get("forced") is False:
                bad6 = "mode forced แต่ forced:false (ชุด SKIP)"
        if bad6:
            print(f"RED {name} 0 (N6: {bad6})")
            red.append(name)
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
        log = os.path.join(out, f"{name}.log")
        got = ids_of(log)
        if got is None:
            why = "ไม่มีบรรทัด JSON_SUMMARY"
        else:
            ids, t, p, counted, shape = got  # POS HF-FU2 ▸ U(a)(b) ◂ · POS HF-FU2 ▸ fix1 N4: counted = รายการที่นับ (a) ◂ · POS HF-FU2 ▸ fix2 N7: shape ◂
            extra = sorted(set(ids) - set(a["checks"]))
            if shape:  # POS HF-FU2 ▸ fix2 N7 ◂
                why = f"JSON_SUMMARY {'/'.join(shape)} ไม่ใช่รายการ"
            elif extra:
                why = f"ล้มนอก accepted.checks: {','.join(extra)}"
            elif t is None or p is None:  # POS HF-FU2 ▸ U(a): แดงซ่อน — ต้องนับได้ ◂
                why = "JSON_SUMMARY ไม่มี total/passed"
            elif not (0 <= p <= t):  # POS HF-FU2 ▸ fix1 N4 ◂
                why = f"passed/total ผิดรูป (passed {p} · total {t} · ต้อง 0 ≤ passed ≤ total)"
            elif len(set(counted)) < t - p:  # POS HF-FU2 ▸ fix1 N4: นับ failed เท่านั้น (findings ไม่เติม) ◂
                why = f"รายการล้มสั้นกว่า total−passed ({len(set(counted))} < {t}−{p})"
            elif len(set(counted)) > t - p:  # POS HF-FU2 ▸ fix2 N7: รายการล้มเกิน total−passed (เช่น total 0 passed 0 failed [X]) ◂
                why = f"รายการล้มเกิน total−passed ({len(set(counted))} > {t}−{p})"
            elif any(is_crash_id(x) for x in a["checks"]):
                m = a.get("match")
                if not isinstance(m, str) or not m.strip():  # POS HF-FU2 ▸ U(b) ◂
                    why = "accepted มี CRASH/*-ERR แต่ไม่มี accepted.match"
                else:
                    try:
                        body = open(log, errors="replace").read()
                    except Exception:
                        body = ""
                    if m not in body:
                        why = f"accepted.match ไม่อยู่ใน {name}.log ({m[:60]})"
    if why:
        print(f"RED {name} {rc} ({why})")
        red.append(name)
    elif name not in red:  # POS HF-FU2 ▸ fix2 cosmetic: แถวที่แดงแล้ว (log-head/EXIT/JSON) ไม่พิมพ์ ACCEPTED ซ้อน ◂
        print(f"ACCEPTED {name} {rc} — {a.get('reason', '')[:120]}")
head0 = (head_toks.get("head=") or [None])[0]  # POS HF-FU2 ▸ fix1 N2: จากบรรทัด 1 ของ HEAD.txt เท่านั้น ◂
dirty0 = (head_toks.get("dirty=") or [None])[0]
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
  grep -E '^(SET|HEAD-end=|RED|ACCEPTED|VERDICT)' "$VERDICT_DIR/SUMMARY.txt" # POS HF-FU2 ▸ U: พิมพ์ ACCEPTED ด้วย ◂
  case "$(grep '^VERDICT ' "$VERDICT_DIR/SUMMARY.txt" | tail -1)" in "VERDICT green"*) exit 0 ;; *) exit 1 ;; esac # POS P2.14 ▸ fix2 G7: exit ตามคำตัดสิน ◂
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
HEADLINE="tree=$ROOT head=$(git -C "$ROOT" rev-parse --short=8 HEAD) dirty=$(git -C "$ROOT" status --porcelain | wc -l) $(date -u +%FT%TZ) only=${ONLY:--}" # POS HF-FU2 ▸ U(c): only=<csv|-> ◂
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
