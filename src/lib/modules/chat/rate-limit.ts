// Rate limiter กลางของ Chat public surface (M9) — in-memory sliding window ต่อ process
// serverless/pm2 = ต่อ instance (กันยิงถล่มระดับ instance) + คู่กับ cap contact ใหม่/ชม. ระดับ DB ใน service
// key แนะนำ: `${ip}:${connectionId}` — คนละ IP/connection คนละถัง

type Bucket = number[]; // timestamps (ms) เรียงเก่า→ใหม่
const buckets = new Map<string, Bucket>();
const MAX_KEYS = 50_000; // กัน map โตไม่จำกัด (สแปมหลาย IP) — เกินแล้วล้างถังหมดอายุก่อน

function sweep(now: number, windowMs: number) {
  for (const [k, arr] of buckets) {
    const live = arr.filter((t) => now - t < windowMs);
    if (live.length === 0) buckets.delete(k);
    else buckets.set(k, live);
  }
}

/** คืน true = ผ่าน (ยังไม่ถึงลิมิต), false = โดนจำกัด — นับ 1 ครั้งเมื่อผ่าน */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (buckets.size > MAX_KEYS) sweep(now, windowMs);
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return false;
  }
  arr.push(now);
  buckets.set(key, arr);
  return true;
}

/** ดึง client IP จาก proxy headers (Vercel/nginx) — fallback "unknown" */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

// เฉพาะ test/dev — ล้างถังทั้งหมด
export function __resetRateLimit() {
  buckets.clear();
}
