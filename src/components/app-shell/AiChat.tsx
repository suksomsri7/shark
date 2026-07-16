"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  loadAiChatAction,
  sendAiMessageAction,
  type AiChatState,
} from "@/lib/ai/actions";

// แชทผู้ช่วย AI ใน sheet ของ AiDock — โหลดบทสนทนาล่าสุด + ส่งข้อความ (optimistic)
// สถานะยังไม่เปิดใช้ (ไม่มี key) = แจ้งสุภาพ ไม่พัง

type Msg = { id: string; role: "USER" | "ASSISTANT"; content: string };

export function AiChat() {
  const [state, setState] = useState<AiChatState | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAiChatAction().then((s) => {
      setState(s);
      setMessages(s.messages);
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending]);

  function send() {
    const t = text.trim();
    if (!t || pending) return;
    setText("");
    setError(null);
    setMessages((m) => [...m, { id: `tmp-${m.length}`, role: "USER", content: t }]);
    startTransition(async () => {
      const res = await sendAiMessageAction({
        conversationId: state?.conversationId ?? undefined,
        text: t,
      });
      if (res.ok) {
        setState((s) => (s ? { ...s, conversationId: res.conversationId } : s));
        setMessages((m) => [...m, { id: `a-${m.length}`, role: "ASSISTANT", content: res.reply }]);
      } else {
        setError(res.message);
      }
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
            สวัสดีครับ ถามเรื่องการใช้งานหรือให้ช่วยคิดเรื่องธุรกิจได้เลย
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
        {pending && (
          <div className="mr-8 self-start rounded-2xl rounded-bl-sm bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-muted)]">
            กำลังคิด…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

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
