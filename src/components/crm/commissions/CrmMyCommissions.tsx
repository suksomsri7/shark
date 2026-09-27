"use client";

// CrmMyCommissions.tsx — "คอมมิชชันของฉัน" (ใบ C3.3 · พิมพ์เขียว §5.9 · ภาพ 10 ขวา) — แถวของตัวเองเท่านั้น (หน้า server โหลดผ่าน `mine`)
// 🔴 'use client' + ด่าน F2.3: ไม่ import โมดูล CRM — ป้ายไทย/ยอดรวมมาจากหน้า server ทาง props · ตัวกรองงวด/สถานะ = query string
// 🔴 ป้าย "รอผูกพนักงาน" (payroll = WAITING_EMPLOYEE) บอกพนักงานว่ายังส่งเข้าเงินเดือนไม่ได้เพราะยังไม่ผูกบัญชีกับพนักงาน HR
// 🔴 กว้าง 1440px และ 390px ไม่มีแถบเลื่อนแนวนอนของทั้งหน้า (ตารางมี overflow-x ของตัวเอง)

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CrmMyCommissionsData } from "./types";

const baht = (satang: number) => `${satang < 0 ? "−" : ""}฿${(Math.abs(satang) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

export function CrmMyCommissions({ data }: { data: CrmMyCommissionsData }) {
  const router = useRouter();
  const go = (period: string, status: string) => {
    const q = new URLSearchParams();
    if (period) q.set("period", period);
    if (status) q.set("status", status);
    const qs = q.toString();
    router.push(`/app/sys/${data.systemId}/crm/commissions${qs ? `?${qs}` : ""}`);
  };
  const t = data.totals;
  return (
    <section data-testid="crm-commission-mine" className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-xs">
          <span>งวด</span>
          <select data-testid="crm-commission-period" className="rounded-md border px-2 py-1 text-sm" value={data.period} onChange={(e) => go(e.target.value, data.status)}>
            <option value="">ทุกงวด</option>
            {data.periods.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs">
          <span>สถานะ</span>
          <select data-testid="crm-commission-status" className="rounded-md border px-2 py-1 text-sm" value={data.status} onChange={(e) => go(data.period, e.target.value)}>
            <option value="">ทุกสถานะ</option>
            {data.statuses.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      <dl className="grid min-w-0 grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-md border p-2"><dt className="text-[color:var(--color-muted)]">รออนุมัติ</dt><dd className="text-sm font-semibold tabular-nums">{baht(t.pendingSatang)}</dd></div>
        <div className="rounded-md border p-2"><dt className="text-[color:var(--color-muted)]">อนุมัติแล้ว</dt><dd className="text-sm font-semibold tabular-nums">{baht(t.approvedSatang)}</dd></div>
        <div className="rounded-md border p-2"><dt className="text-[color:var(--color-muted)]">จ่ายแล้ว</dt><dd className="text-sm font-semibold tabular-nums">{baht(t.paidSatang)}</dd></div>
        <div className="rounded-md border p-2"><dt className="text-[color:var(--color-muted)]">สุทธิ (หักถอนคืน)</dt><dd className="text-sm font-semibold tabular-nums">{baht(t.netSatang)}</dd></div>
      </dl>

      {data.rows.length === 0 ? (
        <p className="text-xs text-[color:var(--color-muted)]">ยังไม่มีคอมมิชชันในช่วงนี้ — เมื่อลูกค้าของดีลที่คุณดูแลจ่ายเงินหรือดีลปิดการขายตามกฎของร้าน รายการจะขึ้นที่นี่</p>
      ) : (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full text-left text-sm sm:min-w-[560px]">
            <thead className="text-xs text-[color:var(--color-muted)]">
              <tr>
                <th className="py-1 pr-2">ดีล</th>
                <th className="py-1 pr-2">งวด</th>
                <th className="py-1 pr-2 text-right">จำนวน</th>
                <th className="py-1 pr-2">สถานะ</th>
                <th className="py-1">เงินเดือน</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} data-testid={`crm-commission-mine-row-${r.id}`} className="border-t align-top">
                  <td className="max-w-[16rem] break-words py-1.5 pr-2">
                    <Link data-testid={`crm-commission-mine-deal-${r.id}`} href={`/app/sys/${data.systemId}/crm/deals/${r.dealId}`} className="underline-offset-2 hover:underline">
                      {r.dealTitle}
                    </Link>
                    <span className="block text-[11px] text-[color:var(--color-muted)]">{r.isReversal ? "ถอนคืน (รายการรับเงินถูกยกเลิก)" : r.basisLabel}</span>
                    {r.rewon && (
                      <span data-testid="crm-commission-rewon-badge" className="mt-0.5 inline-block rounded-full border px-1.5 text-[10px]">
                        {data.rewonLabel}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-xs">{r.periodKey}</td>
                  <td className={`py-1.5 pr-2 text-right tabular-nums ${r.amountSatang < 0 ? "text-[color:var(--color-danger)]" : ""}`}>{baht(r.amountSatang)}</td>
                  <td className="py-1.5 pr-2 text-xs">{r.statusLabel}</td>
                  <td className="py-1.5 text-xs">
                    {r.payroll === "WAITING_EMPLOYEE" ? (
                      <span data-testid="crm-commission-waiting-badge" className="rounded-full border px-1.5 text-[10px] text-[color:var(--color-warning,#b45309)]">
                        {data.waitingLabel}
                      </span>
                    ) : (
                      r.payrollLabel ?? "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
