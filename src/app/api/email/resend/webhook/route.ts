import { emails } from "@/lib/modules/crm";

// POST /api/email/resend/webhook — เหตุการณ์ของผู้ให้บริการอีเมล (Resend/Svix · ใบ C2.5)
//   ชนิดที่ใช้: `email.delivered` · `email.bounced` (bounce.type Permanent) · `email.complained`
//
// 🔴 AUDIT-CLASS X7: **ลายเซ็นไม่ผ่าน = 401 และไม่เขียนอะไรเลย** — ถ้าปล่อยผ่าน ใครก็ยิง "อีเมลคุณตีกลับ"
//    ใส่ลูกค้าของร้านอื่นได้ (ผลคือ `emailBouncedAt` + หยุดลำดับการติดตาม = ตัดสายลูกค้าของคนอื่นทิ้ง)
//    ลายเซ็น = `v1,<base64 HMAC-SHA256(`${svix-id}.${svix-timestamp}.${rawBody}`)>` ด้วยกุญแจหลัง `whsec_`
//    ของ env `RESEND_WEBHOOK_SECRET` · เวลาเก่ากว่า ±5 นาที = ปฏิเสธ (กันการยิงซ้ำของเก่า)
// 🔴 body > 256 KB = 413 (ไม่อ่านเข้าหน่วยความจำต่อ) · ตรรกะทั้งหมดอยู่ใน `emails.providerWebhook`
// 🔴 ต้องเรียกผ่าน facade `@/lib/modules/crm` เท่านั้น (fitness F2.3)

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;
const ipOf = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export async function POST(req: Request): Promise<Response> {
  // 🔴 ด่านความถี่ **ไม่ได้** อยู่ตรงนี้อีกต่อไป: มันเขียนแถว `ChatRateBucket` ⇒ คำขอที่ลายเซ็นไม่ผ่านก็ยังทิ้ง
  //    ร่องรอยการเขียนไว้ (คำว่า "401 แล้วไม่เขียนอะไรเลย" ไม่จริง) · ด่านย้ายไปอยู่ใน `emails.providerWebhook`
  //    หลังด่านขนาด+ลายเซ็น และตอบ 429 เมื่อเต็มเพดาน — route แค่ส่ง ip ให้
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return json({ ok: false }, 413);
  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return json({ ok: false }, 400);
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return json({ ok: false }, 413);
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  try {
    const res = await emails.providerWebhook({ headers, rawBody: raw, ip: ipOf(req) });
    return json({ ok: res.status >= 200 && res.status < 300 }, res.status);
  } catch {
    // ผู้ให้บริการเห็น 5xx = ยิงซ้ำไม่จบ · ปิดสุภาพหลังผ่านด่านลายเซ็นแล้ว
    return json({ ok: false }, 200);
  }
}
