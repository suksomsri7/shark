import Link from "next/link";
import { cookies } from "next/headers";
import { resolveQueueUnit, getTicketStatus, getPublicOverview } from "@/lib/modules/queue/service";
import { AutoRefresh } from "@/components/queue-auto-refresh";
import { getLocaleFromCookie, makeT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// ป้ายสถานะ (ครอบคลุมทุกสถานะ รวม cancelled/no_show ที่ label กลางไม่มี)
// เก็บเป็น "คีย์ dict" เพื่อให้แปลได้ทั้ง th/en — ข้อความจริงอยู่ใน src/lib/i18n/dict.ts
const STATUS: Record<string, { key: string; tone: "wait" | "call" | "done" | "gone" }> = {
  WAITING: { key: "queue.st.WAITING", tone: "wait" },
  CALLED: { key: "queue.st.CALLED", tone: "call" },
  SERVING: { key: "queue.st.SERVING", tone: "call" },
  DONE: { key: "queue.st.DONE", tone: "done" },
  SKIPPED: { key: "queue.st.SKIPPED", tone: "gone" },
  NO_SHOW: { key: "queue.st.NO_SHOW", tone: "gone" },
  CANCELLED: { key: "queue.st.CANCELLED", tone: "gone" },
};

// หน้าสถานะบัตรคิวของลูกค้า (public จาก publicToken) — ดูอีกกี่คิวถึงตัว, auto-refresh
export default async function PublicTicketStatusPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string; publicToken: string }>;
}) {
  const { tenantSlug, unitSlug, publicToken } = await params;
  const base = `/s/${tenantSlug}/${unitSlug}/queue`;
  const locale = getLocaleFromCookie((await cookies()).get("lang")?.value);
  const t = makeT(locale);

  const resolved = await resolveQueueUnit(tenantSlug, unitSlug);
  if (!resolved) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">{t("queue.notFound.title")}</div>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">{t("queue.notFound.desc")}</p>
      </main>
    );
  }
  const { tenant, unit } = resolved;
  const ctx = { tenantId: tenant.id, unitId: unit.id };

  const [status, overview] = await Promise.all([
    getTicketStatus(unit.id, publicToken),
    getPublicOverview(ctx),
  ]);

  // ไม่พบบัตร หรือบัตรของ unit อื่น (getTicketStatus กัน cross-tenant ให้แล้ว) → สุภาพ + ปุ่มรับใหม่
  if (!status) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-4 px-5 py-16 text-center">
        <div className="text-lg font-semibold">{t("queue.t.notFound.title")}</div>
        <p className="text-sm text-[color:var(--color-muted)]">{t("queue.t.notFound.desc")}</p>
        <Link href={base} className="btn btn-primary min-h-[48px] w-full max-w-xs text-base">
          {t("queue.t.newTicket")}
        </Link>
      </main>
    );
  }

  const { ticket, position, estimateMin } = status;
  const meta = STATUS[ticket.status] ?? { key: ticket.status, tone: "gone" as const };
  const active = ticket.status === "WAITING" || ticket.status === "CALLED" || ticket.status === "SERVING";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-8">
      {active && <AutoRefresh ms={18000} />}

      <header className="text-center">
        <div className="text-base font-semibold">{unit.name}</div>
        <div className="text-xs text-[color:var(--color-muted)]">{tenant.name}</div>
      </header>

      {/* บัตรของฉัน */}
      <section className="card flex flex-col items-center gap-2 py-8 text-center">
        <div className="text-sm text-[color:var(--color-muted)]">{t("queue.t.yourNumber")}</div>
        <div className="text-6xl font-bold tracking-widest">{ticket.number}</div>
        <div
          className={`mt-1 rounded-full px-4 py-1 text-sm font-medium ${
            meta.tone === "call"
              ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
              : meta.tone === "gone"
                ? "text-[color:var(--color-danger)]"
                : "text-[color:var(--color-muted)]"
          }`}
        >
          {t(meta.key)}
        </div>
      </section>

      {/* เหลืออีกกี่คิว (เฉพาะตอนรอ) */}
      {ticket.status === "WAITING" && (
        <section className="card flex flex-col items-center gap-1 py-6 text-center">
          <div className="text-sm text-[color:var(--color-muted)]">{t("queue.t.remaining")}</div>
          <div className="text-4xl font-bold">
            {position} <span className="text-lg font-medium">{t("queue.t.queuesUnit")}</span>
          </div>
          <div className="text-sm text-[color:var(--color-muted)]">{t("queue.t.untilYours")}</div>
          {estimateMin != null && (
            <div className="mt-1 text-xs text-[color:var(--color-muted)]">
              {t("queue.t.estimate", { min: estimateMin })}
            </div>
          )}
        </section>
      )}

      {/* กำลังเรียก (บริบทหน้าร้าน) */}
      {active && (
        <section className="flex items-center justify-around gap-3 rounded-xl border px-4 py-3 text-center">
          <div>
            <div className="text-xs text-[color:var(--color-muted)]">{t("queue.calling")}</div>
            <div className="text-xl font-semibold tracking-wider">
              {overview.calling.length ? overview.calling.join(" · ") : "—"}
            </div>
          </div>
          <div className="h-8 w-px bg-[color:var(--color-border,#e5e5e5)]" />
          <div>
            <div className="text-xs text-[color:var(--color-muted)]">{t("queue.waitingNow")}</div>
            <div className="text-xl font-semibold">{overview.waitingCount}</div>
          </div>
        </section>
      )}

      {active ? (
        <p className="text-center text-xs text-[color:var(--color-muted)]">
          {t("queue.t.autoUpdate")}
        </p>
      ) : (
        <Link href={base} className="btn btn-primary min-h-[48px] w-full text-base">
          {t("queue.t.newTicket")}
        </Link>
      )}
    </main>
  );
}
