"use client";

// CrmAiPanel.tsx — แผง "ผู้ช่วย AI" บนดีล 360 · ผู้ติดต่อ 360 · บริษัท 360 (ใบ C3.4 · ภาพ 14 ซ้าย)
//   ดีล: สรุปดีล · ทำไมเสี่ยง · เสนอขั้นถัดไป (→ ข้อเสนอให้กดอนุมัติ) · ร่างอีเมลติดตาม (ร่างเท่านั้น ไม่ส่ง)
//   ผู้ติดต่อ: ทำไมคะแนนร้อน · ร่างข้อความปิดการขาย · บริษัท: สรุปบริษัท · โอกาสต่อยอดจากประวัติการซื้อ
//
// 🔴 ทุกปุ่มเรียก server action `_actions/ai.ts#runAssistAction` → `crm.aiBridges.runAssist` (การมองเห็นของคนกด · เครดิต AI ·
//    ข้อเสนอ 24 ชม.) — ผู้ช่วยไม่เคยเขียนเอง · ผลลัพธ์/ข้อผิดพลาดแสดง inline (ไม่มีกล่องเตือนของเบราว์เซอร์)
// 🔴 data-testid เขียนตรง ๆ ทีละปุ่ม (ด่าน F14.1 อ่านค่าจากโค้ด — testid ที่มาจากตัวแปรลงทะเบียนไม่ได้)
// 🔴 'use client' — ไม่ import โมดูล CRM (F2.3)

import { useState } from "react";
import { runAssistAction } from "@/app/app/sys/[id]/crm/_actions/ai";
import { CrmAiProposalCard } from "./CrmAiProposalCard";
import type { CrmAiResult } from "./types";

const muted = "text-[color:var(--color-muted)]";

export function CrmAiPanel({ systemId, entity, entityId }: { systemId: string; entity: "deal" | "contact" | "company"; entityId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<CrmAiResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run(kind: string) {
    setBusy(kind);
    setError(null);
    setCopied(false);
    const r = await runAssistAction(systemId, kind, entityId);
    setBusy(null);
    if (r.ok) setResult(r.result);
    else {
      setResult(null);
      setError(r.error);
    }
  }

  async function copyDraft() {
    if (!result) return;
    const text = [result.subject ? `หัวข้อ: ${result.subject}` : "", result.body ?? result.text].filter(Boolean).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError("คัดลอกอัตโนมัติไม่ได้ในเบราว์เซอร์นี้ — เลือกข้อความแล้วคัดลอกเองได้เลย");
    }
  }

  const btn = "btn btn-ghost btn-sm justify-start text-left";
  return (
    <section className="card flex min-w-0 flex-col gap-3 p-4" data-testid={`crm-ai-panel-${entity}`} aria-label="ผู้ช่วย AI">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <span aria-hidden="true">✦</span>
        ผู้ช่วย AI
      </h2>
      <div className="flex flex-wrap gap-2">
        {entity === "deal" && (
          <>
            <button type="button" className={btn} disabled={!!busy} onClick={() => run("deal.summary")} data-testid="crm-ai-deal-summary">
              {busy === "deal.summary" ? "กำลังสรุป…" : "สรุปดีล"}
            </button>
            <button type="button" className={btn} disabled={!!busy} onClick={() => run("deal.risk")} data-testid="crm-ai-deal-risk">
              {busy === "deal.risk" ? "กำลังวิเคราะห์…" : "ทำไมเสี่ยง"}
            </button>
            <button type="button" className={btn} disabled={!!busy} onClick={() => run("deal.nextStep")} data-testid="crm-ai-deal-next-step">
              {busy === "deal.nextStep" ? "กำลังคิด…" : "เสนอขั้นถัดไป"}
            </button>
            <button type="button" className={btn} disabled={!!busy} onClick={() => run("deal.draftEmail")} data-testid="crm-ai-deal-draft-email">
              {busy === "deal.draftEmail" ? "กำลังร่าง…" : "ร่างอีเมลติดตาม"}
            </button>
          </>
        )}
        {entity === "contact" && (
          <>
            <button type="button" className={btn} disabled={!!busy} onClick={() => run("contact.whyHot")} data-testid="crm-ai-contact-why-hot">
              {busy === "contact.whyHot" ? "กำลังวิเคราะห์…" : "ทำไมคะแนนร้อน"}
            </button>
            <button type="button" className={btn} disabled={!!busy} onClick={() => run("contact.closingMessage")} data-testid="crm-ai-contact-closing">
              {busy === "contact.closingMessage" ? "กำลังร่าง…" : "ร่างข้อความปิดการขาย"}
            </button>
          </>
        )}
        {entity === "company" && (
          <>
            <button type="button" className={btn} disabled={!!busy} onClick={() => run("company.summary")} data-testid="crm-ai-company-summary">
              {busy === "company.summary" ? "กำลังสรุป…" : "สรุปบริษัท"}
            </button>
            <button type="button" className={btn} disabled={!!busy} onClick={() => run("company.upsell")} data-testid="crm-ai-company-upsell">
              {busy === "company.upsell" ? "กำลังวิเคราะห์…" : "โอกาสต่อยอด"}
            </button>
          </>
        )}
      </div>
      <p className={`text-xs ${muted}`}>ผู้ช่วยอ่านเฉพาะข้อมูลที่คุณเห็น และไม่ส่งเบอร์ อีเมล หรือเลขภาษีของลูกค้าออกไป · ทุกครั้งที่กดใช้เครดิต AI ของร้าน</p>

      {error && (
        <p role="alert" className="text-sm text-[color:var(--color-danger)]" data-testid="crm-ai-error">
          {error}
        </p>
      )}

      {result && (
        <div className="flex min-w-0 flex-col gap-2" data-testid="crm-ai-result">
          {result.subject !== undefined ? (
            <div className="flex min-w-0 flex-col gap-1 rounded-lg border p-3 text-sm">
              <p className={`text-xs ${muted}`}>ร่างอีเมล — ยังไม่ได้ส่ง (ตรวจแล้วคัดลอกไปส่งเอง หรือใช้หน้าอีเมลของผู้ติดต่อ)</p>
              <p className="break-words font-semibold">{result.subject}</p>
              <p className="whitespace-pre-wrap break-words">{result.body ?? result.text}</p>
              <button type="button" className="btn btn-ghost btn-sm self-start" onClick={copyDraft} data-testid="crm-ai-draft-copy">
                {copied ? "คัดลอกแล้ว" : "คัดลอกร่าง"}
              </button>
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm">{result.text}</p>
          )}
          {result.kbArticleIds && result.kbArticleIds.length > 0 && (
            <p className={`text-xs ${muted}`}>อ้างอิงคลังความรู้ของร้าน {result.kbArticleIds.length.toLocaleString("th-TH")} บทความ</p>
          )}
          {result.proposalId && (
            <CrmAiProposalCard
              key={result.proposalId}
              systemId={systemId}
              proposalId={result.proposalId}
              summary={result.proposalSummary ?? "ข้อเสนอของผู้ช่วย AI"}
              nextStep={result.nextStep ?? null}
            />
          )}
        </div>
      )}
    </section>
  );
}
