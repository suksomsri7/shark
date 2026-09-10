import { notFound } from "next/navigation";
import type { VoucherOrigin, VoucherStatus } from "@prisma/client";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, hasMemberPerm, toMemberActor } from "@/lib/modules/member/access";
import { MEMBER_LIMITS } from "@/lib/modules/member/limits";
import { listTemplates, listVouchers } from "@/lib/modules/voucher/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { VouchersBoard } from "@/components/member/VouchersBoard";

// หน้า "โปรโมชัน › Voucher" (M2.5 · ภาพ ledger/design-member/19-voucher-issue.png)
//
// 🔴 404-not-403 (§6.4): ระบบไม่ใช่ MEMBER ของร้านนี้ / อ่านโมดูลสมาชิกไม่ได้ → notFound()
// 🔴 ปุ่ม "ออก voucher" โผล่เฉพาะคนที่มีคีย์ `member.promo.issue` — พนักงานคนอื่นยังเปิดดูรายการได้
//    (read-โดยนัย: ต้องตอบลูกค้าได้ว่าใบที่ถืออยู่ยังใช้ได้ไหม)
// 🔴 ตัวเลขทุกก้อนมาจาก `voucher/service.listVouchers()` — หน้าไม่คิดเลขเอง

export default async function VouchersPage({
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

  const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
  const statusRaw = one(rawQuery.status).toUpperCase();
  const status = (["ACTIVE", "USED", "EXPIRED", "CANCELLED"] as const).find((s) => s === statusRaw) ?? null;
  const originRaw = one(rawQuery.origin).toUpperCase();
  const q = one(rawQuery.q);

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const [data, templates, categories, services] = await Promise.all([
    listVouchers(ctx, {
      status: status as VoucherStatus | null,
      origin: (originRaw || null) as VoucherOrigin | null,
      q,
      take: 100,
    }),
    listTemplates(ctx),
    prisma.invCategory.findMany({ where: { tenantId }, orderBy: { sortOrder: "asc" }, take: 12, select: { id: true, name: true } }),
    prisma.bookingService.findMany({ where: { tenantId, active: true }, orderBy: { name: "asc" }, take: 12, select: { id: true, name: true } }),
  ]);

  // รายชื่อสมาชิกสำหรับช่อง "ให้ใคร" (ค้นในหน้าจอ) — ชื่อ+รหัสเท่านั้น ไม่ส่งข้อมูลติดต่อลง client
  const memberRows = await prisma.customer.findMany({
    where: { tenantId, memberSystemId: id, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { id: true, name: true, firstName: true, lastName: true, memberCode: true },
  });
  const members = memberRows.map((m) => ({
    id: m.id,
    name: m.name ?? ([m.firstName, m.lastName].filter(Boolean).join(" ") || m.memberCode || ""),
    memberCode: m.memberCode ?? "",
  }));

  const owner = await prisma.membership.findFirst({
    where: { tenantId, role: "OWNER" },
    select: { user: { select: { name: true, email: true } } },
  });
  const approverLabel = `${owner?.user?.name ?? owner?.user?.email ?? "เจ้าของร้าน"} (เจ้าของร้าน)`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Voucher"
        back={{ href: `/app/sys/${id}/member/promotions`, label: "โปรโมชัน" }}
        desc="ส่วนลดรายใบที่ออกให้ลูกค้าเป็นรายคน — ใช้ได้ครั้งเดียว และคืนใบให้ได้เมื่อบิลถูกยกเลิก"
      />
      <MemberTabs systemId={id} actor={actor} />
      <VouchersBoard
        systemId={id}
        rows={data.rows.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          customerName: r.customerName,
          kind: r.kind,
          value: r.value,
          origin: r.origin,
          status: r.status,
          expiresAt: r.expiresAt.toISOString(),
          usedAt: r.usedAt ? r.usedAt.toISOString() : null,
        }))}
        kpi={data.kpi}
        members={members}
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          kind: t.kind,
          value: t.value,
          validDays: t.validDays,
          minSatang: t.config.minSatang ?? null,
          maxDiscountSatang: t.config.maxDiscountSatang ?? null,
          stackWithCoupon: t.config.stackWithCoupon === true,
        }))}
        targets={[
          ...categories.map((c) => ({ id: c.id, name: c.name, kind: "CATEGORY" as const })),
          ...services.map((s) => ({ id: s.id, name: s.name, kind: "SERVICE" as const })),
        ]}
        approverLabel={approverLabel}
        approvalOverSatang={MEMBER_LIMITS.voucherIssueApprovalOverSatang}
        canIssue={hasMemberPerm(actor, "member.promo.issue")}
        filter={{ status, q }}
      />
    </div>
  );
}
