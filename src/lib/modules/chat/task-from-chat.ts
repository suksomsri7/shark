// task-from-chat.ts — "สร้างงานจากบทสนทนานี้" (K3.2 · ภาพ `ledger/design-kanban/09-from-chat.png`)
//
// 🔴 ทำไมไฟล์นี้อยู่ **ฝั่งแชท** ไม่ใช่ฝั่งบอร์ดงาน
//    ด่านสถาปัตยกรรม (fitness F2) ห้ามบอร์ดงาน import โมดูลแชท — บอร์ดงานต้องไม่รู้ว่าโลกนี้มีแชท
//    ⇒ ฝั่งที่ "รู้เรื่องทั้งสองข้าง" ต้องเป็นแชท และคุยกับบอร์ดงานผ่านประตูเดียวเท่านั้น:
//    `@/lib/modules/kanban/links.createCardFromExternal` (เส้น `chat→kanban` ที่ Fable อนุมัติใน K3.2)
//    ห้ามล้วง service/cards/checklists/attachments ของบอร์ดงานตรง ๆ ไม่ว่ากรณีใด
//
// 🔴 กติกาที่ห้ามรื้อ
//  1. **สวิตช์รายร้านคือด่านจริง** — ไม่ใช่การซ่อนปุ่ม: ปิดสวิตช์แล้วยิง action ตรงต้องถูกปฏิเสธ
//  2. **กดซ้ำต้องได้การ์ดใบเดิม** — กุญแจ `chat:conv:{ห้อง}:{ข้อความลูกค้าล่าสุด}` ⇒ ลูกค้าทักมาใหม่
//     ค่อยเปิดงานใบใหม่ได้ · กดรัว/เน็ตหลุดแล้วกดซ้ำ = ใบเดิม และ **ไม่แปะบันทึกซ้ำ**
//  3. **AI เป็นแค่ตัวร่าง** — ล้มเหลว/ตอบเพี้ยนต้องตกไปใช้ตัวร่างแบบคำนวณล้วนเสมอ ไม่มีวัน throw
//     และ prompt เป็นภาษาอังกฤษ ([[reference_llm_thai_token_cost]]) ส่งเฉพาะ "เนื้อข้อความ"
//     ไม่ส่งชื่อ/เบอร์ลูกค้าออกไปหาผู้ให้บริการ LLM
//  4. **วันไทยคิดเองที่ +07:00** — ห้าม `getDay()` บนเวลา UTC ([[reference_thai_date_getday_trap]])

import type { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./db";
import { evaluate } from "@/lib/core/rbac";
import { resolveProvider, SMART_MODEL } from "@/lib/ai/provider";
import { canSpend, chargeUsageSafe } from "@/lib/ai/credit";
// 🔴 ประตูเดียวไปยังบอร์ดงาน (K3.1 facade) — ห้ามเพิ่ม import อื่นจาก `@/lib/modules/kanban/*`
//    นอกจากทะเบียนสวิตช์ `integrations` ซึ่งเป็นด่านเปิด/ปิดของเส้นทางนี้เอง
import { createCardFromExternal } from "@/lib/modules/kanban/links";
import { chatTaskButtonConfig } from "@/lib/modules/kanban/integrations";
import { CHAT_READ_ACTION } from "./guard";
import { sendReply } from "./service";

// ───────────────────────── ค่าคงที่ ─────────────────────────

/** ข้อความล่าสุดที่เอาเข้าตัวร่าง (ยาวกว่านี้ = จ่ายค่า token โดยไม่ได้ความแม่นเพิ่ม) */
const READ_WINDOW = 12;
const TITLE_MAX = 80;
const SUMMARY_MAX = 500;
const CHECKLIST_MAX = 5;
/** ไฟล์แนบที่คัดลอกตามไปได้ต่อการ์ด (เท่าเพดานไฟล์แนบของบอร์ดงาน) */
const ATTACHMENT_MAX = 20;
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;

// ───────────────────────── ชนิด ─────────────────────────

export type ChatCtx = { tenantId: string; systemId: string; actorUserId: string };

/** actor รูปเดียวกับ Membership (โมดูลบอร์ดงานใช้รูปนี้เป๊ะ — ส่งต่อได้โดยไม่ต้องแปลง) */
export type TaskActor = {
  userId: string;
  role: Role;
  unitAccess: string[];
  permissions: Record<string, unknown>;
};

export type DraftMessage = {
  id: string;
  direction: string;
  body: string | null;
  createdAt: Date;
  senderName?: string | null;
};

export type TaskDraft = {
  title: string;
  summary: string;
  dueAt: Date | null;
  /** true = ระบบ "เดา" วันจากคำในข้อความ (จอขึ้นชิป `AI` ให้คนตรวจก่อนบันทึก) */
  dueGuessed: boolean;
  checklist: string[];
  /** อ่านมากี่ข้อความ — กล่องฟ้าบนแผงบอกตัวเลขนี้ตรง ๆ */
  readCount: number;
};

export type TaskDraftResult = TaskDraft & { aiUsed: boolean };

export type CreateTaskFromChatInput = {
  conversationId: string;
  title: string;
  description?: string | null;
  boardId: string;
  columnId?: string | null;
  assigneeUserIds?: string[];
  dueAt?: Date | null;
  labelIds?: string[];
  checklist?: string[];
  link: { conversation: boolean; party: boolean; copyAttachments: boolean };
};

export type CreateTaskFromChatResult = {
  cardId: string;
  cardNo: number | null;
  created: boolean;
  partyId?: string | null;
  /** ลิงก์เปิดการ์ด (toast "สร้างการ์ด #n แล้ว" ใช้ตัวนี้) */
  cardHref: string;
};

// ───────────────────────── วันไทย (+07:00 คำนวณเอง) ─────────────────────────

/** 18:00 ของ "วันไทยวันนี้ + addDays" — ปลายวันทำงาน คือความหมายที่ลูกค้าพูดว่า "ภายในศุกร์นี้" */
function bkkEndOfDay(now: Date, addDays: number): Date {
  const b = new Date(now.getTime() + BKK_OFFSET_MS);
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() + addDays, 18, 0, 0) - BKK_OFFSET_MS);
}

/** เวลาที่ AI คืนเป็นค่าปริยายของวัน (23:59 / 00:00 ไทย) → 18:00 ไทยของวันไทยเดียวกัน · เวลาอื่นคงเดิม */
function snapDefaultTimeToBkkEvening(d: Date): Date {
  const b = new Date(d.getTime() + BKK_OFFSET_MS);
  const hm = b.getUTCHours() * 60 + b.getUTCMinutes();
  if (hm !== 0 && hm !== 23 * 60 + 59) return d;
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), 18, 0, 0) - BKK_OFFSET_MS);
}

/** วันในสัปดาห์ตามเวลาไทย (0 = อาทิตย์) — คิดจาก epoch ตรง ๆ ไม่พึ่ง TZ ของเครื่อง (server เป็น UTC) */
function bkkWeekday(now: Date): number {
  return new Date(now.getTime() + BKK_OFFSET_MS).getUTCDay();
}

/** จำนวนวันที่เหลือถึงสิ้นเดือนไทยของ `now` */
function daysToEndOfBkkMonth(now: Date): number {
  const b = new Date(now.getTime() + BKK_OFFSET_MS);
  const last = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 0)).getUTCDate();
  return last - b.getUTCDate();
}

const THAI_WEEKDAYS: { word: string; index: number }[] = [
  { word: "อาทิตย์", index: 0 },
  { word: "จันทร์", index: 1 },
  { word: "อังคาร", index: 2 },
  { word: "พุธ", index: 3 },
  { word: "พฤหัสบดี", index: 4 },
  { word: "พฤหัส", index: 4 },
  { word: "ศุกร์", index: 5 },
  { word: "เสาร์", index: 6 },
];

/**
 * เดา "กำหนดส่ง" จากคำไทยที่ลูกค้าพิมพ์จริง ๆ — คืน `null` เมื่อไม่มีคำบอกเวลา (ไม่เดามั่ว)
 * ลำดับสำคัญ: คำเจาะจง (วันนี้/พรุ่งนี้/มะรืน/สิ้นเดือน) ก่อน แล้วค่อยชื่อวันในสัปดาห์
 */
function guessDueAt(text: string, now: Date): Date | null {
  if (/มะรืน/.test(text)) return bkkEndOfDay(now, 2);
  if (/พรุ่งนี้/.test(text)) return bkkEndOfDay(now, 1);
  if (/วันนี้/.test(text)) return bkkEndOfDay(now, 0);
  if (/สิ้นเดือน/.test(text)) return bkkEndOfDay(now, daysToEndOfBkkMonth(now));

  for (const day of THAI_WEEKDAYS) {
    const m = new RegExp(`(?:วัน)?${day.word}\\s*(นี้|หน้า)`).exec(text);
    if (!m) continue;
    const today = bkkWeekday(now);
    const ahead = (day.index - today + 7) % 7;
    return bkkEndOfDay(now, m[1] === "หน้า" ? ahead + 7 : ahead);
  }
  return null;
}

// ───────────────────────── ตัวร่างแบบคำนวณล้วน (ไม่มี AI) ─────────────────────────

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

function cut(s: string, max: number): string {
  const v = oneLine(s);
  return v.length <= max ? v : `${v.slice(0, max - 1)}…`;
}

/** บรรทัดที่ "ดูเป็นรายการ" (ขึ้นต้นด้วย - · • หรือเลขข้อ) — ลูกค้าที่พิมพ์รายการมาให้แล้วไม่ควรต้องพิมพ์ซ้ำ */
function bulletsOf(bodies: string[]): string[] {
  const out: string[] = [];
  for (const body of bodies) {
    for (const raw of body.split(/\r?\n/)) {
      const line = raw.trim();
      const m = /^(?:[-–—•*]|\d+[.)])\s*(.+)$/.exec(line);
      if (m && m[1] && m[1].trim().length > 1) out.push(cut(m[1], 120));
      if (out.length >= CHECKLIST_MAX) return out;
    }
  }
  return out;
}

/**
 * ร่างการ์ดจากข้อความในห้อง — **บริสุทธิ์** (ไม่แตะ DB ไม่แตะ AI) ⇒ เป็นตาข่ายรองรับของทุกเส้นทาง
 * `contactName` ใช้เฉพาะตอนที่ลูกค้ายังไม่ได้พิมพ์อะไรเลย (ห้องที่ทีมเปิดคุยก่อน)
 */
export function draftFromMessages(
  messages: DraftMessage[],
  opts: { now: Date; contactName?: string | null },
): TaskDraft {
  const inbound = messages.filter((m) => m.direction === "IN");
  const bodies = inbound.map((m) => (m.body ?? "").trim()).filter(Boolean);
  const joined = bodies.join("\n");

  const firstLine = (bodies[0] ?? "").split(/\r?\n/)[0] ?? "";
  const title = firstLine.trim()
    ? cut(firstLine, TITLE_MAX)
    : cut(`งานจากแชท${opts.contactName ? ` — ${opts.contactName}` : ""}`, TITLE_MAX);

  const summary = joined.length <= SUMMARY_MAX ? joined : `${joined.slice(0, SUMMARY_MAX - 1)}…`;
  const dueAt = joined ? guessDueAt(joined, opts.now) : null;

  return {
    title,
    summary,
    dueAt,
    dueGuessed: dueAt !== null,
    checklist: bulletsOf(bodies),
    readCount: messages.length,
  };
}

// ───────────────────────── ตัวร่างที่ให้ AI ช่วย ─────────────────────────

const AiDraftSchema = z.object({
  title: z.string().min(1).max(300),
  summary: z.string().max(4000).optional().nullable(),
  dueAt: z.string().max(60).optional().nullable(),
  checklist: z.array(z.string().max(300)).max(20).optional().nullable(),
});

/** ตัดรั้ว ```json ที่โมเดลชอบใส่มา แล้วหยิบก้อน {...} ก้อนแรก */
function extractJson(raw: string): unknown {
  const text = String(raw ?? "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

export type DraftDeps = { complete?: (prompt: string) => Promise<string> };

/**
 * ร่างการ์ดจากห้องแชทจริง — อ่านข้อความล่าสุด ≤ 12 ใบ (ไม่รวมบันทึกภายใน) แล้วให้ AI ช่วยเรียบเรียง
 * ไม่มีคีย์ AI / เครดิตหมด / โมเดลตอบเพี้ยน → ใช้ `draftFromMessages` แทน (`aiUsed: false`) ไม่ throw
 */
export async function draftTaskFromChat(
  ctx: ChatCtx,
  conversationId: string,
  opts?: { deps?: DraftDeps; now?: Date },
): Promise<TaskDraftResult> {
  const now = opts?.now ?? new Date();
  const conv = await prisma.chatConversation.findFirst({
    where: { id: conversationId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, contact: { select: { displayName: true } } },
  });
  if (!conv) throw new Error("ไม่พบบทสนทนานี้");

  const rows = await prisma.chatMessage.findMany({
    where: { conversationId: conv.id, tenantId: ctx.tenantId, systemId: ctx.systemId, isInternal: false },
    orderBy: { createdAt: "desc" },
    take: READ_WINDOW,
    select: { id: true, direction: true, body: true, createdAt: true, senderName: true },
  });
  const messages: DraftMessage[] = rows
    .slice()
    .reverse()
    .map((m) => ({ id: m.id, direction: m.direction, body: m.body, createdAt: m.createdAt, senderName: m.senderName }));

  const base = draftFromMessages(messages, { now, contactName: conv.contact?.displayName ?? null });
  const complete = opts?.deps?.complete ?? (await providerCompletion(ctx.tenantId, ctx.actorUserId));
  if (!complete) return { ...base, aiUsed: false };

  try {
    const raw = await complete(buildDraftPrompt(messages, now));
    const parsed = AiDraftSchema.safeParse(extractJson(raw));
    if (!parsed.success) return { ...base, aiUsed: false };
    const ai = parsed.data;
    const aiDueRaw = ai.dueAt ? new Date(ai.dueAt) : null;
    const dueOk = aiDueRaw !== null && Number.isFinite(aiDueRaw.getTime());
    // AI มักคืน "สิ้นวัน" (23:59) หรือ "ต้นวัน" (00:00) เมื่อลูกค้าบอกแค่วัน → ปรับเป็น 18:00 ไทยของวันนั้น
    // ให้ตรงกับความหมายเดียวกับตัวร่างสำรอง (ปลายวันทำงาน) · ถ้า AI ให้เวลาเจาะจง (เช่น 10:00) เก็บไว้ตามนั้น
    const aiDue = dueOk ? snapDefaultTimeToBkkEvening(aiDueRaw) : null;
    const checklist = (ai.checklist ?? []).map((t) => cut(t, 120)).filter(Boolean).slice(0, CHECKLIST_MAX);
    return {
      title: cut(ai.title, TITLE_MAX),
      summary: (ai.summary ?? base.summary).slice(0, SUMMARY_MAX),
      dueAt: dueOk ? aiDue : base.dueAt,
      dueGuessed: dueOk ? true : base.dueGuessed,
      checklist: checklist.length > 0 ? checklist : base.checklist,
      readCount: base.readCount,
      aiUsed: true,
    };
  } catch {
    // โมเดลล่ม/หมดเวลา = คนยังต้องเปิดงานได้ทันที (ตัวร่างสำรองพร้อมอยู่แล้ว)
    return { ...base, aiUsed: false };
  }
}

/**
 * ตัวเรียกโมเดลจริงของร้าน (คีย์ + เครดิตอยู่ที่ `src/lib/ai/*`) — `null` = ร้านนี้ยังใช้ AI ไม่ได้
 * หักเครดิตช่อง `CHAT_SUGGEST` (กระเป๋า "ทีมงานใช้ AI ตอนคุยกับลูกค้า") — ดู "หนี้" ใน wo-notes
 */
async function providerCompletion(
  tenantId: string,
  userId: string,
): Promise<((text: string) => Promise<string>) | null> {
  const provider = resolveProvider("smart");
  if (!provider) return null;
  if (!(await canSpend(tenantId))) return null;
  return async (text: string) => {
    // 🔴 งบ token ขาออกต้องเผื่อ "ภาษาไทยกิน token ~4 เท่าของอังกฤษ" ([[reference_llm_thai_token_cost]])
    //    วัดจริง 7 ก.ย.: ชื่อ+สรุป+เช็คลิสต์ไทยชุดหนึ่ง = ~700 token ⇒ เพดาน 700 ตัด JSON กลางคัน
    //    แล้ว zod ไม่ผ่าน → ตกไปใช้ตัวร่างสำรอง "เงียบ ๆ" ทั้งที่จ่ายค่าโมเดลไปแล้ว (จ่ายฟรี)
    const reply = await provider.chat([{ role: "user", content: text }], { maxTokens: 1500 });
    await chargeUsageSafe(
      { tenantId },
      {
        source: "CHAT_SUGGEST",
        model: reply.model || SMART_MODEL,
        tokensIn: reply.tokensIn,
        tokensOut: reply.tokensOut,
        userId,
        note: "ร่างการ์ดจากแชท (K3.2)",
      },
    );
    return reply.text;
  };
}

// ───────────────────────── สร้างการ์ดจริง ─────────────────────────

/** ข้อความลูกค้าใบล่าสุด = ตัวชี้ว่า "รอบนี้" ของบทสนทนาคืออะไร (ลูกค้าทักใหม่ = เปิดงานใบใหม่ได้) */
function lastInboundId(messages: { id: string; direction: string }[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.direction === "IN") return m.id;
  }
  return null;
}

/**
 * สร้างการ์ดจากบทสนทนา แล้วแปะบันทึกภายในกลับเข้าห้องให้ทีมเห็นว่า "งานนี้ถูกเปิดแล้ว"
 *
 * ลำดับด่าน (สำคัญกว่าลำดับใด ๆ ในไฟล์นี้):
 *   สวิตช์ร้าน → สิทธิ์อ่านแชทของคนกด → ห้องมีจริงในร้านนี้ → บทบาทบอร์ดปลายทาง (ในประตูของบอร์ดงาน)
 */
export async function createTaskFromChat(
  ctx: ChatCtx,
  actor: TaskActor,
  input: CreateTaskFromChatInput,
): Promise<CreateTaskFromChatResult> {
  const cfg = await chatTaskButtonConfig(ctx.tenantId);
  if (!cfg) {
    throw new Error('ยังไม่ได้เปิด "สร้างงานจากแชท" — เปิดได้ที่ บอร์ดงาน › ตั้งค่า › การเชื่อมต่อ');
  }
  if (!evaluate({ role: actor.role, unitAccess: actor.unitAccess, permissions: actor.permissions }, { module: "chat", action: CHAT_READ_ACTION })) {
    throw new Error("ต้องมีสิทธิ์อ่านแชทลูกค้าก่อน จึงจะเปิดงานจากบทสนทนาได้");
  }

  const conv = await prisma.chatConversation.findFirst({
    where: { id: input.conversationId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: {
      id: true,
      channel: true,
      contact: { select: { displayName: true, phone: true, email: true } },
    },
  });
  if (!conv) throw new Error("ไม่พบบทสนทนานี้");

  const recent = await prisma.chatMessage.findMany({
    where: { conversationId: conv.id, tenantId: ctx.tenantId, systemId: ctx.systemId, isInternal: false },
    orderBy: { createdAt: "desc" },
    take: READ_WINDOW,
    select: { id: true, direction: true, createdAt: true },
  });
  const ordered = recent.slice().reverse();
  const anchor = lastInboundId(ordered) ?? ordered[ordered.length - 1]?.id ?? conv.id;

  const attachments = input.link.copyAttachments
    ? (
        await prisma.chatAttachment.findMany({
          where: { tenantId: ctx.tenantId, systemId: ctx.systemId, message: { conversationId: conv.id } },
          orderBy: { createdAt: "asc" },
          take: ATTACHMENT_MAX,
          select: { storageKey: true, url: true, fileName: true, mimeType: true, sizeBytes: true },
        })
      ).map((a) => ({
        storageKey: a.storageKey,
        url: a.url,
        fileName: a.fileName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
      }))
    : [];

  const kanbanCtx = {
    tenantId: ctx.tenantId,
    systemId: cfg.kanbanSystemId,
    actorUserId: ctx.actorUserId,
    // 🔴 ส่ง actor ลงไปด้วย = ประตูของบอร์ดงานจะบังคับด่าน "EDITOR ของบอร์ดปลายทาง" ให้เอง
    //    (คนกดเลือกบอร์ดเองได้จากแผง ⇒ ห้ามเชื่อ boardId ที่ส่งมาจากหน้าจอ)
    actor: { userId: actor.userId, role: actor.role, unitAccess: actor.unitAccess, permissions: actor.permissions },
  };

  const result = await createCardFromExternal(kanbanCtx, {
    boardId: input.boardId || cfg.boardId,
    columnId: input.columnId ?? (input.boardId === cfg.boardId ? cfg.columnId : null),
    title: input.title,
    description: input.description ?? null,
    assigneeUserIds: input.assigneeUserIds ?? [],
    dueAt: input.dueAt ?? null,
    labelIds: input.labelIds ?? [],
    checklist: input.checklist ?? [],
    sourceType: "CHAT",
    sourceKey: `chat:conv:${conv.id}:${anchor}`,
    links: input.link.conversation ? [{ linkType: "CHAT_CONVERSATION", linkId: conv.id, role: "SOURCE" }] : [],
    party:
      input.link.party && conv.contact?.displayName
        ? { name: conv.contact.displayName, phone: conv.contact.phone, email: conv.contact.email }
        : null,
    attachments,
  });

  const cardHref = `/app/sys/${cfg.kanbanSystemId}/kanban/b/${input.boardId || cfg.boardId}?card=${result.cardId}`;

  // 🔴 แปะบันทึกภายในเฉพาะตอน "เพิ่งสร้างจริง" — กดซ้ำแล้วมีบันทึกซ้ำ = ห้องเต็มไปด้วยเสียงรบกวน
  if (result.created) {
    await sendReply({
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      conversationId: conv.id,
      senderUserId: ctx.actorUserId,
      isInternal: true,
      body: `สร้างงาน #${result.cardNo ?? "-"} "${cut(input.title, 120)}" จากบทสนทนานี้ · ดูงาน ${cardHref}`,
    });
  }

  return {
    cardId: result.cardId,
    cardNo: result.cardNo,
    created: result.created,
    partyId: result.partyId ?? null,
    cardHref,
  };
}

// ───────────────────────── prompt (ภาษาอังกฤษ · ไม่มีข้อมูลระบุตัวลูกค้า) ─────────────────────────
//
// 🔴 อยู่ท้ายไฟล์โดยตั้งใจ: ทุกอย่างที่ประกอบขึ้นเป็นคำสั่งของโมเดลอยู่ตรงนี้ที่เดียว อ่านจบใน 20 บรรทัด
//    ว่า "อะไรบ้างที่ออกจากร้านไปหาผู้ให้บริการ LLM" — คำตอบคือ **เนื้อข้อความกับทิศทางเท่านั้น**
//    ไม่มีชื่อผู้ติดต่อ ไม่มีเบอร์ ไม่มีอีเมล ไม่มีรหัสภายในใด ๆ

function buildDraftPrompt(messages: DraftMessage[], now: Date): string {
  const transcript = messages
    .map((m) => `${m.direction === "IN" ? "CUSTOMER" : "STAFF"}: ${oneLine(m.body ?? "")}`)
    .filter((line) => line.length > 10)
    .join("\n");
  const nowBkk = new Date(now.getTime() + BKK_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
  const prompt = [
    "You turn a customer support chat into ONE task card for a Thai dive shop back office.",
    `Current local time in Bangkok (UTC+7) is ${nowBkk}.`,
    "Read the transcript and reply with JSON only, no prose, no markdown fences.",
    'Shape: {"title": string, "summary": string, "dueAt": string|null, "checklist": string[]}',
    "Rules:",
    `- title: Thai, one line, at most ${TITLE_MAX} characters, states the action the team must take.`,
    `- summary: Thai, at most ${SUMMARY_MAX} characters, keep every number the customer gave (people, dates, budget).`,
    "- dueAt: ISO-8601 with timezone offset, derived only from a deadline the customer stated; otherwise null.",
    `- checklist: at most ${CHECKLIST_MAX} short Thai steps; empty array when the chat implies no sub-steps.`,
    "- Never invent prices, availability or promises. Unknown stays unknown.",
    "Transcript:",
    transcript,
  ].join("\n");
  return prompt;
}
