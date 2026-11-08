"use client";
// SVC H.7 ▸ การ์ดปิดวัน (night audit · ใบสั่ง h.7 §4) — วันที่จะปิด + ตัวอย่าง (ไม่มา N · ลงค่าห้อง N คืน · ห้อง DIRTY N) + ปุ่ม "ปิดวัน" (ยืนยันก่อน)
//   ปุ่มอยู่ใต้ canClose (ผู้มีสิทธิ์ hotel.audit.run) · อ่านอย่างเดียว = ไม่มีปุ่ม · วันแรก = เลือก "เริ่มใช้ night audit ตั้งแต่วันที่…" (≤ เมื่อวาน)
//   action รับทาง prop (server action ของหน้า) · ข้อมูลจาก auditPreview (ไม่มีข้อมูลแขก — รหัสการจองเท่านั้น)
import { useState } from "react";
import type { AuditPreviewOk } from "@/lib/modules/hotel";
import { fmtBaht, fmtInt, fmtPct, fmtThaiDate } from "./reports-shared";

export type NightAuditPanelProps = {
  preview: AuditPreviewOk;
  canClose: boolean;
  autoClose: boolean;
  auditTime: string;
  maxStart: string;
  actions: { close(input: { businessDate: string }): Promise<{ ok: boolean; reason?: string }> };
};

const SOFT = "text-[color:var(--color-ink-soft)]";
const CARD = "min-w-0 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)]";

export default function NightAuditPanel({ preview: p, canClose, autoClose, auditTime, maxStart, actions }: NightAuditPanelProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null as string | null);
  const closable = p.status !== "CLOSED" && !p.tooEarly;
  const doClose = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await actions.close({ businessDate: p.businessDate });
      setMsg(r.ok ? `ปิดวัน ${fmtThaiDate(p.businessDate)} แล้ว` : (r.reason ?? "ปิดวันไม่สำเร็จ ลองใหม่อีกครั้ง"));
      if (r.ok) setConfirming(false);
    } catch {
      setMsg("ปิดวันไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section data-night-audit="" data-business-date={p.businessDate} className={`${CARD} flex flex-col gap-4 p-5`}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">{`ปิดวัน ${fmtThaiDate(p.businessDate)}`}</h2>
        <span className={`rounded-full border border-[color:var(--color-line)] px-3 py-1 text-xs ${SOFT}`}>
          {autoClose ? `ปิดอัตโนมัติทุกวัน ${auditTime}` : "ปิดอัตโนมัติ: ปิดอยู่ (ผู้จัดการกดปิดวันเอง)"}
        </span>
        <span className="flex-1" />
        {p.status === "REOPENED" ? <span className="text-sm font-semibold text-[color:var(--color-danger)]">เปิดอีกครั้ง — รอปิดใหม่</span> : null}
        {p.status === "CLOSED" ? <span className={`text-sm ${SOFT}`}>วันนี้ปิดแล้ว</span> : null}
      </div>

      {p.firstAudit ? (
        <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1">
            <span className={SOFT}>เริ่มใช้ night audit ตั้งแต่วันที่</span>
            <input type="date" name="date" defaultValue={p.businessDate} max={maxStart} className="min-h-[44px] rounded-xl border border-[color:var(--color-line)] px-3" />
          </label>
          <button type="submit" className="min-h-[44px] rounded-xl border border-[color:var(--color-line)] px-4">
            ดูตัวอย่าง
          </button>
          <span className={`text-xs ${SOFT}`}>คืนก่อนวันเริ่มใช้ไม่ลงค่าห้องย้อนหลัง (ค่าห้องเดิมอยู่ในยอดการจองแล้ว)</span>
        </form>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <dt className={SOFT}>ไม่มาเข้าพัก</dt>
          <dd className="text-xl font-bold tabular-nums">{`${fmtInt(p.noShows.length)} ราย`}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className={SOFT}>ลงค่าห้อง</dt>
          <dd className="text-xl font-bold tabular-nums">{`${fmtInt(p.roomNightsToPost)} คืน · ${fmtBaht(p.revenueSatang)}`}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className={SOFT}>ห้องค้างต่อ ⇒ รอแม่บ้าน</dt>
          <dd className="text-xl font-bold tabular-nums">{`${fmtInt(p.stayoversToDirty)} ห้อง`}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className={SOFT}>อัตราเข้าพัก (คาด)</dt>
          <dd className="text-xl font-bold tabular-nums">{`${fmtPct(p.kpi.occupancyBps)} · ${p.kpi.roomsOccupied}/${p.kpi.roomsAvailable}`}</dd>
        </div>
      </dl>

      {p.noShows.length ? (
        <div data-scroll-hint="" className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className={`border-b border-[color:var(--color-line)] text-left ${SOFT}`}>
                <th className="px-3 py-2 font-medium">รหัสการจองที่ไม่มา</th>
                <th className="px-3 py-2 text-right font-medium">มัดจำที่รับแล้ว</th>
                <th className="px-3 py-2 font-medium">นโยบาย</th>
              </tr>
            </thead>
            <tbody>
              {p.noShows.map((x) => (
                <tr key={x.reservationId} className="border-b border-[color:var(--color-line)] last:border-b-0">
                  <td className="px-3 py-2 font-medium">{x.code}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtBaht(x.depositSatang)}</td>
                  <td className={`px-3 py-2 ${SOFT}`}>{x.policy === "REFUND_RELEASE" ? "คืนมัดจำ ปล่อยห้อง" : x.policy === "FORFEIT_HOLD_STAY" ? "ริบมัดจำ ถือห้องไว้" : "ริบมัดจำ ปล่อยห้อง"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {p.warnings.length ? (
        <ul className="flex flex-col gap-1 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] p-3 text-sm">
          {p.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      {msg ? (
        <p role="status" className="rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] p-3 text-sm">
          {msg}
        </p>
      ) : null}

      {canClose && closable ? (
        confirming ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--color-line)] p-3">
            <span className="flex-1 text-sm">{`ยืนยันปิดวัน ${fmtThaiDate(p.businessDate)}? ระบบจะตั้งไม่มา ${p.noShows.length} ราย และลงค่าห้อง ${p.roomNightsToPost} คืน`}</span>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="min-h-[44px] rounded-xl border border-[color:var(--color-line)] px-4 text-sm">
              ยกเลิก
            </button>
            <button type="button" disabled={busy} onClick={() => void doClose()} className="min-h-[44px] rounded-xl bg-[color:var(--color-ink)] px-4 text-sm font-semibold text-[color:var(--color-surface)] disabled:opacity-60">
              {busy ? "กำลังปิดวัน…" : "ยืนยันปิดวัน"}
            </button>
          </div>
        ) : (
          <button type="button" data-audit-close="" onClick={() => setConfirming(true)} className="min-h-[44px] self-start rounded-xl bg-[color:var(--color-ink)] px-5 text-sm font-semibold text-[color:var(--color-surface)]">
            ปิดวัน
          </button>
        )
      ) : null}
      {canClose && p.tooEarly && p.status !== "CLOSED" ? <p className={`text-sm ${SOFT}`}>ยังปิดวันนี้ไม่ได้ — ปิดได้เฉพาะวันที่ผ่านไปแล้วตามเวลาของร้าน</p> : null}
    </section>
  );
}
