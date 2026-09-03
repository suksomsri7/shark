// ไอคอนเส้นบางของเมนูบัญชี V2 — คัดลอก path จริงจาก docs/design/account-v2/mockup.html
// (สไปรต์ `<symbol id="i-...">`) เพื่อให้ตรงกับแบบ f2/f4/f12/g18 เป๊ะ (stroke 1.7 currentColor เหมือน mockup)
// ต่างจาก src/components/app-shell/NavIcon.tsx (ของ shell เดิม — คนละชุดไอคอน คนละไฟล์ ไม่แตะ)
"use client";

// markup ภายใน <symbol> ของแต่ละไอคอน — คัดลอกคำต่อคำจาก mockup.html (ไม่ได้แก้ค่า path เอง)
const ICONS: Record<string, string> = {
  home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"/><path d="M9.5 21v-6h5v6"/>',
  in: '<path d="M12 4v13"/><path d="m6.5 11.5 5.5 5.5 5.5-5.5"/><path d="M4 21h16"/>',
  out: '<path d="M12 20V7"/><path d="m6.5 12.5 5.5-5.5 5.5 5.5"/><path d="M4 3h16"/>',
  users:
    '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5M16 5.4a3.4 3.4 0 0 1 0 6.4M18 14.8c2.2.6 3.5 2.3 3.5 5.2"/>',
  box: '<path d="M12 3 4 7v10l8 4 8-4V7Z"/><path d="m4 7 8 4 8-4M12 11v10"/>',
  wallet:
    '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><circle cx="17" cy="14.5" r="1.2" fill="currentColor" stroke="none"/>',
  book: '<path d="M5 4h13a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5Z"/><path d="M8.5 4v17M11.5 9h4M11.5 13h4"/>',
  folder:
    '<path d="M3.5 6.5A1 1 0 0 1 4.5 5.5h4.2l1.8 2.2h9a1 1 0 0 1 1 1v9.8a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V10a1.6 1.6 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>',
  doc: '<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4M9 12h6M9 16h4"/>',
  file: '<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/>',
  import: '<path d="M12 3v11"/><path d="m7.5 9.5 4.5 4.5 4.5-4.5"/><path d="M4 17v3h16v-3"/>',
  qr: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><path d="M14 14h3v3h-3ZM20.5 14v3M14 20.5h6.5"/>',
  spark:
    '<path d="M12 3.5 13.7 9 19 10.5 13.7 12 12 17.5 10.3 12 5 10.5 10.3 9 12 3.5ZM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  swap: '<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/>',
  bank: '<path d="M3.5 9.5 12 4l8.5 5.5"/><path d="M5.5 9.5v9M10 9.5v9M14 9.5v9M18.5 9.5v9M3 20h18"/>',
  cash: '<rect x="3" y="6.5" width="18" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 12h.01M17.5 12h.01"/>',
  pig: '<path d="M3.5 12.5A6.5 6.5 0 0 1 10 8h4a6 6 0 0 1 5.4 3.4l1.6.6v3l-1.8.4A6.2 6.2 0 0 1 16 18.5V20h-3v-1.2h-2V20H8v-1.9a6.4 6.4 0 0 1-4.5-5.6Z"/><path d="M8.5 5.5 10 8M15.5 11.5h.01"/>',
  cheque: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10.5h6M6 14h3.5M15 13.5l1.6 1.6L20 11.5"/>',
  pct: '<circle cx="7.5" cy="7.5" r="2.6"/><circle cx="16.5" cy="16.5" r="2.6"/><path d="m5 19 14-14"/>',
  tree: '<path d="M5 4v15h5M5 11h5"/><rect x="10" y="2.5" width="9" height="4" rx="1.2"/><rect x="10" y="9" width="9" height="4" rx="1.2"/><rect x="10" y="16" width="9" height="4" rx="1.2"/>',
  list: '<path d="M4.5 6.5h.01M9 6.5h10.5M4.5 12h.01M9 12h10.5M4.5 17.5h.01M9 17.5h10.5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  report: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  asset: '<path d="M3.5 20V9l8.5-5 8.5 5v11"/><rect x="8" y="12" width="8" height="8" rx="1"/>',
  shop: '<path d="M4 9V4h16v5"/><path d="M3 9h18l-1.4 11a1 1 0 0 1-1 .9H5.4a1 1 0 0 1-1-.9Z"/><path d="M9.5 13h5"/>',
  link: '<path d="M10 13.5a3.6 3.6 0 0 0 5.2.3l2.6-2.6a3.6 3.6 0 0 0-5.1-5.1l-1.5 1.5"/><path d="M14 10.5a3.6 3.6 0 0 0-5.2-.3l-2.6 2.6a3.6 3.6 0 0 0 5.1 5.1l1.5-1.5"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2.2"/><path d="m3.6 7 8.4 6 8.4-6"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
  edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17Z"/><path d="m14.5 7.5 2 2"/>',
  upload: '<path d="M12 17V5"/><path d="m7.5 9.5 4.5-4.5 4.5 4.5"/><path d="M4 17v3h16v-3"/>',
  truck:
    '<rect x="2.5" y="7" width="11" height="9" rx="1.4"/><path d="M13.5 10h4l3 3.2V16h-7Z"/><circle cx="7" cy="18.5" r="1.8"/><circle cx="17" cy="18.5" r="1.8"/>',
  tag: '<path d="M4 11V5a1 1 0 0 1 1-1h6l9 9-7 7-9-9Z"/><circle cx="8" cy="8" r="1.3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 3v4M16 3v4M3.5 9.5h17"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c0-4 3.4-6 7.5-6s7.5 2 7.5 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.5-4.5"/>',
  filter: '<path d="M3.5 5h17L14 13v5.5l-4 2V13Z"/>',
};

const FALLBACK = '<rect x="5" y="5" width="14" height="14" rx="2"/>';

// เอ็กซ์พอร์ตชื่อคีย์ไอคอนทั้งหมด — ใช้ตรวจใน scripts/qc-acc-v2-nav.mts ว่า nav.ts ไม่พิมพ์คีย์ไอคอนผิด
// (พิมพ์ผิด = fallback เป็นสี่เหลี่ยมเปล่าเงียบ ๆ ไม่ error ตอน build)
export const ICON_KEYS: string[] = Object.keys(ICONS);

// stroke 1.7 currentColor — เท่ากับ `svg.i` ของ mockup.html เป๊ะ (ต่างจาก NavIcon เดิมที่ใช้ 1.6)
export function AccountIcon({ name, className = "h-[18px] w-[18px]" }: { name: string; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`${className} shrink-0`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? FALLBACK }}
    />
  );
}

export default AccountIcon;
