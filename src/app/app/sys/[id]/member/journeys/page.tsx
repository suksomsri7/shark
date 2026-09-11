import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, toMemberActor } from "@/lib/modules/member/access";
import { canManageJourneys, journeyBuilderOptions, listJourneys } from "@/lib/modules/member/journeys";
import { JOURNEY_PRESETS, presetToDraft, type JourneyBuilderInitial } from "@/lib/modules/member/journey-presets";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { MemberIcon } from "@/components/member/MemberIcon";
import { JourneyBuilder } from "@/components/member/JourneyBuilder";
import { JourneysTable, type JourneyRowView } from "@/components/member/JourneysTable";

// หน้า "ระบบสมาชิก › Journey อัตโนมัติ" (M3.3 · ภาพ ledger/design-member/07-promotion-journey.png ครึ่งบน)
// `/app/sys/{id}/member/journeys` — ตัวสร้างประโยค (ตัวอย่าง "วันเกิดสมาชิก" ตามภาพ) + ตาราง Journey ที่เปิดใช้อยู่
//
// 🔴 ระบบต้องเป็น MEMBER ของร้านนี้จริง + อ่านโมดูลสมาชิกได้ → ไม่งั้น notFound() (404-not-403 §6.4)
// 🔴 ตัวสร้าง/ปุ่มสร้างเห็นเฉพาะคนที่มี `member.promo.manage` — พนักงานที่อ่านได้เห็นตารางอย่างเดียว
export default async function MemberJourneysPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();
  const canManage = canManageJourneys(actor);
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };

  const [list, options] = await Promise.all([listJourneys(ctx, actor), canManage ? journeyBuilderOptions(ctx, actor) : Promise.resolve(null)]);

  const money = (satang: number): string => `฿${Math.round(satang / 100).toLocaleString("th-TH")}`;
  const rows: JourneyRowView[] = list.map((j) => ({
    id: j.id,
    name: j.name,
    summary: j.summary,
    enabled: j.enabled,
    sent: j.stats30d.entered,
    used: j.stats30d.used,
    usedPctLabel: j.stats30d.entered > 0 ? `(${Math.round((j.stats30d.used / j.stats30d.entered) * 100)}%)` : "",
    saleLabel: j.stats30d.saleSatang > 0 ? money(j.stats30d.saleSatang) : "—",
    costLabel: j.stats30d.entered > 0 ? money(j.stats30d.costSatang) : "—",
    roiLabel: j.stats30d.costSatang > 0 && j.stats30d.saleSatang > 0 ? `${j.stats30d.roi.toFixed(1)}×` : "—",
  }));

  // ตัวอย่างในตัวสร้าง = journey วันเกิดตามภาพ 07 (7 วันก่อนวันเกิด · ระดับ ≥ Silver · ยินยอม LINE · voucher + LINE + แต้ม)
  let initial: JourneyBuilderInitial | null = null;
  if (options) {
    const base = presetToDraft(JOURNEY_PRESETS[0]!, options.fields, options.templates);
    const tierOpts = options.fields.find((f) => f.key === "tier")?.options ?? [];
    const silverAt = tierOpts.findIndex((o) => o.value === "silver");
    const lineConsent = options.fields.find((f) => f.key === "consent.LINE");
    initial = {
      ...base,
      name: "วันเกิดสมาชิก — voucher + LINE + แต้ม",
      conditions: [
        ...(silverAt >= 0 ? [{ field: "tier", op: "in" as const, value: tierOpts.slice(silverAt).map((o) => o.value) }] : []),
        ...(lineConsent ? [{ field: "consent.LINE", op: "eq" as const, value: true }] : []),
      ],
    };
  }
  const holdout = JOURNEY_PRESETS[0]?.holdoutPct ?? 10;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="โปรโมชัน — Journey อัตโนมัติ"
        back={{ href: `/app/sys/${id}/member/promotions`, label: "โปรโมชัน" }}
        desc="ส่งของขวัญ/ข้อความให้ลูกค้าอัตโนมัติตามเหตุการณ์ แล้ววัดผลจริงเทียบกับกลุ่มที่ไม่ได้รับ"
        actions={
          <>
            <span className="rounded-lg border px-2.5 py-1 text-xs" style={{ borderColor: "var(--color-line)", color: "var(--color-muted)" }}>
              holdout กลุ่มเทียบ {holdout}%
            </span>
            {canManage && (
              <Link data-testid="journeys-add" href={`/app/sys/${id}/member/journeys/new`} className="btn btn-primary text-sm">
                <MemberIcon name="plus" size="sm" /> สร้าง Journey ใหม่
              </Link>
            )}
          </>
        }
      />
      <MemberTabs systemId={id} actor={actor} />

      <div data-testid="journeys-page" className="flex min-w-0 flex-col gap-4">
        {options && initial && (
          <JourneyBuilder
            systemId={id}
            journeyId={null}
            initial={initial}
            fields={options.fields}
            templates={options.templates}
            boards={options.boards}
            canManage={canManage}
          />
        )}
        <JourneysTable systemId={id} rows={rows} canManage={canManage} />
      </div>
    </div>
  );
}
