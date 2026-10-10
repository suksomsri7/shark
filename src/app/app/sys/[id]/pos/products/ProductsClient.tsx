"use client";

// ProductsClient.tsx — จอ 06 "สินค้าและเมนู" (POS P2.2U · มติ 1–3 · Q1 แบบย่อ)
//   การ์ดสรุป (รายการทั้งหมด · ใกล้หมด · หมด · ยังไม่ใส่ต้นทุน · ราคาต่างกันตามช่องทาง N) · แถวตัวกรอง (ค้นหา · หมวด · สาขา: … · ชิป "ราคาต่างกันตามช่องทาง") ·
//   ตาราง: สินค้า (ชื่อ · SKU · N ตัวเลือก) · หมวด · ราคาขาย (ราคาปกติ + บรรทัดจาง "แพลตฟอร์ม ฿x") · ต้นทุน/กำไร (— · P2.3) · สต็อกต่อสาขา ·
//   ช่องทาง (ชิปกรอบ ร้าน/LM/Grab/เว็บ · ไม่ขาย = ซ่อน) · สถานะ · 390 = การ์ดเรียงลง · ลิ้นชัก = คอลัมน์ขวา (≥1280) / แผ่นทับ (1024 · 390)
//   ปุ่มบนตาราง: "โปรราคา / Happy hour" (ไปจอโปร) · "+X% ทั้งช่องทาง" (กล่อง bulk)
// 🔴 ตัวเลือกสาขา = ขอบเขตที่ตารางและลิ้นชักอ่านแถว (ช่องทาง, สาขา) — null = ทุกสาขา · ไม่โหลดใหม่ (ข้อมูลทุกสาขาโหลดมาแล้ว)
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · ปุ่ม ≥ 44px · testid ตัวอักษรตรงบนแท็ก
// ไม่ทำในใบนี้ (Q1 · มติ 1): แท็บประเภท · ตัวกรองสถานะ/ช่องทาง · CSV · เพิ่มสินค้า · เก็บถาวร/ทำสำเนา

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { REGISTER_LOW_STOCK, moneyText } from "@/lib/modules/pos/register-shared";
// POS P2.3U ▸ มติ 4: คอลัมน์ต้นทุน/กำไรของแถวที่มีสูตร + สต็อก "ตามสูตร" + ชิป ใกล้หมด/หมด/ยังไม่ใส่ต้นทุน/กำไรคำนวณไม่ได้ ◂
import { hasRecipe, marginPctText, recipeLive } from "@/components/pos/products/recipe-ui";
import { ChannelChip, PriceIcon, channelShort, type PT } from "@/components/pos/products/price-ui";
import type { ProductsData, ProductsPriceRow, ProductsRecipeLine, ProductsRow } from "./products-data";
import { channelsIn, chipChannels, differsByChannel, platformPriceOf } from "./products-scope";
import { ProductPanel } from "./ProductPanel";
import { BulkMarkupDialog } from "./BulkMarkupDialog";
// POS P2.3U ▸ มติ 1/2: ผลบันทึกสูตร/สวิตช์จากลิ้นชัก ◂
import type { RecipePatch } from "./RecipeSection";

type Props = { systemId: string; data: ProductsData; canEdit: boolean; initialUnit: string | null; canEditRecipe?: boolean };

export function ProductsClient({ systemId, data, canEdit, initialUnit, canEditRecipe = false }: Props) {
  const t = useTranslations("pos.products") as PT;
  const tp = useTranslations("pos.price") as PT;
  const tchip = useTranslations("pos.products.chip") as PT;
  const tr = useTranslations("pos.recipe") as PT; // POS P2.3U
  const locale = useLocale();
  const router = useRouter();
  const [products, setProducts] = useState<ProductsRow[]>(data.products);
  const [unit, setUnit] = useState<string | null>(initialUnit && data.units.some((u) => u.id === initialUnit) ? initialUnit : null);
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [diffOnly, setDiffOnly] = useState(false);
  const [flag, setFlag] = useState<RecipeFlag | null>(null); // POS P2.3U ▸ ชิปกรองตาราง (เลือกได้ทีละตัว) ◂
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => setProducts(data.products), [data.products]);
  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(h);
  }, [toast]);

  const chans = useMemo(() => channelsIn(data.channels, unit), [data.channels, unit]);
  const unitsShown = unit ? data.units.filter((u) => u.id === unit) : data.units;
  const inScope = useMemo(() => products.filter((p) => (unit ? p.available[unit] !== undefined : true)), [products, unit]);
  const diffIds = useMemo(() => new Set(inScope.filter((p) => differsByChannel(p, chans, unit)).map((p) => p.id)), [inScope, chans, unit]);
  const nameOf = (p: ProductsRow) => (locale.startsWith("en") && p.nameEn ? p.nameEn : p.name);
  const catOf = (id: string | null) => data.categories.find((c) => c.id === id);
  const catName = (id: string | null) => {
    const c = catOf(id);
    return c ? (locale.startsWith("en") && c.nameEn ? c.nameEn : c.name) : "—";
  };
  // POS P2.3U ▸ มติ 4: สต็อกที่นับ = แถวนับสต็อก (onHand) หรือสูตรที่ตัดจริง (จำนวนที่ทำได้ min ⌊onHand/qty⌋ จาก listForUnit.stock) ·
  //   สาขาที่ไม่รู้จำนวน (สูตรมีวัตถุดิบนอกคลังของสาขา) ไม่นับ · ใกล้หมด = 1–5 (REGISTER_LOW_STOCK) · หมด = ทุกสาขาในขอบเขต ≤ 0 ◂
  const stockIn = (p: ProductsRow) =>
    unitsShown.filter((u) => p.available[u.id] !== undefined).flatMap((u) => (recipeLive(p) ? (typeof p.stock[u.id] === "number" ? [p.stock[u.id]!] : []) : [p.stock[u.id] ?? 0]));
  const counted = (p: ProductsRow) => p.trackStock || recipeLive(p);
  const outOf = (p: ProductsRow) => counted(p) && stockIn(p).length > 0 && stockIn(p).every((s) => s <= 0);
  const lowOf = (p: ProductsRow) => counted(p) && !outOf(p) && stockIn(p).some((s) => s > 0 && s <= REGISTER_LOW_STOCK);
  const noCostOf = (p: ProductsRow) => hasRecipe(p) && p.recipeCost?.costComplete === false;
  const noMarginOf = (p: ProductsRow) => hasRecipe(p) && p.recipeCost !== null && p.recipeCost.marginBp === null;
  const flagged: Record<RecipeFlag, (p: ProductsRow) => boolean> = { low: lowOf, out: outOf, nocost: noCostOf, nomargin: noMarginOf };
  const shown = (() => {
    const needle = q.trim().toLowerCase();
    return inScope.filter(
      (p) =>
        (!categoryId || p.categoryId === categoryId) &&
        (!diffOnly || diffIds.has(p.id)) &&
        (!flag || flagged[flag](p)) &&
        (!needle || p.name.toLowerCase().includes(needle) || (p.nameEn ?? "").toLowerCase().includes(needle) || (p.sku ?? "").toLowerCase().includes(needle)),
    );
  })();
  const offAll = (p: ProductsRow) => unitsShown.every((u) => p.available[u.id] !== true);
  const outCount = inScope.filter(outOf).length;
  const lowCount = inScope.filter(lowOf).length;
  const noCostCount = inScope.filter(noCostOf).length;
  const noMarginCount = inScope.filter(noMarginOf).length;
  const open = products.find((p) => p.id === openId) ?? null;
  const scopeName = unit ? (data.units.find((u) => u.id === unit)?.name ?? "") : tp("allBranches");
  const selectedRows = products.filter((p) => selected.has(p.id));
  const cat = categoryId ? { id: categoryId, name: catName(categoryId) } : null;

  const onSaved = (productId: string, rows: ProductsPriceRow[]) => {
    setProducts((ps) => ps.map((p) => (p.id === productId ? { ...p, rows } : p)));
    setToast(tp("saved"));
  };
  // POS P2.3U ▸ บันทึกสูตร/สวิตช์แล้ว: แก้แถว (หรือตัวแปรในแถว) ทันที + อ่านหน้าใหม่ (ต้นทุน/จำนวนที่ทำได้ตามสูตรมาจากเซิร์ฟเวอร์) ◂
  const onRecipeSaved = (productId: string, patch: RecipePatch, text: string) => {
    const fields = <T extends { recipe: ProductsRecipeLine[]; bomEnabled: boolean }>(x: T): T => ({ ...x, ...(patch.recipe ? { recipe: patch.recipe } : {}), bomEnabled: patch.bomEnabled });
    setProducts((ps) =>
      ps.map((p) => {
        if (p.id !== productId) return p;
        if (patch.targetId === p.id) return { ...fields(p), ...(patch.recipeChoiceLines ? { recipeChoiceLines: patch.recipeChoiceLines } : {}), recipeCost: patch.recipe ? null : p.recipeCost };
        return { ...p, recipeVariants: p.recipeVariants.map((v) => (v.id === patch.targetId ? fields(v) : v)) };
      }),
    );
    setToast(text);
    router.refresh();
  };
  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const changeUnit = (v: string) => {
    const next = v || null;
    setUnit(next);
    try {
      const u = new URL(window.location.href);
      if (next) u.searchParams.set("unit", next);
      else u.searchParams.delete("unit");
      window.history.replaceState(null, "", u.toString());
    } catch {
      /* ไม่เป็นไร */
    }
  };

  const statusPill = (p: ProductsRow) => {
    const off = offAll(p);
    const out = !off && outOf(p);
    const cls = out ? "border-[color:var(--color-danger)] font-bold text-[color:var(--color-danger)]" : off ? "border-dashed text-[color:var(--color-muted)]" : "text-[color:var(--color-muted)]";
    return <span className={`inline-flex h-7 items-center whitespace-nowrap rounded-lg border px-2.5 text-[11.5px] ${cls}`}>{t(off ? "status.off" : out ? "status.out" : "status.selling")}</span>;
  };
  const priceCell = (p: ProductsRow) => {
    const plat = platformPriceOf(p, chans, unit);
    return (
      <span data-testid={`pos-prod-price-${p.id}`} className="inline-flex flex-col items-end tabular-nums">
        <span className="font-semibold">{p.basePriceSatang === null ? <span className="font-normal text-[color:var(--color-muted)]">{t("noPrice")}</span> : moneyText(p.basePriceSatang)}</span>
        {plat ? <small className="text-[10.5px] font-normal text-[color:var(--color-muted)]">{tp("platformPrice", { price: moneyText(plat.priceSatang) })}</small> : null}
      </span>
    );
  };
  const chipsCell = (p: ProductsRow) => (
    <span data-testid={`pos-prod-channels-${p.id}`} className="flex max-w-[150px] flex-wrap gap-[3px]">
      {chipChannels(p, chans, unit).map((c) => (
        <ChannelChip key={c.code} label={channelShort(c.code, c.name, tchip)} />
      ))}
    </span>
  );
  const stockCell = (p: ProductsRow, unitId: string) => {
    if (p.available[unitId] === undefined) return <span className="text-[color:var(--color-muted)]">{t("notSoldHere")}</span>;
    // POS P2.3U ▸ มติ 4: สูตรที่ตัดจริง = จำนวนที่ทำได้ + "ตามสูตร" จาง (ไม่รู้จำนวน = "ตามสูตร" อย่างเดียว) ◂
    if (recipeLive(p)) {
      const n = p.stock[unitId];
      if (typeof n !== "number") return <span className="text-[11.5px] text-[color:var(--color-muted)]">{tr("costByRecipe")}</span>;
      return (
        <span className={`inline-flex flex-col items-end tabular-nums ${n <= 0 ? "font-bold text-[color:var(--color-danger)]" : ""}`}>
          {n <= 0 ? n : <b>{n}</b>}
          <small className="text-[10.5px] font-normal text-[color:var(--color-muted)]">{n <= 0 ? t("outOfStock") : tr("costByRecipe")}</small>
        </span>
      );
    }
    if (!p.trackStock) return <span className="text-[11.5px] text-[color:var(--color-muted)]">{t("noStock")}</span>;
    const s = p.stock[unitId] ?? 0;
    return s <= 0 ? (
      <span className="inline-flex flex-col items-end font-bold text-[color:var(--color-danger)]">
        {s}
        <small className="text-[10.5px] font-normal">{t("outOfStock")}</small>
      </span>
    ) : (
      <b className="tabular-nums">{s}</b>
    );
  };
  const metaOf = (p: ProductsRow) =>
    [p.sku ? t("sku", { sku: p.sku }) : null, p.optionCount ? t("options", { count: p.optionCount }) : null, p.variantCount ? t("variants", { count: p.variantCount }) : null].filter(Boolean).join(" · ");
  // POS P2.3U ▸ มติ 4: ต้นทุน (฿ + "ตามสูตร" จาง) / กำไร % เฉพาะแถวที่มีสูตร — ค่าจาก recipeCost ครั้งเดียวต่อหน้า (ไม่มีคีย์ = ไม่มีสิทธิ์ดูต้นทุน = —) ◂
  const dash = <span className="text-[color:var(--color-muted)]">—</span>;
  const costCell = (p: ProductsRow) => {
    const c = hasRecipe(p) ? p.recipeCost : null;
    if (!c || c.costSatang === undefined) return dash;
    return (
      <span data-testid={`pos-prod-cost-${p.id}`} className="inline-flex flex-col items-end tabular-nums">
        <span className="font-semibold">{moneyText(c.costSatang)}</span>
        <small className="text-[10.5px] font-normal text-[color:var(--color-muted)]">{c.costComplete === false ? tr("noCost") : tr("costByRecipe")}</small>
      </span>
    );
  };
  const marginCell = (p: ProductsRow) => {
    const c = hasRecipe(p) ? p.recipeCost : null;
    if (!c || c.marginBp === undefined) return dash;
    const pct = marginPctText(c.marginBp);
    return pct ? (
      <span data-testid={`pos-prod-margin-${p.id}`} className="font-semibold tabular-nums">
        {pct}
      </span>
    ) : (
      <span data-testid={`pos-prod-margin-${p.id}`} title={tr("marginUnknown")} className="text-[color:var(--color-muted)]">
        —
      </span>
    );
  };

  return (
    <div className="flex min-w-0 items-start gap-5">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* หัว + ปุ่มบนตาราง */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[22px] font-bold tracking-[-0.01em]">{t("title")}</h2>
            <p className="text-[12.5px] text-[color:var(--color-muted)]">{t("desc")}</p>
          </div>
          <Link data-testid="pos-prod-rules-link" href={`/app/sys/${systemId}/pos/products/price-rules`} className="btn btn-ghost h-11 gap-1.5 rounded-[11px] px-4 text-[13px]">
            <PriceIcon name="clock" size={15} />
            {t("rulesLink")}
          </Link>
          {canEdit ? (
            <button type="button" data-testid="pos-prod-bulk-open" className="btn btn-ghost h-11 gap-1.5 rounded-[11px] px-4 text-[13px]" onClick={() => setBulkOpen(true)}>
              <PriceIcon name="percent" size={15} />
              {tp("bulk.title")}
            </button>
          ) : null}
        </div>
        {/* การ์ดสรุป */}
        <div className="card grid grid-cols-2 gap-4 !p-5 sm:grid-cols-3 lg:grid-cols-5">
          <Stat testid="pos-prod-stat-total" label={t("stat.total")} value={String(inScope.length)} />
          <Stat testid="pos-prod-stat-low" label={t("stat.lowStock")} value={String(lowCount)} />
          <Stat testid="pos-prod-stat-out" label={t("stat.out")} value={String(outCount)} danger={outCount > 0} />
          <Stat testid="pos-prod-stat-nocost" label={t("stat.noCost")} value={String(noCostCount)} sub={t("stat.noMarginSub", { count: noMarginCount })} />
          <Stat testid="pos-prod-stat-channel-diff" label={t("stat.diff")} value={String(diffIds.size)} />
        </div>
        {/* ตัวกรอง */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-11 min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border px-3">
            <PriceIcon name="search" size={15} className="text-[color:var(--color-muted)]" />
            <input data-testid="pos-prod-search" className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select data-testid="pos-prod-category" aria-label={t("col.category")} className="input h-11 w-auto min-w-[120px]" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t("allCategories")}</option>
            {data.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {locale.startsWith("en") && c.nameEn ? c.nameEn : c.name}
              </option>
            ))}
          </select>
          <select data-testid="pos-prod-branch" aria-label={t("branchLabel")} className="input h-11 w-auto min-w-[150px] font-semibold" value={unit ?? ""} onChange={(e) => changeUnit(e.target.value)}>
            <option value="">{tp("branch", { name: tp("allBranches") })}</option>
            {data.units.map((u) => (
              <option key={u.id} value={u.id}>
                {tp("branch", { name: u.name })}
              </option>
            ))}
          </select>
          <button
            type="button"
            role="switch"
            aria-checked={diffOnly}
            data-testid="pos-prod-filter-diff"
            className={`inline-flex h-11 items-center gap-1.5 rounded-[10px] border px-3 text-[12.5px] ${diffOnly ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]" : "text-[color:var(--color-ink-soft)]"}`}
            onClick={() => setDiffOnly((v) => !v)}
          >
            {tp("filterDiffers", { count: diffIds.size })}
          </button>
        </div>
        {/* POS P2.3U ▸ มติ 4: ชิป ใกล้หมด N · หมด N · ยังไม่ใส่ต้นทุน N · กำไรคำนวณไม่ได้ N (สลับกรองตาราง · ทีละตัว) ◂ */}
        <div data-testid="pos-prod-recipe-chips" className="flex flex-wrap items-center gap-1.5">
          <button type="button" role="switch" aria-checked={flag === "low"} data-testid="pos-prod-recipe-chip-low" className={flagCls(flag === "low")} onClick={() => setFlag((f) => (f === "low" ? null : "low"))}>
            {tr("chips.low", { count: lowCount })}
          </button>
          <button type="button" role="switch" aria-checked={flag === "out"} data-testid="pos-prod-recipe-chip-out" className={flagCls(flag === "out")} onClick={() => setFlag((f) => (f === "out" ? null : "out"))}>
            {tr("chips.out", { count: outCount })}
          </button>
          <button type="button" role="switch" aria-checked={flag === "nocost"} data-testid="pos-prod-recipe-chip-nocost" className={flagCls(flag === "nocost")} onClick={() => setFlag((f) => (f === "nocost" ? null : "nocost"))}>
            {tr("chips.noCost", { count: noCostCount })}
          </button>
          <button type="button" role="switch" aria-checked={flag === "nomargin"} data-testid="pos-prod-recipe-chip-nomargin" className={flagCls(flag === "nomargin")} onClick={() => setFlag((f) => (f === "nomargin" ? null : "nomargin"))}>
            {tr("chips.noMargin", { count: noMarginCount })}
          </button>
        </div>
        {selected.size ? (
          <div className="flex items-center gap-2 text-[12.5px]">
            <span>{t("selected", { count: selected.size })}</span>
            <button type="button" data-testid="pos-prod-select-clear" className="inline-flex min-h-11 items-center px-2 text-[color:var(--color-accent)]" onClick={() => setSelected(new Set())}>
              {t("clearSelection")}
            </button>
          </div>
        ) : null}
        {data.truncated ? <p className="text-[12px] text-[color:var(--color-muted)]">{t("truncated")}</p> : null}

        {/* ตาราง (≥ 768) */}
        <div data-testid="pos-prod-table" className="card hidden overflow-x-auto !p-0 md:block">
          <table className="w-full min-w-[860px] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b bg-[color:var(--color-surface-2)] text-left text-[11px] text-[color:var(--color-muted)]">
                <th className="w-10 px-2 py-2" aria-label={t("col.select")} />
                <th className="px-2 py-2 font-semibold">{t("col.product")}</th>
                <th className="px-2 py-2 font-semibold">{t("col.category")}</th>
                <th className="px-2 py-2 text-right font-semibold">{t("col.price")}</th>
                <th className="px-2 py-2 text-right font-semibold">{t("col.cost")}</th>
                <th className="px-2 py-2 text-right font-semibold">{t("col.margin")}</th>
                {unitsShown.map((u) => (
                  <th key={u.id} className="px-2 py-2 text-right font-semibold">
                    {t("col.stock")}
                    <br />
                    {u.name}
                  </th>
                ))}
                <th className="px-2 py-2 font-semibold">{t("col.channels")}</th>
                <th className="px-2 py-2 font-semibold">{t("col.status")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className={`border-b last:border-b-0 ${openId === p.id ? "bg-[color:var(--color-surface-2)]" : ""}`}>
                  <td className="px-2 py-2">
                    <input type="checkbox" data-testid={`pos-prod-select-${p.id}`} aria-label={t("col.select")} className="size-5" checked={selected.has(p.id)} onChange={() => toggleSel(p.id)} />
                  </td>
                  <td className="px-2 py-2">
                    <button type="button" data-testid={`pos-prod-open-${p.id}`} className="flex min-h-11 items-center gap-3 text-left" onClick={() => setOpenId(p.id)}>
                      <span className="grid size-[34px] shrink-0 place-items-center rounded-[7px] border bg-[color:var(--color-surface-2)] text-[color:var(--color-muted)]">
                        <PriceIcon name="box" size={15} />
                      </span>
                      <span className="min-w-0">
                        <b className="block font-semibold leading-tight">{nameOf(p)}</b>
                        <small className="block text-[11px] text-[color:var(--color-muted)] tabular-nums">{metaOf(p)}</small>
                      </span>
                    </button>
                  </td>
                  <td className="px-2 py-2">{catName(p.categoryId)}</td>
                  <td className="px-2 py-2 text-right">{priceCell(p)}</td>
                  <td className="px-2 py-2 text-right">{costCell(p)}</td>
                  <td className="px-2 py-2 text-right">{marginCell(p)}</td>
                  {unitsShown.map((u) => (
                    <td key={u.id} className="px-2 py-2 text-right">
                      {stockCell(p, u.id)}
                    </td>
                  ))}
                  <td className="px-2 py-2">{chipsCell(p)}</td>
                  <td className="px-2 py-2">{statusPill(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length ? <p className="px-4 py-6 text-center text-[13px] text-[color:var(--color-muted)]">{products.length ? t("emptyFilter") : t("empty")}</p> : null}
          <div className="border-t px-4 py-2.5 text-[11.5px] text-[color:var(--color-muted)]">{t("showing", { count: shown.length, total: inScope.length })}</div>
        </div>

        {/* การ์ดเรียงลง (390) */}
        <div data-testid="pos-prod-cards" className="flex flex-col gap-2 md:hidden">
          {shown.map((p) => (
            <div key={p.id} className="card flex items-start gap-3 !p-3">
              <input type="checkbox" data-testid={`pos-prod-cselect-${p.id}`} aria-label={t("col.select")} className="mt-3 size-5" checked={selected.has(p.id)} onChange={() => toggleSel(p.id)} />
              <button type="button" data-testid={`pos-prod-copen-${p.id}`} className="flex min-h-11 min-w-0 flex-1 flex-col gap-1 text-left" onClick={() => setOpenId(p.id)}>
                <span className="flex w-full items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <b className="block font-semibold leading-tight">{nameOf(p)}</b>
                    <small className="block text-[11px] text-[color:var(--color-muted)]">{[catName(p.categoryId), metaOf(p)].filter(Boolean).join(" · ")}</small>
                    {/* POS P2.3U ▸ 390: ต้นทุน/กำไรตามสูตร (แถวที่มีสูตร · ผู้ดูต้นทุนได้) ◂ */}
                    {hasRecipe(p) && p.recipeCost?.costSatang !== undefined ? (
                      <small className="block text-[11px] tabular-nums text-[color:var(--color-muted)]">
                        {`${tr("recipeCost")} ${moneyText(p.recipeCost.costSatang)} · ${tr("grossMargin")} ${marginPctText(p.recipeCost.marginBp) ?? "—"}`}
                      </small>
                    ) : null}
                  </span>
                  {priceCell(p)}
                </span>
                <span className="flex w-full items-center gap-2">
                  {chipsCell(p)}
                  <span className="flex-1" />
                  {statusPill(p)}
                </span>
              </button>
            </div>
          ))}
          {!shown.length ? <p className="py-6 text-center text-[13px] text-[color:var(--color-muted)]">{products.length ? t("emptyFilter") : t("empty")}</p> : null}
        </div>
      </div>

      {open ? (
        <ProductPanel
          key={`${open.id}|${unit ?? ""}`}
          systemId={systemId}
          product={open}
          data={data}
          unit={unit}
          canEdit={canEdit}
          onClose={() => setOpenId(null)}
          onSaved={onSaved}
          canEditRecipe={canEditRecipe}
          onRecipeSaved={onRecipeSaved}
        />
      ) : null}

      {bulkOpen ? (
        <BulkMarkupDialog
          systemId={systemId}
          channels={chans}
          unit={unit}
          scopeName={scopeName}
          category={cat}
          categoryProducts={cat ? inScope.filter((p) => p.categoryId === cat.id) : []}
          selected={selectedRows}
          onClose={() => setBulkOpen(false)}
          onDone={(text) => {
            setBulkOpen(false);
            setToast(text);
            // ราคาที่เขียนแล้วอยู่ที่เซิร์ฟเวอร์ — อ่านข้อมูลหน้าใหม่ (ตัวกรอง/สาขา/ที่เลือกคงอยู่)
            router.refresh();
          }}
        />
      ) : null}

      {toast ? (
        <div data-testid="pos-prod-toast" role="status" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[color:var(--color-ink)] px-4 py-2.5 text-[13px] text-[color:var(--color-surface)] shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

/** POS P2.3U ▸ ชิปกรองของตาราง (มติ 4) ◂ */
type RecipeFlag = "low" | "out" | "nocost" | "nomargin";
const flagCls = (on: boolean) =>
  `inline-flex h-11 items-center rounded-[10px] border px-3 text-[12.5px] tabular-nums ${on ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]" : "text-[color:var(--color-ink-soft)]"}`;

function Stat({ testid, label, value, sub, title, danger }: { testid: string; label: string; value: string; sub?: string; title?: string; danger?: boolean }) {
  return (
    <div data-testid={testid} title={title} className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[12px] text-[color:var(--color-muted)]">{label}</span>
      <span className={`text-[22px] font-bold leading-tight tabular-nums ${danger ? "text-[color:var(--color-danger)]" : ""}`}>{value}</span>
      {sub ? <span className="text-[10.5px] text-[color:var(--color-muted)]">{sub}</span> : null}
    </div>
  );
}
