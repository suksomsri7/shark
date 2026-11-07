import { NextResponse, type NextRequest } from "next/server";
import { hotelHostAllowed, hotelWebClientKey, publicAttachSlip, publicSlipGate } from "@/lib/platform/hotel-web";

// SVC H.8 ▸ อัปโหลดสลิปมัดจำ (หน้า S4 · multipart) → ระบบสลิปกลาง (HOTEL/HOTEL_DEPOSIT · ไฟล์ส่วนตัว ≤ 5 MB · คิวพนักงาน/ตัวตรวจของร้าน)
//   rate limit ต่อ IP+หน่วย · ยอดคาดคิดฝั่งเซิร์ฟเวอร์ · ผลกลับหน้าเดิมด้วย 303 + ?slip=ok|pending|bad|rate (ไม่มี path/URL ไฟล์ในคำตอบ)
// SVC H.8 r2 (ผู้ตรวจรอบ 1 ข้อ 7): ด่านโดเมนร้านเดียวกับหน้า · นับ rate ก่อนอ่าน body (publicSlipGate → ตั๋วครั้งเดียว) · อ่าน body ตามไบต์จริงมีเพดาน (ไม่เชื่อ content-length อย่างเดียว)
export const dynamic = "force-dynamic";

const MAX_BODY = 6 * 1024 * 1024;

/** อ่าน body ทีละก้อน · เกินเพดาน = null (หยุดอ่านทันที) */
async function readCapped(req: NextRequest, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!req.body) return new Uint8Array(new ArrayBuffer(0));
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(new ArrayBuffer(n));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ tenantSlug: string; unitSlug: string; publicToken: string }> }) {
  const { tenantSlug, unitSlug, publicToken } = await ctx.params;
  if (!(await hotelHostAllowed(req.headers.get("host"), tenantSlug))) return new NextResponse(null, { status: 404 });
  const base = `/s/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(unitSlug)}/hotel`;
  const lang = req.nextUrl.searchParams.get("lang");
  const back = (state: string) => NextResponse.redirect(new URL(`${base}/pay/${encodeURIComponent(publicToken)}?slip=${state}${lang === "en" || lang === "th" ? `&lang=${lang}` : ""}`, req.url), 303);
  const opts = { clientKey: hotelWebClientKey(req.headers) };
  const gate = await publicSlipGate({ tenantSlug, unitSlug }, opts);
  if (!gate.ok) return back(gate.code === "RATE_LIMITED" ? "rate" : "bad");
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY) return back("bad");
  let fd: FormData;
  try {
    const body = await readCapped(req, MAX_BODY);
    if (!body) return back("bad");
    fd = await new Response(body, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
  } catch {
    return back("bad");
  }
  const f = fd.get("file");
  if (!f || typeof f === "string") return back("bad");
  const data = new Uint8Array(await f.arrayBuffer());
  const r = await publicAttachSlip(
    { tenantSlug, unitSlug, publicToken, file: { data, contentType: f.type }, idempotencyKey: String(fd.get("idempotencyKey") ?? "").slice(0, 128) },
    { ...opts, slipPass: gate.pass },
  );
  return back(r.ok ? ("alreadyPending" in r && r.alreadyPending ? "pending" : "ok") : r.code === "RATE_LIMITED" ? "rate" : "bad");
}
