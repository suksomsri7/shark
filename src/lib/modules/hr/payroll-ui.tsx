import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { canViewPayroll } from "@/lib/core/rbac";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { StatusChip } from "@/components/ui/StatusChip";
import { SubmitButton } from "@/components/ui/SubmitButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatBaht } from "@/lib/ui/money";
import { listEmployees, monthlyAttendance, employeesWithSchedule, bkkParts, type Ctx } from "./service";
import { listSalaryProfiles, listRuns, listAdjustments } from "./payroll";
import PayAdjustForm from "./PayAdjustForm";
import {
  approvePayrollRunAction,
  decideAdjustmentAction,
  cancelAdjustmentAction,
  createPayrollRunAction,
  markPaidAction,
  reverseRunAction,
  setSalaryProfileAction,
} from "./payroll-actions";

const muted = "text-[color:var(--color-muted)]";

// สถานะรอบจ่าย (ไทย) — ร่าง(เทา) · อนุมัติแล้ว(ดำ) · จ่ายแล้ว(ดำ)
const RUN_STATUS_LABEL: Record<string, string> = {
  DRAFT: "ร่าง",
  APPROVED: "อนุมัติแล้ว",
  PAID: "จ่ายแล้ว",
  REVERSED: "กลับรายการแล้ว",
};
const runTone = (v: string): "muted" | "strong" =>
  v === "DRAFT" || v === "REVERSED" ? "muted" : "strong";

// รายการเพิ่ม/หักในงวด (OT · คอมมิชชั่น · หักเงิน)
const ADJUST_KIND_LABEL: Record<string, string> = {
  OT: "ค่าล่วงเวลา",
  COMMISSION: "คอมมิชชั่น",
  BONUS: "โบนัส",
  ALLOWANCE: "เบี้ยเลี้ยง",
  DEDUCTION: "หักเงิน",
  ADVANCE: "หักเบิกล่วงหน้า",
};
const ADJUST_ADD = new Set(["OT", "COMMISSION", "BONUS", "ALLOWANCE"]);
const ADJUST_STATUS_LABEL: Record<string, string> = {
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
};
const adjustTone = (v: string): "muted" | "strong" | "danger" =>
  v === "APPROVED" ? "strong" : v === "REJECTED" ? "danger" : "muted";

// ───────────── PayrollSection (หน้าย่อย /app/sys/[id]/hr/payroll) ─────────────
export async function PayrollSection({ systemId }: { systemId: string }) {
  const auth = await requireTenant();

  // 🔒 PDPA: เงินเดือน + เลขผู้เสียภาษี = ข้อมูลอ่อนไหว — เห็นเฉพาะ OWNER หรือผู้มีสิทธิ์ hr.payroll.read
  const membership = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  if (!canViewPayroll(membership)) {
    return (
      <Section title="เงินเดือนพนักงาน">
        <p className={`text-xs ${muted}`}>
          ข้อมูลเงินเดือนจำกัดเฉพาะเจ้าของกิจการหรือผู้ได้รับสิทธิ์ — ติดต่อเจ้าของกิจการเพื่อขอสิทธิ์เข้าถึง
        </p>
      </Section>
    );
  }

  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };

  const [employees, profiles, runs, scheduled, adjustments] = await Promise.all([
    listEmployees(ctx),
    listSalaryProfiles(ctx),
    listRuns(ctx),
    employeesWithSchedule(ctx),
    listAdjustments(ctx),
  ]);
  // การเข้างานเดือนนี้ + เดือนก่อน (งวดที่มักจะกำลังจ่าย) — ใช้ประกอบการตัดสินใจ
  // 🔴 ระบบไม่หักเงินอัตโนมัติจากการสาย/ขาด: เป็นนโยบายของร้าน + มีผลทางกฎหมาย ต้องให้คนตัดสิน
  const [byy, bmm] = bkkParts(new Date()).dateStr.split("-").map(Number);
  const thisMonth = new Date(Date.UTC(byy!, bmm! - 1, 1));
  const prevMonth = new Date(Date.UTC(byy!, bmm! - 2, 1));
  const monthName = (d: Date) =>
    d.toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "UTC" });
  const attendance = await Promise.all(
    employees.map(async (e) => ({
      emp: e,
      now: await monthlyAttendance(ctx, e.id, thisMonth),
      prev: await monthlyAttendance(ctx, e.id, prevMonth),
    })),
  );
  const profileByEmp = new Map(profiles.map((p) => [p.employeeId, p]));
  const nameByEmp = new Map(employees.map((e) => [e.id, e.name]));

  return (
    <div className="flex flex-col gap-6">
      {/* โปรไฟล์เงินเดือนต่อพนักงาน */}
      <Section title="เงินเดือนพนักงาน">
        {employees.length === 0 ? (
          <p className={`text-xs ${muted}`}>เพิ่มพนักงานก่อน แล้วจึงตั้งเงินเดือนได้</p>
        ) : (
          <div className="flex flex-col gap-3">
            {employees.map((e) => {
              const p = profileByEmp.get(e.id);
              const d = (p?.personalDeductionJson ?? {}) as { spouse?: boolean; children?: number };
              return (
                <form
                  key={e.id}
                  action={setSalaryProfileAction}
                  className="flex flex-wrap items-end gap-2 rounded-lg border px-3 py-2"
                >
                  <input type="hidden" name="systemId" value={systemId} />
                  <input type="hidden" name="employeeId" value={e.id} />
                  <div className="min-w-[8rem] flex-1">
                    <div className="truncate text-sm font-medium">{e.name}</div>
                    <div className={`text-xs ${muted}`}>
                      {p ? `ปัจจุบัน ${formatBaht(p.baseSalarySatang)}/เดือน` : "ยังไม่ตั้งเงินเดือน"}
                    </div>
                  </div>
                  <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                    เงินเดือน (บาท)
                    <input
                      name="baseSalaryBaht"
                      inputMode="decimal"
                      required
                      defaultValue={p ? String(p.baseSalarySatang / 100) : ""}
                      placeholder="เช่น 30000"
                      className="input w-28"
                    />
                  </label>
                  <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                    บุตร (คน)
                    <input
                      name="children"
                      type="number"
                      min={0}
                      defaultValue={d.children ?? 0}
                      className="input w-20"
                    />
                  </label>
                  <label className={`flex items-center gap-1 text-xs ${muted}`}>
                    <input type="checkbox" name="spouse" defaultChecked={!!d.spouse} />
                    มีคู่สมรส
                  </label>
                  <label className={`flex items-center gap-1 text-xs ${muted}`}>
                    <input
                      type="checkbox"
                      name="ssoEligible"
                      value="on"
                      defaultChecked={p ? p.ssoEligible : true}
                    />
                    หักประกันสังคม
                  </label>
                  <SubmitButton variant="ghost">บันทึก</SubmitButton>
                </form>
              );
            })}
          </div>
        )}
      </Section>

      {/* การเข้างาน (สาย/ขาด) ประกอบการจ่าย — ไม่หักเงินให้อัตโนมัติ */}
      <Section title="การเข้างานประกอบการจ่าย">
        {employees.length === 0 ? (
          <p className={`text-xs ${muted}`}>เพิ่มพนักงานก่อน</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className={`text-xs ${muted}`}>
              ระบบ<b>ไม่หักเงินอัตโนมัติ</b>จากการสาย/ขาด — ตัวเลขนี้ให้ดูประกอบก่อนตั้งเงินได้/หัก
              (พนักงานที่ยังไม่ตั้งตารางเข้างาน ระบบไม่ตัดสินว่าสาย)
            </p>
            {attendance.map(({ emp, now, prev }) => (
              <div key={emp.id} className="rounded-lg border px-3 py-2">
                <div className="truncate text-sm font-medium">{emp.name}</div>
                {scheduled.has(emp.id) ? (
                  <div className={`mt-0.5 flex flex-col gap-0.5 text-xs ${muted}`}>
                    <span>
                      {monthName(thisMonth)}: สาย {now.lateCount} ครั้ง · ขาด {now.absentDays} วัน · ลา{" "}
                      {now.leaveDays} วัน · ทำงาน {Math.floor(now.workedMinutes / 60)} ชม.
                    </span>
                    <span>
                      {monthName(prevMonth)}: สาย {prev.lateCount} ครั้ง · ขาด {prev.absentDays} วัน · ลา{" "}
                      {prev.leaveDays} วัน · ทำงาน {Math.floor(prev.workedMinutes / 60)} ชม.
                    </span>
                  </div>
                ) : (
                  <p className={`mt-0.5 text-xs ${muted}`}>ยังไม่ตั้งตารางเข้างาน — ตั้งที่แท็บ “พนักงาน”</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* OT / คอมมิชชั่น / หักเงิน — ยื่นแล้วรออนุมัติ (คนยื่น ≠ คนอนุมัติ) */}
      <Section title="OT · คอมมิชชั่น · หักเงิน">
        <div className="flex flex-col gap-3">
          <p className={`text-xs ${muted}`}>
            ยื่นรายการเข้างวด → <b>อนุมัติ</b> ก่อน จึงจะถูกดึงเข้ารอบจ่ายของงวดนั้น ·
            รายการที่ยังไม่อนุมัติจะไม่มีผลกับเงินเดือน · เข้ารอบจ่ายแล้วแก้ไม่ได้ (ใช้กลับรายการรอบจ่ายแทน)
          </p>
          <PayAdjustForm
            systemId={systemId}
            employees={employees.map((e) => ({ id: e.id, name: e.name }))}
            defaultPeriod={new Date().toISOString().slice(0, 7)}
          />
          <div className="flex flex-col gap-2 border-t pt-3">
            {adjustments.length === 0 ? (
              <p className={`text-xs ${muted}`}>ยังไม่มีรายการในงวดไหน</p>
            ) : (
              adjustments.slice(0, 30).map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      {nameByEmp.get(a.employeeId) ?? "—"} · {ADJUST_KIND_LABEL[a.kind] ?? a.kind}{" "}
                      {ADJUST_ADD.has(a.kind) ? "+" : "−"}
                      {formatBaht(a.amountSatang)}
                    </span>
                    <span className={`block truncate text-xs ${muted}`}>
                      งวด {a.periodKey}
                      {a.hours ? ` · ${a.hours} ชม.` : ""}
                      {a.note ? ` · ${a.note}` : ""}
                      {a.runId ? " · เข้ารอบจ่ายแล้ว" : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusChip value={a.status} map={ADJUST_STATUS_LABEL} toneOf={adjustTone} />
                    {a.status === "PENDING" && !a.runId && (
                      <>
                        <form action={decideAdjustmentAction}>
                          <input type="hidden" name="systemId" value={systemId} />
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="status" value="APPROVED" />
                          <SubmitButton variant="primary">อนุมัติ</SubmitButton>
                        </form>
                        <form action={decideAdjustmentAction}>
                          <input type="hidden" name="systemId" value={systemId} />
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="status" value="REJECTED" />
                          <SubmitButton variant="ghost">ไม่อนุมัติ</SubmitButton>
                        </form>
                      </>
                    )}
                    {a.status !== "PENDING" && !a.runId && (
                      <form action={cancelAdjustmentAction}>
                        <input type="hidden" name="systemId" value={systemId} />
                        <input type="hidden" name="id" value={a.id} />
                        <button className="text-xs text-[color:var(--color-danger)] underline">ลบ</button>
                      </form>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </Section>

      {/* สร้างรอบจ่าย */}
      <Section title="สร้างรอบจ่ายเงินเดือน">
        {profiles.length === 0 ? (
          <p className={`text-xs ${muted}`}>ตั้งเงินเดือนพนักงานอย่างน้อย 1 คนก่อนสร้างรอบจ่าย</p>
        ) : (
          <form action={createPayrollRunAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="systemId" value={systemId} />
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              งวด (เดือน)
              <input name="periodKey" type="month" required className="input" />
            </label>
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              วันที่จ่าย
              <input name="payDate" type="date" required className="input" />
            </label>
            <SubmitButton variant="primary" pendingText="กำลังสร้าง…">
              + สร้างรอบจ่าย
            </SubmitButton>
          </form>
        )}
      </Section>

      {/* รายการรอบจ่าย */}
      <Section title={`รอบจ่ายเงินเดือน (${runs.length})`}>
        <DataList
          items={runs.map((r) => ({
            key: r.id,
            primary: (
              <span>
                งวด {r.periodKey} · {formatBaht(r.totalNetSatang)}
              </span>
            ),
            secondary: `${r.items.length} คน · เงินเดือนรวม ${formatBaht(r.totalGrossSatang)} · ปสส. ${formatBaht(r.totalSsoEmployeeSatang)} · ภาษี ${formatBaht(r.totalWhtSatang)}`,
            trailing: (
              <div className="flex items-center gap-2">
                <StatusChip value={r.status} map={RUN_STATUS_LABEL} tone={runTone(r.status)} />
                {r.status === "DRAFT" && (
                  <ConfirmDialog
                    triggerLabel="อนุมัติ"
                    triggerClassName="rounded-full border px-3 py-1.5 text-xs hover:bg-[color:var(--color-surface-2)]"
                    title={`อนุมัติรอบจ่ายงวด ${r.periodKey}?`}
                    detail={`จ่ายสุทธิรวม ${formatBaht(r.totalNetSatang)} · เงินเดือนรวม ${formatBaht(r.totalGrossSatang)} · ประกันสังคม ${formatBaht(r.totalSsoEmployeeSatang + r.totalSsoEmployerSatang)} · ภาษีหัก ณ ที่จ่าย ${formatBaht(r.totalWhtSatang)} — จะลงบัญชีอัตโนมัติถ้าเปิดระบบบัญชีไว้`}
                    confirmLabel="ยืนยันอนุมัติ"
                    action={approvePayrollRunAction}
                    fields={{ systemId, runId: r.id }}
                  />
                )}
                {r.status === "APPROVED" && (
                  <ConfirmDialog
                    triggerLabel="จ่ายแล้ว"
                    triggerClassName="rounded-full border px-3 py-1.5 text-xs hover:bg-[color:var(--color-surface-2)]"
                    title={`บันทึกจ่ายเงินเดือนงวด ${r.periodKey}?`}
                    detail={`ยืนยันว่าจ่ายเงินเดือนสุทธิ ${formatBaht(r.totalNetSatang)} เรียบร้อยแล้ว`}
                    confirmLabel="ยืนยันจ่ายแล้ว"
                    action={markPaidAction}
                    fields={{ systemId, runId: r.id }}
                  />
                )}
                {(r.status === "APPROVED" || r.status === "PAID") && (
                  <ConfirmDialog
                    triggerLabel="กลับรายการ"
                    triggerClassName="rounded-full border px-3 py-1.5 text-xs text-[color:var(--color-danger)] hover:bg-[color:var(--color-surface-2)]"
                    title={`กลับรายการเงินเดือนงวด ${r.periodKey}?`}
                    detail={`ระบบจะลงบัญชีกลับรายการ (JV ตรงข้าม) ของเงินเดือนงวดนี้ — เงินเดือนรวม ${formatBaht(r.totalGrossSatang)} · จ่ายสุทธิ ${formatBaht(r.totalNetSatang)} · ใช้เมื่อลงเงินเดือนผิดงวด/ผิดยอด (รายการเดิมยังอยู่ตามหลักบัญชี — ไม่ลบ)`}
                    confirmLabel="ยืนยันกลับรายการ"
                    danger
                    action={reverseRunAction}
                    fields={{ systemId, runId: r.id }}
                    reasonField={{ name: "reason", label: "เหตุผล (ไม่บังคับ)" }}
                  />
                )}
              </div>
            ),
          }))}
          empty="ยังไม่มีรอบจ่าย — สร้างรอบจ่ายด้านบนเพื่อคำนวณเงินเดือน/ปสส./ภาษี"
        />

        {/* ลิงก์สลิปต่อพนักงาน (ต่อรอบ) */}
        {runs.map((r) =>
          r.items.length === 0 ? null : (
            <div key={r.id} className="mt-1 flex flex-wrap items-center gap-2">
              <span className={`text-xs ${muted}`}>สลิปงวด {r.periodKey}:</span>
              {r.items.map((it) => (
                <Link
                  key={it.id}
                  href={`/app/sys/${systemId}/payroll/${r.id}/slip/${it.employeeId}`}
                  className="rounded-full border px-3 py-1 text-xs hover:bg-[color:var(--color-surface-2)]"
                >
                  {nameByEmp.get(it.employeeId) ?? "พนักงาน"}
                </Link>
              ))}
            </div>
          ),
        )}
      </Section>
    </div>
  );
}

export default PayrollSection;
