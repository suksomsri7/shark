// CrmDataWidgets.tsx — กล่อง widget ข้อมูลของ CRM บนหน้า Page `/p/<slug>` (ใบ C3.6 · "ดีลของฉัน" · "งานวันนี้" · "พอร์ทัลลูกค้า")
// 🔴 server component ล้วน (ไม่มี 'use client') · ไม่ import โมดูล CRM/prisma — ข้อมูลที่ผ่านการกรองสิทธิ์แล้ว + ข้อความที่จัดรูปแล้วมาทาง props
//    (หน้า `/p/[slug]` โหลดด้วย session ของผู้เปิด → `crm.widgets.*` ใช้ visibleWhere ของคนนั้น)
// 🔴 ทุกตัวที่กดได้มี data-testid · ไม่มีเบอร์/อีเมลของลูกค้า (ชื่อดีล/ชื่องาน/ชื่อขั้นเท่านั้น)

import type React from "react";

export type CrmDealsWidgetData = {
  kind: "myDeals";
  id: string;
  title: string;
  moreHref: string;
  total: number;
  items: { id: string; title: string; value: string; stageName: string; stalled: boolean; href: string }[];
  error?: string;
};
export type CrmTasksWidgetData = {
  kind: "todayTasks";
  id: string;
  title: string;
  moreHref: string;
  counts: { today: number; overdue: number; done: number };
  items: { id: string; title: string; when: string; overdue: boolean; done: boolean; href: string }[];
  error?: string;
};
export type CrmPortalWidgetData = { kind: "portal"; id: string; title: string; href: string | null };
export type CrmWidgetData = CrmDealsWidgetData | CrmTasksWidgetData | CrmPortalWidgetData;

const muted = "text-[color:var(--color-muted)]";

export function CrmDataWidgets({ widgets }: { widgets: CrmWidgetData[] }) {
  if (widgets.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {widgets.map((w) =>
        w.kind === "myDeals" ? <DealsCard key={w.id} w={w} /> : w.kind === "todayTasks" ? <TasksCard key={w.id} w={w} /> : <PortalCard key={w.id} w={w} />,
      )}
    </div>
  );
}

const MORE = "shrink-0 text-xs text-[color:var(--color-accent)] underline-offset-2 hover:underline";

/** หัวกล่อง — ลิงก์ "ดูทั้งหมด" ส่งมาเป็น element ที่มี testid ตรงตัว (ทะเบียนปุ่ม F14 อ่านค่าจากตัวแปรไม่ได้) */
function CardHead({ title, badge, more }: { title: string; badge?: string; more: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="min-w-0 truncate text-sm font-semibold">
        {title}
        {badge ? <span className={`ml-1.5 text-xs font-normal ${muted}`}>{badge}</span> : null}
      </h2>
      {more}
    </div>
  );
}

function DealsCard({ w }: { w: CrmDealsWidgetData }) {
  return (
    <section data-testid="page-widget-crm-my-deals" className="card flex min-w-0 flex-col gap-2 p-3">
      <CardHead
        title={w.title}
        badge={w.error ? undefined : `${w.total} ดีล`}
        more={
          <a href={w.moreHref} data-testid="page-widget-crm-my-deals-more" className={MORE}>
            ดูทั้งหมด
          </a>
        }
      />
      {w.error ? (
        <p className={`text-xs ${muted}`}>{w.error}</p>
      ) : w.items.length === 0 ? (
        <p className={`text-xs ${muted}`}>ยังไม่มีดีลที่เปิดอยู่ของคุณ</p>
      ) : (
        <ul className="flex min-w-0 flex-col divide-y divide-[color:var(--color-line)]">
          {w.items.map((d) => (
            <li key={d.id} className="min-w-0">
              <a href={d.href} data-testid={`page-widget-crm-deal-${d.id}`} className="flex min-h-[44px] min-w-0 items-center justify-between gap-2 py-1.5 hover:opacity-80">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{d.title}</span>
                  <span className={`truncate text-xs ${muted}`}>
                    {d.stageName}
                    {d.stalled ? <span className="ml-1.5 text-[color:var(--color-danger)]">· นิ่ง</span> : null}
                  </span>
                </span>
                <span className="shrink-0 text-sm tabular-nums">{d.value}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TasksCard({ w }: { w: CrmTasksWidgetData }) {
  return (
    <section data-testid="page-widget-crm-today-tasks" className="card flex min-w-0 flex-col gap-2 p-3">
      <CardHead
        title={w.title}
        more={
          <a href={w.moreHref} data-testid="page-widget-crm-today-tasks-more" className={MORE}>
            ดูทั้งหมด
          </a>
        }
      />
      {w.error ? (
        <p className={`text-xs ${muted}`}>{w.error}</p>
      ) : (
        <>
          <p className={`text-xs ${muted}`}>
            วันนี้ {w.counts.today} · เลยกำหนด <span className={w.counts.overdue > 0 ? "text-[color:var(--color-danger)]" : ""}>{w.counts.overdue}</span> · เสร็จแล้ว {w.counts.done}
          </p>
          {w.items.length === 0 ? (
            <p className={`text-xs ${muted}`}>ไม่มีงานค้างของวันนี้</p>
          ) : (
            <ul className="flex min-w-0 flex-col divide-y divide-[color:var(--color-line)]">
              {w.items.map((t) => (
                <li key={t.id} className="min-w-0">
                  <a href={t.href} data-testid={`page-widget-crm-task-${t.id}`} className="flex min-h-[44px] min-w-0 items-center justify-between gap-2 py-1.5 hover:opacity-80">
                    <span className={`min-w-0 truncate text-sm ${t.done ? `line-through ${muted}` : ""}`}>{t.title}</span>
                    <span className={`shrink-0 text-xs tabular-nums ${t.overdue ? "text-[color:var(--color-danger)]" : muted}`}>{t.when}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function PortalCard({ w }: { w: CrmPortalWidgetData }) {
  return (
    <section data-testid="page-widget-crm-portal" className="card flex min-w-0 items-center justify-between gap-3 p-3">
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold">{w.title}</span>
        <span className={`truncate text-xs ${muted}`}>{w.href ? "ลูกค้าองค์กรเข้าดูใบเสนอราคา ใบแจ้งหนี้ และแจ้งเรื่องได้เอง" : "ร้านยังไม่ได้เปิดพอร์ทัลลูกค้า"}</span>
      </span>
      {w.href ? (
        <a href={w.href} data-testid="page-widget-crm-portal-open" className="btn btn-ghost min-h-[40px] shrink-0 text-sm">
          เปิดพอร์ทัล
        </a>
      ) : null}
    </section>
  );
}
