"use server";

// inbox-actions.ts — server action ที่ "กล่องแชทฝั่ง client" เรียกทุกรอบ poll (WO-CW4 · §6.4)
//
// 🔴 ทำไมแยกไฟล์จาก `chat/actions.ts`
//    รอบนี้ `chat/actions.ts` เป็นของสาย D และถูกสั่งห้ามแตะ (กันชนไฟล์ของ §9)
//    แผน §6.4 กับข้อสอบ IU-6.2 ระบุว่า `loadInboxAction` / `loadThreadAction` ควรอยู่ใน
//    `chat/actions.ts` ⇒ **ตรงนี้ไม่ตรงกับข้อจำกัดของรอบนี้** จึงวางไว้ที่นี่ก่อน
//    และรายงานให้ Fable ย้ายรวมทีเดียวตอนประกอบ (ย้ายได้ทั้งก้อน ไม่มีอะไรผูกกับชื่อไฟล์)
//
// 🔴 กติกาของไฟล์นี้
//    1. ทุกเส้นเรียก `requireChatRead()` **ก่อน** แตะข้อมูลแชทเสมอ (ปิด G8 ขาอ่าน)
//    2. คืนค่าเป็นข้อมูลล้วนที่ serialize ได้ (เวลา = epoch ms) — ห้ามคืน Date/Decimal/Prisma object
//       ดิบ ๆ ข้ามเส้น server→client
//    3. **ห้าม `revalidatePath` ในเส้นทาง poll** — มันจะสั่ง re-render หน้าใหม่ทุก 5 วิ
//       แล้วร่างที่ทีมกำลังพิมพ์/ไฟล์ที่เลือกไว้จะโดนกวาด (ข้อห้ามเดียวกับ router.refresh())

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { tenantDb } from "@/lib/core/db";
import { assertCan, evaluate } from "@/lib/core/rbac";
import { requireChatRead, membershipOf } from "./guard";
import {
  listConversations,
  getThread,
  markRead,
  sendReply,
  getLinkedMember,
  type ExternalAttachmentInput,
} from "./service";

/**
 * userId ที่ระบบใช้แทน "ลูกค้า" ในตาราง `ChatReadState`
 *
 * 🔴 ของจริงประกาศเป็น `const CUSTOMER_READER` ใน `service.ts` แต่**ไม่ได้ export**
 *    ⇒ ที่นี่จำเป็นต้องเขียนซ้ำเพื่ออ่านค่า "ลูกค้าอ่านถึงเมื่อไหร่" (ติ๊ก ✓✓)
 *    หนี้ที่ต้องปิด: export ตัวนั้นออกมาจาก service.ts แล้วลบบรรทัดนี้ทิ้ง (ไฟล์ของสาย D)
 */
const customerReaderId = (contactId: string) => `contact:${contactId}`;

/** ทุก query ของไฟล์นี้ผ่านยามชั้น 2 — tenantId/systemId ถูกยัดเข้า where ให้เองเสมอ */
const db = (tenantId: string, systemId: string) => tenantDb({ tenantId, systemId });

const ms = (d: Date | null | undefined) => (d ? d.getTime() : null);

export type InboxRow = {
  id: string;
  channel: string;
  title: string;
  phone: string | null;
  preview: string | null;
  lastMessageAt: number | null;
  staffUnreadCount: number;
  status: string;
  assigneeUserId: string | null;
  /** ลูกค้าอ่านถึงเวลาไหน — ตัวตัดสินติ๊ก ✓✓ (มาจาก markCustomerRead ที่มีข้อมูลอยู่แล้ว) */
  customerLastReadAt: number | null;
};

export type ThreadAttachment = {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: string;
};

export type ThreadMessage = {
  id: string;
  direction: string;
  type: string;
  body: string | null;
  translatedBody: string | null;
  translatedLang: string | null;
  isInternal: boolean;
  senderUserId: string | null;
  deliveryStatus: string;
  deliveryError: string | null;
  createdAt: number;
  attachments: ThreadAttachment[];
};

export type ThreadSnapshot = {
  conversationId: string;
  contactId: string;
  channel: string;
  status: string;
  title: string;
  phone: string | null;
  customerId: string | null;
  memberName: string | null;
  assigneeUserId: string | null;
  staffUnreadCount: number;
  customerLastReadAt: number | null;
  messages: ThreadMessage[];
};

/** ดึงเวลาที่ลูกค้าอ่านล่าสุดของหลายห้องพร้อมกัน (1 query — ไม่ยิงทีละห้อง) */
async function customerReadMap(
  tenantId: string,
  systemId: string,
  convs: { id: string; contactId: string }[],
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (convs.length === 0) return out;
  const states = await db(tenantId, systemId).chatReadState.findMany({
    where: {
      conversationId: { in: convs.map((c) => c.id) },
      userId: { in: convs.map((c) => customerReaderId(c.contactId)) },
    },
    select: { conversationId: true, userId: true, lastReadAt: true },
  });
  for (const c of convs) {
    const s = states.find(
      (x) => x.conversationId === c.id && x.userId === customerReaderId(c.contactId),
    );
    out.set(c.id, ms(s?.lastReadAt));
  }
  return out;
}

/**
 * รายการห้องแชทฝั่งซ้าย — เรียกครั้งแรกตอนเปิดหน้า และซ้ำทุกรอบ poll
 *
 * 🔴 ต้องพา **ทั้ง 3 อย่าง** ที่ `AutoRefresh` ของเดิมเคยพามาฟรี ๆ กลับมาด้วย:
 *    ข้อความล่าสุด (preview/lastMessageAt) · ตัวนับ `staffUnreadCount` · ข้อมูลติ๊ก ✓✓
 */
export async function loadInboxAction(systemId: string, q?: string): Promise<InboxRow[]> {
  const auth = await requireChatRead();
  if (!systemId) return [];
  const convs = await listConversations({
    tenantId: auth.active.tenantId,
    systemId,
    unitAccess: auth.active.unitAccess as string[],
    ...(q?.trim() ? { q: q.trim() } : {}),
  });
  const readMap = await customerReadMap(
    auth.active.tenantId,
    systemId,
    convs.map((c) => ({ id: c.id, contactId: c.contactId })),
  );
  return convs.map((c) => ({
    id: c.id,
    channel: c.channel,
    title: c.contact.displayName ?? c.contact.phone ?? "ลูกค้า",
    phone: c.contact.phone,
    preview: c.lastMessagePreview,
    lastMessageAt: ms(c.lastMessageAt),
    staffUnreadCount: c.staffUnreadCount,
    status: c.status,
    assigneeUserId: c.assigneeUserId,
    customerLastReadAt: readMap.get(c.id) ?? null,
  }));
}

/**
 * เนื้อห้องที่เปิดอยู่ + **heartbeat ของ `ChatReadState.lastReadAt`** (มติ M-1 ข้อ 2)
 *
 * 🔴 heartbeat ไม่ใช่ของแถม: ระบบแจ้งเตือน (สาย E) ใช้กติกา "lastReadAt สดภายใน 20 วิ =
 *    กำลังเปิดดูอยู่ → ไม่ต้องแจ้ง" ถ้าไม่รีเฟรชทุกรอบ ค่านั้นจะแปลว่า "เคยกดอ่านเมื่อไหร่"
 *    ⇒ ร้านที่มีคนเดียว อ่านแล้วปิดแอป ลูกค้าตอบกลับ = **ไม่ได้แจ้งเตือนเลย**
 *
 * มี 2 เส้นทางโดยตั้งใจ:
 *   • ยังมีข้อความค้าง → `markRead()` เต็มรูป (เคลียร์ตัวนับ + ยิง event ให้ลูกค้าเห็นติ๊กคู่)
 *   • ไม่มีอะไรค้าง → แตะแค่ `lastReadAt` (1 upsert) ไม่เขียน conversation ไม่ยิง outbox
 *     — poll ทุก 5 วิ ถ้ายิง event ทุกรอบ ปลายทางจะโดนถล่มด้วย event ที่ไม่เปลี่ยนอะไรเลย
 */
export async function loadThreadAction(
  systemId: string,
  conversationId: string,
): Promise<ThreadSnapshot | null> {
  const auth = await requireChatRead();
  if (!systemId || !conversationId) return null;
  const tenantId = auth.active.tenantId;
  const unitAccess = auth.active.unitAccess as string[];

  const thread = await getThread({ tenantId, systemId, conversationId, unitAccess });
  if (!thread) return null;
  const { conversation: conv, messages } = thread;

  // ── heartbeat ──
  const canMarkRead = evaluate(membershipOf(auth), {
    module: "chat",
    action: "chat.conversation.markRead",
  });
  if (canMarkRead) {
    if (conv.staffUnreadCount > 0) {
      await markRead({ tenantId, systemId, conversationId: conv.id, userId: auth.user.id, unitAccess });
    } else {
      // แตะเฉพาะ lastReadAt · ใช้ updateMany+create แทน upsert เพราะยาม `tenantDb` ยัดตัวกรอง
      // ลง where เป็น AND ซึ่ง unique-where ของ upsert ไม่รับ (กติกาของยาม ไม่ใช่ของเรา)
      const touched = await db(tenantId, systemId).chatReadState.updateMany({
        where: { conversationId: conv.id, userId: auth.user.id },
        data: { lastReadAt: new Date() },
      });
      if (touched.count === 0) {
        await db(tenantId, systemId)
          .chatReadState.create({
            data: { tenantId, systemId, conversationId: conv.id, userId: auth.user.id },
          })
          .catch(() => null); // ชนกับ poll อีกแท็บ = แถวมีอยู่แล้ว ไม่ใช่ความผิดพลาด
      }
    }
  }

  const [atts, readMap, linkedMember] = await Promise.all([
    messages.length > 0
      ? db(tenantId, systemId).chatAttachment.findMany({
          where: { messageId: { in: messages.map((m) => m.id) } },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    customerReadMap(tenantId, systemId, [{ id: conv.id, contactId: conv.contactId }]),
    conv.contact.customerId ? getLinkedMember(tenantId, conv.contact.customerId) : Promise.resolve(null),
  ]);

  return {
    conversationId: conv.id,
    contactId: conv.contactId,
    channel: conv.channel,
    status: conv.status,
    title: conv.contact.displayName ?? conv.contact.phone ?? "ลูกค้า",
    phone: conv.contact.phone,
    customerId: conv.contact.customerId,
    memberName: linkedMember ? (linkedMember.name ?? linkedMember.memberCode ?? null) : null,
    assigneeUserId: conv.assigneeUserId,
    // 🔴 ค่าหลัง heartbeat: กดอ่านไปแล้วในรอบนี้ ตัวนับต้องเป็น 0 ไม่ใช่ค่าเก่าที่ค้าง
    staffUnreadCount: canMarkRead ? 0 : conv.staffUnreadCount,
    customerLastReadAt: readMap.get(conv.id) ?? null,
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      type: m.type,
      body: m.body,
      translatedBody: m.translatedBody,
      translatedLang: m.translatedLang,
      isInternal: m.isInternal,
      senderUserId: m.senderUserId,
      deliveryStatus: m.deliveryStatus,
      deliveryError: m.deliveryError,
      createdAt: m.createdAt.getTime(),
      attachments: atts
        .filter((a) => a.messageId === m.id)
        .map((a) => ({
          id: a.id,
          url: a.url,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          kind: a.kind,
        })),
    })),
  };
}

/**
 * ส่งข้อความที่ค้างสถานะ FAILED ใหม่อีกครั้ง (ปุ่ม "ลองส่งอีกครั้ง" ใต้ฟองที่มี ✗)
 *
 * 🔴 ตัดสินจาก `ChatMessage.deliveryStatus` เท่านั้น (มติ D-1) — ค่า `ok` ที่ `sendReply` คืน
 *    มีความหมายสองแบบและ `sendReplyAction` ไม่เคยอ่านมันเลย ⇒ เชื่อไม่ได้
 * 🔴 ไฟล์แนบ **ไม่อัปใหม่** — ของเดิมอยู่บน CDN แล้ว ส่งซ้ำคือส่ง url เดิม (ไม่จ่ายค่า storage ซ้ำ)
 */
export async function retrySendAction(
  systemId: string,
  conversationId: string,
  messageId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireChatRead();
  assertCan(membershipOf(auth), { module: "chat", action: "chat.message.send" });
  if (!systemId || !conversationId || !messageId) {
    return { ok: false, reason: "ข้อมูลไม่ครบสำหรับการส่งซ้ำ" };
  }
  const tenantId = auth.active.tenantId;
  const msg = await db(tenantId, systemId).chatMessage.findFirst({
    where: { id: messageId, conversationId, direction: "OUT" },
    include: { attachments: true },
  });
  if (!msg) return { ok: false, reason: "ไม่พบข้อความที่จะส่งซ้ำ" };
  if (msg.deliveryStatus !== "FAILED") {
    return { ok: false, reason: "ข้อความนี้ไม่ได้อยู่ในสถานะส่งไม่สำเร็จ — ไม่ต้องส่งซ้ำ" };
  }
  const attachments: ExternalAttachmentInput[] = msg.attachments.map((a) => ({
    url: a.url,
    mimeType: a.mimeType,
    fileName: a.fileName,
    sizeBytes: a.sizeBytes,
    storageKey: a.storageKey,
  }));
  const res = await sendReply({
    tenantId,
    systemId,
    conversationId,
    senderUserId: auth.user.id,
    body: msg.body ?? "",
    attachments,
    isInternal: msg.isInternal,
    unitAccess: auth.active.unitAccess as string[],
  });
  if (!res.ok) return { ok: false, reason: res.reason ?? "ส่งซ้ำไม่สำเร็จ ลองอีกครั้งในอีกสักครู่" };
  // ผลจริงอ่านจาก deliveryStatus ของแถวใหม่ (D-1) — poll รอบถัดไปจะเห็นเอง
  return { ok: true };
}

/**
 * เปิด/ปิด "AI แนะนำคำตอบ" · "การแปล" · ภาษาที่ทีมอ่าน (หน้าเชื่อมช่องทาง)
 *
 * 🔴 ไม่ตรงกับแผน: `ChatSetting.aiSuggestEnabled/translateEnabled/staffLang` เป็น `false/false/"th"`
 *    โดยค่าเริ่มต้น แต่ `chat/actions.ts` (สาย D) **ไม่มี action ไหนเขียนค่าเหล่านี้เลย**
 *    ⇒ ถ้าไม่มีสวิตช์ ฟีเจอร์ AI/แปลทั้งชุดจะไม่มีทางถูกเปิดใช้ได้เลย = ปุ่มที่เดินไปไม่ถึง
 *    (กฎเหล็กข้อ 6) · วางไว้ที่นี่ก่อนและรายงานให้ Fable ย้ายไปรวมกับ `setting.*` ตัวอื่น
 * ผูกสิทธิ์กับ `chat.setting.setMemberSystem` — ทะเบียนกลางยังไม่มีคีย์ของ AI/แปลฝั่งตั้งค่า
 *    (เป็นการตั้งค่าระดับร้านเหมือนกัน · ไม่สร้างคีย์ใหม่เองเพราะทะเบียนเป็นของสาย C)
 */
export async function setChatAiSettingsAction(formData: FormData): Promise<void> {
  const auth = await requireChatRead();
  assertCan(membershipOf(auth), { module: "chat", action: "chat.setting.setMemberSystem" });
  const systemId = String(formData.get("systemId") ?? "");
  if (!systemId) redirect("/app");
  const staffLangRaw = String(formData.get("staffLang") ?? "").trim().toLowerCase();
  const staffLang = /^[a-z]{2}$/.test(staffLangRaw) ? staffLangRaw : "th";
  await db(auth.active.tenantId, systemId).chatSetting.updateMany({
    where: {},
    data: {
      aiSuggestEnabled: String(formData.get("aiSuggestEnabled") ?? "") === "on",
      translateEnabled: String(formData.get("translateEnabled") ?? "") === "on",
      staffLang,
    },
  });
  const path = `/app/sys/${systemId}/chat/channels`;
  revalidatePath(path);
  redirect(path);
}
