// QC — POS RUN ใบ P1.18 S: ตั้งค่า POS (ทั่วไป · เพดานส่วนลด · สต็อกสาขา · audit ทุกตัวเขียน · ประวัติ · คีย์สิทธิ์) ·
//   การ์ดเชื่อม 13 ระบบ + สวิตช์บัญชี · พนักงาน/นโยบายอนุมัติ · ภาษา (คุกกี้ + ภาษาใบเสร็จ) · i18n สถิต · ตัดวัน · พร้อมเพย์รายสาขา ·
//   ประตูหน้า /pos/sales + FU-c · งานปิด P1.15 (ด่านเดา PIN ต่อเครื่อง · PIN_TAKEN · แข่งพักบิลคีย์เดียว · ห้ามอนุมัติของตัวเองที่แกน)
//   เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ
//
// สัญญา: ledger/pos-briefs/pos-brief-P1.18.md §0 §2 R1–R16 §4 §5 CD1–CD8 · §9 มติผู้คุมงาน (ผูกพัน) · pos-brief-COMMON · pos-brief-LANE-RULES
//        ต่อยอด: qc-pos-p1.13 (ร้านชั่วคราว · finally · residue 0) · qc-pos-p1.15 (ผู้ใช้จริง · PIN · สายอนุมัติ) · qc-pos-p1.10/p1.7 (ตัวเขียนค่าตั้ง) ·
//        qc-pos-p1.9 (parseShiftSettings) · qc-pos-p1.17 (วันธุรกิจ)
//        โน้ต: ledger/wo-notes/pos-P1.18-oracle.md (ตารางชื่อ = สัญญาของผู้สร้าง S · ความคลาดเคลื่อน · CONTROLLER-DECISION · --list)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้และลงทะเบียนในตารางชื่อของโน้ต — ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P1.18 S ต้องส่ง (ย่อ — รายละเอียดในตารางชื่อ):
//   permissions.ts: "pos.settings.manage" + "pos.settings.payment" (มติ Q2: ลงทะเบียนทั้งคู่)
//   pos/settings-shared.ts (บริสุทธิ์): posReceiptLocale · posDayCutoffMinutes · settingsRefusalMessageKey · PosSettingsRefusalCode (+ SETTINGS_SECTION_LOCKED CONFIRM_REQUIRED)
//   pos/register-shared.ts: posHeldCartExpireDays(settings) (ดึงจาก held-cart expireOf) · PIN_THROTTLED + STAFF_PIN_DEVICE_THROTTLE_AFTER/_MS
//   pos/payment-intent-shared.ts: promptpayIdForUnit(settings, unitId) · payment-intent.ts อ่านสาขาก่อน โปรไฟล์ทีหลัง
//   pos/settings-general.ts: updatePosGeneralSettings · updatePosDiscountCaps · updatePosUnitStockPolicy · posSettingsHistory
//   pos/settings-overview.ts: posSettingsOverview · posStaffOverview · pos/payment-settings.ts: updatePosUnitPromptpay
//   pos/settings-actions.ts ("use server") · src/lib/pos-integrations.ts (composition root): posIntegrationCards · setPosAccountLink · POS_INTEGRATION_CODES
//   src/lib/pos-integrations-actions.ts ("use server") · account/index.ts: setPosLinkEnabled · approval/index.ts: listPoliciesForEntities
//   src/i18n/locale-cookies.ts: nextLocaleCookies · src/i18n/locale-actions.ts ("use server"): setUiLocaleAction
//   ReceiptPayload.printLocale (จาก settings.pos.receiptLocale) → print/browser.ts + print/escpos.ts · pos/access.ts: posSalesReadScope
//   audit "pos.settings.updated" ในตัวเขียนเดิม (ใบเสร็จ · ชำระเงิน · ใบขอรับเงิน) · messages: pos.nav.* · pos.settings.errors.{settingsSectionLocked,confirmRequired} · pos.register.errors.pinThrottled
//   approval/service.ts decide: ผู้ตัดสิน = ผู้ยื่น ⇒ ok:false (แกน) · staff-pin.ts: ด่านต่อเครื่อง + PIN ซ้ำแยกไม่ออก · register.ts: พักบิลคีย์เดียวไม่ซ้อน
//
// ขอบเขต: ST สถิต · B ตัวอ่าน/ไป-กลับ · G ตัวเขียนทั่วไป · C เพดาน · U สต็อกสาขา · P สิทธิ์/NOT_FOUND · I การ์ด 13 ระบบ · A สวิตช์บัญชี ·
//   H ประวัติ · S พนักงาน/อนุมัติ · L ภาษา · D ตัดวัน · PP พร้อมเพย์รายสาขา · V ประตูหน้า + FU-c · K งานปิด P1.15 · E ปฏิเสธเป็นข้อมูล · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ (แบบ qc-pos-p1.13/p1.15): SKIP เมื่อของ P1.18 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต ST* + ตัวอ่านบริสุทธิ์ B1–B3 L1 V1 (ไม่โหลด prisma · exit 1 ถ้าแดง)
//    ST7 = U-PHASE (ศูนย์อักษรไทยนอก t()): ใบ S ผ่านด้วยป้าย SKIP-until-U (พิมพ์ฐานต่อไฟล์) · เฟส U = env QC_P118_PHASE=U หรือแท็บทั้ง 5 live
//    ฐาน = QC4 เท่านั้น (host ep-frosty-lab ก่อนเขียนแถวแรก) · ร้านชั่วคราว `posqc-p118-<rand>` + ร้านอื่น T2 `posqc-p118b-<rand>` + ผู้ใช้ชั่วคราว
//    (ลบทั้งหมดใน finally · นับแถวค้างทุกตาราง = 0) · ร้าน seed ไม่ถูกเขียน (Z2 สแกนรอยของรอบนี้ + ลายนิ้วมือเป็นข้อมูล)
//    🔴 ไม่มีเครือข่าย: globalThis.fetch = ตัวกั้น (503 + นับ) ตลอดช่วง DB
//    🔴 outbox ปลอมของ I10 ตั้ง availableAt +1 วัน (ไม่มี drain ของ lane ไหนหยิบไปทำ) · ชนิด pos.qc.p118 (ไม่มี consumer)
//    โมดูล/ฟังก์ชันที่ยังไม่มีเข้าถึงแบบไดนามิก (`import(… as string)` + catch) — next build ตรวจชนิด scripts/*.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p1.18";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · P บริสุทธิ์ · X1 idempotency/เล่นซ้ำ · X2 ข้ามขอบเขต · X3 สิทธิ์ · X4 เงิน · X5 ผลข้างเคียงครบทุกทาง · "-" เชิงหน้าที่ · U เฟส U
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P1.18-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "S", "[R1 CD4 มติ Q2] permissions.ts บล็อก pos มี \"pos.settings.manage\" และ \"pos.settings.payment\" ป้ายไทย (มีป้าย // POS P1.18) · payment-settings-actions ยัง assert pos.settings.payment (ไม่ ORACLE-EDIT P1.7/P1.7U)"),
  D("ST2", "S", "[R7 hard rule F2] composition root src/lib/pos-integrations.ts export posIntegrationCards setPosAccountLink POS_INTEGRATION_CODES · ไฟล์ใต้ modules/pos ไม่ import chat/kanban/hr/ไฟล์ภายใน crm/crm-bridges/kanban-bridges/pos-integrations (static+dynamic · facade crm เดิมได้) · root import โมดูลอื่นผ่าน facade เท่านั้น (ยกเว้น pos/system)"),
  D("ST3", "S", "[R8 R10 มติ Q4] facade เพิ่มอย่างเดียว: account/index.ts export setPosLinkEnabled (ห่อ connect/disconnect) · approval/index.ts export listPoliciesForEntities · ทั้งคู่ในบล็อก // POS P1.18 ▸ … ◂"),
  D("ST4", "S", "[hard rule R12] ทุกไฟล์ \"use server\" (modules/pos · pos-integrations-actions · i18n/locale-actions) export async function ล้วน · settings-actions.ts 7 actions · pos-integrations-actions.ts 2 actions (requireTenant + catch + เรียกฟังก์ชันของตัวเอง) · setUiLocaleAction เรียก nextLocaleCookies + cookies()"),
  D("ST5", "S", "[R13c มติ Q5] messages pos.nav.{overview register products stock sales shifts close reports settings} th+en (th = ป้ายเดิมตามลำดับ · en ไม่มีไทย) · pos/tabs.ts และบล็อก POS ของ app/layout.tsx ไม่มีอักษรไทย (ป้ายจาก messages)"),
  D("ST6", "S", "[R13a R16 K1] ทุกรหัสใน union *Code ของ modules/pos มีคีย์ errors.<camel> ใน pos.json th และ en · มีรหัสใหม่ SETTINGS_SECTION_LOCKED CONFIRM_REQUIRED (PosSettingsRefusalCode) PIN_THROTTLED (RegisterRefusalCode) · settingsRefusalMessageKey ครอบทุกรหัส · REFUSAL_KEY มี PIN_THROTTLED · คีย์ th เป็นไทย"),
  D("ST7", "U", "[R13b มติ Q8 · U-PHASE] ไม่มีอักษรไทยนอก t() ใต้ src/components/pos/** และ src/app/app/sys/[id]/pos/** (ทั้งต้นไม้ = 0) — ใบ S: SKIP-until-U (พิมพ์ฐานต่อไฟล์) · เฟส U: ต้องเป็น 0"),
  D("ST8", "S", "[R3 มติ Q9] ตัวอ่านเดียว: held-cart.ts ใช้ posHeldCartExpireDays (ไม่แกะ heldCart.expireDays เอง) · reports.ts ไม่มี DAY_CUTOFF_MINUTES = 0 คงที่ + ใช้ posDayCutoffMinutes · service.ts ปิดวันอ่านค่าตัดวัน · payment-intent.ts เรียก promptpayIdForUnit ก่อน paymentProfile"),
  D("ST9", "S", "[R12 มติ Q7] ReceiptPayload มี printLocale · receipt.ts ตั้ง printLocale · print/browser.ts + print/escpos.ts ใช้ printLocale ของ payload (ภาษาจอไม่ตัดสินภาษาพิมพ์) · i18n/locale-cookies.ts บริสุทธิ์ (ไม่ import next/headers / prisma)"),
  D("ST10", "S", "[R3 R6] settings-general.ts เขียนผ่าน jsonb_set ใต้ FOR UPDATE (ไม่ appSystem.update ทั้งก้อน) + writeAudit · receipt-settings.ts + payment-settings.ts เขียน audit \"pos.settings.updated\" (hunk เล็ก)"),
  D("ST11", "S", "[มติ Q9 V FU-c] pos/sales/page.tsx ใช้ posSalesReadScope (pos.sale.read หรือ pos.sale.create) · pos/settings/page.tsx ไม่คิด canEditReceipt จาก evaluate(pos.device.manage) ระดับร้านไม่มีสาขา (ใช้ canEdit.receipt / canManageAllLinkedUnits)"),
  // ── B ตัวอ่านบริสุทธิ์ (--no-db) ──
  D("B1", "P", "[R3] posHeldCartExpireDays(settings): ไม่ตั้ง → 2 · 1 / 365 เก็บ · 0 / 366 / 2.5 / \"3\" / null → 2 · อ่านจาก settings.pos.heldCart.expireDays เท่านั้น"),
  D("B2", "P", "[R3 R12 มติ Q7 Q9] posReceiptLocale: ไม่ตั้ง → th · \"en\" → en · \"EN\"/\"jp\"/1 → th · posDayCutoffMinutes: ไม่ตั้ง → 0 · 240 / 360 เก็บ · 361 / -1 / \"240\" / 2.5 → 0 (settings.pos.reports.dayCutoffMinutes)"),
  D("B3", "P", "[มติ Q9 PP] promptpayIdForUnit(settings, unitId): settings.pos.payment.promptpayIdByUnit[unitId] (ตัดช่องว่าง) · ไม่มีสาขานั้น / แผนที่ผิดรูป / ค่าว่าง / ไม่ใช่สตริง → null"),
  D("L1", "P", "[R12 CD5] nextLocaleCookies(\"en\") → {ok:true, cookies:[LOCALE=en, lang=en]} ทั้งคู่ path \"/\" · maxAge 31536000 · sameSite \"lax\" · \"th\" เช่นกัน · \"jp\" / \"\" / null / \"EN\" → {ok:false, code VALIDATION} ไม่ throw"),
  D("V1", "P", "[มติ Q9 sales gate] posSalesReadScope(m): พนักงานที่มีแค่ pos.sale.read ที่ U1 → {allUnits:false, unitIds:[U1]} · pos.sale.create เช่นกัน · ไม่มีทั้งสอง → null · OWNER → allUnits · posSalesScope เดิมไม่เปลี่ยน (read อย่างเดียว = null)"),
  // ── B ไป-กลับกับฐาน ──
  D("B4", "X5", "[R3 กฎไป-กลับ] updatePosGeneralSettings ครบทุกคีย์ → ตัวอ่านของผู้ใช้แต่ละตัวคืนค่าที่เขียน (posHeldCartExpireDays + listHeldCarts.expireDays · posRegisterAutoLockMinutes · parseShiftSettings · weighedBarcodeSettings · posReceiptLocale · posDayCutoffMinutes) · result.general = ค่าเดียวกัน · แพตช์บางส่วน (shift.blindClose) คงค่าอื่น"),
  D("B5", "X2", "[R3] หลังเขียน: คีย์พี่น้องของ settings.pos.* (receipt serviceCharge payment qcKeep …) + คีย์ระดับบน byte-identical · BusinessUnit.settings ไม่ถูกแตะ · ระบบ POS Y ไม่ถูกแตะ"),
  D("B6", "-", "[R3 R16] VALIDATION {field} 22 แบบ (นอกช่วง · ผิดชนิด · คีย์แปลก · registerV2 · serviceCharge · prefix 30 · prefix ซ้ำ · null) — field ตรงชื่อ · settings byte-identical หลังทุกครั้ง · ไม่มี audit"),
  D("B7", "-", "[R2 R3] ค่าปริยาย: POS Y (ไม่เคยตั้ง) → overview.general = {heldCartExpireDays 2, autoLockMinutes 2, shift ปริยาย, weighedBarcode ปิด, receiptLocale th, dayCutoffMinutes 0} · caps ปริยาย {STAFF 1000, MANAGER 10000, OWNER 10000}"),
  // ── G ตัวเขียนทั่วไป ──
  D("G1", "X5", "[R3 R6] OWNER เขียน → ok + AuditLog pos.settings.updated 1 แถว (targetType AppSystem · targetId X · actorId ผู้เขียน · after.section general · before.section general)"),
  D("G2", "X3", "[R1] MANAGER (U1+U2) เขียนได้ · STAFF ที่มี pos.settings.manage ครบ U1+U2 เขียนได้ (คีย์ใหม่ใช้ได้จริง)"),
  D("G3", "X3", "[R1] MANAGER (U1 อย่างเดียว) → PERMISSION_DENIED · STAFF มีแค่ pos.sale.create → PERMISSION_DENIED · STAFF pos.settings.manage เฉพาะ U1 → PERMISSION_DENIED · settings ไม่เปลี่ยน · ไม่มี audit"),
  D("G4", "X1", "[R3 ล็อกแถว] เขียนพร้อมกัน 3 ตัว (ทั่วไป · ใบเสร็จ · เพดาน) → ทั้งสามคีย์อยู่ครบหลังเสร็จ (ไม่มีใครทับใคร)"),
  D("G5", "X1", "[R6] แพตช์ค่าเดิม (no-op) → ok · ไม่มี audit แถวใหม่"),
  D("G6", "-", "[R3] ปิด shift.requiredRegister ขณะมีกะเปิด → ok · กะยัง OPEN (มีผลกับบิลถัดไปเท่านั้น)"),
  // ── C เพดานส่วนลด ──
  D("C1", "X4", "[R4] ก่อนตั้ง: STAFF ลด 15% → DISCOUNT_EXCEEDS_LIMIT (ตัวควบคุม) · OWNER ตั้ง STAFF 1500 → posDiscountCaps.STAFF 1500 + registerDiscountCaps · quote ถัดไปของ STAFF ลด 15% ผ่าน · 20% ยังไม่ผ่าน · audit section caps"),
  D("C2", "X3", "[R4] OWNER ตั้ง MANAGER 3000 · MANAGER ยก MANAGER เป็น 5000 → PERMISSION_DENIED · MANAGER ตั้ง STAFF 4000 (> เพดานตัวเอง) → PERMISSION_DENIED · STAFF 2500 → ok · STAFF (pos.sale.create) → PERMISSION_DENIED"),
  D("C3", "-", "[R4] OWNER cap แก้ไม่ได้: แพตช์ {OWNER} → VALIDATION field OWNER · posDiscountCaps.OWNER ยัง 10000"),
  D("C4", "-", "[R4] นอกช่วง/ผิดชนิด (-1 · 10001 · 2.5 · \"1500\" · คีย์ CASHIER/แปลก) → VALIDATION · settings ไม่เปลี่ยน"),
  // ── U สต็อกสาขา ──
  D("U1", "X5", "[R5 R6] BLOCK ที่ U1 → unitOversellPolicy(U1) BLOCK · U2 ยัง ALLOW_NEGATIVE · audit section unitStock targetType BusinessUnit targetId U1 · กลับเป็น ALLOW_NEGATIVE ได้"),
  D("U2", "X3", "[R5] STAFF2 (pos.settings.manage ที่ U1) ที่ U1 → ok · ที่ U2 → PERMISSION_DENIED · สาขาที่ไม่ผูก X (U3) → NOT_FOUND · ค่าแปลก \"NONE\" → VALIDATION"),
  D("U3", "X2", "[R5] BusinessUnit.settings คีย์อื่น byte-identical (qcUnit · pos.qcKeepUnit) · AppSystem X settings ไม่ถูกแตะ"),
  // ── P สิทธิ์ / NOT_FOUND ──
  D("P1", "-", "[R2] posSettingsOverview OWNER → canEdit {general caps unitStock staff payment receipt} true ทุกตัว · general/caps/unitStock/serviceCharge/tip = ผลของตัวอ่านเดิม"),
  D("P2", "X3", "[R2] แคชเชียร์ (pos.sale.create) อ่านได้ · canEdit ทุกตัว false · STAFF ไม่มีทั้ง pos.sale.create/pos.settings.manage → PERMISSION_DENIED"),
  D("P3", "X3", "[R1 R2] MANAGER (U1+U2): payment false (เจ้าของเท่านั้น) อื่น true · MANAGER (U1): general/caps/receipt false (ทั้งระบบ) · unitStock/staff true ที่ U1"),
  D("P4", "X2", "[R2] NOT_FOUND: ร้าน T2 · ระบบ Y กับ U1 · ระบบ X กับ U3 (ผูก Y) · id มั่ว"),
  // ── I การ์ด 13 ระบบ ──
  D("I1", "-", "[R7] posIntegrationCards → 13 การ์ดตามลำดับ MEMBER POINT COUPON REWARD ACCOUNT INVENTORY HR CRM CHAT KANBAN MARKETING BOOKING AI · ทุกใบมี code state scope target facts lastActivityAt manage · header.total 13 · POS_INTEGRATION_CODES ตรงลำดับ"),
  D("I2", "X5", "[R7] U1 → MEMBER POINT COUPON INVENTORY REWARD = LINKED scope UNIT target {systemId, name} ตรงระบบที่ผูก"),
  D("I3", "X2", "[R7] U2 → MEMBER POINT COUPON INVENTORY = OFF (target null) · REWARD LINKED (ระบบรางวัลของ U2)"),
  D("I4", "-", "[R7] ระบบคูปองที่ผูก U1 ถูกปิด (active false) → COUPON ไม่ LINKED (OFF) · เปิดคืน → LINKED"),
  D("I5", "X5", "[R7] ACCOUNT = LINKED scope POS target ระบบบัญชี · AccountSystemLink enabled=false → OFF · ระบบ POS Y (ไม่มีลิงก์ · ร้านมีบัญชี) → OFF"),
  D("I6", "-", "[R7] CRM ประตูปิด (uiVersion 1) → OFF scope TENANT · เปิดประตู (uiVersion 2 + bridgesEnabled) → LINKED"),
  D("I7", "-", "[R7] KANBAN: มีระบบแต่ไม่มี issueBoardId/กฎการ์ดบิลยกเลิก → OFF · ตั้ง issueBoardId (ตัวเขียนใบเสร็จ) → LINKED scope TENANT"),
  D("I8", "-", "[R7 CD3] HR (มีระบบ) PLANNED phase P3.5 · BOOKING PLANNED P2.4 · AI PLANNED P3.9 · MARKETING (ไม่มีระบบ) NO_SYSTEM · CHAT (ไม่มีระบบ) NO_SYSTEM · PLANNED/NO_SYSTEM: scope null target null manage null lastActivityAt null"),
  D("I9", "-", "[R7 CD3] header.linked = จำนวนการ์ด LINKED เท่านั้น"),
  D("I10", "-", "[R7] backlog = {pending: PENDING > 10 นาที, failed: FAILED} ของ OutboxEvent systemId X type pos.% → {2, 1} (+ แถวจริงของ X ที่ค้าง) · ของ Y / แถวใหม่ < 10 นาที / type อื่น ไม่นับ"),
  D("I11", "-", "[R7] เกินเวลา (opts {statementTimeoutMs 50, testDelayMs 400} → pg_sleep ใน tx เดียวกับ SET LOCAL) → backlog null · การ์ดยังครบ 13"),
  D("I12", "-", "[R7 CD3 §6] facts ต่อการ์ด = ตาราง {key, live, phase} ของโน้ต (live เฉพาะที่มีจริงวันนี้ · planned มี phase) · POINT pointRate params.satangPerPoint · INVENTORY oversellPolicy params.policy · lastActivityAt ของ ACCOUNT = event pos.sale.paid DONE ล่าสุดของ X"),
  D("I13", "X3", "[R7] manage: การ์ดสาขา href /app/settings/connections · canManage OWNER true / แคชเชียร์ false · แคชเชียร์อ่านการ์ดได้ · STAFF ไม่มีสิทธิ์ → PERMISSION_DENIED · T2 / Y+U1 → NOT_FOUND"),
  // ── A สวิตช์บัญชี ──
  D("A1", "X3", "[R8 R16] OWNER ปิดโดยไม่ส่ง confirm → CONFIRM_REQUIRED · ลิงก์ยัง enabled · ไม่มี audit"),
  D("A2", "X5", "[R8] confirm:true → ok · AccountSystemLink แถวเดิม enabled=false (config เดิม · ไม่ archived) · audit pos.integration.account {enabled:false} · การ์ด ACCOUNT OFF"),
  D("A3", "X4", "[R8] บิลหลังปิด → drain → ไม่มี JV/เอกสารของบิลนั้น · บิลก่อนปิด (ตัวควบคุม) มี JV"),
  D("A4", "X4", "[R8] เปิดคืน (ไม่ต้อง confirm) → ok + audit {enabled:true} · บิลถัดไปมี JV · การ์ด ACCOUNT LINKED"),
  D("A5", "X3", "[R8] สถานะเดิมซ้ำ → ok ไม่มี audit เพิ่ม · MANAGER ไม่มี account.settings.manage ชัดแจ้ง → PERMISSION_DENIED · STAFF มี account.settings.manage + pos.settings.manage ครบสาขา → ok"),
  // ── H ประวัติ ──
  D("H1", "X5", "[R6] ทุกตัวเขียนลง audit pos.settings.updated: general caps unitStock receipt payment intent (+ พร้อมเพย์รายสาขา section payment) — ตัวเขียนเดิม updatePosReceiptSettings/updatePosPaymentSettings/updatePosIntentSettings ด้วย"),
  D("H2", "X2", "[R9] posSettingsHistory(X) ใหม่สุดก่อน · {id at actorName action section summary} · มีแถว unitStock ของสาขาที่ผูก X · ไม่มีแถวของ Y · มีแถว pos.integration.account"),
  D("H3", "X1", "[R9] หน้าละ 20 · nextCursor → หน้าถัดไป ไม่ซ้ำ ไม่หาย · หน้าสุดท้าย nextCursor null · เรียงเวลาไม่เพิ่ม"),
  // ORACLE-EDIT (P1.18U แก้รอบ 1 F1 · มติผู้คุมงาน 9 ต.ค.): สรุปประวัติต้องมีเฉพาะคีย์ชั้นที่ 2 ที่เปลี่ยนจริง (ไม่ลากพี่น้องในก้อนเดียวกันมา)
  D("H2b", "X5", "[แก้รอบ 1 F1 · R9] แก้ shift.blindClose อย่างเดียว → แถวประวัติใหม่สุดของ X summary คีย์ = [\"shift.blindClose\"] พอดี · แก้กฎบาร์โค้ดชั่งอย่างเดียว (enabled เท่าเดิม) → summary มี weighedBarcode.rules ไม่มี weighedBarcode.enabled · คืนค่าเดิมหลังตรวจ"),
  D("H4", "X3", "[R6 R9] ไม่มี before/after ดิบในรายการ · ไม่มีเลขพร้อมเพย์ดิบทั้งในรายการและ AuditLog · แคชเชียร์ → PERMISSION_DENIED"),
  // ── S พนักงาน / อนุมัติ ──
  D("S1", "X2", "[R10] posStaffOverview(U1).staff = ผู้ขายที่สาขา (pos.sale.create) {userId name role hasPin shift} · hasPin ตรง PosStaffPin · ไม่มี pinHash/deviceId · แคชเชียร์ → PERMISSION_DENIED"),
  D("S2", "-", "[R10 CD8] roleMatrix 12 แถวตามลำดับ (sell discount priceOverride void refund shiftOperate shiftManage productManage stockCount reports settings onlineOrders) · permission ตามตาราง · owner/manager true (แถวมีสิทธิ์) · staff {holders,total} ตรง Membership · onlineOrders planned P2.8 · caps = posDiscountCaps"),
  D("S3", "X2", "[R10 มติ Q4] approvals = กติกา POS_* ที่ active และใช้กับ X/U1 (global · systemId X · unitId U1) — ไม่รวมกติกาที่ปิด / ของ Y / entityType อื่น · needsApproval: void/refund true · discount false"),
  D("S4", "-", "[R10 มติ Q4] approval facade listPoliciesForEntities(ctx, entities) → เฉพาะ entityType ที่ขอ ของร้านนี้ (มี steps) · ร้าน T2 ไม่เห็นของ T"),
  // ── L ภาษา ──
  D("L2", "X5", "[R12 มติ Q7] receiptLocale \"en\" → receiptPayload.printLocale en · renderReceiptHtml(payload, {paper 80, locale printLocale}) ไม่มีป้ายไทยของ RECEIPT_LABELS.th · มีป้าย en"),
  D("L3", "-", "[R12] ระบบที่ไม่เคยตั้ง (Y) → printLocale th (ค่าปริยายเดิม) · ตั้งกลับ th → th"),
  // ── D ตัดวัน ──
  D("D1", "-", "[มติ Q9] dayCutoffMinutes 240: บิล 02:00 (เวลาไทย) วัน D → reportDailySales แถว D−1 · closeDaySummary(D−1) นับ · บิล 05:00 → วัน D"),
  D("D2", "-", "[มติ Q9] dayCutoffMinutes 0 (ตัวควบคุม): ทั้งสองบิลอยู่วัน D (รายงาน + ปิดวัน) · D−1 = 0"),
  // ── PP พร้อมเพย์รายสาขา ──
  D("PP1", "X4", "[มติ Q9] updatePosUnitPromptpay(U1, เลขสาขา) OWNER → ok · createPaymentIntent PROMPTPAY ที่ U1 → qrPayload = promptpayPayload(เลขสาขา) (ไม่ใช่ของโปรไฟล์) · audit section payment ไม่มีเลขดิบ"),
  D("PP2", "X3", "[มติ Q9] U2 (ไม่ตั้ง) → QR ของโปรไฟล์ · MANAGER → SETTINGS_SECTION_LOCKED · เลขผิดรูป → VALIDATION field promptpayId · U3 → NOT_FOUND · null = ลบ → U1 กลับไปใช้โปรไฟล์"),
  // ── V FU-c ──
  D("V2", "X3", "[มติ Q9 FU-c] canEdit.receipt ตรงกับตัวเขียนใบเสร็จ: MANAGER (U1) false + updatePosReceiptSettings PERMISSION_DENIED · MANAGER (U1+U2) true + ok"),
  // ── K งานปิด P1.15 ──
  D("K1", "X3", "[มติ Q9 P1.15] ใส่ PIN แบบไม่ระบุคนผิด N ครั้ง (N = STAFF_PIN_DEVICE_THROTTLE_AFTER) ที่เครื่อง 1 → PIN_INVALID ทุกครั้ง · ครั้งถัดไป (PIN ถูก) → PIN_THROTTLED · เครื่อง 2 PIN ถูก → ok · failedCount ของพนักงานไม่ขยับ"),
  // ORACLE-EDIT (แก้รอบ 1 F2 · มติผู้คุมงาน 9 ต.ค.): K1 ต่อเครื่องเดาได้ด้วยรหัสเครื่องใหม่ทุก 9 ครั้ง ⇒ เพิ่มด่านต่อสาขา + ถังเครื่องไม่ลงทะเบียน
  D("K1b", "X3", "[แก้รอบ 1 F2] ด่านต่อสาขา: ผิดแบบไม่ระบุคนรวม N_U ครั้ง (N_U = STAFF_PIN_UNIT_THROTTLE_AFTER = 30) ที่ U2 กระจายหลายรหัสเครื่อง (ลงทะเบียน 3 เครื่อง × 9 + ไม่ลงทะเบียน 3 รหัส — ไม่มีเครื่อง/ถังไหนถึง N) → PIN_INVALID ทุกครั้ง · ครั้งที่ N_U+1 บนเครื่องลงทะเบียนใหม่ที่ยังไม่เคยผิด → PIN_THROTTLED · สาขา U1 ไม่โดน (DEV2 PIN ถูก → ok)"),
  D("K1c", "X3", "[แก้รอบ 1 F2] ถังเครื่องไม่ลงทะเบียน: ผิดแบบไม่ระบุคน N ครั้งที่ U1 ด้วยรหัสเครื่องไม่ลงทะเบียน 'ใหม่ทุกครั้ง' → PIN_INVALID ทุกครั้ง · รหัสไม่ลงทะเบียนใหม่อีกตัว PIN ถูก → PIN_THROTTLED (รวมถังเดียวต่อสาขา) · ระบุคน (userId) บนรหัสไม่ลงทะเบียนใหม่ → ok (ไม่โดนด่าน) · เครื่องลงทะเบียน DEV2 PIN ถูก → ok"),
  D("K2", "X2", "[มติ Q9 P1.15] ตั้ง PIN ซ้ำกับคนอื่นในสาขา → ไม่ใช่ PIN_TAKEN และแยกไม่ออก: ok (แล้ว PIN นั้นแบบไม่ระบุคน → PIN_INVALID · ระบุคน → คนนั้น) หรือ ปฏิเสธด้วย code+message เดียวกับ PIN อ่อน · ข้อความไม่บอกว่ามีคนใช้"),
  D("K3", "X1", "[มติ Q9 P1.15 F5] กติกา POS_DISCOUNT_OVER · submit พร้อมกัน 2 ครั้งคีย์เดียว (3 รอบ) → requestId เดียวกัน · บิลพัก +1 · คำขอ +1 ต่อรอบ · ไม่มีบิล · อนุมัติ → submit พร้อมกันคีย์เดียว → บิล 1 ใบ อีกตัว = บิลเดิม หรือ IDEMPOTENCY_CONFLICT"),
  D("K4", "X3", "[มติ Q9 P1.15] approval decide โดยผู้ยื่นเอง (MANAGER ที่ผ่าน canDecideStep) → ok:false · คำขอยัง PENDING · ไม่มี ApprovalDecision/outbox approved · OWNER ตัดสินได้ (ตัวควบคุม)"),
  // ORACLE-EDIT (แก้รอบ 2 F3 · มติผู้คุมงาน 9 ต.ค.): ร้านเจ้าของคนเดียวต้องไม่ค้างคำขอของตัวเอง · ร้านหลายเจ้าของยังห้าม
  D("K4b", "X3", "[แก้รอบ 2 F3] ร้านมี OWNER (รับคำเชิญแล้ว) คนเดียว: OWNER ยื่นเอง (ขั้น OWNER) แล้ว decide เอง → ok:true APPROVED · เพิ่ม OWNER คนที่ 2 (รับคำเชิญแล้ว) → OWNER คนเดิมยื่นใหม่แล้ว decide เอง → ok:false code SELF_APPROVAL · คำขอยัง PENDING · ไม่มี ApprovalDecision · bulkDecide → done 0 failed 1 · OWNER คนที่ 2 ตัดสินได้ (ตัวควบคุม)"),
  // ── E ปฏิเสธเป็นข้อมูล ──
  D("E1", "-", "[R16] คำปฏิเสธที่เก็บได้ {ok:false, code, message ไทย} ไม่ throw · มีรหัสใหม่ครบ SETTINGS_SECTION_LOCKED CONFIRM_REQUIRED PIN_THROTTLED · settingsRefusalMessageKey ของทุกรหัสที่เห็น → คีย์ที่มีใน pos.settings th+en"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราว T + T2 เหลือ 0 แถวทุกตารางที่มี tenantId · แถว Tenant ถูกลบ · ผู้ใช้ชั่วคราว 0"),
  D("Z2", "-", "QC4 ร้าน seed ไม่มีรอยของรอบนี้ (settings ที่มี RAND/สาขาชั่วคราว · AuditLog/OutboxEvent ที่มี RAND · ลิงก์บัญชี/กติกาอนุมัติของรอบนี้) · ลายนิ้วมือก่อน/หลังพิมพ์เป็นข้อมูล (lane อื่นเขียนพร้อมกันได้)"),
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
  const full = id.startsWith("P1.18-") ? id : `P1.18-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const short = (v: unknown, n = 220) => {
  let s: string;
  try {
    s = typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    s = String(v);
  }
  return (s ?? "undefined").slice(0, n);
};
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : r === undefined ? "undefined" : r === null ? "null" : typeof r === "string" ? "STRING" : "UNKNOWN");
const refused = (r: Any, code: string) => r?.ok === false && String(r.code) === code && !r.threw;
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  if (m) return m[1]!;
  return "THROW";
}
const MISSING = "ยังไม่มีโมดูล/ฟังก์ชัน";
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `${MISSING} — ฟังก์ชัน ${name}`, missing: true };
  try {
    return await fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}
function callSync(mod: Any, name: string, ...args: unknown[]): Any {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `${MISSING} — ฟังก์ชัน ${name}`, missing: true };
  try {
    return fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}
const tryImport = async (p: string): Promise<Any> => {
  try {
    return await import(p as string);
  } catch (e) {
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 140)})`);
    return null;
  }
};
const has = (mod: Any, name: string) => typeof mod?.[name] === "function";
const THAI = /[ก-ฺเ-๛]/; // อักษร/สระ/วรรณยุกต์ไทย (ไม่รวม ฿ U+0E3F)
const isRecord = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const camel = (code: string) => code.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
/** JSON แบบเรียงคีย์ (เทียบ byte-identical ของค่า jsonb) */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (isRecord(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}
const joinP = (p: string[], n = 8) => p.slice(0, n).join(" · ") + (p.length > n ? ` …(+${p.length - n})` : "");

// ── ซอร์ส (สถิต) ──
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
/** ตัด regex literal ที่เป็น character class/ลำดับสั้น (เช่น /[เแโใไ\s]/ · /[,\s฿]/g) ออกก่อนนับอักษรไทย */
const stripRegexLiterals = (s: string) => s.replace(/(^|[=(,:!&|?{};\s])\/(?![/*])((?:\\.|\[(?:\\.|[^\]\n])*\]|[^/\n\\[])+)\/[dgimsuy]*/g, "$1/R/");
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(src);
const srcOf = (f: string) => stripComments(rd(f));
const isUseServer = (raw: string) => /^["']use server["']/.test(raw.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "").trimStart());
const valueImports = (s: string): string[] => [
  ...[...s.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!),
  ...[...s.matchAll(/^\s*export\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!),
  ...[...s.matchAll(/import\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1]!),
];
const isPureSrc = (s: string) => !valueImports(s).some((p) => /@prisma\/client|\/db$|^\.\/db$|@\/lib\/core\/db|next\/headers|next\/navigation|^\.\/(register|service|shift|held-cart|receipt|settings-general|settings-overview|payment-intent|payment-settings|staff-pin)$/.test(p));

const POS_DIR = "src/lib/modules/pos";
const F = {
  shared: `${POS_DIR}/settings-shared.ts`,
  general: `${POS_DIR}/settings-general.ts`,
  overview: `${POS_DIR}/settings-overview.ts`,
  actions: `${POS_DIR}/settings-actions.ts`,
  root: "src/lib/pos-integrations.ts",
  rootActions: "src/lib/pos-integrations-actions.ts",
  localeCookies: "src/i18n/locale-cookies.ts",
  localeActions: "src/i18n/locale-actions.ts",
  regShared: `${POS_DIR}/register-shared.ts`,
  heldCart: `${POS_DIR}/held-cart.ts`,
  reports: `${POS_DIR}/reports.ts`,
  service: `${POS_DIR}/service.ts`,
  intent: `${POS_DIR}/payment-intent.ts`,
  intentShared: `${POS_DIR}/payment-intent-shared.ts`,
  receipt: `${POS_DIR}/receipt.ts`,
  render: `${POS_DIR}/receipt-render.ts`,
  rcptSettings: `${POS_DIR}/receipt-settings.ts`,
  paySettings: `${POS_DIR}/payment-settings.ts`,
  payActions: `${POS_DIR}/payment-settings-actions.ts`,
  access: `${POS_DIR}/access.ts`,
  tabs: `${POS_DIR}/tabs.ts`,
  layout: "src/app/app/layout.tsx",
  salesPage: "src/app/app/sys/[id]/pos/sales/page.tsx",
  settingsPage: "src/app/app/sys/[id]/pos/settings/page.tsx",
  settingsTabs: "src/components/pos/settings/settings-tabs.ts",
  printBrowser: "src/components/pos/print/browser.ts",
  printEscpos: "src/components/pos/print/escpos.ts",
  perms: "src/lib/core/permissions.ts",
  accIndex: "src/lib/modules/account/index.ts",
  apIndex: "src/lib/modules/approval/index.ts",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
};
const PERM_MANAGE = "pos.settings.manage";
const PERM_PAYMENT = "pos.settings.payment";
const AUDIT_SETTINGS = "pos.settings.updated";
const AUDIT_ACCOUNT = "pos.integration.account";
const CARD_CODES = ["MEMBER", "POINT", "COUPON", "REWARD", "ACCOUNT", "INVENTORY", "HR", "CRM", "CHAT", "KANBAN", "MARKETING", "BOOKING", "AI"] as const;
const UNIT_CARDS = ["MEMBER", "POINT", "COUPON", "INVENTORY", "REWARD"] as const;
const CARD_STATES = ["LINKED", "OFF", "NO_SYSTEM", "PLANNED"];
const CARD_SCOPES = ["UNIT", "POS", "TENANT", null];
/** §6 ตาราง facts ต่อการ์ด (key · live วันนี้ · phase ของที่ยังไม่มี) — สัญญาของผู้สร้าง (ตารางชื่อในโน้ต) */
type Fact = readonly [string, boolean, string | null];
const FACTS: Record<(typeof CARD_CODES)[number], readonly Fact[]> = {
  MEMBER: [["memberLookup", true, null], ["memberSpend", true, null], ["memberSignup", true, null]],
  POINT: [["pointRate", true, null], ["pointRedeem", true, null], ["pointVoidReverse", true, null]],
  COUPON: [["couponCode", true, null], ["voucherPayment", false, "P2.9"], ["couponUnitLimit", true, null]],
  REWARD: [["rewardRedeem", true, null], ["rewardNearCustomerDisplay", false, "P2.10"]],
  ACCOUNT: [["autoPost", true, null], ["taxInvoice", true, null], ["platformCommission", false, "P2.1"], ["promptpayReconcile", false, "P3.10"]],
  INVENTORY: [["stockDeduct", true, null], ["bomDeduct", false, "P2.3"], ["oversellPolicy", true, null], ["lowStockReorder", false, "P3"]],
  HR: [["shiftPinSchedule", false, "P3.5"], ["salesCommission", false, "P3.5"], ["leaveHidesShift", false, "P3.5"]],
  CRM: [["dealPaidCount", true, null], ["bigBillDeal", false, "P3.6"], ["corporateCredit", false, "P3.6"]],
  CHAT: [["lineReceipt", true, null], ["chatOrders", true, null], ["orderStatusBot", false, "P3.7"]], // ORACLE-EDIT P2.8 (มติ 5): พนักงานคีย์ออเดอร์จากแชท
  KANBAN: [["voidBillCard", true, null], ["issueReportCard", true, null], ["stockOutShiftDiffCard", false, "P3.8"], ["shiftCloseCashCheck", false, "P3.8"]],
  MARKETING: [["happyHourPricing", true, null], ["couponAfterPurchase", false, "P3"]],
  BOOKING: [["tableReservationsOnMap", false, "P2.4"], ["callQueueFromTable", false, "P2.4"], ["advanceBookingBill", false, "P2.7"]],
  AI: [["shiftDaySummary", false, "P3.9"], ["purchaseSuggestion", false, "P3.9"], ["anomalyDetection", false, "P3.9"]],
};
const PLANNED_PHASE: Record<string, string> = { HR: "P3.5", MARKETING: "P2.2", BOOKING: "P2.4", AI: "P3.9" };
const NAV_KEYS = ["overview", "register", "products", "stock", "sales", "shifts", "close", "reports", "settings"] as const;
const NAV_TH = ["ภาพรวม", "ขายหน้าร้าน", "สินค้า/บริการ", "สต็อก", "บิลวันนี้", "กะ", "ปิดวัน", "รายงาน", "ตั้งค่า"];
const ROLE_ROWS: readonly [string, string | null, string | null][] = [
  ["sell", "pos.sale.create", null],
  ["discount", null, null],
  ["priceOverride", "pos.sale.priceOverride", null],
  ["void", "pos.sale.void", null],
  ["refund", "pos.sale.refund", null],
  ["shiftOperate", "pos.shift.operate", null],
  ["shiftManage", "pos.shift.manage", null],
  ["productManage", "pos.product.manage", null],
  ["stockCount", "pos.stock.count", null],
  ["reports", "pos.report.view", null],
  ["settings", PERM_MANAGE, null],
  ["onlineOrders", "pos.order.accept", null], // ORACLE-EDIT P2.8 (CD9): จอ 09 = pos.order.accept
];
const SETTINGS_CODES = ["NOT_FOUND", "PERMISSION_DENIED", "VALIDATION", "UNKNOWN", "SETTINGS_SECTION_LOCKED", "CONFIRM_REQUIRED"];
const NEW_CODES = ["SETTINGS_SECTION_LOCKED", "CONFIRM_REQUIRED", "PIN_THROTTLED"];
const SETTINGS_ACTIONS: [string, string][] = [
  ["posSettingsOverviewAction", "posSettingsOverview"],
  ["updatePosGeneralSettingsAction", "updatePosGeneralSettings"],
  ["updatePosDiscountCapsAction", "updatePosDiscountCaps"],
  ["updatePosUnitStockPolicyAction", "updatePosUnitStockPolicy"],
  ["posSettingsHistoryAction", "posSettingsHistory"],
  ["posStaffOverviewAction", "posStaffOverview"],
  ["updatePosUnitPromptpayAction", "updatePosUnitPromptpay"],
];
const ROOT_ACTIONS: [string, string][] = [
  ["posIntegrationCardsAction", "posIntegrationCards"],
  ["setPosAccountLinkAction", "setPosAccountLink"],
];
const U_PHASE = process.env.QC_P118_PHASE === "U" || (() => {
  const s = srcOf(F.settingsTabs);
  return ["general", "staff", "shark", "channels", "offline"].every((k) => new RegExp(`key:\\s*"${k}"[^}]*live:\\s*true`).test(s));
})();

// ── ด่าน SKIP: ของ P1.18 ที่ต้องมีก่อนรันจริง ──
const skipReasons: string[] = [];
for (const f of [F.shared, F.general, F.overview, F.actions, F.root, F.rootActions, F.localeCookies, F.localeActions]) if (!existsSync(join(ROOT, f))) skipReasons.push(`${f} ยังไม่มี`);
for (const [f, ns] of [
  [F.general, ["updatePosGeneralSettings", "updatePosDiscountCaps", "updatePosUnitStockPolicy", "posSettingsHistory"]],
  [F.overview, ["posSettingsOverview", "posStaffOverview"]],
  [F.root, ["posIntegrationCards", "setPosAccountLink"]],
  [F.shared, ["posReceiptLocale", "posDayCutoffMinutes", "settingsRefusalMessageKey"]],
  [F.regShared, ["posHeldCartExpireDays"]],
  [F.intentShared, ["promptpayIdForUnit"]],
  [F.paySettings, ["updatePosUnitPromptpay"]],
  [F.localeCookies, ["nextLocaleCookies"]],
  [F.access, ["posSalesReadScope"]],
  [F.accIndex, ["setPosLinkEnabled"]],
  [F.apIndex, ["listPoliciesForEntities"]],
] as const)
  for (const n of ns) if (existsSync(join(ROOT, f)) && !exportsFn(srcOf(f), n)) skipReasons.push(`ยังไม่มี export ${n} (${f.split("/").slice(-2).join("/")})`);
if (!new RegExp(`["']${PERM_MANAGE.replace(/\./g, "\\.")}["']\\s*:`).test(srcOf(F.perms))) skipReasons.push(`permissions.ts ยังไม่มีคีย์ ${PERM_MANAGE}`);

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB) ═════════════════════════
function posPermBlock(): string {
  const s = rd(F.perms);
  const i = s.search(/module:\s*"pos"/);
  if (i < 0) return "";
  const j = s.indexOf("module:", i + 10);
  return s.slice(i, j < 0 ? s.length : j);
}
function readJson(f: string, p: string[]): Any {
  try {
    return JSON.parse(rd(f) || "null");
  } catch (e) {
    p.push(`${f} อ่าน JSON ไม่ได้: ${(e as Error).message.slice(0, 40)}`);
    return null;
  }
}
/** คีย์ใต้ทุก "errors" ของ pos.json (ชื่อใบไม้) */
function errorKeys(j: Any): Map<string, string> {
  const out = new Map<string, string>();
  (function w(o: Any, path: string) {
    if (!isRecord(o)) return;
    for (const [k, v] of Object.entries(o)) {
      const p = path ? `${path}.${k}` : k;
      if (isRecord(v)) w(v, p);
      else if (/(^|\.)errors$/.test(path) && typeof v === "string") out.set(k, v);
    }
  })(j, "");
  return out;
}
/** รหัสปฏิเสธทุกตัวใน union `export type …Code = "A" | "B"` ของ modules/pos */
function posRefusalCodes(): Map<string, Set<string>> {
  const codes = new Map<string, Set<string>>();
  for (const f of walk(POS_DIR)) {
    const s = srcOf(f);
    for (const m of s.matchAll(/export\s+type\s+(\w*(?:RefusalCode|ErrorCode|Code))\s*=([^;]*);/g))
      for (const c of m[2]!.matchAll(/"([A-Z][A-Z0-9_]+)"/g)) {
        if (!codes.has(c[1]!)) codes.set(c[1]!, new Set());
        codes.get(c[1]!)!.add(`${f.split("/").pop()}:${m[1]}`);
      }
  }
  return codes;
}
/** นับบรรทัดที่มีอักษรไทยนอกคอมเมนต์/regex ต่อไฟล์ (R13b) */
function thaiLiteralBaseline(): [string, number][] {
  const files = [...walk("src/components/pos"), ...walk("src/app/app/sys/[id]/pos")];
  const rows: [string, number][] = [];
  for (const f of files) {
    const n = stripRegexLiterals(srcOf(f)).split("\n").filter((l) => THAI.test(l)).length;
    if (n) rows.push([f, n]);
  }
  return rows.sort((a, b) => b[1] - a[1]);
}

async function runStatic(): Promise<void> {
  console.log("\n── ST ข้อสถิต (ไม่แตะ DB) ──");
  // ST1
  {
    const p: string[] = [];
    const blk = posPermBlock();
    if (!blk) p.push("ไม่พบบล็อก module pos ใน permissions.ts");
    for (const k of [PERM_MANAGE, PERM_PAYMENT]) {
      const m = new RegExp(`["']${k.replace(/\./g, "\\.")}["']\\s*:\\s*["']([^"']*)["']([^\\n]*)`).exec(blk);
      if (!m) p.push(`บล็อก pos ไม่มี "${k}"`);
      else {
        if (!THAI.test(m[1]!)) p.push(`"${k}" ป้ายไม่ใช่ไทย`);
        if (!/POS P1\.18/.test(m[2]!)) p.push(`"${k}" ไม่มีป้าย // POS P1.18`);
      }
    }
    if (!/["']pos\.settings\.payment["']/.test(srcOf(F.payActions))) p.push("payment-settings-actions ไม่ assert pos.settings.payment แล้ว (มติ Q2: คงเดิม)");
    chk("ST1", p.length === 0, "2 คีย์ในบล็อก pos ป้ายไทย + ป้าย P1.18", joinP(p) || "ครบ");
  }
  // ST2
  {
    const p: string[] = [];
    const root = srcOf(F.root);
    if (!root) p.push(`ไม่มี ${F.root}`);
    else {
      for (const n of ["posIntegrationCards", "setPosAccountLink", "POS_INTEGRATION_CODES"]) if (!exportsFn(root, n)) p.push(`pos-integrations.ts ไม่ export ${n}`);
      const bad = valueImports(root).filter((x) => {
        const m = /^@\/lib\/modules\/([^/]+)\/(.+)$/.exec(x);
        return !!m && !["pos", "system"].includes(m[1]!);
      });
      if (bad.length) p.push(`pos-integrations import ภายในโมดูลอื่น ${[...new Set(bad)].join(",")} (ต้องผ่าน facade)`);
      if (/\.\s*(appSystemUnit|accountSystemLink|appSystem)\s*\.\s*(create|update|updateMany|upsert|delete|deleteMany)\b/.test(root)) p.push("pos-integrations เขียนตารางลิงก์/ระบบตรง (R8: ผ่าน facade)");
    }
    const posFiles = walk(POS_DIR);
    for (const f of posFiles) {
      const s = srcOf(f);
      const nm = f.slice(POS_DIR.length + 1);
      // pos→crm ผ่าน facade มีอยู่แล้วใน allowlist F2 (register.ts ผูกบิลเข้าดีล) — ห้ามเฉพาะไฟล์ภายในของ crm · chat/kanban/hr ห้ามทั้งหมด
      const hits = [...s.matchAll(/["'](@\/lib\/modules\/(?:chat|kanban|hr)(?:\/[^"']*)?|@\/lib\/modules\/crm\/[^"']+|(?:\.\.\/)+(?:crm|chat|kanban|hr)(?:\/[^"']*)?|@\/lib\/pos-integrations(?:-actions)?|@\/lib\/platform\/(?:crm|kanban)-bridges[^"']*)["']/g)].map((x) => x[1]!);
      if (hits.length) p.push(`${nm} import ${[...new Set(hits)].join(",")}`);
    }
    chk("ST2", p.length === 0, "root export ครบ · pos ไม่ import crm/chat/kanban/hr/root · root ผ่าน facade", joinP(p) || `ครบ (${posFiles.length} ไฟล์ pos)`);
  }
  // ST3
  {
    const p: string[] = [];
    const acc = srcOf(F.accIndex);
    const accRaw = rd(F.accIndex);
    if (!exportsFn(acc, "setPosLinkEnabled")) p.push("account/index.ts ไม่ export setPosLinkEnabled");
    else {
      const i = acc.search(/setPosLinkEnabled/);
      const body = acc.slice(i, i + 1500);
      if (!/\b(connect|disconnect)\b|connections/.test(body) && !/from\s+["']\.\/connections["']/.test(acc)) p.push("setPosLinkEnabled ไม่ห่อ connect/disconnect (account/connections)");
    }
    if (!/POS P1\.18/.test(accRaw)) p.push("account/index.ts ไม่มีป้าย // POS P1.18");
    const ap = srcOf(F.apIndex);
    if (!exportsFn(ap, "listPoliciesForEntities")) p.push("approval/index.ts ไม่ export listPoliciesForEntities");
    if (!/POS P1\.18/.test(rd(F.apIndex))) p.push("approval/index.ts ไม่มีป้าย // POS P1.18");
    chk("ST3", p.length === 0, "facade 2 export เพิ่มอย่างเดียว + ป้าย", joinP(p) || "ครบ");
  }
  // ST4
  {
    const p: string[] = [];
    const files = [...walk(POS_DIR), F.rootActions, F.localeActions].filter((f) => isUseServer(rd(f)));
    for (const f of files) {
      const s = srcOf(f);
      const bad = [...s.matchAll(/^\s*export\s+[^\n]*/gm)].map((m) => m[0].trim()).filter((l) => !/^export\s+async\s+function\s+\w+/.test(l));
      if (bad.length) p.push(`${f.split("/").pop()}: export ที่ไม่ใช่ async function (${short(bad.map((b) => b.slice(0, 40)), 100)})`);
    }
    const actionFile = (f: string, acts: [string, string][], needTenant: boolean) => {
      const raw = rd(f);
      if (!raw) return p.push(`ไม่มี ${f}`);
      if (!isUseServer(raw)) p.push(`${f.split("/").pop()}: "use server" ไม่ใช่คำสั่งแรก`);
      const s = stripComments(raw);
      if (needTenant && !/requireTenant\s*\(/.test(s)) p.push(`${f.split("/").pop()} ไม่เรียก requireTenant`);
      const starts = [...s.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)].map((m) => ({ name: m[1]!, at: m.index! }));
      for (const [act, fn] of acts) {
        const i = starts.findIndex((x) => x.name === act);
        if (i < 0) {
          p.push(`ไม่มี ${act}`);
          continue;
        }
        const body = s.slice(starts[i]!.at, i + 1 < starts.length ? starts[i + 1]!.at : s.length);
        if (!new RegExp(`\\b${fn}\\s*\\(`).test(body)) p.push(`${act} ไม่เรียก ${fn}`);
        if (!/\bcatch\b/.test(body)) p.push(`${act} ไม่มี catch`);
      }
      return 0;
    };
    actionFile(F.actions, SETTINGS_ACTIONS, true);
    actionFile(F.rootActions, ROOT_ACTIONS, true);
    actionFile(F.localeActions, [["setUiLocaleAction", "nextLocaleCookies"]], false);
    if (rd(F.localeActions) && !/cookies\s*\(\s*\)/.test(srcOf(F.localeActions))) p.push("locale-actions.ts ไม่เรียก cookies()");
    chk("ST4", p.length === 0, "use server = async ล้วน · 7 + 2 + 1 actions", joinP(p) || `ครบ (${files.length} ไฟล์ use server)`);
  }
  // ST5
  {
    const p: string[] = [];
    const th = readJson(F.msgTh, p);
    const en = readJson(F.msgEn, p);
    const nTh = th?.nav, nEn = en?.nav;
    if (!isRecord(nTh) || !isRecord(nEn)) p.push("ไม่มี pos.nav ใน th/en");
    else {
      NAV_KEYS.forEach((k, i) => {
        if (nTh[k] !== NAV_TH[i]) p.push(`th nav.${k} = ${short(nTh[k], 20)} (คาด ${NAV_TH[i]})`);
        if (typeof nEn[k] !== "string" || !nEn[k].trim() || THAI.test(nEn[k])) p.push(`en nav.${k} = ${short(nEn[k], 20)}`);
      });
      const extra = Object.keys(nTh).filter((k) => !(NAV_KEYS as readonly string[]).includes(k)).concat(Object.keys(nEn).filter((k) => !(NAV_KEYS as readonly string[]).includes(k)));
      if (extra.length) p.push(`nav คีย์เกิน ${extra.join(",")}`);
    }
    const tabs = stripRegexLiterals(srcOf(F.tabs));
    if (THAI.test(tabs)) p.push("pos/tabs.ts ยังมีอักษรไทย (ป้ายต้องมาจาก messages)");
    if (!/nav\./.test(tabs)) p.push("pos/tabs.ts ไม่อ้างคีย์ nav.*");
    const lay = srcOf(F.layout);
    const i = lay.indexOf('case "POS":');
    const j = i >= 0 ? lay.indexOf("case ", i + 10) : -1;
    const posBlock = i >= 0 ? lay.slice(i, j < 0 ? i + 2000 : j) : "";
    if (!posBlock) p.push('layout.tsx ไม่พบ case "POS"');
    else if (THAI.test(posBlock)) p.push("app/layout.tsx บล็อก POS ยังมีอักษรไทย");
    chk("ST5", p.length === 0, "pos.nav.* th/en · th = ป้ายเดิม · tabs/layout ไม่มีไทย", joinP(p) || "ครบ");
  }
  // ST6
  {
    const p: string[] = [];
    const th = readJson(F.msgTh, p);
    const en = readJson(F.msgEn, p);
    const kt = errorKeys(th), ke = errorKeys(en);
    const codes = posRefusalCodes();
    const miss = [...codes.keys()].filter((c) => !kt.has(camel(c)) || !ke.has(camel(c)));
    if (miss.length) p.push(`ไม่มีคีย์ errors.<camel> th/en: ${miss.slice(0, 8).join(",")}${miss.length > 8 ? ` …(+${miss.length - 8})` : ""}`);
    for (const c of NEW_CODES) if (!codes.has(c)) p.push(`ไม่มีรหัส ${c} ใน union *Code ของ modules/pos`);
    const ps = [...(codes.get("SETTINGS_SECTION_LOCKED") ?? [])].join(",");
    if (codes.has("SETTINGS_SECTION_LOCKED") && !/settings-shared\.ts:PosSettingsRefusalCode/.test(ps)) p.push(`SETTINGS_SECTION_LOCKED ไม่อยู่ใน settings-shared PosSettingsRefusalCode (${ps})`);
    const thaiBad = [...kt.entries()].filter(([, v]) => !THAI.test(v)).map(([k]) => k);
    if (thaiBad.length) p.push(`th errors ไม่ใช่ไทย: ${thaiBad.slice(0, 6).join(",")}`);
    const shared = srcOf(F.shared);
    if (!exportsFn(shared, "settingsRefusalMessageKey")) p.push("settings-shared.ts ไม่ export settingsRefusalMessageKey");
    else {
      const notCovered = SETTINGS_CODES.filter((c) => !new RegExp(`\\b${c}\\b`).test(shared));
      if (notCovered.length) p.push(`settingsRefusalMessageKey ไม่ครอบ ${notCovered.join(",")}`);
    }
    const st = th?.settings?.errors, se = en?.settings?.errors;
    for (const c of ["SETTINGS_SECTION_LOCKED", "CONFIRM_REQUIRED"]) if (!(isRecord(st) && typeof st[camel(c)] === "string" && isRecord(se) && typeof se[camel(c)] === "string")) p.push(`ไม่มี pos.settings.errors.${camel(c)} th/en`);
    const rg = th?.register?.errors, rge = en?.register?.errors;
    if (!(isRecord(rg) && THAI.test(String(rg.pinThrottled ?? "")) && isRecord(rge) && typeof rge.pinThrottled === "string")) p.push("ไม่มี pos.register.errors.pinThrottled th/en");
    if (!/\bPIN_THROTTLED\s*:/.test(srcOf(F.regShared))) p.push("REFUSAL_KEY ใน register-shared ไม่มี PIN_THROTTLED");
    chk("ST6", p.length === 0, `ทุกรหัส (${codes.size}) มีคีย์ th+en · รหัสใหม่ครบ · ตัวแปลงรหัสครบ`, joinP(p) || `ครบ (${codes.size} รหัส)`);
  }
  // ST7 U-PHASE
  {
    const rows = thaiLiteralBaseline();
    const total = rows.reduce((a, [, n]) => a + n, 0);
    const base = rows.map(([f, n]) => `${f.replace("src/app/app/sys/[id]/pos/", "pos/").replace("src/components/pos/", "c/")}=${n}`).join(" ");
    if (U_PHASE) chk("ST7", total === 0, "อักษรไทยนอก t() = 0 ทั้งสองต้นไม้", total === 0 ? "0" : `${total} บรรทัดใน ${rows.length} ไฟล์: ${base}`);
    else {
      console.log(`  ⏭️  [P1.18-ST7] SKIP-until-U (U-PHASE) — ฐานใบ S: ${total} บรรทัด ${rows.length} ไฟล์ · ${base || "(ไม่มี)"}`);
      chk("ST7", true, "SKIP-until-U (เฟส S)", `SKIP-until-U · ฐาน ${total} บรรทัด/${rows.length} ไฟล์`);
    }
  }
  // ST8
  {
    const p: string[] = [];
    const hc = srcOf(F.heldCart);
    if (!/\bposHeldCartExpireDays\s*\(/.test(hc)) p.push("held-cart.ts ไม่เรียก posHeldCartExpireDays");
    if (/heldCart\??\.\s*expireDays/.test(hc)) p.push("held-cart.ts ยังแกะ heldCart.expireDays เอง");
    if (!exportsFn(srcOf(F.regShared), "posHeldCartExpireDays")) p.push("register-shared.ts ไม่ export posHeldCartExpireDays");
    const rp = srcOf(F.reports);
    if (/const\s+DAY_CUTOFF_MINUTES\s*=\s*0\b/.test(rp)) p.push("reports.ts ยังมี DAY_CUTOFF_MINUTES = 0 คงที่");
    if (!/\bposDayCutoffMinutes\b/.test(rp)) p.push("reports.ts ไม่ใช้ posDayCutoffMinutes");
    const sv = srcOf(F.service);
    const ci = sv.indexOf("export async function closeDaySummary");
    const cBody = ci >= 0 ? sv.slice(ci, sv.indexOf("\n}", ci)) : "";
    if (!/dayCutoff|DayCutoff|cutoff/i.test(cBody) && !/posDayCutoffMinutes/.test(sv)) p.push("service.ts closeDaySummary ไม่อ่านค่าตัดวัน");
    const it = srcOf(F.intent);
    const a = it.search(/\bpromptpayIdForUnit\s*\(/), b = it.search(/paymentProfile\s*\.\s*findUnique/);
    if (a < 0) p.push("payment-intent.ts ไม่เรียก promptpayIdForUnit");
    else if (b >= 0 && a > b) p.push("payment-intent.ts อ่านโปรไฟล์ก่อนเลขสาขา");
    chk("ST8", p.length === 0, "ตัวอ่านเดียวต่อคีย์ · ตัดวัน/พร้อมเพย์อ่านค่าตั้ง", joinP(p) || "ครบ");
  }
  // ST9
  {
    const p: string[] = [];
    const rr = srcOf(F.render);
    const pi = rr.indexOf("export type ReceiptPayload");
    const pBody = pi >= 0 ? rr.slice(pi, rr.indexOf("\n};", pi)) : "";
    if (!/\bprintLocale\??\s*:/.test(pBody)) p.push("ReceiptPayload ไม่มี printLocale");
    if (!/printLocale/.test(srcOf(F.receipt))) p.push("receipt.ts ไม่ตั้ง printLocale");
    for (const f of [F.printBrowser, F.printEscpos]) if (!/printLocale/.test(srcOf(f))) p.push(`${f.split("/").pop()} ไม่ใช้ payload.printLocale`);
    const lc = srcOf(F.localeCookies);
    if (!lc) p.push(`ไม่มี ${F.localeCookies}`);
    else {
      if (!exportsFn(lc, "nextLocaleCookies")) p.push("locale-cookies.ts ไม่ export nextLocaleCookies");
      if (!isPureSrc(lc) || isUseServer(rd(F.localeCookies))) p.push("locale-cookies.ts ไม่บริสุทธิ์");
    }
    chk("ST9", p.length === 0, "printLocale ตลอดทางพิมพ์ · ตัวช่วยคุกกี้บริสุทธิ์", joinP(p) || "ครบ");
  }
  // ST10
  {
    const p: string[] = [];
    const g = srcOf(F.general);
    if (!g) p.push(`ไม่มี ${F.general}`);
    else {
      if (!/FOR\s+UPDATE/.test(g)) p.push("settings-general.ts ไม่ล็อกแถว FOR UPDATE");
      if (!/jsonb_set/.test(g)) p.push("settings-general.ts ไม่ใช้ jsonb_set");
      if (/\.appSystem\s*\.\s*update\s*\(\s*\{[^)]*settings/.test(g)) p.push("settings-general.ts เขียน settings ทั้งก้อนด้วย appSystem.update");
      if (!/writeAudit\s*\(/.test(g) || !g.includes(AUDIT_SETTINGS)) p.push(`settings-general.ts ไม่เขียน audit ${AUDIT_SETTINGS}`);
    }
    for (const f of [F.rcptSettings, F.paySettings]) {
      const s = srcOf(f);
      if (!s.includes(AUDIT_SETTINGS) || !/writeAudit\s*\(/.test(s)) p.push(`${f.split("/").pop()} ไม่เขียน audit ${AUDIT_SETTINGS}`);
    }
    chk("ST10", p.length === 0, "jsonb_set + FOR UPDATE + audit ทุกตัวเขียน", joinP(p) || "ครบ");
  }
  // ST11
  {
    const p: string[] = [];
    const sp = srcOf(F.salesPage);
    if (!/\bposSalesReadScope\s*\(/.test(sp)) p.push("pos/sales/page.tsx ไม่ใช้ posSalesReadScope");
    if (/\bposSalesScope\s*\(/.test(sp)) p.push("pos/sales/page.tsx ยังใช้ posSalesScope (pos.sale.create อย่างเดียว)");
    const st = srcOf(F.settingsPage);
    if (/canEditReceipt\s*=\s*evaluate\(\s*m\s*,\s*\{\s*module:\s*"pos"\s*,\s*action:\s*"pos\.device\.manage"\s*\}\s*\)/.test(st)) p.push("settings/page.tsx ยังคิด canEditReceipt ระดับร้าน (FU-c)");
    if (!/canEdit\??\.\s*receipt|canManageAllLinkedUnits|posSettingsOverview/.test(st)) p.push("settings/page.tsx ไม่ใช้ canEdit.receipt / canManageAllLinkedUnits");
    chk("ST11", p.length === 0, "ประตู /pos/sales = read|create · canEditReceipt = ครบทุกสาขา", joinP(p) || "ครบ");
  }
}

// ═════════════════════════ 1b. ตัวอ่านบริสุทธิ์ (ไม่แตะ DB) ═════════════════════════
const PURE_IDS = ["B1", "B2", "B3", "L1", "V1"].map((x) => `P1.18-${x}`);
const STATIC_IDS = CHECKS.map(([id]) => id).filter((id) => /^P1\.18-ST\d+$/.test(id));
type PureMods = { regShared: Any; shared: Any; intentShared: Any; locale: Any; access: Any };
async function loadPure(): Promise<PureMods> {
  const imp = async (f: string, spec: string): Promise<Any> => {
    if (!existsSync(join(ROOT, f))) return null;
    if (!isPureSrc(srcOf(f))) {
      console.log(`  ⚠️  ${f} ไม่บริสุทธิ์ — ไม่โหลดในโหมดบริสุทธิ์`);
      return null;
    }
    return tryImport(spec);
  };
  return {
    regShared: await imp(F.regShared, "@/lib/modules/pos/register-shared"),
    shared: await imp(F.shared, "@/lib/modules/pos/settings-shared"),
    intentShared: await imp(F.intentShared, "@/lib/modules/pos/payment-intent-shared"),
    locale: await imp(F.localeCookies, "@/i18n/locale-cookies"),
    access: await imp(F.access, "@/lib/modules/pos/access"),
  };
}
const posS = (pos: Record<string, unknown>) => ({ pos });
async function runPure(m: PureMods, units: { u1: string; u2: string }): Promise<void> {
  console.log("\n── B L V ตัวอ่านบริสุทธิ์ ──");
  // B1
  {
    const NS = has(m.regShared, "posHeldCartExpireDays") ? "" : `${MISSING} posHeldCartExpireDays (register-shared.ts) · `;
    const p: string[] = [];
    const f = (s: unknown) => callSync(m.regShared, "posHeldCartExpireDays", s);
    const cases: [string, unknown, number][] = [
      ["ไม่ตั้ง", {}, 2], ["null", null, 2], ["1", posS({ heldCart: { expireDays: 1 } }), 1], ["365", posS({ heldCart: { expireDays: 365 } }), 365],
      ["0", posS({ heldCart: { expireDays: 0 } }), 2], ["366", posS({ heldCart: { expireDays: 366 } }), 2], ["2.5", posS({ heldCart: { expireDays: 2.5 } }), 2],
      ["\"3\"", posS({ heldCart: { expireDays: "3" } }), 2], ["ที่อื่น", posS({ expireDays: 9, register: { expireDays: 9 } }), 2],
    ];
    if (!NS) for (const [lbl, s, want] of cases) {
      const v = f(s);
      if (v !== want) p.push(`${lbl} → ${short(v, 40)} (คาด ${want})`);
    }
    chk("B1", NS === "" && p.length === 0, "ค่าปริยาย 2 · ช่วง 1–365", NS + (p.join(" · ") || (NS ? "" : "ครบ")));
  }
  // B2
  {
    const NS = (has(m.shared, "posReceiptLocale") ? "" : `${MISSING} posReceiptLocale · `) + (has(m.shared, "posDayCutoffMinutes") ? "" : `${MISSING} posDayCutoffMinutes · `);
    const p: string[] = [];
    if (has(m.shared, "posReceiptLocale"))
      for (const [lbl, s, want] of [["ไม่ตั้ง", {}, "th"], ["null", null, "th"], ["en", posS({ receiptLocale: "en" }), "en"], ["th", posS({ receiptLocale: "th" }), "th"], ["EN", posS({ receiptLocale: "EN" }), "th"], ["jp", posS({ receiptLocale: "jp" }), "th"], ["1", posS({ receiptLocale: 1 }), "th"], ["ใต้ receipt", posS({ receipt: { receiptLocale: "en" } }), "th"]] as [string, unknown, string][]) {
        const v = callSync(m.shared, "posReceiptLocale", s);
        if (v !== want) p.push(`receiptLocale ${lbl} → ${short(v, 30)} (คาด ${want})`);
      }
    if (has(m.shared, "posDayCutoffMinutes"))
      for (const [lbl, s, want] of [["ไม่ตั้ง", {}, 0], ["240", posS({ reports: { dayCutoffMinutes: 240 } }), 240], ["360", posS({ reports: { dayCutoffMinutes: 360 } }), 360], ["0", posS({ reports: { dayCutoffMinutes: 0 } }), 0], ["361", posS({ reports: { dayCutoffMinutes: 361 } }), 0], ["-1", posS({ reports: { dayCutoffMinutes: -1 } }), 0], ["\"240\"", posS({ reports: { dayCutoffMinutes: "240" } }), 0], ["2.5", posS({ reports: { dayCutoffMinutes: 2.5 } }), 0], ["ระดับ pos", posS({ dayCutoffMinutes: 240 }), 0]] as [string, unknown, number][]) {
        const v = callSync(m.shared, "posDayCutoffMinutes", s);
        if (v !== want) p.push(`dayCutoff ${lbl} → ${short(v, 30)} (คาด ${want})`);
      }
    chk("B2", NS === "" && p.length === 0, "th ปริยาย · ตัดวัน 0–360 ปริยาย 0", NS + (p.join(" · ") || (NS ? "" : "ครบ")));
  }
  // B3
  {
    const NS = has(m.intentShared, "promptpayIdForUnit") ? "" : `${MISSING} promptpayIdForUnit (payment-intent-shared.ts) · `;
    const p: string[] = [];
    const s = posS({ payment: { promptpayIdByUnit: { [units.u1]: " 0898765432 ", [units.u2]: "", bad: 123 } } });
    if (!NS)
      for (const [lbl, set, u, want] of [
        ["สาขา 1", s, units.u1, "0898765432"], ["สาขา 2 ว่าง", s, units.u2, null], ["ไม่มีสาขา", s, "nope", null], ["ไม่ใช่สตริง", s, "bad", null],
        ["ไม่ตั้ง", {}, units.u1, null], ["แผนที่เป็นอาร์เรย์", posS({ payment: { promptpayIdByUnit: ["0898765432"] } }), "0", null], ["payment ไม่ใช่ออบเจกต์", posS({ payment: "x" }), units.u1, null],
      ] as [string, unknown, string, string | null][]) {
        const v = callSync(m.intentShared, "promptpayIdForUnit", set, u);
        if (v !== want) p.push(`${lbl} → ${short(v, 30)} (คาด ${short(want, 20)})`);
      }
    chk("B3", NS === "" && p.length === 0, "ค่าของสาขา (ตัดช่องว่าง) · อื่น null", NS + (p.join(" · ") || (NS ? "" : "ครบ")));
  }
  // L1
  {
    const NS = has(m.locale, "nextLocaleCookies") ? "" : `${MISSING} nextLocaleCookies (i18n/locale-cookies.ts) · `;
    const p: string[] = [];
    if (!NS) {
      for (const loc of ["en", "th"]) {
        const r = callSync(m.locale, "nextLocaleCookies", loc);
        const cs: Any[] = Array.isArray(r?.cookies) ? r.cookies : [];
        if (r?.ok !== true) p.push(`${loc} → ${codeOf(r)}`);
        for (const name of ["LOCALE", "lang"]) {
          const c = cs.find((x) => x?.name === name);
          if (!c || c.value !== loc || c.path !== "/" || c.maxAge !== 31_536_000 || c.sameSite !== "lax") p.push(`${loc} คุกกี้ ${name} ${short(c, 90)}`);
        }
        if (cs.length !== 2) p.push(`${loc} คุกกี้ ${cs.length} ตัว (คาด 2)`);
      }
      for (const bad of ["jp", "", null, "EN", 1]) {
        const r = callSync(m.locale, "nextLocaleCookies", bad);
        if (!refused(r, "VALIDATION")) p.push(`${short(bad, 10)} → ${codeOf(r)}${r?.threw ? " (throw)" : ""}`);
      }
    }
    chk("L1", NS === "" && p.length === 0, "LOCALE + lang · / · 1 ปี · lax · อื่น VALIDATION", NS + (p.join(" · ") || (NS ? "" : "ครบ")));
  }
  // V1
  {
    const NS = has(m.access, "posSalesReadScope") ? "" : `${MISSING} posSalesReadScope (pos/access.ts) · `;
    const p: string[] = [];
    if (!NS) {
      const mc = (role: string, ua: string[], perms: Record<string, boolean>) => ({ role, unitAccess: ua, permissions: perms });
      const rOnly = callSync(m.access, "posSalesReadScope", mc("STAFF", [units.u1], { "pos.sale.read": true }));
      if (rOnly?.allUnits !== false || short(rOnly?.unitIds) !== short([units.u1])) p.push(`read อย่างเดียว → ${short(rOnly, 80)}`);
      const cOnly = callSync(m.access, "posSalesReadScope", mc("STAFF", [units.u1, units.u2], { "pos.sale.create": true }));
      if (cOnly?.allUnits !== false || short([...(cOnly?.unitIds ?? [])].sort()) !== short([units.u1, units.u2].sort())) p.push(`create → ${short(cOnly, 80)}`);
      const mixed = callSync(m.access, "posSalesReadScope", mc("STAFF", [units.u1, units.u2], { "pos.shift.operate": true }));
      if (mixed !== null) p.push(`ไม่มีสิทธิ์ → ${short(mixed, 60)}`);
      const own = callSync(m.access, "posSalesReadScope", mc("OWNER", [], {}));
      if (own?.allUnits !== true) p.push(`OWNER → ${short(own, 60)}`);
      const old = callSync(m.access, "posSalesScope", mc("STAFF", [units.u1], { "pos.sale.read": true }));
      if (old !== null) p.push(`posSalesScope เดิมเปลี่ยน (read อย่างเดียว → ${short(old, 60)})`);
    }
    chk("V1", NS === "" && p.length === 0, "read|create ต่อสาขา · posSalesScope เดิมคงที่", NS + (p.join(" · ") || (NS ? "" : "ครบ")));
  }
}

// ═════════════════════════ 1c. --no-db ═════════════════════════
if (NODB) {
  const ids = [...STATIC_IDS, ...PURE_IDS];
  console.log(`[${SUITE}] --no-db: รัน ${ids.length} ข้อ (สถิต + ตัวอ่านบริสุทธิ์ · ไม่โหลด prisma)${U_PHASE ? " · เฟส U" : " · เฟส S"}`);
  let crashedS = "";
  try {
    await runStatic();
    await runPure(await loadPure(), { u1: "unit-qc-1", u2: "unit-qc-2" });
  } catch (e) {
    crashedS = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
    console.log(`💥 harness: ${crashedS}`);
  }
  for (const id of ids) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashedS ? `ไม่ถึง (harness ล้ม: ${crashedS.slice(0, 80)})` : "ไม่ถึง");
  const failedN = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failedN.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", phase: U_PHASE ? "U" : "S", total: results.size, passed: results.size - failedN.length, failed: failedN, skipped: false, registered: CHECKS.length, missing: skipReasons })}`);
  process.exit(failedN.length ? 1 : 0);
}

// ═════════════════════════ 2. env (QC4 เท่านั้น) ═════════════════════════
const envMod = (await import("./pos-qc-env.mjs" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
const TIDS = envMod.PQC_TENANT_IDS as string[];
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

// ═════════════════════════ 3. ด่าน SKIP + ลายนิ้วมือก่อน ═════════════════════════
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const FP_MODELS = ["appSystem", "businessUnit", "accountSystemLink", "approvalPolicy", "posStaffPin", "paymentProfile"] as const;
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const m of FP_MODELS) {
    const d = P[m];
    if (typeof d?.findMany !== "function") {
      out[m] = "absent";
      continue;
    }
    try {
      const rows = (await d.findMany({ where: { tenantId: { in: TIDS } }, orderBy: { id: "asc" } })) as Any[];
      out[m] = `${rows.length}:${createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 16)}`;
    } catch (e) {
      out[m] = `err:${(e as Error).message.slice(0, 40)}`;
    }
  }
  return out;
}
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P1.18 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const ex = (f: string) => existsSync(join(ROOT, f));
const genMod = ex(F.general) ? await tryImport("@/lib/modules/pos/settings-general") : null;
const ovMod = ex(F.overview) ? await tryImport("@/lib/modules/pos/settings-overview") : null;
const sharedMod = ex(F.shared) ? await tryImport("@/lib/modules/pos/settings-shared") : null;
const rootMod = ex(F.root) ? await tryImport("@/lib/pos-integrations") : null;
const localeMod = ex(F.localeCookies) ? await tryImport("@/i18n/locale-cookies") : null;
const regShared = await tryImport("@/lib/modules/pos/register-shared");
const intentShared = await tryImport("@/lib/modules/pos/payment-intent-shared");
const accessMod = await tryImport("@/lib/modules/pos/access");
const register = await tryImport("@/lib/modules/pos/register");
const heldMod = await tryImport("@/lib/modules/pos/held-cart");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const scanMod = await tryImport("@/lib/modules/pos/scan-shared");
const svcMod = await tryImport("@/lib/modules/pos/service");
const devMod = await tryImport("@/lib/modules/pos/device");
const staffMod = await tryImport("@/lib/modules/pos/staff-pin");
const rcptSetMod = await tryImport("@/lib/modules/pos/receipt-settings");
const payMod = await tryImport("@/lib/modules/pos/payment-settings");
const intentMod = await tryImport("@/lib/modules/pos/payment-intent");
const rcpMod = await tryImport("@/lib/modules/pos/receipt");
const renderMod = await tryImport("@/lib/modules/pos/receipt-render");
const reportsMod = await tryImport("@/lib/modules/pos/reports");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const apSvc = await tryImport("@/lib/modules/approval/service");
const apFacade = await tryImport("@/lib/modules/approval");
const ppLib = await tryImport("@/lib/payment/promptpay");
const consMod = await tryImport("@/lib/outbox-consumers");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p1.18-${RAND}`;
const T_SLUG = `posqc-p118-${RAND}`;
const T2_SLUG = `posqc-p118b-${RAND}`;
const EMAIL_PREFIX = `${T_SLUG}-`;
const sleep = (n: number) => new Promise((r) => setTimeout(r, n));
let T = "";
let T2 = "";
const RUN_START = Date.now();
const MY_IDS: string[] = []; // id ของรอบนี้ (ระบบ/สาขา) — Z2 ตามหาในร้าน seed

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
    return new Response(`blocked by ${SUITE}`, { status: 503 });
  }) as typeof fetch;
}
function removeFetchGuard() {
  globalThis.fetch = realFetch;
}
async function drain(): Promise<void> {
  for (let i = 0; i < 2; i++) {
    try {
      if (typeof consMod?.drainAll === "function") await consMod.drainAll();
    } catch (e) {
      console.log(`  (drainAll ล้ม: ${(e as Error).message.slice(0, 100)})`);
    }
  }
}

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !STATIC_IDS.includes(id) && !PURE_IDS.includes(id) && id !== "P1.18-Z1" && id !== "P1.18-Z2");
const dataRefusals: [string, Any][] = [];
const keep = (label: string, r: Any) => {
  if (r?.ok === false && !r.missing) dataRefusals.push([label, r]);
  return r;
};

async function runDb() {
  assertQc4BeforeWrite();
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (+ ${T2_SLUG}) · DB ${HOST} ──`);
  console.log("   POS X (U1 U2) · POS Y (U3) · U1: สมาชิก แต้ม คูปอง คลัง รางวัล1 · U2: รางวัล2 · บัญชี VAT ผูก X · CRM (ประตูปิด) · KANBAN + บอร์ด · HR · BOOKING · ไม่มี CHAT/MARKETING");
  let fx = "";
  const U: Record<string, string> = {};
  const S: Record<string, string> = {};
  const NAME: Record<string, string> = {};
  const US: Record<string, { id: string; name: string; role: string; unitAccess: string[]; perms: Record<string, boolean>; mid: string }> = {};
  let boardId = "";
  try {
    const t = await P.tenant.create({ data: { name: `QC P1.18 ตั้งค่า ${RAND}`, slug: T_SLUG, limits: { posDevices: 10 } } });
    T = t.id;
    const t2 = await P.tenant.create({ data: { name: `QC P1.18 ร้านอื่น ${RAND}`, slug: T2_SLUG } });
    T2 = t2.id;
    for (const k of ["U1", "U2", "U3"]) U[k] = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขา${k}`, slug: `${T_SLUG}-${k.toLowerCase()}` } })).id;
    U.UB = (await P.businessUnit.create({ data: { tenantId: T, type: "BOOKING", name: `${TAG} คิว`, slug: `${T_SLUG}-ub` } })).id;
    const sys = async (k: string, type: string, name: string) => {
      S[k] = (await sysSvc.createSystem(T, type, name)).id;
      NAME[k] = name;
    };
    await sys("X", "POS", `POS X ${RAND}`);
    await sys("Y", "POS", `POS Y ${RAND}`);
    await sys("MEM", "MEMBER", `สมาชิก ${RAND}`);
    await sys("PTS", "POINT", `แต้ม ${RAND}`);
    await sys("CPN", "COUPON", `คูปอง ${RAND}`);
    await sys("INV", "INVENTORY", `คลัง ${RAND}`);
    await sys("RW1", "REWARD", `รางวัล1 ${RAND}`);
    await sys("RW2", "REWARD", `รางวัล2 ${RAND}`);
    await sys("ACC", "ACCOUNT", `บัญชี ${RAND}`);
    await sys("CRM", "CRM", `CRM ${RAND}`);
    await sys("KB", "KANBAN", `บอร์ด ${RAND}`);
    await sys("HR", "HR", `HR ${RAND}`);
    await sys("BKG", "BOOKING", `จอง ${RAND}`);
    await sysSvc.linkUnit(T, S.X, U.U1);
    await sysSvc.linkUnit(T, S.X, U.U2);
    await sysSvc.linkUnit(T, S.Y, U.U3);
    for (const k of ["MEM", "PTS", "CPN", "INV", "RW1"]) await sysSvc.linkUnit(T, S[k], U.U1);
    await sysSvc.linkUnit(T, S.RW2, U.U2);
    await accSvc.saveSettings(T, S.ACC, { orgName: `ร้านตั้งค่าคิวซี ${RAND} จำกัด`, taxId: "0105561177639", vatRegistered: true });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.X } });
    await P.pointSettings.upsert({ where: { tenantId: T }, create: { tenantId: T, satangPerPoint: 1000 }, update: { satangPerPoint: 1000 } });
    await P.paymentProfile.create({ data: { tenantId: T, promptpayId: "0812345678", displayName: `ร้านคิวซี ${RAND}` } });
    boardId = (await P.kanbanBoard.create({ data: { tenantId: T, systemId: S.KB, name: `รับเรื่อง ${RAND}` } })).id;
    // คีย์พี่น้องที่ต้องรอด (B5) — ระดับบน + ใต้ pos (ไม่ตั้ง registerV2 · ไม่ตั้ง discount)
    await P.appSystem.update({ where: { id: S.X }, data: { settings: { qcTop: { marker: RAND }, pos: { qcKeep: { marker: RAND, n: [1, 2] }, serviceCharge: { enabled: false, rateBp: 500 }, payment: { qrExpiryMinutes: 15 } } } } });
    await P.businessUnit.update({ where: { id: U.U1 }, data: { settings: { qcUnit: { marker: RAND }, pos: { qcKeepUnit: 1 } } } });
    MY_IDS.push(...Object.values(S), ...Object.values(U));
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  // ผู้ใช้ + Membership จริง
  const SELL = { "pos.sale.create": true, "pos.sale.read": true, "pos.shift.operate": true, "pos.sale.priceOverride": true };
  const spec: [string, string, string[], Record<string, boolean>][] = [
    ["OWNER", "OWNER", ["*"], {}],
    ["MGR", "MANAGER", [U.U1!, U.U2!], {}],
    ["MGR1", "MANAGER", [U.U1!], {}],
    ["MGRA", "MANAGER", [U.U1!, U.U2!], { "account.settings.manage": true }],
    ["C1", "STAFF", [U.U1!], { ...SELL }],
    ["C2", "STAFF", [U.U1!], { ...SELL }],
    ["S2", "STAFF", [U.U1!], { "pos.sale.create": true, [PERM_MANAGE]: true }],
    ["S3", "STAFF", [U.U1!, U.U2!], { "pos.sale.create": true, [PERM_MANAGE]: true }],
    ["SX", "STAFF", [U.U1!], { "pos.shift.operate": true }],
    ["SACC", "STAFF", [U.U1!, U.U2!], { "account.settings.manage": true, [PERM_MANAGE]: true }],
  ];
  if (!fx) {
    try {
      for (const [k, role, unitAccess, perms] of spec) {
        const email = `${EMAIL_PREFIX}${k.toLowerCase()}@qc.invalid`;
        const name = `${k} คิวซี${RAND}`;
        const u = await P.user.create({ data: { email, name } });
        const m = await P.membership.create({ data: { userId: u.id, tenantId: T, role, unitAccess, permissions: perms, acceptedAt: new Date() } });
        US[k] = { id: u.id, name, role, unitAccess, perms, mid: m.id };
      }
    } catch (e) {
      fx = `ผู้ใช้:${(e as Error).message.slice(0, 140)}`;
    }
  }
  const A = (k: string): Any => (US[k] ? { userId: US[k]!.id, role: US[k]!.role, unitAccess: [...US[k]!.unitAccess], permissions: { ...US[k]!.perms } } : { userId: `none-${k}`, role: "STAFF", unitAccess: [], permissions: {} });
  const uid = (k: string) => US[k]?.id ?? `none-${k}`;
  const DEV1 = `qc118${RAND}d1`, DEV2 = `qc118${RAND}d2`, DEV3 = `qc118${RAND}d3`;
  const sctx = (k = "X"): Any => ({ tenantId: T, systemId: S[k] ?? "none" });
  const uctx = (u: string, k = "X", dev?: string): Any => ({ tenantId: T, systemId: S[k] ?? "none", unitId: U[u] ?? "none", ...(dev ? { deviceId: dev } : {}) });
  let shift1 = "";
  if (!fx) {
    for (const [d, u] of [[DEV1, "U1"], [DEV2, "U1"], [DEV3, "U2"]] as const) {
      const rg = await call(devMod, "registerDevice", uctx(u), A("OWNER"), { name: `เครื่อง QC ${d.slice(-2)}`, deviceCode: d });
      if (rg?.ok !== true) console.log(`  ⚠️  registerDevice ${d}: ${codeOf(rg)} ${short(rg?.message ?? "", 80)}`);
    }
    const o1 = await call(shiftMod, "openShift", uctx("U1", "X", DEV1), A("OWNER"), { deviceId: DEV1, deviceLabel: "เครื่อง QC 1", floatSatang: 0 });
    if (o1?.ok !== true) fx = `เปิดกะเครื่อง 1: ${codeOf(o1)} ${short(o1?.message ?? "", 80)}`;
    else shift1 = String(o1.shift?.id ?? "");
  }
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const NEED = (...xs: [unknown, string][]) => xs.filter(([v]) => !v).map(([, l]) => `${MISSING} ${l} · `).join("");

  // ── ตัวช่วยอ่าน ──
  const sysSet = async (k: string): Promise<Any> => ((await P.appSystem.findUnique({ where: { id: S[k] }, select: { settings: true } }).catch(() => null)) as Any)?.settings ?? null;
  const unitSet = async (u: string): Promise<Any> => ((await P.businessUnit.findUnique({ where: { id: U[u] }, select: { settings: true } }).catch(() => null)) as Any)?.settings ?? null;
  const audits = async (action: string, pred: (a: Any) => boolean = () => true): Promise<Any[]> =>
    T ? ((await P.auditLog.findMany({ where: { tenantId: T, action }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }).catch(() => [])) as Any[]).filter(pred) : [];
  const settingsAudits = async (section?: string, targetId?: string) => audits(AUDIT_SETTINGS, (a) => (!section || a.after?.section === section) && (!targetId || a.targetId === targetId));
  const OWNED = new Set(["heldCart", "register", "shift", "weighedBarcode", "receiptLocale", "reports"]);
  const siblingsOf = (s: Any): string => {
    if (!isRecord(s)) return canon(s);
    const pos = isRecord(s.pos) ? Object.fromEntries(Object.entries(s.pos).filter(([k]) => !OWNED.has(k))) : s.pos;
    return canon({ ...s, pos });
  };
  const gen = (actorKey: string, patch: unknown, k = "X") => call(genMod, "updatePosGeneralSettings", sctx(k), A(actorKey), patch);
  const caps = (actorKey: string, patch: unknown) => call(genMod, "updatePosDiscountCaps", sctx(), A(actorKey), patch);
  const unitStock = (actorKey: string, u: string, policy: unknown) => call(genMod, "updatePosUnitStockPolicy", sctx(), A(actorKey), { unitId: U[u] ?? u, oversellPolicy: policy });
  const overview = (actorKey: string, u = "U1", k = "X", tenant = T) => call(ovMod, "posSettingsOverview", { tenantId: tenant, systemId: S[k] ?? k, unitId: U[u] ?? u }, A(actorKey), {});
  const cards = (actorKey: string, u = "U1", opts?: Any, k = "X", tenant = T) => call(rootMod, "posIntegrationCards", { tenantId: tenant, systemId: S[k] ?? k, unitId: U[u] ?? u }, A(actorKey), {}, ...(opts ? [opts] : []));
  const cardOf = (r: Any, code: string): Any => (Array.isArray(r?.cards) ? r.cards.find((c: Any) => c?.code === code) : null) ?? null;
  const NG = NEED([has(genMod, "updatePosGeneralSettings"), "updatePosGeneralSettings (settings-general.ts)"]);
  const NO = NEED([has(ovMod, "posSettingsOverview"), "posSettingsOverview (settings-overview.ts)"]);
  const NI = NEED([has(rootMod, "posIntegrationCards"), "posIntegrationCards (pos-integrations.ts)"]);

  // ════════ B4 ไป-กลับ · B5 คีย์พี่น้อง · G1 audit ════════
  const PATCH_ALL = {
    heldCartExpireDays: 9,
    autoLockMinutes: 7,
    shift: { requiredRegister: false, requiredOtherSources: true, blindClose: true, overShortReasonSatang: 25_000, forceCloseAfterHours: 36 },
    weighedBarcode: { enabled: true, rules: [{ prefix: "21", kind: "WEIGHT" }, { prefix: "28", kind: "PRICE" }] },
    receiptLocale: "en",
    dayCutoffMinutes: 0,
  };
  {
    const p: string[] = [];
    const before = await sysSet("X");
    const unitBefore = canon(await unitSet("U1"));
    const ySet = canon(await sysSet("Y"));
    const a0 = (await settingsAudits("general", S.X)).length;
    const r = keep("B4 เขียนครบ", await gen("OWNER", PATCH_ALL));
    if (r?.ok !== true) p.push(`เขียน → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    const after = await sysSet("X");
    const readers: [string, unknown, unknown][] = [
      ["posHeldCartExpireDays", callSync(regShared, "posHeldCartExpireDays", after), 9],
      ["posRegisterAutoLockMinutes", callSync(regShared, "posRegisterAutoLockMinutes", after), 7],
      ["parseShiftSettings", canon(callSync(shiftMod, "parseShiftSettings", after)), canon(PATCH_ALL.shift)],
      ["weighedBarcodeSettings", canon(callSync(scanMod, "weighedBarcodeSettings", after)), canon(PATCH_ALL.weighedBarcode)],
      ["posReceiptLocale", callSync(sharedMod, "posReceiptLocale", after), "en"],
      ["posDayCutoffMinutes", callSync(sharedMod, "posDayCutoffMinutes", after), 0],
    ];
    for (const [n, got, want] of readers) if (got !== want) p.push(`${n} → ${short(got, 80)} (คาด ${short(want, 80)})`);
    const lh = await call(heldMod, "listHeldCarts", uctx("U1", "X", DEV1), A("OWNER"));
    if (lh?.expireDays !== 9) p.push(`listHeldCarts.expireDays ${short(lh?.expireDays ?? codeOf(lh), 30)}`);
    const g = r?.general;
    if (r?.ok === true && (!isRecord(g) || canon({ heldCartExpireDays: g.heldCartExpireDays, autoLockMinutes: g.autoLockMinutes, shift: g.shift, weighedBarcode: g.weighedBarcode, receiptLocale: g.receiptLocale, dayCutoffMinutes: g.dayCutoffMinutes }) !== canon(PATCH_ALL)))
      p.push(`result.general ${short(g, 120)}`);
    // แพตช์บางส่วน
    const r2 = keep("B4 บางส่วน", await gen("OWNER", { shift: { blindClose: false } }));
    if (r2?.ok !== true) p.push(`แพตช์บางส่วน → ${codeOf(r2)}`);
    const sh2 = callSync(shiftMod, "parseShiftSettings", await sysSet("X"));
    if (canon(sh2) !== canon({ ...PATCH_ALL.shift, blindClose: false })) p.push(`บางส่วน: shift ${short(sh2, 120)}`);
    chk("B4", NG === "" && p.length === 0, "ตัวอ่านของผู้ใช้ทุกตัว = ค่าที่เขียน", FX(NG + (joinP(p) || "ครบ")));
    // B5
    {
      const q: string[] = [];
      if (siblingsOf(before) !== siblingsOf(await sysSet("X"))) q.push(`คีย์พี่น้องเปลี่ยน: ${short(siblingsOf(before), 90)} → ${short(siblingsOf(await sysSet("X")), 90)}`);
      if (canon(await unitSet("U1")) !== unitBefore) q.push("BusinessUnit U1 settings เปลี่ยน");
      if (canon(await sysSet("Y")) !== ySet) q.push("POS Y settings เปลี่ยน");
      if (r?.ok !== true) q.push("(ไม่ได้เขียน)");
      chk("B5", NG === "" && q.length === 0, "พี่น้อง byte-identical · สาขา/Y ไม่ถูกแตะ", FX(NG + (q.join(" · ") || "ครบ")));
    }
    // G1
    {
      const q: string[] = [];
      const rows = (await settingsAudits("general", S.X)).slice(a0);
      if (rows.length !== 2) q.push(`audit general ${rows.length} แถว (คาด 2: ครบ + บางส่วน)`);
      const x = rows[0];
      if (x && (x.targetType !== "AppSystem" || x.actorId !== uid("OWNER") || x.before?.section !== "general")) q.push(`แถว ${short({ t: x.targetType, a: x.actorId === uid("OWNER"), b: x.before?.section }, 90)}`);
      if (x && !short(x.after, 4000).includes('"autoLockMinutes":7')) q.push(`after ไม่มี autoLockMinutes 7 (${short(x.after, 80)})`);
      chk("G1", NG === "" && q.length === 0, "audit 1 แถวต่อการเขียน · AppSystem X · ผู้เขียน · section", FX(NG + (q.join(" · ") || "ครบ")));
    }
  }
  // ════════ B6 VALIDATION matrix ════════
  {
    const p: string[] = [];
    const before = canon(await sysSet("X"));
    const a0 = (await audits(AUDIT_SETTINGS)).length;
    const bad: [string, unknown, string | null][] = [
      ["expire 0", { heldCartExpireDays: 0 }, "heldCartExpireDays"],
      ["expire 366", { heldCartExpireDays: 366 }, "heldCartExpireDays"],
      ["expire \"3\"", { heldCartExpireDays: "3" }, "heldCartExpireDays"],
      ["expire 2.5", { heldCartExpireDays: 2.5 }, "heldCartExpireDays"],
      ["autoLock 61", { autoLockMinutes: 61 }, "autoLockMinutes"],
      ["autoLock -1", { autoLockMinutes: -1 }, "autoLockMinutes"],
      ["overShort -1", { shift: { overShortReasonSatang: -1 } }, "shift.overShortReasonSatang"],
      ["overShort > ฿100,000", { shift: { overShortReasonSatang: 10_000_001 } }, "shift.overShortReasonSatang"],
      ["forceClose 0", { shift: { forceCloseAfterHours: 0 } }, "shift.forceCloseAfterHours"],
      ["forceClose 73", { shift: { forceCloseAfterHours: 73 } }, "shift.forceCloseAfterHours"],
      ["blindClose \"yes\"", { shift: { blindClose: "yes" } }, "shift.blindClose"],
      ["shift.foo", { shift: { foo: true } }, "shift.foo"],
      ["prefix 30", { weighedBarcode: { enabled: true, rules: [{ prefix: "30", kind: "WEIGHT" }] } }, "weighedBarcode.rules"],
      ["prefix ซ้ำ", { weighedBarcode: { enabled: true, rules: [{ prefix: "21", kind: "WEIGHT" }, { prefix: "21", kind: "PRICE" }] } }, "weighedBarcode.rules"],
      ["wb enabled \"true\"", { weighedBarcode: { enabled: "true", rules: [] } }, "weighedBarcode.enabled"],
      ["receiptLocale jp", { receiptLocale: "jp" }, "receiptLocale"],
      ["cutoff 361", { dayCutoffMinutes: 361 }, "dayCutoffMinutes"],
      ["cutoff \"240\"", { dayCutoffMinutes: "240" }, "dayCutoffMinutes"],
      ["คีย์แปลก foo", { foo: 1 }, "foo"],
      ["registerV2 (มติ Q10)", { registerV2: true }, "registerV2"],
      ["serviceCharge (เงิน)", { serviceCharge: { enabled: true, rateBp: 1000 } }, "serviceCharge"],
      ["null", null, null],
    ];
    for (const [lbl, patch, field] of bad) {
      const r = keep(`B6 ${lbl}`, await gen("OWNER", patch));
      if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)}${r?.threw ? " (throw)" : ""}`);
      else if (field && r.field !== field) p.push(`${lbl} field ${short(r.field, 30)} (คาด ${field})`);
    }
    if (canon(await sysSet("X")) !== before) p.push("settings เปลี่ยนหลังคำปฏิเสธ");
    if ((await audits(AUDIT_SETTINGS)).length !== a0) p.push("มี audit จากคำปฏิเสธ");
    chk("B6", NG === "" && p.length === 0, `${bad.length} แบบ VALIDATION + field · ไม่เขียน · ไม่มี audit`, FX(NG + (joinP(p) || "ครบ")));
  }
  // ════════ B7 ค่าปริยาย (POS Y) ════════
  {
    const p: string[] = [];
    const r = await overview("OWNER", "U3", "Y");
    const want = { heldCartExpireDays: 2, autoLockMinutes: 2, shift: { requiredRegister: false, requiredOtherSources: false, blindClose: false, overShortReasonSatang: 10_000, forceCloseAfterHours: 24 }, weighedBarcode: { enabled: false, rules: [] }, receiptLocale: "th", dayCutoffMinutes: 0 };
    if (r?.ok !== true) p.push(`overview Y → ${codeOf(r)}`);
    else {
      const g = r.general ?? {};
      const got = { heldCartExpireDays: g.heldCartExpireDays, autoLockMinutes: g.autoLockMinutes, shift: g.shift, weighedBarcode: g.weighedBarcode, receiptLocale: g.receiptLocale, dayCutoffMinutes: g.dayCutoffMinutes };
      if (canon(got) !== canon(want)) p.push(`general ${short(got, 160)}`);
      if (canon(r.caps) !== canon({ STAFF: 1000, MANAGER: 10_000, OWNER: 10_000 })) p.push(`caps ${short(r.caps, 80)}`);
    }
    chk("B7", NO === "" && p.length === 0, "ค่าปริยายทุกคีย์", FX(NO + (p.join(" · ") || "ครบ")));
  }
  // ════════ G2 G3 สิทธิ์ตัวเขียนทั่วไป ════════
  {
    const p: string[] = [];
    for (const [k, v] of [["MGR", 3], ["S3", 4]] as const) {
      const r = keep(`G2 ${k}`, await gen(k, { autoLockMinutes: v }));
      if (r?.ok !== true) p.push(`${k} → ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
      else if (callSync(regShared, "posRegisterAutoLockMinutes", await sysSet("X")) !== v) p.push(`${k} เขียนแล้วอ่านไม่ได้ ${v}`);
    }
    chk("G2", NG === "" && p.length === 0, "MANAGER ครบสาขา + STAFF ที่มี pos.settings.manage ครบสาขา เขียนได้", FX(NG + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const before = canon(await sysSet("X"));
    const a0 = (await audits(AUDIT_SETTINGS)).length;
    for (const k of ["MGR1", "C1", "S2"]) {
      const r = keep(`G3 ${k}`, await gen(k, { autoLockMinutes: 11 }));
      if (!refused(r, "PERMISSION_DENIED")) p.push(`${k} → ${codeOf(r)}`);
    }
    if (canon(await sysSet("X")) !== before) p.push("settings เปลี่ยน");
    if ((await audits(AUDIT_SETTINGS)).length !== a0) p.push("มี audit");
    chk("G3", NG === "" && p.length === 0, "PERMISSION_DENIED ×3 · ไม่เขียน", FX(NG + (p.join(" · ") || "ครบ")));
  }
  // ════════ G4 เขียนพร้อมกัน ════════
  {
    const p: string[] = [];
    const footer = `ท้ายใบคิวซี ${RAND}`;
    const [a, b, c] = await Promise.all([
      gen("OWNER", { autoLockMinutes: 13 }),
      call(rcptSetMod, "updatePosReceiptSettings", sctx(), A("OWNER"), { footer }),
      caps("OWNER", { STAFF: 1200 }),
    ]);
    for (const [n, r] of [["ทั่วไป", a], ["ใบเสร็จ", b], ["เพดาน", c]] as const) if (r?.ok !== true) p.push(`${n} → ${codeOf(r)}`);
    const s = await sysSet("X");
    if (callSync(regShared, "posRegisterAutoLockMinutes", s) !== 13) p.push("autoLock หาย");
    if (s?.pos?.receipt?.footer !== footer) p.push(`footer ${short(s?.pos?.receipt?.footer, 40)}`);
    if (callSync(regShared, "posDiscountCaps", s)?.STAFF !== 1200) p.push(`caps.STAFF ${short(callSync(regShared, "posDiscountCaps", s)?.STAFF, 10)}`);
    chk("G4", NG === "" && p.length === 0, "3 คีย์อยู่ครบหลังเขียนพร้อมกัน", FX(NG + (p.join(" · ") || "ครบ")));
  }
  // ════════ G5 no-op ════════
  {
    const p: string[] = [];
    const a0 = (await audits(AUDIT_SETTINGS)).length;
    const r = await gen("OWNER", { autoLockMinutes: 13, heldCartExpireDays: 9 });
    if (r?.ok !== true) p.push(`no-op → ${codeOf(r)}`);
    const n = (await audits(AUDIT_SETTINGS)).length - a0;
    if (n !== 0) p.push(`audit +${n}`);
    chk("G5", NG === "" && p.length === 0, "no-op ok · ไม่มี audit", FX(NG + (p.join(" · ") || "ครบ")));
  }
  // ════════ G6 ปิด requiredRegister ขณะกะเปิด ════════
  {
    const p: string[] = [];
    const r1 = await gen("OWNER", { shift: { requiredRegister: true } });
    const r2 = await gen("OWNER", { shift: { requiredRegister: false } });
    if (r1?.ok !== true || r2?.ok !== true) p.push(`เปิด/ปิด → ${codeOf(r1)} / ${codeOf(r2)}`);
    if (callSync(shiftMod, "parseShiftSettings", await sysSet("X"))?.requiredRegister !== false) p.push("requiredRegister ไม่เป็น false");
    const sh = shift1 ? await P.posShift.findUnique({ where: { id: shift1 } }).catch(() => null) : null;
    if (sh?.status !== "OPEN") p.push(`กะ ${short(sh?.status, 10)}`);
    chk("G6", NG === "" && !!shift1 && p.length === 0, "ปิดได้ขณะกะเปิด · กะยัง OPEN", FX(NG + (p.join(" · ") || "ครบ")));
  }

  // ════════ C เพดานส่วนลด ════════
  const NC = NEED([has(genMod, "updatePosDiscountCaps"), "updatePosDiscountCaps"]);
  const quote = (actorKey: string, pct: number) =>
    call(register, "quoteRegisterCart", uctx("U1", "X", DEV1), A(actorKey), { lines: [{ name: `C ส่วนลด ${RAND}`, qty: 1, unitPriceSatang: 20_000 }], billDiscount: { type: "PERCENT", value: pct } });
  {
    const p: string[] = [];
    // ตัวควบคุม: G4 ตั้ง STAFF 1200 ไว้ — ล้างกลับค่าปริยายก่อน (ตัวเขียนเอง)
    await caps("OWNER", { STAFF: 1000 });
    const q0 = await quote("C1", 1500);
    if (!refused(q0, "DISCOUNT_EXCEEDS_LIMIT")) p.push(`(ตัวควบคุม) ก่อนตั้ง 15% → ${codeOf(q0)}`);
    const a0 = (await settingsAudits("caps", S.X)).length;
    const r = keep("C1 ตั้ง", await caps("OWNER", { STAFF: 1500 }));
    if (r?.ok !== true || r.caps?.STAFF !== 1500) p.push(`ตั้ง → ${codeOf(r)} ${short(r?.caps, 60)}`);
    const s = await sysSet("X");
    if (callSync(regShared, "posDiscountCaps", s)?.STAFF !== 1500) p.push("posDiscountCaps.STAFF ไม่ใช่ 1500");
    const rc = await call(register, "registerDiscountCaps", sctx());
    if (rc?.STAFF !== 1500) p.push(`registerDiscountCaps ${short(rc, 60)}`);
    const q1 = await quote("C1", 1500);
    if (q1?.ok !== true) p.push(`quote 15% → ${codeOf(q1)}`);
    const q2 = await quote("C1", 2000);
    if (!refused(q2, "DISCOUNT_EXCEEDS_LIMIT")) p.push(`quote 20% → ${codeOf(q2)}`);
    if ((await settingsAudits("caps", S.X)).length - a0 !== 1) p.push("audit caps ไม่ใช่ 1");
    chk("C1", NC === "" && p.length === 0, "1500 → ตัวอ่าน + quote ถัดไปใช้", FX(NC + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const r2 = await caps("OWNER", { MANAGER: 3000 });
    if (r2?.ok !== true) p.push(`OWNER ตั้ง MANAGER 3000 → ${codeOf(r2)}`);
    const r1 = keep("C2 MGR ยก MGR", await caps("MGR", { MANAGER: 5000 }));
    if (!refused(r1, "PERMISSION_DENIED")) p.push(`MANAGER ยก MANAGER 3000→5000 → ${codeOf(r1)}`);
    const r3 = keep("C2 MGR ตั้ง STAFF เกิน", await caps("MGR", { STAFF: 4000 }));
    if (!refused(r3, "PERMISSION_DENIED")) p.push(`MANAGER ตั้ง STAFF 4000 → ${codeOf(r3)}`);
    const r4 = await caps("MGR", { STAFF: 2500 });
    if (r4?.ok !== true) p.push(`MANAGER ตั้ง STAFF 2500 → ${codeOf(r4)}`);
    const r5 = keep("C2 C1", await caps("C1", { STAFF: 100 }));
    if (!refused(r5, "PERMISSION_DENIED")) p.push(`STAFF → ${codeOf(r5)}`);
    const c = callSync(regShared, "posDiscountCaps", await sysSet("X"));
    if (c?.STAFF !== 2500 || c?.MANAGER !== 3000) p.push(`ค่าสุดท้าย ${short(c, 60)}`);
    await caps("OWNER", { MANAGER: 10_000, STAFF: 1000 });
    chk("C2", NC === "" && p.length === 0, "MANAGER ยกตัวเองไม่ได้ · STAFF ≤ เพดานผู้ตั้ง", FX(NC + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const r = keep("C3 OWNER cap", await caps("OWNER", { OWNER: 5000 }));
    if (!refused(r, "VALIDATION") || r.field !== "OWNER") p.push(`แพตช์ OWNER → ${codeOf(r)} field ${short(r?.field, 20)}`);
    if (callSync(regShared, "posDiscountCaps", await sysSet("X"))?.OWNER !== 10_000) p.push("OWNER cap ไม่ใช่ 10000");
    chk("C3", NC === "" && p.length === 0, "OWNER → VALIDATION field OWNER", FX(NC + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const before = canon(await sysSet("X"));
    for (const [lbl, patch] of [["-1", { STAFF: -1 }], ["10001", { STAFF: 10_001 }], ["2.5", { MANAGER: 2.5 }], ["\"1500\"", { STAFF: "1500" }], ["CASHIER", { CASHIER: 1500 }], ["คีย์แปลก", { KITCHEN: 100 }], ["null", null]] as [string, unknown][]) {
      const r = keep(`C4 ${lbl}`, await caps("OWNER", patch));
      if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    if (canon(await sysSet("X")) !== before) p.push("settings เปลี่ยน");
    chk("C4", NC === "" && p.length === 0, "VALIDATION ×7 ไม่เขียน", FX(NC + (p.join(" · ") || "ครบ")));
  }

  // ════════ U สต็อกสาขา ════════
  const NU = NEED([has(genMod, "updatePosUnitStockPolicy"), "updatePosUnitStockPolicy"]);
  const oversell = (u: string) => call(svcMod, "unitOversellPolicy", P, T, U[u]);
  {
    const p: string[] = [];
    const sysBefore = canon(await sysSet("X"));
    const unitBefore = await unitSet("U1");
    const a0 = (await settingsAudits("unitStock")).length;
    const r = keep("U1 BLOCK", await unitStock("OWNER", "U1", "BLOCK"));
    if (r?.ok !== true) p.push(`BLOCK → ${codeOf(r)}`);
    if ((await oversell("U1")) !== "BLOCK") p.push(`U1 ${await oversell("U1")}`);
    if ((await oversell("U2")) !== "ALLOW_NEGATIVE") p.push(`U2 ${await oversell("U2")}`);
    const au = (await settingsAudits("unitStock")).slice(a0);
    if (au.length !== 1 || au[0]?.targetType !== "BusinessUnit" || au[0]?.targetId !== U.U1) p.push(`audit ${au.length} ${short(au[0] && { t: au[0].targetType, id: au[0].targetId === U.U1 }, 60)}`);
    const back = await unitStock("OWNER", "U1", "ALLOW_NEGATIVE");
    if (back?.ok !== true || (await oversell("U1")) !== "ALLOW_NEGATIVE") p.push(`กลับ ALLOW_NEGATIVE → ${codeOf(back)}`);
    await unitStock("OWNER", "U1", "BLOCK");
    chk("U1", NU === "" && p.length === 0, "BLOCK ที่ U1 เท่านั้น · audit BusinessUnit", FX(NU + (p.join(" · ") || "ครบ")));
    // U3 (ไม่ถูกแตะ)
    const q: string[] = [];
    const ua = await unitSet("U1");
    const strip = (s: Any) => (isRecord(s) ? canon({ ...s, pos: isRecord(s.pos) ? Object.fromEntries(Object.entries(s.pos).filter(([k]) => k !== "stock")) : s.pos }) : canon(s));
    if (strip(ua) !== strip(unitBefore)) q.push(`คีย์อื่นของสาขาเปลี่ยน ${short(strip(unitBefore), 60)} → ${short(strip(ua), 60)}`);
    if (ua?.pos?.stock?.oversellPolicy !== "BLOCK" && r?.ok === true) q.push("pos.stock.oversellPolicy ไม่อยู่ที่ BusinessUnit.settings");
    if (canon(await sysSet("X")) !== sysBefore) q.push("AppSystem X เปลี่ยน");
    if (r?.ok !== true) q.push("(ไม่ได้เขียน)");
    chk("U3", NU === "" && q.length === 0, "เขียนเฉพาะ pos.stock ของสาขา", FX(NU + (q.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const r1 = await unitStock("S2", "U1", "ALLOW_NEGATIVE");
    if (r1?.ok !== true) p.push(`S2 ที่ U1 → ${codeOf(r1)}`);
    const r2 = keep("U2 S2 ที่ U2", await unitStock("S2", "U2", "BLOCK"));
    if (!refused(r2, "PERMISSION_DENIED")) p.push(`S2 ที่ U2 → ${codeOf(r2)}`);
    const r3 = keep("U2 U3", await unitStock("OWNER", "U3", "BLOCK"));
    if (!refused(r3, "NOT_FOUND")) p.push(`U3 (ไม่ผูก X) → ${codeOf(r3)}`);
    const r4 = keep("U2 NONE", await unitStock("OWNER", "U1", "NONE"));
    if (!refused(r4, "VALIDATION")) p.push(`NONE → ${codeOf(r4)}`);
    if ((await oversell("U2")) !== "ALLOW_NEGATIVE") p.push("U2 เปลี่ยน");
    if ((await oversell("U3")) !== "ALLOW_NEGATIVE") p.push("U3 เปลี่ยน");
    chk("U2", NU === "" && p.length === 0, "สิทธิ์ต่อสาขา · NOT_FOUND · VALIDATION", FX(NU + (p.join(" · ") || "ครบ")));
  }

  // ════════ P overview ════════
  {
    const p: string[] = [];
    const r = await overview("OWNER");
    const s = await sysSet("X");
    if (r?.ok !== true) p.push(`OWNER → ${codeOf(r)}`);
    else {
      for (const k of ["general", "caps", "unitStock", "staff", "payment", "receipt"]) if (r.canEdit?.[k] !== true) p.push(`canEdit.${k} ${short(r.canEdit?.[k], 8)}`);
      if (r.general?.autoLockMinutes !== callSync(regShared, "posRegisterAutoLockMinutes", s)) p.push("general.autoLockMinutes ≠ ตัวอ่าน");
      if (canon(r.general?.shift) !== canon(callSync(shiftMod, "parseShiftSettings", s))) p.push("general.shift ≠ parseShiftSettings");
      if (canon(r.caps) !== canon(callSync(regShared, "posDiscountCaps", s))) p.push("caps ≠ posDiscountCaps");
      if (r.unitStock?.unitId !== U.U1 || r.unitStock?.oversellPolicy !== (await oversell("U1"))) p.push(`unitStock ${short(r.unitStock, 60)}`);
      const pay = callSync(payMod, "parsePosPaymentSettings", s);
      if (canon(r.serviceCharge) !== canon(pay?.serviceCharge) || canon(r.tip) !== canon(pay?.tip)) p.push("serviceCharge/tip ≠ parsePosPaymentSettings");
    }
    chk("P1", NO === "" && p.length === 0, "OWNER canEdit ทุกตัว · ค่า = ตัวอ่านเดิม", FX(NO + (joinP(p) || "ครบ")));
  }
  {
    const p: string[] = [];
    const r = await overview("C1");
    if (r?.ok !== true) p.push(`แคชเชียร์ → ${codeOf(r)}`);
    else for (const k of ["general", "caps", "unitStock", "staff", "payment", "receipt"]) if (r.canEdit?.[k] !== false) p.push(`canEdit.${k} ${short(r.canEdit?.[k], 8)}`);
    const r2 = keep("P2 SX", await overview("SX"));
    if (!refused(r2, "PERMISSION_DENIED")) p.push(`ไม่มีสิทธิ์ → ${codeOf(r2)}`);
    chk("P2", NO === "" && p.length === 0, "แคชเชียร์อ่านอย่างเดียว · ไม่มีสิทธิ์ PERMISSION_DENIED", FX(NO + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const m = await overview("MGR");
    if (m?.ok !== true) p.push(`MGR → ${codeOf(m)}`);
    else {
      if (m.canEdit?.payment !== false) p.push("MGR canEdit.payment ไม่ใช่ false");
      for (const k of ["general", "caps", "unitStock", "staff", "receipt"]) if (m.canEdit?.[k] !== true) p.push(`MGR canEdit.${k} ${short(m.canEdit?.[k], 8)}`);
    }
    const m1 = await overview("MGR1");
    if (m1?.ok !== true) p.push(`MGR1 → ${codeOf(m1)}`);
    else {
      for (const k of ["general", "caps", "receipt", "payment"]) if (m1.canEdit?.[k] !== false) p.push(`MGR1 canEdit.${k} ${short(m1.canEdit?.[k], 8)}`);
      for (const k of ["unitStock", "staff"]) if (m1.canEdit?.[k] !== true) p.push(`MGR1 canEdit.${k} ${short(m1.canEdit?.[k], 8)}`);
    }
    chk("P3", NO === "" && p.length === 0, "MANAGER ครบสาขา vs สาขาเดียว", FX(NO + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    for (const [lbl, r] of [
      ["T2", await overview("OWNER", "U1", "X", T2)],
      ["Y+U1", await overview("OWNER", "U1", "Y")],
      ["X+U3", await overview("OWNER", "U3", "X")],
      ["id มั่ว", await overview("OWNER", `nope-${RAND}`, "X")],
    ] as [string, Any][]) {
      keep(`P4 ${lbl}`, r);
      if (!refused(r, "NOT_FOUND")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    chk("P4", NO === "" && p.length === 0, "NOT_FOUND ×4", FX(NO + (p.join(" · ") || "ครบ")));
  }

  // ════════ I การ์ด 13 ระบบ ════════
  // outbox ปลอม (availableAt +1 วัน — ไม่มีใครระบาย)
  const OB_PREFIX = `qc118-${RAND}-ob-`;
  if (!fx) {
    try {
      const now = Date.now();
      const future = new Date(now + DAY);
      let n = 0;
      const ob = async (sys: string, type: string, status: string, ageMin: number, processed = false) =>
        P.outboxEvent.create({
          data: { tenantId: T, systemId: S[sys], unitId: U.U1, type, payload: { qc: RAND }, idempotencyKey: `${OB_PREFIX}${++n}`, status, availableAt: status === "PENDING" ? future : new Date(now - ageMin * MIN), createdAt: new Date(now - ageMin * MIN), ...(processed ? { processedAt: new Date(now - (ageMin - 1) * MIN) } : {}) },
        });
      await ob("X", "pos.qc.p118", "PENDING", 20);
      await ob("X", "pos.qc.p118", "PENDING", 45);
      await ob("X", "pos.qc.p118", "FAILED", 30);
      for (const age of [120, 90, 60]) await ob("X", "pos.sale.paid", "DONE", age, true);
      await ob("X", "pos.qc.p118", "PENDING", 1);
      await ob("Y", "pos.qc.p118", "PENDING", 20);
      await ob("Y", "pos.qc.p118", "FAILED", 20);
      await ob("X", "approval.request.submitted", "PENDING", 20);
    } catch (e) {
      fx = `outbox ปลอม:${(e as Error).message.slice(0, 120)}`;
    }
  }
  {
    const p: string[] = [];
    const r = await cards("OWNER");
    const list: Any[] = Array.isArray(r?.cards) ? r.cards : [];
    if (r?.ok !== true) p.push(`OWNER → ${codeOf(r)}`);
    if (short(list.map((c) => c?.code)) !== short(CARD_CODES)) p.push(`ลำดับ ${short(list.map((c) => c?.code), 140)}`);
    for (const c of list) {
      const miss = ["code", "state", "scope", "target", "facts", "lastActivityAt", "manage"].filter((k) => !(k in (c ?? {})));
      if (miss.length) p.push(`${c?.code} ขาด ${miss.join(",")}`);
      if (!CARD_STATES.includes(c?.state)) p.push(`${c?.code} state ${short(c?.state, 12)}`);
      if (!CARD_SCOPES.includes(c?.scope)) p.push(`${c?.code} scope ${short(c?.scope, 12)}`);
    }
    if (r?.header?.total !== 13) p.push(`header.total ${short(r?.header?.total, 8)}`);
    if (short(rootMod?.POS_INTEGRATION_CODES) !== short(CARD_CODES)) p.push(`POS_INTEGRATION_CODES ${short(rootMod?.POS_INTEGRATION_CODES, 100)}`);
    chk("I1", NI === "" && p.length === 0, "13 การ์ดตามลำดับ · รูปครบ", FX(NI + (joinP(p) || "ครบ")));
  }
  {
    const p: string[] = [];
    const r = await cards("OWNER", "U1");
    const want: Record<string, string> = { MEMBER: "MEM", POINT: "PTS", COUPON: "CPN", INVENTORY: "INV", REWARD: "RW1" };
    for (const code of UNIT_CARDS) {
      const c = cardOf(r, code);
      if (c?.state !== "LINKED" || c?.scope !== "UNIT" || c?.target?.systemId !== S[want[code]!] || c?.target?.name !== NAME[want[code]!]) p.push(`${code} ${short(c && { s: c.state, sc: c.scope, id: c.target?.systemId === S[want[code]!], n: c.target?.name }, 90)}`);
    }
    chk("I2", NI === "" && p.length === 0, "U1 การ์ดสาขา 5 ใบ LINKED + target", FX(NI + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const r = await cards("OWNER", "U2");
    for (const code of ["MEMBER", "POINT", "COUPON", "INVENTORY"]) {
      const c = cardOf(r, code);
      if (c?.state !== "OFF" || c?.target !== null) p.push(`${code} ${short(c && { s: c.state, t: c.target }, 60)}`);
    }
    const rw = cardOf(r, "REWARD");
    if (rw?.state !== "LINKED" || rw?.target?.systemId !== S.RW2) p.push(`REWARD ${short(rw && { s: rw.state, id: rw.target?.systemId === S.RW2 }, 60)}`);
    chk("I3", NI === "" && p.length === 0, "U2: 4 OFF · REWARD ของ U2", FX(NI + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    await P.appSystem.update({ where: { id: S.CPN }, data: { active: false } }).catch(() => p.push("(fixture) ปิดคูปองไม่ได้"));
    const off = cardOf(await cards("OWNER", "U1"), "COUPON");
    if (off?.state === "LINKED" || !off) p.push(`ระบบปิด → ${short(off?.state, 12)}`);
    else if (off.state !== "OFF") p.push(`ระบบปิด → ${off.state} (คาด OFF)`);
    await P.appSystem.update({ where: { id: S.CPN }, data: { active: true } }).catch(() => {});
    const on = cardOf(await cards("OWNER", "U1"), "COUPON");
    if (on?.state !== "LINKED") p.push(`เปิดคืน → ${short(on?.state, 12)}`);
    chk("I4", NI === "" && p.length === 0, "active false = OFF · คืน = LINKED", FX(NI + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const c1 = cardOf(await cards("OWNER", "U1"), "ACCOUNT");
    if (c1?.state !== "LINKED" || c1?.scope !== "POS" || c1?.target?.systemId !== S.ACC) p.push(`ลิงก์เปิด ${short(c1 && { s: c1.state, sc: c1.scope, id: c1.target?.systemId === S.ACC }, 60)}`);
    await P.accountSystemLink.updateMany({ where: { tenantId: T, linkedKind: "POS", linkedId: S.X }, data: { enabled: false } }).catch(() => {});
    const c2 = cardOf(await cards("OWNER", "U1"), "ACCOUNT");
    if (c2?.state !== "OFF") p.push(`ลิงก์ปิด → ${short(c2?.state, 12)}`);
    await P.accountSystemLink.updateMany({ where: { tenantId: T, linkedKind: "POS", linkedId: S.X }, data: { enabled: true } }).catch(() => {});
    const cy = cardOf(await cards("OWNER", "U3", undefined, "Y"), "ACCOUNT");
    if (cy?.state !== "OFF") p.push(`POS Y (ไม่มีลิงก์) → ${short(cy?.state, 12)}`);
    chk("I5", NI === "" && p.length === 0, "ACCOUNT LINKED/OFF ตาม AccountSystemLink", FX(NI + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const c1 = cardOf(await cards("OWNER"), "CRM");
    if (c1?.state !== "OFF" || c1?.scope !== "TENANT") p.push(`ประตูปิด ${short(c1 && { s: c1.state, sc: c1.scope }, 50)}`);
    await P.appSystem.update({ where: { id: S.CRM }, data: { settings: { crm: { uiVersion: 2, bridgesEnabled: true } } } }).catch(() => p.push("(fixture) เปิดประตู CRM ไม่ได้"));
    const c2 = cardOf(await cards("OWNER"), "CRM");
    if (c2?.state !== "LINKED") p.push(`ประตูเปิด → ${short(c2?.state, 12)}`);
    await P.appSystem.update({ where: { id: S.CRM }, data: { settings: {} } }).catch(() => {});
    chk("I6", NI === "" && p.length === 0, "CRM ตามประตู bridgeOpen", FX(NI + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const c1 = cardOf(await cards("OWNER"), "KANBAN");
    if (c1?.state !== "OFF" || c1?.scope !== "TENANT") p.push(`ไม่มีบอร์ด ${short(c1 && { s: c1.state, sc: c1.scope }, 50)}`);
    const w = await call(rcptSetMod, "updatePosReceiptSettings", sctx(), A("OWNER"), { issueBoardId: boardId });
    if (w?.ok !== true) p.push(`(fixture) ตั้ง issueBoardId → ${codeOf(w)}`);
    const c2 = cardOf(await cards("OWNER"), "KANBAN");
    if (c2?.state !== "LINKED") p.push(`มีบอร์ด → ${short(c2?.state, 12)}`);
    chk("I7", NI === "" && p.length === 0, "KANBAN OFF → LINKED เมื่อตั้งบอร์ด", FX(NI + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const r = await cards("OWNER");
    for (const [code, state, phase] of [["HR", "PLANNED", "P3.5"], ["BOOKING", "PLANNED", "P2.4"], ["AI", "PLANNED", "P3.9"], ["MARKETING", "NO_SYSTEM", null], ["CHAT", "NO_SYSTEM", null]] as [string, string, string | null][]) {
      const c = cardOf(r, code);
      if (c?.state !== state) p.push(`${code} ${short(c?.state, 12)} (คาด ${state})`);
      if (c && (c.scope !== null || c.target !== null || c.manage !== null || c.lastActivityAt !== null)) p.push(`${code} scope/target/manage/lastActivity ไม่ใช่ null`);
      // ORACLE-EDIT P1.18 S (ขัดกันเองกับ I12/ตารางชื่อ: BOOKING advanceBookingBill = P2.7 ไม่ใช่ P2.4) — ทุกข้อ live:false มี phase · และมีอย่างน้อยหนึ่งข้อเป็นเฟสของการ์ด
      if (phase && c && !(Array.isArray(c.facts) && c.facts.length > 0 && c.facts.every((f: Any) => f?.live === false && typeof f?.phase === "string" && !!f.phase) && c.facts.some((f: Any) => f?.phase === PLANNED_PHASE[code]))) p.push(`${code} facts ไม่ใช่ planned ${phase}`);
    }
    chk("I8", NI === "" && p.length === 0, "PLANNED (HR BOOKING AI) · NO_SYSTEM (MARKETING CHAT)", FX(NI + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const r = await cards("OWNER");
    const n = Array.isArray(r?.cards) ? r.cards.filter((c: Any) => c?.state === "LINKED").length : -1;
    if (r?.header?.linked !== n || n < 0) p.push(`header.linked ${short(r?.header?.linked, 6)} · นับ LINKED ${n}`);
    chk("I9", NI === "" && p.length === 0, "linked = จำนวน LINKED", FX(NI + (p.join(" · ") || `ครบ (${n})`)));
  }
  {
    const p: string[] = [];
    const r = await cards("OWNER");
    const extra = T
      ? ((await P.$queryRawUnsafe(
          `SELECT (count(*) FILTER (WHERE status = 'PENDING' AND "createdAt" < now() - interval '10 minutes'))::int AS pend, (count(*) FILTER (WHERE status = 'FAILED'))::int AS fail FROM "OutboxEvent" WHERE "tenantId" = $1 AND "systemId" = $2 AND type LIKE 'pos.%' AND "idempotencyKey" NOT LIKE $3`,
          T, S.X, `${OB_PREFIX}%`,
        ).catch(() => [{ pend: 0, fail: 0 }])) as Any[])[0]
      : { pend: 0, fail: 0 };
    const want = { pending: 2 + Number(extra?.pend ?? 0), failed: 1 + Number(extra?.fail ?? 0) };
    if (canon(r?.header?.backlog) !== canon(want)) p.push(`backlog ${short(r?.header?.backlog, 60)} (คาด ${short(want, 40)})`);
    chk("I10", NI === "" && p.length === 0, "backlog ของ X เท่านั้น · PENDING > 10 นาที + FAILED", FX(NI + (p.join(" · ") || `ครบ ${short(want, 40)}`)));
  }
  {
    const p: string[] = [];
    const r = await cards("OWNER", "U1", { statementTimeoutMs: 50, testDelayMs: 400 });
    if (r?.ok !== true) p.push(`เกินเวลา → ${codeOf(r)}`);
    else {
      if (r.header?.backlog !== null) p.push(`backlog ${short(r.header?.backlog, 40)} (คาด null)`);
      if (!Array.isArray(r.cards) || r.cards.length !== 13) p.push(`การ์ด ${short(r.cards?.length, 6)}`);
    }
    chk("I11", NI === "" && p.length === 0, "timeout → backlog null · การ์ดครบ", FX(NI + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const r = await cards("OWNER", "U1");
    for (const code of CARD_CODES) {
      const c = cardOf(r, code);
      const got = Array.isArray(c?.facts) ? c.facts.map((f: Any) => [f?.key, f?.live, f?.phase ?? null]) : null;
      if (short(got, 1000) !== short(FACTS[code], 1000)) p.push(`${code} ${short(got, 140)}`);
    }
    const pr = cardOf(r, "POINT")?.facts?.find((f: Any) => f?.key === "pointRate");
    if (pr?.params?.satangPerPoint !== 1000) p.push(`pointRate params ${short(pr?.params, 40)}`);
    const ov = cardOf(r, "INVENTORY")?.facts?.find((f: Any) => f?.key === "oversellPolicy");
    if (ov?.params?.policy !== (await oversell("U1"))) p.push(`oversellPolicy params ${short(ov?.params, 40)}`);
    const last = T ? ((await P.outboxEvent.findMany({ where: { tenantId: T, systemId: S.X, type: "pos.sale.paid", status: "DONE" }, orderBy: { createdAt: "desc" }, take: 1 }).catch(() => [])) as Any[])[0] : null;
    const la = cardOf(r, "ACCOUNT")?.lastActivityAt;
    const okAt = !!last && [last.createdAt, last.processedAt].filter(Boolean).some((d: Date) => d.toISOString() === la);
    if (!okAt) p.push(`ACCOUNT lastActivityAt ${short(la, 30)} (คาด ${last?.createdAt?.toISOString?.() ?? "?"})`);
    chk("I12", NI === "" && p.length === 0, "facts ตามตาราง §6 · params สด · lastActivity ของ ACCOUNT", FX(NI + (joinP(p, 6) || "ครบ")));
  }
  {
    const p: string[] = [];
    const ro = await cards("OWNER", "U1");
    const rc = await cards("C1", "U1");
    if (rc?.ok !== true) p.push(`แคชเชียร์อ่าน → ${codeOf(rc)}`);
    for (const code of UNIT_CARDS) {
      const o = cardOf(ro, code), c = cardOf(rc, code);
      if (o?.manage?.href !== "/app/settings/connections" || o?.manage?.canManage !== true) p.push(`OWNER ${code} ${short(o?.manage, 60)}`);
      if (c && c.manage?.canManage !== false) p.push(`แคชเชียร์ ${code} canManage ${short(c.manage?.canManage, 8)}`);
    }
    for (const c of Array.isArray(ro?.cards) ? ro.cards : []) if (c?.manage && !/^\/app\//.test(String(c.manage.href ?? ""))) p.push(`${c.code} href ${short(c.manage.href, 40)}`);
    const rx = keep("I13 SX", await cards("SX", "U1"));
    if (!refused(rx, "PERMISSION_DENIED")) p.push(`ไม่มีสิทธิ์ → ${codeOf(rx)}`);
    for (const [lbl, r] of [["T2", await cards("OWNER", "U1", undefined, "X", T2)], ["Y+U1", await cards("OWNER", "U1", undefined, "Y")]] as [string, Any][]) {
      keep(`I13 ${lbl}`, r);
      if (!refused(r, "NOT_FOUND")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    chk("I13", NI === "" && p.length === 0, "manage ของเจ้าของระบบ · แคชเชียร์อ่านได้ · PERMISSION_DENIED/NOT_FOUND", FX(NI + (joinP(p) || "ครบ")));
  }

  // ════════ A สวิตช์บัญชี ════════
  const NA = NEED([has(rootMod, "setPosAccountLink"), "setPosAccountLink (pos-integrations.ts)"]);
  const link = async (): Promise<Any> => (T ? P.accountSystemLink.findFirst({ where: { tenantId: T, linkedKind: "POS", linkedId: S.X } }).catch(() => null) : null);
  const toggle = (actorKey: string, input: unknown) => call(rootMod, "setPosAccountLink", sctx(), A(actorKey), input);
  const accAudits = async () => audits(AUDIT_ACCOUNT);
  let keyN = 0;
  const newKey = (pfx = "k") => `qc118-${RAND}-${pfx}-${++keyN}`;
  const sell = async (actorKey: string, amount: number, label: string, extra: Record<string, unknown> = {}, key = newKey("s"), dev = DEV1): Promise<{ r: Any; key: string; id: string }> => {
    if (fx) return { r: { ok: false, code: "FIXTURE" }, key, id: "" };
    const input = { lines: [{ name: `${label} ${RAND}`, qty: 1, unitPriceSatang: amount }], idempotencyKey: key, expectedGrandTotalSatang: amount, payMethods: [{ type: "CASH", amountSatang: amount }], cashReceivedSatang: amount, ...extra };
    const r = await call(register, "submitRegisterSale", uctx("U1", "X", dev), A(actorKey), input);
    return { r, key, id: r?.ok === true ? String(r.saleId) : "" };
  };
  const jvOf = async (saleId: string): Promise<number> => (saleId ? Number(await P.accountJournalEntry.count({ where: { tenantId: T, refType: "PosSale", refId: saleId } }).catch(() => -1)) : -1);
  {
    const p: string[] = [];
    const a0 = (await accAudits()).length;
    const r = keep("A1 ไม่ confirm", await toggle("OWNER", { enabled: false }));
    if (!refused(r, "CONFIRM_REQUIRED")) p.push(`ปิดไม่ confirm → ${codeOf(r)}`);
    if ((await link())?.enabled !== true) p.push("ลิงก์ถูกปิด");
    if ((await accAudits()).length !== a0) p.push("มี audit");
    chk("A1", NA === "" && p.length === 0, "CONFIRM_REQUIRED · ไม่เปลี่ยน", FX(NA + (p.join(" · ") || "ครบ")));
  }
  let saleBefore = "";
  {
    const p: string[] = [];
    const s0 = await sell("OWNER", 10_700, "A ก่อนปิด");
    saleBefore = s0.id;
    if (!saleBefore) p.push(`(fixture) บิลก่อนปิด ${codeOf(s0.r)} ${short(s0.r?.message ?? "", 60)}`);
    await drain();
    const l0 = await link();
    const a0 = (await accAudits()).length;
    const r = await toggle("OWNER", { enabled: false, confirm: true });
    if (r?.ok !== true) p.push(`ปิด → ${codeOf(r)}`);
    const l1 = await link();
    if (!l1 || l1.id !== l0?.id || l1.enabled !== false || l1.archivedAt !== null || canon(l1.config) !== canon(l0?.config)) p.push(`ลิงก์ ${short(l1 && { same: l1.id === l0?.id, en: l1.enabled, arc: l1.archivedAt, cfg: canon(l1.config) === canon(l0?.config) }, 90)}`);
    const au = (await accAudits()).slice(a0);
    if (au.length !== 1 || au[0]?.after?.enabled !== false) p.push(`audit ${au.length} ${short(au[0]?.after, 60)}`);
    const c = cardOf(await cards("OWNER"), "ACCOUNT");
    if (c?.state !== "OFF") p.push(`การ์ด ${short(c?.state, 12)}`);
    chk("A2", NA === "" && p.length === 0, "ปิดแบบ soft · audit · การ์ด OFF", FX(NA + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const s1 = await sell("OWNER", 10_700, "A หลังปิด");
    if (!s1.id) p.push(`(fixture) บิลหลังปิด ${codeOf(s1.r)} ${short(s1.r?.message ?? "", 60)}`);
    await drain();
    const jb = await jvOf(saleBefore), ja = await jvOf(s1.id);
    if (!(jb > 0)) p.push(`(ตัวควบคุม) บิลก่อนปิด JV ${jb}`);
    if (ja !== 0) p.push(`บิลหลังปิด JV ${ja}`);
    const docs = s1.id ? Number(await P.accountDocument.count({ where: { tenantId: T, refType: "PosSale", refId: s1.id } }).catch(() => -1)) : -1;
    if (docs !== 0) p.push(`บิลหลังปิด เอกสาร ${docs}`);
    chk("A3", NA === "" && p.length === 0, "ปิดแล้วบิลใหม่ไม่ลงบัญชี", FX(NA + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const a0 = (await accAudits()).length;
    const r = await toggle("OWNER", { enabled: true });
    if (r?.ok !== true) p.push(`เปิดคืน → ${codeOf(r)}`);
    if ((await link())?.enabled !== true) p.push("ลิงก์ไม่เปิด");
    const au = (await accAudits()).slice(a0);
    if (au.length !== 1 || au[0]?.after?.enabled !== true) p.push(`audit ${au.length}`);
    const s2 = await sell("OWNER", 10_700, "A หลังเปิด");
    await drain();
    const j = await jvOf(s2.id);
    if (!(j > 0)) p.push(`บิลหลังเปิด JV ${j}`);
    const c = cardOf(await cards("OWNER"), "ACCOUNT");
    if (c?.state !== "LINKED") p.push(`การ์ด ${short(c?.state, 12)}`);
    chk("A4", NA === "" && p.length === 0, "เปิดคืน = ลงบัญชีต่อ", FX(NA + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const a0 = (await accAudits()).length;
    const r1 = await toggle("OWNER", { enabled: true });
    if (r1?.ok !== true) p.push(`ซ้ำ → ${codeOf(r1)}`);
    if ((await accAudits()).length !== a0) p.push("ซ้ำแล้วมี audit");
    const r2 = keep("A5 MGR", await toggle("MGR", { enabled: false, confirm: true }));
    if (!refused(r2, "PERMISSION_DENIED")) p.push(`MANAGER ไม่มี account.settings.manage → ${codeOf(r2)}`);
    const r3 = keep("A5 C1", await toggle("C1", { enabled: false, confirm: true }));
    if (!refused(r3, "PERMISSION_DENIED")) p.push(`แคชเชียร์ → ${codeOf(r3)}`);
    if ((await link())?.enabled !== true) p.push("ลิงก์ถูกปิดโดยคนไม่มีสิทธิ์");
    const r4 = await toggle("SACC", { enabled: false, confirm: true });
    if (r4?.ok !== true) p.push(`STAFF 2 คีย์ครบสาขา → ${codeOf(r4)}`);
    const r5 = await toggle("MGRA", { enabled: true });
    if (r5?.ok !== true) p.push(`MANAGER มี account.settings.manage → ${codeOf(r5)}`);
    if ((await link())?.enabled !== true) p.push("ลิงก์สุดท้ายไม่เปิด");
    chk("A5", NA === "" && p.length === 0, "idempotent · สิทธิ์ 2 ชั้น", FX(NA + (p.join(" · ") || "ครบ")));
  }

  // ════════ PP พร้อมเพย์รายสาขา (ก่อน H เพื่อให้มีแถว section payment) ════════
  const PP_UNIT = "0898765432";
  const PP_PROFILE = "0812345678";
  const NP = NEED([has(payMod, "updatePosUnitPromptpay"), "updatePosUnitPromptpay (payment-settings.ts)"]);
  const ppSet = (actorKey: string, u: string, id: unknown) => call(payMod, "updatePosUnitPromptpay", sctx(), A(actorKey), { unitId: U[u] ?? u, promptpayId: id });
  const intent = async (u: string, dev: string, amount: number) => call(intentMod, "createPaymentIntent", uctx(u, "X", dev), A("OWNER"), { method: "PROMPTPAY", amountSatang: amount, idempotencyKey: newKey("pi"), deviceId: dev });
  const qrOf = (id: string, amount: number) => String(callSync(ppLib, "promptpayPayload", { id, amountSatang: amount }));
  {
    const p: string[] = [];
    if (callSync(ppLib, "isValidPromptPayId", PP_UNIT) !== true || callSync(ppLib, "isValidPromptPayId", PP_PROFILE) !== true) p.push("(ข้อสอบ) เลขพร้อมเพย์ของ fixture ไม่ผ่าน isValidPromptPayId");
    const r = await ppSet("OWNER", "U1", PP_UNIT);
    if (r?.ok !== true) p.push(`ตั้งเลขสาขา → ${codeOf(r)}`);
    const s = await sysSet("X");
    if (callSync(intentShared, "promptpayIdForUnit", s, U.U1) !== PP_UNIT) p.push("promptpayIdForUnit(U1) ไม่ใช่เลขสาขา");
    const i1 = await intent("U1", DEV1, 12_345);
    if (i1?.ok !== true) p.push(`intent U1 → ${codeOf(i1)} ${short(i1?.message ?? "", 60)}`);
    else if (i1.intent?.qrPayload !== qrOf(PP_UNIT, 12_345)) p.push(`QR U1 ${i1.intent?.qrPayload === qrOf(PP_PROFILE, 12_345) ? "= ของโปรไฟล์" : "ไม่ตรงเลขสาขา"}`);
    const au = await settingsAudits("payment");
    if (!au.length) p.push("ไม่มี audit section payment");
    const leak = ((await P.auditLog.findMany({ where: { tenantId: T } }).catch(() => [])) as Any[]).filter((a) => short(a.before, 20_000).includes(PP_UNIT) || short(a.after, 20_000).includes(PP_UNIT));
    if (leak.length) p.push(`AuditLog มีเลขดิบ ${leak.length} แถว (${leak.map((a) => a.action).join(",")})`);
    chk("PP1", NP === "" && p.length === 0, "เลขสาขาชนะโปรไฟล์ · audit ปิดเลข", FX(NP + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const i2 = await intent("U2", DEV3, 4_321);
    if (i2?.ok !== true) p.push(`intent U2 → ${codeOf(i2)} ${short(i2?.message ?? "", 60)}`);
    else if (i2.intent?.qrPayload !== qrOf(PP_PROFILE, 4_321)) p.push("QR U2 ไม่ใช่ของโปรไฟล์");
    const m = keep("PP2 MGR", await ppSet("MGR", "U1", "0811111111"));
    if (!refused(m, "SETTINGS_SECTION_LOCKED")) p.push(`MANAGER → ${codeOf(m)}`);
    const v = keep("PP2 ผิดรูป", await ppSet("OWNER", "U1", "12345"));
    if (!refused(v, "VALIDATION") || v.field !== "promptpayId") p.push(`เลขผิดรูป → ${codeOf(v)} field ${short(v?.field, 20)}`);
    const nf = keep("PP2 U3", await ppSet("OWNER", "U3", PP_UNIT));
    if (!refused(nf, "NOT_FOUND")) p.push(`U3 → ${codeOf(nf)}`);
    if (callSync(intentShared, "promptpayIdForUnit", await sysSet("X"), U.U1) !== PP_UNIT) p.push("เลขสาขาเปลี่ยนจากคำปฏิเสธ");
    const del = await ppSet("OWNER", "U1", null);
    if (del?.ok !== true) p.push(`ลบ → ${codeOf(del)}`);
    const i3 = await intent("U1", DEV1, 2_222);
    if (i3?.ok !== true || i3.intent?.qrPayload !== qrOf(PP_PROFILE, 2_222)) p.push(`หลังลบ U1 → ${codeOf(i3)} ${i3?.intent?.qrPayload === qrOf(PP_UNIT, 2_222) ? "ยังใช้เลขสาขา" : ""}`);
    chk("PP2", NP === "" && p.length === 0, "ไม่ตั้ง = โปรไฟล์ · OWNER เท่านั้น · VALIDATION · NOT_FOUND · ลบได้", FX(NP + (p.join(" · ") || "ครบ")));
  }

  // ════════ H ประวัติ ════════
  const NH = NEED([has(genMod, "posSettingsHistory"), "posSettingsHistory (settings-general.ts)"]);
  const history = (actorKey: string, cursor?: string | null, k = "X") => call(genMod, "posSettingsHistory", sctx(k), A(actorKey), cursor ? { cursor } : {});
  {
    const p: string[] = [];
    // ตัวเขียนเดิมต้องลง audit ด้วย (hunk เล็ก)
    const rr = await call(rcptSetMod, "updatePosReceiptSettings", sctx(), A("OWNER"), { footer: `ท้ายใบ H ${RAND}` });
    // เปลี่ยนอัตราแต่คงปิดค่าบริการ (เปิดแล้วบิลถัดไปของข้อสอบจะ PRICE_CHANGED)
    const pr = await call(payMod, "updatePosPaymentSettings", sctx(), A("OWNER"), { serviceCharge: { enabled: false, rateBp: 700 } });
    const ir = await call(payMod, "updatePosIntentSettings", sctx(), A("OWNER"), { qrExpiryMinutes: 20 });
    for (const [n, r] of [["ใบเสร็จ", rr], ["ชำระเงิน", pr], ["ใบขอรับเงิน", ir]] as const) if (r?.ok !== true) p.push(`(fixture) ${n} → ${codeOf(r)}`);
    for (const sec of ["general", "caps", "unitStock", "receipt", "payment", "intent"]) {
      const n = (await settingsAudits(sec)).length;
      if (n < 1) p.push(`ไม่มี audit section ${sec}`);
    }
    const rows = await settingsAudits();
    const badT = rows.filter((a) => !["AppSystem", "BusinessUnit"].includes(a.targetType));
    if (badT.length) p.push(`targetType แปลก ${[...new Set(badT.map((a) => a.targetType))].join(",")}`);
    chk("H1", p.length === 0, "ทุกตัวเขียน (6 section) ลง audit", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    // แถวของ Y (ต้องไม่โผล่ในประวัติของ X)
    await gen("OWNER", { autoLockMinutes: 5 }, "Y");
    const r = await history("OWNER");
    const items: Any[] = Array.isArray(r?.items) ? r.items : [];
    if (r?.ok !== true) p.push(`OWNER → ${codeOf(r)}`);
    for (const it of items.slice(0, 5)) {
      const miss = ["id", "at", "actorName", "action", "section", "summary"].filter((k) => !(k in (it ?? {})));
      if (miss.length) p.push(`รายการขาด ${miss.join(",")}`);
    }
    if (items[0] && items[0].actorName !== US.OWNER?.name) p.push(`actorName ${short(items[0].actorName, 30)}`);
    const all: Any[] = [...items];
    let cur = r?.nextCursor ?? null;
    for (let i = 0; i < 10 && cur; i++) {
      const nx = await history("OWNER", cur);
      all.push(...(Array.isArray(nx?.items) ? nx.items : []));
      cur = nx?.nextCursor ?? null;
    }
    const ysAudit = await audits(AUDIT_SETTINGS, (a) => a.targetId === S.Y);
    const yIds = new Set(ysAudit.map((a) => a.id));
    if (!ysAudit.length) p.push("(fixture) ไม่มีแถวของ Y");
    if (all.some((it) => yIds.has(it?.id))) p.push("มีแถวของ Y ในประวัติ X");
    if (!all.some((it) => it?.section === "unitStock")) p.push("ไม่มีแถว unitStock");
    if (!all.some((it) => it?.action === AUDIT_ACCOUNT)) p.push("ไม่มีแถว pos.integration.account");
    chk("H2", NH === "" && p.length === 0, "ประวัติของ X · มี unitStock/บัญชี · ไม่มี Y", FX(NH + (p.join(" · ") || `ครบ (${all.length} แถว)`)));
  }
  {
    const p: string[] = [];
    // ให้มี > 20 แถว: เขียนทั่วไปสลับค่า 22 ครั้ง
    for (let i = 0; i < 22; i++) await gen("OWNER", { autoLockMinutes: i % 2 === 0 ? 21 : 22 });
    const expected = (await settingsAudits()).filter((a) => a.targetId === S.X || a.targetId === U.U1 || a.targetId === U.U2).length + (await audits(AUDIT_ACCOUNT)).length;
    const pages: Any[][] = [];
    let cur: string | null = null;
    for (let i = 0; i < 20; i++) {
      const r = await history("OWNER", cur);
      if (r?.ok !== true) {
        p.push(`หน้า ${i + 1} → ${codeOf(r)}`);
        break;
      }
      pages.push(Array.isArray(r.items) ? r.items : []);
      cur = r.nextCursor ?? null;
      if (!cur) break;
    }
    if (pages.length < 2) p.push(`ได้ ${pages.length} หน้า (คาด ≥ 2)`);
    if (pages.slice(0, -1).some((pg) => pg.length !== 20)) p.push(`ขนาดหน้า ${pages.map((pg) => pg.length).join(",")}`);
    const ids = pages.flat().map((x) => x?.id);
    if (new Set(ids).size !== ids.length) p.push("มีรายการซ้ำข้ามหน้า");
    const ats = pages.flat().map((x) => Date.parse(String(x?.at)));
    if (ats.some((t, i) => i > 0 && !(t <= ats[i - 1]!))) p.push("เวลาไม่เรียงใหม่→เก่า");
    if (ids.length < expected) p.push(`รวม ${ids.length} (คาด ≥ ${expected} — แถวหาย)`);
    chk("H3", NH === "" && p.length === 0, "20/หน้า · cursor เสถียร · ใหม่ก่อน", FX(NH + (p.join(" · ") || `ครบ (${pages.length} หน้า · ${ids.length} แถว)`)));
  }
  {
    const p: string[] = [];
    const r = await history("OWNER");
    const items: Any[] = Array.isArray(r?.items) ? r.items : [];
    if (items.some((it) => "before" in (it ?? {}) || "after" in (it ?? {}))) p.push("รายการมี before/after ดิบ");
    let all = short(items, 100_000);
    let cur = r?.nextCursor ?? null;
    for (let i = 0; i < 10 && cur; i++) {
      const nx = await history("OWNER", cur);
      all += short(nx?.items ?? [], 100_000);
      cur = nx?.nextCursor ?? null;
    }
    if (all.includes(PP_UNIT)) p.push("ประวัติมีเลขพร้อมเพย์ดิบ");
    const rc = keep("H4 C1", await history("C1"));
    if (!refused(rc, "PERMISSION_DENIED")) p.push(`แคชเชียร์ → ${codeOf(rc)}`);
    chk("H4", NH === "" && items.length > 0 && p.length === 0, "ไม่มีค่าดิบ · ไม่มีเลขพร้อมเพย์ · แคชเชียร์ถูกปฏิเสธ", FX(NH + (p.join(" · ") || "ครบ")));
  }

  // ORACLE-EDIT (P1.18U แก้รอบ 1 F1): H2b — ทำหลัง H3/H4 (ไม่รบกวนจำนวนแถวของ H3) · คืนค่า shift/weighedBarcode เดิมของ X ท้ายข้อ
  {
    const p: string[] = [];
    const ov0 = await overview("OWNER");
    const g0: Any = ov0?.ok === true ? ov0.general : null;
    if (!isRecord(g0) || !isRecord(g0.shift) || !isRecord(g0.weighedBarcode)) p.push(`(fixture) overview → ${codeOf(ov0)}`);
    else {
      const latest = async (): Promise<Any> => {
        const r = await history("OWNER");
        return Array.isArray(r?.items) ? r.items[0] : null;
      };
      const keysOf = (it: Any) => (isRecord(it?.summary) ? Object.keys(it.summary).sort() : null);
      // 1) blindClose อย่างเดียว (สลับค่า ⇒ เปลี่ยนจริงแน่)
      const b1 = await gen("OWNER", { shift: { blindClose: !g0.shift.blindClose } });
      if (b1?.ok !== true) p.push(`blindClose → ${codeOf(b1)}`);
      const it1 = await latest();
      if (it1?.section !== "general") p.push(`แถวล่าสุด section ${short(it1?.section, 20)}`);
      if (short(keysOf(it1)) !== short(["shift.blindClose"])) p.push(`blindClose อย่างเดียว → summary ${short(keysOf(it1), 160)}`);
      // 2) กฎบาร์โค้ดชั่งอย่างเดียว (enabled เท่าเดิม = true · กฎต่างจากเดิม)
      const wbA = { enabled: true, rules: [{ prefix: "26", kind: "WEIGHT" }] };
      const wbB = { enabled: true, rules: [{ prefix: "27", kind: "PRICE" }] };
      const w0 = await gen("OWNER", { weighedBarcode: wbA });
      if (w0?.ok !== true) p.push(`(fixture) wb A → ${codeOf(w0)}`);
      const w1 = await gen("OWNER", { weighedBarcode: wbB });
      if (w1?.ok !== true) p.push(`wb B → ${codeOf(w1)}`);
      const k2 = keysOf(await latest()) ?? [];
      if (k2.includes("weighedBarcode.enabled")) p.push(`กฎอย่างเดียว → มี weighedBarcode.enabled (${short(k2, 160)})`);
      if (!k2.includes("weighedBarcode.rules")) p.push(`กฎอย่างเดียว → ไม่มี weighedBarcode.rules (${short(k2, 160)})`);
      // คืนค่าเดิม
      const back = await gen("OWNER", { shift: g0.shift, weighedBarcode: g0.weighedBarcode });
      if (back?.ok !== true) p.push(`(fixture) คืนค่า → ${codeOf(back)}`);
    }
    chk("H2b", NH === "" && p.length === 0, "summary = เฉพาะคีย์ที่เปลี่ยน (shift.blindClose · ไม่มี weighedBarcode.enabled)", FX(NH + (p.join(" · ") || "ครบ")));
  }

  // ════════ S พนักงาน / อนุมัติ ════════
  const NS = NEED([has(ovMod, "posStaffOverview"), "posStaffOverview (settings-overview.ts)"]);
  const pol: Record<string, string> = {};
  if (!fx) {
    try {
      pol.VOID = (await apSvc.createPolicy({ tenantId: T }, { name: `QC ยกเลิก ${RAND}`, entityType: "POS_VOID", thresholdSatang: 50_000, steps: [{ order: 1, approverRole: "MANAGER" }] })).id;
      pol.REFUND = (await apSvc.createPolicy({ tenantId: T }, { name: `QC คืนเงิน X ${RAND}`, entityType: "POS_REFUND", systemId: S.X, steps: [{ order: 1, approverRole: "MANAGER" }] })).id;
      pol.DISC_OFF = (await apSvc.createPolicy({ tenantId: T }, { name: `QC ส่วนลด (ปิด) ${RAND}`, entityType: "POS_DISCOUNT_OVER", steps: [{ order: 1, approverRole: "MANAGER" }] })).id;
      await apSvc.setPolicyActive({ tenantId: T }, pol.DISC_OFF, false);
      pol.YVOID = (await apSvc.createPolicy({ tenantId: T }, { name: `QC ยกเลิก Y ${RAND}`, entityType: "POS_VOID", systemId: S.Y, steps: [{ order: 1, approverRole: "MANAGER" }] })).id;
      pol.OTHER = (await apSvc.createPolicy({ tenantId: T }, { name: `QC อื่น ${RAND}`, entityType: "QC_P118_OTHER", steps: [{ order: 1, approverRole: "MANAGER" }] })).id;
    } catch (e) {
      fx = `กติกาอนุมัติ:${(e as Error).message.slice(0, 120)}`;
    }
  }
  const staffOv = (actorKey: string, u = "U1") => call(ovMod, "posStaffOverview", uctx(u), A(actorKey), {});
  {
    const p: string[] = [];
    const sp = await call(staffMod, "setStaffPin", uctx("U1"), A("OWNER"), { userId: uid("C1"), pin: "258014" });
    if (sp?.ok !== true) p.push(`(fixture) ตั้ง PIN C1 → ${codeOf(sp)}`);
    const r = await staffOv("OWNER");
    const items: Any[] = Array.isArray(r?.staff) ? r.staff : [];
    if (r?.ok !== true) p.push(`OWNER → ${codeOf(r)}`);
    const sellerKeys = spec.filter(([, role, ua, perms]) => role === "OWNER" || ((ua.includes(U.U1!) || ua.includes("*")) && (role === "MANAGER" || perms["pos.sale.create"] === true))).map(([k]) => k);
    const want = new Set(sellerKeys.map(uid));
    const got = new Set(items.map((x) => x?.userId));
    if (short([...want].sort()) !== short([...got].sort())) p.push(`รายชื่อ ${items.length} (คาด ${want.size}: ${sellerKeys.join(",")})`);
    const c1 = items.find((x) => x?.userId === uid("C1"));
    if (c1?.hasPin !== true) p.push("C1 hasPin ไม่ใช่ true");
    if (items.some((x) => x?.userId !== uid("C1") && x?.hasPin !== false)) p.push("คนอื่น hasPin ไม่ใช่ false");
    for (const x of items) {
      const extra = Object.keys(x ?? {}).filter((k) => !["userId", "name", "role", "hasPin", "shift"].includes(k));
      if (extra.length) p.push(`คีย์เกิน ${extra.join(",")}`);
    }
    const rc = keep("S1 C1", await staffOv("C1"));
    if (!refused(rc, "PERMISSION_DENIED")) p.push(`แคชเชียร์ → ${codeOf(rc)}`);
    chk("S1", NS === "" && p.length === 0, "ผู้ขายที่สาขา + hasPin · ไม่มีคีย์ลับ", FX(NS + (joinP(p) || "ครบ")));
  }
  {
    const p: string[] = [];
    const r = await staffOv("OWNER");
    const rows: Any[] = Array.isArray(r?.roleMatrix) ? r.roleMatrix : [];
    if (short(rows.map((x) => x?.task)) !== short(ROLE_ROWS.map(([t]) => t))) p.push(`แถว ${short(rows.map((x) => x?.task), 160)}`);
    const staffAt = spec.filter(([, role, ua]) => role === "STAFF" && (ua.includes(U.U1!) || ua.includes("*")));
    for (const [task, perm, planned] of ROLE_ROWS) {
      const row = rows.find((x) => x?.task === task);
      if (!row) continue;
      if ((row.permission ?? null) !== perm || (row.planned ?? null) !== planned) p.push(`${task} permission/planned ${short({ pm: row.permission, pl: row.planned }, 60)}`);
      if (perm) {
        if (row.owner !== true || row.manager !== true) p.push(`${task} owner/manager ${row.owner}/${row.manager}`);
        const holders = staffAt.filter(([, , , perms]) => perms[perm] === true || perms["pos.*"] === true).length;
        if (row.staff?.holders !== holders || row.staff?.total !== staffAt.length) p.push(`${task} staff ${short(row.staff, 40)} (คาด ${holders}/${staffAt.length})`);
      }
    }
    if (canon(r?.caps) !== canon(callSync(regShared, "posDiscountCaps", await sysSet("X")))) p.push(`caps ${short(r?.caps, 60)}`);
    chk("S2", NS === "" && p.length === 0, "ตารางสิทธิ์ 12 แถว · นับ STAFF จาก Membership", FX(NS + (joinP(p) || "ครบ")));
  }
  {
    const p: string[] = [];
    const r = await staffOv("OWNER");
    const ids = new Set((Array.isArray(r?.approvals) ? r.approvals : []).map((x: Any) => x?.id));
    const want = new Set([pol.VOID, pol.REFUND]);
    if (short([...ids].sort()) !== short([...want].sort())) p.push(`approvals ${short([...ids].map((i) => Object.entries(pol).find(([, v]) => v === i)?.[0] ?? "?"), 80)} (คาด VOID,REFUND)`);
    const rows: Any[] = Array.isArray(r?.roleMatrix) ? r.roleMatrix : [];
    const na = (t: string) => rows.find((x) => x?.task === t)?.needsApproval;
    if (na("void") !== true || na("refund") !== true || na("discount") !== false) p.push(`needsApproval void/refund/discount ${na("void")}/${na("refund")}/${na("discount")}`);
    chk("S3", NS === "" && p.length === 0, "กติกา POS_* ที่ active และใช้กับ X/U1", FX(NS + (p.join(" · ") || (NS ? "" : "ครบ"))));
  }
  {
    const p: string[] = [];
    const NF = NEED([has(apFacade, "listPoliciesForEntities"), "listPoliciesForEntities (approval/index.ts)"]);
    const r = await call(apFacade, "listPoliciesForEntities", { tenantId: T }, ["POS_VOID", "POS_DISCOUNT_OVER"]);
    const list: Any[] = Array.isArray(r) ? r : Array.isArray(r?.policies) ? r.policies : [];
    if (!NF) {
      if (list.some((x) => !["POS_VOID", "POS_DISCOUNT_OVER"].includes(x?.entityType))) p.push(`มี entityType อื่น ${short(list.map((x) => x?.entityType), 80)}`);
      for (const k of ["VOID", "YVOID", "DISC_OFF"]) if (!list.some((x) => x?.id === pol[k])) p.push(`ไม่มี ${k}`);
      if (list.some((x) => !Array.isArray(x?.steps))) p.push("ไม่มี steps");
      const r2 = await call(apFacade, "listPoliciesForEntities", { tenantId: T2 }, ["POS_VOID"]);
      const l2: Any[] = Array.isArray(r2) ? r2 : Array.isArray(r2?.policies) ? r2.policies : [];
      if (l2.length) p.push(`T2 เห็น ${l2.length}`);
    }
    chk("S4", NF === "" && p.length === 0, "facade อ่านล้วน กรอง entityType + ร้าน", FX(NF + (p.join(" · ") || (NF ? "" : "ครบ"))));
  }

  // ════════ L ภาษาใบเสร็จ ════════
  {
    const p: string[] = [];
    const w = await gen("OWNER", { receiptLocale: "en" });
    if (w?.ok !== true) p.push(`ตั้ง en → ${codeOf(w)}`);
    const s = await sell("OWNER", 5_000, "Latte EN");
    if (!s.id) p.push(`(fixture) บิล ${codeOf(s.r)}`);
    const rp = s.id ? await call(rcpMod, "receiptPayload", sctx(), A("OWNER"), { saleId: s.id }) : null;
    const pl = rp?.ok === true ? rp.payload : null;
    if (pl?.printLocale !== "en") p.push(`printLocale ${short(pl?.printLocale ?? codeOf(rp), 20)}`);
    if (pl) {
      const html = String(callSync(renderMod, "renderReceiptHtml", pl, { paper: "80", locale: pl.printLocale === "en" ? "en" : "th" }) ?? "");
      const thLabels = Object.values(renderMod?.RECEIPT_LABELS?.th ?? {}).filter((v): v is string => typeof v === "string" && THAI.test(v) && v.length >= 3);
      const hit = thLabels.filter((v) => html.includes(v));
      if (hit.length) p.push(`มีป้ายไทย ${hit.slice(0, 3).join(" | ")}`);
      const enTitle = renderMod?.RECEIPT_LABELS?.en ? Object.values(renderMod.RECEIPT_LABELS.en).filter((v): v is string => typeof v === "string" && v.length >= 4) : [];
      if (!enTitle.some((v) => html.includes(v))) p.push("ไม่มีป้าย en");
    }
    chk("L2", p.length === 0, "receiptLocale en → payload/HTML อังกฤษ", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    // บิลบน POS Y (สาขา U3 · ไม่เคยตั้ง receiptLocale)
    const y = fx ? { r: null, id: "" } : await (async () => {
      const key = newKey("y3");
      const r = await call(register, "submitRegisterSale", uctx("U3", "Y"), A("OWNER"), { lines: [{ name: `ชา Y ${RAND}`, qty: 1, unitPriceSatang: 3_000 }], idempotencyKey: key, expectedGrandTotalSatang: 3_000, payMethods: [{ type: "CASH", amountSatang: 3_000 }], cashReceivedSatang: 3_000 });
      return { r, id: r?.ok === true ? String(r.saleId) : "" };
    })();
    if (!y.id) p.push(`(fixture) บิล Y ${codeOf(y.r)} ${short(y.r?.message ?? "", 60)}`);
    else {
      const rp = await call(rcpMod, "receiptPayload", sctx("Y"), A("OWNER"), { saleId: y.id });
      if (rp?.ok !== true || rp.payload?.printLocale !== "th") p.push(`Y printLocale ${rp?.ok === true ? short(rp.payload?.printLocale, 20) : codeOf(rp)}`);
    }
    const w = await gen("OWNER", { receiptLocale: "th" });
    const s = await sell("OWNER", 4_000, "ชาไทย");
    const rp2 = s.id ? await call(rcpMod, "receiptPayload", sctx(), A("OWNER"), { saleId: s.id }) : null;
    if (w?.ok !== true || rp2?.payload?.printLocale !== "th") p.push(`ตั้งกลับ th → ${codeOf(w)} ${short(rp2?.payload?.printLocale, 10)}`);
    chk("L3", p.length === 0, "ปริยาย th · ตั้งกลับ th", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ D ตัดวัน ════════
  {
    const bkk = (t: number) => new Date(t + 7 * HOUR).toISOString().slice(0, 10);
    const Dd = bkk(RUN_START - 6 * DAY);
    const Dp = bkk(Date.parse(`${Dd}T00:00:00Z`) - DAY + 12 * HOUR);
    const at = (hh: string) => new Date(Date.parse(`${Dd}T${hh}:00+07:00`));
    const moved: string[] = [];
    for (const [hh, amt] of [["02:00", 6_100], ["05:00", 6_200]] as const) {
      const s = await sell("OWNER", amt, `D ${hh}`);
      if (s.id) {
        await P.posSale.update({ where: { id: s.id }, data: { createdAt: at(hh), paidAt: at(hh) } }).catch(() => {});
        moved.push(s.id);
      }
    }
    const dayRows = async () => {
      const r = await call(reportsMod, "reportDailySales", uctx("U1"), A("OWNER"), { from: Dp, to: Dd });
      const rows: Any[] = r?.ok === true ? r.report?.rows ?? [] : [];
      return { r, prev: rows.find((x) => x?.businessDate === Dp)?.billCount ?? -1, day: rows.find((x) => x?.businessDate === Dd)?.billCount ?? -1 };
    };
    const closeOf = async (d: string) => Number((await call(svcMod, "closeDaySummary", { tenantId: T, systemId: S.X, unitIds: [U.U1] }, d))?.billCount ?? -1);
    {
      const p: string[] = [];
      if (moved.length !== 2) p.push(`(fixture) บิล ${moved.length}/2`);
      const w = await gen("OWNER", { dayCutoffMinutes: 240 });
      if (w?.ok !== true) p.push(`ตั้ง 240 → ${codeOf(w)}`);
      const d = await dayRows();
      if (d.r?.ok !== true) p.push(`reportDailySales → ${codeOf(d.r)}`);
      if (d.prev !== 1 || d.day !== 1) p.push(`รายงาน D−1/D = ${d.prev}/${d.day} (คาด 1/1)`);
      const [cp, cd] = [await closeOf(Dp), await closeOf(Dd)];
      if (cp !== 1 || cd !== 1) p.push(`ปิดวัน D−1/D = ${cp}/${cd} (คาด 1/1)`);
      chk("D1", NG === "" && p.length === 0, "02:00 → วันก่อน · 05:00 → วันนั้น", FX(NG + (p.join(" · ") || `ครบ (D=${Dd})`)));
    }
    {
      const p: string[] = [];
      const w = await gen("OWNER", { dayCutoffMinutes: 0 });
      if (w?.ok !== true) p.push(`ตั้ง 0 → ${codeOf(w)}`);
      const d = await dayRows();
      if (d.prev !== 0 || d.day !== 2) p.push(`รายงาน D−1/D = ${d.prev}/${d.day} (คาด 0/2)`);
      const [cp, cd] = [await closeOf(Dp), await closeOf(Dd)];
      if (cp !== 0 || cd !== 2) p.push(`ปิดวัน D−1/D = ${cp}/${cd} (คาด 0/2)`);
      chk("D2", moved.length === 2 && p.length === 0, "ตัดเที่ยงคืน (ตัวควบคุม)", FX(p.join(" · ") || "ครบ"));
    }
  }

  // ════════ V2 FU-c ════════
  {
    const p: string[] = [];
    const o1 = await overview("MGR1"), o2 = await overview("MGR");
    const w1 = keep("V2 MGR1 ใบเสร็จ", await call(rcptSetMod, "updatePosReceiptSettings", sctx(), A("MGR1"), { footer: `V2 ${RAND}` }));
    const w2 = await call(rcptSetMod, "updatePosReceiptSettings", sctx(), A("MGR"), { footer: `V2b ${RAND}` });
    if (o1?.canEdit?.receipt !== false || !refused(w1, "PERMISSION_DENIED")) p.push(`MGR1 canEdit.receipt ${short(o1?.canEdit?.receipt ?? codeOf(o1), 12)} · เขียน ${codeOf(w1)}`);
    if (o2?.canEdit?.receipt !== true || w2?.ok !== true) p.push(`MGR canEdit.receipt ${short(o2?.canEdit?.receipt ?? codeOf(o2), 12)} · เขียน ${codeOf(w2)}`);
    chk("V2", NO === "" && p.length === 0, "canEdit.receipt = สิทธิ์จริงของตัวเขียนใบเสร็จ", FX(NO + (p.join(" · ") || "ครบ")));
  }

  // ════════ K งานปิด P1.15 ════════
  {
    const p: string[] = [];
    const N = typeof regShared?.STAFF_PIN_DEVICE_THROTTLE_AFTER === "number" ? (regShared.STAFF_PIN_DEVICE_THROTTLE_AFTER as number) : 10;
    const NK = typeof regShared?.STAFF_PIN_DEVICE_THROTTLE_AFTER === "number" && typeof regShared?.STAFF_PIN_DEVICE_THROTTLE_MS === "number" ? "" : `${MISSING} STAFF_PIN_DEVICE_THROTTLE_AFTER/_MS (register-shared.ts) · `;
    const verify = (dev: string, pin: string, userId?: string) => call(staffMod, "verifyStaffPin", uctx("U1", "X", dev), { unitId: U.U1, deviceId: dev, pin, ...(userId ? { userId } : {}) });
    const row0 = T ? await P.posStaffPin.findFirst({ where: { tenantId: T, unitId: U.U1, userId: uid("C1") } }).catch(() => null) : null;
    const wrong = ["907531", "907532", "907533", "907534", "907535", "907536", "907537", "907538", "907539", "907540", "907541", "907542"];
    for (let i = 0; i < N; i++) {
      const r = keep(`K1 ผิด ${i + 1}`, await verify(DEV1, wrong[i % wrong.length]!));
      if (!refused(r, "PIN_INVALID")) p.push(`ผิดครั้งที่ ${i + 1} → ${codeOf(r)}`);
    }
    const t = keep("K1 ถูกบนเครื่องที่ถูกกั้น", await verify(DEV1, "258014"));
    if (!refused(t, "PIN_THROTTLED")) p.push(`ครั้งที่ ${N + 1} (PIN ถูก) เครื่อง 1 → ${codeOf(t)}`);
    const o = await verify(DEV2, "258014");
    if (o?.ok !== true || o.userId !== uid("C1")) p.push(`เครื่อง 2 → ${codeOf(o)}`);
    const row1 = T ? await P.posStaffPin.findFirst({ where: { tenantId: T, unitId: U.U1, userId: uid("C1") } }).catch(() => null) : null;
    if (row0 && row1 && (row1.failedCount !== row0.failedCount || !!row1.lockedUntil !== !!row0.lockedUntil)) p.push(`failedCount ${row0.failedCount}→${row1.failedCount}`);
    chk("K1", NK === "" && p.length === 0, `ผิด ${N} → PIN_THROTTLED เฉพาะเครื่องนั้น`, FX(NK + (p.join(" · ") || "ครบ")));
  }
  // ORACLE-EDIT (แก้รอบ 1 F2): K1c ก่อน K1b (K1c ใช้ U1 ที่ K1 ผิดไปแล้ว N ครั้ง — รวม 2N < N_U ⇒ ด่านต่อสาขาไม่ปน) · K1b ใช้ U2 ล้วน
  {
    const p: string[] = [];
    const N = typeof regShared?.STAFF_PIN_DEVICE_THROTTLE_AFTER === "number" ? (regShared.STAFF_PIN_DEVICE_THROTTLE_AFTER as number) : 10;
    const anonAt = (u: string, dev: string, pin: string, userId?: string) => call(staffMod, "verifyStaffPin", uctx(u, "X", dev), { unitId: U[u], deviceId: dev, pin, ...(userId ? { userId } : {}) });
    for (let i = 0; i < N; i++) {
      const r = await anonAt("U1", `qc118${RAND}c${i}`, `9076${String(10 + i).padStart(2, "0")}`);
      if (!refused(r, "PIN_INVALID")) p.push(`รหัสใหม่ครั้งที่ ${i + 1} → ${codeOf(r)}`);
    }
    const t = keep("K1c รหัสไม่ลงทะเบียนใหม่ PIN ถูก", await anonAt("U1", `qc118${RAND}cx`, "258014"));
    if (!refused(t, "PIN_THROTTLED")) p.push(`รหัสไม่ลงทะเบียนใหม่ (PIN ถูก) หลังผิด ${N} → ${codeOf(t)} (คาด PIN_THROTTLED)`);
    const named = await anonAt("U1", `qc118${RAND}cy`, "258014", uid("C1"));
    if (named?.ok !== true || named.userId !== uid("C1")) p.push(`ระบุคนบนรหัสไม่ลงทะเบียน → ${codeOf(named)} (คาด ok)`);
    const reg = await anonAt("U1", DEV2, "258014");
    if (reg?.ok !== true || reg.userId !== uid("C1")) p.push(`เครื่องลงทะเบียน DEV2 → ${codeOf(reg)} (คาด ok)`);
    chk("K1c", p.length === 0, `รหัสไม่ลงทะเบียน = ถังเดียวต่อสาขา (ผิด ${N} → PIN_THROTTLED)`, FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const NU = typeof regShared?.STAFF_PIN_UNIT_THROTTLE_AFTER === "number" ? (regShared.STAFF_PIN_UNIT_THROTTLE_AFTER as number) : 30;
    const NUK = typeof regShared?.STAFF_PIN_UNIT_THROTTLE_AFTER === "number" ? "" : `${MISSING} STAFF_PIN_UNIT_THROTTLE_AFTER (register-shared.ts) · `;
    const anonAt = (u: string, dev: string, pin: string) => call(staffMod, "verifyStaffPin", uctx(u, "X", dev), { unitId: U[u], deviceId: dev, pin });
    // เครื่องลงทะเบียนเพิ่มที่ U2 (DEV3 มีแล้ว) — แต่ละเครื่องผิดไม่เกิน 9 · ไม่ลงทะเบียน 3 รหัส (ถัง 3) ⇒ ไม่มีด่านต่อเครื่อง/ถังตัวไหนถึงเกณฑ์
    const extra = [`qc118${RAND}e1`, `qc118${RAND}e2`, `qc118${RAND}e3`];
    for (const d of extra) {
      const rg = await call(devMod, "registerDevice", uctx("U2"), A("OWNER"), { name: `เครื่อง QC ${d.slice(-2)}`, deviceCode: d });
      if (rg?.ok !== true) p.push(`(fixture) registerDevice ${d.slice(-2)} → ${codeOf(rg)}`);
    }
    const plan: string[] = [];
    for (const d of [DEV3, extra[0]!, extra[1]!]) for (let i = 0; i < 9; i++) plan.push(d);
    for (let i = 0; plan.length < NU; i++) plan.push(`qc118${RAND}b${i}`);
    let n = 0;
    for (const d of plan) {
      n++;
      const r = await anonAt("U2", d, `9077${String(10 + (n % 80)).padStart(2, "0")}`);
      if (!refused(r, "PIN_INVALID")) p.push(`ผิดครั้งที่ ${n} (${d === DEV3 ? "DEV3" : d.slice(-2)}) → ${codeOf(r)}`);
    }
    const t = keep("K1b ครั้งที่ N_U+1 เครื่องใหม่", await anonAt("U2", extra[2]!, "907799"));
    if (!refused(t, "PIN_THROTTLED")) p.push(`ครั้งที่ ${NU + 1} (เครื่องลงทะเบียนที่ยังไม่เคยผิด) ที่ U2 → ${codeOf(t)} (คาด PIN_THROTTLED)`);
    const other = await anonAt("U1", DEV2, "258014");
    if (other?.ok !== true || other.userId !== uid("C1")) p.push(`สาขา U1 (DEV2 PIN ถูก) → ${codeOf(other)} (คาด ok)`);
    chk("K1b", NUK === "" && p.length === 0, `ผิดรวม ${NU} ที่สาขา → PIN_THROTTLED ทั้งสาขา · สาขาอื่นไม่โดน`, FX(NUK + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const taken = keep("K2 PIN ซ้ำ", await call(staffMod, "setStaffPin", uctx("U1"), A("C2"), { userId: uid("C2"), pin: "258014" }));
    const weak = keep("K2 PIN อ่อน", await call(staffMod, "setStaffPin", uctx("U1"), A("C2"), { userId: uid("C2"), pin: "1234" }));
    if (codeOf(taken) === "PIN_TAKEN") p.push("ยังคืน PIN_TAKEN");
    if (/มีคน|ใช้อยู่|ซ้ำ/.test(String(taken?.message ?? ""))) p.push(`ข้อความบอกว่ามีคนใช้ (${short(taken?.message, 40)})`);
    if (taken?.ok === true) {
      const anon = await call(staffMod, "verifyStaffPin", uctx("U1", "X", DEV2), { unitId: U.U1, deviceId: DEV2, pin: "258014" });
      if (anon?.ok === true) p.push(`PIN ซ้ำแบบไม่ระบุคน → ได้โทเคนของ ${anon.userId === uid("C1") ? "C1" : anon.userId === uid("C2") ? "C2" : "?"} (ต้อง PIN_INVALID)`);
      for (const k of ["C1", "C2"]) {
        const v = await call(staffMod, "verifyStaffPin", uctx("U1", "X", DEV2), { unitId: U.U1, deviceId: DEV2, pin: "258014", userId: uid(k) });
        if (v?.ok !== true || v.userId !== uid(k)) p.push(`ระบุ ${k} → ${codeOf(v)}`);
      }
    } else if (!(taken?.ok === false && weak?.ok === false && taken.code === weak.code && taken.message === weak.message)) p.push(`ปฏิเสธแต่แยกจาก PIN อ่อนได้ (${codeOf(taken)} vs ${codeOf(weak)})`);
    chk("K2", p.length === 0, "PIN ซ้ำแยกไม่ออก (ok + ไม่ระบุคนไม่ผ่าน · หรือเหมือน PIN อ่อน)", FX(p.join(" · ") || `ครบ (${codeOf(taken)})`));
  }
  {
    const p: string[] = [];
    let polDisc = "";
    if (!fx) {
      try {
        polDisc = (await apSvc.createPolicy({ tenantId: T }, { name: `QC ส่วนลดเกิน ${RAND}`, entityType: "POS_DISCOUNT_OVER", steps: [{ order: 1, approverRole: "MANAGER" }] })).id;
      } catch (e) {
        p.push(`(fixture) กติกา: ${(e as Error).message.slice(0, 60)}`);
      }
    }
    const CART = { lines: [{ name: `K3 ส่วนลด ${RAND}`, qty: 1, unitPriceSatang: 20_000 }], billDiscount: { type: "PERCENT", value: 1500 } };
    const sub = (key: string, extra: Record<string, unknown> = {}) =>
      call(register, "submitRegisterSale", uctx("U1", "X", DEV1), A("C1"), { ...CART, idempotencyKey: key, expectedGrandTotalSatang: 17_000, payMethods: [{ type: "CASH", amountSatang: 17_000 }], cashReceivedSatang: 17_000, ...extra });
    const counts = async () => ({
      held: T ? Number(await P.posHeldCart.count({ where: { tenantId: T } }).catch(() => -1)) : -1,
      req: T ? Number(await P.approvalRequest.count({ where: { tenantId: T, entityType: "POS_DISCOUNT_OVER" } }).catch(() => -1)) : -1,
    });
    let lastReq = "", lastHeld = "";
    for (let round = 1; round <= 3 && polDisc; round++) {
      const key = newKey(`k3r${round}`);
      const c0 = await counts();
      const [a, b] = await Promise.all([sub(key), sub(key)]);
      keep(`K3 รอบ ${round} a`, a);
      keep(`K3 รอบ ${round} b`, b);
      const c1 = await counts();
      const okCode = (r: Any) => refused(r, "APPROVAL_REQUIRED") || refused(r, "PENDING_APPROVAL");
      if (!okCode(a) || !okCode(b)) p.push(`รอบ ${round}: ${codeOf(a)}/${codeOf(b)}`);
      if (a?.requestId !== b?.requestId || !a?.requestId) p.push(`รอบ ${round}: requestId ต่างกัน`);
      if (c1.held - c0.held !== 1 || c1.req - c0.req !== 1) p.push(`รอบ ${round}: บิลพัก +${c1.held - c0.held} คำขอ +${c1.req - c0.req} (คาด +1/+1)`);
      if (T && (await P.posSale.count({ where: { tenantId: T, idempotencyKey: { endsWith: key } } }).catch(() => -1)) !== 0) p.push(`รอบ ${round}: มีบิล`);
      lastReq = String(a?.requestId ?? "");
      lastHeld = String(a?.heldCartId ?? b?.heldCartId ?? "");
    }
    // อนุมัติแล้วส่งพร้อมกันคีย์เดียว
    if (lastReq) {
      const d = await call(apSvc, "decide", { ...A("MGR") }, { tenantId: T }, lastReq, { decision: "APPROVED" });
      if (d?.ok !== true) p.push(`decide → ${short(d, 60)}`);
      await drain();
      await call(heldMod, "recallHeldCart", uctx("U1", "X", DEV1), A("C1"), { id: lastHeld });
      const key = newKey("k3ok");
      const [a, b] = await Promise.all([sub(key, { heldCartId: lastHeld }), sub(key, { heldCartId: lastHeld })]);
      // หน้าขายเก็บคีย์เป็น "reg2:<key>" (register.ts REG_KEY_PREFIX) — นับด้วย endsWith
      const n = T ? Number(await P.posSale.count({ where: { tenantId: T, idempotencyKey: { endsWith: key } } }).catch(() => -1)) : -1;
      if (n !== 1) p.push(`หลังอนุมัติ บิล ${n} (คาด 1) ${codeOf(a)}/${codeOf(b)}`);
      const win = a?.ok === true ? a : b;
      const other = a?.ok === true ? b : a;
      if (win?.ok === true && !((other?.ok === true && other.saleId === win.saleId) || refused(other, "IDEMPOTENCY_CONFLICT"))) p.push(`อีกตัว → ${codeOf(other)}`);
    } else if (polDisc) p.push("ไม่มีคำขอให้อนุมัติ");
    chk("K3", !!polDisc && p.length === 0, "คีย์เดียวพร้อมกัน = พักครั้งเดียว · บิลเดียว", FX(joinP(p) || "ครบ"));
  }
  {
    const p: string[] = [];
    let rid = "";
    try {
      await apSvc.createPolicy({ tenantId: T }, { name: `QC ห้ามอนุมัติตัวเอง ${RAND}`, entityType: "QC_P118_SELF", steps: [{ order: 1, approverRole: "MANAGER" }] });
      const s = await apSvc.submitForApproval({ tenantId: T }, { entityType: "QC_P118_SELF", entityId: `qc118-${RAND}-self`, amountSatang: 100, requestedById: uid("MGR") });
      rid = String(s?.requestId ?? "");
    } catch (e) {
      p.push(`(fixture) ${(e as Error).message.slice(0, 60)}`);
    }
    if (rid) {
      const d = await call(apSvc, "decide", { ...A("MGR") }, { tenantId: T }, rid, { decision: "APPROVED" });
      if (d?.ok !== false) p.push(`ผู้ยื่นอนุมัติเอง → ${short(d, 60)}`);
      const rq = await P.approvalRequest.findUnique({ where: { id: rid } }).catch(() => null);
      if (rq?.status !== "PENDING") p.push(`สถานะ ${rq?.status}`);
      const dec = Number(await P.approvalDecision.count({ where: { requestId: rid } }).catch(() => -1));
      if (dec !== 0) p.push(`ApprovalDecision ${dec}`);
      const ob = Number(await P.outboxEvent.count({ where: { tenantId: T, idempotencyKey: `approval.request.approved#${rid}` } }).catch(() => -1));
      if (ob !== 0) p.push(`outbox approved ${ob}`);
      const o = await call(apSvc, "decide", { ...A("OWNER") }, { tenantId: T }, rid, { decision: "APPROVED" });
      if (o?.ok !== true) p.push(`(ตัวควบคุม) OWNER → ${short(o, 60)}`);
    }
    chk("K4", !!rid && p.length === 0, "decide ของผู้ยื่น = ok:false ที่แกน", FX(p.join(" · ") || "ครบ"));
  }
  // ORACLE-EDIT (แก้รอบ 2 F3): K4b — เจ้าของคนเดียวอนุมัติของตัวเองได้ · มีเจ้าของคนที่ 2 แล้วห้าม (ร้านชั่วคราว T · ลบไปกับ T/ผู้ใช้ชั่วคราว)
  {
    const p: string[] = [];
    let r1 = "", r2 = "", owner2 = "", owner2Mid = "";
    const owners = async () => (T ? Number(await P.membership.count({ where: { tenantId: T, role: "OWNER", acceptedAt: { not: null } } }).catch(() => -1)) : -1);
    const submitOwn = async (tag: string) =>
      String((await apSvc.submitForApproval({ tenantId: T }, { entityType: "QC_P118_SOLE", entityId: `qc118-${RAND}-${tag}`, amountSatang: 100, requestedById: uid("OWNER") }))?.requestId ?? "");
    try {
      await apSvc.createPolicy({ tenantId: T }, { name: `QC เจ้าของคนเดียว ${RAND}`, entityType: "QC_P118_SOLE", steps: [{ order: 1, approverRole: "OWNER" }] });
      r1 = await submitOwn("sole1");
    } catch (e) {
      p.push(`(fixture) ${(e as Error).message.slice(0, 60)}`);
    }
    if (r1) {
      const n1 = await owners();
      if (n1 !== 1) p.push(`(fixture) เจ้าของ ${n1} คน (คาด 1)`);
      const d1 = await call(apSvc, "decide", { ...A("OWNER") }, { tenantId: T }, r1, { decision: "APPROVED" });
      if (d1?.ok !== true || d1?.status !== "APPROVED") p.push(`เจ้าของคนเดียวอนุมัติของตัวเอง → ${short(d1, 70)}`);
      // เพิ่มเจ้าของคนที่ 2 (รับคำเชิญแล้ว) — prisma ตรงในร้านชั่วคราว
      try {
        const u2 = await P.user.create({ data: { email: `${EMAIL_PREFIX}owner2@qc.invalid`, name: `OWNER2 คิวซี${RAND}` } });
        owner2 = u2.id;
        owner2Mid = (await P.membership.create({ data: { userId: u2.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } })).id;
        r2 = await submitOwn("sole2");
      } catch (e) {
        p.push(`(fixture เจ้าของ 2) ${(e as Error).message.slice(0, 60)}`);
      }
      if (r2) {
        const n2 = await owners();
        if (n2 !== 2) p.push(`(fixture) เจ้าของ ${n2} คน (คาด 2)`);
        const d2 = await call(apSvc, "decide", { ...A("OWNER") }, { tenantId: T }, r2, { decision: "APPROVED" });
        if (d2?.ok !== false || d2?.code !== "SELF_APPROVAL") p.push(`มีเจ้าของ 2 คน อนุมัติของตัวเอง → ${short(d2, 70)}`);
        const b2 = await call(apSvc, "bulkDecide", { ...A("OWNER") }, { tenantId: T }, [r2], "APPROVED");
        if (b2?.done !== 0 || b2?.failed?.length !== 1) p.push(`bulkDecide → ${short(b2, 70)}`);
        const rq = await P.approvalRequest.findUnique({ where: { id: r2 } }).catch(() => null);
        if (rq?.status !== "PENDING") p.push(`สถานะ ${rq?.status}`);
        const dec = Number(await P.approvalDecision.count({ where: { requestId: r2 } }).catch(() => -1));
        if (dec !== 0) p.push(`ApprovalDecision ${dec}`);
        const o = await call(apSvc, "decide", { userId: owner2, role: "OWNER", unitAccess: ["*"], permissions: {} }, { tenantId: T }, r2, { decision: "APPROVED" });
        if (o?.ok !== true) p.push(`(ตัวควบคุม) OWNER คนที่ 2 → ${short(o, 60)}`);
      }
    }
    // คืนสภาพ "เจ้าของคนเดียว" ของ T สำหรับข้อถัดไป (ผู้ใช้ชั่วคราวลบตอนล้างร้าน)
    if (owner2Mid) await P.membership.delete({ where: { id: owner2Mid } }).catch(() => null);
    chk("K4b", !!r1 && !!r2 && p.length === 0, "เจ้าของคนเดียว = ok · เจ้าของ 2 คน = SELF_APPROVAL", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ E1 ปฏิเสธเป็นข้อมูล ════════
  {
    const p: string[] = [];
    const seen = new Set(dataRefusals.map(([, r]) => String(r.code)));
    for (const c of NEW_CODES) if (!seen.has(c)) p.push(`ไม่พบ ${c}`);
    for (const [lbl, r] of dataRefusals) {
      if (r.threw) p.push(`${lbl}: throw (${r.code} ${short(r.message, 40)})`);
      else if (typeof r.message !== "string" || !r.message.trim()) p.push(`${lbl}: ไม่มี message`);
      else if (!THAI.test(r.message)) p.push(`${lbl}: message ไม่ใช่ไทย`);
    }
    const th = JSON.parse(rd(F.msgTh) || "{}"), en = JSON.parse(rd(F.msgEn) || "{}");
    const at = (j: Any, k: string) => String(k.split(".").reduce((o: Any, x) => (isRecord(o) ? o[x] : undefined), j?.settings) ?? "");
    for (const c of SETTINGS_CODES) {
      const k = callSync(sharedMod, "settingsRefusalMessageKey", c);
      if (typeof k !== "string" || (k === "errors.unknown" && c !== "UNKNOWN") || !THAI.test(at(th, k)) || !at(en, k)) p.push(`settingsRefusalMessageKey(${c}) = ${short(k, 40)}`);
    }
    chk("E1", p.length === 0, `${dataRefusals.length} คำปฏิเสธ · รหัสใหม่ครบ · คีย์ข้อความ`, joinP(p) || "ครบ");
  }
}

// ═════════════════════════ 6. คืนสภาพ — ลบร้านชั่วคราวทั้งสอง + ผู้ใช้ชั่วคราว ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; usersLeft: number; err: string };
async function wipeTenants(): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, usersLeft: 0, err: "" };
  const targets = ([[T, T_SLUG], [T2, T2_SLUG]] as [string, string][]).filter(([id]) => !!id);
  if (targets.length) {
    for (const [id, slug] of targets) {
      try {
        const t = (await P.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, id)) as Any[];
        if (t.length && t[0].slug !== slug) {
          rep.err = `slug ไม่ตรง (${t[0].slug}) — ไม่ลบ`;
          return rep;
        }
      } catch (e) {
        rep.err = `อ่าน Tenant ไม่ได้: ${(e as Error).message.slice(0, 60)}`;
        return rep;
      }
    }
    await drain();
    await sleep(300);
    const tables = ((await P.$queryRawUnsafe(
      `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
       WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
    )) as Any[]).map((r: Any) => String(r.t));
    rep.tables = tables.length;
    for (const [id, slug] of targets) {
      await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, id).catch(() => {});
      let pending = [...tables];
      for (let pass = 0; pass < 10 && pending.length; pass++) {
        const next: string[] = [];
        for (const tb of pending) {
          try {
            await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, id);
          } catch {
            next.push(tb);
          }
        }
        pending = next;
      }
      try {
        await P.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $2`, id, slug);
      } catch (e) {
        rep.err = [rep.err, `ลบ Tenant ${slug} ไม่ได้: ${(e as Error).message.slice(0, 80)}`].filter(Boolean).join(" · ");
      }
      for (const tb of tables) {
        try {
          const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, id)) as Any[])[0]?.n ?? 0);
          if (n) rep.left[`${slug === T_SLUG ? "T" : "T2"}.${tb}`] = n;
        } catch {
          rep.left[`${tb}`] = -1;
        }
      }
      rep.tenantLeft += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`, id)) as Any[])[0]?.n ?? 0);
    }
  }
  try {
    await P.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX, endsWith: "@qc.invalid" } } });
    rep.usersLeft = Number(await P.user.count({ where: { email: { startsWith: EMAIL_PREFIX } } }));
  } catch (e) {
    rep.err = [rep.err, `ลบผู้ใช้ไม่ได้: ${(e as Error).message.slice(0, 80)}`].filter(Boolean).join(" · ");
  }
  return rep;
}

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
let wipe: WipeReport = { tables: 0, left: {}, tenantLeft: 0, usersLeft: 0, err: "" };
try {
  await runStatic();
  await runPure({ regShared: await tryImport("@/lib/modules/pos/register-shared"), shared: ex(F.shared) ? await tryImport("@/lib/modules/pos/settings-shared") : null, intentShared: await tryImport("@/lib/modules/pos/payment-intent-shared"), locale: localeMod, access: accessMod }, { u1: "unit-qc-1", u2: "unit-qc-2" });
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  installFetchGuard();
  try {
    wipe = await wipeTenants();
    const residue = Object.values(wipe.left).reduce((a, b) => a + Math.abs(b), 0) + wipe.tenantLeft + wipe.usersLeft;
    console.log(`  ลบร้านชั่วคราว ${T || "(ไม่ได้สร้าง)"} + ${T2 || "-"}: ${wipe.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(wipe.left)} · Tenant ${wipe.tenantLeft} · ผู้ใช้ ${wipe.usersLeft}${wipe.err ? ` · ${wipe.err}` : ""}`);
  } catch (e) {
    wipe.err = `cleanup: ${(e as Error).message.slice(0, 200)}`;
    console.log(`💥 ${wipe.err}`);
  } finally {
    removeFetchGuard();
  }
}
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
await sleep(200);
const tempLeft = Object.entries(wipe.left).map(([k, v]) => `${k}:${v}`);
chk("Z1", tempLeft.length === 0 && wipe.tenantLeft === 0 && wipe.usersLeft === 0 && !wipe.err, "ร้านชั่วคราว 0 แถว · Tenant ถูกลบ · ผู้ใช้ชั่วคราว 0",
  [tempLeft.length ? `ร้านชั่วคราวเหลือ ${tempLeft.join(", ")}` : `ร้านชั่วคราว 0 (${wipe.tables} ตาราง)`, wipe.tenantLeft ? "แถว Tenant ยังอยู่" : "", wipe.usersLeft ? `ผู้ใช้เหลือ ${wipe.usersLeft}` : "ผู้ใช้ 0", wipe.err].filter(Boolean).join(" · "));
/** รอยของรอบนี้ในร้าน seed (ตัวตัดสิน Z2 — ไม่ไวต่อ lane อื่นที่เขียนพร้อมกัน) */
async function seedLeaks(): Promise<string[]> {
  const out: string[] = [];
  const n = async (lbl: string, f: () => Promise<unknown>) => {
    try {
      const v = Number(await f());
      if (v) out.push(`${lbl}:${v}`);
    } catch (e) {
      out.push(`${lbl}:err ${(e as Error).message.slice(0, 40)}`);
    }
  };
  const since = new Date(RUN_START - MIN);
  const like = `%${RAND}%`;
  await n("appSystem.settings", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "AppSystem" WHERE "tenantId" = ANY($1::text[]) AND (coalesce("settings"::text,'') LIKE $2 OR coalesce("settings"::text,'') LIKE ANY($3::text[]))`, TIDS, like, MY_IDS.map((x) => `%${x}%`))) as Any[])[0]?.n);
  await n("businessUnit.settings", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "BusinessUnit" WHERE "tenantId" = ANY($1::text[]) AND coalesce("settings"::text,'') LIKE $2`, TIDS, like)) as Any[])[0]?.n);
  await n("auditLog", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = ANY($1::text[]) AND "createdAt" >= $2 AND ((coalesce("after"::text,'') || coalesce("before"::text,'')) LIKE $3 OR "targetId" = ANY($4::text[]))`, TIDS, since, like, MY_IDS)) as Any[])[0]?.n);
  await n("outboxEvent", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND "createdAt" >= $2 AND ("payload"::text LIKE $3 OR "idempotencyKey" LIKE $3)`, TIDS, since, like)) as Any[])[0]?.n);
  await n("accountSystemLink", () => P.accountSystemLink.count({ where: { tenantId: { in: TIDS }, linkedId: { in: MY_IDS } } }));
  await n("approvalPolicy", () => P.approvalPolicy.count({ where: { tenantId: { in: TIDS }, name: { contains: RAND } } }));
  await n("posSale", () => P.posSale.count({ where: { tenantId: { in: TIDS }, idempotencyKey: { contains: `qc118-${RAND}` } } }));
  return out;
}
const leaks = await seedLeaks();
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
chk("Z2", leaks.length === 0, "ร้าน seed ไม่มีรอยของรอบนี้ (ลายนิ้วมือ = ข้อมูล)",
  [leaks.length ? `รอยในร้าน seed ${leaks.join(", ")}` : "ไม่มีรอย", fpDrift.length ? `(ข้อมูล · lane อื่นอาจเขียน) ลายนิ้วมือต่าง ${fpDrift.join(", ")}` : `ลายนิ้วมือเท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`].join(" · "));
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}${U_PHASE ? " · เฟส U" : " · เฟส S"}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, phase: U_PHASE ? "U" : "S", total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, missing: skipReasons, guardHits: guardHits.length, residue: tempLeft.length + wipe.tenantLeft + wipe.usersLeft, leaks, fpDrift })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P1.18 S: 5 แท็บ UI · ลิ้นชักประวัติ · ตัวสลับภาษาบนจอ · visual states (P1.18U) · ปิดเฟส R14–R16 (ผู้คุมงาน) ·
//   ช่องทางขาย/ออฟไลน์ (ไม่มีเซิร์ฟเวอร์ — R11) · ตัวลดหน้าต่างด่าน PIN ต่อเครื่อง (STAFF_PIN_DEVICE_THROTTLE_MS — ตรวจได้เมื่อรู้ที่เก็บ · CONTROLLER-DECISION) ·
//   qc-pos-p1.15 PN3/PN8 (PIN_TAKEN) ต้อง ORACLE-EDIT เมื่อ K2 ลง — ไม่แก้ในไฟล์นี้
