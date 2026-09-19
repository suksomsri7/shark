import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { parseCrmSettings } from "@/lib/modules/crm/settings";
// CRM C1.11 ▸ หน้านี้เป็น "หน้าสลับรุ่นหน้าจอ" ด้วย (มติ C23) — เปิดได้ทั้งตอนเป็นหน้าจอเดิมและ CRM ใหม่ (แยกทางในหน้าเอง)
//   ตอนเป็น 1: เจ้าของร้านของร้านที่เปิดให้เห็นสวิตช์เท่านั้น (อื่น ๆ = 404) · ตอนเป็น 2: หน้ารวมตั้งค่าเดิม + สวิตช์กลับ (เจ้าของร้านเสมอ · N-2)
import { isCrmV2SwitchAllowed } from "@/lib/modules/crm/ui-version";
import { setCrmUiVersionAction } from "@/lib/modules/crm/switch-actions";
import { UiVersionToggle } from "@/components/crm/settings/UiVersionToggle";
// ◂ CRM C1.11
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
  const actor = toMemberActor(auth.user.id, auth.active);
  const st = parseCrmSettings(sys.settings);
  // CRM C1.11 ▸ สวิตช์: เจ้าของร้าน + ร้านที่เปิดให้เห็นสวิตช์ (env) · uiVersion 1 = หน้าสวิตช์อย่างเดียว (คนอื่น 404 — หน้า v2 ยังไม่มีสำหรับร้านนี้)
  const canSwitch = auth.active.role === "OWNER" && (st.uiVersion === 2 || isCrmV2SwitchAllowed(tenantId));
  const switchCard = canSwitch ? (
    <section className="card flex min-w-0 flex-col gap-3 p-4" data-testid="crm-uiversion">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">หน้าจอ CRM</h2>
        <p className="text-sm">
          ตอนนี้ร้านใช้: <strong>{st.uiVersion === 2 ? "CRM ใหม่" : "หน้าจอ CRM เดิม"}</strong>
        </p>
        <p className="text-xs text-[color:var(--color-muted)]">
          CRM ใหม่เพิ่มรายชื่อบริษัท กระดานดีลตามขั้น ปฏิทินกิจกรรม การมองเห็นข้อมูลตามทีม วัตถุกำหนดเอง และ API — ใช้ข้อมูลผู้ติดต่อ ดีล และงานติดตามชุดเดิมทั้งหมด
          ไม่มีอะไรถูกลบหรือย้าย · สลับกลับไปใช้หน้าจอเดิมได้ทุกเมื่อ ข้อมูลที่เพิ่มใน CRM ใหม่ยังอยู่ครบและกลับมาใช้ต่อได้เมื่อเปิดอีกครั้ง
        </p>
      </div>
      <div data-testid="crm-uiversion-toggle">
        <UiVersionToggle systemId={id} current={st.uiVersion} action={setCrmUiVersionAction} />
      </div>
    </section>
  ) : null;
  if (st.uiVersion !== 2) {
    if (!switchCard) notFound();
    return (
      <div className="flex w-full max-w-3xl min-w-0 flex-col gap-5" data-testid="crm-settings-page">
        <PageHeader title="ตั้งค่า CRM" back={{ href: `/app/sys/${id}`, label: sys.name }} desc="เลือกหน้าจอ CRM ของร้าน" />
        {switchCard}
      </div>
    );
  }
  if (!crmCan(actor, "crm.settings.manage")) notFound();
  // ◂ CRM C1.11
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
      {/* CRM C1.11 ▸ สวิตช์ (เจ้าของร้าน) ◂ */}
      {switchCard}
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
