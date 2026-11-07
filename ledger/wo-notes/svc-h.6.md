# WO H.6 — แม่บ้านมือถือ · บอร์ดห้อง · เช็กลิสต์ · มินิบาร์ · แจ้งซ่อม · realtime (RUN SVC · RUN HOTEL)

> worktree `/root/projects/shark-svc-l2` · branch `wip/svc-h6` (ฐาน 9de38c15b = session/svc ที่มี H.0/H.1/H.3/H.2/H.5) · 7 พ.ย. 2569 · builder: Opus (ตัวแทน)
> สัญญา: ใบสั่ง `ledger/svc-briefs/svc-brief-h.6.md` (§0–§9) · ภาพ `ledger/design-dorm/13-housekeeping-repair.png` ก/ข · S §7.6
> ข้อสอบใบ: `scripts/qc-svc-h.6.mts` (95 ข้อ · ไม่แก้) · ระดับตรวจ: **เบา** (ผู้ตรวจ 1 รอบ) + PARITY ภาพ 13
> ฐาน: qc-svc `ep-weathered-mode` ผ่าน `scripts/qc-svc.sh` + with-gate-lock

## 1. ไฟล์ที่แตะ
| ไฟล์ | ใหม่/แก้ | ทำอะไร |
|---|---|---|
| `src/lib/modules/hotel/hk-state.ts` | ใหม่ (pure) | `HK_TRANSITIONS` · `canHkTransition` · `HK_ROLES` · `hkPriority` · `parseHkNote/serializeHkNote` |
| `src/lib/modules/hotel/housekeeping.ts` | ใหม่ | `hkBoard` `hkRoom` `hkSetStatus` `hkStart` `hkRelease` `hkFinish` `hkInspect` `hkLogs` `postMinibar` `reportDefect` `setGuestRequest` `markStayoversDirty` `syncBlockedRooms` |
| `src/lib/modules/hotel/index.ts` · `actions.ts` | เพิ่มบล็อก H.6 | facade + 7 action (`hkSetStatusAction` `hkStartAction` `hkReleaseAction` `hkFinishAction` `hkInspectAction` `postMinibarAction` `reportDefectAction`) |
| `src/lib/modules/dorm/portal.ts` | เพิ่มอย่างเดียว (+34 · ลบ 0) | `dormStaffGate(ctx, unitId, action, opts?: {allowTypes})` เป็น overload · ค่าเริ่ม/`["DORM"]` = ทางเดิมทุกไบต์ · อื่น ⇒ `dormStaffGateTyped` (ผลมี `unitType`) |
| `src/lib/modules/dorm/repair.ts` | +`createStaffRepair` · แก้จุดเรียก gate 1 บรรทัด | `staffGate` ส่ง `allowTypes ["DORM","HOTEL"]` (+1 บรรทัด: หน่วย HOTEL ⇒ `visible: null`) · `RepairFailCode` +`FORBIDDEN` · import rbac |
| `src/lib/modules/dorm/index.ts` | +2 บรรทัด | ส่งออก `createStaffRepair` + type ผ่าน dorm facade (ใบ §1 แถว repair.ts "ส่งออกผ่าน dorm facade") — ดู §7 ข้อ 3 |
| `src/lib/modules/rooms/index.ts` | +1 บรรทัด | re-export `HK_STATUSES` (มติ §9 ข้อ 11) |
| `src/lib/core/settings/defs/rooms.ts` | แก้ 1 บรรทัด + เพิ่ม 2 | #75 schema union `{productId,priceSatang?} \| {key,name,priceSatang}` · คีย์ใหม่ `rooms.hotel.hk.canBlock` (bool · true · UNIT · HOTEL) |
| `src/lib/core/permissions.ts` | ลบ 2 บรรทัด planned + คอมเมนต์ | `hotel.housekeeping(.inspect)` ออกจาก planned |
| `src/lib/realtime/events.ts` · `index.ts` · `client.ts` | เพิ่ม (events แก้บรรทัด SAFE_KEYS 1 บรรทัด) | `EV_HOTEL_HK` · `hotelHkChannel(tenantId, unitId)` · SAFE_KEYS +roomId/hkStatus · `Signal` +2 ฟิลด์ · `subscribeHotelHk` |
| `src/app/api/realtime/hotel-hk-token/route.ts` | ใหม่ | แบบ kanban-token (requireTenant · หน่วย HOTEL · `evaluate hotel.housekeeping` · no-store) |
| `src/components/hotel/hk/{HkBoard,HkRoomCard,HkRoomSheet,HkChecklist,HkMinibar,HkDefectDialog,HkOfflineQueue}.tsx` + `hk-shared.ts` | ใหม่ | จอ §4 มือถือ-first (390) |
| `src/app/app/u/[unitSlug]/hotel/housekeeping/{page,[roomId]/page,logs/page}.tsx` | ใหม่ | บอร์ด · ทำห้อง · ประวัติ |
| `src/components/hotel/hotel-tabs-shared.ts` | แก้ค่าเดียว | แท็บแม่บ้าน `available: true` |
| `src/app/app/u/[unitSlug]/hotel/layout.tsx` | แก้ | แท็บแม่บ้าน ⇔ hotel.housekeeping · แม่บ้านล้วน (`housekeepingOnly`) เห็นแท็บเดียว |
| `src/lib/outbox-consumers.ts` · `automation/labels.ts` · `webhooks/labels.ts` | เพิ่ม | 4 event (§5) |
| `scripts/svc-qc-hotel-hk-scene.mts` | ใหม่ | ฉาก §6 |
| `docs/sds/modules/hotel.md` | เพิ่ม § แม่บ้าน | state machine · hkNote · บอร์ด · มินิบาร์ · DORM\|HOTEL · night audit · event |

ไม่แตะ: prisma/** · rooms/service.ts/occupancy.ts · folio.ts · checkout.ts · tape.ts/block.ts · booking.ts · dorm อื่น · ข้อสอบ/ฟิกซ์เจอร์/fitness

## 2. ชุดที่แตะ
- โรงแรม (housekeeping ใหม่ · ยืนบน block.ts H.2 / folio.ts H.5) · dorm repair (เส้นพนักงาน) · realtime · settings defs → ชุด: qc-svc-h.6 · h.2 · h.3 · h.5 · d.16 (+ ผู้คุม: h.0 · r0.8 · r0.9 · d.13 · smoke · b.0)
- ไม่มี migration · ไม่แตะ seed

## 3. ผลข้อสอบ (builder — ผู้คุมรันซ้ำเอง)
| ชุด | ผล |
|---|---|
| `qc-svc-h.6 --no-regression` (รอบสุดท้าย · หลัง commit) | 81/95 · failed `["BD-4","U-4"]` (ข้อแย้ง §7 ข้อ 1–2) · SKIP F-1 (หลัง commit) · V-1 (ไม่มี QC_BASE) · G-1..10 (--no-regression) · log `/root/svc-runs/h6/run3.txt` |
| ก่อน commit (run2) | 77/95 · failed BD-4 · U-1 (sds ยังไม่เขียนตอนรัน — แก้แล้ว) · U-4 · F-1 · F-2 · F-3 (ข้อแย้ง §7 ข้อ 3–4) · Q-2 (ฉากรันซ้ำนับค่าตั้งที่เท่าค่าเริ่ม — แก้แล้ว รันซ้ำได้ 0/0/0) |
| `qc-svc-h.2 --no-regression` | 77/87 · failed `["U-7"]` = แท็บแม่บ้าน available:true (คาดไว้ §7 ข้อ 6) |
| `qc-svc-h.3 --no-regression` | 98/109 · failed [] |
| `qc-svc-h.5 --no-regression` | 77/95 · failed [] |
| `qc-svc-d.16 --no-regression` (ซ่อมหอ · ด่าน DORM ค่าเริ่ม) | 76/85 · failed [] |
| tsc (เฉพาะไฟล์ของใบ · `/root/svc-runs/h6/tsconfig.h6.json`) | 0 error |
| fitness (มี env) | 52/53 · ❌ F2.1 เส้น `hotel→dorm` (คำขอ §7 ข้อ 5) |

JSON_SUMMARY h.6: `{"suite":"qc-svc-h.6","total":95,"passed":81,"failed":["BD-4","U-4"],"skipped":["F-1","V-1","G-1","G-2","G-3","G-4","G-5","G-6","G-7","G-8","G-9","G-10"],"findings":["BD-4","U-4","F-1","V-1","G-1","G-2","G-3","G-4","G-5","G-6","G-7","G-8","G-9","G-10"],"byGroup":{"PC":{"total":8,"passed":8,"failed":0,"skipped":0},"SM":{"total":6,"passed":6,"failed":0,"skipped":0},"BD":{"total":8,"passed":7,"failed":1,"skipped":0},"ST":{"total":7,"passed":7,"failed":0,"skipped":0},"WK":{"total":6,"passed":6,"failed":0,"skipped":0},"IN":{"total":4,"passed":4,"failed":0,"skipped":0},"MB":{"total":7,"passed":7,"failed":0,"skipped":0},"DF":{"total":7,"passed":7,"failed":0,"skipped":0},"SO":{"total":3,"passed":3,"failed":0,"skipped":0},"RT":{"total":5,"passed":5,"failed":0,"skipped":0},"B":{"total":5,"passed":5,"failed":0,"skipped":0},"N":{"total":3,"passed":3,"failed":0,"skipped":0},"U":{"total":8,"passed":7,"failed":1,"skipped":0},"F":{"total":3,"passed":2,"failed":0,"skipped":1},"Z":{"total":1,"passed":1,"failed":0,"skipped":0},"Q":{"total":3,"passed":3,"failed":0,"skipped":0},"V":{"total":1,"passed":0,"failed":0,"skipped":1},"G":{"total":10,"passed":0,"failed":0,"skipped":10}}}`

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | check ids |
|---|---|---|
| X1 ขอบเขต | ใช้ | B-1 · B-2 · WK-5 · MB-7 · DF-7 · SO-3 · ST-7 · RT-2 (route ตรวจร้าน/หน่วย/สิทธิ์) |
| X3 พร้อมกัน ≥10 | ใช้ | ST-6 (10 ทาง = log 1 · ล็อกต่อห้อง try-lock+ลองซ้ำ) · ST-3 · SO-2 |
| X4 ส่งซ้ำ | ใช้ | ST-3 (idempotencyKey) · MB-3 (มินิบาร์ต่อห้อง/วัน/รายการ) · N-3 |
| X5 งานตามเวลา | ใช้ (H.7 เรียก) | SO-1/SO-2 — markStayoversDirty ซ้อน 2 ทาง = log 1 |
| X6 ไฟล์ | ใช้ | DF-4 (≤3 รูป · jpeg/png/webp · ≤8MB · ไบต์หัว) |
| X7 endpoint สาธารณะ | N-A | ไม่มีเส้นสาธารณะ (token route ต้องล็อกอิน) |
| X8 PDPA | ใช้ | BD-6 · B-5 · N-2 (payload id/enum/สตางค์ · realtime เฉพาะ {roomId,hkStatus,at}) |
| X9 อันตราย | ใช้ | B-3 (สิทธิ์ 4 ระดับ) · DF-7 (ปิดห้อง ⇔ booking.manage หรือ hk.canBlock) · BLOCK ลง AuditLog (blockRoom) |
| X10 ความลับ/ไฟล์ | ใช้ | DF-2/DF-3 (ไฟล์ private + /api/files) · BD-6 (ไม่มีเบอร์/อีเมลใน DTO) |

## 5. ภาพ
- builder ไม่ build · V-1 SKIP (ไม่มี QC_BASE) — ผู้คุม: seed → h.1 → h.3 --clear → h.2 → h.6 แล้ว `visual-svc h.6 --user maid|hk-lead|owner` (SVC_VIS_H6_ROOM_ID = roomId B203 จาก SCENE_SUMMARY ตอนสร้าง · หรือ `svcqc-unit-hotel-rB203`)

## 6. reviewer
- เบา — ผู้คุมตรวจ (จุดเน้น: ด่าน DORM|HOTEL ไม่ทำหอเปลี่ยน · state machine · มินิบาร์ราคาจากค่าตั้ง)

## 7. ข้อแย้ง oracle / มติทางเทคนิค
1. **BD-4 (ข้อสอบผิดเอง)** — `eq([exp.total, exp.done], [9, 3], "ตัวอ้างอิงเอง")` คำนวณจาก `refCounts` ของข้อสอบเองบนแถวบอร์ด แต่ `roomPlan` (qc-svc-h.6.mts:547) สร้าง **W1 และ W4 เป็น DIRTY ไม่มีการจอง** ⇒ ตามนิยามข้อสอบเอง (`refInWork`: VACANT+DIRTY อยู่ใน total) total = 11 ไม่ใช่ 9 (คอมเมนต์ :543 "W1–W3 ว่างสะอาด" ขัดกับโค้ด :547) · W1/W4 ต้อง DIRTY เพราะ ST-2/ST-3 ใช้ DIRTY→CLEAN · เสนอ ORACLE-EDIT h6-BD4: คาด `[11, 3]` และ `counts {mine 0, total 11, done 3}` (ผลจริงของ builder = 11/3 · mine 0)
2. **U-4 (ข้อสอบจับ import เดิมของ H.2/H.5)** — regex `from "./(block|folio|tape)"` สแกนทั้ง actions.ts ⇒ ชน `import * as hotelFolio from "./folio"` (H.5) และ `./block`·`./tape` (H.2) ที่มีก่อนใบนี้ · บล็อก H.6 import แค่ `./housekeeping` · เสนอ ORACLE-EDIT h6-U4: ตรวจเฉพาะบล็อก `SVC H.6 ▸ … ◂` + บรรทัด import ที่มีคอมเมนต์ `// SVC H.6`
3. **F-1/F-2 (ไฟล์ที่ใบอนุญาตแต่ข้อสอบไม่รู้)** — `src/lib/modules/rooms/index.ts` (+1 บรรทัด re-export `HK_STATUSES` = มติ §9 ข้อ 11 / §1 "ผู้คุมอนุญาต 1 บรรทัด") และ `src/lib/modules/dorm/index.ts` (+2 บรรทัด ส่งออก `createStaffRepair` ตาม §1 "ส่งออกผ่าน dorm facade") ไม่อยู่ใน `OWN`/ข้อยกเว้น F-2 · เสนอ ORACLE-EDIT h6-F12 เพิ่มสองไฟล์
4. **F-3 (ข้อสอบเขียนก่อนมติ §9)** —
   - repair.ts: ข้อสอบให้ทุกบรรทัดที่เพิ่มอ้าง gate แต่มติ §9 ข้อ 6 ให้เพิ่ม `createStaffRepair` ทั้งฟังก์ชันใน repair.ts (+ import rbac + `FORBIDDEN` ใน RepairFailCode) · ลบ 1 บรรทัด (จุดเรียก gate) ตามที่ใบให้
   - defs/rooms.ts ลบ 1: บรรทัด schema #75 เปลี่ยนเป็น union (มติ §9 ข้อ 5 — แก้แบบเพิ่มอย่างเดียวไม่ได้ เพราะ key ซ้ำใน object literal)
   - realtime/events.ts ลบ 1: บรรทัด `SAFE_KEYS` ต่อท้าย `"roomId", "hkStatus"` (ใบ §1 "ใน SAFE_KEYS เฉพาะ {roomId, hkStatus, at}" — const เดียว แก้แบบเพิ่มบรรทัดไม่ได้) · client.ts/index.ts เพิ่มอย่างเดียว (import/export แยกบรรทัด)
   - เสนอ ORACLE-EDIT h6-F3: repair.ts ยอมบล็อก `SVC H.6 ▸ … ◂` · defs/events ยอมลบ 1 บรรทัดที่เป็นบรรทัดเดิมต่อท้าย (ไม่มีคีย์/ค่าเดิมหาย)
   - หมายเหตุ: หลัง commit F-1/F-3 ข้าม/ผ่านเอง (ตรวจ git status ของทรีงาน) — ผู้คุมตรวจ diff แทน
5. **fitness F2.1 — ต้องเพิ่มเส้น `hotel→dorm` ใน ALLOWED_EDGES** — `reportDefect` (REPAIR) เรียก `createStaffRepair` ผ่าน dorm facade (`await import("@/lib/modules/dorm")` · lazy) ตามใบ §0/§1 · builder แก้ fitness ไม่ได้ ⇒ คำขอผู้คุม (ทิศเดียว: dorm ไม่ import hotel)
6. **h.1 U-3/U-4 · h.2 (แท็บ)** — `hotel-tabs-shared` เปิดแท็บแม่บ้าน ⇒ ข้อสอบแท็บของ h.1/h.2 ที่คาด housekeeping `available:false` จะแดงโดยตั้งใจ (builder prompt แจ้งไว้แล้ว · ผู้คุม ORACLE-EDIT) — ดูผล reg ใน §3
7. **นิยาม `upcoming` (มติ §9 ข้อ 3–4)** — ใช้ "ห้องว่างที่ **INSPECTED** และมีจอง CONFIRMED/HOLD เข้าใน 7 วัน" (ป้าย "พร้อมรับ") · ถ้านับห้องว่าง CLEAN ที่มีจองด้วย ⇒ BD-4 แตก (VACC CLEAN มีจอง +3 ต้องไม่อยู่ใน total) และฉาก h.6 แตก (B104/B106/B107/B201/B206/B207 มีจองใน 7 วัน) · คีย์ `upcoming`/`upcomingDate` ส่ง **เฉพาะแถวที่จริง** (BOARD_KEYS ของ BD-1 ไม่มีสองคีย์นี้ — ถ้าผู้คุมจะให้ส่งทุกแถว ต้องเพิ่มใน BOARD_KEYS)
8. **idempotencyKey ชนห้องอื่น ⇒ INVALID_INPUT** — ST-3 ข้อ "คีย์ K กับห้องอื่น" ถ้าทำของตัวเอง W2 จะเป็น DIRTY แล้ว ST-5 (W2 CLEAN→DIRTY) แตก ⇒ เลือก "ปฏิเสธ" (ค้น `note.key` ทั้งหน่วย 30 วัน)
9. **`at` ของ hkStart นอกนาฬิกาฉาก ⇒ INVALID_INPUT** (ไม่เพิกเฉย) — WK-4 คาด "W1 ไม่ได้เริ่ม" หลัง WK-3 เรียก hkStart(W1, at) ไม่มี clock
10. **มินิบาร์กันซ้ำต่อ ห้อง/วัน/รายการ** (ใบ §0) + คีย์ client (ถ้าส่ง) ต่อท้าย ⇒ ไม่ส่งคีย์ = เติมรายการเดิมวันเดียวกันซ้ำไม่ได้ (จอส่ง idempotencyKey ทุกครั้งจึงเติมรอบสองได้) · item ที่มีคีย์เกิน `{key,qty}` ⇒ INVALID_INPUT (ราคาจาก client ไม่รับ)
11. **ความพร้อมกัน** — `rooms.setHkStatus` เปิด connection ของตัวเอง ⇒ ถ้าผู้รอจอด connection บน `pg_advisory_xact_lock` pool (10) จะหมดจนผู้ถือล็อกเรียก setHkStatus ไม่ได้ ⇒ ใช้ `pg_try_advisory_xact_lock` + ปล่อย tx แล้วลองใหม่ (25–85 ms · ≤120 รอบ) · ลำดับใน tx: log + outbox → setHkStatus → hkNote/hkUpdatedAt (ล้ม ⇒ ย้อน log) · ช่องว่างเหลือ: commit ล้มหลัง setHkStatus (หนี้แกนห้อง: setHkStatus รับ tx ไม่ได้ — เดียวกับ m6 ของ H.2)
12. **night audit + หนี้ H.2** — `syncBlockedRooms` (เรียกใน markStayoversDirty ด้วย): BLOCK ถึงวัน ⇒ OUT_OF_ORDER · BLOCK หมดช่วงภายใน 7 วันและไม่มีปิดอื่นครอบ ⇒ DIRTY · ฉาก h.6 เรียกด้วย (B103)

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| คิวหน้าเคาน์เตอร์ "มินิบาร์ค้างเก็บ" (เรียกเก็บ/ยกให้) | ใบนี้บันทึก event + log PENDING เท่านั้น (ไม่มีตาราง) | H.7 / H.4 |
| มินิบาร์รูป `{productId}` (สินค้า POS) ยังไม่แสดงบนมือถือ | ต้องอ่านชื่อ/ราคาจาก POS (Q7 ใบหลัง) | ใบมินิบาร์ POS |
| ใบซ่อมของโรงแรม: ลิงก์ในการ์ดบอร์ดงานชี้ `/dorm/repairs/<id>` บน slug โรงแรม · ซ่อมเสร็จ ⇒ `onRepairDone` ส่ง LINE ผู้เช่า (ไม่มีสัญญา = ไม่ส่ง) | ใช้ระบบซ่อมของหอตามใบ (ห้ามเขียนใหม่) | ใบหน้าช่างโรงแรม |
| ทะเบียนค่าตั้ง #75 ไม่มี `tableTh` (ตัวแก้ตารางใช้แบบดิบ) | ไม่อยู่ในขอบเขตจอ | H.7/ตั้งค่าโรงแรม |
| ~~commit ล้มหลัง setHkStatus~~ ปิดแล้วรอบ 2 (setHkStatus รับ tx) | — | — |
| race blockRoom ↔ transition ห้องเดียวกัน (m2) | blockRoom ไม่ถือล็อกห้องของแม่บ้าน | H.9 |
| ฉาก h.6 เช็กเอาต์ B203-out ย้อนไม่ได้ (บิล POS จริง) | --clear ฉาก h.2 ลบแถวการจองเอง (cascade folio) | — |
| มอบหมายรายคนโดยหัวหน้า · รายงานเวลาเฉลี่ย | ใบ §0 "ไม่ทำ" | H.7 |

## 9. สิ่งที่ H.7 ต้องรู้
- night audit เรียก `markStayoversDirty(ctx, {unitId, businessDate})` (คืน `{changed, toOoo, toDirty}`) — ซิงก์ปิดห้องในตัว · idempotent
- รายงานแม่บ้าน: `HotelHousekeepingLog.note` = JSON — finish `{checklist:[{key,done}], durationSec, startedBy?, minibar?, key?}` · inspect `{inspect:"PASS"|"FAIL", note?}` · defect `{defect:"REPAIR"|"BLOCK", text, repairId|blockId}` · มินิบาร์ค้าง `{minibar:{unbilled:true,status:"PENDING",items,amountSatang}}` · night audit `{note:"night audit …"}` · `hkLogs(ctx,{unitId|roomId, from, to, userId?})`
- event `hotel.hk.minibar_unbilled {roomId, items, amountSatang}` = รายการคิวหน้าเคาน์เตอร์

## 10. คืนสภาพ qc-svc
- ข้อสอบล้างร้าน `svc-h6-*` เอง (Z-1) · ฉาก h.6 `--clear` คืน hkNote/คำขอแขก/ค่าตั้ง/มินิบาร์ (void)/สถานะห้องฉาก · การเช็กเอาต์ B203-out ไม่ย้อน

## 11. รอบ 2 (หลังผู้ตรวจรอบ 1 · มติผู้คุม §10 ใบ h.6)
- **M1 pool หมด** — `rooms/service.ts` `setHkStatus(ctx, input, opts?: { tx })` (ยกเว้น §1 แคบ ๆ · diff **เพิ่มอย่างเดียว** +32/−0: overload + `setHkStatusInTx` · ไม่ส่ง tx = ทางเดิมทุกไบต์) · `housekeeping.transition` ส่ง tx ของ withLock ⇒ log + outbox + สถานะห้อง + hkNote อยู่ใน tx เดียว 1 connection ต่อ op (ข้อสอบ ST-8 12 ห้องพร้อมกัน) · ไม่ใช้ semaphore
- **M2 มินิบาร์ทั้งชุด** — ตรวจทั้งชุดก่อนโพสต์: คีย์ในค่าตั้ง · qty 1–20 · ราคาต่อหน่วยและ qty×ราคา ≤ `rooms.hotel.folio.manualItemMaxSatang` · folio ของแขกที่พักอยู่ต้อง OPEN (ไม่ OPEN ⇒ ค้างเก็บ) ⇒ ไม่ผ่านรายการเดียว = INVALID_INPUT ทั้งชุด · ของฟรี (ราคา 0) ไม่ลง folio/ไม่นับ posted แต่อยู่ใน `items` ของสรุปและ log ของ hkFinish · ค้างเก็บไม่รวมของฟรี · postFolioItem ยังเปิด tx ของตัวเอง (folio.ts ห้ามแตะ) — กันเงินซ้ำด้วย dup-check ต่อห้อง/วัน/คีย์ใต้ล็อก `minibar:<room>`
- m1 conflicts ส่งชื่อแรกเท่านั้น · m3 action ตัดที่รูปที่ 4 ("แนบรูปได้ไม่เกิน 3 รูป" INVALID_INPUT) และขนาด > 8 MB = INVALID_FILE ตรงด่าน · m4 คิวออฟไลน์เข้าคิวเฉพาะ error เครือข่าย (`isNetworkError`: TypeError · AbortError · Failed to fetch/NetworkError/Load failed) — error อื่นแสดงทันที · รายการค้างที่เซิร์ฟเวอร์ตอบผิดพลาดถูกทิ้งพร้อมแจ้ง
- **หนี้ H.9 (m2)**: race `blockRoom` (H.2) ↔ transition ห้องเดียวกัน — blockRoom ไม่ถือล็อก `hotel.hk:room` ⇒ ช่องแคบที่ hkStatus/log สลับลำดับได้ · syncBlockedRooms ตอน night audit แก้สถานะให้
- m5 หัวหน้ากด INSPECTED บนห้องมีแขก = รับได้ (ตรวจหลังทำห้องระหว่างพัก) ไม่แก้
