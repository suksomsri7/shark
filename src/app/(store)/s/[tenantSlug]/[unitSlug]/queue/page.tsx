import { resolveQueueUnit, listOnlineTypes, getPublicOverview } from "@/lib/modules/queue/service";
import { AutoRefresh } from "@/components/queue-auto-refresh";
import { QueuePublicForm } from "@/components/queue-public-form";
import { issuePublicTicketAction } from "./actions";
import { cookies } from "next/headers";
import { getLocaleFromCookie, makeT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const dynamic = "force-dynamic";

// ?err= จาก action เป็นรหัส → หน้า/ฟอร์มเป็นคนแปล
const ERR_CODES = new Set(["rate", "shop", "closed", "type", "phone", "failed"]);

// หน้ารับบัตรคิว (public · ไม่ต้องล็อกอิน) — ลูกค้าสแกน QR หน้าร้านแล้วกดรับบัตรจากมือถือ
export default async function PublicQueueIntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string }>;
  searchParams: Promise<{ err?: string; typeId?: string }>;
}) {
  const { tenantSlug, unitSlug } = await params;
  const { err, typeId } = await searchParams;
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

  const [types, overview] = await Promise.all([
    listOnlineTypes(ctx),
    getPublicOverview(ctx),
  ]);

  const closed = !overview.onlineOpen || types.length === 0;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-8">
      <AutoRefresh ms={20000} />

      <header className="flex items-start justify-between gap-3">
        <div className="flex-1 text-center">
          <div className="text-xl font-semibold">{unit.name}</div>
          <div className="text-sm text-[color:var(--color-muted)]">{tenant.name}</div>
        </div>
        <LanguageSwitcher locale={locale} />
      </header>

      {/* สถานะคิวตอนนี้ */}
      <section className="card flex items-center justify-around gap-3 text-center">
        <div>
          <div className="text-xs text-[color:var(--color-muted)]">{t("queue.calling")}</div>
          <div className="text-2xl font-bold tracking-wider">
            {overview.calling.length ? overview.calling.join(" · ") : "—"}
          </div>
        </div>
        <div className="h-10 w-px bg-[color:var(--color-border,#e5e5e5)]" />
        <div>
          <div className="text-xs text-[color:var(--color-muted)]">{t("queue.waitingNow")}</div>
          <div className="text-2xl font-bold">{overview.waitingCount}</div>
        </div>
      </section>

      {/* รับบัตร */}
      {closed ? (
        <div className="rounded-xl border px-4 py-6 text-center text-sm text-[color:var(--color-muted)]">
          {types.length === 0 ? t("queue.noTypes") : t("queue.closed")}
        </div>
      ) : (
        <QueuePublicForm
          action={issuePublicTicketAction}
          tenantSlug={tenantSlug}
          unitSlug={unitSlug}
          types={types.map((t) => ({
            id: t.id,
            name: t.name,
            prefix: t.prefix,
            requireContact: t.requireContact,
          }))}
          serverError={err && ERR_CODES.has(err) ? t(`queue.err.${err}`) : err ? t("err.general") : undefined}
          locale={locale}
          presetTypeId={typeId}
        />
      )}

      <p className="text-center text-xs text-[color:var(--color-muted)]">
        {t("queue.footer")}
      </p>
    </main>
  );
}
