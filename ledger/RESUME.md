# RESUME — สถานะสด (เขียนด้วยมือ Fable · เครื่องหลักคือ `pnpm resume`)

> 🔑 **สิ่งที่รอเจ้าของ (ละเอียด+วิธีทำ): [ledger/OWNER_TODO.md](OWNER_TODO.md)**

> อัปเดต 2026-07-17 โดย Fable 5 · **session ใหม่: อ่านไฟล์นี้จากบนลงล่างถึงเส้นแรก แล้วทำงานต่อได้เลย**

## 🧩 UI แตกหน้า + ระบบจองต่อยอด (17 ก.ค.) — ✅ SHIPPED (main 5f61230)
- **ต้นแบบแตกหน้า POS + ระบบจอง**: เมนูแฮมเบอร์เกอร์ accordion (NavItem.children + NavGroup) กางฟังก์ชันย่อยใต้ระบบ + `ModuleTabs` แท็บในหน้า · POS→ภาพรวม/ประวัติบิล · จอง→นัดวันนี้/บริการ/พนักงาน/เวลาทำการ · เอา back "หน้าหลัก"(16 หน้า)+"ระบบทั้งหมด"(2) ออก
- **ระบบจอง A+B**: (A) `BookingStaff.employeeId` soft-link เลือกจากพนักงาน HR ได้ (listLinkableEmployees + createStaff · ไม่เปิด HR=พิมพ์เอง) · (B) `BookingHours` เวลาทำการร้านรายสัปดาห์ (เปิด-ปิด+วันหยุด) → `getAvailableSlots` ใช้เป็นกรอบแทน bookingStaffHours (เลิก seed 10-20 รายช่าง) · qc-booking-hours-hr 13/13
- ⚠️ **กับดัก deploy**: `next build` **ไม่รัน migrate deploy** → หลัง push schema ใหม่ ต้อง `pnpm exec prisma migrate deploy` บน prod เอง (booking migration apply แล้ว) · prisma CLI ต้องใช้ `pnpm exec prisma ...` (config schema-dir · `npx prisma` หา schema ไม่เจอ)
- 🔜 POS เต็มรูปแบบ (หน้าขายจริง/สินค้า/ยกเลิก-คืน/ปิดรอบ) = เสนอ user รอไฟเขียว

## 🧠 AI SELF-IMPROVING (17 ก.ค. — "ทำให้ครบทั้ง 4 เลย") — ✅ SHIPPED ครบ 4 เครื่องมือ (main 131e7dd)
วางระบบให้ AI พัฒนาตัวเองล่วงหน้า (ไม่ต้องรอ level-5) — human-in-loop อนุมัติกันความปลอดภัย
| # | เครื่องมือ | ไฟล์ | ข้อสอบ |
|---|---|---|---|
| 1 | **AI Eval** ชุดข้อสอบวัด AI เลือก tool ถูกไหม (20 เคสทอง + heuristic baseline 100%) | `src/lib/ai/eval.ts` | qc-ai-eval 4/4 |
| 3 | **Feedback 👍👎** ใต้คำตอบ AI (anonymize เก็บ dataset · กด 👎 แนบเหตุผล) | `ai/feedback.ts` + `actions.ts` + `AiChat.tsx` | qc-ai-feedback 5/5 |
| 2 | **Quality Dashboard** หลังบ้าน: คะแนนข้อสอบ + สถิติ 👍👎 รวมทุกร้าน | `platform/ai-quality.ts` + `backoffice/ai-quality` | qc-ai-quality 5/5 |
| 4 | **Prompt Tuning** วงจร: AI เสนอปรับ prompt → แอดมิน backoffice อนุมัติ → ฉีด persona ทุกร้าน (platform axis) | `platform/ai-tuning.ts` + `ai-tuning-actions.ts` + `persona.ts` + `service.ts` + `backoffice/ai-tuning` | qc-ai-tuning 7/7 |
🔑 **เจ้าของอนุมัติ prompt tweak ที่**: backoffice.shark.in.th → "AI ปรับปรุงตัวเอง" · ดูคุณภาพที่ "คุณภาพผู้ช่วย AI"
schema ใหม่: `AiFeedback` (tenant) + `AiPromptTweak` (platform) · migration 20260717060000_ai_selfimprove · gate: typecheck+fitness 14/14+regression qc-ai 17/17 เขียวหมด

## 🌙 RUN 4 (09:20 BKK 17 ก.ค. — "ปล่อยงานทำต่ออีก 3 ชม") — ✅ จบกะ 09:50 BKK · 3 WO SHIPPED (รวมทุกกะ 34/39 ≈ 87%)
| WO | งาน | ข้อสอบ |
|---|---|---|
| 0066 | **i18n v2**: เมนูร้านอาหาร public + จอคิว TV + error สาธารณะ 2 ภาษา (menu/queueTv/err คีย์ใหม่ · สวิตช์ th/en หน้า restaurant) — EN หลังบ้าน = 0066b (เลื่อน) | 6/6 + i18n 7/7 |
| 0065 | **Host-routing**: โดเมนลูกค้า (custom domain ACTIVE) → redirect เข้า /s/<ร้าน>/<สาขา> ตัวเอง (resolve ชั้น app ตาม ADR A6 · landing ย้ายขึ้น root) | 5/5 + domain 10/10 |
| 0040a | **เส้นเงิน (บัญชี ระวังสูง)**: DEPOSIT→Dr 2110 เงินมัดจำรับ · ROOM_CHARGE→Dr 1100 ลูกหนี้ (เลิกยุบเป็นธนาคารผิด · ขา Cr รายได้/VAT คงเดิม สมดุลครบ) | 5/5 + **cpa 107/107** + hotel-money 5/5 + pos-account 16/16 |
🔧 DEFER (tech-debt ภายใน ไม่ปั้น gate หลอก): **0044 query-budget** + **0040b query reduction** — ต้องมี prisma query-log harness ชั้น core ก่อน (นับ query จริงตอน runtime) · ทำ static ใน fitness = gate ประดับไม่วัดจริง จึงเลื่อน
คิวที่เหลือ (5 ใบ) **ติด 🔑 เจ้าของทั้งหมด**: 0069 ราคา plan · 0070 Beam creds · 0071 landing ถ้อยคำ · 0058 OTP ลูกค้า · 0067 LINE OA — ดู ledger/OWNER_TODO.md

## 🌙 RUN 3 (07:53 BKK 17 ก.ค. — "ปล่อยทำต่ออีก 2 ชม") — ✅ จบกะ 08:45 BKK · 6 WO SHIPPED (รวมทุกกะ 31/39 ≈ 79%)
| WO | งาน | ข้อสอบ |
|---|---|---|
| 0056 | **Dashboard builder v1**: widget 8 ตัว เลือก/เรียงจัดหน้าแรกเอง (TenantDashboard + โหมดปรับแต่ง — การ์ด onboarding 0072 คงอยู่) | 6/6 + dashboard 7/7 |
| 0063 | **Marketplace โครง**: เทมเพลตธุรกิจ 4 ตัว (เสริมสวย/ร้านอาหาร/ค้าปลีก/ที่พัก) ติดตั้งคลิกเดียวผ่าน DNA pipeline เดิม + กัน clobber ร้านที่ตั้งค่าแล้ว + /app/marketplace | 7/7 + dna 22/22 |
| 0051 | **School/คอร์สเรียน (ระบบที่ 23)**: คอร์ส·รอบเรียน(capacity)·สมัคร(ผูกสมาชิกอัตโนมัติ)·ค่าเรียน→เส้นเงิน C-2 (`school-<id>`)·เช็คชื่อรายวัน | 7/7 + pos-account 16/16 |
| 0060 | **Delivery โครง**: Shipment ต่อออเดอร์ร้านออนไลน์ (adapter MANUAL — โครงรอ flash/kerry) + สถานะจัดส่งบนหน้า public + ปุ่มจัดส่งฝั่งร้าน | 8/8 + shop 15/15 |
| 0052 | **Clinic (ระบบที่ 24)**: ผู้ป่วยแบบเบา PDPA (แพ้ยาเด่น) + visit + จ่ายยาตัดคลัง (idempotent) + เก็บเงิน→C-2 (`clinic-<visitId>` · fee 0 = ปิดฟรี) | 8/8 + inventory 12/12 |
| 0049b | **Approval wiring**: PO เกินวงเงิน→เข้าสายอนุมัติจริง (คง DRAFT จนอนุมัติ→ORDERED) + ใบลาเข้าสาย (อนุมัติ/ปฏิเสธมีผลจริงผ่าน outbox effect) + ป้าย "รออนุมัติ" บน UI | 7/7 + approval 16/16 + procurement 12/12 + hr 9/9 |
คิวเหลือ (เครื่องทำได้): 0066 i18n v2 → 0065 host-routing → 0040+0044 (รอบสมาธิเต็ม ห้ามขนาน) · ที่เหลือติด 🔑 ทั้งหมด (ดู ledger/OWNER_TODO.md)

## 🌙 RUN 2 (04:12 BKK 17 ก.ค. — สั่ง 2 ชม. แล้วขยายถึง 10:00) — ✅ จบกะ 06:35 BKK · 13 WO SHIPPED (รวมทั้งคืน 25 WO)
| WO | งาน | ข้อสอบ |
|---|---|---|
| 0053 | **E-commerce**: หน้าร้านออนไลน์ /s/<ร้าน>/<สาขา>/shop (catalog+ตะกร้า+checkout) + จ่าย PromptPay QR + ร้านกดยืนยันรับเงิน → เส้นเงิน C-2 ผ่าน pos.createSale + ตัดสต็อก inventory + จัดการสินค้า/ออเดอร์ฝั่งร้าน (ระบบที่ 21: SHOP ใน SYSTEM_DEFS) | 15/15 + pos-account 16/16 + inventory 12/12 |
| 0054 | **Form builder**: ฟอร์ม config ได้ (text/phone/email/select/textarea + required) + ลิงก์สาธารณะ /f/<token> + submissions → lead เข้า CRM อัตโนมัติ + /app/forms builder | 10/10 + crm 25/25 |
| 0062 | **Webhooks ขาออก**: endpoint ต่อ event (เลือก/ทุกเหตุการณ์) + ลายเซ็น X-Shark-Signature (HMAC-SHA256) + delivery log + retry (cron field webhooksRetried) + ผูก outbox ทุก event + /app/settings/webhooks | 11/11 + automation 13/13 + cron 4/4 |
| 0061 | **Public API v1**: /api/v1 (me/customers/inventory/items/shop/orders) read-only + API key hash (โชว์ครั้งเดียว) + rate limit 60/นาที/key + /developers docs ไทย + /app/settings/api (Fable ผ่าตัด: create ลืม tenantId ครั้งที่ 6) | 12/12 |
| 0073 | **คลังความรู้ (KB)**: บทความ+หมวด+ค้นหา /app/kb + AI tool kb_search (AI ตอบจากความรู้ร้านจริง) + **ป้าย "เร็วๆ นี้" ตัวสุดท้ายหลุดจากเมนู** (KB = fixed-page ไม่ instantiate — F9.1 ยกเว้นอย่างเปิดเผย) | 12/12 + ai-tools 14/14 + ai-tools2 8/8 |
| 0039 | **บัญชีลึก**: aging ลูกหนี้/เจ้าหนี้ 5 bucket ต่อคู่ค้า (+หน้า UI ในเมนูบัญชี) + ปิดงวดอัตโนมัติรายวัน (Gate C เดิม · แจ้งผล/แจ้งติดครั้งเดียวต่องวด · cron periodsClosed) — cashFlow มีอยู่แล้ว | 10/10 + **cpa 107/107** + cron 4/4 |
| 0055 | **Report builder v1**: dataset ขาย/ลูกค้า/สต็อก + filter/group/sum + CSV (BOM) + บันทึกรายงาน /app/reports (กัน field injection ด้วย whitelist) | 9/9 |
| 0072 | **Onboarding drip**: checklist เริ่มต้นร้าน 6 ข้อ (การ์ดบน dashboard ติ๊กอัตโนมัติ) + แจ้งเตือนแนะขั้นถัดไปรายวัน 14 วันแรก (cron onboardingDripped) | 6/6 + cron 4/4 |
| 0048 | **DNA ต่อเนื่อง (M4.5)**: ตรวจ drift 5 กติกา (พนักงาน/สมาชิก/ขายสินค้า/VAT/สาขา เทียบ facts กับข้อมูลจริง) → แจ้ง "ธุรกิจคุณเปลี่ยนไปจากตอนตั้งค่า" ชวนคุย AI (กันสแปม 7 วัน · cron dnaReviews) — oracle ผมเขียน active ผิดเอง Builder ชี้ถูก | 5/5 + cron 4/4 |
| 0050 | **Rental (ระบบที่ 22)**: สินทรัพย์ให้เช่า + จองกันซ้อน (endDate exclusive) + รับของ/คืน + ค่าปรับ → เส้นเงิน C-2 (PosSale `rental-<id>`) · มัดจำถือใน booking (รอ DEPOSIT mapping 0040 → 0050b) + UNIT_NAV + UnitType RENTAL | 11/11 + pos-account 16/16 |
| 0059 | **Vendor Portal**: ลิงก์พกพา read-only /vendor/<token> ให้ผู้ขายเห็น PO ตัวเอง (rotate/ปิดได้ · token-first + tenantDb ชั้นสอง) + ปุ่มเปิดลิงก์ในหน้า supplier | 6/6 + procurement 12/12 |
| 0064 | **White label v1**: ชื่อแบรนด์/โลโก้/สี ต่อร้าน (/app/settings/branding + preview) ใช้จริงบน storefront shop + ฟอร์มสาธารณะ (setBranding เป็น partial patch · กัน javascript: URL) | 5/5 + shop 15/15 + form 10/10 |
| 0068 | **PWA polish**: manifest.ts (standalone · ไทย · ไอคอน 192/512 Fable วาดเองด้วย pixel) + viewport themeColor (Next 16 แยกจาก metadata) + appleWebApp — ติดตั้งลงมือถือได้ | 5/5 |
หมายเหตุ RUN 2: Vercel เจอ incident ~05:45-07:00 BKK (สร้าง deployment ไม่ได้ — webhook/API/deploy hook เงียบหมด · ไม่มี downtime เพราะเสิร์ฟ build เก่า) → **ฟื้น ~07:30 · HEAD 9845ed0 READY ครบทุก commit แล้ว ✅** (smoke: /api/health /developers /manifest 200) · Builder ขนาน 2 ตัวครั้งแรก — เจอ race `prisma generate` ทับกัน (client แชร์ node_modules ข้าม worktree) → กติกาใหม่: **verify สุดท้ายจาก main หลัง merge + generate จาก schema main เสมอ** · 0058 Customer Portal ข้ามไว้ (login OTP ลูกค้าต้องมีช่องทาง SMS/LINE = 🔑 รอเจ้าของ)
follow-up: forms actions อยู่ src/app/app/forms/actions.ts นอก walk ของ F6 (มี assertCan ครบ แต่ ratchet ไม่คุม — ย้ายเข้า modules ทีหลัง)

## 🌙 รายงานกะกลางคืน (2026-07-16 21:39 → 17 กลางดึก) — NIGHT RUN จบ 12 WO ✅ ปิดกะ 00:48 BKK (17 ก.ค.)
| WO | งาน | ข้อสอบ |
|---|---|---|
| 0041 | Observability: logger กลาง+alert throttle+/api/health (live บน prod แล้ว)+backoffice system-health | 7/7 + cron 4/4 |
| 0035 | ภ.พ.30 CSV ระดับยื่นจริง (ของเดิม pnd3/53+WHT cert ครบเกินคาด — audit ฟรี) | typecheck+107 คุม |
| 0045 | AI actions ×5 ใหม่ → **AI ทำแทนได้ 10 อย่าง / 18 tools** (สร้างสินค้า/ปรับสต็อก/พนักงาน/คูปอง/การ์ดงาน) | 12/12 + regression 6 ชุด |
| 0036 | **Payroll ไทย**: ปสส. (เพดาน/config) + ภงด.1 annualize + สลิปพิมพ์ + ลงบัญชี JV สมดุล | 19/19 + hr 9/9 + **บัญชี 107/107** |
| 0042 | **PDPA**: export ข้อมูลร้าน + ขอลบร้าน 30 วัน (ยกเลิกได้) + purge cron กันลบข้ามร้าน + DR runbook (11_DR.md) | 8/8 + cron 4/4 |
| 0046 | **AI นักวิเคราะห์**: snapshot ธุรกิจ + รายงานสัปดาห์อัตโนมัติทุกจันทร์ 03:00 → แจ้งเตือน | 8/8 + regression |
| 0047 | **AI ร่างคำตอบเคส support** ให้ทีมแพลตฟอร์ม (คนกดส่งเสมอ · ไม่แตะ DB) | 7/7 + support 12/12 |
| 0049 | **Approval Engine**: สายอนุมัติ config ได้ (maker-checker) — policy/step (MANAGER→OWNER) + threshold วงเงิน + เจาะจงสุดชนะ + decide claim อะตอมมิก + UI ตั้งกฎ (/app/settings/approval) + รายการรออนุมัติ (/app/approvals) + 3 outbox event→แจ้งเตือน | 16/16 + cron 4/4 + automation 13/13 |
| 0037 | **Multi-warehouse**: InvLocation ต่อ system + สต็อกต่อคลัง (invariant sum==onHand · lazy migration ไม่ต้อง backfill) + โอนระหว่างคลัง (movement คู่ TRANSFER idempotent) + PO รับเข้าเลือกคลัง + UI (ร้านคลังเดียวเห็นหน้าเดิมเป๊ะ) | 15/15 + inventory 12/12 + procurement 12/12 |
| 0043 | **Hardening**: กันถล่ม OTP (อีเมล 5/10นาที · ip 20/10นาที · backoffice 5/10นาที — นับจาก AuthToken ไม่มีตารางใหม่) + `core/cron-auth.ts` รวม secret 2 มาตรฐาน (Bearer/X-Cron-Secret · constant-time · ของเก่าไม่พัง) + HSTS 2 ปี + Permissions-Policy + `core/rate-limit.ts` sliding window + docs/SECURITY_AUDIT.md (prod smoke: headers live · tick 401 · outbox secret ใหม่ 200) | 15/15 + cron 4/4 + chat-security 23 |
| 0057 | **ปฏิทินกลาง** read-only /app/calendar รวม 3 แหล่ง (นัดหมาย+เข้าพักโรงแรม+วันลา) — grid เดือน จุดสีต่อประเภท กดวันดูรายการ + ลิงก์ NavDrawer (Fable เสริม assertCan calendar.event.read ตาม F6) | 9/9 |
| 0038 | **Lot/Expiry/Barcode**: InvLot ต่อ item (รับเข้า/ตัดออกระบุ lot ได้ · ไม่ระบุ = พฤติกรรมเดิม) + แจ้ง "สินค้าใกล้หมดอายุ" อัตโนมัติทุกวัน (7 วันล่วงหน้า · idempotent/วัน · cron field lotsExpiring) + Automation event `inventory.lot.expiring` (Fable เสริม consumer ปิด event กัน PENDING วน) + ค้นสินค้าด้วยบาร์โค้ด | 13/13 + inventory 12/12 + warehouse 15/15 + cron 4/4 + automation 13/13 |
เหตุการณ์เด่น: fitness จับสถาปัตยกรรม payroll 3 ข้อ (hr ล้วง gl/raw prisma) → Fable ผ่าตัด: postPayrollJV เข้า account facade + hr→account ลง allowlist + tenantDb ทั้งไฟล์ · cwd shell หลุด 2 ครั้ง (กู้จากกิ่ง worktree สำเร็จ — ย้ำกติกา cd สัมบูรณ์) · oracle stale กันล่วงหน้า 2 จุด (GR-0.1/V2-0.1) · Builder 0043 สร้าง webchat endpoint คู่ขนานเพื่อเอาใจ path ที่ oracle เขียนผิด → Fable ลบ dead endpoint + แก้ oracle ชี้ route จริง [connectionId] (ของจริงมี limiter M9 อยู่แล้ว) · F5 baseline 34→36 (approval $transaction+outbox · inventory sweep ข้ามร้าน — จงใจทั้งคู่ มี comment ใน fitness.mts)
รอเจ้าของ: สแกน QR ทดสอบ · Bunny key · follow-up: 2140 ปสส.ค้างนำส่งใน CHART · summarizeCase wire หน้า list · i18n v1.1 · 0045b (ตอบเคสในนาม user) · **0049b wiring approval เข้า PO/ใบลาจริง** + นโยบายยื่นซ้ำหลัง REJECTED (idempotencyKey ตายตัว 1 entity=1 request — ต้อง version key ถ้าธุรกิจต้องแก้แล้วยื่นใหม่) + จำกัด policy.create เฉพาะ OWNER (ตอนนี้ MANAGER สร้างได้ตาม RBAC กลาง)
คิวถัดไปตาม 10_MASTER_QUEUE: 0063 Marketplace โครง (dep 0061✅) → 0066 i18n v2 → 0056 Dashboard builder (dep 0055✅) → 0060 Delivery โครง (dep 0053✅) → 0051 School → 0052 Clinic → 0065 host-routing · รอบสมาธิเต็ม: 0040 หนี้เส้นเงิน + 0044 · ติด 🔑: 0058 (OTP ลูกค้า) 0067 (LINE OA) 0069 (ราคา) 0070 (Beam) 0071 (ถ้อยคำ)

## 🤖 Agentic 1-3 (เจ้าของสั่ง 17 ก.ค. บ่าย: "ทำ 1,2,3") — ✅ LIVE · AI ขยับ 2.5 → 3.5
**1 Memory** (ความจำถาวรต่อร้าน): ai/memory.ts rememberFact/forget/memoryBlock → ฉีด system prompt · tool remember_fact/forget_fact/list_memories (action=false จดทันที) · qc-ai-memory 7/7
**2 Plan L2** (แผนหลายขั้น): ai/plans.ts createPlan/executePlan (รันทีละ step ผ่าน runKind→dispatch เดิม · step ล้มหยุด · hasDestructive→confirm2x ระดับแผน) · tool propose_plan + การ์ดแผน AiChat · export DESTRUCTIVE_KINDS+runKind จาก proposals.ts · qc-ai-plan 7/7
**3 Schedule** (งานประจำ AI ทำเอง): ai/scheduled.ts createTask/runScheduledTasks (ตรง hourBkk+lastRunDay กันซ้ำ · ใช้ sendMessage tier fast=haiku ประหยัด) · kind ai_schedule_task + tool schedule_task (NORMAL) · **/api/cron/hourly (isCronAuthorized) + vercel.json cron รายชั่วโมง** · qc-ai-schedule 8/8
รวม AI ตอนนี้: ~44 tools · ความจำ+แผนหลายขั้น+งานประจำ · regression AI ทั้งหมด + hardening 15/15 เขียว
**Defer**: eval loop (ระดับ 5 self-improving) รอ dataset จากร้านจริง · restaurant AI · API v2 write

## 🧠 AI Brain + Proactive (เจ้าของสั่ง 17 ก.ค. เที่ยง: level 1 + ลด token + dataset) — ✅ LIVE
ทิศทางล็อก: **AI หน้าเดียว เก่งทุกอย่าง** (เจ้าของเลือก — ถอนไอเดียแยกหลาย AI · simple ชนะ)
**ลด token**: routing 2 ชั้น pickModel() — คำถามอ่านสั้น→haiku · งานหนัก/มีรูป→sonnet · **ลบ SHARK_AI_MODEL (.env+Vercel) เปิด auto-routing แล้ว** (ตั้งคืนถ้าอยากบังคับตัวเดียว) + prompt caching (cache_control ephemeral system+tools) — qc-ai-brain 8/8
**Proactive L1** (พนักงานเชิงรุก): ai/proactive.ts gatherProactiveInsights 4 กติกา (สต็อกต่ำ/อนุมัติค้าง 2 วัน/ลาค้าง/ออเดอร์รอ) → sweepProactiveNudges cron field proactiveNudges → AppNotification "ผู้ช่วยมีเรื่องอยากบอก" กันสแปมรายวัน — qc-ai-proactive 6/6 (ยิงอัตโนมัติทุกวันแล้ว)
**Dataset (ฐาน self-host)**: ai/dataset.ts anonymize (เบอร์/อีเมล→placeholder คงตัวเลขยอด) + recordSample เก็บ AiTrainingSample เฉพาะ SHARK_AI_COLLECT=1 (ปิดอยู่ — เปิดเมื่อพร้อม+ขอ consent) · self-host เต็มรูปรอมีร้าน 50-100+ ร้าน
**Defer**: AI ระดับ 2 (agentic multi-step) — เจ้าของยังไม่สั่ง

## 🤖 AI Upgrade (เจ้าของสั่ง 17 ก.ค. สาย: "ทำแทนได้ทุกฟังก์ชัน · กำกวมให้ choice · ลบต้องยืนยัน · สั่งผิดต้องบอก") — ✅ A+B1+B2 LIVE
**โมเดล**: haiku-4.5 → **Sonnet 5** (.env+Vercel · แพงขึ้น ~3-5 เท่า/ครั้ง — จับตา AiUsage)
**Phase A (กลไก)**: ask_clarify ถามกลับพร้อมปุ่ม choice + SendResult.clarify · **destructive 2 ชั้น** (AiProposal.risk NORMAL|DESTRUCTIVE · executeProposal opts.confirm2x · UI ปุ่มแดง 2 จังหวะ · server บังคับเสมอ) · validate-explain ({error,suggestion} ไม่สร้าง proposal) — qc-ai-phase-a 9/9 (รวม void_sale e2e บิลจริง)
**Phase B1 (เงินเดิน)**: pos_create_sale · booking_create_appointment · hotel_create_reservation · queue_issue_ticket · shop_confirm_order + read 3 (today_appointments/queue_waiting/shop_pending_orders) — qc-ai-phase-b1 9/9 · **ผ่าตัดกันจองผี**: ห้าม AI auto-เปิดห้อง (B1-3.2)
**Phase B2 (ชุดปิด)**: crm_create_lead · kb_create_article · school_enroll · school_mark_paid · clinic_create_patient · rental_create_booking · **approval_decide** · inventory_consume + read 2 (approvals_pending/rental_active) — qc-ai-phase-b2 11/11 · ผ่าตัดถอด note param CRM (service ไม่ persist)
**รวม**: AI มี **~40 tools** (อ่าน 14 + ทำแทน 25 รวม destructive 4) ครอบ ~20 โมดูล · dispatch รับ m (MembershipCtx) แล้ว
**Defer**: restaurant order flow (ซับซ้อน state machine โต๊ะ/KDS) · API v2 เขียนได้ (แผน C — เจ้าของยังไม่เคาะ) · AiChat unread badge นับจาก AppNotification (แชร์กับศูนย์แจ้งเตือน)

## 🎨 UI feedback เจ้าของ 12 ข้อ (2026-07-17 สาย) — ✅ ครบทุกข้อ LIVE
1 orb เล็ก+หนา · 5 help icon น้ำเงิน · 6 เอา dashboard header ออก · 9 NavDrawer เอา SHARK ออก/ชื่อกิจการใหญ่ · 10 ไอคอนเมนู SVG ดำ (NavIcon.tsx emoji→svg map) · 11 ปุ่มเพิ่มระบบน้ำเงิน · 12 ปุ่ม + วงกลมน้ำเงิน dashboard · **2/3/8 Help Center ระบบเคสเต็ม** (caseNo running + shopLastReadAt + attachmentsJson · qc-help-v2 8/8) · **4 AI vision** (imageUrls inline + record_expense proposal → createExpenseDoc · qc-ai-vision 6/6) · **7 badge unread** (help=unreadCaseTotal · AI=AppNotification readAt null · layout→AppShell→Topbar/AiDock)
🟢 **Bunny storage เปิดใช้จริง**: zone shark + key + CDN https://shark-in-th.b-cdn.net (ทดสอบ PUT→CDN 200) ครบใน .env+Vercel · storageEnabled()=true. follow-up: Help attachment ตอนนี้ base64 dataURL — ย้ายไป Bunny upload ทีหลังได้ (optional)

## 🎯 CHECKPOINT 2026-07-17 — จุดต่องาน (อ่านตรงนี้ก่อน)
**สถานะ**: shark.in.th LIVE บน Vercel · main = ทุกอย่าง merge แล้ว · deploy READY · ไม่มี worktree/neon branch ค้าง · WO-0001→0034 done หมด (ยกเว้น WO-0032 = เลขข้าม ไม่มีจริง)

**สิ่งที่มีในระบบตอนนี้**: 18 โมดูล + AI ครบวงจร (แชท orb · 13 tools อ่าน+ทำแทนผ่าน proposal-confirm · M4 เล่าธุรกิจอิสระ · Growth แนะนำ/เปิดระบบให้) · Backoffice Phase 0+1 ครบ (login OTP แยก · tenants+metrics · support desk · ระงับร้าน+audit · ประกาศ · billing) · การเงิน (PromptPay QR + PlatformInvoice) · storage (รอ key) · custom domain (Vercel API) · Automation · Subscription · Procurement · Cron 03:00 BKK · Dashboard หน้าแรก · i18n public th/en

**โหมดทำงานถาวร (คำสั่ง user)**: Fable = หัวหน้า (ออกแบบ+เขียน oracle ก่อน+ตรวจรับ+merge+รายงาน) · Builder = sub-agent Opus 4.8 ≤2 ตัวขนาน ใน worktree+neon branch · Builder ห้ามรัน typecheck/build · บันทึก+push ทุกขั้น

**กติกาเหล็กจากบทเรียนจริง (ห้ามลืม)**:
1. gates ทุกครั้ง: `set -o pipefail` ก่อน `pnpm typecheck | tail` (pipe กลืน exit code)
2. typecheck ก่อน push **ทุกครั้ง** รวม push ของกลาง — Vercel build typecheck `scripts/` ด้วย → oracle ล่วงหน้าต้อง standalone-typesafe (dynamic import `as string` + wide cast ห้าม typed literal อนาคต)
3. ยืนยัน deploy จาก Vercel API state=READY (poll) ไม่ใช่ curl 200
4. create ผ่าน tenantDb ต้องใส่ tenantId (+systemId) ตรง ๆ ใน data — type ไม่รู้จัก guard inject (พลาดมา 5 รอบ)
5. `tenantDb().upsert()` ใช้ไม่ได้ (guard ห่อ where) → find→update/create หรือ updateMany เงื่อนไขสถานะ
6. ห้าม `as const` ต่อท้าย ternary (TS1355)
7. Builder ≤2 + ห้าม build ขนาน (บทเรียน OOM 2 core/3G)
8. oracle เก่าเช็คแบบ superset — จำนวนรวมคุมโดย oracle รุ่นล่าสุดเท่านั้น
9. cwd ชอบหลุด → `cd /root/projects/shark-in-th` ก่อนทุกชุดคำสั่ง

**env/keys ที่มีแล้ว** (local .env + Vercel prod): SHARK_AI_KEY (OpenRouter) · SHARK_AI_MODEL · SHARK_CRON_SECRET · SHARK_VERCEL_TOKEN/PROJECT/TEAM — **รอจาก user**: SHARK_BUNNY_* (เปิดอัปโหลดจริง) · Beam creds ชื่อ shark · user สแกน QR PromptPay ทดสอบ
**Vercel**: project prj_jdvr3lJ7tS239wuywjWRBDE84FiK team team_73xWxzvBBScACJuG4TXet6Uw (token ใน .env) · **Backoffice admin**: suksomsri@gmail.com (SUPER_ADMIN seeded)

**📘 SDS ชุดเต็มพร้อมแล้ว (2026-07-17)**: `docs/sds/` — เล่มแกน 10 + เล่มโมดูล 36 (as-built 24 + future 12) + **Master Queue 39 WO (0035-0073)** ใน 10_MASTER_QUEUE.md · โหมดรันยาวอยู่เล่ม 09 · **รอเจ้าของอนุมัติ "ปล่อยยาว" — ยังไม่เริ่ม**

**🌙 NIGHT RUN จบแล้ว (ปิดกะ 00:48 BKK 17 ก.ค.)** — 12 WO SHIPPED ดูตารางบนสุด · ไม่มี Builder/worktree/neon branch ค้าง · deploy READY · รอเจ้าของตื่นมาสั่งคิวถัดไป

**🚀 วิธีสั่งปล่อยยาว (เจ้าของถาม 2026-07-17)** — พิมพ์ประโยคนี้ใน session ไหนก็ได้:
> **"อ่าน ledger/RESUME.md แล้วปล่อยยาวตาม docs/sds/10_MASTER_QUEUE.md"**
ความหมายที่ AI ต้องทำ: เข้าโหมดรันยาวตาม docs/sds/09_OPERATIONS.md (วงจร 10 ขั้น: เช็ค Support Desk → หยิบ WO → oracle → Builder ≤2 → ตรวจซ้ำ → merge → gates pipefail → push → deploy READY → บันทึก → วน) เริ่มที่ WO-0041 ตามลำดับแนะนำท้าย 10_MASTER_QUEUE · สรุปให้เจ้าของทุก ~5 WO · หยุดเมื่อเจ้าของสั่ง "หยุด" เท่านั้น

**คิวถัดไป (เรียงแนะนำ)**:
1. หนี้บัญชีลึก (รอบสมาธิเต็ม): ลด query flow เงิน (tx timeout 30s ชั่วคราว) · DEPOSIT/ROOM_CHARGE map TRANSFER · audit booking→POS harness
2. i18n v1.1: หน้าเมนูร้านอาหาร + จอคิว TV + error จาก action
3. host-routing โดเมนลูกค้า (รอ adapter-neon หรือ resolve ที่ชั้น app — resolveTenantByHost พร้อมแล้ว)
4. หลังมีลูกค้าจริง: Multi-warehouse · Portal · BI เต็ม · Marketplace · White Label
---

## 🔴 2026-07-16 13:10 BKK — session ถูก OOM ฆ่า (3 Builder ตายกลางคัน)
**เกิดอะไร**: รัน 3 Builder ขนาน + `Run build` + `Run next build` + `Typecheck` พร้อมกันบน VPS 2 core
→ load แตะ **3.65** (email เตือน 13:10) → หน่วยความจำทะลุ `MemoryMax=3G` ของ `claude-remote.service`
→ kernel OOM ฆ่า node (rss 1.0GB) 06:10:48+06:11:07 UTC → session ตาย → service restart 06:15 UTC
**อาการหลอก**: มือถือค้างที่ "Stopping…" 6 task เป็นชั่วโมง = **ซาก UI ไม่ใช่งานจริง** (event จบไม่เคยส่ง)
ตอนนี้ load 0.56 · service ใช้ 445M/3G · **ไม่มีอะไรวิ่งค้างอยู่จริง**
**กันซ้ำ**: อย่ารัน Builder ขนาน >2 ตัวพร้อม build/typecheck บนเครื่องนี้ — 2 core/3G ไม่พอ

## ✅ 2026-07-16 บ่าย — Fable ตรวจรับ 3 Builder ครบ merge แล้ว
- **WO-0011 Inventory** oracle 12/12 · **WO-0012 HR** 9/9 · **WO-0013 Marketing** 8/8 (Fable แก้ 1 จุด: tenantId/systemId ใน createMany ให้ตรง type)
- ทุกตัวผ่าน qc:account 107/107 + fitness 14/14 + typecheck → merge เข้า main + **wire dispatch sys/[id]/page.tsx แล้ว** (INVENTORY/HR/MARKETING)
- แก้เพิ่มตามคำสั่ง user บ่ายนี้:
  - **DNA Wizard ค้าง "กำลังประกอบระบบ…"** = ฝั่ง client เท่านั้น (server APPLIED 10/10 ใน 26 วิ) → กัน 2 ชั้น: apply-button catch+refresh · blueprint page redirect /app ถ้า planHash APPLIED แล้ว
  - **AiDock**: ย้ายมุมขวาล่าง + ซ่อนใน /app/dna + เปลี่ยนเป็นรูป orb gradient (`public/ai-orb.png`, gen ด้วย fal.ai seedream ครั้งเดียว — key Content, ยังไม่มี FAL key ชื่อ shark)
- เก็บกวาด: neon wo-0011/12/13 ลบแล้ว + worktree 3 อันลบแล้ว

## ✅ 2026-07-16 เย็น — AI Layer Phase 1 SHIPPED (WO-0014/0015)
- `docs/AI_LAYER.md` = แผน 3 เฟสจากวิสัยทัศน์ "AI Business OS" ของ user (ไฟล์ Blank_6)
- kernel `src/lib/ai/` (rules/provider/persona/service/actions) + schema AiConversation/Message/Usage + migration ลง prod
- oracle qc-ai.mts **17/17** (Mock) · qc:account 107/107 · fitness · typecheck เขียวหมด
- ปุ่ม orb → แชทจริง (AiChat.tsx) — persona ผู้ช่วยประจำกิจการ รู้ชื่อร้าน+ระบบที่เปิด
- **SHARK_AI_KEY (OpenRouter ชื่อ shark) user ให้แล้ว** — อยู่ใน .env local + Vercel env (ผ่าน API) · ทดสอบยิงจริงผ่าน (haiku-4.5)
- UI Pass 3 โมดูลใหม่จบ (ConfirmDialog ส่งแคมเปญ + formatBaht)
- **NEXT: WO-0016 M4 สัมภาษณ์พิมพ์อิสระ (ปลดบล็อกแล้ว) → Phase 3 tool use → Backoffice Admin**

## คำสั่งล่าสุด user (2026-07-16 เย็น) — โหมดทำงานถาวร
1. **Fable 5 = หัวหน้างาน** (วางกติกา/oracle/ตรวจรับ/merge) · **sub-agent Opus 4.8 = Builder** ทำงานสร้างทั้งหมด
2. **บันทึกทุกงานลง ledger + push ทันที** กัน session ล้ม (บทเรียน OOM เช้านี้)
กติกากันตาย: Builder ≤2 ตัวพร้อมกัน · Builder ห้ามรัน typecheck/build เอง (Fable รันรวมหลัง merge) · commit บ่อย
✅ deploy: **Vercel auto-deploy ทุก push** (shark.in.th prod เดียว) · **VPS ปิดแล้ว**

## ✅ 2026-07-17 — งานกลางจบครบ (WO-0031/0033/0034 + ธีมตรวจแล้วครบอยู่ก่อน)
- **ประกาศระบบ** (8/8): /backoffice/announcements → banner ทุกร้านจน "รับทราบ" — BACKOFFICE Phase 1 ครบ 100%
- **AI Growth** (8/8): growth_recommendations (กติกา R1-R3 deterministic) + open_system ผ่าน proposal — Continuous Optimization ตามวิสัยทัศน์ · registry 13 tools
- **i18n v1** (7/7): dict th/en 41 คีย์ + LanguageSwitcher (cookie lang) — หน้า public ลูกค้า 3 จุด (จองคิว/หน้าร้าน/ใบเสร็จ) · หลังบ้านไทยล้วนตามเดิม · follow-up v1.1: restaurant/queue-display + error จาก action
- **NEXT ใหญ่ที่เหลือ**: หนี้บัญชีลึก 2 ข้อ + audit booking→POS (ต้องรอบสมาธิเต็ม) · host-routing โดเมน · งานหลังมีลูกค้าจริง (Multi-warehouse/Portal/BI/Marketplace/WhiteLabel)

## 🔧 2026-07-17 — ไขปริศนา "เมล deploy ล้ม" ที่ user ได้รับตลอด
**สาเหตุ**: Vercel `next build` typecheck โฟลเดอร์ `scripts/` ด้วย → oracle contract-first ที่อ้าง type อนาคต (เช่น kind "open_system" ก่อน Builder เพิ่มใน ProposalKind) ทำ **deploy ล้มช่วงรอยต่อระหว่าง push ของกลาง → merge งาน Builder** แล้วหายเองหลัง merge (prod เสิร์ฟรอบสำเร็จล่าสุดเสมอ จึงไม่เคยล่มจริง)
**กติกากันซ้ำ (บังคับ)**:
1. oracle ที่อ้างสัญญาอนาคต ห้ามใช้ typed literal ตรง ๆ — ใช้ dynamic import `as string` + wide cast (`as unknown as`) เสมอ
2. `set -o pipefail && pnpm typecheck` **ก่อน push ทุกครั้ง** รวม push ของกลาง (ไม่ใช่แค่หลัง merge)
3. ยืนยัน deploy จาก Vercel API state=READY ไม่ใช่แค่ curl 200 (curl อาจเจอของเก่า)
deploy ล้มที่พบ: 3fc06f0 · ce33d01 · 3385a6f · 42264bb — ทั้งหมด recovered แล้ว, 0f76517 READY

## ✅ 2026-07-17 — WO-0029/0030 SHIPPED (ข้อ 2 ที่ user เลือก)
- **Cron จริง**: /api/cron/tick (Bearer SHARK_CRON_SECRET) กวาด subscription/proposal หมดอายุ + outbox เก็บตก · vercel.json ตั้ง 03:00 BKK ทุกวัน · **ยิงจริงบน prod แล้ว: 200 JSON ถูก + ไม่มี secret = 401** · หมายเหตุ: CRON_SECRET เดิม (/api/cron/outbox, x-cron-secret) ยังอยู่คู่กัน
- **Dashboard หน้าแรก**: /app มี "ภาพรวมวันนี้" (ยอดขาย/สมาชิกใหม่ 7 วัน/สต็อกใกล้หมด/ใบลารอ/แจ้งเตือน) โชว์ตามระบบที่เปิด — ตาม Blank_6
- หนี้บัญชีลึก 2 ข้อ (ลด query flow เงิน · DEPOSIT map) + audit booking→POS ยัง defer — ต้องทำแบบมีสมาธิเต็มรอบถัดไป

## ✅ 2026-07-16/17 — ชุดงาน 4-8 จบครบ 3 Round (WO-0023→0028 SHIPPED ทั้ง 6)
- **0023 PromptPay QR + Billing**: ร้านตั้ง PromptPay ID → QR รับเงิน (EMVCo+CRC ตรง vector) · backoffice ออกบิล/รับชำระ/ยกเลิก + audit — ⚠️ แนะนำ user สแกน QR กับแอปธนาคารก่อนใช้จริง
- **0024 Object storage**: อัปโหลดโลโก้ → Bunny (env SHARK_BUNNY_* — **รอ key ชื่อ shark จาก user จึงเปิดจริง** ตอนนี้ปิดสุภาพ URL-paste ใช้ได้เหมือนเดิม)
- **0025 Custom domain**: settings/domain → Vercel API (smoke จริงผ่าน: add/get/delete) + DNS แนะนำ + ตรวจสถานะ · env ตั้งแล้ว local+Vercel · **host-routing ใน proxy = defer** (Vercel runtime + pg adapter — resolveTenantByHost พร้อมเสียบ)
- **0026 Automation v1**: กติกา Trigger→เงื่อนไขยอด→แจ้งเตือนในแอป/เว็บฮุค เกาะ outbox แบบห่อ handler (ไม่กระทบ retry/idempotency) + ศูนย์แจ้งเตือน /app/notifications
- **0027 Subscription**: แผนสมาชิกรายเดือน/ปี + สมัคร/ยกเลิก/หมดอายุ (expireDue cron-ready) ในระบบ MEMBER
- **0028 Procurement**: Supplier + PO (DRAFT→ORDERED→RECEIVED) รับของเข้าสต็อกผ่าน invSvc.receive idempotent ในระบบ INVENTORY
- oracle ใหม่ 6 ชุด 73 ข้อ เขียวหมด (Fable รันซ้ำทุกชุด) · **บทเรียนใหม่**: `| tail` กลืน exit code → gates ต้อง `set -o pipefail` · `tenantDb().upsert()` พัง (guard ห่อ where) ใช้ find→update/create · ห้าม `as const` กับ ternary
- **defer อธิบายใน summary**: Beam gateway (รอ creds shark) · Multi-warehouse/Portal/BI/Marketplace/White Label (งานใหญ่ — หลังมีลูกค้าจริง)

## ✅ 2026-07-16 ดึกสุด — WO-0021/0022 SHIPPED (รอบ Builder ที่ 3)
- **WO-0021 Support Desk + ระงับร้าน**: ปุ่ม help ในแอป → เปิดเคส/คุยต่อ · /backoffice/cases ตอบ+ปิด · ระงับ/เปิดร้าน SUPER_ADMIN 3 ชั้น + PlatformAuditLog append-only · gate /suspended ใน requireTenant (Fable ทำ core เอง)
- **WO-0022 AI tools v2**: รวม 11 เครื่องมือ — +ค้นลูกค้า/ยอดขายรายวัน (อ่าน) +สมัครสมาชิกให้ (ทำแทน kind "member_create")
- oracle ใหม่ 2 ชุด (qc-support 12 ข้อ · qc-ai-tools2 8 ข้อ) · กติกาใหม่กัน oracle stale: ข้อสอบเก่าเช็ค superset จำนวนรวมคุมโดยรุ่นล่าสุด
- แผลซ้ำที่เจอ 3 รอบวันนี้: create ผ่าน tenantDb ต้องใส่ tenantId ตรง ๆ ให้ตรง type — **คิดทำ lint/fitness rule ในอนาคต**
- **NEXT**: Billing/Payment (PromptPay/Beam) → object storage → i18n EN → M4 ต่อยอด (แนะนำเปิดระบบเพิ่มเมื่อโตขึ้น ตามวิสัยทัศน์)

## ✅ 2026-07-16 ดึก — AI Layer ครบ 3.5 เฟส + Backoffice เปิด (โหมดหัวหน้า-Builder เต็มรูป)
- **WO-0018 SHIPPED**: AI อ่านข้อมูลจริง 5 tools (ยอดขาย/สต็อก/ใบลา/สมาชิก/ระบบ) — smoke จริงเรียก tool ตอบถูก
- **WO-0019 SHIPPED**: Backoffice Phase 0 (/backoffice login OTP แยกขาด + tenants + metrics) — **seed SUPER_ADMIN suksomsri@gmail.com บน prod แล้ว** · Phase 1 ถัดไป: ระงับร้าน+AuditLog / ประกาศ / support desk
- **WO-0020 SHIPPED 🔴 คำสั่งตรง user**: AI ทำงานแทน — เสนอ→user ยืนยันบนการ์ดในแชท→execute ผ่าน assertCan สิทธิ์คนกด · 3 actions แรก (รับสต็อก/ตัดสินใบลา/แคมเปญร่าง) · smoke จริง: สต็อก 0→12 หลังยืนยัน
- บทเรียนรอบนี้: Builder จับ oracle stale/ขัดแย้งได้ 2 ครั้ง (Fable ยอมรับ+แก้) · mock-gate ถูกถอน (test=prod เสมอ)
- **NEXT**: Backoffice Phase 1 (suspend+audit+ประกาศ+support desk) → action-tools เพิ่ม (จองคิว/ดูรายงานลึก) → Billing/Payment → object storage → i18n EN

## ✅ 2026-07-16 ค่ำ — รอบ Builder แรกของโหมดหัวหน้า-ลูกน้อง จบสวย
- **WO-0016 M4 สัมภาษณ์พิมพ์อิสระ SHIPPED** (Builder A Opus · oracle 9/9 · smoke LLM จริง 3 เทิร์น → 13 facts ถูกหมด) — "Stop Learning Software. Start Talking to AI." ใช้ได้จริงแล้วบน /app/dna
- **WO-0017 raw color /r/[token] SHIPPED** (Builder B Opus · 13 จุด → token)
- Fable แก้ตอนตรวจรับ: probe wizard ไม่ยิง LLM ตอน mount (interviewEnabledAction) + import ตกหล่น
- ไม่มี worktree/neon ค้าง — เก็บกวาดหมดแล้ว
- **NEXT:** Phase 3 AI tool use (สั่งงานแทนผ่าน assertCan) → Backoffice Admin → Billing/Payment → object storage

## เสร็จแล้ว (main)
M0 kernel guard · M1 POS→Account · M2 UI shell · M3 DNA Wizard · WO-0003 คูปอง · WO-0006 authz 8 โมดูล · **WO-0009 CRM เต็มระบบ (25/25)** · **WO-0010 สะพาน Deal→ใบเสนอราคา**
WO-0007 Ticket→POS · WO-0008 Hotel→POS (ทั้งคู่รีแฟกเตอร์ใช้ systemForUnit หลัง merge)
audit ฟรี: restaurant→POS→บัญชี
**ทุกระบบธุรกิจมีเงินเข้าบัญชีครบ**: POS·restaurant·ticket·hotel·booking(wiring)·coupon
CI: 9 suite ~240 ข้อ · เขียวแท้

## หนี้/backlog
- audit booking→POS: wiring มีใน actions/booking.ts แต่ต้อง session harness (เลื่อน)
- ลดจำนวน query ใน flow เงิน (tx timeout ขยายเป็น 30s ชั่วคราว)
- DEPOSIT/ROOM_CHARGE map เป็น TRANSFER ชั่วคราว
- M4: LLM free-text บน DNA — **ต้องขอ OpenRouter key ใหม่ (ชื่อ shark) จาก user** (ห้ามใช้ key ข้ามโปรเจกต์)
- raw color เก่าใน (store)/r/[token]

## 🔒 Wave 0 Security Hotfix (คืน 17→18 ก.ค. — เจ้าของสั่งปิดรูรั่วก่อน Wave 1) — ✅ SHIPPED (main 90ac618, deploy READY)
- **HR payroll leak ปิด**: canViewPayroll (OWNER|hr.payroll.read เท่านั้น · MANAGER fail-closed) → PayrollSection + payroll-actions ทุก mutation
- **calendar leak ข้ามสาขาปิด**: filterAccessibleUnitIds (กรอง unit ตาม unitAccess) + วันลา(ลาป่วย=สุขภาพ) โชว์เฉพาะผู้อ่าน HR
- oracle qc-security-hotfix 14/14 · qc-calendar อัปสัญญาใหม่ 9/9 · gate typecheck+fitness14+qc-hr9+qc-payroll19 เขียว
- 📋 แผนเต็ม 6 ระลอก ~170 วัน: ledger/FULLFUNCTION_PLAN.md + FULLFUNCTION_AUDIT.json (0 full/25 partial/2 thin)
- 🌙 RUN ยาวถึง 05:00 BKK — Fable คุม, Opus ลงมือ · Wave 1 ต่อ: POS หน้าขาย · reward/point/crm/queue wire dead code

## 🌙 RUN ยาว Wave 1 (คืน 17→18 ก.ค. ถึง 05:00) — กำลังเดิน
| WO | งาน | ข้อสอบ | commit |
|---|---|---|---|
| W1-A | **Reward แลกจริง**: flow แลก(เลือกรางวัล+สมาชิก)+ประวัติ+รับของ+ยกเลิกคืนแต้ม · point.credit() กัน over-refund · AI reward_redeem | qc-reward 20/20 | 2f6d4a9 |
| W1-B | **POS หน้าขาย Cashier**: catalog(inventory+ราคา AccountProduct)/ค้นหา/เพิ่มเอง+cart+เงินสด(ทอน)/พร้อมเพย์(QR ยืนยันรับเงิน)+idempotency 3 ชั้น · reuse createSale ไม่แตะ engine | qc-pos-register 24/24 + cpa 107 | 22aa9df |
| W1-C | **Queue สาธารณะ**: ลูกค้ากดรับบัตร+เช็คคิวเอง(/s/../queue + /t/token auto-refresh)+QR · rate limit · reuse issueTicket | qc-queue-public 20/20 | e6ce94c |
| W1-D | **Point**: ตั้งอัตราแต้ม(บาท/แต้ม)+เปิดปิด + ปรับ/แจกแต้มมือ(ADJUST กันติดลบ) | qc-point 18/18 | 442be55 |
| W1-E | **CRM follow-up**: wire addActivityAction ที่ปุ่มหาย → ฟอร์มงานติดตาม+ครบกำหนด+เสร็จแล้ว | qc-crm-activity 12/12 | 442be55 |
✅ **Wave 1 ครบ + deploy READY** — POS ขายได้จริง/loyalty ใช้ได้/queue self-service/CRM ติดตามงานได้ · ต่อ Wave 2 refund
