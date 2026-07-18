import { requireUnit } from "@/lib/core/context";
import { listAssets, listBookings } from "@/lib/modules/rental/service";
import {
  createAssetAction,
  toggleAssetAction,
  createBookingAction,
  pickUpAction,
  returnAction,
  cancelAction,
  refundRentalAction,
  recordRentalDepositAction,
} from "@/lib/modules/rental/actions";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const baht = (satang: number) => (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 0 });
const fmtDate = (d: Date) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  BOOKED: { text: "จองแล้ว", cls: "text-blue-600" },
  PICKED_UP: { text: "รับไปแล้ว", cls: "text-amber-600" },
  RETURNED: { text: "คืนแล้ว", cls: "text-green-600" },
  CANCELLED: { text: "ยกเลิก", cls: "text-[color:var(--color-muted)]" },
  REFUNDED: { text: "คืนเงินแล้ว", cls: "text-rose-600" },
};

// จัดการเช่าสินทรัพย์ — /app/u/[unitSlug]/rental (สินทรัพย์ + จอง + รับ/คืน/ยกเลิก)
export default async function RentalManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ unitSlug: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { unitSlug } = await params;
  const { err } = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };
  const [assets, bookings] = await Promise.all([listAssets(ctx, {}), listBookings(ctx, {})]);
  const activeAssets = assets.filter((a) => a.active);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <div className="text-sm text-[color:var(--color-muted)]">🛵 เช่าสินทรัพย์</div>
        <h1 className="text-2xl font-semibold">{unit.name}</h1>
      </div>

      {err && (
        <div className="rounded-lg border border-[color:var(--color-danger)] bg-rose-50 px-3 py-2 text-sm text-[color:var(--color-danger)]">
          {err}
        </div>
      )}

      {/* เพิ่มสินทรัพย์ */}
      <form action={createAssetAction.bind(null, unitSlug)} className="card flex flex-col gap-3">
        <h2 className="text-sm font-medium">เพิ่มสินทรัพย์ให้เช่า</h2>
        <input name="name" required maxLength={120} placeholder="ชื่อสินทรัพย์ (เช่น มอเตอร์ไซค์ A)" className="rounded-lg border px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <input name="dailyRateBaht" required type="number" min={0} step="0.01" placeholder="ค่าเช่า/วัน (บาท)" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" />
          <input name="depositBaht" type="number" min={0} step="0.01" placeholder="มัดจำ (บาท)" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" />
        </div>
        <input name="code" maxLength={60} placeholder="รหัส/ทะเบียน (ถ้ามี)" className="rounded-lg border px-3 py-2 text-sm" />
        <button className="btn btn-primary text-sm">บันทึกสินทรัพย์</button>
      </form>

      {/* รายการสินทรัพย์ */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">สินทรัพย์ทั้งหมด ({assets.length})</h2>
        {assets.length === 0 && <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีสินทรัพย์</p>}
        {assets.map((a) => (
          <div key={a.id} className="card flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-medium">
                {a.name} {!a.active && <span className="text-xs text-[color:var(--color-muted)]">(ปิดใช้)</span>}
              </div>
              <div className="text-sm text-[color:var(--color-muted)]">
                ฿{baht(a.dailyRateSatang)}/วัน
                {a.depositSatang > 0 && ` · มัดจำ ฿${baht(a.depositSatang)}`}
                {a.code && ` · ${a.code}`}
              </div>
            </div>
            <form action={toggleAssetAction.bind(null, unitSlug, a.id, !a.active)}>
              <button className="rounded-full border px-3 py-1 text-xs hover:bg-[color:var(--color-surface-2)]">
                {a.active ? "ปิดใช้" : "เปิดใช้"}
              </button>
            </form>
          </div>
        ))}
      </section>

      {/* จองใหม่ */}
      {activeAssets.length > 0 && (
        <form action={createBookingAction.bind(null, unitSlug)} className="card flex flex-col gap-3">
          <h2 className="text-sm font-medium">จองเช่าใหม่</h2>
          <select name="assetId" required className="rounded-lg border px-3 py-2 text-sm">
            {activeAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — ฿{baht(a.dailyRateSatang)}/วัน
              </option>
            ))}
          </select>
          <input name="customerName" required maxLength={120} placeholder="ชื่อลูกค้า" className="rounded-lg border px-3 py-2 text-sm" />
          <input name="customerPhone" maxLength={30} placeholder="เบอร์โทร (ถ้ามี)" className="rounded-lg border px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              วันรับ
              <input name="startDate" required type="date" className="rounded-lg border px-3 py-2 text-sm" />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              วันคืน
              <input name="endDate" required type="date" className="rounded-lg border px-3 py-2 text-sm" />
            </label>
          </div>
          <input name="note" maxLength={300} placeholder="หมายเหตุ (ถ้ามี)" className="rounded-lg border px-3 py-2 text-sm" />
          <button className="btn btn-primary text-sm">บันทึกการจอง</button>
        </form>
      )}

      {/* รายการจอง */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">รายการจอง ({bookings.length})</h2>
        {bookings.length === 0 && <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีการจอง</p>}
        {bookings.map((b) => {
          const st = STATUS_LABEL[b.status] ?? { text: b.status, cls: "" };
          return (
            <div key={b.id} className="card flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {b.asset?.name} · {b.customerName}
                  </div>
                  <div className="text-sm text-[color:var(--color-muted)]">
                    {fmtDate(b.startDate)} → {fmtDate(b.endDate)}
                    {b.customerPhone && ` · ${b.customerPhone}`}
                  </div>
                  <div className="text-xs text-[color:var(--color-muted)]">
                    {b.depositSatang > 0 &&
                      (b.depositPaidAt
                        ? `รับมัดจำแล้ว ฿${baht(b.depositSatang)}`
                        : `มัดจำ ฿${baht(b.depositSatang)} (รอรับ)`)}
                    {b.status === "RETURNED" && ` · ค่าเช่ารวม ฿${baht(b.totalSatang)}${b.lateFeeSatang > 0 ? ` (ค่าปรับ ฿${baht(b.lateFeeSatang)})` : ""}`}
                  </div>
                </div>
                <span className={`shrink-0 text-xs font-medium ${st.cls}`}>{st.text}</span>
              </div>

              {b.status === "BOOKED" && (
                <div className="flex flex-wrap gap-2">
                  {b.depositSatang > 0 && !b.depositPaidAt && (
                    <form action={recordRentalDepositAction.bind(null, unitSlug, b.id)}>
                      <button className="rounded-full border border-emerald-600 px-3 py-1 text-xs text-emerald-700 hover:bg-[color:var(--color-surface-2)]">
                        ยืนยันรับมัดจำ ฿{baht(b.depositSatang)}
                      </button>
                    </form>
                  )}
                  <form action={pickUpAction.bind(null, unitSlug, b.id)}>
                    <button className="rounded-full border px-3 py-1 text-xs hover:bg-[color:var(--color-surface-2)]">รับของ</button>
                  </form>
                  <form action={cancelAction.bind(null, unitSlug, b.id)}>
                    <button className="rounded-full border px-3 py-1 text-xs text-red-600 hover:bg-[color:var(--color-surface-2)]">ยกเลิก</button>
                  </form>
                </div>
              )}

              {b.status === "PICKED_UP" && (
                <form action={returnAction.bind(null, unitSlug, b.id)} className="flex flex-wrap items-center gap-2">
                  <input name="lateFeeBaht" type="number" min={0} step="0.01" placeholder="ค่าปรับ (บาท)" className="w-32 rounded-lg border px-3 py-1.5 text-sm" />
                  <button className="rounded-full border px-3 py-1 text-xs hover:bg-[color:var(--color-surface-2)]">รับคืน + ปิดบิล</button>
                </form>
              )}

              {b.status === "RETURNED" && b.posSaleId && (
                <div className="pt-1">
                  <ConfirmDialog
                    triggerLabel="คืนเงิน"
                    triggerClassName="rounded-full border border-[color:var(--color-danger)] px-3 py-1 text-xs text-[color:var(--color-danger)] hover:bg-[color:var(--color-surface-2)]"
                    title={`คืนเงินค่าเช่า ${b.asset?.name}?`}
                    detail={`ยกเลิกบิลและคืนเงิน ฿${baht(b.totalSatang)} — ระบบจะกลับรายการขาย คืนแต้ม/คูปองให้อัตโนมัติ (ทำแล้วย้อนไม่ได้)`}
                    confirmLabel="ยืนยันคืนเงิน"
                    danger
                    action={refundRentalAction.bind(null, unitSlug, b.id)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
