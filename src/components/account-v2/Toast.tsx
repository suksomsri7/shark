"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

// Toast กลางล่างจอ (g5-contact-modal.png: แถบดำเต็มความกว้าง "โปรดกรอกช่องที่ไฮไลต์") — auto-dismiss
type ToastTone = "success" | "error";
type ToastItem = { id: number; text: string; tone: ToastTone };
type ToastApi = { success: (text: string) => void; error: (text: string) => void };

const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children, testId }: { children: React.ReactNode; testId?: string }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const push = useCallback((text: string, tone: ToastTone) => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ success: (text) => push(text, "success"), error: (text) => push(text, "error") }),
    [push],
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" data-testid={testId}>
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-center gap-2 rounded-full px-4 py-3 text-sm shadow-[0_8px_24px_rgba(10,10,10,.24)]"
            style={{
              background: t.tone === "error" ? "var(--color-danger)" : "var(--color-ink)",
              color: "var(--color-surface)",
            }}
            data-testid={testId ? `${testId}-item` : undefined}
          >
            {t.tone === "error" && <span aria-hidden>⚠</span>}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast ต้องอยู่ภายใน <ToastProvider>");
  return ctx;
}

export default ToastProvider;
