#!/usr/bin/env bash
# qc-prisma.sh — รันคำสั่ง Prisma CLI กับ "ฐาน QC เท่านั้น" (RUN CRM v2 · ผู้คุมงาน · 18 ก.ย. 2569)
#
# 🔴 ทำไมต้องมี: `prisma.config.ts` โหลด `.env` (= PRODUCTION) เองเมื่อ `DIRECT_URL` ยังไม่ถูกตั้ง
#    และ `scripts/iso.sh` ไม่ส่งตัวแปรของผู้เรียกเข้า unit ⇒ `iso.sh pnpm exec prisma migrate …`
#    จะไปวิ่งบน production ตรง ๆ · สคริปต์นี้ตั้ง DIRECT_URL/DATABASE_URL จาก `.env.qc` ก่อนเรียก prisma
#    (loadEnvFile ไม่ทับค่าที่ตั้งไว้แล้ว) และหยุดทันทีถ้า host ไม่ใช่ QC
# 🔴 ห้ามใช้ `migrate dev` / `migrate reset` / `db push` — `migrate dev` เคยสั่ง reset ฐาน QC ที่ใช้ร่วมทุก session
#    (ledger/wo-notes/kanban-K3.5.md §3.5) · ทางที่ถูก: `migrate diff … --script` → ตรวจ SQL ด้วยตา → `migrate deploy`
#
# ใช้: bash scripts/iso.sh bash scripts/qc-prisma.sh migrate status
#      bash scripts/iso.sh bash scripts/qc-prisma.sh migrate deploy
#      bash scripts/iso.sh bash scripts/qc-prisma.sh migrate diff --from-config-datasource --to-schema prisma/schema --script
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-} ${2:-}" in
  "migrate dev"|"migrate reset"|"db push"|"db execute"|"migrate resolve")
    echo "🔴 qc-prisma: '$1 $2' ถูกห้ามในฐาน QC ที่ใช้ร่วม (ดูหัวไฟล์) — ใช้ migrate diff → ตรวจ SQL → migrate deploy" >&2; exit 3 ;;
esac

ENVF="${QC_ENV_FILE:-.env.qc}"
[ -f "$ENVF" ] || { echo "🔴 qc-prisma: ไม่พบ $ENVF" >&2; exit 2; }
DIRECT="$(grep -m1 '^DIRECT_URL=' "$ENVF" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
POOLED="$(grep -m1 '^DATABASE_URL=' "$ENVF" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
[ -n "$DIRECT" ] && [ -n "$POOLED" ] || { echo "🔴 qc-prisma: $ENVF ไม่มี DIRECT_URL/DATABASE_URL" >&2; exit 2; }

# ด่าน host: ต้องไม่ใช่ production และต้องเป็น branch QC
for U in "$DIRECT" "$POOLED"; do
  case "$U" in *ep-royal-night*) echo "🔴 qc-prisma: หยุด! URL ชี้ production branch" >&2; exit 4 ;; esac
  case "$U" in *ep-plain-art*) : ;; *) echo "🔴 qc-prisma: หยุด! URL ไม่ใช่ branch QC (ep-plain-art)" >&2; exit 4 ;; esac
done

echo "▶ qc-prisma: host = ep-plain-art… (QC) · คำสั่ง: prisma $*" >&2
exec env DIRECT_URL="$DIRECT" DATABASE_URL="$POOLED" pnpm exec prisma "$@"
