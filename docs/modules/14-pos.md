# โมดูล 14 — POS (ขายหน้าร้าน) · scope = **unit**

> 🔄 REVISED หลัง QC — สอดคล้อง RESOLUTIONS.md D1,D2,D3,D4,D5,D6,D7,D8,D9,D12,D17 (2026-07-11)
> ยึด `_CONVENTIONS.md` + `BLUEPRINT.md` + `BLUEPRINT_BUSINESS_UNITS.md`
> สถานะเอกสาร: SPEC FINAL — พร้อม implement (Phase 1 ตาม roadmap)
> ⚠️ **โมดูลนี้คือ "จุดตัดเงินกลาง" ของทั้งแพลตฟอร์ม** — POS เป็น **ผู้ให้บริการ (provider) ของ contract 2.1** ทุกโมดูลที่รับเงิน (Hotel folio, Restaurant order, Booking, Ticket) ต้องชำระเงินผ่าน `createSale` ของโมดูลนี้เท่านั้น ห้ามมีโมดูลไหนออกใบเสร็จ/ตัดเงิน/ยิงแต้ม/ลงบัญชีเอง

---

## 1. ภาพรวม + ขอบเขต

### 1.1 POS คืออะไรใน SHARK

POS ทำหน้าที่ 2 ชั้นพร้อมกัน:

| ชั้น | คืออะไร | ใครใช้ |
|---|---|---|
| **(ก) Sale service กลาง** | business logic ชั้น `lib/modules/pos/sale-service.ts` — รับคำสั่งขาย → validate → ส่วนลด/คูปอง → VAT → รับชำระหลายวิธี → ออกเลขใบเสร็จ → ยิงแต้ม/ลงบัญชี → คืน `saleId/receiptNo` | โมดูล Hotel / Restaurant / Booking / Ticket เรียกแบบ **in-process function call** + Register UI เรียกผ่าน API |
| **(ข) POS Register UI** | หน้าขายหน้าร้านสำหรับ unit ประเภท `SHOP` (และ unit อื่นที่เปิดใช้ POS) — grid สินค้า, ตะกร้า, ชำระเงิน, พิมพ์ใบเสร็จ, กะ, สต็อก | แคชเชียร์ / เจ้าของร้าน |

```
Hotel folio ──┐
Restaurant ───┤
Booking ──────┼──► posSaleService.createSale()  ──► PosSale 
Ticket ───────┤         │
Register UI ──┘         ├─► coupon.validate/redeem (2.3)
                        ├─► point.quoteBurn/burn (2.2 — ใช้แต้มเป็นส่วนลด ใน tx)
                        ├─► point.earn (2.2, outbox — Point คำนวณแต้มจากยอดเงิน)
                        ├─► account.postSale/postRefund/postVoid (2.4 facade — POS ไม่รู้ account code)
                        ├─► member.recordSpend + activity.log (2.6/2.7, outbox)
                        └─► notify e-receipt (2.5)
```

### 1.2 ทำอะไรใน v1 (MVP ✅)

- ✅ Sale service กลางเต็มรูป: createSale / voidSale / refundSale + เลขใบเสร็จรันต่อ unit + idempotency
- ✅ **PENDING_PAYMENT sale + `PosPaymentIntent`** (D1): ขายออนไลน์แบบรอเงินเข้า (PromptPay QR / โอนแนบสลิป, expireAt) — ยืนยันเงินเข้า v1 = staff/FINANCE กดยืนยันสลิป (idempotent ด้วย paymentRef) → emit `pos.sale.paid` · หมดอายุ → `pos.sale.expired`
- ✅ Split payment ในบิลเดียว: CASH / TRANSFER (แนบสลิป) / PROMPTPAY (dynamic QR + ยืนยันโดยพนักงาน) / DEPOSIT (หักมัดจำ อ้าง refSaleId — D2) / ROOM_CHARGE (ลงบิลห้องพัก — D12)
- ✅ **ใช้แต้มเป็นส่วนลด** (D5 — จุดขายแพลตฟอร์ม): `burnPoints` ใน createSale → `point.quoteBurn` พรีวิว + `point.burn` ใน tx
- ✅ Register UI: grid สินค้า+หมวด, barcode scan, ค้นหา, ตะกร้า, ส่วนลดรายบรรทัด+ท้ายบิล (จำกัดสิทธิ์), ผูกสมาชิก, พักบิล/เรียกคืน, เงินทอน
- ✅ ใบเสร็จ: พิมพ์ 58/80mm (ESC/POS), e-receipt (ลิงก์+อีเมล), ใบกำกับภาษีอย่างย่อ, เก็บข้อมูลใบกำกับภาษีเต็มรูปส่งต่อโมดูล Account
- ✅ สินค้า: SKU/barcode/ราคา/รูป/หมวด/หน่วยนับ/ต้นทุน + variants แบบ simple (1 ชั้น)
- ✅ สต็อก: movement ledger (รับเข้า/ขาย/คืน/ปรับ), ตรวจนับ (stock count), แจ้งเตือน low stock
- ✅ กะ: เปิด-ปิดกะ + float เงินตั้งต้น, cash drawer count, over/short, X/Z report, บังคับปิดกะข้ามวัน
- ✅ หลายเครื่อง: device registration ต่อ unit, ขายพร้อมกันไม่ชนเลขใบเสร็จ (sequence ใน transaction)
- ✅ รายงาน: ยอดขายรายวัน, สินค้าขายดี, ต่อพนักงาน, ต่อวิธีชำระ, กำไรขั้นต้น (cost snapshot)

### 1.3 ไม่ทำใน v1 (🔜 Phase ถัดไป)

- 🔜 บัตรเครดิต/เดบิต ผ่าน gateway (Beam/Omise/Stripe) — v1 มี enum `CARD` รองรับ schema แล้ว แต่ UI ยังไม่เปิด
- 🔜 Gateway webhook auto-confirm PaymentIntent (PromptPay/บัตร) — v1 ยืนยันเงินเข้าด้วยคน (interface รองรับ webhook แล้ว — D1)
- 🔜 payMethod `VOUCHER` — ตัดออกจาก v1 ตาม D4 (voucher v1 = ส่วนลดผ่าน `coupon.redeem` จุดเดียว) — enum คงไว้ใน schema เปิดใช้พร้อมระบบขาย gift voucher
- 🔜 **Offline mode** — v1 **online-only ชัดเจน** (ดูแนวทางที่วางไว้ ข้อ 11.9)
- 🔜 โอนสต็อกระหว่าง unit (`TRANSFER_OUT/TRANSFER_IN` — enum + schema รองรับแล้ว, UI ยังไม่ทำ)
- 🔜 Variants หลายมิติ (matrix สี×ขนาด), หน่วยนับทศนิยม (ชั่งน้ำหนัก), serial/lot number
- 🔜 Manager PIN approve ส่วนลดเกินสิทธิ์หน้าจอ (v1 = block ให้ manager login เอง)
- 🔜 Cash rounding (ปัดเศษสตางค์เงินสด), promotion engine (ซื้อ 1 แถม 1), ราคาหลายระดับ (tier price)
- 🔜 Customer display (จอลูกค้า), เครื่องชั่งต่อตรง, ลิ้นชักเงินสั่งเปิดอัตโนมัติผ่าน print pulse (รองรับผ่าน printerConfig แต่ไม่ block v1)

### 1.4 ตำแหน่งใน BusinessUnit

- POS เป็น unit-scoped เต็มรูป: สินค้า/สต็อก/กะ/เครื่อง/เลขใบเสร็จ **แยกต่อ unit** — ร้านอาหารสาขา 1 กับสาขา 2 มีสต็อกและเลขใบเสร็จของตัวเอง
- unit ประเภท `SHOP` = ใช้ POS เดี่ยวๆ เป็นโมดูลหลัก · unit ประเภท `RESTAURANT`/`HOTEL`/`BOOKING`/`TICKET` = ใช้ Sale service ของ POS เป็นจุดชำระเงิน (Register UI เปิด/ปิดได้ต่อ unit)
- Member/Point/Coupon เป็น tenant-level: ลูกค้าคนเดียวสะสมแต้ม/ใช้คูปองข้ามทุก unit ได้ — POS ส่ง `unitId` ไปกับทุก event เพื่อ tag ที่มา

---

## 2. Persona & User Stories

| Persona | บทบาท | User Stories หลัก |
|---|---|---|
| **เจ้าของร้าน (OWNER)** | เห็นทุก unit | "ผมอยากเห็นยอดขายวันนี้ของทุกสาขาในจอเดียว และเจาะดูว่าสาขาไหนขายอะไรดี" · "อยากรู้ว่ากะเมื่อคืนเงินขาดไหม" · "อยากตั้งราคาสินค้า/VAT เอง" |
| **ผู้จัดการสาขา (MANAGER)** | คุม 1 unit เต็มสิทธิ์ | "ฉันเปิด-ปิดกะ อนุมัติ void/refund และรับของเข้าสต็อกได้" · "ฉันปรับสต็อกหลังตรวจนับได้" · "ฉันให้ส่วนลดพิเศษเกินสิทธิ์แคชเชียร์ได้" |
| **แคชเชียร์ (STAFF — pos.sale)** | หน้าจอขายเท่านั้น | "ฉันสแกนบาร์โค้ด กดหมวด ค้นหาสินค้า ขายให้เร็วที่สุด" · "ลูกค้าจ่ายเงินสด 1,000 ระบบต้องบอกเงินทอนทันที" · "ลูกค้าขอจ่ายครึ่งสด ครึ่งโอน ต้องทำได้ในบิลเดียว" · "ลูกค้าบอกเบอร์โทรสมาชิก ฉันผูกบิลให้ได้แต้ม" · "โต๊ะข้างๆ เรียก ฉันพักบิลนี้ไว้ก่อนแล้วค่อยเรียกคืน" |
| **พนักงานสต็อก (STAFF — pos.stock)** | จัดการสินค้า/สต็อก | "ของเข้าตอนเช้า ฉันบันทึกรับเข้าพร้อมต้นทุน" · "สิ้นเดือนฉันตรวจนับแล้วให้ระบบปรับยอดพร้อมเหตุผล" |
| **ลูกค้า (Customer)** | ปลายทางใบเสร็จ | "ฉันขอใบเสร็จทางอีเมล ไม่เอากระดาษ" · "ฉันแสดง QR สมาชิกให้ร้านสแกนเพื่อรับแต้ม" · "ฉันขอใบกำกับภาษีเต็มรูปในนามบริษัท" |
| **โมดูลอื่น (system)** | ผู้เรียก contract 2.1 | "Hotel ปิด folio ห้อง 204 → เรียก createSale แล้วได้ receiptNo กลับไปแปะใน folio" · "Ticket ขายตั๋วออนไลน์ → createSale แบบไม่มีกะ ไม่มีเครื่อง" |

---

## 3. ฟังก์ชันทั้งหมด (Feature List)

### 3.1 Sale service กลาง (contract 2.1) — หัวใจของโมดูล

| # | ฟีเจอร์ | MVP |
|---|---|---|
| S1 | `createSale()` เต็ม flow: validate → discount → coupon → burn แต้ม → total → VAT → split payment → receiptNo → (outbox) earn/account/member/activity (ดู flow 7.1 — ลำดับตาม `_CONVENTIONS` 2.1) | ✅ |
| S2 | Idempotency: `idempotencyKey` ต่อคำขอ — ยิงซ้ำได้ผลเดิม ไม่เกิดบิลซ้ำ | ✅ |
| S3 | เลขใบเสร็จรันต่อ unit ต่อเดือน (`PosReceiptCounter` + `SELECT ... FOR UPDATE` ใน transaction) หลายเครื่องขายพร้อมกันไม่ชน | ✅ |
| S4 | Split payment หลายวิธีในบิลเดียว (เช่น เงินสด 300 + โอน 200) ผลรวมต้องเท่า grandTotal เป๊ะ | ✅ |
| S5 | `voidSale()` — ยกเลิกทั้งบิล (ก่อนปิดกะ/Z) พร้อม reverse ทุก side effect | ✅ |
| S6 | `refundSale()` — คืนเงินบางส่วน/ทั้งบิล เป็น **เอกสารใหม่** (docType REFUND) อ้างใบเดิม | ✅ |
| S7 | เอกสารเงิน immutable — ไม่มี UPDATE บรรทัดขาย/ยอดเงินหลัง commit, แก้ = void/refund ออกใบใหม่ | ✅ |
| S8 | รองรับ `sourceModule` ต่างชนิด: POS ต้องมีกะเปิด · HOTEL/RESTAURANT/BOOKING/TICKET ไม่บังคับกะ/เครื่อง — แต่ถ้าชำระผ่านเครื่อง/เคาน์เตอร์ที่มีกะ OPEN ให้**ผูก `shiftId` เสมอ** (D17 — เงินสดเข้าลิ้นชักต้องเข้ากะ) | ✅ |
| S9 | VAT 3 โหมดต่อ unit: `INCLUDED` (default ไทย) / `EXCLUDED` / `NONE` (ไม่จด VAT) — อ่านจาก `unit.settings.account.*` ที่เดียว (D9) | ✅ |
| S10 | บันทึก `costSnapshot` ต่อบรรทัด ณ เวลาขาย เพื่อรายงานกำไรขั้นต้น | ✅ |
| S11 | Audit log ทุก action ที่แตะเงิน (create/void/refund/ปรับสต็อก/ปิดกะ) ลง `AuditLog` กลาง | ✅ |
| S12 | `paymentMode: PENDING_PAYMENT` + `PosPaymentIntent` + ยืนยันเงินเข้า manual (สลิป + paymentRef idempotent) + emit `pos.sale.paid` / `pos.sale.expired` (D1) | ✅ |
| S13 | Gateway webhook auto-confirm PaymentIntent (PromptPay/บัตร) — interface รองรับแล้ว | 🔜 |

### 3.2 Register UI (หน้าขาย)

| # | ฟีเจอร์ | MVP |
|---|---|---|
| R1 | Grid สินค้า + แท็บหมวด + รูปสินค้า, เรียงตาม sortOrder/ขายดี | ✅ |
| R2 | Barcode scan (USB keyboard-wedge + กล้องมือถือ) → เพิ่มลงตะกร้าทันที, สแกนซ้ำ = qty+1 | ✅ |
| R3 | ค้นหาชื่อ/SKU (debounce, แสดงราคา+สต็อกคงเหลือ) | ✅ |
| R4 | ตะกร้า: แก้ qty, ลบบรรทัด, note ต่อบรรทัด, เลือก variant (sheet เลือกตอนกดสินค้าที่มี variant) | ✅ |
| R5 | ส่วนลดรายบรรทัด (บาท/%) + ส่วนลดท้ายบิล (บาท/%) — เกิน `maxDiscountBp` ของ role → block พร้อมข้อความ "เกินสิทธิ์ ให้ผู้จัดการทำรายการ" | ✅ |
| R6 | สินค้ากำหนดราคาเอง (open price เช่น "สินค้าเบ็ดเตล็ด") — ต้องมีสิทธิ์ `sale.priceOverride` | ✅ |
| R7 | ผูกสมาชิก: ค้นหาเบอร์โทร / สแกน QR บัตรสมาชิก (จากโมดูล Member) → แสดงชื่อ+tier+แต้มคงเหลือบนตะกร้า | ✅ |
| R8 | ใส่คูปอง: พิมพ์โค้ด/สแกน QR → เรียก `coupon.validate` แสดงส่วนลดทันที (ยัง**ไม่** redeem จนกว่าจ่ายเงินสำเร็จ) | ✅ |
| R9 | พักบิล (hold) พร้อมตั้งชื่อกำกับ + เรียกคืน (recall) จากทุกเครื่องใน unit เดียวกัน, หมดอายุสิ้นวัน | ✅ |
| R10 | จอชำระเงิน: เลือกวิธี, split ได้, เงินสดมีปุ่มลัดแบงก์ (100/500/1000/พอดี) + คำนวณเงินทอนตัวใหญ่ | ✅ |
| R11 | PromptPay dynamic QR (จำนวนเงินฝังใน QR, มาตรฐาน EMVCo จาก PromptPay ID ใน unit settings) → พนักงานเห็นเงินเข้าแล้วกด "ยืนยันรับเงิน" | ✅ |
| R12 | โอนธนาคาร: แสดงเลขบัญชีร้าน + แนบรูปสลิป (อัปโหลด) เก็บใน payment | ✅ |
| R13 | ใช้แต้มเป็นส่วนลดในจอชำระ (D5): แสดงแต้มคงเหลือของสมาชิก → กรอก/เลือกแต้มที่ใช้ → `point.quoteBurn` พรีวิวมูลค่าส่วนลดสด → burn จริงใน tx ตอนปิดบิล | ✅ |
| R13.1 | payMethod `ROOM_CHARGE` "ลงบิลห้องพัก" (D12): แสดงเฉพาะ tenant ที่มี unit type HOTEL สถานะ ACTIVE → เลือกห้อง/folio → เรียก `hotel.chargeToRoom()` | ✅ |
| R13.2 | Voucher เป็นวิธีชำระ (มูลค่าเงิน) — ตัดออกจาก v1 ตาม D4: voucher v1 = กรอกเป็น `couponCode` (validate/redeem/release ปกติ) · payMethod VOUCHER เปิดพร้อมระบบขาย gift voucher | 🔜 |
| R14 | หลังจ่าย: จอสรุป + เงินทอน + ปุ่ม พิมพ์ใบเสร็จ / ส่งอีเมล / แสดง QR e-receipt / ขายต่อทันที (auto-clear 5 วิ) | ✅ |
| R15 | ขอใบกำกับภาษีเต็มรูป: ฟอร์มชื่อ-เลขผู้เสียภาษี-สาขา-ที่อยู่ (จำจากสมาชิกเดิมถ้ามี) → แนบไปกับ sale ส่งต่อ Account | ✅ |
| R16 | ปุ่ม void บิลล่าสุดของตัวเอง (ภายในกะ, ต้องมีสิทธิ์) + ประวัติบิลวันนี้ | ✅ |
| R17 | โหมดเต็มจอ, ทำงานได้บน tablet (เป้าหมายหลัก) + desktop + mobile, ปุ่มใหญ่แตะง่าย, B&W minimal | ✅ |
| R18 | จอลูกค้า (customer display) แยกจอ | 🔜 |

### 3.3 สินค้า + สต็อก

| # | ฟีเจอร์ | MVP |
|---|---|---|
| P1 | CRUD สินค้า: ชื่อ, SKU, barcode, ราคา (Int สตางค์), ต้นทุน, รูป, หมวด, หน่วยนับ, สถานะ | ✅ |
| P2 | หมวดสินค้า (1 ชั้น) + จัดลำดับ | ✅ |
| P3 | Variants simple: 1 สินค้ามีหลายตัวเลือก (เช่น "แดง/L") แต่ละตัวมี SKU/barcode/ราคา/สต็อกของตัวเอง — **ไม่ทำ matrix หลายมิติใน v1** | ✅ |
| P4 | เปิด/ปิด track stock ต่อสินค้า (บริการ/สินค้านับไม่ได้ = ไม่ track) | ✅ |
| P5 | Stock movement ledger append-only: RECEIVE / SALE / RETURN / ADJUST / COUNT (+ TRANSFER_OUT/IN 🔜) — ยอดคงเหลือ = cache ที่ derive จาก ledger | ✅ |
| P6 | รับของเข้า (receive) พร้อมต้นทุนต่อหน่วย → อัปเดต `cost` ล่าสุดของสินค้า | ✅ |
| P7 | ปรับสต็อก (adjust) ต้องใส่เหตุผล (ของเสีย/หาย/อื่นๆ) + audit log | ✅ |
| P8 | ตรวจนับ (stock count): สร้างรอบนับ → กรอกยอดนับจริง (สแกน/พิมพ์) → ระบบ diff → ยืนยัน = สร้าง movement COUNT ปรับให้ตรง | ✅ |
| P9 | Low stock: ตั้ง threshold ต่อสินค้า → badge บนหน้า list + การ์ดแจ้งเตือนบน unit dashboard + notify เจ้าของ (สรุปวันละครั้ง) | ✅ |
| P10 | นำเข้า/ส่งออกสินค้า CSV | ✅ |
| P11 | นโยบายสต็อกติดลบต่อ unit: `ALLOW_NEGATIVE` (default — ขายได้ แจ้งเตือน) / `BLOCK` (ห้ามขายเกินสต็อก) | ✅ |
| P12 | โอนสต็อกระหว่าง unit ใน tenant เดียวกัน | 🔜 |
| P13 | Serial/lot, วันหมดอายุ, เครื่องชั่ง | 🔜 |

### 3.4 กะ / รอบขาย (Shift)

| # | ฟีเจอร์ | MVP |
|---|---|---|
| F1 | เปิดกะ: กรอก float เงินตั้งต้นในลิ้นชัก + ผูกเครื่อง (device) ที่เปิด | ✅ |
| F2 | 1 unit เปิดได้หลายกะพร้อมกัน (ต่อเครื่อง) — sale ผูก `shiftId` ของเครื่องที่ขาย | ✅ |
| F3 | X report (ระหว่างกะ ดูได้ตลอด ไม่ปิดยอด): ยอดขาย, จำนวนบิล, แยกวิธีชำระ, void, เงินสดที่ควรมีในลิ้นชัก | ✅ |
| F4 | ปิดกะ: นับเงินจริงในลิ้นชัก (ฟอร์มแจกแจงแบงก์/เหรียญ optional) → ระบบคำนวณ over/short → บันทึก + เหตุผลถ้าเกิน threshold | ✅ |
| F5 | Z report ตอนปิดกะ: snapshot immutable (JSON) + เลข Z รันต่อ unit — พิมพ์/ดูย้อนหลังได้ ตัวเลขไม่เปลี่ยนแม้ข้อมูลอื่นเปลี่ยน | ✅ |
| F6 | บังคับปิดกะข้ามวัน: กะเปิดค้าง > 24 ชม. → cron force-close (status `FORCE_CLOSED`, expectedCash จากระบบ, countedCash = null) + notify เจ้าของ · เครื่องนั้นเปิดกะใหม่ไม่ได้จนกว่ากะค้างถูกจัดการ | ✅ |
| F7 | ประวัติกะ + ดู Z report ย้อนหลัง + สรุป over/short รายเดือน | ✅ |
| F8 | Blind close (ไม่โชว์ expected ก่อนนับ — กันพนักงานนับให้ตรงเอง) เปิด/ปิดได้ใน settings | ✅ |

### 3.5 เครื่อง/Terminal

| # | ฟีเจอร์ | MVP |
|---|---|---|
| D1 | ลงทะเบียนเครื่องต่อ unit: ตั้งชื่อ ("เคาน์เตอร์ 1") → ได้ `deviceCode` → เครื่องจำใน localStorage + ส่ง header ทุก request | ✅ |
| D2 | Revoke เครื่อง (เครื่องหาย/เลิกใช้) — request จากเครื่องที่ถูก revoke ถูกปฏิเสธ | ✅ |
| D3 | ตั้งค่าเครื่องพิมพ์ต่อเครื่อง: ขนาดกระดาษ 58/80mm, วิธีเชื่อม (browser print / WebUSB ESC-POS / print agent 🔜), พิมพ์อัตโนมัติหลังขาย on/off | ✅ |
| D4 | lastSeenAt heartbeat — หน้า devices เห็นว่าเครื่องไหน online | ✅ |
| D5 | จำกัดจำนวนเครื่องต่อ unit ตาม plan (`Tenant.limits.posDevices` default 3) | ✅ |

### 3.6 ใบเสร็จ / เอกสาร

| # | ฟีเจอร์ | MVP |
|---|---|---|
| T1 | ใบเสร็จ 58/80mm: หัวบิล (โลโก้ B&W, ชื่อร้าน/unit, ที่อยู่, เลขผู้เสียภาษี), รายการ, ส่วนลด, VAT, วิธีชำระ+เงินทอน, แต้มที่ได้/คงเหลือ, footer ข้อความตั้งได้, QR e-receipt | ✅ |
| T2 | ร้านจด VAT: พิมพ์คำว่า "ใบกำกับภาษีอย่างย่อ" + เลขประจำเครื่อง POS ตามข้อกำหนดสรรพากร | ✅ |
| T3 | พิมพ์ผ่าน browser (CSS @media print, ความกว้างตามกระดาษ) — ทางเลือก default ที่ไม่ต้องลงอะไรเพิ่ม | ✅ |
| T4 | พิมพ์ ESC/POS ตรงผ่าน WebUSB/WebBluetooth (Chrome/Edge บน desktop+Android) | ✅ |
| T5 | Print agent ตัวเล็กสำหรับ iOS/เครื่องพิมพ์ LAN | 🔜 |
| T6 | e-receipt: หน้า public `/r/[token]` (token สุ่ม ไม่เดาได้) + ส่งอีเมลผ่าน notify (2.5) | ✅ |
| T7 | ใบกำกับภาษีเต็มรูป: POS เก็บข้อมูลผู้ซื้อ snapshot ไว้ที่ sale → ยิง posting + ส่งคำขอให้โมดูล Account ออกเอกสารเต็มรูป (เลขเอกสารฝั่ง Account) | ✅ |
| T8 | Reprint ใบเสร็จ (ประทับ "สำเนา") — audit log | ✅ |

### 3.7 Offline-tolerant

- 🔜 **v1 = online-only เท่านั้น** — เน็ตหลุด: Register ขึ้น banner "ออฟไลน์ — รอเชื่อมต่อ" ตะกร้าที่ค้างอยู่ไม่หาย (state อยู่ในเครื่อง) แต่**กดชำระเงินไม่ได้**
- แนวทางที่วางไว้สำหรับ Phase ถัดไป (ออกแบบ schema รองรับแล้ว — ดู 11.9): local queue (IndexedDB) เก็บ sale ที่ค้าง → sync ขึ้นด้วย `idempotencyKey` เดิม → เลขใบเสร็จชั่วคราว `OFF-{deviceCode}-{n}` แล้ว reconcile เป็นเลขจริงตอน sync

---

## 4. Data Model (Prisma)

> เงินทุก field = `Int` หน่วย**สตางค์** · เวลา UTC · ทุก model มี `tenantId + unitId` (unit-scoped) · ไม่มี hard delete เอกสารธุรกรรม

```prisma
// ───────────────────────── ENUMS ─────────────────────────

enum PosSourceModule {
  POS         // ขายหน้าร้านผ่าน Register UI
  HOTEL
  RESTAURANT
  BOOKING
  TICKET
}

enum PosSaleDocType {
  SALE
  REFUND      // เอกสารคืนเงิน อ้าง refSaleId เสมอ
}

enum PosSaleStatus {
  PENDING_PAYMENT      // D1: รอเงินเข้า (มี PosPaymentIntent) — ยังไม่ออกเลขใบเสร็จ/ไม่ยิง side effect ใดๆ
  COMPLETED            // เงินเข้าครบ (= "PAID" ใน RESOLUTIONS D1)
  EXPIRED              // D1: PENDING_PAYMENT หมดอายุไม่จ่าย → emit pos.sale.expired
  VOIDED               // ยกเลิกทั้งใบ (ก่อนปิดกะ)
  PARTIALLY_REFUNDED   // มีใบ REFUND อ้างถึงบางส่วน
  REFUNDED             // คืนครบทั้งใบ
}

enum PosPayMethodType {
  CASH
  TRANSFER
  PROMPTPAY
  CARD        // 🔜 schema รองรับ, UI ยังไม่เปิด
  VOUCHER     // 🔜 D4: v1 voucher = ส่วนลดผ่าน coupon.redeem จุดเดียว — enum คงไว้ เปิดใช้พร้อมระบบขาย gift voucher
  DEPOSIT     // D2: หักมัดจำจากบิลมัดจำเดิม (refSaleId) — เป็นวิธีชำระ ไม่กระทบฐาน VAT, ไม่ earn แต้มซ้ำ
  ROOM_CHARGE // D12: ลงบิลห้องพัก → hotel.chargeToRoom() — บิลนี้ไม่ยิง point/account (เกิดตอน settle ที่โรงแรม)
}

enum PosStockMoveType {
  RECEIVE       // รับของเข้า
  SALE          // ตัดจากการขาย (qty ติดลบ)
  RETURN        // คืนเข้าจาก void/refund
  ADJUST        // ปรับด้วยมือ (ของเสีย/หาย)
  COUNT         // ปรับจากรอบตรวจนับ
  TRANSFER_OUT  // 🔜 โอนออกไป unit อื่น
  TRANSFER_IN   // 🔜 รับโอนจาก unit อื่น
}

enum PosShiftStatus {
  OPEN
  CLOSED
  FORCE_CLOSED  // ระบบบังคับปิด (ค้างข้ามวัน)
}

enum PosDeviceStatus {
  ACTIVE
  REVOKED
}

enum PosStockCountStatus {
  DRAFT       // กำลังนับ
  CONFIRMED   // ยืนยันแล้ว สร้าง movement แล้ว
  CANCELLED
}

enum PosHeldCartStatus {
  HELD
  RECALLED
  DISCARDED
}

enum PosCatalogStatus {
  ACTIVE
  ARCHIVED
}

// ───────────────────────── CATALOG ─────────────────────────

model PosCategory {
  id        String           @id @default(cuid())
  tenantId  String
  unitId    String
  name      String
  sortOrder Int              @default(0)
  status    PosCatalogStatus @default(ACTIVE)
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt

  products  PosProduct[]

  @@unique([unitId, name])
  @@index([tenantId])
  @@index([unitId, status, sortOrder])
}

model PosProduct {
  id                String           @id @default(cuid())
  tenantId          String
  unitId            String
  categoryId        String?
  category          PosCategory?     @relation(fields: [categoryId], references: [id])
  name              String
  sku               String?          // รหัสภายในร้าน
  barcode           String?          // EAN/UPC/โค้ดร้านเอง
  imageUrl          String?
  uom               String           @default("ชิ้น") // หน่วยนับ แสดงผลอย่างเดียว
  price             Int              // สตางค์
  cost              Int?             // สตางค์ ต้นทุนล่าสุด (อัปเดตตอน RECEIVE)
  allowOpenPrice    Boolean          @default(false)  // กำหนดราคาตอนขาย
  trackStock        Boolean          @default(false)
  stockQty          Int              @default(0)      // cache — source of truth = PosStockMovement
  lowStockThreshold Int?
  hasVariants       Boolean          @default(false)
  sortOrder         Int              @default(0)
  status            PosCatalogStatus @default(ACTIVE)
  archivedAt        DateTime?
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  variants   PosProductVariant[]
  movements  PosStockMovement[]

  @@unique([unitId, sku])
  @@unique([unitId, barcode])
  @@index([tenantId])
  @@index([unitId, status, categoryId])
  @@index([unitId, name])
}

model PosProductVariant {
  id        String           @id @default(cuid())
  tenantId  String
  unitId    String
  productId String
  product   PosProduct       @relation(fields: [productId], references: [id])
  name      String           // "แดง / L" — v1 ชั้นเดียว
  sku       String?
  barcode   String?
  price     Int?             // null = ใช้ราคาสินค้าหลัก
  cost      Int?
  stockQty  Int              @default(0)
  sortOrder Int              @default(0)
  status    PosCatalogStatus @default(ACTIVE)
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt

  movements PosStockMovement[]

  @@unique([productId, name])
  @@unique([unitId, sku])
  @@unique([unitId, barcode])
  @@index([tenantId])
  @@index([unitId, productId])
}

// ───────────────────────── STOCK ─────────────────────────

model PosStockMovement {
  id          String             @id @default(cuid())
  tenantId    String
  unitId      String
  productId   String
  product     PosProduct         @relation(fields: [productId], references: [id])
  variantId   String?
  variant     PosProductVariant? @relation(fields: [variantId], references: [id])
  type        PosStockMoveType
  qty         Int                // + เข้า / − ออก
  balanceAfter Int               // ยอดคงเหลือหลัง movement (ต่อ product/variant)
  costPerUnit Int?               // สตางค์ — บันทึกตอน RECEIVE
  refType     String?            // "PosSale" | "PosStockCount" | ... (D8: refType = ชื่อ Prisma model ตรงตัว)
  refId       String?
  note        String?
  byUserId    String
  createdAt   DateTime           @default(now())
  // append-only: ไม่มี update/delete

  @@index([tenantId])
  @@index([unitId, productId, createdAt])
  @@index([unitId, variantId, createdAt])
  @@index([unitId, type, createdAt])
  @@index([refType, refId])
}

model PosStockCount {
  id          String              @id @default(cuid())
  tenantId    String
  unitId      String
  status      PosStockCountStatus @default(DRAFT)
  note        String?
  startedBy   String              // userId
  confirmedBy String?
  confirmedAt DateTime?
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  lines PosStockCountLine[]

  @@index([tenantId])
  @@index([unitId, status, createdAt])
}

model PosStockCountLine {
  id          String        @id @default(cuid())
  tenantId    String
  unitId      String
  countId     String
  count       PosStockCount @relation(fields: [countId], references: [id])
  productId   String
  variantId   String?
  systemQty   Int           // ยอดระบบ ณ ตอนกรอก (snapshot)
  countedQty  Int           // ยอดนับจริง
  diff        Int           // countedQty - systemQty
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@unique([countId, productId, variantId])
  @@index([tenantId])
  @@index([countId])
}

// ───────────────────────── SALE (เอกสารเงิน — immutable) ─────────────────────────

model PosSale {
  id                String          @id @default(cuid())
  tenantId          String
  unitId            String
  docType           PosSaleDocType  @default(SALE)
  receiptNo         String?         // "R2607-000123" / REFUND: "CN2607-000004" — null ระหว่าง PENDING_PAYMENT (ออกเลขตอนยืนยันเงินเข้า — D1)
  refSaleId         String?         // REFUND → ใบขายเดิม
  refSale           PosSale?        @relation("SaleRefunds", fields: [refSaleId], references: [id])
  refunds           PosSale[]       @relation("SaleRefunds")
  sourceModule      PosSourceModule @default(POS)
  sourceId          String?         // folioId / orderId / bookingId / ticketOrderId
  memberId          String?         // tenant-level CustomerProfile (contract 2.6)
  memberSnapshot    Json?           // freeze ชื่อ/เบอร์ ณ เวลาออกใบเสร็จ
  shiftId           String?
  shift             PosShift?       @relation(fields: [shiftId], references: [id])
  deviceId          String?
  device            PosDevice?      @relation(fields: [deviceId], references: [id])
  staffUserId       String          // ผู้ทำรายการ (หรือ system user สำหรับขายออนไลน์)
  status            PosSaleStatus   @default(COMPLETED)

  // ── ยอดเงิน (สตางค์ทั้งหมด · REFUND เก็บเป็นค่าบวก ตีความจาก docType) ──
  subtotal          Int             // Σ(qty × unitPrice) ก่อนส่วนลดทุกชนิด
  lineDiscountTotal Int             @default(0)
  billDiscount      Int             @default(0)
  couponCode        String?
  couponDiscount    Int             @default(0)
  pointBurned       Int             @default(0)  // D5: แต้มที่ใช้เป็นส่วนลดในบิลนี้ (point.burn ใน tx)
  pointDiscount     Int             @default(0)  // D5: มูลค่าส่วนลดจากแต้ม (สตางค์) — หักหลังคูปอง ก่อน VAT
  vatMode           String          // "INCLUDED" | "EXCLUDED" | "NONE" (snapshot จาก unit.settings.account.* — D9)
  vatRateBp         Int             @default(0)  // basis point: 700 = 7%
  vatAmount         Int             @default(0)
  grandTotal        Int             // ยอดที่ลูกค้าจ่ายจริง
  pointEarned       Int?            // D5: ผลจาก point.earn (post-commit outbox) — null = ยังไม่ sync/ไม่มีสมาชิก
  abbInvoiceNo      String?         // D3: เลขใบกำกับอย่างย่อที่ account.postSale คืนมา — แปะบนใบเสร็จ
  paidAt            DateTime?       // D1: เวลายืนยันเงินเข้า (PENDING_PAYMENT → COMPLETED)

  taxInvoice        Json?           // {name, taxId, branch, address} ขอใบกำกับเต็มรูป
  note              String?
  idempotencyKey    String?
  voidedAt          DateTime?
  voidedBy          String?
  voidReason        String?
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
  // immutable: field เงิน/lines/payments ห้าม update หลัง commit
  // update ได้เฉพาะ: status, voidedAt/By/Reason, pointEarned (ผล async), abbInvoiceNo (ผล postSale), paidAt/receiptNo (ตอนยืนยันเงินเข้า)

  lines         PosSaleLine[]
  payments      PosPayment[]
  receipt       PosReceiptToken?
  paymentIntent PosPaymentIntent?

  @@unique([unitId, receiptNo])
  @@unique([unitId, idempotencyKey])
  @@index([tenantId, createdAt])
  @@index([unitId, createdAt])
  @@index([unitId, status, createdAt])
  @@index([unitId, shiftId])
  @@index([unitId, staffUserId, createdAt])
  @@index([unitId, sourceModule, sourceId])
  @@index([memberId])
}

model PosSaleLine {
  id           String   @id @default(cuid())
  tenantId     String
  unitId       String
  saleId       String
  sale         PosSale  @relation(fields: [saleId], references: [id])
  productId    String?  // null = บรรทัด free-form จากโมดูลอื่น (เช่น "ค่าห้อง 2 คืน")
  variantId    String?
  name         String   // snapshot ชื่อ ณ เวลาขาย
  qty          Int
  unitPrice    Int      // สตางค์ (snapshot — รวม open price/variant แล้ว)
  discount     Int      @default(0) // ส่วนลดรวมของบรรทัด (สตางค์)
  lineTotal    Int      // qty*unitPrice - discount
  costSnapshot Int?     // ต้นทุน/หน่วย ณ เวลาขาย → gross margin
  note         String?
  refLineId    String?  // REFUND → บรรทัดใบเดิมที่คืน
  createdAt    DateTime @default(now())

  @@index([tenantId])
  @@index([saleId])
  @@index([unitId, productId])
}

model PosPayment {
  id           String           @id @default(cuid())
  tenantId     String
  unitId       String
  saleId       String
  sale         PosSale          @relation(fields: [saleId], references: [id])
  type         PosPayMethodType
  amount       Int              // ส่วนที่ตัดเข้าบิลนี้ (สตางค์)
  cashReceived Int?             // CASH: เงินที่รับมาจริง
  changeAmount Int?             // CASH: เงินทอน = cashReceived - amount
  ref          String?          // เลขอ้างอิงโอน / QR ref
  refSaleId    String?          // DEPOSIT: บิลมัดจำเดิมที่หักด้วยวิธีชำระนี้ (D2)
  slipUrl      String?          // TRANSFER: รูปสลิป
  meta         Json?            // PROMPTPAY: {qrPayload, confirmedBy} ฯลฯ
  createdAt    DateTime         @default(now())

  @@index([tenantId])
  @@index([saleId])
  @@index([unitId, type, createdAt])
}

model PosReceiptToken {
  id        String   @id @default(cuid())
  tenantId  String
  unitId    String
  saleId    String   @unique
  sale      PosSale  @relation(fields: [saleId], references: [id])
  token     String   @unique @default(cuid()) // public e-receipt /r/[token]
  createdAt DateTime @default(now())

  @@index([tenantId])
}

model PosReceiptCounter {
  id       String         @id @default(cuid())
  tenantId String
  unitId   String
  docType  PosSaleDocType
  period   String         // "2607" = YYMM (รีเซ็ตรายเดือน)
  lastNo   Int            @default(0)

  @@unique([unitId, docType, period])
  @@index([tenantId])
}

// ───────────────────────── PAYMENT INTENT (D1 — PENDING_PAYMENT) ─────────────────────────

enum PosPaymentIntentStatus {
  PENDING
  CONFIRMED   // เงินเข้าแล้ว → sale COMPLETED + side effects ทั้งหมด
  EXPIRED     // เกิน expireAt → sale EXPIRED + emit pos.sale.expired
  CANCELLED   // ต้นทางยกเลิกก่อนจ่าย
}

model PosPaymentIntent {
  id          String                 @id @default(cuid())
  tenantId    String
  unitId      String
  saleId      String                 @unique
  sale        PosSale                @relation(fields: [saleId], references: [id])
  method      PosPayMethodType       // PROMPTPAY (QR) | TRANSFER (แนบสลิป) — CARD 🔜
  amount      Int                    // สตางค์ = grandTotal ของ sale
  qrPayload   String?                // PROMPTPAY: EMVCo payload
  slipUrl     String?                // TRANSFER: สลิปที่ลูกค้าแนบ
  paymentRef  String?                // อ้างอิงการยืนยันเงินเข้า (สลิป/รายการโอน/webhook 🔜) — idempotent (D1)
  status      PosPaymentIntentStatus @default(PENDING)
  expireAt    DateTime               // เกินแล้วไม่จ่าย → cron expire + pos.sale.expired
  confirmedBy String?                // userId ผู้ยืนยัน (v1 manual staff/FINANCE — webhook 🔜 = null)
  confirmedAt DateTime?
  createdAt   DateTime               @default(now())
  updatedAt   DateTime               @updatedAt

  @@unique([unitId, paymentRef])
  @@index([tenantId])
  @@index([unitId, status, expireAt])
}

// ───────────────────────── SHIFT / DEVICE ─────────────────────────

model PosShift {
  id            String         @id @default(cuid())
  tenantId      String
  unitId        String
  deviceId      String?
  device        PosDevice?     @relation(fields: [deviceId], references: [id])
  status        PosShiftStatus @default(OPEN)
  openedBy      String         // userId
  openedAt      DateTime       @default(now())
  floatAmount   Int            // เงินตั้งต้นลิ้นชัก (สตางค์)
  closedBy      String?
  closedAt      DateTime?
  expectedCash  Int?           // float + เงินสดรับ − เงินทอน − เงินสดคืน (คำนวณตอนปิด)
  countedCash   Int?           // เงินนับจริง
  overShort     Int?           // countedCash - expectedCash
  countDetail   Json?          // แจกแจงแบงก์/เหรียญ {b1000: 3, b500: 2, ...}
  closeNote     String?
  zNumber       Int?           // ลำดับ Z ต่อ unit (ออกตอนปิด)
  zReport       Json?          // snapshot immutable ของยอดทั้งกะ
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  sales PosSale[]

  @@unique([unitId, zNumber])
  @@index([tenantId])
  @@index([unitId, status])
  @@index([unitId, openedAt])
  @@index([deviceId, status])
}

model PosDevice {
  id             String          @id @default(cuid())
  tenantId       String
  unitId         String
  name           String          // "เคาน์เตอร์ 1"
  deviceCode     String          // สุ่มตอนลงทะเบียน — client เก็บ localStorage
  status         PosDeviceStatus @default(ACTIVE)
  registeredBy   String          // userId
  lastSeenAt     DateTime?
  printerConfig  Json?           // {paper: "58"|"80", mode: "browser"|"escpos", autoPrint: bool, drawerKick: bool}
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  shifts PosShift[]
  sales  PosSale[]

  @@unique([unitId, deviceCode])
  @@index([tenantId])
  @@index([unitId, status])
}

// ───────────────────────── HELD CART (พักบิล) ─────────────────────────

model PosHeldCart {
  id         String            @id @default(cuid())
  tenantId   String
  unitId     String
  label      String?           // "พี่แว่น เสื้อ 2 ตัว"
  cart       Json              // snapshot {lines, memberId, discounts, couponCode}
  heldBy     String            // userId
  deviceId   String?
  status     PosHeldCartStatus @default(HELD)
  expiresAt  DateTime          // สิ้นวัน (เที่ยงคืน unit-tz) → cron discard
  createdAt  DateTime          @default(now())
  updatedAt  DateTime          @updatedAt

  @@index([tenantId])
  @@index([unitId, status, createdAt])
}
```

### 4.1 POS settings (เก็บใน `BusinessUnit.settings.pos` — ไม่มีตารางแยก)

> ⚠️ D9: **ไม่มี `settings.pos.vat` อีกต่อไป** — VAT/ภาษีอ่านจาก `unit.settings.account.*` (vatRegistered, priceIncludesVat, vatRate, taxId, branchCode, หัวใบกำกับ — สเปค 12 §4.8) เป็น source of truth เดียว · POS แปลงเป็นโหมดคำนวณ: `!vatRegistered → NONE` · `priceIncludesVat → INCLUDED` · ไม่งั้น `EXCLUDED`

```jsonc
{
  "pos": {
    "receipt": {
      "prefix": "R", "refundPrefix": "CN",
      "header": "ร้านป้าแมว สาขาหัวหิน", "footer": "ขอบคุณที่อุดหนุนค่ะ",
      "posRegNo": "POS001", // เลขเครื่อง POS ที่จดกับสรรพากร (เลขผู้เสียภาษี/หัวใบกำกับอ่านจาก unit.settings.account.* — D9)
      "showPoints": true
    },
    "payment": {
      "promptpayId": "0891234567",           // เบอร์/เลขผู้เสียภาษีสำหรับ gen QR
      "bankAccounts": [{ "bank": "KBANK", "no": "012-3-45678-9", "name": "..." }]
    },
    "stock": { "oversellPolicy": "ALLOW_NEGATIVE" },   // | "BLOCK"
    "shift": { "blindClose": false, "overShortAlertSatang": 10000 }, // เกิน 100 บาทต้องใส่เหตุผล
    "discount": { "requireReasonOverBp": 2000 }        // ลดเกิน 20% ต้องใส่เหตุผล
  }
}
```

---

## 5. API Endpoints

> unit-scoped ทั้งหมด: prefix `/api/u/[unitId]/pos/...` — middleware ตรวจ `unitId ∈ tenant` + `can(user, {tenantId, unitId, module: "POS", action})` ก่อนเข้า handler
> Register UI ส่ง header `X-Pos-Device: {deviceCode}` ทุก request ที่เกี่ยวการขาย/กะ

### 5.1 Sale (จุดตัดเงินกลาง)

| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| POST | `/sales` | createSale — payload ตาม contract 7.1 + `idempotencyKey` (บังคับ) | `pos.sale.create` |
| GET | `/sales` | ค้นบิล: `?date=&status=&staffId=&method=&memberId=&q={receiptNo}` (paginate) | `pos.sale.read` |
| GET | `/sales/:id` | รายละเอียดบิล + lines + payments + refunds | `pos.sale.read` |
| POST | `/sales/:id/void` | ยกเลิกทั้งใบ `{reason}` — เฉพาะบิลในกะที่ยังไม่ปิด | `pos.sale.void` |
| POST | `/sales/:id/refund` | คืนเงิน `{lines: [{lineId, qty}], payMethods: [...], reason}` → เอกสาร REFUND ใหม่ | `pos.sale.refund` |
| GET | `/sales/:id/receipt` | payload ใบเสร็จ (โครงสร้าง render พิมพ์/ESC-POS/e-receipt) `?copy=true` = สำเนา | `pos.sale.read` |
| POST | `/sales/:id/send-receipt` | ส่ง e-receipt `{email}` ผ่าน notify (2.5) | `pos.sale.create` |
| POST | `/promptpay/qr` | gen dynamic QR `{amount}` → `{qrPayload}` (EMVCo string ให้ client render) | `pos.sale.create` |
| POST | `/sales/:id/confirm-payment` | D1: ยืนยันเงินเข้าของ sale PENDING_PAYMENT `{paymentRef, slipUrl?}` — **idempotent ด้วย paymentRef** → sale COMPLETED + side effects + emit `pos.sale.paid` | `pos.sale.confirmPayment` |
| POST | `/sales/:id/cancel-pending` | ยกเลิก sale PENDING_PAYMENT ก่อนเงินเข้า `{reason}` (ต้นทางปล่อย hold ฝั่งตัวเอง) | `pos.sale.confirmPayment` |

**Service layer (in-process — โมดูลอื่นเรียกอันนี้ ไม่เรียก HTTP):**

```ts
// lib/modules/pos/sale-service.ts — provider ของ contract 2.1
posSaleService.createSale(input: CreateSaleInput): Promise<CreateSaleResult>
posSaleService.confirmSalePaid({ tenantId, unitId, saleId, paymentRef, byUserId? }): Promise<CreateSaleResult>  // D1 — idempotent ด้วย paymentRef (webhook 🔜 เรียกจุดเดียวกัน)
posSaleService.voidSale({ tenantId, unitId, saleId, byUserId, reason }): Promise<void>
posSaleService.refundSale(input: RefundSaleInput): Promise<CreateSaleResult>
posSaleService.getSaleBySource({ tenantId, unitId, sourceModule, sourceId }): Promise<PosSale[]>
// cron: expirePendingSales() — intent PENDING เกิน expireAt → sale EXPIRED + emit pos.sale.expired (D1)
```

### 5.2 Catalog

| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| GET | `/products` | list `?categoryId=&status=&q=&lowStock=true` (paginate) | `pos.product.read` |
| POST | `/products` | สร้างสินค้า (+variants ใน payload เดียวได้) | `pos.product.manage` |
| GET | `/products/:id` | รายละเอียด + variants + ยอดสต็อก | `pos.product.read` |
| PATCH | `/products/:id` | แก้ไข (ห้ามแก้ stockQty ตรง — ต้องผ่าน movement) | `pos.product.manage` |
| DELETE | `/products/:id` | archive (soft) — ห้ามลบถ้ามีบิลอ้างถึง ก็ archive ได้เพราะบิล snapshot ชื่อไว้แล้ว | `pos.product.manage` |
| GET | `/products/lookup` | fast path สแกน: `?barcode=` → product/variant เดียว (ตอบใน <100ms) | `pos.sale.create` |
| POST | `/products/import` | CSV import (dry-run + commit) | `pos.product.manage` |
| GET/POST/PATCH/DELETE | `/categories`, `/categories/:id` | CRUD หมวด + จัดลำดับ | `pos.product.manage` |
| POST/PATCH/DELETE | `/products/:id/variants`, `.../variants/:vid` | CRUD variant | `pos.product.manage` |

### 5.3 Stock

| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| POST | `/stock/receive` | รับเข้า `{lines: [{productId, variantId?, qty, costPerUnit?}], note}` | `pos.stock.receive` |
| POST | `/stock/adjust` | ปรับ `{productId, variantId?, qty(+/-), reason}` — reason บังคับ | `pos.stock.adjust` |
| GET | `/stock/movements` | ledger `?productId=&type=&from=&to=` (paginate) | `pos.stock.read` |
| GET | `/stock/low` | สินค้าต่ำกว่า threshold | `pos.stock.read` |
| POST | `/stock/counts` | เปิดรอบตรวจนับ `{scope: "ALL"|"CATEGORY", categoryId?}` → สร้าง lines พร้อม systemQty snapshot | `pos.stock.count` |
| GET | `/stock/counts` · GET `/stock/counts/:id` | list/รายละเอียดรอบนับ | `pos.stock.read` |
| PATCH | `/stock/counts/:id/lines` | กรอกยอดนับ (batch upsert `[{lineId, countedQty}]`) | `pos.stock.count` |
| POST | `/stock/counts/:id/confirm` | ยืนยัน → สร้าง movement COUNT ทุกบรรทัดที่ diff ≠ 0 (transaction เดียว) | `pos.stock.count` |
| POST | `/stock/counts/:id/cancel` | ยกเลิกรอบนับ | `pos.stock.count` |

### 5.4 Shift

| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| POST | `/shifts/open` | เปิดกะ `{floatAmount}` (+device จาก header) — fail ถ้าเครื่องนี้มีกะ OPEN ค้าง | `pos.shift.open` |
| GET | `/shifts/current` | กะ OPEN ของเครื่องนี้ (Register โหลดตอนเข้า) | `pos.sale.create` |
| GET | `/shifts/:id/x-report` | สรุประหว่างกะ (คำนวณสด ไม่ freeze) | `pos.shift.open` |
| POST | `/shifts/:id/close` | ปิดกะ `{countedCash, countDetail?, closeNote?}` → คำนวณ over/short + freeze Z report | `pos.shift.close` |
| GET | `/shifts` | ประวัติกะ `?status=&from=&to=` | `pos.shift.read` |
| GET | `/shifts/:id/z-report` | Z report (snapshot จาก DB — ไม่คำนวณใหม่) | `pos.shift.read` |

### 5.5 Device / Held cart

| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| POST | `/devices` | ลงทะเบียนเครื่อง `{name}` → `{deviceCode}` | `pos.device.manage` |
| GET | `/devices` · PATCH `/devices/:id` | list/แก้ชื่อ+printerConfig | `pos.device.manage` |
| POST | `/devices/:id/revoke` | ตัดสิทธิ์เครื่อง | `pos.device.manage` |
| POST | `/devices/heartbeat` | อัปเดต lastSeenAt (Register ping ทุก 60 วิ) | `pos.sale.create` |
| GET/POST | `/held-carts` | list (HELD ของ unit) / พักบิล `{label?, cart}` | `pos.sale.create` |
| POST | `/held-carts/:id/recall` | เรียกคืน (atomic: HELD→RECALLED กันสองเครื่องแย่งใบเดียว) | `pos.sale.create` |
| DELETE | `/held-carts/:id` | ทิ้งบิลพัก | `pos.sale.create` |

### 5.6 Reports

| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| GET | `/reports/daily` | `?from=&to=` ยอดขาย/บิล/เฉลี่ย/void/refund รายวัน | `pos.report.read` |
| GET | `/reports/products` | สินค้าขายดี `?from=&to=&limit=` (qty + ยอดเงิน + margin) | `pos.report.read` |
| GET | `/reports/staff` | ยอดต่อพนักงาน `?from=&to=` | `pos.report.read` |
| GET | `/reports/payments` | แยกวิธีชำระ `?from=&to=` | `pos.report.read` |
| GET | `/reports/margin` | กำไรขั้นต้น `?from=&to=` (Σ lineTotal − Σ costSnapshot×qty เฉพาะบรรทัดที่มี cost) | `pos.report.read` |

### 5.7 Public (storefront-level — ไม่ต้อง auth)

| Method | Path | ทำอะไร |
|---|---|---|
| GET | `/r/[token]` | หน้า e-receipt public (HTML — มือถือเปิดจาก QR ท้ายใบเสร็จ) |

---

## 6. UI Screens

> ทุกหน้า: i18n TH/EN · B&W minimal · responsive · empty/loading/error state ครบ
> path ใต้ `/app/u/[unitSlug]/pos/...`

| # | หน้า | path | สาระสำคัญ + mobile behavior |
|---|---|---|---|
| 1 | **Register (หน้าขาย)** | `/pos/sale` | จอหลัก 2 คอลัมน์ (desktop/tablet-landscape): ซ้าย = grid สินค้า + แท็บหมวดแนวนอน + ช่องค้นหา/สแกน (autofocus รับ barcode wedge) · ขวา = ตะกร้า (บรรทัด: ชื่อ/qty stepper/ราคา/ลด), แถบสมาชิก (ผูก/ถอด), สรุปยอด, ปุ่มใหญ่ "ชำระเงิน ฿xxx" · ปุ่มรอง: พักบิล, บิลที่พัก (badge จำนวน), ประวัติวันนี้ · **mobile**: single column — grid เต็มจอ, ตะกร้าเป็น bottom bar (จำนวนชิ้น+ยอด) แตะขยายเป็น sheet · ไม่มีกะเปิด → block ด้วย modal "เปิดกะก่อนเริ่มขาย" |
| 2 | **จอชำระเงิน** | modal/sheet ใน `/pos/sale` | แสดง grandTotal ใหญ่ · **จุดใช้แต้ม (D5)**: แถว "ใช้แต้มเป็นส่วนลด" แสดงแต้มคงเหลือของสมาชิก → กรอกแต้ม → `point.quoteBurn` พรีวิวมูลค่าลดสด → ยอดบิลอัปเดต · ปุ่มวิธีชำระ: เงินสด/โอน/PromptPay (+ "ลงบิลห้องพัก" ROOM_CHARGE เฉพาะ tenant ที่มี HOTEL unit ACTIVE — D12 · Voucher 🔜 ตาม D4) · split: ใส่จำนวนเงินบางส่วน → เหลือค้างโชว์ → เลือกวิธีถัดไป · เงินสด: numpad + ปุ่มลัด 100/500/1000/พอดี → **เงินทอนตัวเลขใหญ่สุดในจอ** · PromptPay: แสดง QR + จำนวนเงิน + ปุ่ม "รับเงินแล้ว" (ต้อง confirm ซ้ำ) · โอน: เลขบัญชี + ปุ่มแนบสลิป (กล้อง/ไฟล์) |
| 3 | **จอสำเร็จ** | modal ต่อจากชำระ | เงินทอน (ถ้ามี) + แต้มที่ได้ + ปุ่ม: พิมพ์ / ส่งอีเมล / QR e-receipt / ใบกำกับเต็มรูป (ฟอร์ม tax info) / ขายต่อ (auto-close 5 วิ) |
| 4 | **บิลที่พัก** | sheet ใน `/pos/sale` | list การ์ด (label, ยอด, เวลา, คนพัก) → แตะ = recall เข้าตะกร้า (ถ้าตะกร้าปัจจุบันไม่ว่าง → ถามพักก่อนหรือทิ้ง) |
| 5 | **ประวัติบิล** | `/pos/sales` | ตาราง/การ์ด: receiptNo, เวลา, ยอด, วิธีชำระ (icon), พนักงาน, สถานะ · filter วันที่/สถานะ/วิธี/พนักงาน · ค้นหาเลขใบเสร็จ · แตะ → รายละเอียด + ปุ่ม reprint / void / refund (ตามสิทธิ์+เงื่อนไข) |
| 6 | **สินค้า** | `/pos/products` | ตาราง: รูป, ชื่อ, SKU, barcode, หมวด, ราคา, สต็อก (แดงถ้า low), สถานะ · ปุ่มเพิ่ม/import CSV · **mobile**: การ์ด list · ฟอร์มสินค้า = drawer: ฟิลด์ครบ + ส่วน variants (เพิ่มแถว: ชื่อ/sku/barcode/ราคา/สต็อกเริ่ม) + toggle trackStock + threshold |
| 7 | **หมวด** | `/pos/products/categories` | list ลากเรียงลำดับ + inline rename |
| 8 | **สต็อก** | `/pos/stock` | 3 แท็บ: (ก) ความเคลื่อนไหว — ledger filter ได้ (ข) รับของเข้า — ฟอร์มหลายบรรทัด สแกนเพิ่มได้ พร้อมต้นทุน (ค) ปรับสต็อก — ฟอร์ม + เหตุผลบังคับ · การ์ดสรุป low stock ด้านบน |
| 9 | **ตรวจนับ** | `/pos/stock/counts` + `/counts/:id` | เปิดรอบ (ทั้งหมด/รายหมวด) → หน้านับ: ค้นหา/สแกน → กรอกยอดจริง, แถว diff ≠ 0 ไฮไลต์ · ปุ่มยืนยัน (สรุป diff ก่อน confirm) · mobile-first เพราะเดินนับของ |
| 10 | **กะ** | `/pos/shifts` | สถานะกะปัจจุบันต่อเครื่อง + ปุ่มเปิดกะ (ฟอร์ม float) / ปิดกะ (ฟอร์มนับเงิน: แจกแจงแบงก์ optional, blindClose ตาม settings → กรอกก่อนค่อยเห็น expected, over/short สีแดง/เขียว + เหตุผลถ้าเกิน threshold) · ปุ่ม X report · ประวัติกะ + ดู/พิมพ์ Z report |
| 11 | **เครื่อง** | `/pos/devices` | list: ชื่อ, online dot (lastSeenAt), กะที่เปิดอยู่ · ลงทะเบียนเครื่องนี้ (ปุ่มบนเครื่องใหม่) · ตั้งค่าปริ้นเตอร์ต่อเครื่อง · revoke |
| 12 | **รายงาน** | `/pos/reports` | แท็บ: รายวัน (กราฟแท่ง + ตาราง), สินค้าขายดี, พนักงาน, วิธีชำระ (donut), กำไรขั้นต้น · เลือกช่วงวันที่ · export CSV |
| 13 | **ตั้งค่า POS** | `/pos/settings` | หัว-ท้ายใบเสร็จ + เลขเครื่อง POS, PromptPay ID, บัญชีธนาคาร, นโยบายสต็อกติดลบ, blind close, threshold ต่างๆ — สิทธิ์ OWNER/MANAGER · **VAT/เลขผู้เสียภาษีไม่ตั้งที่นี่** — ลิงก์ไปตั้งค่าบัญชีหน่วย (`unit.settings.account.*` — D9) |
| 14 | **e-receipt (public)** | `/r/[token]` | ใบเสร็จ HTML mobile-first: ข้อมูลครบเท่ากระดาษ + สถานะ (ปกติ/ถูกยกเลิก/คืนเงินแล้ว) — ไม่มีข้อมูลอ่อนไหวอื่น |

---

## 7. Business Flows

### 7.1 `createSale` — flow กลาง (contract 2.1) ⭐ สำคัญที่สุดของแพลตฟอร์ม

**Input (CreateSaleInput):**

```ts
{
  tenantId: string, unitId: string,
  sourceModule: 'POS'|'HOTEL'|'RESTAURANT'|'BOOKING'|'TICKET',
  sourceId?: string,              // folioId/orderId/bookingId — บังคับเมื่อ sourceModule ≠ POS
  staffUserId: string,            // ผู้ทำรายการ (ขายออนไลน์ = system user ของ unit)
  deviceId?: string, shiftId?: string,   // POS source: ระบบเติมจาก header/กะปัจจุบัน
  memberId?: string,
  paymentMode: 'PAID_NOW' | 'PENDING_PAYMENT',   // D1 — PAID_NOW = พฤติกรรมเดิม (Σ payMethods = grandTotal)
  lines: [{ productId?, variantId?, name?, qty, unitPrice?, discount?, note? }],
    // มี productId → ดึงราคา/ชื่อ/cost จาก catalog (unitPrice ส่งมาได้เฉพาะ allowOpenPrice)
    // ไม่มี productId → free-form: name+unitPrice บังคับ (โมดูลอื่นใช้แบบนี้) ไม่แตะสต็อก
    // ห้าม line ติดลบ — มัดจำหักด้วย payMethod DEPOSIT ไม่ใช่ line (D2)
  billDiscount?: { type: 'AMOUNT'|'PERCENT', value: number },  // PERCENT = basis point
  couponCode?: string,
  burnPoints?: number,            // D5: ใช้แต้มเป็นส่วนลด — POS เรียก point.quoteBurn/burn (Point เป็นผู้ตีมูลค่า)
  payMethods: [{ type: 'CASH'|'TRANSFER'|'PROMPTPAY'|'CARD🔜'|'VOUCHER🔜'|'DEPOSIT'|'ROOM_CHARGE',
                 amount: number, cashReceived?, ref?, refSaleId?, slipUrl?, meta? }],
    // DEPOSIT: refSaleId บังคับ = บิลมัดจำเดิม (D2) · ROOM_CHARGE: เฉพาะ tenant ที่มี HOTEL unit ACTIVE (D12)
  paymentIntent?: { method: 'PROMPTPAY'|'TRANSFER', expireAt },  // บังคับเมื่อ paymentMode = PENDING_PAYMENT (แทน payMethods)
  taxInvoice?: { name, taxId, branch?, address },
  note?: string,
  idempotencyKey: string          // บังคับ — client สุ่ม uuid ต่อความพยายามขาย 1 ครั้ง
}
```

**Steps:**

1. **Idempotency check** — เจอ `(unitId, idempotencyKey)` เดิม → คืนผลลัพธ์เดิมทันที (HTTP 200 + `duplicated: true`) ไม่ทำอะไรซ้ำ
2. **Validate บริบท**
   - unit ∈ tenant, `unit.status = ACTIVE` (PAUSED → `UNIT_PAUSED`)
   - RBAC: `can(staffUserId, {tenantId, unitId, module: 'POS', action: 'sale.create'})`
   - `sourceModule = POS` → ต้องมีกะ OPEN ของเครื่องนี้ (`SHIFT_REQUIRED`) · source อื่น → ไม่บังคับกะ/เครื่อง — แต่ถ้าชำระผ่านเครื่องที่มีกะ OPEN ให้ผูก `shiftId` เสมอ (D17)
   - `sourceModule ≠ POS` → `sourceId` บังคับ (`SOURCE_ID_REQUIRED`)
   - lines ≥ 1, ทุก qty > 0, เงินทุกตัว Int ≥ 0
3. **Resolve lines** — บรรทัดที่มี `productId`: โหลด product/variant (ต้อง ACTIVE + unit ตรง), snapshot `name/unitPrice/costSnapshot` · open price ต้องมีสิทธิ์ `sale.priceOverride` · ตรวจนโยบายสต็อก: `BLOCK` + trackStock + stockQty < qty → `STOCK_INSUFFICIENT` (บอกชื่อ+คงเหลือ)
4. **คำนวณส่วนลด** (ลำดับตายตัว — ทุกตัวปัดเศษ round-half-up เป็นสตางค์)
   - `lineTotal = qty×unitPrice − lineDiscount` (lineDiscount ห้ามเกิน qty×unitPrice)
   - `subtotal = Σ qty×unitPrice`, `afterLine = subtotal − lineDiscountTotal`
   - `billDiscount`: PERCENT คิดจาก afterLine · ตรวจเพดาน `maxDiscountBp` ของ role — รวม (lineDiscountTotal+billDiscount)/subtotal ห้ามเกิน → `DISCOUNT_EXCEEDS_LIMIT`
   - `afterBill = afterLine − billDiscount` (ห้ามติดลบ)
5. **คูปอง (contract 2.3)** — มี `couponCode`: เรียก `coupon.validate({code, tenantId, unitId, memberId, amount: afterBill, module: sourceModule})` → invalid → `COUPON_INVALID` + reason ส่งกลับ · valid → `couponDiscount = min(discount, afterBill)`, `afterCoupon = afterBill − couponDiscount`
6. **ใช้แต้มเป็นส่วนลด (contract 2.2 — D5)** — มี `burnPoints`: เรียก `point.quoteBurn({tenantId, memberId, points: burnPoints})` (read-only) → `pointDiscount = min(มูลค่าที่ Point ตีให้, afterCoupon)` — **Point เป็นผู้ตีมูลค่าแต้มเสมอ POS ไม่คำนวณเอง** · balance ไม่พอ → `POINT_BALANCE_INSUFFICIENT` (UI ตัดส่วนลดแต้มออกแล้วให้ยืนยันใหม่) · `net = afterCoupon − pointDiscount` · burn จริงเกิดใน tx (ขั้น 9.5) — ลำดับ coupon → burn → total → VAT ตายตัวตาม `_CONVENTIONS` 2.1
7. **VAT** (D9 — อ่านจาก `unit.settings.account.*` ที่เดียว: `!vatRegistered → NONE`, `priceIncludesVat → INCLUDED | EXCLUDED` — snapshot `vatMode/vatRateBp` ลงเอกสาร)
   - `INCLUDED` (default): `grandTotal = net`, `vatAmount = round(net × rateBp / (10000 + rateBp))` — คิดระดับบิล ไม่คิดรายบรรทัด กัน rounding drift
   - `EXCLUDED`: `vatAmount = round(net × rateBp / 10000)`, `grandTotal = net + vatAmount`
   - `NONE`: `vatAmount = 0`, `grandTotal = net`
8. **ตรวจ payment**
   - `paymentMode = PAID_NOW`: `Σ payMethods.amount === grandTotal` เป๊ะ (สตางค์) ไม่งั้น `PAYMENT_MISMATCH {expected, got}` · CASH: `cashReceived ≥ amount`, `changeAmount = cashReceived − amount` (บิลหนึ่งมี CASH ได้บรรทัดเดียว) · grandTotal = 0 (ส่วนลด 100%) → `payMethods: []` ได้
   - **DEPOSIT (D2)**: `refSaleId` บังคับ — ต้องเป็นบิลมัดจำ `docType SALE, status COMPLETED` ของ unit/สมาชิก-source เดียวกัน · ยอด DEPOSIT ≤ มูลค่ามัดจำคงเหลือที่ยังไม่ถูกอ้าง (กันหักซ้ำ — ตรวจ+จองใน tx) ไม่งั้น `DEPOSIT_INVALID` · DEPOSIT เป็น "วิธีชำระ" ไม่ใช่ line → **ไม่กระทบฐาน VAT ของบิลนี้ และไม่ earn แต้มซ้ำ**
   - **ROOM_CHARGE (D12)**: ใช้ได้เฉพาะ tenant ที่มี unit type HOTEL สถานะ ACTIVE — ไม่งั้นซ่อน/ปฏิเสธ
   - `paymentMode = PENDING_PAYMENT` (D1 — Ticket checkout / Hotel storefront มัดจำ): ไม่รับ payMethods — ตรวจ `paymentIntent {method, expireAt}` แทน
9. **DB Transaction (atomic ทั้งก้อน):**
   - **กรณี PENDING_PAYMENT (D1)**: INSERT `PosSale (status PENDING_PAYMENT, receiptNo = null)` + lines + `PosPaymentIntent (PENDING, expireAt)` — **ยังไม่**จองเลขใบเสร็จ/ตัดสต็อก/redeem คูปอง/burn แต้ม/ยิง point/account → return `{saleId, paymentIntent}` · ทุกอย่างที่เหลือเกิดตอนยืนยันเงินเข้า (flow 7.11)
   - กรณี PAID_NOW:
   1. จองเลขใบเสร็จ: `SELECT ... FOR UPDATE` แถว `PosReceiptCounter(unitId, docType, period=YYMM)` (upsert ถ้ายังไม่มี) → `lastNo+1` → `receiptNo = "{prefix}{YYMM}-{no:06d}"` เช่น `R2607-000123` — lock แถวเดียวสั้นๆ หลายเครื่องยิงพร้อมกันได้เลขเรียงไม่ชน
   2. INSERT `PosSale` + `PosSaleLine[]` + `PosPayment[]` + `PosReceiptToken`
   3. ตัดสต็อก: บรรทัดที่มี productId + trackStock → INSERT `PosStockMovement(type: SALE, qty: −qty, refType: 'PosSale', refId: saleId, balanceAfter)` + decrement `stockQty` cache (atomic `{ decrement }`)
   4. คูปอง: `coupon.redeem({code, tenantId, unitId, memberId, amount: afterBill, module: sourceModule, saleId, tx})` **ในทรานแซกชันเดียวกัน** (โมดูล Coupon atomic re-validate ใน tx) — กันใช้ซ้ำ
   5. แต้ม: มี burnPoints → `point.burn({tenantId, memberId, points: burnPoints, refType: 'PosSale', refId: saleId, idempotencyKey: "PosSale:{saleId}:burn", tx})` — throw ถ้า balance ไม่พอ (D5)
   6. ROOM_CHARGE: เรียก `hotel.chargeToRoom({folioRef, amount, sourceSaleId: saleId}, {crossUnit: true})` ใน tx (D12) — fail → `ROOM_CHARGE_FAILED`
   7. redeem/burn/chargeToRoom fail → rollback ทั้งหมด (เลขใบเสร็จที่จองไปเกิดรูตามธรรมชาติของ rollback — ยอมรับได้ ดู 11.2)
10. **หลัง commit (side effects — ผ่าน outbox กลาง + retry, ห้ามทำให้บิลล้ม):** *(บิลที่จ่ายด้วย ROOM_CHARGE: ข้าม 10.1/10.2 — point/account ไปเกิดตอน settle ที่โรงแรม — D12)*
    1. `point.earn({tenantId, memberId, unitId, amountSatang: Σ payMethods ที่ไม่ใช่ DEPOSIT/ROOM_CHARGE, sourceModule, refType: 'PosSale', refId: saleId, idempotencyKey: "PosSale:{saleId}:earn"})` — **Point เป็นผู้คำนวณแต้มจากยอดเงิน POS ไม่ส่ง delta (D5)** · ไม่นับ DEPOSIT = ไม่ earn ซ้ำ (มัดจำ earn ไปแล้วตอนบิลมัดจำ — D2) · ผลเขียนกลับ `sale.pointEarned` (nullable) · fail → outbox retry — บิลไม่ล้ม
    2. `account.postSale({tenantId, unitId, saleId, docType: 'SALE', grandTotal, vatAmount, discountTotal: lineDiscountTotal + billDiscount + couponDiscount, pointDiscount, payMethods, sourceModule, businessDate, idempotencyKey: "PosSale:{saleId}:post"})` — **facade 2.4 เท่านั้น: POS ไม่รู้ account code, mapping ทั้งหมดอยู่ฝั่ง Account (D3)** → คืน `{journalId, abbInvoiceNo}` → เขียน `sale.abbInvoiceNo` แปะใบเสร็จ · fail → outbox retry (Account idempotent)
    3. `member.recordSpend({tenantId, memberId, unitId, amountSatang: grandTotal, saleId})` — trigger เดียวของ tier engine (D6)
    4. `activity.log({tenantId, memberId, unitId, module: 'POS', type: 'SALE', refType: 'PosSale', refId: saleId, summary})` (D6 — contract 2.7)
    5. `notify` e-receipt ถ้าสมาชิกมีอีเมล+เปิดรับ · `AuditLog` sale.create
11. **Return:** `{ saleId, receiptNo?, grandTotal, pointEarned? }` (`pointEarned` nullable — earn เป็น post-commit outbox) · PENDING_PAYMENT → `{ saleId, paymentIntent: {qrPayload? | บัญชีโอน, expireAt} }` — ตรงตาม contract 2.1 v2

**Error codes (โมดูลอื่นต้อง handle):** `UNIT_PAUSED` · `SHIFT_REQUIRED` · `SOURCE_ID_REQUIRED` · `PRODUCT_NOT_FOUND` · `STOCK_INSUFFICIENT` · `DISCOUNT_EXCEEDS_LIMIT` · `COUPON_INVALID` · `POINT_BALANCE_INSUFFICIENT` · `DEPOSIT_INVALID` · `ROOM_CHARGE_FAILED` · `SALE_EXPIRED` · `PAYMENT_MISMATCH` · `PERMISSION_DENIED`

### 7.2 ขายหน้าร้าน (Register)

1. แคชเชียร์เปิด `/pos/sale` → โหลด `shifts/current` — ไม่มีกะ → modal เปิดกะ (กรอก float) → สแกน/แตะสินค้าเข้าตะกร้า
2. (option) ผูกสมาชิก: กรอกเบอร์ → โชว์ชื่อ+แต้ม · (option) คูปอง → validate โชว์ส่วนลดสด · (option) ใช้แต้มเป็นส่วนลด → quoteBurn โชว์มูลค่าลดสด (D5)
3. กด "ชำระเงิน" → จอชำระ → เลือกวิธี (split ได้) → กดยืนยัน → client เรียก `POST /sales` พร้อม `idempotencyKey` ที่สุ่มไว้ตอนกดชำระ
4. สำเร็จ → จอสรุป (เงินทอน/แต้ม) → พิมพ์/ส่ง → ตะกร้าเคลียร์ ขายรายการถัดไป
5. **Failure path:** network timeout → client **retry ด้วย key เดิม** (ไม่เกิดบิลซ้ำ) · `STOCK_INSUFFICIENT` → ไฮไลต์บรรทัดแดง+คงเหลือ · `COUPON_INVALID` → ถอดคูปอง แจ้งเหตุผล ยอดกลับมายอดเดิม ให้ยืนยันใหม่ · `DISCOUNT_EXCEEDS_LIMIT` → toast "เกินสิทธิ์ ให้ผู้จัดการทำรายการ"

### 7.3 Split payment: เงินสด 300 + โอน 200 (บิล 500 บาท)

1. จอชำระ ยอด 50000 สตางค์×100 = แสดง ฿500 → แตะ "เงินสด" กรอก 300 → แถบค้างชำระ ฿200
2. แตะ "โอน" → โชว์เลขบัญชี → ลูกค้าโอน → พนักงานแนบสลิป → ยอดครบ ปุ่มยืนยัน active
3. `payMethods: [{type: CASH, amount: 30000_00…}]` — ตัวอย่างจริง: `[{type:'CASH', amount:30000, cashReceived:30000}, {type:'TRANSFER', amount:20000, slipUrl}]` (หน่วยสตางค์) → Σ = 50000 = grandTotal ✓
4. ลูกค้าเปลี่ยนใจกลาง flow → ปุ่มลบวิธีที่ใส่แล้ว/ล้างทั้งหมดได้ ก่อนยืนยันสุดท้ายเท่านั้น (ยังไม่มีอะไรเขียน DB)

### 7.4 PromptPay dynamic QR

1. จอชำระ แตะ "PromptPay" → `POST /promptpay/qr {amount}` → server สร้าง EMVCo payload (Tag 29 + promptpayId + amount + CRC) → client render QR
2. ลูกค้าสแกนจ่าย → พนักงานเช็คเงินเข้า (แอปธนาคารร้าน/เสียงแจ้งเตือน) → กด "รับเงินแล้ว" → confirm ซ้ำ 1 ครั้ง ("ยืนยันว่าเงิน ฿500 เข้าแล้ว?") → payment `{type: PROMPTPAY, amount, meta: {qrPayload, confirmedBy: userId}}`
3. ขายออนไลน์ (Ticket/Hotel storefront): ใช้ `paymentMode: PENDING_PAYMENT` + `PosPaymentIntent` (flow 7.11 — D1) · 🔜 webhook ธนาคาร/gateway → ยืนยันอัตโนมัติ ตัดคน confirm ออก (interface รองรับแล้ว)
4. **Failure:** ลูกค้าสแกนแล้วแต่พนักงานยังไม่กดยืนยัน แล้วไฟดับ → ยังไม่มีบิลใน DB → เปิดใหม่ ตะกร้ายังอยู่ (local state) → ทำซ้ำ · เงินเข้าซ้ำซ้อน = กระบวนการร้านตรวจ statement นอกระบบ v1

### 7.5 Void (ยกเลิกทั้งใบ — ก่อนปิดกะ)

**เงื่อนไข:** `docType = SALE`, `status = COMPLETED`, ไม่มี REFUND อ้างถึง, กะของบิล**ยังไม่ปิด** (บิลไม่มีกะ เช่นจากโมดูลอื่น → void ได้ภายในวันเดียวกัน unit-tz) · สิทธิ์ `pos.sale.void` (STAFF ทั่วไป void ได้เฉพาะบิลตัวเองในกะปัจจุบัน — MANAGER+ ทุกบิลที่เข้าเงื่อนไข)

1. ตรวจเงื่อนไข + reason บังคับ
2. Transaction: `status → VOIDED` + `voidedAt/By/Reason` (lines/payments **ไม่แตะ** — immutable) · คืนสต็อก: movement `RETURN` ต่อบรรทัด (refType `'PosSale'` refId saleId — D8) + increment cache · คูปอง: เรียก `coupon.release({tenantId, saleId, reason: voidReason, tx})` คืนสิทธิ์การใช้
3. หลัง commit (outbox): `point.reverse({tenantId, refType: 'PosSale', refId: saleId, idempotencyKey: "PosSale:{saleId}:void-reverse"})` — reverse ทั้ง earn และ burn ของบิลนี้ คงอายุ lot เดิม (**D5 — ห้ามใช้ point.adjust**) · **แต้มลูกค้าอาจติดลบได้ถ้าใช้ไปแล้ว — ยอมให้ติดลบ (นโยบายแพลตฟอร์ม, Point module รองรับ)** · `account.postVoid({tenantId, unitId, saleId, docType: 'VOID', grandTotal, vatAmount, discountTotal, pointDiscount, payMethods, sourceModule, businessDate, idempotencyKey: "PosSale:{saleId}:void-post"})` — facade 2.4: Account กลับรายการเองทั้งก้อน POS ไม่รู้ account code (D3) · reverse `member.recordSpend` ยอดติดลบ (ตามสเปค 06 — D6) · `activity.log(type: 'SALE_VOID')`
4. แจ้งโมดูลต้นทาง: sale ที่มี `sourceModule ≠ POS` → emit event `pos.sale.voided {saleId, sourceModule, sourceId}` ให้โมดูลต้นทางปรับสถานะเอกสารตัวเอง (เช่น folio กลับเป็นค้างชำระ)
5. เงินสดที่คืนลูกค้า: สะท้อนใน X/Z report เป็นยอด void (expectedCash หักออก)

### 7.6 Refund (คืนเงินหลังปิดกะ / คืนบางส่วน)

1. เปิดบิลเดิม → เลือกบรรทัด+จำนวนที่คืน (≤ ที่เหลือคืนได้: qty เดิม − ที่เคยคืน) → เลือกวิธีคืนเงิน (CASH ต้องมีกะเปิด / TRANSFER) + reason
2. สร้าง**เอกสารใหม่** `docType: REFUND`, `receiptNo: CN2607-000004` (counter แยก docType), `refSaleId`, lines อ้าง `refLineId`, ยอดเป็นบวก, payments = เงินที่จ่ายคืน
3. Transaction: INSERT เอกสาร REFUND · คืนสต็อก movement `RETURN` (เฉพาะบรรทัดมี productId, เลือกได้ว่า "รับของคืน" หรือ "ไม่รับ (ของเสีย)" → ADJUST แทน) · อัปเดตใบเดิม `status → PARTIALLY_REFUNDED | REFUNDED`
4. ส่วนลด/คูปอง/VAT ปันส่วนตามสัดส่วนบรรทัดที่คืน (pro-rata, ปัดสตางค์ half-up, ใบสุดท้ายเก็บเศษ) · คูปอง**ไม่คืนสิทธิ์**เมื่อ refund บางส่วน (คืนเต็มใบ = release เหมือน void)
5. หลัง commit (outbox): `point.reverse({tenantId, refType: 'PosSale', refId: saleId, amountSatang: <ยอดที่คืน>, idempotencyKey: "PosSale:{refundSaleId}:reverse"})` — **Point คำนวณแต้มที่ต้องหักเอง POS ไม่คิดสัดส่วน (D5 — ห้ามใช้ adjust)** · `account.postRefund({tenantId, unitId, saleId: refundSaleId, docType: 'REFUND', grandTotal: <ยอดคืน>, vatAmount, discountTotal, pointDiscount, payMethods, sourceModule, businessDate, idempotencyKey: "PosSale:{refundSaleId}:post"})` — facade 2.4 (D3) · reverse `member.recordSpend` ตามยอดคืน (สเปค 06 — D6) · `activity.log(type: 'SALE_REFUND')` · emit `pos.sale.refunded` ให้โมดูลต้นทาง · audit log

### 7.7 เปิด-ปิดกะ

1. **เปิด:** เครื่องต้องไม่มีกะ OPEN (มี → บอกให้ปิด/แจ้ง MANAGER) → กรอก float → `PosShift OPEN`
2. **ระหว่างกะ:** ทุก sale ของเครื่องผูก shiftId — **รวมบิล `sourceModule ≠ POS` ที่ชำระผ่านเครื่อง/เคาน์เตอร์ที่มีกะ OPEN (D17)** เงินสดของบิลเหล่านี้จึงเข้า expectedCash ของกะ · ไม่มีกะเปิด → ไม่ผูกกะ แต่แสดงแยกในรายงานเป็น "เงินสดนอกกะ" ให้ OWNER เห็น · X report ดูได้ตลอด: บิล n ใบ, ยอดแยกวิธี, void x ใบ, `expectedCash = float + Σcash.amount − Σchange − Σcash refund`
3. **ปิด:** ฟอร์มนับเงิน (blindClose = ซ่อน expected จนกรอกเสร็จ) → `overShort = counted − expected` → เกิน threshold → เหตุผลบังคับ + notify OWNER → freeze `zReport` JSON (ยอดทุกมิติ) + `zNumber` รันต่อ unit → `status CLOSED`
4. **ปิดกะแล้วขายต่อ:** เครื่องไม่มีกะ → Register block จนเปิดกะใหม่
5. **Force-close:** cron ตี 4 (unit-tz): กะ OPEN > 24 ชม. → `FORCE_CLOSED`, expectedCash คำนวณ, countedCash = null, notify OWNER — บิลของกะนั้น void ไม่ได้แล้ว (ต้อง refund)

### 7.8 ตรวจนับสต็อก

1. เปิดรอบ (ทั้งหมด/รายหมวด) → ระบบ snapshot `systemQty` ทุกบรรทัด ณ ตอนเปิด
2. เดินนับ (มือถือ): สแกน/ค้น → กรอกยอดจริง — ระหว่างนี้**ขายต่อได้** (ดู 11.6 วิธีจัดการ drift)
3. กดยืนยัน → จอสรุป diff (จำนวน+มูลค่าตาม cost) → confirm → transaction สร้าง movement `COUNT` ปรับ `stockQty = countedQty + (ยอดขายระหว่างนับ)` ตามสูตร 11.6 → audit log
4. รอบ DRAFT ค้าง > 7 วัน → auto-cancel + notify

### 7.9 โมดูลอื่นเรียก createSale (ตัวอย่าง Hotel checkout)

1. Hotel ปิด folio ห้อง 204 ยอด ฿3,500 (จ่ายมัดจำไว้แล้ว ฿1,000 เป็นบิลมัดจำ `depSaleId`) → เรียก **in-process** `posSaleService.createSale({ tenantId, unitId, sourceModule: 'HOTEL', sourceId: folioId, staffUserId, memberId, paymentMode: 'PAID_NOW', lines: [{name: 'ค่าห้อง Deluxe 2 คืน', qty: 1, unitPrice: 300000}, {name: 'มินิบาร์', qty: 1, unitPrice: 50000}], payMethods: [{type: 'DEPOSIT', amount: 100000, refSaleId: depSaleId}, {type: 'TRANSFER', amount: 250000, slipUrl}], idempotencyKey: 'folio-{folioId}-close-1' })` — **มัดจำหักเป็นวิธีชำระ ไม่ใช่ line ติดลบ (D2)** · แต้ม earn จากบิลนี้คิดเฉพาะ 250000 (ไม่นับ DEPOSIT — ไม่ earn ซ้ำ)
2. POS ทำ flow 7.1 เต็ม (ไม่บังคับกะ — แต่ถ้าชำระผ่านเคาน์เตอร์ที่มีกะ OPEN ผูก shiftId ตาม D17, ไม่แตะสต็อก POS เพราะเป็น free-form lines) → คืน `{saleId, receiptNo, grandTotal, pointEarned?}`
3. Hotel เก็บ `saleId+receiptNo` ใน folio → ใบเสร็จที่ลูกค้าได้ = ใบเสร็จ POS มาตรฐานเดียวกันทั้งแพลตฟอร์ม
4. Hotel ต้องยกเลิก → เรียก `posSaleService.voidSale/refundSale` — **ห้ามแก้เอกสารเอง**

### 7.10 พักบิล / เรียกคืน

1. พัก: snapshot ตะกร้า (lines+member+discount+coupon ยังไม่ redeem) → `PosHeldCart HELD` + label — เครื่องอื่นใน unit เห็นด้วย (คนละเครื่องเรียกคืนได้)
2. เรียกคืน: `UPDATE ... WHERE status='HELD'` atomic → `RECALLED` — สองเครื่องกดพร้อมกัน เครื่องที่สองได้ error "ถูกเรียกไปแล้ว"
3. เรียกคืนแล้ว**ราคา/คูปอง re-validate ใหม่** (ราคาอาจเปลี่ยนระหว่างพัก — ใช้ราคาปัจจุบัน แจ้งถ้าต่าง)
4. หมดอายุเที่ยงคืน (unit-tz) → cron `DISCARDED`

### 7.11 PENDING_PAYMENT — ขายออนไลน์รอเงินเข้า (D1)

**ผู้ใช้ v1:** Ticket checkout (05), Hotel storefront มัดจำ (01) — in-store ใช้ `PAID_NOW` เหมือนเดิม

1. ต้นทางเรียก `createSale({..., paymentMode: 'PENDING_PAYMENT', paymentIntent: {method: 'PROMPTPAY'|'TRANSFER', expireAt}})` → POS สร้าง `PosSale (PENDING_PAYMENT, receiptNo = null)` + `PosPaymentIntent (PENDING)` — **ยังไม่ยิง point/account/ใบเสร็จ/สต็อก/คูปอง** → คืน `{saleId, paymentIntent {qrPayload | บัญชีโอน, expireAt}}` ให้ต้นทางแสดงลูกค้า
2. **ยืนยันเงินเข้า (v1 manual):** ลูกค้าโอน/สแกนจ่าย + แนบสลิป → staff/FINANCE ตรวจแล้วเรียก `POST /sales/:id/confirm-payment {paymentRef}` (หรือ `confirmSalePaid` in-process) — **idempotent ด้วย `paymentRef`** (`@@unique([unitId, paymentRef])`) ยิงซ้ำได้ผลเดิม · 🔜 gateway webhook เรียกจุดเดียวกัน (interface รองรับแล้ว)
3. ตอนยืนยัน (tx เดียว): จองเลขใบเสร็จ + ตัดสต็อก + `coupon.redeem` + `point.burn` (ถ้ามี) → intent CONFIRMED + sale COMPLETED + `paidAt` → หลัง commit ยิง side effects ทั้งหมดตาม flow 7.1 ขั้น 10 + **emit `pos.sale.paid {saleId, sourceModule, sourceId}`** ให้ต้นทางออกตั๋ว/ยืนยัน booking
4. **หมดอายุ:** cron กวาด intent PENDING ที่เกิน `expireAt` → intent EXPIRED + sale EXPIRED + **emit `pos.sale.expired {saleId, sourceModule, sourceId}`** → ต้นทางปล่อย hold (Ticket ปล่อยที่นั่ง, Hotel ปล่อย HOLD)
5. **Failure path:** ยืนยันหลังหมดอายุ → `SALE_EXPIRED` (เงินเข้าช้า = คืนเงิน/ติดต่อลูกค้านอกระบบ v1) · confirm กับ expire แข่งกัน → conditional update สถานะ (แพ้ = error ชัดเจน) · ยกเลิกก่อนจ่าย → `/sales/:id/cancel-pending`

---

## 8. Integration (contract ข้อ 2 ทั้งหมด)

| Contract | บทบาท POS | จุดที่เรียก |
|---|---|---|
| **2.1 Payment** | **POS = provider** — `posSaleService.createSale/confirmSalePaid/voidSale/refundSale` ตาม 7.1/7.11/7.5/7.6 · `paymentMode PAID_NOW|PENDING_PAYMENT` (D1) · payMethod `DEPOSIT` หักมัดจำ (D2) / `ROOM_CHARGE` (D12) · เลขใบเสร็จ `@@unique([unitId, receiptNo])` · emit `pos.sale.paid / pos.sale.voided / pos.sale.refunded / pos.sale.expired {saleId, sourceModule, sourceId}` (naming เต็มตาม D7) · REST: `POST /api/u/[unitId]/pos/sales` (Register) · in-process service (โมดูลอื่น) | ทั้งโมดูล |
| **2.2 Point** | consumer — `point.quoteBurn` (พรีวิว) + `point.burn` ใน tx = ใช้แต้มเป็นส่วนลด (**D5 MVP**) · `point.earn({amountSatang, ...})` หลัง commit ผ่าน outbox — **Point เป็นผู้คำนวณแต้ม POS ส่งยอดเงิน ไม่ส่ง delta** · void/refund → `point.reverse` (**ห้ามใช้ adjust** — D5) · `idempotencyKey` บังคับทุก mutation · refType `'PosSale'` (D8) | 7.1 ขั้น 6/9.5/10.1 · 7.5 · 7.6 |
| **2.3 Coupon** | consumer — `coupon.validate` 2 จุด: ตอนใส่โค้ดใน UI (โชว์สด) + ใน createSale ก่อนคิด VAT · `coupon.redeem({..., amount: afterBill, module, saleId, tx})` **ใน DB transaction เดียวกับ sale** (atomic กันใช้ซ้ำ) · `coupon.release({tenantId, saleId, reason, tx})` ตอน void/refund เต็มใบ · **voucher v1 = ส่วนลดผ่าน couponCode จุดเดียว (D4 — payMethod VOUCHER 🔜)** | 7.1 ขั้น 5, 9.4 · 7.5 |
| **2.4 Account** | consumer — **facade เท่านั้น (D3): `account.postSale / postRefund / postVoid({tenantId, unitId, saleId, docType, grandTotal, vatAmount, discountTotal, pointDiscount, payMethods[], sourceModule, businessDate, idempotencyKey})`** → คืน `{journalId, abbInvoiceNo}` — POS เก็บ `abbInvoiceNo` ลง `PosSale.abbInvoiceNo` แปะใบเสร็จ · **POS ไม่รู้ account code — mapping ทั้งหมดอยู่ฝั่ง Account** · DEPOSIT method = Account ล้างภาระมัดจำเอง (D2) · ใบกำกับภาษีเต็มรูป: POS แนบ `taxInvoice` ให้ Account ออกเอกสาร | 7.1 ขั้น 10.2 · 7.5 · 7.6 |
| **2.5 Notification** | consumer — `notify({channel: EMAIL, template: 'pos-e-receipt', data})` · low stock digest รายวัน · over/short เกิน threshold + force-close แจ้ง OWNER | T6, P9, F6 |
| **2.6 Member** | consumer — อ้าง `memberId` เท่านั้น + freeze `memberSnapshot {name, phone}` ลงใบเสร็จ (ข้อยกเว้นที่ contract อนุญาต) · ค้นสมาชิกผ่าน Member API (เบอร์/QR) · **`member.recordSpend({tenantId, memberId, unitId, amountSatang, saleId})` หลังปิดบิลผ่าน outbox — trigger เดียวของ tier engine (D6)** | R7 · 7.1 ขั้น 10.3 |
| **2.7 Activity** | producer บังคับ (D6) — `activity.log({tenantId, memberId, unitId, module: 'POS', type: SALE|SALE_VOID|SALE_REFUND, refType: 'PosSale', refId, summary})` ผ่าน outbox กลาง | 7.1 ขั้น 10.4 · 7.5 · 7.6 |
| **Hotel (01)** | consumer — payMethod ROOM_CHARGE → `hotel.chargeToRoom({folioRef, amount, sourceSaleId}, {crossUnit: true})` ใน tx (D12) — บิลต้นทางไม่ยิง point/account (เกิดตอน settle ที่โรงแรม) · แสดงปุ่มเฉพาะ tenant ที่มี HOTEL unit ACTIVE | 7.1 ขั้น 9.6 |

**⚠️ ข้อกำหนดเพิ่มที่ POS ต้องการจากโมดูลอื่น (สำหรับ QC ไขว้):**

1. **Coupon (08):** `coupon.release({tenantId, saleId, reason, tx})` อยู่ใน `_CONVENTIONS.md` 2.3 (v2) แล้ว — `coupon.redeem/release` รับ **Prisma tx client** เพื่อ join transaction ของ POS
2. **Point (09) และ Account (12) ต้อง idempotent ด้วย `idempotencyKey`** — event ซ้ำจาก outbox retry ต้องไม่บวกแต้ม/ลงบัญชีซ้ำ · Point ต้องยอมให้ balance ติดลบจาก `point.reverse`
3. **โมดูลต้นทาง (01/02/03/05) ต้อง subscribe event** `pos.sale.paid` / `pos.sale.expired` / `pos.sale.voided` / `pos.sale.refunded` (ชื่อเต็มตาม D7) เพื่อออกตั๋ว/ปล่อย hold/ปรับสถานะเอกสารฝั่งตัวเอง และต้องส่ง `idempotencyKey` ที่ deterministic ต่อการชำระ 1 ครั้ง (เช่น `folio-{id}-close-{attempt}`)
4. **Member (06):** API ค้นหาด้วยเบอร์โทร + decode QR บัตรสมาชิก ต้อง latency ต่ำ (ใช้กลางหน้าขาย) · `member.recordSpend` ต้อง idempotent ต่อ saleId + รองรับ reverse ตอน void/refund (D6)

---

## 9. Permissions (action × role)

> ตรวจผ่าน `can(user, {tenantId, unitId, module: 'POS', action})` — STAFF ปรับ custom ได้รายคนผ่าน `Membership.permissions.pos`

| Action | OWNER | MANAGER (unit) | STAFF (default) | custom key |
|---|---|---|---|---|
| ขาย (createSale) | ✅ | ✅ | ✅ | `pos.sale.create` |
| ดูบิล | ✅ | ✅ | ✅ (ของตัวเอง+วันนี้) | `pos.sale.read` |
| ส่วนลดรายบรรทัด/ท้ายบิล | ✅ ไม่จำกัด | ✅ ไม่จำกัด | ✅ ถึงเพดาน | `pos.sale.discount` + `maxDiscountBp` (default STAFF = 1000 = 10%) |
| Open price / แก้ราคา | ✅ | ✅ | ❌ | `pos.sale.priceOverride` |
| ยืนยันเงินเข้า (PENDING_PAYMENT — D1) | ✅ | ✅ | ❌ (custom ให้ได้ เช่น FINANCE) | `pos.sale.confirmPayment` |
| Void | ✅ | ✅ ทุกบิลก่อนปิดกะ | ✅ เฉพาะบิลตัวเอง กะปัจจุบัน | `pos.sale.void` |
| Refund | ✅ | ✅ | ❌ | `pos.sale.refund` |
| เปิดกะ / X report | ✅ | ✅ | ✅ | `pos.shift.open` |
| ปิดกะ | ✅ | ✅ | ✅ (กะตัวเอง) | `pos.shift.close` |
| ดูประวัติกะ/Z ย้อนหลัง | ✅ | ✅ | ❌ | `pos.shift.read` |
| จัดการสินค้า/หมวด | ✅ | ✅ | ❌ | `pos.product.manage` |
| รับของเข้า | ✅ | ✅ | ❌ | `pos.stock.receive` |
| ปรับสต็อก | ✅ | ✅ | ❌ | `pos.stock.adjust` |
| ตรวจนับ | ✅ | ✅ | ❌ | `pos.stock.count` |
| ดู movement/สต็อก | ✅ | ✅ | ✅ (คงเหลือบนหน้าขาย) | `pos.stock.read` |
| จัดการเครื่อง | ✅ | ✅ | ❌ | `pos.device.manage` |
| รายงาน | ✅ | ✅ | ❌ | `pos.report.read` |
| ตั้งค่า POS (ใบเสร็จ/อุปกรณ์ — VAT อยู่ settings บัญชี D9) | ✅ | ✅ | ❌ | `pos.settings.manage` |

- ทุก action ที่แตะเงิน/แต้ม/สต็อก → `AuditLog` (who/what/when/before/after) ตามกติการ่วมข้อ 5
- MANAGER = เต็มสิทธิ์เฉพาะ unit ใน `unitAccess` เท่านั้น (RBAC 4 มิติ)

---

## 10. Reports & Metrics

| รายงาน | เนื้อหา | แหล่ง |
|---|---|---|
| **ยอดขายรายวัน** ✅ | ยอดสุทธิ, จำนวนบิล, เฉลี่ย/บิล, void/refund (จำนวน+มูลค่า), แยกช่วงเวลา (กราฟรายชั่วโมง) | `PosSale` aggregate (index `[unitId, createdAt]`) |
| **สินค้าขายดี** ✅ | Top N ตาม qty และตามยอดเงิน + margin ต่อตัว, filter หมวด/ช่วงเวลา | `PosSaleLine` group by productId |
| **ต่อพนักงาน** ✅ | ยอด/บิล/เฉลี่ย/ส่วนลดที่ให้/void ต่อ staffUserId — จับ pattern ผิดปกติ (ส่วนลดสูง, void บ่อย) | `PosSale` group by staffUserId |
| **ต่อวิธีชำระ** ✅ | ยอด+จำนวนต่อ CASH/TRANSFER/PROMPTPAY/DEPOSIT/ROOM_CHARGE (VOUCHER 🔜) — กระทบเงินสดในลิ้นชัก vs เงินเข้าบัญชี + แถว "เงินสดนอกกะ" (D17) | `PosPayment` group by type |
| **กำไรขั้นต้น** ✅ | Σ lineTotal − Σ(costSnapshot×qty) — เฉพาะบรรทัดที่มี cost + ระบุ % coverage ("มีต้นทุน 82% ของยอดขาย") | `PosSaleLine` |
| **สรุปกะ** ✅ | over/short รายกะ/รายเดือน ต่อพนักงานที่ปิด | `PosShift` |
| **มูลค่าสต็อก + low stock** ✅ | Σ(stockQty×cost), รายการใกล้หมด | `PosProduct/Variant` |
| **ยอดต่อ sourceModule** ✅ | POS หน้าร้าน vs Hotel vs Restaurant ฯลฯ — เห็นว่าเงินมาจากช่องทางไหน | `PosSale` group by sourceModule |
| Dashboard KPI (การ์ด unit บน Overview "ทุกกิจการ") ✅ | ยอดขายวันนี้ + จำนวนบิล + กะเปิดอยู่ | endpoint aggregate เบา |
| Heatmap วัน×ชั่วโมง, เปรียบเทียบสาขา (cross-unit consolidated), forecast | | 🔜 |

- ทุกรายงาน export CSV ✅ / PDF 🔜 · เขตเวลา = `unit.settings.timezone` (ตัดวันตามร้าน ไม่ใช่ UTC)

---

## 11. Edge Cases & Rules

1. **เลขใบเสร็จชนกัน (หลายเครื่อง)** — จอง `receiptNo` ผ่าน `SELECT ... FOR UPDATE` บน `PosReceiptCounter` ในทรานแซกชันเดียวกับ INSERT sale · `@@unique([unitId, receiptNo])` เป็นตาข่ายชั้นสุดท้าย — unique violation = retry ทั้ง tx (สูงสุด 3 ครั้ง)
2. **รูเลขใบเสร็จจาก rollback** — tx ล้มหลังจองเลข → เลขหายไปหนึ่ง (เช่น มี 000122 แล้วกระโดด 000124) → **ยอมรับได้** ไม่ reuse เลข (ปลอดภัยกว่าการันตีต่อเนื่อง) — เอกสาร VOIDED ยังอยู่ในระบบครบ ตรวจสอบย้อนได้
3. **Idempotency** — `(unitId, idempotencyKey)` unique · ยิงซ้ำคืนผลเดิม · client สุ่ม key ใหม่เฉพาะเมื่อ**ผู้ใช้เริ่มการชำระใหม่จริง** (แก้ตะกร้าแล้วกดชำระใหม่ = key ใหม่)
4. **Split payment ต้องเป๊ะ** — Σ amount = grandTotal ระดับสตางค์ ไม่มี tolerance · เงินทอนอยู่นอกสมการ (เฉพาะ CASH ผ่าน cashReceived/changeAmount) · CASH ≤ 1 บรรทัด/บิล
5. **สต็อกติดลบ** — `ALLOW_NEGATIVE` (default): ขายผ่าน แจ้ง badge ติดลบ รอตรวจนับ · `BLOCK`: createSale ปฏิเสธ — เช็ก+ตัดใน tx เดียว (atomic decrement + เงื่อนไข) กัน race สองเครื่องขายชิ้นสุดท้ายพร้อมกัน
6. **ขายระหว่างรอบตรวจนับ** — ยอดปรับตอน confirm = `countedQty + (ยอดขายสุทธิหลัง snapshot)`: replay movement ที่เกิดหลัง `count.createdAt` แล้วบวกทับยอดนับ — คนนับไม่เห็นของที่เพิ่งขายออกเป็น "ของหาย"
7. **Void vs Refund เส้นแบ่งชัด** — void = กะยังไม่ปิดเท่านั้น (Z report จะได้สะท้อนยอดจริงของกะ) · กะปิด/force-close แล้ว = refund เท่านั้น · เอกสาร immutable ทั้งคู่: void ไม่ลบข้อมูล, refund เป็นใบใหม่
8. **แต้ม/บัญชี fail หลังบิล commit** — บิลไม่ล้ม (ลูกค้าจ่ายแล้ว ใบเสร็จออกแล้ว) → retry queue backoff สูงสุด 5 ครั้ง → ยัง fail → แจ้ง OWNER + row ใน dashboard "รายการค้างซิงก์" ให้กด retry มือ — ทุก consumer idempotent จึง retry ปลอดภัย
9. **Offline (🔜 แต่กติกาวางแล้ว)** — v1 online-only: ปุ่มชำระ disabled ตอน offline + banner · ห้าม half-offline (พิมพ์ใบเสร็จโดยไม่มี saleId ใน DB = ห้ามเด็ดขาด) · design ไว้: IndexedDB queue + idempotencyKey เดิม + เลขชั่วคราว `OFF-{deviceCode}-{n}` พิมพ์คำว่า "รอออกเลขจริง" + reconcile ตอน sync — จะ implement เป็น Phase แยกพร้อม conflict policy
10. **VAT ปัดเศษ** — คิดระดับบิล (ไม่ Σ จากรายบรรทัด) round-half-up สตางค์ · ใบกำกับภาษีอย่างย่อ/เต็มรูปใช้เลขเดียวกับเอกสาร ห้ามคำนวณใหม่ตอน render
11. **เปลี่ยน VAT settings กลางทาง** — sale snapshot `vatMode/vatRateBp` ณ เวลาขาย — แก้ settings ไม่กระทบเอกสารเก่า
12. **ราคาเปลี่ยนระหว่างพักบิล** — recall แล้ว re-price จาก catalog ปัจจุบัน + แจ้งบรรทัดที่ราคาเปลี่ยน · คูปอง re-validate
13. **สมาชิกถูกลบ/merge หลังขาย** — ใบเสร็จใช้ `memberSnapshot` ไม่ dereference `memberId` ตอน render — เอกสาร freeze ตาม 2.6
14. **เครื่องถูก revoke ระหว่างกะเปิด** — revoke ได้ แต่ระบบเตือนให้ปิดกะก่อน · กะค้างของเครื่อง revoked → force-close flow เดิม
15. **unit PAUSED** — createSale ทุก source ปฏิเสธ (`UNIT_PAUSED`) · ดูรายงาน/ประวัติได้ปกติ (read ไม่ block) — ตรง edge case 4 ของ BLUEPRINT_BUSINESS_UNITS
16. **คูปองจำกัดหน่วย** — `coupon.validate` ส่ง `unitId` ณ จุดขายเสมอ ให้ Coupon ตรวจ `applicableUnitIds` (edge case 6 ของ blueprint)
17. **grandTotal = 0** (ส่วนลด/คูปอง 100%) — บิล valid, `payMethods: []`, ออกใบเสร็จปกติ, point base = 0
18. **Timezone** — "วันนี้/สิ้นวัน/รายงานรายวัน" ตัดตาม `unit.settings.timezone` (default Asia/Bangkok) เก็บ UTC เสมอ
19. **จำนวนบรรทัด/บิล** — soft limit 200 บรรทัด (กัน payload abuse) · qty ≤ 9999/บรรทัด
20. **Race พักบิล** — recall ใช้ conditional update (`WHERE status='HELD'`) — แพ้ race ได้ error ชัดเจน ไม่ duplicate ตะกร้า
21. **PENDING_PAYMENT (D1)** — sale สถานะนี้ไม่มีเลขใบเสร็จ/ไม่ตัดสต็อก/ไม่ยิง side effect ใดๆ · confirm กับ expire แข่งกัน → conditional update (แพ้ = error ชัดเจน) · confirm idempotent ด้วย `paymentRef` · sale EXPIRED ไม่นับในรายงานยอดขาย
22. **DEPOSIT กันหักซ้ำ (D2)** — บิลมัดจำ 1 ใบถูกอ้างเป็น DEPOSIT ได้ไม่เกินมูลค่าคงเหลือ (ตรวจ+จองใน tx) · บิลมัดจำที่ถูกอ้างแล้ว void ไม่ได้ (ต้อง void บิล settle ก่อน) · earn คิดจาก Σ payMethods ที่ไม่ใช่ DEPOSIT/ROOM_CHARGE เสมอ
23. **เงินสดนอกกะ (D17)** — บิล source อื่นที่รับ CASH: เครื่อง/เคาน์เตอร์มีกะ OPEN → ผูก shiftId เสมอ (เข้า expectedCash) · ไม่มีกะ → ไม่ผูกกะ แต่ต้องโผล่ในรายงานแยก "เงินสดนอกกะ" ให้ OWNER ตรวจ

---

## 12. QC Checklist (เกณฑ์ตรวจรับ)

### Functional — Sale service
- [ ] createSale ครบ flow 7.1: ส่วนลดรายบรรทัด+ท้ายบิล+คูปอง+ส่วนลดแต้ม+VAT ทั้ง 3 โหมด (อ่านจาก `unit.settings.account.*` — D9) คำนวณตรงตามลำดับ `_CONVENTIONS` 2.1 (มี unit test ตัวเลขสตางค์เป๊ะทุกเคส รวมปัดเศษ)
- [ ] เงินทุก field เป็น Int สตางค์ — ไม่มี Float ใน schema/logic/API (grep ทั้งโมดูล)
- [ ] Split payment: Σ = grandTotal เป๊ะ, mismatch ถูกปฏิเสธ, เงินสด+โอนในบิลเดียวออกใบเสร็จถูก
- [ ] Idempotency: ยิง createSale ซ้ำ key เดิม 10 ครั้งพร้อมกัน (concurrent) → ได้บิลเดียว ผลตอบเหมือนกันทุกครั้ง
- [ ] **Concurrency เลขใบเสร็จ: 2+ เครื่องยิงขายพร้อมกัน 100 บิล → เลขไม่ชน ไม่ข้ามแบบผิดปกติ (load test จริง)**
- [ ] Void: สต็อกคืน + coupon.release + point.reverse + account.postVoid ครบทุก side effect · void หลังปิดกะถูก block
- [ ] PENDING_PAYMENT (D1): create → confirm (idempotent ด้วย paymentRef) → เลขใบเสร็จ/สต็อก/side effects + `pos.sale.paid` ครบ · expire cron → `pos.sale.expired` + ต้นทางปล่อย hold · confirm ซ้ำ/หลังหมดอายุถูก handle
- [ ] DEPOSIT (D2): settle หักมัดจำถูกใบ, หักเกินมูลค่าคงเหลือถูกปฏิเสธ, ฐาน VAT บิล settle ไม่ถูกลด, แต้มไม่ earn ซ้ำ (base = Σ payMethods ที่ไม่ใช่ DEPOSIT/ROOM_CHARGE)
- [ ] ใช้แต้มเป็นส่วนลด (D5): quoteBurn พรีวิวตรงกับ burn จริง · burn fail → บิล rollback ทั้งใบ · ลำดับ coupon → burn → total → VAT ตาม `_CONVENTIONS` 2.1
- [ ] ROOM_CHARGE (D12): เรียก hotel.chargeToRoom ใน tx, บิลไม่ยิง point/account, ปุ่มโชว์เฉพาะ tenant ที่มี HOTEL unit ACTIVE
- [ ] Refund บางส่วน: pro-rata ส่วนลด/VAT ถูกต้อง, refund เกินยอดคงเหลือถูก block, ใบเดิม status ขยับถูก
- [ ] เอกสาร immutable: ไม่มี endpoint/query ไหน UPDATE lines/payments/ยอดเงินหลัง commit (ตรวจ code review + test)
- [ ] เรียกจากโมดูลอื่น (จำลอง HOTEL): ไม่บังคับกะ, free-form lines ไม่แตะสต็อก, sourceId บังคับ, event voided/refunded ยิงออก

### Functional — Register/สต็อก/กะ
- [ ] Barcode scan → เพิ่มตะกร้า <300ms · สแกนซ้ำ qty+1 · barcode ไม่พบ → เสนอสร้างสินค้า (ถ้ามีสิทธิ์)
- [ ] ส่วนลด STAFF เกิน maxDiscountBp ถูก block ทั้ง UI และ API (ทดสอบยิง API ตรง)
- [ ] PromptPay QR: payload ผ่าน validator EMVCo + สแกนจ่ายได้จริงกับแอปธนาคาร ≥ 2 แอป
- [ ] พักบิล/เรียกคืนข้ามเครื่อง + race recall 2 เครื่องพร้อมกัน → ใบเดียวชนะ
- [ ] Stock ledger: ทุกการเปลี่ยน stockQty มี movement คู่กัน (reconcile script: replay ledger = cache เป๊ะ)
- [ ] Stock count ระหว่างมีขายแทรก → ยอดหลัง confirm ถูกตามสูตร 11.6
- [ ] เปิด-ปิดกะ: expectedCash คำนวณถูก (รวม float, เงินทอน, void เงินสด, refund เงินสด) · Z report freeze แล้วตัวเลขไม่เปลี่ยน · force-close cron ทำงาน + notify
- [ ] ใบเสร็จ 58/80mm พิมพ์ครบทุก field ตาม T1/T2 (ทดสอบเครื่องพิมพ์จริงอย่างน้อย 1 รุ่นต่อขนาด) · e-receipt เปิดจากมือถือได้ · reprint มีคำว่า "สำเนา"

### Isolation & Security
- [ ] **Tenant leak test: user ร้าน A ยิงทุก endpoint ด้วย id ของร้าน B → 404/403 ทั้งหมด**
- [ ] **Unit leak test: MANAGER unit 1 ยิง endpoint unit 2 (tenant เดียวกัน) → 403 · ขาย/ดูสินค้า/บิลข้าม unit ไม่ได้**
- [ ] deviceCode ถูก revoke → ทุก request ปฏิเสธ · idempotencyKey เดา/ชนข้าม unit ไม่ได้ (unique ต่อ unit)
- [ ] e-receipt token สุ่มพอ (cuid) ไม่ enumerable · หน้า public ไม่รั่วข้อมูล member เกิน snapshot
- [ ] AuditLog ครบทุก action เงิน/สต็อก/กะ: create/void/refund/adjust/count/close/settings
- [ ] Rate limit บน `POST /sales`, `/promptpay/qr`, `/sales/:id/void|refund`

### Integration (QC ไขว้กับโมดูลอื่น)
- [ ] point.earn/burn/reverse idempotent (ยิงซ้ำไม่บวก/หักซ้ำ) + earn รับ `amountSatang` (Point คำนวณแต้มเอง — POS ไม่ส่ง delta) — ทดสอบร่วมกับโมดูล 09
- [ ] member.recordSpend + activity.log ยิงผ่าน outbox หลังปิดบิล (จำลอง Member ล่ม → บิลไม่ล้ม, ฟื้นแล้ว sync ครบ) — ทดสอบร่วมกับโมดูล 06 (D6)
- [ ] coupon.redeem อยู่ใน tx เดียวกับ sale: บังคับ redeem fail → บิลไม่เกิด, คูปองไม่ถูกตัด — ทดสอบร่วมกับโมดูล 08 (+ มี coupon.release แล้ว)
- [ ] account.postSale/postRefund/postVoid: payload ครบตาม `_CONVENTIONS` 2.4 + POS ได้ `abbInvoiceNo` กลับมาแปะใบเสร็จ + **ไม่มี account code ใดๆ ในโค้ด POS (grep)** — ทดสอบร่วมกับโมดูล 12 (D3)
- [ ] retry queue: จำลอง Point ล่ม → บิลสำเร็จ, รายการเข้าคิว, ฟื้นแล้ว sync ครบ

### i18n & UX
- [ ] ทุกหน้า TH/EN สมบูรณ์ ไม่มี string hard-code · ตัวเลขเงินแสดง format ไทย (฿1,234.50)
- [ ] Empty/loading/error state ครบทุกหน้า (สินค้า 0 ชิ้น, กะยังไม่เปิด, offline banner)
- [ ] Register ใช้งานได้จริงบน tablet แนวนอน (เป้าหลัก) + มือถือ + desktop · ปุ่มชำระ/เงินทอนอ่านได้จากระยะ 1 เมตร
- [ ] วันตัดรายงาน = timezone ร้าน (ทดสอบบิลคร่อมเที่ยงคืน)
