// SVC H.8 ▸ ค้นหาการจองของฉัน (S6) — รหัสการจอง + อีเมล (ไม่มีค้นด้วยชื่อ) · ไม่พบ = ข้อความเดียว
export type LookupFormLabels = { code: string; email: string; find: string };

export function LookupForm(props: { action: (fd: FormData) => Promise<void>; hidden: Record<string, string>; labels: LookupFormLabels }) {
  const L = props.labels;
  const field = "flex flex-col gap-0.5 rounded-2xl border border-[color:var(--color-line)] px-3 py-2";
  return (
    <form action={props.action} className="flex flex-col gap-3" data-hotel-lookup="">
      {Object.entries(props.hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className={field}>
        <span className="text-xs text-[color:var(--color-muted)]">{L.code}</span>
        <input name="code" required maxLength={40} placeholder="HR-0000-0000" autoCapitalize="characters" className="w-full bg-transparent text-[15px] font-semibold uppercase outline-none" />
      </label>
      <label className={field}>
        <span className="text-xs text-[color:var(--color-muted)]">{L.email}</span>
        <input name="email" type="email" required maxLength={120} className="w-full bg-transparent text-[15px] outline-none" />
      </label>
      <button className="btn btn-primary min-h-[52px] w-full rounded-2xl text-base font-bold">{L.find}</button>
    </form>
  );
}
