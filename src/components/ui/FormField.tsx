type Props = { label: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode };
export function FormField({ label, hint, error, required, children }: Props) {
  return (
    <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
      <span>
        {label}
        {required && <span className="text-[color:var(--color-danger)]"> *</span>}
      </span>
      {children}
      {hint && !error && <span className="text-[color:var(--color-muted)]">{hint}</span>}
      {error && <span className="text-[color:var(--color-danger)]">{error}</span>}
    </label>
  );
}
export default FormField;
