// ─────────────────────────────────────────────────────────────
// trips/money-math.ts — ตัวช่วยเงินบริสุทธิ์ (RUN TRIPS T0.5) · ที่เดียวในไฟล์ราคาที่มีการหาร/ปัดเงิน
// ใบสั่ง ledger/trips-briefs/T0.5.md §1 · สัญญา CC §F.1 (ปัดเศษ) §H.2 §H.4
//
// 🔴 บริสุทธิ์ล้วน: ไม่มี import · เงินเป็นจำนวนเต็ม (สตางค์ / หน่วยย่อยของสกุล) · คำนวณด้วย BigInt (ไม่เพี้ยนเมื่อค่าใหญ่)
// 🔴 ปัดครึ่งออกจากศูนย์ (half-up · ค่าลบสมมาตร) ทุกตัว · ค่าคงที่ได้แค่หน่วย (10000 bp · 1e6 micros)
// ─────────────────────────────────────────────────────────────

/** 1 = 10000 basis point */
export const BP_UNIT = 10_000;
/** อัตราแลกเปลี่ยนเก็บเป็น micros (1 = 1e6) */
export const MICROS_UNIT = 1_000_000;

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);

function big(n: number, what: string): bigint {
  if (!Number.isSafeInteger(n)) throw new RangeError(`[money-math] ${what} ต้องเป็นจำนวนเต็ม (ได้ ${String(n)})`);
  return BigInt(n);
}
function out(b: bigint): number {
  const n = Number(b);
  if (!Number.isSafeInteger(n)) throw new RangeError("[money-math] ผลลัพธ์ใหญ่เกินจำนวนเต็มที่ปลอดภัย");
  return n;
}
/** num / den ปัดครึ่งออกจากศูนย์ */
function divHalfUp(num: bigint, den: bigint): bigint {
  if (den === ZERO) throw new RangeError("[money-math] หารด้วยศูนย์");
  const neg = num < ZERO !== den < ZERO;
  const a = num < ZERO ? -num : num;
  const b = den < ZERO ? -den : den;
  const q = (TWO * a + b) / (TWO * b);
  return neg ? -q : q;
}

/** round(a × b / c) half-up */
export function mulDivHalfUp(a: number, b: number, c: number): number {
  return out(divHalfUp(big(a, "a") * big(b, "b"), big(c, "c")));
}

/** round(a × bp / 10000) half-up — ส่วนตาม basis point */
export function mulBpHalfUp(a: number, bp: number): number {
  return mulDivHalfUp(a, bp, BP_UNIT);
}

/** ⌈a / b⌉ (b > 0) */
export function divCeil(a: number, b: number): number {
  const x = big(a, "a");
  const y = big(b, "b");
  if (y <= ZERO) throw new RangeError("[money-math] ตัวหารต้องมากกว่า 0");
  const q = x / y;
  return out(x % y !== ZERO && x > ZERO ? q + ONE : q);
}

/** ⌊a / b⌋ (b > 0) — จำนวนเต็ม (เช่น จำนวนที่นั่งฟรีต่อกลุ่ม) */
export function divFloor(a: number, b: number): number {
  const x = big(a, "a");
  const y = big(b, "b");
  if (y <= ZERO) throw new RangeError("[money-math] ตัวหารต้องมากกว่า 0");
  const q = x / y;
  return out(x % y !== ZERO && x < ZERO ? q - ONE : q);
}

/** VAT ที่อยู่ในยอดรวม VAT: round(a × bp / (10000 + bp)) */
export function vatOfInclusive(a: number, bp: number): number {
  return mulDivHalfUp(a, bp, BP_UNIT + bp);
}

/** VAT ที่ต้องบวกเพิ่มบนยอดไม่รวม VAT: round(a × bp / 10000) */
export function vatOfExclusive(a: number, bp: number): number {
  return mulBpHalfUp(a, bp);
}

/** หน่วยย่อยของสกุลต่างประเทศ (เซนต์) → สตางค์: round(minor × rateMicros / 1e6) ต่อบรรทัด */
export function minorToSatang(minor: number, rateMicros: number): number {
  return mulDivHalfUp(minor, rateMicros, MICROS_UNIT);
}

/**
 * ปันยอด `total` ตามน้ำหนัก: ทุกบรรทัด = round(total × w / Σw) · บรรทัดสุดท้ายที่น้ำหนัก > 0 รับเศษ (ผลรวมตรงพอดี)
 * น้ำหนัก 0 ได้ 0 · ยอดที่ปันสะสมเกิน total (ปัดขึ้นหลายบรรทัด) ⇒ ตัดให้พอดี (ไม่มีบรรทัดติดลบ) · Σw = 0 ⇒ ทั้งหมดลงบรรทัดสุดท้าย
 */
export function allocateLastRemainder(total: number, weights: readonly number[]): number[] {
  big(total, "total");
  const n = weights.length;
  if (n === 0) return [];
  const res = weights.map(() => 0);
  const sumW = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (sumW === 0) {
    res[n - 1] = total;
    return res;
  }
  let last = -1;
  for (let i = 0; i < n; i++) if (weights[i] > 0) last = i;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (i === last || weights[i] <= 0) continue;
    let share = mulDivHalfUp(total, weights[i], sumW);
    if (total >= 0 && acc + share > total) share = Math.max(0, total - acc);
    res[i] = share;
    acc += share;
  }
  res[last] = total - acc;
  return res;
}

/**
 * ปันแบบมีเพดานต่อบรรทัด (ส่วนลด/ยอดที่จ่าย): เหมือน allocateLastRemainder แต่ไม่มีบรรทัดใดได้เกินน้ำหนักของตัวเอง
 * ส่วนที่ล้นของบรรทัดสุดท้ายย้ายไปบรรทัดก่อนหน้าที่ยังมีที่ว่าง (ตามลำดับ) · total ถูกตัดที่ Σ น้ำหนัก
 */
export function allocateWithin(total: number, weights: readonly number[]): number[] {
  const cap = weights.reduce((s, w) => s + Math.max(0, w), 0);
  const t = Math.max(0, Math.min(total, cap));
  const res = allocateLastRemainder(t, weights.map((w) => Math.max(0, w)));
  let spill = 0;
  for (let i = 0; i < res.length; i++) {
    const w = Math.max(0, weights[i]);
    if (res[i] > w) {
      spill += res[i] - w;
      res[i] = w;
    }
  }
  for (let i = 0; i < res.length && spill > 0; i++) {
    const room = Math.max(0, weights[i]) - res[i];
    const take = Math.min(room, spill);
    res[i] += take;
    spill -= take;
  }
  return res;
}
