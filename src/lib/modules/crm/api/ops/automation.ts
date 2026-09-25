// ops/automation.ts — op ของกฎอัตโนมัติ CRM (ใบ C2.11 · CRM-API "Automation" · RESOLUTIONS R-C.7: ยังอยู่ใต้ /api/v1/crm)
//
// 🔴 ไม่มี engine ที่สอง: ทุก op เรียกบริการ `automation.ts` ของใบ C2.1 (ทะเบียน trigger/action · ตัวรันกลาง · โควตาต่อเดือน)
// 🔴 `POST /automation/dry-run` เป็น **kind read** ทั้งที่เป็น POST: มันรับ "ร่างกฎ" มาแล้วบอกว่าย้อนหลัง n วันจะเข้าเกณฑ์กี่รายการ
//    ⇒ ไม่มีแถว `AutomationRun` ไม่มี event ไม่มี audit ไม่มีการเรียกตัวส่ง (สัญญาของ `dryRun` ในบริการ) · ใช้ถังรายงาน
// 🔴 การสร้าง/แก้/ลบกฎผ่านคีย์ยังไม่เปิดในใบนี้ (ตัวสร้างกฎมีเงื่อนไข/ขั้นซ้อนที่หน้าจอเป็นเจ้าของ) — เปิดเฉพาะ "อ่านรายการ"
//    และ "ทดลอง" ตามตาราง MUST ของข้อสอบ C2.11

import { z } from "zod";
import * as automation from "../../automation";
import { crmActorOf, crmCtxOf } from "../actor";
import { defineCrmOp, type ApiOp } from "../op";
import { cursor, fieldValue, optId, pageCursor, pageOfCursor, take, text } from "../schema";

/** ค่าพารามิเตอร์ของ trigger/action 1 ช่อง — ชนิดจริงต่อ action ถูกตรวจโดย `cleanInput` ของ C2.1 */
const paramBag = z.record(z.string().max(60), fieldValue.or(z.array(z.unknown()).max(20)).or(z.record(z.string().max(60), fieldValue))).refine(
  (o) => Object.keys(o).length <= 30,
  { message: "ตั้งค่าของขั้นได้ไม่เกิน 30 ช่อง" },
);

const list = defineCrmOp({
  id: "automation.rules.list",
  method: "GET",
  path: "/automation/rules",
  kind: "read",
  action: "crm.automation.manage",
  summary:
    "The CRM automation rules of this system: name, whether they are on, their trigger and conditions, the steps they run, " +
    "how many times they ran in total and this month, and when they last ran.",
  label: "รายการกฎอัตโนมัติ",
  input: z.object({ take, cursor }).strict(),
  rate: "read",
  test: "C2.11-S2.12",
  async handler({ actor, input }) {
    const rows = await automation.listRules(crmCtxOf(actor), crmActorOf(actor));
    const page = pageOfCursor(input.cursor);
    const size = input.take ?? 50;
    return { items: rows.slice((page - 1) * size, page * size), total: rows.length, nextCursor: page * size < rows.length ? pageCursor(page + 1) : null };
  },
});

const dryRun = defineCrmOp({
  // MINOR 12 (ผู้ตรวจอิสระ 25 ก.ย.): POST แต่ `kind: "read"` (ไม่เขียนอะไรเลย) ⇒ ด่าน "คีย์อ่านอย่างเดียวห้ามเขียน" ของ
  //   `defineCrmOp` ไม่ครอบตัวนี้ · สิ่งที่กันคีย์ชุด readonly คือ action ของมัน **ไม่อยู่ในชุด `crm.readonly`**
  //   ⇒ ยืนยันด้วยด่านสถิต `crmReadKindDoorsReachableByReadonlyBundle()` ใน `registry.ts` (พังตอน import ถ้ามีใครเผลอ)
  id: "automation.dryRun",
  method: "POST",
  path: "/automation/dry-run",
  kind: "read",
  action: "crm.automation.manage",
  summary:
    "Try a draft rule against real data of the last `days` days (1-90, 30 by default) and answer which records it would have caught. " +
    "Writes nothing: no run row, no event, no message - so it is safe to call before switching a rule on.",
  label: "ทดลองกฎอัตโนมัติ",
  input: z
    .object({
      name: text(120).min(1),
      trigger: z.object({ event: text(80).min(1), params: paramBag.optional() }).strict(),
      conditions: z
        .object({
          mode: z.enum(["AND", "OR"]),
          items: z.array(z.object({ field: text(60).min(1), op: text(30).min(1), value: fieldValue.optional() }).strict()).max(20),
        })
        .strict()
        .nullable()
        .optional(),
      actions: z.array(z.object({ type: text(60).min(1), params: paramBag.optional() }).strict()).min(1).max(20),
      pipelineId: optId,
      days: z.number().int().min(1).max(90).optional(),
    })
    .strict(),
  rate: "report",
  test: "C2.11-S2.12",
  async handler({ actor, input }) {
    const { days, ...rule } = input;
    return automation.dryRun(
      crmCtxOf(actor),
      crmActorOf(actor),
      {
        name: rule.name,
        trigger: { event: rule.trigger.event, ...(rule.trigger.params ? { params: rule.trigger.params } : {}) },
        conditions: rule.conditions ?? null,
        actions: rule.actions.map((a) => ({ type: a.type, ...(a.params ? { params: a.params } : {}) })),
        pipelineId: rule.pipelineId ?? null,
      },
      { days: days ?? 30 },
    );
  },
});

export const AUTOMATION_OPS: ApiOp[] = [list, dryRun];
