// WO 7.1 — คลังเอกสาร V2 (DESIGN-SPEC-V2 §12 · เฟรม f9-documents.png / f9-documents-menu.png)
// แทนที่หน้า V1 (วาง URL) ทั้งหมด — อัปโหลดจริงหลายไฟล์ · แท็บสถานะ · list/grid · ตัวกรอง · ผูก/แยก/เปลี่ยนประเภท/
// ย้ายโฟลเดอร์/ลบ (ลบนุ่ม) · bulk · footer ในการ์ดเดียวกับตาราง (บทเรียน 5.4/6.2)
import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import {
  listAttachmentsPaged,
  listFolders,
  listAttachmentUploaders,
  type AttachmentRowView,
  type AttachmentTab,
} from "@/lib/modules/account/attachment";
import {
  DOCUMENTS_RANGE_PRESETS,
  documentsRangeOf,
  type DateRangeKey,
} from "@/lib/modules/account/attachment-shared";
import { parseDay } from "@/lib/modules/account/service";
import { editorDetailPath } from "@/lib/modules/account/doc-editor-config";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusTabs, type StatusTabDef } from "@/components/account-v2/StatusTabs";
import { DocTable, type DocColumn } from "@/components/account-v2/DocTable";
import { AccountIcon } from "@/components/account-v2/AccountIcon";
import { AttachmentAvatar } from "@/components/account-v2/AttachmentAvatar";
import { AttachmentTypeCell } from "@/components/account-v2/AttachmentTypeCell";
import { AttachmentLinkCell } from "@/components/account-v2/AttachmentLinkCell";
import { AttachmentRowMenu } from "@/components/account-v2/AttachmentRowMenu";
import { AttachmentFilterBar } from "@/components/account-v2/AttachmentFilterBar";
import { AttachmentDropBanner, AttachmentUploadModal } from "@/components/account-v2/AttachmentUpload";
import { AttachmentGrid } from "@/components/account-v2/AttachmentGrid";
import { AttachmentBulkModals } from "@/components/account-v2/AttachmentBulkModals";
import { buildHref } from "@/components/account-v2/url";
import { Pagination } from "@/components/account-v2/Pagination";
import { formatDateTh } from "@/lib/ui/date";

type SP = {
  tab?: string;
  view?: string;
  range?: string;
  from?: string;
  to?: string;
  type?: string;
  uploader?: string;
  folder?: string;
  q?: string;
  page?: string;
  pageSize?: string;
  upload?: string;
  bulkIds?: string;
  bulkOp?: string;
};

const TABS: StatusTabDef[] = [
  { key: "all", label: "ทั้งหมด" },
  // f9-documents.png: ตัวเลขของแท็บนี้เป็นวงกลมดำตัวหนังสือขาว (ป้ายเดียวที่ต่างจากแท็บอื่น) — WO 7.1 round 2
  { key: "unlinked", label: "ยังไม่ออกเอกสาร", badge: "pill" },
  { key: "linked", label: "ออกเอกสารแล้ว" },
];

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadAccountSystem(id, { can: "account.document.manage" });
  const base = `/app/sys/${id}/account`;
  const pathname = `${base}/documents`;

  const tab: AttachmentTab = sp.tab === "unlinked" || sp.tab === "linked" ? sp.tab : "all";
  const view = sp.view === "grid" ? "grid" : "list";
  const rangeKey: DateRangeKey = DOCUMENTS_RANGE_PRESETS.some((p) => p.key === sp.range) ? (sp.range as DateRangeKey) : "this_year";
  const now = new Date();
  const preset = documentsRangeOf(rangeKey, now);
  const fromIso = rangeKey === "custom" ? sp.from : (preset.from ?? undefined);
  const toIso = rangeKey === "custom" ? sp.to : (preset.to ?? undefined);
  const from = parseDay(fromIso, false);
  const to = parseDay(toIso, true);

  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = Math.max(1, parseInt(sp.pageSize ?? "10", 10) || 10);

  const [list, folders, uploaders] = await Promise.all([
    listAttachmentsPaged(tenantId, systemId, {
      tab,
      from,
      to,
      docTypeHint: sp.type || undefined,
      uploaderId: sp.uploader || undefined,
      folder: sp.folder || undefined,
      q: sp.q || undefined,
      page,
      pageSize,
    }),
    listFolders(tenantId, systemId).then((rs) => rs.map((r) => r.folder)),
    listAttachmentUploaders(tenantId, systemId),
  ]);
  const { rows, total, pageCount, counts } = list;

  const linkedHrefOf = (r: AttachmentRowView): string | null =>
    r.document ? editorDetailPath(base, r.document.docType, r.document.id) : null;
  // WO 7.2: ปุ่ม "+ สร้าง/แนบเอกสาร" พาไปกล่องขาเข้าแล้วเปิดแผ่นยืนยัน (prefill จากผลอ่าน AI) ของไฟล์นั้น
  // 🔴 เดิมชี้ไป `expense/new?attachmentId=` ซึ่ง **ไม่มีใครอ่านค่านั้น** (7.1 จองไว้ให้ WO นี้) และหน้า new
  //    ก็สร้างร่างทันทีที่เปิด ⇒ prefetch ของ Next อาจสร้างร่างเปล่าโดยผู้ใช้ไม่ได้สั่ง — เส้นนี้ปลอดภัยกว่า
  const createExpenseHrefOf = (r: AttachmentRowView): string => `${base}/documents/inbox?create=${r.id}`;

  const spForHref: Record<string, string | undefined> = {
    tab,
    view: view === "grid" ? "grid" : undefined,
    range: sp.range,
    from: sp.from,
    to: sp.to,
    type: sp.type,
    uploader: sp.uploader,
    folder: sp.folder,
    q: sp.q,
    pageSize: sp.pageSize,
  };

  const cols: DocColumn<AttachmentRowView>[] = [
    {
      key: "file",
      header: "ไฟล์",
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg" style={{ background: "var(--color-surface-2)" }}>
            {r.mimeType.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element -- thumb จาก CDN ของ tenant (ขนาดไม่รู้ล่วงหน้า)
              <img src={r.thumbUrl ?? r.fileUrl} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
            ) : (
              <AccountIcon name="file" className="h-5 w-5 text-[color:var(--color-muted)]" />
            )}
          </div>
          <span className="min-w-0 max-w-[260px] truncate font-medium" title={r.fileName} data-testid="attachment-file-name">
            {r.fileName}
          </span>
        </div>
      ),
    },
    {
      key: "createdAt",
      header: "วันที่อัปโหลด",
      sort: "createdAt",
      render: (r) => <span className="whitespace-nowrap">{formatDateTh(r.createdAt)}</span>,
    },
    {
      key: "type",
      header: "ประเภท",
      render: (r) => (
        <AttachmentTypeCell systemId={systemId} attachmentId={r.id} label={r.typeLabel} docTypeHint={r.docTypeHint} linked={!!r.document} />
      ),
    },
    { key: "uploader", header: "ผู้อัปโหลด", render: (r) => <AttachmentAvatar name={r.uploaderName} /> },
    {
      key: "linked",
      header: "เอกสารที่ผูก",
      render: (r) => (
        <AttachmentLinkCell
          systemId={systemId}
          attachmentId={r.id}
          fileName={r.fileName}
          linkedHref={linkedHrefOf(r)}
          linkedDocNo={r.document?.docNo ?? null}
          createExpenseHref={createExpenseHrefOf(r)}
        />
      ),
    },
  ];

  let bulkModal: React.ReactNode = null;
  if (sp.bulkOp === "move" || sp.bulkOp === "delete") {
    const ids = (sp.bulkIds ?? "").split(",").filter(Boolean);
    const closeHref = buildHref(pathname, spForHref, { bulkOp: undefined, bulkIds: undefined });
    bulkModal = <AttachmentBulkModals systemId={systemId} closeHref={closeHref} op={sp.bulkOp} ids={ids} folders={folders} />;
  }

  return (
    <div className="flex flex-col gap-4 pb-24" data-testid="documents-page">
      <PageHeader
        title="คลังเอกสาร"
        actions={
          <>
            {/* WO 7.2: เปิดใช้จริงแล้ว (เดิมปุ่มจาง "เร็ว ๆ นี้") — f9 วาดปุ่มนี้พร้อม badge จำนวนไฟล์ลอย */}
            <Link href={`${base}/documents/inbox`} className="btn-sm inline-flex items-center gap-1.5" data-testid="documents-inbox-btn">
              <AccountIcon name="mail" className="h-4 w-4" />
              กล่องขาเข้า
              {counts.unlinked > 0 && (
                <span className="rounded-full px-1.5 py-0.5 text-xs font-semibold" style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}>
                  {counts.unlinked}
                </span>
              )}
            </Link>
            <Link href={buildHref(pathname, spForHref, { upload: "1" })} className="btn btn-primary inline-flex items-center gap-1.5" data-testid="documents-upload-btn">
              <AccountIcon name="upload" className="h-4 w-4" />
              อัปโหลดไฟล์
            </Link>
          </>
        }
      />

      <AttachmentDropBanner systemId={systemId} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusTabs tabs={TABS} counts={{ all: counts.all, unlinked: counts.unlinked, linked: counts.linked }} active={tab} testId="documents-tabs" />
        <div className="flex gap-1">
          <Link
            href={buildHref(pathname, spForHref, { view: undefined })}
            aria-label="มุมมองตาราง"
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={view === "list" ? { background: "var(--color-ink)", color: "var(--color-surface)" } : { border: "1px solid var(--color-line)" }}
            data-testid="documents-view-list"
          >
            <AccountIcon name="list" className="h-4 w-4" />
          </Link>
          <Link
            href={buildHref(pathname, spForHref, { view: "grid" })}
            aria-label="มุมมองตาราง grid"
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={view === "grid" ? { background: "var(--color-ink)", color: "var(--color-surface)" } : { border: "1px solid var(--color-line)" }}
            data-testid="documents-view-grid"
          >
            <AccountIcon name="grid" className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <AttachmentFilterBar
        pathname={pathname}
        tab={tab}
        view={view}
        range={rangeKey}
        presets={DOCUMENTS_RANGE_PRESETS}
        from={fromIso ?? ""}
        to={toIso ?? ""}
        docTypeHint={sp.type ?? ""}
        uploaderId={sp.uploader ?? ""}
        uploaders={uploaders}
        folder={sp.folder ?? ""}
        folders={folders}
        q={sp.q ?? ""}
      />

      {view === "grid" ? (
        <div className="flex flex-col gap-3 rounded-xl border p-3">
          <AttachmentGrid systemId={systemId} rows={rows} folders={folders} linkedHrefOf={linkedHrefOf} createExpenseHrefOf={createExpenseHrefOf} />
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-[color:var(--color-muted)]">
              ยังไม่มีไฟล์ในคลังเอกสาร — ลากไฟล์มาวางด้านบน หรือกด "อัปโหลดไฟล์"
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-2 text-sm">
              <span className="text-[color:var(--color-muted)]">ยังไม่ออกเอกสาร {counts.unlinked} ไฟล์</span>
              <Pagination pathname={pathname} searchParams={spForHref} page={page} pageCount={pageCount} pageSize={pageSize} total={total} testId="documents-grid-pagination" />
            </div>
          )}
        </div>
      ) : (
        <DocTable
          testId="documents"
          cols={cols}
          rows={rows}
          pathname={pathname}
          searchParams={spForHref}
          rowActions={(r) => (
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
          )}
          selectionActions={[
            { label: "ย้ายโฟลเดอร์", hrefTemplate: `${buildHref(pathname, spForHref, { bulkOp: "move" })}&bulkIds={ids}` },
            { label: "ลบ", hrefTemplate: `${buildHref(pathname, spForHref, { bulkOp: "delete" })}&bulkIds={ids}` },
          ]}
          bulkBarTint
          rowTestId={(r) => `attachment-row-${r.id}`}
          footerLeft={<span className="text-[color:var(--color-muted)]">ยังไม่ออกเอกสาร {counts.unlinked} ไฟล์</span>}
          footerOneLine
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          total={total}
          emptyText={`ยังไม่มีไฟล์ในคลังเอกสาร — ลากไฟล์มาวางด้านบน หรือกดปุ่มด้านล่างเพื่ออัปโหลด`}
          emptyAction={{ href: buildHref(pathname, spForHref, { upload: "1" }), label: "อัปโหลดไฟล์" }}
        />
      )}

      {sp.upload === "1" && (
        <AttachmentUploadModal systemId={systemId} closeHref={buildHref(pathname, spForHref, { upload: undefined })} folders={folders} />
      )}
      {bulkModal}
    </div>
  );
}
