import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, hasMemberPerm, toMemberActor } from "@/lib/modules/member/access";
import { resolvePosForMember } from "@/lib/modules/member";
import { getSettings, list } from "@/lib/modules/giftcard/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { GiftCardsBoard } from "@/components/member/GiftCardsBoard";

// หน้า "โปรโมชัน › Gift Card" (M2.6 · ภาพ ledger/design-member/20-giftcard.png)
//
// 🔴 404-not-403 (§6.4): ระบบไม่ใช่ MEMBER ของร้านนี้ / อ่านโมดูลสมาชิกไม่ได้ → notFound()
// 🔴 ปุ่ม "ขาย Gift Card" โผล่เฉพาะคนที่มีคีย์ `member.giftcard.sell` — พนักงานคนอื่นยังเปิดดูรายการได้
//    (read-โดยนัย: ต้องรู้ว่าบัตรใบนี้เหลือเท่าไหร่เวลาลูกค้าถาม)
// 🔴 ตัวเลขทุกก้อนมาจาก `giftcard/service.list()` — หน้าไม่คิดเลขเอง

export default async function GiftCardsPage({
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
  const status = (["ACTIVE", "DEPLETED", "EXPIRED", "SUSPENDED"] as const).find((s) => s === statusRaw) ?? null;
  const q = one(rawQuery.q);

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const [settings, data, units, target] = await Promise.all([
    getSettings(ctx),
    list(ctx, { status, q, take: 100 }),
    prisma.businessUnit.findMany({ where: { tenantId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    resolvePosForMember({ tenantId, systemId: id }),
  ]);

  // รายชื่อสมาชิกสำหรับช่อง "ผู้ซื้อ/ผู้รับ" (ค้นในหน้าจอ) — ชื่อ+รหัสเท่านั้น ไม่ส่งข้อมูลติดต่อลง client
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

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Gift Card"
        back={{ href: `/app/sys/${id}/member/promotions`, label: "โปรโมชัน" }}
        desc="บัตรกำนัลคือเงินที่ลูกค้าจ่ายล่วงหน้า — ยอดที่ยังไม่ถูกใช้ถือเป็นหนี้สินของร้าน"
      />
      <MemberTabs systemId={id} actor={actor} />
      <GiftCardsBoard
        systemId={id}
        settings={settings}
        rows={data.rows}
        kpi={data.kpi}
        units={units}
        members={members}
        defaultUnitId={target?.unitId ?? units[0]?.id ?? ""}
        canSell={hasMemberPerm(actor, "member.giftcard.sell")}
        canManage={hasMemberPerm(actor, "member.giftcard.manage")}
        filter={{ status, q }}
      />
    </div>
  );
}
