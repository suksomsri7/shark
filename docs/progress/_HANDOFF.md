# HANDOFF — สำหรับ session ถัดไป (Opus 4.8 พัฒนาตาม blueprint)

> อัปเดต: 2026-07-11 คืน (Fable 5) · repo: `/root/projects/shark-in-th` branch `main` (18 commits, ยังไม่ push GitHub — ไม่มี credentials บนเครื่อง; Vercel deploy ตรงจาก local)

## ลำดับอ่านก่อนเริ่มงาน (สำคัญ — อ่านตามลำดับ)
1. **`docs/BLUEPRINT_SYSTEMS.md`** — mental model สุดท้าย "ทุกอย่างคือระบบ **18 ประเภท** เชื่อมถึงกันได้" (override ทุกเอกสารที่ขัด)
2. `docs/modules/_CONVENTIONS.md` — contracts v2 + กติกา (เงินสตางค์, immutable docs, naming) + **`docs/BLUEPRINT_CONNECTIONS.md`** — matrix เชื่อม 18 ระบบ + contracts C-1..C-5 (Inventory/HR/AI/Meeting/KB) — **ระบบใหม่ทุกตัวต้อง implement ตาม contract นี้**
3. สเปคระบบที่จะสร้าง: `docs/modules/NN-<ระบบ>.md` (10-chat/11-meeting/12-account = เขียนใหม่ล่าสุด ละเอียดสุด)
4. `docs/progress/_STAGE_A.md` — gotchas Next16/Prisma7 (proxy.ts, driver adapter, db push)
5. memory: `project_shark_in_th` (สถานะ+การตัดสินใจทั้งหมด)

## สถานะ LIVE
- **prod: https://shark.in.th** (Vercel, APP_ENV=production, เมลจริง noreply@shark.in.th) · **staging: https://shark.suksomsri.cloud** (VPS pm2 `shark` :3801, APP_ENV=preview โชว์ OTP บนจอ) · DB เดียวกัน (Neon Singapore)
- ระบบ **13/14 เปิด** (available): BOOKING·MEMBER·POINT·POS·REWARD (เดิม) + HOTEL·QUEUE·TICKET·COUPON·MEETING·KANBAN·ACCOUNT (2026-07-11 P1) + **RESTAURANT (2026-07-12 P1)** — เหลือปิดตัวเดียว: **CHAT**
- ✅ **Restaurant P1 LIVE** (2026-07-12): 27 files/15 model — เมนู/86 · โซน/โต๊ะ/QR · session · ออเดอร์+KDS · เช็คบิล→POS · storefront QR. verify dine-in loop ผ่าน (`/tmp/qc-restaurant.mts`: menu→table→session dedup→order→KDS→checkout→close). partial unique index 1 OPEN session/table. defer: สต็อก/Recipe(P2), SSE, pickup UI, reports
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

## 🟡 Account P2/P3 — ค้างจาก session limit (2026-07-11, reset 8pm UTC) — LIVE prod (build ผ่าน + engine verified)
7 subagent P2/P3 ตายกลางคัน (session limit); salvage แล้ว build ผ่าน + Gate A regression 9/9 + P2/P3 engine 6/6 (`scripts/qc-account-p2p3.mts`). สถานะต่อโมดูล:
- ✅ **posting engine เต็ม (gl.ts)**: postDocument รองรับทุก docType ฝั่งจ่าย (PURCHASE/EXPENSE/ASSET_PURCHASE/PTX/DP/CNR/DNR) + postPayment WHT-payable (Cr 2130) + postManualJV/postDepreciation/postOpening(คู่ 3999)/closePeriod/reopenPeriod — verify balance หมด
- ✅ **Products** (product.ts + products/goods-issue routes) · ✅ **Assets** (asset.ts + assets route: register/ค่าเสื่อม/ตัดจำหน่าย)
- 🟡 **Finance-WHT**: finance.ts/wht.ts + routes finance/wht/tax เสร็จเกือบหมด (ตายตอนทำ CSV export ภงด) — ตรวจ tax/ route
- 🟡 **Reports**: reports.ts + routes reports/trial-balance/profit-loss เสร็จ · **ขาด balance-sheet + cash-flow + ภพ30 page**
- 🟡 **GL UI**: journal(+[entryId]/new)/ledger เสร็จ · **ขาด accounts/ (ผังบัญชี+mapping UI) + periods/ (ปิดงวด) page** (engine closePeriod พร้อม)
- 🟡 **Expense**: expense.ts/expense-actions.ts/expense-ui.tsx/ExpenseEditor.tsx เสร็จ · **ขาด route pages ทั้งหมด** (purchase/expense/po/asset-buy) — service พร้อม แค่ทำ UI route
- 🟡 **Sales Gate B**: computeTotals (per-line vat + allocate ส่วนลด) + VISIBLE_DOC_TYPES เปิด CN/DN/มัดจำ/วางบิล แล้ว · **ค้าง: recordPayment branch DEPOSIT_RECEIPT (F2), CN cap, ใบกำกับ ม.86/4 print fields** — ตรวจ service.ts/actions ว่า flow มัดจำ/วางบิลครบไหมก่อนให้ใช้จริง
- nav เมนู P2/P3 wire แล้วใน ui.tsx (section ที่หน้าเสร็จ) — expense/accounts/periods ยังไม่ link (soft-gate)
- **UPDATE (main ทำต่อเองหลัง limit):** ปิดช่องว่างครบแล้ว — Expense 8 routes (purchase/expense/po/asset-buy) + Reports ครบ 5 (เพิ่ม balance-sheet/cash-flow/pp30) + GL accounts (ผังบัญชี CRUD+mapping) + periods (ปิดงวด). nav wire ครบ. **verify Gate B: DEPOSIT_RECEIPT(Cr2110+AWAITING_DEDUCT)+CREDIT_NOTE(Cr1100) balance ✓** → docType เปิดครบปลอดภัย. deploy prod แล้ว
- **เหลือ (minor, ไม่ block):** ใบกำกับภาษี ม.86/4 print fields ให้ครบเป๊ะ · Finance CSV export ภงด · verify ก่อน launch จริง: **checksum เลขภาษีนิติบุคคล DBD** (QC5 verify-list) + ทดสอบ UI คลิกจริงทุกหน้า

## 🟡 QC6 (2026-07-12) — Gate 1+2 ✅ + UI Pass 0 (token) ✅ · UI Pass 1-4 ค้าง
- ✅ **Gate 1 + Gate 2 บัญชี ปิดครบ — `qc-account-cpa.mts` 107/107 findings 0** (จาก 90/108). แก้ F-01..F-09 ใน account 5 ไฟล์ (gl/service/expense/reports/coa): VAT ซ้ำ/มัดจำ/ภงด53/ภพ30/ขายสด Dr1000/รายได้สินค้า4000/CN cap/overpay/ลูกหนี้=GL. ไม่ต้อง db push. **harness = regression suite ถาวร รันทุกครั้งที่แตะ account.** deploy prod แล้ว
- ✅ **UI Pass 0 (token ผี) ปิด** — แก้ fg/bg/success/primary/hover→token จริง + btn-secondary→btn-ghost ทั้งแอป (grep=0) + เพิ่ม `.btn-sm`/`.input` ใน globals.css. ปุ่มล่องหนบน prod กลับมาเห็น
- ✅ **UI Pass 0 ครบ** — ghost tokens + ConfirmDialog ~40 destructive + SubmitButton ~30 ฟอร์มเงิน (2 agent account/unit-lib) · cpa 107/107 · deploy prod
- ✅ **UI Pass 1 ครบ** — shared components 11 ตัว `src/components/ui/` (PageHeader/Section/DataList/DataTable/StatusChip/FormField/EmptyState/MoneyText/SubNav/TabPills + ConfirmDialog/SubmitButton) + `src/lib/ui/{money,status-labels}.ts`
- 🔵 **Pass 2 กำลังทำ (agent)** — account/layout.tsx SubNav 8 หมวด (ACCOUNT_NAV) + **status tabs ครบทุกเมนูตาม §3.0.3** + refactor 26 หน้าใช้ component กลาง + StatusChip ไทย. ต้องคง cpa 107/107
- 🔴 **ค้างตามแผน user:** #3 account complete-menu (เช็ครับ/จ่าย, คลังเอกสาร UI, ตั้งค่าองค์กร โลโก้/ตราประทับ, ลิงก์สาธารณะขอใบกำกับ, print ม.86/4, CSV ภงด) · #4 Pass 3 (unit modules ≥44px) + Pass 4 (lib modules) → แล้วเริ่ม **Chat (LINE)**. ทุกครั้งที่แตะ account: รัน `qc-account-cpa.mts` 107/107 ก่อน deploy

## 🆕 พิมพ์เขียวขยายเป็น 18 ระบบ (2026-07-12 โดย Fable — user ยืนยัน)
- `src/lib/systems.ts` มี 18 entry แล้ว: +AI(15)/KB(16)/**HR(17)**/**INVENTORY(18)** เป็น coming_soon (deploy 2 ที่แล้ว) — เปิดระบบ = เปลี่ยน status + เพิ่ม SystemType enum
- สเปคใหม่: `modules/18-hr.md` (ขาด/ลา/มาสาย/กะ/kiosk PIN + **ลาแล้ว Booking slot ปิดเอง** + payroll P2) · `modules/19-inventory.md` (สต็อกกลาง movement ledger)
- **contract บังคับ**: Inventory = จุดตัดสต็อกเดียว (C-1: consume/receive/reverse/adjust/onHand — แบบเดียวกับ Point, ยอมติดลบ default ไม่ block ขาย) · HR availability (C-2) · ดู `BLUEPRINT_CONNECTIONS.md`
- ลำดับที่ user เห็นชอบ: **UI Pass 2-4 → account complete-menu → Chat → แล้วค่อย HR/Inventory**

## งานถัดไป (เจ้าของจะเลือก)
- ⬆️ **QC6 ก่อน** (Gate 1 + UI Pass 0 ขนานกันได้)
- ✅ QC5 Gate A ปิดแล้ว (ด้านบน) — Account ออกเอกสารถูกกฎหมายภาษี + double-entry ครบ (แต่ QC6 เจอ 4 จุดใหม่ระดับแบบยื่น — ดูด้านบน)
- **ขยาย Account ให้ครบเมนู (P2/P3)** ตามที่ user ขอ — schema+posting engine พร้อม: P2 รายจ่าย/WHT/การเงิน (ทำ Gate B ก่อน), P3 GL/งบการเงิน/สินทรัพย์ (Gate C). แบ่ง subagent ขนานได้ (engine gl.ts เป็น interface กลาง)
- **UI/manual QC 7 ระบบใหม่ + Account** — คลิกทุกหน้าใน browser (service-layer + double-entry ผ่านแล้ว)
- **Chat (LINE + webchat)** ตาม `10-chat.md` — ChannelAdapter + inbox (ระบบเดียวที่ยังเป็น feature ที่เหลือ) · **Restaurant** ตาม `02-restaurant.md` (business ที่เหลือ)
- เก็บลึก P2 ต่อจาก P1 (ดู 🔜 ในสถานะ LIVE): Hotel folio/night-audit, Account ฝั่งรายจ่าย+งบ, SSE realtime (Queue/Ticket/Meeting/Kanban), Coupon→POS contract wiring, ชำระเงินออนไลน์ (Ticket/Hotel)
- ค้าง: push GitHub (ต้องขอ PAT จาก user) · Unit Switcher/เชิญพนักงาน (A1 ที่เหลือ)

## กติกาเมื่อจบ session
อัปเดตไฟล์นี้ + memory `project_shark_in_th` + commit ทุกครั้ง
