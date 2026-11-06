// GET /api/mobile/inbox/conversations — รายการห้องแชทลูกค้า (ห่อ `listConversations` โหมด page · cursor คู่ `before=<iso>|<id>` · R-K13 · R-S1.21h)
import { ChatChannelType } from "@prisma/client";
import { listConversations } from "@/lib/modules/chat/service";
import { conversationDto } from "@/lib/mobile/inbox-dto";
import { convExtras, cursorOf, fail, gate, notFound, parseCursor, READ, staffNames, systemOf, withErrors } from "../_shared";

const STATUSES = new Set(["OPEN", "PENDING", "RESOLVED"]);
const CHANNELS = new Set<string>(Object.values(ChatChannelType));
const LIMIT_MAX = 50;

async function GET_(req: Request) {
  const a = await gate(req, [READ]);
  if (!a.ok) return a.res;
  const { c } = a;
  const q = new URL(req.url).searchParams;
  const sid = await systemOf(c.tenantId, q.get("systemId"));
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  const status = q.get("status") || undefined;
  const channel = q.get("channel") || undefined;
  const before = parseCursor(q.get("before"));
  const limitRaw = Number(q.get("limit") ?? 30);
  if ((status && !STATUSES.has(status)) || (channel && !CHANNELS.has(channel)) || before === null || !Number.isFinite(limitRaw)) {
    return fail(422, "invalid", "ตัวกรองไม่ถูกต้อง");
  }
  const limit = Math.max(1, Math.min(LIMIT_MAX, Math.trunc(limitRaw)));
  const rows = await listConversations({
    tenantId: c.tenantId,
    systemId: sid,
    status: status as "OPEN" | "PENDING" | "RESOLVED" | undefined,
    channel: channel as ChatChannelType | undefined,
    assignee: q.get("assignee") || undefined,
    callerUserId: c.userId,
    q: q.get("q") ?? undefined,
    limit,
    page: { before: before ?? undefined },
    unitAccess: c.ua,
  });
  const now = new Date();
  const [names, x] = await Promise.all([staffNames(c.tenantId), convExtras(c.tenantId, sid, rows.map((r) => r.id))]);
  const items = rows.map((r) => conversationDto(r, { now, names, aiDraft: x.aiDraft.has(r.id), helpers: x.helpers.get(r.id) ?? [] }));
  const last = rows[rows.length - 1];
  return Response.json({ items, nextBefore: rows.length === limit && last ? cursorOf(last.lastMessageAt, last.id) : null });
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("inbox/conversations GET", GET_);
