"use client";

// OrderCardView.tsx — การ์ดออเดอร์ในคอลัมน์ของจอ 09 (POS P2.8U · มติ 4) + แถวย่อของคอลัมน์ "เสร็จวันนี้"
//   หัว: ชิปช่องทาง (กรอบ · แพลตฟอร์ม = กรอบหนา) · เลขอ้างอิง · เวลาเข้า · บรรทัด "N รายการ · ฿x" · ลูกค้า + เบอร์ที่ปิดแล้ว (phoneMasked)
//   ใหม่: "รับภายใน m:ss" (แดงเมื่อเหลือ < 60 วิ · เดินจาก acceptBy ของเซิร์ฟเวอร์) + ปุ่ม รับออเดอร์ / ปฏิเสธ
//   กำลังเตรียม: "เตรียม · พร้อมใน N นาที" หรือแดง "เลยเวลาเตรียม N นาที" + "รับที่ร้าน hh:mm" · มาตรครัว = ชิป "เร็ว ๆ นี้" (P2.6)
//   พร้อม: ปุ่ม "ส่งมอบแล้ว" · แถวไรเดอร์ / "พิมพ์ใบปะหน้า" = ชิป "เร็ว ๆ นี้" (P3)
//   หมายเหตุลูกค้า = ชิปเทา · แชทยังไม่ชำระ = แถบ accent "สั่งผ่านแชท · รอยืนยันชำระ ฿x"
//   🔴 ตัวการ์ดเป็นปุ่มเดียว (pos-ord-card-<ref>) · ปุ่มย่อยเป็นพี่น้องใต้การ์ด (ไม่ซ้อนปุ่มในปุ่ม)
//   🔴 เวลา/ตัวนับวาดหลัง mount เท่านั้น (now = null ก่อน mount · HF-418) · ยอดมาจากการ์ดของเซิร์ฟเวอร์ (totalSatang) ไม่คิดเอง

import { useTranslations } from "next-intl";
import { moneyText } from "@/lib/modules/pos/register-shared";
import type { OrderCard } from "@/lib/modules/pos/order-shared";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { channelDisplayName } from "@/components/pos/settings/channel-text";
import { acceptLeftSec, bkkClock, mmss, ORDERS_ACCEPT_RED_SEC, prepState } from "./orders-ui";

export type CardPerms = { accept: boolean; reject: boolean };

/** ชิปช่องทาง (ภาพ 09: กรอบมน · แพลตฟอร์ม = กรอบดำหนา ตัวหนา · อื่น = กรอบจาง) */
export function ChannelChip({ code, name, payout, size = "md" }: { code: string; name: string; payout: "PLATFORM" | "DIRECT" | null; size?: "md" | "sm" }) {
  const tch = useTranslations("pos.channel");
  const strong = payout === "PLATFORM";
  return (
    <span
      className={`inline-flex min-w-0 shrink-0 items-center rounded-[8px] px-2 leading-[22px] ${size === "sm" ? "text-[11.5px]" : "text-[12.5px]"} ${
        strong ? "border-[1.5px] border-[color:var(--color-ink)] font-bold text-[color:var(--color-ink)]" : "border border-[color:var(--color-line)] text-[color:var(--color-ink-soft)]"
      }`}
    >
      <span className="truncate">{channelDisplayName(code, name, tch)}</span>
    </span>
  );
}

/** ชิป "เร็ว ๆ นี้" ของสิ่งที่ยังไม่มีในใบนี้ (มติ 4: มาตรครัว P2.6 · ไรเดอร์/ใบปะหน้า P3) */
export function PlannedChip({ label }: { label: string }) {
  const t = useTranslations("pos.orders");
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[8px] border border-dashed px-2 py-0.5 text-[11.5px] text-[color:var(--color-muted)]">
      <span className="truncate">{label}</span>
      <span className="shrink-0 rounded-[5px] bg-[color:var(--color-surface-2)] px-1 text-[10.5px]">{t("planned")}</span>
    </span>
  );
}

export function OrderCardView({
  card: c,
  selected,
  now,
  perms,
  busy,
  onPick,
  onAccept,
  onReject,
  onHandOver,
}: {
  card: OrderCard;
  selected: boolean;
  now: number | null;
  perms: CardPerms;
  busy: boolean;
  onPick: () => void;
  onAccept: () => void;
  onReject: () => void;
  onHandOver: () => void;
}) {
  const t = useTranslations("pos.orders");
  const left = now !== null ? acceptLeftSec(c, now) : null;
  const prep = now !== null ? prepState(c, now) : null;
  const webPaid = c.channel.adapter === "WEB" && c.paymentState === "PAID";
  const chatUnpaid = c.channel.adapter === "CHAT" && c.channel.payout !== "PLATFORM" && (c.paymentState === "UNPAID" || c.paymentState === "PAY_ON_PICKUP");
  const directUnpaid = !chatUnpaid && c.channel.payout !== "PLATFORM" && (c.paymentState === "UNPAID" || c.paymentState === "PAY_ON_PICKUP");
  const noAccept = !perms.accept ? t("perm.accept") : undefined;
  const noReject = !perms.reject ? t("perm.reject") : undefined;
  return (
    <li className="list-none">
      <div
        className={`flex flex-col gap-2 rounded-[16px] border bg-[color:var(--color-surface)] p-3 ${
          selected ? "border-transparent ring-2 ring-[color:var(--color-accent)]" : "border-[color:var(--color-line)]"
        }`}
      >
        <button
          type="button"
          data-testid={`pos-ord-card-${c.ref}`}
          data-status={c.status}
          data-late={prep?.late ? "1" : undefined}
          aria-pressed={selected}
          className="flex min-h-11 w-full flex-col gap-1 text-left"
          onClick={onPick}
        >
          <span className="flex w-full min-w-0 items-center gap-2">
            <ChannelChip code={c.channel.code} name={c.channel.name} payout={c.channel.payout} />
            <b className="min-w-0 truncate text-[14px]">{c.ref}</b>
            <span className="ml-auto shrink-0 text-[12px] tabular-nums text-[color:var(--color-muted)]">{now !== null ? bkkClock(c.receivedAt) : ""}</span>
          </span>
          <span className="text-[13.5px] text-[color:var(--color-ink-soft)]">
            {t.rich("card.items", { count: c.itemCount, amount: moneyText(c.totalSatang), b: (x) => <b className="text-[color:var(--color-ink)]">{x}</b> })}
          </span>
          {c.customerName ? (
            <span className="truncate text-[12.5px] text-[color:var(--color-muted)]">
              {c.phoneMasked ? `${c.customerName} · ${c.phoneMasked}` : c.customerName}
              {c.status !== "NEW" && c.fulfilment === "PICKUP" && c.prepDueAt && now !== null ? ` · ${t("card.pickupAt", { time: bkkClock(c.prepDueAt) })}` : ""}
            </span>
          ) : null}
          {left !== null && (
            <span
              data-testid={`pos-ord-card-timer-${c.ref}`}
              data-left={left}
              className={`inline-flex items-center gap-1 text-[12.5px] font-bold tabular-nums ${left < ORDERS_ACCEPT_RED_SEC ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-ink)]"}`}
            >
              <RegisterIcon name="clock" size={12} />
              {left > 0 ? t("card.acceptWithin", { time: mmss(left) }) : t("card.acceptLate")}
            </span>
          )}
          {prep && (
            <span className={`text-[12.5px] ${prep.late ? "font-bold text-[color:var(--color-danger)]" : "text-[color:var(--color-ink-soft)]"}`}>
              {prep.late ? t("card.prepLate", { n: prep.minutes }) : t("card.prepDue", { n: prep.minutes })}
            </span>
          )}
          {c.note ? <span className="rounded-[8px] bg-[color:var(--color-surface-2)] px-2 py-1 text-[12px] text-[color:var(--color-ink-soft)]">{c.note}</span> : null}
          {chatUnpaid ? (
            <span className="rounded-[8px] bg-[color:var(--color-accent-soft)] px-2 py-1 text-[12px] font-bold text-[color:var(--color-accent)]">{t("card.chatPayNote", { amount: moneyText(c.totalSatang) })}</span>
          ) : directUnpaid && c.status !== "NEW" ? (
            <span className="text-[12px] text-[color:var(--color-accent)]">{t(`payment.${c.paymentState}`)}</span>
          ) : null}
        </button>
        {(c.status === "ACCEPTED" || c.status === "PREPARING") && <PlannedChip label={t("card.kitchenMeter")} />}
        {c.status === "NEW" && (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button
              type="button"
              data-testid={`pos-ord-card-accept-${c.ref}`}
              disabled={busy || !perms.accept}
              title={noAccept}
              className="btn btn-primary h-11 rounded-[12px] text-[14px] font-bold disabled:opacity-50"
              onClick={onAccept}
            >
              {t("actions.accept")}
            </button>
            {!webPaid && (
              <button
                type="button"
                data-testid={`pos-ord-card-reject-${c.ref}`}
                disabled={busy || !perms.reject}
                title={noReject}
                className="btn btn-ghost h-11 rounded-[12px] px-4 text-[14px] disabled:opacity-50"
                onClick={onReject}
              >
                {t("actions.reject")}
              </button>
            )}
          </div>
        )}
        {c.status === "READY" && (
          <>
            <button
              type="button"
              data-testid={`pos-ord-card-handover-${c.ref}`}
              disabled={busy || !perms.accept}
              title={noAccept}
              className="btn btn-ghost h-11 w-full rounded-[12px] text-[14px] disabled:opacity-50"
              onClick={onHandOver}
            >
              <RegisterIcon name="check" size={14} />
              {t("actions.handOver")}
            </button>
            {c.fulfilment === "DELIVERY" ? <PlannedChip label={t("card.rider")} /> : null}
            {c.channel.payout === "PLATFORM" ? <PlannedChip label={t("actions.printLabel")} /> : null}
          </>
        )}
      </div>
    </li>
  );
}

/** แถวย่อของคอลัมน์ "เสร็จวันนี้" (ภาพ 09: เลข · ช่องทาง · เวลา · ฿) */
export function DoneRow({ card: c, selected, now, onPick }: { card: OrderCard; selected: boolean; now: number | null; onPick: () => void }) {
  const tch = useTranslations("pos.channel");
  return (
    <li className="list-none border-b last:border-0">
      <button
        type="button"
        data-testid={`pos-ord-done-${c.ref}`}
        aria-pressed={selected}
        className={`flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left ${selected ? "shadow-[inset_3px_0_0_var(--color-accent)]" : ""}`}
        onClick={onPick}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="truncate text-[13px]">{c.ref}</b>
          <span className="truncate text-[12px] text-[color:var(--color-muted)]">
            {channelDisplayName(c.channel.code, c.channel.name, tch)}
            {now !== null ? ` · ${bkkClock(c.handedAt ?? c.receivedAt)}` : ""}
          </span>
        </span>
        <b className="shrink-0 text-[13px] tabular-nums">{moneyText(c.totalSatang)}</b>
      </button>
    </li>
  );
}
