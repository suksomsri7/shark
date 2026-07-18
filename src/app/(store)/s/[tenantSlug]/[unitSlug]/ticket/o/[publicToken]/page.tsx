import Link from "next/link";
import { resolveUnit, getPublicOrder, promptpayForOrder } from "@/lib/modules/ticket/service";
import { AutoRefresh } from "@/components/queue-auto-refresh";
import { PromptPayQr } from "@/components/PromptPayQr";
import { QrCode } from "@/components/qr-code";

export const dynamic = "force-dynamic";

const baht = (satang: number) =>
  (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 0 });

function fmtEvent(d: Date) {
  return d.toLocaleString("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

// ป้ายสถานะออเดอร์ (ลูกค้าเห็น)
function statusMeta(status: string) {
  if (status === "PAID") return { label: "ชำระเงินแล้ว", tone: "done" as const };
  if (status === "CANCELLED") return { label: "ออเดอร์ถูกยกเลิกแล้ว", tone: "gone" as const };
  return { label: "รอชำระเงิน", tone: "wait" as const }; // PENDING
}

// หน้าจ่ายเงิน + ตั๋ว QR (public จาก publicToken)
//   PENDING → PromptPayQr (ยอดตั๋ว) + "สแกนจ่ายแล้วรอร้านยืนยัน" + auto-refresh
//   PAID    → ตั๋ว QR รายใบ (admission.code) + ชื่องาน/วันเวลา → เปิดโชว์ให้สแกนเข้างาน
//   CANCELLED → แจ้งยกเลิก
export default async function PublicTicketOrderPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string; publicToken: string }>;
}) {
  const { tenantSlug, unitSlug, publicToken } = await params;
  const base = `/s/${tenantSlug}/${unitSlug}/ticket`;

  const resolved = await resolveUnit(tenantSlug, unitSlug);
  if (!resolved) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">ไม่พบร้านนี้</div>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">
          ลิงก์อาจไม่ถูกต้อง หรือร้านปิดขายตั๋วออนไลน์
        </p>
      </main>
    );
  }
  const { tenant, unit } = resolved;

  // กัน cross-tenant: token ต้องเป็นของ unit นี้ (ไม่งั้น leak ตั๋ว/PII ร้านอื่น)
  const order = await getPublicOrder(unit.id, publicToken);
  if (!order) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-4 px-5 py-16 text-center">
        <div className="text-lg font-semibold">ไม่พบออเดอร์นี้</div>
        <p className="text-sm text-[color:var(--color-muted)]">
          ลิงก์อาจไม่ถูกต้อง กรุณาซื้อตั๋วใหม่อีกครั้ง
        </p>
        <Link href={base} className="btn btn-primary min-h-[48px] w-full max-w-xs text-base">
          ซื้อตั๋ว
        </Link>
      </main>
    );
  }

  const meta = statusMeta(order.status);
  const awaitingPayment = order.status === "PENDING";
  const pp = awaitingPayment ? await promptpayForOrder(tenant.id, unit.id, order.id) : null;
  // ตั๋วที่ยังใช้ได้ (ไม่นับ VOID) — โชว์ QR เมื่อจ่ายแล้ว
  const tickets = order.admissions.filter((a) => a.status !== "VOID");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-8">
      {awaitingPayment && <AutoRefresh ms={15000} />}

      <header className="text-center">
        <div className="text-base font-semibold">{unit.name}</div>
        <div className="text-xs text-[color:var(--color-muted)]">{tenant.name}</div>
      </header>

      {/* สรุปออเดอร์ */}
      <section className="card flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">ออเดอร์ {order.orderNo}</span>
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
        <div className="text-sm font-medium">{order.event.name}</div>
        <div className="text-xs text-[color:var(--color-muted)]">
          {fmtEvent(order.event.startAt)}
          {order.event.venue ? ` · ${order.event.venue}` : ""}
        </div>
        <div className="text-xs text-[color:var(--color-muted)]">
          {order.buyerName} · {tickets.length} ใบ
        </div>
        <div className="mt-1 flex items-center justify-between border-t pt-2 text-sm">
          <span className="text-[color:var(--color-muted)]">ยอดรวม</span>
          <span className="font-semibold">฿{baht(order.totalSatang)}</span>
        </div>
      </section>

      {/* จ่ายเงิน (เฉพาะยังไม่จ่าย) */}
      {awaitingPayment && (
        <section className="card flex flex-col items-center gap-3">
          {pp ? (
            <>
              <div className="text-sm font-medium">สแกนจ่ายด้วย PromptPay</div>
              <PromptPayQr payload={pp.payload} caption={`฿${baht(order.totalSatang)}`} />
              {pp.displayName && (
                <div className="text-xs text-[color:var(--color-muted)]">{pp.displayName}</div>
              )}
              <p className="text-center text-sm text-[color:var(--color-muted)]">
                สแกนจ่ายแล้วรอร้านยืนยัน หน้านี้จะอัปเดตอัตโนมัติ
              </p>
            </>
          ) : (
            <p className="text-center text-sm text-[color:var(--color-muted)]">
              ร้านยังไม่ได้ตั้งค่า PromptPay — กรุณาติดต่อร้านเพื่อชำระเงิน
            </p>
          )}
        </section>
      )}

      {/* ตั๋ว QR (เฉพาะจ่ายแล้ว) */}
      {order.status === "PAID" && (
        <section className="flex flex-col gap-3">
          <p className="text-center text-sm text-green-700">
            ชำระเงินแล้ว ✓ เปิดหน้านี้โชว์ QR ให้เจ้าหน้าที่สแกนเข้างาน
          </p>
          {tickets.map((a, i) => (
            <div key={a.id} className="card flex flex-col items-center gap-2">
              <div className="text-sm font-medium">
                ตั๋วใบที่ {i + 1} · {a.ticketType.name}
              </div>
              <QrCode value={a.code} caption={a.code} />
              {a.status === "CHECKED_IN" && (
                <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700">
                  เช็คอินแล้ว
                </span>
              )}
            </div>
          ))}
        </section>
      )}

      {order.status === "CANCELLED" && (
        <p className="text-center text-sm text-[color:var(--color-muted)]">
          ออเดอร์นี้ถูกยกเลิกแล้ว หากชำระเงินไปแล้วกรุณาติดต่อร้าน
        </p>
      )}

      <div className="text-center">
        <Link href={base} className="text-sm underline">
          ← ซื้อตั๋วเพิ่ม
        </Link>
      </div>
    </main>
  );
}
