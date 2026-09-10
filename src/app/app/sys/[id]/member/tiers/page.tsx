import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, hasMemberPerm, toMemberActor } from "@/lib/modules/member/access";
import { getTierRules, listTierDefs } from "@/lib/modules/member/tiers";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { TierLadder } from "@/components/member/TierLadder";
import { TierRuleBuilder } from "@/components/member/TierRuleBuilder";
import { TierDryRun } from "@/components/member/TierDryRun";
import { TierHistory, type TierHistoryRow } from "@/components/member/TierHistory";

// หน้า "ระบบสมาชิก › ระดับสมาชิก" (M1.10 · ภาพ ledger/design-member/04-tiers-rules.png)
// `/app/sys/{id}/member/tiers` — แทนที่หน้า v1 เดิมที่พาธเดียวกัน (nav.ts § LEGACY_V1_LINKS ยังชี้ URL นี้
// อยู่ด้วยป้าย "ระดับสมาชิก (เดิม)" — เป็นหนี้ป้ายที่ไม่ตรงแล้ว ปล่อยให้ใบทำความสะอาด nav.ts จัดการทีหลัง
// ตามที่คอมเมนต์ของ nav.ts เขียนไว้ว่า "M1.10 = ระดับ" คือใบที่ย้ายผู้ใช้มาหน้าใหม่)
//
// 🔴 ระบบต้องเป็น MEMBER ของร้านนี้จริง + อ่านโมดูลสมาชิกได้ (read-โดยนัย) → ไม่งั้น notFound() (404-not-403 §6.4)
// ?tier=<tierDefId> เลือกว่าจะดูกฎของระดับไหน — ไม่ส่ง/ไม่พบ = เลือกระดับรองสุดท้าย (ตัวอย่างมาตรฐาน "Gold")
export default async function MemberTiersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, rawQuery] = await Promise.all([params, searchParams]);
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();
  const canManage = hasMemberPerm(actor, "member.tier.manage");

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };

  const tiers = await listTierDefs(ctx);
  const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
  const requested = one(rawQuery.tier);
  const selected = tiers.find((t) => t.id === requested) ?? (tiers.length >= 3 ? tiers[tiers.length - 2] : tiers[0]) ?? null;
  const rules = selected ? await getTierRules(ctx, selected.id) : null;
  const selectedIdx = selected ? tiers.findIndex((t) => t.id === selected.id) : -1;
  const lowerTier = selected && selectedIdx > 0 ? tiers[selectedIdx - 1] : null;

  // ประวัติ 20 แถวล่าสุดของระบบนี้ — MemberTierHistory ไม่มีคอลัมน์ systemId (ตารางใหม่ไม่ผูก FK ข้ามโมดูล
  // ตามมติ M1.1) ต้องกรองผ่านชุด customerId ของระบบนี้ก่อน (หนี้ประสิทธิภาพบนร้านขนาดใหญ่ — ดู wo-notes)
  const memberIds = await prisma.customer.findMany({ where: { tenantId, memberSystemId: id }, select: { id: true } });
  const historyRaw = memberIds.length
    ? await prisma.memberTierHistory.findMany({
        where: { tenantId, customerId: { in: memberIds.map((m) => m.id) } },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    : [];
  const [historyCustomers, allTierDefs] = await Promise.all([
    historyRaw.length
      ? prisma.customer.findMany({ where: { id: { in: historyRaw.map((h) => h.customerId) } }, select: { id: true, name: true, memberCode: true } })
      : Promise.resolve([]),
    listTierDefs(ctx, { includeArchived: true }),
  ]);
  const customerNameOf = new Map(historyCustomers.map((c) => [c.id, c.name?.trim() || c.memberCode || "(ไม่มีชื่อ)"]));
  const tierRefOf = new Map(allTierDefs.map((t) => [t.id, { name: t.name, color: t.color }]));
  const historyRows: TierHistoryRow[] = historyRaw.map((h) => ({
    id: h.id,
    createdAt: h.createdAt.toISOString(),
    customerName: customerNameOf.get(h.customerId) ?? "(ไม่พบสมาชิก)",
    fromTier: h.fromTierDefId ? (tierRefOf.get(h.fromTierDefId) ?? null) : null,
    toTier: h.toTierDefId ? (tierRefOf.get(h.toTierDefId) ?? null) : null,
    reason: h.reason,
    evidence: h.evidence,
    notifiedAt: h.notifiedAt ? h.notifiedAt.toISOString() : null,
    pending: !!(h.evidence && typeof h.evidence === "object" && (h.evidence as Record<string, unknown>).pending === true),
  }));

  // "สมาชิกแบบเสียเงิน" — แพ็กเกจของระบบนี้ที่ผูกกับระดับใดระดับหนึ่ง (paidPlanId) + จำนวนคนที่ยัง ACTIVE
  const plans = await prisma.memberPlan.findMany({ where: { tenantId, systemId: id, active: true }, orderBy: { createdAt: "asc" } });
  const planCards = await Promise.all(
    plans.map(async (p) => {
      const tierOfPlan = allTierDefs.find((t) => t.paidPlanId === p.id) ?? null;
      const [active, autoRenew] = await Promise.all([
        prisma.memberSubscription.count({ where: { tenantId, systemId: id, planId: p.id, status: "ACTIVE" } }),
        prisma.memberSubscription.count({ where: { tenantId, systemId: id, planId: p.id, status: "ACTIVE", autoRenew: true } }),
      ]);
      return { id: p.id, name: p.name, priceSatang: p.priceSatang, periodDays: p.periodDays, tierName: tierOfPlan?.name ?? null, active, autoRenew };
    }),
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="ระดับสมาชิก" back={{ href: `/app/sys/${id}`, label: sys.name }} desc="บันไดระดับ สิทธิประโยชน์ และกฎเลื่อน/คงระดับอัตโนมัติ" />
      <MemberTabs systemId={id} actor={actor} />

      <div data-testid="tiers-page" className="flex flex-col gap-5">
        <TierLadder systemId={id} tiers={tiers} selectedTierId={selected?.id ?? null} canManage={canManage} />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]">
          {selected && rules ? (
            <div className="flex flex-col gap-3">
              <TierRuleBuilder systemId={id} tierDefId={selected.id} tierName={selected.name} lowerTierName={lowerTier?.name ?? null} rules={rules} canManage={canManage} />
              {canManage && <TierDryRun systemId={id} />}
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              ยังไม่มีระดับสมาชิกในระบบนี้ — เพิ่มระดับแรกก่อนตั้งกฎ
            </p>
          )}

          <div data-testid="tiers-paid-plan" className="flex flex-col gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--color-line)" }}>
            <h2 className="text-sm font-semibold">สมาชิกแบบเสียเงิน</h2>
            {planCards.length === 0 && (
              <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                ยังไม่มีแพ็กเกจสมาชิกแบบเสียเงินในระบบนี้
              </p>
            )}
            {planCards.map((p) => (
              <div key={p.id} className="flex flex-col gap-1 rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--color-line)" }}>
                <span className="text-sm font-semibold">{p.name}</span>
                <span style={{ color: "var(--color-muted)" }}>
                  ฿{Math.round(p.priceSatang / 100).toLocaleString("th-TH")} / {p.periodDays} วัน
                  {p.tierName ? ` · ได้ระดับ ${p.tierName} ทันที` : ""}
                </span>
                <div className="flex items-center justify-between pt-1">
                  <span>
                    สมาชิก <strong>{p.active}</strong> คน
                  </span>
                  <span style={{ color: "var(--color-muted)" }}>ต่ออายุอัตโนมัติ {p.autoRenew}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <TierHistory rows={historyRows} />
      </div>
    </div>
  );
}
