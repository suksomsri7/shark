// QC — POS RUN ใบ P2.13: REST `/api/v1/pos` (ทะเบียนเดียว 49 op) + คีย์ API ของ POS + คู่มือ/OpenAPI/สกิล (registry) + ด่าน AI ของคีย์ // ORACLE-EDIT ผู้คุม 17 ต.ค. (P3.4 ST1): + sync.sales (มติ 2) · 48 → 49
//   เขียนก่อนสร้าง (fail-before) · ผู้สร้าง (builder) P2.13 S (+ U-lite) หลัง P2.12 S merge
// requires: (ไม่ต้อง seed — ร้านชั่วคราวของข้อสอบเอง · ลายนิ้วมือ Z2 อ่านร้าน seed ถ้ามี)
//
// สัญญา: ledger/pos-briefs/pos-brief-P2.13.md ⚠️1–10 · §0 · §1 (IN 45 + IN-B anomalies/tax-invoice/shifts-current = 48) · §2 · §3 · §4 · §5 · §6 ·
//   §10 มติผู้คุมงาน 1–10 (ผูกมัด) · ตารางชื่อเต็ม + รายการ ORACLE-EDIT ที่อนุมัติล่วงหน้า = ledger/wo-notes/pos-P2.13-oracle.md
//
// ชื่อที่ข้อสอบนี้ตั้ง (ผู้สร้างต้องทำให้มีจริง):
//   src/app/api/v1/pos/[...path]/route.ts — 5 export บาง (GET POST PATCH PUT DELETE) ส่งต่อ dispatch ของโมดูล ไม่มีตรรกะ (แบบ kanban)
//   src/app/api/v1/pos/openapi.json/route.ts — GET ไม่ต้องมีคีย์ · จำนวน operation = จำนวน op
//   src/lib/modules/pos/api/{config,actor,dispatch,openapi,http-errors,keys}.ts:
//     config.ts  POS_API_CONFIG {module "pos", systemType "POS", scopePrefix "pos.", rateNs "pos", makeActor, messages}
//     actor.ts   posApiKeyActor(input) → ApiActor + registerActor {userId: keyId, role "STAFF", unitAccess ["*"] | ตัวกรองสาขา, permissions = scope}
//     keys.ts    posApiServiceKey(keyId, idempotencyKey) = "api_" + sha256hex(keyId + "\n" + idempotencyKey).slice(0, 64)
//     http-errors.ts  POS_REFUSAL_HTTP: Record<PosRefusalCode, {status, code, en}> (ครบทุกรหัสของ facade ที่ op เรียก) + toPosApiError(e|refusal)
//   src/lib/modules/pos/api/ops/{meta,sales,shifts,devices,products,channels,orders,reports}.ts — เรียก facade เท่านั้น
//   op id/method/path/scope/kind = ตาราง OPS_SPEC ข้างล่าง (48 ตัว · คง id ของ P0.2: sales.create sales.void sales.summary sales.byDay)
//   src/lib/api-keys/scopes.ts — bundle pos-read / pos-operate / pos-admin (§2.1 ตรงตัว) + POS_SCOPE_KEYS + pseudo-scope "pos.filter.unit:<unitId>"
//   src/lib/modules/pos/api-key-actions.ts ("use server") — สร้าง/รายการ/เพิกถอนคีย์ · bundle ต้องเป็น pos-* · api.key.create/api.key.revoke + pos.settings.manage
//   src/lib/ai/skills.ts toolAllowedForApiKey — hunk เดียว `POS P2.13 ▸` : sales_summary/sales_by_day ⇐ pos.sale.read · pos_create_sale ⇐ pos.sale.create · void_sale ⇐ pos.sale.void
//   scripts/gen-pos-api-docs.mts (--check) → docs/api/POS-API.md + skills/shark-pos-api/references/endpoints.md (P2.14 DOC-2 · ในรีโป)
//   src/app/developers/pos/page.tsx + src/app/developers/pos.md/route.ts + ลิงก์ใน src/app/developers/page.tsx · fitness.mts บล็อก F13 ของ POS
// สัญญาคำตอบ (ข้อสอบเทียบ PAR กับ facade ตรงด้วย actor สังเคราะห์ของคีย์):
//   op อ่าน: `data` = ผลสำเร็จของ facade ตัด `ok` ทิ้ง (หรือค่าของฟิลด์เดียวที่เหลือ) · รายการแบ่งหน้า (sales.list · products.list) = data[] + page
//   คำปฏิเสธของ facade → HTTP ตามตาราง §3 (REFUSAL_EXPECT ข้างล่าง) · message_th = ข้อความไทยของ facade · message_en ASCII
//   POST /sales body = {unitId, lines (สินค้า {productId, qty, options?, weighedBarcode?} | กำหนดเอง {name, qty, unitPriceSatang}), payMethods [{type, amountSatang, reference?}],
//     expectedGrandTotalSatang?, channelId?, channelRef?, cashReceivedSatang?, note?, billDiscount?} — รูป P0.2 (กำหนดเอง ไม่มี expected) ต้องยังผ่าน schema
//     (qc-pos-p2.9 O2 / p2.9b P6 ใช้เป็นตัวควบคุมบวก) · วิธีจ่าย v1 = CASH TRANSFER PROMPTPAY CARD PLATFORM (อื่น + memberId/couponCode/memberChoices = 422)
//   คำตอบเขียน: sales.create → data.saleId · orders.create → data.orderId + data.duplicated · sales.refund → data.refund.id (หรือ data.refundId)
//   POST /orders body = {unitId} + อินพุตของ ingestOrder (channelId|channelCode · externalRef? · startStatus? · fulfilment · lines · customer · …) ไม่มี idempotencyKey (op สร้างเอง)
//   unitId: บังคับบน op รายการ/สร้าง (GET /sales /products /orders /channels /devices /shifts · POST /sales /sales/quote /orders /products) — query (GET) / body (อื่น) ·
//     ไม่บังคับบน op ที่มี {id} (ใช้สาขาของระเบียนนั้นหลังผ่านด่านสาขา · ส่งมาแล้วไม่ตรง = 404) — ข้อสอบยิงทั้งแบบมีและไม่มี
//
// ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 fix 1): AU9 SA9 SA10 OR7 RP5 (มติ fix1 ข้อ 7 · ledger/wo-notes/pos-P2.13-review.md) — 49 + 5 = 54 ข้อ
//   SA9 กติกา POS_VOID (F1) · SA10 กะของบิล API ปิดแล้ว (F2/H1) · AU9 ยืนยันจ่ายมือต้องผู้จัดการ (F3/H2 option b) · RP5 ชื่อคีย์ในรายงานพนักงาน (F4) · OR7 เงินสดของออเดอร์ต้องมีกะ (H3)
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p2.10): SKIP เมื่อ route ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต ST1–ST6 แบบอ่านไฟล์ (ไม่โหลด prisma ในโปรเซสนี้)
//    ฐาน = QC4 เท่านั้น · ร้านชั่วคราว `posqc-p213-<rand>` (+ `-t2`) ลบทั้งร้านใน finally (คีย์ API · แถวกันซ้ำ · บิล · ออเดอร์ อยู่ในร้าน) +
//    ถังเพดานอัตราของคีย์ของรอบ (`pos:api:%:<keyId>`) · ไม่มีเครือข่าย: globalThis.fetch = ตัวกั้น (503 + นับ)
//    SQL ดิบเฉพาะแถวของร้านชั่วคราว: เลื่อน ApiKey.expiresAt (คีย์หมดอายุ) · ลบ ApiIdempotency ของคีย์ (จำลอง TTL 24 ชม.) · เติมถังเพดาน (RL1)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p2.13";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";
/** ฐานของข้อสอบ (f37d605b) — ใช้เมื่อหาหมุดของเลนไม่ได้ (หมุด ST5 เทียบ "ของที่ใบนี้แก้" เท่านั้น) */ // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 lane-pin) 
const BASE_REV = process.env.P213_BASE || "f37d605b";
/** sha256 ของ scripts/pos-sale-contract.json — มติ 10: ห้าม regenerate (ค่าเดียวกับ qc-pos-p2.9b L1 / p2.10) */
const CONTRACT_SHA = "ba68f669fa2105ce708df5aa555c9127948f82c30d373bce6f65ebac0753c7c2"; // ORACLE-EDIT ผู้คุม 17 ต.ค. (CD-RP1 qc-pos-p2.13 ST5): sha สัญญาหลัง P3.4 S (0617d17b · +CreateSaleInput.offline) — เดิม 72afb258e9c0dc46c4d5ea2346835b6a56afda551038325d14ed9e12910546ad

// ═════════════════════════ ทะเบียนข้อสอบ ═════════════════════════
// X-group: S สถิต · A ด่านหน้า (คีย์/ระบบ/สิทธิ์/สาขา) · I กันซ้ำ · M เงิน/สต็อก (PAR กับหน้าขาย) · O ออเดอร์ · R รายงาน/อ่าน · Z คืนสภาพ
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P2.13-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "S", "[§1 §2.1 มติ 3] ทะเบียน 49 op = OPS_SPEC (id·method·path·scope·kind ตรงตัว) · module pos · auditAction pos.api.<id> · summary ASCII · ป้ายไทย · test id ไม่ซ้ำ · tool เฉพาะ 11 op ของ P3.9 (ORACLE-EDIT ผู้คุม POS 17 ต.ค. (P3.9 ST1) — เดิม: ไม่มี tool (P0.2 S3.5)) · POS_SCOPES ครบทุก scope ที่ใช้ · bundle pos-read/pos-operate/pos-admin = §2.1 ตรงตัว · scope เป็นคีย์สิทธิ์จริง · (DB) input strict + รูป P0.2 ของ sales.create ยังผ่าน schema"), // ORACLE-EDIT ผู้คุม 17 ต.ค. (P3.4 ST1): + sync.sales (มติ 2) · 48 → 49
  D("ST2", "S", "[§6 มติ 8] ไฟล์ตามตารางชื่อ: route [...path] = 5 export บางส่งต่อ dispatch ของโมดูล (ไม่มี prisma/if/await อื่น) · openapi.json/route.ts · pos/api/{config,actor,dispatch,openapi,http-errors,keys}.ts · ops/{meta,sales,shifts,devices,products,channels,orders,reports}.ts · config rateNs pos/systemType POS/scopePrefix pos. · api-key-actions.ts \"use server\" create/list/revoke + api.key.create/api.key.revoke + pos.settings.manage + bundle pos-* + createApiKey"),
  D("ST3", "S", "[§5 มติ 1] ops/*.ts เรียก facade เท่านั้น: ไม่มี createSale( (sales.ts 1 → 0) · ไม่มี $transaction / .create( .update( .upsert( .delete( *Many( / $executeRaw · ไม่ import @prisma/client ค่า · keys.ts posApiServiceKey = api_ + sha256(keyId\\n+key)[0..63] (DB: ค่าจริง)"),
  D("ST4", "S", "[§4 มติ 8] gen-pos-api-docs --check exit 0 · docs/api/POS-API.md + skill endpoints.md มีทุก `METHOD path` · /developers/pos (buildOpenApi/POS_OPS) + /developers/pos.md route + ลิงก์จาก /developers · fitness.mts F13 เรียก gen-pos-api-docs · (DB) openapi.json = 49 operation · pos.md = ไฟล์คู่มือเป๊ะ"), // ORACLE-EDIT ผู้คุม 17 ต.ค. (P3.4 ST1): + sync.sales (มติ 2) · 48 → 49
  D("ST5", "S", "[⚠️4 มติ 1 7 10] หมุด (เทียบ merge-base): pos-sale-contract.json sha คงเดิม · ไม่มี diff ใต้ prisma/ · outbox-consumers.ts ai/tools.ts package.json ไม่แตะ · createSale( ต่อไฟล์ = ฐาน ยกเว้น pos/api/ops/sales.ts → 0 · skills.ts มี hunk `POS P2.13 ▸` ใน toolAllowedForApiKey · (DB) ด่าน AI: sales_summary/by_day ⇐ pos.sale.read · pos_create_sale ⇐ create · void_sale ⇐ void (คีย์อื่น false)"),
  D("ST6", "S", "[§3 มติ 5] http-errors.ts: POS_REFUSAL_HTTP เป็น Record<PosRefusalCode,…> ครอบทุกรหัสของ facade ที่ op เรียก (register bills receipt refund shift device catalog channel order reports tax-invoice + PosSaleErrorCode) · message_en ASCII ทุกแถว · สถานะตาม §3 (NOT_FOUND 404 · PERMISSION_DENIED 403 · VALIDATION/PAYMENT_MISMATCH 422 · state 409 · *_TAKEN 409 duplicate · BUSY 503 · INTERNAL 500)"),
  // ── AU ด่านหน้า ──
  D("AU1", "A", "[§0 gate] ไม่มี Bearer → 401 unauthorized (GET /units · POST /sales) · ไม่มีบิลเกิด"),
  D("AU2", "A", "[§0 gate] คีย์หมดอายุ (expiresAt ผ่านไปแล้ว) → 401 key_expired"),
  D("AU3", "A", "[§0 gate · issuer rule] คีย์ที่ผูกระบบ KANBAN (scope pos-read) → 403 system_mismatch"),
  D("AU4", "A", "[§0 gate] คีย์ผูก POS S1 + หัว X-Shark-System = S2 → 403 system_mismatch · ไม่ส่งหัว → 200 (ตัวควบคุมบวก)"),
  D("AU5", "A", "[§0 gate] คีย์ไม่ผูกระบบ ไม่ส่งหัว → 400 system_required · ส่งหัว S1 → 200 · ส่งหัวระบบ KANBAN → 403 system_mismatch"),
  D("AU6", "A", "[§2.1 มติ 3] คีย์ pos-read: POST /sales → 403 scope_missing + hint มี pos.sale.create · GET /sales → 200 · ไม่มีบิลเกิด"),
  D("AU7", "A", "[§2.2 มติ 2] unitId ของระบบ POS อื่นในร้าน (S2) / ร้านอื่น (-t2) / มั่ว → 404 not_found บน GET /sales · GET /products · POST /sales · GET /orders (ไม่บอกว่ามีอยู่) · ตัวควบคุมบวก: สาขา A → 200"),
  D("AU8", "A", "[HF-APIV1 PAR] คีย์รุ่นเดิม scope [] (+หัว S1) → 403 scope_missing ทุก op ที่ลอง (GET /units /sales /reports/daily · POST /sales) · /api/v1/sales เดิมด้วยคีย์นั้น → 200 มีบิล API ของรอบนี้ (ไม่เปลี่ยน)"),
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 fix 1) (F3/H2 · มติ fix1 ข้อ 3 option b)
  D("AU9", "A", "[มติ fix1 ข้อ 3 · HF-PP] ร้านตั้ง manualConfirmRequiresManager: คีย์ pos-operate (มี pos.shift.manage) POST /sales พร้อมเพย์ไม่อ้าง pi_ / บัตร → 403 forbidden · 0 บิล · ตัวควบคุมบวก: เงินสดคีย์เดียวกัน → 200"),
  // ── RL เพดานอัตรา ──
  D("RL1", "A", "[§0 rate] ถัง pos:api:write:<keyId> ครบ 60 ในนาทีนี้ → คำขอเขียนถัดไป 429 rate_limited + Retry-After · ไม่มีบิลเกิด · คำตอบสำเร็จมี X-RateLimit-Limit 60/300/30 ตามชนิด"),
  D("RL2", "A", "[§0 rate] ถังแยก: ระหว่างที่ write ของคีย์นั้น 429 → GET /units ของคีย์เดียวกัน 200 · ไม่มีแถว kb:api:% / acct:api:% ของคีย์นั้น"),
  // ── ID กันซ้ำ ──
  D("ID1", "I", "[§3] POST /sales ไม่มี Idempotency-Key → 400 idempotency_required · 0 บิล"),
  D("ID2", "I", "[§3 มติ 5] คีย์+body เดิม → saleId เดิม + Idempotent-Replayed: true · 1 PosSale (idempotencyKey ลงท้าย api_<sha>[0..63] · sourceModule API · sourceId = soldByUserId = keyId) · ลบแถว ApiIdempotency (จำลองหมดอายุ) แล้วยิงซ้ำ → saleId เดิม ยังคง 1 บิล"),
  D("ID3", "I", "[§3] Idempotency-Key เดิม body ต่าง → 409 idempotency_conflict · ยังคง 1 บิล"),
  D("ID4", "I", "[§3 ⚠️6] คีย์ API สองใบ Idempotency-Key เดียวกัน → 2 บิล (service key ต่อคีย์ · คีย์กันซ้ำของบิลต่างกัน)"),
  D("ID5", "I", "[§3] ยิงพร้อมกัน 2 คำขอเหมือนกัน → บิลเดียว · ไม่มี 5xx · ผลเป็น 200 (+replay) หรือ 409 idempotency_in_progress"),
  // ── SA ขาย ──
  D("SA1", "M", "[มติ 1 PAR] บิล API vs บิลหน้าขาย (submitRegisterSale ด้วยเจ้าของ) ตะกร้าเดียวกัน (สินค้าคลัง ×2 · เมนู+ตัวเลือก · สินค้าชั่ง) → grandTotal/VAT/subtotal · บรรทัด (productId qty unitPrice lineTotal) · วิธีจ่าย · รูป JV ต่อบัญชี · การตัดสต็อกต่อสินค้า เท่ากันทุกตัว"),
  D("SA2", "M", "[§1 #5] POST /sales/quote (ไม่มี Idempotency-Key) → 200 ยอด = quoteRegisterCart ตรง · บิลที่ขายด้วยยอดนั้น = ยอด quote · quote ไม่สร้างบิล/แถวกันซ้ำ"),
  D("SA3", "M", "[มติ 1] บรรทัดกำหนดเองด้วยคีย์ที่ไม่มี pos.sale.priceOverride (pos-operate) → 403 forbidden · 0 บิล · คีย์ pos-admin → 200"),
  D("SA4", "M", "[§3] Σ วิธีจ่าย ≠ ยอด → 422 validation · expectedGrandTotalSatang ผิด → 409 state_conflict (PRICE_CHANGED) · 0 บิล"),
  D("SA5", "M", "[มติ 5] วิธีจ่าย GIFT_CARD / STORE_CREDIT / DEPOSIT / ROOM_CHARGE และ memberId / couponCode / staffToken / managerPin → 422 validation · 0 บิล · ตัวควบคุมบวก: CARD → 200"),
  D("SA6", "M", "[§1 #7] void (danger): ไม่มี confirm → 409 confirm_required · confirm+reason → 200 VOIDED · JV สุทธิต่อบัญชี = 0 · สต็อกคืนครบ · บิลจากระบบอื่น (HOTEL) → 409 state_conflict ไม่ถูกยกเลิก"),
  D("SA7", "M", "[§1 #8–9] GET /sales/{id}/refundable = saleForRefund (PAR) · คืน 1 หน่วย (danger) → 200 ใบ REFUND · คืนสต็อก +1 · pos.sale.refunded 1 ครั้ง · ยิงซ้ำคีย์เดิม → replay ใบเดิม · ระบายคิว 2 รอบ ไม่ซ้ำผล"),
  D("SA8", "M", "[§1 #9 IN-B] คีย์ไม่มี pos.sale.refund → 403 scope_missing (refundable + refund) · tax-invoice: คีย์ไม่มี pos.taxinvoice.issue → 403 · pos-admin = ผลเดียวกับ issueFullTaxInvoice ตรงบนบิลคู่ (PAR)"),
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 fix 1) (F1 · F2/H1)
  D("SA9", "M", "[มติ fix1 ข้อ 1 · P1.15 R5] กติกา POS_VOID เกณฑ์ ฿1,000: REST void บิล API ฿50,000 → 409 state_conflict (APPROVAL_REQUIRED) · คำขออนุมัติ POS_VOID ของบิล 1 ใบ · บิลยัง PAID"),
  D("SA10", "M", "[มติ fix1 ข้อ 2 · P1.9 S11] บิล API เงินสดผูกกะ S (shiftId) · ปิดกะ S → REST void → 409 state_conflict (SHIFT_CLOSED) · บิลยัง PAID"),
  // ── OR ออเดอร์ ──
  D("OR1", "O", "[§1 #25–27] POST /orders เข้าช่องทาง MANUAL (LINEMAN) เลขออเดอร์เดิมสองครั้ง (คนละ Idempotency-Key) → ออเดอร์เดียว ครั้งที่สอง duplicated:true · GET /orders + /orders/{id} = listOrders/getOrder (PAR)"),
  D("OR2", "O", "[§1 #28] accept ออเดอร์ PLATFORM (NEW) → 200 · บิลเดียว · JV COMMISSION ของบิล ≥ 1"),
  D("OR3", "O", "[§1 #29] reject reasonCode TOO_BUSY → 200 REJECTED · reasonCode มั่ว → 422 validation"),
  // ORACLE-EDIT ผู้คุม 15 ต.ค. (P2.13) CD-B1: ลำดับเดิม complete → pay ขัดกฎ P2.8 (ส่งมอบออเดอร์ที่ยังไม่จ่าย = ORDER_UNPAID · ออเดอร์ HANDED รับเงินไม่ได้) ⇒ pay ก่อน complete
  D("OR4", "O", "[§1 #30–32 #34] ออเดอร์ DIRECT: accept → preparing → ready → pay CASH → complete → 200 บิล + ออเดอร์ PAID · ขั้นผิด (preparing บนออเดอร์ที่ส่งมอบแล้ว) → 409 state_conflict"),
  D("OR5", "O", "[§1 #23–24] pause ช่องทาง adapter API → POST /orders → 409 state_conflict (CHANNEL_PAUSED) · resume → POST /orders → 200"),
  D("OR6", "O", "[§1 #33] cancel ออเดอร์ที่มีบิล: คีย์มี pos.order.reject แต่ไม่มี pos.sale.void → 403 forbidden · บิลไม่ถูกยกเลิก · pos-admin → 200 · บิล VOIDED"),
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 fix 1) (H3)
  D("OR7", "O", "[มติ fix1 ข้อ 5] requiredOtherSources ปิด + สาขาไม่มีกะเปิด: POST /orders/{id}/pay เงินสด → 409 state_conflict (SHIFT_REQUIRED) · ออเดอร์ยังไม่จ่าย 0 บิล · ตัวควบคุมบวก: โอน → 200"),
  // ── PR สินค้า ──
  D("PR1", "R", "[§1 #14 #16] GET /products?unitId=A → รายการ id+ราคา = listForUnit (PAR) + page · GET /products/{id}/options = registerProductOptions (PAR)"),
  D("PR2", "R", "[§1 #15] GET /products/lookup บาร์โค้ดปกติ → สินค้านั้น · ป้ายชั่ง EAN-13 (20…) → สินค้าชั่ง + กรัม/ราคาของป้าย = registerScan (PAR) · บาร์โค้ดไม่มี → 200 ไม่พบ"),
  D("PR3", "M", "[§1 #21 86] availability false → 200 · outbox pos.product.availability 1 · quote สินค้านั้น → ปฏิเสธ (4xx) · registerScan เห็นหมด · availability true → ขายได้อีก"),
  D("PR4", "M", "[มติ 4] create/update/archive ผ่านคีย์ pos-admin ที่ผู้สร้างคีย์เป็น STAFF ไม่มี pos.product.manage → 200 ทั้งสาม (สิทธิ์ = scope ของคีย์) · AuditLog API_KEY action pos.api.products.* · แถว PosProduct ตรง (ผ่าน catalog.ts)"),
  D("PR5", "M", "[§1 #19] PUT /products/{id}/price ด้วยคีย์มีแค่ pos.product.manage → 403 scope_missing · pos-admin → 200 ราคาเปลี่ยนจริง"),
  // ── RP รายงาน ──
  D("RP1", "R", "[§1 #35–43] /reports/{daily products staff payments margin shifts tax channels} = reader ตรงด้วย actor สังเคราะห์ของคีย์ (PAR) · /reports/summary 200 ยอดตรงผลรวม daily"),
  D("RP2", "R", "[§1 #44–45 IN-B · มติ 10] /reports/{branches hourly anomalies} = reader ตรง (PAR) — SKIP-with-reason เมื่อ REPORT_KINDS ยังไม่มี (ก่อน P2.12 S merge)"),
  D("RP3", "R", "[§1 มติ 8] Accept: text/csv บน /reports/daily = reportCsv ตรง (ไบต์เดียวกัน · BOM) · ช่วง 93 วัน → 422 validation"),
  D("RP4", "A", "[มติ 2] คีย์ตัวกรอง pos.filter.unit:A: GET /reports/daily?unitId=B → 404 · ไม่ระบุสาขา = ยอดของ A เท่านั้น (PAR reader unitAccess [A]) · GET /sales?unitId=B → 404"),
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 fix 1) (F4)
  D("RP5", "R", "[มติ fix1 ข้อ 4 · มติ 3] /reports/staff: แถวของคีย์ผู้ขาย (userId = keyId) ชื่อ \"API: <ชื่อคีย์>\" · แถวคนจริงยังเป็นชื่อคน"),
  // ── SH กะ/เครื่อง/ช่องทาง/ทางที่ปิด ──
  D("SH1", "R", "[§1 #10–12 IN-B] /shifts · /shifts/{id}/x-report · /z-report · /shifts/current = listShifts/xReport/zReport/currentShift ตรง (PAR) · คีย์ pos-read → 403 scope_missing"),
  D("SH2", "R", "[§1 #1–4 #13 #22] GET /units = สาขาที่ผูก S1 (A,B ไม่มีสาขาของ S2/-t2) · GET /sales = billsPageData (id ชุดเดียวกัน + page) · /sales/{id} = billDetail · /sales/{id}/receipt = receiptPayload ต้นฉบับ (PAR) · GET /devices = listDevices · GET /channels = listChannels (PAR) · pos-read บน /devices → 403"),
  D("SH3", "A", "[§1 NEVER/P3] /staff/verify-pin · /staff/pins · /display/pair · /sales/{id}/split · /approvals · /deposits · /held-carts · /shifts/open · /webhooks/{code} · /devices/{id}/revoke → 404 not_found"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราว (+ -t2) 0 แถวทุกตารางที่มี tenantId (ApiKey · ApiIdempotency · บิล · ออเดอร์) + Tenant ถูกลบ · ถังเพดานของคีย์รอบนี้ 0"),
  D("Z2", "-", "ลายนิ้วมือนอกร้านชั่วคราว (PosSale · PosOrder · PosProduct · SalesChannel · ApiKey ของร้าน seed) เท่าเดิม"),
];

if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} ข้อ (id · X · หัวข้อ)`);
  for (const [id, x, t] of CHECKS) console.log(`${id}\t${x}\t${t}`);
  const byX = new Map<string, number>();
  for (const [, x] of CHECKS) byX.set(x, (byX.get(x) ?? 0) + 1);
  console.log(`X-coverage: ${[...byX.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  process.exit(0);
}

// ═════════════════════════ ตารางสัญญา ═════════════════════════
type OpKind = "read" | "write" | "danger";
type OpSpec = readonly [id: string, method: string, path: string, action: string, kind: OpKind];
/** 49 op (มติ §10: IN 45 + anomalies/tax-invoice/shifts-current · P3.4 + sync.sales) — ตรงตัว */ // ORACLE-EDIT ผู้คุม 17 ต.ค. (P3.4 ST1): + sync.sales (มติ 2) · 48 → 49
const OPS_SPEC: readonly OpSpec[] = [
  ["units.list", "GET", "/units", "pos.sale.read", "read"],
  ["sales.list", "GET", "/sales", "pos.sale.read", "read"],
  ["sales.get", "GET", "/sales/{id}", "pos.sale.read", "read"],
  ["sales.receipt", "GET", "/sales/{id}/receipt", "pos.sale.read", "read"],
  ["sales.quote", "POST", "/sales/quote", "pos.sale.create", "read"],
  ["sales.create", "POST", "/sales", "pos.sale.create", "write"],
  ["sales.void", "POST", "/sales/{id}/void", "pos.sale.void", "danger"],
  ["sales.refundable", "GET", "/sales/{id}/refundable", "pos.sale.refund", "read"],
  ["sales.refund", "POST", "/sales/{id}/refund", "pos.sale.refund", "danger"],
  ["sales.taxInvoice", "POST", "/sales/{id}/tax-invoice", "pos.taxinvoice.issue", "write"],
  ["shifts.list", "GET", "/shifts", "pos.shift.manage", "read"],
  ["shifts.current", "GET", "/shifts/current", "pos.shift.manage", "read"],
  ["shifts.xReport", "GET", "/shifts/{id}/x-report", "pos.shift.manage", "read"],
  ["shifts.zReport", "GET", "/shifts/{id}/z-report", "pos.shift.manage", "read"],
  ["devices.list", "GET", "/devices", "pos.device.manage", "read"],
  ["products.list", "GET", "/products", "pos.sale.read", "read"],
  ["products.lookup", "GET", "/products/lookup", "pos.sale.create", "read"],
  ["products.options", "GET", "/products/{id}/options", "pos.sale.create", "read"],
  ["products.create", "POST", "/products", "pos.product.manage", "write"],
  ["products.update", "PATCH", "/products/{id}", "pos.product.manage", "write"],
  ["products.setPrice", "PUT", "/products/{id}/price", "pos.product.setPrice", "write"],
  ["products.archive", "POST", "/products/{id}/archive", "pos.product.manage", "danger"],
  ["products.availability", "POST", "/products/{id}/availability", "pos.sale.create", "write"],
  ["channels.list", "GET", "/channels", "pos.sale.read", "read"],
  ["channels.pause", "POST", "/channels/{id}/pause", "pos.order.accept", "write"],
  ["channels.resume", "POST", "/channels/{id}/resume", "pos.order.accept", "write"],
  ["orders.list", "GET", "/orders", "pos.sale.read", "read"],
  ["orders.get", "GET", "/orders/{id}", "pos.sale.read", "read"],
  ["orders.create", "POST", "/orders", "pos.sale.create", "write"],
  ["orders.accept", "POST", "/orders/{id}/accept", "pos.order.accept", "write"],
  ["orders.reject", "POST", "/orders/{id}/reject", "pos.order.reject", "write"],
  ["orders.preparing", "POST", "/orders/{id}/preparing", "pos.order.accept", "write"],
  ["orders.ready", "POST", "/orders/{id}/ready", "pos.order.accept", "write"],
  ["orders.complete", "POST", "/orders/{id}/complete", "pos.order.accept", "write"],
  ["orders.cancel", "POST", "/orders/{id}/cancel", "pos.order.reject", "danger"],
  ["orders.pay", "POST", "/orders/{id}/pay", "pos.sale.create", "write"],
  ["sales.summary", "GET", "/reports/summary", "pos.report.view", "read"],
  ["sales.byDay", "GET", "/reports/daily", "pos.report.view", "read"],
  ["reports.products", "GET", "/reports/products", "pos.report.view", "read"],
  ["reports.staff", "GET", "/reports/staff", "pos.report.view", "read"],
  ["reports.payments", "GET", "/reports/payments", "pos.report.view", "read"],
  ["reports.margin", "GET", "/reports/margin", "pos.report.view", "read"],
  ["reports.shifts", "GET", "/reports/shifts", "pos.report.view", "read"],
  ["reports.tax", "GET", "/reports/tax", "pos.report.view", "read"],
  ["reports.channels", "GET", "/reports/channels", "pos.report.view", "read"],
  ["reports.branches", "GET", "/reports/branches", "pos.report.view", "read"],
  ["reports.hourly", "GET", "/reports/hourly", "pos.report.view", "read"],
  ["reports.anomalies", "GET", "/reports/anomalies", "pos.report.anomaly", "read"],
  ["sync.sales", "POST", "/sync/sales", "pos.offline.sync", "write"], // ORACLE-EDIT ผู้คุม 17 ต.ค. (P3.4 ST1): + sync.sales (มติ 2) · 48 → 49
];
/** bundle ตาม §2.1 (ตรงตัว — มติ 3) */
const POS_READ = ["pos.sale.read", "pos.report.view"];
const POS_OPERATE = [...POS_READ, "pos.sale.create", "pos.order.accept", "pos.shift.manage", "pos.device.manage"];
const POS_ADMIN = [...POS_OPERATE, "pos.sale.void", "pos.sale.refund", "pos.sale.priceOverride", "pos.order.reject", "pos.product.manage", "pos.product.setPrice", "pos.channel.manage", "pos.taxinvoice.issue", "pos.report.anomaly", "pos.offline.sync"]; // ORACLE-EDIT ผู้คุม 17 ต.ค. (P3.4 ST1 · CD-8 → CD-P34b): pos-admin + pos.offline.sync (pos-operate ไม่ได้ — qc-pos-p3.4 RS4) · 15 → 16
const BUNDLE_SPEC: Record<string, string[]> = { "pos-read": POS_READ, "pos-operate": POS_OPERATE, "pos-admin": POS_ADMIN };
const FILTER_PREFIX = "pos.filter.unit:";
/** รายงานของ P2.12 S (RP2 · SKIP เมื่อ REPORT_KINDS ยังไม่มี) */
const P212_KINDS = ["branches", "hourly", "anomalies"] as const;
const BASE_KINDS = ["daily", "products", "staff", "payments", "margin", "shifts", "tax", "channels"] as const;
const REPORT_FN: Record<string, string> = {
  daily: "reportDailySales", products: "reportProducts", staff: "reportStaff", payments: "reportPayments", margin: "reportMargin",
  shifts: "reportShifts", tax: "reportTax", channels: "reportChannels", branches: "reportBranches", hourly: "reportHourly", anomalies: "reportAnomalies",
};
/** คำปฏิเสธ → HTTP (§3) — ข้อสอบใช้ตารางนี้ตัดสิน PAR ของคำปฏิเสธ · รหัสที่ไม่อยู่ในตาราง = ข้อสอบยอมทุกสถานะ 4xx ที่ไม่ใช่ 500 */
const REFUSAL_EXPECT: Record<string, [number, string]> = {
  NOT_FOUND: [404, "not_found"], SALE_NOT_FOUND: [404, "not_found"], ORDER_NOT_FOUND: [404, "not_found"], PRODUCT_NOT_FOUND: [404, "not_found"],
  CHANNEL_NOT_FOUND: [404, "not_found"], DEVICE_NOT_FOUND: [404, "not_found"], MEMBER_NOT_FOUND: [404, "not_found"],
  PERMISSION_DENIED: [403, "forbidden"], NO_PERMISSION: [403, "forbidden"],
  VALIDATION: [422, "validation"], PAYMENT_MISMATCH: [422, "validation"], INVALID_LINE: [422, "validation"], REASON_REQUIRED: [422, "validation"], TAX_ID_INVALID: [422, "validation"],
  IDEMPOTENCY_CONFLICT: [409, "idempotency_conflict"],
  ORDER_STATE_INVALID: [409, "state_conflict"], ORDER_STATE_CHANGED: [409, "state_conflict"], ORDER_UNPAID: [409, "state_conflict"], CHANNEL_PAUSED: [409, "state_conflict"],
  SHIFT_CLOSED: [409, "state_conflict"], SHIFT_REQUIRED: [409, "state_conflict"], HAS_REFUNDS: [409, "state_conflict"], PRICE_CHANGED: [409, "state_conflict"],
  SALE_NOT_VOIDABLE: [409, "state_conflict"], SALE_NOT_REFUNDABLE: [409, "state_conflict"], NOT_ELIGIBLE: [409, "state_conflict"], ALREADY_ISSUED: [409, "state_conflict"],
  TOO_LATE: [409, "state_conflict"], SALE_VOIDED: [409, "state_conflict"],
  CHANNEL_CODE_TAKEN: [409, "duplicate"], PIN_TAKEN: [409, "duplicate"],
  RATE_LIMITED: [429, "rate_limited"], BUSY: [503, "upstream_unavailable"],
};
/** INTERNAL → 500 (§3) — แกนไม่มีรหัส `internal` ใน API_ERROR_CODES ⇒ ข้อสอบตรึงแค่สถานะ (รหัส = CONTROLLER-DECISION ในโน้ต) */
const INTERNAL_STATUS = 500;
/** ไฟล์ refusal ที่ต้องครอบ (§3 — facade ที่ op เรียก) · [ไฟล์, ชื่อ type] */
const REFUSAL_TYPES: readonly [string, string][] = [
  ["register-shared.ts", "RegisterRefusalCode"], ["bills-shared.ts", "BillsRefusalCode"], ["receipt.ts", "ReceiptRefusalCode"], ["refund-shared.ts", "RefundRefusalCode"],
  ["shift.ts", "ShiftRefusalCode"], ["device-shared.ts", "PosDeviceRefusalCode"], ["catalog.ts", "CatalogErrorCode"], ["channel-shared.ts", "ChannelRefusalCode"],
  ["order-shared.ts", "OrderRefusalCode"], ["reports.ts", "ReportRefusalCode"], ["tax-invoice-shared.ts", "TaxInvoiceRefusalCode"], ["service.ts", "PosSaleErrorCode"],
];
/** ทางที่ต้องปิด (NEVER/P3 · SH3) — path ที่ไม่มี op ใดเลย ⇒ 404 ไม่ใช่ 405 */
const CLOSED_PATHS: readonly [string, string][] = [
  ["POST", "/staff/verify-pin"], ["GET", "/staff/pins"], ["PUT", "/staff/pins"], ["POST", "/display/pair"], ["POST", "/sales/SALEID/split"],
  ["POST", "/approvals"], ["POST", "/deposits"], ["GET", "/held-carts"], ["POST", "/shifts/open"], ["POST", "/webhooks/LINEMAN"], ["POST", "/devices/DEVID/revoke"],
];
/** คีย์ที่ไม่มีความหมายคงที่ (เวลาปัจจุบัน) — ตัดก่อนเทียบ PAR */
const VOLATILE = new Set(["at", "generatedAt", "asOf", "printedAt", "now", "computedAt", "requestId"]);

// ═════════════════════════ ตัวช่วยทั่วไป ═════════════════════════
const TITLE = new Map(CHECKS.map(([id, , t]) => [id, t]));
const results = new Map<string, { ok: boolean; expected: string; actual: string; skip?: string }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const full = id.startsWith("P2.13-") ? id : `P2.13-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
/** SKIP-with-reason (นับผ่าน — ใช้เฉพาะ RP2 ก่อน P2.12 S merge ตามมติ 10) */
function skipChk(id: string, why: string): void {
  const full = `P2.13-${id}`;
  results.set(full, { ok: true, expected: "-", actual: "-", skip: why });
  console.log(`  ⏭  [${full}] ${TITLE.get(full)} — SKIP: ${why}`);
}
const rd = (p: string) => (existsSync(p.startsWith("/") ? p : join(ROOT, p)) ? readFileSync(p.startsWith("/") ? p : join(ROOT, p), "utf8") : "");
const short = (v: unknown, n = 200) => {
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
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const THAI = /[ก-๛]/;
const ASCII = /^[\x20-\x7e]*$/;
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
function gitBuf(args: string[]): Buffer | null {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 });
  } catch {
    return null;
  }
}
const gitStr = (args: string[]) => gitBuf(args)?.toString("utf8") ?? null;
/** ค่าคงที่เรียงคีย์ (เทียบ PAR) — ตัดคีย์เวลาปัจจุบันทิ้ง */
function stable(v: unknown): string {
  const norm = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(norm);
    if (x instanceof Date) return x.toISOString();
    if (isRecord(x)) return Object.fromEntries(Object.keys(x).filter((k) => !VOLATILE.has(k) && x[k] !== undefined).sort().map((k) => [k, norm(x[k])]));
    return x;
  };
  return JSON.stringify(norm(v));
}
/** ผลสำเร็จของ facade → data ที่คาด (ตัด ok · ถ้าเหลือฟิลด์เดียวยอมทั้งก้อนหรือค่าของฟิลด์นั้น) */
function sameData(apiData: unknown, direct: Any): boolean {
  if (!isRecord(direct)) return false;
  const { ok: _ok, ...rest } = direct;
  if (stable(apiData) === stable(rest)) return true;
  const keys = Object.keys(rest).filter((k) => !VOLATILE.has(k));
  return keys.length === 1 && stable(apiData) === stable(rest[keys[0]!]);
}

const POS_DIR = "src/lib/modules/pos";
const F = {
  route: "src/app/api/v1/pos/[...path]/route.ts",
  openapiRoute: "src/app/api/v1/pos/openapi.json/route.ts",
  apiDir: `${POS_DIR}/api`,
  opsDir: `${POS_DIR}/api/ops`,
  config: `${POS_DIR}/api/config.ts`,
  actor: `${POS_DIR}/api/actor.ts`,
  dispatch: `${POS_DIR}/api/dispatch.ts`,
  openapi: `${POS_DIR}/api/openapi.ts`,
  httpErrors: `${POS_DIR}/api/http-errors.ts`,
  keys: `${POS_DIR}/api/keys.ts`,
  opTs: `${POS_DIR}/api/op.ts`,
  registry: `${POS_DIR}/api/registry.ts`,
  keyActions: `${POS_DIR}/api-key-actions.ts`,
  scopes: "src/lib/api-keys/scopes.ts",
  skills: "src/lib/ai/skills.ts",
  tools: "src/lib/ai/tools.ts",
  outbox: "src/lib/outbox-consumers.ts",
  gen: "scripts/gen-pos-api-docs.mts",
  doc: "docs/api/POS-API.md",
  skillEndpoints: "skills/shark-pos-api/references/endpoints.md", // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 DOC-2) มติ 4: สกิลอยู่ในรีโป (เดิม .claude/skills/…)
  devPage: "src/app/developers/pos/page.tsx",
  devMd: "src/app/developers/pos.md/route.ts",
  devIndex: "src/app/developers/page.tsx",
  fitness: "scripts/fitness.mts",
  contract: "scripts/pos-sale-contract.json",
  pkg: "package.json",
};
const OPS_FILES = ["meta", "sales", "shifts", "devices", "products", "channels", "orders", "reports"].map((n) => `${F.opsDir}/${n}.ts`);
const API_FILES = ["config", "actor", "dispatch", "openapi", "http-errors", "keys"].map((n) => `${F.apiDir}/${n}.ts`);
const STATIC_IDS = ["ST1", "ST2", "ST3", "ST4", "ST5", "ST6"].map((x) => `P2.13-${x}`);
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.route))) skipReasons.push(`${F.route} ยังไม่มี`);
for (const f of API_FILES) if (!existsSync(join(ROOT, f))) skipReasons.push(`${f} ยังไม่มี`);

// ── หมุดของเลน (หมุด ST5 เทียบเฉพาะสิ่งที่ใบนี้แก้) ──
const LANE_PIN = "02b67f91"; // ORACLE-EDIT ผู้คุม 17.10 (CD-RP5 · product tip after P3.7 merge · re-pin a2c9a4c7 → 02b67f91) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP4 · product tip after P3.8 merge · re-pin 683a7cc8 → a2c9a4c7) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP2 · P3.9 merge · re-pin 8bded5a7 → 683a7cc8) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP1b · settings-general re-resolution · re-pin 0617d17b → 8bded5a7) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP1 lane-pin · re-pin 05975437 → 0617d17b) · ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 lane-pin · มติ 3 · TL-1 · CD-B1 re-pin → merge 05975437): หมุดคงที่ 05975437 (ฐานของ P2.14 = first parent ของ merge) แทนฐานร่วมกับสาขาต้นทาง
const MB = (() => {
  const mb = gitStr(["rev-parse", "--verify", "-q", `${LANE_PIN}^{commit}`])?.trim(); // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 lane-pin · มติ 3 · TL-1 · CD-B1 re-pin → merge 05975437): หมุดคงที่ 05975437 (ฐานของ P2.14 = first parent ของ merge) แทนฐานร่วมกับสาขาต้นทาง
  return process.env.P213_BASE ? BASE_REV : mb || BASE_REV;
})();

/** แกะ op จากซอร์สของ ops/*.ts (ไม่ต้อง import — ใช้ได้ใน --no-db) */
type ParsedOp = { id: string; method: string; path: string; action: string; kind: string; file: string; test: string; summary: string; label: string; hasTool: boolean };
function parseOps(): { ops: ParsedOp[]; scopes: Record<string, string> } {
  const scopes: Record<string, string> = {};
  const opTs = srcOf(F.opTs);
  const sb = /POS_SCOPES\s*=\s*\{([\s\S]*?)\}\s*as\s+const/.exec(opTs)?.[1] ?? "";
  for (const m of sb.matchAll(/(\w+)\s*:\s*"([^"]+)"/g)) scopes[m[1]!] = m[2]!;
  const ops: ParsedOp[] = [];
  for (const file of walk(F.opsDir)) {
    const src = stripComments(rd(file));
    for (const m of src.matchAll(/definePosOp\s*\(\s*\{/g)) {
      const body = src.slice(m.index!, m.index! + 2500);
      const str = (k: string) => new RegExp(`\\b${k}\\s*:\\s*"([^"]*)"`).exec(body)?.[1] ?? "";
      const actRaw = /\baction\s*:\s*([^,\n]+)/.exec(body)?.[1]?.trim() ?? "";
      const action = /^"([^"]+)"$/.exec(actRaw)?.[1] ?? scopes[/POS_SCOPES\.(\w+)/.exec(actRaw)?.[1] ?? ""] ?? actRaw;
      ops.push({ id: str("id"), method: str("method"), path: str("path"), action, kind: str("kind"), file, test: str("test"), summary: str("summary"), label: str("label"), hasTool: /\btool\s*:\s*\{/.test(body.slice(0, body.indexOf("handler") > 0 ? body.indexOf("handler") : body.length)) });
    }
  }
  return { ops, scopes };
}
/** ตัวอักษรรหัสของ type alias (ตามต่อ type อื่นในชุด + `(typeof X)[number]`) */
function refusalCodes(): { codes: Set<string>; missing: string[] } {
  const codes = new Set<string>();
  const missing: string[] = [];
  const bodies = new Map<string, { body: string; src: string }>();
  for (const [file, name] of REFUSAL_TYPES) {
    const src = stripComments(rd(`${POS_DIR}/${file}`));
    const m = new RegExp(`export\\s+type\\s+${name}\\s*=([\\s\\S]*?);`).exec(src);
    if (!m) {
      missing.push(`${file}:${name}`);
      continue;
    }
    bodies.set(name, { body: m[1]!, src });
  }
  const seen = new Set<string>();
  const expand = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    const b = bodies.get(name);
    if (!b) return;
    for (const lit of b.body.matchAll(/"([A-Z][A-Z0-9_]+)"/g)) codes.add(lit[1]!);
    for (const ref of b.body.matchAll(/\b([A-Z]\w*Code)\b/g)) expand(ref[1]!);
    for (const tq of b.body.matchAll(/typeof\s+(\w+)\s*\)\s*\[\s*number\s*\]/g)) {
      const arr = new RegExp(`\\b${tq[1]}\\s*=\\s*\\[([\\s\\S]*?)\\]`).exec(b.src)?.[1] ?? "";
      for (const lit of arr.matchAll(/"([A-Z][A-Z0-9_]+)"/g)) codes.add(lit[1]!);
    }
  };
  for (const [, name] of REFUSAL_TYPES) expand(name);
  return { codes, missing };
}

// ═════════════════════════ 1. ข้อสถิต ═════════════════════════
let st5PinsOk = false;
const stNotes: Record<string, string[]> = {};
function runStatic(): void {
  console.log(`\n── ST ข้อสถิต (ไม่แตะ DB · merge-base ${MB.slice(0, 10)}) ──`);
  // ST1 ทะเบียน (ข้อความ) — ส่วน DB เติมใน runDb (stNotes.ST1)
  {
    const p: string[] = [];
    const { ops, scopes } = parseOps();
    const byId = new Map(ops.map((o) => [o.id, o]));
    if (ops.length !== OPS_SPEC.length) p.push(`op ${ops.length} ตัว (คาด ${OPS_SPEC.length})`);
    for (const [id, method, path, action, kind] of OPS_SPEC) {
      const o = byId.get(id);
      if (!o) {
        p.push(`ขาด ${id}`);
        continue;
      }
      if (o.method !== method || o.path !== path) p.push(`${id} ${o.method} ${o.path} (คาด ${method} ${path})`);
      if (o.action !== action) p.push(`${id} scope ${o.action} (คาด ${action})`);
      if (o.kind !== kind) p.push(`${id} kind ${o.kind} (คาด ${kind})`);
      if (!o.summary || !ASCII.test(o.summary)) p.push(`${id} summary ไม่ใช่ ASCII`);
      if (!THAI.test(o.label)) p.push(`${id} ป้ายไม่ใช่ไทย`);
      // ORACLE-EDIT ผู้คุม POS 17 ต.ค. (P3.9 ST1): สลับ tool = P3.9 ⇒ อนุญาต tool เฉพาะ 11 op ของ TOOL_SPEC (qc-pos-p3.9) — เดิม: op ใดประกาศ tool = แดง
      const P39_TOOL_OPS = ["sales.summary", "sales.byDay", "reports.products", "reports.shifts", "shifts.xReport", "reports.anomalies", "reports.hourly", "products.lookup", "products.setPrice", "products.availability", "sales.void"];
      if (o.hasTool !== P39_TOOL_OPS.includes(id)) p.push(`${id} ${o.hasTool ? "ประกาศ tool นอกตาราง P3.9" : "ไม่ประกาศ tool (P3.9)"}`);
    }
    const extra = ops.filter((o) => !OPS_SPEC.some(([id]) => id === o.id)).map((o) => o.id);
    if (extra.length) p.push(`op เกินตาราง: ${extra.join(",")}`);
    const tests = ops.map((o) => o.test);
    if (tests.some((t) => !t) || new Set(tests).size !== tests.length) p.push("test id ว่าง/ซ้ำ");
    const used = [...new Set(OPS_SPEC.map(([, , , a]) => a))];
    const scopeVals = new Set(Object.values(scopes));
    const missScope = used.filter((a) => !scopeVals.has(a));
    if (missScope.length) p.push(`POS_SCOPES ขาด ${missScope.join(",")}`);
    // bundle (ข้อความ scopes.ts)
    const sc = srcOf(F.scopes);
    for (const bid of Object.keys(BUNDLE_SPEC)) {
      const at = sc.indexOf(`id: "${bid}"`);
      if (at < 0) {
        p.push(`ไม่มี bundle ${bid}`);
        continue;
      }
      const blk = sc.slice(at, at + 1500).split(/\n\s*\},?\s*\n\s*\{/)[0] ?? "";
      if (!/scopes\s*:/.test(blk)) p.push(`${bid} ไม่มี scopes`);
    }
    if (!/POS_SCOPE_KEYS/.test(sc)) p.push("scopes.ts ไม่มี POS_SCOPE_KEYS");
    if (!sc.includes(FILTER_PREFIX)) p.push(`scopes.ts ไม่รู้จัก ${FILTER_PREFIX}`);
    stNotes.ST1 = p;
  }
  // ST2 ไฟล์ + route บาง
  {
    const p: string[] = [];
    const route = rd(F.route);
    if (!route) p.push(`ไม่มี ${F.route}`);
    else {
      const code = stripComments(route);
      for (const m of ["GET", "POST", "PATCH", "PUT", "DELETE"]) if (!new RegExp(`export\\s+(async\\s+)?(function\\s+${m}\\b|const\\s+${m}\\b)`).test(code)) p.push(`route ไม่มี export ${m}`);
      if (/\bprisma\b|tenantDb|\bif\s*\(|\bswitch\s*\(/.test(code)) p.push("route มีตรรกะ (prisma/if/switch)");
      if (!/@\/lib\/modules\/pos\/api\/dispatch|modules\/pos\/api/.test(code)) p.push("route ไม่ส่งต่อ dispatch ของโมดูล pos");
      if (code.split("\n").filter((l) => l.trim()).length > 30) p.push("route ยาวเกิน 30 บรรทัด (ไม่บาง)");
    }
    if (!/export\s+(async\s+)?(function|const)\s+GET\b/.test(srcOf(F.openapiRoute))) p.push(`ไม่มี ${F.openapiRoute} GET`);
    for (const f of [...API_FILES, ...OPS_FILES]) if (!existsSync(join(ROOT, f))) p.push(`ไม่มี ${f.replace(`${POS_DIR}/`, "")}`);
    const cfg = srcOf(F.config);
    if (cfg && !(/rateNs\s*:\s*"pos"/.test(cfg) && /systemType\s*:\s*"POS"/.test(cfg) && /scopePrefix\s*:\s*"pos\."/.test(cfg) && /POS_API_CONFIG/.test(cfg))) p.push("config.ts ไม่ใช่ POS_API_CONFIG {rateNs pos · systemType POS · scopePrefix pos.}");
    if (existsSync(join(ROOT, F.actor)) && !/posApiKeyActor/.test(srcOf(F.actor))) p.push("actor.ts ไม่มี posApiKeyActor");
    if (existsSync(join(ROOT, F.keys)) && !/export\s+function\s+posApiServiceKey\b/.test(srcOf(F.keys))) p.push("keys.ts ไม่ export posApiServiceKey");
    const ka = rd(F.keyActions);
    if (!ka) p.push(`ไม่มี ${F.keyActions}`);
    else {
      const c = stripComments(ka);
      if (!/^["']use server["']/.test(ka.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "").trimStart())) p.push("api-key-actions.ts ไม่ใช่ \"use server\"");
      const fns = [...c.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]!);
      for (const re of [/create/i, /list/i, /revoke/i]) if (!fns.some((n) => re.test(n))) p.push(`api-key-actions ไม่มีฟังก์ชัน ${re.source}`);
      for (const k of ["api.key.create", "api.key.revoke", "pos.settings.manage"]) if (!c.includes(k)) p.push(`api-key-actions ไม่ตรวจ ${k}`);
      if (!/createApiKey\s*\(/.test(c) || !/expandBundles/.test(c) || !/pos-/.test(c)) p.push("api-key-actions ไม่ใช้ expandBundles + createApiKey + ด่าน bundle pos-*");
    }
    stNotes.ST2 = p;
  }
  // ST3 ops เรียก facade เท่านั้น
  {
    const p: string[] = [];
    for (const f of walk(F.opsDir)) {
      const c = srcOf(f);
      const n = f.split("/").pop();
      if (/\bcreateSale\s*\(/.test(c)) p.push(`${n} เรียก createSale( (มติ 1: ผ่าน submitRegisterSale)`);
      if (/\$transaction|\$executeRaw|\$queryRaw/.test(c)) p.push(`${n} มี $transaction/$executeRaw/$queryRaw`);
      if (/\.(create|update|upsert|delete|createMany|updateMany|deleteMany)\s*\(/.test(c.replace(/\b(z|zod)\.[\w.]+\(/g, ""))) p.push(`${n} เขียนตารางตรง`);
      if (/from\s+["']@prisma\/client["']/.test(c.replace(/import\s+type[^;]+;/g, ""))) p.push(`${n} import ค่าจาก @prisma/client`);
    }
    if (!walk(F.opsDir).length) p.push("ไม่มี ops/");
    const k = srcOf(F.keys);
    if (k && !(/sha256/.test(k) && /api_/.test(k) && /\\n/.test(k))) p.push("keys.ts ไม่ใช่ api_ + sha256(keyId\\n+key)");
    stNotes.ST3 = p;
  }
  // ST4 คู่มือ (ข้อความ + --check)
  {
    const p: string[] = [];
    if (!existsSync(join(ROOT, F.gen))) p.push(`ไม่มี ${F.gen}`);
    else {
      const g = spawnSync("pnpm", ["exec", "tsx", F.gen, "--check"], { cwd: ROOT, encoding: "utf8", timeout: 240_000, env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS ?? "" } });
      if (g.status !== 0) p.push(`gen --check exit ${g.status} ${short((g.stdout ?? "") + (g.stderr ?? ""), 120)}`);
    }
    const doc = rd(F.doc);
    const ep = rd(F.skillEndpoints);
    if (!doc) p.push(`ไม่มี ${F.doc}`);
    if (!ep) p.push(`ไม่มี ${F.skillEndpoints}`);
    const missDoc = OPS_SPEC.filter(([, m, path]) => !doc.includes(`${m} ${path}`) && !doc.includes(`${m} /api/v1/pos${path}`)).map(([id]) => id);
    const missEp = OPS_SPEC.filter(([, m, path]) => !ep.includes(`${m} ${path}`) && !ep.includes(`${m} /api/v1/pos${path}`)).map(([id]) => id);
    if (doc && missDoc.length) p.push(`POS-API.md ขาด ${missDoc.length}: ${missDoc.slice(0, 4).join(",")}`);
    if (ep && missEp.length) p.push(`endpoints.md ขาด ${missEp.length}`);
    if (doc && !(/Idempotency-Key/.test(doc) && /confirm/.test(doc) && /satang/i.test(doc) && /unitId/.test(doc) && /pos\.sale\.paid/.test(doc))) p.push("POS-API.md ขาด Idempotency-Key/confirm/satang/unitId/webhooks pos.*");
    if (!/buildOpenApi|POS_OPS/.test(rd(F.devPage))) p.push(`ไม่มี ${F.devPage} (buildOpenApi/POS_OPS)`);
    if (!existsSync(join(ROOT, F.devMd))) p.push(`ไม่มี ${F.devMd}`);
    if (!/developers\/pos\b/.test(rd(F.devIndex))) p.push("/developers ไม่ลิงก์ /developers/pos");
    if (!/gen-pos-api-docs/.test(rd(F.fitness))) p.push("fitness.mts ไม่มีบล็อก F13 ของ POS (gen-pos-api-docs)");
    stNotes.ST4 = p;
  }
  // ST5 หมุด
  {
    const p: string[] = [];
    const raw = rd(F.contract);
    const h = raw ? sha256hex(raw) : "";
    if (h !== CONTRACT_SHA) p.push(`contract sha ${h.slice(0, 12) || "อ่านไม่ได้"} (คาด ${CONTRACT_SHA.slice(0, 12)})`);
    const prismaDiff = gitStr(["diff", "--name-only", MB, "--", "prisma/"]);
    if (prismaDiff === null) p.push(`git diff ${MB} ไม่ได้`);
    else if (prismaDiff.trim()) p.push(`prisma/ เปลี่ยน: ${prismaDiff.trim().split("\n").slice(0, 3).join(",")}`);
    const untracked = (gitStr(["ls-files", "--others", "--exclude-standard", "--", "prisma/"]) ?? "").trim();
    if (untracked) p.push(`prisma/ มีไฟล์ใหม่: ${untracked.split("\n")[0]}`);
    for (const f of [F.outbox, F.tools, F.pkg]) {
      const d = gitStr(["diff", "--name-only", MB, "--", f]);
      if (d && d.trim()) p.push(`${f} ถูกแก้`);
    }
    // createSale( ต่อไฟล์ = ฐาน ยกเว้น ops/sales.ts → 0
    const count = (src: string) => (stripComments(src).match(/\bcreateSale\s*\(/g) ?? []).length;
    const skip = (f: string) => f.endsWith(`${POS_DIR}/service.ts`) || f.endsWith("src/lib/contracts.ts");
    const now: Record<string, number> = {};
    for (const f of walk("src")) {
      if (skip(f)) continue;
      const n = count(rd(f));
      if (n) now[f] = n;
    }
    const base: Record<string, number> = {};
    const ls = gitBuf(["ls-tree", "-r", "--name-only", MB, "src/"]);
    if (!ls) p.push(`อ่านไฟล์ที่ ${MB} ไม่ได้`);
    else
      for (const f of ls.toString("utf8").split("\n").filter((x) => /\.(ts|tsx)$/.test(x))) {
        if (skip(f)) continue;
        const b = gitBuf(["show", `${MB}:${f}`]);
        const n = b ? count(b.toString("utf8")) : 0;
        if (n) base[f] = n;
      }
    const want: Record<string, number> = { ...base, [`${F.opsDir}/sales.ts`]: 0 };
    const diff = [...new Set([...Object.keys(now), ...Object.keys(want)])].filter((f) => (now[f] ?? 0) !== (want[f] ?? 0)).map((f) => `${f.replace("src/lib/", "")}:${want[f] ?? 0}→${now[f] ?? 0}`);
    if (diff.length) p.push(`createSale( ต่อไฟล์ ต่าง: ${diff.join(", ")}`);
    // ด่าน AI (ข้อความ)
    const sk = rd(F.skills);
    const at = sk.indexOf("export function toolAllowedForApiKey");
    const fnTxt = at < 0 ? "" : sk.slice(at, at + 4000).split(/\n\}\n/)[0] ?? "";
    // ORACLE-EDIT ผู้คุม POS 17 ต.ค. (P3.9 ST5): hunk ของ POS ใน toolAllowedForApiKey เป็นของ P3.9 แล้ว (derive จากทะเบียน · posToolAllowedForScopes) — เดิม `POS P2.13 ▸`
    if (!/POS P3\.9 ▸/.test(fnTxt) || !/posToolAllowedForScopes\(/.test(fnTxt)) p.push("toolAllowedForApiKey ไม่มี hunk `POS P3.9 ▸` (posToolAllowedForScopes)");
    st5PinsOk = h === CONTRACT_SHA && prismaDiff !== null && !prismaDiff.trim();
    stNotes.ST5 = p;
  }
  // ST6 ตารางคำปฏิเสธ (ข้อความ) — ส่วนค่าจริงเติมใน runDb
  {
    const p: string[] = [];
    const he = srcOf(F.httpErrors);
    if (!he) p.push(`ไม่มี ${F.httpErrors}`);
    else {
      if (!/Record\s*<\s*PosRefusalCode\s*,/.test(he)) p.push("POS_REFUSAL_HTTP ไม่ได้ประกาศเป็น Record<PosRefusalCode, …> (ครบด้วย typecheck)");
      if (!/export\s+(type|const)\s+PosRefusalCode|export\s+type\s*\{[^}]*PosRefusalCode/.test(he)) p.push("ไม่ export PosRefusalCode");
      if (!/export\s+const\s+POS_REFUSAL_HTTP\b/.test(he)) p.push("ไม่ export POS_REFUSAL_HTTP");
      if (!/export\s+function\s+toPosApiError\b/.test(he)) p.push("ไม่ export toPosApiError");
      const { codes, missing } = refusalCodes();
      if (missing.length) p.push(`อ่าน type ไม่ได้: ${missing.join(",")}`);
      const absent = [...codes].filter((c) => !new RegExp(`\\b${c}\\s*:`).test(he));
      if (absent.length) p.push(`ไม่มีแถว ${absent.length} รหัส: ${absent.slice(0, 6).join(",")}`);
    }
    stNotes.ST6 = p;
  }
}
function finishStatic(): void {
  for (const id of ["ST1", "ST2", "ST3", "ST4", "ST5", "ST6"]) {
    const p = stNotes[id] ?? ["ไม่ได้ตรวจ"];
    chk(id, p.length === 0, "ครบตามตารางชื่อ", joinP(p));
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
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failedN.length, failed: failedN, skipped: false, registered: CHECKS.length, st5Pins: st5PinsOk, mergeBase: MB, missing: skipReasons })}`);
  process.exit(failedN.length ? 1 : 0);
}

// ═════════════════════════ 2. env (QC4 เท่านั้น) ═════════════════════════
const envMod = (await import("./pos-qc-env.mjs" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
const TIDS = (envMod.PQC_TENANT_IDS as string[]) ?? [];
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
const FP_TABLES: [string, string][] = [["PosSale", "status"], ["PosOrder", "version"], ["PosProduct", "updatedAt"], ["SalesChannel", "updatedAt"]];
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [tb, col] of FP_TABLES) {
    try {
      const r = (await P.$queryRawUnsafe(
        `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || coalesce(x."${col}"::text, ''), ',' ORDER BY x.id)), '-') AS h
         FROM "${tb}" x WHERE NOT (x."tenantId" IN (SELECT id FROM "Tenant" WHERE slug LIKE 'posqc-p213-%'))`,
      )) as Any[];
      out[tb] = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 12)}`;
    } catch (e) {
      out[tb] = `err:${(e as Error).message.slice(0, 30)}`;
    }
  }
  try {
    const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n, coalesce(md5(string_agg(id || ':' || coalesce("revokedAt"::text,''), ',' ORDER BY id)), '-') AS h FROM "ApiKey" WHERE "tenantId" = ANY($1::text[])`, TIDS)) as Any[];
    out.ApiKeySeed = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 12)}`;
  } catch (e) {
    out.ApiKeySeed = `err:${(e as Error).message.slice(0, 30)}`;
  }
  return out;
}
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P2.13 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
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
const MISSING = "ยังไม่มีโมดูล/ฟังก์ชัน";
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  return m ? m[1]! : "THROW";
}
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `${MISSING} — ${name}`, missing: true };
  try {
    return await fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : r === undefined ? "undefined" : "UNKNOWN");
const route = existsSync(join(ROOT, F.route)) ? await tryImport("@/app/api/v1/pos/[...path]/route") : null;
const oaRoute = existsSync(join(ROOT, F.openapiRoute)) ? await tryImport("@/app/api/v1/pos/openapi.json/route") : null;
const mdRoute = existsSync(join(ROOT, F.devMd)) ? await tryImport("@/app/developers/pos.md/route") : null;
const regMod = await tryImport("@/lib/modules/pos/api/registry");
const keysMod = existsSync(join(ROOT, F.keys)) ? await tryImport("@/lib/modules/pos/api/keys") : null;
const heMod = existsSync(join(ROOT, F.httpErrors)) ? await tryImport("@/lib/modules/pos/api/http-errors") : null;
const runMod = await tryImport("@/lib/api/run");
const akSvc = await tryImport("@/lib/api-keys/service");
const scopesMod = await tryImport("@/lib/api-keys/scopes");
const skillsMod = await tryImport("@/lib/ai/skills");
const permMod = await tryImport("@/lib/core/permissions");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const invSvc = await tryImport("@/lib/modules/inventory/service");
const catalog = await tryImport("@/lib/modules/pos/catalog");
const regFacade = await tryImport("@/lib/modules/pos/register");
const chMod = await tryImport("@/lib/modules/pos/channel");
const orderMod = await tryImport("@/lib/modules/pos/order");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const billsMod = await tryImport("@/lib/modules/pos/bills");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const reportsMod = await tryImport("@/lib/modules/pos/reports");
const taxMod = await tryImport("@/lib/modules/pos/tax-invoice");
const receiptMod = await tryImport("@/lib/modules/pos/receipt");
const posIdx = await tryImport("@/lib/modules/pos");
const consMod = await tryImport("@/lib/outbox-consumers");
const apSvc = await tryImport("@/lib/modules/approval/service"); // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 fix 1) SA9
const legacySales = await tryImport("@/app/api/v1/sales/route");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p213-${RAND}`;
const T_SLUG = `posqc-p213-${RAND}`;
const T2_SLUG = `${T_SLUG}-t2`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";
let T2 = "";
const keyIds: string[] = [];

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
async function drain(n = 2): Promise<void> {
  for (let i = 0; i < n; i++) {
    try {
      if (typeof consMod?.drainAll === "function") await consMod.drainAll();
    } catch (e) {
      console.log(`  (drainAll ล้ม: ${(e as Error).message.slice(0, 100)})`);
    }
  }
}

// ── เรียก route ในโปรเซส (แบบ qc-kanban-k1.15) ──
type Res = { status: number; body: Any; headers: Headers; text: string; bom: boolean };
let idemN = 0;
const freshIdem = () => `p213-${RAND}-${++idemN}`;
async function api(method: string, path: string, key: string | null, opts: { body?: unknown; idem?: string | false; headers?: Record<string, string> } = {}): Promise<Res> {
  const fn = route?.[method];
  if (typeof fn !== "function") return { status: 0, body: { error: { code: "ROUTE_MISSING" } }, headers: new Headers(), text: "route ยังไม่มี", bom: false };
  const headers: Record<string, string> = { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(opts.headers ?? {}) };
  if (method !== "GET" && opts.idem !== false) headers["idempotency-key"] = opts.idem ?? freshIdem();
  let b: string | undefined;
  if (opts.body !== undefined) {
    b = JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
  }
  try {
    const res: Response = await fn(new Request(`http://x/api/v1/pos${path}`, { method, headers, body: b }), { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) });
    const buf = new Uint8Array(await res.arrayBuffer());
    const bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(buf);
    let body: Any = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { _raw: text };
    }
    return { status: res.status, body, headers: res.headers, text, bom };
  } catch (e) {
    return { status: -1, body: { error: { code: "THROW", message: (e as Error).message.slice(0, 160) } }, headers: new Headers(), text: "", bom: false };
  }
}
const ecode = (r: Res): string => String(r.body?.error?.code ?? "");
const st = (r: Res) => `${r.status}${ecode(r) ? `:${ecode(r)}` : ""}`;
/** PAR: ผล API ↔ ผล facade ตรง (สำเร็จ = data เดียวกัน · ปฏิเสธ = สถานะตาม §3) */
function parOf(r: Res, direct: Any): string | null {
  if (direct?.ok === true) {
    if (r.status !== 200) return `API ${st(r)} แต่ facade ok`;
    return sameData(r.body?.data, direct) ? null : `data ต่าง: api ${short(stable(r.body?.data), 90)} | facade ${short(stable(direct), 90)}`;
  }
  const exp = REFUSAL_EXPECT[String(direct?.code)];
  if (exp) return r.status === exp[0] && ecode(r) === exp[1] ? null : `facade ${direct?.code} → คาด ${exp[0]}:${exp[1]} ได้ ${st(r)}`;
  return r.status >= 400 && r.status < 500 ? null : `facade ${codeOf(direct)} → ได้ ${st(r)}`;
}

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
async function runDb() {
  assertQc4BeforeWrite();
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (+ ${T2_SLUG}) · DB ${HOST} ──`);
  let fx = "";
  const notes: string[] = [];
  const U: Record<string, string> = {};
  const S: Record<string, string> = {};
  const US: Record<string, { id: string; role: string; unitAccess: string[]; perms: Record<string, boolean> }> = {};
  const CH: Record<string, string> = {};
  const PR: Record<string, string> = {};
  const INV: Record<string, string> = {};
  const CHO: Record<string, string> = {};
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
  const PLU = "54321";
  const BARCODE = (() => {
    const b12 = `885${String(Date.now()).slice(-9)}`;
    let s = 0;
    for (let i = 0; i < 12; i++) s += (i % 2 === 0 ? 1 : 3) * (b12.charCodeAt(i) - 48);
    return b12 + String((10 - (s % 10)) % 10);
  })();
  const ean = (first12: string) => {
    let s = 0;
    for (let i = 0; i < 12; i++) s += (i % 2 === 0 ? 1 : 3) * (first12.charCodeAt(i) - 48);
    return first12 + String((10 - (s % 10)) % 10);
  };
  const WEIGHED = ean(`20${PLU}01250`); // 1,250 กรัม
  try {
    T = (await P.tenant.create({ data: { name: `QC P2.13 REST ${RAND}`, slug: T_SLUG } })).id;
    T2 = (await P.tenant.create({ data: { name: `QC P2.13 ร้านอื่น ${RAND}`, slug: T2_SLUG } })).id;
    U.A = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขาA`, slug: `${T_SLUG}-a` } })).id;
    U.B = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขาB`, slug: `${T_SLUG}-b` } })).id;
    U.C = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขาC (S2)`, slug: `${T_SLUG}-c` } })).id;
    U.X = (await P.businessUnit.create({ data: { tenantId: T2, type: "SHOP", name: `${TAG} สาขาX`, slug: `${T2_SLUG}-x` } })).id;
    S.POS = (await sysSvc.createSystem(T, "POS", `POS ${RAND}`)).id;
    S.POS2 = (await sysSvc.createSystem(T, "POS", `POS สอง ${RAND}`)).id;
    S.INV = (await sysSvc.createSystem(T, "INVENTORY", `คลัง ${RAND}`)).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี ${RAND}`)).id;
    S.KB = (await sysSvc.createSystem(T, "KANBAN", `บอร์ด ${RAND}`)).id;
    S.POSX = (await sysSvc.createSystem(T2, "POS", `POS T2 ${RAND}`)).id;
    await accSvc.saveSettings(T, S.ACC, { orgName: `ร้าน REST คิวซี ${RAND} จำกัด`, taxId: "0105561177639", vatRegistered: true });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POS } });
    await sysSvc.linkUnit(T, S.POS, U.A);
    await sysSvc.linkUnit(T, S.POS, U.B);
    await sysSvc.linkUnit(T, S.POS2, U.C);
    await sysSvc.linkUnit(T, S.INV, U.A);
    await sysSvc.linkUnit(T2, S.POSX, U.X);
    const s0 = (await P.appSystem.findUnique({ where: { id: S.POS }, select: { settings: true } }))?.settings ?? {};
    const pos0 = isRecord(s0.pos) ? s0.pos : {};
    await P.appSystem.update({ where: { id: S.POS }, data: { settings: { ...s0, pos: { ...pos0, weighedBarcode: { enabled: true, rules: [{ prefix: "20", kind: "WEIGHT" }] } } } } });
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  // ผู้ใช้ + Membership จริง (เจ้าของ · STAFF ผู้สร้างคีย์ที่ไม่มี pos.product.manage — PR4)
  if (!fx) {
    try {
      for (const [k, tid, role, ua, perms] of [
        ["OWNER", T, "OWNER", ["*"], {}],
        ["STAFFK", T, "STAFF", [U.A!], { "pos.sale.read": true }],
        ["OWNER2", T2, "OWNER", ["*"], {}],
      ] as const) {
        const u = await P.user.create({ data: { email: `${T_SLUG}-${k.toLowerCase()}@qc.invalid`, name: `${k} คิวซี${RAND}` } });
        await P.membership.create({ data: { userId: u.id, tenantId: tid, role, unitAccess: [...ua], permissions: perms, acceptedAt: new Date() } });
        US[k] = { id: u.id, role, unitAccess: [...ua], perms: { ...perms } };
      }
    } catch (e) {
      fx = `ผู้ใช้:${(e as Error).message.slice(0, 140)}`;
    }
  }
  const FXB = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const uid = (k: string) => US[k]?.id ?? `none-${k}`;
  const A = (k: string): Any => (US[k] ? { userId: US[k]!.id, role: US[k]!.role, unitAccess: [...US[k]!.unitAccess], permissions: { ...US[k]!.perms } } : { userId: `none-${k}`, role: "STAFF", unitAccess: [], permissions: {} });
  const cc = (k = "OWNER"): Any => ({ tenantId: T, systemId: S.POS ?? "none", actorUserId: uid(k) });
  const ctxU = (u: string, dev?: string): Any => ({ tenantId: u === "X" ? T2 : T, systemId: (u === "X" ? S.POSX : u === "C" ? S.POS2 : S.POS) ?? "none", unitId: U[u] ?? "none", ...(dev ? { deviceId: dev } : {}) });
  const invCtx = (): Any => ({ tenantId: T, systemId: S.INV ?? "none", actorUserId: uid("OWNER") });
  let keyN = 0;
  const newKey = (pfx = "k") => `qc213${RAND}${pfx}${++keyN}`;

  // ─── ช่องทาง ───
  if (!fx) {
    await step("ช่องทาง", async () => {
      for (const u of ["A", "B"]) {
        const r = await call(chMod, "ensureUnitChannels", P, { tenantId: T, systemId: S.POS, unitId: U[u] });
        if (Array.isArray(r)) for (const c of r) CH[`${c.code}_${u}`] = c.id;
      }
      const save = async (alias: string, input: Any) => {
        const r = must(`saveChannel ${alias}`, await call(chMod, "saveChannel", ctxU("A"), A("OWNER"), input));
        CH[alias] = String(r.channel?.id ?? "");
      };
      await save("LM", { code: "LINEMAN", name: `LINE MAN ${RAND}`, commissionBp: 3000 });
      await save("APP", { code: "CUSTOM_APP", name: `แอปคู่ค้า ${RAND}`, payout: "DIRECT", adapter: "API" });
      await save("WALK", { code: "CUSTOM_WALK", name: `สั่งล่วงหน้า ${RAND}`, payout: "DIRECT" });
    });
  }
  // ─── สินค้า: คลัง (น้ำ · เสื้อ) · เมนู+ตัวเลือก · ชั่ง · บาร์โค้ด ───
  const rowOf = async (invId: string): Promise<string> => String((await P.posProduct.findFirst({ where: { tenantId: T, systemId: S.POS, invItemId: invId }, select: { id: true } }).catch(() => null))?.id ?? "");
  if (!fx) {
    await step("สินค้า", async () => {
      const mkInv = async (key: string, name: string, qty: number, cost: number, price: number) => {
        const it = await invSvc.createItem(invCtx(), { sku: `${TAG}-${key}`, name: `${name} ${RAND}`, unitLabel: "ชิ้น", costSatang: cost });
        INV[key] = it.id;
        if (qty > 0) await invSvc.receive(invCtx(), { itemId: it.id, qty, costSatang: cost, idempotencyKey: `${TAG}-recv-${key}` });
        PR[key] = await rowOf(it.id);
        if (!PR[key]) throw new Error(`${key} ไม่มีแถว PosProduct`);
        must(`setPrice ${key}`, await call(catalog, "setPrice", cc(), PR[key], price));
      };
      await mkInv("water", "น้ำเปล่า", 200, 400, 1000);
      await mkInv("tee", "เสื้อยืด", 50, 8000, 20000);
      const grp = must("createOptionGroup", await call(catalog, "createOptionGroup", cc(), { unitId: U.A, name: `ความหวาน ${RAND}`, minSelect: 0, maxSelect: 1, choices: [{ name: "หวานน้อย", priceDelta: 0 }, { name: "เพิ่มช็อต", priceDelta: 1500 }] }));
      for (const c of (await P.menuOptionChoice.findMany({ where: { tenantId: T, groupId: grp.id } })) as Any[]) CHO[c.name === "เพิ่มช็อต" ? "shot" : "less"] = c.id;
      PR.latte = String(must("createProduct ลาเต้", await call(catalog, "createProduct", cc(), { name: `ลาเต้ ${RAND}`, kind: "MENU", basePriceSatang: 6500 }))?.id ?? "");
      must("optionGroups ลาเต้", await call(catalog, "setProductOptionGroups", cc(), PR.latte, [grp.id]));
      PR.beef = String(must("createProduct ชั่ง", await call(catalog, "createProduct", cc(), { name: `เนื้อชั่ง ${RAND}`, kind: "PRODUCT", basePriceSatang: 40000, soldByWeight: true, scalePlu: PLU }))?.id ?? "");
      PR.bar = String(must("createProduct บาร์โค้ด", await call(catalog, "createProduct", cc(), { name: `ขนมบาร์โค้ด ${RAND}`, kind: "PRODUCT", basePriceSatang: 2500, barcode: BARCODE }))?.id ?? "");
    });
  }
  // ─── เครื่อง + กะ (สาขา A) ───
  const DEV = `qc213${RAND}dev1`;
  let SHIFT = "";
  let DEVID = "";
  if (!fx) {
    await step("เครื่อง/กะ", async () => {
      const r = must("registerDevice", await call(devMod, "registerDevice", ctxU("A"), A("OWNER"), { name: `เคาน์เตอร์ REST ${RAND}`, deviceCode: DEV }));
      DEVID = String(r.device?.id ?? "");
      const o = must("openShift", await call(shiftMod, "openShift", ctxU("A", DEV), A("OWNER"), { deviceId: DEV, deviceLabel: `เคาน์เตอร์ REST ${RAND}`, floatSatang: 0 }));
      SHIFT = String(o.shift?.id ?? o.shiftId ?? "");
    });
  }
  await drain();

  // ─── คีย์ API ───
  const bundle = (id: string): string[] => {
    try {
      return scopesMod.expandBundles([id]);
    } catch {
      notes.push(`expandBundles(${id}) ไม่รู้จัก — ใช้ scope ตาม §2.1 แทน (ST1 แดงอยู่แล้ว)`);
      return (BUNDLE_SPEC[id] ?? []).filter((s) => typeof scopesMod?.isApiScope === "function" && scopesMod.isApiScope(s));
    }
  };
  const mkKey = async (label: string, scopes: string[], opts: { systemId?: string | null; tenantId?: string; createdById?: string } = {}): Promise<{ id: string; raw: string } | null> =>
    step(`createApiKey ${label}`, async () => {
      const k = await akSvc.createApiKey({ tenantId: opts.tenantId ?? T }, `QC P2.13 ${label} ${RAND}`, { scopes, systemId: opts.systemId === undefined ? S.POS : opts.systemId, ...(opts.createdById ? { createdById: opts.createdById } : {}) });
      keyIds.push(k.id);
      return { id: k.id as string, raw: k.rawKey as string };
    });
  const K: Record<string, { id: string; raw: string } | null> = {};
  if (!fx) {
    K.read = await mkKey("read", bundle("pos-read"));
    K.op = await mkKey("operate", bundle("pos-operate"));
    K.admin = await mkKey("admin", bundle("pos-admin"), { createdById: uid("STAFFK") });
    K.admin2 = await mkKey("admin2", bundle("pos-admin"));
    K.rl = await mkKey("rate", bundle("pos-operate"));
    K.unbound = await mkKey("unbound", bundle("pos-read"), { systemId: null });
    K.kanban = await mkKey("kanban-bound", bundle("pos-read"), { systemId: S.KB });
    K.expired = await mkKey("expired", bundle("pos-read"));
    K.legacy = await mkKey("legacy", [], { systemId: null });
    K.filter = await mkKey("filter-A", [...bundle("pos-read"), `${FILTER_PREFIX}${U.A}`]);
    K.mgr = await mkKey("manage-only", ["pos.sale.read", "pos.product.manage"]);
    K.reject = await mkKey("reject-no-void", ["pos.sale.read", "pos.order.reject"]);
    if (K.expired) await step("expire", () => P.$executeRawUnsafe(`UPDATE "ApiKey" SET "expiresAt" = now() - interval '1 minute' WHERE id = $1 AND "tenantId" = $2`, K.expired!.id, T));
  }
  const raw = (k: string) => K[k]?.raw ?? `shark_none_${k}`;
  // scope จริงของคีย์ (จากแถว) → actor สังเคราะห์ของมติ 3: {userId: keyId, role STAFF, unitAccess ["*"] | ตัวกรอง, permissions = scope}
  const SCOPES: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(K)) if (v) SCOPES[k] = ((await P.apiKey.findUnique({ where: { id: v.id }, select: { scopesJson: true } }))?.scopesJson as string[] | undefined) ?? [];
  const synthOf = (k: string, unitAccess: string[] = ["*"]): Any => ({
    userId: K[k]?.id ?? `none-${k}`,
    role: "STAFF",
    unitAccess,
    permissions: Object.fromEntries((SCOPES[k] ?? []).filter((s) => !s.startsWith(FILTER_PREFIX)).map((s) => [s, true])),
  });
  const salesOfT = async (): Promise<number> => Number(await P.posSale.count({ where: { tenantId: T } }).catch(() => -1));
  const today = String(posIdx?.bkkToday?.() ?? new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10));
  const minus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  const FROM = minus(today, 6);
  type Line = { code: string; debit: number; credit: number };
  const jvOf = async (saleId: string): Promise<{ key: string; lines: Line[] }[]> =>
    ((await P.accountJournalEntry.findMany({ where: { tenantId: T, refType: "PosSale", refId: saleId }, include: { lines: { include: { account: { select: { code: true } } } } }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]).map((e) => ({
      key: String(e.idempotencyKey ?? ""),
      lines: (e.lines ?? []).map((l: Any) => ({ code: String(l.account?.code ?? "?"), debit: Number(l.debit), credit: Number(l.credit) })),
    }));
  const jvShape = (es: { lines: Line[] }[]): string => {
    const m = new Map<string, [number, number]>();
    for (const l of es.flatMap((e) => e.lines)) {
      const a = m.get(l.code) ?? [0, 0];
      m.set(l.code, [a[0] + l.debit, a[1] + l.credit]);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([c, [d, k]]) => `${c}:${d}/${k}`).join(" ");
  };
  const jvNet = (es: { lines: Line[] }[]): string => {
    const m: Record<string, number> = {};
    for (const l of es.flatMap((e) => e.lines)) m[l.code] = (m[l.code] ?? 0) + l.debit - l.credit;
    return Object.entries(m).filter(([, v]) => v !== 0).map(([k, v]) => `${k}:${v}`).join(" ");
  };
  /** การเคลื่อนไหวสต็อกของบิล/ใบคืน (รวมหลาย id · ไม่นับซ้ำแถวเดียวกัน) */
  const movesOf = async (saleIds: string | string[], itemId: string): Promise<number[]> => {
    const ids = (Array.isArray(saleIds) ? saleIds : [saleIds]).filter(Boolean);
    if (!ids.length || !itemId) return [];
    const rows = (await P.invMovement.findMany({ where: { tenantId: T, itemId, OR: ids.flatMap((id) => [{ refId: id }, { idempotencyKey: { contains: id } }]) } }).catch(() => [])) as Any[];
    return [...new Map(rows.map((m) => [m.id, m])).values()].map((m) => Number(m.qtyDelta));
  };
  const saleRow = async (id: string): Promise<Any> => (id ? await P.posSale.findFirst({ where: { id, tenantId: T }, include: { lines: { orderBy: { id: "asc" } }, payments: true } }).catch(() => null) : null);
  const auditN = async (where: Any) => Number(await P.auditLog.count({ where: { tenantId: T, ...where } }).catch(() => -1));
  const outboxN = async (type: string, extra: Any = {}) => Number(await P.outboxEvent.count({ where: { tenantId: T, type, ...extra } }).catch(() => -1));

  // ตะกร้ามาตรฐาน (SA1/SA2): น้ำ ×2 · ลาเต้ + เพิ่มช็อต · เนื้อชั่ง (ป้าย 1,250 กรัม)
  const cartLines = (): Any[] => [
    { productId: PR.water, qty: 2 },
    { productId: PR.latte, qty: 1, options: [{ choiceId: CHO.shot }] },
    { productId: PR.beef, qty: 1, weighedBarcode: WEIGHED },
  ];
  const directQuote = async (lines: Any[]) => call(regFacade, "quoteRegisterCart", ctxU("A"), A("OWNER"), { lines });
  const q0 = fx ? null : await directQuote(cartLines());
  const TOTAL = Number(q0?.grandTotalSatang ?? 0);
  if (!fx && q0?.ok !== true) notes.push(`quoteRegisterCart ตะกร้ามาตรฐาน: ${codeOf(q0)} ${short(q0?.message ?? "", 80)}`);
  const saleBody = (extra: Any = {}): Any => ({ unitId: U.A, lines: cartLines(), payMethods: [{ type: "CASH", amountSatang: TOTAL }], cashReceivedSatang: TOTAL, expectedGrandTotalSatang: TOTAL, ...extra });
  const waterBody = (qty = 1, extra: Any = {}): Any => ({ unitId: U.A, lines: [{ productId: PR.water, qty }], payMethods: [{ type: "CASH", amountSatang: 1000 * qty }], cashReceivedSatang: 1000 * qty, expectedGrandTotalSatang: 1000 * qty, ...extra });
  /** บิลหน้าขายด้วยเจ้าของ (คู่ PAR / ฟิกซ์เจอร์) */
  const regSale = async (lines: Any[], total: number): Promise<Any> =>
    call(regFacade, "submitRegisterSale", ctxU("A"), A("OWNER"), { lines, payMethods: [{ type: "CASH", amountSatang: total }], cashReceivedSatang: total, expectedGrandTotalSatang: total, idempotencyKey: newKey("reg") });

  // ════════ ST (ส่วน DB) ════════
  {
    const p = stNotes.ST1 ?? [];
    const ops: Any[] = Array.isArray(regMod?.POS_OPS) ? regMod.POS_OPS : [];
    if (!ops.length) p.push("POS_OPS โหลดไม่ได้");
    for (const o of ops) {
      if (o.module !== "pos" || o.auditAction !== `pos.api.${o.id}`) p.push(`${o.id} module/auditAction`);
      if (typeof permMod?.isPermissionKey === "function" && !permMod.isPermissionKey(o.action)) p.push(`${o.id} scope ${o.action} ไม่ใช่คีย์สิทธิ์จริง`);
      if (o.input && typeof runMod?.validateOpInput === "function") {
        const probe = runMod.validateOpInput(o, { __qcExtra: 1 });
        if (probe.ok) p.push(`${o.id} input ไม่ strict`);
      }
    }
    const sc = ops.find((o) => o.id === "sales.create");
    if (sc?.input?.safeParse) {
      const p02 = sc.input.safeParse({ unitId: "u1", lines: [{ name: "API", qty: 1, unitPriceSatang: 1000 }], payMethods: [{ type: "CASH", amountSatang: 1000 }] });
      if (p02?.success !== true) p.push("sales.create ปฏิเสธรูป P0.2 (กำหนดเอง ไม่มี expectedGrandTotalSatang) — p2.9 O2 / p2.9b P6 จะแดง");
    }
    const bundles: Any[] = Array.isArray(scopesMod?.API_SCOPE_BUNDLES) ? scopesMod.API_SCOPE_BUNDLES : [];
    for (const [bid, want] of Object.entries(BUNDLE_SPEC)) {
      const b = bundles.find((x) => x.id === bid);
      const have = [...(b?.scopes ?? [])].sort().join(",");
      if (have !== [...want].sort().join(",")) p.push(`${bid} = [${have}] (คาด §2.1)`);
    }
    if (typeof scopesMod?.isApiScope === "function" && !scopesMod.isApiScope(`${FILTER_PREFIX}${U.A ?? "unitqc000001"}`)) p.push(`isApiScope(${FILTER_PREFIX}<id>) = false`);
    if (!Array.isArray(scopesMod?.POS_SCOPE_KEYS) || !POS_ADMIN.filter((s) => s !== "pos.report.anomaly").every((s) => scopesMod.POS_SCOPE_KEYS.includes(s))) p.push("POS_SCOPE_KEYS ขาด");
    stNotes.ST1 = p;
  }
  {
    const p = stNotes.ST3 ?? [];
    const fn = keysMod?.posApiServiceKey;
    if (typeof fn !== "function") p.push("posApiServiceKey โหลดไม่ได้");
    else {
      const v = fn("keyAbc123", "idem-1");
      const want = `api_${sha256hex("keyAbc123\nidem-1").slice(0, 64)}`;
      if (v !== want) p.push(`posApiServiceKey = ${short(v, 40)} (คาด ${want.slice(0, 16)}…)`);
      if (!/^[A-Za-z0-9_-]{8,100}$/.test(String(v))) p.push("คีย์ผิดชุดอักษรของหน้าขาย");
    }
    stNotes.ST3 = p;
  }
  {
    const p = stNotes.ST4 ?? [];
    if (typeof oaRoute?.GET !== "function") p.push("openapi.json route โหลดไม่ได้");
    else {
      try {
        const spec = await (await oaRoute.GET(new Request("http://x/api/v1/pos/openapi.json"))).json();
        const n = Object.values(spec?.paths ?? {}).reduce((a: number, v: Any) => a + Object.keys(v ?? {}).length, 0);
        if (n !== OPS_SPEC.length) p.push(`openapi ${n} operation (คาด ${OPS_SPEC.length})`);
      } catch (e) {
        p.push(`openapi.json: ${(e as Error).message.slice(0, 60)}`);
      }
    }
    if (typeof mdRoute?.GET !== "function") p.push("pos.md route โหลดไม่ได้");
    else {
      const t = await (await mdRoute.GET(new Request("http://x/developers/pos.md"))).text().catch(() => "");
      if (t !== rd(F.doc)) p.push(`pos.md ≠ ${F.doc}`);
    }
    stNotes.ST4 = p;
  }
  {
    const p = stNotes.ST5 ?? [];
    const allow = skillsMod?.toolAllowedForApiKey;
    if (typeof allow !== "function") p.push("toolAllowedForApiKey โหลดไม่ได้");
    else {
      const cases: [string, string[], boolean][] = [
        // ORACLE-EDIT ผู้คุม POS 17 ต.ค. (P3.9 ST5): sales_summary/sales_by_day ⇐ pos.report.view (op.action ของทะเบียน) — เดิม ⇐ pos.sale.read
        ["sales_summary", ["kanban.card.read"], false], ["sales_summary", ["pos.report.view"], true], ["sales_summary", ["pos.sale.read"], false], ["sales_by_day", ["account.doc.read"], false], ["sales_by_day", ["pos.report.view"], true],
        ["pos_create_sale", ["pos.sale.read"], false], ["pos_create_sale", ["pos.sale.create"], true], ["void_sale", ["pos.sale.create"], false], ["void_sale", ["pos.sale.void"], true],
      ];
      for (const [t, s, want] of cases) {
        let got: unknown;
        try {
          got = allow(t, s);
        } catch (e) {
          got = `throw ${(e as Error).message.slice(0, 30)}`;
        }
        if (got !== want) p.push(`${t}[${s.join(",")}]=${String(got)} (คาด ${want})`);
      }
    }
    stNotes.ST5 = p;
  }
  {
    const p = stNotes.ST6 ?? [];
    const map = heMod?.POS_REFUSAL_HTTP;
    if (!isRecord(map)) p.push("POS_REFUSAL_HTTP โหลดไม่ได้");
    else {
      const { codes } = refusalCodes();
      const absent = [...codes].filter((c) => !isRecord(map[c]));
      if (absent.length) p.push(`ไม่มีแถว ${absent.slice(0, 6).join(",")}`);
      for (const [c, v] of Object.entries(map)) {
        if (!isRecord(v) || typeof v.en !== "string" || !v.en.trim() || !ASCII.test(v.en)) p.push(`${c} en ไม่ใช่ ASCII`);
        const exp = REFUSAL_EXPECT[c];
        if (exp && isRecord(v) && (v.status !== exp[0] || v.code !== exp[1])) p.push(`${c} → ${v.status}:${v.code} (คาด ${exp[0]}:${exp[1]})`);
        if (/_TAKEN$/.test(c) && isRecord(v) && (v.status !== 409 || v.code !== "duplicate")) p.push(`${c} ไม่ใช่ 409 duplicate`);
      }
      if (!isRecord(map.INTERNAL) || map.INTERNAL.status !== INTERNAL_STATUS) p.push(`INTERNAL → ${map.INTERNAL?.status} (คาด 500)`);
    }
    stNotes.ST6 = p;
  }
  finishStatic();

  // ════════ AU ════════
  console.log("\n── AU ด่านหน้า ──");
  {
    const s0 = await salesOfT();
    const a = await api("GET", `/units`, null);
    const b = await api("POST", `/sales`, null, { body: waterBody() });
    chk("AU1", a.status === 401 && ecode(a) === "unauthorized" && b.status === 401 && (await salesOfT()) === s0, "401/401 · 0 บิล", FXB(`${st(a)} / ${st(b)}`));
  }
  {
    const r = await api("GET", `/units`, raw("expired"));
    chk("AU2", r.status === 401 && ecode(r) === "key_expired", "401 key_expired", FXB(st(r)));
  }
  {
    const r = await api("GET", `/units`, raw("kanban"));
    chk("AU3", r.status === 403 && ecode(r) === "system_mismatch", "403 system_mismatch", FXB(st(r)));
  }
  {
    const r = await api("GET", `/units`, raw("read"), { headers: { "x-shark-system": S.POS2 ?? "x" } });
    const ok = await api("GET", `/units`, raw("read"));
    chk("AU4", r.status === 403 && ecode(r) === "system_mismatch" && ok.status === 200, "403 / 200", FXB(`${st(r)} / ${st(ok)}`));
  }
  {
    const a = await api("GET", `/units`, raw("unbound"));
    const b = await api("GET", `/units`, raw("unbound"), { headers: { "x-shark-system": S.POS ?? "x" } });
    const c = await api("GET", `/units`, raw("unbound"), { headers: { "x-shark-system": S.KB ?? "x" } });
    chk("AU5", a.status === 400 && ecode(a) === "system_required" && b.status === 200 && c.status === 403 && ecode(c) === "system_mismatch", "400 / 200 / 403", FXB(`${st(a)} / ${st(b)} / ${st(c)}`));
  }
  {
    const s0 = await salesOfT();
    const w = await api("POST", `/sales`, raw("read"), { body: waterBody() });
    const r = await api("GET", `/sales?unitId=${U.A}&date=${today}`, raw("read"));
    const hint = String(w.body?.error?.hint ?? "");
    chk("AU6", w.status === 403 && ecode(w) === "scope_missing" && hint.includes("pos.sale.create") && r.status === 200 && (await salesOfT()) === s0, "403 + hint · GET 200 · 0 บิล", FXB(`${st(w)} hint=${short(hint, 40)} · ${st(r)}`));
  }
  {
    const p: string[] = [];
    for (const [label, unit] of [["S2", U.C], ["t2", U.X], ["มั่ว", `nope${RAND}`]] as const) {
      for (const [m, path, body] of [
        ["GET", `/sales?unitId=${unit}&date=${today}`, undefined],
        ["GET", `/products?unitId=${unit}`, undefined],
        ["GET", `/orders?unitId=${unit}`, undefined],
        ["POST", `/sales`, { ...waterBody(), unitId: unit }],
      ] as const) {
        const r = await api(m, path, raw("admin"), body ? { body } : {});
        if (!(r.status === 404 && ecode(r) === "not_found")) p.push(`${label} ${m} ${path.split("?")[0]} → ${st(r)}`);
      }
    }
    const pos = await api("GET", `/products?unitId=${U.A}`, raw("admin"));
    if (pos.status !== 200) p.push(`ตัวควบคุมบวก A → ${st(pos)}`);
    chk("AU7", p.length === 0, "404 ×12 · A 200", FXB(joinP(p)));
  }
  // บิล API ของรอบนี้ (ใช้ใน AU8 · RP) — ขายด้วย admin2
  const apiSale1 = fx ? null : await api("POST", `/sales`, raw("admin2"), { body: waterBody(1) });
  const API_SALE1 = String(apiSale1?.body?.data?.saleId ?? "");
  {
    const p: string[] = [];
    const hdr = { "x-shark-system": S.POS ?? "x" };
    for (const [m, path, body] of [
      ["GET", `/units`, undefined],
      ["GET", `/sales?unitId=${U.A}&date=${today}`, undefined],
      ["GET", `/reports/daily?from=${FROM}&to=${today}`, undefined],
      ["POST", `/sales`, waterBody()],
    ] as const) {
      const r = await api(m, path, raw("legacy"), { headers: hdr, ...(body ? { body } : {}) });
      if (!(r.status === 403 && ecode(r) === "scope_missing")) p.push(`${m} ${path.split("?")[0]} → ${st(r)}`);
    }
    let leg = "ไม่มี route เดิม";
    if (typeof legacySales?.GET === "function") {
      const r: Response = await legacySales.GET(new Request("http://x/api/v1/sales?take=50", { headers: { authorization: `Bearer ${raw("legacy")}` } }));
      const t = await r.text();
      leg = `${r.status}${API_SALE1 && t.includes(API_SALE1) ? " มีบิล API" : " ไม่มีบิล API"}`;
      if (r.status !== 200 || !API_SALE1 || !t.includes(API_SALE1)) p.push(`/api/v1/sales เดิม → ${leg}`);
    } else p.push(leg);
    chk("AU8", p.length === 0, "403 scope_missing ×4 · /api/v1/sales 200 มีบิล API", FXB(joinP(p, leg)));
  }

  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 fix 1) AU9 (F3/H2): API ไม่ผ่านด่านผู้จัดการของการยืนยันจ่ายมือ แม้คีย์มี pos.shift.manage (option b)
  {
    const p: string[] = [];
    const readSet = async (): Promise<Any> => (await P.appSystem.findUnique({ where: { id: S.POS ?? "none" }, select: { settings: true } }).catch(() => null))?.settings ?? {};
    const setManual = async (on: boolean) => {
      const cur = await readSet();
      const pos = isRecord(cur.pos) ? cur.pos : {};
      const pay = isRecord(pos.payment) ? pos.payment : {};
      await P.appSystem.update({ where: { id: S.POS }, data: { settings: { ...cur, pos: { ...pos, payment: { ...pay, manualConfirmRequiresManager: on } } } } });
    };
    if (!fx) await step("AU9 เปิด manualConfirmRequiresManager", () => setManual(true));
    if (!(SCOPES.op ?? []).includes("pos.shift.manage")) p.push("(ฟิกซ์เจอร์) คีย์ pos-operate ไม่มี pos.shift.manage — ข้อนี้ตัดสินไม่ได้");
    const s0 = await salesOfT();
    const pp = await api("POST", `/sales`, raw("op"), { body: waterBody(1, { payMethods: [{ type: "PROMPTPAY", amountSatang: 1000 }], cashReceivedSatang: undefined }) });
    if (!(pp.status === 403 && ecode(pp) === "forbidden")) p.push(`พร้อมเพย์ไม่อ้าง pi_ → ${st(pp)}`);
    const cd = await api("POST", `/sales`, raw("op"), { body: waterBody(1, { payMethods: [{ type: "CARD", amountSatang: 1000, reference: "EDC-0009" }], cashReceivedSatang: undefined }) });
    if (!(cd.status === 403 && ecode(cd) === "forbidden")) p.push(`บัตร → ${st(cd)}`);
    if ((await salesOfT()) !== s0) p.push(`บิล +${(await salesOfT()) - s0}`);
    const cash = await api("POST", `/sales`, raw("op"), { body: waterBody(1) });
    if (cash.status !== 200) p.push(`ตัวควบคุมบวก เงินสด → ${st(cash)}`);
    if (!fx) await step("AU9 ปิด manualConfirmRequiresManager", () => setManual(false));
    chk("AU9", p.length === 0, "403 ×2 · 0 บิล · เงินสด 200", FXB(joinP(p)));
  }

  // ════════ RL ════════
  console.log("\n── RL เพดานอัตรา ──");
  {
    const p: string[] = [];
    const kid = K.rl?.id ?? "none";
    const ok1 = await api("POST", `/channels/${CH.WALK ?? "none"}/resume`, raw("rl"), { body: { unitId: U.A } });
    if (ok1.status !== 200) p.push(`write แรก ${st(ok1)}`);
    if (ok1.headers.get("x-ratelimit-limit") !== "60") p.push(`X-RateLimit-Limit write = ${ok1.headers.get("x-ratelimit-limit")}`);
    const rdr = await api("GET", `/units`, raw("rl"));
    if (rdr.headers.get("x-ratelimit-limit") !== "300") p.push(`X-RateLimit-Limit read = ${rdr.headers.get("x-ratelimit-limit")}`);
    const rep = await api("GET", `/reports/daily?from=${FROM}&to=${today}`, raw("rl"));
    if (rep.headers.get("x-ratelimit-limit") !== "30") p.push(`X-RateLimit-Limit report = ${rep.headers.get("x-ratelimit-limit")}`);
    const n = Number(await P.$executeRawUnsafe(`UPDATE "ChatRateBucket" SET count = 60 WHERE key = $1`, `pos:api:write:${kid}`).catch(() => 0));
    if (n !== 1) p.push(`ไม่มีถัง pos:api:write:<keyId> (${n} แถว)`);
    const s0 = await salesOfT();
    const r = await api("POST", `/sales`, raw("rl"), { body: waterBody() });
    if (!(r.status === 429 && ecode(r) === "rate_limited" && Number(r.headers.get("retry-after")) > 0)) p.push(`คำขอที่ 61 → ${st(r)} retry-after=${r.headers.get("retry-after")}`);
    if ((await salesOfT()) !== s0) p.push("มีบิลเกิด");
    chk("RL1", p.length === 0, "429 + Retry-After · หัวเพดาน 60/300/30", FXB(joinP(p)));
    const r2 = await api("GET", `/units`, raw("rl"));
    const other = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE $1 AND key NOT LIKE 'pos:api:%'`, `%:api:%:${kid}`).catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? -1);
    chk("RL2", r2.status === 200 && other === 0, "read 200 · ถังโมดูลอื่น 0", FXB(`${st(r2)} · ถังอื่น ${other}`));
  }

  // ════════ ID ════════
  console.log("\n── ID กันซ้ำ ──");
  {
    const s0 = await salesOfT();
    const r = await api("POST", `/sales`, raw("admin"), { body: waterBody(), idem: false });
    chk("ID1", r.status === 400 && ecode(r) === "idempotency_required" && (await salesOfT()) === s0, "400 · 0 บิล", FXB(st(r)));
  }
  const IDEM = `p213-${RAND}-same`;
  let ID_SALE = "";
  {
    const p: string[] = [];
    const s0 = await salesOfT();
    const a = await api("POST", `/sales`, raw("admin"), { body: waterBody(1), idem: IDEM });
    const b = await api("POST", `/sales`, raw("admin"), { body: waterBody(1), idem: IDEM });
    ID_SALE = String(a.body?.data?.saleId ?? "");
    if (a.status !== 200 || !ID_SALE) p.push(`ครั้งแรก ${st(a)}`);
    if (b.status !== 200 || b.body?.data?.saleId !== ID_SALE || b.headers.get("idempotent-replayed") !== "true") p.push(`ครั้งที่สอง ${st(b)} replay=${b.headers.get("idempotent-replayed")}`);
    if ((await salesOfT()) !== s0 + 1) p.push(`บิล +${(await salesOfT()) - s0}`);
    const row = await saleRow(ID_SALE);
    const sk = `api_${sha256hex(`${K.admin?.id ?? ""}\n${IDEM}`).slice(0, 64)}`;
    if (row && !(String(row.idempotencyKey).endsWith(sk) && row.sourceModule === "API" && row.sourceId === K.admin?.id && row.soldByUserId === K.admin?.id)) p.push(`แถวบิล key=${short(row.idempotencyKey, 30)} src=${row.sourceModule}/${row.sourceId === K.admin?.id} soldBy=${row.soldByUserId === K.admin?.id}`);
    await P.apiIdempotency.deleteMany({ where: { tenantId: T, keyId: K.admin?.id ?? "none", idemKey: IDEM } }).catch(() => {});
    const c = await api("POST", `/sales`, raw("admin"), { body: waterBody(1), idem: IDEM });
    if (c.status !== 200 || c.body?.data?.saleId !== ID_SALE) p.push(`หลังลบแถวกันซ้ำ ${st(c)} saleId=${c.body?.data?.saleId === ID_SALE ? "เดิม" : short(c.body?.data?.saleId, 20)}`);
    if ((await salesOfT()) !== s0 + 1) p.push("หลัง TTL เกิดบิลที่สอง");
    chk("ID2", p.length === 0, "saleId เดิม + replay · 1 บิล · service key", FXB(joinP(p)));
  }
  {
    const s0 = await salesOfT();
    const r = await api("POST", `/sales`, raw("admin"), { body: waterBody(2), idem: `${IDEM}-c` });
    const r2 = await api("POST", `/sales`, raw("admin"), { body: waterBody(3), idem: `${IDEM}-c` });
    chk("ID3", r.status === 200 && r2.status === 409 && ecode(r2) === "idempotency_conflict" && (await salesOfT()) === s0 + 1, "200 แล้ว 409 · 1 บิล", FXB(`${st(r)} / ${st(r2)}`));
  }
  {
    const s0 = await salesOfT();
    const k = `p213-${RAND}-two`;
    const a = await api("POST", `/sales`, raw("admin"), { body: waterBody(1), idem: k });
    const b = await api("POST", `/sales`, raw("admin2"), { body: waterBody(1), idem: k });
    const ra = await saleRow(String(a.body?.data?.saleId ?? ""));
    const rb = await saleRow(String(b.body?.data?.saleId ?? ""));
    chk("ID4", a.status === 200 && b.status === 200 && !!ra && !!rb && ra.id !== rb.id && ra.idempotencyKey !== rb.idempotencyKey && (await salesOfT()) === s0 + 2, "2 บิล คีย์ต่างกัน", FXB(`${st(a)} / ${st(b)} · +${(await salesOfT()) - s0}`));
  }
  {
    const s0 = await salesOfT();
    const k = `p213-${RAND}-race`;
    const rs = await Promise.all([0, 1].map(() => api("POST", `/sales`, raw("admin"), { body: waterBody(1), idem: k })));
    const okish = rs.every((r) => r.status === 200 || (r.status === 409 && ecode(r) === "idempotency_in_progress"));
    const ids = new Set(rs.filter((r) => r.status === 200).map((r) => r.body?.data?.saleId));
    chk("ID5", okish && rs.some((r) => r.status === 200) && ids.size === 1 && (await salesOfT()) === s0 + 1, "1 บิล · 200/409 in_progress", FXB(`${rs.map(st).join(",")} · +${(await salesOfT()) - s0}`));
  }

  // ════════ SA ════════
  console.log("\n── SA ขาย ──");
  let SA_SALE = "";
  {
    const p: string[] = [];
    const a = fx ? null : await api("POST", `/sales`, raw("admin"), { body: saleBody() });
    SA_SALE = String(a?.body?.data?.saleId ?? "");
    const reg = fx ? null : await regSale(cartLines(), TOTAL);
    const REG = String(reg?.saleId ?? "");
    if (!a || a.status !== 200) p.push(`API ${a ? st(a) : "-"} ${short(a?.body?.error?.message_th ?? "", 60)}`);
    if (reg?.ok !== true) p.push(`หน้าขาย ${codeOf(reg)} ${short(reg?.message ?? "", 60)}`);
    await drain();
    const x = await saleRow(SA_SALE);
    const y = await saleRow(REG);
    if (x && y) {
      for (const f of ["grandTotalSatang", "vatSatang", "subtotalSatang", "discountSatang", "docType", "status"]) if (x[f] !== y[f]) p.push(`${f} ${x[f]}≠${y[f]}`);
      const ln = (s: Any) => stable((s.lines ?? []).map((l: Any) => ({ productId: l.productId, qty: l.qty, unitPriceSatang: l.unitPriceSatang, lineTotalSatang: l.lineTotalSatang, itemId: l.itemId })).sort((m: Any, n: Any) => String(m.productId).localeCompare(String(n.productId))));
      if (ln(x) !== ln(y)) p.push("บรรทัดต่าง");
      const pm = (s: Any) => stable((s.payments ?? []).map((q: Any) => ({ type: q.type, amountSatang: q.amountSatang })));
      if (pm(x) !== pm(y)) p.push("วิธีจ่ายต่าง");
      const jx = jvShape(await jvOf(x.id));
      const jy = jvShape(await jvOf(y.id));
      if (!jx || jx !== jy) p.push(`JV ${short(jx, 60)} ≠ ${short(jy, 60)}`);
      for (const it of ["water"]) {
        const mx = sum(await movesOf(x.id, INV[it] ?? ""));
        const my = sum(await movesOf(y.id, INV[it] ?? ""));
        if (mx !== my || mx !== -2) p.push(`สต็อก ${it} ${mx} vs ${my} (คาด −2)`);
      }
      if (x.grandTotalSatang !== TOTAL) p.push(`ยอด ${x.grandTotalSatang} ≠ quote ${TOTAL}`);
    } else p.push(`แถวบิล api=${!!x} reg=${!!y}`);
    chk("SA1", p.length === 0, "ยอด/VAT/บรรทัด/จ่าย/JV/สต็อก เท่ากัน", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const s0 = await salesOfT();
    const i0 = Number(await P.apiIdempotency.count({ where: { tenantId: T } }).catch(() => -1));
    const r = await api("POST", `/sales/quote`, raw("op"), { body: { unitId: U.A, lines: cartLines() }, idem: false });
    if (r.status !== 200) p.push(`quote ${st(r)}`);
    const g = Number(r.body?.data?.grandTotalSatang ?? r.body?.data?.totals?.grandTotalSatang ?? NaN);
    if (g !== TOTAL || !TOTAL) p.push(`quote ${g} ≠ quoteRegisterCart ${TOTAL}`);
    if ((await salesOfT()) !== s0) p.push("quote สร้างบิล");
    if (Number(await P.apiIdempotency.count({ where: { tenantId: T } }).catch(() => -1)) !== i0) p.push("quote สร้างแถวกันซ้ำ");
    const x = await saleRow(SA_SALE);
    if (!x || x.grandTotalSatang !== g) p.push(`บิล SA1 ${x?.grandTotalSatang} ≠ quote ${g}`);
    chk("SA2", p.length === 0, "quote = facade · ไม่เขียน", FXB(joinP(p)));
  }
  {
    const s0 = await salesOfT();
    const custom = { unitId: U.A, lines: [{ name: `ค่าบริการพิเศษ ${RAND}`, qty: 1, unitPriceSatang: 5000 }], payMethods: [{ type: "CASH", amountSatang: 5000 }], cashReceivedSatang: 5000, expectedGrandTotalSatang: 5000 };
    const r = await api("POST", `/sales`, raw("op"), { body: custom });
    const s1 = await salesOfT();
    const ok = await api("POST", `/sales`, raw("admin"), { body: custom });
    chk("SA3", r.status === 403 && ecode(r) === "forbidden" && s1 === s0 && ok.status === 200, "403 forbidden · 0 บิล · admin 200", FXB(`${st(r)} · +${s1 - s0} · admin ${st(ok)}`));
  }
  {
    const s0 = await salesOfT();
    const a = await api("POST", `/sales`, raw("admin"), { body: waterBody(1, { payMethods: [{ type: "CASH", amountSatang: 900 }], cashReceivedSatang: 900 }) });
    const b = await api("POST", `/sales`, raw("admin"), { body: waterBody(1, { expectedGrandTotalSatang: 1100, payMethods: [{ type: "CASH", amountSatang: 1100 }], cashReceivedSatang: 1100 }) });
    chk("SA4", a.status === 422 && ecode(a) === "validation" && b.status === 409 && ecode(b) === "state_conflict" && (await salesOfT()) === s0, "422 / 409 · 0 บิล", FXB(`${st(a)} / ${st(b)}`));
  }
  {
    const p: string[] = [];
    const s0 = await salesOfT();
    for (const pm of [{ type: "GIFT_CARD", amountSatang: 1000 }, { type: "STORE_CREDIT", amountSatang: 1000 }, { type: "DEPOSIT", amountSatang: 1000 }, { type: "ROOM_CHARGE", amountSatang: 1000 }]) {
      const r = await api("POST", `/sales`, raw("admin"), { body: waterBody(1, { payMethods: [pm], cashReceivedSatang: undefined }) });
      if (!(r.status === 422 && ecode(r) === "validation")) p.push(`${pm.type} → ${st(r)}`);
    }
    for (const extra of [{ memberId: "m1" }, { couponCode: "WELCOME" }, { staffToken: "t" }, { managerPin: "1234", managerUserId: uid("OWNER") }]) {
      const r = await api("POST", `/sales`, raw("admin"), { body: waterBody(1, extra) });
      if (!(r.status === 422 && ecode(r) === "validation")) p.push(`${Object.keys(extra)[0]} → ${st(r)}`);
    }
    if ((await salesOfT()) !== s0) p.push(`บิล +${(await salesOfT()) - s0}`);
    // ตัวควบคุมบวก CARD = PAR กับหน้าขาย (ค่าตั้งร้านอาจปิดทางบัตร — ตัดสินจาก facade ตรง)
    const cardPm = [{ type: "CARD", amountSatang: 1000, reference: "EDC-0001" }];
    const cardTwin = fx ? null : await call(regFacade, "submitRegisterSale", ctxU("A"), A("OWNER"), { lines: [{ productId: PR.water, qty: 1 }], payMethods: cardPm, expectedGrandTotalSatang: 1000, idempotencyKey: newKey("card") });
    const card = await api("POST", `/sales`, raw("admin"), { body: waterBody(1, { payMethods: cardPm, cashReceivedSatang: undefined }) });
    if (cardTwin?.ok !== true) p.push(`(ฟิกซ์เจอร์) หน้าขาย CARD ${codeOf(cardTwin)} — ตัวควบคุมบวกใช้ไม่ได้`);
    else if (card.status !== 200) p.push(`CARD → ${st(card)} ${short(card.body?.error?.message_th ?? "", 50)}`);
    chk("SA5", p.length === 0, "422 ×8 · CARD 200", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const id = SA_SALE || "none";
    const n0 = await api("POST", `/sales/${id}/void`, raw("admin"), { body: { reason: "ทดสอบยกเลิกผ่าน API" } });
    if (!(n0.status === 409 && ecode(n0) === "confirm_required")) p.push(`ไม่มี confirm → ${st(n0)}`);
    const v = await api("POST", `/sales/${id}/void`, raw("admin"), { body: { confirm: true, reason: "ทดสอบยกเลิกผ่าน API" } });
    if (v.status !== 200) p.push(`void ${st(v)}`);
    await drain();
    const row = await saleRow(id);
    if (row?.status !== "VOIDED") p.push(`สถานะ ${row?.status}`);
    const net = jvNet(await jvOf(id));
    if (net) p.push(`JV สุทธิ ${net}`);
    const mv = sum(await movesOf(id, INV.water ?? ""));
    if (mv !== 0) p.push(`สต็อกน้ำสุทธิ ${mv}`);
    if (!(await movesOf(id, INV.water ?? "")).length) p.push("ไม่มีการเคลื่อนไหวสต็อกของบิล (ตัดไม่เกิด)");
    const foreign = await step("บิล HOTEL", async () => posIdx.createSale({ tenantId: T, unitId: U.A, systemId: S.POS, sourceModule: "HOTEL", idempotencyKey: newKey("hotel"), lines: [{ name: `ค่าห้อง ${RAND}`, qty: 1, unitPriceSatang: 3000 }], payMethods: [{ type: "CASH", amountSatang: 3000 }] }));
    const fid = String((foreign as Any)?.saleId ?? (foreign as Any)?.id ?? "");
    const fv = await api("POST", `/sales/${fid || "none"}/void`, raw("admin"), { body: { confirm: true, reason: "ทดสอบบิลระบบอื่น" } });
    if (!(fv.status === 409 && ecode(fv) === "state_conflict")) p.push(`บิล HOTEL → ${st(fv)}`);
    if (fid && (await saleRow(fid))?.status !== "PAID") p.push("บิล HOTEL ถูกยกเลิก");
    chk("SA6", p.length === 0, "409 confirm · 200 VOIDED · JV 0 · สต็อก 0 · HOTEL 409", FXB(joinP(p)));
  }
  // บิลสำหรับคืนเงิน: หน้าขาย น้ำ ×2
  const RS = fx ? null : await regSale([{ productId: PR.water, qty: 2 }], 2000);
  const R_SALE = String(RS?.saleId ?? "");
  await drain();
  {
    const p: string[] = [];
    const g = await api("GET", `/sales/${R_SALE || "none"}/refundable`, raw("admin"));
    const direct = await call(refundMod, "saleForRefund", ctxU("A"), synthOf("admin"), { saleId: R_SALE || "none" });
    const pe = parOf(g, direct);
    if (pe) p.push(`refundable ${pe}`);
    const line = (direct?.lines ?? direct?.sale?.lines ?? [])[0] ?? (await saleRow(R_SALE))?.lines?.[0];
    const lineId = String(line?.lineId ?? line?.id ?? "");
    const body = { confirm: true, reason: "ลูกค้าคืน 1 ขวด", reasonCode: "CHANGED_MIND", lines: [{ lineId, qty: 1 }], payMethods: [{ type: "CASH", amountSatang: 1000 }] };
    const k = `p213-${RAND}-refund`;
    const r1 = await api("POST", `/sales/${R_SALE || "none"}/refund`, raw("admin"), { body, idem: k });
    const r2 = await api("POST", `/sales/${R_SALE || "none"}/refund`, raw("admin"), { body, idem: k });
    const rid = String(r1.body?.data?.refund?.id ?? r1.body?.data?.refundId ?? "");
    if (r1.status !== 200 || !rid) p.push(`refund ${st(r1)} ${short(r1.body?.error?.message_th ?? "", 50)}`);
    if (r2.status !== 200 || r2.headers.get("idempotent-replayed") !== "true" || String(r2.body?.data?.refund?.id ?? r2.body?.data?.refundId ?? "") !== rid) p.push(`replay ${st(r2)}`);
    await drain();
    await drain();
    const docs = (await P.posSale.findMany({ where: { tenantId: T, docType: "REFUND", refSaleId: R_SALE || "none" } }).catch(() => [])) as Any[];
    if (docs.length !== 1) p.push(`ใบ REFUND ${docs.length}`);
    const mv = await movesOf([R_SALE, rid], INV.water ?? "");
    if (sum(mv) !== -1) p.push(`สต็อกสุทธิของบิล+ใบคืน ${sum(mv)} (คาด −2 +1 = −1)`);
    const ev = await outboxN("pos.sale.refunded");
    if (ev !== 1) p.push(`pos.sale.refunded ${ev}`);
    chk("SA7", p.length === 0, "PAR refundable · REFUND 1 · +1 สต็อก · event 1 · replay", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const a = await api("GET", `/sales/${R_SALE || "none"}/refundable`, raw("op"));
    const b = await api("POST", `/sales/${R_SALE || "none"}/refund`, raw("op"), { body: { confirm: true, reason: "ลองคืนด้วยคีย์ขาย", reasonCode: "CHANGED_MIND", lines: [], payMethods: [] } });
    for (const [n, r] of [["refundable", a], ["refund", b]] as const) if (!(r.status === 403 && ecode(r) === "scope_missing")) p.push(`${n} pos-operate → ${st(r)}`);
    const twin = fx ? null : await regSale([{ productId: PR.water, qty: 1 }], 1000);
    const api1 = fx ? null : await regSale([{ productId: PR.water, qty: 1 }], 1000);
    const buyer = { kind: "JURISTIC", name: `บริษัท ผู้ซื้อ คิวซี ${RAND} จำกัด`, taxId: "0105561177639", branchCode: "00000", address: "1 ถนนทดสอบ กรุงเทพฯ 10110" };
    const t0 = await api("POST", `/sales/${String(api1?.saleId ?? "none")}/tax-invoice`, raw("op"), { body: { unitId: U.A, buyer } });
    if (!(t0.status === 403 && ecode(t0) === "scope_missing")) p.push(`tax-invoice pos-operate → ${st(t0)}`);
    const t1 = await api("POST", `/sales/${String(api1?.saleId ?? "none")}/tax-invoice`, raw("admin"), { body: { unitId: U.A, buyer } });
    const d1 = await call(taxMod, "issueFullTaxInvoice", ctxU("A"), synthOf("admin"), { saleId: String(twin?.saleId ?? "none"), buyer });
    const okBoth = d1?.ok === true ? t1.status === 200 : (() => {
      const e = REFUSAL_EXPECT[String(d1?.code)];
      return e ? t1.status === e[0] && ecode(t1) === e[1] : t1.status >= 400 && t1.status < 500;
    })();
    if (!okBoth) p.push(`tax-invoice admin ${st(t1)} vs facade ${codeOf(d1)}`);
    chk("SA8", p.length === 0, "403 ×3 · tax-invoice PAR", FXB(joinP(p)));
  }

  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 fix 1) SA9 (F1): REST void ผ่าน voidSaleByActor ⇒ กติกา POS_VOID ของร้านมีผล
  {
    const p: string[] = [];
    const pol = fx ? null : await step("SA9 กติกา POS_VOID", async () => String((await apSvc.createPolicy({ tenantId: T }, { name: `QC P2.13 ยกเลิกบิล ≥ ฿1,000 ${RAND}`, entityType: "POS_VOID", thresholdSatang: 100_000, steps: [{ order: 1, approverRole: "MANAGER" }] }))?.id ?? ""));
    if (!pol) p.push("(ฟิกซ์เจอร์) สร้างกติกา POS_VOID ไม่ได้");
    const BIG = 5_000_000;
    const b = await api("POST", `/sales`, raw("admin"), { body: { unitId: U.A, lines: [{ name: `ชุดอุปกรณ์ใหญ่ ${RAND}`, qty: 1, unitPriceSatang: BIG }], payMethods: [{ type: "CASH", amountSatang: BIG }], cashReceivedSatang: BIG, expectedGrandTotalSatang: BIG } });
    const id = String(b.body?.data?.saleId ?? "");
    if (b.status !== 200 || !id) p.push(`(ฟิกซ์เจอร์) บิล ฿50,000 ${st(b)} ${short(b.body?.error?.message_th ?? "", 50)}`);
    const v = await api("POST", `/sales/${id || "none"}/void`, raw("admin"), { body: { confirm: true, reason: "ลูกค้าขอยกเลิกบิลใหญ่" } });
    if (!(v.status === 409 && ecode(v) === "state_conflict")) p.push(`void → ${st(v)}`);
    const reqs = id ? ((await P.approvalRequest.findMany({ where: { tenantId: T, entityType: "POS_VOID", entityId: { startsWith: id } } }).catch(() => [])) as Any[]) : [];
    if (reqs.length !== 1) p.push(`คำขออนุมัติ POS_VOID ${reqs.length} ใบ`);
    const row = await saleRow(id);
    if (row?.status !== "PAID") p.push(`บิล ${row?.status}`);
    chk("SA9", p.length === 0, "409 · คำขอ 1 ใบ · บิล PAID", FXB(joinP(p)));
  }
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 fix 1) SA10 (F2/H1): บิล API ในกะที่ปิดแล้ว void ไม่ได้
  {
    const p: string[] = [];
    const DEV2 = `qc213${RAND}dev2`;
    let S2 = "";
    if (!fx) {
      await step("SA10 เครื่อง/กะที่สอง", async () => {
        must("registerDevice 2", await call(devMod, "registerDevice", ctxU("A"), A("OWNER"), { name: `เคาน์เตอร์สอง ${RAND}`, deviceCode: DEV2 }));
        const o = must("openShift 2", await call(shiftMod, "openShift", ctxU("A", DEV2), A("OWNER"), { deviceId: DEV2, deviceLabel: `เคาน์เตอร์สอง ${RAND}`, floatSatang: 0 }));
        S2 = String(o.shift?.id ?? o.shiftId ?? "");
      });
    }
    const a = await api("POST", `/sales`, raw("admin"), { body: waterBody(1, { shiftId: S2 || "none" }) });
    const id = String(a.body?.data?.saleId ?? "");
    const r0 = await saleRow(id);
    if (a.status !== 200 || !id || !S2 || r0?.shiftId !== S2) p.push(`(ฟิกซ์เจอร์) บิล API ในกะ S ${st(a)} shift=${r0?.shiftId === S2 ? "S" : short(r0?.shiftId, 14)}`);
    if (S2) await step("SA10 ปิดกะ", async () => must("closeShift", await call(shiftMod, "closeShift", ctxU("A", DEV2), A("OWNER"), { shiftId: S2, countedCashSatang: 1000, note: "ปิดกะทดสอบบิล API", idempotencyKey: newKey("close") })));
    const sh = S2 ? await P.posShift.findFirst({ where: { id: S2, tenantId: T }, select: { status: true } }).catch(() => null) : null;
    if (sh?.status === "OPEN" || !sh) p.push(`(ฟิกซ์เจอร์) กะ S ${sh?.status ?? "ไม่มี"}`);
    const v = await api("POST", `/sales/${id || "none"}/void`, raw("admin"), { body: { confirm: true, reason: "ยกเลิกบิลหลังปิดกะ" } });
    if (!(v.status === 409 && ecode(v) === "state_conflict" && /shift/i.test(String(v.body?.error?.message_en ?? "")))) p.push(`void → ${st(v)} ${short(v.body?.error?.message_en ?? "", 50)}`);
    if ((await saleRow(id))?.status !== "PAID") p.push(`บิล ${(await saleRow(id))?.status}`);
    chk("SA10", p.length === 0, "409 SHIFT_CLOSED · บิล PAID", FXB(joinP(p)));
  }

  // ════════ OR ════════
  console.log("\n── OR ออเดอร์ ──");
  const ordBody = (channelId: string, extra: Any = {}): Any => ({ unitId: U.A, channelId, fulfilment: "PICKUP", lines: [{ productId: PR.water, qty: 1 }], customer: { name: `ลูกค้า ${RAND}` }, ...extra });
  {
    const p: string[] = [];
    const ref = `LM-${RAND}-1`;
    const a = await api("POST", `/orders`, raw("admin"), { body: ordBody(CH.LM ?? "none", { externalRef: ref, startStatus: "NEW" }) });
    const b = await api("POST", `/orders`, raw("admin"), { body: ordBody(CH.LM ?? "none", { externalRef: ref, startStatus: "NEW" }) });
    const oid = String(a.body?.data?.orderId ?? "");
    if (a.status !== 200 || !oid || a.body?.data?.duplicated !== false) p.push(`ครั้งแรก ${st(a)} dup=${a.body?.data?.duplicated}`);
    if (b.status !== 200 || b.body?.data?.orderId !== oid || b.body?.data?.duplicated !== true) p.push(`ครั้งที่สอง ${st(b)} dup=${b.body?.data?.duplicated}`);
    const n = Number(await P.posOrder.count({ where: { tenantId: T, externalRef: ref } }).catch(() => -1));
    if (n !== 1) p.push(`ออเดอร์ ${n}`);
    const lo = await api("GET", `/orders?unitId=${U.A}`, raw("read"));
    const dl = await call(orderMod, "listOrders", ctxU("A"), synthOf("read"), {});
    const pe = parOf(lo, dl);
    if (pe) p.push(`list ${pe}`);
    const go = await api("GET", `/orders/${oid || "none"}?unitId=${U.A}`, raw("read"));
    const dg = await call(orderMod, "getOrder", ctxU("A"), synthOf("read"), { id: oid || "none" });
    const pg = parOf(go, dg);
    if (pg) p.push(`get ${pg}`);
    chk("OR1", p.length === 0, "1 ออเดอร์ · duplicated · PAR list/get", FXB(joinP(p)));
    // OR2 accept ออเดอร์นี้ (PLATFORM)
    const p2: string[] = [];
    const ac = await api("POST", `/orders/${oid || "none"}/accept`, raw("admin"), { body: { unitId: U.A } });
    if (ac.status !== 200) p2.push(`accept ${st(ac)} ${short(ac.body?.error?.message_th ?? "", 50)}`);
    await drain();
    const o = await P.posOrder.findFirst({ where: { id: oid || "none", tenantId: T } }).catch(() => null);
    const sales = o?.saleId ? 1 : 0;
    if (sales !== 1) p2.push("ไม่มีบิลของออเดอร์");
    const com = o?.saleId ? (await jvOf(o.saleId)).filter((e) => e.key.endsWith("#COMMISSION")).length : 0;
    if (com < 1) p2.push(`COMMISSION ${com}`);
    chk("OR2", p2.length === 0, "200 · บิล 1 · COMMISSION ≥ 1", FXB(joinP(p2)));
    // OR6 cancel ออเดอร์นี้ (มีบิล)
    const p6: string[] = [];
    const c1 = await api("POST", `/orders/${oid || "none"}/cancel`, raw("reject"), { body: { unitId: U.A, confirm: true, reason: "ลูกค้ายกเลิกผ่านแอป" } });
    if (!(c1.status === 403 && ecode(c1) === "forbidden")) p6.push(`ไม่มี void → ${st(c1)}`);
    if (o?.saleId && (await saleRow(o.saleId))?.status !== "PAID") p6.push("บิลถูกยกเลิกทั้งที่ปฏิเสธ");
    const c2 = await api("POST", `/orders/${oid || "none"}/cancel`, raw("admin"), { body: { unitId: U.A, confirm: true, reason: "ลูกค้ายกเลิกผ่านแอป" } });
    if (c2.status !== 200) p6.push(`admin ${st(c2)}`);
    await drain();
    if (o?.saleId && (await saleRow(o.saleId))?.status !== "VOIDED") p6.push(`บิล ${(await saleRow(o.saleId))?.status}`);
    chk("OR6", p6.length === 0, "403 forbidden · admin 200 · บิล VOIDED", FXB(joinP(p6)));
  }
  {
    const a = await api("POST", `/orders`, raw("admin"), { body: ordBody(CH.LM ?? "none", { externalRef: `LM-${RAND}-2`, startStatus: "NEW" }) });
    const id = String(a.body?.data?.orderId ?? "none");
    const bad = await api("POST", `/orders/${id}/reject`, raw("admin"), { body: { unitId: U.A, reasonCode: "BAD_REASON" } });
    const r = await api("POST", `/orders/${id}/reject`, raw("admin"), { body: { unitId: U.A, reasonCode: "TOO_BUSY", note: "ครัวเต็ม" } });
    const o = await P.posOrder.findFirst({ where: { id, tenantId: T } }).catch(() => null);
    chk("OR3", bad.status === 422 && ecode(bad) === "validation" && r.status === 200 && o?.status === "REJECTED", "422 · 200 REJECTED", FXB(`${st(bad)} · ${st(r)} · ${o?.status}`));
  }
  {
    const p: string[] = [];
    const a = await api("POST", `/orders`, raw("admin"), { body: ordBody(CH.WALK ?? "none", { startStatus: "NEW" }) });
    const id = String(a.body?.data?.orderId ?? "none");
    if (a.status !== 200) p.push(`create ${st(a)}`);
    // ORACLE-EDIT ผู้คุม 15 ต.ค. (P2.13) CD-B1: accept → preparing → ready → pay → complete (ส่งมอบได้เมื่อจ่ายแล้ว · กฎ P2.8 ORDER_UNPAID) · ขั้นผิด = preparing บนออเดอร์ HANDED
    for (const s of ["accept", "preparing", "ready"]) {
      const r = await api("POST", `/orders/${id}/${s}`, raw("admin"), { body: { unitId: U.A } });
      if (r.status !== 200) p.push(`${s} ${st(r)}`);
    }
    const pay = await api("POST", `/orders/${id}/pay`, raw("admin"), { body: { unitId: U.A, payMethods: [{ type: "CASH", amountSatang: 1000 }], cashReceivedSatang: 1000 } });
    if (pay.status !== 200 || !pay.body?.data?.saleId) p.push(`pay ${st(pay)}`);
    const done = await api("POST", `/orders/${id}/complete`, raw("admin"), { body: { unitId: U.A } });
    if (done.status !== 200) p.push(`complete ${st(done)}`);
    const bad = await api("POST", `/orders/${id}/preparing`, raw("admin"), { body: { unitId: U.A } });
    if (!(bad.status === 409 && ecode(bad) === "state_conflict")) p.push(`preparing หลังส่งมอบ → ${st(bad)}`);
    const o = await P.posOrder.findFirst({ where: { id, tenantId: T } }).catch(() => null);
    if (o?.paymentState !== "PAID" || !o?.saleId) p.push(`ออเดอร์ ${o?.status}/${o?.paymentState}`);
    chk("OR4", p.length === 0, "200 ×6 · 409 · PAID", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const until = new Date(Date.now() + 30 * 60_000).toISOString();
    const pz = await api("POST", `/channels/${CH.APP ?? "none"}/pause`, raw("op"), { body: { unitId: U.A, until } });
    if (pz.status !== 200) p.push(`pause ${st(pz)}`);
    const r1 = await api("POST", `/orders`, raw("admin"), { body: ordBody(CH.APP ?? "none", { externalRef: `APP-${RAND}-1` }) });
    if (!(r1.status === 409 && ecode(r1) === "state_conflict")) p.push(`ระหว่างพัก → ${st(r1)}`);
    const rs = await api("POST", `/channels/${CH.APP ?? "none"}/resume`, raw("op"), { body: { unitId: U.A } });
    if (rs.status !== 200) p.push(`resume ${st(rs)}`);
    const r2 = await api("POST", `/orders`, raw("admin"), { body: ordBody(CH.APP ?? "none", { externalRef: `APP-${RAND}-2` }) });
    if (r2.status !== 200) p.push(`หลังเปิด → ${st(r2)}`);
    chk("OR5", p.length === 0, "pause 200 · 409 · resume 200 · 200", FXB(joinP(p)));
  }

  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 fix 1) OR7 (H3): เงินสดของออเดอร์ผ่าน API ต้องลงกะ (ไม่มีกะให้ผูก = SHIFT_REQUIRED · ไม่บันทึกเงินสดนอกกะ)
  {
    const p: string[] = [];
    const chB = fx ? "" : String((await step("OR7 ช่องทาง DIRECT สาขา B", async () => must("saveChannel B", await call(chMod, "saveChannel", ctxU("B"), A("OWNER"), { code: "CUSTOM_WALKB", name: `สั่งล่วงหน้า B ${RAND}`, payout: "DIRECT" }))))?.channel?.id ?? "");
    const sset: Any = (await P.appSystem.findUnique({ where: { id: S.POS ?? "none" }, select: { settings: true } }).catch(() => null))?.settings ?? {};
    if (sset?.pos?.shift?.required?.otherSources === true) p.push("(ฟิกซ์เจอร์) requiredOtherSources เปิดอยู่");
    const openB = Number(await P.posShift.count({ where: { tenantId: T, unitId: U.B ?? "none", status: "OPEN" } }).catch(() => -1));
    if (openB !== 0) p.push(`(ฟิกซ์เจอร์) สาขา B มีกะเปิด ${openB}`);
    const a = await api("POST", `/orders`, raw("admin"), { body: { unitId: U.B, channelId: chB || "none", fulfilment: "PICKUP", lines: [{ productId: PR.bar, qty: 1 }], customer: { name: `ลูกค้า B ${RAND}` }, startStatus: "NEW" } });
    const id = String(a.body?.data?.orderId ?? "");
    const ac = await api("POST", `/orders/${id || "none"}/accept`, raw("admin"), { body: { unitId: U.B } });
    if (a.status !== 200 || !id || ac.status !== 200) p.push(`(ฟิกซ์เจอร์) ออเดอร์ ${st(a)} accept ${st(ac)}`);
    const total = Number((await P.posOrder.findFirst({ where: { id: id || "none", tenantId: T } }).catch(() => null))?.totalSatang ?? 0);
    const s0 = await salesOfT();
    const pay = await api("POST", `/orders/${id || "none"}/pay`, raw("admin"), { body: { unitId: U.B, payMethods: [{ type: "CASH", amountSatang: total }], cashReceivedSatang: total } });
    if (!(pay.status === 409 && ecode(pay) === "state_conflict" && /shift/i.test(String(pay.body?.error?.message_en ?? "")))) p.push(`จ่ายเงินสด → ${st(pay)} ${short(pay.body?.error?.message_en ?? "", 50)}`);
    const o = await P.posOrder.findFirst({ where: { id: id || "none", tenantId: T } }).catch(() => null);
    if (o?.paymentState === "PAID" || o?.saleId) p.push(`ออเดอร์ ${o?.paymentState} บิล=${!!o?.saleId}`);
    if ((await salesOfT()) !== s0) p.push(`บิล +${(await salesOfT()) - s0}`);
    const tr = await api("POST", `/orders/${id || "none"}/pay`, raw("admin"), { body: { unitId: U.B, payMethods: [{ type: "TRANSFER", amountSatang: total, reference: "TRF-0007" }] } });
    if (tr.status !== 200) p.push(`ตัวควบคุมบวก โอน → ${st(tr)} ${short(tr.body?.error?.message_th ?? "", 50)}`);
    chk("OR7", p.length === 0, "409 SHIFT_REQUIRED · ไม่จ่าย 0 บิล · โอน 200", FXB(joinP(p)));
  }

  // ════════ PR ════════
  console.log("\n── PR สินค้า ──");
  {
    const p: string[] = [];
    const r = await api("GET", `/products?unitId=${U.A}`, raw("read"));
    const d = await call(catalog, "listForUnit", cc(), U.A, {});
    const ids = (xs: Any[]) => (xs ?? []).map((x: Any) => `${x.id}:${x.priceSatang ?? x.basePriceSatang ?? x.price ?? ""}`).join(",");
    const apiItems: Any[] = Array.isArray(r.body?.data) ? r.body.data : r.body?.data?.items ?? [];
    if (r.status !== 200 || !r.body?.page) p.push(`list ${st(r)} page=${!!r.body?.page}`);
    if (ids(apiItems) !== ids(d?.items ?? [])) p.push(`รายการต่าง api=${apiItems.length} facade=${d?.items?.length}`);
    const o = await api("GET", `/products/${PR.latte ?? "none"}/options?unitId=${U.A}`, raw("op"));
    const od = await call(regFacade, "registerProductOptions", ctxU("A"), synthOf("op"), { productId: PR.latte ?? "none" });
    const pe = parOf(o, od);
    if (pe) p.push(`options ${pe}`);
    chk("PR1", p.length === 0, "PAR listForUnit + page · PAR options", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const a = await api("GET", `/products/lookup?unitId=${U.A}&barcode=${BARCODE}`, raw("op"));
    const ad = await call(regFacade, "registerScan", ctxU("A"), synthOf("op"), { barcode: BARCODE });
    if (parOf(a, ad)) p.push(`บาร์โค้ด ${parOf(a, ad)}`);
    if (!JSON.stringify(a.body?.data ?? "").includes(PR.bar ?? "@@")) p.push("ไม่พบสินค้าบาร์โค้ด");
    const w = await api("GET", `/products/lookup?unitId=${U.A}&barcode=${WEIGHED}`, raw("op"));
    const wd = await call(regFacade, "registerScan", ctxU("A"), synthOf("op"), { barcode: WEIGHED });
    if (parOf(w, wd)) p.push(`ป้ายชั่ง ${parOf(w, wd)}`);
    if (!JSON.stringify(w.body?.data ?? "").includes(PR.beef ?? "@@") || !/1250/.test(JSON.stringify(w.body?.data ?? ""))) p.push("ป้ายชั่งไม่มีสินค้า/1250 กรัม");
    const n = await api("GET", `/products/lookup?unitId=${U.A}&barcode=0000000000000`, raw("op"));
    if (n.status !== 200) p.push(`ไม่พบ → ${st(n)}`);
    chk("PR2", p.length === 0, "PAR registerScan ×2 · ไม่พบ 200", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const e0 = await outboxN("pos.product.availability");
    const r = await api("POST", `/products/${PR.tee ?? "none"}/availability`, raw("op"), { body: { unitId: U.A, available: false } });
    if (r.status !== 200) p.push(`86 ${st(r)}`);
    const e1 = await outboxN("pos.product.availability");
    if (e1 - e0 !== 1) p.push(`event +${e1 - e0}`);
    const q = await api("POST", `/sales/quote`, raw("op"), { body: { unitId: U.A, lines: [{ productId: PR.tee, qty: 1 }] }, idem: false });
    if (!(q.status >= 400 && q.status < 500)) p.push(`quote สินค้าหมด → ${st(q)}`);
    const sc = await call(regFacade, "registerProductsByIds", ctxU("A"), A("OWNER"), [PR.tee ?? "none"]);
    const view = Array.isArray(sc) ? sc[0] : null;
    if (!view || view.soldOut !== true) p.push(`หน้าขายยังเห็นขาย (soldOut=${view?.soldOut})`);
    const back = await api("POST", `/products/${PR.tee ?? "none"}/availability`, raw("op"), { body: { unitId: U.A, available: true } });
    const q2 = await api("POST", `/sales/quote`, raw("op"), { body: { unitId: U.A, lines: [{ productId: PR.tee, qty: 1 }] }, idem: false });
    if (back.status !== 200 || q2.status !== 200) p.push(`คืนขาย ${st(back)} quote ${st(q2)}`);
    chk("PR3", p.length === 0, "86 · event 1 · quote ปฏิเสธ · คืนขาย", FXB(joinP(p)));
  }
  let NEWP = "";
  {
    const p: string[] = [];
    const c = await api("POST", `/products`, raw("admin"), { body: { unitId: U.A, name: `สินค้าจาก API ${RAND}`, kind: "PRODUCT", basePriceSatang: 4900 } });
    NEWP = String(c.body?.data?.id ?? c.body?.data?.product?.id ?? "");
    if (c.status !== 200 || !NEWP) p.push(`create ${st(c)} ${short(c.body?.error?.message_th ?? "", 50)}`);
    const u = await api("PATCH", `/products/${NEWP || "none"}`, raw("admin"), { body: { unitId: U.A, name: `สินค้าจาก API แก้ ${RAND}` } });
    if (u.status !== 200) p.push(`update ${st(u)}`);
    const ar = await api("POST", `/products/${NEWP || "none"}/archive`, raw("admin"), { body: { unitId: U.A, confirm: true, reason: "เลิกขายสินค้าทดสอบ" } });
    if (ar.status !== 200) p.push(`archive ${st(ar)}`);
    const row = NEWP ? await P.posProduct.findFirst({ where: { id: NEWP, tenantId: T } }).catch(() => null) : null;
    if (!row || row.name !== `สินค้าจาก API แก้ ${RAND}` || !row.archivedAt) p.push(`แถว ${row ? `${row.name}/${!!row.archivedAt}` : "ไม่มี"}`);
    for (const id of ["products.create", "products.update", "products.archive"]) if ((await auditN({ actorType: "API_KEY", actorId: K.admin?.id ?? "none", action: `pos.api.${id}` })) < 1) p.push(`ไม่มี audit ${id}`);
    chk("PR4", p.length === 0, "200 ×3 ด้วยคีย์ของ STAFF · audit API_KEY", FXB(joinP(p)));
  }
  {
    const a = await api("PUT", `/products/${PR.bar ?? "none"}/price`, raw("mgr"), { body: { unitId: U.A, priceSatang: 2700 } });
    const b = await api("PUT", `/products/${PR.bar ?? "none"}/price`, raw("admin"), { body: { unitId: U.A, priceSatang: 2700 } });
    const row = PR.bar ? await P.posProduct.findFirst({ where: { id: PR.bar, tenantId: T } }).catch(() => null) : null;
    const price = Number(row?.basePriceSatang ?? row?.priceSatang ?? -1);
    chk("PR5", a.status === 403 && ecode(a) === "scope_missing" && b.status === 200 && price === 2700, "403 · 200 · ราคา 2700", FXB(`${st(a)} · ${st(b)} · ${price}`));
  }

  // ════════ RP ════════
  console.log("\n── RP รายงาน ──");
  const kinds: string[] = Array.isArray(reportsMod?.REPORT_KINDS) ? [...reportsMod.REPORT_KINDS] : [];
  {
    const p: string[] = [];
    for (const k of BASE_KINDS) {
      const r = await api("GET", `/reports/${k}?from=${FROM}&to=${today}`, raw("read"));
      const d = await call(reportsMod, REPORT_FN[k]!, { tenantId: T, systemId: S.POS }, synthOf("read"), { from: FROM, to: today });
      const pe = parOf(r, d);
      if (pe) p.push(`${k}: ${pe}`);
    }
    const s = await api("GET", `/reports/summary?from=${FROM}&to=${today}`, raw("read"));
    if (s.status !== 200) p.push(`summary ${st(s)}`);
    chk("RP1", p.length === 0, "PAR 8 ชนิด · summary 200", FXB(joinP(p)));
  }
  {
    const missing = P212_KINDS.filter((k) => !kinds.includes(k));
    // มติ 10: ก่อน P2.12 S merge = SKIP-with-reason (รวมตอน QC_FORCE — ไม่ใช่แดงของ P2.13)
    if (missing.length) skipChk("RP2", `REPORT_KINDS ยังไม่มี ${missing.join(",")} (P2.12 S ยังไม่ merge — มติ 10)`);
    else {
      const p: string[] = [];
      for (const k of P212_KINDS) {
        const r = await api("GET", `/reports/${k}?from=${FROM}&to=${today}`, raw("admin"));
        const d = await call(reportsMod, REPORT_FN[k]!, { tenantId: T, systemId: S.POS }, synthOf("admin"), { from: FROM, to: today });
        const pe = parOf(r, d);
        if (pe) p.push(`${k}: ${pe}`);
      }
      chk("RP2", p.length === 0, "PAR branches/hourly/anomalies", FXB(joinP(p)));
    }
  }
  {
    const p: string[] = [];
    const r = await api("GET", `/reports/daily?from=${FROM}&to=${today}`, raw("read"), { headers: { accept: "text/csv" } });
    const d = await call(reportsMod, "reportCsv", { tenantId: T, systemId: S.POS }, synthOf("read"), { kind: "daily", from: FROM, to: today });
    const strip = (s: string) => s.replace(/^﻿/, "");
    if (r.status !== 200 || !r.bom || !String(r.headers.get("content-type") ?? "").includes("text/csv")) p.push(`csv ${st(r)} bom=${r.bom}`);
    if (d?.ok !== true || strip(r.text) !== strip(String(d.body ?? ""))) p.push(`csv ต่างจาก reportCsv (${r.text.length}/${String(d?.body ?? "").length})`);
    const long = await api("GET", `/reports/daily?from=${minus(today, 92)}&to=${today}`, raw("read"));
    if (!(long.status === 422 && ecode(long) === "validation")) p.push(`93 วัน → ${st(long)}`);
    chk("RP3", p.length === 0, "csv = reportCsv · 93 วัน 422", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const a = await api("GET", `/reports/daily?from=${FROM}&to=${today}&unitId=${U.B}`, raw("filter"));
    if (!(a.status === 404 && ecode(a) === "not_found")) p.push(`daily สาขา B → ${st(a)}`);
    const b = await api("GET", `/reports/daily?from=${FROM}&to=${today}`, raw("filter"));
    const d = await call(reportsMod, "reportDailySales", { tenantId: T, systemId: S.POS }, synthOf("filter", [U.A ?? "-"]), { from: FROM, to: today });
    const pe = parOf(b, d);
    if (pe) p.push(`daily ไม่ระบุสาขา ${pe}`);
    const c = await api("GET", `/sales?unitId=${U.B}&date=${today}`, raw("filter"));
    if (!(c.status === 404 && ecode(c) === "not_found")) p.push(`sales สาขา B → ${st(c)}`);
    if (!K.filter) p.push("ออกคีย์ตัวกรองไม่ได้ (isApiScope pos.filter.unit:)");
    chk("RP4", p.length === 0, "B 404 · ยอด = เฉพาะ A", FXB(joinP(p)));
  }

  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 fix 1) RP5 (F4): ผู้ขายที่เป็นคีย์ = "API: <ชื่อคีย์>"
  {
    const p: string[] = [];
    const r = await api("GET", `/reports/staff?from=${FROM}&to=${today}`, raw("read"));
    const rows: Any[] = Array.isArray(r.body?.data?.rows) ? r.body.data.rows : [];
    if (r.status !== 200) p.push(`staff ${st(r)}`);
    const want = `API: QC P2.13 admin2 ${RAND}`;
    const kr = rows.find((x) => x?.userId === K.admin2?.id);
    if (!kr) p.push("ไม่มีแถวของคีย์ admin2");
    else if (kr.name !== want) p.push(`แถวคีย์ name=${short(kr.name, 40)} (คาด ${want})`);
    const or = rows.find((x) => x?.userId === uid("OWNER"));
    if (!or || or.name !== `OWNER คิวซี${RAND}`) p.push(`แถวเจ้าของ name=${short(or?.name, 30)}`);
    chk("RP5", p.length === 0, "API: <ชื่อคีย์> · คนจริง = ชื่อคน", FXB(joinP(p)));
  }

  // ════════ SH ════════
  console.log("\n── SH กะ/เครื่อง/ช่องทาง/ทางที่ปิด ──");
  {
    const p: string[] = [];
    const pairs: [Res, Any, string][] = [
      [await api("GET", `/shifts?unitId=${U.A}`, raw("op")), await call(shiftMod, "listShifts", ctxU("A"), synthOf("op"), {}), "list"],
      [await api("GET", `/shifts/${SHIFT || "none"}/x-report?unitId=${U.A}`, raw("op")), await call(shiftMod, "xReport", ctxU("A"), synthOf("op"), { shiftId: SHIFT || "none" }), "x"],
      [await api("GET", `/shifts/${SHIFT || "none"}/z-report?unitId=${U.A}`, raw("op")), await call(shiftMod, "zReport", ctxU("A"), synthOf("op"), { shiftId: SHIFT || "none" }), "z"],
      [await api("GET", `/shifts/current?unitId=${U.A}&deviceId=${DEV}`, raw("op")), await call(shiftMod, "currentShift", ctxU("A"), synthOf("op"), { deviceId: DEV }), "current"],
    ];
    for (const [r, d, n] of pairs) {
      const pe = parOf(r, d);
      if (pe) p.push(`${n}: ${pe}`);
    }
    if (!JSON.stringify(pairs[0]![0].body?.data ?? "").includes(SHIFT || "@@")) p.push("list ไม่มีกะของฟิกซ์เจอร์");
    if (!JSON.stringify(pairs[0]![1] ?? "").includes(SHIFT || "@@")) p.push("(ฟิกซ์เจอร์) listShifts ตรงไม่เห็นกะ — ข้อนี้ตัดสินไม่ได้");
    const ro = await api("GET", `/shifts?unitId=${U.A}`, raw("read"));
    if (!(ro.status === 403 && ecode(ro) === "scope_missing")) p.push(`pos-read → ${st(ro)}`);
    chk("SH1", p.length === 0, "PAR ×4 · pos-read 403", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const u = await api("GET", `/units`, raw("read"));
    const txt = JSON.stringify(u.body?.data ?? "");
    if (u.status !== 200 || !txt.includes(U.A ?? "@@") || !txt.includes(U.B ?? "@@") || txt.includes(U.C ?? "@@") || txt.includes(U.X ?? "@@")) p.push(`units ${st(u)} ${short(txt, 80)}`);
    const ls = await api("GET", `/sales?unitId=${U.A}&date=${today}&pageSize=50`, raw("read"));
    const ld = await call(billsMod, "billsPageData", ctxU("A"), synthOf("read"), { unitId: U.A, date: today, pageSize: 50 });
    const idsOf = (xs: Any[]) => (Array.isArray(xs) ? xs : []).map((x: Any) => String(x.id)).sort().join(",");
    const apiRows: Any[] = Array.isArray(ls.body?.data) ? ls.body.data : ls.body?.data?.items ?? [];
    if (ls.status !== 200 || !ls.body?.page || ld?.ok !== true || idsOf(apiRows) !== idsOf(ld.items) || !idsOf(apiRows).includes(API_SALE1 || "@@")) p.push(`sales list ${st(ls)} page=${!!ls.body?.page} api=${apiRows.length} facade=${ld?.items?.length ?? codeOf(ld)}`);
    const gs = await api("GET", `/sales/${API_SALE1 || "none"}?unitId=${U.A}`, raw("read"));
    const gd0 = await call(billsMod, "billDetail", ctxU("A"), synthOf("read"), { saleId: API_SALE1 || "none", unitId: U.A });
    // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 CD-6) ▸ มติ 17: REST sales.get ตอบ totals ชื่อ *Satang (API-10) — PAR กับ billDetail ที่แปลงชื่อ totals แบบเดียวกัน ◂
    const t0 = gd0?.ok === true ? gd0.bill?.totals : null;
    const gd = t0
      ? { ...gd0, bill: { ...gd0.bill, totals: { subtotalSatang: t0.subtotal, lineDiscountSatang: t0.lineDiscount, billDiscountSatang: t0.billDiscount, couponSatang: t0.coupon, tierSatang: t0.tier, serviceChargeSatang: t0.serviceCharge, vatSatang: t0.vatSatang, vatRateBp: t0.vatRateBp, grandTotalSatang: t0.grandTotal, tipSatang: t0.tip, refundedSatang: t0.refunded } } }
      : gd0;
    if (parOf(gs, gd)) p.push(`sales.get ${parOf(gs, gd)}`);
    const rc = await api("GET", `/sales/${API_SALE1 || "none"}/receipt?unitId=${U.A}`, raw("read"));
    const rcd = await call(receiptMod, "receiptPayload", { tenantId: T, systemId: S.POS, unitId: U.A }, synthOf("read"), { saleId: API_SALE1 || "none", copy: false });
    if (parOf(rc, rcd)) p.push(`receipt ${parOf(rc, rcd)}`);
    const dv = await api("GET", `/devices?unitId=${U.A}`, raw("op"));
    const dd = await call(devMod, "listDevices", ctxU("A"), synthOf("op"));
    if (parOf(dv, dd)) p.push(`devices ${parOf(dv, dd)}`);
    if (!JSON.stringify(dv.body?.data ?? "").includes(DEVID || "@@")) p.push("devices ไม่มีเครื่องฟิกซ์เจอร์");
    const ch = await api("GET", `/channels?unitId=${U.A}`, raw("read"));
    const cd = await call(chMod, "listChannels", ctxU("A"), synthOf("read"));
    if (parOf(ch, cd)) p.push(`channels ${parOf(ch, cd)}`);
    const ro = await api("GET", `/devices?unitId=${U.A}`, raw("read"));
    if (!(ro.status === 403 && ecode(ro) === "scope_missing")) p.push(`devices pos-read → ${st(ro)}`);
    chk("SH2", p.length === 0, "units A,B · PAR sales list/get/receipt/devices/channels · 403", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    for (const [m, path] of CLOSED_PATHS) {
      const r = await api(m, path.replace("SALEID", API_SALE1 || "s").replace("DEVID", DEVID || "d"), raw("admin"), m === "GET" ? {} : { body: { unitId: U.A } });
      if (!(r.status === 404 && ecode(r) === "not_found")) p.push(`${m} ${path} → ${st(r)}`);
    }
    chk("SH3", p.length === 0, `404 ×${CLOSED_PATHS.length}`, FXB(joinP(p)));
  }
  if (notes.length) console.log(`  ℹ️  ฟิกซ์เจอร์มีหมายเหตุ ${notes.length}: ${notes.slice(0, 6).join(" | ")}`);
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
  // ผู้ใช้ของรอบ (อีเมลมี slug ของร้านชั่วคราว) — ไม่มี tenantId
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

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
const wipes: WipeReport[] = [];
let bucketsLeft = -1;
try {
  runStatic();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  installFetchGuard();
  try {
    await drain();
    await sleep(300);
    for (const [tid, slug] of [[T, T_SLUG], [T2, T2_SLUG]] as const) {
      const w = await wipeTenant(tid, slug);
      wipes.push(w);
      const residue = Object.values(w.left).reduce((a, b) => a + Math.abs(b), 0) + w.tenantLeft;
      console.log(`  ลบร้านชั่วคราว ${tid || "(ไม่ได้สร้าง)"}: ${w.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(w.left)} · Tenant ${w.tenantLeft}${w.err ? ` · ${w.err}` : ""}`);
    }
    let nb = 0;
    for (const kid of keyIds) nb += Number(await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `%:api:%:${kid}`).catch(() => 0));
    bucketsLeft = 0;
    for (const kid of keyIds) bucketsLeft += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE $1`, `%:api:%:${kid}`).catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? -1);
    console.log(`  ลบถังเพดานอัตราของคีย์รอบนี้ ${nb} แถว · เหลือ ${bucketsLeft}`);
  } catch (e) {
    wipes.push({ tables: 0, left: {}, tenantLeft: 0, err: `cleanup: ${(e as Error).message.slice(0, 200)}` });
    console.log(`💥 cleanup ${(e as Error).message.slice(0, 200)}`);
  } finally {
    removeFetchGuard();
  }
}
await sleep(200);
const tempLeft = wipes.flatMap((w) => Object.entries(w.left).map(([k, v]) => `${k}:${v}`));
const tenantLeft = sum(wipes.map((w) => w.tenantLeft));
const wipeErr = wipes.map((w) => w.err).filter(Boolean).join(" · ");
chk("Z1", tempLeft.length === 0 && tenantLeft === 0 && !wipeErr && bucketsLeft === 0, "ร้านชั่วคราว 0 แถว · Tenant ถูกลบ · ถังเพดาน 0", [tempLeft.length ? `เหลือ ${tempLeft.join(", ")}` : `0 แถว (${wipes[0]?.tables ?? 0} ตาราง)`, tenantLeft ? "Tenant ยังอยู่" : "", wipeErr, `ถังเพดาน ${bucketsLeft}`].filter(Boolean).join(" · "));
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
const fpErr = Object.values(fpBefore).some((v) => v.startsWith("err"));
chk("Z2", fpDrift.length === 0 && !fpErr, "ลายนิ้วมือเท่าเดิม", fpDrift.length ? `ต่าง ${fpDrift.join(", ")}` : `เท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`);
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
const skipped = [...results.entries()].filter(([, r]) => r.skip).map(([id, r]) => `${id}: ${r.skip}`);
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${skipped.length ? ` (SKIP ${skipped.length})` : ""}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skippedChecks: skipped, skipped: false, forced: FORCE, missing: skipReasons, st5Pins: st5PinsOk, mergeBase: MB, guardHits: guardHits.length, residue: tempLeft.length + tenantLeft })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P2.13: tool ของ AI จากทะเบียน (P3.9) · webhooks ขาเข้า/sync-menu (P3.1–3.3) · กะ/เครื่อง/บิลพักผ่าน API (P3.4) · stock counts ×6 /
//   option-groups/recipe/channel-prices/channels CRUD (P2.14/P3) · ภาพการ์ดคีย์ API (U-lite §7) = visual-pos (ผู้คุมงาน) · ทดสอบสกิลด้วย agent จริง = CONTROLLER-RUN
