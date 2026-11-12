"use client";
// SVC H.5 ▸ แถวรายการในบิลระหว่างพัก (ภาพ 09 ขวา) — วัน · รายการ · ยอด · แถวที่ถูกยกเลิกขีดฆ่า + เหตุผล · แถวกลับรายการแสดงคู่
//   มือถือ (SVC H.5 รอบ 4 · PARITY 390): วันที่ย้ายไปบรรทัดเล็กใต้คำอธิบาย · ยอดอยู่คอลัมน์ขวาเสมอ (ไม่ถูกตัดด้วยกรอบเลื่อน)
//   ปุ่มยกเลิกรายการอยู่ใต้ canVoid (สิทธิ์ hotel.folio.void จากเซิร์ฟเวอร์ · หน้าเคาน์เตอร์ไม่เห็น) · ชนิดที่ยกเลิกเองไม่ได้ไม่มีปุ่ม
import { ITEM_TYPE_TH, bahtTh, dayTh, type FolioItemDto } from "./folio-shared";

type Props = { item: FolioItemDto; canVoid: boolean; onVoid: (item: FolioItemDto) => void };
const VOIDABLE = new Set(["ROOM", "SERVICE", "MINIBAR", "PENALTY", "DISCOUNT"]);

export default function FolioItemRow({ item, canVoid, onVoid }: Props) {
  const showVoid = canVoid && VOIDABLE.has(item.type) && !item.voidedAt && item.amountSatang !== 0;
  const isReversal = item.type === "VOID_REVERSAL";
  const struck = !!item.voidedAt;
  const info = item.type === "SECURITY_DEPOSIT" || item.type === "SECURITY_REFUND" || (item.type === "PENALTY" && item.amountSatang === 0);
  return (
    <tr data-folio-item={item.type} data-voided={struck ? "1" : undefined} className="border-b border-dashed border-[color:var(--color-line)] align-top last:border-0">
      <td className="hidden whitespace-nowrap py-2 pr-3 text-[color:var(--color-muted)] sm:table-cell">{dayTh(item.businessDate)}</td>
      <td className={`min-w-0 break-words py-2 pr-2 sm:pr-3 ${struck ? "text-[color:var(--color-muted)] line-through" : ""} ${isReversal ? "text-[color:var(--color-muted)]" : ""}`}>
        <span className="block text-xs text-[color:var(--color-muted)] no-underline sm:hidden">{dayTh(item.businessDate)}</span>
        <span>{item.description}</span>
        {item.qty > 1 ? <span className="text-[color:var(--color-muted)]"> × {item.qty}</span> : null}
        {struck && item.voidReason ? <span className="block text-xs no-underline">เหตุผลที่ยกเลิก: {item.voidReason}</span> : null}
        {isReversal ? <span className="block text-xs">{ITEM_TYPE_TH.VOID_REVERSAL}ของรายการที่ยกเลิก</span> : null}
        {info ? <span className="block text-xs text-[color:var(--color-muted)]">ข้อมูลเงินประกัน · ไม่รวมในยอดชำระ</span> : null}
      </td>
      <td data-folio-amount="" className={`w-24 whitespace-nowrap py-2 pr-1 text-right align-top font-medium tabular-nums sm:w-auto sm:pr-2 ${struck ? "text-[color:var(--color-muted)] line-through" : ""}`}>{info ? "—" : bahtTh(item.amountSatang)}</td>
      <td className="w-14 py-1 text-right align-top sm:w-16">
        {showVoid ? (
          <button type="button" data-void-item={item.id} onClick={() => onVoid(item)} className="min-h-9 rounded-lg px-2 text-xs text-rose-700 underline">
            ยกเลิก
          </button>
        ) : null}
      </td>
    </tr>
  );
}
