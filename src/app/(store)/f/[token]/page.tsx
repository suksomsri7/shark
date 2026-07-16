import type { CSSProperties } from "react";
import { getPublicForm } from "@/lib/modules/forms/service";
import { getPublicBranding } from "@/lib/branding/service";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { submitFormAction } from "./actions";

export const dynamic = "force-dynamic";

const inputCls =
  "rounded-lg border px-3 py-2.5 text-sm text-[color:var(--color-ink)] bg-[color:var(--color-surface)]";

// ลิงก์ฟอร์มสาธารณะ /f/<token> — ลูกค้ากรอกไม่ต้องล็อกอิน (มือถือ-first)
export default async function PublicFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const { token } = await params;
  const { ok, err } = await searchParams;
  const pub = await getPublicForm(token);

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 bg-[color:var(--color-surface-2)] p-6">
      {children}
    </main>
  );

  if (!pub) {
    return shell(
      <div className="text-center">
        <div className="text-xl font-semibold">ไม่พบฟอร์ม</div>
        <div className="mt-1 text-sm text-[color:var(--color-muted)]">
          ฟอร์มนี้อาจถูกปิดหรือลิงก์ไม่ถูกต้อง
        </div>
      </div>,
    );
  }

  if (ok) {
    return shell(
      <div className="rounded-xl border bg-[color:var(--color-surface)] p-6 text-center">
        <div className="text-2xl">🎉</div>
        <div className="mt-2 text-lg font-semibold">ขอบคุณค่ะ</div>
        <div className="mt-1 text-sm text-[color:var(--color-muted)]">
          เราได้รับข้อมูลของคุณเรียบร้อยแล้ว
        </div>
      </div>,
    );
  }

  const { form } = pub;
  const branding = await getPublicBranding(pub.tenantId);
  const accentStyle = branding.brandColor
    ? ({ ["--color-accent"]: branding.brandColor } as CSSProperties)
    : undefined;
  return shell(
    <>
      <header className="flex flex-col items-center text-center" style={accentStyle}>
        {branding.logoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={branding.logoUrl}
            alt={branding.displayName}
            className="mb-2 h-12 w-12 rounded object-contain"
          />
        )}
        <div className="text-xs font-semibold tracking-widest text-[color:var(--color-muted)]">
          {branding.displayName}
        </div>
        <h1
          className="mt-1 text-xl font-bold"
          style={branding.brandColor ? { color: branding.brandColor } : undefined}
        >
          {form.name}
        </h1>
        {form.description && (
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">{form.description}</p>
        )}
      </header>

      <form
        action={submitFormAction}
        className="flex flex-col gap-4 rounded-xl border bg-[color:var(--color-surface)] p-5"
      >
        <input type="hidden" name="__token" value={token} />
        {err && (
          <p className="rounded-lg bg-[color:var(--color-surface-2)] p-2 text-sm text-[color:var(--color-danger)]">
            {err}
          </p>
        )}

        {form.fields.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>
              {f.label}
              {f.required && <span className="text-[color:var(--color-danger)]"> *</span>}
            </span>

            {f.type === "textarea" ? (
              <textarea name={f.key} rows={4} required={f.required} className={inputCls} />
            ) : f.type === "select" ? (
              <select name={f.key} required={f.required} defaultValue="" className={inputCls}>
                <option value="" disabled>
                  — เลือก —
                </option>
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={f.key}
                required={f.required}
                type={f.type === "phone" ? "tel" : f.type === "email" ? "email" : "text"}
                inputMode={f.type === "phone" ? "tel" : undefined}
                className={inputCls}
              />
            )}
          </label>
        ))}

        <SubmitButton pendingText="กำลังส่ง…">ส่งข้อมูล</SubmitButton>
      </form>

      <p className="text-center text-[11px] text-[color:var(--color-muted)]">
        ขับเคลื่อนโดย SHARK
      </p>
    </>,
  );
}
