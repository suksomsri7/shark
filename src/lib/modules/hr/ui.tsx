import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db"; // CRM C3.6 ▸ ลิงก์ "ทีมขาย" โชว์เฉพาะร้านที่มี CRM v2 ◂
import { ModuleTabs } from "@/components/module-tabs";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { StatusChip } from "@/components/ui/StatusChip";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { formatThaiDate } from "@/lib/ui/date";
import {
  listEmployees,
  listRemovedEmployees,
  getSchedule,
  pendingLeaves,
  kioskRoster,
  leaveListScopeOf, // HR H1.1 ◂
  type Ctx,
} from "./service";
import {
  clockAction as clockActionWithResult,
  createEmployeeAction,
  setWorkScheduleAction,
  requestLeaveAction,
  updateEmployeeAction,
  removeEmployeeAction,
  restoreEmployeeAction,
} from "./actions";
import { hasPin } from "./pin"; // HR H0.5 ▸ ไม่อ่านคอลัมน์ PIN เอง (F16.5) ◂
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import BulkLeaveApprovals from "./BulkLeaveApprovals";
import { hrViewerOf, leaveItemsForViewer } from "./privacy"; // HF-HR-0 (D9) ▸ เหตุผลการลาเฉพาะ hr.leave.read ◂
import { hrPageAccessOf } from "./privacy"; // HR PRIV-3 ▸ ตัวเลือกยื่นแทน (leaveOnBehalf) + การ์ด hub = ด่านเดียวกับหน้า ◂
import PinField from "./PinField";
import KioskClock from "./KioskClock";
import { getTranslations } from "next-intl/server"; // HR H2.4 ▸ ข้อความจอ kiosk ◂
import { evaluate } from "@/lib/core/rbac";
// HR H1.1 ▸ R4/R8 ขอบเขตสาขาของผู้ดู (ทะเบียน · ลงเวลา · ใบลา · kiosk · หน้าภาพรวม) ◂
import { hrScopeOf, isAllBranches, unitsForScope } from "./scope";
import { canManageHrSettings } from "./settings"; // HR H1.2 ▸ ลิงก์หน้าตั้งค่า (เฉพาะผู้ตั้งค่าได้) ◂
import { LifecycleDuePanel } from "./lifecycle-ui"; // HR H4.4 ▸ แผง "ต้องจัดการ" ของทะเบียน ◂
// HR H2.7 ▸ Q16: ช่องประเภทการลา/ครึ่งวัน + ยอดคงเหลือบนหน้าใบลาเดิม (หน้าเต็มตามภาพ 05 = H2.10/H2.11) ◂
import { thaiDateKey } from "@/lib/ui/date"; // HR H2.7 ◂
import { activeLeavePolicies, leaveBalances, leaveDetail, myLeaveBalances, type LeaveBalanceItem } from "./leave"; // HR H2.7 ◂
import { leaveDutyHintsMany, type DutyHintItem } from "./availability"; // HR H4.1 ▸ R12 บรรทัด "กระทบ:" บนการ์ดใบลา (ภาพ 05) ◂
import { myOtRequests, otRequestList, type OtViewer } from "./ot"; // HR H2.9 ▸ ส่วนคำขอ OT (ภาพ 05) ◂
import type { OtItem } from "./ot-rules"; // HR H2.9 ◂
import { OtRequestForm, OtRowActions } from "./ot-ui"; // HR H2.9 ◂
import { formatBaht } from "@/lib/ui/money"; // HR H2.9 ◂
import { HrTeamOverviewSection } from "./overview-ui"; // HR H2.11 ▸ ภาพรวมทีม (ภาพ 01) บนหน้า HrHub ◂
import { reportAccessOf } from "./reports"; // HR H3.9 ▸ ลิงก์รายงานเฉพาะผู้ที่เปิดรายงานได้ ◂
import { teamOverviewWithPreview } from "./inbox"; // HR H2.11 ▸ r2: ภาพรวม + ตัวอย่างคำขอจากการอ่านครั้งเดียว ◂
import { HrLaborCard } from "./labor-ui"; // HR H4.2 ▸ การ์ดค่าแรงต่อยอดขาย (ผู้ดูเงินเท่านั้น — การ์ดตัดสินเอง) ◂
export { hrViewerOf } from "./privacy"; // HR H2.11 ▸ ผู้ดูของหน้า /hr/requests (หน้านั้น import ได้เฉพาะ facade + ui) ◂
import { hrNavFilter, type HrNavViewer } from "./nav"; // HR H2.10 ▸ แท็บตามผู้ดู ◂
import { employeeOfUser } from "./service"; // HR H2.10 ◂
import { canRunKiosk } from "./clock-settings"; // HR VIS-5b ▸ บัญชีจอลงเวลาอย่างเดียว = ไม่มีแถบแท็บ ◂
import { canReadRoster } from "./roster-board"; // HR VIS-5b ◂
import { canOpenInbox } from "./inbox"; // HR VIS-5b ◂
import { canViewPayroll } from "@/lib/core/rbac"; // HR VIS-5b ◂
import { hrAccessOf } from "./privacy"; // HR VIS-5b ◂
import { boardFactsOf, kpisOf } from "./hub-rules"; // HR VIS-5b ▸ ตัวเลขของภาพรวมทีม (ฟังก์ชันล้วน) ◂
import { HrDueStrip, HrHubHeader, HrKioskCard, HrMonthCard, HrTodayBoard } from "./hub-ui"; // HR VIS-5b ▸ ส่วนของภาพ 01 ◂
import { employeesOnLeave, type ScheduleRow } from "./service"; // HR VIS-5c ▸ ป้าย "ลาวันนี้" · ตารางงาน ◂
import { loadEmployeeProfileForViewer } from "./privacy"; // HR VIS-5c ▸ แผงอ่านด้านขวา (?emp=) ◂
import { loadLifecycleForViewer } from "./lifecycle"; // HR VIS-5c ◂
import { getLocale } from "next-intl/server"; // HR VIS-5c ◂
import { formatShortDate } from "@/lib/ui/date"; // HR VIS-5c ◂
import { PEOPLE_TABS, departmentsOf, filterPeople, initialOf, pageOf, rowsOfTab, tabCounts, tabOf } from "./people-rules"; // HR VIS-5c ◂
import { EmployeeReadView, ProfileChecklist, ProfileConnections, ProfileHeader, ProfileProbation, ProfileTabs, canEditPeople, dayMonth, profileHref } from "./people-ui"; // HR VIS-5c ◂ · r2: + ProfileProbation · dayMonth ◂

// HR H0.3 ▸ clockAction คืน { ok, reason } (ข้อความปฏิเสธคงที่ สำหรับผู้เรียกที่อ่านผล) — ฟอร์มธรรมดาไม่อ่านค่าที่คืน
//   (ปุ่มถูกซ่อนจากคนที่จะถูกปฏิเสธอยู่แล้ว) ⇒ แคบชนิดให้เข้ากับ <form action> · ตัวฟังก์ชันคือ server action ตัวเดิม ◂
const clockAction = clockActionWithResult as unknown as (formData: FormData) => Promise<void>;

const muted = "text-[color:var(--color-muted)]";

// สถานะการลา (ไทย) — รออนุมัติ(เทา) · อนุมัติแล้ว(ดำ) · ไม่อนุมัติ/ยกเลิก(แดง)
const LEAVE_STATUS_LABEL: Record<string, string> = {
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
  CANCELLED: "ยกเลิกแล้ว",
};
const leaveTone = (v: string): "muted" | "strong" | "danger" =>
  v === "APPROVED" ? "strong" : v === "REJECTED" || v === "CANCELLED" ? "danger" : "muted";

// HR H1.1 ▸ R8 ป้ายสถานะการจ้าง (null = ข้อมูลก่อน backfill ⇒ ไม่แสดงป้าย) ◂
const EMPLOYMENT_STATUS_LABEL: Record<string, string> = { PROBATION: "ทดลองงาน", ACTIVE: "ประจำ", ENDED: "สิ้นสุด" };
const employmentTone = (v: string): "muted" | "strong" | "danger" => (v === "ACTIVE" ? "strong" : v === "ENDED" ? "danger" : "muted");

const LEAVE_TYPE_LABEL: Record<string, string> = {
  SICK: "ลาป่วย",
  PERSONAL: "ลากิจ",
  VACATION: "ลาพักร้อน",
  OTHER: "อื่นๆ",
};

const dateRange = (from: Date, to: Date) =>
  from.getTime() === to.getTime()
    ? formatThaiDate(from)
    : `${formatThaiDate(from)} – ${formatThaiDate(to)}`;

// แท็บฟังก์ชันย่อยของระบบ HR (ใช้ทั้งหน้า hub + ทุกหน้าย่อย ให้ตรงกันเสมอ)
// ⚠️ ต้องตรงกับ childrenFor("HR") ใน src/app/app/layout.tsx (ตรวจโดย qc-nav-functions.mts)
export function hrTabs(systemId: string): { href: string; label: string }[] {
  const s = `/app/sys/${systemId}`;
  return [
    { href: s, label: "ภาพรวม" },
    { href: `${s}/hr/attendance`, label: "ลงเวลา" },
    { href: `${s}/hr/roster`, label: "ตารางกะ" }, // HR H2.2 ▸ บอร์ดตารางกะ ◂
    { href: `${s}/hr/kiosk`, label: "จอลงเวลา" },
    { href: `${s}/hr/leave`, label: "ใบลา" },
    { href: `${s}/hr/requests`, label: "คำขอ" }, // HR H2.11 ▸ กล่องคำขอรวม (หน้ากันสิทธิ์เอง — 404 ถ้าไม่เห็นคำขอชนิดใดเลย) ◂
    { href: `${s}/hr/employees`, label: "พนักงาน" },
    { href: `${s}/hr/payroll`, label: "เงินเดือน" },
    { href: `${s}/hr/settings`, label: "ตั้งค่า" }, // HR H2.2 ▸ หนี้ D9: แท็บตั้งค่าให้ตรง layout.tsx (หน้ากันสิทธิ์เอง) ◂
    { href: `${s}/hr/settings/law`, label: "ตารางกฎหมาย" }, // HR H3.3 r3 ▸ ตรงกับ layout.tsx (อ่านอย่างเดียว · หน้ากันสิทธิ์เอง) ◂
  ];
}

// HR VIS-5b ▸ บัญชีจอลงเวลาอย่างเดียว (มติ 5b-2): เปิดจอลงเวลาได้ แต่ไม่อ่านตารางกะ · ไม่ผูกพนักงาน · ไม่เห็นคำขอ · ไม่ดูเงินเดือน · ไม่เปิดประวัติพนักงาน
//   ⇒ ไม่มีแถบแท็บ (ทั้ง hub และ /hr/kiosk) และหน้า hub มีการ์ดเดียว "เปิดจอลงเวลา" — ด่านของแต่ละหน้าไม่เปลี่ยน (หน้าเดิมยังตัดสินเอง) ◂
export function hrKioskOnly(v: HrNavViewer, linked: boolean): boolean {
  const m = { role: v.role as "OWNER", unitAccess: (Array.isArray(v.unitAccess) ? v.unitAccess : []) as string[], permissions: (v.permissions ?? {}) as Record<string, unknown>, userId: String(v.userId ?? "") };
  return canRunKiosk(m) && !canReadRoster(m) && !linked && !canOpenInbox(m) && !canViewPayroll(m) && !hrAccessOf(m).openProfile;
}

// HR H2.10 ▸ แท็บที่ผู้ดูเปิดได้จริง (หนี้ VIS-1: แท็บที่กดแล้ว 404 ไม่แสดง) + "ของฉัน" เมื่อบัญชีผูกกับพนักงาน — hrTabs ข้างบนคงเดิม (ทะเบียนชุดเดียวกับ layout.tsx)
//   ไม่ส่ง viewer/linked = อ่านจากเซสชันเอง (requireTenant + employeeOfUser) ◂
export async function hrTabsFor(systemId: string, viewer?: HrNavViewer, linked?: boolean): Promise<{ href: string; label: string }[]> {
  let v = viewer;
  let l = linked;
  if (!v || l === undefined) {
    const auth = await requireTenant();
    v ??= { role: auth.active.role, unitAccess: auth.active.unitAccess, permissions: auth.active.permissions, userId: auth.user.id };
    l ??= (await employeeOfUser(auth.active.tenantId, auth.user.id))?.systemId === systemId; // ผูกกับระบบ HR นี้เท่านั้น
  }
  return hrKioskOnly(v, l) ? [] : hrNavFilter(hrTabs(systemId), v, { linked: l }); // HR VIS-5b ▸ บัญชีจอลงเวลาอย่างเดียว = [] ◂
}

// ───────────── ลงเวลา (attendance) ─────────────
// HR H2.5 ▸ หน้าลงเวลาเป็นทีมรายวัน/ปฏิทินรายคนแล้ว (attendance-ui.tsx · ตัดสินผลจาก judge.ts) — ส่วนนี้เหลือแค่รายการ "ลงเวลาแทน"
//   (ปุ่มเข้า/ออกต่อคน) ที่แผง "ลงเวลาแทน" ของหน้า 04A เปิดใช้ · สรุปเดือนเดิม (monthlyAttendance) ไม่แสดงบนหน้านี้อีก ◂
export async function HrAttendanceSection({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  // HR H0.3 ▸ D7a: ปุ่มลงเวลาแทน (ไม่มี PIN) เฉพาะผู้มีสิทธิ์จัดการพนักงาน — ตรงกับด่านใน clockAction · คนอื่นใช้จอ kiosk ◂
  const canClockForOthers = evaluate(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "hr", action: "hr.employee.create" },
  );
  const scope = hrScopeOf(hrViewerOf(auth)); // HR H1.1 ▸ เฉพาะสาขาของผู้ดู (ทุกสาขา = เหมือนเดิม) ◂
  const employees = canClockForOthers ? await listEmployees(ctx, 200, scope) : [];
  return canClockForOthers ? (
    <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
      {employees.length === 0 ? (
        <p className={`text-xs ${muted}`}>เพิ่มพนักงานก่อน แล้วจึงลงเวลาเข้า/ออกได้</p>
      ) : (
        employees.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{e.name}</div>
              {e.position && <div className={`truncate text-xs ${muted}`}>{e.position}</div>}
            </div>
            <div className="flex items-center gap-2">
              <form action={clockAction}>
                <input type="hidden" name="systemId" value={systemId} />
                <input type="hidden" name="employeeId" value={e.id} />
                <input type="hidden" name="kind" value="IN" />
                <SubmitButton variant="primary">เข้างาน</SubmitButton>
              </form>
              <form action={clockAction}>
                <input type="hidden" name="systemId" value={systemId} />
                <input type="hidden" name="employeeId" value={e.id} />
                <input type="hidden" name="kind" value="OUT" />
                <SubmitButton variant="ghost">ออกงาน</SubmitButton>
              </form>
            </div>
          </div>
        ))
      )}
    </div>
  ) : (
    <p className={`text-xs ${muted}`}>ลงเวลาด้วย PIN ที่จอ kiosk</p>
  );
}

// HR H4.1 ▸ R12 (ภาพ 05): "กระทบ: กะเช้า 08:00–16:00 · 19 พ.ย. 69 — ยังมี n คน · ไม่ต้องหาคนแทน" หรือ "— ขาด 1 คน → ระบบเสนอ <คนแรก>" ·
//   VIS-1 E: ชื่อกะ + เวลา + วันที่ · ใช้ทั้งบนการ์ดใบรออนุมัติ (withTitle=false) และส่วน "ผลกระทบต่อกะ" ของใบที่อนุมัติแล้ว ◂
function LeaveImpact({
  card: c,
  ti,
  shiftNameOf,
  withTitle,
}: {
  card: { id: string; title: string; items: DutyHintItem[]; incomplete: boolean };
  ti: Awaited<ReturnType<typeof getTranslations>>;
  shiftNameOf: Map<string, string>;
  withTitle: boolean;
}) {
  return (
    <div className={withTitle ? "rounded-xl border border-[color:var(--color-line)] p-3" : "mt-1 border-t border-[color:var(--color-line)] pt-1"} data-testid="hr-leave-impact">
      {withTitle && <p className="text-sm font-medium">{c.title}</p>}
      {c.incomplete && <p className={`text-xs ${muted}`}>{ti("incomplete")}</p>}
      <ul className="mt-1 flex flex-col gap-1">
        {c.items.map((it) => {
          const when = { shift: shiftNameOf.get(it.entryId) ?? ti("shiftFallback"), date: formatThaiDate(new Date(`${it.date}T00:00:00Z`)), time: `${hhmm(it.startMin)}–${hhmm(it.endMin)}` };
          const first = it.candidates[0];
          return (
            <li key={it.entryId} className={`whitespace-normal break-words text-sm ${it.others > 0 ? muted : "text-[color:var(--color-accent)]"}`}>
              {it.others > 0 && c.incomplete ? (
                ti("checkManually", when)
              ) : it.others > 0 ? (
                ti("covered", { ...when, n: it.others })
              ) : (
                <>
                  {ti("uncovered", when)}{" "}
                  {first ? (
                    <b data-testid={`hr-leave-impact-candidate-${first.employeeId}`}>{ti("candidate", { name: first.name, from: hoursOf(first.weekMin), to: hoursOf(first.weekMinAfter) })}</b>
                  ) : (
                    ti("noCandidate")
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ───────────── ใบลา (leave) ─────────────
export async function HrLeaveSection({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };

  // HF-HR-0 (D9): เหตุผลการลา (ลาป่วย = ข้อมูลสุขภาพ) ไปถึงหน้าจอเฉพาะผู้มี hr.leave.read — ตัดสินที่ privacy.ts
  // HR PRIV-3 ▸ R3: รายชื่อ "พนักงาน" (ชื่อคนอื่น) อ่านเฉพาะผู้ยื่นแทนได้ (leaveOnBehalf — ค่าเดียวกับ requestLeaveAction) ·
  //   คนอื่น = ฟอร์มของตัวเองไม่มีช่องเลือก เมื่อบัญชีผูกกับพนักงานของระบบนี้ (action ยื่นให้แถวที่ผูกอยู่แล้ว) · ไม่ผูก = ไม่มีฟอร์ม ◂
  const { leaveOnBehalf } = hrPageAccessOf(hrViewerOf(auth));
  const [employees, { pending, history: leaves }] = await Promise.all([
    leaveOnBehalf ? listEmployees(ctx, 200, hrScopeOf(hrViewerOf(auth))) : [], // HR H1.1 ▸ ตัวเลือก "ยื่นแทน" = เฉพาะสาขาของผู้ดู ◂ · HR PRIV-3 ◂
    leaveItemsForViewer(ctx, hrViewerOf(auth)),
  ]);
  const showLeaveForm = leaveOnBehalf ? employees.length > 0 : (await employeeOfUser(auth.active.tenantId, auth.user.id))?.systemId === systemId; // HR PRIV-3 ◂
  // HR H2.7 ▸ Q16: ประเภทการลาที่เปิดอยู่ (ชื่อ/หมวด) · ยอดของตัวเอง (employeeOfUser) · ใบรอ: จำนวนวัน + คงเหลือ (ผ่านด่านผู้อ่านของ leave.ts — ไม่มีเหตุผลการลา)
  const viewer = hrViewerOf(auth);
  const today = thaiDateKey(new Date());
  const tl = await getTranslations("hr.leave");
  const [policies, mine] = await Promise.all([activeLeavePolicies(ctx), myLeaveBalances(ctx, viewer, { at: today })]);
  const myItems: LeaveBalanceItem[] = mine.ok ? mine.items : [];
  const pendingMeta = new Map<string, string>();
  for (const it of pending) {
    const d = await leaveDetail(ctx, viewer, it.id);
    if (!d.ok) continue;
    const parts = [d.item.days ? tl("days", { n: d.item.days }) : "", d.item.policyName ?? ""];
    if (d.item.policyId) {
      const b = await leaveBalances(ctx, viewer, { employeeId: d.item.employeeId, at: d.item.fromDate });
      const row = b.ok ? b.items.find((x) => x.policyId === d.item.policyId) : undefined;
      if (row) parts.push(row.unlimited ? tl("unlimited") : `${tl("left", { n: row.balance })} (${tl("pendingPlus", { n: row.pending })})`);
    }
    if (d.item.needsAttachment && !d.item.hasAttachment) parts.push(tl("needsAttachment"));
    pendingMeta.set(it.id, parts.filter(Boolean).join(" · "));
  }
  const anyHours = policies.some((p) => p.allowHours);
  const attachNote = policies.some((p) => p.attachmentAfterDays !== null);
  // ◂ HR H2.7
  // HR H4.1 ▸ R12: ผลกระทบต่อกะของใบรอ + ใบอนุมัติที่ยังไม่จบ — เฉพาะผู้ดูคำใบ้ (R11 · คนอื่นได้ ok:false ⇒ ไม่แสดง) · ไม่มีเหตุผล/ประเภทการลา
  const ti = await getTranslations("hr.leaveImpact");
  //   r2: ทุกใบในหน้า = อ่านครั้งเดียว (leaveDutyHintsMany) · อ่านไม่ครบ ⇒ ไม่สรุปว่า "ไม่ต้องหาคนแทน"
  const impactCards: { id: string; title: string; items: DutyHintItem[]; incomplete: boolean }[] = [];
  const impactLeaves = [...new Map([...pending, ...leaves.filter((x) => x.status === "APPROVED" && thaiDateKey(x.toDate) >= today)].map((l) => [l.id, l])).values()].slice(0, 60);
  const hints = await leaveDutyHintsMany(ctx, viewer, { leaveIds: impactLeaves.map((l) => l.id) });
  for (const l of impactLeaves) {
    const h = hints.get(l.id);
    if (h?.ok && h.items.length) impactCards.push({ id: l.id, title: `${l.employeeName} · ${dateRange(l.fromDate, l.toDate)}`, items: h.items, incomplete: h.incomplete === true });
  }
  // VIS-1 E ▸ ชื่อกะของแต่ละบรรทัด — อ่านเฉพาะกะที่คำใบ้ส่งมาแล้ว (ผ่านด่านผู้ดูคำใบ้ของ availability.ts) · ชื่อกะอย่างเดียว ◂
  const impactEntryIds = [...new Set(impactCards.flatMap((c) => c.items.map((it) => it.entryId)))];
  const shiftNameOf = new Map(
    impactEntryIds.length
      ? (await tenantDb(ctx).hrRosterEntry.findMany({ where: { id: { in: impactEntryIds } }, select: { id: true, shift: { select: { name: true } } }, take: 500 })).map((r) => [r.id, r.shift.name])
      : [],
  );
  const impactOf = (c: (typeof impactCards)[number]) => <LeaveImpact key={c.id} card={c} ti={ti} shiftNameOf={shiftNameOf} withTitle={false} />;
  const pendingImpact = new Map(impactCards.filter((c) => pending.some((p) => p.id === c.id)).map((c) => [c.id, c]));
  const otherImpact = impactCards.filter((c) => !pendingImpact.has(c.id));
  // ◂ HR H4.1

  return (
    <div className="flex flex-col gap-6">
      {/* ใบลารออนุมัติ — เลือกหลายใบอนุมัติ/ปฏิเสธพร้อมกันได้ */}
      <Section title={`ใบลารออนุมัติ (${pending.length})`}>
        {pending.length === 0 ? (
          <p className={`text-sm ${muted}`}>ไม่มีใบลารออนุมัติ — คำขอลาของพนักงานจะมาแสดงที่นี่</p>
        ) : (
          <BulkLeaveApprovals
            systemId={systemId}
            items={pending.map((it) => ({
              id: it.id,
              label: `${it.employeeName} · ${LEAVE_TYPE_LABEL[it.type] ?? it.type}`,
              meta: [dateRange(it.fromDate, it.toDate), pendingMeta.get(it.id) /* HR H2.7 ◂ */, it.reason].filter(Boolean).join(" · "),
              // VIS-1 E ▸ บรรทัดผลกระทบอยู่บนการ์ดใบลาของตัวเอง ◂
              ...(pendingImpact.has(it.id) ? { extra: impactOf(pendingImpact.get(it.id)!) } : {}),
            }))}
          />
        )}
        {/* ยื่นใบลา */}
        {showLeaveForm && ( // HR PRIV-3 ◂
          <form action={requestLeaveAction} className="mt-1 flex flex-wrap items-end gap-2">
            <input type="hidden" name="systemId" value={systemId} />
            {leaveOnBehalf && ( // HR PRIV-3 ▸ ช่องเลือกพนักงานเฉพาะผู้ยื่นแทนได้ ◂
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              พนักงาน
              <select name="employeeId" required className="input" defaultValue="">
                <option value="" disabled>
                  เลือกพนักงาน
                </option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            )}{/* HR PRIV-3 ◂ */}
            {/* HR H2.7 ▸ ประเภทการลา · ครึ่งวัน · ชั่วโมง (เฉพาะเมื่อมีประเภทที่เปิด — ร้านยังเปิดเองไม่ได้) ·
                VIS-1 D3: ช่องประเภทเหลือช่องเดียว — มีประเภทการลาที่เปิด = เลือกประเภท (หมวดตามประเภท · requestLeaveAction) · ไม่มี = หมวดเดิม */}
            {policies.length > 0 ? (
              <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                {tl("policy")}
                <select name="policyId" required className="input min-h-[44px]" defaultValue="" data-testid="hr-leave-policy">
                  <option value="" disabled>
                    {tl("policyChoose")}
                  </option>
                  {policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                {tl("policy")}
                <select name="type" className="input min-h-[44px]" defaultValue="PERSONAL">
                  {Object.entries(LEAVE_TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              {tl("halfDay")}
              <select name="halfDay" className="input min-h-[44px]" defaultValue="" data-testid="hr-leave-halfday">
                <option value="">{tl("fullDay")}</option>
                <option value="AM">{tl("am")}</option>
                <option value="PM">{tl("pm")}</option>
              </select>
            </label>
            {anyHours && (
              <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                {tl("hours")}
                <input name="hours" type="number" min={1} max={7} step={1} className="input min-h-[44px] w-24" data-testid="hr-leave-hours" />
              </label>
            )}
            {/* ◂ HR H2.7 */}
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              ตั้งแต่วันที่
              <input name="fromDate" type="date" required className="input" />
            </label>
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              ถึงวันที่
              <input name="toDate" type="date" required className="input" />
            </label>
            <label className={`flex flex-1 flex-col gap-1 text-xs ${muted}`}>
              เหตุผล
              <input name="reason" placeholder="เช่น พาลูกไปหาหมอ" className="input min-w-0" />
            </label>
            <SubmitButton variant="ghost">+ ยื่นใบลา</SubmitButton>
          </form>
        )}
        {/* HR H2.7 ▸ Q10: ธงเอกสารประกอบ (ยังไม่มีช่องอัปโหลด — D-H27-attach) ◂ */}
        {showLeaveForm && attachNote && ( // HR PRIV-3 ▸ ธงเอกสารอยู่คู่ฟอร์ม ◂
          <p role="note" className={`text-xs ${muted}`} data-testid="hr-leave-attach">
            {tl("attachNote")}
          </p>
        )}
      </Section>

      {/* HR H4.1 ▸ R12 (ภาพ 05): "กระทบ: กะ … — ยังมี n คน · ไม่ต้องหาคนแทน" หรือ "— ขาด 1 คน → ระบบเสนอ <คนแรก>" */}
      {otherImpact.length > 0 && (
        <Section title={ti("title")}>
          <div className="flex flex-col gap-3">
            {otherImpact.map((c) => (
              <LeaveImpact key={c.id} card={c} ti={ti} shiftNameOf={shiftNameOf} withTitle />
            ))}
          </div>
        </Section>
      )}
      {/* ◂ HR H4.1 */}

      {/* HR H2.7 ▸ Q16: ยอดวันลาของตัวเอง (สิทธิ์ · ใช้ไป · คงเหลือ +n รออนุมัติ) */}
      {myItems.length > 0 && (
        <Section title={tl("myBalance")}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="hr-leave-balance">
              <thead>
                <tr className={`text-left text-xs ${muted}`}>
                  <th className="py-1 pr-2 font-normal">{tl("colType")}</th>
                  <th className="py-1 pr-2 text-right font-normal">{tl("colEntitled")}</th>
                  <th className="py-1 pr-2 text-right font-normal">{tl("colUsed")}</th>
                  <th className="py-1 text-right font-normal">{tl("colLeft")}</th>
                </tr>
              </thead>
              <tbody>
                {myItems.map((b) => (
                  <tr key={b.policyId} className="border-t" data-testid={`hr-leave-balance-${b.policyId}`}>
                    <td className="py-2 pr-2">{b.name}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{b.unlimited ? tl("unlimited") : (Number(b.granted) + Number(b.carried)).toFixed(1)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{b.used}</td>
                    <td className="py-2 text-right tabular-nums">
                      {b.unlimited ? "—" : b.available}
                      {Number(b.pending) > 0 && <span className={`ml-1 text-xs ${muted}`}>{tl("pendingPlus", { n: b.pending })}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
      {/* ◂ HR H2.7 */}

      {/* ประวัติการลา */}
      <Section title="ประวัติการลา">
        <DataList
          items={leaves.map((l) => ({
            key: l.id,
            primary: `${l.employeeName} · ${LEAVE_TYPE_LABEL[l.type] ?? l.type}`,
            secondary: [dateRange(l.fromDate, l.toDate), l.unpaidDays ? `ได้ค่าจ้าง ${l.paidDays ?? 0} วัน · ไม่ได้ค่าจ้าง ${l.unpaidDays} วัน` : null, l.filedBy].filter(Boolean).join(" · "), // HR H0.7 ▸ "ยื่นโดย" เฉพาะผู้จัดการ/HR (privacy.ts) ◂ // HR PREPROD-1 ▸ R3: ลาป่วยเกินวันที่เหลือ — ส่วนได้/ไม่ได้ค่าจ้าง ◂
            trailing: (
              <StatusChip value={l.status} map={LEAVE_STATUS_LABEL} tone={leaveTone(l.status)} />
            ),
          }))}
          empty="ยังไม่มีประวัติการลา"
        />
      </Section>
    </div>
  );
}

// ───────────── พนักงาน (employees) ─────────────
// ลำดับแสดง จันทร์→อาทิตย์ (weekday DB 0=อาทิตย์) + ชื่อวันสั้น
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
// HR VIS-5c ▸ ชื่อวันย้ายไป hr.people.sched.d0–d6 (สองภาษา) ◂
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const hoursOf = (m: number) => (m % 60 === 0 ? String(m / 60) : (m / 60).toFixed(1)); // HR H4.1 ▸ ชั่วโมงสัปดาห์ (นาที → ชม.) ◂

// HR VIS-5c ▸ ทะเบียนพนักงาน (ภาพ 02): หัว (ชื่อ · จำนวนต่อสาขา · + พนักงาน) → แท็บสถานะ → ค้น/สาขา/แผนก/แสดงที่สิ้นสุด → ตาราง 20 คนต่อหน้า → ต้องจัดการ ·
//   ?emp= = แผงอ่านด้านขวา (≥ 1280 · เลขอ่อนไหวปิดแล้ว · ไม่มีปุ่มแก้) · ?add=1 = เปิดแผงเพิ่มพนักงาน · ปุ่มแก้ทุกตัว (เพิ่ม · ⋯ · กู้คืน) เฉพาะผู้ถือ hr.employee.create ·
//   ข้อมูล = ตัวอ่านเดิม (listEmployees/listRemovedEmployees ตามขอบเขตสาขา) · ลาวันนี้ = employeesOnLeave(วันไทยวันนี้ ณ เที่ยงคืน UTC) · action เดิมผูกตรง ·
//   r2: แถวเตี้ย (≥ 8 แถวในจอแรกที่ 1440) · ป้าย/ชื่อ/ตำแหน่ง/สาขาบรรทัดเดียว (ยาวเกิน = … + title) · ข้างแผงซ่อนคอลัมน์ที่เกิน · แผง = ลิ้นชักเต็มสูงชิดขวา ·
//   ประเภทจ้างบรรทัดสอง = รูปแบบค่าจ้าง เฉพาะผู้ผ่านด่าน loadEmployeeProfileForViewer (ผู้ดูเงินเดือนในขอบเขตค่าจ้าง · ไม่มียอดเงิน) ◂
export type PeopleQuery = { q?: string; tab?: string; dept?: string; ended?: string; page?: string; emp?: string; add?: string };
export async function HrEmployeesSection({ systemId, unit, query = {} }: { systemId: string; unit?: string; query?: PeopleQuery }) {
  const auth = await requireTenant();
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  const viewer = hrViewerOf(auth); // HR VIS-5c ◂
  const scope = hrScopeOf(viewer);
  const allBranches = isAllBranches(scope);
  const canEdit = canEditPeople(viewer); // HR VIS-5c ◂
  const t = await getTranslations("hr.people");
  const locale = await getLocale();

  const [inScope, removed, units] = await Promise.all([
    listEmployees(ctx, 200, scope),
    listRemovedEmployees(ctx, 200, scope),
    unitsForScope(auth.active.tenantId, scope),
  ]);
  const unitName = new Map(units.map((u) => [u.id, u.name]));
  const showBranches = allBranches && units.length >= 2;
  const chip = showBranches && unit ? unit : "";
  const byUnit = <R extends { unitId: string | null }>(rows: R[]) => (chip ? rows.filter((e) => (chip === "none" ? !e.unitId : e.unitId === chip)) : rows); // HR VIS-5c ◂
  const q = String(query.q ?? "").trim().slice(0, 80);
  const depts = departmentsOf([...inScope, ...removed]);
  const dept = depts.includes(String(query.dept ?? "")) ? String(query.dept) : "";
  const showEnded = query.ended === "1";
  const tab = tabOf(query.tab);
  const active = filterPeople(byUnit(inScope), q, dept);
  const ended = filterPeople(byUnit(removed), q, dept);
  const counts = tabCounts(active, ended, showEnded);
  const tabRows = rowsOfTab(tab, active, ended, showEnded);
  const pg = pageOf(tabRows, query.page);
  const unassigned = inScope.filter((e) => !e.unitId).length;
  const today = thaiDateKey(new Date()); // HR VIS-5c ◂
  const onLeave = await employeesOnLeave(ctx, pg.rows.filter((x) => !x.ended).map((x) => x.row.id), new Date(`${today}T00:00:00Z`));
  const schedules = canEdit ? await Promise.all(pg.rows.map((x) => (x.ended ? null : getSchedule(ctx, x.row.id)))) : [];
  // r2 (ruling 1): รูปแบบค่าจ้างต่อแถว = ตัวอ่านที่มีด่านอยู่แล้ว (payType อยู่ใน DTO เฉพาะผู้ดูเงินเดือนในขอบเขตค่าจ้าง) · ผู้ไม่มีสิทธิ์เงินเดือนไม่เรียกเลย
  const payTypeOf = new Map<string, string>(
    canViewPayroll(viewer)
      ? (await Promise.all(pg.rows.map(async (x) => [x.row.id, (await loadEmployeeProfileForViewer(ctx, viewer, x.row.id))?.profile.payType ?? ""] as const))).filter(([, v]) => !!v)
      : [],
  );
  const pv = query.emp ? await loadEmployeeProfileForViewer(ctx, viewer, String(query.emp)) : null;
  const pvLife = pv ? await loadLifecycleForViewer(ctx, viewer, pv.profile.id) : null;

  const base = `/app/sys/${systemId}/hr/employees`;
  const cur: Record<string, string> = { unit: chip, q, dept, ended: showEnded ? "1" : "", tab: tab === "all" ? "" : tab, page: pg.page > 1 ? String(pg.page) : "", emp: pv ? pv.profile.id : "" };
  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...cur, ...over })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  const perUnit = units.map((u) => ({ name: u.name, n: inScope.filter((e) => e.unitId === u.id).length })).filter((x) => x.n > 0);
  const summary = [units.length >= 2 ? t("branches", { n: units.length }) : null, ...(units.length >= 2 ? perUnit.map((x) => t("unitPeople", { name: x.name, n: x.n })) : [t("people", { n: inScope.length })])].filter(Boolean).join(" · ");
  const unitLabel = chip === "none" ? t("noUnit") : chip ? (unitName.get(chip) ?? t("otherUnit")) : t("allBranches");
  const unitOf = (id: string | null) => (id ? (unitName.get(id) ?? t("otherUnit")) : t("noUnit"));
  // r2 (B11): บรรทัดท้ายตาราง "แสดง N คน · <สาขา> n · <สาขา> n (· สิ้นสุด n)" — นับจากแถวของแท็บนี้ทุกหน้า (คนทำงานตามสาขาประจำ)
  const tabActive = tabRows.filter((x) => !x.ended).map((x) => x.row);
  const footUnits = units.length >= 2 ? [...new Set(tabActive.map((e) => e.unitId))].map((id) => ({ id, n: tabActive.filter((e) => e.unitId === id).length })).sort((a, b) => b.n - a.n) : [];
  const footEnded = tabRows.filter((x) => x.ended).length;
  const footer = [pg.pages > 1 ? t("shown", { from: pg.from, to: pg.to, total: counts[tab] }) : t("summary.shown", { n: counts[tab] }), ...footUnits.map((x) => t("summary.unit", { name: unitOf(x.id), n: x.n })), ...(footEnded ? [t("summary.ended", { n: footEnded })] : [])].join(" · ");
  // คอลัมน์ตามความกว้าง: ไม่มีแผง = 9 คอลัมน์ที่ ≥ 1280 · 1024 = 6 (ประเภทจ้างพับเข้าบรรทัดรหัส · บัญชีพับใต้ PIN · เริ่มงานเฉพาะ ≥ 1280 — 7 คอลัมน์ล้นจอ 1024) · < 768 = การ์ด ·
  //   แผงเปิด (≥ 1280) = ชื่อ · ตำแหน่ง · สถานะ (+ สาขา ที่ ≥ 1360) — ข้อยกเว้นที่ประกาศไว้: ข้างแผงคอลัมน์น้อยกว่า 9 (เมนูข้าง 288 px ของแอปกว้างกว่ารางในภาพ)
  const col = pv
    ? { unit: "hidden md:table-cell xl:max-[1359px]:hidden", type: "hidden", start: "hidden", pin: "hidden lg:table-cell xl:hidden", acct: "hidden", typeFold: "", acctFold: "", name: "md:max-w-[11rem] xl:max-[1359px]:max-w-[9rem]", pos: "max-w-[9rem] xl:max-[1359px]:max-w-[7rem]" }
    : { unit: "hidden md:table-cell", type: "hidden xl:table-cell", start: "hidden xl:table-cell", pin: "hidden lg:table-cell", acct: "hidden xl:table-cell", typeFold: "xl:hidden", acctFold: "xl:hidden", name: "md:max-w-[10rem] xl:max-w-[11rem]", pos: "max-w-[8rem] xl:max-w-[9rem]" };
  const th = `px-2 py-2.5 text-left align-bottom text-xs font-semibold ${muted}`; // HR VIS-5c ◂ (หัวคอลัมน์ขึ้นบรรทัดได้ที่ช่องว่าง)
  const td = "md:table-cell md:whitespace-nowrap md:px-2 md:py-2 md:align-middle"; // HR VIS-5c ◂
  const one = "block truncate"; // ข้อความบรรทัดเดียว ยาวเกิน = …
  const chipCls = "inline-flex min-h-[26px] items-center whitespace-nowrap rounded-lg border px-2 py-0.5 text-xs font-semibold"; // HR VIS-5c ◂
  const typeOf = (v: string | null) => (v && ["FULL_TIME", "PART_TIME", "CONTRACT", "DAILY", "PROBATION"].includes(v) ? t(`type.${v as "FULL_TIME"}`) : t("type.none"));
  const payOf = (id: string) => { const v = payTypeOf.get(id); return v && ["MONTHLY", "DAILY", "HOURLY"].includes(v) ? t(`pay.${v as "MONTHLY"}`) : ""; };
  const dd = "absolute left-0 z-30 mt-2 flex max-h-[60vh] w-64 max-w-[85vw] flex-col overflow-y-auto rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-1 shadow-lg";
  const ddItem = (on: boolean) => `flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-[color:var(--color-surface-2)] ${on ? "font-semibold" : ""}`;
  const pill = "btn btn-ghost min-h-[44px] max-w-full cursor-pointer list-none whitespace-nowrap text-sm [&::-webkit-details-marker]:hidden";

  return (
    <div /* HR VIS-5c */ className={pv ? "xl:-mb-10 xl:-mr-6 xl:grid xl:grid-cols-[minmax(0,1fr)_400px] xl:max-[1359px]:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_440px]" : ""}>
      <div className={`flex min-w-0 flex-col gap-3 ${pv ? "xl:pb-10 xl:pr-6" : ""}`}>
        {/* หัว: ชื่อหน้า · จำนวนต่อสาขา — ทะเบียนลูกจ้างตามกฎหมาย · + พนักงาน (ไม่มีนำเข้า CSV — owner list) */}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold">{t("title")}</h2>
            <p className={`mt-1 text-[13px] ${muted}`}>
              {summary}
              {summary ? " — " : ""}
              {t("lawTail")}
            </p>
          </div>
          {canEdit && ( // HR VIS-5c ◂
            <details open={query.add === "1"} className="relative shrink-0">
              <summary data-testid="hr-people-add" className="btn btn-primary min-h-[44px] cursor-pointer list-none whitespace-nowrap text-sm [&::-webkit-details-marker]:hidden">
                {t("add")}
              </summary>
              <div className="absolute right-0 top-full z-30 mt-2 w-[min(calc(100vw-2rem),560px)] rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4 shadow-lg">
                <h3 className="mb-3 text-base font-bold">{t("addPanel.title")}</h3>
                <form action={createEmployeeAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input type="hidden" name="systemId" value={systemId} />
                  <label className={`flex min-w-0 flex-col gap-1 text-xs ${muted} sm:col-span-2`}>
                    {t("addPanel.name")}
                    <input name="name" required data-testid="hr-people-add-name" placeholder={t("addPanel.namePh")} className="input min-h-11 sm:min-w-[16rem]" />
                  </label>
                  {/* HR H1.1 ▸ สาขาประจำ — ผู้ดูที่จำกัดสาขาเลือกได้เฉพาะสาขาตัวเอง (บังคับ) · ทุกสาขา = ไม่ระบุได้ · action ตรวจซ้ำ ◂ */}
                  {(units.length > 0 || !allBranches) && (
                    <label className={`flex min-w-0 flex-col gap-1 text-xs ${muted}`}>
                      {t("addPanel.unit")}
                      <select name="unitId" data-testid="hr-register-create-unit" required={!allBranches} defaultValue={allBranches ? "" : (units[0]?.id ?? "")} className="input min-h-11">
                        {allBranches && <option value="">{t("noUnit")}</option>}
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className={`flex min-w-0 flex-col gap-1 text-xs ${muted}`}>{/* HR VIS-5c */}
                    {t("addPanel.position")}
                    <input name="position" data-testid="hr-people-add-position" placeholder={t("addPanel.positionPh")} className="input min-h-11" />
                  </label>
                  <label className={`flex min-w-0 flex-col gap-1 text-xs ${muted}`}>
                    {t("addPanel.phone")}
                    <input name="phone" inputMode="tel" data-testid="hr-people-add-phone" placeholder={t("addPanel.phonePh")} className="input min-h-11" />
                  </label>
                  <p className={`text-xs ${muted} sm:col-span-2`}>{t("addPanel.hint")}</p>
                  <div className="sm:col-span-2">
                    <SubmitButton pendingText={t("form.saving")} className="min-h-[44px]" data-testid="hr-people-add-submit">{t("addPanel.submit")}</SubmitButton>
                  </div>
                </form>{/* HR VIS-5c */}
              </div>
            </details>
          )}
        </div>{/* HR VIS-5c ◂ */}

        {/* แท็บสถานะ + จำนวน (สิ้นสุด = คนที่ลบ/สิ้นสุดแล้วเท่านั้น) */}
        <nav aria-label={t("tab.label")} data-scroll="x" className="-mx-1 flex gap-1 overflow-x-auto border-b border-[color:var(--color-line)]">
          {PEOPLE_TABS.map((k) => (
            <Link
              key={k /* HR VIS-5c */}
              href={href({ tab: k === "all" ? "" : k, page: "" })}
              data-testid={`hr-people-tab-${k}`}
              aria-current={tab === k ? "page" : undefined}
              className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-sm ${tab === k ? "border-b-2 border-[color:var(--color-ink)] font-bold text-[color:var(--color-ink)]" : muted}`}
            >
              {t(`tab.${k}`) /* HR VIS-5c */}
              <span className={`text-xs ${tab === k ? "" : muted}`}>{counts[k]}</span>
            </Link>
          ))}
        </nav>

        {/* ตัวกรองตามภาพ: ค้น · สาขา · แผนก · แสดงที่สิ้นสุด — ค้นด้วย Enter (ปุ่มส่งเป็น sr-only) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">{/* HR VIS-5c */}
          <form method="get" action={base} role="search" className="flex min-w-[10rem] flex-[1_1_12rem]">
            {chip && <input type="hidden" name="unit" value={chip} />}
            {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
            {dept && <input type="hidden" name="dept" value={dept} />}
            {showEnded && <input type="hidden" name="ended" value="1" />}
            <label className="relative flex min-w-0 flex-1 items-center">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`pointer-events-none absolute left-3 ${muted}`}>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input type="search" name="q" data-testid="hr-people-search" defaultValue={q} placeholder={t("search")} aria-label={t("search")} className="input min-h-11 w-full pl-9" />
            </label>
            <button type="submit" data-testid="hr-people-search-go" className="sr-only">
              {t("searchGo")}
            </button>
          </form>
          {/* HR H1.1 ▸ R8 ตัวกรองสาขา (ผู้ดูทุกสาขา · ร้าน ≥ 2 สาขา) — ผู้ดูที่จำกัดสาขาเห็นเฉพาะสาขาตัวเอง (+ คนที่ยืมตัวเข้ามา) ◂ */}
          {showBranches && (
            <details data-testid="hr-register-branch-filter" className="relative min-w-0">
              <summary data-testid="hr-people-branch" className={pill}>
                <span className={muted}>{t("branch")}:</span> <b className="inline-block max-w-[10rem] truncate align-bottom">{unitLabel}</b> <span aria-hidden="true">▾</span>
              </summary>
              <div className={dd}>
                {[{ key: "", label: t("allBranches") }, ...units.map((u) => ({ key: u.id, label: u.name })), ...(unassigned ? [{ key: "none", label: t("noUnit") }] : [])].map((c) => (
                  <Link key={c.key || "all"} href={href({ unit: c.key, page: "" })} data-testid={`hr-register-branch-chip-${c.key || "all"}`} aria-current={chip === c.key ? "page" : undefined} className={ddItem(chip === c.key)}>
                    {c.label}
                  </Link>
                ))}
              </div>{/* HR VIS-5c */}
            </details>
          )}
          {depts.length > 0 && (
            <details className="relative min-w-0">{/* HR VIS-5c */}
              <summary data-testid="hr-people-dept" className={pill}>
                {t("dept")}
                {dept ? (
                  <>
                    <span className={muted}>:</span> <b className="inline-block max-w-[8rem] truncate align-bottom">{dept}</b>
                  </>
                ) : null}{" "}
                <span aria-hidden="true">▾</span>
              </summary>
              <div className={dd}>
                {[{ key: "", label: t("allDepts") }, ...depts.map((d) => ({ key: d, label: d }))].map((c, i) => (
                  <Link key={c.key || "all"} href={href({ dept: c.key, page: "" })} data-testid={`hr-people-dept-opt-${c.key ? i : "all"}`} aria-current={dept === c.key ? "page" : undefined} className={ddItem(dept === c.key)}>
                    {c.label}
                  </Link>
                )) /* HR VIS-5c */}
              </div>
            </details>
          )}
          <Link href={href({ ended: showEnded ? "" : "1", page: "" })} data-testid="hr-people-ended" aria-pressed={showEnded} className="ml-auto inline-flex min-h-[44px] items-center gap-2.5 whitespace-nowrap text-sm text-[color:var(--color-ink-soft)]">
            <span aria-hidden="true" className={`relative inline-block h-6 w-10 rounded-full border transition-colors ${showEnded ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)]" : "border-[color:var(--color-line)] bg-[color:var(--color-surface-2)]"}`}>
              <span className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-[color:var(--color-surface)] shadow ${showEnded ? "left-[18px]" : "left-0.5"}`} />
            </span>
            {t("showEnded")}
          </Link>
        </div>{/* HR VIS-5c */}

        {showBranches && unassigned > 0 && (
          <p data-testid="hr-register-unit-prompt" role="note" className={`text-xs ${muted}`}>{/* HR VIS-5c */}
            {t("unitPrompt", { n: unassigned })}
          </p>
        )}

        {/* ตาราง (≥ md) · การ์ดแถวเดียว (< md) — markup ชุดเดียว แถวละ 1 คน */}
        <div className="rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)]">
          {pg.rows.length === 0 ? (
            <p className={`px-4 py-6 text-sm ${muted}`}>{inScope.length + removed.length === 0 ? t("empty") : t("noMatch")}</p>
          ) : (
            <table data-testid="hr-people-table" className="block w-full text-sm md:table">
              <thead className="hidden md:table-header-group">
                <tr className="border-b border-[color:var(--color-line)]">
                  <th className={`${th} pl-4`}>{t("col.name")}</th>
                  <th className={th}>{t("col.position")}</th>
                  <th className={`${th} ${col.unit}`}>{t("col.unit")}</th>
                  <th className={`${th} ${col.type}`}>{t("col.type")}</th>
                  <th className={`${th} ${col.start}`}>{t("col.start")}</th>
                  <th className={th}>{t("col.status")}</th>
                  <th className={`${th} ${col.pin}`}>{t("col.pin")}</th>
                  <th className={`${th} ${col.acct}`}>{t("col.account")}</th>
                  <th className={`${th} w-12`}>
                    <span className="sr-only">{t("col.more")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="block md:table-row-group">
                {await Promise.all(
                  pg.rows.map(async ({ row: e, ended: isEnded }, i) => {
                    const sch = schedules[i] ?? null;
                    const leaveToday = !isEnded && onLeave.has(e.id);
                    const probEnd = e.probationEndAt ? e.probationEndAt.toISOString().slice(0, 10) : "";
                    const left = probEnd ? Math.round((Date.parse(`${probEnd}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) : -1;
                    const status = isEnded
                      ? { text: e.employmentStatus === "ENDED" ? (e.endDate ? t("status.endedOn", { date: dayMonth(e.endDate, locale) }) : t("status.ended")) : t("status.removed"), cls: `${chipCls} border-[color:var(--color-line)] font-normal ${muted}` }
                      : leaveToday
                        ? { text: t("status.onLeave"), cls: `${chipCls} border-[color:var(--color-line)] font-normal ${muted}` }
                        : e.employmentStatus === "PROBATION"
                          ? { text: left >= 0 ? t("status.probationLeft", { n: left }) : t("status.probation"), cls: `${chipCls} border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]` }
                          : e.contractEndAt
                            ? { text: t("status.contract", { date: dayMonth(e.contractEndAt, locale) }), cls: `${chipCls} border-[color:var(--color-line)] font-normal ${muted}` }
                            : { text: t("status.active"), cls: `${chipCls} border-[color:var(--color-ink)]` };
                    const sel = pv?.profile.id === e.id;
                    const pinOk = !isEnded && hasPin(e);
                    const typeTxt = typeOf(e.employmentType), pay = payOf(e.id), unitTxt = showBranches ? unitOf(e.unitId) : e.unitId ? unitOf(e.unitId) : "—";
                    return (
                      <tr
                        key={e.id}
                        data-testid={`hr-people-row-${e.id}`}
                        aria-selected={sel || undefined}
                        className={`flex items-center gap-2 border-b border-[color:var(--color-line)] py-2 pl-3 pr-1 last:border-b-0 md:table-row md:p-0 ${sel ? "bg-[color:var(--color-accent-soft)] md:shadow-[inset_3px_0_0_var(--color-accent)]" : ""} ${isEnded ? muted : ""}`}
                      >
                        <td className={`block min-w-0 flex-1 ${td} md:pl-4`}>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span aria-hidden="true" className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] text-[13px] font-semibold">
                              {initialOf(e.name)}
                            </span>
                            <div className={`min-w-0 max-w-[12rem] ${col.name}`}>
                              <Link href={href({ emp: e.id })} scroll={false} title={e.name} data-testid={`hr-people-name-${e.id}`} className={`hidden font-semibold hover:underline xl:block ${one}`}>
                                {e.name}
                              </Link>
                              <Link href={profileHref(systemId, e.id)} title={e.name} data-testid={`hr-people-name-${e.id}`} className={`font-semibold hover:underline xl:hidden ${one}`}>
                                {e.name}
                              </Link>
                              <small className={`text-xs ${muted} ${one}`} title={[e.code, e.position, unitTxt].filter(Boolean).join(" · ")}>
                                {e.code || "—"}
                                <span className={`hidden md:inline ${col.typeFold}`}>{` · ${typeTxt}`}</span>
                                <span className="md:hidden">{[e.position, unitTxt].filter((x) => x && x !== "—").map((x) => ` · ${x}`).join("")}</span>
                              </small>
                            </div>
                          </div>
                        </td>
                        <td className={`hidden ${td}`}>
                          <span className={`${col.pos} ${one}`} title={e.position ?? undefined}>{e.position || "—"}</span>
                          {e.department && <small className={`${col.pos} text-xs ${muted} ${one}`} title={e.department}>{e.department}</small>}
                        </td>
                        <td className={`${col.unit} md:whitespace-nowrap md:px-2 md:py-2 md:align-middle`}>
                          <span data-testid={showBranches ? `hr-register-unit-${e.id}` : undefined} title={unitTxt} className={`max-w-[6.5rem] xl:max-w-[8rem] ${one}`}>
                            {unitTxt}
                          </span>
                        </td>
                        <td className={`${col.type} md:whitespace-nowrap md:px-2 md:py-2 md:align-middle`}>
                          {typeTxt}
                          {pay && <small className={`block text-xs ${muted}`}>{pay}</small>}
                        </td>
                        <td className={`${col.start} md:whitespace-nowrap md:px-2 md:py-2 md:align-middle`}>{e.startDate ? formatShortDate(e.startDate, locale) : "—"}</td>
                        <td className={`block shrink-0 ${td}`}>
                          <span data-testid={`hr-register-status-${e.id}`} className={status.cls}>
                            {status.text}
                          </span>
                        </td>
                        <td className={`${col.pin} md:whitespace-nowrap md:px-2 md:py-2 md:align-middle`}>
                          <span className={pinOk ? "font-semibold" : muted}>{isEnded ? t("closed") : pinOk ? `✓ ${t("pinSet")}` : "—"}</span>
                          {e.linkedUserId && !isEnded && <small className={`block text-xs ${muted} ${col.acctFold}`}>{`✓ ${t("accountYes")}`}</small>}
                        </td>
                        <td className={`${col.acct} md:whitespace-nowrap md:px-2 md:py-2 md:align-middle`}>
                          <span className={e.linkedUserId && !isEnded ? "font-semibold" : muted}>{isEnded ? t("closed") : e.linkedUserId ? `✓ ${t("accountYes")}` : "—"}</span>
                        </td>
                        <td className="block shrink-0 text-right md:table-cell md:py-0.5 md:pr-3 md:align-middle">
                          {canEdit && isEnded ? (
                            // HR H1.1 R12 ▸ R12.4: สถานะ "สิ้นสุด" กู้คืนตรง ๆ ไม่ได้ — เปลี่ยนสถานะที่โปรไฟล์ก่อน (action ปฏิเสธซ้ำ) ◂
                            e.employmentStatus === "ENDED" ? (
                              <Link href={profileHref(systemId, e.id)} data-testid={`hr-register-restore-status-${e.id}`} title={t("more.restoreEnded")} className={`inline-flex min-h-11 items-center whitespace-nowrap text-xs underline ${muted}`}>
                                {t("more.openProfile")}
                              </Link>
                            ) : (
                              <form action={restoreEmployeeAction}>
                                <input type="hidden" name="systemId" value={systemId} />
                                <input type="hidden" name="employeeId" value={e.id} />
                                <SubmitButton variant="ghost" pendingText={t("form.saving")} className="min-h-[44px]" data-testid={`hr-people-restore-${e.id}`}>{t("more.restore")}</SubmitButton>
                              </form>
                            )
                          ) : canEdit ? (
                            <details className="relative inline-block text-left">
                              <summary data-testid={`hr-people-more-${e.id}`} aria-label={t("more.label", { name: e.name })} className="grid min-h-[44px] min-w-[44px] cursor-pointer list-none place-items-center rounded-lg text-lg text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)] [&::-webkit-details-marker]:hidden">
                                ⋯
                              </summary>
                              {/* r2 (B9): เมนูสูงไม่เกิน 70% ของจอ (เลื่อนในเมนู) · ปุ่มลบอยู่แถวบนสุด · ตารางเวลาพับไว้ */}
                              <div className="absolute right-0 top-full z-40 mt-1 flex max-h-[70vh] w-[min(calc(100vw-1.5rem),420px)] flex-col gap-3 overflow-y-auto whitespace-normal rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4 text-sm text-[color:var(--color-ink)] shadow-lg">
                                <div className="flex items-center gap-3">
                                  <Link href={profileHref(systemId, e.id)} data-testid={`hr-people-menu-open-${e.id}`} className="inline-flex min-h-[44px] items-center font-semibold text-[color:var(--color-accent)]">
                                    {t("more.openProfile")} →
                                  </Link>
                                  <span className="flex-1" />
                                  {/* ลบ = soft delete · ประวัติลงเวลา/ลา/เงินเดือน และนัดเก่ายังอยู่ครบ */}
                                  <ConfirmDialog
                                    triggerLabel={t("more.remove")}
                                    triggerClassName="btn-sm min-h-[44px] text-[color:var(--color-danger)]"
                                    title={t("more.removeTitle", { name: e.name })}
                                    detail={t("more.removeDetail")}
                                    confirmLabel={t("more.removeConfirm")}
                                    danger
                                    action={removeEmployeeAction}
                                    fields={{ systemId, employeeId: e.id }}
                                    testId={`hr-people-remove-${e.id}`}
                                  />
                                </div>
                                {/* แก้ข้อมูลพื้นฐาน (ชื่อ/ตำแหน่ง/เบอร์) — action เดิม */}
                                <form action={updateEmployeeAction} className="flex flex-col gap-2 border-t border-[color:var(--color-line)] pt-3">
                                  <b className="text-sm">{t("more.basic")}</b>
                                  <input type="hidden" name="systemId" value={systemId} />
                                  <input type="hidden" name="employeeId" value={e.id} />
                                  <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                                    {t("more.name")}
                                    <input name="name" required data-testid={`hr-people-edit-name-${e.id}`} defaultValue={e.name} className="input min-h-11" />
                                  </label>
                                  <div className="grid grid-cols-2 gap-2">
                                    <label className={`flex min-w-0 flex-col gap-1 text-xs ${muted}`}>
                                      {t("more.position")}
                                      <input name="position" data-testid={`hr-people-edit-position-${e.id}`} defaultValue={e.position ?? ""} placeholder={t("more.positionPh")} className="input min-h-11" />
                                    </label>
                                    <label className={`flex min-w-0 flex-col gap-1 text-xs ${muted}`}>
                                      {t("more.phone")}
                                      <input name="phone" inputMode="tel" data-testid={`hr-people-edit-phone-${e.id}`} defaultValue={e.phone ?? ""} className="input min-h-11" />
                                    </label>
                                  </div>
                                  <div>
                                    <SubmitButton variant="ghost" pendingText={t("form.saving")} className="min-h-[44px]" data-testid={`hr-people-edit-save-${e.id}`}>{t("more.saveBasic")}</SubmitButton>
                                  </div>
                                </form>
                                {/* PIN ลงเวลาเอง — ให้พนักงานกดเองที่จอ kiosk */}
                                <div className="flex flex-col gap-2 border-t border-[color:var(--color-line)] pt-3">
                                  <b className="text-sm">{t("more.pin")}</b>
                                  <PinField systemId={systemId} employeeId={e.id} hasPin={hasPin(e)} />
                                </div>
                                <details className="border-t border-[color:var(--color-line)] pt-1">
                                  <summary data-testid={`hr-people-sched-toggle-${e.id}`} className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                                    <b className="text-sm">{t("more.schedule")}</b>
                                    <span className={`text-xs ${muted}`}>{!sch || sch.every((x) => x == null) ? t("sched.none") : t("sched.perWeek", { n: sch.filter((x) => x && !x.dayOff).length })}</span>
                                    <span aria-hidden="true" className={`ml-auto ${muted}`}>▾</span>
                                  </summary>
                                  <HrScheduleEditor systemId={systemId} employeeId={e.id} schedule={sch ?? undefined} />
                                </details>
                              </div>
                            </details>
                          ) : (
                            <Link href={profileHref(systemId, e.id)} data-testid={`hr-people-open-${e.id}`} aria-label={t("more.openProfile")} className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]">
                              ›
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  }),
                )}
              </tbody>{/* HR VIS-5c */}
            </table>
          )}
          {pg.rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--color-line)] px-4 py-2.5 text-[13px]">
              <span data-testid="hr-people-summary" className={muted}>{footer}</span>
              {pg.pages > 1 && (
                <nav aria-label={t("pager")} className="ml-auto flex items-center gap-1">
                  {[...(pg.page > 1 ? [{ key: "prev", n: pg.page - 1, label: "‹", aria: t("prev") }] : []), ...Array.from({ length: pg.pages }, (_, k) => ({ key: String(k + 1), n: k + 1, label: String(k + 1), aria: t("pageN", { n: k + 1 }) })), ...(pg.page < pg.pages ? [{ key: "next", n: pg.page + 1, label: "›", aria: t("next") }] : [])].map((x) => (
                    <Link
                      key={x.key}
                      href={href({ page: x.n > 1 ? String(x.n) : "" })}
                      data-testid={`hr-people-page-${x.key}`}
                      aria-current={x.key === String(pg.page) ? "page" : undefined}
                      aria-label={x.aria}
                      className={`grid min-h-[44px] min-w-[44px] place-items-center rounded-lg border ${x.key === String(pg.page) ? "border-[color:var(--color-ink)] font-bold" : "border-[color:var(--color-line)]"}`}
                    >
                      {x.label}
                    </Link>
                  ))}
                </nav>
              )}
            </div>
          )}
        </div>

        {/* HR H4.4 ▸ แผง "ต้องจัดการ" (ภาพ 02 · lifecycleDue) — ผู้ดูข้อมูลบันทึกเท่านั้น ◂ */}
        <LifecycleDuePanel systemId={systemId} />
      </div>

      {/* แผงอ่านด้านขวา (?emp=) — ลิ้นชักเต็มสูงชิดขอบขวา (ภาพ 02) · DTO ของ loadEmployeeProfileForViewer · เลขอ่อนไหวปิดแล้ว · ≥ 1280 เท่านั้น (จอเล็กกดชื่อ = เปิดโปรไฟล์) · ไม่ผูก action */}
      {pv && (
        <aside data-testid="hr-people-panel" aria-label={pv.profile.name} className="hidden min-w-0 flex-col border-l border-[color:var(--color-line)] bg-[color:var(--color-surface)] shadow-[-8px_0_24px_rgba(10,10,10,0.06)] xl:flex">
          <div className="px-5 pb-2 pt-5">
            <ProfileHeader emp={pv.profile} close={href({ emp: "" })} />
          </div>
          <div className="px-3">
            <ProfileTabs compact href={(k) => profileHref(systemId, pv.profile.id, `?tab=${k}`)} tab="general" tabs={pv.canSeeSensitive ? ["general", "docs", "schedule", "leave", "pay", "history"] : ["general", "docs", "schedule", "leave", "history"]} />
          </div>
          <div className="flex flex-1 flex-col gap-6 px-5 py-5">{/* HR VIS-5c */}
            <ProfileProbation systemId={systemId} tenantId={auth.active.tenantId} viewer={viewer} emp={pv.profile} reviewTestId="hr-people-panel-review" />
            <EmployeeReadView systemId={systemId} emp={pv.profile} sensitive={pv.canSeeSensitive} canEdit={canEdit} compact />
            <ProfileChecklist systemId={systemId} tenantId={auth.active.tenantId} viewer={viewer} employeeId={pv.profile.id} life={pvLife} manageHref={profileHref(systemId, pv.profile.id, "?tab=history#hr-life")} />
            <ProfileConnections systemId={systemId} tenantId={auth.active.tenantId} emp={pv.profile} canEdit={canEdit} />
          </div>
          <div className="flex items-center gap-3 border-t border-[color:var(--color-line)] px-5 py-4">
            <Link href={profileHref(systemId, pv.profile.id)} data-testid="hr-people-panel-open" className="btn btn-primary min-h-[44px] text-sm">
              {t("panel.open")} →
            </Link>
          </div>
        </aside>
      )}
    </div>
  );
} // HR VIS-5c ◂

// HR VIS-5c ▸ ตารางเข้างานรายคน (ฟอร์มเดิมของ ⋯ ย้ายมาเป็นชิ้นเดียว · ใช้ที่เมนู ⋯ ของทะเบียน และแท็บ "ตารางงาน" ของโปรไฟล์) — action เดิม setWorkScheduleAction ·
//   ครึ่งวัน = ตั้งเวลาให้สั้นลง (เช่น เสาร์ 09:00-13:00) · วันที่ไม่ติ๊ก = ยังไม่กำหนด (ไม่ตัดสินว่าสาย) ◂
export async function HrScheduleEditor({ systemId, employeeId, schedule }: { systemId: string; employeeId: string; schedule?: (ScheduleRow | null)[] }) {
  const t = await getTranslations("hr.people");
  let sch = schedule;
  if (!sch) {
    const auth = await requireTenant();
    sch = await getSchedule({ tenantId: auth.active.tenantId, systemId }, employeeId);
  }
  const grace = sch.find((x) => x)?.graceMin ?? 15;
  return (
    <form action={setWorkScheduleAction} className="flex flex-col gap-2">
      <input type="hidden" name="systemId" value={systemId} />
      <input type="hidden" name="employeeId" value={employeeId} />
      {DISPLAY_ORDER.map((wd) => {
        const r = sch[wd];
        return (
          <div key={wd} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <label className="flex min-h-[44px] w-28 items-center gap-2">
              <input type="checkbox" name={`on-${wd}`} data-testid={`hr-sched-on-${wd}`} defaultChecked={r != null} className="h-5 w-5" />
              {t(`sched.d${wd}` as "sched.d0")}
            </label>
            <input type="time" name={`start-${wd}`} data-testid={`hr-sched-start-${wd}`} aria-label={`${t(`sched.d${wd}` as "sched.d0")} ${t("sched.start")}`} defaultValue={hhmm(r?.startMin ?? 540)} className="input min-h-11 w-[7.5rem]" />
            <span className={`text-xs ${muted}`}>{t("sched.to")}</span>
            <input type="time" name={`end-${wd}`} data-testid={`hr-sched-end-${wd}`} aria-label={`${t(`sched.d${wd}` as "sched.d0")} ${t("sched.end")}`} defaultValue={hhmm(r?.endMin ?? 1080)} className="input min-h-11 w-[7.5rem]" />
            <label className="flex min-h-[44px] items-center gap-2 text-xs">
              <input type="checkbox" name={`off-${wd}`} data-testid={`hr-sched-off-${wd}`} defaultChecked={r?.dayOff ?? false} className="h-5 w-5" />
              {t("sched.dayOff")}
            </label>
          </div>
        );
      })}
      <label className={`flex flex-wrap items-center gap-2 text-xs ${muted}`}>
        {t("sched.grace")}
        <input name="graceMin" type="number" data-testid="hr-sched-grace" min={0} max={120} defaultValue={grace} className="input min-h-11 w-20" />
      </label>
      <p className={`text-xs ${muted}`}>{t("sched.hint")}</p>
      <div>
        <SubmitButton variant="ghost" pendingText={t("form.saving")} className="min-h-[44px]" data-testid="hr-sched-save">{t("sched.save")}</SubmitButton>
      </div>
    </form>
  );
}

// HR VIS-5c ▸ แท็บ "ตารางงาน" ของโปรไฟล์ — ผู้แก้ได้ HrScheduleEditor · ผู้ดูอื่นเห็นตารางแบบอ่านอย่างเดียว (ไม่มี action) ◂
export async function HrProfileScheduleTab({ systemId, employeeId, canEdit }: { systemId: string; employeeId: string; canEdit: boolean }) {
  const t = await getTranslations("hr.people");
  const auth = await requireTenant();
  const sch = await getSchedule({ tenantId: auth.active.tenantId, systemId }, employeeId);
  const grace = sch.find((x) => x)?.graceMin;
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[15px] font-bold">{t("prof.schedule.title")}</h3>
      {canEdit ? (
        <HrScheduleEditor systemId={systemId} employeeId={employeeId} schedule={sch} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[color:var(--color-line)]">
          {DISPLAY_ORDER.map((wd) => {
            const r = sch[wd];
            return (
              <div key={wd} className="flex min-h-[44px] items-center gap-3 border-t border-[color:var(--color-line)] px-3.5 py-2 text-sm first:border-t-0">
                <span className={`w-28 shrink-0 ${muted}`}>{t(`sched.d${wd}` as "sched.d0")}</span>
                <span className={r && !r.dayOff ? "font-medium" : muted}>{!r ? t("sched.unset") : r.dayOff ? t("sched.off") : `${hhmm(r.startMin)}–${hhmm(r.endMin)}`}</span>
              </div>
            );
          })}
          {grace != null && <p className={`border-t border-[color:var(--color-line)] px-3.5 py-2 text-xs ${muted}`}>{t("sched.graceRead", { n: grace })}</p>}
        </div>
      )}
    </section>
  );
}

// ───────────── จอลงเวลา (kiosk) ─────────────
// เจ้าของเปิดหน้านี้ค้างบนแท็บเล็ตหน้าร้าน แล้วพนักงานกดลงเวลาเองด้วย PIN
export async function HrKioskSection({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  const people = await kioskRoster(ctx, hrScopeOf(hrViewerOf(auth))); // HR H1.1 ▸ จอของบัญชีที่จำกัดสาขา = เฉพาะคนในสาขา ◂
  const noPin = people.filter((p) => !p.hasPin);
  // HR H2.4 ▸ R9 ข้อความจาก hr.kiosk · r2 ▸ R1/R2 จอ = เลือกชื่อ + PIN · รายชื่อ = ขอบเขตสาขาของบัญชีจอ (ชุดเดียวกับที่ kioskClockAction ตรวจ) ◂
  const tk = await getTranslations("hr.kiosk");
  const kioskLabels = {
    prompt: tk("prompt"), clear: tk("clear"), back: tk("back"), submit: tk("submit"), breakStart: tk("breakStart"), saving: tk("saving"), entered: tk("entered"),
    pick: tk("pick"), change: tk("change"), noPin: tk("noPin"), tap: tk("tap"), empty: tk("empty"),
  };

  return (
    <div className="flex flex-col gap-6">
      <Section title="ลงเวลาเอง">
        <KioskClock systemId={systemId} people={people} labels={kioskLabels} />
      </Section>
      {noPin.length > 0 && (
        <Section title="ยังไม่มี PIN">
          <p className={`text-xs ${muted}`}>
            {noPin.map((p) => p.name).join(" · ")} — ตั้ง PIN ให้ที่แท็บ “พนักงาน” ก่อน จึงจะกดลงเวลาเองได้
          </p>
        </Section>
      )}
    </div>
  );
}

// ───────────── HrHub (หน้าภาพรวม ฝังใน /app/sys/[id]) ─────────────
// การ์ดสรุปสั้น + ลิงก์เข้าแต่ละฟังก์ชัน (ไม่ dump ทุก section แล้ว — แตกเป็นหน้าย่อยจริง)
export async function HrHub({ systemId, day, unit }: { systemId: string; day?: string; unit?: string }) { // HR VIS-5b ▸ + day · unit (บอร์ดของวัน/สาขาที่เลือก) ◂
  const auth = await requireTenant();
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  // HR VIS-5b ▸ แท็บตามผู้ดู — [] = บัญชีจอลงเวลาอย่างเดียว ⇒ การ์ดเดียว "เปิดจอลงเวลา" (ไม่มีตัวนับ/ลิงก์อื่น) ◂
  const tabs = await hrTabsFor(systemId);
  if (!tabs.length) return <HrKioskCard systemId={systemId} />;

  // HR H1.1 ▸ การ์ดนับ = ขอบเขตเดียวกับหน้ารายการ (แถว + สาขา) ◂
  const hv = hrViewerOf(auth);
  // HR VIS-5b ▸ F5: ด่านหน้า (hrPageAccessOf) ก่อนอ่าน — อ่านรายชื่อเฉพาะผู้เปิดหน้าพนักงานได้ · ใบลารออนุมัติเฉพาะผู้เปิดหน้าใบลาได้ (ไม่มีการอ่านที่ไม่ได้แสดง) ◂
  const pageOk = hrPageAccessOf(hv); // HR PRIV-3 ▸ R5 ◂ · HR VIS-5b ▸ ย้ายขึ้นก่อนการอ่าน ◂
  const [employees, pending] = await Promise.all([
    pageOk.register ? listEmployees(ctx, 200, hrScopeOf(hv)) : [],
    pageOk.leave ? pendingLeaves(ctx, 100, leaveListScopeOf(hv, hv.userId)) : [],
  ]); // HR VIS-5b ◂
  // CRM C3.6 ▸ ลิงก์ "ทีมขาย" โชว์เฉพาะคนที่เปิดหน้าทีมได้จริง — กติกาต้นฉบับ: `crmCan(actor, "crm.team.manage")` ใน
  //   src/lib/modules/crm/access.ts (+ ด่านของหน้า src/app/app/settings/teams/page.tsx) · ถ้าแก้ที่นั่น ต้องแก้ที่นี่ตาม (หน้านั้น: OWNER หรือคีย์ `crm.team.manage` — คีย์ของเจ้าของร้าน
  //   ที่ MANAGER ไม่ได้โดยปริยาย) · ไม่ import โมดูล CRM (เส้น hr→crm ไม่อยู่ใน ALLOWED_EDGES) ⇒ อ่านจาก membership ตรง ◂
  const perms = (auth.active.permissions ?? {}) as Record<string, unknown>;
  // + ร้านต้องมีระบบ CRM ที่เปิด CRM ใหม่ (uiVersion 2) — ร้าน CRM เดิมไม่มีเรื่อง "ทีมขาย" ให้จัด (ไม่โชว์ลิงก์ที่ไม่มีความหมาย)
  const canManageSalesTeams =
    (auth.active.role === "OWNER" || perms["crm.team.manage"] === true || perms["crm.*"] === true) &&
    (await tenantDb({ tenantId: auth.active.tenantId }).appSystem.count({
      where: { tenantId: auth.active.tenantId, type: "CRM", active: true, settings: { path: ["crm", "uiVersion"], equals: 2 } },
    })) > 0;

  // HR PRIV-3 ▸ R5: การ์ดใบลา/พนักงาน (+ จำนวนคน)/เงินเดือน เฉพาะผู้เปิดหน้านั้นได้ (hrPageAccessOf — ด่านเดียวกับหน้า · ไม่มีลิงก์ไป 404) ◂
  // HR VIS-5b ▸ F5: pageOk ย้ายขึ้นก่อนการอ่าน · การ์ดลงเวลาเฉพาะผู้ที่แท็บของตนมี /hr/attendance (ด่านเดียวกับแถบเมนู · ไม่มีลิงก์ไป 404) ◂
  const attHref = `/app/sys/${systemId}/hr/attendance`; // HR VIS-5b ◂
  const attOk = tabs.some((t) => t.href === attHref); // HR VIS-5b ◂
  const cards = [
    { href: `/app/sys/${systemId}/hr/attendance`, label: "ลงเวลา", desc: "เข้า/ออกงาน + ประวัติ" },
    { href: `/app/sys/${systemId}/hr/leave`, label: "ใบลา", value: `${pending.length} รออนุมัติ`, desc: "อนุมัติ/ยื่นใบลา", ok: pageOk.leave },
    { href: `/app/sys/${systemId}/hr/employees`, label: "พนักงาน", value: `${employees.length} คน`, desc: "รายชื่อ + เพิ่มพนักงาน", ok: pageOk.register },
    { href: `/app/sys/${systemId}/hr/payroll`, label: "เงินเดือน", desc: "โปรไฟล์ + รอบจ่าย + สลิป", ok: pageOk.payroll },
  ].filter((c) => c.ok !== false && (c.href !== attHref || attOk)); // HR PRIV-3 ◂ · HR VIS-5b ▸ การ์ดลงเวลา iff แท็บ ◂
  // HR H1.2 ▸ R9 หน้าตั้งค่า (กะ · ประเภทการลา · วันหยุด) — OWNER หรือ hr.employee.create ◂
  const canSettings = canManageHrSettings(hv);
  // HR H2.11 ▸ ภาพรวมทีม (ภาพ 01) เหนือการ์ดเดิม เมื่อผู้ดูมีส่วนใดส่วนหนึ่ง · ตัวอย่างคำขอ 5 รายการแรก ◂
  const { overview, preview } = await teamOverviewWithPreview(ctx, hv, { day, unit }); // HR H2.11 ◂ · HR VIS-5b ▸ + day · unit ◂
  // HR H3.9 ▸ รายงาน (ไม่มีแท็บใหม่ — มติ Q7): ลิงก์บนการ์ดภาพรวม + การ์ดลิงก์ · แสดงเมื่อผู้ดูเปิดรายงานได้อย่างน้อย 1 ชนิด ◂
  const tRep = await getTranslations("hr.report"); // HR H3.9 ◂
  const reportsLink = reportAccessOf(hv).reports.length > 0 ? { label: tRep("link"), desc: tRep("linkDesc") } : null; // HR H3.9 ◂
  // HR VIS-5b ▸ ภาพ 01: ตัวเลข 5 ช่อง + ข้อเท็จจริงของบอร์ด (hub-rules) · การ์ดค่าแรงวาดก่อน (null = ผู้ดูไม่เห็นเงิน → ไม่มีช่องว่างในคอลัมน์ซ้าย · การ์ดตัดสินเองเหมือนเดิม) ·
  //   การ์ดเดือนเฉพาะผู้เปิดรายงานเวลาได้ · แถบใกล้ครบกำหนดเฉพาะผู้ที่ lifecycleDue คืนค่า ◂
  const board = overview?.board ?? null;
  const access = reportAccessOf(hv);
  const labor = overview ? await HrLaborCard({ systemId }) : null;

  return (
    <div className="flex flex-col gap-5">
      {/* HR H2.10 ▸ แท็บตามผู้ดู ◂ · HR VIS-5b ▸ ขึ้นบรรทัดใหม่ที่จอ ≥ md แทนการตัดแท็บท้าย ◂ */}
      <ModuleTabs items={tabs} wrap />
      {overview && (
        <HrTeamOverviewSection
          systemId={systemId}
          overview={overview}
          preview={preview}
          reports={reportsLink}
          labor={labor}
          kpis={board ? kpisOf(board) : null}
          facts={board ? boardFactsOf(board) : null}
          header={board ? <HrHubHeader systemId={systemId} board={board} canRoster={canReadRoster(hv)} canAdd={canSettings} /> : null}
          board={board ? <HrTodayBoard board={board} /> : null}
          month={access.reports.includes("time") ? <HrMonthCard ctx={ctx} viewer={hv} systemId={systemId} ot={access.reports.includes("ot")} attendance={attOk} /> : null}
          due={overview.lifecycleDue !== null ? <HrDueStrip ctx={ctx} viewer={hv} systemId={systemId} /> : null}
        /> /* HR H2.11 ◂ · HR H3.9 ▸ reports ◂ · HR H4.2 ▸ labor ◂ · HR VIS-5b ▸ ภาพ 01 ◂ */
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" /* HR VIS-5b ▸ การ์ดลิงก์ไว้ล่างสุด แบบกระชับ ◂ */>
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card flex min-h-[76px] flex-col gap-1 p-4 transition-colors hover:bg-[color:var(--color-surface-2)]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{c.label}</span>
              {c.value && <span className="text-sm tabular-nums text-[color:var(--color-accent)]">{c.value}</span>}
            </div>
            <span className={`text-xs ${muted}`}>{c.desc}</span>
          </Link>
        ))}
        {canSettings && (
          <Link
            href={`/app/sys/${systemId}/hr/settings`}
            data-testid="hr-link-settings"
            className="card flex min-h-[76px] flex-col gap-1 p-4 transition-colors hover:bg-[color:var(--color-surface-2)]"
          >
            <span className="text-sm font-medium">ตั้งค่า</span>
            <span className={`text-xs ${muted}`}>กะ · ประเภทการลา · วันหยุด</span>
          </Link>
        )}
        {reportsLink && ( // HR H3.9 ▸ การ์ดลิงก์รายงาน ◂
          <Link href={`/app/sys/${systemId}/hr/reports`} data-testid="hr-link-reports" className="card flex min-h-[76px] flex-col gap-1 p-4 transition-colors hover:bg-[color:var(--color-surface-2)]">
            <span className="text-sm font-medium">{reportsLink.label}</span>
            <span className={`text-xs ${muted}`}>{reportsLink.desc}</span>
          </Link>
        )}
        {canManageSalesTeams && (
          // CRM C3.6 ▸ R-A: HR ลิงก์ไป "ทีมขาย" ของ core (`/app/settings/teams`) — ไม่มีหน้าทีมชุดที่สองใน HR ◂
          <Link
            href="/app/settings/teams"
            data-testid="hr-link-sales-teams"
            className="card flex min-h-[76px] flex-col gap-1 p-4 transition-colors hover:bg-[color:var(--color-surface-2)]"
          >
            <span className="text-sm font-medium">ทีมขาย</span>
            <span className={`text-xs ${muted}`}>จัดทีม หัวหน้าทีม และคนรับ lead (ใช้ร่วมกับ CRM)</span>
          </Link>
        )}
      </div>
    </div>
  );
}

// ───────────── HR H2.9 ▸ คำขอ OT (ภาพ 05 การ์ด OT · ภาพ 07a "ขอ OT") ─────────────
//   ผู้ตัดสิน/ผู้ดูเงินเดือน = รายการของสาขาในขอบเขต (otRequestList) · พนักงานที่ผูกบัญชี = รายการของตัวเอง + ยอดเงินของตัวเอง (myOtRequests) ·
//   ยอดเงิน (฿) แสดงเฉพาะเมื่อ DTO มี amountSatang (OWNER · hr.payroll.read · ตัวเอง — มติ Q11: ผู้จัดการเห็นนาที+ตัวคูณ ไม่เห็น ฿ ต่างจากภาพ 05) ·
//   ปุ่มทุกปุ่มตรวจซ้ำที่ service (ด่านเดียวกับ API) — หน้านี้แค่ซ่อนปุ่มที่ไม่มีทางผ่าน
const OT_HHMM = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
export async function HrOtSection({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  const viewer = hrViewerOf(auth) as OtViewer;
  const t = await getTranslations("hr.ot");
  const perms = (viewer.permissions ?? {}) as Record<string, unknown>;
  const isDecider = viewer.role === "OWNER" || viewer.role === "MANAGER" || perms["hr.payadjust.approve"] === true || perms["hr.*"] === true;
  const canOnBehalf = viewer.role === "OWNER" || viewer.role === "MANAGER" || perms["hr.payadjust.request"] === true || perms["hr.*"] === true;
  const [list, mine] = await Promise.all([otRequestList(ctx, viewer, {}), myOtRequests(ctx, viewer)]);
  const others = canOnBehalf ? (await listEmployees(ctx, 200, hrScopeOf(hrViewerOf(auth)))).map((e) => ({ id: e.id, name: e.name })) : [];
  if (!list.ok && !mine.ok && !others.length) return null;
  const mineIds = new Set(mine.ok ? mine.items.map((x) => x.id) : []);
  const row = (x: OtItem, own: boolean) => {
    const money = "amountSatang" in x ? x : null;
    const hours = `${Math.floor(x.requestedMin / 60)}:${String(x.requestedMin % 60).padStart(2, "0")}`;
    const cls = x.dayClass === "HOLIDAY" ? t("holiday") : t("workday");
    return (
      <li key={x.id} className="flex flex-col gap-1 border-t py-3" style={{ borderColor: "var(--color-line)" }}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{x.employeeName}</span>
          <StatusChip value={x.status} map={{ PENDING: t("statusPENDING"), APPROVED: t("statusAPPROVED"), REJECTED: t("statusREJECTED"), CANCELLED: t("statusCANCELLED") }} tone={x.status === "APPROVED" ? "strong" : "muted"} />
          <span className={`text-xs ${muted}`}>{x.timing === "BEFORE" ? t("timingBefore") : t("timingAfter")}</span>
          {x.warnWeek && <span className="text-xs text-[color:var(--color-danger)]">{t("warnWeek")}</span>}
        </div>
        <div className="text-sm">
          <b>
            {formatThaiDate(new Date(`${x.date}T00:00:00Z`))} {OT_HHMM(x.startAt)}–{OT_HHMM(x.endAt)}
          </b>
          <span className={`text-xs ${muted}`}>
            {" · "}
            {t("hours", { h: hours })} · {cls}
            {x.multiplierBp ? ` ×${(x.multiplierBp / 10000).toString()}` : ""}
            {x.reason ? ` · “${x.reason}”` : ""}
          </span>
        </div>
        <div className={`text-xs ${muted}`}>
          {x.settled ? t("paidMin", { n: x.paidMin ?? 0 }) : x.status === "APPROVED" ? t("waiting") : ""}
          {x.status === "CANCELLED" && x.settled && (x.paidMin ?? 0) > 0 ? <span className="block text-xs" data-testid="hr-ot-kept">{t("keptHoliday", { n: x.paidMin ?? 0 })}</span> : null} {/* HR H3.4 ◂ fix r3 H7: ยกเลิกแล้วแต่ยังจ่ายค่าทำงานในวันหยุดส่วนที่ทำจริง (นาที — ไม่มี ฿) */}
          {money && money.amountSatang !== null && x.settled ? ` · ${formatBaht(money.amountSatang)}` : ""}
        </div>
        <OtRowActions systemId={systemId} id={x.id} decide={isDecider && !own && x.status === "PENDING"} revoke={isDecider && !own && x.status === "APPROVED"} cancel={own && x.status === "PENDING"} />
      </li>
    );
  };
  return (
    <Section title={t("title")} card>
      <p className={`text-xs ${muted}`}>{t("desc")}</p>
      {(mine.ok || others.length > 0) && <OtRequestForm systemId={systemId} employees={others} canSelf={mine.ok} />}
      <ul className="flex flex-col" data-testid="hr-ot-list">
        {list.ok
          ? list.items.map((x) => row(x, mineIds.has(x.id)))
          : mine.ok
            ? mine.items.map((x) => row(x, true))
            : null}
      </ul>
      {(list.ok ? list.items.length : mine.ok ? mine.items.length : 0) === 0 && <p className={`text-xs ${muted}`}>{t("empty")}</p>}
    </Section>
  );
}

/** HR H2.9 ▸ #18 ช่องอัตรา OT ต่อชั่วโมงในฟอร์มเงินเดือน (payroll-ui.tsx) — บาท · ว่าง = คิดจากค่าจ้างตามกฎหมาย (ล้างค่าที่ตั้งไว้) */
export function HrSalaryOtRateField({ valueSatang, label, hint }: { valueSatang: number | null; label: string; hint: string }) {
  return (
    <label className={`flex flex-col gap-1 text-xs ${muted}`} title={hint}>
      {label}
      <input name="otHourlyRateBaht" inputMode="decimal" defaultValue={valueSatang ? String(valueSatang / 100) : ""} placeholder={hint} className="input w-28" data-testid="hr-salary-ot-rate" />
    </label>
  );
}
// ◂ HR H2.9
