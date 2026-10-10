"use client";

// RecipeSection.tsx — แท็บ "สูตรและวัตถุดิบ" ของลิ้นชักจอ 06 (POS P2.3U ▸ มติ 1–3 · ภาพ 06 ".sec สูตรและวัตถุดิบ (BOM)")
//   ดู: หัว "สูตรและวัตถุดิบ (BOM)" + ขนาด/ตัวเลือกที่ดูอยู่ + "แก้สูตร" · แถวชิป: สูตรพื้นฐาน แล้วทุกตัวเลือกของกลุ่มที่ผูก ·
//     แถว = วัตถุดิบ · ปริมาณ + หน่วย · ต้นทุน (เฉพาะเมื่อ recipeCost คืนคีย์ต้นทุน) · ท้าย "ต้นทุนตามสูตร ฿x · กำไรขั้นต้น N%" (N = ปัดลง marginBp/100) ·
//     หมายเหตุ "ขาย 1 แก้ว = ตัดวัตถุดิบในคลังอัตโนมัติ" · ชิป "ยังไม่ใส่ต้นทุน" (costComplete false) / "กำไรคำนวณไม่ได้" (marginBp null) ·
//     ตัวแปรที่สูตรของตัวเองว่าง = แสดงสูตรของแม่ (อ่านอย่างเดียว · "สูตรของสินค้าหลัก")
//   ป้าย (มติ 2/3): สูตรจากเมนูเดิม (เมนู · สวิตช์ปิด · มีสูตร) + ปุ่ม "เปิดตัดสต็อกตามสูตร" = setBomEnabledAction(true) โดยตรง (F4 — บันทึกสูตรไม่พลิกเอง) ·
//     วัตถุดิบเก็บถาวร · ไม่ขึ้นที่สาขา <ชื่อ> (สูตรที่ตัดจริง · วัตถุดิบนอกคลังของสาขา ⇒ หน้าขายของสาขานั้นซ่อนเมนู) · ยังไม่ใส่ต้นทุน
//   แก้ (มติ 1): ตัวเลือกวัตถุดิบ (searchRecipeItemsAction) · ปริมาณจำนวนเต็ม − / ช่อง / + · ลบ · แท็บตัวเลือก = ส่วนต่างมีเครื่องหมาย (+6 g / −1 ใบ) ·
//     สวิตช์ "ตัดสต็อกตามสูตร" (เมนูเท่านั้น) · บันทึก = saveRecipeAction แทนทั้งชุดทั้งสองตัวเขียน + สวิตช์ ใน tx เดียว
// 🔴 มุมมองต่อขนาด = expandRecipe ฝั่ง client (recipe-shared · บริสุทธิ์) · ต้นทุน/กำไร = recipeCost เท่านั้น (สูตรฐานมากับหน้า · ตัวเลือกเรียก recipeCostAction ทีละมุมมอง + จำไว้)
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ (ST7) · ปุ่ม ≥ 44px · testid ตัวอักษรตรงบนแท็ก

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { recipeCostAction, saveRecipeAction, searchRecipeItemsAction, setBomEnabledAction } from "@/lib/modules/pos/recipe-actions";
import { expandRecipe, recipeOwnerId } from "@/lib/modules/pos/recipe-shared";
import { moneyText } from "@/lib/modules/pos/register-shared";
import { type PT } from "@/components/pos/products/price-ui";
import {
  RECIPE_CHOICE_LINES_MAX,
  RECIPE_LINES_MAX,
  RecipeIcon,
  RecipeWarnChip,
  deltaText,
  hasRecipe,
  marginPctText,
  parseDelta,
  parseQty,
  qtyText,
  recipeCapable,
  recipeLive,
  recipeRefusalText,
} from "@/components/pos/products/recipe-ui";
import type { ProductsData, ProductsRecipeChoiceLine, ProductsRecipeCost, ProductsRecipeLine, ProductsRow } from "./products-data";

/** ผลบันทึกที่ลิ้นชักส่งกลับให้ตาราง — targetId = สินค้าหลักหรือตัวแปร · recipeChoiceLines null = ไม่ได้แตะ (ตัวแปร) */
export type RecipePatch = { targetId: string; recipe?: ProductsRecipeLine[]; recipeChoiceLines?: ProductsRecipeChoiceLine[] | null; bomEnabled: boolean };

type Props = {
  systemId: string;
  product: ProductsRow;
  data: ProductsData;
  /** ตัวเลือกสาขาของหน้า (null = ทุกสาขา) */
  unit: string | null;
  /** ผู้ใช้มี pos.product.manage (ตัวเขียนตรวจซ้ำตามขอบเขตแถว) */
  canEdit: boolean;
  onSaved: (productId: string, patch: RecipePatch, toast: string) => void;
};

type Hit = { id: string; systemId: string; name: string; sku: string; unitLabel: string; onHand: number; costSatang?: number };
type DraftLine = { invItemId: string; text: string };
type Draft = { lines: DraftLine[]; deltas: Record<string, DraftLine[]>; bom: boolean };

/** สาขาที่ใช้คิดต้นทุน: สาขาของแถว → สาขาที่เลือก (ถ้าแถวขายที่นั่น) → สาขาแรกที่แถวขาย */
export function costUnitOf(p: Pick<ProductsRow, "unitId" | "available">, units: readonly { id: string }[], unit: string | null): string | null {
  if (p.unitId) return p.unitId;
  if (unit && p.available[unit] !== undefined) return unit;
  return units.find((u) => p.available[u.id] !== undefined)?.id ?? null;
}

export function RecipeSection({ systemId, product: p, data, unit, canEdit, onSaved }: Props) {
  const tr = useTranslations("pos.recipe") as PT;
  const tp = useTranslations("pos.price") as PT;
  const treg = useTranslations("pos.register") as PT;
  const locale = useLocale();
  const en = locale.startsWith("en");
  const [variantId, setVariantId] = useState<string>(""); // "" = สินค้าหลัก
  const [choice, setChoice] = useState<string | null>(null); // null = สูตรพื้นฐาน
  const [costs, setCosts] = useState<Record<string, ProductsRecipeCost | "error">>(() => (p.recipeCost ? { [`${p.id}|`]: p.recipeCost } : {}));
  const [draft, setDraft] = useState<Draft | null>(null); // null = โหมดดู
  const [editTab, setEditTab] = useState<string | null>(null); // null = สูตรพื้นฐาน · อื่น = choiceId
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Record<string, Hit>>({});
  const searchSeq = useRef(0);

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
  const isMenu = p.kind === "MENU";
  const chips = useMemo(
    () => p.recipeGroups.flatMap((g) => g.choices.map((c) => ({ id: c.id, label: tr("choiceChip", { group: en && g.nameEn ? g.nameEn : g.name, choice: en && c.nameEn ? c.nameEn : c.name }) }))),
    [p.recipeGroups, en, tr],
  );
  const viewLabel = choice ? (chips.find((c) => c.id === choice)?.label ?? "") : tr("baseSize");
  const expanded = useMemo(() => expandRecipe({ lines, choiceLines, choiceIds: choice ? [choice] : [] }), [lines, choiceLines, choice]);
  const costUnit = costUnitOf(p, data.units, unit);
  const key = `${targetId}|${choice ?? ""}`;
  const cost = costs[key];

  // ต้นทุนของมุมมองที่ยังไม่มี (ตัวเลือก/ตัวแปร/หลังบันทึก) — คำขอเดียวต่อมุมมอง · จำผลไว้ (สูตรฐานของสินค้าหลักมากับหน้าแล้ว)
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
  }, [key, costUnit, lines]);

  // ตัวเลือกวัตถุดิบ: ค้นหลังหยุดพิมพ์ 300 มิลลิวินาที · คำตอบเก่าที่มาช้าทิ้ง
  useEffect(() => {
    const term = q.trim();
    if (!draft || !term) {
      setHits(null);
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const h = setTimeout(() => {
      void searchRecipeItemsAction({ systemId, q: term })
        .catch(() => null)
        .then((r) => {
          if (seq !== searchSeq.current) return;
          setSearching(false);
          if (r && r.ok) setHits(r.items);
          else {
            setHits([]);
            setErr(r ? recipeRefusalText(r, tr, tp, treg) : tr("errors.search"));
          }
        });
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, !!draft]);

  const ing = (id: string) => data.ingredients[id];
  const costLine = (id: string) => (cost && cost !== "error" ? cost.lines.find((l) => l.invItemId === id) : undefined);
  const nameOf = (id: string) => ing(id)?.name ?? picked[id]?.name ?? costLine(id)?.name ?? id;
  const unitOf = (id: string) => ing(id)?.unitLabel ?? picked[id]?.unitLabel ?? costLine(id)?.unitLabel ?? "";
  const archived = (id: string) => ing(id)?.archived === true;
  const seeCost = !!cost && cost !== "error" && cost.costSatang !== undefined;
  const unitName = (id: string) => data.units.find((u) => u.id === id)?.name ?? tr("otherBranch");

  // ── ป้าย (มติ 2/3) ──
  const ownerLines = lines;
  const archivedNames = [...new Set([...ownerLines.map((l) => l.invItemId), ...choiceLines.map((l) => l.invItemId)].filter(archived))].map(nameOf);
  const hiddenAt = live
    ? Object.keys(p.available).filter((u) => {
        const inv = data.unitInventory[u] ?? null;
        return ownerLines.some((l) => {
          const it = ing(l.invItemId);
          return !inv || it === undefined || it.systemId !== inv; // fix รอบ 1 (nit): ไม่พบวัตถุดิบ = ซ่อนแบบหน้าขาย (register.ts NOT EXISTS InvItem)
        });
      })
    : [];
  const backfilled = isMenu && !bom && ownerLines.length > 0 && !inherited;

  const startEdit = () => {
    const base = (inherited ? p.recipe : lines).map((l) => ({ invItemId: l.invItemId, text: String(l.qty) }));
    const deltas: Record<string, DraftLine[]> = {};
    // fix รอบ 1 (รีวิว F1): เฉพาะส่วนต่างของตัวเลือกที่ยังผูกอยู่ (ชิป = กลุ่มที่ผูก · ไม่เก็บถาวร) — แถวค้างของกลุ่มที่ถอด/เก็บถาวรหลุดตอนบันทึก (แทนทั้งชุด)
    const linked = new Set(chips.map((c) => c.id));
    if (!v) for (const c of p.recipeChoiceLines.filter((x) => linked.has(x.choiceId))) (deltas[c.choiceId] ??= []).push({ invItemId: c.invItemId, text: deltaText(c.qtyDelta, "", "en-US").trim() });
    // ตั้งต้นสวิตช์: สูตรใหม่ = เปิด (ตามกติกาบันทึกครั้งแรกของ S) · สูตรเดิม/สูตรจากเมนูเดิม = ค่าเดิม (F4: บันทึกไม่พลิกเอง)
    setDraft({ lines: base, deltas, bom: lines.length === 0 ? true : bom });
    setEditTab(null);
    setRowErr({});
    setErr(null);
    setQ("");
  };
  const cancelEdit = () => {
    setDraft(null);
    setRowErr({});
    setErr(null);
    setQ("");
  };
  const setLines = (f: (ls: DraftLine[]) => DraftLine[]) => setDraft((d) => (d ? { ...d, lines: f(d.lines) } : d));
  const setDeltas = (cid: string, f: (ls: DraftLine[]) => DraftLine[]) => setDraft((d) => (d ? { ...d, deltas: { ...d.deltas, [cid]: f(d.deltas[cid] ?? []) } } : d));
  const step = (id: string, by: number) =>
    setLines((ls) => ls.map((l) => (l.invItemId === id ? { ...l, text: String(Math.min(1_000_000, Math.max(1, (parseQty(l.text) ?? 1) + by))) } : l)));
  const pick = (h: Hit) => {
    setPicked((m) => ({ ...m, [h.id]: h }));
    if (editTab === null) setLines((ls) => (ls.some((l) => l.invItemId === h.id) ? ls : [...ls, { invItemId: h.id, text: "1" }]));
    else setDeltas(editTab, (ls) => (ls.some((l) => l.invItemId === h.id) ? ls : [...ls, { invItemId: h.id, text: "+1" }]));
    setQ("");
  };

  const save = async () => {
    if (!draft || busy) return;
    const errs: Record<string, string> = {};
    const outLines: ProductsRecipeLine[] = [];
    for (const l of draft.lines) {
      const n = parseQty(l.text);
      if (n === null) errs[`b|${l.invItemId}`] = tr("errors.qty");
      else outLines.push({ invItemId: l.invItemId, qty: n });
    }
    const outDeltas: ProductsRecipeChoiceLine[] = [];
    if (!v) {
      for (const [cid, ls] of Object.entries(draft.deltas)) {
        for (const l of ls) {
          const n = parseDelta(l.text);
          if (n === null) errs[`${cid}|${l.invItemId}`] = tr("errors.delta");
          else outDeltas.push({ choiceId: cid, invItemId: l.invItemId, qtyDelta: n });
        }
      }
    }
    setRowErr(errs);
    if (Object.keys(errs).length) return setErr(tp("errors.validation"));
    if (outLines.length > RECIPE_LINES_MAX) return setErr(tr("errors.tooManyLines", { max: RECIPE_LINES_MAX }));
    if (outDeltas.length > RECIPE_CHOICE_LINES_MAX) return setErr(tr("errors.tooManyDeltas", { max: RECIPE_CHOICE_LINES_MAX }));
    const wantBom = isMenu ? draft.bom && outLines.length > 0 : undefined;
    setBusy(true);
    setErr(null);
    try {
      const r = await saveRecipeAction({ systemId, productId: targetId, lines: outLines, ...(v ? {} : { choiceLines: outDeltas }), ...(wantBom === undefined ? {} : { bomEnabled: wantBom }) });
      if (!r.ok) return setErr(recipeRefusalText(r, tr, tp, treg));
      // fix รอบ 1 (รีวิว F4): บันทึกสินค้าหลัก = ล้างต้นทุนที่จำไว้ของตัวแปรที่ใช้สูตรของแม่ด้วย
      const stale = new Set([targetId, ...(v ? [] : p.recipeVariants.filter((x) => x.recipe.length === 0).map((x) => x.id))]);
      setCosts((c) => Object.fromEntries(Object.entries(c).filter(([k]) => !stale.has(k.slice(0, k.indexOf("|"))))));
      setDraft(null);
      setQ("");
      onSaved(p.id, { targetId, recipe: r.recipe, recipeChoiceLines: r.recipeChoiceLines, bomEnabled: r.bomEnabled }, tr("saved"));
    } catch {
      setErr(tp("errors.unknown"));
    } finally {
      setBusy(false);
    }
  };

  // มติ 2 (F4): ป้ายสูตรจากเมนูเดิม → เปิดสวิตช์โดยตรง
  const bomOn = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await setBomEnabledAction({ systemId, productId: targetId, on: true });
      if (!r.ok) return setErr(recipeRefusalText(r, tr, tp, treg));
      onSaved(p.id, { targetId, bomEnabled: r.bomEnabled }, tr("bomOnDone"));
    } catch {
      setErr(tp("errors.unknown"));
    } finally {
      setBusy(false);
    }
  };

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

  const banners = (
    <>
      {backfilled ? (
        <div data-testid="pos-prod-recipe-backfilled" role="status" className="flex flex-col gap-2 rounded-lg border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] px-3 py-2 text-[12px] text-[color:var(--color-ink-soft)]">
          <span>{tr("backfilledBanner", { item: ownerLines.map((l) => nameOf(l.invItemId)).join(", ") })}</span>
          {canEdit && !draft ? (
            <button type="button" data-testid="pos-prod-recipe-bom-on" disabled={busy} className="btn btn-primary h-11 self-start rounded-[11px] px-4 text-[12.5px] disabled:opacity-50" onClick={() => void bomOn()}>
              {tr("backfilledAction")}
            </button>
          ) : null}
        </div>
      ) : null}
      {archivedNames.length ? (
        <Banner testid="pos-prod-recipe-archived" title={`${tr("archivedIngredient")}: ${archivedNames.join(", ")}`} hint={tr("archivedHint")} />
      ) : null}
      {hiddenAt.map((u) => (
        <div key={u} data-testid={`pos-prod-recipe-branch-${u}`} role="status" className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-[12px] text-[color:var(--color-ink-soft)]">
          <RecipeIcon name="warn" size={14} className="mt-0.5" />
          <span className="min-w-0">
            <b className="block font-semibold">{tr("notAtBranch", { name: unitName(u) })}</b>
            <span className="block text-[11.5px] text-[color:var(--color-muted)]">{tr("notAtBranchHint")}</span>
          </span>
        </div>
      ))}
      {cost && cost !== "error" && cost.costComplete === false ? <Banner testid="pos-prod-recipe-nocost" title={tr("noCost")} hint={tr("noCostHint")} /> : null}
    </>
  );

  // ═══════ โหมดแก้ ═══════
  if (draft) {
    const tabLines = editTab === null ? draft.lines : (draft.deltas[editTab] ?? []);
    const tabChip = editTab === null ? null : chips.find((c) => c.id === editTab);
    return (
      <section data-testid="pos-prod-recipe" data-mode="edit" className="flex flex-col gap-2.5">
        <Head title={tr("tabTitle")} sub={inherited ? tr("parentRecipe") : undefined} />
        {banners}
        {isMenu ? (
          <button
            type="button"
            role="switch"
            aria-checked={draft.bom && draft.lines.length > 0}
            data-testid="pos-prod-recipe-bom"
            disabled={busy || draft.lines.length === 0}
            className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-left text-[12.5px] disabled:opacity-60"
            onClick={() => setDraft((d) => (d ? { ...d, bom: !d.bom } : d))}
          >
            <span className={`relative inline-block h-5 w-9 shrink-0 rounded-full ${draft.bom && draft.lines.length > 0 ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-surface-2)] ring-1 ring-inset ring-[color:var(--color-border)]"}`}>
              <i className={`absolute top-0.5 size-4 rounded-full bg-[color:var(--color-surface)] shadow transition-all ${draft.bom && draft.lines.length > 0 ? "left-[18px]" : "left-0.5"}`} />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block font-semibold">{tr("bomToggle")}</b>
              <span className="block text-[11px] text-[color:var(--color-muted)]">{draft.lines.length ? tr("bomToggleHint") : tr("errors.noRecipe")}</span>
            </span>
          </button>
        ) : null}
        {!v && chips.length ? (
          <div role="tablist" aria-label={tr("choiceDelta")} className="flex flex-wrap gap-1.5">
            <button type="button" role="tab" aria-selected={editTab === null} data-testid="pos-prod-recipe-tab-base" className={chipCls(editTab === null)} onClick={() => setEditTab(null)}>
              {tr("baseSize")}
            </button>
            {chips.map((c) => {
              const n = (draft.deltas[c.id] ?? []).length;
              return (
                <button key={c.id} type="button" role="tab" aria-selected={editTab === c.id} data-testid={`pos-prod-recipe-tab-${c.id}`} className={chipCls(editTab === c.id)} onClick={() => setEditTab(c.id)}>
                  {c.label}
                  {n ? <span className="ml-1.5 rounded-full bg-[color:var(--color-surface-2)] px-1.5 text-[10.5px] tabular-nums">{n}</span> : null}
                </button>
              );
            })}
          </div>
        ) : v ? (
          <p className="text-[11.5px] text-[color:var(--color-muted)]">{tr("variantNoChoice")}</p>
        ) : null}
        <p className="text-[11.5px] text-[color:var(--color-muted)]">{tabChip ? `${tr("deltaFor", { choice: tabChip.label })} · ${tr("choiceDeltaHint")}` : tr("qty")}</p>

        <div data-testid="pos-prod-recipe-edit-rows" className="flex flex-col">
          {!tabLines.length ? (
            <p className="rounded-lg border border-dashed px-3 py-3 text-center text-[12px] text-[color:var(--color-muted)]">{editTab === null ? tr("empty") : tr("noDelta")}</p>
          ) : editTab === null ? (
            tabLines.map((l) => {
              const e = rowErr[`b|${l.invItemId}`];
              return (
                <div key={l.invItemId} className="flex flex-col gap-0.5 border-b py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 text-[12.5px]">
                      <span className="block truncate">{nameOf(l.invItemId)}</span>
                      {archived(l.invItemId) ? <span className="block text-[10.5px] text-[color:var(--color-danger)]">{tr("archivedIngredient")}</span> : null}
                    </span>
                    <button type="button" data-testid={`pos-prod-recipe-dec-${l.invItemId}`} aria-label={tr("decrease")} disabled={busy} className="grid size-11 place-items-center rounded-lg border" onClick={() => step(l.invItemId, -1)}>
                      <RecipeIcon name="minus" size={14} />
                    </button>
                    <input
                      data-testid={`pos-prod-recipe-qty-${l.invItemId}`}
                      aria-label={`${tr("qty")} · ${nameOf(l.invItemId)}`}
                      inputMode="numeric"
                      className={`input h-11 w-[72px] text-right tabular-nums ${e ? "border-[color:var(--color-danger)]" : ""}`}
                      value={l.text}
                      disabled={busy}
                      onChange={(ev) => {
                        const text = ev.target.value;
                        setLines((ls) => ls.map((x) => (x.invItemId === l.invItemId ? { ...x, text } : x)));
                      }}
                    />
                    <button type="button" data-testid={`pos-prod-recipe-inc-${l.invItemId}`} aria-label={tr("increase")} disabled={busy} className="grid size-11 place-items-center rounded-lg border" onClick={() => step(l.invItemId, 1)}>
                      <RecipeIcon name="plus" size={14} />
                    </button>
                    <span className="w-9 shrink-0 truncate text-[11.5px] text-[color:var(--color-muted)]">{unitOf(l.invItemId)}</span>
                    <button
                      type="button"
                      data-testid={`pos-prod-recipe-remove-${l.invItemId}`}
                      aria-label={tr("removeIngredient")}
                      disabled={busy}
                      className="grid size-11 place-items-center rounded-lg text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)]"
                      onClick={() => setLines((ls) => ls.filter((x) => x.invItemId !== l.invItemId))}
                    >
                      <RecipeIcon name="trash" size={15} />
                    </button>
                  </div>
                  {e ? <p className="text-[11px] text-[color:var(--color-danger)]">{e}</p> : null}
                </div>
              );
            })
          ) : (
            tabLines.map((l) => {
              const cid = editTab;
              const e = rowErr[`${cid}|${l.invItemId}`];
              return (
                <div key={l.invItemId} className="flex flex-col gap-0.5 border-b py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[12.5px]">{nameOf(l.invItemId)}</span>
                    <input
                      data-testid={`pos-prod-recipe-delta-${cid}-${l.invItemId}`}
                      aria-label={`${tr("choiceDelta")} · ${nameOf(l.invItemId)}`}
                      inputMode="text"
                      className={`input h-11 w-[88px] text-right tabular-nums ${e ? "border-[color:var(--color-danger)]" : ""}`}
                      value={l.text}
                      disabled={busy}
                      onChange={(ev) => {
                        const text = ev.target.value;
                        setDeltas(cid, (ls) => ls.map((x) => (x.invItemId === l.invItemId ? { ...x, text } : x)));
                      }}
                    />
                    <span className="w-9 shrink-0 truncate text-[11.5px] text-[color:var(--color-muted)]">{unitOf(l.invItemId)}</span>
                    <button
                      type="button"
                      data-testid={`pos-prod-recipe-delta-remove-${cid}-${l.invItemId}`}
                      aria-label={tr("removeIngredient")}
                      disabled={busy}
                      className="grid size-11 place-items-center rounded-lg text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)]"
                      onClick={() => setDeltas(cid, (ls) => ls.filter((x) => x.invItemId !== l.invItemId))}
                    >
                      <RecipeIcon name="trash" size={15} />
                    </button>
                  </div>
                  {e ? <p className="text-[11px] text-[color:var(--color-danger)]">{e}</p> : null}
                </div>
              );
            })
          )}
        </div>

        {/* ตัวเลือกวัตถุดิบ (ค้นในคลังที่ผูก POS) */}
        <div className="flex flex-col gap-1.5">
          <label className="flex h-11 items-center gap-2 rounded-[10px] border px-3">
            <RecipeIcon name="plus" size={14} className="text-[color:var(--color-muted)]" />
            <input
              data-testid="pos-prod-recipe-search"
              aria-label={tr("addIngredient")}
              className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none"
              placeholder={tr("searchPlaceholder")}
              value={q}
              disabled={busy}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          {q.trim() ? (
            <div data-testid="pos-prod-recipe-hits" className="flex max-h-[220px] flex-col overflow-y-auto rounded-lg border">
              {searching && !hits ? <p className="px-3 py-2 text-[12px] text-[color:var(--color-muted)]">{tr("searching")}</p> : null}
              {hits && !hits.length ? <p className="px-3 py-2 text-[12px] text-[color:var(--color-muted)]">{tr("searchEmpty")}</p> : null}
              {(hits ?? []).map((h) => (
                <button key={h.id} type="button" data-testid={`pos-prod-recipe-pick-${h.id}`} disabled={busy} className="flex min-h-11 items-center gap-2 border-b px-3 py-1.5 text-left last:border-b-0 hover:bg-[color:var(--color-surface-2)]" onClick={() => pick(h)}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold">{h.name}</span>
                    <span className="block truncate text-[11px] text-[color:var(--color-muted)]">
                      {[h.sku, tr("pickMeta", { onHand: h.onHand.toLocaleString(en ? "en-US" : "th-TH"), unit: h.unitLabel }), h.costSatang !== undefined ? tr("pickCost", { cost: moneyText(h.costSatang), unit: h.unitLabel }) : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <RecipeIcon name="plus" size={14} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {err ? (
          <p data-testid="pos-prod-recipe-error" role="alert" className="rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-[12px] text-[color:var(--color-danger)]">
            {err}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="pos-prod-recipe-save" disabled={busy} className="btn btn-primary h-11 min-w-[88px] rounded-[11px] px-5 disabled:opacity-50" onClick={() => void save()}>
            {tr("save")}
          </button>
          <button type="button" data-testid="pos-prod-recipe-cancel" disabled={busy} className="btn btn-ghost h-11 rounded-[11px] px-4" onClick={cancelEdit}>
            {tr("cancel")}
          </button>
        </div>
      </section>
    );
  }

  // ═══════ โหมดดู ═══════
  const editLink = canEdit ? (
    <button type="button" data-testid="pos-prod-recipe-edit" className="inline-flex min-h-11 items-center px-1 text-[11.5px] font-bold text-[color:var(--color-accent)]" onClick={startEdit}>
      {tr("editRecipe")}
    </button>
  ) : null;
  return (
    <section data-testid="pos-prod-recipe" data-mode="view" className="flex flex-col gap-2.5">
      <Head title={tr("tabTitle")} sub={lines.length ? viewLabel : undefined} right={editLink} />

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
                {en && x.nameEn ? x.nameEn : x.name}
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
      {banners}
      {err ? (
        <p data-testid="pos-prod-recipe-error" role="alert" className="rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-[12px] text-[color:var(--color-danger)]">
          {err}
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
                      <td className="py-[5px] pr-2">
                        {nameOf(c.invItemId)}
                        {archived(c.invItemId) ? <span className="ml-1.5 text-[10.5px] text-[color:var(--color-danger)]">{tr("archivedIngredient")}</span> : null}
                      </td>
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
                  {cost.costComplete === false ? (
                    <span data-testid="pos-prod-recipe-flag-nocost">
                      <RecipeWarnChip text={tr("noCost")} />
                    </span>
                  ) : null}
                  {cost.marginBp === null ? (
                    <span data-testid="pos-prod-recipe-flag-nomargin">
                      <RecipeWarnChip text={tr("marginUnknown")} />
                    </span>
                  ) : null}
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

function Banner({ testid, title, hint }: { testid: string; title: string; hint: string }) {
  return (
    <div data-testid={testid} role="status" className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-[12px] text-[color:var(--color-ink-soft)]">
      <RecipeIcon name="warn" size={14} className="mt-0.5" />
      <span className="min-w-0">
        <b className="block font-semibold">{title}</b>
        <span className="block text-[11.5px] text-[color:var(--color-muted)]">{hint}</span>
      </span>
    </div>
  );
}

/** ชิปมุมมอง/แท็บ (สูตรพื้นฐาน / ตัวเลือก) — สูง 44 */
export const chipCls = (on: boolean) => `inline-flex min-h-11 items-center rounded-lg border px-2.5 text-[12px] ${on ? "border-[color:var(--color-ink)] font-bold" : "text-[color:var(--color-ink-soft)]"}`;
