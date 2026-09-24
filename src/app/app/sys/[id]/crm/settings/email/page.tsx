import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { getEmailSettings, listDomains, listTemplates, listUserSettings, resolveRouting } from "@/lib/modules/crm/emails";
import {
  CRM_EMAIL_COPY_MODES,
  CRM_EMAIL_FROM_MODES,
  CRM_EMAIL_REPLY_MODES,
  CRM_EMAIL_RETENTION_MAX_DAYS,
  CRM_EMAIL_RETENTION_MIN_DAYS,
  CRM_EMAIL_SUBJECT_MAX,
} from "@/lib/modules/crm/emails-shared";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { thaiDateLabel } from "@/lib/modules/crm/activities-shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { EmailSettingsForm } from "@/components/crm/emails/EmailSettingsForm";
import type { CrmEmailSettingsData, CrmEmailUserRow } from "@/components/crm/emails/types";

// ตั้งค่า — อีเมล (เส้นทางส่ง/รับ) · ใบ C2.5b · ภาพ 15 — `/app/sys/{id}/crm/settings/email`
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ · ยังไม่เปิด CRM v2 · ไม่มีคีย์ `crm.email.settings` = notFound()
// 🔴 หน้า GET ไม่เขียนอะไร ยกเว้นการสร้าง "กุญแจกล่องขาเข้า" ครั้งแรกของระบบ (คำสั่งเดียว · เขียนเฉพาะเมื่อยังว่าง)
//    — ถ้าไม่ทำตรงนี้ หน้าจะโชว์ที่อยู่รับจดหมายไม่ได้เลยจนกว่าจะมีคนกดอะไรสักอย่าง
// 🔴 ด่าน F2.3: `src/components/**` ล้วงโมดูล CRM ไม่ได้ ⇒ ทะเบียนโหมด/ป้ายไทย/เพดาน แปลงเป็น props ที่นี่

const FROM_MODE_TH: Record<string, string> = { SHARK: "ใช้กล่อง SHARK — @shark.in.th (ไม่ต้องตั้งค่า DNS)", DOMAIN: "โดเมนของร้านเอง (ต้องยืนยัน DNS ก่อน)" };
const REPLY_MODE_TH: Record<string, string> = {
  SHARK: "กล่อง SHARK (แนะนำ — คำตอบเข้า CRM อัตโนมัติ)",
  STAFF: "อีเมลของพนักงานผู้ส่ง",
  SELF: "อีเมลของพนักงานผู้ส่ง (ตัวเอง)",
  CUSTOM: "กำหนดเอง",
};
const COPY_MODE_TH: Record<string, string> = { NONE: "ไม่ส่งสำเนา", IN: "เฉพาะจดหมายเข้า", OUT: "เฉพาะจดหมายออก", BOTH: "ทั้งเข้าและออก" };
const DOMAIN_STATUS_TH: Record<string, string> = { PENDING: "รอยืนยัน DNS", VERIFIED: "ยืนยันแล้ว", FAILED: "ยืนยันไม่ผ่าน" };

export default async function CrmEmailSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 ◂
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!crmCan(actor, "crm.email.settings")) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };

  const [settings, domains, overrides, templates, routing] = await Promise.all([
    getEmailSettings(ctx, actor),
    listDomains(ctx, actor),
    listUserSettings(ctx, actor),
    listTemplates(ctx, actor),
    resolveRouting(ctx, actor).catch(() => null),
  ]);

  // รายชื่อพนักงานที่ "เข้า CRM ได้จริง" (ตารางทับค่าต่อผู้ใช้ของภาพ 15) — คนที่ไม่มีคีย์ไม่ต้องขึ้นตาราง
  const members = await prisma.membership.findMany({
    where: { tenantId, acceptedAt: { not: null } },
    select: { userId: true, role: true, permissions: true, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const byUser = new Map(overrides.map((o) => [o.userId, o]));
  const users: CrmEmailUserRow[] = members
    .filter((m) => crmCan({ role: m.role, permissions: (m.permissions ?? {}) as Record<string, unknown> }, "crm.email.send"))
    .map((m) => {
      const o = byUser.get(m.userId);
      return {
        userId: m.userId,
        name: m.user?.name ?? "(ไม่มีชื่อ)",
        userEmail: m.user?.email ?? null,
        fromName: o?.fromName ?? null,
        fromAddr: o?.fromAddr ?? null,
        replyToMode: o?.replyToMode ?? settings.replyToMode,
        replyToAddr: o?.replyToAddr ?? null,
        copyToAddr: o?.copyToAddr ?? null,
        copyMode: o?.copyMode ?? "NONE",
        hasSignature: !!o?.signatureHtml,
      };
    });

  const data: CrmEmailSettingsData = {
    systemId: id,
    settings: {
      inboundEnabled: settings.inboundEnabled,
      fromMode: settings.fromMode,
      fromName: settings.fromName,
      fromAddr: settings.fromAddr,
      replyToMode: settings.replyToMode,
      replyToAddr: settings.replyToAddr,
      copyToAddr: settings.copyToAddr,
      copyMode: settings.copyMode,
      bccCaptureEnabled: settings.bccCaptureEnabled,
      strangerToLead: settings.strangerToLead,
      trackOpens: settings.trackOpens,
      trackClicks: settings.trackClicks,
      retentionDays: settings.retentionDays,
      allowUserOverride: settings.allowUserOverride,
      inboundAddress: settings.inboundAddress,
    },
    effectiveFrom: routing?.fromAddr ?? settings.inboundAddress,
    effectiveReplyTo: routing?.replyTo ?? settings.inboundAddress,
    via: routing?.via ?? "SHARK",
    domains: domains.map((d) => ({
      id: d.id,
      domain: d.domain,
      status: d.status,
      statusLabel: DOMAIN_STATUS_TH[d.status] ?? d.status,
      records: d.records.map((r) => ({ type: r.type, name: r.name, value: r.value, priority: r.priority ?? null, status: r.status ?? null })),
      verifiedAtLabel: d.verifiedAt ? thaiDateLabel(new Date(d.verifiedAt).getTime(), true) : null,
    })),
    users,
    templates: templates.map((t) => ({ id: t.id, name: t.name, subject: t.subject, bodyHtml: t.bodyHtml, category: t.category, active: t.active })),
    fromModes: CRM_EMAIL_FROM_MODES.map((m) => ({ value: m, label: FROM_MODE_TH[m] ?? m })),
    replyModes: CRM_EMAIL_REPLY_MODES.map((m) => ({ value: m, label: REPLY_MODE_TH[m] ?? m })),
    copyModes: CRM_EMAIL_COPY_MODES.map((m) => ({ value: m, label: COPY_MODE_TH[m] ?? m })),
    limits: { retentionMin: CRM_EMAIL_RETENTION_MIN_DAYS, retentionMax: CRM_EMAIL_RETENTION_MAX_DAYS, rotateReasonMin: 5, subjectMax: CRM_EMAIL_SUBJECT_MAX },
  };

  const def = systemDef(sys.type);
  return (
    <div className="flex min-w-0 max-w-5xl flex-col gap-4">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        back={{ href: `/app/sys/${id}/crm/settings`, label: "ตั้งค่า CRM" }}
        desc="ตั้งค่า — อีเมล (เส้นทางส่ง/รับ): กล่องรับจดหมายของร้าน · ที่อยู่ผู้ส่ง · ลูกค้าตอบไปที่ไหน · สำเนา · การติดตาม · อายุการเก็บ"
      />
      <ModuleTabs items={crmNavItems(id)} />
      <EmailSettingsForm data={data} />
    </div>
  );
}
