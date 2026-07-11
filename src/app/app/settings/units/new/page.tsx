import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { AddUnitForm } from "@/components/add-unit-form";

export default async function NewUnitPage() {
  await requireTenant();
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <Link href="/app" className="text-sm text-[color:var(--color-muted)]">
        ← ทุกกิจการ
      </Link>
      <h1 className="text-2xl font-semibold">เพิ่มกิจการ</h1>
      <AddUnitForm />
    </div>
  );
}
