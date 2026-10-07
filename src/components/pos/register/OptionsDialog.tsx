"use client";

// OptionsDialog.tsx — ตัวเลือก/ตัวแปรของสินค้า (POS P1.2 U · R16 · ป๊อปโอเวอร์ภาพ 01) — แตะการ์ดที่มีกลุ่มตัวเลือกหรือตัวแปรแล้วเปิดกล่องนี้
//   ภาพ 01: หัว (ชื่อ · ราคาฐาน · ✕) → กลุ่ม "ขนาด · เลือก 1" + ชิปตัวเลือก (+ส่วนต่าง) → หมายเหตุ → จำนวน −/+ → "เพิ่มลงตะกร้า ฿X"
//   R2 (มติผู้คุมงาน): md+ = ป๊อปโอเวอร์ยึดการ์ดที่แตะ กว้าง 360 มุม 18 padding 16 เงา 0 18 44 (.pop) · ขวาของการ์ด ล้นจอ = พลิกซ้าย/ยึดใน viewport ·
//   มือถือ 390 หรือเปิดจากการสแกน (ไม่มีการ์ด) = แผ่นล่าง/กล่องกลางจอแบบกล่องอื่น · ชิปสูง 44 (ภาพ 32 — ขั้นต่ำปุ่มแตะ + ข้อสอบ S2) มุม 8
// กติกา (R2 · R6 · R7): ข้อมูลกลุ่ม/ตัวเลือก/ตัวแปรโหลดสดจาก registerProductOptionsAction · isDefault = เลือกไว้ให้ก่อน (เซิร์ฟเวอร์ไม่ใส่ให้เอง)
//   ตัวเลือกที่หมด (86 · unavailable) แตะไม่ได้ · maxSelect 1 = แตะตัวใหม่แทนตัวเดิม · maxSelect > 1 = สลับได้จนครบเพดาน
//   ครบ minSelect ทุกกลุ่ม + เลือกตัวแปรแล้ว (ถ้ามี) ⇒ ปุ่มยืนยันเปิด · ราคาบนปุ่ม = ประมาณจากราคาฐาน + ส่วนต่าง (ยอดจริงมาจาก quote)
//   สินค้าชั่งน้ำหนัก ⇒ ไม่มีจำนวน (ขายทีละ 1 บรรทัด) · ยืนยันแล้ว RegisterScreen เปิดกล่องน้ำหนักต่อ (หรือใช้ป้ายที่สแกนมา)
// 🔴 ส่งกลับแค่ productId (ตัวแปรที่เลือก หรือสินค้าเอง) + choiceId — ราคา/ชื่อคิดที่เซิร์ฟเวอร์ (R1) · Enter = ยืนยัน · Esc ปิด (ตัวจับแป้นเดียวของ RegisterScreen)
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ (S5.3) · testid เขียนตรงบนแท็กและตามด้วย className ทันที (ตัวตรวจ ≥44px อ่านถึง ">" ตัวแรก)

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  displayName,
  moneyText,
  refusalMessageKey,
  REGISTER_MAX_QTY,
  REGISTER_NOTE_MAX,
  type RegisterOptionGroup,
  type RegisterProduct,
  type RegisterVariant,
} from "@/lib/modules/pos/register-shared";
import { registerProductOptionsAction } from "@/lib/modules/pos/register-actions";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "./RegisterDialog";
import type { PickAnchor } from "./ProductCard";
import { RegisterIcon } from "./RegisterIcon";

/** ผลของกล่อง: product = ตัวที่ขายจริง (ตัวแปรที่เลือก ประกอบจากแม่ + ราคา/ชื่อของตัวแปร · หรือสินค้าเอง) · options = choiceId · names = ชื่อตัวเลือกตามภาษาจอ */
export type OptionsPick = { product: RegisterProduct; options: string[]; qty: number; note?: string; soldByWeight: boolean; names: Record<string, string> };

type Props = {
  product: RegisterProduct;
  systemId: string;
  unitId: string;
  locale: string;
  /** มาจากการสแกนป้ายเครื่องชั่ง (น้ำหนักรู้แล้ว) ⇒ ไม่มีจำนวน · ปุ่มยืนยันเพิ่มลงตะกร้าเลย */
  weighedLabel?: boolean;
  /** R2: กรอบการ์ดที่แตะ — มี + จอ md+ ⇒ ป๊อปโอเวอร์ยึดการ์ด (ภาพ 01) · ไม่มี (สแกน) หรือมือถือ ⇒ กล่องกลางจอ/แผ่นล่าง */
  anchor?: PickAnchor;
  /** R2 ข้อ 4: สาขาอนุญาตขายติดลบ (ALLOW_NEGATIVE) ⇒ ตัวแปรที่หมดยังเลือกได้ · BLOCK ⇒ เทา กดไม่ได้ */
  allowNegative: boolean;
  onAdd: (pick: OptionsPick) => void;
  onClose: () => void;
};

type Loaded = { groups: RegisterOptionGroup[]; variants: RegisterVariant[] };

/** ภาพ 01 .pop: กว้าง 360 */
const POPOVER_W = 360;

/** media query หลัง mount (null = ยังไม่รู้) */
function useWide(): boolean | null {
  // กล่องนี้เปิดหลังผู้ใช้แตะเท่านั้น (ไม่มี SSR) ⇒ อ่านค่าแรกทันที ไม่ให้กระพริบจากกล่องกลางจอเป็นป๊อปโอเวอร์
  const [v, setV] = useState<boolean | null>(() => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(min-width: 768px)").matches : null));
  useEffect(() => {
    const m = window.matchMedia("(min-width: 768px)");
    const on = () => setV(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return v;
}

export function OptionsDialog({ product, systemId, unitId, locale, weighedLabel = false, anchor, allowNegative, onAdd, onClose }: Props) {
  const wide = useWide();
  const t = useTranslations("pos.register");
  const tc = useTranslations("common");
  const [data, setData] = useState<Loaded | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [variantId, setVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [hint, setHint] = useState<{ key: string; values?: Record<string, string | number> } | null>(null);
  const weighed = product.soldByWeight || weighedLabel;

  useEffect(() => {
    let alive = true;
    registerProductOptionsAction({ systemId, unitId, productId: product.id })
      .then((r) => {
        if (!alive) return;
        if (!r.ok) return setLoadErr(refusalMessageKey(r.code));
        setData({ groups: r.groups, variants: r.variants });
        // isDefault = เลือกไว้ให้ก่อน (เฉพาะที่ยังมีของ · ไม่เกินเพดานของกลุ่ม)
        const init: Record<string, string[]> = {};
        for (const g of r.groups) init[g.groupId] = g.choices.filter((c) => c.isDefault && !c.unavailable).map((c) => c.choiceId).slice(0, Math.max(g.maxSelect, 1));
        setPicked(init);
        if (r.variants.length === 1) setVariantId(r.variants[0]!.id);
      })
      .catch(() => {
        if (alive) setLoadErr("errors.loadFailed");
      });
    return () => {
      alive = false;
    };
  }, [systemId, unitId, product.id]);

  const toggle = (g: RegisterOptionGroup, choiceId: string) => {
    setHint(null);
    setPicked((s) => {
      const cur = s[g.groupId] ?? [];
      if (cur.includes(choiceId)) return { ...s, [g.groupId]: cur.filter((x) => x !== choiceId) };
      if (g.maxSelect <= 1) return { ...s, [g.groupId]: [choiceId] };
      if (cur.length >= g.maxSelect) {
        setHint({ key: "options.pickUpTo", values: { count: g.maxSelect } });
        return s;
      }
      return { ...s, [g.groupId]: [...cur, choiceId] };
    });
  };

  const variant = data?.variants.find((v) => v.id === variantId) ?? null;
  const needVariant = !!data && data.variants.length > 0 && !variant;
  const missing = data ? data.groups.filter((g) => (picked[g.groupId]?.length ?? 0) < g.minSelect) : [];
  const choiceIds = useMemo(() => (data ? data.groups.flatMap((g) => picked[g.groupId] ?? []) : []), [data, picked]);
  const delta = data ? data.groups.reduce((s, g) => s + g.choices.filter((c) => (picked[g.groupId] ?? []).includes(c.choiceId)).reduce((a, c) => a + c.priceDeltaSatang, 0), 0) : 0;
  const base = variant ? (variant.priceSatang ?? product.priceSatang) : product.priceSatang;
  const noteOk = note.length <= REGISTER_NOTE_MAX;
  const ready = !!data && !needVariant && missing.length === 0 && base !== null && noteOk;
  const amount = base === null ? null : (base + delta) * (weighed ? 1 : qty);

  const confirm = () => {
    if (!data) return;
    if (needVariant) return setHint({ key: "errors.variantRequired" });
    if (missing.length) return setHint({ key: "errors.optionsRequired" });
    if (base === null) return setHint({ key: "errors.priceNotSet" });
    if (!ready) return;
    const names: Record<string, string> = {};
    for (const g of data.groups) for (const c of g.choices) if (choiceIds.includes(c.choiceId)) names[c.choiceId] = displayName(c, locale);
    // ตัวแปร = แถว PosProduct ลูก (R6) — ประกอบ RegisterProduct จากแม่ (ตัวเลือกของแม่ใช้กับทุกตัวแปร · P6) ให้ตะกร้าแสดงชื่อ/ราคาได้
    const sold: RegisterProduct = variant
      ? {
          ...product,
          id: variant.id,
          name: variant.name,
          nameEn: variant.nameEn,
          priceSatang: variant.priceSatang ?? product.priceSatang,
          barcode: variant.barcode,
          parentId: product.id,
          variantCount: 0,
          soldOut: variant.soldOut,
          soldOutReason: variant.soldOut ? "NO_STOCK" : null,
          stockLeft: null,
        }
      : product;
    onAdd({ product: sold, options: choiceIds, qty: weighed ? 1 : qty, ...(note.trim() ? { note } : {}), soldByWeight: weighed, names });
  };

  /** สถานะของชิป (ส่วนคงที่เขียนตรงบนแท็กเพื่อให้ตัวตรวจ ≥44px อ่านเจอ) — เลือก = ขอบหมึก + inset 1px + พื้น surface-2 + ตัวหนา (.opt.on) */
  const chipOn = (on: boolean) =>
    on ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)] font-bold text-[color:var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-ink)]" : "text-[color:var(--color-ink-soft)]";
  const name = displayName(product, locale);
  /** ป้ายรองของกลุ่ม: บังคับ = "เลือก N" · เลือกได้หลายอย่าง · ไม่บังคับ (ภาพ 01 ".og .lb span") */
  const groupRule = (min: number, max: number) => (max > 1 ? t("options.multi") : min > 0 ? t("options.required", { count: min }) : t("options.optional"));

  // ── ป๊อปโอเวอร์ยึดการ์ด (md+ · มีกรอบการ์ด): ขวาของการ์ด · ล้นขวา = พลิกไปซ้าย · ยึดใน viewport ขอบ 16 · สูงเกินจอ = เลื่อนในกล่อง ──
  const popover = !!anchor && wide === true;
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number } | null>(null);
  useLayoutEffect(() => {
    if (!popover || !anchor) return;
    const place = () => {
      const el = boxRef.current;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(POPOVER_W, vw - 32);
      const h = el ? el.offsetHeight : 0;
      let left = anchor.right - 2;
      if (left + w > vw - 16) left = anchor.left - w + 2;
      left = Math.max(16, Math.min(left, vw - 16 - w));
      let top = anchor.top - 30;
      top = Math.max(16, Math.min(top, vh - 16 - h));
      setPos({ left, top, maxH: vh - 32 });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [popover, anchor, data, loadErr, hint, variantId]);

  const header = (
    <div className="flex items-center gap-4">
      <b className="min-w-0 break-words text-[16px] font-bold [overflow-wrap:anywhere]">{name}</b>
      {product.priceSatang !== null && <span className="shrink-0 text-[13px] tabular-nums text-[color:var(--color-muted)]">{moneyText(product.priceSatang)}</span>}
      <span className="flex-1" />
      <button
        data-testid="pos-reg-options-close"
        className="-my-2 -mr-2 grid size-11 shrink-0 place-items-center rounded-[11px] text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)]"
        type="button"
        aria-label={t("cart.close")}
        onClick={onClose}
      >
        <RegisterIcon name="x" size={14} />
      </button>
    </div>
  );

  const body = loadErr ? (
    <p className="text-[14px] text-[color:var(--color-danger)]" role="alert">
      {t(loadErr)}
    </p>
  ) : !data ? (
    <p className="text-[14px] text-[color:var(--color-muted)]" role="status">
      {tc("loading")}
    </p>
  ) : (
    <form
      data-testid="pos-reg-options-form"
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        confirm();
      }}
    >
      {data.variants.length > 0 && (
        <div role="group" aria-label={t("variants.title")}>
          <div className="mb-1.5 flex gap-3 text-[11.5px] font-bold text-[color:var(--color-muted)]">
            {t("variants.title")}
            <span className="font-normal">{`· ${t("options.required", { count: 1 })}`}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {data.variants.map((v) => {
              // ตรรกะเดียวกับการ์ดสินค้า (มติผู้คุมงาน R2 ข้อ 4): หมด = เทา กดไม่ได้ · ร้านอนุญาตขายติดลบ = กดได้ (ป้าย "หมด" ยังแสดง)
              const off = v.soldOut && !allowNegative;
              const price = v.priceSatang ?? product.priceSatang;
              return (
                <button
                  key={v.id}
                  data-testid={`pos-reg-variant-${v.id}`}
                  className={`inline-flex h-11 items-center gap-[5px] whitespace-nowrap rounded-[8px] border px-[11px] text-[13px] disabled:cursor-not-allowed disabled:opacity-45 ${chipOn(variantId === v.id)}`}
                  type="button"
                  aria-pressed={variantId === v.id}
                  disabled={off}
                  onClick={() => {
                    setVariantId(v.id);
                    setHint(null);
                  }}
                >
                  {displayName(v, locale)}
                  <small className="text-[11.5px] font-normal text-[color:var(--color-muted)]">{price === null ? t("product.noPrice") : moneyText(price)}</small>
                  {v.soldOut && <small className="text-[11.5px] font-normal text-[color:var(--color-danger)]">{t("options.unavailable")}</small>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {data.groups.map((g) => (
        <div key={g.groupId} role="group" aria-label={displayName(g, locale)}>
          <div className="mb-1.5 flex gap-3 text-[11.5px] font-bold text-[color:var(--color-muted)]">
            {displayName(g, locale)}
            <span className="font-normal">{`· ${groupRule(g.minSelect, g.maxSelect)}`}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {g.choices.map((c) => {
              const on = (picked[g.groupId] ?? []).includes(c.choiceId);
              return (
                <button
                  key={c.choiceId}
                  data-testid={`pos-reg-option-${c.choiceId}`}
                  className={`inline-flex h-11 items-center gap-[5px] whitespace-nowrap rounded-[8px] border px-[11px] text-[13px] disabled:cursor-not-allowed disabled:opacity-45 ${chipOn(on)}`}
                  type="button"
                  aria-pressed={on}
                  disabled={c.unavailable}
                  onClick={() => toggle(g, c.choiceId)}
                >
                  {displayName(c, locale)}
                  {c.unavailable ? (
                    <small className="text-[11.5px] font-normal text-[color:var(--color-danger)]">{t("options.unavailable")}</small>
                  ) : c.priceDeltaSatang !== 0 ? (
                    <small className={`text-[11.5px] ${on ? "text-[color:var(--color-ink-soft)]" : "font-normal text-[color:var(--color-muted)]"}`}>
                      {`${c.priceDeltaSatang > 0 ? "+" : ""}${moneyText(c.priceDeltaSatang).replace(/^\u0E3F/, "")}`}
                    </small>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <label className="flex h-12 items-center gap-2.5 rounded-[12px] border px-[14px] text-[13.5px] text-[color:var(--color-muted)]">
        <RegisterIcon name="edit" size={14} />
        <input
          data-testid="pos-reg-options-note"
          className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-[color:var(--color-ink)] outline-none placeholder:text-[color:var(--color-muted)]"
          value={note}
          placeholder={t("options.note")}
          aria-label={t("options.note")}
          aria-invalid={!noteOk}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      {hint && (
        <p data-testid="pos-reg-options-hint" className="-mt-2 text-[13.5px] text-[color:var(--color-danger)]" role="alert">
          {t(hint.key, hint.values)}
        </p>
      )}
      {!noteOk && (
        <p className="-mt-2 text-[13.5px] text-[color:var(--color-danger)]" role="alert">
          {t("note.tooLong", { max: REGISTER_NOTE_MAX })}
        </p>
      )}

      <div className="flex items-center gap-2.5">
        {!weighed && (
          <div className="flex h-11 shrink-0 items-center overflow-hidden rounded-[9px] border">
            <button
              data-testid="pos-reg-options-qty-dec"
              className="grid h-11 w-11 place-items-center text-[17px] text-[color:var(--color-ink-soft)] disabled:opacity-40"
              type="button"
              aria-label={t("editor.qtyDec")}
              disabled={qty <= 1}
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              <RegisterIcon name="minus" size={14} />
            </button>
            <b data-testid="pos-reg-options-qty" className="grid h-full w-11 place-items-center border-x text-[15px] tabular-nums" aria-live="polite">
              {qty.toLocaleString("th-TH")}
            </b>
            <button
              data-testid="pos-reg-options-qty-inc"
              className="grid h-11 w-11 place-items-center text-[17px] text-[color:var(--color-ink-soft)] disabled:opacity-40"
              type="button"
              aria-label={t("editor.qtyInc")}
              disabled={qty >= REGISTER_MAX_QTY}
              onClick={() => setQty((q) => Math.min(REGISTER_MAX_QTY, q + 1))}
            >
              <RegisterIcon name="plus" size={14} />
            </button>
          </div>
        )}
        <button
          data-testid="pos-reg-options-confirm"
          className="btn btn-primary h-11 flex-1 rounded-[11px] text-[14.5px] font-bold aria-disabled:opacity-60"
          type="submit"
          aria-disabled={!ready}
        >
          {weighed && !weighedLabel ? t("weigh.next") : t("options.confirm", { amount: amount === null || weighedLabel ? "" : moneyText(amount) })}
        </button>
      </div>
    </form>
  );

  const label = `${t("options.title")} · ${name}`;
  if (popover) {
    return (
      <RegisterDialog onDismiss={onClose} bare>
        <div
          data-testid="pos-reg-options-dialog"
          ref={boxRef}
          className="fixed flex w-[min(360px,calc(100vw-32px))] flex-col gap-5 overflow-y-auto rounded-[18px] border bg-[color:var(--color-surface)] p-4 shadow-[0_18px_44px_rgba(10,10,10,.18)]"
          style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, maxHeight: pos?.maxH, visibility: pos ? "visible" : "hidden" }}
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          {header}
          {body}
        </div>
      </RegisterDialog>
    );
  }
  return (
    <RegisterDialog onDismiss={onClose}>
      <div data-testid="pos-reg-options-dialog" className={`${REG_DIALOG_PANEL} md:w-[400px]`} role="dialog" aria-modal="true" aria-label={label}>
        <SheetGrab />
        {header}
        {body}
      </div>
    </RegisterDialog>
  );
}
