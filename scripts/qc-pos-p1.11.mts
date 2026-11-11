// QC — POS RUN ใบ P1.11: ใบเสร็จออนไลน์ /r/[token] · QR ในใบเสร็จ · ส่งใบเสร็จ LINE/อีเมล · แจ้งปัญหาบิล · ขอใบกำกับเต็มรูป (คำขอ) · รีวิวร้าน
//   เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ
// requires: pos-seed
//
// สัญญา: ledger/pos-briefs/pos-brief-P1.11.md §2 R1–R9 · §4 แผนข้อสอบ · §5 CD1–CD6 · pos-brief-COMMON · pos-brief-LANE-RULES
//        ต่อยอด: pos-P1.10.md "Contract for P1.10U" (receiptPayload · renderReceiptHtml · parseReceiptSettings) · pos-P1.8.md §4/§9 (refundSale) ·
//        pos-P1.16.md (voidSale(tenantId, unitId, saleId[, opts]))
//        โน้ต: ledger/wo-notes/pos-P1.11-oracle.md (ตารางชื่อ · ผังข้อมูลทดสอบ · ความคลาดเคลื่อน · CONTROLLER-DECISION · ผลแดงที่คาด)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้และลงทะเบียนในตารางชื่อของโน้ต — ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//   §3 (หน้าจอ /r/[token] · PayDone · ลิ้นชักบิล · 17A) = visual ของผู้คุมงาน — ไม่อยู่ในข้อสอบนี้ (ยกเว้นด่านสถิต R9 ของไฟล์ page)
//
// ของที่ใบ P1.11 ต้องส่ง (ย่อจาก brief §2 + ชื่อที่ข้อสอบตั้ง):
//   schema: PosSale.publicToken String? @unique · model PosReceiptIssue · model PosTaxInvoiceRequest (+ migration เพิ่มอย่างเดียว · scope.ts · pos-qc-env)
//   src/lib/modules/pos/public-receipt.ts: publicReceipt(token) · ensureReceiptToken(tenantId, saleId) · requestFullTaxInvoice(token, input) ·
//     submitReceiptReview(token, input)  (ข้อสอบหาชื่อในไฟล์ใดก็ได้ของ public-receipt.ts / receipt-issue.ts / receipt-send.ts)
//   src/lib/modules/pos/receipt-issue.ts: reportReceiptIssue(token, {message, contact?})
//   src/lib/modules/pos/receipt-send.ts: sendReceipt(ctx, actor, {saleId, via, email?}, opts?: {deps?: {line?, fetch?}})
//   src/lib/pos-receipt-bridges.ts (composition root — pos ห้าม import chat/kanban · fitness F2): onReceiptIssueReported(evt) → {posted, reason?, cardId?}
//   outbox-consumers.ts: "pos.receipt.issue_reported" · "pos.receipt.taxInvoiceRequested" (no-op) ห่อ withAutomation
//   receipt.ts: footer.qrEReceiptUrl = `${publicOrigin()}/r/<token>` เมื่อ qrEReceipt เปิด
//   actions: public-receipt-actions.ts (reportReceiptIssueAction · requestFullTaxInvoiceAction · submitReceiptReviewAction — รับ token เท่านั้น ·
//     ไม่อ่าน session) · sendReceiptAction (receipt-send-actions.ts หรือ receipt-actions.ts)
//
// ขอบเขต: ST สถิต · T โทเคน · P หน้าใบเสร็จสาธารณะ · Q QR · I แจ้งปัญหา · X ขอใบกำกับเต็มรูป · V รีวิว · S ส่งใบเสร็จ · D ปฏิเสธเป็นข้อมูล ·
//   NC ตัวควบคุมลบ · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p1.8/p1.16): SKIP เมื่อของ P1.11 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = รันเฉพาะข้อสถิต ST1–ST6 + NC (exit 1 ถ้าแดง)
//    ฐาน = QC4 เท่านั้น (ก่อนเขียนแถวแรกต้องเป็น host ep-frosty-lab) · ร้านชั่วคราว `qc-p111-<rand>` (ลบทั้งร้านใน finally · พิมพ์แถวค้าง = 0)
//    ร้าน QC ของ seed ไม่ถูกเขียน (ใช้แค่ userId เจ้าของ/แคชเชียร์เป็นผู้กระทำ) — Z2 นับแถว + ลายนิ้วมือก่อน/หลัง
//    🔴 ไม่มีเครือข่ายเลย: globalThis.fetch ถูกแทนด้วยตัวกั้น (ตอบ 503 + นับ) ตลอดช่วง DB · อีเมลส่งผ่าน deps.fetch ปลอม · LINE ผ่าน deps.line ปลอม ·
//       ทางจริงของ LINE (ไม่ฉีด) ใช้ได้เฉพาะกรณีปฏิเสธ (ร้านชั่วคราวไม่มี ChatChannelConnection ⇒ sendLineToParty ไม่แตะเครือข่าย)
//    🔴 เวลา: 7 วัน / 24 ชม. ทดสอบด้วยการย้าย paidAt/createdAt ผ่าน prisma (นับจากนาฬิกาตอนรัน) — ไม่มี sleep · ไม่ฮาร์ดโค้ดวันที่
//    โมดูล/โมเดลที่ยังไม่มีเข้าถึงแบบไดนามิก (`import(… as string)` + catch · `(prisma as any).posReceiptIssue?.…`) — next build ตรวจชนิด scripts/*.mts
//    ไม่ import lib/env แบบ static
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const SUITE = "qc-pos-p1.11";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · X1 idempotency/เล่นซ้ำ · X2 ข้ามขอบเขต/ความเป็นส่วนตัว · X3 สิทธิ์ · X4 เงิน · X5 ผลข้างเคียงครบทุกทาง · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P1.11-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "S", "[ตัวควบคุมบวก] facade ที่ใบนี้ต้องใช้มีอยู่จริงชื่อตรง: chat/party-bridge sendLineToParty · chat/push pushToContact · core/email sendEmailRich(msg, deps{fetch}) · kanban/links createCardFromExternal · member requestReview + submitReview · core/origin publicOrigin · point getBalance · pos receiptPayload voidSale refundSale submitRegisterSale openShift registerDevice"),
  D("ST2", "S", "[R1 R4 R5 CD5] schema: PosSale.publicToken String? @unique · model PosReceiptIssue (id tenantId unitId saleId message contact? status OPEN|RESOLVED kanbanCardId? createdAt) · model PosTaxInvoiceRequest (id tenantId unitId saleId name taxId branchCode address email? status REQUESTED|ISSUED|REJECTED accountDocId? createdAt)"),
  D("ST3", "S", "[CD5 F15.2] migration ที่แตะของใบนี้เป็นแบบเพิ่มอย่างเดียว: ALTER TABLE \"PosSale\" ADD COLUMN \"publicToken\" · CREATE TABLE/TYPE/INDEX · unique index บน PosSale(publicToken) · ไม่มี DROP/ALTER COLUMN/UPDATE/DELETE"),
  D("ST4", "S", "[R4 R5 CD5 COMMON-4] ลงทะเบียนครบ: core/scope.ts มี PosReceiptIssue + PosTaxInvoiceRequest · scripts/pos-qc-env.mts POS_MODELS มี posReceiptIssue + posTaxInvoiceRequest · outbox-consumers.ts มี \"pos.receipt.issue_reported\" และ \"pos.receipt.taxInvoiceRequested\" ห่อ withAutomation"),
  D("ST5", "S", "[R1 R3 R6 CD2 CD3 F2] ขอบเขตโมดูล: ไฟล์ใน modules/pos ไม่ import โมดูล chat/kanban · ไม่แตะ prisma memberReview/kanbanCard/chatContact ตรง · รีวิวผ่าน @/lib/modules/member · createCardFromExternal ถูกเรียกจากไฟล์นอก modules (composition root) · QR ใช้ publicOrigin ไม่ใช้ env.APP_URL · ตัวสร้างโทเคนใช้ randomBytes ไม่ใช้ Math.random"),
  D("ST6", "S", "[CD1 R9] public-receipt-actions.ts \"use server\" · export async function ล้วน · reportReceiptIssueAction requestFullTaxInvoiceAction submitReceiptReviewAction รับ token (ไม่มี saleId/tenantId/unitId/systemId ในไฟล์ · ไม่อ่าน session) + catch · sendReceiptAction เรียก sendReceipt + requireTenant + catch · หน้า src/app/r/[token]/page.tsx มี noindex · เรียก publicReceipt · ไม่อ่าน session"),
  // ── T โทเคน ──
  D("T1", "-", "[R1] บิลใหม่มี publicToken ตั้งแต่ใน tx ของ createSale ทั้งสองชนิด: หน้าขาย (submitRegisterSale) · createSale ตรง (sourceModule BOOKING) · ใบ REFUND ของ refundSale — ทุกใบไม่ null · บิลเก่าที่ใส่ผ่าน prisma = null (ตัวควบคุม)"),
  D("T2", "X1", "[R1] รูปแบบ 12 ตัว Crockford base32 ตัวใหญ่ /^[0-9A-HJKMNP-TV-Z]{12}$/ ทุกใบ · ไม่ซ้ำกัน · ไม่เปลี่ยนหลัง voidSale / refundSale · ensureReceiptToken บนบิลที่มีโทเคนแล้วคืนตัวเดิม"),
  D("T3", "X1", "[R1] ensureReceiptToken(tenantId, saleId) บนบิลเก่า (ไม่มีโทเคน): คืนโทเคนรูปแบบถูก = ค่าใน DB · เรียกซ้ำได้ตัวเดิม · id มั่ว → null · บิลของร้านนี้แต่ส่ง tenantId ร้านอื่น → null และไม่เขียนแถว"),
  // ── P หน้าใบเสร็จสาธารณะ ──
  D("P1", "X4", "[R2] publicReceipt(token) บิล VAT + สมาชิก = {ok:true, receipt} ตรง receiptPayload ของบิลเดียวกัน: shop.name · branchLabel (ชื่อสาขา) · receiptNo · abbNo = เลขเอกสาร ABB · paidAt · status PAID · refundedSatang 0 · lines (ชื่อ/จำนวน/ยอด/ตัวเลือก) · discountSatang = PosSale.discountSatang · Σบรรทัด − ส่วนลด = ยอดสุทธิ · vat {rateBp 700, satang, included true} · payments [{method, satang}] · points {earned, balance (point.getBalance)} · actions {taxInvoice AVAILABLE, review true, report true}"),
  D("P2", "X2", "[R2 R9] ไม่มีข้อมูลส่วนตัว: ไม่มีคีย์ memberId/customerId/phone/email/cashierName/deviceId/tenantId/unitId/saleId/partyId และไม่มีค่า ชื่อ/เบอร์/อีเมลสมาชิก · ชื่อแคชเชียร์ · รหัสเครื่อง · id ภายใน · บิล POS ไม่ผูกสมุด (walk-in): vat null · ไม่มี abbNo · points null · actions {NOT_AVAILABLE, false, true}"),
  D("P3", "-", "[R8] หลัง voidSale: status VOIDED · โทเคนเดิมเปิดได้ · actions.taxInvoice NOT_AVAILABLE · ไม่มีสถานะเก็บเพิ่ม"),
  D("P4", "X4", "[R8] หลัง refundSale บางส่วน: status REFUNDED_PARTIAL · refundedSatang = ยอดใบคืน · grandTotalSatang เท่าเดิม · actions.taxInvoice AVAILABLE (คืนบางส่วนยังขอได้)"),
  D("P5", "X4", "[R8] หลัง refundSale ครบ: status REFUNDED · refundedSatang = grandTotalSatang · actions.taxInvoice NOT_AVAILABLE"),
  D("P6", "X2", "[R1 R2] โทเคนของใบ REFUND → หน้าของบิลต้นทาง (receiptNo บิลต้นทาง · status REFUNDED_PARTIAL) · โทเคนไม่มีจริง / ว่าง / ตัวพิมพ์ผิดรูป → {ok:false, code TOKEN_NOT_FOUND}"),
  // ── Q QR ──
  D("Q1", "-", "[R3] receiptPayload ค่าตั้งปริยาย (qrEReceipt true): footer.qrEReceiptUrl = `${publicOrigin()}/r/<token>` ของบิล · บิลเก่าไม่มีโทเคน → ได้โทเคนแบบขี้เกียจ (ensureReceiptToken) และ URL ชี้โทเคนนั้น (ดู CONTROLLER-DECISION)"),
  D("Q2", "-", "[R3] settings.pos.receipt.qrEReceipt = false → footer.qrEReceiptUrl === null (บิลเดียวกัน) · คืนค่าแล้วกลับเป็น URL"),
  // ── I แจ้งปัญหา ──
  D("I1", "X5", "[R4 R9] reportReceiptIssue(token, {message, contact?}) → {ok:true, issueId} · แถว PosReceiptIssue (ร้าน/สาขา/บิล · message/contact ตัดช่องว่าง · status OPEN · kanbanCardId null) · outbox pos.receipt.issue_reported 1 แถว payload {tenantId unitId saleId issueId receiptNo message} · ข้อความว่าง/ช่องว่าง/501 ตัว · contact 121 ตัว · คีย์แปลก (saleId) → VALIDATION ไม่มีแถว · 500 ตัวผ่าน · โทเคนมั่ว → TOKEN_NOT_FOUND"),
  D("I2", "-", "[R4 CD2] ร้านไม่มีบอร์ด: drainAll → event DONE · issue.kanbanCardId null · ไม่มีการ์ด · onReceiptIssueReported(evt) → {posted:false, reason:\"no-board\"} · สมาชิกมีไลน์แต่ร้านไม่ได้เชื่อม → ไม่ throw · ไม่แตะเครือข่าย"),
  D("I3", "X1", "[R4 CD2] มีบอร์ด (settings.pos.receipt.issueBoardId): drainAll → การ์ด 1 ใบบนบอร์ดนั้น (sourceKey มี issueId · ชื่อมีเลขบิล) · issue.kanbanCardId = การ์ดนั้น · เล่น consumer ซ้ำ 2 รอบ → ยัง 1 ใบ id เดิม · onReceiptIssueReported(evt) → {posted:false, reason:\"already-posted\"}"),
  D("I4", "-", "[R4 CD4] เพดาน 3 ครั้งต่อโทเคนต่อ 24 ชม.: ครั้งที่ 4 → RATE_LIMITED ไม่มีแถว/อีเวนต์เพิ่ม · ย้าย createdAt 3 แถวไป 25 ชม.ก่อน → ครั้งถัดไปผ่าน"),
  // ── X ขอใบกำกับเต็มรูป ──
  D("X1", "X5", "[R5] requestFullTaxInvoice บิล ABB จ่ายแล้ว ≤ 7 วัน → {ok:true, requestId} · แถว PosTaxInvoiceRequest REQUESTED (name/taxId/address/email ตามที่ส่ง · branchCode \"00000\" ปริยาย · accountDocId null) · outbox pos.receipt.taxInvoiceRequested 1 แถว (payload requestId + saleId) · drainAll → DONE · actions.taxInvoice REQUESTED"),
  D("X2", "X1", "[R5] ขอซ้ำบิลเดิม → ALREADY_REQUESTED ไม่มีแถว/อีเวนต์เพิ่ม · แถวเปลี่ยนเป็น ISSUED → actions.taxInvoice ISSUED"),
  D("X3", "X4", "[R5] NOT_ELIGIBLE: POS ไม่ผูกสมุด (ใบเสร็จธรรมดา) · บิล VOIDED · บิลคืนครบ (REFUNDED) — ไม่มีแถว · บิลคืนบางส่วน → ขอได้ (ตัวควบคุมบวก)"),
  D("X4", "-", "[R5] paidAt 8 วันก่อน → NOT_ELIGIBLE + actions.taxInvoice NOT_AVAILABLE · paidAt 6 วันก่อน → ขอได้ (ตัวควบคุมบวก)"),
  D("X5", "-", "[R5 R9] VALIDATION ไม่มีแถว: taxId 12 หลัก / 14 หลัก / มีตัวอักษร / ว่าง · branchCode 3 หลัก / มีตัวอักษร · name ว่าง · address ว่าง · คีย์แปลก (saleId) · โทเคนมั่ว → TOKEN_NOT_FOUND · branchCode \"00001\" เก็บตามที่ส่ง"),
  // ── V รีวิว ──
  D("V1", "X5", "[R6 CD3] submitReceiptReview(token, {rating 5, body}) บิลมีสมาชิก → {ok:true} · MemberReview 1 แถว (refType PosSale · refId บิล · customerId สมาชิก · status NEW · rating 5 · body ตัดช่องว่าง) ผ่าน facade ของ member · บิลที่ member ขอรีวิวไว้แล้ว (REQUESTED) → ส่งได้ เป็น NEW แถวเดิม"),
  D("V2", "-", "[R6] บิลไม่มีสมาชิก → NO_MEMBER · rating 0 / 6 / 2.5 / \"5\" · body 501 ตัว → VALIDATION · โทเคนมั่ว → TOKEN_NOT_FOUND · ไม่มีแถว MemberReview"),
  D("V3", "X1", "[R6] ส่งซ้ำบิลเดิม → ALREADY_REVIEWED · ยัง 1 แถว rating เดิม · publicReceipt actions.review false"),
  // ── S ส่งใบเสร็จ ──
  D("S1", "X5", "[R7] sendReceipt(ctx, เจ้าของ, {saleId, via LINE}, {deps:{line}}) → {ok:true} · deps.line ถูกเรียก 1 ครั้ง (tenantId · partyId ของสมาชิก · ข้อความ \"ใบเสร็จ <เลข> · ยอด ฿<สุทธิ> — ดูใบเสร็จ: <origin>/r/<token>\") · AuditLog pos.receipt.sent 1 แถว (PosSale · actorId · after.via LINE · ไม่มีชื่อ/เบอร์/อีเมล/LINE id)"),
  D("S2", "-", "[R7] NO_LINE_IDENTITY: บิล walk-in · สมาชิกไม่มี partyId (deps.line ไม่ถูกเรียก) · สมาชิกมี party แต่ไม่มี LINE ChatContact ผ่านทางจริง (ไม่ฉีด deps) — ไม่มี audit · ไม่แตะเครือข่าย"),
  D("S3", "X5", "[R7] EMAIL ผ่าน deps.fetch ปลอม: ที่อยู่ที่ส่งมา → POST api.resend.com/emails to [ที่อยู่] subject \"ใบเสร็จ <เลข> · <ร้าน>\" html มีส่วนใบเสร็จ (data-section=lines) + เลขบิล + ลิงก์ /r/<token> · ไม่ส่งที่อยู่ = อีเมลสมาชิก · walk-in ไม่มีอีเมล → NO_EMAIL · รูปแบบผิด → VALIDATION · audit via EMAIL ปิดบังที่อยู่ · ตัวกั้น fetch จริง 0 ครั้ง"),
  D("S4", "X3", "[R7] บิล VOIDED → SALE_VOIDED (LINE และ EMAIL) · id มั่ว → SALE_NOT_FOUND · ผู้ใช้ไม่มี pos.sale.read/create → PERMISSION_DENIED · ไม่มี audit · deps ไม่ถูกเรียก"),
  D("S5", "-", "[R7 CD4] เพดาน 5 ครั้งต่อบิลต่อ 24 ชม. (นับ AuditLog pos.receipt.sent): ครั้งที่ 6 → RATE_LIMITED (fetch ปลอมไม่ถูกเรียก · audit ยัง 5) · ย้าย audit 5 แถวไป 25 ชม.ก่อน → ครั้งถัดไปผ่าน"),
  // ── D ปฏิเสธเป็นข้อมูล ──
  D("D1", "-", "[R7 ทุกข้อ] คำปฏิเสธที่เก็บได้ครบ 12 รหัส (TOKEN_NOT_FOUND RATE_LIMITED VALIDATION NOT_ELIGIBLE ALREADY_REQUESTED NO_MEMBER ALREADY_REVIEWED NO_LINE_IDENTITY NO_EMAIL SALE_VOIDED SALE_NOT_FOUND PERMISSION_DENIED) · ทุกตัว {ok:false, code, message ไทย} ไม่ throw"),
  // ── NC ตัวควบคุมลบ ──
  D("NC", "-", "ตัวควบคุมลบ: ตัวตรวจของข้อสอบจับคำตอบที่ผิดโดยตั้งใจได้ (โทเคนมี I/L/O/U · 11/13 ตัว · ตัวเล็ก · ใบเสร็จที่มีเบอร์/คีย์ cashierName · audit ที่มีอีเมลดิบ · ข้อความ LINE ยอดผิด · สถานะที่ derive ผิด)"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราวเหลือ 0 แถวทุกตารางที่มี tenantId + แถว Tenant ถูกลบ"),
  D("Z2", "-", "QC4 ลายนิ้วมือ: แถวของร้าน QC POS (seed) ก่อน = หลัง (นับ 14 ตาราง + 2 ตารางใหม่ + hash 8 ตาราง + Tenant)"),
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
  const full = id.startsWith("P1.11-") ? id : `P1.11-${id}`;
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
/** VAT แบบรวมในราคา — สูตรเดียวกับ src/lib/money/vat.ts splitIncludedVat (ข้อสอบเขียนเอง ไม่ import) */
const vatOf = (g: number, bp: number) => {
  const den = 10_000 + bp;
  return g - Math.floor((2 * g * 10_000 + den) / (2 * den));
};
const baht = (s: number) => `฿${(s / 100).toLocaleString("en-US", { minimumFractionDigits: s % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// ── ตัวตรวจของข้อสอบ (ใช้ทั้งข้อจริงและ NC) ──
/** โทเคน: 12 ตัว Crockford base32 ตัวใหญ่ (ไม่มี I L O U) */
const TOKEN_RE = /^[0-9A-HJKMNP-TV-Z]{12}$/;
const tokenOk = (t: unknown) => typeof t === "string" && TOKEN_RE.test(t);
/** คีย์ที่ห้ามมีในใบเสร็จสาธารณะ (ทุกระดับความลึก) */
const PII_KEYS = ["memberId", "customerId", "customer", "member", "memberName", "phone", "email", "cashier", "cashierName", "soldByUserId", "deviceId", "deviceCode", "device", "shiftId", "tenantId", "unitId", "systemId", "saleId", "partyId", "contact"];
function piiHits(receipt: unknown, values: string[]): string[] {
  const hits: string[] = [];
  const walkKeys = (o: unknown, path: string) => {
    if (Array.isArray(o)) o.forEach((x, i) => walkKeys(x, `${path}[${i}]`));
    else if (isRecord(o))
      for (const [k, v] of Object.entries(o)) {
        if (PII_KEYS.includes(k)) hits.push(`คีย์ ${path}.${k}`);
        walkKeys(v, `${path}.${k}`);
      }
  };
  walkKeys(receipt, "receipt");
  let json = "";
  try {
    json = JSON.stringify(receipt) ?? "";
  } catch {
    json = String(receipt);
  }
  for (const v of values) if (v && v.length >= 4 && json.includes(v)) hits.push(`ค่า "${v.slice(0, 24)}"`);
  return hits;
}
/** สถานะที่หน้าใบเสร็จต้องแสดง (R2/R8) จากแถวบิล */
const expectStatus = (s: { status: string; refundedSatang: number }) =>
  s.status === "VOIDED" ? "VOIDED" : s.status === "REFUNDED" ? "REFUNDED" : s.status === "PAID" && s.refundedSatang > 0 ? "REFUNDED_PARTIAL" : s.status === "PAID" ? "PAID" : `?${s.status}`;
/** ข้อความ LINE (R7) */
const lineText = (receiptNo: string, netText: string, url: string) => `ใบเสร็จ ${receiptNo} · ยอด ${netText} — ดูใบเสร็จ: ${url}`;
/** audit ที่ไม่ควรมีค่าดิบเหล่านี้ */
const auditLeaks = (row: Any, raws: string[]) => {
  const j = short({ before: row?.before, after: row?.after }, 100_000);
  return raws.filter((r) => r && r.length >= 4 && j.includes(r));
};

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
  pub: `${POS_DIR}/public-receipt.ts`,
  issue: `${POS_DIR}/receipt-issue.ts`,
  send: `${POS_DIR}/receipt-send.ts`,
  pubAct: "src/app/(store)/r/[token]/pos-receipt-actions.ts", // ORACLE-EDIT (controller · P1.11 ST6): F6.1 บังคับ permission check ใน modules/pos → actions สาธารณะอยู่ข้างหน้า /r/[token] เดิมของบัญชี
  sendAct: `${POS_DIR}/receipt-send-actions.ts`,
  rcpAct: `${POS_DIR}/receipt-actions.ts`,
  receipt: `${POS_DIR}/receipt.ts`,
  service: `${POS_DIR}/service.ts`,
  bridges: "src/lib/pos-receipt-bridges.ts",
  consumers: "src/lib/outbox-consumers.ts",
  page: "src/app/(store)/r/[token]/page.tsx", // ORACLE-EDIT (controller · ST6): หน้า /r/[token] อยู่ในกลุ่ม (store) ของบัญชีอยู่แล้ว
};
/** ฟังก์ชันใหม่ของใบนี้ — ข้อสอบหาในไฟล์ใดก็ได้ของ pub/issue/send (+ ตัวรับ event ใน bridges/issue) */
const NEW_FNS = ["publicReceipt", "ensureReceiptToken", "requestFullTaxInvoice", "submitReceiptReview", "reportReceiptIssue", "sendReceipt"] as const;
const PUB_ACTIONS: [string, string][] = [["reportReceiptIssueAction", "reportReceiptIssue"], ["requestFullTaxInvoiceAction", "requestFullTaxInvoice"], ["submitReceiptReviewAction", "submitReceiptReview"]];
const ISSUE_COLS = ["id", "tenantId", "unitId", "saleId", "message", "contact", "status", "kanbanCardId", "createdAt"] as const;
const TAXREQ_COLS = ["id", "tenantId", "unitId", "saleId", "name", "taxId", "branchCode", "address", "email", "status", "accountDocId", "createdAt"] as const;
const EV_ISSUE = "pos.receipt.issue_reported";
const EV_TAX = "pos.receipt.taxInvoiceRequested";
const ALL_CODES = ["TOKEN_NOT_FOUND", "RATE_LIMITED", "VALIDATION", "NOT_ELIGIBLE", "ALREADY_REQUESTED", "NO_MEMBER", "ALREADY_REVIEWED", "NO_LINE_IDENTITY", "NO_EMAIL", "SALE_VOIDED", "SALE_NOT_FOUND", "PERMISSION_DENIED"];

const srcOf = (f: string) => stripComments(rd(f));
const newSrc = () => [F.pub, F.issue, F.send].map(srcOf).join("\n");
const STATIC_IDS = ["ST1", "ST2", "ST3", "ST4", "ST5", "ST6", "NC"].map((x) => `P1.11-${x}`);
const skipReasons: string[] = [];
for (const f of [F.pub, F.issue, F.send]) if (!existsSync(join(ROOT, f))) skipReasons.push(`${f} ยังไม่มี`);
for (const n of NEW_FNS) if (!exportsFn(newSrc(), n)) skipReasons.push(`ยังไม่มี export ${n} (public-receipt.ts / receipt-issue.ts / receipt-send.ts)`);
if (!exportsFn(srcOf(F.bridges) + srcOf(F.issue), "onReceiptIssueReported")) skipReasons.push(`ยังไม่มี export onReceiptIssueReported (${F.bridges} / receipt-issue.ts)`);

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB) ═════════════════════════
async function runStatic(): Promise<void> {
  console.log("\n── ST ข้อสถิต (ไม่แตะ DB) ──");
  // ST1 facade ที่มีอยู่แล้ว (ผ่านได้ตั้งแต่วันนี้)
  {
    const p: string[] = [];
    const need: [string, string[]][] = [
      ["src/lib/modules/chat/party-bridge.ts", ["sendLineToParty"]],
      ["src/lib/modules/chat/push.ts", ["pushToContact"]],
      ["src/lib/core/email.ts", ["sendEmailRich"]],
      ["src/lib/modules/kanban/links.ts", ["createCardFromExternal"]],
      ["src/lib/modules/member/reviews.ts", ["requestReview", "submitReview"]],
      ["src/lib/core/origin.ts", ["publicOrigin"]],
      ["src/lib/modules/point/service.ts", ["getBalance"]],
      [F.receipt, ["receiptPayload"]],
      [F.service, ["voidSale", "createSale"]],
      [`${POS_DIR}/refund.ts`, ["refundSale"]],
      [`${POS_DIR}/register.ts`, ["submitRegisterSale", "quoteRegisterCart"]],
      [`${POS_DIR}/shift.ts`, ["openShift"]],
      [`${POS_DIR}/device.ts`, ["registerDevice"]],
      [`${POS_DIR}/receipt-render.ts`, ["renderReceiptHtml"]],
    ];
    for (const [f, fns] of need) {
      const s = srcOf(f);
      if (!s) p.push(`ไม่มี ${f}`);
      else for (const n of fns) if (!exportsFn(s, n)) p.push(`${f.split("/").pop()} ไม่มี export ${n}`);
    }
    const email = srcOf("src/lib/core/email.ts");
    if (!/export\s+async\s+function\s+sendEmailRich\s*\(\s*msg\s*:\s*RichEmail\s*,\s*deps\?\s*:\s*RichEmailDeps\s*\)/.test(email)) p.push("sendEmailRich ไม่ใช่ (msg: RichEmail, deps?: RichEmailDeps)");
    if (!/export\s+type\s+RichEmailDeps\s*=\s*\{\s*fetch\?\s*:/.test(email)) p.push("RichEmailDeps ไม่มี fetch?");
    const memIdx = srcOf("src/lib/modules/member/index.ts");
    for (const n of ["requestReview", "submitReview"]) if (!new RegExp(`\\b${n}\\b`).test(memIdx)) p.push(`member/index.ts ไม่ re-export ${n}`);
    const ptIdx = srcOf("src/lib/modules/point/index.ts");
    if (!/\bgetBalance\b/.test(ptIdx)) p.push("point/index.ts ไม่ re-export getBalance");
    const pb = srcOf("src/lib/modules/chat/party-bridge.ts");
    if (!/sendLineToParty\s*\(\s*ctx\s*:\s*ChatPartyCtx\s*,\s*input\s*:\s*SendLineToPartyInput\s*,?\s*\)/.test(pb)) p.push("sendLineToParty ไม่ใช่ (ctx: ChatPartyCtx, input: SendLineToPartyInput)");
    chk("ST1", p.length === 0, "facade ครบชื่อ/ลายเซ็น", p.join(" · ") || "ครบ 14 ไฟล์ · sendEmailRich(msg, deps{fetch}) · sendLineToParty(ctx, input) · member/point re-export");
  }
  // ST2 schema
  const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
  {
    const p: string[] = [];
    const sale = prismaBlock(schemaSrc, "model", "PosSale");
    const tok = fieldLine(sale, "publicToken");
    if (!tok) p.push("PosSale ไม่มี publicToken");
    else if (!/^publicToken\s+String\?\s+.*@unique\b/.test(tok)) p.push(`publicToken ไม่ใช่ String? @unique (${tok})`);
    const enumVals = (typeName: string): string[] => {
      const b = prismaBlock(schemaSrc, "enum", typeName);
      return b ? b.split("\n").slice(1, -1).map((l) => l.trim().split(/\s+/)[0] ?? "").filter((w) => /^[A-Z_]+$/.test(w)) : [];
    };
    const model = (name: string, cols: readonly string[], nullable: string[], statusVals: string[]) => {
      const b = prismaBlock(schemaSrc, "model", name);
      if (!b) {
        p.push(`ไม่มี model ${name}`);
        return;
      }
      const miss = cols.filter((c) => !fieldLine(b, c));
      if (miss.length) p.push(`${name} ขาด ${miss.join(",")}`);
      for (const c of nullable) {
        const l = fieldLine(b, c);
        if (l && !/\?$/.test(l.split(/\s+/)[1] ?? "")) p.push(`${name}.${c} ต้อง nullable`);
      }
      const st = fieldLine(b, "status").split(/\s+/)[1] ?? "";
      const vals = enumVals(st.replace(/\?$/, ""));
      if (st && statusVals.some((v) => !vals.includes(v))) p.push(`${name}.status (${st}) ไม่ใช่ enum ${statusVals.join("|")} (พบ ${vals.join("|") || "ไม่ใช่ enum"})`);
    };
    model("PosReceiptIssue", ISSUE_COLS, ["contact", "kanbanCardId"], ["OPEN", "RESOLVED"]);
    model("PosTaxInvoiceRequest", TAXREQ_COLS, ["email", "accountDocId"], ["REQUESTED", "ISSUED", "REJECTED"]);
    chk("ST2", p.length === 0, "publicToken + 2 โมเดล + enum สถานะ", p.join(" · ") || "ครบ");
  }
  // ST3 migration
  {
    const p: string[] = [];
    const files = walk("prisma/migrations", [], /\.sql$/).filter((f) => /ALTER\s+TABLE\s+"PosSale"[^;]*"publicToken"|"PosReceiptIssue"|"PosTaxInvoiceRequest"/i.test(rd(f)));
    if (!files.length) p.push("ไม่มี migration ที่แตะ publicToken / PosReceiptIssue / PosTaxInvoiceRequest");
    const all = files.map((f) => rd(f).replace(/--.*$/gm, "")).join("\n");
    if (files.length) {
      if (!/ALTER\s+TABLE\s+"PosSale"\s+ADD\s+COLUMN\s+"publicToken"/i.test(all)) p.push("ไม่มี ADD COLUMN \"publicToken\"");
      if (!/CREATE\s+UNIQUE\s+INDEX[^;]*ON\s+"PosSale"\s*\(\s*"publicToken"\s*\)/i.test(all)) p.push("ไม่มี unique index PosSale(publicToken)");
      for (const t of ["PosReceiptIssue", "PosTaxInvoiceRequest"]) if (!new RegExp(`CREATE\\s+TABLE\\s+"${t}"`, "i").test(all)) p.push(`ไม่มี CREATE TABLE "${t}"`);
    }
    for (const f of files) {
      const stmts = rd(f).replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
      const bad = stmts.filter((s) => !/^CREATE\s+(TYPE|TABLE|UNIQUE\s+INDEX|INDEX)\b/i.test(s) && !/^ALTER\s+TABLE\s+"[A-Za-z]+"\s+ADD\s+(COLUMN|CONSTRAINT)\b/i.test(s));
      if (bad.length) p.push(`${f.split("/").slice(-2, -1)[0]}: คำสั่งที่ไม่ใช่การเพิ่ม (${short(bad[0], 60)})`);
    }
    chk("ST3", p.length === 0, "เพิ่มอย่างเดียว", p.join(" · ") || `ครบ (${files.length} ไฟล์)`);
  }
  // ST4 ลงทะเบียน
  {
    const p: string[] = [];
    const scope = srcOf("src/lib/core/scope.ts");
    for (const m of ["PosReceiptIssue", "PosTaxInvoiceRequest"]) if (!new RegExp(`\\b${m}\\s*:`).test(scope)) p.push(`scope.ts ไม่มี ${m}`);
    const env = srcOf("scripts/pos-qc-env.mts");
    const pm = env.slice(env.indexOf("export const POS_MODELS"), env.indexOf("export type PosModelKey"));
    for (const k of ["posReceiptIssue", "posTaxInvoiceRequest"]) if (!new RegExp(`\\b${k}\\s*:`).test(pm)) p.push(`pos-qc-env POS_MODELS ไม่มี ${k}`);
    const cons = srcOf(F.consumers);
    for (const ev of [EV_ISSUE, EV_TAX]) {
      const m = new RegExp(`["']${ev.replace(/\./g, "\\.")}["']\\s*:\\s*([^\\n]*)`).exec(cons);
      if (!m) p.push(`outbox-consumers ไม่มี "${ev}"`);
      else if (!/withAutomation\s*\(/.test(m[1]!) && !/crmFirst\s*\(/.test(m[1]!)) p.push(`"${ev}" ไม่ห่อ withAutomation`);
    }
    chk("ST4", p.length === 0, "scope + pos-qc-env + 2 consumer", p.join(" · ") || "ครบ");
  }
  // ST5 ขอบเขตโมดูล
  {
    const p: string[] = [];
    const posFiles = walk(POS_DIR);
    const newFiles = [F.pub, F.issue, F.send, F.pubAct, F.sendAct].filter((f) => existsSync(join(ROOT, f)));
    if (newFiles.length < 3) p.push(`ไฟล์ใหม่ใน pos ยังไม่ครบ (${newFiles.length})`);
    for (const f of posFiles) {
      const s = srcOf(f);
      if (/["']@\/lib\/modules\/(chat|kanban)(\/[^"']*)?["']/.test(s)) p.push(`${f.split("/").pop()} import chat/kanban (F2 ไม่มีเส้น pos→chat/kanban)`);
    }
    for (const f of newFiles) {
      const s = srcOf(f);
      const nm = f.split("/").pop();
      if (/\.(memberReview|kanbanCard|kanbanBoard|chatContact|chatChannelConnection)\s*\./.test(s)) p.push(`${nm} แตะ prisma ของโมดูลอื่นตรง`);
      if (/env\.APP_URL|process\.env\.APP_URL/.test(s)) p.push(`${nm} ใช้ APP_URL ตรง`);
      if (/\bMath\.random\s*\(/.test(s)) p.push(`${nm} ใช้ Math.random`);
    }
    const reviewHome = [F.pub, F.issue, F.send].map(srcOf).find((s) => exportsFn(s, "submitReceiptReview")) ?? "";
    if (reviewHome && !/["']@\/lib\/modules\/member["']/.test(reviewHome)) p.push("ไฟล์ของ submitReceiptReview ไม่เรียก facade @/lib/modules/member");
    const rootFiles = [...walk("src/lib", [], /\.ts$/).filter((f) => !f.startsWith("src/lib/modules/"))];
    const issueRoot = rootFiles.filter((f) => /createCardFromExternal\s*\(/.test(srcOf(f)) && /PosReceiptIssue|posReceiptIssue|issue_reported/.test(srcOf(f)));
    if (!issueRoot.length) p.push("ไม่มีไฟล์ composition root ที่เปิดการ์ดของ issue ผ่าน createCardFromExternal");
    const tokenFiles = posFiles.filter((f) => /publicToken/.test(srcOf(f)));
    const tokSrc = tokenFiles.map(srcOf).join("\n");
    if (!tokenFiles.length) p.push("ไม่มีไฟล์ pos ที่เขียน publicToken");
    else {
      if (!/\brandomBytes\b/.test(tokSrc)) p.push("ตัวสร้างโทเคนไม่ใช้ crypto.randomBytes");
      if (/\bMath\.random\s*\(/.test(tokSrc)) p.push(`ไฟล์โทเคนใช้ Math.random (${tokenFiles.filter((f) => /\bMath\.random\s*\(/.test(srcOf(f))).map((f) => f.split("/").pop()).join(",")})`);
    }
    const rcp = srcOf(F.receipt) + srcOf(F.pub);
    if (!/["']@\/lib\/core\/origin["']/.test(rcp) || !/\bpublicOrigin\s*\(/.test(rcp)) p.push("receipt.ts/public-receipt.ts ไม่ใช้ publicOrigin จาก core/origin");
    chk("ST5", p.length === 0, "ไม่มีเส้น pos→chat/kanban · facade · randomBytes · publicOrigin", p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || "ครบ");
  }
  // ST6 actions + page
  {
    const p: string[] = [];
    const actRaw = rd(F.pubAct);
    if (!actRaw) p.push(`ไม่มี ${F.pubAct}`);
    else {
      const actSrc = stripComments(actRaw);
      const first = actRaw.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "").trimStart();
      if (!/^["']use server["']/.test(first)) p.push('"use server" ไม่ใช่คำสั่งแรก');
      const bad = [...actSrc.matchAll(/^\s*export\s+[^\n]*/gm)].map((m) => m[0].trim()).filter((l) => !/^export\s+async\s+function\s+\w+/.test(l));
      if (bad.length) p.push(`export ที่ไม่ใช่ async function: ${short(bad.map((b) => b.slice(0, 40)), 120)}`);
      if (/\b(saleId|tenantId|unitId|systemId)\b/.test(actSrc)) p.push("ไฟล์ action สาธารณะมี saleId/tenantId/unitId/systemId (R9: token เท่านั้น)");
      if (/\b(requireTenant|requireAuth|requireMembership|getSession|auth)\s*\(|["']next\/headers["']|\bcookies\s*\(/.test(actSrc)) p.push("ไฟล์ action สาธารณะอ่าน session/cookies (R9)");
      const starts = [...actSrc.matchAll(/export\s+async\s+function\s+(\w+)\s*\(([^)]*)\)/g)].map((m) => ({ name: m[1]!, params: m[2]!, at: m.index! }));
      for (const [act, svcFn] of PUB_ACTIONS) {
        const i = starts.findIndex((s) => s.name === act);
        if (i < 0) {
          p.push(`ไม่มี ${act}`);
          continue;
        }
        if (!/^\s*token\s*:\s*string\b/.test(starts[i]!.params)) p.push(`${act} พารามิเตอร์แรกไม่ใช่ token: string`);
        const body = actSrc.slice(starts[i]!.at, i + 1 < starts.length ? starts[i + 1]!.at : actSrc.length);
        if (!new RegExp(`\\b${svcFn}\\s*\\(`).test(body)) p.push(`${act} ไม่เรียก ${svcFn}`);
        if (!/\bcatch\b/.test(body)) p.push(`${act} ไม่มี catch`);
      }
    }
    const sendActSrc = [F.sendAct, F.rcpAct].map((f) => ({ f, raw: rd(f) })).find((x) => /export\s+async\s+function\s+sendReceiptAction\b/.test(stripComments(x.raw)));
    if (!sendActSrc) p.push("ไม่มี sendReceiptAction (receipt-send-actions.ts / receipt-actions.ts)");
    else {
      const s = stripComments(sendActSrc.raw);
      const first = sendActSrc.raw.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "").trimStart();
      if (!/^["']use server["']/.test(first)) p.push(`${sendActSrc.f.split("/").pop()}: "use server" ไม่ใช่คำสั่งแรก`);
      const at = s.search(/export\s+async\s+function\s+sendReceiptAction\b/);
      const body = s.slice(at).split(/\n\s*export\s+/)[0] ?? "";
      if (!/\bsendReceipt\s*\(/.test(body)) p.push("sendReceiptAction ไม่เรียก sendReceipt");
      if (!/\bcatch\b/.test(body)) p.push("sendReceiptAction ไม่มี catch");
      if (!/requireTenant\s*\(/.test(s)) p.push("sendReceiptAction ไม่เรียก requireTenant");
    }
    // P1.11U (มติข้อ 7): ยกเลิกการเลื่อนตรวจหน้า — หน้า dispatcher /r/[token] เรียก publicReceipt แล้ว ⇒ ตรวจครบทุกข้อเสมอ
    const page = rd(F.page);
    if (!page) p.push(`ไม่มี ${F.page}`);
    else {
      const ps = stripComments(page);
      if (!/noindex/.test(ps)) p.push("หน้า /r/[token] ไม่มี noindex");
      if (!/\bpublicReceipt\b/.test(ps)) p.push("หน้า /r/[token] ไม่เรียก publicReceipt");
      if (/\b(requireTenant|requireAuth|requireMembership|getSession)\s*\(|@\/lib\/core\/context/.test(ps)) p.push("หน้า /r/[token] อ่าน session");
    }
    chk("ST6", p.length === 0, "actions สาธารณะรับ token ล้วน · sendReceiptAction · หน้า noindex ไม่อ่าน session", p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || "ครบ");
  }
  // NC ตัวควบคุมลบ (บริสุทธิ์)
  {
    const p: string[] = [];
    const goodTok = "0123456789AB";
    if (!tokenOk(goodTok) || !tokenOk("ZYXWVTSRQPNM")) p.push("ตัวตรวจโทเคนปฏิเสธโทเคนที่ถูก");
    for (const bad of ["ABCDEFGHIJKL", "0123456789A", "0123456789ABC", "0123456789ab", "OOOOOOOOOOOO", "UUUUUUUUUUUU", "", null])
      if (tokenOk(bad)) p.push(`ตัวตรวจโทเคนรับ ${short(bad)}`);
    const clean = { shop: { name: "ร้าน", branchLabel: "สาขา", logoUrl: null }, receiptNo: "R1", status: "PAID", lines: [{ name: "ชา", qty: 1, lineTotalSatang: 100 }] };
    if (piiHits(clean, ["0812345678"]).length) p.push("ตัวสแกน PII จับใบที่สะอาด");
    if (!piiHits({ ...clean, shop: { ...clean.shop, phone: "x" } }, []).length) p.push("ตัวสแกน PII ไม่จับคีย์ phone");
    if (!piiHits({ ...clean, doc: { cashierName: "x" } }, []).length) p.push("ตัวสแกน PII ไม่จับคีย์ cashierName");
    if (!piiHits({ ...clean, note: "โทร 0812345678" }, ["0812345678"]).length) p.push("ตัวสแกน PII ไม่จับค่าเบอร์");
    if (auditLeaks({ after: { via: "EMAIL", to: "s***@example.com" } }, ["somchai@example.com"]).length) p.push("ตัวตรวจ audit จับที่อยู่ที่ปิดบังแล้ว");
    if (!auditLeaks({ after: { via: "EMAIL", to: "somchai@example.com" } }, ["somchai@example.com"]).length) p.push("ตัวตรวจ audit ไม่จับที่อยู่ดิบ");
    if (lineText("R1", "฿135", "https://x/r/T") === lineText("R1", "฿134", "https://x/r/T")) p.push("ตัวเทียบข้อความ LINE ไม่แยกยอด");
    const st: [Any, string][] = [[{ status: "PAID", refundedSatang: 0 }, "PAID"], [{ status: "PAID", refundedSatang: 1 }, "REFUNDED_PARTIAL"], [{ status: "REFUNDED", refundedSatang: 100 }, "REFUNDED"], [{ status: "VOIDED", refundedSatang: 0 }, "VOIDED"]];
    for (const [s, want] of st) if (expectStatus(s) !== want) p.push(`expectStatus ${short(s)} → ${expectStatus(s)}`);
    if (expectStatus({ status: "PAID", refundedSatang: 5 }) === "PAID") p.push("expectStatus ไม่แยกคืนบางส่วน");
    if (vatOf(13500, 700) !== 883) p.push(`vatOf(13500) = ${vatOf(13500, 700)} (คาด 883)`);
    chk("NC", p.length === 0, "ตัวตรวจทุกตัวจับของผิดได้", p.join(" · ") || "ครบ (โทเคน 8 แบบผิด · PII 3 แบบ · audit · ข้อความ LINE · สถานะ 4 แบบ · VAT)");
  }
}

// ═════════════════════════ 1b. --no-db ═════════════════════════
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อ (สถิต + NC)`);
  let crashedS = "";
  try {
    await runStatic();
  } catch (e) {
    crashedS = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
    console.log(`💥 harness: ${crashedS}`);
  }
  for (const id of STATIC_IDS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashedS ? `ไม่ถึง (harness ล้ม: ${crashedS.slice(0, 80)})` : "ไม่ถึง");
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
  seedOk = !!(await envMod.resolvePosScope(prisma, "coffee")) && !!(await envMod.resolvePosScope(prisma, "resto"));
} catch (e) {
  console.log(`  (resolvePosScope ล้ม: ${(e as Error).message.slice(0, 120)})`);
}
if (!seedOk) skipReasons.push("ชุดข้อมูล QC POS (ร้านกาแฟ + ร้านอาหาร) ยังไม่ถูก seed — รัน scripts/seed-pos-qc.mts ก่อน (ใช้ userId เจ้าของ/แคชเชียร์)");
const PRI: Any = typeof P.posReceiptIssue?.findMany === "function" ? P.posReceiptIssue : null;
const PTR: Any = typeof P.posTaxInvoiceRequest?.findMany === "function" ? P.posTaxInvoiceRequest : null;
if (!PRI) skipReasons.push("Prisma client ยังไม่มี delegate posReceiptIssue (R4)");
if (!PTR) skipReasons.push("Prisma client ยังไม่มี delegate posTaxInvoiceRequest (R5)");
const dbCols = new Set<string>();
try {
  const rows = (await P.$queryRawUnsafe(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('PosSale','PosReceiptIssue','PosTaxInvoiceRequest')`)) as Any[];
  for (const r of rows) dbCols.add(`${r.table_name}.${r.column_name}`);
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
const HAS_TOKEN_COL = dbCols.has("PosSale.publicToken");
if (!HAS_TOKEN_COL) skipReasons.push("ฐาน QC4 ยังไม่มีคอลัมน์ PosSale.publicToken (R1)");
let clientHasToken = false;
try {
  await P.posSale.findFirst({ where: { tenantId: "__none__" }, select: { id: true, publicToken: true } });
  clientHasToken = true;
} catch {
  skipReasons.push("Prisma client ยังไม่รู้จัก PosSale.publicToken (R1)");
}
for (const [t, cols] of [["PosReceiptIssue", ISSUE_COLS], ["PosTaxInvoiceRequest", TAXREQ_COLS]] as const) {
  const miss = cols.filter((c) => !dbCols.has(`${t}.${c}`));
  if (miss.length === cols.length) skipReasons.push(`ฐาน QC4 ยังไม่มีตาราง ${t}`);
  else if (miss.length) skipReasons.push(`ตาราง ${t} ขาดคอลัมน์ ${miss.join(",")}`);
}

const COUNT_MODELS = ["posSale", "posSaleLine", "posPayment", "posReceiptCounter", "posShift", "posDevice", "outboxEvent", "auditLog", "customer", "memberReview", "kanbanCard", "chatContact", "accountDocument", "pointLedger"] as const;
const FP_MODELS = ["posSale", "posShift", "posDevice", "posReceiptCounter", "appSystem", "accountSettings", "membership", "memberReview"] as const; // customer นับใน COUNT_MODELS (findMany ทั้งแถวของ customer ล้มบน client นี้)
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
  }
  for (const m of ["posReceiptIssue", "posTaxInvoiceRequest"]) {
    const d = P[m];
    out[`qc.${m}`] = typeof d?.count === "function" ? await d.count({ where: { tenantId: { in: TIDS } } }).catch(() => "err") : "absent";
  }
  return out;
}
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
    const t = (await P.$queryRawUnsafe(`SELECT id, name, slug, limits, "updatedAt" FROM "Tenant" WHERE id = ANY($1::text[]) ORDER BY id`, TIDS)) as Any[];
    out.tenant = `${t.length}:${createHash("sha256").update(JSON.stringify(t)).digest("hex").slice(0, 16)}`;
  } catch (e) {
    out.tenant = `err:${(e as Error).message.slice(0, 40)}`;
  }
  return out;
}
const countsBefore = await snapshotCounts();

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P1.11 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อมูล: seed ${seedOk ? "มี" : "ไม่มี"} · ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length, seed: seedOk })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const ex = (f: string) => existsSync(join(ROOT, f));
const pubMod = ex(F.pub) ? await tryImport("@/lib/modules/pos/public-receipt") : null;
const issueMod = ex(F.issue) ? await tryImport("@/lib/modules/pos/receipt-issue") : null;
const sendMod = ex(F.send) ? await tryImport("@/lib/modules/pos/receipt-send") : null;
const bridgesMod = ex(F.bridges) ? await tryImport("@/lib/pos-receipt-bridges") : null;
const svc = await tryImport("@/lib/modules/pos/service");
const register = await tryImport("@/lib/modules/pos/register");
const regShared = await tryImport("@/lib/modules/pos/register-shared");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const rcpMod = await tryImport("@/lib/modules/pos/receipt");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const pointMod = await tryImport("@/lib/modules/point");
const memberMod = await tryImport("@/lib/modules/member");
const originMod = await tryImport("@/lib/core/origin");
const consMod = await tryImport("@/lib/outbox-consumers");
const pick = (name: string, ...mods: Any[]): Any => mods.find((m) => typeof m?.[name] === "function") ?? null;
const NEWMODS = [pubMod, issueMod, sendMod];
const M = {
  publicReceipt: pick("publicReceipt", ...NEWMODS),
  ensureReceiptToken: pick("ensureReceiptToken", ...NEWMODS, rcpMod, svc),
  requestFullTaxInvoice: pick("requestFullTaxInvoice", ...NEWMODS),
  submitReceiptReview: pick("submitReceiptReview", ...NEWMODS),
  reportReceiptIssue: pick("reportReceiptIssue", ...NEWMODS),
  sendReceipt: pick("sendReceipt", ...NEWMODS),
  onReceiptIssueReported: pick("onReceiptIssueReported", bridgesMod, issueMod),
};
const money = (s: number): string => (typeof regShared?.moneyText === "function" ? regShared.moneyText(s) : baht(s));
let ORIGIN = "";
try {
  ORIGIN = String(await originMod?.publicOrigin?.()).replace(/\/+$/, "");
} catch (e) {
  console.log(`  ⚠️  publicOrigin() ล้มในบริบทสคริปต์: ${(e as Error).message.slice(0, 120)}`);
}

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p1.11-${RAND}`;
const T_SLUG = `qc-p111-${RAND}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";

// ── ตัวกั้นเครือข่าย: ทุก fetch ในช่วง DB = 503 + นับ (deps.fetch ปลอมของข้อสอบไม่ผ่านตัวนี้) ──
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
    return new Response("blocked by qc-pos-p1.11", { status: 503 });
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
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !STATIC_IDS.includes(id) && id !== "P1.11-Z1" && id !== "P1.11-Z2");
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
  installFetchGuard(); // ตลอดช่วง DB — ไม่มีอะไรในข้อสอบนี้ควรแตะเครือข่าย
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} · DB ${HOST} · origin ${ORIGIN || "(ไม่มี)"} ──`);
  console.log(`   POS-A ผูกสมุดจด VAT (ABB) + สมาชิก/แต้ม · สาขา A · POS-N ไม่ผูกสมุด สาขา N · ระบบแชท (ไม่มีการเชื่อมต่อ) · บอร์ดงานสร้างทีหลัง (I3)`);
  let fx = "";
  const S: Record<string, string> = {};
  const U: Record<string, string> = {};
  const ownerId: string = PQC.coffee.users.owner.userId;
  const cashierId: string = PQC.coffee.users.cashier.userId;
  const nameOf = async (id: string): Promise<string> => String((await P.user.findUnique({ where: { id }, select: { name: true } }).catch(() => null))?.name ?? "");
  const OWNER_NAME = await nameOf(ownerId);
  try {
    const t = await P.tenant.create({ data: { name: `QC P1.11 ใบเสร็จออนไลน์ ${RAND}`, slug: T_SLUG } });
    T = t.id;
    for (const k of ["A", "N"]) U[k] = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขา${k}`, slug: `${T_SLUG}-${k.toLowerCase()}` } })).id;
    S.POSA = (await sysSvc.createSystem(T, "POS", "POS-A (ผูกบัญชี VAT)")).id;
    S.POSN = (await sysSvc.createSystem(T, "POS", "POS-N (ไม่ผูกบัญชี)")).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", "บัญชี QC P1.11")).id;
    S.MEM = (await sysSvc.createSystem(T, "MEMBER", "สมาชิก QC P1.11")).id;
    S.PTS = (await sysSvc.createSystem(T, "POINT", "แต้ม QC P1.11")).id;
    S.CHAT = (await sysSvc.createSystem(T, "CHAT", "แชท QC P1.11")).id;
    await accSvc.saveSettings(T, S.ACC, { orgName: "ร้านใบเสร็จออนไลน์คิวซี จำกัด", taxId: "0105561177639", vatRegistered: true });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POSA } });
    await sysSvc.linkUnit(T, S.POSA, U.A);
    await sysSvc.linkUnit(T, S.POSN, U.N);
    for (const s of ["MEM", "PTS", "CHAT"]) await sysSvc.linkUnit(T, S[s], U.A);
    await P.pointSettings.upsert({ where: { tenantId: T }, create: { tenantId: T, satangPerPoint: 1000 }, update: { satangPerPoint: 1000 } });
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  /** ข้อที่ต้องใช้ของใหม่: ยังไม่มี = "ยังไม่มีโมดูล/โมเดล …" (แดง) */
  const NEED = (...xs: [unknown, string][]) => xs.filter(([v]) => !v).map(([, l]) => `${MISSING} ${l} · `).join("");

  // ─── ผู้กระทำ ───
  const owner = { userId: ownerId, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const noRead = { userId: cashierId, role: "STAFF", unitAccess: [U.A], permissions: { "pos.shift.operate": true } };
  const ctxOf = (k: string, deviceId?: string): Any => ({ tenantId: T, systemId: k === "N" ? S.POSN : S.POSA, unitId: U[k], ...(deviceId ? { deviceId } : {}) });
  const rctx = (k: string): Any => ({ tenantId: T, systemId: k === "N" ? S.POSN : S.POSA });

  // ─── เครื่อง + กะ ───
  const DEV1 = `qc111${RAND}d1`;
  if (!fx) {
    const rg = await call(devMod, "registerDevice", ctxOf("A"), owner, { name: "เคาน์เตอร์ QC 1", deviceCode: DEV1 });
    if (rg?.ok !== true) console.log(`  ⚠️  registerDevice: ${codeOf(rg)} ${short(rg?.message ?? "", 80)}`);
    const o1 = await call(shiftMod, "openShift", ctxOf("A", DEV1), owner, { deviceId: DEV1, deviceLabel: "เคาน์เตอร์ QC 1", floatSatang: 0 });
    if (o1?.ok !== true) fx = `เปิดกะ: ${codeOf(o1)} ${short(o1?.message ?? "", 80)}`;
  }

  // ─── สมาชิก (C1 มี party + LINE ChatContact + อีเมล · C2 มี party ไม่มีไลน์ · C3 ไม่มี party) ───
  const C: Record<string, { id: string; name: string; phone: string; email: string; partyId: string; code: string }> = {};
  const LINE_UID = `Uqc111${RAND}line000000000000000`;
  if (!fx) {
    try {
      for (const [k, withParty, withEmail] of [["C1", true, true], ["C2", true, false], ["C3", false, false]] as const) {
        const name = `สมใจ ${k} ใบเสร็จ${RAND}`;
        const phone = `0899${k.slice(1)}${String(Math.floor(Math.random() * 1e5)).padStart(5, "0")}`;
        const email = withEmail ? `qcp111${k.toLowerCase()}member${RAND}@example.com` : "";
        const party = withParty ? await P.party.create({ data: { tenantId: T, name, phone, ...(email ? { email } : {}) } }) : null;
        const code = `QC111${k}-${RAND}`.toUpperCase();
        const c = await P.customer.create({ data: { tenantId: T, memberSystemId: S.MEM, name, phone, memberCode: code, ...(email ? { email } : {}), ...(party ? { partyId: party.id } : {}) } });
        C[k] = { id: c.id, name, phone, email, partyId: party?.id ?? "", code };
      }
      await P.chatContact.create({ data: { tenantId: T, systemId: S.CHAT, channel: "LINE", externalUserId: LINE_UID, displayName: C.C1!.name, partyId: C.C1!.partyId, customerId: C.C1!.id, blockedAt: null } });
    } catch (e) {
      fx = `สมาชิก:${(e as Error).message.slice(0, 140)}`;
    }
  }

  // ─── บิล: ขายผ่านหน้าขาย (quote → submit) ───
  type Bill = { k: string; id: string; receiptNo: string; grand: number; L: Record<string, string>; err: string };
  const B: Record<string, Bill> = {};
  let keyN = 0;
  const newKey = (p = "k") => `qc111-${RAND}-${p}-${++keyN}`;
  const row = async (id: string): Promise<Any> => (id ? P.posSale.findUnique({ where: { id }, include: { lines: { orderBy: { id: "asc" } }, payments: { orderBy: { id: "asc" } } } }).catch(() => null) : null);
  const linesOf = async (id: string): Promise<Record<string, string>> => {
    const L: Record<string, string> = {};
    if (id) for (const l of (await P.posSaleLine.findMany({ where: { saleId: id } }).catch(() => [])) as Any[]) L[l.name] = l.id;
    return L;
  };
  type LineIn = [string, number, number, number?]; // ชื่อ · จำนวน · ราคา/หน่วย · ส่วนลดบรรทัด (สตางค์)
  const regSale = async (k: string, unit: string, lines: LineIn[], pays: [string, number][], o: { member?: string; billDisc?: number; tendered?: number } = {}): Promise<Bill> => {
    const c = ctxOf(unit, unit === "A" ? DEV1 : undefined);
    const cart: Any = {
      lines: lines.map(([name, qty, unitPriceSatang, disc]) => ({ name, qty, unitPriceSatang, ...(disc ? { discount: { type: "AMOUNT", value: disc } } : {}) })),
      ...(o.billDisc ? { billDiscount: { type: "AMOUNT", value: o.billDisc } } : {}),
      ...(o.member ? { memberId: o.member } : {}),
    };
    const want = sum(lines.map(([, q, pr, d]) => q * pr - (d ?? 0))) - (o.billDisc ?? 0);
    let err = "";
    let id = "", receiptNo = "";
    if (fx) err = "fixture";
    else {
      const q = await call(register, "quoteRegisterCart", c, owner, cart);
      if (q?.ok !== true || q.grandTotalSatang !== want) err = `quote ${codeOf(q)} ${q?.grandTotalSatang} (คาด ${want}) ${short(q?.message ?? "", 60)}`;
      else {
        const cash = sum(pays.filter(([t]) => t === "CASH").map(([, n]) => n));
        const input: Any = { ...cart, idempotencyKey: newKey(`s${k}`), expectedGrandTotalSatang: want, payMethods: pays.map(([type, amountSatang]) => ({ type, amountSatang })), ...(cash > 0 ? { cashReceivedSatang: o.tendered ?? cash } : {}) };
        const r = await call(register, "submitRegisterSale", c, owner, input);
        if (r?.ok !== true) err = `submit ${codeOf(r)} ${short(r?.message ?? "", 80)}`;
        else {
          id = String(r.saleId);
          receiptNo = String(r.receiptNo ?? "");
        }
      }
    }
    if (err) console.log(`  ⚠️  บิล ${k}: ${err}`);
    const b: Bill = { k, id, receiptNo: receiptNo || String((await row(id))?.receiptNo ?? ""), grand: want, L: await linesOf(id), err };
    B[k] = b;
    return b;
  };
  const c1 = () => C.C1?.id;
  // บิล VAT + สมาชิก C1: ลาเต้ 2×50 ลดบรรทัด 10 + ขนม 50 · ลดท้ายบิล 5 → 135.00 (เงินสด 100 + พร้อมเพย์ 35)
  await regSale("bV", "A", [["ลาเต้ QC", 2, 5000, 1000], ["ขนม QC", 1, 5000]], [["CASH", 10000], ["PROMPTPAY", 3500]], { member: c1(), billDisc: 500, tendered: 10000 });
  await regSale("bW", "N", [["ของ POS-N QC", 1, 10700]], [["CASH", 10700]]);
  await regSale("bVoid", "A", [["ชา QC", 1, 4500]], [["CASH", 4500]], { member: c1() });
  await regSale("bPart", "A", [["เสื้อ QC", 1, 10000], ["หมวก QC", 1, 7500]], [["PROMPTPAY", 17500]], { member: c1() });
  await regSale("bFull", "A", [["จาน QC", 1, 6000]], [["CASH", 6000]]);
  await regSale("bOld8", "A", [["ของ 8 วัน QC", 1, 3000]], [["CASH", 3000]]);
  await regSale("bOld6", "A", [["ของ 6 วัน QC", 1, 3200]], [["CASH", 3200]]);
  await regSale("bI1", "A", [["น้ำ QC", 1, 2000]], [["CASH", 2000]]);
  await regSale("bI2", "A", [["คุกกี้ QC", 1, 2500]], [["CASH", 2500]], { member: c1() });
  await regSale("bI3", "A", [["ขนมปัง QC", 1, 2700]], [["CASH", 2700]], { member: c1() });
  await regSale("bS5", "A", [["แก้ว QC", 1, 3300]], [["CASH", 3300]]);
  await regSale("bRq", "A", [["ข้าว QC", 1, 5100]], [["CASH", 5100]], { member: c1() });
  await regSale("bC2", "A", [["ส้ม QC", 1, 1900]], [["CASH", 1900]], { member: C.C2?.id });
  await regSale("bC3", "A", [["มะนาว QC", 1, 1800]], [["CASH", 1800]], { member: C.C3?.id });
  // บิลของโมดูลอื่น (createSale ตรง · sourceModule BOOKING)
  {
    let id = "", receiptNo = "", err = "";
    if (fx) err = "fixture";
    else {
      const r = await call(svc, "createSale", { tenantId: T, unitId: U.A, systemId: S.POSA, sourceModule: "BOOKING", idempotencyKey: newKey("sbk"), lines: [{ name: "บริการจอง QC", qty: 1, unitPriceSatang: 20000 }], payMethods: [{ type: "TRANSFER", amountSatang: 20000 }] });
      if (typeof r?.saleId !== "string") err = `createSale ${codeOf(r)} ${short(r?.message ?? "", 80)}`;
      else {
        id = r.saleId;
        receiptNo = String(r.receiptNo ?? "");
      }
    }
    if (err) console.log(`  ⚠️  บิล bBook: ${err}`);
    B.bBook = { k: "bBook", id, receiptNo, grand: 20000, L: {}, err };
  }
  // บิลเก่า (ก่อน P1.11) ใส่ผ่าน prisma ตรง — ไม่มีโทเคน
  const insertOld = async (k: string, minsAgo: number): Promise<void> => {
    let id = "", err = "";
    if (fx) err = "fixture";
    else {
      try {
        const when = new Date(Date.now() - minsAgo * 60_000);
        const s = await P.posSale.create({
          data: { tenantId: T, unitId: U.A, systemId: S.POSA, idempotencyKey: newKey(k), receiptNo: `OLD-${RAND}-${k}`, status: "PAID", subtotalSatang: 5000, vatSatang: vatOf(5000, 700), grandTotalSatang: 5000, paidAt: when, createdAt: when },
        });
        id = s.id;
      } catch (e) {
        err = (e as Error).message.slice(0, 100);
      }
    }
    if (err) console.log(`  ⚠️  บิลเก่า ${k}: ${err}`);
    B[k] = { k, id, receiptNo: `OLD-${RAND}-${k}`, grand: 5000, L: {}, err };
  };
  await insertOld("bOld", 60);
  await insertOld("bOld2", 60);
  await drain(); // pos.sale.paid → ABB/แต้ม

  // ─── ย้ายเวลา (7 วัน) ───
  const redate = async (id: string, when: Date) => {
    if (id) await P.posSale.update({ where: { id }, data: { createdAt: when, paidAt: when } }).catch((e: Error) => console.log(`  ⚠️  ย้ายเวลา ${id}: ${e.message.slice(0, 60)}`));
  };
  await redate(B.bOld8!.id, new Date(Date.now() - 8 * DAY));
  await redate(B.bOld6!.id, new Date(Date.now() - 6 * DAY));

  // ─── โทเคน (อ่านด้วย SQL — client ของต้นไม้นี้อาจยังไม่รู้จักคอลัมน์) ───
  const tokenOf = async (id: string): Promise<string | null> => {
    if (!id || !HAS_TOKEN_COL) return null;
    try {
      const r = (await P.$queryRawUnsafe(`SELECT "publicToken" AS t FROM "PosSale" WHERE id = $1`, id)) as Any[];
      return (r[0]?.t as string | null) ?? null;
    } catch {
      return null;
    }
  };
  const tokBefore: Record<string, string | null> = {};
  for (const k of ["bV", "bW", "bVoid", "bPart", "bFull", "bBook", "bOld", "bOld8", "bOld6", "bI1", "bI2", "bI3", "bS5", "bRq", "bC2", "bC3"]) tokBefore[k] = await tokenOf(B[k]?.id ?? "");
  const TOK = (k: string) => tokBefore[k] ?? "";

  // ─── ทางเรียก ───
  const pub = async (token: string, label = "publicReceipt") => keep(label, await call(M.publicReceipt, "publicReceipt", token));
  const rcpOf = (r: Any): Any => (r?.ok === true ? r.receipt : null);
  const payload = async (k: string, saleId: string) => call(rcpMod, "receiptPayload", rctx(k), owner, { saleId });
  const issueRows = async (saleId: string): Promise<Any[]> => (PRI && saleId ? ((await PRI.findMany({ where: { tenantId: T, saleId }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]) : []);
  const taxRows = async (saleId: string): Promise<Any[]> => (PTR && saleId ? ((await PTR.findMany({ where: { tenantId: T, saleId }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]) : []);
  const events = async (type: string, pred: (p: Any) => boolean): Promise<Any[]> => ((await P.outboxEvent.findMany({ where: { tenantId: T, type } }).catch(() => [])) as Any[]).filter((e) => pred(e.payload ?? {}));
  const sentAudits = async (saleId: string): Promise<Any[]> => (saleId ? ((await P.auditLog.findMany({ where: { tenantId: T, action: "pos.receipt.sent", targetId: saleId }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]) : []);
  const reviewsOf = async (saleId: string): Promise<Any[]> => (saleId ? ((await P.memberReview.findMany({ where: { tenantId: T, refType: "PosSale", refId: saleId } }).catch(() => [])) as Any[]) : []);
  const BAD_TOKEN = "ZZZZZZZZZZZZ";
  const report = (token: string, input: Any, label = "report") => call(M.reportReceiptIssue, "reportReceiptIssue", token, input).then((r) => keep(label, r));
  const reqTax = (token: string, input: Any, label = "taxInvoice") => call(M.requestFullTaxInvoice, "requestFullTaxInvoice", token, input).then((r) => keep(label, r));
  const review = (token: string, input: Any, label = "review") => call(M.submitReceiptReview, "submitReceiptReview", token, input).then((r) => keep(label, r));
  const TAXREQ = { name: "บริษัท ลูกค้าคิวซี จำกัด", taxId: "0105556123457", address: "99/9 ถ.ทดสอบ แขวงสีลม เขตบางรัก กรุงเทพฯ 10500", email: `qcp111tax${RAND}@example.com` };
  const fixtureErrs = Object.values(B).filter((b) => b.err).map((b) => `${b.k}:${b.err.slice(0, 40)}`);
  const FXB = (s: string) => FX((fixtureErrs.length ? `บิลตั้งต้นล้ม ${fixtureErrs.join(",")} · ` : "") + s);
  const NT = !HAS_TOKEN_COL ? `${MISSING} คอลัมน์ PosSale.publicToken · ` : "";
  {
    const sV = await row(B.bV!.id);
    const abb0 = B.bV!.id ? await P.accountDocument.findFirst({ where: { tenantId: T, docType: "TAX_INVOICE_ABB", refType: "PosSale", refId: B.bV!.id } }).catch(() => null) : null;
    console.log(`  ตั้งต้น: บิล ${Object.values(B).filter((b) => b.id).length}/${Object.keys(B).length} · bV ${sV?.receiptNo} grand ${sV?.grandTotalSatang} vat ${sV?.vatSatang} disc ${sV?.discountSatang} แต้ม ${sV?.pointEarned} · ABB ${abb0?.docNo ?? "—"} · โทเคน bV ${TOK("bV") || "—"}`);
  }

  // ════════ T1 โทเคนในบิลใหม่ทุกชนิด ════════
  // (ใบ REFUND สร้างใน P4/P5 ด้านล่าง — T1 ตัดสินหลังคืนเงิน)
  // ════════ P1 รูปร่างใบ VAT + สมาชิก (ก่อนคืนเงิน/รีวิวใด ๆ) ════════
  {
    const p: string[] = [];
    const sV = await row(B.bV!.id);
    const r = await pub(TOK("bV"));
    const rc = rcpOf(r);
    const pl = (await payload("A", B.bV!.id))?.payload ?? null;
    const abb = B.bV!.id ? await P.accountDocument.findFirst({ where: { tenantId: T, docType: "TAX_INVOICE_ABB", refType: "PosSale", refId: B.bV!.id } }).catch(() => null) : null;
    const ptsSys: string | undefined = (await pointMod?.resolvePointSystemIds?.(T, S.MEM).catch?.(() => []))?.[0];
    const bal = ptsSys && C.C1 ? await pointMod?.getBalance?.(ptsSys, C.C1.id).catch?.(() => NaN) : NaN;
    if (!rc) p.push(`publicReceipt ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else if (!sV || !pl) p.push(`ข้อมูลอ้างอิงไม่ครบ (บิล ${!!sV} · payload ${!!pl})`);
    else {
      const unitName = (await P.businessUnit.findUnique({ where: { id: U.A }, select: { name: true } }))?.name;
      if (rc.shop?.name !== pl.shop?.name) p.push(`shop.name ${rc.shop?.name} (payload ${pl.shop?.name})`);
      if (rc.shop?.branchLabel !== unitName) p.push(`shop.branchLabel ${rc.shop?.branchLabel} (สาขา ${unitName})`);
      if ((rc.shop?.logoUrl ?? null) !== (pl.shop?.logoUrl ?? null)) p.push(`shop.logoUrl ${rc.shop?.logoUrl}`);
      if (rc.receiptNo !== sV.receiptNo) p.push(`receiptNo ${rc.receiptNo}`);
      if (pl.kind !== "TAX_INVOICE_ABB") p.push(`(ข้อมูล) payload kind ${pl.kind} — ไม่ใช่ ABB`);
      if (!abb) p.push("(ข้อมูล) ไม่มีเอกสาร ABB ของบิล");
      else if (rc.abbNo !== abb.docNo) p.push(`abbNo ${rc.abbNo} (เอกสาร ${abb.docNo})`);
      const pAt = rc.paidAt instanceof Date ? rc.paidAt.getTime() : Date.parse(String(rc.paidAt));
      if (!(sV.paidAt instanceof Date) || pAt !== sV.paidAt.getTime()) p.push(`paidAt ${short(rc.paidAt, 40)}`);
      if (rc.status !== "PAID") p.push(`status ${rc.status}`);
      if (rc.refundedSatang !== 0) p.push(`refundedSatang ${rc.refundedSatang}`);
      const L = Array.isArray(rc.lines) ? rc.lines : [];
      const PL = Array.isArray(pl.lines) ? pl.lines : [];
      if (L.length !== PL.length) p.push(`lines ${L.length} (payload ${PL.length})`);
      PL.forEach((l: Any, i: number) => {
        const x = L[i] ?? {};
        if (x.name !== l.name || x.qty !== l.qty || x.lineTotalSatang !== l.lineTotalSatang) p.push(`line${i} ${short([x.name, x.qty, x.lineTotalSatang], 60)} ≠ ${short([l.name, l.qty, l.lineTotalSatang], 60)}`);
        if ((l.options ?? []).length && short(x.options) !== short(l.options)) p.push(`line${i} options ${short(x.options, 40)}`);
      });
      if (rc.discountSatang !== sV.discountSatang || rc.discountSatang !== 500) p.push(`discountSatang ${rc.discountSatang} (บิล ${sV.discountSatang} · คาด 500)`);
      if (rc.grandTotalSatang !== sV.grandTotalSatang || rc.grandTotalSatang !== pl.totals?.grandTotalSatang || rc.grandTotalSatang !== 13500) p.push(`grand ${rc.grandTotalSatang} (บิล ${sV.grandTotalSatang} · คาด 13,500)`);
      if (sum(L.map((x: Any) => Number(x.lineTotalSatang))) - Number(rc.discountSatang) + Number(sV.serviceChargeSatang) !== rc.grandTotalSatang) p.push("Σบรรทัด − ส่วนลด + ค่าบริการ ≠ ยอดสุทธิ");
      if (!isRecord(rc.vat) || rc.vat.rateBp !== 700 || rc.vat.satang !== sV.vatSatang || rc.vat.satang !== vatOf(13500, 700) || rc.vat.included !== true) p.push(`vat ${short(rc.vat, 80)} (คาด {700, ${vatOf(13500, 700)}, true})`);
      const pays = Array.isArray(rc.payments) ? rc.payments.map((x: Any) => `${x.method}:${x.satang}`).join(",") : "x";
      const want = (sV.payments as Any[]).map((x) => `${x.type}:${x.amountSatang}`).join(",");
      if (pays !== want || want !== "CASH:10000,PROMPTPAY:3500") p.push(`payments ${pays} (คาด ${want})`);
      if (!isRecord(rc.points) || rc.points.earned !== sV.pointEarned || rc.points.balance !== bal) p.push(`points ${short(rc.points, 60)} (คาด earned ${sV.pointEarned} balance ${bal})`);
      if (!isRecord(rc.actions) || rc.actions.taxInvoice !== "AVAILABLE" || rc.actions.review !== true || rc.actions.report !== true) p.push(`actions ${short(rc.actions, 80)}`);
    }
    chk("P1", NT === "" && p.length === 0, "ตรง receiptPayload · ABB · VAT · จ่าย · แต้ม · actions", FXB(NT + NEED([M.publicReceipt, "publicReceipt"]) + (p.join(" · ") || "ครบ")));
  }
  // ════════ P2 ไม่มี PII + บิลไม่ผูกสมุด ════════
  {
    const p: string[] = [];
    const rV = rcpOf(await pub(TOK("bV")));
    const rW = rcpOf(await pub(TOK("bW")));
    const forbid = [C.C1?.name ?? "", C.C1?.phone ?? "", C.C1?.email ?? "", C.C1?.code ?? "", C.C1?.partyId ?? "", LINE_UID, OWNER_NAME, DEV1, B.bV!.id, B.bW!.id, T, U.A ?? "", U.N ?? "", S.POSA ?? "", ownerId];
    if (!rV) p.push("ไม่มีใบ bV");
    else p.push(...piiHits(rV, forbid).map((h) => `bV ${h}`));
    if (!rW) p.push("ไม่มีใบ bW");
    else {
      p.push(...piiHits(rW, forbid).map((h) => `bW ${h}`));
      if (rW.vat !== null) p.push(`bW vat ${short(rW.vat, 40)} (คาด null)`);
      if (rW.abbNo !== undefined && rW.abbNo !== null) p.push(`bW abbNo ${rW.abbNo}`);
      if (rW.points !== null) p.push(`bW points ${short(rW.points, 40)} (คาด null)`);
      if (!isRecord(rW.actions) || rW.actions.taxInvoice !== "NOT_AVAILABLE" || rW.actions.review !== false || rW.actions.report !== true) p.push(`bW actions ${short(rW.actions, 80)}`);
      if (rW.grandTotalSatang !== 10700 || rW.status !== "PAID") p.push(`bW grand/status ${rW.grandTotalSatang}/${rW.status}`);
    }
    chk("P2", NT === "" && rV && rW && p.length === 0, "ไม่มีคีย์/ค่าส่วนตัว · walk-in ไม่ผูกสมุด", FXB(NT + NEED([M.publicReceipt, "publicReceipt"]) + (p.slice(0, 8).join(" · ") || "ครบ")));
  }
  // ════════ Q1/Q2 QR ════════
  {
    const p: string[] = [];
    const tV = TOK("bV");
    const r1 = await payload("A", B.bV!.id);
    const url1 = r1?.payload?.footer?.qrEReceiptUrl;
    if (!ORIGIN) p.push("publicOrigin() ไม่มีค่าในบริบทสคริปต์");
    if (!tV) p.push("bV ไม่มีโทเคน");
    else if (url1 !== `${ORIGIN}/r/${tV}`) p.push(`qrEReceiptUrl ${short(url1, 80)} (คาด ${ORIGIN}/r/${tV})`);
    // บิลเก่า (ไม่มีโทเคน) — ได้โทเคนแบบขี้เกียจ (CONTROLLER-DECISION 4)
    const r2 = await payload("A", B.bOld2!.id);
    const t2 = await tokenOf(B.bOld2!.id);
    const url2 = r2?.payload?.footer?.qrEReceiptUrl;
    if (!tokenOk(t2)) p.push(`บิลเก่าหลัง receiptPayload โทเคน ${short(t2, 20)} (คาด ได้โทเคนแบบขี้เกียจ)`);
    else if (url2 !== `${ORIGIN}/r/${t2}`) p.push(`บิลเก่า qrEReceiptUrl ${short(url2, 80)}`);
    chk("Q1", NT === "" && p.length === 0, "URL = origin/r/token · บิลเก่าได้โทเคน", FXB(NT + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const setQr = async (on: boolean | null) => {
      const s = (await P.appSystem.findUnique({ where: { id: S.POSA }, select: { settings: true } }))?.settings ?? {};
      const pos = isRecord(s.pos) ? s.pos : {};
      const receipt = isRecord(pos.receipt) ? { ...pos.receipt } : {};
      if (on === null) delete receipt.qrEReceipt;
      else receipt.qrEReceipt = on;
      await P.appSystem.update({ where: { id: S.POSA }, data: { settings: { ...s, pos: { ...pos, receipt } } } });
    };
    try {
      await setQr(false);
      const off = await payload("A", B.bV!.id);
      if (off?.ok !== true) p.push(`payload ${codeOf(off)}`);
      else if (off.payload?.footer?.qrEReceiptUrl !== null) p.push(`ปิดแล้ว qrEReceiptUrl ${short(off.payload?.footer?.qrEReceiptUrl, 60)} (คาด null)`);
      await setQr(null);
      const on = await payload("A", B.bV!.id);
      if (!TOK("bV") || on?.payload?.footer?.qrEReceiptUrl !== `${ORIGIN}/r/${TOK("bV")}`) p.push(`เปิดคืน ${short(on?.payload?.footer?.qrEReceiptUrl, 60)}`);
    } catch (e) {
      p.push(`ตั้งค่า: ${(e as Error).message.slice(0, 80)}`);
    }
    chk("Q2", NT === "" && p.length === 0, "ปิด = null · เปิดคืน = URL", FXB(NT + (p.join(" · ") || "ครบ")));
  }

  // ════════ X ขอใบกำกับเต็มรูป (ก่อนคืนเงิน/ยกเลิก — X3 ใช้บิลหลังเปลี่ยนสถานะ) ════════
  const NX = NEED([M.requestFullTaxInvoice, "requestFullTaxInvoice"], [PTR, "PosTaxInvoiceRequest"]);
  let xReqId = "";
  {
    const p: string[] = [];
    const r = await reqTax(TOK("bV"), { ...TAXREQ, name: `  ${TAXREQ.name}  ` });
    xReqId = r?.ok === true ? String(r.requestId ?? "") : "";
    if (r?.ok !== true || !xReqId) p.push(`ขอ ${codeOf(r)} ${short(r?.message ?? "", 60)} requestId ${short(r?.requestId, 30)}`);
    const rows = await taxRows(B.bV!.id);
    const x = rows[0];
    if (rows.length !== 1) p.push(`แถว ${rows.length} (คาด 1)`);
    if (x) {
      if (x.id !== xReqId) p.push("requestId ≠ แถว");
      if (x.status !== "REQUESTED") p.push(`status ${x.status}`);
      if (x.name !== TAXREQ.name || x.taxId !== TAXREQ.taxId || x.address !== TAXREQ.address || x.email !== TAXREQ.email) p.push(`ค่า ${short([x.name, x.taxId, x.address, x.email], 120)}`);
      if (x.branchCode !== "00000") p.push(`branchCode ${x.branchCode} (คาด 00000)`);
      if (x.accountDocId !== null) p.push(`accountDocId ${x.accountDocId}`);
      if (x.unitId !== U.A || x.tenantId !== T) p.push("ร้าน/สาขา ผิด");
    }
    const ev = await events(EV_TAX, (pl) => pl.requestId === xReqId && pl.saleId === B.bV!.id);
    if (ev.length !== 1) p.push(`event ${EV_TAX} ${ev.length} (คาด 1)`);
    await drain();
    const ev2 = await events(EV_TAX, (pl) => pl.requestId === xReqId);
    if (ev2.length && ev2.some((e) => e.status !== "DONE")) p.push(`event สถานะ ${ev2.map((e) => `${e.status}${e.lastError ? `(${short(e.lastError, 40)})` : ""}`).join(",")}`);
    const rc = rcpOf(await pub(TOK("bV")));
    if (rc?.actions?.taxInvoice !== "REQUESTED") p.push(`actions.taxInvoice ${rc?.actions?.taxInvoice} (คาด REQUESTED)`);
    chk("X1", NT === "" && NX === "" && p.length === 0, "REQUESTED + event 1 DONE + actions", FXB(NT + NX + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const r = await reqTax(TOK("bV"), TAXREQ);
    if (!refused(r, "ALREADY_REQUESTED")) p.push(`ขอซ้ำ ${codeOf(r)}`);
    if ((await taxRows(B.bV!.id)).length !== 1) p.push("แถวเพิ่ม");
    if ((await events(EV_TAX, (pl) => pl.saleId === B.bV!.id)).length !== 1) p.push("event เพิ่ม");
    if (PTR && xReqId) await PTR.update({ where: { id: xReqId }, data: { status: "ISSUED" } }).catch((e: Error) => p.push(`ตั้ง ISSUED: ${e.message.slice(0, 50)}`));
    const rc = rcpOf(await pub(TOK("bV")));
    if (rc?.actions?.taxInvoice !== "ISSUED") p.push(`ISSUED → actions.taxInvoice ${rc?.actions?.taxInvoice}`);
    chk("X2", NT === "" && NX === "" && p.length === 0, "ALREADY_REQUESTED · ISSUED", FXB(NT + NX + (p.join(" · ") || "ครบ")));
  }
  // X5 ค่าผิด (บิล bOld6) → แล้ว X4 ขอสำเร็จด้วย branchCode 00001
  {
    const p: string[] = [];
    const t6 = TOK("bOld6");
    const bads: [string, Any][] = [
      ["taxId 12", { ...TAXREQ, taxId: "010555612345" }],
      ["taxId 14", { ...TAXREQ, taxId: "01055561234570" }],
      ["taxId ตัวอักษร", { ...TAXREQ, taxId: "01055561234ab" }],
      ["taxId ว่าง", { ...TAXREQ, taxId: "" }],
      ["branchCode 3", { ...TAXREQ, branchCode: "123" }],
      ["branchCode ตัวอักษร", { ...TAXREQ, branchCode: "0000a" }],
      ["name ว่าง", { ...TAXREQ, name: "   " }],
      ["address ว่าง", { ...TAXREQ, address: "" }],
      ["คีย์แปลก saleId", { ...TAXREQ, saleId: B.bV!.id }],
    ];
    for (const [lbl, inp] of bads) {
      const r = await reqTax(t6, inp, `taxInvoice ${lbl}`);
      if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    const u = await reqTax(BAD_TOKEN, TAXREQ, "taxInvoice token มั่ว");
    if (!refused(u, "TOKEN_NOT_FOUND")) p.push(`โทเคนมั่ว → ${codeOf(u)}`);
    if ((await taxRows(B.bOld6!.id)).length !== 0) p.push("ค่าผิดสร้างแถว");
    // X4 ขอสำเร็จ 6 วัน (branchCode 00001)
    const ok6 = await reqTax(t6, { ...TAXREQ, branchCode: "00001" });
    const r6 = await taxRows(B.bOld6!.id);
    const x5ok = p.length === 0;
    const p4: string[] = [];
    if (ok6?.ok !== true) p4.push(`6 วัน → ${codeOf(ok6)} ${short(ok6?.message ?? "", 60)}`);
    if (r6.length !== 1) p4.push(`6 วัน แถว ${r6.length}`);
    else if (r6[0].branchCode !== "00001") p.push(`branchCode เก็บ ${r6[0].branchCode} (คาด 00001)`);
    const r8 = await reqTax(TOK("bOld8"), TAXREQ, "taxInvoice 8 วัน");
    if (!refused(r8, "NOT_ELIGIBLE")) p4.push(`8 วัน → ${codeOf(r8)}`);
    if ((await taxRows(B.bOld8!.id)).length !== 0) p4.push("8 วัน มีแถว");
    const rc8 = rcpOf(await pub(TOK("bOld8")));
    if (rc8?.actions?.taxInvoice !== "NOT_AVAILABLE") p4.push(`8 วัน actions.taxInvoice ${rc8?.actions?.taxInvoice}`);
    const rc6 = rcpOf(await pub(t6));
    if (rc6?.actions?.taxInvoice !== "REQUESTED") p4.push(`6 วัน actions.taxInvoice ${rc6?.actions?.taxInvoice}`);
    chk("X5", NT === "" && NX === "" && x5ok && p.length === 0, "VALIDATION ×9 · TOKEN_NOT_FOUND · branchCode เก็บตรง", FXB(NT + NX + (p.join(" · ") || "ครบ")));
    chk("X4", NT === "" && NX === "" && p4.length === 0, "8 วัน NOT_ELIGIBLE · 6 วัน ขอได้", FXB(NT + NX + (p4.join(" · ") || "ครบ")));
  }

  // ════════ void / refund (R8) ════════
  let voidErr = "";
  if (B.bVoid!.id) {
    const r = await call(svc, "voidSale", T, U.A, B.bVoid!.id);
    if (r?.ok === false) voidErr = `voidSale ${codeOf(r)} ${short(r.message, 60)}`;
  }
  const doRefund = async (label: string, saleId: string, lines: [string, number][], pay: [string, number][]): Promise<{ id: string; grand: number }> => {
    const req = { saleId, lines: lines.map(([lineId, qty]) => ({ lineId, qty })), payMethods: pay.map(([type, amountSatang]) => ({ type, amountSatang })), reasonCode: "CHANGED_MIND", reason: "ลูกค้าเปลี่ยนใจ", idempotencyKey: newKey("r") };
    const r = saleId ? await call(refundMod, "refundSale", ctxOf("A", DEV1), owner, req) : { ok: false, code: "NO_SALE" };
    if (r?.ok !== true) console.log(`  ⚠️  คืน ${label}: ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    return { id: r?.ok === true ? String(r.refund?.id ?? "") : "", grand: r?.ok === true ? Number(r.refund?.grandTotalSatang) : NaN };
  };
  const rPart = await doRefund("bPart", B.bPart!.id, [[B.bPart!.L["เสื้อ QC"] ?? "", 1]], [["PROMPTPAY", 10000]]);
  const rFull = await doRefund("bFull", B.bFull!.id, [[B.bFull!.L["จาน QC"] ?? "", 1]], [["CASH", 6000]]);
  await drain();
  const refundTok = await tokenOf(rPart.id);
  const RF = (voidErr ? `void ล้ม ${voidErr} · ` : "") + (!rPart.id ? "คืนบางส่วนล้ม · " : "") + (!rFull.id ? "คืนครบล้ม · " : "");

  // ════════ T1 / T2 / T3 ════════
  const NE = NEED([M.ensureReceiptToken, "ensureReceiptToken"]);
  {
    const p: string[] = [];
    for (const k of ["bV", "bW", "bBook"]) if (!B[k]!.id) p.push(`${k} ไม่มีบิล`);
      else if (!TOK(k)) p.push(`${k} (${k === "bBook" ? "createSale ตรง" : "หน้าขาย"}) ไม่มีโทเคน`);
    if (!rPart.id) p.push("ไม่มีใบ REFUND");
    else if (!refundTok) p.push("ใบ REFUND ไม่มีโทเคน");
    const old = await tokenOf(B.bOld!.id);
    if (HAS_TOKEN_COL && old !== null) p.push(`บิลเก่า (prisma) มีโทเคน ${old} (คาด null — ตัวควบคุม)`);
    chk("T1", NT === "" && p.length === 0, "หน้าขาย · createSale · REFUND มีโทเคน · บิลเก่า null", FXB(NT + RF + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const all = Object.entries(tokBefore).filter(([k]) => k !== "bOld").map(([k, t]) => [k, t] as const);
    if (refundTok) all.push(["refund", refundTok]);
    for (const [k, t] of all) if (!tokenOk(t)) p.push(`${k} ${short(t, 20)}`);
    const vals = all.map(([, t]) => t).filter(Boolean);
    if (new Set(vals).size !== vals.length) p.push("โทเคนซ้ำกัน");
    for (const k of ["bVoid", "bPart", "bFull"]) {
      const now = await tokenOf(B[k]!.id);
      if (now !== tokBefore[k]) p.push(`${k} โทเคนเปลี่ยนหลัง void/refund (${tokBefore[k]} → ${now})`);
    }
    const again = await call(M.ensureReceiptToken, "ensureReceiptToken", T, B.bV!.id);
    const aTok = typeof again === "string" ? again : again?.token;
    if (aTok !== TOK("bV") || !TOK("bV")) p.push(`ensureReceiptToken บนบิลที่มีโทเคน → ${short(again, 40)} (คาด ${TOK("bV")})`);
    chk("T2", NT === "" && NE === "" && p.length === 0, `${all.length} โทเคนรูปแบบถูก · ไม่ซ้ำ · คงที่`, FXB(NT + NE + RF + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const id = B.bOld!.id;
    const r1 = await call(M.ensureReceiptToken, "ensureReceiptToken", T, id);
    const t1 = typeof r1 === "string" ? r1 : r1?.token;
    const db1 = await tokenOf(id);
    if (!tokenOk(t1)) p.push(`ครั้งแรก ${short(r1, 60)}`);
    if (db1 !== t1) p.push(`DB ${db1} ≠ ${t1}`);
    const r2 = await call(M.ensureReceiptToken, "ensureReceiptToken", T, id);
    const t2 = typeof r2 === "string" ? r2 : r2?.token;
    if (t2 !== t1 || (await tokenOf(id)) !== t1) p.push(`ครั้งที่สอง ${short(r2, 40)} (คาด ${t1})`);
    const r3 = await call(M.ensureReceiptToken, "ensureReceiptToken", T, "cl_not_a_sale_id_qc111");
    if (r3 !== null) p.push(`id มั่ว → ${short(r3, 60)} (คาด null)`);
    // บิลเก่าอีกใบ (bOld8 มีโทเคนแล้ว) — ใช้บิลเก่าที่ไม่มีโทเคนใหม่: ล้างโทเคน bW ไม่ได้ (คอลัมน์ unique · ไม่แตะ) ⇒ ใส่บิลเก่าอีกใบ
    await insertOld("bOld3", 30);
    const r4 = await call(M.ensureReceiptToken, "ensureReceiptToken", TIDS[0], B.bOld3!.id);
    if (r4 !== null) p.push(`tenantId ร้านอื่น → ${short(r4, 60)} (คาด null)`);
    if ((await tokenOf(B.bOld3!.id)) !== null) p.push("tenantId ร้านอื่นเขียนโทเคนลงบิล");
    chk("T3", NT === "" && NE === "" && p.length === 0, "บิลเก่าได้โทเคน · ซ้ำได้ตัวเดิม · id มั่ว/ร้านอื่น null", FXB(NT + NE + (p.join(" · ") || "ครบ")));
  }

  // ════════ P3 / P4 / P5 / P6 สถานะ ════════
  const NP = NEED([M.publicReceipt, "publicReceipt"]);
  {
    const p: string[] = [];
    const s = await row(B.bVoid!.id);
    const rc = rcpOf(await pub(TOK("bVoid")));
    if (s?.status !== "VOIDED") p.push(`(ข้อมูล) บิล ${s?.status}`);
    if (!rc) p.push("เปิดไม่ได้");
    else {
      if (rc.status !== "VOIDED" || rc.status !== expectStatus(s ?? { status: "?", refundedSatang: 0 })) p.push(`status ${rc.status}`);
      if (rc.actions?.taxInvoice !== "NOT_AVAILABLE") p.push(`actions.taxInvoice ${rc.actions?.taxInvoice}`);
    }
    chk("P3", NT === "" && NP === "" && p.length === 0, "VOIDED · NOT_AVAILABLE", FXB(NT + NP + RF + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const s = await row(B.bPart!.id);
    const rc = rcpOf(await pub(TOK("bPart")));
    if (!s || s.refundedSatang !== 10000) p.push(`(ข้อมูล) บิล refunded ${s?.refundedSatang}`);
    if (!rc) p.push("เปิดไม่ได้");
    else {
      if (rc.status !== "REFUNDED_PARTIAL") p.push(`status ${rc.status}`);
      if (rc.refundedSatang !== 10000 || rc.refundedSatang !== rPart.grand) p.push(`refundedSatang ${rc.refundedSatang} (ใบคืน ${rPart.grand})`);
      if (rc.grandTotalSatang !== 17500) p.push(`grand ${rc.grandTotalSatang}`);
      if (rc.actions?.taxInvoice !== "AVAILABLE") p.push(`actions.taxInvoice ${rc.actions?.taxInvoice} (คาด AVAILABLE)`);
    }
    chk("P4", NT === "" && NP === "" && p.length === 0, "REFUNDED_PARTIAL 10,000 · AVAILABLE", FXB(NT + NP + RF + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const rc = rcpOf(await pub(TOK("bFull")));
    if (!rc) p.push("เปิดไม่ได้");
    else {
      if (rc.status !== "REFUNDED") p.push(`status ${rc.status}`);
      if (rc.refundedSatang !== 6000 || rc.refundedSatang !== rc.grandTotalSatang) p.push(`refunded ${rc.refundedSatang} grand ${rc.grandTotalSatang}`);
      if (rc.actions?.taxInvoice !== "NOT_AVAILABLE") p.push(`actions.taxInvoice ${rc.actions?.taxInvoice}`);
    }
    chk("P5", NT === "" && NP === "" && p.length === 0, "REFUNDED · refunded = grand · NOT_AVAILABLE", FXB(NT + NP + RF + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const rr = rcpOf(await pub(refundTok ?? ""));
    if (!refundTok) p.push("ใบ REFUND ไม่มีโทเคน");
    else if (!rr) p.push("โทเคนใบคืนเปิดไม่ได้");
    else {
      if (rr.receiptNo !== B.bPart!.receiptNo) p.push(`receiptNo ${rr.receiptNo} (บิลต้นทาง ${B.bPart!.receiptNo})`);
      if (rr.status !== "REFUNDED_PARTIAL" || rr.refundedSatang !== 10000) p.push(`status ${rr.status} refunded ${rr.refundedSatang}`);
    }
    for (const [lbl, t] of [["ไม่มีจริง", BAD_TOKEN], ["ว่าง", ""], ["ผิดรูป", "abc"], ["ยาว", `${TOK("bV")}X`]] as const) {
      const r = await pub(t, `publicReceipt ${lbl}`);
      if (!refused(r, "TOKEN_NOT_FOUND")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    chk("P6", NT === "" && NP === "" && p.length === 0, "REFUND → บิลต้นทาง · TOKEN_NOT_FOUND ×4", FXB(NT + NP + RF + (p.join(" · ") || "ครบ")));
  }
  // ════════ X3 สถานะ/ชนิดที่ไม่มีสิทธิ์ขอ ════════
  {
    const p: string[] = [];
    for (const k of ["bW", "bVoid", "bFull"]) {
      const r = await reqTax(TOK(k), TAXREQ, `taxInvoice ${k}`);
      if (!refused(r, "NOT_ELIGIBLE")) p.push(`${k} → ${codeOf(r)}`);
      if ((await taxRows(B[k]!.id)).length !== 0) p.push(`${k} มีแถว`);
    }
    const okPart = await reqTax(TOK("bPart"), TAXREQ);
    if (okPart?.ok !== true) p.push(`คืนบางส่วน → ${codeOf(okPart)} (คาด ok)`);
    chk("X3", NT === "" && NX === "" && p.length === 0, "NOT_ELIGIBLE ×3 · คืนบางส่วนขอได้", FXB(NT + NX + RF + (p.join(" · ") || "ครบ")));
  }

  // ════════ I แจ้งปัญหา ════════
  const NI = NEED([M.reportReceiptIssue, "reportReceiptIssue"], [PRI, "PosReceiptIssue"]);
  let iFirst = "";
  {
    const p: string[] = [];
    const t = TOK("bI1");
    const bads: [string, Any][] = [
      ["ข้อความว่าง", { message: "" }],
      ["ช่องว่างล้วน", { message: "    " }],
      ["501 ตัว", { message: "ก".repeat(501) }],
      ["contact 121", { message: "ยอดไม่ตรง", contact: "ข".repeat(121) }],
      ["คีย์แปลก saleId", { message: "ยอดไม่ตรง", saleId: B.bV!.id }],
    ];
    for (const [lbl, inp] of bads) {
      const r = await report(t, inp, `report ${lbl}`);
      if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    const u = await report(BAD_TOKEN, { message: "ยอดไม่ตรง" }, "report token มั่ว");
    if (!refused(u, "TOKEN_NOT_FOUND")) p.push(`โทเคนมั่ว → ${codeOf(u)}`);
    if ((await issueRows(B.bI1!.id)).length !== 0) p.push("ค่าผิดสร้างแถว");
    if ((await issueRows(B.bV!.id)).length !== 0) p.push("คีย์ saleId ไปเขียนบิลอื่น");
    const r1 = await report(t, { message: "  ยอดเงินไม่ตรงกับที่จ่าย  ", contact: "  0812345678  " });
    iFirst = r1?.ok === true ? String(r1.issueId ?? "") : "";
    if (r1?.ok !== true || !iFirst) p.push(`ครั้งแรก ${codeOf(r1)} ${short(r1?.message ?? "", 60)}`);
    const r2 = await report(t, { message: "ก".repeat(500) });
    if (r2?.ok !== true) p.push(`500 ตัว → ${codeOf(r2)}`);
    const r3 = await report(t, { message: "ขอใบเสร็จใหม่" });
    if (r3?.ok !== true) p.push(`ครั้งที่ 3 → ${codeOf(r3)}`);
    const rows = await issueRows(B.bI1!.id);
    const x = rows.find((z) => z.id === iFirst);
    if (rows.length !== 3) p.push(`แถว ${rows.length} (คาด 3)`);
    if (!x) p.push("ไม่พบแถวของ issueId");
    else {
      if (x.message !== "ยอดเงินไม่ตรงกับที่จ่าย") p.push(`message "${short(x.message, 40)}"`);
      if (x.contact !== "0812345678") p.push(`contact "${x.contact}"`);
      if (x.status !== "OPEN" || x.kanbanCardId !== null) p.push(`status ${x.status} card ${x.kanbanCardId}`);
      if (x.tenantId !== T || x.unitId !== U.A || x.saleId !== B.bI1!.id) p.push("ร้าน/สาขา/บิล ผิด");
    }
    const r3row = rows.find((z) => z.id === r3?.issueId);
    if (r3row && r3row.contact !== null) p.push(`ไม่ส่ง contact → ${short(r3row.contact)}`);
    const ev = await events(EV_ISSUE, (pl) => pl.issueId === iFirst);
    if (ev.length !== 1) p.push(`event ${ev.length} (คาด 1)`);
    else {
      const pl = ev[0].payload ?? {};
      const want = { tenantId: T, unitId: U.A, saleId: B.bI1!.id, issueId: iFirst, receiptNo: B.bI1!.receiptNo, message: "ยอดเงินไม่ตรงกับที่จ่าย" };
      const keys = Object.keys(pl).sort().join(",");
      if (keys !== Object.keys(want).sort().join(",")) p.push(`payload คีย์ ${keys}`);
      for (const [k, v] of Object.entries(want)) if (pl[k] !== v) p.push(`payload.${k} ${short(pl[k], 30)}`);
    }
    if ((await events(EV_ISSUE, (pl) => pl.saleId === B.bI1!.id)).length !== 3) p.push("event ไม่ใช่ 1 ต่อแถว");
    chk("I1", NT === "" && NI === "" && p.length === 0, "แถว OPEN ตัดช่องว่าง · event payload 6 คีย์ · VALIDATION ×5 · TOKEN_NOT_FOUND", FXB(NT + NI + (p.slice(0, 8).join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const t = TOK("bI1");
    const r4 = await report(t, { message: "ครั้งที่สี่" }, "report ครั้งที่ 4");
    if (!refused(r4, "RATE_LIMITED")) p.push(`ครั้งที่ 4 → ${codeOf(r4)}`);
    if ((await issueRows(B.bI1!.id)).length !== 3) p.push("ครั้งที่ 4 สร้างแถว");
    if ((await events(EV_ISSUE, (pl) => pl.saleId === B.bI1!.id)).length !== 3) p.push("ครั้งที่ 4 สร้าง event");
    if (PRI) await PRI.updateMany({ where: { tenantId: T, saleId: B.bI1!.id }, data: { createdAt: new Date(Date.now() - 25 * HOUR) } }).catch((e: Error) => p.push(`ย้ายเวลา: ${e.message.slice(0, 50)}`));
    const r5 = await report(t, { message: "หลัง 25 ชั่วโมง" });
    if (r5?.ok !== true) p.push(`หลัง 25 ชม. → ${codeOf(r5)}`);
    if ((await issueRows(B.bI1!.id)).length !== 4) p.push(`แถว ${(await issueRows(B.bI1!.id)).length} (คาด 4)`);
    chk("I4", NT === "" && NI === "" && p.length === 0, "ครั้งที่ 4 RATE_LIMITED · 25 ชม. ผ่าน", FXB(NT + NI + (p.join(" · ") || "ครบ")));
  }
  // I2 ไม่มีบอร์ด
  const NH = NEED([M.onReceiptIssueReported, "onReceiptIssueReported"]);
  const evRowOf = async (issueId: string): Promise<Any> => (await events(EV_ISSUE, (pl) => pl.issueId === issueId))[0] ?? null;
  const asEvt = (e: Any) => (e ? { id: e.id, tenantId: e.tenantId, type: e.type, payload: e.payload, systemId: e.systemId ?? null, unitId: e.unitId ?? null } : null);
  try {
    {
      const p: string[] = [];
      const g0 = guardHits.length;
      const r = await report(TOK("bI2"), { message: "ทอนเงินผิด" });
      const iid = r?.ok === true ? String(r.issueId ?? "") : "";
      if (!iid) p.push(`report ${codeOf(r)}`);
      await drain();
      const e = await evRowOf(iid);
      if (!e) p.push("ไม่มี event");
      else if (e.status !== "DONE") p.push(`event ${e.status} ${short(e.lastError ?? "", 60)}`);
      const x = (await issueRows(B.bI2!.id))[0];
      if (x && x.kanbanCardId !== null) p.push(`kanbanCardId ${x.kanbanCardId}`);
      if ((await P.kanbanCard.count({ where: { tenantId: T } }).catch(() => -1)) !== 0) p.push("มีการ์ดในร้านที่ไม่มีบอร์ด");
      const h = await call(M.onReceiptIssueReported, "onReceiptIssueReported", asEvt(e));
      if (!(h?.posted === false && h?.reason === "no-board")) p.push(`onReceiptIssueReported → ${short(h, 80)} (คาด {posted:false, reason:"no-board"})`);
      if (guardHits.length !== g0) p.push(`แตะเครือข่าย ${guardHits.length - g0} ครั้ง (${guardHits.slice(g0).join(",")})`);
      chk("I2", NT === "" && NI === "" && NH === "" && p.length === 0, "DONE · ไม่มีการ์ด · no-board · ไม่ throw · ไม่แตะเครือข่าย", FXB(NT + NI + NH + (p.join(" · ") || "ครบ")));
    }
    // I3 มีบอร์ด
    {
      const p: string[] = [];
      let boardId = "";
      try {
        S.KAN = (await sysSvc.createSystem(T, "KANBAN", "บอร์ดงาน QC P1.11")).id;
        const b = await P.kanbanBoard.create({ data: { tenantId: T, systemId: S.KAN, name: "เรื่องจากลูกค้า (QC P1.11)" } });
        boardId = b.id;
        await P.kanbanColumn.create({ data: { tenantId: T, systemId: S.KAN, boardId, name: "เรื่องใหม่", sortOrder: 0, position: "a0" } });
        const s = (await P.appSystem.findUnique({ where: { id: S.POSA }, select: { settings: true } }))?.settings ?? {};
        const pos = isRecord(s.pos) ? s.pos : {};
        await P.appSystem.update({ where: { id: S.POSA }, data: { settings: { ...s, pos: { ...pos, receipt: { ...(isRecord(pos.receipt) ? pos.receipt : {}), issueBoardId: boardId } } } } });
      } catch (e) {
        p.push(`fixture บอร์ด: ${(e as Error).message.slice(0, 80)}`);
      }
      const g0 = guardHits.length;
      const r = await report(TOK("bI3"), { message: "สินค้าไม่ครบ" });
      const iid = r?.ok === true ? String(r.issueId ?? "") : "";
      if (!iid) p.push(`report ${codeOf(r)}`);
      await drain();
      const e = await evRowOf(iid);
      if (!e || e.status !== "DONE") p.push(`event ${e?.status ?? "ไม่มี"} ${short(e?.lastError ?? "", 60)}`);
      const x1 = (await issueRows(B.bI3!.id))[0];
      const cards = async () => ((await P.kanbanCard.findMany({ where: { tenantId: T } }).catch(() => [])) as Any[]).filter((c) => String(c.sourceKey ?? "").includes(iid));
      const c1 = await cards();
      if (c1.length !== 1) p.push(`การ์ด ${c1.length} (คาด 1)`);
      else {
        if (c1[0].boardId !== boardId) p.push("การ์ดไม่อยู่บนบอร์ดที่ตั้ง");
        if (!String(c1[0].title ?? "").includes(B.bI3!.receiptNo)) p.push(`ชื่อการ์ด "${short(c1[0].title, 50)}" ไม่มีเลขบิล`);
        if (!x1 || x1.kanbanCardId !== c1[0].id) p.push(`issue.kanbanCardId ${x1?.kanbanCardId} (การ์ด ${c1[0].id})`);
      }
      const cons = consMod?.consumers?.[EV_ISSUE];
      if (typeof cons !== "function") p.push(`ไม่มี consumers["${EV_ISSUE}"]`);
      else
        for (let i = 0; i < 2; i++) {
          try {
            await cons(asEvt(e));
          } catch (err) {
            p.push(`เล่นซ้ำรอบ ${i + 1} throw ${(err as Error).message.slice(0, 50)}`);
          }
        }
      const c2 = await cards();
      const x2 = (await issueRows(B.bI3!.id))[0];
      if (c2.length !== 1 || (c1[0] && c2[0]?.id !== c1[0].id)) p.push(`หลังเล่นซ้ำ การ์ด ${c2.length}`);
      if (x1 && x2 && x2.kanbanCardId !== x1.kanbanCardId) p.push("kanbanCardId เปลี่ยนหลังเล่นซ้ำ");
      const h = await call(M.onReceiptIssueReported, "onReceiptIssueReported", asEvt(e));
      if (!(h?.posted === false && h?.reason === "already-posted")) p.push(`onReceiptIssueReported ซ้ำ → ${short(h, 80)} (คาด {posted:false, reason:"already-posted"})`);
      if (guardHits.length !== g0) p.push(`แตะเครือข่าย ${guardHits.length - g0} ครั้ง`);
      chk("I3", NT === "" && NI === "" && NH === "" && p.length === 0, "การ์ด 1 ใบ · id คงที่หลังเล่นซ้ำ ×2 · already-posted", FXB(NT + NI + NH + (p.join(" · ") || "ครบ")));
    }

    // ════════ V รีวิว ════════
    const NV = NEED([M.submitReceiptReview, "submitReceiptReview"]);
    {
      const p: string[] = [];
      const bad: [string, Any][] = [["rating 0", { rating: 0 }], ["rating 6", { rating: 6 }], ["rating 2.5", { rating: 2.5 }], ["rating \"5\"", { rating: "5" }], ["body 501", { rating: 5, body: "ค".repeat(501) }]];
      for (const [lbl, inp] of bad) {
        const r = await review(TOK("bV"), inp, `review ${lbl}`);
        if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)}`);
      }
      const nm = await review(TOK("bW"), { rating: 5 }, "review ไม่มีสมาชิก");
      if (!refused(nm, "NO_MEMBER")) p.push(`ไม่มีสมาชิก → ${codeOf(nm)}`);
      const u = await review(BAD_TOKEN, { rating: 5 }, "review token มั่ว");
      if (!refused(u, "TOKEN_NOT_FOUND")) p.push(`โทเคนมั่ว → ${codeOf(u)}`);
      if ((await reviewsOf(B.bV!.id)).length !== 0) p.push("ค่าผิดสร้าง MemberReview");
      if ((await reviewsOf(B.bW!.id)).length !== 0) p.push("บิลไม่มีสมาชิกมี MemberReview");
      chk("V2", NT === "" && NV === "" && p.length === 0, "NO_MEMBER · VALIDATION ×5 · TOKEN_NOT_FOUND · ไม่มีแถว", FXB(NT + NV + (p.join(" · ") || "ครบ")));
    }
    {
      const p: string[] = [];
      const r = await review(TOK("bV"), { rating: 5, body: "  กาแฟอร่อย บริการดี  " });
      if (r?.ok !== true) p.push(`ส่ง → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
      const rows = await reviewsOf(B.bV!.id);
      if (rows.length !== 1) p.push(`MemberReview ${rows.length} (คาด 1)`);
      else {
        const x = rows[0];
        if (x.customerId !== C.C1?.id || x.status !== "NEW" || x.rating !== 5 || x.body !== "กาแฟอร่อย บริการดี") p.push(`แถว ${short([x.customerId === C.C1?.id, x.status, x.rating, x.body], 80)}`);
        if (x.systemId !== S.MEM) p.push("systemId ไม่ใช่ระบบสมาชิกของลูกค้า");
      }
      // บิลที่ระบบสมาชิกขอรีวิวไว้แล้ว (REQUESTED จาก journey) → ลูกค้ารีวิวจากหน้าใบเสร็จได้ แถวเดิมเป็น NEW
      let reqId = "";
      if (B.bRq!.id && C.C1) {
        const rq = await call(memberMod, "requestReview", { tenantId: T, systemId: S.MEM, actorUserId: null }, { customerId: C.C1.id, refType: "PosSale", refId: B.bRq!.id }, {});
        reqId = String(rq?.reviewId ?? "");
        if (!reqId) p.push(`(ข้อมูล) requestReview ${short(rq, 60)}`);
      }
      const r2 = await review(TOK("bRq"), { rating: 4 });
      const rq2 = await reviewsOf(B.bRq!.id);
      if (r2?.ok !== true) p.push(`บิลที่ขอรีวิวไว้แล้ว → ${codeOf(r2)} ${short(r2?.message ?? "", 60)}`);
      if (rq2.length !== 1 || rq2[0]?.id !== reqId || rq2[0]?.status !== "NEW" || rq2[0]?.rating !== 4) p.push(`บิลที่ขอรีวิวไว้แล้ว แถว ${short(rq2.map((x: Any) => [x.id === reqId, x.status, x.rating]), 80)}`);
      chk("V1", NT === "" && NV === "" && p.length === 0, "MemberReview NEW 5★ ผ่าน member · REQUESTED → NEW แถวเดิม", FXB(NT + NV + (p.join(" · ") || "ครบ")));
    }
    {
      const p: string[] = [];
      const r = await review(TOK("bV"), { rating: 1, body: "เปลี่ยนใจ" }, "review ซ้ำ");
      if (!refused(r, "ALREADY_REVIEWED")) p.push(`ส่งซ้ำ → ${codeOf(r)}`);
      const rows = await reviewsOf(B.bV!.id);
      if (rows.length !== 1 || rows[0]?.rating !== 5) p.push(`แถว ${rows.length} rating ${rows[0]?.rating}`);
      const rc = rcpOf(await pub(TOK("bV")));
      if (rc?.actions?.review !== false) p.push(`actions.review ${rc?.actions?.review} (คาด false)`);
      chk("V3", NT === "" && NV === "" && p.length === 0, "ALREADY_REVIEWED · 1 แถว · actions.review false", FXB(NT + NV + (p.join(" · ") || "ครบ")));
    }

    // ════════ S ส่งใบเสร็จ ════════
    const NS = NEED([M.sendReceipt, "sendReceipt"]);
    const lineCalls: Any[] = [];
    const fakeLine = async (c: Any, input: Any) => {
      lineCalls.push({ ctx: c, input });
      return { ok: true, externalMessageId: `qc-line-${lineCalls.length}` };
    };
    const mailCalls: { url: string; body: Any }[] = [];
    const fakeFetch = (async (u: Any, init?: Any) => {
      let body: Any = null;
      try {
        body = JSON.parse(String(init?.body ?? "null"));
      } catch {
        body = String(init?.body ?? "");
      }
      mailCalls.push({ url: String(u), body });
      return new Response(JSON.stringify({ id: `re_qc_${mailCalls.length}` }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const DEPS = { deps: { line: fakeLine, fetch: fakeFetch } };
    const send = (k: string, a: Any, input: Any, opts: Any = DEPS, label = "send") => call(M.sendReceipt, "sendReceipt", rctx(k), a, input, opts).then((r) => keep(label, r));
    const shopName = String((await payload("A", B.bV!.id))?.payload?.shop?.name ?? "");
    {
      const p: string[] = [];
      const g0 = guardHits.length;
      const r = await send("A", owner, { saleId: B.bV!.id, via: "LINE" });
      if (r?.ok !== true) p.push(`LINE → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
      const s = await row(B.bV!.id);
      const want = lineText(B.bV!.receiptNo, money((s?.grandTotalSatang ?? 0) - (s?.refundedSatang ?? 0)), `${ORIGIN}/r/${TOK("bV")}`);
      if (lineCalls.length !== 1) p.push(`deps.line ถูกเรียก ${lineCalls.length} ครั้ง`);
      else {
        const { ctx: lc, input: li } = lineCalls[0];
        if (lc?.tenantId !== T) p.push(`ctx.tenantId ${lc?.tenantId}`);
        if (li?.partyId !== C.C1?.partyId) p.push(`partyId ${li?.partyId} (คาด party ของ C1)`);
        if (li?.text !== want) p.push(`ข้อความ "${short(li?.text, 120)}" (คาด "${want}")`);
      }
      const au = await sentAudits(B.bV!.id);
      if (au.length !== 1) p.push(`audit ${au.length} (คาด 1)`);
      else {
        const a = au[0];
        if (a.targetType !== "PosSale" || a.actorId !== ownerId || a.after?.via !== "LINE" || !("to" in (a.after ?? {}))) p.push(`audit ${short({ t: a.targetType, actor: a.actorId === ownerId, after: a.after }, 100)}`);
        const leak = auditLeaks(a, [C.C1?.name ?? "", C.C1?.phone ?? "", C.C1?.email ?? "", LINE_UID]);
        if (leak.length) p.push(`audit มีค่าดิบ ${leak.map((x) => x.slice(0, 12)).join(",")}`);
      }
      if (guardHits.length !== g0) p.push(`แตะเครือข่าย ${guardHits.length - g0}`);
      chk("S1", NT === "" && NS === "" && p.length === 0, "deps.line 1 ครั้ง · partyId · ข้อความตรง · audit ปิดบัง", FXB(NT + NS + (p.join(" · ") || "ครบ")));
    }
    {
      const p: string[] = [];
      const g0 = guardHits.length;
      const l0 = lineCalls.length;
      const a = await send("N", owner, { saleId: B.bW!.id, via: "LINE" }, DEPS, "send LINE walk-in");
      if (!refused(a, "NO_LINE_IDENTITY")) p.push(`walk-in → ${codeOf(a)}`);
      const b = await send("A", owner, { saleId: B.bC3!.id, via: "LINE" }, DEPS, "send LINE ไม่มี party");
      if (!refused(b, "NO_LINE_IDENTITY")) p.push(`สมาชิกไม่มี party → ${codeOf(b)}`);
      if (lineCalls.length !== l0) p.push(`deps.line ถูกเรียก ${lineCalls.length - l0} ครั้ง`);
      const c = await send("A", owner, { saleId: B.bC2!.id, via: "LINE" }, {} as Any, "send LINE ทางจริง ไม่มีไลน์"); // ORACLE-EDIT (controller · builder S2): {} ไม่ใช่ undefined — default param จะฉีด fake deps
      if (!refused(c, "NO_LINE_IDENTITY")) p.push(`มี party ไม่มีไลน์ (ทางจริง) → ${codeOf(c)} ${short(c?.message ?? "", 60)}`);
      for (const k of ["bW", "bC3", "bC2"]) if ((await sentAudits(B[k]!.id)).length) p.push(`${k} มี audit`);
      if (guardHits.length !== g0) p.push(`แตะเครือข่าย ${guardHits.length - g0} (${guardHits.slice(g0).join(",")})`);
      chk("S2", NT === "" && NS === "" && p.length === 0, "NO_LINE_IDENTITY ×3 · ไม่มี audit · ไม่แตะเครือข่าย", FXB(NT + NS + (p.join(" · ") || "ครบ")));
    }
    {
      const p: string[] = [];
      const g0 = guardHits.length;
      const addr = `qcp111given${RAND}@example.com`;
      const m0 = mailCalls.length;
      const r1 = await send("A", owner, { saleId: B.bV!.id, via: "EMAIL", email: addr });
      if (r1?.ok !== true) p.push(`ที่อยู่ที่ส่ง → ${codeOf(r1)} ${short(r1?.message ?? "", 60)}`);
      const m1 = mailCalls.slice(m0);
      if (m1.length !== 1) p.push(`fetch ปลอม ${m1.length} ครั้ง`);
      else {
        const { url, body } = m1[0]!;
        if (!/^https:\/\/api\.resend\.com\/emails$/.test(url)) p.push(`url ${url}`);
        if (short(body?.to) !== short([addr])) p.push(`to ${short(body?.to, 60)}`);
        const subj = `ใบเสร็จ ${B.bV!.receiptNo} · ${shopName}`;
        if (body?.subject !== subj) p.push(`subject "${short(body?.subject, 80)}" (คาด "${subj}")`);
        const html = String(body?.html ?? "");
        if (!/data-section=["']lines["']/.test(html)) p.push("html ไม่มีส่วนใบเสร็จ (renderReceiptHtml)");
        if (!html.includes(B.bV!.receiptNo)) p.push("html ไม่มีเลขบิล");
        if (!html.includes(`/r/${TOK("bV")}`)) p.push("html ไม่มีลิงก์ /r/<token>");
      }
      const r2 = await send("A", owner, { saleId: B.bV!.id, via: "EMAIL" });
      const m2 = mailCalls.slice(m0 + 1);
      if (r2?.ok !== true) p.push(`อีเมลสมาชิก → ${codeOf(r2)}`);
      if (m2.length !== 1 || short(m2[0]?.body?.to) !== short([C.C1?.email])) p.push(`อีเมลสมาชิก to ${short(m2[0]?.body?.to, 60)}`);
      const n = await send("N", owner, { saleId: B.bW!.id, via: "EMAIL" }, DEPS, "send EMAIL ไม่มีอีเมล");
      if (!refused(n, "NO_EMAIL")) p.push(`walk-in ไม่มีอีเมล → ${codeOf(n)}`);
      const v = await send("A", owner, { saleId: B.bV!.id, via: "EMAIL", email: "not-an-email" }, DEPS, "send EMAIL รูปแบบผิด");
      if (!refused(v, "VALIDATION")) p.push(`รูปแบบผิด → ${codeOf(v)}`);
      if (mailCalls.length !== m0 + 2) p.push(`fetch ปลอมรวม ${mailCalls.length - m0} (คาด 2)`);
      const au = (await sentAudits(B.bV!.id)).filter((x) => x.after?.via === "EMAIL");
      if (au.length !== 2) p.push(`audit EMAIL ${au.length} (คาด 2)`);
      for (const a of au) {
        const leak = auditLeaks(a, [addr, C.C1?.email ?? "", `qcp111given${RAND}`, `qcp111c1member${RAND}`]);
        if (leak.length) p.push("audit มีที่อยู่ดิบ");
        if (typeof a.after?.to !== "string" || !a.after.to.includes("@")) p.push(`audit to ${short(a.after?.to, 40)}`);
      }
      if (guardHits.length !== g0) p.push(`ตัวกั้น fetch จริง ${guardHits.length - g0} ครั้ง (ไม่ได้ใช้ deps.fetch)`);
      chk("S3", NT === "" && NS === "" && p.length === 0, "Resend ปลอม 2 ครั้ง · subject/html/ลิงก์ · NO_EMAIL · VALIDATION · audit ปิดบัง", FXB(NT + NS + (p.slice(0, 8).join(" · ") || "ครบ")));
    }
    {
      const p: string[] = [];
      const l0 = lineCalls.length, m0 = mailCalls.length;
      const a = await send("A", owner, { saleId: B.bVoid!.id, via: "LINE" }, DEPS, "send LINE VOIDED");
      const b = await send("A", owner, { saleId: B.bVoid!.id, via: "EMAIL", email: `qcp111v${RAND}@example.com` }, DEPS, "send EMAIL VOIDED");
      if (!refused(a, "SALE_VOIDED")) p.push(`LINE VOIDED → ${codeOf(a)}`);
      if (!refused(b, "SALE_VOIDED")) p.push(`EMAIL VOIDED → ${codeOf(b)}`);
      const u = await send("A", owner, { saleId: "cl_not_a_sale_qc111", via: "LINE" }, DEPS, "send id มั่ว");
      if (!refused(u, "SALE_NOT_FOUND")) p.push(`id มั่ว → ${codeOf(u)}`);
      const x = await send("A", noRead, { saleId: B.bV!.id, via: "EMAIL", email: `qcp111x${RAND}@example.com` }, DEPS, "send ไม่มีสิทธิ์");
      if (!refused(x, "PERMISSION_DENIED")) p.push(`ไม่มีสิทธิ์ → ${codeOf(x)}`);
      if (lineCalls.length !== l0 || mailCalls.length !== m0) p.push(`deps ถูกเรียก (line ${lineCalls.length - l0} · mail ${mailCalls.length - m0})`);
      if ((await sentAudits(B.bVoid!.id)).length) p.push("VOIDED มี audit");
      if ((await sentAudits(B.bV!.id)).length !== 3) p.push(`bV audit ${(await sentAudits(B.bV!.id)).length} (คาด 3 จาก S1+S3)`);
      chk("S4", NT === "" && NS === "" && p.length === 0, "SALE_VOIDED ×2 · SALE_NOT_FOUND · PERMISSION_DENIED · ไม่มี audit", FXB(NT + NS + RF + (p.join(" · ") || "ครบ")));
    }
    {
      const p: string[] = [];
      const id = B.bS5!.id;
      for (let i = 1; i <= 5; i++) {
        const r = await send("A", owner, { saleId: id, via: "EMAIL", email: `qcp111s5n${i}${RAND}@example.com` });
        if (r?.ok !== true) p.push(`ครั้งที่ ${i} → ${codeOf(r)}`);
      }
      const m0 = mailCalls.length;
      const r6 = await send("A", owner, { saleId: id, via: "EMAIL", email: `qcp111s5n6${RAND}@example.com` }, DEPS, "send ครั้งที่ 6");
      if (!refused(r6, "RATE_LIMITED")) p.push(`ครั้งที่ 6 → ${codeOf(r6)}`);
      if (mailCalls.length !== m0) p.push("ครั้งที่ 6 เรียก fetch");
      const au = await sentAudits(id);
      if (au.length !== 5) p.push(`audit ${au.length} (คาด 5)`);
      await P.auditLog.updateMany({ where: { tenantId: T, action: "pos.receipt.sent", targetId: id }, data: { createdAt: new Date(Date.now() - 25 * HOUR) } }).catch((e: Error) => p.push(`ย้ายเวลา: ${e.message.slice(0, 50)}`));
      const r7 = await send("A", owner, { saleId: id, via: "EMAIL", email: `qcp111s5n7${RAND}@example.com` });
      if (r7?.ok !== true) p.push(`หลัง 25 ชม. → ${codeOf(r7)}`);
      if ((await sentAudits(id)).length !== 6) p.push(`audit หลัง 25 ชม. ${(await sentAudits(id)).length} (คาด 6)`);
      chk("S5", NT === "" && NS === "" && p.length === 0, "5 ผ่าน · ครั้งที่ 6 RATE_LIMITED · 25 ชม. ผ่าน", FXB(NT + NS + (p.join(" · ") || "ครบ")));
    }
  } finally {
    removeFetchGuard();
  }
  if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);

  // ════════ D1 ปฏิเสธเป็นข้อมูล ════════
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
    chk("D1", p.length === 0, `${dataRefusals.length} คำปฏิเสธ · ครบ ${ALL_CODES.length} รหัส · ไทย · ไม่ throw`, p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || "ครบ");
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
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  installFetchGuard(); // drain ก่อนลบร้านก็ต้องไม่แตะเครือข่าย (journey/เว็บฮุคของ event ที่ค้าง)
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
chk("Z1", tempLeft.length === 0 && wipe.tenantLeft === 0 && !wipe.err, "ร้านชั่วคราว 0 แถว · Tenant ถูกลบ",
  [tempLeft.length ? `ร้านชั่วคราวเหลือ ${tempLeft.join(", ")}` : `ร้านชั่วคราว 0 (${wipe.tables} ตาราง)`, wipe.tenantLeft ? "แถว Tenant ยังอยู่" : "", wipe.err].filter(Boolean).join(" · "));
const countsAfter = await snapshotCounts();
const drift = Object.keys(countsBefore).filter((k) => countsBefore[k] !== countsAfter[k]).map((k) => `${k}:${countsBefore[k]}→${countsAfter[k]}`);
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
chk("Z2", drift.length === 0 && fpDrift.length === 0 && !Object.values(fpBefore).some((v) => v.startsWith("err")), "ร้าน QC ก่อน = หลัง (นับ + ลายนิ้วมือ)",
  [drift.length ? `นับ: ${drift.join(", ")}` : "นับเท่าเดิม", fpDrift.length ? `ลายนิ้วมือ: ${fpDrift.join(", ")}` : `ลายนิ้วมือเท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => (v.startsWith("err") ? `${k}=${v}` : `${k}=${v.split(":")[0]}`)).join(" ")})`].join(" · "));
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, missing: skipReasons, guardHits: guardHits.length, a5: { drift, fpDrift, tempLeft } })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P1.11: ออกใบกำกับเต็มรูป + DBD (P1.13) · e-Tax (P3) · จอลูกค้า 11A (P2) · ความยินยอม/journey · adapter แชทใหม่ ·
// หน้าจอทั้งหมดของ §3 (visual ของผู้คุมงาน) · ข้อความ i18n pos.receipt.public/send/issue/taxInvoice (ผู้ตรวจ)
