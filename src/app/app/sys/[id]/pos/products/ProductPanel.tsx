"use client";

// ProductPanel.tsx — ลิ้นชักสินค้าของจอ 06 (POS P2.2U · มติ 2 · ภาพ 06 ขวา "ลาเต้ · SKU CF-001")
//   แท็บ ทั่วไป (สรุปอ่านอย่างเดียว) · ตัวเลือก / สูตรและวัตถุดิบ / สต็อก = เร็ว ๆ นี้ · P2.3 (ปิดอยู่) · ราคาตามช่องทาง (ใช้งานจริง)
//   ราคาตามช่องทาง: หัว "ราคาตามช่องทางและช่วงเวลา" + "แก้ราคา" · ดู = ตาราง 2 คอลัมน์ทุกช่องทางที่เปิดของขอบเขต (ชื่อ · +27% · ราคา · ไม่ขาย —) ·
//   แก้ = ช่องเงินต่อช่องทาง + สวิตช์ "ไม่ขาย" + "ใช้ราคาปกติ" · ขอบเขต = ตัวเลือกสาขาของหน้า (แถวเขียนด้วย unitId = สาขาที่เลือก หรือ null) ·
//   บันทึก = setChannelPricesAction แทนทั้งชุด (มติ 9) · ปฏิเสธ = แถบแดงผ่านคีย์ · กล่องโปรราคาที่ครอบสินค้านี้ (กำลังใช้/รอเริ่ม) + ลิงก์ไปจอโปร
//   ท้าย: "บันทึก" (แท็บราคาเท่านั้น) · "ทำสำเนา" / "เก็บถาวร" = ภาพเท่านั้น (ปิด · เร็ว ๆ นี้ · Q1)
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · ปุ่ม ≥ 44px · testid ตัวอักษรตรงบนแท็ก

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { setChannelPricesAction } from "@/lib/modules/pos/catalog-price-actions";
import { CHANNEL_PRICE_ROWS_MAX } from "@/lib/modules/pos/price-shared";
import { moneyText } from "@/lib/modules/pos/register-shared";
import { channelDisplayName } from "@/components/pos/settings/channel-text";
import { PriceIcon, SoonTag, markupText, parseMoneyInput, priceErrorText, priceRefusalText, ruleAdjustText, rulePriceOn, ruleStateOf, ruleTouches, ruleWindowText, satangToInput, type PT } from "@/components/pos/products/price-ui";
import type { ProductsChannel, ProductsData, ProductsPriceRow, ProductsRow } from "./products-data";
import { channelsIn, draftOf, effectiveOf, rowsFromDraft, type DraftCell } from "./products-scope";
// POS P2.3U ▸ มติ 1: แท็บ "สูตรและวัตถุดิบ" ใช้งานจริง (RecipeSection) ◂
import { RecipeSection, type RecipePatch } from "./RecipeSection";

export type PanelTab = "general" | "options" | "recipe" | "prices" | "stock";
const TABS: PanelTab[] = ["general", "options", "recipe", "prices", "stock"];
const PLANNED: Partial<Record<PanelTab, string>> = { options: "P2.3", stock: "P2.3" }; // POS P2.3U ▸ แท็บสูตรเปิดแล้ว ◂

type Props = {
  systemId: string;
  product: ProductsRow;
  data: ProductsData;
  unit: string | null;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (productId: string, rows: ProductsPriceRow[]) => void;
  // POS P2.3U ▸ มติ 1/2: แก้สูตรได้ (pos.product.manage) · ผลบันทึกสูตร/สวิตช์ → ตาราง ◂
  canEditRecipe?: boolean;
  onRecipeSaved?: (productId: string, patch: RecipePatch, toast: string) => void;
};

export function ProductPanel({ systemId, product: p, data, unit, canEdit, onClose, onSaved, canEditRecipe = false, onRecipeSaved }: Props) {
  const t = useTranslations("pos.products") as PT;
  const tp = useTranslations("pos.price") as PT;
  const tr = useTranslations("pos.price.rule") as PT;
  const treg = useTranslations("pos.register") as PT;
  const tch = useTranslations("pos.channel") as PT;
  const locale = useLocale();
  const [tab, setTab] = useState<PanelTab>("prices");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, DraftCell>>({});
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const chans = useMemo(() => channelsIn(data.channels, unit), [data.channels, unit]);
  const category = data.categories.find((c) => c.id === p.categoryId);
  const catName = category ? (locale.startsWith("en") && category.nameEn ? category.nameEn : category.name) : t("drawer.noCategory");
  const unitName = (id: string) => data.units.find((u) => u.id === id)?.name ?? "";
  const scopeName = unit ? unitName(unit) : tp("allBranches");
  const soldUnits = Object.entries(p.available).filter(([, v]) => v).length;
  const name = locale.startsWith("en") && p.nameEn ? p.nameEn : p.name;
  const weighed = p.soldByWeight;
  const branchLocked = p.unitId !== null && unit !== null && unit !== p.unitId;
  const editable = canEdit && !weighed && !branchLocked && chans.length > 0;
  const now = useMemo(() => new Date(), []);
  const rules = data.rules.filter((r) => !r.archived && ruleTouches(r, p)).map((r) => ({ r, state: ruleStateOf(r, now) })).filter((x) => x.state === "ACTIVE" || x.state === "UPCOMING");

  const startEdit = () => {
    setDraft(draftOf(p, chans, unit, satangToInput));
    setRowErr({});
    setSaveErr(null);
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setRowErr({});
    setSaveErr(null);
  };
  const setCell = (code: string, patch: Partial<DraftCell>) => setDraft((d) => ({ ...d, [code]: { ...(d[code] ?? { text: "", notSold: false }), ...patch } }));

  const save = async () => {
    if (!editing || busy) return;
    const { rows, errors } = rowsFromDraft(p, draft, unit, parseMoneyInput);
    const errs: Record<string, string> = {};
    for (const [code, e] of Object.entries(errors)) errs[code] = tp(e === "max" ? "errors.priceMax" : "errors.priceFormat");
    setRowErr(errs);
    if (Object.keys(errs).length) {
      setSaveErr(tp("errors.validation"));
      return;
    }
    if (rows.length > CHANNEL_PRICE_ROWS_MAX) {
      setSaveErr(tp("errors.tooManyRows", { max: CHANNEL_PRICE_ROWS_MAX }));
      return;
    }
    setBusy(true);
    setSaveErr(null);
    try {
      const r = await setChannelPricesAction({ systemId, productId: p.id, rows });
      if (r.ok) {
        onSaved(p.id, r.rows);
        setEditing(false);
      } else {
        // P2.2U fix รอบ 1 F4: VALIDATION ที่ไม่ชี้แถวบนจอ = ข้อความของบริการ (ไม่ใช่ "ตรวจช่องสีแดง" ที่ไม่มีช่องแดง)
        const fieldShown = !!(r.field && draft[r.field]);
        setSaveErr(priceRefusalText(r, fieldShown, tp, treg));
        if (fieldShown) setRowErr((x) => ({ ...x, [r.field!]: priceErrorText(r.code, tp, treg) }));
      }
    } catch {
      setSaveErr(tp("errors.unknown"));
    } finally {
      setBusy(false);
    }
  };

  const chName = (c: ProductsChannel) => channelDisplayName(c.code, c.name, tch);

  return (
    <aside
      data-testid="pos-prod-drawer"
      aria-label={name}
      className="fixed inset-y-0 right-0 z-40 flex w-full flex-col bg-[color:var(--color-surface)] shadow-[-8px_0_24px_rgba(10,10,10,.08)] sm:max-w-[460px] sm:border-l xl:sticky xl:top-4 xl:z-auto xl:max-h-[calc(100vh-2rem)] xl:w-[460px] xl:shrink-0 xl:rounded-2xl xl:border xl:shadow-none"
    >
      {/* หัว */}
      <div className="flex items-center gap-3 px-[18px] pb-2.5 pt-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-[9px] border bg-[color:var(--color-surface-2)] text-[color:var(--color-muted)]">
          <PriceIcon name="box" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[16px] font-bold tracking-[-0.01em]">{p.sku ? t("drawer.titleSku", { name, sku: p.sku }) : name}</h2>
          <p className="truncate text-[11.5px] text-[color:var(--color-muted)]">{p.unitId ? t("drawer.subBranch", { category: catName, unit: unitName(p.unitId) }) : t("drawer.sub", { category: catName, count: soldUnits })}</p>
        </div>
        <button type="button" data-testid="pos-prod-drawer-close" aria-label={t("drawer.close")} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-[color:var(--color-surface-2)]" onClick={onClose}>
          <PriceIcon name="x" />
        </button>
      </div>
      {/* แท็บ */}
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b px-3">
        {TABS.map((k) => {
          const planned = PLANNED[k];
          const on = tab === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={on}
              data-testid={`pos-prod-tab-${k}`}
              disabled={!!planned}
              title={planned ? t("drawer.soon", { phase: planned }) : undefined}
              className={`-mb-px flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-2 text-[12.5px] ${on ? "border-[color:var(--color-ink)] font-bold" : "border-transparent text-[color:var(--color-muted)]"} disabled:opacity-60`}
              onClick={() => !planned && setTab(k)}
            >
              {t(`drawer.tabs.${k}`)}
            </button>
          );
        })}
      </div>
      {/* เนื้อ */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-[18px] py-3">
        {tab === "general" ? (
          <dl data-testid="pos-prod-general" className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-[13px]">
            <dt className="text-[color:var(--color-muted)]">{t("drawer.general.name")}</dt>
            <dd className="font-semibold">{name}</dd>
            <dt className="text-[color:var(--color-muted)]">{t("drawer.general.sku")}</dt>
            <dd className="tabular-nums">{p.sku ?? "—"}</dd>
            <dt className="text-[color:var(--color-muted)]">{t("drawer.general.category")}</dt>
            <dd>{catName}</dd>
            <dt className="text-[color:var(--color-muted)]">{t("drawer.general.kind")}</dt>
            <dd>{t(`kind.${p.kind}`)}</dd>
            <dt className="text-[color:var(--color-muted)]">{t("drawer.general.base")}</dt>
            <dd className="font-bold tabular-nums">{p.basePriceSatang === null ? t("noPrice") : moneyText(p.basePriceSatang)}</dd>
            <dt className="text-[color:var(--color-muted)]">{t("drawer.general.status")}</dt>
            <dd>{soldUnits > 0 ? t("status.selling") : t("status.off")}</dd>
            <dd className="col-span-2 mt-2">
              <SoonTag text={t("drawer.soon", { phase: "P2.3" })} />
            </dd>
          </dl>
        ) : tab === "recipe" ? (
          // POS P2.3U ▸ มติ 1 ◂
          <RecipeSection systemId={systemId} product={p} data={data} unit={unit} canEdit={canEditRecipe} onSaved={(id, patch, toast) => onRecipeSaved?.(id, patch, toast)} />
        ) : (
          <section data-testid="pos-prod-prices">
            <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold">
              <PriceIcon name="tag" size={15} />
              <span className="min-w-0 flex-1">{tp("sectionTitle")}</span>
              {editable && !editing ? (
                <button type="button" data-testid="pos-prod-price-edit" className="inline-flex min-h-11 items-center px-1 text-[11.5px] font-bold text-[color:var(--color-accent)]" onClick={startEdit}>
                  {tp("edit")}
                </button>
              ) : null}
            </h3>
            <p className="mb-2 text-[11.5px] text-[color:var(--color-muted)]">{tp("drawer.scope", { scope: scopeName })}</p>
            {weighed ? (
              <p data-testid="pos-prod-price-weighed" className="rounded-lg border border-dashed px-3 py-2 text-[12px] text-[color:var(--color-muted)]">
                {tp("drawer.weighed")}
              </p>
            ) : branchLocked ? (
              <p className="rounded-lg border border-dashed px-3 py-2 text-[12px] text-[color:var(--color-muted)]">{tp("drawer.branchOnly", { unit: unitName(p.unitId!) })}</p>
            ) : chans.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-2 text-[12px] text-[color:var(--color-muted)]">{tp("drawer.noChannels")}</p>
            ) : !editing ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {chans.map((c) => {
                  const e = effectiveOf(p, c.code, unit);
                  const mk = e.kind === "price" ? markupText(e.priceSatang, p.basePriceSatang, tp) : null;
                  return (
                    <div key={c.code} data-testid={`pos-prod-cell-${c.code}`} className="flex min-h-9 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px]">
                      <span className="min-w-0 flex-1 truncate">{chName(c)}</span>
                      {e.kind === "notSold" ? (
                        <small className="text-[11px] text-[color:var(--color-muted)]">{tp("notSoldDash")}</small>
                      ) : e.kind === "none" ? (
                        <small className="text-[11px] text-[color:var(--color-muted)]">{t("noPrice")}</small>
                      ) : (
                        <>
                          {mk ? <small className="text-[11px] text-[color:var(--color-muted)]">{mk}</small> : null}
                          <b className={`tabular-nums ${e.source === "BASE" ? "font-medium text-[color:var(--color-muted)]" : ""}`}>{moneyText(e.priceSatang)}</b>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {chans.map((c) => {
                  const cell = draft[c.code] ?? { text: "", notSold: false };
                  const inherited = effectiveOf({ basePriceSatang: p.basePriceSatang, rows: p.rows.filter((r) => !(r.channelCode === c.code && (r.unitId ?? null) === unit)) }, c.code, unit);
                  const err = rowErr[c.code];
                  return (
                    <div key={c.code} className={`flex flex-col gap-1 rounded-lg border px-2.5 py-1.5 ${err ? "border-[color:var(--color-danger)]" : ""}`}>
                      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                        <span className="min-w-[96px] flex-1 truncate font-semibold">{chName(c)}</span>
                        <input
                          data-testid={`pos-prod-price-${c.code}`}
                          aria-label={tp("drawer.priceFor", { channel: chName(c) })}
                          inputMode="decimal"
                          className="input h-11 w-28 text-right tabular-nums disabled:opacity-50"
                          value={cell.text}
                          disabled={cell.notSold || busy}
                          placeholder={inherited.kind === "price" ? satangToInput(inherited.priceSatang) : ""}
                          onChange={(ev) => setCell(c.code, { text: ev.target.value })}
                        />
                        <button
                          type="button"
                          role="switch"
                          aria-checked={cell.notSold}
                          data-testid={`pos-prod-notsold-${c.code}`}
                          disabled={busy}
                          className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2 text-[11.5px] ${cell.notSold ? "border-[color:var(--color-ink)] font-bold" : "text-[color:var(--color-muted)]"}`}
                          onClick={() => setCell(c.code, { notSold: !cell.notSold })}
                        >
                          {tp("notSold")}
                        </button>
                        <button
                          type="button"
                          data-testid={`pos-prod-usebase-${c.code}`}
                          disabled={busy || (!cell.notSold && !cell.text)}
                          className="inline-flex min-h-11 items-center px-1 text-[11.5px] text-[color:var(--color-accent)] disabled:text-[color:var(--color-muted)] disabled:opacity-60"
                          onClick={() => setCell(c.code, { text: "", notSold: false })}
                        >
                          {tp("useBase")}
                        </button>
                      </div>
                      {err ? (
                        <p data-testid={`pos-prod-price-err-${c.code}`} className="text-[11.5px] text-[color:var(--color-danger)]">
                          {err}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
            {saveErr ? (
              <p data-testid="pos-prod-price-error" role="alert" className="mt-2 rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-[12px] text-[color:var(--color-danger)]">
                {saveErr}
              </p>
            ) : null}
            {/* โปรราคาที่ครอบสินค้านี้ (กำลังใช้/รอเริ่ม) — CD1: "โปรราคา · <ชื่อ>" */}
            {rules.map(({ r, state }) => {
              const after = p.basePriceSatang !== null && r.adjust !== "PRICE" ? rulePriceOn(r, p.basePriceSatang) : null;
              return (
                <div key={r.id} data-testid={`pos-prod-rule-${r.id}`} className="mt-2 flex items-center gap-2.5 rounded-lg border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] px-2.5 py-2 text-[12px] text-[color:var(--color-ink-soft)]">
                  <PriceIcon name="clock" size={15} className="text-[color:var(--color-accent)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block">
                      {tr("label", { name: r.name })} <b className="text-[color:var(--color-accent)]">{`${ruleWindowText(r, tr, locale)} ${ruleAdjustText(r)}${after !== null ? ` → ${moneyText(after)}` : ""}`}</b>
                    </span>
                    <span className="block text-[11px] text-[color:var(--color-muted)]">{tr(`state.${state}`)}</span>
                  </span>
                  <Link data-testid={`pos-prod-rule-link-${r.id}`} href={`/app/sys/${systemId}/pos/products/price-rules?rule=${r.id}`} className="inline-flex min-h-11 shrink-0 items-center text-[11.5px] font-bold text-[color:var(--color-accent)]">
                    {tr("open")}
                  </Link>
                </div>
              );
            })}
          </section>
        )}
      </div>
      {/* ท้าย */}
      <div className="flex flex-wrap items-center gap-2 border-t px-[18px] py-3">
        {editing ? (
          <>
            <button type="button" data-testid="pos-prod-save" disabled={busy} className="btn btn-primary h-11 min-w-[88px] rounded-[11px] px-5 disabled:opacity-50" onClick={() => void save()}>
              {tp("save")}
            </button>
            <button type="button" data-testid="pos-prod-cancel" disabled={busy} className="btn btn-ghost h-11 rounded-[11px] px-4" onClick={cancelEdit}>
              {tp("cancel")}
            </button>
          </>
        ) : (
          <button type="button" data-testid="pos-prod-save" disabled className="btn btn-primary h-11 min-w-[88px] rounded-[11px] px-5 disabled:opacity-40" title={tab === "prices" && editable ? tp("drawer.saveHint") : undefined}>
            {tp("save")}
          </button>
        )}
        <span className="flex-1" />
        <button type="button" data-testid="pos-prod-duplicate" disabled title={t("drawer.soonTip")} className="btn btn-ghost h-11 gap-1.5 rounded-[11px] px-4 disabled:opacity-50">
          <PriceIcon name="copy" size={15} />
          {t("drawer.duplicate")}
        </button>
        <button type="button" data-testid="pos-prod-archive" disabled title={t("drawer.soonTip")} className="btn btn-ghost h-11 gap-1.5 rounded-[11px] px-4 disabled:opacity-50">
          <PriceIcon name="archive" size={15} />
          {t("drawer.archive")}
        </button>
      </div>
    </aside>
  );
}
