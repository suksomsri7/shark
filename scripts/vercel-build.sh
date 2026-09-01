#!/usr/bin/env bash
# vercel-build.sh — คำสั่ง build บน Vercel (ตั้งใน vercel.json → buildCommand)
#
# 🔴 ทำไมต้องมี (เหตุการณ์จริง 1 ก.ย. 2026): commit ที่เพิ่มคอลัมน์ `ChatConversation.pinnedAt`
#    ถูก push → Vercel build+deploy READY → แต่ **ไม่มีใครรัน `prisma migrate deploy`** บน prod
#    ⇒ Prisma client รู้จักคอลัมน์ที่ DB ไม่มี ⇒ `findFirst` ที่ไม่ระบุ select พังทั้งตาราง
#    ⇒ แชทลูกค้าดับ ~2.5 ชม. โดยไม่มีอะไรฟ้อง (CI เขียวตลอด เพราะ CI migrate บน Neon branch ของตัวเอง)
#
#    รากคือ "deploy โค้ด" กับ "apply DB" เป็นคนละขั้นที่พึ่งความจำคน
#    ไฟล์นี้ทำให้เป็น **ขั้นเดียวกัน**: migrate ไม่ผ่าน = build ไม่ผ่าน = โค้ดใหม่ไม่ขึ้น prod
#
# กติกา
#  · รัน migrate เฉพาะ VERCEL_ENV=production — preview ไม่มี DATABASE_URL (env ผูก production เท่านั้น)
#  · migration ต้องเป็น additive (ADD COLUMN แบบ NULL ได้ / ตารางใหม่ / ADD VALUE) เพราะระหว่าง build
#    โค้ดเก่ายังเสิร์ฟอยู่บน DB ที่ migrate แล้ว — DROP/RENAME/NOT NULL ทำโค้ดเก่าพังในช่วงนั้น
#    (กติกาเดียวกับที่ ledger/PLAN-CHAT-V2.md WO-CV2 ใช้อยู่แล้ว)
#  · ห้ามกลืน error: set -euo pipefail — ล้มตรงไหน build ต้องแดงตรงนั้น
set -euo pipefail

if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "▶ [vercel-build] production → prisma migrate deploy ก่อน build"
  pnpm exec prisma migrate deploy
  echo "▶ [vercel-build] migrate ผ่าน → ตรวจซ้ำว่าไม่มี migration ค้าง"
  pnpm exec prisma migrate status
else
  echo "▶ [vercel-build] VERCEL_ENV=${VERCEL_ENV:-<ว่าง>} → ข้าม migrate (ไม่ใช่ production)"
fi

echo "▶ [vercel-build] next build"
pnpm build
