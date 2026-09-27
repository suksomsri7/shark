"use client";

// CrmAiHomeAtRisk.tsx — "ดีลไหนเสี่ยงเดือนนี้" บนหน้าแรก CRM (ใบ C3.4 · ภาพ 14 ซ้าย)
//   กด → ตารางดีลเสี่ยง (ดีล · บริษัท · มูลค่า · เหตุผล) + ข้อความสรุปจากผู้ช่วย + การ์ดข้อเสนอ
//   "สร้างงานติดตาม · มอบผู้ดูแลดีลเดิม · กำหนดพรุ่งนี้ 09:00" (อนุมัติ · แก้ไข · ยกเลิก)
//
// 🔴 ชุดดีล = `crm.aiBridges.atRiskDeals` ตัวเดียวกับ tool `crm_deals_at_risk` (การมองเห็นของคนกด) · กดซ้ำ/หลายแท็บ = ข้อเสนอใบเดิม
// 🔴 390 px: ตารางอยู่ในกล่องเลื่อนแนวนอน (overflow-x-auto) — หน้าไม่ล้น · ไม่มีกล่องเตือนของเบราว์เซอร์ · 'use client' ไม่ import โมดูล CRM (F2.3)

import Link from "next/link";
import { useState } from "react";
import { runAssistAction } from "@/app/app/sys/[id]/crm/_actions/ai";
import { CrmAiProposalCard } from "./CrmAiProposalCard";
import type { CrmAiReasonLabels, CrmAiResult } from "./types";

const muted = "text-[color:var(--color-muted)]";
const baht = (satang: number) => `฿${(satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 0 })}`;

export function CrmAiHomeAtRisk({ systemId, reasonLabels }: { systemId: string; reasonLabels: CrmAiReasonLabels }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CrmAiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const r = await runAssistAction(systemId, "home.atRisk", null);
    setBusy(false);
    if (r.ok) setResult(r.result);
    else {
      setResult(null);
      setError(r.error);
    }
  }

  const items = result?.items ?? [];
  return (
    <section id="crm-ai-at-risk" className="card flex min-w-0 flex-col gap-3 p-4" aria-label="ดีลไหนเสี่ยงเดือนนี้">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-base font-semibold">ดีลไหนเสี่ยงเดือนนี้</h2>
        <button type="button" className="btn btn-primary btn-sm shrink-0" onClick={run} disabled={busy} data-testid="crm-ai-home-at-risk">
          {busy ? "กำลังวิเคราะห์…" : result ? "วิเคราะห์ใหม่" : "ถามผู้ช่วย"}
        </button>
      </div>
      {!result && !error && <p className={`text-xs ${muted}`}>ผู้ช่วยดูดีลที่คาดว่าจะปิดภายในเดือนนี้ (รวมที่เลยกำหนด) แล้วบอกว่าดีลไหนนิ่ง เลยวันปิด หรือไม่มีงานถัดไป</p>}
      {error && (
        <p role="alert" className="text-sm text-[color:var(--color-danger)]" data-testid="crm-ai-home-error">
          {error}
        </p>
      )}
      {result && (
        <>
          <p className="whitespace-pre-wrap break-words text-sm">{result.text}</p>
          {items.length > 0 && (
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full text-sm" data-testid="crm-ai-at-risk-table">
                <thead>
                  <tr className={`border-b text-left text-xs ${muted}`}>
                    <th className="py-2 pr-2 font-semibold">ดีล</th>
                    <th className="py-2 pr-2 font-semibold">บริษัท</th>
                    <th className="py-2 pr-2 text-right font-semibold">มูลค่า</th>
                    <th className="py-2 font-semibold">เหตุผล</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((x) => (
                    <tr key={x.dealId} className="border-b align-top last:border-0">
                      <td className="py-2 pr-2">
                        <Link href={`/app/sys/${systemId}/crm/deals/${x.dealId}`} className="font-medium underline" data-testid={`crm-ai-at-risk-deal-${x.dealId}`}>
                          {x.title}
                        </Link>
                      </td>
                      <td className="py-2 pr-2">{x.companyName ?? "—"}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{baht(x.valueSatang)}</td>
                      <td className={`py-2 text-xs ${muted}`}>{x.reasons.map((k) => reasonLabels[k] ?? k).join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.proposalId && (
            <CrmAiProposalCard key={result.proposalId} systemId={systemId} proposalId={result.proposalId} summary={result.proposalSummary ?? "สร้างงานติดตามของดีลเสี่ยง"} items={items} />
          )}
        </>
      )}
    </section>
  );
}
