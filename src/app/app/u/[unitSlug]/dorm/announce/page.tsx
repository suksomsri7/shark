import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { dormAnnounceModel } from "@/lib/modules/dorm";
import DormAnnounce from "@/components/dorm/DormAnnounce";
import { createAnnouncementAction, publishAnnouncementAction, resendAnnouncementAction } from "./actions";

// SVC D.17 ▸ จอ "ประกาศถึงผู้เช่า" (แบบ §6 A10 — ไม่มีภาพแบบ · สัญญา DOM ใบสั่ง §4.1) · ข้อมูลผ่าน facade `@/lib/modules/dorm` เท่านั้น
//   ด่าน: requireUnit · หน่วย "DORM" · dormAnnounceModel (Membership สด → dorm.announce → ขอบเขตอาคาร) ⇒ null = 404
//   ไม่มีแท็บในเมนูหอ (มติ R4 — แท็บทำตอน D.15) · เข้าจาก URL ตรง/ลิงก์
export default async function DormAnnouncePage({ params }: { params: Promise<{ unitSlug: string }> }) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") notFound();
  const model = await dormAnnounceModel({ tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, { unitId: unit.id });
  if (!model) notFound();
  return (
    <DormAnnounce
      model={model}
      createAction={createAnnouncementAction.bind(null, unitSlug)}
      publishAction={publishAnnouncementAction.bind(null, unitSlug)}
      resendAction={resendAnnouncementAction.bind(null, unitSlug)}
    />
  );
}
