import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { listForms } from "@/lib/modules/forms/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataList } from "@/components/ui/DataList";

// รายการฟอร์มทั้งหมดของร้าน
export default async function FormsListPage() {
  const auth = await requireTenant();
  const forms = await listForms({ tenantId: auth.active.tenantId });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="📝 ฟอร์ม"
        desc="สร้างฟอร์มเก็บข้อมูลลูกค้า แชร์เป็นลิงก์สาธารณะ"
        actions={
          <Link href="/app/forms/new" className="btn btn-primary text-sm">
            + สร้างฟอร์ม
          </Link>
        }
      />

      <DataList
        items={forms.map((f) => ({
          key: f.id,
          href: `/app/forms/${f.id}`,
          primary: (
            <span className="flex items-center gap-2">
              {f.name}
              {!f.active && (
                <span className="rounded-full border px-1.5 py-0.5 text-[10px] text-[color:var(--color-muted)]">
                  ปิดอยู่
                </span>
              )}
            </span>
          ),
          secondary: `${f.fields.length} ช่อง${f.crmEnabled ? " · ส่งเข้า CRM" : ""}`,
          trailing: (
            <span className="text-xs text-[color:var(--color-muted)]">
              {f.submissionCount} รายการ
            </span>
          ),
        }))}
        empty="ยังไม่มีฟอร์ม — กด “+ สร้างฟอร์ม” เพื่อเริ่มเก็บข้อมูลลูกค้า"
      />
    </div>
  );
}
