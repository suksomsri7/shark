// ops/payslips.ts — ประวัติสลิปรายปี · สลิปรายงวด (ใบ H4.8 · brief §4 ข้อ 13–14 · มติ Q7/Q9 · O1)
//   ตัวอ่านเดียวกับหน้าจอ: payslip.ts slipHistory / slipForViewer — อ่านสมาชิกภาพจริงจากฐาน ⇒ ผู้ดู = ผู้ออกคีย์ (เจ้าของร้าน)
//   คำตอบผ่าน serializer (ไม่มี bankMasked · ไม่มีลิงก์) · สลิปที่ยังไม่ออก/ถูกถอน = 409 state_conflict · ไม่พบ/ไม่มีสิทธิ์ = 404 เดียวกัน
//   ถังเพดาน report · ทุกการอ่านที่ส่งข้อมูลออก = ประวัติ 1 แถว (R8: id + ปีภาษีเท่านั้น) ก่อนตอบ
import { z } from "zod";
import { auditPayRead, endedEmployeeIds, hrIssuerViewer } from "../actor";
import { hrNotFound, hrStateConflict } from "../http-errors";
import { defineHrOp, type ApiOp } from "../op";
import { serializeHistory, serializeSlip } from "../serialize";
import { slipForViewer, slipHistory } from "../../payslip";
import { SLIP_TEXT } from "../../payslip-rules";

const TEST = "qc-hr-h4.8";

const history = defineHrOp({
  id: "payslips.history",
  method: "GET",
  path: "/employees/{employeeId}/payslips",
  kind: "read",
  rate: "report",
  action: "hr.payroll.read",
  summary: "Issued payslips of one employee in one tax year with the yearly totals (satang). Audited. No bank details and no links. An ended employee answers 404 not_found like an unknown id.",
  label: "ประวัติสลิปเงินเดือนรายปี",
  test: TEST,
  input: z.object({ taxYear: z.coerce.number().int().min(2000).max(2400).describe("Tax year (Gregorian), e.g. 2026.") }).strict(),
  async handler({ actor, params, input }) {
    const viewer = await hrIssuerViewer(actor);
    if (!viewer) throw hrNotFound();
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    // brief ไม่ได้เปิดสลิปของพนักงานที่พ้นสภาพ ⇒ 404 เหมือน id ที่ไม่มี (มติรอบแก้ ข้อ 5)
    if ((await endedEmployeeIds(ctx)).has(params.employeeId ?? "")) throw hrNotFound();
    const h = await slipHistory(ctx, viewer, { employeeId: params.employeeId ?? "", taxYear: input.taxYear });
    if (!h.ok) throw hrNotFound();
    await auditPayRead(actor, "hr.api.payslip.history", "HrEmployee", h.employeeId, { employeeId: h.employeeId, taxYear: input.taxYear });
    return serializeHistory(h);
  },
});

const STATE_TEXT: Record<string, string> = { DRAFT: SLIP_TEXT.notIssued, NOT_FINAL: SLIP_TEXT.notFinal, WITHDRAWN: SLIP_TEXT.withdrawn };

const slipGet = defineHrOp({
  id: "payslips.get",
  method: "GET",
  path: "/payslips/{runId}/{employeeId}",
  kind: "read",
  rate: "report",
  action: "hr.payroll.read",
  summary: "One issued payslip (earnings, deductions, net, SSO, satang). A run that is still a draft, not finished or reversed answers 409 state_conflict. Audited. No bank details. An ended employee answers 404 not_found like an unknown id.",
  label: "สลิปเงินเดือน",
  test: TEST,
  input: z.object({}).strict(),
  async handler({ actor, params }) {
    const viewer = await hrIssuerViewer(actor);
    if (!viewer) throw hrNotFound();
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    if ((await endedEmployeeIds(ctx)).has(params.employeeId ?? "")) throw hrNotFound();
    const s = await slipForViewer(ctx, viewer, { runId: params.runId ?? "", employeeId: params.employeeId ?? "" });
    if (!s.ok) {
      if (s.code === "SLIP_DATA") throw hrStateConflict(s.reason);
      throw hrNotFound();
    }
    if (s.state !== "ISSUED") throw hrStateConflict(STATE_TEXT[s.state] ?? SLIP_TEXT.notIssued);
    await auditPayRead(actor, "hr.api.payslip.read", "HrPayrollRun", s.runId, { runId: s.runId, employeeId: params.employeeId ?? "" });
    return serializeSlip(s);
  },
});

export const PAYSLIPS_OPS: ApiOp[] = [history, slipGet];
