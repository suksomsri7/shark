// QC — POS RUN ใบ P1.5: พักบิล / เรียกคืน (ฝั่งเซิร์ฟเวอร์ + สัญญาข้อมูล + สถิตของจอ) · เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ
// requires: pos-seed
//
// สัญญา: ledger/pos-briefs/pos-brief-P1.5.md (มติร่าง H1–H7) · pos-brief-COMMON · pos-brief-LANE-RULES
//        ledger/pos-briefs/pos-spec-P1.3-register-ui.md แถว 14/15 · §1.3 (onHold/onOpenHeld · ตะกร้า serialisable) · §3.6 F8
//        docs/modules/14-pos.md §7.10 (พัก/เรียกคืน atomic · re-validate ราคา) · ledger/POS-CONTRACTS.md:66 (refType 'PosHeldCart')
//        โน้ต: ledger/wo-notes/pos-P1.5-oracle.md (รายการข้อ · ผลที่คาดบนฐาน · ความคลาดเคลื่อน · ชื่อที่ตั้งใหม่ · คำถาม)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้ และลงทะเบียนในโน้ตหัวข้อ "Names I had to invent" — ผู้คุมงานต้องรับรองก่อนผู้สร้างเริ่ม
//   ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P1.5 ต้องส่ง (ข้อสอบนี้คือสัญญา):
//   ตาราง PosHeldCart (H1 · migration เพิ่มล้วน) คอลัมน์: id tenantId unitId systemId label(≤60 · null ได้) cartJson lineCount approxTotalSatang
//     heldByUserId recalledAt? recalledByUserId? status (HELD|RECALLED|DISCARDED) createdAt version · index (unitId, status, createdAt)
//   src/lib/modules/pos/held-cart.ts (เซิร์ฟเวอร์ · ทุกฟังก์ชัน "คืน" คำปฏิเสธ {ok:false, code, message} ไม่ throw · client ท้ายเป็น PrismaClient ได้)
//     holdRegisterCart(ctx, actor, { cart: RegisterQuoteInput, label?: string }, client?) → { ok:true, heldCart: HeldCartSummary } | ปฏิเสธ
//       ตะกร้าตรวจด้วยกติกาเดียวกับ quoteRegisterCart (คีย์แปลก/คูปอง = VALIDATION · ราคาจาก client ของสินค้าแคตตาล็อก = ไม่เชื่อ) ·
//       ตะกร้าว่าง = VALIDATION · label > 60 ตัว / ไม่ใช่สตริง = VALIDATION · approxTotalSatang = ยอด quote ของเซิร์ฟเวอร์ ณ ตอนพัก
//     listHeldCarts(ctx, actor, client?) → { ok:true, items: HeldCartSummary[] (ใหม่สุดก่อน), count } — เฉพาะ HELD ของสาขานี้ (ทุกผู้ใช้หน้าขายของสาขาเห็น)
//       หมดอายุแบบขี้เกียจ (H4): HELD ที่ createdAt เก่ากว่า N วัน → DISCARDED ตอน list และไม่อยู่ในผล ·
//       N = AppSystem(POS).settings.pos.heldCart.expireDays (จำนวนเต็ม ≥1) · ไม่ตั้ง = HELD_CART_EXPIRE_DAYS (= 2 · export จาก register-shared.ts)
//     recallHeldCart(ctx, actor, { id }, client?) → { ok:true, heldCartId, cart: RegisterQuoteInput, quote: RegisterQuoteResult, notices: HeldCartNotice[] }
//       H2: UPDATE … SET status='RECALLED' WHERE id AND status='HELD' (count===1) · ถูกเรียกไปแล้ว = ALREADY_RECALLED ·
//       ทิ้งแล้ว/หมดอายุ/ร้านอื่น/สาขาอื่น/ไม่มี = NOT_FOUND · บันทึก recalledAt + recalledByUserId
//       H3: quote = quoteRegisterCart(ตะกร้าที่คืน) ด้วยราคาปัจจุบัน (ราคาใน cartJson ไม่ถูกเชื่อ) · cart คงทุกบรรทัดตามลำดับเดิม ·
//       notices[] = { lineIndex, code: "PRICE_CHANGED" | "PRODUCT_NOT_FOUND" | "PRODUCT_UNAVAILABLE", heldUnitPriceSatang?, unitPriceSatang? }
//       (ราคาเปลี่ยน = PRICE_CHANGED พร้อมราคาเดิม/ใหม่ · เก็บถาวร = PRODUCT_NOT_FOUND · ปิดขายที่สาขา = PRODUCT_UNAVAILABLE)
//     discardHeldCart(ctx, actor, { id }, client?) → { ok:true } | ปฏิเสธ — สิทธิ์เดียวกับล้างบิล (= pos.sale.create ที่สาขานี้) · ไม่ใช่ HELD = NOT_FOUND
//     ขอบเขต (H4): ctx = { tenantId, systemId, unitId } แบบ RegisterCtx · ร้านอื่น/สาขาอื่น = NOT_FOUND · ไม่มี pos.sale.create = PERMISSION_DENIED
//     HeldCartSummary = { id, label: string|null, lineCount, approxTotalSatang, heldByUserId, createdAt (Date|ISO) }
//   register-shared.ts: HELD_CART_EXPIRE_DAYS = 2 · รหัสปฏิเสธ ALREADY_RECALLED · refusalMessageKey("ALREADY_RECALLED") = "errors.alreadyRecalled"
//   register-actions.ts ("use server"): holdRegisterCartAction · listHeldCartsAction · recallHeldCartAction · discardHeldCartAction (async · มี catch · ไม่ throw)
//   RegisterScreen.tsx: onHold (F8 + ปุ่ม pos-reg-hold) → holdRegisterCartAction → resetBill() (H5: หมุนคีย์บิล — ที่เดียวตาม P1.3 S5.21) ·
//     onOpenHeld (ปุ่ม pos-reg-held-bills + ป้ายจำนวน pos-reg-held-count) → ลิ้นชัก pos-reg-held-drawer (ภาพ 14) ·
//     onRecallHeld → recallHeldCartAction → resetBill() ก่อนวางตะกร้าที่คืน (H5: คีย์ใหม่เสมอ · ไม่ใช้คีย์ใดจากบิลที่พัก) ·
//     แถวในลิ้นชัก: pos-reg-held-recall-<id> · pos-reg-held-discard-<id> (≥44px) · ข้อความ pos.register.held.* + errors.alreadyRecalled th+en
//
// ขอบเขต: H เซิร์ฟเวอร์ (พัก · รายการ · เรียกคืน · ทิ้ง · แข่ง · ราคาใหม่ · ขอบเขต · สิทธิ์ · หมดอายุ · ตรวจตะกร้า) · R ปฏิเสธเป็นข้อมูล ·
//   S สถิตของจอ (หมุนคีย์ · F8 · ป้ายจำนวน · ลิ้นชัก · ข้อความ · action) · Z คืนสภาพ
//   ลิ้นชักตามภาพ 14 / การวางตะกร้าบนจอจริง = ผู้คุมงานตรวจที่ visual
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p1.6): SKIP เมื่อของ P1.5 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (ต้องแดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id โดยไม่แตะ DB · --no-db = รันเฉพาะข้อสถิต (S1–S5) โดยไม่โหลด env/prisma (exit 1 ถ้าแดง)
//    ตาราง/คอลัมน์ตรวจจาก Prisma DMMF + information_schema (ไม่มี = SKIP/แดงพร้อมเหตุ ไม่ crash) · ก่อนเขียนแถวแรกต้องเป็น host ep-frosty-lab (QC4) เท่านั้น
//    แถวชั่วคราวติดป้าย `qc-p1.5-<rand>` อยู่ในร้าน QC กาแฟ (สาขา/ระบบ POS sandbox) · ลบทั้งหมดใน finally
//    นับแถวร้าน QC ก่อน/หลังต้องเท่ากัน (Z1 · รวมผลรวมตัวนับใบเสร็จ — พัก/เรียกคืนไม่สร้างบิล) + ลายนิ้วมือแถวเดิม (Z2) · การแข่งใช้ PrismaClient คนละตัว
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const SUITE = "qc-pos-p1.5";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ (id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: "-" = เชิงหน้าที่ล้วน · ค่าอื่น = กลุ่มบังคับใน POS-MASTER-PLAN §3 (X1 idempotency · X2 ข้ามขอบเขต · X3 สิทธิ์ · X4 เงิน · X6 แข่ง · X11 จอสัมผัส/แป้น)
const CHECKS: readonly (readonly [string, string, string])[] = [
  // ── H เซิร์ฟเวอร์ ──
  ["P1.5-H1", "-", "พักบิล: เจ้าของพักตะกร้า 2 บรรทัด (สินค้า ×2 + รายการกำหนดเอง) + ส่วนลดท้ายบิล + ป้าย → ok · แถว HELD ร้าน/สาขา/ระบบถูก · heldByUserId · lineCount 2 · approxTotalSatang = ยอด quote 9,400 · label ตรงตัว · recalledAt null"],
  ["P1.5-H2", "-", "รายการ: listHeldCarts คืนบิลที่พัก (id label lineCount approxTotalSatang heldByUserId createdAt) ใหม่สุดก่อน · count = จำนวน items · แคชเชียร์ที่มีสิทธิ์สาขานี้เห็นบิลที่เจ้าของพัก"],
  ["P1.5-H3", "X1", "เรียกคืน: ตะกร้าที่คืน = ที่พัก (บรรทัด/จำนวน/รายการเอง/ส่วนลดท้ายบิล) · quote ok ยอด 9,400 · แถว RECALLED + recalledAt + recalledByUserId · หายจากรายการ · ครั้งที่ 2 → ALREADY_RECALLED · ทิ้งหลังเรียกคืน → ปฏิเสธ แถวยัง RECALLED · พัก/เรียกคืนไม่สร้างบิลและตัวนับใบเสร็จไม่ขยับ"],
  ["P1.5-H4", "-", "ทิ้ง: discardHeldCart → ok · แถว DISCARDED · หายจากรายการ · เรียกคืนหลังทิ้ง → NOT_FOUND · ทิ้งซ้ำ → NOT_FOUND"],
  ["P1.5-H5", "X4", "ตรวจตะกร้าฝั่งเซิร์ฟเวอร์ตอนพัก: ว่าง · ป้าย 61 ตัว · ป้ายไม่ใช่สตริง · couponCode · คีย์แปลก (idempotencyKey) · qty 0 · 201 บรรทัด · productId ไม่มีจริง · cart ไม่ใช่ object → ปฏิเสธตามรหัส ไม่มีแถวเกิด · ป้าย 60 ตัวพอดี → ok"],
  ["P1.5-H6", "X4", "ราคาในบิลพักไม่ถูกเชื่อ: พักพร้อม unitPriceSatang 1 ของสินค้าแคตตาล็อก → ปฏิเสธ หรือยอดพัก = ราคาจริง 6,000 · แก้ cartJson ใน DB ให้ทุกช่องราคา/ยอด = 1 → เรียกคืนแล้ว quote ราคา 6,000 ยอด 6,000 · บรรทัดที่คืนไม่กลายเป็นราคาเปิด"],
  ["P1.5-H7", "X4", "ราคาใหม่ตอนเรียกคืน (H3): พักตอน ฿50 แล้วเปลี่ยนเป็น ฿60 → quote บรรทัด 6,000 ยอด 9,000 (รวมสินค้าที่ราคาไม่เปลี่ยน 3,000) · notices มี PRICE_CHANGED lineIndex 0 ราคาเดิม 5,000 → 6,000 หนึ่งรายการ · บรรทัดที่ราคาไม่เปลี่ยนไม่มี notice"],
  ["P1.5-H8", "X4", "สินค้าเก็บถาวร / ปิดขายที่สาขา ระหว่างพัก → เรียกคืน ok แถว RECALLED · cart คง 3 บรรทัด · notices PRODUCT_NOT_FOUND@0 + PRODUCT_UNAVAILABLE@1 · quote ไม่ ok (ไม่คิดยอดด้วยราคาเก่าเงียบ ๆ)"],
  ["P1.5-H9", "X6", "เรียกคืนพร้อมกัน 10 connection × 3 รอบ (H2): ทุกรอบ ok 1 · ALREADY_RECALLED 9 · ไม่มีรหัสอื่น · แถว RECALLED โดยเจ้าของ"],
  ["P1.5-H10", "X2", "ข้ามสาขา: พักที่สาขา 1 · สาขา 2 (POS เดียวกัน) list ไม่เห็น · recall/discard ด้วย id → NOT_FOUND · แถวยัง HELD"],
  ["P1.5-H11", "X2", "ข้ามร้าน: ร้าน QC อาหาร (เจ้าของร้านนั้น · POS/สาขาจริงของร้านนั้น) recall/discard ด้วย id ของร้านกาแฟ → NOT_FOUND · list ไม่เห็น · แถวยัง HELD"],
  ["P1.5-H12", "X3", "สิทธิ์: STAFF ไม่มี pos.sale.create → PERMISSION_DENIED ทั้ง 4 ฟังก์ชัน ไม่มีแถว · แคชเชียร์จริง (unitAccess สีลม) ที่สาขา sandbox → NOT_FOUND · แคชเชียร์ที่มีสิทธิ์สาขานี้ ทิ้งและเรียกคืนบิลที่เจ้าของพักได้"],
  ["P1.5-H13", "-", "หมดอายุแบบขี้เกียจ (H4): ปริยาย 2 วัน — อายุ 1 วันยังอยู่ · อายุ 3 วันหายจากรายการและกลายเป็น DISCARDED · เรียกคืนบิลอายุ 3 วัน (ก่อน list) → NOT_FOUND · ตั้ง settings.pos.heldCart.expireDays = 5 → อายุ 3 วันยังอยู่"],
  // ── R ปฏิเสธเป็นข้อมูล ──
  ["P1.5-R1", "-", "คำปฏิเสธของพัก/รายการ/เรียกคืน/ทิ้ง (ALREADY_RECALLED · NOT_FOUND · PERMISSION_DENIED · VALIDATION) = คืน {ok:false, code, message} ไม่ throw"],
  // ── S สถิตของจอ (H5 · H6) ──
  ["P1.5-S1", "X1", "[static · H5] onHold ไม่ใช่ soon: เรียก holdRegisterCartAction · แล้ว resetBill() (หมุนคีย์ที่เดียว) · ไม่พักขณะกำลังส่ง (frozen) หรือตะกร้าว่าง · ไม่ส่ง idemKey/pendingSubmit ไปกับบิลพัก"],
  ["P1.5-S2", "X1", "[static · H5] onRecallHeld: เรียก recallHeldCartAction · resetBill() ก่อนวางตะกร้าที่คืน (คีย์ใหม่) · ไม่ setIdemKey เอง · ไม่อ่านคีย์จากผลเรียกคืน"],
  ["P1.5-S3", "X11", "[static · H6] F8 → onHold · ปุ่ม pos-reg-hold / pos-reg-held-bills ไม่ใช่ onSoon · ป้ายจำนวน pos-reg-held-count · ลิ้นชัก pos-reg-held-drawer · ปุ่มแถว pos-reg-held-recall- / pos-reg-held-discard- ≥44px · จอเรียก listHeldCartsAction"],
  ["P1.5-S4", "-", "ข้อความ pos.register.held.{title empty recall discard label holdDone noticePriceChanged noticeUnavailable} + errors.alreadyRecalled มี th+en · en ไม่มีอักษรไทย · ใช้ในจอ · refusalMessageKey(ALREADY_RECALLED) = errors.alreadyRecalled"],
  ["P1.5-S5", "-", "[static] register-actions.ts: \"use server\" · export เฉพาะ async · ไม่มี throw · holdRegisterCartAction listHeldCartsAction recallHeldCartAction discardHeldCartAction แต่ละตัวเรียกฟังก์ชันบริการของมัน + มี catch · register-shared export HELD_CART_EXPIRE_DAYS = 2"],
  // ── Z คืนสภาพ ──
  ["P1.5-Z1", "-", "QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ · รวม PosHeldCart) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ"],
  ["P1.5-Z2", "-", "QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · AppSystem · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter · PosHeldCart) ทุกคอลัมน์ ก่อน = หลัง"],
] as const;

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
  if (!TITLE.has(id)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${id}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(id, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${id}] ${TITLE.get(id)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
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
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : "UNKNOWN");
const refused = (r: Any, codes: string[]) => r?.ok === false && codes.includes(String(r.code));
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  if (m) return m[1];
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
/** เนื้อของ `const <name> = …` (ฟังก์ชันลูกศร/useCallback) · `const x = soon;` ไม่มีบล็อก = คืนบรรทัดนั้น · ไม่พบ = "" */
const constBody = (src: string, name: string): string => {
  const k = src.search(new RegExp(`const\\s+${name}\\s*=`));
  if (k < 0) return "";
  const semi = src.indexOf(";", k);
  const line = src.slice(k, semi < 0 ? undefined : semi + 1);
  if (!/=>|function/.test(line.slice(0, 200)) && !line.includes("{")) return line;
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
/** ช่วงซอร์สจาก testid ถึง data-testid ตัวถัดไป (≤ 600 ตัว) — ใช้ดู onClick ของแท็กนั้น (tagOf ตัดที่ '>' ของ '=>' ได้) */
const testidWindow = (code: string, t: string): string => {
  const i = code.indexOf(t);
  if (i < 0) return "";
  const nx = code.indexOf("data-testid", i + t.length);
  return code.slice(i, Math.min(nx < 0 ? code.length : nx, i + 600));
};
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
      /* ไฟล์พัง = คีย์หาย (S4 แดงเอง) */
    }
  }
  return keys;
}

const HELD_FILE = "src/lib/modules/pos/held-cart.ts";
const ACT_FILE = "src/lib/modules/pos/register-actions.ts";
const REG_SHARED_FILE = "src/lib/modules/pos/register-shared.ts";
const RS_FILE = "src/components/pos/register/RegisterScreen.tsx";
const REG_UI_DIRS = ["src/components/pos/register", "src/app/app/sys/[id]/pos"];
const HELD_FNS = ["holdRegisterCart", "listHeldCarts", "recallHeldCart", "discardHeldCart"] as const;
const HELD_ACTIONS: [string, string][] = HELD_FNS.map((f) => [`${f}Action`, f]);
const HELD_KEYS = ["title", "empty", "recall", "discard", "label", "holdDone", "noticePriceChanged", "noticeUnavailable"] as const;
const heldSrc = stripComments(rd(HELD_FILE));
const actRaw = rd(ACT_FILE);
const actSrc = stripComments(actRaw);
const regSharedSrc = stripComments(rd(REG_SHARED_FILE));
const RS = stripComments(rd(RS_FILE));
const regUiCode = REG_UI_DIRS.flatMap((d) => walk(d)).map((f) => stripComments(rd(f))).filter((s) => s.includes("pos-reg-")).join("\n");

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB · S1–S5) ═════════════════════════
async function runStatic(): Promise<void> {
  console.log("\n── S ข้อสถิต (ไม่แตะ DB) ──");
  const regShared = await tryImport("@/lib/modules/pos/register-shared");
  const resetCall = /\bresetBill\s*\(\s*\)/;

  // S1 onHold
  const s1: string[] = [];
  const hold = constBody(RS, "onHold");
  if (!hold) s1.push("ไม่มี const onHold");
  else if (/^const\s+onHold\s*=\s*soon\s*;/.test(hold.trim())) s1.push("onHold ยัง = soon");
  else {
    if (!/holdRegisterCartAction\s*\(/.test(hold)) s1.push("onHold ไม่เรียก holdRegisterCartAction");
    if (!resetCall.test(hold)) s1.push("onHold ไม่เรียก resetBill() (หมุนคีย์)");
    if (!/\bfrozen(Ref\.current)?\b/.test(hold)) s1.push("onHold ไม่กันตอนกำลังส่ง (frozen)");
    if (!/lines\.length/.test(hold)) s1.push("onHold ไม่กันตะกร้าว่าง");
    if (/\bidemKey\b|pendingSubmit/.test(hold)) s1.push("onHold แตะ idemKey/pendingSubmit");
    const iAct = hold.search(/holdRegisterCartAction\s*\(/);
    const iReset = hold.search(resetCall);
    if (iAct >= 0 && iReset >= 0 && iReset < iAct) s1.push("resetBill ก่อนพักสำเร็จ (ตะกร้าหายถ้าพักล้ม)");
  }
  chk("P1.5-S1", s1.length === 0, "action → resetBill · กัน frozen/ว่าง · ไม่แตะคีย์", s1.join(" · ") || "ครบ");

  // S2 onRecallHeld
  const s2: string[] = [];
  const rec = constBody(RS, "onRecallHeld");
  if (!rec) s2.push("ไม่มี const onRecallHeld");
  else {
    const iAct = rec.search(/recallHeldCartAction\s*\(/);
    const iReset = rec.search(resetCall);
    const applyRe = /\b(changeCart|setCart|updateCart)\s*\(/g;
    const applies = [...rec.matchAll(applyRe)].map((m) => m.index ?? -1);
    if (iAct < 0) s2.push("ไม่เรียก recallHeldCartAction");
    if (iReset < 0) s2.push("ไม่เรียก resetBill() (คีย์ใหม่)");
    if (!applies.length) s2.push("ไม่วางตะกร้าที่คืน (changeCart/setCart/updateCart)");
    else if (iReset >= 0 && !applies.some((i) => i > iReset)) s2.push("วางตะกร้าก่อน resetBill (resetBill จะล้างทิ้ง)");
    if (/setIdemKey\s*\(/.test(rec)) s2.push("setIdemKey เอง (หมุนคีย์ได้เฉพาะใน resetBill · P1.3 S5.21)");
    if (/idempotencyKey/.test(rec)) s2.push("อ่าน/ส่ง idempotencyKey จากบิลพัก");
  }
  chk("P1.5-S2", s2.length === 0, "action → resetBill → วางตะกร้า · ไม่แตะคีย์เอง", s2.join(" · ") || "ครบ");

  // S3 F8 · ปุ่ม · ป้าย · ลิ้นชัก
  const s3: string[] = [];
  const f8 = RS.indexOf('"F8"');
  if (f8 < 0 || !/onHold\s*\(/.test(RS.slice(f8, f8 + 200))) s3.push("F8 ไม่เรียก onHold");
  for (const t of ["pos-reg-hold", "pos-reg-held-bills"]) {
    const w = testidWindow(regUiCode, `"${t}"`);
    if (!w) s3.push(`ไม่มี ${t}`);
    else if (/onSoon|\bsoon\b|aria-disabled=["']true["']/.test(w)) s3.push(`${t} ยังเป็น soon (onSoon / t("soon") / aria-disabled="true")`);
  }
  for (const t of ["pos-reg-held-count", "pos-reg-held-drawer"]) if (!regUiCode.includes(t)) s3.push(`ไม่มี ${t}`);
  for (const t of ["pos-reg-held-recall-", "pos-reg-held-discard-"]) {
    const tag = tagOf(regUiCode, t);
    if (!tag) s3.push(`ไม่มี ${t}`);
    else if (!TOUCH.test(tag)) s3.push(`${t} ไม่มีคลาส ≥44px`);
  }
  if (!/listHeldCartsAction\s*\(/.test(regUiCode)) s3.push("จอไม่เรียก listHeldCartsAction (ป้ายจำนวน/ลิ้นชัก)");
  chk("P1.5-S3", s3.length === 0, "F8 · ปุ่มจริง · ป้าย · ลิ้นชัก · แถว ≥44px · list", s3.join(" · ") || "ครบ");

  // S4 ข้อความ + refusalMessageKey
  const th = posMessages("th");
  const en = posMessages("en");
  const thai = /[฀-๿]/;
  const s4: string[] = [];
  const keys = [...HELD_KEYS.map((k) => `held.${k}`), "errors.alreadyRecalled"];
  for (const k of keys) {
    const full = `pos.register.${k}`;
    const t = th.get(full);
    const e = en.get(full);
    if (typeof t !== "string" || !t.trim()) s4.push(`${k}: th ขาด`);
    if (typeof e !== "string" || !e.trim()) s4.push(`${k}: en ขาด`);
    else if (thai.test(e)) s4.push(`${k}: en มีอักษรไทย`);
    if (k.startsWith("held.") && !new RegExp(`["'\`]${k.replace(".", "\\.")}["'\`]`).test(regUiCode)) s4.push(`${k}: ไม่ถูกใช้ในจอ`);
  }
  const mk = callSync(regShared, "refusalMessageKey", "ALREADY_RECALLED");
  if (mk !== "errors.alreadyRecalled") s4.push(`refusalMessageKey(ALREADY_RECALLED)=${short(mk, 40)}`);
  chk("P1.5-S4", s4.length === 0, `${keys.length} คีย์ th+en · ใช้ในจอ · refusalMessageKey`, s4.slice(0, 8).join(" · ") + (s4.length > 8 ? ` …(+${s4.length - 8})` : "") || "ครบ");

  // S5 actions + ค่าคงที่
  const s5: string[] = [];
  if (!/^\s*["']use server["']/.test(actRaw.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, ""))) s5.push(`${ACT_FILE}: ไม่มี "use server" บรรทัดแรก`);
  const exps = [...actSrc.matchAll(/^\s*export\b[^\n]*/gm)].map((m) => m[0].trim());
  const nonFn = exps.filter((x) => !/^export\s+async\s+function\s+\w+/.test(x));
  if (nonFn.length) s5.push(`export ไม่ใช่ async function (${nonFn.slice(0, 2).join(" | ")})`);
  if (/\bthrow\b/.test(actSrc)) s5.push("มี throw");
  const names = exps.map((x) => /^export\s+async\s+function\s+(\w+)/.exec(x)?.[1]).filter((x): x is string => !!x);
  for (const [a, f] of HELD_ACTIONS) {
    if (!names.includes(a)) {
      s5.push(`ไม่มี ${a}`);
      continue;
    }
    const at = actSrc.search(new RegExp(`export\\s+async\\s+function\\s+${a}\\b`));
    const body = actSrc.slice(at).split(/\n\s*export\s+/)[0] ?? "";
    if (!new RegExp(`\\b${f}\\s*\\(`).test(body)) s5.push(`${a} ไม่เรียก ${f}`);
    if (!/\bcatch\b/.test(body)) s5.push(`${a} ไม่มี catch`);
  }
  if (!exportsFn(regSharedSrc, "HELD_CART_EXPIRE_DAYS")) s5.push("register-shared ไม่ export HELD_CART_EXPIRE_DAYS");
  else if (regShared && regShared.HELD_CART_EXPIRE_DAYS !== 2) s5.push(`HELD_CART_EXPIRE_DAYS=${short(regShared.HELD_CART_EXPIRE_DAYS, 20)}`);
  chk("P1.5-S5", s5.length === 0, "use server · async ล้วน · ไม่ throw · 4 action เรียกบริการ + catch · ค่าคงที่ 2", s5.join(" · ") || "ครบ");
}
const STATIC_IDS = ["P1.5-S1", "P1.5-S2", "P1.5-S3", "P1.5-S4", "P1.5-S5"];

const skipReasons: string[] = [];
for (const f of HELD_FNS) if (!exportsFn(heldSrc, f)) skipReasons.push(`${HELD_FILE} ยังไม่มี export ${f}`);
if (/const\s+onHold\s*=\s*soon\s*;/.test(RS)) skipReasons.push(`${RS_FILE}: onHold ยัง = soon (H6)`);

// ═════════════════════════ 1b. --no-db ═════════════════════════
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อสถิต (ไม่ผ่านด่าน SKIP · ข้อ H R Z ต้องใช้ DB)`);
  if (skipReasons.length) console.log(`   (ของ P1.5 ที่ยังขาด: ${skipReasons.join(" | ")})`);
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
function assertQc4BeforeWrite(): void {
  const mark = envMod.POS_QC_HOST_MARK as string;
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u.includes(mark));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: จะเขียนแถวได้เฉพาะ QC4 (${mark}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
}

// ═════════════════════════ 3. ด่าน SKIP (ตาราง/คอลัมน์ + ของ P1.5) ═════════════════════════
const { prisma } = (await import("@/lib/core/db")) as Any;
const P = prisma as Any;
const prismaPkg = (await import("@prisma/client")) as Any;
const DMMF = ((prismaPkg?.Prisma ?? prismaPkg?.default?.Prisma)?.dmmf?.datamodel ?? { models: [] }) as { models: { name: string; fields: { name: string }[] }[] };
const HELD_COLS = ["id", "tenantId", "unitId", "systemId", "label", "cartJson", "lineCount", "approxTotalSatang", "heldByUserId", "recalledAt", "recalledByUserId", "status", "createdAt", "version"] as const;
const dbHeldCols = new Set<string>();
try {
  const rows = (await P.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'PosHeldCart'`)) as Any[];
  for (const r of rows) dbHeldCols.add(String(r.column_name));
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
const dmmfHeld = DMMF.models.find((m) => m.name === "PosHeldCart");
const clientHas = (f: string) => (DMMF.models.length ? !!dmmfHeld?.fields.some((x) => x.name === f) : typeof P.posHeldCart?.findMany === "function");
const HC: Any = typeof P.posHeldCart?.findMany === "function" ? P.posHeldCart : null;
const missingCols = HELD_COLS.filter((c) => !clientHas(c) || !dbHeldCols.has(c));
if (!HC) skipReasons.push("Prisma client ยังไม่มี delegate posHeldCart (H1 · ยังไม่ generate หรือยังไม่มี model)");
if (missingCols.length) skipReasons.push(`ตาราง PosHeldCart ขาดคอลัมน์: ${missingCols.map((c) => `${c}(client ${clientHas(c) ? "✓" : "✗"} · DB ${dbHeldCols.has(c) ? "✓" : "✗"})`).join(" ")}`);

let scope: Any = null;
let restoScope: Any = null;
try {
  scope = await envMod.resolvePosScope(prisma, "coffee");
  restoScope = await envMod.resolvePosScope(prisma, "resto");
} catch (e) {
  console.log(`  (resolvePosScope ล้ม: ${(e as Error).message.slice(0, 120)})`);
}
if (!scope) skipReasons.push("ชุดข้อมูล QC POS (ร้านกาแฟ) ยังไม่ถูก seed บน DB นี้ — รัน scripts/seed-pos-qc.mts ก่อน");
if (!restoScope) skipReasons.push("ชุดข้อมูล QC POS (ร้านอาหาร) ยังไม่ถูก seed — ข้อ H11 ต้องใช้");

const COUNT_MODELS = [
  "posSale", "posSaleLine", "posPayment", "posReceiptCounter", "outboxEvent", "appSystem", "appSystemUnit", "businessUnit", "auditLog",
  "posProduct", "posCategory", "posHeldCart", "approvalRequest",
] as const;
const FP_MODELS = ["posProduct", "posCategory", "appSystem", "appSystemUnit", "businessUnit", "membership", "posReceiptCounter", "posHeldCart"] as const;
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
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P1.5 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง)`);
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
const held = existsSync(join(ROOT, HELD_FILE)) ? await tryImport("@/lib/modules/pos/held-cart") : null;
const register = await tryImport("@/lib/modules/pos/register");
const catalog = await tryImport("@/lib/modules/pos/catalog");
const sysSvc = await tryImport("@/lib/modules/system/service");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p1.5-${RAND}`;
const runStart = new Date();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DAY = 86_400_000;

// ═════════════════════════ 5. ข้อที่ต้องมี DB (sandbox) ═════════════════════════
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => id.startsWith("P1.5-H") || id === "P1.5-R1");
const sb = { unitIds: [] as string[], systemIds: [] as string[], productIds: [] as string[] };
const lanes: Any[] = [];
async function lane(i: number): Promise<Any> {
  if (lanes[i]) return lanes[i];
  const { PrismaClient } = (await import("@prisma/client")) as Any;
  const { PrismaPg } = (await import("@prisma/adapter-pg")) as Any;
  while (lanes.length <= i) lanes.push(new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }) }));
  return lanes[i];
}
/** แถว PosHeldCart (ไม่มี delegate = null) */
const rowOf = async (id: string | null | undefined): Promise<Any> => (HC && id ? HC.findUnique({ where: { id } }).catch(() => null) : null);
const setRow = async (id: string, data: Any): Promise<string> => {
  if (!HC) return "ไม่มี delegate posHeldCart";
  try {
    await HC.update({ where: { id }, data });
    return "";
  } catch (e) {
    return `update ล้ม: ${(e as Error).message.slice(0, 80)}`;
  }
};
const rowsIn = async (unitId: string): Promise<number> => (HC ? HC.count({ where: { unitId } }).catch(() => NaN) : NaN);
/** ทุกช่องตัวเลขที่ชื่อเกี่ยวกับราคา/ยอด (ไม่ใช่ qty) ใน JSON = 1 — จำลองการแก้ cartJson ใน DB */
function tamperPrices(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(tamperPrices);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = typeof x === "number" && /price|satang|total|amount/i.test(k) ? 1 : tamperPrices(x);
    return o;
  }
  return v;
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
  const realCashier = actor(mCash, PQC.coffee.users.cashier.userId, "STAFF");
  const restoOwner = actor(mROwner, PQC.resto.users.owner.userId, "OWNER");

  // ─── sandbox (เขียนแถวแรก ⇒ ด่าน host QC4 ก่อน) ───
  assertQc4BeforeWrite();
  console.log(`\n── sandbox ${TAG} (สาขา 2 + ระบบ POS ชั่วคราวในร้าน QC กาแฟ) ──`);
  let fx = "";
  let u1 = "", u2 = "", posS = "";
  try {
    for (const label of ["u1", "u2"]) {
      const u = await P.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: `${TAG} ${label}`, slug: `${TAG}-${label}` } });
      sb.unitIds.push(u.id);
    }
    [u1, u2] = sb.unitIds as [string, string];
    const s = await P.appSystem.create({ data: { tenantId: tid, type: "POS", name: `${TAG} POS-S` } });
    sb.systemIds.push(s.id);
    posS = s.id;
    await sysSvc.linkUnit(tid, posS, u1);
    await sysSvc.linkUnit(tid, posS, u2);
  } catch (e) {
    fx = `sandbox:${(e as Error).message.slice(0, 120)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const ctx1 = { tenantId: tid, systemId: posS, unitId: u1 };
  const ctx2 = { tenantId: tid, systemId: posS, unitId: u2 };
  const ctxR = { tenantId: restoTid, systemId: PQC.resto.systems.POS.id, unitId: PQC.resto.units.main.id };
  const cashierU1 = actor(mCash, PQC.coffee.users.cashier.userId, "STAFF", { unitAccess: [u1], permissions: { "pos.sale.create": true } });
  const noCreate = actor(mCash, PQC.coffee.users.cashier.userId, "STAFF", { unitAccess: [u1], permissions: {} });
  const SYSTEM_ACTOR: unknown = catalog?.CATALOG_SYSTEM_ACTOR ?? owner.userId;
  const cctx = { tenantId: tid, systemId: posS, actorUserId: SYSTEM_ACTOR };
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const must = (label: string, r: Any): Any => {
    if (r?.ok === false) throw Object.assign(new Error(`${label} ล้ม: ${short(r)}`), { code: r.code });
    return r;
  };
  const mkProd = async (name: string, price: number): Promise<string> => {
    const r = must("createProduct", await call(catalog, "createProduct", cctx, { name, kind: "PRODUCT", basePriceSatang: price }));
    const id = typeof r === "string" ? r : r?.id;
    if (!id) throw new Error(`createProduct ไม่คืน id: ${short(r)}`);
    sb.productIds.push(id);
    return id;
  };
  const hold = (c: Any, a: Any, input: Any, client?: Any) => (client ? call(held, "holdRegisterCart", c, a, input, client) : call(held, "holdRegisterCart", c, a, input));
  const list = (c: Any, a: Any) => call(held, "listHeldCarts", c, a);
  const recall = (c: Any, a: Any, id: string, client?: Any) => (client ? call(held, "recallHeldCart", c, a, { id }, client) : call(held, "recallHeldCart", c, a, { id }));
  const discard = (c: Any, a: Any, id: string) => call(held, "discardHeldCart", c, a, { id });
  const hid = (r: Any): string => (r?.ok === true ? String(r.heldCart?.id ?? "") : "");
  const listIds = (r: Any): string[] => (r?.ok === true && Array.isArray(r.items) ? r.items.map((x: Any) => x?.id) : []);
  const dataRefusals: [string, Any, string][] = [];

  let A = "", T = "", R = "", U = "", X = "", Y = "", Z = "";
  try {
    if (!fx) {
      A = await mkProd("ลาเต้พัก P1.5", 4500);
      T = await mkProd("เค้กราคาจริง P1.5", 6000);
      R = await mkProd("ชาไทยขึ้นราคา P1.5", 5000);
      U = await mkProd("น้ำเปล่าราคาคงที่ P1.5", 3000);
      X = await mkProd("ขนมเลิกขาย P1.5", 2000);
      Y = await mkProd("ขนมปิดขายสาขา P1.5", 2000);
      Z = await mkProd("ขนมปกติ P1.5", 2000);
    }
  } catch (e) {
    fx ||= `product:${(e as Error).message.slice(0, 100)}`;
  }
  const cartMain = () => ({ lines: [{ productId: A, qty: 2 }, { name: "ค่าห่อของขวัญ", qty: 1, unitPriceSatang: 500 }], billDiscount: { type: "AMOUNT", value: 100 } });
  const LABEL = "โต๊ะ 5 · พี่แว่น";

  // ════════ H1 พัก ════════
  const h1 = await hold(ctx1, owner, { cart: cartMain(), label: LABEL });
  const id1 = hid(h1);
  {
    const row = await rowOf(id1);
    const p: string[] = [];
    if (h1?.ok !== true || !id1) p.push(`hold ${codeOf(h1)} ${short(h1?.message ?? "", 60)}`);
    if (!row) p.push("ไม่มีแถว");
    else {
      if (row.status !== "HELD") p.push(`status ${row.status}`);
      if (row.tenantId !== tid || row.unitId !== u1 || row.systemId !== posS) p.push("ร้าน/สาขา/ระบบ ผิด");
      if (row.heldByUserId !== owner.userId) p.push(`heldBy ${row.heldByUserId}`);
      if (row.lineCount !== 2) p.push(`lineCount ${row.lineCount}`);
      if (row.approxTotalSatang !== 9400) p.push(`approx ${row.approxTotalSatang}`);
      if (row.label !== LABEL) p.push(`label ${short(row.label, 30)}`);
      if (row.recalledAt !== null) p.push("recalledAt ไม่ null");
      if (typeof row.version !== "number") p.push(`version ${short(row.version, 20)}`);
    }
    if (h1?.ok === true && !(h1.heldCart?.approxTotalSatang === 9400 && h1.heldCart?.lineCount === 2)) p.push(`summary ${short(h1.heldCart, 80)}`);
    chk("P1.5-H1", p.length === 0, "HELD · ขอบเขตถูก · 2 บรรทัด · 9,400 · ป้ายตรง", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ H2 รายการ ════════
  {
    const h2 = await hold(ctx1, owner, { cart: { lines: [{ productId: U, qty: 1 }] } });
    const id2 = hid(h2);
    // ให้ลำดับชัด: id1 เก่ากว่า 1 นาที
    const e = id1 ? await setRow(id1, { createdAt: new Date(Date.now() - 60_000) }) : "ไม่มี id1";
    const lo = await list(ctx1, owner);
    const lc = await list(ctx1, cashierU1);
    const items: Any[] = lo?.ok === true && Array.isArray(lo.items) ? lo.items : [];
    const it1 = items.find((x) => x?.id === id1);
    const p: string[] = [];
    if (lo?.ok !== true) p.push(`list ${codeOf(lo)}`);
    if (!it1) p.push("ไม่เห็นบิลที่พัก");
    else {
      if (it1.label !== LABEL || it1.lineCount !== 2 || it1.approxTotalSatang !== 9400 || it1.heldByUserId !== owner.userId) p.push(`ฟิลด์ ${short(it1, 100)}`);
      if (Number.isNaN(new Date(it1.createdAt).getTime())) p.push("createdAt อ่านไม่ได้");
    }
    if (lo?.ok === true && lo.count !== items.length) p.push(`count ${lo.count} ≠ ${items.length}`);
    const i1 = items.findIndex((x) => x?.id === id1);
    const i2 = items.findIndex((x) => x?.id === id2);
    if (!(i2 >= 0 && i1 >= 0 && i2 < i1)) p.push(`ลำดับ ใหม่@${i2} เก่า@${i1}${e ? ` (${e})` : ""}`);
    if (!listIds(lc).includes(id1)) p.push(`แคชเชียร์สาขานี้ไม่เห็น (${codeOf(lc)})`);
    chk("P1.5-H2", p.length === 0, "เห็นครบฟิลด์ · ใหม่สุดก่อน · count · แคชเชียร์เห็น", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ H3 เรียกคืน ════════
  {
    const salesBefore = await P.posSale.count({ where: { unitId: { in: [u1, u2].filter(Boolean) } } });
    const r = await recall(ctx1, owner, id1);
    const row = await rowOf(id1);
    const p: string[] = [];
    if (r?.ok !== true) p.push(`recall ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else {
      const L = r.cart?.lines ?? [];
      const l0 = L[0] ?? {};
      const l1 = L[1] ?? {};
      if (!(L.length === 2 && l0.productId === A && l0.qty === 2 && l1.name === "ค่าห่อของขวัญ" && l1.qty === 1 && l1.unitPriceSatang === 500)) p.push(`cart ${short(L, 120)}`);
      if (!(r.cart?.billDiscount?.type === "AMOUNT" && r.cart?.billDiscount?.value === 100)) p.push(`billDiscount ${short(r.cart?.billDiscount, 40)}`);
      if (!(r.quote?.ok === true && r.quote.grandTotalSatang === 9400)) p.push(`quote ${codeOf(r.quote)} ${r.quote?.grandTotalSatang ?? "-"}`);
      if (r.heldCartId !== id1) p.push(`heldCartId ${short(r.heldCartId, 30)}`);
      if (!Array.isArray(r.notices) || r.notices.length !== 0) p.push(`notices ${short(r.notices, 60)}`);
    }
    if (!row || row.status !== "RECALLED" || !row.recalledAt || row.recalledByUserId !== owner.userId) p.push(`แถว ${row ? `${row.status} at:${!!row.recalledAt} by:${row.recalledByUserId}` : "ไม่มี"}`);
    const lo = await list(ctx1, owner);
    if (listIds(lo).includes(id1)) p.push("ยังอยู่ในรายการ");
    const again = await recall(ctx1, owner, id1);
    dataRefusals.push(["recall ซ้ำ", again, "ALREADY_RECALLED"]);
    if (!refused(again, ["ALREADY_RECALLED"])) p.push(`ครั้งที่ 2 ${codeOf(again)}`);
    const dAfter = await discard(ctx1, owner, id1);
    if (dAfter?.ok !== false) p.push(`ทิ้งหลังเรียกคืน ${codeOf(dAfter)}`);
    const row2 = await rowOf(id1);
    if (row2?.status !== "RECALLED") p.push(`หลังทิ้ง status ${row2?.status}`);
    const salesAfter = await P.posSale.count({ where: { unitId: { in: [u1, u2].filter(Boolean) } } });
    const ctr = ((await P.posReceiptCounter.findMany({ where: { unitId: { in: [u1, u2].filter(Boolean) } }, select: { seq: true } })) as Any[]).reduce((t, x) => t + Number(x.seq), 0);
    if (salesAfter !== salesBefore || salesAfter !== 0 || ctr !== 0) p.push(`บิล ${salesBefore}→${salesAfter} ตัวนับ ${ctr}`);
    chk("P1.5-H3", p.length === 0, "ตะกร้าเดิม · quote 9,400 · RECALLED · ซ้ำ = ALREADY_RECALLED · ไม่มีบิล", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ H4 ทิ้ง ════════
  {
    const h = await hold(ctx1, owner, { cart: { lines: [{ productId: U, qty: 3 }] }, label: "ทิ้ง" });
    const id = hid(h);
    const d = await discard(ctx1, owner, id);
    const row = await rowOf(id);
    const lo = await list(ctx1, owner);
    const r = await recall(ctx1, owner, id);
    const d2 = await discard(ctx1, owner, id);
    dataRefusals.push(["recall หลังทิ้ง", r, "NOT_FOUND"]);
    const p: string[] = [];
    if (!id) p.push(`hold ${codeOf(h)}`);
    if (d?.ok !== true) p.push(`discard ${codeOf(d)}`);
    if (row?.status !== "DISCARDED") p.push(`status ${row?.status}`);
    if (listIds(lo).includes(id)) p.push("ยังอยู่ในรายการ");
    if (!refused(r, ["NOT_FOUND"])) p.push(`recall หลังทิ้ง ${codeOf(r)}`);
    if (!refused(d2, ["NOT_FOUND"])) p.push(`ทิ้งซ้ำ ${codeOf(d2)}`);
    chk("P1.5-H4", p.length === 0, "DISCARDED · หายจากรายการ · recall/ทิ้งซ้ำ = NOT_FOUND", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ H5 ตรวจตะกร้าตอนพัก ════════
  {
    const before = await rowsIn(u1);
    const cases: [string, Any, string[]][] = [
      ["ว่าง", { cart: { lines: [] } }, ["VALIDATION"]],
      ["ป้าย 61", { cart: { lines: [{ productId: U, qty: 1 }] }, label: "ก".repeat(61) }, ["VALIDATION"]],
      ["ป้ายตัวเลข", { cart: { lines: [{ productId: U, qty: 1 }] }, label: 12345 }, ["VALIDATION"]],
      ["คูปอง", { cart: { lines: [{ productId: U, qty: 1 }], couponCode: "FREE" } }, ["VALIDATION"]],
      ["คีย์แปลก", { cart: { lines: [{ productId: U, qty: 1 }], idempotencyKey: "abcdefgh1234" } }, ["VALIDATION"]],
      ["qty 0", { cart: { lines: [{ productId: U, qty: 0 }] } }, ["VALIDATION", "INVALID_LINE"]],
      ["201 บรรทัด", { cart: { lines: Array.from({ length: 201 }, () => ({ productId: U, qty: 1 })) } }, ["TOO_MANY_LINES", "VALIDATION"]],
      ["สินค้าไม่มีจริง", { cart: { lines: [{ productId: "nope-not-a-product", qty: 1 }] } }, ["PRODUCT_NOT_FOUND"]],
      ["cart สตริง", { cart: "lines" }, ["VALIDATION"]],
    ];
    const p: string[] = [];
    for (const [label, input, codes] of cases) {
      const r = await hold(ctx1, owner, input);
      if (label === "ป้าย 61") dataRefusals.push(["hold ป้าย 61", r, "VALIDATION"]);
      if (!refused(r, codes)) p.push(`${label}: ${codeOf(r)}`);
    }
    const mid = await rowsIn(u1);
    if (mid !== before) p.push(`มีแถวเกิด ${before}→${mid}`);
    const ok60 = await hold(ctx1, owner, { cart: { lines: [{ productId: U, qty: 1 }] }, label: "ข".repeat(60) });
    if (ok60?.ok !== true) p.push(`ป้าย 60: ${codeOf(ok60)}`);
    chk("P1.5-H5", p.length === 0, "9 กรณีปฏิเสธไม่มีแถว · ป้าย 60 ok", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ H6 ราคาในบิลพักไม่ถูกเชื่อ ════════
  {
    const p: string[] = [];
    const c1 = await hold(ctx1, owner, { cart: { lines: [{ productId: T, qty: 1, unitPriceSatang: 1 }] } });
    if (c1?.ok === true) {
      if (c1.heldCart?.approxTotalSatang !== 6000) p.push(`พักพร้อมราคา client: approx ${c1.heldCart?.approxTotalSatang}`);
    } else if (!refused(c1, ["VALIDATION", "PERMISSION_DENIED"])) p.push(`พักพร้อมราคา client: ${codeOf(c1)}`);
    const h = await hold(ctx1, owner, { cart: { lines: [{ productId: T, qty: 1 }] } });
    const id = hid(h);
    const row = await rowOf(id);
    if (!row) p.push(`ไม่มีแถว (${codeOf(h)})`);
    else {
      const e = await setRow(id, { cartJson: tamperPrices(row.cartJson), approxTotalSatang: 1 });
      if (e) p.push(e);
      const r = await recall(ctx1, owner, id);
      const q = r?.quote;
      if (r?.ok !== true) p.push(`recall ${codeOf(r)}`);
      else {
        if (!(q?.ok === true && q.lines?.[0]?.unitPriceSatang === 6000 && q.grandTotalSatang === 6000)) p.push(`quote ${codeOf(q)} ราคา ${q?.lines?.[0]?.unitPriceSatang ?? "-"} ยอด ${q?.grandTotalSatang ?? "-"}`);
        if (r.cart?.lines?.[0]?.openPrice === true) p.push("บรรทัดที่คืนกลายเป็นราคาเปิด");
      }
    }
    chk("P1.5-H6", p.length === 0, "ราคา client/ราคาที่แก้ใน DB ไม่ถูกใช้ · quote 6,000", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ H7 ราคาใหม่ตอนเรียกคืน ════════
  {
    const p: string[] = [];
    const h = await hold(ctx1, owner, { cart: { lines: [{ productId: R, qty: 1 }, { productId: U, qty: 1 }] } });
    const id = hid(h);
    if (!id) p.push(`hold ${codeOf(h)}`);
    if (h?.ok === true && h.heldCart?.approxTotalSatang !== 8000) p.push(`approx ตอนพัก ${h.heldCart?.approxTotalSatang}`);
    const sp = await call(catalog, "setPrice", cctx, R, 6000);
    if (sp?.ok === false) p.push(`setPrice ${codeOf(sp)}`);
    const r = await recall(ctx1, owner, id);
    if (r?.ok !== true) p.push(`recall ${codeOf(r)}`);
    else {
      const q = r.quote;
      if (!(q?.ok === true && q.lines?.[0]?.unitPriceSatang === 6000 && q.lines?.[1]?.unitPriceSatang === 3000 && q.grandTotalSatang === 9000)) p.push(`quote ${codeOf(q)} ${short(q?.lines?.map((l: Any) => l.unitPriceSatang), 40)} ยอด ${q?.grandTotalSatang ?? "-"}`);
      const ns: Any[] = Array.isArray(r.notices) ? r.notices : [];
      const pc = ns.filter((n) => n?.code === "PRICE_CHANGED");
      if (!(pc.length === 1 && pc[0].lineIndex === 0 && pc[0].heldUnitPriceSatang === 5000 && pc[0].unitPriceSatang === 6000)) p.push(`notices ${short(ns, 120)}`);
      if (ns.some((n) => n?.lineIndex === 1)) p.push("บรรทัดราคาคงที่มี notice");
    }
    chk("P1.5-H7", p.length === 0, "quote 6,000+3,000 = 9,000 · PRICE_CHANGED@0 5,000→6,000 เท่านั้น", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ H8 เก็บถาวร / ปิดขาย ════════
  {
    const p: string[] = [];
    const h = await hold(ctx1, owner, { cart: { lines: [{ productId: X, qty: 1 }, { productId: Y, qty: 1 }, { productId: Z, qty: 1 }] } });
    const id = hid(h);
    if (!id) p.push(`hold ${codeOf(h)}`);
    const a1 = await call(catalog, "archive", cctx, X);
    const a2 = await call(catalog, "updateProduct", cctx, Y, { availability: { [u1]: false } });
    if (a1?.ok === false || a2?.ok === false) p.push(`fixture archive ${codeOf(a1)} / availability ${codeOf(a2)}`);
    const r = await recall(ctx1, owner, id);
    const row = await rowOf(id);
    if (r?.ok !== true) p.push(`recall ${codeOf(r)}`);
    else {
      if (r.cart?.lines?.length !== 3) p.push(`cart ${r.cart?.lines?.length ?? "-"} บรรทัด`);
      const ns: Any[] = Array.isArray(r.notices) ? r.notices : [];
      if (!ns.some((n) => n?.lineIndex === 0 && n?.code === "PRODUCT_NOT_FOUND")) p.push(`ไม่มี PRODUCT_NOT_FOUND@0 (${short(ns, 80)})`);
      if (!ns.some((n) => n?.lineIndex === 1 && n?.code === "PRODUCT_UNAVAILABLE")) p.push(`ไม่มี PRODUCT_UNAVAILABLE@1 (${short(ns, 80)})`);
      if (r.quote?.ok === true) p.push(`quote ok ยอด ${r.quote.grandTotalSatang} (คิดเงียบ ๆ)`);
    }
    if (row?.status !== "RECALLED") p.push(`status ${row?.status}`);
    chk("P1.5-H8", p.length === 0, "ok · 3 บรรทัด · notices 2 ตัว · quote ไม่ ok", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ H9 แข่งเรียกคืน 10×3 ════════
  {
    const res9: string[] = [];
    let ok9 = true;
    for (let round = 0; round < 3; round++) {
      const h = await hold(ctx1, owner, { cart: { lines: [{ productId: U, qty: round + 1 }] }, label: `แข่ง ${round}` });
      const id = hid(h);
      if (!id) {
        res9.push(`r${round}: hold ${codeOf(h)}`);
        ok9 = false;
        continue;
      }
      const rs = await Promise.all(Array.from({ length: 10 }, async (_, i) => recall(ctx1, owner, id, await lane(i))));
      const win = rs.filter((x) => x?.ok === true).length;
      const lost = rs.filter((x) => refused(x, ["ALREADY_RECALLED"])).length;
      const other = [...new Set(rs.filter((x) => !(x?.ok === true) && !refused(x, ["ALREADY_RECALLED"])).map(codeOf))];
      const row = await rowOf(id);
      res9.push(`r${round}: ok ${win} AR ${lost}${other.length ? ` อื่น ${other.join("|")}` : ""} ${row?.status ?? "-"}`);
      if (!(win === 1 && lost === 9 && other.length === 0 && row?.status === "RECALLED" && row?.recalledByUserId === owner.userId)) ok9 = false;
    }
    chk("P1.5-H9", ok9, "ทุกรอบ ok 1 · ALREADY_RECALLED 9 · RECALLED", FX(res9.join(" ; ")));
  }

  // ════════ H10 ข้ามสาขา ════════
  {
    const h = await hold(ctx1, owner, { cart: { lines: [{ productId: U, qty: 1 }] }, label: "สาขา 1" });
    const id = hid(h);
    const l2 = await list(ctx2, owner);
    const r = await recall(ctx2, owner, id);
    const d = await discard(ctx2, owner, id);
    dataRefusals.push(["recall ข้ามสาขา", r, "NOT_FOUND"]);
    const row = await rowOf(id);
    const p: string[] = [];
    if (!id) p.push(`hold ${codeOf(h)}`);
    if (l2?.ok !== true) p.push(`list สาขา 2 ${codeOf(l2)}`);
    if (listIds(l2).includes(id)) p.push("สาขา 2 เห็น");
    if (!refused(r, ["NOT_FOUND"])) p.push(`recall ${codeOf(r)}`);
    if (!refused(d, ["NOT_FOUND"])) p.push(`discard ${codeOf(d)}`);
    if (row?.status !== "HELD") p.push(`status ${row?.status}`);
    chk("P1.5-H10", p.length === 0, "ไม่เห็น · NOT_FOUND ×2 · ยัง HELD", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ H11 ข้ามร้าน ════════
  {
    const h = await hold(ctx1, owner, { cart: { lines: [{ productId: U, qty: 1 }] }, label: "ร้านกาแฟ" });
    const id = hid(h);
    const lr = await list(ctxR, restoOwner);
    const r = await recall(ctxR, restoOwner, id);
    const d = await discard(ctxR, restoOwner, id);
    dataRefusals.push(["discard ข้ามร้าน", d, "NOT_FOUND"]);
    const row = await rowOf(id);
    const p: string[] = [];
    if (!restoScope) p.push("ไม่มี seed ร้านอาหาร");
    if (!id) p.push(`hold ${codeOf(h)}`);
    if (lr?.ok !== true) p.push(`list ร้านอาหาร ${codeOf(lr)}`);
    if (listIds(lr).includes(id)) p.push("ร้านอื่นเห็น");
    if (!refused(r, ["NOT_FOUND"])) p.push(`recall ${codeOf(r)}`);
    if (!refused(d, ["NOT_FOUND"])) p.push(`discard ${codeOf(d)}`);
    if (row?.status !== "HELD") p.push(`status ${row?.status}`);
    chk("P1.5-H11", p.length === 0, "ไม่เห็น · NOT_FOUND ×2 · ยัง HELD", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ H12 สิทธิ์ ════════
  {
    const p: string[] = [];
    const h = await hold(ctx1, owner, { cart: { lines: [{ productId: U, qty: 1 }] }, label: "ของเจ้าของ" });
    const id = hid(h);
    const before = await rowsIn(u1);
    const n1 = await hold(ctx1, noCreate, { cart: { lines: [{ productId: U, qty: 1 }] } });
    const n2 = await list(ctx1, noCreate);
    const n3 = await recall(ctx1, noCreate, id);
    const n4 = await discard(ctx1, noCreate, id);
    dataRefusals.push(["hold ไม่มีสิทธิ์", n1, "PERMISSION_DENIED"]);
    dataRefusals.push(["list ไม่มีสิทธิ์", n2, "PERMISSION_DENIED"]);
    for (const [l, r] of [["hold", n1], ["list", n2], ["recall", n3], ["discard", n4]] as [string, Any][]) if (!refused(r, ["PERMISSION_DENIED"])) p.push(`ไม่มีสิทธิ์ ${l}: ${codeOf(r)}`);
    if ((await rowsIn(u1)) !== before) p.push("มีแถวเกิดจากผู้ไม่มีสิทธิ์");
    if ((await rowOf(id))?.status !== "HELD") p.push("ผู้ไม่มีสิทธิ์เปลี่ยนสถานะได้");
    const c1 = await list(ctx1, realCashier);
    const c2 = await recall(ctx1, realCashier, id);
    if (!refused(c1, ["NOT_FOUND"]) || !refused(c2, ["NOT_FOUND"])) p.push(`แคชเชียร์สีลม: list ${codeOf(c1)} recall ${codeOf(c2)}`);
    const dOk = await discard(ctx1, cashierU1, id);
    if (dOk?.ok !== true || (await rowOf(id))?.status !== "DISCARDED") p.push(`แคชเชียร์สาขานี้ทิ้งบิลเจ้าของ: ${codeOf(dOk)}`);
    const h2 = await hold(ctx1, owner, { cart: { lines: [{ productId: U, qty: 2 }] }, label: "ให้แคชเชียร์เรียก" });
    const rOk = await recall(ctx1, cashierU1, hid(h2));
    if (rOk?.ok !== true) p.push(`แคชเชียร์สาขานี้เรียกคืนบิลเจ้าของ: ${codeOf(rOk)}`);
    chk("P1.5-H12", p.length === 0, "ไม่มีสิทธิ์ = PERMISSION_DENIED ×4 · สาขาอื่น = NOT_FOUND · แคชเชียร์สาขานี้ทิ้ง/เรียกคืนได้", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ H13 หมดอายุ ════════
  {
    const p: string[] = [];
    const setExpire = async (days: number | null) => {
      try {
        await P.appSystem.update({ where: { id: posS }, data: { settings: days === null ? {} : { pos: { heldCart: { expireDays: days } } } } });
      } catch (e) {
        p.push(`ตั้งค่าไม่ได้: ${(e as Error).message.slice(0, 60)}`);
      }
    };
    await setExpire(null);
    const mk = async (label: string, ageDays: number): Promise<string> => {
      const h = await hold(ctx1, owner, { cart: { lines: [{ productId: U, qty: 1 }] }, label });
      const id = hid(h);
      if (!id) {
        p.push(`hold ${label} ${codeOf(h)}`);
        return "";
      }
      const e = await setRow(id, { createdAt: new Date(Date.now() - ageDays * DAY) });
      if (e) p.push(`${label}: ${e}`);
      return id;
    };
    const e1 = await mk("อายุ 1 วัน", 1);
    const e2 = await mk("อายุ 3 วัน", 3);
    const e3 = await mk("อายุ 3 วัน (เรียกตรง)", 3);
    const r3 = await recall(ctx1, owner, e3);
    dataRefusals.push(["recall หมดอายุ", r3, "NOT_FOUND"]);
    if (!refused(r3, ["NOT_FOUND"])) p.push(`เรียกคืนบิลหมดอายุ ${codeOf(r3)}`);
    const l1 = await list(ctx1, owner);
    if (l1?.ok !== true) p.push(`list ${codeOf(l1)}`);
    if (!listIds(l1).includes(e1)) p.push("อายุ 1 วันหาย (ปริยาย 2)");
    if (listIds(l1).includes(e2)) p.push("อายุ 3 วันยังอยู่ (ปริยาย 2)");
    const row2 = await rowOf(e2);
    if (row2?.status !== "DISCARDED") p.push(`อายุ 3 วัน status ${row2?.status}`);
    await setExpire(5);
    const e4 = await mk("อายุ 3 วัน (ตั้ง 5)", 3);
    const l2 = await list(ctx1, owner);
    if (!listIds(l2).includes(e4)) p.push("ตั้ง 5 วันแล้วอายุ 3 วันหาย");
    if ((await rowOf(e4))?.status !== "HELD") p.push("ตั้ง 5 วันแล้วอายุ 3 วันไม่ HELD");
    await setExpire(null);
    chk("P1.5-H13", p.length === 0, "ปริยาย 2 วัน (1 อยู่ · 3 หาย→DISCARDED · เรียกตรง NOT_FOUND) · ตั้ง 5 → 3 อยู่", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ R1 ปฏิเสธเป็นข้อมูล ════════
  const badR1 = dataRefusals.filter(([, r, code]) => !(r?.ok === false && r.threw !== true && r.code === code && typeof r.message === "string" && r.message.length > 0)).map(([l, r]) => `${l}:${r?.threw ? "THROW " : ""}${codeOf(r)}`);
  chk("P1.5-R1", dataRefusals.length >= 8 && badR1.length === 0, `${dataRefusals.length} คำปฏิเสธ = {ok:false, code, message} ไม่ throw`, FX(badR1.join(" · ") || "ครบ"));
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
  const units = sb.unitIds;
  const systems = sb.systemIds;
  const counts: Record<string, number> = {};
  let heldIds: string[] = [];
  if (units.length || systems.length) {
    if (HC) {
      heldIds = ((await HC.findMany({ where: { tenantId: { in: TIDS }, OR: [...(units.length ? [{ unitId: { in: units } }] : []), ...(systems.length ? [{ systemId: { in: systems } }] : [])] }, select: { id: true } }).catch(() => [])) as Any[]).map((r) => r.id);
    } else if (dbHeldCols.has("unitId")) {
      // ตารางมีแต่ client ยังไม่ generate — ลบด้วย SQL ตรง (เฉพาะสาขา sandbox)
      for (const u of units) {
        try {
          counts.heldRaw = (counts.heldRaw ?? 0) + Number(await P.$executeRawUnsafe(`DELETE FROM "PosHeldCart" WHERE "unitId" = $1`, u));
        } catch (e) {
          console.log(`  (ลบ PosHeldCart ด้วย SQL ไม่ได้: ${(e as Error).message.slice(0, 80)})`);
        }
      }
    }
  }
  if (systems.length && typeof P.posProduct?.findMany === "function") {
    try {
      const extra = ((await P.posProduct.findMany({ where: { tenantId: { in: TIDS }, systemId: { in: systems } }, select: { id: true } })) as Any[]).map((r) => r.id);
      sb.productIds = [...new Set([...sb.productIds, ...extra])];
    } catch {
      /* ใช้รายการที่จำไว้ */
    }
  }
  const sales = units.length || systems.length
    ? ((await P.posSale.findMany({ where: { tenantId: { in: TIDS }, OR: [...(units.length ? [{ unitId: { in: units } }] : []), ...(systems.length ? [{ systemId: { in: systems } }] : [])] }, select: { id: true } }).catch(() => [])) as Any[]).map((s) => s.id)
    : [];
  const evWhere = { tenantId: { in: TIDS }, OR: [...(units.length ? [{ unitId: { in: units } }] : []), ...(systems.length ? [{ systemId: { in: systems } }] : []), ...(heldIds.length ? [{ idempotencyKey: { contains: heldIds[0] } }] : [])] };
  for (let i = 0; i < 10 && (units.length || systems.length); i++) {
    const pend = await P.outboxEvent.count({ where: { ...evWhere, status: "PENDING" } }).catch(() => 0);
    if (pend === 0) break;
    await sleep(500);
  }
  counts.outbox = await del("outboxEvent", evWhere);
  counts.audit = await del("auditLog", { tenantId: { in: TIDS }, createdAt: { gte: runStart }, OR: [...(units.length ? [{ unitId: { in: units } }] : []), { targetId: { in: [...heldIds, ...sb.productIds, ...systems, ...units, ...sales] } }] });
  // ApprovalRequest ใช้ entityType/entityId (ไม่ใช่ refType ตาม POS-CONTRACTS:66) — P1.5 ไม่ควรสร้าง แต่ถ้ามีหลุดจากสาขา sandbox ให้ลบ
  const apWhere = { tenantId: { in: TIDS }, createdAt: { gte: runStart }, entityType: "PosHeldCart", OR: [...(units.length ? [{ unitId: { in: units } }] : []), { entityId: { in: heldIds } }] };
  const apIds = typeof P.approvalRequest?.findMany === "function" ? ((await P.approvalRequest.findMany({ where: apWhere, select: { id: true } }).catch(() => [])) as Any[]).map((a) => a.id) : [];
  if (apIds.length) {
    await del("approvalDecision", { requestId: { in: apIds } });
    counts.approval = await del("approvalRequest", { id: { in: apIds } });
  }
  if (HC && heldIds.length) counts.held = await del("posHeldCart", { id: { in: heldIds } });
  // บิลที่ไม่ควรเกิด (พัก/เรียกคืนห้ามสร้างบิล) — ถ้าหลุดมา ลบตามลำดับ FK
  if (sales.length) {
    counts.payment = await del("posPayment", { saleId: { in: sales } });
    counts.line = await del("posSaleLine", { saleId: { in: sales } });
    counts.sale = await del("posSale", { id: { in: sales } });
  }
  for (const m of ["posProductOptionGroup", "posVariant", "recipeLine", "posProductChannelPrice", "posProductAvailability", "posProductUnit"]) {
    if (sb.productIds.length) await del(m, { productId: { in: sb.productIds } });
  }
  counts.product = sb.productIds.length ? await del("posProduct", { id: { in: sb.productIds } }) : 0;
  if (systems.length) counts.productBySystem = await del("posProduct", { tenantId: { in: TIDS }, systemId: { in: systems } });
  if (systems.length) await del("posCategory", { tenantId: { in: TIDS }, systemId: { in: systems } });
  if (units.length) await del("posReceiptCounter", { tenantId: { in: TIDS }, unitId: { in: units } });
  if (units.length) await del("appSystemUnit", { unitId: { in: units } });
  if (systems.length) {
    await del("appSystemUnit", { systemId: { in: systems } });
    await del("appSystem", { id: { in: systems } });
  }
  if (units.length) await del("businessUnit", { id: { in: units } });
  console.log(`  ลบแล้ว: ${JSON.stringify(counts)} · บิลพัก ${heldIds.length} · สาขา ${units.length} · ระบบ ${systems.length}`);
}

// ═════════════════════════ 7. รัน ═════════════════════════
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
chk("P1.5-Z1", drift.length === 0, "ก่อน = หลัง", drift.length ? drift.join(", ") : "เท่ากันทุกตาราง");
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
chk("P1.5-Z2", fpDrift.length === 0 && !Object.values(fpBefore).some((v) => v.startsWith("err")), "ลายนิ้วมือเท่าเดิมทุกตาราง", fpDrift.length ? fpDrift.join(", ") : `เท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`);
for (const [id] of CHECKS) if (!results.has(id) && !skippedChecks.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
for (const c of lanes) await c.$disconnect?.().catch?.(() => {});
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}${skippedChecks.size ? ` · ข้าม ${skippedChecks.size}` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, skippedChecks: Object.fromEntries(skippedChecks), missing: skipReasons, a5: { drift } })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P1.5: อนุมัติก่อนทิ้ง (Approval refType PosHeldCart · C-9) = P1.15 · deviceId ของเครื่อง = P1.9/P3 · ออฟไลน์ = P3.4 ·
// ลิ้นชักตามภาพ 14 + การวางตะกร้าบนจอจริง = ผู้คุมงานตรวจที่ visual
