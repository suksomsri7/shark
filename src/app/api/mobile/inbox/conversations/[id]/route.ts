// GET /api/mobile/inbox/conversations/[id] — เธรดห้องแชทลูกค้า (ห่อ `getThread` · cursor `before` · หน่วยอื่น = 404 · S1.21)
import { tenantDb } from "@/lib/core/db";
import { getLinkedMember, getThread } from "@/lib/modules/chat/service";
import { listHelpers } from "@/lib/modules/chat/routing";
import { contactDto, conversationDto, messageDto } from "@/lib/mobile/inbox-dto";
import { convExtras, dateParam, fail, gate, notFound, READ, staffNames, systemOf, type RouteCtx } from "../../_shared";

const LIMIT_MAX = 100;

export async function GET(req: Request, ctx: RouteCtx) {
  const a = await gate(req, [READ]);
  if (!a.ok) return a.res;
  const { c } = a;
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  const sid = await systemOf(c.tenantId, q.get("systemId"));
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  const before = dateParam(q.get("before"));
  const limitRaw = Number(q.get("limit") ?? 50);
  if (before === null || !Number.isFinite(limitRaw)) return fail(422, "invalid", "ตัวกรองไม่ถูกต้อง");
  const limit = Math.max(1, Math.min(LIMIT_MAX, Math.trunc(limitRaw)));
  // ไม่ส่ง before = หน้าใหม่สุด (getThread ทางเดิมคืน "เก่าสุด N ข้อความ" ซึ่งแอปไม่ใช้) — เผื่อนาฬิกาเครื่อง 1 นาที
  const t = await getThread({ tenantId: c.tenantId, systemId: sid, conversationId: id, limit, before: before ?? new Date(Date.now() + 60_000), unitAccess: c.ua });
  if (!t) return notFound();
  const ids = t.messages.map((m) => m.id);
  const [names, x, helpers, atts, member] = await Promise.all([
    staffNames(c.tenantId),
    convExtras(c.tenantId, sid, [t.conversation.id]),
    listHelpers(c.tenantId, sid, t.conversation.id),
    ids.length ? tenantDb({ tenantId: c.tenantId, systemId: sid }).chatAttachment.findMany({ where: { tenantId: c.tenantId, systemId: sid, messageId: { in: ids } }, orderBy: { createdAt: "asc" }, select: { messageId: true, fileName: true, url: true, kind: true } }) : [],
    t.conversation.contact.customerId ? getLinkedMember(c.tenantId, t.conversation.contact.customerId) : null,
  ]);
  const attsOf = new Map<string, { fileName: string; url: string; kind: typeof atts[number]["kind"] }[]>();
  for (const at of atts) attsOf.set(at.messageId, [...(attsOf.get(at.messageId) ?? []), at]);
  return Response.json({
    conversation: conversationDto(t.conversation, { now: new Date(), names, aiDraft: x.aiDraft.has(t.conversation.id), helpers: x.helpers.get(t.conversation.id) ?? [] }),
    messages: t.messages.map((m) => messageDto(m, attsOf.get(m.id) ?? [], names)),
    contact: contactDto(t.conversation.contact),
    linkedMember: member ? { id: member.id, name: member.name ?? null, phone: member.phone ?? null } : null,
    helpers: helpers.map((h) => ({ userId: h.userId, name: h.name, calledById: h.calledById, note: h.note, createdAt: h.createdAt.toISOString() })),
    nextBefore: t.messages.length === limit && t.messages[0] ? t.messages[0].createdAt.toISOString() : null,
  });
}
