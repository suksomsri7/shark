import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { ModuleTabs } from "@/components/module-tabs";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { MoneyText } from "@/components/ui/MoneyText";
import CsvImport from "@/components/CsvImport";
import { getTierConfig, listCustomers, tierLabel } from "./service";
import { importCustomersAction } from "./import-actions";
import { MemberTiersForm } from "./tier-form";

const muted = "text-[color:var(--color-muted)]";

// ลูกค้าในระบบสมาชิกนี้ — ผ่าน service กลาง (โมดูลไม่ใช้ prisma ตรง) แล้วกรองด้วย memberSystemId
// (แพตเทิร์นเดียวกับ PlansSection/SubscribeSection ในโมดูลนี้)
async function memberCustomers(tenantId: string, systemId: string) {
  const all = await listCustomers(tenantId);
  return all.filter((c) => c.memberSystemId === systemId);
}

// แท็บฟังก์ชันย่อยของระบบสมาชิก (ใช้ทั้งหน้า hub + ทุกหน้าย่อย ให้ตรงกันเสมอ)
// ⚠️ ต้องตรงกับ childrenFor("MEMBER") ใน src/app/app/layout.tsx (ตรวจโดย qc-nav-functions.mts)
export function memberTabs(systemId: string): { href: string; label: string }[] {
  const s = `/app/sys/${systemId}`;
  return [
    { href: s, label: "ภาพรวม" },
    { href: `${s}/member/customers`, label: "รายชื่อสมาชิก" },
    { href: `${s}/member/import`, label: "นำเข้า CSV" },
    { href: `${s}/member/plans`, label: "แพ็กเกจสมาชิก" },
    { href: `${s}/member/tiers`, label: "ระดับสมาชิก" },
    { href: `${s}/member/subscribe`, label: "สมัครสมาชิก" },
  ];
}

// ───────────── รายชื่อสมาชิก (customers) ─────────────
export async function MemberCustomersSection({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const [customers, tierConfig] = await Promise.all([
    memberCustomers(auth.active.tenantId, systemId),
    getTierConfig({ tenantId: auth.active.tenantId }),
  ]);

  return (
    <Section title={`สมาชิก (${customers.length})`}>
      <DataList
        items={customers.map((c) => ({
          key: c.id,
          href: `/app/members/${c.id}`,
          primary: c.name ?? "ไม่ระบุชื่อ",
          secondary: `${c.phone ?? "—"} · ${c.memberCode}`,
          trailing: (
            <span className="flex items-center gap-2 text-xs text-[color:var(--color-muted)]">
              <span className="rounded-full bg-[color:var(--color-surface-2)] px-2 py-0.5 font-medium text-[color:var(--color-fg)]">
                {tierLabel(tierConfig, c.tier)}
              </span>
              {c.visitCount} ครั้ง · <MoneyText satang={c.totalSpentSatang} />
            </span>
          ),
        }))}
        empty="ยังไม่มีสมาชิก — จะถูกสร้างอัตโนมัติเมื่อลูกค้าจอง/ซื้อในระบบที่เชื่อมไว้"
      />
    </Section>
  );
}

// ───────────── ระดับสมาชิก (tiers) — ตั้งชื่อ + ยอดขั้นต่ำแต่ละระดับ ─────────────
export async function MemberTiersSection({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const config = await getTierConfig({ tenantId: auth.active.tenantId });
  const rows = config.map((c) => ({
    tier: c.tier,
    label: c.label,
    minBaht: c.minSpendSatang / 100,
  }));

  return (
    <Section title="ระดับสมาชิก" card>
      <MemberTiersForm systemId={systemId} rows={rows} />
    </Section>
  );
}

// ───────────── นำเข้าลูกค้าจาก CSV (import) ─────────────
export function MemberImportSection({ systemId }: { systemId: string }) {
  return (
    <Section title="นำเข้าลูกค้าจาก CSV" card>
      <CsvImport
        systemId={systemId}
        entityLabel="ลูกค้า"
        templateHeader="ชื่อ,เบอร์โทร,อีเมล"
        templateSample="สมชาย ใจดี,0812345678,somchai@example.com"
        templateFilename="ลูกค้า-ตัวอย่าง.csv"
        supportedHeaders="ชื่อ (name), เบอร์โทร (phone), อีเมล (email) — ต้องมีชื่อหรือเบอร์อย่างน้อย 1 อย่าง"
        action={importCustomersAction}
      />
    </Section>
  );
}

// ───────────── MemberHub (หน้าภาพรวม ฝังใน /app/sys/[id]) ─────────────
// การ์ดสรุปสั้น + ลิงก์เข้าแต่ละฟังก์ชัน (ไม่ dump ทุก section แล้ว — แตกเป็นหน้าย่อยจริง)
export async function MemberHub({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const customers = await memberCustomers(auth.active.tenantId, systemId);

  const cards = [
    {
      href: `/app/sys/${systemId}/member/customers`,
      label: "รายชื่อสมาชิก",
      value: `${customers.length} คน`,
      desc: "รายชื่อ + โปรไฟล์สมาชิก",
    },
    {
      href: `/app/sys/${systemId}/member/import`,
      label: "นำเข้า CSV",
      desc: "เพิ่มลูกค้าครั้งละมาก ๆ",
    },
    {
      href: `/app/sys/${systemId}/member/plans`,
      label: "แพ็กเกจสมาชิก",
      desc: "สร้าง/เปิด-ปิดขายแพ็กเกจรายเดือน-รายปี",
    },
    {
      href: `/app/sys/${systemId}/member/tiers`,
      label: "ระดับสมาชิก",
      desc: "ตั้งชื่อ+ยอดขั้นต่ำแต่ละระดับ (เลื่อนอัตโนมัติ)",
    },
    {
      href: `/app/sys/${systemId}/member/subscribe`,
      label: "สมัครสมาชิก",
      desc: "สมัคร/ต่ออายุให้ลูกค้า + รายการล่าสุด",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <ModuleTabs items={memberTabs(systemId)} />
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

export default MemberHub;
