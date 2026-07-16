import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { getArticle } from "@/lib/modules/kb/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { KbArticleForm } from "../KbArticleForm";
import { updateArticleAction, toggleActiveAction } from "../actions";

// แก้ไขบทความ + เปิด/ปิดใช้งาน
export default async function EditKbArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const auth = await requireTenant();
  const { id } = await params;
  const { err } = await searchParams;
  const article = await getArticle({ tenantId: auth.active.tenantId }, id);
  if (!article) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="แก้ไขบทความ"
        back={{ href: "/app/kb", label: "คลังความรู้" }}
        actions={
          <form action={toggleActiveAction}>
            <input type="hidden" name="id" defaultValue={article.id} />
            {/* toggle: ส่งค่าตรงข้ามสถานะปัจจุบัน */}
            {!article.active && <input type="hidden" name="active" value="on" />}
            <SubmitButton variant="ghost" pendingText="กำลังบันทึก…">
              {article.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
            </SubmitButton>
          </form>
        }
      />

      {!article.active && (
        <p className="rounded-lg border border-[color:var(--color-warning,#e0a800)] px-3 py-2 text-xs text-[color:var(--color-muted)]">
          บทความนี้ปิดใช้งานอยู่ — จะไม่ปรากฏในการค้นหาของทีมและผู้ช่วย AI
        </p>
      )}

      <KbArticleForm
        action={updateArticleAction}
        submitLabel="บันทึกการแก้ไข"
        defaults={{
          id: article.id,
          title: article.title,
          body: article.body,
          category: article.category,
        }}
        serverError={err}
      />
    </div>
  );
}
