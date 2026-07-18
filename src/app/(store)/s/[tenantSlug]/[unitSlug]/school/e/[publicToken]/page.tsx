import Link from "next/link";
import {
  resolveSchoolUnit,
  getPublicEnrollment,
  promptpayForEnrollment,
} from "@/lib/modules/school/service";
import { AutoRefresh } from "@/components/queue-auto-refresh";
import { PromptPayQr } from "@/components/PromptPayQr";

export const dynamic = "force-dynamic";

const baht = (satang: number) =>
  (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 0 });

function fmtDate(d: Date) {
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

// ป้ายสถานะการสมัคร (ผู้ปกครองเห็น)
function statusMeta(status: string) {
  if (status === "PAID") return { label: "ชำระแล้ว · เรียนได้", tone: "done" as const };
  if (status === "CANCELLED") return { label: "การสมัครถูกยกเลิกแล้ว", tone: "gone" as const };
  if (status === "REFUNDED") return { label: "คืนเงินแล้ว", tone: "gone" as const };
  return { label: "รอชำระค่าเรียน", tone: "wait" as const }; // ENROLLED
}

// หน้าจ่ายค่าเรียน + สถานะการสมัคร (public จาก publicToken)
//   ENROLLED → PromptPayQr (ค่าเรียน) + "สแกนจ่ายแล้วรอร้านยืนยัน" + auto-refresh
//   PAID     → ยืนยันชำระแล้ว เรียนได้
//   CANCELLED/REFUNDED → แจ้งสถานะ
export default async function PublicSchoolEnrollmentPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string; publicToken: string }>;
}) {
  const { tenantSlug, unitSlug, publicToken } = await params;
  const base = `/s/${tenantSlug}/${unitSlug}/school`;

  const resolved = await resolveSchoolUnit(tenantSlug, unitSlug);
  if (!resolved) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">ไม่พบสถาบันนี้</div>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">
          ลิงก์อาจไม่ถูกต้อง หรือปิดรับสมัครออนไลน์
        </p>
      </main>
    );
  }
  const { tenant, unit } = resolved;

  // กัน cross-tenant: token ต้องเป็นของ unit นี้ (ไม่งั้น leak PII ผู้เรียนร้านอื่น)
  const en = await getPublicEnrollment(unit.id, publicToken);
  if (!en) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-4 px-5 py-16 text-center">
        <div className="text-lg font-semibold">ไม่พบการสมัครนี้</div>
        <p className="text-sm text-[color:var(--color-muted)]">
          ลิงก์อาจไม่ถูกต้อง กรุณาสมัครใหม่อีกครั้ง
        </p>
        <Link href={base} className="btn btn-primary min-h-[48px] w-full max-w-xs text-base">
          สมัครเรียน
        </Link>
      </main>
    );
  }

  const meta = statusMeta(en.status);
  const awaitingPayment = en.status === "ENROLLED";
  const pp = awaitingPayment ? await promptpayForEnrollment(
    { tenantId: tenant.id, unitId: unit.id },
    en.id,
  ) : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-8">
      {awaitingPayment && <AutoRefresh ms={15000} />}

      <header className="text-center">
        <div className="text-base font-semibold">{unit.name}</div>
        <div className="text-xs text-[color:var(--color-muted)]">{tenant.name}</div>
      </header>

      {/* สรุปการสมัคร */}
      <section className="card flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">สมัครเรียน</span>
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
        <div className="text-sm font-medium">{en.class.course.name}</div>
        <div className="text-xs text-[color:var(--color-muted)]">
          {en.class.name}
          {en.class.startDate ? ` · เริ่ม ${fmtDate(en.class.startDate)}` : ""}
        </div>
        <div className="text-xs text-[color:var(--color-muted)]">ผู้เรียน: {en.studentName}</div>
        <div className="mt-1 flex items-center justify-between border-t pt-2 text-sm">
          <span className="text-[color:var(--color-muted)]">ค่าเรียน</span>
          <span className="font-semibold">฿{baht(en.priceSatang)}</span>
        </div>
      </section>

      {/* จ่ายค่าเรียน (เฉพาะยังไม่จ่าย) */}
      {awaitingPayment && (
        <section className="card flex flex-col items-center gap-3">
          {pp ? (
            <>
              <div className="text-sm font-medium">สแกนจ่ายค่าเรียนด้วย PromptPay</div>
              <PromptPayQr payload={pp.payload} caption={`฿${baht(en.priceSatang)}`} />
              {pp.displayName && (
                <div className="text-xs text-[color:var(--color-muted)]">{pp.displayName}</div>
              )}
              <p className="text-center text-sm text-[color:var(--color-muted)]">
                สแกนจ่ายแล้วรอร้านยืนยัน หน้านี้จะอัปเดตอัตโนมัติ
              </p>
            </>
          ) : (
            <p className="text-center text-sm text-[color:var(--color-muted)]">
              ร้านยังไม่ได้ตั้งค่า PromptPay — กรุณาติดต่อร้านเพื่อชำระค่าเรียน
            </p>
          )}
        </section>
      )}

      {en.status === "PAID" && (
        <p className="text-center text-sm text-green-700">
          ชำระค่าเรียนแล้ว ✓ พบกันวันเปิดเรียน
        </p>
      )}
      {en.status === "CANCELLED" && (
        <p className="text-center text-sm text-[color:var(--color-muted)]">
          การสมัครนี้ถูกยกเลิกแล้ว หากต้องการสมัครใหม่กรุณาเลือกรอบอีกครั้ง
        </p>
      )}
      {en.status === "REFUNDED" && (
        <p className="text-center text-sm text-[color:var(--color-muted)]">
          คืนเงินค่าเรียนแล้ว หากมีข้อสงสัยกรุณาติดต่อร้าน
        </p>
      )}

      <div className="text-center">
        <Link href={base} className="text-sm underline">
          ← ดูรอบเรียนอื่น
        </Link>
      </div>
    </main>
  );
}
