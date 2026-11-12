"use client";
// TRIPS T1.1 ▸ แผงขวาของจอสินค้า (ภาพ 16): ข้อมูลเอกสารชี้ชวน 9 ข้อ (แสดงอย่างเดียว ไม่บังคับ) · ค่าที่ใช้กับสินค้านี้ (อ่านอย่างเดียว + "แก้ที่ค่าตั้ง") · ลูกค้าจะเห็น
//   🔴 ตัวเลขทั้งหมดจากตัวโหลด (ตัวคิดราคาจริง) — คอมโพเนนต์จัดรูปอย่างเดียว
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ProductEditorVM } from "@/lib/modules/trips";
import { PROSPECTUS_TH, formatBaht, formatBahtShort, thDate } from "./trips-shared";
import { CARD, INPUT, Pill } from "./ProductsScreenParts";

export default function ProductsScreenPanels({ unitSlug, vm, exampleHref }: { unitSlug: string; vm: ProductEditorVM; exampleHref: (ex: string) => string }) {
  const t = useTranslations("trips");
  const router = useRouter();
  const b = vm.brochure;
  const ex = vm.example;
  const settingsHref = `/app/u/${unitSlug}/trips/settings?scope=PRODUCT&id=${encodeURIComponent(vm.product.id)}`;
  return (
    <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 xl:col-start-auto">
      {/* ── ชี้ชวน ── */}
      <section data-testid="trips-brochure" data-enabled={b.enabled ? "true" : "false"} className={CARD}>
        <h3 className="text-base font-bold">{t("brochure.title")}</h3>
        {b.enabled ? (
          <>
            <p className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{`${b.pct}%`}</span>
              <span className="text-sm text-[color:var(--color-ink-soft)]">{t("brochure.of", { done: b.done, total: b.total })}</span>
            </p>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={b.total} aria-valuenow={b.done} aria-label={t("brochure.title")} className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--color-surface-2)]">
              <div className="h-full bg-[color:var(--color-ink)]" style={{ width: `${b.pct}%` }} />
            </div>
            <p className="text-sm text-[color:var(--color-muted)]">{t("brochure.note")}</p>
            <ul className="flex flex-col gap-2">
              {b.items.map((it) => (
                <li key={it.code} data-done={it.done ? "true" : "false"} className="flex items-start gap-2 text-sm">
                  <span aria-hidden="true" className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${it.done ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "border border-dashed border-[color:var(--color-ink-soft)]"}`}>
                    {it.done ? "✓" : ""}
                  </span>
                  <span className={it.done ? "font-medium" : "text-[color:var(--color-ink-soft)]"}>
                    {PROSPECTUS_TH[it.code] ?? it.code}
                    <span className="sr-only">{it.done ? t("brochure.done") : t("brochure.missing")}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-[color:var(--color-muted)]">{t("brochure.disabled")}</p>
        )}
      </section>

      {/* ── ค่าที่ใช้กับสินค้านี้ ── */}
      <section data-testid="trips-applied" className={CARD}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-bold">{t("applied.title")}</h3>
          {vm.flags.canOpenSettings ? (
            <a data-testid="trips-applied-edit" href={settingsHref} className="inline-flex min-h-11 items-center text-sm font-bold text-[color:var(--color-accent)]">
              {t("applied.edit")}
            </a>
          ) : null}
        </div>
        <dl className="flex flex-col gap-2">
          {vm.applied.map((a) => (
            <div key={a.key} data-key={a.key} className="flex min-w-0 items-start justify-between gap-2 text-sm">
              <dt className="text-[color:var(--color-ink-soft)]">{t(`applied.keys.${a.key.replace(/\./g, "_")}`)}</dt>
              <dd className="flex flex-col items-end gap-1 text-right font-bold">
                {a.valueTh}
                {a.atProduct ? <Pill shape="solid">{t("applied.atProduct")}</Pill> : null}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-[color:var(--color-muted)]">{t("applied.note")}</p>
      </section>

      {/* ── ลูกค้าจะเห็น ── */}
      <section data-testid="trips-example" className={CARD}>
        <h3 className="text-base font-bold">{t("example.title")}</h3>
        {ex.choices.length ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[color:var(--color-ink-soft)]">{t("example.departure")}</span>
            <select data-testid="trips-example-departure" className={INPUT} value={ex.departureId ?? ""} onChange={(e) => router.push(exampleHref(e.target.value))}>
              {ex.choices.map((c) => (
                <option key={c.departureId} value={c.departureId}>
                  {thDate(c.localDate)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {ex.error ? (
          <p role="status" className="rounded-lg border border-dashed border-[color:var(--color-line)] px-3 py-2 text-sm text-[color:var(--color-ink-soft)]">
            {ex.error}
          </p>
        ) : (
          <>
            <dl className="flex flex-col gap-2">
              {ex.lines.map((l, i) => (
                <div key={`${l.labelTh}-${i}`} className="flex min-w-0 items-start justify-between gap-2 border-b border-dashed border-[color:var(--color-line)] pb-2 text-sm">
                  <dt className="text-[color:var(--color-ink-soft)]">{l.unitSatang !== null ? `${l.labelTh} ${l.qty} × ${formatBahtShort(l.unitSatang)}` : l.labelTh}</dt>
                  <dd className="font-medium">{formatBaht(l.amountSatang)}</dd>
                </div>
              ))}
            </dl>
            <p className="flex items-baseline justify-between gap-2">
              <span className="text-base font-bold">{t("example.total")}</span>
              <span data-testid="trips-example-total" className="text-lg font-bold">{`฿${ex.totalText ?? "—"}`}</span>
            </p>
            {ex.localDate ? <p className="text-sm text-[color:var(--color-muted)]">{t("example.note", { date: thDate(ex.localDate, false), season: ex.seasonName ?? "—" })}</p> : null}
          </>
        )}
      </section>
    </aside>
  );
}
