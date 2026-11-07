import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { getFolio } from "@/lib/modules/hotel";
import { ITEM_TYPE_TH, bahtTh, chargesOf, dayTh, groupItems, taxNoteTh } from "@/components/hotel/folio-shared";

// SVC H.5 ▸ พิมพ์รายการบิลระหว่างพัก (guest bill · ใบสั่ง h.5 §4) — หน่วย HOTEL · getFolio ผ่าน facade (สิทธิ์อ่าน folio · ข้ามร้าน/หน่วย ⇒ notFound)
//   ไม่ใช่ใบกำกับภาษี (ใบกำกับเต็มรูปออกจากบิล POS ตอนเช็กเอาต์) · ไม่มีเบอร์/อีเมลแขก
export default async function HotelFolioPrintPage({ params }: { params: Promise<{ unitSlug: string; id: string }> }) {
  const { unitSlug, id } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") notFound();
  const actor = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
    userId: auth.active.userId,
  };
  const r = await getFolio(actor, { tenantId: auth.active.tenantId }, { reservationId: id, unitId: unit.id });
  if (!r.ok) notFound();
  const f = r.folio;
  return (
    <article data-folio-print={f.status} className="mx-auto flex w-full max-w-3xl flex-col gap-4 bg-white p-6 text-sm text-black print:p-0">
      <header className="flex flex-col gap-1 border-b border-black/20 pb-3">
        <h1 className="text-lg font-bold">รายการบิลระหว่างพัก (folio) · {unit.name}</h1>
        <p>
          รหัสจอง {f.reservation.code}
          {f.reservation.roomNumber ? ` · ห้อง ${f.reservation.roomNumber}` : ""} · {f.reservation.roomTypeName} · เข้าพัก {dayTh(f.reservation.checkIn)} – เช็กเอาต์ {dayTh(f.reservation.checkOut)}
        </p>
        <p className="text-xs">เอกสารนี้เป็นรายการประกอบ ไม่ใช่ใบกำกับภาษี — ใบเสร็จ/ใบกำกับภาษีออกจากระบบขายหน้าร้าน (POS) ตอนเช็กเอาต์</p>
      </header>
      {groupItems(f.items).map((g) => (
        <section key={g.key} className="flex flex-col gap-1">
          <h2 className="font-bold">{g.labelTh}</h2>
          <table className="w-full">
            <tbody>
              {g.items.map((i) => (
                <tr key={i.id} className={i.voidedAt ? "line-through opacity-60" : ""}>
                  <td className="w-20 py-1 pr-2 align-top text-xs sm:w-24 sm:text-sm">{dayTh(i.businessDate)}</td>
                  <td className="py-1 pr-2 align-top">
                    {i.description}
                    {i.qty > 1 ? ` × ${i.qty}` : ""}
                    {i.type === "VOID_REVERSAL" ? ` (${ITEM_TYPE_TH.VOID_REVERSAL})` : ""}
                  </td>
                  <td className="w-24 whitespace-nowrap py-1 text-right align-top tabular-nums sm:w-28">{bahtTh(i.amountSatang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <footer className="flex flex-col gap-1 border-t border-black/20 pt-3">
        <p className="flex justify-between font-bold">
          <span>ยอดชำระ</span>
          <span>฿{bahtTh(chargesOf(f))}</span>
        </p>
        <p className="text-xs">{taxNoteTh(f)}</p>
        <p className="flex justify-between">
          <span>คงค้าง</span>
          <span>฿{bahtTh(f.balanceSatang)}</span>
        </p>
      </footer>
    </article>
  );
}
