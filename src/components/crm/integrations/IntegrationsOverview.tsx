"use client";

// IntegrationsOverview.tsx — แผนผังการเชื่อมต่อ (ใบ C3.6 · ภาพ 17 บน): CRM กลาง ↔ 23 ระบบ + ชิป "เปิดใช้ n" / "ไม่ได้เปิด n"
// 🔴 ไฟล์ client: ไม่ import โมดูล CRM/prisma — ข้อมูลทุกอย่างมาทาง props (หน้า page.tsx แปลงให้)
// 🔴 ชิปจำนวนกดได้ = เน้นเฉพาะกล่องกลุ่มนั้น (กดซ้ำ = กลับเป็นทั้งหมด) · กล่องที่เปิดอยู่ของระบบเดียว = ลิงก์เข้าระบบนั้น
// 🔴 ≥ lg: กริด 9 คอลัมน์ตามภาพ (บน 9 · ซ้าย 3 · ขวา 2 · ล่าง 9 · CRM กลาง) · < lg: กริด 2–3 คอลัมน์ CRM บนสุด (ไม่มีความกว้างตายตัว)
import Link from "next/link";
import { useState } from "react";

export type MapNode = { code: string; label: string; enabled: boolean; into: string; out: string; href: string | null };

/** ตำแหน่งบนกริด 9 คอลัมน์ (≥ lg) — สตริงเต็มเพื่อให้ Tailwind สแกนเจอ */
const PLACE: Record<string, string> = {
  HOTEL: "lg:col-start-1 lg:row-start-1",
  RESTAURANT: "lg:col-start-2 lg:row-start-1",
  BOOKING: "lg:col-start-3 lg:row-start-1",
  TICKET: "lg:col-start-4 lg:row-start-1",
  MEMBER: "lg:col-start-5 lg:row-start-1",
  REWARD: "lg:col-start-6 lg:row-start-1",
  COUPON: "lg:col-start-7 lg:row-start-1",
  POINT: "lg:col-start-8 lg:row-start-1",
  CHAT: "lg:col-start-9 lg:row-start-1",
  QUEUE: "lg:col-start-1 lg:row-start-2",
  RENTAL: "lg:col-start-1 lg:row-start-3",
  SCHOOL: "lg:col-start-1 lg:row-start-4",
  CLINIC: "lg:col-start-9 lg:row-start-2",
  PAGES: "lg:col-start-9 lg:row-start-3",
  MEETING: "lg:col-start-1 lg:row-start-5",
  ACCOUNT: "lg:col-start-2 lg:row-start-5",
  KANBAN: "lg:col-start-3 lg:row-start-5",
  POS: "lg:col-start-4 lg:row-start-5",
  KB: "lg:col-start-5 lg:row-start-5",
  HR: "lg:col-start-6 lg:row-start-5",
  INVENTORY: "lg:col-start-7 lg:row-start-5",
  MARKETING: "lg:col-start-8 lg:row-start-5",
  SHOP: "lg:col-start-9 lg:row-start-5",
};

type Filter = "all" | "enabled" | "disabled";

export function IntegrationsOverview({ crm, nodes }: { crm: { name: string; events7d: number }; nodes: MapNode[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const enabled = nodes.filter((n) => n.enabled).length;
  const disabled = nodes.length - enabled;
  const dim = (n: MapNode) => (filter === "enabled" && !n.enabled) || (filter === "disabled" && n.enabled);
  const chip = (active: boolean) =>
    `inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 text-xs ${active ? "border-[color:var(--color-ink)] font-semibold" : "border-[color:var(--color-line)] text-[color:var(--color-muted)]"}`;
  return (
    <section data-testid="crm-integrations-map" className="card flex min-w-0 flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          แผนผังการเชื่อมต่อ <span className="text-xs font-normal text-[color:var(--color-muted)]">ทุกเส้นผ่าน facade/outbox (ไม่ import ตรง) · partyId ร่วม</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="crm-integrations-count-enabled" aria-pressed={filter === "enabled"} className={chip(filter === "enabled")} onClick={() => setFilter(filter === "enabled" ? "all" : "enabled")}>
            <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-[color:var(--color-ink)]" />
            เปิดใช้ {enabled}
          </button>
          <button type="button" data-testid="crm-integrations-count-disabled" aria-pressed={filter === "disabled"} className={chip(filter === "disabled")} onClick={() => setFilter(filter === "disabled" ? "all" : "disabled")}>
            <span aria-hidden className="inline-block h-2 w-2 rounded-full border border-[color:var(--color-muted)]" />
            ไม่ได้เปิด {disabled}
          </button>
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-9">
        <div
          data-testid="crm-integrations-node-CRM"
          className="order-first col-span-2 flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-xl bg-[color:var(--color-ink)] p-4 text-center text-[color:var(--color-surface)] sm:col-span-3 lg:order-none lg:col-span-3 lg:col-start-4 lg:row-span-3 lg:row-start-2"
        >
          <span className="text-lg font-bold">CRM</span>
          <span className="max-w-full truncate text-xs opacity-80">{crm.name}</span>
          <span className="text-[11px] opacity-60">partyId กลาง · outbox {crm.events7d} เหตุการณ์ใน 7 วัน</span>
        </div>
        {nodes.map((n) => {
          const cls = `${PLACE[n.code] ?? ""} flex min-h-[84px] min-w-0 flex-col gap-0.5 rounded-xl border p-2 text-left transition-opacity ${
            n.enabled ? "border-[color:var(--color-line)] bg-[color:var(--color-surface)]" : "border-dashed border-[color:var(--color-line)] text-[color:var(--color-muted)]"
          } ${dim(n) ? "opacity-30" : ""}`;
          const body = (
            <>
              <span className="truncate text-xs font-semibold">{n.label}</span>
              {n.into ? <span className="truncate text-[10.5px] text-[color:var(--color-muted)]">{n.into}</span> : null}
              {n.out ? <span className="truncate text-[10.5px] text-[color:var(--color-muted)]">{n.out}</span> : null}
              {!n.enabled ? <span className="mt-auto w-fit rounded-full border px-2 text-[10px]">ไม่ได้เปิดใช้</span> : null}
            </>
          );
          return n.href ? (
            <Link key={n.code} href={n.href} data-testid={`crm-integrations-node-${n.code}`} className={`${cls} hover:bg-[color:var(--color-surface-2)]`}>
              {body}
            </Link>
          ) : (
            <div key={n.code} data-testid={`crm-integrations-node-${n.code}`} className={cls}>
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}
