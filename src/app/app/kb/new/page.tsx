import { requireTenant } from "@/lib/core/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { KbArticleForm } from "../KbArticleForm";
import { createArticleAction } from "../actions";

// สร้างบทความคลังความรู้ใหม่
export default async function NewKbArticlePage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  await requireTenant();
  const { err } = await searchParams;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title="สร้างบทความ" back={{ href: "/app/kb", label: "คลังความรู้" }} />
      <KbArticleForm action={createArticleAction} submitLabel="บันทึกบทความ" serverError={err} />
    </div>
  );
}
