"use server";

import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { aiEnabled, latestConversation, listMessages, sendMessage } from "./service";

// convention action = "ai.<entity>.<verb>" — OWNER/MANAGER ผ่าน · STAFF ต้องมี ai.chat.send หรือ ai.*
function assertAiCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "ai", action },
  );
}

export type AiChatState = {
  enabled: boolean;
  conversationId: string | null;
  messages: { id: string; role: "USER" | "ASSISTANT"; content: string }[];
};

/** โหลดสถานะแชท (บทสนทนาล่าสุด) สำหรับเปิด sheet */
export async function loadAiChatAction(): Promise<AiChatState> {
  const auth = await requireTenant();
  assertAiCan(auth, "ai.chat.send");
  const ctx = { tenantId: auth.active.tenantId };
  const conv = await latestConversation(ctx);
  const messages = conv ? await listMessages(ctx, conv.id) : [];
  return {
    enabled: aiEnabled(),
    conversationId: conv?.id ?? null,
    messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content })),
  };
}

export type SendAiResult =
  | { ok: true; conversationId: string; reply: string }
  | { ok: false; message: string };

/** ส่งข้อความหา AI — error ทุกแบบคืนข้อความไทยสุภาพ (UI แสดงตรง ๆ ได้) */
export async function sendAiMessageAction(input: {
  conversationId?: string;
  text: string;
}): Promise<SendAiResult> {
  const auth = await requireTenant();
  assertAiCan(auth, "ai.chat.send");
  try {
    const res = await sendMessage({ tenantId: auth.active.tenantId }, input);
    if (res.ok) return res;
    const msg: Record<typeof res.error, string> = {
      ai_disabled: "ผู้ช่วย AI ยังไม่เปิดใช้งานในระบบ — เร็ว ๆ นี้",
      over_budget: "วันนี้ใช้ผู้ช่วย AI ครบโควตาแล้ว พรุ่งนี้กลับมาคุยกันใหม่ได้เลย",
      empty: "พิมพ์ข้อความก่อนส่งนะครับ",
    };
    return { ok: false, message: msg[res.error] };
  } catch {
    return { ok: false, message: "ผู้ช่วย AI ตอบไม่ได้ชั่วคราว ลองใหม่อีกครั้ง" };
  }
}
