// WO 7.2 — กล่องขาเข้า (DESIGN-SPEC-V2 §12 · เฟรม g15-documents-inbox.png / g20-inbox.png มือถือ)
//
// ไฟล์ที่ "ยังไม่ผูกเอกสาร" จาก 4 ทาง (อัปโหลด · อีเมล inbox@ · แชท/LINE · แอปถ่ายบิล) มาอยู่ที่นี่
// พร้อมผลอ่านของ AI แล้วจบงานได้ใน 1 คลิก: สร้างบันทึกค่าใช้จ่าย / แนบกับเอกสารที่มี / ไม่ใช่เอกสารบัญชี
// ข้อมูลมาจาก `listAttachmentsPaged` ตัวเดียวกับคลังเอกสาร (tab=unlinked) ตามที่ BLUEPRINT สั่ง
import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import {
  listAttachmentsPaged,
  listFolders,
  type AttachmentTab,
} from "@/lib/modules/account/attachment";
import type { AttachmentSource } from "@/lib/modules/account/attachment-shared";
import { inboxEmailAddress, inboxStats } from "@/lib/modules/account/inbox";
import { editorEditPath } from "@/lib/modules/account/doc-editor-config";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusTabs, type StatusTabDef } from "@/components/account-v2/StatusTabs";
import { AccountIcon } from "@/components/account-v2/AccountIcon";
import { InboxCard, InboxReadAllButton } from "@/components/account-v2/InboxCard";
import { InboxFilterBar } from "@/components/account-v2/InboxFilterBar";
import { AttachmentUploadModal, InboxCaptureBar } from "@/components/account-v2/AttachmentUpload";
import { buildHref } from "@/components/account-v2/url";
import { Pagination } from "@/components/account-v2/Pagination";

type SP = {
  tab?: string;
  source?: string;
  q?: string;
  page?: string;
  pageSize?: string;
  upload?: string;
  /** เปิดแผ่นยืนยันของไฟล์นี้ทันที — ลิงก์ "สร้างบันทึกค่าใช้จ่าย" จากหน้าคลังเอกสาร (WO 7.1) ชี้มาที่นี่ */
  create?: string;
};

// g15: "ยังไม่เชื่อมต่อ 5" | "เชื่อมต่อแล้ว 123" (คำว่า "เชื่อมต่อ" = ผูกกับเอกสารบัญชีแล้ว)
const TABS: StatusTabDef[] = [
  { key: "unlinked", label: "ยังไม่เชื่อมต่อ" },
  { key: "linked", label: "เชื่อมต่อแล้ว" },
];

const SOURCES = new Set<AttachmentSource>(["UPLOAD", "EMAIL", "CHAT", "APP"]);

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { auth, tenantId, systemId } = await loadAccountSystem(id, { can: "account.document.manage" });
  const base = `/app/sys/${id}/account`;
  const pathname = `${base}/documents/inbox`;

  const tab: AttachmentTab = sp.tab === "linked" ? "linked" : "unlinked";
  const source = sp.source && SOURCES.has(sp.source as AttachmentSource) ? (sp.source as AttachmentSource) : undefined;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = Math.max(1, parseInt(sp.pageSize ?? "12", 10) || 12);

  const [list, stats, folders] = await Promise.all([
    listAttachmentsPaged(tenantId, systemId, {
      tab,
      ...(source ? { source } : {}),
      ...(sp.q ? { q: sp.q } : {}),
      page,
      pageSize,
    }),
    inboxStats({ tenantId, systemId }),
    listFolders(tenantId, systemId).then((rs) => rs.map((r) => r.folder)),
  ]);
  const { rows, total, pageCount, counts } = list;
  const inboxEmail = inboxEmailAddress(auth.active.tenant.slug);

  const spForHref: Record<string, string | undefined> = {
    tab,
    source: sp.source,
    q: sp.q,
    pageSize: sp.pageSize,
  };
  // 🔴 ส่งเป็น "แม่แบบข้อความ" ไม่ใช่ฟังก์ชัน — server component ส่งฟังก์ชันให้ client component ไม่ได้
  //    (Next โยน "Functions cannot be passed directly to Client Components" ⇒ หน้า 500 ทั้งหน้า)
  const editorPathTemplate = editorEditPath(base, "EXPENSE", "{docId}");

  return (
    <div className="flex flex-col gap-4 pb-24" data-testid="inbox-page">
      <PageHeader
        title="กล่องขาเข้า"
        desc={<span className="md:hidden">ไฟล์ที่ยังไม่ผูกเอกสาร</span>}
        actions={
          // g20 (มือถือ) ไม่มีปุ่มบนหัวเลย — ใช้ปุ่ม "ถ่ายบิล/อัปโหลดจากเครื่อง" เต็มความกว้างแทน
          // และการอ่านด้วย AI ทำได้จากปุ่มบนการ์ดแต่ละใบอยู่แล้ว ⇒ ซ่อนทั้งคู่บนจอแคบ
          <div className="hidden items-center gap-2 md:flex">
            <InboxReadAllButton systemId={systemId} unreadCount={stats.unreadCount} />
            <Link href={buildHref(pathname, spForHref, { upload: "1" })} className="btn btn-primary inline-flex items-center gap-1.5" data-testid="inbox-upload-btn">
              <AccountIcon name="upload" className="h-4 w-4" />
              อัปโหลด
            </Link>
          </div>
        }
      />

      <StatusTabs
        tabs={TABS}
        counts={{ unlinked: counts.unlinked, linked: counts.linked }}
        active={tab}
        testId="inbox-tabs"
      />

      {/* มือถือ (g20): ปุ่มถ่ายบิลเต็มความกว้าง + ลิงก์อัปโหลดจากเครื่อง — เดสก์ท็อปใช้ปุ่ม "อัปโหลด" บนหัวแทน */}
      <div className="md:hidden">
        <InboxCaptureBar systemId={systemId} />
      </div>

      <div className="hidden md:block">
        <InboxFilterBar pathname={pathname} tab={tab} source={sp.source ?? ""} q={sp.q ?? ""} inboxEmail={inboxEmail} />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {rows.length === 0 ? (
            <p className="rounded-xl border py-16 text-center text-sm text-[color:var(--color-muted)]" data-testid="inbox-empty">
              {tab === "unlinked"
                ? "ไม่มีไฟล์ค้างในกล่องขาเข้า — ส่งรูปบิลเข้าไลน์ร้าน อีเมล หรือกดอัปโหลดได้เลย"
                : "ยังไม่มีไฟล์ที่ผูกกับเอกสารบัญชี"}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="inbox-grid">
              {rows.map((r) => (
                <InboxCard
                  key={r.id}
                  systemId={systemId}
                  row={r}
                  editorPathTemplate={editorPathTemplate}
                  openCreate={sp.create === r.id}
                />
              ))}
            </div>
          )}
          {pageCount > 1 && (
            <div className="mt-3 flex justify-end">
              <Pagination pathname={pathname} searchParams={spForHref} page={page} pageCount={pageCount} pageSize={pageSize} total={total} testId="inbox-pagination" />
            </div>
          )}
        </div>

        {/* แผงขวา g15 — ตัวเลขผลงานของกล่องขาเข้า + วิธีส่งบิลเข้ามา (มือถือไม่มีตามแบบ g20) */}
        <aside className="hidden w-[300px] shrink-0 flex-col gap-4 rounded-xl border p-4 lg:flex" data-testid="inbox-side">
          <div>
            <p className="text-sm text-[color:var(--color-muted)]">เอกสารที่สร้างจากกล่องขาเข้าเดือนนี้</p>
            <p className="mt-1 text-3xl font-semibold">
              <span data-testid="inbox-docs-month">{stats.docsThisMonth}</span>{" "}
              <span className="text-base font-normal text-[color:var(--color-muted)]">ใบ</span>
            </p>
            <p className="mt-1 text-sm text-[color:var(--color-muted)]">ประหยัดเวลา ~{stats.savedHours} ชม.</p>
          </div>
          <div className="border-t pt-3">
            <p className="mb-2 text-sm font-semibold">วิธีส่งบิลเข้ากล่อง</p>
            <ul className="flex flex-col gap-3 text-sm">
              <li className="flex items-start gap-2">
                <AccountIcon name="chat" className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--color-muted)]" />
                <span>ส่งรูปบิลเข้า LINE OA ของร้าน</span>
              </li>
              <li className="flex items-start gap-2 border-t pt-3">
                <AccountIcon name="mail" className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--color-muted)]" />
                <span className="break-all">แนบไฟล์ส่งอีเมลมาที่ {inboxEmail}</span>
              </li>
              <li className="flex items-start gap-2 border-t pt-3">
                <AccountIcon name="camera" className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--color-muted)]" />
                <span>ถ่ายรูปบิลผ่านแอป SHARK แล้วอัปโหลด</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>

      {sp.upload === "1" && (
        <AttachmentUploadModal systemId={systemId} closeHref={buildHref(pathname, spForHref, { upload: undefined })} folders={folders} />
      )}
    </div>
  );
}
