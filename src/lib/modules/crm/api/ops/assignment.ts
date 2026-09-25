// ops/assignment.ts — op ของกติกาแจกลีดให้พนักงาน (ใบ C2.11 · CRM-API "Assignment")
//
// 🔴 ไม่มี engine ที่สอง: ทุก op เรียก facade `assignment` ของใบ C2.3 (ลำดับกฎ · เงื่อนไข · โหมดแจก · คนลา · เพดานงานค้าง)
// 🔴 AUDIT-CLASS X9 ไม่มีของอันตรายในชุดนี้ — แต่ `POST /assignment/simulate` เป็น **kind read** ทั้งที่เป็น POST
//    (มันรับ "ร่างลีด" มาเป็น body แล้วตอบว่าใครจะได้งาน · ไม่เขียนผู้ติดต่อ ไม่ขยับตัวชี้เวียนของ ROUND_ROBIN)
//    ⇒ ใช้ถังอ่าน ไม่ต้องมี Idempotency-Key และไม่มีแถว audit (การทดลองไม่ใช่การกระทำ)

import { z } from "zod";
import { assignmentFacade as assignment } from "../../assignment";
import { ASSIGN_MODES } from "../../assignment-shared";
import { CONTACT_SOURCES } from "../../contacts-shared";
import { crmActorOf, crmCtxOf } from "../actor";
import { defineCrmOp, type ApiOp } from "../op";
import { cursor, fieldValue, idStr, optId, optText, pageCursor, pageOfCursor, take, text } from "../schema";

const conditions = z
  .object({
    mode: z.enum(["AND", "OR"]).optional(),
    items: z
      .array(z.object({ field: text(60).min(1), op: text(30).min(1), value: fieldValue.optional() }).strict())
      .max(20)
      .optional(),
  })
  .strict();

const list = defineCrmOp({
  id: "assignment.rules.list",
  method: "GET",
  path: "/assignment/rules",
  kind: "read",
  action: "crm.assignment.manage",
  summary: "The shop's lead assignment rules in the order they are tried: mode, the people or team they hand to, their conditions and the open-work cap.",
  label: "รายการกฎแจกลีด",
  input: z.object({ take, cursor }).strict(),
  rate: "read",
  test: "C2.11-S2.8",
  async handler({ actor, input }) {
    const rows = await assignment.listRules(crmCtxOf(actor), crmActorOf(actor));
    const page = pageOfCursor(input.cursor);
    const size = input.take ?? 50;
    return { items: rows.slice((page - 1) * size, page * size), total: rows.length, nextCursor: page * size < rows.length ? pageCursor(page + 1) : null };
  },
});

const create = defineCrmOp({
  id: "assignment.rules.create",
  method: "POST",
  path: "/assignment/rules",
  kind: "write",
  action: "crm.assignment.manage",
  summary:
    "Add a lead assignment rule at the end of the order. mode FIXED (always these people), ROUND_ROBIN (take turns), " +
    "TEAM_LEAD (the team's lead) or LEAST_OPEN (whoever has the fewest open deals). Conditions decide which leads the rule catches.",
  label: "เพิ่มกฎแจกลีด",
  input: z
    .object({
      name: text(120).min(1),
      mode: z.enum(ASSIGN_MODES),
      userIds: z.array(idStr).max(100).optional(),
      teamId: optId,
      maxOpenPerUser: z.number().int().min(1).max(10_000).nullable().optional(),
      conditions: conditions.nullable().optional(),
      active: z.boolean().optional(),
    })
    .strict(),
  test: "C2.11-S2.8",
  async handler({ actor, input }) {
    const rule = await assignment.createRule(crmCtxOf(actor), crmActorOf(actor), {
      name: input.name,
      mode: input.mode,
      userIds: input.userIds ?? null,
      teamId: input.teamId ?? null,
      maxOpenPerUser: input.maxOpenPerUser ?? null,
      conditions: input.conditions ?? null,
      active: input.active ?? null,
    });
    return { ruleId: rule.id, rule };
  },
});

const simulate = defineCrmOp({
  // MINOR 12 (ผู้ตรวจอิสระ 25 ก.ย.): POST แต่ `kind: "read"` (ไม่เขียนอะไรเลย) ⇒ ด่าน "คีย์อ่านอย่างเดียวห้ามเขียน" ของ
  //   `defineCrmOp` ไม่ครอบตัวนี้ · สิ่งที่กันคีย์ชุด readonly คือ action ของมัน **ไม่อยู่ในชุด `crm.readonly`**
  //   ⇒ ยืนยันด้วยด่านสถิต `crmReadKindDoorsReachableByReadonlyBundle()` ใน `registry.ts` (พังตอน import ถ้ามีใครเผลอ)
  id: "assignment.simulate",
  method: "POST",
  path: "/assignment/simulate",
  kind: "read",
  action: "crm.assignment.manage",
  summary:
    "Dry run: for each draft lead in rows[], answer who would get it, through which rule and why. Writes nothing at all - no contact, " +
    "no move of the round-robin cursor - so it is safe to call before importing a list. At most 200 rows per call.",
  label: "ทดลองแจกลีด",
  input: z
    .object({
      rows: z
        .array(
          z
            .object({
              sourceKind: z.enum(CONTACT_SOURCES).nullable().optional(),
              sourceChannel: optText(60),
              locale: optText(10),
              partyId: optId,
              companyId: optId,
              address: optText(300),
              companySize: optText(40),
              fields: z.record(z.string().max(80), fieldValue).optional(),
            })
            .strict(),
        )
        .min(1)
        .max(200),
    })
    .strict(),
  rate: "report",
  test: "C2.11-S2.8",
  async handler({ actor, input }) {
    // `sourceKind` ใช้ทะเบียนเดียวกับผู้ติดต่อ (`CONTACT_SOURCES` = enum MemberSource) — ไม่มีทะเบียนชุดที่สอง
    return assignment.simulate(crmCtxOf(actor), crmActorOf(actor), input.rows);
  },
});

export const ASSIGNMENT_OPS: ApiOp[] = [list, create, simulate];
