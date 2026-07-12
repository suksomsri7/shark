type Tone = "muted" | "strong" | "danger";
type Props = { value: string; map?: Record<string, string>; tone?: Tone; toneOf?: (v: string) => Tone };
const STYLE: Record<Tone, React.CSSProperties> = {
  muted: { color: "var(--color-muted)", borderColor: "var(--color-line)" },
  strong: { color: "var(--color-ink)", borderColor: "var(--color-ink)" },
  danger: { color: "var(--color-danger)", borderColor: "var(--color-danger)" },
};
export function StatusChip({ value, map, tone, toneOf }: Props) {
  const label = map?.[value] ?? value;
  if (map && !(value in map) && process.env.NODE_ENV !== "production") {
    console.warn(`[StatusChip] ไม่มี label สำหรับสถานะ "${value}"`);
  }
  const t: Tone = tone ?? toneOf?.(value) ?? "muted";
  return (
    <span className="rounded-full border px-2 py-0.5 text-xs whitespace-nowrap" style={STYLE[t]}>
      {map && !(value in map) ? "ไม่ทราบสถานะ" : label}
    </span>
  );
}
export default StatusChip;
