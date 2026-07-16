import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireBackoffice, logoutAction } from "@/lib/platform/actions";
import { caseDetail, addPlatformMessage, setCaseStatus } from "@/lib/platform/support";
import { draftCaseReply } from "@/lib/platform/support-ai";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusChip } from "@/components/ui/StatusChip";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatThaiDateTime } from "@/lib/ui/date";
import ReplyBox from "./ReplyBox";

const STATUS_LABEL: Record<string, string> = {
  OPEN: "รอตอบ",
  PENDING: "ตอบแล้ว รอร้าน",
  RESOLVED: "ปิดแล้ว",
};

// รายละเอียดเคส — บทสนทนา + ตอบกลับ + ปิดเคส
export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireBackoffice();
  const { id } = await params;
  const data = await caseDetail(id);
  if (!data) notFound();
  const { case: c, messages } = data;

  // ตอบกลับร้าน → ตั้งเคสเป็น PENDING (server action, ดึง PlatformUser จาก session)
  async function replyAction(formData: FormData) {
    "use server";
    const me = await requireBackoffice();
    const body = String(formData.get("body") ?? "").trim();
    if (body) {
      await addPlatformMessage(me, id, body);
      revalidatePath(`/backoffice/cases/${id}`);
    }
  }

  // ปิดเคส (RESOLVED) + audit
  async function closeAction() {
    "use server";
    const me = await requireBackoffice();
    await setCaseStatus(me, id, "RESOLVED");
    revalidatePath(`/backoffice/cases/${id}`);
  }

  // ให้ AI ร่างคำตอบ — ร่างเฉย ๆ ไม่เขียน DB, ทีมงานตรวจ+กดส่งเอง · null = AI ยังไม่พร้อม
  async function draftAction(): Promise<string | null> {
    "use server";
    await requireBackoffice();
    return draftCaseReply(id);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={c.subject}
        back={{ href: "/backoffice/cases", label: "เรื่องช่วยเหลือทั้งหมด" }}
        desc={`${c.tenantName} · เปิดเมื่อ ${formatThaiDateTime(c.createdAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip value={c.status} map={STATUS_LABEL} />
            {c.status !== "RESOLVED" && (
              <ConfirmDialog
                triggerLabel="ปิดเคส"
                title="ปิดเคสนี้?"
                detail="ถือว่าแก้ปัญหาเรียบร้อยแล้ว หากร้านพิมพ์ต่อ เคสจะเปิดใหม่อัตโนมัติ"
                confirmLabel="ยืนยันปิดเคส"
                action={closeAction}
              />
            )}
            <form action={logoutAction}>
              <button type="submit" className="btn btn-ghost text-sm">
                ออกจากระบบ
              </button>
            </form>
          </div>
        }
      />

      <Section title="บทสนทนา">
        <div className="flex flex-col gap-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-lg border px-3 py-2 text-sm ${
                m.authorSide === "PLATFORM"
                  ? "self-end bg-[color:var(--color-surface-2)]"
                  : "self-start"
              }`}
            >
              <div className="mb-0.5 text-xs text-[color:var(--color-muted)]">
                {m.authorSide === "PLATFORM" ? "ทีมงาน" : "ร้าน"} ·{" "}
                {formatThaiDateTime(m.createdAt)}
              </div>
              <div className="whitespace-pre-wrap">{m.body}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="ตอบกลับร้าน" card>
        <ReplyBox replyAction={replyAction} draftAction={draftAction} />
      </Section>
    </div>
  );
}
