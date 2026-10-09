// QC — POS RUN ใบ P2.1: ช่องทางขาย (SalesChannel) ต่อสาขา + PosSale.channel* + ค่าคอมฯ แพลตฟอร์ม → บัญชี
//   เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ
// requires: pos-seed (ใช้ userId เจ้าของ/แคชเชียร์ของร้าน QC กาแฟเป็นผู้กระทำจริงใน audit)
//
// สัญญา: ledger/pos-briefs/pos-brief-P2.1.md §2 R1–R13 · §3 migration · §4 แผนข้อสอบ · §5 CD1–CD10 · §9 มติผู้คุมงาน (ผูกมัด)
//        ต่อยอด: qc-pos-p1.13 (ร้านชั่วคราว · สมุด VAT ผูก POS · ลบใน finally) · qc-pos-p1.8 (void/คืนเงิน + GL) · qc-pos-account (JV)
//        โน้ต: ledger/wo-notes/pos-P2.1-oracle.md (ตารางชื่อ = สัญญาของผู้สร้าง S · ความคลาดเคลื่อน · CONTROLLER-DECISION · ผลแดงที่คาด)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้และลงทะเบียนในตารางชื่อของโน้ต — ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P2.1 (S) ต้องส่ง (ย่อ — ละเอียดในโน้ต):
//   schema: model SalesChannel (R1 + CD7) · enum SalesChannelKind/Adapter/Payout · PosPayType += PLATFORM ·
//     PosSale += channelId channelCode channelRef channelPayout channelCommissionSatang channelCommissionVatSatang
//   pos/channel-shared.ts (บริสุทธิ์): channelCommission · channelRefundShare · parseChannelInput · defaultChannelCode ·
//     CHANNEL_BUILTIN_CODES · CHANNEL_EXTERNAL_PRESETS · CHANNEL_LIMIT_PER_UNIT · CHANNEL_REF_MAX
//   pos/channel.ts: listChannels · saveChannel · archiveChannel · ensureUnitChannels · pos/channel-actions.ts ("use server")
//   createSale input += channelId? channelRef? · PosSaleErrorCode += CHANNEL_INVALID CHANNEL_PAY_MISMATCH
//   account/index.ts: applyExternalChannelCommission (+ PLATFORM ในยูเนียนช่องทางของ applyExternalSale/applyExternalRefund)
//   account/gl.ts: postExternalChannelCommission (คีย์ PosSale#<id>#COMMISSION / #COMMISSION_REFUNDED · เล่ม GENERAL)
//   register: quote/submit/held += channelId (+ submit channelRef) · quote.channel {id code name payout}
//   readers: BillRow.salesChannel · query salesChannelId · BillDetail.channel · receiptPayload.channel · PublicReceipt.channel
//
// ขอบเขต: ST สถิต · S8 สัญญา createSale · B คณิตบริสุทธิ์ · C ช่องทาง · S createSale · G บัญชี · R กลับรายการ/คืนเงิน ·
//   P หน้าขาย · Q ตัวอ่าน · E ปฏิเสธเป็นข้อมูล · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p1.13): SKIP เมื่อของ P2.1 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต ST1–ST5 + S8 + คณิตบริสุทธิ์ B1–B5 (ไม่โหลด prisma · exit 1 ถ้าแดง)
//    ฐาน = QC4 เท่านั้น (host ep-frosty-lab ก่อนเขียนแถวแรก) · ร้านชั่วคราว `posqc-p21-<rand>` + `posqc-p21-<rand>-t2` (ลบทั้งร้านใน finally · แถวค้าง = 0)
//    ไม่มีเครือข่าย: globalThis.fetch = ตัวกั้น (503 + นับ) ตลอดช่วง DB
//    โมดูล/โมเดล/คอลัมน์ที่ยังไม่มีเข้าถึงแบบไดนามิก (`import(… as string)` + catch · SQL ดิบเมื่อคอลัมน์มีจริง) — next build ตรวจชนิด scripts/*.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p2.1";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · P บริสุทธิ์ · X1 idempotency/เล่นซ้ำ · X2 ข้ามขอบเขต · X3 สิทธิ์ · X4 เงิน · X5 ผลข้างเคียงครบ/ไม่เขียนอะไร · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P2.1-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "S", "[R1 §3 CD7] schema + migration เพิ่มอย่างเดียว: model SalesChannel (R1 + autoAccept prepMinutes pausedUntil adapterConfig · @@unique([unitId, code]) · @@index([tenantId, systemId, unitId])) · enum SalesChannelKind/Adapter/Payout ค่าตรง · PosPayType มี PLATFORM · PosSale 6 คอลัมน์ · migration เดียว `*_pos_p21_sales_channel`: ADD VALUE IF NOT EXISTS 'PLATFORM' · CREATE TYPE ×3 · CREATE TABLE \"SalesChannel\" · PosSale ADD COLUMN ครบ 6 ตัวพอดี · ไม่มีคำสั่งอื่น"),
  D("ST2", "S", "[R3 R13 §3] ลงทะเบียน: scope.ts SalesChannel · pos-qc-env POS_MODELS salesChannel + ไม่อยู่ใน POS_FUTURE_MODELS · permissions.ts \"pos.channel.manage\" (ป้ายตามบรีฟ) · PosSaleErrorCode มี CHANNEL_INVALID CHANNEL_PAY_MISMATCH · RegisterRefusalCode + REFUSAL_KEY ครบ 6 รหัส CHANNEL_* · messages th+en register.errors.channel* 6 คีย์ (th ไทย) · ก้อน channel.* · shift.method.PLATFORM · receipt.public.pay.PLATFORM"),
  D("ST3", "S", "[R4 R7 R9 hard rule F2.2 CD2 Q8] ขอบเขต: modules/pos import บัญชีผ่าน @/lib/modules/account เท่านั้น · account/index export applyExternalChannelCommission + คีย์ PLATFORM_RECEIVABLE/PLATFORM_COMMISSION + ยูเนียนช่องทางมี PLATFORM (sale+refund) · gl.ts export postExternalChannelCommission · account-bridge channelOf มี case PLATFORM + เรียก applyExternalChannelCommission · refund-consumer เรียก applyExternalChannelCommission · channel.ts export ensureUnitChannels (createMany skipDuplicates) · service.ts ใช้ defaultChannelCode · register.ts มีรอยต่อ \"P2.2 ▸ channel price here\" · channel-shared.ts ไม่ import prisma · shop/restaurant/hotel/booking/ticket/clinic ไม่แตะ channelId (CD2) · REST EXTERNAL_PAY_TYPES เดิม"),
  D("ST4", "S", "[hard rule] ทุกไฟล์ \"use server\" ใน modules/pos export async function ล้วน · channel-actions.ts มี listChannelsAction saveChannelAction archiveChannelAction (แต่ละตัวเรียกฟังก์ชันบริการ + catch) + requireTenant"),
  D("ST5", "S", "[R5 R11 Q8] รายการชนิดจ่ายรู้จัก PLATFORM: PAY_TYPE_ORDER + PAY_TYPE_LABEL_TH.PLATFORM \"แพลตฟอร์ม\" (service.ts) · POS_PAY_TYPE_LABEL.PLATFORM \"แพลตฟอร์ม\" · REFUND_PAY_TYPES · REGISTER_PAY_TYPES · shift METHOD_ORDER · receipt-render ReceiptPayType · EXTERNAL_PAY_TYPES (REST) ไม่เปลี่ยน"),
  D("S8", "S", "[R4 F15.2] scripts/pos-sale-contract.json: functions + MemberSaleChoices + SaleResult + ฟิลด์เดิมของ CreateSaleInput ตรงฐาน (แฮช) · ฟิลด์ใหม่ของ CreateSaleInput = {channelId?: string, channelRef?: string} พอดี"),
  // ── B คณิตบริสุทธิ์ (channel-shared.ts) ──
  D("B1", "P", "[R6] channelCommission: ฿420×30% = 12600 · ฿310×25%+฿2 = 7950 · ครึ่งขึ้น (.5 → ขึ้น: 1×50% = 1 · 3×50% = 2 · 12345×30% = 3703.5 → 3704) · clamp ≤ ยอด (1000×100%+500 = 1000) · ยอด 0 → 0 · fixed ล้วน · ผลมีคีย์ commissionSatang commissionVatSatang พอดี"),
  D("B2", "P", "[R6 CD5 §9] VAT ค่าคอมฯ = halfUp(commission × vatBp / 10000): 7950×7% = 556.5 → 557 · 125×7% = 8.75 → 9 · vatBp 0 → 0 · ไม่มีค่าคอมฯ → VAT 0"),
  D("B3", "P", "[R6 R9 CD10] channelRefundShare: บางส่วน = halfUp(sale.commission × refundGross / sale.grand) · ใบที่ครบ (full) = ส่วนที่เหลือ · 200 กรณีสุ่ม (seed ตายตัว) แบ่ง 3 ใบ Σ ส่วนแบ่ง = ค่าคอมฯ ของบิลเป๊ะ (ทั้งค่าคอมฯ และ VAT) · ไม่ติดลบ · ตัวอย่างบรีฟ 12345/14321/15334 ของ 12600 → 3704/4296/4600"),
  D("B4", "P", "[R3] parseChannelInput: คีย์ตรง {id code name active payout commissionBp commissionFixedSatang commissionVatBp sortOrder adapter} · ตัดช่องว่างชื่อ · คีย์แปลก/รหัสผิด regex (lineman · L · 1ABC · 25 ตัว)/bp −1 10001 1.5 \"3000\"/fixed 1000001/vat 10001/payout X/adapter X/ชื่อว่าง/null/อาร์เรย์/สตริง → {ok:false, code VALIDATION} ไม่ throw · ขอบ 0/10000/1000000/AB/24 ตัว ผ่าน"),
  D("B5", "P", "[R4 R11 CD2 CD9 R13] defaultChannelCode: ECOM → WEB · POS RESTAURANT HOTEL BOOKING TICKET CLINIC SCHOOL RENTAL MEMBER AI null \"\" XYZ → STORE · CHANNEL_BUILTIN_CODES = STORE QR_TABLE WEB CHAT · CHANNEL_EXTERNAL_PRESETS = LINEMAN GRAB FOODPANDA SHOPEE LAZADA TIKTOK · CHANNEL_LIMIT_PER_UNIT 30 · CHANNEL_REF_MAX 40 · refusalMessageKey(CHANNEL_*) = errors.<camel>"),
  // ── C ช่องทาง ──
  D("C1", "X1", "[R2 R3] listChannels ครั้งแรกบนสาขาใหม่ → SalesChannel ของสาขา 0 → 4 แถว BUILTIN (STORE หน้าร้าน · QR_TABLE QR โต๊ะ · WEB เว็บร้าน SHARK Shop · CHAT แชท) · STORE DIRECT ค่าคอมฯ 0 · ครั้งที่สอง 0 แถวใหม่ id เดิม · รูป item คีย์ตรง 12 ตัว"),
  D("C2", "X1", "[R2 X6] สองบิลแรกพร้อมกันบนสาขาใหม่ (ไม่ส่ง channelId) → ทั้งคู่สำเร็จ · builtins ของสาขา = 4 พอดี (ไม่มี P2002) · ทั้งสองบิล channelCode STORE + channelId = STORE ของสาขา"),
  D("C3", "-", "[R1 R3] saveChannel: LINEMAN (preset ⇒ kind EXTERNAL payout PLATFORM adapter MANUAL) · GRAB (25% + ฿2 · vat 700) · CUSTOM_AGENT (kind CUSTOM · DIRECT 10%) · รหัสซ้ำ → CHANNEL_CODE_TAKEN · รหัสเดียวกันคนละสาขาได้ · ลำดับที่ 31 ของสาขา → CHANNEL_LIMIT (แถว = 30) · ข้อมูลผิด → VALIDATION"),
  D("C4", "-", "[R2 R3] STORE: แก้ค่าคอมฯ / payout / ปิด active / archive → CHANNEL_BUILTIN_LOCKED แถวไม่เปลี่ยน · builtin อื่นแก้ค่าคอมฯ ได้ แต่เปลี่ยน code → LOCKED · archive CUSTOM → ok archivedAt · listChannels ไม่แสดงที่ archive (includeArchived แสดงพร้อม archived:true)"),
  D("C5", "X3", "[R3 X2 X3] STAFF (pos.sale.create) list ok · save → PERMISSION_DENIED · ไม่มีสิทธิ์ POS เลย list → PERMISSION_DENIED · MANAGER save ok · id ของร้าน T2 / สาขาอื่น → CHANNEL_NOT_FOUND (save + archive · แถวไม่เปลี่ยน)"),
  D("C6", "X5", "[R3] AuditLog pos.channel.created / updated / archived · actorId = userId จริงของผู้ทำ (เจ้าของ · ผู้จัดการ) · มี channelId + code · updated มี before/after · คำขอที่ถูกปฏิเสธไม่มี audit"),
  D("C7", "X4", "[R6] แก้ LINEMAN 30% → 20% หลังขาย: บิลเดิมยัง 12600 + snapshot เดิม · บิลใหม่หลังแก้ใช้อัตราใหม่ (฿100 → 2000)"),
  // ── S createSale ──
  D("S1", "-", "[R4 CD2] ไม่ส่ง channelId (sourceModule POS) → channelId = STORE ของสาขา · channelCode STORE · payout DIRECT · ค่าคอมฯ 0/0 · channelRef null"),
  D("S2", "X4", "[R4 R5 R6] LINEMAN + PLATFORM ฿420 + channelRef \" LM-48152 \" → snapshot (code LINEMAN · payout PLATFORM · 12600/0 · ref ตัดช่องว่าง) · PosPayment 1 แถว PLATFORM 42000 · Σ จ่าย = ยอดบิล"),
  D("S3", "X5", "[R5] PLATFORM บนบิล STORE / บนช่องทาง DIRECT (AGENT) → CHANNEL_PAY_MISMATCH (code บน error · ข้อความไทย) · PosSale PosPayment OutboxEvent ไม่เพิ่ม · PosReceiptCounter.seq ไม่ขยับ"),
  D("S4", "X5", "[R5] LINEMAN จ่าย CASH / แบ่ง PLATFORM+CASH → CHANNEL_PAY_MISMATCH · ทิป / cashTendered บนแถว PLATFORM → CHANNEL_PAY_MISMATCH หรือ VALIDATION (ด่านเดิมมาก่อน) · ไม่มีอะไรถูกเขียน"),
  D("S5", "X2", "[R4] channelId ของสาขาอื่น (ระบบ POS เดียวกัน) / ร้าน T2 / ที่ archive / ที่ปิด active / id มั่ว → CHANNEL_INVALID ไม่มีอะไรถูกเขียน · channelRef 41 ตัว → VALIDATION ไม่มีบิล"),
  D("S6", "X1", "[R4 CD3] คีย์เดิม + ช่องทางเดิม → บิลเดิม (outbox pos.sale.paid 1 แถว) · คีย์เดิม + ช่องทางอื่น → IDEMPOTENCY_CONFLICT · ผู้เรียกเดิม (ไม่ส่ง channelId) ยิงซ้ำ → บิลเดิม"),
  D("S7", "-", "[R4 CD2 Q6] ShopOrder confirmOrderPaid (ECOM) → WEB ของสาขา · createSale sourceModule RESTAURANT / HOTEL / BOOKING → STORE · ค่าคอมฯ 0"),
  // ── G บัญชี ──
  D("G1", "X4", "[R7 §9] LINEMAN ฿420: PAID = Dr 1100 42000 / Cr 4000 39252 / Cr 2200 2748 · COMMISSION (คีย์ PosSale#<id>#COMMISSION · เล่ม GENERAL · memo \"ค่าคอมฯ ช่องทาง <ชื่อ> · บิล <เลข>\") = Dr 6500 12600 / Cr 1100 12600 · 1100 สุทธิของบิล 29400"),
  D("G2", "X4", "[R7 §9 Q2] GRAB ฿310 (25% + ฿2 · VAT 7%): COMMISSION = Dr 6500 7950 + Dr 1155 557 / Cr 1100 8507 · PAID Dr 1100 31000"),
  D("G3", "X4", "[R7] สาขา C สมุดไม่จด VAT: GRAB ฿310 → PAID Dr 1100 31000 / Cr 4000 31000 · COMMISSION Dr 6500 8507 (รวม VAT) / Cr 1100 8507 · ไม่มี 1155"),
  D("G4", "X4", "[R7 CD5] CUSTOM_AGENT (DIRECT 10%) จ่าย CASH ฿420: PAID ต่อรหัส = บิล STORE CASH ฿420 เป๊ะ · COMMISSION Dr 6500 4200 / Cr 2100 4200"),
  D("G5", "-", "[R7] บิล STORE (CASH ฿420): ไม่มี JV COMMISSION · PAID 1 รายการ Dr 1000 42000 / Cr 4000 39252 / Cr 2200 2748 (รูปเดิม)"),
  D("G6", "X1", "[R7 X9] เล่น consumers[pos.sale.paid] ซ้ำ 2 รอบ + drain 2 รอบ → PAID 1 + COMMISSION 1 ต่อบิล"),
  D("G7", "-", "[R7 X8] สาขา B (POS ไม่ผูกสมุด) LINEMAN ฿420 → บิล + snapshot (12600 · PLATFORM) · JV ของบิล 0"),
  D("G8", "X4", "[R7] ทุก JV ของร้านชั่วคราว (refType PosSale) สมดุล Σdr = Σcr · ไม่มีบรรทัดรหัส 9999 · needsReview false ทุกรายการ"),
  D("G9", "X5", "[CD6 §9] ผู้ติดต่อของช่องทาง: บรรทัด 1100 ของ PAID + COMMISSION (LINEMAN) และ 2100 ของ COMMISSION (AGENT) มี contactId = ผู้ติดต่อชื่อเดียวกับช่องทาง · บิล LINEMAN สองใบ = ผู้ติดต่อเดียว (1 แถวต่อชื่อต่อสมุด)"),
  // ── R กลับรายการ / คืนเงิน ──
  D("R1", "X5", "[R8 X5] voidSale บิล LINEMAN → PAID + COMMISSION ถูกกลับ (REVERSED + รายการกลับ 2) · 1100 / 6500 / ทุกรหัสสุทธิ 0 · เล่น consumers[pos.sale.voided] ซ้ำ 2 รอบ → ไม่มีรายการเพิ่ม"),
  D("R2", "X4", "[R9] คืนบางส่วน (บรรทัด 12345 จาก 42000) ด้วย PLATFORM → ใบคืน snapshot (LINEMAN · PLATFORM · ส่วนแบ่ง 3704/0) · REFUNDED Cr 1100 12345 (ไม่มี 1000/1010) · COMMISSION_REFUNDED (คีย์ PosSale#<refundId>#COMMISSION_REFUNDED) Dr 1100 3704 / Cr 6500 3704"),
  D("R3", "X4", "[R9 CD10] คืนครบ 3 ใบ (12345 · 14321 · 15334) → ส่วนแบ่ง 3704 · 4296 · 4600 Σ = 12600 · 1100 และ 6500 สุทธิของบิล+ใบคืน = 0"),
  D("R4", "X5", "[R9] บิล PLATFORM คืนด้วย CASH / บิล CASH คืนด้วย PLATFORM → REFUND_METHOD_INVALID · ไม่มีใบคืน"),
  D("R5", "X1", "[R9 X1] เล่น consumers[pos.sale.refunded] ของใบคืนแรกซ้ำ 2 รอบ → REFUNDED 1 + COMMISSION_REFUNDED 1 (ไม่เบิ้ล)"),
  D("R6", "X4", "[R9] คืน AGENT (DIRECT · CASH) บรรทัด 21000 → ส่วนแบ่ง 2100 · COMMISSION_REFUNDED Dr 2100 2100 / Cr 6500 2100"),
  // ORACLE-EDIT (fix round 1 · reviewer F1): ค่าคอมฯ ที่ไม่เคยลงห้ามถูก "กลับ" — ตัวรับคืนเงินต้องลง COMMISSION ที่ขาดก่อน COMMISSION_REFUNDED
  D("R7", "X4", "[R9 F1] บิล LINEMAN ฿420 มี PAID แต่ JV COMMISSION หาย (ข้อสอบลบเองในร้านชั่วคราว) → คืนครบด้วย PLATFORM → หลัง drain มีทั้ง COMMISSION และ COMMISSION_REFUNDED (อย่างละ 1) · 1100 ของบิล+ใบคืนสุทธิ 0 บนผู้ติดต่อแพลตฟอร์ม (ทุกบรรทัด 1100 มีผู้ติดต่อ) · 6500 สุทธิ 0 · เล่น consumers[pos.sale.refunded] + [pos.sale.paid] ซ้ำ 2 รอบ → ไม่มีรายการเพิ่ม"),
  // ORACLE-EDIT (P2.1U · รีวิว N1): ทางซ่อมตัวเองของคิวปิดบิล (บิล REFUNDED แต่ COMMISSION หาย) ต้องถูกทดสอบในสถานะที่ "ซ่อมจริง"
  D("R8", "X4", "[R9 F1 N1] บิล LINEMAN ฿420 คืนครบแล้ว (REFUNDED) → ข้อสอบลบ JV COMMISSION + COMMISSION_REFUNDED เอง (เหลือ PAID + REFUNDED · 1100/6500 สุทธิ 0) → ขับ consumers[pos.sale.paid] ซ้ำ + drain → COMMISSION กลับมา 1 (Dr 6500 12600 / Cr 1100 12600 ผู้ติดต่อเดียวกับ PAID) · COMMISSION_REFUNDED ยังไม่มี (ช่อง \"refund event FAILED\") · ทุก JV สมดุล · เล่น paid ซ้ำไม่เพิ่ม → ขับ consumers[pos.sale.refunded] ซ้ำ → COMMISSION_REFUNDED กลับมา (Dr 1100 12600 / Cr 6500 12600) · 1100 บนผู้ติดต่อ + 6500 สุทธิ 0 · ขับซ้ำอีกรอบไม่เพิ่ม"),
  // ── P หน้าขาย ──
  D("P1", "X2", "[R10] quoteRegisterCart: ไม่ส่ง channelId → channel {id STORE ของสาขา, code STORE, name หน้าร้าน, payout DIRECT} · channelId LINEMAN → channel LINEMAN PLATFORM · channelId ของสาขาอื่น / ที่ archive → CHANNEL_INVALID (ไม่ throw)"),
  D("P2", "X5", "[R10 R5] submitRegisterSale LINEMAN + PLATFORM + channelRef → บิล snapshot (ref · 12600 · ผูกกะ) · STORE + PLATFORM → CHANNEL_PAY_MISMATCH · LINEMAN + CASH → CHANNEL_PAY_MISMATCH · channelRef 41 ตัว → VALIDATION · คำขอที่ถูกปฏิเสธไม่มีบิล"),
  D("P3", "X1", "[R10] holdRegisterCart ที่มี channelId → recallHeldCart คืน cart.channelId เดิม + quote.channel LINEMAN"),
  D("P4", "-", "[R10 CD8] POS เปิดค่าบริการ 10%: quote STORE ฿100 → ค่าบริการ 1000 ยอด 11000 · quote LINEMAN → ค่าบริการ 0 ยอด 10000"),
  // ── Q ตัวอ่าน ──
  D("Q1", "-", "[R11 Q4] billsPageData: แถวมี salesChannel {code, name} (LINEMAN · STORE หน้าร้าน · WEB) · salesChannelId = LINEMAN → เฉพาะบิล LINEMAN · ตัวกรอง channel เดิม (= sourceModule) ECOM → เฉพาะบิล ECOM"),
  D("Q2", "X3", "[R11] billDetail.channel {code name ref payout commissionSatang commissionVatSatang}: ผู้จัดการ / พนักงานที่มี pos.report.view เห็น 12600 · พนักงานมีแค่ pos.sale.read เห็นช่องทาง+ref แต่ไม่มีตัวเลขค่าคอมฯ"),
  D("Q3", "-", "[R11] receiptPayload.channel {code name ref} + ใบพิมพ์ (th 80) มี \"ช่องทาง <ชื่อ>\" + ref · publicReceipt.channel {name ref} · ไม่มีคีย์/ตัวเลขค่าคอมฯ ทั้งสองทาง · ตัวควบคุม: บิล STORE channel null"),
  D("Q4", "X4", "[R11] xReport หลังขาย LINEMAN ผ่านหน้าขาย: byMethod มีแถว PLATFORM +42000 · expectedCashSatang / cashSalesSatang เท่าเดิม"),
  D("Q5", "-", "[R11] reportPayments แถว PLATFORM ป้าย \"แพลตฟอร์ม\" · Σ แถว = totals.totalPaidSatang · closeDaySummary byMethod PLATFORM ป้าย \"แพลตฟอร์ม\""),
  D("Q6", "-", "[R11 CD9] บิลเก่า (channelId null) อ่านเป็น defaultChannelCode: POS → salesChannel {STORE, หน้าร้าน} · billDetail.channel STORE · ECOM → WEB"),
  // ── E ปฏิเสธเป็นข้อมูล ──
  D("E1", "-", "[R13] คำปฏิเสธที่เก็บได้ครบ (CHANNEL_NOT_FOUND CHANNEL_CODE_TAKEN CHANNEL_BUILTIN_LOCKED CHANNEL_LIMIT CHANNEL_INVALID CHANNEL_PAY_MISMATCH PERMISSION_DENIED VALIDATION) · ทุกตัว {ok:false, code, message ไทย} ไม่ throw (ฟังก์ชันช่องทาง + หน้าขาย)"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราวทั้งสองเหลือ 0 แถวทุกตารางที่มี tenantId (SalesChannel PosSale/Line/Payment OutboxEvent AuditLog AccountJournalEntry/Line AccountDocument AccountContact InvMovement …) + แถว Tenant ถูกลบ"),
  D("Z2", "-", "ลายนิ้วมือร้านอื่น: ร้าน QC seed + ร้านจริงไม่มีแถวของรอบนี้ (บิล/เครื่อง/ช่องทาง/ผู้ติดต่อ/audit/outbox ที่มีรหัสรอบ) · นับ SalesChannel ของร้านที่ไม่ใช่ร้านชั่วคราวก่อน/หลังพิมพ์เป็นข้อมูล"),
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
  const full = id.startsWith("P2.1-") ? id : `P2.1-${id}`;
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
/** ครึ่งขึ้นของ a×b/c (จำนวนเต็มบวก) — ตัวอ้างอิงของข้อสอบเอง */
const halfUp = (a: number, b: number, c: number) => (c > 0 ? Math.floor((2 * a * b + c) / (2 * c)) : 0);
/** ค่าคอมฯ ตาม R6 — ตัวอ้างอิงของข้อสอบ */
const refCommission = (gross: number, bp: number, fixed: number, vatBp: number) => {
  const c = Math.min(gross, halfUp(gross, bp, 10_000) + fixed);
  return { commissionSatang: c, commissionVatSatang: halfUp(c, vatBp, 10_000) };
};
const camel = (code: string) => code.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const pad2 = (n: number) => String(n).padStart(2, "0");

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
const enumValues = (block: string): string[] =>
  block
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => /^[A-Z][A-Z0-9_]*$/.test(l));
/** ช่วงของ const/ออบเจกต์ที่เริ่มด้วย marker (ถึงวงเล็บปิดคู่แรก) */
function constBody(src: string, marker: string): string {
  const i0 = src.indexOf(marker);
  if (i0 < 0) return "";
  const eq = src.indexOf("=", i0); // ข้ามวงเล็บของชนิด (เช่น PosPayType[]) — เริ่มที่ค่าหลังเครื่องหมาย =
  if (eq < 0) return "";
  const i = eq + 1;
  const open = src.slice(i).search(/[[{]/);
  if (open < 0) return "";
  const start = i + open;
  const o = src[start]!;
  const c = o === "[" ? "]" : "}";
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    if (src[j] === o) depth++;
    else if (src[j] === c && --depth === 0) return src.slice(start, j + 1);
  }
  return "";
}

const POS_DIR = "src/lib/modules/pos";
const F = {
  shared: `${POS_DIR}/channel-shared.ts`,
  svc: `${POS_DIR}/channel.ts`,
  act: `${POS_DIR}/channel-actions.ts`,
  service: `${POS_DIR}/service.ts`,
  bridge: `${POS_DIR}/account-bridge.ts`,
  refundShared: `${POS_DIR}/refund-shared.ts`,
  refundCons: `${POS_DIR}/refund-consumer.ts`,
  register: `${POS_DIR}/register.ts`,
  regShared: `${POS_DIR}/register-shared.ts`,
  shift: `${POS_DIR}/shift.ts`,
  render: `${POS_DIR}/receipt-render.ts`,
  restOps: `${POS_DIR}/api/ops/sales.ts`,
  labels: "src/lib/ui/status-labels.ts",
  accIndex: "src/lib/modules/account/index.ts",
  gl: "src/lib/modules/account/gl.ts",
  perms: "src/lib/core/permissions.ts",
  scope: "src/lib/core/scope.ts",
  qcEnv: "scripts/pos-qc-env.mts",
  contract: "scripts/pos-sale-contract.json",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
};
const SVC_FNS = ["listChannels", "saveChannel", "archiveChannel", "ensureUnitChannels"] as const;
const SHARED_FNS = ["channelCommission", "channelRefundShare", "parseChannelInput", "defaultChannelCode"] as const;
const ACTIONS: [string, string][] = [["listChannelsAction", "listChannels"], ["saveChannelAction", "saveChannel"], ["archiveChannelAction", "archiveChannel"]];
const PERM_MANAGE = "pos.channel.manage";
const PERM_LABEL = "ตั้งค่าช่องทางขายและค่าคอมมิชชันแพลตฟอร์ม";
const AUDIT = { created: "pos.channel.created", updated: "pos.channel.updated", archived: "pos.channel.archived" } as const;
const BUILTINS: Record<string, string> = { STORE: "หน้าร้าน", QR_TABLE: "QR โต๊ะ", WEB: "เว็บร้าน SHARK Shop", CHAT: "แชท" };
const PRESETS = ["LINEMAN", "GRAB", "FOODPANDA", "SHOPEE", "LAZADA", "TIKTOK"];
const CH_CODES = ["CHANNEL_INVALID", "CHANNEL_PAY_MISMATCH", "CHANNEL_NOT_FOUND", "CHANNEL_CODE_TAKEN", "CHANNEL_BUILTIN_LOCKED", "CHANNEL_LIMIT"];
const ITEM_KEYS = ["id", "code", "kind", "name", "adapter", "active", "payout", "commissionBp", "commissionFixedSatang", "commissionVatBp", "sortOrder", "archived"];
const INPUT_KEYS = ["id", "code", "name", "active", "payout", "commissionBp", "commissionFixedSatang", "commissionVatBp", "sortOrder", "adapter"];
const SALE_COLS = ["channelId", "channelCode", "channelRef", "channelPayout", "channelCommissionSatang", "channelCommissionVatSatang"] as const;
const SC_COLS = ["id", "tenantId", "systemId", "unitId", "code", "kind", "name", "adapter", "active", "sortOrder", "payout", "commissionBp", "commissionFixedSatang", "commissionVatBp", "archivedAt", "createdAt", "updatedAt", "autoAccept", "prepMinutes", "pausedUntil", "adapterConfig"] as const;
const PLATFORM_LABEL = "แพลตฟอร์ม";
const EV_PAID = "pos.sale.paid";
const EV_VOIDED = "pos.sale.voided";
const EV_REFUNDED = "pos.sale.refunded";

const srcOf = (f: string) => stripComments(rd(f));
const STATIC_IDS = ["ST1", "ST2", "ST3", "ST4", "ST5", "S8"].map((x) => `P2.1-${x}`);
const PURE_IDS = ["B1", "B2", "B3", "B4", "B5"].map((x) => `P2.1-${x}`);
const skipReasons: string[] = [];
for (const f of [F.shared, F.svc, F.act]) if (!existsSync(join(ROOT, f))) skipReasons.push(`${f} ยังไม่มี`);
for (const n of SVC_FNS) if (!exportsFn(srcOf(F.svc), n)) skipReasons.push(`ยังไม่มี export ${n} (channel.ts)`);
for (const n of SHARED_FNS) if (!exportsFn(srcOf(F.shared), n)) skipReasons.push(`ยังไม่มี export ${n} (channel-shared.ts)`);
if (!exportsFn(srcOf(F.accIndex), "applyExternalChannelCommission")) skipReasons.push("ยังไม่มี export applyExternalChannelCommission (account/index.ts)");

/** ไฟล์ "shared" ไม่ import prisma/db/โมดูลฝั่งเซิร์ฟเวอร์ (ค่า) — เงื่อนไขที่ --no-db โหลดได้ */
const purePath = (f: string): boolean => {
  const s = srcOf(f);
  if (!s) return false;
  const valueImports = [...s.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
  const dyn = [...s.matchAll(/import\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1]!);
  return ![...valueImports, ...dyn].some((p) => /@prisma\/client|\/db$|^\.\/db$|@\/lib\/core\/db|@\/lib\/modules\/account|^\.\/(channel|receipt|register|service|bills|refund|shift|reports|held-cart|account-bridge)$/.test(p));
};

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB) ═════════════════════════
/** แฮชฐานของสัญญา F15.2 (ก่อน P2.1 · base session/pos 1bfa0ff9) — functions + MemberSaleChoices + SaleResult + ฟิลด์เดิมของ CreateSaleInput */
const CONTRACT_BASE_HASH = "4a6c46e6bc1998e4";
const CONTRACT_BASE_KEYS = 43;
const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon) : isRecord(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
function contractBaseHash(j: Any, baseKeys: string[]): string {
  const cs = isRecord(j?.types?.CreateSaleInput) ? j.types.CreateSaleInput : {};
  const picked = Object.fromEntries(baseKeys.map((k) => [k, cs[k] ?? null]));
  const body = { functions: j?.functions ?? null, MemberSaleChoices: j?.types?.MemberSaleChoices ?? null, SaleResult: j?.types?.SaleResult ?? null, CreateSaleInput: picked };
  return createHash("sha256").update(JSON.stringify(canon(body))).digest("hex").slice(0, 16);
}
const CONTRACT_BASE_FIELDS = ["tenantId", "unitId", "systemId", "pointSystemId", "memberId", "memberSystemId", "memberChoices", "sourceModule", "sourceId", "idempotencyKey", "lines", "lines[].name", "lines[].qty", "lines[].unitPriceSatang", "lines[].discountSatang", "lines[].itemId", "lines[].serviceId", "billDiscountSatang", "couponSystemId", "couponCode", "payMethods", "payMethods[].type", "payMethods[].amountSatang", "payMethods[].refSaleId", "lines[].productId", "lines[].note", "payMethods[].cashTenderedSatang", "payMethods[].reference", "note", "serviceChargeSatang", "tipSatang", "lines[].options", "lines[].components", "lines[].weightGrams", "shiftId", "soldByUserId", "taxInvoice", "memberSnapshot", "memberSnapshot.name", "memberSnapshot.memberCode", "memberSnapshot.phoneMasked", "memberSnapshot.tierKey", "memberSnapshot.tierName"];

async function runStatic(): Promise<void> {
  console.log("\n── ST ข้อสถิต (ไม่แตะ DB) ──");
  const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
  const P8 = (p: string[]) => p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "");
  // ST1 schema + migration
  {
    const p: string[] = [];
    const sc = prismaBlock(schemaSrc, "model", "SalesChannel");
    if (!sc) p.push("ไม่มี model SalesChannel");
    else {
      const miss = SC_COLS.filter((c) => !fieldLine(sc, c));
      if (miss.length) p.push(`SalesChannel ขาด ${miss.join(",")}`);
      if (!/@@unique\(\s*\[\s*unitId\s*,\s*code\s*\]/.test(sc)) p.push("SalesChannel ไม่มี @@unique([unitId, code])");
      if (!/@@index\(\s*\[\s*tenantId\s*,\s*systemId\s*,\s*unitId\s*\]/.test(sc)) p.push("SalesChannel ไม่มี @@index([tenantId, systemId, unitId])");
      const typ = (f: string) => (fieldLine(sc, f).split(/\s+/)[1] ?? "");
      for (const [f, t] of [["kind", "SalesChannelKind"], ["adapter", "SalesChannelAdapter"], ["payout", "SalesChannelPayout"], ["commissionBp", "Int"], ["commissionFixedSatang", "Int"], ["commissionVatBp", "Int"], ["autoAccept", "Boolean"], ["prepMinutes", "Int?"], ["pausedUntil", "DateTime?"], ["adapterConfig", "Json?"], ["archivedAt", "DateTime?"]] as const)
        if (fieldLine(sc, f) && typ(f) !== t) p.push(`SalesChannel.${f} ชนิด ${typ(f)} (คาด ${t})`);
      if (fieldLine(sc, "autoAccept") && !/@default\(false\)/.test(fieldLine(sc, "autoAccept"))) p.push("autoAccept ไม่ใช่ @default(false)");
    }
    for (const [e, vals] of [["SalesChannelKind", ["BUILTIN", "EXTERNAL", "CUSTOM"]], ["SalesChannelAdapter", ["NONE", "MANUAL", "WEB", "CHAT", "API"]], ["SalesChannelPayout", ["PLATFORM", "DIRECT"]]] as const) {
      const b = prismaBlock(schemaSrc, "enum", e);
      if (!b) p.push(`ไม่มี enum ${e}`);
      else if (short(enumValues(b).sort()) !== short([...vals].sort())) p.push(`enum ${e} = ${enumValues(b).join(",")}`);
    }
    if (!enumValues(prismaBlock(schemaSrc, "enum", "PosPayType")).includes("PLATFORM")) p.push("enum PosPayType ไม่มี PLATFORM");
    const ps = prismaBlock(schemaSrc, "model", "PosSale");
    const want: [string, RegExp, string][] = [
      ["channelId", /^channelId\s+String\?(\s|$)/, "String?"],
      ["channelCode", /^channelCode\s+String\?(\s|$)/, "String?"],
      ["channelRef", /^channelRef\s+String\?(\s|$)/, "String?"],
      ["channelPayout", /^channelPayout\s+SalesChannelPayout\?(\s|$)/, "SalesChannelPayout?"],
      ["channelCommissionSatang", /^channelCommissionSatang\s+Int\s+@default\(0\)/, "Int @default(0)"],
      ["channelCommissionVatSatang", /^channelCommissionVatSatang\s+Int\s+@default\(0\)/, "Int @default(0)"],
    ];
    for (const [f, re, lbl] of want) {
      const l = fieldLine(ps, f);
      if (!l) p.push(`PosSale ไม่มี ${f}`);
      else if (!re.test(l)) p.push(`PosSale.${f} ไม่ใช่ ${lbl}`);
    }
    // migration
    const dirs = walk("prisma/migrations", [], /\.sql$/).filter((f) => /"SalesChannel"|"channelCommissionSatang"/.test(rd(f)));
    if (dirs.length !== 1) p.push(`migration ที่แตะ SalesChannel/channel* = ${dirs.length} ไฟล์ (คาด 1)`);
    for (const f of dirs) {
      const name = f.split("/").slice(-2, -1)[0] ?? "";
      if (!/_pos_p21_sales_channel$/.test(name)) p.push(`ชื่อ migration ${name} (คาด *_pos_p21_sales_channel)`);
      let sql = rd(f).replace(/--.*$/gm, "");
      const doBlocks = [...sql.matchAll(/DO\s+\$\$([\s\S]*?)\$\$\s*;/gi)].map((m) => m[1]!);
      for (const b of doBlocks) if (!/CREATE\s+TYPE\s+"SalesChannel(Kind|Adapter|Payout)"/i.test(b) || /\b(DROP|RENAME|DELETE|UPDATE|TRUNCATE)\b/i.test(b)) p.push(`DO block ไม่ใช่ CREATE TYPE ล้วน (${short(b, 60)})`);
      const typesInDo = doBlocks.join("\n");
      sql = sql.replace(/DO\s+\$\$[\s\S]*?\$\$\s*;/gi, "");
      const stmts = sql.split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
      const ok = (s: string) =>
        /^(SET|RESET) lock_timeout\b/i.test(s) ||
        /^ALTER TYPE "PosPayType" ADD VALUE IF NOT EXISTS 'PLATFORM'$/i.test(s) ||
        /^CREATE TYPE "SalesChannel(Kind|Adapter|Payout)" AS ENUM \(/i.test(s) ||
        /^CREATE TABLE (IF NOT EXISTS )?"SalesChannel" \(/i.test(s) ||
        /^CREATE (UNIQUE )?INDEX (IF NOT EXISTS )?"[^"]+" ON "SalesChannel"/i.test(s) ||
        (/^ALTER TABLE "PosSale" ADD COLUMN /i.test(s) && s.replace(/^ALTER TABLE "PosSale" /i, "").split(/,\s*(?=ADD\b)/i).every((c) => /^ADD COLUMN /i.test(c.trim())));
      const bad = stmts.filter((s) => !ok(s) || /\b(DROP|RENAME|TRUNCATE|DELETE FROM|UPDATE "|ALTER COLUMN|SET NOT NULL)\b/i.test(s));
      if (bad.length) p.push(`${name}: คำสั่งที่ไม่อยู่ในรายการอนุญาต (${short(bad[0], 80)})`);
      const all = stmts.join(";\n") + "\n" + typesInDo;
      if (!/ALTER TYPE "PosPayType" ADD VALUE IF NOT EXISTS 'PLATFORM'/i.test(all)) p.push("ไม่มี ADD VALUE IF NOT EXISTS 'PLATFORM'");
      for (const e of ["SalesChannelKind", "SalesChannelAdapter", "SalesChannelPayout"]) if (!new RegExp(`CREATE\\s+TYPE\\s+"${e}"`, "i").test(all)) p.push(`ไม่มี CREATE TYPE "${e}"`);
      const ct = /CREATE TABLE (?:IF NOT EXISTS )?"SalesChannel" \(([\s\S]*?)\);?$/im.exec(stmts.find((s) => /^CREATE TABLE (IF NOT EXISTS )?"SalesChannel"/i.test(s)) ?? "");
      if (!ct) p.push('ไม่มี CREATE TABLE "SalesChannel"');
      else {
        const miss = SC_COLS.filter((c) => !new RegExp(`"${c}"`).test(ct[1]!));
        if (miss.length) p.push(`CREATE TABLE ขาด ${miss.join(",")}`);
      }
      if (!/CREATE UNIQUE INDEX (IF NOT EXISTS )?"[^"]+" ON "SalesChannel" ?\( ?"unitId" ?, ?"code" ?\)/i.test(all)) p.push('ไม่มี unique index SalesChannel("unitId","code")');
      const added = stmts
        .filter((s) => /^ALTER TABLE "PosSale" ADD COLUMN/i.test(s))
        .flatMap((s) => [...s.matchAll(/ADD COLUMN (?:IF NOT EXISTS )?"(\w+)"\s+([^,]+)/gi)].map((m) => [m[1]!, m[2]!.trim()] as const));
      const names = added.map(([n]) => n).sort();
      if (short(names) !== short([...SALE_COLS].sort())) p.push(`PosSale ADD COLUMN = ${names.join(",") || "—"} (คาด 6 ตัวของบรีฟ)`);
      for (const [n, def] of added) {
        if (/^channelCommission(Vat)?Satang$/.test(n) && !/^INTEGER NOT NULL DEFAULT 0$/i.test(def)) p.push(`${n} ${def} (คาด INTEGER NOT NULL DEFAULT 0)`);
        if (n === "channelPayout" && !/^"SalesChannelPayout"$/i.test(def)) p.push(`channelPayout ${def}`);
      }
    }
    chk("ST1", p.length === 0, "SalesChannel + 3 enum + PLATFORM + PosSale 6 คอลัมน์ + migration เดียวเพิ่มล้วน", P8(p) || `ครบ (${dirs[0] ?? "—"})`);
  }
  // ST2 ลงทะเบียน
  {
    const p: string[] = [];
    if (!/\bSalesChannel\s*:/.test(srcOf(F.scope))) p.push("scope.ts ไม่มี SalesChannel");
    const env = srcOf(F.qcEnv);
    const pm = env.slice(env.indexOf("export const POS_MODELS"), env.indexOf("export type PosModelKey"));
    if (!/\bsalesChannel\s*:\s*\{[^}]*model:\s*"SalesChannel"/.test(pm)) p.push("pos-qc-env POS_MODELS ไม่มี salesChannel {model: \"SalesChannel\"}");
    const fut = constBody(env, "export const POS_FUTURE_MODELS");
    if (/"SalesChannel"/.test(fut)) p.push("SalesChannel ยังอยู่ใน POS_FUTURE_MODELS");
    const perms = srcOf(F.perms);
    const pm2 = new RegExp(`["']${PERM_MANAGE.replace(/\./g, "\\.")}["']\\s*:\\s*["']([^"']+)["']`).exec(perms);
    if (!pm2) p.push(`permissions.ts ไม่มีคีย์ "${PERM_MANAGE}"`);
    else if (!pm2[1]!.includes(PERM_LABEL)) p.push(`ป้าย ${PERM_MANAGE} = ${short(pm2[1], 60)}`);
    const svcSrc = srcOf(F.service);
    const union = svcSrc.slice(Math.max(0, svcSrc.indexOf("export type PosSaleErrorCode")), Math.max(0, svcSrc.indexOf("export class PosSaleError")));
    for (const c of ["CHANNEL_INVALID", "CHANNEL_PAY_MISMATCH"]) if (!new RegExp(`["']${c}["']`).test(union)) p.push(`PosSaleErrorCode ไม่มี ${c}`);
    const rs = srcOf(F.regShared);
    const ru = rs.slice(rs.indexOf("export type RegisterRefusalCode"), rs.indexOf("export type RegisterRefusal ="));
    const rk = constBody(rs, "const REFUSAL_KEY");
    for (const c of CH_CODES) {
      if (!new RegExp(`["']${c}["']`).test(ru)) p.push(`RegisterRefusalCode ไม่มี ${c}`);
      if (!new RegExp(`\\b${c}\\s*:\\s*["']errors\\.${camel(c)}["']`).test(rk)) p.push(`REFUSAL_KEY ไม่มี ${c} → errors.${camel(c)}`);
    }
    for (const [lang, f] of [["th", F.msgTh], ["en", F.msgEn]] as const) {
      let j: Any = null;
      try {
        j = JSON.parse(rd(f) || "null");
      } catch (e) {
        p.push(`${f} อ่าน JSON ไม่ได้: ${(e as Error).message.slice(0, 40)}`);
      }
      const errs = j?.register?.errors;
      const miss = CH_CODES.map(camel).filter((k) => typeof errs?.[k] !== "string" || !String(errs[k]).trim());
      if (miss.length) p.push(`${lang}: register.errors ขาด ${miss.join(",")}`);
      if (lang === "th") {
        const notThai = CH_CODES.map(camel).filter((k) => typeof errs?.[k] === "string" && !THAI.test(errs[k]));
        if (notThai.length) p.push(`th: register.errors ไม่ใช่ไทย ${notThai.join(",")}`);
      }
      const ch = j?.channel;
      const leaves = (o: unknown): string[] => (typeof o === "string" ? [o] : isRecord(o) ? Object.values(o).flatMap(leaves) : []);
      if (!isRecord(ch) || leaves(ch).length === 0) p.push(`${lang}: ไม่มีก้อนข้อความ channel.*`);
      else if (lang === "th" && !leaves(ch).some((s) => THAI.test(s))) p.push("th: channel.* ไม่มีข้อความไทย");
      if (typeof j?.shift?.method?.PLATFORM !== "string") p.push(`${lang}: ไม่มี shift.method.PLATFORM`);
      if (typeof j?.receipt?.public?.pay?.PLATFORM !== "string") p.push(`${lang}: ไม่มี receipt.public.pay.PLATFORM`);
    }
    chk("ST2", p.length === 0, "scope · pos-qc-env · สิทธิ์ · รหัสปฏิเสธ · ข้อความ th/en", P8(p) || "ครบ");
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
    if (!exportsFn(acc, "applyExternalChannelCommission")) p.push("account/index.ts ไม่ export applyExternalChannelCommission");
    for (const k of ["PLATFORM_RECEIVABLE", "PLATFORM_COMMISSION"]) if (!new RegExp(`["']${k}["']`).test(acc)) p.push(`account/index.ts ไม่มีคีย์ ${k} (§9 Q1)`);
    for (const fn of ["applyExternalSale", "applyExternalRefund"]) {
      const i = acc.indexOf(`export async function ${fn}`);
      const sig = i >= 0 ? acc.slice(i, acc.indexOf("Promise<", i)) : "";
      // ยูเนียนเขียนตรง หรือผ่านชื่อชนิด (type X = … "PLATFORM" …) ก็ได้
      const alias = /channel\s*:\s*([A-Z]\w*)/.exec(sig)?.[1];
      const aliasSrc = alias ? new RegExp(`type\\s+${alias}\\s*=[^;]*;`).exec(acc)?.[0] ?? "" : "";
      if (!/channel\s*:[^;]*["']PLATFORM["']/.test(sig) && !/["']PLATFORM["']/.test(aliasSrc)) p.push(`${fn} ยูเนียนช่องทางไม่มี "PLATFORM"`);
    }
    if (!exportsFn(srcOf(F.gl), "postExternalChannelCommission")) p.push("gl.ts ไม่ export postExternalChannelCommission");
    const br = srcOf(F.bridge);
    const chOf = br.slice(br.indexOf("function channelOf"), br.indexOf("}", br.indexOf("default:", br.indexOf("function channelOf"))));
    if (!/case\s+["']PLATFORM["']/.test(chOf)) p.push("account-bridge channelOf ไม่มี case PLATFORM (ห้ามตกไป TRANSFER)");
    if (!/applyExternalChannelCommission\s*\(/.test(br)) p.push("account-bridge ไม่เรียก applyExternalChannelCommission");
    // ขาย + คืนเงิน = อย่างน้อย 2 จุดเรียก (ใน account-bridge หรือ refund-consumer · ทั้งคู่ผ่าน facade)
    const calls = (srcOf(F.refundCons) + "\n" + br).match(/applyExternalChannelCommission\s*\(/g)?.length ?? 0;
    if (calls < 2) p.push(`applyExternalChannelCommission ถูกเรียก ${calls} จุดใน account-bridge+refund-consumer (คาด ≥ 2: ขาย + คืนเงิน)`);
    const ch = srcOf(F.svc);
    if (!exportsFn(ch, "ensureUnitChannels")) p.push("channel.ts ไม่ export ensureUnitChannels");
    else if (!/createMany\s*\(\s*\{[\s\S]{0,400}skipDuplicates\s*:\s*true/.test(ch)) p.push("ensureUnitChannels ไม่ใช้ createMany({skipDuplicates:true}) (R2)");
    if (/\.salesChannel\s*\.\s*(create|update|upsert|delete)\b/.test(srcOf(F.service))) p.push("service.ts เขียน salesChannel ตรง (ต้องผ่าน channel.ts)");
    if (!/defaultChannelCode\s*\(/.test(srcOf(F.service) + ch)) p.push("createSale ไม่ใช้ defaultChannelCode");
    if (!/P2\.2\s*▸\s*channel price here/.test(rd(F.register))) p.push("register.ts ไม่มีรอยต่อ // P2.2 ▸ channel price here ◂");
    if (existsSync(join(ROOT, F.shared)) && !purePath(F.shared)) p.push("channel-shared.ts import prisma/db/โมดูลฝั่งเซิร์ฟเวอร์ (ต้องบริสุทธิ์)");
    for (const d of ["shop", "restaurant", "hotel", "booking", "ticket", "clinic", "school", "rental"]) {
      const hits = walk(`src/lib/modules/${d}`).filter((f) => /\bchannelId\b|\bchannelRef\b/.test(srcOf(f)) && /createSale/.test(srcOf(f)));
      if (hits.length) p.push(`${d} แตะ channelId ในไฟล์ที่เรียก createSale (${hits.map((h) => h.split("/").pop()).join(",")} · CD2 ห้าม)`);
    }
    if (!/const\s+EXTERNAL_PAY_TYPES\s*=\s*\[\s*"CASH"\s*,\s*"TRANSFER"\s*,\s*"PROMPTPAY"\s*\]\s*as\s+const/.test(srcOf(F.restOps))) p.push("REST EXTERNAL_PAY_TYPES เปลี่ยน (Q8: คงเดิมถึง P2.13)");
    chk("ST3", p.length === 0, "pos→account ผ่าน facade · facade/gl ครบ · PLATFORM ไม่ตก TRANSFER · builtins race-free · CD2 · REST เดิม", P8(p) || `ครบ (${posFiles.length} ไฟล์ pos)`);
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
      if (!/^["']use server["']/.test(first)) p.push('channel-actions.ts: "use server" ไม่ใช่คำสั่งแรก');
      const s = stripComments(raw);
      if (!/requireTenant\s*\(/.test(s)) p.push("channel-actions.ts ไม่เรียก requireTenant");
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
    chk("ST4", p.length === 0, "use server = async function ล้วน · 3 actions", p.slice(0, 8).join(" · ") || `ครบ (${files.length} ไฟล์ use server)`);
  }
  // ST5 รายการชนิดจ่าย
  {
    const p: string[] = [];
    const svc = srcOf(F.service);
    if (!/"PLATFORM"/.test(constBody(svc, "export const PAY_TYPE_ORDER"))) p.push("PAY_TYPE_ORDER ไม่มี PLATFORM");
    const lbl = constBody(svc, "export const PAY_TYPE_LABEL_TH");
    if (!new RegExp(`PLATFORM\\s*:\\s*["']${PLATFORM_LABEL}["']`).test(lbl)) p.push(`PAY_TYPE_LABEL_TH.PLATFORM ≠ "${PLATFORM_LABEL}"`);
    if (!new RegExp(`PLATFORM\\s*:\\s*["']${PLATFORM_LABEL}["']`).test(constBody(srcOf(F.labels), "export const POS_PAY_TYPE_LABEL"))) p.push(`POS_PAY_TYPE_LABEL.PLATFORM ≠ "${PLATFORM_LABEL}"`);
    if (!/"PLATFORM"/.test(constBody(srcOf(F.refundShared), "export const REFUND_PAY_TYPES"))) p.push("REFUND_PAY_TYPES ไม่มี PLATFORM");
    if (!/"PLATFORM"/.test(constBody(srcOf(F.regShared), "export const REGISTER_PAY_TYPES"))) p.push("REGISTER_PAY_TYPES ไม่มี PLATFORM");
    if (!/"PLATFORM"/.test(constBody(srcOf(F.shift), "const METHOD_ORDER"))) p.push("shift METHOD_ORDER ไม่มี PLATFORM");
    const rt = srcOf(F.render);
    if (!/export\s+type\s+ReceiptPayType\s*=[^;]*"PLATFORM"/.test(rt)) p.push("receipt-render ReceiptPayType ไม่มี PLATFORM");
    chk("ST5", p.length === 0, "PLATFORM ในทุกรายการ · ป้าย แพลตฟอร์ม", p.join(" · ") || "ครบ");
  }
  // S8 สัญญา createSale
  {
    const p: string[] = [];
    let j: Any = null;
    try {
      j = JSON.parse(rd(F.contract) || "null");
    } catch (e) {
      p.push(`อ่าน ${F.contract} ไม่ได้: ${(e as Error).message.slice(0, 50)}`);
    }
    if (CONTRACT_BASE_FIELDS.length !== CONTRACT_BASE_KEYS) p.push(`(ข้อสอบ) ฐาน ${CONTRACT_BASE_FIELDS.length} ฟิลด์ ≠ ${CONTRACT_BASE_KEYS}`);
    const h = contractBaseHash(j, CONTRACT_BASE_FIELDS);
    if (h !== CONTRACT_BASE_HASH) p.push(`ของเดิมเปลี่ยน (แฮช ${h} ≠ ฐาน ${CONTRACT_BASE_HASH})`);
    const cs = isRecord(j?.types?.CreateSaleInput) ? j.types.CreateSaleInput : {};
    const extra = Object.keys(cs).filter((k) => !CONTRACT_BASE_FIELDS.includes(k)).sort();
    if (short(extra) !== short(["channelId", "channelRef"])) p.push(`ฟิลด์ใหม่ = ${extra.join(",") || "—"} (คาด channelId,channelRef)`);
    for (const k of ["channelId", "channelRef"]) if (cs[k] && (cs[k].optional !== true || cs[k].type !== "string")) p.push(`${k} = ${short(cs[k], 60)} (คาด optional string)`);
    chk("S8", p.length === 0, "ของเดิมตรงฐาน · เพิ่ม channelId? channelRef? พอดี", p.join(" · ") || `ครบ (${Object.keys(cs).length} ฟิลด์)`);
  }
}

// ═════════════════════════ 1b. คณิตบริสุทธิ์ (ไม่แตะ DB) ═════════════════════════
/** PRNG ตายตัว (mulberry32) — 200 กรณีของ B3 ทำซ้ำได้ */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
async function runPure(shared: Any, regShared: Any): Promise<void> {
  console.log("\n── B คณิตบริสุทธิ์ ──");
  const NS = (fn: string) => (shared && typeof shared[fn] === "function" ? "" : `${MISSING} ${fn} (channel-shared.ts) · `);
  const comm = (g: number, bp: number, fixed: number, vatBp: number) => callSync(shared, "channelCommission", g, { commissionBp: bp, commissionFixedSatang: fixed, commissionVatBp: vatBp });
  // B1
  {
    const p: string[] = [];
    const cases: [string, number, number, number, number, number][] = [
      ["฿420×30%", 42000, 3000, 0, 0, 12600],
      ["฿310×25%+฿2", 31000, 2500, 200, 0, 7950],
      ["1×50% (.5)", 1, 5000, 0, 0, 1],
      ["3×50% (1.5)", 3, 5000, 0, 0, 2],
      ["12345×30% (3703.5)", 12345, 3000, 0, 0, 3704],
      ["clamp 1000×100%+500", 1000, 10000, 500, 0, 1000],
      ["ยอด 0", 0, 3000, 200, 700, 0],
      ["fixed ล้วน", 10000, 0, 1500, 0, 1500],
      ["bp 0 fixed 0", 50000, 0, 0, 0, 0],
    ];
    for (const [lbl, g, bp, fx, vb, want] of cases) {
      if (refCommission(g, bp, fx, vb).commissionSatang !== want) p.push(`(ข้อสอบ) ${lbl} ตัวอ้างอิง ${refCommission(g, bp, fx, vb).commissionSatang}`);
      const r = comm(g, bp, fx, vb);
      if (!isRecord(r) || r.ok === false) p.push(`${lbl} → ${codeOf(r)}`);
      else {
        if (r.commissionSatang !== want) p.push(`${lbl} = ${r.commissionSatang} (คาด ${want})`);
        const keys = Object.keys(r).sort();
        if (short(keys) !== short(["commissionSatang", "commissionVatSatang"])) p.push(`${lbl} คีย์ ${keys.join(",")}`);
      }
    }
    chk("B1", NS("channelCommission") === "" && p.length === 0, "9 กรณี · ครึ่งขึ้น · clamp · 0", NS("channelCommission") + (p.slice(0, 8).join(" · ") || "ครบ"));
  }
  // B2
  {
    const p: string[] = [];
    const cases: [string, number, number, number, number, number][] = [
      ["GRAB 7950×7%", 31000, 2500, 200, 700, 557],
      ["125×7% (8.75)", 12500, 100, 0, 700, 9],
      ["vat 0", 42000, 3000, 0, 0, 0],
      ["ไม่มีค่าคอมฯ", 42000, 0, 0, 700, 0],
      ["clamp แล้ว VAT", 1000, 10000, 500, 700, 70],
    ];
    for (const [lbl, g, bp, fx, vb, want] of cases) {
      if (refCommission(g, bp, fx, vb).commissionVatSatang !== want) p.push(`(ข้อสอบ) ${lbl} ตัวอ้างอิง ${refCommission(g, bp, fx, vb).commissionVatSatang}`);
      const r = comm(g, bp, fx, vb);
      if (!isRecord(r) || r.commissionVatSatang !== want) p.push(`${lbl} VAT = ${short(r?.commissionVatSatang ?? codeOf(r), 30)} (คาด ${want})`);
    }
    chk("B2", NS("channelCommission") === "" && p.length === 0, "5 กรณี VAT ค่าคอมฯ ครึ่งขึ้น", NS("channelCommission") + (p.join(" · ") || "ครบ"));
  }
  // B3
  {
    const p: string[] = [];
    const share = (sale: Any, gross: number, full: boolean, prior: Any) => callSync(shared, "channelRefundShare", sale, { grossSatang: gross, full }, prior);
    // ตัวอย่างบรีฟ
    {
      const sale = { grandTotalSatang: 42000, channelCommissionSatang: 12600, channelCommissionVatSatang: 0 };
      const a = share(sale, 12345, false, { commissionSatang: 0, commissionVatSatang: 0 });
      const b = share(sale, 14321, false, { commissionSatang: a?.commissionSatang ?? 0, commissionVatSatang: 0 });
      const c = share(sale, 15334, true, { commissionSatang: (a?.commissionSatang ?? 0) + (b?.commissionSatang ?? 0), commissionVatSatang: 0 });
      const got = [a?.commissionSatang, b?.commissionSatang, c?.commissionSatang];
      if (short(got) !== short([3704, 4296, 4600])) p.push(`ตัวอย่างบรีฟ ${short(got)} (คาด [3704,4296,4600])`);
    }
    const R = rng(21_021);
    let bad = 0;
    let firstBad = "";
    for (let i = 0; i < 200; i++) {
      const grand = 100 + Math.floor(R() * 999_900);
      const bp = Math.floor(R() * 10_001);
      const fixed = R() < 0.4 ? Math.floor(R() * 5000) : 0;
      const vatBp = R() < 0.5 ? 700 : Math.floor(R() * 10_001);
      const ref = refCommission(grand, bp, fixed, vatBp);
      const c0 = comm(grand, bp, fixed, vatBp);
      const sale = { grandTotalSatang: grand, channelCommissionSatang: c0?.commissionSatang ?? ref.commissionSatang, channelCommissionVatSatang: c0?.commissionVatSatang ?? ref.commissionVatSatang };
      const cut1 = 1 + Math.floor(R() * (grand - 2));
      const cut2 = cut1 + Math.floor(R() * (grand - cut1 - 1));
      const parts = [cut1, cut2 - cut1, grand - cut2].filter((x) => x > 0);
      let priorC = 0;
      let priorV = 0;
      const got: [number, number][] = [];
      for (let k = 0; k < parts.length; k++) {
        const full = k === parts.length - 1;
        const r = share(sale, parts[k]!, full, { commissionSatang: priorC, commissionVatSatang: priorV });
        const c = Number(r?.commissionSatang);
        const v = Number(r?.commissionVatSatang);
        const wantC = full ? sale.channelCommissionSatang - priorC : halfUp(sale.channelCommissionSatang, parts[k]!, grand);
        const wantV = full ? sale.channelCommissionVatSatang - priorV : halfUp(sale.channelCommissionVatSatang, parts[k]!, grand);
        if (c !== wantC || v !== wantV || c < 0 || v < 0) {
          bad++;
          if (!firstBad) firstBad = `#${i} grand ${grand} part ${parts[k]} full ${full} → ${c}/${v} (คาด ${wantC}/${wantV})`;
        }
        got.push([c, v]);
        priorC += c;
        priorV += v;
      }
      if (priorC !== sale.channelCommissionSatang || priorV !== sale.channelCommissionVatSatang) {
        bad++;
        if (!firstBad) firstBad = `#${i} Σ ${priorC}/${priorV} ≠ ${sale.channelCommissionSatang}/${sale.channelCommissionVatSatang}`;
      }
    }
    if (bad) p.push(`${bad} จุดผิดใน 200 กรณี · ${firstBad}`);
    chk("B3", NS("channelRefundShare") === "" && p.length === 0, "ตัวอย่างบรีฟ + 200 กรณี Σ เป๊ะ", NS("channelRefundShare") + (p.join(" · ") || "ครบ"));
  }
  // B4
  {
    const p: string[] = [];
    const parse = (x: unknown) => callSync(shared, "parseChannelInput", x);
    const base = { code: "LINEMAN", name: "  LINE MAN  ", payout: "PLATFORM", commissionBp: 3000 };
    const r0 = parse(base);
    if (r0?.ok !== true) p.push(`ตัวถูก → ${codeOf(r0)} ${short(r0?.message ?? "", 60)}`);
    else {
      if (r0.value?.name !== "LINE MAN") p.push(`name ไม่ตัดช่องว่าง (${short(r0.value?.name, 30)})`);
      const extra = Object.keys(r0.value ?? {}).filter((k) => !INPUT_KEYS.includes(k));
      if (extra.length) p.push(`value คีย์เกิน ${extra.join(",")}`);
    }
    const oks: [string, Any][] = [
      ["แก้ (id ไม่มี code)", { id: "c_abc123", name: "ใหม่" }],
      ["bp 0", { ...base, commissionBp: 0 }],
      ["bp 10000", { ...base, commissionBp: 10000 }],
      ["fixed 1000000", { ...base, commissionFixedSatang: 1_000_000 }],
      ["vat 10000", { ...base, commissionVatBp: 10000 }],
      ["code AB", { ...base, code: "AB" }],
      ["code 24 ตัว", { ...base, code: `C${"X".repeat(23)}` }],
      ["CUSTOM_AGENT DIRECT", { code: "CUSTOM_AGENT", name: "ตัวแทน", payout: "DIRECT", commissionBp: 1000, adapter: "NONE", active: true, sortOrder: 5 }],
    ];
    for (const [lbl, x] of oks) {
      const r = parse(x);
      if (r?.ok !== true) p.push(`${lbl} → ${codeOf(r)}`);
    }
    const bads: [string, Any][] = [
      ["คีย์แปลก", { ...base, foo: 1 }],
      ["code lineman", { ...base, code: "lineman" }],
      ["code L", { ...base, code: "L" }],
      ["code 1ABC", { ...base, code: "1ABC" }],
      ["code 25 ตัว", { ...base, code: `C${"X".repeat(24)}` }],
      ["bp −1", { ...base, commissionBp: -1 }],
      ["bp 10001", { ...base, commissionBp: 10001 }],
      ["bp 1.5", { ...base, commissionBp: 1.5 }],
      ["bp สตริง", { ...base, commissionBp: "3000" }],
      ["fixed 1000001", { ...base, commissionFixedSatang: 1_000_001 }],
      ["vat 10001", { ...base, commissionVatBp: 10001 }],
      ["payout X", { ...base, payout: "X" }],
      ["adapter X", { ...base, adapter: "X" }],
      ["ชื่อว่าง", { ...base, name: "   " }],
      ["ไม่มีชื่อ", { code: "LINEMAN" }],
      ["null", null],
      ["อาร์เรย์", [base]],
      ["สตริง", "LINEMAN"],
    ];
    for (const [lbl, x] of bads) {
      const r = parse(x);
      if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)}${r?.threw ? " (throw)" : ""}`);
    }
    chk("B4", NS("parseChannelInput") === "" && p.length === 0, "ตัวถูก 9 · ผิด 18 แบบ VALIDATION", NS("parseChannelInput") + (p.slice(0, 8).join(" · ") || "ครบ"));
  }
  // B5
  {
    const p: string[] = [];
    const tbl: [unknown, string][] = [["ECOM", "WEB"], ...["POS", "RESTAURANT", "HOTEL", "BOOKING", "TICKET", "CLINIC", "SCHOOL", "RENTAL", "MEMBER", "AI", "XYZ", ""].map((m): [unknown, string] => [m, "STORE"]), [null, "STORE"], [undefined, "STORE"]];
    for (const [m, want] of tbl) {
      const r = callSync(shared, "defaultChannelCode", m);
      if (r !== want) p.push(`${short(m, 12)} → ${short(r, 30)} (คาด ${want})`);
    }
    if (short(shared?.CHANNEL_BUILTIN_CODES) !== short(Object.keys(BUILTINS))) p.push(`CHANNEL_BUILTIN_CODES ${short(shared?.CHANNEL_BUILTIN_CODES, 60)}`);
    if (short(shared?.CHANNEL_EXTERNAL_PRESETS) !== short(PRESETS)) p.push(`CHANNEL_EXTERNAL_PRESETS ${short(shared?.CHANNEL_EXTERNAL_PRESETS, 80)}`);
    if (shared?.CHANNEL_LIMIT_PER_UNIT !== 30) p.push(`CHANNEL_LIMIT_PER_UNIT ${short(shared?.CHANNEL_LIMIT_PER_UNIT, 10)}`);
    if (shared?.CHANNEL_REF_MAX !== 40) p.push(`CHANNEL_REF_MAX ${short(shared?.CHANNEL_REF_MAX, 10)}`);
    for (const c of CH_CODES) {
      const k = callSync(regShared, "refusalMessageKey", c);
      if (k !== `errors.${camel(c)}`) p.push(`refusalMessageKey(${c}) = ${short(k, 40)}`);
    }
    chk("B5", NS("defaultChannelCode") === "" && p.length === 0, "ตาราง 15 แถว · ค่าคงที่ 4 · คีย์ข้อความ 6", NS("defaultChannelCode") + (p.slice(0, 8).join(" · ") || "ครบ"));
  }
}

// ═════════════════════════ 1c. --no-db ═════════════════════════
if (NODB) {
  const ids = [...STATIC_IDS, ...PURE_IDS];
  console.log(`[${SUITE}] --no-db: รัน ${ids.length} ข้อ (สถิต + คณิตบริสุทธิ์ · ไม่โหลด prisma)`);
  let crashedS = "";
  try {
    await runStatic();
    const shared = existsSync(join(ROOT, F.shared)) && purePath(F.shared) ? await tryImport("@/lib/modules/pos/channel-shared") : null;
    if (existsSync(join(ROOT, F.shared)) && !purePath(F.shared)) console.log("  ⚠️  channel-shared.ts ไม่บริสุทธิ์ — --no-db ไม่โหลด (B แดง)");
    const regShared = purePath(F.regShared) ? await tryImport("@/lib/modules/pos/register-shared") : null;
    if (!regShared) console.log("  ⚠️  register-shared.ts ไม่บริสุทธิ์/โหลดไม่ได้ — refusalMessageKey ตรวจไม่ได้ (B5 แดง)");
    await runPure(shared, regShared);
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
const SC: Any = typeof P.salesChannel?.findMany === "function" ? P.salesChannel : null;
if (!SC) skipReasons.push("Prisma client ยังไม่มี delegate salesChannel (R1)");
const dbCols = new Set<string>();
try {
  const rows = (await P.$queryRawUnsafe(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('PosSale','SalesChannel')`)) as Any[];
  for (const r of rows) dbCols.add(`${r.table_name}.${r.column_name}`);
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
let enumPlatform = false;
try {
  const r = (await P.$queryRawUnsafe(`SELECT 1 AS x FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'PosPayType' AND e.enumlabel = 'PLATFORM'`)) as Any[];
  enumPlatform = r.length > 0;
} catch {
  /* ข้อมูล */
}
const COL = { sale: SALE_COLS.every((c) => dbCols.has(`PosSale.${c}`)), table: dbCols.has("SalesChannel.code") };
if (!COL.sale) skipReasons.push(`ฐาน QC4 ยังไม่มีคอลัมน์ PosSale.${SALE_COLS.filter((c) => !dbCols.has(`PosSale.${c}`)).join("/")}`);
if (!COL.table) skipReasons.push("ฐาน QC4 ยังไม่มีตาราง SalesChannel");
if (!enumPlatform) skipReasons.push("ฐาน QC4 ยังไม่มีค่า PosPayType.PLATFORM");

const COUNT_MODELS = ["posSale", "posSaleLine", "posPayment", "posDevice", "outboxEvent", "auditLog", "accountJournalEntry", "accountContact"] as const;
async function snapshotCounts(): Promise<Record<string, number | string>> {
  const out: Record<string, number | string> = {};
  for (const tid of TIDS)
    for (const m of COUNT_MODELS) {
      const d = P[m];
      out[`${tid}.${m}`] = typeof d?.count === "function" ? await d.count({ where: { tenantId: tid } }).catch((e: Error) => `err:${e.message.slice(0, 30)}`) : "absent";
    }
  return out;
}
/** ลายนิ้วมือ SalesChannel ของร้านที่ไม่ใช่ร้านชั่วคราว (ข้อมูล — lane อื่นที่ใช้โค้ดใหม่อาจสร้าง builtins ได้) */
async function channelFingerprint(exclude: string[]): Promise<string> {
  if (!COL.table) return "ไม่มีตาราง";
  try {
    const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n, coalesce(max("updatedAt")::text,'-') AS m FROM "SalesChannel" WHERE NOT ("tenantId" = ANY($1::text[]))`, exclude)) as Any[];
    return `${r[0]?.n ?? "?"}@${r[0]?.m ?? "?"}`;
  } catch (e) {
    return `err:${(e as Error).message.slice(0, 40)}`;
  }
}
const countsBefore = await snapshotCounts();

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P2.1 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อมูล: seed ${seedOk ? "มี" : "ไม่มี"} · ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length, seed: seedOk })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const ex = (f: string) => existsSync(join(ROOT, f));
const sharedMod = ex(F.shared) ? await tryImport("@/lib/modules/pos/channel-shared") : null;
const chMod = ex(F.svc) ? await tryImport("@/lib/modules/pos/channel") : null;
const svc = await tryImport("@/lib/modules/pos/service");
const register = await tryImport("@/lib/modules/pos/register");
const regSharedMod = await tryImport("@/lib/modules/pos/register-shared");
const heldMod = await tryImport("@/lib/modules/pos/held-cart");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const rcpMod = await tryImport("@/lib/modules/pos/receipt");
const renderMod = await tryImport("@/lib/modules/pos/receipt-render");
const billsMod = await tryImport("@/lib/modules/pos/bills");
const pubMod = await tryImport("@/lib/modules/pos/public-receipt");
const reportsMod = await tryImport("@/lib/modules/pos/reports");
const paySetMod = await tryImport("@/lib/modules/pos/payment-settings");
const shopMod = await tryImport("@/lib/modules/shop/service");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const consMod = await tryImport("@/lib/outbox-consumers");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p2.1-${RAND}`;
const T_SLUG = `posqc-p21-${RAND}`;
const T2_SLUG = `posqc-p21-${RAND}-t2`;
const KEY_PREFIX = `qc21-${RAND}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";
let T2 = "";
const RUN_START = Date.now();
const MIN = 60_000;

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
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !STATIC_IDS.includes(id) && !PURE_IDS.includes(id) && id !== "P2.1-Z1" && id !== "P2.1-Z2");
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
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (+ ${T2_SLUG}) · DB ${HOST} ──`);
  console.log("   POS-A ผูกสมุดจด VAT · สาขา A A2 F · POS-B ไม่ผูกสมุด สาขา B · POS-C ผูกสมุดไม่จด VAT + ค่าบริการ 10% สาขา C · ร้าน T2 สาขา X");
  let fx = "";
  const S: Record<string, string> = {};
  const U: Record<string, string> = {};
  const ownerId: string = PQC.coffee.users.owner.userId;
  const cashierId: string = PQC.coffee.users.cashier.userId;
  try {
    const t = await P.tenant.create({ data: { name: `QC P2.1 ช่องทางขาย ${RAND}`, slug: T_SLUG } });
    T = t.id;
    const t2 = await P.tenant.create({ data: { name: `QC P2.1 ร้านที่สอง ${RAND}`, slug: T2_SLUG } });
    T2 = t2.id;
    for (const k of ["A", "A2", "F", "B", "C"]) U[k] = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขา${k}`, slug: `${T_SLUG}-${k.toLowerCase()}` } })).id;
    U.X = (await P.businessUnit.create({ data: { tenantId: T2, type: "SHOP", name: `${TAG} สาขาX`, slug: `${T2_SLUG}-x` } })).id;
    S.POSA = (await sysSvc.createSystem(T, "POS", "POS-A (ผูกบัญชี VAT)")).id;
    S.POSB = (await sysSvc.createSystem(T, "POS", "POS-B (ไม่ผูกบัญชี)")).id;
    S.POSC = (await sysSvc.createSystem(T, "POS", "POS-C (บัญชีไม่จด VAT)")).id;
    S.ACCV = (await sysSvc.createSystem(T, "ACCOUNT", "บัญชี VAT QC P2.1")).id;
    S.ACCN = (await sysSvc.createSystem(T, "ACCOUNT", "บัญชีไม่จด VAT QC P2.1")).id;
    S.POSX = (await sysSvc.createSystem(T2, "POS", "POS ร้าน T2")).id;
    await accSvc.saveSettings(T, S.ACCV, { orgName: "ร้านช่องทางคิวซี จำกัด", taxId: "0105561177639", vatRegistered: true });
    await accSvc.saveSettings(T, S.ACCN, { orgName: "ร้านช่องทางคิวซี (ไม่จด VAT)", vatRegistered: false });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACCV });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACCN });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACCV, linkedKind: "POS", linkedId: S.POSA } });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACCN, linkedKind: "POS", linkedId: S.POSC } });
    for (const k of ["A", "A2", "F"]) await sysSvc.linkUnit(T, S.POSA, U[k]);
    await sysSvc.linkUnit(T, S.POSB, U.B);
    await sysSvc.linkUnit(T, S.POSC, U.C);
    await sysSvc.linkUnit(T2, S.POSX, U.X);
    await P.paymentProfile.create({ data: { tenantId: T, promptpayId: "0812345678", displayName: `ร้าน P2.1 ${RAND}` } });
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const NCOL = () => (!COL.sale ? `${MISSING} คอลัมน์ PosSale.channel* · ` : "") + (!COL.table ? `${MISSING} ตาราง SalesChannel · ` : "") + (!enumPlatform ? `${MISSING} PosPayType.PLATFORM · ` : "");

  // ─── ผู้กระทำ ───
  const owner = { userId: ownerId, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const manager = { userId: cashierId, role: "MANAGER", unitAccess: [U.A, U.A2, U.F, U.B, U.C], permissions: {} };
  const staff = { userId: cashierId, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.create": true } };
  const staffRead = { userId: cashierId, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.read": true } };
  const staffReport = { userId: cashierId, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.read": true, "pos.report.view": true } };
  const nobody = { userId: cashierId, role: "STAFF", unitAccess: [U.A], permissions: {} };
  const sysOf = (k: string) => (k === "B" ? S.POSB : k === "C" ? S.POSC : k === "X" ? S.POSX : S.POSA);
  const tenOf = (k: string) => (k === "X" ? T2 : T);
  const ctxOf = (k: string, deviceId?: string): Any => ({ tenantId: tenOf(k), systemId: sysOf(k), unitId: U[k], ...(deviceId ? { deviceId } : {}) });
  const rctx = (k: string): Any => ({ tenantId: tenOf(k), systemId: sysOf(k) });

  // ─── เครื่อง + กะ (สาขา A) ───
  const DEV1 = `qc21${RAND}d1`;
  let SHIFT1 = "";
  if (!fx) {
    const rg = await call(devMod, "registerDevice", ctxOf("A"), owner, { name: "เคาน์เตอร์ QC P2.1", deviceCode: DEV1 });
    if (rg?.ok !== true) console.log(`  ⚠️  registerDevice: ${codeOf(rg)} ${short(rg?.message ?? "", 80)}`);
    const o1 = await call(shiftMod, "openShift", ctxOf("A", DEV1), owner, { deviceId: DEV1, deviceLabel: "เคาน์เตอร์ QC P2.1", floatSatang: 0 });
    if (o1?.ok !== true) fx = `เปิดกะ: ${codeOf(o1)} ${short(o1?.message ?? "", 80)}`;
    else SHIFT1 = String(o1.shift?.id ?? "");
    const ps = await call(paySetMod, "updatePosPaymentSettings", { tenantId: T, systemId: S.POSC }, owner, { serviceCharge: { enabled: true, rateBp: 1000 } });
    if (ps?.ok === false) console.log(`  ⚠️  ค่าบริการ POS-C: ${codeOf(ps)} ${short(ps?.message ?? "", 60)}`);
  }

  // ─── ตัวอ่าน ───
  const scRows = async (unitKey: string, includeArchived = true): Promise<Any[]> =>
    SC && U[unitKey] ? ((await SC.findMany({ where: { tenantId: tenOf(unitKey), unitId: U[unitKey], ...(includeArchived ? {} : { archivedAt: null }) }, orderBy: { code: "asc" } }).catch(() => [])) as Any[]) : [];
  const scCount = async (unitKey: string): Promise<number> => (SC && U[unitKey] ? Number(await SC.count({ where: { unitId: U[unitKey] } }).catch(() => -1)) : -1);
  const scRow = async (id: string): Promise<Any> => (SC && id ? SC.findUnique({ where: { id } }).catch(() => null) : null);
  const snap = async (id: string): Promise<Any> => {
    if (!id || !COL.sale) return null;
    const r = (await P.$queryRawUnsafe(
      `SELECT "channelId", "channelCode", "channelRef", "channelPayout"::text AS "channelPayout", "channelCommissionSatang", "channelCommissionVatSatang" FROM "PosSale" WHERE id = $1`,
      id,
    ).catch(() => [])) as Any[];
    return r[0] ?? null;
  };
  type Line = { code: string; debit: number; credit: number; contactId: string | null };
  type Entry = { id: string; refId: string; key: string; book: string; memo: string; status: string; needsReview: boolean; reversalOfId: string | null; lines: Line[] };
  const jv = async (refIds: string[]): Promise<Entry[]> => {
    const ids = refIds.filter(Boolean);
    if (!ids.length || !T) return [];
    const es = (await P.accountJournalEntry.findMany({ where: { tenantId: T, refType: "PosSale", refId: { in: ids } }, include: { lines: { include: { account: { select: { code: true } } } } }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[];
    return es.map((e: Any) => ({
      id: e.id,
      refId: e.refId,
      key: String(e.idempotencyKey ?? ""),
      book: String(e.book),
      memo: String(e.memo ?? ""),
      status: String(e.status),
      needsReview: !!e.needsReview,
      reversalOfId: e.reversalOfId ?? null,
      lines: (e.lines ?? []).map((l: Any) => ({ code: String(l.account?.code ?? "?"), debit: l.debit, credit: l.credit, contactId: l.contactId ?? null })),
    }));
  };
  const byKey = (es: Entry[], key: string) => es.filter((e) => e.key === key);
  /** ต่อรหัส: "รหัส:dr/cr" เรียง (รวมบรรทัดซ้ำรหัส) */
  const shape = (e: Entry | undefined): string => {
    if (!e) return "—";
    const m = new Map<string, [number, number]>();
    for (const l of e.lines) {
      const a = m.get(l.code) ?? [0, 0];
      m.set(l.code, [a[0] + l.debit, a[1] + l.credit]);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([c, [d, k]]) => `${c}:${d}/${k}`).join(" ");
  };
  const net = (es: Entry[]): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const l of es.flatMap((e) => e.lines)) m[l.code] = (m[l.code] ?? 0) + l.debit - l.credit;
    return m;
  };
  const events = async (type: string, pred: (p: Any) => boolean): Promise<Any[]> => ((await P.outboxEvent.findMany({ where: { tenantId: T, type } }).catch(() => [])) as Any[]).filter((e) => pred(e.payload ?? {}));
  const audits = async (action: string): Promise<Any[]> => ((await P.auditLog.findMany({ where: { tenantId: { in: [T, T2].filter(Boolean) }, action }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]);
  const tokenOf = async (id: string): Promise<string> => {
    if (!id) return "";
    const r = (await P.$queryRawUnsafe(`SELECT "publicToken" AS t FROM "PosSale" WHERE id = $1`, id).catch(() => [])) as Any[];
    return String(r[0]?.t ?? "");
  };
  const counts = async (): Promise<Record<string, number>> => ({
    sale: Number(await P.posSale.count({ where: { tenantId: T } }).catch(() => -1)),
    pay: Number(await P.posPayment.count({ where: { tenantId: T } }).catch(() => -1)),
    // เฉพาะ event ของบิล (pos.sale.*) — คิวที่ระบายเบื้องหลังของบิลก่อนหน้าอาจเขียน event ชนิดอื่นของร้านได้ (ไม่ใช่ผลของคำขอที่ถูกปฏิเสธ)
    outbox: Number(await P.outboxEvent.count({ where: { tenantId: T, type: { startsWith: "pos.sale." } } }).catch(() => -1)),
    seq: Number((await P.posReceiptCounter.aggregate({ where: { tenantId: T }, _sum: { seq: true } }).catch(() => null))?._sum?.seq ?? 0),
  });
  const sameCounts = (a: Record<string, number>, b: Record<string, number>) => Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => `${k} ${a[k]}→${b[k]}`);
  const keyCount = async (key: string) => Number(await P.posSale.count({ where: { tenantId: T, idempotencyKey: key } }).catch(() => -1));

  // ════════ ช่องทาง: ตั้งต้น ════════
  const list = (k: string, a: Any, input: Any = {}) => call(chMod, "listChannels", ctxOf(k), a, input).then((r) => keep(`list ${k}`, r));
  const save = (k: string, a: Any, input: Any, label = "save") => call(chMod, "saveChannel", ctxOf(k), a, input).then((r) => keep(`${label} ${k}`, r));
  const archive = (k: string, a: Any, id: string, label = "archive") => call(chMod, "archiveChannel", ctxOf(k), a, { id }).then((r) => keep(`${label} ${k}`, r));
  const CH: Record<string, string> = {}; // ชื่อเล่น → id
  const NAME: Record<string, string> = {
    LINEMAN: `LINE MAN ${RAND}`,
    GRAB: `Grab ${RAND}`,
    AGENT: `ตัวแทนขาย ${RAND}`,
  };
  const idOfCode = (items: Any[], code: string) => String((Array.isArray(items) ? items : []).find((i: Any) => i?.code === code)?.id ?? "");

  // C1 builtins แบบขี้เกียจ
  let builtinsA: Any[] = [];
  {
    const p: string[] = [];
    const before = await scCount("A");
    const r1 = fx ? null : await list("A", owner, {});
    const mid = await scCount("A");
    const r2 = fx ? null : await list("A", owner, {});
    const after = await scCount("A");
    if (before !== 0) p.push(`ก่อนเรียก ${before} แถว (คาด 0)`);
    if (r1?.ok !== true) p.push(`list ครั้งแรก → ${codeOf(r1)} ${short(r1?.message ?? "", 60)}`);
    else {
      builtinsA = Array.isArray(r1.items) ? r1.items : [];
      const codes = builtinsA.map((i: Any) => i.code).sort();
      if (short(codes) !== short(Object.keys(BUILTINS).sort())) p.push(`items ${codes.join(",")}`);
      for (const it of builtinsA) {
        if (it.kind !== "BUILTIN") p.push(`${it.code} kind ${it.kind}`);
        if (BUILTINS[it.code] && it.name !== BUILTINS[it.code]) p.push(`${it.code} name ${short(it.name, 30)} (คาด ${BUILTINS[it.code]})`);
        const keys = Object.keys(it).sort();
        if (short(keys) !== short([...ITEM_KEYS].sort())) p.push(`${it.code} คีย์ ${keys.join(",")}`);
      }
      const st = builtinsA.find((i: Any) => i.code === "STORE");
      if (!st || st.payout !== "DIRECT" || st.commissionBp !== 0 || st.commissionFixedSatang !== 0 || st.commissionVatBp !== 0 || st.active !== true || st.archived !== false) p.push(`STORE ${short(st, 160)}`);
    }
    if (mid !== 4) p.push(`หลังครั้งแรก ${mid} แถว (คาด 4)`);
    if (after !== 4) p.push(`หลังครั้งที่สอง ${after} แถว (คาด 4 — ไม่สร้างเพิ่ม)`);
    if (r2?.ok === true && r1?.ok === true && short((r2.items ?? []).map((i: Any) => i.id).sort()) !== short(builtinsA.map((i: Any) => i.id).sort())) p.push("ครั้งที่สอง id ไม่ตรงครั้งแรก");
    chk("C1", NCOL() === "" && p.length === 0, "0 → 4 builtins · ครั้งที่สอง 0 แถวใหม่", FX(NCOL() + (p.slice(0, 8).join(" · ") || "ครบ")));
  }
  CH.STORE_A = idOfCode(builtinsA, "STORE");
  CH.QR_A = idOfCode(builtinsA, "QR_TABLE");
  CH.WEB_A = idOfCode(builtinsA, "WEB");
  for (const k of ["A2", "B", "C", "X"]) {
    const r = fx ? null : await list(k, owner, {});
    CH[`STORE_${k}`] = idOfCode(r?.items, "STORE");
  }

  // C3 สร้างช่องทาง (preset · กำหนดเอง · ซ้ำ · เพดาน)
  const created: Record<string, Any> = {};
  {
    const p: string[] = [];
    const mk = async (alias: string, k: string, input: Any, a: Any = owner) => {
      const r = fx ? { ok: false, code: "FIXTURE" } : await save(k, a, input, `create ${alias}`);
      if (r?.ok === true) {
        CH[alias] = String(r.channel?.id ?? "");
        created[alias] = r.channel;
      }
      return r;
    };
    const lm = await mk("LM_A", "A", { code: "LINEMAN", name: NAME.LINEMAN, commissionBp: 3000 });
    if (lm?.ok !== true) p.push(`LINEMAN → ${codeOf(lm)} ${short(lm?.message ?? "", 50)}`);
    else {
      const c = lm.channel ?? {};
      if (c.kind !== "EXTERNAL" || c.payout !== "PLATFORM" || c.adapter !== "MANUAL" || c.commissionBp !== 3000 || c.commissionVatBp !== 0 || c.active !== true) p.push(`LINEMAN preset ${short({ kind: c.kind, payout: c.payout, adapter: c.adapter, bp: c.commissionBp, vat: c.commissionVatBp, active: c.active }, 120)}`);
    }
    const gb = await mk("GB_A", "A", { code: "GRAB", name: NAME.GRAB, payout: "PLATFORM", commissionBp: 2500, commissionFixedSatang: 200, commissionVatBp: 700 });
    if (gb?.ok !== true) p.push(`GRAB → ${codeOf(gb)}`);
    else if (gb.channel?.kind !== "EXTERNAL" || gb.channel?.commissionFixedSatang !== 200 || gb.channel?.commissionVatBp !== 700) p.push(`GRAB ${short(gb.channel, 120)}`);
    const ag = await mk("AG_A", "A", { code: "CUSTOM_AGENT", name: NAME.AGENT, payout: "DIRECT", commissionBp: 1000 });
    if (ag?.ok !== true) p.push(`CUSTOM_AGENT → ${codeOf(ag)}`);
    else if (ag.channel?.kind !== "CUSTOM" || ag.channel?.payout !== "DIRECT" || ag.channel?.commissionBp !== 1000) p.push(`CUSTOM_AGENT ${short(ag.channel, 120)}`);
    await mk("OLD_A", "A", { code: "CUSTOM_OLD", name: `เลิกใช้ ${RAND}`, payout: "DIRECT" });
    await mk("OFF_A", "A", { code: "CUSTOM_OFF", name: `ปิดอยู่ ${RAND}`, payout: "DIRECT", active: false });
    const dup = fx ? null : await save("A", owner, { code: "LINEMAN", name: "ซ้ำ" }, "dup");
    if (!refused(dup, "CHANNEL_CODE_TAKEN")) p.push(`รหัสซ้ำ → ${codeOf(dup)}`);
    const lm2 = await mk("LM_A2", "A2", { code: "LINEMAN", name: NAME.LINEMAN, commissionBp: 3000 });
    if (lm2?.ok !== true) p.push(`LINEMAN คนละสาขา → ${codeOf(lm2)} (คาด ok · unique ต่อสาขา)`);
    await mk("LM_B", "B", { code: "LINEMAN", name: NAME.LINEMAN, commissionBp: 3000 });
    await mk("GB_C", "C", { code: "GRAB", name: NAME.GRAB, payout: "PLATFORM", commissionBp: 2500, commissionFixedSatang: 200, commissionVatBp: 700 });
    await mk("LM_C", "C", { code: "LINEMAN", name: NAME.LINEMAN, commissionBp: 3000 });
    await mk("T2_X", "X", { code: "CUSTOM_T2", name: `ช่องทางร้าน T2 ${RAND}`, payout: "DIRECT" });
    for (const a of ["LM_A", "GB_A", "AG_A", "OLD_A", "OFF_A", "LM_B", "GB_C", "LM_C", "T2_X"]) if (!CH[a]) p.push(`(ตั้งต้น) ไม่มี ${a}`);
    // เพดาน 30 ต่อสาขา (A2: builtins 4 + LINEMAN 1 + 25 = 30)
    let fill = 0;
    if (!fx)
      for (let i = 1; i <= 25; i++) {
        const r = await save("A2", owner, { code: `CUSTOM_L${pad2(i)}`, name: `เติม ${i} ${RAND}`, payout: "DIRECT" }, "fill");
        if (r?.ok === true) fill++;
      }
    const over = fx ? null : await save("A2", owner, { code: "CUSTOM_L26", name: `เกิน ${RAND}`, payout: "DIRECT" }, "limit");
    if (!refused(over, "CHANNEL_LIMIT")) p.push(`ลำดับ 31 → ${codeOf(over)} (เติมได้ ${fill}/25)`);
    const nA2 = await scCount("A2");
    if (nA2 !== 30) p.push(`สาขา A2 มี ${nA2} แถว (คาด 30)`);
    const v1 = fx ? null : await save("A", owner, { code: "lineman", name: "x" }, "bad");
    const v2 = fx ? null : await save("A", owner, { code: "CUSTOM_Z", name: "z", foo: 1 }, "bad");
    if (!refused(v1, "VALIDATION") || !refused(v2, "VALIDATION")) p.push(`ข้อมูลผิด → ${codeOf(v1)}/${codeOf(v2)}`);
    chk("C3", NCOL() === "" && p.length === 0, "preset/custom · ซ้ำ · คนละสาขา · เพดาน 30 · VALIDATION", FX(NCOL() + (p.slice(0, 8).join(" · ") || "ครบ")));
  }

  // C4 STORE ล็อก · builtin อื่นแก้ได้ · archive
  {
    const p: string[] = [];
    const st0 = await scRow(CH.STORE_A);
    const locks: [string, () => Promise<Any>][] = [
      ["ค่าคอมฯ", () => save("A", owner, { id: CH.STORE_A, name: "หน้าร้าน", commissionBp: 100 }, "lock")],
      ["payout", () => save("A", owner, { id: CH.STORE_A, name: "หน้าร้าน", payout: "PLATFORM" }, "lock")],
      ["active false", () => save("A", owner, { id: CH.STORE_A, name: "หน้าร้าน", active: false }, "lock")],
      ["archive", () => archive("A", owner, CH.STORE_A, "lock")],
      ["QR เปลี่ยน code", () => save("A", owner, { id: CH.QR_A, code: "QRX", name: "QR โต๊ะ" }, "lock")],
    ];
    for (const [lbl, f] of locks) {
      const r = fx || !CH.STORE_A ? { ok: false, code: "NO_STORE" } : await f();
      if (!refused(r, "CHANNEL_BUILTIN_LOCKED")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    const st1 = await scRow(CH.STORE_A);
    if (!st1) p.push("ไม่มีแถว STORE");
    else if (short(st0) !== short(st1)) p.push("แถว STORE เปลี่ยน");
    const qr = fx || !CH.QR_A ? null : await save("A", owner, { id: CH.QR_A, name: "QR โต๊ะ", commissionBp: 500 }, "qr");
    if (qr?.ok !== true || qr.channel?.commissionBp !== 500) p.push(`QR_TABLE แก้ค่าคอมฯ → ${codeOf(qr)} ${short(qr?.channel?.commissionBp, 10)} (ตัวควบคุมบวก)`);
    const ar = fx || !CH.OLD_A ? null : await archive("A", owner, CH.OLD_A, "archive");
    if (ar?.ok !== true) p.push(`archive CUSTOM_OLD → ${codeOf(ar)}`);
    const oldRow = await scRow(CH.OLD_A);
    if (!oldRow?.archivedAt) p.push("CUSTOM_OLD ไม่มี archivedAt");
    const l1 = fx ? null : await list("A", owner, {});
    const l2 = fx ? null : await list("A", owner, { includeArchived: true });
    if (l1?.ok !== true || (l1.items ?? []).some((i: Any) => i.code === "CUSTOM_OLD")) p.push(`list ปกติยังมี CUSTOM_OLD (${codeOf(l1)})`);
    const o2 = (l2?.items ?? []).find((i: Any) => i.code === "CUSTOM_OLD");
    if (!o2 || o2.archived !== true) p.push(`includeArchived ไม่มี CUSTOM_OLD archived:true (${codeOf(l2)})`);
    chk("C4", NCOL() === "" && p.length === 0, "STORE ล็อก 5 ทาง · QR แก้ได้ · archive", FX(NCOL() + (p.slice(0, 8).join(" · ") || "ครบ")));
  }

  // C5 สิทธิ์ + ข้ามขอบเขต
  {
    const p: string[] = [];
    const ls = fx ? null : await list("A", staff, {});
    if (ls?.ok !== true) p.push(`STAFF list → ${codeOf(ls)}`);
    const ss = fx ? null : await save("A", staff, { code: "CUSTOM_STF", name: `พนักงานสร้าง ${RAND}`, payout: "DIRECT" }, "staff");
    if (!refused(ss, "PERMISSION_DENIED")) p.push(`STAFF save → ${codeOf(ss)}`);
    const ln = fx ? null : await list("A", nobody, {});
    if (!refused(ln, "PERMISSION_DENIED")) p.push(`ไม่มีสิทธิ์ POS list → ${codeOf(ln)}`);
    const sm = fx ? null : await save("A", manager, { code: "CUSTOM_MGR", name: `ผู้จัดการสร้าง ${RAND}`, payout: "DIRECT" }, "manager");
    if (sm?.ok !== true) p.push(`MANAGER save → ${codeOf(sm)}`);
    else CH.MGR_A = String(sm.channel?.id ?? "");
    const t2Before = await scRow(CH.T2_X);
    const a2Before = await scRow(CH.LM_A2);
    const nf: [string, () => Promise<Any>][] = [
      ["save id ร้าน T2", () => save("A", owner, { id: CH.T2_X, name: "แฮก", commissionBp: 9000 }, "xt")],
      ["archive id ร้าน T2", () => archive("A", owner, CH.T2_X, "xt")],
      ["save id สาขาอื่น", () => save("A", owner, { id: CH.LM_A2, name: "แฮก", commissionBp: 9000 }, "xu")],
      ["archive id สาขาอื่น", () => archive("A", owner, CH.LM_A2, "xu")],
      ["save id มั่ว", () => save("A", owner, { id: `nope${RAND}`, name: "x" }, "xn")],
    ];
    for (const [lbl, f] of nf) {
      const r = fx ? null : await f();
      if (!refused(r, "CHANNEL_NOT_FOUND")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    if (short(await scRow(CH.T2_X)) !== short(t2Before) || !t2Before) p.push("แถวร้าน T2 เปลี่ยน/ไม่มี");
    if (short(await scRow(CH.LM_A2)) !== short(a2Before) || !a2Before) p.push("แถวสาขา A2 เปลี่ยน/ไม่มี");
    chk("C5", NCOL() === "" && p.length === 0, "STAFF list/ไม่ save · MANAGER save · 404 ข้ามร้าน/สาขา", FX(NCOL() + (p.slice(0, 8).join(" · ") || "ครบ")));
  }

  // C6 audit
  {
    const p: string[] = [];
    const cr = await audits(AUDIT.created);
    const up = await audits(AUDIT.updated);
    const ar = await audits(AUDIT.archived);
    const hit = (rows: Any[], id: string, code: string, actor: string) =>
      rows.find((a) => a.actorId === actor && (a.targetId === id || short(a.after, 4000).includes(id)) && short([a.after, a.before], 4000).includes(code) && short([a.after, a.before, a.targetId], 4000).includes(id));
    if (!CH.LM_A || !hit(cr, CH.LM_A, "LINEMAN", ownerId)) p.push(`${AUDIT.created} LINEMAN (เจ้าของ) ไม่พบ (${cr.length} แถว)`);
    if (!CH.MGR_A || !hit(cr, CH.MGR_A, "CUSTOM_MGR", cashierId)) p.push(`${AUDIT.created} CUSTOM_MGR (ผู้จัดการ) ไม่พบ`);
    const u = CH.QR_A ? hit(up, CH.QR_A, "QR_TABLE", ownerId) : null;
    if (!u) p.push(`${AUDIT.updated} QR_TABLE ไม่พบ (${up.length} แถว)`);
    else if (!isRecord(u.before) || !isRecord(u.after)) p.push("updated ไม่มี before/after");
    if (!CH.OLD_A || !hit(ar, CH.OLD_A, "CUSTOM_OLD", ownerId)) p.push(`${AUDIT.archived} CUSTOM_OLD ไม่พบ`);
    const all = [...cr, ...up, ...ar];
    if (all.some((a) => short([a.after, a.before], 4000).includes("CUSTOM_STF"))) p.push("มี audit ของคำขอที่ถูกปฏิเสธ (STAFF)");
    if (all.some((a) => !a.actorId)) p.push("มี audit ไม่มี actorId");
    chk("C6", p.length === 0, "created/updated/archived · actorId จริง · ไม่มี audit ของคำปฏิเสธ", FX(p.join(" · ") || `ครบ (${all.length} แถว)`));
  }

  // C2 สองบิลแรกพร้อมกันบนสาขาใหม่
  let keyN = 0;
  const newKey = (pfx = "k") => `${KEY_PREFIX}-${pfx}-${++keyN}`;
  type SaleOut = { id: string; receiptNo: string; key: string; res: Any; lines: Record<string, string> };
  const sale = async (unit: string, o: { lines?: [string, number][]; pays: [string, number, Any?][]; channelId?: string; channelRef?: string; sourceModule?: string; key?: string; tip?: number }): Promise<SaleOut> => {
    const key = o.key ?? newKey(`s${unit}`);
    const lines = (o.lines ?? [[`ของ P21 ${unit}`, sum(o.pays.map(([, a]) => a)) - (o.tip ?? 0)]]).map(([name, price]) => ({ name, qty: 1, unitPriceSatang: price }));
    const input: Any = {
      tenantId: T,
      unitId: U[unit],
      systemId: sysOf(unit),
      idempotencyKey: key,
      lines,
      payMethods: o.pays.map(([type, amountSatang, extra]) => ({ type, amountSatang, ...(extra ?? {}) })),
      ...(o.sourceModule ? { sourceModule: o.sourceModule } : {}),
      ...(o.channelId !== undefined ? { channelId: o.channelId } : {}),
      ...(o.channelRef !== undefined ? { channelRef: o.channelRef } : {}),
      ...(o.tip ? { tipSatang: o.tip } : {}),
    };
    const res = fx ? { ok: false, code: "FIXTURE" } : await call(svc, "createSale", input);
    const id = res && typeof res.saleId === "string" ? res.saleId : "";
    const L: Record<string, string> = {};
    if (id) for (const l of (await P.posSaleLine.findMany({ where: { saleId: id }, orderBy: { id: "asc" } }).catch(() => [])) as Any[]) L[l.name] = l.id;
    return { id, receiptNo: String(res?.receiptNo ?? ""), key, res, lines: L };
  };
  {
    const p: string[] = [];
    const before = await scCount("F");
    const [a, b] = fx ? [null, null] : await Promise.all([sale("F", { pays: [["CASH", 1000]] }), sale("F", { pays: [["CASH", 1500]] })]);
    const after = await scCount("F");
    if (before !== 0) p.push(`ก่อน ${before}`);
    for (const [lbl, s] of [["บิล 1", a], ["บิล 2", b]] as const) if (!s?.id) p.push(`${lbl} → ${codeOf(s?.res)} ${short(s?.res?.message ?? "", 60)}`);
    if (after !== 4) p.push(`builtins สาขา F = ${after} (คาด 4)`);
    const rows = await scRows("F");
    const storeF = String(rows.find((r: Any) => r.code === "STORE")?.id ?? "");
    for (const [lbl, s] of [["บิล 1", a], ["บิล 2", b]] as const) {
      const sn = await snap(s?.id ?? "");
      if (s?.id && (sn?.channelCode !== "STORE" || !storeF || sn?.channelId !== storeF)) p.push(`${lbl} snapshot ${short(sn, 100)}`);
    }
    chk("C2", NCOL() === "" && p.length === 0, "2 บิลพร้อมกัน · builtins 4 · STORE ทั้งคู่", FX(NCOL() + (p.join(" · ") || "ครบ")));
  }

  // ════════ S createSale ════════
  const sStore = await sale("A", { lines: [["กาแฟ P21 STORE", 42000]], pays: [["CASH", 42000]] });
  const sLM = await sale("A", { lines: [["ข้าวมันไก่ P21 a", 14000], ["ข้าวมันไก่ P21 b", 14000], ["ข้าวมันไก่ P21 c", 14000]], pays: [["PLATFORM", 42000]], channelId: CH.LM_A, channelRef: " LM-48152 " });
  const sLMv = await sale("A", { lines: [["ก๋วยเตี๋ยว P21 void", 42000]], pays: [["PLATFORM", 42000]], channelId: CH.LM_A, channelRef: "LM-48153" });
  const sLMr = await sale("A", { lines: [["คืน P21 1", 12345], ["คืน P21 2", 14321], ["คืน P21 3", 15334]], pays: [["PLATFORM", 42000]], channelId: CH.LM_A, channelRef: "LM-48154" });
  const sGB = await sale("A", { lines: [["Grab P21", 31000]], pays: [["PLATFORM", 31000]], channelId: CH.GB_A, channelRef: "GF-001" });
  const sCG = await sale("C", { lines: [["Grab P21 C", 31000]], pays: [["PLATFORM", 31000]], channelId: CH.GB_C, channelRef: "GF-002" });
  const sAG = await sale("A", { lines: [["ตัวแทน P21 1", 21000], ["ตัวแทน P21 2", 21000]], pays: [["CASH", 42000]], channelId: CH.AG_A });
  const sB = await sale("B", { lines: [["LINEMAN P21 B", 42000]], pays: [["PLATFORM", 42000]], channelId: CH.LM_B, channelRef: "LM-B1" });
  for (const [lbl, s] of [["sStore", sStore], ["sLM", sLM], ["sLMv", sLMv], ["sLMr", sLMr], ["sGB", sGB], ["sCG", sCG], ["sAG", sAG], ["sB", sB]] as const)
    if (!s.id) console.log(`  ⚠️  บิล ${lbl}: ${codeOf(s.res)} ${short(s.res?.message ?? "", 100)}`);
  const NS = NCOL();

  // S1
  {
    const p: string[] = [];
    const sn = await snap(sStore.id);
    if (!sStore.id) p.push(`ไม่มีบิล (${codeOf(sStore.res)})`);
    else if (!sn || sn.channelCode !== "STORE" || sn.channelId !== CH.STORE_A || sn.channelPayout !== "DIRECT" || sn.channelCommissionSatang !== 0 || sn.channelCommissionVatSatang !== 0 || sn.channelRef !== null) p.push(`snapshot ${short(sn, 160)}`);
    chk("S1", NS === "" && p.length === 0, "STORE · DIRECT · 0/0 · ref null", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // S2
  {
    const p: string[] = [];
    const sn = await snap(sLM.id);
    if (!sLM.id) p.push(`ไม่มีบิล (${codeOf(sLM.res)} ${short(sLM.res?.message ?? "", 60)})`);
    else {
      if (!sn || sn.channelCode !== "LINEMAN" || sn.channelId !== CH.LM_A || sn.channelPayout !== "PLATFORM" || sn.channelCommissionSatang !== 12600 || sn.channelCommissionVatSatang !== 0 || sn.channelRef !== "LM-48152") p.push(`snapshot ${short(sn, 180)}`);
      const pays = (await P.posPayment.findMany({ where: { saleId: sLM.id } }).catch(() => [])) as Any[];
      if (pays.length !== 1 || pays[0]?.type !== "PLATFORM" || pays[0]?.amountSatang !== 42000) p.push(`PosPayment ${short(pays.map((x: Any) => [x.type, x.amountSatang]), 80)}`);
      const row = await P.posSale.findUnique({ where: { id: sLM.id } }).catch(() => null);
      if (row?.grandTotalSatang !== sum(pays.map((x: Any) => x.amountSatang))) p.push(`Σ จ่าย ≠ ยอด ${row?.grandTotalSatang}`);
    }
    chk("S2", NS === "" && p.length === 0, "LINEMAN 12600/0 · PLATFORM 42000 · ref ตัดช่องว่าง", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // S3
  {
    const p: string[] = [];
    await drain();
    const c0 = await counts();
    const r1 = await sale("A", { pays: [["PLATFORM", 1000]] });
    const r2 = await sale("A", { pays: [["PLATFORM", 1000]], channelId: CH.AG_A });
    const c1 = await counts();
    for (const [lbl, r] of [["STORE+PLATFORM", r1], ["AGENT+PLATFORM", r2]] as const) {
      if (String(r.res?.code) !== "CHANNEL_PAY_MISMATCH") p.push(`${lbl} → ${codeOf(r.res)} ${short(r.res?.message ?? "", 50)}`);
      else if (!THAI.test(String(r.res?.message ?? ""))) p.push(`${lbl} ข้อความไม่ใช่ไทย`);
      if (r.id || (await keyCount(r.key)) !== 0) p.push(`${lbl} มีบิล`);
    }
    const d = sameCounts(c0, c1);
    if (d.length) p.push(`แถวเพิ่ม ${d.join(", ")}`);
    chk("S3", NS === "" && p.length === 0, "MISMATCH 2 แบบ · นับแถว/ตัวนับเท่าเดิม", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // S4
  {
    const p: string[] = [];
    await drain();
    const c0 = await counts();
    const cases: [string, () => Promise<SaleOut>, string[]][] = [
      ["LINEMAN+CASH", () => sale("A", { pays: [["CASH", 1000]], channelId: CH.LM_A }), ["CHANNEL_PAY_MISMATCH"]],
      ["LINEMAN แบ่ง PLATFORM+CASH", () => sale("A", { lines: [["แบ่ง P21", 1000]], pays: [["PLATFORM", 500], ["CASH", 500]], channelId: CH.LM_A }), ["CHANNEL_PAY_MISMATCH"]],
      ["LINEMAN + ทิป", () => sale("A", { lines: [["ทิป P21", 1000]], pays: [["PLATFORM", 1100]], channelId: CH.LM_A, tip: 100 }), ["CHANNEL_PAY_MISMATCH", "VALIDATION"]],
      ["LINEMAN + cashTendered", () => sale("A", { pays: [["PLATFORM", 1000, { cashTenderedSatang: 1000 }]], channelId: CH.LM_A }), ["CHANNEL_PAY_MISMATCH", "VALIDATION"]],
    ];
    for (const [lbl, run, okCodes] of cases) {
      const r = await run();
      if (!okCodes.includes(String(r.res?.code))) p.push(`${lbl} → ${codeOf(r.res)} ${short(r.res?.message ?? "", 50)}`);
      if (r.id || (await keyCount(r.key)) !== 0) p.push(`${lbl} มีบิล`);
    }
    const d = sameCounts(c0, await counts());
    if (d.length) p.push(`แถวเพิ่ม ${d.join(", ")}`);
    chk("S4", NS === "" && p.length === 0, "MISMATCH/VALIDATION 4 แบบ · ไม่เขียน", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // S5
  {
    const p: string[] = [];
    await drain();
    const c0 = await counts();
    const cases: [string, () => Promise<SaleOut>][] = [
      ["AGENT ของสาขา A ที่สาขา A2", () => sale("A2", { pays: [["CASH", 1000]], channelId: CH.AG_A })],
      ["ช่องทางร้าน T2", () => sale("A", { pays: [["CASH", 1000]], channelId: CH.T2_X })],
      ["ช่องทางที่ archive", () => sale("A", { pays: [["CASH", 1000]], channelId: CH.OLD_A })],
      ["ช่องทางที่ปิด active", () => sale("A", { pays: [["CASH", 1000]], channelId: CH.OFF_A })],
      ["id มั่ว", () => sale("A", { pays: [["CASH", 1000]], channelId: `nope${RAND}` })],
    ];
    for (const [lbl, run] of cases) {
      const r = await run();
      if (String(r.res?.code) !== "CHANNEL_INVALID") p.push(`${lbl} → ${codeOf(r.res)} ${short(r.res?.message ?? "", 40)}`);
      else if (!THAI.test(String(r.res?.message ?? ""))) p.push(`${lbl} ข้อความไม่ใช่ไทย`);
      if (r.id || (await keyCount(r.key)) !== 0) p.push(`${lbl} มีบิล`);
    }
    const long = await sale("A", { pays: [["PLATFORM", 1000]], channelId: CH.LM_A, channelRef: "R".repeat(41) });
    if (String(long.res?.code) !== "VALIDATION") p.push(`channelRef 41 ตัว → ${codeOf(long.res)}`);
    if (long.id || (await keyCount(long.key)) !== 0) p.push("channelRef 41 ตัว มีบิล");
    const d = sameCounts(c0, await counts());
    if (d.length) p.push(`แถวเพิ่ม ${d.join(", ")}`);
    chk("S5", NS === "" && p.length === 0, "CHANNEL_INVALID 5 แบบ · ref ยาว VALIDATION · ไม่เขียน", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // S6
  {
    const p: string[] = [];
    const k1 = newKey("idem");
    const a = await sale("A", { key: k1, lines: [["ซ้ำ P21", 5000]], pays: [["PLATFORM", 5000]], channelId: CH.LM_A });
    const b = await sale("A", { key: k1, lines: [["ซ้ำ P21", 5000]], pays: [["PLATFORM", 5000]], channelId: CH.LM_A });
    const c = await sale("A", { key: k1, lines: [["ซ้ำ P21", 5000]], pays: [["PLATFORM", 5000]], channelId: CH.GB_A });
    if (!a.id) p.push(`ครั้งแรก → ${codeOf(a.res)}`);
    else {
      if (b.id !== a.id) p.push(`ซ้ำช่องทางเดิม → ${b.id || codeOf(b.res)} (คาด ${a.id})`);
      if (String(c.res?.code) !== "IDEMPOTENCY_CONFLICT") p.push(`ซ้ำช่องทางอื่น → ${codeOf(c.res)}`);
      const ev = await events(EV_PAID, (pl) => pl.saleId === a.id);
      if (ev.length !== 1) p.push(`outbox ${EV_PAID} ${ev.length} แถว`);
      if ((await snap(a.id))?.channelCode !== "LINEMAN") p.push("snapshot หลังยิงซ้ำไม่ใช่ LINEMAN");
    }
    const k2 = newKey("legacy");
    const l1 = await sale("A", { key: k2, lines: [["เดิม P21", 3000]], pays: [["CASH", 3000]] });
    const l2 = await sale("A", { key: k2, lines: [["เดิม P21", 3000]], pays: [["CASH", 3000]] });
    if (!l1.id || l2.id !== l1.id) p.push(`ผู้เรียกเดิมยิงซ้ำ → ${l2.id || codeOf(l2.res)} (คาด ${l1.id || "บิล"})`);
    chk("S6", NS === "" && p.length === 0, "ซ้ำ = บิลเดิม · ช่องทางอื่น = CONFLICT · ผู้เรียกเดิมเหมือนเดิม", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // S7
  let ecomSaleId = "";
  {
    const p: string[] = [];
    if (!fx) {
      const ctx = { tenantId: T, unitId: U.A };
      const pr = await call(shopMod, "createProduct", ctx, { name: `สินค้าออนไลน์ P21 ${RAND}`, priceSatang: 5000 });
      const od = pr?.id ? await call(shopMod, "createOrder", ctx, { customerName: `ลูกค้าออนไลน์ ${RAND}`, customerPhone: "0899990021", lines: [{ productId: pr.id, qty: 1 }] }) : pr;
      const cf = od?.id ? await call(shopMod, "confirmOrderPaid", ctx, od.id) : od;
      if (cf?.ok !== true || typeof cf.posSaleId !== "string") p.push(`ECOM → ${codeOf(cf)} ${short(cf?.message ?? "", 60)}`);
      else {
        ecomSaleId = cf.posSaleId;
        const sn = await snap(ecomSaleId);
        if (!sn || sn.channelCode !== "WEB" || !CH.WEB_A || sn.channelId !== CH.WEB_A || sn.channelCommissionSatang !== 0) p.push(`ECOM snapshot ${short(sn, 140)}`);
      }
    } else p.push("fixture");
    for (const m of ["RESTAURANT", "HOTEL", "BOOKING"]) {
      const s = await sale("A", { pays: [["CASH", 2000]], sourceModule: m });
      const sn = await snap(s.id);
      if (!s.id) p.push(`${m} → ${codeOf(s.res)}`);
      else if (!sn || sn.channelCode !== "STORE" || sn.channelId !== CH.STORE_A || sn.channelCommissionSatang !== 0) p.push(`${m} snapshot ${short(sn, 100)}`);
    }
    chk("S7", NS === "" && p.length === 0, "ECOM → WEB · RESTAURANT/HOTEL/BOOKING → STORE", FX(NS + (p.join(" · ") || "ครบ")));
  }

  await drain();

  // ════════ G บัญชี ════════
  const K = (id: string, ev: string) => `PosSale#${id}#${ev}`;
  const vat420 = vatOf(42000, 700);
  const vat310 = vatOf(31000, 700);
  // G1
  {
    const p: string[] = [];
    const es = await jv([sLM.id]);
    const paid = byKey(es, K(sLM.id, "PAID"));
    const com = byKey(es, K(sLM.id, "COMMISSION"));
    const wantPaid = `1100:42000/0 2200:0/${vat420} 4000:0/${42000 - vat420}`;
    if (paid.length !== 1 || shape(paid[0]) !== wantPaid) p.push(`PAID ${paid.length} · ${shape(paid[0])} (คาด ${wantPaid})`);
    if (com.length !== 1 || shape(com[0]) !== "1100:0/12600 6500:12600/0") p.push(`COMMISSION ${com.length} · ${shape(com[0])} (คาด 1100:0/12600 6500:12600/0)`);
    if (com[0]) {
      if (com[0].book !== "GENERAL") p.push(`เล่ม ${com[0].book} (คาด GENERAL)`);
      if (!com[0].memo.includes("ค่าคอมฯ ช่องทาง") || !com[0].memo.includes(NAME.LINEMAN) || !sLM.receiptNo || !com[0].memo.includes(sLM.receiptNo)) p.push(`memo ${short(com[0].memo, 80)}`);
    }
    if ((net(es)["1100"] ?? 0) !== 29400) p.push(`1100 สุทธิ ${net(es)["1100"] ?? 0} (คาด 29400)`);
    chk("G1", NS === "" && p.length === 0, "PAID + COMMISSION ตามเงินบรีฟ · 1100 = 29400", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // G2
  {
    const p: string[] = [];
    const es = await jv([sGB.id]);
    const com = byKey(es, K(sGB.id, "COMMISSION"));
    if (com.length !== 1 || shape(com[0]) !== "1100:0/8507 1155:557/0 6500:7950/0") p.push(`COMMISSION ${com.length} · ${shape(com[0])} (คาด 1100:0/8507 1155:557/0 6500:7950/0)`);
    const paid = byKey(es, K(sGB.id, "PAID"));
    if (shape(paid[0]) !== `1100:31000/0 2200:0/${vat310} 4000:0/${31000 - vat310}`) p.push(`PAID ${shape(paid[0])}`);
    const sn = await snap(sGB.id);
    if (sn?.channelCommissionSatang !== 7950 || sn?.channelCommissionVatSatang !== 557) p.push(`snapshot ${short(sn, 100)}`);
    chk("G2", NS === "" && p.length === 0, "6500 7950 + 1155 557 / 1100 8507", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // G3
  {
    const p: string[] = [];
    const es = await jv([sCG.id]);
    const paid = byKey(es, K(sCG.id, "PAID"));
    const com = byKey(es, K(sCG.id, "COMMISSION"));
    if (shape(paid[0]) !== "1100:31000/0 4000:0/31000") p.push(`PAID ${shape(paid[0])} (คาด 1100:31000/0 4000:0/31000)`);
    if (com.length !== 1 || shape(com[0]) !== "1100:0/8507 6500:8507/0") p.push(`COMMISSION ${shape(com[0])} (คาด 1100:0/8507 6500:8507/0)`);
    chk("G3", NS === "" && p.length === 0, "สมุดไม่จด VAT รวม VAT เข้า 6500", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // G4
  {
    const p: string[] = [];
    const ea = await jv([sAG.id]);
    const eS = await jv([sStore.id]);
    const pa = byKey(ea, K(sAG.id, "PAID"));
    const ps = byKey(eS, K(sStore.id, "PAID"));
    if (!pa[0] || !ps[0] || shape(pa[0]) !== shape(ps[0])) p.push(`PAID AGENT ${shape(pa[0])} ≠ STORE ${shape(ps[0])}`);
    const com = byKey(ea, K(sAG.id, "COMMISSION"));
    if (com.length !== 1 || shape(com[0]) !== "2100:0/4200 6500:4200/0") p.push(`COMMISSION ${shape(com[0])} (คาด 2100:0/4200 6500:4200/0)`);
    chk("G4", NS === "" && p.length === 0, "PAID เท่าบิล STORE · COMMISSION Cr 2100", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // G5
  {
    const p: string[] = [];
    const es = await jv([sStore.id]);
    if (byKey(es, K(sStore.id, "COMMISSION")).length !== 0) p.push("มี COMMISSION");
    const paid = byKey(es, K(sStore.id, "PAID"));
    const want = `1000:42000/0 2200:0/${vat420} 4000:0/${42000 - vat420}`;
    if (es.length !== 1 || shape(paid[0]) !== want) p.push(`JV ${es.length} · ${shape(paid[0])} (คาด ${want})`);
    chk("G5", p.length === 0, "STORE: PAID 1 รูปเดิม · ไม่มี COMMISSION", FX(p.join(" · ") || "ครบ"));
  }
  // G6
  {
    const p: string[] = [];
    const ev = (await events(EV_PAID, (pl) => pl.saleId === sLM.id))[0];
    const h = consMod?.consumers?.[EV_PAID];
    if (!ev) p.push(`ไม่พบ event ${EV_PAID} ของ sLM`);
    else if (typeof h !== "function") p.push(`ไม่มี consumers[${EV_PAID}]`);
    else
      for (let i = 0; i < 2; i++)
        try {
          await h(ev);
        } catch (e) {
          p.push(`เล่นซ้ำ ${i + 1} throw ${(e as Error).message.slice(0, 50)}`);
        }
    await drain();
    const es = await jv([sLM.id]);
    const nP = byKey(es, K(sLM.id, "PAID")).length;
    const nC = byKey(es, K(sLM.id, "COMMISSION")).length;
    if (nP !== 1 || nC !== 1 || es.length !== 2) p.push(`PAID ${nP} · COMMISSION ${nC} · รวม ${es.length} (คาด 1/1/2)`);
    chk("G6", NS === "" && p.length === 0, "เล่นซ้ำ 2 + drain 2 → 1 + 1", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // G7
  {
    const p: string[] = [];
    const sn = await snap(sB.id);
    if (!sB.id) p.push(`ไม่มีบิล (${codeOf(sB.res)})`);
    else if (!sn || sn.channelCode !== "LINEMAN" || sn.channelPayout !== "PLATFORM" || sn.channelCommissionSatang !== 12600) p.push(`snapshot ${short(sn, 120)}`);
    const n = Number(await P.accountJournalEntry.count({ where: { tenantId: T, refId: sB.id || "-" } }).catch(() => -1));
    if (n !== 0) p.push(`JV ${n} (คาด 0)`);
    chk("G7", NS === "" && p.length === 0, "บิล + snapshot · JV 0", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // G8 + G9 (คำนวณหลัง R ด้านล่างด้วย — G8 ตรวจที่ท้าย DB)
  const g9 = async (): Promise<string[]> => {
    const p: string[] = [];
    const eLM = await jv([sLM.id, sLMv.id]);
    const contactName = async (id: string | null) => (id ? String((await P.accountContact.findUnique({ where: { id } }).catch(() => null))?.name ?? "") : "");
    const arLines = (e: Entry | undefined) => (e ? e.lines.filter((l) => l.code === "1100") : []);
    const paid = byKey(eLM, K(sLM.id, "PAID"))[0];
    const com = byKey(eLM, K(sLM.id, "COMMISSION"))[0];
    const comV = byKey(eLM, K(sLMv.id, "COMMISSION"))[0];
    const ids = new Set<string>();
    for (const [lbl, e] of [["PAID sLM", paid], ["COMMISSION sLM", com], ["COMMISSION sLMv", comV]] as const) {
      const ls = arLines(e);
      if (!ls.length) p.push(`${lbl} ไม่มีบรรทัด 1100`);
      for (const l of ls) {
        if (!l.contactId) p.push(`${lbl} 1100 ไม่มี contactId`);
        else {
          ids.add(l.contactId);
          const nm = await contactName(l.contactId);
          if (nm !== NAME.LINEMAN) p.push(`${lbl} ผู้ติดต่อ "${short(nm, 30)}" (คาด ${NAME.LINEMAN})`);
        }
      }
    }
    if (ids.size > 1) p.push(`ผู้ติดต่อ LINEMAN ${ids.size} คน (คาด 1)`);
    const nC = Number(await P.accountContact.count({ where: { tenantId: T, systemId: S.ACCV, name: NAME.LINEMAN } }).catch(() => -1));
    if (nC !== 1) p.push(`AccountContact ชื่อ LINEMAN ในสมุด ${nC} (คาด 1)`);
    const eAG = await jv([sAG.id]);
    const ap = (byKey(eAG, K(sAG.id, "COMMISSION"))[0]?.lines ?? []).filter((l) => l.code === "2100");
    if (!ap.length || !ap[0]!.contactId || (await contactName(ap[0]!.contactId)) !== NAME.AGENT) p.push(`AGENT 2100 ผู้ติดต่อ ${short(ap[0]?.contactId, 30)}`);
    return p;
  };
  {
    const p = await g9();
    chk("G9", NS === "" && p.length === 0, "1100/2100 มีผู้ติดต่อชื่อช่องทาง · 1 คนต่อชื่อ", FX(NS + (p.slice(0, 6).join(" · ") || "ครบ")));
  }

  // ════════ R กลับรายการ / คืนเงิน ════════
  // R1 void
  {
    const p: string[] = [];
    let vErr = "";
    if (sLMv.id) {
      const v = await call(svc, "voidSale", T, U.A, sLMv.id);
      if (v?.ok === false) vErr = `voidSale ${codeOf(v)} ${short(v.message, 60)}`;
      await drain();
    } else vErr = "ไม่มีบิล";
    if (vErr) p.push(vErr);
    const es = await jv([sLMv.id]);
    const orig = es.filter((e) => !e.reversalOfId);
    const rev = es.filter((e) => e.reversalOfId);
    if (orig.length !== 2 || orig.some((e) => e.status !== "REVERSED")) p.push(`ต้นฉบับ ${orig.length} · ${orig.map((e) => `${e.key.split("#").pop()}:${e.status}`).join(",")} (คาด PAID+COMMISSION REVERSED)`);
    if (rev.length !== 2) p.push(`รายการกลับ ${rev.length} (คาด 2)`);
    const n = net(es);
    const nz = Object.entries(n).filter(([, v]) => v !== 0);
    if (nz.length) p.push(`สุทธิไม่ 0: ${short(Object.fromEntries(nz), 80)}`);
    const ev = (await events(EV_VOIDED, (pl) => pl.saleId === sLMv.id))[0];
    const h = consMod?.consumers?.[EV_VOIDED];
    if (ev && typeof h === "function")
      for (let i = 0; i < 2; i++)
        try {
          await h(ev);
        } catch (e) {
          p.push(`เล่นซ้ำ ${i + 1} throw ${(e as Error).message.slice(0, 40)}`);
        }
    else p.push(`ไม่มี event/consumer ${EV_VOIDED}`);
    const es2 = await jv([sLMv.id]);
    if (es2.length !== es.length) p.push(`เล่นซ้ำแล้ว JV ${es.length} → ${es2.length}`);
    chk("R1", NS === "" && p.length === 0, "PAID+COMMISSION กลับ · สุทธิ 0 · เล่นซ้ำไม่เพิ่ม", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // R2 R3 R5 คืน 3 ใบ
  const refundIds: string[] = [];
  const refundRes: Any[] = [];
  const doRefund = async (s: SaleOut, lineName: string, pay: [string, number]): Promise<Any> => {
    const lineId = s.lines[lineName] ?? "";
    const req = { saleId: s.id, lines: [{ lineId, qty: 1 }], payMethods: [{ type: pay[0], amountSatang: pay[1] }], reasonCode: "CHANGED_MIND", reason: "ลูกค้ายกเลิกผ่านแพลตฟอร์ม", idempotencyKey: newKey("r") };
    return s.id ? keep(`refund ${lineName}`, await call(refundMod, "refundSale", ctxOf("A", DEV1), owner, req)) : { ok: false, code: "NO_SALE" };
  };
  const snapRefund = async (id: string) => snap(id);
  {
    const p: string[] = [];
    const r = await doRefund(sLMr, "คืน P21 1", ["PLATFORM", 12345]);
    refundRes.push(r);
    const rid = r?.ok === true ? String(r.refund?.id ?? "") : "";
    if (!rid) p.push(`refundSale → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    refundIds.push(rid);
    await drain();
    const sn = await snapRefund(rid);
    if (rid && (!sn || sn.channelCode !== "LINEMAN" || sn.channelId !== CH.LM_A || sn.channelPayout !== "PLATFORM" || sn.channelCommissionSatang !== 3704 || sn.channelCommissionVatSatang !== 0)) p.push(`ใบคืน snapshot ${short(sn, 160)}`);
    const es = await jv([rid]);
    const rf = byKey(es, K(rid, "REFUNDED"))[0];
    const cr = byKey(es, K(rid, "COMMISSION_REFUNDED"))[0];
    if (!rf) p.push("ไม่มี REFUNDED");
    else {
      const ar = sum(rf.lines.filter((l) => l.code === "1100").map((l) => l.credit - l.debit));
      if (ar !== 12345) p.push(`REFUNDED Cr 1100 ${ar} (คาด 12345)`);
      if (rf.lines.some((l) => l.code === "1000" || l.code === "1010")) p.push("REFUNDED มีเงินสด/ธนาคาร");
    }
    if (shape(cr) !== "1100:3704/0 6500:0/3704") p.push(`COMMISSION_REFUNDED ${shape(cr)} (คาด 1100:3704/0 6500:0/3704)`);
    chk("R2", NS === "" && p.length === 0, "ใบคืน 3704 · REFUNDED Cr 1100 · COMMISSION_REFUNDED", FX(NS + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    for (const [ln, amt] of [["คืน P21 2", 14321], ["คืน P21 3", 15334]] as const) {
      const r = await doRefund(sLMr, ln, ["PLATFORM", amt]);
      refundRes.push(r);
      const rid = r?.ok === true ? String(r.refund?.id ?? "") : "";
      if (!rid) p.push(`${ln} → ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
      refundIds.push(rid);
    }
    await drain();
    const shares: number[] = [];
    for (const rid of refundIds) shares.push(Number((await snapRefund(rid))?.channelCommissionSatang ?? NaN));
    if (short(shares) !== short([3704, 4296, 4600])) p.push(`ส่วนแบ่ง ${short(shares)} (คาด [3704,4296,4600])`);
    const es = await jv([sLMr.id, ...refundIds]);
    const n = net(es);
    if ((n["1100"] ?? 0) !== 0 || (n["6500"] ?? 0) !== 0) p.push(`สุทธิ 1100 ${n["1100"] ?? 0} · 6500 ${n["6500"] ?? 0} (คาด 0/0)`);
    const comR = refundIds.map((rid) => shape(byKey(es, K(rid, "COMMISSION_REFUNDED"))[0]));
    if (comR.some((s) => s === "—")) p.push(`COMMISSION_REFUNDED ขาด (${comR.join(" | ")})`);
    chk("R3", NS === "" && p.length === 0, "Σ ส่วนแบ่ง 12600 · 1100/6500 สุทธิ 0", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // R4 วิธีคืนผิด
  {
    const p: string[] = [];
    const n0 = Number(await P.posSale.count({ where: { tenantId: T, docType: "REFUND" } }).catch(() => -1));
    const a = await doRefund(sLM, "ข้าวมันไก่ P21 a", ["CASH", 14000]);
    const b = await doRefund(sStore, "กาแฟ P21 STORE", ["PLATFORM", 42000]);
    if (!refused(a, "REFUND_METHOD_INVALID")) p.push(`บิล PLATFORM คืน CASH → ${codeOf(a)}`);
    if (!refused(b, "REFUND_METHOD_INVALID")) p.push(`บิล CASH คืน PLATFORM → ${codeOf(b)}`);
    const n1 = Number(await P.posSale.count({ where: { tenantId: T, docType: "REFUND" } }).catch(() => -2));
    if (n1 !== n0) p.push(`ใบคืนเพิ่ม ${n1 - n0}`);
    chk("R4", NS === "" && p.length === 0, "REFUND_METHOD_INVALID ทั้งสองทาง · ไม่มีใบคืน", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // R5 เล่นซ้ำตัวรับคืนเงิน
  {
    const p: string[] = [];
    const rid = refundIds[0] ?? "";
    const ev = rid ? (await P.outboxEvent.findMany({ where: { tenantId: T, type: EV_REFUNDED } }).catch(() => [])).find((e: Any) => e.payload?.refundSaleId === rid) : null;
    const h = consMod?.consumers?.[EV_REFUNDED];
    if (!ev || typeof h !== "function") p.push(`ไม่มี event/consumer ${EV_REFUNDED} (${rid ? "มีใบคืน" : "ไม่มีใบคืน"})`);
    else
      for (let i = 0; i < 2; i++)
        try {
          await h(ev);
        } catch (e) {
          p.push(`เล่นซ้ำ ${i + 1} throw ${(e as Error).message.slice(0, 40)}`);
        }
    await drain();
    const es = await jv([rid]);
    const nR = byKey(es, K(rid, "REFUNDED")).length;
    const nC = byKey(es, K(rid, "COMMISSION_REFUNDED")).length;
    if (nR !== 1 || nC !== 1) p.push(`REFUNDED ${nR} · COMMISSION_REFUNDED ${nC} (คาด 1/1)`);
    chk("R5", NS === "" && p.length === 0, "เล่นซ้ำ 2 → 1 + 1", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // R6 AGENT คืน
  {
    const p: string[] = [];
    const r = await doRefund(sAG, "ตัวแทน P21 1", ["CASH", 21000]);
    const rid = r?.ok === true ? String(r.refund?.id ?? "") : "";
    if (!rid) p.push(`refundSale → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    await drain();
    const sn = await snapRefund(rid);
    if (rid && sn?.channelCommissionSatang !== 2100) p.push(`ส่วนแบ่ง ${short(sn?.channelCommissionSatang, 10)} (คาด 2100)`);
    const cr = byKey(await jv([rid]), K(rid, "COMMISSION_REFUNDED"))[0];
    if (shape(cr) !== "2100:2100/0 6500:0/2100") p.push(`COMMISSION_REFUNDED ${shape(cr)} (คาด 2100:2100/0 6500:0/2100)`);
    chk("R6", NS === "" && p.length === 0, "DIRECT คืน: Dr 2100 / Cr 6500 2100", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // R7 (ORACLE-EDIT · reviewer F1) ค่าคอมฯ หาย → ตัวรับคืนเงินลง COMMISSION ก่อนกลับ
  {
    const p: string[] = [];
    const sLMh = await sale("A", { lines: [["ซ่อมค่าคอม P21", 42000]], pays: [["PLATFORM", 42000]], channelId: CH.LM_A, channelRef: "LM-48156" });
    if (!sLMh.id) p.push(`บิล → ${codeOf(sLMh.res)} ${short(sLMh.res?.message ?? "", 60)}`);
    await drain();
    const e0 = await jv([sLMh.id]);
    const com0 = byKey(e0, K(sLMh.id, "COMMISSION"))[0];
    if (byKey(e0, K(sLMh.id, "PAID")).length !== 1 || !com0) p.push(`ก่อนลบ PAID ${byKey(e0, K(sLMh.id, "PAID")).length} · COMMISSION ${com0 ? 1 : 0} (คาด 1/1)`);
    // จำลองขั้น COMMISSION ล้มหลัง PAID (คิวยังไม่ได้ลองใหม่) — ลบเฉพาะ JV นี้ของร้านชั่วคราว
    if (com0) {
      await P.accountJournalLine.deleteMany({ where: { tenantId: T, entryId: com0.id } }).catch((e: Error) => p.push(`ลบบรรทัด ${short(e.message, 50)}`));
      await P.accountJournalEntry.deleteMany({ where: { tenantId: T, id: com0.id } }).catch((e: Error) => p.push(`ลบ JV ${short(e.message, 50)}`));
    }
    if (byKey(await jv([sLMh.id]), K(sLMh.id, "COMMISSION")).length !== 0) p.push("ลบ COMMISSION ไม่สำเร็จ");
    const r = await doRefund(sLMh, "ซ่อมค่าคอม P21", ["PLATFORM", 42000]);
    const rid = r?.ok === true ? String(r.refund?.id ?? "") : "";
    if (!rid) p.push(`refundSale → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    await drain();
    const es = await jv([sLMh.id, rid]);
    const nCom = byKey(es, K(sLMh.id, "COMMISSION")).length;
    const nComR = byKey(es, K(rid, "COMMISSION_REFUNDED")).length;
    if (nCom !== 1 || nComR !== 1) p.push(`COMMISSION ${nCom} · COMMISSION_REFUNDED ${nComR} (คาด 1/1)`);
    const com = byKey(es, K(sLMh.id, "COMMISSION"))[0];
    if (com && shape(com) !== "1100:0/12600 6500:12600/0") p.push(`COMMISSION ${shape(com)}`);
    const ar = es.flatMap((e) => e.lines).filter((l) => l.code === "1100");
    const byContact = new Map<string, number>();
    for (const l of ar) byContact.set(l.contactId ?? "(ไม่มี)", (byContact.get(l.contactId ?? "(ไม่มี)") ?? 0) + l.debit - l.credit);
    if (byContact.has("(ไม่มี)")) p.push("มีบรรทัด 1100 ไม่มีผู้ติดต่อ");
    if (byContact.size !== 1 || [...byContact.values()].some((v) => v !== 0)) p.push(`1100 ต่อผู้ติดต่อ ${short(Object.fromEntries(byContact), 120)} (คาด ผู้ติดต่อเดียว สุทธิ 0)`);
    const n = net(es);
    if ((n["6500"] ?? 0) !== 0) p.push(`6500 สุทธิ ${n["6500"]} (คาด 0)`);
    const hR = consMod?.consumers?.[EV_REFUNDED];
    const hP = consMod?.consumers?.[EV_PAID];
    const evR = rid ? (await events(EV_REFUNDED, (pl) => pl.refundSaleId === rid))[0] : null;
    const evP = sLMh.id ? (await events(EV_PAID, (pl) => pl.saleId === sLMh.id))[0] : null;
    if (!evR || !evP || typeof hR !== "function" || typeof hP !== "function") p.push("ไม่มี event/consumer ให้เล่นซ้ำ");
    else
      for (let i = 0; i < 2; i++)
        for (const [h, ev, lbl] of [[hR, evR, "refunded"], [hP, evP, "paid"]] as const)
          try {
            await h(ev);
          } catch (e) {
            p.push(`เล่นซ้ำ ${lbl} ${i + 1} throw ${(e as Error).message.slice(0, 40)}`);
          }
    await drain();
    const es2 = await jv([sLMh.id, rid]);
    if (es2.length !== es.length) p.push(`เล่นซ้ำแล้ว JV ${es.length} → ${es2.length}`);
    chk("R7", NS === "" && p.length === 0, "COMMISSION ถูกลงก่อนกลับ · 1100/6500 สุทธิ 0 · เล่นซ้ำไม่เพิ่ม", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // R8 (ORACLE-EDIT · รีวิว N1) บิลที่คืนครบแล้ว (REFUNDED) แต่ COMMISSION + COMMISSION_REFUNDED หาย → คิวปิดบิลซ่อม COMMISSION เอง
  //   (outbox-consumers posSalePaid ทาง status === "REFUNDED") · ใบคืนไม่ถูกขับซ้ำในครึ่งแรก ⇒ บันทึกช่อง "refund event FAILED" ของผู้สร้าง
  //   ครึ่งหลัง: ขับ pos.sale.refunded ซ้ำ ⇒ COMMISSION_REFUNDED กลับมา (คำกล่าวของ ops "ขับซ้ำปลอดภัย + idempotent")
  {
    const p: string[] = [];
    const LN = "ซ่อมค่าคอม P21 R8";
    const sLMk = await sale("A", { lines: [[LN, 42000]], pays: [["PLATFORM", 42000]], channelId: CH.LM_A, channelRef: "LM-48157" });
    if (!sLMk.id) p.push(`บิล → ${codeOf(sLMk.res)} ${short(sLMk.res?.message ?? "", 60)}`);
    await drain();
    // 1. PAID + COMMISSION
    const e0 = await jv([sLMk.id]);
    if (byKey(e0, K(sLMk.id, "PAID")).length !== 1 || byKey(e0, K(sLMk.id, "COMMISSION")).length !== 1)
      p.push(`ขั้น 1 PAID ${byKey(e0, K(sLMk.id, "PAID")).length} · COMMISSION ${byKey(e0, K(sLMk.id, "COMMISSION")).length} (คาด 1/1)`);
    // 2. คืนครบ → REFUNDED + COMMISSION_REFUNDED · สถานะบิล REFUNDED
    const r = await doRefund(sLMk, LN, ["PLATFORM", 42000]);
    const rid = r?.ok === true ? String(r.refund?.id ?? "") : "";
    if (!rid) p.push(`refundSale → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    await drain();
    const st = sLMk.id ? String(((await P.posSale.findFirst({ where: { id: sLMk.id, tenantId: T }, select: { status: true } }).catch(() => null)) as Any)?.status ?? "") : "";
    if (st !== "REFUNDED") p.push(`สถานะบิล ${st || "—"} (คาด REFUNDED)`);
    const e1 = await jv([sLMk.id, rid]);
    if (byKey(e1, K(rid, "REFUNDED")).length !== 1 || byKey(e1, K(rid, "COMMISSION_REFUNDED")).length !== 1)
      p.push(`ขั้น 2 REFUNDED ${byKey(e1, K(rid, "REFUNDED")).length} · COMMISSION_REFUNDED ${byKey(e1, K(rid, "COMMISSION_REFUNDED")).length} (คาด 1/1)`);
    // 3. ลบ COMMISSION (บิล) + COMMISSION_REFUNDED (ใบคืน) — เฉพาะ 2 JV นี้ของร้านชั่วคราว (แบบเดียวกับ R7) ⇒ สมุดเหลือ PAID + REFUNDED
    for (const e of [byKey(e1, K(sLMk.id, "COMMISSION"))[0], byKey(e1, K(rid, "COMMISSION_REFUNDED"))[0]]) {
      if (!e) continue;
      await P.accountJournalLine.deleteMany({ where: { tenantId: T, entryId: e.id } }).catch((x: Error) => p.push(`ลบบรรทัด ${short(x.message, 50)}`));
      await P.accountJournalEntry.deleteMany({ where: { tenantId: T, id: e.id } }).catch((x: Error) => p.push(`ลบ JV ${short(x.message, 50)}`));
    }
    const e2 = await jv([sLMk.id, rid]);
    const keys2 = e2.map((e) => e.key.split("#").pop()).sort().join(",");
    if (keys2 !== "PAID,REFUNDED") p.push(`หลังลบ JV = ${keys2 || "—"} (คาด PAID,REFUNDED)`);
    const n2 = net(e2);
    if ((n2["1100"] ?? 0) !== 0 || (n2["6500"] ?? 0) !== 0) p.push(`หลังลบ 1100 ${n2["1100"] ?? 0} · 6500 ${n2["6500"] ?? 0} (คาด 0/0)`);
    // 4. ขับ pos.sale.paid ซ้ำ (แบบ R7: เรียก consumer ตรงด้วยแถว event เดิม) → drain
    const hP = consMod?.consumers?.[EV_PAID];
    const hR = consMod?.consumers?.[EV_REFUNDED];
    const evP = sLMk.id ? (await events(EV_PAID, (pl) => pl.saleId === sLMk.id))[0] : null;
    const evR = rid ? (await events(EV_REFUNDED, (pl) => pl.refundSaleId === rid))[0] : null;
    const drive = async (h: Any, ev: Any, lbl: string) => {
      try {
        await h(ev);
      } catch (e) {
        p.push(`ขับ ${lbl} throw ${(e as Error).message.slice(0, 50)}`);
      }
    };
    let info = "";
    if (!evP || !evR || typeof hP !== "function" || typeof hR !== "function") p.push("ไม่มี event/consumer ให้ขับซ้ำ");
    else {
      info = `evP ${evP.status} · evR ${evR.status}`;
      await drive(hP, evP, "paid");
      await drain();
      // 5a. COMMISSION กลับมา (ผู้ติดต่อเดียวกับ PAID) · COMMISSION_REFUNDED ยังไม่มี · ทุก JV สมดุล
      const e3 = await jv([sLMk.id, rid]);
      const com = byKey(e3, K(sLMk.id, "COMMISSION"));
      const comR = byKey(e3, K(rid, "COMMISSION_REFUNDED"));
      if (com.length !== 1 || shape(com[0]) !== "1100:0/12600 6500:12600/0") p.push(`ซ่อม: COMMISSION ${com.length} · ${shape(com[0])} (คาด 1 · 1100:0/12600 6500:12600/0)`);
      if (comR.length !== 0) p.push(`ซ่อม: COMMISSION_REFUNDED ${comR.length} (คาด 0 — ตัวรับปิดบิลซ่อม COMMISSION อย่างเดียว)`);
      const paidC = byKey(e3, K(sLMk.id, "PAID"))[0]?.lines.find((l) => l.code === "1100" && l.debit > 0)?.contactId ?? null;
      const comC = com[0]?.lines.find((l) => l.code === "1100")?.contactId ?? null;
      if (!paidC || comC !== paidC) p.push(`ผู้ติดต่อ 1100 COMMISSION ${short(comC, 30)} ≠ PAID ${short(paidC, 30)}`);
      const unbal = e3.filter((e) => sum(e.lines.map((l) => l.debit)) !== sum(e.lines.map((l) => l.credit)));
      if (unbal.length) p.push(`ไม่สมดุล ${unbal.map((e) => e.key.split("#").pop()).join(",")}`);
      if (e3.length !== 3) p.push(`ซ่อม: JV ${e3.length} (คาด 3 = PAID REFUNDED COMMISSION)`);
      // เล่น paid ซ้ำ 2 รอบ → ไม่เพิ่ม
      for (let i = 0; i < 2; i++) await drive(hP, evP, `paid ซ้ำ ${i + 1}`);
      await drain();
      const e4 = await jv([sLMk.id, rid]);
      if (e4.length !== e3.length) p.push(`เล่น paid ซ้ำแล้ว JV ${e3.length} → ${e4.length}`);
      // 5b. ขับ pos.sale.refunded ซ้ำ → COMMISSION_REFUNDED กลับมา · 1100/6500 สุทธิ 0 · ขับอีกรอบไม่เพิ่ม
      await drive(hR, evR, "refunded");
      await drain();
      const e5 = await jv([sLMk.id, rid]);
      const keys5 = e5.map((e) => e.key.split("#").pop()).sort().join(",");
      if (keys5 !== "COMMISSION,COMMISSION_REFUNDED,PAID,REFUNDED") p.push(`ขับใบคืนซ้ำ JV = ${keys5} (คาด COMMISSION,COMMISSION_REFUNDED,PAID,REFUNDED อย่างละ 1)`);
      const cr5 = byKey(e5, K(rid, "COMMISSION_REFUNDED"))[0];
      if (shape(cr5) !== "1100:12600/0 6500:0/12600") p.push(`COMMISSION_REFUNDED ${shape(cr5)} (คาด 1100:12600/0 6500:0/12600)`);
      const byContact = new Map<string, number>();
      for (const l of e5.flatMap((e) => e.lines).filter((l) => l.code === "1100")) byContact.set(l.contactId ?? "(ไม่มี)", (byContact.get(l.contactId ?? "(ไม่มี)") ?? 0) + l.debit - l.credit);
      if (byContact.size !== 1 || !byContact.has(paidC ?? "") || [...byContact.values()].some((v) => v !== 0)) p.push(`1100 ต่อผู้ติดต่อ ${short(Object.fromEntries(byContact), 120)} (คาด ผู้ติดต่อของ PAID สุทธิ 0)`);
      if ((net(e5)["6500"] ?? 0) !== 0) p.push(`6500 สุทธิ ${net(e5)["6500"]} (คาด 0)`);
      const unbal5 = e5.filter((e) => sum(e.lines.map((l) => l.debit)) !== sum(e.lines.map((l) => l.credit)));
      if (unbal5.length) p.push(`ไม่สมดุล ${unbal5.map((e) => e.key.split("#").pop()).join(",")}`);
      await drive(hR, evR, "refunded ซ้ำ");
      await drive(hP, evP, "paid ซ้ำ 3");
      await drain();
      const e6 = await jv([sLMk.id, rid]);
      if (e6.length !== e5.length) p.push(`ขับซ้ำอีกรอบ JV ${e5.length} → ${e6.length}`);
    }
    chk("R8", NS === "" && p.length === 0, "ซ่อม COMMISSION บนบิล REFUNDED (ไม่มี COMMISSION_REFUNDED) · ขับใบคืนซ้ำ → COMMISSION_REFUNDED · 1100/6500 สุทธิ 0 · ซ้ำไม่เพิ่ม", FX(NS + (p.join(" · ") || `ครบ (${info})`)));
  }

  // ════════ P หน้าขาย ════════
  const cartOf = (price: number, extra: Any = {}) => ({ lines: [{ name: `หน้าขาย P21 ${RAND}`, qty: 1, unitPriceSatang: price }], ...extra });
  const quote = (k: string, cart: Any, label = "quote") => call(register, "quoteRegisterCart", ctxOf(k, k === "A" ? DEV1 : undefined), owner, cart).then((r) => keep(`${label} ${k}`, r));
  // P1
  {
    const p: string[] = [];
    const q0 = fx ? null : await quote("A", cartOf(42000));
    if (q0?.ok !== true) p.push(`quote → ${codeOf(q0)}`);
    else {
      const c = q0.channel;
      if (!isRecord(c) || c.id !== CH.STORE_A || c.code !== "STORE" || c.name !== "หน้าร้าน" || c.payout !== "DIRECT") p.push(`channel ${short(c, 120)}`);
      else if (short(Object.keys(c).sort()) !== short(["code", "id", "name", "payout"])) p.push(`channel คีย์ ${Object.keys(c).join(",")}`);
    }
    const q1 = fx ? null : await quote("A", cartOf(42000, { channelId: CH.LM_A }));
    if (q1?.ok !== true || q1.channel?.code !== "LINEMAN" || q1.channel?.payout !== "PLATFORM" || q1.channel?.id !== CH.LM_A) p.push(`LINEMAN → ${codeOf(q1)} ${short(q1?.channel, 80)}`);
    const q2 = fx ? null : await quote("A2", cartOf(42000, { channelId: CH.LM_A }));
    if (!refused(q2, "CHANNEL_INVALID")) p.push(`สาขาอื่น → ${codeOf(q2)}`);
    const q3 = fx ? null : await quote("A", cartOf(42000, { channelId: CH.OLD_A }));
    if (!refused(q3, "CHANNEL_INVALID")) p.push(`archive → ${codeOf(q3)}`);
    chk("P1", p.length === 0, "STORE ปริยาย · LINEMAN · สาขาอื่น/archive CHANNEL_INVALID", FX(p.join(" · ") || "ครบ"));
  }
  // P2 + Q4 (X ก่อน/หลัง)
  const xBefore = SHIFT1 ? await call(shiftMod, "xReport", ctxOf("A", DEV1), owner, { shiftId: SHIFT1 }) : null;
  let regLM = "";
  {
    const p: string[] = [];
    const submit = (extra: Any, pays: [string, number][], price = 42000) =>
      call(register, "submitRegisterSale", ctxOf("A", DEV1), owner, {
        ...cartOf(price, extra),
        idempotencyKey: newKey("reg"),
        expectedGrandTotalSatang: price,
        payMethods: pays.map(([type, amountSatang]) => ({ type, amountSatang })),
        ...(pays.some(([t]) => t === "CASH") ? { cashReceivedSatang: sum(pays.filter(([t]) => t === "CASH").map(([, a]) => a)) } : {}),
      });
    const c0 = await counts();
    const ok = fx ? null : keep("submit LINEMAN", await submit({ channelId: CH.LM_A, channelRef: "LM-77001" }, [["PLATFORM", 42000]]));
    if (ok?.ok !== true) p.push(`LINEMAN → ${codeOf(ok)} ${short(ok?.message ?? "", 60)}`);
    else {
      regLM = String(ok.saleId);
      const sn = await snap(regLM);
      if (!sn || sn.channelCode !== "LINEMAN" || sn.channelRef !== "LM-77001" || sn.channelCommissionSatang !== 12600 || sn.channelPayout !== "PLATFORM") p.push(`snapshot ${short(sn, 140)}`);
      const row = await P.posSale.findUnique({ where: { id: regLM } }).catch(() => null);
      if (!SHIFT1 || row?.shiftId !== SHIFT1) p.push(`shiftId ${short(row?.shiftId, 30)}`);
    }
    const c1 = await counts();
    const bads: [string, Any, [string, number][], string][] = [
      ["STORE + PLATFORM", {}, [["PLATFORM", 42000]], "CHANNEL_PAY_MISMATCH"],
      ["LINEMAN + CASH", { channelId: CH.LM_A }, [["CASH", 42000]], "CHANNEL_PAY_MISMATCH"],
      ["channelRef 41", { channelId: CH.LM_A, channelRef: "R".repeat(41) }, [["PLATFORM", 42000]], "VALIDATION"],
    ];
    for (const [lbl, extra, pays, want] of bads) {
      const r = fx ? null : keep(`submit ${lbl}`, await submit(extra, pays));
      if (!refused(r, want)) p.push(`${lbl} → ${codeOf(r)} (คาด ${want})`);
    }
    const d = sameCounts(c1, await counts());
    if (d.length) p.push(`คำขอที่ถูกปฏิเสธเขียนแถว ${d.join(", ")}`);
    if (ok?.ok === true && c1.sale - c0.sale !== 1) p.push(`บิลเพิ่ม ${c1.sale - c0.sale} (คาด 1)`);
    chk("P2", NS === "" && p.length === 0, "submit LINEMAN ok · 3 คำปฏิเสธไม่เขียน", FX(NS + (p.join(" · ") || "ครบ")));
  }
  await drain();
  // P3 บิลพัก
  {
    const p: string[] = [];
    const h = fx ? null : await call(heldMod, "holdRegisterCart", ctxOf("A", DEV1), owner, { cart: cartOf(42000, { channelId: CH.LM_A }), label: `พัก P21 ${RAND}` });
    const hid = h?.ok === true ? String(h.heldCart?.id ?? "") : "";
    if (!hid) p.push(`hold → ${codeOf(h)} ${short(h?.message ?? "", 60)}`);
    else {
      const r = await call(heldMod, "recallHeldCart", ctxOf("A", DEV1), owner, { id: hid });
      if (r?.ok !== true) p.push(`recall → ${codeOf(r)}`);
      else {
        if (r.cart?.channelId !== CH.LM_A) p.push(`cart.channelId ${short(r.cart?.channelId, 30)}`);
        if (r.quote?.channel?.code !== "LINEMAN") p.push(`quote.channel ${short(r.quote?.channel, 60)}`);
      }
    }
    chk("P3", p.length === 0, "บิลพักคืน channelId + quote LINEMAN", FX(p.join(" · ") || "ครบ"));
  }
  // P4 ค่าบริการ
  {
    const p: string[] = [];
    const a = fx ? null : await quote("C", cartOf(10000));
    const b = fx ? null : await quote("C", cartOf(10000, { channelId: CH.LM_C }));
    if (a?.ok !== true || a.serviceChargeSatang !== 1000 || a.grandTotalSatang !== 11000) p.push(`STORE ${codeOf(a)} ค่าบริการ ${a?.serviceChargeSatang} ยอด ${a?.grandTotalSatang} (คาด 1000/11000)`);
    if (b?.ok !== true || b.serviceChargeSatang !== 0 || b.grandTotalSatang !== 10000) p.push(`LINEMAN ${codeOf(b)} ค่าบริการ ${b?.serviceChargeSatang} ยอด ${b?.grandTotalSatang} (คาด 0/10000)`);
    chk("P4", p.length === 0, "STORE 10% · LINEMAN 0", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ Q ตัวอ่าน ════════
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  // บิลเก่า (ไม่มีคอลัมน์ช่องทาง) — แทรกผ่าน prisma ไม่มี outbox
  const legacy: Record<string, string> = {};
  if (!fx)
    for (const [k, src] of [["pos", "POS"], ["ecom", "ECOM"]] as const)
      try {
        const s = await P.posSale.create({ data: { tenantId: T, unitId: U.A, systemId: S.POSA, sourceModule: src, idempotencyKey: newKey(`legacy-${k}`), receiptNo: `LEG-${k}-${RAND}`, status: "PAID", subtotalSatang: 2500, vatSatang: vatOf(2500, 700), grandTotalSatang: 2500, paidAt: new Date(), createdAt: new Date() } });
        legacy[k] = s.id;
      } catch (e) {
        console.log(`  ⚠️  บิลเก่า ${k}: ${(e as Error).message.slice(0, 80)}`);
      }
  const page = (a: Any, q: Any = {}) => call(billsMod, "billsPageData", ctxOf("A"), a, { unitId: U.A, date: today, pageSize: 50, ...q });
  const detail = (a: Any, saleId: string) => call(billsMod, "billDetail", ctxOf("A"), a, { unitId: U.A, saleId });
  // Q1
  {
    const p: string[] = [];
    const all = await page(owner);
    if (all?.ok !== true) p.push(`billsPageData → ${codeOf(all)}`);
    else {
      const row = (id: string) => (all.items ?? []).find((r: Any) => r.id === id);
      const want: [string, string, string, string][] = [
        ["sLM", sLM.id, "LINEMAN", NAME.LINEMAN],
        ["sStore", sStore.id, "STORE", "หน้าร้าน"],
        ["ECOM", ecomSaleId, "WEB", BUILTINS.WEB!],
      ];
      for (const [lbl, id, code, name] of want) {
        const r = row(id);
        if (!id) p.push(`${lbl} ไม่มีบิล`);
        else if (!r) p.push(`${lbl} ไม่อยู่ในหน้า`);
        else if (!isRecord(r.salesChannel) || r.salesChannel.code !== code || r.salesChannel.name !== name) p.push(`${lbl} salesChannel ${short(r.salesChannel, 80)}`);
      }
    }
    const f = await page(owner, { salesChannelId: CH.LM_A });
    if (f?.ok !== true) p.push(`salesChannelId → ${codeOf(f)}`);
    else {
      const items = f.items ?? [];
      if (!items.some((r: Any) => r.id === sLM.id)) p.push("กรอง LINEMAN ไม่มี sLM");
      if (items.some((r: Any) => r.salesChannel?.code !== "LINEMAN")) p.push(`กรอง LINEMAN มีช่องทางอื่น (${[...new Set(items.map((r: Any) => r.salesChannel?.code))].join(",")})`);
    }
    const e = await page(owner, { channel: "ECOM" });
    if (e?.ok !== true) p.push(`channel ECOM → ${codeOf(e)}`);
    else if (!(e.items ?? []).some((r: Any) => r.id === ecomSaleId) || (e.items ?? []).some((r: Any) => r.sourceModule !== "ECOM")) p.push(`channel=ECOM ${short((e.items ?? []).map((r: Any) => r.sourceModule), 80)}`);
    chk("Q1", NS === "" && p.length === 0, "salesChannel ต่อแถว · กรอง salesChannelId · channel เดิม", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // Q2
  {
    const p: string[] = [];
    for (const [lbl, a] of [["MANAGER", manager], ["STAFF+report.view", staffReport]] as const) {
      const d = await detail(a, sLM.id);
      const c = d?.bill?.channel;
      if (d?.ok !== true) p.push(`${lbl} → ${codeOf(d)}`);
      else if (!isRecord(c) || c.code !== "LINEMAN" || c.name !== NAME.LINEMAN || c.ref !== "LM-48152" || c.payout !== "PLATFORM" || c.commissionSatang !== 12600 || c.commissionVatSatang !== 0) p.push(`${lbl} channel ${short(c, 140)}`);
    }
    const ds = await detail(staffRead, sLM.id);
    const cs = ds?.bill?.channel;
    if (ds?.ok !== true) p.push(`STAFF(read) → ${codeOf(ds)}`);
    else if (!isRecord(cs) || cs.code !== "LINEMAN" || cs.ref !== "LM-48152") p.push(`STAFF channel ${short(cs, 100)}`);
    else if (typeof cs.commissionSatang === "number" || typeof cs.commissionVatSatang === "number") p.push(`STAFF เห็นค่าคอมฯ ${short({ c: cs.commissionSatang, v: cs.commissionVatSatang }, 40)}`);
    chk("Q2", NS === "" && p.length === 0, "ผู้จัดการ/report.view เห็น 12600 · STAFF ไม่เห็นตัวเลข", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // Q3
  {
    const p: string[] = [];
    const noCommission = (lbl: string, v: unknown) => {
      const s = short(v, 100_000);
      if (/ommission/i.test(s)) p.push(`${lbl} มีคีย์ค่าคอมฯ`);
      if (/(^|[^0-9])12600([^0-9]|$)/.test(s) || s.includes("126.00") || s.includes("฿126")) p.push(`${lbl} มีตัวเลขค่าคอมฯ`);
    };
    const rp = await call(rcpMod, "receiptPayload", rctx("A"), owner, { saleId: sLM.id });
    const pl = rp?.ok === true ? rp.payload : null;
    if (!pl) p.push(`receiptPayload → ${codeOf(rp)}`);
    else {
      if (!isRecord(pl.channel) || pl.channel.code !== "LINEMAN" || pl.channel.name !== NAME.LINEMAN || pl.channel.ref !== "LM-48152") p.push(`payload.channel ${short(pl.channel, 100)}`);
      noCommission("payload", pl);
      const html = callSync(renderMod, "renderReceiptHtml", pl, { paper: "80", locale: "th" });
      const txt = typeof html === "string" ? html : short(html, 100_000);
      if (!txt.includes(`ช่องทาง ${NAME.LINEMAN}`) || !txt.includes("LM-48152")) p.push("ใบพิมพ์ไม่มี \"ช่องทาง <ชื่อ>\" + ref");
      noCommission("ใบพิมพ์", txt.replace(/<[^>]+>/g, " "));
    }
    const tok = await tokenOf(sLM.id);
    const pub = tok ? await call(pubMod, "publicReceipt", tok) : null;
    if (pub?.ok !== true) p.push(`publicReceipt → ${codeOf(pub)}`);
    else {
      const c = pub.receipt?.channel;
      if (!isRecord(c) || c.name !== NAME.LINEMAN || c.ref !== "LM-48152") p.push(`public channel ${short(c, 80)}`);
      noCommission("public", pub.receipt);
    }
    const rs = await call(rcpMod, "receiptPayload", rctx("A"), owner, { saleId: sStore.id });
    if (rs?.ok !== true || (rs.payload?.channel ?? null) !== null) p.push(`(ตัวควบคุม) STORE payload.channel ${short(rs?.payload?.channel ?? codeOf(rs), 60)}`);
    const tS = await tokenOf(sStore.id);
    const pS = tS ? await call(pubMod, "publicReceipt", tS) : null;
    if (pS?.ok !== true || (pS.receipt?.channel ?? null) !== null) p.push(`(ตัวควบคุม) STORE public channel ${short(pS?.receipt?.channel ?? codeOf(pS), 60)}`);
    chk("Q3", NS === "" && p.length === 0, "ใบเสร็จ/ใบออนไลน์มีช่องทาง+ref · ไม่มีค่าคอมฯ · STORE null", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // Q4
  {
    const p: string[] = [];
    const xAfter = SHIFT1 ? await call(shiftMod, "xReport", ctxOf("A", DEV1), owner, { shiftId: SHIFT1 }) : null;
    const b = xBefore?.ok === true ? xBefore.report : null;
    const a = xAfter?.ok === true ? xAfter.report : null;
    if (!b || !a) p.push(`xReport ก่อน ${codeOf(xBefore)} หลัง ${codeOf(xAfter)}`);
    else {
      const amt = (r: Any, t: string) => Number((r.byMethod ?? []).find((m: Any) => m.type === t)?.amountSatang ?? 0);
      if (!regLM) p.push("ไม่มีบิล LINEMAN จากหน้าขาย (P2)");
      else if (amt(a, "PLATFORM") - amt(b, "PLATFORM") !== 42000) p.push(`PLATFORM ${amt(b, "PLATFORM")} → ${amt(a, "PLATFORM")} (คาด +42000)`);
      if (a.expectedCashSatang !== b.expectedCashSatang) p.push(`expectedCash ${b.expectedCashSatang} → ${a.expectedCashSatang}`);
      if (a.cashSalesSatang !== b.cashSalesSatang) p.push(`cashSales ${b.cashSalesSatang} → ${a.cashSalesSatang}`);
    }
    chk("Q4", NS === "" && p.length === 0, "PLATFORM +42000 · เงินสดที่ควรมีเท่าเดิม", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // Q5
  {
    const p: string[] = [];
    const rp = await call(reportsMod, "reportPayments", ctxOf("A"), owner, { from: today, to: today });
    const rows = rp?.ok === true ? (rp.report?.rows ?? []) : null;
    if (!rows) p.push(`reportPayments → ${codeOf(rp)}`);
    else {
      const pr = rows.find((r: Any) => r.type === "PLATFORM");
      if (!pr || pr.label !== PLATFORM_LABEL) p.push(`แถว PLATFORM ${short(pr, 80)}`);
      if (sum(rows.map((r: Any) => Number(r.amountSatang))) !== rp.report?.totals?.totalPaidSatang) p.push(`Σ แถว ${sum(rows.map((r: Any) => Number(r.amountSatang)))} ≠ totalPaid ${rp.report?.totals?.totalPaidSatang}`);
    }
    let cd: Any = null;
    try {
      cd = typeof svc?.closeDaySummary === "function" ? await svc.closeDaySummary({ tenantId: T, systemId: S.POSA, unitIds: [U.A] }, today) : null;
    } catch (e) {
      p.push(`closeDaySummary throw ${(e as Error).message.slice(0, 50)}`);
    }
    const m = (cd?.byMethod ?? []).find((x: Any) => x.type === "PLATFORM");
    if (!m || m.label !== PLATFORM_LABEL) p.push(`closeDay PLATFORM ${short(m, 80)}`);
    chk("Q5", NS === "" && p.length === 0, "ป้าย แพลตฟอร์ม · Σ ตรง", FX(NS + (p.join(" · ") || "ครบ")));
  }
  // Q6
  {
    const p: string[] = [];
    if (!legacy.pos || !legacy.ecom) p.push("ไม่มีบิลเก่า (fixture)");
    const all = await page(owner);
    const row = (id: string) => (all?.items ?? []).find((r: Any) => r.id === id);
    const rp = row(legacy.pos ?? "");
    const re = row(legacy.ecom ?? "");
    if (!rp || rp.salesChannel?.code !== "STORE" || rp.salesChannel?.name !== "หน้าร้าน") p.push(`บิลเก่า POS ${short(rp?.salesChannel ?? codeOf(all), 80)}`);
    if (!re || re.salesChannel?.code !== "WEB") p.push(`บิลเก่า ECOM ${short(re?.salesChannel ?? "ไม่อยู่ในหน้า", 80)}`);
    const d = legacy.pos ? await detail(manager, legacy.pos) : null;
    if (d?.ok !== true || d.bill?.channel?.code !== "STORE" || d.bill?.channel?.name !== "หน้าร้าน") p.push(`billDetail บิลเก่า ${short(d?.bill?.channel ?? codeOf(d), 80)}`);
    chk("Q6", NS === "" && p.length === 0, "บิลเก่าอ่านเป็น หน้าร้าน / WEB", FX(NS + (p.join(" · ") || "ครบ")));
  }

  // C7 แก้หลังขาย (ท้ายสุด — ไม่กระทบเงินของข้ออื่น)
  {
    const p: string[] = [];
    const before = await snap(sLM.id);
    const e = fx || !CH.LM_A ? null : await save("A", owner, { id: CH.LM_A, name: NAME.LINEMAN, commissionBp: 2000 }, "edit");
    if (e?.ok !== true) p.push(`แก้ LINEMAN → ${codeOf(e)}`);
    const after = await snap(sLM.id);
    if (!before || short(before) !== short(after) || after?.channelCommissionSatang !== 12600) p.push(`snapshot เปลี่ยน ${short(before, 60)} → ${short(after, 60)}`);
    const n = await sale("A", { lines: [["หลังแก้ P21", 10000]], pays: [["PLATFORM", 10000]], channelId: CH.LM_A });
    const sn = await snap(n.id);
    if (!n.id || sn?.channelCommissionSatang !== 2000) p.push(`บิลใหม่ ${codeOf(n.res)} ค่าคอมฯ ${short(sn?.channelCommissionSatang, 10)} (คาด 2000)`);
    chk("C7", NS === "" && p.length === 0, "บิลเดิม 12600 · บิลใหม่ 2000", FX(NS + (p.join(" · ") || "ครบ")));
  }
  await drain();

  // G8 ทุก JV ของร้าน
  {
    const p: string[] = [];
    const es = (await P.accountJournalEntry.findMany({ where: { tenantId: T, refType: "PosSale" }, include: { lines: { include: { account: { select: { code: true } } } } } }).catch(() => [])) as Any[];
    if (!es.length) p.push("ไม่มี JV เลย");
    const unb = es.filter((e: Any) => sum((e.lines ?? []).map((l: Any) => l.debit)) !== sum((e.lines ?? []).map((l: Any) => l.credit)));
    const susp = es.filter((e: Any) => (e.lines ?? []).some((l: Any) => l.account?.code === "9999"));
    const rv = es.filter((e: Any) => e.needsReview);
    if (unb.length) p.push(`ไม่สมดุล ${unb.length}`);
    if (susp.length) p.push(`มี 9999 ${susp.length} (${short(susp.map((e: Any) => String(e.idempotencyKey).split("#").pop()), 60)})`);
    if (rv.length) p.push(`needsReview ${rv.length}`);
    const nCom = es.filter((e: Any) => /#COMMISSION(_REFUNDED)?$/.test(String(e.idempotencyKey ?? ""))).length;
    if (nCom === 0) p.push("ไม่มี JV ค่าคอมฯ เลย (ข้อนี้ต้องมีของ P2.1 ให้ตรวจ)");
    chk("G8", p.length === 0, "สมดุลทุกรายการ · ไม่มี 9999 · ไม่มี needsReview", FX(p.join(" · ") || `ครบ (${es.length} JV · ค่าคอมฯ ${nCom})`));
  }

  // E1 ปฏิเสธเป็นข้อมูล
  {
    const p: string[] = [];
    const want = ["CHANNEL_NOT_FOUND", "CHANNEL_CODE_TAKEN", "CHANNEL_BUILTIN_LOCKED", "CHANNEL_LIMIT", "CHANNEL_INVALID", "CHANNEL_PAY_MISMATCH", "PERMISSION_DENIED", "VALIDATION"];
    const seen = new Set(dataRefusals.map(([, r]) => String(r.code)));
    const miss = want.filter((c) => !seen.has(c));
    if (miss.length) p.push(`ไม่พบ ${miss.join(",")}`);
    for (const [lbl, r] of dataRefusals) {
      if (r.threw) p.push(`${lbl}: throw (${r.code} ${short(r.message, 40)})`);
      else if (typeof r.message !== "string" || !r.message.trim()) p.push(`${lbl}: ไม่มี message`);
      else if (!THAI.test(r.message)) p.push(`${lbl}: message ไม่ใช่ไทย`);
    }
    chk("E1", p.length === 0, `${dataRefusals.length} คำปฏิเสธ · ครบ ${want.length} รหัส · ไทย · ไม่ throw`, p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || "ครบ");
  }
  if (refundRes.length === 0) console.log("  (ไม่มีการคืนเงิน)");
}

// ═════════════════════════ 6. คืนสภาพ — ลบร้านชั่วคราวทั้งร้าน ═════════════════════════
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
  let pending = [...tables];
  for (let pass = 0; pass < 10 && pending.length; pass++) {
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
const fpBefore = await channelFingerprint([]);
let crashed = "";
const wipes: WipeReport[] = [];
try {
  await runStatic();
  await runPure(sharedMod, regSharedMod);
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
  } catch (e) {
    wipes.push({ tables: 0, left: {}, tenantLeft: 0, err: `cleanup: ${(e as Error).message.slice(0, 200)}` });
    console.log(`💥 cleanup: ${(e as Error).message.slice(0, 200)}`);
  } finally {
    removeFetchGuard();
  }
}
await sleep(200);
const tempLeft = wipes.flatMap((w) => Object.entries(w.left).map(([k, v]) => `${k}:${v}`));
const tenantLeft = sum(wipes.map((w) => w.tenantLeft));
const wipeErr = wipes.map((w) => w.err).filter(Boolean).join(" · ");
chk("Z1", tempLeft.length === 0 && tenantLeft === 0 && !wipeErr, "ร้านชั่วคราว 2 ร้าน 0 แถว · Tenant ถูกลบ",
  [tempLeft.length ? `ร้านชั่วคราวเหลือ ${tempLeft.join(", ")}` : `ร้านชั่วคราว 0 (${wipes.map((w) => w.tables).join("/")} ตาราง)`, tenantLeft ? "แถว Tenant ยังอยู่" : "", wipeErr].filter(Boolean).join(" · "));
const countsAfter = await snapshotCounts();
const drift = Object.keys(countsBefore).filter((k) => countsBefore[k] !== countsAfter[k]).map((k) => `${k}:${countsBefore[k]}→${countsAfter[k]}`);
if (drift.length) console.log(`  ℹ️  ร้าน QC seed นับก่อน/หลังต่างกัน (ข้อมูล · อาจเป็น lane อื่น): ${drift.join(", ")}`);
const fpAfter = await channelFingerprint([]);
/** แถวของรอบนี้ที่หลุดออกนอกร้านชั่วคราว (ตัวตัดสิน Z2 — ไม่ไวต่อ lane อื่นที่เขียนพร้อมกัน) */
async function leaksOutside(): Promise<string[]> {
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
  await n("posSale", () => P.posSale.count({ where: { idempotencyKey: { startsWith: KEY_PREFIX } } }));
  await n("posDevice", () => P.posDevice.count({ where: { deviceCode: { contains: `qc21${RAND}` } } }));
  await n("accountContact", () => P.accountContact.count({ where: { name: { contains: RAND }, createdAt: { gte: since } } }));
  if (COL.table) await n("salesChannel", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "SalesChannel" WHERE name LIKE $1`, like)) as Any[])[0]?.n);
  await n("auditLog", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "createdAt" >= $1 AND (coalesce("after"::text,'') || coalesce("before"::text,'')) LIKE $2`, since, like)) as Any[])[0]?.n);
  await n("outboxEvent", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "createdAt" >= $1 AND "payload"::text LIKE $2`, since, like)) as Any[])[0]?.n);
  await n("tenant", () => P.tenant.count({ where: { slug: { startsWith: T_SLUG } } }));
  return out;
}
const leaks = await leaksOutside();
chk("Z2", leaks.length === 0, "ไม่มีแถวของรอบนี้นอกร้านชั่วคราว",
  [leaks.length ? `หลุด ${leaks.join(", ")}` : "ไม่มีแถวของรอบนี้หลุด", `(ข้อมูล) SalesChannel ร้านอื่น ${fpBefore} → ${fpAfter}`, drift.length ? `(ข้อมูล) ร้าน seed นับต่าง ${drift.length} รายการ` : "ร้าน seed นับเท่าเดิม"].join(" · "));
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, missing: skipReasons, guardHits: guardHits.length, residue: tempLeft.length + tenantLeft, leaks, drift })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P2.1 (S): จอ 10/09/12 (P2.1U — visual ของผู้คุมงาน) · ราคาตามช่องทาง (P2.2 — รอยต่อเท่านั้น) · ExternalOrder/adapter/autoAccept
//   (P2.8 — คอลัมน์สร้างแล้วไม่มีพฤติกรรม) · รายงานช่องทาง/กำไรหลังค่าคอมฯ (P2.12) · กระทบยอดเงินโอนแพลตฟอร์ม (P3.10) ·
//   บิลขายบัตรกำนัล (giftCardId) = STORE เสมอ — ตรวจผ่านโค้ดของผู้ตรวจ (ไม่มี fixture บัตรกำนัลในข้อสอบนี้ · ดูโน้ต) ·
//   ชุดเงิน COMMON §7 (qc-pos-account · qc-account-cpa · qc-restaurant-money …) รันโดยผู้สร้างก่อน/หลัง (ผลต้องเท่าเดิม)
