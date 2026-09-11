// MShell.tsx — ชิ้นส่วนร่วมของหน้าลูกค้า `/m/<slug>/*` (M2.9 · ภาพ 09)
//
// 🔴 ไม่มีอีโมจิ/สัญลักษณ์พิเศษ · ไม่มีสีตายตัว (โทเคนล้วน) · ไอคอนผ่าน MemberIcon เท่านั้น
// 🔴 ออกแบบที่ 390px เป็นหลัก: ทุกกล่องกว้าง 100% · ตัวหนังสือยาวตัดด้วย truncate — ห้ามเลื่อนแนวนอน
import { MemberIcon } from "./MemberIcon";

/** แถบหัวของทุกหน้า (ไอคอนซ้าย · ชื่อหน้า · ไอคอนขวา) */
export function MTopBar({
  title,
  left = "menu",
  right,
}: {
  title: string;
  left?: string;
  right?: string;
}) {
  return (
    <header
      className="flex items-center gap-2 border-b px-4 py-3"
      style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
    >
      <MemberIcon name={left} size="lg" />
      <span className="flex-1 truncate font-semibold" style={{ fontSize: 13.5 }}>
        {title}
      </span>
      {right ? <MemberIcon name={right} /> : null}
    </header>
  );
}

/** หัวข้อย่อยในหน้า (ไอคอนเล็ก + ข้อความ) */
export function MSectionTitle({ icon, children, right }: { icon: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-1" style={{ fontSize: 12.5, fontWeight: 600 }}>
      <MemberIcon name={icon} size="sm" />
      <span className="flex-1 truncate">{children}</span>
      {right}
    </div>
  );
}

/** การ์ดกรอบบาง (พื้นผิว + เส้น hairline) */
export function MCardBox({
  testid,
  children,
  className = "",
}: {
  testid?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      {...(testid ? { "data-testid": testid } : {})}
      className={`rounded-xl border ${className}`}
      style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
    >
      {children}
    </div>
  );
}

export function MMuted({ children, size = 11.5 }: { children: React.ReactNode; size?: number }) {
  return (
    <span className="block truncate" style={{ fontSize: size, color: "var(--color-muted)" }}>
      {children}
    </span>
  );
}

export function MEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 py-3" style={{ fontSize: 12, color: "var(--color-muted)" }}>
      {children}
    </p>
  );
}

/** ฿1,234 (รับค่าเป็นสตางค์) */
export function baht(satang: number): string {
  return (Math.round(satang) / 100).toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

export function thaiDate(d: Date | string | null | undefined): string {
  if (!d) return "ไม่มีกำหนด";
  return new Date(d).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Bangkok" });
}

/** "สมาชิกมา 2 ปี 3 เดือน" */
export function memberSinceText(since: Date | string): string {
  const from = new Date(since).getTime();
  const months = Math.max(0, Math.floor((Date.now() - from) / (30.44 * 24 * 3600_000)));
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y <= 0) return `สมาชิกมา ${m} เดือน`;
  return m > 0 ? `สมาชิกมา ${y} ปี ${m} เดือน` : `สมาชิกมา ${y} ปี`;
}
