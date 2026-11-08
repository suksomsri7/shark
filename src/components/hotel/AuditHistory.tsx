"use client";
// SVC H.7 ▸ ประวัติวันปิด + เปิดวันอีกครั้ง (ใบสั่ง h.7 §4) — ตาราง KPI ที่ freeze ต่อวัน · ปุ่มเปิดอีกครั้งเฉพาะวันล่าสุดที่ปิดแล้ว
//   ปุ่มอยู่ใต้ canReopen (ผู้จัดการ/เจ้าของที่มีสิทธิ์ปิดวัน) · ต้องกรอกเหตุผล · อ่านอย่างเดียว = ไม่มีปุ่ม · action รับทาง prop
import { useState } from "react";
import type { AuditHistoryRow } from "@/lib/modules/hotel";
import { fmtBaht, fmtInt, fmtPct, fmtThaiDate } from "./reports-shared";

export type AuditHistoryProps = {
  rows: AuditHistoryRow[];
  canReopen: boolean;
  csvHref?: string | null;
  actions: { reopen(input: { auditId: string; reason: string }): Promise<{ ok: boolean; reason?: string }> };
};

const SOFT = "text-[color:var(--color-ink-soft)]";

export default function AuditHistory({ rows, canReopen, csvHref, actions }: AuditHistoryProps) {
  const [openId, setOpenId] = useState(null as string | null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null as string | null);
  const latest = rows.length ? rows[rows.length - 1] : null;
  const doReopen = async (auditId: string) => {
    if (!reason.trim()) {
      setMsg("กรุณาระบุเหตุผลที่เปิดวันอีกครั้ง");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await actions.reopen({ auditId, reason: reason.trim() });
      setMsg(r.ok ? "เปิดวันอีกครั้งแล้ว — แก้รายการแล้วกดปิดวันใหม่" : (r.reason ?? "เปิดวันอีกครั้งไม่สำเร็จ"));
      if (r.ok) {
        setOpenId(null);
        setReason("");
      }
    } catch {
      setMsg("เปิดวันอีกครั้งไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section data-audit-history="" className="min-w-0 overflow-hidden rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)]">
      <div className="flex flex-wrap items-center gap-2 px-5 pb-2 pt-5">
        <h2 className="text-base font-bold">ประวัติการปิดวัน</h2>
        <span className="flex-1" />
        {csvHref ? (
          <a href={csvHref} className="flex min-h-[40px] items-center rounded-xl border border-[color:var(--color-line)] px-3 text-sm font-medium">
            ส่งออก CSV
          </a>
        ) : null}
      </div>
      {msg ? <p role="status" className="mx-5 mb-2 rounded-xl bg-[color:var(--color-surface-2)] p-3 text-sm">{msg}</p> : null}
      <div data-scroll-hint="" className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className={`border-b border-[color:var(--color-line)] text-left ${SOFT}`}>
              <th className="px-4 py-2 font-medium">วันที่</th>
              <th className="px-4 py-2 font-medium">สถานะ</th>
              <th className="px-4 py-2 text-right font-medium">อัตราเข้าพัก</th>
              <th className="px-4 py-2 text-right font-medium">รายได้ห้อง</th>
              <th className="px-4 py-2 text-right font-medium">ADR</th>
              <th className="px-4 py-2 text-right font-medium">ไม่มา</th>
              <th className="px-4 py-2 font-medium">ปิดโดย</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className={`px-4 py-6 text-center ${SOFT}`}>
                  ยังไม่เคยปิดวัน
                </td>
              </tr>
            ) : (
              [...rows].reverse().map((r) => (
                <tr key={r.auditId} className="border-b border-[color:var(--color-line)] align-top last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-2 font-medium">{fmtThaiDate(r.businessDate)}</td>
                  <td className="whitespace-nowrap px-4 py-2">{r.status === "REOPENED" ? "เปิดอีกครั้ง" : r.reopened ? "ปิดแล้ว (ปิดใหม่)" : "ปิดแล้ว"}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{`${fmtPct(r.occupancyBps)} · ${r.roomsOccupied}/${r.roomsAvailable}`}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{fmtBaht(r.roomRevenueSatang)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{fmtBaht(r.adrSatang)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{fmtInt(r.noShowCount)}</td>
                  <td className={`whitespace-nowrap px-4 py-2 ${SOFT}`}>{r.byCron ? "ปิดอัตโนมัติ" : "ผู้ใช้กดปิด"}</td>
                  <td className="px-4 py-2">
                    {canReopen && latest && r.auditId === latest.auditId && r.status === "CLOSED" ? (
                      openId === r.auditId ? (
                        <div className="flex min-w-[260px] flex-col gap-2">
                          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2} placeholder="เหตุผลที่เปิดวันอีกครั้ง" className="rounded-xl border border-[color:var(--color-line)] p-2 text-sm" />
                          <div className="flex gap-2">
                            <button type="button" disabled={busy} onClick={() => setOpenId(null)} className="min-h-[40px] rounded-xl border border-[color:var(--color-line)] px-3 text-sm">
                              ยกเลิก
                            </button>
                            <button type="button" disabled={busy} onClick={() => void doReopen(r.auditId)} className="min-h-[40px] rounded-xl bg-[color:var(--color-ink)] px-3 text-sm font-semibold text-[color:var(--color-surface)] disabled:opacity-60">
                              {busy ? "กำลังเปิด…" : "ยืนยันเปิดอีกครั้ง"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setOpenId(r.auditId)} className="min-h-[40px] whitespace-nowrap rounded-xl border border-[color:var(--color-line)] px-3 text-sm">
                          เปิดวันอีกครั้ง
                        </button>
                      )
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
