"use client";
// SVC H.4 ▸ คิว "ต้องแจ้ง ตม.30" (ภายใน 24 ชม.) — รอแจ้ง/เกินกำหนด เรียงครบกำหนดก่อน · เลขเอกสารแสดง 4 ตัวท้ายเท่านั้น
//   เลือกหลายคน → ไฟล์สำหรับอัปโหลด + เลขรับแจ้ง (Tm30FileDialog) · ไม่มีสิทธิ์ทะเบียน = ดูอย่างเดียว · มือถือ 390: ตารางเลื่อนแนวนอน (data-scroll-hint)
import { useState } from "react";
import Tm30FileDialog from "./Tm30FileDialog";
import { dateShortTh, dateTimeTh, hoursLeft, maskLast4, nationalityText, tm30Badge, type Tm30Item } from "./checkin-shared";

type Props = { unitSlug: string; items: Tm30Item[]; canFile: boolean; nowMs: number };

export default function Tm30Queue({ unitSlug, items, canFile, nowMs }: Props) {
  const [picked, setPicked] = useState([] as string[]);
  function toggle(id: string) {
    setPicked((p) => {
      return p.includes(id) ? p.filter((x) => {
        return x !== id;
      }) : [...p, id];
    });
  }
  const all = picked.length === items.length && items.length !== 0;
  return (
    <section data-tm30-queue="" className="flex min-w-0 flex-col gap-3">
      {items.length === 0 ? (
        <p className="rounded-xl border border-[color:var(--color-line)] p-4 text-sm text-[color:var(--color-muted)]">ไม่มีผู้เข้าพักต่างด้าวที่ต้องแจ้ง ตม.30</p>
      ) : (
        <div data-scroll-hint="" className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-[color:var(--color-muted)]">
                {canFile ? (
                  <th className="w-10 py-2">
                    <input type="checkbox" aria-label="เลือกทั้งหมด" checked={all} onChange={() => setPicked(all ? [] : items.map((i) => i.guestId))} />
                  </th>
                ) : null}
                <th className="py-2">ผู้เข้าพัก</th>
                <th className="py-2">สัญชาติ</th>
                <th className="py-2">หนังสือเดินทาง</th>
                <th className="py-2">ห้อง · เข้า–ออก</th>
                <th className="py-2">ครบกำหนด 24 ชม.</th>
                <th className="py-2">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const h = hoursLeft(i.dueAt, nowMs);
                const badge = tm30Badge(i.status, i.dueAt, nowMs); // รอบ 6 ▸ PENDING ที่ครบกำหนดแล้ว (sweep ยังไม่วิ่ง) = เลยกำหนดบนจอ ◂
                return (
                  <tr key={i.guestId} data-tm30-row={i.status} data-tm30-overdue={badge.overdue ? "" : undefined} className="border-t border-[color:var(--color-line)]">
                    {canFile ? (
                      <td className="py-2">
                        <input type="checkbox" aria-label="เลือกผู้เข้าพัก" checked={picked.includes(i.guestId)} onChange={() => toggle(i.guestId)} />
                      </td>
                    ) : null}
                    <td className="py-2 font-medium">{i.fullName}</td>
                    <td className="py-2">{nationalityText(i.nationality, i.nationalityTh)}</td>
                    <td className="py-2">{maskLast4(i.idNumberLast4)}</td>
                    <td className="py-2">
                      {i.roomNumber ?? "—"} · {dateShortTh(i.checkIn)} – {dateShortTh(i.checkOut)}
                    </td>
                    <td className={`py-2 ${badge.overdue ? "font-bold text-rose-700" : ""}`}>
                      {i.dueAt ? `${dateTimeTh(i.dueAt)}${badge.overdue ? ` ${badge.note}` : h !== null && h >= 0 ? ` (อีก ${h} ชม.)` : ""}` : "ยังไม่เช็กอิน"}
                    </td>
                    <td className="py-2">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${badge.tone}`}>{badge.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {canFile && items.length ? <Tm30FileDialog unitSlug={unitSlug} guestIds={picked} canFile={canFile} /> : null}
    </section>
  );
}
