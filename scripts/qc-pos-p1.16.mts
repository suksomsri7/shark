// QC — POS RUN ใบ P1.16 (ครึ่งเซิร์ฟเวอร์ S): หน้า "บิลวันนี้" · billsPageData · billDetail · voidSaleAction · ของค้าง P1.8 (R5b) · เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ
// requires: pos-seed
//
// สัญญา: ledger/pos-briefs/pos-brief-P1.16.md §2 R1–R6 (+R5b) · §4 · §5 CD1–CD5 · pos-brief-COMMON · pos-brief-LANE-RULES
//        สัญญาที่ต่อยอด: ledger/wo-notes/pos-P1.8.md §4 + §9 (refundSale · saleForRefund) · pos-P1.10.md "Contract for P1.10U" + fix round 1
//        (receiptPayload · reprintReceiptAction) · voidSale(tenantId, unitId, saleId[, opts]) — opts คือของใหม่ใบนี้
//        โน้ต: ledger/wo-notes/pos-P1.16-oracle.md (ตารางชื่อ · ผังข้อมูลทดสอบ · ความคลาดเคลื่อน · CONTROLLER-DECISION · ผลแดงที่คาด)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้และลงทะเบียนในตารางชื่อของโน้ต — ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P1.16 (S) ต้องส่ง (ย่อจาก brief §2):
//   src/lib/modules/pos/bills.ts: billsPageData(ctx, actor, q) · billDetail(ctx, actor, {unitId, saleId}) · voidSaleByActor(ctx, actor, input)
//     ctx = RegisterCtx {tenantId, systemId, unitId} (unitId ของ input เป็นตัวตัดสิน) · actor = RegisterActor {userId, role, unitAccess, permissions}
//   src/lib/modules/pos/bills-actions.ts ("use server"): billsPageDataAction({systemId, ...q}) · billDetailAction({systemId, unitId, saleId}) ·
//     voidSaleAction({systemId, unitId, saleId, reason, idempotencyKey}) — คืน {ok:false, code, message} เสมอ ไม่ throw
//   src/lib/modules/pos/bills-shared.ts (client import ได้): ชนิดข้อมูล + BILLS_ERROR_KEYS (รหัส → คีย์ pos.bills.errors.*)
//   src/lib/modules/pos/receipt-shared.ts: receiptKindOf({vatRegistered, posAbbreviatedInvoice, taxId, vatSatang}) — receipt.ts ใช้ตัวเดียวกัน
//   service.ts voidSale อาร์กิวเมนต์ที่ 4 ไม่บังคับ {actorUserId, reason} → AuditLog pos.sale.void ใน tx เดียวกัน · ผู้เรียกเดิม 3 อาร์กิวเมนต์ไม่เปลี่ยน
//   R5b: account/index.ts applyExternalRefund ใช้ vatSatang ของใบคืน POS (สมุดจด VAT) · service.ts saleStatusByKey คืน null เมื่อแถวใต้คีย์เป็นใบ REFUND
//   แท็บ /pos/sales ชื่อ "บิลวันนี้" (tabs.ts + app/layout.tsx)
//
// ขอบเขต: ST สถิต · B billsPageData · D billDetail · V voidSaleAction · R5b ของค้าง P1.8 · NC ตัวควบคุมลบ · Z คืนสภาพ
//   ครึ่ง UI (U1–U9 จอ 12) = visual ของผู้คุมงาน + ผู้ตรวจ — ไม่อยู่ในข้อสอบนี้
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p1.8/p1.10): SKIP เมื่อของ P1.16 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = รันเฉพาะข้อสถิต ST1–ST5 + NC (exit 1 ถ้าแดง)
//    ฐาน = QC4 เท่านั้น (ก่อนเขียนแถวแรกต้องเป็น host ep-frosty-lab) · ร้านชั่วคราว `qc-p116-<rand>` (ลบทั้งร้านใน finally · พิมพ์แถวค้าง = 0)
//    ร้าน QC ของ seed ไม่ถูกเขียน (ใช้แค่ userId เจ้าของ/แคชเชียร์/เจ้าของร้านอาหาร เป็นผู้กระทำ) — Z1 นับแถวก่อน/หลัง
//    🔴 วันที่ทดสอบ D0 = "เมื่อวาน" ตามเวลาไทยจากนาฬิกา (ไม่ฮาร์ดโค้ด) · D0−1 = "เมื่อวานของ D0" — บิลทุกใบถูกย้ายเวลา (createdAt/paidAt)
//       ไปอยู่ใน D0/D0−1 ⇒ เวลาทุกแถวอยู่ในอดีต การรันข้ามเที่ยงคืนไม่ทำให้ผลเปลี่ยน และคืนเงิน/พิมพ์สำเนา (ตอนนี้) เกิดหลังบิลเสมอ
//    เรียก action จริง (billsPageDataAction · billDetailAction · voidSaleAction · reprintReceiptAction) ด้วย session ปลอม
//       (แทน src/lib/core/context.ts ใน require cache ตอนโหลดไฟล์ action — แบบเดียวกับ qc-pos-p1.17 / qc-chat-staff-perms)
//    โมดูลที่ยังไม่มีโหลดแบบไดนามิก (`import(… as string)` + catch) — next build ตรวจชนิด scripts/*.mts · ไม่ import lib/env แบบ static
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p1.16";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · X1 idempotency/เล่นซ้ำ · X2 ข้ามขอบเขต · X3 สิทธิ์ · X4 เงิน · X5 ผลข้างเคียงครบทุกทาง · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P1.16-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "S", "[R1 R2 R3 R6] มีไฟล์ bills.ts bills-actions.ts bills-shared.ts receipt-shared.ts · bills.ts export billsPageData billDetail voidSaleByActor · receipt-shared export receiptKindOf และ receipt.ts เรียก receiptKindOf · voidSale มีพารามิเตอร์ที่ 4 ไม่บังคับ (คืน Promise<void> เดิม) · แท็บ /pos/sales ชื่อ \"บิลวันนี้\" ทั้ง tabs.ts และ layout.tsx"),
  D("ST2", "S", "[R1 R3] bills-actions.ts: \"use server\" บรรทัดแรก · export เฉพาะ async function · มี billsPageDataAction billDetailAction voidSaleAction · ทุกตัวเรียก requireTenant + มี catch + unstable_rethrow · ไม่มี throw · เรียก billsPageData / billDetail / voidSaleByActor ตามลำดับ"),
  D("ST3", "S", "[R1 R2] bills-shared.ts และ receipt-shared.ts ไม่ import ของฝั่งเซิร์ฟเวอร์ (core/db · core/context · @prisma/client ที่ไม่ใช่ import type · server-only · next/headers · next/cache · โมดูล pos ฝั่งเซิร์ฟเวอร์) · ไม่มี \"use server\""),
  D("ST4", "S", "[R3] ข้อความ pos.bills.errors.{noPermission saleNotFound saleNotVoidable hasRefunds shiftClosed reasonRequired validation unknown} th (มีอักษรไทย) + en (ไม่มีอักษรไทย) · bills-shared BILLS_ERROR_KEYS รหัส→คีย์ ตรงตาราง 8 รหัส"),
  D("ST5", "S", "[R2] receiptKindOf บริสุทธิ์: จด VAT + เปิดใบกำกับอย่างย่อ POS + มีเลขผู้เสียภาษี + vatSatang>0 = TAX_INVOICE_ABB · ขาดข้อใดข้อหนึ่ง (taxId ว่าง/ช่องว่าง/null · vatSatang 0) = RECEIPT"),
  // ── B billsPageData ──
  D("B1", "X2", "[R1] ขอบเขต/สิทธิ์: พนักงานที่เข้าได้เฉพาะสาขา A ขอสาขา B → ok รายการว่าง counts.all 0 (ไม่ปฏิเสธ) · สาขาของ POS อื่นใต้ systemId นี้ → ว่าง · ไม่มี pos.sale.read/pos.sale.create เลย → NO_PERMISSION · เจ้าของขอ B → 1 บิล (ตัวควบคุมบวก) · billsPageDataAction (session) = billsPageData (บริการ) ทุกไบต์"),
  D("B2", "-", "[R1] หน้าต่างวันตามเวลาไทย: D0 มีบิล 00:00:30 น. ของ D0 (= 17:00:30Z ของ D0−1) · ไม่มีบิล 23:30 น. ของ D0−1 · D0−1 = 2 บิลพอดี · date ผิดรูป → VALIDATION"),
  D("B3", "-", "[R1] counts {all paid voided refunded offShiftCash} ของวันตามแบบของข้อสอบ (13 · 9 · 2 · 2 · 1) · counts เท่าเดิมเมื่อกรองสถานะ · กรอง PAID/VOIDED/REFUNDED/OFF_SHIFT_CASH ได้ชุด id ตรงเป๊ะ"),
  D("B4", "X4", "[R1] ใบ REFUND ไม่เป็นแถวเลย · refunds[] ห้อยที่บิลขาย {id receiptNo grandTotalSatang} ตรงใบคืน · บิลคืนบางส่วน status PAID refundedSatang 10,000 · คืนครบ status REFUNDED · บิลคืนสองใบมี refunds 2 รายการ"),
  D("B5", "-", "[R1] ช่องของแถว: time (ISO = paidAt) · sourceModule · customer {name, sub} (sub มีรหัสสมาชิก ไม่มี id) หรือ null · payMethods ตามลำดับ PAY_TYPE_ORDER (\"CASH+PROMPTPAY\") · staffName (ผู้ขาย · \"ระบบ\" เมื่อ null) · grandTotalSatang · offShiftCash · voidApprovedBy = ชื่อผู้ยกเลิกจาก audit (ไม่มี audit = ไม่มีค่า)"),
  D("B6", "X4", "[R1] summary ตามเลขคณิตของข้อสอบ: netSatang 61,600 (PAID+REFUNDED − refunded · ไม่นับ VOIDED) · billCount 11 · storeCount 10 · onlineCount 1 · avgSatang 5,600 · yesterdayAvgSatang 7,500"),
  D("B7", "X2", "[R1] q: เลขบิลเต็ม → 1 แถว · prefix ของเลขบิล → ชุดที่ขึ้นต้นตรง · ชื่อลูกค้า (คำแรก) / เบอร์ → บิลของสมาชิก · \"%\" และ \"_\" → 0 แถว (escape LIKE) · q 61 ตัว → VALIDATION"),
  D("B8", "-", "[R1] channel BOOKING → บิลโมดูลอื่นใบเดียว · channel POS → ที่เหลือ · staffUserId ผู้จัดการ → 2 บิลของเขา · channels = {POS, BOOKING} · staff = {เจ้าของ, ผู้จัดการ} พร้อมชื่อ · หน้า 1 (10) + หน้า 2 (3) เรียงเวลาใหม่→เก่า ไม่ซ้ำ ครบ 13 · total 13 · pageSize 20 = 13 แถว · pageSize 15 → VALIDATION"),
  // ── D billDetail ──
  D("D1", "X4", "[R2] รูปร่าง + เอกลักษณ์ยอด: subtotal − lineDiscount − billDiscount − coupon − tier + serviceCharge = grandTotal · grandTotal − vatSatang = vatBase ของ receiptPayload · totals ตรง receiptPayload ทุกช่อง · lines/payments (รับ/ทอน)/member/accounting/refunds/deviceName/shiftNo ตรง DB · billDetail ไม่เขียน audit · บิลอีกสาขา/id มั่ว → SALE_NOT_FOUND"),
  D("D2", "-", "[R2] receiptKind = receiptPayload.kind ของบิลเดียวกัน: POS ผูกสมุดจด VAT (ใบกำกับอย่างย่อเปิด) = TAX_INVOICE_ABB · POS ไม่ผูกสมุด = RECEIPT"),
  D("D3", "X5", "[R2] timeline หลังคืนเงิน + พิมพ์สำเนา (reprintReceiptAction): 4 แถวเรียงเวลา = เปิดบิลและชำระครบ·ผู้ขาย → ลงบัญชีอัตโนมัติ <ABB> · ให้แต้มสมาชิก → คืนเงิน ฿100·ผู้คืน·ลูกค้าเปลี่ยนใจ·<CN> → พิมพ์สำเนา·ผู้พิมพ์ · ไม่มีแถว LINE/กำลังทำรายการ"),
  D("D4", "X3", "[R2] can.*/voidBlockedReason: ผู้จัดการ + กะเปิด → void true refund true reprint true ไม่มีเหตุ · คืนบางส่วนแล้ว → HAS_REFUNDS · กะปิดแล้ว → SHIFT_CLOSED · บิลโมดูลอื่น → NOT_POS (refund false) · แคชเชียร์ไม่มีคีย์ void/refund → NO_PERMISSION refund false reprint true"),
  // ── V voidSaleAction ──
  D("V1", "-", "[R3] reason ว่าง / ช่องว่างล้วน / 201 ตัว → REASON_REQUIRED · บิลยัง PAID · ไม่มี audit/outbox"),
  D("V2", "X3", "[R3] แคชเชียร์ (pos.sale.create ไม่มี pos.sale.void) → NO_PERMISSION · บิลยัง PAID · ไม่มี audit/outbox"),
  D("V3", "X5", "[R3] ผู้จัดการยกเลิกสำเร็จ → {ok:true, sale:{id, status VOIDED}} · แถว VOIDED · AuditLog pos.sale.void 1 แถว (actorId ผู้จัดการ · targetType PosSale · after.reason) · outbox PosSale#id#VOIDED 1 แถว · timeline มี \"ยกเลิกบิล · <ผู้จัดการ> · <เหตุผล>\""),
  D("V4", "X1", "[R3] เล่นซ้ำคีย์เดิม → {ok:true, duplicated:true} ไม่ throw · audit 1 · outbox 1 เท่าเดิม · คีย์ใหม่บนบิลที่ยกเลิกแล้ว → SALE_NOT_VOIDABLE"),
  D("V5", "X4", "[R3] บิลคืนบางส่วนแล้ว → HAS_REFUNDS (ยัง PAID refunded 10,000 ไม่มี voided) · บิลของกะที่ปิดแล้ว → SHIFT_CLOSED (ยัง PAID)"),
  D("V6", "X2", "[R3] id ของใบ REFUND → SALE_NOT_VOIDABLE · บิลโมดูลอื่น (BOOKING) → SALE_NOT_VOIDABLE (ไม่มี outbox voided) · id มั่ว / บิลอีกสาขา → SALE_NOT_FOUND · ทุกคำปฏิเสธเป็นข้อมูลข้อความไทย ไม่ throw"),
  D("V7", "X1", "[R3 CD2 F15.2] ผู้เรียกเดิม: voidSale(tenantId, unitId, saleId) 3 อาร์กิวเมนต์ยังใช้ได้ (VOIDED · outbox 1) และไม่เขียน AuditLog pos.sale.void"),
  // ── R5b ของค้าง P1.8 ──
  D("R5b-1", "X4", "[R5b a] บิล VAT ฿120 (6,000+6,000) คืนครบเป็น 2 ใบ: Σ vatSatang ใบคืน POS = vatSatang บิล (785) · ภาษีขาย 2200 ของบิล+ใบลดหนี้ทั้งสองสุทธิ 0 (ก่อนแก้ = 393+393 ≠ 785) · JV ทุกใบสมดุล"),
  D("R5b-2", "-", "[R5b b] saleStatusByKey: คีย์ของใบคืน → null · คีย์ของบิลขาย → \"PAID\" (ตัวควบคุมบวก) · คีย์ไม่มีจริง → null"),
  // ── ตัวควบคุมลบ ──
  D("NC", "-", "ตัวควบคุมลบ: ตัวเทียบแถวของข้อสอบจับคำตอบที่ผิดโดยตั้งใจได้ (ใส่แถว REFUND · พลิกสถานะ · ทิ้งแถว) · ข้อมูลทดสอบแยกแยะได้จริง (VAT 6,000×2 ≠ 12,000 · บิล 00:00:30 น. อยู่คนละวันกันระหว่าง UTC กับเวลาไทย)"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราวเหลือ 0 แถวทุกตารางที่มี tenantId + แถว Tenant ถูกลบ · แถวของร้าน QC POS (seed) ก่อน = หลัง"),
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
  const full = id.startsWith("P1.16-") ? id : `P1.16-${id}`;
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
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : r === undefined ? "undefined" : "UNKNOWN");
const refused = (r: Any, code: string) => r?.ok === false && String(r.code) === code && !r.threw;
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  if (m) return m[1]!;
  return "THROW";
}
const MISSING = "ยังไม่มีโมดูล";
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `${MISSING}/ฟังก์ชัน ${name}`, missing: true };
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
const THAI = /[฀-๿]/;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** VAT แบบรวมในราคา — สูตรเดียวกับ src/lib/money/vat.ts splitIncludedVat (ข้อสอบเขียนเอง ไม่ import) */
const vatOf = (g: number, bp: number) => {
  const den = 10_000 + bp;
  return g - Math.floor((2 * g * 10_000 + den) / (2 * den));
};
/** เงินบนจอ (= register-shared moneyText: ทศนิยมเฉพาะเมื่อมีเศษสตางค์) — ข้อสอบเรียกตัวจริงถ้าโหลดได้ */
const baht = (s: number) => `฿${(s / 100).toLocaleString("en-US", { minimumFractionDigits: s % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

// ── เวลาไทย (คำนวณจากนาฬิกา · ไม่ฮาร์ดโค้ดวันที่) ──
const BKK_MS = 7 * 3_600_000;
const bkkDate = (d: Date) => new Date(d.getTime() + BKK_MS).toISOString().slice(0, 10);
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const RUN_START = new Date();
const TODAY = bkkDate(RUN_START);
const D0 = addDays(TODAY, -1); // วันที่ทดสอบ = เมื่อวาน (เวลาไทย) ⇒ ทุกแถวอยู่ในอดีต
const DY = addDays(D0, -1); // "เมื่อวาน" ของ D0
const at = (date: string, hhmmss: string) => new Date(`${date}T${hhmmss}+07:00`);

// ── ซอร์ส (สถิต) ──
const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(src);
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
      /* ไฟล์พัง = คีย์หาย (ST4 แดงเอง) */
    }
  }
  return keys;
}

const POS_DIR = "src/lib/modules/pos";
const F = {
  bills: `${POS_DIR}/bills.ts`,
  billsAct: `${POS_DIR}/bills-actions.ts`,
  billsShared: `${POS_DIR}/bills-shared.ts`,
  rcpShared: `${POS_DIR}/receipt-shared.ts`,
  receipt: `${POS_DIR}/receipt.ts`,
  service: `${POS_DIR}/service.ts`,
  tabs: `${POS_DIR}/tabs.ts`,
  layout: "src/app/app/layout.tsx",
};
/** รหัสปฏิเสธของ voidSaleAction / billsPageData / billDetail (มติ R3) → คีย์ pos.bills.errors.* (ชื่อที่ตั้งในข้อสอบนี้) */
const BILLS_KEYS: [string, string][] = [
  ["NO_PERMISSION", "noPermission"], ["SALE_NOT_FOUND", "saleNotFound"], ["SALE_NOT_VOIDABLE", "saleNotVoidable"], ["HAS_REFUNDS", "hasRefunds"],
  ["SHIFT_CLOSED", "shiftClosed"], ["REASON_REQUIRED", "reasonRequired"], ["VALIDATION", "validation"], ["UNKNOWN", "unknown"],
];
const STATIC_IDS = ["P1.16-ST1", "P1.16-ST2", "P1.16-ST3", "P1.16-ST4", "P1.16-ST5", "P1.16-NC"];
const skipReasons: string[] = [];
for (const [k, f] of Object.entries(F)) if (["bills", "billsAct", "billsShared", "rcpShared"].includes(k) && !existsSync(join(ROOT, f))) skipReasons.push(`${f} ยังไม่มี`);
{
  const b = stripComments(rd(F.bills));
  for (const n of ["billsPageData", "billDetail", "voidSaleByActor"]) if (b && !exportsFn(b, n)) skipReasons.push(`${F.bills} ยังไม่มี export ${n}`);
}
let billsSharedMod: Any = null;
let rcpSharedMod: Any = null;

// ═════════════════════════ ตัวเทียบแถว (ใช้ทั้ง B และ NC) ═════════════════════════
/** แถวที่ข้อสอบคาด (เฉพาะช่องที่ตัดสินได้จากแบบของข้อสอบเอง) */
type ExpRow = { id: string; status: string; grandTotalSatang: number; refundedSatang: number; sourceModule: string; offShiftCash: boolean; refundIds: string[] };
function compareRows(items: Any[], exp: ExpRow[], refundDocIds: string[]): string[] {
  const p: string[] = [];
  if (!Array.isArray(items)) return [`items ไม่ใช่อาร์เรย์ (${short(items, 60)})`];
  const byId = new Map<string, Any>(items.map((r: Any) => [String(r?.id), r]));
  const leaked = items.filter((r: Any) => refundDocIds.includes(String(r?.id)) || r?.docType === "REFUND");
  if (leaked.length) p.push(`ใบ REFUND เป็นแถว ${leaked.length}`);
  for (const e of exp) {
    const r = byId.get(e.id);
    if (!r) {
      p.push(`ขาดแถว ${e.id.slice(-6)}`);
      continue;
    }
    if (r.status !== e.status) p.push(`${e.id.slice(-6)} status ${r.status} (คาด ${e.status})`);
    if (r.grandTotalSatang !== e.grandTotalSatang) p.push(`${e.id.slice(-6)} grand ${r.grandTotalSatang} (คาด ${e.grandTotalSatang})`);
    if (r.refundedSatang !== e.refundedSatang) p.push(`${e.id.slice(-6)} refunded ${r.refundedSatang} (คาด ${e.refundedSatang})`);
    if (r.sourceModule !== e.sourceModule) p.push(`${e.id.slice(-6)} sourceModule ${r.sourceModule}`);
    if (r.offShiftCash !== e.offShiftCash) p.push(`${e.id.slice(-6)} offShiftCash ${r.offShiftCash}`);
    const rf = Array.isArray(r.refunds) ? (r.refunds as Any[]).map((x: Any) => String(x?.id)).sort() : null;
    if (!rf || rf.join(",") !== [...e.refundIds].sort().join(",")) p.push(`${e.id.slice(-6)} refunds ${short(rf, 60)}`);
  }
  const extra = items.filter((r: Any) => !exp.some((e) => e.id === r?.id));
  if (extra.length) p.push(`แถวเกิน ${extra.length}`);
  return p;
}

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB) ═════════════════════════
async function runStatic(): Promise<void> {
  console.log("\n── ST ข้อสถิต (ไม่แตะ DB) ──");
  const billsSrc = stripComments(rd(F.bills));
  const actRaw = rd(F.billsAct);
  const actSrc = stripComments(actRaw);
  const bsRaw = rd(F.billsShared);
  const rsRaw = rd(F.rcpShared);
  // ST1
  {
    const p: string[] = [];
    for (const f of [F.bills, F.billsAct, F.billsShared, F.rcpShared]) if (!existsSync(join(ROOT, f))) p.push(`ไม่มี ${f.split("/").pop()}`);
    for (const n of ["billsPageData", "billDetail", "voidSaleByActor"]) if (billsSrc && !exportsFn(billsSrc, n)) p.push(`bills.ts ไม่มี export ${n}`);
    if (rsRaw && !exportsFn(stripComments(rsRaw), "receiptKindOf")) p.push("receipt-shared ไม่มี export receiptKindOf");
    const rcp = stripComments(rd(F.receipt));
    if (!/receiptKindOf\s*\(/.test(rcp) || !/from\s+["']\.\/receipt-shared["']/.test(rcp)) p.push("receipt.ts ยังไม่เรียก receiptKindOf จาก ./receipt-shared");
    const svc = stripComments(rd(F.service));
    const sig = /export\s+async\s+function\s+voidSale\s*\(([^)]*)\)\s*:\s*([^{]+)\{/.exec(svc);
    if (!sig) p.push("หา voidSale ใน service.ts ไม่เจอ");
    else {
      const params = sig[1]!.split(",").map((s) => s.trim()).filter(Boolean);
      const first3 = params.slice(0, 3).map((x) => x.replace(/\s+/g, " "));
      if (first3.join("|") !== "tenantId: string|unitId: string|saleId: string") p.push(`พารามิเตอร์ 3 ตัวแรกเปลี่ยน (${short(first3, 80)})`);
      const fourth = params.slice(3).join(",");
      if (params.length < 4) p.push("voidSale ยังไม่มีพารามิเตอร์ที่ 4");
      else if (!/^\w+\s*\?\s*:/.test(fourth) && !/=/.test(fourth)) p.push(`พารามิเตอร์ที่ 4 ต้องไม่บังคับ (${short(fourth, 60)})`);
      if (sig[2]!.replace(/\s+/g, "") !== "Promise<void>") p.push(`ชนิดผลลัพธ์ voidSale เปลี่ยนเป็น ${sig[2]!.trim()} (F15.2 ขาออกห้ามเปลี่ยน)`);
    }
    for (const f of [F.tabs, F.layout]) {
      const lines = rd(f).split("\n").filter((l) => l.includes("pos/sales"));
      if (!lines.length) p.push(`${f.split("/").pop()} ไม่มี /pos/sales`);
      else if (!lines.every((l) => l.includes('"บิลวันนี้"'))) p.push(`${f.split("/").pop()} แท็บ /pos/sales ยังไม่ใช่ "บิลวันนี้"`);
    }
    chk("ST1", p.length === 0, "ไฟล์+export ครบ · receiptKindOf ใช้ร่วม · voidSale(…, opts?) Promise<void> · แท็บ บิลวันนี้", p.join(" · ") || "ครบ");
  }
  // ST2
  {
    const p: string[] = [];
    if (!actRaw) p.push(`ไม่มี ${F.billsAct}`);
    else {
      const first = actRaw.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "").trimStart();
      if (!/^["']use server["']/.test(first)) p.push('"use server" ไม่ใช่คำสั่งแรก');
      const exportsLines = [...actSrc.matchAll(/^\s*export\s+[^\n]*/gm)].map((m) => m[0].trim());
      const bad = exportsLines.filter((l) => !/^export\s+async\s+function\s+\w+/.test(l));
      if (bad.length) p.push(`export ที่ไม่ใช่ async function: ${short(bad.map((b) => b.slice(0, 40)), 120)}`);
      if (/\bthrow\b/.test(actSrc)) p.push("มี throw");
      const want: [string, string][] = [["billsPageDataAction", "billsPageData"], ["billDetailAction", "billDetail"], ["voidSaleAction", "voidSaleByActor"]];
      const starts = [...actSrc.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => ({ name: m[1]!, at: m.index! }));
      for (const [act, svcFn] of want) {
        const i = starts.findIndex((s) => s.name === act);
        if (i < 0) {
          p.push(`ไม่มี ${act}`);
          continue;
        }
        const body = actSrc.slice(starts[i]!.at, i + 1 < starts.length ? starts[i + 1]!.at : actSrc.length);
        const helpers = [...actSrc.matchAll(/(?:async\s+)?function\s+(\w+)\s*\([^)]*\)[^{]*\{/g)].map((m) => m[1]!).filter((n) => !want.some(([a]) => a === n));
        const viaHelper = (re: RegExp) => helpers.some((h) => new RegExp(`\\b${h}\\s*\\(`).test(body) && re.test(actSrc.slice(actSrc.indexOf(`function ${h}`))));
        if (!/requireTenant\s*\(/.test(body) && !viaHelper(/requireTenant\s*\(/)) p.push(`${act} ไม่เรียก requireTenant`);
        if (!/\bcatch\b/.test(body)) p.push(`${act} ไม่มี catch`);
        if (!/unstable_rethrow\s*\(/.test(body) && !viaHelper(/unstable_rethrow\s*\(/)) p.push(`${act} ไม่มี unstable_rethrow`);
        if (!new RegExp(`\\b${svcFn}\\s*\\(`).test(body)) p.push(`${act} ไม่เรียก ${svcFn}`);
      }
    }
    chk("ST2", p.length === 0, "use server · async function ล้วน · 3 action · requireTenant+catch+unstable_rethrow · ไม่ throw", p.join(" · ") || "ครบ");
  }
  // ST3
  {
    const p: string[] = [];
    const SERVER_POS = /^\.\/(bills|bills-actions|service|refund|refund-actions|refund-consumer|receipt|receipt-actions|register|register-actions|shift|shift-actions|device|device-actions|reports|report-overview|report-actions|catalog|catalog-legacy|held-cart|stock-count|stock-count-actions|account-bridge|payment-settings|payment-settings-actions|receipt-settings|receipt-settings-actions|db|index|access)$/;
    const FORBID = [/^@\/lib\/core\/(db|context|audit)$/, /^server-only$/, /^next\/(headers|cache|navigation)$/, /^@\/lib\/modules\/(?!pos\/[\w-]*(-shared|refund-math|receipt-render)$)/];
    for (const [f, raw] of [[F.billsShared, bsRaw], [F.rcpShared, rsRaw]] as [string, string][]) {
      const name = f.split("/").pop();
      if (!raw) {
        p.push(`ไม่มี ${name}`);
        continue;
      }
      const src = stripComments(raw);
      if (/["']use server["']/.test(src)) p.push(`${name} มี "use server"`);
      const specs: string[] = [];
      for (const m of src.matchAll(/^\s*import\s+(?!type\b)([\s\S]*?)\s+from\s+["']([^"']+)["']/gm)) {
        // import { type A, type B } ล้วน = import type
        const clause = m[1]!.trim();
        if (/^\{[^}]*\}$/.test(clause) && clause.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith("type "))) continue;
        specs.push(m[2]!);
      }
      for (const m of src.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) specs.push(m[1]!);
      for (const m of src.matchAll(/\b(?:import|require)\s*\(\s*["']([^"']+)["']/g)) specs.push(m[1]!);
      for (const s of specs) {
        if (s === "@prisma/client") p.push(`${name} import ค่าจาก @prisma/client`);
        else if (SERVER_POS.test(s) || /^@\/lib\/modules\/pos\/(bills|service|refund|receipt|register|shift|device|reports)$/.test(s)) p.push(`${name} import โมดูลเซิร์ฟเวอร์ ${s}`);
        else if (FORBID.some((re) => re.test(s))) p.push(`${name} import ${s}`);
      }
    }
    chk("ST3", p.length === 0, "shared ไม่ import ของฝั่งเซิร์ฟเวอร์", p.join(" · ") || "ครบ");
  }
  // ST4
  {
    const p: string[] = [];
    const th = posMessages("th");
    const en = posMessages("en");
    for (const [, k] of BILLS_KEYS) {
      const key = `pos.bills.errors.${k}`;
      const t = th.get(key);
      const e = en.get(key);
      if (typeof t !== "string" || !THAI.test(t)) p.push(`th ${k}`);
      if (typeof e !== "string" || !e.trim() || THAI.test(e)) p.push(`en ${k}`);
    }
    billsSharedMod = existsSync(join(ROOT, F.billsShared)) ? await tryImport("@/lib/modules/pos/bills-shared") : null;
    const map = billsSharedMod?.BILLS_ERROR_KEYS;
    if (!map || typeof map !== "object") p.push("bills-shared ไม่มี BILLS_ERROR_KEYS");
    else {
      for (const [code, k] of BILLS_KEYS) if (map[code] !== k) p.push(`BILLS_ERROR_KEYS.${code} = ${short(map[code], 30)} (คาด ${k})`);
      const extra = Object.keys(map).filter((c) => !BILLS_KEYS.some(([x]) => x === c));
      if (extra.length) p.push(`รหัสเกิน ${extra.join(",")}`);
    }
    chk("ST4", p.length === 0, `pos.bills.errors.* ${BILLS_KEYS.length} คีย์ th+en · BILLS_ERROR_KEYS`, p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || "ครบ");
  }
  // ST5
  {
    const p: string[] = [];
    rcpSharedMod = existsSync(join(ROOT, F.rcpShared)) ? await tryImport("@/lib/modules/pos/receipt-shared") : null;
    const fn = rcpSharedMod?.receiptKindOf;
    if (typeof fn !== "function") p.push(`${MISSING} receipt-shared.receiptKindOf`);
    else {
      const base = { vatRegistered: true, posAbbreviatedInvoice: true, taxId: "0105561177639", vatSatang: 785 };
      const cases: [Any, string][] = [
        [base, "TAX_INVOICE_ABB"],
        [{ ...base, vatRegistered: false }, "RECEIPT"],
        [{ ...base, posAbbreviatedInvoice: false }, "RECEIPT"],
        [{ ...base, taxId: "" }, "RECEIPT"],
        [{ ...base, taxId: "   " }, "RECEIPT"],
        [{ ...base, taxId: null }, "RECEIPT"],
        [{ ...base, vatSatang: 0 }, "RECEIPT"],
      ];
      for (const [inp, want] of cases) {
        let got: unknown;
        try {
          got = fn(inp);
        } catch (e) {
          got = `throw ${(e as Error).message.slice(0, 40)}`;
        }
        if (got !== want) p.push(`${short(inp, 90)} → ${short(got, 30)} (คาด ${want})`);
      }
    }
    chk("ST5", p.length === 0, "ABB เฉพาะครบ 4 เงื่อนไข", p.slice(0, 4).join(" · ") || "ครบ 7 กรณี");
  }
  // NC ตัวควบคุมลบ (บริสุทธิ์ — ไม่ใช้ DB)
  {
    const p: string[] = [];
    const exp: ExpRow[] = [
      { id: "s1", status: "PAID", grandTotalSatang: 20000, refundedSatang: 10000, sourceModule: "POS", offShiftCash: false, refundIds: ["r1"] },
      { id: "s2", status: "VOIDED", grandTotalSatang: 4500, refundedSatang: 0, sourceModule: "POS", offShiftCash: false, refundIds: [] },
      { id: "s3", status: "PAID", grandTotalSatang: 3000, refundedSatang: 0, sourceModule: "POS", offShiftCash: true, refundIds: [] },
    ];
    const good = exp.map((e) => ({ id: e.id, status: e.status, grandTotalSatang: e.grandTotalSatang, refundedSatang: e.refundedSatang, sourceModule: e.sourceModule, offShiftCash: e.offShiftCash, refunds: e.refundIds.map((id) => ({ id })) }));
    if (compareRows(good, exp, ["r1"]).length) p.push(`คำตอบถูกถูกตีว่าผิด: ${compareRows(good, exp, ["r1"]).join(",")}`);
    const withRefundRow = [...good, { id: "r1", docType: "REFUND", status: "PAID", grandTotalSatang: 10000, refundedSatang: 0, sourceModule: "POS", offShiftCash: false, refunds: [] }];
    if (!compareRows(withRefundRow, exp, ["r1"]).some((x) => x.includes("REFUND"))) p.push("ไม่จับแถว REFUND");
    const flipped = good.map((r) => (r.id === "s2" ? { ...r, status: "PAID" } : r));
    if (!compareRows(flipped, exp, ["r1"]).some((x) => x.includes("status"))) p.push("ไม่จับสถานะพลิก");
    if (!compareRows(good.slice(1), exp, ["r1"]).some((x) => x.includes("ขาดแถว"))) p.push("ไม่จับแถวหาย");
    // ข้อมูลทดสอบแยกแยะได้จริง
    if (vatOf(6000, 700) * 2 === vatOf(12000, 700)) p.push("VAT 6,000×2 = 12,000 (R5b-1 ไม่แยกแยะ)");
    const f1 = at(D0, "00:00:30");
    if (!(bkkDate(f1) === D0 && f1.toISOString().slice(0, 10) !== D0)) p.push("บิล 00:00:30 น. ไม่แยก UTC/เวลาไทย");
    if (bkkDate(at(DY, "23:30:00")) !== DY) p.push("23:30 น. ของ D0−1 ไม่อยู่ใน D0−1");
    chk("NC", p.length === 0, "ตัวเทียบจับคำตอบผิดได้ 3 แบบ · ข้อมูลแยกแยะได้", p.join(" · ") || `ครบ (VAT ${vatOf(6000, 700)}+${vatOf(6000, 700)} ≠ ${vatOf(12000, 700)} · D0 ${D0})`);
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

const COUNT_MODELS = ["posSale", "posSaleLine", "posPayment", "posReceiptCounter", "posDocCounter", "posShift", "outboxEvent", "auditLog", "customer", "accountDocument", "accountJournalEntry", "pointLedger"] as const;
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
  return out;
}
const countsBefore = await snapshotCounts();

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P1.16 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อมูล: seed ${seedOk ? "มี" : "ไม่มี"} · ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length, seed: seedOk })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);
console.log(`[${SUITE}] DB host ${HOST} · วันนี้ (เวลาไทย) ${TODAY} · วันที่ทดสอบ D0 ${D0} · D0−1 ${DY}`);

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const ex = (f: string) => existsSync(join(ROOT, f));
const billsMod = ex(F.bills) ? await tryImport("@/lib/modules/pos/bills") : null;
const svc = await tryImport("@/lib/modules/pos/service");
const register = await tryImport("@/lib/modules/pos/register");
const regShared = await tryImport("@/lib/modules/pos/register-shared");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const rcpMod = await tryImport("@/lib/modules/pos/receipt");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const consMod = await tryImport("@/lib/outbox-consumers");
const money = (s: number): string => (typeof regShared?.moneyText === "function" ? regShared.moneyText(s) : baht(s));
const PAY_ORDER: string[] = Array.isArray(svc?.PAY_TYPE_ORDER) ? svc.PAY_TYPE_ORDER : ["CASH", "PROMPTPAY", "TRANSFER", "CARD", "DEPOSIT", "ROOM_CHARGE"];

// session ปลอมสำหรับ server action (แทน src/lib/core/context.ts ใน require cache ตอนโหลดไฟล์ action เท่านั้น)
type QcSession = { userId: string; tenantId: string; role: string; unitAccess: unknown; permissions: unknown };
let QC_SESSION: QcSession | null = null;
async function loadActionsWithFakeSession(): Promise<{ bills: Any; receipt: Any }> {
  const { createRequire } = await import("node:module");
  const req = createRequire(join(ROOT, "package.json"));
  const ctxFile = join(ROOT, "src/lib/core/context.ts");
  const saved = req.cache[ctxFile];
  const fake = {
    requireTenant: async () => {
      if (!QC_SESSION) throw new Error("[qc] ไม่มี session ปลอม");
      return {
        user: { id: QC_SESSION.userId, email: `${QC_SESSION.userId}@qc.local`, name: null },
        memberships: [],
        active: { tenantId: QC_SESSION.tenantId, tenant: { id: QC_SESSION.tenantId, status: "ACTIVE" }, role: QC_SESSION.role, unitAccess: QC_SESSION.unitAccess, permissions: QC_SESSION.permissions },
      };
    },
    requireAuth: async () => ({ user: { id: QC_SESSION?.userId ?? "" }, memberships: [], active: null }),
    requireMembership: async () => ({}),
  };
  req.cache[ctxFile] = { id: ctxFile, filename: ctxFile, path: join(ROOT, "src/lib/core"), loaded: true, exports: fake, children: [], paths: [] } as never;
  try {
    return {
      bills: ex(F.billsAct) ? await tryImport("@/lib/modules/pos/bills-actions") : null,
      receipt: await tryImport("@/lib/modules/pos/receipt-actions"),
    };
  } finally {
    if (saved) req.cache[ctxFile] = saved;
    else delete req.cache[ctxFile];
  }
}
const actions = await loadActionsWithFakeSession();
const billsAct = actions.bills;
const rcpAct = actions.receipt;

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p1.16-${RAND}`;
const T_SLUG = `qc-p116-${RAND}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";

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
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !STATIC_IDS.includes(id) && id !== "P1.16-Z1");

async function runDb() {
  if (!seedOk) {
    for (const id of DB_IDS) chk(id, false, "seed ร้าน QC POS", "ยังไม่ได้ seed (scripts/seed-pos-qc.mts) — ข้อ DB ตรวจไม่ได้");
    return;
  }
  assertQc4BeforeWrite();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (POS-A ผูกสมุดจด VAT + สมาชิก/แต้ม · สาขา A B · POS-N ไม่ผูกสมุด สาขา N) ──`);
  let fx = "";
  const S: Record<string, string> = {};
  const U: Record<string, string> = {};
  const ownerId: string = PQC.coffee.users.owner.userId;
  const cashierId: string = PQC.coffee.users.cashier.userId;
  const mgrId: string = PQC.resto.users.owner.userId;
  const nameOf = async (id: string): Promise<string> => String((await P.user.findUnique({ where: { id }, select: { name: true } }).catch(() => null))?.name ?? "");
  const NAME = { owner: await nameOf(ownerId), mgr: await nameOf(mgrId), cashier: await nameOf(cashierId) };
  if (!NAME.owner || !NAME.mgr || !NAME.cashier) console.log(`  ⚠️  ชื่อผู้ใช้ seed ว่าง ${short(NAME)}`);
  try {
    const t = await P.tenant.create({ data: { name: `QC P1.16 บิลวันนี้ ${RAND}`, slug: T_SLUG } });
    T = t.id;
    for (const k of ["A", "B", "N"]) U[k] = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} ${k}`, slug: `${T_SLUG}-${k.toLowerCase()}` } })).id;
    S.POSA = (await sysSvc.createSystem(T, "POS", "POS-A (ผูกบัญชี VAT)")).id;
    S.POSN = (await sysSvc.createSystem(T, "POS", "POS-N (ไม่ผูกบัญชี)")).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", "บัญชี QC P1.16")).id;
    S.MEM = (await sysSvc.createSystem(T, "MEMBER", "สมาชิก QC P1.16")).id;
    S.PTS = (await sysSvc.createSystem(T, "POINT", "แต้ม QC P1.16")).id;
    await accSvc.saveSettings(T, S.ACC, { orgName: "ร้านบิลวันนี้คิวซี จำกัด", taxId: "0105561177639", vatRegistered: true });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POSA } });
    await sysSvc.linkUnit(T, S.POSA, U.A);
    await sysSvc.linkUnit(T, S.POSA, U.B);
    await sysSvc.linkUnit(T, S.POSN, U.N);
    for (const s of ["MEM", "PTS"]) await sysSvc.linkUnit(T, S[s], U.A);
    await P.pointSettings.upsert({ where: { tenantId: T }, create: { tenantId: T, satangPerPoint: 1000 }, update: { satangPerPoint: 1000 } });
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  /** ข้อที่ต้องใช้โมดูลใหม่: ยังไม่มี = "ยังไม่มีโมดูล" (แดง) */
  const NEED = (mod: Any, label: string) => (mod ? "" : `${MISSING} ${label} · `);

  // ─── ผู้กระทำ ───
  const owner = { userId: ownerId, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const manager = () => ({ userId: mgrId, role: "MANAGER", unitAccess: [U.A, U.B, U.N], permissions: {} });
  const cashier = () => ({ userId: cashierId, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.create": true, "pos.sale.read": true, "pos.shift.operate": true } });
  const noRead = () => ({ userId: cashierId, role: "STAFF", unitAccess: [U.A], permissions: { "pos.shift.operate": true } });
  const ctxOf = (k: string, deviceId?: string): Any => ({ tenantId: T, systemId: k === "N" ? S.POSN : S.POSA, unitId: U[k], ...(deviceId ? { deviceId } : {}) });
  const asSession = async <R,>(a: Any, fn: () => Promise<R>): Promise<R> => {
    QC_SESSION = { userId: a.userId, tenantId: T, role: a.role, unitAccess: a.unitAccess, permissions: a.permissions };
    try {
      return await fn();
    } finally {
      QC_SESSION = null;
    }
  };

  // ─── ทางเรียก ───
  let keyN = 0;
  const newKey = (p = "k") => `qc116-${RAND}-${p}-${++keyN}`; // [A-Za-z0-9_-] เท่านั้น (หน้าขายรับ /^[A-Za-z0-9_-]{8,100}$/)
  const row = async (id: string): Promise<Any> => (id ? P.posSale.findUnique({ where: { id }, include: { lines: { orderBy: { id: "asc" } }, payments: { orderBy: { id: "asc" } } } }).catch(() => null) : null);
  const page = (k: string, a: Any, q: Any = {}) => call(billsMod, "billsPageData", ctxOf(k), a, { unitId: U[k], date: D0, ...q });
  const detail = (k: string, a: Any, saleId: string) => call(billsMod, "billDetail", ctxOf(k), a, { unitId: U[k], saleId });
  const voidAct = (a: Any, k: string, saleId: string, reason: string, idempotencyKey: string) =>
    asSession(a, () => call(billsAct, "voidSaleAction", { systemId: k === "N" ? S.POSN : S.POSA, unitId: U[k], saleId, reason, idempotencyKey }));
  const voidAudits = async (saleId: string): Promise<Any[]> => (saleId ? ((await P.auditLog.findMany({ where: { tenantId: T, action: "pos.sale.void", targetId: saleId } }).catch(() => [])) as Any[]) : []);
  const voidEvents = async (saleId: string): Promise<number> => (saleId ? P.outboxEvent.count({ where: { tenantId: T, type: "pos.sale.voided", idempotencyKey: `PosSale#${saleId}#VOIDED` } }).catch(() => NaN) : NaN);
  const reprintAudits = async (saleId: string): Promise<number> => (saleId ? P.auditLog.count({ where: { tenantId: T, action: "pos.receipt.reprint", targetId: saleId } }).catch(() => NaN) : NaN);
  const allAudits = async (): Promise<number> => P.auditLog.count({ where: { tenantId: T, action: { startsWith: "pos." } } }).catch(() => NaN);

  // ─── กะ ───
  const DEV1 = `qc116${RAND}d1`;
  const DEV2 = `qc116${RAND}d2`;
  let S1 = "", S0 = "", S1No = NaN;
  if (!fx) {
    const o1 = await call(shiftMod, "openShift", ctxOf("A", DEV1), owner, { deviceId: DEV1, deviceLabel: "เครื่อง QC 1", floatSatang: 0 });
    const o0 = await call(shiftMod, "openShift", ctxOf("A", DEV2), owner, { deviceId: DEV2, deviceLabel: "เครื่อง QC 2", floatSatang: 0 });
    S1 = o1?.ok === true ? String(o1.shift?.id ?? "") : "";
    S0 = o0?.ok === true ? String(o0.shift?.id ?? "") : "";
    S1No = Number((await P.posShift.findUnique({ where: { id: S1 || "x" } }).catch(() => null))?.shiftNo ?? NaN);
    if (!S1 || !S0) fx = `เปิดกะ: ${codeOf(o1)} ${codeOf(o0)} ${short(o1?.message ?? o0?.message ?? "", 80)}`;
  }

  // ─── สมาชิก ───
  let C1 = "", C1code = "";
  const C1name = `สมใจ บิลทดสอบ${RAND}`;
  const C1phone = `08991${String(Math.floor(Math.random() * 1e5)).padStart(5, "0")}`;
  if (!fx) {
    try {
      C1code = `QC116-${RAND}`.toUpperCase();
      C1 = (await P.customer.create({ data: { tenantId: T, memberSystemId: S.MEM, name: C1name, phone: C1phone, memberCode: C1code } })).id;
    } catch (e) {
      fx = `สมาชิก:${(e as Error).message.slice(0, 120)}`;
    }
  }

  // ─── บิล: ขายผ่านหน้าขาย (quote → submit) แล้วย้ายเวลาไปวันที่ทดสอบ ───
  type Bill = { k: string; id: string; key: string; receiptNo: string; grand: number; L: Record<string, string>; err: string };
  const B: Record<string, Bill> = {};
  const redate = async (id: string, when: Date) => {
    if (id) await P.posSale.update({ where: { id }, data: { createdAt: when, paidAt: when } }).catch((e: Error) => console.log(`  ⚠️  ย้ายเวลา ${id}: ${e.message.slice(0, 60)}`));
  };
  const linesOf = async (id: string): Promise<Record<string, string>> => {
    const L: Record<string, string> = {};
    if (id) for (const l of (await P.posSaleLine.findMany({ where: { saleId: id } }).catch(() => [])) as Any[]) L[l.name] = l.id;
    return L;
  };
  const regSale = async (k: string, unit: string, a: Any, lines: [string, number, number][], pays: [string, number][], o: { dev?: string; member?: string; tendered?: number; when: Date }): Promise<Bill> => {
    const c = ctxOf(unit, o.dev);
    const cart: Any = { lines: lines.map(([name, qty, unitPriceSatang]) => ({ name, qty, unitPriceSatang })), ...(o.member ? { memberId: o.member } : {}) };
    const want = sum(lines.map(([, q, pr]) => q * pr));
    const key = newKey(`s${k}`);
    let err = "";
    let id = "", receiptNo = "";
    if (fx) err = "fixture";
    else {
      const q = await call(register, "quoteRegisterCart", c, a, cart);
      if (q?.ok !== true || q.grandTotalSatang !== want) err = `quote ${codeOf(q)} ${q?.grandTotalSatang} (คาด ${want}) ${short(q?.message ?? "", 60)}`;
      else {
        const cash = sum(pays.filter(([t]) => t === "CASH").map(([, n]) => n));
        const input: Any = { ...cart, idempotencyKey: key, expectedGrandTotalSatang: want, payMethods: pays.map(([type, amountSatang]) => ({ type, amountSatang })), ...(cash > 0 ? { cashReceivedSatang: o.tendered ?? cash } : {}) };
        const r = await call(register, "submitRegisterSale", c, a, input);
        if (r?.ok !== true) err = `submit ${codeOf(r)} ${short(r?.message ?? "", 80)}`;
        else {
          id = String(r.saleId);
          receiptNo = String(r.receiptNo ?? "");
          await redate(id, o.when);
        }
      }
    }
    if (err) console.log(`  ⚠️  บิล ${k}: ${err}`);
    const b: Bill = { k, id, key, receiptNo, grand: want, L: await linesOf(id), err };
    B[k] = b;
    return b;
  };
  const own = owner;
  const t0 = (hms: string) => at(D0, hms);
  await regSale("bP", "A", own, [["ลาเต้ QC", 2, 5000], ["ขนม QC", 1, 5000]], [["CASH", 15000]], { dev: DEV1, tendered: 20000, when: t0("10:00:00") });
  await regSale("bR", "A", own, [["เสื้อ QC", 2, 10000]], [["PROMPTPAY", 20000]], { dev: DEV1, member: C1, when: t0("10:10:00") });
  await regSale("bF", "A", manager(), [["หมวก QC", 1, 7500]], [["CASH", 7500]], { dev: DEV1, when: t0("10:20:00") });
  await regSale("bV", "A", own, [["ชา QC", 1, 4500]], [["CASH", 4500]], { dev: DEV1, when: t0("10:30:00") });
  await regSale("bO", "A", own, [["น้ำ QC", 1, 3000]], [["CASH", 3000]], { when: t0("10:40:00") });
  // bX: บิลของโมดูลอื่น (createSale เดิม · sourceModule BOOKING · ไม่มีผู้ขาย · ไม่มีกะ)
  {
    const key = newKey("sbX");
    let id = "", receiptNo = "", err = "";
    if (fx) err = "fixture";
    else {
      const r = await call(svc, "createSale", { tenantId: T, unitId: U.A, systemId: S.POSA, sourceModule: "BOOKING", idempotencyKey: key, lines: [{ name: "บริการจอง QC", qty: 1, unitPriceSatang: 20000 }], payMethods: [{ type: "TRANSFER", amountSatang: 20000 }] });
      if (typeof r?.saleId !== "string") err = `createSale ${codeOf(r)} ${short(r?.message ?? "", 80)}`;
      else {
        id = r.saleId;
        receiptNo = String(r.receiptNo ?? "");
        await redate(id, t0("10:50:00"));
      }
    }
    if (err) console.log(`  ⚠️  บิล bX: ${err}`);
    B.bX = { k: "bX", id, key, receiptNo, grand: 20000, L: await linesOf(id), err };
  }
  await regSale("bC", "A", own, [["ข้าว QC", 1, 5000]], [["CASH", 5000]], { dev: DEV2, when: t0("11:00:00") });
  await regSale("bL", "A", own, [["คุกกี้ QC", 1, 2500]], [["CASH", 2500]], { dev: DEV1, when: t0("11:10:00") });
  await regSale("bT", "A", own, [["จาน QC", 1, 6000], ["ชาม QC", 1, 6000]], [["CASH", 12000]], { dev: DEV1, when: t0("11:20:00") });
  await regSale("f1", "A", own, [["ขนมปัง QC1", 1, 1000]], [["CASH", 1000]], { dev: DEV1, when: t0("00:00:30") });
  await regSale("f2", "A", own, [["ขนมปัง QC2", 1, 2000]], [["CASH", 2000]], { dev: DEV1, when: t0("12:00:00") });
  await regSale("f3", "A", manager(), [["ขนมปัง QC3", 1, 3000]], [["CASH", 3000]], { dev: DEV1, when: t0("12:10:00") });
  await regSale("f4", "A", own, [["ขนมปัง QC4", 1, 2600]], [["PROMPTPAY", 1600], ["CASH", 1000]], { dev: DEV1, when: t0("12:20:00") });
  await regSale("bY1", "A", own, [["ของเมื่อวาน QC1", 1, 10000]], [["CASH", 10000]], { dev: DEV1, when: at(DY, "23:30:00") });
  await regSale("bY2", "A", own, [["ของเมื่อวาน QC2", 1, 5000]], [["CASH", 5000]], { dev: DEV1, when: at(DY, "12:00:00") });
  await regSale("bB", "B", own, [["ของสาขา B QC", 1, 4000]], [["CASH", 4000]], { when: t0("13:00:00") });
  await regSale("bN", "N", own, [["ของ POS-N QC", 1, 10700]], [["CASH", 10700]], { when: t0("13:10:00") });
  // ปิดกะ S0 (บิล bC อยู่ในกะที่ปิดแล้ว)
  if (S0) {
    const c = await call(shiftMod, "closeShift", ctxOf("A", DEV2), owner, { shiftId: S0, countedCashSatang: 5000, idempotencyKey: newKey("close") });
    if (c?.ok !== true) console.log(`  ⚠️  ปิดกะ S0: ${codeOf(c)} ${short(c?.message ?? "", 80)}`);
  }
  await drain();

  // ─── คืนเงิน (บริการ P1.8 เดิม) ───
  const refundReq = (saleId: string, lines: [string, number][], pay: [string, number][]): Any => ({
    saleId,
    lines: lines.map(([lineId, qty]) => ({ lineId, qty })),
    payMethods: pay.map(([type, amountSatang]) => ({ type, amountSatang })),
    reasonCode: "CHANGED_MIND",
    reason: "ลูกค้าเปลี่ยนใจ",
    idempotencyKey: newKey("r"),
  });
  const doRefund = async (label: string, saleId: string, lines: [string, number][], pay: [string, number][]): Promise<{ id: string; receiptNo: string; key: string; grand: number }> => {
    const req = refundReq(saleId, lines, pay);
    const r = saleId ? await call(refundMod, "refundSale", ctxOf("A"), owner, req) : { ok: false, code: "NO_SALE" };
    if (r?.ok !== true) console.log(`  ⚠️  คืน ${label}: ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    return { id: r?.ok === true ? String(r.refund?.id ?? "") : "", receiptNo: r?.ok === true ? String(r.refund?.receiptNo ?? "") : "", key: req.idempotencyKey, grand: r?.ok === true ? Number(r.refund?.grandTotalSatang) : NaN };
  };
  const rR = await doRefund("bR", B.bR!.id, [[B.bR!.L["เสื้อ QC"] ?? "", 1]], [["PROMPTPAY", 10000]]);
  const rF = await doRefund("bF", B.bF!.id, [[B.bF!.L["หมวก QC"] ?? "", 1]], [["CASH", 7500]]);
  const rT1 = await doRefund("bT-1", B.bT!.id, [[B.bT!.L["จาน QC"] ?? "", 1]], [["CASH", 6000]]);
  const rT2 = await doRefund("bT-2", B.bT!.id, [[B.bT!.L["ชาม QC"] ?? "", 1]], [["CASH", 6000]]);
  const refundIds = [rR.id, rF.id, rT1.id, rT2.id].filter(Boolean);
  await drain();
  // พิมพ์สำเนาบิล bR ผ่าน action จริง (session = แคชเชียร์)
  const rp = B.bR!.id ? await asSession(cashier(), () => call(rcpAct, "reprintReceiptAction", { systemId: S.POSA, saleId: B.bR!.id })) : { ok: false, code: "NO_SALE" };
  if (rp?.ok !== true) console.log(`  ⚠️  พิมพ์สำเนา bR: ${codeOf(rp)} ${short(rp?.message ?? "", 80)}`);
  const fixtureErrs = Object.values(B).filter((b) => b.err).map((b) => `${b.k}:${b.err.slice(0, 40)}`);
  const FXB = (s: string) => FX((fixtureErrs.length ? `บิลตั้งต้นล้ม ${fixtureErrs.join(",")} · ` : "") + s);
  console.log(`  ตั้งต้น: บิล ${Object.values(B).filter((b) => b.id).length}/${Object.keys(B).length} · ใบคืน ${refundIds.length}/4 · พิมพ์สำเนา ${codeOf(rp)} · กะ S1 #${S1No}`);

  {
    // ข้อมูลตั้งต้นที่ข้อ D อ้าง (พิมพ์ไว้ให้ผู้สร้างเห็นว่าของจริงในฐานเป็นอย่างไร — ไม่ใช่ข้อสอบ)
    const sR0 = await row(B.bR!.id);
    const abb0 = B.bR!.id ? await P.accountDocument.findFirst({ where: { tenantId: T, docType: "TAX_INVOICE_ABB", refType: "PosSale", refId: B.bR!.id } }).catch(() => null) : null;
    const cn0 = rR.id ? await P.accountDocument.findFirst({ where: { tenantId: T, docType: "CREDIT_NOTE", refType: "PosSale", refId: rR.id } }).catch(() => null) : null;
    console.log(`  (ข้อมูล: bR ${sR0?.receiptNo} แต้ม ${sR0?.pointEarned} VAT ${sR0?.vatSatang} · ABB ${abb0?.docNo ?? "—"} · CN POS ${rR.receiptNo || "—"} / เอกสาร ${cn0?.docNo ?? "—"} · ชื่อ ${short(NAME)})`);
  }
  // ════════ R5b-1 VAT ใบคืนครบเป็นสองใบ ════════
  {
    const p: string[] = [];
    const sale = await row(B.bT!.id);
    const docs = ((await P.posSale.findMany({ where: { tenantId: T, refSaleId: B.bT!.id || "x", docType: "REFUND" } }).catch(() => [])) as Any[]);
    const posVat = sum(docs.map((d: Any) => d.vatSatang));
    if (!sale || sale.status !== "REFUNDED") p.push(`บิล ${sale?.status ?? "ไม่มี"} (คาด REFUNDED)`);
    if (docs.length !== 2) p.push(`ใบคืน ${docs.length} (คาด 2)`);
    if (sale && posVat !== sale.vatSatang) p.push(`Σ VAT ใบคืน POS ${posVat} ≠ ${sale.vatSatang}`);
    if (sale && sale.vatSatang !== vatOf(12000, 700)) p.push(`VAT บิล ${sale.vatSatang} (คาด ${vatOf(12000, 700)})`);
    const cnDocs = ((await P.accountDocument.findMany({ where: { tenantId: T, docType: "CREDIT_NOTE", refType: "PosSale", refId: { in: docs.map((d: Any) => d.id) } } }).catch(() => [])) as Any[]);
    const es = ((await P.accountJournalEntry.findMany({
      where: { tenantId: T, OR: [{ refType: "PosSale", refId: { in: [B.bT!.id, ...docs.map((d: Any) => d.id)].filter(Boolean) } }, ...(cnDocs.length ? [{ refType: "AccountDocument", refId: { in: cnDocs.map((d: Any) => d.id) } }] : [])] },
      include: { lines: { include: { account: { select: { code: true } } } } },
    }).catch(() => [])) as Any[]);
    const net2200 = sum(es.flatMap((e: Any) => e.lines ?? []).filter((l: Any) => l.account?.code === "2200").map((l: Any) => l.debit - l.credit));
    if (es.length < 3) p.push(`JV ${es.length} (คาด ≥3: บิล + ใบคืน 2)`);
    if (net2200 !== 0) p.push(`2200 สุทธิ ${net2200} (คาด 0)`);
    if (!es.every((e: Any) => sum((e.lines ?? []).map((l: Any) => l.debit)) === sum((e.lines ?? []).map((l: Any) => l.credit)))) p.push("JV ไม่สมดุล");
    console.log(`  (R5b-1 ข้อมูล: VAT ใบคืน POS ${docs.map((d: Any) => d.vatSatang).join("+")} · VAT เอกสาร CREDIT_NOTE ${cnDocs.map((d: Any) => d.vatAmount).join("+") || "—"} · 2200 สุทธิ ${net2200})`);
    chk("R5b-1", p.length === 0, "Σ VAT ใบคืน 785 · 2200 สุทธิ 0 · JV สมดุล", FXB(p.join(" · ") || "ครบ"));
  }
  // ════════ R5b-2 saleStatusByKey ════════
  {
    const a = await call(svc, "saleStatusByKey", T, rR.key || "x");
    const saleKey = String((await row(B.bR!.id))?.idempotencyKey ?? ""); // หน้าขายเก็บ "reg2:" + คีย์ของ client
    const b = await call(svc, "saleStatusByKey", T, saleKey || "x");
    const c = await call(svc, "saleStatusByKey", T, `qc116-${RAND}-ไม่มีคีย์นี้`);
    chk("R5b-2", rR.id !== "" && a === null && b === "PAID" && c === null, "คีย์ใบคืน null · คีย์บิล PAID · ไม่มี null", FXB(`ใบคืน ${short(a)} · บิล ${short(b)} · ไม่มี ${short(c)}`));
  }

  // ════════ D billDetail ════════
  const abbOf = async (saleId: string): Promise<Any> => (saleId ? P.accountDocument.findFirst({ where: { tenantId: T, docType: "TAX_INVOICE_ABB", refType: "PosSale", refId: saleId } }).catch(() => null) : null);
  // D1
  {
    const p: string[] = [NEED(billsMod, "bills.ts")].filter(Boolean);
    const TOTAL_KEYS = ["subtotal", "lineDiscount", "billDiscount", "coupon", "tier", "serviceCharge", "vatSatang", "vatRateBp", "grandTotal", "tip", "refunded"];
    const totalsOk = (tt: Any, out: string[], label: string): boolean => {
      const miss = TOTAL_KEYS.filter((k) => typeof tt?.[k] !== "number");
      if (miss.length) {
        out.push(`${label} totals ขาด ${miss.join(",")}`);
        return false;
      }
      if (tt.subtotal - tt.lineDiscount - tt.billDiscount - tt.coupon - tt.tier + tt.serviceCharge !== tt.grandTotal) {
        out.push(`${label} เอกลักษณ์ยอด ${short(tt, 160)}`);
        return false;
      }
      return true;
    };
    const auditsBefore = await allAudits();
    const dR = await detail("A", owner, B.bR!.id);
    const dP = await detail("A", owner, B.bP!.id);
    const auditsAfter = await allAudits();
    const sR = await row(B.bR!.id);
    const sP = await row(B.bP!.id);
    // ตัวเทียบ = receiptPayload ของบิล bP (เรียกแล้วเขียน audit พิมพ์สำเนา ⇒ ห้ามเรียกกับ bR ที่ D3 นับ timeline) · วัด audit ของ billDetail ไปแล้วข้างบน
    const payP = await call(rcpMod, "receiptPayload", { tenantId: T, systemId: S.POSA }, owner, { saleId: B.bP!.id, copy: true });
    const abbR = await abbOf(B.bR!.id);
    const bill = dR?.ok === true ? dR.bill : null;
    if (!bill) p.push(`billDetail bR ${codeOf(dR)} ${short(dR?.message ?? "", 60)}`);
    else {
      const want: Record<string, unknown> = { id: B.bR!.id, receiptNo: sR?.receiptNo, status: "PAID", docType: "SALE", sourceModule: "POS", staffName: NAME.owner, shiftNo: S1No, deviceName: payP?.payload?.device?.name ?? "เครื่อง QC 1" };
      for (const [k, v] of Object.entries(want)) if (bill[k] !== v) p.push(`${k} ${short(bill[k], 40)} (คาด ${short(v, 40)})`);
      if (bill.time !== (sR?.paidAt ?? sR?.createdAt)?.toISOString?.()) p.push(`time ${short(bill.time, 30)}`);
      const tt = bill.totals ?? {};
      if (!totalsOk(tt, p, "bR")) {
        /* รายงานแล้ว */
      } else if (tt.refunded !== 10000 || tt.grandTotal !== 20000 || tt.vatSatang !== sR?.vatSatang || tt.vatRateBp !== 700) p.push(`bR refunded/grand/vat/rate ${tt.refunded}/${tt.grandTotal}/${tt.vatSatang}/${tt.vatRateBp}`);
      const ln = Array.isArray(bill.lines) ? bill.lines : [];
      const dbl = (sR?.lines ?? []) as Any[];
      if (ln.length !== dbl.length || dbl.some((l: Any, i: number) => !(ln[i]?.name === l.name && ln[i]?.qty === l.qty && ln[i]?.unitPriceSatang === l.unitPriceSatang && ln[i]?.discountSatang === l.discountSatang && ln[i]?.lineTotalSatang === l.lineTotalSatang && Array.isArray(ln[i]?.options)))) p.push(`lines ${short(ln, 120)}`);
      const m = bill.member;
      if (!(m && m.name === C1name && m.memberCode === C1code && m.customerId === C1 && m.pointsEarned === sR?.pointEarned && Number(sR?.pointEarned) > 0)) p.push(`member ${short(m, 120)} (แต้มบิล ${sR?.pointEarned})`);
      if (!(abbR && bill.accounting?.docId === abbR.id && bill.accounting?.docNo === abbR.docNo)) p.push(`accounting ${short(bill.accounting, 80)} (ABB ${short(abbR?.docNo ?? null)})`);
      const rf = Array.isArray(bill.refunds) ? bill.refunds : [];
      const cnDoc = rR.id ? await P.accountDocument.findFirst({ where: { tenantId: T, docType: "CREDIT_NOTE", refType: "PosSale", refId: rR.id } }).catch(() => null) : null;
      const r0 = rf[0] ?? {};
      if (!(rf.length === 1 && r0.id === rR.id && r0.receiptNo === rR.receiptNo && r0.grandTotalSatang === 10000 && r0.reasonCode === "CHANGED_MIND" && r0.reason === "ลูกค้าเปลี่ยนใจ" && r0.byName === NAME.owner && typeof r0.time === "string" && (r0.accounting?.docNo ?? null) === (cnDoc?.docNo ?? null) && (cnDoc ? !!r0.accounting : true)))
        p.push(`refunds ${short(rf, 160)}`);
      const pay = Array.isArray(bill.payments) ? bill.payments : [];
      if (!(pay.length === 1 && pay[0]?.type === "PROMPTPAY" && pay[0]?.amountSatang === 20000)) p.push(`payments bR ${short(pay, 80)}`);
      if (bill.receiptKind !== "TAX_INVOICE_ABB") p.push(`receiptKind ${bill.receiptKind}`);
    }
    const tP = dP?.ok === true ? dP.bill?.totals ?? {} : null;
    const pt = payP?.ok === true ? payP.payload.totals : null;
    if (!pt) p.push(`ตัวเทียบ receiptPayload bP ${codeOf(payP)}`);
    else if (tP && totalsOk(tP, p, "bP")) {
      const pairs: [string, string][] = [["subtotal", "subtotalSatang"], ["lineDiscount", "lineDiscountSatang"], ["billDiscount", "billDiscountSatang"], ["coupon", "couponDiscountSatang"], ["tier", "tierDiscountSatang"], ["serviceCharge", "serviceChargeSatang"], ["vatSatang", "vatSatang"], ["vatRateBp", "vatRateBp"], ["grandTotal", "grandTotalSatang"], ["tip", "tipSatang"]];
      for (const [a, b] of pairs) if (tP[a] !== pt[b]) p.push(`bP totals.${a} ${tP[a]} ≠ payload ${pt[b]}`);
      if (tP.grandTotal - tP.vatSatang !== pt.vatBaseSatang) p.push(`bP grand − vat ${tP.grandTotal - tP.vatSatang} ≠ vatBase ${pt.vatBaseSatang}`);
      if (tP.refunded !== 0 || tP.grandTotal !== 15000 || tP.vatSatang !== sP?.vatSatang) p.push(`bP refunded/grand/vat ${tP.refunded}/${tP.grandTotal}/${tP.vatSatang}`);
    }
    const bp = dP?.ok === true ? dP.bill : null;
    const cashP = (sP?.payments ?? []).find((x: Any) => x.type === "CASH");
    if (!bp) p.push(`billDetail bP ${codeOf(dP)}`);
    else if (!(Array.isArray(bp.payments) && bp.payments.length === 1 && bp.payments[0].type === "CASH" && bp.payments[0].amountSatang === 15000 && bp.payments[0].tenderedSatang === cashP?.tenderedSatang && bp.payments[0].changeSatang === cashP?.changeSatang && cashP?.tenderedSatang === 20000 && bp.member === null))
      p.push(`bP payments/member ${short({ pay: bp.payments, member: bp.member }, 140)}`);
    if (billsMod && auditsAfter !== auditsBefore) p.push(`billDetail เขียน audit ${auditsBefore}→${auditsAfter}`);
    const nfB = await detail("A", owner, B.bB!.id);
    const nfX = await detail("A", owner, `cqc116unknown${RAND}zz`);
    const nfC = await detail("B", cashier(), B.bB!.id);
    for (const [l, r] of [["บิลสาขา B ด้วย unitId A", nfB], ["id มั่ว", nfX], ["แคชเชียร์สาขา A ขอสาขา B", nfC]] as [string, Any][]) if (!refused(r, "SALE_NOT_FOUND")) p.push(`${l} → ${codeOf(r)}`);
    chk("D1", p.length === 0, "รูปร่าง+ยอดตรง receiptPayload · ไม่เขียน audit · SALE_NOT_FOUND ×3", FXB(p.slice(0, 7).join(" · ") + (p.length > 7 ? ` …(+${p.length - 7})` : "") || "ครบ"));
  }
  // D2
  {
    const p: string[] = [NEED(billsMod, "bills.ts")].filter(Boolean);
    const dP = await detail("A", owner, B.bP!.id);
    const dN = await detail("N", owner, B.bN!.id);
    const kP = await call(rcpMod, "receiptPayload", { tenantId: T, systemId: S.POSA }, owner, { saleId: B.bP!.id, copy: true });
    const kN = await call(rcpMod, "receiptPayload", { tenantId: T, systemId: S.POSN }, owner, { saleId: B.bN!.id, copy: true });
    if (kP?.payload?.kind !== "TAX_INVOICE_ABB" || kN?.payload?.kind !== "RECEIPT") p.push(`ตัวควบคุม receiptPayload ${short([kP?.payload?.kind, kN?.payload?.kind])}`);
    if (dP?.bill?.receiptKind !== kP?.payload?.kind) p.push(`VAT ${short(dP?.bill?.receiptKind ?? codeOf(dP))} ≠ ${kP?.payload?.kind}`);
    if (dN?.bill?.receiptKind !== kN?.payload?.kind || dN?.bill?.receiptKind !== "RECEIPT") p.push(`ไม่ผูก ${short(dN?.bill?.receiptKind ?? codeOf(dN))} ≠ ${kN?.payload?.kind}`);
    chk("D2", p.length === 0, "TAX_INVOICE_ABB / RECEIPT = receiptPayload.kind", FXB(p.join(" · ") || "ครบ"));
  }
  // D3 timeline
  {
    const p: string[] = [NEED(billsMod, "bills.ts")].filter(Boolean);
    const d = await detail("A", owner, B.bR!.id);
    const tl: Any[] = Array.isArray(d?.bill?.timeline) ? d.bill.timeline : [];
    const abb = await abbOf(B.bR!.id);
    const texts = tl.map((x: Any) => String(x?.text ?? ""));
    const times = tl.map((x: Any) => Date.parse(String(x?.time ?? "")));
    if (d?.ok !== true) p.push(`billDetail ${codeOf(d)}`);
    else {
      if (tl.length !== 4) p.push(`timeline ${tl.length} แถว (คาด 4) ${short(texts, 200)}`);
      if (times.some((t) => Number.isNaN(t)) || times.some((t, i) => i > 0 && t < times[i - 1]!)) p.push(`เวลาไม่เรียง ${short(tl.map((x: Any) => x?.time), 120)}`);
      const [t1, t2, t3, t4] = texts;
      if (!(t1?.startsWith("เปิดบิลและชำระครบ") && t1.includes(NAME.owner))) p.push(`แถว 1 ${short(t1, 60)}`);
      if (!(t2?.includes("ลงบัญชีอัตโนมัติ") && !!abb?.docNo && t2.includes(String(abb.docNo)) && t2.includes("ให้แต้มสมาชิก"))) p.push(`แถว 2 ${short(t2, 80)} (ABB ${short(abb?.docNo ?? null)})`);
      if (!(t3?.startsWith("คืนเงิน") && t3.includes(money(10000)) && t3.includes(NAME.owner) && t3.includes("ลูกค้าเปลี่ยนใจ") && !!rR.receiptNo && t3.includes(rR.receiptNo))) p.push(`แถว 3 ${short(t3, 100)} (คาด ${money(10000)} ${rR.receiptNo})`);
      if (!(t4?.startsWith("พิมพ์สำเนา") && t4.includes(NAME.cashier))) p.push(`แถว 4 ${short(t4, 60)}`);
      if (texts.some((t) => /LINE|กำลังทำรายการ/.test(t))) p.push("มีแถว LINE/กำลังทำรายการ");
    }
    if ((await reprintAudits(B.bR!.id)) !== 1 || rp?.ok !== true) p.push(`audit พิมพ์สำเนา ${await reprintAudits(B.bR!.id)} · action ${codeOf(rp)}`);
    chk("D3", p.length === 0, "เปิดบิล → ลงบัญชี+แต้ม → คืนเงิน ฿100 → พิมพ์สำเนา", FXB(p.join(" · ") || "ครบ"));
  }
  // D4 can.* matrix
  {
    const p: string[] = [NEED(billsMod, "bills.ts")].filter(Boolean);
    const cases: [string, Any, string, { void: boolean; refund: boolean; reprint: boolean }, string | null][] = [
      ["ผู้จัดการ bP กะเปิด", manager(), B.bP!.id, { void: true, refund: true, reprint: true }, null],
      ["เจ้าของ bR คืนบางส่วน", owner, B.bR!.id, { void: false, refund: true, reprint: true }, "HAS_REFUNDS"],
      ["เจ้าของ bC กะปิด", owner, B.bC!.id, { void: false, refund: true, reprint: true }, "SHIFT_CLOSED"],
      ["เจ้าของ bX โมดูลอื่น", owner, B.bX!.id, { void: false, refund: false, reprint: true }, "NOT_POS"],
      ["แคชเชียร์ bP", cashier(), B.bP!.id, { void: false, refund: false, reprint: true }, "NO_PERMISSION"],
    ];
    for (const [label, a, id, want, reason] of cases) {
      const d = await detail("A", a, id);
      const c = d?.bill?.can;
      if (d?.ok !== true) {
        p.push(`${label}: ${codeOf(d)}`);
        continue;
      }
      if (!(c && c.void === want.void && c.refund === want.refund && c.reprint === want.reprint)) p.push(`${label}: can ${short(c, 60)}`);
      const got = d.bill.voidBlockedReason ?? null;
      if (got !== reason) p.push(`${label}: voidBlockedReason ${short(got)} (คาด ${short(reason)})`);
    }
    chk("D4", p.length === 0, "void/refund/reprint + เหตุ ตาม 5 กรณี", FXB(p.join(" · ") || "ครบ"));
  }

  // ════════ V voidSaleAction ════════
  const NEEDV = NEED(billsAct, "bills-actions.ts");
  const vRefusals: [string, Any][] = [];
  const keepV = (l: string, r: Any) => {
    vRefusals.push([l, r]);
    return r;
  };
  // V1
  {
    const p: string[] = [];
    const id = B.bV!.id;
    for (const [l, reason] of [["ว่าง", ""], ["ช่องว่าง", "   "], ["201 ตัว", "ก".repeat(201)]] as [string, string][]) {
      const r = keepV(`V1 ${l}`, await voidAct(manager(), "A", id, reason, newKey("v")));
      if (!refused(r, "REASON_REQUIRED")) p.push(`${l} → ${codeOf(r)}`);
    }
    const s = await row(id);
    if (s?.status !== "PAID") p.push(`บิล ${s?.status}`);
    if ((await voidAudits(id)).length !== 0 || (await voidEvents(id)) !== 0) p.push("มี audit/outbox");
    chk("V1", p.length === 0, "REASON_REQUIRED ×3 · ยัง PAID", FXB(NEEDV + (p.join(" · ") || "ครบ")));
  }
  // V2
  {
    const p: string[] = [];
    const id = B.bV!.id;
    const r = keepV("V2 แคชเชียร์", await voidAct(cashier(), "A", id, "ลูกค้ายกเลิก", newKey("v")));
    if (!refused(r, "NO_PERMISSION")) p.push(`แคชเชียร์ → ${codeOf(r)}`);
    if ((await row(id))?.status !== "PAID" || (await voidAudits(id)).length !== 0 || (await voidEvents(id)) !== 0) p.push("บิลถูกแตะ");
    chk("V2", p.length === 0, "NO_PERMISSION · ไม่มีผล", FXB(NEEDV + (p.join(" · ") || "ครบ")));
  }
  // V3 + V4
  const VREASON = "ลูกค้ายกเลิกออเดอร์ QC";
  const vKey = newKey("vok");
  {
    const p: string[] = [];
    const id = B.bV!.id;
    const r = await voidAct(manager(), "A", id, VREASON, vKey);
    await drain();
    if (!(r?.ok === true && r.sale?.id === id && r.sale?.status === "VOIDED" && !r.duplicated)) p.push(`ผล ${short(r, 120)}`);
    if ((await row(id))?.status !== "VOIDED") p.push(`แถว ${(await row(id))?.status}`);
    const au = await voidAudits(id);
    if (!(au.length === 1 && au[0].actorId === mgrId && au[0].targetType === "PosSale" && (au[0].after as Any)?.reason === VREASON)) p.push(`audit ${short(au.map((x: Any) => ({ a: x.actorId === mgrId, t: x.targetType, after: x.after })), 120)}`);
    if ((await voidEvents(id)) !== 1) p.push(`outbox ${await voidEvents(id)}`);
    const d = await detail("A", owner, id);
    const tl: string[] = Array.isArray(d?.bill?.timeline) ? d.bill.timeline.map((x: Any) => String(x?.text ?? "")) : [];
    if (!tl.some((t) => t.startsWith("ยกเลิกบิล") && t.includes(NAME.mgr) && t.includes(VREASON))) p.push(`timeline ${short(tl, 120)}`);
    chk("V3", p.length === 0, "VOIDED · audit 1 (ผู้จัดการ · reason) · outbox 1 · timeline", FXB(NEEDV + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const id = B.bV!.id;
    const r = await voidAct(manager(), "A", id, VREASON, vKey);
    await drain();
    if (!(r?.ok === true && r.duplicated === true && r.sale?.status === "VOIDED" && !r.threw)) p.push(`เล่นซ้ำ ${short(r, 100)}`);
    if ((await voidAudits(id)).length !== 1) p.push(`audit ${(await voidAudits(id)).length}`);
    if ((await voidEvents(id)) !== 1) p.push(`outbox ${await voidEvents(id)}`);
    const r2 = keepV("V4 คีย์ใหม่บนบิลยกเลิกแล้ว", await voidAct(manager(), "A", id, VREASON, newKey("v")));
    if (!refused(r2, "SALE_NOT_VOIDABLE")) p.push(`คีย์ใหม่ → ${codeOf(r2)}`);
    chk("V4", p.length === 0, "duplicated:true · audit 1 · outbox 1 · คีย์ใหม่ SALE_NOT_VOIDABLE", FXB(NEEDV + (p.join(" · ") || "ครบ")));
  }
  // V5
  {
    const p: string[] = [];
    const r = keepV("V5 คืนบางส่วนแล้ว", await voidAct(owner, "A", B.bR!.id, "ลองยกเลิก", newKey("v")));
    if (!refused(r, "HAS_REFUNDS")) p.push(`bR → ${codeOf(r)}`);
    const s = await row(B.bR!.id);
    if (!(s?.status === "PAID" && s?.refundedSatang === 10000) || (await voidEvents(B.bR!.id)) !== 0) p.push(`bR ${s?.status} ${s?.refundedSatang}`);
    const c = keepV("V5 กะปิด", await voidAct(owner, "A", B.bC!.id, "ลองยกเลิก", newKey("v")));
    if (!refused(c, "SHIFT_CLOSED")) p.push(`bC → ${codeOf(c)}`);
    if ((await row(B.bC!.id))?.status !== "PAID" || (await voidEvents(B.bC!.id)) !== 0) p.push("bC ถูกแตะ");
    chk("V5", p.length === 0, "HAS_REFUNDS · SHIFT_CLOSED · ไม่มีผล", FXB(NEEDV + (p.join(" · ") || "ครบ")));
  }
  // V6
  {
    const p: string[] = [];
    const a = keepV("V6 ใบ REFUND", await voidAct(owner, "A", rR.id || "x", "ลองยกเลิก", newKey("v")));
    if (!refused(a, "SALE_NOT_VOIDABLE")) p.push(`ใบคืน → ${codeOf(a)}`);
    const b = keepV("V6 โมดูลอื่น", await voidAct(owner, "A", B.bX!.id, "ลองยกเลิก", newKey("v")));
    if (!refused(b, "SALE_NOT_VOIDABLE")) p.push(`BOOKING → ${codeOf(b)}`);
    if ((await row(B.bX!.id))?.status !== "PAID" || (await voidEvents(B.bX!.id)) !== 0) p.push("bX ถูกแตะ");
    const c = keepV("V6 id มั่ว", await voidAct(owner, "A", `cqc116unknown${RAND}zz`, "ลองยกเลิก", newKey("v")));
    if (!refused(c, "SALE_NOT_FOUND")) p.push(`id มั่ว → ${codeOf(c)}`);
    const d = keepV("V6 บิลอีกสาขา", await voidAct(owner, "A", B.bB!.id, "ลองยกเลิก", newKey("v")));
    if (!refused(d, "SALE_NOT_FOUND")) p.push(`สาขา B → ${codeOf(d)}`);
    for (const [l, r] of vRefusals) if (!(r?.ok === false && !r.threw && typeof r.message === "string" && THAI.test(r.message))) p.push(`${l}: ไม่ใช่ข้อมูลไทย (${codeOf(r)}${r?.threw ? " throw" : ""})`);
    chk("V6", p.length === 0, `SALE_NOT_VOIDABLE ×2 · SALE_NOT_FOUND ×2 · ${vRefusals.length} คำปฏิเสธเป็นข้อมูลไทย`, FXB(NEEDV + (p.slice(0, 6).join(" · ") || "ครบ")));
  }
  // V7 ผู้เรียกเดิม 3 อาร์กิวเมนต์
  {
    const p: string[] = [];
    const id = B.bL!.id;
    const r = id ? await call(svc, "voidSale", T, U.A, id) : { ok: false, code: "NO_SALE" };
    await drain();
    if (r !== undefined) p.push(`voidSale → ${short(r, 80)} (คาด undefined)`);
    if ((await row(id))?.status !== "VOIDED") p.push(`แถว ${(await row(id))?.status}`);
    if ((await voidEvents(id)) !== 1) p.push(`outbox ${await voidEvents(id)}`);
    if ((await voidAudits(id)).length !== 0) p.push(`audit ${(await voidAudits(id)).length} (คาด 0)`);
    chk("V7", p.length === 0, "3 อาร์กิวเมนต์ VOIDED · outbox 1 · audit 0", FXB(p.join(" · ") || "ครบ"));
  }

  // ════════ B billsPageData (สถานะสุดท้ายของวัน) ════════
  const NEEDB = NEED(billsMod, "bills.ts");
  // แบบของข้อสอบ — แถววันที่ D0 สาขา A
  type M = { k: string; status: string; grand: number; refunded: number; src: string; seller: "owner" | "mgr" | null; offShift: boolean; refunds: string[]; voidBy: "mgr" | null; at: string; pays: string; member: boolean };
  const model: M[] = [
    { k: "bP", status: "PAID", grand: 15000, refunded: 0, src: "POS", seller: "owner", offShift: false, refunds: [], voidBy: null, at: "10:00:00", pays: "CASH", member: false },
    { k: "bR", status: "PAID", grand: 20000, refunded: 10000, src: "POS", seller: "owner", offShift: false, refunds: [rR.id], voidBy: null, at: "10:10:00", pays: "PROMPTPAY", member: true },
    { k: "bF", status: "REFUNDED", grand: 7500, refunded: 7500, src: "POS", seller: "mgr", offShift: false, refunds: [rF.id], voidBy: null, at: "10:20:00", pays: "CASH", member: false },
    { k: "bV", status: "VOIDED", grand: 4500, refunded: 0, src: "POS", seller: "owner", offShift: false, refunds: [], voidBy: "mgr", at: "10:30:00", pays: "CASH", member: false },
    { k: "bO", status: "PAID", grand: 3000, refunded: 0, src: "POS", seller: "owner", offShift: true, refunds: [], voidBy: null, at: "10:40:00", pays: "CASH", member: false },
    { k: "bX", status: "PAID", grand: 20000, refunded: 0, src: "BOOKING", seller: null, offShift: false, refunds: [], voidBy: null, at: "10:50:00", pays: "TRANSFER", member: false },
    { k: "bC", status: "PAID", grand: 5000, refunded: 0, src: "POS", seller: "owner", offShift: false, refunds: [], voidBy: null, at: "11:00:00", pays: "CASH", member: false },
    { k: "bL", status: "VOIDED", grand: 2500, refunded: 0, src: "POS", seller: "owner", offShift: false, refunds: [], voidBy: null, at: "11:10:00", pays: "CASH", member: false },
    { k: "bT", status: "REFUNDED", grand: 12000, refunded: 12000, src: "POS", seller: "owner", offShift: false, refunds: [rT1.id, rT2.id], voidBy: null, at: "11:20:00", pays: "CASH", member: false },
    { k: "f1", status: "PAID", grand: 1000, refunded: 0, src: "POS", seller: "owner", offShift: false, refunds: [], voidBy: null, at: "00:00:30", pays: "CASH", member: false },
    { k: "f2", status: "PAID", grand: 2000, refunded: 0, src: "POS", seller: "owner", offShift: false, refunds: [], voidBy: null, at: "12:00:00", pays: "CASH", member: false },
    { k: "f3", status: "PAID", grand: 3000, refunded: 0, src: "POS", seller: "mgr", offShift: false, refunds: [], voidBy: null, at: "12:10:00", pays: "CASH", member: false },
    { k: "f4", status: "PAID", grand: 2600, refunded: 0, src: "POS", seller: "owner", offShift: false, refunds: [], voidBy: null, at: "12:20:00", pays: "CASH+PROMPTPAY", member: false },
  ];
  const idOf = (k: string) => B[k]?.id ?? "";
  const expRows = (pred: (m: M) => boolean): ExpRow[] =>
    model.filter(pred).map((m) => ({ id: idOf(m.k), status: m.status, grandTotalSatang: m.grand, refundedSatang: m.refunded, sourceModule: m.src, offShiftCash: m.offShift, refundIds: m.refunds.filter(Boolean) }));
  const idsOf = (r: Any): string[] => (Array.isArray(r?.items) ? (r.items as Any[]).map((x: Any) => String(x?.id)) : []);
  const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");
  const keysOf = (pred: (m: M) => boolean) => model.filter(pred).map((m) => idOf(m.k));
  const big = { pageSize: 50 };
  const all = await page("A", owner, big);
  // B1
  {
    const p: string[] = [];
    const cB = await page("B", cashier());
    if (!(cB?.ok === true && Array.isArray(cB.items) && cB.items.length === 0 && cB.total === 0 && cB.counts?.all === 0)) p.push(`แคชเชียร์ขอสาขา B → ${codeOf(cB)} ${short({ n: cB?.items?.length, t: cB?.total, c: cB?.counts }, 80)}`);
    const nN = await call(billsMod, "billsPageData", ctxOf("A"), owner, { unitId: U.N, date: D0 });
    if (!(nN?.ok === true && nN.total === 0 && Array.isArray(nN.items) && nN.items.length === 0)) p.push(`สาขาของ POS-N ใต้ POS-A → ${codeOf(nN)} total ${nN?.total}`);
    const nr = await page("A", noRead());
    if (!refused(nr, "NO_PERMISSION")) p.push(`ไม่มีสิทธิ์อ่าน → ${codeOf(nr)}`);
    const oB = await page("B", owner);
    if (!(oB?.ok === true && sameSet(idsOf(oB), [idOf("bB")]))) p.push(`เจ้าของขอ B → ${codeOf(oB)} ${idsOf(oB).length} แถว`);
    const svcRes = await page("A", owner);
    const actRes = await asSession(owner, () => call(billsAct, "billsPageDataAction", { systemId: S.POSA, unitId: U.A, date: D0 }));
    if (!(svcRes?.ok === true && JSON.stringify(actRes) === JSON.stringify(svcRes))) p.push(`action ≠ บริการ (${codeOf(actRes)} / ${codeOf(svcRes)})`);
    chk("B1", p.length === 0, "สาขานอกขอบเขต = ว่าง · NO_PERMISSION · เจ้าของเห็น B 1 · action = บริการ", FXB(NEEDB + (p.join(" · ") || "ครบ")));
  }
  // B2
  {
    const p: string[] = [];
    const ids = idsOf(all);
    if (all?.ok !== true) p.push(`D0 ${codeOf(all)}`);
    if (!ids.includes(idOf("f1"))) p.push("ไม่มีบิล 00:00:30 น. ของ D0");
    if (ids.includes(idOf("bY1")) || ids.includes(idOf("bY2"))) p.push("มีบิลของ D0−1");
    const y = await page("A", owner, { date: DY, ...big });
    if (!(y?.ok === true && sameSet(idsOf(y), [idOf("bY1"), idOf("bY2")]) && y.date === DY)) p.push(`D0−1 → ${codeOf(y)} ${idsOf(y).length} แถว date ${short(y?.date)}`);
    if (all?.ok === true && all.date !== D0) p.push(`date ${short(all.date)} (คาด ${D0})`);
    for (const bad of ["x", "2026-13-01", ""]) {
      const r = await page("A", owner, { date: bad });
      if (!refused(r, "VALIDATION")) p.push(`date "${bad}" → ${codeOf(r)}`);
    }
    chk("B2", p.length === 0, `D0 ${D0} มี 00:00:30 ไม่มี 23:30 ของ D0−1 · D0−1 2 บิล · VALIDATION ×3`, FXB(NEEDB + (p.join(" · ") || "ครบ")));
  }
  // B3
  {
    const p: string[] = [];
    const want = { all: 13, paid: model.filter((m) => m.status === "PAID").length, voided: 2, refunded: 2, offShiftCash: 1 };
    const c = all?.counts;
    if (!c || Object.entries(want).some(([k, v]) => c[k] !== v)) p.push(`counts ${short(c, 100)} (คาด ${short(want)})`);
    const filters: [string, (m: M) => boolean][] = [["PAID", (m) => m.status === "PAID"], ["VOIDED", (m) => m.status === "VOIDED"], ["REFUNDED", (m) => m.status === "REFUNDED"], ["OFF_SHIFT_CASH", (m) => m.offShift], ["ALL", () => true]];
    for (const [st, pred] of filters) {
      const r = await page("A", owner, { status: st, ...big });
      if (!(r?.ok === true && sameSet(idsOf(r), keysOf(pred)))) p.push(`${st} → ${codeOf(r)} ${idsOf(r).length} แถว (คาด ${keysOf(pred).length})`);
      if (r?.ok === true && JSON.stringify(r.counts) !== JSON.stringify(c)) p.push(`counts เปลี่ยนเมื่อกรอง ${st}`);
    }
    const bad = await page("A", owner, { status: "HELD" });
    if (!refused(bad, "VALIDATION")) p.push(`status HELD → ${codeOf(bad)}`);
    chk("B3", p.length === 0, `counts ${short(want)} · กรอง 5 แบบตรงชุด`, FXB(NEEDB + (p.join(" · ") || "ครบ")));
  }
  // B4
  {
    const p = all?.ok === true ? compareRows(all.items, expRows(() => true), refundIds) : [`${codeOf(all)}`];
    if (all?.ok === true) {
      const r = (all.items as Any[]).find((x: Any) => x.id === idOf("bR"));
      const rf = r?.refunds?.[0];
      if (!(rf && rf.receiptNo === rR.receiptNo && rf.grandTotalSatang === 10000)) p.push(`bR refunds[0] ${short(rf, 80)}`);
      const t = (all.items as Any[]).find((x: Any) => x.id === idOf("bT"));
      if (!(Array.isArray(t?.refunds) && t.refunds.length === 2 && sum(t.refunds.map((x: Any) => x.grandTotalSatang)) === 12000)) p.push(`bT refunds ${short(t?.refunds, 80)}`);
    }
    chk("B4", p.length === 0, "ไม่มีแถว REFUND · refunds[] ตรง · PAID/10,000 · REFUNDED", FXB(NEEDB + (p.slice(0, 6).join(" · ") + (p.length > 6 ? ` …(+${p.length - 6})` : "") || "ครบ")));
  }
  // B5
  {
    const p: string[] = [];
    if (all?.ok !== true) p.push(codeOf(all));
    else {
      for (const m of model) {
        const r = (all.items as Any[]).find((x: Any) => x.id === idOf(m.k));
        if (!r) continue; // B4 รายงานแถวหายแล้ว
        const s = await row(idOf(m.k));
        const wantTime = (s?.paidAt ?? s?.createdAt)?.toISOString?.();
        if (r.time !== wantTime || wantTime !== t0(m.at).toISOString()) p.push(`${m.k} time ${short(r.time, 30)}`);
        if (r.receiptNo !== s?.receiptNo) p.push(`${m.k} receiptNo`);
        if (r.payMethods !== m.pays) p.push(`${m.k} payMethods ${short(r.payMethods)} (คาด ${m.pays})`);
        const wantStaff = m.seller === "owner" ? NAME.owner : m.seller === "mgr" ? NAME.mgr : "ระบบ";
        if (r.staffName !== wantStaff) p.push(`${m.k} staffName ${short(r.staffName)} (คาด ${wantStaff})`);
        if (m.member) {
          if (!(r.customer && r.customer.name === C1name && typeof r.customer.sub === "string" && r.customer.sub.includes(C1code) && !r.customer.sub.includes(C1))) p.push(`${m.k} customer ${short(r.customer, 80)}`);
        } else if (r.customer !== null) p.push(`${m.k} customer ${short(r.customer, 40)} (คาด null)`);
        const vb = r.voidApprovedBy ?? null;
        if (vb !== (m.voidBy === "mgr" ? NAME.mgr : null)) p.push(`${m.k} voidApprovedBy ${short(vb)}`);
      }
    }
    chk("B5", p.length === 0, "time · payMethods · staffName/ระบบ · customer{name,sub} · voidApprovedBy", FXB(NEEDB + (p.slice(0, 6).join(" · ") + (p.length > 6 ? ` …(+${p.length - 6})` : "") || "ครบ 13 แถว")));
  }
  // B6
  {
    const p: string[] = [];
    const live = model.filter((m) => m.status !== "VOIDED");
    const net = sum(live.map((m) => m.grand - m.refunded));
    const n = live.length;
    const hu = (a: number, b: number) => (b > 0 ? Math.floor((2 * a + b) / (2 * b)) : 0);
    const want = { netSatang: net, billCount: n, storeCount: live.filter((m) => m.src === "POS").length, onlineCount: live.filter((m) => m.src !== "POS").length, avgSatang: hu(net, n), yesterdayAvgSatang: hu(15000, 2) };
    if (!(net === 61600 && n === 11 && net % n === 0)) p.push(`แบบของข้อสอบเพี้ยน net ${net} n ${n}`);
    const s = all?.summary;
    if (!s || Object.entries(want).some(([k, v]) => s[k] !== v)) p.push(`summary ${short(s, 160)} (คาด ${short(want)})`);
    const v = await page("A", owner, { status: "VOIDED" });
    if (v?.ok === true && JSON.stringify(v.summary) !== JSON.stringify(s)) p.push("summary เปลี่ยนตามตัวกรอง");
    chk("B6", p.length === 0, short(want), FXB(NEEDB + (p.join(" · ") || "ครบ")));
  }
  // B7
  {
    const p: string[] = [];
    const rno = B.bR!.receiptNo;
    const exact = await page("A", owner, { q: rno, ...big });
    if (!(exact?.ok === true && sameSet(idsOf(exact), [idOf("bR")]))) p.push(`เลขบิลเต็ม ${rno} → ${codeOf(exact)} ${idsOf(exact).length} แถว`);
    const prefix = rno.slice(0, -1);
    const wantPrefix: string[] = [];
    for (const m of model) {
      const s = await row(idOf(m.k));
      if (String(s?.receiptNo ?? "").toLowerCase().startsWith(prefix.toLowerCase())) wantPrefix.push(idOf(m.k));
    }
    const pre = await page("A", owner, { q: prefix.toLowerCase(), ...big });
    if (!(pre?.ok === true && sameSet(idsOf(pre), wantPrefix) && wantPrefix.length >= 2)) p.push(`prefix "${prefix}" → ${idsOf(pre).length} แถว (คาด ${wantPrefix.length})`);
    for (const q of [C1name.split(" ")[0]!, C1phone]) {
      const r = await page("A", owner, { q, ...big });
      if (!(r?.ok === true && sameSet(idsOf(r), [idOf("bR")]))) p.push(`q "${q}" → ${codeOf(r)} ${idsOf(r).length} แถว`);
    }
    for (const q of ["%", "_"]) {
      const r = await page("A", owner, { q, ...big });
      if (!(r?.ok === true && idsOf(r).length === 0 && r.total === 0)) p.push(`q "${q}" → ${codeOf(r)} ${idsOf(r).length} แถว (คาด 0)`);
    }
    const long = await page("A", owner, { q: "1".repeat(61) });
    if (!refused(long, "VALIDATION")) p.push(`q 61 ตัว → ${codeOf(long)}`);
    chk("B7", p.length === 0, "เลขเต็ม 1 · prefix ตรงชุด · ชื่อ/เบอร์ 1 · %/_ 0 · 61 ตัว VALIDATION", FXB(NEEDB + (p.join(" · ") || "ครบ")));
  }
  // B8
  {
    const p: string[] = [];
    const bk = await page("A", owner, { channel: "BOOKING", ...big });
    if (!(bk?.ok === true && sameSet(idsOf(bk), [idOf("bX")]))) p.push(`BOOKING → ${idsOf(bk).length} แถว`);
    const pos = await page("A", owner, { channel: "POS", ...big });
    if (!(pos?.ok === true && sameSet(idsOf(pos), keysOf((m) => m.src === "POS")))) p.push(`POS → ${idsOf(pos).length} แถว`);
    const st = await page("A", owner, { staffUserId: mgrId, ...big });
    if (!(st?.ok === true && sameSet(idsOf(st), keysOf((m) => m.seller === "mgr")))) p.push(`staff ผู้จัดการ → ${idsOf(st).length} แถว`);
    if (!(Array.isArray(all?.channels) && sameSet(all.channels, ["POS", "BOOKING"]))) p.push(`channels ${short(all?.channels)}`);
    const staff = Array.isArray(all?.staff) ? (all.staff as Any[]) : [];
    if (!(staff.length === 2 && staff.some((x: Any) => x.userId === ownerId && x.name === NAME.owner) && staff.some((x: Any) => x.userId === mgrId && x.name === NAME.mgr))) p.push(`staff ${short(staff, 100)}`);
    const order = [...model].sort((a, b) => (a.at < b.at ? 1 : -1)).map((m) => idOf(m.k));
    const p1 = await page("A", owner);
    const p2 = await page("A", owner, { page: 2 });
    const p3 = await page("A", owner, { page: 3 });
    const got = [...idsOf(p1), ...idsOf(p2)];
    if (!(p1?.ok === true && p1.pageSize === 10 && p1.page === 1 && p1.total === 13 && idsOf(p1).length === 10)) p.push(`หน้า 1 ${short({ n: idsOf(p1).length, page: p1?.page, size: p1?.pageSize, total: p1?.total })}`);
    if (!(p2?.ok === true && p2.page === 2 && idsOf(p2).length === 3)) p.push(`หน้า 2 ${idsOf(p2).length} แถว`);
    if (got.join(",") !== order.join(",")) p.push("ลำดับหน้า 1+2 ไม่ใช่เวลาใหม่→เก่า / ซ้ำ / ไม่ครบ");
    if (!(p3?.ok === true && idsOf(p3).length === 0 && p3.total === 13)) p.push(`หน้า 3 ${codeOf(p3)} ${idsOf(p3).length} แถว`);
    const s20 = await page("A", owner, { pageSize: 20 });
    if (!(s20?.ok === true && idsOf(s20).length === 13 && s20.pageSize === 20)) p.push(`pageSize 20 → ${idsOf(s20).length}`);
    const s15 = await page("A", owner, { pageSize: 15 });
    if (!refused(s15, "VALIDATION")) p.push(`pageSize 15 → ${codeOf(s15)}`);
    chk("B8", p.length === 0, "ช่องทาง/พนักงาน · channels · staff · แบ่งหน้า 10+3 เรียงใหม่→เก่า · pageSize", FXB(NEEDB + (p.join(" · ") || "ครบ")));
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
  await sleep(300); // scheduleDrain หลัง voidSale (best-effort ในโปรเซสนี้) ให้จบก่อนลบ
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
  try {
    wipe = await wipeTenant();
    const residue = Object.values(wipe.left).reduce((a, b) => a + Math.abs(b), 0) + wipe.tenantLeft;
    console.log(`  ลบร้านชั่วคราว ${T || "(ไม่ได้สร้าง)"}: ${wipe.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(wipe.left)} · Tenant ${wipe.tenantLeft}${wipe.err ? ` · ${wipe.err}` : ""}`);
  } catch (e) {
    wipe.err = `cleanup: ${(e as Error).message.slice(0, 200)}`;
    console.log(`💥 ${wipe.err}`);
  }
}
await sleep(200);
const countsAfter = await snapshotCounts();
const drift = Object.keys(countsBefore).filter((k) => countsBefore[k] !== countsAfter[k]).map((k) => `${k}:${countsBefore[k]}→${countsAfter[k]}`);
const tempLeft = Object.entries(wipe.left).map(([k, v]) => `${k}:${v}`);
chk("Z1", drift.length === 0 && tempLeft.length === 0 && wipe.tenantLeft === 0 && !wipe.err, "ร้าน QC ก่อน = หลัง · ร้านชั่วคราว 0 แถว",
  [drift.length ? `ร้าน QC: ${drift.join(", ")}` : "ร้าน QC เท่าเดิม", tempLeft.length ? `ร้านชั่วคราวเหลือ ${tempLeft.join(", ")}` : `ร้านชั่วคราว 0 (${wipe.tables} ตาราง)`, wipe.tenantLeft ? "แถว Tenant ยังอยู่" : "", wipe.err].filter(Boolean).join(" · "));
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, missing: skipReasons, d0: D0, a5: { drift, tempLeft } })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);
