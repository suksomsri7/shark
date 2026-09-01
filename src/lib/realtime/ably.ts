// ably.ts — adapter ของผู้ให้บริการ (Ably) · **ฝั่งเซิร์ฟเวอร์เท่านั้น**
//
// 🔴 ทำไมยิง REST ด้วย `fetch` แทนการใช้ SDK ของเจ้านี้
//    1. เส้นทาง "ส่งสัญญาณ" ของเราคือ POST ครั้งเดียวจบ — ไม่ต้องถือ websocket ค้างไว้
//       บน serverless การถือ connection ค้าง = ค่าใช้จ่ายและ handle ที่ไม่มีใครปิด
//    2. `fetch` เป็นของกลางที่ทั้งเครื่องมือตรวจและ runtime ทุกตัวมองเห็น ⇒ พิสูจน์ได้ว่า
//       "ไม่มีกุญแจ = ไม่มีคำขอออกไปจริง ๆ" ไม่ใช่เชื่อตามที่ SDK บอก
//    3. เปลี่ยนผู้ให้บริการ = เขียนไฟล์นี้ใหม่ไฟล์เดียว · `index.ts` และ callsite ไม่ต้องรู้เรื่อง
//
// 🔴 ไฟล์นี้ห้ามถูก import จากไฟล์ "use client" เด็ดขาด — มันอ่านกุญแจของร้าน

/** ปลายทาง REST ของผู้ให้บริการ (publish + ขอ token ให้เบราว์เซอร์) */
const ABLY_REST = "https://rest.ably.io";

/**
 * ยอมรอผู้ให้บริการนานสุดเท่านี้
 * 🔴 ต้องมีเพดานเสมอ: เส้นทางที่เรียกตัวนี้คือ "ลูกค้าส่งข้อความเข้ามา" ซึ่งบันทึกลง DB ไปแล้ว
 *    ปล่อยให้ค้างรอผู้ให้บริการ = ลูกค้าเห็นหมุนค้างเพราะระบบแจ้งเตือนช้า (คนละเรื่องกับข้อความ)
 */
const TIMEOUT_MS = 3000;

/**
 * อายุ token ของเบราว์เซอร์ — สั้นพอที่การถอนสิทธิ์คนหนึ่งจะมีผลจริงภายในเวลาที่ยอมรับได้
 * (ต่ออายุอัตโนมัติผ่าน `authUrl` ซึ่งวิ่งผ่านด่าน `requireChatRead()` ใหม่ทุกครั้ง)
 */
const TOKEN_TTL_MS = 60 * 60_000;

/** กุญแจของร้าน — อ่าน **ตอนถูกเรียก** เสมอ ไม่ใช่ตอน import (ดูเหตุผลใน index.ts) */
export function ablyKey(): string {
  return (process.env.ABLY_API_KEY ?? "").trim();
}

/** ตั้งกุญแจไว้แล้วหรือยัง — ตัวเดียวที่ตัดสินว่าโหมดเป็น realtime หรือ polling */
export function ablyConfigured(): boolean {
  return ablyKey().length > 0;
}

/** Basic auth ของ Ably = กุญแจทั้งดุ้น (`appId.keyId:secret`) เข้ารหัส base64 */
function basicAuth(key: string): string {
  return `Basic ${Buffer.from(key, "utf8").toString("base64")}`;
}

async function withTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ส่งสัญญาณขึ้นช่อง — ผู้เรียกคือ `publish()` ใน `index.ts` ซึ่งกรอง payload มาแล้ว
 * ⚠️ ห้ามเรียกตัวนี้ตรงจากที่อื่น (จะข้ามด่านคัดกรอง PDPA)
 */
export async function ablyPublish(
  channel: string,
  event: string,
  data: Record<string, unknown>,
): Promise<void> {
  const key = ablyKey();
  if (!key) return;
  await withTimeout(`${ABLY_REST}/channels/${encodeURIComponent(channel)}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: basicAuth(key) },
    body: JSON.stringify({ name: event, data }),
  });
}

/**
 * ขอ token ให้เบราว์เซอร์ (จำกัดสิทธิ์ไว้แค่ช่องของร้าน+ระบบนั้น · อ่านอย่างเดียว)
 *
 * 🔴 เบราว์เซอร์ห้ามได้กุญแจจริงเด็ดขาด — กุญแจจริงเขียนได้ทุกช่องของทุกร้าน
 *    ⇒ ร้าน A เปิด devtools แล้วอ่านสัญญาณของร้าน B ได้ทันที
 * 🔴 `capability` ให้แค่ `subscribe` — จอไม่มีเหตุต้องยิงสัญญาณเอง (ทุกสัญญาณเกิดที่เซิร์ฟเวอร์
 *    หลังบันทึกข้อมูลสำเร็จแล้วเท่านั้น) · ให้ `publish` กับเบราว์เซอร์ = ใครก็ปลอมสัญญาณได้
 */
export async function ablyIssueToken(
  channel: string,
  clientId: string,
): Promise<unknown | null> {
  const key = ablyKey();
  if (!key) return null;
  const keyName = key.split(":")[0] ?? "";
  if (!keyName) return null;
  const res = await withTimeout(
    `${ABLY_REST}/keys/${encodeURIComponent(keyName)}/requestToken`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: basicAuth(key) },
      body: JSON.stringify({
        capability: JSON.stringify({ [channel]: ["subscribe"] }),
        clientId,
        ttl: TOKEN_TTL_MS,
      }),
    },
  );
  if (!res.ok) return null;
  return (await res.json()) as unknown;
}
