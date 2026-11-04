// _shared.ts — ด่านร่วมของ route `/api/mobile/inbox/**` (ใบ SEC S1.21 · R-K13 · ไม่ใช่ route)
//
// ลำดับทุกเส้น: Bearer + x-tenant-id (`requireMobile`) → คีย์สิทธิ์ (`mobileDenied` · ค่าคงที่ที่ import มา) → ระบบแชท (`resolveChatSystemId`)
//   → ห้อง (ผูก tenant+system + `canAccessConvUnit` ⇒ มองไม่เห็น = 404 ไม่ใช่ 403)
// รูปตอบล้มเหลว = `{ error: code, message: "<ไทย>" }` (docs/api/SECRETARY-API.md กติกาข้อ 6)
import type { z } from "zod";
import type { AccessQuery, MembershipCtx } from "@/lib/core/rbac";
import { tenantDb } from "@/lib/core/db";
import { requireMobile, mobileError, type MobileAuth } from "@/lib/mobile/auth";
import { mobileDenied } from "@/lib/mobile/guard";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import {
  CHAT_ASSIGN_ACTION,
  CHAT_CUSTOMER_LINK_ACTION,
  CHAT_MARK_READ_ACTION,
  CHAT_READ_ACTION,
  CHAT_REPLY_ACTION,
  CHAT_SET_STATUS_ACTION,
} from "@/lib/modules/chat/guard";
import { canAccessConvUnit, listStaff, resolveChatSystemId, unitAccessWhere, unreadCount } from "@/lib/modules/chat/service";

export const READ: AccessQuery = { module: "chat", action: CHAT_READ_ACTION };
export const REPLY: AccessQuery = { module: "chat", action: CHAT_REPLY_ACTION };
/** คีย์เว็บของเรื่องเดียวกัน (guard.ts → permissions.ts) — แอปใช้กติกาเดียวกับเว็บ (mobile/guard.ts · R-S1.21i) */
export const SET_STATUS: AccessQuery = { module: "chat", action: CHAT_SET_STATUS_ACTION };
export const MARK_READ: AccessQuery = { module: "chat", action: CHAT_MARK_READ_ACTION };
export const ASSIGN: AccessQuery = { module: "chat", action: CHAT_ASSIGN_ACTION };
export const LINK_CUSTOMER: AccessQuery = { module: "chat", action: CHAT_CUSTOMER_LINK_ACTION };

const DENY_TH: Record<string, string> = {
  [CHAT_READ_ACTION]: "บัญชีนี้ยังไม่มีสิทธิ์ดูแชทลูกค้า",
  [CHAT_REPLY_ACTION]: "บัญชีนี้ดูได้อย่างเดียว ยังตอบลูกค้าไม่ได้",
};

export const fail = (status: number, error: string, message: string) => Response.json({ error, message }, { status });
export const notFound = (message = "ไม่พบบทสนทนานี้") => fail(404, "not_found", message);

export type InboxCtx = { g: MobileAuth; tenantId: string; userId: string; m: MembershipCtx; ua: string[] };

/** ด่านหน้า: ต้องผ่านอย่างน้อยหนึ่งคีย์ใน `any` (ส่วนใหญ่มีตัวเดียว) */
export async function gate(req: Request, any: AccessQuery[]): Promise<{ ok: true; c: InboxCtx } | { ok: false; res: Response }> {
  const g = await requireMobile(req);
  if (!g.ok) return { ok: false, res: mobileError(g) };
  if (!any.some((q) => mobileDenied(g, q) === null)) {
    return { ok: false, res: fail(403, "forbidden", DENY_TH[any[0]!.action] ?? "บัญชีนี้ยังไม่มีสิทธิ์ทำรายการนี้ — ขอสิทธิ์จากเจ้าของร้าน") };
  }
  const ua = Array.isArray(g.membership.unitAccess) ? (g.membership.unitAccess as unknown[]).filter((u): u is string => typeof u === "string") : [];
  const m: MembershipCtx = {
    role: g.membership.role,
    unitAccess: ua,
    permissions: (g.membership.permissions ?? {}) as Record<string, unknown>,
  };
  return { ok: true, c: { g, tenantId: g.ctx.tenantId, userId: g.user.id, m, ua } };
}

/** ระบบแชทของร้านนี้ (ไม่ส่ง = ตัวแรก) · ไม่พบ/ของร้านอื่น ⇒ null */
export async function systemOf(tenantId: string, systemId: unknown): Promise<string | null> {
  return resolveChatSystemId(tenantId, typeof systemId === "string" ? systemId : null);
}

/** ห้องที่ผู้เรียกมองเห็น (ร้าน+ระบบ+หน่วย) — ไม่เห็น = null (ผู้เรียกตอบ 404) */
export async function visibleConv(c: InboxCtx, systemId: string, id: string) {
  const conv = await tenantDb({ tenantId: c.tenantId, systemId }).chatConversation.findFirst({
    where: { id, tenantId: c.tenantId, systemId },
    select: { id: true, unitId: true, contactId: true, assigneeUserId: true },
  });
  return conv && canAccessConvUnit(c.ua, conv.unitId) ? conv : null;
}

const BODY_MAX = 64 * 1024;

/** อ่าน body JSON ด้วย zod (.strict() ที่ schema) · เกิน 64 KB / JSON เสีย / รูปผิด ⇒ Response 4xx */
export async function readBody<T extends z.ZodType>(req: Request, schema: T): Promise<{ ok: true; v: z.infer<T> } | { ok: false; res: Response }> {
  const raw = await req.text().catch(() => "");
  if (raw.length > BODY_MAX) return { ok: false, res: fail(413, "too_large", "ข้อมูลที่ส่งมาใหญ่เกินไป") };
  let json: unknown;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    return { ok: false, res: fail(400, "bad_json", "รูปแบบข้อมูลไม่ถูกต้อง") };
  }
  const r = schema.safeParse(json);
  if (!r.success) return { ok: false, res: fail(422, "invalid", "ข้อมูลที่ส่งมาไม่ครบหรือไม่ถูกต้อง") };
  return { ok: true, v: r.data };
}

export type RouteCtx = { params: Promise<{ id: string }> };

/** จำนวนห้องที่ยังไม่อ่านที่ผู้เรียก "มองเห็น" — เห็นทุกหน่วย = `unreadCount` เดิม · จำกัดหน่วย = นับเฉพาะหน่วยของตัวเอง (ไม่รั่วตัวเลขของหน่วยอื่น) */
export async function unreadFor(c: InboxCtx, systemId: string): Promise<number> {
  if (c.ua.includes("*")) return unreadCount(c.tenantId, systemId);
  return tenantDb({ tenantId: c.tenantId, systemId }).chatConversation.count({
    where: { tenantId: c.tenantId, systemId, staffUnreadCount: { gt: 0 }, ...unitAccessWhere(c.ua) },
  });
}

/** ชื่อพนักงานของร้าน (userId → ชื่อ) — ตัวเดียวกับรายชื่อทีมของเว็บ (`listStaff`) */
export async function staffNames(tenantId: string): Promise<Map<string, string>> {
  return new Map((await listStaff(tenantId)).map((s) => [s.userId, s.name]));
}

/** ข้อมูลประกอบรายการห้อง: มีร่าง AI ค้าง (ChatAiSuggestion PENDING) · ผู้ช่วยในห้อง */
export async function convExtras(tenantId: string, systemId: string, ids: string[]): Promise<{ aiDraft: Set<string>; helpers: Map<string, string[]> }> {
  if (ids.length === 0) return { aiDraft: new Set(), helpers: new Map() };
  const db = tenantDb({ tenantId, systemId });
  const [drafts, helpers] = await Promise.all([
    db.chatAiSuggestion.findMany({ where: { tenantId, systemId, conversationId: { in: ids }, outcome: "PENDING" }, select: { conversationId: true }, distinct: ["conversationId"] }),
    tenantDb({ tenantId }).chatConversationHelper.findMany({ where: { tenantId, conversationId: { in: ids } }, orderBy: { createdAt: "asc" }, select: { conversationId: true, userId: true } }),
  ]);
  const byConv = new Map<string, string[]>();
  for (const h of helpers) byConv.set(h.conversationId, [...(byConv.get(h.conversationId) ?? []), h.userId]);
  return { aiDraft: new Set(drafts.map((d) => d.conversationId)), helpers: byConv };
}

/** ตรวจสิทธิ์จาก MembershipCtx ของผู้เรียก (ตัวเดียวกับ mobileDenied) */
export const can = (c: InboxCtx, q: AccessQuery) => mobileDenied(c.g, q) === null;

/**
 * cursor คู่ `before=<iso>|<id>` (R-S1.21h) — `|<id>` (ไม่มีเวลา) = แถวที่ lastMessageAt null · ไม่ส่ง = หน้าแรก (undefined) · รูปผิด = null
 * nextBefore ของหน้า = `cursorOf(แถวสุดท้าย)`
 */
export function parseCursor(v: string | null): { at: Date | null; id: string } | undefined | null {
  if (v === null || v === "") return undefined;
  const i = v.lastIndexOf("|");
  if (i < 0) return null;
  const iso = v.slice(0, i);
  const id = v.slice(i + 1).trim();
  if (!id || id.length > 64) return null;
  if (!iso) return { at: null, id };
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : { at, id };
}
export const cursorOf = (at: Date | null | undefined, id: string) => `${at ? at.toISOString() : ""}|${id}`;

/** เพดานต่อ (ร้าน, ผู้ใช้) ต่อเส้น — ต่อ Membership (R-S1.21d) · เกิน = 429 + Retry-After · ผ่าน = null */
export async function limited(c: InboxCtx, name: string, perMinute: number): Promise<Response | null> {
  const rl = await checkRateLimitDb(`mobile:inbox:${name}:${c.tenantId}:${c.userId}`, { limit: perMinute, windowMs: 60_000 });
  if (rl.ok) return null;
  return Response.json(
    { error: "rate_limited", message: "ทำรายการถี่เกินไป รอสักครู่แล้วลองใหม่" },
    { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 60) } },
  );
}
