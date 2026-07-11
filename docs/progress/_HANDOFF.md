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
- ระบบ 12/14 เปิด (available): BOOKING·MEMBER·POINT·POS·REWARD (เดิม) + **HOTEL·QUEUE·TICKET·COUPON·MEETING·KANBAN·ACCOUNT (ใหม่ 2026-07-11 P1)** — ยังปิด: RESTAURANT, CHAT
- ✅ **7 ระบบใหม่ = P1 code-complete + build 0 error + db push + QC ผ่าน service-layer ทั้ง 7 กับ Neon (`scripts/qc-systems.mts`, running number/atomic/cleanup ครบ) + deploy prod แล้ว** — LIVE บน **shark.in.th** (Vercel) + VPS staging. ยังเหลือ **UI/manual QC หน้าจอจริง** (service logic ผ่านแล้ว แต่ยังไม่คลิกทุกหน้าใน browser)
- **P1 scope ที่ทำ / เลื่อน (🔜)** — ดู REPORT ของแต่ละ subagent + สเปคเต็ม: Hotel(เลื่อน housekeeping/night-audit/folio/OTA), Account(เลื่อนฝั่งรายจ่าย/journal/งบ/DBD), Ticket/Queue(เลื่อน SSE realtime/ชำระเงินออนไลน์/storefront), Coupon(เลื่อน wire contract เข้า POS), Meeting/Kanban(เลื่อน SSE/attachment)
- redeploy: VPS = `pnpm build && pm2 restart shark --update-env` · Vercel = `pnpm dlx vercel@latest deploy --prod --yes --scope siamdives-projects --token=<ดู memory reference_vercel_credentials>`

## โครง code ที่ต้องรู้
- `src/lib/systems.ts` — ทะเบียน 14 ระบบ (SYSTEM_DEFS) · เปิดระบบใหม่ = เปลี่ยน status ที่นี่
- `src/lib/modules/system/service.ts` — createSystem/linkUnit/systemForUnit (การเชื่อม)
- `src/lib/modules/{booking,member,point,pos,reward}/service.ts` — ระบบที่ LIVE
- `src/lib/core/` — db (tenantDb guard), rbac, auth, session, email (Resend) — FROZEN ระวังแก้
- schema: `prisma/schema/*.prisma` แยกไฟล์/ระบบ · **migrate ด้วย `pnpm exec prisma db push --accept-data-loss` เท่านั้น** (migrate dev เป็น interactive ใช้ไม่ได้) · หลัง push ต้อง `prisma generate`
- แนวสร้างระบบใหม่: เพิ่ม schema (systemId-scoped) → register `src/lib/core/scope.ts` → service ใน `lib/modules/<x>/` → UI ที่ `/app/sys/[id]` (feature) หรือ `/app/u/[slug]/<x>` (business) → เปิดใน systems.ts → e2e test กับ Neon → deploy 2 ที่

## ✅ QC5 Gate A — ปิดครบแล้ว (2026-07-11 โดย Opus 4.8) — LIVE prod
posting engine `src/lib/modules/account/gl.ts` + ผังบัญชี seed `coa.ts` (40 บัญชี+2205, 23 mapping) · wire postDocument/postPayment/postTaxInvoice/reverseFor เข้า issue/payment/void ใน tx เดียว · A1 tax point (สินค้า ON_ISSUE / บริการ ON_PAYMENT, ใบกำกับอ้าง payment ผ่าน sourcePaymentId) · A2 เดือนภาษี source เดียว (VAT พัก 2205 goods/2210 service → 2200 ตอนออกใบกำกับ) · A3 vatRegistered gate · A4 posting rules (ส่วนลด net, มัดจำ F2) · A5 can()+AuditLog 13 action + ซ่อน มัดจำ/วางบิล/CN/DN. **Verify: `scripts/qc-account-gatea.mts` ผ่าน 9/9** (double-entry Σdr==Σcr ทุก entry + VAT routing + gate + can/audit wiring + backfill 0 orphan). helper: `access.ts` (assertAccountCan/writeAudit). schema เต็ม P2/P3 วางแล้ว (`account_gl.prisma` — 14 model)
- **ต่อไป: Gate B (ก่อน P2 รายจ่าย/WHT) + Gate C (ก่อน P3 งบ)** ใน `docs/qc/QC5-RESOLUTIONS-account.md` · แล้วขยายเมนู P2/P3 (schema+posting engine พร้อมแล้ว ต่อยอดได้เลย) · findings เต็ม: QC5-account-{tax,ledger,pipeline}.md

## งานถัดไป (เจ้าของจะเลือก)
- ✅ QC5 Gate A ปิดแล้ว (ด้านบน) — Account ออกเอกสารถูกกฎหมายภาษี + double-entry ครบ
- **ขยาย Account ให้ครบเมนู (P2/P3)** ตามที่ user ขอ — schema+posting engine พร้อม: P2 รายจ่าย/WHT/การเงิน (ทำ Gate B ก่อน), P3 GL/งบการเงิน/สินทรัพย์ (Gate C). แบ่ง subagent ขนานได้ (engine gl.ts เป็น interface กลาง)
- **UI/manual QC 7 ระบบใหม่ + Account** — คลิกทุกหน้าใน browser (service-layer + double-entry ผ่านแล้ว)
- **Chat (LINE + webchat)** ตาม `10-chat.md` — ChannelAdapter + inbox (ระบบเดียวที่ยังเป็น feature ที่เหลือ) · **Restaurant** ตาม `02-restaurant.md` (business ที่เหลือ)
- เก็บลึก P2 ต่อจาก P1 (ดู 🔜 ในสถานะ LIVE): Hotel folio/night-audit, Account ฝั่งรายจ่าย+งบ, SSE realtime (Queue/Ticket/Meeting/Kanban), Coupon→POS contract wiring, ชำระเงินออนไลน์ (Ticket/Hotel)
- ค้าง: push GitHub (ต้องขอ PAT จาก user) · Unit Switcher/เชิญพนักงาน (A1 ที่เหลือ)

## กติกาเมื่อจบ session
อัปเดตไฟล์นี้ + memory `project_shark_in_th` + commit ทุกครั้ง
