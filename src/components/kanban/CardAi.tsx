// CardAi.tsx — กลุ่ม "ผู้ช่วย AI" ในแถบขวาของหลังการ์ด (K3.5 · ภาพ `ledger/design-kanban/03-card-back.png`)
//
// 3 ปุ่มตามแบบ: สรุปการ์ดนี้ · แตกเป็นเช็คลิสต์ · ร่างข้อความตอบลูกค้า
//
// กติกาของจอ (พิมพ์เขียว §8.3 — ห้ามรื้อ)
//  1. **เช็คลิสต์ต้องเห็นก่อนกดรับ** — ผลจาก AI แสดงเป็น "ข้อเสนอ" (รายการ + ปุ่มเพิ่ม/ไม่เอา)
//     ยังไม่มีอะไรเกิดขึ้นในการ์ดจนกว่าจะกด "เพิ่มเช็คลิสต์นี้"
//  2. **ร่างคำตอบไม่ถูกส่งไปไหน** — เป็นกล่องข้อความให้คัดลอกไปแก้เองในช่องทางที่ถูก
//  3. **ไม่มีคีย์ AI = ปุ่มเทา** พร้อมบอกทางไปตั้งค่า (ไม่ใช่ปล่อยให้กดแล้วเจอ error)
//  4. ทำได้เฉพาะคนที่แก้การ์ดได้ (`editable`) — ด่านจริงอยู่ฝั่ง server (`kanban/ai.ts`)
//
// ⚠️ ห้ามใช้อีโมจิในไฟล์นี้ (รวมคอมเมนต์) — ไอคอนทุกตัวมาจาก <KanbanIcon>
"use client";

import { useState } from "react";
import { KanbanIcon } from "./KanbanIcon";
import {
  acceptChecklistSuggestionAction,
  draftReplyAction,
  suggestChecklistAction,
  summarizeCardAction,
} from "@/lib/modules/kanban/actions";
import type { KanbanChecklistDto, KanbanCommentDto } from "@/lib/modules/kanban/types";

type Suggestion = { title: string; items: string[] };
type Busy = "summary" | "checklist" | "reply" | "accept" | null;

export function CardAi({
  systemId,
  cardId,
  editable,
  available,
  onCommentsChange,
  onChecklistsChange,
  onToast,
}: {
  systemId: string;
  cardId: string;
  editable: boolean;
  /** ร้านนี้ตั้งค่าผู้ช่วย AI แล้วหรือยัง (`CardDetailDto.aiAvailable`) */
  available: boolean;
  onCommentsChange: (comments: KanbanCommentDto[]) => void;
  onChecklistsChange: (checklists: KanbanChecklistDto[]) => void;
  onToast: (message: string) => void;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const disabled = !editable || !available || busy !== null;

  async function doSummarize() {
    setBusy("summary");
    const res = await summarizeCardAction({ systemId, cardId });
    setBusy(null);
    if (!res.ok) return onToast(res.message);
    onCommentsChange(res.comments);
    onToast("ผู้ช่วย AI เขียนสรุปไว้ในความเห็นแล้ว");
  }

  async function doSuggestChecklist() {
    setBusy("checklist");
    const res = await suggestChecklistAction({ systemId, cardId });
    setBusy(null);
    if (!res.ok) return onToast(res.message);
    setSuggestion(res.suggestion);
  }

  async function doAccept() {
    if (!suggestion) return;
    setBusy("accept");
    const res = await acceptChecklistSuggestionAction({ systemId, cardId, suggestion });
    setBusy(null);
    if (!res.ok) return onToast(res.message);
    onChecklistsChange(res.checklists);
    setSuggestion(null);
    onToast("เพิ่มเช็คลิสต์จากข้อเสนอแล้ว");
  }

  async function doDraftReply() {
    setBusy("reply");
    const res = await draftReplyAction({ systemId, cardId });
    setBusy(null);
    if (!res.ok) return onToast(res.message);
    setDraft(res.text);
    setCopied(false);
  }

  async function copyDraft() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
    } catch {
      onToast("คัดลอกไม่สำเร็จ — เลือกข้อความในกล่องแล้วคัดลอกเองได้เลย");
    }
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid="card-ai">
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", letterSpacing: ".02em" }}>ผู้ช่วย AI</div>

      <AiButton testid="card-ai-summarize" label="สรุปการ์ดนี้" busy={busy === "summary"} disabled={disabled} onClick={doSummarize} />
      <AiButton
        testid="card-ai-checklist"
        label="แตกเป็นเช็คลิสต์"
        busy={busy === "checklist"}
        disabled={disabled}
        onClick={doSuggestChecklist}
      />
      <AiButton testid="card-ai-reply" label="ร่างข้อความตอบลูกค้า" busy={busy === "reply"} disabled={disabled} onClick={doDraftReply} />

      {!available && (
        <p style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
          ตั้งค่าผู้ช่วย AI ก่อน จึงจะใช้ปุ่มเหล่านี้ได้ —{" "}
          <a href="/app/settings/credit" style={{ color: "var(--color-accent)" }}>
            ไปที่เครดิตผู้ช่วย AI
          </a>
        </p>
      )}

      {/* ── ข้อเสนอเช็คลิสต์: ยังไม่มีอะไรเกิดขึ้นกับการ์ดจนกว่าจะกด "เพิ่มเช็คลิสต์นี้" ── */}
      {suggestion && (
        <div
          data-testid="card-ai-checklist-suggestion"
          className="flex flex-col gap-1.5 rounded-lg border p-2"
          style={{ borderColor: "var(--color-accent)", background: "var(--color-surface)" }}
        >
          <div className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 700 }}>
            <KanbanIcon name="spark" size="xs" />
            {suggestion.title}
          </div>
          <ul className="flex flex-col gap-1">
            {suggestion.items.map((item, i) => (
              <li key={`${i}-${item}`} className="flex items-start gap-1.5" style={{ fontSize: 12, color: "var(--color-ink-soft)" }}>
                <span style={{ color: "var(--color-muted)" }}>{i + 1}.</span>
                <span className="min-w-0 flex-1">{item}</span>
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 11, color: "var(--color-muted)" }}>ข้อเสนอของผู้ช่วย AI — ยังไม่ได้เพิ่มลงการ์ด</p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="card-ai-checklist-accept"
              disabled={busy !== null}
              onClick={doAccept}
              className="rounded-lg border px-2"
              style={{
                height: 28,
                fontSize: 12,
                fontWeight: 600,
                borderColor: "var(--color-accent)",
                color: "var(--color-accent)",
                background: "var(--color-surface)",
              }}
            >
              {busy === "accept" ? "กำลังเพิ่ม…" : "เพิ่มเช็คลิสต์นี้"}
            </button>
            <button
              type="button"
              data-testid="card-ai-checklist-reject"
              onClick={() => setSuggestion(null)}
              style={{ fontSize: 12, color: "var(--color-muted)" }}
            >
              ไม่เอา
            </button>
          </div>
        </div>
      )}

      {/* ── ร่างข้อความตอบลูกค้า: กล่อง + ปุ่มคัดลอก (ไม่ถูกส่งไปไหนเอง) ── */}
      {draft !== null && (
        <div
          data-testid="card-ai-reply-draft"
          className="flex flex-col gap-1.5 rounded-lg border p-2"
          style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            aria-label="ร่างข้อความตอบลูกค้า"
            className="w-full rounded-lg border p-1.5"
            style={{ fontSize: 12, borderColor: "var(--color-line)", background: "var(--color-surface-2)" }}
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="card-ai-reply-copy"
              onClick={copyDraft}
              className="rounded-lg border px-2"
              style={{ height: 28, fontSize: 12, fontWeight: 600, borderColor: "var(--color-line)", color: "var(--color-ink-soft)" }}
            >
              {copied ? "คัดลอกแล้ว" : "คัดลอก"}
            </button>
            <button type="button" onClick={() => setDraft(null)} style={{ fontSize: 12, color: "var(--color-muted)" }}>
              ปิด
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AiButton({
  testid,
  label,
  busy,
  disabled,
  onClick,
}: {
  testid: string;
  label: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      title={disabled && !busy ? "ตั้งค่าผู้ช่วย AI ก่อน" : undefined}
      className="flex items-center gap-2 rounded-lg border"
      style={{
        height: 32,
        padding: "0 10px",
        fontSize: 12.5,
        borderColor: "var(--color-line)",
        color: disabled ? "var(--color-muted)" : "var(--color-ink-soft)",
        background: "var(--color-surface)",
        justifyContent: "flex-start",
        width: "100%",
      }}
    >
      <KanbanIcon name="spark" size="sm" />
      {busy ? "กำลังคิด…" : label}
    </button>
  );
}
