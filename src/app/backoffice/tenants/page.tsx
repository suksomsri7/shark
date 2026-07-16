import { requireBackoffice, logoutAction } from "@/lib/platform/actions";
import { listTenantsOverview } from "@/lib/platform/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataList } from "@/components/ui/DataList";
import { formatThaiDate } from "@/lib/ui/date";

// รายชื่อร้านทั้งหมด — ชื่อ / วันสมัคร / จำนวนระบบ (ลิงก์ไปหน้ารายละเอียด)
export default async function TenantsPage() {
  await requireBackoffice();
  const tenants = await listTenantsOverview();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="ร้านค้าทั้งหมด"
        back={{ href: "/backoffice", label: "ภาพรวมแพลตฟอร์ม" }}
        desc={`ทั้งหมด ${tenants.length.toLocaleString("th-TH")} ร้าน`}
        actions={
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost text-sm">
              ออกจากระบบ
            </button>
          </form>
        }
      />

      <DataList
        items={tenants.map((t) => ({
          key: t.id,
          href: `/backoffice/tenants/${t.id}`,
          primary: t.name,
          secondary: `สมัครเมื่อ ${formatThaiDate(t.createdAt)}`,
          trailing: (
            <span className="text-xs text-[color:var(--color-muted)]">
              {t.systemsCount.toLocaleString("th-TH")} ระบบ
            </span>
          ),
        }))}
        empty="ยังไม่มีร้านสมัครใช้งาน — จะแสดงที่นี่เมื่อมีร้านแรก"
      />
    </div>
  );
}
