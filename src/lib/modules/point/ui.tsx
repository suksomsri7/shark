import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { ModuleTabs } from "@/components/module-tabs";
import { Section } from "@/components/ui/Section";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPointSettings, listPointCustomers } from "./service";
import { PointSettingsForm, AdjustPointsForm } from "./forms";

const muted = "text-[color:var(--color-muted)]";

// แท็บฟังก์ชันย่อยของระบบแต้ม (ใช้ทั้งหน้า hub + ทุกหน้าย่อย ให้ตรงกันเสมอ)
// ⚠️ ต้องตรงกับ childrenFor("POINT") ใน src/app/app/layout.tsx (ตรวจโดย qc-nav-functions.mts)
export function pointTabs(systemId: string): { href: string; label: string }[] {
  const s = `/app/sys/${systemId}`;
  return [
    { href: s, label: "ภาพรวม" },
    { href: `${s}/point/manage`, label: "จัดการแต้ม" },
    { href: `${s}/point/ledger`, label: "รายการแต้ม" },
  ];
}

// ───────────── จัดการแต้ม (ตั้งค่าอัตรา + ปรับ/แจกแต้ม) ─────────────
export async function PointManageSection({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const [settings, customers] = await Promise.all([
    getPointSettings(tenantId),
    listPointCustomers(tenantId, systemId),
  ]);
  const bahtPerPoint = settings.satangPerPoint / 100;

  return (
    <div className="flex flex-col gap-6">
      <Section title="ตั้งค่าแต้ม" card>
        <p className="text-xs text-[color:var(--color-muted)]">
          {settings.active
            ? `อัตราสะสมปัจจุบัน: ทุก ${bahtPerPoint} บาท = 1 แต้ม`
            : "การสะสมแต้มถูกปิดอยู่ — ลูกค้าจะยังไม่ได้รับแต้มจากการซื้อ"}
        </p>
        <PointSettingsForm systemId={systemId} bahtPerPoint={bahtPerPoint} active={settings.active} />
      </Section>

      <Section title="ปรับ/แจกแต้ม">
        {customers.length > 0 ? (
          <AdjustPointsForm systemId={systemId} customers={customers} />
        ) : (
          <EmptyState text="ยังไม่มีสมาชิก — ลูกค้าจะเป็นสมาชิกอัตโนมัติเมื่อจอง/ซื้อในกิจการที่เชื่อมกับระบบแต้มนี้ แล้วจึงปรับ/แจกแต้มได้" />
        )}
      </Section>
    </div>
  );
}

// ───────────── PointHub (หน้าภาพรวม ฝังใน /app/sys/[id]) ─────────────
// การ์ดสรุปสั้น + ลิงก์เข้าแต่ละฟังก์ชัน (ไม่ dump ทุก section แล้ว — แตกเป็นหน้าย่อยจริง)
export async function PointHub({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const [settings, customers] = await Promise.all([
    getPointSettings(tenantId),
    listPointCustomers(tenantId, systemId),
  ]);
  const bahtPerPoint = settings.satangPerPoint / 100;

  const cards = [
    {
      href: `/app/sys/${systemId}/point/manage`,
      label: "จัดการแต้ม",
      value: settings.active ? `${bahtPerPoint} บ./แต้ม` : "ปิดสะสม",
      desc: `ตั้งอัตรา + ปรับ/แจกแต้ม · ${customers.length} สมาชิก`,
    },
    {
      href: `/app/sys/${systemId}/point/ledger`,
      label: "รายการแต้ม",
      desc: "ประวัติการสะสม/ใช้แต้มล่าสุด",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <ModuleTabs items={pointTabs(systemId)} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card flex min-h-[76px] flex-col gap-1 p-4 transition-colors hover:bg-[color:var(--color-surface-2)]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{c.label}</span>
              {c.value && <span className="text-sm tabular-nums text-[color:var(--color-accent)]">{c.value}</span>}
            </div>
            <span className={`text-xs ${muted}`}>{c.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default PointHub;
