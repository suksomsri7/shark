import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { listBookings, partialDepositsOf, type PartialDepositRow } from "@/lib/modules/hotel"; // SVC H.8 r3 ▸ แถบมัดจำรับไม่ครบ ◂
import BookingList from "@/components/hotel/BookingList";
import { slipQueue } from "@/lib/payment/slip-verify"; // SVC H.8 ▸ คิวสลิปกลาง (HOTEL) ◂
import { decideHotelSlipAction } from "@/lib/modules/hotel/actions"; // SVC H.8 ◂

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
  // SVC H.8 ▸ แถบ «สลิปรอตรวจ N» — อ่านจากคิวสลิปกลาง (slipQueue · domain HOTEL · ไม่สร้างคิวใหม่) · ไม่มีสิทธิ์ payments.slip.review ⇒ ไม่แสดง ◂
  const sq = await slipQueue({ userId: auth.active.userId }, { tenantId: auth.active.tenantId }, { unitId: unit.id, domain: "HOTEL" });
  const pending = sq.ok ? sq.items : [];
  const rowsNow = r.ok ? r.rows : [];
  const slipMsg = one(sp.slip);
  function codeOf(id: string): string | null {
    for (const row of rowsNow) if (row.id === id) return row.code;
    return null;
  }
  const slipsBar = SlipsBar({ unitSlug, pending, slipMsg, codeOf });
  // SVC H.8 r3 ▸ แถบ «มัดจำรับไม่ครบ N» (อนุมัติสลิปบางส่วน — ผู้ตรวจรอบ 2 B-3) · แสดงเมื่อดูรายการได้ (listBookings ok) ◂
  const partialBar = r.ok ? PartialDepositBar({ unitSlug, rows: await partialDepositsOf(auth.active.tenantId, unit.id) }) : null;
  return (
    <>
    {slipsBar}
    {partialBar}
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
    </>
  );
}

// SVC H.8 ▸ แถบ «สลิปรอตรวจ N» (คิวสลิปกลาง domain HOTEL) — อนุมัติ/ปฏิเสธผ่าน decideHotelSlipAction ◂
type PendingSlip = { id: string; refId: string; expectedSatang: number; createdAt: string };
function SlipsBar({ unitSlug, pending, slipMsg, codeOf }: { unitSlug: string; pending: PendingSlip[]; slipMsg: string; codeOf: (id: string) => string | null }) {
  if (!pending.length && !slipMsg) return null;
  const openAll = Boolean(pending.length) && pending.length < 4;
  return (
    <section className="mx-auto mb-3 w-full max-w-5xl rounded-2xl border border-[color:var(--color-line)] px-4 py-3" data-hotel-slips="">
      <details open={openAll}>
        <summary className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-semibold">
          <span>สลิปรอตรวจ {pending.length}</span>
          {slipMsg ? <span className="text-xs font-normal text-[color:var(--color-muted)]">{slipMsg === "ok" ? "บันทึกผลตรวจแล้ว" : "บันทึกผลไม่สำเร็จ — ตรวจเลขอ้างอิงและเหตุผลแล้วลองอีกครั้ง"}</span> : null}
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          {pending.map((s) => (
            <form key={s.id} action={decideHotelSlipAction} className="flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--color-line)] px-3 py-2 text-sm">
              <input type="hidden" name="unitSlug" value={unitSlug} />
              <input type="hidden" name="slipId" value={s.id} />
              <span className="font-semibold">{codeOf(s.refId) ?? "การจอง"}</span>
              <span className="tabular-nums">฿{(s.expectedSatang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
              <span className="text-xs text-[color:var(--color-muted)]">{new Date(s.createdAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              <span className="flex-1" />
              <input name="transRef" placeholder="เลขอ้างอิงในสลิป" maxLength={64} className="min-h-[40px] w-40 rounded-lg border px-2 text-sm" />
              <input name="reason" placeholder="เหตุผล" maxLength={300} className="min-h-[40px] w-32 rounded-lg border px-2 text-sm" />
              <button name="decision" value="APPROVE" className="btn btn-primary min-h-[40px] px-3 text-sm">อนุมัติ</button>
              <button name="decision" value="REJECT" className="min-h-[40px] rounded-lg border px-3 text-sm">ปฏิเสธ</button>
            </form>
          ))}
        </div>
      </details>
    </section>
    );
}

// SVC H.8 r3 ▸ แถบ «มัดจำรับไม่ครบ N» — มัดจำรับแล้ว X จาก Y · ค้าง Z (ยอดที่ต้องรับเดิมจด policySnapshot.depositRequiredSatang ตอนอนุมัติบางส่วน) ◂
function PartialDepositBar({ unitSlug, rows }: { unitSlug: string; rows: PartialDepositRow[] }) {
  if (!rows.length) return null;
  const baht = (n: number) => (n / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });
  return (
    <section className="mx-auto mb-3 w-full max-w-5xl rounded-2xl border border-[color:var(--color-line)] px-4 py-3" data-hotel-partial-deposit="">
      <div className="flex min-h-[44px] items-center text-sm font-semibold">มัดจำรับไม่ครบ {rows.length}</div>
      <ul className="flex flex-col gap-1 text-sm">
        {rows.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center gap-2">
            <a href={`/app/u/${encodeURIComponent(unitSlug)}/hotel/reservations/${encodeURIComponent(x.id)}`} className="font-semibold underline">{x.code}</a>
            <span className="tabular-nums">มัดจำรับแล้ว ฿{baht(x.paidSatang)} จาก ฿{baht(x.requiredSatang)} · ค้าง ฿{baht(x.dueSatang)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
