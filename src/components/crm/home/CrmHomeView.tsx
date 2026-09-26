// CrmHomeView.tsx — หน้าตาหน้าแรก CRM ใหม่ (uiVersion 2 · ใบ C1.11 · ภาพ 13(ก)) — คอมโพเนนต์แสดงผลล้วน (server · ไม่มี hook)
// ข้อมูลทั้งหมดมาจาก `crm/home.tsx` (ผ่านการมองเห็นแล้ว) · server action ของตัวเลือกเทมเพลตส่งมาทาง props
// 🔴 ไม่ import โมดูล CRM (F2.3) · testid ของแต่ละส่วนอยู่บน element ของไฟล์นี้ (ชิ้น client รับข้อมูลทาง props)
// 🔴 390 px: ทุกบล็อกเต็มความกว้าง · ข้อความยาวตัดด้วย truncate · ไม่มีความกว้างตายตัว

import type { ReactNode } from "react";
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
  stale,
  actions,
  kpis,
  filters,
  leaderboard,
  unowned,
  aside,
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
  /**
   * CRM C2.10 ▸ ช่องของการ์ด "ดีลที่ต้องดู" (ภาพ 01) — วาดมาจาก `crm/home.tsx` เพราะ `data-testid` ของบล็อกนี้
   *   ต้องเป็นสตริงตรง ๆ ในไฟล์เดียวกับตัวโหลดข้อมูล (ทะเบียนปุ่ม + ด่าน F14 อ่านจากโค้ด ไม่ใช่จาก props)
   *   `null` = ไม่แสดงการ์ด (หน้าที่ไม่ได้ส่งมา เช่นหน้าอื่นที่ยืม view นี้)
   *   ของในการ์ด (รอบแก้ ข้อ 9 · ภาพ 01 บรรทัด 77–85): หัว ⚠ + "ดีลที่ต้องดู" + "ดูทั้งหมด →" (ไปรายการดีล
   *   ที่กรอง `?stale=1` ของ C1.5) · 4 แถว (`HOME_STALE_MAX`) · ป้าย "นิ่ง N วัน" 3 สถานะ (แดง/เหลือง/เทา) ·
   *   บรรทัดรอง "บริษัท · ฿มูลค่า" · ปุ่ม "ดู" ท้ายแถว
   */
  stale?: ReactNode;
  /**
   * CRM C3.2 ▸ ช่องของภาพ 01 ที่ใบ C3.2 เติม (วาดใน `crm/home.tsx` จากข้อมูล `crm.home.homeData`) — ไม่ส่ง = ไม่แสดง
   *   actions = ปุ่มหัวหน้า (นำเข้า lead · เพิ่มดีล) · kpis = KPI 6 ช่อง · filters = ค้นหา/ตัวกรอง/มุมมองที่บันทึก ·
   *   leaderboard = Leaderboard ทีมขาย · unowned = "ไม่มีเจ้าของ" (ผู้จัดการ) · aside = แถบขวา (ผู้ช่วย AI · ที่มา lead · ป้ายดีลนิ่ง)
   *   จอกว้าง ≥ 1280 px: เนื้อหาหลัก + แถบขวา 300 px (ภาพ 01) · ต่ำกว่านั้นแถบขวาลงไปต่อท้าย · 390 px ทุกบล็อกเต็มความกว้าง ◂
   */
  actions?: ReactNode;
  kpis?: ReactNode;
  filters?: ReactNode;
  leaderboard?: ReactNode;
  unowned?: ReactNode;
  aside?: ReactNode;
}) {
  const base = `/app/sys/${systemId}`;
  return (
    <div className="flex min-w-0 flex-col gap-5" data-testid="crm-home">
      <ModuleTabs items={navItems} />
      {actions ?? null}

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

      {/* CRM C3.2 ▸ ภาพ 01: เนื้อหาหลัก (KPI · ตัวกรอง · งานวันนี้ + ดีลที่ต้องดู · leaderboard) + แถบขวา ◂ */}
      <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-5">
          {kpis ?? null}
          {filters ?? null}
          {/* ภาพ 01: "งานวันนี้" กับ "ดีลที่ต้องดู" วางคู่กันบนจอกว้าง · 390 px ซ้อนกันเต็มความกว้าง */}
          <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
            <TasksBlock base={base} tasks={tasks} />
            {stale ?? null}
          </div>
          {leaderboard ?? null}
          {unowned ?? null}
          <section className="flex min-w-0 flex-col gap-3" data-testid="crm-home-my-deals">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">ดีลของฉัน</h2>
              <Link href={`${base}/crm/deals`} className="text-sm text-[color:var(--color-accent)]" data-testid="crm-home-all-deals">
                ดูทั้งหมด →
              </Link>
            </div>
            <MyDealsList systemId={systemId} deals={deals} stages={stages} />
          </section>
        </div>
        {aside ?? null}
      </div>
    </div>
  );
}

/** "งานของฉันวันนี้" (ใบ C1.11 · ภาพ 01 "งานวันนี้") — การ์ดคู่กับ "ดีลที่ต้องดู" ในเนื้อหาหลัก (CRM C3.2 จัดเป็นการ์ดตามภาพ 01) */
function TasksBlock({ base, tasks }: { base: string; tasks: CrmHomeTaskView[] }) {
  return (
    <section className="card flex min-w-0 flex-col gap-3 p-4" data-testid="crm-home-my-tasks">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
          <span className="truncate">งานของฉันวันนี้</span>
          <span className={`shrink-0 text-xs font-normal ${muted}`}>{tasks.length.toLocaleString("th-TH")} รายการ</span>
        </h2>
        <Link href={`${base}/crm/activities`} className="shrink-0 text-sm text-[color:var(--color-accent)]" data-testid="crm-home-all-tasks">
          งานทั้งหมด →
        </Link>
      </div>
      {tasks.length === 0 ? (
        <p className={`text-sm ${muted}`}>วันนี้ไม่มีงานค้าง</p>
      ) : (
        <ul className="flex min-w-0 flex-col divide-y">
          {tasks.map((t) => (
            <li key={t.id} className="flex min-w-0 items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-sm">{t.title}</span>
              <span className={`shrink-0 text-xs ${t.overdue ? "text-[color:var(--color-danger)]" : muted}`}>{t.dueLabel}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
