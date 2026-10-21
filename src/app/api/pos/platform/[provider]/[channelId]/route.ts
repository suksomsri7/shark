// POST /api/pos/platform/[provider]/[channelId] — คำขอขาเข้าของแพลตฟอร์มภายนอก (P3-SKEL R2 · มติ §10-9) — นอก /api/v1/pos (ทะเบียน REST ไม่เปลี่ยน)
//
// ลำดับ: เนื้อ > 256 KB = 413 · ช่องทางไม่ตรง/ไม่มี/เก็บแล้ว/ไม่ใช่ adapter API/provider มั่ว = 404 {error:"not_found"} ·
//   ยังไม่มี webhookSecret = 503 {code:"NOT_CONFIGURED"} · ลายเซ็น x-shark-signature ผิด/ไม่มี = 401 (log ขนาด + sha256 เท่านั้น) ·
//   ถูก = 503 {code:"ADAPTER_PENDING"} (โครง — ไม่เขียนอะไร) · GET = 405
// 🔴 ห้าม log/สะท้อนเนื้อคำขอ (คนนอกยังไม่ผ่านลายเซ็น) · ร้านมาจากช่องทาง ไม่ใช่จากคำขอ
import { handlePlatformInbound, PLATFORM_INBOUND_MAX_BYTES } from "@/lib/modules/pos/platform/dispatch";

export const dynamic = "force-dynamic";

const tooLarge = () => Response.json({ error: "payload_too_large" }, { status: 413 });

/** อ่านเนื้อแบบมีเพดาน — เกิน = null (ไม่อ่านต่อ) */
async function readCapped(req: Request, max: number): Promise<Uint8Array | null> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export async function POST(req: Request, ctx: { params: Promise<{ provider: string; channelId: string }> }): Promise<Response> {
  let raw: Uint8Array | null;
  try {
    raw = await readCapped(req, PLATFORM_INBOUND_MAX_BYTES);
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (!raw) return tooLarge();
  const p = await ctx.params;
  const r = await handlePlatformInbound({ provider: String(p?.provider ?? ""), channelId: String(p?.channelId ?? ""), raw, headers: req.headers });
  return Response.json(r.body, { status: r.status });
}

export async function GET(): Promise<Response> {
  return Response.json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "POST" } });
}
