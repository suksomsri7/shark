import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { listAppointments, appointmentsHitByLeave } from "@/lib/modules/booking/service";
import { daySummary } from "@/lib/modules/pos/service";
import { setStatusAction, recordDepositAction, refundDepositAction, confirmDepositAction, refundDueDepositAction, forfeitDueDepositAction } from "@/lib/actions/booking";
import { depositQueue, type DepositQueueItem } from "@/lib/modules/booking/deposit"; // SVC B.8 ▸ คิวมัดจำ (สิทธิ์สดในฟังก์ชัน · ไม่มีสิทธิ์ = ไม่แสดง) ◂
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { BOOKING_STATUS_LABEL } from "@/lib/ui/status-labels";
import { formatBaht } from "@/lib/ui/money";
import { phoneForViewer } from "@/lib/modules/booking/privacy-shared"; // SVC B.11 ▸ เบอร์เต็มเฉพาะผู้มี booking.customer.phoneFull ◂
// SVC B.5 ▸ จอคิววันนี้แถวเดียว (ร้านที่เปิด booking.queue.singleLine) — ร้านเดิม = จอ "รายการนัด" ด้านล่างทั้งก้อนตามเดิม ◂
import { AutoRefresh } from "@/components/queue-auto-refresh";
import TodayLine from "@/components/booking/TodayLine";
import { lineAccess, type LineMember } from "@/lib/modules/booking/line-access";
import { loadTodayLine } from "@/lib/modules/booking/today-line";
import { lineSettingsOf } from "@/lib/modules/booking/planner-run";
import { lineActionsFor, qcNowOf } from "@/components/booking/line-page";

const apptTone = (v: string) =>
  v === "CANCELLED" || v === "NO_SHOW" ? "danger" : v === "PENDING" ? "muted" : "strong";

function fmt(d: Date) {
  const day = d.toLocaleDateString("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Bangkok",
  });
  const time = d.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
  return { day, time };
}

function todayBkk(): string {
  const bkk = new Date(Date.now() + 7 * 3600000);
  return bkk.toISOString().slice(0, 10);
}

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ unitSlug: string }>;
  searchParams?: Promise<{ err?: string; at?: string }>; // POS P5.1 ▸ RC F4 F5 (CD-P51-O10): เหตุผลที่ริบ/ยกเลิกบิลริบมัดจำไม่สำเร็จ ◂ · SVC B.5 ▸ at = นาฬิกา QC (เฉพาะ SVC_QC_CLOCK=1) ◂
}) {
  const { unitSlug } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const err = typeof sp?.err === "string" ? sp.err.slice(0, 300) : "";
  const { auth, unit } = await requireUnit(unitSlug);
  const viewer = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  // SVC B.5 ▸ หน่วยแถวเดียว ⇒ จอคิววันนี้ (ไม่มีสิทธิ์ดู ⇒ notFound) · ?at= อ่านเฉพาะเมื่อ process.env.SVC_QC_CLOCK === "1" (qcNowOf) ◂
  const access = lineAccess(viewer as LineMember, unit.id);
  const qc = qcNowOf(sp?.at, process.env.SVC_QC_CLOCK === "1");
  const line = await loadTodayLine({ tenantId: auth.active.tenantId, unitId: unit.id }, { userId: auth.user.id, access }, { now: qc.now });
  const dq = await depositQueue({ tenantId: auth.active.tenantId, actorUserId: auth.user.id }, { unitId: unit.id });
  const depositItems = dq.ok ? dq.items : [];
  const depositOver = dq.ok ? dq.overpaid : [];
  const depositCan = dq.ok ? dq.can : { confirm: false, refund: false, forfeit: false };
  const depositMore = dq.ok ? dq.hasMore : false;
  if (line) {
    return (
      <div data-booking-line-page="" className="flex w-full min-w-0 flex-col gap-4">
        <AutoRefresh />
        {err ? (
          <p role="alert" data-testid="booking-status-error" className="rounded-xl border border-[color:var(--color-danger)] px-4 py-3 text-sm text-[color:var(--color-danger)]">
            {err}
          </p>
        ) : null}
        <TodayLine view={line} unitSlug={unitSlug} actions={lineActionsFor(unitSlug)} at={qc.at} bookingHref={`/s/${auth.active.tenant.slug}/${unit.slug}`} />
        <DepositQueueBox items={depositItems} over={depositOver} can={depositCan} more={depositMore} unitSlug={unitSlug} />
      </div>
    );
  }
  if (await lineSettingsOf(auth.active.tenantId, unit.id)) notFound(); // เปิดแถวเดียวแต่ผู้ดูไม่มีสิทธิ์ดูจอนี้
  const [appts, revenue] = await Promise.all([
    listAppointments(auth.active.tenantId, unit.id, todayBkk()),
    daySummary(auth.active.tenantId, unit.id),
  ]);
  // contract C-2: นัดที่ค้างอยู่ในวันที่ช่างลา (อนุมัติแล้ว) — เตือนให้เห็น ไม่ยกเลิกให้เอง
  const hitByLeave = await appointmentsHitByLeave(auth.active.tenantId, appts);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="รายการนัด"
        desc={`ยอดขายวันนี้ · ${formatBaht(revenue.totalSatang)} (${revenue.count} บิล)`}
        back={{ href: `/app/u/${unitSlug}`, label: unit.name }}
        actions={
          <Link
            href={`/s/${auth.active.tenant.slug}/${unit.slug}`}
            target="_blank"
            className="btn btn-ghost text-sm"
          >
            หน้าจอง ↗
          </Link>
        }
      />
      {err ? (
        <p role="alert" data-testid="booking-status-error" className="rounded-xl border border-[color:var(--color-danger)] px-4 py-3 text-sm text-[color:var(--color-danger)]">
          {err}
        </p>
      ) : null}

      <DepositQueueBox items={depositItems} over={depositOver} can={depositCan} more={depositMore} unitSlug={unitSlug} />

      {appts.length === 0 ? (
        <EmptyState
          text="ยังไม่มีนัดวันนี้ — แชร์ลิงก์หน้าจองให้ลูกค้า หรือเพิ่มบริการ/พนักงานก่อน"
          action={{ href: `/app/u/${unitSlug}/booking/services`, label: "เพิ่มบริการ" }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {appts.map((a) => {
            const { day, time } = fmt(a.startAt);
            const active = a.status === "CONFIRMED" || a.status === "ARRIVED";
            return (
              <div key={a.id} className="rounded-xl border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">
                      {time} · {a.service.name}
                    </div>
                    <div className="text-xs text-[color:var(--color-muted)]">
                      {day} · โดย {a.staff.name} · {a.customerName} {phoneForViewer(viewer, unit.id, a.customerPhone)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusChip value={a.status} map={BOOKING_STATUS_LABEL} toneOf={apptTone} />
                    {hitByLeave.has(a.id) && (
                      <span className="rounded-full border px-2 py-0.5 text-xs whitespace-nowrap text-[color:var(--color-danger)] [border-color:var(--color-danger)]">
                        ช่างลาวันนี้
                      </span>
                    )}
                    {a.depositSatang > 0 && (
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-xs " +
                          (a.depositPaidAt
                            ? "bg-[color:var(--color-success-soft,#e6f4ea)] text-[color:var(--color-success,#137333)]"
                            : "bg-[color:var(--color-surface-2)] text-[color:var(--color-muted)]")
                        }
                      >
                        {a.depositPaidAt
                          ? `รับมัดจำแล้ว ${formatBaht(a.depositSatang)}`
                          : `มัดจำ ${formatBaht(a.depositSatang)}`}
                      </span>
                    )}
                  </div>
                </div>
                {(active || a.depositSatang > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {active && (
                      <>
                        <StatusBtn slug={unitSlug} id={a.id} status="ARRIVED" label="มาถึง" />
                        <StatusBtn slug={unitSlug} id={a.id} status="DONE" label="เสร็จ" />
                        <StatusBtn slug={unitSlug} id={a.id} status="NO_SHOW" label="ไม่มา" />
                        <StatusBtn slug={unitSlug} id={a.id} status="CANCELLED" label="ยกเลิก" />
                      </>
                    )}
                    {a.depositSatang > 0 && !a.depositPaidAt && (
                      <form action={recordDepositAction.bind(null, unitSlug)}>
                        <input type="hidden" name="id" value={a.id} />
                        <button className="btn-sm min-h-[44px]">รับมัดจำ</button>
                      </form>
                    )}
                    {a.depositSatang > 0 && a.depositPaidAt && (
                      <ConfirmDialog
                        triggerLabel="คืนมัดจำ"
                        triggerClassName="btn-sm text-[color:var(--color-danger)] min-h-[44px]"
                        title="คืนมัดจำนัดนี้?"
                        detail="บิลมัดจำจะถูกยกเลิก (กลับรายการบัญชี) และสถานะกลับเป็นยังไม่รับมัดจำ"
                        confirmLabel="ยืนยันคืนมัดจำ"
                        danger
                        action={refundDepositAction.bind(null, unitSlug)}
                        fields={{ id: a.id }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBtn({
  slug,
  id,
  status,
  label,
}: {
  slug: string;
  id: string;
  status: string;
  label: string;
}) {
  if (status === "CANCELLED") {
    return (
      <ConfirmDialog
        triggerLabel={label}
        triggerClassName="btn-sm text-[color:var(--color-danger)]"
        title="ยกเลิกนัดนี้?"
        detail="นัดหมายจะถูกยกเลิก และปล่อยช่วงเวลาให้จองใหม่ได้"
        confirmLabel="ยืนยันยกเลิก"
        danger
        action={setStatusAction.bind(null, slug)}
        fields={{ id, status }}
      />
    );
  }
  return (
    <form action={setStatusAction.bind(null, slug)}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className="btn-sm">{label}</button>
    </form>
  );
}

// ═════════ SVC B.8 ▸ คิวมัดจำ (ภาพ 08: QR พร้อมเพย์ · ร้านกดยืนยัน หรือตรวจสลิปอัตโนมัติ) ═════════
//   AWAITING ⇒ ร้านยืนยันรับเงิน (= ยืนยันนัด) · IN_REVIEW ⇒ ไปตัดสินที่คิวตรวจสลิป · UNDERPAID ⇒ ยอมรับยอด · REFUND_DUE ⇒ โอนคืนแล้วกดคืน (ใส่เหตุผล)
//   เบอร์ปิดเสมอ · ไม่มีสิทธิ์มัดจำ ⇒ ไม่แสดงกล่องนี้
const DEPOSIT_STATE_LABEL: Record<string, string> = {
  AWAITING: "รอจ่ายมัดจำ",
  IN_REVIEW: "สลิปรอตรวจ",
  UNDERPAID: "ได้รับบางส่วน",
  REFUND_DUE: "ค้างคืนลูกค้า",
  FORFEIT_PENDING: "รอร้านตัดสิน: ริบ/คืน",
  RECORDING: "กำลังบันทึกเงินเข้า",
  PAID: "รับเกินยอด",
};
function DepositQueueBox({ items, over, can, more, unitSlug }: { items: DepositQueueItem[]; over: DepositQueueItem[]; can: { confirm: boolean; refund: boolean; forfeit: boolean }; more: boolean; unitSlug: string }) {
  if (!items.length && !over.length) return null;
  const all = [...items, ...over];
  return (
    <section data-deposit-queue="" className="flex flex-col gap-2 rounded-xl border p-3">
      <h2 className="text-sm font-semibold">คิวมัดจำ ({all.length}{more ? "+" : ""})</h2>
      {more ? <p className="text-xs text-[color:var(--color-muted)]">ยังมีรายการอีก — จัดการรายการด้านล่างก่อนแล้วโหลดหน้าใหม่</p> : null}
      {all.map((it) => {
        const { day, time } = fmt(new Date(it.startMs));
        const st = it.info.state;
        return (
          <div key={it.appointmentId} data-deposit-item={it.appointmentId} data-state={st} className="flex flex-col gap-2 rounded-lg border p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium">
                  {day} {time} · {it.serviceName}
                  {it.staffName ? ` · ${it.staffName}` : ""}
                </div>
                <div className="text-xs text-[color:var(--color-muted)]">
                  {it.customerName} {it.phoneMasked} · มัดจำ {formatBaht(it.info.requiredSatang)}
                  {st === "UNDERPAID" ? ` · ได้รับ ${formatBaht(it.info.paidSatang)}` : ""}
                  {st === "REFUND_DUE" ? ` · ค้างคืน ${formatBaht(it.info.refundDueSatang)}` : ""}
                  {it.info.overpaidSatang > 0 ? ` · รับเกิน ${formatBaht(it.info.overpaidSatang)}` : ""}
                </div>
              </div>
              <span className="rounded-full bg-[color:var(--color-surface-2)] px-2 py-0.5 text-xs whitespace-nowrap">{DEPOSIT_STATE_LABEL[st] ?? st}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {can.confirm && (st === "AWAITING" || st === "UNDERPAID") ? (
                <form action={confirmDepositAction.bind(null, unitSlug)} className="flex items-center gap-1.5">
                  <input type="hidden" name="id" value={it.appointmentId} />
                  {st === "AWAITING" ? (
                    <select name="payType" defaultValue="PROMPTPAY" className="min-h-[44px] rounded-lg border px-2 text-sm" aria-label="วิธีรับเงิน">
                      <option value="PROMPTPAY">พร้อมเพย์</option>
                      <option value="TRANSFER">โอน</option>
                      <option value="CASH">เงินสด</option>
                    </select>
                  ) : null}
                  <button className="btn-sm min-h-[44px]">{st === "AWAITING" ? "ยืนยันรับมัดจำ" : "ยอมรับยอดที่ได้ · ยืนยันนัด"}</button>
                </form>
              ) : null}
              {st === "IN_REVIEW" ? <span className="text-xs text-[color:var(--color-muted)]">ตัดสินที่คิวตรวจสลิป</span> : null}
              {can.forfeit && st === "FORFEIT_PENDING" ? (
                <form action={forfeitDueDepositAction.bind(null, unitSlug)}>
                  <input type="hidden" name="id" value={it.appointmentId} />
                  <button className="btn-sm min-h-[44px]">ริบมัดจำตามเงื่อนไข</button>
                </form>
              ) : null}
              {st === "PAID" && it.info.overpaidSatang > 0 ? <span className="text-xs text-[color:var(--color-muted)]">คืนส่วนเกินที่หน้าบิล (POS)</span> : null}
              {can.refund && (st === "REFUND_DUE" || st === "FORFEIT_PENDING") ? (
                <form action={refundDueDepositAction.bind(null, unitSlug)} className="flex flex-wrap items-center gap-1.5">
                  <input type="hidden" name="id" value={it.appointmentId} />
                  <input name="reason" required maxLength={200} placeholder="เหตุผล เช่น โอนคืนแล้ว" className="min-h-[44px] rounded-lg border px-2 text-sm" />
                  <button className="btn-sm min-h-[44px] text-[color:var(--color-danger)]">บันทึกคืนมัดจำ</button>
                </form>
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}
