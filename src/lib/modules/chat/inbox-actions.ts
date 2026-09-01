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
import { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { assertCan, evaluate, filterAccessibleUnitIds } from "@/lib/core/rbac";
import { requireChatRead, membershipOf } from "./guard";
import {
  canAccessConvUnit,
  getThread,
  markRead,
  sendReply,
  getLinkedMember,
  type ExternalAttachmentInput, unitAccessWhere } from "./service";
import { CHANNEL_ORDER } from "./channel-icon";
import { listSystemTags, parseTags } from "./labels";
import { searchAnswerExamples, type AnswerExampleHit } from "./learning";
import {
  EMPTY_COUNTS,
  previewKindOf,
  toInboxFilterKey,
  type InboxCounts,
  type InboxFilterKey,
} from "./list-filters";

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

// ═════════════ ชั้นข้อมูลของ "รายการแชท" (WO-CV3 · WO-CV10) ═════════════
//
// 🔴 ทำไมเขียน query เองที่นี่ แทนที่จะเรียก `listConversations()` ของ service.ts
//    รายการรอบนี้ต้องการ 3 อย่างที่ตัวนั้นให้ไม่ได้ และ `service.ts` เป็นไฟล์ของสายอื่น (อ่านอย่างเดียว):
//      (1) **เรียงห้องปักหมุดขึ้นก่อน** — ของเดิมเรียง `lastMessageAt` อย่างเดียว
//      (2) กรอง "ยังไม่อ่าน / ของฉัน / ยังไม่มีคนรับ / ปิดแล้ว" **ที่ชั้นข้อมูล**
//          ของเดิมกรองบนจอจากแถวที่โหลดมาแล้ว 50 แถว ⇒ ห้องที่ตรงเงื่อนไขแต่ตกอยู่แถวที่ 51
//          จะ "หายไป" โดยที่ตัวเลขบนชิปก็ผิดตาม (บั๊กชนิดถึงระบบแล้วแต่ใช้งานไม่ได้)
//      (3) ค้นหาข้อความล่าสุดด้วย (ของเดิมค้นแค่ชื่อ/เบอร์ที่ชั้นข้อมูล)
//    ⚠️ หนี้ที่ต้องรายงาน: ตัวกรอง unit ด้านล่างซ้ำกับ `unitAccessWhere()` ใน service.ts ซึ่งไม่ได้
//       export ออกมา — ตรรกะความปลอดภัยไม่ควรมี 2 ชุด ⇒ ควรยุบเหลือที่เดียวตอนประกอบ

/** เพดานแถวต่อรอบ — เท่าเดิมกับ `listConversations` (ยังไม่มีการเลื่อนหน้า) */
const INBOX_TAKE = 50;

/**
 * ตัวเลือกของรายการที่ฝั่งจอส่งข้ามมา — ต้อง serialize ได้ทุกช่อง (client → server action)
 * `closed`/`channel`/`assignee` = ตัวกรองหลังไอคอนกรวย (มติ D3 — "ปิดแล้ว" ของเดิมย้ายมาที่นี่)
 */
export type InboxQuery = {
  q?: string;
  filter?: InboxFilterKey;
  closed?: boolean;
  channel?: string | null;
  assignee?: string | null;
};

/**
 * เงื่อนไขจริงของรายการ — จุดเดียวที่แปล "ชิปบนจอ" เป็น "where ของฐานข้อมูล"
 * `applyChip=false` ใช้ตอนนับเลขบนชิป (ต้องนับในบริบทเดียวกัน แต่ไม่เอาชิปตัวเองมากรอง)
 */
function inboxWhere(
  meUserId: string,
  unitAccess: string[],
  opts: InboxQuery,
  applyChip: boolean,
): Prisma.ChatConversationWhereInput {
  const and: Prisma.ChatConversationWhereInput[] = [];

  // ด่าน unit (M11) — ต้องอยู่ใน where ของ SQL ไม่ใช่กรองหลังอ่าน
  // 🔴 ใช้ตัวเดียวกับ service.ts ห้ามเขียนซ้ำ — ตรรกะความปลอดภัย 2 ชุดจะเพี้ยนจากกันเสมอ
  const unitWhere = unitAccessWhere(unitAccess);
  if (Object.keys(unitWhere).length > 0) and.push(unitWhere);

  // "ปิดแล้ว" อยู่หลังไอคอนกรวย (มติ D3) — ค่าตั้งต้นคือซ่อนห้องที่ปิดไปแล้ว เหมือนพฤติกรรมเดิม
  and.push(opts.closed ? { status: "RESOLVED" } : { status: { not: "RESOLVED" } });

  if (applyChip) {
    const f = toInboxFilterKey(opts.filter);
    if (f === "unread") and.push({ staffUnreadCount: { gt: 0 } });
    if (f === "mine") and.push({ assigneeUserId: meUserId });
    // 🔴 ชิปใหม่ของรอบนี้ — เงื่อนไขจริงต้องลงไปถึง SQL ไม่งั้นเป็นปุ่มหลอก
    if (f === "unassigned") and.push({ assigneeUserId: null });
  }

  // ตัวกรองหลังกรวย: ตามช่องทาง / ตามผู้รับผิดชอบ
  const ch = CHANNEL_ORDER.find((c) => c === opts.channel);
  if (ch) and.push({ channel: ch });
  if (opts.assignee) and.push({ assigneeUserId: opts.assignee });

  // ค้นหา "ชื่อ เบอร์ หรือข้อความ" ตามที่ช่องค้นหาสัญญาไว้
  // ⚠️ "ข้อความ" ที่ค้นได้คือ **ข้อความล่าสุดของห้อง** (`lastMessagePreview`) — การค้นทั้งประวัติ
  //    เป็นงานของ WO-CV4 (ค้นหาในห้อง) และต้องมี index ของตัวเองก่อน ไม่ใช่ ILIKE ทั้งตาราง
  const q = opts.q?.trim();
  if (q) {
    and.push({
      OR: [
        { contact: { is: { displayName: { contains: q, mode: "insensitive" } } } },
        { contact: { is: { phone: { contains: q } } } },
        { lastMessagePreview: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  return { AND: and };
}

/**
 * ความยาวคลิปเสียงของห้องที่ข้อความล่าสุดเป็น "ข้อความเสียง"
 *
 * 🔴 ยิง query เพิ่ม **เฉพาะเมื่อมีห้องแบบนั้นจริง** — ปกติคือศูนย์ห้อง ⇒ ไม่มี query เพิ่มเลย
 *    (ห้ามดึงข้อความล่าสุดของทุกห้องทุกรอบ poll เพื่อรู้ชนิดข้อความ — นั่นคือการสแกนทั้งตาราง
 *     ทุก 5 วินาที เพื่อข้อมูลที่ denormalize ไว้แล้วใน `lastMessagePreview`)
 */
async function audioDurations(
  tenantId: string,
  systemId: string,
  convs: { id: string; lastMessagePreview: string | null }[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = convs.filter((c) => previewKindOf(c.lastMessagePreview) === "AUDIO").map((c) => c.id);
  if (ids.length === 0) return out;
  const atts = await db(tenantId, systemId).chatAttachment.findMany({
    where: { kind: "AUDIO", message: { is: { conversationId: { in: ids } } } },
    orderBy: { createdAt: "desc" },
    take: ids.length * 3,
    select: { durationMs: true, message: { select: { conversationId: true } } },
  });
  for (const a of atts) {
    const cid = a.message.conversationId;
    if (a.durationMs != null && !out.has(cid)) out.set(cid, a.durationMs);
  }
  return out;
}

export type InboxRow = {
  id: string;
  channel: string;
  title: string;
  phone: string | null;
  preview: string | null;
  lastMessageAt: number | null;
  /** ข้อความล่าสุดเป็นของใคร — "OUT" = ทีมตอบล่าสุด ⇒ แถวขึ้นคำนำหน้า "คุณ:" + ติ๊ก */
  lastMessageDirection: string | null;
  staffUnreadCount: number;
  status: string;
  assigneeUserId: string | null;
  /** ลูกค้าอ่านถึงเวลาไหน — ตัวตัดสินติ๊ก ✓✓ (มาจาก markCustomerRead ที่มีข้อมูลอยู่แล้ว) */
  customerLastReadAt: number | null;
  /** ปักหมุดไว้ไหม — **ระดับร้าน** (ทีมเห็นตรงกัน) ส่งเป็น boolean พอ จอไม่ต้องรู้เวลาที่ปัก */
  pinned: boolean;
  /** ปิดเสียงถึงเมื่อไหร่ — **ของคนที่เปิดหน้าอยู่คนเดียว** (ChatConversationPref) */
  mutedUntil: number | null;
  /** ความยาวข้อความเสียงล่าสุด (ms) — null = ไม่ใช่ข้อความเสียง/ยังไม่รู้ความยาว */
  audioMs: number | null;
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
 * 🔴 พารามิเตอร์ตัวที่ 2 (`q`) คงรูปเดิมไว้เพราะ `ui.tsx` (ฝั่ง server render) เรียกอยู่
 *    — ของใหม่ทั้งหมดอยู่ใน `opts` ซึ่งไม่ใส่ก็ได้ ⇒ ผู้เรียกเดิมไม่ต้องแก้
 */
export async function loadInboxAction(
  systemId: string,
  q?: string,
  opts?: InboxQuery,
): Promise<InboxRow[]> {
  const auth = await requireChatRead();
  if (!systemId) return [];
  const tenantId = auth.active.tenantId;
  const unitAccess = auth.active.unitAccess as string[];
  const query: InboxQuery = { ...(opts ?? {}), q: q ?? opts?.q };

  // 🔴 `nulls: "last"` ห้ามลืม — Postgres ตั้งต้นให้ `DESC` = NULLS FIRST
  //    เขียน `{ pinnedAt: "desc" }` เฉย ๆ จะได้ห้องที่ **ไม่ได้ปักหมุด** ลอยขึ้นบนสุดทั้งหมด (กลับหัว)
  const convs = await db(tenantId, systemId).chatConversation.findMany({
    where: inboxWhere(auth.user.id, unitAccess, query, true),
    include: { contact: { select: { displayName: true, phone: true } } },
    orderBy: [{ pinnedAt: { sort: "desc", nulls: "last" } }, { lastMessageAt: "desc" }],
    take: INBOX_TAKE,
  });

  const ids = convs.map((c) => c.id);
  const [readMap, prefs, audio] = await Promise.all([
    customerReadMap(
      tenantId,
      systemId,
      convs.map((c) => ({ id: c.id, contactId: c.contactId })),
    ),
    // ปิดเสียงเป็น **รายคน** ⇒ อ่านเฉพาะแถวของคนที่เปิดหน้าอยู่ ห้ามอ่านของคนอื่นมาโชว์
    ids.length > 0
      ? db(tenantId, systemId).chatConversationPref.findMany({
          where: { conversationId: { in: ids }, userId: auth.user.id },
          select: { conversationId: true, mutedUntil: true },
        })
      : Promise.resolve([]),
    audioDurations(tenantId, systemId, convs),
  ]);
  const mutedMap = new Map(prefs.map((x) => [x.conversationId, ms(x.mutedUntil)] as const));

  return convs.map((c) => ({
    id: c.id,
    channel: c.channel,
    title: c.contact.displayName ?? c.contact.phone ?? "ลูกค้า",
    phone: c.contact.phone,
    preview: c.lastMessagePreview,
    lastMessageAt: ms(c.lastMessageAt),
    lastMessageDirection: c.lastMessageDirection,
    staffUnreadCount: c.staffUnreadCount,
    status: c.status,
    assigneeUserId: c.assigneeUserId,
    customerLastReadAt: readMap.get(c.id) ?? null,
    pinned: c.pinnedAt !== null,
    mutedUntil: mutedMap.get(c.id) ?? null,
    audioMs: audio.get(c.id) ?? null,
  }));
}

/**
 * ตัวเลขบนชิปกรอง — **นับที่ชั้นข้อมูล** ไม่ใช่นับจากแถวที่โหลดมา 50 แถว
 *
 * 🔴 ทำไมแยก action: `ui.tsx` (server render รอบแรก) เรียก `loadInboxAction` อยู่แล้วและเป็นไฟล์
 *    ที่สายอื่นถืออยู่รอบนี้ ⇒ เปลี่ยนรูปค่าที่คืนจะไปชนไฟล์คนอื่น · แยกออกมาแล้วให้จอเรียกคู่กัน
 *    ในรอบ poll เดียวกัน (2 คำสั่งขนานกัน ไม่ได้เพิ่มรอบเดินทาง)
 * 🔴 นับในบริบทเดียวกับรายการ (คำค้น + ตัวกรองหลังกรวยเดิม) แต่ไม่เอาชิปตัวเองมากรอง
 *    ไม่งั้นกด "ยังไม่อ่าน" แล้วชิปอื่นจะกลายเป็น 0 ทั้งแถว
 */
export async function loadInboxCountsAction(
  systemId: string,
  opts?: InboxQuery,
): Promise<InboxCounts> {
  const auth = await requireChatRead();
  if (!systemId) return EMPTY_COUNTS;
  const tenantId = auth.active.tenantId;
  const me = auth.user.id;
  const base = inboxWhere(me, auth.active.unitAccess as string[], opts ?? {}, false);
  const dbc = db(tenantId, systemId);
  const [all, unread, mine, unassigned] = await Promise.all([
    dbc.chatConversation.count({ where: base }),
    dbc.chatConversation.count({ where: { AND: [base, { staffUnreadCount: { gt: 0 } }] } }),
    dbc.chatConversation.count({ where: { AND: [base, { assigneeUserId: me }] } }),
    dbc.chatConversation.count({ where: { AND: [base, { assigneeUserId: null }] } }),
  ]);
  return { all, unread, mine, unassigned };
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

// ═══════════════ ปักหมุด · ปิดเสียง (WO-CV10) ═══════════════
//
// 🔴 สองอย่างนี้ **คนละระดับกันโดยตั้งใจ** (มติในแผน §3 P1/P2 · สคีมาเขียนเหตุผลไว้แล้ว)
//    · ปักหมุด = ระดับ **ร้าน** (`ChatConversation.pinnedAt`) — ห้องสำคัญของร้าน คนเข้ากะต่อต้องเห็น
//    · ปิดเสียง = ระดับ **คน** (`ChatConversationPref`) — ความรำคาญส่วนตัว ปิดของตัวเองไม่ใช่ของทีม
//    สลับกันเมื่อไหร่คือบั๊กที่เจ็บ: ปักหมุดรายคน = ทีมเห็นคิวไม่ตรงกัน · ปิดเสียงทั้งร้าน = พลาดงานลูกค้า
//
// 🔴 ทำไมอยู่ไฟล์นี้ ไม่ใช่ `chat/actions.ts`
//    รอบนี้ `chat/actions.ts` เป็นไฟล์ของอีกสายที่ทำงานขนานอยู่ (กันชนไฟล์ตามแผน §7)
//    ⇒ วางไว้ที่นี่ก่อนและรายงานให้ Fable ย้ายรวมทีเดียวตอนประกอบ — ไม่มีอะไรผูกกับชื่อไฟล์

/** ปิดเสียง "ไปเลย" = เก็บวันไกล ๆ (สคีมาเก็บ `mutedUntil` ไม่ใช่ boolean — ดูเหตุผลในสคีมา) */
const MUTE_FOREVER_MS = 100 * 365 * 24 * 60 * 60 * 1000;

/** ห้องนี้มีอยู่จริงและคนนี้เข้าถึง unit ของมันได้ไหม — กัน IDOR ข้ามสาขา (M11) */
async function assertConversationVisible(
  tenantId: string,
  systemId: string,
  conversationId: string,
  unitAccess: string[],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const conv = await db(tenantId, systemId).chatConversation.findFirst({
    where: { id: conversationId },
    select: { id: true, unitId: true },
  });
  if (!conv) return { ok: false, reason: "ไม่พบบทสนทนานี้" };
  if (!canAccessConvUnit(unitAccess, conv.unitId)) {
    return { ok: false, reason: "ไม่มีสิทธิ์เข้าถึงบทสนทนานี้" };
  }
  return { ok: true };
}

/**
 * ปักหมุด / ถอนหมุดห้องแชท — **ระดับร้าน**
 *
 * 🔴 ด่านสิทธิ์ใช้ `chat.conversation.setStatus` โดยตั้งใจ: การปักหมุดเปลี่ยนสถานะห้องที่
 *    **ทั้งทีมเห็นตรงกัน** จึงเป็นน้ำหนักเดียวกับการปิด/เปิดห้อง ไม่ใช่ของที่ใครก็กดได้
 *    ⚠️ ทะเบียนสิทธิ์กลาง (`core/permissions.ts`) เป็นไฟล์ของอีกสายในรอบนี้ ⇒ ไม่เพิ่มคีย์ใหม่เอง
 *       ถ้าเจ้าของอยากแยกสิทธิ์ "ปักหมุด" ออกมาต่างหาก ให้เพิ่ม `chat.conversation.pin` แล้วสลับที่นี่
 */
export async function pinConversationAction(
  systemId: string,
  conversationId: string,
  pinned: boolean,
): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireChatRead();
  assertCan(membershipOf(auth), { module: "chat", action: "chat.conversation.setStatus" });
  if (!systemId || !conversationId) return { ok: false, reason: "ข้อมูลไม่ครบสำหรับการปักหมุด" };
  const tenantId = auth.active.tenantId;
  const seen = await assertConversationVisible(
    tenantId,
    systemId,
    conversationId,
    auth.active.unitAccess as string[],
  );
  if (!seen.ok) return seen;
  await db(tenantId, systemId).chatConversation.updateMany({
    where: { id: conversationId },
    data: pinned
      ? { pinnedAt: new Date(), pinnedByUserId: auth.user.id }
      : { pinnedAt: null, pinnedByUserId: null },
  });
  return { ok: true };
}

/**
 * ปิดเสียงแจ้งเตือนของห้องนี้ — **เฉพาะคนที่กด** (แถวใน `ChatConversationPref` ผูก userId)
 *
 * `mode`: จำนวนนาที · `"forever"` = ปิดไปเลย · `"off"` = เปิดเสียงคืน
 * ไม่ต้องมี cron มาล้าง — `mutedUntil` ที่เลยเวลาแล้วถือว่าเปิดเสียงคืนเองโดยอัตโนมัติ
 *
 * 🔴 ด่านสิทธิ์คือ `requireChatRead()` (คีย์ `chat.conversation.read`) — ใครอ่านห้องนี้ได้
 *    ย่อมปิดเสียง "ของตัวเอง" ได้ ไม่ต้องขอสิทธิ์เพิ่ม · แต่ยังต้องผ่านด่าน unit เหมือนทุกเส้น
 *
 * ⚠️ **ยังไม่ครบวงจร**: เส้นทางแจ้งเตือนจริง (`chat/notify.ts` + `core/push.ts`) ยังไม่อ่านค่านี้
 *    ⇒ วันนี้ไอคอนบนรายการบอกว่าเงียบแล้ว แต่ push ยังเด้ง · สองไฟล์นั้นไม่ใช่ของสายนี้
 *    รายละเอียดสิ่งที่ต้องแก้อยู่ในรายงานส่งมอบ (ห้ามแก้เงียบ ๆ ข้ามขอบเขต)
 */
export async function muteConversationAction(
  systemId: string,
  conversationId: string,
  mode: number | "forever" | "off",
): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireChatRead();
  if (!systemId || !conversationId) return { ok: false, reason: "ข้อมูลไม่ครบสำหรับการปิดเสียง" };
  const tenantId = auth.active.tenantId;
  const seen = await assertConversationVisible(
    tenantId,
    systemId,
    conversationId,
    auth.active.unitAccess as string[],
  );
  if (!seen.ok) return seen;

  const mutedUntil =
    mode === "off"
      ? null
      : mode === "forever"
        ? new Date(Date.now() + MUTE_FOREVER_MS)
        : new Date(Date.now() + Math.max(1, Math.floor(mode)) * 60_000);

  // ใช้ updateMany+create แทน upsert — ยาม `tenantDb` ยัดตัวกรองลง where เป็น AND
  // ซึ่ง unique-where ของ upsert ไม่รับ (กติกาของยาม ไม่ใช่ของเรา — แบบเดียวกับ chatReadState ข้างบน)
  const touched = await db(tenantId, systemId).chatConversationPref.updateMany({
    where: { conversationId, userId: auth.user.id },
    data: { mutedUntil },
  });
  if (touched.count === 0) {
    await db(tenantId, systemId)
      .chatConversationPref.create({
        data: { tenantId, systemId, conversationId, userId: auth.user.id, mutedUntil },
      })
      .catch(() => null); // ชนกับอีกแท็บของคนเดียวกัน = แถวมีอยู่แล้ว ไม่ใช่ความผิดพลาด
  }
  return { ok: true };
}

// ═══════════════ คอลัมน์บริบทลูกค้า (WO-CV7 · แบบร่าง `.dcol3`) ═══════════════
//
// 🔴 ทำไมรวมทุกอย่างไว้ใน action เดียว
//    คอลัมน์นี้มี 5 หมวดที่มาจากคนละตาราง (ห้อง · ป้าย · คลังคำตอบ · สมาชิก · ประวัติจอง)
//    ถ้าแยกเป็น 5 action จอจะยิง 5 รอบเดินทางต่อการเปิด 1 ห้อง และ **ด่านสิทธิ์ต้องเขียน 5 ที่**
//    ⇒ รวมเป็นเส้นเดียว: ด่านเดียว รอบเดินทางเดียว และเวลาที่เพิ่มด่านใหม่ก็เพิ่มที่เดียว
//
// 🔴 ข้อมูลในคอลัมน์นี้อ่อนไหวที่สุดของโมดูล (เนื้อความลูกค้า + ประวัติการจอง + ตัวตนสมาชิก)
//    ⇒ `requireChatRead()` ก่อนแตะข้อมูล **และ** ด่าน unit ของห้องอีกชั้น (กัน IDOR ข้ามสาขา)

/** คำตอบที่ทีมใช้บ่อย 1 รายการ (มาจากคลัง `ChatAnswerExample` ของ WO-CW3) */
export type ContextAnswerExample = { id: string; question: string; answer: string };

/** ประวัติการจอง 1 รายการ — รูปกลางที่ครอบได้ทุกโมดูลจอง (นัดหมาย/ห้องพัก/ตั๋ว) */
export type ContextBooking = {
  id: string;
  /** ป้ายชนิดที่คนอ่านออก เช่น "นัดหมาย" · "เข้าพัก" · "ตั๋วงาน" */
  kindLabel: string;
  title: string;
  at: number | null;
  status: string;
};

export type ConversationContext = {
  conversationId: string;
  contactId: string;
  channel: string;
  title: string;
  phone: string | null;
  /** ภาษาที่ลูกค้าใช้ (จาก `meta.lang`) — ไม่มี = ซ่อนออกจากบรรทัดสรุป */
  lang: string | null;
  /** path ดิบจาก `meta.pageUrl` — ฝั่งจอเป็นคนแปลงผ่านทะเบียน `pageLabelFromPath` (มติ D1) */
  pageUrl: string | null;
  /** "เข้ามาจาก" — `meta.source` (utm) มาก่อน `meta.referrer` · ไม่มี = ซ่อนแถว */
  referrer: string | null;
  customerId: string | null;
  memberName: string | null;
  /** ระบบสมาชิกถูกเชื่อมกับระบบแชทนี้หรือยัง — ยังไม่เชื่อม = ไม่มีอะไรให้ผูก ⇒ ซ่อนชิป */
  memberSystemLinked: boolean;
  firstCustomerMessageAt: number | null;
  firstResponseAt: number | null;
  tags: string[];
  tagSuggestions: string[];
  answers: ContextAnswerExample[];
  bookings: ContextBooking[];
  canTag: boolean;
  canLinkMember: boolean;
};

/** จำนวนรายการจองที่ดึงต่อสาขา และจำนวนที่ส่งกลับจอ — คอลัมน์แคบ 280px แสดงได้ไม่กี่บรรทัด */
const BOOKING_TAKE = 5;
/** คำตอบที่ทีมใช้บ่อย — แบบร่างวาดไว้ 2 ใบ · เผื่อ 3 พอสำหรับคอลัมน์นี้ */
const ANSWER_TAKE = 3;

/** ค่าใน `meta` เป็น Json อิสระ — ดึงออกมาเป็นสตริงที่ใช้ได้จริงหรือ null เท่านั้น */
function metaString(meta: unknown, key: string): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const v = (meta as Record<string, unknown>)[key];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * ประวัติการจองของสมาชิกที่ผูกไว้ — อ่านจาก **โมดูลจองที่ร้านเปิดจริง** เท่านั้น
 *
 * 🔴 ทำไมต้องวนตามชนิดของกิจการ (`BusinessUnit.type`)
 *    ตารางจองทั้งหมดเป็น **unit-axis** ⇒ ยาม `tenantDb` บังคับให้ระบุ `unitId` ทุกคำสั่ง
 *    (จงใจ: ไม่มีทางเผลออ่านข้ามสาขา) · และร้านสปาไม่มีทางมีแถวใน `HotelReservation`
 *    ⇒ ถามเฉพาะกิจการที่เป็นชนิดนั้นจริง = ไม่ยิง query ทิ้งเปล่าให้ร้านที่ไม่ได้เปิดโมดูล
 * 🔴 กรองสาขาด้วย `filterAccessibleUnitIds` ก่อนเสมอ — พนักงานสาขาเดียวห้ามเห็นประวัติสาขาอื่น
 *    (กติกาเดียวกับปฏิทินรวม `modules/calendar/service.ts`)
 * ⚠️ มีแค่ 3 ตารางจองที่ผูก `customerId` กับระบบสมาชิกได้จริง (Appointment · HotelReservation ·
 *    TicketOrder) · `RentalBooking`/`ClinicAppointment` เก็บแค่ชื่อ-เบอร์แบบ snapshot
 *    ⇒ จับคู่กับสมาชิกไม่ได้ที่ระดับข้อมูล จึงยังไม่อยู่ในรายการนี้ (ไม่ใช่การลืม)
 */
async function memberBookings(
  tenantId: string,
  membership: ReturnType<typeof membershipOf>,
  customerId: string,
): Promise<ContextBooking[]> {
  const units = await tenantDb({ tenantId }).businessUnit.findMany({
    where: { type: { in: ["BOOKING", "HOTEL", "TICKET"] }, status: { not: "ARCHIVED" } },
    select: { id: true, type: true },
  });
  const allowed = new Set(filterAccessibleUnitIds(membership, units.map((u) => u.id)));
  const mine = units.filter((u) => allowed.has(u.id));
  if (mine.length === 0) return [];

  const out: ContextBooking[] = [];
  await Promise.all(
    mine.map(async (u) => {
      const udb = tenantDb({ tenantId, unitId: u.id });
      try {
        if (u.type === "BOOKING") {
          const rows = await udb.appointment.findMany({
            where: { customerId },
            orderBy: { startAt: "desc" },
            take: BOOKING_TAKE,
            select: { id: true, startAt: true, status: true, service: { select: { name: true } } },
          });
          for (const r of rows) {
            out.push({
              id: r.id,
              kindLabel: "นัดหมาย",
              title: r.service?.name ?? "นัดหมาย",
              at: ms(r.startAt),
              status: r.status,
            });
          }
        } else if (u.type === "HOTEL") {
          const rows = await udb.hotelReservation.findMany({
            where: { customerId },
            orderBy: { checkInDate: "desc" },
            take: BOOKING_TAKE,
            select: {
              id: true,
              checkInDate: true,
              status: true,
              roomType: { select: { name: true } },
            },
          });
          for (const r of rows) {
            out.push({
              id: r.id,
              kindLabel: "เข้าพัก",
              title: r.roomType?.name ?? "ห้องพัก",
              at: ms(r.checkInDate),
              status: r.status,
            });
          }
        } else {
          const rows = await udb.ticketOrder.findMany({
            where: { customerId },
            orderBy: { createdAt: "desc" },
            take: BOOKING_TAKE,
            select: { id: true, createdAt: true, status: true, event: { select: { name: true } } },
          });
          for (const r of rows) {
            out.push({
              id: r.id,
              kindLabel: "ตั๋วงาน",
              title: r.event?.name ?? "ตั๋วงาน",
              at: ms(r.createdAt),
              status: r.status,
            });
          }
        }
      } catch {
        // สาขานั้นยังไม่ได้ตั้งค่าโมดูล/ตารางว่าง → ข้ามเงียบ ๆ
        // ประวัติการจองเป็นข้อมูลเสริม ห้ามทำให้คอลัมน์บริบททั้งคอลัมน์ล้ม
      }
    }),
  );
  return out.sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, BOOKING_TAKE);
}

/**
 * ข้อมูลทั้งคอลัมน์บริบทของห้องหนึ่ง — เส้นเดียว ด่านเดียว
 * คืน `null` เมื่อ: ไม่มีห้องนี้ · ห้องอยู่สาขาที่คนนี้เข้าไม่ถึง (ตอบเหมือนกันโดยตั้งใจ —
 * ไม่บอกว่า "มีห้องนี้อยู่แต่คุณเข้าไม่ได้" ซึ่งเป็นการยืนยันการมีอยู่ของข้อมูล)
 */
export async function getConversationContextAction(
  systemId: string,
  conversationId: string,
): Promise<ConversationContext | null> {
  const auth = await requireChatRead();
  if (!systemId || !conversationId) return null;
  const tenantId = auth.active.tenantId;
  const unitAccess = auth.active.unitAccess as string[];
  const dbc = db(tenantId, systemId);

  const conv = await dbc.chatConversation.findFirst({
    where: { id: conversationId },
    select: {
      id: true,
      contactId: true,
      channel: true,
      unitId: true,
      tags: true,
      meta: true,
      firstCustomerMessageAt: true,
      firstResponseAt: true,
      contact: { select: { displayName: true, phone: true, customerId: true } },
    },
  });
  if (!conv) return null;
  // ด่าน unit (M11) — ห้องของสาขาที่คนนี้เข้าไม่ถึง ต้องตอบเหมือนไม่มีห้อง
  if (!canAccessConvUnit(unitAccess, conv.unitId)) return null;

  const membership = membershipOf(auth);
  const canTag = evaluate(membership, { module: "chat", action: "chat.conversation.tag" });
  const canLinkMember = evaluate(membership, { module: "chat", action: "chat.customer.link" });
  const customerId = conv.contact.customerId;

  // ข้อความล่าสุดของ **ลูกค้า** = คำถามที่ใช้ค้นคลังคำตอบ (ทีมพิมพ์เองไม่ใช่คำถาม)
  const [lastInbound, setting, tagSuggestions, linkedMember] = await Promise.all([
    dbc.chatMessage.findFirst({
      where: { conversationId: conv.id, direction: "IN", isInternal: false },
      orderBy: { createdAt: "desc" },
      select: { body: true },
    }),
    dbc.chatSetting.findFirst({ where: {}, select: { memberSystemId: true } }),
    canTag
      ? listSystemTags({ tenantId, systemId })
      : Promise.resolve<{ tag: string; count: number }[]>([]),
    customerId ? getLinkedMember(tenantId, customerId) : Promise.resolve(null),
  ]);

  const question = lastInbound?.body?.trim() ?? "";
  const [answers, bookings] = await Promise.all([
    question === ""
      ? Promise.resolve<AnswerExampleHit[]>([])
      : searchAnswerExamples({
          tenantId,
          systemId,
          query: question,
          countUse: false, // แค่แสดงในคอลัมน์บริบท — ยังไม่ได้ "ใช้" (ดูเหตุผลที่ learning.ts)
          channel: conv.channel,
          take: ANSWER_TAKE,
        }),
    customerId
      ? memberBookings(tenantId, membership, customerId)
      : Promise.resolve<ContextBooking[]>([]),
  ]);

  return {
    conversationId: conv.id,
    contactId: conv.contactId,
    channel: conv.channel,
    title: conv.contact.displayName ?? conv.contact.phone ?? "ลูกค้า",
    phone: conv.contact.phone,
    lang: metaString(conv.meta, "lang"),
    pageUrl: metaString(conv.meta, "pageUrl"),
    referrer: metaString(conv.meta, "source") ?? metaString(conv.meta, "referrer"),
    customerId,
    memberName: linkedMember ? (linkedMember.name ?? linkedMember.memberCode ?? null) : null,
    memberSystemLinked: Boolean(setting?.memberSystemId),
    firstCustomerMessageAt: ms(conv.firstCustomerMessageAt),
    firstResponseAt: ms(conv.firstResponseAt),
    tags: parseTags(conv.tags),
    tagSuggestions: tagSuggestions.map((t) => t.tag),
    answers: answers.map((a) => ({ id: a.id, question: a.question, answer: a.answer })),
    bookings,
    canTag,
    canLinkMember,
  };
}
