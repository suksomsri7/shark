// QC — POS RUN ใบ P1.14 S: ตรวจนับสต็อกจากหน้าขาย (มือถือ) + ทางลัดรับของ/โอน/ปรับ · เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ
// requires: pos-seed
//
// สัญญา: ledger/pos-briefs/pos-brief-P1.14.md (มติร่าง R1–R16) · pos-brief-COMMON · pos-brief-LANE-RULES
//        โน้ต: ledger/wo-notes/pos-P1.14-oracle.md (รายการข้อ · ผลที่คาดบนฐาน · ชื่อที่ตั้งใหม่ · ความคลาดเคลื่อน)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้ และลงทะเบียนในโน้ตหัวข้อ "Names" — ผู้คุมงานต้องรับรองก่อนผู้สร้างเริ่ม
//   ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P1.14 S ต้องส่ง (ย่อจาก brief §2):
//   schema: PosStockCount (+ countNo ต่อสาขา · 1 รอบ OPEN ต่อคลัง×ที่เก็บ = partial unique) · PosStockCountLine · PosStockCountEntry · enum 2 ตัว
//   inventory/service.ts: adjustInTx (+ AdjustInput.sourceModule/refType/refId) — adjust เดิมเป็นตัวห่อ · bulkCount ไม่เปลี่ยน
//   pos/stock-count.ts: openStockCount · recordStockCount · getStockCount · listStockCounts · confirmStockCount · cancelStockCount ·
//     posReceiveStock · posTransferStock · posAdjustStock — (ctx, actor, input, client?) → {ok,…} | {ok:false, code, message}
//   pos/stock-count-shared.ts (pure): STOCK_COUNT_REFUSAL_CODES · STOCK_COUNT_MESSAGES {th,en}
//   กติกา "ขายระหว่างนับบวกกลับ" (R6): expectedAtCount = ยอดที่ที่เก็บ ณ รายการนับล่าสุด (อ่านใต้ล็อกสินค้า) · ยืนยัน = ยอดปัจจุบัน + (นับได้ − expectedAtCount)
//   event pos.stockCount.confirmed (คีย์ PosStockCount#<id>#CONFIRMED) + consumer + label · สิทธิ์ใหม่ pos.stock.count
//
// ขอบเขต: ST สถิต · OC เปิดรอบ · RE บันทึกนับ · AB บวกกลับ · CF ยืนยัน · CA ยกเลิก · PM สิทธิ์ · SH ทางลัด · RF คำปฏิเสธ · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p1.9b): SKIP เมื่อของ P1.14 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (ต้องแดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id โดยไม่แตะ DB · --no-db = รันเฉพาะข้อสถิต (ST1–ST7) ไม่โหลด env/prisma (exit 1 ถ้าแดง)
//    ก่อนเขียนแถวแรกต้องเป็น host ep-frosty-lab (QC4) เท่านั้น · แถวชั่วคราวติดป้าย `qc-p114-<rand>` ในร้าน QC กาแฟ
//    (sandbox: 2 สาขา · ระบบ POS 1 · ระบบคลัง 1 ผูกสาขาแรกเท่านั้น) · ลบทั้งหมดใน finally · Z1 นับแถว + Z2 ลายนิ้วมือแถวเดิม
//    การแข่งใช้ PrismaClient คนละตัว (connection จริงคนละเส้น) ส่งเป็นอาร์กิวเมนต์ท้าย client
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const SUITE = "qc-pos-p1.14";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) ═════════════════════════
// X-group: "-" = เชิงหน้าที่ล้วน · X1 idempotency · X2 ข้ามขอบเขต · X3 สิทธิ์ · X4 เงิน/จำนวน · X6 แข่ง (POS-MASTER-PLAN §3)
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P1.14-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "-", "[static · R1] schema: PosStockCount · PosStockCountLine · PosStockCountEntry (คอลัมน์สัญญา · unique (tenantId,openKey) (unitId,countNo) (countId,itemId) (tenantId,idempotencyKey)) · enum PosStockCountStatus {OPEN CONFIRMED CANCELLED} · PosStockCountScope {ALL CATEGORY}"),
  D("ST2", "-", "[static · R1] migration: CREATE TABLE ×3 · partial unique (\"inventorySystemId\",\"locationId\") WHERE status OPEN · ไม่ ALTER ตาราง Inv*/PosSale*/PosProduct/PosShift* · ไม่มี DROP/RENAME/SET NOT NULL"),
  D("ST3", "-", "[static · R1] scope.ts ลงทะเบียน PosStockCount · PosStockCountLine · PosStockCountEntry (บรรทัดจริง)"),
  D("ST4", "-", "[static · R8] inventory/service.ts export adjustInTx · AdjustInput มี sourceModule/refType/refId · adjust เรียก adjustInTx · bulkCount/adjust ยัง export"),
  D("ST5", "-", "[static · R2 R5 R7 R8 R13] pos/stock-count.ts export 9 ฟังก์ชัน · confirm: lockItemsInTx + adjustInTx + emitOutbox pos.stockCount.confirmed + auditLog · record: lockItemsInTx · ทางลัดเรียก receive/transfer/adjustInTx · ไม่เขียน invItem/invLocationStock/invMovement/invLot เอง (C-1)"),
  D("ST6", "-", "[static · R10 R12 R15] stock-count-shared.ts pure (ไม่ import db/prisma) · 13 รหัส · ข้อความ th (ไทย) + en (ไม่มีไทย) ครบ · สิทธิ์ pos.stock.count ใน permissions.ts · consumer + label ของ pos.stockCount.confirmed"),
  D("ST7", "-", "[static · R8 R16 · เขียวได้บนฐาน] InvMovement/InvLocationStock คอลัมน์เท่าเดิม · bulkCountAction ยังตรวจ inventory.movement.adjust · คีย์สิทธิ์ inventory.* เท่าเดิม 16 ตัว"),
  // ── OC เปิดรอบ ──
  D("OC1", "-", "เปิดรอบ ALL ที่คลัง default ของสาขา: บรรทัด = สินค้า PRODUCT ที่ไม่เก็บถาวรของคลังสาขาครบ (ไม่มีบริการ/ของเก็บถาวร) · snapshotQty = ยอดที่ที่เก็บ · OPEN · inventorySystemId/locationId/countNo/snapshotAt/openedBy ถูก · แถว DB ตรงผลคืน"),
  D("OC2", "-", "เปิดรอบ CATEGORY: บรรทัดเฉพาะหมวดที่เลือก · ตรวจค่า (หมวดของคลังอื่น · CATEGORY ไม่มีหมวด · ALL ส่งหมวด · คีย์แปลก · คีย์ซ้ำสั้น) → VALIDATION ไม่มีแถว"),
  D("OC3", "X1 X6", "1 รอบ OPEN ต่อที่เก็บ: เปิดซ้ำคีย์ใหม่ → COUNT_ALREADY_OPEN (+countId) · คีย์เดิม → duplicated id เดิม · ที่เก็บอื่นเปิดได้ (countNo +1) · แข่งเปิด 6 connection → ok 1 · COUNT_ALREADY_OPEN 5 · OPEN 1 แถว"),
  // ── RE บันทึกนับ ──
  D("RE1", "-", "บันทึกด้วย itemId: SET 9 → ADD 1 → SET 8 · countedQty ตามลำดับ · expectedAtCount = ยอดที่ที่เก็บตอนนับ · countedAt · entry 3 แถว (mode/qty/byUserId)"),
  D("RE2", "-", "สแกนรหัส: บาร์โค้ด InvItem → สินค้านั้น · SKU → สินค้านั้น · รหัสไม่รู้จัก → UNKNOWN_CODE · บริการ / ของเก็บถาวร / สินค้าคลังร้านอื่น → NOT_IN_COUNT · ไม่มี entry ของคำปฏิเสธ"),
  D("RE3", "X4", "สินค้าชั่ง (กรัม): ป้ายเครื่องชั่ง prefix 21 → ADD กรัมจากป้าย · ADD กรัมด้วย itemId · บรรทัด weighed:true · ป้าย + qty พร้อมกัน → VALIDATION"),
  D("RE4", "X1", "กันซ้ำ entry: คีย์เดิม payload เดิม → duplicated ยอดไม่เปลี่ยน entry ไม่เพิ่ม · คีย์เดิม qty ต่าง → IDEMPOTENCY_CONFLICT · ค่าผิด (ติดลบ · ทศนิยม · ADD 0 · เกินเพดาน · mode แปลก · itemId+code · ไม่มีทั้งคู่ · คีย์แปลก) → VALIDATION ไม่มีแถว"),
  D("RE5", "X6", "แข่งนับ ADD 1 จาก 8 connection บนบรรทัดเดียว → ok ทั้ง 8 · countedQty 8 · entry 8 แถว"),
  // ── AB บวกกลับ ──
  D("AB1", "X4", "ขายระหว่างนับ (บิลจริง createSale): snapshot 20 · ขาย 2 · นับ 17 → expectedAtCount 18 · ขายอีก 1 หลังนับ · (ยืนยันใน CF1) ยอดสุดท้ายนับรวมการขายหลังนับ"),
  D("AB2", "X4", "รับเข้า+โอนออกระหว่างนับ: expectedAtCount ตามยอดจริง (5+5−2=8) · นับ 8 → ผลต่าง 0 · invariant expectedAtCount = snapshotQty + Σ movement ที่ที่เก็บช่วง (snapshotAt, countedAt] ทุกบรรทัดที่นับ"),
  // ── CF ยืนยัน ──
  D("CF1", "X4 X6", "ยืนยัน (แข่งกับการขาย 5 รายการพร้อมกัน): ADJUST เฉพาะบรรทัดที่ผลต่าง ≠ 0 · qtyDelta = ผลต่าง · key pos-count-<count>-<item> · POS/PosStockCount/countId · movementId ในบรรทัด · ยอดสุดท้าย = นับได้ + movement หลังนับ · บรรทัดไม่นับไม่แตะ · Σ ที่เก็บ = onHand"),
  D("CF2", "-", "uncounted ZERO: รอบหมวด · ยืนยันแบบ SKIP ทั้งที่ไม่ได้นับ → NOTHING_COUNTED · นับ 1 บรรทัด แล้ว ZERO → บรรทัดที่ไม่นับเป็น 0 (ยอดที่ที่เก็บ = 0) · บรรทัดที่นับตามกติกา R6"),
  D("CF3", "X1", "event + audit: outbox pos.stockCount.confirmed 1 แถว (key PosStockCount#<id>#CONFIRMED · payload countId/countedLines/adjustedLines/varianceValueSatang) · AuditLog pos.stockCount.confirm 1 · ยืนยันซ้ำคีย์เดิม → duplicated ไม่มี movement/event/audit เพิ่ม"),
  D("CF4", "-", "สถานะ: ยืนยันคีย์ใหม่ของรอบที่ยืนยันแล้ว / บันทึกนับ / ยกเลิก → COUNT_NOT_OPEN · รอบไม่เปลี่ยน"),
  D("CF5", "X6", "แข่งยืนยัน 6 connection คีย์ต่างกัน → ok 1 · COUNT_NOT_OPEN 5 · ADJUST ต่อบรรทัด 1 แถว · event 1 · ยอดถูก"),
  // ── CA ยกเลิก ──
  D("CA1", "X1", "ยกเลิก: CANCELLED · ไม่มี movement/event ของรอบ · audit pos.stockCount.cancel 1 · ซ้ำคีย์เดิม → duplicated · บันทึก/ยืนยันหลังยกเลิก → COUNT_NOT_OPEN · เหตุผลว่าง → VALIDATION · ที่เก็บว่างเปิดรอบใหม่ได้"),
  // ── PM สิทธิ์ + ขอบเขต ──
  D("PM1", "X2 X3", "สิทธิ์/ขอบเขต: ขายได้อย่างเดียว → PERMISSION_DENIED (เปิด/บันทึก) · คนนับ (pos.stock.count) นับได้ ยืนยัน/ยกเลิกรอบคนอื่นไม่ได้ · STAFF สาขาอื่น → PERMISSION_DENIED · สาขาไม่มีคลัง → NO_INVENTORY · ร้านอื่น/สาขาอื่น → NOT_FOUND · blind: คนนับเห็น snapshot/expected/variance = null · เจ้าของเห็นตัวเลข"),
  // ── SH ทางลัด ──
  D("SH1", "X1 X3", "รับของจาก POS: IN · key pos-recv-<k> · POS/PosUnit/unitId · ต้นทุนไม่ส่ง = ต้นทุนเฉลี่ยเดิม (ไม่ขยับ) · สแกนบาร์โค้ดได้ · ซ้ำ → duplicated · บริการ → NOT_STOCKED · qty 0 → VALIDATION · ไม่มีสิทธิ์รับ → PERMISSION_DENIED · audit pos.stock.receive 1"),
  D("SH2", "X1 X2 X3", "โอนจาก POS: TRANSFER คู่ pos-tf-<k>-out/-in · onHand รวมไม่เปลี่ยน · ที่เก็บปลายทาง +qty · ซ้ำ → duplicated · ต้นทาง=ปลายทาง → VALIDATION · ที่เก็บของคลังร้านอื่น → NOT_FOUND · ไม่มีสิทธิ์ → PERMISSION_DENIED"),
  D("SH3", "X1 X3", "ปรับจาก POS: ADJUST qtyDelta = deltaQty · key pos-adj-<k> · note = เหตุผล · POS/PosUnit · ซ้ำ → duplicated · delta 0 / ไม่มีเหตุผล → VALIDATION · คนนับไม่มีสิทธิ์ adjust → PERMISSION_DENIED · Σ ที่เก็บ = onHand"),
  // ── RF ──
  D("RF1", "-", "คำปฏิเสธทุกตัว = {ok:false, code, message} ไม่ throw · code อยู่ใน STOCK_COUNT_REFUSAL_CODES · เห็นครบ 11 รหัสที่ยั่วได้ · message ไม่ว่าง"),
  // ── Z ──
  D("Z1", "-", "QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง"),
  D("Z2", "-", "QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (ระบบ · สาขา · สมาชิก · InvItem · InvLocationStock · InvLocation · PosProduct · PosStockCount*) ทุกคอลัมน์ ก่อน = หลัง"),
];

if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} ข้อ (id · X · หัวข้อ)`);
  for (const [id, x, t] of CHECKS) console.log(`${id}\t${x}\t${t}`);
  const byX = new Map<string, number>();
  for (const [, x] of CHECKS) for (const k of x.split(" ")) byX.set(k, (byX.get(k) ?? 0) + 1);
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
const tryImport = async (p: string): Promise<Any> => {
  try {
    return await import(p as string);
  } catch (e) {
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 120)})`);
    return null;
  }
};
const thai = /[฀-๿]/;

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
const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const stripPrismaComments = (s: string) => s.replace(/\/\/.*$/gm, "");
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b`).test(src);
function prismaBlock(src: string, kind: "model" | "enum", name: string): string {
  const m = new RegExp(`\\b${kind}\\s+${name}\\s*\\{`).exec(src);
  if (!m) return "";
  const end = src.indexOf("\n}", m.index);
  return end < 0 ? "" : src.slice(m.index, end + 2);
}
const fieldLine = (block: string, f: string): string => (new RegExp(`^\\s*${f}\\s+[^\\n]*$`, "m").exec(block)?.[0] ?? "").trim();
const fieldNames = (block: string): string[] =>
  block
    .split("\n")
    .slice(1)
    .map((l) => /^\s*([A-Za-z_]\w*)\s+\S/.exec(l)?.[1] ?? "")
    .filter(Boolean);
function fnBody(src: string, name: string): string {
  const at = src.search(new RegExp(`export\\s+(async\\s+)?function\\s+${name}\\b`));
  if (at < 0) return "";
  return src.slice(at).split(/\n\s*export\s+/)[0] ?? "";
}

const SC_FILE = "src/lib/modules/pos/stock-count.ts";
const SC_SHARED_FILE = "src/lib/modules/pos/stock-count-shared.ts";
const INV_FILE = "src/lib/modules/inventory/service.ts";
const SC_FNS = [
  "openStockCount", "recordStockCount", "getStockCount", "listStockCounts", "confirmStockCount", "cancelStockCount",
  "posReceiveStock", "posTransferStock", "posAdjustStock",
] as const;
const CODES = [
  "VALIDATION", "NOT_FOUND", "PERMISSION_DENIED", "NO_INVENTORY", "COUNT_ALREADY_OPEN", "COUNT_NOT_OPEN", "UNKNOWN_CODE", "NOT_IN_COUNT",
  "NOT_STOCKED", "NOTHING_COUNTED", "IDEMPOTENCY_CONFLICT", "STOCK_BUSY", "INTERNAL",
] as const;
const PROVOKED = CODES.filter((c) => c !== "STOCK_BUSY" && c !== "INTERNAL");
const EVENT = "pos.stockCount.confirmed";
const COUNT_COLS = [
  "id", "tenantId", "systemId", "unitId", "inventorySystemId", "locationId", "countNo", "scope", "categoryIds", "blind", "status", "note", "snapshotAt",
  "openedByUserId", "openKey", "confirmKey", "confirmedByUserId", "confirmedAt", "cancelKey", "cancelledByUserId", "cancelledAt", "cancelReason", "createdAt", "updatedAt",
] as const;
const LINE_COLS = ["id", "tenantId", "countId", "itemId", "snapshotQty", "countedQty", "expectedAtCount", "countedAt", "varianceQty", "costSatang", "movementId", "createdAt", "updatedAt"] as const;
const ENTRY_COLS = ["id", "tenantId", "countId", "lineId", "itemId", "mode", "qty", "code", "byUserId", "idempotencyKey", "createdAt"] as const;
const COUNT_REQ = ["tenantId", "systemId", "unitId", "inventorySystemId", "locationId", "countNo", "scope", "blind", "status", "snapshotAt", "openedByUserId", "openKey"] as const;
const LINE_OPT = ["countedQty", "expectedAtCount", "countedAt", "varianceQty", "costSatang", "movementId"] as const;
/** ชุดคอลัมน์วันนี้ (R8/R16: P1.14 ห้ามแตะ) */
const INV_MOVEMENT_COLS = ["id", "tenantId", "systemId", "itemId", "item", "type", "locationId", "lotCode", "qtyDelta", "balanceAfter", "costSatang", "sourceModule", "refType", "refId", "idempotencyKey", "note", "needsReview", "createdAt"];
const INV_LOCSTOCK_COLS = ["id", "tenantId", "systemId", "itemId", "locationId", "onHand"];
const INV_PERM_KEYS = [
  "inventory.item.create", "inventory.item.import", "inventory.item.read", "inventory.item.update", "inventory.location.create", "inventory.lot.expiring",
  "inventory.movement.adjust", "inventory.movement.consume", "inventory.movement.receive", "inventory.movement.transfer", "inventory.po.cancel",
  "inventory.po.create", "inventory.po.order", "inventory.po.receive", "inventory.supplier.create", "inventory.supplier.update",
];
const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
const scRaw = rd(SC_FILE);
const scSrc = stripComments(scRaw);

// ═════════════════════════ 1. ข้อสถิต (ST1–ST7) ═════════════════════════
async function runStatic(): Promise<void> {
  console.log("\n── ST ข้อสถิต (ไม่แตะ DB) ──");
  // ST1 schema
  const s1: string[] = [];
  const cB = prismaBlock(schemaSrc, "model", "PosStockCount");
  const lB = prismaBlock(schemaSrc, "model", "PosStockCountLine");
  const eB = prismaBlock(schemaSrc, "model", "PosStockCountEntry");
  const req = (b: string, f: string, who: string) => {
    const l = fieldLine(b, f);
    if (l && /\?/.test(l.split(/\s+/)[1] ?? "")) s1.push(`${who}.${f} ต้องไม่ nullable`);
  };
  if (!cB) s1.push("ไม่มี model PosStockCount");
  else {
    const miss = COUNT_COLS.filter((c) => !fieldLine(cB, c));
    if (miss.length) s1.push(`PosStockCount ขาด ${miss.join(",")}`);
    if (!/@@unique\(\[\s*tenantId\s*,\s*openKey\s*\]/.test(cB)) s1.push("ไม่มี @@unique([tenantId, openKey])");
    if (!/@@unique\(\[\s*unitId\s*,\s*countNo\s*\]/.test(cB)) s1.push("ไม่มี @@unique([unitId, countNo])");
    for (const f of COUNT_REQ) req(cB, f, "PosStockCount");
    if (fieldLine(cB, "status") && !/\bPosStockCountStatus\b/.test(fieldLine(cB, "status"))) s1.push("status ไม่ใช่ PosStockCountStatus");
    if (fieldLine(cB, "scope") && !/\bPosStockCountScope\b/.test(fieldLine(cB, "scope"))) s1.push("scope ไม่ใช่ PosStockCountScope");
  }
  if (!lB) s1.push("ไม่มี model PosStockCountLine");
  else {
    const miss = LINE_COLS.filter((c) => !fieldLine(lB, c));
    if (miss.length) s1.push(`Line ขาด ${miss.join(",")}`);
    if (!/@@unique\(\[\s*countId\s*,\s*itemId\s*\]/.test(lB)) s1.push("Line ไม่มี @@unique([countId, itemId])");
    req(lB, "snapshotQty", "Line");
    for (const f of LINE_OPT) if (fieldLine(lB, f) && !/\?/.test(fieldLine(lB, f).split(/\s+/)[1] ?? "")) s1.push(`Line.${f} ต้อง nullable`);
  }
  if (!eB) s1.push("ไม่มี model PosStockCountEntry");
  else {
    const miss = ENTRY_COLS.filter((c) => !fieldLine(eB, c));
    if (miss.length) s1.push(`Entry ขาด ${miss.join(",")}`);
    if (!/@@unique\(\[\s*tenantId\s*,\s*idempotencyKey\s*\]/.test(eB)) s1.push("Entry ไม่มี @@unique([tenantId, idempotencyKey])");
  }
  const enumVals = (n: string) => prismaBlock(schemaSrc, "enum", n).split("\n").slice(1).map((l) => l.trim()).filter((l) => /^[A-Z_]+$/.test(l));
  if (enumVals("PosStockCountStatus").join(",") !== "OPEN,CONFIRMED,CANCELLED") s1.push(`enum PosStockCountStatus=${enumVals("PosStockCountStatus").join(",") || "ไม่มี"}`);
  if (enumVals("PosStockCountScope").join(",") !== "ALL,CATEGORY") s1.push(`enum PosStockCountScope=${enumVals("PosStockCountScope").join(",") || "ไม่มี"}`);
  chk("P1.14-ST1", s1.length === 0, "3 ตาราง + 2 enum ครบสัญญา", s1.slice(0, 8).join(" · ") || "ครบ");

  // ST2 migration
  const s2: string[] = [];
  const migFiles = walk("prisma/migrations", [], /\.sql$/).filter((f) => /PosStockCount/.test(rd(f)));
  if (!migFiles.length) s2.push("ไม่มี migration ที่แตะ PosStockCount");
  const migAll = migFiles.map((f) => rd(f).replace(/--.*$/gm, "")).join("\n");
  for (const t of ["PosStockCount", "PosStockCountLine", "PosStockCountEntry"]) if (migFiles.length && !new RegExp(`CREATE\\s+TABLE\\s+"${t}"`, "i").test(migAll)) s2.push(`ไม่มี CREATE TABLE "${t}"`);
  if (migFiles.length && !/CREATE\s+UNIQUE\s+INDEX[^;]*ON\s+"PosStockCount"\s*\([^;)]*"inventorySystemId"[^;)]*"locationId"[^;]*\)\s*WHERE[^;]*status[^;]*OPEN/i.test(migAll)) {
    s2.push("ไม่มี partial unique (inventorySystemId, locationId) WHERE status = OPEN");
  }
  for (const f of migFiles) {
    const t = rd(f).replace(/--.*$/gm, "");
    const name = f.split("/").slice(-2, -1)[0];
    if (/\bDROP\s+(TABLE|COLUMN|INDEX)\b|\bRENAME\b|SET\s+NOT\s+NULL/i.test(t)) s2.push(`${name}: มี DROP/RENAME/SET NOT NULL`);
    const alt = /ALTER\s+TABLE\s+"(Inv\w*|PosSale\w*|PosProduct\w*|PosShift\w*)"/i.exec(t);
    if (alt) s2.push(`${name}: ALTER TABLE "${alt[1]}" (R1 ห้ามแตะ)`);
  }
  chk("P1.14-ST2", s2.length === 0, "CREATE ×3 · partial unique OPEN · additive", s2.join(" · ") || `ครบ (${migFiles.length} ไฟล์)`);

  // ST3 scope.ts (บรรทัดจริง)
  const scopeLines = rd("src/lib/core/scope.ts").split("\n");
  const s3 = ["PosStockCount", "PosStockCountLine", "PosStockCountEntry"].filter((m) => !scopeLines.some((l) => new RegExp(`^\\s*${m}\\s*:`).test(l)));
  chk("P1.14-ST3", s3.length === 0, "3 ตารางใน scope.ts", s3.length ? `ขาด ${s3.join(",")}` : "ครบ");

  // ST4 inventory adjustInTx
  const s4: string[] = [];
  const invSrc = stripComments(rd(INV_FILE));
  if (!exportsFn(invSrc, "adjustInTx")) s4.push("ไม่มี export adjustInTx");
  const adjType = /export\s+type\s+AdjustInput\s*=\s*\{[\s\S]*?\n\};?/.exec(invSrc)?.[0] ?? "";
  for (const f of ["sourceModule", "refType", "refId"]) if (!new RegExp(`\\b${f}\\??\\s*:`).test(adjType)) s4.push(`AdjustInput ไม่มี ${f}`);
  const adjBody = fnBody(invSrc, "adjust");
  if (!adjBody) s4.push("adjust หาย");
  else if (!/\badjustInTx\s*\(/.test(adjBody)) s4.push("adjust ไม่เรียก adjustInTx (ต้องเป็นตัวห่อ)");
  if (!exportsFn(invSrc, "bulkCount")) s4.push("bulkCount หาย");
  chk("P1.14-ST4", s4.length === 0, "adjustInTx + AdjustInput 3 ช่อง + adjust ห่อ", s4.join(" · ") || "ครบ");

  // ST5 stock-count.ts
  const s5: string[] = [];
  if (!scRaw) s5.push(`ไม่มี ${SC_FILE}`);
  else {
    const miss = SC_FNS.filter((f) => !exportsFn(scSrc, f));
    if (miss.length) s5.push(`ไม่มี export ${miss.join(",")}`);
    const cb = fnBody(scSrc, "confirmStockCount");
    if (cb) {
      for (const [re, what] of [[/\blockItemsInTx\s*\(/, "lockItemsInTx"], [/\badjustInTx\s*\(/, "adjustInTx"], [/\bemitOutbox\s*\(/, "emitOutbox"], [/auditLog\.create\s*\(/, "auditLog.create"]] as const) {
        if (!re.test(cb)) s5.push(`confirmStockCount ไม่มี ${what}`);
      }
    }
    if (!new RegExp(`["'\`]${EVENT.replace(/\./g, "\\.")}["'\`]`).test(scSrc)) s5.push(`ไม่มีชื่อ event ${EVENT}`);
    const rb = fnBody(scSrc, "recordStockCount");
    if (rb && !/\blockItemsInTx\s*\(/.test(rb)) s5.push("recordStockCount ไม่ lockItemsInTx");
    const recv = fnBody(scSrc, "posReceiveStock");
    if (recv && !/\breceive(InTx)?\s*\(/.test(recv)) s5.push("posReceiveStock ไม่เรียก inventory receive");
    const tf = fnBody(scSrc, "posTransferStock");
    if (tf && !/\btransfer\s*\(/.test(tf)) s5.push("posTransferStock ไม่เรียก inventory transfer");
    const ad = fnBody(scSrc, "posAdjustStock");
    if (ad && !/\badjustInTx\s*\(/.test(ad)) s5.push("posAdjustStock ไม่เรียก adjustInTx");
    if (/\.(invItem|invLocationStock|invMovement|invLot)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/.test(scSrc)) s5.push("เขียนตารางคลังเอง (C-1)");
    if (/(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+"Inv(Item|LocationStock|Movement|Lot)"/i.test(scSrc)) s5.push("SQL ดิบเขียนตารางคลัง (C-1)");
  }
  chk("P1.14-ST5", s5.length === 0, "9 ฟังก์ชัน · confirm ผ่าน inventory + event + audit · C-1", s5.join(" · ") || "ครบ");

  // ST6 shared + permission + consumer/label
  const s6: string[] = [];
  const shRaw = rd(SC_SHARED_FILE);
  if (!shRaw) s6.push(`ไม่มี ${SC_SHARED_FILE}`);
  else {
    const shSrc = stripComments(shRaw);
    if (/^\s*import\s+(?!type\b)[^;]*from\s+["'](@\/lib\/core\/db|@prisma\/client|\.\/stock-count|@\/lib\/modules\/pos\/stock-count)["']/m.test(shSrc)) s6.push("shared import db/prisma/stock-count (ต้อง pure)");
    const sh = await tryImport("@/lib/modules/pos/stock-count-shared");
    const codes: unknown = sh?.STOCK_COUNT_REFUSAL_CODES;
    const msgs: Any = sh?.STOCK_COUNT_MESSAGES;
    const list = Array.isArray(codes) ? (codes as string[]) : codes && typeof codes === "object" ? Object.keys(codes as object) : [];
    const missC = CODES.filter((c) => !list.includes(c));
    if (missC.length) s6.push(`STOCK_COUNT_REFUSAL_CODES ขาด ${missC.join(",")}`);
    for (const c of CODES) {
      const m = msgs?.[c];
      if (!m || typeof m.th !== "string" || !thai.test(m.th)) s6.push(`${c}.th`);
      if (!m || typeof m.en !== "string" || !m.en.trim() || thai.test(m.en)) s6.push(`${c}.en`);
    }
  }
  if (!/["']pos\.stock\.count["']\s*:/.test(stripComments(rd("src/lib/core/permissions.ts")))) s6.push("permissions.ts ไม่มี pos.stock.count");
  if (!new RegExp(`["']${EVENT.replace(/\./g, "\\.")}["']\\s*:`).test(stripComments(rd("src/lib/outbox-consumers.ts")))) s6.push(`outbox-consumers ไม่มี ${EVENT}`);
  if (!new RegExp(`value:\\s*["']${EVENT.replace(/\./g, "\\.")}["']`).test(stripComments(rd("src/lib/automation/labels.ts")))) s6.push(`labels.ts ไม่มี ${EVENT}`);
  chk("P1.14-ST6", s6.length === 0, "shared pure · 13 รหัส th+en · สิทธิ์ · consumer + label", s6.slice(0, 10).join(" · ") + (s6.length > 10 ? ` …(+${s6.length - 10})` : "") || "ครบ");

  // ST7 ฐานเขียวได้
  const s7: string[] = [];
  const mvNames = fieldNames(prismaBlock(schemaSrc, "model", "InvMovement"));
  const lsNames = fieldNames(prismaBlock(schemaSrc, "model", "InvLocationStock"));
  const diff = (have: string[], want: string[]) => [...have.filter((n) => !want.includes(n)).map((n) => `+${n}`), ...want.filter((n) => !have.includes(n)).map((n) => `-${n}`)];
  const d1 = diff(mvNames, INV_MOVEMENT_COLS);
  const d2 = diff(lsNames, INV_LOCSTOCK_COLS);
  if (d1.length) s7.push(`InvMovement ${d1.join(",")}`);
  if (d2.length) s7.push(`InvLocationStock ${d2.join(",")}`);
  const act = fnBody(stripComments(rd("src/lib/modules/inventory/actions.ts")), "bulkCountAction");
  if (!/["']inventory\.movement\.adjust["']/.test(act)) s7.push("bulkCountAction ไม่ตรวจ inventory.movement.adjust");
  const permKeys = [...new Set([...rd("src/lib/core/permissions.ts").matchAll(/"(inventory\.[a-zA-Z.]+)"/g)].map((m) => m[1]))].sort();
  const pd = diff(permKeys, INV_PERM_KEYS);
  if (pd.length) s7.push(`คีย์ inventory.* ${pd.join(",")}`);
  chk("P1.14-ST7", s7.length === 0, "ตารางคลัง/สิทธิ์คลังเท่าเดิม", s7.join(" · ") || "เท่าเดิม");
}
const STATIC_IDS = CHECKS.map(([id]) => id).filter((id) => /-ST\d+$/.test(id));

const skipReasons: string[] = [];
if (!scRaw) skipReasons.push(`${SC_FILE} ยังไม่มี`);
else if (!exportsFn(scSrc, "openStockCount")) skipReasons.push(`${SC_FILE} ยังไม่มี export openStockCount`);

// ═════════════════════════ 1b. --no-db ═════════════════════════
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อสถิต (ไม่ผ่านด่าน SKIP · ข้ออื่นต้องใช้ DB)`);
  if (skipReasons.length) console.log(`   (ของ P1.14 ที่ยังขาด: ${skipReasons.join(" · ")})`);
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

// ═════════════════════════ 3. ด่าน SKIP ═════════════════════════
const { prisma } = (await import("@/lib/core/db")) as Any;
const P = prisma as Any;
const prismaPkg = (await import("@prisma/client")) as Any;
const DMMF = ((prismaPkg?.Prisma ?? prismaPkg?.default?.Prisma)?.dmmf?.datamodel ?? { models: [] }) as { models: { name: string; fields: { name: string }[] }[] };
const dbCols = new Set<string>();
try {
  const rows = (await P.$queryRawUnsafe(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('PosStockCount','PosStockCountLine','PosStockCountEntry')`,
  )) as Any[];
  for (const r of rows) dbCols.add(`${r.table_name}.${r.column_name}`);
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
const clientHas = (model: string, field: string) => (DMMF.models.length ? !!DMMF.models.find((m) => m.name === model)?.fields.some((f) => f.name === field) : dbCols.has(`${model}.${field}`));
const hasField = (model: string, field: string) => clientHas(model, field) && dbCols.has(`${model}.${field}`);
const PSC: Any = typeof P.posStockCount?.findMany === "function" ? P.posStockCount : null;
const PSL: Any = typeof P.posStockCountLine?.findMany === "function" ? P.posStockCountLine : null;
const PSE: Any = typeof P.posStockCountEntry?.findMany === "function" ? P.posStockCountEntry : null;
if (!PSC || !PSL || !PSE) skipReasons.push("Prisma client ยังไม่มี delegate posStockCount/posStockCountLine/posStockCountEntry (R1)");
const missCols = [
  ...COUNT_COLS.filter((c) => !hasField("PosStockCount", c)).map((c) => `PosStockCount.${c}`),
  ...LINE_COLS.filter((c) => !hasField("PosStockCountLine", c)).map((c) => `Line.${c}`),
  ...ENTRY_COLS.filter((c) => !hasField("PosStockCountEntry", c)).map((c) => `Entry.${c}`),
];
if (missCols.length) skipReasons.push(`คอลัมน์ขาด (client/DB): ${missCols.slice(0, 6).join(",")}${missCols.length > 6 ? ` …(+${missCols.length - 6})` : ""}`);

let scope: Any = null;
let restoScope: Any = null;
try {
  scope = await envMod.resolvePosScope(prisma, "coffee");
  restoScope = await envMod.resolvePosScope(prisma, "resto");
} catch (e) {
  console.log(`  (resolvePosScope ล้ม: ${(e as Error).message.slice(0, 120)})`);
}
if (!scope) skipReasons.push("ชุดข้อมูล QC POS (ร้านกาแฟ) ยังไม่ถูก seed — รัน scripts/seed-pos-qc.mts ก่อน");
if (!restoScope) skipReasons.push("ชุดข้อมูล QC POS (ร้านอาหาร) ยังไม่ถูก seed — PM1/SH2 ต้องใช้");

const COUNT_MODELS = [
  "posSale", "posSaleLine", "posPayment", "posReceiptCounter", "outboxEvent", "appSystem", "appSystemUnit", "businessUnit", "auditLog",
  "invItem", "invMovement", "invLocation", "invLocationStock", "invLot", "invCategory", "invSettings", "posProduct", "posCategory",
  "posStockCount", "posStockCountLine", "posStockCountEntry", "accountProduct", "appNotification",
] as const;
const FP_MODELS = ["appSystem", "appSystemUnit", "businessUnit", "membership", "invItem", "invLocation", "invLocationStock", "invCategory", "posProduct", "posStockCount", "posStockCountLine"] as const;
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
  }
  return out;
}
const countsBefore = await snapshotCounts();

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P1.14 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง)`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อมูล: seed ร้านกาแฟ ${scope ? "มี" : "ไม่มี"} · seed ร้านอาหาร ${restoScope ? "มี" : "ไม่มี"} · ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length, seed: { coffee: !!scope, resto: !!restoScope }, a5: countsBefore })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const sc = existsSync(join(ROOT, SC_FILE)) ? await tryImport("@/lib/modules/pos/stock-count") : null;
const scShared = existsSync(join(ROOT, SC_SHARED_FILE)) ? await tryImport("@/lib/modules/pos/stock-count-shared") : null;
const inv = await tryImport("@/lib/modules/inventory/service");
const svc = await tryImport("@/lib/modules/pos/service");
const sysSvc = await tryImport("@/lib/modules/system/service");
const codeList: string[] = Array.isArray(scShared?.STOCK_COUNT_REFUSAL_CODES) ? scShared.STOCK_COUNT_REFUSAL_CODES : scShared?.STOCK_COUNT_REFUSAL_CODES ? Object.keys(scShared.STOCK_COUNT_REFUSAL_CODES) : [];

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p114-${RAND}`;
const runStart = new Date();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ═════════════════════════ 5. ข้อที่ต้องมี DB (sandbox) ═════════════════════════
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !STATIC_IDS.includes(id) && id !== "P1.14-Z1" && id !== "P1.14-Z2");
const sb = { unitIds: [] as string[], systemIds: [] as string[], itemIds: [] as string[], saleIds: [] as string[], countIds: new Set<string>(), categoryIds: [] as string[] };
const lanes: Any[] = [];
async function lane(i: number): Promise<Any> {
  if (lanes[i]) return lanes[i];
  const { PrismaClient } = (await import("@prisma/client")) as Any;
  const { PrismaPg } = (await import("@prisma/adapter-pg")) as Any;
  while (lanes.length <= i) lanes.push(new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }) }));
  return lanes[i];
}
/** EAN-13 ป้ายเครื่องชั่ง: PP IIIII VVVVV C */
function scaleLabel(prefix: string, plu: string, value: number): string {
  const first12 = `${prefix}${plu}${String(value).padStart(5, "0")}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (i % 2 === 0 ? 1 : 3) * (first12.charCodeAt(i) - 48);
  return `${first12}${(10 - (sum % 10)) % 10}`;
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
  const ctxR = { tenantId: restoTid, systemId: PQC.resto.systems.POS.id, unitId: PQC.resto.units.main.id };

  // ─── sandbox ───
  assertQc4BeforeWrite();
  console.log(`\n── sandbox ${TAG} (2 สาขา · POS 1 · คลัง 1 ผูกสาขาแรก · สินค้า 8 · ที่เก็บ 2) ──`);
  let fx = "";
  let u1 = "", u2 = "", posS = "", invS = "", defLoc = "", loc2 = "", restoLoc = "", restoItem = "";
  const it: Record<string, string> = {};
  const sku: Record<string, string> = {};
  const bc: Record<string, string> = {};
  let catA = "", catB = "", restoCat = "";
  const PLU = String(10000 + Math.floor(Math.random() * 89999));
  try {
    for (const label of ["u1", "u2"]) {
      const u = await P.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: `${TAG} ${label}`, slug: `${TAG}-${label}` } });
      sb.unitIds.push(u.id);
    }
    [u1, u2] = sb.unitIds as [string, string];
    const s = await P.appSystem.create({ data: { tenantId: tid, type: "POS", name: `${TAG} POS`, settings: { pos: { weighedBarcode: { enabled: true, rules: [{ prefix: "21", kind: "WEIGHT" }] } } } } });
    sb.systemIds.push(s.id);
    posS = s.id;
    const iv = await P.appSystem.create({ data: { tenantId: tid, type: "INVENTORY", name: `${TAG} คลัง`, settings: {} } });
    sb.systemIds.push(iv.id);
    invS = iv.id;
    await sysSvc.linkUnit(tid, posS, u1);
    await sysSvc.linkUnit(tid, posS, u2);
    await sysSvc.linkUnit(tid, invS, u1); // u2 ไม่มีคลัง (NO_INVENTORY)
    const invCtx = { tenantId: tid, systemId: invS };
    catA = (await P.invCategory.create({ data: { tenantId: tid, systemId: invS, name: `${TAG} หมวด A` } })).id;
    catB = (await P.invCategory.create({ data: { tenantId: tid, systemId: invS, name: `${TAG} หมวด B` } })).id;
    sb.categoryIds.push(catA, catB);
    const mk = async (k: string, categoryId: string, stock: number, extra: Any = {}) => {
      sku[k] = `${TAG}-${k}`.toUpperCase();
      bc[k] = `29${RAND.replace(/[^0-9]/g, "").padEnd(4, "7").slice(0, 4)}${String(Object.keys(it).length).padStart(7, "0")}`;
      const r = await inv.createItem(invCtx, { sku: sku[k], name: `${TAG} ${k}`, barcode: bc[k], categoryId, costSatang: 1000, ...extra });
      it[k] = r.id;
      sb.itemIds.push(r.id);
      if (stock > 0) await inv.receive(invCtx, { itemId: r.id, qty: stock, costSatang: 1000, idempotencyKey: `${TAG}-seed-${k}`, sourceModule: "manual", refType: "QcSeed", refId: r.id });
    };
    await mk("A", catA, 20);
    await mk("B", catA, 10);
    await mk("N", catA, 0);
    await mk("X", catA, 3);
    await mk("C", catB, 5);
    await mk("U", catB, 7);
    await mk("W", catB, 5000, { unitLabel: "กรัม", costSatang: 2 });
    await mk("S", catB, 0, { kind: "SERVICE", priceSatang: 5000 });
    await inv.archiveItem(invCtx, it.X);
    defLoc = (await inv.ensureDefaultLocation(invCtx)).id;
    loc2 = (await inv.createLocation(invCtx, { name: `${TAG} ชั้นหลังร้าน` })).id;
    // สินค้าชั่ง: แถว PosProduct ของ invItem W (createItem อาจสร้างให้แล้ว — มี = แก้ · ไม่มี = สร้าง)
    const pw = await P.posProduct.findFirst({ where: { tenantId: tid, systemId: posS, invItemId: it.W } });
    const wFields = { soldByWeight: true, scalePlu: PLU, basePriceSatang: 20000 };
    if (pw) await P.posProduct.update({ where: { id: pw.id }, data: wFields });
    else await P.posProduct.create({ data: { tenantId: tid, systemId: posS, invItemId: it.W, kind: "PRODUCT", name: `${TAG} W`, ...wFields } });
    // ของร้านอื่น (อ่านอย่างเดียว): ที่เก็บ + สินค้า + หมวดของคลังร้านอาหาร
    restoLoc = (await P.invLocation.findFirst({ where: { tenantId: restoTid }, select: { id: true } }))?.id ?? "";
    restoItem = (await P.invItem.findFirst({ where: { tenantId: restoTid, kind: "PRODUCT" }, select: { id: true } }))?.id ?? "";
    restoCat = (await P.invCategory.findFirst({ where: { tenantId: restoTid }, select: { id: true } }))?.id ?? "";
  } catch (e) {
    fx = `sandbox:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const invCtx = { tenantId: tid, systemId: invS };

  // ─── ผู้กระทำ ───
  const units = [u1, u2].filter(Boolean);
  const counter = actor(mCash, PQC.coffee.users.cashier.userId, "STAFF", { unitAccess: units, permissions: { "pos.sale.create": true, "pos.stock.count": true } });
  const sellOnly = actor(mCash, PQC.coffee.users.cashier.userId, "STAFF", { unitAccess: units, permissions: { "pos.sale.create": true } });
  const otherUnit = actor(mCash, PQC.coffee.users.cashier.userId, "STAFF", { unitAccess: [u2], permissions: { "pos.stock.count": true, "inventory.movement.adjust": true } });
  const ctx1 = { tenantId: tid, systemId: posS, unitId: u1 };
  const ctx2 = { tenantId: tid, systemId: posS, unitId: u2 };
  let keyN = 0;
  const newKey = () => `p114-${RAND}-${++keyN}`;

  // ─── ทางเรียก ───
  const refusals: Any[] = [];
  const S = async (name: string, c: Any, a: Any, input: Any, cl?: Any): Promise<Any> => {
    const r = cl ? await call(sc, name, c, a, input, cl) : await call(sc, name, c, a, input);
    if (r?.ok === false) refusals.push(r);
    if (r?.ok === true && typeof r.count?.id === "string") sb.countIds.add(r.count.id);
    return r;
  };
  const countRow = async (id: string): Promise<Any> => (PSC && id ? PSC.findUnique({ where: { id } }).catch(() => null) : null);
  const lineRows = async (countId: string): Promise<Any[]> => (PSL && countId ? ((await PSL.findMany({ where: { countId } }).catch(() => [])) as Any[]) : []);
  const lineOf = async (countId: string, itemId: string): Promise<Any> => (await lineRows(countId)).find((l) => l.itemId === itemId) ?? null;
  const entries = async (countId: string, itemId?: string): Promise<Any[]> => (PSE && countId ? ((await PSE.findMany({ where: { countId, ...(itemId ? { itemId } : {}) } }).catch(() => [])) as Any[]) : []);
  const item = async (id: string): Promise<Any> => (id ? P.invItem.findUnique({ where: { id } }).catch(() => null) : null);
  const locQty = async (itemId: string, locId: string): Promise<number> => {
    const rows = (await P.invLocationStock.findMany({ where: { itemId } }).catch(() => [])) as Any[];
    if (rows.length === 0) return locId === defLoc ? Number((await item(itemId))?.onHand ?? 0) : 0;
    return Number(rows.find((r) => r.locationId === locId)?.onHand ?? 0);
  };
  const sumLocOk = async (itemId: string): Promise<boolean> => {
    const rows = (await P.invLocationStock.findMany({ where: { itemId } }).catch(() => [])) as Any[];
    const i = await item(itemId);
    return rows.length === 0 || rows.reduce((s, r) => s + Number(r.onHand), 0) === Number(i?.onHand);
  };
  const mvs = async (where: Any): Promise<Any[]> => ((await P.invMovement.findMany({ where: { tenantId: tid, ...where }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]);
  const events = async (countId: string): Promise<Any[]> => (countId ? ((await P.outboxEvent.findMany({ where: { tenantId: tid, idempotencyKey: { contains: countId } } }).catch(() => [])) as Any[]) : []);
  const audits = async (action: string, targetId: string): Promise<Any[]> => (targetId ? ((await P.auditLog.findMany({ where: { tenantId: tid, action, targetId } }).catch(() => [])) as Any[]) : []);
  /** บิลจริงผ่าน createSale (ผู้เรียกเดิม · ตัดสต็อกหลัง commit ที่คลัง default) · ล้ม = consume ตรงแทน (บอกในผล) */
  let saleFallback = 0;
  const sell = async (itemId: string, qty: number): Promise<string> => {
    const r = await call(svc, "createSale", {
      tenantId: tid, unitId: u1, systemId: posS, sourceModule: "HOTEL", idempotencyKey: `${TAG}-sale-${++keyN}`,
      lines: [{ name: `${TAG} ขาย`, qty, unitPriceSatang: 100, itemId }], payMethods: [{ type: "CASH", amountSatang: 100 * qty }],
    });
    const saleId = typeof r?.saleId === "string" ? r.saleId : "";
    if (saleId) sb.saleIds.push(saleId);
    const cut = saleId ? (await mvs({ refType: "PosSale", refId: saleId, itemId })).length : 0;
    if (cut === 0) {
      saleFallback++;
      await inv.consume(invCtx, { itemId, qty, sourceModule: "POS", refType: "PosSale", refId: `${TAG}-fb`, idempotencyKey: `${TAG}-fb-${++keyN}` });
    }
    return saleId;
  };
  const ids = (r: Any): string => (typeof r?.count?.id === "string" ? r.count.id : "");

  // ════════ OC1 / OC3 (ส่วนแรก) ════════
  const k1 = newKey();
  const o1 = fx ? null : await S("openStockCount", ctx1, owner, { scope: "ALL", idempotencyKey: k1 });
  const c1 = ids(o1);
  {
    const e: string[] = [];
    if (!c1) e.push(`open → ${codeOf(o1)} ${short(o1?.message, 80)}`);
    else {
      const row = await countRow(c1);
      const lines = await lineRows(c1);
      const want = ["A", "B", "N", "C", "U", "W"].map((k) => it[k]).sort();
      const got = lines.map((l) => l.itemId).sort();
      if (want.join() !== got.join()) e.push(`บรรทัด ${got.length} ≠ ${want.length} (ต้องไม่มี S/X)`);
      for (const k of ["A", "B", "C", "U", "W", "N"]) {
        const l = lines.find((x) => x.itemId === it[k]);
        const q = await locQty(it[k], defLoc);
        if (l && Number(l.snapshotQty) !== q) e.push(`${k}.snapshotQty ${l.snapshotQty}≠${q}`);
        if (l && (l.countedQty !== null || l.expectedAtCount !== null)) e.push(`${k} ยังไม่นับแต่มีค่า`);
      }
      if (row?.status !== "OPEN") e.push(`status ${row?.status}`);
      if (row?.inventorySystemId !== invS) e.push("inventorySystemId");
      if (row?.locationId !== defLoc) e.push("locationId ≠ default");
      if (row?.unitId !== u1 || row?.systemId !== posS) e.push("unit/system");
      if (row?.openedByUserId !== owner.userId) e.push("openedBy");
      if (!(row?.snapshotAt instanceof Date)) e.push("snapshotAt");
      if (!(Number(row?.countNo) >= 1)) e.push("countNo");
      if (o1?.count?.countNo !== row?.countNo || o1?.count?.status !== "OPEN") e.push("ผลคืนไม่ตรงแถว");
    }
    chk("P1.14-OC1", e.length === 0, "6 บรรทัด · snapshot = ยอดที่เก็บ · OPEN", FX(e.join(" · ") || "ถูก"));
  }

  // OC3 ส่วนแรก (เปิดซ้ำ · คีย์เดิม · ที่เก็บอื่น)
  const oc3: string[] = [];
  let c1b = "";
  {
    const again = await S("openStockCount", ctx1, owner, { scope: "ALL", idempotencyKey: newKey() });
    if (codeOf(again) !== "COUNT_ALREADY_OPEN" || again?.countId !== c1) oc3.push(`เปิดซ้ำ → ${codeOf(again)} countId=${again?.countId}`);
    const rep = await S("openStockCount", ctx1, owner, { scope: "ALL", idempotencyKey: k1 });
    if (!(rep?.ok === true && rep.count?.id === c1 && rep.duplicated === true)) oc3.push(`คีย์เดิม → ${codeOf(rep)} dup=${rep?.duplicated}`);
    const ob = await S("openStockCount", ctx1, owner, { scope: "ALL", locationId: loc2, blind: true, idempotencyKey: newKey() });
    c1b = ids(ob);
    const r1 = await countRow(c1);
    const rb = await countRow(c1b);
    if (!c1b) oc3.push(`ที่เก็บ 2 → ${codeOf(ob)}`);
    else if (Number(rb?.countNo) !== Number(r1?.countNo) + 1) oc3.push(`countNo ${rb?.countNo} ≠ ${Number(r1?.countNo) + 1}`);
    else if (rb?.blind !== true || rb?.locationId !== loc2) oc3.push("blind/location ของรอบ 2");
  }

  // ════════ RE1 ════════
  const rec = (c: string, a: Any, input: Any, cl?: Any) => S("recordStockCount", ctx1, a, { countId: c, ...input }, cl);
  {
    const e: string[] = [];
    const r1 = await rec(c1, owner, { itemId: it.B, mode: "SET", qty: 9, idempotencyKey: newKey() });
    const r2 = await rec(c1, owner, { itemId: it.B, mode: "ADD", qty: 1, idempotencyKey: newKey() });
    const r3 = await rec(c1, owner, { itemId: it.B, mode: "SET", qty: 8, idempotencyKey: newKey() });
    if (r1?.line?.countedQty !== 9 || r2?.line?.countedQty !== 10 || r3?.line?.countedQty !== 8) e.push(`counted ${r1?.line?.countedQty}/${r2?.line?.countedQty}/${r3?.line?.countedQty} (${codeOf(r1)})`);
    const l = await lineOf(c1, it.B);
    if (Number(l?.countedQty) !== 8 || l?.expectedAtCount !== 10 || !(l?.countedAt instanceof Date)) e.push(`line ${short({ c: l?.countedQty, x: l?.expectedAtCount })}`);
    if (r3?.line?.expectedAtCount !== 10) e.push(`view expected ${r3?.line?.expectedAtCount}`);
    const en = await entries(c1, it.B);
    const modes = en.sort((a, b) => +a.createdAt - +b.createdAt).map((x) => `${x.mode}${x.qty}`).join(",");
    if (en.length !== 3 || modes !== "SET9,ADD1,SET8" || en.some((x) => x.byUserId !== owner.userId)) e.push(`entry ${en.length} ${modes}`);
    chk("P1.14-RE1", e.length === 0, "9→10→8 · expected 10 · entry 3", FX(e.join(" · ") || "ถูก"));
  }

  // ════════ RE2 ════════
  {
    const e: string[] = [];
    const before = (await entries(c1)).length;
    const a = await rec(c1, owner, { code: bc.A, mode: "SET", qty: 19, idempotencyKey: newKey() });
    if (!(a?.ok === true && a.line?.itemId === it.A && a.line?.countedQty === 19 && a.line?.expectedAtCount === 20)) e.push(`บาร์โค้ด → ${codeOf(a)} ${short(a?.line, 80)}`);
    const c = await rec(c1, owner, { code: sku.C, mode: "ADD", qty: 4, idempotencyKey: newKey() });
    if (!(c?.ok === true && c.line?.itemId === it.C && c.line?.countedQty === 4)) e.push(`SKU → ${codeOf(c)}`);
    const unk = await rec(c1, owner, { code: `${TAG}-NOPE`, mode: "ADD", qty: 1, idempotencyKey: newKey() });
    if (codeOf(unk) !== "UNKNOWN_CODE") e.push(`ไม่รู้จัก → ${codeOf(unk)}`);
    for (const [label, input] of [
      ["บริการ", { code: sku.S }], ["เก็บถาวร", { code: sku.X }], ["itemId เก็บถาวร", { itemId: it.X }], ["สินค้าร้านอื่น", { itemId: restoItem || "nope-item-id" }],
    ] as const) {
      const r = await rec(c1, owner, { ...input, mode: "ADD", qty: 1, idempotencyKey: newKey() });
      if (codeOf(r) !== "NOT_IN_COUNT") e.push(`${label} → ${codeOf(r)}`);
    }
    if ((await entries(c1)).length !== before + 2) e.push(`entry +${(await entries(c1)).length - before} (ต้อง +2)`);
    chk("P1.14-RE2", e.length === 0, "บาร์โค้ด/SKU ได้ · UNKNOWN_CODE · NOT_IN_COUNT ×4", FX(e.join(" · ") || "ถูก"));
  }

  // ════════ RE3 ════════
  let lastKeyW = "";
  {
    const e: string[] = [];
    const lab = await rec(c1, owner, { code: scaleLabel("21", PLU, 1250), mode: "ADD", idempotencyKey: newKey() });
    if (!(lab?.ok === true && lab.line?.itemId === it.W && lab.line?.countedQty === 1250)) e.push(`ป้าย → ${codeOf(lab)} ${short(lab?.line?.countedQty)}`);
    lastKeyW = newKey();
    const man = await rec(c1, owner, { itemId: it.W, mode: "ADD", qty: 3000, idempotencyKey: lastKeyW });
    if (man?.line?.countedQty !== 4250) e.push(`กรอกกรัม → ${codeOf(man)} ${man?.line?.countedQty}`);
    if (man?.line?.weighed !== true) e.push(`weighed=${man?.line?.weighed}`);
    const g = await S("getStockCount", ctx1, owner, { countId: c1 });
    const la = Array.isArray(g?.lines) ? g.lines.find((x: Any) => x.itemId === it.A) : null;
    if (la && la.weighed !== false) e.push("บรรทัดทั่วไป weighed ไม่ใช่ false");
    if (!la) e.push(`getStockCount → ${codeOf(g)}`);
    const both = await rec(c1, owner, { code: scaleLabel("21", PLU, 100), qty: 100, mode: "ADD", idempotencyKey: newKey() });
    if (codeOf(both) !== "VALIDATION") e.push(`ป้าย+qty → ${codeOf(both)}`);
    const l = await lineOf(c1, it.W);
    if (Number(l?.countedQty) !== 4250 || l?.expectedAtCount !== 5000) e.push(`line W ${l?.countedQty}/${l?.expectedAtCount}`);
    chk("P1.14-RE3", e.length === 0, "1250 + 3000 = 4250 g · weighed", FX(e.join(" · ") || "ถูก"));
  }

  // ════════ RE4 ════════
  {
    const e: string[] = [];
    const before = (await entries(c1)).length;
    const dup = await rec(c1, owner, { itemId: it.W, mode: "ADD", qty: 3000, idempotencyKey: lastKeyW });
    if (!(dup?.ok === true && dup.duplicated === true && dup.line?.countedQty === 4250)) e.push(`ซ้ำ → ${codeOf(dup)} dup=${dup?.duplicated} q=${dup?.line?.countedQty}`);
    const cf = await rec(c1, owner, { itemId: it.W, mode: "ADD", qty: 3001, idempotencyKey: lastKeyW });
    if (codeOf(cf) !== "IDEMPOTENCY_CONFLICT") e.push(`คีย์เดิมค่าต่าง → ${codeOf(cf)}`);
    const bad: [string, Any][] = [
      ["ติดลบ", { itemId: it.U, mode: "SET", qty: -1 }], ["ทศนิยม", { itemId: it.U, mode: "SET", qty: 1.5 }], ["ADD 0", { itemId: it.U, mode: "ADD", qty: 0 }],
      ["เกินเพดาน", { itemId: it.U, mode: "SET", qty: 10_000_001 }], ["สตริง", { itemId: it.U, mode: "SET", qty: "3" }], ["mode แปลก", { itemId: it.U, mode: "PUT", qty: 1 }],
      ["itemId+code", { itemId: it.U, code: sku.U, mode: "SET", qty: 1 }], ["ไม่มีทั้งคู่", { mode: "SET", qty: 1 }], ["คีย์แปลก", { itemId: it.U, mode: "SET", qty: 1, hack: 1 }],
    ];
    for (const [label, input] of bad) {
      const r = await rec(c1, owner, { ...input, idempotencyKey: newKey() });
      if (codeOf(r) !== "VALIDATION") e.push(`${label} → ${codeOf(r)}`);
    }
    const shortKey = await rec(c1, owner, { itemId: it.U, mode: "SET", qty: 1, idempotencyKey: "abc" });
    if (codeOf(shortKey) !== "VALIDATION") e.push(`คีย์สั้น → ${codeOf(shortKey)}`);
    const lu = await lineOf(c1, it.U);
    if (lu && lu.countedQty !== null) e.push("บรรทัด U ถูกเขียน");
    if ((await entries(c1)).length !== before) e.push(`entry เพิ่ม ${(await entries(c1)).length - before}`);
    chk("P1.14-RE4", e.length === 0, "duplicated · IDEMPOTENCY_CONFLICT · VALIDATION ×10 · ไม่มีแถว", FX(e.join(" · ") || "ถูก"));
  }

  // ════════ RE5 แข่ง ADD ════════
  {
    const e: string[] = [];
    const rs = await Promise.all(Array.from({ length: 8 }, async (_, i) => rec(c1, owner, { itemId: it.N, mode: "ADD", qty: 1, idempotencyKey: newKey() }, await lane(i))));
    const codes = rs.map(codeOf);
    if (codes.some((c) => c !== "OK")) e.push(`ผล ${codes.join(",")}`);
    const l = await lineOf(c1, it.N);
    if (Number(l?.countedQty) !== 8) e.push(`countedQty ${l?.countedQty}`);
    if ((await entries(c1, it.N)).length !== 8) e.push(`entry ${(await entries(c1, it.N)).length}`);
    chk("P1.14-RE5", e.length === 0, "8 ok · counted 8 · entry 8", FX(e.join(" · ") || "ถูก"));
  }

  // ════════ AB1 ขายระหว่างนับ ════════
  {
    const e: string[] = [];
    await sell(it.A, 2);
    const r = await rec(c1, owner, { itemId: it.A, mode: "SET", qty: 17, idempotencyKey: newKey() });
    if (!(r?.ok === true && r.line?.countedQty === 17 && r.line?.expectedAtCount === 18)) e.push(`นับ 17 → ${codeOf(r)} expected=${r?.line?.expectedAtCount}`);
    await sell(it.A, 1);
    const l = await lineOf(c1, it.A);
    if (l?.expectedAtCount !== 18 || Number(l?.snapshotQty) !== 20) e.push(`line A snap=${l?.snapshotQty} exp=${l?.expectedAtCount}`);
    if (Number((await item(it.A))?.onHand) !== 17) e.push(`onHand A ${(await item(it.A))?.onHand} (ต้อง 17)`);
    chk("P1.14-AB1", e.length === 0, "snap 20 · ขาย 2 · นับ 17 → exp 18 · ขายอีก 1", FX(e.join(" · ") || `ถูก${saleFallback ? ` (บิลจริงไม่ตัดสต็อก ${saleFallback} ครั้ง — ใช้ consume แทน)` : ""}`));
  }

  // ════════ AB2 รับ+โอนระหว่างนับ + invariant ════════
  {
    const e: string[] = [];
    await inv.receive(invCtx, { itemId: it.C, qty: 5, costSatang: 1000, idempotencyKey: `${TAG}-ab2-in`, sourceModule: "manual", refType: "QcSeed", refId: it.C });
    await inv.transfer(invCtx, { itemId: it.C, fromLocationId: defLoc, toLocationId: loc2, qty: 2, idempotencyKey: `${TAG}-ab2-tf` });
    const r = await rec(c1, owner, { itemId: it.C, mode: "SET", qty: 8, idempotencyKey: newKey() });
    if (!(r?.ok === true && r.line?.expectedAtCount === 8 && r.line?.varianceQty === 0)) e.push(`นับ C 8 → ${codeOf(r)} exp=${r?.line?.expectedAtCount} var=${r?.line?.varianceQty}`);
    const row = await countRow(c1);
    for (const l of (await lineRows(c1)).filter((x) => x.countedQty !== null)) {
      const ms = await mvs({ itemId: l.itemId, locationId: defLoc, createdAt: { gt: row?.snapshotAt, lte: l.countedAt }, OR: [{ refType: null }, { refType: { not: "PosStockCount" } }] });
      const want = Number(l.snapshotQty) + ms.reduce((s, m) => s + Number(m.qtyDelta), 0);
      if (Number(l.expectedAtCount) !== want) e.push(`invariant ${l.itemId.slice(-4)} exp=${l.expectedAtCount} ≠ ${want}`);
    }
    chk("P1.14-AB2", e.length === 0, "exp C = 8 · variance 0 · invariant ทุกบรรทัด", FX(e.join(" · ") || "ถูก"));
  }

  // ════════ PM1 (ส่วนที่ต้องมีรอบเปิด) ════════
  const pm: string[] = [];
  {
    const so = await S("openStockCount", ctx1, sellOnly, { scope: "ALL", locationId: loc2, idempotencyKey: newKey() });
    if (codeOf(so) !== "PERMISSION_DENIED") pm.push(`ขายอย่างเดียวเปิด → ${codeOf(so)}`);
    const sr = await rec(c1, sellOnly, { itemId: it.B, mode: "SET", qty: 8, idempotencyKey: newKey() });
    if (codeOf(sr) !== "PERMISSION_DENIED") pm.push(`ขายอย่างเดียวนับ → ${codeOf(sr)}`);
    const cr = await rec(c1, counter, { itemId: it.B, mode: "SET", qty: 8, idempotencyKey: newKey() });
    if (codeOf(cr) !== "OK") pm.push(`คนนับนับ → ${codeOf(cr)}`);
    const cc = await S("confirmStockCount", ctx1, counter, { countId: c1, idempotencyKey: newKey() });
    if (codeOf(cc) !== "PERMISSION_DENIED") pm.push(`คนนับยืนยัน → ${codeOf(cc)}`);
    const cx = await S("cancelStockCount", ctx1, counter, { countId: c1, reason: "ทดสอบ", idempotencyKey: newKey() });
    if (codeOf(cx) !== "PERMISSION_DENIED") pm.push(`คนนับยกเลิกรอบคนอื่น → ${codeOf(cx)}`);
    const ou = await rec(c1, otherUnit, { itemId: it.B, mode: "SET", qty: 8, idempotencyKey: newKey() });
    if (codeOf(ou) !== "PERMISSION_DENIED") pm.push(`STAFF สาขาอื่น → ${codeOf(ou)}`);
    const ni = await S("openStockCount", ctx2, owner, { scope: "ALL", idempotencyKey: newKey() });
    if (codeOf(ni) !== "NO_INVENTORY") pm.push(`สาขาไม่มีคลัง → ${codeOf(ni)}`);
    const g2 = await S("getStockCount", ctx2, owner, { countId: c1 });
    if (codeOf(g2) !== "NOT_FOUND") pm.push(`รอบสาขาอื่น → ${codeOf(g2)}`);
    const gr = await S("getStockCount", ctxR, restoOwner, { countId: c1 });
    if (codeOf(gr) !== "NOT_FOUND") pm.push(`ร้านอื่น → ${codeOf(gr)}`);
    const xr = await S("recordStockCount", ctxR, restoOwner, { countId: c1, itemId: it.B, mode: "SET", qty: 1, idempotencyKey: newKey() });
    if (codeOf(xr) !== "NOT_FOUND") pm.push(`ร้านอื่นนับ → ${codeOf(xr)}`);
    // blind (รอบที่ที่เก็บ 2)
    const gb = await S("getStockCount", ctx1, counter, { countId: c1b });
    const lb = Array.isArray(gb?.lines) ? gb.lines : [];
    if (!lb.length) pm.push(`blind get → ${codeOf(gb)}`);
    else if (lb.some((l: Any) => l.snapshotQty !== null || l.expectedAtCount !== null || l.varianceQty !== null)) pm.push("blind: คนนับเห็นตัวเลข");
    const go = await S("getStockCount", ctx1, owner, { countId: c1b });
    const lo = Array.isArray(go?.lines) ? go.lines : [];
    if (!lo.length || lo.some((l: Any) => typeof l.snapshotQty !== "number")) pm.push("blind: เจ้าของไม่เห็นตัวเลข");
  }

  // ════════ CF1 ยืนยัน (แข่งกับการขาย) ════════
  const ck1 = newKey();
  let cf1: Any = null;
  {
    const e: string[] = [];
    const before: Record<string, number> = {};
    for (const k of ["A", "B", "C", "U", "W", "N"]) before[k] = Number((await item(it[k]))?.onHand);
    const raceSales = Array.from({ length: 5 }, (_, i) => call(inv, "consume", invCtx, { itemId: it.A, qty: 1, sourceModule: "POS", refType: "PosSale", refId: `${TAG}-race`, idempotencyKey: `${TAG}-race-${i}` }));
    const [r] = await Promise.all([S("confirmStockCount", ctx1, owner, { countId: c1, idempotencyKey: ck1 }, await lane(0)), ...raceSales]);
    cf1 = r;
    if (r?.ok !== true) e.push(`confirm → ${codeOf(r)} ${short(r?.message, 80)}`);
    const row = await countRow(c1);
    if (row?.status !== "CONFIRMED" || row?.confirmedByUserId !== owner.userId || !(row?.confirmedAt instanceof Date) || row?.confirmKey !== ck1) e.push(`row ${row?.status}`);
    // ผลต่าง: A 17−18=−1 · B 8−10=−2 · C 0 · W 4250−5000=−750 · N 8−0=+8 · U ไม่นับ
    const wantVar: Record<string, number | null> = { A: -1, B: -2, C: 0, W: -750, N: 8, U: null };
    const wantOn: Record<string, number> = { A: 17 - 5 - 1, B: 8, C: 10, W: 4250, N: 8, U: 7 };
    const cmv = await mvs({ refType: "PosStockCount", refId: c1 });
    if (cmv.length !== 4) e.push(`ADJUST ของรอบ ${cmv.length} (ต้อง 4)`);
    for (const k of Object.keys(wantVar)) {
      const l = await lineOf(c1, it[k]);
      const m = cmv.filter((x) => x.itemId === it[k]);
      if ((l?.varianceQty ?? null) !== wantVar[k]) e.push(`${k}.variance ${l?.varianceQty}≠${wantVar[k]}`);
      const on = Number((await item(it[k]))?.onHand);
      if (on !== wantOn[k]) e.push(`${k}.onHand ${on}≠${wantOn[k]}`);
      if (wantVar[k]) {
        const mv = m[0];
        if (m.length !== 1) e.push(`${k} movement ${m.length}`);
        else {
          if (mv.type !== "ADJUST" || Number(mv.qtyDelta) !== wantVar[k] || mv.sourceModule !== "POS" || mv.locationId !== defLoc) e.push(`${k} mv ${mv.type}/${mv.qtyDelta}/${mv.sourceModule}`);
          if (mv.idempotencyKey !== `pos-count-${c1}-${it[k]}`) e.push(`${k} key ${mv.idempotencyKey}`);
          if (l?.movementId !== mv.id) e.push(`${k}.movementId`);
        }
      } else if (m.length) e.push(`${k} ไม่ควรมี movement`);
      if (!(await sumLocOk(it[k]))) e.push(`${k} Σที่เก็บ≠onHand`);
    }
    const lu = await lineOf(c1, it.U);
    if (lu && (lu.countedQty !== null || lu.movementId !== null)) e.push("U (ไม่นับ) ถูกแตะ");
    if (r?.ok === true && r.adjustedLines !== 4) e.push(`adjustedLines ${r.adjustedLines}`);
    chk("P1.14-CF1", e.length === 0, "4 ADJUST · A=11 B=8 C=10 W=4250 N=8 U=7 · Σ ถูก", FX(e.slice(0, 8).join(" · ") || "ถูก"));
  }

  // ════════ CF3 event + audit + replay ════════
  {
    const e: string[] = [];
    const ev = (await events(c1)).filter((x) => x.type === EVENT);
    if (ev.length !== 1) e.push(`event ${ev.length}`);
    else {
      const p = ev[0].payload ?? {};
      if (ev[0].idempotencyKey !== `PosStockCount#${c1}#CONFIRMED`) e.push(`key ${ev[0].idempotencyKey}`);
      if (p.countId !== c1 || p.countedLines !== 5 || p.adjustedLines !== 4) e.push(`payload ${short(p, 120)}`);
      const lines = (await lineRows(c1)).filter((l) => l.varianceQty !== null);
      const val = lines.reduce((s, l) => s + Number(l.varianceQty) * Number(l.costSatang ?? 0), 0);
      if (p.varianceValueSatang !== val) e.push(`varianceValueSatang ${p.varianceValueSatang}≠${val}`);
      if (ev[0].unitId !== u1 || ev[0].systemId !== posS) e.push("event unit/system");
    }
    if ((await audits("pos.stockCount.confirm", c1)).length !== 1) e.push(`audit ${(await audits("pos.stockCount.confirm", c1)).length}`);
    const rep = await S("confirmStockCount", ctx1, owner, { countId: c1, idempotencyKey: ck1 });
    if (!(rep?.ok === true && rep.duplicated === true)) e.push(`ซ้ำ → ${codeOf(rep)} dup=${rep?.duplicated}`);
    if ((await mvs({ refType: "PosStockCount", refId: c1 })).length !== 4) e.push("movement เพิ่มหลังซ้ำ");
    if ((await events(c1)).filter((x) => x.type === EVENT).length !== 1) e.push("event เพิ่มหลังซ้ำ");
    if ((await audits("pos.stockCount.confirm", c1)).length !== 1) e.push("audit เพิ่มหลังซ้ำ");
    chk("P1.14-CF3", e.length === 0, "event 1 · audit 1 · ซ้ำ = duplicated", FX(e.join(" · ") || "ถูก"));
  }

  // ════════ CF4 สถานะ ════════
  {
    const e: string[] = [];
    const before = JSON.stringify(await countRow(c1));
    const a = await S("confirmStockCount", ctx1, owner, { countId: c1, idempotencyKey: newKey() });
    const b = await rec(c1, owner, { itemId: it.U, mode: "SET", qty: 7, idempotencyKey: newKey() });
    const c = await S("cancelStockCount", ctx1, owner, { countId: c1, reason: "ทดสอบ", idempotencyKey: newKey() });
    for (const [n, r] of [["ยืนยันคีย์ใหม่", a], ["บันทึก", b], ["ยกเลิก", c]] as const) if (codeOf(r) !== "COUNT_NOT_OPEN") e.push(`${n} → ${codeOf(r)}`);
    if (JSON.stringify(await countRow(c1)) !== before) e.push("แถวรอบเปลี่ยน");
    chk("P1.14-CF4", e.length === 0, "COUNT_NOT_OPEN ×3", FX(e.join(" · ") || "ถูก"));
  }

  // ════════ CA1 ยกเลิก (รอบที่ที่เก็บ 2) ════════
  {
    const e: string[] = [];
    const r0 = await rec(c1b, owner, { itemId: it.C, mode: "SET", qty: 2, idempotencyKey: newKey() });
    if (!(r0?.ok === true && r0.line?.expectedAtCount === 2)) e.push(`นับ C ที่เก็บ 2 → ${codeOf(r0)} exp=${r0?.line?.expectedAtCount}`);
    const empty = await S("cancelStockCount", ctx1, owner, { countId: c1b, reason: "  ", idempotencyKey: newKey() });
    if (codeOf(empty) !== "VALIDATION") e.push(`เหตุผลว่าง → ${codeOf(empty)}`);
    const kc = newKey();
    const x = await S("cancelStockCount", ctx1, owner, { countId: c1b, reason: "เปิดผิดที่เก็บ", idempotencyKey: kc });
    const row = await countRow(c1b);
    if (x?.ok !== true || row?.status !== "CANCELLED" || row?.cancelledByUserId !== owner.userId || row?.cancelReason !== "เปิดผิดที่เก็บ") e.push(`ยกเลิก → ${codeOf(x)} ${row?.status}`);
    if ((await mvs({ refId: c1b })).length) e.push("มี movement");
    if ((await events(c1b)).length) e.push("มี event");
    if ((await audits("pos.stockCount.cancel", c1b)).length !== 1) e.push(`audit ${(await audits("pos.stockCount.cancel", c1b)).length}`);
    const rep = await S("cancelStockCount", ctx1, owner, { countId: c1b, reason: "เปิดผิดที่เก็บ", idempotencyKey: kc });
    if (!(rep?.ok === true && rep.duplicated === true)) e.push(`ซ้ำ → ${codeOf(rep)}`);
    const rr = await rec(c1b, owner, { itemId: it.C, mode: "SET", qty: 1, idempotencyKey: newKey() });
    const rc = await S("confirmStockCount", ctx1, owner, { countId: c1b, idempotencyKey: newKey() });
    if (codeOf(rr) !== "COUNT_NOT_OPEN" || codeOf(rc) !== "COUNT_NOT_OPEN") e.push(`หลังยกเลิก ${codeOf(rr)}/${codeOf(rc)}`);
    const reopen = await S("openStockCount", ctx1, owner, { scope: "ALL", locationId: loc2, idempotencyKey: newKey() });
    if (reopen?.ok !== true) e.push(`เปิดใหม่ที่เก็บ 2 → ${codeOf(reopen)}`);
    else await S("cancelStockCount", ctx1, owner, { countId: reopen.count.id, reason: "เก็บกวาด", idempotencyKey: newKey() });
    chk("P1.14-CA1", e.length === 0, "CANCELLED · ไม่มี movement/event · audit 1 · ซ้ำ dup · เปิดใหม่ได้", FX(e.join(" · ") || "ถูก"));
  }

  // ════════ CF5 แข่งยืนยัน ════════
  {
    const e: string[] = [];
    const o = await S("openStockCount", ctx1, owner, { scope: "ALL", idempotencyKey: newKey() });
    const c3 = ids(o);
    const r = await rec(c3, owner, { itemId: it.B, mode: "SET", qty: 7, idempotencyKey: newKey() });
    if (!(r?.ok === true && r.line?.expectedAtCount === 8)) e.push(`นับ B → ${codeOf(r)}`);
    const rs = await Promise.all(Array.from({ length: 6 }, async (_, i) => S("confirmStockCount", ctx1, owner, { countId: c3, idempotencyKey: newKey() }, await lane(i))));
    const codes = rs.map(codeOf);
    const okN = codes.filter((c) => c === "OK").length;
    if (okN !== 1 || codes.filter((c) => c === "COUNT_NOT_OPEN").length !== 5) e.push(`ผล ${codes.join(",")}`);
    if ((await mvs({ idempotencyKey: `pos-count-${c3}-${it.B}` })).length !== 1) e.push("ADJUST B ไม่เท่ากับ 1");
    if (Number((await item(it.B))?.onHand) !== 7) e.push(`onHand B ${(await item(it.B))?.onHand}`);
    if ((await events(c3)).filter((x) => x.type === EVENT).length !== 1) e.push("event ≠ 1");
    chk("P1.14-CF5", e.length === 0, "ok 1 · COUNT_NOT_OPEN 5 · ADJUST 1 · B=7", FX(e.join(" · ") || "ถูก"));
  }

  // ════════ OC2 + CF2 (รอบหมวด + ZERO) ════════
  {
    const e2: string[] = [];
    const v: [string, Any][] = [
      ["หมวดร้านอื่น", { scope: "CATEGORY", categoryIds: [restoCat || "nope-cat-id"] }], ["CATEGORY ไม่มีหมวด", { scope: "CATEGORY", categoryIds: [] }],
      ["ALL + หมวด", { scope: "ALL", categoryIds: [catA] }], ["คีย์แปลก", { scope: "ALL", hack: true }], ["scope แปลก", { scope: "SOME" }],
    ];
    const nBefore = PSC ? await PSC.count({ where: { unitId: u1 } }).catch(() => -1) : -1;
    for (const [label, input] of v) {
      const r = await S("openStockCount", ctx1, owner, { ...input, idempotencyKey: newKey() });
      if (codeOf(r) !== "VALIDATION") e2.push(`${label} → ${codeOf(r)}`);
    }
    const sk = await S("openStockCount", ctx1, owner, { scope: "ALL", idempotencyKey: "short" });
    if (codeOf(sk) !== "VALIDATION") e2.push(`คีย์สั้น → ${codeOf(sk)}`);
    if (PSC && (await PSC.count({ where: { unitId: u1 } }).catch(() => -2)) !== nBefore) e2.push("มีแถวจากค่าผิด");
    const o = await S("openStockCount", ctx1, owner, { scope: "CATEGORY", categoryIds: [catA], idempotencyKey: newKey() });
    const c4 = ids(o);
    const got = (await lineRows(c4)).map((l) => l.itemId).sort();
    const want = [it.A, it.B, it.N].sort();
    if (!c4) e2.push(`เปิดหมวด → ${codeOf(o)}`);
    else if (got.join() !== want.join()) e2.push(`บรรทัด ${got.length} (ต้อง A,B,N)`);
    chk("P1.14-OC2", e2.length === 0, "หมวด A = A,B,N · VALIDATION ×6 ไม่มีแถว", FX(e2.join(" · ") || "ถูก"));

    const e: string[] = [];
    const nc = await S("confirmStockCount", ctx1, owner, { countId: c4, idempotencyKey: newKey() });
    if (codeOf(nc) !== "NOTHING_COUNTED") e.push(`ไม่ได้นับ → ${codeOf(nc)}`);
    const out = await rec(c4, owner, { itemId: it.C, mode: "SET", qty: 1, idempotencyKey: newKey() });
    if (codeOf(out) !== "NOT_IN_COUNT") e.push(`นอกหมวด → ${codeOf(out)}`);
    const ra = await rec(c4, owner, { itemId: it.A, mode: "SET", qty: 10, idempotencyKey: newKey() });
    if (ra?.line?.expectedAtCount !== 11) e.push(`A exp ${ra?.line?.expectedAtCount} (ต้อง 11)`);
    const z = await S("confirmStockCount", ctx1, owner, { countId: c4, uncounted: "ZERO", idempotencyKey: newKey() });
    if (z?.ok !== true) e.push(`ZERO → ${codeOf(z)}`);
    const want2: Record<string, number> = { A: 10, B: 0, N: 0 };
    for (const k of Object.keys(want2)) {
      const on = Number((await item(it[k]))?.onHand);
      const lq = await locQty(it[k], defLoc);
      if (on !== want2[k] || lq !== want2[k]) e.push(`${k} onHand ${on}/ที่เก็บ ${lq} ≠ ${want2[k]}`);
    }
    const lb = await lineOf(c4, it.B);
    if (Number(lb?.countedQty) !== 0 || lb?.varianceQty !== -7) e.push(`B line ${lb?.countedQty}/${lb?.varianceQty}`);
    chk("P1.14-CF2", e.length === 0, "NOTHING_COUNTED · ZERO → B,N = 0 · A = 10", FX(e.join(" · ") || "ถูก"));
  }

  // ════════ OC3 แข่งเปิด ════════
  {
    const rs = await Promise.all(Array.from({ length: 6 }, async (_, i) => S("openStockCount", ctx1, owner, { scope: "ALL", idempotencyKey: newKey() }, await lane(i))));
    const codes = rs.map(codeOf);
    const okN = codes.filter((c) => c === "OK").length;
    if (okN !== 1 || codes.filter((c) => c === "COUNT_ALREADY_OPEN").length !== 5) oc3.push(`แข่ง ${codes.join(",")}`);
    const open = PSC ? await PSC.count({ where: { unitId: u1, locationId: defLoc, status: "OPEN" } }).catch(() => -1) : -1;
    if (open !== 1) oc3.push(`OPEN ${open}`);
    const win = rs.find((r) => r?.ok === true);
    if (win) await S("cancelStockCount", ctx1, owner, { countId: win.count.id, reason: "เก็บกวาด", idempotencyKey: newKey() });
    chk("P1.14-OC3", oc3.length === 0, "ALREADY_OPEN · dup · ที่เก็บอื่น · แข่ง 1/5", FX(oc3.join(" · ") || "ถูก"));
  }

  chk("P1.14-PM1", pm.length === 0, "DENIED ×5 · NO_INVENTORY · NOT_FOUND ×3 · blind", FX(pm.join(" · ") || "ถูก"));

  // ════════ SH1 รับของ ════════
  {
    const e: string[] = [];
    const costBefore = Number((await item(it.C))?.costSatang);
    const onBefore = Number((await item(it.C))?.onHand);
    const k = newKey();
    const r = await S("posReceiveStock", ctx1, owner, { itemId: it.C, qty: 3, idempotencyKey: k });
    const m = await mvs({ idempotencyKey: `pos-recv-${k}` });
    if (r?.ok !== true || m.length !== 1) e.push(`รับ → ${codeOf(r)} mv=${m.length}`);
    else {
      const mv = m[0];
      if (mv.type !== "IN" || Number(mv.qtyDelta) !== 3 || mv.sourceModule !== "POS" || mv.refType !== "PosUnit" || mv.refId !== u1 || r.movementId !== mv.id) e.push(`mv ${mv.type}/${mv.qtyDelta}/${mv.sourceModule}/${mv.refType}`);
    }
    if (Number((await item(it.C))?.costSatang) !== costBefore) e.push("ต้นทุนเฉลี่ยขยับ");
    if (Number((await item(it.C))?.onHand) !== onBefore + 3) e.push("onHand ไม่ +3");
    const rep = await S("posReceiveStock", ctx1, owner, { itemId: it.C, qty: 3, idempotencyKey: k });
    if (!(rep?.ok === true && rep.duplicated === true) || (await mvs({ idempotencyKey: `pos-recv-${k}` })).length !== 1) e.push(`ซ้ำ → ${codeOf(rep)}`);
    const byCode = await S("posReceiveStock", ctx1, owner, { code: bc.U, qty: 1, idempotencyKey: newKey() });
    if (byCode?.ok !== true) e.push(`สแกน → ${codeOf(byCode)}`);
    const sv = await S("posReceiveStock", ctx1, owner, { itemId: it.S, qty: 1, idempotencyKey: newKey() });
    if (codeOf(sv) !== "NOT_STOCKED") e.push(`บริการ → ${codeOf(sv)}`);
    const z = await S("posReceiveStock", ctx1, owner, { itemId: it.C, qty: 0, idempotencyKey: newKey() });
    if (codeOf(z) !== "VALIDATION") e.push(`qty 0 → ${codeOf(z)}`);
    const pd = await S("posReceiveStock", ctx1, counter, { itemId: it.C, qty: 1, idempotencyKey: newKey() });
    if (codeOf(pd) !== "PERMISSION_DENIED") e.push(`ไม่มีสิทธิ์ → ${codeOf(pd)}`);
    if (r?.ok === true && (await audits("pos.stock.receive", r.movementId)).length !== 1) e.push("audit ≠ 1");
    chk("P1.14-SH1", e.length === 0, "IN · pos-recv · ต้นทุนเดิม · dup · NOT_STOCKED · VALIDATION · DENIED · audit", FX(e.join(" · ") || "ถูก"));
  }

  // ════════ SH2 โอน ════════
  {
    const e: string[] = [];
    const onBefore = Number((await item(it.C))?.onHand);
    const l2Before = await locQty(it.C, loc2);
    const k = newKey();
    const r = await S("posTransferStock", ctx1, owner, { itemId: it.C, qty: 2, toLocationId: loc2, idempotencyKey: k });
    const out = await mvs({ idempotencyKey: `pos-tf-${k}-out` });
    const inn = await mvs({ idempotencyKey: `pos-tf-${k}-in` });
    if (r?.ok !== true || out.length !== 1 || inn.length !== 1) e.push(`โอน → ${codeOf(r)} out=${out.length} in=${inn.length}`);
    else if (out[0].type !== "TRANSFER" || Number(out[0].qtyDelta) !== -2 || out[0].locationId !== defLoc || inn[0].locationId !== loc2) e.push("mv ผิด");
    if (Number((await item(it.C))?.onHand) !== onBefore) e.push("onHand รวมเปลี่ยน");
    if ((await locQty(it.C, loc2)) !== l2Before + 2) e.push("ที่เก็บ 2 ไม่ +2");
    if (!(await sumLocOk(it.C))) e.push("Σ≠onHand");
    const rep = await S("posTransferStock", ctx1, owner, { itemId: it.C, qty: 2, toLocationId: loc2, idempotencyKey: k });
    if (!(rep?.ok === true && rep.duplicated === true) || (await mvs({ idempotencyKey: `pos-tf-${k}-out` })).length !== 1) e.push(`ซ้ำ → ${codeOf(rep)}`);
    const same = await S("posTransferStock", ctx1, owner, { itemId: it.C, qty: 1, fromLocationId: loc2, toLocationId: loc2, idempotencyKey: newKey() });
    if (codeOf(same) !== "VALIDATION") e.push(`ต้นทาง=ปลายทาง → ${codeOf(same)}`);
    const foreign = await S("posTransferStock", ctx1, owner, { itemId: it.C, qty: 1, toLocationId: restoLoc || "nope-loc-id", idempotencyKey: newKey() });
    if (codeOf(foreign) !== "NOT_FOUND") e.push(`ที่เก็บร้านอื่น → ${codeOf(foreign)}`);
    const pd = await S("posTransferStock", ctx1, counter, { itemId: it.C, qty: 1, toLocationId: loc2, idempotencyKey: newKey() });
    if (codeOf(pd) !== "PERMISSION_DENIED") e.push(`ไม่มีสิทธิ์ → ${codeOf(pd)}`);
    chk("P1.14-SH2", e.length === 0, "TRANSFER คู่ · รวมเท่าเดิม · dup · VALIDATION · NOT_FOUND · DENIED", FX(e.join(" · ") || "ถูก"));
  }

  // ════════ SH3 ปรับ ════════
  {
    const e: string[] = [];
    const onBefore = Number((await item(it.U))?.onHand);
    const k = newKey();
    const r = await S("posAdjustStock", ctx1, owner, { itemId: it.U, deltaQty: -1, reason: "แตก", idempotencyKey: k });
    const m = await mvs({ idempotencyKey: `pos-adj-${k}` });
    if (r?.ok !== true || m.length !== 1) e.push(`ปรับ → ${codeOf(r)} mv=${m.length}`);
    else if (m[0].type !== "ADJUST" || Number(m[0].qtyDelta) !== -1 || m[0].note !== "แตก" || m[0].sourceModule !== "POS" || m[0].refType !== "PosUnit" || m[0].refId !== u1) e.push(`mv ${m[0].type}/${m[0].qtyDelta}/${m[0].note}/${m[0].refType}`);
    if (Number((await item(it.U))?.onHand) !== onBefore - 1) e.push("onHand ไม่ −1");
    if (!(await sumLocOk(it.U))) e.push("Σ≠onHand");
    const rep = await S("posAdjustStock", ctx1, owner, { itemId: it.U, deltaQty: -1, reason: "แตก", idempotencyKey: k });
    if (!(rep?.ok === true && rep.duplicated === true) || (await mvs({ idempotencyKey: `pos-adj-${k}` })).length !== 1) e.push(`ซ้ำ → ${codeOf(rep)}`);
    for (const [label, input] of [["delta 0", { deltaQty: 0, reason: "x" }], ["ไม่มีเหตุผล", { deltaQty: 1 }], ["เหตุผลว่าง", { deltaQty: 1, reason: " " }]] as const) {
      const x = await S("posAdjustStock", ctx1, owner, { itemId: it.U, ...input, idempotencyKey: newKey() });
      if (codeOf(x) !== "VALIDATION") e.push(`${label} → ${codeOf(x)}`);
    }
    const pd = await S("posAdjustStock", ctx1, counter, { itemId: it.U, deltaQty: 1, reason: "x", idempotencyKey: newKey() });
    if (codeOf(pd) !== "PERMISSION_DENIED") e.push(`คนนับ → ${codeOf(pd)}`);
    chk("P1.14-SH3", e.length === 0, "ADJUST −1 · pos-adj · note · dup · VALIDATION ×3 · DENIED", FX(e.join(" · ") || "ถูก"));
  }

  // ════════ RF1 ════════
  {
    const e: string[] = [];
    const seen = new Set(refusals.map((r) => String(r.code)));
    const thrown = refusals.filter((r) => r.threw).length;
    if (thrown) e.push(`throw ${thrown} ครั้ง (${[...new Set(refusals.filter((r) => r.threw).map((r) => r.code))].slice(0, 3).join(",")})`);
    const other = [...seen].filter((c) => !(CODES as readonly string[]).includes(c) || (codeList.length > 0 && !codeList.includes(c)));
    if (other.length) e.push(`รหัสอื่น ${other.slice(0, 5).join(",")}`);
    const miss = PROVOKED.filter((c) => !seen.has(c));
    if (miss.length) e.push(`ไม่เห็น ${miss.join(",")}`);
    if (refusals.some((r) => typeof r.message !== "string" || !r.message.trim())) e.push("message ว่าง");
    chk("P1.14-RF1", e.length === 0, `11 รหัส · ไม่ throw · ${refusals.length} คำปฏิเสธ`, e.join(" · ") || `ถูก (${refusals.length})`);
  }
}

// ═════════════════════════ 6. เก็บกวาด ═════════════════════════
async function del(model: string, where: Any): Promise<number | string> {
  const d = P[model];
  if (typeof d?.deleteMany !== "function") return "absent";
  try {
    return (await d.deleteMany({ where })).count as number;
  } catch (e) {
    return `err:${(e as Error).message.slice(0, 60)}`;
  }
}
async function cleanup() {
  const counts: Record<string, number | string> = {};
  const units = sb.unitIds.filter(Boolean);
  const systems = sb.systemIds.filter(Boolean);
  if (!units.length && !systems.length) return;
  const tidIn = { tenantId: { in: TIDS } };
  const countIds = [...sb.countIds];
  if (PSC && units.length) {
    try {
      for (const r of (await PSC.findMany({ where: { ...tidIn, unitId: { in: units } }, select: { id: true } })) as Any[]) countIds.push(r.id);
    } catch {
      /* ใช้รายการที่จำไว้ */
    }
  }
  const items = sb.itemIds.length ? sb.itemIds : systems.length ? (((await P.invItem.findMany({ where: { ...tidIn, systemId: { in: systems } }, select: { id: true } }).catch(() => [])) as Any[]).map((r) => r.id)) : [];
  const unitOr = [...(units.length ? [{ unitId: { in: units } }] : []), ...(systems.length ? [{ systemId: { in: systems } }] : [])];
  const sales = [...new Set([...sb.saleIds, ...(((await P.posSale.findMany({ where: { ...tidIn, OR: unitOr }, select: { id: true } }).catch(() => [])) as Any[]).map((s) => s.id))])];
  const prods = ((await P.posProduct.findMany({ where: { ...tidIn, systemId: { in: systems } }, select: { id: true } }).catch(() => [])) as Any[]).map((r) => r.id);
  const evWhere = {
    ...tidIn,
    OR: [...unitOr, ...countIds.map((id) => ({ idempotencyKey: { contains: id } })), ...(sales.length ? [{ idempotencyKey: { in: sales.flatMap((s) => [`PosSale#${s}#PAID`, `PosSale#${s}#VOIDED`]) } }] : [])],
  };
  for (let i = 0; i < 20; i++) {
    const pend = await P.outboxEvent.count({ where: { ...evWhere, status: "PENDING" } }).catch(() => 0);
    if (pend === 0) break;
    await sleep(500);
  }
  counts.outbox = await del("outboxEvent", evWhere);
  counts.audit = await del("auditLog", {
    ...tidIn,
    createdAt: { gte: runStart },
    OR: [...(units.length ? [{ unitId: { in: units } }] : []), { targetId: { in: [...countIds, ...systems, ...units, ...sales, ...items, ...prods] } }, { action: { startsWith: "pos.stock" } }],
  });
  if (countIds.length) {
    counts.entry = await del("posStockCountEntry", { countId: { in: countIds } });
    counts.line = await del("posStockCountLine", { countId: { in: countIds } });
    counts.count = await del("posStockCount", { id: { in: countIds } });
  }
  if (sales.length) {
    await del("couponRedemption", { ...tidIn, refType: "PosSale", refId: { in: sales } });
    await del("pointLedger", { ...tidIn, refType: "PosSale", refId: { in: sales } });
    counts.payment = await del("posPayment", { saleId: { in: sales } });
    counts.saleLine = await del("posSaleLine", { saleId: { in: sales } });
    counts.sale = await del("posSale", { id: { in: sales } });
  }
  if (items.length) {
    counts.movement = await del("invMovement", { ...tidIn, itemId: { in: items } });
    counts.locStock = await del("invLocationStock", { ...tidIn, itemId: { in: items } });
    await del("invLot", { ...tidIn, itemId: { in: items } });
    await del("invItemImage", { ...tidIn, itemId: { in: items } });
    await del("accountProduct", { ...tidIn, invItemId: { in: items } });
  }
  if (systems.length) {
    await del("posProductOptionGroup", { productId: { in: prods } });
    await del("recipeLine", { productId: { in: prods } });
    counts.product = await del("posProduct", { ...tidIn, systemId: { in: systems } });
    await del("posCategory", { ...tidIn, systemId: { in: systems } });
    counts.item = await del("invItem", { ...tidIn, systemId: { in: systems } });
    await del("invLocation", { ...tidIn, systemId: { in: systems } });
    await del("invCategory", { ...tidIn, systemId: { in: systems } });
    await del("invSettings", { ...tidIn, systemId: { in: systems } });
  }
  if (units.length) {
    await del("posShift", { ...tidIn, unitId: { in: units } });
    await del("posShiftCounter", { ...tidIn, unitId: { in: units } });
    await del("posReceiptCounter", { ...tidIn, unitId: { in: units } });
    await del("appSystemUnit", { unitId: { in: units } });
  }
  if (systems.length) {
    await del("appSystemUnit", { systemId: { in: systems } });
    await del("appSystem", { id: { in: systems } });
  }
  if (units.length) await del("businessUnit", { id: { in: units } });
  console.log(`  ลบแล้ว: ${JSON.stringify(counts)} · รอบ ${new Set(countIds).size} · บิล ${sales.length} · สินค้า ${items.length} · สาขา ${units.length} · ระบบ ${systems.length}`);
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
chk("P1.14-Z1", drift.length === 0, "ก่อน = หลัง", drift.length ? drift.join(", ") : "เท่ากันทุกตาราง");
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
chk("P1.14-Z2", fpDrift.length === 0 && !Object.values(fpBefore).some((v) => v.startsWith("err")), "ลายนิ้วมือเท่าเดิมทุกตาราง", fpDrift.length ? fpDrift.join(", ") : `เท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`);
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
for (const c of lanes) await c.$disconnect?.().catch?.(() => {});
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, missing: skipReasons, a5: { drift } })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P1.14 S: รับของตามใบสั่งซื้อจาก POS (Q1) · โอนสองขั้น/ข้ามคลัง (P2.12) · ผลต่างลงบัญชี (Q2) · นับราย lot · มอบหมายโซน/อนุมัติผลต่าง (I1.7/I1.11) ·
// ออฟไลน์ (P3.4) · จอ 05ค / 16 + ข้อความ pos.stockCount.* (ใบ U) · bulkCount/StockCount.tsx เดิม
