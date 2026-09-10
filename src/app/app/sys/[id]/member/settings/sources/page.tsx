import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canManageSettings, toMemberActor } from "@/lib/modules/member/access";
import { memberSourceLabel } from "@/lib/modules/member/member-source-labels";
import { listLinks, qrDataUrlFor, reportBySource, type SourceCtx } from "@/lib/modules/member/sources";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { MemberSettingsTabs } from "@/components/member/MemberSettingsTabs";
import { SourcesSettings } from "@/components/member/SourcesSettings";

// หน้า "ระบบสมาชิก › ตั้งค่า › ช่องทางที่มา" (M1.8 · ภาพ ledger/design-member/13-acquisition-channels.png)
//
// 🔴 ระบบต้องเป็น MEMBER ของร้านนี้จริง → ไม่เจอ = notFound()
// 🔴 กติกา 404-not-403 (§6.4): ไม่มี `member.settings.manage` → notFound() เหมือนกัน ไม่ใช่หน้า 403
//    (คีย์นี้ MANAGER ไม่ได้โดยปริยาย — §6.1 · ดูหมายเหตุที่หัวไฟล์ access.ts)
// 🔴 ตัวเลขทุกก้อนมาจาก `sources.ts` เท่านั้น (reportBySource + listLinks) — หน้าไม่คิดเลขเอง
//    ยกเว้น KPI ที่เป็นการ "สรุปแถวรายงานอีกชั้น" ซึ่งเป็นการนำเสนอล้วน

/** ช่วงเวลาที่เลือกได้จาก dropdown (ภาพ 13) — ค่านอกรายการ/ไม่ส่งมา = 90 วัน */
const PERIOD_CHOICES = [30, 90, 180, 365];
const DEFAULT_DAYS = 90;

export default async function MemberSourcesSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { id } = await params;
  const { days } = await searchParams;
  const periodDays = PERIOD_CHOICES.includes(Number(days)) ? Number(days) : DEFAULT_DAYS;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canManageSettings(actor)) notFound();

  const ctx: SourceCtx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const now = new Date();
  const from = new Date(now.getTime() - periodDays * 86_400_000);
  const [report, links, units] = await Promise.all([
    reportBySource(ctx, actor, { from, to: now }),
    listLinks(ctx),
    prisma.businessUnit.findMany({ where: { tenantId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  // QR ของทุกลิงก์ (สร้างสดจาก url — ไม่มีไฟล์ค้างให้เน่าเมื่อร้านเปลี่ยนโดเมน)
  const qrList = await Promise.all(links.map(async (l) => [l.id, await qrDataUrlFor(l.url)] as const));
  const qr = Object.fromEntries(qrList);

  const top = report.rows[0] ?? null;
  const costRows = report.rows.filter((r) => r.costSatang > 0);
  const costTotal = costRows.reduce((s, r) => s + r.costSatang, 0);
  const costSignups = costRows.reduce((s, r) => s + r.signups, 0);
  const buyers = report.rows.reduce((s, r) => s + r.buyers, 0);
  const spentTotal = report.rows.reduce((s, r) => s + r.avgSpentSatang * r.buyers, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="ช่องทางที่มาของสมาชิก"
        back={{ href: `/app/sys/${id}`, label: sys.name }}
        desc="สมาชิกใหม่มาจากช่องทางไหน ช่องทางไหนคุ้มค่าที่สุด และลิงก์/QR ที่แปะไว้ตามที่ต่าง ๆ ได้ผลแค่ไหน"
      />
      <MemberTabs systemId={id} actor={actor} />
      <MemberSettingsTabs systemId={id} actor={actor} />
      <SourcesSettings
        systemId={id}
        periodDays={periodDays}
        rows={report.rows}
        links={links}
        qr={qr}
        units={units}
        kpi={{
          newMembers: report.total,
          topLabel: top ? memberSourceLabel(top.source) : "—",
          topPct: top && report.total ? `${Math.round((top.signups / report.total) * 100)}%` : "—",
          costPerSignupSatang: costSignups ? Math.round(costTotal / costSignups) : 0,
          avgSpentSatang: buyers ? Math.round(spentTotal / buyers) : 0,
        }}
      />
    </div>
  );
}
