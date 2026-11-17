// service.ts — แชททีม (B27 · มติเจ้าของ 15 พ.ย. 2026 · แบบ /root/mockups/team-invite/team2.png) — ผู้เขียนเดียวของ TeamThread/TeamThreadMember/TeamMessage
//
// โซน "ทีม" ของแอป = รายชื่อแชทแบบ WhatsApp: ห้อง 1:1 (DIRECT) กับคนในร้าน + กลุ่ม (GROUP) · ข้อความ/รูป/ไฟล์ · อ่านแล้ว · ปิดเสียงต่อห้อง
// เพิ่มคน = ค้นผู้ใช้ Lekaa เดิมด้วยเบอร์ที่ยืนยันแล้ว (UserPhone.verifiedAt) → คำเชิญแบบไม่ส่ง SMS (StaffInvite · inviteStaff channel "app")
//   บทบาทเริ่มต้น "คุยอย่างเดียว" = STAFF ไม่มีสิทธิ์ระบบใด (permissions ไม่มีคีย์ true · unitAccess []) · อีกฝ่ายต้องกดรับเอง (acceptInvite เดิม)
//
// 🔴 กติกา (fail-closed ทุกข้อ):
//   1. ตัวตน/ร้าน มาจากด่านของ route เท่านั้น · ผู้เรียกต้องเป็นสมาชิกร้านที่รับแล้ว (อ่านจาก DB ทุกครั้ง)
//   2. อ่าน/เขียนห้องได้เฉพาะสมาชิกห้อง (leftAt = null) — ไม่ใช่สมาชิก/ห้องร้านอื่น = null (route ตอบ 404 ไม่บอกว่ามีจริง)
//   3. ข้อความเห็นได้ตั้งแต่ joinedAt ของตัวเอง (เข้ากลุ่มทีหลัง = ไม่เห็นประวัติก่อนเข้า · ไฟล์แนบก็เช่นกัน)
//   4. ทุกคำสั่งกรอง tenantId มือ (prisma ตรงแบบ staff/service.ts — Membership เป็นแกน global)
//   5. ค้นเบอร์ (anti-enumeration): OWNER/MANAGER เท่านั้น · เพดานต่อคน/ร้าน/วัน · คืนแค่ชื่อแสดง · จด AuditLog (ไม่เก็บเบอร์ — เก็บ hash)
//   6. ไฟล์แนบ = ไฟล์ที่ผู้ส่งอัปเองผ่านเส้น team/attachments ภายใน 24 ชม. (จดกุญแจ `team-att:` ตอนอัป) — หยิบไฟล์คนอื่นมาแนบไม่ได้
//   7. push ไม่ throw · เรียกนอกทรานแซกชัน · ห้องที่ปิดเสียง = ไม่ส่ง
import type { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { sha256 } from "@/lib/core/hash";
import { isPhonePlaceholderEmail, normalizeThaiMobile } from "@/lib/core/phone-auth";
import { checkRateLimitDb, checkRateLimitDbMany } from "@/lib/core/rate-limit-db";
import { resolveAttachmentRefs } from "@/lib/ai/secretary/attachments";
import { attachmentsOf, type SecAttachment } from "@/lib/ai/secretary/attachments-shared";

export type TeamCtx = { tenantId: string; userId: string };
export type TeamRoleTag = "OWNER" | "MANAGER" | "STAFF" | "CHAT_ONLY";
export type TeamFail = { ok: false; reason: TeamFailReason; message: string };
export type TeamFailReason = "forbidden" | "not_found" | "invalid" | "rate_limited" | "already_member" | "already_invited" | "not_lekaa" | "conflict";

export const TEAM_BODY_MAX = 4000;
export const TEAM_GROUP_NAME_MAX = 60;
export const TEAM_GROUP_MAX_MEMBERS = 256;
export const TEAM_PAGE_MAX = 100;
/** ค้นเบอร์: ต่อผู้ค้น 30/วัน · ต่อร้าน 100/วัน (เพดานต่อนาทีอยู่ที่ route) */
export const TEAM_LOOKUP_PER_USER_DAY = 30;
export const TEAM_LOOKUP_PER_TENANT_DAY = 100;
const DAY_MS = 86_400_000;
const ATTACH_KEY_TTL_MS = DAY_MS;

const MSG = {
  forbidden: "เฉพาะเจ้าของกิจการหรือผู้จัดการเท่านั้นที่เพิ่มคนเข้าทีมได้",
  notFound: "ไม่พบห้องแชทนี้ หรือคุณไม่ได้อยู่ในห้องนี้",
  badPhone: "เบอร์มือถือไม่ถูกต้อง กรุณาตรวจแล้วลองใหม่",
  notLekaa: "เบอร์นี้ยังไม่มี Lekaa ให้เขาดาวน์โหลดแอปและสมัครก่อน",
  alreadyMember: "คนนี้อยู่ในทีมแล้ว",
  rateLimited: "ค้นหาเบอร์ถี่เกินไป — ลองใหม่ภายหลัง",
  emptyMsg: "พิมพ์ข้อความหรือแนบไฟล์ก่อนส่ง",
  groupName: "ตั้งชื่อกลุ่มก่อน (ไม่เกิน 60 ตัวอักษร)",
  groupMembers: "เลือกคนในทีมอย่างน้อย 1 คน",
  notTeamMember: "มีบางคนที่ไม่ได้อยู่ในทีมนี้แล้ว — รีเฟรชแล้วเลือกใหม่",
  adminOnly: "เฉพาะผู้ดูแลกลุ่มเท่านั้นที่ทำรายการนี้ได้",
  directOnly: "ห้องนี้เป็นแชทส่วนตัว — ทำรายการของกลุ่มไม่ได้",
  self: "เปิดแชทกับตัวเองไม่ได้",
  attachGone: "ไม่พบไฟล์แนบ หรือไฟล์หมดอายุแล้ว — แนบใหม่อีกครั้ง",
} as const;
const failT = (reason: TeamFailReason, message: string): TeamFail => ({ ok: false, reason, message });

type PermissionMap = Record<string, unknown>;
const jsonObj = (v: unknown): PermissionMap => (v && typeof v === "object" && !Array.isArray(v) ? (v as PermissionMap) : {});

/** "คุยอย่างเดียว" = STAFF ที่ไม่มีคีย์สิทธิ์ใดเป็น true (คีย์เพดานตัวเลขไม่นับ — ไม่มีคีย์ true ก็ไม่ผ่าน evaluate ใด) */
export function isChatOnly(role: Role | string, permissions: unknown): boolean {
  if (role !== "STAFF") return false;
  return !Object.values(jsonObj(permissions)).some((v) => v === true);
}
export function roleTagOf(role: Role | string, permissions: unknown): TeamRoleTag {
  if (role === "OWNER" || role === "MANAGER") return role;
  return isChatOnly(role, permissions) ? "CHAT_ONLY" : "STAFF";
}

/** ชื่อแสดง — แบบ listStaffAccessRows (บัญชีเบอร์โทรไม่โชว์เบอร์) */
export function displayNameOf(u: { name?: string | null; email?: string | null } | null | undefined): string {
  const n = u?.name?.trim();
  if (n) return n.slice(0, 80);
  if (!u?.email || isPhonePlaceholderEmail(u.email)) return "สมาชิก";
  return u.email.split("@")[0] || "ผู้ใช้งาน";
}

type ActiveMember = { membershipId: string; userId: string; name: string; role: Role; tag: TeamRoleTag };

/** สมาชิกร้านที่รับแล้วทั้งหมด (ไดเรกทอรีของทีม) — เรียงตามวันที่เข้า */
export async function activeMembers(tenantId: string, userIds?: readonly string[]): Promise<ActiveMember[]> {
  const rows = await prisma.membership.findMany({
    where: { tenantId, acceptedAt: { not: null }, ...(userIds ? { userId: { in: [...userIds] } } : {}) },
    select: { id: true, userId: true, role: true, permissions: true, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((m) => ({ membershipId: m.id, userId: m.userId, name: displayNameOf(m.user), role: m.role, tag: roleTagOf(m.role, m.permissions) }));
}

async function actorMembership(ctx: TeamCtx) {
  if (!ctx.tenantId || !ctx.userId) return null;
  return prisma.membership.findFirst({ where: { tenantId: ctx.tenantId, userId: ctx.userId, acceptedAt: { not: null } }, select: { id: true, role: true, permissions: true } });
}

/** แถวสมาชิกห้องของผู้เรียก (ห้องของร้านนี้ · ยังไม่ออก) — null = ไม่ใช่สมาชิก (route ตอบ 404) */
async function myMembership(ctx: TeamCtx, threadId: string) {
  if (!threadId || threadId.length > 80) return null;
  const me = await actorMembership(ctx);
  if (!me) return null;
  const row = await prisma.teamThreadMember.findFirst({
    where: { tenantId: ctx.tenantId, threadId, userId: ctx.userId, leftAt: null, thread: { tenantId: ctx.tenantId } },
    include: { thread: true },
  });
  return row;
}

// ───────── รายชื่อแชท ─────────

export type ThreadRow = {
  id: string;
  kind: "DIRECT" | "GROUP";
  name: string;
  /** DIRECT: อีกฝ่าย */
  peer: { userId: string; membershipId: string | null; tag: TeamRoleTag | null } | null;
  hasPhoto: boolean;
  photoFileId: string | null;
  memberCount: number;
  muted: boolean;
  unread: number;
  last: { body: string; mine: boolean; senderName: string | null; kind: string; attachments: number; at: string } | null;
  updatedAt: string;
};

// SQL ดิบของไฟล์นี้ (ตรวจ 17 พ.ย. 2026 · ความเสี่ยงใน handoff): ใช้ tagged template `$queryRaw\`…\`` เท่านั้น ⇒ ทุก ${…} เป็น bind parameter (ไม่ต่อสตริง · ไม่มี $queryRawUnsafe)
//   ชื่อตาราง/คอลัมน์เป็นค่าคงที่ · กรองร้านทั้งสองฝั่ง JOIN (m."tenantId" + tm."tenantId" = ร้านของผู้เรียก) · ids ของ ANY() มาจากแถวสมาชิกของผู้เรียกเอง (leftAt null · ร้านนี้)
/** ยังไม่อ่านต่อห้องของผู้ใช้ (ข้อความคนอื่น · ไม่ใช่ SYSTEM · หลัง lastReadAt/joinedAt) — คำสั่งเดียว */
async function unreadByThread(tenantId: string, userId: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ threadId: string; n: bigint }[]>`
    SELECT m."threadId", COUNT(*)::bigint AS n
    FROM "TeamMessage" m
    JOIN "TeamThreadMember" tm ON tm."threadId" = m."threadId" AND tm."userId" = ${userId} AND tm."tenantId" = ${tenantId} AND tm."leftAt" IS NULL
    WHERE m."tenantId" = ${tenantId} AND m."senderUserId" <> ${userId} AND m."kind" = 'TEXT' AND m."deletedAt" IS NULL
      AND m."createdAt" > COALESCE(tm."lastReadAt", tm."joinedAt") AND m."createdAt" >= tm."joinedAt"
    GROUP BY m."threadId"`;
  return new Map(rows.map((r) => [r.threadId, Number(r.n)]));
}

/** ตัวเลข badge ทีม = ข้อความที่ยังไม่อ่านทุกห้องของร้านนี้ (ห้องที่ปิดเสียงไม่นับ) · ไม่ใช่สมาชิกร้าน = 0 */
export async function teamUnreadTotal(tenantId: string, userId: string): Promise<number> {
  if (!tenantId || !userId) return 0;
  const me = await actorMembership({ tenantId, userId });
  if (!me) return 0;
  const [map, muted] = await Promise.all([
    unreadByThread(tenantId, userId),
    prisma.teamThreadMember.findMany({ where: { tenantId, userId, leftAt: null, muted: true }, select: { threadId: true } }),
  ]);
  const off = new Set(muted.map((m) => m.threadId));
  let n = 0;
  for (const [tid, c] of map) if (!off.has(tid)) n += c;
  return n;
}

export async function listThreads(ctx: TeamCtx): Promise<{ ok: true; threads: ThreadRow[]; people: (ActiveMember & { me: boolean; directThreadId: string | null })[] } | TeamFail> {
  const me = await actorMembership(ctx);
  if (!me) return failT("not_found", MSG.notFound);
  const mine = await prisma.teamThreadMember.findMany({
    where: { tenantId: ctx.tenantId, userId: ctx.userId, leftAt: null, thread: { tenantId: ctx.tenantId } },
    include: { thread: { include: { members: { where: { leftAt: null }, select: { userId: true } } } } },
  });
  const ids = mine.map((m) => m.threadId);
  const [people, unread, lastRows] = await Promise.all([
    activeMembers(ctx.tenantId),
    unreadByThread(ctx.tenantId, ctx.userId),
    ids.length
      ? prisma.$queryRaw<{ id: string; threadId: string; senderUserId: string; kind: string; body: string; attachments: unknown; createdAt: Date; deletedAt: Date | null }[]>`
          SELECT DISTINCT ON (m."threadId") m."id", m."threadId", m."senderUserId", m."kind", m."body", m."attachments", m."createdAt", m."deletedAt"
          FROM "TeamMessage" m
          JOIN "TeamThreadMember" tm ON tm."threadId" = m."threadId" AND tm."userId" = ${ctx.userId} AND tm."tenantId" = ${ctx.tenantId} AND tm."leftAt" IS NULL
          WHERE m."tenantId" = ${ctx.tenantId} AND m."threadId" = ANY(${ids}) AND m."createdAt" >= tm."joinedAt"
          ORDER BY m."threadId", m."createdAt" DESC, m."id" DESC`
      : Promise.resolve([]),
  ]);
  const byUser = new Map(people.map((p) => [p.userId, p]));
  const lastOf = new Map(lastRows.map((r) => [r.threadId, r]));
  const senderIds = [...new Set(lastRows.map((r) => r.senderUserId).filter((u) => !byUser.has(u)))];
  const extraUsers = senderIds.length ? await prisma.user.findMany({ where: { id: { in: senderIds } }, select: { id: true, name: true, email: true } }) : [];
  const nameOf = (uid: string) => byUser.get(uid)?.name ?? displayNameOf(extraUsers.find((u) => u.id === uid));
  const threads: ThreadRow[] = [];
  const directWith = new Map<string, string>();
  for (const m of mine) {
    const t = m.thread;
    const others = t.members.map((x) => x.userId).filter((u) => u !== ctx.userId);
    let peer: ThreadRow["peer"] = null;
    let name = t.name ?? "";
    if (t.kind === "DIRECT") {
      const pid = t.directKey?.split(":").find((u) => u !== ctx.userId) ?? others[0] ?? "";
      const p = byUser.get(pid);
      peer = { userId: pid, membershipId: p?.membershipId ?? null, tag: p?.tag ?? null };
      name = p?.name ?? nameOf(pid);
      directWith.set(pid, t.id);
    }
    const l = lastOf.get(t.id);
    threads.push({
      id: t.id,
      kind: t.kind,
      name,
      peer,
      hasPhoto: !!t.photoFileId,
      photoFileId: t.photoFileId,
      memberCount: t.members.length,
      muted: m.muted,
      unread: unread.get(t.id) ?? 0,
      last: l
        ? {
            body: l.deletedAt ? "" : l.body.slice(0, 160),
            mine: l.senderUserId === ctx.userId,
            senderName: l.senderUserId === ctx.userId ? null : nameOf(l.senderUserId),
            kind: l.kind,
            attachments: l.deletedAt ? 0 : attachmentsOf(l.attachments).length,
            at: l.createdAt.toISOString(),
          }
        : null,
      updatedAt: (t.lastMessageAt ?? t.createdAt).toISOString(),
    });
  }
  // DIRECT ที่ยังไม่มีข้อความเลย = ไม่แสดงเป็นแชท (คนนั้นอยู่ในรายชื่อคนอยู่แล้ว)
  const shown = threads.filter((t) => t.kind === "GROUP" || t.last).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    ok: true,
    threads: shown,
    people: people.map((p) => ({ ...p, me: p.userId === ctx.userId, directThreadId: directWith.get(p.userId) ?? null })),
  };
}

// ───────── เปิดห้อง ─────────

const directKeyOf = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** เปิด/คืนห้อง 1:1 กับคนในร้าน (ซ้ำ = ห้องเดิม · อีกฝ่ายเคยออก = กลับเข้า) */
export async function openDirect(ctx: TeamCtx, otherUserId: string): Promise<{ ok: true; threadId: string } | TeamFail> {
  const me = await actorMembership(ctx);
  if (!me) return failT("not_found", MSG.notFound);
  if (!otherUserId || otherUserId === ctx.userId) return failT("invalid", MSG.self);
  const other = await prisma.membership.findFirst({ where: { tenantId: ctx.tenantId, userId: otherUserId, acceptedAt: { not: null } }, select: { id: true } });
  if (!other) return failT("not_found", MSG.notTeamMember);
  const key = directKeyOf(ctx.userId, otherUserId);
  const existing = await prisma.teamThread.findUnique({ where: { tenantId_directKey: { tenantId: ctx.tenantId, directKey: key } }, select: { id: true } });
  const threadId =
    existing?.id ??
    (await prisma.teamThread
      .create({
        data: {
          tenantId: ctx.tenantId,
          kind: "DIRECT",
          createdById: ctx.userId,
          directKey: key,
          members: { create: [ctx.userId, otherUserId].map((u) => ({ tenantId: ctx.tenantId, userId: u, role: "MEMBER" as const })) },
        },
        select: { id: true },
      })
      .then((t) => t.id)
      .catch(async (e: unknown) => {
        // สองเครื่องเปิดพร้อมกัน — unique (tenantId, directKey) ชน ⇒ อ่านห้องที่อีกคำขอสร้าง
        const again = await prisma.teamThread.findUnique({ where: { tenantId_directKey: { tenantId: ctx.tenantId, directKey: key } }, select: { id: true } });
        if (again) return again.id;
        throw e;
      }));
  for (const u of [ctx.userId, otherUserId]) {
    await prisma.teamThreadMember.upsert({
      where: { threadId_userId: { threadId, userId: u } },
      create: { tenantId: ctx.tenantId, threadId, userId: u },
      update: {},
    });
  }
  await prisma.teamThreadMember.updateMany({ where: { tenantId: ctx.tenantId, threadId, userId: { in: [ctx.userId, otherUserId] }, leftAt: { not: null } }, data: { leftAt: null } });
  return { ok: true, threadId };
}

async function systemLine(tx: Prisma.TransactionClient, tenantId: string, threadId: string, senderUserId: string, body: string, at: Date): Promise<void> {
  await tx.teamMessage.create({ data: { tenantId, threadId, senderUserId, kind: "SYSTEM", body: body.slice(0, 300), createdAt: at } });
  await tx.teamThread.updateMany({ where: { id: threadId, tenantId }, data: { lastMessageAt: at } });
}

function cleanName(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  return s && s.length <= TEAM_GROUP_NAME_MAX ? s : null;
}

/** ไฟล์รูปกลุ่ม: ต้องเป็นไฟล์ที่ผู้เรียกอัปเองผ่าน team/attachments (และเป็นรูป) */
async function ownImage(ctx: TeamCtx, fileId: string): Promise<boolean> {
  if (!(await ownsUpload(ctx, fileId))) return false;
  const r = await resolveAttachmentRefs(ctx.tenantId, [{ id: fileId, name: "photo" }]);
  return r.ok && r.items[0]?.kind === "image";
}

export async function createGroup(ctx: TeamCtx, input: { name: string; userIds: string[]; photoFileId?: string | null }): Promise<{ ok: true; threadId: string } | TeamFail> {
  const me = await actorMembership(ctx);
  if (!me) return failT("not_found", MSG.notFound);
  const name = cleanName(input?.name);
  if (!name) return failT("invalid", MSG.groupName);
  const ids = [...new Set((Array.isArray(input?.userIds) ? input.userIds : []).filter((u) => typeof u === "string" && u && u !== ctx.userId))];
  if (ids.length === 0 || ids.length >= TEAM_GROUP_MAX_MEMBERS) return failT("invalid", MSG.groupMembers);
  const ok = await activeMembers(ctx.tenantId, ids);
  if (ok.length !== ids.length) return failT("invalid", MSG.notTeamMember);
  if (input.photoFileId && !(await ownImage(ctx, input.photoFileId))) return failT("invalid", MSG.attachGone);
  const now = new Date();
  const t = await prisma.$transaction(async (tx) => {
    const th = await tx.teamThread.create({
      data: {
        tenantId: ctx.tenantId,
        kind: "GROUP",
        name,
        photoFileId: input.photoFileId || null,
        createdById: ctx.userId,
        lastMessageAt: now,
        members: { create: [{ tenantId: ctx.tenantId, userId: ctx.userId, role: "ADMIN" as const, lastReadAt: now }, ...ids.map((u) => ({ tenantId: ctx.tenantId, userId: u, role: "MEMBER" as const }))] },
      },
      select: { id: true },
    });
    await systemLine(tx, ctx.tenantId, th.id, ctx.userId, `สร้างกลุ่ม “${name}”`, now);
    return th;
  });
  return { ok: true, threadId: t.id };
}

// ───────── รายละเอียดห้อง ─────────

export type ThreadDetail = {
  id: string;
  kind: "DIRECT" | "GROUP";
  name: string;
  photoFileId: string | null;
  createdById: string;
  myRole: "ADMIN" | "MEMBER";
  muted: boolean;
  peer: { userId: string; membershipId: string | null; tag: TeamRoleTag | null; name: string } | null;
  members: { userId: string; membershipId: string | null; name: string; tag: TeamRoleTag | null; admin: boolean; me: boolean; lastReadAt: string | null }[];
};

export async function getThread(ctx: TeamCtx, threadId: string): Promise<ThreadDetail | null> {
  const mine = await myMembership(ctx, threadId);
  if (!mine) return null;
  const rows = await prisma.teamThreadMember.findMany({ where: { tenantId: ctx.tenantId, threadId, leftAt: null }, orderBy: { joinedAt: "asc" } });
  const people = await activeMembers(ctx.tenantId, rows.map((r) => r.userId));
  const byUser = new Map(people.map((p) => [p.userId, p]));
  const missing = rows.map((r) => r.userId).filter((u) => !byUser.has(u));
  const extra = missing.length ? await prisma.user.findMany({ where: { id: { in: missing } }, select: { id: true, name: true, email: true } }) : [];
  const members = rows.map((r) => {
    const p = byUser.get(r.userId);
    return {
      userId: r.userId,
      membershipId: p?.membershipId ?? null,
      name: p?.name ?? displayNameOf(extra.find((u) => u.id === r.userId)),
      tag: p?.tag ?? null,
      admin: r.role === "ADMIN",
      me: r.userId === ctx.userId,
      lastReadAt: r.lastReadAt?.toISOString() ?? null,
    };
  });
  const t = mine.thread;
  let peer: ThreadDetail["peer"] = null;
  if (t.kind === "DIRECT") {
    const pid = t.directKey?.split(":").find((u) => u !== ctx.userId) ?? "";
    const p = members.find((m) => m.userId === pid);
    const pp = byUser.get(pid);
    peer = { userId: pid, membershipId: pp?.membershipId ?? null, tag: pp?.tag ?? null, name: p?.name ?? pp?.name ?? displayNameOf(extra.find((u) => u.id === pid)) };
  }
  return {
    id: t.id,
    kind: t.kind,
    name: t.kind === "DIRECT" ? (peer?.name ?? "") : (t.name ?? ""),
    photoFileId: t.photoFileId,
    createdById: t.createdById,
    myRole: mine.role,
    muted: mine.muted,
    peer,
    members,
  };
}

// ───────── ข้อความ ─────────

export type MessageRow = {
  id: string;
  kind: string;
  body: string;
  attachments: (SecAttachment & { url: string })[];
  senderUserId: string;
  senderName: string;
  mine: boolean;
  at: string;
  deleted: boolean;
  /** ข้อความของเรา: DIRECT = อีกฝ่ายอ่านแล้ว · GROUP = จำนวนคนอ่าน (ไม่รวมเรา) */
  read: boolean;
  readBy: number;
};

export async function listMessages(
  ctx: TeamCtx,
  threadId: string,
  q: { before?: { at: Date; id: string }; after?: { at: Date; id: string }; take?: number } = {},
): Promise<{ items: MessageRow[]; hasMore: boolean; reads: { userId: string; lastReadAt: string | null }[]; memberCount: number } | null> {
  const mine = await myMembership(ctx, threadId);
  if (!mine) return null;
  const take = Math.min(Math.max(1, Math.floor(q.take ?? 50)), TEAM_PAGE_MAX);
  const since = mine.joinedAt;
  const where: Prisma.TeamMessageWhereInput = { tenantId: ctx.tenantId, threadId, createdAt: { gte: since } };
  const ands: Prisma.TeamMessageWhereInput[] = [];
  if (q.before) ands.push({ OR: [{ createdAt: { lt: q.before.at } }, { createdAt: q.before.at, id: { lt: q.before.id } }] });
  if (q.after) ands.push({ OR: [{ createdAt: { gt: q.after.at } }, { createdAt: q.after.at, id: { gt: q.after.id } }] });
  const rows = await prisma.teamMessage.findMany({
    where: ands.length ? { ...where, AND: ands } : where,
    orderBy: q.after ? [{ createdAt: "asc" }, { id: "asc" }] : [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
  });
  const hasMore = rows.length > take;
  const page = rows.slice(0, take);
  if (!q.after) page.reverse();
  const others = await prisma.teamThreadMember.findMany({ where: { tenantId: ctx.tenantId, threadId, leftAt: null, userId: { not: ctx.userId } }, select: { userId: true, lastReadAt: true } });
  const senders = [...new Set(page.map((m) => m.senderUserId))];
  const users = senders.length ? await prisma.user.findMany({ where: { id: { in: senders } }, select: { id: true, name: true, email: true } }) : [];
  const nameOf = new Map(users.map((u) => [u.id, displayNameOf(u)]));
  const direct = mine.thread.kind === "DIRECT";
  const items = page.map((m) => {
    const isMine = m.senderUserId === ctx.userId;
    const readBy = isMine ? others.filter((o) => o.lastReadAt && o.lastReadAt >= m.createdAt).length : 0;
    const deleted = !!m.deletedAt;
    return {
      id: m.id,
      kind: m.kind,
      body: deleted ? "" : m.body,
      attachments: deleted ? [] : attachmentsOf(m.attachments).map((a) => ({ ...a, url: `/api/mobile/secretary/team/threads/${threadId}/files/${a.fileId}` })),
      senderUserId: m.senderUserId,
      senderName: nameOf.get(m.senderUserId) ?? "สมาชิก",
      mine: isMine,
      at: m.createdAt.toISOString(),
      deleted,
      read: isMine && (direct ? readBy > 0 : readBy > 0 && readBy >= others.length),
      readBy,
    };
  });
  return { items, hasMore, reads: others.map((o) => ({ userId: o.userId, lastReadAt: o.lastReadAt?.toISOString() ?? null })), memberCount: others.length + 1 };
}

/** อัปไฟล์แล้ว จดว่าใครอัป (24 ชม.) — ตอนส่งตรวจว่าไฟล์เป็นของผู้ส่งเอง (กติกา 6) */
export async function rememberUpload(ctx: TeamCtx, fileId: string): Promise<void> {
  await checkRateLimitDb(`team-att:${ctx.tenantId}:${ctx.userId}:${fileId}`, { limit: 1, windowMs: ATTACH_KEY_TTL_MS });
}
async function ownsUpload(ctx: TeamCtx, fileId: string): Promise<boolean> {
  if (!fileId || fileId.length > 80) return false;
  const row = await prisma.chatRateBucket.findUnique({ where: { key: `team-att:${ctx.tenantId}:${ctx.userId}:${fileId}` }, select: { windowStart: true } });
  return !!row && row.windowStart.getTime() > Date.now() - ATTACH_KEY_TTL_MS;
}

export async function sendMessage(
  ctx: TeamCtx,
  threadId: string,
  input: { body?: string; attachments?: { id: string; name?: string | null }[] },
  now: Date = new Date(),
): Promise<{ ok: true; message: MessageRow; recipients: string[]; thread: { kind: "DIRECT" | "GROUP"; name: string | null } } | TeamFail> {
  const mine = await myMembership(ctx, threadId);
  if (!mine) return failT("not_found", MSG.notFound);
  const body = String(input?.body ?? "").trim().slice(0, TEAM_BODY_MAX);
  const refs = Array.isArray(input?.attachments) ? input.attachments : [];
  if (!body && refs.length === 0) return failT("invalid", MSG.emptyMsg);
  for (const r of refs) if (!(await ownsUpload(ctx, r?.id))) return failT("invalid", MSG.attachGone);
  const atts = await resolveAttachmentRefs(ctx.tenantId, refs, now);
  if (!atts.ok) return failT("invalid", atts.message);
  // DIRECT: อีกฝ่ายต้องยังเป็นสมาชิกร้าน (ถูกเอาออกจากร้านแล้ว = ส่งไม่ได้)
  if (mine.thread.kind === "DIRECT") {
    const pid = mine.thread.directKey?.split(":").find((u) => u !== ctx.userId) ?? "";
    const alive = await prisma.membership.findFirst({ where: { tenantId: ctx.tenantId, userId: pid, acceptedAt: { not: null } }, select: { id: true } });
    if (!alive) return failT("conflict", "คนนี้ไม่ได้อยู่ในทีมแล้ว — ส่งข้อความไม่ได้");
    await prisma.teamThreadMember.updateMany({ where: { tenantId: ctx.tenantId, threadId, userId: pid, leftAt: { not: null } }, data: { leftAt: null } });
  }
  const msg = await prisma.$transaction(async (tx) => {
    const m = await tx.teamMessage.create({
      data: { tenantId: ctx.tenantId, threadId, senderUserId: ctx.userId, kind: "TEXT", body, attachments: atts.items as unknown as Prisma.InputJsonValue, createdAt: now },
    });
    await tx.teamThread.updateMany({ where: { id: threadId, tenantId: ctx.tenantId }, data: { lastMessageAt: now } });
    // ส่งเอง = อ่านถึงตรงนี้แล้ว
    await tx.teamThreadMember.updateMany({ where: { tenantId: ctx.tenantId, threadId, userId: ctx.userId }, data: { lastReadAt: now } });
    return m;
  });
  const recipients = await prisma.teamThreadMember.findMany({
    where: { tenantId: ctx.tenantId, threadId, leftAt: null, muted: false, userId: { not: ctx.userId } },
    select: { userId: true },
  });
  const sender = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true, email: true } });
  return {
    ok: true,
    message: {
      id: msg.id,
      kind: msg.kind,
      body: msg.body,
      attachments: atts.items.map((a) => ({ ...a, url: `/api/mobile/secretary/team/threads/${threadId}/files/${a.fileId}` })),
      senderUserId: ctx.userId,
      senderName: displayNameOf(sender),
      mine: true,
      at: msg.createdAt.toISOString(),
      deleted: false,
      read: false,
      readBy: 0,
    },
    recipients: recipients.map((r) => r.userId),
    thread: { kind: mine.thread.kind, name: mine.thread.name },
  };
}

/** ลบข้อความของตัวเอง (soft · แสดง "ข้อความถูกลบ") */
export async function deleteMessage(ctx: TeamCtx, threadId: string, messageId: string): Promise<boolean> {
  const mine = await myMembership(ctx, threadId);
  if (!mine) return false;
  const r = await prisma.teamMessage.updateMany({
    where: { id: messageId, tenantId: ctx.tenantId, threadId, senderUserId: ctx.userId, kind: "TEXT", deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return r.count === 1;
}

/** อ่านถึงล่าสุด (ไม่ถอยหลัง) */
export async function markRead(ctx: TeamCtx, threadId: string, now: Date = new Date()): Promise<boolean> {
  const mine = await myMembership(ctx, threadId);
  if (!mine) return false;
  await prisma.teamThreadMember.updateMany({
    where: { id: mine.id, tenantId: ctx.tenantId, OR: [{ lastReadAt: null }, { lastReadAt: { lt: now } }] },
    data: { lastReadAt: now },
  });
  return true;
}

export async function setMuted(ctx: TeamCtx, threadId: string, muted: boolean): Promise<boolean> {
  const mine = await myMembership(ctx, threadId);
  if (!mine) return false;
  await prisma.teamThreadMember.updateMany({ where: { id: mine.id, tenantId: ctx.tenantId }, data: { muted: !!muted } });
  return true;
}

/** ไฟล์ที่ผู้เรียกเห็นได้ในห้องนี้ (ไฟล์ในข้อความหลัง joinedAt ที่ยังไม่ลบ หรือรูปกลุ่ม) — null = 404 */
export async function visibleFile(ctx: TeamCtx, threadId: string, fileId: string): Promise<SecAttachment | null> {
  const mine = await myMembership(ctx, threadId);
  if (!mine || !fileId) return null;
  if (mine.thread.photoFileId === fileId) return { fileId, name: "group-photo", mimeType: "", size: 0, kind: "image" };
  const msg = await prisma.teamMessage.findFirst({
    where: { tenantId: ctx.tenantId, threadId, createdAt: { gte: mine.joinedAt }, deletedAt: null, attachments: { array_contains: [{ fileId }] } },
    select: { attachments: true },
  });
  return msg ? (attachmentsOf(msg.attachments).find((a) => a.fileId === fileId) ?? null) : null;
}

// ───────── จัดการกลุ่ม ─────────

async function adminOf(ctx: TeamCtx, threadId: string) {
  const mine = await myMembership(ctx, threadId);
  if (!mine) return { ok: false as const, fail: failT("not_found", MSG.notFound) };
  if (mine.thread.kind !== "GROUP") return { ok: false as const, fail: failT("invalid", MSG.directOnly) };
  if (mine.role !== "ADMIN") return { ok: false as const, fail: failT("forbidden", MSG.adminOnly) };
  return { ok: true as const, mine };
}

export async function updateGroup(ctx: TeamCtx, threadId: string, input: { name?: string; photoFileId?: string | null }): Promise<{ ok: true } | TeamFail> {
  const a = await adminOf(ctx, threadId);
  if (!a.ok) return a.fail;
  const data: { name?: string; photoFileId?: string | null } = {};
  if (input.name !== undefined) {
    const n = cleanName(input.name);
    if (!n) return failT("invalid", MSG.groupName);
    data.name = n;
  }
  if (input.photoFileId !== undefined) {
    if (input.photoFileId && !(await ownImage(ctx, input.photoFileId))) return failT("invalid", MSG.attachGone);
    data.photoFileId = input.photoFileId || null;
  }
  if (Object.keys(data).length === 0) return { ok: true };
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.teamThread.updateMany({ where: { id: threadId, tenantId: ctx.tenantId }, data });
    if (data.name && data.name !== a.mine.thread.name) await systemLine(tx, ctx.tenantId, threadId, ctx.userId, `เปลี่ยนชื่อกลุ่มเป็น “${data.name}”`, now);
  });
  return { ok: true };
}

export async function addGroupMembers(ctx: TeamCtx, threadId: string, userIds: string[]): Promise<{ ok: true; added: number } | TeamFail> {
  const a = await adminOf(ctx, threadId);
  if (!a.ok) return a.fail;
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).filter((u) => typeof u === "string" && u && u !== ctx.userId))];
  if (ids.length === 0) return failT("invalid", MSG.groupMembers);
  const people = await activeMembers(ctx.tenantId, ids);
  if (people.length !== ids.length) return failT("invalid", MSG.notTeamMember);
  const count = await prisma.teamThreadMember.count({ where: { tenantId: ctx.tenantId, threadId, leftAt: null } });
  if (count + ids.length > TEAM_GROUP_MAX_MEMBERS) return failT("invalid", `กลุ่มมีสมาชิกได้ไม่เกิน ${TEAM_GROUP_MAX_MEMBERS} คน`);
  const now = new Date();
  let added = 0;
  await prisma.$transaction(async (tx) => {
    for (const p of people) {
      const cur = await tx.teamThreadMember.findUnique({ where: { threadId_userId: { threadId, userId: p.userId } } });
      if (cur && !cur.leftAt) continue;
      if (cur) await tx.teamThreadMember.update({ where: { id: cur.id }, data: { leftAt: null, joinedAt: now, lastReadAt: null, role: "MEMBER", muted: false } });
      else await tx.teamThreadMember.create({ data: { tenantId: ctx.tenantId, threadId, userId: p.userId, joinedAt: now } });
      added++;
      await systemLine(tx, ctx.tenantId, threadId, ctx.userId, `เพิ่ม ${p.name} เข้ากลุ่ม`, now);
    }
  });
  return { ok: true, added };
}

/** ผู้ดูแลคนสุดท้ายออก ⇒ ยกคนที่อยู่นานสุดเป็นผู้ดูแล */
async function ensureAdmin(tx: Prisma.TransactionClient, tenantId: string, threadId: string): Promise<void> {
  const admins = await tx.teamThreadMember.count({ where: { tenantId, threadId, leftAt: null, role: "ADMIN" } });
  if (admins > 0) return;
  const next = await tx.teamThreadMember.findFirst({ where: { tenantId, threadId, leftAt: null }, orderBy: { joinedAt: "asc" } });
  if (next) await tx.teamThreadMember.update({ where: { id: next.id }, data: { role: "ADMIN" } });
}

export async function removeGroupMember(ctx: TeamCtx, threadId: string, userId: string): Promise<{ ok: true } | TeamFail> {
  if (userId === ctx.userId) return leaveGroup(ctx, threadId);
  const a = await adminOf(ctx, threadId);
  if (!a.ok) return a.fail;
  const target = await prisma.teamThreadMember.findFirst({ where: { tenantId: ctx.tenantId, threadId, userId, leftAt: null } });
  if (!target) return failT("not_found", "คนนี้ไม่ได้อยู่ในกลุ่มแล้ว");
  const [u] = await activeMembers(ctx.tenantId, [userId]);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.teamThreadMember.update({ where: { id: target.id }, data: { leftAt: now, role: "MEMBER" } });
    await systemLine(tx, ctx.tenantId, threadId, ctx.userId, `เอา ${u?.name ?? "สมาชิก"} ออกจากกลุ่ม`, now);
  });
  return { ok: true };
}

export async function setGroupAdmin(ctx: TeamCtx, threadId: string, userId: string, admin: boolean): Promise<{ ok: true } | TeamFail> {
  const a = await adminOf(ctx, threadId);
  if (!a.ok) return a.fail;
  const target = await prisma.teamThreadMember.findFirst({ where: { tenantId: ctx.tenantId, threadId, userId, leftAt: null } });
  if (!target) return failT("not_found", "คนนี้ไม่ได้อยู่ในกลุ่มแล้ว");
  await prisma.$transaction(async (tx) => {
    await tx.teamThreadMember.update({ where: { id: target.id }, data: { role: admin ? "ADMIN" : "MEMBER" } });
    await ensureAdmin(tx, ctx.tenantId, threadId);
  });
  return { ok: true };
}

export async function leaveGroup(ctx: TeamCtx, threadId: string): Promise<{ ok: true } | TeamFail> {
  const mine = await myMembership(ctx, threadId);
  if (!mine) return failT("not_found", MSG.notFound);
  if (mine.thread.kind !== "GROUP") return failT("invalid", MSG.directOnly);
  const me = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true, email: true } });
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.teamThreadMember.update({ where: { id: mine.id }, data: { leftAt: now, role: "MEMBER" } });
    await systemLine(tx, ctx.tenantId, threadId, ctx.userId, `${displayNameOf(me)} ออกจากกลุ่ม`, now);
    await ensureAdmin(tx, ctx.tenantId, threadId);
  });
  return { ok: true };
}

// ───────── เพิ่มคนด้วยเบอร์ ─────────

async function auditTeam(tenantId: string, actorId: string, action: string, targetId: string, after: Record<string, unknown>): Promise<void> {
  try {
    await prisma.auditLog.create({ data: { tenantId, actorType: "USER", actorId, action, targetType: "TeamMember", targetId, after: after as Prisma.InputJsonValue } });
  } catch {
    /* audit ล้มห้ามพางานหลัก */
  }
}

async function managerOf(ctx: TeamCtx): Promise<boolean> {
  const m = await actorMembership(ctx);
  return !!m && (m.role === "OWNER" || m.role === "MANAGER");
}

/** เพดานรายวันของการค้นเบอร์ (ต่อผู้ค้น + ต่อร้าน) — fail-closed เมื่อตัวจำกัดตอบไม่ครบ */
async function lookupRateOk(ctx: TeamCtx, now: Date): Promise<boolean> {
  const r = await checkRateLimitDbMany(
    [
      { key: `team-lookup:u:${ctx.tenantId}:${ctx.userId}`, limit: TEAM_LOOKUP_PER_USER_DAY, windowMs: DAY_MS },
      { key: `team-lookup:t:${ctx.tenantId}`, limit: TEAM_LOOKUP_PER_TENANT_DAY, windowMs: DAY_MS },
    ],
    { now: now.getTime() },
  );
  return r.length === 2 && r.every((x) => x.ok && typeof x.count === "number");
}

export type LookupResult =
  | { ok: true; found: false }
  | { ok: true; found: true; name: string; member: boolean; invited: boolean };

/**
 * ค้นผู้ใช้ Lekaa ด้วยเบอร์ (เฉพาะเบอร์ที่ยืนยันแล้ว) — คืนชื่อแสดงอย่างเดียว (ไม่มี id/อีเมล/เบอร์)
 *   member = อยู่ในทีมนี้แล้ว · invited = มีคำเชิญค้างอยู่
 */
export async function lookupPhone(ctx: TeamCtx, rawPhone: string, now: Date = new Date()): Promise<LookupResult | TeamFail> {
  if (!(await managerOf(ctx))) return failT("forbidden", MSG.forbidden);
  const phone = normalizeThaiMobile(rawPhone);
  if (!phone) return failT("invalid", MSG.badPhone);
  if (!(await lookupRateOk(ctx, now))) return failT("rate_limited", MSG.rateLimited);
  const holder = await prisma.userPhone.findUnique({ where: { phone }, select: { userId: true, verifiedAt: true, user: { select: { name: true, email: true } } } });
  const found = !!holder?.verifiedAt;
  await auditTeam(ctx.tenantId, ctx.userId, "team.phone.lookup", found ? holder!.userId : "none", { found, phoneHash: sha256(`team-lookup:${phone}`).slice(0, 16) });
  if (!found || !holder) return { ok: true, found: false };
  const [mem, inv] = await Promise.all([
    prisma.membership.findFirst({ where: { tenantId: ctx.tenantId, userId: holder.userId, acceptedAt: { not: null } }, select: { id: true } }),
    prisma.staffInvite.findFirst({ where: { tenantId: ctx.tenantId, phone, acceptedAt: null, expiresAt: { gt: now } }, select: { id: true } }),
  ]);
  return { ok: true, found: true, name: displayNameOf(holder.user), member: !!mem, invited: !!inv };
}

/**
 * เพิ่มเข้าทีม = คำเชิญ "คุยอย่างเดียว" (STAFF · ไม่มีสิทธิ์ระบบ · ไม่มีสาขา) ถึงผู้ใช้ Lekaa เดิม — ไม่ส่ง SMS · คืน userId ให้ route แจ้ง push
 *   อีกฝ่ายต้องกดรับ (pendingInvitesForUser → acceptInvite) ก่อนจะเป็นสมาชิก
 */
export async function addByPhone(
  ctx: TeamCtx,
  rawPhone: string,
  now: Date = new Date(),
): Promise<{ ok: true; inviteId: string; inviteeUserId: string; name: string; expiresAt: Date } | TeamFail> {
  const actor = await actorMembership(ctx);
  if (!actor || (actor.role !== "OWNER" && actor.role !== "MANAGER")) return failT("forbidden", MSG.forbidden);
  const phone = normalizeThaiMobile(rawPhone);
  if (!phone) return failT("invalid", MSG.badPhone);
  const holder = await prisma.userPhone.findUnique({ where: { phone }, select: { userId: true, verifiedAt: true, user: { select: { name: true, email: true } } } });
  if (!holder?.verifiedAt) return failT("not_lekaa", MSG.notLekaa);
  const name = displayNameOf(holder.user);
  const { inviteStaff } = await import("@/lib/staff/invite");
  const r = await inviteStaff(
    { tenantId: ctx.tenantId, actorUserId: ctx.userId, membership: { role: actor.role, unitAccess: [], permissions: jsonObj(actor.permissions) } },
    { name, phone, role: "STAFF", unitIds: [], permissions: {} },
    now,
    { channel: "app" },
  );
  if (!r.ok) {
    const reason: TeamFailReason =
      r.reason === "already_member" ? "already_member" : r.reason === "already_invited" ? "already_invited" : r.reason === "forbidden" ? "forbidden" : r.reason === "rate_limited" || r.reason === "throttled" ? "rate_limited" : "conflict";
    return failT(reason, r.message);
  }
  await auditTeam(ctx.tenantId, ctx.userId, "team.member.invite", holder.userId, { inviteId: r.inviteId, role: "CHAT_ONLY" });
  return { ok: true, inviteId: r.inviteId, inviteeUserId: holder.userId, name, expiresAt: r.expiresAt };
}
