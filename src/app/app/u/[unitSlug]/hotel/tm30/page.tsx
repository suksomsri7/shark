import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { tm30Queue } from "@/lib/modules/hotel";
import Tm30Queue from "@/components/hotel/Tm30Queue";
import { tm30OverdueCount } from "@/components/hotel/checkin-shared";

// SVC H.4 ▸ คิว "ต้องแจ้งที่พักคนต่างด้าว (ตม.30) ภายใน 24 ชม." (พ.ร.บ.คนเข้าเมือง 2522 ม.38) — tm30Queue (ผ่าน facade)
//   หน่วย "HOTEL" + สิทธิ์จาก session ไม่ผ่าน ⇒ notFound · ผู้มีสิทธิ์ทะเบียนเลือกหลายคน → ไฟล์สำหรับอัปโหลด + เลขรับแจ้ง · อื่น = ดูอย่างเดียว
export default async function HotelTm30Page({ params }: { params: Promise<{ unitSlug: string }> }) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") notFound();
  const m = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  const can = (action: string) => evaluate(m, { module: "hotel", action, unitId: unit.id });
  if (!(can("hotel.guest.register") || can("hotel.guest.viewId") || can("hotel.reservation.checkIn"))) notFound();
  const q = await tm30Queue({ tenantId: auth.active.tenantId }, { unitId: unit.id });
  if (!q.ok) notFound();
  // รอบ 6 ▸ "เกินกำหนด" นับ LATE + PENDING ที่ครบกำหนดแล้ว (sweep ทุก 15 นาทียังไม่วิ่ง) — จอเท่านั้น ไม่เปลี่ยนสถานะในฐาน ◂
  const nowMs = Date.now();
  const overdue = tm30OverdueCount(q.items, nowMs);
  const waiting = Math.max(0, q.pending + q.late - overdue);
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-bold">แจ้งที่พักคนต่างด้าว (ตม.30)</h1>
          <p className="text-sm text-[color:var(--color-muted)]">
            ต้องแจ้งภายใน 24 ชม. หลังเข้าพัก · รอแจ้ง {waiting} คน · <span className={overdue ? "font-bold text-rose-700" : ""}>เกินกำหนด {overdue} คน</span> · ระบบเตรียมไฟล์ให้ พนักงานส่งเข้าเว็บ ตม. เอง
          </p>
        </div>
        <a href={`/app/u/${unitSlug}/hotel/guests`} className="rounded-xl border border-[color:var(--color-line)] px-3 py-2 text-sm">
          ทะเบียนผู้พัก
        </a>
      </header>
      <Tm30Queue unitSlug={unitSlug} items={q.items} canFile={can("hotel.guest.register")} nowMs={nowMs} />
    </div>
  );
}
