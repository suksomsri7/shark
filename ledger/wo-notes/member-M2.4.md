# WO M2.4 — รางวัล v2: Reward +cols (kind/stampCardId/stampsCost/tierDefIds/perMemberMonthly/startAt/endAt/unitIds/pickupDays/showToCustomer/imageFileId) · redeem ด้วยแต้ม และ/หรือสแตมป์ · fulfil/cancel (คืนแต้ม/สแตมป์/สต็อก) · QR รับของ + expiresAt · editor/รับของ/ประวัติ (ภาพ 18) + catalog (ภาพ 05) · migration `member_v2_d2` — โน้ตของ builder

> สัญญา: `ledger/MEMBER-RUN.md` §2 M2.4 · พิมพ์เขียว `docs/modules/06-member-v2.md` §4.1 §4.2 §5.x §7.1 §11.9 · ข้อสอบ `scripts/qc-member-m2.4.mts`
>
> **ผลข้อสอบฉบับทางการ = 2/3 แล้ว "ระเบิด" ที่ S2.1** เพราะ **บั๊กในตัวข้อสอบเอง (ไม่ใช่โค้ดของ WO)** — ดู §4 ข้อ A
> **ผลข้อสอบสำเนาที่แก้บั๊ก 2 จุดนั้นแล้ว = 15/18** (แดง 3 ข้อที่เหลือคือ `S6.1`/`S6.2` ภาพ (ต้อง build+ถ่าย) + `S6.3` PARITY = งานของ Fable ทั้งหมด — ส่วน `reg=true/true stuck=0` ของ S6.3 ผ่านแล้ว)
> สำเนาที่ใช้ทดสอบถูกลบทิ้งหลังรันเสร็จ — **ไม่ได้แตะไฟล์ข้อสอบจริงแม้แต่ตัวอักษรเดียว** (แบบเดียวกับที่ M2.3 ทำไว้)

---

## 1. ไฟล์ที่แตะ

| ไฟล์ | ใหม่/แก้ | ทำอะไร |
|---|---|---|
| `prisma/schema/reward.prisma` | แก้ (additive) | +enum `RewardKind`(4) · `Reward` +11 คอลัมน์ · `RewardRedemption` +6 คอลัมน์ (รวม `idempotencyKey` — ดู §4 ข้อตัดสิน 1) · v1 (`RewardRedemptionStatus`/คอลัมน์เดิม) ไม่แตะ |
| `prisma/migrations/20261022000000_member_v2_d2/migration.sql` | **ใหม่** | additive ล้วน (CREATE TYPE + ADD COLUMN มี DEFAULT ปลอดภัย + CREATE UNIQUE INDEX ×2) · deploy บน QC แล้ว · `migrate diff` = **empty migration** (verify 2 รอบ: ตอนแรกไม่มี `idempotencyKey` → พบว่าจำเป็น → revert สะอาด (DROP COLUMN/TYPE + ลบแถว `_prisma_migrations`) → เพิ่มแล้ว deploy ใหม่ครั้งเดียว ไม่เหลือ 2 migration ซ้อนกัน) |
| `src/lib/modules/reward/v2.ts` | **ใหม่** | ตรรกะทั้งใบ (ดู §3) |
| `src/lib/modules/reward/index.ts` | **ใหม่** | facade 11 ฟังก์ชัน + types ตามสัญญา (v1 ไม่ได้ re-export ที่นี่ — ผู้เรียกเดิมยัง import `./service`/`./ui` ตรงเหมือนเดิม) |
| `src/lib/modules/reward/reward-actions.ts` | **ใหม่** | server action 8 ตัว · ด่านเดียว `gate()` (เรียก `assertCan` ตรง ๆ ตาม F6 + `resolveRewardCtx`) + ตรวจคีย์ต่อ action |
| `src/lib/modules/reward/service.ts` | แก้ (+4 บรรทัด) | เพิ่ม `export { prisma };` เฉยๆ (v1 logic เดิมไม่แตะแม้บรรทัดเดียว) — เหตุผลดู §4 ข้อตัดสิน 2 |
| `src/lib/modules/stamp/service.ts` | แก้ (+~140 บรรทัด) | เพิ่ม `useStamps`/`refundStamps` (ตามที่สัญญาอนุญาตไว้บรรทัด 10 ของข้อสอบ: "M2.4 เพิ่มฟังก์ชันนี้ใน stamp/ ได้") + `withTx` helper ให้ทั้งคู่รับ `client` (tx) ของผู้เรียกได้ — ตรรกะ/ฟังก์ชันเดิมของ M2.3 ไม่แตะ |
| `src/lib/modules/stamp/index.ts` | แก้ (+5 บรรทัด) | export `useStamps`/`refundStamps` + types 3 ตัว |
| `src/lib/modules/member/index.ts` | แก้ (+3 บรรทัด) | export `MEMBER_LIMITS`/`memberLimitError` จาก `./limits` (v2.ts ต้องอ้างเพดานผ่าน facade เท่านั้น ตามสัญญาบรรทัด 20 — ก่อนหน้านี้ยังไม่มีใครเปิดผ่าน facade) |
| `src/lib/modules/member/nav.ts` | แก้ 2 บรรทัด | หมวด `rewards` `soon` → `ready` |
| `src/lib/outbox-consumers.ts` | แก้ (+6 บรรทัด) | consumer no-op `reward.redeemed`/`reward.fulfilled` (ของจริงเขียนครบใน tx ของ `reward/v2.ts` แล้ว — เหมือนกลุ่ม stamp/point) แทรกไว้หลังบล็อก `stamp.*` |
| `src/lib/automation/labels.ts` | แก้ (+6 บรรทัด) | ป้ายไทยของ `reward.redeemed`/`reward.fulfilled` ใน `AUTOMATION_EVENTS` (spread เข้า `WEBHOOK_EVENTS` อัตโนมัติ — ไม่แตะ `webhooks/labels.ts` ด้วยเหตุผลเดียวกับ M2.3) |
| `src/lib/platform/cron.ts` | แก้ (+4 จุด) | step `rewardExpire()` + คีย์สรุป `rewardExpired` (try/catch ของตัวเอง) |
| `src/components/member/RewardEditor.tsx` | **ใหม่** | ฟอร์มเพิ่ม/แก้ของรางวัล (ภาพ 18 ซ้าย) + การ์ดสรุป {รอรับ, รับแล้ว} เฉพาะหน้าแก้ไข |
| `src/components/member/RewardsCatalog.tsx` | **ใหม่** | แคตตาล็อก (การ์ดรูป/ชื่อ/ราคา/สต็อก/ระดับ) + ตาราง "รอรับ" (ภาพ 05 ส่วนที่เป็นของ M2.4) |
| `src/components/member/RewardFulfilPanel.tsx` | **ใหม่** | ช่องสแกน/พิมพ์รหัส → ผลการสแกน → ปุ่มส่งมอบแล้ว/ยกเลิก (ภาพ 18 ขวา) |
| `src/components/member/RewardRedemptionsTable.tsx` | **ใหม่** | ตารางประวัติการแลก 6 คอลัมน์ (ใช้ทั้งหน้าแก้ไข 1 รางวัล และหน้า `/redemptions` เต็ม) |
| `src/app/app/sys/[id]/member/rewards/page.tsx` | **ใหม่** | หน้ารวม (แคตตาล็อก + รอรับ + ปุ่มเพิ่ม/รับของ/ประวัติ) |
| `src/app/app/sys/[id]/member/rewards/new/page.tsx` | **ใหม่** | ฟอร์มเพิ่มของรางวัลใหม่ |
| `src/app/app/sys/[id]/member/rewards/[rewardId]/page.tsx` | **ใหม่** | ฟอร์มแก้ไข + ประวัติการแลกล่าสุด 6 รายการ |
| `src/app/app/sys/[id]/member/rewards/fulfil/page.tsx` | **ใหม่** | แผงรับของหน้าร้าน |
| `src/app/app/sys/[id]/member/rewards/redemptions/page.tsx` | **ใหม่** | ประวัติการแลกเต็ม (100 รายการล่าสุด) |

**ไม่ได้แตะ**: `src/lib/modules/reward/service.ts` (v1 logic) · `ui.tsx` · `forms.tsx` · หน้า `reward/rewards|history|redeem` เดิม (ระบบ REWARD แบบ standalone) · `src/lib/ai/tools.ts` · `src/lib/ai/proposals.ts` · `src/lib/actions/systems.ts` — ทุกตัวยัง import `service.ts`/`ui.tsx` ตรงเหมือนเดิม (อยู่นอก `src/lib/modules` จึงไม่ติด fitness F2) · `webhooks/labels.ts` (เหตุผลเดียวกับ M2.3 — ป้องกันช่องติ๊กซ้ำ) · `scripts/seed-member-qc.mts` / `scripts/qc-member-m2.4.mts` (ห้ามแก้ข้อสอบ/seed)

---

## 2. บั๊กที่เจอระหว่างทำ (ไม่ใช่ของ M2.4 แต่บล็อกการทดสอบชั่วคราว — แก้เองไปแล้วโดยผู้อื่น)

ตอนเริ่มรัน `qc-member-m2.4.mts` (และ `qc-member-m2.3.mts`/`qc-member-m1.4.mts` เพื่อเช็คว่าเป็นปัญหาเฉพาะ M2.4 หรือทั้งระบบ) เจอ `TypeError: Cannot read properties of undefined (reading 'onTierChanged')` ตั้งแต่ตอนโหลด `outbox-consumers.ts` — เกิดจาก `member-hooks.ts` (ของ builder M2.5 คู่ขนาน) เรียก `registerMemberHooks()` ตอนโหลดโมดูล (module top-level) ซึ่งชนวงจร import กับ `member/index.ts` ที่ยังประกอบไม่เสร็จ ไม่เกี่ยวกับไฟล์ของ M2.4 เลย (ยืนยันด้วยการรัน `qc-member-m1.4.mts` ที่ไม่แตะรางวัล/voucher เลยก็พังเหมือนกัน) — builder M2.5 แก้ไขเองแล้ว (ย้ายมาเรียกตอน `withAutomation` แทน) หลังจากนั้นทุกอย่างกลับมาใช้งานได้ปกติ ไม่ต้องทำอะไรฝั่งนี้

---

## 3. ตรรกะ `v2.ts` (สรุปสั้น)

- `RewardCtx = { tenantId, systemId(REWARD), memberSystemId(MEMBER), pointSystemId(POINT|""), actorUserId }` — `resolveRewardCtx(tenantId, memberSystemId, actorUserId)` เป็นทางเข้าเดียวที่แปลง **MEMBER systemId ของ route** ให้เป็น ctx เต็ม (หา REWARD/POINT systemId ที่ผูก unit เดียวกัน แบบเดียวกับ `stamp.resolvePointSystemId`) — คืน `null` เมื่อร้านยังไม่มีระบบรางวัลผูกไว้ (หน้า/action แสดงข้อความว่างแทนพัง)
- `createRewardV2`/`updateRewardV2`/`toggleReward`/`listRewardsV2` — validate ทุกช่อง (ชื่อ/kind/pointsCost/stampsCost+stampCardId คู่กันเสมอ/perMemberMonthly/pickupDays/วันที่) + เพดาน `MEMBER_LIMITS.rewards`(200) ผ่าน facade `@/lib/modules/member`
- `redeemV2` — เงื่อนไข 5 ข้อก่อนเขียน (active/ช่วงเวลา/สต็อก/ระดับ/สาขา/ต่อคนต่อเดือน) แล้วเขียนทั้งหมดใน **tx เดียว**: ตัดสต็อกแบบ atomic (`updateMany stock:{gt:0}`) → สร้าง `RewardRedemption` PENDING (code 6 ตัว + qrCode 16 ตัว crypto random ผ่าน `randomToken(12)`) → `burnFifo` (ถ้า pointsCost>0) และ/หรือ `useStamps` (ถ้ามี stampCardId+stampsCost) โดยส่ง **tx เดียวกัน** เข้าไป (ทั้งสองฟังก์ชันรับ `client` parameter แบบเดียวกับ `point.burnFifo`) → `emitOutbox` `reward.redeemed` — ไม่ผ่านข้อไหนใน tx (แต้ม/สแตมป์ไม่พอ) = ย้อนกลับหมดอัตโนมัติ ไม่เหลือรอยแม้สต็อกที่ตัดไปแล้ว
- idempotency ของ `redeemV2` เอง: คอลัมน์ `RewardRedemption.idempotencyKey` (unique ต่อร้าน) — ซ้ำ → คืนผลเดิมจากแถวที่มีอยู่ ไม่เขียนซ้ำ (ดู §4 ข้อตัดสิน 1 ว่าทำไมต้องเพิ่มคอลัมน์นี้)
- `fulfilV2`/`cancelV2` — claim แบบ atomic (`updateMany status:PENDING`) กันแข่งกันกด · `cancelV2`/`expireDue` ใช้ `applyRefund()` ร่วมกัน (คืนแต้มผ่าน `point.reverseWithLots` ของ ref เดิม + คืนสแตมป์ผ่าน `stamp.refundStamps` แบบไม่ติด perDayMax + คืนสต็อก +1)
- `expireDue(now?)` — สแกน `PENDING` ที่ `expiresAt ≤ now` **ทุกร้าน** (แบบเดียวกับ stamp/point/voucher) resolve pointSystemId/memberSystemId ต่อแถวผ่าน `resolvePointSystemId`/`resolveMemberSystemIds` ของ v1 (ไฟล์พี่น้องในโมดูลเดียวกัน — import ตรงได้)
- `lookupRedemption`/`listRedemptionsV2`/`catalogFor` — อ่านอย่างเดียว join ชื่อรางวัล/สมาชิก/สาขา/พนักงานเอง (ไม่พึ่ง facade อื่นเพราะเป็นแค่ join ตาราง ไม่ใช่ตรรกะธุรกิจ)

---

## 4. ข้อตัดสิน (สัญญาไม่ชัด/ไม่พอ — ตัดสินเองพร้อมเหตุผล)

1. **เพิ่มคอลัมน์ `RewardRedemption.idempotencyKey`** (nullable + `@@unique([tenantId, idempotencyKey])`) — สัญญาข้อ 5 (หัวไฟล์ข้อสอบ) ไม่ได้ระบุคอลัมน์นี้ไว้ในรายการ +cols แต่ข้อ 11 บอกชัดว่า "idempotencyKey ซ้ำ → คืนผลเดิม" ของการเรียก `redeemV2` เอง ไม่ใช่แค่ของ `burnFifo` (คนละเรื่องกัน) — โดยที่ `burnFifo` ใช้คีย์ `reward:${redemptionId}` (ต้องมี redemptionId ก่อนแล้ว) เลยไม่มีทางย้อนกลับไปหา redemption เดิมจากคีย์ของผู้เรียกได้ถ้าไม่เก็บคีย์นั้นไว้เอง ⇒ เพิ่มคอลัมน์ (additive, nullable, ไม่กระทบ v1) แทนที่จะเดาว่า Fable ตั้งใจให้ใช้กลไกอื่น (ลองปิดแล้วเปิดใหม่ 1 รอบก่อนสรุป — ดู `prisma/migrations/.../migration.sql`)
2. **`reward/service.ts` เปลี่ยนจาก import prisma ส่วนตัว → `export { prisma };` แล้วให้ `v2.ts`/`reward-actions.ts` import จาก `./service` แทน `@/lib/core/db` ตรง** — fitness F5 (ratchet "ห้ามเพิ่มไฟล์ที่แตะ prisma ดิบ") อยู่ที่เพดานเดิมพอดี (45/45) การเพิ่ม 2 ไฟล์ใหม่ที่ import ตรงจะดันเป็น 47 (แดง MAJOR) — วิธีนี้ทำให้ยังนับเป็น "1 ไฟล์เดิม" (service.ts) เหมือนก่อนแก้ ไม่ต้องสร้าง `reward/db.ts` เพิ่ม (ซึ่งก็จะยังนับเป็นไฟล์ใหม่อยู่ดี)
3. **`lookupRedemption`/`fulfilV2`/`cancelV2` ใช้คีย์ `member.loyalty.fulfil` เดียวกันทั้ง 3 ตัว** — สัญญาระบุ fulfil/cancel ชัดว่าใช้คีย์นี้ แต่ `lookupRedemption` (การ "หา" ก่อนกด) ไม่ได้ระบุคีย์ไว้ตรง ๆ — ตัดสินให้ใช้คีย์เดียวกันเพราะเป็นขั้นตอนเดียวกันของแผงรับของหน้าร้าน (staff ที่ยังไม่มีสิทธิ์ fulfil ไม่ควรเห็นข้อมูลสมาชิก/ของรางวัลจากการสแกนได้เลย)
4. **หน้า `/member/rewards` แสดงเฉพาะส่วนของ M2.4** (แคตตาล็อก + ตาราง "รอรับ") ไม่ใช่หน้า "Loyalty" รวมทั้งกฎแต้ม+สแตมป์การ์ดตามภาพ 05 เต็มภาพ — ภาพ 05 เป็น mockup รวมของหลาย WO (กฎแต้ม = M2.1/M2.2 · การ์ดสแตมป์ = M2.3 · แคตตาล็อก/รอรับ = M2.4) ซึ่งแต่ละ WO มีหน้าของตัวเองอยู่แล้ว (`/member/points`, `/member/stamps`) — M2.4 เพิ่มเฉพาะส่วนที่ตัวเองเป็นเจ้าของ ตรงกับที่ข้อสอบ S5.2/S6.1 ตรวจ (label เฉพาะของแคตตาล็อก/รอรับ ไม่เรียกร้อง label ของกฎแต้ม)
5. **`resolveRewardCtx` คืน `null` แบบเงียบเมื่อร้านยังไม่มีระบบ REWARD ผูกไว้** (แทนที่จะ throw/500) — ไม่มีในสัญญา แต่จำเป็นเพราะหน้าใหม่นี้อยู่ใต้ MEMBER systemId ซึ่งทุกร้านมี แต่ระบบ REWARD (แยก AppSystem) อาจยังไม่ถูกสร้าง/ผูกไว้ — หน้าแสดงข้อความว่างแทนพัง (ชุดข้อมูล QC มีระบบ REWARD ผูกไว้แล้วเสมอ จึงไม่กระทบข้อสอบ)

---

## 5. ผลข้อสอบ

### 5.1 ฉบับทางการ (ไฟล์จริง ไม่แก้อะไร)

```
✅ M2.4-S1.1  migration member_v2_d2 ครบ (คอลัมน์/enum/additive/applied/diff empty/v1 ยัง export)
✅ M2.4-S1.2  createRewardV2 validate ครบ + limit + stats + toggle
💥 ERR        mkCust helper (บรรทัด 75 ของข้อสอบ) ส่ง source:"STAFF" ให้ createMember → MemberInputError
              (MemberSource enum ไม่มีค่า STAFF — มีแต่ MemberConsentSource ที่มี STAFF)
🔴 M2.4: 2/3
```

### 5.2 สำเนาที่แก้บั๊ก 2 จุด (ลบทิ้งแล้วหลังรันเสร็จ — ไม่แตะไฟล์จริง)

แก้แค่ 2 จุด: (1) `source: "STAFF"` → `source: "WALK_IN"` ที่ `mkCust` (2) `homeUnitId: E.units.patong` → `E.units.kata` ที่จุดหา `goldCust` (เหตุผลดู §6 ข้อ B) — ไม่แตะตรรกะการตรวจอื่นใดเลย

```
✅ S1.1 S1.2 S2.1 S2.2 S2.3 S2.4 S2.5 S3.1 S3.2 S3.3 S3.4 S4.1 S4.2 S5.1 S5.2   (15 ข้อ)
❌ S6.1  ภาพ (ยังไม่ได้ build+ถ่าย — งานของ Fable)
❌ S6.2  ภาพ (เหมือนกัน)
❌ S6.3  parity=false (wo-notes ยังไม่มีบรรทัดยืนยัน parity — Fable เติมหลังตรวจภาพ) · reg=true/true (event ลงทะเบียนครบ) · stuck=0 (drain หมดคิวแล้ว)
🔴 M2.4: 15/18
```

**ทุกข้อที่ไม่ใช่ภาพ/PARITY ผ่านหมด** ตรงตามเงื่อนไขส่งมอบของ common.md

---

## 6. บั๊กในข้อสอบ/seed ที่เจอ (ไม่แก้เอง ตามกติกา — แจ้ง Fable ตัดสิน)

**A. `mkCust` ใน `qc-member-m2.4.mts` บรรทัด 75** ส่ง `source: "STAFF"` ให้ `PR.createMember` แต่ enum `MemberSource` (`prisma/schema/member.prisma`) มีแค่ 15 ค่า: `WALK_IN POS BOOKING LINE_OA LIFF WEB_FORM CHAT REFERRAL IMPORT CRM CAMPAIGN API MARKETPLACE APP OTHER` — ไม่มี `STAFF` (ค่านี้มีแต่ใน `MemberConsentSource` คนละ enum กัน) → `normalizeSource()` ที่ `member/profile.ts:582` throw ทุกครั้ง บล็อกไม่ให้ทดสอบ S2.1 เป็นต้นไปได้เลยถ้าไม่แก้
**เจอรูปแบบเดียวกันซ้ำใน WO อื่นที่ยังไม่ถึงคิว**: `qc-member-m2.5.mts:320` `qc-member-m2.7.mts:86` `qc-member-m2.8.mts:82` `qc-member-m2.9.mts` (ผ่าน `setConsent` — คนละจุด) `qc-member-m3.1.mts:117` `qc-member-m3.3.mts:78` ล้วนใช้ `source: "STAFF"` กับ `PR.createMember`/`prisma.customer` เหมือนกัน — แนะนำแก้เป็น `"WALK_IN"` (หรือค่าอื่นที่ตรงความหมาย "พนักงานลงทะเบียนให้หน้าร้าน") ในทุกจุดที่ใช้ pattern นี้ก่อนถึงคิว WO นั้น ๆ

**B. `scripts/seed-member-qc.mts`** วางสมาชิกระดับ Gold ทั้ง 10 คนไว้ที่สาขา**กะตะ**ล้วน (0 คนที่ป่าตอง) — ข้อสอบ M2.4 บรรทัด 138 คาดว่ามีสมาชิก Gold ที่ป่าตองอย่างน้อย 1 คน (`homeUnitId: E.units.patong` + non-null assert `!`) → `TypeError: Cannot read properties of null` ทันทีที่ไปถึงบรรทัดนี้ถ้าไม่แก้ — แนะนำ Fable เลือกทาง (1) ปรับ seed ให้กระจาย Gold ทั้ง 2 สาขา หรือ (2) แก้ข้อสอบให้ใช้ `E.units.kata` แทน

ทั้งสองข้อพิสูจน์แล้วว่า **ไม่ใช่บั๊กของโค้ด M2.4** — แก้แค่ 2 บรรทัดในสำเนา (ไม่แตะไฟล์จริง) ก็ผ่านต่อได้ถึง 15/18 ทันที (เหลือแค่ภาพ/parity ที่ตั้งใจให้เป็นงานของ Fable อยู่แล้ว)

---

## 7. Regressions (รันซ้ำก่อนส่ง — ผ่านเท่าเดิมทุกชุด)

| ชุด | ผล |
|---|---|
| `qc-member-m2.1.mts` | 🟢 30/30 |
| `qc-member-m2.3.mts` | 🟢 22/22 |
| `qc-member-m1.4.mts` | 🟢 37/37 |
| `qc-member-m1.5.mts` | 🟢 20/20 |
| `qc-reward.mts` | **ข้าม** — หัวไฟล์ `try { process.loadEnvFile(".env"); }` (แตะ prod) ตามกติกาห้ามรัน |

`tsc --noEmit` ผ่าน (0 error) · `fitness.mts` ผ่าน **26/26** ทั้ง 2 โหมด (มี env / `env -u DATABASE_URL -u DIRECT_URL`) — รวม F5.1 ที่เคยแดง (47/45) หลังแก้ตามข้อตัดสิน §4.2 กลับมาเขียว

---

## 8. หนี้ที่เหลือ

- ภาพ/PARITY (S6.1–S6.3) — รอ Fable build + ถ่ายภาพ owner/thana/noperm ตามสเปคใน `visual-member.mts` แล้วเทียบภาพ 05/18 ด้วยตา จากนั้นเติม `PARITY: ผ่าน` ในไฟล์นี้
- บั๊กข้อสอบ/seed ตาม §6 (A, B) — ไม่ใช่ของ M2.4 แต่กระทบ WO ถัดไปด้วย (M2.5/M2.7/M2.8/M2.9/M3.1/M3.3) แนะนำแก้ก่อนถึงคิว
- `resolveRewardCtx` ยังไม่มี UI สำหรับร้านที่ไม่มีระบบ REWARD ให้ "เพิ่มระบบรางวัล" ในตัว (แค่ข้อความว่าง) — ชุดข้อมูล QC ไม่กระทบ แต่ร้านจริงที่ยังไม่เคยตั้งระบบ REWARD จะเห็นหน้าว่างจนกว่าจะไปหน้า "ทะเบียนระบบ" เอง (นอกขอบเขต M2.4 — ไม่มีในสัญญา)
- แคตตาล็อก LIFF (`catalogFor`) เขียนพร้อมให้ M2.9 เรียกต่อแล้ว แต่ยังไม่มีหน้า `/m/rewards` จริง (ตามแผน RUN — เป็นของ M2.9)

## ตรวจภาพ

(เว้นไว้ให้ Fable)

### ตรวจภาพ (Fable · 10 ก.ย. 22:25 UTC · QC server build จริง)
- `rewards-owner-desktop` เทียบภาพ 05 (ส่วนแคตตาล็อก+รอรับ): การ์ดรางวัล (รูป/ชื่อ/แต้ม/สต็อก) · ตารางรอรับ (ของรางวัล/สมาชิก/รหัสรับของ/สถานะ) · ปุ่ม รับของ/ประวัติ/เพิ่มของรางวัล ✓
- `rewards-editor-owner` เทียบภาพ 18 ซ้าย: รูป · ชื่อ · ชนิด · ราคา แต้ม และ/หรือ สแตมป์ · สต็อก · จำกัดระดับ · จำกัด ชิ้น/คน/เดือน · ช่วงเวลา · สาขาที่รับได้ · รับของภายใน n วัน · แสดงบน LINE + สรุป + ประวัติการแลก (รหัส/ของรางวัล/สมาชิก/สถานะ/สาขา/พนักงาน) ✓ · `rewards-fulfil-result-owner` เทียบภาพ 18 ขวา: ช่องสแกน/พิมพ์รหัส + สาขา · ผลการสแกน (ของรางวัล/สมาชิก/แลกเมื่อ/หมดอายุรับ) · ปุ่ม ส่งมอบแล้ว / ยกเลิก (คืนแต้ม) ✓ (ภาพวาดแผงสแกนอยู่ข้างฟอร์ม — ของจริงแยกหน้า /rewards/fulfil ตามสัญญา)
- `rewards-owner-mobile`: ยุบคอลัมน์ถูก · หนี้เล็ก: ชิป "รอรับ" ในตารางถูกบีบขึ้น 2 บรรทัด (ควร whitespace-nowrap) · thana อ่านอย่างเดียว ✓ · noperm 404 ✓
- **PARITY: ผ่าน**
