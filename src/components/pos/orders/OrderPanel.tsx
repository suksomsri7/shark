"use client";

// OrderPanel.tsx — แผงรายละเอียดออเดอร์ (POS P2.8U · ภาพ 09 ขวา · มติ 5) — ข้อมูลจาก getOrderAction (OrderDetail)
//   หัว: "รายละเอียด <ref>" + ชิปช่องทาง · "เข้า hh:mm · รับภายใน m:ss" · ลูกค้า · "ส่งถึง …" (ข้อความ · ระยะ/ไรเดอร์ = P3)
//   รายการ (จำนวน · ชื่อ · ตัวเลือก/หมายเหตุ · ฿) · หมายเหตุลูกค้า · ยอด + บล็อกค่าคอมฯ (pos-bill-commission — แพลตฟอร์มเท่านั้น · ตัวเลขจาก OrderDetail.commission)
//   "เมื่อกดรับออเดอร์ ระบบจะ" (จากข้อเท็จจริงของช่องทาง: เปิดบิล + ตัดสต็อกเฉพาะแพลตฟอร์ม · ครัว = เร็ว ๆ นี้ P2.6 · แจ้งแพลตฟอร์ม = P3) ·
//   ประวัติลูกค้า (history) · สมาชิก · ไทม์ไลน์ (รวม sale_bound / paid_reverted)
//   ปุ่มท้ายตามสถานะ: ใหม่ = รับออเดอร์ · เตรียม N นาที / แก้เวลา / ปฏิเสธ (ของหมด) · รับแล้ว = เริ่มเตรียม · กำลังเตรียม = พร้อมแล้ว · พร้อม = ส่งมอบแล้ว ·
//   ช่องทางร้านเก็บเงินเองที่ยังไม่จ่าย = รับเงิน · รับแล้ว..พร้อม = ยกเลิกออเดอร์ · มีบิล = ดูบิล
//   🔴 ออเดอร์เว็บร้านที่ชำระแล้ว: ไม่มีปฏิเสธ/ยกเลิก — บรรทัด "คืนเงิน/ยกเลิกที่หน้าเว็บร้าน" (fix รอบ 2 F1)
//   🔴 ไม่คิดเงินในจอ (ยอด/ค่าคอมฯ/รับจริง = ค่าของเซิร์ฟเวอร์) · เวลาวาดหลัง mount · ข้อความผิดพลาดส่งมาเป็นข้อความที่แปลแล้ว

import Link from "next/link";
import { useTranslations } from "next-intl";
import { moneyText } from "@/lib/modules/pos/register-shared";
import type { OrderDetail } from "@/lib/modules/pos/order-shared";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { channelDisplayName, channelRateText } from "@/components/pos/settings/channel-text";
import { ChannelChip, PlannedChip } from "./OrderCardView";
import { acceptLeftSec, bkkClock, mmss, ORDERS_ACCEPT_RED_SEC, type OrdersChannel } from "./orders-ui";

export type PanelPerms = { accept: boolean; reject: boolean; create: boolean; voidSale: boolean };

const EVENT_TYPES = new Set(["received", "accepted", "preparing", "ready", "completed", "rejected", "cancelled", "paid", "paid_reverted", "sale_bound", "prep_changed", "refunded"]);

export function OrderPanel(p: {
  detail: OrderDetail | null;
  /** การ์ด (โหลดเร็วกว่าแผง) — ใช้หัวแผงระหว่างรอ getOrder */
  refText: string;
  loadError: string | null;
  channel: OrdersChannel | null;
  now: number | null;
  perms: PanelPerms;
  busy: boolean;
  /** เวลาเตรียมที่จะส่งตอนรับ (ช่องทาง → ปริยาย 15 · แก้ได้ด้วย "แก้เวลา") */
  acceptPrep: number;
  error: string | null;
  /** ข้อความผิดพลาดของปุ่มส่งมอบเมื่อบิลถูกยกเลิก (saleVoided) — เน้นปุ่มยกเลิกออเดอร์ */
  saleVoided: boolean;
  billHref: string | null;
  onAccept: () => void;
  onEditPrep: () => void;
  onReject: () => void;
  onStart: () => void;
  onReady: () => void;
  onHandOver: () => void;
  onPay: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onClose?: () => void;
}) {
  const t = useTranslations("pos.orders");
  const tch = useTranslations("pos.channel");
  const d = p.detail;
  const noAccept = !p.perms.accept ? t("perm.accept") : undefined;
  const noReject = !p.perms.reject ? t("perm.reject") : undefined;
  const noCreate = !p.perms.create ? t("perm.create") : undefined;
  // fix 1 F5: ยกเลิกออเดอร์ที่มีบิลแล้ว = ยกเลิกบิลด้วย ⇒ ต้องมี pos.sale.void ด้วย (เซิร์ฟเวอร์ตรวจซ้ำ) · บิลถูกยกเลิกไปแล้ว (saleVoided) = ไม่ต้อง
  const noCancel = !p.perms.reject ? t("perm.reject") : d?.saleId && !p.saleVoided && !p.perms.voidSale ? t("perm.void") : undefined;

  const head = (
    <header className="flex items-start gap-3 border-b px-5 pb-3 pt-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="truncate text-[16px] font-bold">{t("detail.title", { ref: d?.ref ?? p.refText })}</h2>
        {d && p.now !== null ? (
          <p className="text-[12.5px] text-[color:var(--color-muted)]">
            {t("detail.received", { time: bkkClock(d.receivedAt) })}
            {(() => {
              const left = acceptLeftSec(d, p.now);
              if (left === null) return ` · ${t(`status.${d.status}`)}`;
              return (
                <b className={left < ORDERS_ACCEPT_RED_SEC ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-ink)]"}>
                  {" · "}
                  {left > 0 ? t("card.acceptWithin", { time: mmss(left) }) : t("card.acceptLate")}
                </b>
              );
            })()}
          </p>
        ) : null}
      </div>
      {d ? <ChannelChip code={d.channel.code} name={d.channel.name} payout={d.channel.payout} /> : null}
      {p.onClose ? (
        <button type="button" data-testid="pos-ord-panel-close" aria-label={t("detail.close")} className="grid size-11 shrink-0 place-items-center rounded-[12px] border" onClick={p.onClose}>
          <RegisterIcon name="x" size={14} />
        </button>
      ) : null}
    </header>
  );

  if (!d) {
    return (
      <section data-testid="pos-ord-panel" aria-busy={!p.loadError} className="flex min-h-0 flex-col">
        {head}
        {p.loadError ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center text-[14px] text-[color:var(--color-muted)]" role="alert">
            <p>{p.loadError}</p>
            <button type="button" data-testid="pos-ord-panel-retry" className="btn btn-ghost h-11 rounded-[13px] px-5" onClick={p.onRetry}>
              {t("page.retry")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-4 animate-pulse rounded bg-[color:var(--color-surface-2)]" />
            ))}
          </div>
        )}
      </section>
    );
  }

  const platform = d.channel.payout === "PLATFORM";
  const webPaid = d.channel.adapter === "WEB" && d.paymentState === "PAID";
  const unpaidDirect = !platform && d.channel.adapter !== "WEB" && (d.paymentState === "UNPAID" || d.paymentState === "PAY_ON_PICKUP");
  const open = d.status === "ACCEPTED" || d.status === "PREPARING" || d.status === "READY";
  const rate = p.channel ? channelRateText(p.channel) : "";
  const vat = d.commission.commissionVatSatang;
  const channelName = channelDisplayName(d.channel.code, d.channel.name, tch);
  const eventLabel = (type: string) => (EVENT_TYPES.has(type) ? t(`event.${type}`) : type);

  return (
    <section data-testid="pos-ord-panel" data-status={d.status} className="flex min-h-0 flex-col">
      {head}
      <div className="flex flex-col gap-0.5 border-b px-5 py-3 text-[13px]">
        <p>
          <span className="text-[color:var(--color-muted)]">{t("detail.customer")} </span>
          <b>{d.phoneMasked ? `${d.customerName} · ${d.phoneMasked}` : d.customerName}</b>
        </p>
        <p className="text-[color:var(--color-ink-soft)]">
          {t(`fulfilment.${d.fulfilment}`)}
          {d.address ? ` · ${t("detail.deliverTo")} ${d.address}` : ""}
        </p>
        {d.paymentState !== "PLATFORM_PAID" ? <p className="text-[12px] text-[color:var(--color-accent)]">{t(`payment.${d.paymentState}`)}</p> : null}
      </div>

      <section className="border-b px-5 py-3">
        <h3 className="mb-1.5 text-[12px] font-bold text-[color:var(--color-muted)]">{t("detail.lines")}</h3>
        <ul className="flex flex-col gap-2">
          {d.lines.map((l) => (
            <li key={l.id} data-testid={`pos-ord-line-${l.id}`} className="grid grid-cols-[28px_1fr_auto] gap-2 text-[13.5px]">
              <span className="font-bold tabular-nums">{l.qty}</span>
              <span className="min-w-0">
                <span className="block truncate font-bold">{l.name}</span>
                {l.options.length || l.note ? (
                  <span className="block text-[12px] text-[color:var(--color-muted)]">{[...l.options.map((o) => o.choiceName), ...(l.note ? [l.note] : [])].join(" · ")}</span>
                ) : null}
              </span>
              <span className="font-bold tabular-nums">{moneyText(l.lineTotalSatang)}</span>
            </li>
          ))}
        </ul>
        {d.note ? <p className="mt-2 rounded-[10px] bg-[color:var(--color-surface-2)] px-3 py-2 text-[12.5px] text-[color:var(--color-ink-soft)]">{t("detail.customerNoteLine", { note: d.note })}</p> : null}
      </section>

      <section className="flex flex-col gap-0.5 border-b px-5 py-3 text-[13px] tabular-nums">
        <div data-testid="pos-ord-total" className="flex justify-between gap-3 py-0.5">
          <span>{t("detail.total")}</span>
          <b>{moneyText(d.totalSatang)}</b>
        </div>
        {platform ? (
          // บล็อกเดียวกับลิ้นชักบิล P2.1U (pos-bill-commission · คีย์ pos.channel.commissionBlock) — ตัวเลขของ OrderDetail.commission (อัตราปัจจุบันของช่องทาง)
          <div data-testid="pos-bill-commission" className="flex flex-col gap-0.5">
            <div data-testid="pos-bill-commission-fee" className="flex justify-between gap-3 py-0.5">
              <span className="min-w-0">{rate ? tch("commissionBlock.commissionRate", { rate }) : tch("commissionBlock.commission")}</span>
              <span className="text-[color:var(--color-danger)]">−{moneyText(d.commission.commissionSatang)}</span>
            </div>
            {vat > 0 ? (
              <div className="flex justify-between gap-3 py-0.5">
                <span>{tch("commissionBlock.vat")}</span>
                <span className="text-[color:var(--color-danger)]">−{moneyText(vat)}</span>
              </div>
            ) : null}
            <div data-testid="pos-bill-commission-net" className="flex justify-between gap-3 pt-1 text-[14px] font-bold">
              <span>{tch("commissionBlock.net")}</span>
              <span>{moneyText(d.commission.netSatang)}</span>
            </div>
            <p className="mt-2 rounded-[10px] border border-dashed px-3 py-2 text-[12px] leading-[1.5] text-[color:var(--color-muted)]">{tch("commissionBlock.note")}</p>
          </div>
        ) : null}
      </section>

      {d.status === "NEW" ? (
        <section data-testid="pos-ord-on-accept" className="border-b px-5 py-3 text-[12.5px]">
          <h3 className="mb-1.5 text-[12px] font-bold text-[color:var(--color-muted)]">{t("detail.onAccept")}</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[color:var(--color-ink-soft)]">
            {platform ? <li>{t("detail.onAcceptSaleNow", { channel: channelName })}</li> : <li>{t("detail.onAcceptSaleLater")}</li>}
            {platform ? <li>{t("detail.onAcceptStock")}</li> : null}
            <li className="list-none -ml-5">
              <PlannedChip label={t("detail.onAcceptKitchen")} />
            </li>
            {platform ? (
              <li className="list-none -ml-5">
                <PlannedChip label={t("detail.onAcceptPlatform", { channel: channelName })} />
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-1 border-b px-5 py-3 text-[13px]">
        <h3 className="text-[12px] font-bold text-[color:var(--color-muted)]">{t("detail.customerSection")}</h3>
        <p className="flex justify-between gap-3">
          <span className="text-[color:var(--color-ink-soft)]">{t("detail.historyLabel")}</span>
          <span data-testid="pos-ord-history" className="text-right">
            {t("detail.historyCount", { count: d.history.count })} · {t("detail.historyAvg", { amount: moneyText(d.history.avgSatang) })}
          </span>
        </p>
        <p className="flex justify-between gap-3">
          <span className="text-[color:var(--color-ink-soft)]">{t("detail.member")}</span>
          <span className="text-[color:var(--color-muted)]">{d.memberId ? t("detail.isMember") : t("detail.notMember")}</span>
        </p>
      </section>

      <section className="border-b px-5 py-3 text-[12.5px]">
        <h3 className="mb-1.5 text-[12px] font-bold text-[color:var(--color-muted)]">{t("detail.timeline")}</h3>
        <ol data-testid="pos-ord-events" className="flex flex-col gap-1">
          {d.events.map((e, i) => (
            <li key={`${e.type}-${e.at}-${i}`} className="flex justify-between gap-3 text-[color:var(--color-ink-soft)]">
              <span className="min-w-0 truncate">{eventLabel(e.type)}</span>
              <span className="shrink-0 tabular-nums text-[color:var(--color-muted)]">{p.now !== null ? bkkClock(e.at) : ""}</span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mt-auto flex flex-col gap-2 px-5 pb-5 pt-4">
        {p.error ? (
          <p role="alert" data-testid="pos-ord-panel-error" className="rounded-[10px] bg-[color:var(--color-surface-2)] px-3 py-2 text-[13px] text-[color:var(--color-danger)]">
            {p.error}
          </p>
        ) : null}
        {d.status === "NEW" && (
          <>
            <button type="button" data-testid="pos-ord-accept" disabled={p.busy || !p.perms.accept} title={noAccept} className="btn btn-primary h-14 rounded-[14px] text-[16px] font-bold disabled:opacity-50" onClick={p.onAccept}>
              {t("actions.acceptWithPrep", { n: p.acceptPrep })}
            </button>
            <div className={`grid gap-2 ${webPaid ? "grid-cols-1" : "grid-cols-2"}`}>
              <button type="button" data-testid="pos-ord-prep-edit" disabled={p.busy || !p.perms.accept} title={noAccept} className="btn btn-ghost h-12 rounded-[14px] text-[14px] disabled:opacity-50" onClick={p.onEditPrep}>
                {t("actions.editPrep")}
              </button>
              {!webPaid && (
                <button type="button" data-testid="pos-ord-reject" disabled={p.busy || !p.perms.reject} title={noReject} className="btn btn-ghost h-12 rounded-[14px] text-[14px] disabled:opacity-50" onClick={p.onReject}>
                  {t("actions.rejectOutOfStock")}
                </button>
              )}
            </div>
          </>
        )}
        {d.status === "ACCEPTED" && (
          <button type="button" data-testid="pos-ord-start" disabled={p.busy || !p.perms.accept} title={noAccept} className="btn btn-primary h-14 rounded-[14px] text-[16px] font-bold disabled:opacity-50" onClick={p.onStart}>
            {t("actions.startPrep")}
          </button>
        )}
        {d.status === "PREPARING" && (
          <button type="button" data-testid="pos-ord-ready" disabled={p.busy || !p.perms.accept} title={noAccept} className="btn btn-primary h-14 rounded-[14px] text-[16px] font-bold disabled:opacity-50" onClick={p.onReady}>
            {t("actions.ready")}
          </button>
        )}
        {d.status === "READY" && !p.saleVoided && (
          <button type="button" data-testid="pos-ord-handover" disabled={p.busy || !p.perms.accept} title={noAccept} className="btn btn-primary h-14 rounded-[14px] text-[16px] font-bold disabled:opacity-50" onClick={p.onHandOver}>
            {t("actions.handOver")}
          </button>
        )}
        {open && unpaidDirect && (
          <button type="button" data-testid="pos-ord-pay" disabled={p.busy || !p.perms.create} title={noCreate} className="btn btn-ghost h-12 rounded-[14px] text-[15px] font-bold disabled:opacity-50" onClick={p.onPay}>
            <RegisterIcon name="cash" size={14} />
            {t("actions.pay")} {moneyText(d.totalSatang)}
          </button>
        )}
        {(d.status === "ACCEPTED" || d.status === "PREPARING") && (
          <button type="button" data-testid="pos-ord-prep-change" disabled={p.busy || !p.perms.accept} title={noAccept} className="btn btn-ghost h-11 rounded-[14px] text-[14px] disabled:opacity-50" onClick={p.onEditPrep}>
            {t("actions.editPrep")}
          </button>
        )}
        {open && !webPaid && (
          <button
            type="button"
            data-testid="pos-ord-cancel"
            disabled={p.busy || !!noCancel}
            title={noCancel}
            className={`btn h-11 rounded-[14px] text-[14px] disabled:opacity-50 ${p.saleVoided ? "bg-[color:var(--color-danger)] font-bold text-[color:var(--color-surface)]" : "btn-ghost text-[color:var(--color-danger)]"}`}
            onClick={p.onCancel}
          >
            {t("actions.cancel")}
          </button>
        )}
        {webPaid && (d.status === "NEW" || open) ? (
          <p data-testid="pos-ord-web-paid-note" className="rounded-[10px] border border-dashed px-3 py-2 text-[12.5px] text-[color:var(--color-muted)]">
            {t("detail.webPaidNote")}
          </p>
        ) : null}
        {d.saleId && p.billHref ? (
          <Link data-testid="pos-ord-bill" href={p.billHref} className="btn btn-ghost h-11 rounded-[14px] text-[14px]">
            <RegisterIcon name="doc" size={14} />
            {d.receiptNo ? t("actions.viewBillNo", { no: d.receiptNo }) : t("actions.viewBill")}
          </Link>
        ) : null}
      </footer>
    </section>
  );
}
