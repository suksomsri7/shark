import { resolveUnit, listPublicEvents } from "@/lib/modules/ticket/service";
import { createPublicTicketOrderAction } from "./actions";

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

// หน้าซื้อตั๋วออนไลน์ (public · ไม่ต้องล็อกอิน) — เลือกงาน → เลือกประเภท+จำนวน → กรอกชื่อ/เบอร์ → ซื้อ
export default async function PublicTicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string }>;
  searchParams: Promise<{ err?: string; event?: string }>;
}) {
  const { tenantSlug, unitSlug } = await params;
  const sp = await searchParams;

  const resolved = await resolveUnit(tenantSlug, unitSlug);
  if (!resolved) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">ไม่พบร้านนี้</div>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">
          ลิงก์อาจไม่ถูกต้อง หรือร้านปิดขายตั๋วออนไลน์ กรุณาสอบถามที่หน้าร้าน
        </p>
      </main>
    );
  }
  const { tenant, unit } = resolved;

  const events = await listPublicEvents(tenant.id, unit.id);
  const hasEvents = events.length > 0;

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

      {!hasEvents ? (
        <div className="rounded-xl border px-4 py-8 text-center text-sm text-[color:var(--color-muted)]">
          ยังไม่มีงานที่เปิดขายตั๋วตอนนี้ กรุณากลับมาใหม่ภายหลัง หรือสอบถามที่หน้าร้าน
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {events.map((ev) => {
            const allSoldOut = ev.types.length > 0 && ev.types.every((t) => t.remaining < 1);
            const noTypes = ev.types.length === 0;
            return (
              <section key={ev.id} className="card flex flex-col gap-3">
                <div>
                  <div className="text-base font-semibold">{ev.name}</div>
                  <div className="text-xs text-[color:var(--color-muted)]">
                    {fmtEvent(ev.startAt)}
                    {ev.venue ? ` · ${ev.venue}` : ""}
                  </div>
                  {ev.description && (
                    <p className="mt-1 text-sm text-[color:var(--color-muted)]">{ev.description}</p>
                  )}
                </div>

                {noTypes ? (
                  <div className="rounded-lg bg-[color:var(--color-surface-2,#f5f5f5)] px-3 py-2 text-center text-sm text-[color:var(--color-muted)]">
                    ยังไม่เปิดจำหน่ายตั๋วสำหรับงานนี้
                  </div>
                ) : allSoldOut ? (
                  <div className="rounded-lg bg-[color:var(--color-surface-2,#f5f5f5)] px-3 py-2 text-center text-sm text-[color:var(--color-muted)]">
                    ตั๋วงานนี้จำหน่ายหมดแล้ว
                  </div>
                ) : (
                  <form action={createPublicTicketOrderAction} className="flex flex-col gap-3">
                    <input type="hidden" name="tenantSlug" value={tenantSlug} />
                    <input type="hidden" name="unitSlug" value={unitSlug} />
                    <input type="hidden" name="eventId" value={ev.id} />

                    <div className="flex flex-col gap-2">
                      {ev.types.map((t) => {
                        const soldOut = t.remaining < 1;
                        return (
                          <div
                            key={t.id}
                            className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{t.name}</div>
                              <div className="text-xs text-[color:var(--color-muted)]">
                                ฿{baht(t.priceSatang)}
                                {soldOut
                                  ? " · เต็มแล้ว"
                                  : t.remaining <= 10
                                    ? ` · เหลือ ${t.remaining} ใบ`
                                    : ""}
                              </div>
                              {t.description && (
                                <div className="text-xs text-[color:var(--color-muted)]">
                                  {t.description}
                                </div>
                              )}
                            </div>
                            <input
                              type="number"
                              name={`qty:${t.id}`}
                              defaultValue={0}
                              min={0}
                              max={Math.min(50, t.remaining)}
                              disabled={soldOut}
                              inputMode="numeric"
                              aria-label={`จำนวนตั๋ว ${t.name}`}
                              className="w-16 shrink-0 rounded-lg border px-2 py-2 text-center text-sm disabled:opacity-40"
                            />
                          </div>
                        );
                      })}
                    </div>

                    <input
                      name="buyerName"
                      required
                      maxLength={120}
                      placeholder="ชื่อผู้ซื้อ"
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    />
                    <input
                      name="buyerPhone"
                      required
                      inputMode="tel"
                      maxLength={32}
                      placeholder="เบอร์โทรติดต่อ"
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    />
                    <button className="btn btn-primary min-h-[44px] text-base">ซื้อตั๋ว</button>
                  </form>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-[color:var(--color-muted)]">
        ซื้อแล้วรับลิงก์จ่ายเงินและตั๋ว QR ได้ทันที ไม่ต้องล็อกอิน
      </p>
    </main>
  );
}
