"use client";
// SVC D.19 ▸ จอ "รายงานหอ" — ภาพอ้างอิง ledger/design-dorm/14-dorm-reports.png **เฉพาะส่วนพื้นฐาน** (ใบสั่ง ledger/svc-briefs/svc-brief-d.19.md §4)
//   วาด: ช่วง (เดือนนี้ · 6 เดือน · ปีนี้) · KPI อัตราเข้าพัก/เก็บแล้ว/ค้างเกินกำหนด · ยอดบิลรายเดือน + อัตราเข้าพัก · ลูกหนี้ตามอายุ 4 ถัง (ดึงจากบัญชี V2)
//         · ลูกหนี้รายห้อง · รายได้แยกประเภท (ไม่รวม VAT / VAT / รวม VAT) · ปุ่มส่งออก Excel (CSV)
//   ไม่วาด (ใบเลื่อน RP.2 — ไม่มีตัวเลขปลอม): ต้นทุนน้ำไฟที่หอแบก · รายได้ที่เสียจากห้องว่าง · ผู้เช่าจ่ายช้าซ้ำ · ต้นทุนน้ำไฟรายเดือน
//   • ข้อมูลทั้งหมดจาก dormReportModel (ไฟล์นี้ import จากโมดูลได้เฉพาะ type) · action ส่งออกรับทาง prop ⇒ renderToStaticMarkup ได้
//   • เงินแสดงจากสตางค์จำนวนเต็ม (ไม่คำนวณยอดบนจอ นอกจากรวมถัง "เกิน 60 วัน" ตามสัญญา) · ชื่อผู้เช่า = ชื่อแรก · ไม่มีเบอร์โทร
//   • เดสก์ท็อป 1440 = KPI 3 ช่อง + กราฟ/ลูกหนี้คู่กัน + ตาราง · มือถือ 390 = ซ้อนคอลัมน์เดียว ตารางเลื่อนในกรอบตัวเอง ไม่ล้นแนวนอน
import { useState } from "react";
import type { DormAgingBuckets, DormReportModel, DormRevenueType } from "@/lib/modules/dorm";

type ExportKind = "AGING" | "OCCUPANCY" | "REVENUE";
export type DormReportsActions = { exportCsv: (kind: ExportKind, fromMonth: string | null, toMonth: string | null) => Promise<unknown> };
export type DormReportsProps = { model: DormReportModel & { ok?: true }; unitSlug: string; actions: DormReportsActions };

const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const RANGE_LINKS: { range: DormReportModel["range"]; label: string }[] = [
  { range: "MONTH", label: "เดือนนี้" },
  { range: "6M", label: "6 เดือน" },
  { range: "YEAR", label: "ปีนี้" },
];
const RANGE_TH: Record<DormReportModel["range"], string> = { MONTH: "เดือนนี้", "6M": "6 เดือน", YEAR: "ปีนี้" };
const REV_COLS: { type: DormRevenueType; label: string }[] = [
  { type: "RENT", label: "ค่าเช่า" },
  { type: "COMMON", label: "ส่วนกลาง" },
  { type: "ELEC", label: "ไฟ" },
  { type: "WATER", label: "น้ำ" },
  { type: "LATE_FEE", label: "ค่าปรับ" },
  { type: "OTHER", label: "อื่น ๆ" },
  { type: "ADJUST", label: "ปรับยอด" },
];
const EXPORTS: { kind: ExportKind; label: string }[] = [
  { kind: "AGING", label: "ลูกหนี้" },
  { kind: "OCCUPANCY", label: "เข้าพัก" },
  { kind: "REVENUE", label: "รายได้" },
];

const pad2 = (n: number) => String(n).padStart(2, "0");
/** สตางค์ ⇒ "฿10,200.40" · ติดลบ "-฿300.00" */
function baht(satang: number): string {
  const a = Math.abs(Math.trunc(satang));
  return `${satang < 0 ? "-" : ""}฿${Math.trunc(a / 100).toLocaleString("en-US")}.${pad2(a % 100)}`;
}
/** สตางค์ ⇒ "฿183.4k" (หัวแท่งกราฟ) */
function bahtShort(satang: number): string {
  const b = satang / 100;
  return Math.abs(b) >= 1000 ? `฿${(b / 1000).toFixed(1)}k` : `฿${Math.round(b).toLocaleString("en-US")}`;
}
const pct = (bp: number) => `${(bp / 100).toFixed(1)}%`;
/** "2026-10" ⇒ "ต.ค." */
const thMonthShort = (p: string) => MONTHS_SHORT[Number(p.slice(5, 7)) - 1] ?? p;
/** "2026-10" ⇒ "ต.ค. 2569" */
const thMonth = (p: string) => (/^\d{4}-\d{2}$/.test(p) ? `${thMonthShort(p)} ${Number(p.slice(0, 4)) + 543}` : p);
/** "2026-11-03" ⇒ "3 พ.ย." */
const thDay = (ymd: string) => (/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${Number(ymd.slice(8, 10))} ${thMonthShort(ymd.slice(0, 7))}` : ymd);
const overdueOf = (b: DormAgingBuckets) => b.d1_30Satang + b.d31_60Satang + b.d61_90Satang + b.d90plusSatang;
const reasonOf = (r: unknown): string | null => {
  if (!r || typeof r !== "object") return null;
  const x = r as { ok?: unknown; reason?: unknown };
  return x.ok === false && typeof x.reason === "string" ? x.reason : null;
};
const fileOf = (r: unknown): { filename: string; csv: string } | null => {
  if (!r || typeof r !== "object") return null;
  const x = r as { ok?: unknown; filename?: unknown; csv?: unknown };
  return x.ok === true && typeof x.filename === "string" && typeof x.csv === "string" ? { filename: x.filename, csv: x.csv } : null;
};

const CARD = "min-w-0 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)]";
const SOFT = "text-[color:var(--color-ink-soft)]";

export default function DormReports({ model, actions }: DormReportsProps) {
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const k = model.kpi;
  const a = model.aging;
  const b = a.buckets;
  const months = model.revenue.months;
  const occ = new Map(model.occupancy.months.map((m) => [m.month, m]));
  const maxGross = Math.max(1, ...months.map((m) => m.total.grossSatang));
  const agingCards: { key: string; label: string; satang: number; danger: boolean }[] = [
    { key: "notDue", label: "ยังไม่ครบกำหนด", satang: b.notDueSatang, danger: false },
    { key: "d1_30", label: "เลย 1–30 วัน", satang: b.d1_30Satang, danger: true },
    { key: "d31_60", label: "เลย 31–60 วัน", satang: b.d31_60Satang, danger: true },
    { key: "d60plus", label: "เกิน 60 วัน", satang: b.d61_90Satang + b.d90plusSatang, danger: true },
  ];
  const agingMax = Math.max(1, ...agingCards.map((c) => c.satang));
  const overdueRows = a.rows.filter((r) => overdueOf(r.buckets) > 0);
  const oldest = b.d90plusSatang > 0 ? "เกิน 90 วัน" : b.d61_90Satang > 0 ? "61–90 วัน" : b.d31_60Satang > 0 ? "31–60 วัน" : b.d1_30Satang > 0 ? "1–30 วัน" : null;
  const g = model.revenue.grand;

  const doExport = async (kind: ExportKind) => {
    setBusy(kind);
    setMsg(null);
    try {
      const r = await actions.exportCsv(kind, kind === "AGING" ? null : model.fromMonth, kind === "AGING" ? null : model.toMonth);
      const f = fileOf(r);
      if (!f) {
        setMsg(reasonOf(r) ?? "ส่งออกไม่สำเร็จ — ลองใหม่อีกครั้ง");
        return;
      }
      const url = URL.createObjectURL(new Blob([f.csv], { type: "text/csv;charset=utf-8" }));
      const el = document.createElement("a");
      el.href = url;
      el.download = f.filename;
      document.body.appendChild(el);
      el.click();
      el.remove();
      URL.revokeObjectURL(url);
    } catch {
      setMsg("ส่งออกไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div data-dorm-reports="" data-from={model.fromMonth} data-to={model.toMonth} className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">รายงานหอ</h1>
        <nav aria-label="ช่วงรายงาน" className="flex rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] p-1">
          {RANGE_LINKS.map((x) =>
            x.range === model.range ? (
              <a key={x.range} data-range={x.range} aria-current="page" href={`?range=${x.range}`} className="flex min-h-[40px] items-center rounded-lg bg-[color:var(--color-surface)] px-4 text-sm font-semibold shadow-sm">
                {x.label}
              </a>
            ) : (
              <a key={x.range} data-range={x.range} href={`?range=${x.range}`} className={`flex min-h-[40px] items-center rounded-lg px-4 text-sm ${SOFT}`}>
                {x.label}
              </a>
            ),
          )}
        </nav>
        <span className="flex-1" />
        <div className="flex flex-wrap gap-2">
          {EXPORTS.map((x) => (
            <button
              key={x.kind}
              type="button"
              data-report-export={x.kind}
              disabled={busy !== null}
              onClick={() => void doExport(x.kind)}
              className="min-h-[44px] rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-4 text-sm font-medium disabled:opacity-60"
            >
              {busy === x.kind ? "กำลังส่งออก…" : `ส่งออก Excel · ${x.label}`}
            </button>
          ))}
        </div>
      </header>
      <p className={`-mt-3 text-sm ${SOFT}`}>{`${model.unitName} · ${thMonth(model.fromMonth)} – ${thMonth(model.toMonth)} · ข้อมูล ณ ${thDay(model.asOf)} ${Number(model.asOf.slice(0, 4)) + 543}`}</p>

      {msg ? (
        <p role="status" className="rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] p-3 text-sm">
          {msg}
        </p>
      ) : null}

      <div className={`${CARD} grid grid-cols-1 divide-y divide-[color:var(--color-line)] sm:grid-cols-3 sm:divide-x sm:divide-y-0`}>
        <div data-report-kpi="occupancy" className="flex flex-col gap-1 p-5">
          <span className={`text-sm ${SOFT}`}>{`อัตราเข้าพักเฉลี่ย ${RANGE_TH[model.range]}`}</span>
          <span className="text-3xl font-bold tabular-nums">{pct(k.occupancyAvgBp)}</span>
          <span className={`text-sm ${SOFT}`}>{`${thMonthShort(model.toMonth)} ${pct(k.occupancyCurrentBp)} · นับห้อง-วันที่มีผู้เช่า`}</span>
        </div>
        <div data-report-kpi="collected" className="flex flex-col gap-1 p-5">
          <span className={`text-sm ${SOFT}`}>{`บิล ${thMonthShort(k.collected.periodKey)} เก็บแล้ว`}</span>
          <span className="text-3xl font-bold tabular-nums">{pct(k.collected.rateBp)}</span>
          <span className={`text-sm tabular-nums ${SOFT}`}>{`${baht(k.collected.collectedSatang)} จาก ${baht(k.collected.billedGrossSatang)}`}</span>
        </div>
        <div data-report-kpi="overdue" className="flex flex-col gap-1 p-5">
          <span className={`text-sm ${SOFT}`}>ค้างเกินกำหนด</span>
          <span className={`text-3xl font-bold tabular-nums ${k.overdue.satang > 0 ? "text-[color:var(--color-danger)]" : ""}`}>{baht(k.overdue.satang)}</span>
          <span className={`text-sm ${SOFT}`}>{`${k.overdue.rooms} ห้อง${oldest ? ` · เก่าสุด ${oldest}` : ""}`}</span>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
        <section className={`${CARD} flex flex-col gap-4 p-5`}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-bold">ยอดบิลรายเดือน · อัตราเข้าพัก</h2>
            <span className="flex-1" />
            <span className={`flex items-center gap-3 text-xs ${SOFT}`}>
              <span className="flex items-center gap-1">
                <i className="inline-block h-2.5 w-2.5 rounded-sm bg-[color:var(--color-ink)]" />
                เดือนล่าสุด
              </span>
              <span className="flex items-center gap-1">
                <i className="inline-block h-2.5 w-2.5 rounded-sm bg-[color:var(--color-line)]" />
                เดือนก่อน ๆ
              </span>
            </span>
          </div>
          <div className="overflow-x-auto">
            <div className="flex h-[190px] min-w-[320px] items-end gap-3 px-1">
              {months.map((m, i) => {
                const o = occ.get(m.periodKey);
                const last = i === months.length - 1;
                const h = Math.max(4, Math.round((Math.max(0, m.total.grossSatang) / maxGross) * 120));
                return (
                  <div key={m.periodKey} data-report-month={m.periodKey} data-occupancy-bp={o?.rateBp ?? 0} className="flex h-full min-w-[36px] flex-1 flex-col items-center justify-end gap-1.5 text-xs">
                    <b className="text-[12.5px] font-semibold tabular-nums">{bahtShort(m.total.grossSatang)}</b>
                    <i className={`block w-full rounded-t-md ${last ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-line)]"}`} style={{ height: `${h}px` }} />
                    <span className={`whitespace-nowrap ${SOFT}`}>{`${thMonthShort(m.periodKey)} · ${pct(o?.rateBp ?? 0)}`}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className={`${CARD} flex flex-col gap-3 p-5`}>
          <h2 className="text-base font-bold">{`ลูกหนี้ผู้เช่าตามอายุ (${thDay(a.asOf)})`}</h2>
          <div className="flex flex-col gap-3">
            {agingCards.map((c) => {
              const hot = c.danger && c.satang > 0;
              return (
                <div key={c.key} data-aging-bucket={c.key} className="flex items-center gap-3 text-sm">
                  <span className={`w-28 shrink-0 ${SOFT}`}>{c.label}</span>
                  <span className="block h-2.5 flex-1 overflow-hidden rounded-full bg-[color:var(--color-surface-2)]">
                    <i
                      className={`block h-full rounded-full ${hot ? "bg-[color:var(--color-danger)]" : "bg-[color:var(--color-line)]"}`}
                      style={{ width: `${c.satang > 0 ? Math.max(2, Math.round((c.satang / agingMax) * 100)) : 0}%` }}
                    />
                  </span>
                  <span className={`w-32 shrink-0 text-right font-semibold tabular-nums ${hot ? "text-[color:var(--color-danger)]" : ""}`}>{baht(c.satang)}</span>
                </div>
              );
            })}
          </div>
          <p className={`text-[13px] ${SOFT}`}>
            {`รวมค้าง ${baht(b.totalSatang)}${a.noDocSatang > 0 ? ` (ยอดยกมาไม่มีเอกสาร ${baht(a.noDocSatang)})` : ""} · ดึงจากบัญชี V2 (ลูกหนี้)`}
          </p>
        </section>
      </div>

      <section className={`${CARD} overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-2 px-5 pb-2 pt-5">
          <h2 className="text-base font-bold">ลูกหนี้รายห้อง</h2>
          <span className={`text-sm ${SOFT}`}>{overdueRows.length ? `เลยกำหนด ${overdueRows.length} ห้อง` : "ไม่มีห้องเลยกำหนด"}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className={`border-b border-[color:var(--color-line)] text-left text-xs ${SOFT}`}>
                <th className="px-5 py-3 font-medium">ห้อง</th>
                <th className="px-3 py-3 font-medium">ผู้เช่า</th>
                <th className="px-3 py-3 text-right font-medium">ยังไม่ครบกำหนด</th>
                <th className="px-3 py-3 text-right font-medium">1–30 วัน</th>
                <th className="px-3 py-3 text-right font-medium">31–60 วัน</th>
                <th className="px-3 py-3 text-right font-medium">เกิน 60 วัน</th>
                <th className="px-5 py-3 text-right font-medium">รวม</th>
              </tr>
            </thead>
            <tbody>
              {a.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className={`px-5 py-8 text-center ${SOFT}`}>
                    ไม่มียอดค้าง
                  </td>
                </tr>
              ) : null}
              {a.rows.map((r) => {
                const late = overdueOf(r.buckets) > 0;
                return (
                  <tr key={r.leaseId} data-aging-row={r.leaseId} className="border-b border-[color:var(--color-line)] last:border-b-0">
                    <td className="px-5 py-3 font-semibold">{r.roomNumber}</td>
                    <td className="px-3 py-3">{r.tenantFirstName ?? "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{baht(r.buckets.notDueSatang)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{baht(r.buckets.d1_30Satang)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{baht(r.buckets.d31_60Satang)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{baht(r.buckets.d61_90Satang + r.buckets.d90plusSatang)}</td>
                    <td className={`px-5 py-3 text-right font-semibold tabular-nums ${late ? "text-[color:var(--color-danger)]" : ""}`}>{baht(r.buckets.totalSatang)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${CARD} overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-2 px-5 pb-2 pt-5">
          <h2 className="text-base font-bold">รายได้แยกประเภท ตามงวดบิล</h2>
          <span className={`text-sm ${SOFT}`}>ช่องประเภทแสดงยอดรวม VAT · แถวรวมแยก ไม่รวม VAT / VAT / รวม VAT</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className={`border-b border-[color:var(--color-line)] text-left text-xs ${SOFT}`}>
                <th className="px-5 py-3 font-medium">งวด</th>
                {REV_COLS.map((c) => (
                  <th key={c.type} className="px-3 py-3 text-right font-medium">
                    {c.label}
                  </th>
                ))}
                <th className="px-3 py-3 text-right font-medium">รวม VAT</th>
                <th className="px-5 py-3 text-right font-medium">เก็บแล้ว</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.periodKey} data-revenue-row={m.periodKey} className="border-b border-[color:var(--color-line)]">
                  <td className="px-5 py-3">
                    <span className="font-semibold">{thMonth(m.periodKey)}</span>
                    <span className={`block text-xs ${SOFT}`}>{`${m.bills} บิล`}</span>
                  </td>
                  {REV_COLS.map((c) => (
                    <td key={c.type} data-rev={c.type} className="px-3 py-3 text-right tabular-nums">
                      {baht(m.types[c.type].grossSatang)}
                    </td>
                  ))}
                  <td data-rev="TOTAL" className="px-3 py-3 text-right font-semibold tabular-nums">
                    {baht(m.total.grossSatang)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{baht(m.collectedSatang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 gap-3 border-t border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-5 py-4 text-sm sm:grid-cols-4">
          <div data-rev-total="net" className="flex flex-col">
            <span className={`text-xs ${SOFT}`}>รวมทั้งช่วง ไม่รวม VAT</span>
            <span className="font-semibold tabular-nums">{baht(g.total.netSatang)}</span>
          </div>
          <div data-rev-total="vat" className="flex flex-col">
            <span className={`text-xs ${SOFT}`}>VAT</span>
            <span className="font-semibold tabular-nums">{baht(g.total.vatSatang)}</span>
          </div>
          <div data-rev-total="gross" className="flex flex-col">
            <span className={`text-xs ${SOFT}`}>รวม VAT</span>
            <span className="font-semibold tabular-nums">{baht(g.total.grossSatang)}</span>
          </div>
          <div className="flex flex-col">
            <span className={`text-xs ${SOFT}`}>เก็บแล้ว</span>
            <span className="font-semibold tabular-nums">{baht(g.collectedSatang)}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
