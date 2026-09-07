// ops/reports.ts — op ของ "รายงาน" ข้ามบอร์ด (K2.10 · เปิดผ่าน REST ใน K2.12)
//
// 🔴 `reports.ts#assertReportAccess` ตรวจสิทธิ์เอง: OWNER ผ่านเสมอ · อื่น ๆ ต้องมีคีย์ `kanban.report.view`
//    ชัด ๆ (ไม่ได้มาฟรีจากสิทธิ์อื่นของโมดูล — ดูหัวไฟล์ reports.ts) ⇒ ทุก op ที่นี่ใช้ `action:
//    "kanban.report.view"` ตรง ๆ (มีเฉพาะชุดคีย์ `kanban-admin` — ตรงกับที่หน้าจอ/K2.10 ออกแบบไว้)

import { z } from "zod";
import { aging, overdue, throughput, workload } from "../../reports";
import { kanbanActorOf, kanbanCtxOf } from "../actor";
import { defineKanbanOp, type ApiOp } from "../op";

const reportBaseInput = z
  .object({ boardId: z.string().max(40).optional().describe("Limit to one board. Omit for every board this key can see.") })
  .strict();

const reportsOverdue = defineKanbanOp({
  id: "reports.overdue",
  method: "GET",
  path: "/reports/overdue",
  kind: "read",
  action: "kanban.report.view",
  summary: "Cards that are past their due date and not yet completed, across every board this key can see (or one board), oldest overdue first.",
  label: "รายงานงานเลยกำหนด",
  tool: { name: "kanban_overdue_report", hint: "Use this to answer 'what is overdue' or to summarise overdue work across the shop." },
  input: reportBaseInput,
  test: "K2.12-S3.3",
  async handler({ actor, input }) {
    const ctx = kanbanCtxOf(actor);
    return overdue(ctx, kanbanActorOf(actor), { now: new Date(), ...(input.boardId ? { boardId: input.boardId } : {}) });
  },
});

const reportsWorkload = defineKanbanOp({
  id: "reports.workload",
  method: "GET",
  path: "/reports/workload",
  kind: "read",
  action: "kanban.report.view",
  summary: "Per-person load across every board this key can see (or one board): open cards, overdue, due this week, and completed in the last 30 days.",
  label: "รายงานภาระงาน",
  tool: { name: "kanban_workload_report", hint: "Use this to answer 'who has too much on their plate' or 'how busy is X'." },
  input: reportBaseInput,
  test: "K2.12-S3.1",
  async handler({ actor, input }) {
    const ctx = kanbanCtxOf(actor);
    return workload(ctx, kanbanActorOf(actor), { now: new Date(), ...(input.boardId ? { boardId: input.boardId } : {}) });
  },
});

const reportsThroughputInput = z
  .object({
    boardId: z.string().max(40).optional().describe("Limit to one board. Omit for every board this key can see."),
    weeks: z.coerce.number().int().min(1).max(52).optional().describe("How many Monday-to-Sunday (Thai time) weeks to return, most recent last. Default 12."),
  })
  .strict();

const reportsThroughput = defineKanbanOp({
  id: "reports.throughput",
  method: "GET",
  path: "/reports/throughput",
  kind: "read",
  action: "kanban.report.view",
  summary: "Cards created vs. completed per week (Thai calendar Monday-Sunday), across every board this key can see (or one board).",
  label: "รายงานผลงานรายสัปดาห์",
  input: reportsThroughputInput,
  test: "K2.12-S3.1",
  async handler({ actor, input }) {
    const ctx = kanbanCtxOf(actor);
    const weeks = await throughput(ctx, kanbanActorOf(actor), {
      now: new Date(),
      ...(input.boardId ? { boardId: input.boardId } : {}),
      ...(input.weeks ? { weeks: input.weeks } : {}),
    });
    return { weeks };
  },
});

const reportsAging = defineKanbanOp({
  id: "reports.aging",
  method: "GET",
  path: "/reports/aging",
  kind: "read",
  action: "kanban.report.view",
  summary: "How long open cards have been sitting, bucketed (0-7 / 8-14 / 15-30 / 31+ days), plus average and max age per column, across every board this key can see (or one board).",
  label: "รายงานอายุงาน",
  input: reportBaseInput,
  test: "K2.12-S3.1",
  async handler({ actor, input }) {
    const ctx = kanbanCtxOf(actor);
    return aging(ctx, kanbanActorOf(actor), { now: new Date(), ...(input.boardId ? { boardId: input.boardId } : {}) });
  },
});

export const REPORTS_OPS: ApiOp[] = [reportsOverdue, reportsWorkload, reportsThroughput, reportsAging];
