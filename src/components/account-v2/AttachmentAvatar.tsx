// วงกลมอักษรย่อผู้อัปโหลด (คอลัมน์ "ผู้อัปโหลด" f9 + การ์ด grid) — server component เล็ก ๆ ใช้ร่วม
export function AttachmentAvatar({ name }: { name: string | null }) {
  const letter = (name?.trim()?.[0] ?? "?").toUpperCase();
  return (
    <span className="flex items-center gap-2 whitespace-nowrap text-sm">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
        style={{ background: "var(--color-surface-2)", color: "var(--color-ink)" }}
        aria-hidden
      >
        {letter}
      </span>
      <span className="truncate">{name ?? "ไม่ทราบชื่อ"}</span>
    </span>
  );
}

export default AttachmentAvatar;
