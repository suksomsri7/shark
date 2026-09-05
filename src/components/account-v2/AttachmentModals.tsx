"use client";

// AttachmentModals.tsx — โมดัลย่อยของคลังเอกสาร V2 (WO 7.1 · §12 f9-menu)
// รวม 4 โมดัลไว้ไฟล์เดียว (ใช้ร่วมกันจาก AttachmentRowMenu/AttachmentLinkCell/AttachmentTypeCell/หน้า list bulk):
//   - AttachmentPreviewModal: พรีวิวไฟล์ (รูป/ PDF ผ่าน iframe)
//   - AttachDocumentModal: ค้นหา+เลือกเอกสารที่มีอยู่แล้วมาผูก
//   - MoveFolderModal: ย้ายโฟลเดอร์ (ไฟล์เดียวหรือหลายไฟล์ — ids.length กำหนด)
//   - ChangeTypeModal: เปลี่ยนประเภท (ปุ่มดินสอในตาราง + รายการในเมนู "ทำรายการ ▾" เรียกตัวเดียวกัน)

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { DOC_TYPE_HINT_OPTIONS } from "@/lib/modules/account/attachment-shared";
import {
  linkAttachmentAction,
  moveAttachmentsBulkAction,
  searchDocumentsForAttachAction,
} from "@/app/app/sys/[id]/account/documents/actions";
// WO 9.4 §0.3 ข้อ 8 — ย้ายโฟลเดอร์/เปลี่ยนประเภท (ไฟล์เดียว) ไม่กินเลขที่/ไม่ลงเงิน ⇒ เลิกทำได้ภายใน 5 นาที
// (bulk ย้ายหลายไฟล์พร้อมกันยังใช้ moveAttachmentsBulkAction เดิม — undo-stack.ts รองรับเฉพาะไฟล์เดียวต่อ token)
import { moveAttachmentWithUndoAction, setDocTypeHintWithUndoAction } from "@/lib/modules/account/undo-stack";
import { useUndoToast } from "./UndoToast";

export function AttachmentPreviewModal({
  open,
  onClose,
  fileName,
  fileUrl,
  mimeType,
}: {
  open: boolean;
  onClose: () => void;
  fileName: string;
  fileUrl: string;
  mimeType: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={fileName} size="lg" sheetOnMobile testId="attachment-preview-modal">
      {mimeType.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element -- พรีวิวจาก CDN ของ tenant (ขนาดไม่รู้ล่วงหน้า)
        <img src={fileUrl} alt={fileName} className="mx-auto max-h-[70vh] w-auto rounded-lg" />
      ) : mimeType === "application/pdf" ? (
        <iframe src={fileUrl} title={fileName} className="h-[70vh] w-full rounded-lg border" />
      ) : (
        <p className="text-sm text-[color:var(--color-muted)]">ดูตัวอย่างไฟล์ชนิดนี้ไม่ได้ — กรุณาดาวน์โหลดแทน</p>
      )}
      <div className="mt-3 flex justify-end">
        <a href={fileUrl} target="_blank" rel="noreferrer" className="btn-sm">
          เปิดในแท็บใหม่
        </a>
      </div>
    </Modal>
  );
}

type DocSearchRow = { id: string; docType: string; docNo: string | null; contactName: string | null };

export function AttachDocumentModal({
  open,
  onClose,
  systemId,
  attachmentId,
  fileName,
}: {
  open: boolean;
  onClose: () => void;
  systemId: string;
  attachmentId: string;
  fileName: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<DocSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<DocSearchRow | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) {
      setQ("");
      setResults([]);
      setSelected(null);
      setError("");
    }
  }, [open]);

  const runSearch = (query: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await searchDocumentsForAttachAction(systemId, query));
      } finally {
        setLoading(false);
      }
    }, 250);
  };

  const confirm = () => {
    if (!selected) return;
    start(async () => {
      const r = await linkAttachmentAction(systemId, attachmentId, selected.id);
      if (r.ok) onClose();
      else setError(r.reason);
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="แนบกับเอกสารที่มีอยู่" size="md" sheetOnMobile testId="attach-document-modal">
      <p className="mb-3 text-sm text-[color:var(--color-muted)]">
        เลือกเอกสารที่จะผูกไฟล์ <span className="font-medium text-[color:var(--color-ink)]">{fileName}</span> เข้าไป
      </p>
      <input
        type="text"
        className="input w-full"
        placeholder="ค้นหาเลขที่เอกสาร หรือชื่อผู้ติดต่อ"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setSelected(null);
          runSearch(e.target.value);
        }}
        data-testid="attach-document-search"
        autoFocus
      />
      <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border">
        {loading && <div className="px-3 py-2 text-sm text-[color:var(--color-muted)]">กำลังค้นหา…</div>}
        {!loading && q.trim() && results.length === 0 && (
          <div className="px-3 py-2 text-sm text-[color:var(--color-muted)]">ไม่พบเอกสาร</div>
        )}
        {!loading &&
          results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelected(r)}
              className="flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[color:var(--color-surface-2)]"
              style={selected?.id === r.id ? { background: "var(--color-surface-2)" } : undefined}
              data-testid="attach-document-option"
            >
              <span className="font-medium">{r.docNo ?? r.docType}</span>
              {r.contactName && <span className="text-xs text-[color:var(--color-muted)]">{r.contactName}</span>}
            </button>
          ))}
      </div>
      {error && <p className="mt-2 text-xs text-[color:var(--color-danger)]">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          ยกเลิก
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!selected || pending}
          onClick={confirm}
          data-testid="attach-document-confirm"
        >
          {pending ? "กำลังผูก…" : "ผูกเอกสาร"}
        </button>
      </div>
    </Modal>
  );
}

export function MoveFolderModal({
  open,
  onClose,
  systemId,
  ids,
  folders,
  currentFolder,
}: {
  open: boolean;
  onClose: () => void;
  systemId: string;
  /** 1 รายการ = ย้ายเดี่ยว · หลายรายการ = bulk */
  ids: string[];
  folders: string[];
  currentFolder?: string | null;
}) {
  const [value, setValue] = useState(currentFolder ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  const undoToast = useUndoToast();

  useEffect(() => {
    if (open) setValue(currentFolder ?? "");
  }, [open, currentFolder]);

  const confirm = () => {
    start(async () => {
      const folder = value.trim() || null;
      if (ids.length > 1) {
        // ย้ายหลายไฟล์พร้อมกัน (moveAttachmentsBulk ไม่มีทาง ok:false) — undo-stack.ts รองรับเฉพาะไฟล์เดียว
        // ต่อ token วันนี้ ⇒ ไม่มี toast เลิกทำสำหรับ bulk
        await moveAttachmentsBulkAction(systemId, ids, folder);
        onClose();
        return;
      }
      const r = await moveAttachmentWithUndoAction(systemId, ids[0] ?? "", folder);
      if (r.ok) {
        onClose();
        undoToast.show({ tokenId: r.undoToken, systemId, message: "ย้ายโฟลเดอร์แล้ว" });
        router.refresh();
      } else {
        setError(r.reason);
      }
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="ย้ายโฟลเดอร์" size="sm" sheetOnMobile testId="move-folder-modal">
      <p className="mb-2 text-sm text-[color:var(--color-muted)]">
        {ids.length > 1 ? `เลือกไว้ ${ids.length} ไฟล์` : "1 ไฟล์"} — เว้นว่าง = ไฟล์ลอย (ไม่อยู่ในโฟลเดอร์ใด)
      </p>
      <input
        list="attachment-folder-list"
        className="input w-full"
        placeholder="ชื่อโฟลเดอร์ (พิมพ์ใหม่ = สร้างโฟลเดอร์)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        data-testid="move-folder-input"
        autoFocus
      />
      <datalist id="attachment-folder-list">
        {folders.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      {error && <p className="mt-2 text-xs text-[color:var(--color-danger)]">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          ยกเลิก
        </button>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={confirm} data-testid="move-folder-confirm">
          {pending ? "กำลังย้าย…" : "ย้ายโฟลเดอร์"}
        </button>
      </div>
    </Modal>
  );
}

export function ChangeTypeModal({
  open,
  onClose,
  systemId,
  attachmentId,
  initialValue,
  linked,
}: {
  open: boolean;
  onClose: () => void;
  systemId: string;
  attachmentId: string;
  initialValue: string | null;
  /** ผูกกับเอกสารแล้วหรือยัง — true = แก้ประเภทไม่ได้ (ป้ายมาจากเอกสารจริง) */
  linked: boolean;
}) {
  const [value, setValue] = useState(initialValue ?? "GENERAL");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  const undoToast = useUndoToast();

  useEffect(() => {
    if (open) {
      setValue(initialValue ?? "GENERAL");
      setError("");
    }
  }, [open, initialValue]);

  const confirm = () => {
    start(async () => {
      const r = await setDocTypeHintWithUndoAction(systemId, attachmentId, value);
      if (r.ok) {
        onClose();
        undoToast.show({ tokenId: r.undoToken, systemId, message: "เปลี่ยนประเภทแล้ว" });
        router.refresh();
      } else {
        setError(r.reason);
      }
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="เปลี่ยนประเภท" size="sm" sheetOnMobile testId="attachment-type-modal">
      {linked ? (
        <>
          <p className="text-sm text-[color:var(--color-muted)]" data-testid="attachment-type-linked-note">
            ไฟล์นี้ผูกกับเอกสารแล้ว — ประเภทถูกกำหนดจากชนิดเอกสารที่ผูกโดยอัตโนมัติ ถ้าจะเปลี่ยนประเภท กรุณา "แยกออกจากเอกสาร" ก่อน
          </p>
          <div className="mt-4 flex justify-end">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              ปิด
            </button>
          </div>
        </>
      ) : (
        <>
          <select className="input w-full" value={value} onChange={(e) => setValue(e.target.value)} data-testid="attachment-type-select">
            {DOC_TYPE_HINT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {error && <p className="mt-2 text-xs text-[color:var(--color-danger)]">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              ยกเลิก
            </button>
            <button type="button" className="btn btn-primary" disabled={pending} onClick={confirm} data-testid="attachment-type-confirm">
              {pending ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
