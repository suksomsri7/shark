"use client";

// TablePanel.tsx — แผง "โต๊ะ A5" (POS P2.4U · ภาพ 03 ขวา · มติ 3) — เดสก์ท็อป = คอลัมน์ขวา · iPad = แผ่นขวา · มือถือ = เต็มจอ (ผู้เรียกจัดกรอบ)
//   หัว: ชื่อ + ป้ายสถานะ + "⋯" (ปิดโต๊ะ · เก็บโต๊ะ · ผูกสมาชิก) · บรรทัด "เปิด hh:mm · N นาที · N คน · พนักงาน X / ลูกค้าเปิดเองผ่าน QR" · สมาชิก
//   รอบ (registerTableDetailAction): "ออเดอร์ #N (hh:mm) · …" + รายการ (จำนวน · ชื่อ · ตัวเลือก/หมายเหตุ · ชิปครัว · ฿) ·
//     เสิร์ฟแล้วเกิน 3 รายการในรอบ = ยุบเหลือ 2 + แถว "เสิร์ฟแล้วอีก N รายการ" (จำนวน + ชื่อเท่านั้น — fix 1 F1: ไม่รวมเงินในจอ · ยอดรวมของรอบ = P2.5) · แตะรายการที่ยกเลิกได้ = กล่องยกเลิก (เหตุผล)
//   รอบร่าง: "มีรายการยังไม่ส่งครัว N" + ปุ่มไปหน้าขายโหมดโต๊ะ · ยอด (รวม/ค่าบริการ/ยอดสุทธิ) จาก quote ของโต๊ะเท่านั้น ·
//   ปุ่ม: สั่งเพิ่ม · ย้ายโต๊ะ/รวมโต๊ะ/แยกบิล/พิมพ์ใบรายการ = ปิด + "เร็ว ๆ นี้" (Q7) · หลัก "เช็คบิล ฿x"
//   บรรทัดที่ quote บอก stockCut:false = ป้าย "ไม่ได้ตัดวัตถุดิบตามสูตร" (fix-3)
// 🔴 เงินทุกตัวมาจากเซิร์ฟเวอร์ (lineTotalSatang ของรายการ · quote ของโต๊ะ) · นาที/เวลาวาดหลัง mount เท่านั้น

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { moneyText, type RegisterQuote } from "@/lib/modules/pos/register-shared";
import type { RegisterTableDetailResult, TableCard, TableRoundItem, TableServiceCharge } from "@/lib/modules/pos/table-shared";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { bkkClock, minutesSince } from "./table-ui";

type Detail = Extract<RegisterTableDetailResult, { ok: true }>;

type Props = {
  card: TableCard;
  detail: Detail | null;
  detailError: string | null;
  quote: RegisterQuote | null;
  quoteError: string | null;
  serviceCharge: TableServiceCharge | null;
  staffName: (userId: string | null) => string | null;
  now: number | null;
  busy: boolean;
  /** เหตุผลที่เช็คบิลไม่ได้ (ไม่มีสิทธิ์ขาย/ยังไม่เปิดกะ/ต้องปลดล็อก) — null = เช็คบิลได้ */
  checkoutBlock: React.ReactNode | null;
  orderMoreHref: string | null;
  onOpen: () => void;
  onSeat: () => void;
  onClear: () => void;
  onCheckout: () => void;
  onCancelItem: (item: TableRoundItem) => void;
  onCloseTable: () => void;
  onLinkMember: (() => void) | null;
  onUnlinkMember: (() => void) | null;
  onViewBooking: () => void;
  onClose?: () => void;
};

const KDS_TONE: Record<TableRoundItem["kdsStatus"], string> = {
  NEW: "border text-[color:var(--color-muted)]",
  COOKING: "border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]",
  READY: "border border-[color:var(--color-ink)] text-[color:var(--color-ink)]",
  SERVED: "border-[1.5px] border-[color:var(--color-ink)] font-bold text-[color:var(--color-ink)]",
  CANCELLED: "border text-[color:var(--color-muted)] line-through",
};
const PILL: Record<TableCard["state"], string> = {
  FREE: "border text-[color:var(--color-muted)]",
  DINING: "border-[1.5px] border-[color:var(--color-ink)] font-bold",
  BILL_REQUESTED: "border-[1.5px] border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] font-bold text-[color:var(--color-accent)]",
  NEEDS_CLEARING: "border border-dashed text-[color:var(--color-muted)]",
  RESERVED: "border text-[color:var(--color-muted)]",
  INACTIVE: "border text-[color:var(--color-muted)]",
};
const pct = (bp: number) => String(Number((bp / 100).toFixed(2)));
const SERVED_SHOWN = 2;
/** ปุ่ม PLANNED (Q7 · P2.5/P2.6): ปิด + ป้าย "เร็ว ๆ นี้" ใต้ชื่อ */
const PLANNED = "btn-sm flex h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-[12px] px-1.5 text-[13px] text-[color:var(--color-muted)] opacity-80";

export function TablePanel(p: Props) {
  const t = useTranslations("pos.tables");
  const tm = useTranslations("pos.member");
  const tr = useTranslations("pos.register");
  const c = p.card;
  const d = p.detail;
  const [menu, setMenu] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const menuBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (menuBox.current && !menuBox.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  useEffect(() => setExpanded(new Set()), [c.id]);

  const notCut = new Set<string>();
  if (p.quote?.table) p.quote.lines.forEach((l, i) => l.stockCut === false && p.quote?.table?.itemIds[i] && notCut.add(p.quote.table.itemIds[i]!));

  const head = (
    <div className="flex items-center gap-2.5 border-b px-4 py-3">
      <h2 className="text-[18px] font-bold text-[color:var(--color-ink)]">{t("panel.title", { name: c.name })}</h2>
      <span data-testid="pos-tbl-panel-state" className={`inline-flex h-7 items-center rounded-[8px] px-2.5 text-[12.5px] ${PILL[c.state]}`}>
        {t(`state.${c.state}`)}
      </span>
      <span className="flex-1" />
      {d && (
        <div ref={menuBox} className="relative">
          <button
            data-testid="pos-tbl-panel-more"
            type="button"
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-label={t("panel.more")}
            className="grid size-11 place-items-center rounded-[12px] border text-[18px] leading-none text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"
            onClick={() => setMenu((m) => !m)}
          >
            {"⋯"}
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-30 w-56 rounded-[12px] border bg-[color:var(--color-surface)] p-1.5 shadow-xl">
              <button
                data-testid="pos-tbl-menu-close"
                role="menuitem"
                type="button"
                disabled={p.busy}
                className="flex h-11 w-full items-center rounded-[8px] px-2.5 text-left text-[14px] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
                onClick={() => {
                  setMenu(false);
                  p.onCloseTable();
                }}
              >
                {t("actions.closeTable")}
              </button>
              {p.onLinkMember && (
                <button
                  data-testid="pos-tbl-menu-member"
                  role="menuitem"
                  type="button"
                  disabled={p.busy}
                  className="flex h-11 w-full items-center rounded-[8px] px-2.5 text-left text-[14px] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
                  onClick={() => {
                    setMenu(false);
                    p.onLinkMember?.();
                  }}
                >
                  {t("actions.linkMember")}
                </button>
              )}
              {p.onUnlinkMember && d.session.member && (
                <button
                  data-testid="pos-tbl-menu-unlink"
                  role="menuitem"
                  type="button"
                  disabled={p.busy}
                  className="flex h-11 w-full items-center rounded-[8px] px-2.5 text-left text-[14px] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
                  onClick={() => {
                    setMenu(false);
                    p.onUnlinkMember?.();
                  }}
                >
                  {t("panel.unlinkMember")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {p.onClose && (
        <button
          data-testid="pos-tbl-panel-close"
          type="button"
          aria-label={t("panel.close")}
          className="grid size-11 place-items-center rounded-[12px] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"
          onClick={p.onClose}
        >
          <RegisterIcon name="x" size={18} />
        </button>
      )}
    </div>
  );

  // ── โต๊ะที่ไม่มี session (ว่าง · ต้องเก็บ · จองไว้ · ปิดใช้งาน) ──
  if (!c.sessionId) {
    const res = c.reservation;
    return (
      <section data-testid="pos-tbl-panel" data-state={c.state} aria-label={t("panel.title", { name: c.name })} className="flex min-h-0 flex-col">
        {head}
        <div className="flex flex-col gap-3 px-4 py-4 text-[14px] text-[color:var(--color-ink-soft)]">
          {c.state === "INACTIVE" ? (
            <p>{t("panel.inactiveBody")}</p>
          ) : c.state === "NEEDS_CLEARING" ? (
            <p>{p.now !== null ? t("card.dirtyFor", { n: minutesSince(c.dirtySince, p.now) }) : t("state.NEEDS_CLEARING")}</p>
          ) : (
            <p>{t("panel.freeBody", { seats: c.seats })}</p>
          )}
          {res && p.now !== null && (
            <div className="rounded-[14px] border px-3.5 py-3">
              <p className="font-bold text-[color:var(--color-ink)]">{t("card.reservedLine", { time: bkkClock(res.at), name: res.name, n: res.partySize })}</p>
              <p className="text-[12.5px] text-[color:var(--color-muted)]">
                {t("card.holdFrom", { time: bkkClock(new Date(Date.parse(res.at) - res.holdFromMinutes * 60_000).toISOString()) })}
                {res.phone ? ` · ${res.phone}` : ""}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2 pt-1">
            {res && (
              <button data-testid="pos-tbl-panel-seat" type="button" disabled={p.busy} className="btn btn-primary h-12 rounded-[14px] text-[15px] font-bold" onClick={p.onSeat}>
                {t("reservation.seat")}
              </button>
            )}
            {c.state === "NEEDS_CLEARING" && (
              <button data-testid="pos-tbl-panel-clear" type="button" disabled={p.busy} className="btn btn-primary h-12 rounded-[14px] text-[15px] font-bold" onClick={p.onClear}>
                {t("actions.clearTable")}
              </button>
            )}
            {c.state !== "INACTIVE" && (
              <button
                data-testid="pos-tbl-panel-open"
                type="button"
                disabled={p.busy}
                className={`btn h-12 rounded-[14px] text-[15px] font-bold ${res || c.state === "NEEDS_CLEARING" ? "btn-ghost" : "btn-primary"}`}
                onClick={p.onOpen}
              >
                {t("card.open")}
              </button>
            )}
            {res && (
              <button data-testid="pos-tbl-panel-bookings" type="button" className="h-11 text-[13px] font-bold text-[color:var(--color-accent)]" onClick={p.onViewBooking}>
                {t("card.viewBooking")}
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  // ── โต๊ะที่มีลูกค้า ──
  const s = d?.session;
  const mins = p.now !== null && s ? minutesSince(s.openedAt, p.now) : null;
  const staff = s?.openedByStaff ? p.staffName(s.openedByUserId) : null;
  const guests = s?.guestCount ?? null;
  const opened =
    s && mins !== null
      ? s.openedByStaff
        ? staff
          ? t("panel.openedLine", { time: bkkClock(s.openedAt), minutes: mins, guests: guests ?? t("panel.guestsNone"), staff })
          : t("panel.openedLineNoStaff", { time: bkkClock(s.openedAt), minutes: mins, guests: guests ?? t("panel.guestsNone") })
        : `${t("panel.openedLineNoStaff", { time: bkkClock(s.openedAt), minutes: mins, guests: guests ?? t("panel.guestsNone") })} · ${t("panel.byQrGuest")}`
      : "";
  const q = p.quote;
  const scRate = p.serviceCharge?.posBp ?? 0;

  const itemRow = (it: TableRoundItem) => {
    const cancellable = !it.paid && it.kdsStatus !== "CANCELLED" && it.kdsStatus !== "SERVED";
    const sub = [...it.options.map((o) => o.name), it.note ?? ""].filter(Boolean).join(" · ");
    const body = (
      <>
        <span className="w-9 shrink-0 pt-0.5 text-[14px] tabular-nums text-[color:var(--color-ink-soft)]">{`×${it.qty}`}</span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[14px] ${it.kdsStatus === "CANCELLED" ? "text-[color:var(--color-muted)] line-through" : "text-[color:var(--color-ink)]"}`}>{it.name}</span>
          {sub && <span className="block truncate text-[12px] text-[color:var(--color-muted)]">{sub}</span>}
          {notCut.has(it.id) && (
            <span data-testid="pos-tbl-stock-not-cut" className="mt-0.5 inline-block rounded-[6px] border border-[color:var(--color-danger)] px-1.5 text-[11px] leading-[18px] text-[color:var(--color-danger)]">
              {t("panel.stockNotCut")}
            </span>
          )}
        </span>
        <span className={`inline-flex h-7 shrink-0 items-center rounded-[8px] px-2 text-[12px] ${it.paid ? "border text-[color:var(--color-muted)]" : KDS_TONE[it.kdsStatus]}`}>
          {it.paid ? t("panel.paid") : t(`panel.kds.${it.kdsStatus}`)}
        </span>
        <span className="w-[68px] shrink-0 text-right text-[14px] font-bold tabular-nums text-[color:var(--color-ink)]">{moneyText(it.lineTotalSatang)}</span>
      </>
    );
    return cancellable ? (
      <li key={it.id}>
        <button
          data-testid={`pos-tbl-item-${it.id}`}
          type="button"
          disabled={p.busy}
          aria-label={`${it.name} · ${t("actions.cancelItem")}`}
          className="flex min-h-11 w-full items-center gap-2 rounded-[10px] px-1 py-1.5 text-left hover:bg-[color:var(--color-surface-2)]"
          onClick={() => p.onCancelItem(it)}
        >
          {body}
        </button>
      </li>
    ) : (
      <li key={it.id} className="flex min-h-11 items-center gap-2 px-1 py-1.5">
        {body}
      </li>
    );
  };

  return (
    <section data-testid="pos-tbl-panel" data-state={c.state} aria-label={t("panel.title", { name: c.name })} className="flex min-h-0 flex-col">
      {head}
      <div className="border-b px-4 py-2.5 text-[12.5px] leading-[1.6] text-[color:var(--color-ink-soft)]">
        <p data-testid="pos-tbl-panel-opened">{opened || " "}</p>
        {s?.member && (
          <p data-testid="pos-tbl-panel-member">
            {t("panel.memberPrefix")} <b className="text-[color:var(--color-ink)]">{s.member.name || "—"}</b>
            {s.member.tier ? ` · ${s.member.tier}` : ""}
          </p>
        )}
      </div>

      {p.detailError && (
        <p role="alert" className="px-4 py-3 text-[13.5px] text-[color:var(--color-danger)]">
          {tr(p.detailError)}
        </p>
      )}

      <div data-testid="pos-tbl-rounds" className="flex flex-col gap-3 px-3 py-3">
        {d && d.rounds.length === 0 && <p className="px-1 text-[13.5px] text-[color:var(--color-muted)]">{t("panel.noRounds")}</p>}
        {d?.rounds.map((r) => {
          const served = r.items.filter((it) => it.kdsStatus === "SERVED" && !it.paid);
          const collapse = served.length > 3 && !expanded.has(r.orderId);
          const hidden = collapse ? served.slice(SERVED_SHOWN) : [];
          const hiddenIds = new Set(hidden.map((x) => x.id));
          return (
            <div key={r.orderId} data-testid={`pos-tbl-round-${r.dailyNo}`}>
              <p className="px-1 text-[12.5px] text-[color:var(--color-muted)]">
                <b className="text-[color:var(--color-ink)]">{t("panel.round", { no: r.dailyNo, time: p.now !== null ? bkkClock(r.createdAt) : "" })}</b>
                {" · "}
                {r.byStaff ? t("panel.roundByStaffAnon") : t("panel.roundByQr")}
              </p>
              <ul className="mt-1 flex flex-col">
                {r.items.filter((it) => !hiddenIds.has(it.id)).map(itemRow)}
                {collapse && (
                  <li>
                    <button
                      data-testid={`pos-tbl-served-more-${r.orderId}`}
                      type="button"
                      className="flex min-h-11 w-full items-center gap-2 rounded-[10px] px-1 text-left text-[12.5px] text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)]"
                      onClick={() => setExpanded((e) => new Set(e).add(r.orderId))}
                    >
                      <RegisterIcon name="chevron" size={12} />
                      <span className="min-w-0 flex-1 truncate">
                        {t("panel.servedMore", { n: hidden.length })}
                        {" · "}
                        {hidden.map((x) => x.name).join(" · ")}
                      </span>
                    </button>
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>

      {d?.draft && (
        <div data-testid="pos-tbl-draft" className="mx-4 mb-3 flex items-center gap-3 rounded-[14px] border border-[color:var(--color-danger)] px-3.5 py-2.5">
          <RegisterIcon name="warn" size={16} className="shrink-0 text-[color:var(--color-danger)]" />
          <span className="min-w-0 flex-1 text-[13.5px]">
            <b className="block text-[color:var(--color-danger)]">{t("panel.draftCount", { n: d.draft.lineCount })}</b>
            <span className="block text-[12px] text-[color:var(--color-muted)]">{t("panel.unsentWarning")}</span>
          </span>
          {p.orderMoreHref && (
            <Link data-testid="pos-tbl-draft-open" href={p.orderMoreHref} className="inline-flex h-11 shrink-0 items-center rounded-[12px] border px-3 text-[13px] font-bold">
              {t("panel.editDraft")}
            </Link>
          )}
        </div>
      )}

      <div data-testid="pos-tbl-totals" className="mt-auto border-t px-4 py-3 text-[14px]">
        <div className="flex justify-between py-0.5 text-[color:var(--color-ink-soft)]">
          <span>{t("panel.subtotal")}</span>
          <span className="tabular-nums">{q ? moneyText(q.subtotalSatang) : "—"}</span>
        </div>
        {(q?.tierDiscountSatang ?? 0) > 0 && (
          <div className="flex justify-between py-0.5 text-[color:var(--color-ink-soft)]">
            <span>{tm("chip.tierLine", { tier: s?.member?.tier ?? tm("chip.general") })}</span>
            <span className="tabular-nums text-[color:var(--color-danger)]">{moneyText(-(q?.tierDiscountSatang ?? 0))}</span>
          </div>
        )}
        {(q?.serviceChargeSatang ?? 0) > 0 && (
          <div className="flex justify-between py-0.5 text-[color:var(--color-ink-soft)]">
            <span>{t("panel.serviceCharge", { rate: pct(scRate) })}</span>
            <span className="tabular-nums">{moneyText(q?.serviceChargeSatang ?? 0)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between pt-1 text-[20px] font-bold text-[color:var(--color-ink)]">
          <span>{t("panel.net")}</span>
          <span data-testid="pos-tbl-net" className="tabular-nums">{q ? moneyText(q.grandTotalSatang) : "—"}</span>
        </div>
        {p.serviceCharge?.differs && (
          <p data-testid="pos-tbl-sc-differs" className="mt-1 text-[12px] text-[color:var(--color-muted)]">
            {t("panel.serviceChargeDiffers", { pos: pct(p.serviceCharge.posBp), restaurant: pct(p.serviceCharge.restaurantBp) })}
          </p>
        )}
        {p.quoteError && (
          <p role="alert" className="mt-1 text-[12.5px] text-[color:var(--color-danger)]">
            {tr(p.quoteError)}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 px-4">
        {p.orderMoreHref ? (
          <Link data-testid="pos-tbl-order-more" href={p.orderMoreHref} className="btn-sm inline-flex h-11 items-center justify-center gap-1.5 rounded-[12px] text-[13.5px] font-bold">
            <RegisterIcon name="plus" size={13} />
            {t("actions.orderMore")}
          </Link>
        ) : (
          <span />
        )}
        {(["moveTable", "mergeTable"] as const).map((k) => (
          <button key={k} data-testid={`pos-tbl-planned-${k}`} type="button" disabled aria-disabled="true" title={t("actions.planned")} className={PLANNED}>
            <span className="flex items-center gap-1">
              <RegisterIcon name={k === "moveTable" ? "swap" : "link"} size={12} />
              <span className="truncate">{t(`actions.${k}`)}</span>
            </span>
            <span className="text-[10.5px] leading-none">{t("actions.planned")}</span>
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-[1fr_2fr] gap-2 px-4">
        {(["splitBill", "printList"] as const).map((k) => (
          <button key={k} data-testid={`pos-tbl-planned-${k}`} type="button" disabled aria-disabled="true" title={t("actions.planned")} className={PLANNED}>
            <span className="flex items-center gap-1">
              <RegisterIcon name={k === "splitBill" ? "doc" : "print"} size={12} />
              <span className="truncate">{t(`actions.${k}`)}</span>
            </span>
            <span className="text-[10.5px] leading-none">{t("actions.planned")}</span>
          </button>
        ))}
      </div>
      <button
        data-testid="pos-tbl-checkout-open"
        type="button"
        disabled={!q || !!p.checkoutBlock || p.busy}
        className="btn btn-primary mx-4 mt-3 h-14 justify-between rounded-[16px] px-5 text-[18px] font-bold disabled:border disabled:bg-[color:var(--color-surface-2)] disabled:text-[color:var(--color-muted)]"
        onClick={p.onCheckout}
      >
        <span>{t("actions.checkout", { amount: "" }).trim()}</span>
        <span className="tabular-nums">{q ? moneyText(q.grandTotalSatang) : "—"}</span>
      </button>
      {p.checkoutBlock && <div className="px-4 pt-1.5 text-[12.5px] text-[color:var(--color-danger)]">{p.checkoutBlock}</div>}
      <div className="h-3 shrink-0" />
    </section>
  );
}
