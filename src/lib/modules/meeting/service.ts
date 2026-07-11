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
