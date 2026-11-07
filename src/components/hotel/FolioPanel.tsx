"use client";
// SVC H.5 ▸ บิลระหว่างพัก (folio) ในหน้ารายละเอียดการจอง (ภาพ 09 ครึ่งขวา · ใบสั่ง h.5 §4)
//   กลุ่ม: ค่าห้อง (ราคาตามวัน) · ลงห้องจาก POS · มินิบาร์/ซักรีด/บริการ · ส่วนลด · ภาษี (แยกภาษี) · มัดจำ/ชำระ · เงินประกัน
//   ปุ่มเขียนทุกปุ่มอยู่ใต้สิทธิ์จากเซิร์ฟเวอร์: ลงรายการ ⇔ canPost · ยกเลิกรายการ ⇔ canVoid · เช็กเอาต์ ⇔ canSettle · ส่วนลด/ริบ ⇔ canManage
//   มือถือ 390: ตารางอยู่ในกรอบเลื่อนแนวนอน (data-scroll-hint) · ไดอะล็อกเต็มจอ
import { useState } from "react";
import { useRouter } from "next/navigation";
import FolioItemRow from "./FolioItemRow";
import PostItemDialog from "./PostItemDialog";
import VoidItemDialog from "./VoidItemDialog";
import CheckoutDialog from "./CheckoutDialog";
import SecurityDepositCard from "./SecurityDepositCard";
import { FOLIO_STATUS_TH, bahtTh, chargesOf, dayTh, groupItems, taxNoteTh, type FolioActionResult, type FolioActions, type FolioDto, type FolioItemDto } from "./folio-shared";

type Props = { folio: FolioDto; printHref: string; actions: FolioActions; openCheckout?: boolean };
const BTN = "inline-flex min-h-11 items-center justify-center rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm";

export default function FolioPanel({ folio, printHref, actions, openCheckout = false }: Props) {
  const router = useRouter();
  const canPost = folio.canPost;
  const canVoid = folio.canVoid;
  const canSettle = folio.canSettle;
  const [dialog, setDialog] = useState((canSettle && openCheckout ? "checkout" : "") as "" | "post" | "checkout");
  const [voidTarget, setVoidTarget] = useState(null as FolioItemDto | null);
  const [notice, setNotice] = useState("");
  function finished(r: FolioActionResult, text: string) {
    setDialog("");
    setVoidTarget(null);
    setNotice(r.ok ? text : r.reason || "ทำรายการไม่สำเร็จ");
    router.refresh();
  }
  const groups = groupItems(folio.items);
  const total = chargesOf(folio);
  return (
    <section data-folio-panel={folio.status} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4">
      <header data-can-settle={canSettle ? "1" : undefined} className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold">
            บิลระหว่างพัก (folio) · เช็กเอาต์ {dayTh(folio.reservation.checkOut)}
          </h2>
          <p className="text-xs text-[color:var(--color-muted)]">
            {folio.reservation.code}
            {folio.reservation.roomNumber ? ` · ห้อง ${folio.reservation.roomNumber}` : ""} · {folio.reservation.roomTypeName} · {FOLIO_STATUS_TH[folio.status] ?? folio.status}
          </p>
        </div>
        <a href={printHref} target="_blank" rel="noreferrer" className="text-sm font-medium text-[color:var(--color-accent)] underline">
          พิมพ์รายการ
        </a>
      </header>
      {notice ? (
        <p role="status" className="rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}
      <div className="overflow-x-auto" data-scroll-hint="">
        <table className="w-full min-w-[520px] text-sm">
          {groups.map((g) => (
            <tbody key={g.key} data-folio-group={g.key}>
              <tr>
                <th colSpan={4} className="pb-1 pt-3 text-left text-xs font-bold text-[color:var(--color-ink-soft)]">
                  {g.labelTh}
                </th>
              </tr>
              {g.items.map((i) => (
                <FolioItemRow key={i.id} item={i} canVoid={canVoid} onVoid={setVoidTarget} />
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <div className="flex flex-col gap-1 border-t border-[color:var(--color-line)] pt-3 text-sm">
        <div className="flex justify-between font-bold">
          <span>ยอดชำระ</span>
          <span className="tabular-nums">฿{bahtTh(total)}</span>
        </div>
        <p className="text-xs text-[color:var(--color-muted)]">
          {taxNoteTh(folio)}
          {folio.security.state === "HELD" ? ` · เงินประกันห้อง ฿${bahtTh(folio.security.heldSatang)} คืนแยก` : ""}
        </p>
        {folio.deposit.paidSatang ? <p className="text-xs text-[color:var(--color-muted)]">มัดจำที่รับไว้ ฿{bahtTh(folio.deposit.paidSatang)} หักตอนเช็กเอาต์</p> : null}
        <div className="flex justify-between text-[color:var(--color-ink-soft)]">
          <span>คงค้าง (หลังหักมัดจำ/ชำระ)</span>
          <span className="tabular-nums">฿{bahtTh(folio.balanceSatang)}</span>
        </div>
      </div>
      <SecurityDepositCard folio={folio} canTake={folio.canSecurity} canRefund={canSettle || folio.canManage} onTake={actions.takeSecurity} onRefund={actions.refundSecurity} onDone={(r) => finished(r, "บันทึกเงินประกันห้องแล้ว")} />
      <div className="flex flex-wrap justify-end gap-2">
        {canPost ? (
          <button type="button" className={BTN} data-folio-post="" onClick={() => setDialog("post")}>
            + ลงรายการ
          </button>
        ) : null}
        {canSettle ? (
          <button type="button" data-folio-checkout="" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[color:var(--color-ink)] px-4 py-2 text-sm font-bold text-white" onClick={() => setDialog("checkout")}>
            เช็กเอาต์ · รับ ฿{bahtTh(Math.max(0, folio.balanceSatang))}
          </button>
        ) : null}
      </div>
      {dialog === "post" && canPost ? <PostItemDialog reservationId={folio.reservation.id} canManage={folio.canManage} onSubmit={actions.post} onDone={(r) => finished(r, "ลงรายการแล้ว")} onClose={() => setDialog("")} /> : null}
      {voidTarget && canVoid ? <VoidItemDialog item={voidTarget} onSubmit={actions.void} onDone={(r) => finished(r, "ยกเลิกรายการแล้ว (ลงรายการกลับยอดวันนี้)")} onClose={() => setVoidTarget(null)} /> : null}
      {dialog === "checkout" && canSettle ? (
        <CheckoutDialog reservationId={folio.reservation.id} canManage={folio.canManage} onPrepare={actions.prepare} onSettle={actions.settle} onDone={(r) => finished(r, "เช็กเอาต์แล้ว · ห้องรอทำความสะอาด")} onClose={() => setDialog("")} />
      ) : null}
    </section>
  );
}
