// QC — POS RUN ใบ P5.2 (ครึ่งแรก): ตารางสิทธิ์ + oracle แดงก่อน (สิทธิ์ · ข้ามร้าน/สาขา · หน้าสาธารณะ · คีย์ REST · ลายเซ็น/เล่นซ้ำ)
//   brief = ledger/pos-briefs/pos-brief-P5.md §4 P5.2 · §8 · §10 addendum (ruling 3 ตารางเดียว · 5 โทเคน/เพดาน · 6 เล่นซ้ำ) · โน้ต = ledger/wo-notes/pos-P5.2-oracle.md
//   ตาราง = scripts/pos-authz-matrix.json (สร้างด้วย scripts/pos-authz-matrix-gen.mts --write) — ทุกข้ออ้างแถวที่พิสูจน์ (ช่อง ref ในทะเบียน)
//
// รัน:  env -C <tree> ISO_MEM=3G bash scripts/iso.sh bash scripts/qc4.sh env QC_FORCE=1 GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p5.2.mts
//       --list  = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต (M* · P*-static · S*-static · N* · F10a) ไม่โหลด prisma
//       --self-test = เฉพาะ probe กลับค่า N1–N8 (ตัวตัดสิน pure ต้องแดงได้จริง) ไม่แตะ DB
//   ORACLE-EDIT (P5.2 oracle2 · 23 ต.ค. · hunter L1 ledger/wo-notes/pos-P5.2-hunt-L1.md): + X3 X4 X5 K3 D1 D2 D3 D11 H6b F7 F8 F9 F10a F10b · F4/F11 = accepted-pending-owner (W37/W38 —
//     พิมพ์ผลแต่ไม่นับในด่าน) · N5–N8 · โน้ต ledger/wo-notes/pos-P5.2-oracle2.md
//   ORACLE-EDIT (CD-P52-O4 · R1 ของ fix D+E+device · ledger/wo-notes/pos-P5.2-fix-de-dev.md §R1 round 1): + D4 (F1 ทางขายผูกเครื่องจากคุกกี้) ·
//     F6 ไม่มี POS_DEVICE_KEY ใน env ⇒ สุ่มกุญแจในโปรเซสของรอบนี้ (ไม่พิมพ์ ไม่เขียนไฟล์) + D1 ข้อย่อยกุญแจไม่ตั้ง (ล้างในโปรเซสชั่วคราว) ·
//     F3 D1 นับ audit pos.device.pair +1 ต่อการจับคู่ (รวมจับคู่ซ้ำ) · F5 H6b MANAGER ระบุทุกสาขา ≠ "*" ⇒ ทิป/เครดิต ปฏิเสธ · MANAGER("*") ⇒ ได้ ·
//     F7 (ข้อ F7 เดิม) ขายผ่านคุกกี้เครื่อง F7 ที่จับคู่ในรอบ (ทางขายไม่เชื่อ deviceId ของ client แล้ว)
//       P52_PIN = ฐานของข้อสอบ (ค่าเริ่มต้น 2fb1fe8e) · P52_LANE_PIN = หมุดเลน (ไม่มีข้อ diff — พิมพ์ไว้เท่านั้น)
// DB: QC4 เท่านั้น · ร้านชั่วคราว posqc-p52-<rand> (A: 2 สาขา) + posqc-p52-<rand>-b (B: ร้านอื่น) ลบทั้งร้านใน finally ·
//     ร้าน QC resto/coffee อ่านอย่างเดียว (T3 · P4 · P7) + ลายนิ้วมือก่อน/หลัง (Z2) · ไม่ reseed · ไม่มีเครือข่าย (fetch = ตัวกั้น 503)
// ไม่มีด่าน SKIP (ทุก surface มีอยู่แล้ว) ⇒ QC_FORCE ไม่มีผล · ข้อที่เขียวบนฐานเพราะโค้ดถูก = จดใน notes · N1–N4 = probe กลับค่า (ตัวตัดสินแดงได้จริง)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p5.2";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const SELFTEST = process.argv.includes("--self-test"); // ORACLE-EDIT (P5.2 oracle2)
const FORCE = process.env.QC_FORCE === "1";
// ORACLE-EDIT (CD-P52-O4 F6): ไม่มี POS_DEVICE_KEY (≥ 32) ใน env ⇒ กุญแจสุ่มในโปรเซสของรอบนี้เท่านั้น (ไม่พิมพ์ · ไม่เขียนไฟล์) — ทางลงนาม/ตัวควบคุมบวก D1–D4 รันทุกรอบ ·
//   ข้อย่อย "กุญแจไม่ตั้ง" ของ D1 ล้างค่าในโปรเซสชั่วคราวแล้วคืน · DEVICE_KEY_SOURCE พิมพ์ใน JSON_SUMMARY (env | in-process)
const DEVICE_KEY_SOURCE = typeof process.env.POS_DEVICE_KEY === "string" && process.env.POS_DEVICE_KEY.trim().length >= 32 ? "env" : "in-process";
if (DEVICE_KEY_SOURCE === "in-process") process.env.POS_DEVICE_KEY = randomBytes(32).toString("hex");
/** ฐานของข้อสอบ (session/pos ตอนเขียน) — env override */
// ORACLE-EDIT (P5.2 oracle2): ฐาน = session/pos c067c628 (ตอนเขียนส่วนขยาย · เดิม 2fb1fe8e) — ข้อสอบนี้ไม่มีข้อ diff เทียบหมุด (พิมพ์อย่างเดียว)
const PIN = process.env.P52_PIN || "c067c628";
/** หมุดเลน (ข้อสอบนี้ไม่มีข้อ diff เทียบหมุด — พิมพ์ไว้ให้ผู้คุม) */
const LANE_PIN = process.env.P52_LANE_PIN || PIN;

// ═════════════════════════ ทะเบียนข้อสอบ D(id · กลุ่ม · หัวข้อ · แถวตารางที่พิสูจน์) ═════════════════════════
type Def = readonly [string, string, string, string];
const D = (id: string, x: string, title: string, ref: string): Def => [`P5.2-${id}`, x, title, ref] as const;
const CHECKS: readonly Def[] = [
  D("M1", "S", "[ruling 3] ตาราง ⊇ ทุก surface ที่สแกนเจอ (page · action · route · REST op) และไม่มีแถวค้างที่หายจากโค้ด", "rows[*]"),
  D("M2", "S", "ทุกแถวมีหลักฐาน file:line ที่มีจริง · อยู่ในไฟล์/ตัวฟังก์ชันของ surface นั้น · บรรทัดมีเครื่องหมายด่าน (หรือแถวคงที่ที่ไม่มีข้อมูลร้าน)", "rows[*].evidence"),
  D("M3", "S", "coveredBy ทุก id มีไฟล์ scripts/<id>.mts และอยู่ใน pos-gates.json", "rows[*].coveredBy"),
  D("M4", "S", "รูปตาราง: เรียงตาม surface ไม่ซ้ำ · kind ถูก · ครบ 9 บทบาท ค่าในชุด · ไม่มี ? บนแถว action/page", "rows[*].roles"),
  D("M5", "S", "ตารางตรงกับตัวสร้าง (pos-authz-matrix-gen --check) — โค้ดเปลี่ยนแต่ไม่ regenerate = แดง", "$generator"),
  D("P1", "S", "[ruling 5 · static] โทเคนสาธารณะจาก crypto ≥ 60 บิต: ใบเสร็จ 12×5 · ออเดอร์ 12×5 · ลิงก์ 16×5 · จอ 32 ไบต์ · intent 12 ไบต์ · ตัวช่วยพิมพ์ 32 ไบต์ · ไม่มี Math.random", "(store)/r · /q/o · /q · /d · beam webhook · print-agent"),
  D("P2", "S", "[ruling 5 · static · ORACLE-EDIT CD-P52-F4] QR โต๊ะ (RestaurantTable.qrToken) ≥ 60 บิตตั้งแต่สร้าง: ทุกจุดสร้างตั้ง qrToken จากตัวสร้าง randomBytes ของ crypto (≥ 60 บิต) · rotateQr ใช้ตัวสร้างเดียวกัน (schema @default(cuid()) คงไว้ — ไม่ถูกใช้)", "src/app/(store)/q/t/[qrToken]/page.tsx"),
  D("P3", "S", "[static] โทเคนผิดรูป = ปฏิเสธก่อนแตะ DB (saleForToken · tableCtx · linkCtx · orderOfToken · rowOfToken · agentOf)", "public rows"),
  D("P4", "P", "[db] 404 ไม่ใช่ 403: โทเคนผิดรูป = โทเคนรูปถูกแต่ไม่มี (รหัสเดียวกัน) · QR โต๊ะจริงของ resto = สาขาของ resto เท่านั้น (ผูกโทเคน)", "(store)/r · /q/t · /q · /q/o"),
  D("P5", "S", "[ruling 5 · static] เพดานต่อ IP บนแขนงใบเสร็จ POS: หน้า /r/<token> แขนง POS + publicReceiptAction + แจ้งปัญหา/ขอใบกำกับ/รีวิว", "src/app/(store)/r/[token]/page.tsx · pos-receipt-actions.ts#*"),
  D("P6", "S", "[ruling 5 · static · ORACLE-EDIT CD-P52-F3b] กันไล่เดาโทเคนของ /q ที่ qrGuard: peek ถังพลาดต่อ IP ก่อน body · TOKEN_INVALID = นับพลาด · โทเคนจริง = ถังต่อ (IP, แฮชโทเคน) · 12 ประตูส่ง gate · ทุกจุดเรียกใต้ (store)/q ส่ง {ip}", "src/app/(store)/q/actions.ts#* · /q pages"),
  D("P9", "P", "[db · self-test CD-P52-F3b] linkDoor โทเคนจริง: IP เดียวอ่านครบงบ → ครั้งถัดไป RATE_LIMITED · IP ที่สองยังอ่านได้ · IP เดิมอ่านโทเคนที่สองได้ (ต่อโทเคน) · พลาดครบงบจาก IP หนึ่ง → โทเคนจริงจาก IP นั้น = TOKEN_INVALID · ไม่มี meta = ไม่นับ", "src/lib/modules/pos/qr-order.ts#qrGuard"),
  D("P7", "P", "[db · PDPA] ใบเสร็จสาธารณะไม่มีข้อมูลสมาชิก: ไม่มี id/ชื่อ/เบอร์/อีเมลของสมาชิก ไม่มี memberId/tenantId/unitId (บิลสมาชิกของ coffee · อ่านอย่างเดียว)", "src/app/(store)/r/[token]/pos-receipt-actions.ts#publicReceiptAction"),
  D("P8", "S", "[static] action สาธารณะรับแค่โทเคน + ข้อมูลที่ลูกค้ากรอก (ไม่มีพารามิเตอร์ tenantId/unitId/systemId/saleId)", "kind public · (store)/**/actions.ts"),
  D("R1", "R", "[db] CASHIER (pos.sale.create ที่สาขา A) × ทุกแถว action ที่ CASHIER=deny → ปฏิเสธ (ไม่ ok · ไม่ throw)", "rows[kind=action, CASHIER=deny]"),
  D("R2", "R", "[db] STAFF_NOPERM (ไม่มีคีย์ POS) × ทุกแถว action ที่ STAFF_NOPERM=deny → ปฏิเสธ", "rows[kind=action, STAFF_NOPERM=deny]"),
  D("R3", "R", "[db] คำปฏิเสธของ R1/R2 เป็นรหัสสิทธิ์/ไม่พบ (PERMISSION_DENIED · NO_PERMISSION · NOT_FOUND …) ไม่ใช่ VALIDATION/UNKNOWN ก่อนตรวจสิทธิ์", "rows[R1 ∪ R2]"),
  D("R4", "R", "[db] ANON (ไม่มี session) × ทุกแถว action → redirect /login หรือคำปฏิเสธ · ไม่มี ok:true", "rows[kind=action].ANON"),
  D("R5", "R", "[db] ตัวควบคุมบวก: OWNER/MANAGER/CASHIER ของสาขา A อ่านบิล A ได้ (ok + เห็นเลขบิล) — harness เห็นข้อมูลจริง ⇒ ผลลบมีความหมาย", "bills-actions.ts#billDetailAction · receipt-actions.ts#receiptPayloadAction"),
  D("T1", "X", "[db] OTHER_TENANT: OWNER ร้าน B × ทุกแถว action ด้วย id ระบบ/สาขา/บิลของร้าน A → ไม่เห็นข้อมูล A · แถวของ A ไม่เปลี่ยน · ไม่มีแถวของ B ที่อ้างระบบ/สาขาของ A", "rows[kind=action].OTHER_TENANT"),
  D("T2", "X", "[db] OTHER_UNIT (X2/IDOR): MANAGER สาขา A1 × แถว unitScoped ด้วย unitId/บิลของสาขา A2 → ไม่เห็นบิล A2 · แถวของ A2 ไม่เปลี่ยน", "rows[unitScoped, OTHER_UNIT=deny]"),
  D("T3", "X", "[db] ร้าน QC resto (อ่านอย่างเดียว): OWNER ร้าน A × แถวอ่าน ด้วย id ระบบ/สาขา/บิลของ resto → ไม่เห็นข้อมูล resto · ลายนิ้วมือ resto เท่าเดิม", "rows[read allowlist]"),
  D("K1", "K", "[db] REST {id} ข้ามร้าน: คีย์ pos-admin ของร้าน A × ทุก op ที่มี {id} ด้วยบิลของร้าน B → GET 404 · เขียนไม่ 2xx · ไม่เห็นข้อมูล B · บิล B ไม่เปลี่ยน", "rows[rest:* {id}]"),
  D("K2", "K", "[db] REST ตัวกรองสาขา: คีย์ pos-admin + pos.filter.unit:A1 × GET/POST {id} ของบิล A2 → 404/ไม่ 2xx · ตัวควบคุมบวก GET บิล A1 = 200", "rest:GET /sales/{id} · rest:POST /sales/{id}/void"),
  D("S1", "S", "[static] เทียบลายเซ็นแบบ timing-safe (Beam · x-shark-signature) · โทเคนเครื่อง/จอค้นด้วย hash · route ไม่ log เนื้อคำขอดิบ/ค่าลับ/หัว authorization", "beam webhook · platform · print-agent · /d"),
  D("S2", "S", "[ruling 6 · static] แพลตฟอร์มขาเข้า: ลายเซ็นถูก = 503 ADAPTER_PENDING ไม่มีการเขียน ⇒ เล่นซ้ำไม่มีผล (nonce/timestamp = adapter จริง · H6)", "src/app/api/pos/platform/[provider]/[channelId]/route.ts#POST"),
  D("S3", "S", "[ruling 6 · db] Beam webhook route: ลายเซ็นผิด = 401 ไม่เปลี่ยน · body เดิม ×2 = 200 ×2 · ใบขอรับเงิน PAID ครั้งเดียว · paidAt เดิม · outbox 1 แถว", "src/app/api/payment/beam/webhook/route.ts#POST"),
  D("S4", "S", "[ruling 6 · db] print-agent ack route: ack ok ×2 = 200 ×2 สถานะ DONE · doneAt เดิม · ack ด้วยโทเคนของร้านอื่น ≠ 200", "src/app/api/pos/print-agent/jobs/[id]/ack/route.ts#POST"),
  D("N1", "N", "[probe กลับค่า] ตัวตัดสิน M1 กับตารางที่ตัดแถว action ออก 1 แถว → ต้องรายงาน unlisted 1", "M1"),
  D("N2", "N", "[probe กลับค่า] ตัวตัดสิน R (denied) กับผล ok:true / data[] ไม่ว่าง → ต้องไม่ผ่าน · คำปฏิเสธ → ผ่าน", "R1 R2 R4"),
  D("N3", "N", "[probe กลับค่า] ตัวตัดสินเอนโทรปี: 11×5 บิต (55) → แดง · Math.random → แดง · 12×5 crypto → ผ่าน", "P1 P2"),
  D("N4", "N", "[probe กลับค่า] ตัวตัดสินรั่ว: ผลที่มีเลขบิลแฝง → รั่ว · ไม่มี → ไม่รั่ว", "T1 T2 T3 K1"),
  // ═══ ORACLE-EDIT (P5.2 oracle2 · hunter L1 F1–F11 · มติผู้คุม 23 ต.ค.) ═══
  D("X3", "X", "[db · F-blind 1–5] A1 × วัตถุ A2 ทุกชนิด (บิล · โต๊ะ · ออเดอร์ · กะ · บิลพัก · คำขออนุมัติ · เครื่อง · intent · สลิป): MANAGER[A1] unitId A1 / ไม่ส่ง unitId + STAFF คีย์ POS ครบ[A1] → ไม่เห็น A2 (เลขบิล · รายการ · ยอดรวม · ลูกค้า · เครื่อง · โต๊ะ · บิลพัก · สลิป) · แถว A2 ไม่เปลี่ยน · ตัวควบคุมบวก", "rows[unitScoped, OTHER_UNIT=deny]"),
  D("X4", "X", "[db · F1 HIGH] คำขอ POS_VOID/POS_REFUND/POS_DISCOUNT_OVER ของ A2: listPending ของ MANAGER[A1] ไม่มี · decideAction(APPROVED)/bulkDecideAction(REJECTED) ของ MANAGER[A1] ไม่สำเร็จ · คำขอยัง PENDING · บิล A2 ยัง PAID · ตัวควบคุมบวก MANAGER[A2]", "src/lib/modules/approval/actions.ts#decideAction · #bulkDecideAction · src/app/app/approvals/page.tsx"),
  // ORACLE-EDIT (CD-P52-O3-2 · R1 F2 · ผู้คุม 23 ต.ค. · ledger/wo-notes/pos-P5.2-fix-abcf-review.md F2): ยึดส่วนลดที่อนุมัติ ณ ตอนขาย ต้องตรวจสิทธิ์สดของผู้ตัดสินเหมือนตัวรับคิว
  D("X4b", "X", "[db · R1 F2 · CD-P52-O3-2] ผู้ตัดสินเสียสิทธิ์หลังอนุมัติ: ผู้ขาย A2 (STAFF เพดาน 10%) ลด 15% → คำขอ POS_DISCOUNT_OVER · MANAGER[A2] อนุมัติ → บิลพักผูกคำขอ · ย้ายสิทธิ์สาขาของผู้ตัดสินไป A1 → submit {heldCartId} = DISCOUNT_EXCEEDS_LIMIT ไม่มีบิล · ตัวควบคุมบวก คืนสิทธิ์ A2 → ผ่าน via approved (audit pos.discount.override requestId + byUserId ผู้ตัดสิน)", "src/lib/modules/pos/pos-approval.ts#approvedDiscountOf · register.ts regResolveOverrideCap"),
  D("X5", "R", "[db · F2] ลำดับชั้น PIN: MANAGER[A1] ตั้ง/ปลดล็อก PIN ของ OWNER · lead (STAFF + pos.staff.manage) ตั้ง/ปลดล็อก PIN ของ MANAGER → PERMISSION_DENIED + แถว PIN เดิม · ตัวควบคุมบวก ตั้ง PIN แคชเชียร์ได้", "src/lib/modules/pos/staff-pin-actions.ts#setStaffPinAction · #unlockStaffPinAction"),
  D("K3", "K", "[db · F3] คีย์กลาง (scope ว่าง) × POST /api/v1/ai/tools/sales_summary · sales_by_day → 403 · ตัวควบคุมบวก คีย์ pos-read = 200", "src/app/api/v1/ai/tools/[name]/route.ts#POST"),
  D("D1", "D", "[db · §10.4 D1c] จับคู่เครื่อง: แคชเชียร์ registerDeviceAction → ปฏิเสธ · OWNER → ได้คุกกี้เครื่องที่ลงนาม (ไม่ใช่รหัสเครื่องเปล่า) หรือปฏิเสธเพราะยังไม่ตั้งกุญแจ (ไม่มีแถว) · ไฟล์เครื่อง/กะไม่ใช้ CHAT_/POS_CREDENTIALS_KEY", "src/lib/modules/pos/device-actions.ts#registerDeviceAction"),
  D("D2", "D", "[db · §10.4 D1c] เปิดกะผูกเครื่องจากคุกกี้: STAFF (กะ) อ้าง deviceId ของเครื่อง A1 อื่นจาก client → ปฏิเสธ/ไม่ผูก · คุกกี้ที่ถูกแก้ → ปฏิเสธ · ตัวควบคุมบวก คุกกี้จาก D1 = เปิดได้", "src/lib/modules/pos/shift-actions.ts#openShiftAction"),
  D("D3", "D", "[db · §10.4 D1c · F11 X] รายงาน X: STAFF (กะ ไม่มี manage) อ้าง deviceId ของกะคนอื่นจาก client → PERMISSION_DENIED · ตัวควบคุมบวก คุกกี้เครื่องของกะ = อ่านได้", "src/lib/modules/pos/shift-actions.ts#xReportAction"),
  D("D4", "D", "[db · CD-P52-O4 F1] ทางขาย: STAFF ขาย ไม่มีคุกกี้ อ้างเครื่อง Z (กะ OWNER) → ไม่ผูกกะ Z (ขาย · สถานะ · staffToken ของ Z · PIN ผู้จัดการ) · คุกกี้เครื่อง P4 + อ้าง Z = บิลผูกกะของ P4 · staffToken ของ Z บนคุกกี้ P4 = STAFF_TOKEN_INVALID · เครื่องเพิกถอน = DEVICE_REVOKED · เงินเข้า/ออกไม่ส่ง deviceId + ไม่มีคุกกี้ = DEVICE_NOT_PAIRED", "src/lib/modules/pos/register-actions.ts#submitRegisterSaleAction"),
  D("D11", "D", "[db · F5 · ruling 4] ตัวเขียนเดิม 15 ตัวของ actions/restaurant.ts บนสาขาที่ผูก POS → POS_LINKED (redirect ?err=POS_LINKED / code) · แถวร้านอาหาร/เมนู/โต๊ะของ A1 ไม่เปลี่ยน · ตัวควบคุมบวก สาขาไม่ผูก POS (A3) เขียนได้", "src/lib/actions/restaurant.ts#*"),
  D("H6b", "R", "[db · H6 · F6 · มติ] แถว cond: MANAGER สาขาเดียว × ตั้งค่าทั้งระบบ 6 ตัว + saveCreditAccount → ปฏิเสธ · ค่าเดิม · สมุดทิป = OWNER เท่านั้น · ตัวควบคุมบวก MANAGER ครบทุกสาขา", "rows[MANAGER=cond H6] · tip-ledger-actions.ts#posTipLedgersAction"),
  D("F7", "X", "[db · F7] PIN ผู้จัดการ A1 + heldCartId ของบิลพัก A2 → คำขอ POS_DISCOUNT_OVER ของ A2 ยัง PENDING (ไม่ถูกยกเลิกข้ามสาขา) · ตัวควบคุมบวก PIN ใช้ได้", "src/lib/modules/pos/register-actions.ts#submitRegisterSaleAction"),
  D("F8", "P", "[db · F8] ประตูเดิม /s/…/restaurant/t/<qrToken> บนสาขาที่ผูก POS: โทเคนรูปถูกที่ไม่มี → redirect /q/t/<token> (ไม่ค้น · ไม่เปิดหน้าเดิม) · โทเคนจริง → redirect · ไม่มี TableSession ใหม่", "src/app/(store)/s/[tenantSlug]/[unitSlug]/restaurant/t/[qrToken]/page.tsx"),
  D("F9", "R", "[db · F9] unitPriceMatrixAction: STAFF ไม่มีคีย์ POS + สินค้าจริง → ปฏิเสธ · ตัวควบคุมบวก แคชเชียร์ (pos.sale.create) = ok", "src/lib/modules/pos/catalog-price-actions.ts#unitPriceMatrixAction"),
  D("F10a", "S", "[static · F10] รายงาน AI รายสัปดาห์ (ยอดขายทุกสาขา) ไม่เป็นแจ้งเตือนทั้งร้าน: appNotification.create ใน weeklyAnalysis มี recipientUserId", "src/lib/ai/analyst.ts#weeklyAnalysis"),
  D("F10b", "X", "[db · F10] ข้อเสนอ AI (posStockRisks · purchaseSuggestions = pos_draft_po) ของ MANAGER[A1] ไม่ระบุสาขา → ไม่มีสินค้าเฉพาะสาขา A2 · ตัวควบคุมบวก OWNER เห็น", "src/lib/modules/pos/ai-insights.ts"),
  D("F4", "W", "[db · F4 · 🟡 accepted-pending-owner W37] inventory updateItemAction ของ MANAGER[A1] → แถว PosProduct ร่วม (ขายทั้ง A1/A2) ไม่เปลี่ยน", "src/lib/modules/inventory/actions.ts#updateItemAction"),
  D("F11", "W", "[db · F11 · 🟡 accepted-pending-owner W38] STAFF ที่มีแค่ hr.payroll.read → updatePosStaffCommissionAction (เขียนเงิน) ปฏิเสธ", "src/lib/modules/pos/settings-actions.ts#updatePosStaffCommissionAction"),
  D("N5", "N", "[probe กลับค่า] ตัวตัดสิน POS_LINKED: redirect ?err=POS_LINKED / code POS_LINKED → ผ่าน · void / redirect /login → ไม่ผ่าน", "D11"),
  D("N6", "N", "[probe กลับค่า] ตัวตัดสินยอดรวม: 3271.43 / 3,271.43 / 327143 ในข้อความ → รั่ว · ยอดลงตัวบาท = ไม่ใช้เป็น sentinel", "X3"),
  D("N7", "N", "[probe กลับค่า] ตัวตัดสินเครื่อง: เปิดกะได้บนเครื่องที่อ้าง → ไม่ผ่าน · ปฏิเสธ / ผูกเครื่องอื่น → ผ่าน", "D2 D3"),
  D("N8", "N", "[probe กลับค่า] ข้อรอเจ้าของ (F4 F11) แดง → ไม่อยู่ใน failed แต่อยู่ใน pendingOwner · ข้ออื่นแดง → failed", "F4 F11"),
  D("Z1", "Z", "QC4 คืนสภาพ: ร้านชั่วคราว A/B เหลือ 0 แถวทุกตารางที่มี tenantId · Tenant/User ของรอบถูกลบ · ถังเพดานของคีย์รอบนี้ 0", "-"),
  D("Z2", "Z", "ลายนิ้วมือร้าน QC coffee/resto + ตาราง POS นอกร้านชั่วคราวเท่าเดิม", "-"),
];
const STATIC_IDS = new Set(["P5.2-M1", "P5.2-M2", "P5.2-M3", "P5.2-M4", "P5.2-M5", "P5.2-P1", "P5.2-P2", "P5.2-P3", "P5.2-P5", "P5.2-P6", "P5.2-P8", "P5.2-S1", "P5.2-S2", "P5.2-N1", "P5.2-N2", "P5.2-N3", "P5.2-N4", "P5.2-F10a", "P5.2-N5", "P5.2-N6", "P5.2-N7", "P5.2-N8"]);
/** ORACLE-EDIT (P5.2 oracle2): ข้อที่รอเจ้าของตัดสิน (W37 คลัง · W38 คีย์ค่าคอมฯ) — พิมพ์ผลแต่ไม่นับใน failed/exit (มติผู้คุม 23 ต.ค.) */
const PENDING_OWNER = new Set(["P5.2-F4", "P5.2-F11"]);
const PROBE_IDS = ["P5.2-N1", "P5.2-N2", "P5.2-N3", "P5.2-N4", "P5.2-N5", "P5.2-N6", "P5.2-N7", "P5.2-N8"];
if (LIST) {
  for (const [id, x, title, ref] of CHECKS) console.log(`${id}\t${x}\t${STATIC_IDS.has(id) ? "static" : "db"}${PENDING_OWNER.has(id) ? " · accepted-pending-owner" : ""}\t${title}\t← ${ref}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "list", total: CHECKS.length, passed: 0, static: STATIC_IDS.size, pin: PIN })}`);
  process.exit(0);
}

// ═════════════════════════ ผลตรวจ ═════════════════════════
const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
function chk(id: string, ok: boolean, expected: string, actual: string): void {
  const full = id.startsWith("P5.2-") ? id : `P5.2-${id}`;
  results.set(full, { ok, expected, actual: actual.slice(0, 900) });
  const title = CHECKS.find(([i]) => i === full)?.[2] ?? "";
  console.log(`  ${ok ? "✅" : PENDING_OWNER.has(full) ? "🟡" : "❌"} [${full}] ${title.slice(0, 110)}${ok ? ` — ${actual.slice(0, 260)}` : `\n       expected: ${expected}\n       actual:   ${actual.slice(0, 900)}`}`);
}
const rd = (p: string): string => {
  try {
    return readFileSync(join(ROOT, p), "utf8");
  } catch {
    return "";
  }
};
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
/** ตัวฟังก์ชัน (จาก `function NAME`/`const NAME =` ถึงประกาศระดับบนถัดไป) */
function fnBody(text: string, name: string): string {
  const m = new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b|^(?:export\\s+)?const\\s+${name}\\s*=`, "m").exec(text);
  if (!m) return "";
  const rest = text.slice(m.index);
  const next = rest.slice(1).search(/^(?:export\s|async\s+function\s|function\s|const\s|type\s|\/\*\*|\/\/ ═)/m);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

// ═════════════════════════ ตัวตัดสินแบบ pure (ใช้ทั้งข้อจริงและ N1–N4) ═════════════════════════
type MRow = { surface: string; kind: string; roles: Record<string, string>; perm: string[]; tenantScope: string; unitScoped: boolean; call: string; evidence: string; coveredBy: string; notes: string };
function judgeM1(scanned: string[], rows: MRow[]): { unlisted: string[]; stale: string[] } {
  const have = new Set(rows.map((r) => r.surface));
  const sc = new Set(scanned);
  return { unlisted: scanned.filter((s) => !have.has(s)), stale: rows.map((r) => r.surface).filter((s) => !sc.has(s)) };
}
type Outcome = { kind: "ok" | "refused" | "redirect" | "throw" | "timeout" | "missing"; code: string; text: string };
const LEGACY = "src/lib/actions/pos.ts";
/** ปฏิเสธจริงไหม: ok:false · redirect · (ไฟล์เดิม) ForbiddenError · ผลว่าง (array/สตริงว่าง) */
// ORACLE-EDIT (P5.2 oracle2): แถวใหม่ของโมดูลเดิมที่ปฏิเสธด้วย throw (assertCan → ForbiddenError · requireUnit → notFound) — กติกาเดียวกับ LEGACY
const THROWS_FORBIDDEN = new Set([LEGACY, "src/lib/modules/approval/actions.ts", "src/lib/modules/inventory/actions.ts", "src/lib/actions/restaurant.ts"]);
function judgeDenied(o: Outcome, surface: string): boolean {
  if (o.kind === "refused" || o.kind === "redirect") return true;
  if (o.kind === "throw" && THROWS_FORBIDDEN.has(surface.split("#")[0]!) && /Forbidden|ไม่มีสิทธิ์|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK;404/.test(o.code + o.text)) return true;
  return false;
}
const DENY_CODE = /PERMISSION|FORBIDDEN|DENIED|NO_PERMISSION|NOT_FOUND|UNAUTHORIZED|NOT_ALLOWED|redirect|Forbidden/;
type TokenSpec = { name: string; len: number; bitsPerUnit: number; csprng: boolean };
const entropyBits = (t: TokenSpec): number => (t.csprng ? t.len * t.bitsPerUnit : 0);
const judgeEntropy = (t: TokenSpec, min = 60): boolean => t.csprng && entropyBits(t) >= min;
function leaks(text: string, sentinels: string[]): string[] {
  return sentinels.filter((s) => s && text.includes(s));
}
// ── ORACLE-EDIT (P5.2 oracle2): ตัวตัดสิน pure ของข้อใหม่ (probe N5–N8) ──
/** D11: ตัวเขียนเดิมปฏิเสธด้วย POS_LINKED (redirect ?err=POS_LINKED แบบ LEG · หรือคืน code POS_LINKED) */
const judgeLinked = (o: Outcome): boolean => (o.kind === "redirect" && /[?&]err=POS_LINKED\b/.test(o.text)) || ((o.kind === "refused" || o.kind === "throw") && /\bPOS_LINKED\b/.test(`${o.code} ${o.text}`));
/** X3: ยอดรวมเป็น sentinel ได้เฉพาะยอดที่มีเศษสตางค์ (ลงตัวบาทชนกับตัวเลขทั่วไปได้) — สตางค์ · บาท 2 ตำแหน่ง · มีจุลภาค */
function aggSentinels(satang: number): string[] {
  if (!Number.isInteger(satang) || satang <= 0 || satang % 100 === 0) return [];
  const b = (satang / 100).toFixed(2);
  return [...new Set([String(satang), b, Number(b).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })])];
}
/** D2/D3: คำอ้างเครื่องจาก client ไม่ถูกเชื่อ = ปฏิเสธ หรือ ผลไม่ผูกกับเครื่องที่อ้าง */
const judgeNotBound = (r: Any, claimed: string): boolean => !(r && r.ok === true) || String(r?.shift?.deviceId ?? r?.report?.deviceId ?? "") !== claimed;
/** ข้อรอเจ้าของไม่นับในด่าน */
function splitPending(entries: [string, { ok: boolean }][]): { failed: string[]; pending: { id: string; ok: boolean }[] } {
  return { failed: entries.filter(([id, r]) => !r.ok && !PENDING_OWNER.has(id)).map(([id]) => id), pending: entries.filter(([id]) => PENDING_OWNER.has(id)).map(([id, r]) => ({ id, ok: r.ok })) };
}

// ═════════════════════════ 1. ข้อสถิต ═════════════════════════
const gen = (await import("./pos-authz-matrix-gen.mts" as string)) as Any;
const MATRIX_TEXT = rd("scripts/pos-authz-matrix.json");
let MATRIX: { rows: MRow[] } & Record<string, Any> = { rows: [] };
try {
  MATRIX = JSON.parse(MATRIX_TEXT);
} catch (e) {
  console.log(`💥 อ่าน scripts/pos-authz-matrix.json ไม่ได้: ${(e as Error).message}`);
}
const ROWS: MRow[] = Array.isArray(MATRIX.rows) ? MATRIX.rows : [];
const rowOf = (surface: string) => ROWS.find((r) => r.surface === surface);

function runStatic(): void {
  console.log(`\n── [static] ตาราง ${ROWS.length} แถว · ฐาน ${PIN} · หมุดเลน ${LANE_PIN} ──`);
  // M1
  const scanned: string[] = (gen.scanSurfaces(ROOT) as { surface: string }[]).map((s) => s.surface);
  const m1 = judgeM1(scanned, ROWS);
  chk("M1", scanned.length > 0 && m1.unlisted.length === 0 && m1.stale.length === 0, "unlisted 0 · stale 0", `สแกน ${scanned.length} · ตาราง ${ROWS.length} · unlisted ${m1.unlisted.length}${m1.unlisted.length ? ` [${m1.unlisted.slice(0, 8).join(" · ")}]` : ""} · stale ${m1.stale.length}${m1.stale.length ? ` [${m1.stale.slice(0, 8).join(" · ")}]` : ""}`);
  // M2
  {
    const bad: string[] = [];
    // ORACLE-EDIT (P5.2 oracle2): + authenticateApiRequest (AI tools/skills) · assertInventory\w* (ด่านอ่านคลัง) — แถวใหม่ของชุดสแกน
    const MARK = /assert\w*Can|assertInventory\w*\(|authenticateApiRequest\(|dispatch\(|evaluate\(|canAccessUnit|gate\(|[sS]cope\w*\(|session\w*\(|run\(|requireTenant|getAuth|View\(|posCanSetTenantPrice|is\w+Token\(|_RE\.test|[tT]oken|cookies\(\)|DISPLAY_COOKIE|authorization|verifyWebhook|isCronAuthorized|checkRateLimit|POS_SCOPES|handlePlatformInbound|ackPrintJob|legacyTableQrRedirect|status: 405|role|canViewPayroll|NEED|["'](?:pos|restaurant|inventory|api)\.[a-zA-Z]+\.[a-zA-Z]+["']/;
    for (const r of ROWS) {
      const m = /^(.*):(\d+)$/.exec(r.evidence ?? "");
      if (!m) {
        bad.push(`${r.surface}: ไม่มีหลักฐาน`);
        continue;
      }
      const [, file, ln] = m;
      const text = rd(file!);
      if (!text) {
        bad.push(`${r.surface}: ไม่มีไฟล์ ${file}`);
        continue;
      }
      const lines = text.split("\n");
      const n = Number(ln);
      const line = lines[n - 1] ?? "";
      if (!line.trim()) {
        bad.push(`${r.surface}: บรรทัด ${n} ว่าง/เกินไฟล์`);
        continue;
      }
      const surfFile = r.surface.startsWith("rest:") ? "" : r.surface.split("#")[0]!;
      if (surfFile && surfFile !== file) bad.push(`${r.surface}: หลักฐานอยู่คนละไฟล์ (${file})`);
      if (r.surface.includes("#") && !r.surface.startsWith("rest:") && !file!.endsWith("route.ts")) {
        const name = r.surface.split("#")[1]!;
        const at = lines.findIndex((l) => new RegExp(`^export\\s+async\\s+function\\s+${name}\\b`).test(l)) + 1;
        const nextExp = lines.findIndex((l, i) => i >= at && /^export\s/.test(l)) + 1 || lines.length + 1;
        if (!(n >= at && n < nextExp)) bad.push(`${r.surface}: บรรทัด ${n} อยู่นอกตัวฟังก์ชัน (${at}–${nextExp - 1})`);
      }
      if (r.surface.startsWith("rest:")) {
        const op = /op ([\w.]+)/.exec(r.notes ?? "")?.[1] ?? "";
        if (!op || !lines.slice(Math.max(0, n - 12), n).some((l) => l.includes(`"${op}"`))) bad.push(`${r.surface}: หลักฐานไม่อยู่ใน definePosOp ของ ${op || "?"}`);
      }
      const staticDoc = /ไม่มีข้อมูลร้าน/.test(r.tenantScope ?? "");
      // ตัวช่วยด่านในไฟล์เดียวกัน (ฟังก์ชัน/ค่าคงที่ที่มี assertCan/evaluate/canAccessUnit/ตรวจบทบาท) — บรรทัดที่เรียกมัน = หลักฐาน
      const helperCall = [...text.matchAll(/^(?:async\s+)?function\s+(\w+)|^const\s+(\w+)\s*=/gm)]
        .map((h) => h[1] ?? h[2]!)
        .some((h) => new RegExp(`\\b${h}\\s*\\(`).test(line) && /assertCan|evaluate\(|canAccessUnit|role\s*[!=]==|canViewPayroll/.test(fnBody(text, h)));
      if (!MARK.test(line) && !helperCall && !(staticDoc && /export/.test(line))) bad.push(`${r.surface}: บรรทัด ${n} ไม่มีเครื่องหมายด่าน (${line.trim().slice(0, 60)})`);
    }
    chk("M2", ROWS.length > 0 && bad.length === 0, "ทุกแถวมีหลักฐานที่ชี้ด่านจริง", bad.length ? `${bad.length} แถว: ${bad.slice(0, 6).join(" | ")}` : `${ROWS.length} แถว ผ่าน`);
  }
  // M3
  {
    let man: Any = { suites: [] };
    try {
      man = JSON.parse(rd("scripts/pos-gates.json"));
    } catch {
      /* ว่าง */
    }
    const inMan = new Set<string>((man.suites ?? []).map((s: Any) => s.suite));
    const ids = [...new Set(ROWS.flatMap((r) => (r.coveredBy ?? "").split(",").map((x) => x.trim()).filter(Boolean)))].sort();
    const bad = ids.filter((id) => !existsSync(join(ROOT, "scripts", `${id}.mts`)) || !inMan.has(id));
    const covered = ROWS.filter((r) => (r.coveredBy ?? "").trim()).length;
    chk("M3", ROWS.length > 0 && bad.length === 0, "ทุก coveredBy มีไฟล์ + อยู่ในแมนิเฟสต์", `${ids.length} ชุด · แถวที่มีชุดคุม ${covered}/${ROWS.length}${bad.length ? ` · ไม่มี/ไม่อยู่ในแมนิเฟสต์: ${bad.join(", ")}` : ""}`);
  }
  // M4
  {
    const bad: string[] = [];
    const KINDS = new Set(["page", "action", "api", "public"]);
    const VALS = /^(allow|deny|cond|token|n\/a|\?|scope|[a-z]+\.[a-zA-Z]+\.[a-zA-Z*]+)$/;
    const ROLE_KEYS = gen.ROLE_KEYS as string[];
    for (let i = 0; i < ROWS.length; i++) {
      const r = ROWS[i]!;
      if (i > 0 && !(ROWS[i - 1]!.surface < r.surface)) bad.push(`ลำดับ/ซ้ำที่ ${r.surface}`);
      if (!KINDS.has(r.kind)) bad.push(`${r.surface}: kind ${r.kind}`);
      for (const k of ROLE_KEYS) if (typeof r.roles?.[k] !== "string" || !VALS.test(r.roles[k]!)) bad.push(`${r.surface}: roles.${k}=${r.roles?.[k]}`);
      if ((r.kind === "action" || r.kind === "page") && Object.values(r.roles ?? {}).includes("?")) bad.push(`${r.surface}: มี ? (${Object.entries(r.roles).filter(([, v]) => v === "?").map(([k]) => k).join(",")})`);
      if (!Array.isArray(r.perm) || typeof r.tenantScope !== "string" || !r.tenantScope || typeof r.unitScoped !== "boolean" || typeof r.coveredBy !== "string" || typeof r.notes !== "string") bad.push(`${r.surface}: ช่องไม่ครบ`);
    }
    chk("M4", ROWS.length > 0 && bad.length === 0, "รูปตารางถูก · ไม่มี ? บน action/page", bad.length ? `${bad.length}: ${bad.slice(0, 6).join(" | ")}` : `${ROWS.length} แถว · ${ROLE_KEYS.length} บทบาท`);
  }
  // M5
  {
    let fresh = "";
    try {
      fresh = gen.renderMatrix(gen.buildMatrix(ROOT));
    } catch (e) {
      fresh = `ERR ${(e as Error).message}`;
    }
    chk("M5", fresh === MATRIX_TEXT && MATRIX_TEXT.length > 0, "ไฟล์ = ผลของตัวสร้าง", fresh === MATRIX_TEXT ? `ตรง (${MATRIX_TEXT.length} ไบต์ · $base ${MATRIX.$base})` : `ต่าง — รัน scripts/pos-authz-matrix-gen.mts --write (ไฟล์ ${MATRIX_TEXT.length} ไบต์ · ตัวสร้าง ${fresh.length} ไบต์)`);
  }
  // P1
  {
    const rt = stripComments(rd("src/lib/modules/pos/receipt-token.ts"));
    const ord = stripComments(rd("src/lib/modules/pos/order.ts"));
    const disp = stripComments(rd("src/lib/modules/pos/display.ts"));
    const pi = stripComments(rd("src/lib/modules/pos/payment-intent.ts"));
    const pr = stripComments(rd("src/lib/modules/pos/print-relay.ts"));
    const num = (t: string, name: string) => Number(new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(t)?.[1] ?? 0);
    const crock = (t: string) => /["']0123456789ABCDEFGHJKMNPQRSTVWXYZ["']/.test(t) && /&\s*31/.test(t);
    const specs: TokenSpec[] = [
      { name: "receipt (receipt-token.ts newReceiptToken)", len: num(rt, "RECEIPT_TOKEN_LENGTH"), bitsPerUnit: crock(rt) ? 5 : 0, csprng: /randomBytes\(RECEIPT_TOKEN_LENGTH\)/.test(rt) && !/Math\.random/.test(fnBody(rt, "newReceiptToken")) },
      { name: "order publicToken (order.ts → newReceiptToken)", len: num(rt, "RECEIPT_TOKEN_LENGTH"), bitsPerUnit: crock(rt) ? 5 : 0, csprng: /publicToken:\s*newReceiptToken\(\)/.test(ord) && !/publicToken:\s*(?!newReceiptToken)[^,}\n]*Math\.random/.test(ord) },
      { name: "order link (order.ts newLinkToken)", len: num(ord, "LINK_TOKEN_LEN"), bitsPerUnit: /LINK_CROCKFORD\s*=\s*["']0123456789ABCDEFGHJKMNPQRSTVWXYZ["']/.test(ord) && /&\s*31/.test(fnBody(ord, "newLinkToken")) ? 5 : 0, csprng: /randomBytes\(LINK_TOKEN_LEN\)/.test(ord) },
      { name: "display token (display.ts)", len: Number(/const token = randomBytes\((\d+)\)/.exec(disp)?.[1] ?? 0), bitsPerUnit: 8, csprng: /const token = randomBytes\(\d+\)/.test(disp) },
      { name: "payment intent id (payment-intent.ts)", len: Number(/newIntentId = \(\) => `pi_\$\{randomBytes\((\d+)\)/.exec(pi)?.[1] ?? 0), bitsPerUnit: 8, csprng: /newIntentId = \(\) => `pi_\$\{randomBytes\(/.test(pi) },
      { name: "print agent token (print-relay.ts)", len: Number(/`spa_\$\{randomBytes\((\d+)\)/.exec(pr)?.[1] ?? 0), bitsPerUnit: 8, csprng: /`spa_\$\{randomBytes\(/.test(pr) },
    ];
    const bad = specs.filter((s) => !judgeEntropy(s));
    chk("P1", bad.length === 0, "ทุกตัว ≥ 60 บิตจาก crypto", specs.map((s) => `${s.name.split(" (")[0]} ${entropyBits(s)}b`).join(" · ") + (bad.length ? ` · ต่ำกว่า: ${bad.map((s) => s.name).join(", ")}` : ""));
  }
  // P2 — ORACLE-EDIT (builder P5.2 fix1 · CD-P52-F4 controller B): schema @default(cuid()) คงไว้ตามมติ (ไม่แตะ prisma/คอลัมน์) ⇒ ตัดสินที่ "เส้นทางโค้ดที่สร้าง/หมุนโทเคน":
  //   ทุก restaurantTable.create* ใต้ src/lib ต้องตั้ง qrToken: <ตัวสร้าง>() · ตัวสร้างนั้น (ใน restaurant/table.ts) = randomBytes(N) ของ crypto ไม่มี Math.random · N×8 ≥ 60 บิต (ruling 5) ·
  //   rotateQr ใช้ตัวสร้างเดียวกัน — เดิม: ok = !cuidDefault || (ทุกจุดสร้างตั้ง qrToken && judgeEntropy(cuid 41 บิต)) ซึ่งแดงตลอดเมื่อ schema คง cuid()
  //   probe (จดใน wo-notes pos-P5.2.md): randomBytes(7) = 56 บิต → แดง · ลบ qrToken ออกจาก createTable → แดง · Math.random ในตัวสร้าง → แดง
  {
    const schema = [rd("prisma/schema/restaurant.prisma")].join("\n");
    const line = /^\s*qrToken\s+String[^\n]*/m.exec(schema)?.[0] ?? "";
    const libFiles = (function walkLib(dir: string): string[] {
      const out: string[] = [];
      for (const n of readdirSync(join(ROOT, dir)).sort()) {
        const rel = `${dir}/${n}`;
        if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walkLib(rel));
        else if (/\.tsx?$/.test(n)) out.push(rel);
      }
      return out;
    })("src/lib");
    const creators = libFiles.map((f) => [f, stripComments(rd(f))] as const).filter(([, t]) => /restaurantTable\.create(?:Many)?\(/.test(t));
    const createsWithoutToken = creators.filter(([, t]) => /restaurantTable\.create(?:Many)?\(\{\s*data:\s*\{(?![^}]*qrToken)/.test(t)).map(([f]) => f);
    const tbl = stripComments(rd("src/lib/modules/restaurant/table.ts"));
    const gens = [...new Set(creators.flatMap(([, t]) => [...t.matchAll(/qrToken:\s*(\w+)\(\)/g)].map((m) => m[1]!)))];
    const genName = gens.length === 1 ? gens[0]! : "";
    const genBody = genName ? fnBody(tbl, genName) : "";
    const lenRef = /randomBytes\((\w+)\)/.exec(genBody)?.[1] ?? "";
    const bytes = /^\d+$/.test(lenRef) ? Number(lenRef) : Number(new RegExp(`\\b${lenRef || "\\$none"}\\s*=\\s*(\\d+)`).exec(tbl)?.[1] ?? 0);
    const spec: TokenSpec = { name: `RestaurantTable.qrToken ${genName || "?"}()`, len: bytes, bitsPerUnit: 8, csprng: !!genBody && /randomBytes\(/.test(genBody) && /from\s+["'](?:node:)?crypto["']/.test(rd("src/lib/modules/restaurant/table.ts")) && !/Math\.random/.test(genBody) };
    const rotateUses = !!genName && new RegExp(`\\b${genName}\\s*\\(`).test(fnBody(tbl, "rotateQr"));
    const ok = creators.length > 0 && createsWithoutToken.length === 0 && !!genName && judgeEntropy(spec) && rotateUses;
    chk("P2", ok, "QR โต๊ะใหม่/หมุน ≥ 60 บิตจาก crypto (ไม่พึ่ง cuid())", `schema: ${line.trim().slice(0, 70)} · จุดสร้าง ${creators.map(([f]) => f.replace(/^src\/lib\/modules\//, "")).join(", ") || "ไม่พบ"} · ไม่ตั้ง qrToken: ${createsWithoutToken.join(", ") || "0"} · ตัวสร้าง ${genName || `ไม่พบ/หลายตัว (${gens.join(",")})`} randomBytes(${bytes}) = ${entropyBits(spec)} บิต · rotateQr ใช้ตัวสร้างเดียวกัน ${rotateUses}`);
  }
  // P3
  {
    const order = (text: string, fn: string, check: RegExp, db: RegExp): string => {
      const b = stripComments(fnBody(text, fn));
      if (!b) return `${fn}: ไม่พบ`;
      const i = b.search(check);
      const j = b.search(db);
      return i >= 0 && (j < 0 || i < j) ? "" : `${fn}: ตรวจรูป@${i} DB@${j}`;
    };
    const bad = [
      order(rd("src/lib/modules/pos/receipt-token.ts"), "saleForToken", /isReceiptToken\(token\)/, /db\.posSale|prisma\./),
      order(rd("src/lib/modules/pos/qr-order.ts"), "tableCtx", /isTableQrToken\(qrToken\)/, /guestTableViewForPos|prisma\./),
      order(rd("src/lib/modules/pos/qr-order.ts"), "linkCtx", /isLinkToken\(linkToken\)/, /prisma\./),
      order(rd("src/lib/modules/pos/qr-order.ts"), "orderOfToken", /isOrderToken\(orderToken\)/, /prisma\./),
      order(rd("src/lib/modules/pos/display.ts"), "rowOfToken", /typeof token !== "string" \|\| token\.length < \d+/, /db\./),
      order(rd("src/lib/modules/pos/print-relay.ts"), "agentOf", /\/\^Bearer/, /prisma\./),
    ].filter(Boolean);
    chk("P3", bad.length === 0, "ตรวจรูปก่อนแตะ DB ทุกประตู", bad.join(" · ") || "6 ประตู ผ่าน (saleForToken · tableCtx · linkCtx · orderOfToken · rowOfToken · agentOf)");
  }
  // P5
  {
    const RATE = /RateGuard|checkRateLimit(?:Db)?\(|rateLimit\(|submitGuard\(|rateGuard\(/;
    const page = rd("src/app/(store)/r/[token]/page.tsx");
    const posBranch = /if \(POS_RECEIPT_TOKEN_RE\.test\(posToken\)\) \{[\s\S]*?\n {2}\}/.exec(page)?.[0] ?? "";
    const act = rd("src/app/(store)/r/[token]/pos-receipt-actions.ts");
    const mods: [string, string][] = [
      ["page /r แขนง POS", posBranch],
      ["publicReceiptAction→publicReceipt", fnBody(act, "publicReceiptAction") + fnBody(rd("src/lib/modules/pos/public-receipt.ts"), "publicReceipt")],
      ["reportReceiptIssue", fnBody(act, "reportReceiptIssueAction") + fnBody(rd("src/lib/modules/pos/receipt-issue.ts"), "reportReceiptIssue")],
      ["requestFullTaxInvoice", fnBody(act, "requestFullTaxInvoiceAction") + fnBody(rd("src/lib/modules/pos/receipt-tax-request.ts"), "requestFullTaxInvoice")],
      ["submitReceiptReview", fnBody(act, "submitReceiptReviewAction") + fnBody(rd("src/lib/modules/pos/public-receipt.ts"), "submitReceiptReview")],
    ];
    const missing = mods.filter(([, t]) => !RATE.test(stripComments(t))).map(([n]) => n);
    chk("P5", !!posBranch && missing.length === 0, "ทุกทางเข้ามีเพดานต่อ IP", missing.length ? `ไม่มีเพดาน: ${missing.join(" · ")} (แขนงบัญชีมี accountRateGuard publicToken/publicSubmit)` : "ครบ 5 ทาง");
  }
  // P6 — ORACLE-EDIT (builder P5.2 fix2 · CD-P52-F3b controller B): เดิม = "ทุกประตูอ่านมีคำเรียกเพดาน (RATE regex) ในตัวฟังก์ชัน" (fix1 นับต่อ IP ทุกครั้งที่สำเร็จ) →
  //   ตัดสิน 3 ส่วน: (1) qrGuard: peek ถังพลาด (qrMissExhausted) ก่อน body · ผล TOKEN_INVALID ⇒ qrCountMiss · โทเคนจริง ⇒ qrHitGuard ·
  //   (2) ประตู /q ทั้ง 12 (อ่าน 5 + quote 2 + เขียน 5) ส่ง gate {meta, token} ให้ qrGuard · อ่าน/quote มี family · กุญแจ hit ใช้แฮชโทเคน (ไม่ใช่โทเคนดิบ) ·
  //   (3) ทุกจุดเรียกประตูเหล่านี้ใต้ src/app/(store)/q/** ส่ง meta ที่มี ip (grep + จับวงเล็บ) · พฤติกรรมจริง = P9 (DB)
  //   probe (จดใน wo-notes pos-P5.2.md §Fix round 2): โค้ด fix1 (fb82257c) → แดง · ลบ meta ที่จุดเรียกเดียวใน (store)/q → แดง
  {
    const qr = rd("src/lib/modules/pos/qr-order.ts");
    const pr = stripComments(rd("src/lib/modules/pos/public-rate.ts"));
    const bad: string[] = [];
    const g = stripComments(fnBody(qr, "qrGuard"));
    const iPeek = g.search(/qrMissExhausted\(/);
    const iBody = g.search(/await body\(\)/);
    if (!(iPeek >= 0 && iBody > iPeek)) bad.push("qrGuard ไม่ peek ถังพลาดก่อน body");
    if (!/TOKEN_INVALID[\s\S]{0,120}qrCountMiss\(/.test(g)) bad.push("qrGuard ไม่นับพลาดเมื่อผล TOKEN_INVALID");
    if (!/qrHitGuard\(/.test(g)) bad.push("qrGuard ไม่นับอ่านของโทเคนจริง");
    // ORACLE-EDIT (builder P5.2 fix3 · A1 controller B): + peek ถังอ่านของ (IP, โทเคน) ก่อน body (อ่านอย่างเดียว) — probe: ย้าย peek ไปหลัง body/ลบ → แดง (wo-notes §Fix round 3)
    const iHitPeek = g.search(/qrHitExhausted\(/);
    if (!(iHitPeek >= 0 && iBody > iHitPeek)) bad.push("qrGuard ไม่ peek ถังอ่าน (IP, โทเคน) ก่อน body");
    if (!/findUnique\(/.test(fnBody(pr, "qrHitExhausted"))) bad.push("qrHitExhausted ไม่ใช่การอ่านอย่างเดียว (findUnique)");
    if (!/findUnique\(/.test(fnBody(pr, "qrMissExhausted"))) bad.push("qrMissExhausted ไม่ใช่การอ่านอย่างเดียว (findUnique)");
    // ORACLE-EDIT (fix3): กุญแจ hit อยู่ใน hitKey (ใช้ทั้ง qrHitGuard และ qrHitExhausted) — เดิมตรวจ tokenHash(token) ใน qrHitGuard ตรง ๆ
    const hitKeyUsesHash = /tokenHash\(token\)/.test(fnBody(pr, "hitKey"));
    const viaHitKey = (fn: string) => /tokenHash\(token\)|hitKey\(/.test(fnBody(pr, fn));
    if (!/createHash\("sha256"\)/.test(pr) || !(viaHitKey("qrHitGuard") && (hitKeyUsesHash || /tokenHash\(token\)/.test(fnBody(pr, "qrHitGuard"))))) bad.push("กุญแจ hit ไม่ใช้แฮชโทเคน");
    const READ = ["tableDoor", "tablePoll", "tableBill", "linkDoor", "orderStatus", "quoteTableCart", "quotePreorderCart"];
    const WRITE = ["placeTableRound", "tableServiceRequest", "tableNotifyPaid", "placePreorder", "claimPaid"];
    for (const d of [...READ, ...WRITE]) {
      const b = stripComments(fnBody(qr, d));
      if (!b) bad.push(`${d}: ไม่พบ`);
      else if (!/\}\s*,\s*\{\s*meta\b[^}]*\btoken:/.test(b)) bad.push(`${d}: ไม่ส่ง gate {meta, token} ให้ qrGuard`);
      else if (READ.includes(d) && !/\{\s*meta\b[^}]*\bfamily:\s*"qr\w+"/.test(b)) bad.push(`${d}: ไม่มี family`);
    }
    // (3) จุดเรียกใต้ (store)/q
    const walkQ = (dir: string): string[] => {
      const out: string[] = [];
      if (!existsSync(join(ROOT, dir))) return out;
      for (const n of readdirSync(join(ROOT, dir)).sort()) {
        const rel = `${dir}/${n}`;
        if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walkQ(rel));
        else if (/\.tsx?$/.test(n)) out.push(rel);
      }
      return out;
    };
    let sites = 0;
    for (const f of walkQ("src/app/(store)/q")) {
      const t = stripComments(rd(f).replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ""))); // คงบรรทัด (เลขบรรทัดในรายงานตรงไฟล์)
      for (const d of [...READ, ...WRITE]) {
        for (const m of t.matchAll(new RegExp(`\\b${d}\\s*\\(`, "g"))) {
          const before = t.slice(Math.max(0, m.index! - 20), m.index!);
          if (/function\s+$/.test(before)) continue;
          let depth = 0;
          let j = m.index! + m[0].length - 1;
          for (; j < t.length; j++) {
            if (t[j] === "(") depth++;
            else if (t[j] === ")" && --depth === 0) break;
          }
          const args = t.slice(m.index! + m[0].length, j);
          sites++;
          if (!/\bip\b/.test(args)) bad.push(`${f.replace("src/app/(store)/q/", "q/")}:${t.slice(0, m.index!).split("\n").length} ${d}(…) ไม่ส่ง meta {ip}`);
        }
      }
    }
    if (sites === 0) bad.push("ไม่พบจุดเรียกใต้ (store)/q");
    chk("P6", bad.length === 0, "qrGuard นับพลาดต่อ IP + อ่านต่อ (IP, แฮชโทเคน) · 12 ประตูส่ง gate · ทุกจุดเรียกใต้ (store)/q ส่ง {ip}", bad.length ? bad.slice(0, 8).join(" · ") + (bad.length > 8 ? ` …(+${bad.length - 8})` : "") : `qrGuard ครบ (a)(b)(c) · 12 ประตู · ${sites} จุดเรียกส่ง ip`);
  }
  // P8
  {
    const bad: string[] = [];
    for (const r of ROWS.filter((x) => x.kind === "public" && x.surface.includes("#") && !x.surface.includes("route.ts"))) {
      const [file, name] = r.surface.split("#") as [string, string];
      const sig = new RegExp(`export\\s+async\\s+function\\s+${name}\\s*\\(([^)]*)\\)`).exec(rd(file))?.[1] ?? "";
      if (/\b(tenantId|unitId|systemId|saleId|orderId|tableId|customerId|memberId)\b/.test(sig)) bad.push(`${name}(${sig.slice(0, 60)})`);
    }
    chk("P8", bad.length === 0, "ไม่มีพารามิเตอร์ id ร้าน/สาขา/บิล", bad.length ? bad.join(" · ") : `${ROWS.filter((x) => x.kind === "public" && x.surface.includes("#") && !x.surface.includes("route.ts")).length} action สาธารณะ ผ่าน`);
  }
  // S1
  {
    const beam = stripComments(rd("src/lib/payment/beam.ts"));
    const plat = stripComments(rd("src/lib/modules/pos/platform/types.ts"));
    const relay = stripComments(rd("src/lib/modules/pos/print-relay.ts"));
    const disp = stripComments(rd("src/lib/modules/pos/display.ts"));
    const bad: string[] = [];
    if (!/timingSafeEqual/.test(fnBody(beam, "verifyWebhook"))) bad.push("Beam verifyWebhook ไม่ timing-safe");
    if (!/timingSafeEqual/.test(fnBody(plat, "verifySharkSignature"))) bad.push("verifySharkSignature ไม่ timing-safe");
    if (!/findUnique\(\{\s*where:\s*\{\s*tokenHash:\s*sha\(/.test(fnBody(relay, "agentOf"))) bad.push("agentOf ไม่ค้นด้วย tokenHash");
    if (!/tokenHash:\s*sha256hex\(token\)/.test(fnBody(disp, "rowOfToken"))) bad.push("rowOfToken ไม่ค้นด้วย tokenHash");
    const LOGF = ["src/app/api/payment/beam/webhook/route.ts", "src/app/api/pos/platform/[provider]/[channelId]/route.ts", "src/lib/modules/pos/platform/dispatch.ts", "src/app/api/pos/print-agent/jobs/route.ts", "src/app/api/pos/print-agent/jobs/[id]/ack/route.ts", "src/lib/modules/pos/print-relay.ts", "src/lib/modules/pos/payment-webhook.ts"];
    for (const f of LOGF) {
      const t = stripComments(rd(f));
      if (!t) {
        bad.push(`${f}: ไม่มีไฟล์`);
        continue;
      }
      // คำสั่ง log ทั้งก้อน (ถึงวงเล็บปิดของบรรทัดสุดท้าย) — ตัด raw.length / sha256 ออกก่อนตรวจ
      for (const m of t.matchAll(/(?:console\.\w+|logOps)\(([\s\S]*?)\);/g)) {
        const s = m[1]!.replace(/\braw\.length\b/g, "").replace(/createHash\("sha256"\)\.update\([^)]*\)/g, "");
        if (/\b(raw|secret|webhookSecret|authorization|rawBody|creds)\b|req\.headers|input\.raw/.test(s)) bad.push(`${f}: log มีค่าดิบ (${s.trim().slice(0, 60)})`);
      }
    }
    chk("S1", bad.length === 0, "timing-safe · hash lookup · ไม่ log ค่าดิบ", bad.join(" · ") || `ผ่าน (Beam · x-shark-signature · agent · display · ${LOGF.length} ไฟล์ log)`);
  }
  // S2
  {
    const d = stripComments(rd("src/lib/modules/pos/platform/dispatch.ts"));
    const b = fnBody(d, "handlePlatformInbound");
    const afterVerify = b.slice(Math.max(0, b.indexOf("verifyInbound(")));
    const writes = /prisma\.\w+\.(create|update|upsert|delete|createMany|updateMany|deleteMany)\(|\$executeRaw|enqueueOutbox|publishOutbox/.test(afterVerify.replace(/await logOps\([\s\S]*?\);/g, ""));
    const pending = /status:\s*503,\s*body:\s*\{\s*code:\s*"ADAPTER_PENDING"/.test(afterVerify);
    const nonce = /timestamp|nonce|x-shark-timestamp/i.test(stripComments(rd("src/lib/modules/pos/platform/types.ts")));
    chk("S2", !!b && pending && !writes, "หลังลายเซ็นถูก: 503 ADAPTER_PENDING · ไม่มีการเขียน", `ADAPTER_PENDING ${pending} · เขียนหลังตรวจ ${writes} · nonce/timestamp ${nonce ? "มี" : "ไม่มี (H6 · ruling 6 = adapter จริง)"}`);
  }
  // F10a (ORACLE-EDIT P5.2 oracle2 · F10): รายงานรายสัปดาห์มียอดขายทุกสาขา — แจ้งเตือนต้องมีผู้รับ (null = ทุกคนในร้านเห็น · AppNotification.recipientUserId)
  {
    const body = fnBody(stripComments(rd("src/lib/ai/analyst.ts")), "weeklyAnalysis");
    const creates = [...body.matchAll(/appNotification\.create(?:Many)?\(\{([\s\S]*?)\}\s*\)/g)];
    const bad = creates.filter((m) => !/recipientUserId/.test(m[1]!));
    chk("F10a", !!body && bad.length === 0, "ทุก appNotification.create ใน weeklyAnalysis มี recipientUserId", !body ? "ไม่พบ weeklyAnalysis" : `appNotification.create ${creates.length} จุด · ไม่มีผู้รับ ${bad.length}${bad.length ? ` (${bad[0]![1]!.replace(/\s+/g, " ").trim().slice(0, 90)})` : ""}`);
  }
  runProbes();
}

/** probe กลับค่า N1–N8 — ตัวตัดสิน pure ต้องแดงได้จริง (--self-test รันเฉพาะส่วนนี้) */
function runProbes(): void {
  // N1–N4
  {
    const scanned = (gen.scanSurfaces(ROOT) as { surface: string }[]).map((s) => s.surface);
    const drop = ROWS.find((r) => r.kind === "action");
    const j = judgeM1(scanned, ROWS.filter((r) => r !== drop));
    chk("N1", !!drop && j.unlisted.length === 1 && j.unlisted[0] === drop.surface, "unlisted = แถวที่ตัด", `ตัด ${drop?.surface ?? "-"} → unlisted ${j.unlisted.length} (${j.unlisted[0] ?? "-"})`);
    const okO: Outcome = { kind: "ok", code: "OK", text: '{"ok":true}' };
    const refO: Outcome = { kind: "refused", code: "PERMISSION_DENIED", text: "" };
    const thrO: Outcome = { kind: "throw", code: "Error", text: "boom" };
    const n2 = !judgeDenied(okO, "src/lib/modules/pos/x.ts#y") && judgeDenied(refO, "src/lib/modules/pos/x.ts#y") && !judgeDenied(thrO, "src/lib/modules/pos/x.ts#y") && judgeDenied({ kind: "redirect", code: "redirect", text: "/login" }, "x#y");
    chk("N2", n2, "ok/throw = ไม่ผ่าน · refused/redirect = ผ่าน", `ok→${judgeDenied(okO, "a#b")} refused→${judgeDenied(refO, "a#b")} throw→${judgeDenied(thrO, "a#b")}`);
    const e11 = judgeEntropy({ name: "11", len: 11, bitsPerUnit: 5, csprng: true });
    const eMr = judgeEntropy({ name: "mr", len: 32, bitsPerUnit: 8, csprng: false });
    const e12 = judgeEntropy({ name: "12", len: 12, bitsPerUnit: 5, csprng: true });
    chk("N3", !e11 && !eMr && e12, "55 บิต แดง · Math.random แดง · 60 บิต ผ่าน", `11×5→${e11} · Math.random→${eMr} · 12×5→${e12}`);
    const l1 = leaks('{"receiptNo":"P52A1-x"}', ["P52A1-x"]).length === 1;
    const l0 = leaks('{"ok":false,"code":"NOT_FOUND"}', ["P52A1-x"]).length === 0;
    chk("N4", l1 && l0, "มีเลขแฝง = รั่ว · ไม่มี = ไม่รั่ว", `มี→${l1} · ไม่มี→${l0}`);
  }
  // N5–N8 (ORACLE-EDIT P5.2 oracle2)
  {
    const a = judgeLinked({ kind: "redirect", code: "redirect", text: "NEXT_REDIRECT;replace;/app/u/x/restaurant?err=POS_LINKED;307;" });
    const b = judgeLinked({ kind: "refused", code: "POS_LINKED", text: "" });
    const c = judgeLinked({ kind: "refused", code: "EMPTY", text: "" });
    const d = judgeLinked({ kind: "redirect", code: "redirect", text: "NEXT_REDIRECT;replace;/login;307;" });
    const e = judgeLinked({ kind: "redirect", code: "redirect", text: "NEXT_REDIRECT;replace;/app/u/x/restaurant/menu?err=BUSY;307;" });
    chk("N5", a && b && !c && !d && !e, "POS_LINKED ผ่าน · void/login/err อื่น ไม่ผ่าน", `?err=POS_LINKED→${a} · code→${b} · void→${c} · /login→${d} · ?err=BUSY→${e}`);
    const sn = aggSentinels(327143);
    const hit = leaks('{"netSatang":0,"label":"฿3,271.43"}', sn).length > 0 && leaks('{"t":327143}', sn).length > 0 && leaks("3271.43", sn).length > 0;
    const miss = leaks('{"t":"1,234.00"}', sn).length === 0;
    const whole = aggSentinels(300000).length === 0;
    chk("N6", hit && miss && whole && sn.length === 3, "3 รูปแบบ · ลงตัวบาท = []", `sentinel ${sn.join("|")} · พบ→${hit} · ไม่พบ→${miss} · ลงตัวบาท→${whole ? "[]" : "มี"}`);
    const bound = judgeNotBound({ ok: true, shift: { deviceId: "DEVX" } }, "DEVX");
    const ref = judgeNotBound({ ok: false, code: "DEVICE_NOT_PAIRED" }, "DEVX");
    const other = judgeNotBound({ ok: true, shift: { deviceId: "DEVP" } }, "DEVX");
    chk("N7", !bound && ref && other, "ผูกเครื่องที่อ้าง = ไม่ผ่าน · ปฏิเสธ/เครื่องอื่น = ผ่าน", `ผูกที่อ้าง→${bound} · ปฏิเสธ→${ref} · เครื่องอื่น→${other}`);
    const sp = splitPending([["P5.2-F4", { ok: false }], ["P5.2-X3", { ok: false }], ["P5.2-F11", { ok: true }], ["P5.2-X4", { ok: true }]]);
    const n8 = sp.failed.length === 1 && sp.failed[0] === "P5.2-X3" && sp.pending.length === 2 && sp.pending.some((x) => x.id === "P5.2-F4" && !x.ok);
    chk("N8", n8, "F4 แดง → pending · X3 แดง → failed", `failed ${sp.failed.join(",")} · pending ${sp.pending.map((x) => `${x.id}:${x.ok ? "เขียว" : "แดง"}`).join(",")}`);
  }
}

if (SELFTEST) {
  try {
    runProbes();
  } catch (e) {
    console.log(`💥 self-test: ${(e as Error)?.stack?.split("\n").slice(0, 3).join(" | ")}`);
  }
  for (const id of PROBE_IDS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", "ไม่ถึง");
  const weak = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--self-test) ===== ผ่าน ${results.size - weak.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "self-test", total: results.size, passed: results.size - weak.length, failed: weak, skipped: false })}`);
  process.exit(weak.length ? 1 : 0);
}

function finishStatic(): never {
  for (const id of STATIC_IDS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", "ไม่ถึง");
  const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failed.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failed.length, failed, registered: CHECKS.length, pin: PIN, lanePin: LANE_PIN, matrixRows: ROWS.length })}`);
  process.exit(failed.length ? 1 : 0);
}

if (NODB) {
  try {
    runStatic();
  } catch (e) {
    console.log(`💥 static: ${(e as Error)?.stack?.split("\n").slice(0, 3).join(" | ")}`);
  }
  finishStatic();
}

// ═════════════════════════ 2. env (QC4 เท่านั้น) ═════════════════════════
const envMod = (await import("./pos-qc-env.mts" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
const PQC = envMod.PQC as Any;
const QC_TIDS = (envMod.PQC_TENANT_IDS as string[]) ?? [];
function assertQc4BeforeWrite(): void {
  const mark = envMod.POS_QC_HOST_MARK as string;
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u!.includes(mark));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: เขียนได้เฉพาะ QC4 (${mark}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
}
assertQc4BeforeWrite();
// งานเบื้องหลังของ action (drain/after) ที่ล้มนอก await ห้ามทำให้โปรเซสตาย — นับไว้แล้วรายงาน
let bgErrors = 0;
process.on("unhandledRejection", (e) => {
  bgErrors++;
  if (bgErrors <= 5) console.log(`  (unhandledRejection: ${String((e as Error)?.message ?? e).slice(0, 120)})`);
});
if (FORCE) console.log("ℹ️  QC_FORCE=1 — ชุดนี้ไม่มีด่าน SKIP (ไม่มีผล)");

// ── Next request scope (เทคนิคเดียวกับ qc-hf-o23 / qc-crm-v1) ──
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  if (!nextWork?.workAsyncStorage || !nextWorkUnit?.workUnitAsyncStorage || !nextCookies?.RequestCookies) throw new Error("ไม่มี Next request scope");
  const req = new Request(`http://qc.local${pathname}`, { headers: { ...(cookie ? { cookie } : {}), "user-agent": SUITE, "x-forwarded-for": "203.0.113.52" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}

const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const tryImport = async (p: string): Promise<Any> => {
  try {
    return await import(p as string);
  } catch (e) {
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 140)})`);
    return null;
  }
};
const sysSvc = await tryImport("@/lib/modules/system/service");
const posSvc = await tryImport("@/lib/modules/pos/service");
const coreHash = await tryImport("@/lib/core/hash");
const akSvc = await tryImport("@/lib/api-keys/service");
const scopesMod = await tryImport("@/lib/api-keys/scopes");
const pubReceipt = await tryImport("@/lib/modules/pos/public-receipt");
const orderMod = await tryImport("@/lib/modules/pos/order"); // P9 (ORACLE-EDIT fix2 · CD-P52-F3b)
const pubRate = await tryImport("@/lib/modules/pos/public-rate"); // P9 งบจริงของโค้ด (ไม่มี = ค่าตามมติ 30/30)
const qrOrder = await tryImport("@/lib/modules/pos/qr-order");
const relay = await tryImport("@/lib/modules/pos/print-relay");

// ── ตัวกั้นเครือข่าย ──
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
    return new Response(JSON.stringify({ error: "qc-network-blocked" }), { status: 503, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}
const removeFetchGuard = () => {
  globalThis.fetch = realFetch;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ═════════════════════════ 3. ลายนิ้วมือ ═════════════════════════
async function tenantTables(): Promise<string[]> {
  return ((await P.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
     WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
  )) as Any[]).map((r: Any) => String(r.t));
}
async function colTables(col: string): Promise<Set<string>> {
  return new Set(((await P.$queryRawUnsafe(`SELECT table_name AS t FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = $1`, col)) as Any[]).map((r: Any) => String(r.t)));
}
let TT: string[] = [];
let UNIT_TT = new Set<string>();
let SYS_TT = new Set<string>();
const FP_SKIP = new Set(["OpsEvent"]);
/** ทุกแถวของร้าน (ข้อความทั้งแถว) — ใช้กับร้านชั่วคราวเท่านั้น (เล็ก) · where เพิ่ม (unitId) ได้ */
async function fpRows(tid: string, unitId?: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const tb of TT) {
    if (FP_SKIP.has(tb)) continue;
    if (unitId && !UNIT_TT.has(tb)) continue;
    try {
      const r = (await P.$queryRawUnsafe(
        `SELECT count(*)::int AS n, coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') AS h FROM "${tb}" x WHERE x."tenantId" = $1${unitId ? ` AND x."unitId" = $2` : ""}`,
        ...(unitId ? [tid, unitId] : [tid]),
      )) as Any[];
      if (r[0]?.n) out[tb] = `${r[0].n}:${String(r[0].h).slice(0, 10)}`;
    } catch {
      /* ตารางแปลก */
    }
  }
  return out;
}
const fpDiff = (a: Record<string, string>, b: Record<string, string>) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).map((k) => `${k}:${a[k] ?? "∅"}→${b[k] ?? "∅"}`);
/** ร้าน QC (ใหญ่): จำนวน + md5(id:updatedAt) ของตารางหลัก */
const QC_FP_TABLES: [string, string][] = [["PosSale", "updatedAt"], ["PosSaleLine", "id"], ["PosPayment", "id"], ["PosOrder", "updatedAt"], ["PosProduct", "updatedAt"], ["SalesChannel", "updatedAt"], ["PosDevice", "updatedAt"], ["AppSystem", "updatedAt"], ["RestaurantTable", "updatedAt"], ["PosShift", "updatedAt"], ["AuditLog", "id"], ["ApiKey", "id"]];
async function fpQc(tids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [tb, col] of QC_FP_TABLES) {
    try {
      const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || coalesce(x."${col}"::text, ''), ',' ORDER BY x.id)), '-') AS h FROM "${tb}" x WHERE x."tenantId" = ANY($1::text[])`, tids)) as Any[];
      out[tb] = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 10)}`;
    } catch (e) {
      out[tb] = `err:${(e as Error).message.slice(0, 24)}`;
    }
  }
  return out;
}

// ═════════════════════════ 4. ร้านชั่วคราว ═════════════════════════
const RAND = randomBytes(4).toString("hex");
const SLUG_A = `posqc-p52-${RAND}`;
const SLUG_B = `posqc-p52-${RAND}-b`;
let TA = "";
let TB = "";
const keyIds: string[] = [];
const F: Record<string, string> = {}; // ids
/** unitId → slug (แถว call "unit" · ORACLE-EDIT P5.2 oracle2) */
const SLUG_OF: Record<string, string> = {};
const SENT = { recA1: `P52A1R${RAND}`, recA2: `P52A2R${RAND}`, recB1: `P52B1R${RAND}`, lineA1: `P52LINEA1${RAND}`, lineA2: `P52LINEA2${RAND}`, lineB1: `P52LINEB1${RAND}`, unitA1: `P52 สาขา A1 ${RAND}`, unitA2: `P52 สาขา A2 ${RAND}`, unitB1: `P52 ร้านบี ${RAND}` };
type Persona = { key: string; userId: string; cookie: string; tenantId: string; role: string; unitAccess: string[]; perms: Record<string, boolean> };
const PER: Record<string, Persona> = {};
const DAY = 86_400_000;

async function mkUser(tid: string, slug: string, key: string, role: string, unitAccess: string[], perms: Record<string, boolean>): Promise<void> {
  const u = await P.user.create({ data: { email: `${slug}-${key.toLowerCase()}@qc.invalid`, name: `QC P5.2 ${key} ${RAND}` } });
  await P.membership.create({ data: { userId: u.id, tenantId: tid, role, unitAccess, permissions: perms, acceptedAt: new Date() } });
  const token = coreHash.randomToken(32) as string;
  await P.session.create({ data: { userId: u.id, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 30 * DAY), expiresAt: new Date(Date.now() + 90 * DAY) } });
  PER[key] = { key, userId: u.id, cookie: `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${tid}`, tenantId: tid, role, unitAccess, perms };
}
async function mkSale(tid: string, unitId: string, sysId: string, line: string, receiptNo: string, satang: number): Promise<string> {
  const r = await posSvc.createSale({ tenantId: tid, unitId, systemId: sysId, idempotencyKey: `p52-${RAND}-${receiptNo}`, lines: [{ name: line, qty: 1, unitPriceSatang: satang }], payMethods: [{ type: "CASH", amountSatang: satang }] });
  const id = String(r?.saleId ?? r?.sale?.id ?? "");
  if (!id) throw new Error(`createSale ไม่คืน saleId: ${JSON.stringify(r).slice(0, 160)}`);
  await P.posSale.update({ where: { id }, data: { receiptNo } });
  return id;
}
async function setup(): Promise<void> {
  const a = await P.tenant.create({ data: { name: `QC P5.2 ร้าน A ${RAND}`, slug: SLUG_A } });
  TA = a.id;
  const b = await P.tenant.create({ data: { name: `QC P5.2 ร้าน B ${RAND}`, slug: SLUG_B } });
  TB = b.id;
  const uA1 = await P.businessUnit.create({ data: { tenantId: TA, type: "SHOP", name: SENT.unitA1, slug: `p52-a1-${RAND}` } });
  const uA2 = await P.businessUnit.create({ data: { tenantId: TA, type: "SHOP", name: SENT.unitA2, slug: `p52-a2-${RAND}` } });
  const uB1 = await P.businessUnit.create({ data: { tenantId: TB, type: "SHOP", name: SENT.unitB1, slug: `p52-b1-${RAND}` } });
  Object.assign(F, { A1: uA1.id, A2: uA2.id, B1: uB1.id });
  Object.assign(SLUG_OF, { [uA1.id]: uA1.slug, [uA2.id]: uA2.slug, [uB1.id]: uB1.slug });
  const posA = await sysSvc.createSystem(TA, "POS", `POS P5.2 A ${RAND}`);
  const posB = await sysSvc.createSystem(TB, "POS", `POS P5.2 B ${RAND}`);
  for (const s of [posA.id, posB.id]) await P.appSystem.update({ where: { id: s }, data: { settings: { pos: { registerV2: true } } } }).catch(() => {});
  await sysSvc.linkUnit(TA, posA.id, uA1.id);
  await sysSvc.linkUnit(TA, posA.id, uA2.id);
  await sysSvc.linkUnit(TB, posB.id, uB1.id);
  Object.assign(F, { POS_A: posA.id, POS_B: posB.id });
  F.SALE_A1 = await mkSale(TA, uA1.id, posA.id, SENT.lineA1, SENT.recA1, 11100);
  F.SALE_A2 = await mkSale(TA, uA2.id, posA.id, SENT.lineA2, SENT.recA2, 22200);
  F.SALE_B1 = await mkSale(TB, uB1.id, posB.id, SENT.lineB1, SENT.recB1, 33300);
  await mkUser(TA, SLUG_A, "OWNER", "OWNER", ["*"], {});
  await mkUser(TA, SLUG_A, "MANAGER", "MANAGER", [uA1.id], {});
  await mkUser(TA, SLUG_A, "CASHIER", "STAFF", [uA1.id], { ...(PQC.cashierPermissions as Record<string, boolean>) });
  await mkUser(TA, SLUG_A, "NOPERM", "STAFF", [uA1.id], {});
  await mkUser(TB, SLUG_B, "OWNER_B", "OWNER", ["*"], {});
  console.log(`  ร้าน A ${SLUG_A} (A1 ${F.A1} · A2 ${F.A2} · POS ${F.POS_A}) · ร้าน B ${SLUG_B} (B1 ${F.B1}) · บิล A1 ${F.SALE_A1} · A2 ${F.SALE_A2} · B1 ${F.SALE_B1}`);
}

// ═════════════════════════ 5. ตัวยิง action ═════════════════════════
const modCache = new Map<string, Any>();
async function modOf(file: string): Promise<Any> {
  if (!modCache.has(file)) modCache.set(file, await tryImport(file.replace(/^src\//, "@/").replace(/\.tsx?$/, "")));
  return modCache.get(file);
}
const bkkToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
function argsFor(t: { systemId: string; unitId: string; saleId: string }): Record<string, unknown> {
  const id = t.saleId;
  return {
    systemId: t.systemId, unitId: t.unitId, id, saleId: id, orderId: id, requestId: id, slipId: id, intentId: id, keyId: id, tableId: id, tableSessionId: id, reservationId: id, productId: id, itemId: id,
    memberId: id, splitId: id, stationId: id, customerPartyId: id, redemptionId: id, heldCartId: id, intoSessionId: id, fromSessionIds: [id], toTableId: id, userId: id, deviceId: undefined,
    productIds: [id], ids: [id], posOrderIds: [id], keys: [`pos-anomaly:x:${t.unitId}:${bkkToday()}:${id}`], choiceIds: [],
    q: "P52", query: "P52", barcode: "0000000000", number: "0000000000", taxId: "0000000000000", phoneLast4: "0000", deviceCode: "P52DEVICE01",
    kind: "daily", from: bkkToday(), to: bkkToday(), date: bkkToday(), businessDate: bkkToday(), limit: 5, cursor: null, status: undefined,
    input: {}, patch: {}, cart: { lines: [] }, sale: { lines: [], payMethods: [] }, refund: { lines: [], reason: "P52" }, split: {}, shift: {}, close: {}, movement: {}, recount: {}, row: {}, board: {}, teamRoom: {}, state: {}, buyer: {},
    reason: "P52", reasonCode: "OTHER", note: "P52", name: `P52 ${RAND}`, bundle: "pos-read", ttlDays: 1, unitIds: [t.unitId], enabled: false, on: false, confirm: false, maxOpen: null, prepMinutes: 10, rush: false, seq: 1,
    via: "EMAIL", email: "p52@qc.invalid", amountSatang: 100, oversellPolicy: "BLOCK", promptpayId: null, pin: "135792", staffToken: null, managerPin: null, managerUserId: null, label: null, guestCount: 1, expectedVersion: 0, copy: false, locale: "th", only: undefined,
  };
}
const REDIRECT = (e: Any) => typeof e?.digest === "string" && e.digest.startsWith("NEXT_REDIRECT");
async function invoke(row: MRow, persona: Persona | null, t: { systemId: string; unitId: string; saleId: string }, timeoutMs = 20_000): Promise<Outcome> {
  const [file, name] = row.surface.split("#") as [string, string];
  const mod = await modOf(file);
  const fn = mod?.[name];
  if (typeof fn !== "function") return { kind: "missing", code: "MISSING", text: "" };
  const a = argsFor(t);
  const build = (): unknown[] => {
    if (row.call === "none") return [];
    if (row.call === "pos") return [t.systemId, {}];
    // ORACLE-EDIT (P5.2 oracle2): action ของหน้าเดิม (unitSlug, formData) — slug ของสาขาจริง (ไม่มี = "" → notFound)
    if (row.call === "unit") {
      const fd = new FormData();
      for (const [k, v] of Object.entries(a)) if (typeof v === "string") fd.set(k, v);
      return [SLUG_OF[t.unitId] ?? "", fd];
    }
    if (row.call === "form") {
      const fd = new FormData();
      for (const [k, v] of Object.entries(a)) if (typeof v === "string") fd.set(k, v);
      fd.set("priceSatang", "100");
      return [fd];
    }
    return [a];
  };
  const run = () => inScope(persona?.cookie ?? "", `/app/sys/${t.systemId}/pos`, async () => fn(...build()));
  let timer: NodeJS.Timeout | undefined;
  try {
    const r = await Promise.race([run(), new Promise((_, rej) => (timer = setTimeout(() => rej(Object.assign(new Error("TIMEOUT"), { qcTimeout: true })), timeoutMs)))]);
    let text = "";
    try {
      text = typeof r === "string" ? r : JSON.stringify(r) ?? "";
    } catch {
      text = String(r);
    }
    const o = r as Any;
    if (o && typeof o === "object" && !Array.isArray(o) && o.ok === false) return { kind: "refused", code: String(o.code ?? "NO_CODE"), text };
    if (o && typeof o === "object" && !Array.isArray(o) && o.status === "error") return { kind: "refused", code: String(o.code ?? o.error ?? "STATUS_ERROR"), text };
    if ((Array.isArray(o) && o.length === 0) || o === "" || o === null || o === undefined) return { kind: "refused", code: "EMPTY", text };
    return { kind: "ok", code: "OK", text };
  } catch (e) {
    if (REDIRECT(e)) return { kind: "redirect", code: "redirect", text: String((e as Any).digest) };
    if ((e as Any)?.qcTimeout) return { kind: "timeout", code: "TIMEOUT", text: "" };
    const err = e as Any;
    return { kind: "throw", code: String(err?.name ?? "Error"), text: String(err?.digest ?? err?.message ?? e).slice(0, 200) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
const ACTIONS = () => ROWS.filter((r) => r.kind === "action" && r.surface.includes("#"));
const tag = (r: MRow) => r.surface.replace(/^src\/lib\/(modules\/)?/, "").replace(/\.ts#/, "#");

// ═════════════════════════ 6. ข้อ DB ═════════════════════════
async function runDb(): Promise<void> {
  installFetchGuard();
  TT = await tenantTables();
  UNIT_TT = await colTables("unitId");
  SYS_TT = await colTables("systemId");
  await setup();
  const tA1 = { systemId: F.POS_A!, unitId: F.A1!, saleId: F.SALE_A1! };

  // R5 ตัวควบคุมบวก (ก่อน — ถ้าแดง ผลลบทั้งหมดไม่มีความหมาย)
  {
    const bd = rowOf("src/lib/modules/pos/bills-actions.ts#billDetailAction")!;
    const rp = rowOf("src/lib/modules/pos/receipt-actions.ts#receiptPayloadAction")!;
    const out: string[] = [];
    let ok = !!bd && !!rp;
    for (const k of ["OWNER", "MANAGER", "CASHIER"]) {
      const o = bd ? await invoke(bd, PER[k]!, tA1) : null;
      const seen = !!o && o.kind === "ok" && o.text.includes(SENT.recA1);
      ok &&= seen;
      out.push(`${k} billDetail ${o?.kind}/${o?.code}${seen ? " เห็นเลขบิล" : ""}`);
    }
    const o2 = rp ? await invoke(rp, PER.OWNER!, tA1) : null;
    const seen2 = !!o2 && o2.kind === "ok" && o2.text.includes(SENT.lineA1);
    ok &&= seen2;
    out.push(`OWNER receiptPayload ${o2?.kind}/${o2?.code}${seen2 ? " เห็นรายการ" : ""}`);
    chk("R5", ok, "ok + เห็นข้อมูลบิล A1 ทั้ง 4 ครั้ง", out.join(" · "));
  }

  // R4 ANON
  {
    const bad: string[] = [];
    let n = 0;
    for (const r of ACTIONS()) {
      const o = await invoke(r, null, tA1);
      n++;
      if (!judgeDenied(o, r.surface) || o.text.includes(SENT.recA1)) bad.push(`${tag(r)}=${o.kind}/${o.code}`);
    }
    chk("R4", n > 0 && bad.length === 0, "ทุกแถว redirect/ปฏิเสธ", bad.length ? `${bad.length}/${n}: ${bad.slice(0, 12).join(" · ")}` : `${n} แถว ปฏิเสธทั้งหมด`);
  }

  // R2 STAFF_NOPERM · R1 CASHIER (+ R3 รหัส)
  const r3bad: string[] = [];
  let r3n = 0;
  for (const [cid, pk, role] of [["R2", "NOPERM", "STAFF_NOPERM"], ["R1", "CASHIER", "CASHIER"]] as const) {
    const rows = ACTIONS().filter((r) => r.roles[role] === "deny");
    const bad: string[] = [];
    for (const r of rows) {
      const o = await invoke(r, PER[pk]!, tA1);
      if (!judgeDenied(o, r.surface)) bad.push(`${tag(r)}=${o.kind}/${o.code}`);
      else {
        r3n++;
        if (!DENY_CODE.test(o.code)) r3bad.push(`${pk}:${tag(r)}=${o.code}`);
      }
    }
    chk(cid, rows.length > 0 && bad.length === 0, `${role}=deny ทุกแถวถูกปฏิเสธ`, bad.length ? `${bad.length}/${rows.length}: ${bad.slice(0, 14).join(" · ")}` : `${rows.length} แถว ปฏิเสธทั้งหมด`);
  }
  chk("R3", r3n > 0 && r3bad.length === 0, "รหัสสิทธิ์/ไม่พบ", r3bad.length ? `${r3bad.length}/${r3n}: ${r3bad.slice(0, 14).join(" · ")}` : `${r3n} คำปฏิเสธ รหัสถูกทั้งหมด`);

  // T2 OTHER_UNIT: MANAGER A1 → A2
  {
    const before = await fpRows(TA, F.A2);
    const rows = ACTIONS().filter((r) => r.unitScoped && r.roles.OTHER_UNIT === "deny");
    const bad: string[] = [];
    for (const r of rows) {
      const o = await invoke(r, PER.MANAGER!, { systemId: F.POS_A!, unitId: F.A2!, saleId: F.SALE_A2! });
      const lk = leaks(o.text, [SENT.recA2, SENT.lineA2]);
      if (lk.length || o.kind === "timeout") bad.push(`${tag(r)}=${o.kind}/${o.code}${lk.length ? " รั่ว" : ""}`);
    }
    const diff = fpDiff(before, await fpRows(TA, F.A2));
    chk("T2", rows.length > 0 && bad.length === 0 && diff.length === 0, "ไม่เห็นบิล A2 · แถว A2 ไม่เปลี่ยน", `${rows.length} แถว · รั่ว/ค้าง ${bad.length}${bad.length ? `: ${bad.slice(0, 10).join(" · ")}` : ""} · แถว A2 เปลี่ยน ${diff.length ? diff.slice(0, 6).join(", ") : "0"}`);
  }

  // T1 OTHER_TENANT: OWNER B → ร้าน A
  {
    const before = await fpRows(TA);
    const rows = ACTIONS();
    const bad: string[] = [];
    for (const r of rows) {
      const o = await invoke(r, PER.OWNER_B!, tA1);
      const lk = leaks(o.text, [SENT.recA1, SENT.recA2, SENT.lineA1, SENT.lineA2, SENT.unitA1, SENT.unitA2]);
      if (lk.length || o.kind === "timeout") bad.push(`${tag(r)}=${o.kind}/${o.code}${lk.length ? ` รั่ว ${lk.length}` : ""}`);
    }
    const diff = fpDiff(before, await fpRows(TA));
    // แถวของร้าน B ที่อ้างระบบ/สาขาของร้าน A
    const xref: string[] = [];
    for (const tb of TT) {
      const cond = [SYS_TT.has(tb) ? `x."systemId" = $2` : "", UNIT_TT.has(tb) ? `x."unitId" = ANY($3::text[])` : ""].filter(Boolean);
      if (!cond.length) continue;
      try {
        const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" x WHERE x."tenantId" = $1 AND (${cond.join(" OR ")})`, TB, F.POS_A, [F.A1, F.A2])) as Any[])[0]?.n ?? 0);
        if (n) xref.push(`${tb}:${n}`);
      } catch {
        /* ชนิดคอลัมน์ไม่ตรง */
      }
    }
    chk("T1", rows.length > 0 && bad.length === 0 && diff.length === 0 && xref.length === 0, "ไม่รั่ว · A ไม่เปลี่ยน · B ไม่อ้าง A", `${rows.length} แถว · รั่ว/ค้าง ${bad.length}${bad.length ? `: ${bad.slice(0, 10).join(" · ")}` : ""} · แถว A เปลี่ยน ${diff.length ? diff.slice(0, 6).join(", ") : "0"} · B อ้าง A ${xref.join(", ") || "0"}`);
  }

  // T3 resto (อ่านอย่างเดียว)
  {
    const R = PQC.resto;
    const restoSale = await P.posSale.findFirst({ where: { tenantId: R.tenantId, systemId: R.systems.POS.id }, orderBy: { createdAt: "desc" }, select: { id: true, receiptNo: true, unitId: true } });
    const sentinels = [R.units.main.name, ...((envMod.PQC_RESTO_ITEMS as Any[]) ?? []).map((i) => i.name), restoSale?.receiptNo ?? ""].filter((s: string) => s && s.length >= 4);
    const READ = /^(list\w*|get\w*|billDetail|billsPageData|receiptPayload|saleForRefund|refundTenderOptions|registerTables|registerTableMode|registerStatus|registerCatalog|posSettingsOverview|posStaffOverview|posReport|posReportOverview|kdsBoard|kdsStations|kdsKitchenState|qrTables|qrTableRounds|posStockMeta|posStockHistory|shiftsPageData|posPaymentSettings|posReceiptSettings|posTipLedgers|posIntegrationCards|unitPriceMatrix|ordersChannels)Action$/;
    const rows = ACTIONS().filter((r) => READ.test(r.surface.split("#")[1]!));
    const before = await fpQc([R.tenantId]);
    const bad: string[] = [];
    for (const r of rows) {
      const o = await invoke(r, PER.OWNER!, { systemId: R.systems.POS.id, unitId: R.units.main.id, saleId: restoSale?.id ?? "posqc-none" });
      const lk = leaks(o.text, sentinels);
      if (lk.length || o.kind === "timeout") bad.push(`${tag(r)}=${o.kind}/${o.code}${lk.length ? ` รั่ว ${lk.join("|").slice(0, 40)}` : ""}`);
    }
    const diff = fpDiff(before, await fpQc([R.tenantId]));
    chk("T3", rows.length >= 20 && bad.length === 0 && diff.length === 0, "ไม่เห็นข้อมูล resto · resto ไม่เปลี่ยน", `${rows.length} แถวอ่าน · sentinel ${sentinels.length} · รั่ว ${bad.length}${bad.length ? `: ${bad.slice(0, 8).join(" · ")}` : ""} · resto เปลี่ยน ${diff.join(", ") || "0"}`);
  }

  // K1/K2 REST
  {
    const route = await tryImport("@/app/api/v1/pos/[...path]/route");
    const api = async (method: string, path: string, raw: string, body?: unknown): Promise<{ status: number; text: string }> => {
      const fn = route?.[method];
      if (typeof fn !== "function") return { status: 0, text: "ROUTE_MISSING" };
      const headers: Record<string, string> = { authorization: `Bearer ${raw}` };
      if (method !== "GET") headers["idempotency-key"] = `p52-${RAND}-${randomBytes(4).toString("hex")}`;
      if (body !== undefined) headers["content-type"] = "application/json";
      try {
        const res: Response = await fn(new Request(`http://x/api/v1/pos${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) });
        return { status: res.status, text: await res.text() };
      } catch (e) {
        return { status: -1, text: (e as Error).message.slice(0, 120) };
      }
    };
    const mk = async (label: string, scopes: string[]) => {
      const k = await akSvc.createApiKey({ tenantId: TA }, `QC P5.2 ${label} ${RAND}`, { scopes, systemId: F.POS_A });
      keyIds.push(k.id);
      return k.rawKey as string;
    };
    const admin = scopesMod.expandBundles(["pos-admin"]) as string[];
    const kAdmin = await mk("admin", admin);
    const kFilter = await mk("filter-A1", [...admin, `pos.filter.unit:${F.A1}`]);
    const idOps = ROWS.filter((r) => r.surface.startsWith("rest:") && r.surface.includes("{id}"));
    const saleB = async () => JSON.stringify(await P.posSale.findUnique({ where: { id: F.SALE_B1 }, select: { status: true, refundedSatang: true, updatedAt: true, taxInvoiceDocId: true } }));
    const bBefore = await saleB();
    const bad: string[] = [];
    for (const r of idOps) {
      const [, method, path] = /^rest:(\w+) (.+)$/.exec(r.surface)!;
      const res = await api(method!, path!.replace("{id}", F.SALE_B1!), kAdmin, method === "GET" ? undefined : { reason: "P52", lines: [], unitId: F.A1 });
      const lk = leaks(res.text, [SENT.recB1, SENT.lineB1, SENT.unitB1]);
      if ((method === "GET" ? res.status !== 404 : res.status >= 200 && res.status < 300) || lk.length || res.status <= 0) bad.push(`${method} ${path}=${res.status}${lk.length ? " รั่ว" : ""}`);
    }
    const bAfter = await saleB();
    chk("K1", idOps.length > 0 && bad.length === 0 && bBefore === bAfter, "GET 404 · เขียนไม่ 2xx · บิล B เดิม", `${idOps.length} op · ผิด ${bad.length}${bad.length ? `: ${bad.slice(0, 10).join(" · ")}` : ""} · บิล B ${bBefore === bAfter ? "เดิม" : "เปลี่ยน"}`);
    const a2Before = JSON.stringify(await P.posSale.findUnique({ where: { id: F.SALE_A2 }, select: { status: true, updatedAt: true } }));
    const g1 = await api("GET", `/sales/${F.SALE_A1}`, kFilter);
    const g2 = await api("GET", `/sales/${F.SALE_A2}`, kFilter);
    const r2 = await api("GET", `/sales/${F.SALE_A2}/receipt`, kFilter);
    const v2 = await api("POST", `/sales/${F.SALE_A2}/void`, kFilter, { reason: "P52" });
    const a2After = JSON.stringify(await P.posSale.findUnique({ where: { id: F.SALE_A2 }, select: { status: true, updatedAt: true } }));
    const okK2 = g1.status === 200 && g1.text.includes(SENT.recA1) && g2.status === 404 && r2.status === 404 && !(v2.status >= 200 && v2.status < 300) && !leaks(g2.text + r2.text + v2.text, [SENT.recA2, SENT.lineA2]).length && a2Before === a2After;
    chk("K2", okK2, "A1 = 200 · A2 GET 404 · void ไม่ 2xx · บิล A2 เดิม", `GET A1 ${g1.status}${g1.text.includes(SENT.recA1) ? " เห็น" : ""} · GET A2 ${g2.status} · receipt A2 ${r2.status} · void A2 ${v2.status} · บิล A2 ${a2Before === a2After ? "เดิม" : "เปลี่ยน"}`);
  }

  // P4 404/403 leakage + QR binding
  {
    const out: string[] = [];
    let ok = true;
    const c = async (f: () => Promise<Any>) => {
      try {
        const r = await f();
        return r?.ok === false ? String(r.code) : r?.ok === true ? "OK" : "?";
      } catch (e) {
        return `THROW:${(e as Error).message.slice(0, 30)}`;
      }
    };
    const pr = [await c(() => pubReceipt.publicReceipt("x")), await c(() => pubReceipt.publicReceipt("ZZZZZZZZZZZZ")), await c(() => pubReceipt.publicReceipt("abc' OR 1=1"))];
    ok &&= pr.every((x) => x === "TOKEN_NOT_FOUND");
    out.push(`receipt ผิดรูป/ไม่มี/ฉีด = ${pr.join("/")}`);
    const pairs: [string, (t: string) => Promise<Any>, string, string][] = [
      ["tableDoor", (t) => qrOrder.tableDoor(t), "!!", `qr_${"0".repeat(32)}`],
      ["linkDoor", (t) => qrOrder.linkDoor(t), "x", "ZZZZZZZZZZZZZZZZ"],
      ["orderStatus", (t) => qrOrder.orderStatus(t, {}), "x", "ZZZZZZZZZZZZ"],
    ];
    for (const [n, f, bad, unknown] of pairs) {
      const a = await c(() => f(bad));
      const b = await c(() => f(unknown));
      ok &&= a === b && a === "TOKEN_INVALID";
      out.push(`${n} ${a}/${b}`);
    }
    const tbl = await P.restaurantTable.findFirst({ where: { tenantId: PQC.resto.tenantId }, select: { qrToken: true, unitId: true } });
    if (tbl) {
      const r = await qrOrder.tableDoor(tbl.qrToken).catch(() => null);
      const txt = JSON.stringify(r ?? {});
      const bound = r?.ok === true && txt.includes(PQC.resto.units.main.name) && !txt.includes(PQC.coffee.units.silom.name);
      ok &&= bound;
      out.push(`QR โต๊ะ resto → ${r?.ok === true ? "ok" : r?.code} ${bound ? "ผูกสาขา resto" : "ไม่ผูก"}`);
    } else out.push("resto ไม่มีโต๊ะ (ข้ามส่วนผูกโทเคน)");
    chk("P4", ok, "รหัสเดียวกัน TOKEN_NOT_FOUND/TOKEN_INVALID · QR ผูกสาขา", out.join(" · "));
  }

  // P9 self-test กันไล่เดา /q (ORACLE-EDIT builder P5.2 fix2 · CD-P52-F3b) — ลิงก์สั่งล่วงหน้าจริง 2 ลิงก์ของร้านชั่วคราว A (สาขา A1 · A2) ·
  //   IP ของรอบ = qc-p52-<RAND>-ip* (ถังถูกลบใน finally · Z1 นับ) · ตัวควบคุมบวก = อ่านครั้งแรกต้อง ok
  {
    const out: string[] = [];
    let ok = !!orderMod && !!qrOrder;
    const owner = { userId: PER.OWNER!.userId, role: "OWNER", unitAccess: ["*"], permissions: {} };
    const l1 = ok ? await orderMod.createOrderLink({ tenantId: TA, systemId: F.POS_A, unitId: F.A1 }, owner, {}).catch(() => null) : null;
    const l2 = ok ? await orderMod.createOrderLink({ tenantId: TA, systemId: F.POS_A, unitId: F.A2 }, owner, {}).catch(() => null) : null;
    const L1 = String(l1?.link?.token ?? "");
    const L2 = String(l2?.link?.token ?? "");
    if (!L1 || !L2) {
      ok = false;
      out.push(`สร้างลิงก์ไม่ได้ (${l1?.code ?? "-"}/${l2?.code ?? "-"})`);
    } else {
      const N = Number(pubRate?.QR_HIT_RATE?.qrLink?.limit ?? 30);
      const MISS = Number(pubRate?.QR_MISS_PER_IP_PER_MIN ?? 30);
      const ip = (x: string) => `qc-p52-${RAND}-ip${x}`;
      const door = async (tok: string, who?: string): Promise<string> => {
        const r = await (who === undefined ? qrOrder.linkDoor(tok) : qrOrder.linkDoor(tok, undefined, { ip: ip(who) })).catch((e: Error) => ({ ok: false, code: `THROW:${e.message.slice(0, 30)}` }));
        return r?.ok === true ? "ok" : String(r?.code ?? "?");
      };
      const seqA: string[] = [];
      for (let i = 0; i < N + 1; i++) seqA.push(await door(L1, "A"));
      const firstN = seqA.slice(0, N).every((c) => c === "ok");
      const limited = seqA[N] === "RATE_LIMITED";
      const otherIp = await door(L1, "B");
      const otherTok = await door(L2, "A");
      const noMeta = await door(L1);
      ok &&= firstN && limited && otherIp === "ok" && otherTok === "ok" && noMeta === "ok";
      out.push(`IP A × ลิงก์ 1: ${N} ครั้งแรก ${firstN ? "ok" : seqA.slice(0, N).filter((c) => c !== "ok").slice(0, 3).join(",")} · ครั้งที่ ${N + 1} = ${seqA[N]} · IP B = ${otherIp} · IP A × ลิงก์ 2 = ${otherTok} · ไม่มี meta = ${noMeta}`);
      const misses: string[] = [];
      for (let i = 0; i < MISS; i++) misses.push(await door(`ZZZZZZZZZZZZ${String(i).padStart(4, "0")}`, "M"));
      const allMiss = misses.every((c) => c === "TOKEN_INVALID");
      const realFromM = await door(L2, "M");
      const realFromB = await door(L2, "B");
      ok &&= allMiss && realFromM === "TOKEN_INVALID" && realFromB === "ok";
      out.push(`IP M พลาด ${MISS} ครั้ง ${allMiss ? "TOKEN_INVALID ทั้งหมด" : misses.slice(0, 3).join(",")} → ลิงก์จริงจาก IP M = ${realFromM} · จาก IP B = ${realFromB}`);
    }
    chk("P9", ok, "งบต่อ (IP, โทเคน) · IP อื่น/โทเคนอื่นไม่โดน · พลาดครบ = โทเคนจริงก็ TOKEN_INVALID · ไม่มี meta ไม่นับ", out.join(" · "));
  }

  // P7 PII ใบเสร็จ (coffee อ่านอย่างเดียว)
  {
    const s = await P.posSale.findFirst({ where: { tenantId: PQC.coffee.tenantId, memberId: { not: null }, publicToken: { not: null }, docType: "SALE" }, orderBy: { createdAt: "desc" }, select: { id: true, publicToken: true, memberId: true, tenantId: true, unitId: true } });
    if (!s) chk("P7", false, "มีบิลสมาชิกของ coffee ที่มีโทเคน", "ไม่พบบิลสมาชิกใน coffee (seed ไม่มี) — ไม่ reseed");
    else {
      const cust = await P.customer.findFirst({ where: { id: s.memberId }, select: { id: true, name: true, phone: true, email: true, firstName: true, lastName: true, lineUserId: true } });
      const r = await pubReceipt.publicReceipt(s.publicToken);
      const txt = JSON.stringify(r ?? {});
      const pii = [cust?.id, cust?.phone, cust?.email, cust?.name, cust?.firstName, cust?.lastName, cust?.lineUserId, s.memberId, s.tenantId, s.unitId].filter((v): v is string => typeof v === "string" && v.length >= 4);
      const hit = pii.filter((v) => txt.includes(v));
      const digits = (cust?.phone ?? "").replace(/\D/g, "");
      const phoneHit = digits.length >= 8 && txt.replace(/\D/g, "").includes(digits);
      chk("P7", r?.ok === true && hit.length === 0 && !phoneHit, "ok · ไม่มีข้อมูลสมาชิก/ id ภายใน", `${r?.ok === true ? "ok" : r?.code} · ตรวจ ${pii.length} ค่า · พบ ${hit.length ? hit.map((h) => h.slice(0, 3) + "…").join(",") : "0"}${phoneHit ? " · เบอร์" : ""}`);
    }
  }

  // S3 Beam webhook replay
  {
    const env0 = { m: process.env.BEAM_MERCHANT_ID, k: process.env.BEAM_API_KEY, s: process.env.BEAM_WEBHOOK_SECRET };
    const secret = randomBytes(24).toString("hex");
    process.env.BEAM_MERCHANT_ID = "qc-p52";
    process.env.BEAM_API_KEY = "qc-p52";
    process.env.BEAM_WEBHOOK_SECRET = secret;
    try {
      const route = await tryImport("@/app/api/payment/beam/webhook/route");
      const intentId = `pi_${randomBytes(12).toString("base64url")}`;
      const chargeId = `ch_p52_${RAND}`;
      await P.posPaymentIntent.create({ data: { id: intentId, tenantId: TA, unitId: F.A1, systemId: F.POS_A, kind: "CARD_BEAM", amountSatang: 5000, status: "PENDING", beamChargeId: chargeId, expiresAt: new Date(Date.now() + 15 * 60_000), idempotencyKey: `p52-${RAND}-intent` } });
      const body = JSON.stringify({ chargeId, referenceId: `pos-${intentId}`, status: "SUCCEEDED", amount: 5000 });
      const sig = createHmac("sha256", secret).update(body, "utf8").digest("hex");
      const post = async (s: string) => {
        const res: Response = await route.POST(new Request("http://x/api/payment/beam/webhook", { method: "POST", headers: { "content-type": "application/json", "x-beam-signature": s }, body }));
        return res.status;
      };
      const t0 = new Date(Date.now() - 1000);
      const stBad = await post("0".repeat(64));
      const afterBad = await P.posPaymentIntent.findUnique({ where: { id: intentId }, select: { status: true, paidAt: true } });
      const st1 = await post(sig);
      const r1 = await P.posPaymentIntent.findUnique({ where: { id: intentId }, select: { status: true, paidAt: true } });
      const st2 = await post(sig);
      const r2 = await P.posPaymentIntent.findUnique({ where: { id: intentId }, select: { status: true, paidAt: true } });
      const ob = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = $1 AND payload::text LIKE $2`, TA, `%${intentId}%`)) as Any[])[0]?.n ?? -1);
      const fp = createHash("sha256").update(body).digest("hex").slice(0, 16);
      await P.opsEvent.deleteMany({ where: { createdAt: { gte: t0 }, tenantId: null, detail: { contains: `sha256:${fp}` } } }).catch(() => {});
      const ok = stBad === 401 && afterBad?.status === "PENDING" && st1 === 200 && st2 === 200 && r1?.status === "PAID" && r2?.status === "PAID" && String(r1?.paidAt) === String(r2?.paidAt) && ob === 1;
      chk("S3", ok, "401 ไม่เปลี่ยน · 200×2 · PAID ครั้งเดียว · outbox 1", `ผิดลายเซ็น ${stBad} (${afterBad?.status}) · ครั้งที่ 1 ${st1} ${r1?.status} · ครั้งที่ 2 ${st2} ${r2?.status} paidAt ${String(r1?.paidAt) === String(r2?.paidAt) ? "เดิม" : "เปลี่ยน"} · outbox ${ob}`);
    } finally {
      for (const [k, v] of [["BEAM_MERCHANT_ID", env0.m], ["BEAM_API_KEY", env0.k], ["BEAM_WEBHOOK_SECRET", env0.s]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  // S4 print-agent ack replay
  {
    const route = await tryImport("@/app/api/pos/print-agent/jobs/[id]/ack/route");
    const own = PER.OWNER!;
    const actor = { userId: own.userId, role: "OWNER", unitAccess: ["*"], permissions: {} };
    const ownB = PER.OWNER_B!;
    const reg = await relay.registerPrintAgent({ tenantId: TA, systemId: F.POS_A, unitId: F.A1 }, actor, { name: `P52 ${RAND}`, printers: [{ name: "kitchen", host: "127.0.0.1", port: 9100, target: "kitchen" }] });
    const regB = await relay.registerPrintAgent({ tenantId: TB, systemId: F.POS_B, unitId: F.B1 }, { userId: ownB.userId, role: "OWNER", unitAccess: ["*"], permissions: {} }, { name: `P52 B ${RAND}`, printers: [{ name: "kitchen", host: "127.0.0.1", port: 9100, target: "kitchen" }] });
    const job = reg?.ok ? await relay.enqueuePrintJob({ tenantId: TA, systemId: F.POS_A, unitId: F.A1 }, actor, { idempotencyKey: `p52-${RAND}-job`, target: "kitchen", deviceCode: "P52DEVICE01", bytesB64: Buffer.from("P52 print").toString("base64"), agentId: reg.agent.id }) : null;
    const claim = reg?.ok ? await relay.claimPrintJobs(`Bearer ${reg.token}`) : null;
    const jobId = job?.ok ? job.job.id : "";
    const ack = async (tok: string) => {
      const res: Response = await route.POST(new Request(`http://x/api/pos/print-agent/jobs/${jobId}/ack`, { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ ok: true }) }), { params: Promise.resolve({ id: jobId }) });
      return res.status;
    };
    const sB = regB?.ok ? await ack(regB.token) : -1;
    const s1 = reg?.ok ? await ack(reg.token) : -1;
    const j1 = jobId ? await P.posPrintJob.findUnique({ where: { id: jobId }, select: { status: true, doneAt: true } }) : null;
    const s2 = reg?.ok ? await ack(reg.token) : -1;
    const j2 = jobId ? await P.posPrintJob.findUnique({ where: { id: jobId }, select: { status: true, doneAt: true } }) : null;
    const ok = !!jobId && claim?.ok === true && sB !== 200 && s1 === 200 && s2 === 200 && j1?.status === "DONE" && j2?.status === "DONE" && String(j1?.doneAt) === String(j2?.doneAt);
    chk("S4", ok, "ร้านอื่น ≠ 200 · 200×2 · DONE · doneAt เดิม", `agent ${reg?.ok ? "ok" : reg?.code} · job ${job?.ok ? "ok" : job?.code} · claim ${claim?.ok ? claim.jobs?.length : claim?.code} · ack ร้าน B ${sB} · ack ×2 ${s1}/${s2} · ${j1?.status}/${j2?.status} doneAt ${String(j1?.doneAt) === String(j2?.doneAt) ? "เดิม" : "เปลี่ยน"}`);
  }
}

// ═════════════════════════ 6b. ข้อ DB ใหม่ (ORACLE-EDIT P5.2 oracle2 · hunter L1 F1–F11 · มติผู้คุม 23 ต.ค.) ═════════════════════════
//   ร้านชั่วคราว A เดิม + วัตถุ A2 ทุกชนิด (blind spot 1) · สาขา A3 ไม่ผูก POS (ตัวควบคุมบวก D11) · บุคคลใหม่ (blind spot 5):
//   MANAGER_A2 · MANAGER_ALL [A1,A2] · CASHIER_A2 · LEAD (STAFF + pos.staff.manage) · KEYS (STAFF คีย์ pos.* ครบ) · SELLER (ขาย + ราคาเปิด) ·
//   OPERATOR (ขาย + pos.shift.operate) · PAYROLL (hr.payroll.read อย่างเดียว) · คีย์กลาง (K3) — ทุกอย่างลบไปกับร้านใน finally (Z1)
const G: Record<string, string> = {};
const SENT2 = {
  recA2b: `P52A2BR${RAND}`, lineA2b: `P52LINEA2B${RAND}`, recX4: `P52X4R${RAND}`, lineX4: `P52LINEX4${RAND}`, custA2: `P52 ลูกค้า A2 ${RAND}`, devA2: `P52 เครื่อง A2 ${RAND}`,
  tableA2: `P52 โต๊ะ A2 ${RAND}`, heldA2: `P52 พัก A2 ${RAND}`, slipA2: `P52 สลิป A2 ${RAND}`, invA2: `P52 คลังเฉพาะ A2 ${RAND}`, invShared: `P52 คลังร่วม ${RAND}`,
};
const DEV = { A2: `P52A2DEV${RAND}`, Y: `P52A1DEVY${RAND}`, Z: `P52A1DEVZ${RAND}`, F7: `P52A1DEVF7${RAND}`, P2: `P52A1PAIR2${RAND}`, P3: `P52A1PAIR3${RAND}`, P4: `P52A1PAIR4${RAND}`, P5: `P52A1PAIR5${RAND}`, PU: `P52A1PAIRU${RAND}` }; // ORACLE-EDIT (CD-P52-O4): + P4 P5 (D4) · PU (D1 กุญแจไม่ตั้ง)
const PINS = { MANAGER: "713952", OWNER: "482916", CASHIER: "258014", X5OWNER: "591736", X5MGR: "640273", X5OK: "305918", X5LEAD: "927341" };
const FX2: string[] = [];
const actorOf2 = (k: string): Any => ({ userId: PER[k]?.userId ?? `none-${k}`, role: PER[k]?.role ?? "STAFF", unitAccess: [...(PER[k]?.unitAccess ?? [])], permissions: { ...(PER[k]?.perms ?? {}) } });
async function step2(label: string, f: () => Promise<void>): Promise<boolean> {
  try {
    await f();
    return true;
  } catch (e) {
    FX2.push(`${label}: ${(e as Error)?.message?.slice(0, 140)}`);
    console.log(`  ⚠️  fixture ${label}: ${(e as Error)?.message?.slice(0, 160)}`);
    return false;
  }
}
const must2 = (label: string, r: Any): Any => {
  if (r && typeof r === "object" && r.ok === false) throw new Error(`${label} → ${r.code} ${String(r.message ?? r.reason ?? "").slice(0, 80)}`);
  return r;
};
const idOf = (r: Any): string => String(r?.id ?? r?.table?.id ?? r?.zone?.id ?? r?.item?.id ?? r?.category?.id ?? r?.group?.id ?? r?.station?.id ?? r?.device?.id ?? r?.shift?.id ?? "");
/** ผลของ action → Outcome (กติกาเดียวกับ invoke) */
function outcomeOf(r: unknown): Outcome {
  let text = "";
  try {
    text = typeof r === "string" ? r : JSON.stringify(r) ?? "";
  } catch {
    text = String(r);
  }
  const o = r as Any;
  if (o && typeof o === "object" && !Array.isArray(o) && o.ok === false) return { kind: "refused", code: String(o.code ?? "NO_CODE"), text };
  if (o && typeof o === "object" && !Array.isArray(o) && o.status === "error") return { kind: "refused", code: String(o.code ?? o.error ?? "STATUS_ERROR"), text };
  if ((Array.isArray(o) && o.length === 0) || o === "" || o === null || o === undefined) return { kind: "refused", code: "EMPTY", text };
  return { kind: "ok", code: "OK", text };
}
function outcomeOfErr(e: unknown): Outcome {
  if (REDIRECT(e)) return { kind: "redirect", code: "redirect", text: String((e as Any).digest) };
  if ((e as Any)?.qcTimeout) return { kind: "timeout", code: "TIMEOUT", text: "" };
  const err = e as Any;
  return { kind: "throw", code: String(err?.name ?? "Error"), text: String(err?.digest ?? err?.message ?? e).slice(0, 200) };
}
/** เรียก action ใน request scope + คุกกี้ที่ action ตั้ง (jar หลังเรียก − ก่อนเรียก) */
async function callAct(file: string, name: string, persona: Persona | null, args: unknown[], opts: { cookie?: string; timeoutMs?: number } = {}): Promise<{ o: Outcome; r: Any; set: { name: string; value: string }[] }> {
  const mod = await modOf(file);
  const fn = mod?.[name];
  if (typeof fn !== "function") return { o: { kind: "missing", code: "MISSING", text: "" }, r: null, set: [] };
  const cookie = [persona?.cookie ?? "", opts.cookie ?? ""].filter(Boolean).join("; ");
  if (!nextWork?.workAsyncStorage || !nextWorkUnit?.workUnitAsyncStorage || !nextCookies?.RequestCookies) throw new Error("ไม่มี Next request scope");
  const pathname = `/app/sys/${F.POS_A}/pos`;
  const req = new Request(`http://qc.local${pathname}`, { headers: { ...(cookie ? { cookie } : {}), "user-agent": SUITE, "x-forwarded-for": "203.0.113.52" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const before = new Map<string, string>(jar.getAll().map((c: Any) => [String(c.name), String(c.value)]));
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  let timer: NodeJS.Timeout | undefined;
  const setOf = () => (jar.getAll() as Any[]).map((c) => ({ name: String(c.name), value: String(c.value) })).filter((c) => before.get(c.name) !== c.value);
  try {
    const r = await Promise.race([
      nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, async () => fn(...args))),
      new Promise((_, rej) => (timer = setTimeout(() => rej(Object.assign(new Error("TIMEOUT"), { qcTimeout: true })), opts.timeoutMs ?? 30_000))),
    ]);
    return { o: outcomeOf(r), r, set: setOf() };
  } catch (e) {
    return { o: outcomeOfErr(e), r: null, set: setOf() };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
/** ORACLE-EDIT (CD-P52-O4): จับคู่เครื่อง (OWNER · registerDeviceAction) แล้วคืน "ชื่อ=ค่า" ของคุกกี้เครื่อง · ไม่ได้ = "" */
async function pairCookie(unitId: string, code: string, name: string): Promise<string> {
  const r = await callAct("src/lib/modules/pos/device-actions.ts", "registerDeviceAction", PER.OWNER!, [{ systemId: F.POS_A!, unitId, name, deviceCode: code }]);
  const ck = r.set.find((c) => !/shark_session|shark_tenant/.test(c.name));
  return r.o.kind === "ok" && ck ? `${ck.name}=${ck.value}` : "";
}
/** เรียกฟังก์ชันโมดูลตรง ๆ (ไม่ throw) */
async function svc(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: "MISSING", message: `ไม่มี ${name}` };
  try {
    return await fn(...args);
  } catch (e) {
    return { ok: false, code: "THROW", message: (e as Error)?.message?.slice(0, 160) };
  }
}
const short2 = (v: unknown, n = 70) => {
  try {
    return (typeof v === "string" ? v : JSON.stringify(v) ?? "").replace(/\s+/g, " ").slice(0, n);
  } catch {
    return String(v).slice(0, n);
  }
};
const codeOf2 = (o: Outcome) => `${o.kind}/${o.code}`;
const A_SYS = () => F.POS_A!;
const ctxU2 = (unitId: string, deviceId?: string): Any => ({ tenantId: TA, systemId: A_SYS(), unitId, ...(deviceId ? { deviceId } : {}) });
/** ยอดขายสุทธิต่อสาขาของร้าน A (PAID/REFUNDED · grand − refunded) */
async function netOfUnit(unitId: string): Promise<number> {
  const r = (await P.$queryRawUnsafe(`SELECT coalesce(sum("grandTotalSatang" - "refundedSatang"), 0)::int AS n FROM "PosSale" WHERE "tenantId" = $1 AND "unitId" = $2 AND "docType" = 'SALE' AND status IN ('PAID', 'REFUNDED')`, TA, unitId)) as Any[];
  return Number(r[0]?.n ?? 0);
}

const approvalSvc = await tryImport("@/lib/modules/approval/service");
const posApprovalMod = await tryImport("@/lib/modules/pos/pos-approval");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const deviceMod = await tryImport("@/lib/modules/pos/device");
const staffPinMod = await tryImport("@/lib/modules/pos/staff-pin");
const tableMod = await tryImport("@/lib/modules/restaurant/table");
const menuMod = await tryImport("@/lib/modules/restaurant/menu");
const channelMod = await tryImport("@/lib/modules/pos/channel");
const catalogMod = await tryImport("@/lib/modules/pos/catalog");

async function setup2(): Promise<void> {
  const uA1 = F.A1!;
  const uA2 = F.A2!;
  const pos = A_SYS();
  await step2("บุคคลใหม่", async () => {
    const posKeys = Object.fromEntries([...(gen.permissionCatalog(ROOT) as Set<string>)].filter((k) => k.startsWith("pos.")).sort().map((k) => [k, true]));
    await mkUser(TA, SLUG_A, "MANAGER_A2", "MANAGER", [uA2], {});
    await mkUser(TA, SLUG_A, "MANAGER_ALL", "MANAGER", [uA1, uA2], {});
    await mkUser(TA, SLUG_A, "MANAGER_STAR", "MANAGER", ["*"], {}); // ORACLE-EDIT (CD-P52-O4 F5): unitAccess = "*" ตรงตัว
    await mkUser(TA, SLUG_A, "CASHIER_A2", "STAFF", [uA2], { ...(PQC.cashierPermissions as Record<string, boolean>) });
    await mkUser(TA, SLUG_A, "LEAD", "STAFF", [uA1], { "pos.sale.create": true, "pos.staff.manage": true });
    await mkUser(TA, SLUG_A, "KEYS", "STAFF", [uA1], posKeys);
    await mkUser(TA, SLUG_A, "SELLER", "STAFF", [uA1], { "pos.sale.create": true, "pos.sale.priceOverride": true, "pos.shift.operate": true });
    await mkUser(TA, SLUG_A, "OPERATOR", "STAFF", [uA1], { "pos.sale.create": true, "pos.shift.operate": true });
    await mkUser(TA, SLUG_A, "PAYROLL", "STAFF", [uA1], { "hr.payroll.read": true });
    G.KEYS_N = String(Object.keys(posKeys).length);
  });
  await step2("สาขา A3 (ไม่ผูก POS)", async () => {
    const u = await P.businessUnit.create({ data: { tenantId: TA, type: "SHOP", name: `P52 สาขา A3 ${RAND}`, slug: `p52-a3-${RAND}` } });
    G.A3 = u.id;
    SLUG_OF[u.id] = u.slug;
  });
  await step2("บิล A2 เพิ่ม", async () => {
    G.SALE_A2b = await mkSale(TA, uA2, pos, SENT2.lineA2b, SENT2.recA2b, 271843);
    G.SALE_X4 = await mkSale(TA, uA2, pos, SENT2.lineX4, SENT2.recX4, 33100);
    G.LINE_A2 = String((await P.posSaleLine.findFirst({ where: { tenantId: TA, saleId: F.SALE_A2 }, select: { id: true } }))?.id ?? "");
  });
  await step2("เพดานส่วนลด", async () => {
    const sys = await P.appSystem.findUnique({ where: { id: pos }, select: { settings: true } });
    const cur = sys?.settings && typeof sys.settings === "object" ? (sys.settings as Any) : {};
    await P.appSystem.update({ where: { id: pos }, data: { settings: { ...cur, pos: { ...(cur.pos ?? {}), discount: { maxBpByRole: { CASHIER: 1000, STAFF: 1000, MANAGER: 10000, OWNER: 10000 }, overrideRequiresPin: true } } } } });
  });
  await step2("PIN A1", async () => {
    must2("PIN ผู้จัดการ", await svc(staffPinMod, "setStaffPin", ctxU2(uA1), actorOf2("OWNER"), { userId: PER.MANAGER!.userId, pin: PINS.MANAGER }));
    must2("PIN เจ้าของ", await svc(staffPinMod, "setStaffPin", ctxU2(uA1), actorOf2("OWNER"), { userId: PER.OWNER!.userId, pin: PINS.OWNER }));
    must2("PIN แคชเชียร์", await svc(staffPinMod, "setStaffPin", ctxU2(uA1), actorOf2("OWNER"), { userId: PER.CASHIER!.userId, pin: PINS.CASHIER }));
  });
  await step2("เครื่อง", async () => {
    await P.tenant.update({ where: { id: TA }, data: { limits: { posDevices: 50 } } }); // เพดานเครื่องต่อสาขา (ปริยายต่ำ — D1 จับคู่เพิ่ม 2 เครื่อง)
    const dA2 = must2("เครื่อง A2", await svc(deviceMod, "registerDevice", ctxU2(uA2), actorOf2("OWNER"), { name: SENT2.devA2, deviceCode: DEV.A2 }));
    G.DEVICE_A2 = idOf(dA2);
    must2("เครื่อง Y", await svc(deviceMod, "registerDevice", ctxU2(uA1), actorOf2("OWNER"), { name: `P52 Y ${RAND}`, deviceCode: DEV.Y }));
    must2("เครื่อง Z", await svc(deviceMod, "registerDevice", ctxU2(uA1), actorOf2("OWNER"), { name: `P52 Z ${RAND}`, deviceCode: DEV.Z }));
  });
  await step2("กะ", async () => {
    G.SHIFT_A2 = idOf(must2("กะ A2", await svc(shiftMod, "openShift", ctxU2(uA2, DEV.A2), actorOf2("OWNER"), { deviceId: DEV.A2, floatSatang: 0 })));
    G.SHIFT_Z = idOf(must2("กะ Z (D3)", await svc(shiftMod, "openShift", ctxU2(uA1, DEV.Z), actorOf2("OWNER"), { deviceId: DEV.Z, floatSatang: 0 })));
  });
  await step2("โต๊ะ A2", async () => {
    const z = must2("โซน A2", await svc(tableMod, "createZone", TA, uA2, `P52 โซน A2 ${RAND}`));
    G.ZONE_A2 = idOf(z);
    G.TABLE_A2 = idOf(must2("โต๊ะ A2", await svc(tableMod, "createTable", TA, uA2, { zoneId: G.ZONE_A2, name: SENT2.tableA2, seats: 4 })));
  });
  await step2("ออเดอร์ A2", async () => {
    const chs = (await channelMod.ensureUnitChannels(P, { tenantId: TA, systemId: pos, unitId: uA2 })) as Any[];
    const ch = chs.find((c) => c.adapter === "MANUAL") ?? chs[0];
    const o = await P.posOrder.create({ data: { tenantId: TA, systemId: pos, unitId: uA2, channelId: ch.id, channelCode: ch.code, adapter: ch.adapter, code: `P52-${RAND.slice(0, 4)}`, idempotencyKey: `p52-${RAND}-ordA2`, status: "NEW", paymentState: "UNPAID", fulfilment: "PICKUP", customerName: SENT2.custA2, totalSatang: 13500 } });
    G.ORDER_A2 = o.id;
  });
  await step2("intent + สลิป A2", async () => {
    const id = `pi_${randomBytes(12).toString("base64url")}`;
    await P.posPaymentIntent.create({ data: { id, tenantId: TA, unitId: uA2, systemId: pos, kind: "PROMPTPAY_STATIC", amountSatang: 4300, status: "PENDING", deviceId: DEV.A2, expiresAt: new Date(Date.now() + 15 * 60_000), idempotencyKey: `p52-${RAND}-piA2` } });
    G.INTENT_A2 = id;
    const sl = await P.posPaymentSlip.create({ data: { tenantId: TA, systemId: pos, unitId: uA2, intentId: id, note: SENT2.slipA2, amountSatang: 4300, idempotencyKey: `p52-${RAND}-slipA2`, createdByUserId: PER.CASHIER_A2?.userId ?? PER.OWNER!.userId, purgeAfter: new Date(Date.now() + 30 * DAY) } });
    G.SLIP_A2 = sl.id;
  });
  await step2("บิลพัก A2", async () => {
    for (const k of ["HC_X3", "HC_X4", "HC_F7"]) {
      const h = await P.posHeldCart.create({ data: { tenantId: TA, unitId: uA2, systemId: pos, label: SENT2.heldA2, cartJson: { lines: [{ kind: "custom", name: SENT2.heldA2, qty: 1, unitPriceSatang: 20000 }] }, lineCount: 1, approxTotalSatang: 17000, heldByUserId: PER.CASHIER_A2?.userId ?? PER.OWNER!.userId } });
      G[k] = h.id;
    }
  });
  await step2("กติกา + คำขออนุมัติ A2", async () => {
    for (const kind of ["POS_VOID", "POS_REFUND", "POS_DISCOUNT_OVER"]) await approvalSvc.createPolicy({ tenantId: TA }, { name: `P52 ${kind} A2 ${RAND}`, entityType: kind, unitId: uA2, steps: [{ order: 1, approverRole: "MANAGER" }] });
    const sub = async (kind: string, ref: string, amount: number, payload: Record<string, unknown>): Promise<string> => {
      const r = await posApprovalMod.submitPosApproval({ tenantId: TA, unitId: uA2, systemId: pos, kind, ref, entityIdOf: (n: number) => (n === 1 ? ref : `${ref}:${n}`), amountSatang: amount, requestedById: PER.CASHIER_A2!.userId, payload });
      if (r?.status !== "REQUIRED") throw new Error(`submit ${kind} → ${short2(r, 60)}`);
      return String(r.requestId);
    };
    G.RQ_X3_VOID = await sub("POS_VOID", F.SALE_A2!, 22200, { saleId: F.SALE_A2, reason: "P52 X3", idempotencyKey: `p52-${RAND}-x3void`, deviceId: DEV.A2, receiptNo: SENT.recA2, title: `ยกเลิกบิล ${SENT.recA2}` });
    G.RQ_X3_DISC = await sub("POS_DISCOUNT_OVER", G.HC_X3!, 3000, { heldCartId: G.HC_X3, discountSatang: 3000, discountBp: 1500, title: "P52 X3 ส่วนลด" });
    G.RQ_X4_VOID = await sub("POS_VOID", G.SALE_X4!, 33100, { saleId: G.SALE_X4, reason: "P52 X4", idempotencyKey: `p52-${RAND}-x4void`, deviceId: DEV.A2, receiptNo: SENT2.recX4, title: `ยกเลิกบิล ${SENT2.recX4}` });
    G.RQ_X4_REFUND = await sub("POS_REFUND", `${G.SALE_A2b}:p52x4`, 271843, { saleId: G.SALE_A2b, lines: [], payMethods: [], reasonCode: "DAMAGED", reason: "P52 X4", title: "P52 X4 คืนเงิน" });
    G.RQ_X4_DISC = await sub("POS_DISCOUNT_OVER", G.HC_X4!, 3000, { heldCartId: G.HC_X4, discountSatang: 3000, discountBp: 1500, title: "P52 X4 ส่วนลด" });
    G.RQ_F7_DISC = await sub("POS_DISCOUNT_OVER", G.HC_F7!, 3000, { heldCartId: G.HC_F7, discountSatang: 3000, discountBp: 1500, title: "P52 F7 ส่วนลด" });
  });
  await step2("สินค้าร่วม + บริษัท", async () => {
    const pr = await catalogMod.createProduct({ tenantId: TA, systemId: pos, actorUserId: PER.OWNER!.userId }, { name: `P52 สินค้าร่วม ${RAND}`, basePriceSatang: 5000 });
    G.PROD = String(pr?.id ?? "");
    G.PARTY = (await P.party.create({ data: { tenantId: TA, name: `P52 บริษัท ${RAND} จำกัด`, kind: "COMPANY" } })).id;
  });
  // D11 + F8: วัตถุร้านอาหารของ A1 (ผูก POS) และ A3 (ไม่ผูก)
  for (const [tag2, u] of [["A1", uA1], ["A3", G.A3 ?? ""]] as const) {
    if (!u) continue;
    await step2(`ร้านอาหาร ${tag2}`, async () => {
      // ORACLE-EDIT (oracle2 รอบ 1): ตัวสร้างของโมดูลเดิมบางตัวไม่คืน id (createStation = {ok}) ⇒ หา id จากชื่อใน DB ทุกตัว · โซนว่าง (ZONE2) ไว้ให้ archiveZone
      const byName = async (model: string, name: string): Promise<string> => String((await P[model].findFirst({ where: { tenantId: TA, unitId: u, name }, select: { id: true } }))?.id ?? "");
      const nm = (k: string) => `P52 ${k} ${tag2} ${RAND}`;
      must2("โซน", await svc(tableMod, "createZone", TA, u, nm("โซน")));
      G[`ZONE_${tag2}`] = await byName("restaurantZone", nm("โซน"));
      must2("โซนว่าง", await svc(tableMod, "createZone", TA, u, nm("โซนว่าง")));
      G[`ZONE2_${tag2}`] = await byName("restaurantZone", nm("โซนว่าง"));
      must2("โต๊ะ", await svc(tableMod, "createTable", TA, u, { zoneId: G[`ZONE_${tag2}`], name: nm("โต๊ะ"), seats: 2 }));
      G[`TABLE_${tag2}`] = await byName("restaurantTable", nm("โต๊ะ"));
      must2("สถานี", await svc(menuMod, "createStation", TA, u, nm("สถานี")));
      G[`STATION_${tag2}`] = await byName("kdsStation", nm("สถานี"));
      must2("หมวด", await svc(menuMod, "createCategory", TA, u, { name: nm("หมวด") }, PER.OWNER!.userId));
      G[`CAT_${tag2}`] = await byName("menuCategory", nm("หมวด"));
      must2("กลุ่มตัวเลือก", await svc(menuMod, "createOptionGroup", TA, u, { name: nm("ตัวเลือก"), minSelect: 0, maxSelect: 1, choices: [{ name: "หวานน้อย", priceDelta: 0 }] }));
      G[`OG_${tag2}`] = await byName("menuOptionGroup", nm("ตัวเลือก"));
      if (!G[`ZONE_${tag2}`] || !G[`ZONE2_${tag2}`] || !G[`TABLE_${tag2}`] || !G[`STATION_${tag2}`] || !G[`CAT_${tag2}`] || !G[`OG_${tag2}`]) throw new Error(`id ไม่ครบ ${tag2}`);
      G[`CHOICE_${tag2}`] = String((await P.menuOptionChoice.findFirst({ where: { tenantId: TA, groupId: G[`OG_${tag2}`] }, select: { id: true } }))?.id ?? "");
      const it = await svc(menuMod, "createItem", TA, u, { categoryId: G[`CAT_${tag2}`], stationId: G[`STATION_${tag2}`], name: `P52 เมนู ${tag2} ${RAND}`, basePrice: 5000 }, PER.OWNER!.userId);
      G[`ITEM_${tag2}`] = idOf(it) || String((await P.menuItem.findFirst({ where: { tenantId: TA, unitId: u, name: `P52 เมนู ${tag2} ${RAND}` }, select: { id: true } }))?.id ?? "");
      if (!G[`ITEM_${tag2}`]) throw new Error(`เมนู ${tag2} → ${short2(it, 80)}`);
    });
  }
  console.log(`  ชุดใหม่: A3 ${G.A3 ?? "-"} · บุคคล 8 (KEYS ${G.KEYS_N ?? "?"} คีย์) · A2: บิล 3 โต๊ะ ${G.TABLE_A2 ? "✓" : "✗"} ออเดอร์ ${G.ORDER_A2 ? "✓" : "✗"} กะ ${G.SHIFT_A2 ? "✓" : "✗"} บิลพัก ${G.HC_F7 ? 3 : 0} คำขอ ${["RQ_X3_VOID", "RQ_X3_DISC", "RQ_X4_VOID", "RQ_X4_REFUND", "RQ_X4_DISC", "RQ_F7_DISC"].filter((k) => G[k]).length}/6 เครื่อง ${G.DEVICE_A2 ? "✓" : "✗"} intent ${G.INTENT_A2 ? "✓" : "✗"} สลิป ${G.SLIP_A2 ? "✓" : "✗"} · fixture ล้ม ${FX2.length}`);
}

/** ชนิดของ id หลักจากชื่อ action (X3) */
function idKindOf(name: string): string {
  if (/Approval|Request/.test(name) && !/Refund/.test(name)) return "approval";
  if (/Slip/.test(name)) return "slip";
  if (/Intent|PromptPay|Beam|Card/.test(name)) return "intent";
  if (/Held|Recall|Park|Hold/.test(name)) return "held";
  if (/Device|Heartbeat|PrintAgent|Display/.test(name)) return "device";
  if (/Shift|Cash|Recount|[xXzZ]Report|Drawer/.test(name)) return "shift";
  if (/Order|Kds|Kitchen|Ticket/.test(name)) return "order";
  if (/Table|Seat|Merge|Split|Move|Zone|Reservation|Session/.test(name)) return "table";
  return "sale";
}
/** X3: อาร์กิวเมนต์ที่ไม่ว่าง (blind spot 3) — unitId ของผู้เรียก (หรือไม่ส่ง) + id ของวัตถุ A2 ทุกช่อง */
function argsX3(row: MRow, unitId: string | undefined, n: number): Record<string, unknown> {
  const name = row.surface.split("#")[1] ?? "";
  const ids: Record<string, string> = { sale: F.SALE_A2!, table: G.TABLE_A2 ?? "", order: G.ORDER_A2 ?? "", shift: G.SHIFT_A2 ?? "", held: G.HC_X3 ?? "", approval: G.RQ_X3_VOID ?? "", device: G.DEVICE_A2 ?? "", intent: G.INTENT_A2 ?? "", slip: G.SLIP_A2 ?? "" };
  const main = ids[idKindOf(name)] || F.SALE_A2!;
  const key = `p52x3-${RAND}-${n}`;
  const a = argsFor({ systemId: A_SYS(), unitId: unitId ?? "", saleId: F.SALE_A2! });
  const line = { name: `P52 X3 ${RAND}`, qty: 1, unitPriceSatang: 100 };
  Object.assign(a, {
    unitId,
    unitIds: unitId ? [unitId] : undefined,
    id: main, ids: [main], saleId: F.SALE_A2, orderId: G.ORDER_A2, posOrderIds: [G.ORDER_A2], tableId: G.TABLE_A2, toTableId: G.TABLE_A2, shiftId: G.SHIFT_A2, heldCartId: G.HC_X3, requestId: G.RQ_X3_VOID, intentId: G.INTENT_A2, slipId: G.SLIP_A2, deviceId: DEV.A2,
    productId: G.PROD, productIds: [G.PROD], idempotencyKey: key,
    input: { id: main, saleId: F.SALE_A2, orderId: G.ORDER_A2, tableId: G.TABLE_A2, shiftId: G.SHIFT_A2, heldCartId: G.HC_X3, requestId: G.RQ_X3_VOID, intentId: G.INTENT_A2, slipId: G.SLIP_A2, deviceId: DEV.A2, reason: "P52", idempotencyKey: key },
    cart: { lines: [line] },
    sale: { lines: [line], payMethods: [{ type: "CASH", amountSatang: 100 }], idempotencyKey: key, expectedGrandTotalSatang: 100, cashReceivedSatang: 100, heldCartId: G.HC_X3 },
    refund: { saleId: F.SALE_A2, lines: [{ lineId: G.LINE_A2, qty: 1 }], payMethods: [{ type: "CASH", amountSatang: 22200 }], reasonCode: "DAMAGED", reason: "P52", idempotencyKey: key },
    shift: { deviceId: DEV.A2, floatSatang: 0 },
    close: { shiftId: G.SHIFT_A2, countedCashSatang: 0, idempotencyKey: key },
    movement: { shiftId: G.SHIFT_A2, type: "PAY_OUT", amountSatang: 100, reason: "P52", idempotencyKey: key },
    recount: { shiftId: G.SHIFT_A2, countedCashSatang: 0, reason: "P52" },
    patch: { name: `P52 X3 ${RAND}` },
  });
  return a;
}
async function invokeX3(row: MRow, persona: Persona, unitId: string | undefined, n: number): Promise<Outcome> {
  const [file, name] = row.surface.split("#") as [string, string];
  const a = argsX3(row, unitId, n);
  let args: unknown[];
  if (row.call === "none") args = [];
  else if (row.call === "pos") args = [A_SYS(), {}];
  else if (row.call === "unit" || row.call === "form") {
    const fd = new FormData();
    for (const [k, v] of Object.entries(a)) if (typeof v === "string") fd.set(k, v);
    args = row.call === "unit" ? [unitId ? (SLUG_OF[unitId] ?? "") : "", fd] : [fd];
  } else args = [a];
  return (await callAct(file, name, persona, args, { timeoutMs: 20_000 })).o;
}

async function runDb2(): Promise<void> {
  await setup2();
  const uA1 = F.A1!;
  const uA2 = F.A2!;
  const fxNote = () => (FX2.length ? ` · fixture ล้ม ${FX2.length}: ${FX2.slice(0, 2).join(" | ")}` : "");

  // ── X3 (blind spots 1–5) ──
  {
    const rows = ACTIONS().filter((r) => r.unitScoped && r.roles.OTHER_UNIT === "deny");
    const base = [SENT.recA2, SENT.lineA2, SENT2.recA2b, SENT2.lineA2b, SENT2.recX4, SENT2.lineX4, SENT2.custA2, SENT2.devA2, SENT2.tableA2, SENT2.heldA2, SENT2.slipA2];
    const netA2 = await netOfUnit(uA2);
    let netA1 = await netOfUnit(uA1);
    const sentNow = () => [...base, ...aggSentinels(netA2), ...aggSentinels(netA1 + netA2)];
    // ตัวควบคุมบวก: (ก) บุคคลใหม่เห็นบิล A1 · (ข) sentinel ยอดรวมโผล่ในรายงานของ A2 จริง (ผู้ที่ดู A2 ได้)
    const bd = rowOf("src/lib/modules/pos/bills-actions.ts#billDetailAction");
    const rp = rowOf("src/lib/modules/pos/report-actions.ts#posReportAction");
    const pc: string[] = [];
    let pcOk = !!bd && !!rp && FX2.length === 0;
    for (const k of ["MANAGER", "KEYS"]) {
      const o = bd ? await invoke(bd, PER[k]!, { systemId: A_SYS(), unitId: uA1, saleId: F.SALE_A1! }) : null;
      const seen = !!o && o.kind === "ok" && o.text.includes(SENT.recA1);
      pcOk &&= seen;
      pc.push(`${k} บิล A1 ${seen ? "เห็น" : o?.code}`);
    }
    {
      const r = rp ? await callAct(rp.surface.split("#")[0]!, "posReportAction", PER.MANAGER_A2!, [{ systemId: A_SYS(), unitId: uA2, kind: "daily", from: bkkToday(), to: bkkToday() }]) : null;
      const hit = !!r && leaks(r.o.text, aggSentinels(netA2)).length > 0;
      pcOk &&= hit;
      pc.push(`รายงาน A2 (MANAGER[A2]) มียอด ${(netA2 / 100).toFixed(2)} ${hit ? "✓" : `✗ ${r ? codeOf2(r.o) : "-"}`}`);
    }
    const before = await fpRows(TA, uA2);
    const bad: string[] = [];
    const codes: Record<string, number> = {};
    let n = 0;
    const variants: [string, string, string | undefined][] = [["MANAGER", "A1", uA1], ["MANAGER", "∅", undefined], ["KEYS", "A1", uA1]];
    for (const [pk, vtag, unitId] of variants) {
      for (const r of rows) {
        const o = await invokeX3(r, PER[pk]!, unitId, ++n);
        codes[o.code] = (codes[o.code] ?? 0) + 1;
        const lk = leaks(o.text, sentNow());
        if (lk.length || o.kind === "timeout") bad.push(`${pk}/${vtag}:${tag(r)}=${codeOf2(o)}${lk.length ? ` รั่ว ${lk[0]!.slice(0, 24)}` : ""}`);
        if (o.kind === "ok") netA1 = await netOfUnit(uA1);
      }
    }
    // OutboxEvent/OpsEvent = งานเบื้องหลัง (drain ของบิล A2 เดิม — ไม่ใช่การเขียนของผู้เรียก · รอบ 1 พบ OutboxEvent ของ A2 ถูก drain แก้สถานะ จำนวนเท่าเดิม)
    const diff = fpDiff(before, await fpRows(TA, uA2)).filter((d) => !/^(OutboxEvent|OpsEvent):/.test(d));
    const top = Object.entries(codes).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, k]) => `${c} ${k}`).join(" · ");
    chk("X3", rows.length > 0 && pcOk && bad.length === 0 && diff.length === 0, "บวกผ่าน · ไม่เห็น A2 · แถว A2 ไม่เปลี่ยน", `${rows.length} แถว × 3 แบบ = ${n} ครั้ง · บวก: ${pc.join(" · ")} · รั่ว/ค้าง ${bad.length}${bad.length ? `: ${bad.slice(0, 8).join(" · ")}` : ""} · แถว A2 เปลี่ยน ${diff.length ? diff.slice(0, 5).join(", ") : "0"} · ผล: ${top}${fxNote()}`);
  }

  // ── X4 (F1 HIGH) ──
  {
    const p: string[] = [];
    const ids = [G.RQ_X4_VOID, G.RQ_X4_REFUND, G.RQ_X4_DISC].filter(Boolean) as string[];
    const m = (k: string) => ({ ...actorOf2(k) });
    const pendA1 = (await approvalSvc.listPending({ tenantId: TA }, m("MANAGER")).catch(() => null)) as Any[] | null;
    const pendA2 = (await approvalSvc.listPending({ tenantId: TA }, m("MANAGER_A2")).catch(() => null)) as Any[] | null;
    const seenA1 = (pendA1 ?? []).filter((r) => ids.includes(r.id)).length;
    const seenA2 = (pendA2 ?? []).filter((r) => ids.includes(r.id)).length;
    if (ids.length !== 3) p.push(`fixture คำขอ ${ids.length}/3`);
    if (seenA1 !== 0) p.push(`listPending MANAGER[A1] เห็นคำขอ A2 ${seenA1}/3`);
    if (seenA2 !== ids.length) p.push(`ตัวควบคุมบวก MANAGER[A2] เห็น ${seenA2}/${ids.length}`);
    const fd1 = new FormData();
    fd1.set("requestId", G.RQ_X4_VOID ?? "");
    fd1.set("decision", "APPROVED");
    const d1 = await callAct("src/lib/modules/approval/actions.ts", "decideAction", PER.MANAGER!, [fd1]);
    if (d1.r?.ok === true) p.push("decideAction(APPROVED) ของ MANAGER[A1] = ok");
    const fd2 = new FormData();
    for (const id of [G.RQ_X4_REFUND, G.RQ_X4_DISC]) fd2.append("requestIds", id ?? "");
    fd2.set("decision", "REJECTED");
    fd2.set("note", "P52 X4");
    const d2 = await callAct("src/lib/modules/approval/actions.ts", "bulkDecideAction", PER.MANAGER!, [{ status: "idle" }, fd2]);
    if (Number(d2.r?.done ?? 0) > 0) p.push(`bulkDecideAction(REJECTED) ของ MANAGER[A1] done ${d2.r?.done}`);
    await sleep(300);
    const st = (await P.approvalRequest.findMany({ where: { tenantId: TA, id: { in: ids } }, select: { id: true, status: true } })) as Any[];
    const notPending = st.filter((r) => r.status !== "PENDING").map((r) => `${r.id === G.RQ_X4_VOID ? "VOID" : r.id === G.RQ_X4_REFUND ? "REFUND" : "DISC"}=${r.status}`);
    if (notPending.length) p.push(`คำขอ A2 เปลี่ยน: ${notPending.join(",")}`);
    const sale = await P.posSale.findUnique({ where: { id: G.SALE_X4 ?? "none" }, select: { status: true } });
    if (sale?.status !== "PAID") p.push(`บิล A2 ${SENT2.recX4} = ${sale?.status ?? "?"}`);
    // ตัวควบคุมบวกทางเขียน: MANAGER[A2] ปฏิเสธคำขอคืนเงินของ A2 ได้ (ทำหลังสุด — เฉพาะเมื่อยัง PENDING)
    let pos2 = "ข้าม";
    if (!notPending.some((x) => x.startsWith("REFUND"))) {
      const fd3 = new FormData();
      fd3.append("requestIds", G.RQ_X4_REFUND ?? "");
      fd3.set("decision", "REJECTED");
      fd3.set("note", "P52 X4 บวก");
      const d3 = await callAct("src/lib/modules/approval/actions.ts", "bulkDecideAction", PER.MANAGER_A2!, [{ status: "idle" }, fd3]);
      pos2 = `done ${d3.r?.done ?? codeOf2(d3.o)}`;
      if (Number(d3.r?.done ?? 0) !== 1) p.push(`ตัวควบคุมบวก MANAGER[A2] ปฏิเสธ → ${pos2}`);
    }
    chk("X4", p.length === 0, "A1 ไม่เห็น/ตัดสินคำขอ A2 ไม่ได้ · PENDING · บิล PAID · บวกผ่าน", `${p.join(" · ") || "ครบ"} · decide ${codeOf2(d1.o)} ${short2(d1.r, 50)} · bulk ${short2(d2.r, 50)} · บวก A2 ${pos2}${fxNote()}`);
  }

  // ── X4b (ORACLE-EDIT CD-P52-O3-2 · R1 F2): ผู้ตัดสินเสียสิทธิ์สาขาหลังอนุมัติ → ยึดส่วนลดที่อนุมัติไม่ได้ (มติ 5: เหมือน "ไม่ได้อนุมัติ") ──
  {
    const p: string[] = [];
    const regMod = await tryImport("@/lib/modules/pos/register");
    const consMod = await tryImport("@/lib/modules/pos/pos-approval-consumer");
    // ผู้ขาย A2 ที่ตั้งราคาเองได้ (บรรทัดกำหนดเอง) — แคชเชียร์ A2 ไม่มี pos.sale.priceOverride (รอบแรก = PERMISSION_DENIED ก่อนถึงส่วนลด)
    if (!PER.SELLER_A2) await step2("ผู้ขาย A2 (X4b)", async () => mkUser(TA, SLUG_A, "SELLER_A2", "STAFF", [uA2], { "pos.sale.create": true, "pos.sale.priceOverride": true, "pos.shift.operate": true }));
    let n = 0;
    const input = (heldCartId?: string) => ({
      lines: [{ name: `P52 X4b ${RAND}`, qty: 1, unitPriceSatang: 20000 }], billDiscount: { type: "PERCENT", value: 1500 }, idempotencyKey: `p52-${RAND}-x4b-${++n}`,
      expectedGrandTotalSatang: 17000, payMethods: [{ type: "CASH", amountSatang: 17000 }], cashReceivedSatang: 17000, ...(heldCartId ? { heldCartId } : {}),
    });
    const sellX = async (held?: string) => {
      const inp = input(held);
      const c0 = await P.posSale.count({ where: { tenantId: TA, unitId: uA2 } });
      const r = await svc(regMod, "submitRegisterSale", ctxU2(uA2, DEV.A2), actorOf2("SELLER_A2"), inp);
      const c1 = await P.posSale.count({ where: { tenantId: TA, unitId: uA2 } });
      return { r, saleId: String(r?.saleId ?? ""), newBills: c1 - c0 };
    };
    const a = await sellX();
    const rq = a.r?.code === "APPROVAL_REQUIRED" && typeof a.r.requestId === "string" ? a.r.requestId : "";
    const held = rq && typeof a.r.heldCartId === "string" ? a.r.heldCartId : "";
    if (!rq || !held) p.push(`ขออนุมัติ 15% → ${a.r?.ok === true ? "ok" : a.r?.code} ${short2(a.r?.message ?? "", 50)}`);
    const mgr = PER.MANAGER_A2;
    const d = rq && mgr ? await svc(approvalSvc, "decide", actorOf2("MANAGER_A2"), { tenantId: TA }, rq, { decision: "APPROVED", note: "P52 X4b" }) : null;
    if (rq && d?.ok !== true) p.push(`MANAGER[A2] อนุมัติ → ${short2(d, 60)}`);
    // ตัวรับคิว (ชั้นที่ผูกบิลพัก) เรียกตรง — event จริงถูกเล่นซ้ำได้ (idempotent)
    if (rq && typeof consMod?.onPosApprovalDecided === "function") {
      await consMod.onPosApprovalDecided({ id: `p52-x4b-${RAND}`, tenantId: TA, type: "approval.request.approved", payload: { requestId: rq, entityType: "POS_DISCOUNT_OVER" }, systemId: A_SYS(), unitId: uA2 });
    } else if (rq) p.push("ไม่มี onPosApprovalDecided");
    const armed = held ? await P.posHeldCart.findUnique({ where: { id: held }, select: { approvedRequestId: true } }) : null;
    if (rq && armed?.approvedRequestId !== rq) p.push(`บิลพักไม่ผูกคำขอ (${armed?.approvedRequestId ?? "null"})`);
    const mem = mgr ? await P.membership.findFirst({ where: { tenantId: TA, userId: mgr.userId }, select: { id: true, unitAccess: true } }) : null;
    let neg = "ข้าม";
    let pos2 = "ข้าม";
    if (rq && held && mem && armed?.approvedRequestId === rq) {
      try {
        await P.membership.update({ where: { id: mem.id }, data: { unitAccess: [uA1] } }); // ย้ายผู้ตัดสินไปสาขา A1 หลังอนุมัติ
        const x = await sellX(held);
        neg = x.r?.ok === true ? `ok บิล ${x.saleId ? "มี" : "?"}` : String(x.r?.code);
        if (x.r?.code !== "DISCOUNT_EXCEEDS_LIMIT") p.push(`ผู้ตัดสินเสียสิทธิ์ → ${neg} (คาด DISCOUNT_EXCEEDS_LIMIT)`);
        if (x.saleId || x.newBills !== 0) p.push(`มีบิลจากส่วนลดของผู้ตัดสินที่เสียสิทธิ์ (+${x.newBills})`);
      } finally {
        await P.membership.update({ where: { id: mem.id }, data: { unitAccess: mem.unitAccess } });
      }
      // ตัวควบคุมบวก: ผู้ตัดสินยังมีสิทธิ์ (คืนสาขา A2) → คำขอเดิมใช้ได้ via approved
      const ok = await sellX(held);
      const au = ok.saleId ? ((await P.auditLog.findMany({ where: { tenantId: TA, action: "pos.discount.override", targetId: ok.saleId }, select: { actorId: true, after: true } })) as Any[]) : [];
      pos2 = ok.r?.ok === true ? `ok ฿${(Number(ok.r.grandTotalSatang ?? 0) / 100).toFixed(0)} audit ${au.length}` : String(ok.r?.code);
      if (ok.r?.ok !== true || ok.r.grandTotalSatang !== 17000) p.push(`ตัวควบคุมบวก → ${pos2} ${short2(ok.r?.message ?? "", 50)}`);
      else if (au.length !== 1 || au[0].actorId !== mgr!.userId || au[0].after?.requestId !== rq || au[0].after?.via !== "approval") p.push(`audit override ${au.length} ${short2(au[0]?.after, 80)}`);
    } else if (!mem) p.push("ไม่มี Membership ของ MANAGER[A2]");
    chk("X4b", p.length === 0, "เสียสิทธิ์ = DISCOUNT_EXCEEDS_LIMIT ไม่มีบิล · คืนสิทธิ์ = ผ่าน via approved", `${p.join(" · ") || "ครบ"} · เสียสิทธิ์ → ${neg} · บวก → ${pos2}${fxNote()}`);
  }

  // ── F7 ข้ามสาขา: PIN ผู้จัดการ A1 + heldCartId ของ A2 ──
  {
    const p: string[] = [];
    const sale = (key: string, heldCartId: string | null) => ({
      lines: [{ name: `P52 F7 ${RAND}`, qty: 1, unitPriceSatang: 20000 }], billDiscount: { type: "PERCENT", value: 1500 }, idempotencyKey: key, expectedGrandTotalSatang: 17000,
      payMethods: [{ type: "CASH", amountSatang: 17000 }], cashReceivedSatang: 17000, managerPin: PINS.MANAGER, managerUserId: PER.MANAGER!.userId, ...(heldCartId ? { heldCartId } : {}),
    });
    // ORACLE-EDIT (CD-P52-O4 F1): ทางขายอ่านเครื่องจากคุกกี้ ⇒ จับคู่เครื่อง F7 ในรอบแล้วขายด้วยคุกกี้ (deviceId ใน payload คงไว้ = ค่าเดียวกัน)
    const f7Cookie = await pairCookie(uA1, DEV.F7, `P52 F7 ${RAND}`);
    if (!f7Cookie) p.push("จับคู่เครื่อง F7 ไม่ได้ (ไม่มีคุกกี้)");
    const sell = (key: string, held: string | null) => callAct("src/lib/modules/pos/register-actions.ts", "submitRegisterSaleAction", PER.SELLER!, [{ systemId: A_SYS(), unitId: uA1, deviceId: DEV.F7, sale: sale(key, held) }], { cookie: f7Cookie || undefined });
    let pc = await sell(`p52-${RAND}-f7pc`, null);
    if (pc.r?.code === "SHIFT_REQUIRED") {
      await svc(shiftMod, "openShift", ctxU2(uA1, DEV.F7), actorOf2("SELLER"), { deviceId: DEV.F7, floatSatang: 0 });
      pc = await sell(`p52-${RAND}-f7pc2`, null);
    }
    if (pc.r?.ok !== true) p.push(`ตัวควบคุมบวก (PIN ไม่มี heldCartId) → ${codeOf2(pc.o)} ${short2(pc.r?.message ?? "", 60)}`);
    const before = await P.approvalRequest.findUnique({ where: { id: G.RQ_F7_DISC ?? "none" }, select: { status: true } });
    const x = await sell(`p52-${RAND}-f7x`, G.HC_F7 ?? "none");
    await sleep(200);
    const after = await P.approvalRequest.findUnique({ where: { id: G.RQ_F7_DISC ?? "none" }, select: { status: true } });
    if (before?.status !== "PENDING") p.push(`fixture คำขอ A2 = ${before?.status ?? "?"}`);
    if (after?.status !== "PENDING") p.push(`คำขอ POS_DISCOUNT_OVER ของ A2 → ${after?.status}`);
    const reached = x.r?.ok === true || ["APPROVAL_MISMATCH", "NOT_FOUND", "PERMISSION_DENIED", "HELD_CART_NOT_FOUND"].includes(String(x.r?.code));
    if (!reached) p.push(`ไม่ถึงทาง PIN (${codeOf2(x.o)})`);
    chk("F7", p.length === 0, "คำขอ A2 ยัง PENDING · บวกผ่าน", `${p.join(" · ") || "ครบ"} · บวก ${pc.r?.ok === true ? "ok" : codeOf2(pc.o)} · ขาย A1 + heldCartId A2 → ${x.r?.ok === true ? "ok" : codeOf2(x.o)} · คำขอ A2 ${before?.status}→${after?.status}${fxNote()}`);
  }

  // ── X5 (F2 ลำดับชั้น PIN) ──
  {
    const p: string[] = [];
    const pinRow = async (userId: string) => P.posStaffPin.findUnique({ where: { unitId_userId: { unitId: uA1, userId } }, select: { pinHash: true, failedCount: true, lockedUntil: true } });
    const lock = async (userId: string) => P.posStaffPin.updateMany({ where: { tenantId: TA, unitId: uA1, userId }, data: { failedCount: 5, lockedUntil: new Date(Date.now() + 3600_000) } });
    const T = { systemId: A_SYS(), unitId: uA1 };
    const setPin = (actor: string, target: string, pin: string) => callAct("src/lib/modules/pos/staff-pin-actions.ts", "setStaffPinAction", PER[actor]!, [{ ...T, userId: PER[target]!.userId, pin }]);
    const unlock = (actor: string, target: string) => callAct("src/lib/modules/pos/staff-pin-actions.ts", "unlockStaffPinAction", PER[actor]!, [{ ...T, userId: PER[target]!.userId }]);
    const denied = (r: Any) => r?.ok === false && /PERMISSION_DENIED|NO_PERMISSION|FORBIDDEN/.test(String(r?.code));
    const out: string[] = [];
    for (const [actor, target, pin] of [["MANAGER", "OWNER", PINS.X5OWNER], ["LEAD", "MANAGER", PINS.X5MGR]] as const) {
      const b = await pinRow(PER[target]!.userId);
      const r = await setPin(actor, target, pin);
      const a = await pinRow(PER[target]!.userId);
      if (!denied(r.r)) p.push(`${actor} ตั้ง PIN ${target} → ${codeOf2(r.o)}`);
      if (b?.pinHash !== a?.pinHash) p.push(`PIN ของ ${target} เปลี่ยน`);
      await lock(PER[target]!.userId);
      const u = await unlock(actor, target);
      const a2 = await pinRow(PER[target]!.userId);
      if (!denied(u.r)) p.push(`${actor} ปลดล็อก ${target} → ${codeOf2(u.o)}`);
      if (!a2?.lockedUntil || Number(a2.failedCount) !== 5) p.push(`ล็อกของ ${target} ถูกล้าง`);
      out.push(`${actor}→${target}: ตั้ง ${r.r?.ok === true ? "ok" : r.r?.code} · ปลด ${u.r?.ok === true ? "ok" : u.r?.code}`);
      await P.posStaffPin.updateMany({ where: { tenantId: TA, unitId: uA1, userId: PER[target]!.userId }, data: { failedCount: 0, lockedUntil: null } });
    }
    // ตัวควบคุมบวก: ผู้จัดการ/หัวหน้ากะตั้ง PIN แคชเชียร์ (บทบาทไม่สูงกว่า) ได้
    const okM = await setPin("MANAGER", "CASHIER", PINS.X5OK);
    const okL = await setPin("LEAD", "CASHIER", PINS.X5LEAD);
    if (okM.r?.ok !== true) p.push(`บวก MANAGER→CASHIER ${codeOf2(okM.o)}`);
    if (okL.r?.ok !== true) p.push(`บวก LEAD→CASHIER ${codeOf2(okL.o)}`);
    chk("X5", p.length === 0, "สูงกว่า = PERMISSION_DENIED · PIN/ล็อกเดิม · บวกผ่าน", `${p.join(" · ") || "ครบ"} · ${out.join(" · ")} · บวก ${okM.r?.ok === true ? "ok" : okM.r?.code}/${okL.r?.ok === true ? "ok" : okL.r?.code}${fxNote()}`);
  }

  // ── H6b (แถว cond: ผู้จัดการสาขาเดียว) ──
  {
    const p: string[] = [];
    const sys = async () => JSON.stringify((await P.appSystem.findUnique({ where: { id: A_SYS() }, select: { settings: true } }))?.settings ?? null);
    const credit = async () => Number(await P.posCreditAccount.count({ where: { tenantId: TA, partyId: G.PARTY ?? "none" } }).catch(() => -1));
    const W: [string, string, Record<string, unknown>][] = [
      ["src/lib/modules/pos/settings-actions.ts", "updatePosGeneralSettingsAction", { systemId: A_SYS(), patch: { heldCartExpireDays: 9 } }],
      ["src/lib/modules/pos/settings-actions.ts", "updatePosDiscountCapsAction", { systemId: A_SYS(), patch: { STAFF: 1200 } }],
      ["src/lib/modules/pos/settings-actions.ts", "updatePosStaffSettingsAction", { systemId: A_SYS(), patch: { clockOnShift: "ASK" } }],
      ["src/lib/modules/pos/offline-actions.ts", "updatePosOfflineEnabledAction", { systemId: A_SYS(), enabled: true }],
      ["src/lib/pos-integrations-actions.ts", "setPosAccountLinkAction", { systemId: A_SYS(), enabled: true }],
      ["src/lib/modules/pos/receipt-settings-actions.ts", "updatePosReceiptSettingsAction", { systemId: A_SYS(), patch: { footer: `P52 H6b ${RAND}` } }],
      ["src/lib/modules/pos/credit-actions.ts", "saveCreditAccountAction", { systemId: A_SYS(), partyId: G.PARTY, limitSatang: 500000, termDays: 30 }],
      ["src/lib/modules/pos/tip-ledger-actions.ts", "posTipLedgersAction", { systemId: A_SYS() }],
    ];
    const s0 = await sys();
    const c0 = await credit();
    const out: string[] = [];
    for (const [f, n, a] of W) {
      const r = await callAct(f, n, PER.MANAGER!, [a]);
      const ok = r.o.kind === "ok";
      if (ok) p.push(`${n} ✗ ok`);
      out.push(`${n.replace(/Action$/, "")} ${ok ? "ok" : r.o.code}`);
    }
    const s1 = await sys();
    const c1 = await credit();
    if (s0 !== s1) p.push("settings ของ POS เปลี่ยน");
    if (c0 !== c1) p.push(`บัญชีเครดิต ${c0}→${c1}`);
    // ตัวควบคุมบวก: MANAGER ครบทุกสาขา (A1+A2) เขียนได้ · OWNER อ่านสมุดทิปได้
    const pos: string[] = [];
    for (const [f, n, a] of [W[0]!, W[1]!, W[5]!]) {
      const r = await callAct(f, n, PER.MANAGER_ALL!, [a]);
      if (r.o.kind !== "ok") p.push(`บวก MANAGER_ALL ${n} → ${codeOf2(r.o)} ${short2(r.r?.message ?? "", 50)}`);
      pos.push(`${n.replace(/Action$/, "").replace(/^updatePos|^save/, "")} ${r.o.kind === "ok" ? "ok" : r.o.code}`);
    }
    // ORACLE-EDIT (CD-P52-O4 F5 มติ): เครดิต + สมุดทิป = OWNER หรือ MANAGER ที่ unitAccess = "*" ตรงตัวเท่านั้น — MANAGER ระบุครบทุกสาขา (MANAGER_ALL) ≠ "*" ⇒ ปฏิเสธ · MANAGER_STAR ⇒ ได้
    for (const [f, n, a] of [W[6]!, W[7]!]) {
      const c0 = await credit();
      const r = await callAct(f, n, PER.MANAGER_ALL!, [a]);
      if (r.o.kind === "ok") p.push(`MANAGER_ALL (ระบุทุกสาขา) ${n} ✗ ok`);
      if ((await credit()) !== c0) p.push(`MANAGER_ALL ${n} เปลี่ยนบัญชีเครดิต`);
      pos.push(`ALL ${n.replace(/Action$/, "").replace(/^save|^pos/, "")} ${r.o.kind === "ok" ? "ok" : r.o.code}`);
      const st = await callAct(f, n, PER.MANAGER_STAR!, [a]);
      if (st.o.kind !== "ok") p.push(`บวก MANAGER("*") ${n} → ${codeOf2(st.o)} ${short2(st.r?.message ?? "", 50)}`);
      pos.push(`"*" ${n.replace(/Action$/, "").replace(/^save|^pos/, "")} ${st.o.kind === "ok" ? "ok" : st.o.code}`);
    }
    const tip = await callAct(W[7]![0], W[7]![1], PER.OWNER!, [W[7]![2]]);
    if (tip.o.kind !== "ok") p.push(`บวก OWNER สมุดทิป → ${codeOf2(tip.o)}`);
    chk("H6b", p.length === 0, "MANAGER สาขาเดียว ปฏิเสธทั้ง 8 · ค่าเดิม · บวกผ่าน · เครดิต/ทิป: MANAGER ระบุทุกสาขา ปฏิเสธ · MANAGER(\"*\") ได้", `${p.join(" · ") || "ครบ"} · MANAGER[A1]: ${out.join(" · ")} · MANAGER_ALL: ${pos.join(" · ")} · OWNER ทิป ${tip.o.kind === "ok" ? "ok" : tip.o.code}${fxNote()}`);
  }

  // ── F9 unitPriceMatrixAction ต้องมีคีย์ POS ──
  {
    const f = "src/lib/modules/pos/catalog-price-actions.ts";
    const a = { systemId: A_SYS(), productIds: [G.PROD ?? "none"] };
    const np = await callAct(f, "unitPriceMatrixAction", PER.NOPERM!, [a]);
    const cs = await callAct(f, "unitPriceMatrixAction", PER.CASHIER!, [a]);
    const ok = !!G.PROD && np.o.kind !== "ok" && DENY_CODE.test(np.o.code) && cs.o.kind === "ok";
    chk("F9", ok, "ไม่มีคีย์ POS = ปฏิเสธ · แคชเชียร์ = ok", `STAFF_NOPERM → ${codeOf2(np.o)}${np.o.kind === "ok" ? ` (${short2(np.r?.cells?.length ?? "", 6)} ช่อง)` : ""} · CASHIER → ${codeOf2(cs.o)}${fxNote()}`);
  }

  // ── K3 คีย์กลาง × เครื่องมือ AI ของ POS ──
  {
    const route = await tryImport("@/app/api/v1/ai/tools/[name]/route");
    const post = async (raw: string, name: string) => {
      if (typeof route?.POST !== "function") return { status: 0, text: "ROUTE_MISSING" };
      try {
        const res: Response = await route.POST(new Request(`http://x/api/v1/ai/tools/${name}`, { method: "POST", headers: { authorization: `Bearer ${raw}`, "content-type": "application/json" }, body: JSON.stringify({ args: {} }) }), { params: Promise.resolve({ name }) });
        return { status: res.status, text: await res.text() };
      } catch (e) {
        return { status: -1, text: (e as Error).message.slice(0, 120) };
      }
    };
    const general = await akSvc.createApiKey({ tenantId: TA }, `QC P5.2 general ${RAND}`, {});
    keyIds.push(general.id);
    const read = await akSvc.createApiKey({ tenantId: TA }, `QC P5.2 pos-read ${RAND}`, { scopes: scopesMod.expandBundles(["pos-read"]), systemId: A_SYS() });
    keyIds.push(read.id);
    const g1 = await post(general.rawKey, "sales_summary");
    const g2 = await post(general.rawKey, "sales_by_day");
    // ตัวควบคุมบวก: คีย์กลางเดียวกัน × เครื่องมืออ่านนอก POS (list_systems) = 200 — route/คีย์ใช้ได้จริงใน harness · pos-read × sales_summary = ข้อมูลประกอบ (ไม่ตัดสิน: ทางที่คีย์ POS ใช้เครื่องมือ = งานของรอบแก้)
    const ctl = await post(general.rawKey, "list_systems");
    const r1 = await post(read.rawKey, "sales_summary");
    const sentA2 = aggSentinels(await netOfUnit(uA2));
    const lk = leaks(g1.text + g2.text, [...sentA2, SENT.recA2]);
    const ok = g1.status === 403 && g2.status === 403 && ctl.status === 200 && lk.length === 0;
    chk("K3", ok, "คีย์กลาง × POS 403 ×2 · คีย์กลาง × list_systems 200", `คีย์กลาง sales_summary ${g1.status} · sales_by_day ${g2.status}${lk.length ? ` · ยอด A2 ในผล ${lk.length}` : ""} · บวก list_systems ${ctl.status}${ctl.status !== 200 ? ` ${ctl.text.slice(0, 60)}` : ""} · (ข้อมูล) pos-read sales_summary ${r1.status}`);
  }

  // ── D1–D3 ตัวตนเครื่อง (§10.4 D1c) ──
  const pair: Record<string, { name: string; value: string } | null> = {};
  let pairRefusedKey = false;
  {
    const p: string[] = [];
    const f = "src/lib/modules/pos/device-actions.ts";
    const cash = await callAct(f, "registerDeviceAction", PER.CASHIER!, [{ systemId: A_SYS(), unitId: uA1, name: `P52 แคชเชียร์ ${RAND}`, deviceCode: `P52A1CASH${RAND}` }]);
    if (cash.o.kind === "ok" || cash.set.length) p.push(`แคชเชียร์จับคู่ได้ (${codeOf2(cash.o)} · คุกกี้ ${cash.set.length})`);
    const out: string[] = [];
    // ORACLE-EDIT (CD-P52-O4 F3): ทุกครั้งที่ออกคุกกี้เครื่อง (รวมจับคู่ซ้ำเครื่อง ACTIVE) = audit pos.device.pair +1 (มี deviceId + ผู้จับคู่)
    const pairAudits = async () => Number(await P.auditLog.count({ where: { tenantId: TA, action: "pos.device.pair" } }).catch(() => -1));
    for (const code of [DEV.P2, DEV.P3]) {
      const au0 = await pairAudits();
      const r = await callAct(f, "registerDeviceAction", PER.OWNER!, [{ systemId: A_SYS(), unitId: uA1, name: `P52 จับคู่ ${(code === DEV.P2 ? "P2" : "P3")}`, deviceCode: code }]);
      const au1 = await pairAudits();
      if (r.o.kind === "ok" && au1 - au0 !== 1) p.push(`audit pos.device.pair ${(code === DEV.P2 ? "P2" : "P3")} Δ${au1 - au0} (ต้อง +1)`);
      const ck = r.set.find((c) => !/shark_session|shark_tenant/.test(c.name)) ?? null;
      const row = await P.posDevice.findFirst({ where: { tenantId: TA, unitId: uA1, deviceCode: code }, select: { id: true } });
      if (r.o.kind === "ok") {
        const signed = !!ck && ck.value !== code && ck.value.length >= code.length + 16;
        if (!signed) p.push(`OWNER จับคู่ ${(code === DEV.P2 ? "P2" : "P3")} ok แต่ ${ck ? `คุกกี้ ${ck.name} ไม่ลงนาม (ยาว ${ck.value.length})` : "ไม่มีคุกกี้เครื่อง"}`);
        pair[code] = signed ? ck : null;
        out.push(`${(code === DEV.P2 ? "P2" : "P3")} ok คุกกี้ ${ck ? `${ck.name}(${ck.value.length})` : "-"}`);
      } else {
        const keyUnset = !/PERMISSION|NOT_FOUND|VALIDATION|UNKNOWN|INTERNAL|DEVICE_LIMIT|DEVICE_REVOKED/.test(r.o.code) && !row; // DEVICE_LIMIT = fixture (ORACLE-EDIT รอบ 1)
        if (!keyUnset) p.push(`OWNER จับคู่ ${(code === DEV.P2 ? "P2" : "P3")} → ${codeOf2(r.o)} (แถว ${row ? "มี" : "ไม่มี"})`);
        pairRefusedKey ||= keyUnset;
        pair[code] = null;
        out.push(`${(code === DEV.P2 ? "P2" : "P3")} ปฏิเสธ ${r.o.code}`);
      }
    }
    // ORACLE-EDIT (CD-P52-O4 F3): จับคู่ซ้ำเครื่อง ACTIVE (P2) = คุกกี้ใหม่ + audit +1 · แถวเครื่องไม่เพิ่ม
    {
      const rows0 = Number(await P.posDevice.count({ where: { tenantId: TA, unitId: uA1 } }));
      const au0 = await pairAudits();
      const r = await callAct(f, "registerDeviceAction", PER.OWNER!, [{ systemId: A_SYS(), unitId: uA1, name: "P52 จับคู่ P2 ซ้ำ", deviceCode: DEV.P2 }]);
      const au1 = await pairAudits();
      const rows1 = Number(await P.posDevice.count({ where: { tenantId: TA, unitId: uA1 } }));
      const ck = r.set.find((c) => !/shark_session|shark_tenant/.test(c.name));
      if (r.o.kind !== "ok" || !ck) p.push(`จับคู่ซ้ำ P2 → ${codeOf2(r.o)} คุกกี้ ${ck ? "มี" : "ไม่มี"}`);
      if (au1 - au0 !== 1) p.push(`audit จับคู่ซ้ำ Δ${au1 - au0} (ต้อง +1)`);
      if (rows1 !== rows0) p.push(`จับคู่ซ้ำเพิ่มแถวเครื่อง ${rows0}→${rows1}`);
      out.push(`ซ้ำ P2 ${r.o.kind === "ok" ? "ok" : r.o.code} audit Δ${au1 - au0}`);
    }
    // ORACLE-EDIT (CD-P52-O4 F6): ข้อย่อยกุญแจไม่ตั้ง — ล้าง POS_DEVICE_KEY ในโปรเซสชั่วคราว ⇒ ปฏิเสธ (ไม่ใช่สิทธิ์/ไม่พบ/ตรวจข้อมูล) · ไม่มีแถว · ไม่มีคุกกี้ · คืนค่าใน finally
    {
      const saved = process.env.POS_DEVICE_KEY;
      try {
        delete process.env.POS_DEVICE_KEY;
        const r = await callAct(f, "registerDeviceAction", PER.OWNER!, [{ systemId: A_SYS(), unitId: uA1, name: "P52 กุญแจไม่ตั้ง", deviceCode: DEV.PU }]);
        const row = await P.posDevice.findFirst({ where: { tenantId: TA, unitId: uA1, deviceCode: DEV.PU }, select: { id: true } });
        const ck = r.set.find((c) => !/shark_session|shark_tenant/.test(c.name));
        const refusedKey = r.o.kind !== "ok" && !/PERMISSION|NOT_FOUND|VALIDATION|UNKNOWN|INTERNAL|DEVICE_LIMIT|DEVICE_REVOKED/.test(r.o.code) && !row && !ck;
        if (!refusedKey) p.push(`กุญแจไม่ตั้ง → ${codeOf2(r.o)} (แถว ${row ? "มี" : "ไม่มี"} · คุกกี้ ${ck ? "มี" : "ไม่มี"})`);
        out.push(`ไม่ตั้งกุญแจ → ${r.o.code}`);
      } finally {
        if (saved !== undefined) process.env.POS_DEVICE_KEY = saved;
      }
    }
    const files = ["src/lib/modules/pos/device.ts", "src/lib/modules/pos/device-actions.ts", "src/lib/modules/pos/device-id.ts", "src/lib/modules/pos/shift.ts", "src/lib/modules/pos/shift-actions.ts", ...readdirSync(join(ROOT, "src/lib/modules/pos")).filter((n) => /device/i.test(n) && /\.ts$/.test(n)).map((n) => `src/lib/modules/pos/${n}`)];
    const credKey = [...new Set(files)].filter((x) => /CHAT_CREDENTIALS_KEY|POS_CREDENTIALS_KEY/.test(stripComments(rd(x))));
    if (credKey.length) p.push(`ใช้กุญแจ creds: ${credKey.join(", ")}`);
    chk("D1", p.length === 0, "แคชเชียร์ปฏิเสธ · OWNER ได้คุกกี้ลงนาม (หรือปฏิเสธเพราะไม่ตั้งกุญแจ) · ไม่ใช้กุญแจ creds", `${p.join(" · ") || "ครบ"} · แคชเชียร์ ${codeOf2(cash.o)} · OWNER: ${out.join(" · ")}`);
  }
  {
    const p: string[] = [];
    const f = "src/lib/modules/pos/shift-actions.ts";
    const open = (cookie: string | undefined, dev: string) => callAct(f, "openShiftAction", PER.OPERATOR!, [{ systemId: A_SYS(), unitId: uA1, deviceId: dev, shift: { deviceId: dev, floatSatang: 0 } }], { cookie });
    const forged = await open(undefined, DEV.Y);
    if (!judgeNotBound(forged.r, DEV.Y)) p.push(`อ้างเครื่อง Y จาก client → เปิดกะได้ (${String(forged.r?.shift?.id ?? "").slice(-6)})`);
    const ck = pair[DEV.P2];
    let pos = pairRefusedKey ? "ข้าม (กุญแจไม่ตั้ง)" : "ไม่มีคุกกี้";
    if (ck) {
      const bad = `${ck.value.slice(0, -1)}${ck.value.endsWith("A") ? "B" : "A"}`;
      const tam = await open(`${ck.name}=${bad}`, DEV.P2);
      if (!judgeNotBound(tam.r, DEV.P2)) p.push("คุกกี้ที่ถูกแก้ → เปิดกะได้");
      const good = await open(`${ck.name}=${ck.value}`, DEV.P2);
      pos = good.r?.ok === true ? `ok ${String(good.r?.shift?.deviceId ?? "") === DEV.P2 ? "ผูก P2" : "ผูกผิด"}` : codeOf2(good.o);
      if (!(good.r?.ok === true && String(good.r?.shift?.deviceId ?? "") === DEV.P2)) p.push(`บวก (คุกกี้จริง) → ${pos}`);
    } else if (!pairRefusedKey) p.push("ไม่มีคุกกี้จาก D1 — ตัวควบคุมบวกไม่ได้รัน");
    chk("D2", p.length === 0, "อ้างจาก client/คุกกี้ปลอม = ไม่ผูก · คุกกี้จริง = เปิดได้", `${p.join(" · ") || "ครบ"} · อ้าง Y → ${forged.r?.ok === true ? `ok (เครื่อง ${String(forged.r?.shift?.deviceId ?? "").slice(-6)})` : codeOf2(forged.o)} · บวก ${pos}`);
  }
  {
    const p: string[] = [];
    const f = "src/lib/modules/pos/shift-actions.ts";
    const xr = (cookie: string | undefined, dev: string, shiftId: string) => callAct(f, "xReportAction", PER.OPERATOR!, [{ systemId: A_SYS(), unitId: uA1, deviceId: dev, shiftId }], { cookie });
    const forged = await xr(undefined, DEV.Z, G.SHIFT_Z ?? "none");
    if (!G.SHIFT_Z) p.push("fixture กะ Z ไม่มี");
    if (forged.r?.ok === true) p.push("อ้างเครื่องของกะ Z จาก client → อ่าน X ได้");
    const ck = pair[DEV.P3];
    let pos = pairRefusedKey ? "ข้าม (กุญแจไม่ตั้ง)" : "ไม่มีคุกกี้";
    if (ck) {
      const sh = await svc(shiftMod, "openShift", ctxU2(uA1, DEV.P3), actorOf2("OWNER"), { deviceId: DEV.P3, floatSatang: 0 });
      const good = await xr(`${ck.name}=${ck.value}`, DEV.P3, idOf(sh));
      pos = good.r?.ok === true ? "ok" : codeOf2(good.o);
      if (good.r?.ok !== true) p.push(`บวก (คุกกี้เครื่องของกะ) → ${pos}`);
    } else if (!pairRefusedKey) p.push("ไม่มีคุกกี้จาก D1 — ตัวควบคุมบวกไม่ได้รัน");
    chk("D3", p.length === 0, "อ้างจาก client = PERMISSION_DENIED · คุกกี้จริง = ok", `${p.join(" · ") || "ครบ"} · อ้าง Z → ${forged.r?.ok === true ? "ok" : codeOf2(forged.o)} · บวก ${pos}${fxNote()}`);
  }

  // ── ORACLE-EDIT (CD-P52-O4 F1) D4 ทางขายผูกเครื่องจากคุกกี้ ──
  {
    const p: string[] = [];
    const out: string[] = [];
    const RA = "src/lib/modules/pos/register-actions.ts";
    const SA = "src/lib/modules/pos/shift-actions.ts";
    const T = { systemId: A_SYS(), unitId: uA1 };
    const plain = (key: string, extra: Record<string, unknown> = {}) => ({ lines: [{ name: `P52 D4 ${RAND}`, qty: 1, unitPriceSatang: 10000 }], idempotencyKey: key, expectedGrandTotalSatang: 10000, payMethods: [{ type: "CASH", amountSatang: 10000 }], cashReceivedSatang: 10000, ...extra });
    const withPin = (key: string) => ({ lines: [{ name: `P52 D4 PIN ${RAND}`, qty: 1, unitPriceSatang: 20000 }], billDiscount: { type: "PERCENT", value: 1500 }, idempotencyKey: key, expectedGrandTotalSatang: 17000, payMethods: [{ type: "CASH", amountSatang: 17000 }], cashReceivedSatang: 17000, managerPin: PINS.MANAGER, managerUserId: PER.MANAGER!.userId });
    const sell = (sale: Record<string, unknown>, cookie?: string) => callAct(RA, "submitRegisterSaleAction", PER.SELLER!, [{ ...T, deviceId: DEV.Z, sale }], { cookie });
    const shiftOf = async (r: { r: Any }): Promise<string | null> => {
      const id = r.r?.saleId ?? r.r?.sale?.id ?? null;
      if (typeof id !== "string") return null;
      return ((await P.posSale.findFirst({ where: { id, tenantId: TA }, select: { shiftId: true } }))?.shiftId as string | null) ?? null;
    };
    const onZ = async () => Number(await P.posSale.count({ where: { tenantId: TA, shiftId: G.SHIFT_Z ?? "none" } }));
    if (!G.SHIFT_Z) p.push("fixture กะ Z ไม่มี");
    await svc(staffPinMod, "setStaffPin", ctxU2(uA1), actorOf2("OWNER"), { userId: PER.SELLER!.userId, pin: "836104" });
    const tokOf = async (dev: string): Promise<string> => {
      try {
        return (await staffPinMod.issueStaffToken({ tenantId: TA, unitId: uA1, deviceId: dev }, { unitId: uA1, deviceId: dev, userId: PER.SELLER!.userId })).staffToken as string;
      } catch {
        return "";
      }
    };
    const tokZ = await tokOf(DEV.Z);
    // (ก) ไม่มีคุกกี้ + อ้าง Z: ขาย · staffToken ของ Z · PIN ผู้จัดการ · สถานะหน้าขาย — ต้องไม่ผูกกะ Z
    const z0 = await onZ();
    const a1 = await sell(plain(`p52-${RAND}-d4a1`));
    const a2 = await sell(plain(`p52-${RAND}-d4a2`, tokZ ? { staffToken: tokZ } : {}));
    const a3 = await sell(withPin(`p52-${RAND}-d4a3`));
    const z1 = await onZ();
    for (const [n, r] of [["ขาย", a1], ["staffToken Z", a2], ["PIN ผู้จัดการ", a3]] as const) {
      const sh = r.r?.ok === true ? await shiftOf(r) : null;
      if (r.r?.ok === true && (sh === G.SHIFT_Z || sh === null)) p.push(`ไม่มีคุกกี้ + อ้าง Z: ${n} → ok ผูก${sh === G.SHIFT_Z ? "กะ Z" : "ไม่มีกะ"}`);
      out.push(`${n} ${r.r?.ok === true ? "ok" : codeOf2(r.o)}`);
    }
    if (!tokZ) p.push("fixture staffToken Z ไม่ได้");
    if (z1 !== z0) p.push(`บิลบนกะ Z ${z0}→${z1}`);
    const st = await callAct(RA, "registerStatusAction", PER.SELLER!, [{ ...T, deviceId: DEV.Z }]);
    if (G.SHIFT_Z && JSON.stringify(st.r ?? null).includes(G.SHIFT_Z)) p.push("สถานะหน้าขาย (ไม่มีคุกกี้ · อ้าง Z) คืนกะ Z");
    out.push(`สถานะ ${st.r?.ok === true ? "ok" : codeOf2(st.o)}`);
    // (ข) ตัวควบคุมบวก: คุกกี้เครื่อง P4 (เปิดกะไว้) + อ้าง Z ใน payload ⇒ บิลผูกกะของ P4 · staffToken ของ P4 ผ่าน · staffToken ของ Z = STAFF_TOKEN_INVALID · PIN ผูก P4
    const c4 = await pairCookie(uA1, DEV.P4, `P52 D4 P4 ${RAND}`);
    if (!c4) p.push("จับคู่ P4 ไม่ได้");
    const sh4 = idOf(await svc(shiftMod, "openShift", ctxU2(uA1, DEV.P4), actorOf2("OWNER"), { deviceId: DEV.P4, floatSatang: 0 }));
    if (!sh4) p.push("fixture กะ P4 ไม่ได้");
    if (c4 && sh4) {
      const b1 = await sell(plain(`p52-${RAND}-d4b1`), c4);
      const s1 = b1.r?.ok === true ? await shiftOf(b1) : null;
      if (!(b1.r?.ok === true && s1 === sh4)) p.push(`คุกกี้ P4 + อ้าง Z → ${b1.r?.ok === true ? `ok ผูก ${s1 === G.SHIFT_Z ? "กะ Z" : String(s1).slice(-6)}` : codeOf2(b1.o)}`);
      const tok4 = await tokOf(DEV.P4);
      const b2 = await sell(plain(`p52-${RAND}-d4b2`, { staffToken: tok4 }), c4);
      const s2 = b2.r?.ok === true ? await shiftOf(b2) : null;
      if (!(b2.r?.ok === true && s2 === sh4)) p.push(`คุกกี้ P4 + staffToken P4 → ${b2.r?.ok === true ? `ok ผูก ${String(s2).slice(-6)}` : codeOf2(b2.o)}`);
      const b3 = await sell(plain(`p52-${RAND}-d4b3`, { staffToken: tokZ }), c4);
      if (b3.r?.ok === true || String(b3.r?.code) !== "STAFF_TOKEN_INVALID") p.push(`คุกกี้ P4 + staffToken Z → ${b3.r?.ok === true ? "ok" : codeOf2(b3.o)} (ต้อง STAFF_TOKEN_INVALID)`);
      const b4 = await sell(withPin(`p52-${RAND}-d4b4`), c4);
      const s4 = b4.r?.ok === true ? await shiftOf(b4) : null;
      if (!(b4.r?.ok === true && s4 === sh4)) p.push(`คุกกี้ P4 + PIN ผู้จัดการ → ${b4.r?.ok === true ? `ok ผูก ${String(s4).slice(-6)}` : codeOf2(b4.o)}`);
      out.push(`P4: ขาย ${b1.r?.ok === true ? (s1 === sh4 ? "ผูก P4" : "ผูกผิด") : b1.r?.code} · token P4 ${b2.r?.ok === true ? "ok" : b2.r?.code} · token Z ${b3.r?.ok === true ? "ok" : b3.r?.code} · PIN ${b4.r?.ok === true ? "ok" : b4.r?.code}`);
    }
    // (ค) เครื่องเพิกถอน: คุกกี้ของ P5 หลังเพิกถอน ⇒ ขาย/เงินเข้า-ออก = DEVICE_REVOKED · เงินเข้า/ออกไม่ส่ง deviceId + ไม่มีคุกกี้ = DEVICE_NOT_PAIRED (ข้ามการตรวจเพิกถอนไม่ได้)
    const c5 = await pairCookie(uA1, DEV.P5, `P52 D4 P5 ${RAND}`);
    const sh5 = c5 ? idOf(await svc(shiftMod, "openShift", ctxU2(uA1, DEV.P5), actorOf2("OPERATOR"), { deviceId: DEV.P5, floatSatang: 0 })) : null;
    const row5 = await P.posDevice.findFirst({ where: { tenantId: TA, unitId: uA1, deviceCode: DEV.P5 }, select: { id: true } });
    if (!c5 || !row5 || !sh5) p.push(`fixture P5 (คุกกี้ ${c5 ? "มี" : "ไม่มี"} · แถว ${row5 ? "มี" : "ไม่มี"} · กะ ${sh5 ? "มี" : "ไม่มี"})`);
    else {
      await svc(deviceMod, "revokeDevice", ctxU2(uA1), actorOf2("OWNER"), { id: row5.id });
      const mv = (cookie: string | undefined, withDev: boolean) => callAct(SA, "recordCashMovementAction", PER.OPERATOR!, [{ ...T, ...(withDev ? { deviceId: DEV.P5 } : {}), movement: { shiftId: sh5, kind: "IN", amountSatang: 100, reason: "P52 D4", idempotencyKey: `p52-${RAND}-d4mv${withDev ? 1 : 0}${cookie ? "c" : ""}` } }], { cookie });
      const r1 = await sell(plain(`p52-${RAND}-d4c1`), c5);
      const r2 = await mv(c5, true);
      const r3 = await mv(undefined, false);
      if (String(r1.r?.code) !== "DEVICE_REVOKED") p.push(`ขายด้วยคุกกี้เครื่องเพิกถอน → ${r1.r?.ok === true ? "ok" : codeOf2(r1.o)}`);
      if (String(r2.r?.code) !== "DEVICE_REVOKED") p.push(`เงินเข้า/ออกด้วยคุกกี้เครื่องเพิกถอน → ${r2.r?.ok === true ? "ok" : codeOf2(r2.o)}`);
      if (String(r3.r?.code) !== "DEVICE_NOT_PAIRED") p.push(`เงินเข้า/ออก ไม่ส่ง deviceId + ไม่มีคุกกี้ → ${r3.r?.ok === true ? "ok" : codeOf2(r3.o)} (ต้อง DEVICE_NOT_PAIRED)`);
      out.push(`เพิกถอน: ขาย ${r1.r?.ok === true ? "ok" : r1.r?.code} · เงิน ${r2.r?.ok === true ? "ok" : r2.r?.code} · เงินไม่มีเครื่อง ${r3.r?.ok === true ? "ok" : r3.r?.code}`);
    }
    chk("D4", p.length === 0, "ไม่มีคุกกี้ + อ้าง Z = ไม่ผูกกะ Z ทุกทาง · คุกกี้ P4 = ผูก P4 (token/PIN) · เพิกถอน = DEVICE_REVOKED · ไม่มีเครื่อง = DEVICE_NOT_PAIRED", `${p.join(" · ") || "ครบ"} · ไม่มีคุกกี้: ${out.join(" · ")}${fxNote()}`);
  }

  // ── D11 ตัวเขียนเดิมบนสาขาที่ผูก POS ──
  {
    const RT = /^(Restaurant|Menu|Kds|Kitchen|PosProduct|PosCategory|PosOption|TableSession)/;
    const fpR = async (u: string) => Object.fromEntries(Object.entries(await fpRows(TA, u)).filter(([k]) => RT.test(k)));
    const formOf = (extra: Record<string, string>) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(extra)) fd.set(k, v);
      return fd;
    };
    const plan = (t2: string): [string, Record<string, string> | null][] => [
      ["updateSettingAction", { serviceChargePct: "7" }],
      ["kitchenPauseAction", { paused: "true", note: "P52" }],
      ["createStationAction", { name: `P52 D11 สถานี ${t2} ${RAND}` }],
      ["createCategoryAction", { name: `P52 D11 หมวด ${t2} ${RAND}` }],
      ["archiveCategoryAction", { id: G[`CAT_${t2}`] ?? "" }],
      ["createOptionGroupAction", { name: `P52 D11 ตัวเลือก ${t2} ${RAND}`, choices: "พิเศษ|10" }],
      ["archiveOptionGroupAction", { id: G[`OG_${t2}`] ?? "" }],
      ["setChoiceStockAction", { id: G[`CHOICE_${t2}`] ?? "", out: "true" }],
      ["setItemStockAction", { id: G[`ITEM_${t2}`] ?? "", isOutOfStock: "true" }],
      ["archiveItemAction", { id: G[`ITEM_${t2}`] ?? "" }],
      ["resetDailyStockAction", null],
      ["createZoneAction", { name: `P52 D11 โซน ${t2} ${RAND}` }],
      ["archiveZoneAction", { id: G[`ZONE2_${t2}`] ?? "" }],
      ["createTableAction", { zoneId: G[`ZONE_${t2}`] ?? "", name: `P52 D11 โต๊ะ ${t2} ${RAND}` }],
      ["archiveTableAction", { id: G[`TABLE_${t2}`] ?? "" }],
    ];
    const f = "src/lib/actions/restaurant.ts";
    const before = await fpR(uA1);
    const notLinked: string[] = [];
    for (const [n, form] of plan("A1")) {
      const r = await callAct(f, n, PER.OWNER!, form ? [SLUG_OF[uA1], formOf(form)] : [SLUG_OF[uA1]]);
      if (!judgeLinked(r.o)) notLinked.push(`${n.replace(/Action$/, "")}=${r.o.kind === "redirect" ? r.o.text.replace(/^NEXT_REDIRECT;\w+;/, "").slice(0, 40) : r.o.code}`);
    }
    const diff = fpDiff(before, await fpR(uA1));
    // ตัวควบคุมบวก (A3 ไม่ผูก POS): ทุกตัวเขียนได้จริง (แถวเปลี่ยน) — ทำย้อนลำดับไม่ได้ (archive ก่อน create ไม่มีผล) จึงนับรายตัว
    const posDone: string[] = [];
    const posNone: string[] = [];
    if (G.A3) {
      for (const [n, form] of plan("A3")) {
        const b = await fpR(G.A3);
        const r = await callAct(f, n, PER.OWNER!, form ? [SLUG_OF[G.A3], formOf(form)] : [SLUG_OF[G.A3]]);
        const d = fpDiff(b, await fpR(G.A3));
        (d.length && r.o.kind !== "throw" ? posDone : posNone).push(`${n.replace(/Action$/, "")}${d.length ? "" : `(${codeOf2(r.o)})`}`);
      }
    }
    const ok = notLinked.length === 0 && diff.length === 0 && posDone.length >= 12;
    chk("D11", ok, "15/15 POS_LINKED · A1 ไม่เปลี่ยน · A3 เขียนได้ ≥ 12/15", `ไม่ POS_LINKED ${notLinked.length}/15${notLinked.length ? `: ${notLinked.slice(0, 8).join(" · ")}` : ""} · แถว A1 เปลี่ยน ${diff.length ? diff.slice(0, 5).join(", ") : "0"} · บวก A3 เขียนได้ ${posDone.length}/15${posNone.length ? ` (ไม่เปลี่ยน: ${posNone.join(", ")})` : ""}${fxNote()}`);
  }

  // ── F8 ประตูเดิม QR โต๊ะ ──
  {
    const page = await tryImport("@/app/(store)/s/[tenantSlug]/[unitSlug]/restaurant/t/[qrToken]/page");
    const call = async (qrToken: string): Promise<Outcome> => {
      if (typeof page?.default !== "function") return { kind: "missing", code: "MISSING", text: "" };
      try {
        const r = await inScope("", `/s/${SLUG_A}/${SLUG_OF[uA1]}/restaurant/t/${qrToken}`, async () => page.default({ params: Promise.resolve({ tenantSlug: SLUG_A, unitSlug: SLUG_OF[uA1], qrToken }) }));
        return { kind: "ok", code: "RENDER", text: short2(r, 80) };
      } catch (e) {
        return outcomeOfErr(e);
      }
    };
    const real = String((await P.restaurantTable.findFirst({ where: { tenantId: TA, unitId: uA1, id: G.TABLE_A1 ?? "none" }, select: { qrToken: true } }))?.qrToken ?? "");
    const unknown = `qr_${randomBytes(16).toString("base64url")}`;
    const sess0 = Number(await P.tableSession.count({ where: { tenantId: TA, unitId: uA1 } }).catch(() => -1));
    // หน้าเดิมเปิดเฉพาะสาขาชนิด RESTAURANT (resolvePublicUnit) — สลับชนิด A1 ชั่วคราวในข้อนี้ แล้วคืน SHOP (ORACLE-EDIT รอบ 1)
    await P.businessUnit.update({ where: { id: uA1 }, data: { type: "RESTAURANT" } });
    let u: Outcome;
    let rr: Outcome;
    try {
      u = await call(unknown);
      rr = real ? await call(real) : ({ kind: "missing", code: "NO_TABLE", text: "" } as Outcome);
    } finally {
      await P.businessUnit.update({ where: { id: uA1 }, data: { type: "SHOP" } });
    }
    const sess1 = Number(await P.tableSession.count({ where: { tenantId: TA, unitId: uA1 } }).catch(() => -1));
    const to = (o: Outcome, t: string) => o.kind === "redirect" && o.text.includes(`/q/t/${encodeURIComponent(t)}`);
    const ok = to(u, unknown) && to(rr, real) && sess0 === sess1 && sess0 >= 0;
    chk("F8", ok, "ไม่มี → redirect /q/t · จริง → redirect · ไม่มี session ใหม่", `โทเคนไม่มี → ${u.kind === "redirect" ? u.text.replace(/^NEXT_REDIRECT;\w+;/, "").slice(0, 50) : `${codeOf2(u)} ${u.text.slice(0, 50)}`} · จริง → ${rr.kind === "redirect" ? "redirect /q/t" : codeOf2(rr)} · TableSession A1 ${sess0}→${sess1}${fxNote()}`);
  }

  // ── คลัง (F4 รอเจ้าของ · F10b) ──
  const invSvc = await tryImport("@/lib/modules/inventory/service");
  const aiIns = await tryImport("@/lib/modules/pos/ai-insights");
  const invOk = await step2("คลัง ผูก A1+A2", async () => {
    G.INV = (await sysSvc.createSystem(TA, "INVENTORY", `คลัง P52 ${RAND}`)).id;
    await sysSvc.linkUnit(TA, G.INV, uA1);
    await sysSvc.linkUnit(TA, G.INV, uA2);
    const ic = { tenantId: TA, systemId: G.INV, actorUserId: PER.OWNER!.userId };
    G.INV_SHARED = (await invSvc.createItem(ic, { sku: `P52-S-${RAND}`, name: SENT2.invShared, unitLabel: "ชิ้น", costSatang: 1000 })).id;
    G.INV_A2 = (await invSvc.createItem(ic, { sku: `P52-A2-${RAND}`, name: SENT2.invA2, unitLabel: "ชิ้น", costSatang: 1000 })).id;
    await P.invItem.update({ where: { id: G.INV_A2 }, data: { reorderPoint: 5 } });
    const n = await P.posProduct.updateMany({ where: { tenantId: TA, systemId: A_SYS(), invItemId: G.INV_A2 }, data: { unitId: uA2 } });
    if (!n.count) throw new Error("ไม่มีแถว PosProduct ของสินค้าคลัง A2");
    G.PROD_INV_SHARED = String((await P.posProduct.findFirst({ where: { tenantId: TA, systemId: A_SYS(), invItemId: G.INV_SHARED }, select: { id: true } }))?.id ?? "");
    if (!G.PROD_INV_SHARED) throw new Error("ไม่มีแถว PosProduct ของสินค้าคลังร่วม");
  });
  {
    const p: string[] = [];
    const prodRow = async () => JSON.stringify(await P.posProduct.findUnique({ where: { id: G.PROD_INV_SHARED ?? "none" }, select: { name: true, archivedAt: true, basePriceSatang: true } }));
    const b = invOk ? await prodRow() : "";
    const fd = new FormData();
    for (const [k, v] of Object.entries({ systemId: G.INV ?? "", itemId: G.INV_SHARED ?? "", name: `P52 แก้โดย A1 ${RAND}`, sku: `P52-S-${RAND}`, unitLabel: "ชิ้น" })) fd.set(k, v);
    const r = invOk ? await callAct("src/lib/modules/inventory/actions.ts", "updateItemAction", PER.MANAGER!, [fd]) : null;
    const a = invOk ? await prodRow() : "";
    if (!invOk) p.push("fixture คลังล้ม");
    else if (b !== a) p.push(`แถว PosProduct ร่วมเปลี่ยน (${short2(a, 60)})`);
    chk("F4", p.length === 0, "แถวร่วมไม่เปลี่ยน", `${p.join(" · ") || "ครบ"} · MANAGER[A1] updateItemAction → ${r ? codeOf2(r.o) : "-"}`);
  }
  {
    const p: string[] = [];
    const ctx = { tenantId: TA, systemId: A_SYS() };
    const risksM = invOk ? await svc(aiIns, "posStockRisks", ctx, actorOf2("MANAGER")) : null;
    const sugM = invOk ? await svc(aiIns, "purchaseSuggestions", ctx, actorOf2("MANAGER")) : null;
    const risksO = invOk ? await svc(aiIns, "posStockRisks", ctx, actorOf2("OWNER")) : null;
    const tM = short2(risksM, 4000) + short2(sugM, 4000);
    if (!invOk) p.push("fixture คลังล้ม");
    if (leaks(tM, [SENT2.invA2]).length) p.push("MANAGER[A1] เห็นสินค้าเฉพาะ A2");
    if (!leaks(short2(risksO, 4000), [SENT2.invA2]).length) p.push(`ตัวควบคุมบวก OWNER ไม่เห็น (${short2(risksO, 60)})`);
    chk("F10b", p.length === 0, "MANAGER[A1] ไม่เห็นสินค้าเฉพาะ A2 · OWNER เห็น", `${p.join(" · ") || "ครบ"} · ใกล้หมด MANAGER ${Array.isArray(risksM) ? risksM.length : short2(risksM, 30)} รายการ · ข้อเสนอ ${sugM?.ok === true ? (sugM.suggestions?.length ?? 0) : short2(sugM?.code, 20)}`);
  }

  // ── F11 (รอเจ้าของ W38) ──
  {
    const r = await callAct("src/lib/modules/pos/settings-actions.ts", "updatePosStaffCommissionAction", PER.PAYROLL!, [{ systemId: A_SYS(), patch: { enabled: true } }]);
    chk("F11", r.o.kind !== "ok", "ปฏิเสธ (คีย์อ่าน hr.payroll.read เขียนเงินไม่ได้)", `PAYROLL → ${codeOf2(r.o)} ${short2(r.r?.message ?? "", 50)}`);
  }
}

// ═════════════════════════ 7. ลบร้านชั่วคราว ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; err: string };
async function wipeTenant(tid: string, slug: string): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, err: "" };
  if (!tid) return rep;
  const t = (await P.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, tid)) as Any[];
  if (t.length && t[0].slug !== slug) {
    rep.err = `slug ไม่ตรง (${t[0].slug}) — ไม่ลบ`;
    return rep;
  }
  const tables = TT.length ? TT : await tenantTables();
  rep.tables = tables.length;
  await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
  await P.$executeRawUnsafe(`UPDATE "Customer" SET "mergedIntoId" = NULL, "referredById" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
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
  const uids = ((await P.$queryRawUnsafe(`SELECT id FROM "User" WHERE email LIKE $1`, `${slug}-%@qc.invalid`)) as Any[]).map((r: Any) => String(r.id));
  for (const uid of uids) {
    await P.session.deleteMany({ where: { userId: uid } }).catch(() => {});
    await P.appNotification?.deleteMany({ where: { recipientUserId: uid } }).catch(() => {});
    await P.membership.deleteMany({ where: { userId: uid } }).catch(() => {});
  }
  await P.$executeRawUnsafe(`DELETE FROM "User" WHERE email LIKE $1`, `${slug}-%@qc.invalid`).catch(() => {});
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

// ═════════════════════════ 8. รัน ═════════════════════════
let crashed = "";
const wipes: WipeReport[] = [];
let bucketsLeft = -1;
let usersLeft = -1;
const qcBefore = await fpQc(QC_TIDS);
try {
  runStatic();
  await runDb();
  await runDb2(); // ORACLE-EDIT (P5.2 oracle2)
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 4).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  try {
    await sleep(500);
    for (const [tid, slug] of [[TA, SLUG_A], [TB, SLUG_B]] as const) {
      const w = await wipeTenant(tid, slug);
      wipes.push(w);
      console.log(`  ลบร้านชั่วคราว ${slug}: ${w.tables} ตาราง · ค้าง ${JSON.stringify(w.left)} · Tenant ${w.tenantLeft}${w.err ? ` · ${w.err}` : ""}`);
    }
    for (const kid of keyIds) await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `%:api:%:${kid}`).catch(() => 0);
    await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `pos:pub:%:qc-p52-${RAND}-%`).catch(() => 0); // P9 (fix2)
    bucketsLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE $1`, `pos:pub:%:qc-p52-${RAND}-%`).catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? -1); // P9 (fix2)
    for (const kid of keyIds) bucketsLeft += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE $1`, `%:api:%:${kid}`).catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? -1);
    usersLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, `posqc-p52-${RAND}%`)) as Any[])[0]?.n ?? -1);
  } catch (e) {
    wipes.push({ tables: 0, left: {}, tenantLeft: 0, err: `cleanup: ${(e as Error).message.slice(0, 200)}` });
  } finally {
    removeFetchGuard();
  }
}
const tempLeft = wipes.flatMap((w) => Object.entries(w.left).map(([k, v]) => `${k}:${v}`));
const tenantLeft = wipes.reduce((a, w) => a + w.tenantLeft, 0);
const wipeErr = wipes.map((w) => w.err).filter(Boolean).join(" · ");
chk("Z1", tempLeft.length === 0 && tenantLeft === 0 && !wipeErr && bucketsLeft === 0 && usersLeft === 0, "0 แถว · Tenant/User ลบ · ถัง 0", [tempLeft.length ? `ค้าง ${tempLeft.join(", ")}` : `0 แถว (${wipes[0]?.tables ?? 0} ตาราง)`, tenantLeft ? "Tenant ค้าง" : "", wipeErr, `ถัง ${bucketsLeft}`, `User ${usersLeft}`].filter(Boolean).join(" · "));
const qcAfter = await fpQc(QC_TIDS);
const qcDrift = fpDiff(qcBefore, qcAfter);
chk("Z2", qcDrift.length === 0 && !Object.values(qcBefore).some((v) => v.startsWith("err")), "ลายนิ้วมือ coffee/resto เท่าเดิม", qcDrift.length ? `ต่าง ${qcDrift.join(", ")}` : `เท่าเดิม (${Object.entries(qcAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`);
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 100)})` : "ไม่ถึง");
// ORACLE-EDIT (P5.2 oracle2): ข้อรอเจ้าของ (F4 W37 · F11 W38) ไม่นับใน failed/exit — พิมพ์ใน pendingOwner
const { failed, pending: pendingOwner } = splitPending([...results.entries()]);
const gated = results.size - pendingOwner.length;
if (bgErrors) console.log(`  ⚠️  unhandledRejection ${bgErrors} ครั้ง (งานเบื้องหลังของ action ที่ยิงด้วยอาร์กิวเมนต์ปลอม)`);
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
console.log(`\n===== ${SUITE} ===== ผ่าน ${gated - failed.length}/${gated} · รอเจ้าของ ${pendingOwner.map((x) => `${x.id} ${x.ok ? "เขียว" : "แดง"}`).join(" · ") || "-"} · ตาราง ${ROWS.length} แถว · ฐาน ${PIN}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: gated, passed: gated - failed.length, failed, pendingOwner, skipped: false, forced: FORCE, pin: PIN, lanePin: LANE_PIN, matrixRows: ROWS.length, guardHits: guardHits.length, residue: tempLeft.length + tenantLeft, deviceKey: DEVICE_KEY_SOURCE })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);
