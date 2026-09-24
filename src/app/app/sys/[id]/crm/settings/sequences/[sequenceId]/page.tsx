import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { getSequence, listEnrollments, SequenceError, stats, versionCounts } from "@/lib/modules/crm/sequences";
import { SEQ_STATUS_LABEL, seqStepCard, seqStopReasonLabel, thaiAgoLabel, type SeqEnrollStatus } from "@/lib/modules/crm/sequences-shared";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { SequenceEditor } from "@/components/crm/sequences/SequenceEditor";
import type { SeqEditorData, SeqKind, SeqOverviewCard } from "@/components/crm/sequences/types";

// ตัวแก้ไขลำดับการติดตาม + ผู้ลงทะเบียน + สถิติต่อขั้น (CRM v2 · ใบ C2.2 · ภาพ 07 ล่าง)
//   `/app/sys/{id}/crm/settings/sequences/{sequenceId}`
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ · ยังไม่เปิด CRM v2 · ไม่มีคีย์ · ลำดับของระบบอื่น/ร้านอื่น = notFound()
// 🔴 หน้า GET ไม่เขียนอะไร — ทุกการเขียนไปทาง server action ของโฟลเดอร์แม่ (actions.ts)
// 🔴 ลำดับที่ "ถูกเก็บแล้ว" เปิดได้แบบอ่านอย่างเดียว (มติผู้คุมงานรอบสอง ข้อ 1) — เดิมหน้านี้ 404 ⇒ การเก็บที่ชนเพดานเวลา
//    (remaining > 0) ไม่มีทางกด "ทำการเก็บต่อ" ได้เลย และคนที่เหลือค้าง ACTIVE โดยไม่มีใครเดินต่อ (runDue ข้ามลำดับที่ถูกเก็บ)

export default async function CrmSequenceEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; sequenceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id, sequenceId }, sp] = await Promise.all([params, searchParams]);
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  const canManage = crmCan(actor, "crm.sequence.manage");
  if (!canManage && !crmCan(actor, "crm.sequence.enroll")) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };

  const seq = await getSequence(ctx, actor, sequenceId, { includeArchived: true }).catch((e: unknown) => {
    if (e instanceof SequenceError && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!seq) notFound();
  // ?v=<เวอร์ชัน> = ดูสถิติของเวอร์ชันนั้น (ค่าเริ่มต้น = เวอร์ชันล่าสุด) — ค่าที่ใช้ไม่ได้ถูกบริการปัดเป็นเวอร์ชันล่าสุดเอง
  const wantV = Number(typeof sp.v === "string" ? sp.v : "");
  const [enr, st, versions] = await Promise.all([
    listEnrollments(ctx, actor, { sequenceId: seq.id, take: 500 }),
    stats(ctx, actor, seq.id, { version: Number.isInteger(wantV) && wantV >= 1 ? wantV : null, includeArchived: true }),
    // 🔴 จำนวนคนต่อเวอร์ชันมาจากการนับทั้งตาราง (groupBy ในบริการ) ไม่ใช่จากรายชื่อ 500 แถวด้านล่าง (มติผู้คุมงานรอบสอง ข้อ 2)
    //    ร้านที่มีคนเกิน 500 เคยเห็น "เวอร์ชันอื่น 0 คน" เงียบ ๆ ⇒ ป้ายเตือน "มีคนเดินอยู่บนเวอร์ชันอื่น" ไม่ขึ้นเลย
    versionCounts(ctx, actor, seq.id, { includeArchived: true }),
  ]);

  // ── แถบภาพรวม (ภาพ 07 ล่าง): การ์ดต่อขั้น + ตัวเลขของเวอร์ชันที่กำลังดู ──────────────────────────────
  //    ขั้นของ "เวอร์ชันล่าสุด" มีเนื้อความให้โชว์ (หัวข้ออีเมล/ข้อความ/ชื่องาน) · เวอร์ชันเก่าเหลือแต่ป้ายจากบริการ
  const stepOf = new Map(seq.steps.map((s) => [s.index, s]));
  const sameVersion = st.version === seq.version;
  const overview: SeqOverviewCard[] = st.steps.map((s) => {
    const full = sameVersion ? stepOf.get(s.index) : undefined;
    const card = full
      ? seqStepCard(full, s.index, { businessDaysOnly: seq.businessDaysOnly })
      : { chip: s.index === 0 ? "วันที่ 0" : `ขั้นที่ ${(s.index + 1).toLocaleString("th-TH")}`, title: s.label, detail: "ขั้นของเวอร์ชันก่อนหน้า" };
    return {
      index: s.index,
      kind: s.kind,
      ...card,
      counts: [
        { label: s.kind === "TASK" ? "สร้างงาน" : s.kind === "WAIT" ? "ผ่านขั้นนี้" : "ส่งแล้ว", n: s.sent },
        { label: "ข้าม", n: s.skipped },
        { label: "ไม่สำเร็จ", n: s.failed },
        { label: "กำลังรอขั้นนี้", n: s.active },
      ].filter((c) => c.n > 0),
    };
  });
  const now = new Date();

  const data: SeqEditorData = {
    systemId: id,
    canManage,
    head: {
      id: seq.id,
      name: seq.name,
      description: seq.description ?? "",
      version: seq.version,
      active: seq.active,
      archivedAt: seq.archivedAt,
      stopOnReply: seq.stopOnReply,
      stopOnWon: seq.stopOnWon,
      stopOnLost: seq.stopOnLost,
      businessDaysOnly: seq.businessDaysOnly,
      useWindow: !!seq.sendWindow,
      windowFrom: seq.sendWindow?.from ?? "09:00",
      windowTo: seq.sendWindow?.to ?? "18:00",
    },
    steps: seq.steps.map((s) => ({
      key: `s${s.index}`,
      kind: s.kind as SeqKind,
      subject: s.subject ?? "",
      body: s.body ?? "",
      waitDays: s.waitDays ?? 1,
      waitHours: s.waitHours ?? 0,
      taskTitle: s.taskTitle ?? "",
      taskType: s.taskType ?? "TASK",
      // พกค่าที่หน้านี้ยังไม่มีช่องให้แก้กลับไปด้วยตอนบันทึก (ไม่งั้นการกดบันทึกลบค่าของใบ C2.5 ทิ้ง)
      templateId: s.templateId ?? "",
      channel: s.channel ?? "",
    })),
    stats: st.steps.map((s) => ({ index: s.index, kind: s.kind, label: s.label, sent: s.sent, skipped: s.skipped, failed: s.failed, active: s.active })),
    statsVersion: st.version,
    overview,
    versions,
    enrollments: enr.items.map((e) => ({
      id: e.id,
      contactId: e.contactId,
      contactName: e.contactName,
      companyName: e.companyName,
      // เวลาไทย (+07:00) คิดที่เซิร์ฟเวอร์ — หน้าจอแสดงข้อความสำเร็จรูป (ไม่มีวันเพี้ยนตามเขตเวลาของเครื่องผู้ใช้)
      enteredAgo: thaiAgoLabel(e.createdAt, now),
      contactHref: `/app/sys/${id}/crm/contacts/${e.contactId}`,
      status: e.status,
      statusLabel: SEQ_STATUS_LABEL[e.status as SeqEnrollStatus] ?? e.status,
      stepIndex: e.stepIndex,
      stepCount: e.stepCount,
      sequenceVersion: e.sequenceVersion,
      nextAt: e.nextAt,
      currentStep: e.currentStep,
      stoppedReason: seqStopReasonLabel(e.stoppedReason) || null,
    })),
  };
  const def = systemDef(sys.type);

  return (
    <div className="flex min-w-0 max-w-4xl flex-col gap-4" data-testid="crm-sequence-editor-page">
      <PageHeader
        title={`${def?.icon ?? ""} ${seq.name}`.trim()}
        back={{ href: `/app/sys/${id}/crm/settings/sequences`, label: "ลำดับการติดตาม" }}
        desc="แก้ขั้นของลำดับ ดูสถิติต่อขั้น และดูว่าใครอยู่ขั้นไหน — แก้ขั้นขณะมีคนกำลังเดินอยู่จะขึ้นเวอร์ชันใหม่ให้เอง"
      />
      <ModuleTabs items={crmNavItems(id)} />
      <SequenceEditor data={data} />
    </div>
  );
}
