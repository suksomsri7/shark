# SHARK — พิมพ์เขียวระบบรายงานทั้งแพลตฟอร์ม (REPORTS)

> อ่านคู่กับ: `BLUEPRINT.md` · `BLUEPRINT_BUSINESS_UNITS.md` · `modules/_CONVENTIONS.md` · `WORKPLAN_PARALLEL.md`
> เอกสารนี้ **รวบยอด** หัวข้อ 10 (Reports & Metrics) ของสเปคโมดูล 01–09, 12–14 ให้เป็นระบบเดียว —
> รายงานรายโมดูลเป็นของโมดูลนั้น (ship พร้อมโมดูล) เอกสารนี้กำหนด **ของกลาง** ที่ทุกโมดูลใช้ร่วม:
> DailyStat · `getUnitKpi` · หน้ารวม 3 ระดับ · Daily Digest · Export service · permission matrix
> สถานะ: DESIGN — สอดคล้องกับสเปคโมดูล 01–15 ครบแล้ว (Chat/Meeting มีสเปคแล้ว — ดู §2.13 · `ChatDailyStat` ถูกยุบเข้า DailyStat กลาง ตาม RESOLUTIONS D11)

---

## 1. สถาปัตยกรรมรายงาน (v1)

### 1.1 หลักการใหญ่ 3 ข้อ (ห้ามเถียง)

1. **Source of truth = transactional query เสมอ** — ตัวเลข "ทางการ" มาจากตารางธุรกรรมจริง
   (`PosSale`, `HotelNightAudit`, `PointLedger`, `JournalLine`, …) · **DailyStat เป็น cache** สำหรับ
   กราฟ/หน้ารวม/digest — เลขสองทางไม่ตรงกันเมื่อไร ให้เชื่อ transactional และ recompute DailyStat
2. **การเงิน "ทางการ" = Account (posting)** — รายงานเงินในโมดูลธุรกิจ (Restaurant R7, Ticket sales ฯลฯ)
   เป็น "มุมปฏิบัติการ" ที่ต้อง reconcile ตรงกับ Account ได้ (ตามที่สเปค 02/05 ระบุเอง) ·
   DailyStat **ห้าม**ใช้ทำภาษี/ปิดงวด
3. **รายงาน detail = query ตรงเสมอ** — DailyStat เก็บเฉพาะ metric แบบบวกได้ (sum/count)
   สำหรับเส้นกราฟ/การ์ด/ยอดรวม · drill-down รายแถว (รายบิล รายนัด รายบัตรคิว) อ่านจากตารางจริง

### 1.2 สองเครื่องยนต์

```
┌───────────────────────────────┐   ┌──────────────────────────────────────┐
│ A. Live query (transactional) │   │ B. DailyStat (pre-aggregation)        │
│  - จอปฏิบัติการ realtime (SSE) │   │  key: (tenantId, unitId?, module,     │
│  - การ์ด "วันนี้" (cache 30-60s)│   │        metric, date)                  │
│  - drill-down ทุกรายงาน        │   │  - cron กลางคืน: ปิดเลขของเมื่อวาน      │
│                               │   │  - วันปัจจุบัน: near-realtime refresh   │
│                               │   │  - ป้อน: กราฟย้อนหลัง / sparkline /    │
│                               │   │    Overview / consolidated / digest    │
└───────────────────────────────┘   └──────────────────────────────────────┘
```

### 1.3 ระดับความสด (freshness tier) — ใช้กำกับทุกรายงานใน catalog ข้อ 2

| Tier | ความหมาย | กลไก | ตัวอย่าง |
|---|---|---|---|
| **R** — Realtime | จอปฏิบัติการ อัปเดตเป็นวินาที | SSE + query ตรง | จอคิว, KDS, ยอดขายสดต่อรอบ Ticket, เช็คอินสด |
| **T** — Today live | ตัวเลข "วันนี้" | query ตรง + cache 30–60 วิ | การ์ด KPI ต่อ unit, ยอดขายวันนี้, นัดวันนี้ |
| **D** — Daily | ย้อนหลัง/กราฟ/เทียบช่วง | อ่านจาก DailyStat | กราฟ 12 เดือน, sparkline, consolidated, digest |
| (detail) | ตารางรายแถวใน tier ไหนก็ตาม | query ตรง (บังคับ from/to) | รายการ void, รายชื่อ churn, สมุดรายวัน |

กติกาตัดสิน: **"วันนี้" = live, "เมื่อวานขึ้นไป" = DailyStat, "รายแถว" = query ตรง** —
ยกเว้น Hotel ที่วันปิด audit แล้ว freeze ใน `HotelNightAudit` (สเปค 01 นิยามไว้แล้ว —
DailyStat ของ Hotel อ่านต่อจาก audit ไม่คำนวณเอง)

### 1.4 Timezone + นิยาม "วันธุรกิจ" (business date) — คำตัดสินกลาง

1. **สรุปวันตาม timezone ของ unit** — `unit.settings.timezone` (default `Asia/Bangkok`) ·
   เก็บ DateTime เป็น UTC เสมอ (ตาม _CONVENTIONS ข้อ 3) · ห้าม hardcode +7
2. **ตัดวันที่เที่ยงคืนตามเวลาร้าน** (00:00 local) — เป็นกติกาเดียวกับ POS/Account
   (`periodKey`, ใบเสร็จ, VAT) เพื่อให้เงินตรงกันทุกชั้น
3. **ข้อยกเว้นเดียว: Hotel** — ใช้ **business date ของ night audit** (สเปค 01) —
   DailyStat ของ metric กลุ่ม Hotel ใช้ business date นี้ ไม่ใช่ calendar date
4. **ร้านเปิดข้ามเที่ยงคืน (บาร์/ผับ):** v1 ตัดเที่ยงคืนตรง · `unit.settings.dayCutoffHour` 🔜
   (ตรงกับที่สเปค Queue 04 ระบุ) — เมื่อทำจริงให้มีผลทั้ง DailyStat/รายงาน/digest พร้อมกัน
   > ⚠️ ข้อขัดที่พบ: สเปค Restaurant (02 §11.11) นิยาม `bizDate = วันที่เปิด service`
   > (ออเดอร์ 00:30 นับเป็นวัน service เดิม) ขณะที่ POS/Account ตัดเที่ยงคืน —
   > **คำตัดสิน:** ตัวเลข **เงิน** ทุกที่ (Overview, digest, consolidated, DailyStat)
   > ใช้กติกา POS/Account (เที่ยงคืน) · `bizDate` ของ Restaurant เป็นมุมปฏิบัติการภายใน
   > โมดูล (R1–R7 ในหน้า unit) เท่านั้น และหน้ารายงานต้อง label ให้ชัดว่าใช้ "วัน service"
5. **Metric ระดับ tenant** (Member/Point/Reward/Coupon): ตัดวันตาม **timezone ของ tenant**
   (default Asia/Bangkok — ตรงกับสเปค 06 §11.12, 07 §11.15, 09 §11.8)
6. **"ยอดรวมวันนี้" ระดับ tenant ที่หลาย unit คนละ timezone** = ผลรวมของ business date
   ปัจจุบันของ**แต่ละ unit** (ไม่ใช่ช่วงเวลา instant เดียวกัน) — นิยามนี้ใช้ทั้ง Overview และ digest

### 1.5 วงจรชีวิต DailyStat

```
เหตุการณ์ธุรกรรม (createSale / point.earn / checkin / ...)
   └─► enqueue statRefresh(unitId|tenant, module, bizDate)   ← debounce 60 วิ ต่อ key
cron ทุก 15 นาที      → refresh แถว "วันนี้" ของ unit ที่มีธุรกรรม (ตาข่ายกัน event หลุด)
cron กลางคืน 00:30 เวลา unit → recompute "เมื่อวาน" เต็มรูป (ปิดเลข)
cron 03:00 D+1        → re-verify เมื่อวานอีกรอบ (กัน void/sync ค้างที่เพิ่ง retry สำเร็จ)
```

- **Recompute เสมอ ไม่ delta:** ทุกการเขียน DailyStat = aggregate ใหม่ทั้ง (unit, module, metric, date)
  จากตารางจริง — idempotent, กันเลขเพี้ยนสะสม (ห้าม increment/decrement ทีละรายการ)
- **Void/refund ย้อนวัน:** event ต้องพก business date ของเอกสารเดิม → enqueue recompute วันนั้น
  (ดู edge case ข้อ 10.2)
- เก็บ `computedAt` ทุกแถว — UI แสดง "ข้อมูล ณ HH:mm" ได้เสมอ

---

## 2. Catalog รายงานทั้งแพลตฟอร์ม (รวบจากหัวข้อ 10 ของทุกสเปค)

> คอลัมน์ "Tier" ตาม §1.3 (R/T/D — รายงานเดียวมีได้หลาย tier: ตัวเลขวันนี้ T + กราฟย้อนหลัง D)
> ✅ = v1 (อยู่ในสเปคโมดูลแล้ว) · 🔜 = phase ถัดไปตามสเปคโมดูล
> รวม v1 = **81 รายงาน** + 🔜 9 รายงาน (ไม่รวมหน้ารวม 3 ระดับ + digest ซึ่งเป็นของกลาง)

### 2.1 Hotel (01) — scope unit · 11 รายงาน · แหล่ง: `HotelNightAudit` (วันปิดแล้ว) + สด (วันปัจจุบัน)

| รายงาน | metric หลัก | มิติ | Tier |
|---|---|---|---|
| Occupancy % | roomsOccupied ÷ roomsAvailable (basis points) | วัน/เดือน/ช่วง, เทียบช่วงก่อน | T+D |
| ADR | roomRevenue ÷ roomsOccupied | เส้นเวลา, room type | D |
| RevPAR | roomRevenue ÷ roomsAvailable | เส้นเวลา | D |
| รายได้ห้อง | Σ FolioItem ROOM (net void) ตาม businessDate | ratePlan/roomType/source | D |
| รายได้อื่นใน folio | Σ SERVICE + POS_CHARGE + EXTRA_BED | วัน/booking | D |
| Booking funnel | จอง/ยืนยัน/ยกเลิก/no-show + rate | source (WEB/WALK_IN/PHONE/OTA) | D |
| Lead time | avg(checkInDate − createdAt) | source | D |
| ALOS | Σ nights ÷ bookings | เดือน | D |
| Forecast 30 วัน | on-the-books occupancy รายวันล่วงหน้า | วัน | T |
| Housekeeping | ห้องทำ/วัน, ต่อคน, OOO ค้าง | วัน/พนักงาน | T+D |
| มัดจำค้าง / HOLD หลุด | HOLD active, expired, PENALTY | operational | T |

KPI → Overview: `occupancy วันนี้ · เช็คอินวันนี้ · รายได้ห้องเมื่อวาน (จาก audit)`

### 2.2 Restaurant (02) — scope unit · 7 รายงาน (+🔜 2) · จาก order items ที่ชำระแล้ว (มี saleId)

| รายงาน | metric หลัก | มิติ | Tier |
|---|---|---|---|
| R1 เมนูขายดี/ขายแย่ | qty, ยอดขาย, % ของยอดรวม | หมวด/สถานี/ช่วงวัน | D |
| R2 ยอดต่อโต๊ะ/โซน | sessions, ยอดรวม, เฉลี่ย/บิล, เฉลี่ย/หัว, turnover | โต๊ะ/โซน | D |
| R3 Peak hours | ออเดอร์+ยอดขาย heatmap | ชั่วโมง×วันในสัปดาห์ | D |
| R4 เวลาเตรียม (prep) | avg/median/p90 NEW→READY | สถานี/เมนู top 20 | D |
| R5 ยกเลิก & 86 | จำนวน, มูลค่า, เหตุผล, 86 log | เมนู/ผู้ยกเลิก | D |
| R6 ช่องทางออเดอร์ | สัดส่วน QR/staff/takeaway/pickup + ยอดเฉลี่ย | ช่องทาง | D |
| R7 สรุปวัน (daily digest ของ unit) | ยอดขาย, บิล/ออเดอร์, หัว, เฉลี่ย/บิล, top 5, service charge | วัน | T+D |
| 🔜 R8 attach rate ของ option · 🔜 R9 cohort ลูกค้าสมาชิกกลับมาซ้ำ | | | D |

KPI → Overview: `ยอดขายวันนี้ · ออเดอร์/บิลวันนี้ · ลูกค้า (หัว)` (จาก R7)

### 2.3 Booking (03) — scope unit · 5 รายงาน

| รายงาน | metric หลัก | มิติ | Tier |
|---|---|---|---|
| Staff Utilization | ชม.ถูกจอง ÷ ชม.ทำงาน (%) | ช่าง, วัน/สัปดาห์ | D |
| No-show | NO_SHOW ÷ (DONE+NO_SHOW), top ลูกค้า, block active | สัปดาห์/source | D |
| บริการยอดนิยม | ครั้ง + รายได้ (นัด DONE), ราคาเฉลี่ยจริง | บริการ/หมวด | D |
| ภาพรวมการจอง | นัด/วัน แยกสถานะ, lead time, สัดส่วน source, heatmap พีค | วัน×ชม. | T+D |
| Cancellation | อัตรายกเลิกแยก CUSTOMER/STAFF/SYSTEM, ยกเลิกก่อนนัดกี่ชม. | ช่วงวัน | D |

KPI → Overview: `นัดวันนี้ / เสร็จแล้ว / no-show วันนี้ / คิวถัดไป`

### 2.4 Q — บัตรคิว (04) — scope unit · 7 รายงาน · จาก `QueueTicket` + `QueueTicketEvent`

| รายงาน | metric หลัก | มิติ | Tier |
|---|---|---|---|
| สรุปรายวัน | บัตรออก (แยกประเภท/ช่องทาง), DONE, NO_SHOW, ยกเลิก | วัน | T+D |
| เวลารอ | avg/median/**P90** ของ calledAt−createdAt | ประเภท/วัน | D |
| เวลาให้บริการ | doneAt−servedAt | ประเภท/เคาน์เตอร์/staff | D |
| Abandon rate | (CANCELLED+NO_SHOW) ÷ บัตรออก | ช่องทาง | D |
| Heatmap | บัตรออก/เวลารอ ต่อชั่วโมง | ชม.×วัน | D |
| ประสิทธิภาพเคาน์เตอร์ | บัตรจบ/ชม.เปิด, idle time | เคาน์เตอร์ | D |
| Handoff จาก Booking | บัตร BOOKING channel, เวลารอเทียบ walk-in | ช่วงวัน | D |

KPI → Overview: `รอตอนนี้ / เรียกแล้ว / เสร็จวันนี้ / เวลารอเฉลี่ยวันนี้` (สองตัวแรก = R แท้ๆ)

### 2.5 Ticket (05) — scope unit · 9 รายงาน (3 realtime + 6 ย้อนหลัง)

| รายงาน | metric หลัก | มิติ | Tier |
|---|---|---|---|
| ยอดขายสดต่อรอบ | ใบ + ยอดสุทธิ แยก ONLINE/ONSITE | รอบ | **R** (SSE) |
| ยอดขายต่อประเภทตั๋ว | ขาย/hold/คงเหลือ vs quota | allocation | **R** (SSE) |
| เช็คอินสด | เข้าแล้ว/ทั้งหมด + อัตราไหลเข้า (คน/10 นาที) | รอบ/โซน/ประตู | **R** (SSE) |
| ยอดขาย (ย้อนหลัง) | ใบ, ยอดรวม, ส่วนลด, refund, สุทธิ | event/รอบ/type/วัน/ช่องทาง | D |
| Attendance | ขาย vs เช็คอิน, no-show rate, histogram เวลาเข้า 15 นาที | รอบ/ประตู/โซน | D |
| Conversion | view→order→paid funnel, hold expire rate, sold-out lead time | event | D |
| Refund/Void | จำนวน+มูลค่า, เหตุผล, ค่าธรรมเนียม | event/ช่วง | D |
| ลูกค้า | ผู้ซื้อใหม่ vs member, top spenders, ตั๋วเฉลี่ย/ออเดอร์ | event | D |
| Early bird performance | สัดส่วนขายราคาโปรฯ vs ปกติ | type | D |

KPI → Overview: `ยอดขายตั๋ววันนี้ · รอบถัดไป + % ขายแล้ว · เช็คอินสด (ถ้ามีรอบกำลังดำเนิน)`

### 2.6 Member (06) — scope **tenant** · 8 รายงาน · `/app/members/reports`

| รายงาน | metric หลัก | มิติ | Tier |
|---|---|---|---|
| ภาพรวมฐานสมาชิก | total, ACTIVE, ใหม่เดือนนี้ | กราฟ 12 เดือน, source | T+D |
| Active / Churn | Active 90 วัน / At-risk 91–180 / Churned >180 (config) | แนวโน้ม + drill-down | D |
| Top spenders | Top 50 ตามยอด | 30วัน/12เดือน/ตลอด, หน่วยที่ใช้บ่อย | D |
| Tier distribution | จำนวน+% ต่อ tier, ขึ้น/ลง/ต่ออายุ | เดือน | D |
| New member funnel | สมัครแยก 4 ช่องทาง, claim rate ของ AUTO | ช่องทาง | D |
| Consent coverage | % marketing consent ต่อ type, ถอนเดือนนี้ | type | D |
| DSR SLA | คำขอค้าง, ใกล้ครบ 30 วัน, เวลาเฉลี่ยปิด | — | T |
| วันเกิดเดือนนี้ | รายชื่อ (เฉพาะ consent) | เดือน | T |

KPI → Overview (แถบรวม): `สมาชิกใหม่วันนี้` — ใช้ API report เดียวกัน (สเปค 06 ระบุ)

### 2.7 Reward (07) — scope tenant · 4 รายงาน (+🔜 1)

| รายงาน | metric หลัก | มิติ | Tier |
|---|---|---|---|
| ภาพรวม (summary) | จำนวนแลก, รับจริง, expire/cancel rate, burn รวม, ต้นทุนรวม | ช่วงวัน, กราฟวัน/เดือน | D |
| รางวัลยอดนิยม (by-reward) | ครั้งแลก, burn, fulfill rate, สต็อก, ต้นทุนสะสม | รางวัล | D |
| ต้นทุนต่อหน่วย (by-unit) | fulfill, Σ costSatang ตาม `fulfilledUnitId` | BusinessUnit, เดือน | D |
| Funnel | PENDING→FULFILLED %, เวลาเฉลี่ยแลกถึงรับ, expire ทิ้ง % | รางวัล | D |
| 🔜 burn/earn ratio (ร่วมกับ Point) | health ของ loyalty | — | D |

KPI → Overview (แถบรวม): `แต้ม burn วันนี้ · รายการรอรับของ`

### 2.8 Coupon (08) — scope tenant · 4 รายงาน (+🔜 1)

| รายงาน | metric หลัก | มิติ | Tier |
|---|---|---|---|
| Attribution ต่อแคมเปญ | redemptions, Σ ส่วนลด, ยอดขาย attributed, AOV เทียบ, **ROI**, forfeit | แคมเปญ | D |
| รายหน่วย / รายโมดูล | breakdown จาก unitId/module บน redemption | unit, module | D |
| การแจก (PERSONAL) | แจก n, ใช้ m, conversion m/n, เวลาเฉลี่ย, หมดอายุทิ้ง | แคมเปญ | D |
| กราฟรายวัน | redemptions + ส่วนลด + ยอด attributed | วัน (ช่วงแคมเปญ) | D |
| 🔜 Fraud snapshot | lockout บ่อย, โค้ดถูกลองผิดปกติ | actor | D |

KPI → Overview (แถบรวม): `ส่วนลดที่ให้วันนี้ · คูปองถูกใช้วันนี้`

### 2.9 Point (09) — scope tenant · 7 รายงาน

| รายงาน | metric หลัก | มิติ | Tier |
|---|---|---|---|
| **Liability** ⭐ | แต้มคงเหลือ × pointValueSatang, aging bucket, top 50 ผู้ถือ | เดือนหมดอายุ/tier, 12 เดือน | T+D |
| Earn/Burn/Expire summary | earn, burn, expire, net, burn rate % | วัน/เดือน | T+D |
| Earn ต่อหน่วย/โมดูล | แต้มเกิดจากกิจการ/โมดูลไหน (unitId tag) | unit/module | D |
| Rule performance | บิล, แต้มแจก, ยอดขายเกี่ยว ต่อ rule | rule, ช่วงแคมเปญ | D |
| Expiring soon | แต้มหมดใน 30/60/90 วัน + สมาชิกที่โดน | bucket → segment | T |
| Adjust audit | รายการ ADJUST: ใคร เท่าไร เหตุผล | เรียงยอด | detail |
| Reconcile health | mismatch ล่าสุด, ประวัติ run | PointReconcileRun | T |

KPI → Overview (แถบรวม): `แต้ม earn/burn วันนี้`

### 2.10 Account (12) — scope unit ledger + tenant consolidated · 6 รายงาน

| รายงาน | metric หลัก | มิติ | Tier |
|---|---|---|---|
| P&L รายเดือน | รายได้สุทธิ − COGS − ค่าใช้จ่าย = กำไร | ต่อ unit + **consolidated** (คอลัมน์ต่อ unit), Δ% เดือนก่อน, กราฟ 12 เดือน | D |
| Cash flow summary | เงินเข้า−ออกจริง (บัญชีกลุ่มเงิน) | วิธีชำระ/หมวดจ่าย, วัน/เดือน | D |
| ยอดขายตามช่องทางชำระ | ยอด+บิล+% ต่อ CASH/โอน/PromptPay/บัตร/voucher | วัน (คู่หน้า reconcile) | T+D |
| ภาษีรายเดือน (ภ.พ.30) | ฐานภาษี, ภาษีขาย/ซื้อ, สุทธิชำระ/ขอคืน | เดือน | D |
| ค่าใช้จ่ายตามหมวด | top หมวด + เทียบเดือนก่อน | หมวด/เดือน | D |
| หนี้แต้มคงค้าง (2300 vs Point) | ยอดบัญชี 2300 เทียบ Point ledger, เตือนเมื่อต่างเกิน threshold | — | T |

KPI → Overview: `รายได้วันนี้ · กำไรเดือนนี้ (สะสม) · รายการรอตรวจ`

### 2.11 Kanban (13) — scope tenant · 5 รายงาน (+🔜 2) · query สด (สเปคตัดสินแล้ว: ไม่ทำ snapshot ใน MVP)

| รายงาน | metric หลัก | มิติ | Tier |
|---|---|---|---|
| งานค้าง (Open cards) | ACTIVE ไม่อยู่ done column | บอร์ด/column | T |
| เลยกำหนด (Overdue) | dueAt < now, ยังไม่ done | บอร์ด/ผู้รับผิดชอบ | T |
| ภาระงานต่อคน (Workload) | ค้าง/เลยกำหนด/ครบสัปดาห์นี้ ต่อ assignee | คน | T |
| Throughput | เสร็จ vs สร้างใหม่ ในช่วง | รายสัปดาห์ | D* |
| อายุงานค้าง (Aging) | ค้าง >14 วันไม่ขยับ | การ์ด | T |
| 🔜 Cycle time · 🔜 Checklist completion | | | D |

\* Throughput ใน v1 query สดตามสเปค 13 — ถ้าโตค่อยย้ายเข้า DailyStat (metric รองรับไว้แล้ว)

### 2.12 POS (14) — scope unit · 8 รายงาน (+🔜 3)

| รายงาน | metric หลัก | มิติ | Tier |
|---|---|---|---|
| ยอดขายรายวัน | สุทธิ, บิล, เฉลี่ย/บิล, void/refund, กราฟรายชั่วโมง | วัน/ชั่วโมง | T+D |
| สินค้าขายดี | Top N ตาม qty/ยอด + margin | หมวด/ช่วง | D |
| ต่อพนักงาน | ยอด/บิล/ส่วนลด/void ต่อ staffUserId (จับ pattern ผิดปกติ) | พนักงาน | D |
| ต่อวิธีชำระ | ยอด+จำนวน ต่อ CASH/TRANSFER/PROMPTPAY/VOUCHER | วิธีชำระ | T+D |
| กำไรขั้นต้น | Σ lineTotal − Σ cost + % coverage ของ cost | ช่วง | D |
| สรุปกะ | over/short รายกะ/เดือน ต่อคนปิดกะ | กะ/พนักงาน | T+D |
| มูลค่าสต็อก + low stock | Σ(stockQty×cost), รายการใกล้หมด | สินค้า | T |
| ยอดต่อ sourceModule | POS หน้าร้าน vs HOTEL vs RESTAURANT vs TICKET vs BOOKING | sourceModule | D |
| 🔜 Heatmap วัน×ชม. · 🔜 เปรียบเทียบสาขา (cross-unit) · 🔜 forecast | | | D |

KPI → Overview: `ยอดขายวันนี้ · จำนวนบิล · กะเปิดอยู่`

### 2.13 Chat (10) / Meeting (11)

> อัปเดตหลัง QC (D11): สเปคมีแล้ว — Chat ดู 10-chat.md §10, Meeting ดู 11-meeting.md §10
> **`ChatDailyStat` ถูกยุบเข้า DailyStat กลางแล้ว** (module=CHAT — §7.1/7.2) · Chat implement `StatProvider` ป้อน metric กลาง, median/P90 คำนวณจาก raw ตอนอ่าน

| รายงาน | metric หลัก | มิติ | Tier |
|---|---|---|---|
| Volume ต่อวัน | conversations ใหม่/วัน + ข้อความเข้า-ออก/วัน (`conversations_new`, `messages_in/out`) | unit/channel/วัน | D |
| First Response Time | avg = `frt_sum_sec/frt_count` · median+P90 จาก raw · % ภายใน SLA (`frt_within_sla_count/frt_count`) | unit/channel | D |
| Resolved rate | `conversations_resolved` ÷ ใหม่ในช่วง + avg resolution time + reopen rate (จาก raw) | unit/channel | D |
| Per-agent | เธรดที่รับ, ข้อความที่ส่ง, FRT เฉลี่ย, resolved count (query raw) | agent | D |
| แชทค้างตอบ (สด) | เธรด OPEN ไร้ assignee + เกิน SLA — contract อ่านสด `chat.getUnansweredCount(tenantId, unitAccess)` ป้อนแถบรวม Overview (BLUEPRINT_BUSINESS_UNITS §4) | tenant | T |

- Meeting (11 §10) = insights ภายในโมดูล (adoption รายสัปดาห์, % อ่านประกาศ, ห้อง active, storage) — อ่านสด/เบา **ไม่เข้า DailyStat กลางใน v1** (ไม่มี metric ธุรกิจ)

KPI → Overview: `แชทค้างตอบ` (แถบรวม tenant strip)

---

## 3. หน้ารวม 3 ระดับ

### 3.1 Overview "ทุกกิจการ" — `/app` (tenant, default ของ OWNER)

โครง (ตาม BLUEPRINT_BUSINESS_UNITS §4):

```
┌─ แถบรวมบน (tenant strip) ─────────────────────────────────────────┐
│ ยอดขายรวมวันนี้ · สมาชิกใหม่ · แต้ม earn/burn · แชทค้างตอบ           │
│ (แถวสอง ถ้าเปิดโมดูล): คูปองใช้วันนี้+ส่วนลด · รางวัลรอรับของ          │
├─ การ์ด KPI ต่อ unit (จาก getUnitKpi) ──────────────────────────────┤
│ [🏨 โรงแรม A]  occupancy 82% · เช็คอิน 5 · รายได้ห้องเมื่อวาน ฿12,400 │
│ [🍜 ร้าน 1]    ยอดขาย ฿8,150 · 42 บิล · 96 หัว                      │
│ [💈 ร้านนวด]   นัดวันนี้ 18 · เสร็จ 11 · no-show 1 · คิวถัดไป 14:30   │
│ + sparkline 7 วันมุมการ์ด (จาก DailyStat) + badge แจ้งเตือน          │
└──────────────────────────────────────────────────────────────────┘
```

**Interface กลาง `getUnitKpi` (contract — CORE เป็นเจ้าของ, ทุกโมดูลธุรกิจ implement):**

> สเปค Hotel อ้าง `getUnitKpi(unitId)` — เอกสารนี้ finalize เป็น `(unitId, date)` โดย
> `date` default = business date ปัจจุบันของ unit (backward compatible)

```ts
// lib/contracts/reports.ts  (CORE เท่านั้นแก้ได้ — ตามกติกา WORKPLAN_PARALLEL ข้อ 3)

export interface UnitKpiField {
  key: string                     // 'sales_today', 'occupancy', ...
  labelTh: string
  labelEn: string
  value: number | string          // เงิน = Int สตางค์, % = basis points
  format: 'money' | 'count' | 'percent' | 'time' | 'text'
  deltaBp?: number                // เทียบช่วงก่อนหน้า (basis points, มี = โชว์ %Δ)
  href?: string                   // ลิงก์เจาะเข้ารายงานต้นทาง
}

export interface UnitKpi {
  unitId: string
  date: string                    // 'YYYY-MM-DD' business date (timezone ของ unit)
  fields: UnitKpiField[]          // สูงสุด 4 ตัว ต่อการ์ด
  alerts?: { severity: 'WARN' | 'ALERT'; messageTh: string; messageEn: string; href?: string }[]
  freshness: 'REALTIME' | 'DAILY' // Hotel รายได้เมื่อวาน = DAILY, ที่เหลือ = REALTIME
  asOf: Date
}

export type GetUnitKpi = (unitId: string, date: string) => Promise<UnitKpi>

// registry: โมดูลลงทะเบียน provider ต่อ UnitType ตอน boot
registerUnitKpiProvider(unitType: UnitType, provider: GetUnitKpi): void
```

กติกา:
- CORE เรียก provider ตาม `BusinessUnit.type` · cache 30–60 วิ ต่อ (unitId, date) · เรียกขนานทุก unit
- provider พัง/timeout (budget 2 วิ) → การ์ดแสดง "—" + badge เทา **ห้ามล้มทั้งหน้า Overview**
- ก่อนโมดูลจริงมา (Stage A) ใช้ stub คืน mock — ตรง Phase 0 checklist ของ BLUEPRINT_BUSINESS_UNITS §7
- field ต่อ UnitType ตามที่สเปคโมดูลประกาศ (สรุปไว้ท้ายตาราง catalog §2 ของแต่ละโมดูล)

### 3.2 หน้า Reports ต่อ unit — `/app/u/[unitSlug]/reports`

- **Tab ตามโมดูลที่เปิดใน unit นั้น** เช่น unit RESTAURANT → tab `ร้านอาหาร | POS | บัญชี`
  (Account tab = ledger รายหน่วย `/app/account/u/[unitSlug]` ลิงก์เข้าเดียวกัน)
- ทุก tab ใช้ `<ReportShell>` กลาง: date range picker มาตรฐาน (§8) + เทียบช่วงก่อน + ปุ่ม export
- แถวบนเป็นการ์ดตัวเลขใหญ่ (Tier T) → ใต้ลงมาเป็นกราฟ/ตาราง (Tier D + detail)
- unit PAUSED/ARCHIVED: หน้า reports เข้าได้ อ่านย้อนหลังได้เต็ม (read-only) — ตาม edge case กลาง

### 3.3 หน้า Reports ระดับ tenant — `/app/reports` (consolidated)

| ส่วน | เนื้อหา | แหล่ง |
|---|---|---|
| ยอดขายรวมทุกหน่วย | ตาราง unit × วัน/เดือน + กราฟซ้อน + Δ% | DailyStat (`pos.sales_net` ทุก unit) |
| P&L consolidated | ลิงก์เข้า Account 10.1 (คอลัมน์ต่อ unit) | JournalLine (Account เป็นเจ้าของ) |
| สมาชิก | ฐานสมาชิก/ใหม่/churn (ย่อจาก 06) + ลิงก์เข้า `/app/members/reports` | Member API |
| แต้ม | liability + earn/burn + earn ต่อหน่วย (ย่อจาก 09) | Point API |
| คูปอง ROI | attribution ต่อแคมเปญ (ย่อจาก 08) | Coupon API |
| รางวัล | ต้นทุนต่อหน่วย (ย่อจาก 07) | Reward API |

หลักการ: หน้า tenant **ไม่คำนวณเอง** — เป็น composition ของ API รายงานที่โมดูลเจ้าของ expose แล้ว
(กันนิยามแตกเป็นสองที่) + DailyStat สำหรับกราฟรวมข้ามหน่วย

---

## 4. Daily Digest — สรุปประจำวันส่งเจ้าของร้าน

### 4.1 กติกา

- ช่องทาง: **EMAIL** ผ่าน `notify()` (contract 2.5) · 🔜 LINE (เมื่อ channel LINE พร้อม)
- เวลา **ตั้งได้ต่อผู้รับ** — default **08:00 เวลา tenant** สรุป **ของเมื่อวาน**
  (หลัง cron กลางคืน + hotel audit ปิดเลขแล้ว → ตัวเลขนิ่ง ตรงกับที่จะเห็นในรายงานตลอดไป)
- ผู้รับ: OWNER (default on) · MANAGER สมัครรับได้เฉพาะ scope unit ตัวเอง · STAFF ไม่มี
- แหล่งเลข: **DailyStat + KPI API เดียวกับ Overview** — digest ต้องเลขตรงกับ dashboard เป๊ะ

### 4.2 เนื้อหา (เรียงตามลำดับนี้)

1. **ยอดขายต่อหน่วย** — ตาราง unit: ยอดสุทธิ, จำนวนบิล/ธุรกรรม, Δ% เทียบค่าเฉลี่ย 7 วัน
   (+ แถวรวม tenant) · Hotel แสดง occupancy + รายได้ห้อง (จาก audit)
2. **สมาชิก** — สมาชิกใหม่เมื่อวาน, แต้ม earn/burn, คูปองถูกใช้ (ถ้าเปิดโมดูล)
3. **พรุ่งนี้** — นัด Booking พรุ่งนี้ต่อ unit, เช็คอิน/เช็คเอาต์ Hotel พรุ่งนี้, รอบ Ticket ที่จะเปิด
4. **แจ้งเตือนผิดปกติ (anomaly)** — แสดงเฉพาะที่เข้าเงื่อนไข:

| เงื่อนไข | ที่มา | default threshold (config ที่ tenant settings) |
|---|---|---|
| ยอดขายตก | sales_net เทียบ median วันเดียวกันของ 4 สัปดาห์ก่อน | ตก >30% |
| สต็อกต่ำ | POS low stock (สเปค 14 มี low stock digest อยู่แล้ว — ใช้ช่องทางนี้ช่องทางเดียว กันเมลซ้ำ) | ตาม reorder point |
| เคสค้างซิงก์ | POS "รายการค้างซิงก์" (retry 5 ครั้งแล้ว fail) | ≥1 รายการ |
| over/short เกิน | PosShift (สเปค 14 §2.5) | ตาม threshold ร้าน |
| DSR ใกล้ครบกำหนด | Member DSR SLA | เหลือ ≤7 วัน |
| แต้มจ่อหมดอายุก้อนใหญ่ | Point expiring 30 วัน | > x% ของ liability |
| ของรางวัลค้างรับใกล้หมดอายุ | Reward PENDING ใกล้ expiresAt | ≤3 วัน |
| HOLD/มัดจำค้างผิดปกติ | Hotel | เกิน n รายการ |
| no-show พุ่ง | Booking/Queue rate เทียบ 7 วัน | ×2 ของค่าเฉลี่ย |

5. ท้ายเมล: ลิงก์เข้า `/app` + ลิงก์ยกเลิก/ตั้งเวลา (จัดการที่ `/app/settings/digest`)

### 4.3 Data model

```prisma
model DigestSubscription {
  id         String   @id @default(cuid())
  tenantId   String
  userId     String                    // ผู้รับ (Membership ต้องยัง active ตอนส่ง)
  channel    DigestChannel @default(EMAIL)  // EMAIL | LINE(🔜)
  sendAtLocal String  @default("08:00")     // HH:mm ตาม timezone
  timezone   String   @default("Asia/Bangkok")
  unitScope  Json     @default("[\"*\"]")   // ["*"] หรือ [unitId,...] — ตัดตาม unitAccess เสมอ
  enabled    Boolean  @default(true)
  lastSentAt DateTime?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([tenantId, userId, channel])
}
```

- cron รายชั่วโมง+15 นาที กวาด subscription ที่ถึงเวลา → ประกอบ digest → `notify()`
- ส่งซ้ำกันด้วย `lastSentAt` (idempotent ต่อวัน) · ผู้รับที่ Membership ถูกถอน → ข้าม + disable

---

## 5. Export

### 5.1 กติกา

- **CSV ทุกรายงาน** (v1) — UTF-8 **BOM** (เปิด Excel ไทยไม่เพี้ยน — ตาม Account 10.6),
  เงินแปลงสตางค์→บาททศนิยม 2 ตำแหน่ง **เฉพาะตอน export**, header สองภาษาตาม locale ผู้ใช้
- **PDF รายงานหลัก**: ใบกำกับภาษี ✅ (ของ Account) · รายงาน PDF อื่น = **print stylesheet** ใน v1
  (ตาม Account 10.6) · PDF engine จริง + Hotel audit pack = 🔜
- Export ใช้ **filter เดียวกับที่เห็นบนจอ** (ช่วงวัน/มิติ) — ห้ามมีปุ่ม "export ทั้งหมด" ที่ไม่จำกัดช่วง
- ทุก export ผ่าน **ExportService กลาง**: ตรวจ permission → เขียน `ReportExportLog` → stream ไฟล์
- **Bulk export = security event**: เกิน 5,000 แถว หรือรายงานที่มี PII (Member/วันเกิด/DSR)
  → `AuditLog` ระดับ security + แจ้ง OWNER ผ่าน `notify()` (สอดคล้อง PDPA posture ของสเปค 06)
- รายงาน Member ที่ purpose=marketing: ExportService บังคับ AND consent ที่ service layer
  (กติกาสเปค 06 §11.11 — ทำที่ชั้นกลาง กันโมดูลลืม)
- 🔜 **Scheduled export**: ตั้งเวลาส่งรายงานเป็นไฟล์แนบเข้าเมล (ต่อยอดจาก DigestSubscription)

### 5.2 Data model

```prisma
model ReportExportLog {
  id        String   @id @default(cuid())
  tenantId  String
  unitId    String?                    // null = รายงาน tenant-level
  module    String                     // 'POS' | 'HOTEL' | 'MEMBER' | ...
  report    String                     // key ของรายงาน เช่น 'sales_daily'
  format    ExportFormat               // CSV | PDF
  params    Json                       // filter ที่ใช้ (from/to/มิติ)
  rowCount  Int
  isBulk    Boolean  @default(false)   // เกิน threshold หรือมี PII
  byUserId  String
  ip        String?
  createdAt DateTime @default(now())

  @@index([tenantId, createdAt])
  @@index([tenantId, byUserId])
}
```

---

## 6. Permissions — ใครเห็นรายงานไหน

ตรวจผ่าน `can(user, { tenantId, unitId?, module, action })` เดิม (RBAC 4 มิติ) —
action มาตรฐานของรายงาน: `<module>.report.view` · `<module>.report.export`

| พื้นที่รายงาน | OWNER | MANAGER (unit ที่ได้รับ) | STAFF |
|---|---|---|---|
| Overview "ทุกกิจการ" + แถบรวม tenant | ✅ ทั้งหมด | ✅ แต่เห็นเฉพาะการ์ด unit ใน unitAccess · แถบรวม = รวมเฉพาะ unit ตัวเอง | ❌ (เข้า `/app` เด้งไปหน้า unit ตัวเอง) |
| รายงาน unit — **การเงิน** (ยอดขาย, กำไร, ต่อพนักงาน, สรุปกะ, รายได้ห้อง, ยอดตั๋ว) | ✅ | ✅ เฉพาะ unit ตน | ❌ (default — STAFF ไม่เห็นรายงานเงินทุกกรณี) |
| รายงาน unit — **ปฏิบัติการ ไม่มีเงิน** (เวลารอคิว, prep time, housekeeping, utilization, attendance) | ✅ | ✅ เฉพาะ unit ตน | ⚙️ เฉพาะที่ได้ `<module>.report.view` custom (default ❌ — จอ realtime หน้างาน เช่น KDS/จอคิว ไม่นับเป็นรายงาน ใช้ได้ตามสิทธิ์โมดูล) |
| Reports ระดับ tenant (consolidated, ยอดรวมทุกหน่วย) | ✅ | ❌ | ❌ |
| Account (P&L, cash flow, ภาษี) | ✅ | ✅ ledger unit ตน (ตามสเปค 12 §9) — consolidated ❌ | ❌ (แม้มี expense.create — สเปค 12 §11.16) |
| Member reports + วันเกิด + DSR | ✅ | ⚙️ ต้องได้ `member.report` (tenant-scope — ไม่ auto มากับ unit) | ❌ |
| Point liability + Adjust audit | ✅ | ❌ (การเงินระดับ tenant) | ❌ |
| Coupon/Reward reports | ✅ | ⚙️ `coupon.report` / `reward.report` | ❌ |
| Kanban reports | ✅ | ✅ (เครื่องมือองค์กร — เห็นบอร์ดที่ตนเข้าถึง) | ✅ เฉพาะบอร์ดที่เป็นสมาชิก |
| Export (ทุกรายงาน) | ✅ | ⚙️ ต้องได้ `<module>.report.export` แยกจาก view | ❌ |
| Daily Digest | ✅ ตั้งค่า+รับ | ✅ สมัครรับ scope unit ตน | ❌ |

- **หลักจำง่าย: STAFF ไม่เห็นรายงานเงินเด็ดขาด** — เห็นได้แค่จอปฏิบัติการที่เป็นส่วนหนึ่งของงาน
- UI ซ่อนเมนู/tab/ปุ่ม export ตาม `can()` เดียวกับ API (จุดตรวจเดียว)
- รายงาน "ต่อพนักงาน" (POS): MANAGER เห็นทุกคนใน unit — 🔜 ให้ STAFF เห็นเฉพาะแถวตัวเอง

---

## 7. Data Model + API Convention

### 7.1 DailyStat (CORE — `core.prisma`)

```prisma
model DailyStat {
  id         String   @id @default(cuid())
  tenantId   String
  unitId     String?             // null = metric ระดับ tenant (member/point/coupon/reward)
  module     String              // 'POS' | 'HOTEL' | 'RESTAURANT' | 'BOOKING' | 'QUEUE'
                                 // | 'TICKET' | 'MEMBER' | 'POINT' | 'COUPON' | 'REWARD' | 'ACCOUNT'
                                 // | 'CHAT' (D11 — แทน ChatDailyStat เดิม)
  metric     String              // snake_case — ดู registry 7.2
  date       String              // 'YYYY-MM-DD' business date (§1.4)
  value      BigInt              // Int สตางค์ / count / basis points — ตาม format ของ metric
  meta       Json?               // breakdown เสริม (เช่น top5 เมนู) — อ่านเพื่อแสดงผลเท่านั้น
  computedAt DateTime

  // Postgres NULL ≠ NULL: @@unique ไม่กันแถว unitId=null ซ้ำ (ปัญหาเดียวกับ AccountMapping
  // — สเปค 12 §11.9) → ใช้ raw partial unique index 2 ตัวใน migration:
  //   UNIQUE (tenantId, unitId, module, metric, date) WHERE unitId IS NOT NULL
  //   UNIQUE (tenantId, module, metric, date)         WHERE unitId IS NULL
  // + service upsert ผ่าน statUpsert() กลางเท่านั้น (ห้ามโมดูลเขียนตรง)

  @@index([tenantId, date])
  @@index([unitId, module, date])
  @@index([tenantId, module, metric, date])
}
```

กติกา:
- เก็บเฉพาะ **metric บวกได้** (sum/count/snapshot) — อัตราส่วน (ADR, %Δ, burn rate) คำนวณตอนอ่าน
  จากตัวตั้ง/ตัวหาร ที่เก็บแยก (เช่น `occupancy_rooms` + `rooms_available`)
- เขียนโดย **recompute ทั้ง (scope, module, date)** เท่านั้น (§1.5) — ห้าม increment
- retention: เก็บถาวร (ขนาดเล็ก — วันละไม่กี่สิบแถวต่อ unit)

### 7.2 Metric registry (ชุดตั้งต้น v1 — พอสำหรับ Overview/consolidated/digest/sparkline)

| module | metrics (scope) |
|---|---|
| POS | `sales_net` `bills` `refund_amount` `void_count` (unit) |
| HOTEL | `room_revenue` `occupancy_rooms` `rooms_available` `checkins` `checkouts` (unit — business date ของ audit) |
| RESTAURANT | `sales` `orders` `guests` (unit) |
| BOOKING | `appts_total` `appts_done` `appts_noshow` (unit) |
| QUEUE | `tickets_issued` `tickets_done` `wait_sum_sec` `wait_count` (unit — avg = sum÷count) |
| TICKET | `tickets_sold` `sales_net` `checkins` (unit) |
| MEMBER | `new_members` `active_members` (tenant — active = snapshot ณ สิ้นวัน) |
| POINT | `earn` `burn` `expire` `liability_snapshot` (tenant) |
| COUPON | `redemptions` `discount_amount` `attributed_sales` (tenant) |
| REWARD | `redemptions` `points_burned` `fulfilled` `cost` (tenant) |
| ACCOUNT | `income` `expense` (unit — ป้อนกราฟ consolidated) |
| CHAT | `conversations_new` `conversations_resolved` `messages_in` `messages_out` `frt_sum_sec` `frt_count` `frt_within_sla_count` (tenant + tag unitId? — ยุบมาจาก ChatDailyStat ตาม D11; breakdown ต่อ channel ใน meta; avg FRT = sum÷count) |

- โมดูล implement `StatProvider` (contract):
  `collectDailyStats(unitId | null, date) → { metric, value, meta? }[]` — CORE runner เรียก
- เพิ่ม metric ใหม่ = additive (แค่ลงทะเบียน + backfill ตามต้องการ) ไม่ต้อง migrate

### 7.3 API convention

```
# unit-scoped (middleware ตรวจ unitId ∈ tenant + can() ก่อนเข้า handler — ตามกติกาเดิม)
GET  /api/u/[unitId]/reports/[module]/[report]?from=&to=&granularity=day|week|month&compare=prev&...มิติ
POST /api/u/[unitId]/reports/[module]/[report]/export   body: { format: 'CSV'|'PDF', params }
GET  /api/u/[unitId]/kpi?date=                          → getUnitKpi ผ่าน registry (Overview เรียก)

# tenant-scoped
GET  /api/reports/overview?date=                        → tenant strip + การ์ดทุก unit (ตาม unitAccess)
GET  /api/reports/consolidated/sales?from=&to=&groupBy=unit|day
GET  /api/reports/consolidated/[section]                → members | points | coupons | rewards
GET  /api/reports/digest/preview?date=                  → ดู digest ก่อนตั้งเวลา
PUT  /api/reports/digest/subscription
GET  /api/reports/export-log?from=&to=                  → OWNER ตรวจประวัติ export
```

Response envelope มาตรฐาน (ทุก endpoint รายงาน):

```ts
interface ReportResponse<Row> {
  range: { from: string; to: string }
  compareRange?: { from: string; to: string }     // เมื่อ compare=prev
  rows: Row[]
  totals?: Record<string, number>
  deltas?: Record<string, number>                  // basis points เทียบ compareRange
  source: 'LIVE' | 'DAILY_STAT' | 'MIXED'          // โปร่งใสว่าเลขมาจากไหน
  computedAt: string                               // ISO — UI แสดง "ข้อมูล ณ ..."
}
```

- ทุก endpoint **บังคับ from/to** (cap 366 วัน — ตามกติกาสเปค 02 §11.18) — ไม่มี query ไร้ขอบเขต
- เงิน = Int สตางค์ · % = basis points — แปลงที่ UI เท่านั้น (ตาม _CONVENTIONS ข้อ 3)

---

## 8. UI/UX — B&W Minimal

### 8.1 องค์ประกอบมาตรฐาน (CORE design system — ทุกโมดูลใช้ตัวเดียวกัน)

- **`<StatCard>`** — ตัวเลขใหญ่ (tabular-nums) + label เล็ก + %Δ (▲▼ ดำ/เทา — ไม่ใช้เขียวแดง
  ตาม B&W; ▼ ใช้ตัวหนา+ไอคอนกำกับ ไม่พึ่งสีอย่างเดียว) + sparkline 7/30 จุด (เส้นดำ hairline,
  ไม่มีแกน — ข้อมูลจาก DailyStat)
- **`<ReportTable>`** — ตารางเรียบเส้น hairline, ไม่ใช้แถวสลับพื้น (ใช้ระยะห่างแทน), sort ได้,
  เซลล์ตัวเลขชิดขวา, แถวรวมล่างตัวหนา
- **`<DateRangePicker>` มาตรฐานเดียวทั้งแอป** — preset: `วันนี้ · เมื่อวาน · 7 วัน · 30 วัน ·
  เดือนนี้ · เดือนก่อน · กำหนดเอง` + toggle **"เทียบช่วงก่อนหน้า"** (ช่วงก่อนหน้าความยาวเท่ากัน
  ชิดกัน; เดือนนี้ → เดือนก่อน) — state อยู่ใน URL query (`?from=&to=&compare=prev`)
  แชร์ลิงก์แล้วเห็นเหมือนกัน
- **`<ReportShell>`** — layout กลางของทุกหน้ารายงาน: หัวเรื่อง + DateRangePicker + ปุ่ม Export
  + แถว StatCard + เนื้อหา — โมดูลเสียบเฉพาะเนื้อ
- กราฟ: แท่ง/เส้น โทนดำ-เทาเดียว, heatmap ใช้ระดับความเข้มเทา, ไม่มี legend เกินจำเป็น

### 8.2 Mobile (mobile-first ตาม design system เดิม)

- Overview: การ์ด unit **เลื่อนแนวตั้ง** (ไม่ carousel แนวนอน), แถบรวม tenant sticky บน
- ตารางกว้าง → พับเป็น card list (คอลัมน์หลัก 2–3 ตัว) หรือ scroll แนวนอนพร้อมเงาขอบ
- DateRangePicker เป็น bottom-sheet (แบบเดียวกับ Unit Switcher)
- ตัวเลขใหญ่ต้องอ่านได้ในจอ 360px — การ์ดละ 1 metric หลัก + 2 รอง

### 8.3 สถานะครบตามกติการ่วม

- empty state ("ยังไม่มีข้อมูลช่วงนี้" + ลิงก์ไปเริ่มใช้งานโมดูล), loading skeleton, error + retry
- ทุกหน้าแสดง `computedAt` + badge `LIVE`/`สรุปรายวัน` เล็กๆ — จัดการความคาดหวังเรื่องความสด

---

## 9. Phase mapping — อะไรมากับโมดูล vs ของกลางที่ CORE ทำ

### 9.1 ของกลาง (CORE เป็นเจ้าของ) — ผูกกับ Stage ของ WORKPLAN_PARALLEL

| ของกลาง | เนื้องาน | Stage |
|---|---|---|
| **bizDate helper** | `bizDate(unit, ts)` + tenant timezone helper (§1.4) — ทุกโมดูลใช้ตัวเดียว | **A1** (อยู่ใน lib/core ตั้งแต่ foundation — POS/Account ต้องใช้ทันที) |
| **DailyStat** | ตาราง (core.prisma) + partial unique migration + `statUpsert()` + StatRunner (cron กลางคืน/15 นาที/debounce queue §1.5) | **A2** (platform services — อยู่กลุ่มเดียวกับ cron runner) |
| **Report API kit** | envelope (§7.3), date-range/compare util, cap 366 วัน | **A2** |
| **ExportService + ReportExportLog** | CSV UTF-8 BOM, permission gate, bulk security event | **A2** (ใช้ AuditLog+notify ของ A2) |
| **Contracts รายงาน** | `getUnitKpi` interface + registry + stub mock (§3.1) · `StatProvider` interface (§7.2) | **A3** (contract stubs — โมดูลธุรกิจ dev ขนานได้เลย) |
| **หน้า Overview "ทุกกิจการ"** | shell + การ์ด mock จาก stub | **A1/A3** (อยู่ใน Phase 0 checklist ของ BLUEPRINT_BUSINESS_UNITS §7 อยู่แล้ว) |
| **`<ReportShell>` `<StatCard>` `<DateRangePicker>` `<ReportTable>`** | design system components | **A1** (design system B&W) |
| **Daily Digest** | DigestSubscription + assembler + cron + settings UI | **ปลาย Stage B** — ต้องมีเลขจริงจาก POS/Member/Point ก่อน (B1–B3) · anomaly rules เพิ่มทีละข้อเมื่อโมดูล Stage C ลง |
| **หน้า Reports ระดับ tenant (consolidated)** | composition ของ API โมดูล (§3.3) | **ปลาย Stage B** (ยอดขาย+สมาชิก+แต้ม) → ครบเมื่อ B4 Account + C Coupon/Reward |
| 🔜 PDF engine · scheduled export · LINE digest · dayCutoffHour | | หลัง Stage C |

### 9.2 ของโมดูล (ship พร้อม session โมดูลตัวเอง — อยู่ในสเปคหัวข้อ 10 แล้ว)

- **Stage B:** POS (8 รายงาน) · Member (8) · Point (7) · Account (6) — พร้อม implement
  `StatProvider` + `getUnitKpi` (POS) ของจริงแทน stub
- **Stage C:** Hotel (11) · Restaurant (7) · Booking (5) · Queue (7) · Ticket (9) · Reward (4)
  · Coupon (4 — ต่อท้าย B1 ได้ตาม workplan) · Kanban (5) — แต่ละตัว implement provider ของตัวเอง
- **นิยามชัด:** โมดูลเป็นเจ้าของ (ก) หน้ารายงานใน tab ของตัวเอง (ข) API `/api/u/[unitId]/reports/<module>/...`
  (ค) StatProvider + UnitKpiProvider — CORE เป็นเจ้าของโครง/ตาราง/หน้ารวม/digest/export ·
  โมดูล**ห้าม**เขียน DailyStat ตรง, ห้ามทำ date picker/export เอง

---

## 10. Edge Cases & Rules

1. **ร้านเปลี่ยน timezone** — มีผล **ไปหน้า** ตั้งแต่ business date ถัดไป (queue การเปลี่ยน apply
   ตอนเที่ยงคืนของ timezone เดิม) · DailyStat ย้อนหลัง **ไม่ recompute** (เอกสาร/audit ปิดไปแล้ว
   ด้วยกติกาเดิม — recompute จะทำให้เลขไม่ตรงใบเสร็จ) · ลง AuditLog + banner บนรายงานช่วงคาบเกี่ยว
2. **Void/refund ย้อนวัน** — event void ต้องพก business date ของเอกสารเดิม → StatRunner
   recompute วันนั้นทั้ง (unit, module) · Hotel: void รายการ ROOM ลง business date ปัจจุบัน
   แบบ reversal (ตามสเปค 01 §11.6) → กระทบ stat วันปัจจุบัน ไม่ใช่วันเดิม — ตรงกับ audit ·
   Account: reversal ของงวดปิดลงงวดปัจจุบัน (สเปค 12 §11.6) — DailyStat ตามเอกสารจริงเสมอ
   จึงไม่ต้อง special-case
3. **Unit PAUSED/ARCHIVED** — รายงานย้อนหลัง**เห็นเต็ม**เสมอ (PAUSED = ทำงานต่อได้,
   ARCHIVED = read-only) · ยังอยู่ใน consolidated ย้อนหลัง (ตามสเปค 12 §11.14) ·
   การ์ดบน Overview: PAUSED แสดงจาง + badge "พัก" (เลขวันนี้มักเป็น 0 — honor ธุรกรรมเดิม
   ยังนับ) · ARCHIVED ไม่แสดงการ์ด แต่ค้นได้ในหน้า reports
4. **เลขไม่ตรงระหว่าง realtime กับ daily** — นิยาม: transactional query = ความจริง,
   DailyStat = cache (§1.1) · cron 03:00 D+1 re-verify เมื่อวาน; mismatch → recompute + log ·
   UI ที่แสดงเลขสองแหล่งบนจอเดียว (การ์ด T + กราฟ D) ให้จุดตัดชัด: การ์ด = วันนี้,
   กราฟ = ถึงเมื่อวาน — ไม่เอาเลขวันนี้จาก DailyStat มาโชว์คู่กับ live
5. **DailyStat กับ Account ไม่ตรงกัน** — เป็นไปได้ชั่วคราว (posting ค้าง retry — สเปค 14 §11.8)
   → หน้า consolidated แสดงจาก Account posting เมื่อพูดเรื่อง "บัญชี" และจาก POS sale เมื่อพูดเรื่อง
   "ยอดขาย" พร้อม label — ห้ามเฉลี่ย/ผสมสองแหล่งในตารางเดียว
6. **เปิดโมดูล/สร้าง unit ใหม่ → ไม่มี stat ย้อนหลัง** — StatRunner backfill 90 วันอัตโนมัติ
   (หรือตั้งแต่ธุรกรรมแรก แล้วแต่สั้นกว่า) ตอน provider ลงทะเบียนครั้งแรก · กราฟช่วงไม่มีข้อมูล
   แสดง gap ไม่ใช่ศูนย์
7. **โมดูลถูกปิด (enabledModules)** — tab รายงานหาย แต่ DailyStat/ประวัติอยู่ครบ เปิดกลับมาเห็นต่อ
   (ตามกติกาสเปค 02 §11.13)
8. **วันคาบเกี่ยว Hotel audit ยังไม่ปิด** — metric HOTEL ของ "เมื่อวาน" อาจยังไม่มีจน audit ปิด
   → digest 08:00 ถ้า audit ยังไม่ปิด: แสดง "รอปิดยอด (night audit)" แทนเลข ไม่แสดงเลขสด
   (กันเลขเปลี่ยนทีหลัง — hotel คือโมดูลเดียวที่สัญญาว่าย้อนหลังนิ่ง 100%)
9. **สิทธิ์เปลี่ยนกลางทาง** — MANAGER ถูกถอน unit → การ์ด/รายงาน/digest ของ unit นั้นหายทันที
   (ตรวจ `can()` ทุก request + digest ตรวจตอนส่ง §4.3) — ไม่มี cache ข้ามสิทธิ์
10. **Query หนักช่วงเปิดร้าน** — รายงาน detail บังคับ from/to + index ตาม access pattern
    (โมดูลรับผิดชอบ index ของตัวเองตามสเปค) · StatRunner ทำงานนอก peak (กลางคืน/queue debounce)
    · หน้า Overview แตะเฉพาะ KPI endpoint เบา + DailyStat — ห้าม aggregate สดข้ามตารางใหญ่
11. **สอง unit คนละ timezone ใน tenant เดียว** — "วันนี้" ของแต่ละการ์ดคือ business date ของ
    unit นั้น (§1.4 ข้อ 6) · ป้ายวันที่บนการ์ดแสดงชัดเมื่อ timezone ต่างจาก tenant default
12. **Isolation** — DailyStat/ReportExportLog อยู่ใต้ Prisma tenant guard เหมือนตารางอื่น ·
    query consolidated ใช้ flag `crossUnit: true` ตามกติกา BLUEPRINT_BUSINESS_UNITS §8.1 ·
    เทส 2-tenant/2-unit ต้องครอบ endpoint รายงานทุกตัว (อยู่ใน QC ของแต่ละโมดูลแล้ว)

---

## 11. ข้อขัดกันที่พบระหว่างรวบยอด + คำตัดสิน (บันทึกไว้กันเถียงซ้ำ)

| # | ข้อขัด | คำตัดสินในเอกสารนี้ |
|---|---|---|
| 1 | Restaurant `bizDate = วัน service` (ข้ามเที่ยงคืนนับวันเดิม — 02 §11.11) ขัดกับ POS/Account ตัดเที่ยงคืน | เงินทุกชั้นกลาง (Overview/digest/DailyStat/consolidated) ใช้เที่ยงคืน · วัน service เป็นมุมปฏิบัติการภายใน tab Restaurant + label ชัด (§1.4 ข้อ 4) |
| 2 | `getUnitKpi(unitId)` (01) ไม่มีพารามิเตอร์วัน | finalize เป็น `(unitId, date)` — date default วันนี้ (§3.1) |
| 3 | การ์ด Hotel ใช้ "รายได้ห้อง**เมื่อวาน**" ขณะโมดูลอื่นใช้ "วันนี้" | ยอมรับตามสเปค (เหตุผลดี: เลข audit นิ่ง) — interface มี `freshness` + label ต่อ field ทำให้การ์ดบอกตัวเองได้ (§3.1) |
| 4 | Queue เสนอ `dayCutoffHour` 🔜 แต่ Restaurant แก้เคสข้ามคืนด้วย bizDate คนละกลไก | มาตรฐานอนาคตเดียว = `unit.settings.dayCutoffHour` (มีผลทุกโมดูล+DailyStat พร้อมกัน) — bizDate ของ Restaurant คงเป็น view ภายใน (§1.4 ข้อ 4) |
| 5 | Point/Ticket ระบุ "summary/cache รายวัน 🔜" ของตัวเอง ขณะเอกสารนี้ให้ DailyStat เป็นของกลาง v1 | DailyStat กลางมาแทน 🔜 เหล่านั้น — โมดูลไม่สร้างตาราง summary เอง แค่ implement StatProvider (§7.2) · รายงาน detail ยัง query ตรงตามสเปคเดิม |
| 6 | แถบรวมบน Overview ถูกโมดูลต่างๆ จองรวมกัน 8 ตัวเลข (BLUEPRINT 4 + Coupon 2 + Reward 2) | แถวแรก 4 ตัวตาม BLUEPRINT_BUSINESS_UNITS (ยอดขาย/สมาชิกใหม่/earn-burn/แชทค้าง) · Coupon/Reward อยู่แถวสอง แสดงเมื่อเปิดโมดูล (§3.1) |
| 7 | POS "low stock digest รายวัน" (14 §8) อาจซ้ำ/ชนกับ Daily Digest กลาง | รวมเป็นช่องทางเดียว: low stock เป็น section ใน Daily Digest กลาง — POS ไม่ส่งเมลแยก (§4.2) |
