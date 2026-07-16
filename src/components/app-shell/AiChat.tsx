"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  confirmProposalAction,
  listPendingProposalsAction,
  loadAiChatAction,
  rejectProposalAction,
  sendAiMessageAction,
  type AiChatState,
  type PendingProposal,
} from "@/lib/ai/actions";

// แชทผู้ช่วย AI ใน sheet ของ AiDock — โหลดบทสนทนาล่าสุด + ส่งข้อความ (optimistic)
// Phase 3.5: การ์ดยืนยันใต้แชท — AI "เสนอ" การกระทำ user กด "ยืนยันทำเลย" หรือ "ยกเลิก"
// สถานะยังไม่เปิดใช้ (ไม่มี key) = แจ้งสุภาพ ไม่พัง

type Msg = { id: string; role: "USER" | "ASSISTANT"; content: string };

export function AiChat() {
  const [state, setState] = useState<AiChatState | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [proposals, setProposals] = useState<PendingProposal[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAiChatAction().then((s) => {
      setState(s);
      setMessages(s.messages);
      setProposals(s.pendingProposals);
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, proposals, pending]);

  function send() {
    const t = text.trim();
    if (!t || pending) return;
    setText("");
    setError(null);
    setNotice(null);
    setMessages((m) => [...m, { id: `tmp-${m.length}`, role: "USER", content: t }]);
    startTransition(async () => {
      const res = await sendAiMessageAction({
        conversationId: state?.conversationId ?? undefined,
        text: t,
      });
      if (res.ok) {
        setState((s) => (s ? { ...s, conversationId: res.conversationId } : s));
        setMessages((m) => [...m, { id: `a-${m.length}`, role: "ASSISTANT", content: res.reply }]);
        // LLM อาจเสนอ proposal ใหม่ระหว่างตอบ → refresh การ์ดยืนยันเสมอ
        const fresh = await listPendingProposalsAction(res.conversationId);
        setProposals(fresh);
      } else {
        setError(res.message);
      }
    });
  }

  function confirm(id: string) {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await confirmProposalAction(id);
      setProposals((ps) => ps.filter((p) => p.id !== id));
      if (res.ok) setNotice(res.note);
      else setError(res.note);
      setBusyId(null);
    });
  }

  function reject(id: string) {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await rejectProposalAction(id);
      setProposals((ps) => ps.filter((p) => p.id !== id));
      setNotice(res.note);
      setBusyId(null);
    });
  }

  if (!state) {
    return <p className="py-6 text-center text-sm text-[color:var(--color-muted)]">กำลังโหลด…</p>;
  }

  if (!state.enabled) {
    return (
      <div className="card text-center">
        <div className="text-sm font-medium">เร็ว ๆ นี้</div>
        <p className="mt-1 text-xs text-[color:var(--color-muted)]">
          ผู้ช่วย AI จะช่วยตอบคำถามและแนะนำระบบให้คุณ กำลังจะเปิดให้ใช้เร็ว ๆ นี้
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-h-[50vh] min-h-40 flex-col gap-2 overflow-y-auto">
        {messages.length === 0 && (
          <p className="py-6 text-center text-sm text-[color:var(--color-muted)]">
            สวัสดีครับ ถามเรื่องการใช้งาน ให้ช่วยคิดเรื่องธุรกิจ หรือสั่งให้ช่วยทำรายการแทนได้เลย
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === "USER"
                ? "ml-8 self-end rounded-2xl rounded-br-sm bg-[color:var(--color-ink)] px-3 py-2 text-sm text-[color:var(--color-surface)]"
                : "mr-8 self-start whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-[color:var(--color-surface-2)] px-3 py-2 text-sm"
            }
          >
            {m.content}
          </div>
        ))}
        {pending && !busyId && (
          <div className="mr-8 self-start rounded-2xl rounded-bl-sm bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-muted)]">
            กำลังคิด…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* การ์ดยืนยัน — AI เสนอ user ตัดสินใจ */}
      {proposals.map((p) => (
        <div key={p.id} className="rounded-xl border border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)] p-3">
          <div className="text-xs font-medium text-[color:var(--color-muted)]">ผู้ช่วยขอยืนยันก่อนทำ</div>
          <p className="mt-1 text-sm">{p.summary}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => confirm(p.id)}
              disabled={busyId === p.id}
              className="btn btn-primary min-h-[44px] flex-1 disabled:opacity-50"
            >
              {busyId === p.id ? "กำลังทำ…" : "ยืนยันทำเลย"}
            </button>
            <button
              type="button"
              onClick={() => reject(p.id)}
              disabled={busyId === p.id}
              className="btn btn-ghost min-h-[44px] disabled:opacity-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      ))}

      {notice && (
        <p className="rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-ink)]">
          {notice}
        </p>
      )}
      {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="พิมพ์ข้อความ…"
          className="min-h-[44px] flex-1 resize-none rounded-xl border px-3 py-2.5 text-base"
        />
        <button type="submit" disabled={pending || !text.trim()} className="btn btn-primary min-h-[44px] disabled:opacity-50">
          ส่ง
        </button>
      </form>
    </div>
  );
}
