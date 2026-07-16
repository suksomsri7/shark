import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { env } from "@/lib/env";
import { getForm, listSubmissions } from "@/lib/modules/forms/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormBuilder } from "../FormBuilder";
import { CopyLink } from "../CopyLink";
import { updateFormAction, toggleActiveAction } from "../actions";

const fmt = (d: Date) =>
  d.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });

// แก้ไขฟอร์ม + ลิงก์สาธารณะ + รายการที่ส่งเข้ามา
export default async function EditFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { err, saved } = await searchParams;
  const auth = await requireTenant();
  const ctx = { tenantId: auth.active.tenantId };

  const form = await getForm(ctx, id);
  if (!form) notFound();
  const subs = await listSubmissions(ctx, id);
  const publicUrl = `${env.APP_URL.replace(/\/$/, "")}/f/${form.publicToken}`;
  // แผนที่ key → label สำหรับแสดงผลรายการที่ส่งเข้ามา
  const labelOf = new Map(form.fields.map((f) => [f.key, f.label]));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title={form.name}
        back={{ href: "/app/forms", label: "ฟอร์มทั้งหมด" }}
        desc={form.active ? "เปิดรับข้อมูลอยู่" : "ปิดรับข้อมูล"}
        actions={
          <form action={toggleActiveAction}>
            <input type="hidden" name="id" value={form.id} />
            <input type="hidden" name="active" value={form.active ? "0" : "1"} />
            <button className="btn btn-ghost text-sm">
              {form.active ? "ปิดรับข้อมูล" : "เปิดรับข้อมูล"}
            </button>
          </form>
        }
      />

      {saved && (
        <p className="rounded-lg bg-[color:var(--color-surface-2)] p-2 text-sm text-[color:var(--color-accent)]">
          บันทึกแล้ว
        </p>
      )}

      <Section title="ลิงก์สาธารณะ" card>
        {form.active ? (
          <p className="text-xs text-[color:var(--color-muted)]">
            แชร์ลิงก์นี้ให้ลูกค้ากรอก (ไม่ต้องล็อกอิน)
          </p>
        ) : (
          <p className="text-xs text-[color:var(--color-danger)]">
            ฟอร์มปิดอยู่ — ผู้เปิดลิงก์จะกรอกไม่ได้จนกว่าจะเปิดรับข้อมูล
          </p>
        )}
        <CopyLink url={publicUrl} />
      </Section>

      <Section title="แก้ไขฟอร์ม">
        <FormBuilder
          action={updateFormAction}
          formId={form.id}
          initial={{
            name: form.name,
            description: form.description ?? "",
            crmEnabled: form.crmEnabled,
            fields: form.fields,
          }}
          submitLabel="บันทึกการแก้ไข"
          serverError={err}
        />
      </Section>

      <Section title={`รายการที่ส่งเข้ามา (${subs.length})`}>
        {subs.length === 0 ? (
          <EmptyState text="ยังไม่มีข้อมูลส่งเข้ามา — เมื่อลูกค้ากรอกฟอร์มจะแสดงที่นี่" />
        ) : (
          <div className="flex flex-col gap-2">
            {subs.map((s) => {
              const ans = (s.answersJson ?? {}) as Record<string, unknown>;
              return (
                <div key={s.id} className="rounded-lg border p-3 text-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-[color:var(--color-muted)]">{fmt(s.createdAt)}</span>
                    {s.crmContactId && (
                      <span className="rounded-full border px-1.5 py-0.5 text-[10px] text-[color:var(--color-accent)]">
                        เข้า CRM
                      </span>
                    )}
                  </div>
                  <dl className="flex flex-col gap-0.5">
                    {Object.entries(ans).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="shrink-0 text-[color:var(--color-muted)]">
                          {labelOf.get(k) ?? k}:
                        </dt>
                        <dd className="min-w-0 break-words">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
