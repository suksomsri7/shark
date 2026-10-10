"use client";

// ManualOrderEntry.tsx — แผ่น "+ คีย์ออเดอร์" (POS P2.8U · มติ 6 · ⚠️ derived — ภาพ 09 ไม่มีแผ่นนี้ · ข้อเสนอของ builder รอเจ้าของออกแบบ)
//   แผ่นขวา 420px (มือถือ = เต็มจอ): ช่องทาง (MANUAL / CHAT / ช่องทางกำหนดเอง — ไม่มีหน้าร้าน/QR/เว็บร้าน) · เลขออเดอร์แพลตฟอร์ม (บังคับเมื่อช่องทางกำหนดเอง) ·
//   ลูกค้า ชื่อ/เบอร์ · วิธีรับ (รับที่ร้าน / ส่ง + ที่อยู่) · ของแชท (ห้องแชท · party · สมาชิก — ไม่บังคับ) · หมายเหตุ ·
//   รายการจากแคตตาล็อกของหน้าขาย (ค้นหา → OptionsDialog เดิมเมื่อมีตัวเลือก/ตัวแปร) ราคาตามช่องทาง = quoteRegisterCartAction({channelId}) ของเซิร์ฟเวอร์ ·
//   รายการกำหนดเอง เฉพาะผู้มี pos.sale.priceOverride · "ยอดตามแพลตฟอร์ม" ไม่ตรง Σ รายการ = คำเตือน (orders.manual.totalMismatch · ไม่ใช่คำปฏิเสธ) ·
//   สถานะเริ่ม (MANUAL ปริยาย "รับแล้ว") · การชำระ (ช่องทางร้านเก็บเงินเอง) → ingestOrderAction
//   🔴 idempotencyKey = 1 คีย์ต่อการเปิดแผ่น (ผู้เรียกสร้างตอนเปิด · มติ S 12) · IDEMPOTENCY_CONFLICT = แจ้ง + คีย์ใหม่เมื่อเปิดแผ่นครั้งถัดไป ·
//      PRODUCT_UNAVAILABLE / CHANNEL_NOT_SOLD / OPTIONS_INVALID + lineIndex = ไฮไลต์บรรทัดนั้น
//   🔴 ไม่คิดเงินในจอ: ราคาบรรทัด/ยอดรวมมาจาก quote ของเซิร์ฟเวอร์ (ยอดตามแพลตฟอร์ม = ค่าที่พิมพ์ แปลงเป็นสตางค์เพื่อเทียบเท่านั้น)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ingestOrderAction } from "@/lib/modules/pos/order-actions";
import { quoteRegisterCartAction, registerCatalogAction, registerMemberLookupAction } from "@/lib/modules/pos/register-actions";
import { ORDER_ADDRESS_MAX, ORDER_CUSTOMER_NAME_MAX, ORDER_NAME_MAX, ORDER_PHONE_MAX, type OrderRefusal } from "@/lib/modules/pos/order-shared";
import { CHANNEL_REF_MAX } from "@/lib/modules/pos/channel-shared";
import { moneyText, refusalMessageKey, REGISTER_NOTE_MAX, type RegisterMemberItem, type RegisterProduct, type RegisterQuote, type RegisterQuoteLineInput } from "@/lib/modules/pos/register-shared";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { OptionsDialog, type OptionsPick } from "@/components/pos/register/OptionsDialog";
import { parseHundredths } from "@/components/pos/register/LineEditor";
import { channelDisplayName } from "@/components/pos/settings/channel-text";
import type { OrdersChannel } from "./orders-ui";

type Line =
  | { kind: "product"; productId: string; name: string; qty: number; choiceIds: string[]; optionNames: string[] }
  | { kind: "custom"; name: string; qty: number; unitPriceSatang: number };

/** ช่องทางที่คีย์ออเดอร์ได้ (มติ 6): adapter MANUAL (แพลตฟอร์ม/กำหนดเอง) หรือ CHAT · ไม่ใช่หน้าร้าน/QR/เว็บร้าน · เปิดใช้อยู่ */
export const manualChannels = (items: readonly OrdersChannel[]): OrdersChannel[] =>
  items.filter((c) => !c.archived && c.active && c.code !== "STORE" && c.code !== "QR_TABLE" && c.code !== "WEB" && (c.adapter === "MANUAL" || c.adapter === "CHAT"));

const MAX_QTY = 99;

export function ManualOrderEntry(p: {
  systemId: string;
  unitId: string;
  deviceId: string | undefined;
  channels: readonly OrdersChannel[];
  /** ช่องที่เลือกในราง (ถ้าคีย์ได้) — ค่าเริ่ม */
  initialChannelId: string | null;
  idempotencyKey: string;
  canOverridePrice: boolean;
  onDone: (orderId: string, duplicated: boolean) => void;
  onConflict: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("pos.orders");
  const tr = useTranslations("pos.register");
  const tpos = useTranslations("pos");
  const tch = useTranslations("pos.channel");
  const locale = useLocale();
  const list = useMemo(() => manualChannels(p.channels), [p.channels]);
  const [channelId, setChannelId] = useState<string>(() => (p.initialChannelId && list.some((c) => c.id === p.initialChannelId) ? p.initialChannelId : (list[0]?.id ?? "")));
  const ch = list.find((c) => c.id === channelId) ?? null;
  const [ref, setRef] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [fulfilment, setFulfilment] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [conv, setConv] = useState("");
  const [party, setParty] = useState("");
  const [member, setMember] = useState<RegisterMemberItem | null>(null);
  const [memberQ, setMemberQ] = useState("");
  const [memberHits, setMemberHits] = useState<RegisterMemberItem[] | null>(null);
  const [start, setStart] = useState<"ACCEPTED" | "NEW">("ACCEPTED");
  const [payState, setPayState] = useState<"UNPAID" | "PAY_ON_PICKUP">("UNPAID");
  const [lines, setLines] = useState<Line[]>([]);
  const [badLine, setBadLine] = useState<number | null>(null);
  const [platformTotal, setPlatformTotal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [conflicted, setConflicted] = useState(false);

  // ── แคตตาล็อก (ค้นหา) ──
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<RegisterProduct[] | null>(null);
  const [picking, setPicking] = useState<RegisterProduct | null>(null);
  useEffect(() => {
    let alive = true;
    const h = setTimeout(() => {
      registerCatalogAction({ systemId: p.systemId, unitId: p.unitId, ...(q.trim() ? { q: q.trim().slice(0, 60) } : {}), limit: 30 })
        .then((r) => {
          if (alive) setProducts(r.ok ? r.products : []);
        })
        .catch(() => {
          if (alive) setProducts([]);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [p.systemId, p.unitId, q]);

  // ── ราคาตามช่องทาง (quote ของเซิร์ฟเวอร์) ──
  const cartLines = useMemo<RegisterQuoteLineInput[]>(
    () => lines.map((l) => (l.kind === "product" ? { productId: l.productId, qty: l.qty, ...(l.choiceIds.length ? { options: l.choiceIds.map((choiceId) => ({ choiceId })) } : {}) } : { name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang })),
    [lines],
  );
  const [quote, setQuote] = useState<RegisterQuote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const quoteSeq = useRef(0);
  const requote = useCallback(async () => {
    const seq = ++quoteSeq.current;
    if (!cartLines.length || !channelId) {
      setQuote(null);
      setQuoteErr(null);
      return;
    }
    try {
      const r = await quoteRegisterCartAction({ systemId: p.systemId, unitId: p.unitId, cart: { lines: cartLines, channelId } });
      if (seq !== quoteSeq.current) return;
      if (r.ok) {
        setQuote(r);
        setQuoteErr(null);
        setBadLine(null);
      } else {
        setQuote(null);
        setQuoteErr(tr(refusalMessageKey(r.code)));
        if (typeof r.lineIndex === "number") setBadLine(r.lineIndex);
      }
    } catch {
      if (seq === quoteSeq.current) setQuoteErr(t("page.loadFailed"));
    }
  }, [cartLines, channelId, p.systemId, p.unitId, t, tr]);
  useEffect(() => {
    void requote();
  }, [requote]);

  const typedTotal = platformTotal.trim() ? parseHundredths(platformTotal) : null;
  const mismatch = quote && typedTotal !== null && typedTotal !== quote.grandTotalSatang;
  const refRequired = ch?.kind === "CUSTOM";
  const isChat = ch?.adapter === "CHAT";
  const isManual = ch?.adapter === "MANUAL";
  const direct = ch?.payout === "DIRECT";

  const addProduct = (prod: RegisterProduct) => {
    if (prod.optionGroupCount > 0 || prod.variantCount > 0) {
      setPicking(prod);
      return;
    }
    setLines((ls) => [...ls, { kind: "product", productId: prod.id, name: locale.startsWith("en") && prod.nameEn ? prod.nameEn : prod.name, qty: 1, choiceIds: [], optionNames: [] }]);
  };
  const addPicked = (o: OptionsPick) => {
    setPicking(null);
    setLines((ls) => [
      ...ls,
      {
        kind: "product",
        productId: o.product.id,
        name: locale.startsWith("en") && o.product.nameEn ? o.product.nameEn : o.product.name,
        qty: Math.max(1, Math.min(MAX_QTY, o.qty)),
        choiceIds: o.options,
        optionNames: o.options.map((id) => o.names[id] ?? "").filter(Boolean),
      },
    ]);
  };
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const customSatang = customPrice.trim() ? parseHundredths(customPrice) : null;
  const addCustom = () => {
    if (!customName.trim() || customSatang === null || customSatang <= 0) return;
    setLines((ls) => [...ls, { kind: "custom", name: customName.trim().slice(0, ORDER_NAME_MAX), qty: 1, unitPriceSatang: customSatang }]);
    setCustomName("");
    setCustomPrice("");
    setCustomOpen(false);
  };
  const setQty = (i: number, d: number) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, qty: Math.max(1, Math.min(MAX_QTY, l.qty + d)) } : l)));
  const removeLine = (i: number) => {
    setBadLine(null);
    setLines((ls) => ls.filter((_, j) => j !== i));
  };

  const lookupMember = async () => {
    const s = memberQ.trim();
    if (s.length < 3) return;
    try {
      const r = await registerMemberLookupAction({ systemId: p.systemId, unitId: p.unitId, q: s });
      setMemberHits(r.ok ? r.items : []);
    } catch {
      setMemberHits([]);
    }
  };

  const canSubmit = !!ch && lines.length > 0 && !!name.trim() && (!refRequired || !!ref.trim()) && (fulfilment === "PICKUP" || !!address.trim()) && !busy && !conflicted;
  const submit = async () => {
    if (!ch || !canSubmit) return;
    setBusy(true);
    setErr(null);
    const input = {
      channelId: ch.id,
      ...(ref.trim() ? { externalRef: ref.trim() } : {}),
      idempotencyKey: p.idempotencyKey,
      lines: lines.map((l) => (l.kind === "product" ? { productId: l.productId, qty: l.qty, choiceIds: l.choiceIds } : { name: l.name, unitPriceSatang: l.unitPriceSatang, qty: l.qty })),
      customer: { name: name.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}), ...(member ? { memberId: member.id } : {}), ...(isChat && party.trim() ? { partyId: party.trim() } : {}) },
      fulfilment,
      ...(fulfilment === "DELIVERY" && address.trim() ? { address: address.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(isChat && conv.trim() ? { chatConversationId: conv.trim() } : {}),
      ...(isManual ? { startStatus: start } : {}),
      ...(direct ? { paymentState: payState } : {}),
    };
    try {
      const r = await ingestOrderAction({ systemId: p.systemId, unitId: p.unitId, ...(p.deviceId ? { deviceId: p.deviceId } : {}), input });
      if (r.ok) {
        p.onDone(r.orderId, r.duplicated);
        return;
      }
      showRefusal(r);
    } catch {
      setErr(t("page.loadFailed"));
    } finally {
      setBusy(false);
    }
  };
  const showRefusal = (r: OrderRefusal) => {
    if (typeof r.lineIndex === "number") setBadLine(r.lineIndex);
    if (r.code === "IDEMPOTENCY_CONFLICT") {
      setConflicted(true);
      p.onConflict();
    }
    setErr(r.messageKey ? tpos(r.messageKey) : tr(refusalMessageKey(r.code)));
  };

  const field = "input h-11 rounded-[12px] text-[15px]";
  const label = "flex flex-col gap-1 text-[12.5px] font-bold text-[color:var(--color-ink-soft)]";
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div
        data-testid="pos-ord-manual-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t("manual.title")}
        className="flex h-full w-full flex-col bg-[color:var(--color-surface)] shadow-2xl md:w-[420px]"
        inert={!!picking}
      >
        <header className="flex items-center gap-3 border-b px-5 py-3">
          <h2 className="min-w-0 flex-1 truncate text-[17px] font-bold">{t("manual.title")}</h2>
          <button type="button" data-testid="pos-ord-man-close" aria-label={t("detail.close")} disabled={busy} className="grid size-11 place-items-center rounded-[12px] border" onClick={p.onClose}>
            <RegisterIcon name="x" size={14} />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <p className="rounded-[10px] border border-dashed px-3 py-2 text-[12px] text-[color:var(--color-muted)]">{t("manual.derivedNote")}</p>
          {list.length === 0 ? (
            <p data-testid="pos-ord-man-nochannel" className="text-[13.5px] text-[color:var(--color-muted)]">
              {t("manual.noChannel")}
            </p>
          ) : null}
          <label className={label}>
            {t("manual.channel")}
            <select data-testid="pos-ord-man-channel" value={channelId} onChange={(e) => setChannelId(e.target.value)} className={field}>
              {list.map((c) => (
                <option key={c.id} value={c.id}>
                  {channelDisplayName(c.code, c.name, tch)}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            {refRequired ? t("manual.platformRefRequired") : t("manual.platformRef")}
            <input data-testid="pos-ord-man-ref" value={ref} maxLength={CHANNEL_REF_MAX} onChange={(e) => setRef(e.target.value)} className={field} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>
              {t("manual.customerName")}
              <input data-testid="pos-ord-man-name" value={name} maxLength={ORDER_CUSTOMER_NAME_MAX} onChange={(e) => setName(e.target.value)} className={field} />
            </label>
            <label className={label}>
              {t("manual.phone")}
              <input data-testid="pos-ord-man-phone" inputMode="tel" value={phone} maxLength={ORDER_PHONE_MAX} onChange={(e) => setPhone(e.target.value)} className={field} />
            </label>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[12.5px] font-bold text-[color:var(--color-ink-soft)]">{t("manual.fulfilment")}</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["PICKUP", "DELIVERY"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={fulfilment === f}
                  data-testid={`pos-ord-man-ful-${f}`}
                  className={`h-11 rounded-[12px] border text-[14px] ${fulfilment === f ? "border-[color:var(--color-ink)] font-bold" : "border-[color:var(--color-line)]"}`}
                  onClick={() => setFulfilment(f)}
                >
                  {t(`fulfilment.${f}`)}
                </button>
              ))}
            </div>
            {fulfilment === "DELIVERY" ? (
              <textarea
                data-testid="pos-ord-man-address"
                aria-label={t("manual.address")}
                placeholder={t("manual.address")}
                value={address}
                maxLength={ORDER_ADDRESS_MAX}
                onChange={(e) => setAddress(e.target.value)}
                className="input min-h-[60px] resize-y rounded-[12px] py-2 text-[14px]"
              />
            ) : null}
          </fieldset>
          {isChat ? (
            <fieldset className="flex flex-col gap-2 rounded-[12px] border px-3 py-3">
              <legend className="px-1 text-[12.5px] font-bold text-[color:var(--color-ink-soft)]">{t("manual.chatExtras")}</legend>
              <label className={label}>
                {t("manual.conversation")}
                <input data-testid="pos-ord-man-conv" value={conv} maxLength={200} onChange={(e) => setConv(e.target.value)} className={field} />
              </label>
              <label className={label}>
                {t("manual.party")}
                <input data-testid="pos-ord-man-party" value={party} maxLength={200} onChange={(e) => setParty(e.target.value)} className={field} />
              </label>
              {member ? (
                <div className="flex items-center gap-2 rounded-[10px] bg-[color:var(--color-surface-2)] px-3 py-2 text-[13.5px]">
                  <span className="min-w-0 flex-1 truncate">{`${member.name} · ${member.phoneMasked}`}</span>
                  <button type="button" data-testid="pos-ord-man-member-clear" aria-label={t("manual.memberClear")} className="grid size-11 place-items-center rounded-[10px]" onClick={() => setMember(null)}>
                    <RegisterIcon name="x" size={12} />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-2">
                    <input
                      data-testid="pos-ord-man-member-q"
                      aria-label={t("manual.member")}
                      placeholder={t("manual.member")}
                      value={memberQ}
                      onChange={(e) => setMemberQ(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void lookupMember();
                      }}
                      className={`${field} min-w-0 flex-1`}
                    />
                    <button type="button" data-testid="pos-ord-man-member-search" className="btn btn-ghost h-11 rounded-[12px] px-3" onClick={() => void lookupMember()}>
                      <RegisterIcon name="search" size={14} />
                    </button>
                  </div>
                  {memberHits?.map((m) => (
                    <button key={m.id} type="button" data-testid={`pos-ord-man-member-${m.id}`} className="flex min-h-11 items-center gap-2 rounded-[10px] border px-3 text-left text-[13.5px]" onClick={() => setMember(m)}>
                      <span className="min-w-0 flex-1 truncate">{m.name}</span>
                      <span className="shrink-0 text-[12px] text-[color:var(--color-muted)]">{m.phoneMasked}</span>
                    </button>
                  ))}
                  {memberHits && memberHits.length === 0 ? <p className="text-[12px] text-[color:var(--color-muted)]">{t("manual.memberNone")}</p> : null}
                </div>
              )}
            </fieldset>
          ) : null}

          <section className="flex flex-col gap-2">
            <h3 className="text-[12.5px] font-bold text-[color:var(--color-ink-soft)]">{t("manual.items")}</h3>
            <ul data-testid="pos-ord-man-lines" className="flex flex-col gap-1.5">
              {lines.map((l, i) => {
                const ql = quote?.lines[i];
                return (
                  <li
                    key={i}
                    data-testid={`pos-ord-man-line-${i}`}
                    data-bad={badLine === i ? "1" : undefined}
                    className={`flex items-center gap-2 rounded-[12px] border px-3 py-2 ${badLine === i ? "border-[color:var(--color-danger)] ring-1 ring-[color:var(--color-danger)]" : "border-[color:var(--color-line)]"}`}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[14px] font-bold">{l.name}</span>
                      {l.kind === "product" && l.optionNames.length ? <span className="truncate text-[12px] text-[color:var(--color-muted)]">{l.optionNames.join(" · ")}</span> : null}
                      {l.kind === "custom" ? <span className="text-[12px] text-[color:var(--color-muted)]">{t("manual.customItem")}</span> : null}
                    </span>
                    <button type="button" data-testid={`pos-ord-man-line-less-${i}`} aria-label={t("prep.less")} disabled={l.qty <= 1} className="grid size-11 place-items-center rounded-[10px] border disabled:opacity-40" onClick={() => setQty(i, -1)}>
                      <RegisterIcon name="minus" size={12} />
                    </button>
                    <span className="w-6 text-center text-[14px] font-bold tabular-nums">{l.qty}</span>
                    <button type="button" data-testid={`pos-ord-man-line-more-${i}`} aria-label={t("prep.more")} disabled={l.qty >= MAX_QTY} className="grid size-11 place-items-center rounded-[10px] border disabled:opacity-40" onClick={() => setQty(i, 1)}>
                      <RegisterIcon name="plus" size={12} />
                    </button>
                    <span className="w-16 shrink-0 text-right text-[13.5px] font-bold tabular-nums">{ql ? moneyText(ql.lineTotalSatang) : "—"}</span>
                    <button type="button" data-testid={`pos-ord-man-line-remove-${i}`} aria-label={t("manual.removeLine")} className="grid size-11 place-items-center rounded-[10px]" onClick={() => removeLine(i)}>
                      <RegisterIcon name="del" size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>
            {quoteErr ? (
              <p role="alert" className="text-[12.5px] text-[color:var(--color-danger)]">
                {quoteErr}
              </p>
            ) : null}
            <input
              data-testid="pos-ord-man-search"
              aria-label={t("manual.addItem")}
              placeholder={t("manual.searchPlaceholder")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className={field}
            />
            <ul className="flex max-h-[220px] flex-col gap-1 overflow-y-auto rounded-[12px] border p-1">
              {products === null ? <li className="px-3 py-2 text-[12.5px] text-[color:var(--color-muted)]">…</li> : null}
              {products?.length === 0 ? <li className="px-3 py-2 text-[12.5px] text-[color:var(--color-muted)]">{t("manual.noProducts")}</li> : null}
              {products?.map((prod) => (
                <li key={prod.id}>
                  <button
                    type="button"
                    data-testid={`pos-ord-man-product-${prod.id}`}
                    disabled={prod.soldOutReason === "UNAVAILABLE" || prod.soldByWeight}
                    className="flex min-h-11 w-full items-center gap-2 rounded-[10px] px-3 text-left text-[13.5px] hover:bg-[color:var(--color-surface-2)] disabled:opacity-40"
                    onClick={() => addProduct(prod)}
                  >
                    <RegisterIcon name="plus" size={12} />
                    <span className="min-w-0 flex-1 truncate">{locale.startsWith("en") && prod.nameEn ? prod.nameEn : prod.name}</span>
                    {prod.optionGroupCount > 0 || prod.variantCount > 0 ? <span className="shrink-0 text-[11.5px] text-[color:var(--color-muted)]">{t("manual.hasOptions")}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
            {p.canOverridePrice ? (
              customOpen ? (
                <div className="flex flex-col gap-2 rounded-[12px] border px-3 py-3">
                  <input data-testid="pos-ord-man-custom-name" aria-label={t("manual.customName")} placeholder={t("manual.customName")} value={customName} maxLength={ORDER_NAME_MAX} onChange={(e) => setCustomName(e.target.value)} className={field} />
                  <div className="flex gap-2">
                    <input data-testid="pos-ord-man-custom-price" aria-label={t("manual.customPrice")} placeholder={t("manual.customPrice")} inputMode="decimal" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} className={`${field} min-w-0 flex-1 tabular-nums`} />
                    <button type="button" data-testid="pos-ord-man-custom-add" disabled={!customName.trim() || customSatang === null || customSatang <= 0} className="btn btn-primary h-11 rounded-[12px] px-4 disabled:opacity-50" onClick={addCustom}>
                      {t("manual.customAdd")}
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" data-testid="pos-ord-man-custom" className="btn btn-ghost h-11 rounded-[12px] text-[14px]" onClick={() => setCustomOpen(true)}>
                  {t("manual.customItem")}
                </button>
              )
            ) : (
              <p className="text-[12px] text-[color:var(--color-muted)]">{t("manual.customNeedsPermission")}</p>
            )}
          </section>

          <section className="flex flex-col gap-2 border-t pt-3">
            <div className="flex justify-between text-[14px]">
              <span>{t("manual.itemsTotal")}</span>
              <b data-testid="pos-ord-man-total" className="tabular-nums">
                {quote ? moneyText(quote.grandTotalSatang) : "—"}
              </b>
            </div>
            <label className={label}>
              {t("manual.platformTotal")}
              <input data-testid="pos-ord-man-platform-total" inputMode="decimal" value={platformTotal} onChange={(e) => setPlatformTotal(e.target.value)} className={`${field} tabular-nums`} />
            </label>
            {mismatch ? (
              <p data-testid="pos-ord-man-mismatch" role="status" className="rounded-[10px] bg-[color:var(--color-accent-soft)] px-3 py-2 text-[12.5px] text-[color:var(--color-accent)]">
                {t("manual.totalMismatch", { typed: moneyText(typedTotal ?? 0), sum: moneyText(quote.grandTotalSatang) })}
              </p>
            ) : null}
          </section>

          {isManual ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[12.5px] font-bold text-[color:var(--color-ink-soft)]">{t("manual.startStatus")}</legend>
              {(["ACCEPTED", "NEW"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={start === s}
                  data-testid={`pos-ord-man-start-${s}`}
                  className={`min-h-11 rounded-[12px] border px-3 text-left text-[13.5px] ${start === s ? "border-[color:var(--color-ink)] font-bold" : "border-[color:var(--color-line)]"}`}
                  onClick={() => setStart(s)}
                >
                  {s === "ACCEPTED" ? t("manual.startAccepted") : t("manual.startNew")}
                </button>
              ))}
            </fieldset>
          ) : null}
          {direct ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[12.5px] font-bold text-[color:var(--color-ink-soft)]">{t("manual.paymentState")}</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["UNPAID", "PAY_ON_PICKUP"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={payState === s}
                    data-testid={`pos-ord-man-pay-${s}`}
                    className={`min-h-11 rounded-[12px] border px-2 text-[13.5px] ${payState === s ? "border-[color:var(--color-ink)] font-bold" : "border-[color:var(--color-line)]"}`}
                    onClick={() => setPayState(s)}
                  >
                    {t(`payment.${s}`)}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}
          <label className={label}>
            {t("manual.note")}
            <textarea data-testid="pos-ord-man-note" value={note} maxLength={REGISTER_NOTE_MAX} onChange={(e) => setNote(e.target.value)} className="input min-h-[56px] resize-y rounded-[12px] py-2 text-[14px]" />
          </label>
        </div>
        <footer className="flex flex-col gap-2 border-t px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
          {err ? (
            <p role="alert" data-testid="pos-ord-man-error" className="text-[13px] text-[color:var(--color-danger)]">
              {err}
            </p>
          ) : null}
          <button type="button" data-testid="pos-ord-man-submit" disabled={!canSubmit} className="btn btn-primary h-12 rounded-[14px] text-[16px] font-bold disabled:opacity-50" onClick={() => void submit()}>
            {t("manual.submit")}
          </button>
        </footer>
      </div>
      {picking ? (
        <OptionsDialog product={picking} systemId={p.systemId} unitId={p.unitId} locale={locale} allowNegative onAdd={addPicked} onClose={() => setPicking(null)} />
      ) : null}
    </div>
  );
}
