# HANDOFF — สำหรับ session ถัดไป (Opus 4.8 พัฒนาตาม blueprint)

> อัปเดต: 2026-07-11 คืน (Fable 5) · repo: `/root/projects/shark-in-th` branch `main` (18 commits, ยังไม่ push GitHub — ไม่มี credentials บนเครื่อง; Vercel deploy ตรงจาก local)

## ลำดับอ่านก่อนเริ่มงาน (สำคัญ — อ่านตามลำดับ)
1. **`docs/BLUEPRINT_SYSTEMS.md`** — mental model สุดท้าย "ทุกอย่างคือระบบ 14 ประเภท เชื่อมถึงกันได้" (override ทุกเอกสารที่ขัด)
2. `docs/modules/_CONVENTIONS.md` — contracts v2 + กติกา (เงินสตางค์, immutable docs, naming)
3. สเปคระบบที่จะสร้าง: `docs/modules/NN-<ระบบ>.md` (10-chat/11-meeting/12-account = เขียนใหม่ล่าสุด ละเอียดสุด)
4. `docs/progress/_STAGE_A.md` — gotchas Next16/Prisma7 (proxy.ts, driver adapter, db push)
5. memory: `project_shark_in_th` (สถานะ+การตัดสินใจทั้งหมด)

## สถานะ LIVE
- **prod: https://shark.in.th** (Vercel, APP_ENV=production, เมลจริง noreply@shark.in.th) · **staging: https://shark.suksomsri.cloud** (VPS pm2 `shark` :3801, APP_ENV=preview โชว์ OTP บนจอ) · DB เดียวกัน (Neon Singapore)
- ระบบ LIVE 5/14: BOOKING (จองคิวเต็ม flow) · MEMBER · POINT · POS · REWARD — ทั้งหมดเป็น system instance เชื่อม/ถอดผ่าน UI
- redeploy: VPS = `pnpm build && pm2 restart shark --update-env` · Vercel = `pnpm dlx vercel@latest deploy --prod --yes --scope siamdives-projects --token=<ดู memory reference_vercel_credentials>`

## โครง code ที่ต้องรู้
- `src/lib/systems.ts` — ทะเบียน 14 ระบบ (SYSTEM_DEFS) · เปิดระบบใหม่ = เปลี่ยน status ที่นี่
- `src/lib/modules/system/service.ts` — createSystem/linkUnit/systemForUnit (การเชื่อม)
- `src/lib/modules/{booking,member,point,pos,reward}/service.ts` — ระบบที่ LIVE
- `src/lib/core/` — db (tenantDb guard), rbac, auth, session, email (Resend) — FROZEN ระวังแก้
- schema: `prisma/schema/*.prisma` แยกไฟล์/ระบบ · **migrate ด้วย `pnpm exec prisma db push --accept-data-loss` เท่านั้น** (migrate dev เป็น interactive ใช้ไม่ได้) · หลัง push ต้อง `prisma generate`
- แนวสร้างระบบใหม่: เพิ่ม schema (systemId-scoped) → register `src/lib/core/scope.ts` → service ใน `lib/modules/<x>/` → UI ที่ `/app/sys/[id]` (feature) หรือ `/app/u/[slug]/<x>` (business) → เปิดใน systems.ts → e2e test กับ Neon → deploy 2 ที่

## งานถัดไป (เจ้าของจะเลือก)
- **Account P1 (รายรับ)** ตาม `12-account.md` §phasing — Document polymorphic + เสนอราคา/แจ้งหนี้/เสร็จ/กำกับ + ผู้ติดต่อ + ตั้งค่าเอกสาร
- **Chat (LINE + webchat)** ตาม `10-chat.md` — ChannelAdapter + inbox
- **Meeting (Slack-like)** ตาม `11-meeting.md`
- หรือเก็บลึก BOOKING (เวลาพนักงานรายคน/วันหยุด/เตือนนัดทางเมล — Resend พร้อมแล้ว)
- ค้าง: push GitHub (ต้องขอ PAT จาก user) · Unit Switcher/เชิญพนักงาน · Coupon/Kanban/Q/Ticket/Hotel/Restaurant สเปคเดิมรอปรับ scope เป็น system-instance ตอน implement

## กติกาเมื่อจบ session
อัปเดตไฟล์นี้ + memory `project_shark_in_th` + commit ทุกครั้ง
