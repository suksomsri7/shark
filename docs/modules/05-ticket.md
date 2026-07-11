# โมดูล 5: Ticket — ระบบตั๋ว/อีเวนต์ (05-ticket.md)

> 🔄 REVISED หลัง QC — สอดคล้อง RESOLUTIONS.md (2026-07-11)
> scope: **unit** (ทุกตารางมี `tenantId + unitId`) · ยึด `_CONVENTIONS.md` + `BLUEPRINT.md` + `BLUEPRINT_BUSINESS_UNITS.md`
> เงินทั้งหมด `Int` หน่วย**สตางค์** (satang) · เวลา `DateTime` UTC (แสดงผลตาม `unit.settings.timezone` default Asia/Bangkok)
> ชื่อ model นำหน้า `Event*` / `Ticket*` — **ห้ามใช้ชื่อ `Ticket` เปล่า** กันชนกับ `QueueTicket` (โมดูล Q) และ support ticket ใน backoffice

---

## 1. ภาพรวม + ขอบเขต

### ทำอะไร (v1 / MVP ✅)
โมดูลขายตั๋วอีเวนต์ครบวงจรสำหรับ SME ไทย: คอนเสิร์ตเล็ก, งานสัมมนา/เวิร์กช็อป, งานวัด/งานแฟร์, โชว์รอบการแสดง (มวย/คาบาเรต์/ละครเวที), ทัวร์รอบเวลา, งานวิ่ง/กิจกรรม

- สร้าง **Event** ที่มีได้**หลายรอบ (EventSession)** เช่น โชว์ 19:00 / 21:00 ทุกวัน หรือสัมมนา 3 วัน + ผูก **Venue** (สถานที่)
- **ประเภทตั๋ว (TicketType)**: ราคา, โควตาแยกต่อรอบ, ช่วงเวลาขาย (early bird / ราคาปกติ / หน้างาน), จำกัดจำนวนต่อออเดอร์และต่อสมาชิก
- **ขายออนไลน์บน storefront**: เลือกรอบ → เลือกประเภทตั๋ว → จำนวน → ใส่ข้อมูลผู้ซื้อ/คูปอง → ชำระเงินผ่าน **POS contract 2.1** → ได้ตั๋ว QR ทางอีเมล + หน้า "ตั๋วของฉัน"
- **ขายหน้างาน (box office)**: staff เปิดหน้าขายใน dashboard, รับเงินสด/โอน/PromptPay ผ่าน POS, ออกตั๋วทันที (พิมพ์/แสดง QR)
- ที่นั่ง v1 = **General Admission (ยืน/นั่งอิสระ)** + **Zone-based** (โซน A/B/VIP — ตั๋วระบุโซน ไม่ระบุเลขที่นั่ง)
- **ออกตั๋ว QR**: 1 ใบ = 1 `qrToken` unique (opaque, สุ่ม, เดาไม่ได้) — ตั๋วไม่ผูกกับ payload ที่ decode ได้
- **Check-in scanner**: PWA ใช้กล้องมือถือของ staff สแกน QR, กันสแกนซ้ำ realtime (atomic ที่ DB), นับยอดเข้างานสดต่อรอบ/โซน/ประตู
- **ยกเลิก/refund/void**: refund policy ต่อ event (หน้าต่างเวลา + ค่าธรรมเนียม %), void ตั๋วรายใบ, ยกเลิกทั้งรอบ (mass refund)
- **Dashboard realtime**: ยอดขายต่อรอบ/ประเภท, ตั๋วคงเหลือ, ยอดเช็คอินสด
- **รายงาน**: ยอดขาย, attendance rate, no-show, conversion (view → order), ช่องทางขาย
- ผูกโมดูลแกนกลาง: **Member** (ผู้ซื้อ = memberId), **Point** (POS คิดให้), **Coupon** (ส่งโค้ดเข้า POS), **Account** (POS posting ให้), **Notification** (ส่งตั๋ว/เตือนก่อนงาน)

### ไม่ทำใน v1 (Phase ถัดไป 🔜)
- **Seatmap รายที่นั่ง** (เลือกเก้าอี้บนผัง) — วาง schema เผื่อไว้แล้ว (`admissionMode = SEAT`, `EventSeat`)
- **Rotating QR code** กัน screenshot ซ้ำ (โค้ดหมุนทุก 30 วิ ใน wallet/หน้าเว็บ)
- **Offline-tolerant scanner** (โหลด manifest ตั๋วล่วงหน้า, สแกนออฟไลน์, sync ทีหลัง + conflict resolution)
- **โอนตั๋วให้คนอื่น** (transfer: ตั๋วเดิม VOID → ออกใบใหม่ให้ผู้รับ)
- **Waitlist เมื่อเต็ม** (จองสิทธิ์ → มีตั๋วหลุด → แจ้งเตือน + หน้าต่างซื้อจำกัดเวลา)
- ตั๋วแบบ subscription/season pass, บัตรเข้าได้หลายครั้ง (multi-entry), add-on ต่อตั๋ว (เสื้อ/อาหาร), ที่จอดรถ
- Reserved capacity สำหรับ invite/guest list แบบ workflow เต็ม (v1 ใช้ตั๋วประเภท HIDDEN + ขายหน้างานราคา 0 แทนได้)
- ขายผ่าน API ภายนอก / affiliate / embed widget

### สิ่งที่โมดูลนี้**ไม่ทำเอง** (มอบให้ contract)
- ไม่แตะเงินตรง: ทุกการรับเงิน/คืนเงินวิ่งผ่าน POS (`createSale` / refund sale)
- ไม่คำนวณแต้ม, ไม่ตรวจคูปองเอง, ไม่เขียนตารางบัญชี — ยิง contract 2.1–2.4 เท่านั้น
- ไม่ส่งอีเมล/LINE เอง — เรียก `notify()` (contract 2.5)

---

## 2. Persona & User Stories

### Persona
| Persona | บทบาท | ตัวอย่าง |
|---|---|---|
| **Owner** | เจ้าขององค์กร (ทุก unit) | เจ้าของโรงละคร มีหน่วย "โรงละคร" (TICKET) + "ร้านอาหาร" |
| **Manager** | ผู้จัดการหน่วยอีเวนต์ | ผู้จัดการโรงละคร: สร้างงาน ตั้งราคา อนุมัติ refund |
| **Staff — Box office** | พนักงานขายหน้างาน | ขายตั๋ว walk-in, void/reissue เมื่อได้รับสิทธิ์ |
| **Staff — Gate** | พนักงานหน้าประตู | ถือมือถือสแกนตั๋วอย่างเดียว (สิทธิ์แคบสุด) |
| **Customer** | ลูกค้า (User + CustomerProfile) | ซื้อตั๋วบน storefront, ดูตั๋วในมือถือ, สะสมแต้ม |

### User Stories (MVP ✅)
- ในฐานะ **Manager** ฉันสร้างอีเวนต์ "คอนเสิร์ตปีใหม่" 2 รอบ (31 ธ.ค. 19:00 / 22:00) ที่ลานหน้าห้าง, ตั้งตั๋ว Early Bird 500฿ (ขายถึง 15 ธ.ค., 100 ใบ/รอบ) + Regular 800฿ + VIP โซนหน้าเวที 1,500฿ (50 ใบ/รอบ) ได้ใน 10 นาที
- ในฐานะ **Customer** ฉันเปิดหน้า storefront ของร้าน, เลือกงาน → รอบ 22:00 → Early Bird 2 ใบ + ใส่โค้ดคูปอง → จ่าย PromptPay → ได้อีเมลตั๋ว QR 2 ใบทันที และเปิดดูจากมือถือได้โดยไม่ต้องติดตั้งแอป
- ในฐานะ **Customer** ที่ยังไม่ login ฉันซื้อแบบ guest ด้วยอีเมลได้ (ระบบสร้าง/ผูก member ให้จากอีเมล)
- ในฐานะ **Staff box office** ฉันขายตั๋วหน้างานให้ลูกค้า walk-in รับเงินสด และตั๋ว QR ขึ้นจอ/พิมพ์สลิปให้ลูกค้าใน 30 วินาที
- ในฐานะ **Staff gate** ฉันเปิด PWA สแกนตั๋ว เห็นเขียว "ผ่าน — VIP โซน A" หรือแดง "ตั๋วนี้ใช้แล้ว 19:02 ประตู 1" ภายใน 1 วินาที และเห็นยอดคนเข้าสดมุมจอ
- ในฐานะ **Manager** ฉันเห็นกราฟยอดขายสดระหว่างเปิดขาย และเมื่องานเลิกฉันได้รายงาน attendance ต่อรอบ/ประเภทตั๋ว
- ในฐานะ **Manager** เมื่อวงดนตรียกเลิก ฉันกดยกเลิกรอบ 22:00 → ระบบ void ตั๋วทุกใบ, สร้างรายการคืนเงิน, แจ้งลูกค้าทุกคนอัตโนมัติ
- ในฐานะ **Customer** ฉันขอ refund ภายในหน้าต่างที่ policy อนุญาต จากหน้า "ตั๋วของฉัน" ได้เอง
- ในฐานะ **Owner** ฉันเห็นยอดขายตั๋วรวมเข้า dashboard "ทุกกิจการ" และแต้มที่ลูกค้าได้จากการซื้อตั๋วรวมกับแต้มจากร้านอาหารของฉัน

### User Stories (🔜)
- ในฐานะ **Customer** ฉันโอนตั๋วให้เพื่อนด้วยอีเมลของเพื่อน — ตั๋วเดิมใช้ไม่ได้อีก
- ในฐานะ **Customer** เมื่อรอบเต็ม ฉันกด "แจ้งเตือนเมื่อมีตั๋วว่าง" และได้สิทธิ์ซื้อก่อนเมื่อมีคน refund
- ในฐานะ **Staff gate** ฉันสแกนต่อได้แม้เน็ตหลุด และระบบ sync เมื่อกลับมา
- ในฐานะ **Customer** ฉันเลือกที่นั่ง K12 บนผังที่นั่งได้

---

## 3. ฟังก์ชันทั้งหมด (Feature List)

### 3.1 Venue & Event ✅
- ✅ CRUD Venue (ชื่อ, ที่อยู่, ลิงก์แผนที่, ความจุอ้างอิง, หมายเหตุการเดินทาง) — reuse ข้าม event ภายใน unit
- ✅ CRUD Event: ชื่อ, slug, คำอธิบาย (rich text), รูป cover + แกลเลอรี, venue, ผู้จัด/ติดต่อ, เงื่อนไขงาน (อายุ/ของต้องห้าม), refund policy, `maxPerOrder`
- ✅ สถานะ event: `DRAFT → PUBLISHED → (PAUSED ↔ PUBLISHED) → ENDED / CANCELLED → ARCHIVED` — DRAFT มองไม่เห็นบน storefront, PAUSED เห็นแต่ปิดปุ่มซื้อ
- ✅ `admissionMode`: `GENERAL` (ตั๋วไม่ระบุโซน) | `ZONE` (ตั๋วผูกโซน) — เลือกตอนสร้าง, ล็อกหลังมีออเดอร์แรก
- 🔜 `SEAT` (seatmap รายที่นั่ง)

### 3.2 รอบการแสดง (Session) ✅
- ✅ หลายรอบต่อ event: `startAt`, `endAt`, `doorOpenAt` (เวลาเปิดประตู), ชื่อรอบ (optional เช่น "รอบสื่อ")
- ✅ สร้างรอบซ้ำเป็นชุด (bulk: ทุกวัน ศ–อา 19:00 ช่วง 1–31 ม.ค.) — เครื่องมือใน UI, ไม่มี recurring engine ใน DB (แต่ละรอบเป็น row อิสระ)
- ✅ สถานะรอบ: `SCHEDULED | CANCELLED | COMPLETED` — ยกเลิกรอบ = trigger mass void/refund (flow 7.6)
- ✅ ความจุรอบ (capacity รวม) optional เป็นเพดานเสริมเหนือผลรวมโควตาตั๋ว
- ✅ ปิดขายอัตโนมัติ: ค่า default ปิดขายออนไลน์เมื่อ `startAt` ผ่านไป (config ต่อ event: ขายได้ถึงกี่นาทีหลังเริ่ม สำหรับงานที่เข้าได้ตลอด)

### 3.3 โซน (Zone) ✅
- ✅ CRUD โซนต่อ event (ชื่อ, ความจุ, สี label, sortOrder) — ใช้เมื่อ `admissionMode = ZONE`
- ✅ TicketType ผูกโซนได้ 1 โซน (ตั๋ว VIP → โซน VIP) — ความจุโซน = เพดานรวมของทุก type ในโซนนั้นต่อรอบ
- ✅ ตั๋วที่ออกระบุโซนชัดบนหน้าตั๋ว + ผล scan บอกโซนให้ staff ชี้ทาง

### 3.4 ประเภทตั๋ว (TicketType) ✅
- ✅ ต่อ event: ชื่อ (Early Bird/Regular/VIP/เด็ก), คำอธิบาย, ราคา (สตางค์), โซน (ถ้า ZONE)
- ✅ **โควตาแยกต่อรอบ** ผ่าน `TicketAllocation` (session × type): quota, soldCount, reservedCount + override ราคาเฉพาะรอบได้ (รอบวันธรรมดาถูกกว่า)
- ✅ **ช่วงขาย**: `salesStartAt` / `salesEndAt` ต่อ type → ทำ early bird ด้วยการตั้ง type แยก + ช่วงเวลาขายไม่ทับ (แนวทางแนะนำใน UI: wizard "สร้างชุด Early Bird → Regular" ให้อัตโนมัติ)
- ✅ **จำกัดต่อคน**: `maxPerOrder` (ต่อออเดอร์) + `maxPerMember` (สะสมต่อ member ต่อ event — ตรวจตอน checkout จากตั๋วสถานะไม่ VOID/REFUNDED)
- ✅ `minPerOrder` (แพ็กคู่ ขั้นต่ำ 2)
- ✅ visibility: `PUBLIC | HIDDEN` — HIDDEN ไม่แสดง storefront แต่ staff ขายหน้างานได้ (ใช้ทำบัตรเชิญ/สื่อ ราคา 0 ได้)
- ✅ `channel`: `ALL | ONLINE_ONLY | ONSITE_ONLY` (ตั๋วหน้างานราคาแพงกว่า แยก type)
- ✅ เรียงลำดับแสดงผล, ปิดขายชั่วคราวต่อ type (status)
- 🔜 access code ต่อ type (presale code), bundle (ตั๋ว+ของ)

### 3.5 ขายออนไลน์ (Storefront) ✅
- ✅ หน้า list อีเวนต์ของ unit + หน้า event detail (SEO-ready: OpenGraph, schema.org `Event`)
- ✅ Flow ซื้อ: เลือกรอบ (แสดงสถานะ เหลือน้อย/เต็ม) → เลือกประเภท+จำนวน (ตรวจ min/max สด) → ฟอร์มผู้ซื้อ (ชื่อ อีเมล เบอร์; ถ้า login = prefill จาก member) → คูปอง → สรุปราคา → จ่ายเงิน
- ✅ **Hold โควตา 15 นาที** ตอนกดไปหน้าจ่ายเงิน (`TicketOrder` สถานะ `PENDING` + `holdExpiresAt`, atomic reserve — ดู 11.1) — หมดเวลา = คืนโควตา (trigger หลักจาก event `pos.sale.expired` — ดู 7.1)
- ✅ ชำระเงินผ่าน POS contract 2.1 (`sourceModule: 'TICKET'`, **`paymentMode:'PENDING_PAYMENT'`** — D1): POS สร้าง sale สถานะ PENDING_PAYMENT + `PosPaymentIntent` (PromptPay QR / โอนแนบสลิป, expireAt = holdExpiresAt) — ยืนยันเงินเข้า v1 = staff/FINANCE ยืนยันสลิป (gateway webhook 🔜)
- ✅ POS ยืนยันเงินเข้า → emit **`pos.sale.paid {saleId, sourceModule:'TICKET', sourceId: orderId}`** → Ticket ออกตั๋ว (1 ใบ/ที่) + อีเมลตั๋ว (contract 2.5) + หน้า confirmation แสดงตั๋วทันที
- ✅ **หน้า "ตั๋วของฉัน"** บน storefront (customer login): ตั๋วที่กำลังมาถึง/ที่ผ่านไป, เปิด QR เต็มจอ, ปุ่มขอ refund (ตาม policy), ดาวน์โหลด PDF
- ✅ guest checkout: ไม่บังคับ login — ผูก/สร้าง member จากอีเมล + ลิงก์ดูตั๋วแบบ signed (magic link ในอีเมล)
- ✅ นับ view ต่อ event/รอบ (สำหรับ conversion report)
- 🔜 waitlist เมื่อรอบเต็ม, โอนตั๋ว, Apple/Google Wallet pass

### 3.6 ขายหน้างาน (Box office) ✅
- ✅ หน้าขายใน dashboard: เลือกรอบ → แตะประเภท/จำนวน → (ผูก member ด้วยเบอร์/สแกนบัตรสมาชิก optional) → ชำระผ่าน POS (เงินสด/โอน/PromptPay/บัตร) → ตั๋วออกทันที
- ✅ ออกตั๋วแบบ: แสดง QR บนจอให้ลูกค้าถ่าย / ส่งอีเมล / พิมพ์ (ใช้เครื่องพิมพ์สลิปของ POS — ตั๋ว 1 ใบ = สลิป 1 ใบ มี QR)
- ✅ ขาย type HIDDEN ได้ (บัตรเชิญ), ราคา 0 ได้ (ยังสร้าง PosSale ยอด 0 เพื่อ audit)
- ✅ เคารพโควตาเดียวกับออนไลน์ (atomic เดียวกัน) — ไม่มีโควตาแยก เว้นแต่ตั้ง type `ONSITE_ONLY`

### 3.7 ตั๋ว QR ✅
- ✅ ตั๋ว 1 ใบ = `qrToken` unique 128-bit random (base62 ~22 ตัวอักษร) — **ไม่ encode ข้อมูลใดๆ ใน QR** (opaque token, กันปลอม/กันเดา)
- ✅ `ticketNo` มนุษย์อ่านได้ (`@@unique([unitId, ticketNo])` เช่น `TK-250111-0042`) สำหรับค้นหา/พูดทางโทรศัพท์
- ✅ หน้าตั๋ว (เว็บ + PDF + อีเมล): ชื่องาน, รอบ (วันเวลา+เปิดประตู), ประเภท+โซน, ชื่อผู้ถือ (optional), QR, ticketNo, เงื่อนไขงาน, แผนที่ venue
- ✅ ใส่ชื่อผู้เข้าร่วมรายใบได้ (attendeeName — optional ต่อ event: OFF / OPTIONAL / REQUIRED)
- 🔜 rotating code: QR = token + TOTP หมุน 30 วิ, scanner ตรวจ token+code — กัน screenshot แชร์กันเข้า (ตั๋วสถิต v1 กันด้วย "สแกนซ้ำ = แดงทันที" อยู่แล้ว)

### 3.8 Check-in Scanner (PWA) ✅
- ✅ PWA `/app/u/[unitSlug]/ticket/scan` — mobile-first, ใช้กล้องผ่าน `getUserMedia` + BarcodeDetector (fallback jsQR), ปุ่มไฟฉาย, โหมดพิมพ์ ticketNo มือ
- ✅ เลือก context ก่อนสแกน: event → รอบ (default รอบที่กำลังจะเริ่ม) → ชื่อประตู (gate, free text จาก preset)
- ✅ ผล scan < 1 วิ: **เขียว** ผ่าน (ประเภท+โซน+ชื่อ) / **แดง**: ใช้แล้ว (บอกเวลา+ประตูเดิม), void, refund แล้ว, ผิดรอบ (บอกรอบที่ถูก), ผิดงาน, token ไม่รู้จัก / **เหลือง**: มาก่อนเวลาเปิดประตู (staff กด override ได้ถ้ามีสิทธิ์)
- ✅ **กันสแกนซ้ำ realtime แบบ atomic ที่ DB** (conditional update ใบเดียว — ดู 11.2) — สองเครื่องสแกนใบเดียวพร้อมกัน มีเครื่องเดียวเขียว
- ✅ ตัวนับสด: เข้าแล้ว x / ทั้งหมด y ของรอบ (+ ต่อโซน) — SSE
- ✅ ทุก scan ลง `TicketCheckin` log (รวมที่ fail — ใช้สืบเคสตั๋วปลอม/screenshot)
- ✅ check-out (สแกนออก) ไม่มีใน v1 — งาน SME เข้าอย่างเดียว; ปุ่ม "ยกเลิกการเช็คอิน" (undo ภายใน 5 นาที, MANAGER ขึ้นไป) มีไว้แก้สแกนผิดคน
- 🔜 offline-tolerant: โหลด manifest ตั๋วของรอบ (id+token hash+status) ลง IndexedDB, สแกน offline ตัดสินจาก local, คิว sync ขึ้น server, conflict = ยึด server และแจ้งรายการชน

### 3.9 ยกเลิก / Refund / Void ✅
- ✅ **Refund policy ต่อ event**: อนุญาต/ไม่อนุญาต, ขอได้ถึง X ชั่วโมงก่อนรอบเริ่ม, ค่าธรรมเนียม Y% (ปัดลงเป็นสตางค์), ข้อความ policy แสดงก่อนซื้อ
- ✅ ลูกค้าขอ refund เอง (ในหน้าต่าง policy, ทั้งออเดอร์หรือรายใบ) → เข้า state `REFUND_REQUESTED` → Manager อนุมัติ/ปฏิเสธ | ตั้ง auto-approve ได้ต่อ event
- ✅ Refund โดยร้าน (ตลอดเวลา ไม่ติด policy): รายใบหรือทั้งออเดอร์ พร้อมเหตุผล
- ✅ กลไก: ตั๋ว → `REFUNDED`, คืนโควตา allocation, refund ผ่าน **`pos.refundSale`** อ้าง saleId เดิม (POS ออกเอกสาร refund — ใบเสร็จ immutable ตามกติกากลาง — และ emit `pos.sale.refunded`), POS กลับรายการแต้ม/บัญชี/คูปองให้
- ✅ **Void** (ยกเลิกตั๋วโดยไม่คืนเงิน — เคสทุจริต/ออกผิด): ตั๋ว → `VOID` + เหตุผลบังคับ + audit log; คืนโควตาเป็นค่า default (เลือกไม่คืนได้)
- ✅ **ยกเลิกทั้งรอบ**: confirm 2 ชั้น → void ตั๋วทุกใบเป็น batch, สร้าง refund ทุกออเดอร์ที่จ่ายแล้ว, notify ลูกค้าทุกคน, รอบ → `CANCELLED`
- ✅ ตั๋วที่ `USED` แล้ว refund ไม่ได้จากหน้า customer (ร้าน override ได้)
- 🔜 refund บางส่วนแบบ voucher เครดิตร้าน (contract Coupon/Voucher)

### 3.10 โอนตั๋ว 🔜 (สเปคไว้ล่วงหน้า)
- 🔜 ผู้ถือกด "โอน" ใส่อีเมลผู้รับ → สร้าง `TicketTransfer` (PENDING, หมดอายุ 48 ชม.) → ผู้รับกดรับ → ตั๋วเดิม `TRANSFERRED` (token ตาย) + ออกใบใหม่ token ใหม่ผูก member ผู้รับ — ประวัติ chain เก็บครบ
- 🔜 ต่อ event: เปิด/ปิดการโอน, ปิดโอนก่อนงาน X ชม.

### 3.11 Waitlist 🔜 (สเปคไว้ล่วงหน้า)
- 🔜 รอบ/type เต็ม → ปุ่ม "แจ้งเตือนเมื่อว่าง" (email + จำนวนที่ต้องการ) → มีโควตาคืน (refund/void/หมด hold) → แจ้ง FIFO เป็น batch พร้อมลิงก์ซื้อพิเศษถือสิทธิ์ 2 ชม. → ไม่ซื้อ = ตกไป คนถัดไป

### 3.12 Dashboard & รายงาน ✅
- ดูหัวข้อ 10

---

## 4. Data Model (Prisma)

> ทุก model: scope unit (`tenantId + unitId`), เงิน Int สตางค์, `createdAt/updatedAt`, ไม่มี hard delete ข้อมูลธุรกรรม
> ความสัมพันธ์ไป `Tenant`/`BusinessUnit`/`User` อ้างด้วย id string (relation จริงประกาศที่ schema กลาง) — ในโมดูลนี้ประกาศ relation เฉพาะภายในโมดูล

```prisma
// ───────────────────────── enums ─────────────────────────

enum EventStatus {
  DRAFT       // ยังไม่เผยแพร่
  PUBLISHED   // ขายอยู่บน storefront
  PAUSED      // แสดงอยู่แต่ปิดปุ่มซื้อชั่วคราว
  ENDED       // รอบสุดท้ายจบแล้ว (ระบบตั้งให้อัตโนมัติ)
  CANCELLED   // ยกเลิกทั้งงาน
  ARCHIVED    // เก็บเข้ากรุ (ซ่อนจาก list ปกติ)
}

enum EventAdmissionMode {
  GENERAL   // ✅ ไม่ระบุที่นั่ง
  ZONE      // ✅ ระบุโซน
  SEAT      // 🔜 seatmap รายที่นั่ง (ห้ามใช้ใน v1 — UI ไม่เปิดให้เลือก)
}

enum EventSessionStatus {
  SCHEDULED
  CANCELLED
  COMPLETED
}

enum TicketTypeStatus {
  ACTIVE
  PAUSED      // ปิดขายชั่วคราว
  ARCHIVED
}

enum TicketTypeVisibility {
  PUBLIC    // แสดงบน storefront
  HIDDEN    // ขายได้เฉพาะหน้างาน/ภายใน (บัตรเชิญ)
}

enum TicketSalesChannel {
  ALL
  ONLINE_ONLY
  ONSITE_ONLY
}

enum TicketOrderStatus {
  PENDING            // hold โควตาอยู่ รอจ่าย (holdExpiresAt)
  PAID
  EXPIRED            // hold หมดเวลา — โควตาถูกคืนแล้ว
  CANCELLED          // ยกเลิกก่อนจ่าย
  REFUND_REQUESTED   // ลูกค้าขอคืนเงิน รอร้านอนุมัติ
  REFUNDED           // คืนเงินทั้งออเดอร์
  PARTIALLY_REFUNDED // คืนเงินบางใบ
}

enum TicketOrderChannel {
  ONLINE   // storefront
  ONSITE   // box office หน้างาน
}

enum EventTicketStatus {
  VALID
  USED
  VOID          // ยกเลิกโดยร้าน ไม่คืนเงิน
  REFUNDED
  TRANSFERRED   // 🔜 ถูกโอนออก (token ใช้ไม่ได้แล้ว)
}

enum TicketCheckinResult {
  OK
  DUPLICATE       // สแกนซ้ำ
  INVALID_TOKEN   // token ไม่พบ
  WRONG_SESSION   // ตั๋วรอบอื่น
  WRONG_EVENT
  NOT_YET_OPEN    // ก่อนเวลาเปิดประตู (ยังไม่ override)
  VOIDED          // ตั๋ว VOID/REFUNDED/TRANSFERRED
  UNDONE          // ถูก undo การเช็คอิน (log แถวใหม่)
}

// ───────────────────────── สถานที่ ─────────────────────────

model EventVenue {
  id        String   @id @default(cuid())
  tenantId  String
  unitId    String
  name      String
  address   String?
  mapUrl    String?            // ลิงก์ Google Maps
  capacity  Int?               // ความจุอ้างอิง (ไม่บังคับใช้)
  note      String?            // การเดินทาง/ที่จอดรถ
  archivedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  events    Event[]

  @@unique([unitId, name])
  @@index([tenantId])
  @@index([unitId])
}

// ───────────────────────── อีเวนต์ ─────────────────────────

model Event {
  id             String             @id @default(cuid())
  tenantId       String
  unitId         String
  venueId        String?
  venue          EventVenue?        @relation(fields: [venueId], references: [id])

  slug           String             // URL storefront — immutable หลัง publish
  title          String
  description    String?            // rich text (HTML sanitized)
  coverImageUrl  String?
  galleryUrls    Json               @default("[]")
  organizerName  String?
  organizerContact String?
  terms          String?            // เงื่อนไขการเข้างาน

  admissionMode  EventAdmissionMode @default(GENERAL) // ล็อกหลังมีออเดอร์แรก
  status         EventStatus        @default(DRAFT)

  // refund policy
  refundAllowed      Boolean @default(false)
  refundWindowHours  Int     @default(24)   // ขอได้ถึงกี่ ชม. ก่อนรอบเริ่ม
  refundFeePercent   Int     @default(0)    // 0–100, หักค่าธรรมเนียม
  refundAutoApprove  Boolean @default(false)
  refundPolicyText   String?                // ข้อความแสดงลูกค้า

  maxPerOrder    Int      @default(10)      // เพดานรวมทุก type ต่อออเดอร์
  attendeeNameMode String @default("OFF")   // OFF | OPTIONAL | REQUIRED
  onlineSaleCutoffMin Int @default(0)       // ขายออนไลน์ได้ถึง startAt + X นาที (0 = ปิดตอนเริ่ม)
  transferAllowed Boolean @default(false)   // 🔜 ใช้จริงเฟสโอนตั๋ว

  viewCount      Int      @default(0)       // นับ view หยาบ (เพิ่มแบบ throttled)
  publishedAt    DateTime?
  archivedAt     DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  sessions       EventSession[]
  zones          EventZone[]
  ticketTypes    TicketType[]
  orders         TicketOrder[]
  tickets        EventTicket[]

  @@unique([unitId, slug])
  @@index([tenantId])
  @@index([unitId, status])
}

model EventSession {
  id         String             @id @default(cuid())
  tenantId   String
  unitId     String
  eventId    String
  event      Event              @relation(fields: [eventId], references: [id])

  name       String?            // "รอบบ่าย", "รอบสื่อ"
  startAt    DateTime
  endAt      DateTime
  doorOpenAt DateTime?          // default = startAt - 60 นาที (ตั้งใน UI)
  capacity   Int?               // เพดานรวมของรอบ (optional, เหนือผลรวม allocation)
  status     EventSessionStatus @default(SCHEDULED)
  cancelledAt DateTime?
  cancelReason String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  allocations TicketAllocation[]
  orders      TicketOrder[]
  tickets     EventTicket[]
  checkins    TicketCheckin[]

  @@index([tenantId])
  @@index([unitId])
  @@index([eventId, startAt])
}

model EventZone {
  id        String  @id @default(cuid())
  tenantId  String
  unitId    String
  eventId   String
  event     Event   @relation(fields: [eventId], references: [id])
  name      String            // "A", "VIP หน้าเวที"
  capacity  Int               // เพดานรวมของโซนต่อรอบ
  colorTag  String?           // label ขาวดำ/เทา ตาม design system
  sortOrder Int     @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  ticketTypes TicketType[]
  tickets     EventTicket[]

  @@unique([eventId, name])
  @@index([tenantId])
  @@index([unitId])
}

// ───────────────────────── ประเภทตั๋ว + โควตา ─────────────────────────

model TicketType {
  id           String               @id @default(cuid())
  tenantId     String
  unitId       String
  eventId      String
  event        Event                @relation(fields: [eventId], references: [id])
  zoneId       String?              // บังคับมีเมื่อ event.admissionMode = ZONE
  zone         EventZone?           @relation(fields: [zoneId], references: [id])

  name         String               // "Early Bird", "VIP"
  description  String?
  priceSatang  Int                  // ราคา v1 THB เท่านั้น
  currency     String  @default("THB")

  salesStartAt DateTime?            // null = เริ่มขายทันทีที่ publish
  salesEndAt   DateTime?            // null = ตาม onlineSaleCutoff ของรอบ
  minPerOrder  Int     @default(1)
  maxPerOrder  Int     @default(10)
  maxPerMember Int?                 // สะสมต่อ member ต่อ event (null = ไม่จำกัด)

  visibility   TicketTypeVisibility @default(PUBLIC)
  channel      TicketSalesChannel   @default(ALL)
  status       TicketTypeStatus     @default(ACTIVE)
  sortOrder    Int     @default(0)
  archivedAt   DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  allocations  TicketAllocation[]
  orderItems   TicketOrderItem[]
  tickets      EventTicket[]

  @@unique([eventId, name])
  @@index([tenantId])
  @@index([unitId])
}

// โควตาต่อ (รอบ × ประเภทตั๋ว) — หัวใจของการกันขายเกิน
model TicketAllocation {
  id             String       @id @default(cuid())
  tenantId       String
  unitId         String
  sessionId      String
  session        EventSession @relation(fields: [sessionId], references: [id])
  ticketTypeId   String
  ticketType     TicketType   @relation(fields: [ticketTypeId], references: [id])

  quota          Int          // จำนวนขายได้ของ type นี้ในรอบนี้
  soldCount      Int @default(0)      // ตั๋วที่จ่ายแล้ว (VALID/USED)
  reservedCount  Int @default(0)      // hold อยู่ (order PENDING)
  priceOverrideSatang Int?             // ราคาเฉพาะรอบ (null = ใช้ราคา type)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  orderItems     TicketOrderItem[]

  @@unique([sessionId, ticketTypeId])
  @@index([tenantId])
  @@index([unitId])
}

// ───────────────────────── ออเดอร์ ─────────────────────────

model TicketOrder {
  id          String             @id @default(cuid())
  tenantId    String
  unitId      String
  eventId     String
  event       Event              @relation(fields: [eventId], references: [id])
  sessionId   String             // 1 ออเดอร์ = 1 รอบ (ซื้อหลายรอบ = หลายออเดอร์ — ตัดปัญหา refund/quota ปน)
  session     EventSession       @relation(fields: [sessionId], references: [id])

  orderNo     String             // "TO-250111-0001" running ต่อ unit ต่อวัน
  channel     TicketOrderChannel
  status      TicketOrderStatus  @default(PENDING)

  memberId    String?            // contract 2.6 — guest จะถูกผูก member จากอีเมลตอนจ่ายสำเร็จ
  buyerName   String             // snapshot บนเอกสาร (อนุญาตตามกติกากลาง)
  buyerEmail  String
  buyerPhone  String?

  subtotalSatang Int
  discountSatang Int @default(0)
  totalSatang    Int
  couponCode     String?         // ส่งต่อให้ POS validate/redeem — โมดูลนี้ไม่ตัดสินเอง

  saleId      String?            // PosSale id จาก POS (contract 2.1)
  receiptNo   String?            // snapshot เลขใบเสร็จจาก POS
  soldByUserId String?           // staff ที่ขาย (ONSITE)

  holdExpiresAt DateTime?        // PENDING เท่านั้น — default now()+15 นาที
  paidAt       DateTime?
  cancelledAt  DateTime?
  refundedAt   DateTime?
  refundReason String?
  guestAccessToken String? @unique // signed token สำหรับ guest เปิดดูตั๋ว (ส่งในอีเมล)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  items       TicketOrderItem[]
  tickets     EventTicket[]

  @@unique([unitId, orderNo])
  @@index([tenantId])
  @@index([unitId, status])
  @@index([sessionId, status])
  @@index([memberId])
  @@index([status, holdExpiresAt])   // สำหรับ cron เก็บ hold หมดอายุ
}

model TicketOrderItem {
  id             String           @id @default(cuid())
  tenantId       String
  unitId         String
  orderId        String
  order          TicketOrder      @relation(fields: [orderId], references: [id])
  ticketTypeId   String
  ticketType     TicketType       @relation(fields: [ticketTypeId], references: [id])
  allocationId   String
  allocation     TicketAllocation @relation(fields: [allocationId], references: [id])

  qty            Int
  unitPriceSatang Int             // snapshot ราคาตอนซื้อ (รวม override แล้ว)
  lineTotalSatang Int
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  tickets        EventTicket[]

  @@index([tenantId])
  @@index([unitId])
  @@index([orderId])
}

// ───────────────────────── ตั๋วรายใบ ─────────────────────────

model EventTicket {
  id           String            @id @default(cuid())
  tenantId     String
  unitId       String
  eventId      String
  event        Event             @relation(fields: [eventId], references: [id])
  sessionId    String
  session      EventSession      @relation(fields: [sessionId], references: [id])
  orderId      String
  order        TicketOrder       @relation(fields: [orderId], references: [id])
  orderItemId  String
  orderItem    TicketOrderItem   @relation(fields: [orderItemId], references: [id])
  ticketTypeId String
  ticketType   TicketType        @relation(fields: [ticketTypeId], references: [id])
  zoneId       String?           // snapshot จาก type ตอนออกตั๋ว
  zone         EventZone?        @relation(fields: [zoneId], references: [id])
  memberId     String?           // ผู้ถือ (default = ผู้ซื้อ; เปลี่ยนเมื่อโอน 🔜)

  ticketNo     String            // "TK-250111-0042" — มนุษย์อ่าน/ค้นหา
  qrToken      String  @unique   // opaque 128-bit random base62 — ห้าม encode ข้อมูล
  attendeeName String?
  priceSatang  Int               // snapshot ราคาต่อใบ (ใช้ refund รายใบ)

  status       EventTicketStatus @default(VALID)
  usedAt       DateTime?
  usedGate     String?
  usedByUserId String?           // staff ที่สแกน
  voidedAt     DateTime?
  voidReason   String?
  refundedAt   DateTime?
  // seatId    String?           // 🔜 SEAT mode
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  checkins     TicketCheckin[]

  @@unique([unitId, ticketNo])
  @@index([tenantId])
  @@index([unitId])
  @@index([sessionId, status])
  @@index([orderId])
  @@index([memberId])
}

// log ทุกครั้งที่สแกน (รวม fail — ใช้สืบตั๋วปลอม/ซ้ำ)
model TicketCheckin {
  id              String              @id @default(cuid())
  tenantId        String
  unitId          String
  sessionId       String
  session         EventSession        @relation(fields: [sessionId], references: [id])
  ticketId        String?             // null ได้กรณี INVALID_TOKEN
  ticket          EventTicket?        @relation(fields: [ticketId], references: [id])
  scannedToken    String              // token ที่ยิงเข้ามา (เก็บไว้สืบเคส)
  result          TicketCheckinResult
  gate            String?
  scannedByUserId String
  deviceInfo      String?             // UA/รุ่นเครื่อง (debug)
  createdAt       DateTime @default(now())

  @@index([tenantId])
  @@index([unitId])
  @@index([sessionId, createdAt])
  @@index([ticketId])
}
```

### 🔜 Models เฟสถัดไป (ยังไม่ migrate ใน v1 — วางไว้กันออกแบบชน)

```prisma
// 🔜 โอนตั๋ว
model TicketTransfer {
  id            String   @id @default(cuid())
  tenantId      String
  unitId        String
  fromTicketId  String            // ตั๋วเดิม → TRANSFERRED
  toTicketId    String?           // ตั๋วใหม่ที่ออกให้ผู้รับ
  toEmail       String
  status        String            // PENDING | ACCEPTED | EXPIRED | CANCELLED
  expiresAt     DateTime
  acceptedAt    DateTime?
  createdAt     DateTime @default(now())
  @@index([unitId, status])
}

// 🔜 waitlist
model TicketWaitlistEntry {
  id           String   @id @default(cuid())
  tenantId     String
  unitId       String
  sessionId    String
  ticketTypeId String?           // null = type ไหนก็ได้ของรอบนี้
  memberId     String?
  email        String
  qtyWanted    Int      @default(1)
  status       String            // WAITING | NOTIFIED | PURCHASED | EXPIRED | CANCELLED
  notifiedAt   DateTime?
  offerExpiresAt DateTime?
  createdAt    DateTime @default(now())
  @@index([sessionId, status, createdAt])   // FIFO
}

// 🔜 seatmap รายที่นั่ง
model EventSeatmap { id String @id @default(cuid()) /* layout Json, zones */ }
model EventSeat    { id String @id @default(cuid()) /* row, number, zoneId, status: FREE|HELD|SOLD */ }
```

**หมายเหตุ invariant สำคัญ:**
- `TicketAllocation`: `soldCount + reservedCount ≤ quota` เสมอ (บังคับที่ query — 11.1) และผลรวม quota ของทุก type ในโซนเดียวกันต่อรอบ ≤ `EventZone.capacity`; ผลรวมทุก allocation ของรอบ ≤ `EventSession.capacity` (ถ้าตั้ง) — ตรวจตอนบันทึก allocation
- `EventTicket` จำนวนใบต่อ orderItem = `qty` เสมอ (ออกครบใน transaction เดียวตอนจ่ายสำเร็จ)
- เอกสารเงิน (PosSale/ใบเสร็จ) เป็นของ POS — โมดูลนี้เก็บแค่ `saleId`/`receiptNo` snapshot

---

## 5. API Endpoints

> unit-scoped ทั้งหมด: dashboard ใช้ `/api/u/[unitId]/ticket/...` (middleware ตรวจ `unitId ∈ tenant` + `can()` 4 มิติ) · storefront สาธารณะใช้ `/api/store/[tenantSlug]/[unitSlug]/ticket/...` (rate-limited, ไม่ต้อง auth ยกเว้นที่ระบุ)
> action ที่แตะเงิน/ตั๋ว/สิทธิ์ ลง `AuditLog` กลางทุกครั้ง

### 5.1 Dashboard — จัดการงาน (auth: ตาราง permissions ข้อ 9)

| # | Method + Path | ทำอะไร | Payload หลัก | สิทธิ์ (action) |
|---|---|---|---|---|
| 1 | `GET /api/u/{unitId}/ticket/venues` | list venue | — | `ticket.venue.read` |
| 2 | `POST /api/u/{unitId}/ticket/venues` | สร้าง venue | `{name, address?, mapUrl?, capacity?, note?}` | `ticket.venue.write` |
| 3 | `PATCH /api/u/{unitId}/ticket/venues/{id}` | แก้/archive venue | ฟิลด์ที่แก้ | `ticket.venue.write` |
| 4 | `GET /api/u/{unitId}/ticket/events?status=&q=&page=` | list event + KPI ย่อ | — | `ticket.event.read` |
| 5 | `POST /api/u/{unitId}/ticket/events` | สร้าง event (DRAFT) | `{title, slug, venueId?, admissionMode, description?, refund*, maxPerOrder, ...}` | `ticket.event.write` |
| 6 | `GET /api/u/{unitId}/ticket/events/{eventId}` | รายละเอียด + sessions + types + zones + allocations | — | `ticket.event.read` |
| 7 | `PATCH /api/u/{unitId}/ticket/events/{eventId}` | แก้ event / เปลี่ยน status (publish/pause/archive) | ฟิลด์ที่แก้ หรือ `{status}` | `ticket.event.write` · publish/cancel = `ticket.event.publish` |
| 8 | `POST /api/u/{unitId}/ticket/events/{eventId}/sessions` | สร้างรอบ (รับ array — bulk ได้) | `[{startAt, endAt, doorOpenAt?, name?, capacity?}]` | `ticket.event.write` |
| 9 | `PATCH /api/u/{unitId}/ticket/sessions/{sessionId}` | แก้รอบ | ฟิลด์ที่แก้ | `ticket.event.write` |
| 10 | `POST /api/u/{unitId}/ticket/sessions/{sessionId}/cancel` | ยกเลิกรอบ + mass refund (flow 7.6) | `{reason, refundMode: 'FULL'|'NONE'}` | `ticket.event.cancel` |
| 11 | `POST /api/u/{unitId}/ticket/events/{eventId}/zones` | สร้าง/แก้โซน (upsert list) | `[{id?, name, capacity, sortOrder}]` | `ticket.event.write` |
| 12 | `POST /api/u/{unitId}/ticket/events/{eventId}/types` | สร้างประเภทตั๋ว | `{name, priceSatang, zoneId?, salesStartAt?, salesEndAt?, min/maxPerOrder, maxPerMember?, visibility, channel}` | `ticket.tickettype.write` |
| 13 | `PATCH /api/u/{unitId}/ticket/types/{typeId}` | แก้ type (ราคาแก้ได้เฉพาะยังไม่มีออเดอร์ PAID — มีแล้วให้สร้าง type ใหม่) | ฟิลด์ที่แก้ | `ticket.tickettype.write` |
| 14 | `PUT /api/u/{unitId}/ticket/sessions/{sessionId}/allocations` | ตั้งโควตา (upsert ต่อ type) | `[{ticketTypeId, quota, priceOverrideSatang?}]` | `ticket.tickettype.write` |

### 5.2 Dashboard — ออเดอร์ / ตั๋ว / refund

| # | Method + Path | ทำอะไร | Payload หลัก | สิทธิ์ |
|---|---|---|---|---|
| 15 | `GET /api/u/{unitId}/ticket/orders?eventId=&sessionId=&status=&q=` | list ออเดอร์ (ค้นหา orderNo/email/เบอร์) | — | `ticket.order.read` |
| 16 | `GET /api/u/{unitId}/ticket/orders/{orderId}` | รายละเอียด + ตั๋วทุกใบ + timeline | — | `ticket.order.read` |
| 17 | `POST /api/u/{unitId}/ticket/orders/onsite` | ขายหน้างาน (flow 7.2 — reserve+จ่าย+ออกตั๋ว) | `{sessionId, items:[{ticketTypeId, qty}], buyer{...}, memberId?, couponCode?, payMethods:[...]}` | `ticket.order.sell` |
| 18 | `POST /api/u/{unitId}/ticket/orders/{orderId}/resend` | ส่งอีเมลตั๋วซ้ำ | `{email?}` | `ticket.order.read` |
| 19 | `POST /api/u/{unitId}/ticket/orders/{orderId}/refund` | refund โดยร้าน (ทั้งออเดอร์/รายใบ) | `{ticketIds? , reason, waiveFee?: true}` | `ticket.order.refund` |
| 20 | `POST /api/u/{unitId}/ticket/refund-requests/{orderId}/approve` \| `/reject` | จัดการคำขอ refund ของลูกค้า | `{note?}` | `ticket.order.refund` |
| 21 | `POST /api/u/{unitId}/ticket/tickets/{ticketId}/void` | void ตั๋วรายใบ | `{reason, releaseQuota: true}` | `ticket.void` |
| 22 | `GET /api/u/{unitId}/ticket/tickets?sessionId=&status=&q=` | ค้นตั๋ว (ticketNo/ชื่อ/อีเมล) | — | `ticket.order.read` |

### 5.3 Check-in (scanner PWA)

| # | Method + Path | ทำอะไร | Payload หลัก | สิทธิ์ |
|---|---|---|---|---|
| 23 | `POST /api/u/{unitId}/ticket/checkin/scan` | สแกน 1 ครั้ง — atomic, ตอบผลใน 1 round-trip | `{sessionId, qrToken (หรือ ticketNo), gate?, overrideNotYetOpen?: bool}` → `{result, ticket?{typeName, zoneName, attendeeName, usedAt?, usedGate?}, counters{used, total}}` | `ticket.checkin.scan` · override = `ticket.checkin.override` |
| 24 | `POST /api/u/{unitId}/ticket/checkin/{ticketId}/undo` | ยกเลิกเช็คอิน (ภายใน 5 นาที) | `{reason}` | `ticket.checkin.override` |
| 25 | `GET /api/u/{unitId}/ticket/sessions/{sessionId}/checkin-stats` | ตัวนับ (polling fallback) | — | `ticket.checkin.scan` |
| 26 | `GET /api/u/{unitId}/ticket/sessions/{sessionId}/live` (SSE) | stream: ยอดเช็คอิน/ยอดขายสด | — | `ticket.checkin.scan` หรือ `ticket.report.read` |
| 🔜 | `GET .../checkin/manifest?sessionId=` | ดาวน์โหลด manifest offline (id+tokenHash+status) | — | `ticket.checkin.scan` |
| 🔜 | `POST .../checkin/sync` | อัป batch ผล scan offline | `[{tokenHash, scannedAt, gate}]` | `ticket.checkin.scan` |

### 5.4 Storefront (public + customer)

| # | Method + Path | ทำอะไร | หมายเหตุ |
|---|---|---|---|
| 27 | `GET /api/store/{tenantSlug}/{unitSlug}/ticket/events` | list event PUBLISHED (+PAUSED) | cache 60s |
| 28 | `GET /api/store/{tenantSlug}/{unitSlug}/ticket/events/{eventSlug}` | detail + รอบ + type + ราคา + คงเหลือแบบหยาบ (`AVAILABLE / LOW / SOLD_OUT` — ไม่โชว์เลขจริง) | นับ view (throttled) |
| 29 | `POST /api/store/{tenantSlug}/{unitSlug}/ticket/orders` | สร้างออเดอร์ + hold โควตา 15 นาที (flow 7.1) | `{sessionId, items:[{ticketTypeId, qty}], buyer{name,email,phone?}, attendeeNames?, couponCode?}` → `{orderId, holdExpiresAt, totalSatang, paymentIntent}` · rate limit + turnstile กัน bot |
| 30 | `GET /api/store/.../ticket/orders/{orderId}?t={guestAccessToken}` | สถานะออเดอร์ + ตั๋ว (หลังจ่าย) | auth = session member เจ้าของ หรือ guest token |
| 31 | `POST /api/store/.../ticket/orders/{orderId}/cancel` | ลูกค้ายกเลิกก่อนจ่าย (คืน hold ทันที) | เจ้าของออเดอร์ |
| 32 | `POST /api/store/.../ticket/orders/{orderId}/refund-request` | ขอ refund ตาม policy | `{ticketIds?, reason?}` — ตรวจ window ที่ server |
| 33 | `GET /api/store/.../ticket/my-tickets` | ตั๋วของฉัน (member login) | upcoming/past |
| 34 | `GET /api/store/.../ticket/tickets/{ticketId}/pdf?t=` | ดาวน์โหลดตั๋ว PDF | เจ้าของ/guest token |
| 🔜 | `POST .../tickets/{id}/transfer` · `POST .../transfers/{id}/accept` | โอนตั๋ว | |
| 🔜 | `POST .../sessions/{id}/waitlist` | เข้าคิว waitlist | |

> **Payment events (D1/D7):** โมดูลนี้ไม่รับ webhook payment ตรง — POS เป็นเจ้าของ payment flow; เมื่อ PosSale ได้รับยืนยันเงินเข้า POS emit **`pos.sale.paid {saleId, sourceModule:'TICKET', sourceId: orderId}`** → handler ของ Ticket ทำ flow 7.1 ขั้น "ออกตั๋ว" · PaymentIntent หมดอายุไม่จ่าย → POS emit **`pos.sale.expired`** → handler ของ Ticket ปล่อย hold (order → EXPIRED, คืน reservedCount)

**รวม endpoints: MVP 34 (+6 🔜)**

---

## 6. UI Screens

> ทุกหน้า: i18n TH/EN · B&W minimal · mobile-first · empty/loading/error state ครบ

### 6.1 Dashboard `(app)` — `/app/u/[unitSlug]/ticket/...`

| # | Route | หน้าจอ | จุดสำคัญ / mobile behavior |
|---|---|---|---|
| D1 | `/ticket` | **ภาพรวมโมดูล**: การ์ดงานที่ขายอยู่ + รอบวันนี้ + ยอดขายวันนี้ + คำขอ refund ค้าง | มือถือ: การ์ดเรียงเดี่ยว, ปุ่มลัด "สแกนตั๋ว" ใหญ่บนสุด |
| D2 | `/ticket/events` | **รายการอีเวนต์** (tab: กำลังขาย/DRAFT/จบแล้ว/ARCHIVED) + ค้นหา | list = ตาราง → มือถือเป็นการ์ด |
| D3 | `/ticket/events/new` + `/ticket/events/[id]/edit` | **ตัวแก้ event** 4 แท็บ: ① ข้อมูลงาน (ชื่อ/รูป/venue/เงื่อนไข/refund policy) ② รอบ (ตาราง + ปุ่ม bulk สร้างซ้ำ) ③ ประเภทตั๋ว + โควตาต่อรอบ (grid session×type แก้ inline) ④ โซน (เมื่อ ZONE) | ปุ่ม "เผยแพร่" มี pre-publish checklist (มีรอบ ≥1, type ≥1, โควตาครบ) |
| D4 | `/ticket/events/[id]` | **หน้างานเดี่ยว (คุมงาน)**: กราฟยอดขายสดต่อรอบ/type, ตั๋วคงเหลือ, ลิงก์ storefront + QR โปสเตอร์, ปุ่ม pause/ยกเลิกรอบ | SSE realtime |
| D5 | `/ticket/sessions/[id]` | **หน้ารอบเดี่ยว**: allocation, รายชื่อผู้ถือตั๋ว (export CSV), ยอดเช็คอินสด, ปุ่มยกเลิกรอบ | |
| D6 | `/ticket/box-office` | **ขายหน้างาน**: เลือกงาน→รอบ→แตะ type +/- จำนวน → ผูกสมาชิก (เบอร์/สแกน) → คูปอง → จ่าย (ผ่านจอ POS pay) → จอแสดง QR ตั๋ว/พิมพ์/ส่งอีเมล | ออกแบบเป็น touch-first เหมือน POS, ใช้ได้บนแท็บเล็ต |
| D7 | `/ticket/orders` + `/ticket/orders/[id]` | **ออเดอร์**: list+filter+ค้น / detail (ตั๋วทุกใบ+สถานะ, timeline, ปุ่ม resend/refund/void รายใบ) | |
| D8 | `/ticket/refunds` | **คิวคำขอ refund**: อนุมัติ/ปฏิเสธ + แสดงยอดหักค่าธรรมเนียมตาม policy | badge จำนวนค้างที่ sidebar |
| D9 | `/ticket/scan` | **Scanner PWA**: fullscreen กล้อง, เลือกงาน/รอบ/ประตูครั้งแรกแล้วจำ, ผลเขียว/แดง/เหลืองเต็มจอ + สั่น + เสียง, ตัวนับมุมจอ, โหมดพิมพ์ ticketNo | installable (manifest+SW), ล็อกจอไม่ให้ sleep (wake lock), ทำงานแนวตั้งมือเดียว |
| D10 | `/ticket/reports` | **รายงาน** (หัวข้อ 10): ยอดขาย/attendance/conversion + export CSV | ช่วงเวลา + filter event |
| D11 | `/ticket/settings` | ตั้งค่าโมดูล: prefix เลขตั๋ว/ออเดอร์, default refund policy, gate presets, ข้อความท้ายอีเมลตั๋ว | |

### 6.2 Storefront `(store)` — `/s/[tenantSlug]/[unitSlug]/...` (หรือ custom domain)

| # | Route | หน้าจอ | จุดสำคัญ |
|---|---|---|---|
| S1 | `/events` | list งานที่ขายอยู่ (การ์ด: รูป, ชื่อ, วันที่ช่วง, ราคาเริ่มต้น, badge เหลือน้อย/เต็ม) | |
| S2 | `/events/[eventSlug]` | **หน้างาน**: cover, รายละเอียด, venue+แผนที่, refund policy, **ตัวเลือกรอบ** (list วันที่/เวลา + สถานะ) → **ตารางประเภทตั๋ว** (ชื่อ/ราคา/คำอธิบาย + stepper จำนวน) → ปุ่ม "ซื้อตั๋ว" สรุปยอดลอยล่างจอ | มือถือ: sticky bottom bar ยอดรวม; type ที่ยังไม่ถึง `salesStartAt` โชว์ "เปิดขาย 1 ธ.ค." ที่หมด = "เต็ม" |
| S3 | `/events/[eventSlug]/checkout` | **Checkout**: นาฬิกาถอยหลัง hold 15:00, ฟอร์มผู้ซื้อ (+ชื่อผู้เข้าร่วมรายใบถ้า event บังคับ), ช่องคูปอง (validate สด), สรุปราคา (ส่วนลด/สุทธิ), วิธีจ่าย → PromptPay QR/redirect ตาม POS | hold หมดเวลา = modal "คำสั่งซื้อหมดอายุ" กลับ S2 |
| S4 | `/orders/[orderId]?t=` | **Confirmation**: สถานะจ่าย (poll/SSE), ตั๋วทุกใบ (QR ใหญ่ สไลด์ทีละใบ), ปุ่มเพิ่มลงปฏิทิน/ดาวน์โหลด PDF/ส่งอีเมลซ้ำ | ใช้ลิงก์เดียวกับในอีเมล (guest token) |
| S5 | `/my-tickets` | **ตั๋วของฉัน** (login): upcoming/past, เปิด QR เต็มจอ (ปรับ brightness hint), ปุ่มขอ refund ตาม policy | 🔜 ปุ่มโอนตั๋ว |
| S6 | `/tickets/[ticketId]` | หน้าตั๋วเดี่ยวเต็มจอ (จากอีเมล/แชร์ให้คนในกลุ่มที่มากันหลายคน) | แสดงสถานะ USED/VOID ชัดถ้าไม่ VALID |

**รวม screens: dashboard 11 + storefront 6 = 17**

---

## 7. Business Flows

### 7.1 ซื้อออนไลน์ (happy path + failure)
```
Customer                    Ticket module                POS / อื่นๆ
   │ S2: เลือกรอบ+type+จำนวน   │                            │
   ├── POST /orders ──────────►│ 1. ตรวจ: event PUBLISHED, session SCHEDULED+ยังไม่เลย cutoff,
   │                           │    type ACTIVE+อยู่ในช่วงขาย+channel, min/maxPerOrder,
   │                           │    maxPerMember (นับตั๋วเดิมของ member/email), maxPerOrder ของ event
   │                           │ 2. TX: atomic reserve ต่อ allocation (11.1)
   │                           │    ─ เต็ม → 409 {reason:'SOLD_OUT', available:n} → UI เสนอจำนวนที่เหลือ/รอบอื่น
   │                           │ 3. สร้าง TicketOrder PENDING (holdExpiresAt=+15m) + items
   │                           │ 4. เรียก coupon.validate (ผ่าน POS ตอน createSale — แต่ validate ก่อนเพื่อโชว์ยอด)
   │                           │ 5. createSale(POS 2.1) sourceModule:'TICKET', sourceId:orderId,
   │                           │    idempotencyKey, paymentMode:'PENDING_PAYMENT', lines=รายการตั๋ว, couponCode
   │                           │    → POS สร้าง sale PENDING_PAYMENT + PosPaymentIntent
   │                           │      (expireAt = holdExpiresAt) — D1
   │◄─ {orderId, PaymentIntent} ┤                            │
   │ จ่าย PromptPay/แนบสลิป      │                            │ staff/FINANCE ยืนยันสลิป
   │                           │                            │ (gateway webhook 🔜)
   │                           │◄── event pos.sale.paid ────┤ {saleId, sourceModule:'TICKET',
   │                           │    (idempotent ด้วย saleId) │  sourceId: orderId}
   │                           │ 6. TX: order→PAID, reserved→sold, ออก EventTicket ครบทุกใบ
   │                           │    (qrToken สุ่ม, ticketNo running, zone snapshot)
   │                           │ 7. guest → member.findOrCreate({tenantId, email: buyerEmail,
   │                           │    source:'TICKET'}) (contract 2.6) + earn-attach ตาม 09 §3.3:
   │                           │    สมัครสมาชิก/ยืนยันตัวภายหลังผูกแต้มบิลย้อนหลังตาม policy (D6)
   │                           │ 8. notify(2.5): EMAIL template 'ticket.issued' + ตั๋วแนบ/ลิงก์
   │◄── S4 โชว์ตั๋ว (SSE/poll) ──┤    (Point/Account/Coupon: POS จัดการแล้วใน createSale)
```
**Failure paths:**
- จ่ายไม่เสร็จใน 15 นาที → `PosPaymentIntent` หมดอายุฝั่ง POS → emit `pos.sale.expired` → handler ของ Ticket: order `PENDING` → `EXPIRED`, คืน `reservedCount` (cron ฝั่ง Ticket ทุก 1 นาทีเป็น safety net กรณี event หาย — idempotent) — **เงินเข้าช้าหลัง expire** (staff ยืนยันสลิปช้า — `pos.sale.paid` มาหลัง expired): ถ้าโควตายังพอ → ออกตั๋วตามปกติ (revive order); ถ้าไม่พอ → auto-refund เต็มผ่าน `pos.refundSale` + notify ขอโทษ (บันทึก AuditLog)
- coupon invalid ตอน redeem (ถูกใช้ตัดหน้า) → POS คืน error ก่อนเก็บเงิน → UI ให้เอาคูปองออก/ใส่ใหม่ ราคาอัปเดต
- ออกตั๋วล้มเหลวกลางคัน (ขั้น 6) → ทั้ง TX rollback, retry ด้วย idempotency key = `saleId` (เรียกซ้ำได้ผลเดิม)

### 7.2 ขายหน้างาน (box office)
1. Staff เลือกงาน→รอบ, แตะ type/จำนวน — จอโชว์คงเหลือจริง
2. ผูก member (optional): พิมพ์เบอร์/สแกนบัตรสมาชิก → ชื่อขึ้น
3. กด "เก็บเงิน" → **TX เดียว**: atomic reserve → order `PENDING(channel=ONSITE)` → `createSale` แบบ **`paymentMode:'PAID_NOW'`** พร้อม payMethods จริง (CASH / PROMPTPAY ที่ staff เห็นเงินเข้าแล้ว / …, Σ payMethods = grandTotal — D1: in-store ใช้ PAID_NOW เหมือนเดิม) → ออกตั๋วใน TX ต่อเนื่อง → order `PAID`
4. จอแสดงตั๋ว QR ทีละใบ / พิมพ์สลิป / ส่งอีเมล
- **Failure:** หน้างานเป็น PAID_NOW — staff ยืนยันเงินเข้าก่อนกดเก็บเงินเสมอ · ลูกค้าไม่จ่าย/เปลี่ยนใจก่อนกด → ปุ่มยกเลิก คืน hold ทันที

### 7.3 Check-in scan
```
Staff scan QR ──► POST /checkin/scan {sessionId, qrToken, gate}
  1. หา EventTicket ด้วย qrToken (unique index) — ไม่พบ → log INVALID_TOKEN → แดง
  2. ticket.sessionId ≠ sessionId ที่เลือก → WRONG_SESSION (บอกรอบที่ถูกให้ staff พาไป) / คนละ event → WRONG_EVENT
  3. status VOID/REFUNDED/TRANSFERRED → VOIDED → แดง
  4. now < doorOpenAt และไม่ override → NOT_YET_OPEN → เหลือง (ปุ่ม override ถ้ามีสิทธิ์)
  5. atomic: UPDATE EventTicket SET status='USED', usedAt=now(), usedGate, usedByUserId
     WHERE id=? AND status='VALID'   ← rowCount 0 = โดนตัดหน้า → DUPLICATE (โชว์ usedAt+gate เดิม) → แดง
  6. log TicketCheckin(OK) + push SSE counter → เขียว + สั่น
```
- Undo (สแกนผิดคน): ภายใน 5 นาที + สิทธิ์ `ticket.checkin.override` → ticket กลับ `VALID`, log `UNDONE`
- เน็ตหลุด v1: UI โชว์ "ออฟไลน์ — สแกนไม่ได้" ชัดเจน + ปุ่ม retry (🔜 offline mode ตาม 3.8)

### 7.4 ลูกค้าขอ refund
1. S5 กด "ขอคืนเงิน" → server ตรวจ: `refundAllowed`, `now ≤ session.startAt - refundWindowHours`, ตั๋ว `VALID` (ไม่ USED)
2. คำนวณยอดคืน = Σ priceSatang ของใบที่ขอ × (100−feePercent)/100 (ปัดลง) — โชว์ให้ยืนยันก่อนส่ง
3. order → `REFUND_REQUESTED` (หรือข้ามไปขั้น 4 ถ้า `refundAutoApprove`)
4. Manager อนุมัติ (D8) → TX: ตั๋ว→`REFUNDED`, คืนโควตา, เรียก **`pos.refundSale`** อ้าง `saleId` เดิม (POS ออกเอกสาร refund, กลับแต้ม/บัญชี/คูปอง + emit `pos.sale.refunded`), order → `REFUNDED|PARTIALLY_REFUNDED`, notify ลูกค้า
5. ปฏิเสธ → order กลับ `PAID` + notify พร้อมเหตุผล
- **Failure:** ตั๋วบางใบใน request ถูกใช้ไประหว่างรอ → อนุมัติเฉพาะใบที่ยัง VALID, แจ้งส่วนที่ไม่ได้

### 7.5 Void โดยร้าน
- เหตุผลบังคับ + confirm → ตั๋ว `VOID` (ไม่มีเงินคืน — ถ้าต้องคืนให้ใช้ flow refund) → คืนโควตา (default) → AuditLog before/after → ตั๋วสแกนขึ้นแดง "VOID" ทันที

### 7.6 ยกเลิกทั้งรอบ
1. Manager กดยกเลิกรอบ + เหตุผล + เลือก `refundMode` → confirm พิมพ์ชื่อรอบ (กันพลาด)
2. session → `CANCELLED` (ปิดขายทันที), background job (batch ละ 100):
   - ทุกออเดอร์ `PAID` → refund เต็ม 100% (**ไม่หัก fee** — ร้านเป็นฝ่ายยกเลิก), ตั๋ว → `REFUNDED`
   - ออเดอร์ `PENDING` → `CANCELLED` คืน hold
   - notify ทุก buyer: template 'session.cancelled'
3. จอ D5 โชว์ progress จนครบ + สรุปยอดคืนรวม; job ล้มกลางทาง → resume ได้ (ทำงานแบบ idempotent ต่อออเดอร์)

### 7.7 วงจรชีวิตอัตโนมัติ (cron)
- ทุก 1 นาที: expire hold (7.1) · ทุก 15 นาที: session ที่ `endAt` ผ่าน → `COMPLETED`; event ที่ทุกรอบจบ → `ENDED`; ตั๋ว `VALID` ของรอบที่จบ → คงสถานะไว้ (นับเป็น no-show ในรายงาน ไม่เปลี่ยน status)
- ก่อนงาน 24 ชม.: notify 'event.reminder' ถึงผู้ถือตั๋ว VALID ทุกใบ (ครั้งเดียว/order)

---

## 8. Integration (contract กลาง)

| Contract | จุดที่เรียก | รายละเอียด |
|---|---|---|
| **2.1 POS `createSale`** | 7.1 ขั้น 5 (ออนไลน์ = `paymentMode:'PENDING_PAYMENT'` + PosPaymentIntent — D1), 7.2 ขั้น 3 (box office = `PAID_NOW`) | `{tenantId, unitId, memberId?, sourceModule:'TICKET', sourceId: orderId, idempotencyKey, paymentMode, lines:[{name:'คอนเสิร์ตปีใหม่ — Early Bird (รอบ 22:00)', qty, unitPrice: สตางค์}], couponCode?, payMethods (เฉพาะ PAID_NOW)}` → เก็บ `saleId, receiptNo, pointEarned?` · subscribe **`pos.sale.paid`** (ออกตั๋ว) / **`pos.sale.expired`** (ปล่อย hold) — ชื่อเต็มตาม D7 · **Refund**: เรียก `pos.refundSale` อ้าง `saleId` เดิม (ใบเสร็จ immutable — POS ออกเอกสารใหม่ + emit `pos.sale.refunded`) |
| **2.2 Point** | ไม่เรียกตรง | POS เป็นคนยิง `point.earn` จากยอดจ่ายจริง และกลับรายการตอน refund — Ticket **ห้าม**คิดแต้มเอง |
| **2.3 Coupon** | S3 ช่องคูปอง | `coupon.validate({code, tenantId, unitId, memberId?, amount: subtotal, module:'TICKET'})` เพื่อโชว์ส่วนลดสด · `redeem` เกิดใน POS ตอน createSale (atomic) — Ticket เก็บแค่ `couponCode` snapshot |
| **2.4 Account** | ไม่เรียกตรง | POS posting SALE/REFUND ให้ครบ — Ticket ไม่แตะบัญชี |
| **2.5 Notification** | ออกตั๋ว (ticket.issued), refund อนุมัติ/ปฏิเสธ, ยกเลิกรอบ, reminder 24 ชม., 🔜 transfer/waitlist | `notify({tenantId, to:{memberId หรือ email}, channel: EMAIL, template, data:{orderNo, tickets[...], links}})` — อีเมลตั๋วมีทั้ง QR ฝัง (inline img) + ลิงก์ S4 (guest token) |
| **2.6 Member** | ทุกออเดอร์ | อ้าง `memberId` — guest: หลังจ่ายสำเร็จเรียก `member.findOrCreate({tenantId, email: buyerEmail, source:'TICKET'})` แล้วผูกย้อน + **earn-attach ตาม 09 §3.3** (D6): สมัครสมาชิก/ยืนยันตัวภายหลัง → ผูกแต้มจากบิลย้อนหลังตาม policy ของ Point · snapshot `buyerName/Email/Phone` เก็บบนออเดอร์ได้เพราะเป็นเอกสาร freeze |
| **2.7 activity.log** | ซื้อสำเร็จ (order PAID) · เข้างาน (check-in OK) | `activity.log({tenantId, memberId, unitId, module:'TICKET', type:'TICKET_PURCHASED', refType:'TicketOrder', refId: orderId, summary})` · เข้างาน: `{type:'TICKET_CHECKED_IN', refType:'EventTicket', refId: ticketId}` — ผ่าน outbox กลาง, เฉพาะที่มี memberId (producer บังคับตาม D6) |
| **Module Q (กันสับสน)** | — | ไม่มี integration — `QueueTicket` (บัตรคิว) คนละเรื่องกับ `EventTicket`; เมนู/ชื่อไทยใช้ "ตั๋วเข้างาน" vs "บัตรคิว" |
| **BusinessUnit** | ทุก query | unit type `TICKET` เปิดเมนูโมดูลนี้ · PAUSED unit: block สร้างออเดอร์ใหม่ แต่ scanner + refund ของเดิมยังทำงาน (edge case ข้อ 4 ของ BLUEPRINT_BUSINESS_UNITS) |

---

## 9. Permissions (action × role)

> ตรวจผ่าน `can(user, {tenantId, unitId, module:'TICKET', action})` — STAFF กำหนด custom ได้รายบุคคล (ค่าในตาราง = default preset)

| Action | OWNER | MANAGER (หน่วยนี้) | STAFF box office | STAFF gate | Customer |
|---|---|---|---|---|---|
| `ticket.venue.read` / `ticket.event.read` | ✅ | ✅ | ✅ | ✅ (เฉพาะที่ต้องสแกน) | storefront เท่านั้น |
| `ticket.venue.write` `ticket.event.write` `ticket.tickettype.write` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `ticket.event.publish` (publish/pause) | ✅ | ✅ | ❌ | ❌ | ❌ |
| `ticket.event.cancel` (ยกเลิกรอบ/งาน) | ✅ | ✅ | ❌ | ❌ | ❌ |
| `ticket.order.read` (list/detail/ค้นตั๋ว) | ✅ | ✅ | ✅ | ❌ | เฉพาะของตัวเอง |
| `ticket.order.sell` (ขายหน้างาน) | ✅ | ✅ | ✅ | ❌ | ❌ |
| `ticket.order.refund` (refund/approve/reject) | ✅ | ✅ | ❌ (custom เปิดได้) | ❌ | ขอ refund ตาม policy |
| `ticket.void` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `ticket.checkin.scan` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `ticket.checkin.override` (undo/ก่อนเวลา) | ✅ | ✅ | ❌ | ❌ (custom เปิดได้) | ❌ |
| `ticket.report.read` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `ticket.settings.write` (D11) | ✅ | ✅ | ❌ | ❌ | ❌ |

- ทุก action ในกลุ่ม `ticket.order.refund`, `ticket.void`, `ticket.checkin.override`, `ticket.event.cancel` → **AuditLog บังคับ** (who/what/before/after)
- Staff gate ควรได้ Membership แบบ unitAccess เฉพาะหน่วย + permissions เฉพาะ `ticket.checkin.scan` — จอ D9 คือหน้าเดียวที่เห็น

---

## 10. Reports & Metrics

### Realtime (D4/D5 — SSE)
- **ยอดขายสดต่อรอบ**: จำนวนใบ + ยอดเงิน (สุทธิหลังส่วนลด) แยกช่องทาง ONLINE/ONSITE
- **ยอดขายต่อประเภทตั๋ว**: ขายแล้ว/hold/คงเหลือ ต่อ allocation (bar เทียบ quota)
- **เช็คอินสด**: เข้าแล้ว/ทั้งหมด ต่อรอบ + ต่อโซน + อัตราการไหลเข้า (คน/10 นาที — ช่วยจัดคิวหน้าประตู)

### รายงานย้อนหลัง (D10 — filter ช่วงเวลา/event/รอบ + export CSV)
| รายงาน | เนื้อหา |
|---|---|
| **ยอดขาย** | ต่อ event/รอบ/type/วัน: ใบ, ยอดขายรวม, ส่วนลดคูปอง, refund, สุทธิ · ช่องทาง online vs หน้างาน |
| **Attendance** | ต่อรอบ: ตั๋วขาย vs เช็คอินจริง, **no-show rate**, การกระจายเวลาเข้างาน (histogram 15 นาที), ต่อประตู/โซน |
| **Conversion** | view หน้า event → เริ่ม order → จ่ายสำเร็จ (funnel), อัตรา hold expire (จ่ายไม่ทัน — สัญญาณว่า flow จ่ายมีปัญหา), sold-out lead time (ขายหมดก่อนงานกี่วัน) |
| **Refund/Void** | จำนวน+มูลค่า refund, เหตุผล void, ค่าธรรมเนียมที่เก็บได้ |
| **ลูกค้า** | ผู้ซื้อใหม่ vs member เดิม, top spenders, ตั๋วเฉลี่ย/ออเดอร์ — เชื่อมโปรไฟล์ Member |
| **Early bird performance** | สัดส่วนขาย type ราคาโปรโมชัน vs ปกติ (ช่วยตั้งราคางานหน้า) |

- KPI ที่ส่งขึ้น **Overview "ทุกกิจการ"** (การ์ด unit): ยอดขายตั๋ววันนี้ · รอบถัดไป + % ขายแล้ว · เช็คอินสดถ้ามีรอบกำลังดำเนิน
- ยอดเงิน/บัญชี "ทางการ" อ่านจากรายงาน Account (POS posting) — รายงานในโมดูลนี้เป็นมุมมองปฏิบัติการ ตัวเลขต้อง reconcile ตรงกับ Account (QC ข้อ 12)

---

## 11. Edge Cases & Rules

### 11.1 กันขายเกินโควตา (race หลายคนซื้อพร้อมกัน) — กติกาเหล็ก
- reserve ทำใน transaction ด้วย **conditional atomic update** ต่อ allocation:
  ```sql
  UPDATE "TicketAllocation"
  SET "reservedCount" = "reservedCount" + :qty
  WHERE id = :id AND "soldCount" + "reservedCount" + :qty <= quota
  ```
  `rowCount = 0` → ขายเต็ม/เหลือไม่พอ → ตอบ 409 พร้อมจำนวนที่เหลือจริง — **ห้าม** อ่านค่าแล้วค่อยเขียน (read-modify-write) เด็ดขาด
- หลายรายการในออเดอร์เดียว: reserve ตามลำดับ `allocationId` (กัน deadlock) — ตัวใดตัวหนึ่งไม่พอ → rollback ทั้งออเดอร์
- จ่ายสำเร็จ: `reserved→sold` ใน TX เดียวกับออกตั๋ว · expire/cancel: ลด reserved · refund/void: ลด sold
- เพดานซ้อน (ZONE capacity / session capacity) บังคับตั้งแต่ตอน**ตั้งค่า allocation** (ผลรวม quota ≤ เพดาน) — runtime ตรวจแค่ allocation ชั้นเดียว เร็วและพอ

### 11.2 กันสแกนซ้ำ
- ตัดสินที่ DB ด้วย conditional update (`WHERE status='VALID'`) — ไม่ใช่ที่ client/memory; สองเครื่องพร้อมกัน = เครื่องเดียวเขียว
- Screenshot ตั๋วคนอื่น: ใบแรกที่สแกนชนะ ใบถัดไปแดง+โชว์เวลา/ประตูที่ใช้ไป → staff เรียกดูชื่อผู้ซื้อจาก D7 เพื่อคลี่คลาย (🔜 rotating code ตัดปัญหาที่ต้นทาง)
- `qrToken` ห้ามใส่ใน URL ที่ log ได้ (ใช้ POST body) และหน้า S4/S6 render QR ฝั่ง client จาก token ที่ fetch ด้วย auth

### 11.3 กติกาธุรกิจ
- **แก้ราคา/quota หลังขายแล้ว**: ราคา type แก้ไม่ได้ถ้ามีออเดอร์ PAID (สร้าง type ใหม่แล้วปิดตัวเก่า) · quota **ลด**ได้ไม่ต่ำกว่า `sold+reserved` · เพิ่มได้เสมอ (ไม่เกินเพดานโซน/รอบ)
- **แก้เวลา session หลังขายแล้ว**: ได้ (เลื่อนรอบ) แต่บังคับ notify ผู้ถือตั๋วทุกคน + ตั๋วใบเดิมใช้ได้ (token ไม่เปลี่ยน) — UI เตือนก่อนบันทึก
- **slug**: immutable หลัง publish (ตามกติกา BusinessUnit) — เปลี่ยนได้เฉพาะ title
- **admissionMode ล็อก** หลังมีออเดอร์แรก (PAID หรือ PENDING) — เปลี่ยน GENERAL↔ZONE ทำให้ตั๋วที่ออกแล้วความหมายเพี้ยน
- **ตั๋วราคา 0**: ออก PosSale ยอด 0 เสมอ (audit + นับใน attendance) — ไม่แจกแต้ม (POS คิดจากยอดจ่ายจริง = 0)
- **event ข้ามเที่ยงคืน / timezone**: เก็บ UTC, ทุกจุดแสดงผลใช้ `unit.settings.timezone`; refund window / sales window คำนวณจาก UTC ตรงๆ ไม่มีปัญหา DST (ไทยไม่มี แต่ห้าม hardcode +7)
- **ซื้อหลายรอบ**: 1 ออเดอร์ = 1 รอบ (บังคับที่ schema) — cart ข้ามรอบ = สร้างหลายออเดอร์ต่อเนื่องใน UI (v1 ไม่ทำ multi-session cart)
- **PENDING ค้างระหว่างร้านยกเลิกรอบ**: 7.6 จัดการแล้ว (cancel + คืน hold)
- **unit PAUSED**: ปิดสร้างออเดอร์ใหม่ (ทั้ง 2 ช่องทาง), scanner/refund/report ใช้ได้ — honor ธุรกรรมเดิม
- **maxPerMember bypass ทาง guest**: นับจาก `memberId` ที่ resolve จากอีเมลด้วย (อีเมลเดียวกัน = member เดียวกัน) — เปลี่ยนอีเมลหนีได้ ยอมรับใน v1 (บันทึกใน QC ว่า known limitation)
- **คนซื้อ 10 ใบ ใช้ QR ใบเดียวแจกเพื่อน**: ตั๋วรายใบมี token แยก — UI S4 ทำปุ่ม "แชร์ตั๋วใบนี้" (ลิงก์ S6 รายใบ) กันคนแชร์ทั้งออเดอร์
- **นาฬิกาเครื่อง staff เพี้ยน**: ทุกการตัดสินเวลา (door open, refund window, sales window) ใช้เวลา server เท่านั้น
- **สิทธิ์ scanner ต้องผูก unit**: token/session ของ staff gate ตรวจ `unitId` ทุก request — กันเอาบัญชี gate หน่วย A ไปสแกนงานหน่วย B

### 11.4 ประสิทธิภาพ
- จุดร้อน: `POST /orders` ตอนเปิดขาย (spike) → atomic update แถวเดียว/allocation + index `@@unique([sessionId, ticketTypeId])` รับได้; ถ้างานใหญ่มาก (หมื่นคนพร้อมกัน) 🔜 virtual waiting room — นอก scope v1
- `checkin/scan`: lookup ด้วย unique index `qrToken` + update 1 แถว → O(1); SSE รวม counter ที่ server (debounce 1s) ไม่ push ทุก scan
- รายงาน: aggregate จาก order/ticket ตรงๆ ใน v1 (ปริมาณ SME ไหว) — โครง index รองรับ; ตาราง summary รายวัน 🔜 เมื่อข้อมูลโต

---

## 12. QC Checklist (เกณฑ์ตรวจรับ)

### Functional
- [ ] สร้าง event GENERAL 2 รอบ + 3 type (Early Bird หมดเขต, Regular, VIP-HIDDEN) + โควตาต่อรอบ → publish → เห็นบน storefront ถูกต้อง (Early Bird หมดเขตแล้วไม่ขึ้นปุ่มซื้อ, HIDDEN ไม่โผล่)
- [ ] สร้าง event ZONE: type ผูกโซน, ผลรวม quota เกิน zone capacity ถูก reject ตอนตั้งค่า
- [ ] ซื้อออนไลน์ end-to-end: hold 15 นาที → จ่าย (mock POS paid) → ตั๋วออกครบตาม qty, อีเมลถึง, S4 แสดง QR, แต้มเข้า (ผ่าน POS), ใบเสร็จมีเลข
- [ ] guest checkout: member ถูก upsert จากอีเมล + guest token เปิดดูตั๋วได้ / token มั่ว = 403
- [ ] hold หมดอายุ: PENDING → EXPIRED + reservedCount คืนครบ (นับก่อน/หลังตรง) · จ่ายช้าหลัง expire แต่โควตายังพอ → ตั๋วออก / โควตาหมด → auto-refund
- [ ] ขายหน้างาน: เงินสด → ตั๋วออกทันที + พิมพ์/แสดง QR · ขาย type HIDDEN ได้ · ราคา 0 มี PosSale
- [ ] คูปอง: validate โชว์ส่วนลดถูกต้อง (สตางค์ ปัดตามกติกา Coupon), redeem ตัดจริงตอนจ่าย, refund แล้ว attribution ฝั่ง Coupon ถูกกลับรายการโดย POS
- [ ] maxPerOrder / maxPerMember / minPerOrder บังคับจริงทั้ง online และ onsite
- [ ] Scanner: สแกนผ่าน→เขียว<1วิ, ซ้ำ→แดงพร้อมเวลา+ประตูเดิม, ผิดรอบ→บอกรอบที่ถูก, VOID/REFUNDED→แดง, ก่อนเปิดประตู→เหลือง+override ได้ตามสิทธิ์, undo ภายใน 5 นาที
- [ ] **race สแกนซ้ำ**: ยิง scan ใบเดียว 2 requests พร้อมกัน (script) → OK 1, DUPLICATE 1 เสมอ
- [ ] **race ซื้อ**: โควตาเหลือ 1 ยิงซื้อพร้อมกัน 5 → สำเร็จ 1, ที่เหลือ 409 + `soldCount+reservedCount ≤ quota` ไม่เคยเกิน
- [ ] refund ลูกค้า: ในหน้าต่าง policy เท่านั้น, ค่าธรรมเนียมหักถูก (ปัดลงสตางค์), อนุมัติแล้วตั๋ว REFUNDED + สแกนขึ้นแดง + โควตาคืน + POS ออกเอกสาร REFUND (ใบเดิม immutable)
- [ ] ยกเลิกรอบ: ตั๋วทุกใบ void/refund ครบ, notify ทุก buyer, job resume ได้เมื่อ interrupt กลางทาง (รันซ้ำไม่ refund ซ้ำ)
- [ ] cron: session→COMPLETED, event→ENDED, reminder 24 ชม. ส่งครั้งเดียว

### Isolation & Security
- [ ] ทุก query มี `tenantId+unitId` — ทดสอบ cross-tenant + **cross-unit**: user หน่วย A เรียก API หน่วย B ด้วย id ตรงๆ → 403/404 ทุก endpoint (รวม scan, PDF, guest token)
- [ ] Staff gate (สิทธิ์ `ticket.checkin.scan` อย่างเดียว): เข้าได้แค่ D9, เรียก endpoint อื่น → 403
- [ ] `qrToken` ไม่โผล่ใน URL/log/response ที่ไม่จำเป็น · เดา token (brute force) มี rate limit ที่ scan endpoint
- [ ] AuditLog ครบทุก action เงิน/ตั๋ว: refund, void, cancel session, override, undo — มี before/after
- [ ] Storefront order endpoint มี rate limit + bot protection

### Data & เงิน
- [ ] เงินทุก field เป็น Int สตางค์ — ไม่มี Float ใน schema/DTO · ยอดใน Ticket order = ยอดใน PosSale = posting ใน Account ตรงกัน (reconcile 1 วันขาย)
- [ ] ไม่มี hard delete: event/order/ticket ทุก state ย้อนดูได้ · เลขรัน `orderNo`/`ticketNo` unique ต่อ unit ไม่ข้ามปน

### i18n & UI
- [ ] ทุกหน้า (D1–D11, S1–S6) มี TH/EN ครบ, B&W minimal, responsive มือถือ (โดยเฉพาะ D9 scanner + S2/S3 ซื้อบนมือถือ), empty/loading/error state ครบ
- [ ] วันเวลาแสดงตาม `unit.settings.timezone` ทุกจุด (dashboard, storefront, อีเมล, PDF)
- [ ] อีเมลตั๋ว: เปิดใน Gmail/Outlook มือถือแล้ว QR สแกนได้จริงจากอีกเครื่อง

### เอกสาร/ขอบเขต
- [ ] ฟีเจอร์ 🔜 (seatmap, rotating QR, offline scanner, transfer, waitlist) ไม่มี UI หลอกให้กด — ซ่อนหรือ label "เร็วๆ นี้" ชัดเจน
