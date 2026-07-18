import Link from "next/link";
import { resolveClinicUnit, getPublicAppointment } from "@/lib/modules/clinic/service";
import { AutoRefresh } from "@/components/queue-auto-refresh";

export const dynamic = "force-dynamic";

function fmtDateTime(d: Date) {
  return d.toLocaleString("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

// ป้ายสถานะนัด (ผู้ป่วยเห็น)
function statusMeta(status: string) {
  if (status === "CONFIRMED") return { label: "ยืนยันนัดแล้ว", tone: "done" as const };
  if (status === "DONE") return { label: "ตรวจเสร็จแล้ว", tone: "done" as const };
  if (status === "REJECTED") return { label: "คลินิกไม่สะดวกตามเวลานี้", tone: "gone" as const };
  if (status === "CANCELLED") return { label: "นัดถูกยกเลิกแล้ว", tone: "gone" as const };
  return { label: "รอคลินิกยืนยัน", tone: "wait" as const }; // PENDING
}

// หน้าสถานะคำขอนัด (public จาก publicToken) — auto-refresh ตอนยังรอยืนยัน
export default async function PublicClinicAppointmentPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string; publicToken: string }>;
}) {
  const { tenantSlug, unitSlug, publicToken } = await params;
  const base = `/s/${tenantSlug}/${unitSlug}/clinic`;

  const resolved = await resolveClinicUnit(tenantSlug, unitSlug);
  if (!resolved) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">ไม่พบคลินิกนี้</div>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">
          ลิงก์อาจไม่ถูกต้อง หรือปิดรับนัดออนไลน์
        </p>
      </main>
    );
  }
  const { tenant, unit } = resolved;

  // กัน cross-tenant: token ต้องเป็นของ unit นี้ (ไม่งั้น leak ข้อมูลสุขภาพ/PII ผู้ป่วยร้านอื่น)
  const appt = await getPublicAppointment(unit.id, publicToken);
  if (!appt) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-4 px-5 py-16 text-center">
        <div className="text-lg font-semibold">ไม่พบนัดนี้</div>
        <p className="text-sm text-[color:var(--color-muted)]">
          ลิงก์อาจไม่ถูกต้อง กรุณาขอนัดใหม่อีกครั้ง
        </p>
        <Link href={base} className="btn btn-primary min-h-[48px] w-full max-w-xs text-base">
          ขอนัด
        </Link>
      </main>
    );
  }

  const meta = statusMeta(appt.status);
  const awaiting = appt.status === "PENDING";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-8">
      {awaiting && <AutoRefresh ms={15000} />}

      <header className="text-center">
        <div className="text-base font-semibold">{unit.name}</div>
        <div className="text-xs text-[color:var(--color-muted)]">{tenant.name}</div>
      </header>

      <section className="card flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">คำขอนัด</span>
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
        <div className="text-sm">{appt.patientName}</div>
        <div className="text-xs text-[color:var(--color-muted)]">
          เวลาที่ขอ: {fmtDateTime(appt.preferredAt)}
        </div>
        {appt.symptom && (
          <div className="text-xs text-[color:var(--color-muted)]">อาการ: {appt.symptom}</div>
        )}
        {appt.note && (
          <div className="mt-1 rounded-lg bg-[color:var(--color-surface-2,#f5f5f5)] px-3 py-2 text-xs text-[color:var(--color-muted)]">
            จากคลินิก: {appt.note}
          </div>
        )}
      </section>

      {awaiting && (
        <p className="text-center text-sm text-[color:var(--color-muted)]">
          ส่งคำขอแล้ว รอคลินิกยืนยัน หน้านี้จะอัปเดตอัตโนมัติ
        </p>
      )}
      {appt.status === "CONFIRMED" && (
        <p className="text-center text-sm text-green-700">
          คลินิกยืนยันนัดแล้ว ✓ พบกันตามเวลานัด · ค่าบริการชำระที่คลินิกหลังตรวจ
        </p>
      )}
      {appt.status === "REJECTED" && (
        <p className="text-center text-sm text-[color:var(--color-muted)]">
          ขออภัย คลินิกไม่สะดวกตามเวลาที่ขอ กรุณาขอนัดใหม่ในเวลาอื่น
        </p>
      )}

      <div className="text-center">
        <Link href={base} className="text-sm underline">
          ← ขอนัดใหม่
        </Link>
      </div>
    </main>
  );
}
