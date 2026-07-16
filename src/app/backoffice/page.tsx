import Link from "next/link";
import { requireBackoffice, logoutAction } from "@/lib/platform/actions";
import { platformMetrics } from "@/lib/platform/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { systemDef } from "@/lib/systems";

// dashboard หลังบ้าน — การ์ด metrics รวม (ทุก role อ่านได้ใน Phase 0)
export default async function BackofficeDashboard() {
  const user = await requireBackoffice();
  const m = await platformMetrics();
  const byType = Object.entries(m.systemsByType).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="ภาพรวมแพลตฟอร์ม"
        desc={`เข้าใช้งานโดย ${user.email}`}
        actions={
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost text-sm">
              ออกจากระบบ
            </button>
          </form>
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-3">
          <div className="text-xs text-[color:var(--color-muted)]">ร้านทั้งหมด</div>
          <div className="text-2xl font-semibold">{m.totalTenants.toLocaleString("th-TH")}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-[color:var(--color-muted)]">ระบบที่เปิดรวม</div>
          <div className="text-2xl font-semibold">{m.totalSystems.toLocaleString("th-TH")}</div>
        </div>
      </div>

      <Section title="ระบบแยกตามประเภท">
        {byType.length === 0 ? (
          <div className="card py-8 text-center text-sm text-[color:var(--color-muted)]">
            ยังไม่มีระบบที่เปิด — จะแสดงเมื่อร้านเริ่มเปิดใช้งานระบบ
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {byType.map(([type, count]) => (
              <div
                key={type}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <span>
                  {systemDef(type)?.icon ?? "•"} {systemDef(type)?.label ?? type}
                </span>
                <span className="font-medium">{count.toLocaleString("th-TH")}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section>
        <div className="flex flex-wrap gap-2">
          <Link href="/backoffice/tenants" className="btn btn-ghost text-sm">
            ดูรายชื่อร้านทั้งหมด →
          </Link>
          <Link href="/backoffice/billing" className="btn btn-ghost text-sm">
            บิลเรียกเก็บร้านค้า →
          </Link>
          <Link href="/backoffice/announcements" className="btn btn-ghost text-sm">
            ประกาศระบบ →
          </Link>
        </div>
      </Section>
    </div>
  );
}
