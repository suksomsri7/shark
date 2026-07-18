import Link from "next/link";
import {
  resolveHotelUnit,
  getPublicReservation,
  promptpayForDeposit,
} from "@/lib/modules/hotel/service";
import { AutoRefresh } from "@/components/queue-auto-refresh";
import { PromptPayQr } from "@/components/PromptPayQr";

export const dynamic = "force-dynamic";

const baht = (satang: number) =>
  (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 0 });

function fmtDate(d: Date) {
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });
}

// ป้ายสถานะการจอง (ลูกค้าเห็น) — ผูกกับมัดจำ/สถานะห้อง
function statusMeta(status: string, depositRequired: boolean, depositPaid: boolean) {
  if (status === "CANCELLED") return { label: "การจองถูกยกเลิกแล้ว", tone: "gone" as const };
  if (status === "REFUNDED") return { label: "คืนเงินแล้ว", tone: "gone" as const };
  if (status === "CHECKED_OUT") return { label: "เช็คเอาท์แล้ว ขอบคุณที่มาพัก", tone: "done" as const };
  if (status === "CHECKED_IN") return { label: "เช็คอินแล้ว", tone: "done" as const };
  // BOOKED
  if (depositRequired && !depositPaid) return { label: "รอชำระมัดจำ", tone: "wait" as const };
  if (depositRequired && depositPaid) return { label: "ยืนยันแล้ว รอวันเข้าพัก", tone: "done" as const };
  return { label: "จองสำเร็จ รอวันเข้าพัก", tone: "done" as const };
}

// หน้าสถานะการจอง + จ่ายมัดจำ (public จาก publicToken) — auto-refresh ตอนยังรอยืนยัน
export default async function PublicReservationStatusPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string; publicToken: string }>;
}) {
  const { tenantSlug, unitSlug, publicToken } = await params;
  const base = `/s/${tenantSlug}/${unitSlug}/hotel`;

  const resolved = await resolveHotelUnit(tenantSlug, unitSlug);
  if (!resolved) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">ไม่พบที่พักนี้</div>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">
          ลิงก์อาจไม่ถูกต้อง หรือที่พักปิดรับจองออนไลน์
        </p>
      </main>
    );
  }
  const { tenant, unit } = resolved;

  // กัน cross-tenant: token ต้องเป็นของ unit นี้ (ไม่งั้น leak PII แขกร้านอื่น)
  const rv = await getPublicReservation(unit.id, publicToken);
  if (!rv) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-4 px-5 py-16 text-center">
        <div className="text-lg font-semibold">ไม่พบการจองนี้</div>
        <p className="text-sm text-[color:var(--color-muted)]">
          ลิงก์อาจไม่ถูกต้อง กรุณาจองใหม่อีกครั้ง
        </p>
        <Link href={base} className="btn btn-primary min-h-[48px] w-full max-w-xs text-base">
          จองห้องพัก
        </Link>
      </main>
    );
  }

  const depositRequired = rv.depositSatang > 0;
  const depositPaid = !!rv.depositPaidAt;
  const meta = statusMeta(rv.status, depositRequired, depositPaid);
  const awaitingDeposit = rv.status === "BOOKED" && depositRequired && !depositPaid;
  const pp = awaitingDeposit ? await promptpayForDeposit(tenant.id, unit.id, rv.id) : null;

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
          <span className="text-sm font-medium">การจอง {rv.code}</span>
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
        <div className="text-sm">{rv.guestName}</div>
        <div className="text-xs text-[color:var(--color-muted)]">
          {rv.roomType.name} · {fmtDate(rv.checkInDate)}–{fmtDate(rv.checkOutDate)} · {rv.nights} คืน
        </div>
        <div className="mt-1 flex items-center justify-between border-t pt-2 text-sm">
          <span className="text-[color:var(--color-muted)]">ค่าห้องรวม</span>
          <span className="font-semibold">฿{baht(rv.totalSatang)}</span>
        </div>
        {depositRequired && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-[color:var(--color-muted)]">มัดจำ</span>
            <span className="font-medium">฿{baht(rv.depositSatang)}</span>
          </div>
        )}
      </section>

      {/* จ่ายมัดจำ (เฉพาะยังไม่จ่าย) */}
      {awaitingDeposit && (
        <section className="card flex flex-col items-center gap-3">
          {pp ? (
            <>
              <div className="text-sm font-medium">สแกนจ่ายมัดจำด้วย PromptPay</div>
              <PromptPayQr payload={pp.payload} caption={`฿${baht(rv.depositSatang)}`} />
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

      {rv.status === "BOOKED" && depositRequired && depositPaid && (
        <p className="text-center text-sm text-green-700">
          ร้านได้รับมัดจำแล้ว การจองของคุณได้รับการยืนยัน ✓
        </p>
      )}
      {rv.status === "BOOKED" && !depositRequired && (
        <p className="text-center text-sm text-[color:var(--color-muted)]">
          จองสำเร็จแล้ว พบกันวันเข้าพัก
        </p>
      )}

      <div className="text-center">
        <Link href={base} className="text-sm underline">
          ← จองห้องเพิ่ม
        </Link>
      </div>
    </main>
  );
}
