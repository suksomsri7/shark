import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { getThread, listTemplates } from "@/lib/modules/crm/emails";
import { CRM_EMAIL_ATTACH_MAX_BYTES, CRM_EMAIL_ATTACH_MAX_COUNT, CRM_EMAIL_COMPOSER_ATTACH_MAX_BYTES, CRM_EMAIL_SUBJECT_MAX, renderInboundHtml } from "@/lib/modules/crm/emails-shared";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { thaiDateLabel, thaiTimeLabel } from "@/lib/modules/crm/activities-shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { EmailThread } from "@/components/crm/emails/EmailThread";
import type { CrmEmailMessageView, CrmEmailThreadData } from "@/components/crm/emails/types";

// เธรดจดหมาย (ใบ C2.5b · ภาพ 08 กลาง) — `/app/sys/{id}/crm/emails/[threadKey]`
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ · ยังไม่เปิด v2 · ไม่มีคีย์ `crm.email.read` · มองไม่เห็นผู้ติดต่อของเธรดนี้
//    (บริการ `getThread` เป็นคนตัดสินการมองเห็น — ที่นี่แปลง error เป็น notFound() เท่านั้น · AUDIT-CLASS X1)
// 🔴 AUDIT-CLASS X6: HTML ของจดหมายผ่าน `renderInboundHtml` **ที่นี่ (ฝั่งเซิร์ฟเวอร์)** สองรูป — ปิดรูป/เปิดรูป
//    ตัวตัดชุดเดียวกับตอนเก็บ ⇒ ไม่มีวันที่หน้าจอแสดงของที่ตัวเก็บถือว่าอันตราย · หน้าไคลเอนต์แค่เลือกว่าจะใส่รูปไหน
//    ลงใน `<iframe sandbox="">` (ค่าว่าง = ไม่ปลดสิทธิ์ใดให้เอกสารข้างในเลย)
// 🔴 AUDIT-CLASS X10: ไม่มี URL ของไฟล์แนบติดมากับหน้า — มีแต่ `fileId`/ชื่อ/ขนาด (ลิงก์ออกตอนกดผ่าน action)

const REMOTE_IMG_RE = /<img[^>]+src="https?:/i;

export default async function CrmEmailThreadPage({ params }: { params: Promise<{ id: string; threadKey: string }> }) {
  const { id, threadKey } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 ◂
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!crmCan(actor, "crm.email.read")) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };

  const key = decodeURIComponent(String(threadKey ?? ""));
  const thread = await getThread(ctx, actor, key).catch(() => null);
  if (!thread || thread.messages.length === 0) notFound();

  const first = thread.messages[0];
  const last = thread.messages[thread.messages.length - 1];
  const contactId = thread.messages.map((m) => m.contactId ?? null).find((x): x is string => !!x) ?? null;
  const contact = contactId ? await prisma.crmContact.findFirst({ where: { id: contactId, tenantId, systemId: id }, select: { name: true, email: true, company: true } }) : null;

  const messages: CrmEmailMessageView[] = thread.messages.map((m) => {
    const at = m.sentAt ?? m.receivedAt;
    const raw = m.bodyHtml ?? "";
    return {
      id: m.id,
      direction: m.direction,
      fromLabel: m.fromName ? `${m.fromName} <${m.fromAddr}>` : m.fromAddr,
      toLabel: m.toAddrs.join(", "),
      subject: m.subject,
      bodyText: m.bodyText,
      safeHtmlNoImages: raw ? renderInboundHtml(raw, { showImages: false }) : null,
      safeHtmlWithImages: raw ? renderInboundHtml(raw, { showImages: true }) : null,
      hasRemoteImages: REMOTE_IMG_RE.test(raw),
      attachments: m.attachments,
      statusLabel: STATUS_TH[m.status] ?? m.status,
      atLabel: at ? `${thaiDateLabel(new Date(at).getTime())} ${thaiTimeLabel(new Date(at).getTime())}` : "—",
      openCount: m.openCount,
      clickCount: m.clickCount,
      repliedAtLabel: m.repliedAt ? thaiDateLabel(new Date(m.repliedAt).getTime()) : null,
      purged: m.purged,
    };
  });

  const canSend = crmCan(actor, "crm.email.send") && !!contactId;
  const templates = canSend ? await listTemplates(ctx, actor).catch(() => []) : [];
  const data: CrmEmailThreadData = {
    systemId: id,
    threadKey: key,
    subject: first?.subject ?? "",
    contactId,
    contactName: contact?.name ?? null,
    contactEmail: contact?.email ?? null,
    companyName: contact?.company ?? null,
    messages,
    canSend,
    canAttach: !contactId,
    replyToEmailId: last?.id ?? null,
    templates: templates.filter((t) => t.active).map((t) => ({ value: t.id, label: t.name })),
    attachMaxBytes: CRM_EMAIL_ATTACH_MAX_BYTES,
    composerMaxBytes: CRM_EMAIL_COMPOSER_ATTACH_MAX_BYTES,
    attachMaxCount: CRM_EMAIL_ATTACH_MAX_COUNT,
    subjectMax: CRM_EMAIL_SUBJECT_MAX,
  };

  const def = systemDef(sys.type);
  return (
    <div className="flex min-w-0 max-w-4xl flex-col gap-4">
      <PageHeader
        title={`${def?.icon ?? ""} ${contact?.name ?? "จดหมายที่ยังไม่จับคู่"}`.trim()}
        back={{ href: `/app/sys/${id}/crm/emails`, label: "กล่องจดหมาย" }}
        desc={first?.subject ?? ""}
      />
      <ModuleTabs items={crmNavItems(id)} />
      <EmailThread data={data} />
    </div>
  );
}

const STATUS_TH: Record<string, string> = {
  QUEUED: "รอส่งตามเวลา",
  SENT: "ส่งแล้ว",
  DELIVERED: "ถึงกล่องลูกค้าแล้ว",
  OPENED: "ลูกค้าเปิดอ่านแล้ว",
  BOUNCED: "ตีกลับ",
  FAILED: "ส่งไม่สำเร็จ",
  RECEIVED: "จดหมายเข้า",
};
