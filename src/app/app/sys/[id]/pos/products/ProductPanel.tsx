"use client";

// ProductPanel.tsx — ลิ้นชักสินค้าของจอ 06 (POS P2.2U · มติ 2 · ภาพ 06 ขวา "ลาเต้ · SKU CF-001")
//   แท็บ ทั่วไป (สรุปอ่านอย่างเดียว) · ตัวเลือก / สูตรและวัตถุดิบ / สต็อก = เร็ว ๆ นี้ · P2.3 (ปิดอยู่) · ราคาตามช่องทาง (ใช้งานจริง)
//   ราคาตามช่องทาง: หัว "ราคาตามช่องทางและช่วงเวลา" + "แก้ราคา" · ดู = ตาราง 2 คอลัมน์ทุกช่องทางที่เปิดของขอบเขต (ชื่อ · +27% · ราคา · ไม่ขาย —) ·
//   แก้ = ช่องเงินต่อช่องทาง + สวิตช์ "ไม่ขาย" + "ใช้ราคาปกติ" · ขอบเขต = ตัวเลือกสาขาของหน้า (แถวเขียนด้วย unitId = สาขาที่เลือก หรือ null) ·
//   บันทึก = setChannelPricesAction แทนทั้งชุด (มติ 9) · ปฏิเสธ = แถบแดงผ่านคีย์ · กล่องโปรราคาที่ครอบสินค้านี้ (กำลังใช้/รอเริ่ม) + ลิงก์ไปจอโปร
//   ท้าย: "บันทึก" (แท็บราคาเท่านั้น) · "ทำสำเนา" / "เก็บถาวร" = ภาพเท่านั้น (ปิด · เร็ว ๆ นี้ · Q1)
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · ปุ่ม ≥ 44px · testid ตัวอักษรตรงบนแท็ก
// POS P2.11U ▸ หลายสาขา (มติ 2 3 6): ราคาตามช่องทาง = กลุ่ม "ทุกสาขา" (แถว (ช่องทาง, ทุกสาขา) · testid เดิม) แล้วกลุ่มต่อสาขาที่เข้าได้
//   (pos-prod-drawer-group-<unitId> · ช่องละช่องทาง: ว่าง = สืบทอด (แสดงค่าที่สืบทอดจาง) · พิมพ์ = แถว (ช่องทาง, สาขา) ของตัวเอง · ล้าง = ลบแถว) ·
//   บันทึก = setChannelPricesAction ทั้งชุดเหมือนเดิม (แถวที่มองไม่เห็น/เลิกใช้ส่งกลับไม่เปลี่ยน — เซิร์ฟเวอร์เก็บไว้) ·
//   คำปฏิเสธ: reason ก่อน (priceRowDead · bulkTooMany) แล้วรหัส · PERMISSION_DENIED = toast (ลิ้นชักไม่ปิด) · field = กรอบแดงรอบกลุ่ม ·
//   หมายเหตุแถวเลิกใช้ N แถว + "ล้างแถวที่เลิกใช้" (purgeDead · ขอบเขตทั้งสินค้าเท่านั้น · ยืนยันก่อน) · โหมดสาขา = กลุ่ม "ทุกสาขา" อ่านอย่างเดียว ◂

// POS P2.11U ▸ imports หลายสาขา (fix1 มติ 8 ครอบ): + useEffect/useRef (เลื่อนไปกลุ่มสาขา) · + priceReasonText · − priceErrorText/draftOf/rowsFromDraft · + กลุ่มของ products-scope
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { setChannelPricesAction } from "@/lib/modules/pos/catalog-price-actions";
import { CHANNEL_PRICE_ROWS_MAX } from "@/lib/modules/pos/price-shared";
import { priceReasonText } from "@/components/pos/products/price-ui"; // POS P2.11U ▸ มติ 2 ◂
import { moneyText } from "@/lib/modules/pos/register-shared";
import { channelDisplayName } from "@/components/pos/settings/channel-text";
import { PriceIcon, SoonTag, markupText, parseMoneyInput, priceRefusalText, ruleAdjustText, rulePriceOn, ruleStateOf, ruleTouches, ruleWindowText, satangToInput, type PT } from "@/components/pos/products/price-ui";
import type { ProductsChannel, ProductsData, ProductsPriceRow, ProductsRow } from "./products-data";
import { channelsIn, effectiveOf, type DraftCell } from "./products-scope";
// POS P2.11U ▸ มติ 2: กลุ่มทุกสาขา/ต่อสาขา ◂
import { draftGroups, groupKey, inheritedOf, rowsFromGroups, type GroupDraft, type PriceGroup } from "./products-scope";
// ◂
// POS P2.3U ▸ มติ 1: แท็บ "สูตรและวัตถุดิบ" ใช้งานจริง (RecipeSection) ◂
import { RecipeSection, type RecipePatch } from "./RecipeSection";
// POS P2.6U ▸ มติ 9b: ส่วน "ครัว" ในแท็บทั่วไป (สถานีครัว · 86 ของสาขา) ◂
import { ProductKitchenSection, type KitchenPatch } from "@/components/pos/products/kitchen-ui";

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
  // POS P2.11U ▸ (fix1 มติ 8 ครอบ) onSaved + purged (มติ 3 ล้างแถวเลิกใช้) · props หลายสาขา
  onSaved: (productId: string, rows: ProductsPriceRow[], purged?: boolean) => void;
  // POS P2.11U ▸ มติ 1 2 3 6: กลุ่มสาขาที่เปิดมา (แตะช่อง "ราคา <สาขา>") · โหมดสาขา · ล้างแถวเลิกใช้ได้ · toast ของหน้า (PERMISSION_DENIED) ◂
  focusUnit?: string | null;
  branchMode?: boolean;
  canPurge?: boolean;
  onToast?: (text: string) => void;
  // ◂
  // POS P2.3U ▸ มติ 1/2: แก้สูตรได้ (pos.product.manage) · ผลบันทึกสูตร/สวิตช์ → ตาราง ◂
  canEditRecipe?: boolean;
  onRecipeSaved?: (productId: string, patch: RecipePatch, toast: string) => void;
  // POS P2.6U ▸ มติ 9b: ตั้งสถานี (pos.product.manage) · แจ้ง 86 (pos.sale.create | pos.product.manage) · ผลกลับตาราง ◂
  canManage?: boolean;
  canMark86?: boolean;
  onKitchenSaved?: (productId: string, patch: KitchenPatch, toast: string) => void;
};

// POS P2.11U ▸ (fix1 มติ 8 ครอบ) + focusUnit · branchMode · canPurge · onToast
export function ProductPanel({ systemId, product: p, data, unit, canEdit, onClose, onSaved, canEditRecipe = false, onRecipeSaved, canManage = false, canMark86 = false, onKitchenSaved, focusUnit = null, branchMode = false, canPurge = false, onToast }: Props) {
  // ◂
  const t = useTranslations("pos.products") as PT;
  const tp = useTranslations("pos.price") as PT;
  const tr = useTranslations("pos.price.rule") as PT;
  const treg = useTranslations("pos.register") as PT;
  const tch = useTranslations("pos.channel") as PT;
  const locale = useLocale();
  const [tab, setTab] = useState<PanelTab>("prices");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<GroupDraft>({}); // POS P2.11U ▸ ร่างต่อกลุ่ม ◂
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // POS P2.11U ▸ มติ 2 3: field ของคำปฏิเสธ = กรอบแดงรอบกลุ่ม · ยืนยันล้างแถวเลิกใช้ ◂
  const [groupsErr, setGroupsErr] = useState(false);
  const [purgeAsk, setPurgeAsk] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const chans = useMemo(() => channelsIn(data.channels, unit), [data.channels, unit]);
  const category = data.categories.find((c) => c.id === p.categoryId);
  const catName = category ? (locale.startsWith("en") && category.nameEn ? category.nameEn : category.name) : t("drawer.noCategory");
  const unitName = (id: string) => data.units.find((u) => u.id === id)?.name ?? "";
  const soldUnits = Object.entries(p.available).filter(([, v]) => v).length;
  const name = locale.startsWith("en") && p.nameEn ? p.nameEn : p.name;
  const weighed = p.soldByWeight;
  // POS P2.11U ▸ มติ 2 6: กลุ่ม "ทุกสาขา" (ทุกช่องทาง) + กลุ่มต่อสาขาที่เข้าได้ (ช่องทางที่เปิดที่สาขานั้น · STORE เสมอ) · สินค้าของสาขาเดียว = กลุ่มของสาขานั้นเท่านั้น ◂
  const withStore = (codes: string[]) => (codes.includes("STORE") ? codes : ["STORE", ...codes]);
  const groups: PriceGroup[] = useMemo(() => {
    const allCodes = channelsIn(data.channels, null).map((c) => c.code);
    const out: PriceGroup[] = [{ unit: null, codes: allCodes.length ? withStore(allCodes) : [], editable: canEdit && !weighed && !branchMode && allCodes.length > 0 }];
    for (const u of data.units) {
      if (p.unitId !== null && p.unitId !== u.id) continue;
      const codes = withStore(channelsIn(data.channels, u.id).map((c) => c.code));
      // POS P2.11U ▸ fix1 มติ 1: สาขาที่ไม่มีสินค้านี้ในคลัง (ไม่อยู่ในรายการของสาขา) = ไม่มีช่องแก้ · บรรทัดจางแทน · แถวของสาขานี้อยู่ใน payload ไม่เปลี่ยน ◂
      if (p.available[u.id] === undefined) {
        out.push({ unit: u.id, codes, editable: false, unstocked: true });
        continue;
      }
      out.push({ unit: u.id, codes, editable: canEdit && !weighed });
    }
    return out;
  }, [data.channels, data.units, p.unitId, canEdit, weighed, branchMode]);
  const editable = groups.some((g) => g.editable);
  const deadRows = p.deadRows ?? 0;
  useEffect(() => {
    if (!focusUnit) return;
    const el = bodyRef.current?.querySelector(`[data-testid="pos-prod-drawer-group-${focusUnit}"]`);
    if (el && "scrollIntoView" in el) (el as HTMLElement).scrollIntoView({ block: "start" });
  }, [focusUnit]);
  const now = useMemo(() => new Date(), []);
  const rules = data.rules.filter((r) => !r.archived && ruleTouches(r, p)).map((r) => ({ r, state: ruleStateOf(r, now) })).filter((x) => x.state === "ACTIVE" || x.state === "UPCOMING");

  // POS P2.11U ▸ (fix1 มติ 8 ครอบ) ร่างต่อกลุ่ม (draftGroups) · ล้างกรอบแดง/ยืนยันล้างแถว
  const startEdit = () => {
    setDraft(draftGroups(p, groups, satangToInput));
    setRowErr({});
    setSaveErr(null);
    setGroupsErr(false);
    setPurgeAsk(false);
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setRowErr({});
    setSaveErr(null);
    setGroupsErr(false);
  };
  // ◂
  // POS P2.11U ▸ ร่างต่อกลุ่ม (คีย์ "*" = ทุกสาขา) ◂
  const setCell = (gk: string, code: string, patch: Partial<DraftCell>) =>
    setDraft((d) => ({ ...d, [gk]: { ...(d[gk] ?? {}), [code]: { ...(d[gk]?.[code] ?? { text: "", notSold: false }), ...patch } } }));

  /** POS P2.11U ▸ มติ 2: คำปฏิเสธ — reason ก่อน แล้วรหัส · PERMISSION_DENIED = toast ลิ้นชักไม่ปิด · field = กรอบแดงรอบกลุ่ม (แถวทั้งชุด) ◂ */
  const refused = (r: { code: string; message?: string; field?: string; reason?: string }) => {
    // VALIDATION ของแถวทั้งชุด (field "rows") ไม่ชี้ช่องเดียว ⇒ ข้อความของบริการ (P2.2U fix รอบ 1 F4) + กรอบแดงรอบกลุ่ม
    const text = priceReasonText(r, tp) ?? priceRefusalText(r, false, tp, treg);
    if (r.code === "PERMISSION_DENIED" && onToast) onToast(text);
    else setSaveErr(text);
    if (r.field) setGroupsErr(true);
  };

  const save = async () => {
    if (!editing || busy) return;
    // POS P2.11U ▸ (fix1 มติ 8 ครอบ) แถวทั้งชุดจากร่างทุกกลุ่ม · คีย์ error "<กลุ่ม>|<ช่องทาง>" ◂
    const { rows, errors } = rowsFromGroups(p, draft, parseMoneyInput);
    const errs: Record<string, string> = {};
    for (const [k, e] of Object.entries(errors)) errs[k] = tp(e === "max" ? "errors.priceMax" : "errors.priceFormat");
    setRowErr(errs);
    setGroupsErr(false);
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
      } else refused(r); // POS P2.11U ▸ มติ 2: คำปฏิเสธผ่าน refused (reason ก่อน · toast · กรอบแดง) ◂
    } catch {
      setSaveErr(tp("errors.unknown"));
    } finally {
      setBusy(false);
    }
  };

  // POS P2.11U ▸ มติ 3: ล้างแถวที่เลิกใช้ = ส่งแถวชุดปัจจุบัน + purgeDead (เซิร์ฟเวอร์ลบเฉพาะแถวเลิกใช้ของสินค้านี้ · ตรวจขอบเขตทั้งสินค้าก่อนเขียน) ◂
  const purge = async () => {
    if (busy) return;
    setBusy(true);
    setSaveErr(null);
    try {
      const r = await setChannelPricesAction({ systemId, productId: p.id, rows: p.rows, purgeDead: true });
      if (r.ok) {
        setPurgeAsk(false);
        onSaved(p.id, r.rows, true);
      } else refused(r);
    } catch {
      setSaveErr(tp("errors.unknown"));
    } finally {
      setBusy(false);
    }
  };

  const chName = (c: ProductsChannel) => channelDisplayName(c.code, c.name, tch);
  // POS P2.11U ▸ ชื่อช่องทางจากรหัส (STORE ที่สาขายังไม่มีแถว = ชื่อตั้งต้น) ◂
  const codeName = (code: string) => {
    const c = data.channels.find((x) => x.code === code);
    return c ? chName(c) : channelDisplayName(code, code, tch);
  };

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
      {/* POS P2.11U ▸ มติ 1: ref = เลื่อนไปกลุ่มสาขาที่แตะมา ◂ */}
      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-[18px] py-3">
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
            {/* POS P2.6U ▸ มติ 9b ◂ */}
            <dd className="col-span-2">
              <ProductKitchenSection systemId={systemId} product={p} unit={unit} canManage={canManage} canMark={canMark86} onSaved={(id, patch, toast) => onKitchenSaved?.(id, patch, toast)} />
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
            {/* POS P2.11U ▸ มติ 2 3 6 (fix1 มติ 8 ครอบทั้งก้อน): แทนบรรทัดขอบเขต/ตารางช่องทางเดิมด้วยกลุ่ม "ทุกสาขา" + กลุ่มต่อสาขา · หมายเหตุแถวเลิกใช้ */}
            {weighed ? (
              <p data-testid="pos-prod-price-weighed" className="rounded-lg border border-dashed px-3 py-2 text-[12px] text-[color:var(--color-muted)]">
                {tp("drawer.weighed")}
              </p>
            ) : chans.length === 0 && groups.every((g) => g.codes.length === 0) ? (
              <p className="rounded-lg border border-dashed px-3 py-2 text-[12px] text-[color:var(--color-muted)]">{tp("drawer.noChannels")}</p>
            ) : (
              <div data-testid="pos-prod-drawer-groups" className={`flex flex-col gap-4 rounded-xl ${groupsErr ? "border border-[color:var(--color-danger)] p-2" : ""}`}>
                {groups.map((g) => {
                  if (!g.codes.length) return null;
                  // POS P2.11U ▸ fix1 มติ 1: บรรทัดจาง "ไม่มีสินค้านี้ในคลังของสาขา <สาขา>" แทนกลุ่ม ◂
                  if (g.unstocked && g.unit !== null)
                    return (
                      <p key={groupKey(g.unit)} data-testid={`pos-prod-drawer-unstocked-${g.unit}`} className="text-[12px] text-[color:var(--color-muted)]">
                        {t("branch.unstocked", { unit: unitName(g.unit) })}
                      </p>
                    );
                  const gk = groupKey(g.unit);
                  const all = g.unit === null;
                  const editingGroup = editing && g.editable;
                  return (
                    <GroupBox key={gk} unit={g.unit}>
                      <div className="flex items-center gap-2 text-[12px] font-bold">
                        <span className="min-w-0 flex-1 truncate">{all ? tp("allBranches") : unitName(g.unit!)}</span>
                        {!g.editable && canEdit && !weighed ? <small className="font-normal text-[color:var(--color-muted)]">{t("branch.readOnly")}</small> : null}
                      </div>
                      {all && branchMode ? <p data-testid="pos-prod-drawer-managerHint" className="text-[11.5px] text-[color:var(--color-muted)]">{t("branch.managerHint")}</p> : null}
                      {!editingGroup ? (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {g.codes.map((code) => {
                            const e = effectiveOf(p, code, g.unit);
                            const own = e.kind !== "none" && e.own;
                            const mk = e.kind === "price" ? markupText(e.priceSatang, p.basePriceSatang, tp) : null;
                            return (
                              <ViewCell key={code} unit={g.unit} code={code}>
                                <span className="min-w-0 flex-1 truncate">{codeName(code)}</span>
                                {e.kind === "notSold" ? (
                                  <small className={`text-[11px] ${own ? "font-bold" : "text-[color:var(--color-muted)]"}`}>{tp("notSoldDash")}</small>
                                ) : e.kind === "none" ? (
                                  <small className="text-[11px] text-[color:var(--color-muted)]">{t("noPrice")}</small>
                                ) : (
                                  <>
                                    {mk ? <small className="text-[11px] text-[color:var(--color-muted)]">{mk}</small> : null}
                                    <b className={`tabular-nums ${own ? "" : "font-medium text-[color:var(--color-muted)]"}`}>{moneyText(e.priceSatang)}</b>
                                  </>
                                )}
                              </ViewCell>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {g.codes.map((code) => {
                            const cell = draft[gk]?.[code] ?? { text: "", notSold: false };
                            const inherited = inheritedOf(p, code, g.unit);
                            const err = rowErr[`${gk}|${code}`];
                            return (
                              <div key={code} className={`flex flex-col gap-1 rounded-lg border px-2.5 py-1.5 ${err ? "border-[color:var(--color-danger)]" : ""}`}>
                                <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                                  <span className="min-w-[96px] flex-1 truncate font-semibold">{codeName(code)}</span>
                                  {(() => {
                                    const inp = {
                                      "aria-label": tp("drawer.priceFor", { channel: all ? codeName(code) : `${codeName(code)} · ${unitName(g.unit!)}` }),
                                      inputMode: "decimal" as const,
                                      className: "input h-11 w-28 text-right tabular-nums disabled:opacity-50",
                                      value: cell.text,
                                      disabled: cell.notSold || busy,
                                      placeholder: inherited.kind === "price" ? satangToInput(inherited.priceSatang) : "",
                                      onChange: (ev: React.ChangeEvent<HTMLInputElement>) => setCell(gk, code, { text: ev.target.value }),
                                    };
                                    return all ? <input data-testid={`pos-prod-price-${code}`} {...inp} /> : <input data-testid={`pos-prod-drawer-cell-${g.unit}-${code}`} {...inp} />;
                                  })()}
                                  {(() => {
                                    const btn = {
                                      type: "button" as const,
                                      role: "switch",
                                      "aria-checked": cell.notSold,
                                      disabled: busy,
                                      className: `inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2 text-[11.5px] ${cell.notSold ? "border-[color:var(--color-ink)] font-bold" : "text-[color:var(--color-muted)]"}`,
                                      onClick: () => setCell(gk, code, { notSold: !cell.notSold }),
                                    };
                                    return all ? (
                                      <button data-testid={`pos-prod-notsold-${code}`} {...btn}>
                                        {tp("notSold")}
                                      </button>
                                    ) : (
                                      <button data-testid={`pos-prod-drawer-notsold-${g.unit}-${code}`} {...btn}>
                                        {tp("notSold")}
                                      </button>
                                    );
                                  })()}
                                  {(() => {
                                    const btn = {
                                      type: "button" as const,
                                      disabled: busy || (!cell.notSold && !cell.text),
                                      className: "inline-flex min-h-11 items-center px-1 text-[11.5px] text-[color:var(--color-accent)] disabled:text-[color:var(--color-muted)] disabled:opacity-60",
                                      onClick: () => setCell(gk, code, { text: "", notSold: false }),
                                    };
                                    return all ? (
                                      <button data-testid={`pos-prod-usebase-${code}`} {...btn}>
                                        {tp("useBase")}
                                      </button>
                                    ) : (
                                      <button data-testid={`pos-prod-drawer-clear-${g.unit}-${code}`} {...btn}>
                                        {t("branch.inherit")}
                                      </button>
                                    );
                                  })()}
                                </div>
                                {err ? (
                                  all ? (
                                    <p data-testid={`pos-prod-price-err-${code}`} className="text-[11.5px] text-[color:var(--color-danger)]">
                                      {err}
                                    </p>
                                  ) : (
                                    <p data-testid={`pos-prod-drawer-err-${g.unit}-${code}`} className="text-[11.5px] text-[color:var(--color-danger)]">
                                      {err}
                                    </p>
                                  )
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </GroupBox>
                  );
                })}
              </div>
            )}
            {deadRows > 0 ? (
              <div data-testid="pos-prod-deadNote" className="mt-3 flex flex-col gap-2 rounded-lg border border-dashed px-3 py-2 text-[12px] text-[color:var(--color-muted)]">
                <span>{t("branch.dead.note", { count: deadRows })}</span>
                {canPurge && canEdit && !editing ? (
                  purgeAsk ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 text-[color:var(--color-ink-soft)]">{t("branch.dead.confirm", { count: deadRows })}</span>
                      <button type="button" data-testid="pos-prod-purgeDead-confirm" disabled={busy} className="btn btn-primary h-11 rounded-[11px] px-4 text-[12.5px] disabled:opacity-50" onClick={() => void purge()}>
                        {t("branch.dead.confirmYes")}
                      </button>
                      <button type="button" data-testid="pos-prod-purgeDead-cancel" disabled={busy} className="btn btn-ghost h-11 rounded-[11px] px-4 text-[12.5px]" onClick={() => setPurgeAsk(false)}>
                        {tp("cancel")}
                      </button>
                    </span>
                  ) : (
                    <button type="button" data-testid="pos-prod-purgeDead" className="inline-flex min-h-11 items-center self-start text-[12px] font-bold text-[color:var(--color-accent)]" onClick={() => setPurgeAsk(true)}>
                      {t("branch.dead.purge")}
                    </button>
                  )
                ) : null}
              </div>
            ) : null}
            {/* ◂ */}
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

// ═══════════ POS P2.11U ▸ กล่องกลุ่ม/ช่องดูของลิ้นชัก (testid ตัวอักษรตรงบนแท็ก — กลุ่ม "ทุกสาขา" คง testid เดิมของ P2.2U) ◂ ═══════════
function GroupBox({ unit, children }: { unit: string | null; children: React.ReactNode }) {
  const cls = "flex scroll-mt-2 flex-col gap-2";
  return unit === null ? (
    <div data-testid="pos-prod-drawer-group-all" className={cls}>
      {children}
    </div>
  ) : (
    <div data-testid={`pos-prod-drawer-group-${unit}`} className={cls}>
      {children}
    </div>
  );
}
function ViewCell({ unit, code, children }: { unit: string | null; code: string; children: React.ReactNode }) {
  const cls = "flex min-h-9 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px]";
  return unit === null ? (
    <div data-testid={`pos-prod-cell-${code}`} className={cls}>
      {children}
    </div>
  ) : (
    <div data-testid={`pos-prod-drawer-cell-${unit}-${code}`} className={cls}>
      {children}
    </div>
  );
}
