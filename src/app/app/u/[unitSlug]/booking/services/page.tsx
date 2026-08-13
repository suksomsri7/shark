import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { serviceRoster } from "@/lib/modules/booking/service";
import { setServiceOfferedAction, importServicesToCatalogAction } from "@/lib/actions/booking";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { formatBaht } from "@/lib/ui/money";

// ฟังก์ชันย่อย "บริการ" ของระบบจอง
// 🔴 มติเจ้าของ 13 ส.ค. 2026 (ข้อ 12-15): ต้นฉบับบริการอยู่ระบบสินค้า/บริการที่เดียว
// หน้านี้เหลือหน้าที่เดียว = ติ๊กว่าสาขานี้เปิดรับจองบริการไหน (ราคา/เวลา/มัดจำ แก้ที่แคตตาล็อก)
export default async function BookingServicesPage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const { rows, catalogSystemId, legacy } = await serviceRoster({
    tenantId: auth.active.tenantId,
    unitId: unit.id,
  });
  const muted = "text-[color:var(--color-muted)]";
  const offeredCount = rows.filter((r) => r.offered).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="บริการ"
        desc="ติ๊กบริการที่สาขานี้เปิดรับจอง — ราคา/เวลา/มัดจำ ตั้งที่ระบบ “สินค้า/บริการ” ที่เดียว"
      />

      {catalogSystemId == null ? (
        <p className="text-sm">
          ยังไม่ได้เปิดระบบ <b>สินค้า/บริการ</b> — เปิดก่อนแล้วเพิ่มบริการที่นั่น แล้วกลับมาติ๊กว่าสาขานี้รับจองอะไร
          <Link href="/app/settings/systems" className="ml-1 underline">
            เปิดระบบ
          </Link>
        </p>
      ) : (
        <>
          <p className={`text-xs ${muted}`}>
            เปิดรับจอง {offeredCount} จาก {rows.length} บริการ ·{" "}
            <Link href={`/app/sys/${catalogSystemId}/inventory/services`} className="underline">
              เพิ่ม/แก้บริการ (ราคา เวลา มัดจำ รูป)
            </Link>
          </p>

          {/* บริการเก่าที่สร้างไว้ก่อนมีแคตตาล็อกกลาง — ย้ายเข้าให้ในคลิกเดียว (นัด/บิลเก่าไม่ถูกแตะ) */}
          {legacy.length > 0 && (
            <form
              action={importServicesToCatalogAction.bind(null, unitSlug)}
              className="card flex flex-wrap items-center justify-between gap-2 p-3"
            >
              <span className={`text-xs ${muted}`}>
                มีบริการเดิม {legacy.length} รายการที่ยังไม่อยู่ในแคตตาล็อกกลาง ({legacy.map((l) => l.name).join(" · ")})
                — ย้ายเข้าให้เพื่อให้แก้ที่เดียวได้ · นัดและบิลเก่าไม่ถูกแตะ
              </span>
              <button className="btn-sm min-h-[40px]">ย้ายเข้าแคตตาล็อก</button>
            </form>
          )}

          {rows.length === 0 ? (
            <p className="text-sm">
              ยังไม่มีบริการในแคตตาล็อก —{" "}
              <Link href={`/app/sys/${catalogSystemId}/inventory/services`} className="underline">
                เพิ่มบริการรายการแรก
              </Link>
            </p>
          ) : (
            <section className="flex flex-col gap-2">
              {rows.map((r) => (
                <div key={r.itemId} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{r.name}</div>
                    <div className={`truncate text-xs ${muted}`}>
                      {r.offered ? "เปิดรับจอง" : "ไม่เปิดรับจอง"} · {formatBaht(r.priceSatang)} · {r.durationMin} นาที
                      {r.depositSatang > 0 ? ` · มัดจำ ${formatBaht(r.depositSatang)}` : ""}
                      {r.bookable ? "" : " · ตั้งไว้ว่าไม่ให้จองล่วงหน้า"}
                      {r.appointmentCount > 0 ? ` · มีนัด ${r.appointmentCount} ใบ` : ""}
                    </div>
                  </div>
                  <form action={setServiceOfferedAction.bind(null, unitSlug)} className="shrink-0">
                    <input type="hidden" name="itemId" value={r.itemId} />
                    <input type="hidden" name="offered" value={r.offered ? "0" : "1"} />
                    <SubmitButton variant={r.offered ? "ghost" : "primary"}>
                      {r.offered ? "ปิดรับจอง" : "เปิดรับจอง"}
                    </SubmitButton>
                  </form>
                </div>
              ))}
              <p className={`text-xs ${muted}`}>
                ปิดรับจอง = ลูกค้าจองบริการนี้ที่สาขานี้ไม่ได้ · นัดที่จองไว้แล้วยังอยู่ครบ (ไม่ถูกยกเลิก)
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
