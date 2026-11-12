"use client";
// TRIPS T1.1 ▸ จอสินค้าทัวร์ฝั่งร้าน (ภาพ 16): สามคอลัมน์ — รายการสินค้า · ตัวแก้สินค้า · แผงขวา (ชี้ชวน · ค่าที่ใช้ · ลูกค้าจะเห็น)
//   ข้อมูลทั้งหมดมาจากตัวโหลด (loadProductListVM / loadProductEditorVM) · เขียนผ่าน server action เท่านั้น · URL: ?type= &q= &archived=1 &p= &ex=
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ProductEditorVM, ProductListVM } from "@/lib/modules/trips";
import { createProductAction } from "@/lib/modules/trips/product-actions";
import { BTN, CARD, Dialog, ErrorLine, Field, INPUT, BTN_PRIMARY, Pill, statusShape, useRunner } from "./ProductsScreenParts";
import ProductsScreenEditor from "./ProductsScreenEditor";
import ProductsScreenPanels from "./ProductsScreenPanels";

export type ProductsFilters = { type: "TOUR" | "LIVEABOARD" | null; q: string; archived: boolean; productId: string | null };

const hrefOf = (base: string, f: ProductsFilters, patch: Partial<ProductsFilters> & { ex?: string | null }): string => {
  const n = { ...f, ...patch };
  const sp = new URLSearchParams();
  if (n.type) sp.set("type", n.type);
  if (n.q) sp.set("q", n.q);
  if (n.archived) sp.set("archived", "1");
  if (n.productId) sp.set("p", n.productId);
  if (patch.ex) sp.set("ex", patch.ex);
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
};

export default function ProductsScreen({ unitSlug, list, editor, filters }: { unitSlug: string; list: ProductListVM; editor: ProductEditorVM | null; filters: ProductsFilters }) {
  const t = useTranslations("trips");
  const base = `/app/u/${unitSlug}/trips/products`;
  const [creating, setCreating] = useState(false);
  const statusTh = (s: string) => (s === "ACTIVE" ? t("products.statusActive") : s === "DRAFT" ? t("products.statusDraft") : t("products.statusArchived"));
  const filterCls = (on: boolean) => `inline-flex min-h-11 items-center rounded-lg px-3 text-sm ${on ? "border-2 border-[color:var(--color-ink)] font-bold" : "border border-[color:var(--color-line)] text-[color:var(--color-ink-soft)]"}`;

  return (
    <div data-trips-products="" className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_300px]">
      {/* ── ซ้าย: รายการสินค้า ── */}
      <aside data-testid="trips-product-list" className={`${CARD} p-0`}>
        <div className="flex flex-col gap-3 p-4 pb-0">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-base font-bold text-[color:var(--color-ink)]">{t("products.count", { n: list.counts.all })}</h1>
            {list.canCreate ? (
              <button type="button" data-testid="trips-product-add" className={BTN} onClick={() => setCreating(true)}>
                {t("products.add")}
              </button>
            ) : null}
          </div>
          <form method="get" action={base} role="search" className="flex min-w-0">
            {filters.type ? <input type="hidden" name="type" value={filters.type} /> : null}
            {filters.archived ? <input type="hidden" name="archived" value="1" /> : null}
            <input data-testid="trips-product-search" type="search" name="q" defaultValue={filters.q} placeholder={t("products.search")} aria-label={t("products.search")} className={INPUT} />
          </form>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("products.filterAria")}>
            <a data-testid="trips-product-filter-all" href={hrefOf(base, filters, { type: null, productId: null })} aria-current={!filters.type ? "true" : undefined} className={filterCls(!filters.type)}>
              {t("products.filterAll", { n: list.counts.all })}
            </a>
            <a data-testid="trips-product-filter-tour" href={hrefOf(base, filters, { type: "TOUR", productId: null })} aria-current={filters.type === "TOUR" ? "true" : undefined} className={filterCls(filters.type === "TOUR")}>
              {t("products.filterTour", { n: list.counts.TOUR })}
            </a>
            <a data-testid="trips-product-filter-liveaboard" href={hrefOf(base, filters, { type: "LIVEABOARD", productId: null })} aria-current={filters.type === "LIVEABOARD" ? "true" : undefined} className={filterCls(filters.type === "LIVEABOARD")}>
              {t("products.filterLiveaboard", { n: list.counts.LIVEABOARD })}
            </a>
            <a data-testid="trips-product-filter-archived" href={hrefOf(base, filters, { archived: !filters.archived, productId: null })} aria-current={filters.archived ? "true" : undefined} className={filterCls(filters.archived)}>
              {t("products.filterArchived", { n: list.counts.archived })}
            </a>
          </div>
        </div>
        {list.items.length === 0 ? (
          <p data-testid="trips-product-empty" className="p-4 text-sm text-[color:var(--color-muted)]">
            {filters.q || filters.type ? t("products.emptyFiltered") : t("products.empty")}
          </p>
        ) : (
          <ul className="flex flex-col">
            {list.items.map((it) => {
              const on = editor?.product.id === it.id;
              return (
                <li key={it.id} className="border-t border-[color:var(--color-line)]">
                  <a
                    data-testid={`trips-product-item-${it.id}`}
                    href={hrefOf(base, filters, { productId: it.id })}
                    aria-current={on ? "page" : undefined}
                    className={`flex min-h-11 flex-col gap-1 px-4 py-3 ${on ? "border-l-4 border-[color:var(--color-accent)] bg-[color:var(--color-surface-2)]" : "border-l-4 border-transparent"}`}
                  >
                    <span className="text-sm font-bold text-[color:var(--color-ink)]">{it.title}</span>
                    <span className="flex flex-wrap items-center gap-2 text-sm text-[color:var(--color-ink-soft)]">
                      <Pill shape={statusShape(it.status)} status={it.status}>
                        {statusTh(it.status)}
                      </Pill>
                      {it.optionSummary}
                    </span>
                    <span className="text-sm text-[color:var(--color-muted)]">
                      {[it.prospectus ? t("products.prospectus", { done: it.prospectus.done, total: it.prospectus.total }) : null, it.enMissing > 0 ? t("products.enMissing", { n: it.enMissing }) : t("products.enDone")].filter(Boolean).join(" · ")}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--color-line)] p-4 text-sm text-[color:var(--color-muted)]">
          {t("products.legendDraft")} <Pill shape="dashed">{t("products.statusDraft")}</Pill> · {t("products.legendActive")} <Pill shape="solid">{t("products.statusActive")}</Pill>
        </div>
      </aside>

      {/* ── กลาง + ขวา ── */}
      {editor ? (
        <>
          <ProductsScreenEditor unitSlug={unitSlug} vm={editor} />
          <ProductsScreenPanels unitSlug={unitSlug} vm={editor} exampleHref={(ex) => hrefOf(base, filters, { productId: editor.product.id, ex })} />
        </>
      ) : (
        <section className={`${CARD} xl:col-span-2`}>
          <p className="text-sm text-[color:var(--color-muted)]">{t("products.noProduct")}</p>
        </section>
      )}

      {creating ? <CreateDialog unitSlug={unitSlug} onClose={() => setCreating(false)} base={base} /> : null}
    </div>
  );
}

function CreateDialog({ unitSlug, onClose, base }: { unitSlug: string; onClose: () => void; base: string }) {
  const t = useTranslations("trips");
  const { busy, error, run, router } = useRunner(t("common.failed"));
  const [type, setType] = useState<"TOUR" | "LIVEABOARD">("TOUR");
  const [slug, setSlug] = useState("");
  const [th, setTh] = useState("");
  const [en, setEn] = useState("");
  const submit = () =>
    run(async () => {
      const r = await createProductAction(unitSlug, { productType: type, slug: slug.trim(), title: { th: th.trim(), ...(en.trim() ? { en: en.trim() } : {}) } });
      if (r.ok && "id" in r) router.push(`${base}?p=${encodeURIComponent(String(r.id))}`);
      return r;
    }, onClose);
  return (
    <Dialog title={t("create.title")} onClose={onClose} closeLabel={t("common.close")}>
      <Field label={t("create.type")}>
        <select className={INPUT} value={type} onChange={(e) => setType(e.target.value === "LIVEABOARD" ? "LIVEABOARD" : "TOUR")}>
          <option value="TOUR">{t("create.typeTour")}</option>
          <option value="LIVEABOARD">{t("create.typeLiveaboard")}</option>
        </select>
      </Field>
      <Field label={t("create.nameTh")}>
        <input className={INPUT} value={th} onChange={(e) => setTh(e.target.value)} />
      </Field>
      <Field label={t("create.nameEn")}>
        <input className={INPUT} value={en} onChange={(e) => setEn(e.target.value)} />
      </Field>
      <Field label={t("create.slug")} hint={t("create.slugHint")}>
        <input className={INPUT} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
      </Field>
      <ErrorLine text={error} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BTN_PRIMARY} disabled={busy || !th.trim() || !slug.trim()} onClick={() => void submit()}>
          {t("create.submit")}
        </button>
        <button type="button" className={BTN} onClick={onClose}>
          {t("common.cancel")}
        </button>
      </div>
    </Dialog>
  );
}
