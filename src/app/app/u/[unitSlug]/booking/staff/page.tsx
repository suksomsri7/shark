import { requireUnit } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import { addStaffAction, removeStaffAction } from "@/lib/actions/booking";
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
  const staff = await db.bookingStaff.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="พนักงาน / ผู้ให้บริการ" desc="ผู้ให้บริการที่รับนัดได้" />

      <p className="text-xs text-[color:var(--color-muted)]">
        ค่าเริ่มต้นทำงานทุกวัน 10:00–20:00 (แก้เวลารายคนได้ในเวอร์ชันถัดไป)
      </p>
      <section className="flex flex-col gap-3">
        {staff.length === 0 && (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีพนักงาน เพิ่มด้านล่าง</p>
        )}
        {staff.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
            <span className="text-sm font-medium">{s.name}</span>
            <form action={removeStaffAction.bind(null, unitSlug)}>
              <input type="hidden" name="id" value={s.id} />
              <button className="text-xs text-[color:var(--color-danger)] underline">ลบ</button>
            </form>
          </div>
        ))}
        <form action={addStaffAction.bind(null, unitSlug)} className="flex gap-2">
          <input name="name" required placeholder="ชื่อพนักงาน" className="flex-1 rounded-lg border px-3 py-2 text-sm" />
          <button className="btn btn-primary text-sm">เพิ่ม</button>
        </form>
      </section>
    </div>
  );
}
