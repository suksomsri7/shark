import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireBackoffice, logoutAction } from "@/lib/platform/actions";
import {
  caseDetail,
  addPlatformMessage,
  setCaseStatus,
  assignCase,
  isUrgentCase,
  suspendTenantSecretary,
  resumeTenantSecretary,
  tenantSecretarySuspendedAt,
  CASE_WRITE_ROLES,
  platformUserBrief,
} from "@/lib/platform/support";
import { draftCaseReply } from "@/lib/platform/support-ai";
import { roomForSupport } from "@/lib/platform/secretary-ops";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusChip } from "@/components/ui/StatusChip";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatThaiDateTime } from "@/lib/ui/date";
import { RoomReadOnlyView } from "../../secretary/RoomReadOnlyView";
import { STATUS_LABEL, SOURCE_LABEL, CATEGORY_LABEL, caseNoLabel } from "../labels";
import ReplyBox from "./ReplyBox";

// รายละเอียดเคส (S2.16 · จอ H4) — รับเรื่อง · ระงับเลขาของร้าน · เปิดร้าน · ของที่แนบอัตโนมัติ (ห้องงานเลขา อ่านอย่างเดียว) · ร่างคำตอบ AI · ตอบ (เคสจากแอป ⇒ push ถึงผู้แจ้ง)
export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireBackoffice();
  const { id } = await params;
  const data = await caseDetail(id);
  if (!data) notFound();
  const { case: c, messages } = data;
  const canWrite = CASE_WRITE_ROLES.includes(me.role);
  const [suspendedAt, room, assignee] = await Promise.all([
    tenantSecretarySuspendedAt(c.tenantId),
    c.roomId && canWrite ? roomForSupport(me, c.roomId) : Promise.resolve(null),
    c.assigneePlatformUserId ? platformUserBrief(c.assigneePlatformUserId) : Promise.resolve(null),
  ]);
  const urgent = isUrgentCase(c);

  // ตอบกลับร้าน → PENDING + ผูกผู้รับ · เคสจากแอป = push ถึงผู้แจ้ง (notifyUser kind help · ใน addPlatformMessage)
  async function replyAction(formData: FormData) {
    "use server";
    const pu = await requireBackoffice();
    const body = String(formData.get("body") ?? "").trim();
    if (body) {
      await addPlatformMessage(pu, id, body);
      revalidatePath(`/backoffice/cases/${id}`);
    }
  }

  // ปิดเคส (RESOLVED) + audit
  async function closeAction() {
    "use server";
    const pu = await requireBackoffice();
    await setCaseStatus(pu, id, "RESOLVED");
    revalidatePath(`/backoffice/cases/${id}`);
  }

  // รับเรื่อง (ผู้รับ = ฉัน) — SUPER_ADMIN/SUPPORT
  async function assignAction() {
    "use server";
    const pu = await requireBackoffice(CASE_WRITE_ROLES);
    await assignCase(pu, id);
    revalidatePath(`/backoffice/cases/${id}`);
    revalidatePath("/backoffice/cases");
  }

  // ระงับ/ยกเลิกระงับเลขาของร้าน (รุ่นแรก = ปิดตอบเองนอกเวลา + OpsEvent + audit · สวิตช์จริง = หนี้ S3)
  async function suspendAction() {
    "use server";
    const pu = await requireBackoffice(CASE_WRITE_ROLES);
    const row = await caseDetail(id);
    if (row) await suspendTenantSecretary(pu, row.case.tenantId, id);
    revalidatePath(`/backoffice/cases/${id}`);
  }
  async function resumeAction() {
    "use server";
    const pu = await requireBackoffice(CASE_WRITE_ROLES);
    const row = await caseDetail(id);
    if (row) await resumeTenantSecretary(pu, row.case.tenantId);
    revalidatePath(`/backoffice/cases/${id}`);
  }

  // ให้ AI ร่างคำตอบ — ร่างเฉย ๆ ไม่เขียน DB, ทีมงานตรวจ+กดส่งเอง · null = AI ยังไม่พร้อม
  async function draftAction(): Promise<string | null> {
    "use server";
    await requireBackoffice();
    return draftCaseReply(id);
  }

  const meta = [
    c.tenantName,
    caseNoLabel(c.caseNo),
    c.source ? (SOURCE_LABEL[c.source] ?? c.source) : null,
    c.category ? (CATEGORY_LABEL[c.category] ?? c.category) : null,
    `เปิดเมื่อ ${formatThaiDateTime(c.createdAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={c.subject}
        back={{ href: "/backoffice/cases", label: "เรื่องแจ้งทั้งหมด" }}
        desc={meta}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {urgent && (
              <span
                className="rounded-full border px-2 py-0.5 text-xs font-semibold"
                style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }}
              >
                ! เรื่องเงิน
              </span>
            )}
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

      <div className="flex flex-wrap items-center gap-2" data-testid="case-actions">
        {canWrite && c.assigneePlatformUserId !== me.id && (
          <form action={assignAction}>
            <button type="submit" className="btn btn-ghost text-sm" data-testid="case-assign">
              รับเรื่อง
            </button>
          </form>
        )}
        <span className="text-xs text-[color:var(--color-muted)]">
          {assignee ? `ผู้รับ: ${assignee.id === me.id ? "ฉัน" : assignee.name || assignee.email}` : "ยังไม่มีผู้รับเรื่อง"}
        </span>
        {canWrite &&
          (suspendedAt ? (
            <ConfirmDialog
              triggerLabel="ยกเลิกการระงับเลขา"
              title="ยกเลิกการระงับเลขาของร้านนี้?"
              detail="คืนค่าการตอบเองนอกเวลาทำการเป็นค่าเดิมก่อนระงับ"
              confirmLabel="ยืนยัน"
              action={resumeAction}
              testId="case-resume-secretary"
            />
          ) : (
            <ConfirmDialog
              triggerLabel="ระงับเลขาของร้านนี้"
              title="ระงับเลขาของร้านนี้?"
              detail="รุ่นแรก: ปิดการตอบลูกค้าเองนอกเวลาทำการของร้าน และบันทึกเหตุการณ์ให้ทีมเห็น (ยังไม่ปิดห้องงานเลขา)"
              confirmLabel="ยืนยันระงับ"
              danger
              action={suspendAction}
              testId="case-suspend-secretary"
            />
          ))}
        {suspendedAt && (
          <span
            className="rounded-full border px-2 py-0.5 text-xs font-semibold"
            style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }}
            data-testid="case-suspended-badge"
          >
            ระงับเลขาแล้ว · {formatThaiDateTime(suspendedAt)}
          </span>
        )}
        <Link href={`/backoffice/tenants/${c.tenantId}`} className="btn btn-ghost text-sm" data-testid="case-open-shop">
          เปิดร้านใน backoffice
        </Link>
      </div>

      <Section title="บทสนทนา">
        <div className="flex flex-col gap-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-lg border px-3 py-2 text-sm ${
                m.authorSide === "PLATFORM" ? "self-end bg-[color:var(--color-surface-2)]" : "self-start"
              }`}
            >
              <div className="mb-0.5 text-xs text-[color:var(--color-muted)]">
                {m.authorSide === "PLATFORM" ? "ทีมงาน" : "ร้าน"} · {formatThaiDateTime(m.createdAt)}
              </div>
              <div className="whitespace-pre-wrap">{m.body}</div>
            </div>
          ))}
        </div>
      </Section>

      {c.roomId && (
        <Section
          title="ที่แนบอัตโนมัติ"
          card
          actions={
            canWrite && room ? (
              <Link href={`/backoffice/secretary/rooms/${c.roomId}`} className="text-xs text-[color:var(--color-accent)]">
                เปิดห้องเต็ม →
              </Link>
            ) : undefined
          }
        >
          {!canWrite ? (
            <div className="text-sm text-[color:var(--color-muted)]">ห้องงานเลขาเปิดดูได้เฉพาะทีมซัพพอร์ต</div>
          ) : room ? (
            <RoomReadOnlyView data={room} messageLimit={20} />
          ) : (
            <div className="text-sm text-[color:var(--color-muted)]">ไม่พบห้องงานที่แนบแล้ว (อาจถูกลบไป)</div>
          )}
        </Section>
      )}

      <Section title={c.source === "APP" ? "ตอบผู้ใช้ (ส่งแจ้งเตือนเข้าแอป)" : "ตอบกลับร้าน"} card>
        <ReplyBox replyAction={replyAction} draftAction={draftAction} />
      </Section>
    </div>
  );
}
