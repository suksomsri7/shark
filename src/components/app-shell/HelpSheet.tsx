"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadMyCasesAction,
  loadCaseThreadAction,
  openCaseAction,
  addMessageAction,
  markCaseReadAction,
  type CaseView,
  type MessageView,
  type Attachment,
} from "@/lib/support/actions";

// ศูนย์ช่วยเหลือ — เปิดจากปุ่ม "?" บน topbar
// 3 มุมมอง: รายการเคสของฉัน / เปิดเคสใหม่ / บทสนทนาในเคส
// บันทึกจริงผ่าน server actions (userId + tenantId มาจาก session ฝั่งเซิร์ฟเวอร์)
// help-v2: เลขเคส #caseNo + ป้ายสถานะ + badge ยังไม่อ่าน + แนบรูป/ไฟล์

const STATUS_LABEL: Record<string, string> = {
  OPEN: "รอตอบ",
  PENDING: "แพลตฟอร์มตอบแล้ว",
  RESOLVED: "ปิดแล้ว",
};

const MAX_ATTACH_BYTES = 2 * 1024 * 1024; // ~2MB ต่อไฟล์

type View = "list" | "new" | { caseId: string; subject: string; caseNo: number };

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
              onSubmit={async (subject, body, attachments) => {
                setBusy(true);
                const res = await openCaseAction({ subject, body, attachments });
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
              caseNo={view.caseNo}
              busy={busy}
              onBack={() => setView("list")}
              onSend={async (body, attachments) => {
                setBusy(true);
                const res = await addMessageAction({ caseId: view.caseId, body, attachments });
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
                className="flex items-center justify-center gap-1 rounded-lg bg-[color:var(--color-accent)] px-3 py-2.5 text-sm font-medium text-white hover:opacity-90"
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
                      onClick={async () => {
                        // เปิดเคส = ทำเครื่องหมายอ่านแล้ว (เคลียร์ badge) แล้วรีเฟรชรายการ
                        await markCaseReadAction(c.id).catch(() => {});
                        setView({ caseId: c.id, subject: c.subject, caseNo: c.caseNo });
                        reload();
                      }}
                      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[11px] font-medium text-[color:var(--color-muted)]">
                          #{String(c.caseNo).padStart(4, "0")}
                        </span>
                        <span className="min-w-0 truncate">{c.subject}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {c.unreadCount > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--color-danger)] px-1.5 text-xs font-semibold text-white">
                            {c.unreadCount}
                          </span>
                        )}
                        <span className="rounded-full border px-2 py-0.5 text-xs text-[color:var(--color-muted)]">
                          {STATUS_LABEL[c.status] ?? c.status}
                        </span>
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

// อ่านไฟล์เป็น dataURL (base64) — คืน null ถ้าเกินขนาด
async function fileToAttachment(file: File): Promise<Attachment | null> {
  if (file.size > MAX_ATTACH_BYTES) return null;
  const url: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return { name: file.name, url, kind: file.type.startsWith("image/") ? "image" : "file" };
}

// ตัวเลือกแนบไฟล์ + preview + ลบได้ (ใช้ร่วมทั้งเปิดเคสใหม่และตอบในเธรด)
function AttachmentPicker({
  attachments,
  onChange,
  disabled,
}: {
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [warn, setWarn] = useState<string | null>(null);

  const pick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setWarn(null);
    const added: Attachment[] = [];
    let skipped = false;
    for (const f of Array.from(files)) {
      const att = await fileToAttachment(f);
      if (att) added.push(att);
      else skipped = true;
    }
    if (skipped) setWarn("บางไฟล์ใหญ่เกิน 2MB ถูกข้ามไป");
    if (added.length) onChange([...attachments, ...added]);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="self-start rounded-lg border px-3 py-1.5 text-xs text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
      >
        📎 แนบรูป/ไฟล์
      </button>
      {warn && <p className="text-xs text-[color:var(--color-danger)]">{warn}</p>}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <div
              key={`${a.name}-${i}`}
              className="relative flex items-center gap-1.5 rounded-lg border p-1 pr-2"
            >
              {a.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.name} className="h-10 w-10 rounded object-cover" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded bg-[color:var(--color-surface-2)] text-lg">
                  📄
                </span>
              )}
              <span className="max-w-24 truncate text-xs">{a.name}</span>
              <button
                type="button"
                aria-label="ลบไฟล์แนบ"
                onClick={() => onChange(attachments.filter((_, j) => j !== i))}
                className="ml-0.5 text-xs text-[color:var(--color-muted)] hover:text-[color:var(--color-danger)]"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// แสดงไฟล์แนบในบับเบิลข้อความ
function MessageAttachments({ attachments }: { attachments: Attachment[] }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {attachments.map((a, i) =>
        a.kind === "image" ? (
          <a key={`${a.name}-${i}`} href={a.url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url} alt={a.name} className="h-20 w-20 rounded-lg border object-cover" />
          </a>
        ) : (
          <a
            key={`${a.name}-${i}`}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs hover:bg-[color:var(--color-surface-2)]"
          >
            📄 <span className="max-w-32 truncate">{a.name}</span>
          </a>
        ),
      )}
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
  onSubmit: (
    subject: string,
    body: string,
    attachments: Attachment[],
  ) => Promise<string | undefined>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const err = await onSubmit(
          String(fd.get("subject") ?? ""),
          String(fd.get("body") ?? ""),
          attachments,
        );
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
      <AttachmentPicker attachments={attachments} onChange={setAttachments} disabled={busy} />
      {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}
      <button type="submit" disabled={busy} className="flex items-center justify-center gap-1 rounded-lg bg-[color:var(--color-accent)] px-3 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
        {busy ? "กำลังส่ง…" : "ส่งเรื่อง"}
      </button>
    </form>
  );
}

function CaseThread({
  caseId,
  subject,
  caseNo,
  busy,
  onBack,
  onSend,
}: {
  caseId: string;
  subject: string;
  caseNo: number;
  busy: boolean;
  onBack: () => void;
  onSend: (body: string, attachments: Attachment[]) => Promise<string | undefined>;
}) {
  const [messages, setMessages] = useState<MessageView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

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
      <div>
        <div className="text-[11px] font-medium text-[color:var(--color-muted)]">
          #{String(caseNo).padStart(4, "0")}
        </div>
        <div className="text-sm font-medium">{subject}</div>
      </div>

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
              <MessageAttachments attachments={m.attachments} />
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
          const err = await onSend(body, attachments);
          setError(err ?? null);
          if (!err) {
            form.reset();
            setAttachments([]);
            load();
          }
        }}
      >
        <textarea name="body" required rows={2} className="input" placeholder="พิมพ์ข้อความ…" />
        <AttachmentPicker attachments={attachments} onChange={setAttachments} disabled={busy} />
        {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}
        <button type="submit" disabled={busy} className="flex items-center justify-center gap-1 rounded-lg bg-[color:var(--color-accent)] px-3 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {busy ? "กำลังส่ง…" : "ส่งข้อความ"}
        </button>
      </form>
    </div>
  );
}
