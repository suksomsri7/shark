"use client";
// TRIPS T1.1 ▸ ตัวแก้สินค้า (ภาพ 16 คอลัมน์กลาง): หัวสินค้า · แท็บ (anchor) · ตัวเลือก · ประเภทคน/ช่วงอายุ · ฤดูกาลและรายรอบ · รายการเสริม · รับส่ง · เนื้อหาไทย/EN
//   🔴 ทุกตัวเลข/สถานะ/สิทธิ์มาจาก ProductEditorVM (ตัวโหลด) — คอมโพเนนต์นี้ไม่คิดราคา ไม่ตัดสินสิทธิ์ ไม่ตัดสิน "เต็ม"
//   🔴 เขียนผ่าน server action ของ T0.2/T0.5/T1.1 เท่านั้น · ปุ่ม "บันทึก" บนหัว = บันทึกส่วนที่แก้ค้างอยู่ (ช่วงอายุ) · ส่วนอื่นบันทึกในกล่องของตัวเอง (มติ Q4)
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { ExtraRowVM, PickupZoneDTO, ProductEditorVM } from "@/lib/modules/trips";
import {
  archiveProductAction,
  createExtraAction,
  createOptionAction,
  publishProductAction,
  restoreProductAction,
  setExtraActiveAction,
  setOptionActiveAction,
  setProductContentAction,
  unpublishProductAction,
  updatePaxTypeAction,
} from "@/lib/modules/trips/product-actions";
import { saveSeasonAction, setPriceAction } from "@/lib/modules/trips/pricing-actions";
import { createPickupZoneAction, listPickupZonesAction, reorderPickupZonesAction, setPickupZoneActiveAction, updatePickupZoneAction } from "@/lib/modules/trips/pickup-actions";
import { EXTRA_BASIS_CODES, EXTRA_KIND_CODES, formatBahtShort } from "./trips-shared";
import { BTN, BTN_PRIMARY, CARD, Dialog, ErrorLine, Field, INPUT, Pill, TD, TH, bahtToSatang, intOrNull, statusShape, useRunner, useYmd } from "./ProductsScreenParts";

type VM = ProductEditorVM;
type T = ReturnType<typeof useTranslations>;
const DEFAULT_PAX = ["ADULT", "CHILD", "INFANT"];
/** ป้ายประเภทคน: รหัสมาตรฐานใช้ messages · รหัสที่ร้านตั้งเองใช้ชื่อของร้าน */
const paxLabel = (t: T, code: string, labelTh: string) => (DEFAULT_PAX.includes(code) ? t(`pax.codes.${code}`) : labelTh);
/** ทรัพยากรของกฎรอบ → ข้อความตามภาษา */
function resourcesText(t: T, r: VM["options"][number]["resources"]): string {
  if (!r) return "—";
  const parts = [...r.boats, ...(r.vans ? [t("options.vans", { n: r.vans })] : []), ...(r.guides ? [t("options.guides", { n: r.guides })] : []), ...r.others];
  return parts.length ? parts.join(" · ") : "—";
}
const money = (s: number | null | undefined) => (typeof s === "number" ? formatBahtShort(s) : "—");
const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export default function ProductsScreenEditor({ unitSlug, vm }: { unitSlug: string; vm: VM }) {
  const t = useTranslations("trips");
  const ymd = useYmd();
  const { busy, error, run } = useRunner(t("common.failed"));
  const p = vm.product;
  const f = vm.flags;
  const [ages, setAges] = useState<Record<string, { from: string; to: string }>>({});
  const [dialog, setDialog] = useState<null | { kind: "archive" } | { kind: "option" } | { kind: "season" } | { kind: "depPrice" } | { kind: "extra" } | { kind: "pickup"; zone: PickupZoneDTO | null } | { kind: "content"; section: string }>(null);
  const close = () => setDialog(null);
  const statusTh = p.status === "ACTIVE" ? t("products.statusActive") : p.status === "DRAFT" ? t("products.statusDraft") : t("products.statusArchived");
  const adult = vm.paxRows.find((r) => r.code === "ADULT") ?? vm.paxRows.find((r) => r.countsCapacity) ?? null;
  const settingsHref = `/app/u/${unitSlug}/trips/settings?scope=PRODUCT&id=${encodeURIComponent(p.id)}`;

  // ── ช่วงอายุที่แก้ค้าง (บันทึกด้วยปุ่มบน) ──
  const dirtyAges = useMemo(
    () =>
      vm.paxRows.flatMap((r) => {
        const e = ages[r.code];
        if (!e) return [];
        const from = r.code === "INFANT" ? 0 : intOrNull(e.from);
        const to = r.code === "ADULT" ? null : r.code === "INFANT" ? (intOrNull(e.to) === null ? null : (intOrNull(e.to) ?? 1) - 1) : intOrNull(e.to);
        if (from === null) return [];
        if (from === r.ageFrom && to === r.ageTo) return [];
        return [{ paxTypeId: r.paxTypeId, ageMin: from, ageMax: to }];
      }),
    [ages, vm.paxRows],
  );
  const saveTop = () => run(async () => Promise.all(dirtyAges.map((a) => updatePaxTypeAction(unitSlug, a))), () => setAges({}));
  const ageVal = (code: string, which: "from" | "to", cur: number | null) => ages[code]?.[which] ?? (cur === null ? "" : String(cur));
  const setAge = (code: string, which: "from" | "to", v: string, row: { ageFrom: number; ageTo: number | null }) =>
    setAges((a) => ({ ...a, [code]: { from: a[code]?.from ?? String(row.ageFrom), to: a[code]?.to ?? (row.ageTo === null ? "" : String(code === "INFANT" ? row.ageTo + 1 : row.ageTo)), [which]: v } }));

  const tabCls = "inline-flex min-h-11 items-center rounded-lg border border-[color:var(--color-line)] px-3 text-sm text-[color:var(--color-ink)]";
  const soonCls = "inline-flex min-h-11 items-center rounded-lg border border-dashed border-[color:var(--color-line)] px-3 text-sm text-[color:var(--color-muted)]";

  return (
    <div data-testid="trips-product-editor" data-product={p.id} data-readonly={f.readOnly ? "true" : "false"} className="flex min-w-0 flex-col gap-4">
      {/* ── หัวสินค้า ── */}
      <header className="flex min-w-0 flex-col gap-3">
        <p className="text-sm text-[color:var(--color-muted)]">{`${t("editor.crumb")} › ${p.productType === "LIVEABOARD" ? t("create.typeLiveaboard") : t("create.typeTour")}`}</p>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h2 className="min-w-0 text-xl font-bold text-[color:var(--color-ink)]">{p.title.th}</h2>
            <span data-testid="trips-product-status" data-status={p.status}>
              <Pill shape={statusShape(p.status)} status={p.status}>
                {statusTh}
              </Pill>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" data-testid="trips-product-preview" className={BTN} disabled aria-disabled="true" title={t("editor.previewSoon")}>
              {t("editor.preview")}
            </button>
            {f.canPublish && p.status === "DRAFT" ? (
              <button type="button" data-testid="trips-product-publish" className={BTN} disabled={busy} onClick={() => void run(() => publishProductAction(unitSlug, { productId: p.id }))}>
                {t("editor.publish")}
              </button>
            ) : null}
            {f.canPublish && p.status === "ACTIVE" ? (
              <button type="button" data-testid="trips-product-unpublish" className={BTN} disabled={busy} onClick={() => void run(() => unpublishProductAction(unitSlug, { productId: p.id }))}>
                {t("editor.unpublish")}
              </button>
            ) : null}
            {f.canPublish && p.status !== "ARCHIVED" ? (
              <button type="button" data-testid="trips-product-archive" className={BTN} disabled={busy} onClick={() => setDialog({ kind: "archive" })}>
                {t("editor.archive")}
              </button>
            ) : null}
            {f.canPublish && p.status === "ARCHIVED" ? (
              <button type="button" data-testid="trips-product-restore" className={BTN} disabled={busy} onClick={() => void run(() => restoreProductAction(unitSlug, { productId: p.id }))}>
                {t("editor.restore")}
              </button>
            ) : null}
            {!f.readOnly ? (
              <button type="button" data-testid="trips-product-save" className={BTN_PRIMARY} disabled={busy || dirtyAges.length === 0} onClick={() => void saveTop()}>
                {dirtyAges.length ? t("editor.saveN", { n: dirtyAges.length }) : t("editor.save")}
              </button>
            ) : null}
          </div>
        </div>
        {p.archived ? <p className="rounded-lg border border-dashed border-[color:var(--color-line)] px-3 py-2 text-sm text-[color:var(--color-ink-soft)]">{t("editor.archivedNote")}</p> : null}
        {!p.archived && !f.canEdit ? <p className="rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-ink-soft)]">{t("editor.readOnly")}</p> : null}
        {f.showCurrency ? <p className="text-sm text-[color:var(--color-ink-soft)]">{t(f.currencyLocked ? "editor.currencyLocked" : "editor.currency", { c: p.currency })}</p> : null}
        <ErrorLine text={error} />
        <nav aria-label={t("editor.tabsAria")} className="flex min-w-0 flex-wrap gap-2">
          {(["options", "extras", "pickup", "content"] as const).map((k) => (
            <a key={k} href={`#${k}`} data-testid={`trips-editor-tab-${k}`} className={tabCls}>
              {t(`editor.tabs.${k}`)}
            </a>
          ))}
          {(["passengers", "cost"] as const).map((k) => (
            <span key={k} data-testid={`trips-editor-tab-${k}`} aria-disabled="true" title={t("editor.tabSoon", { wo: k === "passengers" ? "T0.8" : "T1.7" })} className={soonCls}>
              {t(`editor.tabs.${k}`)}
            </span>
          ))}
          {f.canOpenSettings ? (
            <a data-testid="trips-editor-tab-conditions" href={settingsHref} className={tabCls}>
              {t("editor.tabs.conditions")}
            </a>
          ) : null}
        </nav>
      </header>

      {/* ── ตัวเลือก ── */}
      <section id="options" className={CARD}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-bold">{t("options.title")}</h3>
          {!f.readOnly ? (
            <button type="button" data-testid="trips-option-add" className={BTN} onClick={() => setDialog({ kind: "option" })}>
              {t("options.add")}
            </button>
          ) : null}
        </div>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-0 border-collapse">
            <thead>
              <tr className="border-b border-[color:var(--color-line)]">
                <th className={TH}>{t("options.colOption")}</th>
                <th className={TH}>{t("options.colResource")}</th>
                <th className={`${TH} text-right`}>{t("options.colCapacity")}</th>
                <th className={TH}>{t("options.colWhere")}</th>
                <th className={TH}>{t("options.colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {vm.options.map((o) => (
                <tr key={o.id} data-testid={`trips-option-row-${o.id}`} className="border-b border-[color:var(--color-line)] last:border-b-0">
                  <td className={TD}>
                    <span className="font-bold">{o.nameTh}</span>
                    <span className="block text-sm text-[color:var(--color-muted)]">
                      {o.departTimeMin !== null && o.durationMin ? `${t("options.time")} ${hm(o.departTimeMin)}–${hm((o.departTimeMin + o.durationMin) % 1440)}` : o.nights ? t("options.nights", { n: o.nights }) : t("options.noSchedule")}
                    </span>
                  </td>
                  <td className={TD}>{resourcesText(t, o.resources)}</td>
                  <td className={`${TD} text-right`}>{o.capacity ?? "—"}</td>
                  <td className={TD}>{o.active ? t("options.everywhere") : "—"}</td>
                  <td className={TD}>
                    <button
                      type="button"
                      data-testid={`trips-option-toggle-${o.id}`}
                      disabled={f.readOnly || busy}
                      aria-pressed={o.active}
                      onClick={() => void run(() => setOptionActiveAction(unitSlug, { optionId: o.id, active: !o.active }))}
                      className="min-h-11"
                    >
                      <Pill shape={o.active ? "solid" : "dashed"} status={o.active ? "ACTIVE" : "INACTIVE"}>
                        {o.active ? t("options.active") : t("options.inactive")}
                      </Pill>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── ประเภทคนและช่วงอายุ ── */}
      <section className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold">{t("pax.title")}</h3>
          <span className="rounded-md border border-[color:var(--color-line)] px-2 py-0.5 text-sm text-[color:var(--color-ink-soft)]">{vm.ageSource === "COPIED_FROM_SETTING" ? t("pax.sourceCopied") : t("pax.sourceCustom")}</span>
        </div>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-0 border-collapse">
            <thead>
              <tr className="border-b border-[color:var(--color-line)]">
                <th className={TH}>{t("pax.colType")}</th>
                <th className={TH}>{t("pax.colAge")}</th>
                <th className={TH}>{t("pax.colSeat")}</th>
                <th className={`${TH} text-right`}>{vm.paxPrice.seasonName ? t("pax.colPriceSeason", { name: vm.paxPrice.seasonName }) : t("pax.colPriceToday")}</th>
                <th className={TH}>{t("pax.colBasis")}</th>
              </tr>
            </thead>
            <tbody>
              {vm.paxRows.map((r) => (
                <tr key={r.paxTypeId} data-testid={`trips-pax-row-${r.code}`} className="border-b border-[color:var(--color-line)] last:border-b-0">
                  <td className={`${TD} font-bold`}>{paxLabel(t, r.code, r.labelTh)}</td>
                  <td className={TD}>
                    <span className="flex flex-wrap items-center gap-2">
                      {r.code === "INFANT" ? (
                        <>
                          {t("pax.under")}
                          <input data-testid={`trips-pax-age-to-${r.code}`} aria-label={t("pax.ageTo", { name: paxLabel(t, r.code, r.labelTh) })} inputMode="numeric" disabled={f.readOnly} className="input min-h-11 w-16 text-sm" value={ageVal(r.code, "to", r.ageTo === null ? null : r.ageTo + 1)} onChange={(e) => setAge(r.code, "to", e.target.value, r)} />
                        </>
                      ) : (
                        <input data-testid={`trips-pax-age-from-${r.code}`} aria-label={t("pax.ageFrom", { name: paxLabel(t, r.code, r.labelTh) })} inputMode="numeric" disabled={f.readOnly} className="input min-h-11 w-16 text-sm" value={ageVal(r.code, "from", r.ageFrom)} onChange={(e) => setAge(r.code, "from", e.target.value, r)} />
                      )}
                      {r.code === "ADULT" ? t("pax.andUp") : null}
                      {r.code !== "ADULT" && r.code !== "INFANT" ? (
                        <>
                          –
                          <input data-testid={`trips-pax-age-to-${r.code}`} aria-label={t("pax.ageTo", { name: paxLabel(t, r.code, r.labelTh) })} inputMode="numeric" disabled={f.readOnly} className="input min-h-11 w-16 text-sm" value={ageVal(r.code, "to", r.ageTo)} onChange={(e) => setAge(r.code, "to", e.target.value, r)} />
                        </>
                      ) : null}
                      {t("pax.years")}
                    </span>
                  </td>
                  <td className={TD}>{r.countsCapacity ? t("pax.yes") : t("pax.no")}</td>
                  <td className={`${TD} text-right font-bold`}>{r.priceBasis === "FREE" ? t("pax.free") : r.priceSatang === null ? "—" : `฿${money(r.priceSatang)}`}</td>
                  <td className={TD}>
                    {r.priceBasis === "DERIVED_PCT" ? (
                      <span className="flex flex-col gap-1">
                        {t("pax.basisDerived", { pct: r.derivedPct ?? 0 })}
                        <Pill shape="muted">{t("pax.default")}</Pill>
                      </span>
                    ) : r.priceBasis === "MISSING" ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <Pill shape="dashed">{t("pax.basisMissing")}</Pill>
                        {f.canEditPrices && !f.readOnly && !r.countsCapacity ? (
                          <button type="button" className={BTN} disabled={busy} onClick={() => void run(() => setPriceAction(unitSlug, { productId: p.id, paxTypeId: r.paxTypeId, currency: p.currency, amountMinor: 0 }))}>
                            {t("pax.setFree")}
                          </button>
                        ) : null}
                      </span>
                    ) : (
                      t("pax.basisSet")
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-[color:var(--color-muted)]">{t("pax.note")}</p>
      </section>

      {/* ── ราคาตามฤดูกาลและรายรอบ ── */}
      <section className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold">{t("seasons.title")}</h3>
          <span className="flex flex-wrap items-center gap-2 text-sm text-[color:var(--color-muted)]">
            {t("seasons.note")}
            {f.canEditPrices && !f.readOnly ? (
              <button type="button" data-testid="trips-season-add" className={BTN} onClick={() => setDialog({ kind: "season" })}>
                {t("seasons.add")}
              </button>
            ) : null}
          </span>
        </div>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-0 border-collapse">
            <thead>
              <tr className="border-b border-[color:var(--color-line)]">
                <th className={TH}>{t("seasons.colSeason")}</th>
                <th className={TH}>{t("seasons.colDates")}</th>
                <th className={`${TH} text-right`}>{t("seasons.colAdult")}</th>
                <th className={`${TH} text-right`}>{t("seasons.colChild")}</th>
              </tr>
            </thead>
            <tbody>
              {vm.seasons.map((s) => (
                <tr key={s.seasonId} data-testid={`trips-season-row-${s.seasonId}`} className={`border-b border-[color:var(--color-line)] last:border-b-0 ${s.inEffect ? "bg-[color:var(--color-surface-2)]" : ""}`}>
                  <td className={`${TD} font-bold`}>
                    <span className="flex flex-wrap items-center gap-2">
                      {s.name}
                      {s.inEffect ? <Pill shape="solid">{t("seasons.inEffect")}</Pill> : null}
                    </span>
                  </td>
                  <td className={TD}>{`${ymd(s.dateStart, false)} – ${ymd(s.dateEnd, false)}`}</td>
                  <td className={`${TD} text-right`}>{money(s.adultSatang)}</td>
                  <td className={`${TD} text-right`}>{money(s.childSatang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--color-line)] pt-3">
          <p className="text-sm text-[color:var(--color-ink-soft)]">
            <span className="font-bold">{t("seasons.depTitle")}</span> {t("seasons.depNote")}
          </p>
          {f.canEditPrices && !f.readOnly ? (
            <button type="button" data-testid="trips-departure-price-add" className={BTN} disabled={!vm.departures.length || !adult} onClick={() => setDialog({ kind: "depPrice" })}>
              {t("seasons.depAdd")}
            </button>
          ) : null}
        </div>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-0 border-collapse">
            <thead>
              <tr className="border-b border-[color:var(--color-line)]">
                <th className={TH}>{t("seasons.colDeparture")}</th>
                <th className={`${TH} text-right`}>{t("seasons.colSold")}</th>
                <th className={`${TH} text-right`}>{t("seasons.colAdult")}</th>
                <th className={`${TH} text-right`}>{t("seasons.colChild")}</th>
                <th className={TH}>{t("seasons.colSource")}</th>
              </tr>
            </thead>
            <tbody>
              {vm.departures.map((d) => (
                <tr key={d.departureId} data-testid={`trips-departure-price-row-${d.departureId}`} data-full={d.full ? "true" : "false"} className="border-b border-[color:var(--color-line)] last:border-b-0">
                  <td className={`${TD} font-bold`}>{ymd(d.localDate)}</td>
                  <td className={`${TD} text-right`}>{d.full ? <Pill shape="thick">{`${t("seasons.full")} ${d.sold ?? "—"}/${d.capacity}`}</Pill> : `${d.sold ?? "—"}/${d.capacity}`}</td>
                  <td className={`${TD} text-right`}>{money(d.adultSatang)}</td>
                  <td className={`${TD} text-right`}>{money(d.childSatang)}</td>
                  <td className={TD}>
                    {d.source === "DEPARTURE" ? (
                      <span className="flex flex-col gap-1">
                        <Pill shape="thick">{t("seasons.srcDeparture")}</Pill>
                        {d.overridesSeasonName ? <span className="text-sm text-[color:var(--color-muted)]">{t("seasons.overrides", { name: d.overridesSeasonName })}</span> : null}
                      </span>
                    ) : d.source === "SEASON" ? (
                      <Pill shape="muted">{d.seasonName ?? t("seasons.srcSeason")}</Pill>
                    ) : d.source === "RETAIL" ? (
                      <Pill shape="muted">{t("seasons.srcRetail")}</Pill>
                    ) : (
                      <Pill shape="dashed">{t("pax.basisMissing")}</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {vm.departuresTruncated ? <p role="status" className="text-sm text-[color:var(--color-ink-soft)]">{t("seasons.depTruncated", { n: vm.departures.length })}</p> : null}
      </section>

      {/* ── รายการเสริม ── */}
      <section id="extras" className={CARD}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-bold">{t("extras.title")}</h3>
          {!f.readOnly ? (
            <button type="button" data-testid="trips-extra-add" className={BTN} onClick={() => setDialog({ kind: "extra" })}>
              {t("extras.add")}
            </button>
          ) : null}
        </div>
        {vm.extraWarnings.length ? (
          <div data-testid="trips-extra-warning" role="note" className="flex flex-col gap-1 rounded-lg border border-dashed border-[color:var(--color-note-line)] bg-[color:var(--color-note)] px-3 py-2 text-sm text-[color:var(--color-note-ink)]">
            {vm.extraWarnings.map((w) => (
              <p key={`${w.unitExtraId}:${w.productExtraId}`}>{t(w.productOptional ? "extras.suppressedOptional" : "extras.suppressed", { unit: w.unitExtraName, product: w.productExtraName })}</p>
            ))}
          </div>
        ) : null}
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-0 border-collapse">
            <thead>
              <tr className="border-b border-[color:var(--color-line)]">
                <th className={TH}>{t("extras.colItem")}</th>
                <th className={TH}>{t("extras.colBasis")}</th>
                <th className={TH}>{t("extras.colRequired")}</th>
                <th className={`${TH} text-right`}>{t("extras.colPrice")}</th>
                <th className={`${TH} text-center`}>{t("extras.colCommission")}</th>
                <th className={`${TH} text-center`}>{t("extras.colDiscount")}</th>
                <th className={`${TH} text-center`}>{t("extras.colPassThrough")}</th>
              </tr>
            </thead>
            <tbody>
              {vm.extras.map((e) => (
                <ExtraRow key={e.id} e={e} t={t} disabled={f.readOnly || busy} onToggle={() => void run(() => setExtraActiveAction(unitSlug, { extraId: e.id, active: !e.active }))} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="flex flex-wrap items-start gap-2 text-sm text-[color:var(--color-ink-soft)]">
          <span className="rounded-md border border-dashed border-[color:var(--color-note-line)] px-2 py-0.5 text-[color:var(--color-note-ink)]">{t("extras.accountant")}</span>
          {t("extras.passNote")}
        </p>
      </section>

      {/* ── รับส่ง ── */}
      <PickupSection unitSlug={unitSlug} vm={vm} onEdit={(zone) => setDialog({ kind: "pickup", zone })} />

      {/* ── เนื้อหา ไทย / English ── */}
      <section id="content" className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold">{t("content.title")}</h3>
          <button type="button" data-testid="trips-content-draft-translate" className={BTN} disabled aria-disabled="true" title={t("content.draftSoon")}>
            {t("content.draft")}
          </button>
        </div>
        <div className="min-w-0 overflow-x-auto">
          <table data-testid="trips-content-table" className="w-full min-w-0 border-collapse">
            <thead>
              <tr className="border-b border-[color:var(--color-line)]">
                <th className={TH}>{t("content.colSection")}</th>
                <th className={TH}>{t("content.colTh")}</th>
                <th className={TH}>{t("content.colEn")}</th>
                <th className={TH}>{t("content.colShown")}</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {vm.content.rows.map((r) => (
                <tr key={r.section} data-section={r.section} className="border-b border-[color:var(--color-line)] last:border-b-0">
                  <td className={`${TD} font-bold`}>{r.section === "summary" ? t("content.sections.summaryPhotos", { n: vm.photos.count }) : t(`content.sections.${r.section}`)}</td>
                  <td className={TD}>
                    <Pill shape={r.th === "MISSING" ? "dashed" : "solid"}>{r.th === "HAS" ? t("content.has") : r.th === "AUTO" ? t("content.auto") : t("content.missing")}</Pill>
                  </td>
                  <td className={TD}>
                    <Pill shape={r.en === "NOT_TRANSLATED" ? "dashed" : "solid"} status={r.en}>
                      {r.en === "TRANSLATED" ? t("content.translated") : r.en === "AUTO" ? t("content.auto") : t("content.notTranslated")}
                    </Pill>
                  </td>
                  <td className={TD}>{r.en === "AUTO" ? t("content.shownAuto") : r.en === "NOT_TRANSLATED" ? t("content.shownFallback") : (r.enPreview ?? t("content.shownEn"))}</td>
                  <td className={TD}>
                    {r.section !== "policy" && !f.readOnly ? (
                      <button type="button" data-testid={`trips-content-edit-${r.section}`} className={BTN} onClick={() => setDialog({ kind: "content", section: r.section })}>
                        {t("common.edit")}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-[color:var(--color-muted)]">{t("content.langs")}</p>
      </section>

      {/* ── กล่องโต้ตอบ ── */}
      {dialog?.kind === "archive" ? <ArchiveDialog unitSlug={unitSlug} productId={p.id} onClose={close} /> : null}
      {dialog?.kind === "option" ? <OptionDialog unitSlug={unitSlug} productId={p.id} onClose={close} /> : null}
      {dialog?.kind === "season" && adult ? <SeasonDialog unitSlug={unitSlug} productId={p.id} currency={p.currency} adultPaxTypeId={adult.paxTypeId} onClose={close} /> : null}
      {dialog?.kind === "depPrice" && adult ? <DepPriceDialog unitSlug={unitSlug} vm={vm} adultPaxTypeId={adult.paxTypeId} onClose={close} /> : null}
      {dialog?.kind === "extra" ? <ExtraDialog unitSlug={unitSlug} productId={p.id} onClose={close} /> : null}
      {dialog?.kind === "pickup" ? <PickupDialog unitSlug={unitSlug} zone={dialog.zone} canPrice={f.canEditPrices} onClose={close} /> : null}
      {dialog?.kind === "content" ? <ContentDialog unitSlug={unitSlug} productId={p.id} section={dialog.section} cur={vm.content.texts[dialog.section] ?? { th: "", en: "" }} onClose={close} /> : null}
    </div>
  );
}

const Check = ({ on, label }: { on: boolean; label: string }) => (
  <span role="img" aria-label={label} className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-sm ${on ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "border border-[color:var(--color-line)]"}`}>
    {on ? "✓" : ""}
  </span>
);
function ExtraRow({ e, t, disabled, onToggle }: { e: ExtraRowVM; t: T; disabled: boolean; onToggle: () => void }) {
  const price = e.paxPrices && Object.keys(e.paxPrices).length ? Object.values(e.paxPrices).map((v) => formatBahtShort(v)).join(" / ") : formatBahtShort(e.priceSatang);
  return (
    <tr data-testid={`trips-extra-row-${e.id}`} data-active={e.active ? "true" : "false"} className={`border-b border-[color:var(--color-line)] last:border-b-0 ${e.active ? "" : "text-[color:var(--color-muted)]"}`}>
      <td className={TD}>
        <span className="font-bold">{e.nameTh}</span>
        {e.noteTh ? <span className="block text-sm text-[color:var(--color-muted)]">{e.noteTh}</span> : null}
        {e.scope === "UNIT" ? <span className="block text-sm text-[color:var(--color-muted)]">{t("extras.unitScope")}</span> : null}
        <button type="button" data-testid={`trips-extra-toggle-${e.id}`} disabled={disabled} aria-pressed={e.active} onClick={onToggle} className="mt-1 min-h-11 text-sm text-[color:var(--color-accent)] disabled:text-[color:var(--color-muted)]">
          {e.active ? t("extras.toggleOff") : t("extras.toggleOn")}
        </button>
      </td>
      <td className={TD}>{t(`extras.basis.${e.basis}`)}</td>
      <td className={TD}>{e.mandatory ? t("extras.required") : t("extras.optional")}</td>
      <td className={`${TD} text-right`}>{price}</td>
      <td className={`${TD} text-center`}>
        {e.commissionable && e.commissionPct > 0 && e.commissionPct < 100 ? <Pill shape="dashed">{`${e.commissionPct}%`}</Pill> : <Check on={e.commissionable} label={t("extras.colCommission")} />}
      </td>
      <td className={`${TD} text-center`}>
        <Check on={e.discountable} label={t("extras.colDiscount")} />
      </td>
      <td className={`${TD} text-center`}>
        <Check on={e.passThrough} label={t("extras.colPassThrough")} />
      </td>
    </tr>
  );
}

function PickupSection({ unitSlug, vm, onEdit }: { unitSlug: string; vm: VM; onEdit: (z: PickupZoneDTO | null) => void }) {
  const t = useTranslations("trips");
  const { busy, error, run } = useRunner(t("common.failed"));
  const [inactive, setInactive] = useState<PickupZoneDTO[] | null>(null);
  const zones = vm.pickup.zones;
  const ro = vm.flags.readOnly;
  /** ย้ายขึ้น/ลง: ลำดับใหม่ต้องครบทุกโซนของหน่วย (รวมที่ปิด) — อ่านชุดเต็มก่อน */
  const move = (id: string, dir: -1 | 1) =>
    run(async () => {
      const all = await listPickupZonesAction(unitSlug, { includeInactive: true });
      if (!all.ok) return all;
      const ids = all.items.map((z1) => z1.id);
      const open = all.items.filter((z1) => z1.active).map((z1) => z1.id);
      const i = open.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= open.length) return { ok: true };
      const a = ids.indexOf(open[i]);
      const b = ids.indexOf(open[j]);
      [ids[a], ids[b]] = [ids[b], ids[a]];
      return reorderPickupZonesAction(unitSlug, { ids });
    });
  const loadInactive = () =>
    run(async () => {
      const all = await listPickupZonesAction(unitSlug, { includeInactive: true });
      if (all.ok) setInactive(all.items.filter((z1) => !z1.active));
      return all;
    });
  const windowTh = (z1: VM["pickup"]["zones"][number]) =>
    !z1.window ? t("pickup.noTime") : z1.window.kind === "MEET" ? t("pickup.meet", { hm: z1.window.atHm }) : `${z1.window.fromHm}–${z1.window.toHm}${z1.window.dayBefore ? ` ${t("pickup.dayBefore")}` : ""}`;
  return (
    <section id="pickup" className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold">{t("pickup.title")}</h3>
        <span className="flex flex-wrap items-center gap-2 text-sm text-[color:var(--color-muted)]">
          {t("pickup.note")}
          {!ro ? (
            <button type="button" data-testid="trips-pickup-add" className={BTN} onClick={() => onEdit(null)}>
              {t("pickup.add")}
            </button>
          ) : null}
        </span>
      </div>
      <ErrorLine text={error} />
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-0 border-collapse">
          <thead>
            <tr className="border-b border-[color:var(--color-line)]">
              <th className={TH}>{t("pickup.colZone")}</th>
              <th className={TH}>{t("pickup.colAreas")}</th>
              <th className={TH}>{t("pickup.colWindow")}</th>
              <th className={`${TH} text-right`}>{t("pickup.colSurcharge")}</th>
              <th className={TH}>{t("pickup.colBasis")}</th>
              {!ro ? <th className={TH} /> : null}
            </tr>
          </thead>
          <tbody>
            {zones.map((z1, i) => (
              <tr key={z1.id} data-testid={`trips-pickup-row-${z1.id}`} data-kind={z1.kind} className="border-b border-[color:var(--color-line)] last:border-b-0">
                <td className={`${TD} font-bold`}>{z1.name.th}</td>
                <td className={TD}>{z1.areas?.th ?? "—"}</td>
                <td className={TD}>{windowTh(z1)}</td>
                <td className={`${TD} text-right`}>{z1.surchargeSatang ? `+${formatBahtShort(z1.surchargeSatang)}` : t("pickup.free")}</td>
                <td className={TD}>{z1.surchargeSatang ? t("pickup.perBooking") : "—"}</td>
                {!ro ? (
                  <td className={TD}>
                    <span className="flex flex-wrap gap-1">
                      <button type="button" data-testid={`trips-pickup-edit-${z1.id}`} className={BTN} onClick={() => onEdit(z1)}>
                        {t("common.edit")}
                      </button>
                      <button type="button" data-testid={`trips-pickup-up-${z1.id}`} className={BTN} aria-label={t("pickup.up", { name: z1.name.th })} disabled={busy || i === 0} onClick={() => void move(z1.id, -1)}>
                        ↑
                      </button>
                      <button type="button" data-testid={`trips-pickup-down-${z1.id}`} className={BTN} aria-label={t("pickup.down", { name: z1.name.th })} disabled={busy || i === zones.length - 1} onClick={() => void move(z1.id, 1)}>
                        ↓
                      </button>
                      <button type="button" data-testid={`trips-pickup-toggle-${z1.id}`} className={BTN} disabled={busy} onClick={() => void run(() => setPickupZoneActiveAction(unitSlug, { zoneId: z1.id, active: false }))}>
                        {t("pickup.toggleOff")}
                      </button>
                    </span>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!ro ? (
        <div className="flex flex-col gap-2">
          {inactive === null ? (
            <button type="button" className={`${BTN} self-start`} disabled={busy} onClick={() => void loadInactive()}>
              {t("pickup.showInactive")}
            </button>
          ) : inactive.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">{t("pickup.noInactive")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {inactive.map((z1) => (
                <li key={z1.id} data-corrupt={z1.corrupt ? "true" : "false"} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-[color:var(--color-line)] px-3 py-2 text-sm text-[color:var(--color-ink-soft)]">
                  <span>
                    {z1.name.th}
                    {z1.corrupt ? <span className="block font-medium text-[color:var(--color-danger)]">{t("pickup.corrupt")}</span> : null}
                  </span>
                  {z1.corrupt ? (
                    <button type="button" data-testid={`trips-pickup-edit-${z1.id}`} className={BTN} onClick={() => onEdit(z1)}>
                      {t("common.edit")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-testid={`trips-pickup-toggle-${z1.id}`}
                      className={BTN}
                      disabled={busy}
                      onClick={() => void run(() => setPickupZoneActiveAction(unitSlug, { zoneId: z1.id, active: true }), () => setInactive(null))}
                    >
                      {t("pickup.toggleOn")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}

// ═══════════════ กล่องโต้ตอบ ═══════════════
function Footer({ t, busy, ok, onSave, onClose, error }: { t: T; busy: boolean; ok: boolean; onSave: () => void; onClose: () => void; error: string | null }) {
  return (
    <>
      <ErrorLine text={error} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BTN_PRIMARY} disabled={busy || !ok} onClick={onSave}>
          {t("common.save")}
        </button>
        <button type="button" className={BTN} onClick={onClose}>
          {t("common.cancel")}
        </button>
      </div>
    </>
  );
}

function ArchiveDialog({ unitSlug, productId, onClose }: { unitSlug: string; productId: string; onClose: () => void }) {
  const t = useTranslations("trips");
  const { busy, error, run } = useRunner(t("common.failed"));
  const [reason, setReason] = useState("");
  return (
    <Dialog title={t("editor.archiveTitle")} onClose={onClose} closeLabel={t("common.close")}>
      <p className="text-sm text-[color:var(--color-ink-soft)]">{t("editor.archiveBody")}</p>
      <Field label={t("editor.archiveReason")}>
        <textarea rows={3} className={`${INPUT} py-2`} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Footer t={t} busy={busy} error={error} ok onClose={onClose} onSave={() => void run(() => archiveProductAction(unitSlug, { productId, confirm: true, reason: reason.trim() }), onClose)} />
    </Dialog>
  );
}

function OptionDialog({ unitSlug, productId, onClose }: { unitSlug: string; productId: string; onClose: () => void }) {
  const t = useTranslations("trips");
  const { busy, error, run } = useRunner(t("common.failed"));
  const [th, setTh] = useState("");
  const [en, setEn] = useState("");
  const [dur, setDur] = useState("");
  return (
    <Dialog title={t("options.add")} onClose={onClose} closeLabel={t("common.close")}>
      <Field label={t("create.nameTh")}>
        <input className={INPUT} value={th} onChange={(e) => setTh(e.target.value)} />
      </Field>
      <Field label={t("create.nameEn")}>
        <input className={INPUT} value={en} onChange={(e) => setEn(e.target.value)} />
      </Field>
      <Field label={t("options.duration")}>
        <input className={INPUT} inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} />
      </Field>
      <Footer
        t={t}
        busy={busy}
        error={error}
        ok={!!th.trim()}
        onClose={onClose}
        onSave={() => void run(() => createOptionAction(unitSlug, { productId, name: { th: th.trim(), ...(en.trim() ? { en: en.trim() } : {}) }, durationMin: intOrNull(dur) }), onClose)}
      />
    </Dialog>
  );
}

function SeasonDialog({ unitSlug, productId, currency, adultPaxTypeId, onClose }: { unitSlug: string; productId: string; currency: string; adultPaxTypeId: string; onClose: () => void }) {
  const t = useTranslations("trips");
  const { busy, error, run } = useRunner(t("common.failed"));
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [price, setPrice] = useState("");
  const amount = bahtToSatang(price);
  return (
    <Dialog title={t("seasons.add")} onClose={onClose} closeLabel={t("common.close")}>
      <Field label={t("seasons.colSeason")}>
        <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("seasons.from")}>
          <input type="date" className={INPUT} value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={t("seasons.to")}>
          <input type="date" className={INPUT} value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <Field label={t("seasons.adultPrice")} hint={t("seasons.childHint")}>
        <input className={INPUT} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </Field>
      <Footer
        t={t}
        busy={busy}
        error={error}
        ok={!!name.trim() && !!from && !!to && amount !== null}
        onClose={onClose}
        onSave={() =>
          void run(async () => {
            const s = await saveSeasonAction(unitSlug, { name: name.trim(), dateStart: from, dateEnd: to });
            if (!s.ok || !("value" in s)) return s;
            const v: unknown = s.value;
            const seasonId = typeof v === "object" && v !== null && "id" in v ? String((v as { id: unknown }).id) : "";
            return setPriceAction(unitSlug, { productId, paxTypeId: adultPaxTypeId, seasonId, currency, amountMinor: amount ?? 0 });
          }, onClose)
        }
      />
    </Dialog>
  );
}

function DepPriceDialog({ unitSlug, vm, adultPaxTypeId, onClose }: { unitSlug: string; vm: VM; adultPaxTypeId: string; onClose: () => void }) {
  const t = useTranslations("trips");
  const ymd = useYmd();
  const { busy, error, run } = useRunner(t("common.failed"));
  const [dep, setDep] = useState(vm.departures[0]?.departureId ?? "");
  const [price, setPrice] = useState("");
  const amount = bahtToSatang(price);
  return (
    <Dialog title={t("seasons.depAdd")} onClose={onClose} closeLabel={t("common.close")}>
      <Field label={t("seasons.colDeparture")} hint={t("seasons.depPickHint")}>
        <select className={INPUT} value={dep} onChange={(e) => setDep(e.target.value)}>
          {vm.departures.map((d) => (
            <option key={d.departureId} value={d.departureId}>
              {ymd(d.localDate)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("seasons.adultPrice")} hint={t("seasons.childHint")}>
        <input className={INPUT} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </Field>
      <Footer
        t={t}
        busy={busy}
        error={error}
        ok={!!dep && amount !== null}
        onClose={onClose}
        onSave={() => void run(() => setPriceAction(unitSlug, { productId: vm.product.id, paxTypeId: adultPaxTypeId, departureId: dep, currency: vm.product.currency, amountMinor: amount ?? 0 }), onClose)}
      />
    </Dialog>
  );
}

function ExtraDialog({ unitSlug, productId, onClose }: { unitSlug: string; productId: string; onClose: () => void }) {
  const t = useTranslations("trips");
  const { busy, error, run } = useRunner(t("common.failed"));
  const [kind, setKind] = useState<string>("EQUIPMENT");
  const [basis, setBasis] = useState("PER_PAX");
  const [mandatory, setMandatory] = useState(false);
  const [th, setTh] = useState("");
  const [price, setPrice] = useState("");
  const amount = bahtToSatang(price);
  return (
    <Dialog title={t("extras.add")} onClose={onClose} closeLabel={t("common.close")}>
      <Field label={t("create.nameTh")}>
        <input className={INPUT} value={th} onChange={(e) => setTh(e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("extras.kind")}>
          <select className={INPUT} value={kind} onChange={(e) => setKind(e.target.value)}>
            {EXTRA_KIND_CODES.map((k) => (
              <option key={k} value={k}>
                {t(`extras.kinds.${k}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("extras.colBasis")}>
          <select className={INPUT} value={basis} onChange={(e) => setBasis(e.target.value)}>
            {EXTRA_BASIS_CODES.map((k) => (
              <option key={k} value={k}>
                {t(`extras.basis.${k}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t("extras.colPrice")}>
        <input className={INPUT} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </Field>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />
        {t("extras.required")}
      </label>
      <p className="text-sm text-[color:var(--color-muted)]">{t("extras.flagsHint")}</p>
      <Footer
        t={t}
        busy={busy}
        error={error}
        ok={!!th.trim() && amount !== null}
        onClose={onClose}
        onSave={() => void run(() => createExtraAction(unitSlug, { productId, kind, basis, mandatory, priceMinor: amount ?? 0, name: { th: th.trim() } }), onClose)}
      />
    </Dialog>
  );
}

function PickupDialog({ unitSlug, zone, canPrice, onClose }: { unitSlug: string; zone: PickupZoneDTO | null; canPrice: boolean; onClose: () => void }) {
  const t = useTranslations("trips");
  const { busy, error, run } = useRunner(t("common.failed"));
  const [kind, setKind] = useState<"ZONE" | "SELF">(zone?.kind ?? "ZONE");
  const [th, setTh] = useState(zone?.name.th ?? "");
  const [en, setEn] = useState(zone?.name.en ?? "");
  const [areas, setAreas] = useState(zone?.areas?.th ?? "");
  const [areasEn, setAreasEn] = useState(zone?.areas?.en ?? "");
  const [offset, setOffset] = useState(String(zone?.pickupOffsetMin ?? 60));
  const [win, setWin] = useState(String(zone?.windowMin ?? 30));
  const [sur, setSur] = useState(zone ? formatBahtShort(zone.surchargeSatang).replace(/,/g, "") : "0");
  const self = kind === "SELF";
  const body = {
    kind,
    name: { th: th.trim(), ...(en.trim() ? { en: en.trim() } : { en: null }) },
    areas: areas.trim() || areasEn.trim() ? { th: areas.trim() || null, en: areasEn.trim() || null } : null,
    pickupOffsetMin: intOrNull(offset) ?? -1,
    windowMin: self ? 0 : (intOrNull(win) ?? -1),
    surchargeSatang: self ? 0 : (bahtToSatang(sur) ?? -1),
  };
  const ok = !!body.name.th && body.pickupOffsetMin >= 0 && body.windowMin >= 0 && body.surchargeSatang >= 0;
  return (
    <Dialog title={zone ? t("pickup.editTitle", { name: zone.name.th }) : t("pickup.add")} onClose={onClose} closeLabel={t("common.close")}>
      <Field label={t("pickup.kind")}>
        <select className={INPUT} value={kind} onChange={(e) => setKind(e.target.value === "SELF" ? "SELF" : "ZONE")}>
          <option value="ZONE">{t("pickup.kindZone")}</option>
          <option value="SELF">{t("pickup.kindSelf")}</option>
        </select>
      </Field>
      <Field label={t("create.nameTh")}>
        <input className={INPUT} value={th} onChange={(e) => setTh(e.target.value)} />
      </Field>
      <Field label={t("create.nameEn")}>
        <input className={INPUT} value={en} onChange={(e) => setEn(e.target.value)} />
      </Field>
      <Field label={t("pickup.colAreas")}>
        <input className={INPUT} value={areas} onChange={(e) => setAreas(e.target.value)} />
      </Field>
      <Field label={t("pickup.areasEn")}>
        <input className={INPUT} value={areasEn} onChange={(e) => setAreasEn(e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label={t("pickup.offset")}>
          <input className={INPUT} inputMode="numeric" value={offset} onChange={(e) => setOffset(e.target.value)} />
        </Field>
        <Field label={t("pickup.window")}>
          <input className={INPUT} inputMode="numeric" disabled={self} value={self ? "0" : win} onChange={(e) => setWin(e.target.value)} />
        </Field>
        <Field label={t("pickup.colSurcharge")} hint={canPrice ? undefined : t("pickup.priceLocked")}>
          <input className={INPUT} inputMode="decimal" disabled={self || !canPrice} value={self ? "0" : sur} onChange={(e) => setSur(e.target.value)} />
        </Field>
      </div>
      <Footer
        t={t}
        busy={busy}
        error={error}
        ok={ok}
        onClose={onClose}
        onSave={() => void run(() => (zone ? updatePickupZoneAction(unitSlug, { zoneId: zone.id, ...body }) : createPickupZoneAction(unitSlug, body)), onClose)}
      />
    </Dialog>
  );
}

function ContentDialog({ unitSlug, productId, section, cur, onClose }: { unitSlug: string; productId: string; section: string; cur: { th: string; en: string }; onClose: () => void }) {
  const t = useTranslations("trips");
  const { busy, error, run } = useRunner(t("common.failed"));
  const [th, setTh] = useState(cur.th);
  const [en, setEn] = useState(cur.en);
  const save = () =>
    run(async () => {
      const out = [];
      if (th !== cur.th) out.push(await setProductContentAction(unitSlug, { productId, locale: "th", [section]: th.trim() ? th : null }));
      if (en !== cur.en) out.push(await setProductContentAction(unitSlug, { productId, locale: "en", [section]: en.trim() ? en : null }));
      return out.length ? out : [{ ok: true }];
    }, onClose);
  return (
    <Dialog title={t("content.editTitle", { name: t(`content.sections.${section}`) })} onClose={onClose} closeLabel={t("common.close")}>
      <Field label={t("content.colTh")}>
        <textarea rows={section === "title" ? 2 : 5} className={`${INPUT} py-2`} value={th} onChange={(e) => setTh(e.target.value)} />
      </Field>
      <Field label={t("content.colEn")}>
        <textarea rows={section === "title" ? 2 : 5} className={`${INPUT} py-2`} value={en} onChange={(e) => setEn(e.target.value)} />
      </Field>
      <Footer t={t} busy={busy} error={error} ok={section !== "title" || !!th.trim()} onClose={onClose} onSave={() => void save()} />
    </Dialog>
  );
}
