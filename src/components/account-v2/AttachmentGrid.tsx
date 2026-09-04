import { formatDateTh } from "@/lib/ui/date";
import { AccountIcon } from "./AccountIcon";
import { AttachmentAvatar } from "./AttachmentAvatar";
import { AttachmentTypeCell } from "./AttachmentTypeCell";
import { AttachmentLinkCell } from "./AttachmentLinkCell";
import { AttachmentRowMenu } from "./AttachmentRowMenu";
import type { AttachmentRowView } from "@/lib/modules/account/attachment";

// AttachmentGrid — มุมมอง grid ของคลังเอกสาร V2 (WO 7.1 §12 "list/grid toggle") — การ์ดใหญ่ thumb เต็มความกว้าง
export function AttachmentGrid({
  systemId,
  rows,
  folders,
  linkedHrefOf,
  createExpenseHrefOf,
}: {
  systemId: string;
  rows: AttachmentRowView[];
  folders: string[];
  linkedHrefOf: (row: AttachmentRowView) => string | null;
  createExpenseHrefOf: (row: AttachmentRowView) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="documents-grid">
      {rows.map((r) => (
        <div key={r.id} className="flex flex-col gap-2 rounded-xl border p-3" data-testid={`documents-grid-card-${r.id}`}>
          <div className="flex h-32 items-center justify-center overflow-hidden rounded-lg" style={{ background: "var(--color-surface-2)" }}>
            {r.mimeType.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element -- thumb จาก CDN ของ tenant
              <img src={r.thumbUrl ?? r.fileUrl} alt={r.fileName} className="h-full w-full object-cover" />
            ) : (
              <AccountIcon name="file" className="h-10 w-10 text-[color:var(--color-muted)]" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={r.fileName}>{r.fileName}</p>
            <p className="text-xs text-[color:var(--color-muted)]">{formatDateTh(r.createdAt)}</p>
          </div>
          <AttachmentTypeCell systemId={systemId} attachmentId={r.id} label={r.typeLabel} docTypeHint={r.docTypeHint} linked={!!r.document} />
          <AttachmentAvatar name={r.uploaderName} />
          <div className="flex items-center justify-between gap-2">
            <AttachmentLinkCell
              systemId={systemId}
              attachmentId={r.id}
              fileName={r.fileName}
              linkedHref={linkedHrefOf(r)}
              linkedDocNo={r.document?.docNo ?? null}
              createExpenseHref={createExpenseHrefOf(r)}
            />
            <AttachmentRowMenu
              systemId={systemId}
              attachmentId={r.id}
              fileName={r.fileName}
              fileUrl={r.fileUrl}
              mimeType={r.mimeType}
              folder={r.folder}
              folders={folders}
              docTypeHint={r.docTypeHint}
              linked={!!r.document}
              createExpenseHref={createExpenseHrefOf(r)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default AttachmentGrid;
