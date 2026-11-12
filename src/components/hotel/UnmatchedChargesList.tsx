"use client";
// SVC H.5 ▸ คิว "บิลลงห้องที่ยังไม่ผูกห้อง" (ใบสั่ง h.5 §0 §4) — บิล POS ที่จ่ายแบบลงห้องแต่หาแขกไม่เจอ (เลขอ้างอิงผิด · ยังไม่เช็กอิน · บิลห้องปิด · ห้องซ้ำ)
//   แถว: บิล · ยอด · เลขอ้างอิง · เวลา · เหตุผล · ปุ่ม «ผูกกับการจอง…» (เลือกแขกที่เข้าพักอยู่) — ปุ่มใต้ canAttach (hotel.folio.post) · ไม่มีชื่อ/เบอร์ในแถวบิล
import { useState } from "react";
import { useRouter } from "next/navigation";
import { UNMATCHED_TITLE_TH, bahtTh, dateTimeTh, type FolioAction, type UnmatchedRow } from "./folio-shared";

type Guest = { id: string; label: string };
type Props = { rows: UnmatchedRow[]; guests: Guest[]; canAttach: boolean; onAttach: FolioAction };

export default function UnmatchedChargesList({ rows, guests, canAttach, onAttach }: Props) {
  const router = useRouter();
  const [picked, setPicked] = useState({} as Record<string, string>);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  async function attach(saleId: string) {
    const reservationId = picked[saleId];
    if (!reservationId || busy) return;
    setBusy(saleId);
    setNotice("");
    try {
      const r = await onAttach({ saleId, reservationId });
      setNotice(r.ok ? "ผูกบิลกับการจองแล้ว" : r.reason || "ผูกไม่สำเร็จ");
      if (r.ok) router.refresh();
    } catch {
      setNotice("เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy("");
    }
  }
  return (
    <section data-unmatched-list={rows.length} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4">
      <header>
        <h1 className="text-lg font-bold">{UNMATCHED_TITLE_TH}</h1>
        <p className="text-sm text-[color:var(--color-muted)]">บิลจากร้านอาหาร/ร้านค้าที่จ่ายแบบลงห้อง แต่ระบบหาแขกที่เข้าพักไม่เจอ — ผูกกับการจองที่ถูกต้องเพื่อรวมเข้าบิลตอนเช็กเอาต์</p>
      </header>
      {notice ? <p role="status" className="rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-sm">{notice}</p> : null}
      {rows.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">ไม่มีบิลค้างผูกห้อง</p> : null}
      {rows.length ? (
        <div className="overflow-x-auto" data-scroll-hint="">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-[color:var(--color-muted)]">
                <th className="py-2 pr-3">บิล</th>
                <th className="py-2 pr-3 text-right">ยอด</th>
                <th className="py-2 pr-3">เลขอ้างอิง</th>
                <th className="py-2 pr-3">เวลา</th>
                <th className="py-2 pr-3">เหตุผล</th>
                <th className="py-2">ผูกกับการจอง…</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.saleId} data-unmatched-sale={r.saleId} className="border-t border-[color:var(--color-line)] align-top">
                  <td className="py-2 pr-3 font-medium">{r.receiptNo ?? "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{bahtTh(r.amountSatang)}</td>
                  <td className="py-2 pr-3">{r.reference ?? "—"}</td>
                  <td className="whitespace-nowrap py-2 pr-3">{dateTimeTh(r.paidAt)}</td>
                  <td className="py-2 pr-3 text-[color:var(--color-ink-soft)]">{r.reason}</td>
                  <td className="py-2">
                    {canAttach ? (
                      <div className="flex gap-2">
                        <select aria-label="เลือกการจอง" value={picked[r.saleId] ?? ""} onChange={(e) => setPicked({ ...picked, [r.saleId]: e.target.value })} className="min-h-11 rounded-lg border border-[color:var(--color-line)] px-2 text-sm">
                          <option value="">เลือกแขกที่เข้าพัก</option>
                          {guests.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.label}
                            </option>
                          ))}
                        </select>
                        <button type="button" disabled={!picked[r.saleId] || busy === r.saleId} onClick={() => attach(r.saleId)} className="min-h-11 rounded-lg border border-[color:var(--color-line)] px-3 text-sm disabled:opacity-50">
                          ผูก
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-[color:var(--color-muted)]">ต้องมีสิทธิ์ลงรายการบิลห้อง</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
