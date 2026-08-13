import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { ModuleTabs } from "@/components/module-tabs";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { StatusChip } from "@/components/ui/StatusChip";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { formatThaiDate, formatThaiDateTime } from "@/lib/ui/date";
import {
  listAttendance,
  listEmployees,
  getSchedule,
  listLeaves,
  pendingLeaves,
  monthlyAttendance,
  employeesWithSchedule,
  kioskRoster,
  bkkParts,
  type Ctx,
} from "./service";
import {
  clockAction,
  createEmployeeAction,
  setWorkScheduleAction,
  requestLeaveAction,
} from "./actions";
import BulkLeaveApprovals from "./BulkLeaveApprovals";
import PinField from "./PinField";
import KioskClock from "./KioskClock";

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

const LEAVE_TYPE_LABEL: Record<string, string> = {
  SICK: "ลาป่วย",
  PERSONAL: "ลากิจ",
  VACATION: "ลาพักร้อน",
  OTHER: "อื่นๆ",
};

const KIND_LABEL: Record<string, string> = { IN: "เข้างาน", OUT: "ออกงาน" };

// ผลตัดสินการเข้างาน — "ยังไม่ตั้งตาราง" ต้องอ่านออกว่าเป็นข้อมูลที่ร้านยังไม่ได้กรอก ไม่ใช่ความผิดพนักงาน
const JUDGEMENT_LABEL: Record<string, string> = {
  ON_TIME: "ตรงเวลา",
  LATE: "สาย",
  DAY_OFF: "วันหยุดของคนนี้",
  NO_SCHEDULE: "ยังไม่ตั้งตาราง",
};
const judgementTone = (v: string): "muted" | "strong" | "danger" =>
  v === "LATE" ? "danger" : v === "ON_TIME" ? "strong" : "muted";

// ระยะเวลา (นาที) → "8 ชม. 30 น." (ตัด 0 ทิ้งให้อ่านง่าย) — คนละอย่างกับ hhmm ที่เป็น "เวลาบนหน้าปัด"
const durHm = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m} น.` : m === 0 ? `${h} ชม.` : `${h} ชม. ${m} น.`;
};

const monthLabel = () =>
  new Date().toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" });

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
    { href: `${s}/hr/kiosk`, label: "จอลงเวลา" },
    { href: `${s}/hr/leave`, label: "ใบลา" },
    { href: `${s}/hr/employees`, label: "พนักงาน" },
    { href: `${s}/hr/payroll`, label: "เงินเดือน" },
  ];
}

// ───────────── ลงเวลา (attendance) ─────────────
export async function HrAttendanceSection({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };

  const [employees, attendance, scheduled] = await Promise.all([
    listEmployees(ctx),
    listAttendance(ctx),
    employeesWithSchedule(ctx),
  ]);
  // สรุปเดือนนี้ (เวลาไทย) รายคน — ต้องมีตารางก่อน ไม่งั้นไม่มีอะไรให้เทียบ
  // ⚠️ เดือนต้องมาจากวันที่ไทย: ตี 3 ของวันที่ 1 ยังเป็นเดือนก่อนตาม UTC
  const [yy, mm] = bkkParts(new Date()).dateStr.split("-").map(Number);
  const monthStart = new Date(Date.UTC(yy!, mm! - 1, 1));
  const summaries = await Promise.all(
    employees.map(async (e) => ({ emp: e, sum: await monthlyAttendance(ctx, e.id, monthStart) })),
  );

  return (
    <div className="flex flex-col gap-6">
      {/* ลงเวลาเข้า/ออก */}
      <Section title="ลงเวลาวันนี้">
        {employees.length === 0 ? (
          <p className={`text-xs ${muted}`}>เพิ่มพนักงานก่อน แล้วจึงลงเวลาเข้า/ออกได้</p>
        ) : (
          <div className="flex flex-col gap-2">
            {employees.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2"
              >
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
            ))}
          </div>
        )}
      </Section>

      {/* สรุปเดือนนี้ — จุดที่ "ตารางเข้างาน" เริ่มตอบคำถามเจ้าของได้จริง */}
      <Section title={`สรุปเดือน${monthLabel()}`}>
        {employees.length === 0 ? (
          <p className={`text-xs ${muted}`}>ยังไม่มีพนักงาน</p>
        ) : (
          // ⚠️ ไม่ใช้ DataList ที่นี่: secondary ของมันเป็น truncate บรรทัดเดียว → บนมือถือตัวเลข
          //    "ขาดงาน/ลา" ถูกตัดหาย (เห็นจากภาพจริงบน prod) · ตัวเลขสรุปต้องอ่านครบทุกตัว
          <div className="flex flex-col gap-2">
            {summaries.map(({ emp, sum }) => (
              <div key={emp.id} className="rounded-lg border px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate text-sm font-medium">{emp.name}</span>
                  <span className={`shrink-0 text-xs ${muted}`}>
                    ทำงาน {sum.workedMinutes > 0 ? durHm(sum.workedMinutes) : "—"}
                  </span>
                </div>
                {scheduled.has(emp.id) ? (
                  <div className={`mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs ${muted}`}>
                    <span className={sum.lateCount > 0 ? "text-[color:var(--color-danger)]" : ""}>
                      มาสาย {sum.lateCount} ครั้ง
                      {sum.lateMinutes > 0 ? ` (${durHm(sum.lateMinutes)})` : ""}
                    </span>
                    <span className={sum.absentDays > 0 ? "text-[color:var(--color-danger)]" : ""}>
                      ขาดงาน {sum.absentDays} วัน
                    </span>
                    <span>ลา {sum.leaveDays} วัน</span>
                    <span>ต้องเข้า {sum.workDays} วัน</span>
                  </div>
                ) : (
                  <p className={`mt-1 text-xs ${muted}`}>
                    ยังไม่ตั้งตารางเข้างาน — ตั้งที่แท็บ “พนักงาน” แล้วระบบจะเริ่มนับสาย/ขาดให้
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* บันทึกลงเวลาล่าสุด */}
      <Section title="บันทึกลงเวลาล่าสุด">
        <DataList
          items={attendance.map((a) => ({
            key: a.id,
            primary: `${a.employee.name} · ${KIND_LABEL[a.kind] ?? a.kind}`,
            secondary:
              a.kind === "IN" && a.judgement === "LATE" && a.dueMin != null
                ? `ควรเข้า ${hhmm(a.dueMin)} · สาย ${durHm(a.lateMin ?? 0)}`
                : undefined,
            trailing: (
              <>
                {a.kind === "IN" && a.judgement != null && (
                  <StatusChip value={a.judgement} map={JUDGEMENT_LABEL} toneOf={judgementTone} />
                )}
                <span className={`text-xs ${muted}`}>{formatThaiDateTime(a.at)}</span>
              </>
            ),
          }))}
          empty="ยังไม่มีการลงเวลา — กดเข้างาน/ออกงานด้านบนเพื่อเริ่มบันทึก"
        />
      </Section>
    </div>
  );
}

// ───────────── ใบลา (leave) ─────────────
export async function HrLeaveSection({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };

  const [employees, pending, leaves] = await Promise.all([
    listEmployees(ctx),
    pendingLeaves(ctx),
    listLeaves(ctx),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {/* ใบลารออนุมัติ — เลือกหลายใบอนุมัติ/ปฏิเสธพร้อมกันได้ */}
      <Section title={`ใบลารออนุมัติ (${pending.length})`}>
        {pending.length === 0 ? (
          <p className={`text-sm ${muted}`}>ไม่มีใบลารออนุมัติ — คำขอลาของพนักงานจะมาแสดงที่นี่</p>
        ) : (
          <BulkLeaveApprovals
            systemId={systemId}
            items={pending.map((l) => ({
              id: l.id,
              label: `${l.employee.name} · ${LEAVE_TYPE_LABEL[l.type] ?? l.type}`,
              meta: [dateRange(l.fromDate, l.toDate), l.reason].filter(Boolean).join(" · "),
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
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              ประเภท
              <select name="type" className="input" defaultValue="PERSONAL">
                {Object.entries(LEAVE_TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
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
      </Section>

      {/* ประวัติการลา */}
      <Section title="ประวัติการลา">
        <DataList
          items={leaves.map((l) => ({
            key: l.id,
            primary: `${l.employee.name} · ${LEAVE_TYPE_LABEL[l.type] ?? l.type}`,
            secondary: dateRange(l.fromDate, l.toDate),
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

export async function HrEmployeesSection({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };

  const employees = await listEmployees(ctx);

  return (
    <Section title={`พนักงาน (${employees.length})`}>
      <DataList
        items={employees.map((e) => ({
          key: e.id,
          primary: e.name,
          secondary: [e.position, e.phone].filter(Boolean).join(" · ") || undefined,
        }))}
        empty="ยังไม่มีพนักงาน — เพิ่มพนักงานคนแรกเพื่อเริ่มลงเวลาและจัดการวันลา"
      />
      {/* ตารางเวลาทำงานรายคน — เดิมระบบมีแค่ปุ่มลงเวลา ไม่รู้ว่า "ควรเข้ากี่โมง" จึงบอกสาย/ขาดไม่ได้
          ครึ่งวัน = ตั้งเวลาให้สั้นลง (เช่น เสาร์ 09:00-13:00) ไม่ต้องมีชนิดพิเศษให้จำ */}
      {employees.length > 0 && (
        <div className="mt-3 flex flex-col gap-3 border-t pt-3">
          <div>
            <div className="text-sm font-medium">ตารางเข้างาน</div>
            <p className={`text-xs ${muted}`}>
              ติ๊กวันที่ทำงาน แล้วใส่เวลาเข้า-ออก · ครึ่งวันให้ใส่เวลาสั้นลง · วันที่ไม่ติ๊ก = ยังไม่กำหนด (ระบบจะไม่ตัดสินว่าสาย)
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
                    <span className={`ml-2 text-xs font-normal ${muted}`}>
                      {sch.every((x) => x == null)
                        ? "ยังไม่ตั้งตาราง"
                        : `ทำงาน ${sch.filter((x) => x && !x.dayOff).length} วัน/สัปดาห์`}
                    </span>
                  </summary>
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
                    <PinField systemId={systemId} employeeId={e.id} hasPin={!!e.pinCode} />
                  </div>
                </details>
              );
            }),
          )}
        </div>
      )}

      <form action={createEmployeeAction} className="mt-1 flex flex-wrap items-end gap-2">
        <input type="hidden" name="systemId" value={systemId} />
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
  const people = await kioskRoster(ctx);
  const noPin = people.filter((p) => !p.hasPin);

  return (
    <div className="flex flex-col gap-6">
      <Section title="ลงเวลาเอง">
        <KioskClock systemId={systemId} people={people} />
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

  const [employees, pending] = await Promise.all([listEmployees(ctx), pendingLeaves(ctx)]);

  const cards = [
    { href: `/app/sys/${systemId}/hr/attendance`, label: "ลงเวลา", desc: "เข้า/ออกงาน + ประวัติ" },
    { href: `/app/sys/${systemId}/hr/leave`, label: "ใบลา", value: `${pending.length} รออนุมัติ`, desc: "อนุมัติ/ยื่นใบลา" },
    { href: `/app/sys/${systemId}/hr/employees`, label: "พนักงาน", value: `${employees.length} คน`, desc: "รายชื่อ + เพิ่มพนักงาน" },
    { href: `/app/sys/${systemId}/hr/payroll`, label: "เงินเดือน", desc: "โปรไฟล์ + รอบจ่าย + สลิป" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <ModuleTabs items={hrTabs(systemId)} />
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
      </div>
    </div>
  );
}
