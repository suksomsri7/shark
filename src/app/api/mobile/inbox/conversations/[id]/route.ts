// GET /api/mobile/inbox/conversations/[id] — เธรดห้องแชทลูกค้า (ห่อ `getThread` โหมด page · cursor คู่ `before=<iso>|<id>` · หน่วยอื่น = 404 · S1.21)
//   S1.14b: conversation + `tags` · `replyWindowEndsAt` (= คอลัมน์ `replyWindowExpiresAt` ของห้อง · FB/IG/WA · LINE/WEBCHAT = null · R-S1.14b-e) · `can{}` ของผู้เรียก
//           linkedMember = `{ id, name, phoneMasked }` (maskPhone · ไม่มีเบอร์เต็ม — ตั๋ว R-S2.17)
import { tenantDb } from "@/lib/core/db";
import { getLinkedMember, getThread } from "@/lib/modules/chat/service";
import { listHelpers } from "@/lib/modules/chat/routing";
import { maskPhone } from "@/lib/modules/member/profile";
import { contactDto, conversationDto, isoOrNull, messageDto, type InboxConversationDetailDto, type InboxLinkedMemberDto } from "@/lib/mobile/inbox-dto";
import { ASSIGN, can, convExtras, cursorOf, fail, gate, LINK_CUSTOMER, notFound, parseCursor, READ, REPLY, SET_STATUS, staffNames, systemOf, type RouteCtx } from "../../_shared";

const LIMIT_MAX = 100;

export async function GET(req: Request, ctx: RouteCtx) {
  const a = await gate(req, [READ]);
  if (!a.ok) return a.res;
  const { c } = a;
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  const sid = await systemOf(c.tenantId, q.get("systemId"));
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  const before = parseCursor(q.get("before"));
  const limitRaw = Number(q.get("limit") ?? 50);
  if (before === null || (before && !before.at) || !Number.isFinite(limitRaw)) return fail(422, "invalid", "ตัวกรองไม่ถูกต้อง");
  const limit = Math.max(1, Math.min(LIMIT_MAX, Math.trunc(limitRaw)));
  // โหมด page: ไม่ส่ง before = หน้าใหม่สุด (getThread ทางเดิมคืน "เก่าสุด N ข้อความ" ซึ่งแอปไม่ใช้)
  const t = await getThread({ tenantId: c.tenantId, systemId: sid, conversationId: id, limit, page: { before: before?.at ? { at: before.at, id: before.id } : undefined }, unitAccess: c.ua });
  if (!t) return notFound();
  const ids = t.messages.map((m) => m.id);
  const [names, x, helpers, atts, member] = await Promise.all([
    staffNames(c.tenantId),
    convExtras(c.tenantId, sid, [t.conversation.id]),
    listHelpers(c.tenantId, sid, t.conversation.id),
    ids.length ? tenantDb({ tenantId: c.tenantId, systemId: sid }).chatAttachment.findMany({ where: { tenantId: c.tenantId, systemId: sid, messageId: { in: ids } }, orderBy: { createdAt: "asc" }, select: { messageId: true, fileName: true, url: true, kind: true, mimeType: true, durationMs: true } }) : [],
    t.conversation.contact.customerId ? getLinkedMember(c.tenantId, t.conversation.contact.customerId) : null,
  ]);
  const conversation: InboxConversationDetailDto = {
    ...conversationDto(t.conversation, { now: new Date(), names, aiDraft: x.aiDraft.has(t.conversation.id), helpers: x.helpers.get(t.conversation.id) ?? [] }),
    replyWindowEndsAt: isoOrNull(t.conversation.replyWindowExpiresAt),
    can: { reply: can(c, REPLY), assign: can(c, ASSIGN), setStatus: can(c, SET_STATUS), linkCustomer: can(c, LINK_CUSTOMER) },
  };
  const linkedMember: InboxLinkedMemberDto | null = member
    ? { id: member.id, name: member.name ?? null, phoneMasked: member.phone ? maskPhone(member.phone) : null }
    : null;
  const attsOf = new Map<string, (typeof atts)[number][]>();
  for (const at of atts) attsOf.set(at.messageId, [...(attsOf.get(at.messageId) ?? []), at]);
  return Response.json({
    conversation,
    messages: t.messages.map((m) => messageDto(m, attsOf.get(m.id) ?? [], names)),
    contact: contactDto(t.conversation.contact),
    linkedMember,
    helpers: helpers.map((h) => ({ userId: h.userId, name: h.name, calledById: h.calledById, note: h.note, createdAt: h.createdAt.toISOString() })),
    nextBefore: t.messages.length === limit && t.messages[0] ? cursorOf(t.messages[0].createdAt, t.messages[0].id) : null,
  });
}
