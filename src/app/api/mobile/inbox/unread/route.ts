// GET /api/mobile/inbox/unread?systemId — จำนวนห้องที่ยังไม่อ่าน (ตามหน่วยที่มองเห็น · S1.21)
import { gate, notFound, READ, systemOf, unreadFor } from "../_shared";

export async function GET(req: Request) {
  const a = await gate(req, [READ]);
  if (!a.ok) return a.res;
  const sid = await systemOf(a.c.tenantId, new URL(req.url).searchParams.get("systemId"));
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  return Response.json({ unread: await unreadFor(a.c, sid) });
}
