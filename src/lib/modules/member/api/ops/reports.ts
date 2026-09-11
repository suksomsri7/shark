// ops/reports.ts — op ของ "รายงานสมาชิก" (MEMBER-API §2.19 · M3.10 · บริการ M3.8 `member/reports.ts`)
//
// 7 รายงาน = 7 แท็บของหน้า `/member/reports` (ภาพ 25) — ตัวเลขชุดเดียวกับหน้าจอทุกตัว (บริการตัวเดียวกัน)
// 🔴 สิทธิ์ `member.report.view` ทุกตัว · ถังเพดานอัตรา `report` (ไล่ทั้งฐานสมาชิก)
// 🔴 CSV: `GET /reports/{tab}/csv` เป็นไฟล์เสมอ (`csvAlways`) — ลิงก์ดาวน์โหลด/สเปรดชีตตั้งหัว Accept ไม่ได้
//    ทุกเซลล์ผ่านตัวกัน CSV injection ของบริการ (`csvOf`) · BOM เติมที่แกนที่เดียว
// 🔴 RFM: รายตัวสมาชิก (`scores`) ไม่คืนโดยปริยาย (ร้านใหญ่ = หมื่นแถว) — ขอด้วย `includeScores=true` (สูงสุด 500 แถว)

import { z } from "zod";
import * as reports from "../../reports";
import { REPORT_TABS } from "../../reports-shared";
import { memberActorOf, memberCtxOf } from "../actor";
import { badRequest } from "../http-errors";
import { defineMemberOp, type ApiOp } from "../op";
import { jsonSafe } from "../serialize";

const TEST = "M3.10-S3.7";
const SCORES_MAX = 500;

const monthsQuery = z.object({ months: z.coerce.number().int().min(1).max(36).optional().describe("How many Thai calendar months back (default 12).") }).strict();
const daysQuery = z.object({ days: z.coerce.number().int().min(1).max(730).optional().describe("Window in days.") }).strict();

const overview = defineMemberOp({
  id: "reports.overview",
  method: "GET",
  path: "/reports/overview",
  kind: "read",
  action: "member.report.view",
  rate: "report",
  summary: "Membership at a glance: members (total, new this month, active in 90 days), member sales and their share of all sales, retention, points outstanding and their liability in satang, promotion cost this month, and new members per month.",
  label: "รายงานภาพรวมสมาชิก",
  input: monthsQuery,
  tool: { name: "report_overview", hint: "Use for questions about how the membership is doing overall." },
  test: TEST,
  async handler({ actor, input }) {
    return jsonSafe(await reports.overview(memberCtxOf(actor), memberActorOf(actor), { months: input.months }));
  },
});

const rfm = defineMemberOp({
  id: "reports.rfm",
  method: "GET",
  path: "/reports/rfm",
  kind: "read",
  action: "member.report.view",
  rate: "report",
  summary: "RFM segmentation (recency, frequency, monetary quintiles) into 9 named groups with counts and a Thai description of each. Per-member scores only with `includeScores=true` (at most 500 rows).",
  label: "รายงาน RFM",
  input: z
    .object({
      days: z.coerce.number().int().min(30).max(730).optional().describe("Look-back window in days (default 365)."),
      includeScores: z.enum(["true", "false"]).optional(),
    })
    .strict(),
  tool: { name: "report_rfm", hint: "Use to find champions, members at risk and members who are slipping away." },
  test: TEST,
  async handler({ actor, input }) {
    const res = await reports.rfm(memberCtxOf(actor), memberActorOf(actor), { days: input.days });
    const scores = input.includeScores === "true" ? res.scores.slice(0, SCORES_MAX) : undefined;
    return jsonSafe({ days: res.days, total: res.total, segments: res.segments, ...(scores ? { scores, scoresTruncated: res.scores.length > SCORES_MAX } : {}) });
  },
});

const tiersReport = defineMemberOp({
  id: "reports.tiers",
  method: "GET",
  path: "/reports/tiers",
  kind: "read",
  action: "member.report.view",
  rate: "report",
  summary: "Members per tier with their share, spend and movement.",
  label: "รายงานระดับสมาชิก",
  test: TEST,
  async handler({ actor }) {
    return jsonSafe(await reports.tiers(memberCtxOf(actor), memberActorOf(actor)));
  },
});

const pointsReport = defineMemberOp({
  id: "reports.points",
  method: "GET",
  path: "/reports/points",
  kind: "read",
  action: "member.report.view",
  rate: "report",
  summary: "Points earned, burned and expired per Thai month, with the balance outstanding and its liability.",
  label: "รายงานแต้ม",
  input: monthsQuery,
  test: TEST,
  async handler({ actor, input }) {
    return jsonSafe(await reports.points(memberCtxOf(actor), memberActorOf(actor), { months: input.months }));
  },
});

const promotionsReport = defineMemberOp({
  id: "reports.promotions",
  method: "GET",
  path: "/reports/promotions",
  kind: "read",
  action: "member.report.view",
  rate: "report",
  summary: "Every journey and campaign over a window: entered or sent, used, sales, cost and ROI, with the holdout uplift.",
  label: "รายงานโปรโมชัน",
  input: daysQuery,
  test: TEST,
  async handler({ actor, input }) {
    return jsonSafe(await reports.promotions(memberCtxOf(actor), memberActorOf(actor), { days: input.days }));
  },
});

const sourcesReport = defineMemberOp({
  id: "reports.sources",
  method: "GET",
  path: "/reports/sources",
  kind: "read",
  action: "member.report.view",
  rate: "report",
  summary: "Where members came from over a window: signups per acquisition source and their share.",
  label: "รายงานช่องทางที่มา",
  input: daysQuery,
  test: TEST,
  async handler({ actor, input }) {
    return jsonSafe(await reports.sources(memberCtxOf(actor), memberActorOf(actor), { days: input.days }));
  },
});

const cohortReport = defineMemberOp({
  id: "reports.cohort",
  method: "GET",
  path: "/reports/cohort",
  kind: "read",
  action: "member.report.view",
  rate: "report",
  summary: "Monthly signup cohorts and how many of each came back in the following months.",
  label: "รายงาน cohort",
  input: monthsQuery,
  test: TEST,
  async handler({ actor, input }) {
    return jsonSafe(await reports.cohort(memberCtxOf(actor), memberActorOf(actor), { months: input.months }));
  },
});

const exportCsv = defineMemberOp({
  id: "reports.export",
  method: "GET",
  path: "/reports/{tab}/csv",
  kind: "read",
  action: "member.report.view",
  rate: "report",
  summary: `One report as a CSV file (UTF-8 with a BOM). \`tab\` is one of: ${REPORT_TABS.join(", ")}. The reply is always the file; no Accept header is needed.`,
  label: "ส่งออกรายงานเป็น CSV",
  csvAlways: true,
  csv: (_ctx, data) => {
    const d = data as { csv?: unknown };
    return typeof d?.csv === "string" ? d.csv : "";
  },
  test: TEST,
  async handler({ actor, params }) {
    const tab = String(params.tab ?? "");
    if (!(REPORT_TABS as readonly string[]).includes(tab)) {
      throw badRequest(`ยังไม่มีรายงานชื่อ "${tab}" — เลือกได้: ${REPORT_TABS.join(" · ")}`, `Unknown report "${tab}". Use one of: ${REPORT_TABS.join(", ")}.`);
    }
    const res = await reports.exportCsv(memberCtxOf(actor), memberActorOf(actor), tab);
    return { filename: res.filename, csv: res.csv };
  },
});

export const REPORTS_OPS: ApiOp[] = [overview, rfm, tiersReport, pointsReport, promotionsReport, sourcesReport, cohortReport, exportCsv];
