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
import { listSalaryProfiles, listRuns, listAdjustments, runExclusions, strandedAdjustments, type RunExclusionReason } from "./payroll";
import { payrollItemsDigest } from "./payroll-digest"; // H0.1 ▸ CR16: ลายนิ้วมือแถวพนักงาน คำนวณฝั่ง server ตอนแสดงแถว ◂
import PayAdjustForm from "./PayAdjustForm";
import PayAdjustRowActions from "./PayAdjustRowActions"; // HF-HR-0 ▸ รอบ 5c (F5): ปุ่มของรายการ + เหตุผลที่ถูกปฏิเสธในแถว ◂
import RunRowActions, { CreateRunForm, StrandedMoveButton } from "./RunRowActions"; // H0.1 ▸ R6 · CR12: "อนุมัติ" / "ดึงข้อมูลใหม่" (คำนวณใหม่) / "ลบร่าง" ของรอบร่าง + เหตุผลที่ถูกปฏิเสธในแถว ◂ · H0.2 ▸ ฟอร์มสร้างรอบ + ปุ่มย้ายรายการค้าง ◂
import {
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

// H0.2 ▸ R1: เหตุที่พนักงานไม่อยู่ในรอบของงวด (runExclusions) · R1/R3: flag ของแถว (snapshotJson.flags) ◂
const EXCLUSION_LABEL: Record<RunExclusionReason, string> = {
  ENDED_BEFORE: "ออกจากงานก่อนงวดนี้",
  STARTS_AFTER: "เริ่มงานหลังงวดนี้",
  REMOVED_NO_END_DATE: "ถูกลบออกโดยไม่มีวันสิ้นสุดงาน — ตั้งวันสิ้นสุดงานถ้าต้องจ่ายงวดนี้",
};
const flagsOf = (snapshot: unknown): string[] => {
  const f = (snapshot as { flags?: unknown } | null)?.flags;
  return Array.isArray(f) ? f.map(String) : [];
};
const PARTIAL_MONTH_TEXT = "ต้องตรวจ · เข้า/ออกกลางเดือน — ยังไม่คิดตามสัดส่วน";
const NEGATIVE_NET_TEXT = "ยอดสุทธิติดลบ (รายการหักมากกว่าเงินได้) — อนุมัติไม่ได้ ลบหรือแก้รายการหักแล้วกด “ดึงข้อมูลใหม่”";

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
  // H0.2 ▸ R1: คนที่ไม่อยู่ในรอบร่างแต่ละรอบ (ตัดสินด้วยกติกาเดียวกับตอนสร้าง/คำนวณใหม่) · R2: รายการค้างในงวดที่มีรอบแล้ว ◂
  const draftRunPeriods = runs.filter((r) => r.status === "DRAFT").map((r) => r.periodKey);
  const [exclusionsOfDrafts, stranded] = await Promise.all([
    Promise.all(draftRunPeriods.map(async (periodKey) => ({ periodKey, list: await runExclusions(ctx, periodKey) }))),
    strandedAdjustments(ctx),
  ]);
  const draftRunIds = new Set(runs.filter((r) => r.status === "DRAFT").map((r) => r.id));

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
            รายการที่ยังไม่อนุมัติจะไม่มีผลกับเงินเดือน · งวดที่มีรอบจ่ายแล้วยื่นเพิ่มไม่ได้ (ยื่นเข้างวดถัดไป) ·
            รายการในรอบร่างลบได้ (ระบบคำนวณรอบร่างใหม่ให้) · รอบที่อนุมัติแล้วแก้ไม่ได้ (ใช้กลับรายการรอบจ่ายแทน)
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
                    {/* H0.2 ▸ CR-H0.2-1: รายการในรอบร่างลบได้ด้วย (service ลบ + คำนวณรอบร่างใหม่ในคำสั่งเดียว) ◂ */}
                    {(!a.runId || draftRunIds.has(a.runId)) && <PayAdjustRowActions systemId={systemId} id={a.id} pending={a.status === "PENDING"} />}
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
          // H0.2 ▸ R4: ฟอร์มคืนเหตุผลเมื่อสร้างไม่ได้ (งวด/วันที่จ่ายไม่ถูกต้อง · งวดซ้ำ) ◂
          <CreateRunForm systemId={systemId} />
        )}
      </Section>

      {/* รายการรอบจ่าย */}
      <Section title={`รอบจ่ายเงินเดือน (${runs.length})`}>
        {/* H0.2 ▸ R1: คนที่มีโปรไฟล์เงินเดือนแต่ไม่อยู่ในรอบร่าง (ไม่จ่ายเงียบ ๆ และไม่ตัดเงียบ ๆ) — เฉพาะผู้ดูเงินเดือน (หลังด่านข้างบน) ◂ */}
        {exclusionsOfDrafts
          .filter((x) => x.list.length > 0)
          .map((x) => (
            <div
              key={`ex-${x.periodKey}`}
              role="note"
              data-testid={`hr-payroll-run-${x.periodKey}-exclusions`}
              className="mb-2 rounded-lg border bg-[color:var(--color-surface-2)] px-3 py-2 text-xs"
            >
              <div className="font-medium">
                งวด {x.periodKey}: ไม่รวม {x.list.length} คนในรอบนี้
              </div>
              <ul className={`mt-1 flex flex-col gap-0.5 ${muted}`}>
                {x.list.map((e) => (
                  <li key={e.employeeId}>
                    {e.name} — {EXCLUSION_LABEL[e.reason] ?? e.reason}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        {/* H0.2 ▸ R2: รายการค้าง — งวดของมันมีรอบจ่ายแล้ว (รอบดึงรายการได้ครั้งเดียว) ⇒ ต้องย้ายไปงวดถัดไปจึงจะถูกจ่าย ◂ */}
        {stranded.length > 0 && (
          <div role="note" data-testid="hr-payroll-stranded" className="mb-2 rounded-lg border bg-[color:var(--color-surface-2)] px-3 py-2 text-xs">
            <div className="font-medium">รายการค้าง {stranded.length} รายการ — งวดของรายการมีรอบจ่ายแล้ว จะไม่ถูกจ่ายจนกว่าจะย้ายไปงวดถัดไป</div>
            <div className="mt-1 flex flex-col gap-1">
              {stranded.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className={muted}>
                    {nameByEmp.get(a.employeeId) ?? "—"} · {ADJUST_KIND_LABEL[a.kind] ?? a.kind} {ADJUST_ADD.has(a.kind) ? "+" : "−"}
                    {formatBaht(a.amountSatang)} · งวด {a.periodKey} · {ADJUST_STATUS_LABEL[a.status] ?? a.status}
                  </span>
                  {a.crmCommissionId ? (
                    <span className={muted}>คอมมิชชันจาก CRM — ระบบ CRM ย้ายงวดให้เอง</span>
                  ) : (
                    <StrandedMoveButton systemId={systemId} id={a.id} testId={`hr-payroll-stranded-${a.id}-move`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <DataList
          items={runs.map((r) => ({
            key: r.id,
            primary: (
              <span>
                งวด {r.periodKey} · {formatBaht(r.totalNetSatang)}
              </span>
            ),
            // H0.2 ▸ R1/R3: แถวที่มี flag — NEGATIVE_NET (แดง · อนุมัติไม่ได้) · PARTIAL_MONTH (ต้องตรวจ · ยังไม่คิดตามสัดส่วน) ◂
            secondary: (() => {
              const neg = r.items.filter((it) => flagsOf(it.snapshotJson).includes("NEGATIVE_NET")).length;
              const partial = r.items.filter((it) => flagsOf(it.snapshotJson).includes("PARTIAL_MONTH")).length;
              return (
                <span className="flex flex-col gap-0.5 whitespace-normal">
                  <span>{`${r.items.length} คน · เงินเดือนรวม ${formatBaht(r.totalGrossSatang)} · ปสส. ${formatBaht(r.totalSsoEmployeeSatang)} · ภาษี ${formatBaht(r.totalWhtSatang)}`}</span>
                  {neg > 0 && (
                    <span data-testid={`hr-payroll-run-${r.periodKey}-negative`} className="text-[color:var(--color-danger)]">
                      {neg} คน: {NEGATIVE_NET_TEXT}
                    </span>
                  )}
                  {partial > 0 && (
                    <span data-testid={`hr-payroll-run-${r.periodKey}-partial`}>
                      {partial} คน: {PARTIAL_MONTH_TEXT}
                    </span>
                  )}
                </span>
              );
            })(),
            trailing: (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <StatusChip value={r.status} map={RUN_STATUS_LABEL} tone={runTone(r.status)} />
                {r.status === "DRAFT" && (
                  // H0.1 ▸ CR12: ปุ่มอนุมัติ/ดึงข้อมูลใหม่/ลบร่าง อยู่ใน RunRowActions — ส่งตัวเลขที่เห็นในแถวนี้ (ยอดสุทธิ · จำนวนคน · เงินเดือนรวม)
                  //   ไปเป็นช่องซ่อนของการอนุมัติ ⇒ ถ้ามีการคำนวณใหม่ก่อนกดยืนยัน ระบบไม่อนุมัติ และบอกเหตุผลในแถว ◂
                  <RunRowActions
                    systemId={systemId}
                    runId={r.id}
                    periodKey={r.periodKey}
                    status={r.status}
                    totalNetSatang={r.totalNetSatang}
                    totalGrossSatang={r.totalGrossSatang}
                    itemCount={r.items.length}
                    itemsDigest={payrollItemsDigest(r.items)}
                    approveDetail={`จ่ายสุทธิรวม ${formatBaht(r.totalNetSatang)} · ${r.items.length} คน · เงินเดือนรวม ${formatBaht(r.totalGrossSatang)} · ประกันสังคม ${formatBaht(r.totalSsoEmployeeSatang + r.totalSsoEmployerSatang)} · ภาษีหัก ณ ที่จ่าย ${formatBaht(r.totalWhtSatang)} — จะลงบัญชีอัตโนมัติถ้าเปิดระบบบัญชีไว้`}
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
              {r.items.map((it) => {
                // H0.2 ▸ R3: แถวสุทธิติดลบ = ขอบ/ตัวอักษรแดง + "ติดลบ" · R1: เข้า/ออกกลางเดือน = "ต้องตรวจ" ◂
                const f = flagsOf(it.snapshotJson);
                const neg = f.includes("NEGATIVE_NET");
                return (
                  <Link
                    key={it.id}
                    href={`/app/sys/${systemId}/payroll/${r.id}/slip/${it.employeeId}`}
                    data-testid={neg ? `hr-payroll-item-${it.employeeId}-negative` : undefined}
                    className={`rounded-full border px-3 py-1 text-xs hover:bg-[color:var(--color-surface-2)]${neg ? " border-[color:var(--color-danger)] text-[color:var(--color-danger)]" : ""}`}
                  >
                    {nameByEmp.get(it.employeeId) ?? "พนักงาน"}
                    {neg ? ` · ติดลบ ${formatBaht(it.netSatang)}` : ""}
                    {f.includes("PARTIAL_MONTH") ? " · ต้องตรวจ" : ""}
                  </Link>
                );
              })}
            </div>
          ),
        )}
      </Section>
    </div>
  );
}

export default PayrollSection;
