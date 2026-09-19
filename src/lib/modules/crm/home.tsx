// home.tsx — หน้าแรกของระบบ CRM เมื่อเปิด CRM ใหม่แล้ว (uiVersion 2) · ใบ C1.11 (RESOLUTIONS R-A "หน้าแรก v2 ขั้นต่ำ" · ภาพ 13(ก))
//
// ฝังใน `/app/sys/[id]` (หน้า "ระบบ" รวม) แทน CrmHub เมื่อ `settings.crm.uiVersion = 2` — uiVersion 1 ยังเป็น CrmHub เดิมทุกตัวอักษร
// ไฟล์นี้ = ตัวโหลดข้อมูล (ฝั่งโมดูล) · หน้าตาอยู่ที่ `src/components/crm/home/CrmHomeView.tsx` (แสดงผลล้วน · testid ครบ)
// เนื้อหา: เมนู CRM (แถบแท็บจากทะเบียน nav.ts) · ตัวเลือกเทมเพลตกิจการ (ครั้งแรก · เฉพาะคนที่ตั้งค่า CRM ได้) · "ดีลของฉัน" · "งานของฉันวันนี้"
// 🔴 หน้า GET ไม่เขียนอะไร (ไม่สร้าง pipeline ค่าเริ่มต้น — ต่างจาก CrmHub v1) · ทุกแถวผ่านการมองเห็น (brief.ts#homeFor)
import { requireTenant } from "@/lib/core/context";
import { toMemberActor } from "@/lib/modules/member";
import { CrmHomeView } from "@/components/crm/home/CrmHomeView";
import { prisma } from "./db";
import { crmCan } from "./access";
import { homeFor } from "./brief";
import { crmNavItems } from "./nav";
import { crmBusinessTemplateOf } from "./settings";
import { applyBusinessTemplateAction, skipBusinessTemplateAction } from "./templates-actions";

const dueLabel = (iso: string | null, overdue: boolean) => {
  if (!iso) return "";
  const t = new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
  return overdue ? `เลยกำหนด · ${t}` : t;
};

export async function CrmHomeV2({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  const sys = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "CRM" }, select: { id: true, settings: true } });
  if (!sys) return null;
  const data = await homeFor({ tenantId, systemId, actorUserId: auth.user.id }, actor);
  const canPick = !crmBusinessTemplateOf(sys.settings) && crmCan(actor, "crm.settings.manage");
  // N-9: ข้อมูลเทมเพลต 16 ชุดโหลดเฉพาะตอนต้องแสดงตัวเลือก (ข้อมูลล้วน — ไม่ลากตัว apply/บริการวัตถุ)
  const templates = canPick ? (await import("./templates/business")).BUSINESS_TEMPLATE_LIST.map((t) => ({ key: t.key, label: t.label, description: t.description })) : [];
  return (
    <CrmHomeView
      systemId={systemId}
      navItems={crmNavItems(systemId)}
      picker={canPick ? { templates, apply: applyBusinessTemplateAction, skip: skipBusinessTemplateAction } : null}
      deals={data.deals.map((d) => ({
        id: d.id,
        title: d.title,
        valueSatang: d.valueSatang,
        stageId: d.stageId,
        stageName: d.stageName,
        companyName: d.companyName,
        staleLabel: d.stalledDays !== null ? `นิ่ง ${d.stalledDays} วัน` : null,
      }))}
      stages={data.stages}
      tasks={data.tasks.map((t) => ({ id: t.id, title: t.title, dueLabel: dueLabel(t.dueAt, t.overdue), overdue: t.overdue }))}
    />
  );
}
