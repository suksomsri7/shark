# ใบสั่ง H.7 — night audit 6 ขั้น (no-show ริบมัดจำ · post ค่าห้อง · ห้องค้างต่อ DIRTY · freeze KPI · แจ้ง · reopen) · cron ต่อหน่วยตาม timezone · รายงาน Occ/ADR/RevPAR/รายได้ตามแหล่ง/funnel/ALOS/forecast 30 วัน/แม่บ้าน · CSV · `getUnitKpi` ขึ้น Overview · ตรวจ **เข้ม (เงิน)** · ผู้ตรวจ 2 รอบ

> ร่างโดยผู้คุม 7 พ.ย. 2569 — **เปิดเลนได้เมื่อ H.5 + H.6 merge** · ผู้คุมใส่ฟิกซ์เจอร์ "SVC H.7" (`SQC_HOTEL_AUDIT_SCENE` · `SQC_VISUAL_SPECS["h.7"]` · manager +`hotel.audit.run` `hotel.reports.read`) ก่อน
> แหล่งความจริง: `SVC-HOTEL-PLAN.md` §2 ข้อ 10–11 (audit 03:00 ค่าเริ่ม · business date ตาม timezone ร้าน · รวม `todayBkk/parseDate` กับ `rooms/occupancy.ts` ก่อน audit) · สเปก S §3.8 (S:154–160) §5.6 audit/reports (S:758–768) §7.7 night audit (S:955–975) §10 รายงาน+สูตร (S:1085–1108) §11 ข้อ 6 12 · ใบ H.0 §2.13 (`HotelNightAudit` คอลัมน์ · `@@unique([unitId, businessDate])`) · ใบ H.3 (`markNoShow` · `undoNoShow` · snapshot `rooms.hotel.noShow`) · ใบ H.5 (`postRoomNights(auditId)` · PENALTY · folio) · ใบ H.6 (`markStayoversDirty`) · ค่าตั้ง `rooms.hotel.auditAutoTime` (ถ้าไม่มี = เพิ่ม · ค่าเริ่ม "03:00") · `src/lib/platform/minute-jobs.ts` (`registerMinuteJob` · idempotent · หน้าต่างตรงเวลา · เวลาไทย) · อีเมลกลาง `sendEmailRich` (Q9) · Overview หน่วย (BLUEPRINT_BUSINESS_UNITS ข้อ 4 · `getUnitKpi`)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-h.7.mts» · probe ผู้ตรวจ `probe-h7-b.mts` · ภาพ `SQC_VISUAL_SPECS["h.7"]`
> builder: **ห้าม build/next · ห้าม commit/push session/svc · ห้าม pnpm install · ห้าม prisma/** · ห้ามเพิ่ม `vercel.json` cron** · temp `svc-h7-`

## 0. หลักของใบ
- **business date ต่อหน่วย** = วันล่าสุดที่ปิด + 1 (ไม่เคยปิด = วันแรกที่มีการจอง/วันนี้−1 ตาม timezone ร้าน `unit.settings.timezone` ค่าเริ่ม Asia/Bangkok ผ่าน `bkkYmd` เฉพาะกรณี Bangkok · timezone อื่นใช้ `Intl` ใน `business-date.ts` pure) · ปิดได้เฉพาะวันที่ `< วันนี้ของร้าน` (ปิดวันนี้ไม่ได้)
- **ปิดวัน = 6 ขั้นใน tx เดียว** (S §7.7 · ล็อก `HotelNightAudit` unique(unitId, businessDate) · ปิดซ้ำ ⇒ `ALREADY_CLOSED`): (1) no-show: CONFIRMED ที่ checkInDate = businessDate ยังไม่เช็กอิน ⇒ `markNoShow` (H.3 · ตาม snapshot noShow · ริบ = `moduleForfeitDeposit` + `FolioItem PENALTY` + folio SETTLED อัตโนมัติถ้า balance 0 — เงินผ่าน POS นอก tx ⇒ **ขั้น 1 ทำนอก tx หลัก ทีละแถว idempotent ก่อนเปิด tx ปิดวัน** · แถวที่ริบไม่สำเร็จ ⇒ จดใน `snapshot.warnings` ไม่บล็อกการปิดวัน) (2) `postRoomNights` ทุก CHECKED_IN สำหรับคืน businessDate (H.5 · ตั้ง `postedAuditId`) (3) `markStayoversDirty` (H.6) เมื่อ `dailyHousekeeping` (4) KPI freeze ลง `HotelNightAudit` (สูตร §2) (5) AuditLog + outbox `hotel.audit.closed` → consumer ส่งสรุปอีเมล OWNER/MANAGER (`hotel.audit.summary` · Q9 อีเมล · `rooms.hotel.notify.channel`) (6) ลำดับวัน: ถ้าวันก่อนหน้ายังไม่ปิด ⇒ ปิดวันเก่าก่อน (cron ไล่ปิดทีละวันจนถึงเมื่อวาน · ≤ 7 วัน/รอบ กันค้างยาว)
- **reopen** (MANAGER · `hotel.audit.run` · เฉพาะวันล่าสุด · เหตุผล): status REOPENED · ไม่ถอน folio item (ค่าห้องที่ post แล้วคง · void ตามปกติ) · ปิดใหม่ = คำนวณ KPI ทับ (ขั้น 1–3 idempotent) · AuditLog
- **cron**: `registerMinuteJob({name:"hotel-night-audit", everyMinutes:15, cadence:"minute"})` วนทุกหน่วย HOTEL ที่ ACTIVE/PAUSED(เดิม honor) · ถึง `auditAutoTime` ตามเวลาร้าน และวันนั้นยังไม่ปิด ⇒ ปิด · idempotent · เริ่มใหม่ได้ · งบเวลา budgetMs · ไม่เพิ่ม vercel.json (SVC-RUN ข้อ 15)
- **รายงาน** (S §10): อ่านจาก `HotelNightAudit` สำหรับวันปิดแล้ว (นิ่ง) + คำนวณสดสำหรับวันยังไม่ปิด · ทุกเงิน Int สตางค์ · % เป็น bp · Occ = occupied ÷ available (available = ห้อง active NIGHTLY/BOTH − OOO) · ADR = roomRevenue ÷ occupied · RevPAR = roomRevenue ÷ available · roomRevenue = Σ FolioItem ROOM net void ตาม businessDate · รายได้อื่น = Σ SERVICE+POS_CHARGE+MINIBAR · รายได้ตามแหล่ง (source) / ratePlan / roomType · funnel ต่อ source (จอง/ยืนยัน/ยกเลิก(เหตุผล)/no-show · rate bp) · lead time avg(checkIn − createdAt) · ALOS = Σ nights ÷ bookings · forecast 30 วัน on-the-books (counted nights ÷ available ต่อวัน · ใช้ `hotelAvailability` H.3) · แม่บ้าน: ห้องทำ/วัน · ต่อคน (HousekeepingLog DIRTY→CLEAN · by) · OOO ค้าง · มัดจำค้าง/HOLD หมดอายุ/ริบ (PENALTY) · **CSV ทุกตาราง** (UTF-8 BOM · `csvRow` X6)
- **`getUnitKpi(unitId)`** internal hook ให้ Overview "ทุกกิจการ": {occupancyTodayBps, arrivalsToday, roomRevenueYesterdaySatang} (เมื่อวาน = จาก audit ถ้าปิด ไม่งั้นคำนวณสด) — เพิ่มใน facade hotel · ผู้เรียก Overview ใช้ถ้ามี (ถ้า Overview ไม่มีช่องรับ = ขอผู้คุม · ไม่แก้ core)
- ไม่ทำ: audit pack PDF อีเมล (🔜) · accrual บัญชีรายวัน (🔜 S §8.5) · รายงานข้ามหน่วย/ร้าน

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ
| ไฟล์ | | เนื้อหา |
|---|---|---|
| «src/lib/modules/hotel/business-date.ts» | ใหม่ (pure) | `businessDateOf(unitTz, now)` · `nextBusinessDate(lastClosed)` · `isAuditDue(unitTz, auditTime, now, lastClosed)` · รวม `todayBkk/parseDate` ของ P1 → ใช้ `toYmd/ymdToDb` ของ rooms (PLAN §2 ข้อ 11 · แก้ P1 service.ts ให้เรียกตัวเดียว) |
| «src/lib/modules/hotel/night-audit.ts» | ใหม่ (server) | `auditPreview` `closeNightAudit` `reopenNightAudit` `auditHistory` `runDueAudits(now, budget)` §3.1–3.2 · `computeKpi` (pure · รับแถว) |
| «src/lib/modules/hotel/reports.ts» | ใหม่ (server) | `occupancyReport` `revenueReport` `bookingFunnel` `forecast30` `housekeepingReport` `depositsReport` `exportCsv(report)` `getUnitKpi` §3.3 |
| `src/lib/modules/hotel/service.ts` | **แก้เฉพาะ** `todayBkk/parseDate` → business-date (ไม่เปลี่ยนพฤติกรรม Bangkok) |
| `src/lib/modules/hotel/index.ts` · `actions.ts` | เพิ่ม | facade + actions (`// SVC H.7 ▸ … ◂`) |
| `src/lib/platform/minute-jobs.ts` **หรือ** ที่ที่งานรายนาทีของโดเมนลงทะเบียน (ดู dorm ว่าลงทะเบียนที่ไหน แล้วทำแบบเดียวกัน) | เพิ่ม | `hotel-night-audit` ทุก 15 นาที |
| `src/lib/core/settings/defs/rooms.ts` | เพิ่มคีย์ถ้าขาด | `rooms.hotel.auditAutoTime` (time · "03:00" · U) · `rooms.hotel.audit.autoClose` (bool เริ่ม true) · `rooms.hotel.audit.notifyRoles` (enum[] เริ่ม OWNER,MANAGER) |
| `src/lib/core/permissions.ts` | ย้าย `hotel.audit.run` `hotel.reports.read` → ใช้จริง |
| `src/lib/outbox-consumers.ts` · labels ×2 | เพิ่ม | `hotel.audit.closed` (+ consumer ส่งอีเมลสรุป `sendEmailRich` idempotencyKey `hotel-audit-<auditId>`) · `hotel.audit.reopened` |
| «src/components/hotel/{NightAuditPanel,AuditHistory,ReportsScreen,ReportTable,KpiCards,ForecastChart}.tsx» + `reports-shared.ts` | ใหม่ | จอ §4 (กราฟ = SVG เองไม่มีไลบรารี · ตาม dataviz ของระบบถ้ามี) |
| «src/app/app/u/[unitSlug]/hotel/reports/page.tsx» · «…/reports/audit/page.tsx» · «…/reports/export/route.ts» (CSV) | ใหม่ | ด่าน HOTEL · `hotel.reports.read` / `hotel.audit.run` |
| `src/components/hotel/hotel-tabs-shared.ts` | แก้ค่าเดียว | reports `available: true` (ORACLE-EDIT แท็บเดิมตอนรับ) |
| `src/app/app/u/[unitSlug]/hotel/page.tsx` | เพิ่ม | ป้าย "ยังไม่ปิดวัน <วันที่>" + ปุ่มไปหน้า audit (เมื่อค้าง > 1 วัน) |
| «scripts/svc-qc-hotel-audit-scene.mts» | ใหม่ | ฉาก §6 |
| `docs/sds/modules/hotel.md` | เพิ่ม §night audit/รายงาน | สูตร · business date · idempotency |

ห้ามแตะ: `prisma/**` · `booking.ts` (ใช้ `markNoShow`) · `folio.ts` (ใช้ `postRoomNights`) · `housekeeping.ts` (ใช้ `markStayoversDirty`) · `rooms/**` · `pos/**` · `vercel.json` · oracle

## 2. มติของใบนี้
1. **KPI freeze** (คอลัมน์ H.0 §2.13): roomsTotal = ห้อง active NIGHTLY/BOTH · roomsOOO = ห้องที่มี BLOCK ครอบคืนนั้น · roomsAvailable = total − OOO · roomsOccupied = จำนวนห้องที่มี nights.counted ของ businessDate ที่สถานะ CHECKED_IN/CHECKED_OUT(ออกวันถัดไป) **ไม่นับ HOLD/CONFIRMED ที่ไม่เข้า** · occupancyBps = occupied×10000 ÷ available (available 0 ⇒ 0) · roomRevenueSatang = Σ ROOM items ของ businessDate (net void) · adrSatang = revenue ÷ occupied (ปัด `rooms.money.rounding` · occupied 0 ⇒ 0) · revparSatang = revenue ÷ available · arrivals/departures/noShowCount/cancelledCount ของวัน · `snapshot` JSON = {bySource: {…}, byRoomType: {…}, warnings: [], version: 1}
2. **no-show ในขั้น 1** ใช้ `markNoShow(at = businessDate+1 00:00 เวลาร้าน)` ของ H.3 (ไม่เขียนซ้ำ) · การจองที่ `holdExpiresAt null` MANUAL_APPROVE และยัง HOLD ไม่ใช่ no-show (ยังไม่ยืนยัน)
3. **ค่าห้องคืนที่ไม่มีห้อง (roomId null · CONFIRMED ไม่เช็กอิน)** ไม่ post (ไม่ใช่รายได้) · CHECKED_IN ที่ยังไม่มี roomId เป็นไปไม่ได้ (H.4 บังคับ) ⇒ ถ้าพบ = warning
4. **วันแรก**: หน่วยที่ไม่เคยปิด ⇒ ปุ่ม "เริ่มใช้ night audit ตั้งแต่วันที่…" (เลือกวัน ≤ เมื่อวาน · ค่าเริ่ม = เมื่อวาน) — คืนก่อนหน้านั้นไม่ post ย้อน (ค่าห้อง P1 เดิมอยู่ใน totalSatang แล้ว · ป้ายบอก)
5. **ปิดวันที่มีการจอง P1 เดิม** (backfill H.0 ให้ nights แล้ว · folio เปิด H.0/H.3): post ตามปกติ
6. **cron ล้มกลางคัน** = tx ปิดวัน rollback ทั้งก้อน (ขั้น 2–5) · ขั้น 1 (no-show เงิน) idempotent ต่อแถว · รอบถัดไปทำต่อ
7. รายงาน ≤ 8 คิวรี/หน้า · ช่วง ≤ 366 วัน · ค่าเงินแสดง ฿ ทศนิยม 2 · % 1 ตำแหน่ง
8. ข้ามร้าน/หน่วย NOT_FOUND · CSV export ตรวจสิทธิ์เดียวกับหน้า · ชื่อไฟล์ไม่มีชื่อร้าน (id เท่านั้น)

## 3. สัญญาโค้ด (ย่อ)
3.1 `auditPreview(actor, ctx, {unitId, businessDate?}) → {businessDate, noShows: [{reservationId, code, depositSatang, policy}], roomNightsToPost: n, revenueSatang, kpi, stayoversToDirty: n, warnings}` · `closeNightAudit(actor|null(cron), ctx, {unitId, businessDate, idempotencyKey?}) → {ok, auditId, kpi, warnings} | {ok:false, code: "ALREADY_CLOSED"|"TOO_EARLY"|"PREVIOUS_OPEN"|"NOT_FOUND"|"FORBIDDEN"}` · `reopenNightAudit(actor, ctx, {auditId, reason})` · `auditHistory(ctx,{unitId, from, to})`
3.2 `runDueAudits(now, budgetMs, control) → {closed: n, skipped: n, errors: n}` (ลงทะเบียนเป็น minute job)
3.3 `occupancyReport(ctx,{unitId, from, to, groupBy: "day"|"month"}) → {rows: [{period, occupancyBps, adrSatang, revparSatang, occupied, available, revenueSatang}], compare?}` · `revenueReport(…, groupBy: "ratePlan"|"roomType"|"source")` · `bookingFunnel(…)` · `forecast30(…)` · `housekeepingReport(…)` · `depositsReport(…)` · `exportCsv(kind, rows) → string` · `getUnitKpi(unitId) → {occupancyTodayBps, arrivalsToday, roomRevenueYesterdaySatang} | null`
3.4 actions: `closeNightAuditAction` `reopenNightAuditAction` (+ `hotel.audit.run`) · รายงานเป็น RSC อ่านตรง (ไม่มี action)

## 4. จอ (ไม่มีภาพแบบเฉพาะ — PARITY โครงกับหน้ารายงานหอ `dorm/reports` · ไทย)
`/hotel/reports`: KPI 4 การ์ด (Occ วันนี้ · ADR · RevPAR · รายได้ห้องเมื่อวาน) · ตัวกรองช่วง/กลุ่ม · ตาราง occupancy รายวัน/เดือน + กราฟเส้น SVG · แท็บ รายได้ตามแหล่ง/แผน/ประเภท · funnel · forecast 30 วัน (แถบ) · แม่บ้าน · มัดจำ/HOLD · ปุ่ม CSV ทุกตาราง · `/hotel/reports/audit`: การ์ดวันที่จะปิด + preview (no-show N · post N คืน · ห้อง DIRTY N) + ปุ่ม "ปิดวัน" (confirm) · ประวัติวันปิด + reopen (MANAGER · เหตุผล) · ป้าย "ปิดอัตโนมัติทุกวัน 03:00" · read-only ไม่มีปุ่ม · `data-scroll-hint`

## 5. event
`hotel.audit.closed` {unitId, auditId, businessDate, kpi: {occupancyBps, roomRevenueSatang, noShows}} · `hotel.audit.reopened` {auditId, byUserId} · `hotel.audit.summary` (อีเมล · consumer) — ไม่มี PII

## 6. ฉาก «svc-qc-hotel-audit-scene.mts» (ต่อยอดฉาก h.3+h.5)
แหล่งความจริง = `SQC_HOTEL_AUDIT_SCENE` (ผู้คุมใส่): ปิดวัน businessDate = เมื่อวาน (ฉาก h.3 มี noshow เมื่อวาน · inhouse 2 ตัวมีคืนเมื่อวาน) ⇒ คาด: noShow 1 (ริบมัดจำ PENALTY) · post ROOM 2 คืน · occupied 2 · available 12 (B103 BLOCK ถ้าฉาก h.2 รันด้วย — **ฉาก h.7 ยืนบน h.3 เท่านั้น ⇒ available 13** · ผู้คุมกำหนดชัดในฟิกซ์เจอร์) · revenue = Σ priceSatang ของ 2 คืน (ข้อสอบคำนวณจาก H.1 pricing ref) · stayovers DIRTY 2 · reopen แล้วปิดใหม่ = ตัวเลขเท่าเดิม

## 7. เกณฑ์รับ · regression · X · ผู้ตรวจ
- «qc-svc-h.7.mts» ผ่าน · probe-h7-b breach 0 · tsc 0 · fitness 2 โหมด · ภาพ h.7 (reports · audit) owner/manager/frontdesk(ไม่มีสิทธิ์ ⇒ ไม่เห็นแท็บ) · ตัวเลข ADR/RevPAR ตรงคำนวณมือในข้อสอบ (S §12)
- G: qc-svc-h.3 · h.5 · h.6 · h.1 · h.0 · r0.8 · r0.9 (ยอม G-1) · d.13 · d.19 (รายงานหอไม่เปลี่ยน) · smoke · b.0
- X1 · X3 ปิดซ้ำ = ALREADY_CLOSED · X5 cron 2 รอบซ้อน = ปิดครั้งเดียว · X9 สิทธิ์ (frontdesk ปิดวันไม่ได้) · X10 · X6 CSV `csvRow`
- ผู้ตรวจ 2 รอบ (เงิน): รอบ 1 = ลำดับขั้น/tx/idempotency/timezone (ทดสอบ unit timezone ≠ Bangkok) · รอบ 2 = สูตร KPI/รายได้ net void/ริบมัดจำผ่าน POS/รายงานตรง GL ของบิล

## 8. ส่งต่อ
H.8: หน้าสถานะแขกไม่เกี่ยว · H.10: `channel.*` ใน funnel ต่อ source OTA · H.9: ด่านเต็ม + ไล่กด · deploy: crontab VPS เรียก `crm-cron.mts minute` อยู่แล้ว (ไม่ต้องเพิ่ม)

## 9. มติผู้คุมต่อคำถามผู้เขียนข้อสอบ (7 พ.ย. · ข้อสอบ 75 ข้อ @3526d8f6c บน wip/svc-h7-oracle)
1. **no-show**: ขั้น 1 เรียก `markNoShow` ของ H.3 ตามเดิม — มัดจำริบผ่าน POS (บิลริบ PAID · GL) · **folio ของการจอง no-show = VOID ตาม H.3 `releaseStayTx`** (ไม่แทรก PENALTY · ไม่แตะ booking.ts/folio.ts) · แก้ §0 ขั้น 1 ให้ตรงนี้ · no-show ไม่มีมัดจำ ไม่บังคับสถานะ folio
2. รายงานรับ `ctx = {tenantId, actorUserId}` แบบ dormReportModel (D.19) · ไม่มีสิทธิ์ `hotel.reports.read` ⇒ FORBIDDEN (หรือ NOT_FOUND) · ปิดวัน/reopen = `(actor, ctx, input)` + FORBIDDEN
3. ชื่อช่อง DTO (ล็อก): revenueReport rows `{key, label, roomRevenueSatang, otherRevenueSatang, totalSatang}` · bookingFunnel `{created, confirmed, cancelled, noShow, confirmRateBps, cancelRateBps, leadTimeDaysAvg, alosNights}` · forecast30 `{date, onBooks, available, occupancyBps}` · housekeepingReport `{byDay:[{date, cleaned}], byUser:[{userId, cleaned}], oooOutstanding}` · depositsReport `{holdActive, depositPendingSatang, forfeitedSatang, refundedSatang}` · occupancyReport ตาม §3.3
4. วันที่ยังไม่ปิด: รายได้ห้องสด = Σ nights.priceSatang (counted) ของ CHECKED_IN/CHECKED_OUT ในวันนั้น (ROOM ยังไม่โพสต์) · occupied/available สูตรเดียวกับ KPI
5. arrivals = checkInDate = D และสถานะ CHECKED_IN/CHECKED_OUT (เข้าจริง) · departures = checkOutDate = D และ CHECKED_OUT · cancelledCount = cancelledAt ในวัน D · noShowCount = checkInDate = D และ NO_SHOW
6. `getUnitKpi.occupancyTodayBps` = on-the-books (CHECKED_IN คืนนี้ + CONFIRMED เข้าวันนี้) ÷ available
7. **ค่าตั้ง**: ใช้ `rooms.hotel.nightAuditTime` (#76 มีแล้ว) — **ไม่เพิ่ม** `rooms.hotel.auditAutoTime` · เพิ่มเฉพาะ `rooms.hotel.audit.autoClose` (bool เริ่ม true) · `rooms.hotel.audit.notifyRoles` · ฟิกซ์เจอร์แก้แล้ว
8. แท็บรายงาน: hotel-tabs-shared available:true (เห็นทุกคน · เหมือนแม่บ้าน) · หน้า reports/audit ตรวจ `hotel.reports.read`/`hotel.audit.run` เอง ⇒ notFound (ทาง ข) · ORACLE-EDIT h.1 U-3/U-4 + h.2 U-7 ตอนรับใบ
9. cron: `runDueAudits(now, …)` ตัดสิน isAuditDue/TOO_EARLY จาก `now` ที่ส่งเข้า (ไม่ใช่นาฬิกาเครื่อง) · หน่วย timezone อื่นปิด businessDate ตามเวลาร้าน
10. `rooms.hotel.audit.autoClose=false` ต้องเคารพ (cron ข้ามหน่วย) · ฉาก h.7 `--clear` ถอดแถว HotelNightAudit + ROOM ที่ audit โพสต์ + คืน nights.postedAuditId/folioItemId + การจอง audit-noshow (ให้ฉาก h.5 รันต่อบนฐานเดียวกันได้)
11. G ตาม §7 ครบ 11 ชุด (h.5/h.6 --no-regression) ✓

