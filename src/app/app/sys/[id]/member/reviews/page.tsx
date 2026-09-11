import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canManageSettings, canReadMember, hasMemberPerm, toMemberActor } from "@/lib/modules/member/access";
import { getReviewSettings, listReviews, reviewFilterOptions, reviewStats, summarize } from "@/lib/modules/member/reviews";
import type { ReviewFilters, ReviewSummary } from "@/lib/modules/member/reviews-shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { MemberIcon } from "@/components/member/MemberIcon";
import { ReviewsInbox } from "@/components/member/ReviewsInbox";

// หน้า "ระบบสมาชิก › รีวิวลูกค้า" (M3.4 · ภาพ ledger/design-member/23-review-inbox.png)
// `/app/sys/{id}/member/reviews?rating=&service=&staff=&unit=&unreplied=1&hidden=1&take=`
//
// 🔴 ระบบต้องเป็น MEMBER ของร้านนี้จริง + อ่านโมดูลสมาชิกได้ (read-โดยนัย) → ไม่งั้น notFound() (404-not-403 §6.4)
// 🔴 STAFF เห็นเฉพาะรีวิวของสาขาตน/ไม่ระบุสาขา (unit scope อยู่ใน reviews.ts) · ปุ่มตอบ = member.review.reply ·
//    ตั้งค่า = member.settings.manage (MANAGER ไม่ได้โดยปริยาย §6.1) — คนอื่นเห็นตั้งค่าแบบอ่านอย่างเดียว
// 🔴 AI สรุปเดือนนี้: แคชรายวันต่อร้าน (เปิดหน้าซ้ำวันเดียวกัน = ไม่เรียก AI) · AI ล้ม = สรุปจากข้อมูลตรง ๆ
export default async function MemberReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };

  const one = (k: string): string | undefined => {
    const v = q[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : undefined;
  };
  const ratingRaw = Number(one("rating") ?? "");
  const filters: ReviewFilters = {
    ...(Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? { rating: ratingRaw } : {}),
    ...(one("service") ? { serviceId: one("service") } : {}),
    ...(one("staff") ? { staffEmployeeId: one("staff") } : {}),
    ...(one("unit") ? { unitId: one("unit") } : {}),
    ...(one("unreplied") === "1" ? { unreplied: true } : {}),
    ...(one("hidden") === "1" ? { includeHidden: true } : {}),
  };
  const takeRaw = Number(one("take") ?? "");
  const take = Number.isInteger(takeRaw) && takeRaw >= 20 && takeRaw <= 100 ? takeRaw : 20;

  const [stats, list, options, settings, summary] = await Promise.all([
    reviewStats(ctx, actor, { days: 30 }),
    listReviews(ctx, actor, { ...filters, take }),
    reviewFilterOptions(ctx, actor),
    getReviewSettings(ctx),
    summarize(ctx, actor, {}).catch((): ReviewSummary | null => null),
  ]);

  const basePath = `/app/sys/${id}/member/reviews`;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="รีวิวลูกค้า"
        back={{ href: `/app/sys/${id}/member/campaigns`, label: "แคมเปญ" }}
        desc="ขอรีวิวหลังบริการทาง LINE · คะแนนต่ำเปิดการ์ดในบอร์ดงานให้ผู้จัดการ · ตอบกลับได้ในหน้าเดียว"
        actions={
          <a href="#reviews-settings" className="btn btn-ghost text-sm">
            <MemberIcon name="gear" size="sm" /> ตั้งค่า
          </a>
        }
      />
      <MemberTabs systemId={id} actor={actor} />
      <ReviewsInbox
        systemId={id}
        basePath={basePath}
        stats={stats}
        items={list.items}
        hasMore={!!list.nextCursor && take < 100}
        take={take}
        filters={filters}
        options={options}
        settings={settings}
        summary={summary}
        canReply={hasMemberPerm(actor, "member.review.reply")}
        canSettings={canManageSettings(actor)}
      />
    </div>
  );
}
