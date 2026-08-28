"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// สัญญา §3.2 ของ /api/v1/chat (publicThread) — ต้องมี type + attachments
// ไม่งั้นรูป/ไฟล์ที่แอดมินส่งกลับกลายเป็นฟองว่าง (B3)
type Attachment = {
  url: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
};
type Msg = {
  id: string;
  direction: string;
  type?: string;
  body: string | null;
  attachments?: Attachment[];
  senderName?: string | null;
  createdAt: string;
};

const isImage = (mimeType: string) => mimeType.toLowerCase().startsWith("image/");

function kb(bytes: number) {
  if (!bytes) return "";
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// M10: ไม่มี guest token ฝั่ง client อีกต่อไป — server สร้าง CSPRNG token + httpOnly cookie ผูก connection
// เบราว์เซอร์แนบ cookie ให้อัตโนมัติ (same-origin) — client อ่าน/เดา/ปลอมไม่ได้
export function ChatWidget({
  connectionId,
  title,
  greeting,
}: {
  connectionId: string;
  title: string;
  greeting?: string;
}) {
  const [ready, setReady] = useState(false); // set หลัง bootstrap (มั่นใจว่ามี cookie แล้ว)
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/webchat/${connectionId}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (res.ok) {
        const data = (await res.json()) as { messages?: Msg[] };
        setMessages(data.messages ?? []);
      }
    } catch {
      /* offline — ลองใหม่รอบหน้า */
    }
  }, [connectionId]);

  // bootstrap ครั้งเดียว: GET แรก mint+set httpOnly cookie → พร้อมส่งได้
  useEffect(() => {
    let alive = true;
    (async () => {
      await poll();
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [poll]);

  useEffect(() => {
    if (!ready) return;
    const iv = setInterval(poll, 4000);
    return () => clearInterval(iv);
  }, [ready, poll]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending || !ready) return;
    setSending(true);
    const clientMessageId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const res = await fetch(`/api/chat/webchat/${connectionId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ body, clientMessageId }),
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
            const files = m.attachments ?? [];
            return (
              <div key={m.id} className={`flex ${out ? "justify-start" : "justify-end"}`}>
                <div
                  className={`flex max-w-[80%] flex-col gap-1 rounded-lg border px-3 py-1.5 text-sm ${
                    out ? "" : "bg-[color:var(--color-surface-2)]"
                  }`}
                >
                  {out && m.senderName && (
                    <div className="text-[11px] font-medium text-[color:var(--color-muted)]">
                      {m.senderName}
                    </div>
                  )}
                  {files.map((a) =>
                    isImage(a.mimeType) ? (
                      // eslint-disable-next-line @next/next/no-img-element -- ไฟล์ลูกค้าอยู่บน CDN ภายนอก ไม่ผ่าน next/image loader
                      <a key={a.url} href={a.url} target="_blank" rel="noreferrer">
                        <img
                          src={a.url}
                          alt={a.name}
                          className="max-h-64 w-auto rounded-md border object-contain"
                        />
                      </a>
                    ) : (
                      <a
                        key={a.url}
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs underline"
                      >
                        <span className="break-all">{a.name}</span>
                        {a.sizeBytes > 0 && (
                          <span className="shrink-0 text-[color:var(--color-muted)]">
                            {kb(a.sizeBytes)}
                          </span>
                        )}
                      </a>
                    ),
                  )}
                  {m.type === "STICKER" && files.length === 0 && !m.body && (
                    <div className="text-[color:var(--color-muted)]">[สติกเกอร์]</div>
                  )}
                  {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
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
        <button disabled={sending || !ready} className="btn btn-primary text-sm disabled:opacity-50">
          {sending ? "…" : "ส่ง"}
        </button>
      </form>
    </div>
  );
}
