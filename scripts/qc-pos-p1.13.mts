// QC — POS RUN ใบ P1.13: ใบกำกับภาษีเต็มรูปจากจอชำระ · ออกทีหลัง / จากคำขอ P1.11 · ค้นนิติบุคคล DBD (ปิดสุภาพ) · จำผู้ซื้อของสมาชิก
//   เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ
// requires: pos-seed
//
// สัญญา: ledger/pos-briefs/pos-brief-P1.13.md §2 R1–R9 · §3 migration · §4 แผนข้อสอบ · §5 CD1–CD6 · pos-brief-COMMON · pos-brief-LANE-RULES
//        ต่อยอด: qc-pos-p1.11 (ร้านชั่วคราว · คำขอใบกำกับ · ใบเสร็จออนไลน์) · qc-pos-p1.8 (ใบลดหนี้ · เงิน/GL) · qc-pos-p1.7 (deps ฉีด)
//        โน้ต: ledger/wo-notes/pos-P1.13-oracle.md (ตารางชื่อ · ความคลาดเคลื่อน · CONTROLLER-DECISION · ผลแดงที่คาด)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้และลงทะเบียนในตารางชื่อของโน้ต — ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P1.13 ต้องส่ง (ย่อ):
//   schema: PosSale.taxInvoice Json? · PosSale.taxInvoiceDocId String? · (มติ 8: เอกสารที่ออกอยู่ที่ PosTaxInvoiceRequest.accountDocId เดิม — ไม่มี issuedDocId) ·
//     model PosBuyerProfile (customerId @unique · @@index([tenantId, taxId])) · AccountDocument.supersededByDocId String? (migration เพิ่มอย่างเดียว)
//   src/lib/modules/pos/tax-invoice-shared.ts (บริสุทธิ์ ไม่แตะ prisma): parseTaxInvoiceBuyer(input) · taxInvoiceRefusalKey(code)
//   src/lib/modules/pos/tax-invoice.ts: issueFullTaxInvoice(ctx, actor, {saleId, buyer, requestId?, rememberBuyer?}) ·
//     issueFromTaxInvoiceRequest(ctx, actor, {requestId, rememberBuyer?}) · rejectTaxInvoiceRequest(ctx, actor, {requestId, reason}) ·
//     lookupBuyerByTaxId(ctx, actor, {taxId}, opts?: {deps?: {lookup?}}) · buyerProfileForMember(ctx, {memberId})
//   src/lib/modules/pos/tax-invoice-actions.ts ("use server"): *Action ของทั้ง 5 ฟังก์ชัน
//   register.ts submitRegisterSale input += taxInvoice?, rememberBuyer? · consumer pos.sale.paid ส่ง buyer → applyExternalSale({…, buyer})
//   account/index.ts: applyExternalSale({…, buyer?}) · convertAbbToTaxInvoice(…) · re-export lookupJuristic · findExternalSaleDoc เลือก TAX_INVOICE ก่อน
//   outbox: "pos.sale.taxInvoiceIssued" {saleId, docId} (consumer ว่าง ห่อ withAutomation + ป้าย automation/labels.ts)
//   receiptPayload.kind "TAX_INVOICE_FULL" + doc.fullTaxInvoiceNo · BillDetail.taxInvoice {status, docNo?, buyerName?} · messages taxInvoice.errors.*
//
// ขอบเขต: ST สถิต · B ตัวแกะผู้ซื้อ · S ตอนชำระ · L ออกทีหลัง · Q จากคำขอ · D ค้น DBD · M จำผู้ซื้อ · P ตัวอ่าน · R คืนเงินหลังใบเต็มรูป ·
//   E ปฏิเสธเป็นข้อมูล · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p1.11): SKIP เมื่อของ P1.13 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต ST1–ST4 + ตัวแกะบริสุทธิ์ B1–B4 (ไม่โหลด prisma · exit 1 ถ้าแดง)
//    ฐาน = QC4 เท่านั้น (host ep-frosty-lab ก่อนเขียนแถวแรก) · ร้านชั่วคราว `posqc-p113-<rand>` (ลบทั้งร้านใน finally · นับแถวค้างทุกตาราง = 0)
//    🔴 ไม่มีเครือข่ายเลย: globalThis.fetch = ตัวกั้น (503 + นับ) ตลอดช่วง DB · DBD ผ่าน deps.lookup ปลอมเท่านั้น (ไม่ยิงกรมพัฒน์ฯ จริง)
//    🔴 เวลา: 7 วัน ทดสอบด้วยการย้าย paidAt/createdAt ผ่าน prisma (นับจากนาฬิกาตอนรัน) — ไม่มี sleep ยาว · ไม่ฮาร์ดโค้ดวันที่
//    โมดูล/โมเดล/คอลัมน์ที่ยังไม่มีเข้าถึงแบบไดนามิก (`import(… as string)` + catch · SQL ดิบเมื่อคอลัมน์มีจริง) — next build ตรวจชนิด scripts/*.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p1.13";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · P บริสุทธิ์ · X1 idempotency/เล่นซ้ำ · X2 ข้ามขอบเขต · X3 สิทธิ์ · X4 เงิน · X5 ผลข้างเคียงครบทุกทาง · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P1.13-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "S", "[R1 R3 R6 §3 CD5] schema + migration เพิ่มอย่างเดียว: PosSale.taxInvoice Json? · PosSale.taxInvoiceDocId String? · model PosBuyerProfile (id tenantId customerId @unique kind name taxId branchCode address email? updatedAt · @@index([tenantId, taxId])) · AccountDocument.supersededByDocId String? · SQL มีแต่ CREATE / ALTER TABLE … ADD"),
  D("ST2", "S", "[R2 R3 R6 R9 §3 COMMON-4] ลงทะเบียนครบ: scope.ts PosBuyerProfile · pos-qc-env POS_MODELS posBuyerProfile · outbox-consumers \"pos.sale.taxInvoiceIssued\" ห่อ withAutomation · automation/labels.ts ป้าย · permissions.ts \"pos.taxinvoice.issue\" · messages th+en taxInvoice.errors.* ทุกรหัส (th เป็นไทย) · taxInvoiceRefusalKey ใน tax-invoice-shared.ts · POS-OWNER-PENDING.md บันทึก supersededByDocId"),
  D("ST3", "S", "[hard rule F2.2 CD3 CD4 R6] ขอบเขต: ไฟล์ใน modules/pos import บัญชีผ่าน \"@/lib/modules/account\" เท่านั้น (ไม่มี account/<ไฟล์ใน> ทั้ง static/dynamic) · account/index.ts export convertAbbToTaxInvoice + lookupJuristic · applyExternalSale รับ buyer? · ไฟล์ tax-invoice* ไม่เขียน accountDocument/customer ตรง · ไม่อ่าน DBD_API_KEY · ไม่เรียก fetch · tax-invoice-shared.ts ไม่ import prisma/db"),
  D("ST4", "S", "[hard rule] ทุกไฟล์ \"use server\" ใน modules/pos export async function ล้วน · tax-invoice-actions.ts มี issueFullTaxInvoiceAction issueFromTaxInvoiceRequestAction rejectTaxInvoiceRequestAction lookupBuyerByTaxIdAction buyerProfileForMemberAction (แต่ละตัวเรียกฟังก์ชันบริการของตัวเอง + catch) + requireTenant"),
  // ── B ตัวแกะผู้ซื้อ (บริสุทธิ์) ──
  D("B1", "P", "[R1] parseTaxInvoiceBuyer รับ JURISTIC/PERSON ที่ถูก → {ok:true, buyer} ตัดช่องว่างทุกช่อง · branchCode ปริยาย \"00000\" · email ปริยาย null · source ปริยาย \"MANUAL\" · source DBD/PROFILE เก็บตามที่ส่ง · ไม่มีคีย์อื่นเกิน (kind name taxId branchCode address email source)"),
  D("B2", "P", "[R1] เลขผู้เสียภาษี mod-11 (กรมสรรพากร): เลขถูก 4 แบบผ่าน · หลักตรวจผิด / 1111111111111 / 12 หลัก / 14 หลัก / มีตัวอักษร / ว่าง → {ok:false, code TAX_ID_INVALID} · [ตัวควบคุม] ตัวตรวจของข้อสอบเองจับเลขผิดได้"),
  D("B3", "P", "[R1] สาขา + ชนิด: branchCode \"00001\" เก็บตรง · \"123\" / \"0000a\" / \"000000\" → VALIDATION · kind \"COMPANY\" / \"juristic\" / ไม่ส่ง → VALIDATION · source \"X\" → VALIDATION"),
  D("B4", "P", "[R1 R9] ขอบความยาว/รูปร่าง: name 120 ผ่าน 121 VALIDATION · address 300/301 · email 120 ผ่าน 121 / ผิดรูป → VALIDATION · name ช่องว่างล้วน · ไม่มี address · คีย์แปลก (saleId) · null/สตริง/อาร์เรย์ → VALIDATION ไม่ throw · taxInvoiceRefusalKey(\"TOO_LATE\") = \"taxInvoice.errors.tooLate\" · รหัสแปลก → \"taxInvoice.errors.unknown\""),
  // ── S ตอนชำระ ──
  D("S1", "X5", "[R1 R2] submitRegisterSale + taxInvoice → PosSale.taxInvoice = ผู้ซื้อที่แกะแล้ว + requestedAt ISO (ช่วงที่รัน) · (POS ไม่ผูกสมุด → S5) · ผู้ซื้อหลักตรวจผิด → TAX_ID_INVALID / ไม่มีชื่อ → VALIDATION ก่อนเขียนอะไร (ไม่มีบิลของคีย์นั้น · ไม่มี outbox)"),
  D("S2", "X5", "[R2 CD1 CD4] consumer pos.sale.paid → เอกสาร TAX_INVOICE 1 ใบ (ไม่มี ABB) refType PosSale refId บิล · เลขชุด TX · grandTotal/vatAmount = บิล · issueDate = paidAt · ผู้ติดต่อมี taxId/branchCode/address ของผู้ซื้อ · PosSale.taxInvoiceDocId = เอกสาร · บิลที่สองเลขเดียวกันชื่อต่าง → ผู้ติดต่อเดิม (taxId ชนะชื่อ) · ORACLE-EDIT มติ F4: contactSnapshot = ผู้ซื้อตามที่พิมพ์ (บิลที่สอง = ชื่อที่พิมพ์ · contactId เดิม)"),
  D("S3", "X4", "[R2 CD6] GL ของบิลที่มีผู้ซื้อ = บิลเดียวกันไม่มีผู้ซื้อ ทุกรหัสบัญชี (Σ Dr−Cr ต่อรหัส · จำนวน JV · สมดุล) · ไม่มี JV ของตัวเอกสาร TAX_INVOICE"),
  D("S4", "X1", "[R2 COMMON-4] outbox pos.sale.taxInvoiceIssued 1 แถว {saleId, docId} DONE · เล่น consumers[pos.sale.paid] ซ้ำ 2 รอบ → ยังเอกสาร 1 · event 1 · JV เท่าเดิม · taxInvoiceDocId เดิม · consumers[pos.sale.taxInvoiceIssued] ×2 ไม่ throw · POS ไม่ผูกสมุด: taxInvoiceDocId null · ไม่มีเอกสาร · ไม่มี event"),
  D("S5", "-", "[follow-up 3 · ORACLE-EDIT] ตอนชำระ: ผู้ซื้อ + บิลที่จะไม่ได้ใบกำกับ (POS ไม่ผูกสมุด) → NOT_ELIGIBLE ข้อความไทย ก่อนเขียนอะไร (ไม่มีบิลของคีย์ · ไม่มี outbox/เอกสาร/event)"),
  // ── L ออกทีหลัง ──
  D("L1", "X5", "[R3 CD1 CD2] issueFullTaxInvoice บิล ABB (paidAt 2 วันก่อน) → {ok:true, docId, docNo} · ABB CANCELLED + supersededByDocId = ใบใหม่ · TAX_INVOICE sourceDocId = ABB · refType/refId บิล · ยอด/VAT/ฐาน/บรรทัด = ABB · issueDate = ABB.issueDate · เลขชุด TX ≠ เลข ABB · เอกสารมีผล 1 ใบต่อบิล · GL เท่าเดิมทุกรหัส · snapshot + taxInvoiceDocId · audit pos.taxinvoice.issued 1"),
  D("L2", "X1", "[R3] ยิงซ้ำ saleId+ผู้ซื้อเดิม → ok docId เดิม (เอกสาร/audit ไม่เพิ่ม · ABB ไม่เปลี่ยน) · ผู้ซื้อคนอื่น → ALREADY_ISSUED และ snapshot/เอกสารไม่เปลี่ยน"),
  D("L3", "-", "[R3] paidAt 8 วันก่อน → TOO_LATE (ไม่มี snapshot/เอกสาร · ABB ยังมีผล) · paidAt 6 วันก่อน → ออกได้ (ตัวควบคุมบวก)"),
  D("L4", "-", "[R1 R3] ALREADY_ISSUED: บิลที่ออกเต็มรูปตอนชำระ (ผู้ซื้อคนอื่น) · SALE_VOIDED: บิลที่ voidSale แล้ว — ไม่มีเอกสาร/สถานะเปลี่ยน"),
  D("L5", "X3", "[R3] NOT_ELIGIBLE บิล POS ไม่ผูกสมุด · ACCOUNT_PENDING บิลผูกสมุดที่ยังไม่มี ABB (ไม่เขียนอะไร) · PERMISSION_DENIED พนักงานมีแค่ pos.sale.read · ผ่านด่านสิทธิ์ (ได้ ACCOUNT_PENDING): พนักงาน pos.sale.read+pos.taxinvoice.issue · MANAGER ปริยาย · SALE_NOT_FOUND id มั่ว · TAX_ID_INVALID"),
  D("L6", "-", "[R3 มติ 15 · ORACLE-EDIT] คืนเงินบางส่วนแล้วออกเต็มรูป → HAS_REFUNDS (ไม่มี snapshot/docId · ไม่มี TAX_INVOICE · ABB ยังมีผล · ไม่มี audit pos.taxinvoice.issued)"),
  // ── Q จากคำขอ P1.11 ──
  D("Q1", "X5", "[R4 R3] issueFromTaxInvoiceRequest(คำขอ REQUESTED) → ok docId · คำขอ ISSUED + accountDocId = docId (มติ 8) · ผู้ซื้อจากแถวคำขอ (ชื่อ/เลข/สาขา/ที่อยู่/อีเมล · kind JURISTIC เมื่อเลขขึ้นต้น 0) · ABB superseded · audit pos.taxinvoice.issued"),
  D("Q2", "X5", "[R4] rejectTaxInvoiceRequest → ok · REJECTED · audit pos.taxinvoice.rejected (มีเหตุผล) · ไม่มีเอกสารใหม่ · ABB ยังมีผล · เหตุผลว่าง → VALIDATION"),
  D("Q3", "X2", "[R4] คำขอของสาขา A เรียกด้วย ctx สาขา A2 (ระบบ POS เดียวกัน) → NOT_FOUND ทั้ง issue/reject · requestId มั่ว → NOT_FOUND · คำขอยัง REQUESTED · ไม่มีเอกสาร"),
  // ── D ค้น DBD ──
  D("D1", "X5", "[R5 CD3] lookupBuyerByTaxId + deps.lookup ปลอม: พบ → {ok:true, found:true, buyer:{kind JURISTIC, name, taxId, branchCode \"00000\", address (มีบรรทัด/จังหวัด/รหัสไปรษณีย์), status}} · stub ถูกเรียกด้วยเลข 13 หลักครั้งเดียว · ไม่พบ → {ok:true, found:false} · ล่ม/throw → DBD_UNAVAILABLE · audit pos.taxinvoice.dbd_lookup ทุกครั้ง ปิดเลข xxxxxxxxx1234 ไม่มีเลขดิบ"),
  D("D2", "-", "[R5 CD3] ไม่มีกุญแจ (ไม่ฉีด deps · DBD_API_KEY ว่าง) → DBD_NOT_CONFIGURED ไม่แตะเครือข่าย · stub ตอบ noKey → DBD_NOT_CONFIGURED · เลขหลักตรวจผิด → TAX_ID_INVALID (stub ไม่ถูกเรียก)"),
  D("D3", "X2", "[R5] เพดาน 30 ครั้ง/นาที/สาขา: สาขา A2 ครั้งที่ 1–30 ผ่าน · ครั้งที่ 31 → RATE_LIMITED (stub ไม่ถูกเรียก) · สาขา A ยังผ่าน (ตัวควบคุม: ต่อสาขา) · ย้าย audit ไป 2 นาทีก่อน → A2 ผ่านอีก"),
  // ── M จำผู้ซื้อ ──
  D("M1", "X5", "[R6] rememberBuyer + สมาชิก → PosBuyerProfile 1 แถวต่อสมาชิก (ตอนชำระ) · ออกทีหลังด้วยผู้ซื้อใหม่ → upsert แถวเดิม (id เดิม · ค่าใหม่) · บิลไม่มีสมาชิก → ไม่มีแถว · แถว Customer ไม่ถูกแตะ (ไม่มีเลขผู้ซื้อ · ชื่อ/เบอร์เดิม)"),
  D("M2", "X2", "[R6] buyerProfileForMember(ctx, {memberId}) → {ok:true, profile ตรงแถว} · สมาชิกไม่มีโปรไฟล์ → profile null · สมาชิกร้านอื่น → ไม่รั่ว (profile null หรือ NOT_FOUND)"),
  // ── P ตัวอ่าน ──
  D("P1", "-", "[R7] publicReceipt actions.taxInvoice ISSUED เมื่อมี taxInvoiceDocId (ตอนชำระ · ออกทีหลัง · จากคำขอ) · ABB ล้วน AVAILABLE · billDetail.taxInvoice {ISSUED, docNo, buyerName} / {REQUESTED} / {NONE} · billDetail.accounting.docId = TAX_INVOICE"),
  D("P2", "-", "[R7] receiptPayload.kind \"TAX_INVOICE_FULL\" + doc.fullTaxInvoiceNo = เลขใบกำกับ + footer.fullTaxInvoiceHint false · renderReceiptHtml (th · 80) มี \"ออกใบกำกับภาษีเต็มรูปแล้ว เลขที่ <เลข>\" ไม่มีหัว \"ใบกำกับภาษีอย่างย่อ\" · ตัวควบคุม: บิล ABB ล้วนยังเป็น ABB"),
  // ── R คืนเงิน ──
  D("R1", "X4", "[R8] refundSale หลังใบเต็มรูป (ออกทีหลัง · ตอนชำระ) → ใบลดหนี้ sourceDocId = TAX_INVOICE + ผู้ติดต่อเดียวกัน · posSaleAccountingRef → TAX_INVOICE · ตัวควบคุม: บิล ABB ล้วน → ใบลดหนี้อ้าง ABB"),
  // ── E ปฏิเสธเป็นข้อมูล ──
  D("E1", "-", "[R9 ทุกข้อ] คำปฏิเสธที่เก็บได้ครบ 13 รหัส (VALIDATION TAX_ID_INVALID TOO_LATE SALE_VOIDED ALREADY_ISSUED NOT_ELIGIBLE ACCOUNT_PENDING PERMISSION_DENIED SALE_NOT_FOUND NOT_FOUND DBD_NOT_CONFIGURED DBD_UNAVAILABLE RATE_LIMITED) · ทุกตัว {ok:false, code, message ไทย} ไม่ throw"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราวเหลือ 0 แถวทุกตารางที่มี tenantId + แถว Tenant ถูกลบ · ร้าน QC ของ seed ไม่มีแถวของรอบนี้ (บิล/เครื่อง/ผู้ติดต่อ/โปรไฟล์/audit/outbox ที่มีรหัสรอบ) — นับก่อน/หลังพิมพ์เป็นข้อมูล (lane อื่นเขียนร้าน seed พร้อมกันได้)"),
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
  const full = id.startsWith("P1.13-") ? id : `P1.13-${id}`;
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
const MISSING = "ยังไม่มีโมดูล/โมเดล";
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
const THAI = /[ก-๛]/;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const isRecord = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);
/** VAT รวมในราคา — สูตรเดียวกับ src/lib/money/vat.ts splitIncludedVat (ข้อสอบเขียนเอง ไม่ import) */
const vatOf = (g: number, bp: number) => {
  const den = 10_000 + bp;
  return g - Math.floor((2 * g * 10_000 + den) / (2 * den));
};
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

// ── ตัวตรวจของข้อสอบเอง (ใช้ทั้งข้อจริงและตัวควบคุม) ──
/** เลขผู้เสียภาษีไทย 13 หลัก mod-11 (กรมสรรพากร) — ข้อสอบเขียนเอง */
const thaiTaxIdOk = (id: unknown): boolean => {
  if (typeof id !== "string" || !/^\d{13}$/.test(id)) return false;
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(id[i]) * (13 - i);
  return (11 - (s % 11)) % 10 === Number(id[12]);
};
/** เติมหลักตรวจให้เลข 12 หลัก */
const withCheck = (d12: string): string => {
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(d12[i]) * (13 - i);
  return `${d12}${(11 - (s % 11)) % 10}`;
};
/** หลักตรวจผิด (หลักสุดท้าย +1 mod 10) */
const badCheck = (id: string): string => `${id.slice(0, 12)}${(Number(id[12]) + 1) % 10}`;
/** ปิดเลขแบบที่ R5 กำหนด */
const maskOf = (id: string): string => `xxxxxxxxx${id.slice(-4)}`;
const camel = (code: string) => code.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

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
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(src);
function prismaBlock(src: string, kind: "model" | "enum", name: string): string {
  const m = new RegExp(`\\b${kind}\\s+${name}\\s*\\{`).exec(src);
  if (!m) return "";
  const end = src.indexOf("\n}", m.index);
  return end < 0 ? "" : src.slice(m.index, end + 2);
}
const fieldLine = (block: string, f: string): string => (new RegExp(`^\\s*${f}\\s+[^\\n]*$`, "m").exec(block)?.[0] ?? "").trim();

const POS_DIR = "src/lib/modules/pos";
const F = {
  shared: `${POS_DIR}/tax-invoice-shared.ts`,
  svc: `${POS_DIR}/tax-invoice.ts`,
  act: `${POS_DIR}/tax-invoice-actions.ts`,
  accIndex: "src/lib/modules/account/index.ts",
  accService: "src/lib/modules/account/service.ts",
  consumers: "src/lib/outbox-consumers.ts",
  labels: "src/lib/automation/labels.ts",
  perms: "src/lib/core/permissions.ts",
  scope: "src/lib/core/scope.ts",
  qcEnv: "scripts/pos-qc-env.mts",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
  ownerPending: "ledger/POS-OWNER-PENDING.md",
};
const SVC_FNS = ["issueFullTaxInvoice", "issueFromTaxInvoiceRequest", "rejectTaxInvoiceRequest", "lookupBuyerByTaxId", "buyerProfileForMember"] as const;
const SHARED_FNS = ["parseTaxInvoiceBuyer", "taxInvoiceRefusalKey"] as const;
const ACTIONS: [string, string][] = SVC_FNS.map((f) => [`${f}Action`, f]);
const EV_ISSUED = "pos.sale.taxInvoiceIssued";
const AUDIT_ISSUED = "pos.taxinvoice.issued";
const AUDIT_REJECTED = "pos.taxinvoice.rejected";
const AUDIT_DBD = "pos.taxinvoice.dbd_lookup";
const PERM_ISSUE = "pos.taxinvoice.issue";
const FULL_KIND = "TAX_INVOICE_FULL";
const FULL_TEXT = "ออกใบกำกับภาษีเต็มรูปแล้ว เลขที่";
const ABB_TITLE = "ใบกำกับภาษีอย่างย่อ";
/** รหัสปฏิเสธของใบนี้ — ทุกตัวต้องมีคีย์ข้อความ taxInvoice.errors.<camel> (R9) */
const ALL_CODES = ["VALIDATION", "TAX_ID_INVALID", "TOO_LATE", "SALE_VOIDED", "ALREADY_ISSUED", "NOT_ELIGIBLE", "ACCOUNT_PENDING", "PERMISSION_DENIED", "SALE_NOT_FOUND", "NOT_FOUND", "DBD_NOT_CONFIGURED", "DBD_UNAVAILABLE", "RATE_LIMITED"];
const MSG_CODES = [...ALL_CODES, "INTERNAL"];
const BUYER_KEYS = ["kind", "name", "taxId", "branchCode", "address", "email", "source"];
const PROFILE_COLS = ["id", "tenantId", "customerId", "kind", "name", "taxId", "branchCode", "address", "email", "updatedAt"] as const;

const srcOf = (f: string) => stripComments(rd(f));
const STATIC_IDS = ["ST1", "ST2", "ST3", "ST4"].map((x) => `P1.13-${x}`);
const PURE_IDS = ["B1", "B2", "B3", "B4"].map((x) => `P1.13-${x}`);
const skipReasons: string[] = [];
for (const f of [F.shared, F.svc, F.act]) if (!existsSync(join(ROOT, f))) skipReasons.push(`${f} ยังไม่มี`);
for (const n of SVC_FNS) if (!exportsFn(srcOf(F.svc), n)) skipReasons.push(`ยังไม่มี export ${n} (tax-invoice.ts)`);
for (const n of SHARED_FNS) if (!exportsFn(srcOf(F.shared), n)) skipReasons.push(`ยังไม่มี export ${n} (tax-invoice-shared.ts)`);
if (!exportsFn(srcOf(F.accIndex), "convertAbbToTaxInvoice")) skipReasons.push("ยังไม่มี export convertAbbToTaxInvoice (account/index.ts)");

/** shared ไม่ import prisma/db (ค่า) — เงื่อนไขที่ --no-db โหลดได้โดยไม่แตะ prisma */
const sharedPure = (): boolean => {
  const s = srcOf(F.shared);
  if (!s) return false;
  const valueImports = [...s.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
  const dyn = [...s.matchAll(/import\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1]!);
  return ![...valueImports, ...dyn].some((p) => /@prisma\/client|\/db$|^\.\/db$|@\/lib\/core\/db|^\.\/(tax-invoice|receipt|register|service|bills|refund)$/.test(p));
};

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB) ═════════════════════════
async function runStatic(): Promise<void> {
  console.log("\n── ST ข้อสถิต (ไม่แตะ DB) ──");
  const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
  // ST1 schema + migration
  {
    const p: string[] = [];
    const need = (model: string, field: string, re: RegExp, label: string) => {
      const b = prismaBlock(schemaSrc, "model", model);
      if (!b) return p.push(`ไม่มี model ${model}`);
      const l = fieldLine(b, field);
      if (!l) p.push(`${model} ไม่มี ${field}`);
      else if (!re.test(l)) p.push(`${model}.${field} ไม่ใช่ ${label} (${l.slice(0, 60)})`);
      return 0;
    };
    need("PosSale", "taxInvoice", /^taxInvoice\s+Json\?(\s|$)/, "Json?");
    need("PosSale", "taxInvoiceDocId", /^taxInvoiceDocId\s+String\?(\s|$)/, "String?");
    need("AccountDocument", "supersededByDocId", /^supersededByDocId\s+String\?(\s|$)/, "String?");
    const prof = prismaBlock(schemaSrc, "model", "PosBuyerProfile");
    if (!prof) p.push("ไม่มี model PosBuyerProfile");
    else {
      const miss = PROFILE_COLS.filter((c) => !fieldLine(prof, c));
      if (miss.length) p.push(`PosBuyerProfile ขาด ${miss.join(",")}`);
      if (!/@unique\b/.test(fieldLine(prof, "customerId"))) p.push("PosBuyerProfile.customerId ไม่ใช่ @unique");
      const em = fieldLine(prof, "email");
      if (em && !/\?$/.test(em.split(/\s+/)[1] ?? "")) p.push("PosBuyerProfile.email ต้อง nullable");
      if (!/@updatedAt\b/.test(fieldLine(prof, "updatedAt"))) p.push("PosBuyerProfile.updatedAt ไม่ใช่ @updatedAt");
      if (!/@@index\(\s*\[\s*tenantId\s*,\s*taxId\s*\]/.test(prof)) p.push("PosBuyerProfile ไม่มี @@index([tenantId, taxId])");
    }
    const files = walk("prisma/migrations", [], /\.sql$/).filter((f) => /"PosBuyerProfile"|ADD\s+COLUMN\s+"(taxInvoice|taxInvoiceDocId|supersededByDocId)"/i.test(rd(f)));
    if (!files.length) p.push("ไม่มี migration ที่แตะ PosBuyerProfile / taxInvoice / taxInvoiceDocId / supersededByDocId");
    const all = files.map((f) => rd(f).replace(/--.*$/gm, "")).join("\n");
    if (files.length) {
      if (!/CREATE\s+TABLE\s+"PosBuyerProfile"/i.test(all)) p.push('ไม่มี CREATE TABLE "PosBuyerProfile"');
      for (const [t, c] of [["PosSale", "taxInvoice"], ["PosSale", "taxInvoiceDocId"], ["AccountDocument", "supersededByDocId"]] as const)
        if (!new RegExp(`ALTER\\s+TABLE\\s+"${t}"[^;]*ADD\\s+COLUMN\\s+"${c}"`, "i").test(all)) p.push(`ไม่มี ${t} ADD COLUMN "${c}"`);
      if (!/CREATE\s+UNIQUE\s+INDEX[^;]*ON\s+"PosBuyerProfile"\s*\(\s*"customerId"\s*\)/i.test(all)) p.push("ไม่มี unique index PosBuyerProfile(customerId)");
    }
    for (const f of files) {
      const stmts = rd(f).replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
      const bad = stmts.filter(
        (s) =>
          (!/^CREATE\s+(TYPE|TABLE|UNIQUE\s+INDEX|INDEX)\b/i.test(s) && !/^ALTER\s+TABLE\s+"[A-Za-z]+"\s+ADD\s+(COLUMN|CONSTRAINT)\b/i.test(s)) ||
          /\b(DROP|RENAME|TRUNCATE|DELETE\s+FROM|UPDATE\s+"|ALTER\s+COLUMN|SET\s+NOT\s+NULL)\b/i.test(s),
      );
      if (bad.length) p.push(`${f.split("/").slice(-2, -1)[0]}: คำสั่งที่ไม่ใช่การเพิ่ม (${short(bad[0], 70)})`);
    }
    chk("ST1", p.length === 0, "4 คอลัมน์ + PosBuyerProfile + SQL เพิ่มอย่างเดียว", p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || `ครบ (${files.length} ไฟล์ migration)`);
  }
  // ST2 ลงทะเบียน
  {
    const p: string[] = [];
    if (!/\bPosBuyerProfile\s*:/.test(srcOf(F.scope))) p.push("scope.ts ไม่มี PosBuyerProfile");
    const env = srcOf(F.qcEnv);
    const pm = env.slice(env.indexOf("export const POS_MODELS"), env.indexOf("export type PosModelKey"));
    if (!/\bposBuyerProfile\s*:/.test(pm)) p.push("pos-qc-env POS_MODELS ไม่มี posBuyerProfile");
    const cons = srcOf(F.consumers);
    const m = new RegExp(`["']${EV_ISSUED.replace(/\./g, "\\.")}["']\\s*:\\s*([^\\n]*)`).exec(cons);
    if (!m) p.push(`outbox-consumers ไม่มี "${EV_ISSUED}"`);
    else if (!/withAutomation\s*\(/.test(m[1]!)) p.push(`"${EV_ISSUED}" ไม่ห่อ withAutomation`);
    if (!new RegExp(`value\\s*:\\s*["']${EV_ISSUED.replace(/\./g, "\\.")}["']`).test(srcOf(F.labels))) p.push(`automation/labels.ts ไม่มีป้าย ${EV_ISSUED}`);
    if (!new RegExp(`["']${PERM_ISSUE.replace(/\./g, "\\.")}["']\\s*:`).test(srcOf(F.perms))) p.push(`permissions.ts ไม่มีคีย์ "${PERM_ISSUE}"`);
    for (const [lang, f] of [["th", F.msgTh], ["en", F.msgEn]] as const) {
      let j: Any = null;
      try {
        j = JSON.parse(rd(f) || "null");
      } catch (e) {
        p.push(`${f} อ่าน JSON ไม่ได้: ${(e as Error).message.slice(0, 40)}`);
      }
      const errs = j?.taxInvoice?.errors;
      if (!isRecord(errs)) p.push(`${lang}: ไม่มี taxInvoice.errors`);
      else {
        const miss = [...MSG_CODES.map(camel), "unknown"].filter((k) => typeof errs[k] !== "string" || !String(errs[k]).trim());
        if (miss.length) p.push(`${lang}: taxInvoice.errors ขาด ${miss.join(",")}`);
        if (lang === "th") {
          const notThai = Object.entries(errs).filter(([, v]) => typeof v === "string" && !THAI.test(v)).map(([k]) => k);
          if (notThai.length) p.push(`th: ไม่ใช่ไทย ${notThai.join(",")}`);
        }
      }
    }
    const shared = srcOf(F.shared);
    if (!exportsFn(shared, "taxInvoiceRefusalKey")) p.push("tax-invoice-shared.ts ไม่มี export taxInvoiceRefusalKey");
    else {
      const miss = MSG_CODES.filter((c) => !new RegExp(`\\b${c}\\b`).test(shared));
      if (miss.length) p.push(`taxInvoiceRefusalKey ไม่ครอบ ${miss.join(",")}`);
    }
    if (!/supersededByDocId/.test(rd(F.ownerPending))) p.push("ledger/POS-OWNER-PENDING.md ไม่บันทึก AccountDocument.supersededByDocId");
    chk("ST2", p.length === 0, "scope · pos-qc-env · consumer+ป้าย · สิทธิ์ · ข้อความ th/en · คีย์ปฏิเสธ · owner-pending", p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || "ครบ");
  }
  // ST3 ขอบเขตโมดูล
  {
    const p: string[] = [];
    const posFiles = walk(POS_DIR);
    for (const f of posFiles) {
      const s = srcOf(f);
      const nm = f.slice(POS_DIR.length + 1);
      const inner = [...s.matchAll(/["'](@\/lib\/modules\/account\/[^"']+|(?:\.\.\/)+account(?:\/[^"']*)?)["']/g)].map((x) => x[1]!);
      if (inner.length) p.push(`${nm} import ${[...new Set(inner)].join(",")} (ต้อง @/lib/modules/account)`);
    }
    const acc = srcOf(F.accIndex);
    for (const n of ["convertAbbToTaxInvoice", "lookupJuristic"]) if (!exportsFn(acc, n)) p.push(`account/index.ts ไม่ export ${n}`);
    const ae = acc.indexOf("export async function applyExternalSale");
    const aeSig = ae >= 0 ? acc.slice(ae, acc.indexOf("Promise<", ae)) : "";
    if (!/\bbuyer\?\s*:/.test(aeSig)) p.push("applyExternalSale ไม่รับ buyer?");
    const fe = srcOf(F.accService);
    const fi = fe.indexOf("export async function findExternalSaleDoc");
    const feBody = fi >= 0 ? fe.slice(fi, fe.indexOf("\n}", fi)) : "";
    if (!/\bTAX_INVOICE\b/.test(feBody)) p.push("findExternalSaleDoc ไม่เลือก TAX_INVOICE (R8)");
    const mine = [F.shared, F.svc, F.act].filter((f) => existsSync(join(ROOT, f)));
    if (!mine.length) p.push("ไม่มีไฟล์ tax-invoice* ใน pos");
    for (const f of mine) {
      const s = srcOf(f);
      const nm = f.split("/").pop();
      if (/\.accountDocument\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/.test(s)) p.push(`${nm} เขียน accountDocument ตรง`);
      if (/\.accountContact\s*\.\s*(create|update|upsert)\b/.test(s)) p.push(`${nm} เขียน accountContact ตรง`);
      if (/\.customer\s*\.\s*(create|update|updateMany|upsert)\b/.test(s)) p.push(`${nm} เขียน Customer (R6: ห้าม)`);
      if (/DBD_API_KEY/.test(s)) p.push(`${nm} อ่าน DBD_API_KEY ตรง (CD3: ผ่าน facade)`);
      if (/(^|[^.\w])fetch\s*\(/.test(s)) p.push(`${nm} เรียก fetch`);
    }
    if (existsSync(join(ROOT, F.shared)) && !sharedPure()) p.push("tax-invoice-shared.ts import prisma/db/โมดูลฝั่งเซิร์ฟเวอร์ (ต้องบริสุทธิ์)");
    chk("ST3", p.length === 0, "pos→account ผ่าน facade · facade ครบ · ไม่เขียนข้ามโมดูล", p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || `ครบ (${posFiles.length} ไฟล์ pos)`);
  }
  // ST4 "use server"
  {
    const p: string[] = [];
    const files = walk(POS_DIR).filter((f) => /^["']use server["']/.test(rd(f).replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "").trimStart()));
    for (const f of files) {
      const s = srcOf(f);
      const bad = [...s.matchAll(/^\s*export\s+[^\n]*/gm)].map((m) => m[0].trim()).filter((l) => !/^export\s+async\s+function\s+\w+/.test(l));
      if (bad.length) p.push(`${f.split("/").pop()}: export ที่ไม่ใช่ async function (${short(bad.map((b) => b.slice(0, 40)), 100)})`);
    }
    const raw = rd(F.act);
    if (!raw) p.push(`ไม่มี ${F.act}`);
    else {
      const first = raw.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "").trimStart();
      if (!/^["']use server["']/.test(first)) p.push('tax-invoice-actions.ts: "use server" ไม่ใช่คำสั่งแรก');
      const s = stripComments(raw);
      if (!/requireTenant\s*\(/.test(s)) p.push("tax-invoice-actions.ts ไม่เรียก requireTenant");
      const starts = [...s.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)].map((m) => ({ name: m[1]!, at: m.index! }));
      for (const [act, fn] of ACTIONS) {
        const i = starts.findIndex((x) => x.name === act);
        if (i < 0) {
          p.push(`ไม่มี ${act}`);
          continue;
        }
        const body = s.slice(starts[i]!.at, i + 1 < starts.length ? starts[i + 1]!.at : s.length);
        if (!new RegExp(`\\b${fn}\\s*\\(`).test(body)) p.push(`${act} ไม่เรียก ${fn}`);
        if (!/\bcatch\b/.test(body)) p.push(`${act} ไม่มี catch`);
      }
    }
    chk("ST4", p.length === 0, "use server = async function ล้วน · 5 actions", p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || `ครบ (${files.length} ไฟล์ use server)`);
  }
}

// ═════════════════════════ 1b. ตัวแกะผู้ซื้อ (บริสุทธิ์ · ไม่แตะ DB) ═════════════════════════
const J1 = withCheck("010556117763"); // = 0105561177639
const P1ID = withCheck("110170020345");
const pureArgs = { juristic: J1, person: P1ID };
async function runPure(shared: Any): Promise<void> {
  console.log("\n── B ตัวแกะผู้ซื้อ (บริสุทธิ์) ──");
  const NS = shared && typeof shared.parseTaxInvoiceBuyer === "function" ? "" : `${MISSING} parseTaxInvoiceBuyer (tax-invoice-shared.ts) · `;
  const parse = (x: unknown) => callSync(shared, "parseTaxInvoiceBuyer", x);
  const base = { kind: "JURISTIC", name: "บริษัท ผู้ซื้อคิวซี จำกัด", taxId: pureArgs.juristic, branchCode: "00000", address: "99/9 ถ.ทดสอบ แขวงสีลม เขตบางรัก กรุงเทพฯ 10500", email: "buyer@example.com" };
  // B1
  {
    const p: string[] = [];
    const r = parse({ ...base, name: `  ${base.name}  `, taxId: ` ${base.taxId} `, address: `  ${base.address}\t`, email: ` ${base.email} ` });
    const b = r?.ok === true ? r.buyer : null;
    if (!b) p.push(`JURISTIC → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else {
      const want = { ...base, source: "MANUAL" };
      for (const k of BUYER_KEYS) if (b[k] !== (want as Any)[k]) p.push(`${k} ${short(b[k], 40)} (คาด ${short((want as Any)[k], 40)})`);
      const extra = Object.keys(b).filter((k) => !BUYER_KEYS.includes(k));
      if (extra.length) p.push(`คีย์เกิน ${extra.join(",")}`);
    }
    const rp = parse({ kind: "PERSON", name: "นายผู้ซื้อ คิวซี", taxId: pureArgs.person, address: "1 หมู่ 2 ต.ทดสอบ อ.เมือง จ.เชียงใหม่ 50000" });
    if (rp?.ok !== true) p.push(`PERSON → ${codeOf(rp)}`);
    else if (rp.buyer?.branchCode !== "00000" || rp.buyer?.email !== null || rp.buyer?.source !== "MANUAL" || rp.buyer?.kind !== "PERSON") p.push(`PERSON ปริยาย ${short(rp.buyer, 120)}`);
    for (const src of ["DBD", "PROFILE"]) {
      const rs = parse({ ...base, source: src });
      if (rs?.ok !== true || rs.buyer?.source !== src) p.push(`source ${src} → ${codeOf(rs)} ${short(rs?.buyer?.source, 20)}`);
    }
    chk("B1", NS === "" && p.length === 0, "ตัดช่องว่าง · ค่าปริยาย · source", NS + (p.join(" · ") || "ครบ"));
  }
  // B2
  {
    const p: string[] = [];
    // ตัวควบคุมของข้อสอบเอง
    if (!thaiTaxIdOk("0105561177639") || thaiTaxIdOk("0105561177630") || thaiTaxIdOk("1111111111111") || thaiTaxIdOk("010556117763")) p.push("ตัวตรวจ mod-11 ของข้อสอบเพี้ยน");
    const goods = [pureArgs.juristic, pureArgs.person, withCheck("099400016550"), withCheck("310990012345")];
    for (const g of goods) {
      if (!thaiTaxIdOk(g)) p.push(`(ข้อสอบ) ${g} ไม่ผ่านตัวตรวจเอง`);
      const r = parse({ ...base, taxId: g });
      if (r?.ok !== true) p.push(`${g} → ${codeOf(r)}`);
    }
    const bads: [string, string][] = [
      ["หลักตรวจผิด", badCheck(pureArgs.juristic)],
      ["หลักตรวจผิด (บุคคล)", badCheck(pureArgs.person)],
      ["1111111111111", "1111111111111"],
      ["12 หลัก", pureArgs.juristic.slice(0, 12)],
      ["14 หลัก", `${pureArgs.juristic}0`],
      ["มีตัวอักษร", `${pureArgs.juristic.slice(0, 11)}ab`],
      ["ว่าง", ""],
    ];
    for (const [lbl, t] of bads) {
      const r = parse({ ...base, taxId: t });
      if (!refused(r, "TAX_ID_INVALID")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    chk("B2", NS === "" && p.length === 0, "เลขถูก 4 ผ่าน · ผิด 7 แบบ TAX_ID_INVALID", NS + (p.join(" · ") || "ครบ"));
  }
  // B3
  {
    const p: string[] = [];
    const r1 = parse({ ...base, branchCode: "00001" });
    if (r1?.ok !== true || r1.buyer?.branchCode !== "00001") p.push(`00001 → ${codeOf(r1)} ${short(r1?.buyer?.branchCode, 10)}`);
    const bads: [string, Any][] = [
      ["branch 123", { ...base, branchCode: "123" }],
      ["branch 0000a", { ...base, branchCode: "0000a" }],
      ["branch 000000", { ...base, branchCode: "000000" }],
      ["kind COMPANY", { ...base, kind: "COMPANY" }],
      ["kind juristic", { ...base, kind: "juristic" }],
      ["ไม่มี kind", { name: base.name, taxId: base.taxId, address: base.address }],
      ["source X", { ...base, source: "X" }],
    ];
    for (const [lbl, x] of bads) {
      const r = parse(x);
      if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    chk("B3", NS === "" && p.length === 0, "00001 เก็บ · ผิด 7 แบบ VALIDATION", NS + (p.join(" · ") || "ครบ"));
  }
  // B4
  {
    const p: string[] = [];
    const email120 = `${"a".repeat(120 - "@example.com".length)}@example.com`;
    const oks: [string, Any][] = [
      ["name 120", { ...base, name: "N".repeat(120) }],
      ["address 300", { ...base, address: "A".repeat(300) }],
      ["email 120", { ...base, email: email120 }],
    ];
    for (const [lbl, x] of oks) {
      const r = parse(x);
      if (r?.ok !== true) p.push(`${lbl} → ${codeOf(r)}`);
    }
    const bads: [string, Any][] = [
      ["name 121", { ...base, name: "N".repeat(121) }],
      ["address 301", { ...base, address: "A".repeat(301) }],
      ["email 121", { ...base, email: `a${email120}` }],
      ["email ผิดรูป", { ...base, email: "not-an-email" }],
      ["name ช่องว่าง", { ...base, name: "   " }],
      ["ไม่มี address", { kind: base.kind, name: base.name, taxId: base.taxId }],
      ["คีย์แปลก saleId", { ...base, saleId: "c123" }],
      ["null", null],
      ["สตริง", "บริษัท"],
      ["อาร์เรย์", [base]],
    ];
    for (const [lbl, x] of bads) {
      const r = parse(x);
      if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)}${r?.threw ? " (throw)" : ""}`);
    }
    const k1 = callSync(shared, "taxInvoiceRefusalKey", "TOO_LATE");
    const k2 = callSync(shared, "taxInvoiceRefusalKey", "WHATEVER_X");
    if (k1 !== "taxInvoice.errors.tooLate") p.push(`taxInvoiceRefusalKey(TOO_LATE) = ${short(k1, 60)}`);
    if (k2 !== "taxInvoice.errors.unknown") p.push(`taxInvoiceRefusalKey(แปลก) = ${short(k2, 60)}`);
    chk("B4", NS === "" && p.length === 0, "ขอบ 3 ผ่าน · ผิด 10 แบบ VALIDATION · คีย์ข้อความ", NS + (p.join(" · ") || "ครบ"));
  }
}

// ═════════════════════════ 1c. --no-db ═════════════════════════
if (NODB) {
  const ids = [...STATIC_IDS, ...PURE_IDS];
  console.log(`[${SUITE}] --no-db: รัน ${ids.length} ข้อ (สถิต + ตัวแกะบริสุทธิ์ · ไม่โหลด prisma)`);
  let crashedS = "";
  try {
    await runStatic();
    const shared = existsSync(join(ROOT, F.shared)) && sharedPure() ? await tryImport("@/lib/modules/pos/tax-invoice-shared") : null;
    if (existsSync(join(ROOT, F.shared)) && !sharedPure()) console.log("  ⚠️  tax-invoice-shared.ts ไม่บริสุทธิ์ — --no-db ไม่โหลด (B1–B4 แดง)");
    await runPure(shared);
  } catch (e) {
    crashedS = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
    console.log(`💥 harness: ${crashedS}`);
  }
  for (const id of ids) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashedS ? `ไม่ถึง (harness ล้ม: ${crashedS.slice(0, 80)})` : "ไม่ถึง");
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

// ═════════════════════════ 3. ด่าน SKIP ═════════════════════════
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
let seedOk = false;
try {
  seedOk = !!(await envMod.resolvePosScope(prisma, "coffee"));
} catch (e) {
  console.log(`  (resolvePosScope ล้ม: ${(e as Error).message.slice(0, 120)})`);
}
if (!seedOk) skipReasons.push("ชุดข้อมูล QC POS (ร้านกาแฟ) ยังไม่ถูก seed — รัน scripts/seed-pos-qc.mts ก่อน (ใช้ userId เจ้าของ/แคชเชียร์)");
const PBP: Any = typeof P.posBuyerProfile?.findMany === "function" ? P.posBuyerProfile : null;
if (!PBP) skipReasons.push("Prisma client ยังไม่มี delegate posBuyerProfile (R6)");
const dbCols = new Set<string>();
try {
  const rows = (await P.$queryRawUnsafe(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('PosSale','PosTaxInvoiceRequest','AccountDocument','PosBuyerProfile')`)) as Any[];
  for (const r of rows) dbCols.add(`${r.table_name}.${r.column_name}`);
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
const COL = {
  snap: dbCols.has("PosSale.taxInvoice"),
  docId: dbCols.has("PosSale.taxInvoiceDocId"),
  issued: dbCols.has("PosTaxInvoiceRequest.issuedDocId"),
  sup: dbCols.has("AccountDocument.supersededByDocId"),
  prof: dbCols.has("PosBuyerProfile.customerId"),
};
for (const [k, lbl] of [["snap", "PosSale.taxInvoice"], ["docId", "PosSale.taxInvoiceDocId"], ["sup", "AccountDocument.supersededByDocId"], ["prof", "ตาราง PosBuyerProfile"]] as const)
  if (!COL[k]) skipReasons.push(`ฐาน QC4 ยังไม่มี ${lbl}`);

const COUNT_MODELS = ["posSale", "posSaleLine", "posPayment", "posShift", "posDevice", "posTaxInvoiceRequest", "outboxEvent", "auditLog", "customer", "accountDocument", "accountContact", "accountJournalEntry"] as const;
async function snapshotCounts(): Promise<Record<string, number | string>> {
  const out: Record<string, number | string> = {};
  for (const tid of TIDS)
    for (const m of COUNT_MODELS) {
      const d = P[m];
      out[`${tid}.${m}`] = typeof d?.count === "function" ? await d.count({ where: { tenantId: tid } }).catch((e: Error) => `err:${e.message.slice(0, 30)}`) : "absent";
    }
  if (PBP) out["qc.posBuyerProfile"] = await PBP.count({ where: { tenantId: { in: TIDS } } }).catch(() => "err");
  return out;
}
const countsBefore = await snapshotCounts();

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P1.13 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อมูล: seed ${seedOk ? "มี" : "ไม่มี"} · ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length, seed: seedOk })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const ex = (f: string) => existsSync(join(ROOT, f));
const sharedMod = ex(F.shared) ? await tryImport("@/lib/modules/pos/tax-invoice-shared") : null;
const tiMod = ex(F.svc) ? await tryImport("@/lib/modules/pos/tax-invoice") : null;
const svc = await tryImport("@/lib/modules/pos/service");
const register = await tryImport("@/lib/modules/pos/register");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const rcpMod = await tryImport("@/lib/modules/pos/receipt");
const renderMod = await tryImport("@/lib/modules/pos/receipt-render");
const billsMod = await tryImport("@/lib/modules/pos/bills");
const pubMod = await tryImport("@/lib/modules/pos/public-receipt");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const accFacade = await tryImport("@/lib/modules/account");
const glMod = await tryImport("@/lib/modules/account/gl");
const dbdMod = await tryImport("@/lib/modules/account/dbd");
const consMod = await tryImport("@/lib/outbox-consumers");
const pick = (name: string, ...mods: Any[]): Any => mods.find((m) => typeof m?.[name] === "function") ?? null;
const M = {
  issue: pick("issueFullTaxInvoice", tiMod),
  fromReq: pick("issueFromTaxInvoiceRequest", tiMod),
  reject: pick("rejectTaxInvoiceRequest", tiMod),
  lookup: pick("lookupBuyerByTaxId", tiMod),
  profile: pick("buyerProfileForMember", tiMod),
};
const DBD_REASON: Record<string, string> = (dbdMod?.DBD_REASON as Record<string, string>) ?? { noKey: "?noKey", notFound: "?notFound", unavailable: "?unavailable", badTaxId: "?badTaxId", timeout: "?timeout" };

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p1.13-${RAND}`;
const T_SLUG = `posqc-p113-${RAND}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";
const RUN_START = Date.now();
const MY_TAX_IDS: string[] = []; // เลขผู้ซื้อของรอบนี้ — Z1 ตามหาในร้าน seed

// ── ตัวกั้นเครือข่าย: ทุก fetch ในช่วง DB = 503 + นับ ──
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
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !STATIC_IDS.includes(id) && !PURE_IDS.includes(id) && id !== "P1.13-Z1");
const dataRefusals: [string, Any][] = [];
const keep = (label: string, r: Any) => {
  if (r?.ok === false && !r.missing) dataRefusals.push([label, r]);
  return r;
};

async function runDb() {
  if (!seedOk) {
    for (const id of DB_IDS) chk(id, false, "seed ร้าน QC POS", "ยังไม่ได้ seed (scripts/seed-pos-qc.mts) — ข้อ DB ตรวจไม่ได้");
    return;
  }
  assertQc4BeforeWrite();
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} · DB ${HOST} ──`);
  console.log("   POS-A ผูกสมุดจด VAT (ABB) สาขา A + A2 · POS-N ไม่ผูกสมุด สาขา N · สมาชิก C1/C2 · DBD = stub");
  let fx = "";
  const S: Record<string, string> = {};
  const U: Record<string, string> = {};
  const ownerId: string = PQC.coffee.users.owner.userId;
  const cashierId: string = PQC.coffee.users.cashier.userId;
  try {
    const t = await P.tenant.create({ data: { name: `QC P1.13 ใบกำกับเต็มรูป ${RAND}`, slug: T_SLUG } });
    T = t.id;
    for (const k of ["A", "A2", "N"]) U[k] = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขา${k}`, slug: `${T_SLUG}-${k.toLowerCase()}` } })).id;
    S.POSA = (await sysSvc.createSystem(T, "POS", "POS-A (ผูกบัญชี VAT)")).id;
    S.POSN = (await sysSvc.createSystem(T, "POS", "POS-N (ไม่ผูกบัญชี)")).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", "บัญชี QC P1.13")).id;
    S.MEM = (await sysSvc.createSystem(T, "MEMBER", "สมาชิก QC P1.13")).id;
    S.PTS = (await sysSvc.createSystem(T, "POINT", "แต้ม QC P1.13")).id;
    await accSvc.saveSettings(T, S.ACC, { orgName: "ร้านใบกำกับเต็มรูปคิวซี จำกัด", taxId: "0105561177639", vatRegistered: true });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POSA } });
    await sysSvc.linkUnit(T, S.POSA, U.A);
    await sysSvc.linkUnit(T, S.POSA, U.A2);
    await sysSvc.linkUnit(T, S.POSN, U.N);
    for (const s of ["MEM", "PTS"]) await sysSvc.linkUnit(T, S[s], U.A);
    await P.pointSettings.upsert({ where: { tenantId: T }, create: { tenantId: T, satangPerPoint: 1000 }, update: { satangPerPoint: 1000 } });
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const NEED = (...xs: [unknown, string][]) => xs.filter(([v]) => !v).map(([, l]) => `${MISSING} ${l} · `).join("");
  const NCOL = (...ks: (keyof typeof COL)[]) => ks.filter((k) => !COL[k]).map((k) => `${MISSING} คอลัมน์/ตาราง ${k} · `).join("");

  // ─── ผู้กระทำ ───
  const owner = { userId: ownerId, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const staffRead = { userId: cashierId, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.read": true } };
  const staffIssue = { userId: cashierId, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.read": true, [PERM_ISSUE]: true } };
  const manager = { userId: cashierId, role: "MANAGER", unitAccess: [U.A], permissions: {} };
  const ctxOf = (k: string, deviceId?: string): Any => ({ tenantId: T, systemId: k === "N" ? S.POSN : S.POSA, unitId: U[k], ...(deviceId ? { deviceId } : {}) });
  const rctx = (k: string): Any => ({ tenantId: T, systemId: k === "N" ? S.POSN : S.POSA });

  // ─── เครื่อง + กะ ───
  const DEV1 = `qc113${RAND}d1`;
  if (!fx) {
    const rg = await call(devMod, "registerDevice", ctxOf("A"), owner, { name: "เคาน์เตอร์ QC 1", deviceCode: DEV1 });
    if (rg?.ok !== true) console.log(`  ⚠️  registerDevice: ${codeOf(rg)} ${short(rg?.message ?? "", 80)}`);
    const o1 = await call(shiftMod, "openShift", ctxOf("A", DEV1), owner, { deviceId: DEV1, deviceLabel: "เคาน์เตอร์ QC 1", floatSatang: 0 });
    if (o1?.ok !== true) fx = `เปิดกะ: ${codeOf(o1)} ${short(o1?.message ?? "", 80)}`;
  }

  // ─── สมาชิก ───
  const C: Record<string, { id: string; name: string; phone: string }> = {};
  if (!fx) {
    try {
      for (const k of ["C1", "C2"]) {
        const name = `สมใจ ${k} ใบกำกับ${RAND}`;
        const phone = `0898${k.slice(1)}${String(Math.floor(Math.random() * 1e5)).padStart(5, "0")}`;
        const party = await P.party.create({ data: { tenantId: T, name, phone } });
        const c = await P.customer.create({ data: { tenantId: T, memberSystemId: S.MEM, name, phone, memberCode: `QC113${k}-${RAND}`.toUpperCase(), partyId: party.id } });
        C[k] = { id: c.id, name, phone };
      }
    } catch (e) {
      fx = `สมาชิก:${(e as Error).message.slice(0, 140)}`;
    }
  }

  // ─── ผู้ซื้อ (เลขถูกตาม mod-11 · ต่างกันทุกคน) ───
  const rnd9 = () => String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  const TX_T = withCheck(`010${rnd9()}`);
  const TX_L = withCheck(`010${rnd9()}`);
  const TX_L2 = withCheck(`010${rnd9()}`);
  const TX_Q = withCheck(`010${rnd9()}`);
  const TX_D = withCheck(`099${rnd9()}`);
  const BUY_T = { kind: "JURISTIC", name: `บริษัท ผู้ซื้อตอนชำระ ${RAND} จำกัด`, taxId: TX_T, branchCode: "00000", address: "1/1 ถ.สีลม แขวงสีลม เขตบางรัก กรุงเทพฯ 10500", email: `qcp113t${RAND}@example.com` };
  const BUY_L = { kind: "JURISTIC", name: `บริษัท ผู้ซื้อทีหลัง ${RAND} จำกัด`, taxId: TX_L, branchCode: "00001", address: "2/2 ถ.พระราม 4 แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110", email: `qcp113l${RAND}@example.com` };
  const BUY_L2 = { kind: "PERSON", name: `นายผู้ซื้ออีกคน ${RAND}`, taxId: TX_L2, branchCode: "00000", address: "3/3 ต.ช้างคลาน อ.เมือง จ.เชียงใหม่ 50100", email: null };
  MY_TAX_IDS.push(TX_T, TX_L, TX_L2, TX_Q, TX_D);
  const REQ_Q = { name: `บริษัท ผู้ขอจากใบเสร็จ ${RAND} จำกัด`, taxId: TX_Q, branchCode: "00002", address: "4/4 ถ.นิมมาน ต.สุเทพ อ.เมือง จ.เชียงใหม่ 50200", email: `qcp113q${RAND}@example.com` };

  // ─── บิล ───
  type Bill = { k: string; id: string; receiptNo: string; grand: number; L: Record<string, string>; err: string; key: string; res: Any };
  const B: Record<string, Bill> = {};
  let keyN = 0;
  const newKey = (p = "k") => `qc113-${RAND}-${p}-${++keyN}`;
  const linesOf = async (id: string): Promise<Record<string, string>> => {
    const L: Record<string, string> = {};
    if (id) for (const l of (await P.posSaleLine.findMany({ where: { saleId: id } }).catch(() => [])) as Any[]) L[l.name] = l.id;
    return L;
  };
  type LineIn = [string, number, number];
  const regSale = async (k: string, unit: string, lines: LineIn[], pays: [string, number][], o: { member?: string; taxInvoice?: Any; rememberBuyer?: boolean } = {}): Promise<Bill> => {
    const c = ctxOf(unit, unit === "A" ? DEV1 : undefined);
    const cart: Any = { lines: lines.map(([name, qty, unitPriceSatang]) => ({ name, qty, unitPriceSatang })), ...(o.member ? { memberId: o.member } : {}) };
    const want = sum(lines.map(([, q, pr]) => q * pr));
    let err = "";
    let id = "", receiptNo = "";
    const key = newKey(`s${k}`);
    let res: Any = null;
    if (fx) err = "fixture";
    else {
      const q = await call(register, "quoteRegisterCart", c, owner, cart);
      if (q?.ok !== true || q.grandTotalSatang !== want) err = `quote ${codeOf(q)} ${q?.grandTotalSatang} (คาด ${want}) ${short(q?.message ?? "", 60)}`;
      else {
        const cash = sum(pays.filter(([t]) => t === "CASH").map(([, n]) => n));
        const input: Any = {
          ...cart,
          idempotencyKey: key,
          expectedGrandTotalSatang: want,
          payMethods: pays.map(([type, amountSatang]) => ({ type, amountSatang })),
          ...(cash > 0 ? { cashReceivedSatang: cash } : {}),
          ...(o.taxInvoice !== undefined ? { taxInvoice: o.taxInvoice } : {}),
          ...(o.rememberBuyer !== undefined ? { rememberBuyer: o.rememberBuyer } : {}),
        };
        res = keep(`submit ${k}`, await call(register, "submitRegisterSale", c, owner, input));
        if (res?.ok !== true) err = `submit ${codeOf(res)} ${short(res?.message ?? "", 80)}`;
        else {
          id = String(res.saleId);
          receiptNo = String(res.receiptNo ?? "");
        }
      }
    }
    if (err) console.log(`  ⚠️  บิล ${k}: ${err}`);
    const b: Bill = { k, id, receiptNo, grand: want, L: await linesOf(id), err, key, res };
    B[k] = b;
    return b;
  };
  const c1 = () => C.C1?.id;
  // ตอนชำระ (S)
  await regSale("bT", "A", [["ลาเต้ P113", 2, 5000], ["ขนม P113", 1, 5000]], [["CASH", 15000]], { member: c1(), taxInvoice: { ...BUY_T }, rememberBuyer: true });
  await regSale("bP", "A", [["ลาเต้ P113", 2, 5000], ["ขนม P113", 1, 5000]], [["CASH", 15000]], { member: c1() });
  await regSale("bT2", "A", [["น้ำ P113", 1, 2000]], [["CASH", 2000]], { taxInvoice: { ...BUY_T, name: `ห้าง ชื่ออื่น ${RAND}` }, rememberBuyer: true });
  await regSale("bTN", "N", [["ของ POS-N P113", 1, 10700]], [["CASH", 10700]], { taxInvoice: { ...BUY_T } });
  // ออกทีหลัง (L) · คำขอ (Q) · ตัวควบคุม
  await regSale("bL", "A", [["เสื้อ P113", 1, 10000], ["หมวก P113", 1, 7500]], [["PROMPTPAY", 17500]], { member: c1() });
  await regSale("bL8", "A", [["ของ 8 วัน P113", 1, 3000]], [["CASH", 3000]]);
  await regSale("bL6", "A", [["ของ 6 วัน P113", 1, 3200]], [["CASH", 3200]]);
  await regSale("bVoid", "A", [["ชา P113", 1, 4500]], [["CASH", 4500]]);
  await regSale("bW", "N", [["ของ N P113", 1, 9900]], [["CASH", 9900]]);
  await regSale("bQ", "A", [["ข้าว P113", 1, 5100]], [["CASH", 5100]]);
  await regSale("bQ2", "A", [["ส้ม P113", 1, 1900]], [["CASH", 1900]]);
  await regSale("bQ3", "A", [["มะนาว P113", 1, 1800]], [["CASH", 1800]]);
  await regSale("bAbb", "A", [["แก้ว P113", 1, 3300]], [["CASH", 3300]]);
  await regSale("bR6", "A", [["จาน P113", 1, 2500], ["ช้อน P113", 1, 1500]], [["CASH", 4000]]); // ORACLE-EDIT L6 (มติ 15)
  // บิลผูกสมุดที่ไม่มี ABB (ใส่ผ่าน prisma · ไม่มี outbox) — ACCOUNT_PENDING
  {
    let id = "", err = "";
    if (fx) err = "fixture";
    else
      try {
        const s = await P.posSale.create({ data: { tenantId: T, unitId: U.A, systemId: S.POSA, idempotencyKey: newKey("pend"), receiptNo: `PEND-${RAND}`, status: "PAID", subtotalSatang: 5350, vatSatang: vatOf(5350, 700), grandTotalSatang: 5350, paidAt: new Date(), createdAt: new Date() } });
        id = s.id;
      } catch (e) {
        err = (e as Error).message.slice(0, 100);
      }
    if (err) console.log(`  ⚠️  บิล bPend: ${err}`);
    B.bPend = { k: "bPend", id, receiptNo: `PEND-${RAND}`, grand: 5350, L: {}, err, key: "", res: null };
  }
  await drain(); // pos.sale.paid → ABB / TAX_INVOICE · แต้ม

  // ─── ตัวอ่าน ───
  const row = async (id: string): Promise<Any> => (id ? P.posSale.findUnique({ where: { id } }).catch(() => null) : null);
  const saleTax = async (id: string): Promise<{ snap: Any; docId: string | null }> => {
    if (!id || !COL.snap || !COL.docId) return { snap: undefined, docId: null };
    const r = (await P.$queryRawUnsafe(`SELECT "taxInvoice" AS s, "taxInvoiceDocId" AS d FROM "PosSale" WHERE id = $1`, id).catch(() => [])) as Any[];
    return { snap: r[0]?.s ?? null, docId: (r[0]?.d as string | null) ?? null };
  };
  const docsOf = async (saleId: string, docType: string): Promise<Any[]> =>
    saleId ? ((await P.accountDocument.findMany({ where: { tenantId: T, docType, refType: "PosSale", refId: saleId }, include: { lines: { orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]) : [];
  const liveDocs = async (saleId: string): Promise<number> =>
    saleId ? Number(await P.accountDocument.count({ where: { tenantId: T, refType: "PosSale", refId: saleId, docType: { in: ["TAX_INVOICE", "TAX_INVOICE_ABB"] }, status: { notIn: ["CANCELLED", "VOIDED"] } } }).catch(() => -1)) : -1;
  const supOf = async (docId: string): Promise<string | null | undefined> => {
    if (!docId || !COL.sup) return undefined;
    const r = (await P.$queryRawUnsafe(`SELECT "supersededByDocId" AS s FROM "AccountDocument" WHERE id = $1`, docId).catch(() => [])) as Any[];
    return (r[0]?.s as string | null) ?? null;
  };
  const contactOf = async (id: string | null | undefined): Promise<Any> => (id ? P.accountContact.findUnique({ where: { id } }).catch(() => null) : null);
  const jvOf = async (refIds: string[]): Promise<Any[]> =>
    (await P.accountJournalEntry.findMany({ where: { tenantId: T, refType: "PosSale", refId: { in: refIds.filter(Boolean) } }, include: { lines: { include: { account: { select: { code: true } } } } } }).catch(() => [])) as Any[];
  const netByCode = (es: Any[]): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const l of es.flatMap((e: Any) => e.lines ?? [])) m[l.account?.code ?? "?"] = (m[l.account?.code ?? "?"] ?? 0) + l.debit - l.credit;
    for (const k of Object.keys(m)) if (m[k] === 0) delete m[k];
    return m;
  };
  const balanced = (es: Any[]) => es.length > 0 && es.every((e: Any) => sum((e.lines ?? []).map((l: Any) => l.debit)) === sum((e.lines ?? []).map((l: Any) => l.credit)));
  const sameMap = (a: Record<string, number>, b: Record<string, number>) => short(Object.entries(a).sort(), 4000) === short(Object.entries(b).sort(), 4000);
  const events = async (type: string, pred: (p: Any) => boolean): Promise<Any[]> => ((await P.outboxEvent.findMany({ where: { tenantId: T, type } }).catch(() => [])) as Any[]).filter((e) => pred(e.payload ?? {}));
  const audits = async (action: string, pred: (a: Any) => boolean = () => true): Promise<Any[]> => ((await P.auditLog.findMany({ where: { tenantId: T, action }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]).filter(pred);
  const tokenOf = async (id: string): Promise<string> => {
    if (!id) return "";
    const r = (await P.$queryRawUnsafe(`SELECT "publicToken" AS t FROM "PosSale" WHERE id = $1`, id).catch(() => [])) as Any[];
    return String(r[0]?.t ?? "");
  };
  const reqRow = async (id: string): Promise<Any> => {
    if (!id) return null;
    const cols = COL.issued ? `, "issuedDocId"` : "";
    const r = (await P.$queryRawUnsafe(`SELECT id, status::text AS status, "accountDocId"${cols} FROM "PosTaxInvoiceRequest" WHERE id = $1`, id).catch(() => [])) as Any[];
    return r[0] ?? null;
  };
  const tiOf = async (saleId: string): Promise<Any> => (await docsOf(saleId, "TAX_INVOICE"))[0] ?? null;
  const abbOf = async (saleId: string): Promise<Any> => (await docsOf(saleId, "TAX_INVOICE_ABB"))[0] ?? null;
  const snapOk = (snap: Any, want: Any, p: string[], lbl: string) => {
    if (!isRecord(snap)) return p.push(`${lbl} snapshot ${short(snap, 60)}`);
    for (const k of ["kind", "name", "taxId", "branchCode", "address"]) if (snap[k] !== want[k]) p.push(`${lbl} snapshot.${k} ${short(snap[k], 40)} (คาด ${short(want[k], 40)})`);
    if ((snap.email ?? null) !== (want.email ?? null)) p.push(`${lbl} snapshot.email ${short(snap.email, 40)}`);
    if (want.source && snap.source !== want.source) p.push(`${lbl} snapshot.source ${snap.source} (คาด ${want.source})`);
    const at = Date.parse(String(snap.requestedAt));
    if (!Number.isFinite(at) || at < RUN_START - MIN || at > Date.now() + MIN) p.push(`${lbl} requestedAt ${short(snap.requestedAt, 30)}`);
    return 0;
  };
  const fixtureErrs = Object.values(B).filter((b) => b.err && b.k !== "bTN").map((b) => `${b.k}:${b.err.slice(0, 40)}`);
  const FXB = (s: string) => FX((fixtureErrs.length ? `บิลตั้งต้นล้ม ${fixtureErrs.join(",")} · ` : "") + s);
  const NS = NCOL("snap", "docId");
  {
    const abb = await abbOf(B.bAbb!.id);
    console.log(`  ตั้งต้น: บิล ${Object.values(B).filter((b) => b.id).length}/${Object.keys(B).length} · ABB bAbb ${abb?.docNo ?? "—"} · ผู้ซื้อ T ${TX_T} L ${TX_L} Q ${TX_Q} D ${TX_D}`);
  }

  // ════════ S1 snapshot ตอนชำระ ════════
  {
    const p: string[] = [];
    for (const k of ["bT", "bT2"]) if (!B[k]!.id) p.push(`${k} ไม่มีบิล (${B[k]!.err.slice(0, 60)})`);
    snapOk((await saleTax(B.bT!.id)).snap, { ...BUY_T, source: "MANUAL" }, p, "bT");
    snapOk((await saleTax(B.bT2!.id)).snap, { ...BUY_T, name: `ห้าง ชื่ออื่น ${RAND}` }, p, "bT2");
    // ORACLE-EDIT S5 (follow-up 3): บิล POS ไม่ผูกสมุด + ผู้ซื้อ ย้ายไปข้อ S5 (NOT_ELIGIBLE ไม่มีบิล)
    const pS = (await saleTax(B.bP!.id)).snap;
    if (COL.snap && pS !== null) p.push(`bP (ไม่มีผู้ซื้อ) snapshot ${short(pS, 40)} (คาด null)`);
    // ค่าผิด → ไม่มีอะไรถูกเขียน
    const ev0 = Number(await P.outboxEvent.count({ where: { tenantId: T } }).catch(() => -1));
    const bad1 = await regSale("bBad1", "A", [["ผิด P113", 1, 1000]], [["CASH", 1000]], { taxInvoice: { ...BUY_T, taxId: badCheck(TX_T) } });
    const bad2 = await regSale("bBad2", "A", [["ผิด2 P113", 1, 1000]], [["CASH", 1000]], { taxInvoice: { ...BUY_T, name: "  " } });
    if (!refused(bad1.res, "TAX_ID_INVALID")) p.push(`หลักตรวจผิด → ${codeOf(bad1.res)}`);
    if (!refused(bad2.res, "VALIDATION")) p.push(`ไม่มีชื่อ → ${codeOf(bad2.res)}`);
    for (const b of [bad1, bad2]) if (b.key && Number(await P.posSale.count({ where: { tenantId: T, idempotencyKey: b.key } }).catch(() => -1)) !== 0) p.push(`${b.k} มีบิลของคีย์`);
    const ev1 = Number(await P.outboxEvent.count({ where: { tenantId: T } }).catch(() => -2));
    if (ev1 !== ev0) p.push(`outbox เพิ่ม ${ev1 - ev0} แถวจากคำขอที่ผิด`);
    chk("S1", NS === "" && p.length === 0, "snapshot 3 บิล · ผิด 2 แบบไม่เขียน", FXB(NS + (p.join(" · ") || "ครบ")));
  }
  // ════════ S2 เอกสาร TAX_INVOICE ตอนชำระ ════════
  const tiT = await tiOf(B.bT!.id);
  {
    const p: string[] = [];
    const sT = await row(B.bT!.id);
    const tis = await docsOf(B.bT!.id, "TAX_INVOICE");
    const abbs = await docsOf(B.bT!.id, "TAX_INVOICE_ABB");
    if (tis.length !== 1) p.push(`TAX_INVOICE ${tis.length} ใบ (คาด 1)`);
    if (abbs.length !== 0) p.push(`ABB ${abbs.length} ใบ (คาด 0 — CD1)`);
    if (tiT) {
      if (!/^TX/.test(String(tiT.docNo ?? ""))) p.push(`docNo ${tiT.docNo} (คาด ชุด TX)`);
      if (tiT.grandTotal !== 15000 || tiT.vatAmount !== vatOf(15000, 700)) p.push(`ยอด ${tiT.grandTotal}/${tiT.vatAmount} (คาด 15000/${vatOf(15000, 700)})`);
      if (sT?.paidAt instanceof Date && new Date(tiT.issueDate).getTime() !== sT.paidAt.getTime()) p.push(`issueDate ${short(tiT.issueDate, 30)} ≠ paidAt`);
      if (["CANCELLED", "VOIDED", "DRAFT"].includes(tiT.status)) p.push(`สถานะ ${tiT.status}`);
      const ct = await contactOf(tiT.contactId);
      if (!ct) p.push("ไม่มีผู้ติดต่อ");
      else {
        if (ct.taxId !== TX_T || (ct.branchCode ?? "00000") !== "00000") p.push(`ผู้ติดต่อ taxId/branch ${ct.taxId}/${ct.branchCode}`);
        if (!String(ct.address ?? "").includes(BUY_T.address)) p.push(`ผู้ติดต่อ address ${short(ct.address, 40)}`);
        if (ct.name !== BUY_T.name) p.push(`ผู้ติดต่อ name ${short(ct.name, 40)}`);
      }
      const snapC = isRecord(tiT.contactSnapshot) ? tiT.contactSnapshot : {};
      if (snapC.taxId !== TX_T) p.push(`contactSnapshot.taxId ${short(snapC.taxId, 20)}`);
    }
    const { docId } = await saleTax(B.bT!.id);
    if (!tiT || docId !== tiT.id) p.push(`taxInvoiceDocId ${docId} (คาด ${tiT?.id ?? "เอกสาร"})`);
    // บิลที่สอง: เลขเดียวกัน ชื่อต่าง → ผู้ติดต่อเดิม
    const ti2 = await tiOf(B.bT2!.id);
    if (!ti2) p.push("bT2 ไม่มี TAX_INVOICE");
    else if (!tiT || ti2.contactId !== tiT.contactId) p.push(`bT2 ผู้ติดต่อ ${ti2.contactId} ≠ ${tiT?.contactId} (CD4 taxId ชนะชื่อ)`);
    // ORACLE-EDIT S2 (มติ F4): ใบกำกับแสดงชื่อที่ผู้ซื้อพิมพ์ — ผู้ติดต่อเดิม (contactId) แต่ contactSnapshot = ชื่อ/เลขของบิลนั้น
    if (ti2) {
      const s2 = isRecord(ti2.contactSnapshot) ? ti2.contactSnapshot : {};
      if (s2.name !== `ห้าง ชื่ออื่น ${RAND}` || s2.taxId !== TX_T || !String(s2.address ?? "").includes(BUY_T.address)) p.push(`bT2 contactSnapshot ${short({ name: s2.name, taxId: s2.taxId }, 80)} (คาด ชื่อที่พิมพ์ · มติ F4)`);
    }
    if (tiT) {
      const sT = isRecord(tiT.contactSnapshot) ? tiT.contactSnapshot : {};
      if (sT.name !== BUY_T.name || sT.email !== BUY_T.email) p.push(`bT contactSnapshot ${short({ name: sT.name, email: sT.email }, 80)}`);
    }
    const nContacts = Number(await P.accountContact.count({ where: { tenantId: T, taxId: TX_T } }).catch(() => -1));
    if (nContacts !== 1) p.push(`ผู้ติดต่อเลข ${TX_T} มี ${nContacts} (คาด 1)`);
    chk("S2", NS === "" && p.length === 0, "TAX_INVOICE 1 · ไม่มี ABB · ผู้ติดต่อจากเลข · docId", FXB(NS + (p.join(" · ") || "ครบ")));
  }
  // ════════ S3 GL เท่ากัน ════════
  {
    const p: string[] = [];
    const jT = await jvOf([B.bT!.id]);
    const jP = await jvOf([B.bP!.id]);
    if (!jT.length || !jP.length) p.push(`JV bT ${jT.length} · bP ${jP.length}`);
    if (jT.length !== jP.length) p.push(`จำนวน JV ${jT.length} ≠ ${jP.length}`);
    if (!balanced(jT) || !balanced(jP)) p.push("JV ไม่สมดุล");
    const nT = netByCode(jT), nP = netByCode(jP);
    if (!sameMap(nT, nP)) p.push(`ต่อรหัส ${short(nT, 160)} ≠ ${short(nP, 160)}`);
    if (tiT) {
      const docJv = Number(await P.accountJournalEntry.count({ where: { tenantId: T, refType: "AccountDocument", refId: tiT.id } }).catch(() => -1));
      if (docJv !== 0) p.push(`JV ของเอกสาร TAX_INVOICE ${docJv} (คาด 0)`);
    } else p.push("ไม่มี TAX_INVOICE ของ bT");
    chk("S3", p.length === 0, "GL เท่าบิลไม่มีผู้ซื้อ", FXB(p.join(" · ") || `ครบ ${short(nT, 120)}`));
  }
  // ════════ S4 event + เล่นซ้ำ + ไม่ผูกสมุด ════════
  {
    const p: string[] = [];
    const ev = await events(EV_ISSUED, (pl) => pl.saleId === B.bT!.id);
    if (ev.length !== 1) p.push(`${EV_ISSUED} ${ev.length} แถว (คาด 1)`);
    else {
      if (!tiT || ev[0].payload?.docId !== tiT.id) p.push(`payload.docId ${short(ev[0].payload?.docId, 30)}`);
      if (ev[0].status !== "DONE") p.push(`สถานะ ${ev[0].status} ${short(ev[0].lastError ?? "", 50)}`);
    }
    const paidEvt = (await events("pos.sale.paid", (pl) => pl.saleId === B.bT!.id))[0];
    const h = consMod?.consumers?.["pos.sale.paid"];
    const jv0 = (await jvOf([B.bT!.id])).length;
    const d0 = (await saleTax(B.bT!.id)).docId;
    if (!paidEvt) p.push("ไม่พบ event pos.sale.paid ของ bT");
    else if (typeof h !== "function") p.push("ไม่มี consumers[pos.sale.paid]");
    else
      for (let i = 0; i < 2; i++)
        try {
          await h(paidEvt);
        } catch (e) {
          p.push(`เล่นซ้ำ ${i + 1} throw ${(e as Error).message.slice(0, 50)}`);
        }
    await drain();
    if ((await docsOf(B.bT!.id, "TAX_INVOICE")).length !== 1) p.push("เล่นซ้ำแล้ว TAX_INVOICE ≠ 1");
    if ((await docsOf(B.bT!.id, "TAX_INVOICE_ABB")).length !== 0) p.push("เล่นซ้ำแล้วมี ABB");
    if ((await events(EV_ISSUED, (pl) => pl.saleId === B.bT!.id)).length !== 1) p.push("เล่นซ้ำแล้ว event ≠ 1");
    if ((await jvOf([B.bT!.id])).length !== jv0) p.push("เล่นซ้ำแล้ว JV เพิ่ม");
    if ((await saleTax(B.bT!.id)).docId !== d0) p.push("เล่นซ้ำแล้ว taxInvoiceDocId เปลี่ยน");
    const h2 = consMod?.consumers?.[EV_ISSUED];
    if (typeof h2 !== "function") p.push(`ไม่มี consumers[${EV_ISSUED}]`);
    else if (ev[0])
      for (let i = 0; i < 2; i++)
        try {
          await h2(ev[0]);
        } catch (e) {
          p.push(`${EV_ISSUED} ×${i + 1} throw ${(e as Error).message.slice(0, 50)}`);
        }
    // ไม่ผูกสมุด
    const tn = await saleTax(B.bTN!.id);
    if (tn.docId !== null) p.push(`bTN taxInvoiceDocId ${tn.docId} (คาด null)`);
    const nDocs = Number(await P.accountDocument.count({ where: { tenantId: T, refType: "PosSale", refId: B.bTN!.id || "x" } }).catch(() => -1));
    if (nDocs !== 0) p.push(`bTN เอกสาร ${nDocs}`);
    if ((await events(EV_ISSUED, (pl) => pl.saleId === B.bTN!.id)).length !== 0) p.push("bTN มี event");
    chk("S4", NS === "" && p.length === 0, "event 1 DONE · เล่นซ้ำไม่เพิ่ม · ไม่ผูกสมุดไม่มีเอกสาร", FXB(NS + (p.join(" · ") || "ครบ")));
  }

  // ════════ S5 ตอนชำระแต่ออกใบกำกับไม่ได้ (ORACLE-EDIT · follow-up 3) ════════
  {
    const p: string[] = [];
    const bn = B.bTN!;
    if (!refused(bn.res, "NOT_ELIGIBLE")) p.push(`POS ไม่ผูกสมุด + ผู้ซื้อ → ${codeOf(bn.res)}`);
    else if (!THAI.test(String(bn.res.message ?? ""))) p.push("message ไม่ใช่ไทย");
    if (bn.id) p.push(`มีบิล ${bn.id}`);
    if (bn.key && Number(await P.posSale.count({ where: { tenantId: T, idempotencyKey: { endsWith: bn.key } } }).catch(() => -1)) !== 0) p.push("มีบิลของคีย์");
    // ไม่มีบิล ⇒ ไม่มี outbox ของบิล (outbox เขียนใน tx เดียวกับบิล) · ไม่มี event ใบกำกับของ POS-N
    if ((await events(EV_ISSUED, () => true)).some((e) => e.systemId === S.POSN)) p.push("มี event ใบกำกับของ POS-N");
    chk("S5", NS === "" && p.length === 0, "NOT_ELIGIBLE ไทย · ไม่มีบิล/outbox", FXB(NS + (p.join(" · ") || "ครบ")));
  }

  // ─── ย้ายเวลา ───
  const redate = async (id: string, when: Date, alsoAbb = false) => {
    if (!id) return;
    await P.posSale.update({ where: { id }, data: { createdAt: when, paidAt: when } }).catch((e: Error) => console.log(`  ⚠️  ย้ายเวลา ${id}: ${e.message.slice(0, 60)}`));
    if (alsoAbb) await P.accountDocument.updateMany({ where: { tenantId: T, docType: "TAX_INVOICE_ABB", refType: "PosSale", refId: id }, data: { issueDate: when } }).catch(() => {});
  };
  const L2D = new Date(Date.now() - 2 * DAY);
  L2D.setMilliseconds(0);
  await redate(B.bL!.id, L2D, true);
  await redate(B.bL8!.id, new Date(Date.now() - 8 * DAY), true);
  await redate(B.bL6!.id, new Date(Date.now() - 6 * DAY), true);
  let voidErr = "";
  if (B.bVoid!.id) {
    const r = await call(svc, "voidSale", T, U.A, B.bVoid!.id);
    if (r?.ok === false) voidErr = `voidSale ${codeOf(r)} ${short(r.message, 60)}`;
    await drain();
  }
  const issue = (ctx: Any, actor: Any, input: Any, label: string) => call(M.issue, "issueFullTaxInvoice", ctx, actor, input).then((r) => keep(label, r));
  const NI = NEED([M.issue, "issueFullTaxInvoice"]) + NCOL("snap", "docId", "sup");

  // ════════ L1 ออกทีหลัง ════════
  let tiL: Any = null;
  let profileIdAfterS = "";
  if (PBP && C.C1) profileIdAfterS = String((await PBP.findFirst({ where: { tenantId: T, customerId: C.C1.id } }).catch(() => null))?.id ?? "");
  {
    const p: string[] = [];
    const abb0 = await abbOf(B.bL!.id);
    const jv0 = netByCode(await jvOf([B.bL!.id]));
    const jvAll0 = Number(await P.accountJournalEntry.count({ where: { tenantId: T } }).catch(() => -1));
    if (!abb0) p.push("(ข้อมูล) bL ไม่มี ABB");
    const r = await issue(ctxOf("A"), owner, { saleId: B.bL!.id, buyer: { ...BUY_L }, rememberBuyer: true }, "issue bL");
    if (r?.ok !== true || typeof r.docId !== "string") p.push(`issue → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    const tis = await docsOf(B.bL!.id, "TAX_INVOICE");
    tiL = tis[0] ?? null;
    if (tis.length !== 1) p.push(`TAX_INVOICE ${tis.length} (คาด 1)`);
    if (tiL && abb0) {
      if (r?.docId !== tiL.id) p.push(`docId ${short(r?.docId, 30)} ≠ เอกสาร`);
      if (r?.docNo !== tiL.docNo) p.push(`docNo ${short(r?.docNo, 30)} ≠ ${tiL.docNo}`);
      if (!/^TX/.test(String(tiL.docNo ?? "")) || tiL.docNo === abb0.docNo) p.push(`docNo ${tiL.docNo} (คาด ชุด TX ≠ ${abb0.docNo})`);
      if (tiL.sourceDocId !== abb0.id) p.push(`sourceDocId ${tiL.sourceDocId} (คาด ABB)`);
      for (const k of ["subTotal", "vatAmount", "grandTotal"]) if (tiL[k] !== abb0[k]) p.push(`${k} ${tiL[k]} ≠ ABB ${abb0[k]}`);
      if (new Date(tiL.issueDate).getTime() !== new Date(abb0.issueDate).getTime()) p.push(`issueDate ${short(tiL.issueDate, 30)} ≠ ABB ${short(abb0.issueDate, 30)} (CD2)`);
      const la = (abb0.lines ?? []) as Any[], lt = (tiL.lines ?? []) as Any[];
      if (la.length !== lt.length || sum(la.map((l) => l.amount)) !== sum(lt.map((l) => l.amount)) || la.some((l, i) => l.description !== lt[i]?.description)) p.push(`บรรทัด ${lt.length}/${sum(lt.map((l) => l.amount))} ≠ ABB ${la.length}/${sum(la.map((l) => l.amount))}`);
      const abb1 = await P.accountDocument.findUnique({ where: { id: abb0.id } }).catch(() => null);
      if (abb1?.status !== "CANCELLED") p.push(`ABB สถานะ ${abb1?.status} (คาด CANCELLED)`);
      const sup = await supOf(abb0.id);
      if (sup !== tiL.id) p.push(`ABB.supersededByDocId ${short(sup, 30)} (คาด ${tiL.id})`);
      const ct = await contactOf(tiL.contactId);
      if (!ct || ct.taxId !== TX_L || ct.branchCode !== "00001") p.push(`ผู้ติดต่อ ${short([ct?.taxId, ct?.branchCode], 40)}`);
    }
    if ((await liveDocs(B.bL!.id)) !== 1) p.push(`เอกสารมีผล ${await liveDocs(B.bL!.id)} (คาด 1 — CD1)`);
    if (!sameMap(netByCode(await jvOf([B.bL!.id])), jv0)) p.push("GL ของบิลเปลี่ยน");
    if (Number(await P.accountJournalEntry.count({ where: { tenantId: T } }).catch(() => -2)) !== jvAll0) p.push("มี JV ใหม่ในร้าน");
    const st = await saleTax(B.bL!.id);
    snapOk(st.snap, { ...BUY_L, source: "MANUAL" }, p, "bL");
    if (!tiL || st.docId !== tiL.id) p.push(`taxInvoiceDocId ${st.docId}`);
    const au = await audits(AUDIT_ISSUED, (a) => a.targetId === B.bL!.id);
    if (au.length !== 1) p.push(`audit ${AUDIT_ISSUED} ${au.length} (คาด 1)`);
    chk("L1", NI === "" && p.length === 0, "ABB superseded · TAX_INVOICE ยอด/วันที่เดิม · GL เดิม · snapshot · audit", FXB(NI + (p.join(" · ") || "ครบ")));
  }
  // ════════ L2 idempotent / ALREADY_ISSUED ════════
  {
    const p: string[] = [];
    const r = await issue(ctxOf("A"), owner, { saleId: B.bL!.id, buyer: { ...BUY_L } }, "issue bL ซ้ำ");
    if (r?.ok !== true || !tiL || r.docId !== tiL.id) p.push(`ซ้ำ → ${codeOf(r)} ${short(r?.docId, 30)} (คาด ok ${tiL?.id})`);
    if ((await docsOf(B.bL!.id, "TAX_INVOICE")).length !== 1) p.push("ซ้ำแล้วเอกสารเพิ่ม");
    if ((await audits(AUDIT_ISSUED, (a) => a.targetId === B.bL!.id)).length !== 1) p.push("ซ้ำแล้ว audit เพิ่ม");
    const snap0 = short((await saleTax(B.bL!.id)).snap, 2000);
    const r2 = await issue(ctxOf("A"), owner, { saleId: B.bL!.id, buyer: { ...BUY_L2 } }, "issue bL ผู้ซื้ออื่น");
    if (!refused(r2, "ALREADY_ISSUED")) p.push(`ผู้ซื้ออื่น → ${codeOf(r2)}`);
    if (short((await saleTax(B.bL!.id)).snap, 2000) !== snap0) p.push("snapshot เปลี่ยน (R1 immutable)");
    if ((await docsOf(B.bL!.id, "TAX_INVOICE")).length !== 1) p.push("ผู้ซื้ออื่นแล้วเอกสารเพิ่ม");
    chk("L2", NI === "" && p.length === 0, "ซ้ำ = ok เดิม · ผู้ซื้ออื่น ALREADY_ISSUED", FXB(NI + (p.join(" · ") || "ครบ")));
  }
  // ════════ L3 7 วัน ════════
  {
    const p: string[] = [];
    const r8 = await issue(ctxOf("A"), owner, { saleId: B.bL8!.id, buyer: { ...BUY_L2 } }, "issue 8 วัน");
    if (!refused(r8, "TOO_LATE")) p.push(`8 วัน → ${codeOf(r8)}`);
    const s8 = await saleTax(B.bL8!.id);
    if (COL.snap && (s8.snap !== null || s8.docId !== null)) p.push("8 วัน มี snapshot/docId");
    if ((await docsOf(B.bL8!.id, "TAX_INVOICE")).length) p.push("8 วัน มีเอกสาร");
    if ((await liveDocs(B.bL8!.id)) !== 1) p.push("8 วัน ABB ไม่มีผลแล้ว");
    const r6 = await issue(ctxOf("A"), owner, { saleId: B.bL6!.id, buyer: { ...BUY_L2 } }, "issue 6 วัน");
    if (r6?.ok !== true) p.push(`6 วัน → ${codeOf(r6)} ${short(r6?.message ?? "", 50)}`);
    if ((await docsOf(B.bL6!.id, "TAX_INVOICE")).length !== 1) p.push("6 วัน ไม่มี TAX_INVOICE");
    chk("L3", NI === "" && p.length === 0, "8 วัน TOO_LATE · 6 วัน ออกได้", FXB(NI + (p.join(" · ") || "ครบ")));
  }
  // ════════ L4 ALREADY_ISSUED (ตอนชำระ) · SALE_VOIDED ════════
  {
    const p: string[] = [];
    const r1 = await issue(ctxOf("A"), owner, { saleId: B.bT!.id, buyer: { ...BUY_L2 } }, "issue bT ผู้ซื้ออื่น");
    if (!refused(r1, "ALREADY_ISSUED")) p.push(`bT (ออกตอนชำระ) → ${codeOf(r1)}`);
    if ((await docsOf(B.bT!.id, "TAX_INVOICE")).length !== 1) p.push("bT เอกสารเปลี่ยน");
    const r2 = await issue(ctxOf("A"), owner, { saleId: B.bVoid!.id, buyer: { ...BUY_L2 } }, "issue bVoid");
    if (!refused(r2, "SALE_VOIDED")) p.push(`บิล VOIDED → ${codeOf(r2)}`);
    if ((await docsOf(B.bVoid!.id, "TAX_INVOICE")).length) p.push("บิล VOIDED มี TAX_INVOICE");
    if ((await row(B.bVoid!.id))?.status !== "VOIDED") p.push(`(ข้อมูล) bVoid สถานะ ${(await row(B.bVoid!.id))?.status} ${voidErr}`);
    chk("L4", NI === "" && p.length === 0, "ALREADY_ISSUED · SALE_VOIDED", FXB(NI + (p.join(" · ") || "ครบ")));
  }
  // ════════ L5 NOT_ELIGIBLE · ACCOUNT_PENDING · สิทธิ์ ════════
  {
    const p: string[] = [];
    const rW = await issue(ctxOf("N"), owner, { saleId: B.bW!.id, buyer: { ...BUY_L2 } }, "issue POS ไม่ผูก");
    if (!refused(rW, "NOT_ELIGIBLE")) p.push(`ไม่ผูกสมุด → ${codeOf(rW)}`);
    const rP = await issue(ctxOf("A"), owner, { saleId: B.bPend!.id, buyer: { ...BUY_L2 } }, "issue ไม่มี ABB");
    if (!refused(rP, "ACCOUNT_PENDING")) p.push(`ไม่มี ABB → ${codeOf(rP)}`);
    const sp = await saleTax(B.bPend!.id);
    if (COL.snap && (sp.snap !== null || sp.docId !== null)) p.push("ACCOUNT_PENDING เขียน snapshot/docId");
    if ((await docsOf(B.bPend!.id, "TAX_INVOICE")).length) p.push("ACCOUNT_PENDING มีเอกสาร");
    const rD = await issue(ctxOf("A"), staffRead, { saleId: B.bPend!.id, buyer: { ...BUY_L2 } }, "issue staff read");
    if (!refused(rD, "PERMISSION_DENIED")) p.push(`พนักงาน pos.sale.read → ${codeOf(rD)}`);
    const rS = await issue(ctxOf("A"), staffIssue, { saleId: B.bPend!.id, buyer: { ...BUY_L2 } }, "issue staff issue");
    if (!refused(rS, "ACCOUNT_PENDING")) p.push(`พนักงาน +${PERM_ISSUE} → ${codeOf(rS)} (คาด ผ่านสิทธิ์ = ACCOUNT_PENDING)`);
    const rM = await issue(ctxOf("A"), manager, { saleId: B.bPend!.id, buyer: { ...BUY_L2 } }, "issue manager");
    if (!refused(rM, "ACCOUNT_PENDING")) p.push(`MANAGER → ${codeOf(rM)} (คาด ACCOUNT_PENDING)`);
    const rX = await issue(ctxOf("A"), owner, { saleId: `cqc113nosale${RAND}xx`, buyer: { ...BUY_L2 } }, "issue id มั่ว");
    if (!refused(rX, "SALE_NOT_FOUND")) p.push(`id มั่ว → ${codeOf(rX)}`);
    const rT = await issue(ctxOf("A"), owner, { saleId: B.bAbb!.id, buyer: { ...BUY_L2, taxId: badCheck(TX_L2) } }, "issue taxId ผิด");
    if (!refused(rT, "TAX_ID_INVALID")) p.push(`taxId ผิด → ${codeOf(rT)}`);
    if ((await docsOf(B.bAbb!.id, "TAX_INVOICE")).length) p.push("taxId ผิดแล้วมีเอกสาร");
    chk("L5", NI === "" && p.length === 0, "NOT_ELIGIBLE · ACCOUNT_PENDING · PERMISSION_DENIED · ผ่านสิทธิ์ 2 แบบ · SALE_NOT_FOUND · TAX_ID_INVALID", FXB(NI + (p.join(" · ") || "ครบ")));
  }

  // ════════ L6 คืนเงินบางส่วนแล้วออกเต็มรูป → HAS_REFUNDS (ORACLE-EDIT · มติผู้คุมงาน 15) ════════
  {
    const p: string[] = [];
    const b6 = B.bR6!;
    const lineId = b6.L["ช้อน P113"] ?? "";
    const rf = b6.id
      ? await call(refundMod, "refundSale", ctxOf("A", DEV1), owner, { saleId: b6.id, lines: [{ lineId, qty: 1 }], payMethods: [{ type: "CASH", amountSatang: 1500 }], reasonCode: "CHANGED_MIND", reason: "ลูกค้าเปลี่ยนใจ", idempotencyKey: newKey("r6") })
      : { ok: false, code: "NO_SALE" };
    if (rf?.ok !== true) p.push(`(ข้อมูล) คืน bR6: ${codeOf(rf)} ${short(rf?.message ?? "", 60)}`);
    await drain();
    const r = await issue(ctxOf("A"), owner, { saleId: b6.id, buyer: { ...BUY_L2 } }, "issue หลังคืนบางส่วน");
    if (!refused(r, "HAS_REFUNDS")) p.push(`หลังคืนบางส่วน → ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
    const st = await saleTax(b6.id);
    if (COL.snap && (st.snap !== null || st.docId !== null)) p.push("มี snapshot/docId");
    if ((await docsOf(b6.id, "TAX_INVOICE")).length) p.push("มี TAX_INVOICE");
    if ((await liveDocs(b6.id)) !== 1 || (await abbOf(b6.id))?.status === "CANCELLED") p.push("ABB ไม่มีผลแล้ว");
    if ((await audits(AUDIT_ISSUED, (a) => a.targetId === b6.id)).length) p.push(`มี audit ${AUDIT_ISSUED}`);
    chk("L6", NI === "" && p.length === 0, "คืนบางส่วนแล้ว = HAS_REFUNDS ไม่เขียนอะไร", FXB(NI + (p.join(" · ") || "ครบ")));
  }

  // ════════ Q จากคำขอ P1.11 ════════
  const reqOf = async (k: string, input: Any): Promise<string> => {
    const tok = await tokenOf(B[k]!.id);
    const r = await call(pubMod, "requestFullTaxInvoice", tok, input);
    if (r?.ok !== true) console.log(`  ⚠️  คำขอ ${k}: ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    return r?.ok === true ? String(r.requestId) : "";
  };
  const rqQ = await reqOf("bQ", { ...REQ_Q });
  const rqQ2 = await reqOf("bQ2", { ...REQ_Q });
  const rqQ3 = await reqOf("bQ3", { ...REQ_Q });
  await drain();
  const NQ = NEED([M.fromReq, "issueFromTaxInvoiceRequest"], [M.reject, "rejectTaxInvoiceRequest"]) + NCOL("snap", "docId", "sup") + (rqQ && rqQ2 && rqQ3 ? "" : "คำขอตั้งต้นล้ม · ");
  {
    const p: string[] = [];
    const abb0 = await abbOf(B.bQ!.id);
    const r = keep("fromReq", await call(M.fromReq, "issueFromTaxInvoiceRequest", ctxOf("A"), owner, { requestId: rqQ }));
    if (r?.ok !== true || typeof r.docId !== "string") p.push(`issueFromTaxInvoiceRequest → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    const ti = await tiOf(B.bQ!.id);
    if (!ti) p.push("ไม่มี TAX_INVOICE");
    const q = await reqRow(rqQ);
    if (q?.status !== "ISSUED") p.push(`คำขอ ${q?.status} (คาด ISSUED)`);
    if (!ti || q?.accountDocId !== ti.id) p.push(`accountDocId ${short(q?.accountDocId, 30)} (คาด ${ti?.id} · มติ 8)`);
    const st = await saleTax(B.bQ!.id);
    snapOk(st.snap, { kind: "JURISTIC", ...REQ_Q }, p, "bQ");
    if (ti) {
      const ct = await contactOf(ti.contactId);
      if (!ct || ct.taxId !== TX_Q || ct.branchCode !== "00002") p.push(`ผู้ติดต่อ ${short([ct?.taxId, ct?.branchCode], 40)}`);
      if (abb0 && (await supOf(abb0.id)) !== ti.id) p.push("ABB ไม่ superseded");
      if (ti.grandTotal !== 5100) p.push(`grandTotal ${ti.grandTotal}`);
    }
    if ((await audits(AUDIT_ISSUED, (a) => a.targetId === B.bQ!.id)).length !== 1) p.push(`audit ${AUDIT_ISSUED} ≠ 1`);
    chk("Q1", NQ === "" && p.length === 0, "คำขอ ISSUED + accountDocId · ผู้ซื้อจากคำขอ · ABB superseded", FXB(NQ + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const rv = keep("reject ว่าง", await call(M.reject, "rejectTaxInvoiceRequest", ctxOf("A"), owner, { requestId: rqQ2, reason: "   " }));
    if (!refused(rv, "VALIDATION")) p.push(`เหตุผลว่าง → ${codeOf(rv)}`);
    const r = keep("reject", await call(M.reject, "rejectTaxInvoiceRequest", ctxOf("A"), owner, { requestId: rqQ2, reason: "เลขผู้เสียภาษีไม่ตรงกับชื่อบริษัท" }));
    if (r?.ok !== true) p.push(`reject → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    const q = await reqRow(rqQ2);
    if (q?.status !== "REJECTED") p.push(`คำขอ ${q?.status} (คาด REJECTED)`);
    const au = await audits(AUDIT_REJECTED, (a) => a.targetId === rqQ2 || a.targetId === B.bQ2!.id);
    if (au.length !== 1) p.push(`audit ${AUDIT_REJECTED} ${au.length} (คาด 1)`);
    else if (!short(au[0].after, 2000).includes("เลขผู้เสียภาษีไม่ตรงกับชื่อบริษัท")) p.push("audit ไม่มีเหตุผล");
    if ((await docsOf(B.bQ2!.id, "TAX_INVOICE")).length) p.push("มี TAX_INVOICE");
    if ((await liveDocs(B.bQ2!.id)) !== 1 || (await abbOf(B.bQ2!.id))?.status === "CANCELLED") p.push("ABB ไม่มีผลแล้ว");
    chk("Q2", NQ === "" && p.length === 0, "REJECTED + audit · ไม่มีเอกสาร · เหตุผลว่าง VALIDATION", FXB(NQ + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const r1 = keep("fromReq สาขาอื่น", await call(M.fromReq, "issueFromTaxInvoiceRequest", ctxOf("A2"), owner, { requestId: rqQ3 }));
    if (!refused(r1, "NOT_FOUND")) p.push(`issue สาขา A2 → ${codeOf(r1)}`);
    const r2 = keep("reject สาขาอื่น", await call(M.reject, "rejectTaxInvoiceRequest", ctxOf("A2"), owner, { requestId: rqQ3, reason: "ทดสอบข้ามสาขา" }));
    if (!refused(r2, "NOT_FOUND")) p.push(`reject สาขา A2 → ${codeOf(r2)}`);
    const r3 = keep("fromReq id มั่ว", await call(M.fromReq, "issueFromTaxInvoiceRequest", ctxOf("A"), owner, { requestId: `cqc113noreq${RAND}xx` }));
    if (!refused(r3, "NOT_FOUND")) p.push(`requestId มั่ว → ${codeOf(r3)}`);
    if ((await reqRow(rqQ3))?.status !== "REQUESTED") p.push(`คำขอ ${(await reqRow(rqQ3))?.status} (คาด REQUESTED)`);
    if ((await docsOf(B.bQ3!.id, "TAX_INVOICE")).length) p.push("มี TAX_INVOICE");
    chk("Q3", NQ === "" && p.length === 0, "ข้ามสาขา/มั่ว NOT_FOUND · คำขอไม่เปลี่ยน", FXB(NQ + (p.join(" · ") || "ครบ")));
  }

  // ════════ D ค้น DBD (stub เท่านั้น) ════════
  const NL = NEED([M.lookup, "lookupBuyerByTaxId"]);
  const stubCalls: string[] = [];
  const stubOf = (mode: "found" | "notFound" | "unavailable" | "throw" | "noKey") => ({
    lookup: async (taxId: string): Promise<Any> => {
      stubCalls.push(String(taxId));
      if (mode === "throw") throw new Error("stub ล่ม");
      if (mode === "notFound") return { ok: false, reason: DBD_REASON.notFound };
      if (mode === "unavailable") return { ok: false, reason: DBD_REASON.unavailable };
      if (mode === "noKey") return { ok: false, reason: DBD_REASON.noKey };
      return {
        ok: true,
        taxId,
        name: `บริษัท ดีบีดีคิวซี ${RAND} จำกัด`,
        nameEn: `DBD QC ${RAND} CO., LTD.`,
        address: { addressLine: "5/5 ถ.วิทยุ", subdistrict: "ลุมพินี", district: "ปทุมวัน", province: "กรุงเทพมหานคร", postcode: "10330" },
        status: "ยังดำเนินกิจการอยู่",
      };
    },
  });
  const look = (unit: string, taxId: string, deps: Any, label: string) => call(M.lookup, "lookupBuyerByTaxId", ctxOf(unit), owner, { taxId }, deps ? { deps } : undefined).then((r) => keep(label, r));
  const savedKey = process.env.DBD_API_KEY;
  {
    const p: string[] = [];
    process.env.DBD_API_KEY = "qc-p113-fake-key-never-sent";
    const a0 = (await audits(AUDIT_DBD)).length;
    stubCalls.length = 0;
    const r1 = await look("A", TX_D, stubOf("found"), "dbd พบ");
    if (stubCalls.length !== 1 || stubCalls[0] !== TX_D) p.push(`stub ถูกเรียก ${short(stubCalls, 60)} (คาด [${TX_D}])`);
    const b = r1?.ok === true && r1.found === true ? r1.buyer : null;
    if (!b) p.push(`พบ → ${codeOf(r1)} found ${short(r1?.found, 10)}`);
    else {
      if (b.kind !== "JURISTIC" || b.taxId !== TX_D || b.branchCode !== "00000" || b.name !== `บริษัท ดีบีดีคิวซี ${RAND} จำกัด` || b.status !== "ยังดำเนินกิจการอยู่") p.push(`buyer ${short(b, 160)}`);
      const addr = String(b.address ?? "");
      if (!addr.includes("5/5 ถ.วิทยุ") || !addr.includes("กรุงเทพมหานคร") || !addr.includes("10330")) p.push(`address ${short(addr, 80)}`);
    }
    stubCalls.length = 0;
    const r2 = await look("A", TX_D, stubOf("notFound"), "dbd ไม่พบ");
    if (r2?.ok !== true || r2.found !== false) p.push(`ไม่พบ → ${codeOf(r2)} ${short(r2, 60)}`);
    const r3 = await look("A", TX_D, stubOf("unavailable"), "dbd ล่ม");
    if (!refused(r3, "DBD_UNAVAILABLE")) p.push(`ล่ม → ${codeOf(r3)}`);
    const r4 = await look("A", TX_D, stubOf("throw"), "dbd throw");
    if (!refused(r4, "DBD_UNAVAILABLE")) p.push(`stub throw → ${codeOf(r4)}`);
    const au = (await audits(AUDIT_DBD)).slice(a0);
    if (au.length !== 4) p.push(`audit ${AUDIT_DBD} ${au.length} (คาด 4)`);
    for (const a of au) {
      const j = short({ before: a.before, after: a.after, targetId: a.targetId }, 100_000);
      if (j.includes(TX_D)) p.push("audit มีเลขดิบ");
      else if (!j.includes(maskOf(TX_D))) p.push(`audit ไม่มีเลขปิด ${maskOf(TX_D)}`);
    }
    chk("D1", NL === "" && p.length === 0, "พบ/ไม่พบ/ล่ม×2 · stub เลข 13 หลัก · audit ปิดเลข", FXB(NL + ([...new Set(p)].join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    delete process.env.DBD_API_KEY;
    const g0 = guardHits.length;
    const r1 = await look("A", TX_D, null, "dbd ไม่มีกุญแจ");
    if (!refused(r1, "DBD_NOT_CONFIGURED")) p.push(`ไม่มีกุญแจ → ${codeOf(r1)}`);
    if (guardHits.length !== g0) p.push(`แตะเครือข่าย ${guardHits.length - g0} ครั้ง`);
    const r2 = await look("A", TX_D, stubOf("noKey"), "dbd stub noKey");
    if (!refused(r2, "DBD_NOT_CONFIGURED")) p.push(`stub noKey → ${codeOf(r2)}`);
    stubCalls.length = 0;
    const r3 = await look("A", badCheck(TX_D), stubOf("found"), "dbd taxId ผิด");
    if (!refused(r3, "TAX_ID_INVALID")) p.push(`taxId ผิด → ${codeOf(r3)}`);
    if (stubCalls.length) p.push("taxId ผิดแต่ stub ถูกเรียก");
    chk("D2", NL === "" && p.length === 0, "DBD_NOT_CONFIGURED ×2 ไม่แตะเครือข่าย · TAX_ID_INVALID", FXB(NL + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    process.env.DBD_API_KEY = "qc-p113-fake-key-never-sent";
    stubCalls.length = 0;
    let firstBad = "";
    for (let i = 1; i <= 30; i++) {
      const r = await look("A2", TX_D, stubOf("found"), `dbd A2 #${i}`);
      if (r?.ok !== true && !firstBad) firstBad = `#${i} → ${codeOf(r)}`;
    }
    if (firstBad) p.push(`ครั้งที่ 1–30 ไม่ผ่าน (${firstBad}) — นับต่อร้าน?`);
    const n30 = stubCalls.length;
    const r31 = await look("A2", TX_D, stubOf("found"), "dbd A2 #31");
    if (!refused(r31, "RATE_LIMITED")) p.push(`ครั้งที่ 31 → ${codeOf(r31)}`);
    if (stubCalls.length !== n30) p.push("ครั้งที่ 31 เรียก stub");
    const rA = await look("A", TX_D, stubOf("found"), "dbd A หลัง A2 เต็ม");
    if (rA?.ok !== true) p.push(`สาขา A → ${codeOf(rA)} (คาด ผ่าน · ต่อสาขา)`);
    await P.auditLog.updateMany({ where: { tenantId: T, action: AUDIT_DBD }, data: { createdAt: new Date(Date.now() - 2 * MIN) } }).catch((e: Error) => p.push(`ย้ายเวลา: ${e.message.slice(0, 50)}`));
    const rB = await look("A2", TX_D, stubOf("found"), "dbd A2 หลัง 2 นาที");
    if (rB?.ok !== true) p.push(`A2 หลัง 2 นาที → ${codeOf(rB)}`);
    chk("D3", NL === "" && p.length === 0, "30 ผ่าน · 31 RATE_LIMITED · ต่อสาขา · หมดนาทีผ่าน", FXB(NL + (p.join(" · ") || "ครบ")));
  }
  if (savedKey === undefined) delete process.env.DBD_API_KEY;
  else process.env.DBD_API_KEY = savedKey;

  // ════════ M จำผู้ซื้อ ════════
  const NM = NEED([PBP, "PosBuyerProfile"], [M.profile, "buyerProfileForMember"]);
  {
    const p: string[] = [];
    const rows = PBP ? ((await PBP.findMany({ where: { tenantId: T } }).catch(() => [])) as Any[]) : [];
    const mine = rows.filter((r) => r.customerId === C.C1?.id);
    if (mine.length !== 1) p.push(`โปรไฟล์ C1 ${mine.length} แถว (คาด 1)`);
    if (rows.length !== 1) p.push(`โปรไฟล์ทั้งร้าน ${rows.length} (คาด 1 — บิลไม่มีสมาชิกไม่สร้าง)`);
    if (!profileIdAfterS) p.push("หลังชำระ (bT rememberBuyer) ไม่มีโปรไฟล์");
    const x = mine[0];
    if (x) {
      if (profileIdAfterS && x.id !== profileIdAfterS) p.push("upsert สร้างแถวใหม่ (id เปลี่ยน)");
      for (const k of ["kind", "name", "taxId", "branchCode", "address"]) if (x[k] !== (BUY_L as Any)[k]) p.push(`${k} ${short(x[k], 30)} (คาด ${short((BUY_L as Any)[k], 30)} — ค่าใหม่จาก L1)`);
      if ((x.email ?? null) !== BUY_L.email) p.push(`email ${x.email}`);
    }
    const cu = C.C1 ? await P.customer.findUnique({ where: { id: C.C1.id } }).catch(() => null) : null;
    const cj = short(cu, 100_000);
    if (!cu || cu.name !== C.C1?.name || cu.phone !== C.C1?.phone) p.push("Customer ชื่อ/เบอร์เปลี่ยน");
    if ([TX_T, TX_L].some((t) => cj.includes(t))) p.push("Customer มีเลขผู้ซื้อ (R6 ห้าม)");
    chk("M1", NM === "" && p.length === 0, "1 แถว/สมาชิก · upsert id เดิม · Customer ไม่ถูกแตะ", FXB(NM + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const r = keep("profile C1", await call(M.profile, "buyerProfileForMember", ctxOf("A"), { memberId: C.C1?.id }));
    const pf = r?.ok === true ? r.profile : undefined;
    if (!isRecord(pf)) p.push(`C1 → ${codeOf(r)} ${short(pf, 60)}`);
    else for (const k of ["kind", "name", "taxId", "branchCode", "address"]) if (pf[k] !== (BUY_L as Any)[k]) p.push(`profile.${k} ${short(pf[k], 30)}`);
    const r2 = await call(M.profile, "buyerProfileForMember", ctxOf("A"), { memberId: C.C2?.id });
    if (r2?.ok !== true || r2.profile !== null) p.push(`C2 (ไม่มีโปรไฟล์) → ${codeOf(r2)} ${short(r2?.profile, 40)}`);
    const other = (await P.customer.findFirst({ where: { tenantId: TIDS[0] }, select: { id: true } }).catch(() => null))?.id;
    if (other) {
      const r3 = await call(M.profile, "buyerProfileForMember", ctxOf("A"), { memberId: other });
      if (!(r3?.ok === true && r3.profile === null) && !refused(r3, "NOT_FOUND")) p.push(`สมาชิกร้านอื่น → ${codeOf(r3)} ${short(r3?.profile, 40)}`);
    }
    chk("M2", NM === "" && p.length === 0, "prefill ตรง · ไม่มี = null · ร้านอื่นไม่รั่ว", FXB(NM + (p.join(" · ") || "ครบ")));
  }

  // ════════ P ตัวอ่าน (ก่อนคืนเงิน) ════════
  {
    const p: string[] = [];
    for (const [k, want] of [["bL", "ISSUED"], ["bT", "ISSUED"], ["bQ", "ISSUED"], ["bQ3", "REQUESTED"], ["bAbb", "AVAILABLE"]] as const) {
      const r = await call(pubMod, "publicReceipt", await tokenOf(B[k]!.id));
      const got = r?.ok === true ? r.receipt?.actions?.taxInvoice : codeOf(r);
      if (got !== want) p.push(`publicReceipt ${k} ${got} (คาด ${want})`);
    }
    const bd = async (k: string) => call(billsMod, "billDetail", ctxOf("A"), owner, { unitId: U.A, saleId: B[k]!.id });
    const dL = await bd("bL");
    const tL = dL?.ok === true ? dL.bill?.taxInvoice : undefined;
    if (!isRecord(tL) || tL.status !== "ISSUED" || !tiL || tL.docNo !== tiL.docNo || tL.buyerName !== BUY_L.name) p.push(`billDetail bL taxInvoice ${short(tL, 100)}`);
    if (!tiL || dL?.bill?.accounting?.docId !== tiL.id) p.push(`billDetail bL accounting.docId ${short(dL?.bill?.accounting?.docId, 30)} (คาด TAX_INVOICE)`);
    const t3 = (await bd("bQ3"))?.bill?.taxInvoice;
    if (!isRecord(t3) || t3.status !== "REQUESTED") p.push(`billDetail bQ3 ${short(t3, 60)}`);
    const tA = (await bd("bAbb"))?.bill?.taxInvoice;
    if (!isRecord(tA) || tA.status !== "NONE") p.push(`billDetail bAbb ${short(tA, 60)}`);
    chk("P1", p.length === 0, "publicReceipt ISSUED/REQUESTED/AVAILABLE · billDetail.taxInvoice + accounting", FXB(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const strip = (h: string) => h.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
    const render = (pl: Any): string => {
      const r = callSync(renderMod, "renderReceiptHtml", pl, { paper: "80", locale: "th" });
      return typeof r === "string" ? strip(r) : "";
    };
    for (const [k, ti] of [["bL", tiL], ["bT", tiT]] as const) {
      const r = await call(rcpMod, "receiptPayload", rctx("A"), owner, { saleId: B[k]!.id });
      const pl = r?.ok === true ? r.payload : null;
      if (!pl) {
        p.push(`${k} payload ${codeOf(r)}`);
        continue;
      }
      if (pl.kind !== FULL_KIND) p.push(`${k} kind ${pl.kind} (คาด ${FULL_KIND})`);
      if (!ti || pl.doc?.fullTaxInvoiceNo !== ti.docNo) p.push(`${k} doc.fullTaxInvoiceNo ${short(pl.doc?.fullTaxInvoiceNo, 30)} (คาด ${ti?.docNo})`);
      if (pl.footer?.fullTaxInvoiceHint !== false) p.push(`${k} footer.fullTaxInvoiceHint ${pl.footer?.fullTaxInvoiceHint}`);
      const txt = render(pl);
      if (!ti || !txt.includes(`${FULL_TEXT} ${ti.docNo}`)) p.push(`${k} ใบพิมพ์ไม่มี "${FULL_TEXT} ${ti?.docNo}"`);
      if (txt.includes(ABB_TITLE)) p.push(`${k} ใบพิมพ์ยังมีหัว ${ABB_TITLE}`);
    }
    const rc = await call(rcpMod, "receiptPayload", rctx("A"), owner, { saleId: B.bAbb!.id });
    const plc = rc?.ok === true ? rc.payload : null;
    if (!plc || plc.kind !== "TAX_INVOICE_ABB") p.push(`(ตัวควบคุม) bAbb kind ${plc?.kind ?? codeOf(rc)}`);
    else {
      const txt = render(plc);
      if (!txt.includes(ABB_TITLE) || txt.includes(FULL_TEXT)) p.push("(ตัวควบคุม) ใบพิมพ์ ABB ผิด");
    }
    chk("P2", p.length === 0, `kind ${FULL_KIND} · เลขใบกำกับบนสลิป · ABB ไม่เปลี่ยน`, FXB(p.join(" · ") || "ครบ"));
  }

  // ════════ R1 คืนเงินหลังใบเต็มรูป ════════
  {
    const p: string[] = [];
    const doRefund = async (k: string, lineName: string, pay: [string, number]): Promise<string> => {
      const lineId = B[k]!.L[lineName] ?? "";
      const req = { saleId: B[k]!.id, lines: [{ lineId, qty: 1 }], payMethods: [{ type: pay[0], amountSatang: pay[1] }], reasonCode: "CHANGED_MIND", reason: "ลูกค้าเปลี่ยนใจ", idempotencyKey: newKey("r") };
      const r = B[k]!.id ? await call(refundMod, "refundSale", ctxOf("A", DEV1), owner, req) : { ok: false, code: "NO_SALE" };
      if (r?.ok !== true) p.push(`(ข้อมูล) คืน ${k}: ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
      return r?.ok === true ? String(r.refund?.id ?? "") : "";
    };
    const rL = await doRefund("bL", "เสื้อ P113", ["PROMPTPAY", 10000]);
    const rT = await doRefund("bT", "ขนม P113", ["CASH", 5000]);
    const rA = await doRefund("bAbb", "แก้ว P113", ["CASH", 3300]);
    await drain();
    const cn = async (refundId: string): Promise<Any> => (refundId ? (await docsOf(refundId, "CREDIT_NOTE"))[0] ?? null : null);
    const [cL, cT, cA] = [await cn(rL), await cn(rT), await cn(rA)];
    if (!cL || !tiL || cL.sourceDocId !== tiL.id) p.push(`ใบลดหนี้ bL sourceDocId ${short(cL?.sourceDocId, 30)} (คาด TAX_INVOICE ${tiL?.id})`);
    if (cL && tiL && cL.contactId !== tiL.contactId) p.push("ใบลดหนี้ bL ผู้ติดต่อ ≠ TAX_INVOICE");
    if (!cT || !tiT || cT.sourceDocId !== tiT.id) p.push(`ใบลดหนี้ bT sourceDocId ${short(cT?.sourceDocId, 30)} (คาด ${tiT?.id})`);
    const abbA = await abbOf(B.bAbb!.id);
    if (!cA || !abbA || cA.sourceDocId !== abbA.id) p.push(`(ตัวควบคุม) ใบลดหนี้ bAbb sourceDocId ${short(cA?.sourceDocId, 30)} (คาด ABB)`);
    const ref = await call(accFacade, "posSaleAccountingRef", { tenantId: T, sourceSystemId: S.POSA, refId: B.bL!.id });
    if (!tiL || ref?.docId !== tiL.id) p.push(`posSaleAccountingRef bL ${short(ref, 60)} (คาด TAX_INVOICE)`);
    chk("R1", p.length === 0, "ใบลดหนี้อ้าง TAX_INVOICE · ABB ล้วนอ้าง ABB", FXB(p.join(" · ") || "ครบ"));
  }

  // ════════ E1 ปฏิเสธเป็นข้อมูล ════════
  {
    const p: string[] = [];
    const seen = new Set(dataRefusals.map(([, r]) => String(r.code)));
    const miss = ALL_CODES.filter((c) => !seen.has(c));
    if (miss.length) p.push(`ไม่พบ ${miss.join(",")}`);
    for (const [lbl, r] of dataRefusals) {
      if (r.threw) p.push(`${lbl}: throw (${r.code} ${short(r.message, 40)})`);
      else if (typeof r.message !== "string" || !r.message.trim()) p.push(`${lbl}: ไม่มี message`);
      else if (!THAI.test(r.message)) p.push(`${lbl}: message ไม่ใช่ไทย`);
    }
    chk("E1", p.length === 0, `${dataRefusals.length} คำปฏิเสธ · ครบ ${ALL_CODES.length} รหัส · ไทย · ไม่ throw`, p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || "ครบ");
  }
}

// ═════════════════════════ 6. คืนสภาพ — ลบร้านชั่วคราวทั้งร้าน ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; err: string };
async function wipeTenant(): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, err: "" };
  if (!T) return rep;
  try {
    const t = (await P.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, T)) as Any[];
    if (t.length && t[0].slug !== T_SLUG) {
      rep.err = `slug ไม่ตรง (${t[0].slug}) — ไม่ลบ`;
      return rep;
    }
  } catch (e) {
    rep.err = `อ่าน Tenant ไม่ได้: ${(e as Error).message.slice(0, 60)}`;
    return rep;
  }
  await drain();
  await sleep(300);
  const tables = ((await P.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
     WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
  )) as Any[]).map((r: Any) => String(r.t));
  rep.tables = tables.length;
  await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, T).catch(() => {});
  let pending = [...tables];
  for (let pass = 0; pass < 10 && pending.length; pass++) {
    const next: string[] = [];
    for (const tb of pending) {
      try {
        await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, T);
      } catch {
        next.push(tb);
      }
    }
    pending = next;
  }
  try {
    await P.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $2`, T, T_SLUG);
  } catch (e) {
    rep.err = `ลบ Tenant ไม่ได้: ${(e as Error).message.slice(0, 80)}`;
  }
  for (const tb of tables) {
    try {
      const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, T)) as Any[])[0]?.n ?? 0);
      if (n) rep.left[tb] = n;
    } catch {
      rep.left[tb] = -1;
    }
  }
  rep.tenantLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`, T)) as Any[])[0]?.n ?? 0);
  return rep;
}

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
let wipe: WipeReport = { tables: 0, left: {}, tenantLeft: 0, err: "" };
try {
  await runStatic();
  await runPure(sharedMod);
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  installFetchGuard(); // drain ก่อนลบร้านก็ต้องไม่แตะเครือข่าย
  try {
    wipe = await wipeTenant();
    const residue = Object.values(wipe.left).reduce((a, b) => a + Math.abs(b), 0) + wipe.tenantLeft;
    console.log(`  ลบร้านชั่วคราว ${T || "(ไม่ได้สร้าง)"}: ${wipe.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(wipe.left)} · Tenant ${wipe.tenantLeft}${wipe.err ? ` · ${wipe.err}` : ""}`);
  } catch (e) {
    wipe.err = `cleanup: ${(e as Error).message.slice(0, 200)}`;
    console.log(`💥 ${wipe.err}`);
  } finally {
    removeFetchGuard();
  }
}
await sleep(200);
const tempLeft = Object.entries(wipe.left).map(([k, v]) => `${k}:${v}`);
const countsAfter = await snapshotCounts();
const drift = Object.keys(countsBefore).filter((k) => countsBefore[k] !== countsAfter[k]).map((k) => `${k}:${countsBefore[k]}→${countsAfter[k]}`);
if (drift.length) console.log(`  ℹ️  ร้าน QC seed นับก่อน/หลังต่างกัน (ข้อมูล · อาจเป็น lane อื่น): ${drift.join(", ")}`);
/** แถวของรอบนี้ที่หลุดเข้าร้าน seed (ตัวตัดสิน Z1 — ไม่ไวต่อ lane อื่นที่เขียนพร้อมกัน) */
async function seedLeaks(): Promise<string[]> {
  const out: string[] = [];
  const n = async (lbl: string, f: () => Promise<unknown>) => {
    try {
      const v = Number(f ? await f() : 0);
      if (v) out.push(`${lbl}:${v}`);
    } catch (e) {
      out.push(`${lbl}:err ${(e as Error).message.slice(0, 40)}`);
    }
  };
  const since = new Date(RUN_START - MIN);
  const like = `%${RAND}%`;
  await n("posSale", () => P.posSale.count({ where: { tenantId: { in: TIDS }, idempotencyKey: { startsWith: `qc113-${RAND}` } } }));
  await n("posDevice", () => P.posDevice.count({ where: { tenantId: { in: TIDS }, deviceCode: { contains: `qc113${RAND}` } } }));
  if (MY_TAX_IDS.length) await n("accountContact", () => P.accountContact.count({ where: { tenantId: { in: TIDS }, taxId: { in: MY_TAX_IDS } } }));
  if (PBP && MY_TAX_IDS.length) await n("posBuyerProfile", () => PBP.count({ where: { tenantId: { in: TIDS }, taxId: { in: MY_TAX_IDS } } }));
  await n("auditLog", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = ANY($1::text[]) AND "createdAt" >= $2 AND (coalesce("after"::text,'') || coalesce("before"::text,'')) LIKE $3`, TIDS, since, like)) as Any[])[0]?.n);
  await n("outboxEvent", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND "createdAt" >= $2 AND "payload"::text LIKE $3`, TIDS, since, like)) as Any[])[0]?.n);
  return out;
}
const leaks = await seedLeaks();
chk("Z1", tempLeft.length === 0 && wipe.tenantLeft === 0 && !wipe.err && leaks.length === 0, "ร้านชั่วคราว 0 แถว · Tenant ถูกลบ · ร้าน seed ไม่มีแถวของรอบนี้",
  [tempLeft.length ? `ร้านชั่วคราวเหลือ ${tempLeft.join(", ")}` : `ร้านชั่วคราว 0 (${wipe.tables} ตาราง)`, wipe.tenantLeft ? "แถว Tenant ยังอยู่" : "", wipe.err, leaks.length ? `ร้าน seed มีแถวของรอบนี้ ${leaks.join(", ")}` : "ร้าน seed ไม่มีแถวของรอบนี้", drift.length ? `(ข้อมูล) นับต่าง ${drift.length} รายการ` : "นับเท่าเดิม"].filter(Boolean).join(" · "));
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, missing: skipReasons, guardHits: guardHits.length, residue: tempLeft.length + wipe.tenantLeft, leaks, drift })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P1.13 (S): จอ 15A · ลิ้นชักบิล "ออกใบกำกับเต็มรูป" · ลิงก์ 17A/บัญชี (P1.13U — visual ของผู้คุมงาน) · e-Tax (P3) ·
//   createSale ตรงจากโมดูลอื่นพร้อม taxInvoice (เพิ่มได้แต่ไม่บังคับใบนี้) · ออกเต็มรูปหลังคืนบางส่วน (ยอดเอกสาร — CONTROLLER-DECISION) ·
//   ชุดเงิน COMMON §7 (qc-pos-account · qc-account-cpa …) รันโดยผู้สร้างก่อน/หลัง (CD6)
