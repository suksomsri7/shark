import { requireUnit } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import { addStaffAction, removeStaffAction, linkStaffToHrAction } from "@/lib/actions/booking";
import { listLinkableEmployees } from "@/lib/modules/booking/service";
import { PageHeader } from "@/components/ui/PageHeader";

// ฟังก์ชันย่อย "พนักงาน / ผู้ให้บริการ" ของระบบจอง (แตกออกจากหน้าตั้งค่าเดิม)
export default async function BookingStaffPage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const db = tenantDb({ tenantId: auth.active.tenantId, unitId: unit.id });
  const [staff, employees] = await Promise.all([
    db.bookingStaff.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } }),
    listLinkableEmployees(auth.active.tenantId),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="พนักงาน / ผู้ให้บริการ"
        desc="ใครรับนัดได้บ้าง — เป็นคนเดียวกับทะเบียนพนักงานใน “ทีมงาน” ไม่ต้องกรอกซ้ำสองที่"
      />

      <p className="text-xs text-[color:var(--color-muted)]">
        เวลาทำการใช้ตาม “เวลาทำการ” ของร้าน (แท็บด้านบน) · ตารางเข้างานรายคนตั้งที่ระบบทีมงาน
      </p>

      {/* ช่างที่เพิ่มไว้ก่อนมีการเชื่อม = ยังไม่อยู่ในทะเบียนพนักงาน → ลงเวลา/เงินเดือนไม่ได้ */}
      {staff.some((s) => !s.employeeId) && (
        <form action={linkStaffToHrAction.bind(null, unitSlug)} className="card flex flex-wrap items-center justify-between gap-2 p-3">
          <span className="text-xs text-[color:var(--color-muted)]">
            มีพนักงาน {staff.filter((s) => !s.employeeId).length} คนที่ยังไม่อยู่ในทะเบียนทีมงาน —
            ขึ้นทะเบียนให้อัตโนมัติเพื่อใช้ลงเวลา/ตารางงาน/เงินเดือนได้
          </span>
          <button className="btn-sm min-h-[40px]">ขึ้นทะเบียนให้</button>
        </form>
      )}
      <section className="flex flex-col gap-3">
        {staff.length === 0 && (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีพนักงาน เพิ่มด้านล่าง</p>
        )}
        {staff.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              {s.name}
              {s.employeeId && (
                <span className="rounded-full bg-[color:var(--color-muted)]/15 px-2 py-0.5 text-[10px] text-[color:var(--color-muted)]">
                  ในทะเบียนทีมงาน
                </span>
              )}
            </span>
            <form action={removeStaffAction.bind(null, unitSlug)}>
              <input type="hidden" name="id" value={s.id} />
              <button className="text-xs text-[color:var(--color-danger)] underline">ลบ</button>
            </form>
          </div>
        ))}
        <form action={addStaffAction.bind(null, unitSlug)} className="flex flex-col gap-2">
          {employees.length > 0 && (
            <select name="employeeId" className="rounded-lg border px-3 py-2 text-sm" defaultValue="">
              <option value="">เลือกจากพนักงาน HR (ไม่บังคับ) — พิมพ์ชื่อเอง</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.position ? ` · ${e.position}` : ""}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <input
              name="name"
              placeholder="ชื่อพนักงาน (ถ้าไม่ได้เลือกจาก HR)"
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
            />
            <button className="btn btn-primary text-sm">เพิ่ม</button>
          </div>
        </form>
      </section>
    </div>
  );
}
