"use client";
// SVC D.11 ▸ จอ "ค้างชำระ · ทวง · ค่าปรับ" — ภาพอ้างอิง ledger/design-dorm/06-slip-payments.png (การ์ด "ค้างจาก ต.ค. · ส่งเตือนแล้ว N ครั้ง" + ตาราง)
//   สัญญา DOM ledger/svc-briefs/svc-brief-d.11.md §7.2 · ข้อมูลทั้งหมดจาก overdueModel ของ facade หอ (ไฟล์นี้ import จากโมดูลได้เฉพาะ type)
//   • action รับทาง prop (ไม่ลาก prisma/โมดูลฝั่ง server/actions/next) ⇒ render ด้วย renderToStaticMarkup ได้ · ลิงก์ใช้ <a>
//   • เงินแสดงจากสตางค์จำนวนเต็ม (ไม่คำนวณเงินบนจอ) · ไม่มีเบอร์โทรผู้เช่า · ข้อความบริการล้วน ไม่มีปุ่มเกี่ยวกับน้ำไฟ/ห้อง (ประกาศ สคบ.)
//   • เดสก์ท็อป 1440 = การ์ด 4 ใบ + ตาราง · มือถือ 390 = การ์ดซ้อน 2 คอลัมน์ ตารางเลื่อนในกรอบตัวเอง ไม่ล้นแนวนอน
import { useState } from "react";
import type { OverdueModel, OverdueRow } from "@/lib/modules/dorm";

type ActionFn = (input: unknown) => Promise<unknown>;
export type OverdueActions = { dun: ActionFn; waive: ActionFn; promise: ActionFn };
export type OverdueScreenProps = { model: OverdueModel; unitSlug: string; actions: OverdueActions };

const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const pad2 = (n: number) => String(n).padStart(2, "0");
/** สตางค์ ⇒ "5,486.00" */
function money(satang: number): string {
  const a = Math.abs(Math.trunc(satang));
  return `${Math.trunc(a / 100).toLocaleString("en-US")}.${pad2(a % 100)}`;
}
/** "2026-10" ⇒ "ต.ค. 2569" */
function thMonth(p: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  return m ? `${MONTHS_SHORT[Number(m[2]) - 1] ?? ""} ${Number(m[1]) + 543}` : p;
}
/** "2026-11-05" ⇒ "5 พ.ย. 2569" */
function thDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${Number(m[3])} ${MONTHS_SHORT[Number(m[2]) - 1] ?? ""} ${Number(m[1]) + 543}` : ymd;
}
const reasonOf = (r: unknown): string | null => {
  if (!r || typeof r !== "object") return null;
  const x = r as { ok?: unknown; reason?: unknown };
  return x.ok === false && typeof x.reason === "string" ? x.reason : null;
};

function LateFeeCell({ r }: { r: OverdueRow }) {
  const f = r.lateFee;
  if (f.waiver === "APPLIED") return <span className="text-[color:var(--color-ink-soft)]">ยกเว้นแล้ว</span>;
  const pending = f.waiver === "PENDING" || f.waiver === "APPROVED";
  return (
    <span className="flex flex-col">
      <span className="tabular-nums">{f.dueSatang > 0 ? `฿${money(f.dueSatang)}` : "—"}</span>
      {f.chargedSatang > 0 ? <span className="text-xs text-[color:var(--color-ink-soft)]">{`ลงบิลแล้ว ฿${money(f.chargedSatang)}`}</span> : null}
      {pending ? <span className="text-xs text-[color:var(--color-warn,#b45309)]">รออนุมัติ</span> : null}
      {f.waiver === "REJECTED" ? <span className="text-xs text-[color:var(--color-ink-soft)]">ไม่อนุมัติยกเว้น</span> : null}
    </span>
  );
}

function DunningCell({ r }: { r: OverdueRow }) {
  const d = r.dunning;
  if (d.delivered > 0) return <span>{`ส่งเตือนแล้ว ${d.delivered} ครั้ง`}</span>;
  if (d.count > 0) return <span className="text-[color:var(--color-ink-soft)]">{`ติดตามแล้ว ${d.count} ครั้ง · ยังส่งไม่ถึงผู้เช่า`}</span>;
  return <span className="text-[color:var(--color-ink-soft)]">ยังไม่ได้ติดตาม</span>;
}

export default function OverdueScreen({ model, unitSlug, actions }: OverdueScreenProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState<{ kind: "waive" | "promise"; billId: string } | null>(null);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  const can = model.can;
  const k = model.kpi;
  const oldest = model.rows.reduce<string | null>((m, r) => (!m || r.periodKey < m ? r.periodKey : m), null);
  const rooms = [...new Set(model.rows.map((r) => r.roomNumber))];
  const delivered = model.rows.reduce((s, r) => s + r.dunning.delivered, 0);

  const run = async (key: string, fn: () => Promise<unknown>, okText: string) => {
    setBusy(key);
    setMsg(null);
    try {
      const r = await fn();
      setMsg(reasonOf(r) ?? okText);
      setForm(null);
    } catch {
      setMsg("ทำรายการไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      setBusy(null);
    }
  };
  // L7 ▸ ทวงทั้งหน้า: ข้ามแถวที่มีนัดจ่าย · 1 ข้อความต่อผู้เช่า (สัญญา) ต่อการกด — แต่ละบิลยังจำกัดวันละครั้งที่ฝั่งเซิร์ฟเวอร์
  const dunTargets = model.rows.filter((r, i, all) => !r.promiseDate && all.findIndex((x) => x.leaseId === r.leaseId && !x.promiseDate) === i);
  const dunAll = async () => {
    for (const r of dunTargets) await run(`dun:${r.billId}`, () => actions.dun({ billId: r.billId }), "ส่งข้อความติดตามแล้ว");
  };

  return (
    <div data-overdue="" data-as-of={model.asOf} className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">ค้างชำระ · ทวง · ค่าปรับ</h1>
          <p className="text-sm text-[color:var(--color-ink-soft)]">{`${model.unitName} · ข้อมูล ณ ${thDate(model.asOf)} · ข้อความทุกฉบับมาจากแม่แบบที่ตั้งไว้ ส่งนอกเวลาเงียบเท่านั้น`}</p>
        </div>
        {can.dun && dunTargets.length > 0 ? (
          <button
            type="button"
            data-dunning-send-all=""
            disabled={busy !== null}
            onClick={() => void dunAll()}
            className="rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-4 py-2 text-sm font-medium"
          >
            {`ทวงที่ยังไม่จ่าย (${dunTargets.length})`}
          </button>
        ) : null}
      </header>

      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <div data-overdue-kpi="count" className="flex flex-col gap-1 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4">
          <span className="text-sm text-[color:var(--color-ink-soft)]">ค้างเกินกำหนด</span>
          <span className="text-2xl font-bold tabular-nums">{`${k.count} บิล`}</span>
          <span className="text-xs text-[color:var(--color-ink-soft)]">{rooms.length ? rooms.join(" · ") : "ไม่มีห้องค้าง"}</span>
        </div>
        <div data-overdue-kpi="outstanding" className="flex flex-col gap-1 rounded-2xl border border-[color:var(--color-danger)] bg-[color:var(--color-surface)] p-4">
          <span className="text-sm text-[color:var(--color-ink-soft)]">{oldest ? `ค้างจาก ${thMonth(oldest).split(" ")[0]}` : "ค้างชำระ"}</span>
          <span className="text-2xl font-bold tabular-nums text-[color:var(--color-danger)]">{`฿${money(k.outstandingSatang)}`}</span>
          <span className="text-xs text-[color:var(--color-ink-soft)]">{`${rooms.join(" · ") || "—"} · ส่งเตือนแล้ว ${delivered} ครั้ง`}</span>
        </div>
        <div data-overdue-kpi="lateFee" className="flex flex-col gap-1 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4">
          <span className="text-sm text-[color:var(--color-ink-soft)]">ค่าปรับจ่ายช้าตามสัญญา</span>
          <span className="text-2xl font-bold tabular-nums">{`฿${money(k.lateFeeDueSatang)}`}</span>
          <span className="text-xs text-[color:var(--color-ink-soft)]">ลงบิลเดือนถัดไปอัตโนมัติ · ไม่คิดซ้อนบนค่าปรับ</span>
        </div>
        <div data-overdue-kpi="promised" className="flex flex-col gap-1 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4">
          <span className="text-sm text-[color:var(--color-ink-soft)]">นัดจ่าย</span>
          <span className="text-2xl font-bold tabular-nums">{`${k.promised} ห้อง`}</span>
          <span className="text-xs text-[color:var(--color-ink-soft)]">ระหว่างนัดระบบไม่ส่งข้อความติดตาม</span>
        </div>
      </div>

      {msg ? (
        <p role="status" className="rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] p-3 text-sm">
          {msg}
        </p>
      ) : null}

      <div className="min-w-0 overflow-hidden rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-line)] text-left text-xs text-[color:var(--color-ink-soft)]">
                <th className="px-4 py-3 font-medium">ห้อง</th>
                <th className="px-3 py-3 font-medium">งวด</th>
                <th className="px-3 py-3 font-medium">เลยกำหนด</th>
                <th className="px-3 py-3 text-right font-medium">ยอดค้าง</th>
                <th className="px-3 py-3 font-medium">ค่าปรับ</th>
                <th className="px-3 py-3 font-medium">ติดตาม</th>
                <th className="px-3 py-3 font-medium">นัดจ่าย</th>
                <th className="px-3 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {model.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[color:var(--color-ink-soft)]">
                    ไม่มีบิลค้างเกินกำหนด
                  </td>
                </tr>
              ) : null}
              {model.rows.map((r) => (
                <tr key={r.billId} data-overdue-row={r.roomNumber} data-period={r.periodKey} data-days-late={r.daysLate} className="border-b border-[color:var(--color-line)] align-top last:border-b-0">
                  <td className="px-4 py-3">
                    <span className="font-semibold">{r.roomNumber}</span> <span className="text-[color:var(--color-ink-soft)]">{r.tenantName}</span>
                  </td>
                  <td className="px-3 py-3">{`${thMonth(r.periodKey)} · ครบ ${thDate(r.dueDate)}`}</td>
                  <td className="px-3 py-3 tabular-nums">{`${r.daysLate} วัน`}</td>
                  <td data-col="outstanding" className="px-3 py-3 text-right tabular-nums text-[color:var(--color-danger)]">
                    {money(r.outstandingSatang)}
                    {r.hasDoc ? null : <span className="block text-xs text-[color:var(--color-ink-soft)]">ยอดยกมา</span>}
                  </td>
                  <td data-col="lateFee" className="px-3 py-3">
                    <LateFeeCell r={r} />
                  </td>
                  <td data-col="dunning" className="px-3 py-3">
                    <DunningCell r={r} />
                  </td>
                  <td data-col="promise" className="px-3 py-3">
                    {r.promiseDate ? `นัด ${thDate(r.promiseDate)}` : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      {can.dun ? (
                        <button
                          type="button"
                          data-dunning-send={r.billId}
                          disabled={busy !== null}
                          onClick={() => void run(`dun:${r.billId}`, () => actions.dun({ billId: r.billId }), "ส่งข้อความติดตามแล้ว")}
                          className="rounded-lg border border-[color:var(--color-line)] px-3 py-1.5 text-xs"
                        >
                          ส่งข้อความติดตาม
                        </button>
                      ) : null}
                      {can.waive && r.hasDoc ? (
                        <button type="button" data-latefee-waive={r.billId} disabled={busy !== null} onClick={() => setForm({ kind: "waive", billId: r.billId })} className="rounded-lg border border-[color:var(--color-line)] px-3 py-1.5 text-xs">
                          ยกเว้นค่าปรับ
                        </button>
                      ) : null}
                      {!can.waive && can.requestWaive && r.hasDoc ? (
                        <button type="button" data-latefee-request={r.billId} disabled={busy !== null} onClick={() => setForm({ kind: "waive", billId: r.billId })} className="rounded-lg border border-[color:var(--color-line)] px-3 py-1.5 text-xs">
                          ขอยกเว้นค่าปรับ
                        </button>
                      ) : null}
                      {can.promise ? (
                        <button type="button" data-promise={r.billId} disabled={busy !== null} onClick={() => setForm({ kind: "promise", billId: r.billId })} className="rounded-lg border border-[color:var(--color-line)] px-3 py-1.5 text-xs">
                          นัดจ่าย
                        </button>
                      ) : null}
                      {can.notice ? (
                        <a data-notice={r.leaseId} href={`/app/u/${unitSlug}/dorm/overdue/${r.leaseId}/notice`} className="rounded-lg px-3 py-1.5 text-xs underline">
                          หนังสือบอกเลิกสัญญา
                        </a>
                      ) : null}
                    </div>
                    {form && form.billId === r.billId ? (
                      <div className="mt-2 flex flex-col gap-2 rounded-xl border border-dashed border-[color:var(--color-line)] p-3">
                        {form.kind === "waive" ? (
                          <>
                            <label className="text-xs text-[color:var(--color-ink-soft)]">เหตุผลการยกเว้น (อย่างน้อย 10 ตัวอักษร · เก็บเป็นหลักฐาน)</label>
                            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="rounded-lg border border-[color:var(--color-line)] p-2 text-sm" />
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => void run(`waive:${r.billId}`, () => actions.waive({ sourceBillId: r.billId, reason }), can.waive ? "ยกเว้นค่าปรับแล้ว" : "ส่งคำขอยกเว้นให้เจ้าของอนุมัติแล้ว")}
                              className="self-end rounded-lg bg-[color:var(--color-ink)] px-3 py-1.5 text-xs text-[color:var(--color-surface)]"
                            >
                              {can.waive ? "ยืนยันยกเว้น" : "ส่งคำขอ"}
                            </button>
                          </>
                        ) : (
                          <>
                            <label className="text-xs text-[color:var(--color-ink-soft)]">วันที่ผู้เช่านัดจ่าย (เว้นว่าง = ยกเลิกนัด)</label>
                            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-[color:var(--color-line)] p-2 text-sm" />
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => void run(`promise:${r.billId}`, () => actions.promise({ billId: r.billId, promiseDate: date || null }), date ? "บันทึกวันนัดจ่ายแล้ว" : "ยกเลิกนัดจ่ายแล้ว")}
                              className="self-end rounded-lg bg-[color:var(--color-ink)] px-3 py-1.5 text-xs text-[color:var(--color-surface)]"
                            >
                              บันทึก
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
