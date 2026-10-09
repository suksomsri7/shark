// RegisterIcon.tsx — ไอคอนเส้นของหน้าขายใหม่ (POS P1.3) · path ยกจาก sprite ของภาพออกแบบ ledger/design-pos/_base.part ตรงตัว
// ขนาดตามแบบ: 18 (เส้น 1.7) · 14 (เส้น 1.9) · 12 (เส้น 2) · ทุกตัว stroke = currentColor (สีตามข้อความ — ไม่มีสีของตัวเอง)
// 🔴 ไฟล์นี้ไม่มี data-testid และไม่มีข้อความ — เป็นแค่รูป (aria-hidden เสมอ)

const PATHS = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  chevron: <path d="m6 9.5 6 6 6-6" />,
  arrow: <path d="m9.5 5 7 7-7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  // POS P1.11U ▸ แถวส่งใบเสร็จของจอสำเร็จ (ภาพ 02b #i-link) ◂
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5M16 5.4a3.4 3.4 0 0 1 0 6.4M18 14.8c2.2.6 3.5 2.3 3.5 5.2" />
    </>
  ),
  box: (
    <>
      <path d="M12 3 4 7v10l8 4 8-4V7Z" />
      <path d="m4 7 8 4 8-4M12 11v10" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V10a1.6 1.6 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </>
  ),
  doc: (
    <>
      <path d="M6 3h8l4 4v14H6Z" />
      <path d="M14 3v4h4M9 12h6M9 16h4" />
    </>
  ),
  print: (
    <>
      <path d="M7 9V3h10v6" />
      <rect x="3.5" y="9" width="17" height="8" rx="2" />
      <path d="M7 14h10v7H7Z" />
    </>
  ),
  cam: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  cash: (
    <>
      <rect x="3" y="6.5" width="18" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6.5 12h.01M17.5 12h.01" />
    </>
  ),
  pct: (
    <>
      <circle cx="7.5" cy="7.5" r="2.6" />
      <circle cx="16.5" cy="16.5" r="2.6" />
      <path d="m5 19 14-14" />
    </>
  ),
  list: <path d="M4.5 6.5h.01M9 6.5h10.5M4.5 12h.01M9 12h10.5M4.5 17.5h.01M9 17.5h10.5" />,
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  shop: (
    <>
      <path d="M4 9V4h16v5" />
      <path d="M3 9h18l-1.4 11a1 1 0 0 1-1 .9H5.4a1 1 0 0 1-1-.9Z" />
      <path d="M9.5 13h5" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17Z" />
      <path d="m14.5 7.5 2 2" />
    </>
  ),
  truck: (
    <>
      <rect x="2.5" y="7" width="11" height="9" rx="1.4" />
      <path d="M13.5 10h4l3 3.2V16h-7Z" />
      <circle cx="7" cy="18.5" r="1.8" />
      <circle cx="17" cy="18.5" r="1.8" />
    </>
  ),
  tag: (
    <>
      <path d="M4 11V5a1 1 0 0 1 1-1h6l9 9-7 7-9-9Z" />
      <circle cx="8" cy="8" r="1.3" />
    </>
  ),
  warn: (
    <>
      <path d="M12 4 2.5 20h19Z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  qr: (
    <>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
      <path d="M14 14h3v3h-3ZM20.5 14v3M14 20.5h6.5" />
    </>
  ),
  // P1.6 U (ภาพ 02 · 05ข): กระเป๋าเงิน (หัวกล่องชำระ) · ย้อนกลับ (หัวมือถือ) · ธนาคาร (โอน) · บัตร
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18" />
      <circle cx="17" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  back: <path d="m15 5-7 7 7 7" />,
  bank: <path d="M3.5 9.5 12 4l8.5 5.5M5.5 9.5v9M10 9.5v9M14 9.5v9M18.5 9.5v9M3 20h18" />,
  card: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M7 14.5h4" />
    </>
  ),
} as const;

export type RegisterIconName = keyof typeof PATHS;

/** size 18 = เส้น 1.7 · 14 = 1.9 · 12 = 2 (ตาม svg.i / .i.sm / .i.xs ของแบบ) · ขนาดอื่นใช้ 1.7 */
export function RegisterIcon({ name, size = 14, strokeWidth, className }: { name: RegisterIconName; size?: number; strokeWidth?: number; className?: string }) {
  const sw = strokeWidth ?? (size <= 12 ? 2 : size <= 14 ? 1.9 : 1.7);
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className ?? ""}`}
    >
      {PATHS[name]}
    </svg>
  );
}
