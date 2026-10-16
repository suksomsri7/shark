#!/usr/bin/env bash
# sync-skills.sh — POS P2.14 ▸ DOC-2 (มติ 4): สกิล Claude ของ POS อยู่ในรีโปที่ skills/shark-pos-api/ (track ใน git) ·
#   สคริปต์นี้คัดไปบ้านของทั้งสองบัญชี (/root/.claude/skills · /root/.claude-b/skills) + .claude/skills ของทรีนี้ (ถ้ามีโฟลเดอร์) แล้วเทียบไบต์ (cmp) ทุกไฟล์
#   สกิลของโมดูลอื่น (crm/member/kanban/account) ยังอยู่ใต้ .claude/skills ของเจ้าของ — ไม่แตะที่นี่
# ใช้: bash scripts/sync-skills.sh            (คัด + เทียบ)
#      bash scripts/sync-skills.sh --check    (เทียบอย่างเดียว · ไม่เขียน · ต่าง = exit 1)
# 🔴 ไม่ export CI · ไม่ลบไฟล์อื่นในบ้าน (คัดทับเฉพาะไฟล์ของสกิลนี้)
set -euo pipefail
ROOT="$(dirname "$(readlink -f "$0")")/.."
SRC="$ROOT/skills/shark-pos-api"
FILES=("SKILL.md" "references/recipes.md" "references/endpoints.md")
DESTS=("/root/.claude/skills/shark-pos-api" "/root/.claude-b/skills/shark-pos-api")
[ -d "$ROOT/.claude" ] && DESTS+=("$ROOT/.claude/skills/shark-pos-api")
CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

for f in "${FILES[@]}"; do
  [ -f "$SRC/$f" ] || { echo "🔴 ไม่มี $SRC/$f" >&2; exit 2; }
done

bad=0
for d in "${DESTS[@]}"; do
  for f in "${FILES[@]}"; do
    if [ "$CHECK" -eq 0 ]; then
      mkdir -p "$(dirname "$d/$f")"
      cp "$SRC/$f" "$d/$f"
    fi
    if cmp -s "$SRC/$f" "$d/$f"; then
      echo "OK   $d/$f"
    else
      echo "DIFF $d/$f" >&2
      bad=1
    fi
  done
done
[ "$bad" -eq 0 ] && echo "✅ skills/shark-pos-api ตรงไบต์กับ ${#DESTS[@]} ปลายทาง" || { echo "🔴 สำเนาไม่ตรง — รัน bash scripts/sync-skills.sh" >&2; exit 1; }
