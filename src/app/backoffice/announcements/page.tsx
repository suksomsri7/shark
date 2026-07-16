import { revalidatePath } from "next/cache";
import { requireBackoffice, logoutAction } from "@/lib/platform/actions";
import {
  createAnnouncement,
  publishAnnouncement,
  unpublishAnnouncement,
  listAnnouncements,
} from "@/lib/platform/announce";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusChip } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/ui/EmptyState";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatThaiDateTime } from "@/lib/ui/date";

// ป้ายสถานะฉบับ (draft = ยังไม่ประกาศ · published = ร้านเห็นแล้ว)
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "ร่าง",
  PUBLISHED: "ประกาศแล้ว",
};

// ── server actions (guard requireBackoffice ทุกครั้ง — pu จาก session เท่านั้น) ──
async function createAction(formData: FormData): Promise<void> {
  "use server";
  const pu = await requireBackoffice();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return;
  await createAnnouncement(pu, { title, body });
  revalidatePath("/backoffice/announcements");
}

async function publishAction(formData: FormData): Promise<void> {
  "use server";
  const pu = await requireBackoffice();
  const id = String(formData.get("id") ?? "");
  if (id) await publishAnnouncement(pu, id);
  revalidatePath("/backoffice/announcements");
}

async function unpublishAction(formData: FormData): Promise<void> {
  "use server";
  const pu = await requireBackoffice();
  const id = String(formData.get("id") ?? "");
  if (id) await unpublishAnnouncement(pu, id);
  revalidatePath("/backoffice/announcements");
}

// จัดการประกาศระบบ — สร้างฉบับร่าง / ประกาศ / เอาลง (ทุก role platform ทำได้)
export default async function AnnouncementsPage() {
  await requireBackoffice();
  const announcements = await listAnnouncements();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="ประกาศระบบ"
        back={{ href: "/backoffice", label: "ภาพรวมแพลตฟอร์ม" }}
        desc={`ทั้งหมด ${announcements.length.toLocaleString("th-TH")} ฉบับ`}
        actions={
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost text-sm">
              ออกจากระบบ
            </button>
          </form>
        }
      />

      <Section title="สร้างประกาศใหม่" card>
        <form action={createAction} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            หัวข้อ
            <input
              name="title"
              required
              maxLength={120}
              placeholder="เช่น ปิดปรับปรุงระบบคืนนี้"
              className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            เนื้อหา
            <textarea
              name="body"
              required
              rows={3}
              placeholder="รายละเอียดที่ต้องการแจ้งทุกร้าน"
              className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]"
            />
          </label>
          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary text-sm">
              บันทึกฉบับร่าง
            </button>
          </div>
        </form>
      </Section>

      <Section title="ประกาศทั้งหมด">
        {announcements.length === 0 ? (
          <EmptyState text="ยังไม่มีประกาศ — สร้างฉบับแรกได้จากด้านบน" />
        ) : (
          <div className="flex flex-col gap-2">
            {announcements.map((a) => {
              const published = a.publishedAt !== null;
              return (
                <div
                  key={a.id}
                  className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{a.title}</span>
                      <StatusChip
                        value={published ? "PUBLISHED" : "DRAFT"}
                        map={STATUS_LABEL}
                        tone={published ? "strong" : "muted"}
                      />
                    </div>
                    <div className="truncate text-xs text-[color:var(--color-muted)]">
                      {published && a.publishedAt
                        ? `ประกาศเมื่อ ${formatThaiDateTime(a.publishedAt)}`
                        : `สร้างเมื่อ ${formatThaiDateTime(a.createdAt)}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {published ? (
                      <ConfirmDialog
                        triggerLabel="เอาลง"
                        triggerClassName="btn-sm"
                        title="เอาประกาศนี้ลง?"
                        detail="ทุกร้านจะไม่เห็นประกาศนี้อีก"
                        confirmLabel="ยืนยันเอาลง"
                        action={unpublishAction}
                        fields={{ id: a.id }}
                      />
                    ) : (
                      <ConfirmDialog
                        triggerLabel="ประกาศ"
                        triggerClassName="btn-sm"
                        title="ประกาศฉบับนี้?"
                        detail="ทุกร้านจะเห็น banner จนกดรับทราบ"
                        confirmLabel="ยืนยันประกาศ"
                        action={publishAction}
                        fields={{ id: a.id }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
