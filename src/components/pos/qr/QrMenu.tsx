"use client";

// QrMenu.tsx — เมนูของหน้าสาธารณะ QR (โต๊ะ /q/t · สั่งล่วงหน้า /q/<link>) · POS P2.7U
//   หมวด = ลำดับที่เซิร์ฟเวอร์เรียง (ชิปเลื่อนไปหมวด) · ราคา = ราคาช่องทางของเซิร์ฟเวอร์ (QR_TABLE / QR_ORDER) · 86/ปิดขาย = เทา + "หมด" กดไม่ได้
//   แตะ "+" : ไม่มีตัวเลือก = ใส่ตะกร้า 1 · มีตัวเลือก = แผ่นเลือก (กลุ่มบังคับ/ไม่บังคับ · จำนวน · หมายเหตุ) — ตรวจจริงที่เซิร์ฟเวอร์ตอน quote/ส่ง
//   canOrder=false (ประตูปิด) = เมนูอ่านอย่างเดียว ไม่มีปุ่ม
//   🔴 ไม่มีข้อความไทยนอก t() (ST7) · ไม่มีการคิดเงิน

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { QR_MAX_QTY, QR_NOTE_MAX, type QrMenuGroup, type QrMenuItem } from "@/lib/modules/pos/qr-order-shared";
import { menuCategories, nameOf, qrBaht, type QrLocale } from "./qr-ui";

export type QrPick = { productId: string; qty: number; choiceIds: string[]; note: string; name: string; options: string[] };

export function QrMenuBoard(p: { menu: readonly QrMenuItem[]; locale: QrLocale; canOrder: boolean; inCart: Record<string, number>; onAdd: (pick: QrPick) => void }) {
  const t = useTranslations("pos.qr");
  const cats = useMemo(() => menuCategories(p.menu), [p.menu]);
  const [sheet, setSheet] = useState<QrMenuItem | null>(null);
  const add = (m: QrMenuItem) => {
    if (m.optionGroups.length) setSheet(m);
    else p.onAdd({ productId: m.productId, qty: 1, choiceIds: [], note: "", name: nameOf(m, p.locale), options: [] });
  };
  if (!p.menu.length)
    return (
      <p data-testid="pos-qr-menu-empty" className="px-4 py-10 text-center text-[14px] text-[color:var(--color-muted)]">
        {t("menu.empty")}
      </p>
    );
  return (
    <section data-testid="pos-qr-menu" aria-label={t("table.menu")} className="flex min-w-0 flex-col">
      {cats.length > 1 ? (
        <nav aria-label={t("menu.categories")} className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b bg-[color:var(--color-surface)] px-4 py-2 md:px-6">
          {cats.map((c) => (
            <a key={c.key} href={`#qr-cat-${c.key}`} data-testid={`pos-qr-cat-${c.key}`} className="inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-[13.5px] text-[color:var(--color-ink-soft)]">
              {c.name ?? t("menu.other")}
            </a>
          ))}
        </nav>
      ) : null}
      {cats.map((c) => (
        <div key={c.key} id={`qr-cat-${c.key}`} className="scroll-mt-16 px-4 pt-4 md:px-6">
          <h2 className="pb-2 text-[13px] font-bold text-[color:var(--color-muted)]">{c.name ?? t("menu.other")}</h2>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {c.items.map((m) => {
              const n = p.inCart[m.productId] ?? 0;
              return (
                <li
                  key={m.productId}
                  data-testid="pos-qr-item"
                  data-available={m.available ? "1" : "0"}
                  className={`flex min-h-[72px] items-center gap-3 rounded-[14px] border px-3 py-2 ${m.available ? "" : "opacity-55"}`}
                >
                  {m.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-[10px] object-cover" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[15px] font-semibold leading-snug">{nameOf(m, p.locale)}</p>
                    <p className="text-[13.5px] tabular-nums text-[color:var(--color-ink-soft)]">
                      {qrBaht(m.priceSatang)}
                      {m.optionGroups.length ? <span className="ml-2 text-[12px] text-[color:var(--color-muted)]">{t("item.hasOptions")}</span> : null}
                    </p>
                  </div>
                  {!m.available ? (
                    <span data-testid="pos-qr-item-soldout" className="shrink-0 rounded-[8px] border px-2.5 py-1 text-[12.5px] font-bold text-[color:var(--color-muted)]">
                      {t("item.soldOut")}
                    </span>
                  ) : p.canOrder ? (
                    <button
                      type="button"
                      data-testid={`pos-qr-item-add-${m.productId}`}
                      aria-label={t("item.addNamed", { name: nameOf(m, p.locale) })}
                      className="relative grid size-11 shrink-0 place-items-center rounded-full bg-[color:var(--color-ink)] text-[22px] font-bold leading-none text-[color:var(--color-surface)]"
                      onClick={() => add(m)}
                    >
                      +
                      {n > 0 ? (
                        <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[color:var(--color-accent)] px-1 text-[11px] text-[color:var(--color-accent-fg)]">{n}</span>
                      ) : null}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {sheet ? <OptionsPanel item={sheet} locale={p.locale} onClose={() => setSheet(null)} onAdd={(pick) => (p.onAdd(pick), setSheet(null))} /> : null}
    </section>
  );
}

/** กลุ่มนี้เลือกครบตามกติกาไหม */
const groupOk = (g: QrMenuGroup, picked: readonly string[]) => {
  const n = g.choices.filter((c) => picked.includes(c.choiceId)).length;
  return n >= g.minSelect && n <= g.maxSelect;
};

function OptionsPanel(p: { item: QrMenuItem; locale: QrLocale; onClose: () => void; onAdd: (pick: QrPick) => void }) {
  const t = useTranslations("pos.qr");
  const [picked, setPicked] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && p.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p]);
  const toggle = (g: QrMenuGroup, choiceId: string) => {
    setPicked((cur) => {
      const inGroup = g.choices.map((c) => c.choiceId);
      if (g.maxSelect === 1) return [...cur.filter((x) => !inGroup.includes(x)), ...(cur.includes(choiceId) ? [] : [choiceId])];
      if (cur.includes(choiceId)) return cur.filter((x) => x !== choiceId);
      if (cur.filter((x) => inGroup.includes(x)).length >= g.maxSelect) return cur;
      return [...cur, choiceId];
    });
  };
  const ok = p.item.optionGroups.every((g) => groupOk(g, picked));
  const optionNames = p.item.optionGroups.flatMap((g) => g.choices.filter((c) => picked.includes(c.choiceId)).map((c) => nameOf(c, p.locale)));
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div aria-hidden="true" data-testid="pos-qr-opt-backdrop" className="absolute inset-0 bg-black/40" onClick={p.onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={nameOf(p.item, p.locale)}
        data-testid="pos-qr-opt-sheet"
        className="relative flex max-h-[88dvh] w-full max-w-[480px] flex-col rounded-t-[20px] bg-[color:var(--color-surface)] pb-[env(safe-area-inset-bottom)] md:rounded-[20px]"
      >
        <div className="flex items-start gap-3 border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-[17px] font-bold">{nameOf(p.item, p.locale)}</h2>
            <p className="text-[13.5px] tabular-nums text-[color:var(--color-ink-soft)]">{qrBaht(p.item.priceSatang)}</p>
          </div>
          <button type="button" data-testid="pos-qr-opt-close" aria-label={t("common.close")} className="grid size-11 place-items-center rounded-full border text-[18px]" onClick={p.onClose}>
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {p.item.optionGroups.map((g) => (
            <fieldset key={g.groupId} className="mb-4">
              <legend className="mb-1.5 flex w-full items-center justify-between gap-2 text-[14px] font-bold">
                <span>{nameOf(g, p.locale)}</span>
                <span className={`text-[12px] font-normal ${g.minSelect > 0 && !groupOk(g, picked) ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-muted)]"}`}>
                  {g.minSelect > 0 ? t("item.required", { min: g.minSelect }) : t("item.optional", { max: g.maxSelect })}
                </span>
              </legend>
              <div className="flex flex-col gap-1.5">
                {g.choices.map((c) => {
                  const on = picked.includes(c.choiceId);
                  return (
                    <button
                      key={c.choiceId}
                      type="button"
                      role={g.maxSelect === 1 ? "radio" : "checkbox"}
                      aria-checked={on}
                      disabled={!c.available}
                      data-testid={`pos-qr-choice-${c.choiceId}`}
                      className={`flex min-h-11 items-center justify-between gap-2 rounded-[12px] border px-3 text-left text-[14px] disabled:opacity-50 ${on ? "border-[color:var(--color-ink)] font-semibold" : ""}`}
                      onClick={() => toggle(g, c.choiceId)}
                    >
                      <span className="min-w-0 break-words">{nameOf(c, p.locale)}</span>
                      <span className="shrink-0 text-[13px] tabular-nums text-[color:var(--color-muted)]">
                        {!c.available ? t("item.soldOut") : c.priceDeltaSatang ? `+${qrBaht(c.priceDeltaSatang)}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <label className="mb-2 flex flex-col gap-1 text-[13px] text-[color:var(--color-ink-soft)]">
            {t("item.noteLabel")}
            <input data-testid="pos-qr-opt-note" maxLength={QR_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("item.notePlaceholder")} className="input h-11 rounded-[12px] text-[14px]" />
          </label>
        </div>
        <div className="flex items-center gap-3 border-t px-5 py-3">
          <QtyStepper value={qty} onValue={setQty} testid="pos-qr-opt-qty" />
          <button
            type="button"
            data-testid="pos-qr-opt-add"
            disabled={!ok}
            className="h-12 flex-1 rounded-[14px] bg-[color:var(--color-ink)] text-[15px] font-bold text-[color:var(--color-surface)] disabled:opacity-40"
            onClick={() => p.onAdd({ productId: p.item.productId, qty, choiceIds: picked, note, name: nameOf(p.item, p.locale), options: optionNames })}
          >
            {t("item.addToCart")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** ตัวเพิ่ม/ลดจำนวน 1..50 (ปุ่ม 44px) */
export function QrQtyStepper(p: { value: number; onValue: (n: number) => void; testid: string; min?: number }) {
  return <QtyStepper {...p} />;
}
function QtyStepper(p: { value: number; onValue: (n: number) => void; testid: string; min?: number }) {
  const t = useTranslations("pos.qr");
  const min = p.min ?? 1;
  return (
    <div className="flex items-center gap-1" data-testid={p.testid}>
      <button type="button" data-testid={`${p.testid}-minus`} aria-label={t("common.decrease")} disabled={p.value <= min} className="grid size-11 place-items-center rounded-full border text-[18px] disabled:opacity-40" onClick={() => p.onValue(Math.max(min, p.value - 1))}>
        −
      </button>
      <span className="min-w-8 text-center text-[16px] font-bold tabular-nums">{p.value}</span>
      <button type="button" data-testid={`${p.testid}-plus`} aria-label={t("common.increase")} disabled={p.value >= QR_MAX_QTY} className="grid size-11 place-items-center rounded-full border text-[18px] disabled:opacity-40" onClick={() => p.onValue(Math.min(QR_MAX_QTY, p.value + 1))}>
        +
      </button>
    </div>
  );
}
