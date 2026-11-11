"use client";

// QrOrderBits.tsx — ชิ้นส่วน QR ของจอ 09 (POS P2.7U · บรีฟ P2.7 §5): การ์ดรอบ QR โต๊ะ · แถวเสร็จของรอบ QR · รายการย่อย "รอชำระ" ·
//   ชิปจ่ายแล้ว (PREPAID) · แบนเนอร์เงินเข้าหลังหมดเวลา (S5)
//   การ์ดรอบ QR โต๊ะ = ลิงก์เปิดโต๊ะ (/pos/tables?open=<session>) — เก็บเงินรวมกับบิลโต๊ะ (ไม่มีปุ่มรับ/ปฏิเสธ)
//   รอชำระ = ออเดอร์จ่ายก่อนที่เงินยังไม่เข้า: นับถอยหลังถึงหมดเวลาจ่าย · ลูกค้าแจ้งโอน = ชิป "ตรวจยอด" + ยืนยันรับเงิน (confirmPaymentIntentManual · กติกาผู้จัดการเดิม) · ยกเลิก (= ปฏิเสธ)
//   🔴 ไม่มีข้อความไทยนอก t() · เวลาวาดหลัง mount (now = null ก่อน mount) · ยอดมาจากเซิร์ฟเวอร์

import { useTranslations } from "next-intl";
import { moneyText } from "@/lib/modules/pos/register-shared";
import type { OrderCard } from "@/lib/modules/pos/order-shared";
import type { QrTableRoundCard } from "@/lib/modules/pos/qr-staff-shared";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { bkkClock, isClaimedCard, mmss, payLeftSec, ORDERS_ACCEPT_RED_SEC } from "./orders-ui";

/** การ์ดรอบ QR โต๊ะ (ภาพ 09: "QR โต๊ะ B2 · #18 · ครัวกำลังทำ 0/2 · เก็บเงินรวมกับบิลโต๊ะ") */
export function QrRoundCardView({ round: r, now, to }: { round: QrTableRoundCard; now: number | null; to: string }) {
  const t = useTranslations("pos.orders");
  const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
  return (
    <li className="list-none">
      <a
        href={to}
        data-testid={`pos-ord-qr-round-${r.orderId}`}
        data-column={r.column}
        className="@container flex min-h-11 flex-col gap-1.5 rounded-[16px] border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-3"
      >
        <span className="flex w-full min-w-0 items-center gap-1.5">
          <span className="inline-flex min-w-9 shrink items-center rounded-[8px] border border-[color:var(--color-line)] px-1.5 text-[12px] leading-[22px] text-[color:var(--color-ink-soft)]">
            <span className="truncate">{t("qr.chip")}</span>
          </span>
          <b className="min-w-0 truncate text-[14px]">{t("qr.roundRef", { table: r.tableName, no: r.dailyNo })}</b>
          <span className="ml-auto shrink-0 pl-1 text-[12.5px] tabular-nums text-[color:var(--color-muted)]">{now !== null ? bkkClock(r.at) : ""}</span>
        </span>
        <span className="text-[13.5px] text-[color:var(--color-ink-soft)]">{t.rich("card.items", { count: r.itemCount, amount: moneyText(r.totalSatang), b: (x) => <b className="text-[color:var(--color-ink)]">{x}</b> })}</span>
        <span className="flex items-center gap-2 text-[12px] text-[color:var(--color-ink-soft)]">
          <span className="shrink-0 tabular-nums">{r.column === "ready" ? t("qr.ready", { done: r.done, total: r.total }) : t("qr.kitchen", { done: r.done, total: r.total })}</span>
          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[color:var(--color-surface-2)]">
            <span className="block h-full rounded-full bg-[color:var(--color-ink)]" style={{ width: `${pct}%` }} />
          </span>
        </span>
        <span className="text-[12.5px] text-[color:var(--color-muted)]">{t("qr.collectWithTable")}</span>
      </a>
    </li>
  );
}

/** แถวเสร็จวันนี้ของรอบ QR โต๊ะ (ภาพ 09: "QR โต๊ะ A4 · #7 · หน้าร้าน QR · 11:58 · ฿455") */
export function QrRoundDoneRow({ round: r, now, to }: { round: QrTableRoundCard; now: number | null; to: string }) {
  const t = useTranslations("pos.orders");
  return (
    <li className="list-none border-b last:border-0">
      <a href={to} data-testid={`pos-ord-qr-done-${r.orderId}`} className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left">
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="truncate text-[13px]">{`${t("qr.chip")} ${t("qr.roundRef", { table: r.tableName, no: r.dailyNo })}`}</b>
          <span className="truncate text-[12px] text-[color:var(--color-muted)]">
            {t("rail.qrTable")}
            {now !== null ? ` · ${bkkClock(r.at)}` : ""}
          </span>
        </span>
        <b className="shrink-0 text-[13px] tabular-nums">{moneyText(r.totalSatang)}</b>
      </a>
    </li>
  );
}

/** ชิป "จ่ายแล้ว · พร้อมเพย์ ฿x" ของออเดอร์จ่ายก่อน */
export function PrepaidChip({ card: c }: { card: OrderCard }) {
  const t = useTranslations("pos.orders");
  return (
    <span data-testid={`pos-ord-prepaid-${c.ref}`} className="inline-flex self-start items-center gap-1 rounded-[8px] border-[1.5px] border-[color:var(--color-ink)] px-2 py-0.5 text-[12px] font-bold text-[color:var(--color-ink)]">
      <RegisterIcon name="check" size={12} />
      {t("prepaid.chip", { amount: moneyText(c.totalSatang) })}
    </span>
  );
}

/** รายการย่อย "รอชำระ N" ใต้หัวคอลัมน์ใหม่ (จาง · ไม่นับในคอลัมน์ใหม่) */
export function AwaitingPayList(p: {
  cards: readonly OrderCard[];
  now: number | null;
  busy: boolean;
  canReject: boolean;
  canConfirm: boolean;
  managerOnly: boolean;
  selectedId: string | null;
  onPick: (c: OrderCard) => void;
  onConfirm: (c: OrderCard) => void;
  onCancel: (c: OrderCard) => void;
}) {
  const t = useTranslations("pos.orders");
  if (!p.cards.length) return null;
  return (
    <section data-testid="pos-ord-awaiting" aria-label={t("awaiting.title")} className="flex flex-col gap-1.5 rounded-[14px] border border-dashed bg-[color:var(--color-surface-2)] p-2">
      <h4 className="flex items-center gap-2 px-1 text-[12.5px] font-bold text-[color:var(--color-ink-soft)]">
        {t("awaiting.title")}
        <span className="inline-grid h-5 min-w-5 place-items-center rounded-full bg-[color:var(--color-surface)] px-1.5 text-[11px] tabular-nums">{p.cards.length}</span>
      </h4>
      <p className="px-1 text-[11.5px] leading-[1.45] text-[color:var(--color-muted)]">{t("awaiting.hint")}</p>
      <ul className="flex flex-col gap-1.5">
        {p.cards.map((c) => {
          const left = p.now !== null ? payLeftSec(c, p.now) : null;
          const claimed = isClaimedCard(c);
          return (
            <li key={c.id} className={`list-none rounded-[12px] border bg-[color:var(--color-surface)] p-2 opacity-90 ${p.selectedId === c.id ? "ring-2 ring-[color:var(--color-accent)]" : ""}`}>
              <button type="button" data-testid={`pos-ord-await-card-${c.ref}`} aria-pressed={p.selectedId === c.id} className="flex min-h-11 w-full flex-col gap-0.5 text-left" onClick={() => p.onPick(c)}>
                <span className="flex w-full items-center gap-1.5">
                  <b className="min-w-0 truncate text-[13px]">{c.ref}</b>
                  <b className="ml-auto shrink-0 text-[13px] tabular-nums">{moneyText(c.totalSatang)}</b>
                </span>
                <span className="truncate text-[12px] text-[color:var(--color-muted)]">{c.phoneMasked ? `${c.customerName} · ${c.phoneMasked}` : c.customerName}</span>
                {left !== null ? (
                  <span data-testid={`pos-ord-await-left-${c.ref}`} className={`inline-flex items-center gap-1 text-[12px] tabular-nums ${left < ORDERS_ACCEPT_RED_SEC ? "font-bold text-[color:var(--color-danger)]" : "text-[color:var(--color-ink-soft)]"}`}>
                    <RegisterIcon name="clock" size={11} />
                    {left > 0 ? t("awaiting.left", { time: mmss(left) }) : t("awaiting.expiring")}
                  </span>
                ) : null}
                {/* POS P3.7U ▸ CD-P37U-5: ออเดอร์แชทที่ส่งลิงก์ชำระแล้ว (CHAT ∧ NEW ∧ PENDING_PAYMENT · จากสถานะออเดอร์ — POS ไม่มีตัวอ่านผลส่ง) + ชำระภายใน (หลัง mount) ◂ */}
                {c.channel.adapter === "CHAT" && c.channel.payout !== "PLATFORM" ? (
                  <span data-testid={`pos-ord-card-chatpay-${c.ref}`} className="mt-0.5 self-start rounded-[8px] bg-[color:var(--color-accent-soft)] px-2 py-0.5 text-[11.5px] font-bold text-[color:var(--color-accent)]">
                    {t("chatPay.requested", { amount: moneyText(c.totalSatang) })}
                    {c.prepay?.payBy && p.now !== null ? ` · ${t("chatPay.payBy", { time: bkkClock(c.prepay.payBy) })}` : ""}
                  </span>
                ) : null}
                {claimed ? (
                  <span data-testid={`pos-ord-claim-${c.ref}`} className="mt-0.5 self-start rounded-[8px] bg-[color:var(--color-accent-soft)] px-2 py-0.5 text-[11.5px] font-bold text-[color:var(--color-accent)]">
                    {t("awaiting.claimed")}
                  </span>
                ) : null}
              </button>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {claimed && c.prepay?.intentId ? (
                  <button
                    type="button"
                    data-testid={`pos-ord-await-confirm-${c.ref}`}
                    disabled={p.busy || !p.canConfirm}
                    title={!p.canConfirm ? t("awaiting.managerOnly") : undefined}
                    className="btn btn-primary h-11 grow whitespace-nowrap rounded-[12px] px-2 text-[13px] font-bold disabled:opacity-50"
                    onClick={() => p.onConfirm(c)}
                  >
                    {t("awaiting.confirm")}
                  </button>
                ) : null}
                <button
                  type="button"
                  data-testid={`pos-ord-await-cancel-${c.ref}`}
                  disabled={p.busy || !p.canReject}
                  title={!p.canReject ? t("perm.reject") : undefined}
                  className="btn btn-ghost h-11 grow whitespace-nowrap rounded-[12px] px-2 text-[13px] disabled:opacity-50"
                  onClick={() => p.onCancel(c)}
                >
                  {t("awaiting.cancel")}
                </button>
              </div>
              {claimed && p.managerOnly ? <p className="mt-1 px-0.5 text-[11px] text-[color:var(--color-muted)]">{t("awaiting.managerOnly")}</p> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** แบนเนอร์เงินเข้าหลังหมดเวลา/ออเดอร์ปิดแล้ว (S5) — ต่อออเดอร์ */
export function LateMoneyBanner({ card: c, onPick }: { card: OrderCard; onPick: () => void }) {
  const t = useTranslations("pos.orders");
  return (
    <div data-testid={`pos-ord-late-${c.ref}`} role="alert" className="flex flex-wrap items-center gap-3 border-b bg-[color:var(--color-surface-2)] px-5 py-2.5 text-[13.5px]">
      <RegisterIcon name="flag" size={14} className="text-[color:var(--color-danger)]" />
      <span className="min-w-0 flex-1 text-[color:var(--color-danger)]">{t("late.banner", { amount: moneyText(c.totalSatang), ref: c.prepay?.intentId ?? "-", order: c.ref })}</span>
      <button type="button" data-testid={`pos-ord-late-open-${c.ref}`} className="btn btn-ghost h-11 rounded-[12px] px-4 text-[13.5px] font-bold" onClick={onPick}>
        {t("late.open")}
      </button>
    </div>
  );
}
