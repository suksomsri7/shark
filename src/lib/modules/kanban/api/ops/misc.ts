// ops/misc.ts — op ที่ไม่ผูกกับบอร์ดใบเดียว: ค้นหาข้ามบอร์ด · งานของคนหนึ่งคน · เทมเพลตบอร์ด
//
// กติกาเดียวกับ `ops/boards.ts` (อ่านหัวไฟล์นั้นก่อน)

import { z } from "zod";
import { ApiError } from "@/lib/api/respond";
import { withExtra } from "@/lib/api/respond";
import { myTasksOverview } from "../../my-tasks";
import { searchCards } from "../../search";
import { listTemplates } from "../../templates";
import { boardRoleForScopes, kanbanActorOf, kanbanCtxOf } from "../actor";
import { defineKanbanOp, type ApiOp } from "../op";

const searchInput = z
  .object({
    q: z.string().max(200).optional().describe("Free text on the card title."),
    assignee: z.string().max(40).optional().describe("User id, or the literal `me` for the user who created this key."),
    label: z.string().max(60).optional().describe("Label name."),
    due: z.enum(["overdue", "today", "week", "none"]).optional().describe("Due bucket."),
    status: z.enum(["open", "done"]).optional().describe("open = not completed, done = completed."),
    board: z.string().max(120).optional().describe("Only boards whose name contains this text."),
    take: z.coerce.number().int().min(1).max(100).optional().describe("How many cards to return. Default 20."),
    cursor: z.string().max(400).optional().describe("`nextCursor` of the previous page."),
  })
  .strict();

const search = defineKanbanOp({
  id: "search",
  method: "GET",
  path: "/search",
  kind: "read",
  action: "kanban.board.read",
  summary: "Search cards across every board this key can see, with the same filters as the app.",
  label: "ค้นหาการ์ดข้ามบอร์ด",
  tool: { name: "kanban_search_cards", hint: "Use this to find a task when the board is unknown, or to list overdue work." },
  input: searchInput,
  test: "K1.15-S2.14",
  async handler({ actor, input }) {
    const res = await searchCards(kanbanCtxOf(actor), kanbanActorOf(actor), {
      ...(input.q ? { q: input.q } : {}),
      ...(input.assignee ? { assignee: input.assignee } : {}),
      ...(input.label ? { label: input.label } : {}),
      ...(input.due ? { due: input.due } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.board ? { board: input.board } : {}),
      ...(input.take ? { take: input.take } : {}),
      cursor: input.cursor ?? null,
    });
    // `data` = รายการการ์ดล้วน ๆ · ยอดรวม/cursor อยู่ระดับบนสุดของซอง (ไม่ใช่ในรายการ)
    return withExtra(res.items, { total: res.total, nextCursor: res.nextCursor ?? null });
  },
});

const myTasksInput = z
  .object({
    userId: z
      .string()
      .max(40)
      .optional()
      .describe("Whose tasks to read. Only a key with `kanban.board.member.manage` may ask about someone else; other keys read the tasks of the user who created the key."),
  })
  .strict();

const myTasks = defineKanbanOp({
  id: "my-tasks",
  method: "GET",
  path: "/my-tasks",
  kind: "read",
  action: "kanban.board.read",
  summary: "The task inbox of one user: cards grouped by due date, checklist items assigned to them and the weekly counters.",
  label: "งานของฉัน",
  tool: { name: "kanban_my_tasks", hint: "Use this to answer 'what do I have to do' or to list someone's open tasks." },
  input: myTasksInput,
  test: "K1.15-S1.3",
  async handler({ actor, input }) {
    const ctx = kanbanCtxOf(actor);
    const self = kanbanActorOf(actor);
    // 🔴 คีย์ที่ไม่ใช่ระดับ ADMIN ถามงานของคนอื่นไม่ได้ (กล่องงานของคนอื่น = ข้อมูลส่วนบุคคล)
    //    คีย์ ADMIN (มี `kanban.board.member.manage`) = เครื่องมือของเจ้าของร้าน ⇒ ถามแทนพนักงานได้
    //    ด่านนี้ใช้กับ **คีย์ API** เท่านั้น — ผู้ช่วย AI ในแอป/คนกดยืนยัน อยู่ในร้านอยู่แล้วและมีด่านของตัวเอง
    //    (สกิล `tasks` ถามว่า "งานของช่างเอกมีอะไรบ้าง" ได้เหมือนตอนก่อน K1.15)
    if (actor.kind === "apikey" && input.userId && input.userId !== self.userId && boardRoleForScopes(actor.scopes) !== "ADMIN") {
      throw new ApiError(
        403,
        "forbidden",
        "คีย์นี้ดูงานของผู้ใช้คนอื่นไม่ได้ — ต้องเป็นคีย์ที่มีสิทธิ์จัดการสมาชิกบอร์ด",
        "This key may only read its own tasks. A key with kanban.board.member.manage can read anyone's.",
        "ใช้คีย์ชุด kanban-admin หรือไม่ต้องส่ง userId",
      );
    }
    // ผู้เรียกที่ไม่ผูกกับคนใดเลย (คีย์รุ่นเก่า / ผู้ช่วย AI) ไม่มี "งานของฉัน" ให้ดู — ต้องระบุ userId มาเสมอ
    if (!input.userId && !actor.userId) {
      throw new ApiError(
        403,
        "forbidden",
        "คีย์นี้ไม่ได้ผูกกับผู้ใช้คนใด — ต้องระบุ userId ว่าจะดูงานของใคร",
        "This key has no owning user. Pass userId to say whose tasks to read.",
        "ส่ง ?userId=<User.id>",
      );
    }
    const target = input.userId ? { ...self, userId: input.userId } : self;
    return myTasksOverview(ctx, target, { now: new Date() });
  },
});

const templatesList = defineKanbanOp({
  id: "templates.list",
  method: "GET",
  path: "/templates",
  kind: "read",
  action: "kanban.board.read",
  summary: "Board templates available to this shop (platform templates first, then the shop's own).",
  label: "รายการเทมเพลตบอร์ด",
  test: "K1.15-S1.3",
  async handler({ actor }) {
    return listTemplates(kanbanCtxOf(actor));
  },
});

export const MISC_OPS: ApiOp[] = [search, myTasks, templatesList];
