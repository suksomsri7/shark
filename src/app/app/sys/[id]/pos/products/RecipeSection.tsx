"use client";

// RecipeSection.tsx — แท็บ "สูตรและวัตถุดิบ" ของลิ้นชักจอ 06 (POS P2.3U ▸ มติ 1 · ภาพ 06 ".sec สูตรและวัตถุดิบ (BOM)")
//   หัว "สูตรและวัตถุดิบ (BOM)" + ขนาด/ตัวเลือกที่ดูอยู่ + "แก้สูตร" · แถวชิป: สูตรพื้นฐาน แล้วทุกตัวเลือกของกลุ่มที่ผูก ·
//   แถว = วัตถุดิบ · ปริมาณ + หน่วย · ต้นทุน (เฉพาะเมื่อ recipeCost คืนคีย์ต้นทุน) · ท้าย "ต้นทุนตามสูตร ฿x · กำไรขั้นต้น N%" (N = ปัดลง marginBp/100) ·
//   หมายเหตุ "ขาย 1 แก้ว = ตัดวัตถุดิบในคลังอัตโนมัติ" · ชิป "ยังไม่ใส่ต้นทุน" (costComplete false) / "กำไรคำนวณไม่ได้" (marginBp null) ·
//   ตัวแปรที่สูตรของตัวเองว่าง = แสดงสูตรของแม่ (อ่านอย่างเดียว · "สูตรของสินค้าหลัก")
// 🔴 มุมมองต่อขนาด = expandRecipe ฝั่ง client (recipe-shared · บริสุทธิ์) · ต้นทุน/กำไร = recipeCost เท่านั้น (สูตรฐานมากับหน้า · ตัวเลือกเรียก recipeCostAction ทีละมุมมอง + จำไว้)
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ (ST7) · ปุ่ม ≥ 44px · testid ตัวอักษรตรงบนแท็ก

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { recipeCostAction } from "@/lib/modules/pos/catalog-recipe-actions";
import { expandRecipe, recipeOwnerId } from "@/lib/modules/pos/recipe-shared";
import { moneyText } from "@/lib/modules/pos/register-shared";
import { type PT } from "@/components/pos/products/price-ui";
import { RecipeIcon, RecipeWarnChip, hasRecipe, marginPctText, qtyText, recipeCapable, recipeLive } from "@/components/pos/products/recipe-ui";
import type { ProductsData, ProductsRecipeCost, ProductsRow } from "./products-data";

type Props = {
  systemId: string;
  product: ProductsRow;
  data: ProductsData;
  /** ตัวเลือกสาขาของหน้า (null = ทุกสาขา) */
  unit: string | null;
};

/** สาขาที่ใช้คิดต้นทุน: สาขาของแถว → สาขาที่เลือก (ถ้าแถวขายที่นั่น) → สาขาแรกที่แถวขาย */
export function costUnitOf(p: Pick<ProductsRow, "unitId" | "available">, units: readonly { id: string }[], unit: string | null): string | null {
  if (p.unitId) return p.unitId;
  if (unit && p.available[unit] !== undefined) return unit;
  return units.find((u) => p.available[u.id] !== undefined)?.id ?? null;
}

export function RecipeSection({ systemId, product: p, data, unit }: Props) {
  const tr = useTranslations("pos.recipe") as PT;
  const locale = useLocale();
  const [variantId, setVariantId] = useState<string>(""); // "" = สินค้าหลัก
  const [choice, setChoice] = useState<string | null>(null); // null = สูตรพื้นฐาน
  const [costs, setCosts] = useState<Record<string, ProductsRecipeCost | "error">>(() => (p.recipeCost ? { [`${p.id}|`]: p.recipeCost } : {}));

  const v = variantId ? (p.recipeVariants.find((x) => x.id === variantId) ?? null) : null;
  const targetId = v ? v.id : p.id;
  const inherited = !!v && v.recipe.length === 0;
  const lines = inherited || !v ? p.recipe : v.recipe;
  // มติ 3 ของ S: ส่วนต่างตามตัวเลือก + สวิตช์ อ่านจากแถวเจ้าของสูตร (ตัวแปรมีสูตรเอง = ตัวเอง · ไม่มี = แม่)
  const ownerIsParent = !v || recipeOwnerId({ id: v.id, parentId: p.id }, v.recipe.length) === p.id;
  const choiceLines = ownerIsParent ? p.recipeChoiceLines : [];
  const bom = ownerIsParent ? p.bomEnabled : v!.bomEnabled;
  const row = { kind: p.kind, soldByWeight: p.soldByWeight, recipe: lines, bomEnabled: bom };
  const live = recipeLive(row);
  const chips = useMemo(
    () => p.recipeGroups.flatMap((g) => g.choices.map((c) => ({ id: c.id, label: tr("choiceChip", { group: locale.startsWith("en") && g.nameEn ? g.nameEn : g.name, choice: locale.startsWith("en") && c.nameEn ? c.nameEn : c.name }) }))),
    [p.recipeGroups, locale, tr],
  );
  const viewLabel = choice ? (chips.find((c) => c.id === choice)?.label ?? "") : tr("baseSize");
  const expanded = useMemo(() => expandRecipe({ lines, choiceLines, choiceIds: choice ? [choice] : [] }), [lines, choiceLines, choice]);
  const costUnit = costUnitOf(p, data.units, unit);
  const key = `${targetId}|${choice ?? ""}`;
  const cost = costs[key];

  // ต้นทุนของมุมมองที่ยังไม่มี (ตัวเลือก/ตัวแปร) — คำขอเดียวต่อมุมมอง · จำผลไว้ (สูตรฐานของสินค้าหลักมากับหน้าแล้ว)
  useEffect(() => {
    if (cost !== undefined || !costUnit || !hasRecipe(row)) return;
    let alive = true;
    void recipeCostAction({ systemId, unitId: costUnit, productIds: [targetId], choiceIds: choice ? [choice] : [] })
      .catch(() => null)
      .then((r) => {
        if (!alive) return;
        const it = r && r.ok ? r.items[0] : undefined;
        if (!it) return setCosts((c) => ({ ...c, [key]: "error" }));
        const out: ProductsRecipeCost = { lines: it.lines };
        if (it.costSatang !== undefined) out.costSatang = it.costSatang;
        if (it.costComplete !== undefined) out.costComplete = it.costComplete;
        if (it.marginBp !== undefined) out.marginBp = it.marginBp;
        setCosts((c) => ({ ...c, [key]: out }));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, costUnit]);

  const ing = (id: string) => data.ingredients[id];
  const costLine = (id: string) => (cost && cost !== "error" ? cost.lines.find((l) => l.invItemId === id) : undefined);
  const nameOf = (id: string) => ing(id)?.name ?? costLine(id)?.name ?? id;
  const unitOf = (id: string) => ing(id)?.unitLabel ?? costLine(id)?.unitLabel ?? "";
  const seeCost = !!cost && cost !== "error" && cost.costSatang !== undefined;

  if (!recipeCapable(p)) {
    return (
      <section data-testid="pos-prod-recipe" className="flex flex-col gap-2">
        <Head title={tr("tabTitle")} />
        <p data-testid="pos-prod-recipe-notforkind" className="rounded-lg border border-dashed px-3 py-2 text-[12px] text-[color:var(--color-muted)]">
          {tr("notForKind")}
        </p>
      </section>
    );
  }

  return (
    <section data-testid="pos-prod-recipe" className="flex flex-col gap-2.5">
      <Head title={tr("tabTitle")} sub={lines.length ? viewLabel : undefined} />

      {p.recipeVariants.length ? (
        <label className="flex items-center gap-2 text-[12px] text-[color:var(--color-muted)]">
          {tr("variantLabel")}
          <select
            data-testid="pos-prod-recipe-variant"
            className="input h-11 w-auto min-w-[160px] text-[13px]"
            value={variantId}
            onChange={(e) => {
              setVariantId(e.target.value);
              setChoice(null);
            }}
          >
            <option value="">{tr("mainProduct")}</option>
            {p.recipeVariants.map((x) => (
              <option key={x.id} value={x.id}>
                {locale.startsWith("en") && x.nameEn ? x.nameEn : x.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {inherited && lines.length ? (
        <p data-testid="pos-prod-recipe-parent" className="text-[11.5px] text-[color:var(--color-muted)]">
          {tr("parentRecipe")}
        </p>
      ) : null}

      {!lines.length ? (
        <p data-testid="pos-prod-recipe-empty" className="rounded-lg border border-dashed px-3 py-3 text-center text-[12.5px] text-[color:var(--color-muted)]">
          {tr("empty")}
        </p>
      ) : (
        <>
          {chips.length && ownerIsParent ? (
            <div role="tablist" aria-label={tr("choiceDelta")} className="flex flex-wrap gap-1.5">
              <button type="button" role="tab" aria-selected={choice === null} data-testid="pos-prod-recipe-view-base" className={chipCls(choice === null)} onClick={() => setChoice(null)}>
                {tr("baseSize")}
              </button>
              {chips.map((c) => (
                <button key={c.id} type="button" role="tab" aria-selected={choice === c.id} data-testid={`pos-prod-recipe-view-${c.id}`} className={chipCls(choice === c.id)} onClick={() => setChoice(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
          ) : null}
          {expanded.ok ? (
            <table data-testid="pos-prod-recipe-table" className="w-full border-collapse text-[12.5px]">
              <tbody>
                {expanded.components.map((c) => {
                  const cl = costLine(c.invItemId);
                  return (
                    <tr key={c.invItemId} data-testid={`pos-prod-recipe-row-${c.invItemId}`} className="border-b">
                      <td className="py-[5px] pr-2">{nameOf(c.invItemId)}</td>
                      <td className="whitespace-nowrap py-[5px] text-right tabular-nums">{qtyText(c.qty, unitOf(c.invItemId), locale)}</td>
                      {seeCost ? <td className="w-[76px] whitespace-nowrap py-[5px] text-right tabular-nums text-[color:var(--color-muted)]">{cl?.costSatang !== undefined ? moneyText(cl.costSatang) : ""}</td> : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-[12px] text-[color:var(--color-danger)]">{tr("errors.tooMany")}</p>
          )}
          {/* ท้าย: ต้นทุนตามสูตร · กำไรขั้นต้น (ค่าจาก recipeCost เท่านั้น) */}
          {cost === undefined ? (
            <p className="text-[11.5px] text-[color:var(--color-muted)]">{tr("costLoading")}</p>
          ) : cost === "error" ? (
            <p data-testid="pos-prod-recipe-cost-error" className="text-[11.5px] text-[color:var(--color-danger)]">
              {tr("errors.loadCost")}
            </p>
          ) : seeCost ? (
            <div className="flex flex-col gap-1.5">
              <div data-testid="pos-prod-recipe-total" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
                <span>
                  {tr("recipeCost")} <b className="text-[14px] tabular-nums">{moneyText(cost.costSatang ?? 0)}</b>
                </span>
                <span className="text-[color:var(--color-muted)]">·</span>
                <span>
                  {tr("grossMargin")} <b className="text-[14px] tabular-nums">{marginPctText(cost.marginBp) ?? "—"}</b>
                </span>
              </div>
              {cost.costComplete === false || cost.marginBp === null ? (
                <div className="flex flex-wrap gap-1.5">
                  {cost.costComplete === false ? <span data-testid="pos-prod-recipe-flag-nocost"><RecipeWarnChip text={tr("noCost")} /></span> : null}
                  {cost.marginBp === null ? <span data-testid="pos-prod-recipe-flag-nomargin"><RecipeWarnChip text={tr("marginUnknown")} /></span> : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <p data-testid="pos-prod-recipe-note" className="text-[11.5px] text-[color:var(--color-muted)]">
            {p.kind === "BUNDLE" ? tr("bundleNote") : live ? tr("autoNote") : tr("bomOffNote")}
          </p>
        </>
      )}
    </section>
  );
}

function Head({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-[13px] font-bold">
      <RecipeIcon name="tree" size={15} />
      <span className="min-w-0 truncate">{title}</span>
      {sub ? <span className="truncate text-[11.5px] font-normal text-[color:var(--color-muted)]">{sub}</span> : null}
      <span className="flex-1" />
      {right}
    </h3>
  );
}

/** ชิปมุมมอง (สูตรพื้นฐาน / ตัวเลือก) — สูง 44 */
export const chipCls = (on: boolean) => `inline-flex min-h-11 items-center rounded-lg border px-2.5 text-[12px] ${on ? "border-[color:var(--color-ink)] font-bold" : "text-[color:var(--color-ink-soft)]"}`;
