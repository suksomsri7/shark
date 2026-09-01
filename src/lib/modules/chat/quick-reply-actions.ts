"use server";

// quick-reply-actions.ts — server actions ของคำตอบสำเร็จรูป + ป้ายกำกับ (WO-CV6)
//
// ⚠️ แยกไฟล์จาก `chat/actions.ts` โดยตั้งใจ: รอบนี้มีสายงานขนานกันหลายสายในโมดูลแชท
//    ไฟล์เดียวกัน = ชนกันตอนรวมงาน · ด่าน F6 (fitness) ตรวจไฟล์ที่ลงท้าย `actions.ts` ทุกไฟล์อยู่แล้ว
//    ⇒ แยกไฟล์ไม่ได้แปลว่าหลุดด่านสิทธิ์
//
// 🔴 สิทธิ์ 4 ตัวในไฟล์นี้ (คนละเรื่องกัน ห้ามยุบรวม)
//    · `chat.quickreply.manage`   — แก้คลัง (มีผลกับคำตอบของทุกคนในร้าน)
//    · `chat.message.send`        — หยิบคำตอบไปวางในกล่องพิมพ์ (เท่ากับกำลังจะตอบลูกค้า)
//    · `chat.conversation.read`   — เปิดดูรายการในเมนู `/` (ยังไม่ได้ส่งอะไร)
//    · `chat.conversation.tag`    — ติด/ถอดป้ายกำกับห้อง

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertChatCan } from "./guard";
import { tenantDb } from "@/lib/core/db";
import {
  createQuickReply,
  updateQuickReply,
  archiveQuickReply,
  restoreQuickReply,
  applyQuickReply,
  suggestQuickReplies,
} from "./quick-reply";
import { addConversationTag, removeConversationTag } from "./labels";

type Auth = Awaited<ReturnType<typeof requireTenant>>;

const channelsPath = (systemId: string) => `/app/sys/${systemId}/chat/channels`;
const chatPath = (systemId: string, conversationId?: string) =>
  conversationId ? `/app/sys/${systemId}/chat?c=${conversationId}` : `/app/sys/${systemId}/chat`;

/** error แบบ inline บนหน้า "เชื่อมช่องทาง" (`?err=`) — ไม่ใช่ Alert */
function channelsError(systemId: string, msg: string): never {
  redirect(`${channelsPath(systemId)}?err=${encodeURIComponent(msg)}`);
}

/** ช่องทางที่ติ๊กไว้ในฟอร์ม — ไม่ติ๊กเลย = `[]` = ใช้ได้ทุกช่องทาง (ตามคอมเมนต์ในสคีมา) */
function channelsFrom(formData: FormData): string[] {
  return formData.getAll("channelTypes").map((v) => String(v)).filter((v) => v.length > 0);
}

// ───────────────────────── จัดการคลัง (หน้า "เชื่อมช่องทาง") ─────────────────────────

export async function createQuickReplyAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.quickreply.manage");
  const systemId = String(formData.get("systemId") ?? "");
  if (!systemId) return;

  const res = await createQuickReply({
    tenantId: auth.active.tenantId,
    systemId,
    userId: auth.user.id,
    shortcut: String(formData.get("shortcut") ?? ""),
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    channelTypes: channelsFrom(formData),
  });
  if (!res.ok) channelsError(systemId, res.reason ?? "เพิ่มคำตอบสำเร็จรูปไม่สำเร็จ");

  revalidatePath(channelsPath(systemId));
  revalidatePath(chatPath(systemId));
  redirect(channelsPath(systemId));
}

export async function updateQuickReplyAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.quickreply.manage");
  const systemId = String(formData.get("systemId") ?? "");
  const quickReplyId = String(formData.get("quickReplyId") ?? "");
  if (!systemId || !quickReplyId) return;

  const res = await updateQuickReply({
    tenantId: auth.active.tenantId,
    systemId,
    quickReplyId,
    shortcut: String(formData.get("shortcut") ?? ""),
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    channelTypes: channelsFrom(formData),
  });
  if (!res.ok) channelsError(systemId, res.reason ?? "แก้คำตอบสำเร็จรูปไม่สำเร็จ");

  revalidatePath(channelsPath(systemId));
  revalidatePath(chatPath(systemId));
  redirect(channelsPath(systemId));
}

/** ถอดออกจากเมนู — ปัก archivedAt ไม่ลบแถว (ประวัติการใช้งานต้องตรวจย้อนได้) */
export async function archiveQuickReplyAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.quickreply.manage");
  const systemId = String(formData.get("systemId") ?? "");
  const quickReplyId = String(formData.get("quickReplyId") ?? "");
  if (!systemId || !quickReplyId) return;

  const res = await archiveQuickReply({ tenantId: auth.active.tenantId, systemId, quickReplyId });
  if (!res.ok) channelsError(systemId, res.reason ?? "ถอดคำตอบสำเร็จรูปไม่สำเร็จ");

  revalidatePath(channelsPath(systemId));
  revalidatePath(chatPath(systemId));
  redirect(channelsPath(systemId));
}

export async function restoreQuickReplyAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.quickreply.manage");
  const systemId = String(formData.get("systemId") ?? "");
  const quickReplyId = String(formData.get("quickReplyId") ?? "");
  if (!systemId || !quickReplyId) return;

  const res = await restoreQuickReply({ tenantId: auth.active.tenantId, systemId, quickReplyId });
  if (!res.ok) channelsError(systemId, res.reason ?? "เอาคำตอบกลับมาใช้ไม่สำเร็จ");

  revalidatePath(channelsPath(systemId));
  revalidatePath(chatPath(systemId));
  redirect(channelsPath(systemId));
}

// ───────────────────────── ใช้งานจากกล่องพิมพ์ (สัญญาของสาย C/E) ─────────────────────────

/**
 * รายการที่จะเสนอตอนทีมพิมพ์ `/` ในกล่องพิมพ์
 * `query` = สิ่งที่พิมพ์ต่อจาก `/` (ส่ง `"/รา"` หรือ `"รา"` มาก็ได้ — ตัด `/` ให้เอง)
 * 🔴 **ไม่แตะตัวนับ** — เปิดเมนูดูเฉย ๆ ไม่ใช่การใช้งาน
 */
export async function searchQuickRepliesAction(
  systemId: string,
  conversationId: string,
  query: string,
): Promise<{ id: string; shortcut: string; title: string; body: string; usageCount: number }[]> {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.conversation.read");
  if (!systemId) return [];

  // ช่องทางของห้อง = ตัวกรองว่าคำตอบไหนใช้ได้ (ห้ามเสนอของที่ส่งในช่องทางนี้ไม่ได้)
  const rows = await suggestQuickReplies({
    tenantId: auth.active.tenantId,
    systemId,
    channel: conversationId ? await channelOf(auth, systemId, conversationId) : null,
    query,
  });
  return rows.map((r) => ({
    id: r.id,
    shortcut: r.shortcut,
    title: r.title,
    body: r.body,
    usageCount: r.usageCount,
  }));
}

/** อ่านช่องทางของห้อง (ผ่านขอบเขต tenant/system เสมอ) */
async function channelOf(auth: Auth, systemId: string, conversationId: string) {
  const conv = await tenantDb({ tenantId: auth.active.tenantId, systemId }).chatConversation.findFirst({
    where: { id: conversationId, tenantId: auth.active.tenantId, systemId },
    select: { channel: true },
  });
  return conv?.channel ?? null;
}

/**
 * ทีมเลือกคำตอบจากเมนู `/` → คืนข้อความที่แทนค่าตัวแปรแล้วให้เอาไปวางในกล่องพิมพ์
 * 🔴 **ไม่ส่งข้อความ** — ทีมต้องได้อ่าน/แก้ก่อนกดส่งเสมอ
 * 🔴 นับ `usageCount` ที่จุดนี้ (คนกดเลือกใช้จริง) ไม่ใช่ตอนเปิดเมนู
 */
export async function applyQuickReplyAction(
  systemId: string,
  conversationId: string,
  quickReplyId: string,
): Promise<{ ok: boolean; body?: string; reason?: string }> {
  const auth = await requireTenant();
  // หยิบคำตอบไปวาง = กำลังจะตอบลูกค้า → สิทธิ์เดียวกับการตอบ (ไม่ใช่สิทธิ์แก้คลัง)
  assertChatCan(auth, "chat.message.send");
  if (!systemId || !conversationId || !quickReplyId) {
    return { ok: false, reason: "ข้อมูลไม่ครบสำหรับหยิบคำตอบสำเร็จรูป" };
  }
  return applyQuickReply({
    tenantId: auth.active.tenantId,
    systemId,
    conversationId,
    quickReplyId,
    staffName: auth.user.name ?? null,
  });
}

// ───────────────────────── ป้ายกำกับห้องแชท ─────────────────────────

/** ติดป้าย (ฟอร์ม) — ใช้ในเมนู ⋮ และคอลัมน์บริบทตามแบบร่าง */
export async function addConversationTagAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.conversation.tag");
  const systemId = String(formData.get("systemId") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "");
  if (!systemId || !conversationId) return;

  const res = await addConversationTag({
    tenantId: auth.active.tenantId,
    systemId,
    conversationId,
    tag: String(formData.get("tag") ?? ""),
  });
  const base = chatPath(systemId, conversationId);
  if (!res.ok) redirect(`${base}&err=${encodeURIComponent(res.reason ?? "ติดป้ายไม่สำเร็จ")}`);
  revalidatePath(chatPath(systemId));
  redirect(base);
}

/** ถอดป้าย (ฟอร์ม) */
export async function removeConversationTagAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.conversation.tag");
  const systemId = String(formData.get("systemId") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "");
  if (!systemId || !conversationId) return;

  const res = await removeConversationTag({
    tenantId: auth.active.tenantId,
    systemId,
    conversationId,
    tag: String(formData.get("tag") ?? ""),
  });
  const base = chatPath(systemId, conversationId);
  if (!res.ok) redirect(`${base}&err=${encodeURIComponent(res.reason ?? "ถอดป้ายไม่สำเร็จ")}`);
  revalidatePath(chatPath(systemId));
  redirect(base);
}

/**
 * ติด/ถอดป้ายแบบเรียกจากคอมโพเนนต์ฝั่ง client (คืนรายการป้ายล่าสุดกลับไปวาดทันที)
 * มีคู่กับแบบฟอร์มเพราะคอลัมน์บริบท/เมนู ⋮ ของสาย E/F เป็น client component
 * — ถ้ามีแต่ฟอร์ม จะต้อง redirect ทั้งหน้าเพียงเพื่อเพิ่มชิปใบเดียว
 */
export async function setConversationTagAction(
  systemId: string,
  conversationId: string,
  tag: string,
  on: boolean,
): Promise<{ ok: boolean; tags?: string[]; reason?: string }> {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.conversation.tag");
  if (!systemId || !conversationId) return { ok: false, reason: "ข้อมูลไม่ครบสำหรับแก้ป้ายกำกับ" };
  const args = { tenantId: auth.active.tenantId, systemId, conversationId, tag };
  const res = on ? await addConversationTag(args) : await removeConversationTag(args);
  if (res.ok) revalidatePath(chatPath(systemId));
  return res;
}
