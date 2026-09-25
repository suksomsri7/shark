// ops/scoring.ts — op ของคะแนนผู้ติดต่อ (ใบ C2.11 · CRM-API "Scoring")
//
// 🔴 ไม่มี engine ที่สอง: ทุก op เรียกบริการ `scoring.ts` ของใบ C2.8 (แต้มต่อกฎ · อายุแต้ม · เพดานต่อวัน · ระดับร้อน/อุ่น/เย็น)
// 🔴 `GET /contacts/{id}/score` ตั้งใจ **ไม่** อยู่ใต้ `/scoring/…` และใช้คีย์ `crm.contact.read` ไม่ใช่ `crm.score.manage`:
//    "ทำไมลูกค้ารายนี้ร้อน" เป็นข้อมูลของผู้ติดต่อ (ภาพ 05 โชว์บนการ์ด 360) — พนักงานขายที่เห็นลูกค้าต้องอ่านเหตุผลได้
//    แต่ "เกณฑ์ให้คะแนนของร้าน" เป็นการตั้งค่า ⇒ คนละคีย์ · ผู้ติดต่อที่คีย์มองไม่เห็น = 404 (ไม่ใช่ 403 — ไม่บอกว่ามีอยู่)
// 🔴 AUDIT-CLASS X9: `POST /scoring/recompute` = danger — `{ all: true }` คิดคะแนนใหม่ทั้งร้าน (ขยับคะแนนลูกค้าทุกคน
//    และทำให้กฎ "เมื่อคะแนนถึงระดับ" ทำงานเป็นชุด) ⇒ ยืนยัน + เหตุผล ≥ 5 ตัวอักษรเสมอ · `dryRun: true` บอกผลต่างโดยไม่เขียน
//    ⚠️ dispatch ของแกนบังคับ `confirm: true` กับ op ชนิด danger **ทุกคำขอ** ⇒ การขอดู `dryRun` ก็ต้องส่ง confirm มาด้วย
//       (ดูคำขอแก้ข้อสอบ C2.11-S2.10 ในรายงานของใบนี้ — ข้อสอบยิง dryRun โดยไม่ส่ง confirm)

import { z } from "zod";
import * as scoring from "../../scoring";
import { SCORE_EXPLAIN_LIMIT_MAX, SCORE_POINTS_MAX, SCORE_POINTS_MIN, SCORE_RULE_EVENT_CHOICES, SCORE_RULE_NAME_MAX } from "../../scoring-shared";
import { crmActorOf, crmCtxOf } from "../actor";
import { crmApiError } from "../http-errors";
import { defineCrmOp, type ApiOp } from "../op";
import { cursor, fieldValue, idStr, pageCursor, pageOfCursor, reason, take, text } from "../schema";

const rulesList = defineCrmOp({
  id: "scoring.rules.list",
  method: "GET",
  path: "/scoring/rules",
  kind: "read",
  action: "crm.score.manage",
  summary: "The shop's scoring rules in order: which event gives how many points, for how long they count, the per-day cap and whether the rule is on.",
  label: "รายการกฎคะแนน",
  input: z.object({ take, cursor }).strict(),
  rate: "read",
  test: "C2.11-S2.9",
  async handler({ actor, input }) {
    const rows = await scoring.listRules(crmCtxOf(actor), crmActorOf(actor));
    const page = pageOfCursor(input.cursor);
    const size = input.take ?? 50;
    return { items: rows.slice((page - 1) * size, page * size), total: rows.length, nextCursor: page * size < rows.length ? pageCursor(page + 1) : null };
  },
});

const rulesCreate = defineCrmOp({
  id: "scoring.rules.create",
  method: "POST",
  path: "/scoring/rules",
  kind: "write",
  action: "crm.score.manage",
  summary:
    "Add a scoring rule: the event that earns the points (only events that really reach the scorer can be chosen), the points (-1000..1000), " +
    "how many days a point stays alive, a cap per contact per day and optional conditions.",
  label: "เพิ่มกฎคะแนน",
  input: z
    .object({
      name: text(SCORE_RULE_NAME_MAX).min(1),
      event: z.enum(SCORE_RULE_EVENT_CHOICES),
      points: z.number().int().min(SCORE_POINTS_MIN).max(SCORE_POINTS_MAX),
      conditions: z
        .object({
          mode: z.enum(["AND", "OR"]).optional(),
          items: z.array(z.object({ field: text(60).min(1), op: text(30).min(1), value: fieldValue.optional() }).strict()).max(20).optional(),
          days: z.number().int().min(1).max(3650).nullable().optional(),
        })
        .strict()
        .nullable()
        .optional(),
      expiresDays: z.number().int().min(1).max(3650).nullable().optional(),
      maxPerDay: z.number().int().min(1).max(1000).nullable().optional(),
      active: z.boolean().optional(),
    })
    .strict(),
  test: "C2.11-S2.9",
  async handler({ actor, input }) {
    const rule = await scoring.createRule(crmCtxOf(actor), crmActorOf(actor), {
      name: input.name,
      event: input.event,
      points: input.points,
      conditions: input.conditions ?? null,
      expiresDays: input.expiresDays ?? null,
      maxPerDay: input.maxPerDay ?? null,
      ...(input.active === undefined ? {} : { active: input.active }),
    });
    return { ruleId: rule.id, rule };
  },
});

const explain = defineCrmOp({
  id: "scoring.explain",
  method: "GET",
  path: "/contacts/{id}/score",
  kind: "read",
  action: "crm.contact.read",
  summary:
    "Why this contact has the score it has: the current score, the band (HOT, WARM, COLD) and the latest points that still count, " +
    "each with its Thai reason, the rule behind it and when it expires. A contact this key cannot see answers 404.",
  label: "เหตุผลของคะแนนผู้ติดต่อ",
  input: z.object({ limit: z.coerce.number().int().min(1).max(SCORE_EXPLAIN_LIMIT_MAX).optional() }).strict(),
  rate: "read",
  test: "C2.11-S2.9",
  tool: { name: "crm_score_explain", hint: "Use to explain why a contact is hot, warm or cold before advising what to do next." },
  async handler({ actor, params, input }) {
    return scoring.explain(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", { limit: input.limit ?? undefined });
  },
});

const recompute = defineCrmOp({
  id: "scoring.recompute",
  method: "POST",
  path: "/scoring/recompute",
  kind: "danger",
  action: "crm.score.manage",
  summary:
    "Add the points up again from the log: for one contact (contactId) or for the whole shop (all: true). " +
    "Needs confirm: true and a reason of at least 5 characters. Send dryRun: true (together with confirm) to see what would change without writing.",
  label: "คิดคะแนนใหม่",
  input: z.object({ contactId: idStr.optional(), all: z.boolean().optional(), dryRun: z.boolean().optional(), reason }).strict(),
  rate: "report",
  test: "C2.11-S2.10",
  async handler({ actor, input }) {
    if (!input.all && !input.contactId) {
      // ไม่บอกว่า "ผิดพลาด" ลอย ๆ — บอกว่าต้องเลือกอะไร
      throw crmApiError(422, "validation", "เลือกก่อนว่าจะคิดคะแนนใหม่ให้ผู้ติดต่อรายไหน (contactId) หรือทั้งร้าน (all: true)", "Send either contactId or all: true.");
    }
    const target = input.all ? ({ all: true } as const) : ({ contactId: input.contactId as string } as const);
    return scoring.recompute(crmCtxOf(actor), crmActorOf(actor), target, { dryRun: input.dryRun === true, confirm: true, reason: input.reason });
  },
});

export const SCORING_OPS: ApiOp[] = [rulesList, rulesCreate, explain, recompute];
