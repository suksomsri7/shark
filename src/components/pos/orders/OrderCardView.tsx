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
import { acceptLeftSec, bkkClock, isPrepaidCard, mmss, ORDERS_ACCEPT_RED_SEC, prepState } from "./orders-ui";
import { PrepaidChip } from "./QrOrderBits"; // POS P2.7U ◂

export type CardPerms = { accept: boolean; reject: boolean };
/** POS P2.6U ▸ มติ 9c/11: มาตรครัวของออเดอร์ (kitchenProgressAction · ไม่มีรอบ = null) · ออเดอร์ใหม่ค้างเพราะครัว (พักครัว / ครัวค้าง ≥ เพดาน) ◂ */
export type CardKitchen = { progress: { done: number; total: number } | null; held: boolean };

/** ชิปช่องทาง (ภาพ 09: กรอบมน · แพลตฟอร์ม = กรอบดำหนา ตัวหนา · อื่น = กรอบจาง) */
export function ChannelChip({
  code,
  name,
  payout,
  size = "md",
  fit = false,
}: {
  code: string;
  name: string;
  payout: "PLATFORM" | "DIRECT" | null;
  size?: "md" | "sm";
  /** POS P2.8U ▸ fix 2 V1: ชิปบนการ์ด = หดได้ (ตัด …) ก่อนเลขอ้างอิง · พื้นต่ำสุด 36px ◂ */
  fit?: boolean;
}) {
  const tch = useTranslations("pos.channel");
  const strong = payout === "PLATFORM";
  return (
    <span
      className={`inline-flex min-w-0 items-center rounded-[8px] leading-[22px] ${fit ? "min-w-9 shrink px-1.5 text-[12px]" : `shrink-0 px-2 ${size === "sm" ? "text-[11.5px]" : "text-[12.5px]"}`} ${
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
  kitchen, // POS P2.6U ▸ มติ 9c/11 ◂
}: {
  kitchen?: CardKitchen;
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
        // POS P2.8U ▸ fix 2 V1: การ์ด = @container — ระยะของหัวการ์ด/ปุ่มตัดสินจากความกว้างเนื้อการ์ด (คอลัมน์ ≈ 128–207px บนจอ 1024–1440) ◂
        className={`@container flex flex-col gap-2 rounded-[16px] border bg-[color:var(--color-surface)] p-3 ${
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
          {/* POS P2.8U ▸ fix 2 V1 (ภาพ 09): เลขอ้างอิงมาก่อน — เลขไม่หด (กว้างสุด = แถว − พื้นชิป 36 − ช่อง 6 แล้วจึงตัด …) · ชิปหดแทน · เวลาเข้าอยู่หัวการ์ดเมื่อการ์ด ≥ 220px
              ไม่งั้นย้ายไปท้ายบรรทัด "N รายการ · ฿x" (12.5px) ◂ */}
          <span className="flex w-full min-w-0 items-center gap-1.5">
            <ChannelChip code={c.channel.code} name={c.channel.name} payout={c.channel.payout} fit />
            <b className="max-w-[calc(100%-2.625rem)] shrink-0 truncate text-[14px]">{c.ref}</b>
            <span className="ml-auto hidden shrink-0 pl-1 text-[12.5px] tabular-nums text-[color:var(--color-muted)] @min-[220px]:inline">{now !== null ? bkkClock(c.receivedAt) : ""}</span>
          </span>
          <span className="flex w-full flex-wrap items-baseline gap-x-2 text-[13.5px] text-[color:var(--color-ink-soft)]">
            <span>{t.rich("card.items", { count: c.itemCount, amount: moneyText(c.totalSatang), b: (x) => <b className="text-[color:var(--color-ink)]">{x}</b> })}</span>
            <span className="ml-auto shrink-0 text-[12.5px] tabular-nums text-[color:var(--color-muted)] @min-[220px]:hidden">{now !== null ? bkkClock(c.receivedAt) : ""}</span>
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
        {isPrepaidCard(c) ? <PrepaidChip card={c} /> : null /* POS P2.7U ▸ ออเดอร์จ่ายก่อนที่เงินเข้าแล้ว ◂ */}
        {/* POS P2.6U ▸ มติ 9c: มาตรครัวจริง "ครัวกำลังทำ d/t" (แทนชิปเร็ว ๆ นี้) · ไม่มีรอบครัว = ไม่แสดง ◂ */}
        {(c.status === "ACCEPTED" || c.status === "PREPARING" || c.status === "READY") && kitchen?.progress && kitchen.progress.total > 0 && (
          <span data-testid="pos-ord-kitchen-meter" className="flex items-center gap-2 text-[12px] text-[color:var(--color-ink-soft)]">
            {/* fix1 F6: ข้อความก่อนแถบ (ภาพ 09 "ครัวกำลังทำ 0/3 ▬▬") */}
            <span className="shrink-0 tabular-nums">{t("card.kitchenProgress", { done: kitchen.progress.done, total: kitchen.progress.total })}</span>
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[color:var(--color-surface-2)]">
              <span className="block h-full rounded-full bg-[color:var(--color-ink)]" style={{ width: `${Math.round((kitchen.progress.done / kitchen.progress.total) * 100)}%` }} />
            </span>
          </span>
        )}
        {/* POS P2.6U ▸ มติ 11: ออเดอร์ใหม่ที่ระบบไม่รับอัตโนมัติเพราะครัว (อ่านอย่างเดียว · ไม่มีตัวกวาด — P2.11) ◂ */}
        {c.status === "NEW" && kitchen?.held && (
          <span data-testid="pos-ord-kitchen-held" title={t("card.kitchenHeldHint")} className="inline-flex h-6 self-start items-center rounded-[7px] border border-dashed border-[color:var(--color-danger)] px-2 text-[11.5px] font-bold text-[color:var(--color-danger)]">
            {t("card.kitchenHeld")}
          </span>
        )}
        {c.status === "NEW" && (
          // POS P2.8U ▸ fix 2 V1 (ภาพ 09): ปุ่มบรรทัดเดียว — ไม่ตัดคำ · flex-wrap: ไม่พอจริง ๆ ⇒ "ปฏิเสธ" ลงบรรทัดใหม่เต็มกว้าง (ไม่หักกลางคำ) ·
          //   ระยะซ้ายขวาแคบ (รับ 6 · ปฏิเสธ 8) ส่วนเกินแบ่งด้วย grow 3:1 · การ์ด < 140px ⇒ 13px + ระยะ 4 · สูง 44 คงเดิม ◂
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              data-testid={`pos-ord-card-accept-${c.ref}`}
              disabled={busy || !perms.accept}
              title={noAccept}
              className="btn btn-primary h-11 grow-[3] whitespace-nowrap rounded-[12px] px-1.5 text-[14px] font-bold disabled:opacity-50 @max-[140px]:px-1 @max-[140px]:text-[13px]"
              onClick={onAccept}
            >
              {t("actions.acceptCard") /* POS P2.14 ▸ UI-7: ป้ายสั้นบนการ์ด (en "Accept") — การ์ดแคบไม่ดัน "ปฏิเสธ" ลงบรรทัด · แผงคงป้ายเต็ม ◂ */}
            </button>
            {!webPaid && (
              <button
                type="button"
                data-testid={`pos-ord-card-reject-${c.ref}`}
                disabled={busy || !perms.reject}
                title={noReject}
                className="btn btn-ghost h-11 grow whitespace-nowrap rounded-[12px] px-2 text-[14px] disabled:opacity-50 @max-[140px]:px-1 @max-[140px]:text-[13px]"
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
