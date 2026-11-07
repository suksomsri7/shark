import { NextResponse, type NextRequest } from "next/server";
import { hotelWebClientKey, publicAttachSlip } from "@/lib/platform/hotel-web";

// SVC H.8 ▸ อัปโหลดสลิปมัดจำ (หน้า S4 · multipart) → ระบบสลิปกลาง (HOTEL/HOTEL_DEPOSIT · ไฟล์ส่วนตัว ≤ 5 MB · คิวพนักงาน/ตัวตรวจของร้าน)
//   rate limit ต่อ IP+หน่วย · ยอดคาดคิดฝั่งเซิร์ฟเวอร์ · ผลกลับหน้าเดิมด้วย 303 + ?slip=ok|bad|rate (ไม่มี path/URL ไฟล์ในคำตอบ)
export const dynamic = "force-dynamic";

const MAX_BODY = 6 * 1024 * 1024;

export async function POST(req: NextRequest, ctx: { params: Promise<{ tenantSlug: string; unitSlug: string; publicToken: string }> }) {
  const { tenantSlug, unitSlug, publicToken } = await ctx.params;
  const base = `/s/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(unitSlug)}/hotel`;
  const lang = req.nextUrl.searchParams.get("lang");
  const back = (state: string) => NextResponse.redirect(new URL(`${base}/pay/${encodeURIComponent(publicToken)}?slip=${state}${lang === "en" || lang === "th" ? `&lang=${lang}` : ""}`, req.url), 303);
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY) return back("bad");
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return back("bad");
  }
  const f = fd.get("file");
  if (!f || typeof f === "string") return back("bad");
  const data = new Uint8Array(await f.arrayBuffer());
  const r = await publicAttachSlip(
    { tenantSlug, unitSlug, publicToken, file: { data, contentType: f.type }, idempotencyKey: String(fd.get("idempotencyKey") ?? "").slice(0, 128) },
    { clientKey: hotelWebClientKey(req.headers) },
  );
  return back(r.ok ? "ok" : r.code === "RATE_LIMITED" ? "rate" : "bad");
}
