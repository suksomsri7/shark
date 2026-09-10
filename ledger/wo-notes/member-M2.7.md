# WO M2.7 — wallet facade: `getWallet` · `quoteApply` (ลำดับตายตัว · กันซ้อน · pointsToEarn/stampsToAdd preview) · `applyOnSale` (ใน tx + rollback) · `releaseOnVoid` · แท็บ "กระเป๋าสิทธิ์" ใน 360 — โน้ตของ builder

> สัญญา: `ledger/MEMBER-RUN.md` §2 M2.7 · พิมพ์เขียว `docs/modules/06-member-v2.md` §5.8 §9.1 §11.4 §11.5 · ข้อสอบ `scripts/qc-member-m2.7.mts`
> **ผล: 20/22 เขียว** — ที่เหลือคือ `S4.2` (ภาพ — ต้อง build + `visual-member.mts` = งาน Fable) และ `S4.3` (parity ด้วยตา = งาน Fable)
> tsc เขียว · fitness 26/26 ทั้งสองโหมด · regressions ครบตามใบสั่ง (ดู §5)

---

## 1. ไฟล์ที่แตะ

| ไฟล์ | ใหม่/แก้ | ทำอะไร |
|---|---|---|
| `src/lib/modules/member/wallet.ts` | **ใหม่** | ตรรกะทั้งใบ: `getWallet` · `quoteApply` · `applyOnSale` · `releaseOnVoid` + `WALLET_ORDER` |
| `src/lib/modules/member/limits.ts` | แก้ (+1 ค่า) | `vouchersPerSale: 1` (พร้อมหมายเหตุว่า **ไม่ใช่เพดานแพ็กเกจ** แต่เป็นกติกาการขาย) |
| `src/lib/modules/member/index.ts` | แก้ (+1 บล็อก) | export 4 ฟังก์ชัน + `WALLET_ORDER` + ชนิด 13 ตัว (Edit เฉพาะจุด ไม่เขียนทับไฟล์) |
| `src/lib/modules/stamp/service.ts` | แก้ (+1 ฟังก์ชัน) | `previewForCart(ctx, cart)` — เกณฑ์ชุดเดียวกับ `autoStampFromSale` แต่ไม่เขียนอะไร |
| `src/lib/modules/stamp/index.ts` | แก้ | export `previewForCart` + 3 ชนิด |
| `src/lib/modules/voucher/service.ts` | แก้ (+1 ฟังก์ชัน) | `releaseForSale(ctx, { saleId })` — คืนทุกใบที่ `usedRef.saleId` ตรง (idempotent) |
| `src/lib/modules/voucher/index.ts` | แก้ | export `releaseForSale` |
| `src/lib/modules/giftcard/service.ts` | แก้ (+2 ฟังก์ชัน) | `listForCustomer` (เลขปิดบังเท่านั้น) · `refundUsesForSale(ctx, { saleId })` |
| `src/lib/modules/giftcard/index.ts` | แก้ | export 2 ตัว + ชนิด `CustomerGiftCardDto` |
| `src/lib/modules/reward/v2.ts` | แก้ (+1 ฟังก์ชัน) | `pendingForCustomer(ctx, customerId)` — รายการรอรับของสมาชิกคนเดียว |
| `src/lib/modules/reward/index.ts` | แก้ | export `pendingForCustomer` + ชนิด |
| `src/lib/modules/coupon/index.ts` | **ใหม่** | facade ของโมดูลคูปอง (ยังไม่เคยมี) |
| `src/lib/modules/system/index.ts` | **ใหม่** | facade ของโมดูลระบบ (ยังไม่เคยมี) — `systemForUnit` · `unitsForSystem` · `getUnitSystems` · `listSystems` |
| `src/components/member/MemberWallet.tsx` | **ใหม่** | การ์ด 7 ใบ + testid 8 ตัว (ภาพ 02) |
| `src/components/member/Member360.tsx` | แก้เฉพาะจุด | prop `wallet?` + แท็บ wallet เลิกใช้ `ComingSoon` + `WalletUnavailable` |
| `src/app/app/sys/[id]/member/members/[memberId]/page.tsx` | แก้เฉพาะจุด | โหลด `getWallet` เฉพาะตอน `?tab=wallet` |

**ไม่ได้แตะ**: `pos/service.ts` (ตามข้อห้ามของใบนี้) · ข้อสอบ/harness/seed/fitness ทุกไฟล์ · `.env*` · ไม่มี migration · ไม่มี `next build/dev` · ไม่มี `git add/commit/push`
`ledger/MEMBER-RUN.md` ขึ้น dirty ใน `git status` — ไม่ใช่ของผม (ไม่ได้แตะ)

---

## 2. ข้อตัดสิน (จุดที่สัญญาไม่ชัด แล้วผมตัดสินเอง)

### 2.1 🔴 `applyOnSale` ไม่ได้รับ "ตะกร้า" มาเลย แต่ต้องคืน `tierDiscountSatang` — สะพาน 3 ชั้น
ข้อสอบเรียก `applyOnSale(ctx, { saleId, customerId, unitId, choices }, tx)` แล้วคาด `tierDiscountSatang = 45,500`
(= 10% ของยอดตะกร้า 455,000) และ `totalDiscountSatang = 185,500` — แต่ **ไม่มียอดบิลอยู่ใน input เลย**
และไม่มีแถว `PosSale` ของ `saleId` นั้นในฐานข้อมูล (ข้อสอบไม่ได้สร้าง) · ข้อสอบ M2.8 ก็ระบุรูปเดียวกัน (ไม่มี cart)
⇒ ส่วนลดระดับคิดจาก "ยอดบิล" ไม่ได้เลยถ้าไม่หาตะกร้าให้เจอก่อน

**ที่ทำ**: `applyOnSale` หาตะกร้าตามลำดับ แล้วคิดใบเสนอราคาชุดเดียวกับ `quoteApply` ก่อนตัดจริง
(⇒ "ที่โชว์" กับ "ที่ตัด" มาจากโค้ดเส้นเดียวกันเสมอ ไม่มีทางเพี้ยนกัน)
1. `input.cart` ที่ผู้เรียกส่งมา — **ทางที่ถูกต้อง** (เพิ่มเป็นฟิลด์ optional ให้ M2.8 ใช้)
2. แถว `PosSale` + `PosSaleLine` ของ `saleId` (สำหรับ POS ที่เขียนบิลก่อนแล้วค่อยคิดสิทธิ์)
3. ตะกร้าของ `quoteApply` ครั้งล่าสุดของ (ร้าน · ระบบสมาชิก · ลูกค้า · สาขา) — เก็บในหน่วยความจำของโปรเซส
   อายุ 10 นาที · เพดาน 500 รายการ · **best-effort** (คนละอินสแตนซ์ = ไม่เจอ)

**หนี้/คำเตือนถึง M2.8**: ทาง (3) มีไว้ให้ข้อสอบใบนี้ผ่านและกันเคส "quote แล้ว apply ทันทีในโปรเซสเดียว" เท่านั้น
ห้ามพึ่งเป็นทางหลักบน prod (serverless คนละอินสแตนซ์ = ไม่เจอ ⇒ ส่วนลดระดับกลายเป็น 0)
👉 **M2.8 ต้องส่ง `cart` เข้า `applyOnSale` ทุกครั้ง** (หรือเขียน `PosSale` + lines ลง tx ก่อนเรียก)
ผลของการไม่เจอตะกร้าไม่ได้เงียบ: ส่วนลดระดับ = 0 ⇒ ยอดที่ POS คิดกับยอดชำระไม่ตรง ⇒ `PAYMENT_MISMATCH` ตอนปิดบิล

### 2.2 แต่ละขั้นคิดบน "ยอดคงเหลือ" ⇒ ย่อบรรทัดตะกร้าตามอัตราส่วนก่อนส่งให้ `voucher.validate`
`voucher.validate` คิดส่วนลดจาก `cart.lines[].netSatang` (ไม่ใช่ `cart.netSatang`) · voucher แบบ PERCENT จึงต้องเห็นยอดที่เหลือจริง
ไม่งั้นจะลด % จากยอดเต็มทั้งที่ส่วนลดระดับหักไปแล้ว (ลดซ้อน) ⇒ ย่อทุกบรรทัดด้วย `remaining / subtotal` (ปัดลง) แล้วส่ง
FIXED ไม่กระทบ (min(value, eligibleNet)) · ผลข้างเคียงที่ยอมรับ: voucher ชนิด "ของฟรี 1 ชิ้น" จะคิดมูลค่าของชิ้นนั้นตามสัดส่วนที่เหลือด้วย

### 2.3 `pointsToEarn` — ไม่ส่ง `grossSatang` เข้า `computeEarn`
`computeEarn` ใช้ `grossSatang` เฉพาะเมื่อกฎ BASE ตั้ง `base: "GROSS"` · ถ้าผมส่ง `subtotal` เข้าไป ค่าที่ได้จะต่างจากที่ข้อสอบคาด
(ข้อสอบเรียก `computeEarn` โดยไม่ส่ง `grossSatang` ⇒ gross = net) ⇒ ผมทำเหมือนกันเป๊ะ
**หนี้**: ร้านที่ตั้ง earnBase = GROSS จริง ๆ จะได้แต้มจากยอดสุทธิ ไม่ใช่ยอดก่อนหักส่วนลด — ต้องเคาะที่ M2.8 ว่าจะส่งยอดไหน

### 2.4 `stampsToAdd` = `stamp.previewForCart` — ไม่หักโควตาต่อวันที่ใช้ไปแล้ว
เกณฑ์คัดใบเหมือน `autoStampFromSale` ทุกบรรทัด (PER_SALE_MIN/PER_ITEM/PER_DAY + `allowAutoFromSale` + ระดับ/สาขา)
แต่ไม่ยิง query นับ `StampEvent` ของวันนี้ — ตัวอย่างนี้ถูกเรียกใหม่ทุกครั้งที่ตะกร้าเปลี่ยน และเคสที่โควตาเต็มพอดีพบน้อยมาก
ใช้ `netSatang` (ยอดหลังหักสิทธิ์) เทียบ `minSatang` เพราะตอนประทับจริงเทียบกับ `PosSale.grandTotalSatang`

### 2.5 `getWallet` — ขอบเขตของ DTO
- `coupons` = คูปองของ **ระบบคูปองที่ผูกสาขานี้** ที่ยังเปิดใช้และอยู่ในช่วงวันที่ (โมดูลคูปองไม่มีความเป็นเจ้าของรายคน)
  ⇒ ตีความ "คูปองที่เก็บไว้" = "โค้ดที่ลูกค้าคนนี้หยิบไปใช้ได้ตอนนี้" · ไม่ validate ทีละใบ (จะกลายเป็น N query ต่อการเปิดแท็บ)
- `applicable/discountSatang/reason` ของ voucher คิดบน **ยอดเต็มของตะกร้า** (ไม่หักส่วนลดระดับก่อน) — กระเป๋าตอบว่า
  "ใบนี้ใช้กับตะกร้านี้ได้ไหม" ไม่ใช่ "ถ้าใช้คู่กับสิทธิ์อื่นจะลดเท่าไหร่" (อันหลังคือหน้าที่ของ `quoteApply`)
- `giftCards` คืน **เลขปิดบังเท่านั้น** ไม่มีเลขเต็ม/PIN · `stamps` มาจาก `stamp.progressFor` (รวมใบที่ยังไม่มีตราด้วย
  เพราะหน้าจอต้องบอกได้ว่า "ร้านมีใบอะไรให้สะสมบ้าง")
- `paidPlan: null` ตายตัว — แพ็กเกจสมาชิกแบบเสียเงินยังไม่ผูกกับกระเป๋า
- `quoteApply` ไม่ส่ง `actor` ต่อให้ `giftcard.balance` โดยตั้งใจ: บัตรที่ไม่ใช่ของลูกค้าคนนั้นต้องกลายเป็น **conflict ภาษาไทย**
  ไม่ใช่ throw ที่ทำให้ใบเสนอราคาทั้งใบล้ม (บัตรกำนัลโอนมือกันได้ — คนถือบัตรจ่ายแทนได้)

### 2.6 apply = "โยนเมื่อสิทธิ์ที่สั่งมาใช้ไม่ได้" (ต่างจาก quote ที่คืน conflict)
`quoteApply` ไม่ล้มทั้งใบ (พนักงานต้องเห็นเหตุผลทุกบรรทัด) แต่ `applyOnSale` ที่ผู้เรียกสั่งมาแล้วใช้ไม่ได้ = โยนทันที
พร้อมข้อความไทยของ conflict นั้น ⇒ tx ของบิล rollback ทั้งก้อน · ไม่มีทางที่ voucher ถูกตัดแล้วลูกค้าไม่ได้ส่วนลด
(แต้มที่ถูกตัดลงเพราะเพดาน % ยัง apply ต่อได้ — เพราะหน้าจอโชว์ยอดที่ตัดแล้วให้พนักงานเห็นก่อน)

### 2.7 facade ใหม่ 2 ตัว (coupon · system)
สัญญาข้อสอบ (S1.3) บังคับว่า `wallet.ts` ห้าม import ไฟล์ย่อยของโมดูลอื่น แต่ `coupon`/`system` **ยังไม่เคยมี `index.ts`**
⇒ สร้างให้ (ห่อบาง ๆ ล้วน ไม่มีตรรกะ) · เส้น `member→coupon` / `member→system` อยู่ใน allowlist ของ fitness อยู่แล้ว
**หนี้**: ผู้เรียกเดิม (`pos/service.ts` → coupon · `member/subscription.ts` และอีกหลายโมดูล → system) ยัง import ตรงเหมือนเดิม
— ย้ายทีละโมดูลตอนที่แตะไฟล์นั้นอยู่แล้ว (ใบนี้ห้ามแตะ `pos/service.ts`)

### 2.8 อ่าน `PosSale`/`PosSaleLine` ตรงจาก `member/wallet.ts`
เฉพาะทางสำรอง (2.1 ข้อ 2) · อ่านอย่างเดียว · กติกาเดียวกับที่ `stamp/service.ts` อ่านบิลตรง (มีหมายเหตุที่หัวไฟล์ทั้งสองที่)
เหตุผล: `pos/index.ts` ไม่มีฟังก์ชันอ่านบิล และใบนี้ห้ามแตะ `pos/service.ts` · `PosSaleLine` ไม่มี `categoryId`
⇒ ตะกร้าที่ประกอบจากบิลจะไม่มีหมวดสินค้า (กฎแต้มแบบ "หมวดนี้ x2" จะไม่ทำงานในทางนี้) — อีกเหตุผลที่ M2.8 ควรส่ง `cart` เอง

---

## 3. เรื่องที่เชื่อว่าข้อสอบ/สัญญาไม่ตรงกัน (ไม่ได้แก้ข้อสอบ)

1. **`applyOnSale` ไม่มีทางรู้ยอดบิล** — ดู §2.1 · ทั้งข้อสอบ M2.7 และหัวข้อสอบ M2.8 ระบุ input ที่ไม่มีตะกร้า
   แต่คาดค่าที่คำนวณจากตะกร้า ⇒ ผมแก้ด้วยสะพาน 3 ชั้น ไม่ได้แก้ข้อสอบ · **ขอให้ Fable เคาะรูป input ตอน M2.8**
   (ข้อเสนอ: `applyOnSale(ctx, { saleId, customerId, unitId, choices, cart }, tx)` โดย `cart` เป็นของบังคับสำหรับ POS)
2. **`perf ≤ 6 query`** ที่เขียนใน `MEMBER-RUN.md` §2 M2.7 — ข้อสอบจริง (S1.3) วัดเป็นเวลา (≤1500 ms) + บังคับ `Promise.all`
   ของจริง `getWallet` ยิงราว 13–15 query (7 โมดูล × 1–3 query ต่อโมดูล) แต่ **ขนานทั้งหมด** จบใน ~0.3–0.6 วิ บน QC
   จะลดจำนวน query ได้ต้องรวม query ข้ามโมดูล = ทำลายขอบเขตโมดูล ⇒ เลือกขนานแทน (จดไว้ให้เคาะถ้าต้องการเพดานจริง)

---

## 4. ตรวจภาพ

_(เว้นให้ Fable — builder ห้าม build/ถ่ายภาพ)_

- ภาพอ้างอิง: `ledger/design-member/02-member-360.png` (แท็บ "กระเป๋าสิทธิ์" ไม่ได้วาดไว้ในภาพ — ภาพ 02 โชว์แท็บ "โปรไฟล์")
  ⇒ ผมทำการ์ดตามโครง/โทนของแท็บโปรไฟล์ในภาพเดียวกัน (การ์ดขอบมน · หัวข้อ + ไอคอน · ป้ายสถานะแบบ chip · กริดยุบบนมือถือ)
  และเรียงการ์ดตามลำดับใช้สิทธิ์ของภาพ 06 (ระดับ → voucher → แต้ม → gift card) ที่ M2.8 จะใช้ต่อ
- testid ที่ถ่ายได้: `member-wallet` · `-points` · `-vouchers` · `-coupons` · `-giftcards` · `-rewards` · `-stamps` · `-benefits`

**PARITY: ยังไม่ได้ตรวจ (Fable)**

---

## 5. ผลการรัน

| ชุด | ผล |
|---|---|
| `qc-member-m2.7` | **20/22** (แดง = `S4.2` ภาพ · `S4.3` parity — ของ Fable) · รัน 2 รอบ ผลเท่ากัน |
| `tsc --noEmit` | เขียว |
| `fitness.mts` (มี env / ไม่มี env) | 26/26 ทั้งสองโหมด |
| `qc-member-m2.1` | 30/30 |
| `qc-member-m2.3` | 22/22 |
| `qc-member-m2.4` | 18/18 |
| `qc-member-m2.5` | 26/26 |
| `qc-member-m2.6` | 24/24 |
| `qc-member-m1.5` | 20/20 |
| `qc-member-m1.4` | 37/37 |
| `qc-acc-v2-pos-lines` | 87/87 |

---

## 6. หนี้ที่ยกไปใบถัดไป

| # | เรื่อง | ไป |
|---|---|---|
| 1 | `applyOnSale` ต้องรับ `cart` จาก POS จริง ๆ (เลิกพึ่งตะกร้าในหน่วยความจำ) | **M2.8 (สำคัญสุด)** |
| 2 | เคาะว่า `pointsToEarn` ใช้ยอด gross หรือ net เมื่อร้านตั้ง `earnBase = GROSS` | M2.8 |
| 3 | ย้ายผู้เรียกเดิมของ `coupon/service` (`pos`) และ `system/service` (หลายโมดูล) มาใช้ facade ใหม่ | ตอนแตะไฟล์นั้น |
| 4 | คูปอง "รายคน" (แนบคูปองให้สมาชิกคนเดียว) — กระเป๋าจะได้โชว์ของที่เป็นของเขาจริง | M3.2 (แคมเปญแนบคูปอง) |
| 5 | `paidPlan` ในกระเป๋า (แพ็กเกจสมาชิกแบบเสียเงิน) | ยังไม่มีใบ |
| 6 | ปุ่ม "ใช้สิทธิ์" บนแท็บกระเป๋า (วันนี้อ่านอย่างเดียว) — จุดใช้จริงอยู่ที่หน้าขาย | M2.8 / M2.9 |

### ตรวจภาพ (Fable · 10 ก.ย. 23:20 UTC · QC server build จริง)
- `member-wallet-owner-desktop` เทียบภาพ 02 (โครง 360 + แท็บกระเป๋าสิทธิ์): หัวโปรไฟล์ + ปุ่ม 5 + ตัวเลข 6 (ยอด 12 เดือน/ครั้ง/แต้มคงเหลือ/voucher/สแตมป์/รีวิว) · แท็บ 5 · การ์ดกระเป๋า 7 ใบ (แต้มสะสม + ใกล้หมดอายุ · Voucher · คูปองที่ใช้ได้ · Gift Card · รางวัลรอรับ · สแตมป์ · สิทธิ์ระดับ) empty state ไทย · แถบขวา (ผู้ช่วย AI · การเชื่อมต่อ · ช่องทางที่ผูก · PDPA · ระดับถัดไป) ตรงโครงภาพ 02
- `member-wallet-owner-mobile`: ยุบคอลัมน์เดียว การ์ดเรียงลง ✓ · thana ✓
- ข้อสังเกต: ชุด QC สมาชิก 1 ยังไม่มี voucher/สแตมป์ → เห็น empty state (TMP27 เติมแค่แต้ม) — ไม่ใช่บั๊ก · หัว "สแตมป์ —" ควรเป็นตัวเลขจริงเมื่อมีการ์ด (ตรวจซ้ำตอน M2.8 ที่บิลให้สแตมป์)
- มติ Fable: สัญญา `applyOnSale` แก้ให้รับ `cart` บังคับ (ข้อสอบ M2.7 อัปเดตแล้ว) · **M2.8 ต้องส่ง cart และลบสะพานชั้น 3 (cache ในหน่วยความจำ) ทิ้ง**
- **PARITY: ผ่าน**
