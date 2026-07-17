import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import { addServiceAction, removeServiceAction } from "@/lib/actions/booking";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatBaht } from "@/lib/ui/money";

// ฟังก์ชันย่อย "บริการ" ของระบบจอง (แตกออกจากหน้าตั้งค่าเดิม)
export default async function BookingServicesPage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const db = tenantDb({ tenantId: auth.active.tenantId, unitId: unit.id });
  const services = await db.bookingService.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="บริการ" desc="รายการบริการที่เปิดให้ลูกค้าจอง" />

      <section className="flex flex-col gap-3">
        {services.length === 0 && (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีบริการ เพิ่มด้านล่าง</p>
        )}
        {services.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div className="text-sm">
              <span className="font-medium">{s.name}</span>
              <span className="text-[color:var(--color-muted)]">
                {" "}
                · {s.durationMin} นาที · {s.priceSatang > 0 ? formatBaht(s.priceSatang) : "—"}
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
          className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
        >
          <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
            <span className="text-xs text-[color:var(--color-muted)]">ชื่อบริการ</span>
            <input name="name" required placeholder="เช่น ตัดผม" className="w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">นาที</span>
            <input name="durationMin" type="number" required defaultValue={30} min={5} className="w-full rounded-lg border px-2 py-2 text-sm sm:w-20" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">ราคา (บาท)</span>
            <input name="priceBaht" type="number" defaultValue={0} min={0} className="w-full rounded-lg border px-2 py-2 text-sm sm:w-24" />
          </label>
          <button className="btn btn-primary col-span-2 text-sm sm:col-span-1">เพิ่ม</button>
        </form>
      </section>

      {/* ลิงก์หน้าจองสาธารณะ */}
      <section className="card flex flex-col gap-2">
        <div className="text-sm font-medium">ลิงก์จองสำหรับลูกค้า</div>
        <code className="break-all rounded bg-[color:var(--color-surface-2)] px-2 py-1 text-xs">
          /s/{auth.active.tenant.slug}/{unit.slug}
        </code>
        <Link href={`/s/${auth.active.tenant.slug}/${unit.slug}`} target="_blank" className="text-sm underline">
          เปิดหน้าจอง →
        </Link>
      </section>
    </div>
  );
}
