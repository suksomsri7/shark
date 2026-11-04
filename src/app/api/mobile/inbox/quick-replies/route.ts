// GET /api/mobile/inbox/quick-replies?systemId — คลังคำตอบสำเร็จรูปที่ใช้ได้ (ห่อ `listQuickReplies` · ใช้ได้ = มีสิทธิ์ตอบลูกค้า · S1.21)
import { listQuickReplies } from "@/lib/modules/chat/quick-reply";
import { gate, notFound, REPLY, systemOf } from "../_shared";

export async function GET(req: Request) {
  const a = await gate(req, [REPLY]);
  if (!a.ok) return a.res;
  const sid = await systemOf(a.c.tenantId, new URL(req.url).searchParams.get("systemId"));
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  const rows = await listQuickReplies({ tenantId: a.c.tenantId, systemId: sid });
  return Response.json({ items: rows.map((r) => ({ id: r.id, shortcut: r.shortcut, title: r.title, body: r.body, channelTypes: r.channelTypes })) });
}
