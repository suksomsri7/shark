import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { addDaysYmd, isYmd, rr4Register } from "@/lib/modules/hotel";
import { ID_TYPE_LABEL, dateLongTh, dateTimeTh } from "@/components/hotel/checkin-shared";

// SVC H.4 ▸ ทะเบียนผู้พัก (ร.ร.4) แบบพิมพ์ — แถว ร.ร.3 ของหน่วยที่วันเข้าอยู่ในช่วง from–to เรียงตามเลขบัตร (rr4Register)
//   พ.ร.บ.โรงแรม 2547 ม.35 · เก็บไม่น้อยกว่า 1 ปี · ส่งสำเนาให้นายทะเบียนตามรอบที่กฎหมายกำหนด (ระบบเตือน ไม่ส่งเอง)
//   "PDF" = คำสั่งพิมพ์ของเบราว์เซอร์ (ไม่มีไลบรารี PDF) · เลขเอกสาร = 4 ตัวท้าย · หน่วย "HOTEL" + สิทธิ์จาก session ไม่ผ่าน ⇒ notFound
type PageParams = Promise<{ unitSlug: string }>;
type Search = { from?: string | string[]; to?: string | string[] };
type PageSearch = Promise<Search>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function HotelRr4PrintPage({ params, searchParams }: { params: PageParams; searchParams?: PageSearch }) {
  const { unitSlug } = await params;
  const sp = (await searchParams) ?? {};
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") notFound();
  const m = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  const can = (action: string) => evaluate(m, { module: "hotel", action, unitId: unit.id });
  if (!(can("hotel.guest.register") || can("hotel.guest.viewId"))) notFound();
  const today = bkkYmd(new Date());
  const to = isYmd(one(sp.to)) ? one(sp.to) : today;
  const from = isYmd(one(sp.from)) ? one(sp.from) : addDaysYmd(to, -7);
  const r = await rr4Register({ tenantId: auth.active.tenantId }, { unitId: unit.id, from, to });
  if (!r.ok) notFound();
  return (
    <article data-rr4-print="" className="mx-auto flex w-full min-w-0 max-w-[297mm] flex-col gap-3 bg-[color:var(--color-surface)] p-6 print:p-0">
      <header className="flex flex-wrap items-baseline justify-between gap-2 print:hidden">
        <a href={`/app/u/${unitSlug}/hotel/guests?from=${from}&to=${to}`} className="text-xs text-[color:var(--color-muted)]">
          ← ทะเบียนผู้พัก
        </a>
        <p className="text-xs text-[color:var(--color-muted)]">สั่งพิมพ์จากเบราว์เซอร์ แล้วเลือก “บันทึกเป็น PDF” เพื่อเก็บเป็นไฟล์</p>
      </header>
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-lg font-bold">ทะเบียนผู้พัก (ร.ร.4)</h1>
        <p className="text-sm">
          {r.hotel.licenseName ?? r.hotel.name} · ใบอนุญาตเลขที่ {r.hotel.licenseNo ?? "—"}
        </p>
        <p className="text-xs text-[color:var(--color-muted)]">
          ผู้พักที่เข้าพักระหว่าง {dateLongTh(from)} ถึง {dateLongTh(to)} · {r.rows.length} คน
          {r.hotel.registrarOffice ? ` · ส่งสำเนาให้ ${r.hotel.registrarOffice} ตามรอบที่กฎหมายกำหนด` : ""}
        </p>
      </div>
      <div data-scroll-hint="" className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-[color:var(--color-ink)] text-left">
              <th className="py-1 pr-2">เลขที่บัตร</th>
              <th className="py-1 pr-2">ชื่อตัว ชื่อสกุล</th>
              <th className="py-1 pr-2">สัญชาติ</th>
              <th className="py-1 pr-2">เอกสาร</th>
              <th className="py-1 pr-2">ห้อง</th>
              <th className="py-1 pr-2">วันเวลาเข้าพัก</th>
              <th className="py-1 pr-2">วันออก</th>
              <th className="py-1 pr-2">มาจาก → จะไปที่</th>
              <th className="py-1 pr-2">ลงชื่อ</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((x) => (
              <tr key={x.guestId} className="border-b border-[color:var(--color-line)] align-top">
                <td className="py-1 pr-2 whitespace-nowrap">{x.cardNo}</td>
                <td className="py-1 pr-2">{x.fullName}</td>
                <td className="py-1 pr-2">{x.nationalityTh ?? x.nationality ?? "—"}</td>
                <td className="py-1 pr-2 whitespace-nowrap">
                  {x.idType ? (ID_TYPE_LABEL[x.idType] ?? x.idType) : "—"} {x.idMasked}
                </td>
                <td className="py-1 pr-2">{x.roomNumber ?? "—"}</td>
                <td className="py-1 pr-2 whitespace-nowrap">{x.checkedInAt ? dateTimeTh(x.checkedInAt) : dateLongTh(x.checkIn)}</td>
                <td className="py-1 pr-2 whitespace-nowrap">{dateLongTh(x.checkOut)}</td>
                <td className="py-1 pr-2">
                  {x.arrivedFrom ?? "—"} → {x.nextDestination ?? "—"}
                </td>
                <td className="py-1 pr-2">{x.signed ? "ลงชื่อแล้ว" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="mt-8 grid grid-cols-2 gap-8 text-sm">
        <p className="border-t border-[color:var(--color-ink)] pt-2 text-center">ลงชื่อ ผู้จัดการโรงแรม</p>
        <p className="border-t border-[color:var(--color-ink)] pt-2 text-center">วันที่</p>
      </footer>
    </article>
  );
}
