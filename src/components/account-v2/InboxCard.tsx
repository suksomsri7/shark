"use client";

// InboxCard — การ์ดไฟล์ในกล่องขาเข้า (WO 7.2 · เฟรม g15-documents-inbox.png / g20-inbox.png)
//
// เดสก์ท็อป (g15): thumb ใหญ่ · ชื่อไฟล์ · วันที่+ชิปที่มา · ผู้ส่ง · แผง "✦ AI อ่านได้" (ผู้ขาย/ยอด/วันที่/
//   VAT/เลขที่ใบกำกับ + จุดความมั่นใจ) · ปุ่มเรียงลง: สร้างบันทึกค่าใช้จ่าย / แนบกับเอกสารที่มี / ไม่ใช่เอกสารบัญชี
// มือถือ (g20): thumb 72 ซ้าย · แผง AI สรุปบรรทัดเดียว · ปุ่ม 3 ปุ่มแถวเดียว (สร้างบันทึกค่าใช้จ่าย/แนบ/ไม่ใช่)
//   · การ์ดที่อ่านไม่ได้ = "อ่านไม่ได้ — กรอกเอง" + ปุ่ม กรอกเอง / ลบ
//
// 🔴 import แบบ `import type` เท่านั้นจาก attachment.ts/inbox-ai.ts (ไฟล์ฝั่ง server ที่ลาก prisma) —
//    ชนิดถูกลบตอน compile จึงไม่ลาก prisma เข้าเบราว์เซอร์ (บทเรียน attachment-shared.ts ของ WO 7.1)
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDateTh } from "@/lib/ui/date";
import { formatBaht } from "@/lib/ui/money";
import { AccountIcon } from "./AccountIcon";
import { AttachDocumentModal, AttachmentPreviewModal } from "./AttachmentModals";
import { InboxCreateExpenseSheet } from "./InboxCreateExpenseSheet";
import { archiveInboxFileAction, readAllPendingAction, readBillAction } from "@/app/app/sys/[id]/account/documents/inbox/actions";
// WO 9.4 §0.3 ข้อ 8 — ทำเครื่องหมายไม่ใช่เอกสารบัญชี ไม่กินเลขที่/ไม่ลงเงิน ⇒ เลิกทำได้ภายใน 5 นาที
import { markNotAccountingWithUndoAction } from "@/lib/modules/account/undo-stack";
import { useUndoToast } from "./UndoToast";
import type { AttachmentRowView } from "@/lib/modules/account/attachment";

/**
 * ปุ่ม "อ่านด้วย AI ทั้งหมด" บนหัวหน้า — อ่านครั้งละไม่เกิน 10 ใบ (readPendingInbox)
 * ไม่มีไฟล์ค้างอ่าน = ปุ่มจาง (ไม่ซ่อน — เจ้าของต้องเห็นว่าเครื่องมือนี้มีอยู่)
 */
export function InboxReadAllButton({ systemId, unreadCount }: { systemId: string; unreadCount: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="btn-sm inline-flex items-center gap-1.5"
        disabled={pending || unreadCount === 0}
        title={unreadCount === 0 ? "ไม่มีไฟล์ที่รออ่าน" : `รออ่าน ${unreadCount} ไฟล์`}
        data-testid="inbox-read-all"
        onClick={() =>
          start(async () => {
            const r = await readAllPendingAction(systemId);
            setMsg(r.done > 0 ? `อ่านแล้ว ${r.done} ไฟล์` : (r.firstReason ?? "ไม่มีไฟล์ที่ต้องอ่าน"));
            router.refresh();
            setTimeout(() => setMsg(null), 4000);
          })
        }
      >
        <AccountIcon name="spark" className="h-4 w-4" />
        {pending ? "กำลังอ่าน…" : "อ่านด้วย AI ทั้งหมด"}
      </button>
      {msg && (
        <span className="absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded-lg border bg-[color:var(--color-surface)] px-2 py-1 text-xs" data-testid="inbox-read-all-msg">
          {msg}
        </span>
      )}
    </span>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  UPLOAD: "อัปโหลด",
  EMAIL: "อีเมล",
  CHAT: "LINE",
  APP: "แอปถ่ายบิล",
};

/** จุดความมั่นใจ 3 จุด (g15 ท้ายทุกแถวของแผง AI) — เต็ม 3 = มั่นใจสูง · 1 = ต้องตรวจก่อน */
function ConfidenceDots({ level, testId }: { level: number; testId?: string }) {
  return (
    <span className="ml-auto inline-flex shrink-0 items-center gap-0.5" aria-label={`ความมั่นใจ ${level} จาก 3`} data-testid={testId}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: i <= level ? "var(--color-accent)" : "var(--color-line)" }}
        />
      ))}
    </span>
  );
}

const dotsOf = (confidence: number, weak = false): number => {
  const base = confidence >= 0.85 ? 3 : confidence >= 0.6 ? 2 : 1;
  return weak ? Math.max(1, base - 1) : base;
};

function AiRow({ label, value, level, testId }: { label: string; value: string; level: number; testId?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-[72px] shrink-0 whitespace-nowrap text-[color:var(--color-muted)]">{label}</span>
      <span className="min-w-0 truncate font-semibold" title={value} data-testid={testId}>
        {value}
      </span>
      <ConfidenceDots level={level} />
    </div>
  );
}

export function InboxCard({
  systemId,
  row,
  editorPathTemplate,
  openCreate,
}: {
  systemId: string;
  row: AttachmentRowView;
  /** แม่แบบเส้นทางหน้าแก้ไขเอกสารรายจ่ายที่เพิ่งสร้าง — `${base}/expense/{docId}/edit` (แทน {docId}) */
  editorPathTemplate: string;
  /** เปิดแผ่นยืนยันทันทีตอนโหลดหน้า (ลิงก์ ?create=<id> จากหน้าคลังเอกสาร) */
  openCreate?: boolean;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState(false);
  const [attach, setAttach] = useState(false);
  const [create, setCreate] = useState(!!openCreate);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const undoToast = useUndoToast();

  const [thumbBroken, setThumbBroken] = useState(false);

  const ex = row.aiExtract;
  const isImage = row.mimeType.startsWith("image/");
  const conf = ex?.confidence ?? 0;
  const sourceLabel = SOURCE_LABEL[row.source ?? "UPLOAD"] ?? "อัปโหลด";
  const sender = row.senderLabel ?? row.uploaderName;

  const readNow = (force: boolean) =>
    start(async () => {
      setMsg(null);
      const r = await readBillAction(systemId, row.id, force);
      if (r.status !== "DONE" && r.reason) setMsg(r.reason);
      router.refresh();
    });

  const markNotAccounting = () =>
    start(async () => {
      const r = await markNotAccountingWithUndoAction(systemId, row.id);
      if (r.ok) undoToast.show({ tokenId: r.undoToken, systemId, message: "ทำเครื่องหมายว่าไม่ใช่เอกสารบัญชีแล้ว" });
      else setMsg(r.reason);
      router.refresh();
    });

  const removeFile = () =>
    start(async () => {
      const r = await archiveInboxFileAction(systemId, row.id);
      if (!r.ok) setMsg(r.reason);
      router.refresh();
    });

  // g15: ช่อง thumb เป็นพื้นเทาอ่อนที่มี "ไอคอนกลาง" เสมอเมื่อยังไม่มีรูปย่อจริง
  //   — รูป (jpg/png/heic) = ไอคอนกล้อง · PDF/อื่น ๆ = ไอคอนเอกสาร
  //   ใช้เมื่อ: ไม่มี thumbUrl (เช่น PDF ที่ยังไม่มีบริการย่อรูป) หรือรูปโหลดไม่ขึ้น (URL ตาย/CDN ล่ม)
  //   ⇒ ไม่มีทางเห็น "กล่องว่างเปล่า" ที่ผู้ใช้อ่านไม่ออกว่าไฟล์ชนิดไหน
  const hasThumb = isImage && !!row.thumbUrl && !thumbBroken;
  const thumb = hasThumb ? (
    // eslint-disable-next-line @next/next/no-img-element -- รูปจาก CDN ของ tenant (ขนาดไม่รู้ล่วงหน้า)
    <img
      src={row.thumbUrl ?? row.fileUrl}
      alt={row.fileName}
      className="h-full w-full object-cover"
      loading="lazy"
      decoding="async"
      onError={() => setThumbBroken(true)}
    />
  ) : (
    <AccountIcon
      name={isImage ? "camera" : "file"}
      className="h-8 w-8 text-[color:var(--color-muted)] md:h-10 md:w-10"
    />
  );

  return (
    <article className="flex flex-col gap-3 rounded-xl border p-3" data-testid={`inbox-card-${row.id}`}>
      {/* มือถือ (g20): thumb 72 ซ้าย + ชื่อไฟล์ขวา · เดสก์ท็อป (g15): thumb ใหญ่เต็มความกว้างแล้วชื่อไฟล์ใต้ */}
      <div className="flex gap-3 md:block">
        <button
          type="button"
          onClick={() => setPreview(true)}
          aria-label={`ดูตัวอย่าง ${row.fileName}`}
          className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-lg md:h-36 md:w-full"
          style={{ background: "var(--color-surface-2)" }}
          data-testid={`inbox-thumb-${row.id}`}
        >
          {thumb}
        </button>
        <div className="min-w-0 flex-1 md:mt-3">
          <p className="truncate font-semibold" title={row.fileName} data-testid={`inbox-file-name-${row.id}`}>
            {row.fileName}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <AccountIcon name="calendar" className="h-4 w-4 shrink-0 text-[color:var(--color-muted)]" />
            <span className="text-sm text-[color:var(--color-muted)]">{formatDateTh(row.createdAt)}</span>
            <span
              className="ml-auto shrink-0 rounded-md border px-1.5 py-0.5 text-xs text-[color:var(--color-muted)]"
              style={{ borderColor: "var(--color-line)" }}
              data-testid={`inbox-source-${row.id}`}
            >
              {sourceLabel}
            </span>
          </div>
          {sender && (
            <div className="mt-1 hidden items-center gap-2 md:flex">
              <AccountIcon name="user" className="h-4 w-4 shrink-0 text-[color:var(--color-muted)]" />
              <span className="truncate text-sm text-[color:var(--color-muted)]">ผู้ส่ง: {sender}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── แผงผลอ่านของ AI ── */}
      {ex ? (
        <div
          className="rounded-lg border p-2.5"
          style={{ background: "var(--color-accent-soft)", borderColor: "var(--color-accent)" }}
          data-testid={`inbox-ai-${row.id}`}
        >
          <div className="mb-1.5 flex items-center gap-1.5">
            <AccountIcon name="spark" className="h-4 w-4 text-[color:var(--color-accent)]" />
            <span className="text-sm font-semibold text-[color:var(--color-accent)]">AI อ่านได้</span>
            <button
              type="button"
              onClick={() => readNow(true)}
              disabled={pending}
              className="ml-auto hidden text-xs text-[color:var(--color-muted)] underline md:inline"
              data-testid={`inbox-reread-${row.id}`}
            >
              อ่านใหม่
            </button>
            {/* มือถือ (g20): มุมขวาของแผงเป็นจุดความมั่นใจ ไม่ใช่ปุ่ม */}
            <span className="ml-auto md:hidden">
              <ConfidenceDots level={dotsOf(conf)} testId={`inbox-conf-${row.id}`} />
            </span>
          </div>

          {/* เดสก์ท็อป: แถว label/value ตาม g15 */}
          <div className="hidden flex-col gap-1 md:flex">
            <AiRow label="ผู้ขาย" value={ex.vendorName} level={dotsOf(conf)} testId={`inbox-vendor-${row.id}`} />
            <AiRow label="ยอด" value={formatBaht(ex.totalSatang, { decimals: true })} level={dotsOf(conf)} testId={`inbox-total-${row.id}`} />
            <AiRow
              label="วันที่"
              value={ex.issueDate ? formatDateTh(`${ex.issueDate}T05:00:00.000Z`) : "— (ไม่มี)"}
              level={dotsOf(conf, !ex.issueDate)}
              testId={`inbox-date-${row.id}`}
            />
            <AiRow
              label="VAT"
              value={ex.vatSatang > 0 ? formatBaht(ex.vatSatang, { decimals: true }) : "— (ไม่มี)"}
              level={dotsOf(conf, ex.vatSatang <= 0)}
              testId={`inbox-vat-${row.id}`}
            />
            {ex.invoiceNo && (
              <AiRow label="เลขที่ใบกำกับ" value={ex.invoiceNo} level={dotsOf(conf)} testId={`inbox-invno-${row.id}`} />
            )}
          </div>

          {/* มือถือ: สรุปบรรทัดเดียวตาม g20 */}
          <p className="text-sm md:hidden" data-testid={`inbox-ai-summary-${row.id}`}>
            {[
              ex.vendorName,
              formatBaht(ex.totalSatang, { decimals: true }),
              ex.issueDate ? formatDateTh(`${ex.issueDate}T05:00:00.000Z`) : null,
              ex.vatSatang > 0 ? `VAT ${formatBaht(ex.vatSatang, { decimals: true })}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {ex.notes && (
            <p className="mt-1.5 text-xs text-[color:var(--color-muted)]" data-testid={`inbox-ai-note-${row.id}`}>
              {ex.notes}
            </p>
          )}
        </div>
      ) : row.aiStatus === "FAILED" || row.aiStatus === "UNSUPPORTED" ? (
        <div
          className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-4 text-center"
          style={{ borderColor: "var(--color-line)" }}
          data-testid={`inbox-ai-failed-${row.id}`}
        >
          <AccountIcon name="warn" className="h-4 w-4 text-[color:var(--color-muted)]" />
          <p className="text-sm">
            <span className="font-semibold">AI อ่านไม่ได้</span>{" "}
            <span className="text-[color:var(--color-muted)]">— กรอกเอง</span>
          </p>
          {row.aiStatus === "UNSUPPORTED" && row.aiReason && (
            <p className="text-xs text-[color:var(--color-muted)]">{row.aiReason}</p>
          )}
        </div>
      ) : (
        <div
          className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-3 text-center"
          style={{ borderColor: "var(--color-line)" }}
          data-testid={`inbox-ai-pending-${row.id}`}
        >
          <p className="text-sm text-[color:var(--color-muted)]">
            {row.aiStatus === "PENDING" ? "กำลังอ่านด้วย AI…" : "ยังไม่ได้ให้ AI อ่านบิลใบนี้"}
          </p>
          <button
            type="button"
            onClick={() => readNow(false)}
            disabled={pending}
            className="btn-sm inline-flex items-center gap-1.5"
            data-testid={`inbox-read-${row.id}`}
          >
            <AccountIcon name="spark" className="h-4 w-4" />
            อ่านด้วย AI
          </button>
        </div>
      )}

      {msg && (
        <p className="text-xs text-[color:var(--color-danger)]" data-testid={`inbox-msg-${row.id}`}>
          {msg}
        </p>
      )}

      {/* ── ปุ่ม: เดสก์ท็อป g15 เรียงลง 3 ปุ่ม ── */}
      <div className="hidden flex-col gap-2 md:flex">
        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={() => setCreate(true)}
          disabled={pending}
          data-testid={`inbox-create-${row.id}`}
        >
          สร้างบันทึกค่าใช้จ่าย
        </button>
        {/* 🔴 g15: ปุ่มรอง = พื้นขาว **มีเส้นขอบ 1px** สูงเท่าปุ่มดำ · `.btn` เดี่ยว ๆ ไม่มีเส้นขอบเลย
            (บทเรียน WO 5.3) ⇒ ต้องคู่กับ `btn-ghost` ซึ่งใส่ border + พื้น surface ให้ */}
        <button type="button" className="btn btn-ghost w-full" onClick={() => setAttach(true)} disabled={pending} data-testid={`inbox-attach-${row.id}`}>
          แนบกับเอกสารที่มี
        </button>
        <button type="button" className="btn btn-ghost w-full" onClick={markNotAccounting} disabled={pending} data-testid={`inbox-not-acc-${row.id}`}>
          ไม่ใช่เอกสารบัญชี
        </button>
      </div>

      {/* ── ปุ่ม: มือถือ g20 แถวเดียว (การ์ดที่อ่านไม่ได้ = กรอกเอง / ลบ) ── */}
      <div className="grid grid-cols-[1.7fr_1fr_1fr] gap-2 md:hidden">
        {ex || (row.aiStatus !== "FAILED" && row.aiStatus !== "UNSUPPORTED") ? (
          <>
            <button type="button" className="btn btn-primary whitespace-nowrap px-2 text-xs" onClick={() => setCreate(true)} disabled={pending} data-testid={`inbox-create-m-${row.id}`}>
              สร้างบันทึกค่าใช้จ่าย
            </button>
            <button type="button" className="btn btn-ghost px-1 text-xs" onClick={() => setAttach(true)} disabled={pending}>
              แนบ
            </button>
            <button type="button" className="btn btn-ghost px-1 text-xs" onClick={markNotAccounting} disabled={pending}>
              ไม่ใช่
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary col-span-2 text-xs" onClick={() => setCreate(true)} disabled={pending} data-testid={`inbox-fill-m-${row.id}`}>
              กรอกเอง
            </button>
            <button type="button" className="btn btn-ghost text-xs" onClick={removeFile} disabled={pending} data-testid={`inbox-delete-${row.id}`}>
              ลบ
            </button>
          </>
        )}
      </div>

      <AttachmentPreviewModal
        open={preview}
        onClose={() => setPreview(false)}
        fileName={row.fileName}
        fileUrl={row.fileUrl}
        mimeType={row.mimeType}
      />
      <AttachDocumentModal
        open={attach}
        onClose={() => {
          setAttach(false);
          router.refresh();
        }}
        systemId={systemId}
        attachmentId={row.id}
        fileName={row.fileName}
      />
      <InboxCreateExpenseSheet
        open={create}
        onClose={() => setCreate(false)}
        systemId={systemId}
        row={row}
        editorPathTemplate={editorPathTemplate}
      />
    </article>
  );
}

export default InboxCard;
