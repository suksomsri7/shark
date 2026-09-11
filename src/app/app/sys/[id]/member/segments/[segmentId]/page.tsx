import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, toMemberActor } from "@/lib/modules/member/access";
import { canManageSegments, countSegment, getSegment, listSegmentFields, type SegmentDefinition, type SegmentScope } from "@/lib/modules/member/segments";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { SegmentBuilder } from "@/components/member/SegmentBuilder";

// หน้า "ระบบสมาชิก › กลุ่มลูกค้า › ตัวสร้างเงื่อนไข" (M3.1 · ภาพ 21 ขั้น 1)
// `/app/sys/{id}/member/segments/{segmentId}` — `new` = กลุ่มใหม่ที่ยังไม่บันทึก
//
// 🔴 นับครั้งแรกทำที่ฝั่งเซิร์ฟเวอร์: เปิดหน้ามาต้องเห็นตัวเลขจริงทันที ไม่ใช่ค่าว่างที่รอ JS ยิงกลับมา
// 🔴 คนที่ไม่มีสิทธิ์จัดการโปรโมชันยังเปิดดูได้ (อ่านอย่างเดียว) — ตัวสร้างจะปิดปุ่ม/ช่องแก้ให้เอง
export default async function MemberSegmentBuilderPage({ params }: { params: Promise<{ id: string; segmentId: string }> }) {
  const { id, segmentId } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();
  const canManage = canManageSegments(actor);

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const isNew = segmentId === "new";
  const segment = isNew ? null : await getSegment(ctx, actor, segmentId).catch(() => null);
  if (!isNew && !segment) notFound();

  const definition: SegmentDefinition = segment?.definition ?? { groups: [] };
  const [fields, counted] = await Promise.all([listSegmentFields(ctx), countSegment(ctx, actor, definition)]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={segment ? segment.name : "สร้างกลุ่มลูกค้าใหม่"}
        back={{ href: `/app/sys/${id}/member/segments`, label: "กลุ่มลูกค้า" }}
        desc={segment ? segment.summary : "เลือกเงื่อนไขทีละบรรทัด ระบบจะนับจำนวนคนให้ทันทีทุกครั้งที่แก้"}
      />
      <MemberTabs systemId={id} actor={actor} />

      <SegmentBuilder
        systemId={id}
        segmentId={segment?.id ?? null}
        initialName={segment?.name ?? ""}
        initialScope={(segment?.scope ?? "TEAM") as SegmentScope}
        initialGroups={definition.groups}
        fields={fields}
        canManage={canManage}
        initialCount={{
          count: counted.count,
          avgSpend12mSatang: counted.avgSpend12mSatang,
          sampleNames: counted.sample.map((s) => s.name),
        }}
      />
    </div>
  );
}
