"use client";

// CrmAiProposalCard.tsx — การ์ดข้อเสนอของผู้ช่วย AI (ใบ C3.4 · ภาพ 14 ซ้าย: "อนุมัติ · แก้ไข · ยกเลิก")
//
// 🔴 ผู้ช่วยไม่เคยเขียนเอง — การ์ดนี้คือจุดเดียวที่คนกดให้เกิดการเขียน ผ่าน server action → ประตูเดียวของ CRM
//    (`crm.aiBridges.confirmProposal` / `cancelProposal`: ต้องมีสิทธิ์ของ kind และมองเห็นทุกดีลในข้อเสนอ — ไม่งั้นได้ข้อความไทยแบบ inline)
// 🔴 "แก้ไข" = ลดขอบเขต/แก้ถ้อยคำก่อนอนุมัติ: ขั้นถัดไปแก้ข้อความได้ · งานติดตามติ๊กเอาดีลออกได้ (เพิ่มดีลใหม่ไม่ได้)
// 🔴 'use client' — ไม่ import โมดูล CRM (F2.3) · ข้อความ/รายการมาจาก props · ไม่มีกล่องเตือนของเบราว์เซอร์

import { useState } from "react";
import { cancelAssistProposalAction, confirmAssistProposalAction } from "@/app/app/sys/[id]/crm/_actions/ai";
import type { CrmAiAtRiskItem } from "./types";

export function CrmAiProposalCard({
  systemId,
  proposalId,
  summary,
  nextStep,
  items,
}: {
  systemId: string;
  proposalId: string;
  summary: string;
  /** ข้อเสนอ "ขั้นถัดไป" ของดีล — ข้อความที่แก้ได้ */
  nextStep?: string | null;
  /** ข้อเสนอ "สร้างงานติดตาม" — ดีลที่ติ๊กเอาออกได้ */
  items?: CrmAiAtRiskItem[] | null;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(nextStep ?? "");
  const [picked, setPicked] = useState<Set<string>>(() => new Set((items ?? []).map((x) => x.dealId)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [done, setDone] = useState(false);

  async function confirm() {
    setBusy(true);
    setMsg(null);
    const edits = editing ? (items ? { dealIds: [...picked] } : { nextStep: text }) : null;
    const r = await confirmAssistProposalAction(systemId, proposalId, edits);
    setBusy(false);
    if (r.ok) {
      setDone(true);
      setMsg({ ok: true, text: r.note });
    } else setMsg({ ok: false, text: r.error });
  }

  async function cancel() {
    setBusy(true);
    setMsg(null);
    const r = await cancelAssistProposalAction(systemId, proposalId);
    setBusy(false);
    if (r.ok) {
      setDone(true);
      setMsg({ ok: true, text: r.note });
    } else setMsg({ ok: false, text: r.error });
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] p-3" data-testid="crm-ai-proposal-card">
      <p className="text-xs font-semibold text-[color:var(--color-accent)]">ข้อเสนอของผู้ช่วย AI — ยังไม่มีอะไรถูกบันทึกจนกว่าจะกดอนุมัติ</p>
      <p className="break-words text-sm">{summary}</p>
      {editing && nextStep !== undefined && nextStep !== null && !items && (
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[color:var(--color-muted)]">ขั้นถัดไป (แก้ได้ ไม่เกิน 300 ตัวอักษร)</span>
          <textarea
            className="input min-h-[64px] text-sm"
            maxLength={300}
            value={text}
            onChange={(e) => setText(e.target.value)}
            data-testid="crm-ai-proposal-next-step-input"
          />
        </label>
      )}
      {editing && items && items.length > 0 && (
        <ul className="flex min-w-0 flex-col gap-1 text-sm">
          {items.map((x) => (
            <li key={x.dealId} className="flex min-w-0 items-center gap-2">
              <input
                type="checkbox"
                checked={picked.has(x.dealId)}
                onChange={(e) =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(x.dealId);
                    else next.delete(x.dealId);
                    return next;
                  })
                }
                aria-label={`สร้างงานติดตามของ ${x.title}`}
                data-testid={`crm-ai-proposal-deal-${x.dealId}`}
              />
              <span className="min-w-0 truncate">{x.title}</span>
            </li>
          ))}
        </ul>
      )}
      {!done && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary btn-sm" onClick={confirm} disabled={busy} data-testid="crm-ai-proposal-confirm">
            อนุมัติ
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing((v) => !v)} disabled={busy} aria-pressed={editing} data-testid="crm-ai-proposal-edit">
            {editing ? "เลิกแก้ไข" : "แก้ไข"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={cancel} disabled={busy} data-testid="crm-ai-proposal-cancel">
            ยกเลิก
          </button>
        </div>
      )}
      {msg && (
        <p role="status" className={`text-xs ${msg.ok ? "text-[color:var(--color-accent)]" : "text-[color:var(--color-danger)]"}`} data-testid="crm-ai-proposal-status">
          {msg.text}
        </p>
      )}
    </div>
  );
}
