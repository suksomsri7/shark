// QC — POS RUN ใบ P1.2: ตัวเลือก · ตัวแปร (variant) · ชุด/คอมโบ · สินค้าชั่ง (บาร์โค้ดน้ำหนัก) · เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ
// requires: pos-seed
//
// สัญญา: ledger/pos-briefs/pos-brief-P1.2.md (§2 R1–R16 · §3 ร้านอาหาร · §6 P1–P7 ค่าปริยาย) · pos-brief-COMMON · pos-brief-LANE-RULES
//        โน้ต: ledger/wo-notes/pos-P1.2-oracle.md (รายการข้อ · ผลที่คาดบนฐาน · ชื่อที่ตั้งใหม่ · ความคลาดเคลื่อน)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้ และลงทะเบียนในโน้ตหัวข้อ "Names I had to invent" — ผู้คุมงานต้องรับรองก่อนผู้สร้างเริ่ม
//   ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P1.2 ต้องส่ง (ข้อสอบนี้คือสัญญา · ย่อจาก brief §2):
//   schema (เพิ่มล้วน): PosSaleLineOption {id tenantId saleId lineId choiceId groupId groupName choiceName priceDeltaSatang} ·
//     PosSaleLine.components Json? · PosSaleLine.weightGrams Int? · PosProduct.soldByWeight Boolean @default(false) · PosProduct.scalePlu String?
//   scan-shared.ts (บริสุทธิ์): ean13CheckDigit(first12) · weighedBarcodeSettings(appSystemSettings) → {enabled, rules[{prefix, kind}]} ·
//     parseWeighedBarcode(code, settings) → {prefix, itemCode, kind, grams|null, priceSatang|null} | null ·
//     weighedPriceSatang(grams, perKgSatang) · weighedGramsFromPrice(priceSatang, perKgSatang) (ปัดครึ่งขึ้นทั้งคู่)
//   register-shared.ts: cartAddProduct(cart, productId, key, options?: string[]) (+1 เฉพาะชุดตัวเลือกเดียวกัน · บรรทัดชั่งไม่รวม) ·
//     RegisterCartLine(product) + options? weighedBarcode? weightGrams? · cartToQuoteInput/quoteInputToCart พกต่อ ·
//     refusalMessageKey: OPTIONS_INVALID OPTION_UNAVAILABLE VARIANT_REQUIRED WEIGHT_REQUIRED → errors.optionsInvalid … (th+en)
//   register.ts: lines[].options [{choiceId}] · weighedBarcode · weightGrams · quote line + optionsSatang + options[] ·
//     RegisterProduct + parentId + variantCount · registerProductOptions(ctx, actor, {productId}) · scan น้ำหนัก (R11) · idempotency รวมตัวเลือก/น้ำหนัก (R14)
//   catalog.ts: createOptionGroup · setProductOptionGroups (MENU → MenuItemOptionGroup ด้วย) · setRecipe (BUNDLE) ·
//     createProduct/updateProduct รับ parentId · soldByWeight · scalePlu · listForUnit เติม variants
//   service.ts: createSale lines[] + options? components? weightGrams? · ตัดสต็อกส่วนประกอบชุด คีย์ pos-consume-<sale>-<line>-<invItem> ·
//     register-actions.ts registerProductOptionsAction · RegisterScreen: ป๊อปโอเวอร์ตัวเลือก/ตัวแปร (testid pos-reg-options-*)
//
// ขอบเขต: E บาร์โค้ดน้ำหนัก (บริสุทธิ์) · C ตะกร้า +1 (บริสุทธิ์) · S สถิต/ข้อความ · O ตัวเลือก · M ร้านอาหาร · V ตัวแปร · B ชุด ·
//   W สินค้าชั่ง · I idempotency · H บิลพัก · X ข้ามร้าน · P ความเข้ากันได้ P1.3 · R ปฏิเสธเป็นข้อมูล · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p1.5/1.6): SKIP เมื่อของ P1.2 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id โดยไม่แตะ DB · --no-db = รันเฉพาะข้อบริสุทธิ์/สถิต (E C S) โดยไม่โหลด env/prisma (exit 1 ถ้าแดง)
//    ตาราง/คอลัมน์ตรวจจาก Prisma DMMF + information_schema · ก่อนเขียนแถวแรกต้องเป็น host ep-frosty-lab (QC4) เท่านั้น
//    fixture ของตัวเลือก/ชุดสร้างด้วย Prisma ตรง (ตารางมีอยู่แล้ว) ⇒ บนฐานข้อ O/B แดงเพราะ "ฟีเจอร์ยังไม่มี" ไม่ใช่เพราะ fixture
//    แถวชั่วคราวติดป้าย `qc-p1.2-<rand>` ในสาขา/ระบบ sandbox ของร้าน QC กาแฟ (+ สาขา sandbox 1 แห่งในร้าน QC อาหาร) · ลบทั้งหมดใน finally
//    Z1 นับแถวก่อน/หลัง · Z2 ลายนิ้วมือแถวเดิม
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const SUITE = "qc-pos-p1.2";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id, X, หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: "-" = เชิงหน้าที่ · X1 idempotency · X2 ข้ามขอบเขต · X3 สิทธิ์ · X4 เงิน · X11 จอสัมผัส/แป้น (POS-MASTER-PLAN §3)
const CHECKS: [string, string, string][] = [];
const D = (id: string, x: string, title: string) => CHECKS.push([`P1.2-${id}`, x, title]);
// ── E บาร์โค้ดน้ำหนัก (บริสุทธิ์ · R10) ──
D("E1", "X4", "ean13CheckDigit: 400638133393→1 · 590123412345→7 · 300 รหัสสุ่มเท่าตัวอ้างอิง (น้ำหนัก 1/3 จากซ้าย) · คืน number");
D("E2", "X4", "parseWeighedBarcode WEIGHT (prefix 20): 20|12345|01234|C → {prefix 20, itemCode 12345, kind WEIGHT, grams 1234, priceSatang null} · 00005 → 5 กรัม");
D("E3", "X4", "parseWeighedBarcode PRICE (prefix 22): 22|12345|04321|C → {kind PRICE, priceSatang 4321, grams null}");
D("E4", "X4", "ปฏิเสธ = null: check digit ผิด · 12/14 หลัก · มีตัวอักษร · prefix ไม่อยู่ในกฎ · ปิดใช้ · weighedBarcodeSettings: {}/undefined = ปิด · กฎ prefix 30 / kind แปลก ถูกทิ้ง");
D("E5", "X4", "weighedPriceSatang(1234,35000)=43190 · (333,9999)=3330 · (500,1)=1 · (499,1)=0 · weighedGramsFromPrice(4321,35000)=123 · 500 คู่สุ่ม = ปัดครึ่งขึ้น");
// ── C ตะกร้า (บริสุทธิ์ · R13) ──
D("C1", "X4", "cartAddProduct +1 เฉพาะชุดตัวเลือกเดียวกัน (ไม่ขึ้นกับลำดับ · undefined≡[]) · ชุดต่าง/ไม่มีตัวเลือก = บรรทัดใหม่ · ไม่มีตัวเลือกยังรวมแบบเดิม · บรรทัดชั่งไม่รวม · ไม่แก้ตะกร้าที่ส่งเข้า");
D("C2", "-", "cartToQuoteInput ส่ง options [{choiceId}] · weighedBarcode · weightGrams · quoteInputToCart ไป-กลับคงครบ · บรรทัดไม่มีตัวเลือกไม่มีช่อง options ที่มีของ");
// ── S สถิต/ข้อความ ──
D("S1", "-", "refusalMessageKey: OPTIONS_INVALID OPTION_UNAVAILABLE VARIANT_REQUIRED WEIGHT_REQUIRED → errors.* · คีย์ errors.* + options.{title required optional pickUpTo confirm unavailable} + variants.title มี th+en · en ไม่มีอักษรไทย · options.* ใช้ในจอ");
D("S2", "X11", "[static · R16] pick เปิดตัวเลือก/ตัวแปร (optionGroupCount/variantCount) ไม่ toast optionsRequired · เรียก registerProductOptionsAction · cartAddProduct 4 อาร์กิวเมนต์ · testid pos-reg-options-dialog · pos-reg-option-/pos-reg-options-confirm/pos-reg-variant- ≥44px · action use server + catch");
D("S3", "-", "[static · F15.1] เขียน menuOptionGroup/menuOptionChoice/menuItemOptionGroup/posProductOptionGroup/recipeLine เฉพาะใน catalog.ts + catalog-legacy.ts");
// ── O ตัวเลือก (R1–R5 · R7) ──
D("O1", "X4", "quote ลาเต้ 5,500 + M (+1,000) + ไข่มุก (+500) → บรรทัด 7,000 · optionsSatang 1,500 · options[] 2 รายการ (choiceId groupId name priceDeltaSatang จากเซิร์ฟเวอร์)");
D("O2", "X4", "submit ×2 → PAID · บรรทัด @7,000 รวม 14,000 · PosSaleLineOption 2 แถวผูก lineId/saleId: ชื่อกลุ่ม/ตัวเลือก + priceDeltaSatang snapshot");
D("O3", "X4", "OPTIONS_REQUIRED (lineIndex · ไม่มียอด · ไม่มีบิล): ไม่ส่ง options · ส่งแต่ไม่เลือกกลุ่มบังคับ · กลุ่ม min 2 เลือก 1 · บรรทัดที่ 2 ผิด → lineIndex 1");
D("O4", "X4", "max: กลุ่ม max1 เลือก 2 → OPTIONS_INVALID · ท็อปปิ้ง max3 เลือก 4 → OPTIONS_INVALID · เลือก 3 → 8,200 · min2/max2 เลือก 2 → 3,000 · เลือก 3 → OPTIONS_INVALID");
D("O5", "X4", "OPTIONS_INVALID: ตัวเลือกของกลุ่มที่ไม่ได้ผูก · id ไม่มีจริง · VALIDATION: choiceId ซ้ำ · options ไม่ใช่ array · {} · คีย์แปลก · 21 รายการ · รายการกำหนดเองมี options");
D("O6", "X4", "client ปลอมราคา: unitPriceSatang 1 + priceDeltaSatang 0 + name ปลอม → quote 6,500 (ไม่ถูกเชื่อ) · submit expected 5,500 → PRICE_CHANGED ไม่มีบิล · expected 6,500 → PAID แถวตัวเลือก delta 1,000 ชื่อจริง");
D("O7", "X4", "delta ติดลบ: M + หวานน้อย (−500) → 6,000 · ราคาต่อหน่วยติดลบ → INVALID_LINE ไม่มียอด · ส่วนลดบรรทัด 10% คิดบนฐานรวมตัวเลือก: L 7,000 → ลด 700 รวม 6,300");
D("O8", "X4", "86 (isOutOfStock) → OPTION_UNAVAILABLE lineIndex 0 · ตัวเลือกเก็บถาวร → OPTIONS_INVALID · กลุ่มบังคับที่เก็บถาวร = ไม่บังคับแล้ว (ขายราคาฐาน)");
D("O9", "X4", "isDefault ไม่ถูกใส่ให้เอง: ชาไม่ส่ง options → 4,000 · optionsSatang 0 · options [] · ราคาเปิด + options → VALIDATION · ราคาเปิดอย่างเดียว 4,200 ยังได้");
D("O10", "-", "registerProductOptions: กลุ่มตามลำดับผูก (ขนาด ท็อปปิ้ง ความหวาน) · min/max · choices ไม่มีตัวที่เก็บถาวร · 86 = unavailable · isDefault · variants [] · สินค้าแม่: variants 2 (6,500 / สืบราคา 5,500) + กลุ่มของแม่ · ไม่มีจริง → PRODUCT_NOT_FOUND");
D("O11", "-", "ตัวเขียน: createOptionGroup (สาขาบน POS นี้) → แถว + ตัวเลือก · min>max → VALIDATION · สาขาไม่อยู่บน POS → NOT_FOUND · setProductOptionGroups ตามลำดับ · ซ้ำ = เท่าเดิม · กลุ่มใช้ร่วม: มอคค่า M+โอ๊ต 8,500 ลาเต้ M+ไข่มุก ยัง 7,000 · ตัวแปร → VALIDATION");
// ── M ร้านอาหาร (P1.1b) ──
D("M1", "X4", "อ่านสด: ร้านอาหารแก้ delta ไข่มุก 500→800 → quote ถัดไป 7,300 · บิล O2 ยัง snapshot 500 · 86 วิปที่ร้านอาหาร → OPTION_UNAVAILABLE ทันที");
D("M2", "-", "setProductOptionGroups บนแถว MENU ที่มี MenuItem คู่ → MenuItemOptionGroup = ชุดเดียวกัน (สาขาของเมนู) · ตั้งเป็น [] → ทั้งสองฝั่งว่าง");
// ── V ตัวแปร (R6) ──
D("V1", "-", "กริด registerCatalog: แม่มี variantCount 2 parentId null · ลูกไม่ขึ้นกริด/ค้นหา · catalog.listForUnit แม่ variants = [แดง, น้ำเงิน]");
D("V2", "-", "สแกนบาร์โค้ดลูก → one (ลูก · parentId แม่ · ราคา 6,500) · สแกนบาร์โค้ดแม่ → choose เฉพาะลูก 2 ตัว · ลูกไม่ตั้งราคา priceSatang 5,500 (สืบแม่)");
D("V3", "X4", "quote ลูกแดง + M → 7,500 · ลูกน้ำเงิน (สืบราคา) + M → 6,500 · ลูกไม่ส่งตัวเลือก → OPTIONS_REQUIRED (กลุ่มของแม่) · ขายแม่ตรง → VARIANT_REQUIRED");
D("V4", "X4", "submit ลูกแดง ×2 → บรรทัด productId ลูก · itemId = InvItem ของลูก · สต็อกลูกแดง 10→8 · ลูกน้ำเงิน 10 คงเดิม · OUT 1 แถว");
D("V5", "-", "ตัวเขียน: ลูกของลูก → VALIDATION · แม่เป็นชุด → VALIDATION · แม่อยู่ POS อื่น → NOT_FOUND · บาร์โค้ดชน → CONFLICT · เก็บแม่ถาวร → ลูก quote PRODUCT_NOT_FOUND · สแกน none");
// ── B ชุด/คอมโบ (R8) ──
D("B1", "-", "setRecipe ชุด: [CA×1, CB×3] → RecipeLine ตรง · ตั้งใหม่ [CA×2] แทนทั้งชุด · listForUnit recipe ตรง · qty 0 → VALIDATION · InvItem คลังที่ไม่ขายผ่าน POS นี้ → NOT_FOUND · บนสินค้า PRODUCT → VALIDATION");
D("B2", "X4", "ขายชุด ×2 + M → 2×16,900 = 33,800 (ราคาชุด ไม่ใช่ผลรวม) · itemId null · components snapshot [CA×1, CB×2] · สต็อก CA 20→18 · CB 20→16 · OUT 2 แถว คีย์ pos-consume-<sale>-<line>-<invItem>");
D("B3", "X4", "void บิลชุด → สต็อก CA/CB กลับ 20/20 · บิล VOIDED");
D("B4", "-", "registerStatus.pendingStockCount: บิลชุดที่ยังไม่ตัดส่วนประกอบ (createSale ใน tx ผู้เรียก) นับ +1 · สต็อกไม่ขยับ");
// ── W สินค้าชั่ง (R9 R11 R12) ──
D("W1", "-", "สแกนน้ำหนัก (เปิดตั้งค่า): 20|12345|01234 → one หมู + weighed {grams 1234, priceSatang 43,190} · check digit ผิด → none · บาร์โค้ดที่ลงทะเบียนตรงชนะ · PLU ไม่มี → none · ปิดตั้งค่า → none");
D("W2", "X4", "quote บรรทัดชั่ง: weighedBarcode → 43,190 (ราคาปลอม 1 ไม่ถูกเชื่อ) · qty 2 → INVALID_LINE · PLU ของสินค้าอื่น → VALIDATION · check digit ผิด → VALIDATION");
D("W3", "X4", "ป้ายฝังราคา (22): ราคา 4,321 ตรงตัว · quote ok");
D("W4", "X4", "submit ชั่ง: PosSaleLine.weightGrams 1234 qty 1 @43,190 itemId หมู · สต็อกกรัม 5000→3766 · ป้ายราคา → weightGrams 123 · สต็อก 3643");
D("W5", "X3", "soldByWeight ไม่มีน้ำหนัก → WEIGHT_REQUIRED · กรอกน้ำหนักเอง 500 g (เจ้าของ) → 17,500 · แคชเชียร์ไม่มี priceOverride → PERMISSION_DENIED · ส่งทั้งสองช่อง → VALIDATION · 0 g → INVALID_LINE");
// ── I idempotency (R14) ──
D("I1", "X1", "สองบรรทัดลาเต้ราคาเท่ากัน ตัวเลือกต่าง ([M,ไข่มุก] / [L]) → PAID · ส่งซ้ำคีย์เดิม สลับบรรทัด+สลับลำดับตัวเลือก → duplicated:true · บิลเดียว · แถวตัวเลือกตามบรรทัด");
D("I2", "X1", "คีย์เดิม ยอดเท่าเดิม แต่ตัวเลือกต่าง ([M,เจลลี่]/[L]) → IDEMPOTENCY_CONFLICT + saleId · ไม่ส่งตัวเลือกเลย → IDEMPOTENCY_CONFLICT · ยังบิลเดียว");
D("I3", "X1", "บรรทัดชั่ง: คีย์เดิม ป้ายเดิม → duplicated · ป้ายน้ำหนักอื่น → IDEMPOTENCY_CONFLICT");
// ── H บิลพัก (P1.5) ──
D("H1", "-", "พักตะกร้าที่มีตัวเลือก + บรรทัดชั่ง → เรียกคืน: options ชุดเดิม · weighedBarcode เดิม · quote 15,750");
// ── X ข้ามร้าน ──
D("X1", "X2", "ตัวเลือกของร้านอื่นบนลาเต้ → OPTIONS_INVALID · ผูกกลุ่มร้านอื่น → NOT_FOUND ลิงก์ไม่เปลี่ยน · ร้านอาหาร quote/registerProductOptions สินค้ากาแฟ → PRODUCT_NOT_FOUND · สแกนบาร์โค้ดลูกที่ร้านอาหาร → none");
// ── P ความเข้ากันได้ P1.3 ──
D("P1", "X1", "[P1.3 S3.26 คงเดิม] ลาเต้ไม่ส่ง options → OPTIONS_REQUIRED (quote+submit · ไม่มียอด/บิล) · ชาเลือกได้อย่างเดียว → 4,000 PAID · payload แบบ P1.3 ส่งซ้ำ → duplicated · กริด 3/1 และ 1/0");
// ── R ปฏิเสธเป็นข้อมูล ──
D("R1", "-", "คำปฏิเสธใหม่ (OPTIONS_INVALID OPTION_UNAVAILABLE VARIANT_REQUIRED WEIGHT_REQUIRED + OPTIONS_REQUIRED/VALIDATION ของตัวเลือก) = {ok:false, code, message} ไม่ throw");
// ── Z คืนสภาพ ──
D("Z1", "-", "QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ");
D("Z2", "-", "QC4 ลายนิ้วมือ: แถวเดิม (PosProduct PosCategory InvItem AppSystem AppSystemUnit BusinessUnit Membership PosReceiptCounter MenuOptionGroup MenuOptionChoice PosProductOptionGroup RecipeLine) ก่อน = หลัง");

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
  const full = id.startsWith("P1.2-") ? id : `P1.2-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
const skippedChecks = new Map<string, string>();
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
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : r && typeof r === "object" ? "OBJ" : "UNKNOWN");
const refused = (r: Any, codes: string[]) => r?.ok === false && codes.includes(String(r.code));
/** ปฏิเสธที่ "ไม่มียอด" (P1.3 S3) */
const noTotals = (r: Any) => r?.ok === false && r.grandTotalSatang === undefined && r.subtotalSatang === undefined && r.lines === undefined;
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  if (m) return m[1]!;
  return typeof o?.code === "string" && o.code ? o.code : "THROW";
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
const sameSet = (a: unknown, b: unknown[]) => Array.isArray(a) && a.length === b.length && [...a].map(String).sort().join("|") === [...b].map(String).sort().join("|");

// ── ซอร์ส (สถิต) ──
function walk(dir: string, out: string[] = []): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const f of readdirSync(abs)) {
    const rel = `${dir}/${f}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(tsx|ts)$/.test(f)) out.push(rel);
  }
  return out;
}
const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b`).test(src);
const blockAt = (src: string, at: number): [number, number] => {
  if (at < 0) return [-1, -1];
  const arrow = src.indexOf("=>", at);
  const open = src.indexOf("{", arrow >= 0 && arrow < at + 400 ? arrow : at);
  if (open < 0) return [-1, -1];
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return [open, i];
  }
  return [open, src.length];
};
const constBody = (src: string, name: string): string => {
  const k = src.search(new RegExp(`const\\s+${name}\\s*=`));
  if (k < 0) return "";
  const [a, b] = blockAt(src, k);
  return a < 0 ? "" : src.slice(a, b + 1);
};
const TOUCH = /(^|[\s"'`])(min-h-(1[1-9]|[2-9]\d)|h-(1[1-9]|[2-9]\d)|size-(1[1-9]|[2-9]\d)|min-h-\[(4[4-9]|[5-9]\d|\d{3})px\]|h-\[(4[4-9]|[5-9]\d|\d{3})px\]|touch-target|pos-touch)(?=$|[\s"'`])/;
const tagOf = (code: string, t: string): string => {
  const i = code.indexOf(t);
  if (i < 0) return "";
  const st = code.lastIndexOf("<", i);
  const en = code.indexOf(">", i);
  return st >= 0 && en > i ? code.slice(st, en + 1) : "";
};
/** จำนวนอาร์กิวเมนต์ระดับบนสุดของการเรียก name( … ) ทุกจุดในซอร์ส */
function argCounts(src: string, name: string): number[] {
  const out: number[] = [];
  const re = new RegExp(`\\b${name}\\s*\\(`, "g");
  for (const m of src.matchAll(re)) {
    let i = (m.index ?? 0) + m[0].length;
    let depth = 0;
    let n = 1;
    let empty = true;
    for (; i < src.length; i++) {
      const c = src[i]!;
      if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) {
        if (depth === 0) break;
        depth--;
      } else if (c === "," && depth === 0) n++;
      if (!/\s/.test(c)) empty = false;
    }
    out.push(empty ? 0 : n);
  }
  return out;
}
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
      /* ไฟล์พัง = คีย์หาย (S1 แดงเอง) */
    }
  }
  return keys;
}

// ── ตัวอ้างอิงของข้อสอบเอง (ไม่ใช้โค้ดของผู้สร้าง) ──
const refCd = (s12: string): number => {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (i % 2 === 0 ? 1 : 3) * Number(s12[i]);
  return (10 - (sum % 10)) % 10;
};
const ean = (s12: string) => `${s12}${refCd(s12)}`;
const badCd = (code: string) => `${code.slice(0, 12)}${(Number(code[12]) + 1) % 10}`;
/** ปัดครึ่งขึ้นของ num/den (num ≥ 0) */
const rhu = (num: number, den: number) => Math.floor((2 * num + den) / (2 * den));
let seed = 0x12121212;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const WB_SETTINGS = { pos: { weighedBarcode: { enabled: true, rules: [{ prefix: "20", kind: "WEIGHT" }, { prefix: "22", kind: "PRICE" }] } } };

const SCAN_FILE = "src/lib/modules/pos/scan-shared.ts";
const REG_SHARED_FILE = "src/lib/modules/pos/register-shared.ts";
const REG_FILE = "src/lib/modules/pos/register.ts";
const CAT_FILE = "src/lib/modules/pos/catalog.ts";
const ACT_FILE = "src/lib/modules/pos/register-actions.ts";
const RS_FILE = "src/components/pos/register/RegisterScreen.tsx";
const REG_UI_DIRS = ["src/components/pos/register", "src/app/app/sys/[id]/pos"];
const NEW_CODES: [string, string][] = [
  ["OPTIONS_INVALID", "errors.optionsInvalid"],
  ["OPTION_UNAVAILABLE", "errors.optionUnavailable"],
  ["VARIANT_REQUIRED", "errors.variantRequired"],
  ["WEIGHT_REQUIRED", "errors.weightRequired"],
];
const OPTION_KEYS = ["title", "required", "optional", "pickUpTo", "confirm", "unavailable"] as const;

// ═════════════════════════ 1. ข้อบริสุทธิ์/สถิต (ไม่แตะ DB · E C S) ═════════════════════════
const PURE_IDS = ["E1", "E2", "E3", "E4", "E5", "C1", "C2", "S1", "S2", "S3"].map((x) => `P1.2-${x}`);
async function runPure(): Promise<void> {
  console.log("\n── E C S ข้อบริสุทธิ์/สถิต (ไม่แตะ DB) ──");
  const scan = existsSync(join(ROOT, SCAN_FILE)) ? await tryImport("@/lib/modules/pos/scan-shared") : null;
  const rs = await tryImport("@/lib/modules/pos/register-shared");
  const settings = callSync(scan, "weighedBarcodeSettings", WB_SETTINGS);
  const parse = (code: string, st: unknown = settings) => callSync(scan, "parseWeighedBarcode", code, st);

  // E1
  {
    const p: string[] = [];
    const a = callSync(scan, "ean13CheckDigit", "400638133393");
    const b = callSync(scan, "ean13CheckDigit", "590123412345");
    if (a !== 1) p.push(`400638133393→${short(a, 40)}`);
    if (b !== 7) p.push(`590123412345→${short(b, 40)}`);
    let bad = 0;
    for (let i = 0; i < 300; i++) {
      const s12 = Array.from({ length: 12 }, () => Math.floor(rnd() * 10)).join("");
      if (callSync(scan, "ean13CheckDigit", s12) !== refCd(s12)) bad++;
    }
    if (bad) p.push(`สุ่มต่าง ${bad}/300`);
    chk("E1", p.length === 0, "1 · 7 · สุ่มตรงทุกตัว", p.join(" · ") || "ครบ");
  }
  // E2
  {
    const r = parse(ean("201234501234"));
    const r5 = parse(ean("201234500005"));
    const ok = r && r.prefix === "20" && r.itemCode === "12345" && r.kind === "WEIGHT" && r.grams === 1234 && (r.priceSatang === null || r.priceSatang === undefined) && r5?.grams === 5;
    chk("E2", ok, "{20, 12345, WEIGHT, 1234 g} · 5 g", `${short(r, 120)} · ${short(r5?.grams ?? r5, 40)} · settings ${short(settings, 80)}`);
  }
  // E3
  {
    const r = parse(ean("221234504321"));
    const ok = r && r.prefix === "22" && r.itemCode === "12345" && r.kind === "PRICE" && r.priceSatang === 4321 && (r.grams === null || r.grams === undefined);
    chk("E3", ok, "{22, 12345, PRICE, 4321}", short(r, 140));
  }
  // E4
  {
    const p: string[] = [];
    const good = ean("201234501234");
    const isNull = (v: Any) => v === null;
    const cases: [string, Any][] = [
      ["check digit ผิด", parse(badCd(good))],
      ["12 หลัก", parse(good.slice(0, 12))],
      ["14 หลัก", parse(`${good}0`)],
      ["มีตัวอักษร", parse(`${good.slice(0, 12)}A`)],
      ["prefix 21 ไม่อยู่ในกฎ", parse(ean("211234501234"))],
      ["ปิดใช้", parse(good, callSync(scan, "weighedBarcodeSettings", { pos: { weighedBarcode: { enabled: false, rules: WB_SETTINGS.pos.weighedBarcode.rules } } }))],
    ];
    for (const [l, v] of cases) if (!isNull(v)) p.push(`${l}:${short(v, 50)}`);
    const e0 = callSync(scan, "weighedBarcodeSettings", {});
    const eU = callSync(scan, "weighedBarcodeSettings", undefined);
    if (!(e0 && e0.enabled === false && Array.isArray(e0.rules) && e0.rules.length === 0)) p.push(`{}→${short(e0, 60)}`);
    if (!(eU && eU.enabled === false)) p.push(`undefined→${short(eU, 60)}`);
    const mal = callSync(scan, "weighedBarcodeSettings", { pos: { weighedBarcode: { enabled: true, rules: [{ prefix: "30", kind: "WEIGHT" }, { prefix: "23", kind: "VOLUME" }, { prefix: "24", kind: "WEIGHT" }] } } });
    if (!(mal && mal.enabled === true && Array.isArray(mal.rules) && mal.rules.length === 1 && mal.rules[0]?.prefix === "24")) p.push(`กฎผิดรูป→${short(mal, 80)}`);
    chk("E4", p.length === 0, "ทุกกรณี null · ปิด/ว่าง = disabled · ทิ้งกฎผิดรูป", p.join(" · ") || "ครบ");
  }
  // E5
  {
    const p: string[] = [];
    const wp = (g: number, k: number) => callSync(scan, "weighedPriceSatang", g, k);
    const wg = (s: number, k: number) => callSync(scan, "weighedGramsFromPrice", s, k);
    const fixed: [Any, number, string][] = [
      [wp(1234, 35000), 43190, "1234×35000"], [wp(333, 9999), 3330, "333×9999"], [wp(500, 1), 1, "500×1"], [wp(499, 1), 0, "499×1"],
      [wg(4321, 35000), 123, "4321/35000"], [wg(35000, 35000), 1000, "35000/35000"],
    ];
    for (const [v, e, l] of fixed) if (v !== e) p.push(`${l}=${short(v, 30)}≠${e}`);
    let bad = 0;
    for (let i = 0; i < 500; i++) {
      const g = 1 + Math.floor(rnd() * 99999);
      const k = 1 + Math.floor(rnd() * 200000);
      if (wp(g, k) !== rhu(g * k, 1000)) bad++;
    }
    if (bad) p.push(`สุ่มต่าง ${bad}/500`);
    chk("E5", p.length === 0, "ปัดครึ่งขึ้นทุกคู่", p.join(" · ") || "ครบ");
  }
  // C1
  {
    const p: string[] = [];
    const add = (c: Any, pid: string, k: string, o?: string[]) => (o === undefined ? callSync(rs, "cartAddProduct", c, pid, k) : callSync(rs, "cartAddProduct", c, pid, k, o));
    let c: Any = { lines: [] };
    c = add(c, "L", "k1", ["M", "P"]);
    c = add(c, "L", "k2", ["P", "M"]);
    const afterSame = c?.lines?.length === 1 && c.lines[0]?.qty === 2;
    if (!afterSame) p.push(`ชุดเดียวกันสลับลำดับไม่รวม: ${short(c?.lines, 80)}`);
    c = add(c, "L", "k3", ["L2", "P"]);
    if (c?.lines?.length !== 2) p.push(`ชุดต่างรวมเข้า (บรรทัด ${c?.lines?.length})`);
    c = add(c, "L", "k4");
    if (c?.lines?.length !== 3) p.push(`ไม่มีตัวเลือกรวมเข้าบรรทัดมีตัวเลือก (บรรทัด ${c?.lines?.length})`);
    c = add(c, "L", "k5", []);
    const k4 = (c?.lines ?? []).find((l: Any) => l.key === "k4");
    if (!(c?.lines?.length === 3 && k4?.qty === 2)) p.push(`[] ≢ undefined (k4 qty ${k4?.qty})`);
    const l1 = (c?.lines ?? []).find((l: Any) => l.key === "k1");
    if (!sameSet(l1?.options, ["M", "P"])) p.push(`บรรทัดไม่เก็บ options (${short(l1?.options, 40)})`);
    let t: Any = { lines: [] };
    t = add(t, "T", "t1");
    t = add(t, "T", "t2");
    if (!(t?.lines?.length === 1 && t.lines[0]?.qty === 2)) p.push("ไม่มีตัวเลือกไม่รวมแบบเดิม");
    const w0 = { lines: [{ key: "w", kind: "product", productId: "W", qty: 1, weighedBarcode: ean("201234501234") }] };
    const frozen = JSON.stringify(w0);
    const w1 = add(w0, "W", "w2");
    if (w1?.lines?.length !== 2) p.push("บรรทัดชั่งถูกรวม +1");
    if (JSON.stringify(w0) !== frozen) p.push("แก้ตะกร้าที่ส่งเข้า");
    chk("C1", p.length === 0, "รวมเฉพาะชุดเดียวกัน · ชั่งไม่รวม · ไม่ mutate", p.join(" · ") || "ครบ");
  }
  // C2
  {
    const p: string[] = [];
    const wb = ean("201234501234");
    const cart = {
      lines: [
        { key: "a", kind: "product", productId: "L", qty: 2, options: ["P", "M"] },
        { key: "b", kind: "product", productId: "W", qty: 1, weighedBarcode: wb },
        { key: "c", kind: "product", productId: "W", qty: 1, weightGrams: 250 },
        { key: "d", kind: "product", productId: "T", qty: 1 },
      ],
    };
    const q = callSync(rs, "cartToQuoteInput", cart);
    const L = (q?.lines ?? []) as Any[];
    const ids = (o: Any) => (Array.isArray(o) ? o.map((x: Any) => x?.choiceId) : null);
    if (!sameSet(ids(L[0]?.options), ["P", "M"])) p.push(`options ${short(L[0]?.options, 60)}`);
    if (L[1]?.weighedBarcode !== wb) p.push(`weighedBarcode ${short(L[1]?.weighedBarcode, 20)}`);
    if (L[2]?.weightGrams !== 250) p.push(`weightGrams ${short(L[2]?.weightGrams, 20)}`);
    if (Array.isArray(L[3]?.options) && L[3].options.length > 0) p.push("บรรทัดไม่มีตัวเลือกมี options");
    let n = 0;
    const back = q?.lines ? callSync(rs, "quoteInputToCart", q, () => `nk${++n}`) : null;
    const B = (back?.lines ?? []) as Any[];
    if (!sameSet(B[0]?.options, ["P", "M"])) p.push(`ไป-กลับ options ${short(B[0]?.options, 40)}`);
    if (B[1]?.weighedBarcode !== wb || B[2]?.weightGrams !== 250) p.push(`ไป-กลับ ชั่ง ${short([B[1]?.weighedBarcode, B[2]?.weightGrams], 60)}`);
    chk("C2", p.length === 0, "ส่ง/คืน options + ชั่ง ครบ", p.join(" · ") || "ครบ");
  }
  // S1
  {
    const th = posMessages("th");
    const en = posMessages("en");
    const thai = /[฀-๿]/;
    const p: string[] = [];
    const regUiCode = REG_UI_DIRS.flatMap((d) => walk(d)).map((f) => stripComments(rd(f))).join("\n");
    for (const [code, k] of NEW_CODES) {
      const mk = callSync(rs, "refusalMessageKey", code);
      if (mk !== k) p.push(`${code}→${short(mk, 30)}`);
    }
    const keys = [...NEW_CODES.map(([, k]) => k), ...OPTION_KEYS.map((k) => `options.${k}`), "variants.title"];
    for (const k of keys) {
      const full = `pos.register.${k}`;
      const t = th.get(full);
      const e = en.get(full);
      if (typeof t !== "string" || !t.trim()) p.push(`${k}: th ขาด`);
      if (typeof e !== "string" || !e.trim()) p.push(`${k}: en ขาด`);
      else if (thai.test(e)) p.push(`${k}: en มีอักษรไทย`);
      if (k.startsWith("options.") && !new RegExp(`["'\`]${k.replace(".", "\\.")}["'\`]`).test(regUiCode)) p.push(`${k}: ไม่ถูกใช้ในจอ`);
    }
    chk("S1", p.length === 0, `4 รหัส → คีย์ · ${keys.length} คีย์ th+en · ใช้ในจอ`, p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || "ครบ");
  }
  // S2
  {
    const p: string[] = [];
    const RS = stripComments(rd(RS_FILE));
    const regUiCode = REG_UI_DIRS.flatMap((d) => walk(d)).map((f) => stripComments(rd(f))).filter((s) => s.includes("pos-reg-")).join("\n");
    const pick = constBody(RS, "pick");
    if (!pick) p.push("ไม่มี const pick");
    else {
      if (/errors\.optionsRequired/.test(pick)) p.push("pick ยัง toast errors.optionsRequired");
      if (!/optionGroupCount/.test(pick) || !/variantCount/.test(pick)) p.push("pick ไม่ตัดสินด้วย optionGroupCount + variantCount");
    }
    if (!/registerProductOptionsAction\s*\(/.test(regUiCode)) p.push("จอไม่เรียก registerProductOptionsAction");
    const counts = argCounts(regUiCode, "cartAddProduct");
    if (!counts.some((n) => n === 4)) p.push(`cartAddProduct ไม่มีการเรียกพร้อมตัวเลือก (อาร์กิวเมนต์ ${counts.join(",") || "-"})`);
    if (!regUiCode.includes("pos-reg-options-dialog")) p.push("ไม่มี pos-reg-options-dialog");
    for (const t of ["pos-reg-option-", "pos-reg-options-confirm", "pos-reg-variant-"]) {
      const tag = tagOf(regUiCode, t);
      if (!tag) p.push(`ไม่มี ${t}`);
      else if (!TOUCH.test(tag)) p.push(`${t} ไม่มีคลาส ≥44px`);
    }
    const actRaw = rd(ACT_FILE);
    const act = stripComments(actRaw);
    if (!/^\s*["']use server["']/.test(actRaw.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, ""))) p.push("actions ไม่มี use server");
    const at = act.search(/export\s+async\s+function\s+registerProductOptionsAction\b/);
    if (at < 0) p.push("ไม่มี registerProductOptionsAction");
    else {
      const body = act.slice(at).split(/\n\s*export\s+/)[0] ?? "";
      if (!/\bregisterProductOptions\s*\(/.test(body)) p.push("action ไม่เรียก registerProductOptions");
      if (!/\bcatch\b/.test(body)) p.push("action ไม่มี catch");
      if (/\bthrow\b/.test(body)) p.push("action มี throw");
    }
    chk("S2", p.length === 0, "ป๊อปโอเวอร์จริง · action · ≥44px · cartAddProduct+ตัวเลือก", p.join(" · ") || "ครบ");
  }
  // S3
  {
    const re = /\.(menuOptionGroup|menuOptionChoice|menuItemOptionGroup|posProductOptionGroup|recipeLine)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/;
    const bad = walk("src").filter((f) => !/src\/lib\/modules\/pos\/catalog(-legacy)?\.ts$/.test(f)).filter((f) => re.test(stripComments(rd(f))));
    chk("S3", bad.length === 0, "0 ไฟล์นอก catalog*.ts", bad.length ? bad.join(", ") : "0 ไฟล์");
  }
}

const skipReasons: string[] = [];
const scanSrc = stripComments(rd(SCAN_FILE));
const catSrc = stripComments(rd(CAT_FILE));
const regSrc = stripComments(rd(REG_FILE));
for (const f of ["parseWeighedBarcode", "ean13CheckDigit", "weighedBarcodeSettings"]) if (!exportsFn(scanSrc, f)) skipReasons.push(`${SCAN_FILE} ยังไม่มี export ${f} (R10)`);
for (const f of ["createOptionGroup", "setProductOptionGroups", "setRecipe"]) if (!exportsFn(catSrc, f)) skipReasons.push(`${CAT_FILE} ยังไม่มี export ${f} (R5/R8)`);
if (!exportsFn(regSrc, "registerProductOptions")) skipReasons.push(`${REG_FILE} ยังไม่มี export registerProductOptions (R7)`);

// ═════════════════════════ 1b. --no-db ═════════════════════════
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${PURE_IDS.length} ข้อบริสุทธิ์/สถิต (ไม่ผ่านด่าน SKIP · ข้อ O M V B W I H X P R Z ต้องใช้ DB)`);
  if (skipReasons.length) console.log(`   (ของ P1.2 ที่ยังขาด: ${skipReasons.join(" | ")})`);
  let crashedS = "";
  try {
    await runPure();
  } catch (e) {
    crashedS = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
    console.log(`💥 harness: ${crashedS}`);
  }
  for (const id of PURE_IDS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashedS ? `ไม่ถึง (harness ล้ม: ${crashedS.slice(0, 80)})` : "ไม่ถึง");
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

// ═════════════════════════ 3. ด่าน SKIP (ตาราง/คอลัมน์ + ของ P1.2) ═════════════════════════
const { prisma } = (await import("@/lib/core/db")) as Any;
const P = prisma as Any;
const prismaPkg = (await import("@prisma/client")) as Any;
const DMMF = ((prismaPkg?.Prisma ?? prismaPkg?.default?.Prisma)?.dmmf?.datamodel ?? { models: [] }) as { models: { name: string; fields: { name: string }[] }[] };
const dbCols = new Set<string>();
try {
  const rows = (await P.$queryRawUnsafe(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('PosSaleLine','PosProduct','PosSaleLineOption')`,
  )) as Any[];
  for (const r of rows) dbCols.add(`${r.table_name}.${r.column_name}`);
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
const hasField = (model: string, field: string) => (DMMF.models.length ? !!DMMF.models.find((m) => m.name === model)?.fields.some((f) => f.name === field) : dbCols.has(`${model}.${field}`));
const NEW_COLS: [string, string][] = [
  ["PosSaleLine", "components"], ["PosSaleLine", "weightGrams"], ["PosProduct", "soldByWeight"], ["PosProduct", "scalePlu"],
  ...(["id", "tenantId", "saleId", "lineId", "choiceId", "groupId", "groupName", "choiceName", "priceDeltaSatang"].map((f) => ["PosSaleLineOption", f]) as [string, string][]),
];
const missCols = NEW_COLS.filter(([m, f]) => !hasField(m, f) || !dbCols.has(`${m}.${f}`));
if (missCols.length) skipReasons.push(`schema P1.2 ขาด: ${missCols.map(([m, f]) => `${m}.${f}(client ${hasField(m, f) ? "✓" : "✗"} · DB ${dbCols.has(`${m}.${f}`) ? "✓" : "✗"})`).join(" ")}`);
const LO: Any = typeof P.posSaleLineOption?.findMany === "function" ? P.posSaleLineOption : null;

let scope: Any = null;
let restoScope: Any = null;
try {
  scope = await envMod.resolvePosScope(prisma, "coffee");
  restoScope = await envMod.resolvePosScope(prisma, "resto");
} catch (e) {
  console.log(`  (resolvePosScope ล้ม: ${(e as Error).message.slice(0, 120)})`);
}
if (!scope) skipReasons.push("ชุดข้อมูล QC POS (ร้านกาแฟ) ยังไม่ถูก seed บน DB นี้ — รัน scripts/seed-pos-qc.mts ก่อน");
if (!restoScope) skipReasons.push("ชุดข้อมูล QC POS (ร้านอาหาร) ยังไม่ถูก seed — ข้อ X1 ต้องใช้");

const COUNT_MODELS = [
  "posSale", "posSaleLine", "posPayment", "posSaleLineOption", "posReceiptCounter", "posHeldCart", "outboxEvent", "auditLog",
  "invItem", "invMovement", "invLocationStock", "accountJournalEntry", "pointLedger",
  "appSystem", "appSystemUnit", "businessUnit", "posProduct", "posCategory", "recipeLine", "posProductOptionGroup",
  "menuOptionGroup", "menuOptionChoice", "menuItemOptionGroup", "menuItem", "menuCategory", "kdsStation",
] as const;
const FP_MODELS = ["posProduct", "posCategory", "invItem", "appSystem", "appSystemUnit", "businessUnit", "membership", "posReceiptCounter", "menuOptionGroup", "menuOptionChoice", "posProductOptionGroup", "recipeLine"] as const;
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
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P1.2 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง)`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อมูล: seed ร้านกาแฟ ${scope ? "มี" : "ไม่มี"} · seed ร้านอาหาร ${restoScope ? "มี" : "ไม่มี"} · ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)`);
  console.log(`   A5 (อ่านอย่างเดียว) จำนวนแถวร้าน QC POS: ${JSON.stringify(countsBefore)}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length, seed: { coffee: !!scope, resto: !!restoScope }, a5: countsBefore })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด: ${skipReasons.join(" | ")} (คาด: แดงตามเหตุผล ไม่ crash)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const register = await tryImport("@/lib/modules/pos/register");
const catalog = await tryImport("@/lib/modules/pos/catalog");
const service = await tryImport("@/lib/modules/pos/service");
const held = await tryImport("@/lib/modules/pos/held-cart");
const inventory = await tryImport("@/lib/modules/inventory/service");
const sysSvc = await tryImport("@/lib/modules/system/service");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p1.2-${RAND}`;
const KTAG = TAG.replace(/[^A-Za-z0-9_-]/g, "_");
const keyIn = (k: string) => ({ in: [k, `reg2:${k}`] });
const runStart = new Date();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ═════════════════════════ 5. ข้อที่ต้องมี DB (sandbox) ═════════════════════════
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !PURE_IDS.includes(id) && id !== "P1.2-Z1" && id !== "P1.2-Z2");
const sb = {
  unitIds: [] as string[], restoUnitIds: [] as string[], systemIds: [] as string[], invSysIds: [] as string[],
  productIds: [] as string[], invItemIds: [] as string[], groupIds: [] as string[],
};
class Rollback {
  constructor(public r: Any) {}
}
/** createSale ใน tx ของข้อสอบ (ไม่ตัดสต็อกหลัง commit · ลบ event PAID ก่อน commit) — ผลไม่ ok = ย้อน */
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

async function runDb() {
  if (!scope) {
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

  // ─── sandbox (เขียนแถวแรก ⇒ ด่าน host QC4 ก่อน) ───
  assertQc4BeforeWrite();
  console.log(`\n── sandbox ${TAG} (สาขา + ระบบ POS/คลัง ชั่วคราวในร้าน QC กาแฟ · สาขา 1 แห่งในร้าน QC อาหาร) ──`);
  const mkUnit = async (label: string, type = "SHOP", tenantId = tid) => {
    const u = await P.businessUnit.create({ data: { tenantId, type, name: `${TAG} ${label}`, slug: `${TAG}-${label}` } });
    (tenantId === tid ? sb.unitIds : sb.restoUnitIds).push(u.id);
    return u.id as string;
  };
  const mkSys = async (type: string, label: string) => {
    const s = await P.appSystem.create({ data: { tenantId: tid, type, name: `${TAG} ${label}` } });
    sb.systemIds.push(s.id);
    if (type === "INVENTORY") sb.invSysIds.push(s.id);
    return s.id as string;
  };
  let fx = "";
  let uS = "", uZ = "", uR = "", uRT = "", posS = "", posO = "", invS = "", invZ = "";
  try {
    uS = await mkUnit("s"); // สาขาขายหลัก (POS-S + คลัง INV-S)
    uZ = await mkUnit("z"); // สาขาในร้านเดียวกันที่ไม่อยู่บน POS-S (กลุ่มของสาขานี้ผูกไม่ได้)
    uR = await mkUnit("r", "RESTAURANT"); // ร้านอาหาร sandbox บน POS-S (M2)
    uRT = await mkUnit("rt", "SHOP", restoTid); // ร้าน QC อาหาร: กลุ่มตัวเลือกของร้านอื่น (X1)
    posS = await mkSys("POS", "POS-S");
    posO = await mkSys("POS", "POS-O"); // POS อื่นของร้านเดียวกัน (V5)
    invS = await mkSys("INVENTORY", "INV-S");
    invZ = await mkSys("INVENTORY", "INV-Z"); // คลังที่ไม่ขายผ่าน POS-S (B1)
    await sysSvc.linkUnit(tid, posS, uS);
    await sysSvc.linkUnit(tid, invS, uS);
    await sysSvc.linkUnit(tid, posS, uR);
    await sysSvc.linkUnit(tid, posO, uZ);
    await sysSvc.linkUnit(tid, invZ, uZ);
  } catch (e) {
    fx = `sandbox:${(e as Error).message.slice(0, 120)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const ctxS = { tenantId: tid, systemId: posS, unitId: uS };
  const ctxR = { tenantId: restoTid, systemId: PQC.resto.systems.POS.id, unitId: PQC.resto.units.main.id };
  const cashier = actor(mCash, PQC.coffee.users.cashier.userId, "STAFF", { role: "STAFF", unitAccess: [uS], permissions: { "pos.sale.create": true } });
  const SYSTEM_ACTOR: unknown = catalog?.CATALOG_SYSTEM_ACTOR ?? owner.userId;
  const cctx = { tenantId: tid, systemId: posS, actorUserId: SYSTEM_ACTOR };
  const cctxO = { tenantId: tid, systemId: posO, actorUserId: SYSTEM_ACTOR };
  const invCtx = { tenantId: tid, systemId: invS };
  const idOf = (r: Any): string | null => (typeof r === "string" ? r : r?.ok === false ? null : (r?.id ?? r?.product?.id ?? null));
  const must = (label: string, r: Any): Any => {
    if (r?.ok === false) throw Object.assign(new Error(`${label} ล้ม: ${codeOf(r)} ${short(r?.message ?? "", 80)}`), { code: r.code });
    return r;
  };
  const mkProd = async (input: Any, c: Any = cctx): Promise<string> => {
    const r = must("createProduct", await call(catalog, "createProduct", c, input));
    const id = idOf(r);
    if (!id) throw new Error(`createProduct ไม่คืน id: ${short(r)}`);
    sb.productIds.push(id);
    return id;
  };
  const mkInv = async (sku: string, name: string, stock: number, ctxI: Any = invCtx) => {
    const it = await inventory.createItem(ctxI, { sku: `${TAG}-${sku}`, name, costSatang: 100 });
    sb.invItemIds.push(it.id);
    if (stock > 0) await inventory.receive(ctxI, { itemId: it.id, qty: stock, costSatang: 100, idempotencyKey: `${TAG}-recv-${sku}` });
    return it.id as string;
  };
  const mkTracked = async (sku: string, name: string, price: number, stock: number) => {
    const inv = await mkInv(sku, name, stock);
    const r = must("ensureForInvItem", await call(catalog, "ensureForInvItem", cctx, inv));
    const id = idOf(r);
    if (!id) throw new Error(`ensureForInvItem ไม่คืน id: ${short(r)}`);
    sb.productIds.push(id);
    must("setPrice", await call(catalog, "setPrice", cctx, id, price));
    return { id, inv };
  };
  type G = { id: string; c: Record<string, string> };
  const mkGroup = async (unitId: string, name: string, min: number, max: number, choices: [string, number, Any?][], tenantId = tid): Promise<G> => {
    const g = await P.menuOptionGroup.create({ data: { tenantId, unitId, name: `${TAG} ${name}`, minSelect: min, maxSelect: max } });
    sb.groupIds.push(g.id);
    const c: Record<string, string> = {};
    let i = 0;
    for (const [n, d, x] of choices) c[n] = (await P.menuOptionChoice.create({ data: { tenantId, unitId, groupId: g.id, name: n, priceDelta: d, sortOrder: i++, ...(x ?? {}) } })).id;
    return { id: g.id, c };
  };
  const link = (productId: string, groupId: string, sortOrder: number) => P.posProductOptionGroup.create({ data: { tenantId: tid, productId, groupId, sortOrder } });
  const NONE: G = { id: "", c: {} };

  // ─── fixture ตัวเลือก (Prisma ตรง — ตารางมีอยู่แล้ว) ───
  let SIZE = NONE, TOP = NONE, SWEET = NONE, SAUCE = NONE, FOREIGN = NONE, NEG = NONE, REQA = NONE, ZG = NONE, RT = NONE;
  let LATTE = "", MOCHA = "", TEA = "", SAUCEP = "", CHEAP = "", NOPRICE = "", PLAIN = "", TEA2 = "";
  try {
    if (!fx) {
      SIZE = await mkGroup(uS, "ขนาด", 1, 1, [["S", 0], ["M", 1000], ["L", 1500]]);
      TOP = await mkGroup(uS, "ท็อปปิ้ง", 0, 3, [["PEARL", 500], ["JELLY", 500, { isDefault: true }], ["WHIP", 700], ["CHEESE", 900], ["OREO", 600, { isOutOfStock: true }], ["CHOC", 400, { archivedAt: new Date() }]]);
      SWEET = await mkGroup(uS, "ความหวาน", 0, 1, [["LESS", -500], ["NORMAL", 0]]);
      SAUCE = await mkGroup(uS, "ซอส", 2, 2, [["A", 0], ["B", 0], ["C", 0]]);
      FOREIGN = await mkGroup(uS, "ไม่ได้ผูก", 0, 1, [["X", 100]]);
      NEG = await mkGroup(uS, "ลดราคา", 0, 1, [["NEG", -500]]);
      REQA = await mkGroup(uS, "บังคับเก็บถาวร", 1, 1, [["Q", 0]]);
      ZG = await mkGroup(uZ, "สาขาอื่น", 0, 1, [["Z", 0]]);
      RT = await mkGroup(uRT, "ร้านอื่น", 0, 1, [["R", 100]], restoTid);
      LATTE = await mkProd({ name: `${TAG} ลาเต้`, kind: "PRODUCT", basePriceSatang: 5500 });
      MOCHA = await mkProd({ name: `${TAG} มอคค่า`, kind: "PRODUCT", basePriceSatang: 6000 });
      TEA = await mkProd({ name: `${TAG} ชา`, kind: "PRODUCT", basePriceSatang: 4000 });
      TEA2 = await mkProd({ name: `${TAG} ชาสอง`, kind: "PRODUCT", basePriceSatang: 4000 });
      SAUCEP = await mkProd({ name: `${TAG} เฟรนช์ฟรายส์`, kind: "PRODUCT", basePriceSatang: 3000 });
      CHEAP = await mkProd({ name: `${TAG} ลูกอม`, kind: "PRODUCT", basePriceSatang: 300 });
      NOPRICE = await mkProd({ name: `${TAG} ไม่มีราคา`, kind: "PRODUCT" });
      PLAIN = await mkProd({ name: `${TAG} น้ำเปล่า`, kind: "PRODUCT", basePriceSatang: 2500 });
      await link(LATTE, SIZE.id, 0);
      await link(LATTE, TOP.id, 1);
      await link(LATTE, SWEET.id, 2);
      await link(TEA, TOP.id, 0);
      await link(TEA2, REQA.id, 0);
      await link(SAUCEP, SAUCE.id, 0);
      await link(CHEAP, NEG.id, 0);
      await link(NOPRICE, TOP.id, 0);
      await P.menuOptionGroup.update({ where: { id: REQA.id }, data: { archivedAt: new Date() } });
    }
  } catch (e) {
    fx ||= `option-fixture:${(e as Error).message.slice(0, 100)}`;
  }
  const FX = (s: string, extra = "") => (fx ? `fixture:${fx} · ` : "") + (extra ? `fixture:${extra} · ` : "") + s;

  let keyN = 0;
  const key = (label: string) => `${KTAG}-${label}-${++keyN}`.replace(/[^A-Za-z0-9_-]/g, "_");
  const saleByKey = async (k: string) => P.posSale.findFirst({ where: { tenantId: tid, idempotencyKey: keyIn(k) }, include: { lines: { orderBy: { id: "asc" } }, payments: true } });
  const salesByKey = async (k: string) => P.posSale.count({ where: { tenantId: tid, idempotencyKey: keyIn(k) } });
  const optRows = async (saleId: string | undefined): Promise<Any[]> => (LO && saleId ? LO.findMany({ where: { saleId }, orderBy: { id: "asc" } }).catch(() => []) : []);
  const onHandOf = async (id: string) => Number((await P.invItem.findUnique({ where: { id }, select: { onHand: true } }))?.onHand ?? NaN);
  const outMoves = async (saleId: string) => P.invMovement.findMany({ where: { tenantId: tid, refId: saleId, type: "OUT" } });
  const withDefaults = (input: Any): Any => {
    const pm = (Array.isArray(input?.payMethods) ? input.payMethods : []) as Any[];
    const sum = pm.reduce((t: number, p: Any) => t + (Number(p?.amountSatang) || 0), 0);
    const cash = pm.filter((p) => p?.type === "CASH").reduce((t: number, p: Any) => t + (Number(p?.amountSatang) || 0), 0);
    return { ...input, ...("expectedGrandTotalSatang" in input ? {} : { expectedGrandTotalSatang: sum }), ...("cashReceivedSatang" in input || cash === 0 ? {} : { cashReceivedSatang: cash }) };
  };
  const sub = (a: Any, input: Any, c: Any = ctxS) => call(register, "submitRegisterSale", c, a, withDefaults(input));
  const quote = (a: Any, input: Any, c: Any = ctxS) => call(register, "quoteRegisterCart", c, a, input);
  const pay = (amt: number) => [{ type: "CASH", amountSatang: amt }];
  const o = (...ids: string[]) => ids.map((choiceId) => ({ choiceId }));
  const L0 = (q: Any): Any => (q?.lines ?? [])[0] ?? {};
  const dataRefusals: [string, Any, string][] = [];
  const asData = (label: string, r: Any, code: string) => dataRefusals.push([label, r, code]);

  // ════════ P1 ความเข้ากันได้ P1.3 (ก่อนข้ออื่น — ไม่ขึ้นกับฟีเจอร์ใหม่) ════════
  console.log("\n── P ความเข้ากันได้ P1.3 ──");
  {
    const p: string[] = [];
    const q1 = await quote(owner, { lines: [{ productId: LATTE, qty: 1 }] });
    if (!(refused(q1, ["OPTIONS_REQUIRED"]) && noTotals(q1) && q1.lineIndex === 0)) p.push(`ลาเต้ quote ${codeOf(q1)}/${noTotals(q1)}/li${q1?.lineIndex}`);
    const k1 = key("p1-req");
    const s1 = await sub(owner, { idempotencyKey: k1, lines: [{ productId: LATTE, qty: 1 }], payMethods: pay(5500) });
    if (!refused(s1, ["OPTIONS_REQUIRED"]) || (await saleByKey(k1))) p.push(`ลาเต้ submit ${codeOf(s1)}`);
    const q2 = await quote(owner, { lines: [{ productId: TEA, qty: 1 }] });
    const k2 = key("p1-tea");
    const s2 = q2?.ok ? await sub(owner, { idempotencyKey: k2, lines: [{ productId: TEA, qty: 1 }], payMethods: pay(q2.grandTotalSatang) }) : q2;
    const sale2 = await saleByKey(k2);
    if (!(q2?.ok === true && L0(q2).unitPriceSatang === 4000 && s2?.ok === true && sale2?.lines?.[0]?.unitPriceSatang === 4000 && sale2?.lines?.[0]?.productId === TEA)) p.push(`ชา ${codeOf(q2)} @${L0(q2).unitPriceSatang} ${codeOf(s2)} @${sale2?.lines?.[0]?.unitPriceSatang}`);
    const k3 = key("p1-legacy");
    const inp = { idempotencyKey: k3, lines: [{ productId: PLAIN, qty: 2 }, { name: "ค่าห่อ", qty: 1, unitPriceSatang: 500 }], payMethods: pay(5500) };
    const a3 = await sub(owner, inp);
    const b3 = await sub(owner, inp);
    if (!(a3?.ok === true && b3?.ok === true && b3.duplicated === true && b3.saleId === a3.saleId && (await salesByKey(k3)) === 1)) p.push(`payload P1.3 ซ้ำ ${codeOf(a3)}/${codeOf(b3)} dup ${b3?.duplicated}`);
    const cat = await call(register, "registerCatalog", ctxS, owner, { limit: 500 });
    const byId = new Map(((cat?.products ?? []) as Any[]).map((x) => [x.id, x]));
    const lt = byId.get(LATTE);
    const te = byId.get(TEA);
    if (!(lt?.optionGroupCount === 3 && lt?.requiredOptionGroupCount === 1 && te?.optionGroupCount === 1 && te?.requiredOptionGroupCount === 0)) p.push(`กริด ลาเต้ ${lt?.optionGroupCount}/${lt?.requiredOptionGroupCount} ชา ${te?.optionGroupCount}/${te?.requiredOptionGroupCount}`);
    chk("P1", p.length === 0, "S3.26 คงเดิม · ชา 4,000 · ซ้ำ = duplicated · กริด 3/1 1/0", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ O ตัวเลือก ════════
  console.log("\n── O ตัวเลือก ──");
  let saleO2: Any = null;
  {
    const q = await quote(owner, { lines: [{ productId: LATTE, qty: 1, options: o(SIZE.c.M!, TOP.c.PEARL!) }] });
    const l = L0(q);
    const opts = (Array.isArray(l.options) ? l.options : []) as Any[];
    const m = opts.find((x) => x?.choiceId === SIZE.c.M);
    const pe = opts.find((x) => x?.choiceId === TOP.c.PEARL);
    const ok = q?.ok === true && q.grandTotalSatang === 7000 && l.unitPriceSatang === 7000 && l.optionsSatang === 1500 && opts.length === 2
      && m?.groupId === SIZE.id && m?.priceDeltaSatang === 1000 && typeof m?.name === "string" && pe?.groupId === TOP.id && pe?.priceDeltaSatang === 500;
    chk("O1", ok, "7,000 · optionsSatang 1,500 · options 2 ตรง", FX(`${codeOf(q)} g${q?.grandTotalSatang} u${l.unitPriceSatang} o${l.optionsSatang} ${short(opts, 120)}`));
  }
  {
    const k = key("o2");
    const r = await sub(owner, { idempotencyKey: k, lines: [{ productId: LATTE, qty: 2, options: o(SIZE.c.M!, TOP.c.PEARL!) }], payMethods: pay(14000) });
    saleO2 = await saleByKey(k);
    const line = saleO2?.lines?.[0];
    const rows = await optRows(saleO2?.id);
    const rm = rows.find((x) => x.choiceId === SIZE.c.M);
    const rp = rows.find((x) => x.choiceId === TOP.c.PEARL);
    const ok = r?.ok === true && saleO2?.status === "PAID" && saleO2?.grandTotalSatang === 14000 && line?.unitPriceSatang === 7000 && line?.lineTotalSatang === 14000 && line?.productId === LATTE
      && rows.length === 2 && rows.every((x) => x.lineId === line?.id && x.saleId === saleO2.id && x.tenantId === tid)
      && rm?.groupId === SIZE.id && rm?.groupName === `${TAG} ขนาด` && rm?.choiceName === "M" && rm?.priceDeltaSatang === 1000 && rp?.choiceName === "PEARL" && rp?.priceDeltaSatang === 500;
    chk("O2", ok, "PAID 14,000 · @7,000 · 2 แถวตัวเลือก snapshot", FX(`${codeOf(r)} ${saleO2?.status} g${saleO2?.grandTotalSatang} @${line?.unitPriceSatang} แถว ${LO ? rows.length : "ไม่มีตาราง"} ${short(rows.map((x) => [x.choiceName, x.priceDeltaSatang, x.groupName]), 100)}`));
  }
  {
    const p: string[] = [];
    const a = await quote(owner, { lines: [{ productId: LATTE, qty: 1 }] });
    const b = await quote(owner, { lines: [{ productId: LATTE, qty: 1, options: o(TOP.c.PEARL!) }] });
    const c = await quote(owner, { lines: [{ productId: SAUCEP, qty: 1, options: o(SAUCE.c.A!) }] });
    const d = await quote(owner, { lines: [{ productId: PLAIN, qty: 1 }, { productId: LATTE, qty: 1, options: o(SWEET.c.LESS!) }] });
    const k = key("o3");
    const e = await sub(owner, { idempotencyKey: k, lines: [{ productId: LATTE, qty: 1, options: o(TOP.c.PEARL!) }], payMethods: pay(6000) });
    asData("ไม่เลือกกลุ่มบังคับ", b, "OPTIONS_REQUIRED");
    for (const [l, r, li] of [["ไม่ส่ง", a, 0], ["ไม่เลือกขนาด", b, 0], ["min2 เลือก 1", c, 0], ["บรรทัด 2", d, 1]] as [string, Any, number][]) {
      if (!(refused(r, ["OPTIONS_REQUIRED"]) && noTotals(r) && r.lineIndex === li)) p.push(`${l}:${codeOf(r)}/li${r?.lineIndex}/${noTotals(r)}`);
    }
    if (!refused(e, ["OPTIONS_REQUIRED"]) || (await saleByKey(k))) p.push(`submit ${codeOf(e)}`);
    chk("O3", p.length === 0, "OPTIONS_REQUIRED ทุกกรณี · lineIndex · ไม่มีบิล", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const a = await quote(owner, { lines: [{ productId: LATTE, qty: 1, options: o(SIZE.c.S!, SIZE.c.M!) }] });
    const b = await quote(owner, { lines: [{ productId: LATTE, qty: 1, options: o(SIZE.c.M!, TOP.c.PEARL!, TOP.c.JELLY!, TOP.c.WHIP!, TOP.c.CHEESE!) }] });
    const c = await quote(owner, { lines: [{ productId: LATTE, qty: 1, options: o(SIZE.c.M!, TOP.c.PEARL!, TOP.c.JELLY!, TOP.c.WHIP!) }] });
    const d = await quote(owner, { lines: [{ productId: SAUCEP, qty: 1, options: o(SAUCE.c.A!, SAUCE.c.B!) }] });
    const e = await quote(owner, { lines: [{ productId: SAUCEP, qty: 1, options: o(SAUCE.c.A!, SAUCE.c.B!, SAUCE.c.C!) }] });
    asData("max1 เลือก 2", a, "OPTIONS_INVALID");
    if (!(refused(a, ["OPTIONS_INVALID"]) && noTotals(a))) p.push(`S+M ${codeOf(a)}`);
    if (!(refused(b, ["OPTIONS_INVALID"]) && noTotals(b))) p.push(`ท็อปปิ้ง 4 ${codeOf(b)}`);
    if (!(c?.ok === true && c.grandTotalSatang === 8200)) p.push(`ท็อปปิ้ง 3 ${codeOf(c)} ${c?.grandTotalSatang}`);
    if (!(d?.ok === true && d.grandTotalSatang === 3000)) p.push(`ซอส 2 ${codeOf(d)} ${d?.grandTotalSatang}`);
    if (!refused(e, ["OPTIONS_INVALID"])) p.push(`ซอส 3 ${codeOf(e)}`);
    chk("O4", p.length === 0, "เกิน max = OPTIONS_INVALID · พอดี = ok", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const lt = (options: unknown) => quote(owner, { lines: [{ productId: LATTE, qty: 1, options }] });
    const cases: [string, Any, string][] = [
      ["กลุ่มไม่ได้ผูก", await lt(o(SIZE.c.M!, FOREIGN.c.X!)), "OPTIONS_INVALID"],
      ["id ไม่มีจริง", await lt(o(SIZE.c.M!, `nope-${RAND}`)), "OPTIONS_INVALID"],
      ["ซ้ำ", await lt(o(SIZE.c.M!, SIZE.c.M!)), "VALIDATION"],
      ["ไม่ใช่ array", await lt("x"), "VALIDATION"],
      ["{}", await lt([{}]), "VALIDATION"],
      ["คีย์แปลก", await lt([{ choiceId: SIZE.c.M, foo: 1 }]), "VALIDATION"],
      ["21 รายการ", await lt(Array.from({ length: 21 }, (_, i) => ({ choiceId: `c${i}-${RAND}` }))), "VALIDATION"],
      ["รายการเองมี options", await quote(owner, { lines: [{ name: "ค่าห่อ", qty: 1, unitPriceSatang: 500, options: o(SIZE.c.M!) }] }), "VALIDATION"],
    ];
    for (const [l, r, code] of cases) {
      if (!(refused(r, [code]) && noTotals(r))) p.push(`${l}:${codeOf(r)}≠${code}`);
    }
    asData("กลุ่มไม่ได้ผูก", cases[0]![1], "OPTIONS_INVALID");
    asData("options ซ้ำ", cases[2]![1], "VALIDATION");
    chk("O5", p.length === 0, "OPTIONS_INVALID ×2 · VALIDATION ×6", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const line = { productId: LATTE, qty: 1, unitPriceSatang: 1, options: [{ choiceId: SIZE.c.M, priceDeltaSatang: 0, name: "ฟรี" }] };
    const q = await quote(owner, { lines: [line] });
    if (!(q?.ok === true && q.grandTotalSatang === 6500 && L0(q).unitPriceSatang === 6500)) p.push(`quote ${codeOf(q)} ${q?.grandTotalSatang}`);
    const k1 = key("o6-cheat");
    const a = await sub(owner, { idempotencyKey: k1, lines: [line], payMethods: pay(5500) });
    if (!refused(a, ["PRICE_CHANGED"]) || (await saleByKey(k1))) p.push(`expected 5,500 ${codeOf(a)}`);
    const k2 = key("o6-ok");
    const b = await sub(owner, { idempotencyKey: k2, lines: [line], payMethods: pay(6500) });
    const s = await saleByKey(k2);
    const rows = await optRows(s?.id);
    if (!(b?.ok === true && s?.lines?.[0]?.unitPriceSatang === 6500 && rows.length === 1 && rows[0]?.priceDeltaSatang === 1000 && rows[0]?.choiceName === "M")) p.push(`PAID ${codeOf(b)} @${s?.lines?.[0]?.unitPriceSatang} ${short(rows.map((x) => [x.choiceName, x.priceDeltaSatang]), 60)}`);
    chk("O6", p.length === 0, "ราคา/delta/ชื่อจาก client ไม่ถูกเชื่อ", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const a = await quote(owner, { lines: [{ productId: LATTE, qty: 1, options: o(SIZE.c.M!, SWEET.c.LESS!) }] });
    const b = await quote(owner, { lines: [{ productId: CHEAP, qty: 1, options: o(NEG.c.NEG!) }] });
    const c = await quote(owner, { lines: [{ productId: LATTE, qty: 1, options: o(SIZE.c.L!), discount: { type: "PERCENT", value: 1000 } }] });
    if (!(a?.ok === true && a.grandTotalSatang === 6000 && L0(a).optionsSatang === 500)) p.push(`หวานน้อย ${codeOf(a)} ${a?.grandTotalSatang} o${L0(a).optionsSatang}`);
    if (!(refused(b, ["INVALID_LINE"]) && noTotals(b))) p.push(`ติดลบ ${codeOf(b)}`);
    const lc = L0(c);
    if (!(c?.ok === true && lc.unitPriceSatang === 7000 && lc.discountSatang === 700 && lc.lineTotalSatang === 6300 && c.grandTotalSatang === 6300)) p.push(`ส่วนลด ${codeOf(c)} u${lc.unitPriceSatang} d${lc.discountSatang} t${lc.lineTotalSatang}`);
    chk("O7", p.length === 0, "6,000 · INVALID_LINE · 7,000−700 = 6,300", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const a = await quote(owner, { lines: [{ productId: LATTE, qty: 1, options: o(SIZE.c.M!, TOP.c.OREO!) }] });
    const b = await quote(owner, { lines: [{ productId: LATTE, qty: 1, options: o(SIZE.c.M!, TOP.c.CHOC!) }] });
    const c = await quote(owner, { lines: [{ productId: TEA2, qty: 1 }] });
    asData("86", a, "OPTION_UNAVAILABLE");
    if (!(refused(a, ["OPTION_UNAVAILABLE"]) && a.lineIndex === 0 && noTotals(a))) p.push(`86 ${codeOf(a)}/li${a?.lineIndex}`);
    if (!refused(b, ["OPTIONS_INVALID"])) p.push(`เก็บถาวร ${codeOf(b)}`);
    if (!(c?.ok === true && c.grandTotalSatang === 4000)) p.push(`กลุ่มเก็บถาวร ${codeOf(c)} ${c?.grandTotalSatang}`);
    chk("O8", p.length === 0, "OPTION_UNAVAILABLE · OPTIONS_INVALID · ราคาฐาน", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const a = await quote(owner, { lines: [{ productId: TEA, qty: 1 }] });
    const la = L0(a);
    if (!(a?.ok === true && a.grandTotalSatang === 4000 && la.optionsSatang === 0 && Array.isArray(la.options) && la.options.length === 0)) p.push(`ชา ${codeOf(a)} ${a?.grandTotalSatang} o${la.optionsSatang} ${short(la.options, 30)}`);
    const b = await quote(owner, { lines: [{ productId: NOPRICE, qty: 1, openPrice: true, unitPriceSatang: 4200, options: o(TOP.c.PEARL!) }] });
    const c = await quote(owner, { lines: [{ productId: NOPRICE, qty: 1, openPrice: true, unitPriceSatang: 4200 }] });
    if (!refused(b, ["VALIDATION"])) p.push(`ราคาเปิด+ตัวเลือก ${codeOf(b)}`);
    if (!(c?.ok === true && c.grandTotalSatang === 4200)) p.push(`ราคาเปิด ${codeOf(c)} ${c?.grandTotalSatang}`);
    chk("O9", p.length === 0, "ไม่ใส่ default เอง · optionsSatang 0 · ราคาเปิด+ตัวเลือก VALIDATION", FX(p.join(" · ") || "ครบ"));
  }

  // ─── fixture ตัวแปร (ต้องใช้ createProduct + parentId ของ P1.2) ───
  console.log("\n── V ตัวแปร ──");
  let fxV = "";
  let SHIRT = "", RED = "", BLUE = "", invRED = "", invBLUE = "", OTHERP = "";
  const bc = (s: string) => `${KTAG}-${s}`;
  try {
    if (!fx) {
      SHIRT = await mkProd({ name: `${TAG} เสื้อ`, kind: "PRODUCT", basePriceSatang: 5500, barcode: bc("SHIRT") });
      await link(SHIRT, SIZE.id, 0);
      invRED = await mkInv("RED", "เสื้อแดง", 10);
      invBLUE = await mkInv("BLUE", "เสื้อน้ำเงิน", 10);
      RED = await mkProd({ name: `${TAG} เสื้อ แดง`, invItemId: invRED, parentId: SHIRT, basePriceSatang: 6500, barcode: bc("RED") });
      BLUE = await mkProd({ name: `${TAG} เสื้อ น้ำเงิน`, invItemId: invBLUE, parentId: SHIRT, barcode: bc("BLUE") });
    }
  } catch (e) {
    fxV = `variant-fixture:${(e as Error).message.slice(0, 100)}`;
  }
  {
    const p: string[] = [];
    const r = await call(register, "registerProductOptions", ctxS, owner, { productId: LATTE });
    const gs = (r?.groups ?? []) as Any[];
    if (r?.ok !== true) p.push(`ลาเต้ ${codeOf(r)}`);
    else {
      if (gs.map((g) => g.groupId).join(",") !== [SIZE.id, TOP.id, SWEET.id].join(",")) p.push(`ลำดับกลุ่ม ${short(gs.map((g) => g.name), 80)}`);
      const sz = gs[0] ?? {};
      if (!(sz.minSelect === 1 && sz.maxSelect === 1 && (sz.choices ?? []).map((c: Any) => c.priceDeltaSatang).join(",") === "0,1000,1500")) p.push(`ขนาด ${short(sz, 100)}`);
      const tc = ((gs[1]?.choices ?? []) as Any[]);
      if (tc.some((c) => c.choiceId === TOP.c.CHOC)) p.push("มีตัวเลือกที่เก็บถาวร");
      if (tc.find((c) => c.choiceId === TOP.c.OREO)?.unavailable !== true) p.push("86 ไม่ unavailable");
      if (tc.find((c) => c.choiceId === TOP.c.JELLY)?.isDefault !== true) p.push("isDefault หาย");
      if (!(Array.isArray(r.variants) && r.variants.length === 0)) p.push(`variants ${short(r.variants, 40)}`);
    }
    const s = SHIRT ? await call(register, "registerProductOptions", ctxS, owner, { productId: SHIRT }) : null;
    const vs = ((s?.variants ?? []) as Any[]);
    const vr = vs.find((v) => v.id === RED);
    const vb = vs.find((v) => v.id === BLUE);
    if (!(s?.ok === true && vs.length === 2 && vr?.priceSatang === 6500 && vb?.priceSatang === 5500 && (s.groups ?? []).map((g: Any) => g.groupId).join(",") === SIZE.id)) p.push(`แม่ ${codeOf(s)} ${short(vs.map((v) => [v.priceSatang]), 60)}`);
    const n = await call(register, "registerProductOptions", ctxS, owner, { productId: `nope-${RAND}` });
    if (!refused(n, ["PRODUCT_NOT_FOUND"])) p.push(`ไม่มีจริง ${codeOf(n)}`);
    chk("O10", p.length === 0, "กลุ่ม/ตัวเลือก/variants ตามสัญญา", FX(p.join(" · ") || "ครบ", fxV));
  }
  {
    const p: string[] = [];
    const g = await call(catalog, "createOptionGroup", cctx, { unitId: uS, name: `${TAG} นม`, minSelect: 0, maxSelect: 1, choices: [{ name: "OAT", priceDelta: 1500 }, { name: "ALMOND", priceDelta: 1200, isDefault: true }] });
    const gid = idOf(g) ?? "";
    if (gid) sb.groupIds.push(gid);
    const row = gid ? await P.menuOptionGroup.findUnique({ where: { id: gid }, include: { choices: true } }) : null;
    const oat = (row?.choices ?? []).find((c: Any) => c.name === "OAT");
    if (!(row && row.unitId === uS && row.tenantId === tid && row.minSelect === 0 && row.maxSelect === 1 && row.choices.length === 2 && oat?.priceDelta === 1500)) p.push(`createOptionGroup ${codeOf(g)} ${short(row && [row.unitId === uS, row.choices?.length], 40)}`);
    const bad = await call(catalog, "createOptionGroup", cctx, { unitId: uS, name: `${TAG} ผิด`, minSelect: 2, maxSelect: 1, choices: [{ name: "a", priceDelta: 0 }] });
    if (!refused(bad, ["VALIDATION"])) p.push(`min>max ${codeOf(bad)}`);
    const offUnit = await call(catalog, "createOptionGroup", cctx, { unitId: uZ, name: `${TAG} นอก`, minSelect: 0, maxSelect: 1, choices: [{ name: "a", priceDelta: 0 }] });
    if (!refused(offUnit, ["NOT_FOUND"])) p.push(`สาขานอก POS ${codeOf(offUnit)}`);
    const s1 = await call(catalog, "setProductOptionGroups", cctx, MOCHA, [SIZE.id, gid]);
    const s2 = await call(catalog, "setProductOptionGroups", cctx, MOCHA, [SIZE.id, gid]);
    const links = (await P.posProductOptionGroup.findMany({ where: { productId: MOCHA }, orderBy: { sortOrder: "asc" } })) as Any[];
    if (s1?.ok === false || s2?.ok === false || links.map((l) => l.groupId).join(",") !== [SIZE.id, gid].join(",")) p.push(`set ${codeOf(s1)}/${codeOf(s2)} ลิงก์ ${links.length}`);
    const zg = await call(catalog, "setProductOptionGroups", cctx, MOCHA, [ZG.id]);
    if (!refused(zg, ["NOT_FOUND"])) p.push(`กลุ่มสาขานอก POS ${codeOf(zg)}`);
    const qm = gid ? await quote(owner, { lines: [{ productId: MOCHA, qty: 1, options: o(SIZE.c.M!, gid ? ((await P.menuOptionChoice.findFirst({ where: { groupId: gid, name: "OAT" } }))?.id ?? "") : "") }] }) : null;
    const ql = await quote(owner, { lines: [{ productId: LATTE, qty: 1, options: o(SIZE.c.M!, TOP.c.PEARL!) }] });
    if (!(qm?.ok === true && qm.grandTotalSatang === 8500)) p.push(`มอคค่า ${codeOf(qm)} ${qm?.grandTotalSatang}`);
    if (!(ql?.ok === true && ql.grandTotalSatang === 7000)) p.push(`ลาเต้ ${codeOf(ql)} ${ql?.grandTotalSatang}`);
    if (RED) {
      const v = await call(catalog, "setProductOptionGroups", cctx, RED, [SIZE.id]);
      if (!refused(v, ["VALIDATION"])) p.push(`ตัวแปร ${codeOf(v)}`);
    } else p.push("ไม่มีตัวแปรให้ลอง (fixture)");
    chk("O11", p.length === 0, "ตัวเขียนกลุ่ม/ลิงก์ตามสัญญา · ใช้ร่วม", FX(p.join(" · ") || "ครบ", fxV));
  }

  // ════════ M ร้านอาหาร ════════
  console.log("\n── M ร้านอาหาร (P1.1b) ──");
  {
    const p: string[] = [];
    try {
      await P.menuOptionChoice.update({ where: { id: TOP.c.PEARL }, data: { priceDelta: 800 } });
      const q = await quote(owner, { lines: [{ productId: LATTE, qty: 1, options: o(SIZE.c.M!, TOP.c.PEARL!) }] });
      if (!(q?.ok === true && q.grandTotalSatang === 7300)) p.push(`หลังแก้ ${codeOf(q)} ${q?.grandTotalSatang}`);
      const rows = await optRows(saleO2?.id);
      if (rows.find((x) => x.choiceId === TOP.c.PEARL)?.priceDeltaSatang !== 500) p.push(`snapshot บิลเดิม ${short(rows.map((x) => x.priceDeltaSatang), 30)}`);
      await P.menuOptionChoice.update({ where: { id: TOP.c.WHIP }, data: { isOutOfStock: true } });
      const w = await quote(owner, { lines: [{ productId: LATTE, qty: 1, options: o(SIZE.c.M!, TOP.c.WHIP!) }] });
      if (!refused(w, ["OPTION_UNAVAILABLE"])) p.push(`86 วิป ${codeOf(w)}`);
    } catch (e) {
      p.push(`fixture:${(e as Error).message.slice(0, 60)}`);
    } finally {
      await P.menuOptionChoice.update({ where: { id: TOP.c.PEARL }, data: { priceDelta: 500 } }).catch(() => {});
      await P.menuOptionChoice.update({ where: { id: TOP.c.WHIP }, data: { isOutOfStock: false } }).catch(() => {});
    }
    chk("M1", p.length === 0, "7,300 · snapshot 500 · OPTION_UNAVAILABLE", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    let fxM = "";
    let MENUP = "", mi = "", GR = NONE;
    try {
      const st = await P.kdsStation.create({ data: { tenantId: tid, unitId: uR, name: `${TAG} ครัว` } });
      const mc = await P.menuCategory.create({ data: { tenantId: tid, unitId: uR, name: `${TAG} อาหาร` } });
      MENUP = await mkProd({ name: `${TAG} กะเพรา`, kind: "MENU", basePriceSatang: 8000, unitId: uR });
      mi = (await P.menuItem.create({ data: { tenantId: tid, unitId: uR, categoryId: mc.id, stationId: st.id, name: `${TAG} กะเพรา`, basePrice: 8000, posProductId: MENUP } })).id;
      GR = await mkGroup(uR, "เผ็ด", 0, 1, [["น้อย", 0], ["มาก", 0]]);
    } catch (e) {
      fxM = `menu-fixture:${(e as Error).message.slice(0, 80)}`;
    }
    if (!fxM) {
      const a = await call(catalog, "setProductOptionGroups", cctx, MENUP, [GR.id]);
      const pl = (await P.posProductOptionGroup.findMany({ where: { productId: MENUP } })) as Any[];
      const ml = (await P.menuItemOptionGroup.findMany({ where: { itemId: mi } })) as Any[];
      if (!(a?.ok !== false && pl.length === 1 && pl[0].groupId === GR.id && ml.length === 1 && ml[0].groupId === GR.id && ml[0].unitId === uR && ml[0].tenantId === tid)) p.push(`ตั้ง ${codeOf(a)} pos ${pl.length} menu ${ml.length}`);
      const b = await call(catalog, "setProductOptionGroups", cctx, MENUP, []);
      const pl2 = await P.posProductOptionGroup.count({ where: { productId: MENUP } });
      const ml2 = await P.menuItemOptionGroup.count({ where: { itemId: mi } });
      if (!(b?.ok !== false && pl2 === 0 && ml2 === 0)) p.push(`ล้าง ${codeOf(b)} pos ${pl2} menu ${ml2}`);
    }
    chk("M2", !fxM && p.length === 0, "สองฝั่งตรงกัน · ล้างพร้อมกัน", FX(p.join(" · ") || "ครบ", fxM));
  }

  // ════════ V ตัวแปร ════════
  {
    const p: string[] = [];
    const cat = await call(register, "registerCatalog", ctxS, owner, { limit: 500 });
    const prods = (cat?.products ?? []) as Any[];
    const sh = prods.find((x) => x.id === SHIRT);
    if (!(sh && sh.variantCount === 2 && sh.parentId === null)) p.push(`แม่ ${short(sh && { vc: sh.variantCount, parentId: sh.parentId }, 60)}`);
    if (prods.some((x) => x.id === RED || x.id === BLUE)) p.push("ลูกขึ้นกริด");
    const srch = await call(register, "registerCatalog", ctxS, owner, { q: `${TAG} เสื้อ`, limit: 50 });
    if (((srch?.products ?? []) as Any[]).some((x) => x.id === RED || x.id === BLUE)) p.push("ลูกขึ้นในค้นหา");
    const lf = await call(catalog, "listForUnit", cctx, uS, { limit: 500 });
    const li = ((lf?.items ?? []) as Any[]).find((x) => x.id === SHIRT);
    if (!sameSet((li?.variants ?? []).map((v: Any) => v?.id), [RED, BLUE])) p.push(`listForUnit variants ${short(li?.variants, 60)}`);
    chk("V1", !fxV && p.length === 0, "แม่ 2 ลูก · ลูกซ่อน · listForUnit variants", FX(p.join(" · ") || "ครบ", fxV));
  }
  {
    const p: string[] = [];
    const a = await call(register, "registerScan", ctxS, owner, { barcode: bc("RED") });
    if (!(a?.ok === true && a.match === "one" && a.product?.id === RED && a.product?.parentId === SHIRT && a.product?.priceSatang === 6500)) p.push(`ลูก ${a?.match} ${short(a?.product && [a.product.id === RED, a.product.parentId, a.product.priceSatang], 60)}`);
    const b = await call(register, "registerScan", ctxS, owner, { barcode: bc("SHIRT") });
    if (!(b?.ok === true && b.match === "choose" && sameSet((b.products ?? []).map((x: Any) => x.id), [RED, BLUE]))) p.push(`แม่ ${b?.match} ${(b?.products ?? []).length}`);
    const c = await call(register, "registerScan", ctxS, owner, { barcode: bc("BLUE") });
    if (c?.product?.priceSatang !== 5500) p.push(`น้ำเงิน ${c?.product?.priceSatang}`);
    chk("V2", !fxV && p.length === 0, "one ลูก · choose 2 ลูก · สืบราคา", FX(p.join(" · ") || "ครบ", fxV));
  }
  {
    const p: string[] = [];
    const a = await quote(owner, { lines: [{ productId: RED, qty: 1, options: o(SIZE.c.M!) }] });
    const b = await quote(owner, { lines: [{ productId: BLUE, qty: 1, options: o(SIZE.c.M!) }] });
    const c = await quote(owner, { lines: [{ productId: RED, qty: 1 }] });
    const d = await quote(owner, { lines: [{ productId: SHIRT, qty: 1, options: o(SIZE.c.M!) }] });
    asData("ขายแม่", d, "VARIANT_REQUIRED");
    if (!(a?.ok === true && a.grandTotalSatang === 7500)) p.push(`แดง ${codeOf(a)} ${a?.grandTotalSatang}`);
    if (!(b?.ok === true && b.grandTotalSatang === 6500)) p.push(`น้ำเงิน ${codeOf(b)} ${b?.grandTotalSatang}`);
    if (!refused(c, ["OPTIONS_REQUIRED"])) p.push(`ไม่เลือก ${codeOf(c)}`);
    if (!(refused(d, ["VARIANT_REQUIRED"]) && noTotals(d))) p.push(`แม่ ${codeOf(d)}`);
    chk("V3", !fxV && p.length === 0, "7,500 · 6,500 · OPTIONS_REQUIRED · VARIANT_REQUIRED", FX(p.join(" · ") || "ครบ", fxV));
  }
  {
    const p: string[] = [];
    const k = key("v4");
    const r = await sub(owner, { idempotencyKey: k, lines: [{ productId: RED, qty: 2, options: o(SIZE.c.M!) }], payMethods: pay(15000) });
    const s = await saleByKey(k);
    const l = s?.lines?.[0];
    const ohR = invRED ? await onHandOf(invRED) : NaN;
    const ohB = invBLUE ? await onHandOf(invBLUE) : NaN;
    const mv = s ? ((await outMoves(s.id)) as Any[]) : [];
    if (!(r?.ok === true && l?.productId === RED && l?.itemId === invRED && l?.unitPriceSatang === 7500)) p.push(`บิล ${codeOf(r)} ${short(l && [l.productId === RED, l.itemId === invRED, l.unitPriceSatang], 60)}`);
    if (!(ohR === 8 && ohB === 10 && mv.length === 1 && mv[0]?.itemId === invRED)) p.push(`สต็อก แดง ${ohR} น้ำเงิน ${ohB} OUT ${mv.length}`);
    chk("V4", !fxV && p.length === 0, "ลูก · InvItem ลูก · 10→8 · 10", FX(p.join(" · ") || "ครบ", fxV));
  }
  {
    const p: string[] = [];
    const vv = await call(catalog, "createProduct", cctx, { name: `${TAG} ลูกของลูก`, parentId: RED, basePriceSatang: 100 });
    if (idOf(vv)) sb.productIds.push(idOf(vv)!);
    if (!refused(vv, ["VALIDATION"])) p.push(`ลูกของลูก ${codeOf(vv)}`);
    let BUNDLEP = "";
    try {
      BUNDLEP = await mkProd({ name: `${TAG} ชุดแม่`, kind: "BUNDLE", basePriceSatang: 9900 });
    } catch {
      /* ไม่มีชุด = ข้ามส่วนนี้ (แดงที่อื่น) */
    }
    const vb = await call(catalog, "createProduct", cctx, { name: `${TAG} ลูกของชุด`, parentId: BUNDLEP, basePriceSatang: 100 });
    if (idOf(vb)) sb.productIds.push(idOf(vb)!);
    if (!refused(vb, ["VALIDATION"])) p.push(`แม่เป็นชุด ${codeOf(vb)}`);
    try {
      OTHERP = await mkProd({ name: `${TAG} สินค้า POS อื่น`, kind: "PRODUCT", basePriceSatang: 100 }, cctxO);
    } catch (e) {
      p.push(`fixture POS-O:${(e as Error).message.slice(0, 40)}`);
    }
    const vo = await call(catalog, "createProduct", cctx, { name: `${TAG} ลูกข้ามระบบ`, parentId: OTHERP, basePriceSatang: 100 });
    if (idOf(vo)) sb.productIds.push(idOf(vo)!);
    if (!refused(vo, ["NOT_FOUND"])) p.push(`แม่ POS อื่น ${codeOf(vo)}`);
    const vc = await call(catalog, "createProduct", cctx, { name: `${TAG} บาร์โค้ดชน`, parentId: SHIRT, basePriceSatang: 100, barcode: bc("RED") });
    if (idOf(vc)) sb.productIds.push(idOf(vc)!);
    if (!refused(vc, ["CONFLICT"])) p.push(`บาร์โค้ดชน ${codeOf(vc)}`);
    const ar = await call(catalog, "archive", cctx, SHIRT);
    const q = await quote(owner, { lines: [{ productId: RED, qty: 1, options: o(SIZE.c.M!) }] });
    const sc = await call(register, "registerScan", ctxS, owner, { barcode: bc("RED") });
    if (ar?.ok === false) p.push(`archive ${codeOf(ar)}`);
    if (!refused(q, ["PRODUCT_NOT_FOUND"])) p.push(`แม่ถาวร quote ${codeOf(q)}`);
    if (!(sc?.ok === true && sc.match === "none")) p.push(`แม่ถาวร scan ${sc?.match}`);
    await call(catalog, "restore", cctx, SHIRT);
    chk("V5", !fxV && p.length === 0, "VALIDATION ×2 · NOT_FOUND · CONFLICT · แม่ถาวร = ลูกขายไม่ได้", FX(p.join(" · ") || "ครบ", fxV));
  }

  // ════════ B ชุด/คอมโบ ════════
  console.log("\n── B ชุด/คอมโบ ──");
  let fxB = "";
  let BSET = "", BSET2 = "", invCA = "", invCB = "", invZZ = "";
  try {
    if (!fx) {
      invCA = await mkInv("CA", "ไข่ดาว", 20);
      invCB = await mkInv("CB", "ขนมปัง", 20);
      invZZ = await mkInv("ZZ", "ของคลังอื่น", 0, { tenantId: tid, systemId: invZ });
      BSET = await mkProd({ name: `${TAG} เซ็ตเช้า`, kind: "BUNDLE", basePriceSatang: 15900 });
      BSET2 = await mkProd({ name: `${TAG} เซ็ตสอง`, kind: "BUNDLE", basePriceSatang: 9900 });
      await P.recipeLine.create({ data: { tenantId: tid, productId: BSET, invItemId: invCA, qty: 1 } });
      await P.recipeLine.create({ data: { tenantId: tid, productId: BSET, invItemId: invCB, qty: 2 } });
      await link(BSET, SIZE.id, 0);
    }
  } catch (e) {
    fxB = `bundle-fixture:${(e as Error).message.slice(0, 100)}`;
  }
  {
    const p: string[] = [];
    const recipeOf = async (pid: string) => ((await P.recipeLine.findMany({ where: { productId: pid } })) as Any[]).map((r) => `${r.invItemId === invCA ? "CA" : r.invItemId === invCB ? "CB" : "?"}×${r.qty}`).sort().join(",");
    const a = await call(catalog, "setRecipe", cctx, BSET2, [{ invItemId: invCA, qty: 1 }, { invItemId: invCB, qty: 3 }]);
    const ra = await recipeOf(BSET2);
    if (a?.ok === false || ra !== "CA×1,CB×3") p.push(`ตั้ง ${codeOf(a)} ${ra}`);
    const b = await call(catalog, "setRecipe", cctx, BSET2, [{ invItemId: invCA, qty: 2 }]);
    const rb = await recipeOf(BSET2);
    if (b?.ok === false || rb !== "CA×2") p.push(`ตั้งใหม่ ${codeOf(b)} ${rb}`);
    const lf = await call(catalog, "listForUnit", cctx, uS, { limit: 500 });
    const li = ((lf?.items ?? []) as Any[]).find((x) => x.id === BSET2);
    if (!(Array.isArray(li?.recipe) && li.recipe.length === 1 && li.recipe[0].invItemId === invCA && li.recipe[0].qty === 2)) p.push(`listForUnit ${short(li?.recipe, 60)}`);
    const z = await call(catalog, "setRecipe", cctx, BSET2, [{ invItemId: invCA, qty: 0 }]);
    if (!refused(z, ["VALIDATION"])) p.push(`qty 0 ${codeOf(z)}`);
    const nf = await call(catalog, "setRecipe", cctx, BSET2, [{ invItemId: invZZ, qty: 1 }]);
    if (!refused(nf, ["NOT_FOUND"])) p.push(`คลังอื่น ${codeOf(nf)}`);
    const pk = await call(catalog, "setRecipe", cctx, PLAIN, [{ invItemId: invCA, qty: 1 }]);
    if (!refused(pk, ["VALIDATION"])) p.push(`PRODUCT ${codeOf(pk)}`);
    if ((await recipeOf(BSET2)) !== "CA×2") p.push("คำขอที่ถูกปฏิเสธแก้สูตร");
    chk("B1", !fxB && p.length === 0, "ตั้ง/แทน/อ่าน · VALIDATION · NOT_FOUND", FX(p.join(" · ") || "ครบ", fxB));
  }
  let saleB2: Any = null;
  {
    const p: string[] = [];
    const k = key("b2");
    const r = await sub(owner, { idempotencyKey: k, lines: [{ productId: BSET, qty: 2, options: o(SIZE.c.M!) }], payMethods: pay(33800) });
    saleB2 = await saleByKey(k);
    const l = saleB2?.lines?.[0];
    const comp = (Array.isArray(l?.components) ? l.components : []) as Any[];
    const compKey = comp.map((c) => `${c?.invItemId === invCA ? "CA" : c?.invItemId === invCB ? "CB" : "?"}×${c?.qty}`).sort().join(",");
    const ca = await onHandOf(invCA);
    const cb = await onHandOf(invCB);
    const mv = saleB2 ? ((await outMoves(saleB2.id)) as Any[]) : [];
    const keys = mv.map((m) => m.idempotencyKey).sort();
    const want = l ? [`pos-consume-${saleB2.id}-${l.id}-${invCA}`, `pos-consume-${saleB2.id}-${l.id}-${invCB}`].sort() : [];
    if (!(r?.ok === true && saleB2?.grandTotalSatang === 33800 && l?.unitPriceSatang === 16900 && l?.itemId === null && l?.productId === BSET)) p.push(`บิล ${codeOf(r)} g${saleB2?.grandTotalSatang} @${l?.unitPriceSatang} item ${l?.itemId}`);
    if (compKey !== "CA×1,CB×2") p.push(`components ${short(l?.components, 60)}`);
    if (!(ca === 18 && cb === 16)) p.push(`สต็อก CA ${ca} CB ${cb}`);
    if (!(mv.length === 2 && keys.join("|") === want.join("|"))) p.push(`OUT ${mv.length} ${short(keys, 80)}`);
    chk("B2", !fxB && p.length === 0, "33,800 · ราคาชุด · snapshot · 18/16 · คีย์ต่อส่วนประกอบ", FX(p.join(" · ") || "ครบ", fxB));
  }
  {
    const p: string[] = [];
    const before = [await onHandOf(invCA), await onHandOf(invCB)];
    let v: Any = { ok: true };
    try {
      if (saleB2) await service.voidSale(tid, uS, saleB2.id);
      else v = { ok: false, code: "NO_SALE" };
    } catch (e) {
      v = { ok: false, code: errCode(e) };
    }
    const after = [await onHandOf(invCA), await onHandOf(invCB)];
    const st = saleB2 ? (await P.posSale.findUnique({ where: { id: saleB2.id } }))?.status : null;
    if (!(v.ok && before[0] === 18 && before[1] === 16 && after[0] === 20 && after[1] === 20 && st === "VOIDED")) p.push(`${codeOf(v)} ${before.join("/")}→${after.join("/")} ${st}`);
    chk("B3", !fxB && p.length === 0, "18/16 → 20/20 · VOIDED", FX(p.join(" · ") || "ครบ", fxB));
  }
  {
    const p: string[] = [];
    const st0 = await call(register, "registerStatus", ctxS, owner);
    const k = key("b4");
    const r = await quietTx((tx) =>
      call(service, "createSale", {
        tenantId: tid, unitId: uS, systemId: posS, sourceModule: "POS", idempotencyKey: k,
        lines: [{ name: `${TAG} เซ็ตเช้า`, qty: 1, unitPriceSatang: 15900, productId: BSET, components: [{ invItemId: invCA, qty: 1 }, { invItemId: invCB, qty: 2 }] }],
        payMethods: pay(15900),
      }, tx).then((x: Any) => (x && x.ok === false ? x : { ok: true, ...x })),
    );
    const st1 = await call(register, "registerStatus", ctxS, owner);
    const ca = await onHandOf(invCA);
    if (!(r?.ok === true && st0?.ok === true && st1?.ok === true && st1.pendingStockCount === st0.pendingStockCount + 1 && ca === 20)) p.push(`${codeOf(r)} pending ${st0?.pendingStockCount}→${st1?.pendingStockCount} CA ${ca}`);
    chk("B4", !fxB && p.length === 0, "pending +1 · สต็อกไม่ขยับ", FX(p.join(" · ") || "ครบ", fxB));
  }

  // ════════ W สินค้าชั่ง ════════
  console.log("\n── W สินค้าชั่ง ──");
  let fxW = "";
  let PORK = "", invPORK = "", LIT = "";
  const codeW = ean("201234501234");
  const codeW2 = ean("201234500250");
  const codeP = ean("221234504321");
  const codeLit = ean("201234500500");
  const setWb = (enabled: boolean) => P.appSystem.update({ where: { id: posS }, data: { settings: { pos: { weighedBarcode: { ...WB_SETTINGS.pos.weighedBarcode, enabled } } } } });
  try {
    if (!fx) {
      await setWb(true);
      const t = await mkTracked("PORK", "หมูสับ (กรัม)", 35000, 5000);
      PORK = t.id;
      invPORK = t.inv;
      must("updateProduct", await call(catalog, "updateProduct", cctx, PORK, { soldByWeight: true, scalePlu: "12345" }));
      LIT = await mkProd({ name: `${TAG} ป้ายลงทะเบียน`, kind: "PRODUCT", basePriceSatang: 1000, barcode: codeLit });
    }
  } catch (e) {
    fxW = `weighed-fixture:${(e as Error).message.slice(0, 100)}`;
  }
  {
    const p: string[] = [];
    const scan = (code: string) => call(register, "registerScan", ctxS, owner, { barcode: code });
    const a = await scan(codeW);
    if (!(a?.ok === true && a.match === "one" && a.product?.id === PORK && a.weighed?.grams === 1234 && a.weighed?.priceSatang === 43190 && a.weighed?.code === codeW)) p.push(`หมู ${a?.match} ${short(a?.weighed, 80)}`);
    const b = await scan(badCd(codeW));
    if (!(b?.ok === true && b.match === "none")) p.push(`check digit ผิด ${b?.match}`);
    const c = await scan(codeLit);
    if (!(c?.ok === true && c.match === "one" && c.product?.id === LIT)) p.push(`ลงทะเบียน ${c?.match} ${c?.product?.id === LIT}`);
    const d = await scan(ean("209999901000"));
    if (!(d?.ok === true && d.match === "none")) p.push(`PLU ไม่มี ${d?.match}`);
    await setWb(false).catch(() => {});
    const e = await scan(codeW);
    await setWb(true).catch(() => {});
    if (!(e?.ok === true && e.match === "none")) p.push(`ปิดตั้งค่า ${e?.match}`);
    chk("W1", !fxW && p.length === 0, "one+weighed · none ×3 · ลงทะเบียนชนะ", FX(p.join(" · ") || "ครบ", fxW));
  }
  {
    const p: string[] = [];
    const a = await quote(owner, { lines: [{ productId: PORK, qty: 1, weighedBarcode: codeW, unitPriceSatang: 1 }] });
    if (!(a?.ok === true && a.grandTotalSatang === 43190 && L0(a).unitPriceSatang === 43190)) p.push(`หมู ${codeOf(a)} ${a?.grandTotalSatang}`);
    const b = await quote(owner, { lines: [{ productId: PORK, qty: 2, weighedBarcode: codeW }] });
    if (!refused(b, ["INVALID_LINE"])) p.push(`qty 2 ${codeOf(b)}`);
    const c = await quote(owner, { lines: [{ productId: LATTE, qty: 1, weighedBarcode: codeW, options: o(SIZE.c.M!) }] });
    if (!refused(c, ["VALIDATION"])) p.push(`PLU สินค้าอื่น ${codeOf(c)}`);
    const d = await quote(owner, { lines: [{ productId: PORK, qty: 1, weighedBarcode: badCd(codeW) }] });
    if (!refused(d, ["VALIDATION"])) p.push(`check digit ${codeOf(d)}`);
    chk("W2", !fxW && p.length === 0, "43,190 · INVALID_LINE · VALIDATION ×2", FX(p.join(" · ") || "ครบ", fxW));
  }
  {
    const a = await quote(owner, { lines: [{ productId: PORK, qty: 1, weighedBarcode: codeP }] });
    chk("W3", !fxW && a?.ok === true && a.grandTotalSatang === 4321 && L0(a).unitPriceSatang === 4321, "4,321", FX(`${codeOf(a)} ${a?.grandTotalSatang}`, fxW));
  }
  {
    const p: string[] = [];
    const k = key("w4");
    const r = await sub(owner, { idempotencyKey: k, lines: [{ productId: PORK, qty: 1, weighedBarcode: codeW }], payMethods: pay(43190) });
    const s = await saleByKey(k);
    const l = s?.lines?.[0];
    const oh = invPORK ? await onHandOf(invPORK) : NaN;
    const mv = s ? ((await outMoves(s.id)) as Any[]) : [];
    if (!(r?.ok === true && l?.weightGrams === 1234 && l?.qty === 1 && l?.unitPriceSatang === 43190 && l?.itemId === invPORK)) p.push(`บิล ${codeOf(r)} ${short(l && [l.weightGrams, l.qty, l.unitPriceSatang, l.itemId === invPORK], 60)}`);
    if (!(oh === 3766 && mv.length === 1 && mv[0]?.qtyDelta === -1234)) p.push(`สต็อก ${oh} OUT ${short(mv.map((m) => m.qtyDelta), 30)}`);
    const k2 = key("w4p");
    const r2 = await sub(owner, { idempotencyKey: k2, lines: [{ productId: PORK, qty: 1, weighedBarcode: codeP }], payMethods: pay(4321) });
    const s2 = await saleByKey(k2);
    const oh2 = invPORK ? await onHandOf(invPORK) : NaN;
    if (!(r2?.ok === true && s2?.lines?.[0]?.weightGrams === 123 && oh2 === 3643)) p.push(`ป้ายราคา ${codeOf(r2)} g${s2?.lines?.[0]?.weightGrams} สต็อก ${oh2}`);
    chk("W4", !fxW && p.length === 0, "1234 g @43,190 · 3766 · 123 g · 3643", FX(p.join(" · ") || "ครบ", fxW));
  }
  {
    const p: string[] = [];
    const a = await quote(owner, { lines: [{ productId: PORK, qty: 1 }] });
    asData("ไม่มีน้ำหนัก", a, "WEIGHT_REQUIRED");
    if (!(refused(a, ["WEIGHT_REQUIRED"]) && noTotals(a))) p.push(`ไม่มีน้ำหนัก ${codeOf(a)}`);
    const b = await quote(owner, { lines: [{ productId: PORK, qty: 1, weightGrams: 500 }] });
    if (!(b?.ok === true && b.grandTotalSatang === 17500)) p.push(`กรอกเอง ${codeOf(b)} ${b?.grandTotalSatang}`);
    const c = await quote(cashier, { lines: [{ productId: PORK, qty: 1, weightGrams: 500 }] });
    if (!refused(c, ["PERMISSION_DENIED"])) p.push(`แคชเชียร์ ${codeOf(c)}`);
    const cs = await quote(cashier, { lines: [{ productId: PORK, qty: 1, weighedBarcode: codeW }] });
    if (!(cs?.ok === true && cs.grandTotalSatang === 43190)) p.push(`แคชเชียร์สแกน ${codeOf(cs)}`);
    const d = await quote(owner, { lines: [{ productId: PORK, qty: 1, weightGrams: 500, weighedBarcode: codeW }] });
    if (!refused(d, ["VALIDATION"])) p.push(`สองช่อง ${codeOf(d)}`);
    const e = await quote(owner, { lines: [{ productId: PORK, qty: 1, weightGrams: 0 }] });
    if (!refused(e, ["INVALID_LINE"])) p.push(`0 g ${codeOf(e)}`);
    chk("W5", !fxW && p.length === 0, "WEIGHT_REQUIRED · 17,500 · PERMISSION_DENIED · สแกนได้ · VALIDATION · INVALID_LINE", FX(p.join(" · ") || "ครบ", fxW));
  }

  // ════════ I idempotency ════════
  console.log("\n── I idempotency ──");
  const kI = key("i1");
  {
    const p: string[] = [];
    const first = { idempotencyKey: kI, lines: [{ productId: LATTE, qty: 1, options: o(SIZE.c.M!, TOP.c.PEARL!) }, { productId: LATTE, qty: 1, options: o(SIZE.c.L!) }], payMethods: pay(14000) };
    const again = { idempotencyKey: kI, lines: [{ productId: LATTE, qty: 1, options: o(SIZE.c.L!) }, { productId: LATTE, qty: 1, options: o(TOP.c.PEARL!, SIZE.c.M!) }], payMethods: pay(14000) };
    const a = await sub(owner, first);
    const b = await sub(owner, again);
    const s = await saleByKey(kI);
    const rows = await optRows(s?.id);
    const perLine = (s?.lines ?? []).map((l: Any) => rows.filter((x) => x.lineId === l.id).map((x) => x.choiceName).sort().join("+")).sort().join(",");
    if (!(a?.ok === true && b?.ok === true && b.duplicated === true && b.saleId === a.saleId)) p.push(`${codeOf(a)}/${codeOf(b)} dup ${b?.duplicated}`);
    if ((await salesByKey(kI)) !== 1) p.push("บิลไม่ใช่ 1");
    if (perLine !== "L,M+PEARL") p.push(`แถวตัวเลือก ${perLine}`);
    chk("I1", p.length === 0, "PAID · duplicated · 1 บิล · L / M+PEARL", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const a = await sub(owner, { idempotencyKey: kI, lines: [{ productId: LATTE, qty: 1, options: o(SIZE.c.M!, TOP.c.JELLY!) }, { productId: LATTE, qty: 1, options: o(SIZE.c.L!) }], payMethods: pay(14000) });
    const b = await sub(owner, { idempotencyKey: kI, lines: [{ productId: LATTE, qty: 1 }, { productId: LATTE, qty: 1 }], payMethods: pay(14000) });
    if (!(refused(a, ["IDEMPOTENCY_CONFLICT"]) && typeof a.saleId === "string")) p.push(`ตัวเลือกต่าง ${codeOf(a)} ${a?.saleId ? "มี" : "ไม่มี"} saleId`);
    if (!refused(b, ["IDEMPOTENCY_CONFLICT"])) p.push(`ไม่ส่งตัวเลือก ${codeOf(b)}`);
    if ((await salesByKey(kI)) !== 1) p.push("บิลไม่ใช่ 1");
    chk("I2", p.length === 0, "IDEMPOTENCY_CONFLICT ×2 · บิลเดียว", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const k = key("i3");
    const inp = { idempotencyKey: k, lines: [{ productId: PORK, qty: 1, weighedBarcode: codeW2 }], payMethods: pay(8750) };
    const a = await sub(owner, inp);
    const b = await sub(owner, inp);
    const c = await sub(owner, { ...inp, lines: [{ productId: PORK, qty: 1, weighedBarcode: codeW }], payMethods: pay(43190) });
    if (!(a?.ok === true && b?.ok === true && b.duplicated === true)) p.push(`${codeOf(a)}/${codeOf(b)} dup ${b?.duplicated}`);
    if (!refused(c, ["IDEMPOTENCY_CONFLICT"])) p.push(`น้ำหนักอื่น ${codeOf(c)}`);
    chk("I3", !fxW && p.length === 0, "duplicated · IDEMPOTENCY_CONFLICT", FX(p.join(" · ") || "ครบ", fxW));
  }

  // ════════ H บิลพัก ════════
  {
    const p: string[] = [];
    const h = await call(held, "holdRegisterCart", ctxS, owner, { cart: { lines: [{ productId: LATTE, qty: 1, options: o(TOP.c.PEARL!, SIZE.c.M!) }, { productId: PORK, qty: 1, weighedBarcode: codeW2 }] }, label: `${TAG} พัก` });
    const id = h?.ok === true ? String(h.heldCart?.id ?? "") : "";
    const r = id ? await call(held, "recallHeldCart", ctxS, owner, { id }) : h;
    const L = (r?.cart?.lines ?? []) as Any[];
    if (!(r?.ok === true && sameSet((L[0]?.options ?? []).map((x: Any) => x?.choiceId), [SIZE.c.M, TOP.c.PEARL]) && L[1]?.weighedBarcode === codeW2 && r.quote?.ok === true && r.quote.grandTotalSatang === 15750)) {
      p.push(`${codeOf(h)}/${codeOf(r)} ${short(L.map((l) => [l.options, l.weighedBarcode]), 120)} q ${codeOf(r?.quote)} ${r?.quote?.grandTotalSatang}`);
    }
    chk("H1", !fxW && p.length === 0, "options + ป้ายชั่งคงเดิม · 15,750", FX(p.join(" · ") || "ครบ", fxW));
  }

  // ════════ X ข้ามร้าน ════════
  {
    const p: string[] = [];
    const a = await quote(owner, { lines: [{ productId: LATTE, qty: 1, options: o(SIZE.c.M!, RT.c.R!) }] });
    if (!refused(a, ["OPTIONS_INVALID"])) p.push(`ตัวเลือกร้านอื่น ${codeOf(a)}`);
    const before = await P.posProductOptionGroup.count({ where: { productId: LATTE } });
    const b = await call(catalog, "setProductOptionGroups", cctx, LATTE, [RT.id]);
    const after = await P.posProductOptionGroup.count({ where: { productId: LATTE } });
    if (!(refused(b, ["NOT_FOUND"]) && before === 3 && after === 3)) p.push(`ผูกกลุ่มร้านอื่น ${codeOf(b)} ${before}→${after}`);
    const c = await quote(restoOwner, { lines: [{ productId: LATTE, qty: 1, options: o(SIZE.c.M!) }] }, ctxR);
    if (!refused(c, ["PRODUCT_NOT_FOUND"])) p.push(`ร้านอาหาร quote ${codeOf(c)}`);
    const d = await call(register, "registerProductOptions", ctxR, restoOwner, { productId: LATTE });
    if (!refused(d, ["PRODUCT_NOT_FOUND", "NOT_FOUND"])) p.push(`ร้านอาหาร options ${codeOf(d)}`);
    const e = await call(register, "registerScan", ctxR, restoOwner, { barcode: bc("RED") });
    if (!(e?.ok === true && e.match === "none")) p.push(`ร้านอาหาร scan ${e?.match ?? codeOf(e)}`);
    chk("X1", p.length === 0, "OPTIONS_INVALID · NOT_FOUND · PRODUCT_NOT_FOUND ×2 · none", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ R1 ปฏิเสธเป็นข้อมูล ════════
  const badR1 = dataRefusals.filter(([, r, code]) => !(r?.ok === false && r.threw !== true && r.code === code && typeof r.message === "string" && r.message.length > 0)).map(([l, r]) => `${l}:${r?.threw ? "THROW " : ""}${codeOf(r)}`);
  chk("R1", dataRefusals.length >= 8 && badR1.length === 0, `${dataRefusals.length} คำปฏิเสธ = {ok:false, code, message} ไม่ throw`, FX(badR1.join(" · ") || "ครบ"));
}

// ═════════════════════════ 6. คืนสภาพ ═════════════════════════
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
  const units = [...sb.unitIds, ...sb.restoUnitIds];
  const systems = sb.systemIds;
  const counts: Record<string, number> = {};
  if (units.length) counts.held = await del("posHeldCart", { tenantId: { in: TIDS }, unitId: { in: units } });
  const sales = units.length || systems.length
    ? ((await P.posSale.findMany({ where: { tenantId: { in: TIDS }, OR: [{ idempotencyKey: { contains: KTAG } }, ...(units.length ? [{ unitId: { in: units } }] : []), ...(systems.length ? [{ systemId: { in: systems } }] : [])] }, select: { id: true } }).catch(() => [])) as Any[]).map((s) => s.id)
    : [];
  if (systems.length && typeof P.posProduct?.findMany === "function") {
    try {
      const extra = ((await P.posProduct.findMany({ where: { tenantId: { in: TIDS }, systemId: { in: systems } }, select: { id: true } })) as Any[]).map((r) => r.id);
      sb.productIds = [...new Set([...sb.productIds, ...extra])];
    } catch {
      /* ใช้รายการที่จำไว้ */
    }
  }
  const evKeys = sales.flatMap((id) => [`PosSale#${id}#PAID`, `PosSale#${id}#VOIDED`]);
  const evWhere = { tenantId: { in: TIDS }, OR: [...(units.length ? [{ unitId: { in: units } }] : []), ...(systems.length ? [{ systemId: { in: systems } }] : []), { idempotencyKey: { in: evKeys } }] };
  for (let i = 0; i < 20 && (sales.length || units.length); i++) {
    const pend = await P.outboxEvent.count({ where: { ...evWhere, status: "PENDING" } }).catch(() => 0);
    if (pend === 0) break;
    await sleep(500);
  }
  counts.outbox = await del("outboxEvent", evWhere);
  counts.audit = await del("auditLog", { tenantId: { in: TIDS }, createdAt: { gte: runStart }, OR: [...(units.length ? [{ unitId: { in: units } }] : []), { targetId: { in: [...sales, ...sb.productIds, ...sb.invItemIds, ...sb.groupIds, ...systems, ...units] } }] });
  if (sales.length) {
    counts.journal = await del("accountJournalEntry", { tenantId: { in: TIDS }, refType: "PosSale", refId: { in: sales } });
    counts.point = await del("pointLedger", { tenantId: { in: TIDS }, refId: { in: sales } });
    counts.lineOption = await del("posSaleLineOption", { saleId: { in: sales } });
    counts.payment = await del("posPayment", { saleId: { in: sales } });
    counts.line = await del("posSaleLine", { saleId: { in: sales } });
    counts.sale = await del("posSale", { id: { in: sales } });
  }
  if (units.length) {
    for (const m of ["menuItemOptionGroup", "menuItem", "menuCategory", "kdsStation"]) {
      const n = await del(m, { tenantId: { in: TIDS }, unitId: { in: units } });
      if (n > 0) counts[m] = n;
    }
  }
  if (sb.groupIds.length) {
    await del("menuItemOptionGroup", { groupId: { in: sb.groupIds } });
    await del("posProductOptionGroup", { groupId: { in: sb.groupIds } });
  }
  for (const m of ["posProductOptionGroup", "recipeLine", "posProductChannelPrice", "posProductAvailability", "posProductUnit"]) {
    if (sb.productIds.length) await del(m, { productId: { in: sb.productIds } });
  }
  counts.product = sb.productIds.length ? await del("posProduct", { id: { in: sb.productIds } }) : 0;
  if (systems.length) counts.productBySystem = await del("posProduct", { tenantId: { in: TIDS }, systemId: { in: systems } });
  if (systems.length) await del("posCategory", { tenantId: { in: TIDS }, systemId: { in: systems } });
  if (units.length) {
    counts.choice = await del("menuOptionChoice", { tenantId: { in: TIDS }, unitId: { in: units } });
    counts.group = await del("menuOptionGroup", { tenantId: { in: TIDS }, unitId: { in: units } });
  }
  for (const sbInv of sb.invSysIds) {
    // inventory.receive/consume โพสต์ GL เข้าสมุดตัวแรกของร้าน (inventory/service.ts postMovementGl) ⇒ ลบ AccountJournalEntry refType InvMovement ก่อน
    const mvIds = ((await P.invMovement.findMany({ where: { tenantId: { in: TIDS }, systemId: sbInv }, select: { id: true } })) as Any[]).map((m) => m.id);
    if (mvIds.length) counts.invJournal = (counts.invJournal ?? 0) + (await del("accountJournalEntry", { tenantId: { in: TIDS }, refType: "InvMovement", refId: { in: mvIds } }));
    for (const m of ["invMovement", "invLot", "invLocationStock", "invItemImage"]) await del(m, { tenantId: { in: TIDS }, OR: [{ systemId: sbInv }, { itemId: { in: sb.invItemIds } }] });
    counts.invItem = (counts.invItem ?? 0) + (await del("invItem", { tenantId: { in: TIDS }, systemId: sbInv }));
    for (const m of ["invLocation", "invCategory", "invSettings"]) await del(m, { tenantId: { in: TIDS }, systemId: sbInv });
  }
  if (units.length) counts.counter = await del("posReceiptCounter", { tenantId: { in: TIDS }, unitId: { in: units } });
  if (units.length) await del("appSystemUnit", { unitId: { in: units } });
  if (systems.length) {
    await del("appSystemUnit", { systemId: { in: systems } });
    await del("appSystem", { id: { in: systems } });
  }
  if (units.length) await del("businessUnit", { id: { in: units } });
  console.log(`  ลบแล้ว: ${JSON.stringify(counts)} · สาขา ${units.length} · ระบบ ${systems.length} · กลุ่ม ${sb.groupIds.length}`);
}

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
try {
  await runPure();
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
chk("Z2", fpDrift.length === 0 && !Object.values(fpBefore).some((v) => v.startsWith("err")), "ลายนิ้วมือเท่าเดิมทุกตาราง", fpDrift.length ? fpDrift.join(", ") : `เท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`);
for (const [id] of CHECKS) if (!results.has(id) && !skippedChecks.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}${skippedChecks.size ? ` · ข้าม ${skippedChecks.size}` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, skippedChecks: Object.fromEntries(skippedChecks), missing: skipReasons, a5: { drift } })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P1.2: BOM ของเมนู/ตัดวัตถุดิบเมนู + เปลี่ยนของในชุด (P2.3) · variant หลายมิติ · จำนวนทศนิยม · เครื่องชั่งต่อตรง (P3) ·
// ร้านอาหารส่ง options[] เข้า createSale (P2.4) · ราคาตามช่องทางต่อ variant (P2.2) · พิมพ์ตัวเลือกบนใบเสร็จ (P1.10) ·
// ป๊อปโอเวอร์ตามภาพ 01 = ผู้คุมงานตรวจที่ visual
