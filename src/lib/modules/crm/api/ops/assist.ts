// ops/assist.ts — op ของใบ C3.4 (ผู้ช่วย AI ชุดสุดท้าย → รวม 32 tool) · addendum ข้อ 1 + มติผู้คุมงาน C3.6–C3.9 ข้อ (1)
//
//   deals.atRisk.list        GET  /deals/at-risk               crm.deal.read        read   tool crm_deals_at_risk     (ชุดเดียวกับตารางหน้าแรก — ai-bridges.atRiskDeals)
//   activities.taskCard.open POST /activities/{id}/task-card   crm.activity.create  write  tool crm_create_task_card  (activities.openTaskCard ของ C1.6)
//   reports.get              GET  /reports/{tab}               crm.report.view      read   tool crm_reports           (reports.getReport ของ C3.1)
//   quotas.progress          GET  /quotas/progress             crm.report.view      read   tool crm_quota_progress    (quotas.progress ของ C3.2)
//   commissions.mine         GET  /commissions/mine            crm.commission.view  read   tool crm_commissions_mine  (commissions.mine ของ C3.3)
// 🔴 สาม op หลัง "C3.4 เป็นผู้สร้าง" (มติผู้คุมงาน) ด้วย id/method/path/key/kind ตามสัญญาของ C3.8 — C3.8 เติมแค่ของตัวเอง ·
//    test id ของสามตัวนั้น = `C3.8-S1.1` (ข้อสอบ C3.8 เทียบ test id กับรายการของมัน · F13.10 เจอ literal ในไฟล์ข้อสอบ)
// 🔴 ไม่มีตรรกะของตัวเอง — เรียกบริการเดิมตัวเดียว (ไม่มี engine ที่สอง) · การมองเห็น/คีย์อยู่ในบริการ (AUDIT-CLASS X2)
// 🔴 ai-bridges ถูกโหลดแบบ dynamic ใน handler: ai-bridges → api/tools → registry → ops/* ⇒ import หัวไฟล์ = วงโหลด

import { z } from "zod";
import * as activities from "../../activities";
import * as commissions from "../../commissions";
import * as quotas from "../../quotas";
import * as reports from "../../reports";
import { periodKeyOf } from "../../quotas-shared";
import { crmActorOf, crmCtxOf } from "../actor";
import { defineCrmOp, type ApiOp } from "../op";
import { idStr, isoDate, optId, text } from "../schema";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

const atRisk = defineCrmOp({
  id: "deals.atRisk.list",
  method: "GET",
  path: "/deals/at-risk",
  kind: "read",
  action: "crm.deal.read",
  summary:
    "Open deals at risk in a Thai calendar month (default: this month): expected to close before the month ends (overdue ones included) and " +
    "stalled, past their close date, without a next activity, or still at forecast PIPELINE within 7 days of closing. Each item lists its reasons. " +
    "Same set as the CRM home page table; only deals the caller can see.",
  label: "ดีลเสี่ยงเดือนนี้",
  input: z.object({ month: month.optional(), team: text(64).optional(), owner: text(64).optional() }).strict(),
  rate: "report",
  test: "C3.4-S3.2",
  tool: { name: "crm_deals_at_risk", hint: "Use to answer which deals are at risk this month and why (stalled, overdue close date, no next activity)." },
  async handler({ actor, input }) {
    const bridges = await import("../../ai-bridges");
    return bridges.atRiskDeals(crmCtxOf(actor), crmActorOf(actor), { month: input.month ?? null, team: input.team ?? null, owner: input.owner ?? null });
  },
});

const taskCard = defineCrmOp({
  id: "activities.taskCard.open",
  method: "POST",
  path: "/activities/{id}/task-card",
  kind: "write",
  action: "crm.activity.create",
  summary: "Open (or reuse) a task-board card for one CRM activity on a board the caller can see; the card links back to the deal, contact and company of the activity.",
  label: "เปิดการ์ดบอร์ดงานจากกิจกรรม",
  input: z.object({ boardId: idStr, columnId: optId }).strict(),
  test: "C3.4-S3.1",
  tool: { name: "crm_create_task_card", hint: "Use to propose putting a CRM task or activity on a task board (Kanban); find the board id first." },
  async handler({ actor, params, input }) {
    const r = await activities.openTaskCard(crmCtxOf(actor), crmActorOf(actor), { activityId: params.id ?? "", boardId: input.boardId, columnId: input.columnId ?? null });
    return { activityId: params.id ?? "", cardId: r.cardId, created: r.created };
  },
});

const reportsGet = defineCrmOp({
  id: "reports.get",
  method: "GET",
  path: "/reports/{tab}",
  kind: "read",
  action: "crm.report.view",
  summary:
    "One CRM report tab (overview, forecast, funnel, reps, activities, lost, sources, scores) with the same numbers as the reports page, " +
    "limited to what the caller may see. Optional filters: from/to (dates), teamId, pipelineId, ownerUserId, and groupBy (month, owner, team) for forecast.",
  label: "รายงาน CRM",
  input: z
    .object({
      from: isoDate.optional(),
      to: isoDate.optional(),
      teamId: idStr.optional(),
      pipelineId: idStr.optional(),
      ownerUserId: idStr.optional(),
      groupBy: z.enum(["month", "owner", "team"]).optional(),
    })
    .strict(),
  rate: "report",
  test: "C3.8-S1.1",
  tool: { name: "crm_reports", hint: "Use for sales report questions: funnel, forecast, results per salesperson, lost reasons, lead sources or scores." },
  async handler({ actor, params, input }) {
    return reports.getReport(crmCtxOf(actor), crmActorOf(actor), params.tab ?? "", {
      from: input.from ?? null,
      to: input.to ?? null,
      teamId: input.teamId ?? null,
      pipelineId: input.pipelineId ?? null,
      ownerUserId: input.ownerUserId ?? null,
      ...(input.groupBy ? { groupBy: input.groupBy } : {}),
    });
  },
});

const quotaProgress = defineCrmOp({
  id: "quotas.progress",
  method: "GET",
  path: "/quotas/progress",
  kind: "read",
  action: "crm.report.view",
  summary:
    "Progress against the sales quota of one person or team for a period (periodKey \"2026-09\", \"2026-Q3\" or \"2026\"; default: the caller, this month). " +
    "Counted from payments received and won deals. Only people/teams the caller may see.",
  label: "ความคืบหน้าโควตา",
  input: z.object({ ownerType: z.enum(["USER", "TEAM"]).optional(), ownerId: idStr.optional(), periodKey: text(10).optional() }).strict(),
  rate: "report",
  test: "C3.8-S1.1",
  tool: { name: "crm_quota_progress", hint: "Use to answer how far a salesperson or team is from their quota this month or quarter." },
  async handler({ actor, input }) {
    const ownerType = input.ownerType ?? "USER";
    const ownerId = input.ownerId ?? (ownerType === "USER" ? actor.userId ?? "" : "");
    return quotas.progress(crmCtxOf(actor), crmActorOf(actor), { ownerType, ownerId, periodKey: input.periodKey ?? periodKeyOf(new Date(), "MONTH") });
  },
});

const commissionsMine = defineCrmOp({
  id: "commissions.mine",
  method: "GET",
  path: "/commissions/mine",
  kind: "read",
  action: "crm.commission.view",
  summary: "The caller's own commission rows (newest first) and totals per status. Optional filters: status (PENDING, APPROVED, PAID, REVERSED, REJECTED) and periodKey (\"2026-09\").",
  label: "คอมมิชชันของฉัน",
  input: z.object({ status: z.enum(["PENDING", "APPROVED", "PAID", "REVERSED", "REJECTED"]).optional(), periodKey: text(7).optional() }).strict(),
  rate: "read",
  test: "C3.8-S1.1",
  tool: { name: "crm_commissions_mine", hint: "Use to answer how much commission the person asking has earned, is waiting for, or was paid." },
  async handler({ actor, input }) {
    const ctx = crmCtxOf(actor);
    const a = crmActorOf(actor);
    const f = { status: input.status ?? null, periodKey: input.periodKey ?? null };
    const [items, totals] = await Promise.all([commissions.mine(ctx, a, f), commissions.mineTotals(ctx, a, f)]);
    return { items, totals };
  },
});

export const ASSIST_OPS: ApiOp[] = [atRisk, taskCard, reportsGet, quotaProgress, commissionsMine];
