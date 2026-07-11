# โมดูล 2: Restaurant (ร้านอาหาร) — สเปคละเอียด

> 🔄 REVISED หลัง QC — สอดคล้อง RESOLUTIONS.md (2026-07-11)
> scope: **unit** (ทุกตารางมี `tenantId + unitId`) · ยึด `_CONVENTIONS.md` + `BLUEPRINT.md` + `BLUEPRINT_BUSINESS_UNITS.md`
> เงินทุกจุด = `Int` สตางค์ (satang) · เวลาเก็บ UTC, แสดงผลตาม `unit.settings.timezone` (default `Asia/Bangkok`)
> สถานะเอกสาร: SPEC v1 — พร้อม implement (Phase 3 ตาม roadmap, พึ่ง POS/Member/Point/Account ที่เสร็จก่อน)

---

## 1. ภาพรวม + ขอบเขต

### 1.1 โมดูลนี้ทำอะไร

ระบบบริหารร้านอาหารครบวงจรสำหรับ SME ไทย (ร้านตามสั่ง, คาเฟ่, ชาบู/ปิ้งย่าง, ร้านก๋วยเตี๋ยว ไปจนถึงร้านมีหลายโซน):

- **เมนู**: หมวดหมู่ / เมนู / รูปภาพ / ตัวเลือก (option groups: ขนาด, ความหวาน, topping ฯลฯ พร้อมราคาเพิ่ม)
- **ของหมด (86)**: ปิดขายรายเมนู/รายตัวเลือกได้ทันที + นับสต็อกจำนวนจานต่อวัน (auto-86 เมื่อหมด)
- **โต๊ะ**: โซน + floor plan (ตำแหน่ง/รูปทรง/จำนวนที่นั่ง) + สถานะโต๊ะ realtime
- **QR สั่งที่โต๊ะ**: ลูกค้าสแกน → สั่งได้เลย **ไม่ต้อง login** → ภายหลัง merge เป็น Member เพื่อรับแต้มได้
- **ออเดอร์**: dine-in รวมบิลทั้งโต๊ะ / แยกบิลรายรายการ / ย้ายโต๊ะ / รวมโต๊ะ · takeaway หน้าเคาน์เตอร์ · pickup สั่งล่วงหน้าออนไลน์
- **KDS (Kitchen Display System)**: แยกสถานี (ครัว/เครื่องดื่ม/กำหนดเองได้), สถานะรายการ `NEW → COOKING → READY → SERVED`, ปุ่ม expedite (เร่งด่วน), จอ expo สำหรับคนเดินอาหาร
- **เรียกพนักงาน / ขอเช็คบิล** จากมือถือลูกค้า
- **ชำระเงิน**: ผ่าน POS ตาม contract 2.1 เท่านั้น (Restaurant ไม่แตะเงินเอง) — คูปอง/แต้ม/บัญชี POS จัดการต่อ
- **เวลาเปิด-ปิดครัว**: ช่วงให้บริการ + last order + ปิดครัวชั่วคราว
- **รายงาน**: เมนูขายดี, ยอดต่อโต๊ะ/โซน, peak hours, เวลาเตรียมอาหาร, ยกเลิก/ของหมด
- **Storefront**: เมนูออนไลน์สาธารณะ (ดูเมนู + สั่ง pickup)

### 1.2 v1 ไม่ทำ (ตัดสินใจแล้ว — อย่าเถียงตอน implement)

| เรื่อง | ตัดสินใจ | เหตุผล |
|---|---|---|
| **สต็อกวัตถุดิบ recipe/BOM หัก stock อัตโนมัติ** | 🔜 Phase 2 ของโมดูล | ต้องพึ่ง Inventory เต็มรูปใน POS (14) + ร้าน SME ไทยส่วนใหญ่เริ่มจาก "นับจานต่อวัน" ก่อน — **MVP ให้ `stockQty` ระดับเมนู (จำนวนจานที่ขายได้วันนี้ หักอัตโนมัติเมื่อยืนยันออเดอร์ auto-86 เมื่อถึง 0)** ซึ่ง cover ร้านจริง 80% · schema ฝั่ง BOM ออกแบบเผื่อไว้แล้ว (ข้อ 4.9) |
| Delivery (ไรเดอร์/Grab/LINE MAN) | 🔜 | ต้องมี integration ภายนอก + ค่าส่ง + โซนส่ง — โครง `RestOrderType` เผื่อค่า `DELIVERY` ไว้แล้ว |
| จ่ายเงินออนไลน์ก่อนรับ (pickup prepaid) | 🔜 | payment gateway ยังเป็น "เตรียม" ใน BLUEPRINT — MVP pickup = จ่ายหน้าร้านตอนรับ |
| แยกบิลแบบหารเท่า per-seat (ระบุที่นั่ง) | 🔜 | MVP มี**แยกบิลรายรายการ** (ครอบคลุมสุด) — หารเท่าทำได้ผ่าน POS multi-payMethod ในบิลเดียว |
| จองโต๊ะล่วงหน้า (reservation) | 🔜 | เป็นงานของโมดูล Booking (3) ประเภทพิเศษ — จะทำเป็น integration ภายหลัง |
| พิมพ์ใบสั่งครัว (kitchen printer) | 🔜 | MVP ใช้ KDS จอเท่านั้น (แท็บเล็ต/มือถือเก่าก็ได้) — โครง event รองรับ printer adapter ภายหลัง |
| หลายภาษาเมนูมากกว่า TH/EN | 🔜 | ตาม i18n มาตรฐานแพลตฟอร์ม |
| Waste log / เหตุผลยกเลิกเชิงวิเคราะห์ | 🔜 | MVP เก็บ `cancelReason` ข้อความ + AuditLog |

### 1.3 ความสัมพันธ์กับโมดูลอื่น (สรุป — รายละเอียดข้อ 8)

```
Restaurant ──ชำระเงิน──► POS (createSale)  ──► Coupon / Point / Account (POS จัดการต่อ)
Restaurant ──ลูกค้า────► Member (memberId ผูกบิล/session เพื่อสะสมแต้ม)
Restaurant ──แจ้งเตือน──► Notification (pickup พร้อมรับ)
Restaurant ──storefront─► (store) route: /s/[tenantSlug]/[unitSlug]/...
```

---

## 2. Persona & User Stories

### Persona

| Persona | บทบาทระบบ | บริบท |
|---|---|---|
| **เจ๊หมวย (Owner)** | OWNER | เจ้าของร้านตามสั่ง 2 สาขา (2 unit) — อยากเห็นยอดขายทุกสาขาจากมือถือ, ตั้งเมนู/ราคาเอง |
| **พี่กบ (Manager)** | MANAGER (unitAccess: สาขาเดียว) | ผู้จัดการสาขา — เปิด/ปิดครัว, จัดการ 86, ยกเลิกรายการที่ทำไปแล้ว, ดูรายงานสาขา |
| **น้องแนน (พนักงานเสิร์ฟ)** | STAFF (`restaurant.order.*`, `restaurant.table.*`) | รับออเดอร์หน้าโต๊ะ, ย้าย/รวมโต๊ะ, กดเช็คบิล, ตอบ service request |
| **ลุงชัย (คนครัว)** | STAFF (`restaurant.kds.operate` สถานีครัว) | ดู KDS, กดรับ-เสร็จรายการ, กด 86 เมนูที่วัตถุดิบหมด |
| **น้องเมย์ (บาร์น้ำ)** | STAFF (`restaurant.kds.operate` สถานีเครื่องดื่ม) | KDS สถานีเครื่องดื่ม |
| **แคชเชียร์** | STAFF (POS + `restaurant.checkout`) | รวมบิล/แยกบิล → ชำระผ่าน POS |
| **ลูกค้า walk-in** | Customer (ไม่ login) | สแกน QR ที่โต๊ะ → สั่ง → เรียกพนักงาน → ขอเช็คบิล — **ห้ามบังคับ login** |
| **ลูกค้าสมาชิก** | Customer (User + CustomerProfile) | เหมือน walk-in แต่กด "รับแต้ม" ผูกเบอร์/อีเมลก่อนจ่าย |

### User Stories (ตัวหลัก)

**Owner/Manager**
- ในฐานะเจ้าของ ฉันสร้างหมวด/เมนู/รูป/ตัวเลือกได้จากมือถือ และเห็นผลบน QR ลูกค้าทันที
- ในฐานะผู้จัดการ ฉันกด 86 เมนูได้ใน 2 แตะ (จาก KDS หรือหน้า quick panel) และของกลับมาขายพรุ่งนี้อัตโนมัติถ้าตั้ง daily reset
- ในฐานะเจ้าของ ฉันตั้งเวลาเปิด-ปิดครัว + last order ได้ และนอกเวลา ลูกค้าสั่งไม่ได้แต่ยังดูเมนูได้
- ในฐานะเจ้าของ ฉันเห็นเมนูขายดี, ชั่วโมงพีค, ยอดเฉลี่ยต่อโต๊ะ เพื่อวางกำลังคน/โปรโมชั่น

**Staff**
- ในฐานะพนักงานเสิร์ฟ ฉันเห็น floor plan ว่าโต๊ะไหนว่าง/มีลูกค้า/ขอเช็คบิล แบบ realtime
- ในฐานะพนักงานเสิร์ฟ ฉันคีย์ออเดอร์แทนลูกค้าได้ (โต๊ะที่ไม่สะดวกสแกน) เข้าบิลโต๊ะเดียวกัน
- ในฐานะคนครัว ฉันเห็นเฉพาะรายการสถานีตัวเอง เรียงตามเวลา รายการเร่งด่วนเด้งขึ้นบนพร้อมป้ายแดง
- ในฐานะแคชเชียร์ ฉันแยกบิลรายรายการได้ (โต๊ะ 6 คน จ่ายแยก 2 กลุ่ม) โดยแต่ละกลุ่มได้ใบเสร็จของตัวเอง

**Customer**
- ในฐานะลูกค้า ฉันสแกน QR แล้วสั่งได้เลยไม่ต้องโหลดแอป/สมัคร เห็นรายการที่เพื่อนร่วมโต๊ะสั่งด้วย
- ในฐานะลูกค้า ฉันเห็นสถานะอาหาร (กำลังทำ/เสร็จแล้ว) และกดเรียกพนักงาน/ขอเช็คบิลได้
- ในฐานะลูกค้าสมาชิก ฉันกรอกเบอร์+OTP ก่อนเช็คบิล เพื่อให้บิลนี้สะสมแต้มเข้าบัญชีสมาชิกของฉัน
- ในฐานะลูกค้า pickup ฉันสั่งจากหน้าเมนูออนไลน์ เลือกเวลารับ แล้วมารับ+จ่ายที่ร้าน

---

## 3. ฟังก์ชันทั้งหมด (MVP ✅ / Phase ถัดไป 🔜)

### 3.1 เมนู & หมวดหมู่
- ✅ หมวดหมู่: ชื่อ TH/EN, รูป, ลำดับ, ซ่อน/แสดง, ช่วงเวลาขาย (เช่น "เมนูเช้า" 06:00–11:00)
- ✅ เมนู: ชื่อ TH/EN, คำอธิบาย, รูปหลายรูป (รูปแรก = cover), ราคาฐาน (สตางค์), SKU (optional), แท็ก (เผ็ด 🌶/มังสวิรัติ/แนะนำ/ใหม่), ลำดับในหมวด, ซ่อน/แสดง/เก็บถาวร
- ✅ ผูกเมนูเข้าสถานี KDS (ครัว/เครื่องดื่ม/สถานีกำหนดเอง) + เวลาเตรียมโดยประมาณ (นาที)
- ✅ Option Groups **แบบ reusable** (สร้างครั้งเดียวใช้หลายเมนู): ชื่อกลุ่ม, บังคับเลือกไหม (`minSelect`/`maxSelect`), ตัวเลือกย่อยพร้อม **ราคาเพิ่ม (สตางค์, ติดลบได้ เช่น "ไม่เอาไข่ -5฿")**, ค่า default, 86 รายตัวเลือกได้
  - ตัวอย่าง: "ขนาด" (บังคับเลือก 1: ธรรมดา +0 / พิเศษ +1000) · "ความหวาน" (เลือก 1: 0%/25%/50%/100%) · "Topping" (เลือกได้ 0–5: ไข่มุก +1000, พุดดิ้ง +1500)
- ✅ ก๊อปปี้เมนู (duplicate) เพื่อสร้างเมนูคล้ายกันเร็ว
- ✅ Import เมนูจาก CSV (ชื่อ, หมวด, ราคา) — เร่ง onboarding
- 🔜 เมนูชุด (combo/set ที่ประกอบจากหลายเมนู), ราคาแยกช่วงเวลา (happy hour), เมนูตามฤดูกาล auto schedule

### 3.2 ของหมด (86) & สต็อกระดับเมนู
- ✅ ปุ่ม 86 (ปิดขายชั่วคราว) รายเมนู + รายตัวเลือก — มีผลทันทีทั้ง QR ลูกค้า/หน้า staff/KDS (realtime)
- ✅ `stockQty` ต่อเมนู (optional): จำนวนที่ขายได้ "รอบนี้" — หักอัตโนมัติตอน**ยืนยันออเดอร์** (transaction กัน oversell), ถึง 0 → auto-86 + แจ้งเตือนใน KDS
- ✅ Daily reset (optional ต่อเมนู): ตั้งค่า `dailyStockQty` → ระบบ reset `stockQty` ทุกวันตอนร้านเปิด (ตาม timezone unit)
- ✅ Log การ 86/ปลด 86 (ใคร เมื่อไหร่) ผ่าน AuditLog กลาง
- 🔜 หักสต็อกวัตถุดิบด้วย Recipe/BOM (ข้อ 4.9), แจ้งเตือนวัตถุดิบใกล้หมด, ผูก Inventory ของ POS

### 3.3 โต๊ะ / โซน / Floor plan
- ✅ โซน (เช่น ในร้าน, ระเบียง, ห้องแอร์) + ลำดับ
- ✅ โต๊ะ: ชื่อ (unique ต่อ unit), โซน, จำนวนที่นั่ง, รูปทรง (เหลี่ยม/กลม), ตำแหน่ง x/y + ขนาด บน floor plan (แก้ด้วย drag-drop โหมดแก้ไข)
- ✅ Floor plan view = หน้าหลักของพนักงานเสิร์ฟ: สีสถานะโต๊ะ (ว่าง/มีลูกค้า/มี service request/ขอเช็คบิล) + จำนวนแขก + ยอดสะสม + เวลานั่ง
- ✅ QR ต่อโต๊ะ: token ถาวรต่อโต๊ะ (พิมพ์สติกเกอร์ครั้งเดียว), rotate token ได้เมื่อ QR รั่ว/สติกเกอร์หาย
- ✅ ปิดโต๊ะชั่วคราว (INACTIVE เช่น โต๊ะชำรุด) — ไม่รับ session ใหม่
- 🔜 หลายชั้น/หลาย floor plan ต่อ unit, กำหนดพนักงานประจำโซน

### 3.4 Session โต๊ะ (เปิดโต๊ะ–ปิดโต๊ะ)
- ✅ เปิดโต๊ะ: อัตโนมัติเมื่อลูกค้าสแกนสั่งครั้งแรก หรือ staff เปิดเอง (ระบุจำนวนแขก) — **1 โต๊ะมีได้ 1 session OPEN เท่านั้น** (partial unique index)
- ✅ ทุกดีไวซ์ที่สแกน QR โต๊ะเดียวกัน = เข้าร่วม session เดียวกัน (เห็นออเดอร์รวมโต๊ะ)
- ✅ ย้ายโต๊ะ: session ทั้งก้อนย้ายไปโต๊ะใหม่ (ต้องว่าง) — QR โต๊ะใหม่ใช้ต่อได้ทันที, QR โต๊ะเดิมตัดออกจาก session
- ✅ รวมโต๊ะ: merge session B เข้า A (ออเดอร์/ยอดทั้งหมดย้ายไป A, B ปิดสถานะ MERGED) — ใช้กรณีลูกค้ากลุ่มเดียวนั่ง 2 โต๊ะแล้วขอรวมบิล
- ✅ ปิดโต๊ะ: อัตโนมัติเมื่อทุกรายการชำระครบ หรือ staff ปิด (ยกเลิก session ที่ไม่มีออเดอร์)
- ✅ ผูก Member เข้า session ได้ทุกจุดก่อนชำระ (ลูกค้ากรอกเบอร์+OTP เอง หรือ staff ค้นสมาชิกให้)
- 🔜 แยก "ที่นั่ง" (seat) ใน session, เตือนโต๊ะนั่งนานเกิน X นาที

### 3.5 ออเดอร์
- ✅ Dine-in ผ่าน QR (ลูกค้าสั่งเอง) — cart ต่อดีไวซ์ → submit เป็น 1 order เข้าครัวทันที (โหมด default) หรือรอ staff อนุมัติก่อน (ตั้งค่าได้ `requireApproval`)
- ✅ Dine-in โดย staff (คีย์แทน) เข้า session โต๊ะเดียวกัน
- ✅ Takeaway หน้าเคาน์เตอร์ (staff คีย์, ไม่มีโต๊ะ, จ่ายทันทีหรือจ่ายตอนรับ)
- ✅ Pickup ออนไลน์จาก storefront: ลูกค้าเลือกเวลารับ (slot ตามเวลาครัวเปิด) + เบอร์โทร → ร้านกดรับออเดอร์ → ทำ → กด READY → notify ลูกค้า → มารับ+จ่ายที่ POS
- ✅ หมายเหตุต่อรายการ ("ไม่ใส่ผัก") + หมายเหตุต่อออเดอร์
- ✅ ยกเลิกรายการ: ลูกค้ายกเลิกเองได้เฉพาะรายการที่ยัง `NEW` (ครัวยังไม่กดรับ) · staff ยกเลิกได้ทุกสถานะก่อนชำระ แต่รายการที่เข้า `COOKING` แล้วต้องมีสิทธิ์ `restaurant.order.void` (Manager ขึ้นไป โดย default) + ระบุเหตุผล
- ✅ ราคา snapshot ณ เวลาสั่ง (`nameSnapshot`, `unitPrice`, option ราคา ณ ตอนนั้น) — แก้เมนูภายหลังไม่กระทบออเดอร์เดิม
- ✅ เลขออเดอร์รายวันต่อ unit (`#0042` reset ทุกวันตาม timezone ร้าน) สำหรับเรียกลูกค้า takeaway/pickup
- 🔜 Delivery, สั่งซ้ำจากประวัติ (reorder), ตะกร้าร่วม realtime ระหว่างดีไวซ์ (MVP: เห็นออเดอร์ที่ submit แล้วร่วมกัน ตะกร้าใครตะกร้ามัน)

### 3.6 KDS (Kitchen Display System)
- ✅ สถานี (KdsStation) กำหนดเองได้ต่อ unit — seed เริ่มต้น: "ครัว" + "เครื่องดื่ม" · เมนูแต่ละตัวผูก 1 สถานี
- ✅ รายการไหลเข้าสถานีตัวเองเท่านั้น สถานะรายการ: `NEW → COOKING → READY → SERVED` (+ `CANCELLED`)
  - `NEW`: เข้าคิว (ครัวยังไม่กดรับ) · `COOKING`: กดรับแล้วกำลังทำ · `READY`: เสร็จ วางรอเสิร์ฟ · `SERVED`: เสิร์ฟถึงโต๊ะ/ส่งมอบแล้ว
  - กดข้ามขั้นได้เฉพาะไปข้างหน้า (`NEW→READY` ได้กรณีของพร้อมอยู่แล้ว) — ห้ามถอยหลัง ยกเว้นสิทธิ์ Manager (`recall`: READY→COOKING กรณีทำผิด)
- ✅ Expedite: staff (เสิร์ฟ/ผู้จัดการ) กดเร่งรายการ/ทั้งออเดอร์ → `isRush = true` เด้งขึ้นบนสุดทุกสถานีที่เกี่ยว พร้อมป้ายแดง "เร่ง"
- ✅ จอ Expo (คนเดินอาหาร): รวมทุกสถานี เฉพาะ `READY` จัดกลุ่มตามโต๊ะ → กด `SERVED` เมื่อวางถึงโต๊ะ
- ✅ Aging indicator: การ์ดเปลี่ยนสีขอบตามเวลารอ (>8 นาที เหลือง, >15 นาที แดง — ตั้งค่าได้)
- ✅ Realtime ผ่าน SSE (ตาม convention ข้อ 5) + เสียงเตือนรายการใหม่ (เปิด/ปิดได้ต่อจอ)
- ✅ ปุ่ม 86 เมนูจาก KDS ได้เลย (สิทธิ์ `restaurant.menu.stock`)
- 🔜 พิมพ์ใบครัว, สรุปยอดรายการค้างต่อสถานี (load balancing), all-day view (นับรวม "ผัดกะเพรา x12")

### 3.7 เรียกพนักงาน / ขอเช็คบิล
- ✅ ปุ่มบนหน้า QR ลูกค้า: "เรียกพนักงาน" (แนบข้อความสั้น optional) และ "ขอเช็คบิล" (เลือกวิธีจ่ายล่วงหน้า optional: เงินสด/QR)
- ✅ Request เด้ง realtime ที่ floor plan + แถบแจ้งเตือนหน้า staff ทุกจอ (SSE) — สถานะ `PENDING → ACKED → DONE`
- ✅ กันสแปม: ลูกค้ากดซ้ำประเภทเดิมได้เมื่อ request เดิมถูก ACK แล้ว หรือผ่านไป 2 นาที
- ✅ โต๊ะที่ขอเช็คบิลเปลี่ยนสีบน floor plan

### 3.8 บิล & ชำระเงิน (ผ่าน POS เท่านั้น — contract 2.1)
- ✅ หน้าบิลของ session: รวมทุกรายการ (ยกเว้น CANCELLED) + service charge ตามตั้งค่า (% bps) → ปุ่ม "ชำระ" ส่งเข้า POS `createSale`
- ✅ **รวมบิลทั้งโต๊ะ** = 1 PosSale
- ✅ **แยกบิลรายรายการ**: แคชเชียร์เลือกชุดรายการ → สร้าง PosSale ใบที่ 1 → เหลือรายการค้าง → สร้างใบถัดไป จนครบ → session ปิดอัตโนมัติ (รายการที่จ่ายแล้ว lock ห้ามแก้/ยกเลิก)
- ✅ จ่ายหลายวิธีในบิลเดียว (เงินสด+โอน) — ความสามารถของ POS `payMethods[]`, Restaurant แค่ส่ง lines
- ✅ **ลงบิลห้องพัก — payMethod `ROOM_CHARGE` (D12)**: แสดงเฉพาะ tenant ที่มี unit type HOTEL ที่ ACTIVE (ไม่งั้นซ่อน) — เลือกโรงแรม unit + ห้อง/รหัสจอง → POS เรียก `hotel.chargeToRoom({folioRef, amount, sourceSaleId})` (cross-unit) เข้า folio ห้องพัก · บิลที่จ่าย ROOM_CHARGE **ไม่ยิง point/account ที่ต้นทาง** (เกิดตอน settle ที่โรงแรมตามสเปค 01)
- ✅ คูปอง/แต้ม: ส่ง `couponCode` + `memberId` ไปกับ `createSale` — POS validate/redeem/earn เอง (Restaurant **ห้าม**คำนวณส่วนลด/แต้มเอง)
- ✅ Void บิล (ผ่าน POS void/reissue): POS ยิง event `pos.sale.voided` (ชื่อเต็มตาม D7) กลับ → Restaurant ปลด lock รายการ (กลับเป็นค้างชำระ) + reopen session ถ้าปิดไปแล้ว
- 🔜 Tip, แยกบิลหารเท่า per-seat, จ่ายออนไลน์ผ่าน gateway

### 3.9 เวลาเปิด-ปิดครัว
- ✅ ตารางเวลาให้บริการรายวัน (จ–อา, หลายช่วงต่อวันได้ เช่น 10:00–14:00 และ 16:00–21:00)
- ✅ Last order: X นาทีก่อนปิดช่วง (default 30) — เลย last order: QR/pickup สั่งไม่ได้ (ดูเมนูได้ + ป้าย "ครัวปิดแล้ว"), staff ยัง override สั่งได้ (สิทธิ์ Manager)
- ✅ ปิดครัวฉุกเฉิน (kill switch): ปุ่มเดียวหยุดรับออเดอร์ใหม่ทุกช่องทางทันที + ข้อความแจ้งลูกค้า (เช่น "แก๊สหมด ขออภัย")
- ✅ วันหยุดพิเศษ (override รายวันที่)
- 🔜 เวลาแยกต่อหมวดเมนู (เมนูเช้า auto ซ่อนนอกช่วง — MVP ใช้ availableFrom/To ของหมวดแล้ว แต่ตารางวันหยุด/ยกเว้นรายสัปดาห์เป็น 🔜)

### 3.10 Storefront (เมนูออนไลน์)
- ✅ `/s/[tenantSlug]/[unitSlug]` → หน้าเมนูสาธารณะ: หมวด/เมนู/รูป/ราคา/แท็ก, สถานะเปิด-ปิดครัว, ที่อยู่/เวลาเปิดร้าน — SEO-friendly (SSR)
- ✅ สั่ง pickup จากหน้านี้ (ข้อ 3.5) — ไม่บังคับ login (กรอกชื่อ+เบอร์), ถ้า login เป็นสมาชิกอยู่แล้ว auto-ผูก memberId
- ✅ ซ่อนเมนู 86/หมวดนอกช่วงเวลาอัตโนมัติ
- ✅ รองรับ custom domain ตาม BLUEPRINT ข้อ 7 (`shop.example.com/[unitSlug]`)
- 🔜 รีวิวเมนู, รูปแบบธีมร้าน, สั่ง delivery

---

## 4. Data Model (Prisma)

> ทุก model: `tenantId + unitId` (unit-scoped) ตาม BLUEPRINT_BUSINESS_UNITS · unique ภายในหน่วย = `@@unique([unitId, ...])`
> `Tenant`, `BusinessUnit`, `User` มาจาก core schema (Phase 0) — แสดง relation ฝั่งโมดูลนี้เท่านั้น
> `memberId` อ้าง `CustomerProfile` ของโมดูล Member (tenant-scoped) — เก็บเป็น String FK ไม่ duplicate ข้อมูลลูกค้า (convention 2.6)

### 4.1 Enums

```prisma
enum RestOrderType {
  DINE_IN
  TAKEAWAY   // หน้าเคาน์เตอร์ staff คีย์
  PICKUP     // ลูกค้าสั่งออนไลน์ มารับที่ร้าน
  DELIVERY   // 🔜 เผื่อไว้ — v1 ยังไม่เปิดใช้
}

enum RestOrderStatus {
  PENDING    // รอร้านรับ (QR โหมด requireApproval / pickup ทุกออเดอร์)
  CONFIRMED  // เข้าครัวแล้ว (รายการไหลเข้า KDS)
  COMPLETED  // ทุกรายการ SERVED หรือ CANCELLED
  CANCELLED  // ยกเลิกทั้งออเดอร์ (ก่อนชำระเท่านั้น)
}

enum KdsItemStatus {
  NEW        // เข้าคิวสถานี
  COOKING    // ครัวกดรับ กำลังทำ
  READY      // เสร็จ รอเสิร์ฟ/รอส่งมอบ
  SERVED     // เสิร์ฟถึงโต๊ะ / ลูกค้ารับแล้ว
  CANCELLED
}

enum TableSessionStatus {
  OPEN
  CLOSED     // ชำระครบ/ปิดปกติ
  MERGED     // ถูกรวมเข้า session อื่น
  CANCELLED  // ปิดโดยไม่มีธุรกรรม (เปิดผิด/ลูกค้าไม่สั่ง)
}

enum TableShape {
  RECT
  ROUND
}

enum TableStatus {
  ACTIVE
  INACTIVE   // ปิดใช้ชั่วคราว (ชำรุด) — ไม่รับ session ใหม่
}

enum ServiceRequestType {
  CALL_STAFF
  REQUEST_BILL
}

enum ServiceRequestStatus {
  PENDING
  ACKED
  DONE
}

enum MenuItemStatus {
  ACTIVE
  HIDDEN     // ซ่อนจากลูกค้า (staff ยังสั่งได้ เช่น เมนูลับ)
  ARCHIVED   // เก็บถาวร (soft delete)
}

enum PickupStatus {
  AWAITING_CONFIRM  // รอร้านกดรับ
  ACCEPTED
  READY             // พร้อมรับ → notify ลูกค้า
  PICKED_UP
  NO_SHOW           // เลยเวลารับ + ติดต่อไม่ได้
}
```

### 4.2 ตั้งค่าร้านอาหาร (1:1 ต่อ unit)

```prisma
model RestaurantSetting {
  id                 String   @id @default(cuid())
  tenantId           String
  unitId             String   @unique                 // 1 unit = 1 setting
  unit               BusinessUnit @relation(fields: [unitId], references: [id])

  // บิล
  serviceChargeBps   Int      @default(0)             // 1000 = 10% (basis points)
  requireApproval    Boolean  @default(false)         // QR order ต้องรอ staff รับก่อนเข้าครัว

  // ครัว
  serviceHours       Json     @default("[]")          // [{dow:1, ranges:[{open:"10:00", close:"21:00"}]}] เวลา local ของ unit
  specialClosures    Json     @default("[]")          // [{date:"2026-04-13", closed:true, note:"สงกรานต์"}]
  lastOrderMins      Int      @default(30)            // นาทีก่อนปิดช่วง = last order
  kitchenPaused      Boolean  @default(false)         // kill switch
  kitchenPausedNote  String?                          // ข้อความแจ้งลูกค้า

  // KDS
  kdsWarnMins        Int      @default(8)             // เหลือง
  kdsCriticalMins    Int      @default(15)            // แดง

  // Pickup
  pickupEnabled      Boolean  @default(false)
  pickupSlotMins     Int      @default(15)            // ขนาด slot เวลารับ
  pickupLeadMins     Int      @default(20)            // สั่งล่วงหน้าอย่างน้อย X นาที

  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@index([tenantId])
}
```

### 4.3 เมนู / หมวด / ตัวเลือก

```prisma
model MenuCategory {
  id            String   @id @default(cuid())
  tenantId      String
  unitId        String
  name          String                    // TH (หลัก)
  nameEn        String?
  imageUrl      String?
  sortOrder     Int      @default(0)
  isVisible     Boolean  @default(true)
  availableFrom String?                   // "06:00" local — null = ทั้งวัน
  availableTo   String?                   // "11:00"
  archivedAt    DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  items         MenuItem[]

  @@unique([unitId, name])
  @@index([tenantId])
  @@index([unitId, sortOrder])
}

model MenuItem {
  id             String   @id @default(cuid())
  tenantId       String
  unitId         String
  categoryId     String
  category       MenuCategory @relation(fields: [categoryId], references: [id])
  stationId      String
  station        KdsStation   @relation(fields: [stationId], references: [id])

  name           String                   // TH
  nameEn         String?
  description    String?
  descriptionEn  String?
  images         Json     @default("[]")  // ["url1","url2"] — index 0 = cover
  basePrice      Int                      // สตางค์
  sku            String?
  tags           Json     @default("[]")  // ["SPICY","VEGAN","RECOMMENDED","NEW"]
  prepMinutes    Int?                     // เวลาเตรียมโดยประมาณ
  sortOrder      Int      @default(0)
  status         MenuItemStatus @default(ACTIVE)

  // 86 / สต็อกระดับเมนู (MVP)
  isOutOfStock   Boolean  @default(false) // 86 manual
  stockQty       Int?                     // null = ไม่นับสต็อก · หักตอน confirm order · 0 = auto-86
  dailyStockQty  Int?                     // null = ไม่ reset · ตั้งแล้ว reset stockQty ทุกวันตอนร้านเปิด

  archivedAt     DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  optionGroups   MenuItemOptionGroup[]
  orderItems     RestaurantOrderItem[]
  recipe         RecipeLine[]             // 🔜 Phase 2 (BOM)

  @@unique([unitId, sku])                 // sku ไม่ซ้ำใน unit (null ได้หลายแถว)
  @@index([tenantId])
  @@index([unitId, categoryId, sortOrder])
  @@index([unitId, status, isOutOfStock])
}

model OptionGroup {
  id         String   @id @default(cuid())
  tenantId   String
  unitId     String
  name       String                       // "ขนาด" / "ความหวาน" / "Topping"
  nameEn     String?
  minSelect  Int      @default(0)         // 0 = ไม่บังคับ
  maxSelect  Int      @default(1)         // >1 = เลือกหลายตัว, ต้อง >= minSelect
  archivedAt DateTime?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  choices    OptionChoice[]
  items      MenuItemOptionGroup[]

  @@unique([unitId, name])
  @@index([tenantId])
}

model OptionChoice {
  id           String   @id @default(cuid())
  tenantId     String
  unitId       String
  groupId      String
  group        OptionGroup @relation(fields: [groupId], references: [id])
  name         String                     // "พิเศษ" / "หวาน 50%" / "ไข่มุก"
  nameEn       String?
  priceDelta   Int      @default(0)       // สตางค์ — ติดลบได้
  isDefault    Boolean  @default(false)
  isOutOfStock Boolean  @default(false)   // 86 รายตัวเลือก
  sortOrder    Int      @default(0)
  archivedAt   DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([groupId, name])
  @@index([tenantId])
  @@index([unitId])
}

model MenuItemOptionGroup {              // join: เมนู ↔ กลุ่มตัวเลือก (reusable)
  id         String @id @default(cuid())
  tenantId   String
  unitId     String
  itemId     String
  item       MenuItem    @relation(fields: [itemId], references: [id])
  groupId    String
  group      OptionGroup @relation(fields: [groupId], references: [id])
  sortOrder  Int    @default(0)

  @@unique([itemId, groupId])
  @@index([tenantId])
  @@index([unitId])
}
```

### 4.4 สถานี KDS

```prisma
model KdsStation {
  id        String   @id @default(cuid())
  tenantId  String
  unitId    String
  name      String                        // "ครัว" / "เครื่องดื่ม" (seed default 2 สถานี)
  nameEn    String?
  sortOrder Int      @default(0)
  archivedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  menuItems  MenuItem[]
  orderItems RestaurantOrderItem[]

  @@unique([unitId, name])
  @@index([tenantId])
}
```

### 4.5 โซน / โต๊ะ / Floor plan

```prisma
model RestaurantZone {
  id        String   @id @default(cuid())
  tenantId  String
  unitId    String
  name      String                        // "ในร้าน" / "ระเบียง"
  sortOrder Int      @default(0)
  archivedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tables    DiningTable[]

  @@unique([unitId, name])
  @@index([tenantId])
}

model DiningTable {
  id        String      @id @default(cuid())
  tenantId  String
  unitId    String
  zoneId    String
  zone      RestaurantZone @relation(fields: [zoneId], references: [id])
  name      String                        // "A1", "โต๊ะ 5"
  seats     Int         @default(4)
  shape     TableShape  @default(RECT)
  posX      Int         @default(0)       // grid unit บน floor plan
  posY      Int         @default(0)
  width     Int         @default(2)
  height    Int         @default(2)
  qrToken   String      @unique @default(cuid())  // QR ถาวร — rotate ได้
  status    TableStatus @default(ACTIVE)
  archivedAt DateTime?
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt

  sessions  TableSession[]

  @@unique([unitId, name])
  @@index([tenantId])
  @@index([unitId, zoneId])
}
```

### 4.6 Session โต๊ะ

```prisma
model TableSession {
  id             String   @id @default(cuid())
  tenantId       String
  unitId         String
  tableId        String
  table          DiningTable @relation(fields: [tableId], references: [id])
  status         TableSessionStatus @default(OPEN)
  guestCount     Int?
  memberId       String?                  // CustomerProfile.id (tenant-scoped) — ผูกเพื่อสะสมแต้ม
  openedByUserId String?                  // staff ที่เปิด (null = ลูกค้าเปิดผ่าน QR)
  mergedIntoId   String?                  // → TableSession ปลายทาง เมื่อ status=MERGED
  mergedInto     TableSession?  @relation("SessionMerge", fields: [mergedIntoId], references: [id])
  mergedFrom     TableSession[] @relation("SessionMerge")
  openedAt       DateTime @default(now())
  closedAt       DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  orders          RestaurantOrder[]
  serviceRequests ServiceRequest[]

  @@index([tenantId])
  @@index([unitId, status])
  @@index([unitId, tableId, status])
  // ⚠️ ต้องมี partial unique index (migration SQL — Prisma ยังประกาศ partial ไม่ได้):
  // CREATE UNIQUE INDEX one_open_session_per_table
  //   ON "TableSession" ("tableId") WHERE status = 'OPEN';
}
```

### 4.7 ออเดอร์ + รายการ + ตัวเลือกที่เลือก

```prisma
model RestaurantOrder {
  id            String   @id @default(cuid())
  tenantId      String
  unitId        String
  type          RestOrderType
  status        RestOrderStatus @default(CONFIRMED)
  sessionId     String?                   // DINE_IN เท่านั้น
  session       TableSession? @relation(fields: [sessionId], references: [id])

  bizDate       String                    // "2026-07-11" ตาม timezone unit — ใช้ทำเลขรายวัน+รายงาน
  dailyNo       Int                       // running ต่อวันต่อ unit → แสดง "#0042"

  memberId      String?                   // ผูกสมาชิก (takeaway/pickup ผูกที่ order, dine-in ผูกที่ session)
  guestName     String?                   // pickup/takeaway ไม่ login
  guestPhone    String?
  guestToken    String?                   // cookie token ของดีไวซ์ที่สั่ง (QR) — ใช้ claim/merge เป็น member
  note          String?
  isRush        Boolean  @default(false)  // expedite ทั้งออเดอร์

  // Pickup
  pickupStatus  PickupStatus?
  pickupAt      DateTime?                 // เวลานัดรับ
  readyAt       DateTime?
  pickedUpAt    DateTime?

  placedByUserId String?                  // staff ที่คีย์ (null = ลูกค้าสั่งเอง)
  cancelReason   String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  items         RestaurantOrderItem[]

  @@unique([unitId, bizDate, dailyNo])
  @@index([tenantId])
  @@index([unitId, bizDate, type])
  @@index([unitId, status])
  @@index([sessionId])
}

model RestaurantOrderItem {
  id            String   @id @default(cuid())
  tenantId      String
  unitId        String
  orderId       String
  order         RestaurantOrder @relation(fields: [orderId], references: [id])
  menuItemId    String?                   // null ได้กรณีเมนูถูก archive ภายหลัง (snapshot ยังอยู่)
  menuItem      MenuItem? @relation(fields: [menuItemId], references: [id])
  stationId     String
  station       KdsStation @relation(fields: [stationId], references: [id])

  nameSnapshot  String                    // freeze ชื่อ ณ เวลาสั่ง
  unitPrice     Int                       // สตางค์ ราคาฐาน ณ เวลาสั่ง
  optionsTotal  Int      @default(0)      // สตางค์ รวม priceDelta ต่อ 1 หน่วย
  qty           Int      @default(1)
  lineTotal     Int                       // (unitPrice + optionsTotal) * qty — denormalize เพื่อรายงานเร็ว
  note          String?

  kdsStatus     KdsItemStatus @default(NEW)
  isRush        Boolean  @default(false)
  cookingAt     DateTime?
  readyAt       DateTime?
  servedAt      DateTime?
  cancelledAt   DateTime?
  cancelReason  String?
  cancelledByUserId String?

  // ชำระเงิน (แยกบิลรายรายการ)
  saleId        String?                   // PosSale.id ของ POS เมื่อรายการนี้ถูกชำระ → lock
  settledAt     DateTime?

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  options       RestaurantOrderItemOption[]

  @@index([tenantId])
  @@index([unitId, stationId, kdsStatus])         // คิว KDS ต่อสถานี
  @@index([unitId, kdsStatus, isRush, createdAt]) // จัดเรียงคิว + expo
  @@index([orderId])
  @@index([unitId, menuItemId])                   // รายงานขายดี
  @@index([saleId])
}

model RestaurantOrderItemOption {
  id             String @id @default(cuid())
  tenantId       String
  unitId         String
  orderItemId    String
  orderItem      RestaurantOrderItem @relation(fields: [orderItemId], references: [id])
  choiceId       String?                  // อ้างอิงเดิม (null ได้ถ้า choice ถูกลบ)
  groupSnapshot  String                   // "ขนาด"
  choiceSnapshot String                   // "พิเศษ"
  priceDelta     Int    @default(0)       // สตางค์ ณ เวลาสั่ง

  @@index([tenantId])
  @@index([unitId])
  @@index([orderItemId])
}
```

### 4.8 เรียกพนักงาน / ขอเช็คบิล

```prisma
model ServiceRequest {
  id           String   @id @default(cuid())
  tenantId     String
  unitId       String
  sessionId    String
  session      TableSession @relation(fields: [sessionId], references: [id])
  type         ServiceRequestType
  status       ServiceRequestStatus @default(PENDING)
  note         String?                    // ข้อความจากลูกค้า / วิธีจ่ายที่เลือกล่วงหน้า
  ackedByUserId String?
  ackedAt      DateTime?
  doneAt       DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([tenantId])
  @@index([unitId, status, createdAt])
  @@index([sessionId])
}
```

### 4.9 🔜 Phase 2 — สต็อกวัตถุดิบ (Recipe/BOM) — schema จองไว้ ยังไม่ implement

> เหตุผลที่เลื่อน: ต้องพึ่ง Inventory เต็มรูปของ POS (หน่วยนับ/แปลงหน่วย/รับของ/นับสต็อก) — ทำครึ่งเดียวจะได้ตัวเลขสต็อกมั่ว แย่กว่าไม่มี · MVP ใช้ `stockQty` ระดับเมนู (ข้อ 4.3) ที่ตอบโจทย์ "กันขายของหมด" ได้จริงก่อน

```prisma
model Ingredient {                        // 🔜 วัตถุดิบ
  id        String  @id @default(cuid())
  tenantId  String
  unitId    String
  name      String
  unitName  String                        // "กรัม" "ฟอง" "ขวด"
  stockQty  Decimal @default(0) @db.Decimal(12, 3)
  lowAlertQty Decimal? @db.Decimal(12, 3)
  archivedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  recipeLines RecipeLine[]
  movements   IngredientMovement[]

  @@unique([unitId, name])
  @@index([tenantId])
}

model RecipeLine {                        // 🔜 BOM: เมนู 1 จานใช้วัตถุดิบอะไรเท่าไหร่
  id           String  @id @default(cuid())
  tenantId     String
  unitId       String
  menuItemId   String
  menuItem     MenuItem   @relation(fields: [menuItemId], references: [id])
  ingredientId String
  ingredient   Ingredient @relation(fields: [ingredientId], references: [id])
  qtyPerUnit   Decimal    @db.Decimal(12, 3)

  @@unique([menuItemId, ingredientId])
  @@index([tenantId])
  @@index([unitId])
}

model IngredientMovement {                // 🔜 ledger เข้า-ออก ตรวจสอบย้อนได้
  id           String  @id @default(cuid())
  tenantId     String
  unitId       String
  ingredientId String
  ingredient   Ingredient @relation(fields: [ingredientId], references: [id])
  delta        Decimal @db.Decimal(12, 3) // + รับเข้า / - หักจากออเดอร์/ปรับ
  reason       String                     // RECEIVE | ORDER_DEDUCT | ADJUST | WASTE
  refType      String?
  refId        String?
  createdByUserId String?
  createdAt    DateTime @default(now())

  @@index([tenantId])
  @@index([unitId, ingredientId, createdAt])
}
```

### 4.10 สรุปจำนวน model

MVP: 13 models (`RestaurantSetting`, `MenuCategory`, `MenuItem`, `OptionGroup`, `OptionChoice`, `MenuItemOptionGroup`, `KdsStation`, `RestaurantZone`, `DiningTable`, `TableSession`, `RestaurantOrder`, `RestaurantOrderItem`, `RestaurantOrderItemOption`, `ServiceRequest`) — จริงๆ 14 · 🔜 อีก 3 (`Ingredient`, `RecipeLine`, `IngredientMovement`) · enums 10

---

## 5. API Endpoints

> ทุกเส้นทาง dashboard อยู่ใต้ `/api/u/[unitId]/restaurant/...` — middleware ตรวจ `unitId ∈ tenant` + `can(user, {tenantId, unitId, module:'RESTAURANT', action})` ก่อนเข้า handler เสมอ
> เส้นทาง storefront (public) อยู่ใต้ `/api/store/[tenantSlug]/[unitSlug]/...` — ไม่ต้อง login แต่ตรวจ `qrToken`/`guestToken` + unit ACTIVE + module เปิด

### 5.1 ตั้งค่า

| Method | Path | Body หลัก | สิทธิ์ |
|---|---|---|---|
| GET | `/api/u/[unitId]/restaurant/settings` | — | `restaurant.settings.view` |
| PATCH | `/api/u/[unitId]/restaurant/settings` | ฟิลด์ RestaurantSetting (partial) | `restaurant.settings.manage` |
| POST | `/api/u/[unitId]/restaurant/settings/kitchen-pause` | `{ paused: bool, note? }` | `restaurant.settings.kitchen` (Manager+) |

### 5.2 เมนู

| Method | Path | Body หลัก | สิทธิ์ |
|---|---|---|---|
| GET | `/api/u/[unitId]/restaurant/categories` | — | `restaurant.menu.view` |
| POST | `/api/u/[unitId]/restaurant/categories` | `{ name, nameEn?, imageUrl?, availableFrom?, availableTo? }` | `restaurant.menu.manage` |
| PATCH | `/api/u/[unitId]/restaurant/categories/[id]` | partial + `{ sortOrder }` | `restaurant.menu.manage` |
| DELETE | `/api/u/[unitId]/restaurant/categories/[id]` | soft (archivedAt) — ห้ามลบถ้ามีเมนู ACTIVE | `restaurant.menu.manage` |
| GET | `/api/u/[unitId]/restaurant/items?categoryId&status&q` | — | `restaurant.menu.view` |
| POST | `/api/u/[unitId]/restaurant/items` | `{ categoryId, stationId, name, basePrice, images[], tags[], optionGroupIds[], ... }` | `restaurant.menu.manage` |
| PATCH | `/api/u/[unitId]/restaurant/items/[id]` | partial | `restaurant.menu.manage` |
| POST | `/api/u/[unitId]/restaurant/items/[id]/duplicate` | — | `restaurant.menu.manage` |
| POST | `/api/u/[unitId]/restaurant/items/[id]/stock` | `{ isOutOfStock?, stockQty?, dailyStockQty? }` (86/ปลด/ตั้งจำนวน) | `restaurant.menu.stock` |
| POST | `/api/u/[unitId]/restaurant/items/import` | CSV multipart | `restaurant.menu.manage` |
| GET/POST | `/api/u/[unitId]/restaurant/option-groups` | `{ name, minSelect, maxSelect, choices: [{name, priceDelta, isDefault}] }` | view / manage |
| PATCH/DELETE | `/api/u/[unitId]/restaurant/option-groups/[id]` | partial / soft delete | `restaurant.menu.manage` |
| PATCH | `/api/u/[unitId]/restaurant/option-choices/[id]` | `{ priceDelta?, isOutOfStock?, ... }` | manage (86 ใช้ `menu.stock`) |

### 5.3 โซน / โต๊ะ / floor plan

| Method | Path | Body หลัก | สิทธิ์ |
|---|---|---|---|
| GET/POST | `/api/u/[unitId]/restaurant/zones` | `{ name }` | table.view / table.manage |
| PATCH/DELETE | `/api/u/[unitId]/restaurant/zones/[id]` | | `restaurant.table.manage` |
| GET | `/api/u/[unitId]/restaurant/tables?zoneId` | รวมสถานะ session ปัจจุบัน (ว่าง/มีลูกค้า/ยอด/เวลานั่ง/request ค้าง) | `restaurant.table.view` |
| POST | `/api/u/[unitId]/restaurant/tables` | `{ zoneId, name, seats, shape }` | `restaurant.table.manage` |
| PATCH | `/api/u/[unitId]/restaurant/tables/[id]` | partial + `{ status }` | `restaurant.table.manage` |
| PUT | `/api/u/[unitId]/restaurant/tables/layout` | `[{ id, posX, posY, width, height }]` bulk บันทึก floor plan | `restaurant.table.manage` |
| POST | `/api/u/[unitId]/restaurant/tables/[id]/rotate-qr` | — คืน qrToken ใหม่ + PNG/PDF ลิงก์พิมพ์ | `restaurant.table.manage` |
| GET | `/api/u/[unitId]/restaurant/tables/qr-sheet` | PDF QR ทุกโต๊ะ (พิมพ์สติกเกอร์) | `restaurant.table.manage` |

### 5.4 Session

| Method | Path | Body หลัก | สิทธิ์ |
|---|---|---|---|
| POST | `/api/u/[unitId]/restaurant/sessions` | `{ tableId, guestCount? }` เปิดโต๊ะโดย staff | `restaurant.order.take` |
| GET | `/api/u/[unitId]/restaurant/sessions/[id]` | รวม orders+items+requests+ยอดค้างชำระ | `restaurant.order.view` |
| POST | `/api/u/[unitId]/restaurant/sessions/[id]/move` | `{ toTableId }` | `restaurant.table.operate` |
| POST | `/api/u/[unitId]/restaurant/sessions/[id]/merge` | `{ fromSessionId }` (from → ตัวนี้) | `restaurant.table.operate` |
| POST | `/api/u/[unitId]/restaurant/sessions/[id]/link-member` | `{ memberId }` (staff ค้นสมาชิกให้) | `restaurant.order.take` |
| POST | `/api/u/[unitId]/restaurant/sessions/[id]/close` | `{ reason? }` — ได้เฉพาะไม่มีรายการค้างชำระ | `restaurant.order.take` (มีรายการ→`restaurant.order.void`) |

### 5.5 ออเดอร์ (staff)

| Method | Path | Body หลัก | สิทธิ์ |
|---|---|---|---|
| GET | `/api/u/[unitId]/restaurant/orders?bizDate&type&status` | | `restaurant.order.view` |
| POST | `/api/u/[unitId]/restaurant/orders` | `{ type, sessionId?, items:[{menuItemId, qty, note?, choices:[choiceId]}], guestName?, guestPhone?, note?, pickupAt? }` | `restaurant.order.take` |
| POST | `/api/u/[unitId]/restaurant/orders/[id]/confirm` | รับออเดอร์ PENDING (QR approval mode / pickup) | `restaurant.order.take` |
| POST | `/api/u/[unitId]/restaurant/orders/[id]/cancel` | `{ reason }` ทั้งออเดอร์ (ก่อนชำระ) | NEW ทั้งหมด→`order.take` · มี COOKING+→`order.void` |
| POST | `/api/u/[unitId]/restaurant/orders/[id]/rush` | expedite ทั้งออเดอร์ | `restaurant.order.take` |
| POST | `/api/u/[unitId]/restaurant/order-items/[id]/cancel` | `{ reason }` รายรายการ | เงื่อนไขเดียวกับ cancel order |
| POST | `/api/u/[unitId]/restaurant/order-items/[id]/rush` | expedite รายรายการ | `restaurant.order.take` |
| POST | `/api/u/[unitId]/restaurant/orders/[id]/pickup-status` | `{ status: ACCEPTED\|READY\|PICKED_UP\|NO_SHOW }` | `restaurant.order.take` |

### 5.6 KDS

| Method | Path | Body หลัก | สิทธิ์ |
|---|---|---|---|
| GET | `/api/u/[unitId]/restaurant/kds/[stationId]?statuses=NEW,COOKING` | คิวสถานี (จัดเรียง rush→เวลา) | `restaurant.kds.operate` |
| GET | `/api/u/[unitId]/restaurant/kds/[stationId]/stream` | **SSE**: item.created/updated/cancelled, stock.changed, order.rushed | `restaurant.kds.operate` |
| POST | `/api/u/[unitId]/restaurant/order-items/[id]/kds-status` | `{ status: COOKING\|READY\|SERVED }` (ไปข้างหน้าเท่านั้น) | `restaurant.kds.operate` |
| POST | `/api/u/[unitId]/restaurant/order-items/[id]/recall` | READY→COOKING | `restaurant.kds.recall` (Manager+) |
| GET | `/api/u/[unitId]/restaurant/kds/expo` + `/expo/stream` | ทุกสถานี เฉพาะ READY จัดกลุ่มตามโต๊ะ (SSE) | `restaurant.kds.operate` |
| GET/POST/PATCH | `/api/u/[unitId]/restaurant/stations[...]` | จัดการสถานี | `restaurant.settings.manage` |

### 5.7 Service Request + เช็คบิล

| Method | Path | Body หลัก | สิทธิ์ |
|---|---|---|---|
| GET | `/api/u/[unitId]/restaurant/service-requests?status=PENDING` + `/stream` (SSE) | | `restaurant.order.view` |
| POST | `/api/u/[unitId]/restaurant/service-requests/[id]/ack` · `/done` | | `restaurant.order.take` |
| GET | `/api/u/[unitId]/restaurant/sessions/[id]/bill` | preview: รายการค้างชำระ + service charge + รวม | `restaurant.checkout` |
| POST | `/api/u/[unitId]/restaurant/sessions/[id]/checkout` | `{ orderItemIds: [] \| "ALL", couponCode?, memberId?, payMethods:[{type, amount}] }` → เรียก POS `createSale` → lock items → คืน `{ saleId, receiptNo, total, pointEarned, remainingItems }` | `restaurant.checkout` |
| POST | `/api/u/[unitId]/restaurant/orders/[id]/checkout` | เวอร์ชัน takeaway/pickup (ไม่มี session) payload เดียวกัน | `restaurant.checkout` |

### 5.8 Storefront / QR (public — ไม่ต้อง login)

| Method | Path | Body หลัก | Auth |
|---|---|---|---|
| GET | `/api/store/[tenantSlug]/[unitSlug]/menu` | เมนู public (กรอง 86/ซ่อน/นอกเวลาแล้ว) + สถานะครัว | — |
| GET | `/api/store/[tenantSlug]/[unitSlug]/t/[qrToken]` | ตรวจ QR → get-or-create session OPEN → set `guestToken` cookie → สถานะโต๊ะ+ออเดอร์รวมโต๊ะ | qrToken |
| POST | `/api/store/[tenantSlug]/[unitSlug]/t/[qrToken]/orders` | `{ items:[{menuItemId, qty, note?, choices[]}], note? }` — validate 86/ราคา/เวลาครัว | qrToken + guestToken |
| GET | `/api/store/[tenantSlug]/[unitSlug]/t/[qrToken]/stream` | SSE: สถานะรายการ (COOKING/READY/SERVED), บิล, request ack | qrToken + guestToken |
| POST | `/api/store/[tenantSlug]/[unitSlug]/t/[qrToken]/service-requests` | `{ type, note? }` | qrToken + guestToken |
| POST | `/api/store/[tenantSlug]/[unitSlug]/t/[qrToken]/link-member` | `{ phone }` → ยิง OTP (Member service) → `{ otp }` ยืนยัน → ผูก memberId เข้า session | qrToken + guestToken |
| POST | `/api/store/[tenantSlug]/[unitSlug]/pickup-orders` | `{ items[], guestName, guestPhone, pickupAt }` (login แล้ว auto memberId) | rate-limited |
| GET | `/api/store/[tenantSlug]/[unitSlug]/pickup-orders/[id]?token=` | ติดตามสถานะ (token ใน SMS/หน้า confirm) | order token |

### 5.9 รายงาน

| Method | Path | สิทธิ์ |
|---|---|---|
| GET | `/api/u/[unitId]/restaurant/reports/best-sellers?from&to&categoryId&limit` | `restaurant.report.view` |
| GET | `/api/u/[unitId]/restaurant/reports/table-revenue?from&to&groupBy=table\|zone` | `restaurant.report.view` |
| GET | `/api/u/[unitId]/restaurant/reports/peak-hours?from&to` (heatmap ชม.×วัน) | `restaurant.report.view` |
| GET | `/api/u/[unitId]/restaurant/reports/prep-time?from&to&stationId` | `restaurant.report.view` |
| GET | `/api/u/[unitId]/restaurant/reports/cancellations?from&to` + 86 log | `restaurant.report.view` |
| GET | `/api/u/[unitId]/restaurant/reports/export?report=...&format=csv` | `restaurant.report.view` |

รวม ~45 endpoints (dashboard 37 + storefront 8)

---

## 6. UI Screens

> ทุกหน้า: i18n TH/EN · B&W minimal · mobile-first · empty/loading/error state ครบ ตาม convention ข้อ 5

### 6.1 Dashboard `(app)` — `/app/u/[unitSlug]/restaurant/...`

| # | หน้า | path | เนื้อหา + mobile behavior |
|---|---|---|---|
| D1 | **Floor plan (หน้าหลัก)** | `/tables` | ผังโต๊ะ realtime: สีสถานะ (ขาว=ว่าง, ดำ=มีลูกค้า, กะพริบ=มี request, ขอบหนา=ขอเช็คบิล), ยอดสะสม+เวลานั่งบนการ์ดโต๊ะ · แตะโต๊ะ → bottom sheet (เปิดโต๊ะ/ดูบิล/สั่งเพิ่ม/ย้าย/รวม/เช็คบิล) · มือถือ: list view ต่อโซนสลับกับผังได้ · โหมดแก้ไขผัง (drag-drop, grid snap) แยกด้วยปุ่ม "แก้ไขผัง" |
| D2 | **Session/บิลโต๊ะ** | `/tables/[tableId]/session` | รายการทุกออเดอร์ของโต๊ะ + สถานะรายจาน, ปุ่มสั่งเพิ่ม/ยกเลิกรายการ/expedite, ผูกสมาชิก, ย้าย/รวมโต๊ะ, ปุ่ม "เช็คบิล" |
| D3 | **คีย์ออเดอร์ (staff)** | `/order?tableId&type` | เลือกเมนูแบบ grid มีรูป, แถบหมวดบน, ป้าย 86 จาง+กดไม่ได้, modal ตัวเลือก (บังคับเลือกตาม min/max, ราคาอัปเดตสด), ตะกร้อสรุป → ส่งครัว · มือถือ: ตะกร้าเป็น bottom bar |
| D4 | **คิวออเดอร์รวม** | `/orders` | แท็บ: รอรับ (PENDING) / กำลังทำ / Pickup / เสร็จ / ยกเลิก — ปุ่มรับ/ปฏิเสธ pickup, ปุ่ม READY→notify |
| D5 | **KDS ต่อสถานี** | `/kds/[stationId]` | fullscreen การ์ดรายการ 3 คอลัมน์ NEW/COOKING/READY (แท็บเล็ตแนวนอน), rush ปักหมุดบน+ป้ายแดง, aging สีขอบ, แตะการ์ด = เลื่อนสถานะ, ปุ่ม 86 มุมการ์ด, เสียงเตือน toggle · ออกแบบให้ใช้บนแท็บเล็ตถูกๆ/จอทีวี+เมาส์ได้ |
| D6 | **Expo** | `/kds/expo` | เฉพาะ READY ทุกสถานี จัดกลุ่มตามโต๊ะ/ออเดอร์ → กด SERVED |
| D7 | **เช็คบิล/แยกบิล** | `/checkout/[sessionId]` | รายการค้างชำระ (checkbox เลือกแยกบิล), service charge, ช่องคูปอง, ค้นสมาชิก, เลือกวิธีจ่ายหลายแถว (เงินสด/โอน/PromptPay/บัตร/ลงบิลห้องพัก ROOM_CHARGE — เฉพาะ tenant มี HOTEL unit) → เรียก POS → แสดงใบเสร็จ/ปุ่มพิมพ์ · จ่ายบางส่วนแล้ววนกลับจนครบ |
| D8 | **จัดการเมนู** | `/menu` | 2 pane (มือถือ: 2 ชั้น): หมวดซ้าย เมนูขวา, drag จัดลำดับ, ค้นหา, bulk ซ่อน/ย้ายหมวด, ปุ่ม import CSV |
| D9 | **ฟอร์มเมนู** | `/menu/items/[id]` | ฟิลด์ครบ + อัปโหลดหลายรูป (ลากเรียง, รูปแรก=cover) + เลือกสถานี + ผูก option groups (ลำดับ) + ตั้ง stockQty/daily |
| D10 | **Option Groups** | `/menu/options` | รายการกลุ่ม + choices inline edit (ชื่อ/ราคาเพิ่ม/default/86) + แสดงว่าใช้กับกี่เมนู |
| D11 | **86 Quick Panel** | `/menu/stock` | ตารางเมนูทั้งร้าน toggle 86 + แก้ stockQty เร็วๆ — หน้าที่แม่ครัวเปิดค้างได้ |
| D12 | **โต๊ะ & โซน & QR** | `/tables/manage` | CRUD โซน/โต๊ะ, พิมพ์ QR รายโต๊ะ/ทั้งร้าน (PDF สติกเกอร์มีชื่อโต๊ะ), rotate token |
| D13 | **ตั้งค่า** | `/settings` | เวลาเปิด-ปิดครัว (editor รายวัน+หลายช่วง), last order, service charge, requireApproval, pickup on/off + slot, KDS thresholds, สถานี, ปุ่มปิดครัวฉุกเฉิน (confirm 2 ชั้น) |
| D14 | **รายงาน** | `/reports` | แท็บ: ขายดี (ตาราง+กราฟแท่ง) / ยอดต่อโต๊ะ-โซน / peak hours (heatmap) / เวลาเตรียม / ยกเลิก & 86 · ตัวเลือกช่วงวันที่ + export CSV |

### 6.2 Storefront `(store)` — `/s/[tenantSlug]/[unitSlug]/...` (+ custom domain)

| # | หน้า | path | เนื้อหา |
|---|---|---|---|
| S1 | **เมนูออนไลน์ (public)** | `/` | SSR SEO: ชื่อร้าน โลโก้ เวลาเปิด สถานะครัว, เมนูตามหมวด (รูป+ราคา+แท็ก), ปุ่ม "สั่งกลับบ้าน (pickup)" ถ้าเปิดใช้ |
| S2 | **QR โต๊ะ — เมนู+สั่ง** | `/t/[qrToken]` | header: ชื่อร้าน+เลขโต๊ะ · เมนู→modal ตัวเลือก→ตะกร้า (bottom bar)→ยืนยันสั่ง · **ไม่มี login wall** · แท็บ "ออเดอร์โต๊ะนี้" เห็นรวมทุกดีไวซ์+สถานะสด (SSE) · ปุ่มลอย: เรียกพนักงาน / ขอเช็คบิล · แบนเนอร์ "รับแต้ม? ผูกเบอร์สมาชิก" → OTP → ผูก session |
| S3 | **บิลโต๊ะ (ลูกค้า)** | `/t/[qrToken]/bill` | ยอดสะสม + service charge โดยประมาณ + สถานะจ่ายแล้ว/ค้าง |
| S4 | **สั่ง Pickup** | `/pickup` | เมนู→ตะกร้า→เลือกเวลารับ (slot)→ชื่อ+เบอร์ (หรือบัญชีสมาชิก)→ยืนยัน → หน้า confirm มีลิงก์ติดตาม |
| S5 | **ติดตาม Pickup** | `/pickup/[orderId]?token=` | สถานะสด: ร้านรับแล้ว→กำลังทำ→พร้อมรับ (แจ้งเตือน) — เลขออเดอร์ตัวใหญ่ไว้โชว์หน้าร้าน |

มือถือคือ primary ของ S ทุกหน้า (ลูกค้าใช้มือถือ 100%) — ปุ่มใหญ่ แตะง่าย ไม่มี hover-only

รวม 19 screens (dashboard 14 + storefront 5)

---

## 7. Business Flows

### 7.1 QR dine-in (happy path)

```
1. ลูกค้าสแกน QR โต๊ะ A1 → GET /t/[qrToken]
   → server: ตรวจ token, unit ACTIVE, ครัวเปิด?
   → tx: get-or-create TableSession OPEN ของโต๊ะ (partial unique กัน 2 ดีไวซ์สแกนพร้อมกัน
        — แพ้ unique → retry อ่าน session เดิม)
   → set cookie guestToken (scope: session นี้)
2. ลูกค้าเลือกเมนู → modal ตัวเลือก (validate min/maxSelect ฝั่ง client) → ตะกร้า
3. กดสั่ง → POST /t/[qrToken]/orders
   → server ใน transaction เดียว:
     a. validate: session ยัง OPEN, ครัวเปิด+ไม่เลย last order, ทุก item ACTIVE+ไม่ 86,
        ทุก choice ไม่ 86, min/maxSelect ถูกต้อง
     b. เมนูที่มี stockQty: UPDATE stockQty = stockQty - qty WHERE stockQty >= qty
        (แถวไหนไม่ผ่าน → รวบรายการที่พลาดตอบ 409 พร้อมรายการที่หมด — ลูกค้าเอาออกแล้วส่งใหม่)
        ถ้าหักแล้วเหลือ 0 → set isOutOfStock = true + ยิง SSE stock.changed
     c. สร้าง RestaurantOrder (bizDate+dailyNo จาก counter รายวันใน tx) + items (snapshot ชื่อ/ราคา/options)
        status = requireApproval ? PENDING : CONFIRMED
   → SSE: KDS สถานีที่เกี่ยว (ถ้า CONFIRMED), floor plan, จอลูกค้าโต๊ะเดียวกัน
4. ครัวกด COOKING → READY → expo กด SERVED → ลูกค้าเห็นสถานะสดบนมือถือ
```

**Failure paths:**
- ครัวปิด/เลย last order → 422 `KITCHEN_CLOSED` — ตะกร้ายังอยู่ ลูกค้าเห็นป้าย
- เมนูถูก 86 ระหว่างเลือก → 409 `ITEM_UNAVAILABLE` + รายการที่ติด → UI ไฮไลต์ให้เอาออก
- ราคาเปลี่ยนระหว่างตะกร้าเปิด (client ส่ง expectedPrice) → 409 `PRICE_CHANGED` → refresh เมนู
- session ถูกปิด/ย้ายโต๊ะระหว่างสั่ง → 410 `SESSION_GONE` → reload หน้า QR (ถ้าย้ายโต๊ะ: token โต๊ะใหม่เท่านั้นที่ใช้ได้)

### 7.2 ผูกสมาชิก (merge guest → member)

```
1. ลูกค้ากด "รับแต้ม" (ก่อนเช็คบิลจุดไหนก็ได้) → กรอกเบอร์
2. POST /link-member { phone } → เรียก `member.findOrCreate({tenantId, phone (normalize E.164), source:'RESTAURANT_QR'})`
   + `member.sendOtp({channel:'phone'})` (contract 2.6 — D6; การส่งจริงวิ่งผ่าน notify 2.5 ฝั่ง Member)
3. ยืนยัน OTP → TableSession.memberId = memberId → ทุกดีไวซ์ในโต๊ะเห็นป้าย "สะสมแต้ม: คุณ..."
4. ตอน checkout: memberId ติดไปกับ createSale → POS ยิง point.earn → ลูกค้าได้แต้ม
```
- โต๊ะหนึ่งผูกได้ 1 member (คนจ่าย) — เปลี่ยนได้ก่อนชำระใบแรก · แยกบิล: ระบุ memberId ต่อใบตอน checkout ได้ (override ค่า session)
- ลูกค้า login สมาชิกอยู่แล้ว (จาก storefront เดิม): ปุ่มเดียว "ใช้บัญชีนี้" ไม่ต้อง OTP ซ้ำ

### 7.3 เช็คบิลรวมโต๊ะ (ผ่าน POS — contract 2.1)

```
1. ลูกค้ากด "ขอเช็คบิล" → ServiceRequest(REQUEST_BILL) → floor plan โต๊ะเปลี่ยนสี
2. แคชเชียร์เปิด D7 → GET bill preview:
   lines = order items ค้างชำระ (ไม่รวม CANCELLED) + แถว service charge (ถ้าตั้ง)
3. POST checkout { orderItemIds: "ALL", couponCode?, memberId?, payMethods }
   → server (tx + idempotency key):
     a. lock items (SELECT ... FOR UPDATE), ตรวจยังไม่มี saleId
     b. เรียก POS createSale({ tenantId, unitId, memberId?, sourceModule:'RESTAURANT',
          sourceId: sessionId, lines:[{name: nameSnapshot+options, qty, unitPrice: unitPrice+optionsTotal}],
          couponCode?, payMethods })
        — POS: validate/redeem คูปอง, คิดแต้ม, posting Account, ออก receiptNo
        (payMethods มี ROOM_CHARGE ได้ตาม D12 — POS จะเรียก hotel.chargeToRoom
         และไม่ยิง point/account ของบิลนี้ที่ต้นทาง)
     c. สำเร็จ → items.saleId = saleId, settledAt = now
     d. ทุก item ของ session ชำระครบ → session.status = CLOSED, closedAt
        → SSE ปิดจอลูกค้า ("ขอบคุณ") + floor plan โต๊ะว่าง
   → POS ล้มเหลว (คูปองไม่ผ่าน/ยอดไม่ตรง) → ปลด lock, ไม่มี side effect, คืน error ให้แก้
```

### 7.4 แยกบิลรายรายการ

```
1. D7: checkbox เลือกรายการกลุ่มแรก (เช่น ของคุณ A 3 จาน) → checkout → PosSale #1
2. รายการที่จ่ายแล้วขึ้นสีเทา+เลขใบเสร็จ · เหลือค้าง → เลือกกลุ่มถัดไป → PosSale #2 ...
3. ใบสุดท้ายชำระครบ → session ปิดอัตโนมัติ
กติกา: service charge คิดตามสัดส่วนยอดรายการในแต่ละใบ (ปัดเศษสตางค์ลงรายใบ
  — ผลรวมทุกใบอาจต่ำกว่าคิดรวมได้สูงสุด n-1 สตางค์ ยอมรับ, ห้ามเกินยอดรวม)
รายการที่มี saleId แล้ว: ห้ามยกเลิก/แก้ (immutable ตาม convention — แก้ต้อง void ที่ POS)
```

### 7.5 ย้ายโต๊ะ / รวมโต๊ะ

```
ย้าย: POST /sessions/[id]/move { toTableId }
  tx: ตรวจ session OPEN + โต๊ะปลายทาง ACTIVE + ไม่มี session OPEN (partial unique กันชน)
  → session.tableId = toTableId → SSE: floor plan, KDS (การ์ดเปลี่ยนเลขโต๊ะ), จอลูกค้า
  → QR โต๊ะเดิม: สแกนแล้วเจอโต๊ะว่าง (เปิด session ใหม่ได้) · ดีไวซ์ลูกค้าเดิม redirect ตาม SSE ไป token ใหม่
  fail: ปลายทางไม่ว่าง → 409 เสนอ "รวมโต๊ะแทน?"

รวม: POST /sessions/[A]/merge { fromSessionId: B }
  tx: ตรวจทั้งคู่ OPEN → orders/serviceRequests ของ B ย้าย sessionId → A
  → B.status = MERGED, mergedIntoId = A → memberId: ถ้า A ไม่มีและ B มี → ยกไป A
  → SSE จอลูกค้าโต๊ะ B: "รวมกับโต๊ะ [A.name] แล้ว" → ใช้งานต่อผ่าน QR โต๊ะ B ก็ได้
    (GET /t/[qrTokenB] resolve ผ่าน chain MERGED → session A — จำกัดลึก 1 ชั้น, B ห้าม merge ต่อ)
  ⚠️ โต๊ะ B ยัง "ถูกจอง" โดย session A (ลูกค้านั่งจริง 2 โต๊ะ) จนกว่า A จะปิด — floor plan โชว์ B เป็น "รวมกับ A"
```

### 7.6 Pickup

```
1. ลูกค้า S4: เลือกเมนู → slot เวลารับ (คำนวณจาก serviceHours + leadMins, ตัด slot ที่เลย last order)
   → ยืนยัน → RestaurantOrder(type=PICKUP, status=PENDING, pickupStatus=AWAITING_CONFIRM)
   → SSE + แจ้งเตือนหน้า D4
2. ร้านกด "รับออเดอร์" → CONFIRMED + ACCEPTED → เข้า KDS (จัดคิวตาม pickupAt ไม่ใช่ createdAt
   — แสดงเวลานัดบนการ์ด, การ์ดเข้าเขต "ต้องเริ่มทำ" เมื่อ now >= pickupAt - prepMinutes)
   ร้านกด "ปฏิเสธ" (ของหมด/คิวเต็ม) → CANCELLED + notify ลูกค้า + คืน stockQty
3. ครัวเสร็จ → pickupStatus READY → notify (contract 2.5: SMS/LINE/email ตามข้อมูลที่มี)
4. ลูกค้ามารับ → แคชเชียร์เปิดออเดอร์ → checkout ผ่าน POS (จ่ายหน้าร้าน) → PICKED_UP
5. เลยเวลานัด 30 นาที + ติดต่อไม่ได้ → staff กด NO_SHOW (ยังไม่เก็บเงิน — prepaid เป็น 🔜)
```

### 7.7 86 / สต็อกหมดกลางเซอร์วิส

```
1. ลุงชัยกด 86 "ปลากะพงทอด" จาก KDS → POST items/[id]/stock { isOutOfStock: true }
2. ผล realtime (SSE ทุกช่องทาง):
   - QR/storefront: เมนูขึ้นป้าย "หมด" กดไม่ได้ · รายการในตะกร้า → เตือนตอน submit (409)
   - D3 staff: ปุ่มจาง
   - รายการที่สั่งไปแล้วค้างใน KDS: **ไม่หาย** — ครัวต้องแจ้งเสิร์ฟไปคุยกับลูกค้า
     → staff ยกเลิกรายการ (reason: "ของหมด") → ลูกค้าเลือกใหม่
3. AuditLog: who/when/รายการ · รายงาน 86 log รายวัน (เมนูไหนหมดบ่อย/หมดกี่โมง → ปรับแผนซื้อของ)
```

### 7.8 Void บิล (หลังชำระ)

```
1. แคชเชียร์คีย์ผิด → void ที่ POS (สิทธิ์ POS void) → POS ออกเอกสาร void + reverse Account/Point/Coupon
2. POS ยิง event `pos.sale.voided` { saleId } → Restaurant handler:
   - items ที่ saleId นั้น → saleId = null, settledAt = null (กลับเป็นค้างชำระ)
   - session CLOSED → reopen เป็น OPEN ถ้าโต๊ะยังไม่มี session ใหม่
     · ถ้าโต๊ะถูกใช้แล้ว → session ค้างสถานะ CLOSED แต่มียอดค้าง → ขึ้นรายการ "บิลค้าง void" ใน D4 ให้เก็บเงินใหม่แบบไม่ผูกโต๊ะ
```

---

## 8. Integration (contract กลาง — ห้ามเรียกข้ามแบบอื่น)

| Contract | จุดที่ Restaurant เรียก | รายละเอียด |
|---|---|---|
| **2.1 POS `createSale`** | checkout (7.3/7.4/7.6) | `sourceModule: 'RESTAURANT'`, `sourceId: sessionId \| orderId` · lines = snapshot จาก order items (+แถว service charge `{name: "Service charge 10%", qty:1, unitPrice}`) · Restaurant **ไม่**คำนวณส่วนลด/แต้ม/ภาษีเอง · idempotency key = `sessionId + sorted(orderItemIds)` hash กันกดซ้ำ |
| **2.2 Point** | ไม่เรียกตรง | POS เป็นคนยิง `point.earn` หลังปิด sale — Restaurant แค่ส่ง `memberId` |
| **2.3 Coupon** | ไม่เรียกตรง (ผ่าน POS) | ส่ง `couponCode` ใน createSale · หน้า D7 อยาก preview ส่วนลดก่อนกดจ่าย → เรียก `coupon.validate({module:'RESTAURANT', unitId, amount})` แบบ read-only ได้ |
| **2.4 Account** | ไม่เรียกตรง | POS ส่ง posting — Restaurant ไม่มี journal ของตัวเอง |
| **2.5 Notification** | pickup READY / pickup ถูกปฏิเสธ / OTP ผูกสมาชิก | `notify({tenantId, to:{memberId \| phone}, channel, template:'RESTAURANT_PICKUP_READY', data:{orderNo, unitName}})` |
| **2.6 Member** | link-member (7.2), ค้นสมาชิกหน้า D7 | อ้าง `memberId` เท่านั้น · snapshot ชื่อ/เบอร์เก็บได้เฉพาะบนเอกสาร freeze (order.guestName/Phone ของ pickup ที่ไม่ login) · ใช้ service `member.findOrCreate({tenantId, phone (E.164), source, consents?})` + `member.sendOtp/verifyOtp({channel:'phone'})` ตาม contract 2.6 (D6) |
| **2.7 activity.log** | ปิดบิล (checkout สำเร็จ — order ชำระครบ) | `activity.log({tenantId, memberId, unitId, module:'RESTAURANT', type:'ORDER_PAID', refType:'PosSale', refId: saleId, summary})` ผ่าน outbox กลาง — เฉพาะบิลที่มี memberId (producer บังคับตาม D6) |
| **Event ขาเข้า** | `pos.sale.voided` จาก POS (ชื่อเต็มตาม D7) | ปลด lock รายการ + reopen session (7.8) |
| **AuditLog กลาง** | 86/ปลด 86, ยกเลิกรายการ COOKING+, void-reopen, ย้าย/รวมโต๊ะ, rotate QR, แก้ราคาเมนู, ปิดครัวฉุกเฉิน | who/what/when/before/after |
| **SSE hub กลาง** | KDS, floor plan, จอลูกค้า, service requests, expo | ใช้โครง realtime กลางของแพลตฟอร์ม channel รูปแบบ `unit:{unitId}:restaurant:{topic}` |

---

## 9. Permissions (action × role)

Permission keys ของโมดูล (เก็บใน `Membership.permissions`):
`restaurant.menu.view / menu.manage / menu.stock · table.view / table.manage / table.operate · order.view / order.take / order.void · kds.operate / kds.recall · checkout · settings.view / settings.manage / settings.kitchen · report.view`

| Action | OWNER | MANAGER (unit) | STAFF (default) | Custom ตัวอย่าง |
|---|---|---|---|---|
| ดูเมนู / จัดการเมนู+ราคา | ✅ / ✅ | ✅ / ✅ | ✅ / ❌ | แม่ครัวใหญ่: `menu.manage` |
| 86 / สต็อกเมนู | ✅ | ✅ | ❌ | คนครัว: `menu.stock` |
| ดู floor plan / จัดผัง+QR | ✅ / ✅ | ✅ / ✅ | ✅ / ❌ | |
| เปิดโต๊ะ/รับออเดอร์/expedite | ✅ | ✅ | ✅ (`order.take`) | |
| ย้าย/รวมโต๊ะ | ✅ | ✅ | ✅ (`table.operate`) | ร้านเข้มงวด: ถอดจาก STAFF ได้ |
| ยกเลิกรายการที่ COOKING+ / ปิด session มีรายการค้าง | ✅ | ✅ (`order.void`) | ❌ | |
| KDS เลื่อนสถานะ | ✅ | ✅ | ✅ (`kds.operate` — จำกัดสถานีผ่าน UI ที่เปิด) | |
| KDS recall (ถอย READY→COOKING) | ✅ | ✅ | ❌ | |
| เช็คบิล (เรียก POS) | ✅ | ✅ | ✅ เฉพาะคนที่มี `checkout` (มักคู่กับสิทธิ์ POS) | |
| ตั้งค่า (เวลา/ครัว/สถานี/service charge) | ✅ | ✅ | ❌ | |
| ปิดครัวฉุกเฉิน / override สั่งนอกเวลา | ✅ | ✅ (`settings.kitchen`) | ❌ | |
| รายงาน | ✅ | ✅ (unit ตัวเอง) | ❌ | ผู้ช่วยผจก.: `report.view` |
| ลูกค้า (ไม่ login) | สั่งในโต๊ะตัวเอง (qrToken+guestToken), เรียกพนักงาน, ขอบิล, ยกเลิกเฉพาะรายการ NEW ที่ดีไวซ์ตัวเองสั่ง, ผูกสมาชิกด้วย OTP | | | |

ทุก API ตรวจผ่าน `can(user, { tenantId, unitId, module:'RESTAURANT', action })` (RBAC 4 มิติ) — MANAGER/STAFF ต้องมี unit นี้ใน `unitAccess`

---

## 10. Reports & Metrics

> ทุกรายงาน: เลือกช่วงวันที่ (default 7 วัน), เทียบช่วงก่อนหน้า (%Δ), export CSV · คำนวณจาก order items ที่ **ชำระแล้ว** (มี saleId) ยกเว้นระบุอื่น · เวลา = local timezone ของ unit

| # | รายงาน | เนื้อหา | ใช้ตัดสินใจอะไร |
|---|---|---|---|
| R1 | **เมนูขายดี** | อันดับตามจำนวน/ยอดขาย (สตางค์→แสดงบาท), กรองหมวด/สถานี, แสดง % ของยอดรวม + กราฟแท่ง · โหมด "ขายแย่สุด" ด้วย | ตัด/ดันเมนู, วางแผนวัตถุดิบ |
| R2 | **ยอดต่อโต๊ะ/โซน** | ต่อโต๊ะ: จำนวน session, ยอดรวม, เฉลี่ย/บิล, เฉลี่ย/หัว (guestCount), เวลานั่งเฉลี่ย (turnover) · รวมระดับโซน | จัดผังโต๊ะ, โปรโมชั่นโซนเงียบ |
| R3 | **Peak hours** | heatmap ชั่วโมง × วันในสัปดาห์ (จำนวนออเดอร์ + ยอดขาย) + เส้นแบ่งช่วงเปิดครัว | จัดกะพนักงาน, happy hour |
| R4 | **เวลาเตรียม (prep time)** | เฉลี่ย/median/p90 ของ NEW→READY ต่อสถานี + ต่อเมนู top 20, รายการเกิน threshold | คอขวดครัว, ปรับ prepMinutes |
| R5 | **ยกเลิก & 86** | รายการยกเลิก (จำนวน, มูลค่า, เหตุผล, ใครยกเลิก) · 86 log: เมนูไหนหมดบ่อย หมดกี่โมง ขายพลาดโดยประมาณ | ลด waste, แผนซื้อของ |
| R6 | **ช่องทางออเดอร์** | สัดส่วน QR ลูกค้าสั่งเอง vs staff คีย์ vs takeaway vs pickup + ยอดเฉลี่ยต่อช่องทาง | วัดผล QR adoption |
| R7 | **สรุปวัน (daily digest)** | ยอดขาย, จำนวนบิล/ออเดอร์, ลูกค้า (หัว), เฉลี่ย/บิล, เมนู top 5, service charge รวม — การ์ดบนหน้าแรก unit + ป้อน KPI ให้ Overview "ทุกกิจการ" | เช็คสุขภาพร้านรายวัน |

- ยอดเงิน "ขายจริง" ระดับบัญชี = ของ POS/Account — ตัวเลขฝั่ง Restaurant เป็นมุมปฏิบัติการ (อ้าง saleId เดียวกัน ตรวจสอบไขว้ได้)
- 🔜 R8 อัตราการเลือก option (attach rate เช่น กี่ % อัปไซส์), R9 cohort ลูกค้าสมาชิกกลับมาซ้ำ (ต้องข้อมูล Member ยาวพอ)

---

## 11. Edge Cases & Rules (กติกาธุรกิจ + race conditions)

1. **1 โต๊ะ 1 session OPEN** — partial unique index (4.6) คือ source of truth · 2 ดีไวซ์สแกนพร้อมกัน: ตัวแพ้ unique ให้อ่าน session เดิมมาใช้ (get-or-create ใน tx + retry)
2. **Oversell stockQty** — หักด้วย conditional UPDATE (`WHERE stockQty >= qty`) ใน tx เดียวกับสร้าง order — ห้ามอ่านมาเช็คแล้วค่อยเขียน (TOCTOU) · ยกเลิกรายการ/ปฏิเสธ pickup → คืน stock เฉพาะเมื่อรายการยังไม่ COOKING (เริ่มทำแล้ว = วัตถุดิบเสียไปแล้ว ไม่คืน)
3. **Snapshot ราคา** — order item เก็บ nameSnapshot/unitPrice/priceDelta ณ เวลาสั่ง · แก้เมนู/ลบ choice ไม่กระทบออเดอร์และบิลย้อนหลัง · client ส่ง expected total → mismatch = 409 ให้ refresh
4. **รายการชำระแล้ว immutable** — มี `saleId` = ห้ามแก้/ยกเลิก/ย้าย ทุกทาง (DB-level ตรวจใน service layer + test) · แก้ได้ทางเดียว: void ที่ POS → event กลับมาปลด lock (7.8)
5. **Checkout กดซ้ำ/network retry** — idempotency key ต่อ (sessionId + ชุด itemIds) → คืนผลใบเดิม ไม่สร้าง PosSale ซ้ำ · items ถูก lock FOR UPDATE ระหว่างเรียก POS — 2 แคชเชียร์เลือกรายการชนกัน: ใบหลังได้ 409 รายการถูกจ่ายแล้ว
6. **แยกบิล + service charge ปัดเศษ** — คิดเป็นสตางค์ ปัดลงรายใบ ส่วนต่างรวม ≤ n-1 สตางค์ (7.4) · คูปองใช้ได้ 1 ใบ/PosSale ตามกติกา POS — แยกบิลแล้วใช้คูปองได้ต่อใบ (ถูกต้องตาม attribution)
7. **ย้ายโต๊ะปลายทางไม่ว่าง** → 409 + เสนอ merge · **merge chain จำกัด 1 ชั้น** (MERGED session ห้ามถูก merge ต่อ, resolve QR ผ่าน chain ลึกสุด 1)
8. **ยกเลิกรายการที่ครัวเริ่มทำ** — ต้อง `order.void` + reason · รายการ SERVED ยกเลิกไม่ได้ (ต้องจ่ายหรือ Manager ยกทั้งจานเป็น void ก่อนบิล พร้อม AuditLog) — กันพนักงานทุจริต "เสิร์ฟแล้วกดยกเลิก"
9. **ลูกค้ายกเลิกเอง** — ได้เฉพาะรายการ `NEW` ที่สั่งจาก guestToken เดียวกัน (คนอื่นในโต๊ะยกเลิกของเพื่อนไม่ได้ — ให้เรียกพนักงาน)
10. **QR token รั่ว / ลูกค้าเก่าสแกนจากบ้าน** — token ถาวรแต่ order ต้องมี session OPEN + ครัวเปิด · แถม guard: session เปิดใหม่จาก QR ต้องไม่มี request/order ภายใน X นาทีหลังโต๊ะเพิ่งปิด (config, default 0/ปิด) · ร้านที่กังวล → rotate token หรือใช้โหมด `requireApproval`
11. **เวลาเปิดครัว/last order** — ตรวจฝั่ง server ทุกครั้งตอน submit (ไม่เชื่อ client) เทียบ timezone unit · staff override ได้ (Manager) — บันทึก AuditLog · bizDate ตัดวันตาม timezone unit ไม่ใช่ UTC (ร้านเปิดข้ามเที่ยงคืน: bizDate = วันที่เปิดร้าน — ช่วงเวลาที่ค่อมเที่ยงคืนนับเป็นวัน service ที่เริ่ม)
12. **Unit PAUSED** (BLUEPRINT_BUSINESS_UNITS ข้อ 8.4) — บล็อกออเดอร์ใหม่ทุกช่องทาง + ซ่อน storefront · session OPEN ค้าง: ให้ทำต่อจนปิดโต๊ะได้ (honor ของเดิม) · เตือนเจ้าของก่อนพักถ้ามี session ค้าง
13. **โมดูลถูกปิด (enabledModules)** — เหมือน PAUSED + ซ่อนเมนู dashboard · ข้อมูลอยู่ครบ เปิดกลับมาใช้ต่อได้
14. **SSE หลุด** — ทุกจอ (KDS/floor plan/ลูกค้า) reconnect + refetch snapshot เต็มก่อน resubscribe (กัน event หายช่วงหลุด) · KDS มีป้าย "ออฟไลน์" ชัดเจน — ครัวต้องรู้ว่าจอค้าง
15. **นาฬิกา client เพี้ยน** — aging/สถานะเวลาใช้ server timestamp เท่านั้น client แค่ render ส่วนต่าง
16. **เมนูถูก archive แต่มี order อ้าง** — `menuItemId` nullable + snapshot ครบ → รายงานย้อนหลังใช้ snapshot · ห้าม hard delete ตาม convention
17. **หลาย unit ใน tenant เดียว** — เมนู/โต๊ะ/สถานี **ไม่แชร์ข้าม unit** (ร้าน 2 สาขาตั้งเมนูแยก — เครื่องมือ copy เมนูข้าม unit เป็น 🔜) · Member/Point แชร์ระดับ tenant ตามกติกา BLUEPRINT_BUSINESS_UNITS
18. **จำนวนแถว order items โต** — index ตาม (unitId, bizDate) + รายงานหนักให้ query ช่วงวันที่เสมอ (บังคับ from/to, cap 366 วัน)

---

## 12. QC Checklist (เกณฑ์ตรวจรับ)

### Functional
- [ ] CRUD หมวด/เมนู/รูปหลายรูป/option groups (min/max, ราคาเพิ่มบวก-ลบ, default) ครบ + duplicate + import CSV
- [ ] 86 รายเมนู+รายตัวเลือก มีผลทุกช่องทางภายใน ≤2 วิ (SSE) · stockQty หัก/คืน/auto-86/daily reset ถูกต้อง (ทดสอบ concurrent สั่งพร้อมกัน 20 req เมนู stock 10 → ขายได้ 10 พอดี)
- [ ] QR flow: สแกน→สั่ง→เห็นออเดอร์รวมโต๊ะจาก 2 ดีไวซ์→สถานะสด→เรียกพนักงาน→ขอบิล — **ไม่มี login wall ตลอดสาย**
- [ ] ผูกสมาชิก OTP แล้วแต้มเข้าจริงหลังชำระ (ตรวจ PointLedger มี unitId ถูกต้อง)
- [ ] ย้ายโต๊ะ/รวมโต๊ะ: ออเดอร์+KDS+จอลูกค้า+floor plan อัปเดตครบ, QR โต๊ะเดิม/ใหม่ทำงานตามสเปค 7.5
- [ ] แยกบิลรายรายการ: 3 ใบจากโต๊ะเดียว → ใบเสร็จ 3 เลข, service charge ปัดเศษรวมไม่เกินยอดคิดรวม, session ปิดอัตโนมัติใบสุดท้าย
- [ ] KDS: NEW→COOKING→READY→SERVED, ห้ามถอยหลัง (ยกเว้น recall Manager), rush ขึ้นบนสุด, aging เปลี่ยนสีตาม threshold, expo รวมทุกสถานี
- [ ] Checkout เรียก POS ตาม contract 2.1 เป๊ะ + idempotent (กดซ้ำได้ใบเดิม) + void event reopen ถูกต้อง
- [ ] เวลาครัว: นอกเวลา/เลย last order/kill switch → ลูกค้าสั่งไม่ได้ (server-side) แต่ดูเมนูได้, staff override ได้เฉพาะ Manager
- [ ] Pickup ครบ loop: สั่ง→รับ→READY→notify→รับของ→จ่าย POS · ปฏิเสธแล้วคืน stock + notify
- [ ] รายงาน R1–R7 ตัวเลขตรงกับข้อมูลดิบ (เขียน test fixture ชุดออเดอร์รู้คำตอบ) + export CSV

### Isolation & Security
- [ ] ทุก query มี tenantId+unitId — ทดสอบ cross-tenant + **cross-unit** (สร้าง 2 unit ใน tenant เดียว: token/สิทธิ์/รายงาน unit A ต้องมองไม่เห็น B)
- [ ] `can()` 4 มิติถูกเรียกทุก endpoint — STAFF ไม่มี `order.void` ยกเลิกรายการ COOKING ไม่ได้ (ทดสอบตรง API ไม่ใช่แค่ UI)
- [ ] qrToken เดา/ไล่ไม่ได้ (cuid), rotate แล้วอันเก่าใช้ไม่ได้ทันที · guestToken จำกัดสิทธิ์ตามข้อ 9 (ยกเลิกของดีไวซ์อื่นไม่ได้)
- [ ] Storefront/pickup มี rate limit · AuditLog ครบทุก action ในข้อ 8 ตาราง integration
- [ ] รายการมี saleId แล้วแก้/ยกเลิกไม่ได้จากทุก endpoint

### เงิน & ข้อมูล
- [ ] เงินทุก field เป็น Int สตางค์ ไม่มี Float หลุด (lint schema) · แสดงผลบาทถูกต้องรวม format TH/EN
- [ ] Snapshot: แก้ราคา/ลบเมนู/ลบ choice หลังสั่ง → บิลเดิม+รายงานย้อนหลังไม่เปลี่ยน
- [ ] ไม่มี hard delete ตารางธุรกรรม — archive เท่านั้น

### i18n & UX
- [ ] ทุกหน้า TH/EN สลับได้ ไม่มี string hardcode · เมนูลูกค้าแสดง nameEn เมื่อ locale EN (fallback TH)
- [ ] Mobile: S1–S5 ใช้จบด้วยนิ้วโป้งเดียว · D1/D5 ใช้บนแท็บเล็ตแนวนอนได้ · empty/loading/error state ครบทุกหน้า
- [ ] SSE ทุกจอ: ปิด wifi 30 วิแล้วเปิด → state กลับมาถูกต้องเอง + มี indicator ตอนหลุด

---

*อ้างอิง: `_CONVENTIONS.md` (โครง 12 หัวข้อ, contracts 2.1–2.6) · `BLUEPRINT.md` ข้อ 5.2 · `BLUEPRINT_BUSINESS_UNITS.md` (unit scope, RBAC 4 มิติ, URL scheme)*
