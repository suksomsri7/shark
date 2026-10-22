// QC — POS RUN ใบ P3.8 (S): บอร์ดงาน + ห้องทีม — การ์ดจากเหตุการณ์ POS (ปิดกะเงินขาด/เกิน · 86 นาน · refund_needed · จุดผิดปกติแบบกดเอง) +
//   โพสต์ปิดกะ/สรุปเช้าในห้องทีม (C-12) · เขียนก่อนสร้าง (fail-before) · ผู้สร้าง (builder) P3.8 S · ฐาน session/pos 72669941
// requires: (ไม่ต้อง seed — ร้านชั่วคราวของข้อสอบเอง `posqc-p38-<rand>` + `-t2` · ระบบ KANBAN/MEETING ของตัวเอง · ห้าม seed-kanban*)
//
// สัญญา: ledger/pos-briefs/pos-brief-P3.8.md ⚠️1–8 · §0 · §1 · §2 R1–R11 · §4 · §5 · **§10 มติผู้คุมงาน 1–11 (ผูกมัด)** ·
//   ตารางชื่อเต็ม + drift + ORACLE-EDIT + CONTROLLER-DECISION = ledger/wo-notes/pos-P3.8-oracle.md
//
// ชื่อที่ข้อสอบนี้ตั้ง (ผู้สร้างต้องทำให้มีจริง):
//   src/lib/pos-board-bridges.ts (composition root · import ได้เฉพาะ kanban/{links,moves,integrations,members,templates,notify,types,access} ·
//     @/lib/modules/meeting (index) · facade/ตัวอ่านของ pos · prisma อ่านอย่างเดียว) export:
//     onShiftClosed(evt)                         — consumer ของ pos.shift.closed (การ์ดตรวจเงิน R4 + โพสต์ Z R7) · idempotent
//     sweepPosBoard({now, deadline?, tenantId?}) — ตัวกวาดรายชั่วโมง (86 นาน R5 · 86 หาย = ปิดการ์ด · refund_needed R6 · สรุปเช้า R8) · tenantId = กรองร้าน (ข้อสอบส่งเสมอ)
//     createAnomalyCard(ctx{tenantId, systemId}, actor: RegisterActor, {unitId, rule, businessDate, refType, refId}) → {ok:true, created, cardNo, cardId?} | {ok:false, code}
//     posCardsForKeys(tenantId, keys[]) → [{key, cardNo, href (= kanban cardLink), completed}]
//     savePosBoardSettings(ctx{tenantId, systemId}, actor, {board?, teamRoom?}) → {ok:true} | {ok:false, code PERMISSION_DENIED|VALIDATION|…} (OWNER เท่านั้น · audit pos.settings.updated)
//   src/lib/pos-board-actions.ts ("use server" · async ล้วน): createAnomalyCardAction · savePosBoardSettingsAction
//   src/lib/modules/pos/board-settings-shared.ts (บริสุทธิ์ · ไม่มี prisma/db): posBoardSettings(settings) · posTeamRoomSettings(settings) (อ่าน settings.pos.board / .teamRoom
//     ทั้งก้อน AppSystem.settings · คีย์แปลกถูกทิ้ง · เลขนอกช่วงถูกตัดขอบ · ไม่ใช่จำนวนเต็ม = ค่าปริยาย) · src/lib/modules/pos/board-settings.ts (ผู้เขียนใน pos)
//   กุญแจการ์ด (KanbanCard.sourceKey): pos-shift:<shiftId> · pos-86:<unitId>:<productId>:<markId> · pos-refund:<orderId> · pos-anomaly:<rule>:<unitId>:<businessDate>:<refId|userId>
//   กันโพสต์ซ้ำในห้อง: AuditLog {action "pos.teamroom.posted", targetType "PosTeamRoomPost", targetId <key>, actorType SYSTEM} ·
//     key = pos-room:z:<shiftId> · pos-room:brief:<posSystemId>:<channelId>:<businessDate> · ผู้เขียนข้อความ = "system:pos"
//   ops WARN source "pos.board" (บอร์ด/ห้องใช้ไม่ได้) ครั้งเดียวต่อ (ระบบ, กฎ, วัน)
//   outbox-consumers.ts: "pos.shift.closed" = บรรทัดเดียวมีเครื่องหมาย P3.8 → withAutomation(… pos-board-bridges … onShiftClosed …)
//   cron/hourly/route.ts: บล็อก `// POS P3.8 ▸ … ◂` เรียก sweepPosBoard · pos-integrations.ts KANBAN facts stockOutShiftDiffCard/shiftCloseCashCheck = true null
//
// ข้อความ (th · settings.pos.receiptLocale ปริยาย th) — ตัวเลขบาท = ฿ + en-US หลักพัน + ทศนิยมเท่าที่มี (สูตร baht() ของ kanban-bridges: 15000 → "฿150")
//   การ์ดกะ:   `ตรวจเงินกะ Z#<n> · <ชื่อสาขา> · <deviceLabel> · <ขาด|เกิน|ตรงยอด> ฿<|overShort|>` · บังคับปิด: ขึ้นต้น `กะถูกบังคับปิด Z#<n>` + มี "ยังไม่ได้นับเงิน"
//              ลิงก์ URL ลงท้าย `/app/sys/<posSystemId>/pos/shifts?shift=<shiftId>` ป้าย `กะ Z#<n>` · dueAt = 12:00 ของวันไทยถัดไป · createdById null · sourceType AUTOMATION
//   การ์ด 86:  `สินค้าหมดนานเกิน <h> ชม.: <ชื่อสินค้า> · <ชื่อสาขา>` · กลับมาขาย = ย้ายเข้าคอลัมน์เสร็จ (ไม่มีคอลัมน์เสร็จ = ความเห็น "กลับมาขายแล้ว" ครั้งเดียว)
//   การ์ดคืนเงิน: `คืนเงินลูกค้า: ออเดอร์ <code> ฿<amount>` + สาเหตุ (rejected_prepaid ปฏิเสธหลังจ่าย · expired_paid จ่ายแล้วไม่มีคนรับ · late_payment เงินเข้าหลังยกเลิก) ·
//              ลิงก์ URL ลงท้าย `/app/sys/<posSystemId>/pos/orders?id=<orderId>`
//   การ์ดจุดผิดปกติ: ขึ้นต้น `ตรวจจุดผิดปกติ <ป้ายกฎ> · <ชื่อสาขา> · <businessDate>` · รายละเอียดมี "ดูรายละเอียดในรายงานจุดผิดปกติ (ต้องมีสิทธิ์)"
//   โพสต์ Z:   `ปิดกะ Z#<n> · <ชื่อสาขา> · <deviceLabel> · ขาย ฿<sales> (<bills> บิล) · เงินสด <ขาด|เกิน> ฿<x>` (ส่วนท้ายเฉพาะ showOverShort และ overShort ≠ 0)
//
// 🔴 กติกาข้อสอบ: SKIP เมื่อ pos-board-bridges.ts / board-settings-shared.ts ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต ST1–ST3 แบบอ่านไฟล์ (ไม่โหลด prisma)
//    ฐาน = QC4 เท่านั้น · ร้านชั่วคราวลบทั้งร้านใน finally · globalThis.fetch = ตัวกั้น (503 + นับ) · ไม่มี LINE/อีเมล/push จริง
//    consumer ถูกเรียก "ตัวที่ลงทะเบียนจริง" (consumers["pos.shift.closed"] ของ outbox-consumers) กับแถว OutboxEvent จริงของร้านชั่วคราว ·
//    อีเวนต์ปิดกะถูก "จอด" เป็น DONE ทันทีหลังปิด (ตัวระบายพื้นหลังไม่หยิบตอนค่าตั้งเปลี่ยน) · SD2/SD7 คืนเป็น PENDING แล้ว drainAll (คิวจริง) ต้องจบ DONE
//    SQL ดิบเฉพาะแถวของร้านชั่วคราว: เลื่อน openedAt ของกะ (บังคับปิด) · markedAt ของ 86 · ใส่ออเดอร์ + PosOrderEvent refund_needed (รูปเดียวกับ order.ts addRefundNeededInTx)
//    R8 (สรุปเช้าในห้อง) = ส่วนหนึ่งของ RM5 — SKIP พร้อมเหตุผลจนกว่า pos/ai-brief-shared.ts (P3.9 S) จะมี (มติ 4)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p3.8";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";
// หมุดของ brief = 72669941 (BRIEF_PIN — หมายเหตุเท่านั้น) · ST เทียบกับหมุดคงที่ BASE ด้านล่าง · ตั้งเองได้ P38_PIN=<rev> // ORACLE-EDIT ผู้คุม POS 17 ต.ค. (P3.8 CD-P38-B2)

// ═════════════════════════ ทะเบียนข้อสอบ ═════════════════════════
// X-group: C ค่าตั้ง · K การ์ด · R ห้องทีม · A จุดผิดปกติ · V ความเป็นส่วนตัว · X ข้ามร้าน · F facts · S สถิต · Z คืนสภาพ
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P3.8-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── CF ค่าตั้ง ──
  D("CF1", "C", "[R2 มติ 3] ค่าปริยาย (ปิดหมด): ปิดกะขาด ฿500 (consumer ×2) + 86 นาน 10 ชม. + refund_needed + sweep ×2 ⇒ การ์ด 0 · MeetingMessage 0 · ธง pos.teamroom.posted 0 · ops pos.board 0 · consumer/sweep ไม่ throw"),
  D("CF2", "C", "[R2] posBoardSettings/posTeamRoomSettings: ค่าปริยายตรงตาราง (ทุกกฎปิด) · คีย์แปลกถูกทิ้ง · ตัดขอบ minAbsSatang 0–10,000,000 · hours 1–168 · briefHourBkk 0–23 · ไม่ใช่จำนวนเต็ม = ปริยาย · boardByUnit ≤ 200 · enabled ต้องเป็น true จริง"),
  D("CF3", "C", "[R2 มติ 2] savePosBoardSettings: MANAGER ⇒ PERMISSION_DENIED · OWNER ✓ + audit pos.settings.updated + อ่านกลับตรง (enabledByUserId = เจ้าของ) · VALIDATION: บอร์ดร้าน T2 · บอร์ดถูกเก็บ · ห้อง PRIVATE ที่เจ้าของไม่อยู่ · สาขาร้านอื่นใน boardByUnit · คีย์แปลก — ปฏิเสธแล้วค่าเดิมไม่เปลี่ยน"),
  // ── SD ปิดกะ → การ์ดตรวจเงิน ──
  D("SD1", "K", "[R3 R4 มติ 5] ขาด ฿150 ⇒ การ์ด 1 ใบบนบอร์ดปริยาย A: ชื่อตรงตัว · sourceKey pos-shift:<id> · AUTOMATION · createdById null · คอลัมน์แรก · ผู้รับ = ผู้จัดการสาขา A · ลิงก์ URL กะ · dueAt 12:00 วันไทยถัดไป · รายละเอียดมียอดคาด/นับ/ขาด/บิล/ยอดขาย"),
  D("SD2", "K", "[R10 COMMON-4] เล่น consumer ซ้ำ ×2 + พร้อมกัน ×2 + เล่นผ่านคิวจริง (PENDING → drainAll → DONE) ⇒ ยัง 1 ใบ (CARD_CREATED 1 · ผู้รับ 1 · ลิงก์ 1)"),
  D("SD3", "K", "[R4] ขาด ฿50 (< minAbsSatang ฿100) ⇒ ไม่มีการ์ด"),
  D("SD4", "K", "[R4] everyClose ⇒ กะตรงยอด (฿0) มีการ์ด ชื่อ `… · ตรงยอด ฿0`"),
  D("SD5", "K", "[R4] บังคับปิดโดย cron (forceCloseStaleShifts · counted null · forced) ⇒ การ์ด `กะถูกบังคับปิด Z#n … ยังไม่ได้นับเงิน`"),
  D("SD6", "K", "[R3] สาขา B ผูกบอร์ด B ⇒ การ์ดบนบอร์ด B ผู้รับ = ผู้จัดการสาขา B · สาขา A (ไม่ผูก) ⇒ บอร์ดปริยาย A"),
  D("SD7", "K", "[R2 R10] บอร์ดปลายทางถูกเก็บ ⇒ consumer ไม่ throw + เล่นผ่านคิวจริงจบ DONE (ไม่ retry) · ไม่มีการ์ด · ops WARN pos.board +1 ครั้งเดียว"),
  // ── SO 86 ──
  D("SO1", "K", "[R5] 86 (MANUAL) นาน 5 ชม. ⇒ sweep ×2 = การ์ด 1 ใบ กุญแจ pos-86:<unit>:<product>:<markId> · ชื่อตรงตัว · บอร์ด A"),
  D("SO2", "K", "[R5] 86 นาน 1 ชม. (< 4) ⇒ ไม่มีการ์ด"),
  D("SO3", "K", "[R5] คืนขาย ⇒ sweep ย้ายการ์ดเข้าคอลัมน์เสร็จ (completedAt · กิจกรรม actorUserId null) · บอร์ด C ไม่มีคอลัมน์เสร็จ ⇒ ความเห็น \"กลับมาขายแล้ว\" ครั้งเดียว (sweep ×2) การ์ดอยู่ที่เดิม"),
  D("SO4", "K", "[R5] 86 ซ้ำ (mark ใหม่) ⇒ การ์ดใบใหม่ (markId ใหม่) · ใบเดิมยังอยู่คอลัมน์เสร็จ"),
  // ── RF refund_needed ──
  D("RF1", "K", "[R6 ⚠️3] refund_needed 3 สาเหตุ (rejected_prepaid · expired_paid · late_payment ไม่มี outbox) ⇒ การ์ดละ 1 ใบ ชื่อ/สาเหตุ/ลิงก์ตรง · ออเดอร์สาขา B ⇒ บอร์ด B · แถวเก่า 8 วัน ⇒ ไม่มีการ์ด"),
  D("RF2", "K", "[R6] sweep ซ้ำ ×2 ⇒ การ์ดชุดเดิม (ไม่เพิ่ม)"),
  D("RF3", "V", "[R6 มติ 10] การ์ดคืนเงิน: ไม่มีชื่อ/เบอร์ลูกค้าของฟิกซ์เจอร์ ในชื่อ · รายละเอียด · ป้าย/ปลายลิงก์"),
  // ── RM ห้องทีม ──
  D("RM1", "R", "[R7 มติ 6] โพสต์ Z ครั้งเดียวในห้องปริยาย: ผู้เขียน system:pos · ข้อความตรงตัว (ยอดขาย/บิลจาก Z) · ธง AuditLog pos.teamroom.posted (PosTeamRoomPost · pos-room:z:<id> · SYSTEM) 1 · การ์ดกะยังเกิด"),
  D("RM2", "R", "[R7] consumer ซ้ำ ×2 + พร้อมกัน ×2 ⇒ ข้อความ 1 · ธง 1"),
  D("RM3", "R", "[R7 มติ 6] showOverShort false ⇒ ข้อความไม่มี \"เงินสด\"/ขาด/เกิน/ยอดขาด"),
  D("RM4", "R", "[R7] ห้องถูกเก็บถาวร ⇒ ไม่มีข้อความ · ไม่มีธง (rollback) · consumer ไม่ throw ×2 · ops WARN pos.board +1"),
  D("RM5", "R", "[R7 R8 มติ 4] posts.shiftClose ปิด ⇒ การ์ดอย่างเดียว ไม่มีข้อความ · R8 สรุปเช้า (เมื่อ P3.9 มี ai-brief-shared): ก่อนเวลา 0 · catch-up 10:00 = 1 · ซ้ำ = 1 · ไม่มีบรรทัดจุดผิดปกติ/ขาดเกิน/อนุมัติ · ผู้เปิดไม่ใช่ OWNER แล้ว ⇒ ข้าม (ยังไม่มี = SKIP-with-reason)"),
  // ── AN จุดผิดปกติ → การ์ด (กดเอง) ──
  D("AN1", "A", "[R9 มติ 5] OWNER: แถว A8 ของกะ (จาก reportAnomalies) ⇒ การ์ด createdById = เจ้าของ · กุญแจ pos-anomaly:A8:<unit>:<date>:<shiftId> · ชื่อขึ้นต้นตรง · กดซ้ำ {ok, created:false, cardNo เดิม} · refId ที่ไม่มีในรายงาน ⇒ ปฏิเสธ ไม่มีการ์ด"),
  D("AN2", "A", "[R9] แคชเชียร์ (pos.report.view ไม่มี pos.report.anomaly) ⇒ PERMISSION_DENIED ไม่มีการ์ด"),
  D("AN3", "A", "[R9] ผู้ดูบอร์ด A แบบ VIEWER ⇒ PERMISSION_DENIED · ตัวควบคุมบวก: EDITOR บอร์ด B ⇒ การ์ดสาขา B · ชื่อ/รายละเอียดไม่มีชื่อพนักงาน · posCardsForKeys คืน cardNo/href(cardLink)/completed · กุญแจที่ไม่มี = ไม่อยู่ในผล"),
  // ── PV ความเป็นส่วนตัว ──
  D("PV1", "V", "[มติ 10 PDPA] ทุกชื่อ/รายละเอียดการ์ด · ป้ายลิงก์ · ความเห็น · ข้อความห้องของร้านในรอบนี้: ไม่มีรูปเบอร์โทร · ชื่อพนักงาน/ลูกค้าของฟิกซ์เจอร์ · tip/ทิป/commission/ค่าคอม/payroll/salary/เงินเดือน (ตัวตรวจจับของปลอมได้ — ตัวควบคุมบวก)"),
  // ── X ข้ามร้าน ──
  D("X1", "X", "[R3] ฉีด id บอร์ดร้าน T2 ดิบ ๆ ลงค่าตั้ง T1 ⇒ ปิดกะ T1 ไม่เกิดการ์ดใด ๆ (บอร์ด T2 จำนวนการ์ดเท่าเดิม)"),
  D("X2", "X", "[R1 R3] ร้าน T2 เปิดของตัวเอง: กะ T2 ⇒ การ์ดบอร์ด T2 + ข้อความห้อง T2 · การ์ด/ข้อความ/ธงของ T1 เท่าเดิม · sweep(T2) ไม่แตะ T1 · sweep(T1) ไม่แตะ T2"),
  // ── FC facts ──
  D("FC1", "F", "[R11 มติ 9] posIntegrationCards: KANBAN facts stockOutShiftDiffCard/shiftCloseCashCheck live true phase null · LINKED เพราะ settings.pos.board (ไม่มีบอร์ดใบเสร็จ/กฎ void) · ปิด board.enabled ⇒ OFF (ทาง OFF ของ p1.18 I7 เดิม)"),
  // ── ST สถิต ──
  D("ST1", "S", "[R1 มติ 9] ขอบเขต: modules/pos/** ไม่ import kanban/meeting · fitness ไม่มีเส้น pos→kanban/pos→meeting · pos-board-bridges export ครบ + import kanban เฉพาะ links/moves/integrations/members/templates/notify/types/access + meeting (index) เท่านั้น · ไม่เขียน prisma.kanban*/meeting* ตรง · actions \"use server\" async ล้วน · board-settings-shared บริสุทธิ์ · board-settings.ts มี"),
  D("ST2", "S", "[R10 มติ 7] outbox-consumers.ts: บรรทัด \"pos.shift.closed\" เดียว มีเครื่องหมาย P3.8 → withAutomation + pos-board-bridges + onShiftClosed · diff เทียบฐาน = +1/−1 บรรทัดนั้นเท่านั้น · \"pos.shift.opened\" เท่าฐาน · cron hourly มีบล็อก `POS P3.8 ▸ … ◂` เรียก sweepPosBoard (เพิ่มอย่างเดียว)"),
  D("ST3", "S", "[§3 Hard rules] ไม่มี diff เทียบฐาน: prisma/ (+ ไม่มีไฟล์ใหม่) · pos/register*.ts service.ts shift.ts order.ts catalog.ts receipt*.ts · modules/kanban/** · modules/meeting/** · lib/automation/** · platform/kanban-bridges.ts · pos-receipt-bridges.ts"),
  // ── Z คืนสภาพ ──
  D("Z1", "Z", "QC4 คืนสภาพ: ร้านชั่วคราว 2 ร้าน 0 แถวทุกตารางที่มี tenantId (การ์ด/กิจกรรม/ความเห็น/ลิงก์/ผู้รับ · MeetingMessage · AuditLog · OutboxEvent · OpsEvent · PosShift/Mark/Order*) · Tenant ถูกลบ · User 0"),
  D("Z2", "Z", "QC4 ลายนิ้วมือ: แถวของร้านที่ไม่ใช่ชั่วคราว (KanbanCard · KanbanComment · MeetingMessage · PosShift · PosAvailabilityMark · PosOrderEvent) ก่อน = หลัง"),
];

if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} ข้อ (id · X · หัวข้อ)`);
  for (const [id, x, t] of CHECKS) console.log(`${id}\t${x}\t${t}`);
  const byX = new Map<string, number>();
  for (const [, x] of CHECKS) byX.set(x, (byX.get(x) ?? 0) + 1);
  console.log(`X-coverage: ${[...byX.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  process.exit(0);
}

// ═════════════════════════ ตัวช่วยทั่วไป ═════════════════════════
const TITLE = new Map(CHECKS.map(([id, , t]) => [id, t]));
const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const full = id.startsWith("P3.8-") ? id : `P3.8-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
const rd = (p: string) => {
  const abs = p.startsWith("/") ? p : join(ROOT, p);
  return existsSync(abs) ? readFileSync(abs, "utf8") : "";
};
const short = (v: unknown, n = 160) => {
  let s: string;
  try {
    s = typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    s = String(v);
  }
  return (s ?? "undefined").slice(0, n);
};
const joinP = (p: string[], ok = "ครบ") => p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || ok;
const isRecord = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);
/** JSON แบบเรียงคีย์ (เทียบวัตถุโดยไม่สนลำดับคีย์) */
const C = (v: unknown): string => {
  const norm = (x: unknown): unknown => (Array.isArray(x) ? x.map(norm) : isRecord(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, norm(x[k])])) : x);
  return JSON.stringify(norm(v));
};
function walk(dir: string, out: string[] = [], re = /\.(tsx|ts)$/): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const f of readdirSync(abs)) {
    const rel = `${dir}/${f}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out, re);
    else if (re.test(f)) out.push(rel);
  }
  return out;
}
const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const srcOf = (f: string) => stripComments(rd(f));
function gitStr(args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 }).toString("utf8");
  } catch {
    return null;
  }
}
const exportsName = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?(function|const|let)\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(src);
/** ฿ + en-US หลักพัน + ทศนิยมเท่าที่มี (สูตรเดียวกับ kanban-bridges baht()) */
const baht = (satang: number) => `฿${(satang / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

const POS_DIR = "src/lib/modules/pos";
const F = {
  bridges: "src/lib/pos-board-bridges.ts",
  actions: "src/lib/pos-board-actions.ts",
  shared: `${POS_DIR}/board-settings-shared.ts`,
  writer: `${POS_DIR}/board-settings.ts`,
  outbox: "src/lib/outbox-consumers.ts",
  cron: "src/app/api/cron/hourly/route.ts",
  fitness: "scripts/fitness.mts",
  briefShared: `${POS_DIR}/ai-brief-shared.ts`,
};
const BRIDGE_EXPORTS = ["onShiftClosed", "sweepPosBoard", "createAnomalyCard", "posCardsForKeys", "savePosBoardSettings"];
const ACTION_EXPORTS = ["createAnomalyCardAction", "savePosBoardSettingsAction"];
const KANBAN_ALLOWED = ["links", "moves", "integrations", "members", "templates", "notify", "types", "access"];
const STATIC_IDS = ["ST1", "ST2", "ST3"].map((x) => `P3.8-${x}`);
const skipReasons: string[] = [];
for (const f of [F.bridges, F.shared]) if (!existsSync(join(ROOT, f))) skipReasons.push(`${f} ยังไม่มี`);
/** R8 ทำงานเมื่อ P3.9 S มี ai-brief-shared.ts **และ** สะพานต่อสาย (อ้าง ai-brief) — P3.9 merge ทีหลัง P3.8 จะไม่ทำให้ RM5 แดงเอง (R8 = P3.8b · มติ 4) */
const BRIEF_FILE = existsSync(join(ROOT, F.briefShared));
const BRIEF_WIRED = /ai-brief/.test(stripComments(rd(F.bridges)));
const BRIEF_READY = (BRIEF_FILE && BRIEF_WIRED) || process.env.P38_R8 === "1";

/** ฐานเทียบ: P38_PIN > หมุดคงที่ 42b823e9 (ฐานของผู้สร้าง) · หมุดของ brief (BRIEF_PIN 72669941) เก็บไว้เป็นหมายเหตุเท่านั้น */
const BASE = process.env.P38_PIN || "42b823e9"; // ORACLE-EDIT ผู้คุม POS 17 ต.ค. (P3.8 CD-P38-B2): หมุดคงที่ — เดิม P38_PIN › หมุดจากสาขา session › BRIEF_PIN (qc-pos-p2.14 K3)
// ORACLE-EDIT ผู้คุม B 22.10 (CD-P312-W21 · W21 default re-base · old: ไม่มี LANE_PIN — ST2/ST3 เทียบ BASE อย่างเดียว · revert: env P38_LANE_PIN=42b823e9 or remove LANE_PIN + firstOk):
//   ST2/ST3 เทียบ BASE ก่อน · มีปัญหา ⇒ เทียบ LANE_PIN ซ้ำด้วยกฎเดิมทุกข้อ · ผ่านเมื่อฐานใดฐานหนึ่งสะอาด (แบบ firstOk ของ qc-pos-p3.4) · ไม่ผ่านทั้งคู่ = รายงานปัญหาเทียบ BASE
const LANE_PIN = process.env.P38_LANE_PIN || "137aa93a";
//   probe 22.10: บรรทัดไม่ marked ท้าย outbox-consumers.ts → ST2 แดง (+29/−10) · คอมเมนต์ท้าย prisma/schema/pos.prisma → ST3 แดง (wo-notes/pos-P3.12.md §probe)

// ═════════════════════════ 1. ข้อสถิต ═════════════════════════
const stNotes: Record<string, string[]> = {};
function runStatic(): void {
  console.log(`\n── ST ข้อสถิต (ไม่แตะ DB · ฐาน ${BASE}) ──`);
  // ST1 ขอบเขต
  {
    const p: string[] = [];
    for (const f of walk(POS_DIR)) {
      const c = srcOf(f);
      if (/["']@\/lib\/modules\/kanban(\/|["'])/.test(c)) p.push(`${f.replace(`${POS_DIR}/`, "pos/")} → kanban`);
      if (/["']@\/lib\/modules\/meeting(\/|["'])/.test(c)) p.push(`${f.replace(`${POS_DIR}/`, "pos/")} → meeting`);
      if (/["']@\/lib\/pos-board-(bridges|actions)["']/.test(c)) p.push(`${f.replace(`${POS_DIR}/`, "pos/")} → pos-board-* (ทิศกลับ)`);
    }
    const fit = rd(F.fitness);
    if (!fit) p.push("ไม่มี scripts/fitness.mts");
    else for (const e of ["pos→kanban", "pos→meeting"]) if (fit.includes(`"${e}"`)) p.push(`fitness มีเส้น ${e}`);
    const braw = rd(F.bridges);
    if (!braw) p.push(`ไม่มี ${F.bridges}`);
    else {
      const b = stripComments(braw);
      for (const n of BRIDGE_EXPORTS) if (!exportsName(b, n)) p.push(`bridges ไม่ export ${n}`);
      for (const m of b.matchAll(/["']@\/lib\/modules\/kanban(?:\/([\w-]+))?["']/g)) {
        const sub = m[1] ?? "";
        if (!KANBAN_ALLOWED.includes(sub)) p.push(`bridges import kanban/${sub || "(index)"}`);
      }
      for (const m of b.matchAll(/["']@\/lib\/modules\/meeting(\/[\w-]+)?["']/g)) if (m[1]) p.push(`bridges import meeting${m[1]} (ต้องผ่าน index)`);
      if (/\b(prisma|tx|db)\s*\.\s*(kanban\w*|meeting\w*)\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/.test(b)) p.push("bridges เขียน prisma.kanban*/meeting* ตรง");
      if (/\$executeRaw[\s\S]{0,200}"(Kanban|Meeting)\w*"/.test(b)) p.push("bridges เขียน SQL ดิบลงตาราง Kanban*/Meeting*");
    }
    const araw = rd(F.actions);
    if (!araw) p.push(`ไม่มี ${F.actions}`);
    else {
      const a = stripComments(araw).trimStart();
      if (!/^["']use server["']/.test(a)) p.push("actions ไม่ขึ้นต้น \"use server\"");
      for (const n of ACTION_EXPORTS) if (!new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(a)) p.push(`actions ไม่มี export async function ${n}`);
      if (/export\s+(const|let|type|interface|class|default|\{)/.test(a) || /export\s+function\s/.test(a)) p.push("actions export ที่ไม่ใช่ async function");
    }
    const sraw = rd(F.shared);
    if (!sraw) p.push(`ไม่มี ${F.shared}`);
    else {
      const s = stripComments(sraw);
      for (const n of ["posBoardSettings", "posTeamRoomSettings"]) if (!exportsName(s, n)) p.push(`board-settings-shared ไม่ export ${n}`);
      if (/["']@\/lib\/core\/db["']|@prisma\/client|PrismaClient/.test(s)) p.push("board-settings-shared แตะ prisma/db (ต้องบริสุทธิ์)");
    }
    if (!existsSync(join(ROOT, F.writer))) p.push(`ไม่มี ${F.writer}`);
    stNotes.ST1 = p;
  }
  // ST2 การลงทะเบียน consumer + cron
  const st2 = (BASE: string): string[] => { // ORACLE-EDIT ผู้คุม B 22.10 (CD-P312-W21 · W21 default re-base · old: บล็อก { … stNotes.ST2 = p } เทียบ BASE ส่วนกลาง)
    const p: string[] = [];
    const now = rd(F.outbox);
    const lines = now.split("\n");
    const closed = lines.filter((l) => /"pos\.shift\.closed"\s*:/.test(l));
    if (closed.length !== 1) p.push(`บรรทัด "pos.shift.closed" ${closed.length} บรรทัด`);
    else {
      const l = closed[0]!;
      if (!/withAutomation\s*\(/.test(l)) p.push("pos.shift.closed ไม่ห่อ withAutomation");
      if (!/pos-board-bridges/.test(l) || !/onShiftClosed/.test(l)) p.push("pos.shift.closed ไม่เรียก pos-board-bridges.onShiftClosed");
      if (!/P3\.8/.test(l)) p.push("pos.shift.closed ไม่มีเครื่องหมาย P3.8 ในบรรทัด");
    }
    const refs = lines.filter((l) => l.includes("pos-board-bridges")).length;
    if (refs !== 1) p.push(`outbox-consumers อ้าง pos-board-bridges ${refs} บรรทัด (คาด 1)`);
    const base = gitStr(["show", `${BASE}:${F.outbox}`]);
    if (base === null) p.push(`อ่าน ${F.outbox} ที่ฐาน ${BASE} ไม่ได้`);
    else {
      const opened = (s: string) => s.split("\n").filter((l) => /"pos\.shift\.opened"\s*:/.test(l)).join("\n");
      if (opened(base) !== opened(now)) p.push("บรรทัด pos.shift.opened เปลี่ยน");
      const diff = gitStr(["diff", "-U0", BASE, "--", F.outbox]) ?? "";
      const add = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
      const del = diff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"));
      // ORACLE-EDIT ผู้คุม B 22.10 (CD-P312-W21 · W21 default re-base · old: คาด +1/−1 เสมอ · revert: ลบ carried): rev ที่มีบรรทัด pos.shift.closed ของ P3.8 อยู่แล้ว (หมุดเลนหลัง merge) ⇒ คาด +0/−0 (ห้ามแตะอะไรเพิ่มหลังหมุด) · BASE ก่อน P3.8 ⇒ คาด +1/−1 เหมือนเดิม
      const carried = base.split("\n").filter((l) => /"pos\.shift\.closed"\s*:/.test(l) && /P3\.8/.test(l) && /onShiftClosed/.test(l)).length === 1;
      if (carried ? add.length + del.length !== 0 : add.length !== 1 || del.length !== 1 || !add.every((l) => l.includes('"pos.shift.closed"')) || !del.every((l) => l.includes('"pos.shift.closed"')))
        p.push(`diff outbox-consumers = +${add.length}/−${del.length} (คาด ${carried ? "+0/−0 เทียบหมุดเลนที่มีบรรทัด P3.8 แล้ว" : "+1/−1 บรรทัด pos.shift.closed"})`);
    }
    const cron = stripComments(rd(F.cron));
    const rawCron = rd(F.cron);
    if (!/POS P3\.8 ▸/.test(rawCron)) p.push("cron hourly ไม่มีบล็อก POS P3.8 ▸");
    if (!/sweepPosBoard\s*\(/.test(cron)) p.push("cron hourly ไม่เรียก sweepPosBoard");
    const cdiff = gitStr(["diff", "-U0", BASE, "--", F.cron]) ?? "";
    const cdel = cdiff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"));
    if (cdel.length) p.push(`cron hourly ลบ/แก้บรรทัดเดิม ${cdel.length} บรรทัด (ต้องเพิ่มอย่างเดียว)`);
    return p;
  };
  // ST3 ไฟล์ห้ามแตะ
  const st3 = (BASE: string): string[] => { // ORACLE-EDIT ผู้คุม B 22.10 (CD-P312-W21 · W21 default re-base · old: บล็อก { … stNotes.ST3 = p } เทียบ BASE ส่วนกลาง)
    const p: string[] = [];
    const paths = [
      "prisma",
      `:(glob)${POS_DIR}/register*.ts`,
      `${POS_DIR}/service.ts`,
      `${POS_DIR}/shift.ts`,
      `${POS_DIR}/order.ts`,
      `${POS_DIR}/catalog.ts`,
      `:(glob)${POS_DIR}/receipt*.ts`,
      "src/lib/modules/kanban",
      "src/lib/modules/meeting",
      "src/lib/automation",
      "src/lib/platform/kanban-bridges.ts",
      "src/lib/pos-receipt-bridges.ts",
    ];
    const out = gitStr(["diff", "--name-only", BASE, "--", ...paths]);
    if (out === null) p.push(`git diff เทียบ ${BASE} ไม่ได้`);
    else for (const f of out.split("\n").filter(Boolean)) if (!(f === SO3_FILE && so3HunkOnly())) p.push(`แตะ ${f}`); // ORACLE-EDIT ผู้คุม POS 17 ต.ค. (P3.8 CD-P38-B5 · CD-P38-B1 export addSystemCardComment)
    const untracked = gitStr(["ls-files", "--others", "--exclude-standard", "--", "prisma"]) ?? "";
    for (const f of untracked.split("\n").filter(Boolean)) p.push(`ไฟล์ใหม่ ${f}`);
    return p;
  };
  // ORACLE-EDIT ผู้คุม B 22.10 (CD-P312-W21 · W21 default re-base · firstOk: BASE ก่อน › LANE_PIN · บันทึกฐานที่ผ่านใน stNotes["STn.base"] (ไม่ใช่ปัญหา))
  const laneOk = !!gitStr(["rev-parse", "--verify", "-q", `${LANE_PIN}^{commit}`])?.trim();
  const firstOk = (id: string, fn: (rev: string) => string[]): void => {
    const r0 = fn(BASE);
    if (!r0.length) {
      stNotes[`${id}.base`] = [`ผ่านเทียบ BASE ${BASE}`];
      stNotes[id] = r0;
      return;
    }
    if (laneOk && LANE_PIN !== BASE && !fn(LANE_PIN).length) {
      stNotes[`${id}.base`] = [`ผ่านเทียบหมุดเลน ${LANE_PIN} (BASE ${BASE}: ${r0.length} ข้อ — W21)`];
      stNotes[id] = [];
      return;
    }
    stNotes[id] = r0;
  };
  firstOk("ST2", st2);
  firstOk("ST3", st3);
}
// ORACLE-EDIT ผู้คุม POS 17 ต.ค. (P3.8 CD-P38-B5 · CD-P38-B1 export addSystemCardComment): ข้อยกเว้นแคบที่สุดของ ST3 —
//   src/lib/modules/kanban/integrations.ts ผ่านได้เฉพาะเมื่อ diff เทียบ BASE เป็นบรรทัดเพิ่มล้วน (ไม่มีบรรทัด "-" นอกหัว) และทุกบรรทัดเพิ่มที่ไม่ว่าง
//   อยู่ในบล็อกที่ขึ้นต้นด้วยบรรทัดที่มี `POS P3.8 ▸ SO3` และจบที่บรรทัด `◂` ถัดไป (หรือบรรทัดนั้นมี `POS P3.8 ▸` เอง) · ไฟล์ kanban อื่น/บรรทัดลบ-แก้/บรรทัดไม่มีป้าย = แดงตามเดิม
const SO3_FILE = "src/lib/modules/kanban/integrations.ts";
function so3HunkOnly(): boolean {
  const diff = gitStr(["diff", "-U0", BASE, "--", SO3_FILE]);
  if (diff === null) return false;
  let inBlock = false;
  let added = 0;
  for (const l of diff.split("\n")) {
    if (l.startsWith("---") || l.startsWith("+++")) continue;
    if (l.startsWith("-")) return false;
    if (!l.startsWith("+")) continue;
    const body = l.slice(1);
    if (body.includes("POS P3.8 ▸ SO3")) inBlock = true;
    const ok = inBlock || body.includes("POS P3.8 ▸");
    if (inBlock && body.includes("◂")) inBlock = false;
    if (body.trim() === "") continue;
    if (!ok) return false;
    added++;
  }
  return added > 0;
}
function finishStatic(): void {
  for (const id of ["ST1", "ST2", "ST3"]) {
    const p = stNotes[id] ?? ["ไม่ได้ตรวจ"];
    chk(id, p.length === 0, "ตามตารางชื่อ", joinP(p, (stNotes[`${id}.base`] ?? ["ครบ"]).join(" "))); // ORACLE-EDIT ผู้คุม B 22.10 (CD-P312-W21 · W21 default re-base · old: joinP(p) · revert: restore)
  }
}

// ═════════════════════════ 1b. --no-db ═════════════════════════
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อ (สถิต · ไม่โหลด prisma)`);
  try {
    runStatic();
    finishStatic();
  } catch (e) {
    console.log(`💥 harness: ${(e as Error)?.stack?.split("\n").slice(0, 3).join(" | ")}`);
  }
  for (const id of STATIC_IDS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", "ไม่ถึง");
  const failedN = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failedN.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failedN.length, failed: failedN, skipped: false, registered: CHECKS.length, base: BASE, missing: skipReasons })}`);
  process.exit(failedN.length ? 1 : 0);
}

// ═════════════════════════ 2. env (QC4 เท่านั้น) ═════════════════════════
const envMod = (await import("./pos-qc-env.mjs" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
const HOST = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "?";
  }
})();
function assertQc4BeforeWrite(): void {
  const mark = envMod.POS_QC_HOST_MARK as string;
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u!.includes(mark));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: จะเขียนแถวได้เฉพาะ QC4 (${mark}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
}

// ═════════════════════════ 3. ด่าน SKIP + ลายนิ้วมือ ═════════════════════════
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const TEMP_LIKE = "posqc-%";
const FP_TABLES: [string, string][] = [["KanbanCard", "columnId"], ["KanbanComment", "body"], ["MeetingMessage", "body"], ["PosShift", "status"], ["PosAvailabilityMark", "markedAt"], ["PosOrderEvent", "type"]];
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [tb, col] of FP_TABLES) {
    try {
      const r = (await P.$queryRawUnsafe(
        `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || coalesce(x."${col}"::text, ''), ',' ORDER BY x.id)), '-') AS h
         FROM "${tb}" x WHERE NOT (x."tenantId" IN (SELECT id FROM "Tenant" WHERE slug LIKE $1))`,
        TEMP_LIKE,
      )) as Any[];
      out[tb] = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 12)}`;
    } catch (e) {
      out[tb] = `err:${(e as Error).message.slice(0, 30)}`;
    }
  }
  return out;
}
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P3.8 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash · Z เขียว)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const tryImport = async (p: string): Promise<Any> => {
  try {
    return await import(p as string);
  } catch (e) {
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 140)})`);
    return null;
  }
};
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  return m ? m[1]! : "THROW";
}
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `ยังไม่มีโมดูล/ฟังก์ชัน — ${name}`, missing: true };
  try {
    return await fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}
function callSync(mod: Any, name: string, ...args: unknown[]): Any {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, missing: true };
  try {
    return fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : r === undefined ? "undefined" : r === null ? "null" : "UNKNOWN");
const threwOrMissing = (r: Any) => !!(r && (r.threw || r.missing));
const bridges = existsSync(join(ROOT, F.bridges)) ? await tryImport("@/lib/pos-board-bridges") : null;
const shared = existsSync(join(ROOT, F.shared)) ? await tryImport("@/lib/modules/pos/board-settings-shared") : null;
const consMod = await tryImport("@/lib/outbox-consumers");
const integ = await tryImport("@/lib/pos-integrations");
const reportsMod = await tryImport("@/lib/modules/pos/reports");
const regFacade = await tryImport("@/lib/modules/pos/register");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const catalog = await tryImport("@/lib/modules/pos/catalog");
const sysSvc = await tryImport("@/lib/modules/system/service");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p38-${RAND}`;
const T_SLUG = `posqc-p38-${RAND}`;
const T2_SLUG = `${T_SLUG}-t2`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";
let T2 = "";

const realFetch = globalThis.fetch;
const guardHits: string[] = [];
function installFetchGuard() {
  globalThis.fetch = (async (input: Any) => {
    let host = "?";
    try {
      host = new URL(typeof input === "string" ? input : String(input?.url ?? input)).host;
    } catch {
      /* ไม่ใช่ URL */
    }
    guardHits.push(host);
    return new Response(`blocked by ${SUITE}`, { status: 503 });
  }) as typeof fetch;
}
function removeFetchGuard() {
  globalThis.fetch = realFetch;
}

// ── เวลาไทย ──
const HOUR = 3_600_000;
const DAY_MS = 24 * HOUR;
const BKK = 7 * HOUR;
const bkkYmd = (d: Date) => new Date(d.getTime() + BKK).toISOString().slice(0, 10);
const D0 = bkkYmd(new Date());
/** วัน D+k เวลาไทย hh:mm */
const at = (k: number, hh: number, mm = 0) => new Date(Date.parse(`${D0}T00:00:00Z`) + k * DAY_MS + (hh - 7) * HOUR + mm * 60_000);
/** 12:00 ของวันไทยถัดไปจาก d */
const noonNextBkk = (d: Date) => new Date(Date.parse(`${bkkYmd(d)}T00:00:00Z`) + DAY_MS + (12 - 7) * HOUR);

// ── ตัวตรวจความเป็นส่วนตัว (PV1 + RF3 + AN3) ──
const PHONE_RE = /(?:\+66|\b0)\d{1,2}[- ]?\d{3}[- ]?\d{3,4}\b/;
const MONEYWORD_RE = /\btips?\b|ทิป|commission|ค่าคอม|payroll|salary|เงินเดือน/i;
function privacyHits(text: string, names: string[]): string[] {
  const h: string[] = [];
  if (PHONE_RE.test(text)) h.push(`เบอร์ "${PHONE_RE.exec(text)?.[0]}"`);
  if (MONEYWORD_RE.test(text)) h.push(`คำต้องห้าม "${MONEYWORD_RE.exec(text)?.[0]}"`);
  for (const n of names) if (n && n.length >= 4 && text.includes(n)) h.push(`ชื่อ "${n.slice(0, 20)}"`);
  return h;
}

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
const skippedParts: string[] = [];
async function runDb() {
  assertQc4BeforeWrite();
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (+ ${T2_SLUG}) · DB ${HOST} · วันนี้ ${D0} ──`);
  let fx = "";
  const notes: string[] = [];
  const U: Record<string, string> = {};
  const UN: Record<string, string> = {};
  const S: Record<string, string> = {};
  const US: Record<string, { id: string; role: string; unitAccess: string[]; perms: Record<string, boolean>; tid: string; name: string }> = {};
  const PR: Record<string, string> = {};
  const PN: Record<string, string> = {};
  const BD: Record<string, string> = {};
  const COL: Record<string, string> = {};
  const RM: Record<string, string> = {};
  const DEV: Record<string, string> = {};
  const DL: Record<string, string> = {};
  const step = async <R,>(label: string, fn: () => Promise<R> | R): Promise<R | null> => {
    try {
      return await fn();
    } catch (e) {
      const m = `${label}: ${String((e as Error)?.message ?? e).slice(0, 140)}`;
      notes.push(m);
      console.log(`  ⚠️  fixture ${m}`);
      return null;
    }
  };
  const must = (label: string, r: Any): Any => {
    if (r?.ok === false) throw new Error(`${label} ล้ม: ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    return r;
  };

  // ─── ร้าน · สาขา · ระบบ ───
  try {
    T = (await P.tenant.create({ data: { name: `QC P3.8 บอร์ด ${RAND}`, slug: T_SLUG } })).id;
    T2 = (await P.tenant.create({ data: { name: `QC P3.8 ร้านอื่น ${RAND}`, slug: T2_SLUG } })).id;
    for (const [k, tid, slug] of [["A", T, `${T_SLUG}-a`], ["B", T, `${T_SLUG}-b`], ["C", T, `${T_SLUG}-c`], ["X", T2, `${T2_SLUG}-x`]] as const) {
      UN[k] = `สาขา${k} ${RAND}`;
      U[k] = (await P.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: UN[k], slug } })).id;
    }
    S.POS = (await sysSvc.createSystem(T, "POS", `POS คิวซี ${RAND}`)).id;
    S.KAN = (await sysSvc.createSystem(T, "KANBAN", `บอร์ดงาน ${RAND}`)).id;
    S.MEET = (await sysSvc.createSystem(T, "MEETING", `ห้องทีม ${RAND}`)).id;
    S.POSX = (await sysSvc.createSystem(T2, "POS", `POS T2 ${RAND}`)).id;
    S.KANX = (await sysSvc.createSystem(T2, "KANBAN", `บอร์ด T2 ${RAND}`)).id;
    S.MEETX = (await sysSvc.createSystem(T2, "MEETING", `ห้อง T2 ${RAND}`)).id;
    for (const u of ["A", "B", "C"]) await sysSvc.linkUnit(T, S.POS, U[u]);
    await sysSvc.linkUnit(T2, S.POSX, U.X);
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  // ─── ผู้ใช้ + Membership จริง (ลำดับสร้าง = ลำดับ managerOfUnits: MGR_A ก่อน MGR_B) ───
  if (!fx) {
    try {
      for (const [k, tid, role, ua, perms, name] of [
        ["OWNER", T, "OWNER", ["*"], {}, `เจ้าของ ทดสอบ${RAND}`],
        ["MGR_A", T, "MANAGER", [U.A!], {}, `วิชัย ผู้จัดการ${RAND}`],
        ["MGR_B", T, "MANAGER", [U.B!], {}, `มานี ผู้จัดการ${RAND}`],
        ["CASH", T, "STAFF", [U.A!, U.B!, U.C!], { "pos.sale.create": true, "pos.shift.operate": true, "pos.report.view": true }, `สมศรี แคชเชียร์${RAND}`],
        ["SUP", T, "STAFF", [U.A!, U.B!], { "pos.report.view": true, "pos.report.anomaly": true, "kanban.board.read": true }, `ประยุทธ หัวหน้า${RAND}`],
        ["OWNER2", T2, "OWNER", ["*"], {}, `เจ้าของ ร้านอื่น${RAND}`],
      ] as const) {
        const u = await P.user.create({ data: { email: `${T_SLUG}-${k.toLowerCase().replace("_", "")}@qc.invalid`, name } });
        await P.membership.create({ data: { userId: u.id, tenantId: tid, role, unitAccess: [...ua], permissions: perms, acceptedAt: new Date() } });
        US[k] = { id: u.id, role, unitAccess: [...ua], perms: { ...perms }, tid, name };
        await sleep(5); // createdAt เรียงตามลำดับ (managerOfUnits ใช้ orderBy createdAt)
      }
    } catch (e) {
      fx = `ผู้ใช้:${(e as Error).message.slice(0, 140)}`;
    }
  }
  const FXB = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const uid = (k: string) => US[k]?.id ?? `none-${k}`;
  const A = (k: string): Any => (US[k] ? { userId: US[k]!.id, role: US[k]!.role, unitAccess: [...US[k]!.unitAccess], permissions: { ...US[k]!.perms } } : { userId: `none-${k}`, role: "STAFF", unitAccess: [], permissions: {} });
  const isT2 = (u: string) => u === "X";
  const ctxU = (u: string, dev?: string): Any => ({ tenantId: isT2(u) ? T2 : T, systemId: (isT2(u) ? S.POSX : S.POS) ?? "none", unitId: U[u] ?? "none", ...(dev ? { deviceId: dev } : {}) });
  const pctx = (tid = T): Any => ({ tenantId: tid, systemId: (tid === T2 ? S.POSX : S.POS) ?? "none" });
  const cc = (): Any => ({ tenantId: T, systemId: S.POS ?? "none", actorUserId: uid("OWNER") });
  let keyN = 0;
  const newKey = (pfx = "k") => `qc38${RAND}${pfx}${++keyN}`;
  const patchPos = async (fn: (pos: Record<string, Any>) => void, sysId = S.POS) => {
    const s0 = (await P.appSystem.findUnique({ where: { id: sysId }, select: { settings: true } }))?.settings ?? {};
    const s = isRecord(s0) ? JSON.parse(JSON.stringify(s0)) : {};
    const pos = isRecord(s.pos) ? s.pos : {};
    fn(pos);
    await P.appSystem.update({ where: { id: sysId }, data: { settings: { ...s, pos } } });
  };
  const posSettingsJson = async (sysId = S.POS): Promise<Any> => (await P.appSystem.findUnique({ where: { id: sysId }, select: { settings: true } }).catch(() => null))?.settings ?? {};

  // ─── บอร์ด (ฟิกซ์เจอร์ตรง ไม่ seed): A ปริยาย (ต้องทำ+เสร็จ) · B สาขา B (ต้องทำ+เสร็จ) · C ไม่มีคอลัมน์เสร็จ · ARCH ถูกเก็บ · X ร้าน T2 ───
  if (!fx) {
    await step("บอร์ด/คอลัมน์", async () => {
      const mkBoard = async (k: string, tid: string, sys: string, unitId: string | null, done: boolean, archived = false) => {
        const b = await P.kanbanBoard.create({ data: { tenantId: tid, systemId: sys, name: `บอร์ด ${k} ${RAND}`, unitId, ...(archived ? { status: "ARCHIVED", archivedAt: new Date() } : {}) } });
        BD[k] = b.id;
        COL[`${k}todo`] = (await P.kanbanColumn.create({ data: { tenantId: tid, systemId: sys, boardId: b.id, name: "ต้องทำ", sortOrder: 0, position: "a0" } })).id;
        if (done) COL[`${k}done`] = (await P.kanbanColumn.create({ data: { tenantId: tid, systemId: sys, boardId: b.id, name: "เสร็จ", sortOrder: 1, position: "a1", isDoneColumn: true } })).id;
      };
      await mkBoard("A", T, S.KAN!, null, true);
      await mkBoard("B", T, S.KAN!, U.B!, true);
      await mkBoard("C", T, S.KAN!, U.C!, false);
      await mkBoard("ARCH", T, S.KAN!, null, true, true);
      await mkBoard("X", T2, S.KANX!, null, true);
      await P.kanbanBoardMember.create({ data: { tenantId: T, boardId: BD.A, userId: uid("SUP"), role: "VIEWER" } });
      await P.kanbanBoardMember.create({ data: { tenantId: T, boardId: BD.B, userId: uid("SUP"), role: "EDITOR" } });
    });
    // ─── ห้องทีม: PUB (สาธารณะ) · PRIV (ส่วนตัว — มีแค่ผู้จัดการ A) · ARCH (เก็บถาวร) · X ร้าน T2 ───
    await step("ห้องทีม", async () => {
      const mkRoom = async (k: string, tid: string, sys: string, kind: "PUBLIC" | "PRIVATE", by: string, archived = false) => {
        const c = await P.meetingChannel.create({ data: { tenantId: tid, systemId: sys, name: `ห้อง${k}-${RAND}`, kind, createdByUserId: by, ...(archived ? { archivedAt: new Date() } : {}) } });
        RM[k] = c.id;
        await P.meetingChannelMember.create({ data: { tenantId: tid, systemId: sys, channelId: c.id, userId: by, isAdmin: true } });
      };
      await mkRoom("PUB", T, S.MEET!, "PUBLIC", uid("OWNER"));
      await mkRoom("PRIV", T, S.MEET!, "PRIVATE", uid("MGR_A"));
      await mkRoom("ARCH", T, S.MEET!, "PUBLIC", uid("OWNER"), true);
      await mkRoom("X", T2, S.MEETX!, "PUBLIC", uid("OWNER2"));
    });
    await step("ค่าตั้ง POS พื้นฐาน", async () => {
      const base = (pos: Record<string, Any>) => {
        pos.shift = { ...(isRecord(pos.shift) ? pos.shift : {}), required: { register: false, otherSources: false } };
        pos.reports = { ...(isRecord(pos.reports) ? pos.reports : {}), anomaly: { enabled: true } };
      };
      await patchPos(base);
      await patchPos(base, S.POSX);
    });
    await step("เครื่อง", async () => {
      for (const u of ["A", "B", "C", "X"]) {
        DEV[u] = `qc38${RAND}dev${u}`;
        DL[u] = `เคาน์เตอร์ ${u}${RAND}`;
        must(`registerDevice ${u}`, await call(devMod, "registerDevice", ctxU(u), A(isT2(u) ? "OWNER2" : "OWNER"), { name: DL[u], deviceCode: DEV[u] }));
      }
    });
    await step("สินค้า", async () => {
      for (const [k, name, price] of [["P0", "ขนมปัง", 2500], ["P1", "กาแฟเย็น", 5500], ["P2", "ชาเขียว", 4500], ["P3", "น้ำส้ม", 3500], ["PS", "น้ำดื่ม", 10_000]] as const) {
        PN[k] = `${name} ${RAND}`;
        PR[k] = String((await catalog.createProduct(cc(), { name: PN[k], kind: "PRODUCT", basePriceSatang: price }))?.id ?? "");
      }
    });
  }
  if (notes.length) console.log(`  (ฟิกซ์เจอร์มีหมายเหตุ ${notes.length}: ${notes.slice(0, 3).join(" | ")})`);

  // ─── ตัวช่วยกะ / event / การ์ด ───
  type Shift = { id: string; z: number; expected: number; counted: number | null; os: number; zr: Any; evt: Any; closedAt: Date | null };
  const NOSHIFT: Shift = { id: "", z: 0, expected: 0, counted: null, os: 0, zr: {}, evt: null, closedAt: null };
  const loadShift = async (tid: string, id: string): Promise<Shift> => {
    const r = await P.posShift.findFirst({ where: { id, tenantId: tid } });
    const evt = await P.outboxEvent.findFirst({ where: { tenantId: tid, type: "pos.shift.closed", idempotencyKey: `PosShift#${id}#CLOSED` } });
    return { id, z: Number(r?.zNumber ?? 0), expected: Number(r?.expectedCashSatang ?? 0), counted: r?.countedCashSatang ?? null, os: Number(r?.overShortSatang ?? 0), zr: r?.zReport ?? {}, evt, closedAt: r?.closedAt ?? null };
  };
  /** เปิดกะ (แคชเชียร์ · ฐานเงินทอน ฿1,000) → [ขาย 1 บิล] → ปิดด้วยยอดนับ = คาด + os */
  const runShift = async (u: string, os: number, opts: { sell?: boolean; forced?: boolean } = {}): Promise<Shift> => {
    if (fx) return NOSHIFT;
    const tid = isT2(u) ? T2 : T;
    const who = isT2(u) ? "OWNER2" : "CASH";
    const r = await step(`กะ ${u} os ${os}`, async () => {
      const o = must("openShift", await call(shiftMod, "openShift", ctxU(u, DEV[u]), A(who), { deviceId: DEV[u], deviceLabel: DL[u], floatSatang: 100_000 }));
      const id = String(o.shift?.id ?? "");
      if (opts.sell && !isT2(u)) {
        const lines = [{ productId: PR.PS ?? "none", qty: 1 }];
        const q = await call(regFacade, "quoteRegisterCart", ctxU(u, DEV[u]), A(who), { lines });
        const g = q?.ok === true ? Number(q.grandTotalSatang) : NaN;
        if (Number.isFinite(g)) {
          const s = await call(regFacade, "submitRegisterSale", ctxU(u, DEV[u]), A(who), { lines, payMethods: [{ type: "CASH", amountSatang: g }], cashReceivedSatang: g, expectedGrandTotalSatang: g, idempotencyKey: newKey("sale") });
          if (s?.ok !== true) notes.push(`ขายในกะ ${u}: ${codeOf(s)} ${short(s?.message ?? "", 60)}`);
        } else notes.push(`quote ในกะ ${u}: ${codeOf(q)}`);
      }
      if (opts.forced) {
        await P.$executeRawUnsafe(`UPDATE "PosShift" SET "openedAt" = $1 WHERE id = $2 AND "tenantId" = $3`, new Date(Date.now() - 30 * HOUR), id, tid);
        const fc = await call(shiftMod, "forceCloseStaleShifts", { now: new Date(), tenantId: tid });
        if (!Array.isArray(fc?.closed) || !fc.closed.includes(id)) throw new Error(`forceCloseStaleShifts ไม่ปิดกะ ${short(fc, 80)}`);
      } else {
        const x = must("xReport", await call(shiftMod, "xReport", ctxU(u, DEV[u]), A(who), { shiftId: id }));
        const expected = Number(x.report?.expectedCashSatang ?? NaN);
        if (!Number.isFinite(expected)) throw new Error("xReport ไม่มี expectedCashSatang");
        must("closeShift", await call(shiftMod, "closeShift", ctxU(u, DEV[u]), A(who), { shiftId: id, countedCashSatang: expected + os, note: `ทดสอบปิดกะ ${RAND}`, idempotencyKey: newKey("close") }));
      }
      const sh = await loadShift(tid, id);
      // จอดอีเวนต์ทันที (DONE) — ตัวระบายพื้นหลังของรอบนี้ (scheduleDrain · หน่วง ~3 วิ) จะไม่หยิบไปทำตอนค่าตั้งเปลี่ยนแล้ว ⇒ ผลแน่นอน
      //   ข้อสอบเรียก consumer ที่ลงทะเบียนจริงเอง (fire) และเล่นผ่านคิวจริงเมื่อต้องการ (replay)
      if (sh.evt) await P.outboxEvent.updateMany({ where: { id: sh.evt.id, tenantId: tid, status: "PENDING" }, data: { status: "DONE", processedAt: new Date() } });
      return sh;
    });
    return r ?? NOSHIFT;
  };
  const FIRE = consMod?.consumers?.["pos.shift.closed"];
  /** เรียก consumer ที่ลงทะเบียนจริงกับแถว OutboxEvent จริง */
  const fire = async (sh: Shift): Promise<Any> => {
    if (!sh.evt) return { ok: false, code: "NO_EVENT", threw: true };
    if (typeof FIRE !== "function") return { ok: false, code: "MISSING:consumer", threw: true };
    try {
      await FIRE({ id: sh.evt.id, tenantId: sh.evt.tenantId, type: sh.evt.type, payload: sh.evt.payload, systemId: sh.evt.systemId, unitId: sh.evt.unitId });
      return { ok: true };
    } catch (e) {
      return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 160), threw: true };
    }
  };
  /** เล่นอีเวนต์ซ้ำผ่านคิวจริง: คืนเป็น PENDING → drainAll → ต้องจบ DONE ("" = ผ่าน) */
  const replay = async (sh: Shift): Promise<string> => {
    if (!sh.evt) return "ไม่มีอีเวนต์";
    await P.outboxEvent.updateMany({ where: { id: sh.evt.id, tenantId: sh.evt.tenantId }, data: { status: "PENDING", availableAt: new Date(), attempts: 0, lastError: null, processedAt: null } });
    const d = await call(consMod, "drainAll");
    if (d?.threw || d?.missing) return `drainAll ${codeOf(d)}`;
    const e = await P.outboxEvent.findUnique({ where: { id: sh.evt.id } }).catch(() => null);
    return e?.status === "DONE" ? "" : `อีเวนต์ ${e?.status ?? "หาย"} ${short(e?.lastError ?? "", 60)}`;
  };
  const sweep = async (tid = T, now = new Date()): Promise<Any> => call(bridges, "sweepPosBoard", { now, deadline: Date.now() + 60_000, tenantId: tid });
  const cardsBy = async (where: Any, tid = T): Promise<Any[]> => (await P.kanbanCard.findMany({ where: { tenantId: tid, ...where }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[];
  const cardsKey = (key: string, tid = T) => cardsBy({ sourceKey: key }, tid);
  const cardsPrefix = (pfx: string, tid = T) => cardsBy({ sourceKey: { startsWith: pfx } }, tid);
  const countCards = async (tid = T) => Number(await P.kanbanCard.count({ where: { tenantId: tid } }).catch(() => -1));
  const msgs = async (channelId: string, tid = T): Promise<Any[]> => (await P.meetingMessage.findMany({ where: { tenantId: tid, channelId }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[];
  const countMsgs = async (tid = T) => Number(await P.meetingMessage.count({ where: { tenantId: tid } }).catch(() => -1));
  const flags = async (where: Any = {}, tid = T): Promise<Any[]> => (await P.auditLog.findMany({ where: { tenantId: tid, action: "pos.teamroom.posted", ...where } }).catch(() => [])) as Any[];
  const opsWarn = async (tid = T) => Number(await P.opsEvent.count({ where: { tenantId: tid, source: "pos.board", level: "WARN" } }).catch(() => -1));
  const linksOf = async (cardId: string): Promise<Any[]> => (await P.kanbanCardLink.findMany({ where: { cardId } }).catch(() => [])) as Any[];
  const assigneesOf = async (card: Any): Promise<string[]> => {
    const rows = ((await P.kanbanCardAssignee.findMany({ where: { cardId: card.id } }).catch(() => [])) as Any[]).map((r) => String(r.userId));
    if (card.assigneeUserId && !rows.includes(card.assigneeUserId)) rows.push(String(card.assigneeUserId));
    return rows;
  };
  const mark86 = async (u: string, pk: string, hoursAgo: number): Promise<string> => {
    const r = await call(catalog, "setAvailability", ctxU(u), A("OWNER"), { productId: PR[pk], unitId: U[u], available: false, source: "MANUAL" });
    if (r?.ok !== true) notes.push(`86 ${pk}@${u}: ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    const m = await P.posAvailabilityMark.findFirst({ where: { tenantId: T, unitId: U[u], productId: PR[pk] } }).catch(() => null);
    if (m) await P.$executeRawUnsafe(`UPDATE "PosAvailabilityMark" SET "markedAt" = $1 WHERE id = $2 AND "tenantId" = $3`, new Date(Date.now() - hoursAgo * HOUR), m.id, T);
    return String(m?.id ?? "");
  };
  const unmark86 = async (u: string, pk: string) => {
    const r = await call(catalog, "setAvailability", ctxU(u), A("OWNER"), { productId: PR[pk], unitId: U[u], available: true, source: "MANUAL" });
    if (r?.ok !== true) notes.push(`คืนขาย ${pk}@${u}: ${codeOf(r)}`);
  };
  // ── ค่าตั้งของใบ (เขียนตรงลง AppSystem — ทดสอบพฤติกรรมแยกจากผู้เขียน CF3) ──
  const BOARD_ON = () => ({
    enabled: true,
    defaultBoardId: BD.A ?? null,
    boardByUnit: { [U.B!]: BD.B, [U.C!]: BD.C },
    assignManager: true,
    rules: { shiftDiff: { enabled: true, minAbsSatang: 10_000, everyClose: false, forcedClose: true }, soldOut: { enabled: true, hours: 4, sources: ["MANUAL", "KDS", "STOCK"] }, refundNeeded: { enabled: true } },
  });
  const ROOM_OFF = () => ({ enabled: false, defaultRoom: null, roomByUnit: {}, posts: { shiftClose: false, showOverShort: true, dailyBrief: false }, briefHourBkk: 7, enabledByUserId: null });
  const ROOM_ON = (over: Record<string, Any> = {}) => ({ enabled: true, defaultRoom: { meetingSystemId: S.MEET, channelId: RM.PUB }, roomByUnit: {}, posts: { shiftClose: true, showOverShort: true, dailyBrief: false }, briefHourBkk: 7, enabledByUserId: uid("OWNER"), ...over });
  const setBoard = (b: Any, sysId = S.POS) => patchPos((pos) => void (pos.board = b), sysId);
  const setRoom = (r: Any, sysId = S.POS) => patchPos((pos) => void (pos.teamRoom = r), sysId);

  // ─── refund_needed: ออเดอร์ + แถว PosOrderEvent (รูปของ order.ts addRefundNeededInTx) — ชื่อ/เบอร์ลูกค้าฟิกซ์เจอร์ต้องไม่หลุดลงการ์ด ───
  const CUST_NAME = `คุณลูกค้า ทดสอบ${RAND}`;
  const CUST_PHONE = `081${String(Date.now()).slice(-7)}`;
  const ORD: Record<string, { id: string; code: string; amount: number; cause: string; unit: string }> = {};
  const mkRefundOrder = async (k: string, u: string, status: "REJECTED" | "CANCELLED", cause: string, amount: number, ageMs: number) => {
    const code = `QR-${RAND.slice(0, 3).toUpperCase()}${k}`;
    const o = await P.posOrder.create({
      data: {
        tenantId: T, systemId: S.POS, unitId: U[u], channelId: `qc38ch${RAND}`, channelCode: "QR", adapter: "WEB", code, idempotencyKey: newKey("ord"),
        status, paymentState: "PREPAID", fulfilment: "PICKUP", customerName: CUST_NAME, customerPhone: CUST_PHONE, totalSatang: amount,
        closedAt: new Date(Date.now() - ageMs), paidAt: new Date(Date.now() - ageMs - HOUR), paymentIntentId: `qc38pi${RAND}${k}`, rejectReason: status === "REJECTED" ? "OUT_OF_STOCK" : "PREPAID_NOT_ACCEPTED",
      },
    });
    await P.posOrderEvent.create({ data: { tenantId: T, systemId: S.POS, orderId: o.id, type: "refund_needed", fromStatus: status, toStatus: status, actorUserId: null, payload: { cause, intentId: `qc38pi${RAND}${k}`, amountSatang: amount }, at: new Date(Date.now() - ageMs) } });
    ORD[k] = { id: o.id, code, amount, cause, unit: u };
  };
  if (!fx) {
    await step("ออเดอร์ refund_needed", async () => {
      await mkRefundOrder("O1", "A", "REJECTED", "rejected_prepaid", 12_000, 2 * HOUR);
      await mkRefundOrder("O2", "A", "CANCELLED", "expired_paid", 8_500, 3 * HOUR);
      await mkRefundOrder("O3", "B", "CANCELLED", "late_payment", 23_000, 4 * HOUR);
      await mkRefundOrder("O4", "A", "CANCELLED", "expired_paid", 9_900, 8 * DAY_MS);
    });
  }

  // ══════════ CF2 ตัวอ่านบริสุทธิ์ ══════════
  console.log("\n── CF ค่าตั้ง ──");
  const DEF_BOARD = { enabled: false, defaultBoardId: null, boardByUnit: {}, assignManager: true, rules: { shiftDiff: { enabled: false, minAbsSatang: 10_000, everyClose: false, forcedClose: true }, soldOut: { enabled: false, hours: 4, sources: ["MANUAL", "KDS", "STOCK"] }, refundNeeded: { enabled: false } } };
  const DEF_ROOM = { enabled: false, defaultRoom: null, roomByUnit: {}, posts: { shiftClose: false, showOverShort: true, dailyBrief: false }, briefHourBkk: 7, enabledByUserId: null };
  {
    const p: string[] = [];
    const pb = (s: Any) => callSync(shared, "posBoardSettings", s);
    const pr = (s: Any) => callSync(shared, "posTeamRoomSettings", s);
    for (const s of [{}, null, { pos: {} }, { pos: { board: "x", teamRoom: 5 } }]) {
      if (C(pb(s)) !== C(DEF_BOARD)) p.push(`board ปริยาย(${short(s, 30)}) = ${short(pb(s), 90)}`);
      if (C(pr(s)) !== C(DEF_ROOM)) p.push(`teamRoom ปริยาย(${short(s, 30)}) = ${short(pr(s), 90)}`);
    }
    const lo = pb({ pos: { board: { foo: 1, enabled: "yes", rules: { shiftDiff: { minAbsSatang: -5, bar: 2 }, soldOut: { hours: 0 } } } } });
    if (lo?.foo !== undefined || lo?.rules?.shiftDiff?.bar !== undefined) p.push("คีย์แปลกไม่ถูกทิ้ง");
    if (lo?.enabled !== false) p.push(`enabled "yes" → ${short(lo?.enabled)}`);
    if (lo?.rules?.shiftDiff?.minAbsSatang !== 0) p.push(`minAbsSatang −5 → ${short(lo?.rules?.shiftDiff?.minAbsSatang)}`);
    if (lo?.rules?.soldOut?.hours !== 1) p.push(`hours 0 → ${short(lo?.rules?.soldOut?.hours)}`);
    const hi = pb({ pos: { board: { rules: { shiftDiff: { minAbsSatang: 99_999_999 }, soldOut: { hours: 500 } } } } });
    if (hi?.rules?.shiftDiff?.minAbsSatang !== 10_000_000) p.push(`minAbsSatang 99,999,999 → ${short(hi?.rules?.shiftDiff?.minAbsSatang)}`);
    if (hi?.rules?.soldOut?.hours !== 168) p.push(`hours 500 → ${short(hi?.rules?.soldOut?.hours)}`);
    const nn = pb({ pos: { board: { rules: { shiftDiff: { minAbsSatang: "x" }, soldOut: { hours: 1.5 } } } } });
    if (nn?.rules?.shiftDiff?.minAbsSatang !== 10_000) p.push(`minAbsSatang "x" → ${short(nn?.rules?.shiftDiff?.minAbsSatang)}`);
    if (nn?.rules?.soldOut?.hours !== 4) p.push(`hours 1.5 → ${short(nn?.rules?.soldOut?.hours)}`);
    const many = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`u${i}`, `b${i}`]));
    const mb = pb({ pos: { board: { boardByUnit: many } } });
    const nMap = isRecord(mb?.boardByUnit) ? Object.keys(mb.boardByUnit).length : -1;
    if (nMap < 0 || nMap > 200) p.push(`boardByUnit 250 → ${nMap}`);
    const r1 = pr({ pos: { teamRoom: { briefHourBkk: 30, foo: 1, posts: { baz: true } } } });
    if (r1?.briefHourBkk !== 23) p.push(`briefHourBkk 30 → ${short(r1?.briefHourBkk)}`);
    if (r1?.foo !== undefined || r1?.posts?.baz !== undefined) p.push("teamRoom คีย์แปลกไม่ถูกทิ้ง");
    const r2 = pr({ pos: { teamRoom: { briefHourBkk: -1 } } });
    if (r2?.briefHourBkk !== 0) p.push(`briefHourBkk −1 → ${short(r2?.briefHourBkk)}`);
    const ok = pb({ pos: { board: BOARD_ON() } });
    if (C(ok) !== C(BOARD_ON())) p.push(`ค่าที่ถูกต้องอ่านกลับไม่ตรง ${short(ok, 80)}`);
    chk("CF2", p.length === 0, "ตารางค่าปริยาย + ตัดขอบ", joinP(p));
  }

  // ══════════ CF1 ปิดหมด ⇒ ไม่มีผลใด ๆ ══════════
  {
    const p: string[] = [];
    const sh = await runShift("A", -50_000);
    if (!sh.id || !sh.evt) p.push("ฟิกซ์เจอร์กะ/อีเวนต์ไม่ครบ");
    const m0 = await mark86("A", "P0", 10);
    if (!m0) p.push("ฟิกซ์เจอร์ 86 ไม่มี mark");
    for (const r of [await fire(sh), await fire(sh)]) if (r?.ok !== true) p.push(`consumer ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    for (const r of [await sweep(), await sweep()]) if (threwOrMissing(r)) p.push(`sweep ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    const nc = await countCards();
    const nm = await countMsgs();
    const nf = (await flags()).length;
    const nw = await opsWarn();
    if (nc !== 0) p.push(`การ์ด ${nc}`);
    if (nm !== 0) p.push(`ข้อความ ${nm}`);
    if (nf !== 0) p.push(`ธง ${nf}`);
    if (nw !== 0) p.push(`ops pos.board ${nw}`);
    await unmark86("A", "P0");
    chk("CF1", p.length === 0, "ปิดหมด = 0 ผล · ไม่ throw", FXB(joinP(p)));
  }

  // ══════════ CF3 ผู้เขียนค่าตั้ง ══════════
  {
    const p: string[] = [];
    const before = C(await posSettingsJson());
    const input = () => ({ board: { ...BOARD_ON() }, teamRoom: { enabled: true, defaultRoom: { meetingSystemId: S.MEET, channelId: RM.PUB }, roomByUnit: {}, posts: { shiftClose: true, showOverShort: true, dailyBrief: false }, briefHourBkk: 7 } });
    const save = (actorK: string, inp: Any) => call(bridges, "savePosBoardSettings", pctx(), A(actorK), inp);
    const m = await save("MGR_A", input());
    if (codeOf(m) !== "PERMISSION_DENIED" || m?.threw) p.push(`MANAGER → ${codeOf(m)}`);
    if (C(await posSettingsJson()) !== before) p.push("MANAGER เปลี่ยนค่าตั้ง");
    const bad: [string, Any][] = [
      ["บอร์ด T2", { ...input(), board: { ...BOARD_ON(), defaultBoardId: BD.X } }],
      ["บอร์ดถูกเก็บ", { ...input(), board: { ...BOARD_ON(), defaultBoardId: BD.ARCH } }],
      ["ห้อง PRIVATE", { ...input(), teamRoom: { ...input().teamRoom, defaultRoom: { meetingSystemId: S.MEET, channelId: RM.PRIV } } }],
      ["สาขาร้านอื่น", { ...input(), board: { ...BOARD_ON(), boardByUnit: { [U.X!]: BD.A } } }],
      ["คีย์แปลก", { ...input(), board: { ...BOARD_ON(), foo: 1 } }],
    ];
    for (const [label, inp] of bad) {
      const r = await save("OWNER", inp);
      if (codeOf(r) !== "VALIDATION" || r?.threw) p.push(`${label} → ${codeOf(r)}`);
    }
    if (C(await posSettingsJson()) !== before) p.push("คำขอที่ถูกปฏิเสธเปลี่ยนค่าตั้ง");
    const a0 = Number(await P.auditLog.count({ where: { tenantId: T, action: "pos.settings.updated" } }).catch(() => -1));
    const ok = await save("OWNER", input());
    if (ok?.ok !== true) p.push(`OWNER → ${codeOf(ok)} ${short(ok?.message ?? "", 60)}`);
    const a1 = Number(await P.auditLog.count({ where: { tenantId: T, action: "pos.settings.updated" } }).catch(() => -1));
    if (!(a1 > a0)) p.push(`audit pos.settings.updated ${a0}→${a1}`);
    const st = await posSettingsJson();
    const gb = callSync(shared, "posBoardSettings", st);
    const gr = callSync(shared, "posTeamRoomSettings", st);
    if (C(gb) !== C(BOARD_ON())) p.push(`board อ่านกลับ ${short(gb, 80)}`);
    if (C(gr) !== C(ROOM_ON())) p.push(`teamRoom อ่านกลับ ${short(gr, 80)}`);
    chk("CF3", p.length === 0, "OWNER เท่านั้น · ตรวจ id · audit", FXB(joinP(p)));
  }

  // ══════════ SD ปิดกะ → การ์ด ══════════
  console.log("\n── SD ปิดกะ ──");
  await step("ค่าตั้ง SD", async () => {
    await setBoard(BOARD_ON());
    await setRoom(ROOM_OFF());
  });
  const allTexts: string[] = [];
  const firstCol = (k: string) => COL[`${k}todo`];
  let SD1_SHIFT = NOSHIFT;
  {
    const p: string[] = [];
    const sh = await runShift("A", -15_000);
    SD1_SHIFT = sh;
    const r = await fire(sh);
    if (r?.ok !== true) p.push(`consumer ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    const cs = await cardsKey(`pos-shift:${sh.id}`);
    if (cs.length !== 1) p.push(`การ์ด ${cs.length} ใบ`);
    const c = cs[0];
    if (c) {
      const want = `ตรวจเงินกะ Z#${sh.z} · ${UN.A} · ${DL.A} · ขาด ฿150`;
      if (c.title !== want) p.push(`ชื่อ "${c.title}" (คาด "${want}")`);
      if (c.boardId !== BD.A) p.push("ไม่ใช่บอร์ดปริยาย A");
      if (c.columnId !== firstCol("A")) p.push("ไม่ใช่คอลัมน์แรก");
      if (c.sourceType !== "AUTOMATION") p.push(`sourceType ${c.sourceType}`);
      if (c.createdById !== null) p.push(`createdById ${c.createdById}`);
      const as = await assigneesOf(c);
      if (as.length !== 1 || as[0] !== uid("MGR_A")) p.push(`ผู้รับ ${short(as)} (คาด ผู้จัดการ A)`);
      const ls = await linksOf(c.id);
      const url = ls.find((l) => l.linkType === "URL" && String(l.linkId).endsWith(`/app/sys/${S.POS}/pos/shifts?shift=${sh.id}`));
      if (!url) p.push(`ไม่มีลิงก์ URL กะ (${short(ls.map((l) => `${l.linkType}:${l.linkId}`), 80)})`);
      else if (url.label !== `กะ Z#${sh.z}`) p.push(`ป้ายลิงก์ "${url.label}"`);
      const due = c.dueAt ? new Date(c.dueAt).getTime() : NaN;
      if (![noonNextBkk(sh.closedAt ?? new Date()).getTime(), noonNextBkk(new Date()).getTime()].includes(due)) p.push(`dueAt ${c.dueAt ? new Date(c.dueAt).toISOString() : "null"}`);
      const desc = String(c.description ?? "");
      for (const [lbl, s] of [["ยอดคาด", baht(sh.expected)], ["ยอดนับ", baht(Number(sh.counted ?? -1))], ["ขาด", "฿150"], ["ยอดขาย", baht(Number(sh.zr?.salesTotalSatang ?? 0))]] as const) if (!desc.includes(s)) p.push(`รายละเอียดไม่มี${lbl} ${s}`);
      if (!desc.includes(String(Number(sh.zr?.billCount ?? 0)))) p.push("รายละเอียดไม่มีจำนวนบิล");
    }
    chk("SD1", p.length === 0, "การ์ดตรวจเงิน 1 ใบตามสัญญา", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const sh = SD1_SHIFT;
    const rs = [await fire(sh), await fire(sh), ...(await Promise.all([fire(sh), fire(sh)]))];
    for (const r of rs) if (r?.ok !== true) p.push(`consumer ${codeOf(r)}`);
    const rq = await replay(sh);
    if (rq) p.push(`คิวจริง: ${rq}`);
    const cs = await cardsKey(`pos-shift:${sh.id}`);
    if (cs.length !== 1) p.push(`การ์ด ${cs.length} ใบ`);
    const c = cs[0];
    if (c) {
      const acts = Number(await P.kanbanActivity.count({ where: { cardId: c.id, type: "CARD_CREATED" } }).catch(() => -1));
      if (acts !== 1) p.push(`CARD_CREATED ${acts}`);
      const as = await assigneesOf(c);
      if (as.length !== 1) p.push(`ผู้รับ ${as.length}`);
      const ls = (await linksOf(c.id)).filter((l) => l.linkType === "URL" && !l.removedAt);
      if (ls.length !== 1) p.push(`ลิงก์ URL ${ls.length}`);
    }
    chk("SD2", p.length === 0, "ยิงซ้ำ/พร้อมกัน = 1 ใบ", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const sh = await runShift("A", -5_000);
    const r = await fire(sh);
    if (r?.ok !== true) p.push(`consumer ${codeOf(r)}`);
    const n = (await cardsKey(`pos-shift:${sh.id}`)).length;
    if (!sh.id) p.push("ฟิกซ์เจอร์กะ");
    if (n !== 0) p.push(`การ์ด ${n} ใบ`);
    chk("SD3", p.length === 0 && !!sh.id, "ขาด ฿50 = ไม่มีการ์ด", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    await step("everyClose", () => setBoard({ ...BOARD_ON(), rules: { ...BOARD_ON().rules, shiftDiff: { enabled: true, minAbsSatang: 10_000, everyClose: true, forcedClose: true } } }));
    const sh = await runShift("A", 0);
    const r = await fire(sh);
    if (r?.ok !== true) p.push(`consumer ${codeOf(r)}`);
    const cs = await cardsKey(`pos-shift:${sh.id}`);
    const want = `ตรวจเงินกะ Z#${sh.z} · ${UN.A} · ${DL.A} · ตรงยอด ฿0`;
    if (cs.length !== 1) p.push(`การ์ด ${cs.length} ใบ`);
    else if (cs[0].title !== want) p.push(`ชื่อ "${cs[0].title}" (คาด "${want}")`);
    await step("คืน everyClose", () => setBoard(BOARD_ON()));
    chk("SD4", p.length === 0, "everyClose = การ์ดตรงยอด", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const sh = await runShift("A", 0, { forced: true });
    if (sh.id && sh.counted !== null) p.push(`counted ${sh.counted} (คาด null)`);
    if (sh.evt && (sh.evt.payload as Any)?.forced !== true) p.push("payload.forced ไม่ใช่ true");
    const r = await fire(sh);
    if (r?.ok !== true) p.push(`consumer ${codeOf(r)}`);
    const cs = await cardsKey(`pos-shift:${sh.id}`);
    if (cs.length !== 1) p.push(`การ์ด ${cs.length} ใบ`);
    else {
      const t = String(cs[0].title);
      if (!t.startsWith(`กะถูกบังคับปิด Z#${sh.z}`) || !t.includes("ยังไม่ได้นับเงิน")) p.push(`ชื่อ "${t}"`);
    }
    chk("SD5", p.length === 0 && !!sh.id, "บังคับปิด = การ์ดยังไม่ได้นับเงิน", FXB(joinP(p)));
  }
  let SD6_SHIFT = NOSHIFT;
  {
    const p: string[] = [];
    const sh = await runShift("B", -20_000);
    SD6_SHIFT = sh;
    const r = await fire(sh);
    if (r?.ok !== true) p.push(`consumer ${codeOf(r)}`);
    const cs = await cardsKey(`pos-shift:${sh.id}`);
    if (cs.length !== 1) p.push(`การ์ดสาขา B ${cs.length} ใบ`);
    else {
      if (cs[0].boardId !== BD.B) p.push("สาขา B ไม่ลงบอร์ด B");
      const as = await assigneesOf(cs[0]);
      if (as.length !== 1 || as[0] !== uid("MGR_B")) p.push(`ผู้รับ ${short(as)} (คาด ผู้จัดการ B)`);
      const want = `ตรวจเงินกะ Z#${sh.z} · ${UN.B} · ${DL.B} · ขาด ฿200`;
      if (cs[0].title !== want) p.push(`ชื่อ "${cs[0].title}"`);
    }
    const a = (await cardsKey(`pos-shift:${SD1_SHIFT.id}`))[0];
    if (!a || a.boardId !== BD.A) p.push("สาขา A ไม่ลงบอร์ดปริยาย");
    chk("SD6", p.length === 0, "boardByUnit ก่อน · ไม่ผูก = ปริยาย", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    await step("บอร์ดถูกเก็บ", () => setBoard({ ...BOARD_ON(), defaultBoardId: BD.ARCH }));
    const w0 = await opsWarn();
    const sh = await runShift("A", -30_000);
    const r1 = await fire(sh);
    if (r1?.ok !== true) p.push(`consumer throw ${codeOf(r1)} ${short(r1?.message ?? "", 50)}`);
    const rq = await replay(sh);
    if (rq) p.push(`คิวจริง (ต้อง DONE): ${rq}`);
    const n = (await cardsKey(`pos-shift:${sh.id}`)).length;
    if (n !== 0) p.push(`การ์ด ${n} ใบ`);
    const w1 = await opsWarn();
    if (w1 - w0 !== 1) p.push(`ops WARN pos.board +${w1 - w0} (คาด +1)`);
    await step("คืนบอร์ด", () => setBoard(BOARD_ON()));
    chk("SD7", p.length === 0 && !!sh.id, "เงียบ + WARN ครั้งเดียว", FXB(joinP(p)));
  }

  // ══════════ SO 86 ══════════
  console.log("\n── SO 86 ──");
  let M1 = "";
  {
    const p: string[] = [];
    M1 = await mark86("A", "P1", 5);
    if (!M1) p.push("ฟิกซ์เจอร์ mark");
    for (const r of [await sweep(), await sweep()]) if (threwOrMissing(r)) p.push(`sweep ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    const cs = await cardsPrefix(`pos-86:${U.A}:${PR.P1}:`);
    if (cs.length !== 1) p.push(`การ์ด ${cs.length} ใบ`);
    else {
      if (cs[0].sourceKey !== `pos-86:${U.A}:${PR.P1}:${M1}`) p.push(`กุญแจ ${cs[0].sourceKey}`);
      const want = `สินค้าหมดนานเกิน 4 ชม.: ${PN.P1} · ${UN.A}`;
      if (cs[0].title !== want) p.push(`ชื่อ "${cs[0].title}" (คาด "${want}")`);
      if (cs[0].boardId !== BD.A) p.push("ไม่ใช่บอร์ด A");
      if (cs[0].createdById !== null) p.push(`createdById ${cs[0].createdById}`);
    }
    chk("SO1", p.length === 0, "86 ≥ 4 ชม. = 1 ใบ", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const m2 = await mark86("A", "P2", 1);
    if (!m2) p.push("ฟิกซ์เจอร์ mark");
    const r = await sweep();
    if (threwOrMissing(r)) p.push(`sweep ${codeOf(r)}`);
    const n = (await cardsPrefix(`pos-86:${U.A}:${PR.P2}:`)).length;
    if (n !== 0) p.push(`การ์ด ${n} ใบ`);
    chk("SO2", p.length === 0 && !!m2, "86 1 ชม. = ไม่มีการ์ด", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    await unmark86("A", "P1");
    const r = await sweep();
    if (threwOrMissing(r)) p.push(`sweep ${codeOf(r)}`);
    const c = (await cardsKey(`pos-86:${U.A}:${PR.P1}:${M1}`))[0];
    if (!c) p.push("การ์ด P1 หาย");
    else {
      if (c.columnId !== COL.Adone) p.push("ไม่ถูกย้ายเข้าคอลัมน์เสร็จ");
      if (!c.completedAt) p.push("completedAt null");
      const acts = (await P.kanbanActivity.findMany({ where: { cardId: c.id, type: { in: ["CARD_MOVED", "CARD_COMPLETED"] } } }).catch(() => [])) as Any[];
      if (!acts.length) p.push("ไม่มีกิจกรรมย้าย");
      else if (acts.some((x) => x.actorUserId !== null)) p.push("กิจกรรมย้ายมี actorUserId (ต้อง null = ระบบ)");
    }
    // บอร์ด C (ไม่มีคอลัมน์เสร็จ)
    const m3 = await mark86("C", "P3", 5);
    const r2 = await sweep();
    if (threwOrMissing(r2)) p.push(`sweep C ${codeOf(r2)}`);
    const c3 = (await cardsKey(`pos-86:${U.C}:${PR.P3}:${m3}`))[0];
    if (!c3) p.push("ไม่มีการ์ด 86 สาขา C");
    else {
      if (c3.boardId !== BD.C) p.push("การ์ด C ไม่อยู่บอร์ด C");
      await unmark86("C", "P3");
      for (const rr of [await sweep(), await sweep()]) if (threwOrMissing(rr)) p.push(`sweep C2 ${codeOf(rr)}`);
      const again = await P.kanbanCard.findUnique({ where: { id: c3.id } }).catch(() => null);
      if (!again || again.columnId !== COL.Ctodo) p.push("การ์ด C ถูกย้าย (ไม่มีคอลัมน์เสร็จ ต้องอยู่ที่เดิม)");
      const cm = ((await P.kanbanComment.findMany({ where: { cardId: c3.id } }).catch(() => [])) as Any[]).filter((x) => String(x.body).includes("กลับมาขายแล้ว"));
      if (cm.length !== 1) p.push(`ความเห็น "กลับมาขายแล้ว" ${cm.length}`);
    }
    chk("SO3", p.length === 0, "คืนขาย = ปิดการ์ด / ความเห็นครั้งเดียว", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const m4 = await mark86("A", "P1", 5);
    if (!m4 || m4 === M1) p.push(`mark ใหม่ ${m4 ? "id ซ้ำ" : "ไม่มี"}`);
    const r = await sweep();
    if (threwOrMissing(r)) p.push(`sweep ${codeOf(r)}`);
    const cs = await cardsPrefix(`pos-86:${U.A}:${PR.P1}:`);
    if (cs.length !== 2) p.push(`การ์ด P1 ${cs.length} ใบ (คาด 2)`);
    const nw = cs.find((c) => c.sourceKey === `pos-86:${U.A}:${PR.P1}:${m4}`);
    const old = cs.find((c) => c.sourceKey === `pos-86:${U.A}:${PR.P1}:${M1}`);
    if (!nw) p.push("ไม่มีการ์ดใบใหม่");
    else if (nw.columnId === COL.Adone || nw.completedAt) p.push("ใบใหม่อยู่คอลัมน์เสร็จ");
    if (!old || old.columnId !== COL.Adone) p.push("ใบเดิมไม่อยู่คอลัมน์เสร็จ");
    await unmark86("A", "P1");
    chk("SO4", p.length === 0, "86 ซ้ำ = ใบใหม่", FXB(joinP(p)));
  }

  // ══════════ RF refund_needed ══════════
  console.log("\n── RF คืนเงิน ──");
  const CAUSE: Record<string, string> = { rejected_prepaid: "ปฏิเสธหลังจ่าย", expired_paid: "จ่ายแล้วไม่มีคนรับ", late_payment: "เงินเข้าหลังยกเลิก" };
  const refundIds = () => ["O1", "O2", "O3"].map((k) => ORD[k]?.id ?? "none");
  {
    const p: string[] = [];
    const r = await sweep();
    if (threwOrMissing(r)) p.push(`sweep ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    for (const k of ["O1", "O2", "O3"]) {
      const o = ORD[k];
      if (!o) {
        p.push(`ฟิกซ์เจอร์ ${k}`);
        continue;
      }
      const cs = await cardsKey(`pos-refund:${o.id}`);
      if (cs.length !== 1) {
        p.push(`${k} การ์ด ${cs.length}`);
        continue;
      }
      const c = cs[0];
      const want = `คืนเงินลูกค้า: ออเดอร์ ${o.code} ${baht(o.amount)}`;
      if (c.title !== want) p.push(`${k} ชื่อ "${c.title}" (คาด "${want}")`);
      if (!`${c.title}\n${c.description ?? ""}`.includes(CAUSE[o.cause]!)) p.push(`${k} ไม่มีสาเหตุ "${CAUSE[o.cause]}"`);
      if (c.boardId !== (o.unit === "B" ? BD.B : BD.A)) p.push(`${k} บอร์ดผิด`);
      const ls = await linksOf(c.id);
      if (!ls.some((l) => l.linkType === "URL" && String(l.linkId).endsWith(`/app/sys/${S.POS}/pos/orders?id=${o.id}`))) p.push(`${k} ไม่มีลิงก์ออเดอร์`);
    }
    const old = (await cardsKey(`pos-refund:${ORD.O4?.id ?? "none"}`)).length;
    if (old !== 0) p.push(`แถว 8 วัน มีการ์ด ${old}`);
    chk("RF1", p.length === 0, "3 สาเหตุ = 3 ใบ · 8 วัน = 0", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const before = (await cardsBy({ sourceKey: { in: refundIds().map((id) => `pos-refund:${id}`) } })).map((c) => c.id).sort();
    for (const r of [await sweep(), await sweep()]) if (threwOrMissing(r)) p.push(`sweep ${codeOf(r)}`);
    const after = (await cardsBy({ sourceKey: { in: refundIds().map((id) => `pos-refund:${id}`) } })).map((c) => c.id).sort();
    if (C(before) !== C(after)) p.push(`ชุดการ์ดเปลี่ยน ${before.length}→${after.length}`);
    if (after.length !== 3) p.push(`การ์ด ${after.length} (คาด 3)`);
    chk("RF2", p.length === 0, "sweep ซ้ำ = ไม่เพิ่ม", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const cs = await cardsBy({ sourceKey: { startsWith: "pos-refund:" } });
    if (cs.length === 0) p.push("ไม่มีการ์ดให้ตรวจ");
    for (const c of cs) {
      const ls = await linksOf(c.id);
      const text = [c.title, c.description ?? "", ...ls.map((l) => `${l.label ?? ""} ${l.linkId}`)].join("\n");
      const h = privacyHits(text, [CUST_NAME, CUST_PHONE]);
      if (text.includes(CUST_PHONE.slice(-7))) h.push("เลขท้ายเบอร์ลูกค้า");
      if (h.length) p.push(`${c.sourceKey}: ${h.join(",")}`);
    }
    chk("RF3", p.length === 0, "ไม่มีชื่อ/เบอร์ลูกค้า", FXB(joinP(p)));
  }

  // ══════════ RM ห้องทีม ══════════
  console.log("\n── RM ห้องทีม ──");
  await step("เปิดห้อง", () => setRoom(ROOM_ON()));
  let RM1_SHIFT = NOSHIFT;
  const zBody = (sh: Shift, u: string, withOs: boolean) =>
    `ปิดกะ Z#${sh.z} · ${UN[u]} · ${DL[u]} · ขาย ${baht(Number(sh.zr?.salesTotalSatang ?? 0))} (${Number(sh.zr?.billCount ?? 0)} บิล)` + (withOs && sh.os !== 0 ? ` · เงินสด ${sh.os < 0 ? "ขาด" : "เกิน"} ${baht(Math.abs(sh.os))}` : "");
  {
    const p: string[] = [];
    const sh = await runShift("A", -12_000, { sell: true });
    RM1_SHIFT = sh;
    if (Number(sh.zr?.billCount ?? 0) < 1) notes.push("RM1: บิลไม่ผูกกะ (ข้อความยังเทียบกับ Z จริง)");
    const r = await fire(sh);
    if (r?.ok !== true) p.push(`consumer ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    const ms = await msgs(RM.PUB!);
    if (ms.length !== 1) p.push(`ข้อความ ${ms.length}`);
    const m = ms[0];
    if (m) {
      if (m.authorUserId !== "system:pos") p.push(`ผู้เขียน ${m.authorUserId}`);
      const want = zBody(sh, "A", true);
      if (m.body !== want) p.push(`ข้อความ "${m.body}" (คาด "${want}")`);
    }
    const fl = await flags({ targetId: `pos-room:z:${sh.id}` });
    if (fl.length !== 1) p.push(`ธง ${fl.length}`);
    else if (fl[0].targetType !== "PosTeamRoomPost" || fl[0].actorType !== "SYSTEM") p.push(`ธง ${fl[0].targetType}/${fl[0].actorType}`);
    if ((await cardsKey(`pos-shift:${sh.id}`)).length !== 1) p.push("การ์ดกะไม่เกิด");
    chk("RM1", p.length === 0, "โพสต์ Z 1 ข้อความ + ธง", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const sh = RM1_SHIFT;
    const rs = [await fire(sh), await fire(sh), ...(await Promise.all([fire(sh), fire(sh)]))];
    for (const r of rs) if (r?.ok !== true) p.push(`consumer ${codeOf(r)}`);
    const n = (await msgs(RM.PUB!)).length;
    const f = (await flags({ targetId: `pos-room:z:${sh.id}` })).length;
    if (n !== 1) p.push(`ข้อความ ${n}`);
    if (f !== 1) p.push(`ธง ${f}`);
    chk("RM2", p.length === 0, "ซ้ำ/พร้อมกัน = 1", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    await step("showOverShort false", () => setRoom(ROOM_ON({ posts: { shiftClose: true, showOverShort: false, dailyBrief: false } })));
    const n0 = (await msgs(RM.PUB!)).length;
    const sh = await runShift("A", -13_000);
    const r = await fire(sh);
    if (r?.ok !== true) p.push(`consumer ${codeOf(r)}`);
    const ms = await msgs(RM.PUB!);
    if (ms.length !== n0 + 1) p.push(`ข้อความ +${ms.length - n0}`);
    const m = ms[ms.length - 1];
    if (m && ms.length > n0) {
      const b = String(m.body);
      if (/เงินสด|ขาด|เกิน/.test(b) || b.includes("฿130")) p.push(`มียอดขาด/เกิน "${b}"`);
      const want = zBody(sh, "A", false);
      if (b !== want) p.push(`ข้อความ "${b}" (คาด "${want}")`);
    }
    await step("คืน showOverShort", () => setRoom(ROOM_ON()));
    chk("RM3", p.length === 0, "ซ่อนยอดขาด/เกิน", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    await step("ห้องถูกเก็บ", () => setRoom(ROOM_ON({ defaultRoom: { meetingSystemId: S.MEET, channelId: RM.ARCH } })));
    const w0 = await opsWarn();
    const sh = await runShift("A", -14_000);
    for (const r of [await fire(sh), await fire(sh)]) if (r?.ok !== true) p.push(`consumer throw ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
    const n = (await msgs(RM.ARCH!)).length;
    const f = (await flags({ targetId: `pos-room:z:${sh.id}` })).length;
    if (n !== 0) p.push(`ข้อความในห้องเก็บ ${n}`);
    if (f !== 0) p.push(`ธง ${f} (ต้อง rollback)`);
    const w1 = await opsWarn();
    if (w1 - w0 !== 1) p.push(`ops WARN pos.board +${w1 - w0} (คาด +1)`);
    if ((await cardsKey(`pos-shift:${sh.id}`)).length !== 1) p.push("การ์ดกะไม่เกิด (ห้องพังต้องไม่พาการ์ดพัง)");
    await step("คืนห้อง", () => setRoom(ROOM_ON()));
    chk("RM4", p.length === 0 && !!sh.id, "ห้องเก็บ = rollback + WARN", FXB(joinP(p)));
  }
  const rm5: string[] = [];
  {
    await step("shiftClose ปิด", () => setRoom(ROOM_ON({ posts: { shiftClose: false, showOverShort: true, dailyBrief: false } })));
    const n0 = await countMsgs();
    const sh = await runShift("A", -14_500);
    const r = await fire(sh);
    if (r?.ok !== true) rm5.push(`consumer ${codeOf(r)}`);
    const n1 = await countMsgs();
    if (n1 !== n0) rm5.push(`ข้อความ +${n1 - n0}`);
    if ((await cardsKey(`pos-shift:${sh.id}`)).length !== 1) rm5.push("การ์ดกะไม่เกิด");
    if ((await flags({ targetId: `pos-room:z:${sh.id}` })).length !== 0) rm5.push("มีธงทั้งที่ไม่โพสต์");
    if (!sh.id) rm5.push("ฟิกซ์เจอร์กะ");
  }

  // ══════════ AN จุดผิดปกติ → การ์ด ══════════
  console.log("\n── AN จุดผิดปกติ ──");
  const anRows = async (actorK: string): Promise<Any[]> => {
    const r = await call(reportsMod, "reportAnomalies", pctx(), A(actorK), { from: bkkYmd(new Date(Date.now() - DAY_MS)), to: D0 });
    return r?.ok === true && Array.isArray(r.report?.rows) ? r.report.rows : [];
  };
  const rowsOwner = await anRows("OWNER");
  const a8A = rowsOwner.find((x) => x.rule === "A8" && x.refId === SD1_SHIFT.id);
  const a8B = rowsOwner.find((x) => x.rule === "A8" && x.refId === SD6_SHIFT.id && !!SD6_SHIFT.id);
  const anInput = (row: Any) => ({ unitId: row?.unitId ?? "none", rule: row?.rule ?? "A8", businessDate: row?.businessDate ?? D0, refType: row?.refType ?? "PosShift", refId: row?.refId ?? "none" });
  const anKey = (row: Any) => `pos-anomaly:${row?.rule}:${row?.unitId}:${row?.businessDate}:${row?.refId ?? row?.userId}`;
  const staffNames = () => ["OWNER", "MGR_A", "MGR_B", "CASH", "SUP", "OWNER2"].map((k) => US[k]?.name ?? "");
  {
    const p: string[] = [];
    if (!a8A) p.push(`ตัวควบคุม: reportAnomalies ไม่มีแถว A8 ของกะ SD1 (${rowsOwner.length} แถว)`);
    else {
      const r1 = await call(bridges, "createAnomalyCard", pctx(), A("OWNER"), anInput(a8A));
      if (r1?.ok !== true || r1.created !== true) p.push(`ครั้งแรก ${codeOf(r1)} created ${short(r1?.created)} ${short(r1?.message ?? "", 50)}`);
      const cs = await cardsKey(anKey(a8A));
      if (cs.length !== 1) p.push(`การ์ด ${cs.length} (กุญแจ ${anKey(a8A)})`);
      const c = cs[0];
      if (c) {
        if (c.createdById !== uid("OWNER")) p.push(`createdById ${c.createdById}`);
        const head = `ตรวจจุดผิดปกติ เงินขาด/เกิน · ${UN.A} · ${a8A.businessDate}`;
        if (!String(c.title).startsWith(head)) p.push(`ชื่อ "${c.title}" (ขึ้นต้น "${head}")`);
        if (!String(c.description ?? "").includes("ดูรายละเอียดในรายงานจุดผิดปกติ (ต้องมีสิทธิ์)")) p.push("รายละเอียดไม่มีประโยคชี้รายงาน");
        if (r1?.ok === true && r1.cardNo !== c.cardNo) p.push(`cardNo ${r1.cardNo} ≠ ${c.cardNo}`);
      }
      const r2 = await call(bridges, "createAnomalyCard", pctx(), A("OWNER"), anInput(a8A));
      if (r2?.ok !== true || r2.created !== false || (c && r2.cardNo !== c.cardNo)) p.push(`กดซ้ำ ${codeOf(r2)} created ${short(r2?.created)} cardNo ${short(r2?.cardNo)}`);
      if ((await cardsKey(anKey(a8A))).length !== 1) p.push("กดซ้ำได้การ์ดเพิ่ม");
      const n0 = await countCards();
      const r3 = await call(bridges, "createAnomalyCard", pctx(), A("OWNER"), { ...anInput(a8A), refId: `qc38fake${RAND}` });
      if (r3?.ok !== false || r3?.threw) p.push(`refId ปลอม → ${codeOf(r3)}`);
      if ((await countCards()) !== n0) p.push("refId ปลอมได้การ์ด");
    }
    chk("AN1", p.length === 0, "เจ้าของเปิดการ์ด · กดซ้ำได้ใบเดิม", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const n0 = await countCards();
    const r = await call(bridges, "createAnomalyCard", pctx(), A("CASH"), anInput(a8A ?? { unitId: U.A }));
    if (codeOf(r) !== "PERMISSION_DENIED" || r?.threw) p.push(`แคชเชียร์ → ${codeOf(r)}`);
    if ((await countCards()) !== n0) p.push("แคชเชียร์ได้การ์ด");
    chk("AN2", p.length === 0, "PERMISSION_DENIED", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    // SUP ดูบอร์ด A ได้แค่ VIEWER: สาขา A (ไม่ผูก) ⇒ บอร์ดปริยาย A ⇒ ปฏิเสธ
    const n0 = await countCards();
    const supRows = await anRows("SUP");
    const supA = supRows.find((x) => x.rule === "A8" && x.unitId === U.A && x.refId !== SD1_SHIFT.id); // คนละแถวกับการ์ดของเจ้าของ (AN1) — ไม่ปนกับทางกันซ้ำ
    if (!supA) p.push(`ตัวควบคุม: SUP ไม่เห็นแถว A8 สาขา A (${supRows.length} แถว)`);
    else {
      const r = await call(bridges, "createAnomalyCard", pctx(), A("SUP"), anInput(supA));
      if (codeOf(r) !== "PERMISSION_DENIED" || r?.threw) p.push(`VIEWER บอร์ด A → ${codeOf(r)}`);
      if ((await countCards()) !== n0) p.push("VIEWER ได้การ์ด");
    }
    // ตัวควบคุมบวก: EDITOR บอร์ด B
    let keyB = "";
    if (!a8B) p.push(`ตัวควบคุม: ไม่มีแถว A8 ของกะสาขา B`);
    else {
      keyB = anKey(a8B);
      const r = await call(bridges, "createAnomalyCard", pctx(), A("SUP"), anInput(a8B));
      if (r?.ok !== true || r.created !== true) p.push(`EDITOR บอร์ด B → ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
      const c = (await cardsKey(keyB))[0];
      if (!c || c.boardId !== BD.B || c.createdById !== uid("SUP")) p.push(`การ์ดสาขา B ${c ? `${c.boardId === BD.B ? "" : "บอร์ดผิด "}${c.createdById}` : "ไม่มี"}`);
    }
    for (const c of await cardsBy({ sourceKey: { startsWith: "pos-anomaly:" } })) {
      const h = privacyHits(`${c.title}\n${c.description ?? ""}`, staffNames());
      if (h.length) p.push(`${c.sourceKey}: ${h.join(",")}`);
    }
    const keys = [anKey(a8A), keyB, `pos-anomaly:A1:${U.A}:${D0}:nope${RAND}`].filter(Boolean);
    const lst = await call(bridges, "posCardsForKeys", T, keys);
    const arr: Any[] = Array.isArray(lst) ? lst : Array.isArray(lst?.items) ? lst.items : [];
    if (!Array.isArray(lst) && !Array.isArray(lst?.items)) p.push(`posCardsForKeys → ${codeOf(lst)}`);
    for (const k of [anKey(a8A), keyB].filter((x) => x && !x.includes("undefined"))) {
      const row = arr.find((x) => x?.key === k);
      const c = (await cardsKey(k))[0];
      if (!row) p.push(`ไม่มีแถว ${k.slice(0, 40)}`);
      else if (c) {
        if (row.cardNo !== c.cardNo) p.push(`cardNo ${row.cardNo}≠${c.cardNo}`);
        if (row.href !== `/app/sys/${c.systemId}/kanban/b/${c.boardId}?card=${c.id}`) p.push(`href ${row.href}`);
        if (row.completed !== false) p.push(`completed ${short(row.completed)}`);
      }
    }
    if (arr.some((x) => String(x?.key ?? "").includes(`nope${RAND}`))) p.push("กุญแจที่ไม่มีอยู่ในผล");
    chk("AN3", p.length === 0, "VIEWER ปฏิเสธ · EDITOR ได้ · posCardsForKeys", FXB(joinP(p)));
  }

  // ══════════ X ข้ามร้าน ══════════
  console.log("\n── X ข้ามร้าน ──");
  {
    const p: string[] = [];
    await step("ฉีดบอร์ด T2", async () => {
      await setBoard({ ...BOARD_ON(), defaultBoardId: BD.X });
      await setRoom(ROOM_OFF());
    });
    const x0 = await countCards(T2);
    const t0 = await countCards(T);
    const sh = await runShift("A", -16_000);
    const r = await fire(sh);
    if (r?.ok !== true) p.push(`consumer throw ${codeOf(r)}`);
    if ((await cardsKey(`pos-shift:${sh.id}`)).length !== 0) p.push("มีการ์ดของกะนี้ใน T1");
    if ((await cardsKey(`pos-shift:${sh.id}`, T2)).length !== 0) p.push("มีการ์ดของกะนี้ใน T2");
    if ((await countCards(T2)) !== x0) p.push("บอร์ด T2 การ์ดเพิ่ม");
    if ((await countCards(T)) !== t0) p.push("T1 การ์ดเพิ่ม");
    await step("คืนบอร์ด", () => setBoard(BOARD_ON()));
    chk("X1", p.length === 0 && !!sh.id, "id บอร์ดร้านอื่น = ไม่มีการ์ด", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    await step("ค่าตั้ง T2", async () => {
      await setBoard({ ...BOARD_ON(), defaultBoardId: BD.X, boardByUnit: {} }, S.POSX);
      await setRoom({ enabled: true, defaultRoom: { meetingSystemId: S.MEETX, channelId: RM.X }, roomByUnit: {}, posts: { shiftClose: true, showOverShort: true, dailyBrief: false }, briefHourBkk: 7, enabledByUserId: uid("OWNER2") }, S.POSX);
    });
    const t1 = { c: await countCards(T), m: await countMsgs(T), f: (await flags()).length };
    const sh = await runShift("X", -25_000);
    const r = await fire(sh);
    if (r?.ok !== true) p.push(`consumer T2 ${codeOf(r)}`);
    const cx = await cardsKey(`pos-shift:${sh.id}`, T2);
    if (cx.length !== 1 || cx[0]?.boardId !== BD.X) p.push(`การ์ด T2 ${cx.length}`);
    if ((await msgs(RM.X!, T2)).length !== 1) p.push("ข้อความห้อง T2 ไม่ใช่ 1");
    const sx = await sweep(T2);
    if (threwOrMissing(sx)) p.push(`sweep T2 ${codeOf(sx)}`);
    const t1b = { c: await countCards(T), m: await countMsgs(T), f: (await flags()).length };
    if (C(t1) !== C(t1b)) p.push(`T1 เปลี่ยน ${short(t1)}→${short(t1b)}`);
    const t2 = { c: await countCards(T2), m: await countMsgs(T2) };
    const st = await sweep(T);
    if (threwOrMissing(st)) p.push(`sweep T1 ${codeOf(st)}`);
    const t2b = { c: await countCards(T2), m: await countMsgs(T2) };
    if (C(t2) !== C(t2b)) p.push(`T2 เปลี่ยนหลัง sweep T1 ${short(t2)}→${short(t2b)}`);
    chk("X2", p.length === 0 && !!sh.id, "ร้านละบอร์ด/ห้องของตัวเอง", FXB(joinP(p)));
  }

  // ══════════ FC facts ══════════
  console.log("\n── FC facts ──");
  {
    const p: string[] = [];
    const kanbanCard = async () => {
      const r = await call(integ, "posIntegrationCards", ctxU("A"), A("OWNER"), {});
      return r?.ok === true && Array.isArray(r.cards) ? r.cards.find((c: Any) => c.code === "KANBAN") : { _err: codeOf(r) };
    };
    const k1 = await kanbanCard();
    if (!k1 || k1._err) p.push(`posIntegrationCards ${k1?._err ?? "ไม่มีการ์ด KANBAN"}`);
    else {
      for (const key of ["stockOutShiftDiffCard", "shiftCloseCashCheck"]) {
        const f = (k1.facts ?? []).find((x: Any) => x.key === key);
        if (!f || f.live !== true || f.phase !== null) p.push(`${key} ${short(f ? { live: f.live, phase: f.phase } : "ไม่มี")}`);
      }
      for (const key of ["voidBillCard", "issueReportCard"]) {
        const f = (k1.facts ?? []).find((x: Any) => x.key === key);
        if (!f || f.live !== true) p.push(`${key} เปลี่ยน`);
      }
      if (k1.state !== "LINKED") p.push(`state ${k1.state} (คาด LINKED จาก settings.pos.board)`);
    }
    await step("ปิด board", () => setBoard({ ...BOARD_ON(), enabled: false }));
    const k2 = await kanbanCard();
    if (!k2 || k2.state !== "OFF") p.push(`board.enabled false → ${k2?.state ?? k2?._err}`);
    await step("คืน board", () => setBoard(BOARD_ON()));
    chk("FC1", p.length === 0, "facts true · LINKED/OFF", FXB(joinP(p)));
  }

  // ══════════ RM5 ส่วน R8 สรุปเช้า (เวลาฉีด · ทำท้ายสุดเพราะเลื่อนนาฬิกาของ sweep) ══════════
  if (!BRIEF_READY) {
    const why = BRIEF_FILE
      ? `R8 สรุปเช้าในห้อง: SKIP — มี ${F.briefShared} แล้วแต่ pos-board-bridges ยังไม่ต่อสาย ai-brief (⚠️ ผู้คุม: P3.9 merge แล้ว ⇒ R8 ต้องอยู่ในใบนี้ หรือออก P3.8b · บังคับตรวจ P38_R8=1)`
      : `R8 สรุปเช้าในห้อง: SKIP — ${F.briefShared} (P3.9 S) ยังไม่มี (มติ 4: ถ้า P3.8 S merge ก่อน ⇒ P3.8b)`;
    skippedParts.push(why);
    console.log(`  ⏭️  ${why}`);
  } else {
    await step("เปิดสรุปเช้า", () => setRoom(ROOM_ON({ posts: { shiftClose: false, showOverShort: true, dailyBrief: true }, briefHourBkk: 7, enabledByUserId: uid("OWNER") })));
    const bf = async () => (await flags({ targetId: { startsWith: `pos-room:brief:${S.POS}:${RM.PUB}:` } })).length;
    const m0 = (await msgs(RM.PUB!)).length;
    const s1 = await sweep(T, at(0, 6, 10));
    if (threwOrMissing(s1)) rm5.push(`R8 sweep 06:10 ${codeOf(s1)}`);
    if ((await bf()) !== 0) rm5.push("R8 โพสต์ก่อนเวลา");
    const s2 = await sweep(T, at(0, 10, 0));
    if (threwOrMissing(s2)) rm5.push(`R8 sweep 10:00 ${codeOf(s2)}`);
    if ((await bf()) !== 1) rm5.push(`R8 catch-up 10:00 ธง ${await bf()}`);
    await sweep(T, at(0, 10, 20));
    if ((await bf()) !== 1) rm5.push(`R8 ซ้ำ ธง ${await bf()}`);
    const ms = (await msgs(RM.PUB!)).slice(m0);
    if (ms.length !== 1) rm5.push(`R8 ข้อความ ${ms.length}`);
    for (const m of ms) {
      if (m.authorUserId !== "system:pos") rm5.push(`R8 ผู้เขียน ${m.authorUserId}`);
      if (/จุดผิดปกติ|Anomal|ขาด|เกิน|รออนุมัติ|ข้อเสนอ AI|A\d{1,2} ×/.test(String(m.body))) rm5.push(`R8 มีส่วนห้าม "${short(m.body, 60)}"`);
    }
    await step("ผู้เปิดไม่ใช่ OWNER", () => setRoom(ROOM_ON({ posts: { shiftClose: false, showOverShort: true, dailyBrief: true }, briefHourBkk: 7, enabledByUserId: uid("MGR_A") })));
    const before = await bf();
    const s3 = await sweep(T, at(1, 7, 10));
    if (threwOrMissing(s3)) rm5.push(`R8 sweep พรุ่งนี้ ${codeOf(s3)}`);
    if ((await bf()) !== before) rm5.push("R8 ผู้เปิดไม่ใช่ OWNER ยังโพสต์");
  }
  chk("RM5", rm5.length === 0, `shiftClose ปิด = การ์ดอย่างเดียว${BRIEF_READY ? " · R8 ครั้งเดียว/วัน" : " (R8 SKIP)"}`, FXB(joinP(rm5)));

  // ══════════ PV1 ความเป็นส่วนตัวทั้งรอบ ══════════
  {
    const p: string[] = [];
    const names = [...staffNames(), CUST_NAME, CUST_PHONE];
    // ตัวควบคุมบวก: ตัวตรวจต้องจับของปลอมได้
    const planted = [`โทร 089-123-4567`, `ทิป ฿20`, `commission 5%`, `ผู้ปิดกะ ${US.CASH?.name ?? "สมศรี แคชเชียร์"}`, `เงินเดือน ฿15,000`];
    for (const s of planted) if (privacyHits(s, names).length === 0) p.push(`ตัวตรวจพลาด "${s}"`);
    if (privacyHits(`ตรวจเงินกะ Z#3 · สาขาA · เคาน์เตอร์ · ขาด ฿150`, names).length) p.push("ตัวตรวจจับผิด (false positive)");
    const cards = (await P.kanbanCard.findMany({ where: { tenantId: { in: [T, T2] } }, select: { id: true, title: true, description: true, sourceKey: true } }).catch(() => [])) as Any[];
    const links = (await P.kanbanCardLink.findMany({ where: { tenantId: { in: [T, T2] } }, select: { cardId: true, label: true, linkId: true } }).catch(() => [])) as Any[];
    const comments = (await P.kanbanComment.findMany({ where: { tenantId: { in: [T, T2] } }, select: { cardId: true, body: true } }).catch(() => [])) as Any[];
    const ms = (await P.meetingMessage.findMany({ where: { tenantId: { in: [T, T2] } }, select: { id: true, body: true } }).catch(() => [])) as Any[];
    for (const c of cards) allTexts.push(`[card ${c.sourceKey}] ${c.title}\n${c.description ?? ""}`);
    for (const l of links) allTexts.push(`[link] ${l.label ?? ""} ${l.linkId}`);
    for (const c of comments) allTexts.push(`[comment] ${c.body}`);
    for (const m of ms) allTexts.push(`[room] ${m.body}`);
    for (const t of allTexts) {
      const h = privacyHits(t, names);
      if (h.length) p.push(`${t.slice(0, 40)}: ${h.join(",")}`);
    }
    if (cards.length === 0) p.push("ไม่มีการ์ดให้ตรวจ (ตัวตรวจไม่ได้พิสูจน์อะไร)");
    chk("PV1", p.length === 0, "ไม่มีชื่อ/เบอร์/ทิป/ค่าคอม/เงินเดือน", FXB(`${joinP(p)} · ตรวจ ${allTexts.length} ข้อความ`));
  }
  if (notes.length) console.log(`  (หมายเหตุฟิกซ์เจอร์ ${notes.length}: ${notes.slice(0, 6).join(" | ")})`);
}

// ═════════════════════════ 6. คืนสภาพ ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; err: string };
async function wipeTenant(tid: string, slug: string): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, err: "" };
  if (!tid) return rep;
  try {
    const t = (await P.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, tid)) as Any[];
    if (t.length && t[0].slug !== slug) {
      rep.err = `slug ไม่ตรง (${t[0].slug}) — ไม่ลบ`;
      return rep;
    }
  } catch (e) {
    rep.err = `อ่าน Tenant ไม่ได้: ${(e as Error).message.slice(0, 60)}`;
    return rep;
  }
  const tables = ((await P.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
     WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
  )) as Any[]).map((r: Any) => String(r.t));
  rep.tables = tables.length;
  await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
  await P.$executeRawUnsafe(`UPDATE "Customer" SET "mergedIntoId" = NULL, "referredById" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
  await P.$executeRawUnsafe(`UPDATE "MeetingMessage" SET "threadParentId" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
  let pending = [...tables];
  for (let pass = 0; pass < 12 && pending.length; pass++) {
    const next: string[] = [];
    for (const tb of pending) {
      try {
        await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, tid);
      } catch {
        next.push(tb);
      }
    }
    pending = next;
  }
  try {
    await P.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $2`, tid, slug);
  } catch (e) {
    rep.err = `ลบ Tenant ไม่ได้: ${(e as Error).message.slice(0, 80)}`;
  }
  for (const tb of tables) {
    try {
      const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, tid)) as Any[])[0]?.n ?? 0);
      if (n) rep.left[tb] = n;
    } catch {
      rep.left[tb] = -1;
    }
  }
  rep.tenantLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`, tid)) as Any[])[0]?.n ?? 0);
  return rep;
}

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
const wipes: WipeReport[] = [];
let usersLeft = -1;
try {
  runStatic();
  finishStatic();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  installFetchGuard();
  try {
    await sleep(1500); // ให้ drain พื้นหลังของรอบนี้ (scheduleDrain หลังปิดกะ) จบก่อนลบ
    for (const [tid, slug] of [[T, T_SLUG], [T2, T2_SLUG]] as const) {
      let w = await wipeTenant(tid, slug);
      if (Object.keys(w.left).length || w.tenantLeft) {
        await sleep(1500);
        w = await wipeTenant(tid, slug);
      }
      wipes.push(w);
      const residue = Object.values(w.left).reduce((a, b) => a + Math.abs(b), 0) + w.tenantLeft;
      console.log(`  ลบร้านชั่วคราว ${tid || "(ไม่ได้สร้าง)"}: ${w.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(w.left)} · Tenant ${w.tenantLeft}${w.err ? ` · ${w.err}` : ""}`);
    }
    await P.$executeRawUnsafe(`DELETE FROM "User" WHERE email LIKE $1`, `${T_SLUG}%@qc.invalid`).catch(() => {});
    usersLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, `${T_SLUG}%@qc.invalid`)) as Any[])[0]?.n ?? -1);
  } catch (e) {
    wipes.push({ tables: 0, left: {}, tenantLeft: 0, err: `cleanup: ${(e as Error).message.slice(0, 200)}` });
    console.log(`💥 cleanup ${(e as Error).message.slice(0, 200)}`);
  } finally {
    removeFetchGuard();
  }
}
await sleep(200);
const tempLeft = wipes.flatMap((w) => Object.entries(w.left).map(([k, v]) => `${k}:${v}`));
const tenantLeft = wipes.reduce((a, w) => a + w.tenantLeft, 0);
const wipeErr = wipes.map((w) => w.err).filter(Boolean).join(" · ");
chk("Z1", tempLeft.length === 0 && tenantLeft === 0 && !wipeErr && usersLeft === 0, "ร้านชั่วคราว 0 แถว · Tenant ถูกลบ · User 0", [tempLeft.length ? `เหลือ ${tempLeft.join(", ")}` : `0 แถว (${wipes[0]?.tables ?? 0} ตาราง × ${wipes.length} ร้าน)`, tenantLeft ? "Tenant ยังอยู่" : "", wipeErr, `User ${usersLeft}`].filter(Boolean).join(" · "));
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
const fpErr = Object.values(fpBefore).some((v) => v.startsWith("err"));
chk("Z2", fpDrift.length === 0 && !fpErr, "ลายนิ้วมือเท่าเดิม", fpDrift.length ? `ต่าง ${fpDrift.join(", ")}` : `เท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`);
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
for (const s of skippedParts) console.log(`  ⏭️  ${s}`);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, skippedParts, forced: FORCE, missing: skipReasons, base: BASE, guardHits: guardHits.length, residue: tempLeft.length + tenantLeft + Math.max(0, usersLeft) })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P3.8 S: แท็บตั้งค่า "บอร์ดงาน/ห้องทีม" + ปุ่มสร้างบอร์ด + ปุ่ม "สร้างการ์ด" ในรายงานจุดผิดปกติ + ชิปการ์ดในหน้ากะ (P3.8U · ภาพ) ·
//   การ์ดออเดอร์ถูกปฏิเสธทุกใบ · ออเดอร์ค้าง · เครื่องออฟไลน์/เครื่องพิมพ์ · ซิงก์ล้ม (หลัง P3.4) · การ์ดจุดผิดปกติอัตโนมัติ · วาระประชุม · การ์ด void/อนุมัติของ K3.3 (คงเดิม)
// ไม่มี hunter (มติ 10 · ไม่แตะเงิน) — ผู้ตรวจ R1 เน้นความเป็นส่วนตัว + กันซ้ำพร้อมกัน (sourceKey race · advisory lock ของห้อง)
