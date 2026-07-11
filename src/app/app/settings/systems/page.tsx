import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { AddSystemForm } from "@/components/add-system-form";

export default async function AddSystemPage() {
  await requireTenant();
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <div>
        <Link href="/app" className="text-sm text-[color:var(--color-muted)]">
          ← ระบบทั้งหมด
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">เพิ่มระบบ</h1>
        <p className="text-sm text-[color:var(--color-muted)]">
          เลือกระบบที่ต้องการ สร้างกี่ระบบก็ได้ — ทุกระบบเชื่อมถึงกันได้
        </p>
      </div>
      <AddSystemForm />
    </div>
  );
}
