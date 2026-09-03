import Link from "next/link";

// Stepper แปลงเอกสาร (g1-invoice-form.png บนสุด): วงกลม 40px เชื่อมด้วยเส้น — เสร็จ=ดำ+✓ · ปัจจุบัน=accent+เลข · ถัดไป=เทาจาง
export type StepDef = { code: string; label: string; docNo?: string; state: "done" | "current" | "next" };

export function Stepper({ steps, hrefFor, testId }: { steps: StepDef[]; hrefFor?: (s: StepDef) => string | undefined; testId?: string }) {
  return (
    <ol className="flex w-full items-start" data-testid={testId}>
      {steps.map((s, i) => {
        const href = s.state === "done" ? hrefFor?.(s) : undefined;
        const circle = (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium"
            style={
              s.state === "done"
                ? { background: "var(--color-ink)", color: "var(--color-surface)" }
                : s.state === "current"
                  ? { background: "var(--color-accent)", color: "var(--color-surface)" }
                  : { background: "var(--color-surface)", color: "var(--color-muted)", border: "1px solid var(--color-line)" }
            }
          >
            {s.state === "done" ? "✓" : i + 1}
          </span>
        );
        return (
          <li key={s.code} className="flex flex-1 flex-col items-center gap-1" data-testid={testId ? `${testId}-${s.code}` : undefined}>
            <div className="flex w-full items-center">
              {i > 0 && (
                <span
                  className="h-px flex-1"
                  style={{ background: steps[i - 1].state !== "next" ? "var(--color-ink)" : "var(--color-line)" }}
                />
              )}
              {href ? <Link href={href}>{circle}</Link> : circle}
              {i < steps.length - 1 && (
                <span className="h-px flex-1" style={{ background: s.state === "done" ? "var(--color-ink)" : "var(--color-line)" }} />
              )}
            </div>
            <div className="text-center text-xs">
              <div className={s.state === "current" ? "font-semibold" : "text-[color:var(--color-muted)]"}>{s.label}</div>
              <div className="text-[color:var(--color-muted)]">{s.docNo ?? (s.state === "current" ? "กำลังสร้าง" : "")}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default Stepper;
