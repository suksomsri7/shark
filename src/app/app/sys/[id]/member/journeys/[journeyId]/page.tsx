import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, toMemberActor } from "@/lib/modules/member/access";
import { canManageJourneys, journeyBuilderOptions, journeyDetail } from "@/lib/modules/member/journeys";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { JourneyBuilder } from "@/components/member/JourneyBuilder";
import { JourneyDetail, JourneyDetailActions, type JourneyRecentView, type JourneyStepCard } from "@/components/member/JourneyDetail";

// หน้า "ระบบสมาชิก › Journey อัตโนมัติ › รายละเอียด" (M3.3 · ภาพ ledger/design-member/22-journey-detail.png)
// `/app/sys/{id}/member/journeys/{journeyId}` — ขั้นตอน + จำนวนคนต่อขั้น · ผลลัพธ์ 30 วัน · กลุ่มเทียบ · รายวัน · เข้าล่าสุด
// `?edit=1` = เปิดตัวสร้างของ journey เส้นนี้ (ปุ่ม "แก้ไข" — เฉพาะคนที่มี member.promo.manage)
//
// 🔴 404-not-403 (§6.4): ระบบไม่ใช่ MEMBER ของร้านนี้ · อ่านโมดูลสมาชิกไม่ได้ · journey ไม่ใช่ของระบบนี้
export default async function MemberJourneyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; journeyId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id, journeyId } = await params;
  const sp = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();
  const canManage = canManageJourneys(actor);
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };

  const detail = await journeyDetail(ctx, actor, journeyId).catch(() => null);
  if (!detail) notFound();
  const { journey, stats } = detail;
  const back = { href: `/app/sys/${id}/member/journeys`, label: "Journey อัตโนมัติ" };

  if (sp.edit === "1" && canManage) {
    const options = await journeyBuilderOptions(ctx, actor);
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={`แก้ไข Journey: ${journey.name}`} back={back} desc="แก้แล้วมีผลกับคนที่เข้า journey หลังจากนี้ · ขั้นที่รออยู่ของคนเดิมทำตามแบบเดิมจนจบ" />
        <MemberTabs systemId={id} actor={actor} />
        <JourneyBuilder
          systemId={id}
          journeyId={journey.id}
          initial={{
            name: journey.name,
            trigger: journey.trigger,
            conditions: journey.conditions.groups.flatMap((g) => g.conditions),
            actions: journey.actions,
            holdoutPct: journey.holdoutPct,
            reentryDays: journey.reentryDays,
            enabled: journey.enabled,
          }}
          fields={options.fields}
          templates={options.templates}
          boards={options.boards}
          canManage
          cancelHref={`/app/sys/${id}/member/journeys/${journey.id}`}
        />
      </div>
    );
  }

  const money = (satang: number): string => `฿${Math.round(satang / 100).toLocaleString("th-TH")}`;
  const day = (d: Date): string => d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
  const ago = (d: Date): string => {
    const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    return days <= 0 ? "วันนี้" : days === 1 ? "เมื่อวาน" : `${days} วัน`;
  };
  const r = stats.results;

  const steps: JourneyStepCard[] = detail.steps.map((s) => ({
    key: `${s.kind}-${s.index}`,
    kind: s.kind,
    tag: s.tag,
    title: s.title,
    note: s.note,
    count: s.count,
    countLabel: s.countLabel,
  }));
  const recent: JourneyRecentView[] = stats.recent.map((x, i) => ({
    key: `${x.customerId}-${i}`,
    name: x.name,
    enteredLabel: ago(new Date(x.enteredAt)),
    stepLabel: x.stepLabel,
    usedLabel: x.status === "กลุ่มเทียบ" ? "กลุ่มเทียบ" : x.used ? "ใช้แล้ว" : "รอ",
    usedTone: x.status === "กลุ่มเทียบ" ? "hold" : x.used ? "used" : "wait",
  }));
  const daily = stats.daily.map((d) => ({ date: d.date, used: d.used, label: `${d.date}: ใช้สิทธิ์ ${d.used} คน` }));
  const uplift = stats.uplift;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`Journey: ${journey.name}`}
        back={back}
        desc={
          <span className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border px-2 py-0.5 text-xs" style={{ borderColor: "var(--color-line)" }}>
              {journey.enabled ? "เปิดใช้งาน" : "หยุดชั่วคราว"}
            </span>
            <span>
              สร้าง {day(journey.createdAt)} · แก้ไขล่าสุด {day(journey.updatedAt)}
            </span>
          </span>
        }
        actions={<JourneyDetailActions systemId={id} journeyId={journey.id} enabled={journey.enabled} canManage={canManage} />}
      />
      <MemberTabs systemId={id} actor={actor} />
      <JourneyDetail
        systemId={id}
        journeyId={journey.id}
        enteredLabel={`${stats.entered.toLocaleString("th-TH")} คนเข้าเงื่อนไขใน 30 วันที่ผ่านมา`}
        steps={steps}
        results={{
          sent: r.sent.toLocaleString("th-TH"),
          used: `${r.used.toLocaleString("th-TH")} (${Math.round(r.usedPct)}%)`,
          sale: r.saleSatang > 0 ? money(r.saleSatang) : "—",
          cost: money(r.costSatang),
          roi: r.costSatang > 0 && r.saleSatang > 0 ? `${r.roi.toFixed(1)}×` : "—",
        }}
        holdoutPct={journey.holdoutPct}
        holdoutConvertedLabel={`${Math.round(stats.holdout.convertedPct)}%`}
        upliftLabel={`${uplift >= 0 ? "+" : ""}${Math.round(uplift)} จุด`}
        holdoutEntered={stats.holdout.entered}
        daily={daily}
        recent={recent}
      />
    </div>
  );
}
