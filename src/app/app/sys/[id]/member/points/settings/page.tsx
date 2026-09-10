import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canManageSettings, toMemberActor } from "@/lib/modules/member/access";
import { getPointExtras, getPointSettings, listRules, previewPointImpact, resolvePointSystemIds } from "@/lib/modules/point";
import { listTierDefs } from "@/lib/modules/member";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberSettingsTabs } from "@/components/member/MemberSettingsTabs";
import { PointSettingsForm } from "@/components/member/PointSettingsForm";

// หน้า "ตั้งค่าแต้ม" (M2.2 · ภาพ ledger/design-member/16-point-settings.png)
//
// 🔴 ต้องมีคีย์ `member.settings.manage` เจาะจง — MANAGER ไม่ได้โดยปริยาย (§6.1) → ไม่มีสิทธิ์ = notFound()
//    (404-not-403 §6.4 — เหมือนหน้าตั้งค่าอื่นของโมดูลนี้)
// 🔴 ตีกลับรอบ 1 (Fable): ตาราง "กฎเพิ่ม" ต้องมี picker จริง (ชื่อ ไม่ใช่ id ดิบ) — สินค้า/หมวดต้องอ่านจาก
//    แคตตาล็อกคลัง (InvCategory/InvItem) จริง แต่โมดูล `point` ห้าม import `inventory` (ไม่มีเส้นนี้ใน
//    ALLOWED_EDGES ของ fitness F2 และห้ามแก้ fitness.mts) ⇒ **query ตรงจากหน้านี้** (page ไม่ถูก F2 สแกน —
//    ขอบเขตของ F2 คือ `src/lib/modules/**` เท่านั้น) เหมือนที่หน้าอื่น query `businessUnit`/`customer` ตรงอยู่แล้ว

export default async function PointsSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canManageSettings(actor)) notFound();

  const pointSystemIds = await resolvePointSystemIds(tenantId, id);
  const pointSystemId = pointSystemIds[0];

  const [settings, extras, tierDefs] = await Promise.all([
    getPointSettings(tenantId),
    getPointExtras({ tenantId, systemId: id }),
    listTierDefs({ tenantId, systemId: id, actorUserId: auth.user.id }),
  ]);

  const pointCtx = { tenantId, systemId: pointSystemId ?? "", memberSystemId: id, actorUserId: auth.user.id };
  const [rules, impact] = pointSystemId
    ? await Promise.all([listRules(pointCtx), previewPointImpact(pointCtx)])
    : [[], { monthlyEarn: 0, monthlyCostSatang: 0, liabilitySatang: 0, expiringIn90d: 0 }];

  // แคตตาล็อกสินค้า/หมวด — resolve ระบบ INVENTORY ที่ผูก unit เดียวกับระบบสมาชิกนี้ (แบบเดียวกับ resolvePointSystemIds)
  const memberUnits = await prisma.appSystemUnit.findMany({ where: { tenantId, systemId: id }, select: { unitId: true } });
  const invLinks = memberUnits.length
    ? await prisma.appSystemUnit.findMany({
        where: { tenantId, type: "INVENTORY", unitId: { in: memberUnits.map((u) => u.unitId) } },
        select: { systemId: true },
      })
    : [];
  const invSystemIds = [...new Set(invLinks.map((l) => l.systemId))];
  const [categories, items] = invSystemIds.length
    ? await Promise.all([
        prisma.invCategory.findMany({ where: { tenantId, systemId: { in: invSystemIds } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        prisma.invItem.findMany({ where: { tenantId, systemId: { in: invSystemIds } }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true } }),
      ])
    : [[], []];

  const tiers = tierDefs.map((t) => ({ id: t.id, name: t.name }));
  const tierChips = tierDefs
    .filter((t) => t.benefits.some((b) => b.type === "NO_POINT_EXPIRY" && b.active))
    .map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="ตั้งค่าแต้ม" back={{ href: `/app/sys/${id}/member/points`, label: "แต้ม" }} desc="กฎการได้แต้ม หมดอายุ การใช้แต้ม โอนแต้ม และเพดานปรับด้วยมือ" />
      <MemberSettingsTabs systemId={id} actor={actor} />
      {pointSystemId ? (
        <PointSettingsForm
          systemId={id}
          settings={settings}
          extras={extras}
          rules={rules.map((r) => ({ id: r.id, kind: r.kind, config: r.config, priority: r.priority, active: r.active }))}
          tiers={tiers}
          tierChips={tierChips}
          categories={categories}
          items={items}
          impact={impact}
        />
      ) : (
        <p className="text-sm text-[color:var(--color-muted)]">ยังไม่ได้เชื่อมระบบแต้มกับสาขาของระบบสมาชิกนี้ — ไปตั้งค่าที่ทะเบียนระบบก่อน</p>
      )}
    </div>
  );
}
