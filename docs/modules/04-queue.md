# โมดูล 4 — Q (บัตรคิว) · V2 as-built · scope = **unit**

> **V2 as-built** (1 พ.ย. 2569 · SVC B.18 ส่วนเอกสาร) — อธิบายของที่สร้างจริง ณ `session/svc` `b3de0dce` · โครงสร้าง/ตัวเลข/หนี้ละเอียด `docs/sds/modules/queue.md` · จองคิว (บัตรแถวเดียว) `docs/modules/03-booking.md` §4–§6
> สเปกเดิม v1 (ก.ค. 2569) ย้ายไป "ภาคผนวก — v1 design notes" ท้ายไฟล์ · **เครื่องหมาย ✅ ในภาคผนวกถูกแก้ให้ตรงโค้ดแล้ว** · เมื่อขัดกัน หมวด V2 และโค้ดชนะ

ตาราง `QueueTicket` ใช้ 2 แบบ: (1) **หน่วย QUEUE** = บัตรคิว walk-in มาก่อนได้ก่อนแบบรุ่นแรก (ร้านตั้งประเภท/เคาน์เตอร์/จอเอง) — RUN SVC ไม่เปลี่ยนพฤติกรรม · (2) **บัตร P/A ของจองคิวแถวเดียว** (หน่วย BOOKING · SVC B.4) — บัตรเป็นเงาของงานจองคิว สถานะเดินตามงาน ไม่ผ่านหน้าคิวเดิม

## 1. หน่วย QUEUE (บัตรคิวทั่วไป)
- ตั้งค่า `/app/u/<หน่วย>/queue/setup`: ประเภทคิว (ชื่อ · prefix 1–3 ตัว · priority · รับออนไลน์) · เคาน์เตอร์ (+ ประเภทที่รับ · ไม่ผูก = รับทุกประเภท) · จอทีวี (สร้าง/ยกเลิก token)
- บอร์ด `/app/u/<หน่วย>/queue`: ออกบัตรให้ลูกค้า · เปิด/ปิดเคาน์เตอร์ (ผู้เปิด = ผู้ประจำ · ปิดไม่ได้ถ้ามีบัตร CALLED/SERVING) · เรียกถัดไป (`priority DESC, createdAt ASC` ตามประเภทที่เคาน์เตอร์รับ) · เรียกซ้ำ · เริ่ม · ข้าม · เรียกคืนที่ข้าม · โอนเคาน์เตอร์ (เลขเดิม) · จบ · ยกเลิก · รีเฟรช 5 วินาที
- เลขคิว `prefix + 3 หลัก` ต่อ (หน่วย × ประเภท × วันทำการ) atomic · reset โดยวันที่ของ key (ไม่มี cron reset)
- รับบัตรออนไลน์ `/s/<ร้าน>/<หน่วย>/queue` (สาธารณะ): สวิตช์ `QueuePolicy.onlineIssueOpen` · เฉพาะประเภทที่เปิดออนไลน์ · `requireContact` ⇒ เบอร์ 9–15 หลัก · เบอร์มีบัตรวันนี้แล้ว ⇒ พาไปบัตรเดิม · 5 ครั้ง/นาที/IP
- หน้าสถานะบัตร `/s/<ร้าน>/<หน่วย>/queue/t/[publicToken]`: เลข · สถานะ · เหลืออีก N คิว · เวลารอโดยประมาณ (`ceil((ข้างหน้า+1) ÷ เคาน์เตอร์เปิด × avgServiceMinFallback)`)
- จอทีวี `/s/<ร้าน>/<หน่วย>/queue/display/[displayToken]` (รีเฟรช 5 วินาที)
- งาน `queue.housekeeping` ทุก 5 นาที: บัตรค้างข้ามวัน ⇒ ยกเลิก (END_OF_DAY) · ข้ามเกิน `skippedExpiryMin` ⇒ ไม่มา
- จบบริการ ⇒ outbox `queue.served` → CRM VISIT · REST อ่าน `GET /api/v1/queue/tickets` · สิทธิ์ `queue.*` 18 คีย์ (`assertCan` ทุก action)

## 2. บัตรแถวเดียวของจองคิว (B.4 · B.5 · B.6 · B.9)
- เช็กอินนัด ⇒ บัตร **P###** (ประเภทระบบ `APPOINTMENT`) · walk-in ⇒ บัตร **A###** (ประเภทระบบ `WALKIN`) · ตัวอักษรจากค่าตั้ง `booking.queue.prefixes` · `refType APPOINTMENT` + `refId` = งาน
- `QueueTicket.etaAt` (SVC B.0) = เวลาคาดจากตัววางคิว (แสดง "~HH:MM ±10") · หน้าบัตร/ทีวี/ตู้ของจองคิวอยู่ `/bq/t|tv|kiosk/[token]` (ไม่มีชื่อ/เบอร์) · บัตรจากมือถือ `/s/<ร้าน>/<สาขา>/remote`
- event: `queue.ticket.called` (→ ข้อความ "ถึงคิว") · `queue.ticket.done` · ไม่ยิง `queue.served` (booking.completed ทำหน้าที่ VISIT แล้ว)
- action ของหน้าคิวเดิมที่แตะบัตร **รับเฉพาะหน่วยชนิด QUEUE** (`ticketCtxOf`) · housekeeping ข้ามบัตร `refType APPOINTMENT` · สิทธิ์ใช้คีย์ `booking.*`

## 3. ยังไม่มี (ที่สเปก v1 เคยติ๊ก ✅)
หน้าตู้ kiosk ของหน่วย QUEUE (`/q/kiosk`) · SSE realtime (จอ/มือถือ) · เสียงเรียก TTS/chime · สั่นเตือน · แจ้งเตือนใกล้ถึงคิวของบัตรทั่วไป (`notifyBeforeCount`/`notifiedAt` ไม่มีผู้ใช้ — แจ้งเตือนมีเฉพาะบัตรแถวเดียว B.9) · ลูกค้ายกเลิกบัตรเองจากหน้าสถานะ · เวลารอจากค่าเฉลี่ยจริง (ใช้ค่าตั้งต้นต่อประเภท) · handoff นัด ARRIVED → บัตรหน่วย QUEUE · สถิติ/รายงานคิว · `transferToFront`/`recallAnnounceMax`/`starvationRatio` (ไม่มีผู้อ่าน) · หน้า `/q/tickets` `/q/reports` · facade `queue/index.ts`

---

## ภาคผนวก — v1 design notes (สเปกเดิมก่อนสร้าง · ก.ค. 2569)

> สเปกเดิม (REVISED หลัง QC 2026-07-11) เก็บเฉพาะ §1–§3 · **หัวข้อที่เคยติ๊ก ✅ ถูกแก้ตามโค้ด `b3de0dce`** (✅ = มีจริง · ✅ (แบบต่าง) · ⚠️ = บางส่วน · ❌ = ไม่มี) พร้อมบรรทัด "as-built" ใต้หัวข้อ · ข้อความเดิมใต้บรรทัดนั้นไม่ได้แก้ — ถ้าขัด ให้เชื่อบรรทัด as-built
> §4–§12 ของสเปกเดิมแทนที่แล้ว (เหลือตัวชี้) · ฉบับเต็มก่อนแก้: `git show b3de0dce:docs/modules/04-queue.md`

### (หัวเดิม) โมดูล 4: Q — บัตรคิว walk-in มาก่อนได้ก่อน (Queue Management)

> 🔄 REVISED หลัง QC — สอดคล้อง RESOLUTIONS.md (2026-07-11)
> scope: **unit** (ทุกตารางมี `tenantId + unitId`) · ยึด `_CONVENTIONS.md` + `BLUEPRINT.md` + `BLUEPRINT_BUSINESS_UNITS.md`
> ⚠️ ชื่อ model หลักคือ **`QueueTicket`** — กันชนกับโมดูล 5 Ticket (อีเวนต์) ตามกติกา _CONVENTIONS ข้อ 3
> กลุ่มเป้าหมาย: คลินิก, ธนาคาร/ศูนย์บริการ, ร้านอาหารรอโต๊ะ, ราชการ/เคาน์เตอร์บริการ, ร้านที่รับ walk-in
> คู่แฝด: โมดูล 3 (Booking) = นัดล่วงหน้าตามเวลา · Q = มาก่อนได้ก่อน — นัดที่ ARRIVED จะ handoff เข้ามาเป็นคิวพิเศษ (ข้อ 3.9)

---
### 1. ภาพรวม + ขอบเขต

#### ทำอะไร (v1 แบบเดิม — สถานะจริงต่อข้อดู §3 ด้านล่าง + หมวด V2)
- **จุดบริการ/เคาน์เตอร์หลายจุด** (`QueueCounter`): ช่อง 1, ช่อง 2, ห้องตรวจ A — เปิด/ปิดรายวัน, staff ประจำเคาน์เตอร์
- **ประเภทคิว** (`QueueType`): คิวทั่วไป (A), พรีเมียม/สมาชิก (B), นัดหมาย (P — มาจาก Booking) — prefix ต่อประเภท, priority weight, mapping ว่าเคาน์เตอร์ไหนรับประเภทไหน
- **ออกบัตรคิว**: (ก) kiosk mode บน tablet หน้าร้าน (จอใหญ่ กดปุ่มเดียวได้บัตร + พิมพ์/แสดง QR), (ข) ลูกค้าสแกน QR รับคิวออนไลน์จากมือถือ (remote queue), (ค) staff ออกให้จาก dashboard
- **เลขคิว** prefix ต่อประเภท (`A001`, `B001`, `P001`) **reset รายวัน** ตาม business date ของ timezone ร้าน — atomic ไม่ซ้ำแม้กดพร้อมกัน
- **การจัดการคิว**: เรียก / เรียกซ้ำ / ข้าม / เรียกคืนคิวที่ข้าม / โอนคิวข้ามเคาน์เตอร์ / จบบริการ / ยกเลิก
- **จอแสดงคิว (TV display)**: public URL + token (ไม่ต้อง login), realtime SSE, เสียงเรียก (Web Speech TH/EN + เสียง "ติ๊งต่อง"), โชว์คิวที่กำลังเรียก + คิวถัดไป
- **ลูกค้าดูสถานะบนมือถือ**: หน้า public ต่อบัตร (จาก QR) — ลำดับที่รออยู่, estimate เวลารอ, realtime SSE
- **แจ้งเตือนใกล้ถึงคิว**: เหลือ N คิว → notify (WEB push บนหน้าสถานะ + LINE/EMAIL ถ้ารู้ตัวตน)
- **สถิติ**: เวลารอเฉลี่ย, เวลาให้บริการเฉลี่ย, จำนวนคิว/วัน, abandon rate, พีคชั่วโมง
- **Handoff จาก Booking**: นัด ARRIVED → ออกบัตรประเภท "นัดหมาย" อัตโนมัติ ได้ priority สูง

#### ยังไม่ทำใน v1 (🔜)
- 🔜 **เครื่องพิมพ์บัตรความร้อน** (ESC/POS ผ่าน network printer) — v1 ใช้จอ tablet แสดงเลข + QR ให้ถ่าย/สแกน
- 🔜 **จองคิวล่วงหน้าแบบช่วงเวลา** (เลือกช่วง "มาช่วง 14:00–15:00") — เคสนี้ให้ใช้โมดูล Booking
- 🔜 **SMS แจ้งเตือน** (มีค่าใช้จ่าย — รอ billing), **หลายภาษาเสียงเรียกเกิน TH/EN**
- 🔜 **โหมด multi-step service** (คิวเดียวผ่านหลายจุด: ซักประวัติ→ตรวจ→รับยา) — v1 = 1 บัตร 1 จุดจบ, ใช้โอนเคาน์เตอร์แทนชั่วคราว
- ❌ ไม่ทำ: การเงินในโมดูลนี้ (ชำระเงิน = POS ตามปกติ, Q ไม่มีราคา), ไม่มี seat/โต๊ะ (ของ Restaurant)

---

### 2. Persona & User Stories

| Persona | บทบาท |
|---|---|
| **Owner** | ตั้งค่าเคาน์เตอร์/ประเภทคิว, ดูสถิติ, เปิดจอ TV |
| **Manager** | เปิด-ปิดเคาน์เตอร์รายวัน, จัดการคิวหน้างาน, ดูรายงานหน่วย |
| **Staff — Counter** (ประจำช่อง) | เรียก/ข้าม/โอน/จบคิวของเคาน์เตอร์ตัวเอง |
| **Staff — Front** | ออกบัตรให้ลูกค้า (แทน kiosk), ช่วยลูกค้าที่ใช้มือถือไม่เป็น |
| **Customer** | รับบัตรจาก kiosk/QR, ดูสถานะบนมือถือ, ได้แจ้งเตือนใกล้ถึงคิว |

User stories หลัก:
1. (Customer) เดินเข้าคลินิก แตะ "รับคิว" บน tablet → ได้ A012 + QR → สแกนแล้วไปนั่งร้านกาแฟข้างๆ ดูคิวจากมือถือ
2. (Customer) สแกน QR หน้าร้านจากมือถือ รับคิวออนไลน์โดยไม่ต้องแตะ kiosk เลย → เห็น "รออีก 4 คิว ~20 นาที"
3. (Staff ช่อง 2) กด "เรียกถัดไป" → ระบบเลือกให้ตาม priority → จอ TV ขึ้น "A012 → ช่อง 2" + เสียงเรียก
4. (Staff) ลูกค้าไม่มา → เรียกซ้ำ 2 รอบ → ข้าม → ลูกค้าโผล่มาทีหลัง → "เรียกคืน" กลับเข้าหัวแถว
5. (Staff) ลูกค้าคิวช่อง 1 ต้องไปจ่ายเงินช่องการเงิน → โอนคิวไปเคาน์เตอร์ CASHIER
6. (Front desk — Booking) ลูกค้ามีนัด 14:00 มาถึง → กด ARRIVED ที่โมดูล Booking → ได้บัตร P003 อัตโนมัติ ลัดเข้าหัวแถวตาม priority
7. (Owner) เห็นว่าวันเสาร์เวลารอเฉลี่ย 40 นาที abandon 15% → ตัดสินใจเพิ่มเคาน์เตอร์

---

### 3. ฟังก์ชันทั้งหมด

#### 3.1 เคาน์เตอร์ / จุดบริการ ✅ (แบบต่าง)
> as-built: `QueueCounter` + `QueueCounterType` · เปิด = ตั้ง `activeUserId` เป็นผู้กด · ปิดไม่ได้ถ้ามีบัตร CALLED/SERVING · ❌ ไม่บังคับ 1 คน 1 เคาน์เตอร์/ไม่ log การแทนที่
- `QueueCounter`: ชื่อ ("ช่อง 1", "ห้องตรวจ A"), code สั้นสำหรับจอ, สถานะ OPEN/CLOSED (เปิด-ปิดรายวันโดย staff — ปิด = ไม่รับเรียกคิวใหม่ แต่คิวที่ SERVING ค้างอยู่จบได้), ลำดับแสดงผล
- ผูกประเภทคิวที่รับ (`QueueCounterType` many-to-many): ช่อง 1–3 รับ A, ช่อง 4 รับ B+P — เคาน์เตอร์ไม่ผูกประเภทเลย = รับทุกประเภท
- staff กดเข้าประจำเคาน์เตอร์ (`activeUserId`) — 1 เคาน์เตอร์มี staff ประจำได้ 1 คน ณ เวลาหนึ่ง (คนใหม่กดเข้า = แทนที่ + log), 1 คนประจำได้ 1 เคาน์เตอร์

#### 3.2 ประเภทคิว ✅
> as-built: ตามสเปก + ประเภทระบบ `WALKIN` (บัตร A ของจองคิวแถวเดียว · B.4) · `APPOINTMENT` สร้างโดย `ensureSystemQueueType` จากฝั่งจองคิว (ไม่ใช่ handoff)
- `QueueType`: ชื่อ TH/EN, `code` (ใช้อ้างข้ามโมดูล เช่น `GENERAL`, `PREMIUM`, `APPOINTMENT`), `prefix` ตัวอักษร (A/B/P — unique ต่อ unit), `priority Int` (มาก = สำคัญกว่า, GENERAL=0, PREMIUM=50, APPOINTMENT=100), เปิด/ปิดรับคิวออนไลน์ต่อประเภท, เปิด/ปิดแสดงบน kiosk
- ประเภท `APPOINTMENT` เป็น system-created ตอนเปิด handoff กับ Booking (ซ่อนจาก kiosk — ออกได้จาก handoff เท่านั้น)
- `avgServiceMinFallback` (ค่าตั้งต้นเวลาให้บริการ/คิว ใช้ estimate ตอนยังไม่มีสถิติจริง, default 10 นาที)

#### 3.3 ออกบัตรคิว ⚠️ บางส่วน
> as-built: ✅ พนักงานออกจากบอร์ด · ✅ QR รับคิวออนไลน์ `/s/<ร้าน>/<หน่วย>/queue` (rate limit 5/นาที/IP in-memory · กันซ้ำต่อเบอร์เมื่อ `requireContact`) · ❌ ไม่มี kiosk mode `/q/kiosk` ของหน่วย QUEUE (ตู้มีเฉพาะจองคิว `/bq/kiosk/[token]` B.6) · ❌ ไม่มี device fingerprint
3 ช่องทาง ทุกช่องทางลงเอยที่ service กลาง `queue.issueTicket()`:
1. **Kiosk mode** (`/app/u/[unitSlug]/q/kiosk` — fullscreen บน tablet, ล็อกหน้าจอด้วย PIN ออก): ปุ่มใหญ่ต่อประเภทคิว → ได้จอแสดงเลข + QR (ลิงก์หน้าสถานะ) ค้าง 15 วินาที → กลับหน้าแรก · ทำงานด้วย session ของ device ที่ staff login ไว้
2. **QR รับคิวออนไลน์** (public): ร้านพิมพ์ QR ถาวร (ลิงก์ `/s/[tenantSlug]/[unitSlug]/q`) แปะหน้าร้าน → ลูกค้าเลือกประเภท (เฉพาะที่เปิด online) + กรอกเบอร์/ชื่อ (optional ถ้าร้านตั้ง `requireContact=false`) → ได้บัตร + หน้าสถานะทันที · กันสแปม: 1 เบอร์/device fingerprint มีคิว active ได้ 1 ใบต่อ unit + rate limit
3. **Staff ออกให้** (dashboard): ปุ่ม "ออกบัตร" + เลือกประเภท + ผูก member/เบอร์ (optional)

#### 3.4 เลขคิว + reset รายวัน ✅
> as-built: ตามสเปก (`QueueDailySequence` upsert atomic · `padStart(3)` · `businessDateOf` ค่าเริ่ม Asia/Bangkok)
- เลข = `prefix + zero-pad 3 หลัก` (`A001`…`A999` เกินพัน = `A1000` ไม่ตัด)
- ตัวนับต่อ (unit × ประเภท × business date): `QueueDailySequence` — increment แบบ atomic ใน transaction (`INSERT ... ON CONFLICT ... UPDATE value = value + 1 RETURNING value`) → เลขไม่ซ้ำแม้ 50 คนกดพร้อมกัน
- `businessDate` คำนวณจาก timezone ร้าน (`unit.settings.timezone`) — เที่ยงคืนร้าน = ขึ้นวันใหม่ = ตัวนับเริ่ม 1 เอง (ไม่มี cron reset — reset โดย key ของ sequence)
- บัตรมี `publicToken` (cuid) สำหรับหน้าสถานะลูกค้า — เดาไม่ได้, ไม่ใช้เลขคิวเป็น identifier public

#### 3.5 วงจรสถานะบัตร + การจัดการคิว ✅ (แบบต่าง)
> as-built: เรียก/เรียกซ้ำ/ข้าม/เรียกคืน/โอน/เริ่ม/จบ/ยกเลิก มีครบ · `QueueTicketEvent` ทุกการเปลี่ยน · ไม่มี broadcast SSE · โอน = กลับ WAITING เรียงตาม `createdAt` เดิม (ไม่อ่าน `transferToFront`) · สิ้นวันทำโดยงาน `queue.housekeeping` ทุก 5 นาที (ข้ามบัตรจองคิว)
```
WAITING ──call──► CALLED ──start/arrive──► SERVING ──done──► DONE
   │                │  ▲                      │
   │                │  └── recall (จากข้าม)    └─ transfer ──► WAITING (เคาน์เตอร์ใหม่, เลขเดิม)
   │                └──skip──► SKIPPED ──recall──► CALLED (หัวแถว)
   └──cancel──► CANCELLED (ลูกค้ายกเลิกเอง/staff/หมดวัน)        SKIPPED เกิน expiry ──► NO_SHOW
```
- **เรียก (call next)**: staff ที่ประจำเคาน์เตอร์กด → engine เลือกบัตร `WAITING` ของประเภทที่เคาน์เตอร์รับ เรียงตาม `priority DESC, createdAt ASC` → อัปเดตเป็น `CALLED` + ผูกเคาน์เตอร์ + broadcast SSE (จอ TV + มือถือ) — เลือกเจาะจงใบก็ได้ (call specific)
- **เรียกซ้ำ (recall announce)**: บัตร CALLED เดิม broadcast เสียง/จอซ้ำ, `callCount++` (ไม่เปลี่ยนสถานะ)
- **ข้าม (skip)**: CALLED → SKIPPED (ลูกค้าไม่มา) → เคาน์เตอร์เรียกใบถัดไปได้ทันที
- **เรียกคืน (recall skipped)**: SKIPPED → CALLED ที่เคาน์เตอร์ที่กด (ลูกค้าเพิ่งโผล่) — อยู่ในรายการ "คิวที่ข้าม" ให้กดคืนได้จนถึง `skippedExpiryMin` (default 60 นาที) เกินแล้ว auto → `NO_SHOW`
- **โอนเคาน์เตอร์ (transfer)**: CALLED/SERVING → กลับเป็น WAITING ที่ target counter/ประเภท พร้อม flag `transferredFrom` — **คงเลขเดิม**, เรียงแถวใหม่แบบ priority หัวแถว (ไม่ต้องรอท้ายแถว, configurable `transferToFront` default true)
- **เริ่มบริการ (serve)**: CALLED → SERVING (`servedAt`) · **จบ (done)**: SERVING → DONE (`doneAt`)
- **ยกเลิก**: ลูกค้ากดยกเลิกจากหน้าสถานะ (WAITING เท่านั้น) หรือ staff ยกเลิก · สิ้นวัน cron กวาด WAITING/CALLED/SKIPPED ค้าง → CANCELLED (`reason: END_OF_DAY`)
- ทุก transition เขียน `QueueTicketEvent` (ใคร/เคาน์เตอร์ไหน/เมื่อไร) — ใช้ทั้ง audit และคำนวณสถิติ

#### 3.6 จอแสดงคิว (TV display) ⚠️ บางส่วน
> as-built: ✅ `/s/<ร้าน>/<หน่วย>/queue/display/[displayToken]` (`QueueDisplay` หลายจอ · revoke ได้) · ❌ ไม่มี SSE (รีเฟรช 5 วินาที `AutoRefresh`) · ❌ ไม่มีเสียงเรียก/chime/ตั้งค่ารายจอ
- URL public: `/q/display/[displayToken]` — token ต่อ unit (`QueueDisplay` สร้างได้หลายจอ คนละ layout), เปิดบน Smart TV/มินิพีซี ไม่ต้อง login, revoke token ได้
- Layout (B&W ตัวใหญ่): โซนบน = คิวที่ **CALLED/SERVING ล่าสุดต่อเคาน์เตอร์** (เลขใหญ่ + ชื่อช่อง), โซนล่าง = รายการ "ถัดไป" 5 ใบ + จำนวนรอทั้งหมด, มุมจอ = เวลา + ชื่อร้าน/โลโก้
- Realtime: SSE `/api/store/[tenantSlug]/[unitSlug]/queue/display/[displayToken]/stream` (D10) — topic `pub:{unitId}:queue:display:{displayToken}` (scheme กลาง D14) — event `queue.called`, `queue.updated` · reconnect อัตโนมัติ + heartbeat 30s (จอทีวีเปิดทั้งวัน)
- **เสียงเรียก**: browser TTS (Web Speech API) — template TH: "หมายเลข A สิบสอง เชิญช่อง 2 ค่ะ" / EN toggle · + เสียง chime ก่อนพูด · จอที่ browser บล็อก autoplay: ปุ่ม "เปิดเสียง" ครั้งแรก (user gesture) · ตั้งค่าต่อจอ: เปิด/ปิดเสียง, ภาษา, จำนวนครั้งที่พูดซ้ำ (default 2)

#### 3.7 หน้าสถานะลูกค้า (มือถือ) ⚠️ บางส่วน
> as-built: ✅ `/s/<ร้าน>/<หน่วย>/queue/t/[publicToken]` เลข · สถานะ · เหลืออีก N คิว · เวลารอโดยประมาณ (`ceil((ข้างหน้า+1) ÷ เคาน์เตอร์เปิด × avgServiceMinFallback)` หรือ `etaAt`) · ❌ ไม่มีปุ่มยกเลิก · ❌ ไม่มี SSE/สั่น/เสียง · ❌ ไม่มีค่าเฉลี่ย 20 ใบล่าสุด
- URL: `/q/t/[publicToken]` (จาก QR บนบัตร/หลังรับคิวออนไลน์) — ไม่ต้อง login
- แสดง: เลขคิว, ประเภท, สถานะ, **เหลืออีก N คิว**, **เวลารอโดยประมาณ**, เวลาที่กดรับ, ปุ่ม "ยกเลิกคิว" (เฉพาะ WAITING)
- เมื่อถูกเรียก: จอเปลี่ยนเป็นเต็มจอ "ถึงคิวคุณแล้ว → ช่อง 2" + สั่น (Vibration API) + เสียง
- Realtime: SSE ต่อบัตร (`/api/store/[tenantSlug]/[unitSlug]/queue/ticket/[publicToken]/stream` — D10) — topic `pub:{unitId}:queue:ticket:{publicToken}` (scheme กลาง D14) — event: position เปลี่ยน, called, skipped ("คุณถูกข้าม กรุณาติดต่อเคาน์เตอร์")
- **Estimate เวลารอ** = `ceil(จำนวนคิวข้างหน้า (ประเภทที่แย่ง pool เดียวกัน ถ่วง priority) ÷ จำนวนเคาน์เตอร์ OPEN ที่รับประเภทนี้) × avgServiceMin` โดย `avgServiceMin` = rolling average เวลาบริการจริง 20 ใบล่าสุดของประเภทนั้นวันนี้ (fallback `avgServiceMinFallback`) — แสดงเป็นช่วง "~15–25 นาที" ไม่ใช่ตัวเลขเป๊ะ (กัน overpromise)

#### 3.8 แจ้งเตือนใกล้ถึงคิว ❌ (หน่วย QUEUE)
> as-built: `notifyBeforeCount`/`notifiedAt` ไม่มีผู้ใช้ · แจ้งเตือนใกล้ถึงคิว/ถึงคิวมีเฉพาะบัตรแถวเดียวของจองคิว (`booking.notify.nearTurnAhead` · `booking-notify.ts` · B.9)
- ตั้งใน `QueuePolicy.notifyBeforeCount` (default 3 — "เหลืออีก 3 คิว")
- ทุกครั้งที่คิวขยับ engine คำนวณ position ของ WAITING tickets ที่มี contact → ใบที่เพิ่งข้าม threshold และยังไม่เคยส่ง (`notifiedAt == null`) → `notify({channel: LINE|EMAIL|WEB, template: 'queue.almost', data: {number, position, estimateMin, statusUrl}})` + mark `notifiedAt`
- หน้าสถานะบนมือถือ = ช่องทางหลัก (WEB/SSE ฟรี เร็วสุด) — LINE/EMAIL เฉพาะที่รู้ตัวตน (member หรือกรอกเบอร์/อีเมลตอนรับคิว)

#### 3.9 Handoff จาก Booking ❌ (แทนด้วยบัตรแถวเดียว B.4)
> as-built: ไม่มี handoff นัด ARRIVED → บัตรของหน่วย QUEUE · จองคิวโหมดแถวเดียวออกบัตร P/A ใน `QueueTicket` ของหน่วย BOOKING เอง (`booking/queue-line.ts` → `issueTicketTx`) · `queue.ticket.done` ยิงจากฝั่งจองคิว (บัตรแถวเดียว) ไม่ใช่จาก Q
| | **Booking (โมดูล 3)** | **Q (โมดูล 4)** |
|---|---|---|
| ธรรมชาติ | นัดล่วงหน้า ตามเวลา ระบุช่าง | walk-in มาก่อนได้ก่อน ไม่ระบุเวลา |
| หน่วยจัดสรร | เวลา × ช่าง (slot) | ลำดับ × เคาน์เตอร์ |
| ลูกค้ารู้อะไร | วัน-เวลานัดแน่นอน | ลำดับ + เวลารอโดยประมาณ |
| เงิน | totalSatang ตอนจอง → POS | ไม่มีเงินในโมดูล → POS ตามปกติ |

**จุดเชื่อม (contract ฝั่ง Q):** service กลาง `queue.issueTicket({tenantId, unitId, typeCode, refType?, refId?, memberId?, contact?})`
- Booking เรียกตอนนัด ARRIVED (สเปคฝั่ง Booking ข้อ 8.6) ด้วย `typeCode:'APPOINTMENT', refType:'APPOINTMENT', refId: appointmentId`
- ผลลัพธ์: บัตร `P00x` priority 100 → ถูกเรียกก่อนคิวทั่วไป (ตาม `priority DESC, createdAt ASC` — นัดหลายคนมาพร้อมกันก็ FIFO กันเอง)
- จอเคาน์เตอร์แสดง context: "P003 — นัด 14:00 ตัดผม (ช่างเมย์)" (join ผ่าน refId, read-only)
- ร้านที่ไม่เปิดโมดูล Q: Booking ข้าม handoff เงียบๆ (optional dependency — ห้าม error ข้ามโมดูล)
- กันวนลูป: Q ไม่ callback ไป Booking ยกเว้น event **`queue.ticket.done`** `{refType, refId}` (ชื่อเต็มตาม naming standard D7 — `<module>.<entity>.<pastTense>`) → Booking อาจใช้แสดงบนหน้านัด (informational เท่านั้น ไม่เปลี่ยนสถานะนัดอัตโนมัติ)

#### 3.10 Anti-starvation 🔜
- v1: strict priority (APPOINTMENT > PREMIUM > GENERAL) — ความเสี่ยงคิวทั่วไปโดนแซงยาวมีจริงแต่ยอมรับได้ในร้านเล็ก (นัด/พรีเมียมมีจำนวนน้อย)
- 🔜 config `starvationGuard`: ทุกการเรียก N ใบ priority สูง บังคับแทรก GENERAL 1 ใบ (ratio ตั้งได้) — schema `QueuePolicy.starvationRatio Int?` เผื่อไว้แล้ว

---


### 4. Data Model — แทนที่แล้ว
8 model ใน `prisma/schema/queue.prisma` (+ `QueueTicket.etaAt` ของ SVC B.0) — `docs/sds/modules/queue.md` §2 · ร่าง v1 อ่านที่ `git show b3de0dce:docs/modules/04-queue.md`

### 5. API Endpoints — แทนที่แล้ว
server action `src/lib/modules/queue/actions.ts` (18) + รับบัตรสาธารณะ `src/app/(store)/s/[tenantSlug]/[unitSlug]/queue/actions.ts` + REST อ่าน `GET /api/v1/queue/tickets` · ❌ ไม่มี SSE stream `/api/store/.../queue/*/stream`

### 6. UI Screens — แทนที่แล้ว
`/app/u/[unitSlug]/queue` (บอร์ด) · `/app/u/[unitSlug]/queue/setup` · สาธารณะ `/s/<ร้าน>/<หน่วย>/queue` · `.../queue/t/[publicToken]` · `.../queue/display/[displayToken]` · ❌ ไม่มี `/q/kiosk` `/q/tickets` `/q/settings` `/q/reports`

### 7. Business Flows — แทนที่แล้ว
flow บัตรทั่วไป = หมวด V2 §1 · บัตรแถวเดียว = `docs/modules/03-booking.md` §4–§6 · cron = งาน `queue.housekeeping` ทุก 5 นาที

### 8. Integration — แทนที่แล้ว
CRM (`queue.served`) · จองคิวแถวเดียว (`issueTicketTx` · `moveTicketTx` · `ensureSystemQueueType`) · สมาชิก/Party ผูกหลัง commit (`linkPartyAfterCommit`) · AI proposals — SDS §1 §3

### 9. Permissions — แทนที่แล้ว
คีย์ของสเปก v1 (`queue.read` · `queue.issue` · `queue.operate` · `queue.config.manage` · `queue.report.read`) **ไม่มีในโค้ด** — คีย์จริง 18 ตัว (`queue.type.*` · `queue.counter.*` · `queue.display.*` · `queue.ticket.*`) ดู SDS §5

### 10. Reports & Metrics — ยังไม่มี
ไม่มีรายงาน/สถิติคิว (เวลารอเฉลี่ย · abandon · ชั่วโมงพีค)

### 11. Edge Cases & Rules — แทนที่แล้ว
กติกาจริงอยู่ในหัวไฟล์ `queue/service.ts` + SDS §5–§8

### 12. QC Checklist — แทนที่แล้ว
`scripts/qc-queue-public.mts` · ชุด queue ใน `scripts/qc-systems.mts` · บัตรแถวเดียวใน `scripts/qc-svc-b.4.mts` `b.5` `b.6` `b.9`
