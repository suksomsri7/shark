// GET /api/mobile/inbox/conversations/[id] — เธรดห้องแชทลูกค้า (ห่อ `getThread` โหมด page · cursor คู่ `before=<iso>|<id>` · หน่วยอื่น = 404 · S1.21)
//   S1.14b: conversation + `tags` · `replyWindowEndsAt` (= คอลัมน์ `replyWindowExpiresAt` ของห้อง · FB/IG/WA · LINE/WEBCHAT = null · R-S1.14b-e) · `can{}` ของผู้เรียก
//           linkedMember = `{ id, name, phoneMasked }` (maskPhone · ไม่มีเบอร์เต็ม — ตั๋ว R-S2.17)
//   S3a.6: messages + `translatedBody/translatedLang/needsTranslation` · conversation + `staffLang/contactLang/can.translate`
//   S1.14c (LOW-3): `can.aiSuggest` = คีย์ `chat.ai.suggest` (ด่านเดียวกับ POST …/ai-suggest · R-S1.14b-a)
import type { AccessQuery } from "@/lib/core/rbac";
import { tenantDb } from "@/lib/core/db";
import { getLinkedMember, getThread } from "@/lib/modules/chat/service";
import { listHelpers } from "@/lib/modules/chat/routing";
import { normalizeLang } from "@/lib/modules/chat/translate";
import { maskPhone } from "@/lib/modules/member/profile";
import { contactDto, conversationDto, isoOrNull, messageDto, type InboxConversationDetailDto, type InboxLinkedMemberDto } from "@/lib/mobile/inbox-dto";
import { ASSIGN, can, convExtras, cursorOf, fail, gate, LINK_CUSTOMER, notFound, parseCursor, READ, REPLY, SET_STATUS, staffNames, systemOf, type RouteCtx, withErrors } from "../../_shared";

const LIMIT_MAX = 100;
/** คีย์เดียวกับด่านของ POST …/ai-suggest (`assertChatCan(auth, "chat.ai.suggest")` ของเว็บ) */
const AI_SUGGEST: AccessQuery = { module: "chat", action: "chat.ai.suggest" };
/** S3a.6: คีย์เดียวกับปุ่มแปลบนเว็บ (`assertChatCan(auth, "chat.translate.use")`) */
const TRANSLATE: AccessQuery = { module: "chat", action: "chat.translate.use" };

async function GET_(req: Request, ctx: RouteCtx) {
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
  // S3a.6 ▸ ภาษาทีม/ลูกค้า + สวิตช์แปลของร้าน ◂
  const setting = await tenantDb({ tenantId: c.tenantId, systemId: sid }).chatSetting.findFirst({ where: { tenantId: c.tenantId, systemId: sid }, select: { staffLang: true, translateEnabled: true } });
  const staffLang = normalizeLang(setting?.staffLang) ?? "th";
  const conversation: InboxConversationDetailDto = {
    ...conversationDto(t.conversation, { now: new Date(), names, aiDraft: x.aiDraft.has(t.conversation.id), helpers: x.helpers.get(t.conversation.id) ?? [] }),
    replyWindowEndsAt: isoOrNull(t.conversation.replyWindowExpiresAt),
    can: { reply: can(c, REPLY), assign: can(c, ASSIGN), setStatus: can(c, SET_STATUS), linkCustomer: can(c, LINK_CUSTOMER), aiSuggest: can(c, AI_SUGGEST), translate: !!setting?.translateEnabled && can(c, TRANSLATE) },
    staffLang,
    contactLang: normalizeLang(t.conversation.contact.lang),
  };
  const linkedMember: InboxLinkedMemberDto | null = member
    ? { id: member.id, name: member.name ?? null, phoneMasked: member.phone ? maskPhone(member.phone) : null }
    : null;
  const attsOf = new Map<string, (typeof atts)[number][]>();
  for (const at of atts) attsOf.set(at.messageId, [...(attsOf.get(at.messageId) ?? []), at]);
  return Response.json({
    conversation,
    messages: t.messages.map((m) => messageDto(m, attsOf.get(m.id) ?? [], names, staffLang)),
    contact: contactDto(t.conversation.contact),
    linkedMember,
    helpers: helpers.map((h) => ({ userId: h.userId, name: h.name, calledById: h.calledById, note: h.note, createdAt: h.createdAt.toISOString() })),
    nextBefore: t.messages.length === limit && t.messages[0] ? cursorOf(t.messages[0].createdAt, t.messages[0].id) : null,
  });
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("inbox/conversations/[id] GET", GET_);
