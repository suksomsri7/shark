import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { getUserSetting, listThreads } from "@/lib/modules/crm/emails";
import { crmEmailSettingsOf } from "@/lib/modules/crm/settings";
import { CRM_EMAIL_REPLY_MODES } from "@/lib/modules/crm/emails-shared";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { thaiDateLabel, thaiTimeLabel } from "@/lib/modules/crm/activities-shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { EmailInbox } from "@/components/crm/emails/EmailInbox";
import type { CrmEmailInboxData, CrmEmailMySendingData, CrmEmailThreadRow } from "@/components/crm/emails/types";

// กล่องจดหมายของ CRM v2 (ใบ C2.5b · ภาพ 08 กลาง) — `/app/sys/{id}/crm/emails`
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ · ระบบยังไม่เปิด CRM v2 · ไม่มีคีย์ `crm.email.read` = notFound()
// 🔴 กล่อง "ยังไม่จับคู่" เป็นของแยกต่างหาก — ต้องเห็นผู้ติดต่อทั้งระบบ หรือเป็นผู้จัดการ/เจ้าของร้าน (AUDIT-CLASS X1)
//    บริการเป็นคนตัดสิน (`listThreads({ unmatched: true })`) · ที่นี่แค่ "ถามแล้วไม่โชว์แท็บถ้าเปิดไม่ได้"
// 🔴 หน้า GET ไม่เขียนอะไรเลย · ด่าน F2.3: `src/components/**` ล้วงโมดูล CRM ไม่ได้ ⇒ แปลงเป็น props ที่นี่

/** ป้ายไทยของโหมด Reply-To (ชุดเดียวกันกับหน้าตั้งค่าอีเมลของร้าน — ด่าน F2.3 ห้ามคอมโพเนนต์ดึงทะเบียนของโมดูลเอง) */
const REPLY_MODE_TH: Record<string, string> = {
  SHARK: "กล่อง SHARK (แนะนำ — คำตอบเข้า CRM อัตโนมัติ)",
  STAFF: "อีเมลของพนักงานผู้ส่ง",
  SELF: "อีเมลของพนักงานผู้ส่ง (ตัวเอง)",
  CUSTOM: "กำหนดเอง",
};

export default async function CrmEmailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ box?: string; q?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!crmCan(actor, "crm.email.read")) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };

  const wantUnmatched = String(sp?.box ?? "") === "unmatched";
  const q = String(sp?.q ?? "").slice(0, 120);
  // "เปิดกล่องยังไม่จับคู่ได้ไหม" ถามบริการจริง (ไม่เดาจากบทบาทเอง) — ปฏิเสธ = ไม่มีแท็บ ไม่มีลิงก์ตาย
  const unmatched = await listThreads(ctx, actor, { unmatched: true, ...(q ? { q } : {}) }).catch(() => null);
  const canSeeUnmatched = unmatched !== null;
  const box: "all" | "unmatched" = wantUnmatched && canSeeUnmatched ? "unmatched" : "all";
  const listed = box === "unmatched" && unmatched ? unmatched : await listThreads(ctx, actor, q ? { q } : {});

  const contactIds = [...new Set(listed.items.map((t) => t.contactId).filter((x): x is string => !!x))];
  const contacts = contactIds.length
    ? await prisma.crmContact.findMany({ where: { id: { in: contactIds }, tenantId, systemId: id }, select: { id: true, name: true, company: true } })
    : [];
  const nameOf = new Map(contacts.map((c) => [c.id, c.name]));
  const companyOf = new Map(contacts.map((c) => [c.id, c.company]));

  const items: CrmEmailThreadRow[] = listed.items.map((t) => ({
    threadKey: t.threadKey,
    subject: t.subject,
    lastAtLabel: `${thaiDateLabel(new Date(t.lastAt).getTime())} ${thaiTimeLabel(new Date(t.lastAt).getTime())}`,
    count: t.count,
    contactId: t.contactId,
    contactName: t.contactId ? (nameOf.get(t.contactId) ?? null) : null,
    companyName: t.contactId ? (companyOf.get(t.contactId) ?? null) : null,
    direction: t.direction,
    snippet: t.snippet,
    unread: t.unread,
  }));

  // "การส่งของฉัน" — คนที่มีคีย์ส่งจดหมายแก้แถวทับค่าของตัวเองได้ (หน้า /settings/email เปิดได้เฉพาะคีย์ตั้งค่า)
  //   ค่าตั้งของร้านอ่านจาก settings ของระบบที่หน้านี้หยิบมาแล้ว (ไม่ต้องมีคีย์ตั้งค่าเพื่ออ่านสวิตช์ "เปิดทับค่ารายคน")
  let mySending: CrmEmailMySendingData | null = null;
  if (crmCan(actor, "crm.email.send")) {
    const own = await getUserSetting(ctx, actor).catch(() => null);
    const shop = crmEmailSettingsOf(sys.settings);
    mySending = {
      systemId: id,
      userName: auth.user.name ?? "บัญชีนี้",
      userEmail: auth.user.email ?? null,
      allowUserOverride: shop.allowUserOverride,
      fromName: own?.fromName ?? null,
      replyToMode: own?.replyToMode ?? shop.replyToMode,
      replyToAddr: own?.replyToAddr ?? null,
      signatureHtml: own?.signatureHtml ?? null,
      replyModes: CRM_EMAIL_REPLY_MODES.map((m) => ({ value: m, label: REPLY_MODE_TH[m] ?? m })),
    };
  }

  const data: CrmEmailInboxData = { systemId: id, box, canSeeUnmatched, q, items, total: listed.total, mySending };
  const def = systemDef(sys.type);
  return (
    <div className="flex min-w-0 max-w-5xl flex-col gap-4">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        desc="อีเมล — จดหมายเข้า/ออกของลูกค้าทุกฉบับอยู่ที่เดียว ตอบได้จากในนี้ และทุกฉบับขึ้นไทม์ไลน์ของผู้ติดต่อเอง"
      />
      <ModuleTabs items={crmNavItems(id)} />
      <EmailInbox data={data} />
    </div>
  );
}
