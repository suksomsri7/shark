"use client";

// StockShortcuts.tsx — POS P1.14 U ทางลัดสต็อก (ภาพ 16 เฉพาะส่วนของ P1.14) + ประวัติล่าสุด
//   รับของเข้า = รับอิสระเท่านั้น (มติเจ้าของ Q1 — ไม่มีซัพพลายเออร์/ใบสั่งซื้อ/บิลซื้อ/รูปใบส่งของ/รายการ PO ที่รอรับ) · ต่อแถว 1 คำขอ ตามลำดับ
//   โอน = ทันที ระหว่างที่เก็บของคลังเดียวกัน (R16 · ไม่มีสถานะ "รอรับที่ปลายทาง" — โอนสองขั้นคือ P2.12)
//   ปรับสต็อก = delta ≠ 0 + เหตุผล (ไม่ลงบัญชี — มติเจ้าของ Q2) · ประวัติ = รอบตรวจนับของสาขา + การเคลื่อนไหวที่ทำในหน้านี้
// 🔴 ทุกคำขอมีคีย์กันซ้ำของตัวเอง (สร้างตอนกดส่ง เก็บจนผลมา · ค่าเดิมลองใหม่ = คีย์เดิม) · action ครั้งละหนึ่ง (await ทีละแถว)

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { formatBaht } from "@/lib/ui/money";
import type { StockCountMeta } from "@/lib/modules/pos/stock-count";
import { STOCK_COUNT_NOTE_MAX, STOCK_COUNT_REASON_MAX, type StockCountView } from "@/lib/modules/pos/stock-count-shared";
import { posStockAdjustAction, posStockHistoryAction, posStockReceiveAction, posStockTransferAction } from "@/lib/modules/pos/stock-count-actions";
import { bkkDayHm, fmtDelta, fmtInt, ItemPicker, newKey, parseCount, parseSigned, StockIcon, useRefusalText, type ItemHit, type T, type Target } from "./stock-ui";

/** การเคลื่อนไหวที่ทำในหน้านี้ (เก็บใน state พร้อม id ของ movement) */
export type SessionMove = { id: string; kind: "receive" | "transfer" | "adjust"; name: string; qty: number; at: string; detail: string };
type Shared = { target: Target; meta: StockCountMeta; locationId: string; locName: (id: string) => string; onMove: (m: SessionMove) => void };
type Sent = { sig: string; key: string };

/** "1,234.50" → 123450 · ว่าง = undefined · ผิดรูป = null */
function bahtToSatang(v: string): number | undefined | null {
  const s = v.replace(/[,\s฿]/g, "");
  if (!s) return undefined;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  const [b, f = ""] = s.split(".");
  return Number(b) * 100 + Number((f + "00").slice(0, 2));
}
const keyFor = (prev: Sent | undefined, sig: string): Sent => (prev && prev.sig === sig ? prev : { sig, key: newKey() });

function CardHead({ icon, title, right }: { icon: "receive" | "transfer" | "adjust" | "history"; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <StockIcon name={icon} size={18} />
      <h3 className="min-w-0 flex-1 truncate text-[17px] font-bold">{title}</h3>
      {right}
    </div>
  );
}
function Denied({ kind }: { kind: "receive" | "transfer" | "adjust" | "adjust-c" }) {
  const refusal = useRefusalText();
  return (
    <p role="alert" data-testid={`pos-stock-${kind}-refusal`} className="text-sm text-[color:var(--color-muted)]">
      {refusal("PERMISSION_DENIED")}
    </p>
  );
}

// ═══════════ รับของเข้า ═══════════
type RecvRow = { rid: string; item: ItemHit; qty: string; cost: string; lot: string; expiry: string; note: string; sent?: Sent; error?: string; saving?: boolean };

export function ReceiveCard({ target, meta, onMove, locationId, me, invHref }: Shared & { me: { id: string; name: string | null }; invHref: string }) {
  const t = useTranslations("pos.stock") as T;
  const locale = useLocale();
  const refusal = useRefusalText();
  const [rows, setRows] = useState<RecvRow[]>([]);
  const [busy, setBusy] = useState(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const defaultLoc = meta.locations.find((l) => l.isDefault);
  const today = new Intl.DateTimeFormat(locale.startsWith("en") ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" }).format(new Date());

  const patch = (rid: string, p: Partial<RecvRow>) => setRows((rs) => rs.map((r) => (r.rid === rid ? { ...r, ...p } : r)));
  const add = (item: ItemHit) =>
    setRows((rs) => {
      const same = rs.find((r) => r.item.id === item.id && !r.saving);
      if (same) return rs.map((r) => (r === same ? { ...r, qty: String((parseCount(r.qty) ?? 0) + 1), error: undefined } : r));
      // F4: ช่องต้นทุนว่าง = แสดงต้นทุนเฉลี่ยเป็น placeholder และใช้คำนวณรวม/มูลค่า · ส่ง costSatang เฉพาะเมื่อผู้ใช้กรอก (ค่า prefill เคยทับ moving average)
      return [...rs, { rid: newKey(), item, qty: "1", cost: "", lot: "", expiry: "", note: "" }];
    });

  const lineTotal = (r: RecvRow) => {
    const q = parseCount(r.qty);
    const typed = bahtToSatang(r.cost);
    const c = typed === undefined ? r.item.costSatang : typed;
    return q !== null && typeof c === "number" ? q * c : null;
  };
  const total = rows.reduce((s, r) => s + (lineTotal(r) ?? 0), 0);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    let last: SessionMove | null = null;
    for (const r0 of rowsRef.current) {
      const r = rowsRef.current.find((x) => x.rid === r0.rid);
      if (!r) continue;
      const qty = parseCount(r.qty);
      const cost = bahtToSatang(r.cost);
      if (qty === null || qty < 1) {
        patch(r.rid, { error: t("badQty") });
        continue;
      }
      if (cost === null) {
        patch(r.rid, { error: t("receive.badCost") });
        continue;
      }
      if (r.expiry && !r.lot.trim()) {
        patch(r.rid, { error: t("receive.expiryNeedsLot") });
        continue;
      }
      const input = {
        itemId: r.item.id,
        qty,
        ...(cost !== undefined ? { costSatang: cost } : {}),
        ...(r.lot.trim() ? { lotCode: r.lot.trim() } : {}),
        ...(r.expiry ? { expiryDate: r.expiry } : {}),
        ...(r.note.trim() ? { note: r.note.trim() } : {}),
      };
      const sent = keyFor(r.sent, JSON.stringify(input));
      patch(r.rid, { sent, saving: true, error: undefined });
      const res = await posStockReceiveAction({ ...target, input: { ...input, idempotencyKey: sent.key } }).catch(() => null);
      if (res && res.ok) {
        setRows((rs) => rs.filter((x) => x.rid !== r.rid));
        last = { id: res.movementId, kind: "receive", name: r.item.name, qty, at: new Date().toISOString(), detail: defaultLoc?.name ?? t("defaultLocation") };
      } else {
        patch(r.rid, { saving: false, error: refusal(res ? res.code : "INTERNAL") });
      }
    }
    if (last) onMove(last); // F6: ประวัติโหลดใหม่ครั้งเดียวหลังส่งครบทุกแถว
    setBusy(false);
  };

  return (
    <section className="card flex flex-col gap-4" data-testid="pos-stock-receive-card">
      <CardHead
        icon="receive"
        title={t("receive.title", { loc: defaultLoc?.name ?? t("defaultLocation") })}
        right={<span className="hidden shrink-0 text-xs text-[color:var(--color-muted)] sm:inline">{t("receive.byLine", { date: today, name: me.name ?? "—" })}</span>}
      />
      {!meta.can.receive ? (
        <Denied kind="receive" />
      ) : (
        <>
          {defaultLoc && locationId && locationId !== defaultLoc.id && (
            <p data-testid="pos-stock-receive-default-only" className="text-xs text-[color:var(--color-muted)]">
              {t("receive.defaultOnly", { loc: defaultLoc.name })}
            </p>
          )}
          <ItemPicker target={target} kind="receive" data-testid="pos-stock-receive-picker" placeholder={t("receive.searchPlaceholder")} onPick={add} />
          {rows.length > 0 ? (
            <div className="@container w-full min-w-0 rounded-[12px] border" data-testid="pos-stock-receive-rows">
              <div className="hidden @min-[608px]:grid-cols-[minmax(140px,1fr)_56px_84px_72px_150px_40px] gap-2 border-b bg-[color:var(--color-surface-2)] px-3 py-2.5 text-[11.5px] font-semibold text-[color:var(--color-muted)] @min-[608px]:grid">
                <span>{t("receive.colItem")}</span>
                <span className="text-center">{t("receive.colQty")}</span>
                <span className="text-right">{t("receive.colCost")}</span>
                <span className="text-right">{t("receive.colTotal")}</span>
                <span>{t("receive.colLot")}</span>
                <span />
              </div>
              {rows.map((r) => {
                const lt = lineTotal(r);
                return (
                  <div key={r.rid} className="grid w-full min-w-0 grid-cols-2 gap-2 border-b px-3 py-3 last:border-0 @min-[608px]:grid-cols-[minmax(140px,1fr)_56px_84px_72px_150px_40px] @min-[608px]:items-center" data-testid={`pos-stock-receive-row-${r.item.id}`}>
                    <div className="col-span-2 flex min-w-0 flex-col gap-0.5 overflow-hidden @min-[608px]:col-span-1">
                      <span className="block min-w-0">
                        <b className="block truncate text-sm font-semibold">{r.item.name}</b>
                        <span className="block truncate text-[11.5px] text-[color:var(--color-muted)]">
                          {r.item.sku} · {r.item.unitLabel}
                        </span>
                      </span>
                      <input
                        data-testid={`pos-stock-receive-note-${r.item.id}`}
                        className="hidden w-full bg-transparent text-[11.5px] outline-none placeholder:text-[color:var(--color-muted)] @min-[608px]:block"
                        placeholder={t("receive.notePlaceholder")}
                        maxLength={STOCK_COUNT_NOTE_MAX}
                        value={r.note}
                        onChange={(e) => patch(r.rid, { note: e.target.value })}
                      />
                    </div>
                    <label className="flex flex-col gap-1 text-[11px] text-[color:var(--color-muted)] @min-[608px]:block">
                      <span className="@min-[608px]:hidden">{t("receive.colQty")}</span>
                      <input
                        data-testid={`pos-stock-receive-qty-${r.item.id}`}
                        inputMode="numeric"
                        className={`h-11 w-full rounded-[10px] border text-center text-[15px] font-bold tabular-nums text-[color:var(--color-ink)] outline-none focus:border-2 focus:border-[color:var(--color-accent)] ${r.error ? "border-[color:var(--color-danger)]" : ""}`}
                        value={r.qty}
                        onChange={(e) => patch(r.rid, { qty: e.target.value })}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] text-[color:var(--color-muted)] @min-[608px]:block">
                      <span className="@min-[608px]:hidden">{t("receive.colCost")}</span>
                      <input
                        data-testid={`pos-stock-receive-cost-${r.item.id}`}
                        inputMode="decimal"
                        className="input h-11 text-right tabular-nums text-[color:var(--color-ink)]"
                        placeholder={(r.item.costSatang / 100).toFixed(2)}
                        value={r.cost}
                        onChange={(e) => patch(r.rid, { cost: e.target.value })}
                      />
                    </label>
                    <span className="hidden text-right text-sm font-semibold tabular-nums @min-[608px]:block">{lt !== null ? formatBaht(lt) : "—"}</span>
                    <div className="col-span-2 grid grid-cols-2 gap-2 @min-[608px]:col-span-1 @min-[608px]:grid-cols-1 @min-[608px]:gap-1">
                      <input
                        data-testid={`pos-stock-receive-lot-${r.item.id}`}
                        className="input h-11 @min-[608px]:h-9"
                        placeholder={t("receive.lotPlaceholder")}
                        maxLength={64}
                        value={r.lot}
                        onChange={(e) => patch(r.rid, { lot: e.target.value })}
                      />
                      <input
                        data-testid={`pos-stock-receive-expiry-${r.item.id}`}
                        type="date"
                        aria-label={t("receive.expiry")}
                        className="input h-11 @min-[608px]:h-9"
                        value={r.expiry}
                        onChange={(e) => patch(r.rid, { expiry: e.target.value })}
                      />
                    </div>
                    <input
                      data-testid={`pos-stock-receive-mnote-${r.item.id}`}
                      className="input col-span-2 h-11 @min-[608px]:hidden"
                      placeholder={t("receive.notePlaceholder")}
                      maxLength={STOCK_COUNT_NOTE_MAX}
                      value={r.note}
                      onChange={(e) => patch(r.rid, { note: e.target.value })}
                    />
                    <button
                      type="button"
                      data-testid={`pos-stock-receive-remove-${r.item.id}`}
                      aria-label={t("remove")}
                      disabled={r.saving}
                      className="col-span-2 grid h-11 place-items-center rounded-[10px] border text-[color:var(--color-muted)] @min-[608px]:col-span-1 @min-[608px]:w-10"
                      onClick={() => setRows((rs) => rs.filter((x) => x.rid !== r.rid))}
                    >
                      <StockIcon name="trash" size={16} />
                    </button>
                    {r.error && (
                      <p role="alert" data-testid={`pos-stock-receive-error-${r.item.id}`} className="col-span-2 text-xs font-semibold text-[color:var(--color-danger)] @min-[608px]:col-span-6">
                        {r.error}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-[12px] border border-dashed px-4 py-6 text-center text-sm text-[color:var(--color-muted)]">{t("receive.empty")}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <button type="button" data-testid="pos-stock-receive-submit" className="btn btn-primary h-12 rounded-[12px] px-5 text-[15px]" disabled={busy || rows.length === 0} onClick={() => void submit()}>
              <StockIcon name="receive" size={16} />
              {busy ? t("saving") : t("receive.submit")}
            </button>
            <button type="button" data-testid="pos-stock-receive-clear" className="btn btn-ghost h-12 rounded-[12px] px-5" disabled={busy || rows.length === 0} onClick={() => setRows([])}>
              {t("receive.clear")}
            </button>
            <span className="ml-auto text-xs text-[color:var(--color-muted)]" data-testid="pos-stock-receive-total">
              {t("receive.total", { n: rows.length, value: formatBaht(total, { decimals: true }) })}
            </span>
          </div>
          <a data-testid="pos-stock-receive-po-link" href={invHref} className="self-start text-xs text-[color:var(--color-muted)] underline-offset-2 hover:underline">
            {t("receive.poLink")}
          </a>
        </>
      )}
    </section>
  );
}

// ═══════════ โอน ═══════════
type TfRow = { rid: string; item: ItemHit; qty: string; sent?: Sent; error?: string; saving?: boolean };

export function TransferCard({ target, meta, locationId, locName, onMove, compact }: Shared & { invHref: string; compact?: boolean }) {
  const t = useTranslations("pos.stock") as T;
  const refusal = useRefusalText();
  const locs = meta.locations;
  const [from, setFrom] = useState(locationId || locs[0]?.id || "");
  const [to, setTo] = useState(locs.find((l) => l.id !== (locationId || locs[0]?.id))?.id ?? "");
  const [rows, setRows] = useState<TfRow[]>([]);
  const [busy, setBusy] = useState(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  useEffect(() => {
    if (!locationId) return;
    setFrom(locationId);
    setTo((cur) => (cur && cur !== locationId ? cur : (locs.find((l) => l.id !== locationId)?.id ?? "")));
  }, [locationId, locs]);
  const single = locs.length < 2;
  const patch = (rid: string, p: Partial<TfRow>) => setRows((rs) => rs.map((r) => (r.rid === rid ? { ...r, ...p } : r)));
  const add = (item: ItemHit) =>
    setRows((rs) => {
      const same = rs.find((r) => r.item.id === item.id && !r.saving);
      if (same) return rs.map((r) => (r === same ? { ...r, qty: String((parseCount(r.qty) ?? 0) + 1), error: undefined } : r));
      return [...rs, { rid: newKey(), item, qty: "1" }];
    });
  const submit = async () => {
    if (busy || single || !from || !to || from === to) return;
    setBusy(true);
    let last: SessionMove | null = null;
    for (const r0 of rowsRef.current) {
      const r = rowsRef.current.find((x) => x.rid === r0.rid);
      if (!r) continue;
      const qty = parseCount(r.qty);
      if (qty === null || qty < 1) {
        patch(r.rid, { error: t("badQty") });
        continue;
      }
      const input = { itemId: r.item.id, qty, fromLocationId: from, toLocationId: to };
      const sent = keyFor(r.sent, JSON.stringify(input));
      patch(r.rid, { sent, saving: true, error: undefined });
      const res = await posStockTransferAction({ ...target, input: { ...input, idempotencyKey: sent.key } }).catch(() => null);
      if (res && res.ok) {
        setRows((rs) => rs.filter((x) => x.rid !== r.rid));
        last = { id: res.movementIds[0], kind: "transfer", name: r.item.name, qty, at: new Date().toISOString(), detail: `${locName(from)} → ${locName(to)}` };
      } else {
        patch(r.rid, { saving: false, error: refusal(res ? res.code : "INTERNAL") });
      }
    }
    if (last) onMove(last); // F6: ประวัติโหลดใหม่ครั้งเดียวหลังส่งครบทุกแถว
    setBusy(false);
  };
  const sfx = compact ? "-c" : "";
  const sel = (end: "from" | "to", label: string, value: string, set: (v: string) => void) => (
    <label className="flex min-w-0 flex-1 flex-col rounded-[12px] border px-3.5 py-2">
      <span className="text-[11px] text-[color:var(--color-muted)]">{label}</span>
      <select data-testid={`pos-stock-transfer${sfx}-${end}`} className="min-h-7 w-full bg-transparent text-sm font-bold outline-none" value={value} disabled={single} onChange={(e) => set(e.target.value)}>
        {locs.length === 0 && <option value="">{t("defaultLocation")}</option>}
        {locs.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className={`card flex flex-col gap-4 ${compact ? "p-6" : ""}`} data-testid={`pos-stock-transfer${sfx}-card`}>
      <CardHead icon="transfer" title={t("transfer.title")} />
      {!meta.can.transfer ? (
        <Denied kind="transfer" />
      ) : single ? (
        <p data-testid={`pos-stock-transfer${sfx}-single`} className="rounded-[12px] border border-dashed px-4 py-4 text-sm text-[color:var(--color-muted)]">
          {t("transfer.single")}
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {sel("from", t("transfer.from"), from, setFrom)}
            <RegisterIcon name="arrow" size={16} className="shrink-0 text-[color:var(--color-muted)]" />
            {sel("to", t("transfer.to"), to, setTo)}
          </div>
          {from === to && <p className="text-xs text-[color:var(--color-danger)]">{t("transfer.sameLocation")}</p>}
          <ItemPicker target={target} kind={compact ? "transfer-c" : "transfer"} data-testid={`pos-stock-transfer${sfx}-picker`} placeholder={t("transfer.searchPlaceholder")} onPick={add} />
          {rows.length > 0 && (
            <ul data-testid={`pos-stock-transfer${sfx}-rows`}>
              {rows.map((r) => (
                <li key={r.rid} className="border-b py-2 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{r.item.name}</span>
                    <span className="text-sm font-bold">×</span>
                    <input
                      data-testid={`pos-stock-transfer${sfx}-qty-${r.item.id}`}
                      inputMode="numeric"
                      aria-label={t("transfer.qtyFor", { name: r.item.name })}
                      className="h-11 w-16 rounded-[10px] border text-center text-sm font-bold tabular-nums outline-none focus:border-[color:var(--color-accent)]"
                      value={r.qty}
                      onChange={(e) => patch(r.rid, { qty: e.target.value })}
                    />
                    <button type="button" data-testid={`pos-stock-transfer${sfx}-remove-${r.item.id}`} aria-label={t("remove")} disabled={r.saving} className="grid h-11 w-11 place-items-center rounded-[10px] text-[color:var(--color-muted)]" onClick={() => setRows((rs) => rs.filter((x) => x.rid !== r.rid))}>
                      <RegisterIcon name="x" size={14} />
                    </button>
                  </div>
                  {r.error && (
                    <p role="alert" data-testid={`pos-stock-transfer${sfx}-error-${r.item.id}`} className="mt-1 text-xs text-[color:var(--color-danger)]">
                      {r.error}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" data-testid={`pos-stock-transfer${sfx}-submit`} className="btn btn-primary h-12 rounded-[12px] px-5" disabled={busy || rows.length === 0 || from === to} onClick={() => void submit()}>
              <StockIcon name="transfer" size={16} />
              {busy ? t("saving") : t("transfer.submit")}
            </button>
            <span className="text-xs text-[color:var(--color-muted)]">{t("transfer.hint")}</span>
          </div>
        </>
      )}
    </section>
  );
}

// ═══════════ ปรับสต็อก ═══════════
const REASONS = ["spoiled", "damaged", "miscount", "internal", "other"] as const;

export function AdjustCard({ target, meta, locationId, locName, onMove, compact }: Shared & { compact?: boolean }) {
  const t = useTranslations("pos.stock") as T;
  const locale = useLocale();
  const refusal = useRefusalText();
  const [item, setItem] = useState<ItemHit | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState<(typeof REASONS)[number]>("spoiled");
  const [text, setText] = useState("");
  const [loc, setLoc] = useState(locationId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const sent = useRef<Sent | undefined>(undefined);
  useEffect(() => setLoc(locationId), [locationId]);
  const d = parseSigned(delta);
  const label = t(`adjust.reasons.${reason}`);
  const stored = `${label}${text.trim() ? ` · ${text.trim()}` : ""}`;
  const tooLong = stored.length > STOCK_COUNT_REASON_MAX;
  const step = (n: number) => setDelta(String((d ?? 0) + n));
  const sfx = compact ? "-c" : "";
  const submit = async () => {
    if (busy || !item) return;
    if (d === null || d === 0) return setError(t("adjust.badDelta"));
    if (tooLong) return setError(t("adjust.reasonTooLong"));
    const input = { itemId: item.id, deltaQty: d, reason: stored, ...(loc ? { locationId: loc } : {}) };
    sent.current = keyFor(sent.current, JSON.stringify(input));
    setBusy(true);
    setError(null);
    setOk(null);
    const res = await posStockAdjustAction({ ...target, input: { ...input, idempotencyKey: sent.current.key } }).catch(() => null);
    setBusy(false);
    if (res && res.ok) {
      sent.current = undefined;
      onMove({ id: res.movementId, kind: "adjust", name: item.name, qty: d, at: new Date().toISOString(), detail: stored });
      setItem({ ...item, onHand: item.onHand + d });
      setDelta("");
      setText("");
      setOk(t("adjust.saved", { name: item.name, delta: fmtDelta(d, false, locale) }));
    } else setError(refusal(res ? res.code : "INTERNAL"));
  };
  return (
    <section className={`card flex flex-col gap-4 ${compact ? "p-6" : ""}`} data-testid={`pos-stock-adjust${sfx}-card`}>
      <CardHead icon="adjust" title={t("adjust.title")} />
      {!meta.can.adjust ? (
        <Denied kind={compact ? "adjust-c" : "adjust"} />
      ) : (
        <>
          {item ? (
            <div className="flex items-center gap-3 rounded-[12px] border px-3.5 py-3" data-testid={`pos-stock-adjust${sfx}-item`}>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm font-bold">{item.name}</b>
                <span className="block truncate text-[11.5px] text-[color:var(--color-muted)]">
                  {item.sku} · {locName(loc)}
                </span>
              </span>
              <span className="shrink-0 text-lg font-bold tabular-nums" title={t("adjust.totalHint")}>
                {fmtInt(item.onHand, locale)}
                {d !== null && d !== 0 && (
                  <>
                    <span className="mx-1 text-sm font-normal text-[color:var(--color-muted)]">→</span>
                    <span className={item.onHand + d < item.onHand ? "text-[color:var(--color-danger)]" : ""}>{fmtInt(item.onHand + d, locale)}</span>
                  </>
                )}
              </span>
              <button type="button" data-testid={`pos-stock-adjust${sfx}-clear`} aria-label={t("remove")} className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-[color:var(--color-muted)]" onClick={() => setItem(null)}>
                <RegisterIcon name="x" size={14} />
              </button>
            </div>
          ) : (
            <ItemPicker
              target={target}
              kind={compact ? "adjust-c" : "adjust"}
              data-testid={`pos-stock-adjust${sfx}-picker`}
              placeholder={t("adjust.searchPlaceholder")}
              onPick={(h) => {
                setItem(h);
                setError(null);
                setOk(null);
              }}
            />
          )}
          <div className="flex items-center gap-2">
            <button type="button" data-testid={`pos-stock-adjust${sfx}-minus`} aria-label={t("adjust.minus")} className="grid h-11 w-11 place-items-center rounded-[10px] border" onClick={() => step(-1)}>
              <RegisterIcon name="minus" size={14} />
            </button>
            <input
              data-testid={`pos-stock-adjust${sfx}-delta`}
              inputMode="numeric"
              aria-label={t("adjust.delta")}
              placeholder={t("adjust.deltaPlaceholder")}
              className="input h-11 flex-1 text-center text-[15px] font-bold tabular-nums"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
            />
            <button type="button" data-testid={`pos-stock-adjust${sfx}-plus`} aria-label={t("adjust.plus")} className="grid h-11 w-11 place-items-center rounded-[10px] border" onClick={() => step(1)}>
              <RegisterIcon name="plus" size={14} />
            </button>
          </div>
          <label className="flex h-12 items-center gap-1.5 rounded-[12px] border px-3.5 text-sm">
            <span className="text-[color:var(--color-muted)]">{t("adjust.reason")}:</span>
            <select data-testid={`pos-stock-adjust${sfx}-reason`} className="min-w-0 flex-1 bg-transparent font-bold outline-none" value={reason} onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])}>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(`adjust.reasons.${r}`)}
                </option>
              ))}
            </select>
          </label>
          <input data-testid={`pos-stock-adjust${sfx}-text`} className="input h-11" placeholder={t("adjust.textPlaceholder")} maxLength={STOCK_COUNT_REASON_MAX} value={text} onChange={(e) => setText(e.target.value)} />
          <label className="flex h-11 items-center gap-1.5 rounded-[10px] border px-3 text-sm">
            <span className="text-[color:var(--color-muted)]">{t("location")}:</span>
            <select data-testid={`pos-stock-adjust${sfx}-location`} className="min-w-0 flex-1 bg-transparent font-semibold outline-none" value={loc} onChange={(e) => setLoc(e.target.value)}>
              {meta.locations.length === 0 && <option value="">{t("defaultLocation")}</option>}
              {meta.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <p className="rounded-[10px] border border-dashed px-3 py-2 text-xs text-[color:var(--color-muted)]">{t("adjust.noGl")}</p>
          {error && (
            <p role="alert" data-testid={`pos-stock-adjust${sfx}-error`} className="text-sm text-[color:var(--color-danger)]">
              {error}
            </p>
          )}
          {ok && (
            <p role="status" data-testid={`pos-stock-adjust${sfx}-ok`} className="text-sm text-[color:var(--color-muted)]">
              {ok}
            </p>
          )}
          <button type="button" data-testid={`pos-stock-adjust${sfx}-submit`} className="btn btn-ghost h-12 self-start rounded-[12px] px-5" disabled={busy || !item || d === null || d === 0} onClick={() => void submit()}>
            {busy ? t("saving") : t("adjust.submit")}
          </button>
        </>
      )}
    </section>
  );
}

// ═══════════ ประวัติล่าสุด ═══════════
type HistoryOk = Extract<Awaited<ReturnType<typeof posStockHistoryAction>>, { ok: true }>;
type Move = NonNullable<HistoryOk["movements"]>[number];
type Entry = { at: string; move?: Move; count?: StockCountView };
const MOVE_ICON = { IN: "receive", OUT: "out", ADJUST: "adjust", TRANSFER: "transfer" } as const;
const MOVE_KEY = { IN: "receive", OUT: "out", ADJUST: "adjust", TRANSFER: "transfer" } as const;

/** รอบตรวจนับของสาขา + การเคลื่อนไหวล่าสุดของคลัง (posStockHistoryAction — คำขอเดียว) เรียงใหม่สุดก่อน */
export function HistoryPanel({
  target,
  meta,
  full,
  confirmedHere,
  invHref,
  onResume,
}: {
  target: Target;
  meta: StockCountMeta;
  full: boolean;
  confirmedHere: Record<string, number>;
  invHref: string;
  onResume: () => void;
}) {
  const t = useTranslations("pos.stock") as T;
  const locale = useLocale();
  const refusal = useRefusalText();
  const [data, setData] = useState<HistoryOk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const limit = full ? 50 : 6;
  useEffect(() => {
    let live = true;
    void posStockHistoryAction({ ...target, limit })
      .catch(() => null)
      .then((r) => {
        if (!live) return;
        if (r && r.ok) {
          setError(null);
          setData(r);
        } else setError(refusal(r ? r.code : "INTERNAL"));
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.systemId, target.unitId, limit, tick]);
  const locName = (id: string | null) => meta.locations.find((l) => l.id === id)?.name ?? t("defaultLocation");
  const entries: Entry[] = data
    ? [
        ...(data.movements ?? []).map((m): Entry => ({ at: m.createdAt, move: m })),
        ...(data.counts ?? []).map((c): Entry => ({ at: c.confirmedAt ?? c.cancelledAt ?? c.snapshotAt, count: c })),
      ]
        .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
        .slice(0, limit)
    : [];
  const seeAll = (
    <a data-testid="pos-stock-history-all" href={invHref} className="shrink-0 text-sm font-semibold text-[color:var(--color-accent)]">
      {t("history.all")}
    </a>
  );
  return (
    <section className={`card flex flex-col gap-3 ${full ? "" : "p-6"}`} data-testid="pos-stock-history">
      <CardHead icon="history" title={t("history.title")} right={seeAll} />
      {/* ผู้คุมงาน R2 (4): บอกขอบเขต — คลังที่หลายสาขาใช้ร่วมเห็นของทุกสาขา */}
      <p data-testid="pos-stock-history-scope" className="-mt-1 text-xs text-[color:var(--color-muted)]">
        {t("history.scopeNote")}
      </p>
      <ul className="flex flex-col">
        {!data && !error && <li className="py-3 text-sm text-[color:var(--color-muted)]">{t("loading")}</li>}
        {entries.map(({ move: m, count: c }) =>
          m ? (
            <li key={`m-${m.id}`} className="flex items-center gap-3 border-b py-3 last:border-0" data-testid={`pos-stock-history-move-${m.id}`}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border text-[color:var(--color-ink-soft)]">
                <StockIcon name={MOVE_ICON[m.type]} size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm font-semibold">{t(`history.${MOVE_KEY[m.type]}`, { name: m.itemName })}</b>
                <span className="block truncate text-xs text-[color:var(--color-muted)]">
                  {bkkDayHm(m.createdAt, locale)} · {locName(m.locationId)}
                  {m.note ? ` · ${m.note}` : ""}
                </span>
              </span>
              <b className={`shrink-0 text-sm tabular-nums ${m.qtyDelta < 0 ? "text-[color:var(--color-danger)]" : ""}`}>{fmtDelta(m.qtyDelta, false, locale)}</b>
            </li>
          ) : c ? (
            <li key={`c-${c.id}`} className="flex items-center gap-3 border-b py-3 last:border-0" data-testid={`pos-stock-history-count-${c.id}`}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border text-[color:var(--color-ink-soft)]">
                <StockIcon name="count" size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm font-semibold">{t("history.count", { no: c.countNo })}</b>
                <span className="block truncate text-xs text-[color:var(--color-muted)]">
                  {bkkDayHm(c.confirmedAt ?? c.cancelledAt ?? c.snapshotAt, locale)} · {locName(c.locationId)} · {t(`history.status.${c.status}`)}
                  {c.status === "CONFIRMED" && confirmedHere[c.id] !== undefined ? ` · ${t("history.adjusted", { n: confirmedHere[c.id]! })}` : ""}
                </span>
              </span>
              {c.status === "OPEN" && meta.can.count ? (
                <button type="button" data-testid="pos-stock-history-resume" className="btn btn-ghost h-11 shrink-0 rounded-[10px] px-3" onClick={onResume}>
                  {t("history.resume")}
                </button>
              ) : null}
            </li>
          ) : null,
        )}
        {data && entries.length === 0 && <li className="py-3 text-sm text-[color:var(--color-muted)]">{t("history.empty")}</li>}
      </ul>
      {error && (
        <div className="flex items-center gap-2">
          <p role="alert" className="text-xs text-[color:var(--color-danger)]">
            {error}
          </p>
          <button type="button" data-testid="pos-stock-history-retry" className="btn btn-ghost h-11 px-3" onClick={() => setTick((n) => n + 1)}>
            {t("retry")}
          </button>
        </div>
      )}
    </section>
  );
}
