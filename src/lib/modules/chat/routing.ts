// routing.ts — ผู้ดูแลห้องแชทลูกค้า: ใครตอบได้ · กฎรับเรื่อง · เรียกช่วย · ส่งต่อ · เวร · SLA (ใบ SEC S1.24 · R-K14 · R-K8b)
//
// ห่อของเดิมใน `service.ts` เท่านั้น (ห้ามเขียนตรรกะแชทชุดที่สอง):
//   มอบหมาย = `assign()` (เขียน ChatConversationEvent ASSIGNED เดิม) · บันทึกภายใน = `sendReply({ isInternal: true })`
//   หน่วย = `canAccessConvUnit` · เวลาทำการ = `readBusinessHours` · แจ้งเตือน = `notifyUser(…, "inbox", …)` (S1.23)
// "ตอบได้" = Membership ที่รับคำเชิญแล้ว ∩ `evaluate(m, {chat, CHAT_REPLY_ACTION})` ∩ `canAccessConvUnit(m.unitAccess, unitId)`
//   (OWNER/MANAGER ผ่าน evaluate เสมอ · STAFF ต้องมีคีย์ · R-K14 ไม่มีคีย์ใหม่)
// ผู้ช่วย/ส่งต่อ = แถว `ChatConversationHelper` + ข้อความ `isInternal` — ไม่แตะ enum `ChatEventType` (R-K14)
// กันซ้ำของ SLA = `clientMessageId` ของบันทึกภายใน (unique [conversationId, clientMessageId]) — INSERT ชนะครั้งเดียวต่อห้องต่อรอบรอ
//
// 🔴 ฟังก์ชันที่ผู้ใช้เรียก (callHelper/handoff) คืน `{ ok:false, reason }` ไทย ไม่ throw · setRules throw (ForbiddenError / ไทย)
// 🔴 แจ้งเตือนเรียกนอกทรานแซกชันเสมอ (network call) · `now` ฉีดได้ทุกตัวที่ขึ้นกับเวลา

import { ChatChannelType } from "@prisma/client";
// `after()` = ตอบคำขอไปก่อน แล้วค่อยทำงานที่เหลือ (นอกคำขอโยน ⇒ ทำทันที) — แบบเดียวกับ S1.22 after-hours
import { after } from "next/server";
import type { ChatRoutingRule, Role } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { evaluate, ForbiddenError, type MembershipCtx } from "@/lib/core/rbac";
import { logOps } from "@/lib/core/ops";
import { notifyUser, type NotifyDeps } from "@/lib/ai/secretary/notify";
import { prisma } from "./db";
import { assign, canAccessConvUnit, sendReply } from "./service";
import { minutesOfTime, readBusinessHours, type StoredBusinessHours } from "./business-hours";
import { CHAT_REPLY_ACTION } from "./guard-keys";

export const ROUTING_MODES = ["ROUND_ROBIN", "LAST_ASSIGNEE", "OWNER"] as const;
export type RoutingMode = (typeof ROUTING_MODES)[number];


/** ผู้กระทำของการมอบหมายอัตโนมัติ (ChatConversationEvent.actorUserId) */
export const ROUTING_ACTOR = "system:routing";
/** ผู้เขียนบันทึกภายในของ SLA */
export const SLA_ACTOR = "system:sla";
/** SLA ดูเฉพาะห้องที่ลูกค้าเริ่มรอภายในช่วงนี้ — กันวันแรกที่เปิดใช้ปลุกเตือนห้องค้างเก่าทั้งร้าน */
export const SLA_LOOKBACK_MS = 24 * 60 * 60_000;
/** ช่วงย้อนหลังของ "มอบหมายห้องค้างตอนเปิดร้าน" (sweep ขั้น 0 · N.2-N3) — ข้ามคืน/ข้ามวันหยุดยาวได้ */
export const ASSIGN_BACKLOG_MS = 72 * 60 * 60_000;
const SLA_ROOMS_PER_SYSTEM = 200;
const RULES_MAX = 20;
const NOTE_MAX = 500;
const REASON_MAX = 500;

const MODE_TH: Record<RoutingMode, string> = { ROUND_ROBIN: "วนตามคิว", LAST_ASSIGNEE: "คนเดิมที่เคยดูแล", OWNER: "เจ้าของร้าน" };
const CHANNELS = new Set<string>(Object.values(ChatChannelType));

type PushPost = NotifyDeps["post"];
export type Responder = { userId: string; name: string; role: Role; onDuty: boolean };
type SlaMsg = { title: string; body: string; data: Record<string, unknown> };
type SlaNotify = (userId: string, msg: SlaMsg) => Promise<unknown>;

// ───────────────────────── ใครตอบได้ ─────────────────────────

function ctxOf(m: { role: Role; unitAccess: unknown; permissions: unknown }): MembershipCtx {
  return {
    role: m.role,
    unitAccess: Array.isArray(m.unitAccess) ? m.unitAccess.filter((u): u is string => typeof u === "string") : [],
    permissions: m.permissions && typeof m.permissions === "object" && !Array.isArray(m.permissions) ? (m.permissions as Record<string, unknown>) : {},
  };
}

function canReply(m: MembershipCtx, unitId: string | null): boolean {
  return evaluate(m, { module: "chat", action: CHAT_REPLY_ACTION }) && canAccessConvUnit(m.unitAccess, unitId);
}

const nameOf = (u: { name: string | null; email: string } | null | undefined): string =>
  u?.name?.trim() || (u?.email ?? "").split("@")[0] || "ทีมงาน";

/** คนที่อยู่ในเวรตอนนี้ (แถว ChatShift ที่ยังไม่ปิด) */
export async function onDutyUsers(tenantId: string): Promise<string[]> {
  const rows = await tenantDb({ tenantId }).chatShift.findMany({
    where: { tenantId, offDutyAt: null },
    select: { userId: true },
    distinct: ["userId"],
  });
  return rows.map((r) => r.userId);
}

type TeamMember = { userId: string; name: string; role: Role; ctx: MembershipCtx };
/** ทีมของร้าน (Membership ที่รับแล้ว + เวร) — โหลดครั้งเดียวแล้วตัดต่อหน่วยด้วย `respondersOf` (R-S1.21g) */
export type Team = { members: TeamMember[]; onDuty: Set<string> };

export async function loadTeam(tenantId: string): Promise<Team> {
  const [rows, duty] = await Promise.all([
    prisma.membership.findMany({
      where: { tenantId, acceptedAt: { not: null } },
      select: { userId: true, role: true, unitAccess: true, permissions: true, user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    onDutyUsers(tenantId),
  ]);
  const seen = new Set<string>();
  const members: TeamMember[] = [];
  for (const m of rows) {
    if (seen.has(m.userId)) continue;
    seen.add(m.userId);
    members.push({ userId: m.userId, name: nameOf(m.user), role: m.role, ctx: ctxOf(m) });
  }
  return { members, onDuty: new Set(duty) };
}

/** ผู้ตอบได้ในหน่วยนี้จากทีมที่โหลดแล้ว (pure) */
export function respondersOf(team: Team, unitId: string | null): Responder[] {
  return team.members
    .filter((m) => canReply(m.ctx, unitId))
    .map((m) => ({ userId: m.userId, name: m.name, role: m.role, onDuty: team.onDuty.has(m.userId) }));
}

/** ผู้ตอบลูกค้าได้ในหน่วยนี้ (unitId null = ห้องระดับระบบ) เรียงตามวันที่เข้าร้าน · systemId ไว้ให้สัญญาเดียวกับผู้เรียก (สิทธิ์แชทเป็นระดับร้าน) */
export async function eligibleResponders(tenantId: string, systemId: string, unitId: string | null): Promise<Responder[]> {
  void systemId;
  return respondersOf(await loadTeam(tenantId), unitId);
}

/** คนนี้ตอบลูกค้าได้ในหน่วยนี้ไหม — ใช้กับ `assign(…, { requireReplyPermission: true })` */
export async function canRespond(tenantId: string, userId: string, unitId: string | null): Promise<boolean> {
  const m = await prisma.membership.findFirst({
    where: { tenantId, userId, acceptedAt: { not: null } },
    select: { role: true, unitAccess: true, permissions: true },
  });
  return !!m && canReply(ctxOf(m), unitId);
}

// ───────────────────────── กฎรับเรื่อง ─────────────────────────

export async function listRules(tenantId: string, systemId: string): Promise<ChatRoutingRule[]> {
  return tenantDb({ tenantId }).chatRoutingRule.findMany({
    where: { tenantId, systemId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
}

/** แทนที่กฎทั้งชุดของระบบนี้ — OWNER/MANAGER เท่านั้น (อื่น = ForbiddenError) · mode/channel ผิด = throw ไทย */
export async function setRules(
  tenantId: string,
  by: { userId: string },
  systemId: string,
  rules: { channel?: string | null; mode: string; enabled: boolean; order?: number }[],
): Promise<ChatRoutingRule[]> {
  const m = await prisma.membership.findFirst({
    where: { tenantId, userId: by.userId, acceptedAt: { not: null } },
    select: { role: true },
  });
  if (!m || (m.role !== "OWNER" && m.role !== "MANAGER")) throw new ForbiddenError({ module: "chat", action: "chat.routing.setRules" });
  const sys = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "CHAT" }, select: { id: true } });
  if (!sys) throw new Error("ไม่พบระบบแชทนี้");
  const list = Array.isArray(rules) ? rules : [];
  if (list.length > RULES_MAX) throw new Error(`ตั้งกฎรับเรื่องได้ไม่เกิน ${RULES_MAX} ข้อต่อระบบ`);
  const data = list.map((r, i) => {
    const mode = typeof r?.mode === "string" ? r.mode.trim().toUpperCase() : "";
    if (!(ROUTING_MODES as readonly string[]).includes(mode)) {
      throw new Error(`ไม่รู้จักวิธีรับเรื่อง "${String(r?.mode ?? "")}" — เลือกได้: ${ROUTING_MODES.map((x) => MODE_TH[x]).join(" · ")}`);
    }
    const channel = typeof r.channel === "string" && r.channel.trim() ? r.channel.trim().toUpperCase() : null;
    if (channel && !CHANNELS.has(channel)) throw new Error(`ไม่รู้จักช่องทาง "${channel}"`);
    const order = Number.isInteger(r.order) ? Number(r.order) : i;
    return { tenantId, systemId, channel, mode, enabled: r.enabled === true, order };
  });
  await prisma.$transaction([
    prisma.chatRoutingRule.deleteMany({ where: { tenantId, systemId } }),
    ...(data.length > 0 ? [prisma.chatRoutingRule.createMany({ data })] : []),
  ]);
  return listRules(tenantId, systemId);
}

// ───────────────────────── เวลาทำการ ─────────────────────────

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** `now` อยู่ในเวลาทำการของร้านไหม (อ่านในเขตเวลาของร้าน `bh.tz` · วันหยุด = ปิด) — pure */
export function isWithinBusinessHours(bh: StoredBusinessHours, now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: bh.tz,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  if (bh.holidays.includes(`${get("year")}-${get("month")}-${get("day")}`)) return false;
  const d = WEEKDAY[get("weekday")];
  const mins = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  return bh.days.some((x) => {
    const open = minutesOfTime(x.open);
    const close = minutesOfTime(x.close);
    return x.d === d && open !== null && close !== null && open <= mins && mins < close;
  });
}

// ───────────────────────── มอบหมายห้องเข้าใหม่ ─────────────────────────

/** คนที่มีห้อง OPEN ที่ดูแลอยู่น้อยสุด (เสมอ ⇒ userId เรียงน้อยไปมาก) */
async function leastLoaded(tenantId: string, systemId: string, userIds: string[]): Promise<string | null> {
  if (userIds.length === 0) return null;
  const rows = await tenantDb({ tenantId, systemId }).chatConversation.groupBy({
    by: ["assigneeUserId"],
    where: { tenantId, systemId, status: "OPEN", assigneeUserId: { in: userIds } },
    _count: { _all: true },
  });
  const load = new Map(rows.map((r) => [r.assigneeUserId ?? "", r._count._all]));
  return [...userIds].sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0) || (a < b ? -1 : a > b ? 1 : 0))[0] ?? null;
}

/** OWNER คนแรกของร้านที่ "เห็นหน่วย" ของห้อง (R-S1.21g) — OWNER ผ่าน evaluate เสมอ จึงเหลือแค่ด่านหน่วย */
function firstOwner(team: Team, unitId: string | null): string | null {
  return team.members.find((m) => m.role === "OWNER" && canAccessConvUnit(m.ctx.unitAccess, unitId))?.userId ?? null;
}

/**
 * ห้องเข้าใหม่/ยังไม่มีผู้ดูแล → เลือกผู้ดูแลตามกฎของระบบ (กฎแรกที่ตรงช่องทางและหาคนได้ชนะ)
 *   already = มีผู้ดูแลแล้ว · no_rule = ไม่มีกฎที่เปิดและตรงช่องทาง (channel null = ทุกช่อง) · off_hours = นอกเวลาทำการ (ไม่มอบหมาย)
 *   ผู้ตอบ = eligibleResponders (มีคนเข้าเวร ⇒ เฉพาะคนในเวร) · ไม่มีใครเลย ⇒ OWNER ของร้าน (owner_fallback) · ไม่มี OWNER ⇒ no_responder
 *   ⚠️ ไม่ล็อกแถว: คนกดรับพร้อมกันกับกฎ = คนที่เขียนทีหลังชนะ (assign เดิมเขียนตรง ๆ) — ยอมรับ (ทั้งสองทางมี event ASSIGNED)
 */
export async function assignIncoming(args: {
  tenantId: string;
  systemId: string;
  conversationId: string;
  now?: Date;
  /** ตัวแจ้งเตือน "ได้รับห้อง" (ปริยาย notifyUser kind inbox · ค่าตั้ง ASSIGNED ผ่านเพราะเป็นผู้ดูแลแล้ว) · team = ทีมที่ผู้เรียกโหลดไว้แล้ว (sweep) */
  deps?: { notify?: SlaNotify; post?: PushPost; team?: Team };
}): Promise<{ assigned: string | null; reason: "rule" | "owner_fallback" | "no_rule" | "off_hours" | "already" | "no_responder" }> {
  const { tenantId, systemId, conversationId } = args;
  const now = args.now ?? new Date();
  const db = tenantDb({ tenantId, systemId });
  const conv = await db.chatConversation.findFirst({
    where: { id: conversationId, tenantId, systemId },
    select: { id: true, channel: true, unitId: true, contactId: true, assigneeUserId: true },
  });
  if (!conv) return { assigned: null, reason: "no_rule" };
  if (conv.assigneeUserId) return { assigned: null, reason: "already" };

  const rules = (await listRules(tenantId, systemId)).filter(
    (r) => r.enabled && (r.channel === null || r.channel === conv.channel) && (ROUTING_MODES as readonly string[]).includes(r.mode),
  );
  if (rules.length === 0) return { assigned: null, reason: "no_rule" };

  const setting = await db.chatSetting.findFirst({ where: { systemId }, select: { businessHours: true } });
  const bh = readBusinessHours(setting?.businessHours ?? null);
  if (bh && !isWithinBusinessHours(bh, now)) return { assigned: null, reason: "off_hours" };

  const team = args.deps?.team ?? (await loadTeam(tenantId));
  const all = respondersOf(team, conv.unitId);
  const inShift = all.filter((x) => x.onDuty);
  const pool = (inShift.length > 0 ? inShift : all).map((x) => x.userId);

  let chosen: string | null = null;
  for (const r of rules) {
    const mode = r.mode as RoutingMode;
    if (mode === "OWNER") chosen = all.find((x) => x.role === "OWNER")?.userId ?? null;
    else if (mode === "LAST_ASSIGNEE") {
      const last = await db.chatConversation.findFirst({
        where: { tenantId, systemId, contactId: conv.contactId, id: { not: conv.id }, assigneeUserId: { not: null } },
        orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        select: { assigneeUserId: true },
      });
      chosen = last?.assigneeUserId && all.some((x) => x.userId === last.assigneeUserId) ? last.assigneeUserId : await leastLoaded(tenantId, systemId, pool);
    } else chosen = await leastLoaded(tenantId, systemId, pool);
    if (chosen) break;
  }

  let reason: "rule" | "owner_fallback" = "rule";
  if (!chosen) {
    chosen = firstOwner(team, conv.unitId);
    reason = "owner_fallback";
    if (!chosen) return { assigned: null, reason: "no_responder" };
  }
  // ห้องว่างเท่านั้น (updateMany มีเงื่อนไข) — มีคนกดรับตัดหน้า = ของเขาชนะ ไม่ทับ (R-S1.21c · L-7)
  const res = await assign(
    { tenantId, systemId, conversationId: conv.id, assigneeUserId: chosen, actorUserId: ROUTING_ACTOR },
    { onlyIfAssignee: null },
  );
  if (!res.ok) return { assigned: null, reason: "already" };
  const note = { title: "มีแชทลูกค้าใหม่มอบหมายให้คุณ", body: "เปิดเพื่อตอบลูกค้า", data: { link: `/customers/${conv.id}?e=assigned`, conversationId: conv.id, systemId, tenantId } };
  const to = chosen;
  const push = async () => {
    try {
      if (args.deps?.notify) await args.deps.notify(to, note);
      else await notifyUser(to, tenantId, "inbox", note, { assigneeUserId: to, ...(args.deps?.post ? { post: args.deps.post } : {}) });
    } catch {
      // แจ้งเตือนล้ม = ห้องยังถูกมอบหมายแล้ว (ผู้รับเห็นในกล่อง)
    }
  };
  // 🔴 ห้ามถ่วงทาง webhook ขาเข้า (N.2-N5): ในคำขอ = `after()` · นอกคำขอ (sweep/สคริปต์/ข้อสอบ) `after()` โยน ⇒ รอจนจบ
  try {
    after(() => push());
  } catch {
    await push();
  }
  return { assigned: chosen, reason };
}

// ───────────────────────── เรียกช่วย · ส่งต่อ ─────────────────────────

async function convFor(tenantId: string, systemId: string, conversationId: string) {
  return tenantDb({ tenantId, systemId }).chatConversation.findFirst({
    where: { id: conversationId, tenantId, systemId },
    select: { id: true, unitId: true, assigneeUserId: true },
  });
}

async function userName(userId: string): Promise<string> {
  return nameOf(await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }));
}

async function pushInbox(
  tenantId: string,
  systemId: string,
  userId: string,
  conversationId: string,
  via: string,
  title: string,
  body: string,
  post?: PushPost,
): Promise<void> {
  // `?e=` แยกเรื่อง — ตัวกันสแปมของ notifyUser ผูก link (เรียกช่วยแล้วส่งต่อคนเดิมภายใน 60 วิ ต้องถึงทั้งสองครั้ง)
  // assigneeUserId = ผู้รับเอง ⇒ ค่าตั้ง ASSIGNED ไม่กรอง (ถูกเรียกชื่อแล้ว) · OFF ยังเคารพ
  await notifyUser(
    userId,
    tenantId,
    "inbox",
    { title, body, data: { link: `/customers/${conversationId}?e=${via}`, conversationId, systemId, tenantId } },
    { assigneeUserId: userId, ...(post ? { post } : {}) },
  );
}

/** เรียกเพื่อนมาช่วยในห้อง — ผู้เรียกต้องเห็นห้อง (หน่วย) · ผู้ถูกเรียกต้องตอบได้ในหน่วยนั้น · แจ้งเตือนผู้ถูกเรียก */
export async function callHelper(args: {
  tenantId: string;
  systemId: string;
  conversationId: string;
  byUserId: string;
  helperUserId: string;
  note?: string;
  unitAccess?: string[];
  deps?: { post?: PushPost };
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { tenantId, systemId } = args;
  const conv = await convFor(tenantId, systemId, args.conversationId);
  if (!conv) return { ok: false, reason: "ไม่พบบทสนทนา" };
  if (!canAccessConvUnit(args.unitAccess, conv.unitId)) return { ok: false, reason: "ไม่มีสิทธิ์เข้าถึงบทสนทนานี้" };
  if (args.helperUserId === args.byUserId) return { ok: false, reason: "เลือกเพื่อนร่วมทีมคนอื่นมาช่วยได้เลย" };
  const helper = (await eligibleResponders(tenantId, systemId, conv.unitId)).find((x) => x.userId === args.helperUserId);
  if (!helper) return { ok: false, reason: "คนนี้ยังไม่มีสิทธิ์ตอบลูกค้าในหน่วยนี้" };
  const note = (args.note ?? "").trim().slice(0, NOTE_MAX) || null;

  // upsert ของ tenantDb ห่อ where เป็น AND (unique ใช้ไม่ได้) ⇒ prisma ตรง + tenantId ใน where unique (ห้องผ่านการตรวจร้านแล้วข้างบน)
  await prisma.chatConversationHelper.upsert({
    where: { conversationId_userId: { conversationId: conv.id, userId: helper.userId }, tenantId },
    create: { tenantId, conversationId: conv.id, userId: helper.userId, calledById: args.byUserId, note },
    update: { calledById: args.byUserId, note },
  });
  const byName = await userName(args.byUserId);
  await sendReply({
    tenantId,
    systemId,
    conversationId: conv.id,
    senderUserId: args.byUserId,
    body: `[เรียกคนช่วย] ${byName} เรียก ${helper.name} มาช่วย${note ? `: ${note}` : ""}`,
    isInternal: true,
  });
  await pushInbox(tenantId, systemId, helper.userId, conv.id, "helper", "มีคนเรียกให้ช่วยตอบแชท", `${byName} เรียกคุณมาช่วยตอบลูกค้า`, args.deps?.post);
  return { ok: true };
}

/** ส่งต่อห้องให้คนอื่นดูแล (มีเหตุผล) — ผู้รับต้องตอบได้ในหน่วย · ลบแถวผู้ช่วยของผู้รับ · บันทึกภายใน · แจ้งเตือนผู้รับ */
export async function handoff(args: {
  tenantId: string;
  systemId: string;
  conversationId: string;
  byUserId: string;
  toUserId: string;
  reason: string;
  unitAccess?: string[];
  /** ผู้กดมีคีย์มอบหมาย (`chat.conversation.assign`) — ไม่มี = ต้องเป็นผู้ดูแลปัจจุบันหรือผู้ช่วยของห้อง (R-S1.21b) */
  byCanAssign?: boolean;
  deps?: { post?: PushPost };
}): Promise<{ ok: true } | { ok: false; reason: string; forbidden?: true; conflict?: true }> {
  const { tenantId, systemId } = args;
  const conv = await convFor(tenantId, systemId, args.conversationId);
  if (!conv) return { ok: false, reason: "ไม่พบบทสนทนา" };
  if (!canAccessConvUnit(args.unitAccess, conv.unitId)) return { ok: false, reason: "ไม่มีสิทธิ์เข้าถึงบทสนทนานี้" };
  if (!args.byCanAssign && conv.assigneeUserId !== args.byUserId) {
    const isHelper = await tenantDb({ tenantId }).chatConversationHelper.count({ where: { tenantId, conversationId: conv.id, userId: args.byUserId } });
    if (isHelper === 0) return { ok: false, reason: "ส่งต่อได้เฉพาะผู้ดูแลห้อง ผู้ช่วยในห้อง หรือผู้มีสิทธิ์มอบหมาย", forbidden: true };
  }
  if (args.toUserId === args.byUserId) return { ok: false, reason: "เลือกเพื่อนร่วมทีมคนอื่นเพื่อส่งต่อ" };
  const why = (args.reason ?? "").trim().slice(0, REASON_MAX);
  if (!why) return { ok: false, reason: "ใส่เหตุผลที่ส่งต่อสั้น ๆ ให้คนรับรู้เรื่องด้วย" };
  if (conv.assigneeUserId === args.toUserId) return { ok: false, reason: "คนนี้ดูแลห้องนี้อยู่แล้ว" };
  const to = (await eligibleResponders(tenantId, systemId, conv.unitId)).find((x) => x.userId === args.toUserId);
  if (!to) return { ok: false, reason: "คนนี้ยังไม่มีสิทธิ์ตอบลูกค้าในหน่วยนี้" };

  // เขียนเฉพาะเมื่อผู้ดูแลยังเป็นคนที่อ่านไว้ (N.2-N4) — ส่งต่อค้างจอไม่ทับการรับห้องที่เพิ่งเกิด
  const res = await assign(
    { tenantId, systemId, conversationId: conv.id, assigneeUserId: to.userId, actorUserId: args.byUserId, unitAccess: args.unitAccess },
    { onlyIfAssignee: conv.assigneeUserId },
  );
  if (!res.ok) return { ok: false, reason: res.reason ?? "ส่งต่อไม่สำเร็จ ลองใหม่อีกครั้ง", conflict: true };
  await tenantDb({ tenantId }).chatConversationHelper.deleteMany({ where: { tenantId, conversationId: conv.id, userId: to.userId } });
  const byName = await userName(args.byUserId);
  await sendReply({
    tenantId,
    systemId,
    conversationId: conv.id,
    senderUserId: args.byUserId,
    body: `[ส่งต่อ] จาก ${byName} ถึง ${to.name}: ${why}`,
    isInternal: true,
  });
  await pushInbox(tenantId, systemId, to.userId, conv.id, "handoff", "มีห้องแชทส่งต่อถึงคุณ", `${byName} ส่งต่อห้องแชทลูกค้าให้คุณดูแล`, args.deps?.post);
  return { ok: true };
}

export async function listHelpers(
  tenantId: string,
  systemId: string,
  conversationId: string,
): Promise<{ userId: string; name: string; calledById: string; note: string | null; createdAt: Date }[]> {
  const conv = await convFor(tenantId, systemId, conversationId);
  if (!conv) return [];
  const rows = await tenantDb({ tenantId }).chatConversationHelper.findMany({
    where: { tenantId, conversationId: conv.id },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) return [];
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, name: true, email: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({ userId: r.userId, name: nameOf(byId.get(r.userId)), calledById: r.calledById, note: r.note, createdAt: r.createdAt }));
}

// ───────────────────────── เวร ─────────────────────────

/** เข้าเวร = แถวใหม่ (เปิดอยู่แล้ว = คืนแถวเดิม) · ออกเวร = ปิดแถวที่เปิดอยู่ (ไม่มี = ไม่ทำอะไร) */
export async function setShift(tenantId: string, userId: string, onDuty: boolean, now?: Date): Promise<{ onDuty: boolean; onDutyAt: Date | null }> {
  const at = now ?? new Date();
  const db = tenantDb({ tenantId });
  if (onDuty) {
    // กดเข้าเวรซ้ำ = แถวเดิม (ไม่สร้างแถวใหม่ · R-S1.21d) · ซ้อนกันหลายแถว (ข้อมูลเก่า) = เก็บแถวแรก ปิดที่เหลือ
    const open = await db.chatShift.findMany({ where: { tenantId, userId, offDutyAt: null }, orderBy: { onDutyAt: "asc" }, select: { id: true, onDutyAt: true } });
    if (open[0]) {
      if (open.length > 1) await db.chatShift.updateMany({ where: { tenantId, userId, offDutyAt: null, id: { not: open[0].id } }, data: { offDutyAt: at } });
      return { onDuty: true, onDutyAt: open[0].onDutyAt };
    }
    await db.chatShift.create({ data: { tenantId, userId, onDutyAt: at } });
    return { onDuty: true, onDutyAt: at };
  }
  await db.chatShift.updateMany({ where: { tenantId, userId, offDutyAt: null }, data: { offDutyAt: at } });
  return { onDuty: false, onDutyAt: null };
}

/** เวรที่เปิดอยู่ของร้าน (ชื่อ + เวลาเข้า) — ให้หน้ากฎรับเรื่อง */
export async function listOnDuty(tenantId: string, onlyUserIds?: ReadonlySet<string>): Promise<{ userId: string; name: string; since: Date }[]> {
  const rows = await tenantDb({ tenantId }).chatShift.findMany({
    where: { tenantId, offDutyAt: null },
    orderBy: { onDutyAt: "asc" },
    select: { userId: true, onDutyAt: true },
  });
  const first = new Map<string, Date>();
  for (const r of rows) if (!first.has(r.userId) && (!onlyUserIds || onlyUserIds.has(r.userId))) first.set(r.userId, r.onDutyAt);
  if (first.size === 0) return [];
  const users = await prisma.user.findMany({ where: { id: { in: [...first.keys()] } }, select: { id: true, name: true, email: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  return [...first].map(([userId, since]) => ({ userId, name: nameOf(byId.get(userId)), since }));
}

// ───────────────────────── SLA ─────────────────────────

/** บันทึกภายใน 1 ใบที่เป็นทั้งร่องรอยและตัวกันซ้ำ — true = ใบแรก (ผู้เรียกทำต่อ) · false = มีแล้ว/เขียนไม่ได้ */
async function claimNote(tenantId: string, systemId: string, conversationId: string, key: string, body: string): Promise<boolean> {
  const r = await sendReply({ tenantId, systemId, conversationId, senderUserId: SLA_ACTOR, senderName: "ระบบแชท", body, isInternal: true, clientMessageId: key });
  return r.ok && !r.duplicate;
}

const minsOf = (ms: number) => Math.max(0, Math.floor(ms / 60_000));
const SLA_UNASSIGNED = "sla:unassigned:";
const SLA_FIRST = "sla:first_response:";
const SLA_ESCALATED = "sla:escalated:";

/**
 * ตรวจ SLA ทุกระบบ CHAT ที่เปิดอยู่และมี ChatSetting (ข้ามร้าน · งานรายนาที `chat.sla` ทุก 5 นาที)
 *   (0) เฉพาะในเวลาทำการ + มีกฎเปิด: ห้อง OPEN ที่ยังว่าง (ย้อน 72 ชม.) ⇒ `assignIncoming` (ล้างคิวตอนเปิดร้าน · N.2-N3)
 *   (1) ห้อง OPEN ที่ "ไม่มีผู้ดูแลจริง" (assignee null หรือผู้ดูแลตอบไม่ได้แล้ว — ถูกถอน/หลุดหน่วย · R-S1.21c) รอ ≥ unassignedAlertMin
 *       เฉพาะในเวลาทำการ ⇒ เตือน OWNER/MANAGER ที่ตอบได้ในหน่วย (1 ครั้งต่อการรอ)
 *   (2) มีผู้ดูแล (ตอบได้) แต่ยังไม่ตอบแรก รอ ≥ slaFirstResponseMin ⇒ เตือนผู้ดูแล (1 ครั้ง) · รอ ≥ 2× ⇒ ย้ายให้ MANAGER/OWNER ที่ตอบได้
 *       (ย้ายเฉพาะเมื่อผู้ดูแลยังเป็นคนเดิม · โน้ต `sla:escalated:` เขียนหลังย้ายสำเร็จเท่านั้น — ไม่สำเร็จ = รอบหน้าดูใหม่ · N.2-N1)
 *   เวลารอนับจาก `firstCustomerMessageAt` · ดูย้อนหลังไม่เกิน 24 ชม. · กันซ้ำ = clientMessageId `sla:<เรื่อง>:<เวลาเริ่มรอ>` · ห้องที่มีโน้ตแล้วถูกกรองตั้งแต่ query (ไม่กินโควตา 200 ห้อง)
 *   ทีมโหลดครั้งเดียวต่อร้าน · ไม่ throw ทั้งรอบเพราะห้องเดียว · `deps.deadline` (ms) = หยุดก่อนหมดงบ
 */
export async function sweepChatSla(
  now?: Date,
  deps?: { notify?: SlaNotify; post?: PushPost; deadline?: number },
): Promise<{ alerted: number; escalated: number }> {
  const at = now ?? new Date();
  const out = { alerted: 0, escalated: 0 };
  const notify: SlaNotify =
    deps?.notify ??
    ((userId, msg) =>
      notifyUser(userId, String(msg.data.tenantId ?? ""), "inbox", { ...msg, data: { ...msg.data, link: String(msg.data.link ?? "") } }, { assigneeUserId: userId, ...(deps?.post ? { post: deps.post } : {}) }));
  const late = () => typeof deps?.deadline === "number" && Date.now() > deps.deadline;

  // ข้ามร้าน: ChatSetting ทุกแถว ∩ ระบบ CHAT ที่เปิด (แบบ chat/retention.ts) — ทุกคำสั่งหลังจากนี้ผูก tenantId+systemId ตรง
  const settings = await prisma.chatSetting.findMany({
    select: { tenantId: true, systemId: true, slaFirstResponseMin: true, unassignedAlertMin: true, businessHours: true },
  });
  const active = new Set(
    (await prisma.appSystem.findMany({ where: { id: { in: settings.map((s) => s.systemId) }, type: "CHAT", active: true }, select: { id: true } })).map((s) => s.id),
  );
  const since = new Date(at.getTime() - SLA_LOOKBACK_MS);
  const teams = new Map<string, Team>();

  for (const s of settings) {
    if (!active.has(s.systemId) || late()) continue;
    const { tenantId, systemId } = s;
    const msg = (convId: string, title: string, body: string): SlaMsg => ({
      title,
      body,
      data: { link: `/customers/${convId}?e=sla`, conversationId: convId, systemId, tenantId },
    });
    try {
      let team = teams.get(tenantId);
      if (!team) teams.set(tenantId, (team = await loadTeam(tenantId)));
      const t = team;
      const validIn = (uid: string | null, unitId: string | null) => !!uid && respondersOf(t, unitId).some((r) => r.userId === uid);
      const bh = readBusinessHours(s.businessHours);
      const open = !bh || isWithinBusinessHours(bh, at);

      // (0) ในเวลาทำการ: ห้อง OPEN ที่ยังว่าง (ย้อน 72 ชม. · ไม่ขึ้นกับ unassignedAlertMin) ⇒ กฎรับเรื่อง (ล้างคิวตอนเปิดร้าน · N.2-N3)
      if (open && (await listRules(tenantId, systemId)).some((r) => r.enabled)) {
        const backlog = await prisma.chatConversation.findMany({
          where: { tenantId, systemId, status: "OPEN", assigneeUserId: null, firstCustomerMessageAt: { gte: new Date(at.getTime() - ASSIGN_BACKLOG_MS), lte: at } },
          select: { id: true },
          orderBy: { firstCustomerMessageAt: "asc" },
          take: SLA_ROOMS_PER_SYSTEM,
        });
        for (const c of backlog) {
          if (late()) break;
          await assignIncoming({ tenantId, systemId, conversationId: c.id, now: at, deps: { notify, team: t } });
        }
      }

      // (1) ไม่มีผู้ดูแลจริง — นอกเวลาทำการไม่เตือน
      if (open && s.unassignedAlertMin > 0) {
        const keyHolders = t.members.filter((m) => evaluate(m.ctx, { module: "chat", action: CHAT_REPLY_ACTION }));
        // ผู้ถือคีย์ที่จำกัดหน่วย: ห้องนอกหน่วยของเขา = ผู้ดูแลที่ตอบไม่ได้ (ห้องไม่ผูกหน่วยตอบได้เสมอ — notIn ตัด null อยู่แล้ว)
        const outOfUnit = keyHolders
          .filter((m) => !m.ctx.unitAccess.includes("*"))
          .map((m) => ({ assigneeUserId: m.userId, unitId: { notIn: m.ctx.unitAccess } }));
        const rooms = await prisma.chatConversation.findMany({
          where: {
            tenantId,
            systemId,
            status: "OPEN",
            firstCustomerMessageAt: { gte: since, lte: new Date(at.getTime() - s.unassignedAlertMin * 60_000) },
            messages: { none: { clientMessageId: { startsWith: SLA_UNASSIGNED } } },
            OR: [{ assigneeUserId: null }, { assigneeUserId: { notIn: keyHolders.map((m) => m.userId) } }, ...outOfUnit],
          },
          select: { id: true, unitId: true, assigneeUserId: true, firstCustomerMessageAt: true },
          orderBy: { firstCustomerMessageAt: "asc" },
          take: SLA_ROOMS_PER_SYSTEM,
        });
        for (const c of rooms) {
          if (late()) break;
          if (validIn(c.assigneeUserId, c.unitId)) continue; // ตรวจซ้ำฝั่งแอป (ตัวกรอง SQL หยาบกว่า)
          const waited = minsOf(at.getTime() - c.firstCustomerMessageAt!.getTime());
          const gone = c.assigneeUserId ? "ผู้ดูแลเดิมตอบห้องนี้ไม่ได้แล้ว" : "ยังไม่มีผู้ดูแลห้องนี้";
          const claimed = await claimNote(tenantId, systemId, c.id, `${SLA_UNASSIGNED}${c.firstCustomerMessageAt!.getTime()}`, `⏰ ลูกค้ารอมา ${waited} นาที ${gone} — แจ้งเจ้าของ/ผู้จัดการแล้ว`);
          if (!claimed) continue;
          const bosses = respondersOf(t, c.unitId).filter((x) => x.role === "OWNER" || x.role === "MANAGER");
          for (const b of bosses) await notify(b.userId, msg(c.id, "แชทลูกค้ายังไม่มีผู้ดูแล", `ลูกค้ารอมา ${waited} นาที — เปิดเพื่อรับเรื่องหรือมอบหมาย`));
          out.alerted++;
        }
      }

      // (2) มีผู้ดูแลที่ตอบได้ แต่ยังไม่ตอบแรก
      if (s.slaFirstResponseMin > 0) {
        const slaMs = s.slaFirstResponseMin * 60_000;
        const rooms = await prisma.chatConversation.findMany({
          where: {
            tenantId,
            systemId,
            status: "OPEN",
            assigneeUserId: { not: null },
            firstResponseAt: null,
            firstCustomerMessageAt: { gte: since, lte: new Date(at.getTime() - slaMs) },
            messages: { none: { clientMessageId: { startsWith: SLA_ESCALATED } } },
          },
          select: { id: true, unitId: true, assigneeUserId: true, firstCustomerMessageAt: true },
          orderBy: { firstCustomerMessageAt: "asc" },
          take: SLA_ROOMS_PER_SYSTEM,
        });
        for (const c of rooms) {
          if (late()) break;
          const from = c.assigneeUserId!;
          if (!validIn(from, c.unitId)) continue; // ผู้ดูแลตอบไม่ได้แล้ว = งานของ (1) · ไม่ push ถึงคนที่ถูกถอน
          const anchor = c.firstCustomerMessageAt!.getTime();
          const waitedMs = at.getTime() - anchor;
          const waited = minsOf(waitedMs);
          if (waitedMs >= 2 * slaMs) {
            const responders = respondersOf(t, c.unitId);
            const bosses = responders.filter((x) => (x.role === "MANAGER" || x.role === "OWNER") && x.userId !== from);
            // ผู้จัดการก่อน เจ้าของทีหลัง · ในกลุ่มเดียวกัน = คนที่ห้องน้อยสุด
            const managers = bosses.filter((x) => x.role === "MANAGER").map((x) => x.userId);
            const target = (await leastLoaded(tenantId, systemId, managers)) ?? (await leastLoaded(tenantId, systemId, bosses.map((x) => x.userId)));
            if (target) {
              const fromName = responders.find((x) => x.userId === from)?.name ?? (await userName(from));
              const toName = bosses.find((x) => x.userId === target)?.name ?? "ผู้จัดการ";
              // ย้ายก่อน (updateMany มีเงื่อนไข: ผู้ดูแลยังเป็นคนเดิม · L-7) แล้วค่อยเขียนโน้ต (N.2-N1)
              //   ย้ายไม่สำเร็จ (มีคนรับ/ย้ายตัดหน้า) = ไม่เขียนอะไร ⇒ รอบหน้าห้องนี้ถูกพิจารณาใหม่ด้วยสภาพจริง
              const res = await assign({ tenantId, systemId, conversationId: c.id, assigneeUserId: target, actorUserId: SLA_ACTOR }, { onlyIfAssignee: from });
              if (res.ok) {
                await claimNote(tenantId, systemId, c.id, `${SLA_ESCALATED}${anchor}`, `⏫ ลูกค้ารอคำตอบแรกมา ${waited} นาที — ย้ายจาก ${fromName} ถึง ${toName}`);
                await notify(target, msg(c.id, "ย้ายแชทลูกค้าที่รอนานมาให้คุณ", `ลูกค้ารอคำตอบแรกมา ${waited} นาที`));
                out.escalated++;
              }
              continue;
            }
          }
          const claimed = await claimNote(tenantId, systemId, c.id, `${SLA_FIRST}${anchor}`, `⏰ ลูกค้ารอคำตอบแรกมา ${waited} นาที`);
          if (!claimed) continue;
          await notify(from, msg(c.id, "ลูกค้ารอคำตอบอยู่", `ลูกค้ารอคำตอบแรกมา ${waited} นาที`));
          out.alerted++;
        }
      }
    } catch (e) {
      await logOps("WARN", "chat", `chat.sla: ระบบ ${systemId} สะดุด`, { tenantId, detail: e instanceof Error ? (e.stack ?? e.message) : String(e) }).catch(() => {});
    }
  }
  return out;
}
