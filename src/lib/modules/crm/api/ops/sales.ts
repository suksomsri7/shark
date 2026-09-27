// ops/sales.ts — REST ชุดที่สาม (ใบ C3.8): ส่งออกรายงาน · โควตา · คอมมิชชัน
//
//   reports.export.start  POST /reports/{tab}/export          crm.report.view        danger (คีย์ชุดผู้ดูแลเท่านั้น — งาน async ของ C3.1)
//   reports.export.get    GET  /reports/exports/{jobId}        crm.report.view        read   (เฉพาะคีย์ที่ขอ — ผูก ApiKey.id)
//   quotas.list           GET  /quotas                         crm.report.view        read
//   quotas.set            PUT  /quotas                         crm.quota.manage       write
//   quotas.board          GET  /quotas/board                   crm.quota.manage       read   (แนะนำ — ตารางหน้าตั้งโควตา)
//   commissions.list      GET  /commissions                    crm.commission.view    read
//   commissions.pending   GET  /commissions/pending            crm.commission.approve read   (แนะนำ — รายการรออนุมัติ)
//   commissions.approve   POST /commissions/{id}/approve       crm.commission.approve write
//   commissions.reject    POST /commissions/{id}/reject        crm.commission.approve danger (เหตุผล = reason ของคำสั่งอันตราย)
// (`reports.get` · `quotas.progress` · `commissions.mine` สร้างโดยใบ C3.4 ใน `ops/assist.ts` — มติผู้คุมงาน C3.6–C3.9 ข้อ 1)
//
// 🔴 ไม่มี engine ที่สอง: ทุก op เรียกบริการของ C3.1 (reports) · C3.2 (quotas) · C3.3 (commissions) ตัวเดียว — ที่นี่มีแค่
//    (1) แปลงคีย์งวด พ.ศ. → ค.ศ. (`periodKeyIn`) (2) ตัวกรองของคีย์บนข้อมูลของคน (`keyPeopleOf` — ตารางพวกนี้ไม่มี teamId ให้ visibleWhere)
//    (3) แบ่งหน้าแบบ `{ items, nextCursor }` (take ≤ 100) บนผลของบริการ (บริการมีเพดาน listMax ของตัวเองอยู่แล้ว)
// AUDIT-CLASS X2: คีย์/สิทธิ์ของทุก op = คีย์ของบริการ (บริการตรวจซ้ำอีกชั้นด้วย crmCan) · ส่งออก = คีย์ชุดผู้ดูแล
// AUDIT-CLASS X8: ไม่มีเนื้ออีเมล/บทสนทนา/ไฟล์เสียงในคำตอบของชุดนี้ (DTO ของบริการเป็นตัวเลข/id/ชื่อ)
import { z } from "zod";
import * as commissions from "../../commissions";
import * as quotas from "../../quotas";
import * as reports from "../../reports";
import { periodKeyOf } from "../../quotas-shared";
import { crmActorOf, crmCtxOf } from "../actor";
import { inKeyPeople, keyPeopleOf, outsideKeyPeople } from "../filters";
import { crmApiError } from "../http-errors";
import { assertAdminKeyForExport, defineCrmOp, type ApiOp } from "../op";
import { cursor, idStr, isoDate, optText, pageCursor, pageOfCursor, periodKeyIn, periodKeyText, reason, satang, take } from "../schema";

const COMMISSION_STATUSES = ["PENDING", "APPROVED", "PAID", "REVERSED", "REJECTED"] as const;
const OWNER_TYPES = ["USER", "TEAM"] as const;
const countField = z.number().int().min(0).max(1_000_000).nullable().optional();

/** แบ่งหน้าบนรายการที่บริการคืนมาทั้งก้อน (บริการมีเพดานของตัวเอง) — ตัวชี้ = เลขหน้าแบบทึบ */
function pageOf<T>(all: readonly T[], takeN: number | undefined, cur: string | undefined): { items: T[]; nextCursor: string | null } {
  const size = takeN ?? 50;
  const page = pageOfCursor(cur);
  const from = (page - 1) * size;
  return { items: all.slice(from, from + size), nextCursor: from + size < all.length ? pageCursor(page + 1) : null };
}

/** คีย์งวดที่บังคับ (ไม่ส่ง = งวดเดือนนี้ตามปฏิทินไทย) */
const periodOrNow = (v: string | undefined) => periodKeyIn(v) ?? periodKeyOf(new Date(), "MONTH");

// ───────────────────────── รายงาน: ส่งออก (งาน async · C3.1) ─────────────────────────

const reportFilters = {
  from: isoDate.optional(),
  to: isoDate.optional(),
  teamId: idStr.optional(),
  pipelineId: idStr.optional(),
  ownerUserId: idStr.optional(),
  groupBy: z.enum(["month", "owner", "team"]).optional(),
};

const exportStart = defineCrmOp({
  id: "reports.export.start",
  method: "POST",
  path: "/reports/{tab}/export",
  kind: "danger",
  action: "crm.report.view",
  summary:
    "Queue a CSV export of one report tab (overview, forecast, funnel, reps, activities, lost, sources, scores) with the same filters as GET /reports/{tab}. " +
    "Answers { jobId, status: QUEUED }; poll GET /reports/exports/{jobId}. Needs a crm.admin key, confirm: true and a reason. Only the key that asked can read the file.",
  label: "ส่งออกรายงานเป็นไฟล์",
  input: z.object({ reason, ...reportFilters }).strict(),
  test: "C3.8-S8.1",
  async handler({ actor, params, input }) {
    // AUDIT-CLASS X2: ส่งออกทั้งชุด = คีย์ชุดผู้ดูแลเท่านั้น (บริการตรวจซ้ำ — requesterOf)
    assertAdminKeyForExport(actor);
    const { reason: _reason, ...filters } = input;
    void _reason;
    return reports.startExport(crmCtxOf(actor), crmActorOf(actor), { tab: params.tab ?? "", filters });
  },
});

const exportGet = defineCrmOp({
  id: "reports.export.get",
  method: "GET",
  path: "/reports/exports/{jobId}",
  kind: "read",
  action: "crm.report.view",
  summary:
    "Status of one report export job (QUEUED, RUNNING, DONE, FAILED) and, when DONE, the CSV text (UTF-8, formula cells neutralised). " +
    "Only the API key that queued the job can read it; any other key or person gets 404.",
  label: "ไฟล์ส่งออกรายงาน",
  input: z.object({}).strict(),
  test: "C3.8-S8.1",
  async handler({ actor, params }) {
    return reports.getExport(crmCtxOf(actor), crmActorOf(actor), params.jobId ?? "");
  },
});

// ───────────────────────── โควตา (C3.2) ─────────────────────────

const quotasList = defineCrmOp({
  id: "quotas.list",
  method: "GET",
  path: "/quotas",
  kind: "read",
  action: "crm.report.view",
  summary:
    "Sales quotas of this CRM system (target in satang, target deals and activities per person or team and period). periodKey is \"2026-09\", \"2026-Q3\" or \"2026\" " +
    "(a Thai Buddhist year such as \"2569-09\" is accepted too). For a person without crm.quota.manage only their own and their teams' quotas are listed; an API key sees the quotas of the whole system (narrowed by its team/owner filter).",
  label: "โควตา",
  input: z.object({ periodKey: periodKeyText.optional(), ownerType: z.enum(OWNER_TYPES).optional(), take, cursor }).strict(),
  test: "C3.8-S1.1",
  async handler({ actor, input }) {
    const people = await keyPeopleOf(actor);
    // รีวิว N2: ตัวกรองคีย์เข้าไปในคำสั่งของบริการ (ก่อนเพดาน) — ตัวชี้หน้าถูกต้อง
    const rows = await quotas.listQuotas(crmCtxOf(actor), crmActorOf(actor), {
      periodKey: periodKeyIn(input.periodKey) ?? null,
      ownerType: input.ownerType ?? null,
      owners: people ? { userIds: [...people.owners], teamIds: [...people.teams] } : null,
    });
    return pageOf(rows, input.take, input.cursor);
  },
});

const quotasSet = defineCrmOp({
  id: "quotas.set",
  method: "PUT",
  path: "/quotas",
  kind: "write",
  action: "crm.quota.manage",
  summary:
    "Set the quota of one person (USER) or team (TEAM) for one period: creates it or changes it (one row per owner and period). targetSatang is required; " +
    "targetDeals, targetActivities and note are optional (omit = keep, null = clear). Changing a period that has ended needs a manager-level key.",
  label: "ตั้งโควตา",
  input: z
    .object({
      ownerType: z.enum(OWNER_TYPES),
      ownerId: idStr,
      periodKey: periodKeyText,
      targetSatang: satang,
      targetDeals: countField,
      targetActivities: countField,
      note: optText(500),
    })
    .strict(),
  test: "C3.8-S1.1",
  async handler({ actor, input }) {
    // AUDIT-CLASS X2: คีย์ที่มีตัวกรองตั้งโควตาได้เฉพาะคน/ทีมในตัวกรอง (นอกกรอบ = 422 แบบเดียวกับการสร้างระเบียนนอกกรอบ)
    if (!inKeyPeople(await keyPeopleOf(actor), input.ownerType, input.ownerId)) {
      throw crmApiError(422, "validation", "คีย์นี้จำกัดให้ทำงานกับพนักงาน/ทีมที่กำหนดเท่านั้น — เลือกคนหรือทีมที่อยู่ในตัวกรองของคีย์", "The owner is outside this API key's filter.");
    }
    return quotas.setQuota(crmCtxOf(actor), crmActorOf(actor), { ...input, periodKey: periodKeyIn(input.periodKey) ?? input.periodKey });
  },
});

const quotasBoard = defineCrmOp({
  id: "quotas.board",
  method: "GET",
  path: "/quotas/board",
  kind: "read",
  action: "crm.quota.manage",
  summary:
    "The quota table of one period (default: this month): every staff member and team with target, achieved amount and percent - the same rows as the quota settings page.",
  label: "ตารางโควตา",
  input: z.object({ periodKey: periodKeyText.optional() }).strict(),
  rate: "report",
  test: "C3.8-S8.1",
  async handler({ actor, input }) {
    const people = await keyPeopleOf(actor);
    const board = await quotas.quotaBoard(crmCtxOf(actor), crmActorOf(actor), { periodKey: periodOrNow(input.periodKey) });
    return { ...board, rows: board.rows.filter((r) => inKeyPeople(people, r.ownerType, r.ownerId)) };
  },
});

// ───────────────────────── คอมมิชชัน (C3.3) ─────────────────────────

const commissionsList = defineCrmOp({
  id: "commissions.list",
  method: "GET",
  path: "/commissions",
  kind: "read",
  action: "crm.commission.view",
  summary:
    "Commission rows of this CRM system, newest first, limited to deals the caller can see. Optional filters: status, periodKey (\"2026-09\" or \"2569-09\") and userId.",
  label: "คอมมิชชัน",
  input: z.object({ status: z.enum(COMMISSION_STATUSES).optional(), periodKey: periodKeyText.optional(), userId: idStr.optional(), take, cursor }).strict(),
  test: "C3.8-S1.1",
  async handler({ actor, input }) {
    const people = await keyPeopleOf(actor);
    // รีวิว N2: ตัวกรองคีย์เข้าไปในคำสั่งของบริการ (ก่อนเพดาน) — ตัวชี้หน้าถูกต้อง
    const rows = await commissions.list(crmCtxOf(actor), crmActorOf(actor), {
      status: input.status ?? null,
      periodKey: periodKeyIn(input.periodKey) ?? null,
      userId: input.userId ?? null,
      userIds: people ? [...people.owners] : null,
    });
    return pageOf(rows, input.take, input.cursor);
  },
});

const commissionsPending = defineCrmOp({
  id: "commissions.pending",
  method: "GET",
  path: "/commissions/pending",
  kind: "read",
  action: "crm.commission.approve",
  summary: "Commission rows waiting for approval (oldest first) that the caller may decide on; an approver never sees their own rows here.",
  label: "คอมมิชชันรออนุมัติ",
  input: z.object({ take, cursor }).strict(),
  test: "C3.8-S8.1",
  async handler({ actor, input }) {
    const people = await keyPeopleOf(actor);
    // รีวิวรอบ 2: ตัวกรองคีย์เข้าไปในคำสั่งของบริการ (ก่อนเพดาน) — ตัวชี้หน้าถูกต้อง
    const rows = await commissions.pending(crmCtxOf(actor), crmActorOf(actor), { userIds: people ? [...people.owners] : null });
    return pageOf(rows, input.take, input.cursor);
  },
});

/** คีย์ที่มีตัวกรอง: แถวต้องเป็นของคนในตัวกรอง (นอกกรอบ = 404 แบบระเบียนของร้านอื่น) · รีวิว N2: หาแถวตาม id (ไม่ดึงรายการ) */
async function assertCommissionInKeyScope(actor: Parameters<typeof keyPeopleOf>[0], id: string): Promise<void> {
  const people = await keyPeopleOf(actor);
  if (!people) return;
  const row = await commissions.get(crmCtxOf(actor), crmActorOf(actor), id);
  if (!inKeyPeople(people, "USER", row.userId)) outsideKeyPeople();
}

const commissionsApprove = defineCrmOp({
  id: "commissions.approve",
  method: "POST",
  path: "/commissions/{id}/approve",
  kind: "write",
  action: "crm.commission.approve",
  summary:
    "Approve one PENDING commission row (optional reason). Above the approver's cap (an API key uses the current cap of the person who created it) it answers 409 approval_required and nothing changes; " +
    "approving your own row is refused; a row that was already decided answers 409 state_conflict.",
  label: "อนุมัติคอมมิชชัน",
  input: z.object({ reason: optText(500) }).strict(),
  test: "C3.8-S1.1",
  async handler({ actor, params, input }) {
    const id = params.id ?? "";
    await assertCommissionInKeyScope(actor, id);
    return commissions.approve(crmCtxOf(actor), crmActorOf(actor), { id, reason: input.reason ?? null });
  },
});

const commissionsReject = defineCrmOp({
  id: "commissions.reject",
  method: "POST",
  path: "/commissions/{id}/reject",
  kind: "danger",
  action: "crm.commission.approve",
  summary: "Reject one PENDING commission row. Needs confirm: true and a reason (at least 5 characters) - the salesperson sees the reason.",
  label: "ไม่อนุมัติคอมมิชชัน",
  input: z.object({ reason }).strict(),
  test: "C3.8-S1.1",
  async handler({ actor, params, input }) {
    const id = params.id ?? "";
    await assertCommissionInKeyScope(actor, id);
    return commissions.reject(crmCtxOf(actor), crmActorOf(actor), { id, reason: input.reason });
  },
});

export const SALES_OPS: ApiOp[] = [
  exportStart,
  exportGet,
  quotasList,
  quotasSet,
  quotasBoard,
  commissionsList,
  commissionsPending,
  commissionsApprove,
  commissionsReject,
];
