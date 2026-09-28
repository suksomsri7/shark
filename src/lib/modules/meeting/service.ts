import { prisma } from "@/lib/core/db";
import type { MeetingChannelKind } from "@prisma/client";

// Meeting — แชทภายในองค์กร (Slack-like). scope ตาม systemId (workspace = AppSystem MEETING)
// คู่สนทนา = staff (User ใน tenant). query ทุกตัวผูก tenantId + systemId ตรง ๆ

// ───────────────────────── Staff (สมาชิก workspace) ─────────────────────────

export type Staff = { userId: string; name: string; email: string };

// staff ทั้งหมดของ tenant (ผู้ที่มี Membership ยอมรับแล้ว) — ใช้ทำ member picker + resolve ชื่อผู้เขียน
export async function listStaff(tenantId: string): Promise<Staff[]> {
  const rows = await prisma.membership.findMany({
    where: { tenantId, acceptedAt: { not: null } },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  const seen = new Set<string>();
  const out: Staff[] = [];
  for (const m of rows) {
    if (seen.has(m.userId)) continue;
    seen.add(m.userId);
    out.push({ userId: m.userId, name: m.user.name ?? m.user.email, email: m.user.email });
  }
  return out;
}

// ───────────────────────── Workspace bootstrap ─────────────────────────

// รับประกันว่ามี #general + ผู้ใช้ปัจจุบันเป็นสมาชิก (สร้าง lazy ตอนเปิดครั้งแรก)
export async function ensureWorkspace(
  tenantId: string,
  systemId: string,
  userId: string,
): Promise<{ id: string }> {
  let general = await prisma.meetingChannel.findFirst({
    where: { tenantId, systemId, isDefault: true },
  });
  if (!general) {
    try {
      general = await prisma.meetingChannel.create({
        data: {
          tenantId,
          systemId,
          name: "general",
          kind: "PUBLIC",
          topic: "ห้องรวมของทั้งทีม",
          isDefault: true,
          createdByUserId: userId,
        },
      });
    } catch {
      // แข่งสร้างพร้อมกัน → มีคนสร้างไปแล้ว
      general = await prisma.meetingChannel.findFirst({
        where: { tenantId, systemId, isDefault: true },
      });
    }
  }
  if (!general) throw new Error("สร้างห้อง #general ไม่สำเร็จ");
  await joinChannel(tenantId, systemId, general.id, userId);
  return { id: general.id };
}

// ───────────────────────── Channel CRUD ─────────────────────────

// ห้องที่ user เห็น: ห้องที่ตนเป็นสมาชิก + ห้อง PUBLIC ทั้งหมด (ไว้ browse/join) — ไม่รวมที่ archive
export async function listVisibleChannels(tenantId: string, systemId: string, userId: string) {
  const memberships = await prisma.meetingChannelMember.findMany({
    where: { systemId, userId, leftAt: null },
    select: { channelId: true, isAdmin: true },
  });
  const memberIds = new Set(memberships.map((m) => m.channelId));
  const adminIds = new Set(memberships.filter((m) => m.isAdmin).map((m) => m.channelId));

  const channels = await prisma.meetingChannel.findMany({
    where: {
      tenantId,
      systemId,
      archivedAt: null,
      OR: [{ id: { in: [...memberIds] } }, { kind: "PUBLIC" }],
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  // นับสมาชิก active ต่อห้อง (แยก query — เลี่ยง filtered relation count)
  const counts = await prisma.meetingChannelMember.groupBy({
    by: ["channelId"],
    where: { systemId, channelId: { in: channels.map((c) => c.id) }, leftAt: null },
    _count: { _all: true },
  });
  const countMap = new Map(counts.map((c) => [c.channelId, c._count._all]));

  return channels.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    topic: c.topic,
    isDefault: c.isDefault,
    memberCount: countMap.get(c.id) ?? 0,
    isMember: memberIds.has(c.id),
    isAdmin: adminIds.has(c.id),
  }));
}

export async function getChannel(tenantId: string, systemId: string, channelId: string) {
  return prisma.meetingChannel.findFirst({ where: { id: channelId, tenantId, systemId } });
}

export async function isChannelMember(channelId: string, userId: string): Promise<boolean> {
  const m = await prisma.meetingChannelMember.findUnique({
    where: { channelId_userId: { channelId, userId } },
  });
  return !!m && m.leftAt === null;
}

export async function listChannelMembers(systemId: string, channelId: string) {
  return prisma.meetingChannelMember.findMany({
    where: { systemId, channelId, leftAt: null },
    orderBy: { joinedAt: "asc" },
  });
}

// สร้างห้อง — ผู้สร้างเป็นสมาชิก + admin
export async function createChannel(input: {
  tenantId: string;
  systemId: string;
  name: string;
  kind: MeetingChannelKind;
  topic?: string | null;
  createdByUserId: string;
}): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const name = input.name.trim().replace(/^#/, "");
  if (name.length < 1) return { ok: false, reason: "ตั้งชื่อห้องอย่างน้อย 1 ตัวอักษร" };
  const dup = await prisma.meetingChannel.findFirst({
    where: { systemId: input.systemId, name },
  });
  if (dup) return { ok: false, reason: "มีห้องชื่อนี้แล้ว" };
  try {
    const channel = await prisma.meetingChannel.create({
      data: {
        tenantId: input.tenantId,
        systemId: input.systemId,
        name,
        kind: input.kind,
        topic: input.topic?.trim() || null,
        createdByUserId: input.createdByUserId,
      },
    });
    await prisma.meetingChannelMember.create({
      data: {
        tenantId: input.tenantId,
        systemId: input.systemId,
        channelId: channel.id,
        userId: input.createdByUserId,
        isAdmin: true,
      },
    });
    return { ok: true, id: channel.id };
  } catch {
    return { ok: false, reason: "สร้างห้องไม่สำเร็จ" };
  }
}

// join (idempotent) — re-join ล้าง leftAt
export async function joinChannel(
  tenantId: string,
  systemId: string,
  channelId: string,
  userId: string,
): Promise<void> {
  await prisma.meetingChannelMember.upsert({
    where: { channelId_userId: { channelId, userId } },
    create: { tenantId, systemId, channelId, userId },
    update: { leftAt: null },
  });
}

// เชิญ staff เข้าห้อง (idempotent) — ผู้ช่วยจัดการห้อง
// policy: ผู้เชิญต้องเป็นสมาชิก active + isAdmin ของห้อง
//   fallback (conservative): ถ้าห้องไม่มี admin active เลย (legacy ก่อนมีระบบ admin) → ผู้สร้างห้องเชิญได้
//   target ต้องเป็น staff ของ tenant (Membership acceptedAt != null)
//   กันเชิญซ้ำ: มี member active อยู่แล้ว → no-op · เคย leftAt → re-join (ล้าง leftAt)
export async function addChannelMember(
  systemId: string,
  channelId: string,
  byUserId: string,
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const channel = await prisma.meetingChannel.findFirst({ where: { id: channelId, systemId } });
  if (!channel) return { ok: false, reason: "ไม่พบห้อง" };
  if (channel.archivedAt) return { ok: false, reason: "ห้องนี้ถูกเก็บถาวรแล้ว" };

  // ผู้เชิญต้องเป็นสมาชิก active
  const inviter = await prisma.meetingChannelMember.findUnique({
    where: { channelId_userId: { channelId, userId: byUserId } },
  });
  if (!inviter || inviter.leftAt !== null) return { ok: false, reason: "คุณไม่ได้อยู่ในห้องนี้" };

  // authorize — แอดมินห้องเชิญได้เสมอ · ถ้าห้องไม่มีแอดมิน active เลย (legacy) → ผู้สร้างห้องเชิญได้
  let authorized = inviter.isAdmin;
  if (!authorized) {
    const adminCount = await prisma.meetingChannelMember.count({
      where: { channelId, leftAt: null, isAdmin: true },
    });
    authorized = adminCount === 0 && channel.createdByUserId === byUserId;
  }
  if (!authorized) return { ok: false, reason: "เฉพาะแอดมินห้องเชิญสมาชิกได้" };

  // target ต้องเป็น staff ของ tenant (Membership ยอมรับแล้ว)
  const staff = await prisma.membership.findFirst({
    where: { tenantId: channel.tenantId, userId: targetUserId, acceptedAt: { not: null } },
  });
  if (!staff) return { ok: false, reason: "ผู้ถูกเชิญไม่ใช่พนักงานในร้าน" };

  // idempotent — active อยู่แล้ว → no-op · เคยออก → re-join
  const existing = await prisma.meetingChannelMember.findUnique({
    where: { channelId_userId: { channelId, userId: targetUserId } },
  });
  if (existing) {
    if (existing.leftAt === null) return { ok: true };
    await prisma.meetingChannelMember.update({
      where: { channelId_userId: { channelId, userId: targetUserId } },
      data: { leftAt: null },
    });
    return { ok: true };
  }
  await prisma.meetingChannelMember.create({
    data: { tenantId: channel.tenantId, systemId, channelId, userId: targetUserId },
  });
  return { ok: true };
}

// leave — #general ออกไม่ได้
export async function leaveChannel(
  systemId: string,
  channelId: string,
  userId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const channel = await prisma.meetingChannel.findFirst({ where: { id: channelId, systemId } });
  if (!channel) return { ok: false, reason: "ไม่พบห้อง" };
  if (channel.isDefault) return { ok: false, reason: "ออกจากห้อง #general ไม่ได้" };
  await prisma.meetingChannelMember.updateMany({
    where: { channelId, userId, leftAt: null },
    data: { leftAt: new Date() },
  });
  return { ok: true };
}

// archive ห้อง (แทนการลบ — ประวัติถาวร) — #general archive ไม่ได้
export async function archiveChannel(
  systemId: string,
  channelId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const channel = await prisma.meetingChannel.findFirst({ where: { id: channelId, systemId } });
  if (!channel) return { ok: false, reason: "ไม่พบห้อง" };
  if (channel.isDefault) return { ok: false, reason: "เก็บถาวรห้อง #general ไม่ได้" };
  await prisma.meetingChannel.update({
    where: { id: channelId },
    data: { archivedAt: new Date() },
  });
  return { ok: true };
}

// ───────────────────────── Messages ─────────────────────────

// ข้อความในห้อง (main pane = ไม่มี threadParent) เรียงเก่า→ใหม่, เอา 50 ล่าสุด
export async function listMessages(systemId: string, channelId: string, limit = 50) {
  const rows = await prisma.meetingMessage.findMany({
    where: { systemId, channelId, threadParentId: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });
  return rows.reverse();
}

// reply ในเธรด (parent + ทั้งหมด) เรียงเก่า→ใหม่
export async function listThread(systemId: string, threadParentId: string) {
  const [parent, replies] = await Promise.all([
    prisma.meetingMessage.findFirst({ where: { id: threadParentId, systemId } }),
    prisma.meetingMessage.findMany({
      where: { systemId, threadParentId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);
  return { parent, replies };
}

// โพสต์ข้อความ (หรือ reply ถ้ามี threadParentId) — ต้องตรวจสมาชิกก่อนเรียก
export async function postMessage(input: {
  tenantId: string;
  systemId: string;
  channelId: string;
  authorUserId: string;
  body: string;
  threadParentId?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const body = input.body.trim();
  if (body.length < 1) return { ok: false, reason: "ข้อความว่าง" };
  if (body.length > 8000) return { ok: false, reason: "ข้อความยาวเกิน 8,000 ตัวอักษร" };

  const channel = await prisma.meetingChannel.findFirst({
    where: { id: input.channelId, tenantId: input.tenantId, systemId: input.systemId },
  });
  if (!channel) return { ok: false, reason: "ไม่พบห้อง" };
  if (channel.archivedAt) return { ok: false, reason: "ห้องนี้ถูกเก็บถาวรแล้ว" };

  const parentId = input.threadParentId || null;
  const msg = await prisma.$transaction(async (tx) => {
    const created = await tx.meetingMessage.create({
      data: {
        tenantId: input.tenantId,
        systemId: input.systemId,
        channelId: input.channelId,
        authorUserId: input.authorUserId,
        body,
        threadParentId: parentId,
      },
    });
    if (parentId) {
      await tx.meetingMessage.update({
        where: { id: parentId },
        data: { replyCount: { increment: 1 } },
      });
    }
    await tx.meetingChannel.update({
      where: { id: input.channelId },
      data: { lastMessageAt: created.createdAt },
    });
    return created;
  });
  return { ok: true, id: msg.id };
}

// แก้ข้อความตัวเอง → ป้าย "แก้ไขแล้ว"
export async function editMessage(input: {
  systemId: string;
  messageId: string;
  userId: string;
  body: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const body = input.body.trim();
  if (body.length < 1) return { ok: false, reason: "ข้อความว่าง" };
  const msg = await prisma.meetingMessage.findFirst({
    where: { id: input.messageId, systemId: input.systemId },
  });
  if (!msg) return { ok: false, reason: "ไม่พบข้อความ" };
  if (msg.deletedAt) return { ok: false, reason: "ข้อความถูกลบแล้ว" };
  if (msg.authorUserId !== input.userId) return { ok: false, reason: "แก้ได้เฉพาะข้อความตัวเอง" };
  await prisma.meetingMessage.update({
    where: { id: input.messageId },
    data: { body, editedAt: new Date() },
  });
  return { ok: true };
}

// ลบข้อความ (soft) — เจ้าของ หรือ admin ของห้อง
export async function deleteMessage(input: {
  systemId: string;
  messageId: string;
  userId: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const msg = await prisma.meetingMessage.findFirst({
    where: { id: input.messageId, systemId: input.systemId },
  });
  if (!msg) return { ok: false, reason: "ไม่พบข้อความ" };
  if (msg.deletedAt) return { ok: true };
  let allowed = msg.authorUserId === input.userId;
  if (!allowed) {
    const membership = await prisma.meetingChannelMember.findUnique({
      where: { channelId_userId: { channelId: msg.channelId, userId: input.userId } },
    });
    allowed = !!membership && membership.leftAt === null && membership.isAdmin;
  }
  if (!allowed) return { ok: false, reason: "ลบได้เฉพาะข้อความตัวเอง หรือแอดมินห้อง" };
  await prisma.meetingMessage.update({
    where: { id: input.messageId },
    data: { deletedAt: new Date() },
  });
  return { ok: true };
}

// ───────────────────────── CRM C3.4 ▸ ข้อความจาก "ระบบ" (ห้องทีมขาย) ─────────────────────────
//
// ใบ CRM v2 C3.4 (addendum ข้อ 3): CRM โพสต์แจ้ง "ปิดดีลได้ · lead ร้อน · สรุปดีลนิ่งรายวัน" เข้าห้องของทีม
// 🔴 ผู้เขียน = ค่าคงที่ที่ขึ้นต้นด้วย `system:` เสมอ (`MeetingMessage.authorUserId` เป็นสตริงธรรมดา) — ไม่มีวันเป็น id ของคนจริง
//    ⇒ ไม่มีใครแก้/ลบในนามคนอื่นได้ (editMessage เทียบ authorUserId กับผู้ใช้) · หน้าห้องแสดงเป็น "ระบบ CRM"
// 🔴 ปฏิเสธ (ไม่ throw) เมื่อห้องไม่ใช่ของร้าน/ระบบนั้น · ระบบไม่ใช่ MEETING · ห้องถูกเก็บถาวร — ผู้เรียก (ตัวรับ event) ต้องไม่ล้ม
// 🔴 รับ `tx` ของผู้เรียกได้: CRM ปักธงกันซ้ำ + โพสต์ใน tx เดียวกัน ⇒ โพสต์ล้ม = ธงหายไปด้วย (รอบหลังโพสต์ใหม่ได้ครั้งเดียว)
export const MEETING_SYSTEM_AUTHOR_PREFIX = "system:";

type SystemPostDb = Pick<typeof prisma, "appSystem" | "meetingChannel" | "meetingMessage">;

export async function postSystemMessage(
  input: { tenantId: string; systemId: string; channelId: string; body: string; author?: string | null },
  tx?: SystemPostDb,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const db = tx ?? prisma;
  const body = String(input?.body ?? "").trim();
  if (!body) return { ok: false, reason: "EMPTY" };
  if (body.length > 8000) return { ok: false, reason: "TOO_LONG" };
  const author =
    typeof input.author === "string" && input.author.startsWith(MEETING_SYSTEM_AUTHOR_PREFIX) && input.author.length <= 60
      ? input.author
      : `${MEETING_SYSTEM_AUTHOR_PREFIX}crm`;
  const tenantId = String(input?.tenantId ?? "");
  const systemId = String(input?.systemId ?? "");
  const channelId = String(input?.channelId ?? "");
  if (!tenantId || !systemId || !channelId) return { ok: false, reason: "CHANNEL_NOT_FOUND" };
  const sys = await db.appSystem.findFirst({ where: { id: systemId, tenantId, type: "MEETING" }, select: { id: true } });
  if (!sys) return { ok: false, reason: "SYSTEM_NOT_FOUND" };
  const channel = await db.meetingChannel.findFirst({ where: { id: channelId, tenantId, systemId }, select: { id: true, archivedAt: true } });
  if (!channel) return { ok: false, reason: "CHANNEL_NOT_FOUND" };
  if (channel.archivedAt) return { ok: false, reason: "CHANNEL_ARCHIVED" };
  const created = await db.meetingMessage.create({ data: { tenantId, systemId, channelId, authorUserId: author, body } });
  await db.meetingChannel.update({ where: { id: channelId }, data: { lastMessageAt: created.createdAt } });
  return { ok: true, id: created.id };
}

/**
 * CRM C5.4-B ▸ hunter H3(d): ลบข้อมูลส่วนบุคคล (PDPA) — ข้อความ "ของระบบ" (ผู้เขียนขึ้นต้น `system:`) ของร้านนี้ที่มีคำระบุตัว ถูกแทนด้วย `mask`
 * (แถวคงอยู่ · ข้อความของคนจริงไม่ถูกแตะ — ผู้เขียนเป็นเจ้าของ) · ใน tx ของผู้เรียก · คืนจำนวนแถวที่เปลี่ยน
 */
export async function maskSystemMessagesInTx(tx: Pick<typeof prisma, "$executeRaw">, tenantId: string, tokens: readonly string[], mask: string): Promise<number> {
  let n = 0;
  if (!tenantId) return 0;
  for (const tk of tokens) {
    if (!tk || tk.length < 4) continue;
    n += Number(
      await tx.$executeRaw`UPDATE "MeetingMessage" SET "body" = replace("body", ${tk}, ${mask})
                            WHERE "tenantId" = ${tenantId} AND "authorUserId" LIKE ${`${MEETING_SYSTEM_AUTHOR_PREFIX}%`} AND strpos("body", ${tk}) > 0`,
    );
  }
  return n;
}

/**
 * ห้องที่ "ผู้ดู" เลือกเป็นห้องของทีมได้ (ตัวเลือกบนหน้าตั้งค่า CRM) — ห้องที่ยังไม่เก็บถาวรของทุกระบบ MEETING ในร้านนี้
 * 🔴 รีวิว C3.4 S1: การมองเห็นเดียวกับ `listVisibleChannels` — ห้อง PUBLIC หรือห้องที่ผู้ดูเป็นสมาชิกอยู่ (ยังไม่ออก)
 *    ⇒ ห้อง PRIVATE ที่ผู้ดูไม่ได้อยู่ ไม่โผล่ในตัวเลือก และผูกไม่ได้ (ผู้เรียกตรวจกับชุดเดียวกันนี้)
 */
export async function listRoomOptions(tenantId: string, viewerUserId: string): Promise<{ meetingSystemId: string; systemName: string; channelId: string; channelName: string }[]> {
  if (!viewerUserId) return [];
  const systems = await prisma.appSystem.findMany({ where: { tenantId, type: "MEETING" }, select: { id: true, name: true }, orderBy: { createdAt: "asc" }, take: 20 });
  if (systems.length === 0) return [];
  const names = new Map(systems.map((s) => [s.id, s.name]));
  const mine = await prisma.meetingChannelMember.findMany({
    where: { systemId: { in: systems.map((s) => s.id) }, userId: viewerUserId, leftAt: null },
    select: { channelId: true },
  });
  const rows = await prisma.meetingChannel.findMany({
    where: {
      tenantId,
      systemId: { in: systems.map((s) => s.id) },
      archivedAt: null,
      OR: [{ kind: "PUBLIC" }, { id: { in: mine.map((m) => m.channelId) } }],
    },
    select: { id: true, name: true, systemId: true },
    orderBy: [{ systemId: "asc" }, { name: "asc" }],
    take: 500,
  });
  return rows.map((r) => ({ meetingSystemId: r.systemId, systemName: names.get(r.systemId) ?? "", channelId: r.id, channelName: r.name }));
}
/**
 * รีวิว C3.4 รอบ 2 N2: ห้องไหนใน `ids` ที่ "ยังใช้งานอยู่" (ของร้านนี้ · ระบบ MEETING · ไม่เก็บถาวร) — คืนแค่ id (ไม่มีชื่อห้อง)
 * ให้หน้าตั้งค่า CRM บอกได้ว่าการผูกเดิมชี้ห้องที่ผู้ดู "มองไม่เห็น แต่ยังใช้อยู่" ต่างจาก "ถูกเก็บ/ลบ" โดยไม่เปิดเผยชื่อห้องส่วนตัว
 */
export async function liveChannelIds(tenantId: string, ids: string[]): Promise<string[]> {
  const list = [...new Set(ids.filter((x) => typeof x === "string" && x))].slice(0, 500);
  if (!tenantId || list.length === 0) return [];
  const rows = await prisma.meetingChannel.findMany({ where: { tenantId, id: { in: list }, archivedAt: null }, select: { id: true, systemId: true } });
  if (rows.length === 0) return [];
  const systems = await prisma.appSystem.findMany({ where: { tenantId, type: "MEETING", id: { in: [...new Set(rows.map((r) => r.systemId))] } }, select: { id: true } });
  const ok = new Set(systems.map((x) => x.id));
  return rows.filter((r) => ok.has(r.systemId)).map((r) => r.id);
}
// ◂ CRM C3.4
