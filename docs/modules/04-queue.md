# โมดูล 4: Q — บัตรคิว walk-in มาก่อนได้ก่อน (Queue Management)

> 🔄 REVISED หลัง QC — สอดคล้อง RESOLUTIONS.md (2026-07-11)
> scope: **unit** (ทุกตารางมี `tenantId + unitId`) · ยึด `_CONVENTIONS.md` + `BLUEPRINT.md` + `BLUEPRINT_BUSINESS_UNITS.md`
> ⚠️ ชื่อ model หลักคือ **`QueueTicket`** — กันชนกับโมดูล 5 Ticket (อีเวนต์) ตามกติกา _CONVENTIONS ข้อ 3
> กลุ่มเป้าหมาย: คลินิก, ธนาคาร/ศูนย์บริการ, ร้านอาหารรอโต๊ะ, ราชการ/เคาน์เตอร์บริการ, ร้านที่รับ walk-in
> คู่แฝด: โมดูล 3 (Booking) = นัดล่วงหน้าตามเวลา · Q = มาก่อนได้ก่อน — นัดที่ ARRIVED จะ handoff เข้ามาเป็นคิวพิเศษ (ข้อ 3.9)

---

## 1. ภาพรวม + ขอบเขต

### ทำอะไร (v1 / MVP ✅)
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

### ยังไม่ทำใน v1 (🔜)
- 🔜 **เครื่องพิมพ์บัตรความร้อน** (ESC/POS ผ่าน network printer) — v1 ใช้จอ tablet แสดงเลข + QR ให้ถ่าย/สแกน
- 🔜 **จองคิวล่วงหน้าแบบช่วงเวลา** (เลือกช่วง "มาช่วง 14:00–15:00") — เคสนี้ให้ใช้โมดูล Booking
- 🔜 **SMS แจ้งเตือน** (มีค่าใช้จ่าย — รอ billing), **หลายภาษาเสียงเรียกเกิน TH/EN**
- 🔜 **โหมด multi-step service** (คิวเดียวผ่านหลายจุด: ซักประวัติ→ตรวจ→รับยา) — v1 = 1 บัตร 1 จุดจบ, ใช้โอนเคาน์เตอร์แทนชั่วคราว
- ❌ ไม่ทำ: การเงินในโมดูลนี้ (ชำระเงิน = POS ตามปกติ, Q ไม่มีราคา), ไม่มี seat/โต๊ะ (ของ Restaurant)

---

## 2. Persona & User Stories

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

## 3. ฟังก์ชันทั้งหมด

### 3.1 เคาน์เตอร์ / จุดบริการ ✅
- `QueueCounter`: ชื่อ ("ช่อง 1", "ห้องตรวจ A"), code สั้นสำหรับจอ, สถานะ OPEN/CLOSED (เปิด-ปิดรายวันโดย staff — ปิด = ไม่รับเรียกคิวใหม่ แต่คิวที่ SERVING ค้างอยู่จบได้), ลำดับแสดงผล
- ผูกประเภทคิวที่รับ (`QueueCounterType` many-to-many): ช่อง 1–3 รับ A, ช่อง 4 รับ B+P — เคาน์เตอร์ไม่ผูกประเภทเลย = รับทุกประเภท
- staff กดเข้าประจำเคาน์เตอร์ (`activeUserId`) — 1 เคาน์เตอร์มี staff ประจำได้ 1 คน ณ เวลาหนึ่ง (คนใหม่กดเข้า = แทนที่ + log), 1 คนประจำได้ 1 เคาน์เตอร์

### 3.2 ประเภทคิว ✅
- `QueueType`: ชื่อ TH/EN, `code` (ใช้อ้างข้ามโมดูล เช่น `GENERAL`, `PREMIUM`, `APPOINTMENT`), `prefix` ตัวอักษร (A/B/P — unique ต่อ unit), `priority Int` (มาก = สำคัญกว่า, GENERAL=0, PREMIUM=50, APPOINTMENT=100), เปิด/ปิดรับคิวออนไลน์ต่อประเภท, เปิด/ปิดแสดงบน kiosk
- ประเภท `APPOINTMENT` เป็น system-created ตอนเปิด handoff กับ Booking (ซ่อนจาก kiosk — ออกได้จาก handoff เท่านั้น)
- `avgServiceMinFallback` (ค่าตั้งต้นเวลาให้บริการ/คิว ใช้ estimate ตอนยังไม่มีสถิติจริง, default 10 นาที)

### 3.3 ออกบัตรคิว ✅
3 ช่องทาง ทุกช่องทางลงเอยที่ service กลาง `queue.issueTicket()`:
1. **Kiosk mode** (`/app/u/[unitSlug]/q/kiosk` — fullscreen บน tablet, ล็อกหน้าจอด้วย PIN ออก): ปุ่มใหญ่ต่อประเภทคิว → ได้จอแสดงเลข + QR (ลิงก์หน้าสถานะ) ค้าง 15 วินาที → กลับหน้าแรก · ทำงานด้วย session ของ device ที่ staff login ไว้
2. **QR รับคิวออนไลน์** (public): ร้านพิมพ์ QR ถาวร (ลิงก์ `/s/[tenantSlug]/[unitSlug]/q`) แปะหน้าร้าน → ลูกค้าเลือกประเภท (เฉพาะที่เปิด online) + กรอกเบอร์/ชื่อ (optional ถ้าร้านตั้ง `requireContact=false`) → ได้บัตร + หน้าสถานะทันที · กันสแปม: 1 เบอร์/device fingerprint มีคิว active ได้ 1 ใบต่อ unit + rate limit
3. **Staff ออกให้** (dashboard): ปุ่ม "ออกบัตร" + เลือกประเภท + ผูก member/เบอร์ (optional)

### 3.4 เลขคิว + reset รายวัน ✅
- เลข = `prefix + zero-pad 3 หลัก` (`A001`…`A999` เกินพัน = `A1000` ไม่ตัด)
- ตัวนับต่อ (unit × ประเภท × business date): `QueueDailySequence` — increment แบบ atomic ใน transaction (`INSERT ... ON CONFLICT ... UPDATE value = value + 1 RETURNING value`) → เลขไม่ซ้ำแม้ 50 คนกดพร้อมกัน
- `businessDate` คำนวณจาก timezone ร้าน (`unit.settings.timezone`) — เที่ยงคืนร้าน = ขึ้นวันใหม่ = ตัวนับเริ่ม 1 เอง (ไม่มี cron reset — reset โดย key ของ sequence)
- บัตรมี `publicToken` (cuid) สำหรับหน้าสถานะลูกค้า — เดาไม่ได้, ไม่ใช้เลขคิวเป็น identifier public

### 3.5 วงจรสถานะบัตร + การจัดการคิว ✅
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

### 3.6 จอแสดงคิว (TV display) ✅
- URL public: `/q/display/[displayToken]` — token ต่อ unit (`QueueDisplay` สร้างได้หลายจอ คนละ layout), เปิดบน Smart TV/มินิพีซี ไม่ต้อง login, revoke token ได้
- Layout (B&W ตัวใหญ่): โซนบน = คิวที่ **CALLED/SERVING ล่าสุดต่อเคาน์เตอร์** (เลขใหญ่ + ชื่อช่อง), โซนล่าง = รายการ "ถัดไป" 5 ใบ + จำนวนรอทั้งหมด, มุมจอ = เวลา + ชื่อร้าน/โลโก้
- Realtime: SSE `/api/store/[tenantSlug]/[unitSlug]/queue/display/[displayToken]/stream` (D10) — topic `pub:{unitId}:queue:display:{displayToken}` (scheme กลาง D14) — event `queue.called`, `queue.updated` · reconnect อัตโนมัติ + heartbeat 30s (จอทีวีเปิดทั้งวัน)
- **เสียงเรียก**: browser TTS (Web Speech API) — template TH: "หมายเลข A สิบสอง เชิญช่อง 2 ค่ะ" / EN toggle · + เสียง chime ก่อนพูด · จอที่ browser บล็อก autoplay: ปุ่ม "เปิดเสียง" ครั้งแรก (user gesture) · ตั้งค่าต่อจอ: เปิด/ปิดเสียง, ภาษา, จำนวนครั้งที่พูดซ้ำ (default 2)

### 3.7 หน้าสถานะลูกค้า (มือถือ) ✅
- URL: `/q/t/[publicToken]` (จาก QR บนบัตร/หลังรับคิวออนไลน์) — ไม่ต้อง login
- แสดง: เลขคิว, ประเภท, สถานะ, **เหลืออีก N คิว**, **เวลารอโดยประมาณ**, เวลาที่กดรับ, ปุ่ม "ยกเลิกคิว" (เฉพาะ WAITING)
- เมื่อถูกเรียก: จอเปลี่ยนเป็นเต็มจอ "ถึงคิวคุณแล้ว → ช่อง 2" + สั่น (Vibration API) + เสียง
- Realtime: SSE ต่อบัตร (`/api/store/[tenantSlug]/[unitSlug]/queue/ticket/[publicToken]/stream` — D10) — topic `pub:{unitId}:queue:ticket:{publicToken}` (scheme กลาง D14) — event: position เปลี่ยน, called, skipped ("คุณถูกข้าม กรุณาติดต่อเคาน์เตอร์")
- **Estimate เวลารอ** = `ceil(จำนวนคิวข้างหน้า (ประเภทที่แย่ง pool เดียวกัน ถ่วง priority) ÷ จำนวนเคาน์เตอร์ OPEN ที่รับประเภทนี้) × avgServiceMin` โดย `avgServiceMin` = rolling average เวลาบริการจริง 20 ใบล่าสุดของประเภทนั้นวันนี้ (fallback `avgServiceMinFallback`) — แสดงเป็นช่วง "~15–25 นาที" ไม่ใช่ตัวเลขเป๊ะ (กัน overpromise)

### 3.8 แจ้งเตือนใกล้ถึงคิว ✅
- ตั้งใน `QueuePolicy.notifyBeforeCount` (default 3 — "เหลืออีก 3 คิว")
- ทุกครั้งที่คิวขยับ engine คำนวณ position ของ WAITING tickets ที่มี contact → ใบที่เพิ่งข้าม threshold และยังไม่เคยส่ง (`notifiedAt == null`) → `notify({channel: LINE|EMAIL|WEB, template: 'queue.almost', data: {number, position, estimateMin, statusUrl}})` + mark `notifiedAt`
- หน้าสถานะบนมือถือ = ช่องทางหลัก (WEB/SSE ฟรี เร็วสุด) — LINE/EMAIL เฉพาะที่รู้ตัวตน (member หรือกรอกเบอร์/อีเมลตอนรับคิว)

### 3.9 Handoff จาก Booking ✅ (ความต่าง + จุดเชื่อม)
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

### 3.10 Anti-starvation 🔜
- v1: strict priority (APPOINTMENT > PREMIUM > GENERAL) — ความเสี่ยงคิวทั่วไปโดนแซงยาวมีจริงแต่ยอมรับได้ในร้านเล็ก (นัด/พรีเมียมมีจำนวนน้อย)
- 🔜 config `starvationGuard`: ทุกการเรียก N ใบ priority สูง บังคับแทรก GENERAL 1 ใบ (ratio ตั้งได้) — schema `QueuePolicy.starvationRatio Int?` เผื่อไว้แล้ว

---

## 4. Data Model (Prisma)

> ทุก model: `tenantId + unitId`, id cuid, `createdAt/updatedAt`, ไม่มี hard delete ธุรกรรม
> โมดูลนี้ไม่มี field เงิน (การเงินอยู่ POS)

```prisma
// ---------- Configuration ----------

enum QueueTypeStatus { ACTIVE HIDDEN ARCHIVED }

model QueueType {
  id                    String  @id @default(cuid())
  tenantId              String
  unitId                String
  code                  String            // GENERAL | PREMIUM | APPOINTMENT | custom
  name                  String            // "คิวทั่วไป"
  nameEn                String?
  prefix                String            // "A" (1-3 ตัวอักษร)
  priority              Int     @default(0)     // มาก = เรียกก่อน
  onlineIssuable        Boolean @default(true)  // รับจาก QR ออนไลน์ได้
  kioskIssuable         Boolean @default(true)  // โชว์ปุ่มบน kiosk
  requireContact        Boolean @default(false) // บังคับกรอกเบอร์ตอนรับออนไลน์
  avgServiceMinFallback Int     @default(10)
  sortOrder             Int     @default(0)
  status                QueueTypeStatus @default(ACTIVE)
  isSystem              Boolean @default(false) // APPOINTMENT (สร้าง/ลบโดยระบบ)
  counters              QueueCounterType[]
  tickets               QueueTicket[]
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@unique([unitId, code])
  @@unique([unitId, prefix])
  @@index([tenantId])
  @@index([unitId, status])
}

enum QueueCounterStatus { OPEN CLOSED ARCHIVED }

model QueueCounter {
  id           String  @id @default(cuid())
  tenantId     String
  unitId       String
  name         String            // "ช่อง 1"
  nameEn       String?
  code         String            // สั้นๆ สำหรับจอ TV: "1", "A"
  status       QueueCounterStatus @default(CLOSED)
  activeUserId String?           // staff ที่ประจำอยู่ตอนนี้
  sortOrder    Int     @default(0)
  types        QueueCounterType[]
  tickets      QueueTicket[]     @relation("CurrentCounter")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([unitId, code])
  @@unique([unitId, name])
  @@index([tenantId])
  @@index([unitId, status])
}

model QueueCounterType {          // เคาน์เตอร์ไหนรับประเภทไหน (ไม่มีแถว = รับทุกประเภท)
  id        String @id @default(cuid())
  tenantId  String
  unitId    String
  counterId String
  counter   QueueCounter @relation(fields: [counterId], references: [id])
  typeId    String
  type      QueueType    @relation(fields: [typeId], references: [id])
  createdAt DateTime @default(now())

  @@unique([counterId, typeId])
  @@index([tenantId])
  @@index([unitId, typeId])
}

model QueuePolicy {               // 1 แถว / unit
  id                String  @id @default(cuid())
  tenantId          String
  unitId            String  @unique
  notifyBeforeCount Int     @default(3)   // เหลือ N คิว → แจ้งเตือน
  skippedExpiryMin  Int     @default(60)  // SKIPPED เกินนี้ → NO_SHOW
  recallAnnounceMax Int     @default(2)   // เสียงพูดซ้ำกี่รอบต่อการเรียก
  transferToFront   Boolean @default(true)
  onlineIssueOpen   Boolean @default(true) // ปิดรับคิวออนไลน์ชั่วคราวทั้ง unit (คิวล้น)
  starvationRatio   Int?                   // 🔜 null = strict priority
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([tenantId])
}

// ---------- Sequence (reset รายวันโดย key ไม่ใช่ cron) ----------

model QueueDailySequence {
  id           String   @id @default(cuid())
  tenantId     String
  unitId       String
  typeId       String
  businessDate String            // "2026-07-11" ตาม timezone ร้าน
  value        Int      @default(0)   // increment atomic: ON CONFLICT UPDATE value=value+1
  updatedAt    DateTime @updatedAt

  @@unique([unitId, typeId, businessDate])
  @@index([tenantId])
}

// ---------- Ticket ----------

enum QueueTicketStatus { WAITING CALLED SERVING DONE SKIPPED NO_SHOW CANCELLED }
enum QueueIssueChannel { KIOSK ONLINE STAFF BOOKING }

model QueueTicket {
  id             String   @id @default(cuid())
  tenantId       String
  unitId         String
  typeId         String
  type           QueueType @relation(fields: [typeId], references: [id])
  businessDate   String                  // "2026-07-11"
  seq            Int                     // เลขลำดับดิบจาก sequence
  number         String                  // "A012" (prefix + pad)
  status         QueueTicketStatus @default(WAITING)
  priority       Int                     // snapshot จาก type ตอนออกบัตร
  channel        QueueIssueChannel
  counterId      String?                 // เคาน์เตอร์ปัจจุบัน (หลัง CALLED/โอน)
  counter        QueueCounter? @relation("CurrentCounter", fields: [counterId], references: [id])
  memberId       String?                 // CustomerProfile — contract 2.6
  contactName    String?                 // guest snapshot
  contactPhone   String?                 // E.164
  contactEmail   String?
  refType        String?                 // "APPOINTMENT" (handoff จาก Booking)
  refId          String?                 // appointmentId
  publicToken    String   @unique @default(cuid())  // หน้าสถานะลูกค้า
  callCount      Int      @default(0)
  transferredFromCounterId String?
  notifiedAt     DateTime?               // ส่งเตือนใกล้ถึงคิวแล้ว (กันซ้ำ)
  calledAt       DateTime?               // ครั้งแรกที่ถูกเรียก
  servedAt       DateTime?               // เริ่มบริการ
  doneAt         DateTime?
  skippedAt      DateTime?
  cancelledAt    DateTime?
  cancelReason   String?                 // CUSTOMER | STAFF | END_OF_DAY
  events         QueueTicketEvent[]
  issuedBy       String?                 // userId (channel STAFF/KIOSK)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([unitId, typeId, businessDate, seq])          // เลขไม่ซ้ำในวัน
  @@index([tenantId])
  @@index([unitId, businessDate, status, priority, createdAt]) // call-next + จอ TV
  @@index([unitId, counterId, status])
  @@index([refType, refId])                              // lookup จาก Booking
  @@index([memberId])
  @@index([unitId, contactPhone, businessDate, status])  // กันรับคิวซ้ำ
}

model QueueTicketEvent {          // ทุก transition — audit + สถิติ
  id        String   @id @default(cuid())
  tenantId  String
  unitId    String
  ticketId  String
  ticket    QueueTicket @relation(fields: [ticketId], references: [id])
  action    String            // ISSUED|CALLED|RECALLED|SKIPPED|RECALL_SKIPPED|TRANSFERRED|SERVING|DONE|NO_SHOW|CANCELLED|NOTIFIED
  counterId String?
  actorType String            // STAFF | CUSTOMER | SYSTEM
  actorId   String?
  detail    Json?             // เช่น {fromCounterId, toCounterId}
  createdAt DateTime @default(now())

  @@index([tenantId])
  @@index([ticketId, createdAt])
  @@index([unitId, createdAt])
}

// ---------- Display ----------

model QueueDisplay {              // จอ TV — สร้างได้หลายจอ / unit
  id           String  @id @default(cuid())
  tenantId     String
  unitId       String
  name         String            // "จอหน้าร้าน", "จอชั้น 2"
  displayToken String  @unique @default(cuid())
  settings     Json    @default("{}")  // {voice: true, lang: "th", showNextCount: 5, chime: true}
  revokedAt    DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([unitId, name])
  @@index([tenantId])
}
```

หมายเหตุ schema:
- `priority` snapshot ลงบัตรตอนออก — แก้ priority ของ type ภายหลังไม่เขย่าลำดับคิวที่ค้างอยู่ (ยุติธรรมต่อคนที่รออยู่)
- `businessDate` เป็น String (`YYYY-MM-DD` ตามโซนร้าน) จงใจไม่ใช้ DateTime — มันคือ label ทางธุรกิจ ไม่ใช่ instant
- ไม่มี hard delete: type/counter = ARCHIVED, ticket = สถานะจบ (DONE/NO_SHOW/CANCELLED) อยู่ถาวรเพื่อสถิติ

---

## 5. API Endpoints

> ฐาน dashboard: `/api/u/[unitId]/q/...` — middleware ตรวจ unit ∈ tenant + `can(..., module:'QUEUE', action)`
> ฐาน public: `/api/store/[tenantSlug]/[unitSlug]/queue/...` (prefix มาตรฐานเดียวตาม D10) — token-based, rate-limited, ไม่มีข้อมูลส่วนตัวเกินจำเป็น

### Configuration (dashboard)
| Method | Path | Body หลัก | สิทธิ์ |
|---|---|---|---|
| GET/POST | `/api/u/:unitId/q/types` | `{code, name, prefix, priority, onlineIssuable, ...}` | read: `queue.read` · write: `queue.config.manage` |
| PATCH/DELETE | `/api/u/:unitId/q/types/:id` | partial / archive (isSystem ห้ามแก้ code/ลบ) | `queue.config.manage` |
| GET/POST | `/api/u/:unitId/q/counters` | `{name, code, typeIds[]}` | `queue.config.manage` |
| PATCH/DELETE | `/api/u/:unitId/q/counters/:id` | partial / archive | `queue.config.manage` |
| POST | `/api/u/:unitId/q/counters/:id/open` · `/close` | เปิด-ปิดรายวัน + `{takeOver?: true}` ประจำเคาน์เตอร์ | `queue.operate` |
| GET/PUT | `/api/u/:unitId/q/policy` | QueuePolicy | write: `queue.config.manage` |
| GET/POST | `/api/u/:unitId/q/displays` | `{name, settings}` → คืน displayToken + URL | `queue.config.manage` |
| POST | `/api/u/:unitId/q/displays/:id/revoke` | หมุน token ใหม่ | `queue.config.manage` |

### Ticket operations (dashboard)
| Method | Path | Body หลัก | สิทธิ์ |
|---|---|---|---|
| GET | `/api/u/:unitId/q/tickets` | `?date=&status=&typeId=&counterId=` | `queue.read` |
| POST | `/api/u/:unitId/q/tickets` | `{typeId, memberId?|contact{}, channel:'STAFF'|'KIOSK'}` → บัตร + publicToken | `queue.issue` |
| POST | `/api/u/:unitId/q/counters/:counterId/call-next` | `{}` → engine เลือกให้ · 404 `NO_WAITING` เมื่อว่าง | `queue.operate` |
| POST | `/api/u/:unitId/q/tickets/:id/call` | เรียกเจาะจงใบ (ต้องระบุ counter ที่ตัวเองประจำ) | `queue.operate` |
| POST | `/api/u/:unitId/q/tickets/:id/recall` | ประกาศซ้ำ (CALLED เท่านั้น) | `queue.operate` |
| POST | `/api/u/:unitId/q/tickets/:id/skip` | CALLED → SKIPPED | `queue.operate` |
| POST | `/api/u/:unitId/q/tickets/:id/recall-skipped` | SKIPPED → CALLED ที่เคาน์เตอร์ผู้กด | `queue.operate` |
| POST | `/api/u/:unitId/q/tickets/:id/transfer` | `{toCounterId?, toTypeId?}` → WAITING ใหม่ เลขเดิม | `queue.operate` |
| POST | `/api/u/:unitId/q/tickets/:id/serve` · `/done` | CALLED→SERVING · SERVING→DONE | `queue.operate` |
| POST | `/api/u/:unitId/q/tickets/:id/cancel` | `{reason}` | `queue.operate` |
| GET | `/api/u/:unitId/q/board` | สรุปทั้งหมดจอเดียว: ต่อเคาน์เตอร์ (current ticket) + waiting list + skipped list + ตัวเลขวันนี้ | `queue.read` |
| GET | `/api/u/:unitId/q/stream` | SSE dashboard: `queue.changed` | `queue.read` |

### Reports (dashboard)
| Method | Path | สิทธิ์ |
|---|---|---|
| GET | `/api/u/:unitId/q/reports/summary?from=&to=` | `queue.report.read` |
| GET | `/api/u/:unitId/q/reports/hourly?date=` | `queue.report.read` |

### Public (ไม่ต้อง login)
| Method | Path | หมายเหตุ |
|---|---|---|
| GET | `/api/store/:tenantSlug/:unitSlug/queue` | ประเภทคิวที่เปิด online + สถานะรับคิว + จำนวนรอ (ตัวเลขรวม ไม่มีข้อมูลบุคคล) |
| POST | `/api/store/:tenantSlug/:unitSlug/queue/issue` | `{typeId, contact?{name, phone?, email?}}` → บัตร + publicToken · rate limit 5/นาที/IP · กันคิวซ้ำต่อเบอร์ |
| GET | `/api/store/:tenantSlug/:unitSlug/queue/ticket/:publicToken` | สถานะบัตร + position + estimate |
| GET | `/api/store/:tenantSlug/:unitSlug/queue/ticket/:publicToken/stream` | SSE ต่อบัตร (topic `pub:{unitId}:queue:ticket:{publicToken}`) |
| POST | `/api/store/:tenantSlug/:unitSlug/queue/ticket/:publicToken/cancel` | WAITING เท่านั้น |
| GET | `/api/store/:tenantSlug/:unitSlug/queue/display/:displayToken` | snapshot จอ TV (called ล่าสุดต่อเคาน์เตอร์ + next list) |
| GET | `/api/store/:tenantSlug/:unitSlug/queue/display/:displayToken/stream` | SSE จอ TV (heartbeat 30s · topic `pub:{unitId}:queue:display:{displayToken}`) |

### Internal service (เรียกภายใน process — ไม่ใช่ HTTP)
```
queue.issueTicket({tenantId, unitId, typeCode, refType?, refId?, memberId?, contact?})
  → {ticketId, number, publicToken}          // Booking handoff เรียกตัวนี้ (channel=BOOKING)
queue.onDone(ticket) → emit event 'queue.ticket.done' {refType, refId}   // ชื่อเต็มตาม D7 — Booking subscribe (informational)
```

---

## 6. UI Screens

### Dashboard (`/app/u/[unitSlug]/q/...`)
| Route | หน้าจอ | จุดสำคัญ |
|---|---|---|
| `/q` | **Queue Board** (default — จอทำงานหลักของ staff) | ซ้าย: การ์ดต่อเคาน์เตอร์ (บัตรปัจจุบัน + ปุ่ม เรียกถัดไป/เรียกซ้ำ/ข้าม/เริ่ม/จบ/โอน) · ขวา: waiting list เรียงตามลำดับจะถูกเรียกจริง + tab "คิวที่ข้าม" (ปุ่มเรียกคืน + เวลาหมดอายุนับถอยหลัง) · หัวจอ: ตัวเลขวันนี้ (รอ/เสร็จ/ข้าม) + toggle เปิด-ปิดรับคิวออนไลน์ · SSE realtime |
| `/q/kiosk` | **Kiosk mode** (fullscreen บน tablet) | ปุ่มประเภทคิวใหญ่เต็มจอ → จอแสดงเลข+QR 15 วิ → วนกลับ · ออกจากโหมด = PIN · กันจอหลับ (wake lock) |
| `/q/tickets` | ประวัติบัตร (list) | filter วัน/สถานะ/ประเภท/เคาน์เตอร์, คลิกดู timeline events |
| `/q/settings` | ตั้งค่า | 4 tab: ประเภทคิว (ตาราง + prefix + priority) / เคาน์เตอร์ (+ matrix ประเภทที่รับ) / จอแสดงผล (list จอ + URL + QR + ปุ่ม revoke) / นโยบาย (QueuePolicy) |
| `/q/reports` | รายงาน | ดูข้อ 10 |

Mobile behavior: Queue Board ยุบเป็น tab (เคาน์เตอร์ฉัน / รอทั้งหมด / ข้าม) — ปุ่ม "เรียกถัดไป" ใหญ่ล่างจอ (มือถือคือรีโมตเรียกคิวของ staff)

### Public / Storefront
| หน้า | เนื้อหา |
|---|---|
| `/s/[tenantSlug]/[unitSlug]/q` | รับคิวออนไลน์: สถานะร้าน (เปิดรับ/คิวเต็ม/ปิด) + ปุ่มประเภท + จำนวนรอ~เวลา ต่อประเภท + ฟอร์ม contact (ตาม requireContact) |
| `/q/t/[publicToken]` | หน้าสถานะบัตร: เลขใหญ่กลางจอ, "เหลืออีก N คิว · ~15–25 นาที", แถบ progress, ปุ่มยกเลิก · ถูกเรียก = เต็มจอ + สั่น + ช่องที่ต้องไป · ถูกข้าม = ข้อความ + ให้ติดต่อเคาน์เตอร์ |
| `/q/display/[displayToken]` | จอ TV: ดูข้อ 3.6 — ตัวอักษรใหญ่อ่านได้จาก 10 เมตร, B&W contrast สูง, ไม่มีปุ่ม (ยกเว้น "เปิดเสียง" ครั้งแรก), auto-reconnect + นาฬิกา |

ทุกหน้า i18n TH/EN, empty/loading/error state ครบ (จอ TV มี state "หลุดการเชื่อมต่อ — กำลังเชื่อมใหม่" แบบไม่ทำให้ลูกค้าตกใจ)

---

## 7. Business Flows

### 7.1 รับคิวจาก kiosk → ถูกเรียก → จบบริการ
```
1. ลูกค้าแตะ "คิวทั่วไป" บน tablet
2. Server: tx → upsert QueueDailySequence(unit, type, "2026-07-11") value+1 → seq=12
   → INSERT QueueTicket(number "A012", WAITING, priority snapshot 0) + event ISSUED
3. จอ kiosk แสดง A012 + QR (/q/t/{publicToken}) 15 วิ · SSE queue.changed → Board + จอ TV อัปเดตจำนวนรอ
4. ลูกค้าสแกน QR → หน้าสถานะ: "เหลืออีก 4 คิว ~20-30 นาที"
5. คิวขยับจนเหลือ 3 → notify(queue.almost) ครั้งเดียว (notifiedAt)
6. Staff ช่อง 2 กด "เรียกถัดไป" → tx: SELECT ... WHERE status=WAITING AND type ∈ counter types
   ORDER BY priority DESC, createdAt ASC LIMIT 1 FOR UPDATE SKIP LOCKED → A012
   → CALLED + counterId + calledAt + event → SSE: จอ TV ขึ้น "A012 → ช่อง 2" + TTS 2 รอบ · มือถือลูกค้าเด้งเต็มจอ+สั่น
7. ลูกค้าถึงช่อง → staff กด "เริ่ม" (SERVING) → เสร็จ → "จบ" (DONE, doneAt) → สถิติได้ wait=calledAt-createdAt, service=doneAt-servedAt
FAIL ไม่มีคิวรอ → 404 NO_WAITING → ปุ่มขึ้น "ไม่มีคิวรอ"
```

### 7.2 ลูกค้าไม่มา → ข้าม → เรียกคืน
```
เรียก A013 → รอ → กด "เรียกซ้ำ" (callCount=2, TTS อีกรอบ) → ยังไม่มา → "ข้าม" (SKIPPED, skippedAt)
→ A013 ไปอยู่ tab "คิวที่ข้าม" (นับถอยหลัง 60 นาที) → staff เรียก A014 ต่อได้ทันที
→ 20 นาทีต่อมาลูกค้า A013 โผล่ → staff ช่องไหนก็ได้กด "เรียกคืน" → CALLED ที่ช่องนั้น (ไม่ต้องรอใหม่)
→ ถ้าไม่โผล่จน 60 นาที → cron sweep → NO_SHOW + event(SYSTEM)
มือถือลูกค้าตอน SKIPPED: "คุณถูกข้ามเนื่องจากไม่แสดงตัว — กรุณาติดต่อเคาน์เตอร์ภายใน 60 นาที"
```

### 7.3 โอนคิวข้ามเคาน์เตอร์
```
ช่อง 1 (ซักประวัติ) จบส่วนของตัวเอง → กด "โอน" เลือกช่องการเงิน
→ ticket กลับเป็น WAITING, counterId=null→target hint, transferredFromCounterId=ช่อง1, event TRANSFERRED
→ transferToFront=true → ถูกจัดเรียงเสมือน priority สูง (ORDER BY: transferred first) → ช่องการเงินกดเรียกถัดไป = ได้ใบนี้ก่อน
→ เลขเดิม A012 ตลอดทาง (ลูกค้าไม่งง)
```

### 7.4 Handoff จาก Booking (คิวพิเศษ)
```
ลูกค้ามีนัด 14:00 มาถึง 13:50 → front desk กด ARRIVED ในโมดูล Booking
→ Booking เรียก queue.issueTicket({typeCode:'APPOINTMENT', refType:'APPOINTMENT', refId, memberId})
→ ได้ P003 (priority 100) → แซง A ทั้งหมดที่รออยู่ แต่ FIFO กับ P ด้วยกัน
→ ช่างว่าง กด call-next → ได้ P003 พร้อม context "นัด 14:00 · ตัดผม · ช่างเมย์"
→ จบบริการ → emit event `queue.ticket.done` → หน้านัดในโมดูล Booking โชว์ "ผ่านคิว P003 แล้ว" (informational)
กรณี unit ไม่มี QueueType APPOINTMENT (ยังไม่เปิด handoff) → issueTicket ตอบ error ชัด → Booking catch แล้วข้าม (ไม่ล้ม flow ARRIVED)
```

### 7.5 รับคิวออนไลน์ (remote) + กันซ้ำ
```
สแกน QR หน้าร้าน → เลือกประเภท → กรอกเบอร์ → POST issue
→ ตรวจ: policy.onlineIssueOpen? type.onlineIssuable? เบอร์นี้มีบัตร active (WAITING/CALLED) วันนี้ใน unit แล้ว?
   → มีแล้ว = 409 DUPLICATE + ลิงก์ไปบัตรเดิม (ไม่ออกใหม่)
→ ออกบัตร (channel ONLINE) → redirect หน้าสถานะทันที
FAIL ร้านปิดรับ (toggle จาก Board) → 423 "งดรับคิวออนไลน์ชั่วคราว กรุณารับที่หน้าร้าน"
```

### 7.6 Cron / งานพื้นหลัง (ทุก 5 นาที + สิ้นวัน)
```
a) SKIPPED เกิน skippedExpiryMin → NO_SHOW + event(SYSTEM)
b) สิ้นวันร้าน (business date เปลี่ยน + 1 ชม. กันเหลื่อม): WAITING/CALLED/SKIPPED ค้าง
   → CANCELLED(END_OF_DAY) + event — วันใหม่เริ่มศูนย์เสมอ
c) คำนวณ/แคช rolling avgServiceMin ต่อ type (ใช้ estimate) — เก็บใน cache/Json ไม่ต้องมีตารางเพิ่ม
```

---

## 8. Integration

| Contract | จุดที่เรียก | รายละเอียด |
|---|---|---|
| **8.1 Notify** (2.5) | ใกล้ถึงคิว (3.8), ถูกเรียก (สำรองเมื่อไม่มี SSE เปิดอยู่), ถูกข้าม | templates: `queue.almost`, `queue.called`, `queue.skipped` — data: {number, counterName, estimateMin, statusUrl} · หน้า SSE เปิดอยู่ = ไม่ส่งซ้ำช่องอื่น (dedupe ที่ notify layer ด้วย tag) |
| **8.2 Booking handoff** (โมดูล 3 ข้อ 8.6) | Booking → `queue.issueTicket()` ตอนนัด ARRIVED · Q → emit `queue.ticket.done` `{refType, refId}` (D7) | Q เป็นฝ่ายรับ (provider) — สัญญา: typeCode `APPOINTMENT`, refType/refId, priority มาจาก type, join แสดง context ที่จอเคาน์เตอร์แบบ read-only ผ่าน refId · **สองโมดูลต้องอยู่ unit เดียวกันเท่านั้น** |
| **8.3 Member** (2.6) | ออกบัตรผูก memberId | guest เก็บ contact snapshot ในบัตร · เบอร์ match member ได้ภายหลัง · จอ Board โชว์ชื่อ member (สิทธิ์ queue.read ขึ้นไป) — จอ TV **ไม่แสดงชื่อ** (privacy: เลขคิวเท่านั้น) |
| **8.4 POS / Point / Account** | ไม่เรียกโดยตรง | Q ไม่มีธุรกรรมเงิน — ลูกค้าจ่ายผ่าน POS ปกติ (staff ผูก memberId ที่ POS เอง) · ไม่มี point event จากการรับคิว |
| **8.5 AuditLog กลาง** | แก้ config, revoke display token, ปิดรับคิวออนไลน์ | ตามกติการ่วมข้อ 5 (การ operate คิวปกติใช้ QueueTicketEvent อยู่แล้ว ไม่ซ้ำซ้อน AuditLog) |
| **8.6 SSE hub กลาง** | Board, จอ TV, หน้าบัตรลูกค้า | ใช้โครง realtime กลางของแพลตฟอร์ม (BLUEPRINT ข้อ 11: วาง connection ตั้งแต่ต้น) — **topic ตาม scheme กลาง (D14)**: dashboard/Board = `t:{tenantId}:u:{unitId}:queue:{topic}` (เช่น `...:queue:board`) · จอ TV = `pub:{unitId}:queue:display:{displayToken}` · บัตรลูกค้า = `pub:{unitId}:queue:ticket:{publicToken}` |

---

## 9. Permissions (action × role)

module = `QUEUE` · ตรวจ `can(user, {tenantId, unitId, module, action})` 4 มิติ

| Action | OWNER | MANAGER (unit) | STAFF (default) | หมายเหตุ |
|---|---|---|---|---|
| `queue.read` (Board/list/ประวัติ) | ✅ | ✅ | ✅ | |
| `queue.issue` (ออกบัตร kiosk/มือ) | ✅ | ✅ | ✅ | kiosk ใช้ session device ของ staff |
| `queue.operate` (เรียก/ข้าม/คืน/โอน/จบ/เปิด-ปิดเคาน์เตอร์/toggle รับออนไลน์) | ✅ | ✅ | ✅ | call ได้เฉพาะเคาน์เตอร์ที่ตัวเองประจำ (ยกเว้น MANAGER+ ทำแทนได้) |
| `queue.config.manage` (ประเภท/เคาน์เตอร์/นโยบาย/จอ) | ✅ | ✅ | ❌ | revoke display token ลง AuditLog |
| `queue.report.read` | ✅ | ✅ | ❌ | |

Public (ไม่มี role): จอ TV = displayToken · หน้าบัตร = publicToken · รับคิวออนไลน์ = open + rate limit — ทั้งหมด read เฉพาะข้อมูลจำเป็น ไม่มีชื่อ-เบอร์คนอื่น

---

## 10. Reports & Metrics

คำนวณจาก timestamp บน `QueueTicket` + `QueueTicketEvent` — ทุกรายงานเลือกช่วงวัน, export CSV

1. **สรุปรายวัน** — บัตรที่ออกทั้งหมด (แยกประเภท/ช่องทาง KIOSK:ONLINE:STAFF:BOOKING), เสร็จ (DONE), ข้าม→NO_SHOW, ยกเลิก
2. **เวลารอเฉลี่ย/มัธยฐาน/P90** — `calledAt - createdAt` ต่อประเภท ต่อวัน — P90 สำคัญกว่า average (ลูกค้าจำครั้งที่แย่)
3. **เวลาให้บริการเฉลี่ย** — `doneAt - servedAt` ต่อประเภท/ต่อเคาน์เตอร์/ต่อ staff (ใครเร็ว-ช้า)
4. **Abandon rate** — (CANCELLED โดย CUSTOMER + NO_SHOW) ÷ บัตรที่ออก — แยกช่องทาง (คิวออนไลน์ abandon สูงกว่าเสมอ — วัดเพื่อตั้ง expectation)
5. **Heatmap ชั่วโมง×วัน** — บัตรออก/เวลารอ ต่อชั่วโมง → ใช้จัดเวรเคาน์เตอร์
6. **ประสิทธิภาพเคาน์เตอร์** — จำนวนบัตรที่จบ/ชม.เปิด ต่อเคาน์เตอร์, เวลาที่เปิดแต่ idle
7. **Handoff จาก Booking** — จำนวนบัตร BOOKING channel, เวลารอของคิวนัดเทียบ walk-in (พิสูจน์ว่านัดแล้วเร็วกว่าจริง)
8. **KPI การ์ด Overview "ทุกกิจการ"** — `รอตอนนี้ / เรียกแล้ว / เสร็จวันนี้ / เวลารอเฉลี่ยวันนี้`

---

## 11. Edge Cases & Rules

1. **ออกบัตรพร้อมกัน** — เลขต้องไม่ซ้ำ: atomic upsert `QueueDailySequence` + `@@unique([unitId, typeId, businessDate, seq])` เป็นตาข่ายชั้นสอง — load test 50 concurrent ต้องได้เลขต่อเนื่องไม่ซ้ำไม่ข้าม
2. **เรียกคิวพร้อมกัน 2 เคาน์เตอร์** — `FOR UPDATE SKIP LOCKED` ตอน call-next → สองช่องกดพร้อมกันได้คนละใบ ไม่มีใบเดียวโดนเรียกซ้ำ 2 ช่อง
3. **เที่ยงคืน/business date** — บัตรออก 23:59 ใช้ businessDate ของวันนั้น · sweep สิ้นวันเว้นระยะ 1 ชม. กันเคสร้านปิดดึกคาบเกี่ยว · ร้านเปิดข้ามคืน (บาร์) = business date ตัดตาม `unit.settings.dayCutoffHour` (default 0) 🔜 v1 ตัดเที่ยงคืนตรง
4. **จอ TV หลุดเน็ต** — SSE heartbeat 30s + auto-reconnect + ตอน reconnect ดึง snapshot เต็มก่อนฟัง delta (กัน state ค้าง) · จอแสดง badge เชื่อมต่อเงียบๆ
5. **เสียง TTS โดน autoplay policy บล็อก** — ต้องมี user gesture ครั้งแรก (ปุ่ม "เปิดเสียง") + เก็บ state ใน localStorage ของจอ
6. **ลูกค้ารับคิวออนไลน์แล้วไม่มา** — คิวถูกเรียก → skip → NO_SHOW ตาม flow ปกติ · อนาคต 🔜 นับสถิติเบอร์ที่ abandon บ่อยเพื่อจำกัด (ไม่ทำ blacklist ใน v1 — โทษของ walk-in ต่ำกว่านัด)
7. **แก้ priority ของประเภทระหว่างวัน** — มีผลเฉพาะบัตรใหม่ (priority snapshot ในบัตร) — ห้าม retroactive
8. **ปิดเคาน์เตอร์ที่มีบัตร CALLED/SERVING ค้าง** — บังคับจัดการก่อน (จบ/โอน/ข้าม) ถึงจะปิดได้ — กันบัตรลอย
9. **Archive QueueType ที่มีบัตร active วันนี้** — block จนกว่าจะหมดวัน/เคลียร์
10. **Transfer วนลูป** — โอนได้สูงสุด 5 ครั้งต่อบัตร (นับจาก events) — เกิน = แจ้งให้ออกบัตรใหม่ (ป้องกัน state งง)
11. **publicToken/displayToken รั่ว** — หน้าบัตรมีเฉพาะข้อมูลใบตัวเอง · display revoke ได้ทันที (จอที่ถือ token เก่า = 401 → ขึ้นจอ "กรุณาติดต่อร้าน") · ห้าม embed ชื่อ/เบอร์ลูกค้าใน payload จอ TV
12. **Unit PAUSED** — ปิดรับคิวออนไลน์+kiosk ทันที, คิวค้างวันนั้น operate ต่อได้จนจบวัน (ตาม BLUEPRINT_BUSINESS_UNITS ข้อ 8.4: honor ของเดิม)
13. **นาฬิกา device เพี้ยน** — ทุก timestamp ใช้เวลา server เท่านั้น (kiosk/มือถือไม่ส่งเวลาเอง)
14. **ไม่มีข้อมูลเงินในโมดูลนี้** — ห้ามเพิ่ม field ราคาลง QueueTicket ในอนาคตโดยไม่ผ่าน review (การเงิน = POS เท่านั้น ตาม contract 2.1)

---

## 12. QC Checklist (เกณฑ์ตรวจรับ)

**Functional**
- [ ] ออกบัตร 3 ช่องทาง (kiosk/QR ออนไลน์/staff) ได้เลขถูก format `A001` และ reset เมื่อขึ้น business date ใหม่ (test ข้ามเที่ยงคืนโซน Asia/Bangkok)
- [ ] ยิงออกบัตร 50 concurrent → เลขต่อเนื่อง ไม่ซ้ำ ไม่ข้าม (load test บังคับ)
- [ ] call-next 2 เคาน์เตอร์พร้อมกัน → ได้คนละใบ (SKIP LOCKED test)
- [ ] ลำดับเรียกถูกต้อง: P (100) > B (50) > A (0), ภายในประเภทเดียวกัน FIFO
- [ ] เรียกซ้ำ/ข้าม/เรียกคืน/โอน ครบวงจร + เลขเดิมคงอยู่ตอนโอน + SKIPPED หมดอายุกลายเป็น NO_SHOW
- [ ] จอ TV: อัปเดต ≤2 วิหลังเรียก, เสียง TTS ไทยอ่านเลขถูก ("เอ สิบสอง"), reconnect แล้ว state ถูกต้อง
- [ ] หน้าบัตรมือถือ: position/estimate ขยับ realtime, ถูกเรียกเด้งเต็มจอ+สั่น, ยกเลิกได้เฉพาะ WAITING
- [ ] แจ้งเตือน "เหลือ 3 คิว" ส่งครั้งเดียวต่อบัตร (รัน engine ซ้ำไม่ส่งซ้ำ)
- [ ] กันรับคิวออนไลน์ซ้ำ: เบอร์เดิมมีบัตร active → 409 + ลิงก์บัตรเดิม
- [ ] Handoff: นัด ARRIVED → เกิด P-ticket priority ถูก, จอเคาน์เตอร์เห็น context นัด, unit ที่ปิด Q ไม่ล้ม flow Booking (integration test ข้ามโมดูลทั้งสองทิศ)
- [ ] Cron สิ้นวันกวาดคิวค้าง → CANCELLED(END_OF_DAY) และวันใหม่เริ่มเลข 001

**Isolation (multi-tenant/unit)**
- [ ] ทุก endpoint dashboard: user ร้าน A เรียก unitId ร้าน B → 403/404
- [ ] displayToken/publicToken ข้าม unit/tenant ใช้ไม่ได้ · จอ TV payload ไม่มีชื่อ-เบอร์ลูกค้า (ตรวจ response จริง)
- [ ] สองสาขา (2 unit) ใน tenant เดียว: เลขคิว/เคาน์เตอร์/สถิติ แยกขาดกันสนิท
- [ ] revoke display token แล้ว stream เดิมตัดภายใน heartbeat ถัดไป

**i18n / UI / มาตรฐานร่วม**
- [ ] ทุกหน้า TH/EN รวมเสียงเรียก 2 ภาษา, จอ TV ตัวอักษรอ่านได้ระยะไกล (ทดสอบจอจริง ≥40")
- [ ] kiosk: wake lock ทำงาน, ออกโหมดต้องใช้ PIN, จอกลับหน้าแรกเองใน 15 วิ
- [ ] empty/loading/error state ครบ (Board ว่าง, ไม่มีเคาน์เตอร์เปิด, จอหลุดเน็ต)
- [ ] มือถือ: Queue Board ใช้เป็นรีโมตเรียกคิวได้จริงบนจอ 375px
- [ ] AuditLog: แก้ config/revoke token/ปิดรับออนไลน์ ครบ · QueueTicketEvent ครบทุก transition
