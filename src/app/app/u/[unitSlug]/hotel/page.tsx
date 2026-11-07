import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { dashboardData, assignableRooms } from "@/lib/modules/hotel/service";
import { checkInAction, checkOutAction } from "@/lib/modules/hotel/actions";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { hotelToday } from "@/lib/modules/hotel"; // SVC H.2 ▸ KPI หน้าเคาน์เตอร์ (ภาพ 08 แถบบน) ◂
import { pendingAuditDays } from "@/lib/modules/hotel"; // SVC H.7 ▸ ป้ายยังไม่ปิดวัน ◂
import { fmtThaiDate } from "@/components/hotel/reports-shared"; // SVC H.7 ◂
import HotelToday from "@/components/hotel/HotelToday";

function fmtDate(d: Date) {
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default async function HotelPage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") notFound(); // SVC H.0 ▸ ด่าน type HOTEL ◂
  const [data, kpi, audit] = await Promise.all([
    dashboardData(auth.active.tenantId, unit.id),
    hotelToday({ tenantId: auth.active.tenantId }, { unitId: unit.id }),
    pendingAuditDays({ tenantId: auth.active.tenantId }, { unitId: unit.id }), // SVC H.7 ◂
  ]);
  // SVC H.7 ▸ ค้างปิดวันเกิน 1 วัน (เริ่มใช้ night audit แล้ว) ⇒ ป้าย + ลิงก์หน้าปิดวัน ◂
  const auditBehind = audit.ok && audit.started && audit.daysBehind > 1 ? audit.pendingDate : null;

  // ห้องที่ assign ได้ต่อการจองที่ถึงวันนี้ (เพื่อ dropdown เช็คอิน)
  const arrivalRooms = await Promise.all(
    data.arrivals.map((a) => {
      return assignableRooms(auth.active.tenantId, unit.id, a.id);
    }),
  );

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="โรงแรม · วันนี้"
        back={{ href: `/app/u/${unitSlug}`, label: unit.name }}
        actions={
          <>
            <Link href={`/app/u/${unitSlug}/hotel/reservations`} className="btn btn-ghost text-sm">
              การจอง
            </Link>
            <Link href={`/app/u/${unitSlug}/hotel/setup`} className="btn btn-ghost text-sm">
              ตั้งค่า
            </Link>
          </>
        }
      />
      {/* SVC H.3 ▸ ถอดแท็บโมดูลซ้อน (แท็บโรงแรมอยู่ที่ layout · หนี้ H.1 · มติผู้คุม §11 ข้อ 6) ◂ */}

      {/* SVC H.2 ▸ KPI 5 การ์ด (เข้าวันนี้ · ออกวันนี้ · พักอยู่คืนนี้ · แม่บ้าน · สัปดาห์นี้ + ADR) แทนสรุปสถานะห้องเดิม ◂ */}
      {kpi.ok ? <HotelToday kpi={kpi} /> : null}

      {/* SVC H.7 ▸ ป้ายยังไม่ปิดวัน (ค้าง > 1 วัน) ◂ */}
      {auditBehind ? (
        <div data-audit-behind="" className="flex flex-wrap items-center gap-3 rounded-xl border border-[color:var(--color-danger)] p-3 text-sm">
          <span className="flex-1">{`ยังไม่ปิดวัน ${fmtThaiDate(auditBehind)} — ค้างปิดวันหลายวัน ตัวเลขรายงานยังไม่นิ่ง`}</span>
          <Link href={`/app/u/${unitSlug}/hotel/reports/audit`} className="btn btn-ghost text-sm">
            ไปหน้าปิดวัน
          </Link>
        </div>
      ) : null}

      {/* ถึงวันนี้ — เช็คอิน */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">ถึงวันนี้ ({data.arrivals.length})</h2>
        {data.arrivals.length === 0 ? (
          <EmptyState text="ไม่มีแขกเข้าพักวันนี้" />
        ) : (
          data.arrivals.map((a, i) => {
            const rooms = arrivalRooms[i];
            return (
              <div key={a.id} className="rounded-xl border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">
                      {a.guestName} · {a.roomType.name}
                    </div>
                    <div className="text-xs text-[color:var(--color-muted)]">
                      {a.code} · {a.nights} คืน · ถึง {fmtDate(a.checkOutDate)} · {a.guestPhone ?? "—"}
                    </div>
                  </div>
                </div>
                {rooms.length === 0 ? (
                  <p className="mt-2 text-xs text-[color:var(--color-danger)]">
                    ไม่มีห้องว่างให้เช็คอิน — ตรวจสถานะห้องที่ «ตั้งค่า»
                  </p>
                ) : (
                  <form
                    action={checkInAction.bind(null, unitSlug)}
                    className="mt-2 flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="id" value={a.id} />
                    <select name="roomId" className="rounded-lg border px-2 py-2 text-sm">
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          ห้อง {r.number}
                          {r.floor ? ` (ชั้น ${r.floor})` : ""}
                        </option>
                      ))}
                    </select>
                    <SubmitButton variant="ghost">เช็คอิน</SubmitButton>
                  </form>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* ออกวันนี้ + พักอยู่ — เช็คเอาท์ */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">กำลังพัก ({data.inHouse.length})</h2>
        {data.inHouse.length === 0 ? (
          <EmptyState text="ยังไม่มีแขกเช็คอิน" />
        ) : (
          data.inHouse.map((a) => {
            const leavingToday = data.departures.some((d) => {
              return d.id === a.id;
            });
            return (
              <div key={a.id} className="rounded-xl border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">
                      {a.guestName} · ห้อง {a.room?.number ?? "—"}
                    </div>
                    <div className="text-xs text-[color:var(--color-muted)]">
                      {a.code} · {a.roomType.name} · ออก {fmtDate(a.checkOutDate)}
                      {leavingToday ? " · ออกวันนี้" : ""}
                    </div>
                  </div>
                  <ConfirmDialog
                    triggerLabel="เช็คเอาท์"
                    triggerClassName="btn-sm"
                    title="เช็คเอาท์ห้องนี้?"
                    detail="ระบบจะปิดการเข้าพักและปล่อยห้องให้ว่าง"
                    confirmLabel="ยืนยันเช็คเอาท์"
                    danger
                    action={checkOutAction.bind(null, unitSlug)}
                    fields={{ id: a.id }}
                  />
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
