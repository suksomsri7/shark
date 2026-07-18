import { requireTenant } from "@/lib/core/context";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { StatusChip } from "@/components/ui/StatusChip";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { formatThaiDate, formatThaiDateTime } from "@/lib/ui/date";
import {
  listAttendance,
  listEmployees,
  listLeaves,
  pendingLeaves,
  type Ctx,
} from "./service";
import {
  clockAction,
  createEmployeeAction,
  requestLeaveAction,
} from "./actions";
import { PayrollSection } from "./payroll-ui";
import BulkLeaveApprovals from "./BulkLeaveApprovals";

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

const dateRange = (from: Date, to: Date) =>
  from.getTime() === to.getTime()
    ? formatThaiDate(from)
    : `${formatThaiDate(from)} – ${formatThaiDate(to)}`;

// ───────────── HrContent (ฝังในหน้า /app/sys/[id]) ─────────────
export async function HrContent({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };

  const [employees, pending, leaves, attendance] = await Promise.all([
    listEmployees(ctx),
    pendingLeaves(ctx),
    listLeaves(ctx),
    listAttendance(ctx),
  ]);

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

      {/* บันทึกลงเวลาล่าสุด */}
      <Section title="บันทึกลงเวลาล่าสุด">
        <DataList
          items={attendance.map((a) => ({
            key: a.id,
            primary: `${a.employee.name} · ${KIND_LABEL[a.kind] ?? a.kind}`,
            trailing: <span className={`text-xs ${muted}`}>{formatThaiDateTime(a.at)}</span>,
          }))}
          empty="ยังไม่มีการลงเวลา — กดเข้างาน/ออกงานด้านบนเพื่อเริ่มบันทึก"
        />
      </Section>

      {/* รายชื่อพนักงาน */}
      <Section title={`พนักงาน (${employees.length})`}>
        <DataList
          items={employees.map((e) => ({
            key: e.id,
            primary: e.name,
            secondary: [e.position, e.phone].filter(Boolean).join(" · ") || undefined,
          }))}
          empty="ยังไม่มีพนักงาน — เพิ่มพนักงานคนแรกเพื่อเริ่มลงเวลาและจัดการวันลา"
        />
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

      {/* เงินเดือน (Payroll) — โปรไฟล์ + รอบจ่าย + สลิป */}
      <PayrollSection systemId={systemId} />
    </div>
  );
}

export default HrContent;
