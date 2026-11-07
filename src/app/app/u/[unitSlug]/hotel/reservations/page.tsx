import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { listBookings } from "@/lib/modules/hotel";
import BookingList from "@/components/hotel/BookingList";

type SearchP = Promise<{ [k: string]: string | string[] | undefined }>;
const one = (v: string | string[] | undefined): string => (typeof v === "string" ? v : "");

// SVC H.3 ▸ รายการการจอง (ใบสั่ง h.3 §4) — หน่วย HOTEL เท่านั้น · ผู้กระทำ/สิทธิ์จาก session · URL ใช้กรองรายการเท่านั้น
//   ปุ่ม «จองใหม่» ⇔ hotel.reservation.create · ไม่มี ModuleTabs ซ้อน (แท็บโรงแรมอยู่ที่ layout)
export default async function HotelReservationsPage({ params, searchParams }: { params: Promise<{ unitSlug: string }>; searchParams: SearchP }) {
  const { unitSlug } = await params;
  const sp = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") notFound();
  const actor = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
    userId: auth.active.userId,
  };
  const filters = { status: one(sp.status), source: one(sp.source), from: one(sp.from), to: one(sp.to), q: one(sp.q) };
  const page = Math.max(1, Math.trunc(Number(one(sp.page)) || 1));
  const r = await listBookings(actor, { tenantId: auth.active.tenantId }, {
    unitId: unit.id,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(filters.q ? { q: filters.q } : {}),
    page,
    pageSize: 50,
  });
  if (!r.ok && r.code === "NOT_FOUND") notFound();
  const canCreate = evaluate(actor, { module: "hotel", action: "hotel.reservation.create", unitId: unit.id });
  return (
    <BookingList
      unitSlug={unitSlug}
      rows={r.ok ? r.rows : []}
      total={r.ok ? r.total : 0}
      page={r.ok ? r.page : 1}
      pageSize={r.ok ? r.pageSize : 50}
      filters={filters}
      canCreate={canCreate}
      nowMs={Date.now()}
    />
  );
}
