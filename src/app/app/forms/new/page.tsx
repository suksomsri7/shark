import { requireTenant } from "@/lib/core/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormBuilder } from "../FormBuilder";
import { createFormAction } from "../actions";

// สร้างฟอร์มใหม่
export default async function NewFormPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  await requireTenant();
  const { err } = await searchParams;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title="สร้างฟอร์ม" back={{ href: "/app/forms", label: "ฟอร์มทั้งหมด" }} />
      <FormBuilder action={createFormAction} submitLabel="สร้างฟอร์ม" serverError={err} />
    </div>
  );
}
