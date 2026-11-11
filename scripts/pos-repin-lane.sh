#!/usr/bin/env bash
# pos-repin-lane.sh — ผู้คุม POS (builder S P3.12 · 22 ต.ค. 2026 · มติ brief P3.12 §10.10 ชุดตรึงหมุดเลนปิดเฟส):
#   ย้ายหมุดเลนของ suites ที่ระบุ → <newSHA> + หมายเหตุ ORACLE-EDIT (สัญญาเดียวกับ /root/pos-runs/ctl-scripts-2026-10-09/repin-lane.sh)
#   แต่รับได้ทั้งแบบตัวอักษร `const LANE_PIN = "<sha>"` และแบบ env-override `const <VAR> = process.env.<ENV> || "<sha>"`
#   แก้ไฟล์อย่างเดียว · ไม่ commit (ผู้คุมตรวจ diff + รัน --no-db แล้ว commit เอง) · ไม่แตะ DB · ไม่รัน node
# ใช้: bash scripts/pos-repin-lane.sh [--dry-run] <tree> <newSHA> <tag> <suite[:VAR]>...
#   <suite> = ชื่อไฟล์ใต้ scripts/ ไม่มี .mts (เช่น qc-pos-p3.6) · VAR ปริยาย = LANE_PIN แล้ว LANE_REV · `:VAR` เลือกค่าคงที่อื่น
#   เช่น  bash scripts/pos-repin-lane.sh /root/projects/shark-pos 554a74d3 "P3 close freeze" qc-hf-fu qc-pos-p3.7:LANE_PIN qc-pos-p3.4:LANE_REV qc-pos-p2.10
#   พิมพ์ `suite: old → new (line N)` ต่อชุด · ตรวจทุกชุดก่อนแก้ — ชุดใดไม่มีบรรทัดที่ตรง = exit 1 และไม่แก้ไฟล์ใดเลย · --dry-run = พิมพ์อย่างเดียว
set -euo pipefail
unset CI VERCEL
DRY=0; ARGS=()
for a in "$@"; do if [ "$a" = "--dry-run" ]; then DRY=1; else ARGS+=("$a"); fi; done
[ "${#ARGS[@]}" -ge 4 ] || { echo "ใช้: $0 [--dry-run] <tree> <newSHA> <tag> <suite[:VAR]>..." >&2; exit 2; }
TREE=${ARGS[0]}; SHA=${ARGS[1]}; TAG=${ARGS[2]}
[ -d "$TREE/.git" ] || [ -f "$TREE/.git" ] || { echo "🔴 ไม่ใช่ทรี git: $TREE" >&2; exit 2; }
[[ "$SHA" =~ ^[0-9a-f]{7,40}$ ]] || { echo "🔴 SHA ไม่ใช่ hex: $SHA" >&2; exit 2; }
[ "$(git -C "$TREE" rev-parse --verify -q "${SHA}^{commit}" | cut -c1-${#SHA})" = "$SHA" ] || { echo "🔴 SHA ไม่พบใน $TREE: $SHA" >&2; exit 1; }
python3 - "$TREE" "$SHA" "$TAG" "$DRY" "$(date -u +%d.%m)" "${ARGS[@]:3}" <<'PY'
import os, re, sys
tree, sha, tag, dry, day = sys.argv[1:6]
specs = sys.argv[6:]
dry = dry == "1"
plan, bad = [], []
for spec in specs:
    suite, _, var = spec.partition(":")
    path = os.path.join(tree, "scripts", f"{suite}.mts")
    if any(p[1] == path for p in plan):
        bad.append(f"{suite}: ซ้ำในคำสั่ง (ไฟล์เดียวกันได้ครั้งเดียว)"); continue
    if not os.path.isfile(path):
        bad.append(f"{suite}: ไม่มีไฟล์ {path}"); continue
    lines = open(path, encoding="utf-8").read().split("\n")
    names = [var] if var else ["LANE_PIN", "LANE_REV"]
    hit = None
    for name in names:
        rx = re.compile(r'^(const\s+' + re.escape(name) + r'\s*=\s*(?:process\.env\.\w+\s*\|\|\s*)?")([0-9a-f]{7,40})(")')
        for i, l in enumerate(lines):
            m = rx.match(l)
            if m: hit = (name, i, m); break
        if hit: break
    if not hit:
        bad.append(f"{suite}: ไม่พบ `const {'|'.join(names)} = \"<sha>\"` หรือ `= process.env.X || \"<sha>\"`"); continue
    plan.append((suite, path, lines, *hit))
for b in bad: print(f"🔴 {b}")
if bad: sys.exit(1)
for suite, path, lines, name, i, m in plan:
    old = m.group(2)
    if old == sha:
        print(f"{suite}: {name} {old} → {sha} (line {i + 1}) · เท่าเดิม ไม่แก้"); continue
    l = m.group(1) + sha + m.group(3) + lines[i][m.end():]
    note = f"ORACLE-EDIT ผู้คุม {day} ({tag} · re-pin {old} → {sha})"
    k = l.find("//", len(m.group(1)) + len(sha) + 1)
    l = (l[:k] + "// " + note + " · " + l[k + 2:].lstrip()) if k >= 0 else (l + " // " + note)
    lines[i] = l
    print(f"{suite}: {name} {old} → {sha} (line {i + 1}){' · dry-run' if dry else ''}")
    if not dry:
        open(path, "w", encoding="utf-8").write("\n".join(lines))
PY
[ "$DRY" = 1 ] || git -C "$TREE" diff --stat
