// GET /api/mobile/inbox/systems — ระบบแชทลูกค้าของร้านที่ผู้ใช้สลับดูได้ (R-K13 · S1.21)
import { tenantDb } from "@/lib/core/db";
import { mobileDenied } from "@/lib/mobile/guard";
import { channelLabel } from "@/lib/modules/chat/channel-icon";
import { listConnections } from "@/lib/modules/chat/service";
import { can, gate, READ, REPLY, SET_STATUS, unreadFor, withErrors } from "../_shared";

async function GET_(req: Request) {
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
  const canReply = mobileDenied(c.g, REPLY) === null;
  // canHide = ปัดซ้ายลบแชทได้ (ด่านเดียวกับ DELETE inbox/conversations/[id]: ปิดห้อง + ตอบลูกค้า · 14 พ.ย. 2026)
  return Response.json({ items: systems, canReply, canHide: canReply && can(c, SET_STATUS) }); // COMMON ข้อ 6 · R-S1.21i
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("inbox/systems GET", GET_);
