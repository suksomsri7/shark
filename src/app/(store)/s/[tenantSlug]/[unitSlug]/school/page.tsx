import { resolveSchoolUnit, listPublicClasses } from "@/lib/modules/school/service";
import { createPublicEnrollmentAction } from "./actions";

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

// หน้าสมัครเรียนออนไลน์ (public · ไม่ต้องล็อกอิน) — เลือกรอบเรียน → กรอกชื่อผู้เรียน/เบอร์ผู้ปกครอง → สมัคร
export default async function PublicSchoolPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string }>;
  searchParams: Promise<{ err?: string; class?: string }>;
}) {
  const { tenantSlug, unitSlug } = await params;
  const sp = await searchParams;

  const resolved = await resolveSchoolUnit(tenantSlug, unitSlug);
  if (!resolved) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">ไม่พบสถาบันนี้</div>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">
          ลิงก์อาจไม่ถูกต้อง หรือปิดรับสมัครออนไลน์ กรุณาสอบถามที่หน้าร้าน
        </p>
      </main>
    );
  }
  const { tenant, unit } = resolved;

  const classes = await listPublicClasses({ tenantId: tenant.id, unitId: unit.id });
  const hasClasses = classes.length > 0;

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

      {!hasClasses ? (
        <div className="rounded-xl border px-4 py-8 text-center text-sm text-[color:var(--color-muted)]">
          ยังไม่มีรอบเรียนที่เปิดรับสมัครตอนนี้ กรุณากลับมาใหม่ภายหลัง หรือสอบถามที่หน้าร้าน
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {classes.map((cl) => (
            <section key={cl.id} className="card flex flex-col gap-3">
              <div>
                <div className="text-base font-semibold">{cl.courseName}</div>
                <div className="text-xs text-[color:var(--color-muted)]">
                  {cl.className}
                  {cl.startDate ? ` · เริ่ม ${fmtDate(cl.startDate)}` : ""}
                </div>
                <div className="mt-1 text-sm font-medium">
                  ฿{baht(cl.priceSatang)}
                  {cl.remaining !== null && !cl.full && cl.remaining <= 5 ? (
                    <span className="text-[color:var(--color-muted)]"> · เหลือ {cl.remaining} ที่</span>
                  ) : null}
                </div>
                {cl.description && (
                  <p className="mt-1 text-sm text-[color:var(--color-muted)]">{cl.description}</p>
                )}
              </div>

              {cl.full ? (
                <div className="rounded-lg bg-[color:var(--color-surface-2,#f5f5f5)] px-3 py-2 text-center text-sm text-[color:var(--color-muted)]">
                  รอบนี้เต็มแล้ว ลองเลือกรอบอื่น
                </div>
              ) : (
                <form action={createPublicEnrollmentAction} className="flex flex-col gap-2">
                  <input type="hidden" name="tenantSlug" value={tenantSlug} />
                  <input type="hidden" name="unitSlug" value={unitSlug} />
                  <input type="hidden" name="classId" value={cl.id} />
                  <input
                    name="studentName"
                    required
                    maxLength={120}
                    placeholder="ชื่อผู้เรียน"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  />
                  <input
                    name="parentPhone"
                    required
                    inputMode="tel"
                    maxLength={32}
                    placeholder="เบอร์โทรผู้ปกครอง"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  />
                  <button className="btn btn-primary min-h-[44px] text-base">
                    สมัครเรียน · ฿{baht(cl.priceSatang)}
                  </button>
                </form>
              )}
            </section>
          ))}
        </div>
      )}

      <p className="text-center text-xs text-[color:var(--color-muted)]">
        สมัครแล้วรับลิงก์จ่ายค่าเรียนและดูสถานะได้ทันที ไม่ต้องล็อกอิน
      </p>
    </main>
  );
}
