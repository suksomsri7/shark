import Link from "next/link";
import {
  resolveRentalUnit,
  getPublicBooking,
  promptpayForRentalDeposit,
} from "@/lib/modules/rental/service";
import { AutoRefresh } from "@/components/queue-auto-refresh";
import { PromptPayQr } from "@/components/PromptPayQr";

export const dynamic = "force-dynamic";

const baht = (satang: number) =>
  (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 0 });

function fmtDate(d: Date) {
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });
}

const daysBetween = (start: Date, end: Date) =>
  Math.round((end.getTime() - start.getTime()) / 86_400_000);

// ป้ายสถานะการจอง (ลูกค้าเห็น) — ผูกกับมัดจำ/สถานะของ
function statusMeta(status: string, depositRequired: boolean, depositPaid: boolean) {
  if (status === "CANCELLED") return { label: "การจองถูกยกเลิกแล้ว", tone: "gone" as const };
  if (status === "REFUNDED") return { label: "คืนเงินแล้ว", tone: "gone" as const };
  if (status === "RETURNED") return { label: "คืนของแล้ว ขอบคุณที่ใช้บริการ", tone: "done" as const };
  if (status === "PICKED_UP") return { label: "รับของไปแล้ว", tone: "done" as const };
  // BOOKED
  if (depositRequired && !depositPaid) return { label: "รอชำระมัดจำ", tone: "wait" as const };
  if (depositRequired && depositPaid) return { label: "ยืนยันแล้ว รอรับของ", tone: "done" as const };
  return { label: "จองสำเร็จ รอรับของ", tone: "done" as const };
}

// หน้าสถานะการจองเช่า + จ่ายมัดจำ (public จาก publicToken) — auto-refresh ตอนยังรอยืนยัน
export default async function PublicRentalStatusPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string; publicToken: string }>;
}) {
  const { tenantSlug, unitSlug, publicToken } = await params;
  const base = `/s/${tenantSlug}/${unitSlug}/rental`;

  const resolved = await resolveRentalUnit(tenantSlug, unitSlug);
  if (!resolved) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">ไม่พบร้านให้เช่านี้</div>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">
          ลิงก์อาจไม่ถูกต้อง หรือร้านปิดรับจองออนไลน์
        </p>
      </main>
    );
  }
  const { tenant, unit } = resolved;

  // กัน cross-tenant: token ต้องเป็นของ unit นี้ (ไม่งั้น leak PII ลูกค้าร้านอื่น)
  const bk = await getPublicBooking(unit.id, publicToken);
  if (!bk) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-4 px-5 py-16 text-center">
        <div className="text-lg font-semibold">ไม่พบการจองนี้</div>
        <p className="text-sm text-[color:var(--color-muted)]">
          ลิงก์อาจไม่ถูกต้อง กรุณาจองใหม่อีกครั้ง
        </p>
        <Link href={base} className="btn btn-primary min-h-[48px] w-full max-w-xs text-base">
          จองเช่า
        </Link>
      </main>
    );
  }

  const days = daysBetween(bk.startDate, bk.endDate);
  const depositRequired = bk.depositSatang > 0;
  const depositPaid = !!bk.depositPaidAt;
  const meta = statusMeta(bk.status, depositRequired, depositPaid);
  const awaitingDeposit = bk.status === "BOOKED" && depositRequired && !depositPaid;
  const ctx = { tenantId: tenant.id, unitId: unit.id };
  const pp = awaitingDeposit ? await promptpayForRentalDeposit(ctx, bk.id) : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-8">
      {awaitingDeposit && <AutoRefresh ms={15000} />}

      <header className="text-center">
        <div className="text-base font-semibold">{unit.name}</div>
        <div className="text-xs text-[color:var(--color-muted)]">{tenant.name}</div>
      </header>

      {/* สรุปการจอง */}
      <section className="card flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">การจองเช่า</span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              meta.tone === "wait"
                ? "bg-amber-100 text-amber-800"
                : meta.tone === "done"
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-200 text-gray-700"
            }`}
          >
            {meta.label}
          </span>
        </div>
        <div className="text-sm">{bk.customerName}</div>
        <div className="text-xs text-[color:var(--color-muted)]">
          {bk.asset?.name} · {fmtDate(bk.startDate)}–{fmtDate(bk.endDate)} · {days} วัน
        </div>
        {depositRequired && (
          <div className="mt-1 flex items-center justify-between border-t pt-2 text-sm">
            <span className="text-[color:var(--color-muted)]">มัดจำ</span>
            <span className="font-semibold">฿{baht(bk.depositSatang)}</span>
          </div>
        )}
      </section>

      {/* จ่ายมัดจำ (เฉพาะยังไม่จ่าย) */}
      {awaitingDeposit && (
        <section className="card flex flex-col items-center gap-3">
          {pp ? (
            <>
              <div className="text-sm font-medium">สแกนจ่ายมัดจำด้วย PromptPay</div>
              <PromptPayQr payload={pp.payload} caption={`฿${baht(bk.depositSatang)}`} />
              {pp.displayName && (
                <div className="text-xs text-[color:var(--color-muted)]">{pp.displayName}</div>
              )}
              <p className="text-center text-sm text-[color:var(--color-muted)]">
                สแกนจ่ายแล้วรอร้านยืนยัน หน้านี้จะอัปเดตอัตโนมัติ
              </p>
            </>
          ) : (
            <p className="text-center text-sm text-[color:var(--color-muted)]">
              ร้านยังไม่ได้ตั้งค่า PromptPay — กรุณาติดต่อร้านเพื่อจ่ายมัดจำ
            </p>
          )}
        </section>
      )}

      {bk.status === "BOOKED" && depositRequired && depositPaid && (
        <p className="text-center text-sm text-green-700">
          ร้านได้รับมัดจำแล้ว การจองของคุณได้รับการยืนยัน ✓
        </p>
      )}
      {bk.status === "BOOKED" && !depositRequired && (
        <p className="text-center text-sm text-[color:var(--color-muted)]">
          จองสำเร็จแล้ว พบกันวันรับของ
        </p>
      )}

      <div className="text-center">
        <Link href={base} className="text-sm underline">
          ← จองเช่าเพิ่ม
        </Link>
      </div>
    </main>
  );
}
