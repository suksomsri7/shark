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
import { hrNavFilter, type HrNavViewer } from "./nav"; // HR H2.10 ▸ แท็บตามผู้ดู ◂
import { employeeOfUser } from "./service"; // HR H2.10 ◂

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
    { href: `${s}/hr/employees`, label: "พนักงาน" },
    { href: `${s}/hr/payroll`, label: "เงินเดือน" },
    { href: `${s}/hr/settings`, label: "ตั้งค่า" }, // HR H2.2 ▸ หนี้ D9: แท็บตั้งค่าให้ตรง layout.tsx (หน้ากันสิทธิ์เอง) ◂
    { href: `${s}/hr/settings/law`, label: "ตารางกฎหมาย" }, // HR H3.3 r3 ▸ ตรงกับ layout.tsx (อ่านอย่างเดียว · หน้ากันสิทธิ์เอง) ◂
  ];
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
  return hrNavFilter(hrTabs(systemId), v, { linked: l });
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
  const [employees, { pending, history: leaves }] = await Promise.all([
    listEmployees(ctx, 200, hrScopeOf(hrViewerOf(auth))), // HR H1.1 ▸ ตัวเลือก "ยื่นแทน" = เฉพาะสาขาของผู้ดู ◂
    leaveItemsForViewer(ctx, hrViewerOf(auth)),
  ]);
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
        {employees.length > 0 && (
          <form action={requestLeaveAction} className="mt-1 flex flex-wrap items-end gap-2">
            <input type="hidden" name="systemId" value={systemId} />
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
        {employees.length > 0 && attachNote && (
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
            secondary: [dateRange(l.fromDate, l.toDate), l.filedBy].filter(Boolean).join(" · "), // HR H0.7 ▸ "ยื่นโดย" เฉพาะผู้จัดการ/HR (privacy.ts) ◂
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
const WD_LABEL: Record<number, string> = { 0: "อาทิตย์", 1: "จันทร์", 2: "อังคาร", 3: "พุธ", 4: "พฤหัสบดี", 5: "ศุกร์", 6: "เสาร์" };
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const hoursOf = (m: number) => (m % 60 === 0 ? String(m / 60) : (m / 60).toFixed(1)); // HR H4.1 ▸ ชั่วโมงสัปดาห์ (นาที → ชม.) ◂

// HR H1.1 ▸ R8 (mockup 02): ทะเบียนมีสาขาประจำ + ป้ายสถานะ · ผู้ดูทุกสาขาได้ชิปกรองสาขา (ทั้งหมด / รายสาขา / ยังไม่ระบุ)
//   ผู้ดูที่จำกัดสาขาไม่มีชิป และเห็นเฉพาะคนในสาขาตัวเอง (+ คนที่ยืมตัวเข้ามา) · `unit` = ค่าชิปจาก ?unit= ("none" = ยังไม่ระบุสาขา) ◂
export async function HrEmployeesSection({ systemId, unit }: { systemId: string; unit?: string }) {
  const auth = await requireTenant();
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  const scope = hrScopeOf(hrViewerOf(auth));
  const allBranches = isAllBranches(scope);

  const [inScope, removed, units] = await Promise.all([
    listEmployees(ctx, 200, scope),
    listRemovedEmployees(ctx, 200, scope),
    unitsForScope(auth.active.tenantId, scope),
  ]);
  const unitName = new Map(units.map((u) => [u.id, u.name]));
  const showBranches = allBranches && units.length >= 2;
  const chip = showBranches && unit ? unit : "";
  const employees = chip ? inScope.filter((e) => (chip === "none" ? !e.unitId : e.unitId === chip)) : inScope;
  const unassigned = inScope.filter((e) => !e.unitId).length;
  const chips = showBranches
    ? [{ key: "", label: "ทั้งหมด" }, ...units.map((u) => ({ key: u.id, label: u.name })), ...(unassigned ? [{ key: "none", label: "ยังไม่ระบุสาขาประจำ" }] : [])]
    : [];

  return (
    <Section title={`พนักงาน (${employees.length})`}>
      {/* HR H4.4 ▸ แผง "ต้องจัดการ" (ภาพ 02 · lifecycleDue) — ผู้ดูข้อมูลบันทึกเท่านั้น ◂ */}
      <LifecycleDuePanel systemId={systemId} />
      {showBranches && (
        <nav data-testid="hr-register-branch-filter" aria-label="กรองตามสาขา" className="mb-2 flex flex-wrap gap-2">
          {chips.map((c) => (
            <Link
              key={c.key || "all"}
              href={c.key ? `/app/sys/${systemId}/hr/employees?unit=${encodeURIComponent(c.key)}` : `/app/sys/${systemId}/hr/employees`}
              data-testid={`hr-register-branch-chip-${c.key || "all"}`}
              aria-current={chip === c.key ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-3 text-xs ${chip === c.key ? "font-semibold" : muted}`}
            >
              {c.label}
            </Link>
          ))}
        </nav>
      )}
      {showBranches && unassigned > 0 && (
        <p data-testid="hr-register-unit-prompt" role="note" className={`mb-2 text-xs ${muted}`}>
          ยังไม่ระบุสาขาประจำ {unassigned} คน — เปิดข้อมูลเต็มของพนักงานแล้วเลือกสาขาประจำ
        </p>
      )}
      {employees.length === 0 && (
        <p className={`text-xs ${muted}`}>
          ยังไม่มีพนักงาน — เพิ่มพนักงานคนแรกเพื่อเริ่มลงเวลา จัดการวันลา และให้รับคิวในระบบจอง
        </p>
      )}
      {/* ตารางเวลาทำงานรายคน — เดิมระบบมีแค่ปุ่มลงเวลา ไม่รู้ว่า "ควรเข้ากี่โมง" จึงบอกสาย/ขาดไม่ได้
          ครึ่งวัน = ตั้งเวลาให้สั้นลง (เช่น เสาร์ 09:00-13:00) ไม่ต้องมีชนิดพิเศษให้จำ */}
      {employees.length > 0 && (
        <div className="mt-3 flex flex-col gap-3 border-t pt-3">
          <div>
            <div className="text-sm font-medium">ข้อมูลรายคน</div>
            <p className={`text-xs ${muted}`}>
              กดชื่อเพื่อแก้ข้อมูล ตั้งตารางเข้างาน ตั้ง PIN หรือลบออกจากทะเบียน · วันที่ไม่ติ๊กในตาราง = ยังไม่กำหนด (ระบบจะไม่ตัดสินว่าสาย)
            </p>
          </div>
          {await Promise.all(
            employees.map(async (e) => {
              const sch = await getSchedule(ctx, e.id);
              const grace = sch.find((x) => x)?.graceMin ?? 15;
              return (
                <details key={e.id} className="rounded-lg border px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">
                    {e.name}
                    {/* HR H1.1 ▸ สาขาประจำ (ร้านหลายสาขา) + ป้ายสถานะการจ้าง ◂ */}
                    {showBranches && (
                      <span data-testid={`hr-register-unit-${e.id}`} className={`ml-2 text-xs font-normal ${muted}`}>
                        {e.unitId ? (unitName.get(e.unitId) ?? "สาขาอื่น") : "ยังไม่ระบุสาขาประจำ"}
                      </span>
                    )}
                    {e.employmentStatus && (
                      <span data-testid={`hr-register-status-${e.id}`} className="ml-2">
                        <StatusChip value={e.employmentStatus} map={EMPLOYMENT_STATUS_LABEL} tone={employmentTone(e.employmentStatus)} />
                      </span>
                    )}
                    <span className={`ml-2 text-xs font-normal ${muted}`}>
                      {sch.every((x) => x == null)
                        ? "ยังไม่ตั้งตาราง"
                        : `ทำงาน ${sch.filter((x) => x && !x.dayOff).length} วัน/สัปดาห์`}
                    </span>
                  </summary>
                  <Link href={`/app/sys/${systemId}/hr/employees/${e.id}`} className="mt-2 block text-xs underline">
                    ข้อมูลเต็ม (ที่อยู่ · วันเริ่มงาน · ประกันสังคม · เอกสาร) →
                  </Link>
                  {/* แก้ข้อมูลพื้นฐาน — เดิมกรอกตอนสร้างแล้วแก้ไม่ได้ (ช่างที่ระบบจองสร้างให้ไม่มีตำแหน่งเลย) */}
                  <form action={updateEmployeeAction} className="mt-2 flex flex-wrap items-end gap-2 border-b pb-2">
                    <input type="hidden" name="systemId" value={systemId} />
                    <input type="hidden" name="employeeId" value={e.id} />
                    <label className={`flex flex-1 flex-col gap-1 text-xs ${muted}`}>
                      ชื่อ
                      <input name="name" required defaultValue={e.name} className="input min-w-0" />
                    </label>
                    <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                      ตำแหน่งงาน
                      <input name="position" defaultValue={e.position ?? ""} placeholder="เช่น ช่างตัดผม" className="input" />
                    </label>
                    <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                      เบอร์โทร
                      <input name="phone" inputMode="tel" defaultValue={e.phone ?? ""} className="input" />
                    </label>
                    <SubmitButton variant="ghost">บันทึกข้อมูล</SubmitButton>
                  </form>
                  <form action={setWorkScheduleAction} className="mt-2 flex flex-col gap-2">
                    <input type="hidden" name="systemId" value={systemId} />
                    <input type="hidden" name="employeeId" value={e.id} />
                    {DISPLAY_ORDER.map((wd) => {
                      const r = sch[wd];
                      return (
                        <div key={wd} className="flex flex-wrap items-center gap-2 text-sm">
                          <label className="flex w-24 items-center gap-1.5">
                            <input type="checkbox" name={`on-${wd}`} defaultChecked={r != null} />
                            {WD_LABEL[wd]}
                          </label>
                          <input
                            type="time"
                            name={`start-${wd}`}
                            defaultValue={hhmm(r?.startMin ?? 540)}
                            className="rounded-lg border px-2 py-1"
                          />
                          <span className={`text-xs ${muted}`}>ถึง</span>
                          <input
                            type="time"
                            name={`end-${wd}`}
                            defaultValue={hhmm(r?.endMin ?? 1080)}
                            className="rounded-lg border px-2 py-1"
                          />
                          <label className="flex items-center gap-1 text-xs">
                            <input type="checkbox" name={`off-${wd}`} defaultChecked={r?.dayOff ?? false} />
                            วันหยุดประจำ
                          </label>
                        </div>
                      );
                    })}
                    <label className={`flex items-center gap-2 text-xs ${muted}`}>
                      เข้าช้าได้ (นาที) ก่อนนับว่าสาย
                      <input
                        name="graceMin"
                        type="number"
                        min={0}
                        max={120}
                        defaultValue={grace}
                        className="input w-20"
                      />
                    </label>
                    <SubmitButton variant="ghost">บันทึกตาราง</SubmitButton>
                  </form>
                  {/* PIN ลงเวลาเอง — ให้พนักงานกดเองที่จอ kiosk แทนเจ้าของกดให้ทุกครั้ง */}
                  <div className="mt-2 border-t pt-2">
                    <PinField systemId={systemId} employeeId={e.id} hasPin={hasPin(e)} />
                  </div>
                  {/* ลบ = soft delete · ประวัติลงเวลา/ลา/เงินเดือน และนัดเก่ายังอยู่ครบ */}
                  <div className="mt-2 border-t pt-2">
                    <ConfirmDialog
                      triggerLabel="ลบพนักงานคนนี้"
                      triggerClassName="btn-sm min-h-[40px] text-[color:var(--color-danger)]"
                      title={`ลบ ${e.name} ออกจากทะเบียน?`}
                      detail="ประวัติลงเวลา ใบลา สลิปเงินเดือน และนัดที่เคยรับไว้ยังอยู่ครบ (ไม่ได้ลบข้อมูลย้อนหลัง) · คนนี้จะหยุดรับคิวในระบบจองทันที และกู้คืนได้ภายหลัง"
                      confirmLabel="ยืนยันลบ"
                      danger
                      action={removeEmployeeAction}
                      fields={{ systemId, employeeId: e.id }}
                    />
                  </div>
                </details>
              );
            }),
          )}
        </div>
      )}

      {removed.length > 0 && (
        <details className="mt-3 border-t pt-3">
          <summary className={`cursor-pointer text-sm ${muted}`}>พนักงานที่ลบแล้ว ({removed.length})</summary>
          <div className="mt-2 flex flex-col gap-2">
            {removed.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{e.name}</span>
                  {e.position && <span className={`block truncate text-xs ${muted}`}>{e.position}</span>}
                </span>
                {/* HR H1.1 R12 ▸ R12.4: สถานะ "สิ้นสุด" กู้คืนตรง ๆ ไม่ได้ — เปลี่ยนสถานะที่โปรไฟล์ก่อน (action ปฏิเสธซ้ำ) ◂ */}
                {e.employmentStatus === "ENDED" ? (
                  <Link
                    href={`/app/sys/${systemId}/hr/employees/${e.id}`}
                    data-testid={`hr-register-restore-status-${e.id}`}
                    className={`inline-flex min-h-11 items-center text-xs underline ${muted}`}
                  >
                    สถานะสิ้นสุด — เปลี่ยนสถานะที่โปรไฟล์ก่อนกู้คืน
                  </Link>
                ) : (
                  <form action={restoreEmployeeAction}>
                    <input type="hidden" name="systemId" value={systemId} />
                    <input type="hidden" name="employeeId" value={e.id} />
                    <SubmitButton variant="ghost">กู้คืน</SubmitButton>
                  </form>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      <form action={createEmployeeAction} className="mt-1 flex flex-wrap items-end gap-2">
        <input type="hidden" name="systemId" value={systemId} />
        {/* HR H1.1 ▸ สาขาประจำ — ผู้ดูที่จำกัดสาขาเลือกได้เฉพาะสาขาตัวเอง (บังคับ) · ทุกสาขา = ไม่ระบุได้ · action ตรวจซ้ำ ◂ */}
        {(units.length > 0 || !allBranches) && (
          <label className={`flex flex-col gap-1 text-xs ${muted}`}>
            สาขาประจำ
            <select name="unitId" data-testid="hr-register-create-unit" required={!allBranches} defaultValue={allBranches ? "" : (units[0]?.id ?? "")} className="input min-h-11">
              {allBranches && <option value="">ยังไม่ระบุสาขาประจำ</option>}
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={`flex flex-1 flex-col gap-1 text-xs ${muted}`}>
          ชื่อพนักงาน
          <input name="name" required placeholder="เช่น สมชาย ใจดี" className="input min-w-0" />
        </label>
        <label className={`flex flex-col gap-1 text-xs ${muted}`}>
          ตำแหน่ง
          <input name="position" placeholder="เช่น ช่าง" className="input" />
        </label>
        <label className={`flex flex-col gap-1 text-xs ${muted}`}>
          เบอร์โทร
          <input name="phone" inputMode="tel" placeholder="080-000-0000" className="input" />
        </label>
        <SubmitButton variant="ghost">+ เพิ่มพนักงาน</SubmitButton>
      </form>
    </Section>
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
export async function HrHub({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };

  // HR H1.1 ▸ การ์ดนับ = ขอบเขตเดียวกับหน้ารายการ (แถว + สาขา) ◂
  const hv = hrViewerOf(auth);
  const [employees, pending] = await Promise.all([listEmployees(ctx, 200, hrScopeOf(hv)), pendingLeaves(ctx, 100, leaveListScopeOf(hv, hv.userId))]);
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

  const cards = [
    { href: `/app/sys/${systemId}/hr/attendance`, label: "ลงเวลา", desc: "เข้า/ออกงาน + ประวัติ" },
    { href: `/app/sys/${systemId}/hr/leave`, label: "ใบลา", value: `${pending.length} รออนุมัติ`, desc: "อนุมัติ/ยื่นใบลา" },
    { href: `/app/sys/${systemId}/hr/employees`, label: "พนักงาน", value: `${employees.length} คน`, desc: "รายชื่อ + เพิ่มพนักงาน" },
    { href: `/app/sys/${systemId}/hr/payroll`, label: "เงินเดือน", desc: "โปรไฟล์ + รอบจ่าย + สลิป" },
  ];
  // HR H1.2 ▸ R9 หน้าตั้งค่า (กะ · ประเภทการลา · วันหยุด) — OWNER หรือ hr.employee.create ◂
  const canSettings = canManageHrSettings(hv);

  return (
    <div className="flex flex-col gap-5">
      {/* HR H2.10 ▸ แท็บตามผู้ดู ◂ */}
      <ModuleTabs items={await hrTabsFor(systemId)} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
