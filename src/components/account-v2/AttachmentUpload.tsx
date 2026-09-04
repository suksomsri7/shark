"use client";

// AttachmentUpload.tsx — อัปโหลดไฟล์จริงหลายไฟล์เข้าคลังเอกสาร V2 (f9 §12)
//   - AttachmentDropBanner: แถบ dropzone ใต้หัวหน้า (ลากวาง/ปุ่ม "เลือกไฟล์") — แสดงตลอดเวลาตามภาพ f9
//   - AttachmentUploadModal: เปิดผ่าน query `?upload=1` (ปุ่มดำ "อัปโหลดไฟล์" บนหัว — pattern เดียวกับ
//     MarkFiledModal ของ WO 5.4) — dropzone + รายการความคืบหน้าในกล่องโมดัล
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { AccountIcon } from "./AccountIcon";
import { ATTACHMENT_ACCEPT, humanFileSize, validateAttachmentUpload } from "@/lib/modules/account/attachment-shared";
import { uploadAttachmentsAction, type UploadAttachmentResult } from "@/app/app/sys/[id]/account/documents/actions";

type ProgressItem = { fileName: string; sizeBytes: number; state: "pending" | "done" | "error"; message?: string };

function UploadProgressList({ items }: { items: ProgressItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-1.5" data-testid="attachment-upload-progress">
      {items.map((it, i) => (
        <div key={i} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
          <span className="min-w-0 truncate">{it.fileName}</span>
          <span className="shrink-0 text-xs">
            {it.state === "pending" && <span className="text-[color:var(--color-muted)]">กำลังอัปโหลด…</span>}
            {it.state === "done" && (
              <span style={{ color: "var(--color-accent)" }} data-testid="attachment-upload-ok">
                {it.message ?? `เสร็จ · ${humanFileSize(it.sizeBytes)}`}
              </span>
            )}
            {it.state === "error" && (
              <span className="text-[color:var(--color-danger)]" data-testid="attachment-upload-err">
                {it.message}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function useUploader(systemId: string, folder: string | undefined, onDone?: () => void) {
  const [items, setItems] = useState<ProgressItem[]>([]);
  const [pending, start] = useTransition();

  const upload = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setItems(list.map((f) => ({ fileName: f.name, sizeBytes: f.size, state: "pending" as const })));
    start(async () => {
      // ตรวจฝั่ง client ก่อน (เร็ว — ไม่ต้องรอ round-trip) เซิร์ฟเวอร์ตรวจซ้ำเสมออยู่ดี
      const preErrors = list.map((f) => validateAttachmentUpload(f.type, f.size));
      const okFiles = list.filter((_, i) => preErrors[i]!.ok);
      const fd = new FormData();
      fd.set("systemId", systemId);
      if (folder) fd.set("folder", folder);
      for (const f of okFiles) fd.append("files", f);
      const results: UploadAttachmentResult[] = okFiles.length ? await uploadAttachmentsAction(fd) : [];
      let ri = 0;
      setItems(
        list.map((f, i) => {
          if (!preErrors[i]!.ok) return { fileName: f.name, sizeBytes: f.size, state: "error", message: (preErrors[i] as { ok: false; reason: string }).reason };
          const r = results[ri++];
          if (!r) return { fileName: f.name, sizeBytes: f.size, state: "error", message: "อัปโหลดไม่สำเร็จ" };
          if (!r.ok) return { fileName: f.name, sizeBytes: f.size, state: "error", message: r.reason };
          return { fileName: f.name, sizeBytes: r.sizeBytes, state: "done", message: r.duplicate ? "มีไฟล์นี้อยู่แล้ว — ไม่สร้างซ้ำ" : undefined };
        }),
      );
      onDone?.();
    });
  };

  return { items, pending, upload, reset: () => setItems([]) };
}

export function AttachmentDropBanner({ systemId }: { systemId: string }) {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { items, upload } = useUploader(systemId, undefined, () => router.refresh());

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-5 py-4 text-sm"
      style={dragOver ? { background: "var(--color-surface-2)", borderColor: "var(--color-ink)" } : { background: "var(--color-surface-2)" }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
      data-testid="attachment-drop-banner"
    >
      <div className="flex items-center gap-2">
        <AccountIcon name="upload" className="h-5 w-5 text-[color:var(--color-muted)]" />
        <div>
          <p>
            ลากไฟล์มาวางที่นี่ หรือกดปุ่ม <span className="font-medium">"อัปโหลดไฟล์"</span>
          </p>
          <p className="text-xs text-[color:var(--color-muted)]">
            ส่งเข้าอีเมล inbox@ ก็ได้ — ไฟล์จะเข้ากล่องขาเข้าให้อัตโนมัติ (เร็ว ๆ นี้)
          </p>
        </div>
      </div>
      <button type="button" className="btn-sm shrink-0" onClick={() => inputRef.current?.click()} data-testid="attachment-drop-pick">
        เลือกไฟล์
      </button>
      <input ref={inputRef} type="file" multiple accept={ATTACHMENT_ACCEPT} className="hidden" data-testid="documents-drop-banner-input" onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }} />
      {items.length > 0 && <div className="w-full"><UploadProgressList items={items} /></div>}
    </div>
  );
}

export function AttachmentUploadModal({ systemId, closeHref, folders }: { systemId: string; closeHref: string; folders: string[] }) {
  const router = useRouter();
  const [folder, setFolder] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { items, upload } = useUploader(systemId, folder || undefined, () => router.refresh());
  const close = () => router.push(closeHref);

  return (
    <Modal open onClose={close} size="md" sheetOnMobile testId="attachment-upload-modal" title="อัปโหลดไฟล์">
      <div
        className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-sm"
        style={dragOver ? { background: "var(--color-surface-2)", borderColor: "var(--color-ink)" } : undefined}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
      >
        <AccountIcon name="upload" className="h-6 w-6 text-[color:var(--color-muted)]" />
        <p className="text-[color:var(--color-muted)]">ลากไฟล์มาวาง หรือ</p>
        <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()} data-testid="attachment-upload-pick">
          + เลือกไฟล์ (PDF/JPG/PNG · ≤ 20MB)
        </button>
        <input ref={inputRef} type="file" multiple accept={ATTACHMENT_ACCEPT} className="hidden" data-testid="documents-upload-modal-input" onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }} />
      </div>
      <div className="mt-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-[color:var(--color-muted)]">โฟลเดอร์ (ไม่บังคับ)</span>
          <input list="attachment-folder-list" className="input flex-1" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="เว้นว่าง = ไฟล์ลอย" />
        </label>
        <datalist id="attachment-folder-list">
          {folders.map((f) => <option key={f} value={f} />)}
        </datalist>
      </div>
      <UploadProgressList items={items} />
      <div className="mt-4 flex justify-end">
        <button type="button" className="btn btn-ghost" onClick={close} data-testid="attachment-upload-done">
          เสร็จสิ้น
        </button>
      </div>
    </Modal>
  );
}
