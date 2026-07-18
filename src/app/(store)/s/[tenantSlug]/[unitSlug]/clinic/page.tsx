import { resolveClinicUnit } from "@/lib/modules/clinic/service";
import { createPublicAppointmentAction } from "./actions";

export const dynamic = "force-dynamic";

// เวลา BKK สำหรับ min ของ datetime-local (กันเลือกอดีต) — "YYYY-MM-DDTHH:mm"
function nowBkkLocal() {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 16);
}

// หน้าขอนัดคลินิกออนไลน์ (public · ไม่ต้องล็อกอิน · ไม่เก็บเงินล่วงหน้า)
//   กรอกชื่อ/เบอร์/วันเวลาที่สะดวก/อาการเบื้องต้น → ขอนัด → รอร้านยืนยัน
export default async function PublicClinicPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { tenantSlug, unitSlug } = await params;
  const sp = await searchParams;

  const resolved = await resolveClinicUnit(tenantSlug, unitSlug);
  if (!resolved) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">ไม่พบคลินิกนี้</div>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">
          ลิงก์อาจไม่ถูกต้อง หรือปิดรับนัดออนไลน์ กรุณาสอบถามที่คลินิก
        </p>
      </main>
    );
  }
  const { tenant, unit } = resolved;
  const minLocal = nowBkkLocal();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-8">
      <header className="text-center">
        <div className="text-xl font-semibold">{unit.name}</div>
        <div className="text-sm text-[color:var(--color-muted)]">{tenant.name}</div>
      </header>

      {sp.err && (
        <div className="rounded-xl border border-[color:var(--color-danger)] px-4 py-3 text-center text-sm text-[color:var(--color-danger)]">
          {sp.err}
        </div>
      )}

      <form action={createPublicAppointmentAction} className="card flex flex-col gap-3">
        <div className="text-base font-semibold">ขอนัดหมาย</div>
        <input type="hidden" name="tenantSlug" value={tenantSlug} />
        <input type="hidden" name="unitSlug" value={unitSlug} />

        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">ชื่อผู้ป่วย</span>
          <input
            name="patientName"
            required
            maxLength={120}
            placeholder="ชื่อ-นามสกุล"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">เบอร์โทรติดต่อ</span>
          <input
            name="patientPhone"
            required
            inputMode="tel"
            maxLength={32}
            placeholder="เบอร์โทร"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">วันเวลาที่สะดวก</span>
          <input
            type="datetime-local"
            name="preferredAt"
            required
            min={minLocal}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">อาการเบื้องต้น (ถ้ามี)</span>
          <textarea
            name="symptom"
            maxLength={500}
            rows={2}
            placeholder="เล่าอาการคร่าว ๆ เท่าที่สะดวก"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </label>

        <button className="btn btn-primary min-h-[44px] text-base">ขอนัด</button>
      </form>

      <p className="text-center text-xs text-[color:var(--color-muted)]">
        ขอนัดแล้วรับลิงก์ดูสถานะได้ทันที ไม่ต้องล็อกอิน · ค่าบริการชำระที่คลินิกหลังตรวจ
      </p>
    </main>
  );
}
