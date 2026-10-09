// QC — POS RUN ใบ P1.7: PromptPay ไดนามิก (QR ล็อกยอด) · Beam (PromptPay ยืนยันอัตโนมัติ + บัตร) · PosPaymentIntent · ยืนยันเงินเข้าแบบ idempotent · ปิดสุภาพเมื่อไม่มีกุญแจ
//   เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ
// requires: pos-seed
//
// สัญญา: ledger/pos-briefs/pos-brief-P1.7.md §2 R1–R8 · §4 แผนข้อสอบ · §5 CD1–CD6 · pos-brief-COMMON · pos-brief-LANE-RULES
//        โน้ต: ledger/wo-notes/pos-P1.7-oracle.md (ตารางชื่อ · ผังข้อมูลทดสอบ · ความคลาดเคลื่อน · CONTROLLER-DECISION · ผลแดงที่คาด)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้และลงทะเบียนในตารางชื่อของโน้ต — ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//   §3 (PayScreen แผงขวาของ mockup 02 · 17A ตั้งค่า) = ใบ P1.7U + visual ของผู้คุมงาน — ไม่อยู่ในข้อสอบนี้
//
// ของที่ใบ P1.7 ต้องส่ง (ย่อจาก brief §2 + ชื่อที่ข้อสอบตั้ง):
//   schema: model PosPaymentIntent (R1 · kind/status/confirmedVia เป็น String) + migration เพิ่มอย่างเดียว · core/scope.ts · scripts/pos-qc-env.mts POS_MODELS
//   src/lib/modules/pos/payment-intent.ts:
//     createPaymentIntent(ctx, actor, {method, amountSatang, idempotencyKey, deviceId}, deps?: {beam?: {enabled(): boolean; createCharge(input)}})
//       → {ok:true, intent, reused} · id ขึ้นต้น "pi_" · Beam = createCharge({amountSatang, referenceId: "pos-"+id, method: "promptpay"|"card"})
//     markIntentPaid(intentId, {via: "WEBHOOK"|"MANUAL", beamRef?, amountSatang?, userId?}) → {ok:true, idempotent?, lateWebhook?} | refusal
//     confirmPaymentIntentManual(ctx, actor, {intentId}) · cancelPaymentIntent(ctx, actor, {intentId}) · paymentIntentStatus(ctx, actor, {intentId})
//     expirePaymentIntents(tenantId?) → {expired: n} (หรือจำนวนตรง ๆ)
//   src/lib/modules/pos/payment-webhook.ts: onBeamWebhookEvent({referenceId, chargeId, status, amountSatang, raw}) — ไม่ throw ทุกกรณี
//   src/lib/modules/pos/payment-intent-actions.ts ("use server"): createPaymentIntentAction · confirmPaymentIntentManualAction ·
//     cancelPaymentIntentAction · paymentIntentStatusAction
//   route /api/payment/beam/webhook: แขนง referenceId.startsWith("pos-") → onBeamWebhookEvent (hunk เล็กสุด)
//   register.ts submitRegisterSale: PROMPTPAY|CARD + reference ^pi_ = ใช้ intent ในธุรกรรมขาย (FOR UPDATE) → CONSUMED + PosPayment.reference/note
//   outbox "pos.payment.intent_paid" {intentId, unitId, amountSatang, via} + consumer (withAutomation) + ป้าย automation/labels.ts
//   ops event (logOps · tenantId ของร้าน): "pos.payment.beam_fallback" · "pos.payment.amount_mismatch" (WARN) · "pos.payment.refund_needed"
//   audit: "pos.payment.manual_confirm" {intentId, amountSatang} · "pos.payment.cancel"
//   settings: AppSystem(POS).settings.pos.payment {beam: {enabled}, qrExpiryMinutes (ปริยาย 15 · 5..60 · นอกช่วง = 15), manualConfirmRequiresManager (ปริยาย false)}
//   ข้อความ: src/messages/{th,en}/pos.json payment.errors.<camelCase ของรหัส> · refusalMessageKey ของรหัสใหม่ฝั่ง submit ≠ errors.unknown
//
// ขอบเขต: C สร้าง intent · W webhook · M ยืนยันเอง · S ใช้ intent ในบิล · E หมดอายุ · X1 ยกเลิก · NC ตัวควบคุมลบ · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p1.11/p1.8): SKIP เมื่อของ P1.7 ยังไม่มี (exit 0 + เหตุผล · ไม่เขียน QC4 แม้แถวเดียว) ·
//    QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash) · --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = รันเฉพาะ C9 (สถิต) + NC
//    ฐาน = QC4 เท่านั้น (ก่อนเขียนแถวแรกต้องเป็น host ep-frosty-lab) · ร้านชั่วคราว `qc-p17-<rand>` (ลบทั้งร้านใน finally · พิมพ์แถวค้าง = 0)
//    ร้าน QC ของ seed ไม่ถูกเขียน (ใช้แค่ userId เป็นผู้กระทำ) — Z2 นับแถว + ลายนิ้วมือก่อน/หลัง
//    🔴 ไม่มีเครือข่ายเลย: globalThis.fetch ถูกแทนด้วยตัวกั้น (ตอบ 503 + นับ) ตลอดช่วง DB · Beam = ตัวปลอมของข้อสอบผ่าน deps.beam เท่านั้น
//    🔴 กุญแจ Beam ของแพลตฟอร์ม: ข้อสอบไม่อ่าน/ไม่พิมพ์ค่า (พิมพ์แค่ "มี/ไม่มี") · ข้อ W5 ตั้งค่าปลอมสามตัวในโปรเซสนี้ชั่วคราวเพื่อเซ็น webhook แล้วคืนค่าเดิมใน finally
//    🔴 เวลา: หมดอายุ/24 ชม. ทดสอบด้วยการย้าย expiresAt/paidAt ผ่าน prisma (นับจากนาฬิกาตอนรัน) — ไม่มี sleep ยาว · ไม่ฮาร์ดโค้ดวันที่
//    โมดูล/โมเดลที่ยังไม่มีเข้าถึงแบบไดนามิก (`import(… as string)` + catch · `(prisma as any).posPaymentIntent?.…`) — next build ตรวจชนิด scripts/*.mts
//    ไม่ import lib/env แบบ static
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash, createHmac } from "node:crypto";

const SUITE = "qc-pos-p1.7";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · X1 idempotency/เล่นซ้ำ · X2 ข้ามขอบเขต · X3 สิทธิ์ · X4 เงิน · X5 ผลข้างเคียงครบทุกทาง · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P1.7-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── C สร้าง intent ──
  D("C1", "X4", "[R1 R2] createPaymentIntent PROMPTPAY ไม่มี Beam → {ok:true, reused:false} · id ขึ้นต้น pi_ · kind PROMPTPAY_STATIC · status PENDING · qrPayload = promptpayPayload({id: พร้อมเพย์ของร้าน, amountSatang}) ตรงทุกตัวอักษร · EMV ถูก (01=12 ล็อกยอด · 54 = สตางค์/100 ทศนิยม 2 ตำแหน่ง · 29 = AID+proxy · 53=764 · 58=TH · CRC = crc16xmodem ของ repo) · expiresAt = ตอนสร้าง + 15 นาที · deviceId/createdByUserId/unitId/systemId ตรง · beamChargeId/paidAt/confirmedVia/saleId null · lateWebhook false"),
  D("C2", "X1", "[R2] คีย์เดิม + ยอดเดิม → reused:true id เดิม ไม่มีแถวเพิ่ม · คีย์เดิม + ยอดต่าง → IDEMPOTENCY_CONFLICT แถวเดิมไม่เปลี่ยน · VALIDATION ไม่มีแถว: ยอด 0 / −100 / 10.5 / PRICE_MAX_SATANG+1 / \"100\" · method CASH / TRANSFER · คีย์สั้นกว่า 8 / มี \":\""),
  D("C3", "-", "[R2] ไม่มีพร้อมเพย์ของร้าน (PaymentProfile + ช่องทางการเงินของสมุดที่ผูก ว่างทั้งคู่) → PROMPTPAY_NOT_CONFIGURED ข้อความไทยบอกให้ตั้งในโปรไฟล์บัญชี · พร้อมเพย์ผิดรูป \"12345\" → PROMPTPAY_NOT_CONFIGURED · ไม่มีแถว · คืนค่าแล้วสร้างได้ (ตัวควบคุมบวก)"),
  D("C4", "-", "[R2 CD1] ร้านเปิด settings.pos.payment.beam.enabled + deps.beam (enabled true) → kind PROMPTPAY_BEAM · beamChargeId = chargeId ของตัวปลอม · qrPayload = qrPayload ที่ Beam คืน · createCharge ถูกเรียก 1 ครั้ง {amountSatang, referenceId \"pos-\"+id, method \"promptpay\"} · ร้านไม่เปิด + มีกุญแจ → STATIC ไม่เรียก createCharge · ร้านเปิด + แพลตฟอร์มไม่มีกุญแจ (ไม่ฉีด deps) → STATIC"),
  D("C5", "X5", "[R2] Beam ล้ม (createCharge คืน {error} / throw) → ถอยเป็น PROMPTPAY_STATIC (qrPayload EMV ถูก · beamChargeId null) · ops event \"pos.payment.beam_fallback\" (tenantId ร้านนี้) +1 ต่อครั้ง · แถว intent เพิ่มครั้งละ 1 พอดี (ไม่มีร่างค้าง)"),
  D("C6", "-", "[R2] CARD: ร้านไม่เปิด Beam / แพลตฟอร์มไม่มีกุญแจ / ร้านไม่เปิดแต่มีกุญแจ / Beam ล้ม → CARD_UNAVAILABLE ไม่มีแถว · ร้านเปิด + กุญแจ → kind CARD_BEAM · createCharge {method \"card\", referenceId \"pos-\"+id} · beamChargeId · qrPayload = url ที่ Beam คืน"),
  D("C7", "-", "[R2] settings.pos.payment.qrExpiryMinutes: 30 → +30 นาที · 5 → +5 · 60 → +60 · 4 / 61 / \"20\" → ปริยาย +15"),
  D("C8", "X3", "[R2 P1.10] ผู้ใช้ไม่มี pos.sale.create → PERMISSION_DENIED · เครื่องที่ถูกเพิกถอน → DEVICE_REVOKED · รหัสเครื่องผิดรูป → VALIDATION · ไม่มีแถว"),
  D("C9", "S", "[R1 R5 R6 CD5] สถิต: model PosPaymentIntent ครบคอลัมน์ R1 (kind/status/confirmedVia เป็น String · lateWebhook Boolean @default(false) · @@unique([tenantId, idempotencyKey]) · @@index([tenantId, unitId, status, createdAt]) · @@index([beamChargeId])) · migration เพิ่มอย่างเดียว · scope.ts + pos-qc-env ลงทะเบียน · consumer \"pos.payment.intent_paid\" ห่อ withAutomation + ป้าย labels.ts · actions \"use server\" 4 ตัว + requireTenant · route มีแขนง \"pos-\" → onBeamWebhookEvent · ไม่ import account internals · ไม่ import lib/env"),
  D("C10", "-", "[R8] คำปฏิเสธเป็นข้อมูลครบ 13 รหัส (VALIDATION IDEMPOTENCY_CONFLICT PROMPTPAY_NOT_CONFIGURED CARD_UNAVAILABLE PERMISSION_DENIED DEVICE_REVOKED AMOUNT_MISMATCH INTENT_CANCELLED INTENT_EXPIRED INTENT_PAID INTENT_NOT_PAID INTENT_CONSUMED INTENT_NOT_FOUND) · {ok:false, code, message ไทย} ไม่ throw · pos.json th/en มี payment.errors.<camelCase> ครบ 10 รหัสใหม่ · refusalMessageKey ของรหัสฝั่ง submit ≠ errors.unknown และชี้ข้อความที่มีจริงทั้งสองภาษา"),
  // ── W webhook ──
  D("W1", "X5", "[R3a R6] onBeamWebhookEvent({referenceId \"pos-\"+id, chargeId, status SUCCEEDED, amountSatang, raw}) intent BEAM PENDING → ok · PAID · paidAt ตอนนี้ · confirmedVia WEBHOOK · beamRef = chargeId · outbox pos.payment.intent_paid 1 แถว payload {intentId, unitId, amountSatang, via \"WEBHOOK\"} · consumer ลงทะเบียนแล้ว เล่นซ้ำ 2 ครั้งไม่ throw"),
  D("W2", "X1", "[R3a] webhook ซ้ำ → ok · paidAt เดิม · outbox ยัง 1 · markIntentPaid(id, {via WEBHOOK, beamRef, amountSatang}) ตรง → {ok:true, idempotent:true}"),
  D("W3", "X4", "[R3a] ยอดใน webhook ≠ intent → AMOUNT_MISMATCH · status PENDING · paidAt null · ops event \"pos.payment.amount_mismatch\" WARN +1 · ไม่มี outbox · ยอดถูกตามมา → PAID (ตัวควบคุมบวก)"),
  D("W4", "X4", "[R3a CD4] webhook หลังหมดเวลา: PENDING ที่ expiresAt ผ่านแล้ว → PAID lateWebhook true · สถานะ EXPIRED → PAID lateWebhook true · CANCELLED → INTENT_CANCELLED สถานะคง CANCELLED + ops event \"pos.payment.refund_needed\" +1"),
  D("W5", "X2", "[R3a R8] อ้างอิงที่ไม่รู้จัก / อินพุต null → ไม่ throw · สถานะ FAILED → intent คง PENDING · route จริง (กุญแจปลอมในโปรเซส): ลายเซ็นผิด → 401 · เซ็นถูก + pos- ไม่รู้จัก → 200 · เซ็นถูก + SUCCEEDED ของ intent จริง → 200 และ intent PAID via WEBHOOK"),
  // ── M ยืนยันเอง ──
  D("M1", "X5", "[R3b CD2] confirmPaymentIntentManual โดยแคชเชียร์ (pos.sale.create · ค่าตั้งปริยาย) → ok · PAID · confirmedVia MANUAL · confirmedByUserId = แคชเชียร์ · audit pos.payment.manual_confirm 1 แถว (targetId intent · after {intentId, amountSatang}) · outbox intent_paid via MANUAL 1 · ยืนยันซ้ำ → ok ไม่มี audit/outbox เพิ่ม"),
  D("M2", "-", "[R3b] intent PENDING ที่ expiresAt ผ่านแล้ว → INTENT_EXPIRED · ไม่ PAID · ไม่มี audit"),
  D("M3", "X3", "[R3b] manualConfirmRequiresManager true: แคชเชียร์ (ไม่มี pos.shift.manage) → PERMISSION_DENIED คง PENDING · ผู้ใช้ไม่มี pos.sale.create → PERMISSION_DENIED · ผู้จัดการ → ok confirmedByUserId ผู้จัดการ"),
  // ── S ใช้ intent ในบิล ──
  D("S1", "X5", "[R4 R7] submitRegisterSale CASH 7,500 + PROMPTPAY 32,500 reference = intent PAID (webhook) → บิล PAID · intent CONSUMED saleId = บิล · PosPayment PROMPTPAY reference = intentId note \"via WEBHOOK\" · CARD + intent CARD_BEAM → PosPayment CARD reference/note · intent ยืนยันเอง → note \"via MANUAL\" · intent จ่ายช้า (lateWebhook) ใช้ได้ใน 24 ชม. · webhook ซ้ำหลัง CONSUMED → คง CONSUMED"),
  D("S2", "X2", "[R4 CD4] ไม่มีบิลเกิด + intent ไม่เปลี่ยน: PENDING / CANCELLED / EXPIRED → INTENT_NOT_PAID · pi_ ไม่มีจริง / intent ของสาขาอื่น → INTENT_NOT_FOUND · PAID แต่ paidAt เกิน 24 ชม. → INTENT_EXPIRED"),
  D("S3", "X4", "[R4] PROMPTPAY 15,000 อ้าง intent PAID 20,000 (+ เงินสด 5,000) → AMOUNT_MISMATCH · ไม่มีบิล · intent คง PAID"),
  D("S4", "X1", "[R4] ส่งสองบิล (คีย์ต่างกัน) อ้าง intent เดียวพร้อมกันบน 2 connection → บิลเกิด 1 ใบพอดี · อีกคำขอ INTENT_CONSUMED · saleId ของ intent = ผู้ชนะ · PosPayment ที่อ้าง intent 1 แถว · ส่งครั้งที่สามคีย์ใหม่ → INTENT_CONSUMED"),
  D("S5", "X1", "[R4] ส่งบิล S1 ซ้ำ (คีย์เดิม payload เดิม) → ok saleId เดิม duplicated true · intent คง CONSUMED โดยบิลเดิม · PosPayment อ้าง intent ยัง 1 · จำนวนบิลไม่เพิ่ม"),
  D("S6", "X4", "[R4 CD-A] ทาง P1.6 ไม่เปลี่ยน: PROMPTPAY ไม่มี reference → PAID reference null · CARD + EDC \"EDC-778899\" → PAID reference ตรงตัว · TRANSFER + reference → PAID · PROMPTPAY + reference ที่ไม่ใช่ pi_ → VALIDATION ไม่มีบิล · ไม่มี intent เกิด"),
  // ── E หมดอายุ ──
  D("E1", "X1", "[R5] expirePaymentIntents(tenantId) → จำนวน = PENDING ที่หมดเวลาของร้านนี้ · แถวเหล่านั้น EXPIRED · PENDING ที่ยังไม่หมด / PAID ที่ expiresAt ผ่านแล้ว ไม่ถูกแตะ · เรียกซ้ำ → 0 · /api/cron/hourly เรียก expirePaymentIntents"),
  D("E2", "X2", "[R5] paymentIntentStatus(ctx, actor, {intentId}) → {ok, status, amountSatang, kind, qrPayload, expiresAt, paidAt, confirmedVia} · PENDING หมดเวลา → \"EXPIRED\" และเขียนลงแถว (ข้อสอบเลือก: เขียน) · PAID → paidAt/confirmedVia · id มั่ว / intent สาขาอื่น → INTENT_NOT_FOUND · ไม่มี pos.sale.create → PERMISSION_DENIED"),
  // ── X1 ยกเลิก ──
  D("X1", "-", "[R3c] cancelPaymentIntent PENDING → ok · CANCELLED · audit pos.payment.cancel 1 แถว · PAID → INTENT_PAID คง PAID · id มั่ว → INTENT_NOT_FOUND"),
  // ── NC ตัวควบคุมลบ ──
  D("NC", "-", "ตัวควบคุมลบ: ตัวตรวจของข้อสอบจับคำตอบที่ผิดโดยตั้งใจได้ (EMV CRC ผิด · ยอด 54 ผิดรูป · 01=11 แบบไม่ล็อกยอด · ไม่มี 54 · proxy ผิด · id ไม่มี pi_ · payload event ไม่มี via/ยอดเป็นสตริง · note ผิดรูป)"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราวเหลือ 0 แถวทุกตารางที่มี tenantId + แถว Tenant ถูกลบ + OpsEvent ไม่มีร้าน (route 401 ฯลฯ) ของรอบนี้ถูกลบ"),
  D("Z2", "-", "QC4 ลายนิ้วมือ: แถวของร้าน QC POS (seed) ก่อน = หลัง (นับ + hash · รวม posPaymentIntent)"),
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
  const full = id.startsWith("P1.7-") ? id : `P1.7-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)!.slice(0, 110)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
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
const MIN = 60_000;
const HOUR = 60 * MIN;
const tms = (v: unknown): number => (v instanceof Date ? v.getTime() : typeof v === "string" ? Date.parse(v) : NaN);
const camel = (code: string) => code.toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

// ── ชื่อที่ข้อสอบตั้ง ──
const EV_PAID = "pos.payment.intent_paid";
const OPS_FALLBACK = "pos.payment.beam_fallback";
const OPS_MISMATCH = "pos.payment.amount_mismatch";
const OPS_REFUND = "pos.payment.refund_needed";
const AUD_MANUAL = "pos.payment.manual_confirm";
const AUD_CANCEL = "pos.payment.cancel";
const REF_PREFIX = "pos-";
const PI_RE = /^pi_[A-Za-z0-9_-]{6,96}$/;
const INTENT_COLS = ["id", "tenantId", "unitId", "systemId", "kind", "amountSatang", "status", "qrPayload", "beamChargeId", "beamRef", "deviceId", "createdByUserId", "confirmedVia", "confirmedByUserId", "paidAt", "expiresAt", "saleId", "lateWebhook", "idempotencyKey", "createdAt", "updatedAt"] as const;
const NULLABLE_COLS = ["qrPayload", "beamChargeId", "beamRef", "confirmedVia", "confirmedByUserId", "paidAt", "saleId"];
const NEW_CODES = ["PROMPTPAY_NOT_CONFIGURED", "CARD_UNAVAILABLE", "AMOUNT_MISMATCH", "INTENT_NOT_FOUND", "INTENT_NOT_PAID", "INTENT_CONSUMED", "INTENT_EXPIRED", "INTENT_CANCELLED", "INTENT_PAID", "IDEMPOTENCY_CONFLICT"];
const SUBMIT_CODES = ["INTENT_NOT_PAID", "AMOUNT_MISMATCH", "INTENT_CONSUMED", "INTENT_NOT_FOUND", "INTENT_EXPIRED"];
const ALL_CODES = ["VALIDATION", "IDEMPOTENCY_CONFLICT", "PROMPTPAY_NOT_CONFIGURED", "CARD_UNAVAILABLE", "PERMISSION_DENIED", "DEVICE_REVOKED", "AMOUNT_MISMATCH", "INTENT_CANCELLED", "INTENT_EXPIRED", "INTENT_PAID", "INTENT_NOT_PAID", "INTENT_CONSUMED", "INTENT_NOT_FOUND"];
const PRICE_MAX_SATANG = 2_147_483_647; // = pricing-shared.ts PRICE_MAX_SATANG (ข้อสอบเขียนเอง)

// ── ตัวตรวจ EMV (ใช้ crc16xmodem ของ repo · ตัวแยก TLV ข้อสอบเขียนเอง) ──
const promptpayMod = await tryImport("@/lib/payment/promptpay");
const crc16 = (s: string): string => (typeof promptpayMod?.crc16xmodem === "function" ? String(promptpayMod.crc16xmodem(s)) : "NO_CRC_FN");
function tlvParse(s: string): Map<string, string> | null {
  const m = new Map<string, string>();
  let i = 0;
  while (i < s.length) {
    const tag = s.slice(i, i + 2);
    const lenS = s.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lenS)) return null;
    const len = Number(lenS);
    const v = s.slice(i + 4, i + 4 + len);
    if (v.length !== len) return null;
    m.set(tag, v);
    i += 4 + len;
  }
  return m;
}
/** proxy ตามสเปก PromptPay: มือถือ 10 หลัก → tag 01 "0066"+9 หลัก · 13 หลัก → tag 02 */
function proxyOf(id: string): [string, string] {
  const d = id.replace(/\D/g, "");
  return d.length === 10 ? ["01", "0066" + d.slice(1)] : ["02", d];
}
function emvProblems(p: unknown, amountSatang: number, ppid: string): string[] {
  if (typeof p !== "string" || !p) return ["ไม่ใช่สตริง"];
  const out: string[] = [];
  const m = tlvParse(p);
  if (!m) return ["TLV เพี้ยน"];
  if (m.get("00") !== "01") out.push(`00=${m.get("00")}`);
  if (m.get("01") !== "12") out.push(`01=${m.get("01")} (ต้อง 12 ล็อกยอด)`);
  if (m.get("53") !== "764") out.push(`53=${m.get("53")}`);
  if (m.get("58") !== "TH") out.push(`58=${m.get("58")}`);
  const amt = (amountSatang / 100).toFixed(2);
  if (m.get("54") !== amt) out.push(`54=${m.get("54")} (ต้อง ${amt})`);
  const inner = tlvParse(m.get("29") ?? "");
  const [pt, pv] = proxyOf(ppid);
  if (!inner || inner.get("00") !== "A000000677010111" || inner.get(pt) !== pv) out.push(`29=${m.get("29")}`);
  if (!p.slice(0, -4).endsWith("6304")) out.push("ไม่มี 6304 ก่อน CRC");
  const want = crc16(p.slice(0, -4));
  if (p.slice(-4) !== want) out.push(`CRC ${p.slice(-4)} ≠ ${want}`);
  return out;
}
const intentIdOk = (v: unknown) => typeof v === "string" && PI_RE.test(v);
const eventOk = (pl: Any, want: { intentId: string; unitId: string; amountSatang: number; via: string }) =>
  isRecord(pl) && pl.intentId === want.intentId && pl.unitId === want.unitId && pl.amountSatang === want.amountSatang && pl.via === want.via;
const noteOk = (n: unknown, via: string) => n === `via ${via}`;

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
  intent: `${POS_DIR}/payment-intent.ts`,
  webhook: `${POS_DIR}/payment-webhook.ts`,
  actions: `${POS_DIR}/payment-intent-actions.ts`,
  register: `${POS_DIR}/register.ts`,
  route: "src/app/api/payment/beam/webhook/route.ts",
  consumers: "src/lib/outbox-consumers.ts",
  labels: "src/lib/automation/labels.ts",
  cron: "src/app/api/cron/hourly/route.ts",
};
const INTENT_FNS = ["createPaymentIntent", "markIntentPaid", "confirmPaymentIntentManual", "cancelPaymentIntent", "paymentIntentStatus", "expirePaymentIntents"] as const;
const ACTIONS: [string, string][] = [
  ["createPaymentIntentAction", "createPaymentIntent"],
  ["confirmPaymentIntentManualAction", "confirmPaymentIntentManual"],
  ["cancelPaymentIntentAction", "cancelPaymentIntent"],
  ["paymentIntentStatusAction", "paymentIntentStatus"],
];
const srcOf = (f: string) => stripComments(rd(f));
const newSrc = () => [F.intent, F.webhook].map(srcOf).join("\n");
const STATIC_IDS = ["C9", "NC"].map((x) => `P1.7-${x}`);
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.intent))) skipReasons.push(`${F.intent} ยังไม่มี`);
for (const n of INTENT_FNS) if (!exportsFn(newSrc(), n)) skipReasons.push(`ยังไม่มี export ${n} (payment-intent.ts / payment-webhook.ts)`);
if (!exportsFn(newSrc(), "onBeamWebhookEvent")) skipReasons.push(`ยังไม่มี export onBeamWebhookEvent (${F.webhook} / payment-intent.ts)`);

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB) ═════════════════════════
function runC9(): void {
  const p: string[] = [];
  const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
  const b = prismaBlock(schemaSrc, "model", "PosPaymentIntent");
  if (!b) p.push("ไม่มี model PosPaymentIntent");
  else {
    const miss = INTENT_COLS.filter((c) => !fieldLine(b, c));
    if (miss.length) p.push(`ขาด ${miss.join(",")}`);
    for (const c of NULLABLE_COLS) {
      const l = fieldLine(b, c);
      if (l && !/\?$/.test(l.split(/\s+/)[1] ?? "")) p.push(`${c} ต้อง nullable`);
    }
    for (const c of ["kind", "status", "confirmedVia"]) {
      const t = (fieldLine(b, c).split(/\s+/)[1] ?? "").replace(/\?$/, "");
      if (t && t !== "String") p.push(`${c} ต้องเป็น String (พบ ${t})`);
    }
    if (!/^amountSatang\s+Int\b/.test(fieldLine(b, "amountSatang"))) p.push("amountSatang ไม่ใช่ Int");
    if (!/^lateWebhook\s+Boolean\s+@default\(false\)/.test(fieldLine(b, "lateWebhook"))) p.push("lateWebhook ไม่ใช่ Boolean @default(false)");
    const flat = b.replace(/\s+/g, "");
    if (!flat.includes("@@unique([tenantId,idempotencyKey]")) p.push("ไม่มี @@unique([tenantId, idempotencyKey])");
    if (!flat.includes("@@index([tenantId,unitId,status,createdAt]")) p.push("ไม่มี @@index([tenantId, unitId, status, createdAt])");
    if (!flat.includes("@@index([beamChargeId]")) p.push("ไม่มี @@index([beamChargeId])");
  }
  // migration
  const files = walk("prisma/migrations", [], /\.sql$/).filter((f) => /"PosPaymentIntent"/.test(rd(f)));
  if (!files.length) p.push("ไม่มี migration ที่สร้าง PosPaymentIntent");
  for (const f of files) {
    const stmts = rd(f).replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
    const bad = stmts.filter((s) => !/^CREATE\s+(TYPE|TABLE|UNIQUE\s+INDEX|INDEX)\b/i.test(s) && !/^ALTER\s+TABLE\s+"[A-Za-z]+"\s+ADD\s+(COLUMN|CONSTRAINT)\b/i.test(s) && !/^ALTER\s+TYPE\s+"[A-Za-z]+"\s+ADD\s+VALUE\b/i.test(s));
    if (bad.length) p.push(`${f.split("/").slice(-2, -1)[0]}: คำสั่งที่ไม่ใช่การเพิ่ม (${short(bad[0], 60)})`);
  }
  // ลงทะเบียน
  if (!/\bPosPaymentIntent\s*:/.test(srcOf("src/lib/core/scope.ts"))) p.push("scope.ts ไม่มี PosPaymentIntent");
  const env = srcOf("scripts/pos-qc-env.mts");
  const pm = env.slice(env.indexOf("export const POS_MODELS"), env.indexOf("export type PosModelKey"));
  if (!/\bposPaymentIntent\s*:/.test(pm)) p.push("pos-qc-env POS_MODELS ไม่มี posPaymentIntent");
  const cons = srcOf(F.consumers);
  const cm = new RegExp(`["']${EV_PAID.replace(/\./g, "\\.")}["']\\s*:\\s*([^\\n]*)`).exec(cons);
  if (!cm) p.push(`outbox-consumers ไม่มี "${EV_PAID}"`);
  else if (!/withAutomation\s*\(/.test(cm[1]!)) p.push(`"${EV_PAID}" ไม่ห่อ withAutomation`);
  if (!new RegExp(`value:\\s*["']${EV_PAID.replace(/\./g, "\\.")}["']`).test(srcOf(F.labels))) p.push(`automation/labels.ts ไม่มีป้าย ${EV_PAID}`);
  // actions
  const act = rd(F.actions);
  if (!act) p.push(`ไม่มี ${F.actions}`);
  else {
    if (!/^\s*["']use server["']/.test(act.replace(/^(\s*\/\/[^\n]*\n)+/, ""))) p.push("actions ไม่ขึ้นต้น \"use server\"");
    const a = stripComments(act);
    const nonAsync = [...a.matchAll(/export\s+(?!async\s+function)(const|let|function|type|interface|class|enum|\{)/g)].map((m) => m[1]);
    if (nonAsync.length) p.push(`actions export ที่ไม่ใช่ async function (${nonAsync.join(",")})`);
    for (const [an, fn] of ACTIONS) {
      if (!new RegExp(`export\\s+async\\s+function\\s+${an}\\b`).test(a)) p.push(`actions ไม่มี ${an}`);
      if (!new RegExp(`\\b${fn}\\s*\\(`).test(a)) p.push(`actions ไม่เรียก ${fn}`);
    }
    if (!/\brequireTenant\s*\(/.test(a)) p.push("actions ไม่เรียก requireTenant");
  }
  // route — แขนง pos- (hunk เล็ก)
  const route = srcOf(F.route);
  // แขนง pos-: startsWith("pos-") ตรง ๆ หรือ startsWith(<ค่าคงที่>) ที่ค่าคงที่ = "pos-" (ใน route หรือ payment-webhook/intent)
  if (!/startsWith\(\s*["']pos-["']\s*\)/.test(route) && !(/startsWith\(\s*[A-Za-z_$][\w$]*\s*\)/.test(route) && /=\s*["']pos-["']/.test(route + newSrc())))
    p.push("route ไม่มีแขนง referenceId.startsWith(\"pos-\")");
  if (!/\bonBeamWebhookEvent\b/.test(route)) p.push("route ไม่เรียก onBeamWebhookEvent");
  // ขอบเขตโมดูล
  for (const f of [F.intent, F.webhook, F.actions]) {
    const s = srcOf(f);
    if (!s) continue;
    if (/from\s+["']@\/lib\/modules\/account/.test(s)) p.push(`${f.split("/").pop()} import โมดูลบัญชี`);
    if (/from\s+["']@\/lib\/env["']/.test(s)) p.push(`${f.split("/").pop()} import lib/env แบบ static`);
  }
  if (srcOf(F.intent) && !/@\/lib\/payment\/promptpay/.test(srcOf(F.intent))) p.push("payment-intent.ts ไม่ใช้ lib/payment/promptpay");
  chk("C9", p.length === 0, "model R1 + migration เพิ่มอย่างเดียว + ลงทะเบียน + actions + route", p.join(" · ") || "ครบ");
}

function runNC(): void {
  const p: string[] = [];
  const pp = "0812345678";
  const good = typeof promptpayMod?.promptpayPayload === "function" ? String(promptpayMod.promptpayPayload({ id: pp, amountSatang: 32500 })) : "";
  if (!good) p.push("โหลด promptpayPayload ไม่ได้");
  else {
    if (emvProblems(good, 32500, pp).length) p.push(`payload ถูกแต่ตัวตรวจแดง: ${emvProblems(good, 32500, pp).join(",")}`);
    const badCrc = good.slice(0, -4) + (good.slice(-4) === "0000" ? "0001" : "0000");
    if (!emvProblems(badCrc, 32500, pp).length) p.push("CRC ผิดไม่ถูกจับ");
    if (!emvProblems(good, 32400, pp).length) p.push("ยอดผิดไม่ถูกจับ");
    const staticP = String(promptpayMod.promptpayPayload({ id: pp }));
    if (!emvProblems(staticP, 32500, pp).length) p.push("QR ไม่ล็อกยอด (01=11 ไม่มี 54) ไม่ถูกจับ");
    if (!emvProblems(good.replace("5406325.00", "5405325.0"), 32500, pp).length) p.push("54 ผิดรูปไม่ถูกจับ");
    if (!emvProblems(good, 32500, "0899999999").length) p.push("proxy ผิดไม่ถูกจับ");
    if (emvProblems(String(promptpayMod.promptpayPayload({ id: "1234567890123", amountSatang: 15050 })), 15050, "1234567890123").length) p.push("เลข 13 หลัก/150.50 ถูกแต่ตัวตรวจแดง");
  }
  if (!intentIdOk("pi_abc123xyz") || intentIdOk("cmabc123xyz") || intentIdOk("pi_") || intentIdOk("pi_ab:cdefgh") || intentIdOk(null)) p.push("ตัวตรวจ id pi_ เพี้ยน");
  const w = { intentId: "pi_x1234567", unitId: "u1", amountSatang: 100, via: "WEBHOOK" };
  if (!eventOk({ ...w }, w) || eventOk({ intentId: w.intentId, unitId: "u1", amountSatang: 100 }, w) || eventOk({ ...w, amountSatang: "100" }, w) || eventOk({ ...w, via: "MANUAL" }, w)) p.push("ตัวตรวจ payload event เพี้ยน");
  if (!noteOk("via WEBHOOK", "WEBHOOK") || noteOk("WEBHOOK", "WEBHOOK") || noteOk("via MANUAL", "WEBHOOK") || noteOk(null, "WEBHOOK")) p.push("ตัวตรวจ note เพี้ยน");
  if (camel("PROMPTPAY_NOT_CONFIGURED") !== "promptpayNotConfigured" || camel("INTENT_PAID") !== "intentPaid") p.push("camel เพี้ยน");
  chk("NC", p.length === 0, "ตัวตรวจจับของผิดได้ทุกแบบ", p.join(" · ") || "จับได้ครบ (CRC · ยอด · ไม่ล็อกยอด · 54 ผิดรูป · proxy · id · event · note)");
}

// ═════════════════════════ 1b. --no-db ═════════════════════════
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อ (C9 สถิต + NC)`);
  runC9();
  runNC();
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
const BEAM_ENV = ["BEAM_MERCHANT_ID", "BEAM_API_KEY", "BEAM_WEBHOOK_SECRET"] as const;
const platformBeam = BEAM_ENV.every((k) => !!process.env[k]?.trim());
console.log(`  กุญแจ Beam ของแพลตฟอร์มในโปรเซสนี้: ${platformBeam ? "มีครบ" : "ไม่มี"} (ไม่พิมพ์ค่า)`);

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
const PI: Any = typeof P.posPaymentIntent?.findMany === "function" ? P.posPaymentIntent : null;
if (!PI) skipReasons.push("Prisma client ยังไม่มี delegate posPaymentIntent (R1)");
const dbCols = new Set<string>();
try {
  const rows = (await P.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'PosPaymentIntent'`)) as Any[];
  for (const r of rows) dbCols.add(String(r.column_name));
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
{
  const miss = INTENT_COLS.filter((c) => !dbCols.has(c));
  if (miss.length === INTENT_COLS.length) skipReasons.push("ฐาน QC4 ยังไม่มีตาราง PosPaymentIntent");
  else if (miss.length) skipReasons.push(`ตาราง PosPaymentIntent ขาดคอลัมน์ ${miss.join(",")}`);
}

const COUNT_MODELS = ["posSale", "posSaleLine", "posPayment", "posShift", "posDevice", "outboxEvent", "auditLog", "opsEvent", "paymentProfile", "accountFinance", "appSystem"] as const;
const FP_MODELS = ["posSale", "posPayment", "posShift", "posDevice", "appSystem", "paymentProfile", "accountFinance"] as const;
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
  out["qc.posPaymentIntent"] = PI ? await PI.count({ where: { tenantId: { in: TIDS } } }).catch(() => "err") : "absent";
  return out;
}
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const m of [...FP_MODELS, ...(PI ? ["posPaymentIntent"] : [])]) {
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
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P1.7 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง · ไม่ได้เขียน QC4) · DB ${HOST}`);
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
const intentMod = ex(F.intent) ? await tryImport("@/lib/modules/pos/payment-intent") : null;
const webhookMod = ex(F.webhook) ? await tryImport("@/lib/modules/pos/payment-webhook") : null;
const register = await tryImport("@/lib/modules/pos/register");
const regShared = await tryImport("@/lib/modules/pos/register-shared");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const consMod = await tryImport("@/lib/outbox-consumers");
const pick = (name: string, ...mods: Any[]): Any => mods.find((m) => typeof m?.[name] === "function") ?? null;
const M = {
  createPaymentIntent: pick("createPaymentIntent", intentMod),
  markIntentPaid: pick("markIntentPaid", intentMod, webhookMod),
  confirmPaymentIntentManual: pick("confirmPaymentIntentManual", intentMod),
  cancelPaymentIntent: pick("cancelPaymentIntent", intentMod),
  paymentIntentStatus: pick("paymentIntentStatus", intentMod),
  expirePaymentIntents: pick("expirePaymentIntents", intentMod),
  onBeamWebhookEvent: pick("onBeamWebhookEvent", webhookMod, intentMod),
};

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p1.7-${RAND}`;
const T_SLUG = `qc-p17-${RAND}`;
const STARTED = new Date();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";
/** ข้อความที่ใช้ลบ OpsEvent ไม่มีร้าน (route 401 / แขนงเติมเครดิต AI ก่อน P1.7) ของรอบนี้ */
const opsMarkers: string[] = [RAND];

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
    return new Response("blocked by qc-pos-p1.7", { status: 503 });
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
const lanes: Any[] = [];
async function lane(i: number): Promise<Any> {
  if (lanes[i]) return lanes[i];
  const { PrismaClient } = (await import("@prisma/client" as string)) as Any;
  const { PrismaPg } = (await import("@prisma/adapter-pg" as string)) as Any;
  while (lanes.length <= i) lanes.push(new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }) }));
  return lanes[i];
}

// ── Beam ปลอม (รูปเดียวกับ beamAdapter ของโมดูลบัญชี: {enabled, createCharge}) ──
type BeamMode = "ok" | "error" | "throw" | "off";
const beamCalls: Any[] = [];
let beamN = 0;
const fakeBeam = (mode: BeamMode) => ({
  enabled: () => mode !== "off",
  createCharge: async (input: Any) => {
    beamCalls.push({ ...input, _mode: mode });
    if (mode === "error") return { error: "beam_502: qc fake" };
    if (mode === "throw") throw new Error("qc fake ECONNRESET");
    const n = ++beamN;
    return { chargeId: `chg_qc17_${RAND}_${n}`, url: `https://pay.beam.example/qc17/${RAND}/${n}`, qrPayload: `BEAMQR-${RAND}-${n}` };
  },
});

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !STATIC_IDS.includes(id) && id !== "P1.7-Z1" && id !== "P1.7-Z2");
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
  console.log(`   POS-A ผูกสมุดบัญชี · สาขา A (เครื่อง DEV1 กะเปิด · DEV2 ถูกเพิกถอน) + สาขา B · PaymentProfile.promptpayId + ช่องทางธนาคารของสมุด = 0812345678`);
  let fx = "";
  const S: Record<string, string> = {};
  const U: Record<string, string> = {};
  const PPID = "0812345678";
  const ownerId: string = PQC.coffee.users.owner.userId;
  const cashierId: string = PQC.coffee.users.cashier.userId;
  const managerId: string = PQC.resto.users.owner.userId;
  try {
    const t = await P.tenant.create({ data: { name: `QC P1.7 ชำระเงิน ${RAND}`, slug: T_SLUG } });
    T = t.id;
    for (const k of ["A", "B"]) U[k] = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขา${k}`, slug: `${T_SLUG}-${k.toLowerCase()}` } })).id;
    S.POS = (await sysSvc.createSystem(T, "POS", "POS-A QC P1.7")).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", "บัญชี QC P1.7")).id;
    await accSvc.saveSettings(T, S.ACC, { orgName: "ร้านชำระเงินคิวซี จำกัด", taxId: "0105561177639", vatRegistered: false });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POS } });
    await sysSvc.linkUnit(T, S.POS, U.A);
    await sysSvc.linkUnit(T, S.POS, U.B);
    await P.paymentProfile.create({ data: { tenantId: T, promptpayId: PPID, displayName: "ร้านชำระเงินคิวซี" } });
    await P.accountFinance.create({ data: { tenantId: T, systemId: S.ACC, type: "BANK", name: `ธนาคาร QC P1.7 ${RAND}`, bankName: "ธนาคารคิวซี", accountNo: "1234567890", promptpayId: PPID } });
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const NEED = (...xs: [unknown, string][]) => xs.filter(([v]) => !v).map(([, l]) => `${MISSING} ${l} · `).join("");
  const NI = () => NEED([PI, "โมเดล PosPaymentIntent"], [M.createPaymentIntent, "createPaymentIntent"]);

  // ─── ผู้กระทำ ───
  const owner = { userId: ownerId, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const cashier = { userId: cashierId, role: "STAFF", unitAccess: [U.A, U.B], permissions: { "pos.sale.create": true } };
  const noSell = { userId: cashierId, role: "STAFF", unitAccess: [U.A], permissions: { "pos.shift.operate": true } };
  const manager = { userId: managerId, role: "MANAGER", unitAccess: [U.A], permissions: {} };
  const DEV1 = `qc17${RAND}d1`;
  const DEV2 = `qc17${RAND}d2`;
  const DEVB = `qc17${RAND}db`;
  const ctxOf = (k: string, deviceId?: string): Any => ({ tenantId: T, systemId: S.POS, unitId: U[k], ...(deviceId ? { deviceId } : {}) });

  // ─── เครื่อง + กะ ───
  if (!fx) {
    const rg = await call(devMod, "registerDevice", ctxOf("A"), owner, { name: "เคาน์เตอร์ QC 1", deviceCode: DEV1 });
    if (rg?.ok !== true) console.log(`  ⚠️  registerDevice DEV1: ${codeOf(rg)} ${short(rg?.message ?? "", 80)}`);
    const r2 = await call(devMod, "registerDevice", ctxOf("A"), owner, { name: "เคาน์เตอร์ QC 2", deviceCode: DEV2 });
    const rv = r2?.ok === true ? await call(devMod, "revokeDevice", ctxOf("A"), owner, { id: r2.device.id }) : r2;
    if (rv?.ok !== true) console.log(`  ⚠️  เพิกถอน DEV2: ${codeOf(rv)} ${short(rv?.message ?? "", 80)}`);
    const o1 = await call(shiftMod, "openShift", ctxOf("A", DEV1), owner, { deviceId: DEV1, deviceLabel: "เคาน์เตอร์ QC 1", floatSatang: 0 });
    if (o1?.ok !== true) fx = `เปิดกะ: ${codeOf(o1)} ${short(o1?.message ?? "", 80)}`;
  }

  // ─── ตัวช่วย ───
  let keyN = 0;
  const newKey = (p = "k") => `qc17${RAND}${p}${++keyN}`;
  const intentRow = async (id: unknown): Promise<Any> => (PI && typeof id === "string" && id ? PI.findUnique({ where: { id } }).catch(() => null) : null);
  const intentCount = async (): Promise<number> => (PI && T ? Number(await PI.count({ where: { tenantId: T } }).catch(() => -1)) : -1);
  const saleCount = async (): Promise<number> => (T ? Number(await P.posSale.count({ where: { tenantId: T } }).catch(() => -1)) : -1);
  const setPay = async (pay: Any | null): Promise<void> => {
    if (!S.POS) return;
    const sys = await P.appSystem.findUnique({ where: { id: S.POS }, select: { settings: true } });
    const base = isRecord(sys?.settings) ? sys.settings : {};
    const pos = isRecord(base.pos) ? { ...base.pos } : {};
    if (pay === null) delete pos.payment;
    else pos.payment = pay;
    await P.appSystem.update({ where: { id: S.POS }, data: { settings: { ...base, pos } } });
  };
  const moveIntent = async (id: string, data: Any) => {
    if (PI && id) await PI.update({ where: { id }, data }).catch((e: Error) => console.log(`  ⚠️  ย้าย intent ${id}: ${e.message.slice(0, 80)}`));
  };
  type MkOpt = { method?: string; amount: number; key?: string; k?: string; actor?: Any; deps?: Any; dev?: string };
  const mk = async (label: string, o: MkOpt): Promise<{ r: Any; id: string; row: Any; key: string; t0: number; t1: number }> => {
    const key = o.key ?? newKey("i");
    const dev = o.dev ?? (o.k === "B" ? DEVB : DEV1);
    const input = { method: o.method ?? "PROMPTPAY", amountSatang: o.amount, idempotencyKey: key, deviceId: dev };
    const t0 = Date.now();
    const r = keep(label, await call(M.createPaymentIntent, "createPaymentIntent", ctxOf(o.k ?? "A", dev), o.actor ?? owner, input, ...(o.deps ? [o.deps] : [])));
    const t1 = Date.now();
    const id = r?.ok === true ? String(r.intent?.id ?? "") : "";
    return { r, id, row: await intentRow(id), key, t0, t1 };
  };
  const opsHits = async (marker: string): Promise<Any[]> =>
    T ? ((await P.opsEvent.findMany({ where: { tenantId: T } }).catch(() => [])) as Any[]).filter((e) => [e.source, e.message, e.detail].some((s) => String(s ?? "").includes(marker))) : [];
  const paidEvents = async (intentId: string): Promise<Any[]> =>
    T && intentId ? ((await P.outboxEvent.findMany({ where: { tenantId: T, type: EV_PAID } }).catch(() => [])) as Any[]).filter((e) => isRecord(e.payload) && e.payload.intentId === intentId) : [];
  const audits = async (action: string, targetId: string): Promise<Any[]> => (T && targetId ? ((await P.auditLog.findMany({ where: { tenantId: T, action, targetId } }).catch(() => [])) as Any[]) : []);
  const hook = async (label: string, ev: Any) => keep(label, await call(M.onBeamWebhookEvent, "onBeamWebhookEvent", ev));
  const evOf = (row: Any, over: Any = {}): Any => {
    const e = { referenceId: REF_PREFIX + String(row?.id ?? "none"), chargeId: String(row?.beamChargeId ?? `chg_none_${RAND}`), status: "SUCCEEDED", amountSatang: Number(row?.amountSatang ?? 0), ...over };
    return { ...e, raw: JSON.stringify({ chargeId: e.chargeId, referenceId: e.referenceId, status: e.status, amount: e.amountSatang }) };
  };
  const manual = async (label: string, id: string, actor: Any = owner, k = "A") => keep(label, await call(M.confirmPaymentIntentManual, "confirmPaymentIntentManual", ctxOf(k, DEV1), actor, { intentId: id }));
  const BEAM_ON = { beam: { enabled: true } };
  const beamOk = { beam: fakeBeam("ok") };
  /** intent BEAM PENDING (ร้านเปิด Beam ชั่วคราว) */
  const mkBeam = async (label: string, amount: number, method = "PROMPTPAY", k = "A") => {
    await setPay(BEAM_ON);
    const x = await mk(label, { amount, method, deps: beamOk, k });
    await setPay(null);
    return x;
  };
  /** intent ที่ PAID แล้ว (BEAM → webhook · STATIC → ยืนยันเอง) */
  const mkPaid = async (label: string, amount: number, via: "WEBHOOK" | "MANUAL", method = "PROMPTPAY", k = "A") => {
    const x = via === "WEBHOOK" ? await mkBeam(label, amount, method, k) : await mk(label, { amount, k });
    if (x.id) {
      if (via === "WEBHOOK") await hook(`${label}:hook`, evOf(x.row));
      else await manual(`${label}:manual`, x.id, owner, k);
    }
    return { ...x, row: await intentRow(x.id) };
  };
  // ─── ขายผ่านหน้าขาย (quote → submit) ───
  const sell = async (label: string, lines: [string, number][], pays: Any[], o: { key?: string; actor?: Any; db?: Any } = {}) => {
    const c = ctxOf("A", DEV1);
    const cart: Any = { lines: lines.map(([name, unitPriceSatang]) => ({ name, qty: 1, unitPriceSatang })) };
    const want = sum(lines.map(([, pr]) => pr));
    const cash = sum(pays.filter((p) => p.type === "CASH").map((p) => Number(p.amountSatang)));
    const input: Any = { ...cart, idempotencyKey: o.key ?? newKey("s"), expectedGrandTotalSatang: want, payMethods: pays, ...(cash > 0 ? { cashReceivedSatang: cash } : {}) };
    let err = "";
    if (fx) err = "fixture";
    else {
      const q = await call(register, "quoteRegisterCart", c, o.actor ?? owner, cart);
      if (q?.ok !== true || q.grandTotalSatang !== want) err = `quote ${codeOf(q)} ${q?.grandTotalSatang} (คาด ${want})`;
    }
    const r = err ? { ok: false, code: "FIXTURE", message: err } : keep(label, await call(register, "submitRegisterSale", c, o.actor ?? owner, input, ...(o.db ? [o.db] : [])));
    return { r, input, saleId: r?.ok === true ? String(r.saleId) : "" };
  };
  const payRows = async (saleId: string): Promise<Any[]> => (saleId ? ((await P.posPayment.findMany({ where: { saleId }, orderBy: { id: "asc" } }).catch(() => [])) as Any[]) : []);
  const refRows = async (ref: string): Promise<Any[]> => (T && ref ? ((await P.posPayment.findMany({ where: { tenantId: T, reference: ref } }).catch(() => [])) as Any[]) : []);
  const pi = (id: string) => ({ type: "PROMPTPAY", amountSatang: 0, reference: id });

  try {
    // ════════ C1 STATIC ════════
    {
      const p: string[] = [];
      const a = await mk("C1", { amount: 32500 });
      const b = await mk("C1b", { amount: 15050 });
      const want = (n: number) => (typeof promptpayMod?.promptpayPayload === "function" ? String(promptpayMod.promptpayPayload({ id: PPID, amountSatang: n })) : "?");
      for (const [x, n] of [[a, 32500], [b, 15050]] as const) {
        const w = x.row;
        if (x.r?.ok !== true) {
          p.push(`${n}: ${codeOf(x.r)} ${short(x.r?.message ?? "", 60)}`);
          continue;
        }
        if (x.r.reused !== false) p.push(`${n}: reused ${x.r.reused}`);
        if (!intentIdOk(x.id)) p.push(`${n}: id ${x.id} ไม่ขึ้นต้น pi_`);
        if (!w) {
          p.push(`${n}: ไม่มีแถว`);
          continue;
        }
        if (w.kind !== "PROMPTPAY_STATIC" || w.status !== "PENDING" || w.amountSatang !== n) p.push(`${n}: ${w.kind}/${w.status}/${w.amountSatang}`);
        if (w.qrPayload !== want(n)) p.push(`${n}: qrPayload ≠ promptpayPayload (${short(w.qrPayload, 50)})`);
        const e = emvProblems(w.qrPayload, n, PPID);
        if (e.length) p.push(`${n}: EMV ${e.join(",")}`);
        if (x.r.intent?.qrPayload !== undefined && x.r.intent.qrPayload !== w.qrPayload) p.push(`${n}: intent ที่คืน qrPayload ≠ แถว`);
        const exp = tms(w.expiresAt);
        if (!(exp >= x.t0 + 15 * MIN - 5000 && exp <= x.t1 + 15 * MIN + 5000)) p.push(`${n}: expiresAt ${new Date(exp).toISOString()} ไม่ใช่ +15 นาที`);
        if (w.deviceId !== DEV1 || w.createdByUserId !== ownerId || w.unitId !== U.A || w.systemId !== S.POS || w.tenantId !== T) p.push(`${n}: device/ผู้สร้าง/สาขา/ระบบ ${w.deviceId}/${w.createdByUserId}/${w.unitId === U.A}/${w.systemId === S.POS}`);
        if (w.beamChargeId !== null || w.paidAt !== null || w.confirmedVia !== null || w.saleId !== null || w.lateWebhook !== false) p.push(`${n}: ฟิลด์ตั้งต้นไม่ว่าง`);
      }
      chk("C1", !fx && !NI() && p.length === 0, "STATIC · pi_ · EMV ล็อกยอด = promptpayPayload · +15 นาที", FX(NI() + (p.join(" · ") || `ok ${a.id} · ${short(a.row?.qrPayload, 40)}…`)));
    }

    // ════════ C2 idempotency + VALIDATION ════════
    {
      const p: string[] = [];
      const a = await mk("C2", { amount: 20000 });
      const n0 = await intentCount();
      const re = await mk("C2 ซ้ำ", { amount: 20000, key: a.key });
      if (re.r?.ok !== true || re.r.reused !== true || re.id !== a.id) p.push(`ซ้ำ: ${codeOf(re.r)} reused ${re.r?.reused} id ${re.id === a.id ? "เดิม" : re.id}`);
      const cf = await mk("C2 conflict", { amount: 20001, key: a.key });
      if (!refused(cf.r, "IDEMPOTENCY_CONFLICT")) p.push(`ยอดต่าง: ${codeOf(cf.r)}`);
      const after = await intentRow(a.id);
      if (after?.amountSatang !== 20000 || after?.status !== "PENDING") p.push(`แถวเดิมเปลี่ยน ${after?.amountSatang}/${after?.status}`);
      const bad: [string, Any][] = [
        ["ยอด 0", { amount: 0 }], ["ยอด −100", { amount: -100 }], ["ยอด 10.5", { amount: 10.5 }], ["ยอดเกินเพดาน", { amount: PRICE_MAX_SATANG + 1 }], ["ยอดสตริง", { amount: "100" }],
        ["CASH", { amount: 100, method: "CASH" }], ["TRANSFER", { amount: 100, method: "TRANSFER" }], ["คีย์สั้น", { amount: 100, key: "short" }], ["คีย์มี :", { amount: 100, key: `qc17:${RAND}:x` }],
      ];
      for (const [l, o] of bad) {
        const r = await mk(`C2 ${l}`, o);
        if (!refused(r.r, "VALIDATION")) p.push(`${l}: ${codeOf(r.r)}`);
      }
      const n1 = await intentCount();
      if (n1 !== n0) p.push(`แถวเพิ่ม ${n0}→${n1}`);
      chk("C2", !fx && !NI() && p.length === 0, "reused id เดิม · IDEMPOTENCY_CONFLICT · VALIDATION 9 แบบ · ไม่มีแถวเพิ่ม", FX(NI() + (p.join(" · ") || "ครบ")));
    }

    // ════════ C3 ไม่มีพร้อมเพย์ ════════
    {
      const p: string[] = [];
      const setPp = async (v: string | null) => {
        await P.paymentProfile.updateMany({ where: { tenantId: T }, data: { promptpayId: v } }).catch(() => {});
        await P.accountFinance.updateMany({ where: { tenantId: T }, data: { promptpayId: v } }).catch(() => {});
      };
      const n0 = await intentCount();
      await setPp(null);
      const a = await mk("C3 ว่าง", { amount: 5000 });
      await setPp("12345");
      const b = await mk("C3 ผิดรูป", { amount: 5000 });
      await setPp(PPID);
      const n1 = await intentCount();
      for (const [l, x] of [["ว่าง", a], ["ผิดรูป", b]] as const) {
        if (!refused(x.r, "PROMPTPAY_NOT_CONFIGURED")) p.push(`${l}: ${codeOf(x.r)}`);
        else if (!THAI.test(String(x.r.message ?? "")) || !/บัญชี|โปรไฟล์|พร้อมเพย์/.test(String(x.r.message))) p.push(`${l}: ข้อความไม่บอกที่ตั้ง (${short(x.r.message, 60)})`);
      }
      if (n1 !== n0) p.push(`แถวเพิ่ม ${n0}→${n1}`);
      const c = await mk("C3 คืนค่า", { amount: 5000 });
      if (c.r?.ok !== true) p.push(`คืนค่าแล้วยังสร้างไม่ได้: ${codeOf(c.r)}`);
      chk("C3", !fx && !NI() && p.length === 0, "PROMPTPAY_NOT_CONFIGURED ×2 (ไทย) · ไม่มีแถว · คืนค่าสร้างได้", FX(NI() + (p.join(" · ") || "ครบ")));
    }

    // ════════ C4 Beam opt-in (CD1) ════════
    {
      const p: string[] = [];
      await setPay(BEAM_ON);
      const c0 = beamCalls.length;
      const a = await mk("C4 beam", { amount: 32500, deps: beamOk });
      const call1 = beamCalls.slice(c0);
      if (a.r?.ok !== true || !a.row) p.push(`beam: ${codeOf(a.r)} ${short(a.r?.message ?? "", 60)}`);
      else {
        const last = call1[call1.length - 1] ?? {};
        if (a.row.kind !== "PROMPTPAY_BEAM" || a.row.status !== "PENDING") p.push(`kind ${a.row.kind}/${a.row.status}`);
        if (call1.length !== 1) p.push(`createCharge ${call1.length} ครั้ง`);
        if (last.amountSatang !== 32500 || last.referenceId !== REF_PREFIX + a.id || last.method !== "promptpay") p.push(`createCharge input ${short({ amountSatang: last.amountSatang, referenceId: last.referenceId, method: last.method }, 120)}`);
        if (!/^chg_qc17_/.test(String(a.row.beamChargeId)) || !/^BEAMQR-/.test(String(a.row.qrPayload))) p.push(`beamChargeId/qr ${a.row.beamChargeId}/${short(a.row.qrPayload, 30)}`);
      }
      await setPay(null);
      const c1 = beamCalls.length;
      const b = await mk("C4 ร้านไม่เปิด", { amount: 32500, deps: beamOk });
      if (b.row?.kind !== "PROMPTPAY_STATIC" || beamCalls.length !== c1) p.push(`ร้านไม่เปิด: ${b.row?.kind ?? codeOf(b.r)} · createCharge ${beamCalls.length - c1}`);
      await setPay(BEAM_ON);
      const c = await mk("C4 ไม่มีกุญแจ", { amount: 32500 });
      if (platformBeam) p.push("(โปรเซสนี้มีกุญแจ Beam ของแพลตฟอร์ม — ตรวจ 'ไม่มีกุญแจ' ไม่ได้)");
      else if (c.row?.kind !== "PROMPTPAY_STATIC") p.push(`ไม่มีกุญแจ: ${c.row?.kind ?? codeOf(c.r)}`);
      await setPay(null);
      chk("C4", !fx && !NI() && p.length === 0, "BEAM + createCharge {amount, pos-<id>, promptpay} · ร้านไม่เปิด = STATIC · ไม่มีกุญแจ = STATIC", FX(NI() + (p.join(" · ") || `ok ${a.row?.beamChargeId}`)));
    }

    // ════════ C5 Beam ล้ม → STATIC + ops ════════
    {
      const p: string[] = [];
      await setPay(BEAM_ON);
      for (const mode of ["error", "throw"] as const) {
        const o0 = (await opsHits(OPS_FALLBACK)).length;
        const n0 = await intentCount();
        const c0 = beamCalls.length;
        const x = await mk(`C5 ${mode}`, { amount: 27500, deps: { beam: fakeBeam(mode) } });
        const o1 = (await opsHits(OPS_FALLBACK)).length;
        const n1 = await intentCount();
        if (x.r?.ok !== true || !x.row) p.push(`${mode}: ${codeOf(x.r)} ${short(x.r?.message ?? "", 60)}`);
        else {
          if (x.row.kind !== "PROMPTPAY_STATIC" || x.row.beamChargeId !== null) p.push(`${mode}: ${x.row.kind}/${x.row.beamChargeId}`);
          const e = emvProblems(x.row.qrPayload, 27500, PPID);
          if (e.length) p.push(`${mode}: EMV ${e.join(",")}`);
        }
        if (beamCalls.length - c0 !== 1) p.push(`${mode}: createCharge ${beamCalls.length - c0} ครั้ง`);
        if (o1 - o0 !== 1) p.push(`${mode}: ops ${OPS_FALLBACK} +${o1 - o0}`);
        if (n1 - n0 !== 1) p.push(`${mode}: แถว +${n1 - n0}`);
      }
      await setPay(null);
      chk("C5", !fx && !NI() && p.length === 0, `STATIC + ${OPS_FALLBACK} +1 + แถว +1 (error/throw)`, FX(NI() + (p.join(" · ") || "ครบ")));
    }

    // ════════ C6 CARD ════════
    {
      const p: string[] = [];
      const n0 = await intentCount();
      const cases: [string, Any, Any][] = [
        ["ร้านไม่เปิด", null, undefined],
        ["ไม่มีกุญแจ", BEAM_ON, undefined],
        ["ร้านไม่เปิดมีกุญแจ", null, beamOk],
        ["Beam ล้ม", BEAM_ON, { beam: fakeBeam("error") }],
      ];
      for (const [l, pay, deps] of cases) {
        await setPay(pay);
        const x = await mk(`C6 ${l}`, { amount: 15000, method: "CARD", deps });
        if (l === "ไม่มีกุญแจ" && platformBeam) continue;
        if (!refused(x.r, "CARD_UNAVAILABLE")) p.push(`${l}: ${codeOf(x.r)}`);
      }
      const n1 = await intentCount();
      if (n1 !== n0) p.push(`แถวเพิ่ม ${n0}→${n1}`);
      await setPay(BEAM_ON);
      const c0 = beamCalls.length;
      const ok = await mk("C6 card", { amount: 15000, method: "CARD", deps: beamOk });
      const last = beamCalls[beamCalls.length - 1] ?? {};
      if (ok.r?.ok !== true || !ok.row) p.push(`card: ${codeOf(ok.r)} ${short(ok.r?.message ?? "", 60)}`);
      else {
        if (ok.row.kind !== "CARD_BEAM" || ok.row.status !== "PENDING") p.push(`card kind ${ok.row.kind}/${ok.row.status}`);
        if (beamCalls.length - c0 !== 1 || last.method !== "card" || last.referenceId !== REF_PREFIX + ok.id || last.amountSatang !== 15000) p.push(`createCharge ${short({ n: beamCalls.length - c0, method: last.method, ref: last.referenceId }, 100)}`);
        if (!/^chg_qc17_/.test(String(ok.row.beamChargeId)) || !/^https:\/\/pay\.beam\.example\//.test(String(ok.row.qrPayload))) p.push(`beamChargeId/url ${ok.row.beamChargeId}/${short(ok.row.qrPayload, 40)}`);
      }
      await setPay(null);
      chk("C6", !fx && !NI() && p.length === 0, "CARD_UNAVAILABLE ×4 ไม่มีแถว · CARD_BEAM + createCharge card + url", FX(NI() + (p.join(" · ") || "ครบ")));
    }

    // ════════ C7 ค่าตั้งเวลาหมดอายุ ════════
    {
      const p: string[] = [];
      for (const [v, mins] of [[30, 30], [5, 5], [60, 60], [4, 15], [61, 15], ["20", 15]] as const) {
        await setPay({ qrExpiryMinutes: v });
        const x = await mk(`C7 ${v}`, { amount: 1000 + mins });
        const e = tms(x.row?.expiresAt);
        if (!(e >= x.t0 + mins * MIN - 5000 && e <= x.t1 + mins * MIN + 5000)) p.push(`${JSON.stringify(v)} → ${x.row ? `+${Math.round((e - x.t0) / MIN)} นาที` : codeOf(x.r)} (คาด +${mins})`);
      }
      await setPay(null);
      chk("C7", !fx && !NI() && p.length === 0, "30/5/60 ตรง · 4/61/\"20\" = 15", FX(NI() + (p.join(" · ") || "ครบ")));
    }

    // ════════ C8 สิทธิ์ + เครื่อง ════════
    {
      const p: string[] = [];
      const n0 = await intentCount();
      const a = await mk("C8 ไม่มีสิทธิ์", { amount: 1000, actor: noSell });
      if (!refused(a.r, "PERMISSION_DENIED")) p.push(`ไม่มีสิทธิ์: ${codeOf(a.r)}`);
      const b = await mk("C8 เพิกถอน", { amount: 1000, dev: DEV2 });
      if (!refused(b.r, "DEVICE_REVOKED")) p.push(`เพิกถอน: ${codeOf(b.r)}`);
      const c = await mk("C8 รหัสเครื่อง", { amount: 1000, dev: "x" });
      if (!refused(c.r, "VALIDATION")) p.push(`รหัสเครื่องผิดรูป: ${codeOf(c.r)}`);
      const n1 = await intentCount();
      if (n1 !== n0) p.push(`แถวเพิ่ม ${n0}→${n1}`);
      chk("C8", !fx && !NI() && p.length === 0, "PERMISSION_DENIED · DEVICE_REVOKED · VALIDATION · ไม่มีแถว", FX(NI() + (p.join(" · ") || "ครบ")));
    }

    // ════════ W1 / W2 webhook ════════
    const NW = () => NI() + NEED([M.onBeamWebhookEvent, "onBeamWebhookEvent"]);
    const w1 = await mkBeam("W1", 32500);
    {
      const p: string[] = [];
      const t0 = Date.now();
      const r = await hook("W1", evOf(w1.row));
      const t1 = Date.now();
      const row = await intentRow(w1.id);
      if (r?.ok !== true) p.push(`facade ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
      if (row?.status !== "PAID" || row?.confirmedVia !== "WEBHOOK" || row?.beamRef !== w1.row?.beamChargeId || row?.confirmedByUserId !== null || row?.lateWebhook !== false) p.push(`แถว ${short({ status: row?.status, via: row?.confirmedVia, beamRef: row?.beamRef, by: row?.confirmedByUserId, late: row?.lateWebhook }, 140)}`);
      const pa = tms(row?.paidAt);
      if (!(pa >= t0 - 2000 && pa <= t1 + 2000)) p.push(`paidAt ${row?.paidAt}`);
      const ev = await paidEvents(w1.id);
      if (ev.length !== 1 || !eventOk(ev[0]?.payload, { intentId: w1.id, unitId: U.A, amountSatang: 32500, via: "WEBHOOK" })) p.push(`outbox ${ev.length} ${short(ev[0]?.payload, 120)}`);
      const fn = consMod?.consumers?.[EV_PAID];
      if (typeof fn !== "function") p.push(`ไม่มี consumer ${EV_PAID}`);
      else if (ev[0]) {
        for (let i = 0; i < 2; i++) {
          try {
            await fn(ev[0]);
          } catch (e) {
            p.push(`consumer รอบ ${i + 1} throw ${(e as Error).message.slice(0, 60)}`);
          }
        }
      }
      await drain();
      chk("W1", !fx && !NW() && p.length === 0, "PAID WEBHOOK beamRef paidAt · outbox 1 payload ครบ · consumer เล่นซ้ำ 2 ไม่ throw", FX(NW() + (p.join(" · ") || "ครบ")));
    }
    {
      const p: string[] = [];
      const before = await intentRow(w1.id);
      const r = await hook("W2", evOf(w1.row));
      if (r?.ok !== true) p.push(`facade ซ้ำ ${codeOf(r)}`);
      const m = keep("W2 mark", await call(M.markIntentPaid, "markIntentPaid", w1.id, { via: "WEBHOOK", beamRef: w1.row?.beamChargeId, amountSatang: 32500 }));
      if (m?.ok !== true || m.idempotent !== true) p.push(`markIntentPaid ${codeOf(m)} idempotent ${m?.idempotent}`);
      const after = await intentRow(w1.id);
      if (tms(after?.paidAt) !== tms(before?.paidAt) || after?.status !== "PAID") p.push(`แถวเปลี่ยน ${after?.status} ${after?.paidAt}`);
      const ev = await paidEvents(w1.id);
      if (ev.length !== 1) p.push(`outbox ${ev.length}`);
      chk("W2", !fx && !NW() && !NEED([M.markIntentPaid, "markIntentPaid"]) && p.length === 0, "ok · paidAt เดิม · outbox 1 · idempotent:true", FX(NW() + NEED([M.markIntentPaid, "markIntentPaid"]) + (p.join(" · ") || "ครบ")));
    }

    // ════════ W3 ยอดไม่ตรง ════════
    {
      const p: string[] = [];
      const x = await mkBeam("W3", 20000);
      const o0 = (await opsHits(OPS_MISMATCH)).length;
      const r = await hook("W3", evOf(x.row, { amountSatang: 19900 }));
      const row = await intentRow(x.id);
      const ops = (await opsHits(OPS_MISMATCH)).slice(o0);
      if (!refused(r, "AMOUNT_MISMATCH")) p.push(`facade ${codeOf(r)}`);
      if (row?.status !== "PENDING" || row?.paidAt !== null) p.push(`แถว ${row?.status}/${row?.paidAt}`);
      if (ops.length !== 1 || ops[0]?.level !== "WARN") p.push(`ops ${ops.length} ${ops[0]?.level ?? ""}`);
      if ((await paidEvents(x.id)).length !== 0) p.push("มี outbox");
      const ok = await hook("W3 ถูก", evOf(x.row));
      if (ok?.ok !== true || (await intentRow(x.id))?.status !== "PAID") p.push(`ยอดถูกตามมา ${codeOf(ok)}`);
      chk("W3", !fx && !NW() && p.length === 0, `AMOUNT_MISMATCH · PENDING · ${OPS_MISMATCH} WARN · ไม่มี outbox · ยอดถูก → PAID`, FX(NW() + (p.join(" · ") || "ครบ")));
    }

    // ════════ W4 webhook ช้า / ยกเลิก ════════
    const w4a = await mkBeam("W4a", 12000);
    {
      const p: string[] = [];
      await moveIntent(w4a.id, { expiresAt: new Date(Date.now() - 5 * MIN) });
      const ra = await hook("W4a", evOf(w4a.row));
      const a = await intentRow(w4a.id);
      if (ra?.ok !== true || a?.status !== "PAID" || a?.lateWebhook !== true) p.push(`PENDING หมดเวลา: ${codeOf(ra)} ${a?.status} late ${a?.lateWebhook}`);
      const b0 = await mkBeam("W4b", 13000);
      await moveIntent(b0.id, { expiresAt: new Date(Date.now() - 5 * MIN), status: "EXPIRED" });
      const rb = await hook("W4b", evOf(b0.row));
      const b = await intentRow(b0.id);
      if (rb?.ok !== true || b?.status !== "PAID" || b?.lateWebhook !== true) p.push(`EXPIRED: ${codeOf(rb)} ${b?.status} late ${b?.lateWebhook}`);
      const c0 = await mkBeam("W4c", 14000);
      await moveIntent(c0.id, { status: "CANCELLED" });
      const o0 = (await opsHits(OPS_REFUND)).length;
      const rc = await hook("W4c", evOf(c0.row));
      const c = await intentRow(c0.id);
      const ops = (await opsHits(OPS_REFUND)).length - o0;
      if (!refused(rc, "INTENT_CANCELLED") || c?.status !== "CANCELLED" || c?.paidAt !== null) p.push(`CANCELLED: ${codeOf(rc)} ${c?.status}`);
      if (ops !== 1) p.push(`ops ${OPS_REFUND} +${ops}`);
      chk("W4", !fx && !NW() && p.length === 0, `PAID late ×2 · INTENT_CANCELLED + ${OPS_REFUND}`, FX(NW() + (p.join(" · ") || "ครบ")));
    }

    // ════════ W5 อ้างอิงไม่รู้จัก + route ════════
    {
      const p: string[] = [];
      const unknownRef = `${REF_PREFIX}pi_qc17${RAND}none`;
      opsMarkers.push(unknownRef);
      const u = await hook("W5 ไม่รู้จัก", { referenceId: unknownRef, chargeId: `chg_x_${RAND}`, status: "SUCCEEDED", amountSatang: 100, raw: "{}" });
      if (u?.threw || !isRecord(u)) p.push(`ไม่รู้จัก: ${u?.threw ? "throw" : short(u, 60)}`);
      const n = await call(M.onBeamWebhookEvent, "onBeamWebhookEvent", null);
      if (n?.threw || n?.missing) p.push(`null: ${codeOf(n)}`);
      const f = await mkBeam("W5 failed", 9900);
      const rf = await hook("W5 FAILED", evOf(f.row, { status: "FAILED" }));
      if (rf?.threw || (await intentRow(f.id))?.status !== "PENDING") p.push(`FAILED: ${codeOf(rf)} ${(await intentRow(f.id))?.status}`);
      // route จริง — กุญแจปลอมเฉพาะในโปรเซสนี้ (ไม่พิมพ์ค่า) คืนค่าเดิมใน finally
      const saved: Record<string, string | undefined> = {};
      for (const k of BEAM_ENV) saved[k] = process.env[k];
      const secret = `qc17-fake-secret-${RAND}`;
      let routeNote = "";
      try {
        process.env.BEAM_MERCHANT_ID = `qc17-merchant-${RAND}`;
        process.env.BEAM_API_KEY = `qc17-key-${RAND}`;
        process.env.BEAM_WEBHOOK_SECRET = secret;
        const routeMod = await tryImport("@/app/api/payment/beam/webhook/route");
        if (typeof routeMod?.POST !== "function") routeNote = "route import ไม่ได้ในบริบทสคริปต์ (CONTROLLER-DECISION: ตรวจ facade อย่างเดียว)";
        else {
          const post = async (body: Any, sign: boolean) => {
            const raw = JSON.stringify(body);
            opsMarkers.push(createHash("sha256").update(raw).digest("hex").slice(0, 16));
            const sig = sign ? createHmac("sha256", secret).update(raw, "utf8").digest("hex") : "deadbeef";
            const res = (await routeMod.POST(new Request("http://qc.local/api/payment/beam/webhook", { method: "POST", headers: { "content-type": "application/json", "x-beam-signature": sig }, body: raw }))) as Response;
            return res.status;
          };
          const s1 = await post({ chargeId: `chg_bad_${RAND}`, referenceId: unknownRef, status: "SUCCEEDED", amount: 100 }, false);
          if (s1 !== 401) p.push(`ลายเซ็นผิด → ${s1}`);
          const s2 = await post({ chargeId: `chg_unk_${RAND}`, referenceId: unknownRef, status: "SUCCEEDED", amount: 100 }, true);
          if (s2 !== 200) p.push(`pos- ไม่รู้จัก → ${s2}`);
          const g = await mkBeam("W5 route", 8800);
          opsMarkers.push(REF_PREFIX + g.id);
          const s3 = await post({ chargeId: g.row?.beamChargeId ?? `chg_none_${RAND}`, referenceId: REF_PREFIX + g.id, status: "SUCCEEDED", amount: 8800 }, true);
          const gr = await intentRow(g.id);
          if (s3 !== 200 || gr?.status !== "PAID" || gr?.confirmedVia !== "WEBHOOK") p.push(`intent จริงผ่าน route → ${s3} ${gr?.status ?? "ไม่มีแถว"}/${gr?.confirmedVia ?? "-"}`);
        }
      } catch (e) {
        p.push(`route ล้ม ${(e as Error).message.slice(0, 80)}`);
      } finally {
        for (const k of BEAM_ENV) {
          if (saved[k] === undefined) delete process.env[k];
          else process.env[k] = saved[k];
        }
      }
      if (routeNote) console.log(`  ⚠️  ${routeNote}`);
      chk("W5", !fx && !NW() && p.length === 0, "ไม่ throw · FAILED คง PENDING · route 401/200/200+PAID", FX(NW() + (p.join(" · ") || `ครบ${routeNote ? ` (${routeNote})` : ""}`)));
    }

    // ════════ M ยืนยันเอง ════════
    const NM = () => NI() + NEED([M.confirmPaymentIntentManual, "confirmPaymentIntentManual"]);
    const m1 = await mk("M1", { amount: 21000, actor: cashier });
    {
      const p: string[] = [];
      const r = await manual("M1", m1.id, cashier);
      const row = await intentRow(m1.id);
      if (r?.ok !== true) p.push(`${codeOf(r)} ${short(r?.message ?? "", 60)}`);
      if (row?.status !== "PAID" || row?.confirmedVia !== "MANUAL" || row?.confirmedByUserId !== cashierId || !row?.paidAt) p.push(`แถว ${short({ s: row?.status, via: row?.confirmedVia, by: row?.confirmedByUserId }, 100)}`);
      const au = await audits(AUD_MANUAL, m1.id);
      if (au.length !== 1 || au[0]?.after?.intentId !== m1.id || au[0]?.after?.amountSatang !== 21000) p.push(`audit ${au.length} ${short(au[0]?.after, 80)}`);
      const ev = await paidEvents(m1.id);
      if (ev.length !== 1 || !eventOk(ev[0]?.payload, { intentId: m1.id, unitId: U.A, amountSatang: 21000, via: "MANUAL" })) p.push(`outbox ${ev.length} ${short(ev[0]?.payload, 100)}`);
      const r2 = await manual("M1 ซ้ำ", m1.id, cashier);
      if (r2?.ok !== true) p.push(`ซ้ำ ${codeOf(r2)}`);
      if ((await audits(AUD_MANUAL, m1.id)).length !== 1 || (await paidEvents(m1.id)).length !== 1) p.push("ซ้ำแล้ว audit/outbox เพิ่ม");
      chk("M1", !fx && !NM() && p.length === 0, "PAID MANUAL โดยแคชเชียร์ · audit 1 · outbox via MANUAL 1 · ซ้ำ ok ไม่เพิ่ม", FX(NM() + (p.join(" · ") || "ครบ")));
    }
    {
      const p: string[] = [];
      const x = await mk("M2", { amount: 4400 });
      await moveIntent(x.id, { expiresAt: new Date(Date.now() - MIN) });
      const r = await manual("M2", x.id);
      const row = await intentRow(x.id);
      if (!refused(r, "INTENT_EXPIRED")) p.push(codeOf(r));
      if (row?.status === "PAID" || row?.paidAt) p.push(`แถว ${row?.status}`);
      if ((await audits(AUD_MANUAL, x.id)).length) p.push("มี audit");
      chk("M2", !fx && !NM() && p.length === 0, "INTENT_EXPIRED · ไม่ PAID · ไม่มี audit", FX(NM() + (p.join(" · ") || "ครบ")));
    }
    {
      const p: string[] = [];
      await setPay({ manualConfirmRequiresManager: true });
      const x = await mk("M3", { amount: 4500 });
      const a = await manual("M3 แคชเชียร์", x.id, cashier);
      if (!refused(a, "PERMISSION_DENIED") || (await intentRow(x.id))?.status !== "PENDING") p.push(`แคชเชียร์ ${codeOf(a)}`);
      const b = await manual("M3 ไม่มีสิทธิ์ขาย", x.id, noSell);
      if (!refused(b, "PERMISSION_DENIED")) p.push(`ไม่มีสิทธิ์ขาย ${codeOf(b)}`);
      const c = await manual("M3 ผู้จัดการ", x.id, manager);
      const row = await intentRow(x.id);
      if (c?.ok !== true || row?.status !== "PAID" || row?.confirmedByUserId !== managerId) p.push(`ผู้จัดการ ${codeOf(c)} ${row?.status}/${row?.confirmedByUserId === managerId}`);
      await setPay(null);
      chk("M3", !fx && !NM() && p.length === 0, "PERMISSION_DENIED ×2 · ผู้จัดการ ok", FX(NM() + (p.join(" · ") || "ครบ")));
    }

    // ════════ S ใช้ intent ในบิล ════════
    const s1 = await mkPaid("S1", 32500, "WEBHOOK");
    let s1Sale = { r: null as Any, input: null as Any, saleId: "" };
    {
      const p: string[] = [];
      s1Sale = await sell("S1", [["ข้าวกล่อง QC", 25000], ["ชาไทย QC", 15000]], [{ type: "CASH", amountSatang: 7500 }, { ...pi(s1.id), amountSatang: 32500 }]);
      const row = await intentRow(s1.id);
      const pays = await payRows(s1Sale.saleId);
      const pp = pays.find((x) => x.type === "PROMPTPAY");
      const cash = pays.find((x) => x.type === "CASH");
      if (s1Sale.r?.ok !== true) p.push(`ขาย ${codeOf(s1Sale.r)} ${short(s1Sale.r?.message ?? "", 60)}`);
      else {
        if (row?.status !== "CONSUMED" || row?.saleId !== s1Sale.saleId) p.push(`intent ${row?.status}/${row?.saleId === s1Sale.saleId}`);
        if (pays.length !== 2 || pp?.amountSatang !== 32500 || pp?.reference !== s1.id || !noteOk(pp?.note, "WEBHOOK") || cash?.amountSatang !== 7500 || cash?.reference) p.push(`PosPayment ${short(pays.map((x) => [x.type, x.amountSatang, x.reference, x.note]), 160)}`);
      }
      const rh = await hook("S1 webhook หลังใช้", evOf(s1.row));
      if (rh?.ok !== true || (await intentRow(s1.id))?.status !== "CONSUMED") p.push(`webhook หลัง CONSUMED ${codeOf(rh)} ${(await intentRow(s1.id))?.status}`);
      // บัตร (CARD_BEAM)
      const c = await mkPaid("S1 card", 15000, "WEBHOOK", "CARD");
      const sc = await sell("S1 card", [["รองเท้า QC", 15000]], [{ type: "CARD", amountSatang: 15000, reference: c.id }]);
      const cp = (await payRows(sc.saleId))[0];
      if (sc.r?.ok !== true || cp?.type !== "CARD" || cp?.reference !== c.id || !noteOk(cp?.note, "WEBHOOK") || (await intentRow(c.id))?.status !== "CONSUMED") p.push(`บัตร ${codeOf(sc.r)} ${short([cp?.type, cp?.reference === c.id, cp?.note], 60)}`);
      // ยืนยันเอง (M1)
      const sm = await sell("S1 manual", [["กาแฟ QC", 21000]], [{ ...pi(m1.id), amountSatang: 21000 }]);
      const mp = (await payRows(sm.saleId))[0];
      if (sm.r?.ok !== true || mp?.reference !== m1.id || !noteOk(mp?.note, "MANUAL")) p.push(`ยืนยันเอง ${codeOf(sm.r)} ${mp?.note}`);
      // จ่ายช้า (W4a lateWebhook · ภายใน 24 ชม.)
      const sl = await sell("S1 late", [["ขนม QC", 12000]], [{ ...pi(w4a.id), amountSatang: 12000 }]);
      if (sl.r?.ok !== true || (await intentRow(w4a.id))?.status !== "CONSUMED") p.push(`จ่ายช้า ${codeOf(sl.r)}`);
      chk("S1", !fx && !NW() && p.length === 0, "บิล PAID · CONSUMED saleId · reference/note via WEBHOOK|MANUAL · บัตร · จ่ายช้าใช้ได้ · webhook ซ้ำคง CONSUMED", FX(NW() + (p.join(" · ") || "ครบ")));
    }
    {
      const p: string[] = [];
      const n0 = await saleCount();
      const pend = await mk("S2 pending", { amount: 3000 });
      const canc = await mk("S2 cancelled", { amount: 3100 });
      await moveIntent(canc.id, { status: "CANCELLED" });
      const expd = await mk("S2 expired", { amount: 3200 });
      await moveIntent(expd.id, { status: "EXPIRED", expiresAt: new Date(Date.now() - MIN) });
      const unitB = await mkPaid("S2 unitB", 3300, "MANUAL", "PROMPTPAY", "B");
      const old = await mkPaid("S2 old", 3400, "MANUAL");
      await moveIntent(old.id, { paidAt: new Date(Date.now() - 25 * HOUR) });
      const cases: [string, string, number, string][] = [
        ["PENDING", pend.id, 3000, "INTENT_NOT_PAID"],
        ["CANCELLED", canc.id, 3100, "INTENT_NOT_PAID"],
        ["EXPIRED", expd.id, 3200, "INTENT_NOT_PAID"],
        ["ไม่มีจริง", `pi_qc17${RAND}nothere`, 3500, "INTENT_NOT_FOUND"],
        ["สาขาอื่น", unitB.id, 3300, "INTENT_NOT_FOUND"],
        ["เกิน 24 ชม.", old.id, 3400, "INTENT_EXPIRED"],
      ];
      const st0 = await Promise.all([pend.id, canc.id, expd.id, unitB.id, old.id].map((id) => intentRow(id)));
      for (const [l, id, amt, code] of cases) {
        const r = await sell(`S2 ${l}`, [[`ของ S2 ${l}`, amt]], [{ ...pi(id), amountSatang: amt }]);
        if (!refused(r.r, code)) p.push(`${l}: ${codeOf(r.r)} (คาด ${code})`);
      }
      const st1 = await Promise.all([pend.id, canc.id, expd.id, unitB.id, old.id].map((id) => intentRow(id)));
      st0.forEach((a, i) => {
        if (a?.status !== st1[i]?.status || st1[i]?.saleId) p.push(`intent ${i} เปลี่ยน ${a?.status}→${st1[i]?.status}`);
      });
      const n1 = await saleCount();
      if (n1 !== n0) p.push(`บิลเพิ่ม ${n0}→${n1}`);
      chk("S2", !fx && !NM() && p.length === 0, "NOT_PAID ×3 · NOT_FOUND ×2 · INTENT_EXPIRED (24 ชม.) · ไม่มีบิล · intent ไม่เปลี่ยน", FX(NM() + (p.join(" · ") || "ครบ")));
    }
    {
      const p: string[] = [];
      const x = await mkPaid("S3", 20000, "MANUAL");
      const n0 = await saleCount();
      const r = await sell("S3", [["ของ S3", 20000]], [{ type: "CASH", amountSatang: 5000 }, { ...pi(x.id), amountSatang: 15000 }]);
      if (!refused(r.r, "AMOUNT_MISMATCH")) p.push(codeOf(r.r));
      if ((await saleCount()) !== n0) p.push("มีบิลเกิด");
      if ((await intentRow(x.id))?.status !== "PAID") p.push(`intent ${(await intentRow(x.id))?.status}`);
      chk("S3", !fx && !NM() && p.length === 0, "AMOUNT_MISMATCH · ไม่มีบิล · คง PAID", FX(NM() + (p.join(" · ") || "ครบ")));
    }
    {
      const p: string[] = [];
      const x = await mkPaid("S4", 26000, "MANUAL");
      const k1 = newKey("race");
      const k2 = newKey("race");
      const pay = [{ ...pi(x.id), amountSatang: 26000 }];
      const lines: [string, number][] = [["ของแข่ง QC", 26000]];
      const [a, b] = await Promise.all([sell("S4 a", lines, pay, { key: k1, db: await lane(0) }), sell("S4 b", lines, pay, { key: k2, db: await lane(1) })]);
      const oks = [a, b].filter((s) => s.r?.ok === true);
      const loser = [a, b].find((s) => s.r?.ok !== true);
      if (oks.length !== 1) p.push(`ผู้ชนะ ${oks.length} (${codeOf(a.r)} / ${codeOf(b.r)})`);
      if (!loser || !refused(loser.r, "INTENT_CONSUMED")) p.push(`ผู้แพ้ ${codeOf(loser?.r)}`);
      const sales = T ? ((await P.posSale.findMany({ where: { tenantId: T, idempotencyKey: { in: [`reg2:${k1}`, `reg2:${k2}`] } } }).catch(() => [])) as Any[]) : [];
      if (sales.length !== 1) p.push(`บิล ${sales.length}`);
      const row = await intentRow(x.id);
      if (row?.status !== "CONSUMED" || row?.saleId !== oks[0]?.saleId) p.push(`intent ${row?.status} saleId ${row?.saleId === oks[0]?.saleId ? "ตรง" : "ไม่ตรง"}`);
      if ((await refRows(x.id)).length !== 1) p.push(`PosPayment อ้าง ${(await refRows(x.id)).length}`);
      const c = await sell("S4 c", lines, pay);
      if (!refused(c.r, "INTENT_CONSUMED")) p.push(`ครั้งที่สาม ${codeOf(c.r)}`);
      chk("S4", !fx && !NM() && p.length === 0, "บิล 1 ใบ · ผู้แพ้ INTENT_CONSUMED · ครั้งที่สาม INTENT_CONSUMED", FX(NM() + (p.join(" · ") || "ครบ")));
    }
    {
      const p: string[] = [];
      const n0 = await saleCount();
      const r = s1Sale.input && s1Sale.saleId ? keep("S5", await call(register, "submitRegisterSale", ctxOf("A", DEV1), owner, s1Sale.input)) : { ok: false, code: "NO_S1" };
      if (r?.ok !== true || r.saleId !== s1Sale.saleId || r.duplicated !== true) p.push(`ซ้ำ ${codeOf(r)} saleId ${r?.saleId === s1Sale.saleId ? "เดิม" : r?.saleId} dup ${r?.duplicated}`);
      const row = await intentRow(s1.id);
      if (row?.status !== "CONSUMED" || row?.saleId !== s1Sale.saleId) p.push(`intent ${row?.status}`);
      if ((await refRows(s1.id)).length !== 1) p.push(`PosPayment อ้าง ${(await refRows(s1.id)).length}`);
      if ((await saleCount()) !== n0) p.push("บิลเพิ่ม");
      chk("S5", !fx && !NW() && p.length === 0, "saleId เดิม duplicated · CONSUMED โดยบิลเดิม · PosPayment 1", FX(NW() + (p.join(" · ") || "ครบ")));
    }
    {
      const p: string[] = [];
      const i0 = await intentCount();
      const a = await sell("S6 PROMPTPAY", [["ของ S6 a", 6000]], [{ type: "PROMPTPAY", amountSatang: 6000 }]);
      const ap = (await payRows(a.saleId))[0];
      if (a.r?.ok !== true || ap?.type !== "PROMPTPAY" || ap?.reference !== null) p.push(`PROMPTPAY เปล่า ${codeOf(a.r)} ref ${ap?.reference}`);
      const b = await sell("S6 CARD EDC", [["ของ S6 b", 6500]], [{ type: "CARD", amountSatang: 6500, reference: "EDC-778899" }]);
      const bp = (await payRows(b.saleId))[0];
      if (b.r?.ok !== true || bp?.type !== "CARD" || bp?.reference !== "EDC-778899") p.push(`CARD EDC ${codeOf(b.r)} ref ${bp?.reference}`);
      const c = await sell("S6 TRANSFER", [["ของ S6 c", 7000]], [{ type: "TRANSFER", amountSatang: 7000, reference: "TRF-556677" }]);
      if (c.r?.ok !== true || (await payRows(c.saleId))[0]?.reference !== "TRF-556677") p.push(`TRANSFER ${codeOf(c.r)}`);
      const n0 = await saleCount();
      const d = await sell("S6 PROMPTPAY ref", [["ของ S6 d", 7100]], [{ type: "PROMPTPAY", amountSatang: 7100, reference: "EDC-1" }]);
      if (!refused(d.r, "VALIDATION") || (await saleCount()) !== n0) p.push(`PROMPTPAY + ref ไม่ใช่ pi_ ${codeOf(d.r)}`);
      const i1 = await intentCount();
      if (PI && i1 !== i0) p.push(`intent เพิ่ม ${i0}→${i1}`);
      chk("S6", !fx && p.length === 0, "PROMPTPAY เปล่า PAID · CARD EDC PAID · TRANSFER PAID · PROMPTPAY+ref อื่น VALIDATION · ไม่มี intent", FX(p.join(" · ") || "ครบ (ทาง P1.6 เดิม)"));
    }

    // ════════ E หมดอายุ ════════
    const NE = () => NI() + NEED([M.expirePaymentIntents, "expirePaymentIntents"]);
    {
      const p: string[] = [];
      const e1 = await mk("E1 a", { amount: 5100 });
      const e2 = await mk("E1 b", { amount: 5200 });
      const fresh = await mk("E1 fresh", { amount: 5300 });
      const paid = await mkPaid("E1 paid", 5400, "MANUAL");
      for (const id of [e1.id, e2.id, paid.id]) await moveIntent(id, { expiresAt: new Date(Date.now() - 2 * MIN) });
      const want = PI && T ? Number(await PI.count({ where: { tenantId: T, status: "PENDING", expiresAt: { lt: new Date() } } }).catch(() => -1)) : -1;
      const num = (r: Any) => (typeof r === "number" ? r : Number(r?.expired ?? r?.count ?? NaN));
      const r1 = await call(M.expirePaymentIntents, "expirePaymentIntents", T);
      if (r1?.missing || num(r1) !== want || want < 2) p.push(`ครั้งแรก ${r1?.missing ? MISSING : short(r1, 60)} (คาด ${want})`);
      const rows = await Promise.all([e1.id, e2.id, fresh.id, paid.id].map((id) => intentRow(id)));
      if (rows[0]?.status !== "EXPIRED" || rows[1]?.status !== "EXPIRED") p.push(`หมดเวลา ${rows[0]?.status}/${rows[1]?.status}`);
      if (rows[2]?.status !== "PENDING" || rows[3]?.status !== "PAID") p.push(`ไม่ควรแตะ ${rows[2]?.status}/${rows[3]?.status}`);
      const r2 = await call(M.expirePaymentIntents, "expirePaymentIntents", T);
      if (num(r2) !== 0) p.push(`ครั้งที่สอง ${short(r2, 40)}`);
      if (!/\bexpirePaymentIntents\s*\(/.test(srcOf(F.cron))) p.push("/api/cron/hourly ไม่เรียก expirePaymentIntents");
      chk("E1", !fx && !NE() && p.length === 0, "จำนวน = PENDING หมดเวลา · EXPIRED · ไม่แตะ fresh/PAID · ซ้ำ 0 · cron hourly", FX(NE() + (p.join(" · ") || `ครบ (${want})`)));
    }
    {
      const p: string[] = [];
      const NS = NEED([M.paymentIntentStatus, "paymentIntentStatus"]);
      const st = (id: string, actor: Any = owner, k = "A") => call(M.paymentIntentStatus, "paymentIntentStatus", ctxOf(k, DEV1), actor, { intentId: id }).then((r) => keep("E2", r));
      const stale = await mk("E2 stale", { amount: 5500 });
      await moveIntent(stale.id, { expiresAt: new Date(Date.now() - MIN) });
      const a = await st(stale.id);
      if (a?.ok !== true || a.status !== "EXPIRED" || a.amountSatang !== 5500 || a.kind !== "PROMPTPAY_STATIC" || typeof a.qrPayload !== "string" || !Number.isFinite(tms(a.expiresAt)) || (a.paidAt ?? null) !== null) p.push(`หมดเวลา ${short(a, 140)}`);
      if ((await intentRow(stale.id))?.status !== "EXPIRED") p.push(`แถวยังไม่เขียน EXPIRED (${(await intentRow(stale.id))?.status})`);
      const fresh = await mk("E2 fresh", { amount: 5600 });
      const b = await st(fresh.id);
      if (b?.ok !== true || b.status !== "PENDING") p.push(`ยังไม่หมด ${codeOf(b)} ${b?.status}`);
      const pd = await mkPaid("E2 paid", 5700, "MANUAL");
      const c = await st(pd.id);
      if (c?.ok !== true || c.status !== "PAID" || !Number.isFinite(tms(c.paidAt)) || c.confirmedVia !== "MANUAL") p.push(`PAID ${short(c, 120)}`);
      const d = await st(`pi_qc17${RAND}nothere`);
      if (!refused(d, "INTENT_NOT_FOUND")) p.push(`id มั่ว ${codeOf(d)}`);
      const ub = await mk("E2 unitB", { amount: 5800, k: "B" });
      const e = await st(ub.id);
      if (!refused(e, "INTENT_NOT_FOUND")) p.push(`สาขาอื่น ${codeOf(e)}`);
      const f = await st(fresh.id, noSell);
      if (!refused(f, "PERMISSION_DENIED")) p.push(`ไม่มีสิทธิ์ ${codeOf(f)}`);
      chk("E2", !fx && !NI() && !NS && p.length === 0, "EXPIRED (เขียนลงแถว) · PENDING · PAID+paidAt+MANUAL · NOT_FOUND ×2 · PERMISSION_DENIED", FX(NI() + NS + (p.join(" · ") || "ครบ")));
    }

    // ════════ X1 ยกเลิก ════════
    {
      const p: string[] = [];
      const NC_ = NEED([M.cancelPaymentIntent, "cancelPaymentIntent"]);
      const cancel = (id: string) => call(M.cancelPaymentIntent, "cancelPaymentIntent", ctxOf("A", DEV1), owner, { intentId: id }).then((r) => keep("X1", r));
      const x = await mk("X1", { amount: 6100 });
      const a = await cancel(x.id);
      if (a?.ok !== true || (await intentRow(x.id))?.status !== "CANCELLED") p.push(`PENDING ${codeOf(a)} ${(await intentRow(x.id))?.status}`);
      if ((await audits(AUD_CANCEL, x.id)).length !== 1) p.push(`audit ${AUD_CANCEL} ${(await audits(AUD_CANCEL, x.id)).length}`);
      const y = await mkPaid("X1 paid", 6200, "MANUAL");
      const b = await cancel(y.id);
      if (!refused(b, "INTENT_PAID") || (await intentRow(y.id))?.status !== "PAID") p.push(`PAID ${codeOf(b)}`);
      const c = await cancel(`pi_qc17${RAND}nothere`);
      if (!refused(c, "INTENT_NOT_FOUND")) p.push(`id มั่ว ${codeOf(c)}`);
      chk("X1", !fx && !NI() && !NC_ && p.length === 0, "CANCELLED + audit · INTENT_PAID · INTENT_NOT_FOUND", FX(NI() + NC_ + (p.join(" · ") || "ครบ")));
    }
  } finally {
    removeFetchGuard();
  }
  if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);

  // ════════ C10 ปฏิเสธเป็นข้อมูล + คีย์ข้อความ ════════
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
    const loadJson = (f: string): Any => {
      try {
        return JSON.parse(rd(f) || "{}");
      } catch {
        return {};
      }
    };
    const at = (o: Any, path: string): unknown => path.split(".").reduce((x: Any, k) => (isRecord(x) ? x[k] : undefined), o);
    for (const loc of ["th", "en"]) {
      const j = loadJson(`src/messages/${loc}/pos.json`);
      const missKeys = NEW_CODES.filter((c) => c !== "IDEMPOTENCY_CONFLICT").filter((c) => typeof at(j, `payment.errors.${camel(c)}`) !== "string" || !String(at(j, `payment.errors.${camel(c)}`)).trim());
      if (missKeys.length) p.push(`${loc}/pos.json ขาด payment.errors.{${missKeys.map(camel).join(",")}}`);
      if (typeof regShared?.refusalMessageKey === "function") {
        for (const c of SUBMIT_CODES) {
          const k = String(regShared.refusalMessageKey(c));
          if (k === "errors.unknown") p.push(`refusalMessageKey(${c}) = errors.unknown`);
          else if (loc === "th" || loc === "en") {
            const v = at(j, `register.${k}`) ?? at(j, k) ?? at(j, k.replace(/^pos\./, ""));
            if (typeof v !== "string") p.push(`${loc}: คีย์ ${k} (${c}) ไม่มีข้อความ`);
          }
        }
      } else p.push("register-shared ไม่มี refusalMessageKey");
    }
    chk("C10", !fx && p.length === 0, `${dataRefusals.length} คำปฏิเสธ · ครบ ${ALL_CODES.length} รหัส · ไทย · ไม่ throw · คีย์ th/en`, FX([...new Set(p)].slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || "ครบ"));
  }
}

// ═════════════════════════ 6. คืนสภาพ — ลบร้านชั่วคราวทั้งร้าน + OpsEvent ไม่มีร้านของรอบนี้ ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; opsLeft: number; opsDeleted: number; err: string };
async function wipeTenant(): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, opsLeft: 0, opsDeleted: 0, err: "" };
  // OpsEvent ที่ไม่มีร้าน (route 401 · แขนงเติมเครดิต AI ก่อนมีแขนง pos-) — เฉพาะแถวหลังเริ่มรอบนี้ที่มีเครื่องหมายของรอบนี้
  const opsWhere = `"tenantId" IS NULL AND "createdAt" >= $1 AND (${opsMarkers.map((_, i) => `coalesce(detail,'') || ' ' || message LIKE $${i + 2}`).join(" OR ")})`;
  const opsArgs = [STARTED, ...opsMarkers.map((m) => `%${m}%`)];
  try {
    rep.opsDeleted = Number(await P.$executeRawUnsafe(`DELETE FROM "OpsEvent" WHERE ${opsWhere}`, ...opsArgs));
    rep.opsLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "OpsEvent" WHERE ${opsWhere}`, ...opsArgs)) as Any[])[0]?.n ?? 0);
  } catch (e) {
    rep.err = `OpsEvent: ${(e as Error).message.slice(0, 80)}`;
  }
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
let wipe: WipeReport = { tables: 0, left: {}, tenantLeft: 0, opsLeft: 0, opsDeleted: 0, err: "" };
try {
  runC9();
  runNC();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  for (const k of BEAM_ENV) if (!platformBeam && process.env[k] !== undefined && /^qc17-/.test(String(process.env[k]))) delete process.env[k]; // กันหลุดจาก W5 (ปกติ finally ของ W5 คืนแล้ว)
  installFetchGuard();
  try {
    wipe = await wipeTenant();
    const residue = Object.values(wipe.left).reduce((a, b) => a + Math.abs(b), 0) + wipe.tenantLeft + wipe.opsLeft;
    console.log(`  ลบร้านชั่วคราว ${T || "(ไม่ได้สร้าง)"}: ${wipe.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(wipe.left)} · Tenant ${wipe.tenantLeft} · OpsEvent ไม่มีร้าน ลบ ${wipe.opsDeleted} ค้าง ${wipe.opsLeft}${wipe.err ? ` · ${wipe.err}` : ""}`);
  } catch (e) {
    wipe.err = `cleanup: ${(e as Error).message.slice(0, 200)}`;
    console.log(`💥 ${wipe.err}`);
  } finally {
    removeFetchGuard();
  }
}
await sleep(200);
const tempLeft = Object.entries(wipe.left).map(([k, v]) => `${k}:${v}`);
chk("Z1", tempLeft.length === 0 && wipe.tenantLeft === 0 && wipe.opsLeft === 0 && !wipe.err, "ร้านชั่วคราว 0 แถว · Tenant ถูกลบ · OpsEvent ไม่มีร้านของรอบนี้ 0",
  [tempLeft.length ? `ร้านชั่วคราวเหลือ ${tempLeft.join(", ")}` : `ร้านชั่วคราว 0 (${wipe.tables} ตาราง)`, wipe.tenantLeft ? "แถว Tenant ยังอยู่" : "", `OpsEvent ไม่มีร้าน ลบ ${wipe.opsDeleted} ค้าง ${wipe.opsLeft}`, wipe.err].filter(Boolean).join(" · "));
const countsAfter = await snapshotCounts();
const drift = Object.keys(countsBefore).filter((k) => countsBefore[k] !== countsAfter[k]).map((k) => `${k}:${countsBefore[k]}→${countsAfter[k]}`);
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
chk("Z2", drift.length === 0 && fpDrift.length === 0 && !Object.values(fpBefore).some((v) => v.startsWith("err")), "ร้าน QC ก่อน = หลัง (นับ + ลายนิ้วมือ)",
  [drift.length ? `นับ: ${drift.join(", ")}` : "นับเท่าเดิม", fpDrift.length ? `ลายนิ้วมือ: ${fpDrift.join(", ")}` : `ลายนิ้วมือเท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => (v.startsWith("err") ? `${k}=${v}` : `${k}=${v.split(":")[0]}`)).join(" ")})`].join(" · "));
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, missing: skipReasons, guardHits: guardHits.length, beamCalls: beamCalls.length, a5: { drift, fpDrift, tempLeft } })}`);
for (const c of lanes) await c.$disconnect?.().catch?.(() => {});
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P1.7: คืนเงินผ่าน Beam (P1.8 คืนเงินสด/มือ) · ค่าธรรมเนียมบัตร (MDR) ลงบัญชี · QR บนจอลูกค้า (P2 11A) · PENDING_PAYMENT (P2.7) ·
// OCR สลิป · หน้าจัดการ PromptPay ID · หน้าจอทั้งหมดของ §3 (P1.7U + visual) · ค่าตั้ง 17A/P1.18
