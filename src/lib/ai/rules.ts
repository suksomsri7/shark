// กติกา AI Layer (pure functions — oracle ยิงตรง ห้ามแตะ DB/เวลาโลกจริง)
// docs/AI_LAYER.md · เพดานใช้งานต่อ tenant ต่อวัน + การเตรียม history ก่อนส่ง provider

export type AiUsageCount = { requests: number; tokensIn: number; tokensOut: number };
export type AiLimits = { maxRequests: number; maxTokens: number };

/** วันแบบ "YYYY-MM-DD" ตามเวลาไทย — ใช้เป็น key ของ AiUsage */
export function dayKeyBangkok(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

/** เกินเพดานวันนี้แล้วหรือยัง (นับ tokens รวม in+out) */
export function overBudget(u: AiUsageCount, lim: AiLimits): boolean {
  return u.requests >= lim.maxRequests || u.tokensIn + u.tokensOut >= lim.maxTokens;
}

/**
 * ตัด history ให้พอดีงบตัวอักษร — เก็บข้อความ "ท้ายสุด" ไว้เสมอ (บริบทล่าสุดสำคัญสุด)
 * เดินจากท้ายกลับหัว หยุดเมื่อเกินงบ
 */
export function trimHistory<T extends { content: string }>(msgs: T[], maxChars: number): T[] {
  const out: T[] = [];
  let used = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    used += msgs[i].content.length;
    if (out.length > 0 && used > maxChars) break;
    out.unshift(msgs[i]);
  }
  return out;
}

/** หัวเรื่องบทสนทนาจากข้อความแรก — บรรทัดเดียว ตัด 60 ตัว */
export function titleFrom(text: string): string {
  const line = text.split("\n")[0].trim();
  return line.length > 60 ? `${line.slice(0, 59)}…` : line;
}
