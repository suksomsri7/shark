"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { MeetingChannelKind } from "@prisma/client";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import {
  createChannel,
  joinChannel,
  leaveChannel,
  archiveChannel,
  addChannelMember,
  postMessage,
  editMessage,
  deleteMessage,
  isChannelMember,
} from "./service";

// ทุก action: requireTenant (ดึง userId ปัจจุบัน) + revalidatePath ห้อง Meeting

// ตรวจสิทธิ์โมดูล (system-scoped) — OWNER/MANAGER ผ่าน · STAFF ตาม permission
// หมายเหตุ: scope ระดับ systemId รอ kernel Phase ถัดไป (ตอนนี้ตรวจ module+action)
function assertMeetingCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "meeting", action },
  );
}

// path หลักของ workspace ในหน้า system
function meetingPath(systemId: string, channelId?: string, threadParentId?: string) {
  const q = new URLSearchParams();
  if (channelId) q.set("c", channelId);
  if (threadParentId) q.set("t", threadParentId);
  const qs = q.toString();
  return `/app/sys/${systemId}/meeting${qs ? `?${qs}` : ""}`;
}

function revalidateMeeting(systemId: string) {
  revalidatePath(`/app/sys/${systemId}/meeting`);
  revalidatePath(`/app/sys/${systemId}`);
}

export async function createChannelAction(formData: FormData) {
  const auth = await requireTenant();
  assertMeetingCan(auth, "meeting.channel.create");
  const tenantId = auth.active.tenantId;
  const systemId = String(formData.get("systemId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const kind = (String(formData.get("kind") ?? "PUBLIC") as MeetingChannelKind) === "PRIVATE"
    ? "PRIVATE"
    : "PUBLIC";
  const topic = String(formData.get("topic") ?? "").trim();
  if (!systemId || !name) return;
  const res = await createChannel({
    tenantId,
    systemId,
    name,
    kind,
    topic: topic || null,
    createdByUserId: auth.user.id,
  });
  revalidateMeeting(systemId);
  if (res.ok) redirect(meetingPath(systemId, res.id));
}

export async function joinChannelAction(formData: FormData) {
  const auth = await requireTenant();
  assertMeetingCan(auth, "meeting.channel.join");
  const systemId = String(formData.get("systemId") ?? "");
  const channelId = String(formData.get("channelId") ?? "");
  if (systemId && channelId) {
    await joinChannel(auth.active.tenantId, systemId, channelId, auth.user.id);
  }
  revalidateMeeting(systemId);
  redirect(meetingPath(systemId, channelId));
}

export async function leaveChannelAction(formData: FormData) {
  const auth = await requireTenant();
  assertMeetingCan(auth, "meeting.channel.leave");
  const systemId = String(formData.get("systemId") ?? "");
  const channelId = String(formData.get("channelId") ?? "");
  if (systemId && channelId) await leaveChannel(systemId, channelId, auth.user.id);
  revalidateMeeting(systemId);
  redirect(meetingPath(systemId));
}

export async function addChannelMemberAction(formData: FormData) {
  const auth = await requireTenant();
  assertMeetingCan(auth, "meeting.channel.invite");
  const systemId = String(formData.get("systemId") ?? "");
  const channelId = String(formData.get("channelId") ?? "");
  const targetUserId = String(formData.get("targetUserId") ?? "");
  if (systemId && channelId && targetUserId) {
    // guard สิทธิ์ห้อง (แอดมิน/ผู้สร้าง) อยู่ใน addChannelMember
    await addChannelMember(systemId, channelId, auth.user.id, targetUserId);
  }
  revalidateMeeting(systemId);
  redirect(meetingPath(systemId, channelId));
}

export async function archiveChannelAction(formData: FormData) {
  const auth = await requireTenant();
  assertMeetingCan(auth, "meeting.channel.delete");
  const systemId = String(formData.get("systemId") ?? "");
  const channelId = String(formData.get("channelId") ?? "");
  if (systemId && channelId) {
    // เฉพาะแอดมินของห้อง
    const member = await isChannelMember(channelId, auth.user.id);
    if (member) await archiveChannel(systemId, channelId);
  }
  revalidateMeeting(systemId);
  redirect(meetingPath(systemId));
}

export async function postMessageAction(formData: FormData) {
  const auth = await requireTenant();
  assertMeetingCan(auth, "meeting.message.post");
  const tenantId = auth.active.tenantId;
  const systemId = String(formData.get("systemId") ?? "");
  const channelId = String(formData.get("channelId") ?? "");
  const body = String(formData.get("body") ?? "");
  const threadParentId = String(formData.get("threadParentId") ?? "").trim() || null;
  if (!systemId || !channelId || !body.trim()) return;
  // ต้องเป็นสมาชิกห้องก่อนถึงโพสต์ได้
  const member = await isChannelMember(channelId, auth.user.id);
  if (member) {
    await postMessage({
      tenantId,
      systemId,
      channelId,
      authorUserId: auth.user.id,
      body,
      threadParentId,
    });
  }
  revalidateMeeting(systemId);
  redirect(meetingPath(systemId, channelId, threadParentId ?? undefined));
}

export async function editMessageAction(formData: FormData) {
  const auth = await requireTenant();
  assertMeetingCan(auth, "meeting.message.edit");
  const systemId = String(formData.get("systemId") ?? "");
  const channelId = String(formData.get("channelId") ?? "");
  const messageId = String(formData.get("messageId") ?? "");
  const body = String(formData.get("body") ?? "");
  const threadParentId = String(formData.get("threadParentId") ?? "").trim() || null;
  if (systemId && messageId && body.trim()) {
    await editMessage({ systemId, messageId, userId: auth.user.id, body });
  }
  revalidateMeeting(systemId);
  redirect(meetingPath(systemId, channelId, threadParentId ?? undefined));
}

export async function deleteMessageAction(formData: FormData) {
  const auth = await requireTenant();
  assertMeetingCan(auth, "meeting.message.delete");
  const systemId = String(formData.get("systemId") ?? "");
  const channelId = String(formData.get("channelId") ?? "");
  const messageId = String(formData.get("messageId") ?? "");
  const threadParentId = String(formData.get("threadParentId") ?? "").trim() || null;
  if (systemId && messageId) {
    await deleteMessage({ systemId, messageId, userId: auth.user.id });
  }
  revalidateMeeting(systemId);
  redirect(meetingPath(systemId, channelId, threadParentId ?? undefined));
}
