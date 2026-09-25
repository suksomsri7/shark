// ops/activities.ts — op ของกิจกรรมและปฏิทิน (ใบ C1.10 · CRM-API §2.4)
//
// 🔴 ไม่มี engine ที่สอง: ทุก op เรียกบริการ `activities.ts` ของใบ C1.6 (ผ่าน C1.7 activityWhere) เท่านั้น
// AUDIT-CLASS X1: กิจกรรม/ผู้ติดต่อ/ดีล/บริษัท/รายการ ที่อ้างถึงต้องเป็นของระบบนี้และมองเห็นได้ — ไม่ใช่ = 404/422 จากบริการ
// AUDIT-CLASS X9: delete = danger

import { z } from "zod";
import * as activities from "../../activities";
import { ACTIVITY_DIRECTIONS, ACTIVITY_PRIORITIES, ACTIVITY_STATUSES, ACTIVITY_TYPES } from "../../activities-shared";
import { crmActorOf, crmCtxOf } from "../actor";
import { assertActivityOwnerInFilter } from "../filters";
import { defineCrmOp, type ApiOp } from "../op";
import { cursor, flag, idStr, isOn, isoDate, optId, optText, reason, take, text } from "../schema";

const list = defineCrmOp({
  id: "activities.list",
  method: "GET",
  path: "/activities",
  kind: "read",
  action: "crm.activity.read",
  summary: "List activities (calls, meetings, tasks, notes, ...) this key can see, filtered by status, type, record or date range.",
  label: "รายการกิจกรรม",
  input: z
    .object({
      take,
      cursor,
      scope: z.enum(["mine", "team"]).optional(),
      status: z.enum(ACTIVITY_STATUSES).optional(),
      type: z.enum(ACTIVITY_TYPES).optional(),
      contactId: idStr.optional(),
      companyId: idStr.optional(),
      dealId: idStr.optional(),
      customRecordId: idStr.optional(),
      from: isoDate.optional(),
      to: isoDate.optional(),
    })
    .strict(),
  test: "C1.10-X6.2",
  async handler({ actor, input }) {
    const { take: n, ...rest } = input;
    const r = await activities.listActivities(crmCtxOf(actor), crmActorOf(actor), { ...rest, pageSize: n ?? 50 });
    return { items: r.items, nextCursor: r.nextCursor };
  },
});

const calendar = defineCrmOp({
  id: "calendar.list",
  method: "GET",
  path: "/calendar",
  kind: "read",
  action: "crm.activity.read",
  // CRM C2.4 (รอบ 2 · ข้อ F6) ▸ `appointments` เป็นของ "คน" ไม่ใช่ของคีย์ API — คีย์ได้ `[]` เสมอ (ตัดที่ `activities.calendar`)
  summary:
    "Activities whose start (or due) time falls in [from, to), for a calendar view. mine=true limits to the key holder's own. " +
    "The answer also carries `appointments` (read-only bookings, clinic visits and school classes of the same Party) and `appointmentsTruncated`; " +
    "for API keys `appointments` is always empty - those rows belong to the booking, clinic and school modules, so ask those modules with their own key.",
  label: "ปฏิทินกิจกรรม",
  input: z.object({ from: isoDate, to: isoDate, mine: flag }).strict(),
  test: "C1.10-X1.1",
  async handler({ actor, input }) {
    return activities.calendar(crmCtxOf(actor), crmActorOf(actor), { from: input.from, to: input.to, mine: isOn(input.mine) });
  },
});

const get = defineCrmOp({
  id: "activities.get",
  method: "GET",
  path: "/activities/{id}",
  kind: "read",
  action: "crm.activity.read",
  summary: "One activity.",
  label: "กิจกรรม",
  test: "C1.10-X1.2",
  async handler({ actor, params }) {
    return activities.getActivity(crmCtxOf(actor), crmActorOf(actor), params.id ?? "");
  },
});

const when = z.union([isoDate, z.number().int().min(0).max(8.64e15)]);

const log = defineCrmOp({
  id: "activities.log",
  method: "POST",
  path: "/activities",
  kind: "write",
  action: "crm.activity.create",
  summary: "Log an activity on a contact, company, deal or custom record (call, meeting, task, note, ...), optionally with a follow-up task.",
  label: "บันทึกกิจกรรม",
  input: z
    .object({
      type: z.enum(ACTIVITY_TYPES),
      title: text(300).min(1),
      body: optText(8000),
      direction: z.enum(ACTIVITY_DIRECTIONS).nullable().optional(),
      channel: optText(40),
      contactId: optId,
      companyId: optId,
      dealId: optId,
      customRecordId: optId,
      startAt: when.nullable().optional(),
      endAt: when.nullable().optional(),
      durationSec: z.number().int().min(0).max(86_400).nullable().optional(),
      outcome: optText(60),
      attendees: z.object({ userIds: z.array(idStr).max(50).nullable().optional(), contactIds: z.array(idStr).max(50).nullable().optional() }).strict().nullable().optional(),
      location: optText(300),
      dueAt: when.nullable().optional(),
      remindAt: when.nullable().optional(),
      done: z.boolean().nullable().optional(),
      priority: z.enum(ACTIVITY_PRIORITIES).nullable().optional(),
      pinned: z.boolean().nullable().optional(),
      mentions: z.array(idStr).max(20).nullable().optional(),
      nextTask: z.object({ type: z.enum(ACTIVITY_TYPES).nullable().optional(), title: optText(300), dueAt: when.nullable().optional() }).strict().nullable().optional(),
    })
    .strict(),
  tool: { name: "crm_log_activity", hint: "Use to record a call, meeting, visit or note, or to schedule a follow-up task on a contact or deal." },
  test: "C1.10-S2.4",
  async handler({ actor, input }) {
    await assertActivityOwnerInFilter(actor);
    const r = await activities.logActivity(crmCtxOf(actor), crmActorOf(actor), input);
    return { activityId: r.id, activity: r, nextTaskId: r.nextTaskId };
  },
});

const complete = defineCrmOp({
  id: "activities.complete",
  method: "POST",
  path: "/activities/{id}/complete",
  kind: "write",
  action: "crm.activity.complete",
  summary: "Mark an activity or task done, optionally with its outcome.",
  label: "ปิดกิจกรรม",
  input: z.object({ outcome: optText(60) }).strict(),
  test: "C1.10-S2.3",
  async handler({ actor, params, input }) {
    const a = await activities.completeActivity(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", { outcome: input.outcome ?? null });
    return { activityId: a.id, activity: a };
  },
});

const reschedule = defineCrmOp({
  id: "activities.reschedule",
  method: "PUT",
  path: "/activities/{id}/schedule",
  kind: "write",
  action: "crm.activity.create",
  summary: "Move an activity to another start/end or due time.",
  label: "เลื่อนนัด/กำหนดส่ง",
  input: z.object({ dueAt: when.nullable().optional(), startAt: when.nullable().optional(), endAt: when.nullable().optional() }).strict(),
  test: "C1.10-S2.3",
  async handler({ actor, params, input }) {
    const a = await activities.rescheduleActivity(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", input);
    return { activityId: a.id, activity: a };
  },
});

const del = defineCrmOp({
  id: "activities.delete",
  method: "DELETE",
  path: "/activities/{id}",
  kind: "danger",
  action: "crm.activity.delete",
  summary: "Delete an activity. Needs confirm: true and a reason.",
  label: "ลบกิจกรรม",
  input: z.object({ reason }).strict(),
  test: "C1.10-X9.2",
  async handler({ actor, params, input }) {
    await activities.deleteActivity(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", { confirm: true, reason: input.reason });
    return { activityId: params.id ?? "", deleted: true };
  },
});

export const ACTIVITIES_OPS: ApiOp[] = [list, calendar, get, log, complete, reschedule, del];
