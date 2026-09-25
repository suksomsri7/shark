import { getPublicForm } from "@/lib/modules/forms/service";
// CRM C2.6 ▸ ด่านกันสแปม (มติ C24): ตั๋ว "เริ่มกรอก" + ชื่อช่องหลอกบอต มาจากโมดูลฟอร์มที่เดียว ◂
import { FORM_HONEYPOT_FIELD, FORM_START_FIELD, issueFormStartToken } from "@/lib/modules/forms/spam-guard";
import { getPublicBranding } from "@/lib/branding/service";
import { publicThemeStyle } from "@/lib/branding/public";
import { PublicForm } from "./PublicForm";
import { submitFormAction } from "./actions";

export const dynamic = "force-dynamic";

// ลิงก์ฟอร์มสาธารณะ /f/<token> — ลูกค้ากรอกไม่ต้องล็อกอิน (มือถือ-first)
export default async function PublicFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
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

  const { form } = pub;
  const branding = await getPublicBranding(pub.tenantId);
  const accentStyle = publicThemeStyle(branding);
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
          style={branding.brandColor ? { color: "var(--color-accent)" } : undefined}
        >
          {form.name}
        </h1>
        {form.description && (
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">{form.description}</p>
        )}
      </header>

      {/* CRM C2.6 ▸ ฟอร์มฝั่งเบราว์เซอร์: honeypot ที่มองไม่เห็นจริง + ตั๋วเริ่มกรอก + ข้อความผลลัพธ์ inline ภาษาไทย ◂ */}
      <PublicForm
        token={token}
        fields={form.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required, options: f.options }))}
        startToken={issueFormStartToken(form.id)}
        startField={FORM_START_FIELD}
        honeypotField={FORM_HONEYPOT_FIELD}
        submitAction={submitFormAction}
      />

      <p className="text-center text-[11px] text-[color:var(--color-muted)]">
        ขับเคลื่อนโดย SHARK
      </p>
    </>,
  );
}
