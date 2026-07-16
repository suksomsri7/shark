"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import {
  sendReply,
  setStatus,
  assign,
  markRead,
  linkCustomer,
  connectLine,
  setConnectionStatus,
  setMemberSystem,
} from "./service";

// ทุก action: requireTenant + revalidate หน้า chat ของระบบนั้น

// ตรวจสิทธิ์โมดูล (system-scoped) — OWNER/MANAGER ผ่าน · STAFF ตาม permission
// หมายเหตุ: scope conversation ระดับ unit ยังบังคับผ่าน unitAccess ใน service (คงเดิม)
function assertChatCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "chat", action },
  );
}

function chatPath(systemId: string, conversationId?: string) {
  return conversationId
    ? `/app/sys/${systemId}/chat?c=${conversationId}`
    : `/app/sys/${systemId}/chat`;
}

function revalidateChat(systemId: string) {
  revalidatePath(`/app/sys/${systemId}/chat`);
  revalidatePath(`/app/sys/${systemId}`);
}

// ── ส่งข้อความ / โน้ตภายใน ──
export async function sendReplyAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.message.send");
  const systemId = String(formData.get("systemId") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "");
  const body = String(formData.get("body") ?? "");
  const isInternal = String(formData.get("isInternal") ?? "") === "on";
  if (systemId && conversationId && body.trim()) {
    const unitAccess = auth.active.unitAccess as string[];
    await sendReply({
      tenantId: auth.active.tenantId,
      systemId,
      conversationId,
      senderUserId: auth.user.id,
      body,
      isInternal,
      unitAccess,
    });
    await markRead({
      tenantId: auth.active.tenantId,
      systemId,
      conversationId,
      userId: auth.user.id,
      unitAccess,
    });
  }
  revalidateChat(systemId);
  redirect(chatPath(systemId, conversationId));
}

// ── เปลี่ยนสถานะ (ปิด=RESOLVED / พัก=PENDING / เปิด=OPEN) ──
export async function setStatusAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.conversation.setStatus");
  const systemId = String(formData.get("systemId") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "");
  const status = String(formData.get("status") ?? "") as "OPEN" | "PENDING" | "RESOLVED";
  if (systemId && conversationId && ["OPEN", "PENDING", "RESOLVED"].includes(status)) {
    await setStatus({
      tenantId: auth.active.tenantId,
      systemId,
      conversationId,
      status,
      actorUserId: auth.user.id,
      unitAccess: auth.active.unitAccess as string[],
    });
  }
  revalidateChat(systemId);
  redirect(chatPath(systemId, conversationId));
}

// ── มอบหมาย (รับเอง / ปล่อยว่าง / เลือกคน) ──
export async function assignAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.conversation.assign");
  const systemId = String(formData.get("systemId") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "");
  const raw = String(formData.get("assigneeUserId") ?? "");
  const assigneeUserId = raw === "me" ? auth.user.id : raw === "" || raw === "none" ? null : raw;
  if (systemId && conversationId) {
    await assign({
      tenantId: auth.active.tenantId,
      systemId,
      conversationId,
      assigneeUserId,
      actorUserId: auth.user.id,
      unitAccess: auth.active.unitAccess as string[],
    });
  }
  revalidateChat(systemId);
  redirect(chatPath(systemId, conversationId));
}

// ── ทำเป็นอ่านแล้ว ──
export async function markReadAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.conversation.markRead");
  const systemId = String(formData.get("systemId") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "");
  if (systemId && conversationId) {
    await markRead({
      tenantId: auth.active.tenantId,
      systemId,
      conversationId,
      userId: auth.user.id,
      unitAccess: auth.active.unitAccess as string[],
    });
  }
  revalidateChat(systemId);
  redirect(chatPath(systemId, conversationId));
}

// ── ผูกลูกค้าเข้าสมาชิก (จากเบอร์) / ถอด ──
export async function linkCustomerAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.customer.link");
  const systemId = String(formData.get("systemId") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const phone = String(formData.get("phone") ?? "").trim();
  const unlink = String(formData.get("unlink") ?? "") === "1";
  if (systemId && contactId) {
    await linkCustomer({
      tenantId: auth.active.tenantId,
      systemId,
      contactId,
      actorUserId: auth.user.id,
      phone: unlink ? undefined : phone || undefined,
      customerId: unlink ? null : undefined,
    });
  }
  revalidateChat(systemId);
  redirect(chatPath(systemId, conversationId));
}

// ── เชื่อม LINE OA (BYOK) ──
export async function connectLineAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.connection.create");
  const systemId = String(formData.get("systemId") ?? "");
  const displayName = String(formData.get("displayName") ?? "");
  const channelAccessToken = String(formData.get("channelAccessToken") ?? "");
  const channelSecret = String(formData.get("channelSecret") ?? "");
  if (systemId && channelAccessToken && channelSecret) {
    await connectLine({
      tenantId: auth.active.tenantId,
      systemId,
      displayName,
      channelAccessToken,
      channelSecret,
    });
  }
  revalidateChat(systemId);
  redirect(chatPath(systemId));
}

// ── ถอด/ปิดช่องทาง ──
export async function disableConnectionAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.connection.disable");
  const systemId = String(formData.get("systemId") ?? "");
  const connectionId = String(formData.get("connectionId") ?? "");
  if (systemId && connectionId) {
    await setConnectionStatus(auth.active.tenantId, connectionId, "DISABLED");
  }
  revalidateChat(systemId);
  redirect(chatPath(systemId));
}

// ── เชื่อมระบบสมาชิก (opt-in) ──
export async function setMemberSystemAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.setting.setMemberSystem");
  const systemId = String(formData.get("systemId") ?? "");
  const memberSystemId = String(formData.get("memberSystemId") ?? "").trim() || null;
  if (systemId) {
    await setMemberSystem(auth.active.tenantId, systemId, memberSystemId);
  }
  revalidateChat(systemId);
  redirect(chatPath(systemId));
}
