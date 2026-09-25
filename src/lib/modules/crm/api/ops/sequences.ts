// ops/sequences.ts — op ของลำดับการติดตาม (ใบ C2.11 · CRM-API "Sequences")
//
// 🔴 ไม่มี engine ที่สอง: ทุก op เรียกบริการ `sequences.ts` ของใบ C2.2 (ปฏิทินวันทำการ · ช่วงเวลาส่ง · เพดานผู้เดินพร้อมกัน ·
//    การหยุดอัตโนมัติเมื่อลูกค้าตอบ/ชนะ/แพ้/ขอไม่รับ · เหตุการณ์ outbox อยู่ที่นั่นทั้งหมด)
// 🔴 AUDIT-CLASS X2: การตั้ง/แก้ลำดับ = `crm.sequence.manage` (ชุด crm.admin) · การใส่คน/หยุดคน = `crm.sequence.enroll`
//    (ชุด crm.operate ก็ทำได้ — พนักงานขายใส่ลูกค้าของตัวเองเข้าลำดับได้ แต่แก้ลำดับไม่ได้)
// 🔴 AUDIT-CLASS X9: `POST /sequences/{id}/bulk-enroll` = danger (ยืนยัน + เหตุผล · ≤ 500 คน) — ยิงทีเดียวทั้งฐานลูกค้า
//    ถอนคืนไม่ได้ (จดหมายที่ส่งออกไปแล้วเรียกกลับไม่ได้)
// 🔴 `POST /sequences/enrollments/{id}/stop` ใช้ **id ของการลงทะเบียน** ไม่ใช่ id ของลำดับ (คนละของ — ตั้ง path ให้ต่างกัน
//    ตั้งแต่แรกกันผู้เรียกส่งผิดชนิดแล้วได้ 404 ที่อธิบายไม่ได้)

import { z } from "zod";
import * as sequences from "../../sequences";
import { SEQ_STEP_KINDS, SEQ_TASK_TYPES } from "../../sequences-shared";
import { crmActorOf, crmCtxOf } from "../actor";
import { defineCrmOp, type ApiOp } from "../op";
import { cursor, idStr, optId, optText, pageCursor, pageOfCursor, reason, take, text } from "../schema";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "เวลาต้องอยู่ในรูป HH:MM (เวลาไทย)");

/** ขั้นของลำดับ 1 ขั้น — เพดานจริง/กติกาต่อชนิดขั้นอยู่ที่ `cleanStep` ของบริการ (ไม่มีตัวตรวจชุดที่สอง) */
const step = z
  .object({
    kind: z.enum(SEQ_STEP_KINDS),
    subject: optText(300),
    body: optText(8000),
    templateId: optId,
    waitDays: z.number().int().min(0).max(365).nullable().optional(),
    waitHours: z.number().int().min(0).max(23).nullable().optional(),
    taskTitle: optText(300),
    taskType: z.enum(SEQ_TASK_TYPES).nullable().optional(),
    channel: optText(40),
  })
  .strict();

const head = {
  name: text(120).min(1),
  description: optText(500),
  stopOnReply: z.boolean().optional(),
  stopOnWon: z.boolean().optional(),
  stopOnLost: z.boolean().optional(),
  businessDaysOnly: z.boolean().optional(),
  sendWindow: z.object({ from: hhmm, to: hhmm }).strict().nullable().optional(),
  maxActive: z.number().int().min(1).max(100_000).nullable().optional(),
  active: z.boolean().optional(),
};

const list = defineCrmOp({
  id: "sequences.list",
  method: "GET",
  path: "/sequences",
  kind: "read",
  action: "crm.sequence.manage",
  summary: "List the shop's follow-up sequences: name, live version, whether they accept new people, how many steps and how many contacts are in each state.",
  label: "รายการลำดับการติดตาม",
  input: z.object({ take, cursor }).strict(),
  rate: "read",
  test: "C2.11-S2.5",
  async handler({ actor, input }) {
    const rows = await sequences.listSequences(crmCtxOf(actor), crmActorOf(actor));
    const page = pageOfCursor(input.cursor);
    const size = input.take ?? 50;
    return { items: rows.slice((page - 1) * size, page * size), total: rows.length, nextCursor: page * size < rows.length ? pageCursor(page + 1) : null };
  },
});

const get = defineCrmOp({
  id: "sequences.get",
  method: "GET",
  path: "/sequences/{id}",
  kind: "read",
  action: "crm.sequence.manage",
  summary: "One sequence with its steps in order (e-mail, LINE, SMS, task and wait steps) and its sending rules.",
  label: "ลำดับการติดตาม",
  input: z.object({}).strict(),
  rate: "read",
  test: "C2.11-S2.5",
  async handler({ actor, params }) {
    return sequences.getSequence(crmCtxOf(actor), crmActorOf(actor), params.id ?? "");
  },
});

const create = defineCrmOp({
  id: "sequences.create",
  method: "POST",
  path: "/sequences",
  kind: "write",
  action: "crm.sequence.manage",
  summary:
    "Create a follow-up sequence (version 1) with its steps: EMAIL, LINE, SMS, TASK and WAIT. " +
    "Sending rules: business days only, a send window in Thai time, a cap on how many contacts may walk it at once, and which outcomes stop it.",
  label: "สร้างลำดับการติดตาม",
  input: z.object({ ...head, steps: z.array(step).min(1).max(50) }).strict(),
  test: "C2.11-S2.5",
  async handler({ actor, input }) {
    const seq = await sequences.createSequence(crmCtxOf(actor), crmActorOf(actor), input);
    return { sequenceId: seq.id, ...seq };
  },
});

const enroll = defineCrmOp({
  id: "sequences.enroll",
  method: "POST",
  path: "/sequences/{id}/enroll",
  kind: "write",
  action: "crm.sequence.enroll",
  summary:
    "Put one contact into this sequence, optionally tied to a deal. A contact who asked for no marketing is skipped (the answer says so). " +
    "A contact who already walks this sequence answers 409 unless replace is true, which stops the old run first.",
  label: "ใส่ผู้ติดต่อเข้าลำดับ",
  input: z.object({ contactId: idStr, dealId: optId, replace: z.boolean().optional() }).strict(),
  test: "C2.11-S2.6",
  tool: { name: "crm_enroll_sequence", hint: "Use to propose putting a contact into a follow-up sequence; find the sequence id with crm_search or the sequence list first." },
  async handler({ actor, params, input }) {
    const r = await sequences.enroll(crmCtxOf(actor), crmActorOf(actor), {
      sequenceId: params.id ?? "",
      contactId: input.contactId,
      dealId: input.dealId ?? null,
      replace: input.replace === true,
    });
    return "skipped" in r ? { skipped: true, reason: r.reason } : { enrollmentId: r.enrollmentId, id: r.id, status: r.status };
  },
});

const bulkEnroll = defineCrmOp({
  id: "sequences.bulkEnroll",
  method: "POST",
  path: "/sequences/{id}/bulk-enroll",
  kind: "danger",
  action: "crm.sequence.enroll",
  summary:
    "Put up to 500 contacts into this sequence in one call. Needs confirm: true and a reason - the messages that go out cannot be recalled. " +
    "Contacts who opted out or are already in the sequence are reported back, not silently dropped.",
  label: "ใส่ผู้ติดต่อเข้าลำดับเป็นกลุ่ม",
  input: z.object({ contactIds: z.array(idStr).min(1).max(500), replace: z.boolean().optional(), reason }).strict(),
  // AUDIT-CLASS X7 (รอบแก้ 25 ก.ย. · ผู้ตรวจ B1): ถัง `write` ไม่ใช่ `report` — การใส่คน 500 คนเข้าลำดับคือการเขียน
  //   (และเป็นจุดเริ่มของจดหมายหลายพันฉบับ) ⇒ ต้องกินงบการเขียน ไม่ใช่งบรายงานที่ปล่อย 60 ครั้ง/นาที
  rate: "write",
  test: "C2.11-S2.7",
  async handler({ actor, params, input }) {
    // dispatch ของแกนถอด `confirm` ออกก่อนถึงสคีมา ⇒ ส่งต่อให้ด่านของบริการ (ตรวจอีกชั้นเองตามสัญญาของ C2.2)
    return sequences.bulkEnroll(crmCtxOf(actor), crmActorOf(actor), {
      sequenceId: params.id ?? "",
      contactIds: input.contactIds,
      replace: input.replace === true,
      confirm: true,
      reason: input.reason,
    });
  },
});

const stop = defineCrmOp({
  id: "sequences.stop",
  method: "POST",
  path: "/sequences/enrollments/{id}/stop",
  kind: "write",
  action: "crm.sequence.enroll",
  summary: "Stop one enrollment (the id of the enrollment, not of the sequence). The remaining steps are cancelled; the history of what was sent is kept.",
  label: "หยุดลำดับของผู้ติดต่อ",
  input: z.object({ reason: optText(500) }).strict(),
  test: "C2.11-S2.6",
  async handler({ actor, params, input }) {
    const r = await sequences.stop(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", { reason: input.reason ?? null });
    return { enrollmentId: params.id ?? "", stopped: r.stopped, status: r.status };
  },
});

const stats = defineCrmOp({
  id: "sequences.stats",
  method: "GET",
  path: "/sequences/{id}/stats",
  kind: "read",
  action: "crm.sequence.manage",
  summary: "Per-step counters of one sequence version: sent, skipped, failed and how many contacts sit on each step, plus totals per state.",
  label: "สถิติลำดับการติดตาม",
  input: z.object({ version: z.coerce.number().int().min(1).max(1000).optional() }).strict(),
  rate: "report",
  test: "C2.11-S2.6",
  async handler({ actor, params, input }) {
    return sequences.stats(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", { version: input.version ?? null });
  },
});

export const SEQUENCES_OPS: ApiOp[] = [list, get, create, enroll, bulkEnroll, stop, stats];
