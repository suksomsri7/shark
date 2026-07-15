import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import {
  listAttachments,
  listFolders,
  humanSize,
  isImageMime,
} from "@/lib/modules/account/attachment";
import { addAttachmentAction, deleteAttachmentAction } from "./actions";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import FormField from "@/components/ui/FormField";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { formatThaiDate as fmtDate } from "@/lib/ui/date";


export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ folder?: string; q?: string; err?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { folder, q, err, ok } = await searchParams;
  const { tenantId, systemId } = await loadAccountSystem(id);
  const base = `/app/sys/${id}/account`;
  const [files, folders] = await Promise.all([
    listAttachments(tenantId, systemId, { folder: folder || undefined, q: q || undefined }),
    listFolders(tenantId, systemId),
  ]);
  const docBase = `${base}/documents`;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="คลังเอกสาร"
        desc="เก็บไฟล์แนบเอกสารบัญชี + ไฟล์ลอย (สัญญา/ใบเสร็จ/สลิป) — วาง URL ไฟล์"
        back={{ href: base, label: "ระบบบัญชี" }}
      />

      {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}
      {ok === "1" && <p className="text-sm font-medium">บันทึกไฟล์สำเร็จ</p>}

      {/* ตัวกรอง: โฟลเดอร์ + ค้นหา */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href={docBase}
          className="rounded-full border px-3 py-1.5 text-sm"
          style={!folder ? { background: "var(--color-ink)", color: "var(--color-surface)" } : undefined}
        >
          ทั้งหมด
        </Link>
        {folders.map((f) => (
          <Link
            key={f.folder}
            href={`${docBase}?folder=${encodeURIComponent(f.folder)}`}
            className="rounded-full border px-3 py-1.5 text-sm"
            style={folder === f.folder ? { background: "var(--color-ink)", color: "var(--color-surface)" } : undefined}
          >
            {f.folder} ({f.count})
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap items-end gap-2">
        {folder && <input type="hidden" name="folder" value={folder} />}
        <FormField label="ค้นหาชื่อไฟล์">
          <input name="q" defaultValue={q ?? ""} className="input" placeholder="พิมพ์ชื่อไฟล์" />
        </FormField>
        <button className="btn btn-ghost text-sm">ค้นหา</button>
      </form>

      <DataList
        items={files.map((f) => ({
          key: f.id,
          primary: (
            <a href={f.fileUrl} target="_blank" rel="noreferrer" className="font-medium underline">
              {isImageMime(f.mimeType) ? "🖼 " : "📄 "}
              {f.fileName}
            </a>
          ),
          secondary: (
            <>
              {f.folder ? `${f.folder} · ` : "ไฟล์ลอย · "}
              {humanSize(f.sizeBytes)} · {fmtDate(f.createdAt)}
              {f.document
                ? ` · แนบกับ ${f.document.docNo ?? f.document.docType}`
                : ""}
            </>
          ),
          trailing: (
            <ConfirmDialog
              action={deleteAttachmentAction}
              fields={{ systemId, id: f.id }}
              triggerLabel="ลบ"
              triggerClassName="text-xs text-[color:var(--color-danger)] underline"
              title="ลบไฟล์นี้ออกจากคลัง?"
              detail="ลบเฉพาะรายการอ้างอิง (ไฟล์ต้นทางที่ URL ยังอยู่)"
              confirmLabel="ยืนยันลบ"
              danger
            />
          ),
        }))}
        empty="ยังไม่มีไฟล์ในคลัง — เพิ่มไฟล์ด้านล่างโดยวาง URL"
      />

      {/* เพิ่มไฟล์เข้าคลัง (URL) */}
      <Section title="เพิ่มไฟล์เข้าคลัง (วาง URL)" card>
        <form action={addAttachmentAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="systemId" value={systemId} />
          <div className="sm:col-span-2">
            <FormField label="URL ไฟล์" hint="ลิงก์ไฟล์ที่อัปโหลดไว้ที่อื่น (Google Drive/S3/Line)" required>
              <input name="fileUrl" required className="input" placeholder="https://…" />
            </FormField>
          </div>
          <FormField label="ชื่อไฟล์" required>
            <input name="fileName" required className="input" placeholder="เช่น สัญญาเช่า.pdf" />
          </FormField>
          <FormField label="โฟลเดอร์" hint="เว้นว่าง = ไฟล์ลอย">
            <input name="folder" defaultValue={folder ?? ""} className="input" list="folder-list" />
            <datalist id="folder-list">
              {folders.map((f) => <option key={f.folder} value={f.folder} />)}
            </datalist>
          </FormField>
          <FormField label="ขนาด (KB)" hint="ประมาณ (ไม่บังคับ)">
            <input name="sizeBytes" type="number" min="0" className="input" />
          </FormField>
          <SubmitButton className="sm:col-span-2 sm:justify-self-start">+ เพิ่มไฟล์</SubmitButton>
        </form>
        <p className="mt-2 text-xs text-[color:var(--color-muted)]">
          หมายเหตุ: ยังไม่มีระบบอัปโหลดไฟล์ในตัว (object storage) — v1 ใช้วาง URL ไฟล์ที่โฮสต์ไว้ที่อื่น
        </p>
      </Section>
    </div>
  );
}
