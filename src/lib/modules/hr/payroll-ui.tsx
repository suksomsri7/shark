import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { canViewPayroll } from "@/lib/core/rbac";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { StatusChip } from "@/components/ui/StatusChip";
import { SubmitButton } from "@/components/ui/SubmitButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatBaht } from "@/lib/ui/money";
import { listEmployees, type Ctx } from "./service";
import { listSalaryProfiles, listRuns } from "./payroll";
import {
  approvePayrollRunAction,
  createPayrollRunAction,
  markPaidAction,
  setSalaryProfileAction,
} from "./payroll-actions";

const muted = "text-[color:var(--color-muted)]";

// สถานะรอบจ่าย (ไทย) — ร่าง(เทา) · อนุมัติแล้ว(ดำ) · จ่ายแล้ว(ดำ)
const RUN_STATUS_LABEL: Record<string, string> = {
  DRAFT: "ร่าง",
  APPROVED: "อนุมัติแล้ว",
  PAID: "จ่ายแล้ว",
};
const runTone = (v: string): "muted" | "strong" =>
  v === "DRAFT" ? "muted" : "strong";

// ───────────── PayrollSection (ฝังใน HrContent) ─────────────
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

  const [employees, profiles, runs] = await Promise.all([
    listEmployees(ctx),
    listSalaryProfiles(ctx),
    listRuns(ctx),
  ]);
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
