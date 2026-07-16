// Rate limiter กลาง (core kernel · WO-0043) — in-memory sliding window ต่อ process
// serverless/pm2 = ต่อ instance (กันยิงถล่มระดับ instance) — ยอมรับได้บน Vercel ตามสัญญา
// ใช้กับ surface สาธารณะ (webchat) + จุดที่ต้องกันถล่มเชิง IP/session
// หมายเหตุ: กันถล่ม OTP (login/backoffice) ใช้การนับ AuthToken ใน DB แทน (ทนข้าม instance)

type Bucket = number[]; // timestamps (ms) เรียงเก่า→ใหม่
const buckets = new Map<string, Bucket>();
const MAX_KEYS = 50_000; // กัน map โตไม่จำกัด — เกินแล้วกวาดถังหมดอายุก่อน

function sweep(now: number, windowMs: number): void {
  for (const [k, arr] of buckets) {
    const live = arr.filter((t) => now - t < windowMs);
    if (live.length === 0) buckets.delete(k);
    else buckets.set(k, live);
  }
}

/**
 * นับ 1 ครั้งเมื่อผ่าน · ถึงลิมิตในหน้าต่างเวลา → { ok:false, retryAfterSec }
 * @param key   ถังแยก (แนะนำ `${scope}:${id}`)
 * @param opts  limit = จำนวนสูงสุดในหน้าต่าง · windowMs = ความยาวหน้าต่าง (ms)
 */
export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): { ok: boolean; retryAfterSec?: number } {
  const now = Date.now();
  if (buckets.size > MAX_KEYS) sweep(now, opts.windowMs);
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < opts.windowMs);
  if (arr.length >= opts.limit) {
    buckets.set(key, arr);
    const oldest = arr[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((opts.windowMs - (now - oldest)) / 1000));
    return { ok: false, retryAfterSec };
  }
  arr.push(now);
  buckets.set(key, arr);
  return { ok: true };
}

/** ล้างถัง (สำหรับทดสอบ) — ไม่ส่ง key = ล้างทั้งหมด */
export function resetRateLimit(key?: string): void {
  if (key === undefined) buckets.clear();
  else buckets.delete(key);
}
