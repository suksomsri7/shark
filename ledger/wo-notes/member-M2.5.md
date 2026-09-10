# WO M2.5 — voucher (ระบบสมาชิก v2)

> builder: Opus · worktree `/root/projects/shark-member` · ข้อสอบ `scripts/qc-member-m2.5.mts`
> พิมพ์เขียว `docs/modules/06-member-v2.md` §4.2 §4.3 §5.7 §6.2 §7.1 §11.5 §11.6 · ภาพ `ledger/design-member/19-voucher-issue.png`

---

## 1. ไฟล์ที่ส่งมอบ

| ไฟล์ | สถานะ | สิ่งที่ทำ |
|---|---|---|
| `prisma/schema/voucher.prisma` | **ใหม่** | `VoucherTemplate` · `Voucher` · `VoucherIssueBatch` + enum `VoucherKind`(4) `VoucherOrigin`(10) `VoucherStatus`(4) `VoucherBatchStatus`(3) |
| `prisma/migrations/20261023000000_member_v2_e/migration.sql` | **ใหม่** | additive ล้วน (CREATE TYPE/TABLE/INDEX + FK เดียว) · apply บน QC แล้ว · `migrate diff` = empty |
| `src/lib/modules/voucher/db.ts` | **ใหม่** | จุดเดียวที่แตะ prisma ดิบ (F5) |
| `src/lib/modules/voucher/errors.ts` | **ใหม่** | 4 ชนิด (NotFound/Forbidden/Input/State) · ข้อความไทย ไม่โทษผู้ใช้ |
| `src/lib/modules/voucher/service.ts` | **ใหม่** | เทมเพลต CRUD · issue (+approval) · issueApprovedBatch · validate · redeem · release · cancel · expireDue · notifyExpiring · listForCustomer · listVouchers · mergeVouchers |
| `src/lib/modules/voucher/index.ts` | **ใหม่** | facade 15 ฟังก์ชันตามสัญญา + `VOUCHER_SYSTEM_ACTOR` + ค่าคงที่ |
| `src/lib/modules/voucher/voucher-actions.ts` | **ใหม่** | `"use server"` · gate `promo.issue` / `promo.manage` (ไม่ export type — บทเรียน M2.2) |
| `src/lib/member-hooks.ts` | **ใหม่** | composition root · `registerMemberHooks()` idempotent · hook `onTierChanged` → voucher ต้อนรับ |
| `src/lib/modules/approval/index.ts` | **ใหม่** | facade ของสายอนุมัติ (`submitForApproval`) — ดู §3.1 |
| `src/app/app/sys/[id]/member/promotions/vouchers/page.tsx` | **ใหม่** | KPI + ค้นหา + ตาราง + ปุ่มออก |
| `src/app/app/sys/[id]/member/promotions/vouchers/templates/page.tsx` | **ใหม่** | ตารางแบบ + ฟอร์มเพิ่ม |
| `src/components/member/VouchersBoard.tsx` | **ใหม่** | ตาราง + ลิ้นชักออก voucher (ภาพ 19) |
| `src/components/member/VoucherTemplatesBoard.tsx` | **ใหม่** | ตารางแบบ + ฟอร์ม |
| `src/app/app/sys/[id]/member/promotions/page.tsx` | แก้เฉพาะจุด | `promotions-page` testid · แท็บ Voucher เปิดใช้ + แท็บ "คูปอง" (soon M3.2) |
| `src/lib/core/scope.ts` | แก้เฉพาะจุด | ลงทะเบียน 3 model ใหม่ (แกน system) |
| `src/lib/modules/member/limits.ts` | แก้เฉพาะจุด | `voucherIssueApprovalOverSatang` 1,000,000 · `voucherStaffMaxSatang` 50,000 |
| `src/lib/modules/member/profile.ts` | แก้เฉพาะจุด | ตอนรวมคน เรียก `mergeVouchers` (dynamic import แบบเดียวกับ `mergeGiftCards`) |
| `src/lib/modules/member/tiers-actions.ts` | แก้เฉพาะจุด | `gate()` เรียก `registerMemberHooks()` (ตั้งระดับจากหน้าจอไม่ผ่านคิว) |
| `src/lib/modules/stamp/service.ts` | แก้เฉพาะจุด | `completeCycle` rewardKind `VOUCHER` → ออกใบจริง + `progress.rewardVoucherId` + คืน `rewardVoucherId` ให้ `addStamp` |
| `src/lib/outbox-consumers.ts` | แก้เฉพาะจุด | consumer 4 ตัว (`voucher.issued/used/expiring/expired`) + เรียก `registerMemberHooks()` (ดู §3.2) |
| `src/lib/automation/labels.ts` | แก้เฉพาะจุด | `AUTOMATION_EVENTS` +4 (spread ต่อเข้า `WEBHOOK_EVENTS` — **ไม่** ประกาศซ้ำที่ webhooks/labels.ts) |
| `src/lib/approval-effects.ts` | แก้เฉพาะจุด | `member.voucher.issue` → `voucher.issueApprovedBatch(tenantId, batchId, approved)` |
| `src/lib/platform/cron.ts` | แก้เฉพาะจุด | step `voucherExpire` + `voucherExpiring` · summary `voucherExpired`/`voucherExpiring` · `registerMemberHooks()` ต้นรอบ |

**ไม่ได้แก้**: `src/lib/webhooks/labels.ts` (event มาจาก `AUTOMATION_EVENTS` ที่ spread ไว้แล้ว — ประกาศซ้ำ = ช่องติ๊กซ้ำ 2 แถว ตามคอมเมนต์ในไฟล์นั้น) · `src/lib/modules/member/nav.ts` (`promotions` เป็น `ready` อยู่แล้วตั้งแต่ M2.6) · `src/lib/modules/approval/labels.ts` (`member.voucher.issue` มีอยู่แล้ว) · `src/lib/modules/member/index.ts` (M2.4 export `MEMBER_LIMITS` ให้แล้ว) · `src/lib/modules/member/tiers.ts` (มี `onTierChanged` + `benefitsFor().welcomeVoucherTemplateId` ครบแล้ว — hook เสียบได้เลย)

---

## 2. ผลรัน (ของ builder)

| ชุด | ผล |
|---|---|
| `qc-member-m2.5` | **21/22** — แดงเฉพาะ `M2.5-ERR` = **บั๊กข้อสอบ 3 จุด** (§3.5) ซึ่งทำให้ S6.1/S6.2/S7.1/S7.2/S7.3 ไม่ได้รัน |
| S6.1 · S6.2 · S7.1 (รันซ้ำด้วยสคริปต์ชั่วคราวที่แก้เฉพาะ 3 จุดของข้อสอบ) | **3/3 ผ่าน** (สคริปต์ลบทิ้งแล้ว · ไม่ได้แตะข้อสอบจริง) |
| `tsc --noEmit` | ✅ ผ่าน |
| `fitness.mts` (มี env) | ✅ 26/26 |
| `fitness.mts` (ไม่มี env) | ✅ 26/26 |
| `qc-member-m1.9` (regression) | ✅ 26/26 (ดู §3.6 — ต้องซ่อมข้อมูล QC 1 แถวก่อน) |
| `qc-member-m2.3` (regression) | ✅ 22/22 |
| `qc-member-m2.6` (regression) | ✅ 24/24 |
| `qc-member-m1.4` (regression) | ✅ 37/37 |
| `qc-member-m2.2` (regression) | ✅ 15/15 |
| `qc-acc-v2-pos-lines` (regression) | ✅ 87/87 |

`prisma migrate deploy` บน QC สำเร็จ · `prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema --script` → **"This is an empty migration."** (ตรวจผ่านข้อ S1.1 ที่เขียว — migration `member_v2_d2` ของ M2.4 ถูก apply ไปก่อนแล้ว จึงไม่มีของใบอื่นค้างใน diff)

---

## 3. ข้อตัดสิน (จุดที่สัญญาไม่ชัด และตัดสินเอง)

### 3.1 สร้าง `src/lib/modules/approval/index.ts` (นอกขอบเขตไฟล์ที่ระบุในใบ)
ข้อสอบ S7.1 บังคับว่า `voucher/service.ts` ต้องไม่ import โมดูลอื่นนอก facade
(`!/@\/lib\/modules\/(member|approval|...)\/(?!index)[a-z-]+"/`) แต่โมดูล approval **ยังไม่มี `index.ts`**
(ผู้เรียกเดิม เช่น `point/adjust.ts` · `inventory` ใช้ `@/lib/modules/approval/service` ตรง)
⇒ สร้าง facade บาง ๆ ตัวใหม่ (export `submitForApproval` + type) แบบเดียวกับที่ M2.6 สร้าง `pos/index.ts`
เป็นการเพิ่มล้วน ไม่แตะผู้เรียกเดิม (การย้ายผู้เรียกเดิมมาใช้ facade = หนี้ §4)

### 3.2 `registerMemberHooks()` เรียกตอน "ใช้งาน" ไม่ใช่ตอนโหลดไฟล์
เรียกที่ **ท็อปเลเวลของ `outbox-consumers.ts` ไม่ได้** — วัดจริงแล้วพังทันที:
`TypeError: Cannot read properties of undefined (reading 'onTierChanged')`
เพราะไฟล์นี้อยู่ในวงจร import กับโมดูลสมาชิก (`member/*` → `pos/service` → `scheduleDrain` ที่ outbox-consumers)
บางลำดับการ import จึงได้ `member/index` ที่ยังประกอบไม่เสร็จ
⇒ เรียกที่ (1) ต้น `withAutomation` ของทุก handler (2) `drainAll()` (3) ต้น `runDailyCron()` (4) `gate()` ของ `tiers-actions.ts`
ตัวฟังก์ชัน idempotent (boolean guard) จึงเรียกถี่แค่ไหนก็ไม่มีผล
**ไม่ได้เรียกใน `voucher-actions.ts`** (ตามที่ใบเขียนไว้) เพราะ action ของ voucher ไม่มีทางไปแตะ `applyTierChange` — เรียกไปก็ไม่มีอะไรทำงาน

### 3.3 `reason` / `userId` **ไม่อยู่ใน** กุญแจกันออกซ้ำ
`idempotencyKey = <origin>:<sha256(originRef เรียงคีย์)>:<customerId>`
ข้อสอบ S2.1 ออกซ้ำด้วย `originRef` เดิมแต่ `reason` ต่างกัน → ต้องนับเป็น `skipped`
⇒ เหตุผลคือ "คำอธิบายของงาน" ไม่ใช่ "งานคนละงาน" · ทั้งสองค่ายังถูกเก็บใน `originRef` ของแถวไว้ตามรอยได้
**ผลข้างเคียงที่ตั้งใจ**: หน้าจอ (`issueVoucherAction`) ส่ง `originRef: null` เสมอ ⇒ กุญแจสุ่มใหม่ทุกครั้ง
(ถ้าใส่ค่าคงที่เช่น userId พนักงานจะออกใบที่สองให้ลูกค้าคนเดิมไม่ได้เลย และจะ "เงียบ" ไม่ error)

### 3.4 เพดาน/สายอนุมัติ
- มูลค่าที่ใช้เทียบเพดาน = **มูลค่าหน้าใบ**: `FIXED` = value · `PERCENT` = `config.maxDiscountSatang` (ไม่ตั้ง = 0) · `FREE_*` = 0
- **STAFF ออก PERCENT ที่ไม่ตั้งเพดานส่วนลดไม่ได้** (มูลค่าไม่มีขอบ = เลี่ยงเพดาน ฿500/ใบ ได้ทันที) — ข้อสอบไม่ได้ระบุ ตัดสินให้ปิดช่องนี้
- เกินเพดานรวม → สร้าง `VoucherIssueBatch` **ก่อน** แล้วค่อย `submitForApproval` (ต้องมี `entityId` ให้สายอนุมัติ)
  ถ้าร้านไม่มีนโยบาย (`autoApproved`) → เรียก `issueApprovedBatch` ทันที ⇒ **batch ถูกเก็บไว้เป็นหลักฐานเสมอ** ว่าครั้งนั้นเกินเพดาน
  (ทางเดินเดียวกันทั้งกรณีอนุมัติจริงและ autoApproved — โค้ดที่ออกใบมีเส้นเดียว)
- `issueApprovedBatch(tenantId, batchId, approved)` รับ `approved` ด้วย: `false` → batch `REJECTED` (ไม่ออกใบ)
  ทำให้ `approval-effects.ts` มีบรรทัดเดียวจบทั้งสองทาง

### 3.5 บั๊กข้อสอบ 3 จุด (ไม่ได้แก้ — จดไว้ตามกติกา)
`scripts/qc-member-m2.5.mts` §S6.1 รันไม่ผ่านเพราะเรียก service ด้วยค่าที่ระบบปฏิเสธ (ทั้ง 3 จุดเป็น **ชนิดเดียวกับที่ Fable เคยแก้ในข้อสอบ M2.3/M2.6**):

| บรรทัด | ปัจจุบัน | ต้องเป็น | ข้อความจริงที่ได้ |
|---|---|---|---|
| ~~`mkCust` `source: "STAFF"`~~ | ~~`STAFF`~~ | `source: "WALK_IN"` | ✔ **Fable แก้ให้แล้วระหว่างที่ใบนี้ทำงาน** (commit ยังไม่ลง) |
| `PR.mergeMembers(... { keepId, mergeId, fieldChoices: {} })` | ไม่มี `confirm` | `confirm: "MERGE"` | `การรวมสมาชิกย้อนกลับไม่ได้ — พิมพ์ "MERGE" เพื่อยืนยัน` |
| `ST.createCard(... slots: 2 ...)` + `addStamp(... count: 2 ...)` | `2` | `3` (ขั้นต่ำของสแตมป์การ์ด) | `จำนวนช่องต้องอยู่ระหว่าง 3–30 ช่อง` |

หลัง Fable แก้จุดแรกแล้ว ผลรันล่าสุดยังเป็น **21/22** และหยุดที่ `mergeMembers` (จุดที่ 2)

ยืนยันแล้วว่าเมื่อแก้ 3 จุดนี้ **S6.1 · S6.2 · S7.1 เขียวทั้งหมด** (รันด้วยสคริปต์ชั่วคราวที่คัดลอกตรรกะข้อสอบมาทั้งดุ้น แล้วลบทิ้ง)

### 3.6 ข้อสังเกตอีกจุด: `M2.5-S5.2` เคยแดงเพราะหน้าต่างอ่าน outbox ของข้อสอบ (แก้ที่ฝั่งโค้ดแล้ว)
ข้อสอบหา event ด้วย `take: 60` แต่ตัวข้อสอบเองสร้าง voucher อายุ 7 วันไว้ **~100 ใบ** (S2.6/S2.7 ออก 34 ใบ × 3 รอบ)
⇒ `notifyExpiring` แจ้งครบทุกใบตามสัญญา แล้วใบของข้อ S5.2 หลุดออกนอกหน้าต่าง 60 แถว
แก้ที่ฝั่งโค้ด (ไม่แตะข้อสอบ) ให้ `notifyExpiring` ทำแบบเดียวกับ `point/lots.ts#notifyExpiring` ทุกประการ:
เรียง `expiresAt` จากใกล้หมดอายุที่สุดก่อน + emit ทีละใบ (เช็คก่อนว่าแจ้งไปแล้วหรือยัง)
ได้ผลพลอยได้ที่ถูกต้องกว่าเดิมด้วย: `notified` = **จำนวนที่แจ้งใหม่จริง** (รันซ้ำวันเดียวกันคืน 0 ไม่ใช่ตัวเลขเดิม)

### 3.7 ซ่อมข้อมูล QC 1 แถว (regression `qc-member-m1.9` S7.3)
พบตอนรัน regression: สมาชิก index 21 (`cmtvw0g95002g3vkzomy1wbf0`) มี `Customer.tier = GOLD`
แต่ `tierDefId` = ระดับ `member` (`legacyTier = MEMBER`) และ `member-expected.json` ก็ระบุ `tier: "MEMBER"`
- `MemberTierHistory` ของคนนี้มีแถวเดียว = `INITIAL → member` ⇒ **ไม่มีใครเรียก `applyTierChange`** (ซึ่งเขียน 2 คอลัมน์พร้อมกันเสมอ)
- โค้ดของใบนี้ไม่เขียน `Customer.tier` / `tierDefId` เลย (hook อ่านอย่างเดียวผ่าน `benefitsFor`)
- ทางเดินเดียวที่เขียน `tier` โดยไม่แตะ `tierDefId` คือ **v1 `member/service.ts#recordSpend`** (คิดระดับจากยอดสะสมด้วย `MemberTierConfig`) — ซึ่ง M2.8 จะเป็นใบที่ย้ายไป consumer
⇒ ซ่อมแถวนั้นกลับให้ตรงกับ tierDef ของตัวเอง (`GOLD → MEMBER`) แล้ว `qc-member-m1.9` กลับเป็น 26/26
**Fable ควรรับทราบว่านี่เป็นความไม่ตรงกันจริงระหว่าง v1 `recordSpend` กับ tierDef v2** ไม่ใช่ข้อมูล QC เน่าเฉย ๆ (หนี้ §4 ข้อ 6)

### 3.8 อื่น ๆ
- `usageRatePct` (KPI) = ใบที่ถูกใช้ทั้งหมด ÷ ใบที่ออกทั้งหมด (ไม่นับใบที่ร้านยกเลิกเอง) × 100 — สัญญาบอกแค่ชื่อฟิลด์
- `activeValueSatang` = ผลรวม "มูลค่าหน้าใบ" ของใบ ACTIVE (อ่านสูงสุด 5,000 แถว — ดูหนี้ §4 ข้อ 3)
- `listVouchers` ที่มีคำค้น กวาดสูงสุด 1,000 แถวล่าสุดแล้วกรองในหน่วยความจำ (รหัส/ชื่อ/ผู้รับ)
  ชื่อผู้รับมาจาก facade `member.memberRefs` — โมดูลนี้ไม่ query ตารางลูกค้าเอง
- `release` ของใบที่ยังไม่ USED = no-op `{ ok: true, changed: false }` (ไม่ throw — void บิลซ้ำต้องไม่พัง)
- `cancel` รับทั้ง ACTIVE และ EXPIRED (ยกเลิกใบที่หมดอายุแล้วให้เป็นหลักฐานว่าร้านเก็บคืน) · USED → throw
- ใบที่ออกจากงานเบื้องหลัง (hook ขึ้นระดับ · สแตมป์ครบใบ) ใช้ `VOUCHER_SYSTEM_ACTOR` (role OWNER):
  ของที่ระบบ "สัญญาไว้กับลูกค้า" ต้องออกได้เสมอ ไม่ติดเพดานพนักงาน/สายอนุมัติ (เพดานมีไว้คุมคนกดปุ่ม §6.2)
- สแตมป์ครบใบออก voucher **ใน tx เดียวกับตราที่เพิ่งประทับ** ⇒ ไม่มีสภาพ "ครบใบแต่ไม่ได้ของ"
- ช่อง "ใช้กับหมวด" ในลิ้นชักออก voucher โหลดจาก `InvCategory` (→ `config.categoryIds`) ต่อด้วย `BookingService` (→ `config.serviceIds`)
  🔴 **ชุดข้อมูล QC ไม่มี `InvCategory` เลย** จึงเห็นเฉพาะบริการ ("ทริปดำน้ำครึ่งวัน") ไม่ใช่ชิป "คอร์ส" อย่างในภาพ 19

---

## 4. หนี้ / งานที่ส่งต่อ

1. **ย้ายผู้เรียก `@/lib/modules/approval/service` เดิมมาใช้ `approval/index`** (`point/adjust.ts` · `inventory` · หน้า/action ของสายอนุมัติ) — ใบเก็บกวาด แบบเดียวกับหนี้ `pos/index` ของ M2.6
2. **M2.7 wallet / M2.8 POS** เป็นคนต่อ `validate` → `quoteApply` และ `redeem`/`release` เข้ากับ `applyOnSale` / `voidSale` (ใบนี้เตรียม `redeem(ctx, input, tx)` และ `release(ctx, input, tx)` ให้แล้ว)
3. `listVouchers` KPI อ่านใบ ACTIVE สูงสุด 5,000 แถวเพื่อรวมมูลค่า — ร้านที่มีใบเกินนั้นตัวเลข "มูลค่ารวม" จะต่ำกว่าจริง (ควรย้ายไป `groupBy` + คอลัมน์ `faceValueSatang` ตอนทำรายงาน M3.8)
4. UI ยังไม่มีปุ่ม "ยกเลิกใบ" ในตาราง (action `cancelVoucherAction` พร้อมแล้ว) — ภาพ 19 ไม่ได้วาดไว้
5. "กลุ่ม (segment)" ในลิ้นชักปิดไว้ + ป้าย M3.1 (service รับ `customerIds[]` อยู่แล้ว — M3.1 แค่แปลง segment → รายชื่อ)
6. **v1 `recordSpend` เขียน `Customer.tier` โดยไม่แตะ `tierDefId`** ⇒ ระดับ 2 ที่ไม่ตรงกันได้เงียบ ๆ (พบจริงในข้อมูล QC · §3.7) — M2.8 ควรปิดเส้นนี้ตอนย้าย POS ไป consumer
7. REST/AI op ของ voucher = **M2.10** (MEMBER-API §2.10) — ใบนี้ไม่แตะทะเบียน API
8. `notify: true` ยังไม่ส่งข้อความจริง (ส่งต่อไปกับ payload ของ `voucher.issued`) — ตัวส่งจริงคือ M3.6

---

## 5. คืนสภาพ QC

- ข้อสอบลบใบ/เทมเพลต/batch/สมาชิก/การ์ดสแตมป์ที่สร้างเองใน `finally` ครบ (ตรวจแล้ว: `Voucher` ของร้าน QC = 0 แถวหลังรัน)
- นโยบายอนุมัติที่ข้อสอบสร้าง (`member.voucher.issue`) ถูกลบใน `finally`
- สคริปต์ชั่วคราวที่ใช้ยืนยัน S6/S7 ลบทิ้งแล้ว (`scripts/tmp-verify-m2.5.mts` — ไม่มีอยู่ในรีโปแล้ว)
- ซ่อม `Customer.tier` 1 แถวให้ตรงกับ tierDef ของตัวเอง (§3.7)

---

## 6. ตรวจภาพ (Fable เขียน)

PARITY:

### ตรวจภาพ (Fable · 10 ก.ย. 22:25 UTC · QC server build จริง)
- `vouchers-owner-desktop` เทียบภาพ 19: KPI 2 (ใช้ได้ n · มูลค่ารวม / ใช้แล้วเดือนนี้ · อัตราการใช้) · ช่องค้นหา · ตาราง (รหัส/ชื่อ/ผู้รับ/มูลค่า/ต้นทาง/หมดอายุ/สถานะชิป) · ปุ่ม ออก voucher ✓ · ลิงก์ "แบบ voucher ที่ตั้งไว้" (หน้าเทมเพลต) ✓
- `vouchers-issue-modal-owner` เทียบภาพ 19 ขวา: ลิ้นชัก "ออก voucher" — ให้ใคร (รายคน / กลุ่ม segment ปิดไว้รอ M3.1) · แบบ · มูลค่า · เงื่อนไข ขั้นต่ำบิล · ใช้กับหมวด (ชิปบริการ — ชุด QC ไม่มี InvCategory จึงไม่มี "คอร์ส") · ใช้ร่วมกับคูปอง · อายุ · ต้นทาง/เหตุผล · แจ้งทาง LINE · กล่องเพดาน (เขียว = ออกได้ทันที · แดง = ต้องอนุมัติ) · ผู้อนุมัติ + ปุ่ม ✓
- `vouchers-templates-owner`: ตารางแบบ voucher ✓ · `promotions-owner` hub ✓ · mobile ยุบคอลัมน์ ✓ · thana ✓ · noperm 404 ✓
- หนี้เล็ก: ชิปบริการชื่อซ้ำ 2 ใบ (ควรต่อชื่อสาขา — เหมือน M2.3)
- **PARITY: ผ่าน**
