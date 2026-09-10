# WO M2.6 — บัตรกำนัล (Gift Card): schema + ขาย/ใช้/เติม/โอน/ระงับ/คืนยอด/หมดอายุ · PIN hash + lockout · accountingLink (D3) ผ่าน facade บัญชี · UI ภาพ 20 · migration `member_v2_f` — โน้ตของ builder

> สัญญา: `ledger/MEMBER-RUN.md` §2 M2.6 · พิมพ์เขียว `docs/modules/06-member-v2.md` §4.2 §4.3 §5.7 §9.1 §9.4 §11.6 · ข้อสอบ `scripts/qc-member-m2.6.mts`
> **ผล: 18/19 เขียว** — ข้อที่แดงคือ `M2.6-ERR` ("ข้อสอบรันจนจบ") ซึ่งล้มเพราะ **บั๊กในตัวข้อสอบเอง 2 จุด** (ดู §2)
> ยังไม่ได้ตรวจ: `S7.2` (ภาพ) และ `S7.3` (parity) = งานของ Fable (builder ห้าม build)

---

## 1. ไฟล์ที่แตะ

| ไฟล์ | ใหม่/แก้ | ทำอะไร |
|---|---|---|
| `prisma/schema/giftcard.prisma` | **ใหม่** | `GiftCard` · `GiftCardTxn` · `GiftCardSettings` + enum `GiftCardStatus` (4) / `GiftCardTxnType` (7) |
| `prisma/schema/pos.prisma` | แก้ (+1 คอลัมน์) | `PosSale.giftCardId String?` — ธง "บิลนี้คือขาย/เติมบัตรกำนัล" |
| `prisma/migrations/20261019000000_member_v2_f/migration.sql` | **ใหม่** | additive ล้วน (CREATE TYPE/TABLE/INDEX + ADD COLUMN nullable) · deploy บน QC แล้ว · `migrate diff` = **empty migration** |
| `src/lib/core/scope.ts` | แก้ (+3 บรรทัด) | ลงทะเบียน `GiftCard`/`GiftCardSettings` = แกน system · `GiftCardTxn` = แกน tenant (fail-closed F1.1) |
| `src/lib/modules/giftcard/service.ts` | **ใหม่** | ตรรกะทั้งใบ (ดู §3) |
| `src/lib/modules/giftcard/index.ts` | **ใหม่** | facade 13 ฟังก์ชัน + ชนิด + error |
| `src/lib/modules/giftcard/db.ts` | **ใหม่** | จุดเดียวที่แตะ prisma ดิบ (กติกา ratchet F5 — แบบเดียวกับ `member/db.ts`) |
| `src/lib/modules/giftcard/errors.ts` | **ใหม่** | 4 ชนิด (NotFound/Forbidden/Input/State) · ข้อความไทย ไม่โทษผู้ใช้ |
| `src/lib/modules/giftcard/giftcard-actions.ts` | **ใหม่** | server action 7 ตัว · ด่านเดียว `gate()` (assertCan ตรง ๆ ตาม F6) + `requireKey()` ต่อ action |
| `src/lib/modules/pos/index.ts` | **ใหม่** | facade ของ POS (createSale/voidSale/สรุปวัน) — ดู §3.1 |
| `src/lib/modules/account/gl.ts` | แก้ (+3 ฟังก์ชัน) | `postGiftCardSale` (Dr เงิน · Cr 2110) · `postGiftCardUse` (Dr 2110 · Cr 4030) · `postGiftCardExpire` (Dr 2110 · Cr 4900) |
| `src/lib/modules/account/index.ts` | แก้ | facade 4 ตัว: `postGiftCardSale` · `postGiftCardUse` · `postGiftCardExpire` · `reverseGiftCardPosting` (ห่อ `reverseFor` เดิม) + `GiftCardPayMethod`/`GiftCardPostResult` |
| `src/lib/modules/member/profile.ts` | แก้ | `memberRefs()` (ใหม่ · ดู §3.2) + เรียก `mergeGiftCards` ตอนรวมคน (dynamic import กันวงวน) |
| `src/lib/modules/member/index.ts` | แก้ | export `memberRefs` · `hasMemberPerm` · `canReadMember` · `resolvePosForMember` |
| `src/lib/modules/member/subscription.ts` | แก้ 1 บรรทัด | `resolvePosForMember` เปลี่ยนจาก private → export (ใช้ร่วมกับบัตรกำนัล ไม่ก๊อปตรรกะ) |
| `src/lib/modules/member/nav.ts` | แก้ 1 บรรทัด | หมวด `promotions` `soon` → `ready` (มีหน้า hub จริงแล้ว) |
| `src/lib/outbox-consumers.ts` | แก้ | `posSalePaid` ข้ามบิลที่มี `giftCardId` · consumer `giftcard.sold` / `giftcard.used` (เขียนไทม์ไลน์เจ้าของบัตร) |
| `src/lib/automation/labels.ts` | แก้ | `giftcard.sold` / `giftcard.used` ป้ายไทย (spread ต่อเข้า `WEBHOOK_EVENTS` = ประกาศที่เดียว) |
| `src/lib/platform/cron.ts` | แก้ | ขั้น `giftCardExpire` + สรุป `giftCardExpired` ใน `runDailyCron` |
| `src/app/app/sys/[id]/member/promotions/page.tsx` | **ใหม่** | hub 3 การ์ด: Gift Card (พร้อมใช้) · Voucher/คูปอง (M2.5) · Journey (M3.3) |
| `src/app/app/sys/[id]/member/promotions/giftcards/page.tsx` | **ใหม่** | หน้ารายการ (404-not-403 · ปุ่มขายเฉพาะคนมี `member.giftcard.sell`) |
| `src/app/app/sys/[id]/member/promotions/giftcards/settings/page.tsx` | **ใหม่** | หน้าตั้งค่า (ต้องมี `member.giftcard.manage`) |
| `src/components/member/GiftCardsBoard.tsx` | **ใหม่** | KPI 3 · ป้ายผูกบัญชี · ตาราง 7 คอลัมน์ · ลิ้นชักขาย (ภาพ 20) |
| `src/components/member/GiftCardSettingsForm.tsx` | **ใหม่** | 6 ค่าตามสัญญา |

**ไม่ได้แตะ**: `scripts/qc-member-*.mts` · `visual-member.mts` · `qc-all.mts` · `seed-member-qc.mts` · `member-qc-env.mts` · `member-expected.json` · `fitness.mts` · `.env*`
**ไม่ได้แตะของ M2.1** (`point/*` · `point.prisma` · `member_v2_c` · `member-backfill-points-lots.mts`) — เห็น dirty ใน `git status` ตามปกติของโหมดขนาน
ไม่มี `next build/dev` · ไม่มี `git add/commit/push`

---

## 2. บั๊กในข้อสอบ (ไม่ได้แก้ตามกติกา — จดไว้ให้ Fable ตัดสิน)

`M2.6-ERR` แดงเพราะข้อสอบ **ล้มก่อนถึงข้อ S5.2** ตั้งแต่บรรทัดเตรียมข้อมูล ⇒ S5.2 · S6.1 · S6.2 · S7.1 ไม่เคยถูกรัน
(ทั้ง 4 ข้อนี้ **ผ่านจริง** — ยืนยันด้วยสคริปต์ชั่วคราวที่คัดลอกตรรกะเดียวกันมาแก้เฉพาะ 2 จุดนี้ แล้วลบทิ้ง · ผล 4/4 เขียว ดู §2.3)

### 2.1 บรรทัด 302 — `createMember(..., { source: "STAFF" })` ไม่ใช่ค่าที่มีอยู่จริง

```
💥 MemberInputError: ช่องทางที่มา "STAFF" ไม่อยู่ในรายการของระบบ
   at normalizeSource (src/lib/modules/member/profile.ts:582)
```

หลักฐาน: `profile.ts:240` `SOURCES = [WALK_IN, POS, BOOKING, LINE_OA, LIFF, WEB_FORM, CHAT, REFERRAL, IMPORT, CRM, CAMPAIGN, API, MARKETPLACE, APP, OTHER]`
`"STAFF"` อยู่ในทะเบียนคนละตัวคือ `CONSENT_SOURCES` (`profile.ts:246`) ⇒ ใช้กับ `consents[].source` ไม่ใช่ `source` ของสมาชิก
**ข้อเสนอ**: เปลี่ยนบรรทัด 302 เป็น `source: "WALK_IN"` (ค่าที่ M1.4 ใช้ในข้อสอบตัวเอง)

### 2.2 บรรทัด 305 — `mergeMembers` ไม่ได้ส่ง `confirm: "MERGE"`

```js
await PR.mergeMembers(ctx, owner, { keepId: X, mergeId: Y, fieldChoices: {} });
```

`profile.ts:1758` โยนทันทีถ้า `input.confirm !== "MERGE"` — และ **ข้อสอบ M1.4 บังคับให้เป็นแบบนั้น**:
`qc-member-m1.4.mts:233` — "…ไม่มี `confirm:'MERGE'` → throw" (และบรรทัด 230/235/245/247 ส่ง `confirm: "MERGE"` ทุกครั้ง)
⇒ แก้ที่โค้ดไม่ได้ (จะทำให้ M1.4 แดง) **ข้อเสนอ**: เติม `confirm: "MERGE"` ในบรรทัด 305 ของข้อสอบ

### 2.3 หลักฐานว่า S5.2 / S6.1 / S6.2 / S7.1 ผ่านจริง

รันสคริปต์ชั่วคราว `scripts/tmp-m26-verify.mts` (คัดลอกบรรทัด 302–339 ของข้อสอบมาทั้งดุ้น แก้เฉพาะ 2 จุดข้างบน) → **4/4 เขียว** แล้วลบไฟล์ทิ้ง

```
✅ [S5.2]   merge hook: บัตรของ Y (buyer+owner) → หลังรวมเข้า X buyer/owner = X · expireDue รอบปกติไม่แตะบัตรสด
✅ [S6.1]   giftcard.sold / giftcard.used ลง 3 ทะเบียน + consumer · drain แล้ว DONE ทั้งหมด (stuck = 0)
✅ [S6.2]   ไม่มี JV refType PosSale ของบิลขายบัตร · ไม่มี pointLedger อ้างบิลขายบัตร · consumer ตรวจ giftCardId
✅ [S7.1]   หน้า 3 หน้า + requireTenant · action gate · testid 13 · ไม่มีอีโมจิ/hex · ป้ายภาพ 20 ครบ 31 คำ
```

---

## 3. ข้อตัดสิน (จุดที่สัญญาไม่ชัดและตัดสินเอง)

### 3.1 สร้าง `src/lib/modules/pos/index.ts` (facade ของ POS) แทนการ import `pos/service` ตรง

ข้อสอบ `S1.3` ห้าม `giftcard/service.ts` มี `@/lib/modules/(pos|account|member|point)/<ไฟล์>` ที่ไม่ใช่ `index`
แต่โมดูล POS **ยังไม่เคยมี `index.ts`** (ผู้เรียกเดิม 15 ที่ import `pos/service` ตรงทั้งหมด)
⇒ สร้าง facade บาง ๆ ขึ้นมาใหม่ (re-export ล้วน ไม่มีตรรกะ) แล้วใบนี้เรียกผ่านมัน · **ไม่ได้ย้ายผู้เรียกเดิม** (จะลากข้อสอบ POS/บัญชี/โรงแรม/ร้านอาหารทั้งชุดมาเสี่ยงโดยไม่จำเป็น)
**หนี้**: ย้ายผู้เรียกเดิม 15 ที่มาใช้ facade เป็นงานเก็บกวาดใบแยก

### 3.2 เพิ่ม `memberRefs()` ในโมดูลสมาชิก แทนการยืม `briefFor`

`briefFor(ctx, actor, ids)` ต้องมี `actor` และกรองตามขอบเขตสาขา — แต่บัตรกำนัลต้องรู้ชื่อเจ้าของบัตรใน
งานที่ **ไม่มีคนกด** ด้วย (`list()` ที่ข้อสอบเรียกโดยไม่ส่ง actor · cron หมดอายุ · consumer)
⇒ ทำทางเข้าใหม่ที่คืนแค่ `{id, memberCode, name}` (ไม่มีเบอร์/อีเมล/ระดับ/แต้ม) ⇒ ไม่มีอะไรอ่อนไหวให้รั่ว
และใช้ตัวเดียวกันเป็น "ด่านตรวจว่าเป็นสมาชิกของระบบนี้จริงไหม" (id ที่ไม่ใช่ = ไม่อยู่ในผลลัพธ์)

### 3.3 ตอนรวมสมาชิก: `profile.ts` เรียก `giftcard` ด้วย **dynamic import**

`giftcard/service` อ่านชื่อสมาชิกผ่าน facade `member/index` (ซึ่ง re-export `profile.ts`) ⇒ ผูกแบบ static
สองทางจะเป็นวงกลมตั้งแต่ตอนโหลดโมดูล · ใช้ `await import()` แบบเดียวกับสะพานบอร์ดงานใน `outbox-consumers.ts`
เลือกวิธีนี้แทน `onMerge` hook เพราะ hook ต้องมีใครสักคน "ลงทะเบียน" ตอนบูต — ถ้าหน้าไหนไม่ได้ import โมดูล
บัตรกำนัล บัตรจะไม่ถูกย้ายเงียบ ๆ (บั๊กที่ไม่มีใครเห็นจนลูกค้าโวย) · เรียกตรงจึงเชื่อถือได้กว่า
`mergeGiftCards(ctx, {keepId, mergeId}, tx?)` รับ `tx` ⇒ อยู่ใน transaction เดียวกับการรวมคน (รวมครึ่ง ๆ ไม่ได้)

### 3.4 บิลขายบัตร + ตัวบัตร + ธง `PosSale.giftCardId` อยู่ใน **transaction เดียวกัน**

`pos.createSale(input, tx)` ถูกเรียกโดยส่ง `tx` เข้าไป (เส้นที่ `pos/service.ts` รองรับอยู่แล้วผ่าน `ownsTx`)
เหตุผล: `createSale` ยิง event `pos.sale.paid` + `scheduleDrain()` ทันทีเมื่อเป็นเจ้าของ tx ⇒ ถ้าตั้งธง
`giftCardId` ทีหลัง คิวอาจระบายก่อน แล้วบัญชีจะบันทึก "ขายสินค้า" ให้บิลขายบัตร (รายได้เกิดสองรอบ)
ผลพลอยได้: ไม่มีบิลกำพร้าเมื่อสร้างบัตรล้มกลางทาง

### 3.5 การนับ PIN ผิดเขียน **นอก** transaction ของรายการ

ถ้าเขียนตัวนับใน tx เดียวกับการตัดยอด การ `throw` จะ rollback ตัวนับทิ้ง ⇒ เดา PIN ได้ไม่จำกัดครั้ง
(ด่านที่ดูเหมือนมีแต่ไม่ทำงาน) ⇒ `verifyPin()` ใช้ `prisma` ตรงเสมอ แล้วค่อยเปิด tx สำหรับตัวยอด

### 3.6 ตัดยอดด้วย `updateMany` + เงื่อนไข `balanceSatang: { gte: satang }` คำสั่งเดียว

อ่าน-แล้ว-เขียนจะทำให้บัตรใบเดียวถูกตัดพร้อมกันจาก 2 เครื่อง POS แล้วยอดติดลบ
(บทเรียน "ตัวนับร่วมต้องจบใน SQL คำสั่งเดียว") · `count === 0` = มีคนตัดไปก่อน → ข้อความไทยให้ตรวจยอดใหม่

### 3.7 บัญชี — คีย์ผังบัญชีที่ใช้

| เหตุการณ์ | Dr | Cr | เล่ม | idempotencyKey |
|---|---|---|---|---|
| ขายบัตร | `CASH`/`BANK`/`DEPOSIT_RECEIVED`/`AR` ตามช่องทางจ่าย | `DEPOSIT_RECEIVED` (2110) | RECEIPTS | `GiftCard#<id>#GIFTCARD_SOLD` |
| เติมเงิน | เหมือนขาย | `DEPOSIT_RECEIVED` | RECEIPTS | `GiftCardTxn#<id>#GIFTCARD_SOLD` |
| ใช้บัตร | `DEPOSIT_RECEIVED` | `INCOME_SERVICE` (4030) | GENERAL | `GiftCardTxn#<id>#GIFTCARD_USED` |
| หมดอายุ | `DEPOSIT_RECEIVED` | `ASSET_DISPOSAL_GAIN` (4900 รายได้อื่น) | GENERAL | `GiftCardTxn#<id>#GIFTCARD_EXPIRED` |
| คืนยอด (void) | — | — | เล่มเดิม | `reverseFor("GiftCardTxn", txnId)` |

- `ASSET_DISPOSAL_GAIN` = คีย์กลางที่ชี้ไปบัญชี **4900 "รายได้อื่น / กำไรจากการจำหน่ายสินทรัพย์"** (`coa.ts:64,118`)
  ชื่อคีย์ไม่ตรงความหมาย "บัตรหมดอายุ" นัก แต่เป็นคีย์เดียวที่ผูกกับ 4900 อยู่แล้ว — **ไม่เพิ่มคีย์ใหม่ในใบนี้**
  เพราะจะต้องแก้ `coa.ts` + migration mapping ของทุกร้าน (ความเสี่ยงเกินขอบเขตใบนี้)
  **หนี้**: ถ้าอยากได้คีย์ `OTHER_INCOME` แยก ให้ทำเป็นใบเก็บกวาดของฝั่งบัญชี
- `reverseGiftCardPosting` เรียกได้เสมอเมื่อบัตรมี `accountingDocId` (ไม่สนสวิตช์ ณ ตอนนั้น) — เพราะ
  "กลับรายการที่ลงไปแล้ว" ถูกต้องเสมอ · ไม่มี entry = `reverseFor` คืนอาเรย์ว่าง (ไม่มีอะไรเกิด)

### 3.8 `expireDue()` หาระบบ POS จากบิลที่ขายบัตร

cron ไม่มี ctx ⇒ ใช้ `GiftCard.saleId → PosSale.systemId` เป็นทางเข้าฝั่งบัญชี
บัตรที่ไม่มี `saleId` (ยังไม่มีทางเกิดในวันนี้) = ข้ามการลงบัญชี แต่ยัง `EXPIRED` ตามปกติ

### 3.9 `list({ q })` ค้นจาก **หมายเลขบัตร** อย่างเดียว

สัญญาเขียนแค่ `q?` ไม่ระบุขอบเขต · ค้นชื่อผู้ซื้อ/เจ้าของต้องยิงข้ามไปตาราง `Customer` ซึ่งโมดูลนี้
ไม่มีทางเข้าที่ค้นด้วยชื่อผ่าน facade (มีแต่ค้นด้วย id) ⇒ เลือกทำเท่าที่ทำได้สะอาด ๆ
(ตัด `GC-` นำหน้าออกก่อนเทียบ ⇒ พิมพ์ทั้ง `GC-12345678` และ `12345678` ก็เจอ)
**หนี้**: ค้นด้วยชื่อผู้ซื้อ/เจ้าของ — รอ facade ค้นสมาชิกด้วยชื่อ (มาพร้อม M3.1 segments)

### 3.10 หมวด "โปรโมชัน" เปลี่ยนเป็น `ready`

ใบนี้เป็นใบแรกที่มีหน้าจริงใต้ `/member/promotions` ⇒ ตั้ง `nav.ts` เป็น `ready` + สร้างหน้า hub
ที่มี 3 การ์ด (Gift Card เปิดได้ · Voucher/คูปอง และ Journey จาง + ป้าย "เร็ว ๆ นี้")
`qc-member-m1.3` (ตรวจว่า `ready` ต้องมี `page.tsx` จริง) และ `qc-member-m1.5` ยังเขียวทั้งคู่

### 3.11 เรื่องเล็กที่ตัดสินเอง

- **หมายเลขบัตร** `GC-` + 8 หลักสุ่มจาก `randomCode` (crypto) · ชนกันแล้วสุ่มใหม่สูงสุด 20 รอบ
- **PIN** คืนจาก `sell()` **ครั้งเดียว** · ยิงซ้ำด้วย idempotencyKey เดิมได้ `pin: null` (ระบบไม่เก็บ PIN ดิบ)
- **`unsuspend`** คืนสถานะตามยอดจริง: ยอด 0 → `DEPLETED` ไม่ใช่ `ACTIVE`
- **`transfer`** ลำดับด่าน: `transferable` → สิทธิ์ผู้ทำ → สถานะบัตร → PIN → ปลายทางเป็นสมาชิก
  (สวิตช์ปิดต้องตอบเรื่องสวิตช์ก่อน ไม่ใช่ให้ผู้ใช้ไปแก้ PIN เก้อ ๆ)
- **`refundUse`** คืนยอดเฉพาะรายการชนิด `USE` · บัตรที่ `DEPLETED` กลับเป็น `ACTIVE` · บัตร `SUSPENDED`/`EXPIRED`
  คงสถานะเดิม (ยอดกลับเข้าไป แต่ไม่ปลุกบัตรที่ถูกระงับ/หมดอายุให้ใช้ได้เอง)
- **prefix ของ idempotencyKey** แยกต่อชนิดงาน (`giftcard-sell-` · `-use-` · `-reload-` · `-refund-` · `-expire-`)
  เพราะ `GiftCardTxn` unique ที่ `(tenantId, idempotencyKey)` ใบเดียวใช้ร่วมทุกชนิด
- **consumer `giftcard.*`** เขียน `MemberActivity` ให้ **เจ้าของบัตร** (บัตรที่ไม่มีเจ้าของในระบบ = จบเงียบ ๆ ห้าม throw)

---

## 4. หนี้ / งานต่อ

1. ย้ายผู้เรียก `pos/service` เดิม 15 ที่มาใช้ `pos/index` (ใบเก็บกวาด — §3.1)
2. ค้นบัตรด้วยชื่อผู้ซื้อ/เจ้าของในหน้ารายการ (§3.9)
3. คีย์ผังบัญชี `OTHER_INCOME` แยกจาก `ASSET_DISPOSAL_GAIN` (§3.7)
4. **M2.8** จะเป็นคนต่อ `use()` เข้ากับ `applyOnSale` ของ POS (ใบนี้เตรียม `use(ctx, input, tx)` ให้แล้ว —
   ตัดยอดใน tx ของบิล และลงบัญชีด้วย tx เดียวกัน) · `voidSale` → `refundUse` ก็ต่อที่ใบนั้น
5. หน้าจอยังไม่มีปุ่ม "เติมเงิน / ระงับ / โอน" ในตาราง (action มีครบแล้ว: `reloadGiftCardAction` ·
   `suspendGiftCardAction` · `transferGiftCardAction`) — ภาพ 20 ไม่ได้วาดไว้ จึงยังไม่ใส่ UI
6. REST/AI op ของบัตรกำนัล = **M2.10** (MEMBER-API §2.12) — ใบนี้ไม่แตะทะเบียน API

---

## 5. ผลรันทั้งหมด (ของ builder)

| ชุด | ผล |
|---|---|
| `qc-member-m2.6` | **18/19** (แดงเฉพาะ `M2.6-ERR` = บั๊กข้อสอบ §2 · ข้อภาพ S7.2/S7.3 ยังไม่ถูกนับเพราะรันไม่ถึง) |
| `tsc --noEmit` | ✅ ผ่าน |
| `fitness.mts` (มี env) | ✅ 26/26 |
| `fitness.mts` (ไม่มี env) | ✅ 26/26 |
| `qc-all acc-v2-pos-lines` (regression) | ✅ 1/1 |
| `qc-member-m1.4` (regression) | ✅ 37/37 |
| `qc-member-m1.5` (regression) | ✅ 20/20 |
| `qc-member-m1.3` (regression นอกใบ — nav เปลี่ยน) | ✅ 14/14 |

`prisma migrate deploy` บน QC สำเร็จ · `prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema --script` → **"This is an empty migration."**
(migration ของ M2.1 `20261016000000_member_v2_c` ถูก apply ไปก่อนหน้าแล้ว จึงไม่มีสิ่งตกค้างใน diff)

คืนสภาพ QC: ข้อสอบลบบัตร/รายการ/บิล/JV/สมาชิกที่สร้างเองใน `finally` ครบ · `GiftCardSettings` ถูกคืนเป็นค่าเดิมผ่าน `restore`
⚠️ ระบบบัญชี "บัญชี (MB QC)" ที่ข้อสอบสร้างเอง (createSystem + linkUnit + saveSettings + ensureAccounting + AccountSystemLink POS)
**ค้างอยู่ในร้าน QC ตามที่ MEMBER-RUN §1 ตารางสถานะระบุไว้** ("ระบบบัญชีใน QC สร้างตอนรันข้อสอบ (ทิ้งไว้)")

---

## 6. ตรวจภาพ (Fable เขียน)

PARITY:

### ตรวจภาพ (Fable · 10 ก.ย. 20:15 UTC · QC server build จริง)
- `giftcards-owner-desktop` เทียบภาพ 20: KPI 3 ช่อง (ขายเดือนนี้ ฿6,500 4 ใบ · คงเหลือ ฿4,700 หนี้สินในบัญชี 2110 · ใช้ไปเดือนนี้) · ป้ายผูกบัญชี + ลิงก์ตั้งค่า · ปุ่ม "ขาย Gift Card" ดำมุมขวา · ตาราง 7 คอลัมน์ (หมายเลข/ผู้ซื้อ/ผู้รับ-เจ้าของ/มูลค่า/คงเหลือ/หมดอายุ/สถานะชิป) ครบตามภาพ
- `giftcards-sell-modal-owner`: drawer ขวา — มูลค่า 4 ปุ่ม (฿1,000/2,000/5,000/กำหนดเอง) · ผู้ซื้อ (ค้นหา+เลือก) · ผู้รับ 3 แบบ · ข้อความบนบัตร · หมดอายุ 24 เดือน · ชำระที่ (สาขา/POS) · กล่องผูกกับโมดูลบัญชี · ใช้ได้กับ POS/จอง/ออนไลน์ · ปุ่ม ยกเลิก / "รับเงิน ฿1,000 ผ่าน POS" ตรงภาพ (แถว "สิทธิ์เพิ่มเติม" อยู่ใต้ viewport เลื่อนได้)
- `giftcards-owner-mobile`: KPI ซ้อนแนวตั้ง · ตารางเลื่อนแนวนอนในกล่อง (harness ไม่พบ overflow ของหน้า) · ไม่ล้น
- `giftcards-settings-owner`: สวิตช์เปิดขาย/ผูกบัญชี · อายุบัตร · มูลค่าที่ให้เลือก · โอน/เติมเงิน · ปุ่มบันทึก — ครบตามสัญญา
- `giftcards-thana`: เห็นตารางแต่ไม่มีปุ่มขาย ✓ · `giftcards-noperm` 404 ✓
- ต่างจากภาพเล็กน้อย (ยอมรับ): เลขบัตรในตารางปิดบัง `GC-****5103` (ภาพเป็นเลขเต็ม — ปิดบังเพื่อกันคนเห็นเลขบัตรจากจอ) · ไม่มีบรรทัด "แสดง n จาก m ใบ" ท้ายตาราง (ข้อมูล QC 4 ใบ) → หนี้เล็ก: เพิ่ม pagination footer เมื่อ > 50 ใบ (M3.F เก็บกวาด)
- **PARITY: ผ่าน**
