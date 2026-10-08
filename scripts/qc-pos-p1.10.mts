// QC — POS RUN ใบ P1.10: ทะเบียนเครื่อง · ตั้งค่าเครื่องพิมพ์ · ข้อมูลใบเสร็จ · ตัวเรนเดอร์ HTML + ESC/POS · ใบกำกับภาษีอย่างย่อ · เขียนก่อนสร้าง (fail-before)
// requires: pos-seed
//
// สัญญา: ledger/pos-briefs/pos-brief-P1.10.md (มติ R1–R9 · คำถามเจ้าของ Q1–Q4 ใช้ค่าปริยายในไฟล์นี้) · pos-brief-COMMON · pos-brief-LANE-RULES
//        docs/modules/14-pos.md §3.5 D1–D5 · §3.6 T1–T4 T8 · PosDevice :606-624 · settings :655-660
//        ภาพ ledger/design-pos/11-customer-display.png แผง B = ลำดับเนื้อหาใบเสร็จ (หัว → ชื่อเอกสาร → เลขที่ → รายการ → ยอด → ชำระ → สมาชิก → ท้าย)
//        โน้ต: ledger/wo-notes/pos-P1.10-oracle.md (รายการข้อ · ผลที่คาดบนฐาน · ชื่อที่ตั้งใหม่ · ความคลาดเคลื่อน · CONTROLLER-DECISION)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้ และลงทะเบียนในโน้ตหัวข้อ "Names I had to invent" — ผู้คุมงานต้องรับรองก่อนผู้สร้างเริ่ม
//   ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P1.10 ต้องส่ง (ข้อสอบนี้คือสัญญา · ย่อจาก brief §2):
//   schema: model PosDevice {id tenantId unitId systemId name deviceCode status registeredByUserId lastSeenAt? posRegNo? printerConfig Json? revokedAt?
//     createdAt updatedAt} @@unique([unitId, deviceCode]) · enum PosDeviceStatus ACTIVE|REVOKED · migration สร้างอย่างเดียว · core/scope.ts PosDevice: sys()
//   src/lib/modules/pos/device.ts (ctx = RegisterCtx · คืนคำปฏิเสธเป็นข้อมูล): registerDevice · updateDevice · revokeDevice · listDevices · heartbeat ·
//     posDeviceLimit(tenant) · parsePrinterConfig (ไฟล์ที่ client import ได้ก็ได้ — ข้อสอบหาใน device-shared.ts / device.ts / receipt-render.ts)
//   src/lib/modules/pos/receipt.ts receiptPayload · receipt-render.ts renderReceiptHtml + encodeEscPos (บริสุทธิ์) ·
//   receipt-settings.ts parseReceiptSettings · posReceiptSettings · updatePosReceiptSettings · actions 3 ไฟล์ ("use server")
//   การ์ด DEVICE_REVOKED ใน submitRegisterSale · openShift · holdRegisterCart · recallHeldCart · heartbeat ใน registerStatus
//   สิทธิ์ pos.device.manage · รหัส DEVICE_REVOKED DEVICE_LIMIT DEVICE_NOT_FOUND SALE_NOT_FOUND (+ PERMISSION_DENIED ตามมติ CD1 · VALIDATION)
//
// ขอบเขต: ST สถิต · G ทะเบียนเครื่อง · V การ์ดเครื่องที่ถูกเพิกถอน · A สิทธิ์/ข้ามขอบเขต · PC ตั้งค่าเครื่องพิมพ์ · RS ตั้งค่าใบเสร็จ ·
//   P ข้อมูลใบเสร็จ · H ตัวเรนเดอร์ HTML · E ตัวเรนเดอร์ ESC/POS · D ปฏิเสธเป็นข้อมูล · Z คืนสภาพ
//   หน้า 17A/17B · ปุ่มพิมพ์ใน PayDone · WebUSB/BT · ชิปเครื่องพิมพ์ = P1.10U (visual ของผู้คุมงาน) — ไม่อยู่ในข้อสอบนี้
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p1.6/p1.9): SKIP เมื่อของ P1.10 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (ต้องแดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id โดยไม่แตะ DB · --no-db = รันเฉพาะข้อสถิต (ไม่โหลด env/prisma · exit 1 ถ้าแดง)
//    ก่อนเขียนแถวแรกต้องเป็น host ep-frosty-lab (QC4) เท่านั้น · แถวชั่วคราวติดป้าย `posqc-p110-<rand>` ในร้าน QC กาแฟ (สาขา/ระบบ sandbox) · ลบทั้งหมดใน finally
//    บิลทุกใบของข้อสอบทำใน tx ของข้อสอบแล้วลบ event pos.sale.paid ก่อน commit (quietTx แบบ qc-pos-p1.6) ⇒ ไม่มีการลงบัญชี/แต้มจริง
//    Tenant.limits ของร้าน QC กาแฟถูกแก้ชั่วคราว (SQL ตรง · คืนค่า limits + updatedAt เดิมใน finally) · นับแถวก่อน/หลัง (Z1) + ลายนิ้วมือ (Z2)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const SUITE = "qc-pos-p1.10";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) ═════════════════════════
// X-group: "-" = เชิงหน้าที่ล้วน · X1 idempotency · X2 ข้ามขอบเขต · X3 สิทธิ์ · X4 เงิน/เอกสารเงิน (POS-MASTER-PLAN §3)
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P1.10-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "-", "[static · R1] schema: model PosDevice คอลัมน์ R1 ครบ (lastSeenAt/posRegNo/printerConfig Json/revokedAt nullable · status PosDeviceStatus) · @@unique([unitId, deviceCode]) · enum PosDeviceStatus ACTIVE|REVOKED"),
  D("ST2", "-", "[static · R1 · F15.2] migration ที่แตะ PosDevice: CREATE TYPE \"PosDeviceStatus\" · CREATE TABLE \"PosDevice\" · unique (unitId, deviceCode) · index (tenantId, unitId, status) · ทุกคำสั่งเป็น CREATE TABLE/TYPE/INDEX เท่านั้น"),
  D("ST3", "X3", "[static · R1 R2] core/scope.ts PosDevice: sys() · core/permissions.ts โมดูล pos มี pos.device.manage"),
  D("ST4", "-", "[static · R8] ไฟล์ device.ts device-actions.ts receipt.ts receipt-render.ts receipt-actions.ts receipt-settings.ts receipt-settings-actions.ts มีครบ · actions \"use server\" · export async function ล้วน (ไม่มี export type) · action ครบชื่อ + เรียกบริการ + catch · ไม่มี outbox/event ใหม่"),
  D("ST5", "-", "[static · R6] receipt-render.ts บริสุทธิ์: ไม่ import @/lib/core/db · @prisma/client · server-only · prisma · next/* · ไฟล์ฝั่งเซิร์ฟเวอร์ของ pos · ไม่เรียก Date.now()/new Date() ไม่มีอาร์กิวเมนต์"),
  D("ST6", "-", "[static · R7 R8] ข้อความ pos.device.{title register revoke online offline printer} + pos.receipt.{title taxInvoiceAbb copy reprint footerDefault} + pos.register.errors.{deviceRevoked deviceLimit deviceNotFound} th+en · ทุกคีย์ pos.device.*/pos.receipt.* มีทั้งสองภาษา · en ไม่มีอักษรไทย"),
  D("ST7", "-", "[static · R7] refusalMessageKey: DEVICE_REVOKED→errors.deviceRevoked · DEVICE_LIMIT→errors.deviceLimit · DEVICE_NOT_FOUND→errors.deviceNotFound"),
  // ── G ทะเบียนเครื่อง ──
  D("G1", "X1", "registerDevice({name, deviceCode}) → แถว ACTIVE (ร้าน/สาขา/ระบบ/registeredByUserId ถูก · deviceCode = รหัสที่ส่ง) · ลงซ้ำรหัสเดิม (ชื่ออื่น) → ok แถวเดิม id เดิม ชื่อเดิม ไม่มีแถวเพิ่ม · ชื่อว่าง/61 ตัว · รหัสสั้น/มีช่องว่าง/65 ตัว → VALIDATION ไม่มีแถว"),
  D("G2", "-", "เพดานเครื่องปริยาย 3 ต่อสาขา (Tenant.limits ไม่มี posDevices): ACTIVE 3 แล้วเครื่องที่ 4 → DEVICE_LIMIT ไม่มีแถว · รหัสที่ลงแล้วลงซ้ำตอนเต็ม → ok · เพิกถอน 1 แล้วลงเครื่องที่ 4 ได้ (REVOKED ไม่นับ) · อีกสาขานับแยก"),
  D("G3", "-", "Tenant.limits.posDevices = 1 (แก้ชั่วคราว · คืนค่าเดิม) → สาขาใหม่ลงเครื่องแรก ok เครื่องที่สอง DEVICE_LIMIT · posDeviceLimit({limits}) บริสุทธิ์: null/{}/ค่าเพี้ยน (−1 · 1.5 · \"2\") = 3 · {posDevices:1} = 1 · {posDevices:5} = 5"),
  D("G4", "-", "updateDevice({id, name, posRegNo, printerConfig}) → แถวเปลี่ยน · printerConfig เก็บแบบ parse แล้ว (ค่าปริยายเติม · คีย์แปลกถูกทิ้ง) · printerConfig ผิด / ชื่อว่าง → VALIDATION แถวไม่เปลี่ยน"),
  D("G5", "-", "revokeDevice({id}) → REVOKED + revokedAt · กะ OPEN ของเครื่องนั้นยัง OPEN (ผู้จัดการปิดเอง) · registerDevice รหัสที่ถูกเพิกถอน → DEVICE_REVOKED แถวยัง REVOKED ไม่มีแถวใหม่"),
  D("G6", "-", "listDevices(): เฉพาะเครื่องของสาขา ctx · online true หลัง heartbeat · lastSeenAt 10 นาทีก่อน → online false · แถวมี status · เครื่องที่มีกะ OPEN พก openShift {shiftNo, openedAt} · ไม่มีกะ = null"),
  D("G7", "-", "heartbeat({deviceCode}) เขียน lastSeenAt · ยิงซ้ำภายใน 30 วินาทีไม่เขียน (lastSeenAt เท่าเดิม) · เก่า 31 วินาทีเขียนใหม่ · registerStatus(ctx.deviceId) อัปเดต lastSeenAt ที่เก่า 10 นาที · รหัสที่ไม่ได้ลงทะเบียนไม่สร้างแถว · แคชเชียร์ (pos.sale.create) heartbeat ได้"),
  // ── V การ์ดเครื่องที่ถูกเพิกถอน ──
  D("V1", "X3", "ctx.deviceId = รหัส REVOKED ของสาขานั้น: submitRegisterSale · openShift (ctx + input.deviceId และ input.deviceId อย่างเดียว) · holdRegisterCart · recallHeldCart → DEVICE_REVOKED · ไม่มีบิล/กะ/บิลพัก · บิลพักยัง HELD"),
  D("V2", "-", "ตัวควบคุมบวก: รหัสที่ไม่ได้ลงทะเบียนทำทั้ง 4 อย่างได้เหมือนวันนี้ (ขาย PAID · เปิดกะ · พัก · เรียกคืน) · รหัส ACTIVE ขายได้ · รหัสเดียวกับที่ถูกเพิกถอนแต่ที่อีกสาขา → ขายได้ (การ์ดต่อสาขา)"),
  // ── A สิทธิ์ / ข้ามขอบเขต ──
  D("A1", "X2", "เครื่องของอีกสาขา/อีกร้านมองไม่เห็น: listDevices(สาขา B) ไม่มีเครื่องของสาขา A · updateDevice/revokeDevice ข้ามสาขา → DEVICE_NOT_FOUND · เจ้าของร้าน QC อาหาร → DEVICE_NOT_FOUND · แถวไม่เปลี่ยน"),
  D("A2", "X3", "แคชเชียร์ (STAFF ไม่มี pos.device.manage) → register/update/revoke/list ถูกปฏิเสธ PERMISSION_DENIED (มติ CD1) ไม่มีแถว · STAFF ที่ได้ pos.device.manage ลงเครื่องได้ · updatePosReceiptSettings โดยแคชเชียร์ถูกปฏิเสธ"),
  D("A3", "X2", "receiptPayload: บิลอีกสาขา (แคชเชียร์สาขา A อ่านบิลสาขา B ของ POS เดียวกัน) → SALE_NOT_FOUND · ร้านอื่น → SALE_NOT_FOUND · id มั่ว → SALE_NOT_FOUND · บิลสาขาตัวเอง → ok · ไม่มี audit จากคำขอที่ถูกปฏิเสธ"),
  // ── PC เครื่องพิมพ์ ──
  D("PC1", "-", "parsePrinterConfig ค่าปริยาย (undefined/null/{}) = {paper \"80\", mode \"browser\", autoPrint false, drawerKick false, thaiText \"raster\", copies 1} · ค่าถูกครบทุกฟิลด์ผ่านตรงตัว · คีย์แปลกถูกทิ้ง"),
  D("PC2", "-", "parsePrinterConfig ค่าผิด → VALIDATION ระบุชื่อฟิลด์: paper \"72\"/58(ตัวเลข) · mode \"escpos\" · autoPrint \"yes\" · drawerKick 1 · thaiText \"utf8\" · copies 3/0 · ไม่ใช่ object (\"x\" · [])"),
  // ── RS ตั้งค่าใบเสร็จ ──
  D("RS1", "-", "parseReceiptSettings: ค่าปริยาย footer \"ขอบคุณที่อุดหนุนค่ะ\" · showPoints/showCashier/qrEReceipt true · header ว่าง logoUrl null · ขอบ 80/30/200/200 ผ่าน · 81/31/201/201 → VALIDATION ระบุฟิลด์ · logoUrl https ผ่าน · ftp:/javascript:/ไม่ใช่ URL → VALIDATION"),
  D("RS2", "-", "posReceiptSettings(ctx) ค่าปริยาย · updatePosReceiptSettings(เจ้าของ) เก็บที่ AppSystem.settings.pos.receipt โดยคีย์อื่นของ settings ไม่หาย · footer 201 → VALIDATION ค่าไม่เปลี่ยน · payload ถัดไปใช้ชื่อหัวบิล/footer ใหม่ (taxId ยังจากสมุดบัญชี)"),
  // ── P ข้อมูลใบเสร็จ ──
  D("P1", "X4", "payload บิล VAT (POS ผูกสมุดจด VAT + posAbbreviated): docType SALE · kind TAX_INVOICE_ABB · copy false · paper null · shop = โปรไฟล์สมุด (name/address/phone/taxId/branchNo/logoUrl) + branchName = ชื่อสาขา · device {name, posRegNo} ของเครื่องที่ขาย · doc {receiptNo, issuedAt ISO, cashierName, shiftNo}"),
  D("P2", "X4", "payload lines ตามลำดับบิล: ลาเต้ (ตัวเลือก 2 รายการ · ราคาต่อหน่วยรวมตัวเลือก) · ครัวซองต์ ×2 ส่วนลดบรรทัด 1,000 + note · qty/unitPrice/lineTotal/discount ตรงแถว DB · options เป็น string[] ที่มีชื่อตัวเลือก"),
  D("P3", "X4", "payload totals: subtotal = Σ qty×unitPrice (18,500) · lineDiscount 1,000 · billDiscount 500 · coupon 0 · tier 0 · serviceCharge 1,700 · grand 18,700 = แถว DB · subtotal − ส่วนลดทั้งหมด + SC = grand · vatBase + vat = grand · vat 1,223 · vatRateBp 700 · tip 500"),
  D("P4", "X4", "payload payments: CASH 10,000 tendered 20,000 change 10,000 · PROMPTPAY 9,200 ไม่มี tendered · Σ amount = grand + tip · member {name, tierName, pointEarned} ตรง DB"),
  D("P5", "X4", "kind: POS ไม่ผูกสมุด → RECEIPT (vat 0 · ไม่มี taxId/branchNo · fullTaxInvoiceHint false) · สมุดจด VAT แต่ปิด posAbbreviated → RECEIPT · ABB มี taxId (13 หลัก) + branchNo + fullTaxInvoiceHint true"),
  D("P6", "-", "copy:true → payload.copy true + AuditLog pos.receipt.reprint (targetType PosSale · targetId บิล) เพิ่ม 1 แถวต่อการเรียก (2 ครั้ง = 2 แถว) · copy false ไม่เขียน audit · footer.qrEReceiptUrl === null · labels.th/labels.en คีย์ชุดเดียวกัน ไม่ว่าง · en ไม่มีอักษรไทย · th มีอักษรไทย"),
  // ── H HTML ──
  D("H1", "-", "renderReceiptHtml(th, 80) มี data-section header→title→doc→lines→totals→payments→member→footer ตามลำดับภาพ 11B · เนื้อหาอยู่ในส่วนของมัน (ชื่อร้าน/taxId/POS no · ใบกำกับภาษีอย่างย่อ · เลขที่/แคชเชียร์ · รายการ+ตัวเลือก+ส่วนลด − · ฐาน VAT/VAT/ยอดสุทธิ · รับ/ทอน · แต้ม · footer + ขอใบกำกับเต็มรูปได้ภายใน 7 วัน)"),
  D("H2", "-", "HTML: @page 58mm/80mm ตามกระดาษ · \"สำเนา\" เฉพาะสำเนา · en (ข้อมูลอังกฤษล้วน) ไม่มีอักษรไทยทั้งไฟล์ + ลำดับส่วนเดียวกัน + สำเนามีคำ copy · เรียก 2 ครั้งได้ข้อความเดียวกันทุกตัว (th/en × 58/80)"),
  D("H3", "-", "HTML ใบเสร็จธรรมดา (kind RECEIPT): ไม่มีคำ \"ใบกำกับภาษี\" · ไม่มีคำแนะนำใบกำกับเต็มรูป · มีส่วน header/doc/lines/totals/payments/footer"),
  // ── E ESC/POS ──
  D("E1", "-", "encodeEscPos: ไบต์ Uint8Array · ขึ้นต้น 1B 40 · 8 ไบต์ท้ายมี 1D 56 42 00 (cut) · cut:false ไม่มี 1D 56 · มี ESC a · ESC E 1 · GS ! 0x11 · เรียก 2 ครั้งไบต์เท่ากันทุกตัว (58/80 × raster/tis620)"),
  D("E2", "-", "ลิ้นชัก 1B 70 00 19 FA มีเฉพาะ drawerKick:true และบิลมี CASH · drawerKick:false ไม่มี · drawerKick:true แต่จ่ายพร้อมเพย์ล้วนไม่มี"),
  D("E3", "-", "คอลัมน์ (tis620): บรรทัดฐาน VAT กว้างพอดี 32 (58 มม.) / 48 (80 มม.) และลงท้ายด้วยยอด · ไม่มีบรรทัดข้อความใดกว้างเกิน · สองขนาดต่างกันจริง"),
  D("E4", "-", "thaiText tis620: มี ESC t 0xFF · \"ขอบคุณ\" เป็นไบต์ A2 CD BA A4 D8 B3 · ไม่มี UTF-8 ไทย (E0 B8/E0 B9) · สำเนามี \"สำเนา\" (CA D3 E0 B9 D2) ต้นฉบับไม่มี · rasterSlots ว่าง"),
  D("E5", "-", "thaiText raster: rasterSlots.length = จำนวนบรรทัดที่มีอักษรไทย (นับจากผล tis620 ของ payload เดียวกัน) · มี 1D 76 30 หนึ่งครั้งต่อช่อง · offset ชี้ 1D 76 30 · text ของทุกช่องมีอักษรไทย · ช่องครอบชื่อร้าน/ชื่อเอกสาร/footer · ไม่มีไบต์ไทย TIS/UTF-8 นอกช่อง"),
  // ── D ปฏิเสธเป็นข้อมูล ──
  D("D1", "-", "คำปฏิเสธของ device/receipt/settings/การ์ด (DEVICE_REVOKED · DEVICE_LIMIT · DEVICE_NOT_FOUND · SALE_NOT_FOUND · VALIDATION · สิทธิ์) = คืน {ok:false, code, message ไทย} ไม่ throw"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: จำนวนแถวร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ รวม PosDevice/AuditLog/OutboxEvent) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ"),
  D("Z2", "-", "QC4 ลายนิ้วมือ: แถวเดิม (PosProduct PosCategory AppSystem AppSystemUnit BusinessUnit Membership PosReceiptCounter PosShift AccountSettings AccountSystemLink + Tenant.limits/updatedAt) ก่อน = หลัง"),
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
  const full = id.startsWith("P1.10-") ? id : `P1.10-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const short = (v: unknown, n = 200) => {
  let s: string;
  try {
    s = typeof v === "string" ? v : JSON.stringify(v, (_k, x) => (x instanceof Uint8Array ? `Uint8Array(${x.length})` : x));
  } catch {
    s = String(v);
  }
  return (s ?? "undefined").slice(0, n);
};
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : r === undefined ? "UNDEFINED" : "UNKNOWN");
const refused = (r: Any, codes: string[]) => r?.ok === false && codes.includes(String(r.code));
const PERM = ["PERMISSION_DENIED"]; // มติผู้คุมงาน CD1 (7 ต.ค.): รหัสสิทธิ์ = PERMISSION_DENIED ตามโค้ด POS เดิม (ไม่ใช่ NO_PERMISSION ของ brief R7)
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  if (m) return m[1];
  return "THROW";
}
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `ยังไม่มีฟังก์ชัน ${name}` };
  try {
    return await fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}
function callSync(mod: Any, name: string, ...args: unknown[]): Any {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}` };
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
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 120)})`);
    return null;
  }
};
/** อักษรไทย (ไม่นับ ฿ U+0E3F) */
const THAI = /[ก-ฺเ-๛]/;
const baht = (s: number) => (s / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isRecord = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);

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
const stripPrismaComments = (s: string) => s.replace(/\/\/.*$/gm, "");
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b`).test(src);
function prismaBlock(src: string, kind: "model" | "enum", name: string): string {
  const m = new RegExp(`\\b${kind}\\s+${name}\\s*\\{`).exec(src);
  if (!m) return "";
  const end = src.indexOf("\n}", m.index);
  return end < 0 ? "" : src.slice(m.index, end + 2);
}
const fieldLine = (block: string, f: string): string => (new RegExp(`^\\s*${f}\\s+[^\\n]*$`, "m").exec(block)?.[0] ?? "").trim();
function posMessages(locale: string): Map<string, unknown> {
  const keys = new Map<string, unknown>();
  const flat = (o: unknown, prefix: string) => {
    if (o && typeof o === "object" && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) flat(v, `${prefix}.${k}`);
    else keys.set(prefix, o);
  };
  const dir = join(ROOT, "src", "messages", locale);
  for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith(".json")).sort() : []) {
    try {
      const j = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>;
      if (f === "pos.json") flat(j, "pos");
      else if (j && typeof j === "object" && "pos" in j) flat(j.pos, "pos");
    } catch {
      /* ไฟล์พัง = คีย์หาย (ST6 แดงเอง) */
    }
  }
  return keys;
}

const POS_DIR = "src/lib/modules/pos";
const F = {
  device: `${POS_DIR}/device.ts`,
  deviceAct: `${POS_DIR}/device-actions.ts`,
  receipt: `${POS_DIR}/receipt.ts`,
  render: `${POS_DIR}/receipt-render.ts`,
  receiptAct: `${POS_DIR}/receipt-actions.ts`,
  rset: `${POS_DIR}/receipt-settings.ts`,
  rsetAct: `${POS_DIR}/receipt-settings-actions.ts`,
} as const;
const DEVICE_FNS = ["registerDevice", "updateDevice", "revokeDevice", "listDevices", "heartbeat", "posDeviceLimit"] as const;
/** action ต่อไฟล์: [ชื่อ action, บริการที่ต้องเรียก] */
const ACTIONS: [string, [string, string][]][] = [
  [F.deviceAct, [["registerDeviceAction", "registerDevice"], ["updateDeviceAction", "updateDevice"], ["revokeDeviceAction", "revokeDevice"], ["listDevicesAction", "listDevices"], ["heartbeatAction", "heartbeat"]]],
  [F.receiptAct, [["receiptPayloadAction", "receiptPayload"], ["reprintReceiptAction", "receiptPayload"]]],
  [F.rsetAct, [["posReceiptSettingsAction", "posReceiptSettings"], ["updatePosReceiptSettingsAction", "updatePosReceiptSettings"]]],
];
const DEVICE_COLS = ["id", "tenantId", "unitId", "systemId", "name", "deviceCode", "status", "registeredByUserId", "lastSeenAt", "posRegNo", "printerConfig", "revokedAt", "createdAt", "updatedAt"] as const;
const NEW_CODES: [string, string][] = [["DEVICE_REVOKED", "errors.deviceRevoked"], ["DEVICE_LIMIT", "errors.deviceLimit"], ["DEVICE_NOT_FOUND", "errors.deviceNotFound"]];
const DEVICE_MSG = ["title", "register", "revoke", "online", "offline", "printer"];
const RECEIPT_MSG = ["title", "taxInvoiceAbb", "copy", "reprint", "footerDefault"];
const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
const devSrc = stripComments(rd(F.device));
const rcpSrc = stripComments(rd(F.receipt));
const renderRaw = rd(F.render);
const renderSrc = stripComments(renderRaw);
const rsetSrc = stripComments(rd(F.rset));
const sharedSrc = stripComments(rd(`${POS_DIR}/device-shared.ts`)) + "\n" + stripComments(rd(`${POS_DIR}/receipt-settings-shared.ts`));

// ═════════════════════════ 1. ข้อสถิต ═════════════════════════
async function runStatic(): Promise<void> {
  console.log("\n── ST ข้อสถิต (ไม่แตะ DB) ──");
  // ST1
  {
    const p: string[] = [];
    const b = prismaBlock(schemaSrc, "model", "PosDevice");
    const en = prismaBlock(schemaSrc, "enum", "PosDeviceStatus");
    if (!b) p.push("ไม่มี model PosDevice");
    else {
      const miss = DEVICE_COLS.filter((c) => !fieldLine(b, c));
      if (miss.length) p.push(`ขาด ${miss.join(",")}`);
      for (const f of ["lastSeenAt", "posRegNo", "printerConfig", "revokedAt"]) {
        const l = fieldLine(b, f);
        if (l && !/\?$/.test(l.split(/\s+/)[1] ?? "")) p.push(`${f} ต้อง nullable`);
      }
      if (!/^printerConfig\s+Json\?/.test(fieldLine(b, "printerConfig")) && fieldLine(b, "printerConfig")) p.push("printerConfig ไม่ใช่ Json?");
      if (!/^status\s+PosDeviceStatus\b/.test(fieldLine(b, "status")) && fieldLine(b, "status")) p.push("status ไม่ใช่ PosDeviceStatus");
      if (!/@@unique\(\[\s*unitId\s*,\s*deviceCode\s*\]/.test(b)) p.push("ไม่มี @@unique([unitId, deviceCode])");
    }
    if (!en || !/\bACTIVE\b/.test(en) || !/\bREVOKED\b/.test(en)) p.push("enum PosDeviceStatus ไม่ครบ ACTIVE|REVOKED");
    chk("ST1", p.length === 0, "PosDevice ครบ R1 + unique + enum", p.join(" · ") || "ครบ");
  }
  // ST2
  {
    const p: string[] = [];
    const files = walk("prisma/migrations", [], /\.sql$/).filter((f) => /"PosDevice"|PosDeviceStatus/.test(rd(f)));
    if (!files.length) p.push("ไม่มี migration ที่แตะ PosDevice");
    const all = files.map((f) => rd(f).replace(/--.*$/gm, "")).join("\n");
    if (files.length) {
      if (!/CREATE\s+TYPE\s+"PosDeviceStatus"/i.test(all)) p.push("ไม่มี CREATE TYPE \"PosDeviceStatus\"");
      if (!/CREATE\s+TABLE\s+"PosDevice"/i.test(all)) p.push("ไม่มี CREATE TABLE \"PosDevice\"");
      if (!/CREATE\s+UNIQUE\s+INDEX[^;]*ON\s+"PosDevice"\s*\(\s*"unitId"\s*,\s*"deviceCode"\s*\)/i.test(all)) p.push("ไม่มี unique (unitId, deviceCode)");
      if (!/CREATE\s+INDEX[^;]*ON\s+"PosDevice"\s*\(\s*"tenantId"\s*,\s*"unitId"\s*,\s*"status"\s*\)/i.test(all)) p.push("ไม่มี index (tenantId, unitId, status)");
    }
    for (const f of files) {
      const stmts = rd(f).replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
      const bad = stmts.filter((s) => !/^CREATE\s+(TYPE|TABLE|UNIQUE\s+INDEX|INDEX)\b/i.test(s));
      if (bad.length) p.push(`${f.split("/").slice(-2, -1)[0]}: คำสั่งไม่ใช่ CREATE (${short(bad[0], 50)})`);
    }
    chk("ST2", p.length === 0, "CREATE TYPE/TABLE/INDEX เท่านั้น", p.join(" · ") || `ครบ (${files.length} ไฟล์)`);
  }
  // ST3
  {
    const p: string[] = [];
    const scopeSrc = stripComments(rd("src/lib/core/scope.ts"));
    if (!/\bPosDevice\s*:\s*sys\(\s*\)/.test(scopeSrc)) p.push("scope.ts ไม่มี PosDevice: sys()");
    const permSrc = stripComments(rd("src/lib/core/permissions.ts"));
    const at = permSrc.search(/module:\s*["']pos["']/);
    const block = at < 0 ? "" : permSrc.slice(at, permSrc.indexOf("}", permSrc.indexOf("actions", at)) + 1);
    if (!block.includes(`"pos.device.manage"`)) p.push("ไม่มี pos.device.manage ในโมดูล pos");
    chk("ST3", p.length === 0, "scope + permission", p.join(" · ") || "ครบ");
  }
  // ST4
  {
    const p: string[] = [];
    for (const f of Object.values(F)) if (!existsSync(join(ROOT, f))) p.push(`ไม่มี ${f.split("/").pop()}`);
    for (const [file, acts] of ACTIONS) {
      const raw = rd(file);
      if (!raw) continue;
      const src = stripComments(raw);
      const nm = file.split("/").pop();
      if (!/^\s*["']use server["']/.test(raw.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, ""))) p.push(`${nm}: ไม่มี "use server" บรรทัดแรก`);
      const exps = [...src.matchAll(/^\s*export\b[^\n]*/gm)].map((m) => m[0].trim());
      const bad = exps.filter((x) => !/^export\s+async\s+function\s+\w+/.test(x));
      if (bad.length) p.push(`${nm}: export ที่ไม่ใช่ async function (${short(bad[0], 50)})`);
      if (/\bexport\s+type\b|\bexport\s+interface\b/.test(src)) p.push(`${nm}: มี export type`);
      for (const [a, svc] of acts) {
        const at = src.search(new RegExp(`export\\s+async\\s+function\\s+${a}\\b`));
        if (at < 0) {
          p.push(`${nm}: ไม่มี ${a}`);
          continue;
        }
        const body = src.slice(at).split(/\n\s*export\s+/)[0] ?? "";
        if (!new RegExp(`\\b${svc}\\s*\\(`).test(body)) p.push(`${a} ไม่เรียก ${svc}`);
        if (!/\bcatch\b/.test(body)) p.push(`${a} ไม่มี catch`);
      }
    }
    for (const [nm, src] of [["device.ts", devSrc], ["receipt.ts", rcpSrc], ["receipt-settings.ts", rsetSrc]] as const) {
      if (/outboxEvent\.create|\bemitEvent\s*\(|\benqueueOutbox\s*\(|\bemit\s*\(/.test(src)) p.push(`${nm}: สร้าง event (R8 ห้าม)`);
    }
    chk("ST4", p.length === 0, "7 ไฟล์ · actions เปลือกบาง · ไม่มี event", p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || "ครบ");
  }
  // ST5
  {
    const p: string[] = [];
    if (!renderRaw) p.push(`ไม่มี ${F.render}`);
    else {
      const imps = [...renderSrc.matchAll(/(?:^|\n)\s*(?:import|export)[^;\n]*?from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|^\s*import\s+["']([^"']+)["']/gm)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
      const forbidden = imps.filter((s) => /^@\/lib\/core\/db$|^@prisma\/client|^server-only$|prisma|^next(\/|$)|^node:|^\.\/(db|register|service|receipt|device|receipt-settings|shift|held-cart|catalog|account-bridge)$|^@\/lib\/modules\/(?!pos\/(pricing-shared|register-shared|receipt-render-shared))/.test(s));
      if (forbidden.length) p.push(`import ฝั่งเซิร์ฟเวอร์: ${forbidden.join(", ")}`);
      if (/\bDate\.now\s*\(/.test(renderSrc)) p.push("เรียก Date.now()");
      if (/new\s+Date\s*\(\s*\)/.test(renderSrc)) p.push("เรียก new Date() ไม่มีอาร์กิวเมนต์");
      if (/\bMath\.random\s*\(/.test(renderSrc)) p.push("เรียก Math.random()");
      for (const n of ["renderReceiptHtml", "encodeEscPos"]) if (!exportsFn(renderSrc, n)) p.push(`ไม่มี export ${n}`);
    }
    chk("ST5", p.length === 0, "renderer บริสุทธิ์", p.join(" · ") || "ครบ");
  }
  // ST6
  {
    const p: string[] = [];
    const th = posMessages("th");
    const en = posMessages("en");
    const keys = [...DEVICE_MSG.map((k) => `pos.device.${k}`), ...RECEIPT_MSG.map((k) => `pos.receipt.${k}`), ...NEW_CODES.map(([, k]) => `pos.register.${k}`)];
    for (const k of keys) {
      const t = th.get(k);
      const e = en.get(k);
      if (typeof t !== "string" || !t.trim()) p.push(`${k}: th ขาด`);
      if (typeof e !== "string" || !e.trim()) p.push(`${k}: en ขาด`);
    }
    for (const prefix of ["pos.device.", "pos.receipt."]) {
      const thK = [...th.keys()].filter((k) => k.startsWith(prefix));
      const enK = [...en.keys()].filter((k) => k.startsWith(prefix));
      for (const k of thK) if (!en.has(k)) p.push(`${k}: มีแต่ th`);
      for (const k of enK) if (!th.has(k)) p.push(`${k}: มีแต่ en`);
      for (const k of enK) if (THAI.test(String(en.get(k)))) p.push(`${k}: en มีอักษรไทย`);
    }
    for (const [, k] of NEW_CODES) if (THAI.test(String(en.get(`pos.register.${k}`) ?? ""))) p.push(`pos.register.${k}: en มีอักษรไทย`);
    if (th.get("pos.receipt.footerDefault") !== undefined && th.get("pos.receipt.footerDefault") !== "ขอบคุณที่อุดหนุนค่ะ") p.push("pos.receipt.footerDefault (th) ไม่ใช่ \"ขอบคุณที่อุดหนุนค่ะ\"");
    chk("ST6", p.length === 0, `${keys.length} คีย์ th+en · ชุดคีย์ตรงกัน · en ไม่มีไทย`, p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || "ครบ");
  }
  // ST7
  {
    const regShared = await tryImport("@/lib/modules/pos/register-shared");
    const p: string[] = [];
    for (const [code, key] of NEW_CODES) {
      const mk = callSync(regShared, "refusalMessageKey", code);
      if (mk !== key) p.push(`${code}→${short(mk, 40)}`);
    }
    chk("ST7", p.length === 0, "3 รหัสใหม่ตรงคีย์", p.join(" · ") || "ครบ");
  }
}
const STATIC_IDS = ["ST1", "ST2", "ST3", "ST4", "ST5", "ST6", "ST7"].map((x) => `P1.10-${x}`);

const skipReasons: string[] = [];
for (const fn of DEVICE_FNS) if (!exportsFn(devSrc, fn)) skipReasons.push(`${F.device} ยังไม่มี export ${fn}`);
if (!exportsFn(rcpSrc, "receiptPayload")) skipReasons.push(`${F.receipt} ยังไม่มี export receiptPayload`);
for (const fn of ["renderReceiptHtml", "encodeEscPos"]) if (!exportsFn(renderSrc, fn)) skipReasons.push(`${F.render} ยังไม่มี export ${fn}`);
for (const fn of ["posReceiptSettings", "updatePosReceiptSettings"]) if (!exportsFn(rsetSrc, fn)) skipReasons.push(`${F.rset} ยังไม่มี export ${fn}`);
if (!exportsFn(devSrc + sharedSrc + renderSrc, "parsePrinterConfig")) skipReasons.push("ไม่มี export parsePrinterConfig (device-shared.ts / device.ts / receipt-render.ts)");
if (!exportsFn(rsetSrc + sharedSrc + renderSrc, "parseReceiptSettings")) skipReasons.push("ไม่มี export parseReceiptSettings (receipt-settings(-shared).ts / receipt-render.ts)");

if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อสถิต`);
  let crashedS = "";
  try {
    await runStatic();
  } catch (e) {
    crashedS = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
    console.log(`💥 harness: ${crashedS}`);
  }
  for (const id of STATIC_IDS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashedS ? `ไม่ถึง (harness ล้ม)` : "ไม่ถึง");
  const failedN = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failedN.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failedN.length, failed: failedN, skipped: false, registered: CHECKS.length, missing: skipReasons })}`);
  process.exit(failedN.length ? 1 : 0);
}

// ═════════════════════════ 2. env (QC4 เท่านั้น) ═════════════════════════
const envMod = (await import("./pos-qc-env.mjs" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
const PQC = envMod.PQC as Any;
const TIDS = envMod.PQC_TENANT_IDS as string[];
function assertQc4BeforeWrite(): void {
  const mark = envMod.POS_QC_HOST_MARK as string;
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u.includes(mark));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: จะเขียนแถวได้เฉพาะ QC4 (${mark}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
}

// ═════════════════════════ 3. ด่าน SKIP ═════════════════════════
const { prisma } = (await import("@/lib/core/db")) as Any;
const P = prisma as Any;
const prismaPkg = (await import("@prisma/client")) as Any;
const DMMF = ((prismaPkg?.Prisma ?? prismaPkg?.default?.Prisma)?.dmmf?.datamodel ?? { models: [] }) as { models: { name: string; fields: { name: string }[] }[] };
const dbCols = new Set<string>();
try {
  const rows = (await P.$queryRawUnsafe(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('PosDevice')`)) as Any[];
  for (const r of rows) dbCols.add(`${r.table_name}.${r.column_name}`);
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
const clientHas = (model: string, field: string) => (DMMF.models.length ? !!DMMF.models.find((m) => m.name === model)?.fields.some((f) => f.name === field) : dbCols.has(`${model}.${field}`));
const PD: Any = typeof P.posDevice?.findMany === "function" ? P.posDevice : null;
if (!PD) skipReasons.push("Prisma client ยังไม่มี delegate posDevice (R1)");
const missDev = DEVICE_COLS.filter((c) => !(clientHas("PosDevice", c) && dbCols.has(`PosDevice.${c}`)));
if (missDev.length) skipReasons.push(`ตาราง PosDevice ขาดคอลัมน์ (client/DB): ${missDev.join(",")}`);

let scope: Any = null;
let restoScope: Any = null;
try {
  scope = await envMod.resolvePosScope(prisma, "coffee");
  restoScope = await envMod.resolvePosScope(prisma, "resto");
} catch (e) {
  console.log(`  (resolvePosScope ล้ม: ${(e as Error).message.slice(0, 120)})`);
}
if (!scope) skipReasons.push("ชุดข้อมูล QC POS (ร้านกาแฟ) ยังไม่ถูก seed — รัน scripts/seed-pos-qc.mts ก่อน");
if (!restoScope) skipReasons.push("ชุดข้อมูล QC POS (ร้านอาหาร) ยังไม่ถูก seed — ข้อ A1/A3 ต้องใช้");

const COUNT_MODELS = [
  "posSale", "posSaleLine", "posSaleLineOption", "posPayment", "posReceiptCounter", "outboxEvent", "auditLog", "appSystem", "appSystemUnit", "businessUnit",
  "posProduct", "posCategory", "posProductOptionGroup", "menuOptionGroup", "menuOptionChoice", "posShift", "posShiftCounter", "posCashMovement", "posHeldCart",
  "posDevice", "customer", "memberTierDef", "accountSettings", "accountSystemLink", "pointLedger",
] as const;
const FP_MODELS = ["posProduct", "posCategory", "appSystem", "appSystemUnit", "businessUnit", "membership", "posReceiptCounter", "posShift", "accountSettings", "accountSystemLink"] as const;
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
  try {
    const t = (await P.$queryRawUnsafe(`SELECT id, limits, "updatedAt" FROM "Tenant" WHERE id = ANY($1::text[]) ORDER BY id`, TIDS)) as Any[];
    out.tenant = `${t.length}:${createHash("sha256").update(JSON.stringify(t)).digest("hex").slice(0, 16)}`;
  } catch (e) {
    out.tenant = `err:${(e as Error).message.slice(0, 40)}`;
  }
  return out;
}
async function snapshotCounts(): Promise<Record<string, number | string>> {
  const out: Record<string, number | string> = {};
  for (const tid of TIDS) {
    for (const m of COUNT_MODELS) {
      const d = P[m];
      if (typeof d?.count !== "function") {
        out[`${tid}.${m}`] = "absent";
        continue;
      }
      try {
        out[`${tid}.${m}`] = await d.count({ where: { tenantId: tid } });
      } catch (e) {
        out[`${tid}.${m}`] = `err:${(e as Error).message.slice(0, 40)}`;
      }
    }
    try {
      const rows = (await P.posReceiptCounter.findMany({ where: { tenantId: tid }, select: { seq: true } })) as Any[];
      out[`${tid}.receiptSeqSum`] = rows.reduce((s, r) => s + Number(r.seq), 0);
    } catch {
      out[`${tid}.receiptSeqSum`] = "err";
    }
  }
  return out;
}
const countsBefore = await snapshotCounts();

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P1.10 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง)`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อมูล: seed ร้านกาแฟ ${scope ? "มี" : "ไม่มี"} · seed ร้านอาหาร ${restoScope ? "มี" : "ไม่มี"} · ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length, seed: { coffee: !!scope, resto: !!restoScope }, a5: countsBefore })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const ex = (f: string) => existsSync(join(ROOT, f));
const devMod = ex(F.device) ? await tryImport("@/lib/modules/pos/device") : null;
const devShared = ex(`${POS_DIR}/device-shared.ts`) ? await tryImport("@/lib/modules/pos/device-shared") : null;
const rcpMod = ex(F.receipt) ? await tryImport("@/lib/modules/pos/receipt") : null;
const renderMod = ex(F.render) ? await tryImport("@/lib/modules/pos/receipt-render") : null;
const rsetMod = ex(F.rset) ? await tryImport("@/lib/modules/pos/receipt-settings") : null;
const rsetShared = ex(`${POS_DIR}/receipt-settings-shared.ts`) ? await tryImport("@/lib/modules/pos/receipt-settings-shared") : null;
const register = await tryImport("@/lib/modules/pos/register");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const heldMod = await tryImport("@/lib/modules/pos/held-cart");
const catalog = await tryImport("@/lib/modules/pos/catalog");
const sysSvc = await tryImport("@/lib/modules/system/service");
const pick = (name: string, ...mods: Any[]): Any => mods.find((m) => typeof m?.[name] === "function") ?? null;
const printerMod = pick("parsePrinterConfig", devShared, devMod, renderMod);
const rsParseMod = pick("parseReceiptSettings", rsetShared, rsetMod, renderMod);

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `posqc-p110-${RAND}`;
const runStart = new Date();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ═════════════════════════ 5. ตัวช่วยของข้อสอบ ═════════════════════════
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !STATIC_IDS.includes(id) && id !== "P1.10-Z1" && id !== "P1.10-Z2");
const sb = {
  unitIds: [] as string[], restoUnitIds: [] as string[], systemIds: [] as string[], accSystemIds: [] as string[], posLinkedIds: [] as string[],
  productIds: [] as string[], customerIds: [] as string[], memSysIds: [] as string[], saleIds: new Set<string>(),
};
let tenantLimitsOrig: { limits: Any; updatedAt: Date } | null = null;
const dataRefusals: [string, Any][] = [];
const keep = (label: string, r: Any) => {
  if (r?.ok === false && !String(r.code ?? "").startsWith("MISSING:")) dataRefusals.push([label, r]);
  return r;
};

/** ย้อน tx ของข้อสอบเมื่อผลไม่ ok */
class Rollback {
  constructor(public r: Any) {}
}
/** รันใน tx ของข้อสอบ แล้วลบ event pos.sale.paid ก่อน commit ⇒ ไม่มีการลงบัญชี/แต้มเกิดขึ้นจริง (แบบ qc-pos-p1.6) */
async function quietTx(fn: (tx: Any) => Promise<Any>): Promise<Any> {
  try {
    return await P.$transaction(
      async (tx: Any) => {
        const r = await fn(tx);
        if (!r || r.ok !== true) throw new Rollback(r);
        if (r.saleId) await tx.outboxEvent.deleteMany({ where: { tenantId: { in: TIDS }, idempotencyKey: { in: [`PosSale#${r.saleId}#PAID`] } } });
        return r;
      },
      { timeout: 30000, maxWait: 10000 },
    );
  } catch (e) {
    if (e instanceof Rollback) return e.r;
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}

/** ตัดคำสั่ง ESC/POS ที่รู้จักออก เหลือไบต์ข้อความ แล้วแยกบรรทัดด้วย LF */
function escTextLines(bytes: Uint8Array): number[][] {
  const out: number[][] = [[]];
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i]!;
    if (b === 0x1b) {
      const c = bytes[i + 1];
      if (c === 0x40) i += 2;
      else if (c === 0x70) i += 5;
      else if (c === 0x61 || c === 0x45 || c === 0x21 || c === 0x74 || c === 0x2d || c === 0x64 || c === 0x4a || c === 0x47 || c === 0x4d || c === 0x20 || c === 0x33) i += 3;
      else i += 2;
      continue;
    }
    if (b === 0x1d) {
      const c = bytes[i + 1];
      if (c === 0x56) i += bytes[i + 2] === 0x41 || bytes[i + 2] === 0x42 || bytes[i + 2] === 65 || bytes[i + 2] === 66 ? 4 : 3;
      else if (c === 0x76 && bytes[i + 2] === 0x30) {
        const xL = bytes[i + 4] ?? 0, xH = bytes[i + 5] ?? 0, yL = bytes[i + 6] ?? 0, yH = bytes[i + 7] ?? 0;
        i += 8 + (xL + xH * 256) * (yL + yH * 256);
      } else if (c === 0x28) {
        const pL = bytes[i + 3] ?? 0, pH = bytes[i + 4] ?? 0;
        i += 5 + pL + pH * 256;
      } else i += 3;
      continue;
    }
    if (b === 0x0a) {
      out.push([]);
      i++;
      continue;
    }
    if (b >= 0x20) out[out.length - 1]!.push(b);
    i++;
  }
  return out;
}
/** ความกว้างคอลัมน์ของบรรทัด TIS-620 (สระบน/ล่าง วรรณยุกต์ = 0) */
const TIS_COMBINING = new Set([0xd1, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe7, 0xe8, 0xe9, 0xea, 0xeb, 0xec, 0xed, 0xee]);
const colWidth = (line: number[]) => line.filter((b) => !TIS_COMBINING.has(b)).length;
const latin1 = (line: number[]) => String.fromCharCode(...line);
const hasTisThai = (line: number[]) => line.some((b) => (b >= 0xa1 && b <= 0xda) || (b >= 0xe0 && b <= 0xfb));
function indexOfSeq(hay: Uint8Array, seq: number[], from = 0): number {
  outer: for (let i = from; i <= hay.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) if (hay[i + j] !== seq[j]) continue outer;
    return i;
  }
  return -1;
}
const countSeq = (hay: Uint8Array, seq: number[]) => {
  let n = 0;
  for (let i = indexOfSeq(hay, seq); i >= 0; i = indexOfSeq(hay, seq, i + 1)) n++;
  return n;
};
const tis = (s: string) => [...s].map((ch) => ch.codePointAt(0)! - 0x0e00 + 0xa0);
const bytesOf = (r: Any): Uint8Array | null => (r instanceof Uint8Array ? r : r?.bytes instanceof Uint8Array ? r.bytes : null);
const slotsOf = (r: Any): Any[] => (r instanceof Uint8Array ? [] : Array.isArray(r?.rasterSlots) ? r.rasterSlots : []);
const sameBytes = (a: Uint8Array | null, b: Uint8Array | null) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
/** ส่วนของ HTML ตาม data-section */
const SECTIONS = ["header", "title", "doc", "lines", "totals", "payments", "member", "footer"] as const;
function htmlSections(html: string): { order: string[]; text: Record<string, string> } {
  const found = SECTIONS.map((s) => ({ s, at: new RegExp(`data-section=["']${s}["']`).exec(html)?.index ?? -1 })).filter((x) => x.at >= 0).sort((a, b) => a.at - b.at);
  const text: Record<string, string> = {};
  found.forEach((x, i) => {
    const end = i + 1 < found.length ? found[i + 1]!.at : html.length;
    text[x.s] = html.slice(x.at, end).replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  });
  return { order: found.map((x) => x.s), text };
}
/** ผลของตัว parse: ok → ค่าที่ parse แล้ว · ปฏิเสธ → {ok:false…} */
const unwrapCfg = (r: Any): Any => (r?.ok === false ? r : r?.ok === true ? (r.config ?? r.value ?? r.settings ?? Object.fromEntries(Object.entries(r).filter(([k]) => k !== "ok"))) : r);
const namesField = (r: Any, field: string) => r?.ok === false && r.code === "VALIDATION" && (r.field === field || String(r.field ?? "").endsWith(field) || String(r.message ?? "").includes(field));
/** เลขผู้เสียภาษีที่ checksum ถูก (mod 11) */
function validTaxId(prefix12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(prefix12[i]) * (13 - i);
  return prefix12 + String((11 - (sum % 11)) % 10);
}

// ═════════════════════════ 6. ข้อที่ต้องมี DB ═════════════════════════
async function runDb() {
  if (!scope || !restoScope) {
    for (const id of DB_IDS) chk(id, false, "seed ร้าน QC POS", "ยังไม่ได้ seed (scripts/seed-pos-qc.mts) — ข้อ DB ตรวจไม่ได้");
    return;
  }
  const tid: string = scope.tenantId;
  const restoTid: string = PQC.resto.tenantId;
  const mOwner = await P.membership.findFirst({ where: { tenantId: tid, userId: PQC.coffee.users.owner.userId } });
  const mCash = await P.membership.findFirst({ where: { tenantId: tid, userId: PQC.coffee.users.cashier.userId } });
  const mROwner = await P.membership.findFirst({ where: { tenantId: restoTid, userId: PQC.resto.users.owner.userId } });
  const actor = (m: Any, userId: string, fallbackRole: string, over: Partial<Any> = {}) => ({
    userId,
    role: m?.role ?? fallbackRole,
    unitAccess: Array.isArray(m?.unitAccess) ? m.unitAccess : [],
    permissions: (m?.permissions ?? {}) as Record<string, unknown>,
    ...over,
  });
  const owner = actor(mOwner, PQC.coffee.users.owner.userId, "OWNER");
  const restoOwner = actor(mROwner, PQC.resto.users.owner.userId, "OWNER");
  const ownerName: string = (await P.user.findUnique({ where: { id: owner.userId }, select: { name: true } }))?.name ?? "";

  // ─── sandbox ───
  assertQc4BeforeWrite();
  console.log(`\n── sandbox ${TAG} (สาขา + ระบบ POS/บัญชี/สมาชิก ชั่วคราวในร้าน QC กาแฟ) ──`);
  let fx = "";
  const mkUnit = async (label: string, tenantId = tid) => {
    const u = await P.businessUnit.create({ data: { tenantId, type: "SHOP", name: `${TAG} สาขา${label}`, slug: `${TAG}-${label}` } });
    (tenantId === tid ? sb.unitIds : sb.restoUnitIds).push(u.id);
    return u.id as string;
  };
  const mkSys = async (type: string, label: string, settings?: Any) => {
    const s = await P.appSystem.create({ data: { tenantId: tid, type, name: `${TAG} ${label}`, ...(settings ? { settings } : {}) } });
    sb.systemIds.push(s.id);
    if (type === "ACCOUNT") sb.accSystemIds.push(s.id);
    if (type === "MEMBER") sb.memSysIds.push(s.id);
    return s.id as string;
  };
  let uA = "", uB = "", uC = "", uV = "", uW = "", posS = "", posV = "", posW = "", accV = "", accW = "", memV = "";
  const BOOK = { orgName: "บริษัท คิวซี กาแฟ จำกัด", taxId: validTaxId("010556123456"), branchCode: "00001", branchName: "สาขาที่ 1", address: "88/8 ถ.ทดสอบ อ.เมือง จ.กรุงเทพฯ 10110", phone: "021234567", logoUrl: "https://example.com/qc-logo.png" };
  let tierName = "", customerName = "", customerId = "";
  try {
    uA = await mkUnit("A");
    uB = await mkUnit("B");
    uC = await mkUnit("C");
    uV = await mkUnit("V");
    uW = await mkUnit("W");
    posS = await mkSys("POS", "POS-S");
    posV = await mkSys("POS", "POS-V", { pos: { serviceCharge: { enabled: true, rateBp: 1000 } } });
    posW = await mkSys("POS", "POS-W");
    accV = await mkSys("ACCOUNT", "ACC-V");
    accW = await mkSys("ACCOUNT", "ACC-W");
    memV = await mkSys("MEMBER", "MEMBER-V");
    for (const u of [uA, uB, uC]) await sysSvc.linkUnit(tid, posS, u);
    await sysSvc.linkUnit(tid, posV, uV);
    await sysSvc.linkUnit(tid, memV, uV);
    await sysSvc.linkUnit(tid, posW, uW);
    await P.accountSettings.create({ data: { tenantId: tid, systemId: accV, vatRegistered: true, vatRateBp: 700, ...BOOK, docConfig: { docSettings: { autoTaxInvoice: { posAbbreviated: true } } } } });
    await P.accountSettings.create({ data: { tenantId: tid, systemId: accW, vatRegistered: true, vatRateBp: 700, orgName: "บริษัท คิวซี ดับเบิลยู จำกัด", taxId: validTaxId("010556654321"), docConfig: { docSettings: { autoTaxInvoice: { posAbbreviated: false } } } } });
    sb.posLinkedIds.push(posV, posW);
    await P.accountSystemLink.create({ data: { tenantId: tid, systemId: accV, linkedKind: "POS", linkedId: posV } });
    await P.accountSystemLink.create({ data: { tenantId: tid, systemId: accW, linkedKind: "POS", linkedId: posW } });
    const tier = await P.memberTierDef.create({ data: { tenantId: tid, systemId: memV, key: `${TAG}-plain`, name: "ระดับเงินคิวซี" } });
    tierName = tier.name;
    const cust = await P.customer.create({ data: { tenantId: tid, memberSystemId: memV, name: `สมใจ ${TAG}`, tierDefId: tier.id } });
    sb.customerIds.push(cust.id);
    customerId = cust.id;
    customerName = cust.name;
    await mkUnit("R", restoTid);
  } catch (e) {
    fx = `sandbox:${(e as Error).message.slice(0, 140)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const SYSTEM_ACTOR: unknown = catalog?.CATALOG_SYSTEM_ACTOR ?? owner.userId;
  const idOf = (r: Any): string => (typeof r === "string" ? r : r?.ok === false ? "" : (r?.id ?? r?.product?.id ?? ""));
  const mkProd = async (systemId: string, name: string, price: number): Promise<string> => {
    const r = await call(catalog, "createProduct", { tenantId: tid, systemId, actorUserId: SYSTEM_ACTOR }, { name, kind: "PRODUCT", basePriceSatang: price });
    const id = idOf(r);
    if (!id) throw new Error(`createProduct ไม่คืน id: ${short(r)}`);
    sb.productIds.push(id);
    return id;
  };
  let pLatte = "", pCrois = "", pAmer = "", pW = "", chShot = "", chWhip = "";
  try {
    if (!fx) {
      pLatte = await mkProd(posV, "ลาเต้เย็น P110", 6000);
      pCrois = await mkProd(posV, "ครัวซองต์ P110", 5500);
      pAmer = await mkProd(posS, "อเมริกาโน่ P110", 4500);
      pW = await mkProd(posW, "ชาไทย P110", 3000);
      const cctxV = { tenantId: tid, systemId: posV, actorUserId: SYSTEM_ACTOR };
      const g = await call(catalog, "createOptionGroup", cctxV, { unitId: uV, name: `${TAG} ท็อปปิ้ง`, minSelect: 0, maxSelect: 2, choices: [{ name: "ช็อตเพิ่ม", priceDelta: 1000 }, { name: "วิปครีม", priceDelta: 500 }] });
      const gid = idOf(g);
      if (!gid) throw new Error(`createOptionGroup: ${short(g)}`);
      const sg = await call(catalog, "setProductOptionGroups", cctxV, pLatte, [gid]);
      if (sg?.ok === false) throw new Error(`setProductOptionGroups: ${short(sg)}`);
      const ch = (await P.menuOptionChoice.findMany({ where: { groupId: gid } })) as Any[];
      chShot = ch.find((c) => c.name === "ช็อตเพิ่ม")?.id ?? "";
      chWhip = ch.find((c) => c.name === "วิปครีม")?.id ?? "";
    }
  } catch (e) {
    fx ||= `product:${(e as Error).message.slice(0, 120)}`;
  }

  // ─── ผู้กระทำ ───
  const cashier = actor(mCash, PQC.coffee.users.cashier.userId, "STAFF", { role: "STAFF", unitAccess: [uA], permissions: { "pos.sale.create": true, "pos.sale.read": true } });
  const staffMgr = actor(mCash, PQC.coffee.users.cashier.userId, "STAFF", { role: "STAFF", unitAccess: [uC], permissions: { "pos.sale.create": true, "pos.device.manage": true } });
  const ctx = (unitId: string, systemId: string, deviceId?: string): Any => ({ tenantId: tid, systemId, unitId, ...(deviceId !== undefined ? { deviceId } : {}) });
  const ctxR = { tenantId: restoTid, systemId: PQC.resto.systems.POS.id, unitId: PQC.resto.units.main.id };
  const code = (n: string) => `${TAG}-${n}`.replace(/[^A-Za-z0-9_-]/g, "_");

  // ─── ทางเรียก ───
  const reg = async (c: Any, a: Any, input: Any, label = "register") => keep(label, await call(devMod, "registerDevice", c, a, input));
  const upd = async (c: Any, a: Any, input: Any, label = "update") => keep(label, await call(devMod, "updateDevice", c, a, input));
  const rev = async (c: Any, a: Any, input: Any, label = "revoke") => keep(label, await call(devMod, "revokeDevice", c, a, input));
  const list = async (c: Any, a: Any, label = "list") => keep(label, await call(devMod, "listDevices", c, a));
  const hb = async (c: Any, a: Any, deviceCode: string) => keep("heartbeat", await call(devMod, "heartbeat", c, a, { deviceCode }));
  const itemsOf = (r: Any): Any[] => (r?.ok === true ? (Array.isArray(r.items) ? r.items : Array.isArray(r.devices) ? r.devices : []) : []);
  const devRow = async (unitId: string, deviceCode: string): Promise<Any> => (PD ? PD.findFirst({ where: { tenantId: tid, unitId, deviceCode } }).catch(() => null) : null);
  const devCount = async (where: Any): Promise<number> => (PD ? PD.count({ where: { tenantId: { in: TIDS }, ...where } }).catch(() => -1) : -1);
  const setSeen = async (id: string, msAgo: number) => (PD && id ? PD.update({ where: { id }, data: { lastSeenAt: new Date(Date.now() - msAgo) } }).catch(() => null) : null);
  const setLimits = async (limits: Any) => {
    await P.$executeRawUnsafe(`UPDATE "Tenant" SET limits = $1::jsonb WHERE id = $2`, JSON.stringify(limits), tid);
  };
  let keyN = 0;
  const newKey = () => `p110-${RAND}-${++keyN}`;
  /** ขายผ่านหน้าขาย (quote → submit ใน quietTx) — pays null = เงินสดเต็มยอด */
  const sale = async (c: Any, a: Any, cart: Any, pays?: (grand: number) => { payMethods: Any[]; cashReceivedSatang?: number }) => {
    const q = await call(register, "quoteRegisterCart", c, a, cart);
    const grand = q?.ok === true ? Number(q.grandTotalSatang) : 0;
    const pm = pays ? pays(grand) : { payMethods: [{ type: "CASH", amountSatang: grand }], cashReceivedSatang: grand };
    const input: Any = { ...cart, idempotencyKey: newKey(), expectedGrandTotalSatang: grand, ...pm };
    if (!(input.cashReceivedSatang > 0)) delete input.cashReceivedSatang;
    const r = q?.ok === true ? await quietTx((tx) => call(register, "submitRegisterSale", c, a, input, tx)) : q;
    const saleId = r?.ok === true && typeof r.saleId === "string" ? r.saleId : "";
    if (saleId) sb.saleIds.add(saleId);
    return { r, q, saleId, key: input.idempotencyKey as string };
  };
  const salesByKeyPart = async (k: string) => P.posSale.count({ where: { tenantId: tid, idempotencyKey: { contains: k } } }).catch(() => -1);

  // ════════ G1 ลงทะเบียน + ลงซ้ำ + ตรวจค่า ════════
  const A1 = code("a1"), A2 = code("a2"), A3 = code("a3"), A4 = code("a4");
  let devA1: Any = null;
  {
    const p: string[] = [];
    const r = await reg(ctx(uA, posS), owner, { name: "เคาน์เตอร์ 1", deviceCode: A1 });
    devA1 = await devRow(uA, A1);
    if (r?.ok !== true) p.push(`register ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    if (!devA1) p.push("ไม่มีแถว");
    else {
      if (devA1.status !== "ACTIVE") p.push(`status ${devA1.status}`);
      if (devA1.tenantId !== tid || devA1.unitId !== uA || devA1.systemId !== posS) p.push("ร้าน/สาขา/ระบบ ผิด");
      if (devA1.registeredByUserId !== owner.userId) p.push(`registeredBy ${devA1.registeredByUserId}`);
      if (devA1.name !== "เคาน์เตอร์ 1") p.push(`name ${devA1.name}`);
      if (devA1.revokedAt !== null) p.push("revokedAt ไม่ null");
    }
    const again = await reg(ctx(uA, posS), owner, { name: "ชื่ออื่น", deviceCode: A1 });
    const againId = again?.device?.id ?? again?.id;
    const row2 = await devRow(uA, A1);
    if (again?.ok !== true) p.push(`ลงซ้ำ ${codeOf(again)}`);
    else if (devA1 && againId !== undefined && againId !== devA1.id) p.push("ลงซ้ำได้ id อื่น");
    if (row2 && row2.name !== "เคาน์เตอร์ 1") p.push(`ลงซ้ำเปลี่ยนชื่อเป็น ${row2.name}`);
    if ((await devCount({ unitId: uA, deviceCode: A1 })) !== 1) p.push("แถวของรหัสนี้ไม่ใช่ 1");
    const n0 = await devCount({ unitId: uA });
    for (const [lbl, inp] of [
      ["ชื่อว่าง", { name: "", deviceCode: code("v1") }],
      ["ชื่อ 61", { name: "ก".repeat(61), deviceCode: code("v2") }],
      ["รหัสสั้น", { name: "x", deviceCode: "abc" }],
      ["รหัสช่องว่าง", { name: "x", deviceCode: "posqc p110 bad" }],
      ["รหัส 65", { name: "x", deviceCode: "a".repeat(65) }],
    ] as [string, Any][]) {
      const v = await reg(ctx(uA, posS), owner, inp, `register ${lbl}`);
      if (!refused(v, ["VALIDATION"])) p.push(`${lbl} ${codeOf(v)}`);
    }
    const okName60 = await reg(ctx(uB, posS), owner, { name: "ข".repeat(60), deviceCode: code("b60") });
    if (okName60?.ok !== true) p.push(`ชื่อ 60 ตัว ${codeOf(okName60)}`);
    if ((await devCount({ unitId: uA })) !== n0) p.push("ค่าผิดสร้างแถว");
    chk("G1", p.length === 0, "ACTIVE · ลงซ้ำ = แถวเดิม · VALIDATION ×5", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ G2 เพดานปริยาย 3 ════════
  try {
    const t = (await P.$queryRawUnsafe(`SELECT limits, "updatedAt" FROM "Tenant" WHERE id = $1`, tid)) as Any[];
    if (t[0]) tenantLimitsOrig = { limits: t[0].limits, updatedAt: t[0].updatedAt };
  } catch (e) {
    console.log(`  (อ่าน Tenant.limits ไม่ได้: ${(e as Error).message.slice(0, 80)})`);
  }
  const origLimits = isRecord(tenantLimitsOrig?.limits) ? (tenantLimitsOrig!.limits as Record<string, unknown>) : {};
  const noDevLimits = Object.fromEntries(Object.entries(origLimits).filter(([k]) => k !== "posDevices"));
  {
    const p: string[] = [];
    try {
      await setLimits(noDevLimits);
    } catch (e) {
      p.push(`ตั้ง limits ไม่ได้: ${(e as Error).message.slice(0, 60)}`);
    }
    const r2 = await reg(ctx(uA, posS), owner, { name: "เคาน์เตอร์ 2", deviceCode: A2 });
    const r3 = await reg(ctx(uA, posS), owner, { name: "เคาน์เตอร์ 3", deviceCode: A3 });
    if (r2?.ok !== true || r3?.ok !== true) p.push(`ลงเครื่อง 2/3 ${codeOf(r2)}/${codeOf(r3)}`);
    const r4 = await reg(ctx(uA, posS), owner, { name: "เคาน์เตอร์ 4", deviceCode: A4 }, "limit 4");
    if (!refused(r4, ["DEVICE_LIMIT"])) p.push(`เครื่องที่ 4 ${codeOf(r4)}`);
    if (await devRow(uA, A4)) p.push("มีแถวเครื่องที่ 4");
    const again = await reg(ctx(uA, posS), owner, { name: "เคาน์เตอร์ 1", deviceCode: A1 });
    if (again?.ok !== true) p.push(`ลงซ้ำตอนเต็ม ${codeOf(again)}`);
    const d3 = await devRow(uA, A3);
    const rv = d3 ? await rev(ctx(uA, posS), owner, { id: d3.id }) : { ok: false, code: "NO_ROW" };
    if (rv?.ok !== true) p.push(`เพิกถอนเครื่อง 3 ${codeOf(rv)}`);
    const r4b = await reg(ctx(uA, posS), owner, { name: "เคาน์เตอร์ 4", deviceCode: A4 });
    if (r4b?.ok !== true) p.push(`หลังเพิกถอน ลงเครื่อง 4 ${codeOf(r4b)}`);
    const rb = await reg(ctx(uB, posS), owner, { name: "บี 1", deviceCode: code("b1") });
    if (rb?.ok !== true) p.push(`สาขา B นับแยก ${codeOf(rb)}`);
    chk("G2", p.length === 0, "3 ACTIVE แล้ว DEVICE_LIMIT · ลงซ้ำได้ · REVOKED ไม่นับ · ต่อสาขา", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ G3 limits = 1 + posDeviceLimit บริสุทธิ์ ════════
  {
    const p: string[] = [];
    try {
      await setLimits({ ...noDevLimits, posDevices: 1 });
    } catch (e) {
      p.push(`ตั้ง limits ไม่ได้: ${(e as Error).message.slice(0, 60)}`);
    }
    const c1 = await reg(ctx(uC, posS), owner, { name: "ซี 1", deviceCode: code("c1") });
    const c2 = await reg(ctx(uC, posS), owner, { name: "ซี 2", deviceCode: code("c2") }, "limit 1");
    if (c1?.ok !== true) p.push(`เครื่องแรก ${codeOf(c1)}`);
    if (!refused(c2, ["DEVICE_LIMIT"])) p.push(`เครื่องที่สอง ${codeOf(c2)}`);
    try {
      await setLimits(noDevLimits);
    } catch {
      /* finally คืนค่าเดิมอีกรอบ */
    }
    for (const [lim, want] of [[null, 3], [{}, 3], [{ posDevices: -1 }, 3], [{ posDevices: 1.5 }, 3], [{ posDevices: "2" }, 3], [{ posDevices: 1 }, 1], [{ posDevices: 5 }, 5]] as [Any, number][]) {
      const got = callSync(devMod, "posDeviceLimit", { limits: lim });
      if (got !== want) p.push(`posDeviceLimit(${short(lim, 30)})=${short(got, 30)}`);
    }
    chk("G3", p.length === 0, "limits 1 → เครื่องที่สอง DEVICE_LIMIT · helper 7 กรณี", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ PC1/PC2 parsePrinterConfig ════════
  const DEF_PC = { paper: "80", mode: "browser", autoPrint: false, drawerKick: false, thaiText: "raster", copies: 1 };
  const eqCfg = (a: Any, b: Any) => isRecord(a) && Object.keys(b).every((k) => a[k] === b[k]) && Object.keys(a).every((k) => k in b);
  {
    const p: string[] = [];
    for (const v of [undefined, null, {}]) {
      const r = unwrapCfg(callSync(printerMod, "parsePrinterConfig", v));
      if (!eqCfg(r, DEF_PC)) p.push(`ค่าปริยาย(${short(v, 10)}) = ${short(r, 120)}`);
    }
    const full = { paper: "58", mode: "escpos-usb", autoPrint: true, drawerKick: true, thaiText: "tis620", copies: 2 };
    const r1 = unwrapCfg(callSync(printerMod, "parsePrinterConfig", { ...full, foo: 1, bar: "x" }));
    if (!eqCfg(r1, full)) p.push(`ค่าครบ+คีย์แปลก = ${short(r1, 140)}`);
    const r2 = unwrapCfg(callSync(printerMod, "parsePrinterConfig", { mode: "escpos-bt" }));
    if (!eqCfg(r2, { ...DEF_PC, mode: "escpos-bt" })) p.push(`บางส่วน = ${short(r2, 120)}`);
    chk("PC1", p.length === 0, "ค่าปริยาย · ค่าครบผ่าน · คีย์แปลกทิ้ง", p.join(" · ") || "ครบ");
  }
  {
    const p: string[] = [];
    for (const [field, bad] of [["paper", { paper: "72" }], ["paper", { paper: 58 }], ["mode", { mode: "escpos" }], ["autoPrint", { autoPrint: "yes" }], ["drawerKick", { drawerKick: 1 }], ["thaiText", { thaiText: "utf8" }], ["copies", { copies: 3 }], ["copies", { copies: 0 }]] as [string, Any][]) {
      const r = callSync(printerMod, "parsePrinterConfig", bad);
      if (!namesField(r, field)) p.push(`${short(bad, 30)} → ${codeOf(r)} ${short(r?.field ?? r?.message ?? "", 40)}`);
      else keep(`printer ${field}`, r);
    }
    for (const bad of ["x", []]) {
      const r = callSync(printerMod, "parsePrinterConfig", bad);
      if (!refused(r, ["VALIDATION"])) p.push(`${short(bad, 10)} → ${codeOf(r)}`);
    }
    chk("PC2", p.length === 0, "VALIDATION ระบุฟิลด์ ×8 + ไม่ใช่ object ×2", p.join(" · ") || "ครบ");
  }

  // ════════ G4 updateDevice ════════
  {
    const p: string[] = [];
    const id = devA1?.id ?? "";
    const r = await upd(ctx(uA, posS), owner, { id, name: "แคชเชียร์หน้า", posRegNo: "E0123456789012", printerConfig: { paper: "58", drawerKick: true, junk: 1 } });
    const row = await devRow(uA, A1);
    if (r?.ok !== true) p.push(`update ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    if (!row || row.name !== "แคชเชียร์หน้า" || row.posRegNo !== "E0123456789012") p.push(`แถว name/posRegNo ${short(row && [row.name, row.posRegNo], 60)}`);
    if (!eqCfg(row?.printerConfig, { ...DEF_PC, paper: "58", drawerKick: true })) p.push(`printerConfig เก็บ ${short(row?.printerConfig, 120)}`);
    const before = JSON.stringify(await devRow(uA, A1));
    const b1 = await upd(ctx(uA, posS), owner, { id, printerConfig: { paper: "72" } }, "update bad printer");
    const b2 = await upd(ctx(uA, posS), owner, { id, name: "" }, "update empty name");
    if (!refused(b1, ["VALIDATION"])) p.push(`printer ผิด ${codeOf(b1)}`);
    if (!refused(b2, ["VALIDATION"])) p.push(`ชื่อว่าง ${codeOf(b2)}`);
    if (JSON.stringify(await devRow(uA, A1)) !== before) p.push("ค่าผิดแก้แถว");
    chk("G4", p.length === 0, "update ครบ · printerConfig parse แล้ว · ผิด = VALIDATION แถวเดิม", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ G5 revoke + กะเปิดค้าง + ลงซ้ำ ════════
  const REV = code("rev");
  let revShiftId = "";
  {
    const p: string[] = [];
    const r = await reg(ctx(uB, posS), owner, { name: "เครื่องหาย", deviceCode: REV });
    if (r?.ok !== true) p.push(`register ${codeOf(r)}`);
    const os = await call(shiftMod, "openShift", ctx(uB, posS, REV), owner, { deviceId: REV, floatSatang: 0 });
    revShiftId = os?.ok === true ? String(os.shift?.id ?? "") : "";
    if (!revShiftId) p.push(`เปิดกะก่อนเพิกถอน ${codeOf(os)}`);
    const row0 = await devRow(uB, REV);
    const rv = row0 ? await rev(ctx(uB, posS), owner, { id: row0.id }) : { ok: false, code: "NO_ROW" };
    const row = await devRow(uB, REV);
    if (rv?.ok !== true) p.push(`revoke ${codeOf(rv)}`);
    if (!row || row.status !== "REVOKED" || !(row.revokedAt instanceof Date)) p.push(`แถว ${short(row && [row.status, row.revokedAt], 60)}`);
    const sh = revShiftId ? await P.posShift.findUnique({ where: { id: revShiftId } }).catch(() => null) : null;
    if (revShiftId && sh?.status !== "OPEN") p.push(`กะของเครื่องกลายเป็น ${sh?.status}`);
    const again = await reg(ctx(uB, posS), owner, { name: "ขอกลับมา", deviceCode: REV }, "register revoked");
    if (!refused(again, ["DEVICE_REVOKED"])) p.push(`ลงรหัสที่ถูกเพิกถอน ${codeOf(again)}`);
    const row2 = await devRow(uB, REV);
    if (row2?.status !== "REVOKED" || (await devCount({ unitId: uB, deviceCode: REV })) !== 1) p.push("ลงซ้ำเปลี่ยนแถว/สร้างแถว");
    chk("G5", p.length === 0, "REVOKED + revokedAt · กะยัง OPEN · DEVICE_REVOKED", FX(p.join(" · ") || "ครบ"));
  }
  // ปิดกะของเครื่องที่ถูกเพิกถอน (ผู้จัดการปิดเอง) — ไม่ให้ค้างไปกระทบข้อถัดไป
  if (revShiftId) await call(shiftMod, "closeShift", ctx(uB, posS), owner, { shiftId: revShiftId, countedCashSatang: 0, idempotencyKey: `${TAG}-close-rev` });

  // ════════ G6 listDevices ════════
  {
    const p: string[] = [];
    const d1 = await devRow(uA, A1);
    const h = d1 ? await hb(ctx(uA, posS, A1), owner, A1) : { ok: false, code: "NO_ROW" };
    if (h?.ok !== true) p.push(`heartbeat ${codeOf(h)}`);
    const os = await call(shiftMod, "openShift", ctx(uA, posS, A1), owner, { deviceId: A1, floatSatang: 0 });
    const shiftNo = os?.ok === true ? os.shift?.shiftNo : undefined;
    const l1 = await list(ctx(uA, posS), owner);
    const it = itemsOf(l1);
    const me = it.find((x) => x?.deviceCode === A1 || x?.id === d1?.id);
    if (l1?.ok !== true) p.push(`list ${codeOf(l1)}`);
    if (!me) p.push("ไม่เห็นเครื่อง A1");
    else {
      if (me.online !== true) p.push(`online ${me.online}`);
      if (me.status !== "ACTIVE") p.push(`status ${me.status}`);
      if (!(me.openShift && me.openShift.shiftNo === shiftNo && me.openShift.openedAt)) p.push(`openShift ${short(me.openShift, 60)} (กะ ${shiftNo})`);
    }
    const other = it.find((x) => x?.deviceCode === A2);
    if (other && other.openShift !== null) p.push(`เครื่องไม่มีกะ openShift = ${short(other.openShift, 40)}`);
    if (it.some((x) => String(x?.deviceCode ?? "").includes("-b1") || String(x?.deviceCode ?? "").includes("-rev"))) p.push("เห็นเครื่องของสาขา B");
    if (it.find((x) => x?.deviceCode === A3)?.status !== "REVOKED") p.push("เครื่อง REVOKED ไม่อยู่ในรายการพร้อมสถานะ");
    await setSeen(d1?.id ?? "", 10 * 60_000);
    const me2 = itemsOf(await list(ctx(uA, posS), owner)).find((x) => x?.deviceCode === A1);
    if (!me2 || me2.online !== false) p.push(`10 นาทีก่อน online ${me2?.online}`);
    if (os?.ok === true) await call(shiftMod, "closeShift", ctx(uA, posS), owner, { shiftId: os.shift.id, countedCashSatang: 0, idempotencyKey: `${TAG}-close-a1` });
    chk("G6", p.length === 0, "online true/false · status · openShift · เฉพาะสาขา", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ G7 heartbeat ════════
  {
    const p: string[] = [];
    const d2 = await devRow(uA, A2);
    await setSeen(d2?.id ?? "", 10 * 60_000);
    const h1 = await hb(ctx(uA, posS, A2), owner, A2);
    const t1 = (await devRow(uA, A2))?.lastSeenAt as Date | undefined;
    if (h1?.ok !== true) p.push(`heartbeat ${codeOf(h1)}`);
    if (!(t1 instanceof Date) || Date.now() - t1.getTime() > 60_000) p.push(`ครั้งแรกไม่เขียน (${short(t1, 30)})`);
    await sleep(1200);
    await hb(ctx(uA, posS, A2), owner, A2);
    const t2 = (await devRow(uA, A2))?.lastSeenAt as Date | undefined;
    if (!(t1 && t2 && t2.getTime() === t1.getTime())) p.push(`ภายใน 30 วิ เขียนซ้ำ (${short(t1, 30)} → ${short(t2, 30)})`);
    await setSeen(d2?.id ?? "", 31_000);
    const t3a = (await devRow(uA, A2))?.lastSeenAt as Date | undefined;
    await hb(ctx(uA, posS, A2), owner, A2);
    const t3 = (await devRow(uA, A2))?.lastSeenAt as Date | undefined;
    if (!(t3a && t3 && t3.getTime() > t3a.getTime() + 20_000)) p.push("เก่า 31 วิ ไม่เขียน");
    await setSeen(d2?.id ?? "", 10 * 60_000);
    const st = await call(register, "registerStatus", ctx(uA, posS, A2), owner);
    const t4 = (await devRow(uA, A2))?.lastSeenAt as Date | undefined;
    if (st?.ok !== true) p.push(`registerStatus ${codeOf(st)}`);
    if (!(t4 && Date.now() - t4.getTime() < 60_000)) p.push(`registerStatus ไม่ heartbeat (${short(t4, 30)})`);
    const n0 = await devCount({});
    const unreg = code("unreg-status");
    await call(register, "registerStatus", ctx(uA, posS, unreg), owner);
    await hb(ctx(uA, posS, unreg), owner, unreg);
    if ((await devCount({})) !== n0) p.push("รหัสไม่ลงทะเบียนสร้างแถว");
    await setSeen(d2?.id ?? "", 10 * 60_000);
    const hc = await hb(ctx(uA, posS, A2), cashier, A2);
    const t5 = (await devRow(uA, A2))?.lastSeenAt as Date | undefined;
    if (hc?.ok !== true || !(t5 && Date.now() - t5.getTime() < 60_000)) p.push(`แคชเชียร์ heartbeat ${codeOf(hc)}`);
    chk("G7", p.length === 0, "เขียน · throttle 30 วิ · registerStatus · ไม่สร้างแถว · แคชเชียร์ได้", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ V1 การ์ด REVOKED · V2 ตัวควบคุมบวก ════════
  const amerCart = { lines: [{ productId: pAmer, qty: 1 }] };
  let saleB = "";
  {
    const p: string[] = [];
    const c = ctx(uB, posS, REV);
    const s = await sale(c, owner, amerCart);
    keep("sale revoked", s.r);
    if (!refused(s.r, ["DEVICE_REVOKED"])) p.push(`ขาย ${codeOf(s.r)}`);
    if ((await salesByKeyPart(s.key)) !== 0) p.push("มีบิล");
    const sh0 = await P.posShift.count({ where: { unitId: uB, deviceId: REV } }).catch(() => -1);
    const o1 = keep("openShift revoked", await call(shiftMod, "openShift", c, owner, { deviceId: REV, floatSatang: 0 }));
    const o2 = keep("openShift revoked (input only)", await call(shiftMod, "openShift", ctx(uB, posS), owner, { deviceId: REV, floatSatang: 0 }));
    if (!refused(o1, ["DEVICE_REVOKED"])) p.push(`เปิดกะ (ctx+input) ${codeOf(o1)}`);
    if (!refused(o2, ["DEVICE_REVOKED"])) p.push(`เปิดกะ (input อย่างเดียว) ${codeOf(o2)}`);
    if ((await P.posShift.count({ where: { unitId: uB, deviceId: REV } }).catch(() => -2)) !== sh0) p.push("มีกะใหม่");
    const hc0 = await P.posHeldCart.count({ where: { unitId: uB } }).catch(() => -1);
    const h = keep("hold revoked", await call(heldMod, "holdRegisterCart", c, owner, { cart: amerCart, label: "พักโดยเครื่องหาย" }));
    if (!refused(h, ["DEVICE_REVOKED"])) p.push(`พักบิล ${codeOf(h)}`);
    if ((await P.posHeldCart.count({ where: { unitId: uB } }).catch(() => -2)) !== hc0) p.push("มีบิลพักใหม่");
    const held = await call(heldMod, "holdRegisterCart", ctx(uB, posS), owner, { cart: amerCart, label: "พักโดยเครื่องอื่น" });
    const heldId = held?.ok === true ? held.heldCart?.id : "";
    if (!heldId) p.push(`เตรียมบิลพัก ${codeOf(held)}`);
    else {
      const rc = keep("recall revoked", await call(heldMod, "recallHeldCart", c, owner, { id: heldId }));
      if (!refused(rc, ["DEVICE_REVOKED"])) p.push(`เรียกคืน ${codeOf(rc)}`);
      const row = await P.posHeldCart.findUnique({ where: { id: heldId } }).catch(() => null);
      if (row?.status !== "HELD") p.push(`บิลพักกลายเป็น ${row?.status}`);
    }
    chk("V1", p.length === 0, "DEVICE_REVOKED ×5 · ไม่มีแถว · บิลพักยัง HELD", FX(p.join(" · ") || "ครบ"));

    // V2
    const q: string[] = [];
    const U = code("unreg");
    const cU = ctx(uA, posS, U);
    const sU = await sale(cU, owner, amerCart);
    if (sU.r?.ok !== true) q.push(`ขายด้วยรหัสไม่ลงทะเบียน ${codeOf(sU.r)} ${short(sU.r?.message ?? "", 60)}`);
    const hU = await call(heldMod, "holdRegisterCart", cU, owner, { cart: amerCart, label: "พักปกติ" });
    if (hU?.ok !== true) q.push(`พัก ${codeOf(hU)}`);
    else {
      const rU = await call(heldMod, "recallHeldCart", cU, owner, { id: hU.heldCart?.id });
      if (rU?.ok !== true) q.push(`เรียกคืน ${codeOf(rU)}`);
    }
    // เงื่อนไขก่อน: ตัวควบคุมบวกมีความหมายเมื่อ A2 ลงทะเบียน ACTIVE จริง และ REV ถูกเพิกถอนจริงที่สาขา B (ไม่งั้นข้อนี้ว่างเปล่า)
    const a2row = await devRow(uA, A2);
    const revRow = await devRow(uB, REV);
    if (a2row?.status !== "ACTIVE") q.push(`เงื่อนไขก่อน: A2 ไม่ ACTIVE (${a2row?.status ?? "ไม่มีแถว"})`);
    if (revRow?.status !== "REVOKED") q.push(`เงื่อนไขก่อน: REV ที่สาขา B ไม่ REVOKED (${revRow?.status ?? "ไม่มีแถว"})`);
    const heldNow = heldId ? await P.posHeldCart.findUnique({ where: { id: heldId } }).catch(() => null) : null;
    if (heldId && heldNow?.status === "HELD") {
      const rOther = await call(heldMod, "recallHeldCart", ctx(uB, posS, code("other")), owner, { id: heldId });
      if (rOther?.ok !== true) q.push(`เรียกคืนบิลพักของ V1 จากเครื่องปกติ ${codeOf(rOther)}`);
    }
    const oU = await call(shiftMod, "openShift", cU, owner, { deviceId: U, floatSatang: 0 });
    if (oU?.ok !== true) q.push(`เปิดกะ ${codeOf(oU)}`);
    else await call(shiftMod, "closeShift", ctx(uA, posS), owner, { shiftId: oU.shift.id, countedCashSatang: 0, idempotencyKey: `${TAG}-close-unreg` });
    const sA = await sale(ctx(uA, posS, A2), owner, amerCart);
    if (sA.r?.ok !== true) q.push(`ขายด้วยรหัส ACTIVE ${codeOf(sA.r)}`);
    const sX = await sale(ctx(uC, posS, REV), owner, amerCart);
    if (sX.r?.ok !== true) q.push(`รหัสเดียวกันที่สาขา C ${codeOf(sX.r)}`);
    const sBn = await sale(ctx(uB, posS), owner, amerCart);
    saleB = sBn.saleId;
    if (sBn.r?.ok !== true) q.push(`ขายสาขา B ไม่ส่งรหัส ${codeOf(sBn.r)}`);
    chk("V2", q.length === 0, "ไม่ลงทะเบียน ขาย/พัก/เรียกคืน/เปิดกะ ได้ · ACTIVE ได้ · อีกสาขาได้", FX(q.join(" · ") || "ครบ"));
  }

  // ════════ A1 ข้ามสาขา/ร้าน ════════
  {
    const p: string[] = [];
    const d1 = await devRow(uA, A1);
    const before = JSON.stringify(d1);
    const lb = itemsOf(await list(ctx(uB, posS), owner));
    if (lb.some((x) => x?.deviceCode === A1 || x?.id === d1?.id)) p.push("listDevices สาขา B เห็นเครื่องสาขา A");
    const u = await upd(ctx(uB, posS), owner, { id: d1?.id ?? "-", name: "แฮก" }, "update cross-unit");
    const r = await rev(ctx(uB, posS), owner, { id: d1?.id ?? "-" }, "revoke cross-unit");
    if (!refused(u, ["DEVICE_NOT_FOUND"])) p.push(`update ข้ามสาขา ${codeOf(u)}`);
    if (!refused(r, ["DEVICE_NOT_FOUND"])) p.push(`revoke ข้ามสาขา ${codeOf(r)}`);
    const uR = await upd(ctxR, restoOwner, { id: d1?.id ?? "-", name: "แฮก" }, "update cross-tenant");
    const rR = await rev(ctxR, restoOwner, { id: d1?.id ?? "-" }, "revoke cross-tenant");
    if (!refused(uR, ["DEVICE_NOT_FOUND"])) p.push(`update ข้ามร้าน ${codeOf(uR)}`);
    if (!refused(rR, ["DEVICE_NOT_FOUND"])) p.push(`revoke ข้ามร้าน ${codeOf(rR)}`);
    const lR = await list(ctxR, restoOwner);
    if (lR?.ok !== true) p.push(`list ร้านอาหาร ${codeOf(lR)}`);
    if (itemsOf(lR).some((x) => String(x?.deviceCode ?? "").startsWith(TAG))) p.push("ร้านอาหารเห็นเครื่องของร้านกาแฟ");
    const un = await upd(ctx(uA, posS), owner, { id: `${TAG}-nope`, name: "x" }, "update unknown");
    if (!refused(un, ["DEVICE_NOT_FOUND"])) p.push(`id มั่ว ${codeOf(un)}`);
    if (JSON.stringify(await devRow(uA, A1)) !== before) p.push("แถวถูกแก้");
    chk("A1", p.length === 0, "มองไม่เห็นข้ามสาขา/ร้าน · DEVICE_NOT_FOUND ×5", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ A2 สิทธิ์ ════════
  {
    const p: string[] = [];
    const d2 = await devRow(uA, A2);
    const before = JSON.stringify(d2);
    const n0 = await devCount({});
    const r1 = await reg(ctx(uA, posS), cashier, { name: "แคชเชียร์ลงเอง", deviceCode: code("cash1") }, "register cashier");
    const r2 = await upd(ctx(uA, posS), cashier, { id: d2?.id ?? "-", name: "แก้โดยแคชเชียร์" }, "update cashier");
    const r3 = await rev(ctx(uA, posS), cashier, { id: d2?.id ?? "-" }, "revoke cashier");
    const r4 = await list(ctx(uA, posS), cashier, "list cashier");
    for (const [n, r] of [["register", r1], ["update", r2], ["revoke", r3], ["list", r4]] as [string, Any][]) if (!refused(r, PERM)) p.push(`${n} ${codeOf(r)}`);
    if ((await devCount({})) !== n0 || JSON.stringify(await devRow(uA, A2)) !== before) p.push("แถวเปลี่ยน");
    const ok = await reg(ctx(uC, posS), staffMgr, { name: "ผู้ได้สิทธิ์", deviceCode: code("c3") });
    if (ok?.ok === true && !(await devRow(uC, code("c3")))) p.push("STAFF + manage ok แต่ไม่มีแถว");
    if (ok?.ok !== true) p.push(`STAFF + pos.device.manage ${codeOf(ok)}`);
    const rs = keep("receipt settings cashier", await call(rsetMod, "updatePosReceiptSettings", { tenantId: tid, systemId: posS }, cashier, { footer: "แคชเชียร์แก้" }));
    if (!refused(rs, PERM)) p.push(`ตั้งค่าใบเสร็จโดยแคชเชียร์ ${codeOf(rs)}`);
    chk("A2", p.length === 0, "ไม่มี manage = ปฏิเสธ ×4 + ตั้งค่าใบเสร็จ · STAFF+manage ได้", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ RS1 parseReceiptSettings ════════
  {
    const p: string[] = [];
    for (const v of [undefined, null, {}]) {
      const r = unwrapCfg(callSync(rsParseMod, "parseReceiptSettings", v));
      if (!isRecord(r) || r.footer !== "ขอบคุณที่อุดหนุนค่ะ" || r.showPoints !== true || r.showCashier !== true || r.qrEReceipt !== true) p.push(`ค่าปริยาย(${short(v, 8)}) ${short(r, 120)}`);
      else if (!isRecord(r.header) || r.header.name || r.header.phone || r.header.address || (r.header.logoUrl !== null && r.header.logoUrl !== undefined)) p.push(`header ปริยาย ${short(r.header, 80)}`);
    }
    const edge = { header: { name: "น".repeat(80), phone: "0".repeat(30), address: "ท".repeat(200), logoUrl: "https://example.com/l.png" }, footer: "ข".repeat(200), showPoints: false, showCashier: false, qrEReceipt: false };
    const re = unwrapCfg(callSync(rsParseMod, "parseReceiptSettings", edge));
    if (!isRecord(re) || re.footer !== edge.footer || re.showPoints !== false || re.showCashier !== false || re.qrEReceipt !== false || re.header?.name !== edge.header.name || re.header?.logoUrl !== edge.header.logoUrl) p.push(`ขอบผ่าน ${short(re, 100)}`);
    for (const [field, bad] of [
      ["name", { header: { name: "น".repeat(81) } }], ["phone", { header: { phone: "0".repeat(31) } }], ["address", { header: { address: "ท".repeat(201) } }],
      ["footer", { footer: "ข".repeat(201) }], ["logoUrl", { header: { logoUrl: "ftp://example.com/l.png" } }], ["logoUrl", { header: { logoUrl: "javascript:alert(1)" } }], ["logoUrl", { header: { logoUrl: "ไม่ใช่ลิงก์" } }],
    ] as [string, Any][]) {
      const r = callSync(rsParseMod, "parseReceiptSettings", bad);
      if (!namesField(r, field)) p.push(`${field} ${codeOf(r)} ${short(r?.field ?? r?.message ?? "", 40)}`);
      else keep(`receipt ${field}`, r);
    }
    const nul = unwrapCfg(callSync(rsParseMod, "parseReceiptSettings", { header: { logoUrl: null } }));
    if (!(isRecord(nul) && nul.header?.logoUrl === null)) p.push(`logoUrl null ${short(nul, 60)}`);
    chk("RS1", p.length === 0, "ค่าปริยาย · ขอบผ่าน · เกิน/URL ผิด = VALIDATION ระบุฟิลด์", p.join(" · ") || "ครบ");
  }

  // ════════ บิล VAT ของข้อสอบ (POS-V · เครื่องลงทะเบียน · กะเปิด · ตัวเลือก · ส่วนลด · ค่าบริการ · สมาชิก · แบ่งจ่าย) ════════
  const DV = code("v1");
  let saleV = "", shiftV: Any = null;
  {
    await reg(ctx(uV, posV), owner, { name: "เคาน์เตอร์วี", deviceCode: DV });
    const dv = await devRow(uV, DV);
    if (dv) await upd(ctx(uV, posV), owner, { id: dv.id, posRegNo: "POS001" });
    const os = await call(shiftMod, "openShift", ctx(uV, posV, DV), owner, { deviceId: DV, floatSatang: 0 });
    shiftV = os?.ok === true ? os.shift : null;
    const cart = {
      lines: [
        { productId: pLatte, qty: 1, options: [{ choiceId: chShot }, { choiceId: chWhip }] },
        { productId: pCrois, qty: 2, discount: { type: "AMOUNT", value: 1000 }, note: "อุ่นร้อน" },
      ],
      billDiscount: { type: "AMOUNT", value: 500 },
      memberId: customerId,
    };
    const s = await sale(ctx(uV, posV, DV), owner, cart, (g) => ({ payMethods: [{ type: "CASH", amountSatang: 10000 }, { type: "PROMPTPAY", amountSatang: g - 10000 }], cashReceivedSatang: 20000 }));
    saleV = s.saleId;
    if (!saleV) console.log(`  ⚠️  บิล VAT ไม่สำเร็จ: quote ${codeOf(s.q)} submit ${codeOf(s.r)} ${short(s.r?.message ?? s.q?.message ?? "", 120)}`);
    else {
      // ทิปปิดอยู่ (P1.6 R2 F5 TIP_POSTING_READY=false) ⇒ เขียนทิป 500 ลงบิลของข้อสอบตรง ๆ (พร้อมเพย์ +500 · Σจ่าย = ยอด + ทิป) · แต้มที่ได้ 18 (สะพานแต้มเขียนหลังคิว)
      try {
        await P.posSale.update({ where: { id: saleV }, data: { tipSatang: 500, pointEarned: 18 } });
        const pp = await P.posPayment.findFirst({ where: { saleId: saleV, type: "PROMPTPAY" } });
        if (pp) await P.posPayment.update({ where: { id: pp.id }, data: { amountSatang: pp.amountSatang + 500 } });
      } catch (e) {
        fx ||= `tip:${(e as Error).message.slice(0, 80)}`;
      }
    }
  }
  const saleVRow = saleV ? await P.posSale.findUnique({ where: { id: saleV }, include: { lines: { orderBy: { id: "asc" }, include: { options: true } }, payments: { orderBy: { id: "asc" } } } }).catch(() => null) : null;
  if (saleVRow) console.log(`  (บิล VAT ของข้อสอบ: grand ${saleVRow.grandTotalSatang} · vat ${saleVRow.vatSatang} · SC ${saleVRow.serviceChargeSatang} · tip ${saleVRow.tipSatang} · บรรทัด ${short(saleVRow.lines.map((l: Any) => [l.qty, l.unitPriceSatang, l.discountSatang, l.lineTotalSatang, l.options.length]), 80)} · จ่าย ${short(saleVRow.payments.map((x: Any) => [x.type, x.amountSatang, x.tenderedSatang, x.changeSatang]), 100)} · shift ${saleVRow.shiftId ? "ผูก" : "ไม่ผูก"} · member ${saleVRow.memberId ? "มี" : "ไม่มี"})`);
  const payload = async (c: Any, a: Any, saleId: string, copy?: boolean) => {
    const r = await call(rcpMod, "receiptPayload", c, a, copy === undefined ? { saleId } : { saleId, copy });
    keep("receiptPayload", r);
    return r;
  };
  const pOf = (r: Any): Any => (r?.ok === true ? (r.payload ?? r.receipt ?? r) : null);
  const auditCount = (saleId: string) => P.auditLog.count({ where: { tenantId: tid, action: "pos.receipt.reprint", targetType: "PosSale", targetId: saleId } }).catch(() => -1);
  const rV = saleV ? await payload(ctx(uV, posV), owner, saleV) : { ok: false, code: "NO_SALE" };
  const PV = pOf(rV);
  const VB = !saleV ? "บิล VAT ของข้อสอบสร้างไม่ได้ · " : !PV ? `receiptPayload ${codeOf(rV)} ${short(rV?.message ?? "", 60)} · ` : "";

  // ════════ P1 หัว/เครื่อง/เอกสาร ════════
  {
    const p: string[] = [];
    if (PV) {
      if (PV.docType !== "SALE") p.push(`docType ${PV.docType}`);
      if (PV.kind !== "TAX_INVOICE_ABB") p.push(`kind ${PV.kind}`);
      if (PV.copy !== false) p.push(`copy ${PV.copy}`);
      if (PV.paper !== null) p.push(`paper ${PV.paper}`);
      const s = PV.shop ?? {};
      const unitName = (await P.businessUnit.findUnique({ where: { id: uV }, select: { name: true } }))?.name;
      if (s.name !== BOOK.orgName) p.push(`shop.name ${s.name}`);
      if (s.branchName !== unitName) p.push(`shop.branchName ${s.branchName}`);
      if (s.address !== BOOK.address) p.push(`shop.address ${s.address}`);
      if (s.phone !== BOOK.phone) p.push(`shop.phone ${s.phone}`);
      if (s.taxId !== BOOK.taxId) p.push(`shop.taxId ${s.taxId}`);
      if (s.branchNo !== BOOK.branchCode) p.push(`shop.branchNo ${s.branchNo}`);
      if (s.logoUrl !== BOOK.logoUrl) p.push(`shop.logoUrl ${s.logoUrl}`);
      if (PV.device?.name !== "เคาน์เตอร์วี" || PV.device?.posRegNo !== "POS001") p.push(`device ${short(PV.device, 60)}`);
      const d = PV.doc ?? {};
      if (d.receiptNo !== saleVRow?.receiptNo || !d.receiptNo) p.push(`receiptNo ${d.receiptNo} (DB ${saleVRow?.receiptNo})`);
      const at = Date.parse(String(d.issuedAt));
      const okAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(d.issuedAt)) && [saleVRow?.paidAt, saleVRow?.createdAt].some((x: Any) => x instanceof Date && x.getTime() === at);
      if (!okAt) p.push(`issuedAt ${d.issuedAt}`);
      if (d.cashierName !== ownerName) p.push(`cashierName ${d.cashierName} (ผู้ขาย ${ownerName})`);
      if (!shiftV || d.shiftNo !== shiftV.shiftNo) p.push(`shiftNo ${d.shiftNo} (กะ ${shiftV?.shiftNo})`);
      if (d.refReceiptNo !== undefined && d.refReceiptNo !== null) p.push(`refReceiptNo ${d.refReceiptNo}`);
    }
    chk("P1", !VB && p.length === 0, "SALE · ABB · หัวจากสมุด · เครื่อง POS001 · เลขที่/วันที่/แคชเชียร์/กะ", FX(VB + (p.join(" · ") || "ครบ")));
  }
  // ════════ P2 บรรทัด ════════
  {
    const p: string[] = [];
    const L = Array.isArray(PV?.lines) ? PV.lines : [];
    const dbL = (saleVRow?.lines ?? []) as Any[];
    if (PV) {
      if (L.length !== 2 || dbL.length !== 2) p.push(`จำนวนบรรทัด ${L.length} (DB ${dbL.length})`);
      else {
        const [a, b] = L;
        const [da, db] = dbL;
        for (const [x, dx, nm] of [[a, da, "ลาเต้"], [b, db, "ครัวซองต์"]] as [Any, Any, string][]) {
          if (!String(x.name ?? "").includes(nm)) p.push(`ชื่อ ${x.name}`);
          if (x.qty !== dx.qty || x.unitPriceSatang !== dx.unitPriceSatang || x.lineTotalSatang !== dx.lineTotalSatang || x.discountSatang !== dx.discountSatang) p.push(`${nm} ตัวเลข ${short([x.qty, x.unitPriceSatang, x.discountSatang, x.lineTotalSatang], 50)} DB ${short([dx.qty, dx.unitPriceSatang, dx.discountSatang, dx.lineTotalSatang], 50)}`);
          if (!Array.isArray(x.options) || x.options.some((o: unknown) => typeof o !== "string")) p.push(`${nm} options ไม่ใช่ string[]`);
          if (x.weightGrams !== undefined && x.weightGrams !== null) p.push(`${nm} weightGrams ${x.weightGrams}`);
        }
        if (a.unitPriceSatang !== 7500 || a.qty !== 1 || a.discountSatang !== 0) p.push(`ลาเต้ ${a.unitPriceSatang}/${a.qty}/${a.discountSatang} (คาด 7,500 รวมตัวเลือก)`);
        if (!(Array.isArray(a.options) && a.options.length === 2 && a.options.some((o: string) => o.includes("ช็อตเพิ่ม")) && a.options.some((o: string) => o.includes("วิปครีม")))) p.push(`ลาเต้ options ${short(a.options, 60)}`);
        if (b.qty !== 2 || b.unitPriceSatang !== 5500 || b.discountSatang !== 1000 || b.lineTotalSatang !== 10000) p.push(`ครัวซองต์ ${short([b.qty, b.unitPriceSatang, b.discountSatang, b.lineTotalSatang], 40)}`);
        if (b.note !== "อุ่นร้อน") p.push(`note ${b.note}`);
        if (Array.isArray(b.options) && b.options.length) p.push(`ครัวซองต์ options ${short(b.options, 40)}`);
      }
    }
    chk("P2", !VB && p.length === 0, "2 บรรทัดตามลำดับ · ตัวเลือก · ส่วนลด · note", FX(VB + (p.join(" · ") || "ครบ")));
  }
  // ════════ P3 ยอด ════════
  {
    const p: string[] = [];
    const t = PV?.totals ?? {};
    if (PV) {
      const L = (Array.isArray(PV.lines) ? PV.lines : []) as Any[];
      const gross = L.reduce((s, l) => s + l.qty * l.unitPriceSatang, 0);
      if (t.subtotalSatang !== gross || t.subtotalSatang !== 18500) p.push(`subtotal ${t.subtotalSatang} (Σ ${gross} · คาด 18,500)`);
      if (t.lineDiscountSatang !== 1000) p.push(`lineDiscount ${t.lineDiscountSatang}`);
      if (t.billDiscountSatang !== 500) p.push(`billDiscount ${t.billDiscountSatang}`);
      if (t.couponDiscountSatang !== 0) p.push(`coupon ${t.couponDiscountSatang}`);
      if (t.couponCode !== undefined && t.couponCode !== null) p.push(`couponCode ${t.couponCode}`);
      if (t.tierDiscountSatang !== 0) p.push(`tier ${t.tierDiscountSatang}`);
      if (t.serviceChargeSatang !== 1700 || t.serviceChargeSatang !== saleVRow?.serviceChargeSatang) p.push(`SC ${t.serviceChargeSatang} (DB ${saleVRow?.serviceChargeSatang})`);
      if (t.grandTotalSatang !== 18700 || t.grandTotalSatang !== saleVRow?.grandTotalSatang) p.push(`grand ${t.grandTotalSatang} (DB ${saleVRow?.grandTotalSatang})`);
      const ident = t.subtotalSatang - t.lineDiscountSatang - t.billDiscountSatang - t.couponDiscountSatang - t.tierDiscountSatang + t.serviceChargeSatang;
      if (ident !== t.grandTotalSatang) p.push(`เอกลักษณ์ยอด ${ident} ≠ ${t.grandTotalSatang}`);
      if (t.vatSatang !== 1223 || t.vatSatang !== saleVRow?.vatSatang) p.push(`vat ${t.vatSatang} (DB ${saleVRow?.vatSatang} · คาด 1,223)`);
      if (t.vatBaseSatang + t.vatSatang !== t.grandTotalSatang) p.push(`vatBase+vat ${t.vatBaseSatang}+${t.vatSatang}`);
      if (t.vatRateBp !== 700) p.push(`vatRateBp ${t.vatRateBp}`);
      if (t.tipSatang !== 500) p.push(`tip ${t.tipSatang}`);
      const ints = ["subtotalSatang", "lineDiscountSatang", "billDiscountSatang", "couponDiscountSatang", "tierDiscountSatang", "serviceChargeSatang", "grandTotalSatang", "vatBaseSatang", "vatSatang", "tipSatang"].filter((k) => !Number.isInteger(t[k]));
      if (ints.length) p.push(`ไม่ใช่จำนวนเต็ม ${ints.join(",")}`);
    }
    chk("P3", !VB && p.length === 0, "18,500 − 1,000 − 500 + 1,700 = 18,700 · ฐาน 17,477 + VAT 1,223 · ทิป 500", FX(VB + (p.join(" · ") || "ครบ")));
  }
  // ════════ P4 ชำระ + สมาชิก ════════
  {
    const p: string[] = [];
    if (PV) {
      const pays = (Array.isArray(PV.payments) ? PV.payments : []) as Any[];
      const cash = pays.find((x) => x.type === "CASH");
      const pp = pays.find((x) => x.type === "PROMPTPAY");
      if (pays.length !== 2) p.push(`payments ${pays.length}`);
      if (!cash || cash.amountSatang !== 10000 || cash.tenderedSatang !== 20000 || cash.changeSatang !== 10000) p.push(`CASH ${short(cash, 80)}`);
      if (!pp || pp.amountSatang !== 9200 || (pp.tenderedSatang !== undefined && pp.tenderedSatang !== null)) p.push(`PROMPTPAY ${short(pp, 80)}`);
      const sum = pays.reduce((s, x) => s + (x.amountSatang ?? 0), 0);
      if (sum !== (PV.totals?.grandTotalSatang ?? NaN) + (PV.totals?.tipSatang ?? NaN)) p.push(`Σ ${sum} ≠ grand + tip`);
      const m = PV.member;
      if (!m || m.name !== customerName || m.tierName !== tierName || m.pointEarned !== 18) p.push(`member ${short(m, 100)}`);
    }
    chk("P4", !VB && p.length === 0, "CASH รับ 200 ทอน 100 · พร้อมเพย์ 92 · Σ = ยอด+ทิป · สมาชิก/ระดับ/แต้ม", FX(VB + (p.join(" · ") || "ครบ")));
  }
  // ════════ P5 kind ════════
  let PS: Any = null;
  {
    const p: string[] = [];
    const sS = await sale(ctx(uA, posS), owner, amerCart, (g) => ({ payMethods: [{ type: "PROMPTPAY", amountSatang: g }] }));
    const rS = sS.saleId ? await payload(ctx(uA, posS), owner, sS.saleId) : { ok: false, code: `NO_SALE:${codeOf(sS.r)}` };
    PS = pOf(rS);
    if (!PS) p.push(`payload ไม่ผูกสมุด ${codeOf(rS)}`);
    else {
      if (PS.kind !== "RECEIPT") p.push(`ไม่ผูก kind ${PS.kind}`);
      if (PS.totals?.vatSatang !== 0) p.push(`ไม่ผูก vat ${PS.totals?.vatSatang}`);
      if (PS.shop?.taxId || PS.shop?.branchNo) p.push(`ไม่ผูก มี taxId/branchNo ${short([PS.shop?.taxId, PS.shop?.branchNo], 40)}`);
      if (PS.footer?.fullTaxInvoiceHint !== false) p.push(`ไม่ผูก hint ${PS.footer?.fullTaxInvoiceHint}`);
      if (typeof PS.shop?.name !== "string" || !PS.shop.name.trim()) p.push("ไม่ผูก shop.name ว่าง");
    }
    const sW = await sale(ctx(uW, posW), owner, { lines: [{ productId: pW, qty: 1 }] }, (g) => ({ payMethods: [{ type: "PROMPTPAY", amountSatang: g }] }));
    const rW = sW.saleId ? await payload(ctx(uW, posW), owner, sW.saleId) : { ok: false, code: `NO_SALE:${codeOf(sW.r)}` };
    const PW = pOf(rW);
    if (!PW) p.push(`payload ปิด posAbbreviated ${codeOf(rW)}`);
    else if (PW.kind !== "RECEIPT") p.push(`ปิด posAbbreviated kind ${PW.kind}`);
    if (PV) {
      if (!/^\d{13}$/.test(String(PV.shop?.taxId ?? "")) || !PV.shop?.branchNo) p.push(`ABB taxId/branchNo ${short([PV.shop?.taxId, PV.shop?.branchNo], 40)}`);
      if (PV.footer?.fullTaxInvoiceHint !== true) p.push(`ABB hint ${PV.footer?.fullTaxInvoiceHint}`);
    } else p.push("ไม่มี payload ABB");
    chk("P5", p.length === 0, "ไม่ผูก = RECEIPT · ปิด posAbbreviated = RECEIPT · ABB มี taxId/branchNo/hint", FX(p.join(" · ") || "ครบ"));
  }
  // ════════ P6 สำเนา + audit + labels ════════
  {
    const p: string[] = [];
    if (PV) {
      const a0 = await auditCount(saleV);
      if (a0 !== 0) p.push(`มี audit ตั้งแต่ต้นฉบับ ${a0}`);
      const c1 = pOf(await payload(ctx(uV, posV), owner, saleV, true));
      const a1 = await auditCount(saleV);
      const c2 = pOf(await payload(ctx(uV, posV), owner, saleV, true));
      const a2 = await auditCount(saleV);
      await payload(ctx(uV, posV), owner, saleV, false);
      const a3 = await auditCount(saleV);
      if (c1?.copy !== true || c2?.copy !== true) p.push(`copy ${c1?.copy}/${c2?.copy}`);
      if (a1 !== 1 || a2 !== 2 || a3 !== 2) p.push(`audit 0→${a1}→${a2}→${a3} (คาด 1→2→2)`);
      const au = (await P.auditLog.findFirst({ where: { tenantId: tid, action: "pos.receipt.reprint", targetId: saleV } }).catch(() => null)) as Any;
      if (au && au.actorId !== owner.userId) p.push(`audit actorId ${au.actorId}`);
      if (PV.footer?.qrEReceiptUrl !== null) p.push(`qrEReceiptUrl ${short(PV.footer?.qrEReceiptUrl, 40)}`);
      if (PV.footer?.text !== "ขอบคุณที่อุดหนุนค่ะ") p.push(`footer.text ${PV.footer?.text}`);
      const lt = PV.labels?.th, le = PV.labels?.en;
      if (!isRecord(lt) || !isRecord(le)) p.push("labels.th/en ไม่ใช่ object");
      else {
        const kt = Object.keys(lt).sort().join(","), ke = Object.keys(le).sort().join(",");
        if (kt !== ke) p.push("คีย์ labels th ≠ en");
        if (Object.keys(lt).length < 8) p.push(`labels น้อย (${Object.keys(lt).length})`);
        const flatV = (o: unknown): string[] => (isRecord(o) ? Object.values(o).flatMap(flatV) : [String(o ?? "")]);
        if (flatV(le).some((v) => THAI.test(v))) p.push("labels.en มีอักษรไทย");
        if (flatV(le).some((v) => !v.trim())) p.push("labels.en มีค่าว่าง");
        if (!flatV(lt).some((v) => THAI.test(v))) p.push("labels.th ไม่มีอักษรไทย");
      }
    }
    chk("P6", !VB && p.length === 0, "สำเนา audit 1 แถว/ครั้ง · ต้นฉบับไม่เขียน · qr null · labels th/en", FX(VB + (p.join(" · ") || "ครบ")));
  }

  // ════════ A3 receiptPayload ข้ามขอบเขต ════════
  {
    const p: string[] = [];
    const sOwn = await sale(ctx(uA, posS), cashier, amerCart);
    const a0 = await P.auditLog.count({ where: { tenantId: { in: TIDS }, action: "pos.receipt.reprint", createdAt: { gte: runStart } } }).catch(() => -1);
    if (!saleB) p.push("ไม่มีบิลสาขา B (V2)");
    else {
      const x = await payload(ctx(uA, posS), cashier, saleB, true);
      if (!refused(x, ["SALE_NOT_FOUND"])) p.push(`แคชเชียร์ A อ่านบิล B ${codeOf(x)}`);
      const y = await payload(ctxR, restoOwner, saleB, true);
      if (!refused(y, ["SALE_NOT_FOUND"])) p.push(`ร้านอาหารอ่านบิลกาแฟ ${codeOf(y)}`);
    }
    if (saleV) {
      const z = await payload(ctx(uA, posS), owner, saleV);
      if (!refused(z, ["SALE_NOT_FOUND"])) p.push(`ctx POS-S อ่านบิล POS-V ${codeOf(z)}`);
    }
    const n = await payload(ctx(uA, posS), owner, `${TAG}-nope`, true);
    if (!refused(n, ["SALE_NOT_FOUND"])) p.push(`id มั่ว ${codeOf(n)}`);
    const a1 = await P.auditLog.count({ where: { tenantId: { in: TIDS }, action: "pos.receipt.reprint", createdAt: { gte: runStart } } }).catch(() => -2);
    if (a1 !== a0) p.push(`คำขอที่ถูกปฏิเสธเขียน audit ${a0}→${a1}`);
    if (!sOwn.saleId) p.push(`เตรียมบิลแคชเชียร์ ${codeOf(sOwn.r)}`);
    else {
      const own = await payload(ctx(uA, posS), cashier, sOwn.saleId);
      if (own?.ok !== true) p.push(`แคชเชียร์อ่านบิลสาขาตัวเอง ${codeOf(own)}`);
    }
    chk("A3", p.length === 0, "SALE_NOT_FOUND ×4 · ไม่มี audit · บิลตัวเอง ok", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ RS2 ตั้งค่าใบเสร็จ (เก็บ · คีย์อื่นไม่หาย · payload ใช้ค่าใหม่) ════════
  {
    const p: string[] = [];
    const sctx = { tenantId: tid, systemId: posV };
    const r0 = await call(rsetMod, "posReceiptSettings", sctx);
    const v0 = unwrapCfg(r0);
    if (r0?.ok === false || !isRecord(v0) || v0.footer !== "ขอบคุณที่อุดหนุนค่ะ") p.push(`อ่านปริยาย ${codeOf(r0)} ${short(v0, 80)}`);
    const u = await call(rsetMod, "updatePosReceiptSettings", sctx, owner, { header: { name: "คิวซีคาเฟ่ หัวบิล" }, footer: "แล้วพบกันใหม่" });
    if (u?.ok === false) p.push(`update ${codeOf(u)} ${short(u?.message ?? "", 60)}`);
    const sys = await P.appSystem.findUnique({ where: { id: posV }, select: { settings: true } });
    const st = (sys?.settings ?? {}) as Any;
    if (st?.pos?.receipt?.footer !== "แล้วพบกันใหม่" || st?.pos?.receipt?.header?.name !== "คิวซีคาเฟ่ หัวบิล") p.push(`เก็บ ${short(st?.pos?.receipt, 100)}`);
    if (st?.pos?.serviceCharge?.rateBp !== 1000 || st?.pos?.serviceCharge?.enabled !== true) p.push("settings.pos.serviceCharge หาย");
    const bad = keep("receipt settings footer 201", await call(rsetMod, "updatePosReceiptSettings", sctx, owner, { footer: "ข".repeat(201) }));
    if (!refused(bad, ["VALIDATION"])) p.push(`footer 201 ${codeOf(bad)}`);
    const st2 = ((await P.appSystem.findUnique({ where: { id: posV }, select: { settings: true } }))?.settings ?? {}) as Any;
    if (st2?.pos?.receipt?.footer !== "แล้วพบกันใหม่") p.push("ค่าผิดเขียนทับ");
    const r1 = await call(rsetMod, "posReceiptSettings", sctx);
    if (unwrapCfg(r1)?.footer !== "แล้วพบกันใหม่") p.push(`อ่านหลังแก้ ${short(unwrapCfg(r1), 60)}`);
    if (saleV) {
      const pv = pOf(await payload(ctx(uV, posV), owner, saleV));
      if (pv?.shop?.name !== "คิวซีคาเฟ่ หัวบิล") p.push(`payload shop.name ${pv?.shop?.name}`);
      if (pv?.footer?.text !== "แล้วพบกันใหม่") p.push(`payload footer ${pv?.footer?.text}`);
      if (pv?.shop?.taxId !== BOOK.taxId) p.push(`payload taxId ${pv?.shop?.taxId}`);
    } else p.push("ไม่มีบิล VAT");
    chk("RS2", p.length === 0, "อ่าน/เก็บ/คีย์อื่นคง · VALIDATION ไม่ทับ · payload ใช้ค่าใหม่", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ H HTML ════════
  const html = (pl: Any, paper: string, locale: string): string => {
    const r = callSync(renderMod, "renderReceiptHtml", pl, { paper, locale });
    return typeof r === "string" ? r : "";
  };
  const latin = (pl: Any): Any => {
    if (!pl) return null;
    const c = JSON.parse(JSON.stringify(pl));
    c.shop = { ...c.shop, name: "QC Cafe Co., Ltd.", branchName: "Branch V", address: "88/8 Test Road, Bangkok 10110" };
    c.device = { ...c.device, name: "Counter V" };
    c.doc = { ...c.doc, cashierName: "Owner QC" };
    c.lines = (c.lines ?? []).map((l: Any, i: number) => ({ ...l, name: i === 0 ? "Iced latte" : "Croissant", options: (l.options ?? []).map((_: unknown, j: number) => (j === 0 ? "Extra shot" : "Whipped cream")), ...(l.note ? { note: "warm" } : {}) }));
    if (c.member) c.member = { ...c.member, name: "Somjai", tierName: "Silver" };
    c.footer = { ...c.footer, text: "Thank you" };
    return c;
  };
  const PVc = PV ? { ...JSON.parse(JSON.stringify(PV)), copy: true } : null;
  {
    const p: string[] = [];
    const h = PV ? html(PV, "80", "th") : "";
    if (!h) p.push(PV ? `renderReceiptHtml ${codeOf(callSync(renderMod, "renderReceiptHtml", PV, { paper: "80", locale: "th" }))}` : "ไม่มี payload");
    else {
      const { order, text } = htmlSections(h);
      if (order.join(",") !== SECTIONS.join(",")) p.push(`ลำดับ ${order.join(">") || "ไม่มี data-section"}`);
      const has = (s: string, needle: string, lbl: string) => {
        if (!(text[s] ?? "").includes(needle)) p.push(`${s} ไม่มี ${lbl}`);
      };
      has("header", PV.shop.name, "ชื่อร้าน");
      has("header", String(PV.shop.taxId), "taxId");
      has("header", String(PV.shop.branchNo), "branchNo");
      has("header", "POS001", "POS no");
      has("title", "ใบกำกับภาษีอย่างย่อ", "ชื่อเอกสาร");
      has("doc", String(PV.doc.receiptNo), "เลขที่");
      has("doc", ownerName, "แคชเชียร์");
      has("lines", "ช็อตเพิ่ม", "ตัวเลือก");
      has("lines", "อุ่นร้อน", "note");
      if (!/[−-]\s*10\.00/.test(text.lines ?? "")) p.push("lines ไม่มีส่วนลด −10.00");
      has("totals", baht(PV.totals.grandTotalSatang), "ยอดสุทธิ");
      has("totals", baht(PV.totals.vatBaseSatang), "ฐาน VAT");
      has("totals", baht(PV.totals.vatSatang), "VAT");
      has("payments", "200.00", "รับ");
      has("payments", "100.00", "ทอน");
      has("member", customerName, "ชื่อสมาชิก");
      has("member", "18", "แต้ม");
      has("footer", String(PV.footer.text), "ข้อความท้าย");
      has("footer", "ขอใบกำกับเต็มรูปได้ภายใน 7 วัน", "คำแนะนำใบกำกับเต็มรูป");
    }
    chk("H1", p.length === 0, "8 ส่วนตามลำดับ 11B + เนื้อหาตรงส่วน", p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || "ครบ");
  }
  {
    const p: string[] = [];
    if (!PV) p.push("ไม่มี payload");
    else {
      for (const paper of ["58", "80"]) {
        const h = html(PV, paper, "th");
        if (!new RegExp(`@page[^}]*${paper}\\s*mm`).test(h)) p.push(`@page ${paper}mm`);
        if (h.includes("สำเนา")) p.push(`ต้นฉบับ ${paper} มี "สำเนา"`);
        if (!html(PVc, paper, "th").includes("สำเนา")) p.push(`สำเนา ${paper} ไม่มี "สำเนา"`);
        for (const loc of ["th", "en"]) {
          const pl = loc === "en" ? latin(PV) : PV;
          if (html(pl, paper, loc) !== html(pl, paper, loc) || !html(pl, paper, loc)) p.push(`${loc}/${paper} ไม่คงที่`);
        }
      }
      const e = html(latin(PV), "80", "en");
      if (!e) p.push("en ว่าง");
      else {
        const m = e.match(/[ก-ฺเ-๛]+/);
        if (m) p.push(`en มีอักษรไทย "${m[0].slice(0, 20)}"`);
        if (htmlSections(e).order.join(",") !== SECTIONS.join(",")) p.push(`en ลำดับ ${htmlSections(e).order.join(">")}`);
        const ec = html({ ...latin(PV), copy: true }, "80", "en");
        if (!/copy/i.test(ec) || ec === e) p.push("en สำเนาไม่มีคำ copy");
        if (THAI.test(ec)) p.push("en สำเนามีอักษรไทย");
      }
      if (html(PV, "58", "th") === html(PV, "80", "th")) p.push("58 = 80");
    }
    chk("H2", p.length === 0, "@page · สำเนา · en ไม่มีไทย · คงที่", p.join(" · ") || "ครบ");
  }
  {
    const p: string[] = [];
    if (!PS) p.push("ไม่มี payload RECEIPT");
    else {
      const h = html(PS, "80", "th");
      const { order } = htmlSections(h);
      if (!h) p.push("ว่าง");
      if (h.includes("ใบกำกับภาษี")) p.push("มีคำ \"ใบกำกับภาษี\"");
      if (h.includes("ขอใบกำกับเต็มรูป")) p.push("มีคำแนะนำใบกำกับเต็มรูป");
      for (const s of ["header", "title", "doc", "lines", "totals", "payments", "footer"]) if (!order.includes(s)) p.push(`ไม่มีส่วน ${s}`);
    }
    chk("H3", p.length === 0, "RECEIPT ไม่ใช่ใบกำกับ", p.join(" · ") || "ครบ");
  }

  // ════════ E ESC/POS ════════
  const esc = (pl: Any, o: Any): Any => callSync(renderMod, "encodeEscPos", pl, { cut: true, drawerKick: false, thaiText: "raster", paper: "80", ...o });
  {
    const p: string[] = [];
    if (!PV) p.push("ไม่มี payload");
    else {
      for (const paper of ["58", "80"])
        for (const thaiText of ["raster", "tis620"]) {
          const r1 = esc(PV, { paper, thaiText });
          const b = bytesOf(r1);
          const tag = `${paper}/${thaiText}`;
          if (!b) {
            p.push(`${tag} ไม่ใช่ Uint8Array (${codeOf(r1)})`);
            continue;
          }
          if (!(b[0] === 0x1b && b[1] === 0x40)) p.push(`${tag} ไม่ขึ้นต้น ESC @`);
          if (indexOfSeq(b.slice(-8), [0x1d, 0x56, 0x42, 0x00]) < 0) p.push(`${tag} ท้ายไม่มี cut`);
          if (indexOfSeq(b, [0x1b, 0x61]) < 0) p.push(`${tag} ไม่มี ESC a`);
          if (indexOfSeq(b, [0x1b, 0x45, 0x01]) < 0) p.push(`${tag} ไม่มี ESC E 1`);
          if (indexOfSeq(b, [0x1d, 0x21, 0x11]) < 0) p.push(`${tag} ไม่มี GS ! 0x11`);
          if (!sameBytes(b, bytesOf(esc(PV, { paper, thaiText })))) p.push(`${tag} ไม่คงที่`);
          const s2 = slotsOf(esc(PV, { paper, thaiText }));
          if (JSON.stringify(s2) !== JSON.stringify(slotsOf(r1))) p.push(`${tag} rasterSlots ไม่คงที่`);
        }
      const nc = bytesOf(esc(PV, { cut: false }));
      if (!nc || indexOfSeq(nc, [0x1d, 0x56]) >= 0) p.push("cut:false ยังมี GS V");
    }
    chk("E1", p.length === 0, "ESC @ · cut ท้าย · ESC a/E/GS ! · คงที่ ×4", p.slice(0, 8).join(" · ") || "ครบ");
  }
  {
    const p: string[] = [];
    if (!PV) p.push("ไม่มี payload");
    else {
      const DR = [0x1b, 0x70, 0x00, 0x19, 0xfa];
      const on = bytesOf(esc(PV, { drawerKick: true }));
      const off = bytesOf(esc(PV, { drawerKick: false }));
      const ppOnly = { ...JSON.parse(JSON.stringify(PV)), payments: [{ type: "PROMPTPAY", amountSatang: PV.totals.grandTotalSatang + PV.totals.tipSatang }] };
      const noCash = bytesOf(esc(ppOnly, { drawerKick: true }));
      if (!on || countSeq(on, DR) !== 1) p.push(`drawerKick+CASH พัลส์ ${on ? countSeq(on, DR) : "ไม่มีไบต์"}`);
      if (!off || indexOfSeq(off, [0x1b, 0x70]) >= 0) p.push("drawerKick:false มี ESC p");
      if (!noCash || indexOfSeq(noCash, [0x1b, 0x70]) >= 0) p.push("ไม่มี CASH แต่มี ESC p");
    }
    chk("E2", p.length === 0, "พัลส์ 1B 70 00 19 FA เฉพาะ drawerKick+CASH", p.join(" · ") || "ครบ");
  }
  {
    const p: string[] = [];
    if (!PV) p.push("ไม่มี payload");
    else {
      const amt = baht(PV.totals.vatBaseSatang);
      const widths: number[] = [];
      for (const [paper, cols] of [["58", 32], ["80", 48]] as [string, number][]) {
        const b = bytesOf(esc(PV, { paper, thaiText: "tis620" }));
        if (!b) {
          p.push(`${paper} ไม่มีไบต์`);
          continue;
        }
        const lines = escTextLines(b);
        const base = lines.filter((l) => latin1(l).includes(amt) && !latin1(l).includes(baht(PV.totals.grandTotalSatang)));
        const exact = base.find((l) => colWidth(l) === cols && latin1(l).trimEnd().endsWith(amt));
        if (!exact) p.push(`${paper}: บรรทัดฐาน VAT (${amt}) กว้าง ${base.map(colWidth).join("/") || "ไม่พบ"} ไม่ใช่ ${cols} ชิดขวา`);
        const over = lines.filter((l) => colWidth(l) > cols);
        if (over.length) p.push(`${paper}: ${over.length} บรรทัดเกิน ${cols} (${colWidth(over[0]!)})`);
        widths.push(exact ? colWidth(exact) : -1);
      }
      if (widths[0] === widths[1]) p.push("58 กับ 80 กว้างเท่ากัน");
    }
    chk("E3", p.length === 0, "ฐาน VAT 32/48 คอลัมน์ · ไม่มีบรรทัดเกิน", p.join(" · ") || "ครบ");
  }
  let tisThaiLines = -1;
  {
    const p: string[] = [];
    if (!PV) p.push("ไม่มี payload");
    else {
      const r = esc(PV, { thaiText: "tis620" });
      const b = bytesOf(r);
      if (!b) p.push(`ไม่มีไบต์ ${codeOf(r)}`);
      else {
        if (indexOfSeq(b, [0x1b, 0x74, 0xff]) < 0) p.push("ไม่มี ESC t 255");
        const PVt = { ...JSON.parse(JSON.stringify(PV)), footer: { ...PV.footer, text: "ขอบคุณที่อุดหนุนค่ะ" } };
        const bt = bytesOf(esc(PVt, { thaiText: "tis620" }));
        if (!bt || indexOfSeq(bt, [0xa2, 0xcd, 0xba, 0xa4, 0xd8, 0xb3]) < 0) p.push("ไม่พบ \"ขอบคุณ\" แบบ TIS-620");
        if (indexOfSeq(b, [0xe0, 0xb8]) >= 0 || indexOfSeq(b, [0xe0, 0xb9]) >= 0) p.push("มี UTF-8 ไทย");
        const sam = tis("สำเนา");
        if (indexOfSeq(b, sam) >= 0) p.push("ต้นฉบับมี \"สำเนา\"");
        const bc = bytesOf(esc(PVc, { thaiText: "tis620" }));
        if (!bc || indexOfSeq(bc, sam) < 0) p.push("สำเนาไม่มี \"สำเนา\" (CA D3 E0 B9 D2)");
        if (slotsOf(r).length) p.push(`rasterSlots ${slotsOf(r).length} ช่องในโหมด tis620`);
        tisThaiLines = escTextLines(b).filter(hasTisThai).length;
      }
    }
    chk("E4", p.length === 0, "TIS-620 ขอบคุณ · ESC t 255 · ไม่มี UTF-8 · สำเนา", p.join(" · ") || "ครบ");
  }
  {
    const p: string[] = [];
    if (!PV) p.push("ไม่มี payload");
    else {
      const r = esc(PV, { thaiText: "raster" });
      const b = bytesOf(r);
      const slots = slotsOf(r);
      if (!b) p.push(`ไม่มีไบต์ ${codeOf(r)}`);
      else {
        if (!Array.isArray(r?.rasterSlots)) p.push("ไม่คืน rasterSlots");
        if (slots.length === 0) p.push("ไม่มีช่อง raster");
        if (slots.length !== tisThaiLines) p.push(`ช่อง ${slots.length} ≠ บรรทัดไทย ${tisThaiLines}`);
        const gsv = countSeq(b, [0x1d, 0x76, 0x30]);
        if (gsv !== slots.length) p.push(`GS v 0 ${gsv} ครั้ง ≠ ช่อง ${slots.length}`);
        const badOff = slots.filter((s: Any) => !(Number.isInteger(s?.offset) && b[s.offset] === 0x1d && b[s.offset + 1] === 0x76 && b[s.offset + 2] === 0x30));
        if (badOff.length) p.push(`${badOff.length} ช่อง offset ไม่ชี้ GS v 0`);
        const noThai = slots.filter((s: Any) => !THAI.test(String(s?.text ?? "")));
        if (noThai.length) p.push(`${noThai.length} ช่องไม่มีอักษรไทย`);
        const all = slots.map((s: Any) => String(s?.text ?? "")).join("\n");
        for (const [lbl, needle] of [["ชื่อร้าน", PV.shop.name], ["ชื่อเอกสาร", "ใบกำกับภาษีอย่างย่อ"], ["footer", PV.footer.text]] as [string, string][]) if (!all.includes(needle)) p.push(`ไม่มีช่องของ${lbl}`);
        const outside = escTextLines(b).filter(hasTisThai).length;
        if (outside) p.push(`${outside} บรรทัดมีไบต์ไทย TIS นอกช่อง`);
        if (indexOfSeq(b, [0xe0, 0xb8]) >= 0 || indexOfSeq(b, [0xe0, 0xb9]) >= 0) p.push("มี UTF-8 ไทย");
      }
    }
    chk("E5", p.length === 0, "ช่อง raster = บรรทัดไทย · GS v 0 ต่อช่อง · offset · ครอบหัว/ชื่อเอกสาร/ท้าย", p.join(" · ") || "ครบ");
  }

  // ════════ D1 ปฏิเสธเป็นข้อมูล ════════
  {
    const p: string[] = [];
    const want = ["DEVICE_REVOKED", "DEVICE_LIMIT", "DEVICE_NOT_FOUND", "SALE_NOT_FOUND", "VALIDATION"];
    const seen = new Set(dataRefusals.map(([, r]) => String(r.code)));
    for (const c of want) if (!seen.has(c)) p.push(`ไม่พบ ${c}`);
    if (!PERM.some((c) => seen.has(c))) p.push("ไม่พบรหัสสิทธิ์");
    for (const [lbl, r] of dataRefusals) {
      if (r.threw) p.push(`${lbl}: throw (${r.code})`);
      else if (typeof r.message !== "string" || !r.message.trim()) p.push(`${lbl}: ไม่มี message`);
      else if (!THAI.test(r.message) && !lbl.startsWith("printer") && !lbl.startsWith("receipt ")) p.push(`${lbl}: message ไม่ใช่ไทย`);
    }
    chk("D1", p.length === 0, `${dataRefusals.length} คำปฏิเสธเป็นข้อมูล ครบ 6 รหัส`, p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || "ครบ");
  }
}

// ═════════════════════════ 7. คืนสภาพ ═════════════════════════
async function del(model: string, where: Any): Promise<number> {
  const d = P[model];
  if (typeof d?.deleteMany !== "function") return 0;
  try {
    return (await d.deleteMany({ where })).count as number;
  } catch (e) {
    console.log(`  (ลบ ${model} ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
    return -1;
  }
}
async function cleanup() {
  const counts: Record<string, number> = {};
  if (tenantLimitsOrig) {
    try {
      await P.$executeRawUnsafe(`UPDATE "Tenant" SET limits = $1::jsonb, "updatedAt" = $2 WHERE id = $3`, JSON.stringify(tenantLimitsOrig.limits ?? {}), tenantLimitsOrig.updatedAt, PQC.coffee.tenantId);
    } catch (e) {
      console.log(`  💥 คืน Tenant.limits ไม่ได้: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  const units = [...sb.unitIds, ...sb.restoUnitIds];
  const systems = sb.systemIds;
  if (!units.length && !systems.length) return;
  if (systems.length) {
    try {
      const extra = ((await P.posProduct.findMany({ where: { tenantId: { in: TIDS }, systemId: { in: systems } }, select: { id: true } })) as Any[]).map((r) => r.id);
      sb.productIds = [...new Set([...sb.productIds, ...extra])];
    } catch {
      /* ใช้รายการที่จำไว้ */
    }
  }
  const unitOr = [...(units.length ? [{ unitId: { in: units } }] : []), ...(systems.length ? [{ systemId: { in: systems } }] : [])];
  const sales = ((await P.posSale.findMany({ where: { tenantId: { in: TIDS }, OR: unitOr }, select: { id: true } }).catch(() => [])) as Any[]).map((s) => s.id);
  const shifts = ((await P.posShift?.findMany?.({ where: { tenantId: { in: TIDS }, unitId: { in: units } }, select: { id: true } }).catch(() => [])) ?? []) as Any[];
  const shiftIds = shifts.map((s) => s.id);
  const devIds = PD ? ((await PD.findMany({ where: { tenantId: { in: TIDS }, unitId: { in: units } }, select: { id: true } }).catch(() => [])) as Any[]).map((r) => r.id) : [];
  const groups = ((await P.menuOptionGroup.findMany({ where: { tenantId: { in: TIDS }, unitId: { in: units } }, select: { id: true } }).catch(() => [])) as Any[]).map((g) => g.id);
  const evWhere = {
    tenantId: { in: TIDS },
    OR: [...unitOr, ...shiftIds.map((id) => ({ idempotencyKey: { contains: id } })), ...(sales.length ? [{ idempotencyKey: { in: sales.flatMap((s) => [`PosSale#${s}#PAID`, `PosSale#${s}#VOIDED`]) } }] : [])],
  };
  for (let i = 0; i < 20; i++) {
    const pend = await P.outboxEvent.count({ where: { ...evWhere, status: "PENDING" } }).catch(() => 0);
    if (pend === 0) break;
    await sleep(500);
  }
  counts.outbox = await del("outboxEvent", evWhere);
  counts.audit = await del("auditLog", {
    tenantId: { in: TIDS },
    createdAt: { gte: runStart },
    OR: [...(units.length ? [{ unitId: { in: units } }] : []), { targetId: { in: [...shiftIds, ...sb.productIds, ...systems, ...units, ...sales, ...devIds, ...groups, ...sb.customerIds] } }],
  });
  if (units.length) counts.held = await del("posHeldCart", { tenantId: { in: TIDS }, unitId: { in: units } });
  if (units.length) await del("posCashMovement", { tenantId: { in: TIDS }, unitId: { in: units } });
  if (sales.length) {
    await del("couponRedemption", { tenantId: { in: TIDS }, refType: "PosSale", refId: { in: sales } });
    await del("pointLedger", { tenantId: { in: TIDS }, refType: "PosSale", refId: { in: sales } });
    await del("posSaleLineOption", { saleId: { in: sales } });
    counts.payment = await del("posPayment", { saleId: { in: sales } });
    counts.line = await del("posSaleLine", { saleId: { in: sales } });
    counts.sale = await del("posSale", { id: { in: sales } });
  }
  if (units.length) {
    counts.shift = await del("posShift", { tenantId: { in: TIDS }, unitId: { in: units } });
    await del("posShiftCounter", { tenantId: { in: TIDS }, unitId: { in: units } });
    counts.device = await del("posDevice", { tenantId: { in: TIDS }, unitId: { in: units } });
  }
  if (sb.productIds.length) for (const m of ["posProductOptionGroup", "posVariant", "recipeLine", "posProductChannelPrice", "posProductAvailability", "posProductUnit"]) await del(m, { productId: { in: sb.productIds } });
  if (groups.length) {
    await del("menuItemOptionGroup", { groupId: { in: groups } });
    await del("menuOptionChoice", { groupId: { in: groups } });
    await del("menuOptionGroup", { id: { in: groups } });
  }
  counts.product = sb.productIds.length ? await del("posProduct", { id: { in: sb.productIds } }) : 0;
  if (systems.length) {
    await del("posProduct", { tenantId: { in: TIDS }, systemId: { in: systems } });
    await del("posCategory", { tenantId: { in: TIDS }, systemId: { in: systems } });
  }
  if (sb.customerIds.length) await del("customer", { id: { in: sb.customerIds } });
  if (sb.memSysIds.length) await del("memberTierDef", { tenantId: { in: TIDS }, systemId: { in: sb.memSysIds } });
  if (sb.posLinkedIds.length) await del("accountSystemLink", { tenantId: { in: TIDS }, linkedKind: "POS", linkedId: { in: sb.posLinkedIds } });
  if (sb.accSystemIds.length) await del("accountSettings", { tenantId: { in: TIDS }, systemId: { in: sb.accSystemIds } });
  if (units.length) await del("posReceiptCounter", { tenantId: { in: TIDS }, unitId: { in: units } });
  if (units.length) await del("appSystemUnit", { unitId: { in: units } });
  if (systems.length) {
    await del("appSystemUnit", { systemId: { in: systems } });
    await del("appSystem", { id: { in: systems } });
  }
  if (units.length) await del("businessUnit", { id: { in: units } });
  console.log(`  ลบแล้ว: ${JSON.stringify(counts)} · บิล ${sales.length} · กะ ${shiftIds.length} · เครื่อง ${devIds.length} · สาขา ${units.length} · ระบบ ${systems.length}`);
}

// ═════════════════════════ 8. รัน ═════════════════════════
let crashed = "";
try {
  await runStatic();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  try {
    await cleanup();
  } catch (e) {
    console.log(`💥 cleanup: ${(e as Error).message.slice(0, 200)}`);
  }
}
const countsAfter = await snapshotCounts();
const drift = Object.keys(countsBefore).filter((k) => countsBefore[k] !== countsAfter[k]).map((k) => `${k}:${countsBefore[k]}→${countsAfter[k]}`);
chk("Z1", drift.length === 0, "ก่อน = หลัง", drift.length ? drift.join(", ") : "เท่ากันทุกตาราง");
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
chk("Z2", fpDrift.length === 0 && !Object.values(fpBefore).some((v) => v.startsWith("err")), "ลายนิ้วมือเท่าเดิม", fpDrift.length ? fpDrift.join(", ") : `เท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`);
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, missing: skipReasons, a5: { drift } })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P1.10: WebUSB/BT · พรีวิว · พิมพ์อัตโนมัติ · ชิปเครื่องพิมพ์ · หน้า 17A/17B/เครื่อง (P1.10U) · e-receipt /r/[token] (P1.11) ·
// ใบครัว (P2) · print agent (P3) · เลขใบเสร็จต่อเครื่อง/e-Tax (P3.4) · ใบกำกับเต็มรูป (P1.13) · ใบลดหนี้ (P1.8/P1.16 — payload REFUND ไม่ถูกสอบที่นี่)
