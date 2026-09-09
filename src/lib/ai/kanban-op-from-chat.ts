// kanban-op-from-chat.ts — เครื่องมือ `kanban_card_from_chat` ของผู้ช่วย AI (K3.5 · §8.2)
//
// 🔴 ทำไม op ตัวนี้อยู่ที่ **ชั้น AI** ไม่ใช่ในทะเบียน `KANBAN_OPS` ของโมดูลบอร์ดงาน
//    ด่านสถาปัตยกรรม F2 ห้ามโมดูลบอร์ดงานรู้จักโมดูลแชท (บอร์ดงานต้องไม่รู้ว่าโลกนี้มีแชท) และ
//    ฝั่งที่ "รู้เรื่องทั้งสองข้าง" ตามที่ K3.2 วางไว้คือ `chat/task-from-chat.ts`
//    ⇒ ตัวประกอบร่าง (composition root) ของผู้ช่วย AI คือที่เดียวที่หยิบทั้งสองฝั่งมาต่อกันได้
//    ผลที่ตามมาโดยตั้งใจ: **ไม่มี endpoint REST ของ op นี้** (ทะเบียน REST = `KANBAN_OPS` ล้วน)
//    มันเป็นเครื่องมือของผู้ช่วยอย่างเดียว — ผู้เชื่อมต่อภายนอกที่อยากทำแบบเดียวกันใช้ปุ่มในหน้าแชท
//
// ทางเดินของงาน (เหมือน tool เขียนตัวอื่นเป๊ะ ๆ):
//   เสนอ  — อ่านบทสนทนา ≤ 12 ข้อความผ่าน `draftTaskFromChat` (ตัวเดียวกับปุ่มในหน้าแชท) แล้วคืน
//           ข้อเสนอที่ "เห็นเนื้อการ์ดครบก่อนกด" (ชื่อ/รายละเอียด/บอร์ด/คอลัมน์/กำหนดส่ง/เช็คลิสต์)
//   ยืนยัน — `createTaskFromChat` ด้วยสิทธิ์ของ **คนกด** (ลิงก์ห้องแชท + บันทึกภายในเหมือนกดปุ่มเอง)
//
// 🔴 สวิตช์รายร้าน `openTaskFromChat` คือด่านจริงทั้งสองจังหวะ — ปิดอยู่ = ผู้ช่วยเสนอไม่ได้เลย
//    (ไม่ใช่ "เสนอได้แต่กดแล้วพัง") ⇒ AI ไม่มีทางข้ามสวิตช์ที่เจ้าของร้านปิดไว้

import { z } from "zod";
import { prisma, tenantDb } from "@/lib/core/db";
import { ApiError } from "@/lib/api/respond";
import { defineOp, type ApiOp } from "@/lib/api/op";
import { chatTaskButtonConfig } from "@/lib/modules/kanban/integrations";
// 🔴 import แบบขี้เกียจ: task-from-chat → chat/guard → core/context → lib/env (parse process.env ตอน import)
//    ถ้า import static ทะเบียน tool จะโหลดไม่ได้ในบริบทที่ไม่มี env (fitness F10.1 ใน pre-commit hook)
const chatTask = () => import("@/lib/modules/chat/task-from-chat");
import type { KanbanToolAdapter } from "./kanban-adapter";

const SWITCH_OFF_TH =
  'ยังไม่ได้เปิด "สร้างงานจากแชท" — เปิดได้ที่ บอร์ดงาน › ตั้งค่า › การเชื่อมต่อ แล้วสั่งอีกครั้ง';

// ───────────────────────── สคีมาที่ผู้ช่วยกรอก (ตอนเสนอ) ─────────────────────────

const fromChatArgs = z
  .object({
    conversationId: z
      .string()
      .min(1)
      .max(40)
      .describe("Id of the customer chat conversation to open a task for (from the chat tools or the inbox)."),
    boardName: z
      .string()
      .max(120)
      .optional()
      .describe("Board the card should land on. Omit to use the board the shop configured for chat tasks."),
    columnName: z.string().max(120).optional().describe("Column on that board. Omit to use the configured or first column."),
  })
  .strict();

// ───────────────────────── สคีมาที่ลงมือจริง (ตอนคนกดยืนยัน) ─────────────────────────
// 🔴 ตรวจซ้ำตอนยืนยันเสมอ: ข้อเสนออาจถูกกดหลังจากบอร์ด/คอลัมน์ถูกลบไปแล้ว

const fromChatInput = z
  .object({
    conversationId: z.string().min(1).max(40),
    title: z.string().trim().min(1).max(300),
    description: z.string().max(20000).nullable().optional(),
    boardId: z.string().min(1).max(40),
    columnId: z.string().max(40).nullable().optional(),
    dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
    checklist: z.array(z.string().min(1).max(200)).max(10).optional(),
  })
  .strict();

/** บทสนทนาต้องอยู่ในร้านเดียวกัน — `systemId` ของแชทหาเอาจากแถว ไม่รับจากผู้เรียก (กันยิงข้ามระบบ) */
async function findConversation(
  tenantId: string,
  conversationId: string,
): Promise<{ id: string; systemId: string; contactName: string | null } | null> {
  const row = await prisma.chatConversation.findFirst({
    where: { id: conversationId, tenantId },
    select: { id: true, systemId: true, contact: { select: { displayName: true } } },
  });
  return row ? { id: row.id, systemId: row.systemId, contactName: row.contact?.displayName ?? null } : null;
}

async function resolveBoard(
  tenantId: string,
  systemId: string,
  boardName: string | undefined,
  fallbackBoardId: string,
): Promise<{ id: string; name: string }> {
  const db = tenantDb({ tenantId, systemId });
  const want = boardName?.trim().toLowerCase();
  if (want) {
    const boards = await db.kanbanBoard.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
    const hit = boards.find((b) => b.name.toLowerCase().includes(want));
    if (!hit) throw new Error(`ไม่พบบอร์ดชื่อ "${boardName}" ในระบบบอร์ดงานนี้`);
    return hit;
  }
  const board = await db.kanbanBoard.findFirst({ where: { id: fallbackBoardId }, select: { id: true, name: true } });
  if (!board) throw new Error("บอร์ดปลายทางที่ตั้งไว้ในการเชื่อมต่อถูกลบไปแล้ว — เลือกบอร์ดใหม่ที่ ตั้งค่า › การเชื่อมต่อ");
  return board;
}

async function resolveColumn(
  tenantId: string,
  systemId: string,
  boardId: string,
  columnName: string | undefined,
  fallbackColumnId: string | null,
): Promise<string | null> {
  const db = tenantDb({ tenantId, systemId });
  const columns = await db.kanbanColumn.findMany({
    where: { boardId, status: "ACTIVE" },
    orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }],
    select: { id: true, name: true },
  });
  const want = columnName?.trim().toLowerCase();
  if (want) {
    const hit = columns.find((c) => c.name.toLowerCase().includes(want));
    if (!hit) throw new Error(`ไม่พบคอลัมน์ชื่อ "${columnName}" ในบอร์ดนี้`);
    return hit.id;
  }
  if (fallbackColumnId && columns.some((c) => c.id === fallbackColumnId)) return fallbackColumnId;
  return columns[0]?.id ?? null;
}

// ───────────────────────── ตัวเตรียมข้อเสนอ ─────────────────────────

export const CARD_FROM_CHAT_ADAPTER: KanbanToolAdapter = {
  args: fromChatArgs,
  description:
    "Turn a customer chat conversation into ONE task card: reads the last messages of the thread, drafts a Thai title, description, due date and checklist, then asks the user to confirm.",
  toCall: async (raw, tenantId, systemId) => {
    const args = fromChatArgs.parse(raw);
    // ด่านที่ 1 — สวิตช์ของร้าน (ผู้ช่วยข้ามไม่ได้ ไม่ว่าใครสั่ง)
    const cfg = await chatTaskButtonConfig(tenantId);
    if (!cfg) throw new Error(SWITCH_OFF_TH);

    const conv = await findConversation(tenantId, args.conversationId);
    if (!conv) throw new Error("ไม่พบบทสนทนานี้ในร้านนี้");

    const board = await resolveBoard(tenantId, systemId, args.boardName, cfg.boardId);
    const columnId = await resolveColumn(
      tenantId,
      systemId,
      board.id,
      args.columnName,
      board.id === cfg.boardId ? cfg.columnId : null,
    );

    // ผู้ช่วยยังไม่มีตัวตนของคน ⇒ ไม่มี userId ให้ลงบันทึกการใช้เครดิต (ตัวร่างสำรองทำงานได้เสมอ)
    const draft = await (await chatTask()).draftTaskFromChat({ tenantId, systemId: conv.systemId, actorUserId: "" }, conv.id);

    return {
      input: {
        conversationId: conv.id,
        title: draft.title,
        description: draft.summary,
        boardId: board.id,
        columnId,
        dueAt: draft.dueAt ? draft.dueAt.toISOString() : null,
        checklist: draft.checklist,
      },
      summary: [
        `สร้างการ์ด "${draft.title}"`,
        `จากแชทของ ${conv.contactName ?? "ลูกค้า"}`,
        `ลงบอร์ด ${board.name}`,
        `(อ่าน ${draft.readCount} ข้อความล่าสุด)`,
      ].join(" · "),
    };
  },
};

// ───────────────────────── op (ทะเบียนเดียวกับ tool อื่น — kind/สิทธิ์/audit ชุดเดิม) ─────────────────────────

export const CARD_FROM_CHAT_OP: ApiOp = defineOp({
  id: "cards.fromChat",
  module: "kanban",
  method: "POST",
  path: "/cards/from-chat",
  kind: "write",
  action: "kanban.card.create",
  auditAction: "kanban.api.cards.fromChat",
  summary: "Create a task card from a customer chat conversation, linked back to the thread.",
  label: "สร้างการ์ดจากแชท",
  tool: {
    name: "kanban_card_from_chat",
    hint: "Use this when someone asks to open a task for what a customer wrote in chat.",
  },
  input: fromChatInput,
  test: "K3.5-S4.1",
  async handler({ actor, input }) {
    // 🔴 ต้องเป็น "คน" เท่านั้น: เส้นทางนี้เขียนบันทึกภายในเข้าห้องแชทและตรวจสิทธิ์อ่านแชทของคนกด
    //    คีย์ API / ผู้ช่วยล้วน ๆ ไม่มีตัวตนให้ตรวจ ⇒ ปฏิเสธไปเลยดีกว่าทำในนามของ "ไม่มีใคร"
    const userId = actor.userId;
    if (!userId) {
      throw new ApiError(
        403,
        "forbidden",
        "ต้องให้คนในร้านเป็นผู้กดยืนยันการสร้างงานจากแชท",
        "Creating a card from a chat thread requires a real user to confirm it.",
      );
    }
    const conv = await findConversation(actor.tenantId, input.conversationId);
    if (!conv) {
      throw new ApiError(404, "not_found", "ไม่พบบทสนทนานี้ในร้านนี้", "The chat conversation was not found.");
    }
    const m = actor.membership;
    const res = await (await chatTask()).createTaskFromChat(
      { tenantId: actor.tenantId, systemId: conv.systemId, actorUserId: userId },
      { userId, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
      {
        conversationId: conv.id,
        title: input.title,
        description: input.description ?? null,
        boardId: input.boardId,
        columnId: input.columnId ?? null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        checklist: input.checklist ?? [],
        // ⚠️ ต่างจากปุ่มในหน้าแชทตรงนี้จุดเดียว: ไม่ก๊อปไฟล์แนบและไม่สร้างผู้ติดต่อใหม่ให้อัตโนมัติ
        //    (คนกดยืนยันข้อเสนอเห็นแค่ข้อความสรุป ไม่ได้เห็นช่องติ๊ก 3 ช่องเหมือนแผงในหน้าแชท ⇒
        //     ผลข้างเคียงที่เขาไม่ได้เลือกต้องเป็น "น้อยที่สุดที่ยังทำงานได้" = ลิงก์ห้องกลับไปหาต้นเรื่อง)
        link: { conversation: true, party: false, copyAttachments: false },
      },
    );
    return { cardId: res.cardId, cardNo: res.cardNo, created: res.created, cardHref: res.cardHref, title: input.title };
  },
});
