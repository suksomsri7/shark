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
  setCaseStage,
} from "@/lib/platform/support";
import { isCaseStage } from "@/lib/support/stage";
import { caseAttachmentsDto } from "@/lib/support/files";
import { draftCaseReply } from "@/lib/platform/support-ai";
import { roomForSupport } from "@/lib/platform/secretary-ops";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusChip } from "@/components/ui/StatusChip";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatThaiDateTime } from "@/lib/ui/date";
import { RoomReadOnlyView } from "../../secretary/RoomReadOnlyView";
import { STATUS_LABEL, STAGE_LABEL, STAGE_ACTION, CASE_STAGES, SOURCE_LABEL, CATEGORY_LABEL, caseNoLabel } from "../labels";
import ReplyBox from "./ReplyBox";

// รายละเอียดเคส (S2.16 · จอ H4) — รับเรื่อง · ระงับเลขาของร้าน · เปิดร้าน · ของที่แนบอัตโนมัติ (ห้องงานเลขา อ่านอย่างเดียว) · ร่างคำตอบ AI · ตอบ (เคสจากแอป ⇒ push ถึงผู้แจ้ง)
export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireBackoffice();
  const { id } = await params;
  const data = await caseDetail(id);
  if (!data) notFound();
  const { case: c, messages, stageEvents } = data;
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

  // help-cases: ตั้งขั้นของเคส (ประวัติ + บรรทัดระบบในห้องของร้าน + push ถึงผู้แจ้ง) — SUPER_ADMIN/SUPPORT
  async function stageAction(formData: FormData) {
    "use server";
    const pu = await requireBackoffice(CASE_WRITE_ROLES);
    const stage = String(formData.get("stage") ?? "");
    const note = String(formData.get("note") ?? "").trim();
    if (isCaseStage(stage)) {
      await setCaseStage(pu, id, stage, note ? { note } : undefined);
      revalidatePath(`/backoffice/cases/${id}`);
      revalidatePath("/backoffice/cases");
    }
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

  // บทสนทนา + บรรทัดระบบ "สถานะ → …" เรียงตามเวลา (ข้ามแถวเปิดเคส — ไม่มี fromStage)
  type Row = { kind: "msg"; at: Date; m: (typeof messages)[number] } | { kind: "stage"; at: Date; e: (typeof stageEvents)[number] };
  const timeline: Row[] = [
    ...messages.map((m) => ({ kind: "msg" as const, at: m.createdAt, m })),
    ...stageEvents.filter((e) => e.fromStage).map((e) => ({ kind: "stage" as const, at: e.createdAt, e })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const fileUrl = (fileId: string) => `/backoffice/cases/${encodeURIComponent(c.id)}/files/${encodeURIComponent(fileId)}`;

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
            <span className="rounded-full border px-2 py-0.5 text-xs font-semibold" data-testid="case-stage">
              {STAGE_LABEL[c.stage] ?? c.stage}
            </span>
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

      {canWrite && (
        <Section title="ขั้นของเคส (ร้านเห็นเป็นแถบความคืบหน้า)" card>
          <form action={stageAction} className="flex flex-col gap-3" data-testid="case-stage-form">
            <input
              name="note"
              className="input"
              maxLength={200}
              placeholder="ข้อความประกอบสั้น ๆ (ไม่บังคับ) เช่น ทีมพบสาเหตุแล้ว — ร้านเห็นในแจ้งเตือน"
            />
            <div className="flex flex-wrap gap-2">
              {CASE_STAGES.map((st) => (
                <button
                  key={st}
                  type="submit"
                  name="stage"
                  value={st}
                  disabled={st === c.stage}
                  className={`btn text-sm ${st === c.stage ? "btn-primary" : "btn-ghost"} disabled:opacity-80`}
                  data-testid={`case-stage-${st}`}
                >
                  {STAGE_ACTION[st] ?? st}
                </button>
              ))}
            </div>
            <span className="text-xs text-[color:var(--color-muted)]">
              เปลี่ยนขั้น = บรรทัดระบบในห้องของร้าน + แจ้งเตือนผู้แจ้ง · ร้านตอบตอน &quot;รอข้อมูล&quot; ⇒ กลับเป็นกำลังตรวจสอบเอง · ร้านกดแก้แล้ว ⇒ ปิดเคส
            </span>
          </form>
        </Section>
      )}

      <Section title="บทสนทนา">
        <div className="flex flex-col gap-2">
          {timeline.map((row) =>
            row.kind === "stage" ? (
              <div key={row.e.id} className="self-center text-xs text-[color:var(--color-muted)]" data-testid="case-stage-line">
                {formatThaiDateTime(row.e.createdAt)} · {row.e.actorSide === "PLATFORM" ? "ทีมงาน" : "ร้าน"} · สถานะ →{" "}
                <b>{STAGE_LABEL[row.e.toStage] ?? row.e.toStage}</b>
                {row.e.note ? ` · ${row.e.note}` : ""}
              </div>
            ) : (
              <div
                key={row.m.id}
                className={`max-w-[85%] rounded-lg border px-3 py-2 text-sm ${
                  row.m.authorSide === "PLATFORM" ? "self-end bg-[color:var(--color-surface-2)]" : "self-start"
                }`}
              >
                <div className="mb-0.5 text-xs text-[color:var(--color-muted)]">
                  {row.m.authorSide === "PLATFORM" ? "ทีมงาน" : "ร้าน"} · {formatThaiDateTime(row.m.createdAt)}
                </div>
                <div className="whitespace-pre-wrap">{row.m.body}</div>
                {(() => {
                  const atts = caseAttachmentsDto(row.m.attachmentsJson, fileUrl);
                  if (atts.length === 0) return null;
                  return (
                    <div className="mt-2 flex flex-wrap gap-2" data-testid="case-attachments">
                      {atts.map((a) =>
                        a.private && !canWrite ? (
                          <span key={a.id} className="rounded border px-2 py-1 text-xs text-[color:var(--color-muted)]">
                            📎 {a.name}
                          </span>
                        ) : (
                          <a
                            key={a.id}
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded border px-2 py-1 text-xs text-[color:var(--color-accent)]"
                            data-testid="case-attachment-link"
                          >
                            📎 {a.name}
                            {a.size ? ` · ${Math.max(1, Math.round(a.size / 1024))} KB` : ""}
                          </a>
                        ),
                      )}
                    </div>
                  );
                })()}
              </div>
            ),
          )}
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
