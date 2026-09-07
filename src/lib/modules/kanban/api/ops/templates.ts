// ops/templates.ts — op ของ "เทมเพลตการ์ด" ของบอร์ด (K2.7 · เปิดผ่าน REST ใน K2.12)
//
// 🔴 ต่างจาก `templates.list` ของ `ops/misc.ts` (เทมเพลต**บอร์ด** — โครงคอลัมน์/ป้าย/การ์ดตั้งต้นทั้งบอร์ด):
//    ที่นี่คือเทมเพลต**การ์ด** — บันทึกการ์ดที่มีอยู่แล้วเป็นต้นแบบของบอร์ดใบเดียว แล้วใช้สร้างการ์ดใหม่ซ้ำได้
//
// กติกาเดียวกับ `ops/boards.ts` — ตัวตัดสินสิทธิ์จริงอยู่ที่ `card-templates.ts` เอง (`assertBoardRole`/
// `assertCardRole` เรียกจากในนั้นแล้ว: อ่าน = VIEWER · บันทึกเทมเพลตใหม่จากการ์ด = ADMIN) ⇒ ไม่ต้องตรวจซ้ำ

import { z } from "zod";
import { listCardTemplates, saveAsCardTemplate } from "../../card-templates";
import { kanbanActorOf, kanbanCtxOf } from "../actor";
import { defineKanbanOp, type ApiOp } from "../op";

const templatesCardsList = defineKanbanOp({
  id: "templates.cards.list",
  method: "GET",
  path: "/boards/{id}/card-templates",
  kind: "read",
  action: "kanban.board.read",
  summary: "List the card templates saved on a board (name, label count, checklist item count), in display order.",
  label: "รายการเทมเพลตการ์ด",
  test: "K2.12-S3.1",
  async handler({ actor, params }) {
    const ctx = kanbanCtxOf(actor);
    return listCardTemplates(ctx, kanbanActorOf(actor), params.id!);
  },
});

const templatesCardsCreateInput = z
  .object({ name: z.string().trim().min(1).max(60).describe("Name of the new template.") })
  .strict();

const templatesCardsCreate = defineKanbanOp({
  id: "templates.cards.create",
  method: "POST",
  path: "/cards/{id}/card-templates",
  kind: "write",
  action: "kanban.template.manage",
  summary: "Save the given card as a new template of its board: title, description, labels, checklists (text only) and custom field values. Due date, assignees, attachments and ticked state are never copied. Requires the ADMIN role on the board.",
  label: "บันทึกเป็นเทมเพลตการ์ด",
  input: templatesCardsCreateInput,
  test: "K2.12-S3.1",
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    return saveAsCardTemplate(ctx, kanbanActorOf(actor), params.id!, { name: input.name });
  },
});

export const TEMPLATES_CARDS_OPS: ApiOp[] = [templatesCardsList, templatesCardsCreate];
