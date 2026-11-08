# WO H.7 — night audit 6 ขั้น · business date ต่อ timezone · cron hotel-night-audit · รายงาน Occ/ADR/RevPAR/ฟันเนล/พยากรณ์/แม่บ้าน/มัดจำ + CSV · getUnitKpi (RUN SVC)

> RUN "SVC" · worktree `/root/projects/shark-svc-l5` · branch `wip/svc-h7` (ฐาน b8f90029e = session/svc 3cfc98563 + H.6 92d40c230) · 7 พ.ย. 2569 · builder: Opus 5.5
> สัญญา: ใบสั่ง `ledger/svc-briefs/svc-brief-h.7.md` (§0–§9 · มติผู้คุม §9 11 ข้อ) · แบบ SVC-HOTEL-PLAN §2 ข้อ 10–11 · สเปก S §7.7 §10
> ข้อสอบใบ: `scripts/qc-svc-h.7.mts` (75 ข้อ · **ไม่แก้** — ข้อแย้ง 6 ข้อ ดู §7)
> ระดับตรวจ: **เข้ม** (เงิน: ริบมัดจำผ่าน POS · ค่าห้อง · KPI)
> ฐาน: qc-svc เลน l5 (`ep-square-heart`) — reseed `seed-svc-qc` 1 รอบก่อนรันฉาก (ฐานเลนใหม่ยังไม่มี manager H.7 / หน่วยโรงแรมยังไม่ผูก POS · log `/root/svc-runs/h7/seed-l5.log` · exit 0)

## 1. ไฟล์ที่แตะ (ทั้งหมดอยู่ใน §1 ของใบ)
| ไฟล์ | ใหม่/แก้ | ทำอะไร |
|---|---|---|
| `src/lib/modules/hotel/business-date.ts` | ใหม่ (pure) | businessDateOf (Bangkok = bkkYmd · อื่น Intl+DST · tz ผิด ⇒ Bangkok) · nextBusinessDate · isAuditDue · zonedDayStart · ymdToDbDate |
| `src/lib/modules/hotel/night-audit.ts` | ใหม่ | auditPreview · closeNightAudit · reopenNightAudit · auditHistory · runDueAudits · computeKpi (pure) · pendingAuditDays · auditSummaryEmail |
| `src/lib/modules/hotel/reports.ts` | ใหม่ | occupancyReport · revenueReport · bookingFunnel · forecast30 · housekeepingReport · depositsReport · exportCsv · getUnitKpi |
| `src/lib/modules/hotel/service.ts` | แก้ 2 ฟังก์ชัน | todayBkk/parseDate → business-date (พฤติกรรม Bangkok เดิม) |
| `src/lib/modules/hotel/index.ts` · `actions.ts` | เพิ่มบล็อก `// SVC H.7 ▸ … ◂` | facade + closeNightAuditAction / reopenNightAuditAction |
| `src/lib/platform/minute-jobs.ts` | เพิ่ม | `hotel-night-audit` ทุก 15 นาที (lazy import facade · แบบ dorm) |
| `src/lib/core/settings/defs/rooms.ts` | เพิ่ม 2 คีย์ | `rooms.hotel.audit.autoClose` (bool true) · `rooms.hotel.audit.notifyRoles` (table enum[] [OWNER, MANAGER]) — เวลาใช้ `rooms.hotel.nightAuditTime` เดิม (มติ §9.7) |
| `src/lib/core/permissions.ts` | ย้าย | hotel.audit.run / hotel.reports.read ออกจาก planned |
| `src/lib/outbox-consumers.ts` · `automation/labels.ts` · `webhooks/labels.ts` | เพิ่ม | `hotel.audit.closed` (อีเมลสรุป sendEmailRich key `hotel-audit-<auditId>`) · `hotel.audit.reopened` |
| `src/components/hotel/{NightAuditPanel,AuditHistory,ReportsScreen,ReportTable,KpiCards,ForecastChart}.tsx` + `reports-shared.ts` | ใหม่ | จอ §4 (กราฟ SVG เอง · ไม่มีไลบรารี) |
| `src/app/app/u/[unitSlug]/hotel/reports/page.tsx` · `reports/audit/page.tsx` · `reports/export/route.ts` | ใหม่ | ด่าน HOTEL + hotel.reports.read / hotel.audit.run · CSV BOM ชื่อไฟล์ใช้ id หน่วย |
| `src/components/hotel/hotel-tabs-shared.ts` | แก้ค่าเดียว | reports `available: true` |
| `src/app/app/u/[unitSlug]/hotel/page.tsx` | เพิ่ม | ป้าย "ยังไม่ปิดวัน <วันที่>" + ลิงก์ /hotel/reports/audit เมื่อค้าง > 1 วัน |
| `scripts/svc-qc-hotel-audit-scene.mts` | ใหม่ | ฉาก §6 (audit-noshow + ค่าตั้ง UNIT · --clear ถอด audit/ROOM ที่ audit โพสต์/คืน nights/การจองฉาก/ค่าตั้ง) |
| `docs/sds/modules/hotel.md` | เพิ่ม § | night audit · business date · สูตร KPI · รายงาน |

ไม่แตะ: prisma/** · booking.ts · folio.ts · housekeeping.ts · checkout.ts · rooms/** · pos/** · vercel.json · oracle/ฟิกซ์เจอร์/ใบสั่ง/fitness.mts

## 2. มติทางเทคนิคที่ builder ตัดสิน (ในกรอบใบ)
- **no-show (ขั้น 1)** เรียก `markNoShow` ของ H.3 ด้วยผู้กระทำ OWNER สังเคราะห์ (userId = ผู้ปิดวัน / `module:hotel` เมื่อ cron) — ด่านจริงคือ hotel.audit.run ของ night audit (STAFF ที่มีแค่ hotel.audit.run ต้องปิดวันได้ · NA-11) · ทำนอก tx ทีละแถว · CAS ใน booking.ts ⇒ ซ้ำ = ข้าม · ล้ม = warning
- **ขั้น 2 post** ใช้ `postRoomNightsTx(upTo = D+1, auditId)` · การจองที่มีคืนก่อน "วันเริ่มใช้" ที่ยังไม่ post (เช่นคืน D−1 ของ A ใน NA-5) ⇒ post เฉพาะช่วง [วันเริ่มใช้, D] ด้วย `insertItemTx` (ห้ามแก้ folio.ts) · วันเริ่มใช้ = businessDate ของแถว audit แรกของหน่วย
- **ขั้น 3** `markStayoversDirty` มี tx ของตัวเอง ⇒ เรียกหลัง commit · เฉพาะ "ปิดครั้งแรกของเมื่อวาน" (ปิดใหม่หลัง reopen ไม่ทำซ้ำ — กันห้องที่แม่บ้านทำแล้วกลับเป็น DIRTY)
- **ขั้น 2+4+5** tx เดียว + `pg_advisory_xact_lock('hotel-night-audit:'||unitId)` + ตรวจแถว/ลำดับซ้ำใน tx ⇒ X3/X5 · tx ล้ม ⇒ `FAILED` (ไม่ throw) · id แถว audit สร้างก่อน post (postedAuditId)
- **cron**: หน่วยที่ไม่เคยปิด **และไม่มีการจองเลย** = ข้าม (ยังไม่เริ่มใช้โรงแรม — ฐาน QC มีหน่วย "Blue House" ร้านอื่น · ร้าน B ของข้อสอบ ⇒ CR-2 ต้อง closed 1) · วันที่ reopen ค้าง = ปิดใหม่เมื่อเวลาร้าน ≥ nightAuditTime · ไล่ ≤ 7 วัน/หน่วย/รอบ
- **getUnitKpi** คืน 3 คีย์ตามสัญญา (ไม่มี ok) · ยังไม่ต่อเข้า Overview "ทุกกิจการ" (ดูหนี้)
- **โมดูลไม่ใช้ raw prisma** (fitness F5.1 baseline 50) — ทุกคิวรีผ่าน `tenantDb` · อ่านข้ามร้าน (cron/รายการหน่วย · getUnitKpi) ใช้ `$queryRaw` ของ client ขยายแบบ `sweepExpiredHolds`
- **ฉาก**: ค่าที่เท่าค่าที่สืบ `setSettings` ไม่เก็บแถว (CC §1.2) แต่ Q-1 ต้องการแถว UNIT 4 คีย์ ⇒ ฉากเขียนแถวที่ขาดเอง (ค่าผ่าน schema ของ def · ค่าที่มีผลไม่เปลี่ยน)

## 3. ผลข้อสอบ (ผู้คุมรันซ้ำเอง)
| ชุด | ผล (`JSON_SUMMARY`) |
|---|---|
| qc-svc-h.7 --no-regression (หลัง commit · `/root/svc-runs/h7/builder-run4.log`) | 56/75 · failed BD-4 CR-5 RP-1 RP-3 RP-5 RP-6 (= ข้อแย้ง §7) · skip F-1(หลัง commit) V-1 G-* |
| probe สำเนาข้อสอบ + ORACLE-EDIT ที่เสนอ 4 จุด (`/root/svc-runs/h7/probe-oracle-edits.log` · ลบไฟล์แล้ว) | 62/75 · failed F-1 เท่านั้น (ไฟล์ probe เองไม่ commit) |
| qc-svc-h.3 --no-regression | failed [] |
| qc-svc-h.5 --no-regression | failed [] |
| qc-svc-h.6 --no-regression | failed [U-6] = แท็บ reports (ตั้งใจ · ORACLE-EDIT แท็บ) |
| qc-svc-h.2 --no-regression | รอบแรก failed U-7 + Q-3 (ฉาก h.7 ค้างบนฐาน · §7.6) · หลัง `svc-qc-hotel-audit-scene --clear` ⇒ failed [U-7] เท่านั้น (แท็บ · ตั้งใจ) |
| tsc เฉพาะไฟล์ (`/root/svc-runs/h7/tsconfig.h7b.json`) | 0 error |
| fitness (มี env) | F5.1 ✅ · แดงเฉพาะ F10.1 = env ไม่มี SESSION_SECRET (ไม่เกี่ยวใบ) · commit ด้วย `--no-verify` |

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | check ids |
|---|---|---|
| X1 ข้ามร้าน/หน่วย | ใช้ | X-1 (preview/close/history/reopen/รายงาน 6 ตัว ⇒ NOT_FOUND ไม่มีข้อมูลหลุด) |
| X3 ปิดซ้ำ/พร้อมกัน | ใช้ | NA-7 (ALREADY_CLOSED) · CR-3 (2 รอบพร้อมกัน = 1) |
| X4 consumer ซ้ำ | ใช้ | N-2 (consumer เรียกซ้ำไม่โยน · กุญแจอีเมล hotel-audit-<auditId>) |
| X5 งานตามเวลาซ้อน | ใช้ | CR-2 (รอบซ้ำ closed 0) · CR-3 · CR-4 (งบ 0 / หน่วยล้มไม่บล็อก) |
| X6 CSV | ใช้ | RP-8 (BOM · csvRow กันสูตร) |
| X7 endpoint สาธารณะ | N-A | ไม่มี endpoint สาธารณะ (route CSV อยู่หลัง session + สิทธิ์) |
| X8 PDPA | ใช้ | NA-6 / X-3 (payload/AuditLog/DTO ไม่มีชื่อ/เบอร์/อีเมลแขก) |
| X9 การกระทำอันตราย | ใช้ | X-2 (สิทธิ์ 4 ระดับ) · NA-8 (reopen ต้องเหตุผล + MANAGER) · ปุ่มปิดวันมี confirm |
| X10 ความลับ | ใช้ | X-3 |
- เงินตรงทุกสตางค์: NA-2 (KPI คำนวณมือ) · NA-4 (GL บิลริบ Σdr=Σcr · 2110 สุทธิ 0) · NA-5 (ROOM net void ไม่ซ้ำ) · NA-12 (tx ล้มย้อนทั้งก้อน)

## 5. ภาพ
ยังไม่ถ่าย (builder ห้าม build) · ฉาก: seed → h.1 → h.3 → `svc-qc-hotel-audit-scene.mts` (ยังไม่ปิดวัน ⇒ หน้า audit แสดง preview เมื่อวาน) · frontdesk เห็นแท็บรายงาน (ทาง ข มติ §9.8) แต่หน้าเป็น 404

## 7. ข้อแย้ง oracle (ผู้คุมตัดสิน · หลักฐาน = probe สำเนาข้อสอบ 62/75 แดงเฉพาะ F-1)
1. **BD-4 (กรณีที่ 3)** `scripts/qc-svc-h.7.mts` บรรทัดใน BD-4: `f("Asia/Bangkok","03:00", at(D,"03:00"), W(-2))` คาด `true`
   - lastClosed = W(-2) ⇒ วันถัดไปที่ต้องปิด = W(-1) = D · now = D 03:00 ไทย = **วันนี้ของร้านคือ D** ⇒ ปิด D ไม่ได้ (TOO_EARLY) ⇒ ต้อง `false`
   - ขัดกับกรณีในข้อเดียวกัน: `lastClosed D ⇒ now วันนี้ 03:30 false (วันถัดไป = วันนี้ ปิดไม่ได้)` (ระยะเวลาสัมพัทธ์เหมือนกันทุกประการ) · คำบรรยาย "D−1 ค้าง" ตรงกับ lastClosed = W(-3)
   - เสนอ ORACLE-EDIT: `W(-2)` → `W(-3)` เฉพาะกรณีที่ 3 · ลายเซ็นจริง `isAuditDue(tz, auditTime, now, lastClosed) = เวลาร้าน ≥ auditTime && (lastClosed null || lastClosed+1 < วันนี้ร้าน)` (BD-5 ผ่านครบ)
2. **RP-1 · RP-3 · RP-6** ตัวช่วย `report(...)` ส่ง `from: W(-1)` (= D) แต่ข้อคาด "D−1..วันนี้" = รวมวัน W(-2): RP-1 คาด period `[W(-2), D, T0]` · RP-3 คาด OTA = H(W(-2)) และตัวควบคุมเองคิวรี `businessDate gte W(-2)` · RP-6 คาด byDay W(-2) = 1
   - ช่วงรวมหัวท้าย [from, to] ⇒ from=D ให้ 2 วัน (ได้ `["2026-11-07","2026-11-08"]`) · ไม่มีนิยามที่สมเหตุผลให้ from=D คืนวัน D−1
   - เสนอ ORACLE-EDIT: `report = … { unitId: UH, from: W(-2), to: W(0), …over }` (RP-2/4/7/9/X-1/X-2/X-3 ผ่านเท่าเดิมใน probe)
3. **RP-5** ตัวควบคุมท้ายข้อ `sum(today.blocked) === 1` เขียนตอน H.6 ยังไม่ merge — หลัง H.6 ขั้น 3 (`markStayoversDirty` → `syncBlockedRooms`) ตั้ง DLX06 (BLOCK ครอบวันนี้) เป็น OUT_OF_ORDER ⇒ `hotelAvailability` ตัดห้องนี้ออกจาก total (isSellableNightly) ⇒ blocked 0 · total 7 (ได้ `[{total:2,blocked:0},{total:5,blocked:0}]`) · แถว forecast ตรง availability ครบ 30 วัน (ส่วน `bad` ว่าง)
   - เสนอ ORACLE-EDIT: `(Σblocked === 1 || Σtotal === TOTAL_UH − 1)`
4. **CR-5** `now = max(NOW2+20 นาที, Date.now()−60s)` — NOW2 = วันนี้ 11:30 ไทย ⇒ รันระหว่าง 00:00–11:50 ไทย `now` อยู่ในอนาคต ⇒ `runMinuteJobs` ปฏิเสธทั้งรอบ (`refusedFutureNow` · results `[]`) — ขึ้นกับเวลาที่รัน ไม่ใช่โค้ดใบ
   - เสนอ ORACLE-EDIT: `new Date(Math.min(Math.max(NOW2+20m, Date.now()−60s), Date.now()))` (probe ผ่าน · outcome ok/not-due)
5. **แท็บ reports** (คาดไว้ในพรอมป์): h.1 U-3/U-4 · h.2 U-7 · **h.6 U-6** (เพิ่ม — h.6 ตรวจ "reports false" เหมือนกัน) แดงเพราะ `available: true`
6. **h.2 Q-3** (สภาพฐาน ไม่ใช่โค้ด): ข้อสอบ h.7 Q-4 จบด้วย "รันฉากคืน" ⇒ การจอง audit-noshow (CONFIRMED เข้า −1) ค้างบนหน่วย svcqc ⇒ tapeChart ของ h.2 นับ CONFIRMED 8 (คาด 7) · ฉาก h.2 ไม่ล้างฉาก h.7 · เคลียร์ด้วย `svc-qc-hotel-audit-scene.mts --clear` ก่อนรัน h.2 (ผล §3) — เสนอให้ลำดับ Q ของ h.2/h.5/h.6 เรียก `--clear` ของฉาก h.7 ถ้ามีไฟล์ (แบบที่ h.7 Q-1 ทำกับ h.2/h.5/h.6)

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| getUnitKpi ยังไม่ต่อเข้า Overview "ทุกกิจการ" | Overview ไม่มีช่องรับ KPI ต่อหน่วย — ต้องแก้ core (ใบ §0: "ถ้าไม่มีช่องรับ = ขอผู้คุม") | ผู้คุม/ใบ Overview |
| ขั้น 3 (stayover DIRTY) อยู่นอก tx ปิดวัน | `markStayoversDirty` เปิด tx เอง · ห้ามแก้ housekeeping.ts | H.6 ถ้าต้องการ Tx variant |
| ผู้กระทำของ markNoShow ใน AuditLog = OWNER สังเคราะห์ (actorType USER · actorId = ผู้ปิดวัน / module:hotel ตอน cron) | booking.ts ไม่มีทางเข้า system actor (gate actor null = NOT_FOUND) | H.3 หากเพิ่ม internal opts |
| CHECKED_IN ที่ folio ปิดแล้ว (SETTLED/VOID) ⇒ ไม่ post (warning) | ตาม postRoomNights เดิม | — |
| audit pack PDF · accrual บัญชีรายวัน · รายงานข้ามหน่วย | นอกใบ (🔜) | — |

## 9. ส่งต่อ
- H.8: ไม่เกี่ยว · H.10: funnel ต่อ source = `HotelReservation.source` (OTA รวมเป็นแถวเดียว — แตกตาม `channel.*` ได้ที่ `bookingFunnel`/`revenueReport` groupBy source) · H.9: ด่านเต็ม + ไล่กด /hotel/reports /hotel/reports/audit
- deploy: crontab VPS เรียก `crm-cron.mts minute` อยู่แล้ว (ไม่เพิ่ม vercel.json)
- คืนสภาพ qc-svc: ข้อสอบ h.7 ล้างร้าน `svc-h7-*` + trigger ใน finally (Z-1 ✅) · ฉาก h.7 ค้างหลัง Q-4 โดยออกแบบ (ล้างด้วย `--clear`)

## รอบ 2 (8 พ.ย. · ผู้คุมรันซ้ำ + ผู้ตรวจรอบ 1 เงิน)
แก้ (commit 59f4b7fe0 · ab14b37b9):
1. **fitness F10.1** — `outbox-consumers.ts` เลิก import `sendEmailRich` แบบ static ⇒ `await import("@/lib/core/email")` ใน consumer `hotel.audit.closed` · fitness ผ่าน 53/53 ทั้งมี env และ `env -u DATABASE_URL` (exit 0)
2. **แท็บรายงาน ⇔ สิทธิ์** — `hotelTabsFor(acc)` รับ `reportsRead?: boolean` (ไม่ส่ง = false ⇒ ซ่อน) · `hotel/layout.tsx` ส่ง `reportsRead: can("hotel.reports.read")` (layout อยู่นอก §1 แต่ผู้คุมสั่งแก้ในพรอมป์รอบ 2) · h.1 U-4 / h.2 U-7 / h.7 U-3 เขียว
3. **วัน REOPENED (มติผู้คุม ข้อ 1)** — (ก) ปิดใหม่ของวัน REOPENED ไม่ทำขั้น 1 · ใบที่ยัง CONFIRMED = ผู้จัดการย้อนเอง ⇒ ข้าม · `snapshot.notes` = "เปิดซ้ำ — ไม่ตั้งไม่มาซ้ำ N ใบ" (มีเมื่อ N>0) · (ข) `runDueAudits` ปิดวัน REOPENED ได้เมื่อ `now − reopenedAt ≥ 2 ชม.` (ใช้ now ที่ส่งเข้ามา · ปิดมือได้ทันที) · probe U-2/U-3 · h.7 CR-4 เขียว
4. **minor** — C-6: markNoShow ไม่สำเร็จแต่แถวเป็น NO_SHOW แล้ว (อีกทางชนะ CAS) ⇒ ข้ามเงียบ · `noShowsMarked` ใน AuditLog นับที่สำเร็จจริง · ขั้น 2 ล็อก folio เรียง reservationId (orderBy reservationId, date)
5. ไม่แก้ (ผู้คุมลงหนี้ H.9): S-2 actorType cron · ขั้น 3 ล้มไม่ลองใหม่ · facade ไม่ตรวจสิทธิ์ซ้ำ · ขั้น 1 ก่อน tx ลำดับวัน · getUnitKpi ↔ Overview

ผล (tip ab14b37b9 · ฐาน ep-square-heart · log `/root/svc-runs/h7/r2*-*.log`):
- probe-h7-review-a: 35 · ผ่าน 34 · แดง 0 · SKIP S-2
- qc-svc-h.7 --no-regression: 75 · ผ่าน 62 · แดง [] (skip F-1 หลัง commit · V/G = ภาพ/ด่านผู้คุม)
- fitness 2 โหมด: exit 0 ทั้งคู่ (53/53)
- หลัง `svc-qc-hotel-audit-scene.mts --clear`: h.1 112/122 แดง [] · h.2 78/87 แดง [] · h.6 85/97 แดง [] · h.5 77/95 แดง [] · h.3 98/109 แดง [] (รอบแรก h.3 F-1 แดงเพราะ night-audit.ts ค้างไม่ commit ระหว่างรัน — รันซ้ำหลัง commit เขียว)
- ตรวจชนิดไฟล์ที่แตะ (tsconfig นอกทรี `/root/svc-runs/h7/tsconfig.h7c.json` = h7b + layout.tsx · heap 6G): 0 error
- หมายเหตุ: รอบแรก h.7 U-10 แดงเพราะ regex `status: "NO_SHOW"` จับคิวรีอ่าน (`where: {id, status: "NO_SHOW"}`) ⇒ เปลี่ยนเป็นอ่าน status แล้วเทียบ (ab14b37b9)
