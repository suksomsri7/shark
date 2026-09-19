// CrmHomeView.tsx — หน้าตาหน้าแรก CRM ใหม่ (uiVersion 2 · ใบ C1.11 · ภาพ 13(ก)) — คอมโพเนนต์แสดงผลล้วน (server · ไม่มี hook)
// ข้อมูลทั้งหมดมาจาก `crm/home.tsx` (ผ่านการมองเห็นแล้ว) · server action ของตัวเลือกเทมเพลตส่งมาทาง props
// 🔴 ไม่ import โมดูล CRM (F2.3) · testid ของแต่ละส่วนอยู่บน element ของไฟล์นี้ (ชิ้น client รับข้อมูลทาง props)
// 🔴 390 px: ทุกบล็อกเต็มความกว้าง · ข้อความยาวตัดด้วย truncate · ไม่มีความกว้างตายตัว

import Link from "next/link";
import { ModuleTabs } from "@/components/module-tabs";
import { MyDealsList, type MyDealCard } from "./MyDealsList";
import { BusinessTemplatePicker, type TemplateOption } from "./BusinessTemplatePicker";

const muted = "text-[color:var(--color-muted)]";

export type CrmHomeTaskView = { id: string; title: string; dueLabel: string; overdue: boolean };

export function CrmHomeView({
  systemId,
  navItems,
  picker,
  deals,
  stages,
  tasks,
}: {
  systemId: string;
  navItems: { href: string; label: string }[];
  /** null = ไม่แสดงตัวเลือก (เลือกเทมเพลตแล้ว หรือผู้ดูตั้งค่า CRM ไม่ได้) */
  picker: {
    templates: TemplateOption[];
    apply: (systemId: string, key: string) => Promise<{ ok: true; notice?: string | null } | { ok: false; error: string }>;
    skip: (systemId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  } | null;
  deals: MyDealCard[];
  stages: { id: string; name: string }[];
  tasks: CrmHomeTaskView[];
}) {
  const base = `/app/sys/${systemId}`;
  return (
    <div className="flex min-w-0 flex-col gap-5" data-testid="crm-home">
      <ModuleTabs items={navItems} />

      {picker && (
        <section className="card flex min-w-0 flex-col gap-3 p-4" data-testid="crm-template-picker">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">เริ่มจากแบบที่ตรงกับกิจการของคุณ</h2>
            <p className={`text-xs ${muted}`}>
              เลือก 1 แบบ ระบบจะเพิ่มขั้นของดีล เหตุผลที่แพ้ ช่องข้อมูล และรายการเฉพาะกิจการให้ — ของเดิมไม่ถูกลบ ปรับแก้ต่อได้ทุกอย่างที่หน้าตั้งค่า
            </p>
          </div>
          <BusinessTemplatePicker systemId={systemId} templates={picker.templates} apply={picker.apply} skip={picker.skip} />
        </section>
      )}

      <section className="flex min-w-0 flex-col gap-3" data-testid="crm-home-my-deals">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">ดีลของฉัน</h2>
          <Link href={`${base}/crm/deals`} className="text-sm text-[color:var(--color-accent)]" data-testid="crm-home-all-deals">
            ดูทั้งหมด →
          </Link>
        </div>
        <MyDealsList systemId={systemId} deals={deals} stages={stages} />
      </section>

      <section className="flex min-w-0 flex-col gap-3" data-testid="crm-home-my-tasks">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">งานของฉันวันนี้</h2>
          <Link href={`${base}/crm/activities`} className="text-sm text-[color:var(--color-accent)]" data-testid="crm-home-all-tasks">
            งานทั้งหมด →
          </Link>
        </div>
        {tasks.length === 0 ? (
          <p className={`text-sm ${muted}`}>วันนี้ไม่มีงานค้าง</p>
        ) : (
          <ul className="card flex min-w-0 flex-col divide-y p-0">
            {tasks.map((t) => (
              <li key={t.id} className="flex min-w-0 items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 truncate text-sm">{t.title}</span>
                <span className={`shrink-0 text-xs ${t.overdue ? "text-[color:var(--color-danger)]" : muted}`}>{t.dueLabel}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
