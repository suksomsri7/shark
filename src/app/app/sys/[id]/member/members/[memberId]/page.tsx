import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { toMemberActor, canReadMember } from "@/lib/modules/member/access";
import { getMember360, getWallet, MemberNotFoundError } from "@/lib/modules/member";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { Member360View } from "@/components/member/Member360";
// M3.4 — แท็บรีวิว (ภาพ 08 ขวา)
import { reviewsForMember, shopSummaryFor360 } from "@/lib/modules/member/reviews";
import { MemberReviewsTab, ShopReviewSummary } from "@/components/member/ReviewMember360";
// M3.5 — แท็บแนะนำเพื่อน (ภาพ 08 ขวา: การ์ดโค้ด/ลิงก์/สถิติ/ต้นไม้)
import { referralsForMember } from "@/lib/modules/member/referrals";
import { ReferralMemberTab } from "@/components/member/ReferralMemberCard";
// M3.7 — แท็บประวัติ (ภาพ 08 ซ้าย/กลาง: ชิปกรอง 9 ชนิด + ช่วงเวลา + สาขา · ไทม์ไลน์ · โหลดเพิ่ม)
import { historyUnitOptions, listHistory, toHistoryPageView } from "@/lib/modules/member/history";
import { HISTORY_DEFAULT_RANGE, HISTORY_PAGE_SIZE, historyRangeFrom } from "@/lib/modules/member/history-kinds";
import { MemberHistory } from "@/components/member/MemberHistory";
// CRM C1.9 ▸ แท็บวัตถุกำหนดเองที่ผูกกับสมาชิก — จากระบบ CRM ที่เปิด CRM ใหม่ (uiVersion 2) เท่านั้น · ไม่มี = ไม่แสดงอะไรเลย ◂
import { CrmObjectTabPanel } from "@/components/crm/objects/ObjectTabs";
import { memberObjectTabs } from "@/components/crm/objects/server";

// สมาชิก 360° (M1.5 · ภาพ 02) — `/app/sys/{id}/member/members/{memberId}`
// URL state: `?tab=profile|wallet|history|reviews|referrals`
//
// 🔴 โฟลเดอร์ใช้ `[memberId]` ไม่ใช่ `[id]` ซ้ำกับพารามิเตอร์ของระบบ (`[id]` ชั้นนอก) — Next.js ห้าม
//    ใช้ชื่อ dynamic segment ซ้ำกันในเส้นทางเดียว (`validate-app-paths.js`: "You cannot have the same
//    slug name … repeat within a single dynamic path") ไม่งั้น `next build`/`next dev` พังทั้งแอป
//    ดู ledger/wo-notes/member-M1.5.md หัวข้อ "ข้อแย้ง" (S3.3 อ้างพาธ `[id]/[id]` ตรง ๆ)
// 🔴 getMember360 throw MemberNotFoundError เมื่อคนนี้ไม่มี/มองไม่เห็น (unit scope) → notFound() เสมอ (§6.4)
export default async function Member360Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; memberId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id, memberId }, rawQuery] = await Promise.all([params, searchParams]);
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };

  const member = await getMember360(ctx, actor, memberId).catch((e: unknown) => {
    if (e instanceof MemberNotFoundError) return null;
    throw e;
  });
  if (!member) notFound();

  const tabRaw = rawQuery.tab;
  const tab = typeof tabRaw === "string" ? tabRaw : "profile";
  const basePath = `/app/sys/${id}/member/members/${memberId}`;

  // กระเป๋าสิทธิ์ (M2.7) — โหลดเฉพาะตอนเปิดแท็บนี้ (แท็บอื่นไม่ต้องจ่ายค่า query ของทุกโมดูลสิทธิ์)
  const wallet =
    tab === "wallet"
      ? await getWallet(ctx, actor, memberId).catch((e: unknown) => {
          if (e instanceof MemberNotFoundError) return null;
          throw e;
        })
      : null;

  // M3.4 — แท็บรีวิว: รีวิวของคนนี้ (คอลัมน์หลัก) + กล่อง "รีวิวร้าน" บนสุดของแถบขวา (ภาพ 08 ขวา) · โหลดเฉพาะตอนเปิดแท็บ
  const reviewsHref = `/app/sys/${id}/member/reviews`;
  const reviews =
    tab === "reviews" ? await Promise.all([reviewsForMember(ctx, actor, memberId), shopSummaryFor360(ctx)]) : null;
  const reviewPanel = reviews ? <MemberReviewsTab rows={reviews[0]} reviewsHref={reviewsHref} /> : undefined;
  const reviewSide = reviews ? <ShopReviewSummary summary={reviews[1]} recent={reviews[1].recent} reviewsHref={reviewsHref} /> : undefined;

  // M3.5 — แท็บแนะนำเพื่อน · โหลดเฉพาะตอนเปิดแท็บ · ดูไม่ได้ (นอกสาขาหลัก) = กล่องแจ้งแทน ไม่ทำหน้าพัง
  const referralPanel =
    tab === "referrals" ? (
      <ReferralMemberTab
        data={await referralsForMember(ctx, actor, memberId).catch((e: unknown) => {
          if (e instanceof MemberNotFoundError) return null;
          throw e;
        })}
      />
    ) : undefined;

  // M3.7 — แท็บประวัติ: หน้าแรก (ช่วงปริยาย 90 วันตามภาพ 08) โหลดที่ server · กรอง/โหลดเพิ่มผ่าน server action
  //   มองไม่เห็นสมาชิกคนนี้ = getMember360 notFound() ไปแล้วข้างบน (ด่านเดียวกัน)
  const historyPanel =
    tab === "history" ? (
      <MemberHistory
        systemId={id}
        memberId={memberId}
        initialRange={HISTORY_DEFAULT_RANGE}
        initial={toHistoryPageView(await listHistory(ctx, actor, memberId, { from: historyRangeFrom(HISTORY_DEFAULT_RANGE), take: HISTORY_PAGE_SIZE }))}
        units={await historyUnitOptions(ctx, actor)}
      />
    ) : undefined;

  // CRM C1.9 ▸ แท็บวัตถุกำหนดเองที่ผูกกับสมาชิก (ภาพ 06 ขวา) — จากระบบ CRM uiVersion 2 เท่านั้น · ไม่มี = [] (หน้าเดิมทุกอย่าง)
  const objTabs = await memberObjectTabs(tenantId, actor, member.profile.id);
  const objName = (t: (typeof objTabs)[number]) => `${t.labelPlural || t.label}${t.shared ? ` · ${t.systemName}` : ""}`;
  const objActive = objTabs.find((t) => t.tabId === tab) ?? null;
  const objectPanel = objActive ? (
    <CrmObjectTabPanel ctx={{ tenantId, systemId: objActive.systemId, actorUserId: auth.user.id }} actor={actor} objectKey={objActive.objectKey} label={objName(objActive)} parentId={member.profile.id} />
  ) : undefined;
  const objectTabs = objTabs.length > 0 ? objTabs.map((t) => ({ key: t.tabId, label: `${objName(t)} (${t.count.toLocaleString("th-TH")})` })) : undefined;
  // ◂ CRM C1.9

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={member.profile.name || member.profile.memberCode} back={{ href: `/app/sys/${id}/member/members`, label: "สมาชิก" }} />
      <MemberTabs systemId={id} actor={actor} />
      <Member360View systemId={id} member={member} tab={tab} basePath={basePath} wallet={wallet} tabPanel={reviewPanel ?? referralPanel ?? historyPanel ?? objectPanel} sideTop={reviewSide} extraTabs={objectTabs} />
    </div>
  );
}
