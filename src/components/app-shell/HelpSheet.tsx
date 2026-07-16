"use client";

import { useEffect, useState } from "react";
import {
  loadMyCasesAction,
  loadCaseThreadAction,
  openCaseAction,
  addMessageAction,
  type CaseView,
  type MessageView,
} from "@/lib/support/actions";

// ศูนย์ช่วยเหลือ — เปิดจากปุ่ม "?" บน topbar
// 3 มุมมอง: รายการเคสของฉัน / เปิดเคสใหม่ / บทสนทนาในเคส
// บันทึกจริงผ่าน server actions (userId + tenantId มาจาก session ฝั่งเซิร์ฟเวอร์)

const STATUS_LABEL: Record<string, string> = {
  OPEN: "รอตอบ",
  PENDING: "แพลตฟอร์มตอบแล้ว",
  RESOLVED: "ปิดแล้ว",
};

type View = "list" | "new" | { caseId: string; subject: string };

export function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [view, setView] = useState<View>("list");
  const [cases, setCases] = useState<CaseView[] | null>(null);
  const [busy, setBusy] = useState(false);

  // โหลดเคสของฉันทุกครั้งที่เปิด
  useEffect(() => {
    if (!open) return;
    setView("list");
    setCases(null);
    loadMyCasesAction()
      .then(setCases)
      .catch(() => setCases([]));
  }, [open]);

  if (!open) return null;

  const close = () => onClose();
  const reload = async () => {
    setCases(await loadMyCasesAction().catch(() => []));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/30" onClick={close} />

      <div className="relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-[color:var(--color-surface)] shadow-[0_-4px_20px_rgba(0,0,0,0.12)] sm:max-w-md sm:rounded-2xl">
        <div className="flex items-start justify-between gap-2 border-b border-[color:var(--color-line)] p-5 pb-3">
          <div>
            <h2 className="text-base font-semibold">ศูนย์ช่วยเหลือ</h2>
            <p className="text-xs text-[color:var(--color-muted)]">
              แจ้งปัญหาการใช้งาน แล้วทีมงานจะช่วยดูแล
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="ปิด"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl leading-none hover:bg-[color:var(--color-surface-2)]"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {view === "new" ? (
            <NewCaseForm
              busy={busy}
              onCancel={() => setView("list")}
              onSubmit={async (subject, body) => {
                setBusy(true);
                const res = await openCaseAction({ subject, body });
                setBusy(false);
                if (res.ok) {
                  await reload();
                  setView("list");
                }
                return res.error;
              }}
            />
          ) : typeof view === "object" ? (
            <CaseThread
              caseId={view.caseId}
              subject={view.subject}
              busy={busy}
              onBack={() => setView("list")}
              onSend={async (body) => {
                setBusy(true);
                const res = await addMessageAction({ caseId: view.caseId, body });
                setBusy(false);
                if (res.ok) await reload();
                return res.error;
              }}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setView("new")}
                className="btn btn-primary text-sm"
              >
                + แจ้งปัญหาใหม่
              </button>

              <div className="text-xs font-medium text-[color:var(--color-muted)]">เรื่องที่แจ้งไว้</div>
              {cases === null ? (
                <p className="py-6 text-center text-sm text-[color:var(--color-muted)]">กำลังโหลด…</p>
              ) : cases.length === 0 ? (
                <p className="py-6 text-center text-sm text-[color:var(--color-muted)]">
                  ยังไม่มีเรื่องที่แจ้ง
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {cases.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setView({ caseId: c.id, subject: c.subject })}
                      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
                    >
                      <span className="min-w-0 truncate">{c.subject}</span>
                      <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-[color:var(--color-muted)]">
                        {STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NewCaseForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (subject: string, body: string) => Promise<string | undefined>;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const err = await onSubmit(String(fd.get("subject") ?? ""), String(fd.get("body") ?? ""));
        setError(err ?? null);
      }}
    >
      <button
        type="button"
        onClick={onCancel}
        className="self-start text-sm text-[color:var(--color-muted)]"
      >
        ← เรื่องที่แจ้งไว้
      </button>
      <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        หัวข้อ
        <input name="subject" required className="input" placeholder="เช่น พิมพ์ใบเสร็จไม่ออก" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        รายละเอียด
        <textarea name="body" required rows={4} className="input" placeholder="อธิบายปัญหาที่พบ" />
      </label>
      {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}
      <button type="submit" disabled={busy} className="btn btn-primary text-sm disabled:opacity-50">
        {busy ? "กำลังส่ง…" : "ส่งเรื่อง"}
      </button>
    </form>
  );
}

function CaseThread({
  caseId,
  subject,
  busy,
  onBack,
  onSend,
}: {
  caseId: string;
  subject: string;
  busy: boolean;
  onBack: () => void;
  onSend: (body: string) => Promise<string | undefined>;
}) {
  const [messages, setMessages] = useState<MessageView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    loadCaseThreadAction(caseId)
      .then(setMessages)
      .catch(() => setMessages([]));
  };
  useEffect(load, [caseId]);

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onBack} className="self-start text-sm text-[color:var(--color-muted)]">
        ← เรื่องที่แจ้งไว้
      </button>
      <div className="text-sm font-medium">{subject}</div>

      {messages === null ? (
        <p className="py-6 text-center text-sm text-[color:var(--color-muted)]">กำลังโหลด…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-lg border px-3 py-2 text-sm ${
                m.authorSide === "SHOP"
                  ? "self-end bg-[color:var(--color-surface-2)]"
                  : "self-start"
              }`}
            >
              <div className="mb-0.5 text-xs text-[color:var(--color-muted)]">
                {m.authorSide === "SHOP" ? "คุณ" : "ทีมงาน SHARK"}
              </div>
              <div className="whitespace-pre-wrap">{m.body}</div>
            </div>
          ))}
        </div>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          const body = String(fd.get("body") ?? "");
          const err = await onSend(body);
          setError(err ?? null);
          if (!err) {
            form.reset();
            load();
          }
        }}
      >
        <textarea name="body" required rows={2} className="input" placeholder="พิมพ์ข้อความ…" />
        {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}
        <button type="submit" disabled={busy} className="btn btn-primary text-sm disabled:opacity-50">
          {busy ? "กำลังส่ง…" : "ส่งข้อความ"}
        </button>
      </form>
    </div>
  );
}
