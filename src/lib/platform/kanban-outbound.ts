// kanban-outbound.ts — "ย้อนกลับ" (K3.4 · พิมพ์เขียว `docs/modules/13-kanban-v2.md` §9.3)
//
// K3.3 พาของจากโมดูลอื่นเข้ามาเป็นการ์ด (ขาเข้า) · ไฟล์นี้คือ **ขาออก**: การ์ดที่ผูกของไว้ถูกปิดแล้ว
// ปลายทางควรรู้ด้วย — ห้องแชทที่เป็นต้นเรื่องได้บันทึกภายใน 1 บรรทัด ส่วนเอกสารบัญชีได้แค่รอยประวัติ
//
// 🔴 ทำไมอยู่ที่ `src/lib/platform/` ไม่ใช่ในโมดูลบอร์ดงาน
//    งานของไฟล์นี้คือ "อ่านการ์ด แล้วไปเขียนที่โมดูลปลายทาง (แชท)" ⇒ เขียนไว้ในโมดูล kanban เมื่อไหร่
//    ก็เกิดเส้น `kanban→chat` ทันที ซึ่งกลับทางกับ `chat→kanban` ที่มีอยู่แล้ว (K3.2) = วงกลม
//    composition root อ่าน/เขียนได้ทุกโมดูล ⇒ ขาออกทุกเส้นมาอยู่ที่นี่ที่เดียว (ฝาแฝดของ kanban-bridges)
//
// 🔴 กติกาที่ถือไว้ทั้งไฟล์
//  1. **ยิงซ้ำได้เสมอ** — คิว outbox retry ได้ · การปิดการ์ดใบเดียวอาจเดินเข้ามาหลายรอบ
//     ⇒ บันทึกในแชทกันซ้ำด้วย `ChatMessage.meta.kanbanKey` = `kanban.card.completed#{cardId}#{completedAt}`
//     (อ่านก่อนเขียนทุกครั้ง) · รอยประวัติของเอกสารบัญชีกันซ้ำด้วย "การ์ดใบนี้ + เอกสารใบนี้"
//     🔴 ตั้งใจ**ไม่**ผูก completedAt กับรอยประวัติบัญชี: การ์ดที่ถูกเปิด-ปิดสลับไปมา 5 รอบ ต้องไม่ทิ้ง
//        รอย "แจ้งเอกสาร" 5 บรรทัดในประวัติการ์ดเดียวกัน (ประวัติมีไว้เล่าเรื่อง ไม่ใช่ log ของคิว)
//        ส่วนบันทึกในแชทผูก completedAt เพราะ "ปิดใหม่อีกครั้ง" เป็นข่าวที่ทีมในห้องควรได้ยินซ้ำ
//  2. **ไม่แตะสถานะของปลายทาง** (§9.3) — เอกสารบัญชียังเป็นของโมดูลบัญชี: ไฟล์นี้ไม่ import `account`
//     และไม่เขียน `prisma.account*` แม้แต่ตัวเดียว · ปิดงานบนบอร์ดไม่ใช่การอนุมัติเอกสาร
//  3. **เขียนแชทผ่านประตูของโมดูล** — `chat/service#sendReply({ isInternal: true })` เท่านั้น
//     (ห้ามแทรกแถวข้อความลงตารางแชทเอง — ประตูนั้นคุมเรื่อง unit/ช่องทาง/denorm ให้อยู่แล้ว)
//  4. **พังต้องเงียบ** — ผู้เรียกคือ consumer ของคิวกลาง · ปลายทางหาย/สิทธิ์ไม่พอ = ข้ามเงียบ
//     ข้อผิดพลาดจริงลง `logOps("WARN", …)` แล้วจบ ห้ามโยนต่อจนคิวทั้งระบบตันเพราะของแถมใบเดียว
//  5. บันทึกภายในเป็น **โน้ตของทีม** ไม่ใช่ข้อความถึงลูกค้า (`isInternal: true` ⇒ ไม่ยิงออกช่องทาง)

import { prisma } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { sendReply } from "@/lib/modules/chat/service";
import { logActivity } from "@/lib/modules/kanban/activity-log";

/** รูปของ event ที่ consumer ส่งเข้ามา (ตรงกับ `OutboxHandler` ของ `core/outbox`) */
export type OutboundEvent = {
  id: string;
  tenantId: string;
  type: string;
  payload: unknown;
  systemId: string | null;
  unitId: string | null;
};

/** payload ของ `kanban.card.completed` เท่าที่ขาออกต้องใช้ (มาจากคิว ⇒ ตรวจรูปเองทุกฟิลด์) */
type CompletedPayload = {
  cardId: string;
  completedAt: string;
  cardNo: number | null;
  actorUserId: string | null;
};

function readCompleted(payload: unknown): CompletedPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const cardId = typeof p.cardId === "string" && p.cardId.trim() ? p.cardId : null;
  const completedAt = typeof p.completedAt === "string" && p.completedAt.trim() ? p.completedAt : null;
  if (!cardId || !completedAt) return null;
  return {
    cardId,
    completedAt,
    cardNo: typeof p.cardNo === "number" ? p.cardNo : null,
    actorUserId: typeof p.actorUserId === "string" && p.actorUserId.trim() ? p.actorUserId : null,
  };
}

/** ตัดข้อความยาวให้พอดีบรรทัดเดียวของบันทึกภายใน (ชื่อการ์ดยาว 300 ตัวอักษรไม่ช่วยใครในห้องแชท) */
function cut(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * ชื่อคนที่ทีมในห้องแชทควรเห็น — `null` (ไม่มีคนกด) = "ระบบอัตโนมัติ" ตรง ๆ
 * 🔴 ห้าม fallback เป็นชื่อคนอื่น: บันทึกที่บอกว่า "ปิดโดยคุณ ก" ทั้งที่กฎอัตโนมัติเป็นคนปิด
 *    คือการโกหกทีม (และเป็นหลักฐานผิด ๆ เวลาย้อนดูว่าใครทำอะไร)
 */
async function closerName(actorUserId: string | null): Promise<string> {
  if (!actorUserId) return "ระบบอัตโนมัติ";
  const u = await prisma.user.findUnique({ where: { id: actorUserId }, select: { name: true, email: true } });
  return u?.name?.trim() || u?.email?.trim() || "ผู้ใช้ในระบบ";
}

/** เจ้าของร้านคนแรก — ผู้ส่งสำรองของบันทึกภายในเมื่อไม่มีทั้งคนปิดและคนสร้างการ์ด */
async function firstOwnerUserId(tenantId: string): Promise<string | null> {
  const m = await prisma.membership.findFirst({
    where: { tenantId, role: "OWNER" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  return m?.userId ?? null;
}

/**
 * แปะบันทึกภายในในห้องแชทที่การ์ดผูกไว้ (1 ข้อความต่อ 1 การปิด)
 * ห้อง/ระบบแชทถูกลบไปแล้ว = ข้ามเงียบ (การ์ดยังปิดได้ตามปกติ — ปลายทางหายไม่ใช่ความผิดของคนกด)
 */
async function noteInChat(args: {
  tenantId: string;
  conversationId: string;
  kanbanKey: string;
  body: string;
  senderUserId: string;
}): Promise<void> {
  const conv = await prisma.chatConversation.findFirst({
    where: { id: args.conversationId, tenantId: args.tenantId },
    select: { id: true, systemId: true },
  });
  if (!conv) return;

  // กันซ้ำ: บันทึกของ "การปิดครั้งนี้" มีอยู่แล้วหรือยัง (meta.kanbanKey เป็นกุญแจ)
  const already = await prisma.chatMessage.findFirst({
    where: {
      conversationId: conv.id,
      tenantId: args.tenantId,
      isInternal: true,
      meta: { path: ["kanbanKey"], equals: args.kanbanKey },
    },
    select: { id: true },
  });
  if (already) return;

  const res = await sendReply({
    tenantId: args.tenantId,
    systemId: conv.systemId,
    conversationId: conv.id,
    senderUserId: args.senderUserId,
    isInternal: true,
    body: args.body,
    meta: { kanbanKey: args.kanbanKey },
  });
  if (!res.ok) {
    await logOps("WARN", "kanban", "แปะบันทึกปิดงานในห้องแชทไม่สำเร็จ", {
      tenantId: args.tenantId,
      detail: `conversation=${conv.id} · ${res.reason ?? "ไม่ทราบสาเหตุ"}`,
    });
  }
}

/**
 * รอยประวัติของเอกสารบัญชีที่การ์ดผูกไว้ — **แค่บอกว่างานฝั่งบอร์ดปิดแล้ว** ไม่แตะเอกสาร
 * (ทีมบัญชีเปิดประวัติการ์ดแล้วเห็นว่ามีเอกสารใบไหนเกี่ยวข้อง โดยที่สถานะเอกสารไม่ถูกใครแอบเปลี่ยน)
 */
async function noteAccountDoc(args: {
  tenantId: string;
  boardId: string;
  cardId: string;
  linkId: string;
  label: string | null;
  kanbanKey: string;
}): Promise<void> {
  const already = await prisma.kanbanActivity.findFirst({
    where: {
      cardId: args.cardId,
      tenantId: args.tenantId,
      type: "CARD_UPDATED",
      AND: [
        { data: { path: ["outbound"], equals: "ACCOUNT_DOC" } },
        { data: { path: ["linkId"], equals: args.linkId } },
      ],
    },
    select: { id: true },
  });
  if (already) return;

  await logActivity(prisma, {
    tenantId: args.tenantId,
    boardId: args.boardId,
    cardId: args.cardId,
    actorUserId: null,
    type: "CARD_UPDATED",
    data: { outbound: "ACCOUNT_DOC", linkId: args.linkId, label: args.label, kanbanKey: args.kanbanKey },
  });
}

/**
 * `kanban.card.completed` → บอกปลายทางที่การ์ดผูกไว้ว่า "งานฝั่งบอร์ดปิดแล้ว"
 *
 * 🔴 ตัวนี้เป็น **ของแถมท้าย consumer** (`compose(เดิม, …)` ใน outbox-consumers.ts) ⇒ ทุกเส้นทางในนี้
 *    ต้องจบด้วย "ไม่ทำอะไร" ได้เสมอ · ห้ามโยน error ออกไปจนสะเทือน event หลัก
 */
export async function cardCompleted(evt: OutboundEvent): Promise<void> {
  const p = readCompleted(evt.payload);
  if (!p) return;

  const card = await prisma.kanbanCard.findFirst({
    where: { id: p.cardId, tenantId: evt.tenantId },
    select: { id: true, systemId: true, boardId: true, title: true, cardNo: true, createdById: true },
  });
  if (!card) return;

  const links = await prisma.kanbanCardLink.findMany({
    where: { cardId: card.id, tenantId: evt.tenantId, removedAt: null },
    orderBy: { createdAt: "asc" },
    select: { linkType: true, linkId: true, label: true },
  });
  if (links.length === 0) return;

  const kanbanKey = `kanban.card.completed#${card.id}#${p.completedAt}`;
  const cardNo = p.cardNo ?? card.cardNo;
  const chatLinks = links.filter((l) => l.linkType === "CHAT_CONVERSATION");
  const docLinks = links.filter((l) => l.linkType === "ACCOUNT_DOC");

  if (chatLinks.length > 0) {
    // ผู้ส่งของบันทึกภายใน: คนปิด → คนสร้างการ์ด → เจ้าของร้านคนแรก (ไม่มีเลย = ไม่แปะ)
    const senderUserId = p.actorUserId ?? card.createdById ?? (await firstOwnerUserId(evt.tenantId));
    if (senderUserId) {
      const who = await closerName(p.actorUserId);
      const href = `/app/sys/${card.systemId}/kanban/b/${card.boardId}?card=${card.id}`;
      const body = `งาน #${cardNo ?? "-"} "${cut(card.title, 120)}" ปิดแล้วโดย ${who} · ดูงาน ${href}`;
      for (const l of chatLinks) {
        try {
          await noteInChat({ tenantId: evt.tenantId, conversationId: l.linkId, kanbanKey, body, senderUserId });
        } catch (e) {
          await logOps("WARN", "kanban", "ขาออกของบอร์ดงาน (แชท) ล้มเหลว", {
            tenantId: evt.tenantId,
            detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
          });
        }
      }
    }
  }

  for (const l of docLinks) {
    try {
      await noteAccountDoc({
        tenantId: evt.tenantId,
        boardId: card.boardId,
        cardId: card.id,
        linkId: l.linkId,
        label: l.label,
        kanbanKey,
      });
    } catch (e) {
      await logOps("WARN", "kanban", "ขาออกของบอร์ดงาน (เอกสารบัญชี) ล้มเหลว", {
        tenantId: evt.tenantId,
        detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
      });
    }
  }
}
