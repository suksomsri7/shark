// ops/automation.ts — op ของ "กฎอัตโนมัติ" ของบอร์ด (K2.9 · เปิดผ่าน REST ใน K2.12)
//
// 🔴 `automation.ts` ตรวจสิทธิ์เองครบแล้ว (`assertRuleAdmin` = ADMIN ของบอร์ด **และ** คีย์
//    `kanban.automation.manage` — สองชั้นจริง ๆ ดูหัวไฟล์ automation.ts) ⇒ ไม่ต้องตรวจซ้ำที่นี่
// 🔴 เงื่อนไข/การกระทำของกฎ (`conditions`/`actions`) เป็น discriminated union ที่ซับซ้อน — สคีมาที่นี่รับ
//    แบบหลวม (`z.record`) แล้วปล่อยให้ `automation.ts#parseRuleInput` ตรวจซ้ำอย่างเข้มด้วย zod ของตัวเอง
//    (ข้อความ error ไทยเดิมเป๊ะ ๆ ไม่ต้องเขียนซ้ำที่นี่)

import { z } from "zod";
import { createRule, dryRun, listRules, toggleRule } from "../../automation";
import { kanbanActorOf, kanbanCtxOf } from "../actor";
import { defineKanbanOp, type ApiOp } from "../op";

const RULE_KINDS = ["RULE", "CARD_BUTTON", "BOARD_BUTTON", "SCHEDULED", "DUE_DATE"] as const;

/** ก้อนซอด (shape) ของกฎ ใช้ร่วมกันระหว่าง create/dryRun — ไม่ใช่ ZodObject (spread เข้า `.object()` ทีหลัง) */
const ruleBodyShape = {
  name: z.string().trim().min(1).max(120).describe("Rule name."),
  kind: z.enum(RULE_KINDS).describe("RULE (fires on an event) · CARD_BUTTON · BOARD_BUTTON · SCHEDULED (Thai-time cron subset) · DUE_DATE (N days before/after a card's due date)."),
  event: z.string().max(80).optional().describe("Required when kind is RULE — one of the task board events (GET /boards/{id} does not list them; see the app's rule builder or the docs)."),
  scheduleCron: z.string().max(80).optional().describe("Required when kind is SCHEDULED — subset of cron: 'minute hour * * weekdays', for example '0 8 * * 3' (every Wednesday 08:00 Thai time)."),
  dueOffsetDays: z.number().int().min(-30).max(30).optional().describe("Required when kind is DUE_DATE — negative = before the due date, positive = after."),
  conditions: z
    .array(z.record(z.string(), z.unknown()))
    .max(20)
    .optional()
    .describe("Extra AND conditions on top of the trigger, for example { field: 'label', op: 'has', value: '<labelId>' }."),
  actions: z
    .array(z.record(z.string(), z.unknown()))
    .min(1)
    .describe("What the rule does, for example [{ type: 'move_column', params: { columnId: '<columnId>' } }]. At least one action."),
};

const automationRulesList = defineKanbanOp({
  id: "automation.rules.list",
  method: "GET",
  path: "/boards/{id}/automation/rules",
  kind: "read",
  action: "kanban.board.read",
  summary: "List the automation rules of a board with their plain-language sentence, whether they are enabled, and how many times each ran this month.",
  label: "รายการกฎอัตโนมัติ",
  tool: { name: "kanban_list_rules", hint: "Use this to answer 'what automations does this board have' or to find a rule's id before toggling it." },
  test: "K2.12-S3.1",
  async handler({ actor, params }) {
    const ctx = kanbanCtxOf(actor);
    return listRules(ctx, kanbanActorOf(actor), params.id!);
  },
});

const automationRulesCreateInput = z.object(ruleBodyShape).strict();

const automationRulesCreate = defineKanbanOp({
  id: "automation.rules.create",
  method: "POST",
  path: "/boards/{id}/automation/rules",
  kind: "write",
  action: "kanban.automation.manage",
  summary: "Create an automation rule on a board. Requires the ADMIN role on that board and the automation.manage permission.",
  label: "สร้างกฎอัตโนมัติ",
  input: automationRulesCreateInput,
  test: "K2.12-S3.1",
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    return createRule(ctx, kanbanActorOf(actor), { ...input, boardId: params.id! });
  },
});

const automationRulesToggleInput = z.object({ enabled: z.boolean().describe("true = turn the rule on, false = turn it off without deleting it.") }).strict();

const automationRulesToggle = defineKanbanOp({
  id: "automation.rules.toggle",
  method: "PUT",
  path: "/automation/rules/{id}/toggle",
  kind: "write",
  action: "kanban.automation.manage",
  summary: "Turn an automation rule on or off.",
  label: "เปิด/ปิดกฎอัตโนมัติ",
  input: automationRulesToggleInput,
  test: "K2.12-S3.1",
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    const rule = await toggleRule(ctx, kanbanActorOf(actor), params.id!, input.enabled);
    return { ok: true, ruleId: rule.id, enabled: rule.enabled };
  },
});

const automationRulesDryRunInput = z
  .object({
    ...ruleBodyShape,
    days: z.number().int().min(1).max(365).optional().describe("How many days back (RULE) or forward (DUE_DATE) to look for matching cards. Default 30."),
  })
  .strict();

const automationRulesDryRun = defineKanbanOp({
  id: "automation.rules.dryRun",
  method: "POST",
  path: "/boards/{id}/automation/rules/dry-run",
  // อ่านอย่างเดียว: ตรวจว่ากฎ (ที่ยังไม่บันทึก) จะจับการ์ดใบไหนบ้าง — ไม่เขียนอะไรลง DB
  kind: "read",
  action: "kanban.automation.manage",
  summary: "Preview which existing cards a not-yet-saved rule would match, and what it would do to them. Nothing is written.",
  label: "ทดลองรันกฎก่อนบันทึก",
  input: automationRulesDryRunInput,
  test: "K2.12-S3.1",
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    const { days, ...rule } = input;
    return dryRun(ctx, kanbanActorOf(actor), { ...rule, boardId: params.id! }, days !== undefined ? { days } : undefined);
  },
});

export const AUTOMATION_OPS: ApiOp[] = [automationRulesList, automationRulesCreate, automationRulesToggle, automationRulesDryRun];
