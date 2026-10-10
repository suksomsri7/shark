"use client";

// PriceRulesClient.tsx — จอ "โปรราคา / Happy hour" (POS P2.2U · มติ 4 · CD1/CD8)
//   แถว = ชื่อ · ชิปชนิด (ราคาพิเศษ / ลด % / ลดบาท) · ช่วงเวลา "จ.–ศ. 14:00–16:00" · ขอบเขต "3 สินค้า · หน้าร้าน" / หมวด · ค่า "฿59" / "−20%" ·
//   สวิตช์เปิดใช้ · ป้ายสถานะ กำลังใช้ / รอเริ่ม / หมดแล้ว (priceRuleState) · ที่เก็บถาวรซ่อนหลัง "แสดงที่เก็บแล้ว (n)"
//   ลิ้นชักแก้: สินค้า/หมวด · ช่องทาง · สาขา · วันในสัปดาห์ (0=อา…6=ส) · ช่วงเวลา HH:MM (ถึง 23:59 · ไม่ข้ามเที่ยงคืน) ·
//   ช่วงวันที่ (ส่งเป็น ISO +07:00 · วันสิ้นสุดรวมวันนั้น ⇒ endsAt = เที่ยงคืนของวันถัดไป) · วิธีปรับ + ค่า · ลำดับความสำคัญ (ขั้นสูง พับไว้) ·
//   ตัวอย่างสด "ลาเต้ ฿75 → ฿59" (applyPriceRule) · บันทึก/เก็บถาวร = 3 action ของสัญญา · ตรวจฝั่ง client ด้วย parsePriceRuleInput
// 🔴 คำปฏิเสธแสดงผ่านคีย์ (ช่องที่ผิด = ข้อความของช่องนั้น · PRICE_RULE_LIMIT = แถบบนลิ้นชัก) — ไม่แสดง message ไทยของเซิร์ฟเวอร์
// 🔴 ไม่มี pos.price.rule = อ่านอย่างเดียว (สวิตช์/ช่องปิด · ไม่มีปุ่มบันทึก/เพิ่ม) · ไม่มีข้อความไทยนอกคอมเมนต์ · ปุ่ม ≥ 44px

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { archivePriceRuleAction, listPriceRulesAction, savePriceRuleAction } from "@/lib/modules/pos/price-rule-actions";
import { PRICE_RULE_ADJUSTS, PRICE_RULE_KINDS, PRICE_RULE_PRIORITY_MAX, parsePriceRuleInput, type PriceRuleAdjust, type PriceRuleInput, type PriceRuleItem, type PriceRuleKind } from "@/lib/modules/pos/price-shared";
import { moneyText } from "@/lib/modules/pos/register-shared";
import { channelDisplayName } from "@/components/pos/settings/channel-text";
import { PriceIcon, bpText, parseMoneyInput, parsePctToBp, priceErrorText, ruleAdjustText, rulePriceOn, ruleStateOf, ruleWindowText, satangToInput, type PT } from "@/components/pos/products/price-ui";
import type { ProductsData, ProductsRow } from "../products-data";

type Props = { systemId: string; unitId: string; data: ProductsData; canEdit: boolean; initialRuleId: string | null };
type Form = {
  id: string | null;
  name: string;
  kind: PriceRuleKind;
  active: boolean;
  priority: string;
  productIds: string[];
  categoryIds: string[];
  channelCodes: string[];
  unitIds: string[];
  adjust: PriceRuleAdjust;
  value: string;
  weekdays: number[];
  timeFrom: string;
  timeTo: string;
  dateFrom: string;
  dateTo: string;
};
const DAY_MS = 86_400_000;
const BKK = 7 * 3_600_000;
/** ISO → วันที่ไทย YYYY-MM-DD (endsAt = เที่ยงคืนถัดไป ⇒ ลบ 1 มิลลิวินาทีเป็นวันสุดท้ายที่รวม) */
const bkkDate = (iso: string, inclusiveEnd = false) => new Date(Date.parse(iso) + BKK - (inclusiveEnd ? 1 : 0)).toISOString().slice(0, 10);
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

const emptyForm = (): Form => ({ id: null, name: "", kind: "HAPPY_HOUR", active: true, priority: "0", productIds: [], categoryIds: [], channelCodes: [], unitIds: [], adjust: "PRICE", value: "", weekdays: [], timeFrom: "", timeTo: "", dateFrom: "", dateTo: "" });
const formOf = (r: PriceRuleItem): Form => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  active: r.active,
  priority: String(r.priority),
  productIds: [...r.productIds],
  categoryIds: [...r.categoryIds],
  channelCodes: [...r.channelCodes],
  unitIds: [...r.unitIds],
  adjust: r.adjust,
  value: r.adjust === "PERCENT_OFF" ? (r.valueBp === null ? "" : bpText(r.valueBp)) : satangToInput(r.valueSatang),
  weekdays: [...r.weekdays],
  timeFrom: r.timeFrom ?? "",
  timeTo: r.timeTo ?? "",
  dateFrom: r.startsAt ? bkkDate(r.startsAt) : "",
  dateTo: r.endsAt ? bkkDate(r.endsAt, true) : "",
});
const inputOfItem = (r: PriceRuleItem, patch: Partial<PriceRuleInput>): PriceRuleInput => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  active: r.active,
  priority: r.priority,
  productIds: r.productIds,
  categoryIds: r.categoryIds,
  channelCodes: r.channelCodes,
  unitIds: r.unitIds,
  adjust: r.adjust,
  valueSatang: r.valueSatang,
  valueBp: r.valueBp,
  startsAt: r.startsAt,
  endsAt: r.endsAt,
  weekdays: r.weekdays,
  timeFrom: r.timeFrom,
  timeTo: r.timeTo,
  ...patch,
});

/** ฟอร์ม → อินพุตของสัญญา (ค่าผิดรูป = null ให้ parsePriceRuleInput ปฏิเสธพร้อมช่อง) */
function inputOf(f: Form): { input: PriceRuleInput; valueBad: boolean } {
  let valueSatang: number | null = null;
  let valueBp: number | null = null;
  let valueBad = false;
  if (f.adjust === "PERCENT_OFF") {
    valueBp = parsePctToBp(f.value, 0.01, 100);
    valueBad = valueBp === null;
  } else {
    const v = parseMoneyInput(f.value);
    valueBad = typeof v !== "number";
    valueSatang = typeof v === "number" ? v : null;
  }
  const pr = /^\d{1,3}$/.test(f.priority.trim()) ? Number(f.priority.trim()) : -1;
  const input: PriceRuleInput = {
    name: f.name,
    kind: f.kind,
    active: f.active,
    priority: pr,
    productIds: f.productIds,
    categoryIds: f.categoryIds,
    channelCodes: f.channelCodes,
    unitIds: f.unitIds,
    adjust: f.adjust,
    valueSatang: f.adjust === "PERCENT_OFF" ? null : valueSatang,
    valueBp: f.adjust === "PERCENT_OFF" ? valueBp : null,
    startsAt: f.dateFrom ? `${f.dateFrom}T00:00:00+07:00` : null,
    endsAt: f.dateTo ? `${nextDay(f.dateTo)}T00:00:00+07:00` : null,
    weekdays: f.weekdays,
    timeFrom: f.timeFrom || null,
    timeTo: f.timeTo || null,
  };
  if (f.id) input.id = f.id;
  return { input, valueBad };
}

/** ช่องของสัญญา → คีย์ข้อความของช่อง (pos.price.rule.errors.*) */
const FIELD_KEYS = new Set(["name", "kind", "active", "priority", "productIds", "categoryIds", "channelCodes", "unitIds", "adjust", "valueSatang", "valueBp", "startsAt", "endsAt", "weekdays", "timeFrom", "timeTo"]);
const fieldSlot = (field: string | undefined): string | null => {
  if (!field || !FIELD_KEYS.has(field)) return null;
  if (field === "valueSatang" || field === "valueBp") return "value";
  if (field === "categoryIds") return "productIds";
  return field;
};

export function PriceRulesClient({ systemId, unitId, data, canEdit, initialRuleId }: Props) {
  const tr = useTranslations("pos.price.rule") as PT;
  const tp = useTranslations("pos.price") as PT;
  const treg = useTranslations("pos.register") as PT;
  const tch = useTranslations("pos.channel") as PT;
  const locale = useLocale();
  const [items, setItems] = useState<PriceRuleItem[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ kind: "limit" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<{ id: string; text: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pq, setPq] = useState("");
  const now = useMemo(() => new Date(), []);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const r = await listPriceRulesAction({ systemId, unitId, includeArchived: true });
      if (r.ok) setItems(r.items);
      else setLoadErr(priceErrorText(r.code, tp, treg));
    } catch {
      setLoadErr(tp("errors.unknown"));
    }
  }, [systemId, unitId, tp, treg]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!items || !initialRuleId) return;
    const r = items.find((x) => x.id === initialRuleId);
    if (r) setForm(formOf(r));
    // เปิดครั้งเดียวตอนโหลดแรก
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items === null]);
  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(h);
  }, [toast]);

  const live = (items ?? []).filter((r) => !r.archived);
  const archived = (items ?? []).filter((r) => r.archived);
  const productById = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products]);
  const nameOf = (p: ProductsRow) => (locale.startsWith("en") && p.nameEn ? p.nameEn : p.name);
  const catName = (id: string) => {
    const c = data.categories.find((x) => x.id === id);
    return c ? (locale.startsWith("en") && c.nameEn ? c.nameEn : c.name) : tr("archivedCategory");
  };
  const chName = (code: string) => {
    const c = data.channels.find((x) => x.code === code);
    return c ? channelDisplayName(c.code, c.name, tch) : code;
  };
  const channelsText = (codes: string[]) => (codes.length ? codes.map(chName).join(", ") : tr("allChannels"));
  const scopeText = (r: PriceRuleItem) =>
    r.productIds.length
      ? tr("scope", { products: r.productIds.length, channels: channelsText(r.channelCodes) })
      : tr("scopeCategory", { categories: r.categoryIds.map(catName).join(", "), channels: channelsText(r.channelCodes) });
  const stateOf = (r: PriceRuleItem) => ruleStateOf(r, now);

  const toggleActive = async (r: PriceRuleItem) => {
    if (!canEdit || r.archived || rowBusy) return;
    setRowBusy(r.id);
    setRowErr(null);
    try {
      const res = await savePriceRuleAction({ systemId, unitId, input: inputOfItem(r, { active: !r.active }) });
      if (res.ok) setItems((s) => (s ?? []).map((x) => (x.id === r.id ? res.rule : x)));
      else setRowErr({ id: r.id, text: priceErrorText(res.code, tp, treg) });
    } catch {
      setRowErr({ id: r.id, text: tp("errors.unknown") });
    } finally {
      setRowBusy(null);
    }
  };

  const openNew = () => {
    setForm(emptyForm());
    setFieldErr({});
    setBanner(null);
    setPq("");
  };
  const openRule = (r: PriceRuleItem) => {
    setForm(formOf(r));
    setFieldErr({});
    setBanner(null);
    setPq("");
  };
  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const toggleIn = (k: "productIds" | "categoryIds" | "channelCodes" | "unitIds", v: string) =>
    setForm((f) => (f ? { ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] } : f));
  const toggleDay = (d: number) => setForm((f) => (f ? { ...f, weekdays: f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d].sort((a, b) => a - b) } : f));

  const current = form?.id ? (items ?? []).find((r) => r.id === form.id) : undefined;
  const readOnly = !canEdit || !!current?.archived;

  const fieldError = (slot: string) =>
    fieldErr[slot] ? (
      <p data-testid={`pos-price-rule-err-${slot}`} className="text-[11.5px] text-[color:var(--color-danger)]">
        {fieldErr[slot]}
      </p>
    ) : null;

  const save = async () => {
    if (!form || busy || readOnly) return;
    const { input, valueBad } = inputOf(form);
    setBanner(null);
    if (valueBad) {
      setFieldErr({ value: tr(form.adjust === "PERCENT_OFF" ? "errors.valuePct" : "errors.value") });
      return;
    }
    const parsed = parsePriceRuleInput(input);
    if (!parsed.ok) {
      const slot = fieldSlot(parsed.field) ?? "form";
      setFieldErr({ [slot]: tr(`errors.${slot === "form" ? "invalid" : slot}`) });
      return;
    }
    setFieldErr({});
    setBusy(true);
    try {
      const r = await savePriceRuleAction({ systemId, unitId, input });
      if (r.ok) {
        setItems((s) => {
          const list = s ?? [];
          return list.some((x) => x.id === r.rule.id) ? list.map((x) => (x.id === r.rule.id ? r.rule : x)) : [...list, r.rule];
        });
        setForm(null);
        setToast(tr("saved"));
      } else if (r.code === "PRICE_RULE_LIMIT") setBanner({ kind: "limit", text: priceErrorText(r.code, tp, treg) });
      else if (r.code === "VALIDATION" && fieldSlot(r.field)) setFieldErr({ [fieldSlot(r.field)!]: tr(`errors.${fieldSlot(r.field)}`) });
      else setBanner({ kind: "error", text: priceErrorText(r.code, tp, treg) });
    } catch {
      setBanner({ kind: "error", text: tp("errors.unknown") });
    } finally {
      setBusy(false);
    }
  };
  const archive = async () => {
    if (!form?.id || busy || readOnly) return;
    setBusy(true);
    setBanner(null);
    try {
      const r = await archivePriceRuleAction({ systemId, unitId, id: form.id });
      if (r.ok) {
        setItems((s) => (s ?? []).map((x) => (x.id === r.rule.id ? r.rule : x)));
        setForm(null);
        setToast(tr("archived"));
      } else setBanner({ kind: "error", text: priceErrorText(r.code, tp, treg) });
    } catch {
      setBanner({ kind: "error", text: tp("errors.unknown") });
    } finally {
      setBusy(false);
    }
  };

  // ตัวอย่างสด: สินค้าแรกที่เลือก (หรือสินค้าแรกของหมวดแรก) ที่มีราคาปกติ
  const example = useMemo(() => {
    if (!form) return null;
    const pick =
      form.productIds.map((id) => productById.get(id)).find((p) => p && p.basePriceSatang !== null) ??
      data.products.find((p) => p.categoryId !== null && form.categoryIds.includes(p.categoryId) && p.basePriceSatang !== null);
    if (!pick || pick.basePriceSatang === null) return null;
    const { input, valueBad } = inputOf(form);
    if (valueBad) return null;
    const after = rulePriceOn({ adjust: input.adjust, valueSatang: input.valueSatang ?? null, valueBp: input.valueBp ?? null }, pick.basePriceSatang);
    return after === null ? null : tr("example", { name: nameOf(pick), from: moneyText(pick.basePriceSatang), to: moneyText(after) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, productById, data.products]);

  const pickList = useMemo(() => {
    const n = pq.trim().toLowerCase();
    return data.products.filter((p) => !n || p.name.toLowerCase().includes(n) || (p.nameEn ?? "").toLowerCase().includes(n) || (p.sku ?? "").toLowerCase().includes(n)).slice(0, 60);
  }, [data.products, pq]);

  const pill = (r: PriceRuleItem) => {
    const s = stateOf(r);
    const cls = s === "ACTIVE" ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] font-bold text-[color:var(--color-accent)]" : s === "UPCOMING" ? "border-[color:var(--color-ink)] text-[color:var(--color-ink)]" : "text-[color:var(--color-muted)]";
    return (
      <span data-testid={`pos-price-rule-state-${r.id}`} className={`inline-flex h-7 items-center whitespace-nowrap rounded-lg border px-2.5 text-[11.5px] ${cls}`}>
        {tr(`state.${s}`)}
      </span>
    );
  };

  const row = (r: PriceRuleItem) => (
    <div key={r.id} data-testid={`pos-price-rule-row-${r.id}`} className={`flex flex-col gap-2 border-b px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-4 ${r.archived ? "opacity-60" : ""}`}>
      <button type="button" data-testid={`pos-price-rule-open-${r.id}`} className="flex min-h-11 min-w-0 flex-1 flex-col items-start text-left" onClick={() => openRule(r)}>
        <span className="flex flex-wrap items-center gap-2">
          <b className="text-[14px]">{r.name}</b>
          <span className="inline-flex h-5 items-center rounded-full border px-2 text-[10.5px] text-[color:var(--color-ink-soft)]">{tr(`adjust.${r.adjust}`)}</span>
          <span className="text-[11px] text-[color:var(--color-muted)]">{tr(`kind.${r.kind}`)}</span>
        </span>
        <span className="text-[12px] text-[color:var(--color-muted)]">{ruleWindowText(r, tr, locale)}</span>
        <span className="text-[12px] text-[color:var(--color-muted)]">{scopeText(r)}</span>
      </button>
      <span className="text-[16px] font-bold tabular-nums">{ruleAdjustText(r)}</span>
      <div className="flex items-center gap-3">
        {r.archived ? (
          <span className="text-[11.5px] text-[color:var(--color-muted)]">{tr("archived")}</span>
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={r.active}
            aria-label={tr("active")}
            data-testid={`pos-price-rule-active-${r.id}`}
            disabled={!canEdit || rowBusy === r.id}
            className="grid h-11 w-12 place-items-center disabled:opacity-50"
            onClick={() => void toggleActive(r)}
          >
            <span aria-hidden className={`relative inline-block h-[19px] w-[34px] rounded-full ${r.active ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-line)]"}`}>
              <span className={`absolute top-[2.5px] size-[14px] rounded-full bg-[color:var(--color-surface)] shadow ${r.active ? "right-[2.5px]" : "left-[2.5px]"}`} />
            </span>
          </button>
        )}
        {pill(r)}
      </div>
      {rowErr?.id === r.id ? <p className="text-[11.5px] text-[color:var(--color-danger)]">{rowErr.text}</p> : null}
    </div>
  );

  const chip = (on: boolean) => `inline-flex min-h-11 items-center rounded-lg border px-3 text-[12.5px] disabled:opacity-60 ${on ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]" : "text-[color:var(--color-ink-soft)]"}`;

  return (
    <div className="flex min-w-0 items-start gap-5">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[22px] font-bold tracking-[-0.01em]">{tr("title")}</h2>
            <p className="text-[12.5px] text-[color:var(--color-muted)]">{tr("intro")}</p>
          </div>
          {canEdit ? (
            <button type="button" data-testid="pos-price-rule-add" className="btn btn-primary h-11 gap-1.5 rounded-[11px] px-4" onClick={openNew}>
              <PriceIcon name="plus" size={15} />
              {tr("add")}
            </button>
          ) : (
            <span data-testid="pos-price-rules-readonly" className="rounded-lg border border-dashed px-3 py-2 text-[12px] text-[color:var(--color-muted)]">
              {tr("readOnly")}
            </span>
          )}
        </div>
        <div data-testid="pos-price-rules" className="card !p-0">
          {loadErr ? (
            <p className="px-4 py-6 text-[13px] text-[color:var(--color-danger)]">{loadErr}</p>
          ) : !items ? (
            <p className="px-4 py-6 text-[13px] text-[color:var(--color-muted)]">{tr("loading")}</p>
          ) : !live.length && !showArchived ? (
            <p className="px-4 py-6 text-center text-[13px] text-[color:var(--color-muted)]">{tr("empty")}</p>
          ) : (
            <>
              {live.map(row)}
              {showArchived ? archived.map(row) : null}
            </>
          )}
        </div>
        {archived.length ? (
          <button type="button" data-testid="pos-price-rules-show-archived" className="inline-flex min-h-11 items-center self-start text-[12.5px] text-[color:var(--color-accent)]" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? tr("hideArchived") : tr("showArchived", { count: archived.length })}
          </button>
        ) : null}
      </div>

      {form ? (
        <aside
          data-testid="pos-price-rule-drawer"
          aria-label={form.id ? tr("edit") : tr("add")}
          className="fixed inset-y-0 right-0 z-40 flex w-full flex-col bg-[color:var(--color-surface)] shadow-[-8px_0_24px_rgba(10,10,10,.08)] sm:max-w-[480px] sm:border-l xl:sticky xl:top-4 xl:z-auto xl:max-h-[calc(100vh-2rem)] xl:w-[480px] xl:shrink-0 xl:rounded-2xl xl:border xl:shadow-none"
        >
          <div className="flex items-center gap-3 border-b px-5 pb-3 pt-4">
            <PriceIcon name="clock" />
            <h2 className="min-w-0 flex-1 truncate text-[16px] font-bold">{form.id ? tr("edit") : tr("add")}</h2>
            <button type="button" data-testid="pos-price-rule-close" aria-label={tp("cancel")} className="-mr-2 grid h-11 w-11 place-items-center rounded-lg hover:bg-[color:var(--color-surface-2)]" onClick={() => setForm(null)}>
              <PriceIcon name="x" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 text-[13px]">
            {banner ? (
              <p data-testid={banner.kind === "limit" ? "pos-price-rule-limit" : "pos-price-rule-error"} role="alert" className="rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-[12px] text-[color:var(--color-danger)]">
                {banner.text}
              </p>
            ) : null}
            {fieldError("form")}
            {readOnly ? <p className="rounded-lg border border-dashed px-3 py-2 text-[12px] text-[color:var(--color-muted)]">{current?.archived ? tr("archivedReadOnly") : tr("readOnly")}</p> : null}
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-[color:var(--color-muted)]">{tr("name")}</span>
              <input data-testid="pos-price-rule-name" className={`input h-11 ${fieldErr.name ? "border-[color:var(--color-danger)]" : ""}`} value={form.name} maxLength={60} disabled={readOnly || busy} onChange={(e) => set({ name: e.target.value })} />
              {fieldError("name")}
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-[color:var(--color-muted)]">{tr("kindLabel")}</span>
              <div role="radiogroup" aria-label={tr("kindLabel")} className="flex flex-wrap gap-1">
                {PRICE_RULE_KINDS.map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={form.kind === k} data-testid={`pos-price-rule-kind-${k}`} disabled={readOnly || busy} className={chip(form.kind === k)} onClick={() => set({ kind: k })}>
                    {tr(`kind.${k}`)}
                  </button>
                ))}
              </div>
            </div>
            {/* สินค้า / หมวด */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] font-bold text-[color:var(--color-muted)]">{tr("products")}</span>
              {form.productIds.length ? (
                <div className="flex flex-wrap gap-1">
                  {form.productIds.map((id) => {
                    const p = productById.get(id);
                    return (
                      <button key={id} type="button" data-testid={`pos-price-rule-picked-${id}`} disabled={readOnly || busy} className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-2 text-[12px]" onClick={() => toggleIn("productIds", id)}>
                        {p ? nameOf(p) : tr("archivedRef")}
                        {!readOnly ? <PriceIcon name="x" size={12} /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {!readOnly ? (
                <>
                  <input data-testid="pos-price-rule-product-search" className="input h-11" placeholder={tr("productSearch")} value={pq} disabled={busy} onChange={(e) => setPq(e.target.value)} />
                  <div className="max-h-[180px] overflow-y-auto rounded-lg border">
                    {pickList.map((p) => (
                      <label key={p.id} className="flex min-h-11 items-center gap-2 border-b px-3 text-[12.5px] last:border-b-0">
                        <input type="checkbox" data-testid={`pos-price-rule-product-${p.id}`} className="size-5" checked={form.productIds.includes(p.id)} disabled={busy} onChange={() => toggleIn("productIds", p.id)} />
                        <span className="min-w-0 flex-1 truncate">{nameOf(p)}</span>
                        <span className="tabular-nums text-[color:var(--color-muted)]">{p.basePriceSatang === null ? "—" : moneyText(p.basePriceSatang)}</span>
                      </label>
                    ))}
                  </div>
                </>
              ) : null}
              <span className="mt-1 text-[12px] font-bold text-[color:var(--color-muted)]">{tr("categories")}</span>
              <div className="flex flex-wrap gap-1">
                {data.categories.map((c) => (
                  <button key={c.id} type="button" data-testid={`pos-price-rule-category-${c.id}`} aria-pressed={form.categoryIds.includes(c.id)} disabled={readOnly || busy} className={chip(form.categoryIds.includes(c.id))} onClick={() => toggleIn("categoryIds", c.id)}>
                    {locale.startsWith("en") && c.nameEn ? c.nameEn : c.name}
                  </button>
                ))}
                {form.categoryIds.filter((id) => !data.categories.some((c) => c.id === id)).map((id) => (
                  <span key={id} className="inline-flex min-h-9 items-center rounded-lg border border-dashed px-2 text-[12px] text-[color:var(--color-muted)]">
                    {tr("archivedCategory")}
                  </span>
                ))}
              </div>
              {fieldError("productIds")}
            </div>
            {/* ช่องทาง */}
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-[color:var(--color-muted)]">{tr("channels")}</span>
              <div className="flex flex-wrap gap-1">
                {data.channels.map((c) => (
                  <button key={c.code} type="button" data-testid={`pos-price-rule-channel-${c.code}`} aria-pressed={form.channelCodes.includes(c.code)} disabled={readOnly || busy} className={chip(form.channelCodes.includes(c.code))} onClick={() => toggleIn("channelCodes", c.code)}>
                    {channelDisplayName(c.code, c.name, tch)}
                  </button>
                ))}
              </div>
              <span className="text-[11.5px] text-[color:var(--color-muted)]">{form.channelCodes.length ? channelsText(form.channelCodes) : tr("allChannels")}</span>
              {fieldError("channelCodes")}
            </div>
            {/* สาขา */}
            {data.units.length > 1 ? (
              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-bold text-[color:var(--color-muted)]">{tr("units")}</span>
                <div className="flex flex-wrap gap-1">
                  {data.units.map((u) => (
                    <button key={u.id} type="button" data-testid={`pos-price-rule-unit-${u.id}`} aria-pressed={form.unitIds.includes(u.id)} disabled={readOnly || busy} className={chip(form.unitIds.includes(u.id))} onClick={() => toggleIn("unitIds", u.id)}>
                      {u.name}
                    </button>
                  ))}
                </div>
                <span className="text-[11.5px] text-[color:var(--color-muted)]">{form.unitIds.length ? form.unitIds.map((id) => data.units.find((u) => u.id === id)?.name ?? "").join(", ") : tp("allBranches")}</span>
                {fieldError("unitIds")}
              </div>
            ) : null}
            {/* วัน */}
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-[color:var(--color-muted)]">{tr("weekdays")}</span>
              <div className="flex flex-wrap gap-1">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <button key={d} type="button" data-testid={`pos-price-rule-day-${d}`} aria-pressed={form.weekdays.includes(d)} disabled={readOnly || busy} className={`${chip(form.weekdays.includes(d))} min-w-11 justify-center !px-2`} onClick={() => toggleDay(d)}>
                    {tr(`weekdayShort.d${d}`)}
                  </button>
                ))}
              </div>
              <span className="text-[11.5px] text-[color:var(--color-muted)]">{form.weekdays.length ? "" : tr("everyDay")}</span>
              {fieldError("weekdays")}
            </div>
            {/* ช่วงเวลา */}
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-[color:var(--color-muted)]">{tr("timeRange")}</span>
              <div className="flex items-center gap-2">
                <input type="time" data-testid="pos-price-rule-time-from" aria-label={tr("timeFrom")} className={`input h-11 w-32 ${fieldErr.timeFrom ? "border-[color:var(--color-danger)]" : ""}`} value={form.timeFrom} disabled={readOnly || busy} onChange={(e) => set({ timeFrom: e.target.value.slice(0, 5) })} />
                <span>–</span>
                <input type="time" data-testid="pos-price-rule-time-to" aria-label={tr("timeTo")} className={`input h-11 w-32 ${fieldErr.timeTo ? "border-[color:var(--color-danger)]" : ""}`} value={form.timeTo} disabled={readOnly || busy} onChange={(e) => set({ timeTo: e.target.value.slice(0, 5) })} />
              </div>
              <span className="text-[11.5px] text-[color:var(--color-muted)]">
                {tr("timeHint")} · {tr("overnightHint")}
              </span>
              {fieldError("timeFrom")}
              {fieldError("timeTo")}
            </div>
            {/* ช่วงวันที่ */}
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-[color:var(--color-muted)]">{tr("dateRange")}</span>
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" data-testid="pos-price-rule-date-from" aria-label={tr("dateFrom")} className={`input h-11 w-40 ${fieldErr.startsAt ? "border-[color:var(--color-danger)]" : ""}`} value={form.dateFrom} disabled={readOnly || busy} onChange={(e) => set({ dateFrom: e.target.value })} />
                <span>–</span>
                <input type="date" data-testid="pos-price-rule-date-to" aria-label={tr("dateTo")} className={`input h-11 w-40 ${fieldErr.endsAt ? "border-[color:var(--color-danger)]" : ""}`} value={form.dateTo} disabled={readOnly || busy} onChange={(e) => set({ dateTo: e.target.value })} />
              </div>
              <span className="text-[11.5px] text-[color:var(--color-muted)]">{tr("dateHint")}</span>
              {fieldError("startsAt")}
              {fieldError("endsAt")}
            </div>
            {/* ปรับราคา */}
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-[color:var(--color-muted)]">{tr("adjustLabel")}</span>
              <div role="radiogroup" aria-label={tr("adjustLabel")} className="flex flex-wrap gap-1">
                {PRICE_RULE_ADJUSTS.map((a) => (
                  <button key={a} type="button" role="radio" aria-checked={form.adjust === a} data-testid={`pos-price-rule-adjust-${a}`} disabled={readOnly || busy} className={chip(form.adjust === a)} onClick={() => set({ adjust: a, value: "" })}>
                    {tr(`adjust.${a}`)}
                  </button>
                ))}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <input data-testid="pos-price-rule-value" inputMode="decimal" aria-label={tr("value")} className={`input h-11 w-32 text-right tabular-nums ${fieldErr.value ? "border-[color:var(--color-danger)]" : ""}`} value={form.value} disabled={readOnly || busy} onChange={(e) => set({ value: e.target.value })} />
                <span className="text-[12px] text-[color:var(--color-muted)]">{form.adjust === "PERCENT_OFF" ? "%" : tr("baht")}</span>
              </div>
              {fieldError("value")}
            </div>
            {/* ขั้นสูง */}
            <details className="rounded-lg border px-3">
              <summary data-testid="pos-price-rule-advanced" className="flex min-h-11 cursor-pointer items-center text-[12.5px] font-semibold">
                {tr("priority")}
              </summary>
              <div className="flex flex-col gap-1 pb-3">
                <input data-testid="pos-price-rule-priority" inputMode="numeric" aria-label={tr("priority")} className={`input h-11 w-24 text-right tabular-nums ${fieldErr.priority ? "border-[color:var(--color-danger)]" : ""}`} value={form.priority} disabled={readOnly || busy} onChange={(e) => set({ priority: e.target.value })} />
                <span className="text-[11.5px] text-[color:var(--color-muted)]">{tr("priorityHint", { max: PRICE_RULE_PRIORITY_MAX })}</span>
                {fieldError("priority")}
              </div>
            </details>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" data-testid="pos-price-rule-active" className="size-5" checked={form.active} disabled={readOnly || busy} onChange={(e) => set({ active: e.target.checked })} />
              <span>{tr("active")}</span>
            </label>
            {/* ตัวอย่างสด */}
            <div data-testid="pos-price-rule-example" className="flex items-center gap-2 rounded-lg border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] px-3 py-2 text-[12.5px]">
              <PriceIcon name="tag" size={15} className="text-[color:var(--color-accent)]" />
              <span className="min-w-0 flex-1">{example ?? tr("exampleNone")}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
            {!readOnly ? (
              <button type="button" data-testid="pos-price-rule-save" disabled={busy} className="btn btn-primary h-11 rounded-[11px] px-5 disabled:opacity-50" onClick={() => void save()}>
                {tp("save")}
              </button>
            ) : null}
            <button type="button" data-testid="pos-price-rule-cancel" disabled={busy} className="btn btn-ghost h-11 rounded-[11px] px-4" onClick={() => setForm(null)}>
              {tp("cancel")}
            </button>
            <span className="flex-1" />
            {!readOnly && form.id ? (
              <button type="button" data-testid="pos-price-rule-archive" disabled={busy} className="btn btn-ghost h-11 gap-1.5 rounded-[11px] px-4 text-[color:var(--color-danger)]" onClick={() => void archive()}>
                <PriceIcon name="archive" size={15} />
                {tr("archive")}
              </button>
            ) : null}
          </div>
        </aside>
      ) : null}

      {toast ? (
        <div data-testid="pos-price-rule-toast" role="status" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[color:var(--color-ink)] px-4 py-2.5 text-[13px] text-[color:var(--color-surface)] shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
