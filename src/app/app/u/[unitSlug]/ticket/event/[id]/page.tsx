import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { getEvent, eventSummary, listOrders } from "@/lib/modules/ticket/service";
import {
  setEventStatusAction,
  addTypeAction,
  removeTypeAction,
  markPaidAction,
  cancelOrderAction,
} from "@/lib/modules/ticket/actions";
import SellForm from "./SellForm";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { SubmitButton } from "@/components/ui/SubmitButton";

const baht = (s: number) => (s / 100).toLocaleString("th-TH");

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "ร่าง",
  PUBLISHED: "เปิดขาย",
  ENDED: "จบงาน",
  CANCELLED: "ยกเลิก",
};
const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: "รอชำระ",
  PAID: "จ่ายแล้ว",
  CANCELLED: "ยกเลิก",
};

function fmt(d: Date) {
  return d.toLocaleString("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ unitSlug: string; id: string }>;
}) {
  const { unitSlug, id } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const tenantId = auth.active.tenantId;
  const event = await getEvent(tenantId, unit.id, id);
  if (!event) notFound();
  const [summary, orders] = await Promise.all([
    eventSummary(tenantId, unit.id, id),
    listOrders(tenantId, unit.id, id),
  ]);

  const sellableTypes = event.ticketTypes
    .filter((t) => t.active)
    .map((t) => ({
      id: t.id,
      name: t.name,
      priceSatang: t.priceSatang,
      remaining: Math.max(0, t.quota - t.sold),
    }));

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-[color:var(--color-muted)]">{unit.name}</div>
          <h1 className="text-2xl font-semibold">{event.name}</h1>
          <div className="mt-1 text-sm text-[color:var(--color-muted)]">
            {fmt(event.startAt)}
            {event.venue ? ` · ${event.venue}` : ""} · {STATUS_LABEL[event.status]}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/app/u/${unitSlug}/ticket/checkin?event=${event.id}`} className="btn btn-ghost text-sm">
            เช็คอิน
          </Link>
          <Link href={`/app/u/${unitSlug}/ticket`} className="btn btn-ghost text-sm">
            ← กลับ
          </Link>
        </div>
      </div>

      {/* สรุป */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="ขายแล้ว" value={`${summary.sold}/${summary.quota}`} />
        <Stat label="คงเหลือ" value={`${summary.remaining}`} />
        <Stat label="รายได้ (จ่ายแล้ว)" value={`฿${baht(summary.paidRevenueSatang)}`} />
        <Stat label="เช็คอิน" value={`${summary.checkedIn}/${summary.admissionsTotal}`} />
      </section>

      {/* สถานะงาน */}
      <section className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[color:var(--color-muted)]">สถานะงาน:</span>
        {(["DRAFT", "PUBLISHED", "ENDED", "CANCELLED"] as const).map((s) => (
          <form key={s} action={setEventStatusAction.bind(null, unitSlug)}>
            <input type="hidden" name="id" value={event.id} />
            <input type="hidden" name="status" value={s} />
            <button
              className={`rounded-full border px-2.5 py-1 text-xs ${
                event.status === s ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "hover:bg-[color:var(--color-surface-2)]"
              }`}
            >
              {STATUS_LABEL[s]}
            </button>
          </form>
        ))}
      </section>

      {/* ประเภทตั๋ว */}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">ประเภทตั๋ว</h2>
        {event.ticketTypes.filter((t) => t.active).length === 0 && (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีประเภทตั๋ว เพิ่มด้านล่าง</p>
        )}
        {event.ticketTypes
          .filter((t) => t.active)
          .map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div className="text-sm">
                <span className="font-medium">{t.name}</span>
                <span className="text-[color:var(--color-muted)]">
                  {" "}
                  · ฿{baht(t.priceSatang)} · ขาย {t.sold}/{t.quota}
                </span>
              </div>
              <form action={removeTypeAction.bind(null, unitSlug)}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="eventId" value={event.id} />
                <button className="text-xs text-[color:var(--color-danger)] underline">ลบ</button>
              </form>
            </div>
          ))}
        <form
          action={addTypeAction.bind(null, unitSlug)}
          className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
        >
          <input type="hidden" name="eventId" value={event.id} />
          <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
            <span className="text-xs text-[color:var(--color-muted)]">ชื่อประเภท</span>
            <input name="name" required placeholder="เช่น บัตรทั่วไป" className="w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">ราคา (บาท)</span>
            <input name="priceBaht" type="number" defaultValue={0} min={0} className="w-full rounded-lg border px-2 py-2 text-sm sm:w-24" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">โควตา</span>
            <input name="quota" type="number" defaultValue={100} min={0} className="w-full rounded-lg border px-2 py-2 text-sm sm:w-24" />
          </label>
          <button className="btn btn-primary col-span-2 text-sm sm:col-span-1">เพิ่ม</button>
        </form>
      </section>

      {/* ขาย/จอง หน้างาน */}
      <section className="card flex flex-col gap-3">
        <h2 className="font-medium">ขาย / จอง หน้างาน</h2>
        <SellForm unitSlug={unitSlug} eventId={event.id} types={sellableTypes} />
      </section>

      {/* ออเดอร์ */}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">ออเดอร์</h2>
        {orders.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีออเดอร์</p>
        ) : (
          <div className="flex flex-col gap-2">
            {orders.map((o) => (
              <div key={o.id} className="rounded-lg border px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-medium">{o.buyerName}</span>
                    <span className="text-[color:var(--color-muted)]">
                      {" "}
                      · {o.orderNo} · {o._count.admissions} ใบ · ฿{baht(o.totalSatang)}
                    </span>
                    {o.buyerPhone && (
                      <div className="text-xs text-[color:var(--color-muted)]">{o.buyerPhone}</div>
                    )}
                  </div>
                  <span className="whitespace-nowrap rounded-full border px-2 py-0.5 text-xs text-[color:var(--color-muted)]">
                    {ORDER_STATUS_LABEL[o.status]}
                  </span>
                </div>
                {o.status !== "CANCELLED" && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {o.status === "PENDING" && (
                      <form action={markPaidAction.bind(null, unitSlug)}>
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="eventId" value={event.id} />
                        <SubmitButton
                          variant="ghost"
                          pendingText="กำลังบันทึก…"
                          className="rounded-lg border px-2.5 py-1 text-xs hover:bg-[color:var(--color-surface-2)]"
                        >
                          รับเงินแล้ว
                        </SubmitButton>
                      </form>
                    )}
                    <ConfirmDialog
                      triggerLabel="ยกเลิก + คืนโควตา"
                      triggerClassName="rounded-lg border px-2.5 py-1 text-xs text-[color:var(--color-danger)] hover:bg-[color:var(--color-surface-2)]"
                      title="ยกเลิกออเดอร์นี้?"
                      detail="ตั๋วทุกใบในออเดอร์จะถูกยกเลิก และคืนโควตากลับเข้าระบบ แก้ไขไม่ได้"
                      confirmLabel="ยืนยันยกเลิกออเดอร์"
                      danger
                      action={cancelOrderAction.bind(null, unitSlug)}
                      fields={{ id: o.id, eventId: event.id }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-[color:var(--color-muted)]">{label}</div>
      <div className="mt-0.5 text-lg font-semibold">{value}</div>
    </div>
  );
}
