"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Msg = { id: string; direction: string; body: string | null; createdAt: string };

// guest token คงที่ต่อเบราว์เซอร์ (cookie 90 วันเทียบเท่า — ใช้ localStorage)
function guestTokenFor(connectionId: string): string {
  const key = `shark_chat_guest_${connectionId}`;
  if (typeof window === "undefined") return "";
  let t = window.localStorage.getItem(key);
  if (!t) {
    t = `web-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    window.localStorage.setItem(key, t);
  }
  return t;
}

export function ChatWidget({
  connectionId,
  title,
  greeting,
}: {
  connectionId: string;
  title: string;
  greeting?: string;
}) {
  const [token, setToken] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => setToken(guestTokenFor(connectionId)), [connectionId]);

  const poll = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(
        `/api/chat/webchat/${connectionId}?guestToken=${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const data = (await res.json()) as { messages?: Msg[] };
        setMessages(data.messages ?? []);
      }
    } catch {
      /* offline — ลองใหม่รอบหน้า */
    }
  }, [connectionId, token]);

  useEffect(() => {
    if (!token) return;
    poll();
    const iv = setInterval(poll, 4000);
    return () => clearInterval(iv);
  }, [token, poll]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending || !token) return;
    setSending(true);
    const clientMessageId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const res = await fetch(`/api/chat/webchat/${connectionId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guestToken: token, body, clientMessageId }),
      });
      if (res.ok) {
        setText("");
        await poll();
      }
    } catch {
      /* offline */
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-[80vh] flex-col rounded-2xl border">
      <header className="border-b px-4 py-3">
        <div className="text-sm font-semibold">{title}</div>
        {greeting && <div className="text-xs text-[color:var(--color-muted)]">{greeting}</div>}
      </header>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-[color:var(--color-muted)]">
            เริ่มพิมพ์เพื่อทักร้านได้เลย
          </p>
        ) : (
          messages.map((m) => {
            const out = m.direction === "OUT";
            return (
              <div key={m.id} className={`flex ${out ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[80%] rounded-lg border px-3 py-1.5 text-sm ${
                    out ? "" : "bg-[color:var(--color-surface-2)]"
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="flex items-end gap-2 border-t p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={1}
          placeholder="พิมพ์ข้อความ…"
          className="input flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(e as unknown as React.FormEvent);
            }
          }}
        />
        <button disabled={sending} className="btn btn-primary text-sm disabled:opacity-50">
          {sending ? "…" : "ส่ง"}
        </button>
      </form>
    </div>
  );
}
