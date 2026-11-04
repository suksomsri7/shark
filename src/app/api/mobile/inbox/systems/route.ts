// GET /api/mobile/inbox/systems — ระบบแชทลูกค้าของร้านที่ผู้ใช้สลับดูได้ (R-K13 · S1.21)
import { tenantDb } from "@/lib/core/db";
import { mobileDenied } from "@/lib/mobile/guard";
import { channelLabel } from "@/lib/modules/chat/channel-icon";
import { listConnections } from "@/lib/modules/chat/service";
import { gate, READ, REPLY, unreadFor } from "../_shared";

export async function GET(req: Request) {
  const a = await gate(req, [READ]);
  if (!a.ok) return a.res;
  const { c } = a;
  const rows = await tenantDb({ tenantId: c.tenantId }).appSystem.findMany({
    where: { tenantId: c.tenantId, type: "CHAT", active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  const systems = [];
  for (const s of rows) {
    const types = [...new Set((await listConnections(c.tenantId, s.id)).map((x) => x.type))];
    systems.push({ id: s.id, name: s.name, channels: types.map((type) => ({ type, label: channelLabel(type) })), unread: await unreadFor(c, s.id) });
  }
  return Response.json({ systems, canReply: mobileDenied(c.g, REPLY) === null });
}
