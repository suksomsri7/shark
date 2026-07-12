import { requireTenant } from "@/lib/core/context";
import { AddSystemForm } from "@/components/add-system-form";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function AddSystemPage() {
  await requireTenant();
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <PageHeader
        title="เพิ่มระบบ"
        back={{ href: "/app", label: "ระบบทั้งหมด" }}
        desc="เลือกระบบที่ต้องการ สร้างกี่ระบบก็ได้ — ทุกระบบเชื่อมถึงกันได้"
      />
      <AddSystemForm />
    </div>
  );
}
