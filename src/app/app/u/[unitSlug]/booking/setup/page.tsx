import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import {
  addServiceAction,
  removeServiceAction,
  addStaffAction,
  removeStaffAction,
} from "@/lib/actions/booking";

const baht = (s: number) => (s / 100).toLocaleString("th-TH");

export default async function BookingSetupPage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const db = tenantDb({ tenantId: auth.active.tenantId, unitId: unit.id });
  const [services, staff] = await Promise.all([
    db.bookingService.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } }),
    db.bookingStaff.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-[color:var(--color-muted)]">{unit.name}</div>
          <h1 className="text-2xl font-semibold">ตั้งค่าจองคิว</h1>
        </div>
        <Link href={`/app/u/${unitSlug}/booking`} className="btn btn-ghost text-sm">
          ← รายการนัด
        </Link>
      </div>

      {/* บริการ */}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">บริการ</h2>
        {services.length === 0 && (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีบริการ เพิ่มด้านล่าง</p>
        )}
        {services.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div className="text-sm">
              <span className="font-medium">{s.name}</span>
              <span className="text-[color:var(--color-muted)]">
                {" "}
                · {s.durationMin} นาที · {s.priceSatang > 0 ? `฿${baht(s.priceSatang)}` : "—"}
              </span>
            </div>
            <form action={removeServiceAction.bind(null, unitSlug)}>
              <input type="hidden" name="id" value={s.id} />
              <button className="text-xs text-[color:var(--color-danger)] underline">ลบ</button>
            </form>
          </div>
        ))}
        <form
          action={addServiceAction.bind(null, unitSlug)}
          className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2"
        >
          <input name="name" required placeholder="ชื่อบริการ เช่น ตัดผมชาย" className="rounded-lg border px-3 py-2 text-sm" />
          <input name="durationMin" type="number" required defaultValue={30} min={5} className="w-20 rounded-lg border px-2 py-2 text-sm" title="นาที" />
          <input name="priceBaht" type="number" defaultValue={0} min={0} className="w-24 rounded-lg border px-2 py-2 text-sm" title="ราคา (บาท)" />
          <button className="btn btn-primary text-sm">เพิ่ม</button>
        </form>
        <div className="text-xs text-[color:var(--color-muted)]">ช่อง: ชื่อ · นาที · ราคา(บาท)</div>
      </section>

      {/* ช่าง */}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">ช่าง / พนักงาน</h2>
        <p className="text-xs text-[color:var(--color-muted)]">
          ค่าเริ่มต้นทำงานทุกวัน 10:00–20:00 (แก้เวลารายคนได้ในเวอร์ชันถัดไป)
        </p>
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
          <input name="name" required placeholder="ชื่อช่าง" className="flex-1 rounded-lg border px-3 py-2 text-sm" />
          <button className="btn btn-primary text-sm">เพิ่ม</button>
        </form>
      </section>

      {/* ลิงก์หน้าจองสาธารณะ */}
      <section className="card flex flex-col gap-2">
        <div className="text-sm font-medium">ลิงก์จองสำหรับลูกค้า</div>
        <code className="break-all rounded bg-[color:var(--color-surface-2)] px-2 py-1 text-xs">
          /s/{auth.active.tenant.slug}/{unit.slug}
        </code>
        <Link
          href={`/s/${auth.active.tenant.slug}/${unit.slug}`}
          target="_blank"
          className="text-sm underline"
        >
          เปิดหน้าจอง →
        </Link>
      </section>
    </div>
  );
}
