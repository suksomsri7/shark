// POST /api/mobile/auth/logout {expoToken?} + Bearer → revoke session + ลบ push device ของเครื่องนี้
// อ่าน raw token จาก header เอง (revokeMobileToken ต้องการ raw เพื่อ hash หา session)
import { revokeMobileToken } from "@/lib/mobile/auth";

export async function POST(req: Request): Promise<Response> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  let body: { expoToken?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* body ว่างได้ — logout ไม่บังคับส่ง expoToken */
  }
  const expoToken = typeof body?.expoToken === "string" ? body.expoToken : undefined;
  if (token) await revokeMobileToken(token, expoToken);
  return Response.json({ ok: true }, { status: 200 });
}
