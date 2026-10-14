// table-split-shared.ts — ตัวแบ่งเงินของ "แยกบิลโต๊ะ" (POS P2.5 S · R1 R2 · มติ 1 3 4 11 · มติ §11 ข้อ 1)
//
// 🔴 บริสุทธิ์ + ใช้ร่วม client (P2.5U พรีวิวแผนบนจอ · เซิร์ฟเวอร์คิดซ้ำแล้วเก็บผลตรงตัว — ค่าของเซิร์ฟเวอร์ชนะเสมอ):
//    ห้าม import prisma / server-only / next / node: / ไฟล์ฝั่งเซิร์ฟเวอร์ของ pos · ไม่มีนาฬิกา/สุ่ม · ไม่แก้ออบเจกต์ที่ส่งเข้า · ผลเดิมทุกครั้ง
// 🔴 จำนวนเต็มสตางค์ล้วน (ไม่มีทศนิยมลอยตัว · largest remainder ใช้ BigInt กันล้น)
//
// กติกา (ตารางชื่อของข้อสอบแถว 12 = สัญญา):
//   หน่วยเต็ม: รายการหนึ่งต่อใบได้บรรทัดเดียว qty k · ยอด k × ราคาต่อหน่วย (unitPrice + optionsTotal) · ใบนี้ตัดสต็อก k หน่วย
//   ส่วนแบ่ง (SEAT "กลางโต๊ะ" / EQUAL ทุกรายการ): u หน่วยของรายการ หารทุกใบ — g = u × ราคา = qN + r ⇒ ทุกใบได้ q · ใบ 1..r ได้ +1 สตางค์ ·
//     ชื่อบรรทัดบิล "<รายการ> (u/N)" · ใบ 1 (เลขต่ำสุด) ตัดสต็อก u หน่วยครั้งเดียว ใบอื่นไม่ตัด (มติ 3)
//   ฐานของใบ b_i · ส่วนลดโต๊ะ D = discountOf(billDiscount, Σb) (สูตร priceCart) → d = LR(D, b) ·
//   ค่าบริการ S = ปัดครึ่งขึ้น((Σb − D) × bp / 10000) = ค่าของบิลเดียวทั้งโต๊ะ ·
//   ITEM/SEAT: s = LR(S, b − d) · t = b − d + s
//   EQUAL (มติ §11 ข้อ 1): T = Σb − D + S = qN + r ⇒ t_i = q + 1 (i ≤ r) ไม่งั้น q · s_i = t_i − b_i + d_i
//   Σ t = Σb − D + S = ยอดทั้งโต๊ะตรงทุกสตางค์ · VAT ของใบ = splitIncludedVat(t_i) ที่ระดับบิลของใบ (COMMON ข้อ 1)
//   LR = ปัดลงก่อน แล้วเศษไปใบที่เศษมากสุด · เสมอกัน → ใบเลขต่ำ · น้ำหนักรวม 0 = แบ่งเท่า (เศษไปใบต่ำ)
import { splitIncludedVat } from "@/lib/money/vat";

export const TABLE_SPLIT_MODES = ["ITEM", "EQUAL", "SEAT"] as const;
export type TableSplitMode = (typeof TABLE_SPLIT_MODES)[number];
export const TABLE_SPLIT_MIN_PARTS = 2;
export const TABLE_SPLIT_MAX_PARTS = 20;
/** แผนหนึ่งครอบรายการได้ไม่เกิน (= เพดานบรรทัดของบิลหน้าขาย · มติ CD11) — เกิน = TOO_MANY_LINES */
export const TABLE_SPLIT_MAX_ITEMS = 200;
/** บรรทัดบิลของใบหนึ่งไม่เกิน (= REGISTER_MAX_LINES) — เกิน = TOO_MANY_LINES (U บอก "แยกเป็นรายรายการ") */
export const TABLE_SPLIT_MAX_PART_LINES = 200;

export type TableSplitItem = { id: string; qty: number; /** ราคาต่อหน่วย = unitPrice + optionsTotal (สำเนาตอนส่งรอบ) */ unitSatang: number };
/** partNo null = กลางโต๊ะ (SEAT เท่านั้น — หารทุกใบ) */
export type TableSplitAllocation = { itemId: string; partNo: number | null; qty: number };
/** PERCENT = basis point · AMOUNT = สตางค์ (สูตรเดียวกับส่วนลดท้ายบิลของ priceCart) */
export type TableSplitDiscount = { type: "PERCENT" | "AMOUNT"; value: number };
export type TableSplitInput = {
  mode: TableSplitMode;
  partCount: number;
  items: TableSplitItem[];
  /** ITEM/SEAT: ทุกหน่วยของทุกรายการต้องถูกระบุใบ (หรือกลางโต๊ะใน SEAT) · EQUAL: ไม่ส่ง */
  allocations?: TableSplitAllocation[] | null;
  billDiscount?: TableSplitDiscount | null;
  serviceChargeBp: number;
  vatRateBp?: number | null;
};
export type TableSplitLine = { itemId: string; qty: number | null; shareNum: number | null; shareDen: number | null; amountSatang: number; stockOwner: boolean };
export type TableSplitPart = { no: number; baseSatang: number; discountSatang: number; serviceChargeSatang: number; totalSatang: number; vatSatang: number; lines: TableSplitLine[] };
export type TableSplitRefusalCode = "VALIDATION" | "TOO_MANY_LINES" | "BILL_DISCOUNT_EXCEEDS_TOTAL";
export type TableSplitResult =
  | { ok: true; baseSatang: number; discountSatang: number; serviceChargeSatang: number; totalSatang: number; parts: TableSplitPart[] }
  | { ok: false; code: TableSplitRefusalCode; message: string };

const BP_FULL = 10_000;
const MONEY_MAX = 1_000_000_000_000; // ยอดต่อรายการ/ทั้งโต๊ะ (กันเลขล้น — เกิน = VALIDATION)
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const halfUp = (num: number, den: number) => Math.floor((2 * num + den) / (2 * den));
const no = (code: TableSplitRefusalCode, message: string): TableSplitResult => ({ ok: false, code, message });

/** แบ่ง total ตามน้ำหนัก (largest remainder · เสมอกัน → ใบเลขต่ำ · น้ำหนักรวม 0 = แบ่งเท่า เศษไปใบต่ำ) */
export function largestRemainderSplit(total: number, weights: readonly number[]): number[] {
  const n = weights.length;
  if (!n) return [];
  const ZERO = BigInt(0);
  const W = weights.reduce((a, w) => a + BigInt(w), ZERO);
  if (W <= ZERO) {
    const q = Math.floor(total / n);
    const r = total - q * n;
    return weights.map((_, i) => q + (i < r ? 1 : 0));
  }
  const T = BigInt(total);
  const out = weights.map((w) => Number((T * BigInt(w)) / W));
  const rem = weights.map((w, i) => ({ i, r: (T * BigInt(w)) % W }));
  let left = total - out.reduce((a, b) => a + b, 0);
  rem.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const x of rem) {
    if (left <= 0) break;
    out[x.i]!++;
    left--;
  }
  return out;
}

/** ชื่อบรรทัดส่วนแบ่งบนบิล/ใบรายการ: "<รายการ> (u/N)" */
export function tableSplitShareName(name: string, shareNum: number, shareDen: number): string {
  return `${name} (${shareNum}/${shareDen})`;
}

/**
 * แบ่งบิลโต๊ะ — บริสุทธิ์ · ปฏิเสธ: VALIDATION (ใบ < 2 หรือ > 20 · รายการว่าง/ผิดรูป/ซ้ำ · ระบุใบไม่ครบ/เกิน · ITEM แบ่งกลางโต๊ะ · เลขใบนอกช่วง ·
 * EQUAL ส่งการระบุใบ · ใบว่าง) · TOO_MANY_LINES (> 200 รายการ หรือใบใดเกิน 200 บรรทัด) · BILL_DISCOUNT_EXCEEDS_TOTAL
 */
export function allocateTableSplit(input: TableSplitInput): TableSplitResult {
  if (!input || typeof input !== "object") return no("VALIDATION", "ข้อมูลแผนแยกบิลไม่ถูกต้อง");
  const mode = input.mode;
  if (!(TABLE_SPLIT_MODES as readonly unknown[]).includes(mode)) return no("VALIDATION", "แบบการแยกบิลไม่ถูกต้อง");
  const N = input.partCount;
  if (!isInt(N) || N < TABLE_SPLIT_MIN_PARTS || N > TABLE_SPLIT_MAX_PARTS) return no("VALIDATION", `แยกได้ ${TABLE_SPLIT_MIN_PARTS}–${TABLE_SPLIT_MAX_PARTS} ใบ`);
  const items = Array.isArray(input.items) ? input.items : null;
  if (!items) return no("VALIDATION", "ข้อมูลรายการไม่ถูกต้อง");
  if (items.length > TABLE_SPLIT_MAX_ITEMS) return no("TOO_MANY_LINES", `แผนหนึ่งแยกได้ไม่เกิน ${TABLE_SPLIT_MAX_ITEMS} รายการ`);
  if (!items.length) return no("VALIDATION", "โต๊ะนี้ไม่มีรายการให้แยกบิล");
  const seen = new Set<string>();
  for (const it of items) {
    if (!it || typeof it.id !== "string" || !it.id || seen.has(it.id) || !isInt(it.qty) || it.qty < 1 || !isInt(it.unitSatang) || it.unitSatang < 0 || it.qty * it.unitSatang > MONEY_MAX) {
      return no("VALIDATION", "ข้อมูลรายการไม่ถูกต้อง");
    }
    seen.add(it.id);
  }
  const bp = input.serviceChargeBp;
  if (!isInt(bp) || bp < 0 || bp > BP_FULL) return no("VALIDATION", "อัตราค่าบริการไม่ถูกต้อง");
  const vr = input.vatRateBp ?? 0;
  if (!isInt(vr) || vr < 0 || vr > BP_FULL) return no("VALIDATION", "อัตราภาษีไม่ถูกต้อง");
  const disc = input.billDiscount ?? null;
  if (disc !== null && (typeof disc !== "object" || (disc.type !== "PERCENT" && disc.type !== "AMOUNT") || !isInt(disc.value) || disc.value < 0 || disc.value > MONEY_MAX)) {
    return no("VALIDATION", "ส่วนลดท้ายบิลไม่ถูกต้อง");
  }

  // ── การระบุใบ: whole = รายการ → ใบ → หน่วย · shared = รายการ → หน่วยกลางโต๊ะ (หารทุกใบ) ──
  const whole = new Map<string, Map<number, number>>();
  const shared = new Map<string, number>();
  const allocs = input.allocations ?? [];
  if (!Array.isArray(allocs)) return no("VALIDATION", "การระบุใบไม่ถูกต้อง");
  if (mode === "EQUAL") {
    if (allocs.length) return no("VALIDATION", "หารเท่าไม่ต้องระบุใบของรายการ");
    for (const it of items) shared.set(it.id, it.qty);
  } else {
    const got = new Map<string, number>();
    for (const a of allocs) {
      if (!a || typeof a !== "object" || !seen.has(a.itemId) || !isInt(a.qty) || a.qty < 1) return no("VALIDATION", "การระบุใบของรายการไม่ถูกต้อง");
      if (a.partNo === null) {
        if (mode !== "SEAT") return no("VALIDATION", "แยกรายรายการแบ่งกลางโต๊ะไม่ได้ — ใช้แบบตามที่นั่ง");
        shared.set(a.itemId, (shared.get(a.itemId) ?? 0) + a.qty);
      } else {
        if (!isInt(a.partNo) || a.partNo < 1 || a.partNo > N) return no("VALIDATION", "เลขบิลนอกช่วงของแผน");
        const m = whole.get(a.itemId) ?? new Map<number, number>();
        m.set(a.partNo, (m.get(a.partNo) ?? 0) + a.qty);
        whole.set(a.itemId, m);
      }
      got.set(a.itemId, (got.get(a.itemId) ?? 0) + a.qty);
    }
    for (const it of items) if ((got.get(it.id) ?? 0) !== it.qty) return no("VALIDATION", "ยังมีรายการที่ยังไม่ได้เลือกบิล/ที่นั่ง หรือระบุเกินจำนวน");
  }

  // ── บรรทัดของแต่ละใบ (ลำดับรายการตามที่ส่งมา · หน่วยเต็มก่อนส่วนแบ่ง) ──
  const lines: TableSplitLine[][] = Array.from({ length: N }, () => []);
  for (const it of items) {
    for (const [p, k] of [...(whole.get(it.id) ?? new Map<number, number>()).entries()].sort((x, y) => x[0] - y[0])) {
      lines[p - 1]!.push({ itemId: it.id, qty: k, shareNum: null, shareDen: null, amountSatang: k * it.unitSatang, stockOwner: true });
    }
    const u = shared.get(it.id) ?? 0;
    if (u > 0) {
      const g = u * it.unitSatang;
      const q = Math.floor(g / N);
      const r = g - q * N;
      for (let p = 1; p <= N; p++) lines[p - 1]!.push({ itemId: it.id, qty: null, shareNum: u, shareDen: N, amountSatang: q + (p <= r ? 1 : 0), stockOwner: p === 1 });
    }
  }
  if (lines.some((l) => !l.length)) return no("VALIDATION", "มีบิลที่ยังไม่มีรายการ — ลดจำนวนบิลหรือเลือกรายการให้ครบ");
  if (lines.some((l) => l.length > TABLE_SPLIT_MAX_PART_LINES)) return no("TOO_MANY_LINES", `บิลหนึ่งใบมีได้ไม่เกิน ${TABLE_SPLIT_MAX_PART_LINES} บรรทัด — แยกเป็นรายรายการแทน`);

  // ── เงิน ──
  const b = lines.map((l) => l.reduce((t, x) => t + x.amountSatang, 0));
  const B = b.reduce((t, x) => t + x, 0);
  if (B > MONEY_MAX) return no("VALIDATION", "ยอดของโต๊ะสูงเกินที่ระบบรับได้");
  const D = !disc ? 0 : disc.type === "AMOUNT" ? disc.value : disc.value > BP_FULL ? B + 1 : halfUp(B * disc.value, BP_FULL);
  if (D > B) return no("BILL_DISCOUNT_EXCEEDS_TOTAL", "ส่วนลดท้ายบิลมากกว่ายอดของโต๊ะ");
  const d = largestRemainderSplit(D, b);
  const S = halfUp((B - D) * bp, BP_FULL);
  let s: number[];
  let t: number[];
  if (mode === "EQUAL") {
    const T = B - D + S;
    const q = Math.floor(T / N);
    const r = T - q * N;
    t = b.map((_, k) => q + (k < r ? 1 : 0));
    s = t.map((x, k) => x - b[k]! + d[k]!);
  } else {
    s = largestRemainderSplit(
      S,
      b.map((x, k) => x - d[k]!),
    );
    t = b.map((x, k) => x - d[k]! + s[k]!);
  }
  return {
    ok: true,
    baseSatang: B,
    discountSatang: D,
    serviceChargeSatang: S,
    totalSatang: B - D + S,
    parts: b.map((x, k) => ({
      no: k + 1,
      baseSatang: x,
      discountSatang: d[k]!,
      serviceChargeSatang: s[k]!,
      totalSatang: t[k]!,
      vatSatang: vr > 0 ? splitIncludedVat(t[k]!, vr).vatSatang : 0,
      lines: lines[k]!,
    })),
  };
}

/**
 * ยอดของใบตอนลงบิล (createSale รับค่าบริการ ≥ 0 เท่านั้น): EQUAL ปัดเศษแล้วค่าบริการของใบติดลบได้ (เช่น ร้านปิดค่าบริการ s_i = −1) —
 * ส่วนที่ติดลบย้ายไปเป็นส่วนลดท้ายบิลของใบนั้น ⇒ ยอดบิล = b − d + s ตรงตัวเสมอ (แผนเก็บค่าตามสูตรไม่เปลี่ยน)
 */
export function tableSplitSaleAmounts(p: { discountSatang: number; serviceChargeSatang: number }): { billDiscountSatang: number; serviceChargeSatang: number } {
  return p.serviceChargeSatang < 0
    ? { billDiscountSatang: p.discountSatang - p.serviceChargeSatang, serviceChargeSatang: 0 }
    : { billDiscountSatang: p.discountSatang, serviceChargeSatang: p.serviceChargeSatang };
}
