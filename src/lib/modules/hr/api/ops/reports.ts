// ops/reports.ts — รายงาน HR แบบ JSON (ใบ H4.8 · brief §4 ข้อ 12 · มติ Q7/Q8)
//   ตัวอ่านเดียวกับหน้าจอ: reports.ts loadReport — อ่านสมาชิกภาพจริงจากฐาน ⇒ ผู้ดู = ผู้ออกคีย์ (hrIssuerViewer · เจ้าของร้าน)
//   แล้วตัดคอลัมน์ตาม scope ของคีย์ด้วย serializeReport (allow-list: ชั้น P เสมอ · ชั้น $ เมื่อถือ hr.payroll.read · ชั้น I ไม่เคย)
//   scope ต่อรายงาน (ตรวจซ้ำใน handler): time/ot = hr.roster.read · leave = hr.leave.read · เงินเดือน/ค่าจ้าง/ภาษี = hr.payroll.read
//   ทะเบียนลูกจ้าง (register) ไม่เปิดทาง API = 404 · ไม่มี CSV/XLSX · ถังเพดาน report · รายงานเงินเดือนลงประวัติทุกครั้ง (R8)
import { z } from "zod";
import { auditPayRead, hrIssuerViewer, hrKeyCan } from "../actor";
import { hrNotFound, hrScopeMissing, hrUnprocessable } from "../http-errors";
import { defineHrOp, HR_PERIOD, type ApiOp } from "../op";
import { reportCarriesMoney, serializeReport } from "../serialize";
import { loadReport } from "../../reports";

const TEST = "qc-hr-h4.8";
/** รายงานที่เปิดทาง API (ทะเบียนลูกจ้างไม่อยู่ในรายการ — มติ Q8) */
export const HR_API_REPORTS = ["time", "ot", "leave", "payroll-month", "payroll-year", "wages", "tax-month", "tax-year"] as const;
type ApiReport = (typeof HR_API_REPORTS)[number];
export const reportScopeOf = (r: ApiReport): string => (r === "time" || r === "ot" ? "hr.roster.read" : r === "leave" ? "hr.leave.read" : "hr.payroll.read");
const isApiReport = (v: unknown): v is ApiReport => typeof v === "string" && (HR_API_REPORTS as readonly string[]).includes(v);

const reportsGet = defineHrOp({
  id: "reports.get",
  method: "GET",
  path: "/reports/{report}",
  kind: "read",
  rate: "report",
  action: "hr.employee.read",
  summary: "One HR report as JSON: time, ot, leave, payroll-month, payroll-year, wages, tax-month or tax-year. period is YYYY-MM for monthly reports and YYYY for yearly ones (leave, payroll-year, tax-year). time and ot also need hr.roster.read, leave needs hr.leave.read, the pay reports need hr.payroll.read. Money columns appear only for keys with hr.payroll.read; statutory id columns never. Every answer that carries money columns is audited.",
  label: "รายงานงานบุคคล",
  test: TEST,
  input: z
    .object({
      period: HR_PERIOD.describe("YYYY-MM (monthly reports) or YYYY (leave, payroll-year, tax-year)."),
      unitId: z.string().min(1).max(64).optional().describe("Only this branch."),
    })
    .strict(),
  async handler({ actor, params, input }) {
    const report = params.report;
    if (!isApiReport(report)) throw hrNotFound();
    const need = reportScopeOf(report);
    if (!hrKeyCan(actor, need)) throw hrScopeMissing(need);
    const viewer = await hrIssuerViewer(actor);
    if (!viewer) throw hrNotFound();
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const r = await loadReport(ctx, viewer, { report, period: input.period, unitId: input.unitId ?? null });
    if (!r.ok) {
      if (r.code === "LIMIT" || r.code === "INPUT") throw hrUnprocessable(r.reason);
      throw hrNotFound();
    }
    const pay = hrKeyCan(actor, "hr.payroll.read");
    const out = serializeReport(r, { pay });
    // ลงประวัติเมื่อคำตอบ "มีเงินจริง" (คอลัมน์ชั้น $) — รวม OT/เวลาที่อ่านด้วยคีย์ข้อมูลเงินเดือน ไม่ใช่ตาม scope ของรายงาน (มติรอบแก้ ข้อ 1)
    if (reportCarriesMoney(report, pay)) await auditPayRead(actor, "hr.api.report.read", "HrReport", report, { report, period: r.period, unitId: r.unitId });
    return out;
  },
});

export const REPORTS_OPS: ApiOp[] = [reportsGet];
