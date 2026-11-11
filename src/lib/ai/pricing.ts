// ราคาโมเดล — แหล่งความจริงเดียวของ "1 การเรียก AI คิดเงินเท่าไหร่"
//
// ราคาต่อ 1M token (USD) ตามราคา Anthropic first-party ที่ OpenRouter ส่งผ่าน
// อัปเดตราคาที่นี่ที่เดียว — ledger เก็บยอดเป็นไมโครดอลลาร์ตอนคิด ราคาย้อนหลังจึงไม่เปลี่ยน
//
// ⚠️ ราคาที่ผู้ใช้จ่ายจริงบวก markup ได้ทาง env (SHARK_AI_PRICE_MARKUP · default 1 = ขายเท่าทุน)

export const MICRO_PER_USD = 1_000_000;

/**
 * SEC S3a.1-R2 ▸ R-Z44 (F4): ราคาแคชของ Anthropic — เขียนแคช = ขาเข้า × 1.25 · อ่านแคช = ขาเข้า × 0.1
 *   (`cacheWritePerM`/`cacheReadPerM` คำนวณจาก `inPerM` เสมอ · ไม่ตั้งแยกในตาราง) ◂
 */
type Price = { inPerM: number; outPerM: number; cacheWritePerM: number; cacheReadPerM: number };
type BasePrice = { inPerM: number; outPerM: number };
const withCache = (p: BasePrice): Price => ({ ...p, cacheWritePerM: p.inPerM * 1.25, cacheReadPerM: p.inPerM * 0.1 });

// จับคู่ด้วย substring เพราะ id ของ OpenRouter มี prefix ผู้ให้บริการ (anthropic/claude-haiku-4.5)
const PRICES: { match: string; price: BasePrice }[] = [
  { match: "haiku", price: { inPerM: 1, outPerM: 5 } },
  { match: "sonnet", price: { inPerM: 3, outPerM: 15 } },
  { match: "opus", price: { inPerM: 5, outPerM: 25 } },
];

// โมเดลที่ไม่รู้จัก → คิดเรทแพงสุดที่เรารองรับ (opus) — ปลอดภัยกว่าคิดถูกไปแล้วขาดทุนเงียบ ๆ
const FALLBACK: BasePrice = { inPerM: 5, outPerM: 25 };

/** ราคาโมเดล (USD/1M token) — export ไว้ให้หน้าอธิบายค่าใช้จ่ายใช้ตัวเลขชุดเดียวกับที่คิดเงินจริง */
export function priceOf(model: string): Price {
  const m = String(model ?? "").toLowerCase();
  return withCache(PRICES.find((p) => m.includes(p.match))?.price ?? FALLBACK);
}

function markup(): number {
  const v = Number(process.env.SHARK_AI_PRICE_MARKUP);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/**
 * ค่าใช้จ่ายของการเรียก 1 ครั้ง เป็นไมโครดอลลาร์ (ปัดขึ้นเสมอ)
 * - ใช้จริงแต่ปัดได้ 0 → คิดขั้นต่ำ 1 ไมโครดอลลาร์ (ห้ามมีการเรียกที่ฟรีสนิท)
 * - token ติดลบ/เพี้ยน → ถือเป็น 0 (ไม่ throw — ห้ามให้คำตอบผู้ใช้หายเพราะคิดเงินพลาด)
 * - SEC S3a.1-R2 ▸ R-Z44: `tokensIn` = ขาเข้าที่ไม่ใช่แคช · `cache` = token ที่เขียน/อ่านแคช (ราคาแยก) · ไม่ส่ง = ลายเซ็นเดิม (ไม่มีแคช) ◂
 */
export function costMicroUsd(model: string, tokensIn: number, tokensOut: number, cache?: { write?: number; read?: number }): number {
  const tin = Math.max(0, Math.round(tokensIn || 0));
  const tout = Math.max(0, Math.round(tokensOut || 0));
  const cw = Math.max(0, Math.round(Number(cache?.write) || 0));
  const cr = Math.max(0, Math.round(Number(cache?.read) || 0));
  if (tin + tout + cw + cr === 0) return 0;
  const p = priceOf(model);
  const usd = ((tin * p.inPerM + tout * p.outPerM + cw * p.cacheWritePerM + cr * p.cacheReadPerM) / 1_000_000) * markup();
  return Math.max(1, Math.ceil(usd * MICRO_PER_USD));
}

/** ไมโครดอลลาร์ → ข้อความเงินอ่านง่าย (ทศนิยม 4 ตำแหน่งสำหรับยอดเล็ก · 2 ตำแหน่งสำหรับยอดใหญ่) */
export function formatUsd(micro: number): string {
  const usd = micro / MICRO_PER_USD;
  const abs = Math.abs(usd);
  const digits = abs > 0 && abs < 1 ? 4 : 2;
  return `$${usd.toFixed(digits)}`;
}
