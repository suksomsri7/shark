// TierChip.tsx — ชิประดับสมาชิก สีตาม `TagColor` ของ MemberTierDef (ภาพ 01/02 · `.lb amber/purple/blue/slate`)
// ใช้แทน StatusChip เฉพาะจุดที่โชว์ "ระดับ" เพราะต้องมีสีต่อระดับจริง ไม่ใช่โทนตายตัว 3 แบบของ StatusChip

/** สีตามโทเคน `--color-tag-*` ของ globals.css (D9 ชุดสีเดียวกับป้ายบอร์ดงาน) — ห้ามพิมพ์ hex เอง */
function tagColorVar(color: string): string {
  return `var(--color-tag-${color.toLowerCase()})`;
}

export function TierChip({ name, color }: { name: string; color: string }) {
  const c = tagColorVar(color);
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
      style={{ color: c, borderColor: c, background: `color-mix(in srgb, ${c} 12%, transparent)` }}
    >
      {name}
    </span>
  );
}

export default TierChip;
