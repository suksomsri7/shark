// QC — POS RUN ใบ P1.12: สมาชิกที่ตะกร้า (ค้น · สมัครด่วน · ผูก/ถอด) + สิทธิ์ที่จอชำระ (ระดับ · ว่อชเชอร์ · คูปอง · แต้มเป็นส่วนลด · สแตมป์ ·
//   ส่งมอบรางวัล) · memberSnapshot/memberBenefits บนบิล · ย้อนครบเมื่อ void/คืนเงิน · ลบตาม PDPA
//   เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ
// requires: pos-seed
//
// สัญญา: ledger/pos-briefs/pos-brief-P1.12.md §0 · §2 R1–R17 · §3 · §4 · §5 CD1–CD9 · §9 มติผู้คุมงาน (ผูกมัด: บัตรของขวัญไม่ใช่วิธีชำระในใบนี้ ·
//        giftCards[] อ่านอย่างเดียว · ผู้กระทำแทน (delegated actor) 3 คีย์เท่านั้น · Q4 เบอร์ตัด -/ช่องว่าง) · pos-brief-COMMON · pos-brief-LANE-RULES
//        ต่อยอด: qc-pos-p1.13 (ร้านชั่วคราว · finally ลบร้าน · แถวค้าง 0) · qc-pos-p1.8 (void/คืนเงิน · ระบายคิวซ้ำ) · qc-member-m2.7/m2.8 (ฟิกซ์เจอร์สิทธิ์)
//        โน้ต: ledger/wo-notes/pos-P1.12-oracle.md (ตารางชื่อ · ความคลาดเคลื่อน · CONTROLLER-DECISION · ผลแดงที่คาด)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้และลงทะเบียนในตารางชื่อของโน้ต — ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P1.12 (S) ต้องส่ง (ย่อ):
//   schema: PosSale.memberSnapshot Json? · PosSale.memberBenefits Json? (migration เพิ่ม 2 คอลัมน์ nullable เท่านั้น)
//   src/lib/modules/pos/register-member.ts: registerMemberLookup(ctx, actor, {q}) · registerQuickMember(ctx, actor, {phone, name, birthDate?,
//     marketingConsent, heardFrom, idempotencyKey}) · registerMemberBenefits(ctx, actor, {memberId, cart}) · registerFulfilReward(ctx, actor, {memberId, redemptionId})
//   register-actions.ts ("use server"): registerMemberLookupAction · registerQuickMemberAction · registerMemberBenefitsAction · registerFulfilRewardAction
//   register.ts: RegisterQuoteInput += couponCode? · memberChoices? {voucherId?, points?} · ผลยอด += tierDiscountSatang · memberDiscountSatang · memberLines ·
//     pointsToEarn · stampsToAdd · memberConflicts[{kind, code, message}] · submit ส่ง memberSystemId/memberChoices/คูปอง/memberSnapshot เข้า createSale ·
//     ผล submit += member {pointsBurned, pointsExpected, pointsBalanceAfterBurn} · เลิก MEMBER_RIGHTS_UNSUPPORTED (คงรหัส/ข้อความไว้)
//   service.ts: saleWalletCart(lines, unitId, couponCode) (ตัวช่วยบริสุทธิ์ตัวเดียว ใช้ร่วม createSale + quote) · CreateSaleInput += memberSnapshot? ·
//     createSale เขียน memberBenefits = {lines (ไม่รวม COUPON), pointsBurned} ทุกผู้เรียกเมื่อมีสิทธิ์ที่ใช้
//   readers: receiptPayload.member {name, memberCode, phoneMasked, tierName?, pointEarned, pointBalance?} + totals.memberBenefits[] ·
//     BillDetail.member.benefits[] · publicReceipt.receipt.memberBenefits[] · แต้มคงเหลือจากระบบแต้มของสาขา (สด)
//   outbox: member.erased + ส่วน POS (หลังตัวรับของ CRM) ล้าง memberSnapshot.name/phoneMasked ของบิลของคนนั้น (idempotent)
//   refusal: MEMBER_SYSTEM_MISSING MEMBER_SUSPENDED PHONE_INVALID VOUCHER_INVALID VOUCHER_COUPON_CONFLICT COUPON_INVALID POINTS_DISABLED
//     (ORACLE-EDIT มติผู้คุมงาน 1: เลิก VOUCHER_LIMIT — voucherId เป็นสตริงเดียว ⇒ ไปไม่ถึง · อาร์เรย์ = VALIDATION)
//     POINTS_BELOW_MIN POINTS_INSUFFICIENT POINTS_CAPPED BENEFITS_EXCEED_TOTAL MEMBER_RIGHTS_CHANGED (+ MEMBER_NOT_FOUND เดิม) → pos.register.errors.<camel>
//
// ขอบเขต: ST สถิต · B ตัวแกะ/ตรวจรูป · M สมาชิก/ค้น/สมัคร/ผูก · T ระดับ · V ว่อชเชอร์/คูปอง · P แต้ม · S สแตมป์ · W รางวัล · X ย้อนครบ ·
//   R ตัวอ่าน/สำเนา/PDPA · Z คืนสภาพ + ทางเดิมของ createSale
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p1.13): SKIP เมื่อของ P1.12 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต ST1–ST5 (ไม่โหลด prisma · exit 1 ถ้าแดง)
//    ฐาน = QC4 เท่านั้น (host ep-frosty-lab ก่อนเขียนแถวแรก) · ร้านชั่วคราว `posqc-p112-<rand>` (ลบทั้งร้านใน finally · นับแถวค้างทุกตาราง = 0)
//    ฟิกซ์เจอร์ผ่านฟังก์ชันของโมดูล (ยกเว้นที่ระบุ: ว่อชเชอร์หมดอายุ = เลื่อน expiresAt · เปลี่ยนชื่อสมาชิกเพื่อพิสูจน์ว่าสำเนาไม่เปลี่ยน) · SQL ดิบ = อ่านคอลัมน์ใหม่ + ลบร้าน
//    ไม่มีเครือข่าย: globalThis.fetch = ตัวกั้น (503 + นับ) ตลอดช่วง DB
//    โมดูล/คอลัมน์ที่ยังไม่มีเข้าถึงแบบไดนามิก (`import(… as string)` + catch · SQL ดิบเมื่อคอลัมน์มีจริง) — next build ตรวจชนิด scripts/*.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p1.12";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · X1 idempotency/เล่นซ้ำ · X2 ข้ามขอบเขต (404-not-403) · X3 สิทธิ์ · X4 เงิน · X5 ผลข้างเคียงครบทุกทาง · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P1.12-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "S", "[§3 CD9] schema PosSale.memberSnapshot Json? + memberBenefits Json? · migration ที่แตะสองคอลัมน์นี้มีแต่ ALTER TABLE \"PosSale\" ADD COLUMN \"memberSnapshot\"/\"memberBenefits\" JSONB (nullable · ไม่มีคำสั่งอื่น)"),
  D("ST2", "S", "[hard rule · R17 · มติ Q2] pos/** ไม่ import voucher/point/stamp/giftcard (static+dynamic · ยกเว้นเดิม public-receipt.ts→point) · ไม่ import member/<ไฟล์ใน> · register-member.ts มีจริง · ผู้กระทำแทนมีคีย์ member.* ตรง 3 ตัว (customer.read · customer.create · loyalty.fulfil) · ไม่เรียกฟังก์ชันผู้ดูแลของสมาชิก"),
  D("ST3", "S", "[hard rule · §7] ทุกไฟล์ \"use server\" ใน modules/pos export async function ล้วน · register-actions.ts มี registerMemberLookupAction registerQuickMemberAction registerMemberBenefitsAction registerFulfilRewardAction (แต่ละตัวเรียกฟังก์ชันบริการของตัวเอง + catch)"),
  D("ST4", "S", "[CD3 · มติ Q1] ไม่มี GIFT_CARD/VOUCHER/STORE_CREDIT ใน enum PosPayType · REGISTER_PAY_TYPES ไม่มี GIFT_CARD · ไม่มี migration ALTER TYPE \"PosPayType\" … GIFT_CARD"),
  D("ST5", "S", "[R6 R7 R9 R16 Q8] รหัสปฏิเสธใหม่ 12 ตัว (มติ 1: ไม่มี VOUCHER_LIMIT)อยู่ใน RegisterRefusalCode + REFUSAL_KEY → errors.<camel> + ข้อความ th/en (th ไทย) · MEMBER_RIGHTS_UNSUPPORTED คงไว้แต่ register.ts ไม่คืนแล้ว · REG_QUOTE_KEYS มี couponCode/memberChoices · ตัวช่วย saleWalletCart export และถูกเรียกทั้งใน createSale และฝั่ง quote · CreateSaleInput.memberSnapshot? · createSale เขียน memberBenefits · submit ส่ง memberSystemId · member.erased: ตัวรับ CRM มาก่อนส่วน POS"),
  // ── B ตัวแกะ/ตรวจรูป ──
  D("B1", "-", "[R6] quote รับ couponCode (สตริง) และ memberChoices {voucherId, points} ตรงตัว · couponCode ไม่ใช่สตริง / memberChoices คีย์แปลก / voucherIds (รูปเดิม) / ไม่ใช่ออบเจกต์ → VALIDATION"),
  D("B2", "-", "[R6 CD3 มติ Q1] memberChoices.giftCard → VALIDATION ทั้ง quote และ submit · ไม่มีบิล · ยอดบัตรของขวัญไม่เปลี่ยน"),
  D("B3", "-", "[R6] memberChoices.points 1.5 / −1 / \"100\" / null-ไม่ใช่จำนวน → VALIDATION (ไม่ throw)"),
  D("B4", "-", "[R9] submit ที่มี memberSnapshot หรือ memberBenefits จาก client → VALIDATION · ไม่มีบิลของคีย์นั้น"),
  D("B5", "-", "[R4] registerQuickMember: คีย์แปลก · ไม่มี idempotencyKey · heardFrom TIKTOK · birthDate 20/05/1992 · name ว่าง/81 ตัว · marketingConsent ไม่ใช่ boolean → VALIDATION · ไม่มี Customer เพิ่ม"),
  D("B6", "-", "[R3 CD4] บิลพักเก็บ memberId + couponCode ไปกลับครบ · ไม่เก็บ memberChoices (พักพร้อมสิทธิ์ = VALIDATION หรือเรียกคืนแล้วไม่มี memberChoices) · registerCanonicalCart คง couponCode"),
  // ── M สมาชิก ──
  D("M1", "X2", "[R2 มติ Q3 Q4] ค้นเบอร์: ต้นเบอร์ 7 หลัก / แบบมีขีด → X · เบอร์เก่าที่เก็บแบบมีขีด ค้นด้วยตัวเลขล้วนเจอ · ≤ 8 รายการ · คีย์ DTO ตรงตัว (id memberCode name phoneMasked tier points lastPurchaseAt purchaseCount suspended) · phoneMasked 089-xxx-5521 · ไม่มีเบอร์เต็มในผล · \"08\" → items [] (ไม่ปฏิเสธ)"),
  D("M2", "-", "[R2] ค้นชื่อ (≥ 2 ตัว) เจอ X Y S L E ไม่เจอ M (MERGED) ไม่เจอ Z (ระบบอื่น) · เรียงตาม lastActivityAt ใหม่ก่อน · รหัสสมาชิกตรงตัว → X คนเดียว · ชื่อ 1 ตัว → items []"),
  D("M3", "X2", "[R2] SHARK-MC:<token> ของ X → [X] · token ของ Z (ระบบสมาชิกอื่น) → [] · token มั่ว → []"),
  D("M4", "X2", "[R1] 404-not-403: quote/benefits ด้วยสมาชิกระบบอื่น (Z) / ร้านอื่น / M ที่ถูกรวม / id มั่ว → MEMBER_NOT_FOUND ข้อความเดียวกันทุกกรณี"),
  D("M5", "-", "[R1] S (SUSPENDED): quote / benefits / submit → MEMBER_SUSPENDED · ค้นแล้วขึ้นพร้อม suspended:true · ไม่มีบิล"),
  D("M6", "-", "[R1] สาขา B (ไม่มีระบบสมาชิก): lookup / quick register / benefits / fulfil / quote+memberId → MEMBER_SYSTEM_MISSING"),
  D("U1", "-", "[P1.12U มติ 2 · ORACLE-EDIT] registerStatus.memberEnabled: สาขา A (มีระบบสมาชิก) → true · สาขา B (ไม่มีระบบสมาชิก) → false (จอไม่มีแถวสมาชิก/ส่วนสิทธิ์)"),
  D("M7", "X3", "[CD2 มติ Q2 · R5] พนักงานมีแค่ pos.sale.create (ไม่มี member.*) ค้น · ดูสิทธิ์ · สมัครด่วนได้ · benefits อ่านอย่างเดียว (นับแถวเท่าเดิม) · คีย์ผลตรง R5 · tier 5%/cap ฿100 · ว่อชเชอร์ applicable/reason · giftCards {numberMasked, balanceSatang, expiresAt} ไม่มีเลขเต็ม/PIN · stamps"),
  D("M8", "X3", "[มติ Q2] ผู้ใช้ไม่มี pos.sale.create (มี pos.sale.read + member.*) → PERMISSION_DENIED จาก lookup / quick register / benefits / fulfil / quote · ไม่มีอะไรถูกเขียน"),
  D("M9", "X5", "[R4] สมัครด่วน → Customer (source POS · homeUnitId A · sourceDetail.heardFrom/unitId) + consent LINE/EMAIL/SMS ตาม marketingConsent (source STAFF) + attribution FIRST/LAST (POS · staffUserId = ผู้กระทำจริง · unitId A) + audit pos.member.registered {customerId, created:true, unitId} ผู้กระทำจริง ไม่มีเบอร์เต็ม · ผล {ok, created:true, member (DTO R2)}"),
  D("M10", "X1", "[R4] เบอร์ซ้ำ (X) → {ok:true, created:false, member.id = X} · ยิงซ้ำ idempotencyKey เดิม → ลูกค้าคนเดิม · audit 1 แถว"),
  D("M11", "X5", "[R4 R9 CD8] PHONE_INVALID (7 หลัก · ตัวอักษร) · บิลของ X มี memberSnapshot ตรงตัว {name, memberCode, phoneMasked 089-xxx-5521, tierKey gold, tierName Gold}"),
  // ── T ระดับ ──
  D("T1", "X4", "[R6 R8] Gold 5%: quote tierDiscountSatang 2,500 บนตะกร้า ฿500 = memberLines TIER = PosSale.tierDiscountSatang · grandTotal 47,500 · สูตรยอด subtotal − lineDisc − bill − coupon + svc − memberDiscount"),
  D("T2", "-", "[R6] MEMBER_RIGHTS_UNSUPPORTED ไม่ถูกคืนอีก (quote/submit ของสมาชิกที่มีส่วนลดระดับผ่าน)"),
  D("T3", "X4", "[CD6 Q6] ระดับซ้อนส่วนลดท้ายบิล: ฐานระดับ = Σ บรรทัดก่อนส่วนลดท้ายบิล — ฿500 ลดท้ายบิล ฿50 → ระดับ 2,500 · ยอด 42,500"),
  D("T4", "X3", "[CD6] ส่วนลดระดับไม่นับในเพดานส่วนลดของแคชเชียร์ (P1.15): STAFF เพดาน 10% ลดท้ายบิล 9% + Gold 5% → ok · ตัวควบคุม: ไม่มีสมาชิก 11% → DISCOUNT_EXCEEDS_LIMIT"),
  D("T5", "X4", "[R6 ตัวช่วยร่วม] quote = บิลจริง (grandTotal + vat) ทุกตะกร้าผสม ≥ 6 แบบ (ระดับ · ว่อชเชอร์ · คูปอง · แต้ม · walk-in คูปอง% + ลดท้ายบิล · ระดับ + คูปอง% + ลดท้ายบิล)"),
  // ── V ว่อชเชอร์/คูปอง ──
  D("V1", "X5", "[R7 R8 R11] ว่อชเชอร์ ฿30 → USED usedRef.saleId · PosSale.voucherUseIds [v] · memberBenefits มี VOUCHER 3,000 · ยอด 16,000"),
  D("V2", "-", "[R11] ว่อชเชอร์หมดอายุ / ของ Y → quote memberConflicts VOUCHER_INVALID · submit VOUCHER_INVALID ข้อความไทย · ไม่มีบิล · ว่อชเชอร์ไม่เปลี่ยน"),
  D("V3", "-", "[R11 CD5 · มติผู้คุมงาน 1 (ORACLE-EDIT)] voucherId เป็นอาร์เรย์ (1 หรือ 2 id) → VALIDATION ทั้ง quote และ submit · ไม่มีบิล · ทั้งสองใบ ACTIVE"),
  D("V4", "-", "[R11] ว่อชเชอร์ห้ามซ้อน + คูปอง → quote memberConflicts VOUCHER_COUPON_CONFLICT · submit VOUCHER_COUPON_CONFLICT · ไม่มีบิล/การใช้คูปอง · ว่อชเชอร์ ACTIVE"),
  D("V5", "X5", "[R6 R8] คูปอง WELCOME50 ที่หน้าขายกับสมาชิก → quote couponDiscountSatang 5,000 · CouponRedemption REDEEMED 5,000 ของบิล · ยอด 42,500"),
  D("V6", "X5", "[R6] คูปอง walk-in (PCT10 + ลดท้ายบิล ฿20) → ฐานคูปอง = subtotal − bill · REDEEMED · ยอด 25,200"),
  D("V7", "-", "[R11 R16] โค้ดมั่ว → COUPON_INVALID (walk-in submit · ข้อความไทย) · กับสมาชิก quote memberConflicts COUPON_INVALID · ไม่มีบิล"),
  D("V8", "X1", "[R7] ยิงพร้อมกัน 2 บิลด้วยว่อชเชอร์ใบเดียว → บิลเกิด 1 ใบ · อีกใบ MEMBER_RIGHTS_CHANGED (หรือ VOUCHER_INVALID ถ้าเห็นหลัง commit) · usedRef = ผู้ชนะ · ไม่มีแถวแต้ม/บิลกำพร้า"),
  // ── P แต้ม ──
  D("P1", "-", "[R5 R10] benefits(X).points = {balance 1,240 · burnRateSatang 10 · burnMinPoints 100 · burnMaxPct 50 · balanceValueSatang 12,400 · expiringSoon[]}"),
  D("P2", "X5", "[R7 R8 R10] ใช้ 500 แต้ม → BURN −500 คีย์ pos-burn-<saleId> · ส่วนลด ฿50 · ยอด 42,500 · memberBenefits POINTS 5,000 + pointsBurned 500 · ผล submit member.pointsBurned 500 · pointsBalanceAfterBurn = ก่อน − 500"),
  D("P3", "-", "[R16] 50 แต้ม (< 100) → quote POINTS_BELOW_MIN · submit POINTS_BELOW_MIN · ไม่มีบิล/แถวแต้ม"),
  D("P4", "-", "[R16] แต้มเกินยอดคงเหลือ → POINTS_INSUFFICIENT · ไม่มีบิล"),
  D("P5", "X4", "[R7 R10] เกิน 50% → quote POINTS_CAPPED (เส้น POINTS ถูกตัด) · submit แต้มเดิม → POINTS_CAPPED {allowedPoints 475} ไม่มีบิล/แถวแต้ม · ตัวควบคุม: ส่ง 475 → ok BURN −475"),
  D("P6", "-", "[R16] สาขา C (มีสมาชิก ไม่มีระบบแต้ม) → quote POINTS_DISABLED · submit POINTS_DISABLED · benefits.points = null"),
  D("P7", "X5", "[R7 R8 R12] หลังระบายคิว pointEarned = pointsExpected ของผล submit = point.computeEarn(ไม่นับส่วนที่จ่ายด้วยแต้ม) > 0"),
  D("P8", "X4", "[CD1 R10] GL บิลใช้แต้ม (Y 500 แต้ม ฿200 → ฿150) = GL บิลเดียวกันที่ลดท้ายบิล ฿50 ทุกรหัสบัญชี · สมดุล · VAT บิลเท่ากัน"),
  // ── S สแตมป์ ──
  D("S1", "-", "[R12] quote ตะกร้า ฿800 ของ X → stampsToAdd มีการ์ดของร้าน count 1"),
  D("S2", "X5", "[R12] หลังระบายคิว: StampEvent ADD (refType SALE refId บิล) 1 แถว · PosSale.stampEventIds มี id นั้น"),
  D("S3", "X1", "[R12] เล่น consumers[pos.sale.paid] ซ้ำ 2 รอบ + ระบาย → ยัง ADD 1 แถว"),
  D("S4", "X1", "[R12 R14] void บิล → ADD ของบิลมี VOID คู่ 1 · ดวงในการ์ดลด 1 · ระบายซ้ำยัง VOID 1"),
  // ── W รางวัล ──
  D("W1", "X5", "[R13] benefits.rewardsPending มีรายการของ X · registerFulfilReward (พนักงานไม่มี member.loyalty.fulfil) → ok · FULFILLED · fulfilledById = ผู้กระทำจริง · audit pos.member.reward_fulfilled 1"),
  D("W2", "X1", "[R13] ส่งมอบซ้ำ → ok · audit ยัง 1 · memberId ไม่ใช่เจ้าของรายการ → NOT_FOUND/MEMBER_NOT_FOUND ไม่เปลี่ยนอะไร"),
  // ── X ย้อนครบ ──
  D("X1", "X5", "[R14] void บิล (ระดับ + ว่อชเชอร์ + คูปอง + 200 แต้ม + ดวง) → ว่อชเชอร์ ACTIVE · Σ แต้มของบิล = 0 · ยอดแต้ม = ก่อนขาย · คูปอง RELEASED · ดวงถูก VOID · ยอดสะสม = ก่อนขาย"),
  D("X2", "X1", "[R14] เล่น consumers[pos.sale.voided] ซ้ำ 2 รอบ + ระบาย → แถวแต้ม/ยอดแต้ม/VOID ดวง/ยอดสะสม/คูปองไม่เปลี่ยน"),
  D("X3", "X5", "[R14 CD7] คืนเงินครบ → ว่อชเชอร์ ACTIVE · Σ แต้มของบิล = 0 · คูปอง RELEASED · ดวงถูก VOID · ยอดสะสม = ก่อนขาย"),
  D("X4", "X5", "[R14 P1.8] คืนบางส่วน → ว่อชเชอร์ยัง USED · BURN ยังอยู่ (ไม่มี +100 คืน) · หักแต้มที่ได้ตามสัดส่วน (คีย์ pos-refund-<refundId>:<earnId>) · ดวงไม่ถูก VOID"),
  D("X5", "X1", "[R14] เล่น consumers[pos.sale.refunded] ซ้ำ 2 รอบ (ครบ + บางส่วน) + ระบาย → แถวแต้ม/ยอดแต้มไม่เปลี่ยน"),
  D("X6", "X1", "[R14 AUDIT M11] void ทันทีหลังขาย (แข่งกับคิว pos.sale.paid) → หลังระบาย 2 รอบ Σ แต้มของบิล = 0 · ว่อชเชอร์ ACTIVE · ดวงสุทธิ 0 · ยอดสะสมสุทธิ 0"),
  D("X7", "X4", "[R14 COMMON-1] GL ของบิลที่ void: Σ ต่อรหัสบัญชี = 0 (ขาย + กลับรายการ) · ทุก JV สมดุล"),
  // ── R ตัวอ่าน ──
  D("R1", "-", "[R15] receiptPayload: totals.memberBenefits แยก TIER 2,000 / VOUCHER 3,000 / POINTS 1,000 · billDiscountSatang = discount − coupon − Σ memberBenefits = 1,000 · couponDiscountSatang 5,000 · member {name ตามสำเนา, memberCode, phoneMasked, tierName Gold}"),
  D("R2", "-", "[R15 R9] แต้มคงเหลือบนใบเสร็จ = ยอดของระบบแต้มของสาขา (ไม่ใช่ระบบแต้มอื่นที่อัปเดตล่าสุด) · เปลี่ยนชื่อสมาชิกแล้วใบเสร็จยังเป็นชื่อในสำเนา"),
  D("R3", "-", "[R15 P1.11 R2] publicReceipt: memberBenefits ตรงกับบิล · points {earned = pointEarned, balance = ระบบแต้มของสาขา} · ไม่มีชื่อ/เบอร์/รหัสสมาชิก"),
  D("R4", "-", "[R15] billDetail.member {name ตามสำเนา, tierName Gold, benefits ตรงกับ memberBenefits, pointsEarned = PosSale.pointEarned}"),
  D("R5", "X1", "[R9] memberSnapshot + memberBenefits ไม่เปลี่ยนหลัง commit (ระบายคิว · คืนบางส่วน · void · เปลี่ยนชื่อ)"),
  D("R6", "X1", "[R9 Q8] PDPA: ลบสมาชิก E → บิลของ E memberSnapshot.name/phoneMasked = null · tierKey/tierName/memberBenefits/ยอดเงินคงเดิม · เล่น member.erased ซ้ำ 2 รอบ ผลเดิม · บิลของคนอื่นไม่ถูกแตะ"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราวเหลือ 0 แถวทุกตารางที่มี tenantId + แถว Tenant ถูกลบ · ร้าน QC ของ seed ไม่มีแถวของรอบนี้ (บิล/เครื่อง/สมาชิก/audit/outbox ที่มีรหัสรอบ) — นับก่อน/หลังพิมพ์เป็นข้อมูล"),
  D("Z2", "X4", "[COMMON-2 CD3 R9] ทางเดิมของ createSale (memberChoices: แต้ม + บัตรของขวัญ · ไม่มี memberSnapshot) ยอดเดิม 26,500 · giftCardTxnId · memberBenefits ถูกเขียน (TIER POINTS GIFTCARD · Σ = ส่วนลดสมาชิก) · memberSnapshot null · walk-in createSale memberBenefits null"),
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
  const full = id.startsWith("P1.12-") ? id : `P1.12-${id}`;
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
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : r === undefined ? "undefined" : r === null ? "null" : "UNKNOWN");
const THAI = /[ก-๛]/;
/** ปฏิเสธเป็นข้อมูล: {ok:false, code ตรง, message ไทย} ไม่ throw */
const refused = (r: Any, code: string) => r?.ok === false && String(r.code) === code && !r.threw && typeof r.message === "string" && THAI.test(r.message);
const refusedAny = (r: Any, codes: string[]) => codes.some((c) => refused(r, c));
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
const tryImport = async (p: string): Promise<Any> => {
  try {
    return await import(p as string);
  } catch (e) {
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 140)})`);
    return null;
  }
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const isRecord = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);
const camel = (code: string) => code.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const joinP = (p: string[], ok = "ครบ") => p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || ok;

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
/** เนื้อฟังก์ชัน export ชื่อ n (ถึง export ถัดไป) */
function fnBody(src: string, n: string): string {
  const m = new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b`).exec(src);
  if (!m) return "";
  const next = src.slice(m.index + 10).search(/\nexport\s/);
  return next < 0 ? src.slice(m.index) : src.slice(m.index, m.index + 10 + next);
}

const POS_DIR = "src/lib/modules/pos";
const F = {
  rm: `${POS_DIR}/register-member.ts`,
  register: `${POS_DIR}/register.ts`,
  shared: `${POS_DIR}/register-shared.ts`,
  actions: `${POS_DIR}/register-actions.ts`,
  service: `${POS_DIR}/service.ts`,
  consumers: "src/lib/outbox-consumers.ts",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
};
const SVC_FNS = ["registerMemberLookup", "registerQuickMember", "registerMemberBenefits", "registerFulfilReward"] as const;
const ACTIONS: [string, string][] = SVC_FNS.map((f) => [`${f}Action`, f]);
const NEW_CODES = [
  "MEMBER_SYSTEM_MISSING", "MEMBER_SUSPENDED", "PHONE_INVALID", "VOUCHER_INVALID", "VOUCHER_COUPON_CONFLICT", "COUPON_INVALID",
  "POINTS_DISABLED", "POINTS_BELOW_MIN", "POINTS_INSUFFICIENT", "POINTS_CAPPED", "BENEFITS_EXCEED_TOTAL", "MEMBER_RIGHTS_CHANGED",
];
const DELEGATED_KEYS = ["member.customer.read", "member.customer.create", "member.loyalty.fulfil"];
/** ฟังก์ชันผู้ดูแล/เขียนของโมดูลสมาชิกที่ผู้กระทำแทนห้ามเรียก (มติ Q2) */
const ADMIN_FNS = [
  "updateMember", "setStatus", "setOwner", "setTags", "mergeMembers", "mergeMembersApproved", "dismissDuplicate", "linkIdentity", "unlinkIdentity",
  "eraseMemberById", "requestErase", "applyEraseApproved", "requestEraseFromCrm", "setConsent", "exportBundle", "requestExport", "setBenefits",
  "createTierDef", "updateTierDef", "archiveTierDef", "applyManualTierApproved", "setManualTier", "applyTierChange", "getMember360",
  "createRewardV2", "updateRewardV2", "toggleReward", "cancelV2", "redeemV2", "adjustPoints", "adjustWithApproval", "burnFifo", "earnWithLot",
];
const ITEM_KEYS = ["id", "memberCode", "name", "phoneMasked", "tier", "points", "lastPurchaseAt", "purchaseCount", "suspended"];
const SNAP_KEYS = ["name", "memberCode", "phoneMasked", "tierKey", "tierName"];
const AUDIT_REG = "pos.member.registered";
const AUDIT_FULFIL = "pos.member.reward_fulfilled";

const srcOf = (f: string) => stripComments(rd(f));
const STATIC_IDS = ["ST1", "ST2", "ST3", "ST4", "ST5"].map((x) => `P1.12-${x}`);
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.rm))) skipReasons.push(`${F.rm} ยังไม่มี`);
for (const n of SVC_FNS) if (!exportsFn(srcOf(F.rm), n)) skipReasons.push(`ยังไม่มี export ${n} (register-member.ts)`);
if (!walk(POS_DIR).some((f) => exportsFn(srcOf(f), "saleWalletCart"))) skipReasons.push("ยังไม่มี export saleWalletCart (ตัวช่วยร่วม createSale + quote)");

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB) ═════════════════════════
async function runStatic(): Promise<void> {
  console.log("\n── ST ข้อสถิต (ไม่แตะ DB) ──");
  const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
  // ST1 schema + migration เพิ่มอย่างเดียว
  {
    const p: string[] = [];
    const ps = prismaBlock(schemaSrc, "model", "PosSale");
    for (const c of ["memberSnapshot", "memberBenefits"]) {
      const l = fieldLine(ps, c);
      if (!l) p.push(`PosSale ไม่มี ${c}`);
      else if (!new RegExp(`^${c}\\s+Json\\?(\\s|$)`).test(l)) p.push(`PosSale.${c} ไม่ใช่ Json? (${l.slice(0, 50)})`);
    }
    const files = walk("prisma/migrations", [], /\.sql$/).filter((f) => /"memberSnapshot"|"memberBenefits"/.test(rd(f)));
    if (!files.length) p.push('ไม่มี migration ที่แตะ "memberSnapshot"/"memberBenefits"');
    const added = new Set<string>();
    for (const f of files) {
      const stmts = rd(f).replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
      for (const s of stmts) {
        const m = /^ALTER\s+TABLE\s+"PosSale"\s+([\s\S]+)$/i.exec(s);
        const parts = m ? m[1]!.split(",").map((x) => x.trim()) : [];
        const okParts = parts.map((x) => /^ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"(memberSnapshot|memberBenefits)"\s+JSONB$/i.exec(x));
        if (!m || okParts.some((x) => !x)) p.push(`${f.split("/").slice(-2, -1)[0]}: คำสั่งนอกเหนือ 2 คอลัมน์ nullable (${short(s.replace(/\s+/g, " "), 80)})`);
        for (const x of okParts) if (x) added.add(x[1]!);
      }
    }
    for (const c of ["memberSnapshot", "memberBenefits"]) if (files.length && !added.has(c)) p.push(`migration ไม่มี ADD COLUMN "${c}" JSONB`);
    chk("ST1", p.length === 0, "2 คอลัมน์ Json? + SQL เพิ่มอย่างเดียว", joinP(p, `ครบ (${files.length} ไฟล์ migration)`));
  }
  // ST2 ขอบเขตโมดูล + ผู้กระทำแทน
  {
    const p: string[] = [];
    const LOYALTY = /^(?:@\/lib\/modules\/(?:voucher|point|stamp|giftcard)(?:\/[^"']*)?|(?:\.\.\/)+(?:voucher|point|stamp|giftcard)(?:\/[^"']*)?)$/;
    const INNER = /^(?:@\/lib\/modules\/member\/.+|(?:\.\.\/)+member\/.+)$/;
    const ALLOW = new Set(["public-receipt.ts|@/lib/modules/point"]); // P1.11 มติผู้คุมงาน 11 (มีอยู่ก่อนใบนี้ — CONTROLLER-DECISION 6)
    const posFiles = walk(POS_DIR);
    for (const f of posFiles) {
      const s = srcOf(f);
      const nm = f.slice(POS_DIR.length + 1);
      const specs = [...s.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm)].map((m) => m[1]!);
      for (const sp of new Set(specs)) {
        if (LOYALTY.test(sp) && !ALLOW.has(`${nm}|${sp}`)) p.push(`${nm} import ${sp} (ต้องผ่าน @/lib/modules/member)`);
        if (INNER.test(sp)) p.push(`${nm} import ${sp} (ไฟล์ในของสมาชิก — ต้องผ่าน facade)`);
      }
    }
    const rm = srcOf(F.rm);
    if (!rm) p.push(`ไม่มี ${F.rm}`);
    else {
      const keys = [...new Set([...rm.matchAll(/["'](member\.[A-Za-z_.*]+)["']\s*:\s*true/g)].map((m) => m[1]!))].sort();
      if (short(keys) !== short([...DELEGATED_KEYS].sort())) p.push(`ผู้กระทำแทนมีคีย์ ${short(keys, 120)} (ต้องตรง ${DELEGATED_KEYS.join(",")})`);
      const bad = ADMIN_FNS.filter((n) => new RegExp(`\\b${n}\\s*\\(`).test(rm));
      if (bad.length) p.push(`register-member.ts เรียกฟังก์ชันผู้ดูแล ${bad.join(",")}`);
      if (!/["']@\/lib\/modules\/member["']/.test(rm)) p.push("register-member.ts ไม่ได้ใช้ facade @/lib/modules/member");
    }
    chk("ST2", p.length === 0, "pos→loyalty ผ่าน member facade เท่านั้น · ผู้กระทำแทน 3 คีย์ · ไม่เรียกงานผู้ดูแล", joinP(p, `ครบ (${posFiles.length} ไฟล์ pos)`));
  }
  // ST3 "use server"
  {
    const p: string[] = [];
    const files = walk(POS_DIR).filter((f) => /^["']use server["']/.test(rd(f).replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "").trimStart()));
    for (const f of files) {
      const s = srcOf(f);
      const bad = [...s.matchAll(/^\s*export\s+[^\n]*/gm)].map((m) => m[0].trim()).filter((l) => !/^export\s+async\s+function\s+\w+/.test(l));
      if (bad.length) p.push(`${f.split("/").pop()}: export ที่ไม่ใช่ async function (${short(bad.map((b) => b.slice(0, 40)), 100)})`);
    }
    const s = srcOf(F.actions);
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
    chk("ST3", p.length === 0, "use server = async function ล้วน · 4 actions", joinP(p, `ครบ (${files.length} ไฟล์ use server)`));
  }
  // ST4 ไม่มีบัตรของขวัญเป็นวิธีชำระ
  {
    const p: string[] = [];
    const en = prismaBlock(schemaSrc, "enum", "PosPayType");
    if (!en) p.push("ไม่พบ enum PosPayType");
    for (const v of ["GIFT_CARD", "VOUCHER", "STORE_CREDIT"]) if (new RegExp(`^\\s*${v}\\b`, "m").test(en)) p.push(`PosPayType มี ${v}`);
    const sh = srcOf(F.shared);
    const pt = /REGISTER_PAY_TYPES\s*=\s*\[([^\]]*)\]/.exec(sh)?.[1] ?? "";
    if (!pt) p.push("ไม่พบ REGISTER_PAY_TYPES");
    if (/GIFT_CARD/.test(pt)) p.push("REGISTER_PAY_TYPES มี GIFT_CARD");
    const mig = walk("prisma/migrations", [], /\.sql$/).filter((f) => /ALTER\s+TYPE\s+"PosPayType"[^;]*GIFT_CARD/i.test(rd(f)));
    if (mig.length) p.push(`migration เพิ่ม GIFT_CARD ใน PosPayType: ${mig.map((f) => f.split("/").slice(-2, -1)[0]).join(",")}`);
    chk("ST4", p.length === 0, "ไม่มี GIFT_CARD tender (CD3)", joinP(p));
  }
  // ST5 การเดินสาย
  {
    const p: string[] = [];
    const sh = srcOf(F.shared);
    const ub = /export\s+type\s+RegisterRefusalCode\s*=([\s\S]*?);/.exec(sh)?.[1] ?? "";
    const missU = [...NEW_CODES, "MEMBER_RIGHTS_UNSUPPORTED", "MEMBER_NOT_FOUND"].filter((c) => !new RegExp(`["']${c}["']`).test(ub));
    if (missU.length) p.push(`RegisterRefusalCode ขาด ${missU.join(",")}`);
    const rk = /REFUSAL_KEY[^=]*=\s*\{([\s\S]*?)\};/.exec(sh)?.[1] ?? "";
    const missK = NEW_CODES.filter((c) => !new RegExp(`\\b${c}\\s*:\\s*["']errors\\.${camel(c)}["']`).test(rk));
    if (missK.length) p.push(`REFUSAL_KEY ไม่แปลง ${missK.join(",")} → errors.<camel>`);
    for (const [lang, f] of [["th", F.msgTh], ["en", F.msgEn]] as const) {
      let j: Any = null;
      try {
        j = JSON.parse(rd(f) || "null");
      } catch (e) {
        p.push(`${f} อ่าน JSON ไม่ได้: ${(e as Error).message.slice(0, 40)}`);
      }
      const errs = j?.register?.errors;
      if (!isRecord(errs)) p.push(`${lang}: ไม่มี register.errors`);
      else {
        const miss = [...NEW_CODES, "MEMBER_RIGHTS_UNSUPPORTED"].map(camel).filter((k) => typeof errs[k] !== "string" || !String(errs[k]).trim());
        if (miss.length) p.push(`${lang}: register.errors ขาด ${miss.join(",")}`);
        if (lang === "th") {
          const notThai = NEW_CODES.map(camel).filter((k) => typeof errs[k] === "string" && !THAI.test(errs[k]));
          if (notThai.length) p.push(`th: ไม่ใช่ไทย ${notThai.join(",")}`);
        }
      }
    }
    const reg = srcOf(F.register);
    if (/regRefuse\(\s*["']MEMBER_RIGHTS_UNSUPPORTED["']/.test(reg)) p.push("register.ts ยังคืน MEMBER_RIGHTS_UNSUPPORTED");
    const qk = /REG_QUOTE_KEYS[^=]*=\s*new\s+Set\(\s*\[([^\]]*)\]/.exec(reg)?.[1] ?? "";
    for (const k of ["couponCode", "memberChoices"]) if (!new RegExp(`["']${k}["']`).test(qk)) p.push(`REG_QUOTE_KEYS ไม่มี ${k}`);
    const helperFile = walk(POS_DIR).find((f) => exportsFn(srcOf(f), "saleWalletCart"));
    if (!helperFile) p.push("ไม่มี export saleWalletCart");
    const svcSrc = srcOf(F.service);
    const cs = svcSrc.slice(svcSrc.indexOf("async function createSaleOnce"), svcSrc.indexOf("async function consumeSaleInventory") > 0 ? svcSrc.indexOf("async function consumeSaleInventory") : undefined);
    if (!/\bsaleWalletCart\s*\(/.test(cs)) p.push("createSale ไม่เรียก saleWalletCart");
    if (!/\bsaleWalletCart\s*\(/.test(reg + srcOf(F.rm))) p.push("ฝั่ง quote (register.ts/register-member.ts) ไม่เรียก saleWalletCart");
    const ci = /export\s+type\s+CreateSaleInput\s*=\s*\{([\s\S]*?)\n\};/.exec(svcSrc)?.[1] ?? "";
    if (!/\bmemberSnapshot\?\s*:/.test(ci)) p.push("CreateSaleInput ไม่มี memberSnapshot?");
    if (!/\bmemberBenefits\b/.test(cs)) p.push("createSale ไม่เขียน memberBenefits");
    if (!/\bmemberSystemId\b/.test(fnBody(reg, "submitRegisterSale"))) p.push("submitRegisterSale ไม่ส่ง memberSystemId (R1)");
    const cons = srcOf(F.consumers);
    const ei = cons.indexOf('"member.erased"');
    const entry = ei >= 0 ? cons.slice(ei, cons.indexOf('"crm.contact.erased"', ei) > ei ? cons.indexOf('"crm.contact.erased"', ei) : ei + 1500) : "";
    const ci2 = entry.indexOf("onMemberErased");
    const pi = entry.search(/modules\/pos|\bpos[A-Z]\w*Erased|memberErased/);
    if (!entry) p.push('outbox-consumers ไม่มี "member.erased"');
    else if (ci2 < 0) p.push("member.erased ไม่มีตัวรับของ CRM แล้ว");
    else if (pi < 0 || pi < ci2) p.push("member.erased ไม่มีส่วน POS ต่อท้ายตัวรับ CRM (R9 Q8)");
    chk("ST5", p.length === 0, "รหัส/คีย์/ข้อความ · ตัวช่วยร่วม · createSale/submit · member.erased", joinP(p));
  }
}

// ═════════════════════════ 1b. --no-db ═════════════════════════
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อ (สถิต · ไม่โหลด prisma)`);
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
  seedOk = !!(await envMod.resolvePosScope(prisma, "coffee"));
} catch (e) {
  console.log(`  (resolvePosScope ล้ม: ${(e as Error).message.slice(0, 120)})`);
}
if (!seedOk) skipReasons.push("ชุดข้อมูล QC POS (ร้านกาแฟ) ยังไม่ถูก seed — รัน scripts/seed-pos-qc.mts ก่อน (ใช้ userId เจ้าของ/แคชเชียร์)");
const dbCols = new Set<string>();
try {
  const rows = (await P.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'PosSale'`)) as Any[];
  for (const r of rows) dbCols.add(String(r.column_name));
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
const COL = { snap: dbCols.has("memberSnapshot"), ben: dbCols.has("memberBenefits") };
if (!COL.snap) skipReasons.push("ฐาน QC4 ยังไม่มี PosSale.memberSnapshot");
if (!COL.ben) skipReasons.push("ฐาน QC4 ยังไม่มี PosSale.memberBenefits");

const COUNT_MODELS = ["posSale", "posDevice", "posShift", "customer", "voucher", "couponRedemption", "pointLedger", "stampEvent", "outboxEvent", "auditLog", "accountJournalEntry"] as const;
async function snapshotCounts(): Promise<Record<string, number | string>> {
  const out: Record<string, number | string> = {};
  for (const tid of TIDS)
    for (const m of COUNT_MODELS) {
      const d = P[m];
      out[`${tid}.${m}`] = typeof d?.count === "function" ? await d.count({ where: { tenantId: tid } }).catch((e: Error) => `err:${e.message.slice(0, 30)}`) : "absent";
    }
  return out;
}
const countsBefore = await snapshotCounts();

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P1.12 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อมูล: seed ${seedOk ? "มี" : "ไม่มี"} · ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length, seed: seedOk })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const ex = (f: string) => existsSync(join(ROOT, f));
const rmMod = ex(F.rm) ? await tryImport("@/lib/modules/pos/register-member") : null;
const regMod = await tryImport("@/lib/modules/pos/register");
const heldMod = await tryImport("@/lib/modules/pos/held-cart");
const svc = await tryImport("@/lib/modules/pos/service");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const rcpMod = await tryImport("@/lib/modules/pos/receipt");
const billsMod = await tryImport("@/lib/modules/pos/bills");
const pubMod = await tryImport("@/lib/modules/pos/public-receipt");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const memMod = await tryImport("@/lib/modules/member");
const tierMod = await tryImport("@/lib/modules/member/tiers");
const pointMod = await tryImport("@/lib/modules/point");
const voucherMod = await tryImport("@/lib/modules/voucher");
const gcMod = await tryImport("@/lib/modules/giftcard");
const stampMod = await tryImport("@/lib/modules/stamp");
const rewardMod = await tryImport("@/lib/modules/reward");
const couponMod = await tryImport("@/lib/modules/coupon/service");
const consMod = await tryImport("@/lib/outbox-consumers");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p1.12-${RAND}`;
const TAGN = `คิวซี${RAND}`; // ชื่อเฉพาะรอบ (ค้นชื่อ · ตามหาในร้าน seed)
const T_SLUG = `posqc-p112-${RAND}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";
const RUN_START = Date.now();

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
async function drain(n = 2): Promise<void> {
  for (let i = 0; i < n; i++) {
    try {
      if (typeof consMod?.drainAll === "function") await consMod.drainAll();
    } catch (e) {
      console.log(`  (drainAll ล้ม: ${(e as Error).message.slice(0, 100)})`);
    }
  }
}

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !STATIC_IDS.includes(id) && id !== "P1.12-Z1");

async function runDb() {
  if (!seedOk) {
    for (const id of DB_IDS) chk(id, false, "seed ร้าน QC POS", "ยังไม่ได้ seed (scripts/seed-pos-qc.mts) — ข้อ DB ตรวจไม่ได้");
    return;
  }
  assertQc4BeforeWrite();
  installFetchGuard();
  // บัตร QR สมาชิก (meCard) ต้องมีความลับ — ตั้งใน process นี้เท่านั้นเมื่อ env ไม่มี (ไม่แตะไฟล์ .env)
  if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = `qc-p112-${RAND}-${Math.random().toString(36).slice(2)}`;
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} · DB ${HOST} ──`);
  console.log("   POS-A ผูกสมุด VAT · สาขา A (สมาชิก+แต้ม+คูปอง+รางวัล) · B (ไม่มีสมาชิก · แต้มระบบที่ 2) · C (สมาชิก+คูปอง ไม่มีแต้ม)");
  let fx = "";
  const notes: string[] = [];
  const S: Record<string, string> = {};
  const U: Record<string, string> = {};
  const ownerId: string = PQC.coffee.users.owner.userId;
  const cashierId: string = PQC.coffee.users.cashier.userId;
  const step = async (label: string, fn: () => unknown): Promise<Any> => {
    try {
      return await fn();
    } catch (e) {
      const m = `${label}: ${String((e as Error)?.message ?? e).slice(0, 140)}`;
      notes.push(m);
      console.log(`  ⚠️  fixture ${m}`);
      return null;
    }
  };
  try {
    const t = await P.tenant.create({ data: { name: `QC P1.12 สมาชิกที่ตะกร้า ${RAND}`, slug: T_SLUG } });
    T = t.id;
    for (const k of ["A", "B", "C"]) U[k] = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขา${k}`, slug: `${T_SLUG}-${k.toLowerCase()}` } })).id;
    S.POSA = (await sysSvc.createSystem(T, "POS", "POS-A (ผูกบัญชี VAT)")).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", "บัญชี QC P1.12")).id;
    S.MEM = (await sysSvc.createSystem(T, "MEMBER", "สมาชิก QC P1.12")).id;
    S.MEM2 = (await sysSvc.createSystem(T, "MEMBER", "สมาชิกระบบที่ 2")).id;
    S.PTS = (await sysSvc.createSystem(T, "POINT", "แต้ม QC P1.12")).id;
    S.PTS2 = (await sysSvc.createSystem(T, "POINT", "แต้มระบบที่ 2")).id;
    S.CPN = (await sysSvc.createSystem(T, "COUPON", "คูปอง QC P1.12")).id;
    S.RW = (await sysSvc.createSystem(T, "REWARD", "รางวัล QC P1.12")).id;
    await accSvc.saveSettings(T, S.ACC, { orgName: "ร้านสมาชิกคิวซี จำกัด", taxId: "0105561177639", vatRegistered: true });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POSA } });
    for (const k of ["A", "B", "C"]) await sysSvc.linkUnit(T, S.POSA, U[k]);
    for (const k of ["A", "C"]) {
      await sysSvc.linkUnit(T, S.MEM, U[k]);
      await sysSvc.linkUnit(T, S.CPN, U[k]);
    }
    await sysSvc.linkUnit(T, S.PTS, U.A);
    await sysSvc.linkUnit(T, S.PTS2, U.B);
    await sysSvc.linkUnit(T, S.RW, U.A);
    await pointMod.setPointSettings({ tenantId: T }, { satangPerPoint: 1000, burnRateSatang: 10, burnMinPoints: 100, burnMaxPct: 50, earnBase: "NET", excludeVoucher: true, excludeGiftCard: true });
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const FXB = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;

  // ─── ผู้กระทำ ───
  const owner = { userId: ownerId, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const staff = { userId: cashierId, role: "STAFF", unitAccess: [U.A, U.B, U.C], permissions: { "pos.sale.create": true } };
  const staffSeller = { userId: cashierId, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.create": true, "pos.sale.priceOverride": true } };
  const noCreate = { userId: cashierId, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.read": true, "member.*": true } };
  const ctxOf = (k: string, deviceId?: string): Any => ({ tenantId: T, systemId: S.POSA, unitId: U[k], ...(deviceId ? { deviceId } : {}) });
  const rctx = (): Any => ({ tenantId: T, systemId: S.POSA });
  const ctxM: Any = { tenantId: T, systemId: S.MEM, actorUserId: ownerId };
  const ctxM2: Any = { tenantId: T, systemId: S.MEM2, actorUserId: ownerId };
  const pctx: Any = { tenantId: T, systemId: S.PTS, memberSystemId: S.MEM, actorUserId: ownerId };
  const vctx: Any = { tenantId: T, systemId: S.MEM, actorUserId: ownerId };
  const gctx: Any = { tenantId: T, systemId: S.MEM, posSystemId: S.POSA, actorUserId: ownerId };
  const customerActor = (cid: string): Any => ({ userId: "", role: "CUSTOMER", unitAccess: [], permissions: {}, customerId: cid });

  // ─── เครื่อง + กะ (สาขา A) ───
  const DEV1 = `qc112${RAND}d1`;
  if (!fx) {
    const rg = await call(devMod, "registerDevice", ctxOf("A"), owner, { name: "เคาน์เตอร์ QC 1", deviceCode: DEV1 });
    if (rg?.ok !== true) console.log(`  ⚠️  registerDevice: ${codeOf(rg)} ${short(rg?.message ?? "", 80)}`);
    const o1 = await call(shiftMod, "openShift", ctxOf("A", DEV1), owner, { deviceId: DEV1, deviceLabel: "เคาน์เตอร์ QC 1", floatSatang: 0 });
    if (o1?.ok !== true) fx = `เปิดกะ: ${codeOf(o1)} ${short(o1?.message ?? "", 80)}`;
  }

  // ─── ระดับ · สมาชิก · แต้ม · ว่อชเชอร์ · คูปอง · สแตมป์ · รางวัล · บัตรของขวัญ ───
  const rnd = (n: number) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, "0");
  const C: Record<string, string> = {};
  const PH: Record<string, string> = { X: "0892145521", Y: `0893${rnd(6)}`, S: `0896${rnd(6)}`, M: `0897${rnd(6)}`, Z: `0898${rnd(6)}`, L: `089-555-${rnd(4)}`, E: `0894${rnd(6)}` };
  const NAME: Record<string, string> = { X: `สมชาย ใจดี ${TAGN}`, Y: `สมหญิง ใจดี ${TAGN}`, S: `สมศักดิ์ ใจดี ${TAGN}`, M: `สมใจ ใจดี ${TAGN}`, Z: `สมพร ใจดี ${TAGN}`, L: `ลุงเลกาซี ${TAGN}`, E: `เอิร์ธ ลบได้ ${TAGN}` };
  let gold: Any = null;
  const V: Record<string, string> = {};
  let card: Any = null;
  let redemptionId = "";
  let gc: Any = null;
  let tokX = "";
  let tokZ = "";
  if (!fx) {
    await step("ระดับ silver", () => tierMod.createTierDef(ctxM, owner, { key: "silver", name: "Silver", color: "SLATE", isDefault: true, legacyTier: "SILVER" }));
    gold = await step("ระดับ gold", () => tierMod.createTierDef(ctxM, owner, { key: "gold", name: "Gold", color: "AMBER", legacyTier: "GOLD" }));
    if (gold) await step("สิทธิ์ gold 5% cap ฿100", () => tierMod.setBenefits(ctxM, owner, gold.id, [{ type: "DISCOUNT_PCT", config: { pct: 5, maxSatang: 10_000 } }]));
    for (const k of ["X", "Y", "S", "M", "L", "E"]) {
      const r = await step(`สมาชิก ${k}`, () => memMod.createMember(ctxM, owner, { phone: PH[k], name: NAME[k], source: "WALK_IN", homeUnitId: U.A }));
      if (r?.customerId) C[k] = String(r.customerId);
    }
    const rz = await step("สมาชิก Z (ระบบที่ 2)", () => memMod.createMember(ctxM2, owner, { phone: PH.Z, name: NAME.Z, source: "WALK_IN" }));
    if (rz?.customerId) C.Z = String(rz.customerId);
    if (C.X && gold) await step("X → Gold", () => tierMod.applyTierChange(ctxM, C.X, gold.id, "MANUAL", { qc: TAG }, { byUserId: ownerId }));
    if (C.S) await step("S ระงับ", () => memMod.setStatus(ctxM, owner, C.S, "SUSPENDED", "QC P1.12"));
    if (C.X && C.M) await step("M รวมเข้า X", () => memMod.mergeMembers(ctxM, owner, { keepId: C.X, mergeId: C.M, confirm: "MERGE" }));
    const give = (cid: string, pts: number, k: string, sys = pctx) => pointMod.earnWithLot(sys, { customerId: cid, points: pts, refType: "QC", refId: `${TAG}-${k}`, idempotencyKey: `${TAG}-${k}` });
    if (C.X) await step("แต้ม X 1,340", () => give(C.X, 1340, "px0"));
    if (C.Y) await step("แต้ม Y 600", () => give(C.Y, 600, "py0"));
    const rwCtx = await step("ctx รางวัล", () => rewardMod.resolveRewardCtx(T, S.MEM, ownerId));
    const rw = rwCtx ? await step("ของรางวัล", () => rewardMod.createRewardV2(rwCtx, owner, { name: `หมวก ${TAGN}`, kind: "ITEM", pointsCost: 100, stock: 5, tierDefIds: [], unitIds: [], pickupDays: 14, showToCustomer: true })) : null;
    const rdm = rw && C.X ? await step("แลกรางวัล (−100 แต้ม)", () => rewardMod.redeemV2(rwCtx, owner, { rewardId: rw.id, customerId: C.X, unitId: U.A, idempotencyKey: `${TAG}-rd` })) : null;
    redemptionId = String(rdm?.redemptionId ?? "");
    const T30 = await step("แม่แบบ ฿30 ห้ามซ้อน", () => voucherMod.createTemplate(vctx, owner, { name: `ลด ฿30 ${TAGN}`, kind: "FIXED", value: 3000, config: { stackWithCoupon: false, unitIds: [] }, validDays: 30, origin: "MANUAL" }));
    const T30S = await step("แม่แบบ ฿30 ซ้อนคูปองได้", () => voucherMod.createTemplate(vctx, owner, { name: `ลด ฿30 ซ้อนได้ ${TAGN}`, kind: "FIXED", value: 3000, config: { stackWithCoupon: true, unitIds: [] }, validDays: 30, origin: "MANUAL" }));
    const issue1 = async (k: string, tpl: Any, cid: string | undefined) => {
      if (!tpl || !cid) return;
      const r = await step(`ว่อชเชอร์ ${k}`, () => voucherMod.issue(vctx, owner, { customerIds: [cid], templateId: tpl.id, origin: "MANUAL" }));
      const id = r?.vouchers?.[0]?.id;
      if (id) V[k] = String(id);
    };
    for (const k of ["x1", "xns", "xexp", "lim2", "race"]) await issue1(k, T30, C.X);
    await issue1("y", T30, C.Y);
    for (const k of ["xst", "bx", "bf", "bpr", "bvr"]) await issue1(k, T30S, C.X);
    if (V.xexp) await step("ว่อชเชอร์หมดอายุ", () => P.voucher.update({ where: { id: V.xexp }, data: { expiresAt: new Date(Date.now() - 3_600_000) } }));
    await step("คูปอง WELCOME50", () => couponMod.createCoupon({ tenantId: T, systemId: S.CPN, code: "WELCOME50", name: "ต้อนรับ ฿50", type: "FIXED", valueSatang: 5000 }));
    await step("คูปอง PCT10", () => couponMod.createCoupon({ tenantId: T, systemId: S.CPN, code: "PCT10", name: "ลด 10%", type: "PERCENT", percent: 10, maxDiscountSatang: 10_000 }));
    card = T30S
      ? await step("การ์ดสะสมดวง", () => stampMod.createCard({ tenantId: T, systemId: S.MEM, actorUserId: ownerId }, owner, { name: `สะสมดวง ${TAGN}`, slots: 10, ruleKind: "PER_SALE_MIN", ruleConfig: { minSatang: 60_000, perDayMax: 20, allowAutoFromSale: true }, rewardKind: "VOUCHER", rewardConfig: { templateId: T30S.id }, autoRestart: true, tierDefIds: [], unitIds: [] }))
      : null;
    await step("บัตรของขวัญ เปิดใช้", () => gcMod.setSettings(gctx, owner, { enabled: true, accountingLink: false }));
    gc = C.X ? await step("บัตรของขวัญของ X", () => gcMod.sell(gctx, owner, { satang: 50_000, payMethods: [{ type: "CASH", amountSatang: 50_000 }], unitId: U.A, buyerCustomerId: C.X, recipient: { customerId: C.X }, idempotencyKey: `${TAG}-gc` })) : null;
    if (C.X) tokX = String((await step("บัตร QR X", () => memMod.meCard(ctxM, customerActor(C.X), C.X)))?.qr?.content ?? "");
    if (C.Z) tokZ = String((await step("บัตร QR Z", () => memMod.meCard(ctxM2, customerActor(C.Z), C.Z)))?.qr?.content ?? "");
    await drain();
  }
  const X = C.X ?? "";
  const Y = C.Y ?? "";
  console.log(`   สมาชิก ${Object.keys(C).join(",")} · ว่อชเชอร์ ${Object.keys(V).length} · การ์ด ${card ? "มี" : "ไม่มี"} · รางวัลรอรับ ${redemptionId ? "มี" : "ไม่มี"} · บัตรของขวัญ ${gc?.number ? "มี" : "ไม่มี"} · QR ${tokX ? "มี" : "ไม่มี"}`);

  // ─── ตัวช่วยของบิล ───
  type L3 = [string, number, number];
  type CartIn = { lines: L3[]; memberId?: string; couponCode?: string; memberChoices?: Any; billDiscount?: Any };
  const cartOf = (c: CartIn): Any => ({
    lines: c.lines.map(([name, qty, unitPriceSatang]) => ({ name, qty, unitPriceSatang })),
    ...(c.memberId ? { memberId: c.memberId } : {}),
    ...(c.couponCode !== undefined ? { couponCode: c.couponCode } : {}),
    ...(c.memberChoices !== undefined ? { memberChoices: c.memberChoices } : {}),
    ...(c.billDiscount ? { billDiscount: c.billDiscount } : {}),
  });
  let keyN = 0;
  const newKey = (p: string) => `q112${RAND}-${p}-${++keyN}`.replace(/[^A-Za-z0-9_-]/g, "");
  const qraw = (unit: string, obj: Any, actor: Any = owner) => call(regMod, "quoteRegisterCart", ctxOf(unit), actor, obj);
  const quote = (unit: string, c: CartIn, actor: Any = owner) => qraw(unit, cartOf(c), actor);
  const submitRaw = async (unit: string, base: Any, expected: number, actor: Any = owner, extra: Any = {}) => {
    const key = newKey("s");
    const input = { ...base, idempotencyKey: key, expectedGrandTotalSatang: expected, payMethods: expected > 0 ? [{ type: "CASH", amountSatang: expected }] : [], ...(expected > 0 ? { cashReceivedSatang: expected } : {}), ...extra };
    const r = await call(regMod, "submitRegisterSale", ctxOf(unit, unit === "A" ? DEV1 : undefined), actor, input);
    return { r, key };
  };
  const submit = (unit: string, c: CartIn, expected: number, actor: Any = owner) => submitRaw(unit, cartOf(c), expected, actor);
  const saleByKey = async (key: string): Promise<Any> => P.posSale.findFirst({ where: { tenantId: T, idempotencyKey: `reg2:${key}` } }).catch(() => null);
  const snapOf = async (id: string): Promise<{ s: Any; b: Any }> => {
    if (!id || !COL.snap || !COL.ben) return { s: undefined, b: undefined };
    const r = (await P.$queryRawUnsafe(`SELECT "memberSnapshot" AS s, "memberBenefits" AS b FROM "PosSale" WHERE id = $1`, id).catch(() => [])) as Any[];
    return { s: r[0]?.s ?? null, b: r[0]?.b ?? null };
  };
  type Bill = { k: string; id: string; key: string; q: Any; r: Any; err: string; snap0: Any; ben0: Any };
  const B: Record<string, Bill> = {};
  const memberQuoteCodes: string[] = [];
  const sale = async (k: string, unit: string, c: CartIn, actor: Any = owner): Promise<Bill> => {
    let err = "";
    let id = "";
    let key = "";
    let r: Any = null;
    let q: Any = null;
    if (fx) err = "fixture";
    else {
      q = await quote(unit, c, actor);
      if (c.memberId) memberQuoteCodes.push(codeOf(q));
      if (q?.ok !== true) err = `quote ${codeOf(q)} ${short(q?.message ?? "", 80)}`;
      else {
        const s = await submit(unit, c, Number(q.grandTotalSatang), actor);
        r = s.r;
        key = s.key;
        if (r?.ok !== true) err = `submit ${codeOf(r)} ${short(r?.message ?? "", 80)}`;
        else id = String(r.saleId);
      }
    }
    if (err) console.log(`  ⚠️  บิล ${k}: ${err}`);
    const sn = await snapOf(id);
    const b: Bill = { k, id, key, q, r, err, snap0: sn.s, ben0: sn.b };
    B[k] = b;
    return b;
  };
  const NB = (b: Bill | undefined) => (b && b.id ? "" : `ไม่มีบิล ${b?.k ?? "?"} (${b?.err ?? "ไม่ได้สร้าง"}) · `);
  const NCOL = COL.snap && COL.ben ? "" : "ฐาน QC4 ยังไม่มีคอลัมน์ memberSnapshot/memberBenefits · ";
  const NBJ = (pre: string, p: string[]) => (pre ? pre.replace(/ · $/, "") + (p.length ? ` · ${joinP(p)}` : "") : joinP(p));
  const row = async (id: string): Promise<Any> => (id ? P.posSale.findUnique({ where: { id } }).catch(() => null) : null);
  const ledger = async (refId: string): Promise<Any[]> => (refId ? ((await P.pointLedger.findMany({ where: { tenantId: T, refType: "PosSale", refId }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]) : []);
  const sumDelta = (ls: Any[]) => sum(ls.map((l) => Number(l.delta)));
  const bal = async (cid: string, sys = S.PTS): Promise<number> => (cid && typeof pointMod?.getBalance === "function" ? Number(await pointMod.getBalance(sys, cid).catch(() => NaN)) : NaN);
  const vrow = async (id: string | undefined): Promise<Any> => (id ? P.voucher.findUnique({ where: { id } }).catch(() => null) : null);
  const adds = async (saleId: string): Promise<Any[]> => (saleId ? ((await P.stampEvent.findMany({ where: { tenantId: T, type: "ADD", refType: "SALE", refId: saleId } }).catch(() => [])) as Any[]) : []);
  const voidsOf = async (ids: string[]): Promise<number> => (ids.length ? Number(await P.stampEvent.count({ where: { tenantId: T, type: "VOID", refId: { in: ids } } }).catch(() => -1)) : 0);
  const reds = async (saleId: string): Promise<Any[]> => (saleId ? ((await P.couponRedemption.findMany({ where: { tenantId: T, OR: [{ saleId }, { refType: "PosSale", refId: saleId }] } }).catch(() => [])) as Any[]) : []);
  const spent = async (cid: string): Promise<number> => Number((await P.customer.findUnique({ where: { id: cid || "-" }, select: { totalSpentSatang: true } }).catch(() => null))?.totalSpentSatang ?? NaN);
  const stampsNow = async (cid: string): Promise<number> => (card ? sum(((await P.stampCardProgress.findMany({ where: { cardId: card.id, customerId: cid } }).catch(() => [])) as Any[]).map((p) => Number(p.stamps))) : NaN);
  const events = async (type: string, pred: (p: Any) => boolean): Promise<Any[]> => ((await P.outboxEvent.findMany({ where: { tenantId: T, type } }).catch(() => [])) as Any[]).filter((e) => pred(e.payload ?? {}));
  const audits = async (action: string, pred: (a: Any) => boolean = () => true): Promise<Any[]> => ((await P.auditLog.findMany({ where: { tenantId: T, action }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]).filter(pred);
  const replay = async (type: string, pred: (p: Any) => boolean, times = 2): Promise<string[]> => {
    const errs: string[] = [];
    const evs = await events(type, pred);
    const h = consMod?.consumers?.[type];
    if (!evs.length) errs.push(`ไม่พบ event ${type}`);
    else if (typeof h !== "function") errs.push(`ไม่มี consumers[${type}]`);
    else
      for (const ev of evs)
        for (let i = 0; i < times; i++)
          try {
            await h(ev);
          } catch (e) {
            errs.push(`${type} ×${i + 1} throw ${(e as Error).message.slice(0, 60)}`);
          }
    return errs;
  };
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
  const conflictCodes = (q: Any): string[] => (Array.isArray(q?.memberConflicts) ? q.memberConflicts.map((c: Any) => String(c?.code)) : []);
  const linesOfBen = (b: Any): Any[] => (Array.isArray(b?.lines) ? b.lines : []);
  const kindAmt = (xs: Any[]): string => short(xs.map((l: Any) => `${l?.kind}:${l?.discountSatang}`).sort(), 400);
  const custCount = async () => Number(await P.customer.count({ where: { tenantId: T } }).catch(() => -1));
  const lookup = (q: string, actor: Any = owner, unit = "A") => call(rmMod, "registerMemberLookup", ctxOf(unit), actor, { q });
  const benefits = (memberId: string, c: CartIn, actor: Any = owner, unit = "A") => call(rmMod, "registerMemberBenefits", ctxOf(unit), actor, { memberId, cart: cartOf(c) });
  const quick = (input: Any, actor: Any = owner, unit = "A") => call(rmMod, "registerQuickMember", ctxOf(unit), actor, input);
  const fulfil = (memberId: string, rid: string, actor: Any = owner, unit = "A") => call(rmMod, "registerFulfilReward", ctxOf(unit), actor, { memberId, redemptionId: rid });
  const ids = (r: Any): string[] => (Array.isArray(r?.items) ? r.items.map((i: Any) => String(i?.id)) : []);
  const NRM = rmMod && SVC_FNS.every((n) => typeof rmMod[n] === "function") ? "" : `${MISSING} register-member.ts · `;
  const L500: L3[] = [["เสื้อ P112", 1, 30_000], ["หมวก P112", 1, 20_000]];
  const cX = (extra: Partial<CartIn> = {}): CartIn => ({ lines: [["ของ B P112", 1, 10_000]], memberId: X, ...extra });

  // ════════ B ตัวแกะ/ตรวจรูป ════════
  {
    const p: string[] = [];
    const ok1 = await quote("A", cX({ couponCode: "WELCOME50" }));
    if (ok1?.ok !== true) p.push(`couponCode → ${codeOf(ok1)} ${short(ok1?.message ?? "", 60)}`);
    const ok2 = await quote("A", cX({ memberChoices: { voucherId: V.x1, points: 0 } }));
    if (ok2?.ok !== true) p.push(`memberChoices {voucherId, points} → ${codeOf(ok2)} ${short(ok2?.message ?? "", 60)}`);
    const bads: [string, Any][] = [
      ["couponCode 123", { ...cartOf(cX()), couponCode: 123 }],
      ["memberChoices คีย์แปลก", { ...cartOf(cX()), memberChoices: { foo: 1 } }],
      ["memberChoices.voucherIds (รูปเดิม)", { ...cartOf(cX()), memberChoices: { voucherIds: [V.x1 ?? "v"] } }],
      ["memberChoices สตริง", { ...cartOf(cX()), memberChoices: "x" }],
      ["voucherId ตัวเลข", { ...cartOf(cX()), memberChoices: { voucherId: 5 } }],
    ];
    for (const [lbl, x] of bads) {
      const r = await qraw("A", x);
      if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    chk("B1", p.length === 0, "คีย์ใหม่ผ่าน · ผิดรูป 5 แบบ VALIDATION", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const gcBal = async () => (gc?.number ? Number((await gcMod.balance(gctx, { number: gc.number }).catch(() => null))?.balanceSatang ?? NaN) : NaN);
    const b0 = await gcBal();
    const choice = { giftCard: { number: gc?.number ?? "0000", pin: gc?.pin ?? "0000", satang: 1000 } };
    const r1 = await quote("A", cX({ memberChoices: choice }));
    if (!refused(r1, "VALIDATION")) p.push(`quote giftCard → ${codeOf(r1)}`);
    const s1 = await submit("A", cX({ memberChoices: choice }), 9000);
    if (!refused(s1.r, "VALIDATION")) p.push(`submit giftCard → ${codeOf(s1.r)}`);
    if (await saleByKey(s1.key)) p.push("มีบิลของคีย์ที่ถูกปฏิเสธ");
    if (!gc?.number) p.push("(ฟิกซ์เจอร์) ไม่มีบัตรของขวัญ");
    else if ((await gcBal()) !== b0) p.push("ยอดบัตรของขวัญเปลี่ยน");
    chk("B2", p.length === 0, "giftCard → VALIDATION · ไม่มีบิล", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    for (const v of [1.5, -1, "100", true]) {
      const r = await quote("A", cX({ memberChoices: { points: v } }));
      if (!refused(r, "VALIDATION")) p.push(`points ${short(v, 10)} → ${codeOf(r)}${r?.threw ? " (throw)" : ""}`);
    }
    chk("B3", p.length === 0, "points ผิดชนิด 4 แบบ VALIDATION", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const walk1: CartIn = { lines: [["ของ B4 P112", 1, 10_000]] };
    for (const [lbl, extra] of [["memberSnapshot", { memberSnapshot: { name: "ปลอม", memberCode: "X", phoneMasked: "000-xxx-0000", tierKey: null, tierName: null } }], ["memberBenefits", { memberBenefits: { lines: [], pointsBurned: 0 } }]] as const) {
      const s = await submitRaw("A", cartOf(walk1), 10_000, owner, extra);
      if (!refused(s.r, "VALIDATION")) p.push(`${lbl} → ${codeOf(s.r)}`);
      if (await saleByKey(s.key)) p.push(`${lbl}: มีบิล`);
    }
    chk("B4", p.length === 0, "สำเนาจาก client → VALIDATION · ไม่มีบิล", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const c0 = await custCount();
    const base = { phone: `0862${rnd(6)}`, name: `บีห้า ${RAND}`, marketingConsent: true, heardFrom: "WALK_IN", idempotencyKey: newKey("qb") };
    const noKey: Any = { ...base };
    delete noKey.idempotencyKey;
    const bads: [string, Any][] = [
      ["คีย์แปลก", { ...base, foo: 1 }],
      ["ไม่มี idempotencyKey", noKey],
      ["heardFrom TIKTOK", { ...base, heardFrom: "TIKTOK" }],
      ["birthDate 20/05/1992", { ...base, birthDate: "20/05/1992" }],
      ["name ว่าง", { ...base, name: "" }],
      ["name 81", { ...base, name: "ก".repeat(81) }],
      ["marketingConsent สตริง", { ...base, marketingConsent: "yes" }],
    ];
    for (const [lbl, x] of bads) {
      const r = await quick(x);
      if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    if ((await custCount()) !== c0) p.push("มี Customer เพิ่ม");
    chk("B5", NRM === "" && p.length === 0, "7 แบบ VALIDATION · ไม่มีสมาชิกเพิ่ม", FXB(NRM + joinP(p)));
  }
  {
    const p: string[] = [];
    const hctx = ctxOf("A", DEV1);
    const h1 = await call(heldMod, "holdRegisterCart", hctx, owner, { cart: cartOf(cX({ couponCode: "WELCOME50" })), label: `QC ${RAND}` });
    const hid = String(h1?.heldCart?.id ?? "");
    if (h1?.ok !== true || !hid) p.push(`พัก memberId+couponCode → ${codeOf(h1)} ${short(h1?.message ?? "", 60)}`);
    else {
      const rc = await call(heldMod, "recallHeldCart", hctx, owner, { id: hid });
      if (rc?.ok !== true || rc.cart?.memberId !== X || rc.cart?.couponCode !== "WELCOME50") p.push(`เรียกคืน → ${codeOf(rc)} memberId ${short(rc?.cart?.memberId, 30)} couponCode ${short(rc?.cart?.couponCode, 20)}`);
    }
    const h2 = await call(heldMod, "holdRegisterCart", hctx, owner, { cart: cartOf(cX({ couponCode: "WELCOME50", memberChoices: { points: 200 } })), label: `QC2 ${RAND}` });
    if (h2?.ok === true) {
      const rc2 = await call(heldMod, "recallHeldCart", hctx, owner, { id: String(h2.heldCart?.id ?? "") });
      if (rc2?.ok !== true) p.push(`เรียกคืน (พร้อมสิทธิ์) → ${codeOf(rc2)}`);
      else if (rc2.cart && "memberChoices" in rc2.cart) p.push("บิลพักเก็บ memberChoices (CD4 ห้าม)");
      else if (rc2.cart?.couponCode !== "WELCOME50") p.push("บิลพัก (พร้อมสิทธิ์) ทิ้ง couponCode");
    } else if (!refused(h2, "VALIDATION")) p.push(`พักพร้อมสิทธิ์ → ${codeOf(h2)}`);
    const cc = await call(regMod, "registerCanonicalCart", cartOf(cX({ couponCode: "WELCOME50" })));
    if (cc?.couponCode !== "WELCOME50" || cc?.memberId !== X) p.push(`registerCanonicalCart → ${short(cc, 100)}`);
    chk("B6", p.length === 0, "memberId + couponCode ไปกลับ · ไม่เก็บสิทธิ์", FXB(joinP(p)));
  }

  // ════════ M สมาชิก ════════
  const xCode = X ? String((await P.customer.findUnique({ where: { id: X }, select: { memberCode: true } }).catch(() => null))?.memberCode ?? "") : "";
  const lDigits = PH.L.replace(/\D/g, "");
  {
    const p: string[] = [];
    const r1 = await lookup("0892145");
    const r2 = await lookup("089-214-5521");
    const r3 = await lookup(lDigits);
    const r4 = await lookup("08");
    if (!ids(r1).includes(X)) p.push(`"0892145" → ${codeOf(r1)} ${ids(r1).length} รายการ ไม่มี X`);
    if (!ids(r2).includes(X)) p.push(`"089-214-5521" → ${codeOf(r2)} ไม่มี X`);
    if (!C.L || !ids(r3).includes(C.L)) p.push(`เบอร์เก่ามีขีด ค้น "${lDigits}" → ${codeOf(r3)} ไม่มี L (มติ Q4)`);
    for (const [lbl, r] of [["r1", r1], ["r2", r2], ["r3", r3]] as const) {
      const items: Any[] = Array.isArray(r?.items) ? r.items : [];
      if (items.length > 8) p.push(`${lbl} ${items.length} รายการ (> 8)`);
      for (const it of items) {
        const ks = Object.keys(it ?? {}).sort();
        if (short(ks) !== short([...ITEM_KEYS].sort())) {
          p.push(`${lbl} คีย์ DTO ${short(ks, 120)}`);
          break;
        }
      }
    }
    const xi = (Array.isArray(r1?.items) ? r1.items : []).find((i: Any) => i?.id === X);
    if (xi) {
      if (xi.phoneMasked !== "089-xxx-5521") p.push(`phoneMasked ${short(xi.phoneMasked, 20)}`);
      if (xi.tier?.key !== "gold" || xi.tier?.name !== "Gold" || typeof xi.tier?.color !== "string") p.push(`tier ${short(xi.tier, 60)}`);
      if (xi.points !== (await bal(X))) p.push(`points ${xi.points} (คาด ${await bal(X)})`);
      if (xi.suspended !== false) p.push(`suspended ${xi.suspended}`);
    }
    if ([r1, r2, r3].some((r) => short(r, 100_000).includes("0892145521"))) p.push("มีเบอร์เต็มในผลค้น (CD8)");
    if (!(r4?.ok === true && Array.isArray(r4.items) && r4.items.length === 0)) p.push(`"08" → ${codeOf(r4)} ${short(r4?.items, 40)} (คาด items [])`);
    chk("M1", NRM === "" && p.length === 0, "เบอร์ (ต้น/ขีด/เก่า) · DTO · ปิดเบอร์ · สั้น = []", FXB(NRM + joinP(p)));
  }
  {
    const p: string[] = [];
    const r = await lookup(TAGN);
    const got = ids(r);
    for (const k of ["X", "Y", "S", "L", "E"]) if (!C[k] || !got.includes(C[k])) p.push(`ไม่เจอ ${k}`);
    for (const k of ["M", "Z"]) if (C[k] && got.includes(C[k])) p.push(`เจอ ${k} (${k === "M" ? "MERGED" : "ระบบอื่น"})`);
    if (got.length) {
      const rows = (await P.customer.findMany({ where: { id: { in: got } }, select: { id: true, lastActivityAt: true } }).catch(() => [])) as Any[];
      const at = new Map(rows.map((x) => [x.id, x.lastActivityAt ? new Date(x.lastActivityAt).getTime() : -1]));
      const seq = got.map((i) => at.get(i) ?? -1);
      if (seq.some((v, i) => i > 0 && v > seq[i - 1]!)) p.push(`ลำดับไม่ใช่ lastActivityAt ใหม่ก่อน ${short(seq, 80)}`);
    }
    const rc = xCode ? await lookup(xCode) : null;
    if (!xCode) p.push("(ฟิกซ์เจอร์) X ไม่มี memberCode");
    else if (short(ids(rc)) !== short([X])) p.push(`รหัส ${xCode} → ${codeOf(rc)} ${short(ids(rc), 80)} (คาด [X])`);
    const r1 = await lookup("ก");
    if (!(r1?.ok === true && Array.isArray(r1.items) && r1.items.length === 0)) p.push(`ชื่อ 1 ตัว → ${codeOf(r1)}`);
    chk("M2", NRM === "" && p.length === 0, "ชื่อ/รหัส · ไม่มี MERGED/ระบบอื่น · เรียงล่าสุดก่อน", FXB(NRM + joinP(p)));
  }
  {
    const p: string[] = [];
    if (!tokX.startsWith("SHARK-MC:")) p.push(`(ฟิกซ์เจอร์) token X ${short(tokX, 30)}`);
    const r1 = await lookup(tokX);
    if (short(ids(r1)) !== short([X])) p.push(`token X → ${codeOf(r1)} ${short(ids(r1), 60)}`);
    const r2 = await lookup(tokZ || "SHARK-MC:none");
    if (!(r2?.ok === true && ids(r2).length === 0)) p.push(`token Z → ${codeOf(r2)} ${short(ids(r2), 60)} (คาด [])`);
    const r3 = await lookup(`SHARK-MC:zz${RAND}zz`);
    if (!(r3?.ok === true && ids(r3).length === 0)) p.push(`token มั่ว → ${codeOf(r3)}`);
    chk("M3", NRM === "" && p.length === 0, "QR ของ X = [X] · ระบบอื่น/มั่ว = []", FXB(NRM + joinP(p)));
  }
  {
    const p: string[] = [];
    const other = String((await P.customer.findFirst({ where: { tenantId: TIDS[0] }, select: { id: true } }).catch(() => null))?.id ?? "");
    const cases: [string, string][] = [["Z ระบบอื่น", C.Z ?? ""], ["ร้านอื่น", other], ["M ที่ถูกรวม", C.M ?? ""], ["id มั่ว", `c${RAND}nonexistent0000`]];
    const msgs = new Set<string>();
    for (const [lbl, id] of cases) {
      if (!id) {
        p.push(`(ฟิกซ์เจอร์) ไม่มี ${lbl}`);
        continue;
      }
      const q = await quote("A", cX({ memberId: id }));
      if (!refused(q, "MEMBER_NOT_FOUND")) p.push(`quote ${lbl} → ${codeOf(q)}`);
      else msgs.add(String(q.message));
      const b = await benefits(id, cX());
      if (!refused(b, "MEMBER_NOT_FOUND")) p.push(`benefits ${lbl} → ${codeOf(b)}`);
      else msgs.add(String(b.message));
    }
    if (msgs.size > 1) p.push(`ข้อความต่างกัน ${msgs.size} แบบ (ห้ามบอกว่ามีอยู่จริง)`);
    chk("M4", p.length === 0, "MEMBER_NOT_FOUND ข้อความเดียว ทุกกรณี", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const sId = C.S ?? "";
    const q = await quote("A", cX({ memberId: sId }));
    if (!refused(q, "MEMBER_SUSPENDED")) p.push(`quote → ${codeOf(q)}`);
    const b = await benefits(sId, cX());
    if (!refused(b, "MEMBER_SUSPENDED")) p.push(`benefits → ${codeOf(b)}`);
    const s = await submit("A", cX({ memberId: sId }), 10_000);
    if (!refused(s.r, "MEMBER_SUSPENDED")) p.push(`submit → ${codeOf(s.r)}`);
    if (await saleByKey(s.key)) p.push("มีบิล");
    const l = await lookup(TAGN);
    const si = (Array.isArray(l?.items) ? l.items : []).find((i: Any) => i?.id === sId);
    if (!si || si.suspended !== true) p.push(`ค้นแล้ว S ${si ? `suspended ${si.suspended}` : "ไม่ขึ้น"}`);
    chk("M5", p.length === 0, "MEMBER_SUSPENDED ×3 · ค้นขึ้น suspended:true", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const rs: [string, Any][] = [
      ["lookup", await lookup(TAGN, owner, "B")],
      ["quick", await quick({ phone: `0863${rnd(6)}`, name: `บี ${RAND}`, marketingConsent: false, heardFrom: "WALK_IN", idempotencyKey: newKey("qB") }, owner, "B")],
      ["benefits", await benefits(X, cX(), owner, "B")],
      ["fulfil", await fulfil(X, redemptionId || "r", owner, "B")],
      ["quote+memberId", await quote("B", cX())],
    ];
    for (const [lbl, r] of rs) if (!refused(r, "MEMBER_SYSTEM_MISSING")) p.push(`${lbl} → ${codeOf(r)}`);
    chk("M6", p.length === 0, "สาขาไม่มีระบบสมาชิก = MEMBER_SYSTEM_MISSING ×5", FXB(joinP(p)));
  }
  // ════════ U1 สถานะจอขาย: สาขามีระบบสมาชิกไหม (ORACLE-EDIT · P1.12U มติ 2) ════════
  {
    const p: string[] = [];
    const sa = await call(regMod, "registerStatus", ctxOf("A"), owner);
    const sb = await call(regMod, "registerStatus", ctxOf("B"), owner);
    if (sa?.ok !== true) p.push(`สาขา A ${codeOf(sa)} ${short(sa?.message ?? "", 60)}`);
    else if (sa.memberEnabled !== true) p.push(`สาขา A memberEnabled ${short(sa.memberEnabled, 20)} (คาด true)`);
    if (sb?.ok !== true) p.push(`สาขา B ${codeOf(sb)} ${short(sb?.message ?? "", 60)}`);
    else if (sb.memberEnabled !== false) p.push(`สาขา B memberEnabled ${short(sb.memberEnabled, 20)} (คาด false)`);
    chk("U1", p.length === 0, "สาขา A true · สาขา B false", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const c0 = await custCount();
    const posMemberAudits = async () => Number(await P.auditLog.count({ where: { tenantId: T, action: { startsWith: "pos.member." } } }).catch(() => -1));
    const n0 = await posMemberAudits();
    const rs: [string, Any][] = [
      ["lookup", await lookup(TAGN, noCreate)],
      ["quick", await quick({ phone: `0864${rnd(6)}`, name: `เอ็มแปด ${RAND}`, marketingConsent: false, heardFrom: "WALK_IN", idempotencyKey: newKey("q8") }, noCreate)],
      ["benefits", await benefits(X, cX(), noCreate)],
      ["fulfil", await fulfil(X, redemptionId || "r", noCreate)],
      ["quote", await quote("A", cX(), noCreate)],
    ];
    for (const [lbl, r] of rs) if (!refused(r, "PERMISSION_DENIED")) p.push(`${lbl} → ${codeOf(r)}`);
    const n1 = await posMemberAudits();
    if ((await custCount()) !== c0 || n1 !== n0) p.push("มีแถวถูกเขียน");
    chk("M8", p.length === 0, "ไม่มี pos.sale.create = PERMISSION_DENIED ×5 · ไม่เขียน", FXB(joinP(p)));
  }
  // M7 + M9 + M10 — พนักงาน (pos.sale.create อย่างเดียว) ผ่านผู้กระทำแทน
  const QPH = `0861${rnd(6)}`;
  const QPH_TYPED = `${QPH.slice(0, 3)}-${QPH.slice(3, 6)}-${QPH.slice(6)}`;
  const QKEY = newKey("qr");
  const qInput = { phone: QPH_TYPED, name: `คิวอาร์ ${RAND}x`, birthDate: "1992-05-20", marketingConsent: true, heardFrom: "WALK_IN", idempotencyKey: QKEY };
  let qId = "";
  {
    const p: string[] = [];
    const l = await lookup(TAGN, staff);
    if (!ids(l).includes(X)) p.push(`lookup (STAFF) → ${codeOf(l)}`);
    const counts = async () =>
      short([await custCount(), ...(await Promise.all(["voucher", "pointLedger", "stampEvent", "rewardRedemption", "auditLog"].map((m) => P[m].count({ where: { tenantId: T } }).catch(() => -1))))]);
    await drain();
    const before = await counts();
    const b = await benefits(X, { lines: L500 }, staff);
    if ((await counts()) !== before) p.push("benefits เขียนแถว (ต้องอ่านอย่างเดียว)");
    if (b?.ok !== true) p.push(`benefits (STAFF) → ${codeOf(b)} ${short(b?.message ?? "", 60)}`);
    else {
      const ks = Object.keys(b).sort();
      const want = ["ok", "member", "tier", "points", "vouchers", "stamps", "giftCards", "rewardsPending"].sort();
      if (short(ks) !== short(want)) p.push(`คีย์ผล ${short(ks, 120)}`);
      if (b.member?.id !== X) p.push("member.id ≠ X");
      if (b.tier?.name !== "Gold" || b.tier?.discountPct !== 5 || b.tier?.discountFixedSatang !== 0 || b.tier?.discountMaxSatang !== 10_000) p.push(`tier ${short(b.tier, 100)}`);
      const v1 = (Array.isArray(b.vouchers) ? b.vouchers : []).find((v: Any) => v?.id === V.x1);
      if (!v1 || v1.applicable !== true || v1.discountSatang !== 3000 || v1.reason !== null || typeof v1.valueLabel !== "string") p.push(`ว่อชเชอร์ x1 ${short(v1, 120)}`);
      const ve = (Array.isArray(b.vouchers) ? b.vouchers : []).find((v: Any) => v?.id === V.xexp);
      if (ve && (ve.applicable !== false || typeof ve.reason !== "string")) p.push(`ว่อชเชอร์หมดอายุ ${short(ve, 80)}`);
      const gcs: Any[] = Array.isArray(b.giftCards) ? b.giftCards : [];
      if (!gcs.length) p.push("giftCards ว่าง (มีบัตรของ X)");
      for (const g of gcs) {
        if (short(Object.keys(g).sort()) !== short(["balanceSatang", "expiresAt", "numberMasked"])) p.push(`giftCards คีย์ ${short(Object.keys(g), 80)} (อ่านอย่างเดียว · มติ Q1)`);
        if (gc?.number && short(g).includes(String(gc.number))) p.push("giftCards มีเลขบัตรเต็ม");
      }
      if (gc?.pin && short(b, 100_000).includes(`"${gc.pin}"`)) p.push("ผลมี PIN");
      if (!(Array.isArray(b.stamps) && b.stamps.some((s: Any) => s?.cardId === card?.id && typeof s.slots === "number"))) p.push(`stamps ${short(b.stamps, 80)}`);
    }
    const r = await quick(qInput, staff);
    if (r?.ok !== true) p.push(`quick register (STAFF) → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else qId = String(r.member?.id ?? "");
    chk("M7", NRM === "" && p.length === 0, "STAFF ไม่มี member.* ค้น/ดูสิทธิ์ (อ่านอย่างเดียว · DTO R5)/สมัครได้", FXB(NRM + joinP(p)));
  }
  {
    const p: string[] = [];
    const cu = qId ? await P.customer.findUnique({ where: { id: qId } }).catch(() => null) : null;
    if (!cu) p.push("ไม่มี Customer ที่สมัคร");
    else {
      if (cu.memberSystemId !== S.MEM || cu.status !== "ACTIVE") p.push(`ระบบ/สถานะ ${cu.memberSystemId === S.MEM} ${cu.status}`);
      if (cu.source !== "POS") p.push(`source ${cu.source}`);
      if (cu.homeUnitId !== U.A) p.push("homeUnitId ≠ A");
      if (cu.phone !== QPH) p.push(`phone เก็บเป็น ${short(cu.phone, 20)} (คาดตัวเลขล้วน ${QPH})`);
      if (cu.sourceDetail?.heardFrom !== "WALK_IN" || cu.sourceDetail?.unitId !== U.A) p.push(`sourceDetail ${short(cu.sourceDetail, 100)}`);
      const cons = (await P.memberConsent.findMany({ where: { customerId: qId } }).catch(() => [])) as Any[];
      const ch = cons.map((c) => `${c.channel}:${c.granted}:${c.source}`).sort();
      if (short(ch) !== short(["EMAIL:true:STAFF", "LINE:true:STAFF", "SMS:true:STAFF"])) p.push(`consent ${short(ch, 120)}`);
      const att = (await P.memberAttribution.findMany({ where: { customerId: qId } }).catch(() => [])) as Any[];
      const at = att.map((a) => `${a.touch}:${a.source}:${a.staffUserId === cashierId}:${a.unitId === U.A}`).sort();
      if (short(at) !== short(["FIRST:POS:true:true", "LAST:POS:true:true"])) p.push(`attribution ${short(at, 120)}`);
    }
    const au = await audits(AUDIT_REG, (a) => a.after?.customerId === qId);
    if (au.length !== 1) p.push(`audit ${AUDIT_REG} ${au.length} แถว`);
    else {
      if (au[0].actorId !== cashierId) p.push("audit actorId ≠ ผู้กระทำจริง");
      if (au[0].after?.created !== true || au[0].after?.unitId !== U.A) p.push(`audit after ${short(au[0].after, 100)}`);
      if (short(au[0], 100_000).includes(QPH)) p.push("audit มีเบอร์เต็ม");
    }
    chk("M9", NRM === "" && p.length === 0, "Customer + consent ×3 + attribution ×2 + audit (ผู้กระทำจริง)", FXB(NRM + joinP(p)));
  }
  {
    const p: string[] = [];
    const r1 = await quick({ ...qInput, phone: "089-214-5521", name: "ซ้ำเบอร์", idempotencyKey: newKey("qd") }, staff);
    if (!(r1?.ok === true && r1.created === false && r1.member?.id === X)) p.push(`เบอร์ X → ${codeOf(r1)} created ${r1?.created} id ${r1?.member?.id === X ? "X" : short(r1?.member?.id, 20)}`);
    const r2 = await quick(qInput, staff);
    if (!(r2?.ok === true && r2.member?.id === qId && qId)) p.push(`ยิงซ้ำคีย์เดิม → ${codeOf(r2)} id ${short(r2?.member?.id, 20)}`);
    const au = await audits(AUDIT_REG, (a) => a.after?.customerId === qId);
    if (au.length !== 1) p.push(`audit หลังยิงซ้ำ ${au.length} แถว (คาด 1)`);
    chk("M10", NRM === "" && p.length === 0, "เบอร์ซ้ำ created:false · คีย์ซ้ำ = คนเดิม · audit 1", FXB(NRM + joinP(p)));
  }

  // ════════ P1 แต้มบนแผงสิทธิ์ (ก่อนใช้แต้มใด ๆ) ════════
  {
    const p: string[] = [];
    const b = await benefits(X, { lines: L500 });
    const pt = b?.ok === true ? b.points : undefined;
    if (!isRecord(pt)) p.push(`benefits → ${codeOf(b)} points ${short(pt, 60)}`);
    else {
      const want = { balance: 1240, burnRateSatang: 10, burnMinPoints: 100, burnMaxPct: 50, balanceValueSatang: 12_400 };
      for (const [k, v] of Object.entries(want)) if (pt[k] !== v) p.push(`${k} ${pt[k]} (คาด ${v})`);
      if (!Array.isArray(pt.expiringSoon)) p.push("expiringSoon ไม่ใช่อาร์เรย์");
    }
    chk("P1", NRM === "" && p.length === 0, "1,240 แต้ม · 10 สต./แต้ม · ขั้นต่ำ 100 · เพดาน 50% · ฿124", FXB(NRM + joinP(p)));
  }

  // ════════ T ระดับ ════════
  const bT1 = await sale("bT1", "A", { lines: L500, memberId: X });
  {
    const p: string[] = [];
    const q = bT1.q;
    if (q?.ok === true) {
      if (q.tierDiscountSatang !== 2500) p.push(`quote tierDiscountSatang ${q.tierDiscountSatang}`);
      if (q.memberDiscountSatang !== 2500) p.push(`quote memberDiscountSatang ${q.memberDiscountSatang}`);
      if (kindAmt(Array.isArray(q.memberLines) ? q.memberLines : []) !== kindAmt([{ kind: "TIER", discountSatang: 2500 }])) p.push(`memberLines ${short(q.memberLines, 100)}`);
      if (q.grandTotalSatang !== 47_500) p.push(`quote grand ${q.grandTotalSatang}`);
      const f = q.subtotalSatang - q.lineDiscountSatang - q.billDiscountSatang - q.couponDiscountSatang + q.serviceChargeSatang - q.memberDiscountSatang;
      if (f !== q.grandTotalSatang) p.push(`สูตรยอดไม่ปิด ${f} ≠ ${q.grandTotalSatang}`);
    }
    const r = await row(bT1.id);
    if (bT1.id && (r?.tierDiscountSatang !== 2500 || r?.grandTotalSatang !== 47_500)) p.push(`บิล tier ${r?.tierDiscountSatang} grand ${r?.grandTotalSatang}`);
    if (bT1.id && kindAmt(linesOfBen(bT1.ben0)) !== kindAmt([{ kind: "TIER", discountSatang: 2500 }])) p.push(`memberBenefits ${short(bT1.ben0, 100)}`);
    chk("T1", !bT1.err && p.length === 0, "TIER 2,500 = quote = บิล · ยอด 47,500", FXB(NBJ(NB(bT1), p)));
  }
  {
    const p: string[] = [];
    const s = memberQuoteCodes.filter((c) => c === "MEMBER_RIGHTS_UNSUPPORTED").length;
    if (s) p.push(`quote สมาชิก ${s} ครั้งได้ MEMBER_RIGHTS_UNSUPPORTED`);
    if (codeOf(bT1.r) === "MEMBER_RIGHTS_UNSUPPORTED" || codeOf(bT1.q) === "MEMBER_RIGHTS_UNSUPPORTED") p.push("bT1 MEMBER_RIGHTS_UNSUPPORTED");
    if (!bT1.id) p.push(`bT1 ไม่เกิด (${bT1.err})`);
    chk("T2", p.length === 0, "ไม่มี MEMBER_RIGHTS_UNSUPPORTED", FXB(joinP(p)));
  }
  const bT3 = await sale("bT3", "A", { lines: L500, memberId: X, billDiscount: { type: "AMOUNT", value: 5000 } });
  {
    const p: string[] = [];
    if (bT3.q?.ok === true && (bT3.q.tierDiscountSatang !== 2500 || bT3.q.grandTotalSatang !== 42_500)) p.push(`quote tier ${bT3.q.tierDiscountSatang} grand ${bT3.q.grandTotalSatang}`);
    const r = await row(bT3.id);
    if (bT3.id && (r?.tierDiscountSatang !== 2500 || r?.grandTotalSatang !== 42_500)) p.push(`บิล tier ${r?.tierDiscountSatang} grand ${r?.grandTotalSatang}`);
    chk("T3", !bT3.err && p.length === 0, "ฐานระดับ = ก่อนลดท้ายบิล · 42,500", FXB(NBJ(NB(bT3), p)));
  }
  {
    const p: string[] = [];
    const q = await quote("A", { lines: L500, memberId: X, billDiscount: { type: "PERCENT", value: 900 } }, staffSeller);
    if (q?.ok !== true || q.grandTotalSatang !== 43_000 || q.tierDiscountSatang !== 2500) p.push(`STAFF 9% + Gold → ${codeOf(q)} grand ${q?.grandTotalSatang} tier ${q?.tierDiscountSatang}`);
    const c = await quote("A", { lines: L500, billDiscount: { type: "PERCENT", value: 1100 } }, staffSeller);
    if (!refused(c, "DISCOUNT_EXCEEDS_LIMIT")) p.push(`(ตัวควบคุม) 11% → ${codeOf(c)}`);
    chk("T4", p.length === 0, "ระดับนอกเพดานแคชเชียร์ · ตัวควบคุม 11% ถูกปฏิเสธ", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const r = await row(bT1.id);
    const s = bT1.snap0;
    if (!bT1.id) p.push(`ไม่มีบิล bT1 (${bT1.err})`);
    else if (!isRecord(s)) p.push(`memberSnapshot ${short(s, 60)}`);
    else {
      if (short(Object.keys(s).sort()) !== short([...SNAP_KEYS].sort())) p.push(`คีย์ ${short(Object.keys(s), 100)}`);
      const want: Any = { name: NAME.X, memberCode: xCode, phoneMasked: "089-xxx-5521", tierKey: "gold", tierName: "Gold" };
      for (const k of SNAP_KEYS) if (s[k] !== want[k]) p.push(`${k} ${short(s[k], 40)} (คาด ${short(want[k], 40)})`);
      if (short(s).includes("0892145521")) p.push("สำเนามีเบอร์เต็ม");
    }
    if (bT1.id && r?.memberId !== X) p.push("memberId ≠ X");
    const r1 = await quick({ phone: "0812345", name: "เจ็ดหลัก", marketingConsent: false, heardFrom: "WALK_IN", idempotencyKey: newKey("qp") });
    if (!refused(r1, "PHONE_INVALID")) p.push(`เบอร์ 7 หลัก → ${codeOf(r1)}`);
    const r2 = await quick({ phone: "abcdefghij", name: "ตัวอักษร", marketingConsent: false, heardFrom: "WALK_IN", idempotencyKey: newKey("qp") });
    if (!refused(r2, "PHONE_INVALID")) p.push(`เบอร์ตัวอักษร → ${codeOf(r2)}`);
    chk("M11", p.length === 0, "PHONE_INVALID ×2 · memberSnapshot ตรงตัว (ปิดเบอร์)", FXB(joinP(p)));
  }

  // ════════ V ว่อชเชอร์/คูปอง ════════
  const L200: L3[] = [["กาแฟ P112", 2, 10_000]];
  const bV = await sale("bV", "A", { lines: L200, memberId: X, memberChoices: { voucherId: V.x1 } });
  {
    const p: string[] = [];
    const r = await row(bV.id);
    const v = await vrow(V.x1);
    if (bV.id) {
      if (r?.grandTotalSatang !== 16_000) p.push(`ยอด ${r?.grandTotalSatang} (คาด 16,000)`);
      if (short(r?.voucherUseIds) !== short([V.x1])) p.push(`voucherUseIds ${short(r?.voucherUseIds, 60)}`);
      if (v?.status !== "USED" || v?.usedRef?.saleId !== bV.id) p.push(`ว่อชเชอร์ ${v?.status} usedRef ${short(v?.usedRef, 60)}`);
      if (kindAmt(linesOfBen(bV.ben0)) !== kindAmt([{ kind: "TIER", discountSatang: 1000 }, { kind: "VOUCHER", discountSatang: 3000 }])) p.push(`memberBenefits ${short(bV.ben0, 120)}`);
    }
    chk("V1", !bV.err && p.length === 0, "USED + usedRef + voucherUseIds + memberBenefits · 16,000", FXB(NBJ(NB(bV), p)));
  }
  {
    const p: string[] = [];
    for (const [lbl, vid] of [["หมดอายุ", V.xexp], ["ของ Y", V.y]] as const) {
      if (!vid) {
        p.push(`(ฟิกซ์เจอร์) ไม่มีว่อชเชอร์${lbl}`);
        continue;
      }
      const v0 = await vrow(vid);
      const q = await quote("A", { lines: L200, memberId: X, memberChoices: { voucherId: vid } });
      if (!(q?.ok === true && conflictCodes(q).includes("VOUCHER_INVALID"))) p.push(`quote ${lbl} → ${codeOf(q)} ${short(conflictCodes(q), 60)}`);
      const s = await submit("A", { lines: L200, memberId: X, memberChoices: { voucherId: vid } }, q?.ok === true ? Number(q.grandTotalSatang) : 19_000);
      if (!refused(s.r, "VOUCHER_INVALID")) p.push(`submit ${lbl} → ${codeOf(s.r)}`);
      if (await saleByKey(s.key)) p.push(`${lbl}: มีบิล`);
      const v1 = await vrow(vid);
      if (v1?.status !== v0?.status || short(v1?.usedRef) !== short(v0?.usedRef)) p.push(`${lbl}: ว่อชเชอร์เปลี่ยน`);
    }
    chk("V2", p.length === 0, "VOUCHER_INVALID (quote conflict + submit) · ไม่เขียน", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const two = [V.lim2 ?? "a", V.xns ?? "b"];
    // ORACLE-EDIT (มติผู้คุมงาน 1): VOUCHER_LIMIT ถูกเลิก — voucherId ที่เป็นอาร์เรย์ (ความยาวใดก็ได้) = VALIDATION ไม่มีอะไรถูกเขียน
    const q = await quote("A", { lines: L200, memberId: X, memberChoices: { voucherId: two } });
    if (!refused(q, "VALIDATION")) p.push(`quote 2 ใบ → ${codeOf(q)} ${short(conflictCodes(q), 60)}`);
    const q1 = await quote("A", { lines: L200, memberId: X, memberChoices: { voucherId: [two[0]] } });
    if (!refused(q1, "VALIDATION")) p.push(`quote อาร์เรย์ 1 ใบ → ${codeOf(q1)}`);
    const s = await submit("A", { lines: L200, memberId: X, memberChoices: { voucherId: two } }, 16_000);
    if (!refused(s.r, "VALIDATION")) p.push(`submit 2 ใบ → ${codeOf(s.r)}`);
    if (await saleByKey(s.key)) p.push("มีบิล");
    for (const vid of two) if ((await vrow(vid))?.status !== "ACTIVE") p.push(`ว่อชเชอร์ ${vid.slice(-6)} ไม่ ACTIVE`);
    chk("V3", p.length === 0, "voucherId อาร์เรย์ = VALIDATION · ไม่เขียน", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const nRed0 = Number(await P.couponRedemption.count({ where: { tenantId: T } }).catch(() => -1));
    const c: CartIn = { lines: L500, memberId: X, couponCode: "WELCOME50", memberChoices: { voucherId: V.xns } };
    const q = await quote("A", c);
    if (!(q?.ok === true && conflictCodes(q).includes("VOUCHER_COUPON_CONFLICT"))) p.push(`quote → ${codeOf(q)} ${short(conflictCodes(q), 60)}`);
    const s = await submit("A", c, q?.ok === true ? Number(q.grandTotalSatang) : 42_500);
    if (!refused(s.r, "VOUCHER_COUPON_CONFLICT")) p.push(`submit → ${codeOf(s.r)}`);
    if (await saleByKey(s.key)) p.push("มีบิล");
    if ((await vrow(V.xns))?.status !== "ACTIVE") p.push("ว่อชเชอร์ไม่ ACTIVE");
    if (Number(await P.couponRedemption.count({ where: { tenantId: T } }).catch(() => -1)) !== nRed0) p.push("มีการใช้คูปองเพิ่ม");
    chk("V4", p.length === 0, "VOUCHER_COUPON_CONFLICT · ไม่เขียน", FXB(joinP(p)));
  }
  const bC = await sale("bC", "A", { lines: L500, memberId: X, couponCode: "WELCOME50" });
  {
    const p: string[] = [];
    if (bC.q?.ok === true && (bC.q.couponDiscountSatang !== 5000 || bC.q.grandTotalSatang !== 42_500)) p.push(`quote coupon ${bC.q.couponDiscountSatang} grand ${bC.q.grandTotalSatang}`);
    const rr = await reds(bC.id);
    if (bC.id && !(rr.length === 1 && rr[0].status === "REDEEMED" && rr[0].discountSatang === 5000)) p.push(`CouponRedemption ${short(rr.map((x) => `${x.status}:${x.discountSatang}`), 80)}`);
    if (bC.id && (await row(bC.id))?.grandTotalSatang !== 42_500) p.push("ยอดบิล ≠ 42,500");
    chk("V5", !bC.err && p.length === 0, "คูปองกับสมาชิก REDEEMED 5,000 · 42,500", FXB(NBJ(NB(bC), p)));
  }
  const bW = await sale("bW", "A", { lines: [["น้ำ P112", 3, 10_000]], couponCode: "PCT10", billDiscount: { type: "AMOUNT", value: 2000 } });
  {
    const p: string[] = [];
    const rr = await reds(bW.id);
    if (bW.id && !(rr.length === 1 && rr[0].status === "REDEEMED" && rr[0].discountSatang === 2800)) p.push(`CouponRedemption ${short(rr.map((x) => `${x.status}:${x.discountSatang}`), 80)}`);
    if (bW.id && (await row(bW.id))?.grandTotalSatang !== 25_200) p.push(`ยอด ${(await row(bW.id))?.grandTotalSatang}`);
    chk("V6", !bW.err && p.length === 0, "walk-in คูปอง 10% ของ 28,000 = 2,800 · 25,200", FXB(NBJ(NB(bW), p)));
  }
  {
    const p: string[] = [];
    const bad = `NOPE${RAND}`.toUpperCase();
    const q = await quote("A", { lines: L200, couponCode: bad });
    if (!(refused(q, "COUPON_INVALID") || q?.ok === true)) p.push(`walk-in quote → ${codeOf(q)}`);
    const s = await submit("A", { lines: L200, couponCode: bad }, 20_000);
    if (!refused(s.r, "COUPON_INVALID")) p.push(`walk-in submit → ${codeOf(s.r)}`);
    if (await saleByKey(s.key)) p.push("มีบิล");
    const qm = await quote("A", { lines: L200, memberId: X, couponCode: bad });
    if (!(qm?.ok === true && conflictCodes(qm).includes("COUPON_INVALID"))) p.push(`สมาชิก quote → ${codeOf(qm)} ${short(conflictCodes(qm), 60)}`);
    chk("V7", p.length === 0, "COUPON_INVALID ไทย · ไม่เขียน", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const c: CartIn = { lines: L200, memberId: X, memberChoices: { voucherId: V.race } };
    const q = fx ? null : await quote("A", c);
    if (q?.ok !== true) p.push(`quote → ${codeOf(q)}`);
    else {
      const [a, b] = await Promise.all([submit("A", c, Number(q.grandTotalSatang)), submit("A", c, Number(q.grandTotalSatang))]);
      const oks = [a, b].filter((x) => x.r?.ok === true);
      const lose = [a, b].find((x) => x.r?.ok !== true);
      if (oks.length !== 1) p.push(`สำเร็จ ${oks.length} ใบ`);
      if (lose && !refusedAny(lose.r, ["MEMBER_RIGHTS_CHANGED", "VOUCHER_INVALID"])) p.push(`ผู้แพ้ → ${codeOf(lose.r)}`);
      const sales = (await Promise.all([saleByKey(a.key), saleByKey(b.key)])).filter(Boolean);
      if (sales.length !== 1) p.push(`บิล ${sales.length} ใบ`);
      const v = await vrow(V.race);
      if (oks[0] && v?.usedRef?.saleId !== String(oks[0].r.saleId)) p.push(`usedRef ${short(v?.usedRef, 60)}`);
    }
    const saleIds = new Set(((await P.posSale.findMany({ where: { tenantId: T }, select: { id: true } }).catch(() => [])) as Any[]).map((x) => x.id));
    const orphan = ((await P.pointLedger.findMany({ where: { tenantId: T, refType: "PosSale" }, select: { refId: true } }).catch(() => [])) as Any[]).filter((l) => !saleIds.has(l.refId));
    if (orphan.length) p.push(`แถวแต้มกำพร้า ${orphan.length}`);
    chk("V8", p.length === 0, "แข่งกัน: บิล 1 ใบ · ผู้แพ้ MEMBER_RIGHTS_CHANGED · ไม่มีกำพร้า", FXB(joinP(p)));
  }

  // ════════ P แต้ม ════════
  await drain();
  const balP0 = await bal(X);
  const bP = await sale("bP", "A", { lines: L500, memberId: X, memberChoices: { points: 500 } });
  {
    const p: string[] = [];
    if (bP.id) {
      const r = await row(bP.id);
      if (r?.grandTotalSatang !== 42_500) p.push(`ยอด ${r?.grandTotalSatang} (คาด 42,500)`);
      const burn = (await ledger(bP.id)).filter((l) => Number(l.delta) < 0);
      if (!(burn.length === 1 && Number(burn[0].delta) === -500 && burn[0].idempotencyKey === `pos-burn-${bP.id}`)) p.push(`BURN ${short(burn.map((l) => `${l.delta}:${l.idempotencyKey}`), 100)}`);
      if (kindAmt(linesOfBen(bP.ben0)) !== kindAmt([{ kind: "TIER", discountSatang: 2500 }, { kind: "POINTS", discountSatang: 5000 }]) || bP.ben0?.pointsBurned !== 500) p.push(`memberBenefits ${short(bP.ben0, 140)}`);
      const m = bP.r?.member;
      if (!isRecord(m) || m.pointsBurned !== 500 || m.pointsBalanceAfterBurn !== balP0 - 500 || !(Number(m.pointsExpected) > 0)) p.push(`ผล submit member ${short(m, 120)} (ก่อน ${balP0})`);
    }
    chk("P2", !bP.err && p.length === 0, "BURN −500 pos-burn-<id> · ฿50 · 42,500 · ผล member", FXB(NBJ(NB(bP), p)));
  }
  const ptsCase = async (id: string, unit: string, c: CartIn, code: string, extra?: (r: Any) => string): Promise<string[]> => {
    const p: string[] = [];
    await drain();
    const burnsX = async () => Number(await P.pointLedger.count({ where: { tenantId: T, customerId: X || "-", delta: { lt: 0 } } }).catch(() => -1));
    const l0 = await burnsX();
    const q = await quote(unit, c);
    if (!(q?.ok === true && conflictCodes(q).includes(code))) p.push(`quote → ${codeOf(q)} ${short(conflictCodes(q), 60)}`);
    const s = await submit(unit, c, q?.ok === true ? Number(q.grandTotalSatang) : 10_000);
    if (!refused(s.r, code)) p.push(`submit → ${codeOf(s.r)}`);
    else if (extra) {
      const e = extra(s.r);
      if (e) p.push(e);
    }
    if (await saleByKey(s.key)) p.push("มีบิล");
    if ((await burnsX()) !== l0) p.push("มีแถวตัดแต้มของ X เพิ่ม");
    if (id === "P5" && q?.ok === true) {
      const pl = (Array.isArray(q.memberLines) ? q.memberLines : []).find((x: Any) => x?.kind === "POINTS");
      if (pl?.discountSatang !== 4750) p.push(`quote เส้น POINTS ${short(pl, 80)} (คาด 4,750)`);
    }
    return p;
  };
  {
    const p = await ptsCase("P3", "A", { lines: L200, memberId: X, memberChoices: { points: 50 } }, "POINTS_BELOW_MIN");
    chk("P3", p.length === 0, "POINTS_BELOW_MIN · ไม่เขียน", FXB(joinP(p)));
  }
  {
    const p = await ptsCase("P4", "A", { lines: L200, memberId: X, memberChoices: { points: 999_999 } }, "POINTS_INSUFFICIENT");
    chk("P4", p.length === 0, "POINTS_INSUFFICIENT · ไม่เขียน", FXB(joinP(p)));
  }
  {
    const L100: L3[] = [["ขนม P112", 1, 10_000]];
    const p = await ptsCase("P5", "A", { lines: L100, memberId: X, memberChoices: { points: 600 } }, "POINTS_CAPPED", (r) => (r.allowedPoints === 475 ? "" : `allowedPoints ${r.allowedPoints} (คาด 475)`));
    const ok = await sale("bP5", "A", { lines: L100, memberId: X, memberChoices: { points: 475 } });
    if (!ok.id) p.push(`(ตัวควบคุม) 475 แต้ม → ${ok.err}`);
    else {
      const burn = (await ledger(ok.id)).filter((l) => Number(l.delta) < 0);
      if (!(burn.length === 1 && Number(burn[0].delta) === -475)) p.push(`(ตัวควบคุม) BURN ${short(burn.map((l) => l.delta), 40)}`);
      if ((await row(ok.id))?.grandTotalSatang !== 4750) p.push(`(ตัวควบคุม) ยอด ${(await row(ok.id))?.grandTotalSatang} (คาด 4,750)`);
    }
    chk("P5", p.length === 0, "POINTS_CAPPED allowedPoints 475 · ไม่เขียน · 475 ผ่าน", FXB(joinP(p)));
  }
  {
    const p = await ptsCase("P6", "C", { lines: L200, memberId: X, memberChoices: { points: 200 } }, "POINTS_DISABLED");
    const b = await benefits(X, { lines: L200 }, owner, "C");
    if (!(b?.ok === true && b.points === null)) p.push(`benefits สาขา C → ${codeOf(b)} points ${short(b?.points, 40)}`);
    chk("P6", p.length === 0, "สาขาไม่มีระบบแต้ม = POINTS_DISABLED · points null", FXB(joinP(p)));
  }
  const bTB = await sale("bTB", "A", { lines: [["ชุด P112", 1, 40_000]], memberId: X, couponCode: "PCT10", billDiscount: { type: "AMOUNT", value: 4000 } });

  // ════════ S สแตมป์ ════════
  const L800: L3[] = [["ชุดดำน้ำ P112", 1, 80_000]];
  {
    const p: string[] = [];
    const q = await quote("A", { lines: L800, memberId: X });
    const st = q?.ok === true && Array.isArray(q.stampsToAdd) ? q.stampsToAdd : null;
    if (!st) p.push(`quote → ${codeOf(q)} stampsToAdd ${short(q?.stampsToAdd, 60)}`);
    else if (!st.some((s: Any) => s?.cardId === card?.id && s?.count === 1)) p.push(`stampsToAdd ${short(st, 100)}`);
    chk("S1", p.length === 0, "stampsToAdd การ์ดของร้าน 1 ดวง", FXB(joinP(p)));
  }
  const bS = await sale("bS", "A", { lines: L800, memberId: X });
  await drain();
  {
    const p: string[] = [];
    const a = await adds(bS.id);
    if (bS.id) {
      if (a.length !== 1) p.push(`ADD ${a.length} แถว`);
      const r = await row(bS.id);
      if (a[0] && !(Array.isArray(r?.stampEventIds) && r.stampEventIds.includes(a[0].id))) p.push("stampEventIds ไม่มี id");
    }
    chk("S2", !bS.err && p.length === 0, "StampEvent ADD 1 + stampEventIds", FXB(NBJ(NB(bS), p)));
  }
  {
    const p: string[] = [];
    if (bS.id) {
      p.push(...(await replay("pos.sale.paid", (pl) => pl.saleId === bS.id)));
      await drain();
      if ((await adds(bS.id)).length !== 1) p.push(`เล่นซ้ำแล้ว ADD ${(await adds(bS.id)).length}`);
    }
    chk("S3", !bS.err && p.length === 0, "เล่น pos.sale.paid ×2 → ADD ยัง 1", FXB(NBJ(NB(bS), p)));
  }
  {
    const p: string[] = [];
    if (bS.id) {
      const a = (await adds(bS.id)).map((x) => String(x.id));
      const s0 = await stampsNow(X);
      const v = await call(svc, "voidSale", T, U.A, bS.id);
      if (v?.ok === false) p.push(`voidSale ${codeOf(v)} ${short(v.message, 60)}`);
      await drain();
      if ((await voidsOf(a)) !== 1) p.push(`VOID ${await voidsOf(a)} (คาด 1)`);
      if ((await stampsNow(X)) !== s0 - 1) p.push(`ดวง ${s0} → ${await stampsNow(X)} (คาด −1)`);
      await drain();
      if ((await voidsOf(a)) !== 1) p.push("ระบายซ้ำแล้ว VOID ≠ 1");
    }
    chk("S4", !bS.err && p.length === 0, "void → VOID 1 · ดวง −1 · ซ้ำไม่เพิ่ม", FXB(NBJ(NB(bS), p)));
  }

  // ════════ P7 P8 (หลังระบายคิว) ════════
  await drain();
  {
    const p: string[] = [];
    if (bP.id) {
      const r = await row(bP.id);
      const exp = Number(bP.r?.member?.pointsExpected);
      const ce = await pointMod
        .computeEarn(pctx, { customerId: X, sale: { lines: L500.map(([, q, pr]) => ({ itemId: null, categoryId: null, qty: q, netSatang: q * pr })), netSatang: 42_500, paidBy: { voucherSatang: 0, pointsSatang: 5000, giftCardSatang: 0 } } })
        .catch(() => null);
      if (!(Number(r?.pointEarned) > 0)) p.push(`pointEarned ${r?.pointEarned}`);
      if (r?.pointEarned !== exp) p.push(`pointEarned ${r?.pointEarned} ≠ pointsExpected ${exp}`);
      if (ce && r?.pointEarned !== ce.points) p.push(`pointEarned ${r?.pointEarned} ≠ computeEarn ${ce.points}`);
    }
    chk("P7", !bP.err && p.length === 0, "pointEarned = pointsExpected = computeEarn(ไม่นับส่วนแต้ม)", FXB(NBJ(NB(bP), p)));
  }
  {
    const p: string[] = [];
    const g1 = await sale("bG1", "A", { lines: L200, memberId: Y, memberChoices: { points: 500 } });
    const g2 = await sale("bG2", "A", { lines: L200, billDiscount: { type: "AMOUNT", value: 5000 } });
    await drain();
    if (g1.id && g2.id) {
      const [r1, r2] = [await row(g1.id), await row(g2.id)];
      if (r1?.grandTotalSatang !== 15_000 || r2?.grandTotalSatang !== 15_000) p.push(`ยอด ${r1?.grandTotalSatang}/${r2?.grandTotalSatang}`);
      if (r1?.vatSatang !== r2?.vatSatang) p.push(`VAT ${r1?.vatSatang} ≠ ${r2?.vatSatang}`);
      const [j1, j2] = [await jvOf([g1.id]), await jvOf([g2.id])];
      if (!balanced(j1) || !balanced(j2)) p.push(`JV ไม่สมดุล/ไม่มี (${j1.length}/${j2.length})`);
      if (!sameMap(netByCode(j1), netByCode(j2))) p.push(`GL ต่าง ${short(netByCode(j1), 120)} | ${short(netByCode(j2), 120)}`);
    }
    chk("P8", !g1.err && !g2.err && p.length === 0, "GL แต้ม = GL ลดท้ายบิลเท่ากัน", FXB(NBJ(NB(g1) + NB(g2), p)));
  }

  // ════════ W รางวัล ════════
  {
    const p: string[] = [];
    if (!redemptionId) p.push("(ฟิกซ์เจอร์) ไม่มีรายการรอรับ");
    const b = await benefits(X, { lines: L200 }, staff);
    if (!(b?.ok === true && Array.isArray(b.rewardsPending) && b.rewardsPending.some((x: Any) => x?.redemptionId === redemptionId && typeof x?.rewardName === "string"))) p.push(`rewardsPending ${codeOf(b)} ${short(b?.rewardsPending, 80)}`);
    const f = await fulfil(X, redemptionId, staff);
    if (f?.ok !== true) p.push(`fulfil → ${codeOf(f)} ${short(f?.message ?? "", 60)}`);
    const rr = redemptionId ? await P.rewardRedemption.findUnique({ where: { id: redemptionId } }).catch(() => null) : null;
    if (rr?.status !== "FULFILLED" || rr?.fulfilledById !== cashierId) p.push(`รายการ ${rr?.status} by ${rr?.fulfilledById === cashierId ? "ผู้กระทำจริง" : short(rr?.fulfilledById, 20)}`);
    const au = await audits(AUDIT_FULFIL, (a) => a.targetId === redemptionId || short(a.after, 2000).includes(redemptionId));
    if (au.length !== 1 || au[0]?.actorId !== cashierId) p.push(`audit ${au.length} แถว actor ${au[0]?.actorId === cashierId ? "ok" : short(au[0]?.actorId, 20)}`);
    chk("W1", NRM === "" && p.length === 0, "FULFILLED · ผู้กระทำจริง · audit 1", FXB(NRM + joinP(p)));
  }
  {
    const p: string[] = [];
    const f2 = await fulfil(X, redemptionId, staff);
    if (f2?.ok !== true) p.push(`ซ้ำ → ${codeOf(f2)}`);
    const au = await audits(AUDIT_FULFIL, (a) => a.targetId === redemptionId || short(a.after, 2000).includes(redemptionId));
    if (au.length !== 1) p.push(`audit ${au.length} แถว (คาด 1)`);
    const f3 = await fulfil(Y, redemptionId, staff);
    if (!refusedAny(f3, ["NOT_FOUND", "MEMBER_NOT_FOUND"])) p.push(`memberId Y → ${codeOf(f3)}`);
    chk("W2", NRM === "" && p.length === 0, "ซ้ำ ok audit 1 · คนอื่น NOT_FOUND", FXB(NRM + joinP(p)));
  }

  // ════════ X ย้อนครบ ════════
  if (X && !fx) await step("เติมแต้ม X +3,000", () => pointMod.earnWithLot(pctx, { customerId: X, points: 3000, refType: "QC", refId: `${TAG}-px1`, idempotencyKey: `${TAG}-px1` }));
  const refundLines = async (saleId: string, names: string[] | null): Promise<{ r: Any; refundId: string }> => {
    const f = await call(refundMod, "saleForRefund", ctxOf("A", DEV1), owner, { saleId });
    if (f?.ok !== true) return { r: f, refundId: "" };
    const ls = (Array.isArray(f.lines) ? f.lines : []).filter((l: Any) => !names || names.includes(l.name));
    const amt = sum(ls.map((l: Any) => Number(l.netSatang)));
    const r = await call(refundMod, "refundSale", ctxOf("A", DEV1), owner, {
      saleId,
      lines: ls.map((l: Any) => ({ lineId: l.lineId, qty: Number(l.refundableQty ?? l.qty) })),
      payMethods: [{ type: "CASH", amountSatang: amt }],
      reasonCode: "CHANGED_MIND",
      reason: "ลูกค้าเปลี่ยนใจ (QC P1.12)",
      idempotencyKey: newKey("rf"),
    });
    return { r, refundId: r?.ok === true ? String(r.refund?.id ?? "") : "" };
  };
  // X1 + X2 + X7 — void บิลครบทุกสิทธิ์
  await drain();
  const balX0 = await bal(X);
  const spX0 = await spent(X);
  const bX = await sale("bX", "A", { lines: [["ทัวร์ P112", 1, 100_000]], memberId: X, couponCode: "WELCOME50", memberChoices: { voucherId: V.bx, points: 200 } });
  await drain();
  const earnX = sumDelta((await ledger(bX.id)).filter((l) => Number(l.delta) > 0));
  const addsX = (await adds(bX.id)).map((x) => String(x.id));
  let x1v: Any = null;
  if (bX.id) {
    x1v = await call(svc, "voidSale", T, U.A, bX.id);
    await drain();
  }
  {
    const p: string[] = [];
    if (bX.id) {
      if ((await row(bX.id))?.grandTotalSatang !== 85_000) p.push(`ยอดก่อน void ≠ 85,000 (${bX.q?.grandTotalSatang})`);
      if (x1v?.ok === false) p.push(`voidSale ${codeOf(x1v)} ${short(x1v.message, 60)}`);
      if (!(earnX > 0)) p.push("ก่อน void ไม่มีแต้มที่ได้ (EARN)");
      if (addsX.length !== 1) p.push(`ก่อน void ADD ${addsX.length}`);
      if ((await vrow(V.bx))?.status !== "ACTIVE") p.push(`ว่อชเชอร์ ${(await vrow(V.bx))?.status}`);
      const sd = sumDelta(await ledger(bX.id));
      if (sd !== 0) p.push(`Σ แต้มของบิล ${sd}`);
      if ((await bal(X)) !== balX0) p.push(`ยอดแต้ม ${balX0} → ${await bal(X)}`);
      const rr = await reds(bX.id);
      if (!(rr.length >= 1 && rr.every((x) => x.status === "RELEASED"))) p.push(`คูปอง ${short(rr.map((x) => x.status), 60)}`);
      if ((await voidsOf(addsX)) !== addsX.length) p.push("ดวงไม่ถูก VOID");
      if ((await spent(X)) !== spX0) p.push(`ยอดสะสม ${spX0} → ${await spent(X)}`);
    }
    chk("X1", !bX.err && p.length === 0, "void คืนครบ: ว่อชเชอร์ · แต้ม 0 · คูปอง · ดวง · ยอดสะสม", FXB(NBJ(NB(bX), p)));
  }
  {
    const p: string[] = [];
    if (bX.id) {
      const before = short([(await ledger(bX.id)).length, await bal(X), await voidsOf(addsX), await spent(X), (await vrow(V.bx))?.status, (await reds(bX.id)).map((x) => x.status)]);
      p.push(...(await replay("pos.sale.voided", (pl) => pl.saleId === bX.id)));
      await drain();
      const after = short([(await ledger(bX.id)).length, await bal(X), await voidsOf(addsX), await spent(X), (await vrow(V.bx))?.status, (await reds(bX.id)).map((x) => x.status)]);
      if (before !== after) p.push(`เปลี่ยน ${before} → ${after}`);
    }
    chk("X2", !bX.err && p.length === 0, "เล่น pos.sale.voided ×2 ไม่ซ้ำ", FXB(NBJ(NB(bX), p)));
  }
  {
    const p: string[] = [];
    if (bX.id) {
      const j = await jvOf([bX.id]);
      if (j.length < 2) p.push(`JV ${j.length} (คาด ขาย + กลับรายการ)`);
      if (!balanced(j)) p.push("JV ไม่สมดุล");
      const m = netByCode(j);
      if (Object.keys(m).length) p.push(`Σ ต่อรหัสไม่เป็น 0 ${short(m, 120)}`);
    }
    chk("X7", !bX.err && p.length === 0, "GL ของบิลที่ void สุทธิ 0", FXB(NBJ(NB(bX), p)));
  }
  // X3 — คืนเงินครบ
  await drain();
  const balF0 = await bal(X);
  const spF0 = await spent(X);
  const bF = await sale("bF", "A", { lines: [["คอร์ส A P112", 1, 45_000], ["คอร์ส B P112", 1, 45_000]], memberId: X, couponCode: "WELCOME50", memberChoices: { voucherId: V.bf, points: 100 } });
  await drain();
  const addsF = (await adds(bF.id)).map((x) => String(x.id));
  const rfF = bF.id ? await refundLines(bF.id, null) : { r: null, refundId: "" };
  await drain(3);
  {
    const p: string[] = [];
    if (bF.id) {
      if (rfF.r?.ok !== true) p.push(`refundSale ${codeOf(rfF.r)} ${short(rfF.r?.message ?? "", 60)}`);
      if ((await row(bF.id))?.status !== "REFUNDED") p.push(`สถานะ ${(await row(bF.id))?.status}`);
      if ((await vrow(V.bf))?.status !== "ACTIVE") p.push(`ว่อชเชอร์ ${(await vrow(V.bf))?.status}`);
      const sd = sumDelta(await ledger(bF.id));
      if (sd !== 0) p.push(`Σ แต้มของบิล ${sd}`);
      if ((await bal(X)) !== balF0) p.push(`ยอดแต้ม ${balF0} → ${await bal(X)}`);
      const rr = await reds(bF.id);
      if (!(rr.length >= 1 && rr.every((x) => x.status === "RELEASED"))) p.push(`คูปอง ${short(rr.map((x) => x.status), 60)} (CD7)`);
      if (addsF.length !== 1 || (await voidsOf(addsF)) !== 1) p.push(`ดวง ADD ${addsF.length} VOID ${await voidsOf(addsF)}`);
      if ((await spent(X)) !== spF0) p.push(`ยอดสะสม ${spF0} → ${await spent(X)}`);
    }
    chk("X3", !bF.err && p.length === 0, "คืนครบ = คืนสิทธิ์ทุกชนิด + คูปอง", FXB(NBJ(NB(bF), p)));
  }
  // X4 — คืนบางส่วน
  const bPR = await sale("bPR", "A", { lines: [["ฟิน P112", 1, 40_000], ["หน้ากาก P112", 1, 40_000]], memberId: X, memberChoices: { voucherId: V.bpr, points: 100 } });
  await drain();
  const earnPR = sumDelta((await ledger(bPR.id)).filter((l) => Number(l.delta) > 0));
  const addsPR = (await adds(bPR.id)).map((x) => String(x.id));
  const rfPR = bPR.id ? await refundLines(bPR.id, ["ฟิน P112"]) : { r: null, refundId: "" };
  await drain(3);
  {
    const p: string[] = [];
    if (bPR.id) {
      if (rfPR.r?.ok !== true) p.push(`refundSale ${codeOf(rfPR.r)} ${short(rfPR.r?.message ?? "", 60)}`);
      if ((await vrow(V.bpr))?.status !== "USED") p.push(`ว่อชเชอร์ ${(await vrow(V.bpr))?.status} (คาด USED)`);
      const ls = await ledger(bPR.id);
      if (!ls.some((l) => Number(l.delta) === -100 && l.idempotencyKey === `pos-burn-${bPR.id}`)) p.push("BURN −100 หาย");
      if (ls.filter((l) => Number(l.delta) > 0).length !== 1) p.push(`แถวบวก ${ls.filter((l) => Number(l.delta) > 0).length} (คาด EARN 1 · ไม่คืน BURN)`);
      // PROPOSED ORACLE-EDIT: point.reversePartialEarn เก็บคีย์ต่อแถว EARN = `pos-refund-<refundId>:<earnLedgerId>` (lots.ts · P1.8) — เทียบคำนำหน้า
      const part = ls.find((l) => String(l.idempotencyKey ?? "").startsWith(`pos-refund-${rfPR.refundId}:`));
      if (!(earnPR > 0 && part && Number(part.delta) < 0 && -Number(part.delta) < earnPR)) p.push(`หักตามสัดส่วน ${short(part?.delta, 10)} จาก EARN ${earnPR}`);
      if (addsPR.length !== 1 || (await voidsOf(addsPR)) !== 0) p.push(`ดวง ADD ${addsPR.length} VOID ${await voidsOf(addsPR)} (คาด 1/0)`);
    }
    chk("X4", !bPR.err && p.length === 0, "คืนบางส่วน: USED · BURN คง · หักแต้มตามสัดส่วน · ดวงคง", FXB(NBJ(NB(bPR), p)));
  }
  {
    const p: string[] = [];
    if (bF.id && bPR.id) {
      const snap = async () => short([(await ledger(bF.id)).length, (await ledger(bPR.id)).length, await bal(X), await voidsOf([...addsF, ...addsPR])]);
      const before = await snap();
      p.push(...(await replay("pos.sale.refunded", (pl) => pl.refundSaleId === rfF.refundId || pl.refundSaleId === rfPR.refundId)));
      await drain();
      const after = await snap();
      if (before !== after) p.push(`เปลี่ยน ${before} → ${after}`);
    }
    chk("X5", !!bF.id && !!bPR.id && p.length === 0, "เล่น pos.sale.refunded ×2 ไม่ซ้ำ", FXB(NBJ(NB(bF) + NB(bPR), p)));
  }
  // X6 — void แข่งกับคิวปิดบิล
  {
    const p: string[] = [];
    await drain();
    const b0 = await bal(X);
    const s0 = await spent(X);
    const st0 = await stampsNow(X);
    const bVR = await sale("bVR", "A", { lines: [["เรือ P112", 1, 70_000]], memberId: X, memberChoices: { voucherId: V.bvr, points: 100 } });
    if (bVR.id) {
      const v = await call(svc, "voidSale", T, U.A, bVR.id);
      if (v?.ok === false) p.push(`voidSale ${codeOf(v)} ${short(v.message, 60)}`);
      await drain(3);
      const sd = sumDelta(await ledger(bVR.id));
      if (sd !== 0) p.push(`Σ แต้มของบิล ${sd}`);
      if ((await vrow(V.bvr))?.status !== "ACTIVE") p.push(`ว่อชเชอร์ ${(await vrow(V.bvr))?.status}`);
      if ((await stampsNow(X)) !== st0) p.push(`ดวง ${st0} → ${await stampsNow(X)}`);
      if ((await bal(X)) !== b0) p.push(`ยอดแต้ม ${b0} → ${await bal(X)}`);
      if ((await spent(X)) !== s0) p.push(`ยอดสะสม ${s0} → ${await spent(X)}`);
    }
    chk("X6", !bVR.err && p.length === 0, "void แข่งคิว = สุทธิ 0 ทุกอย่าง", FXB(NBJ(NB(bVR), p)));
  }

  // ════════ R ตัวอ่าน ════════
  const bR = await sale("bR", "A", { lines: [["ร่ม P112", 1, 30_000], ["กระเป๋า P112", 1, 10_000]], memberId: X, couponCode: "WELCOME50", billDiscount: { type: "AMOUNT", value: 1000 }, memberChoices: { voucherId: V.xst, points: 100 } });
  await drain();
  const WANT_R = kindAmt([{ kind: "TIER", discountSatang: 2000 }, { kind: "VOUCHER", discountSatang: 3000 }, { kind: "POINTS", discountSatang: 1000 }]);
  const snapName = String(bR.snap0?.name ?? NAME.X);
  {
    const p: string[] = [];
    if (bR.id) {
      if ((await row(bR.id))?.grandTotalSatang !== 28_000) p.push(`ยอด ${(await row(bR.id))?.grandTotalSatang} (คาด 28,000)`);
      if (kindAmt(linesOfBen(bR.ben0)) !== WANT_R) p.push(`memberBenefits ${short(bR.ben0, 140)} (ไม่รวม COUPON)`);
      const rp = await call(rcpMod, "receiptPayload", rctx(), owner, { saleId: bR.id });
      const pl = rp?.ok === true ? rp.payload : null;
      if (!pl) p.push(`receiptPayload ${codeOf(rp)}`);
      else {
        const mb = Array.isArray(pl.totals?.memberBenefits) ? pl.totals.memberBenefits : null;
        if (!mb || kindAmt(mb) !== WANT_R) p.push(`totals.memberBenefits ${short(mb, 120)}`);
        if (pl.totals?.billDiscountSatang !== 1000) p.push(`billDiscountSatang ${pl.totals?.billDiscountSatang} (คาด 1,000)`);
        if (pl.totals?.couponDiscountSatang !== 5000) p.push(`couponDiscountSatang ${pl.totals?.couponDiscountSatang}`);
        const m = pl.member;
        if (!isRecord(m) || m.name !== snapName || m.memberCode !== xCode || m.phoneMasked !== "089-xxx-5521" || m.tierName !== "Gold") p.push(`member ${short(m, 140)}`);
      }
    }
    chk("R1", !bR.err && p.length === 0, "บรรทัดสิทธิ์แยก · ลดท้ายบิล 1,000 · บล็อกสมาชิกจากสำเนา", FXB(NBJ(NB(bR), p)));
  }
  // R2 — แต้มคงเหลือของระบบแต้มของสาขา + สำเนาชื่อ (เปลี่ยนชื่อสมาชิกเป็นตัวกระตุ้น — คืนชื่อเดิมท้ายหมวด R)
  if (X && !fx) {
    await step("แต้มระบบที่ 2 ของ X (+77)", () => pointMod.earnWithLot({ tenantId: T, systemId: S.PTS2, memberSystemId: S.MEM, actorUserId: ownerId }, { customerId: X, points: 77, refType: "QC", refId: `${TAG}-pts2`, idempotencyKey: `${TAG}-pts2` }));
    await step("เปลี่ยนชื่อ X (ตัวกระตุ้น)", () => P.customer.update({ where: { id: X }, data: { name: `เปลี่ยนชื่อ ${TAGN}` } }));
  }
  {
    const p: string[] = [];
    if (bR.id) {
      const rp = await call(rcpMod, "receiptPayload", rctx(), owner, { saleId: bR.id });
      const m = rp?.ok === true ? rp.payload?.member : null;
      const live = await bal(X);
      if (!isRecord(m)) p.push(`member ${codeOf(rp)}`);
      else {
        if (m.pointBalance !== live) p.push(`pointBalance ${m.pointBalance} (คาด ${live} ของระบบแต้มสาขา A · ระบบที่ 2 = ${await bal(X, S.PTS2)})`);
        if (m.name !== snapName) p.push(`ชื่อ ${short(m.name, 40)} (คาดสำเนา ${short(snapName, 40)})`);
      }
    }
    chk("R2", !bR.err && p.length === 0, "แต้มคงเหลือ = ระบบแต้มของสาขา · ชื่อ = สำเนา", FXB(NBJ(NB(bR), p)));
  }
  {
    const p: string[] = [];
    if (bR.id) {
      const tok = String(((await P.$queryRawUnsafe(`SELECT "publicToken" AS t FROM "PosSale" WHERE id = $1`, bR.id).catch(() => [])) as Any[])[0]?.t ?? "");
      const pr = await call(pubMod, "publicReceipt", tok);
      const rc = pr?.ok === true ? pr.receipt : null;
      const r = await row(bR.id);
      if (!rc) p.push(`publicReceipt ${codeOf(pr)}`);
      else {
        const mb = Array.isArray(rc.memberBenefits) ? rc.memberBenefits : null;
        if (!mb || kindAmt(mb) !== WANT_R) p.push(`memberBenefits ${short(mb, 120)}`);
        if (rc.points?.earned !== r?.pointEarned || rc.points?.balance !== (await bal(X))) p.push(`points ${short(rc.points, 60)} (earned ${r?.pointEarned} · balance ${await bal(X)})`);
        const js = short(rc, 100_000);
        const leak = [NAME.X, snapName, `เปลี่ยนชื่อ ${TAGN}`, xCode, "089-xxx-5521", "0892145521"].filter((s) => s && js.includes(s));
        if (leak.length) p.push(`มีข้อมูลสมาชิก ${leak.length} ชิ้น (P1.11 R2)`);
      }
    }
    chk("R3", !bR.err && p.length === 0, "ใบเสร็จออนไลน์: สิทธิ์ตรงบิล · แต้มสด · ไม่มีข้อมูลส่วนตัว", FXB(NBJ(NB(bR), p)));
  }
  {
    const p: string[] = [];
    if (bR.id) {
      const d = await call(billsMod, "billDetail", ctxOf("A"), owner, { unitId: U.A, saleId: bR.id });
      const m = d?.ok === true ? d.bill?.member : null;
      const r = await row(bR.id);
      if (!isRecord(m)) p.push(`billDetail ${codeOf(d)} member ${short(m, 60)}`);
      else {
        if (m.name !== snapName) p.push(`name ${short(m.name, 40)} (คาดสำเนา)`);
        if (m.tierName !== "Gold") p.push(`tierName ${m.tierName}`);
        if (!Array.isArray(m.benefits) || kindAmt(m.benefits) !== WANT_R) p.push(`benefits ${short(m.benefits, 120)}`);
        if (m.pointsEarned !== r?.pointEarned) p.push(`pointsEarned ${m.pointsEarned} ≠ ${r?.pointEarned}`);
      }
    }
    chk("R4", !bR.err && p.length === 0, "BillDetail.member จากสำเนา + benefits", FXB(NBJ(NB(bR), p)));
  }
  if (X && !fx) await step("คืนชื่อ X", () => P.customer.update({ where: { id: X }, data: { name: NAME.X } }));
  {
    const p: string[] = [];
    const list = [bT1, bR, bPR, bX, bF, bP];
    for (const b of list) {
      if (!b.id) {
        p.push(`ไม่มีบิล ${b.k}`);
        continue;
      }
      if (!isRecord(b.snap0) || !isRecord(b.ben0)) {
        p.push(`${b.k} ไม่มีสำเนาตอน commit (${short(b.snap0, 30)} / ${short(b.ben0, 30)})`);
        continue;
      }
      const now = await snapOf(b.id);
      if (short(now.s, 4000) !== short(b.snap0, 4000)) p.push(`${b.k} memberSnapshot เปลี่ยน`);
      if (short(now.b, 4000) !== short(b.ben0, 4000)) p.push(`${b.k} memberBenefits เปลี่ยน`);
    }
    chk("R5", NCOL === "" && p.length === 0, "สำเนาไม่เปลี่ยนหลัง commit (6 บิล)", FXB(NCOL + joinP(p)));
  }
  // R6 — PDPA
  {
    const p: string[] = [];
    const E = C.E ?? "";
    const e1 = await sale("bE1", "A", { lines: [["น้ำ E P112", 1, 10_000]], memberId: E });
    const e2 = await sale("bE2", "A", { lines: [["ขนม E P112", 1, 12_000]], memberId: E });
    await drain();
    const keep = async (id: string) => {
      const r = await row(id);
      const s = await snapOf(id);
      return { money: short([r?.grandTotalSatang, r?.discountSatang, r?.vatSatang]), s: s.s, b: short(s.b, 4000) };
    };
    const before = e1.id && e2.id ? [await keep(e1.id), await keep(e2.id)] : [];
    const xBefore = await snapOf(bT1.id);
    if (!E) p.push("(ฟิกซ์เจอร์) ไม่มี E");
    else if (before.length === 2) {
      const er = await call(memMod, "eraseMemberById", T, E, { actorUserId: ownerId });
      if (er?.erased !== true) p.push(`eraseMemberById ${short(er, 60)}`);
      await drain(3);
      const check = async (tag: string) => {
        const after = [await keep(e1.id), await keep(e2.id)];
        after.forEach((a, i) => {
          const b0 = before[i]!;
          if (!isRecord(a.s) || a.s.name !== null || a.s.phoneMasked !== null) p.push(`${tag} บิล E${i + 1} name/phoneMasked ${short([a.s?.name, a.s?.phoneMasked], 60)} (คาด null)`);
          if (!isRecord(b0.s) || a.s?.tierKey !== b0.s.tierKey || a.s?.tierName !== b0.s.tierName || a.s?.memberCode !== b0.s.memberCode) p.push(`${tag} บิล E${i + 1} tier/memberCode เปลี่ยน`);
          if (a.b !== b0.b || a.money !== b0.money) p.push(`${tag} บิล E${i + 1} สิทธิ์/เงินเปลี่ยน`);
        });
      };
      await check("หลังลบ");
      p.push(...(await replay("member.erased", (pl) => pl.customerId === E)));
      await drain();
      await check("เล่นซ้ำ");
      if (short((await snapOf(bT1.id)).s, 4000) !== short(xBefore.s, 4000)) p.push("บิลของ X ถูกแตะ");
    }
    chk("R6", NCOL === "" && !e1.err && !e2.err && p.length === 0, "PDPA ล้างชื่อ/เบอร์ในสำเนา · เงิน/ระดับคง · idempotent", FXB(NCOL + NBJ(NB(e1) + NB(e2), p)));
  }

  // ════════ Z2 ทางเดิมของ createSale ════════
  {
    const p: string[] = [];
    if (fx || !gc?.number) p.push("(ฟิกซ์เจอร์) ไม่มีบัตรของขวัญ");
    else {
      const r = await call(svc, "createSale", {
        tenantId: T, unitId: U.A, systemId: S.POSA, pointSystemId: S.PTS, memberSystemId: S.MEM, memberId: X, idempotencyKey: `q112-${RAND}-legacy`,
        lines: [{ name: "ของ legacy P112", qty: 1, unitPriceSatang: 50_000 }],
        memberChoices: { points: 100, giftCard: { number: gc.number, pin: gc.pin, satang: 20_000 } },
        payMethods: [{ type: "CASH", amountSatang: 26_500 }],
      });
      if (r?.ok === false || r?.grandTotalSatang !== 26_500) p.push(`createSale เดิม → ${codeOf(r)} ${short(r?.message ?? r?.grandTotalSatang, 80)}`);
      else {
        const rw = await row(String(r.saleId));
        if (!rw?.giftCardTxnId) p.push("ไม่มี giftCardTxnId");
        const sn = await snapOf(String(r.saleId));
        if (sn.s !== null) p.push(`memberSnapshot ${short(sn.s, 60)} (คาด null — ผู้เรียกไม่ส่ง)`);
        const ls = linesOfBen(sn.b);
        if (kindAmt(ls) !== kindAmt([{ kind: "TIER", discountSatang: 2500 }, { kind: "POINTS", discountSatang: 1000 }, { kind: "GIFTCARD", discountSatang: 20_000 }]) || sn.b?.pointsBurned !== 100) p.push(`memberBenefits ${short(sn.b, 160)}`);
        if (sum(ls.map((l: Any) => Number(l.discountSatang))) !== (rw?.discountSatang ?? -1)) p.push(`Σ memberBenefits ≠ discountSatang ${rw?.discountSatang}`);
      }
      const w = await call(svc, "createSale", { tenantId: T, unitId: U.A, systemId: S.POSA, idempotencyKey: `q112-${RAND}-legacy-walk`, lines: [{ name: "walk-in legacy P112", qty: 1, unitPriceSatang: 3000 }], payMethods: [{ type: "CASH", amountSatang: 3000 }] });
      if (w?.ok === false || !w?.saleId) p.push(`walk-in createSale → ${codeOf(w)}`);
      else {
        const sn = await snapOf(String(w.saleId));
        if (sn.b !== null || sn.s !== null) p.push(`walk-in สำเนา ${short(sn, 80)} (คาด null)`);
      }
    }
    chk("Z2", NCOL === "" && p.length === 0, "createSale เดิม 26,500 · memberBenefits ทุกผู้เรียก · walk-in null", FXB(NCOL + joinP(p)));
  }

  // ════════ T5 ความเท่ากันของ quote กับบิล ════════
  {
    const p: string[] = [];
    const need = ["bT1", "bV", "bC", "bP", "bW", "bTB"];
    let n = 0;
    for (const k of [...need, "bT3", "bR", "bX", "bF", "bPR", "bG1"]) {
      const b = B[k];
      if (!b?.id) {
        if (need.includes(k)) p.push(`ไม่มีบิล ${k} (${b?.err ?? "ไม่ได้สร้าง"})`);
        continue;
      }
      const r = await row(b.id);
      const sv = r ? r.vatSatang : null;
      if (r?.grandTotalSatang !== b.q?.grandTotalSatang || sv !== b.q?.vatSatang) p.push(`${k} quote ${b.q?.grandTotalSatang}/${b.q?.vatSatang} ≠ บิล ${r?.grandTotalSatang}/${sv}`);
      n++;
    }
    if (n < 6) p.push(`เทียบได้ ${n} บิล (คาด ≥ 6)`);
    chk("T5", p.length === 0, "quote = บิล (ยอด + VAT) ทุกตะกร้าผสม", FXB(joinP(p)));
  }
  if (notes.length) console.log(`  ℹ️  ฟิกซ์เจอร์มีหมายเหตุ ${notes.length}: ${notes.slice(0, 6).join(" | ")}`);
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
  await P.$executeRawUnsafe(`UPDATE "Customer" SET "mergedIntoId" = NULL, "referredById" = NULL WHERE "tenantId" = $1`, T).catch(() => {});
  let pending = [...tables];
  for (let pass = 0; pass < 12 && pending.length; pass++) {
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
      const v = Number(await f());
      if (v) out.push(`${lbl}:${v}`);
    } catch (e) {
      out.push(`${lbl}:err ${(e as Error).message.slice(0, 40)}`);
    }
  };
  const since = new Date(RUN_START - 60_000);
  const like = `%${RAND}%`;
  await n("posSale", () => P.posSale.count({ where: { tenantId: { in: TIDS }, idempotencyKey: { contains: RAND } } }));
  await n("posDevice", () => P.posDevice.count({ where: { tenantId: { in: TIDS }, deviceCode: { contains: `qc112${RAND}` } } }));
  await n("customer", () => P.customer.count({ where: { tenantId: { in: TIDS }, name: { contains: RAND } } }));
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
// นอกขอบเขต P1.12 (S): จอ 01/02/02b/14A (P1.12U — visual ของผู้คุมงาน) · บัตรของขวัญเป็นวิธีชำระ (P2.9 · CD3) · แลกรางวัลใหม่เป็นบรรทัดบิล (CD6) ·
//   จอลูกค้า "ใกล้ได้รางวัล" (P2 · M9) · ราคาตามระดับต่อสินค้า (P2 · M4) · ชุดเงิน COMMON §7 + qc-member-m2.7/m2.8 + ORACLE-EDIT qc-pos-p1.3 S3.29/S3.42 (ผู้สร้างรัน)
