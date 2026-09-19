import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { parseCrmSettings } from "@/lib/modules/crm/settings";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// ตั้งค่า CRM — หน้ารวม (ใบ C1.10 · หนี้ C1.5 ตาม RESOLUTIONS R-A) — `/app/sys/{id}/crm/settings`
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ · ยังไม่เปิด CRM ใหม่ · ไม่มีคีย์ `crm.settings.manage` = notFound()
// 🔴 หน้า GET ไม่เขียนอะไร — แสดงค่าปัจจุบันของ settings.crm (ตัวอ่านมีชนิดของ `settings.ts`) + การ์ดไปหน้าตั้งค่าย่อย
//    การ์ดที่ผู้ใช้ไม่มีคีย์ของหน้านั้นไม่แสดง (หน้าปลายทางจะเป็น 404 — ไม่โชว์ลิงก์ตาย)

type Card = { key: string; href: string; title: string; desc: string; show: boolean };

export default async function CrmSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" }, select: { id: true, name: true, settings: true } });
  if (!sys) notFound();
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!crmCan(actor, "crm.settings.manage")) notFound();
  const st = parseCrmSettings(sys.settings);
  const base = `/app/sys/${id}/crm`;

  const cards: Card[] = [
    { key: "pipelines", href: `${base}/settings/pipelines`, title: "pipeline", desc: "เพิ่ม/แก้ pipeline ตั้ง pipeline หลัก และเก็บ pipeline ที่ไม่ใช้", show: true },
    { key: "stages", href: `${base}/settings/stages`, title: "ขั้นของดีล", desc: "ลำดับขั้น โอกาสปิด และเงื่อนไขก่อนเข้าขั้น", show: true },
    { key: "lost-reasons", href: `${base}/settings/lost-reasons`, title: "เหตุผลที่แพ้", desc: "รายการเหตุผลให้เลือกตอนปิดดีลเป็นแพ้", show: true },
    { key: "visibility", href: `${base}/settings/visibility`, title: "การมองเห็นข้อมูล", desc: "ใครเห็นผู้ติดต่อ บริษัท ดีล และกิจกรรมของใคร", show: crmCan(actor, "crm.visibility.manage") },
    { key: "teams", href: "/app/settings/teams", title: "ทีมขาย", desc: "สร้างทีม ตั้งหัวหน้าทีม และสมาชิกที่รับ lead", show: crmCan(actor, "crm.team.manage") },
    { key: "api", href: `${base}/settings/api`, title: "API และ webhook", desc: "คีย์สำหรับระบบภายนอกและผู้ช่วย AI · ปลายทาง webhook และประวัติการส่ง", show: crmCan(actor, "crm.api.manage") },
  ];
  const onOff = (v: boolean) => (v ? "เปิด" : "ปิด");

  return (
    <div className="flex w-full max-w-3xl min-w-0 flex-col gap-5" data-testid="crm-settings-page">
      <PageHeader title="ตั้งค่า CRM" back={{ href: `/app/sys/${id}`, label: sys.name }} desc="ค่าของระบบ CRM นี้ และทางไปหน้าตั้งค่าแต่ละเรื่อง" />
      <ModuleTabs items={crmNavItems(id)} />
      <section className="card flex flex-col gap-2 p-4">
        <h2 className="text-sm font-medium">ค่าปัจจุบัน</h2>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-[color:var(--color-muted)]">หน้าจอ CRM</dt>
            <dd>{st.uiVersion === 2 ? "CRM ใหม่ (รุ่น 2)" : "รุ่นเดิม"}</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--color-muted)]">เชื่อมกับระบบอื่นของร้าน</dt>
            <dd>{onOff(st.bridgesEnabled)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--color-muted)]">แชทจากลูกค้าใหม่เปิด lead</dt>
            <dd>{onOff(st.chatToLead)}</dd>
          </div>
        </dl>
        <p className="text-xs text-[color:var(--color-muted)]">เปลี่ยนค่าสองช่องหลังได้ผ่าน API (PUT /settings) ด้วยคีย์ชุดผู้ดูแล</p>
      </section>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards
          .filter((c) => c.show)
          .map((c) => (
            <Link key={c.key} href={c.href} className="card flex flex-col gap-1 p-4 hover:bg-[color:var(--color-surface)]" data-testid={`crm-settings-card-${c.key}`}>
              <span className="text-sm font-medium">{c.title}</span>
              <span className="text-xs text-[color:var(--color-muted)]">{c.desc}</span>
            </Link>
          ))}
      </section>
    </div>
  );
}
