import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import { fiscalYearOf, getPolicy, type AccountPolicy, type FiscalYear } from "@/lib/modules/account/policy";

// helper ร่วมของหน้ารายงาน (server) — โหลดระบบ + ตรวจสิทธิ์ report.view (§9)
export async function loadReport(id: string) {
  const ctx = await loadAccountSystem(id);
  assertAccountCan(ctx.auth, "account.report.view"); // OWNER/MANAGER — STAFF ต้อง custom
  return ctx;
}

/** periodKey เดือนปัจจุบันตามเวลาไทย ("YYYY-MM") */
export function currentPeriodKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
}

/**
 * WO 8.2 (§9.3) — โหลดระบบ + ตรวจสิทธิ์ + นโยบายบัญชี (ปีบัญชี) ในทีเดียว
 * ทุกหน้ารายงานที่มีช่วงวันที่ต้องใช้ตัวนี้ ไม่งั้นค่าเริ่มต้นจะเป็น "ปีปฏิทิน" ซึ่งผิดสำหรับกิจการ เม.ย.–มี.ค.
 */
export async function loadReportWithPolicy(id: string): Promise<{
  tenantId: string;
  systemId: string;
  policy: AccountPolicy;
}> {
  const ctx = await loadAccountSystem(id);
  assertAccountCan(ctx.auth, "account.report.view");
  const policy = await getPolicy({ tenantId: ctx.tenantId, systemId: ctx.systemId });
  return { tenantId: ctx.tenantId, systemId: ctx.systemId, policy };
}

/**
 * ช่วงเริ่มต้นของรายงานแบบ "ช่วงงวด" = **ตั้งแต่ต้นปีบัญชีถึงเดือนปัจจุบัน**
 * (ของเดิมเป็น "เดือนปัจจุบันเดือนเดียว" ซึ่งอ่านงบกำไรขาดทุนไม่ได้เรื่อง — §9.3 ให้ปีบัญชีเป็นตัวตั้ง)
 * ถ้าเดือนปัจจุบันอยู่นอกรอบ (นาฬิกาเพี้ยน) → ตกกลับเป็นเดือนปัจจุบันเดือนเดียว
 */
export function fiscalDefaultRange(
  policy: Pick<AccountPolicy, "fiscalYearStartMonth">,
  nowKey: string = currentPeriodKey(),
): { from: string; to: string; fy: FiscalYear } {
  const fy = fiscalYearOf(`${nowKey}-01`, policy.fiscalYearStartMonth);
  const from = fy.startKey <= nowKey ? fy.startKey : nowKey;
  const to = nowKey <= fy.endKey ? nowKey : fy.endKey;
  return { from, to, fy };
}

/** เลื่อน periodKey ("YYYY-MM") ไป n เดือน (ลบได้) */
export function shiftKey(key: string, n: number): string {
  const [y, mo] = key.split("-").map(Number);
  const idx = y * 12 + (mo - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export function ReportHeader({
  base,
  title,
  subtitle,
}: {
  base: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="print:mb-4">
      <Link href={`${base}/reports`} className="text-sm text-[color:var(--color-muted)] print:hidden">
        ← งบการเงิน
      </Link>
      <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
      {subtitle && <p className="text-sm text-[color:var(--color-muted)]">{subtitle}</p>}
    </div>
  );
}

/** banner เตือนเมื่อไม่สมดุล/ไม่ reconcile → ลิงก์ไปงบทดลองตรวจ */
export function WarnBanner({ base, children }: { base: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border-2 border-[color:var(--color-danger)] px-4 py-3 text-sm text-[color:var(--color-danger)] print:border-black print:bg-white print:text-black">
      <span className="font-semibold">⚠ ไม่สมดุล — อาจมีบั๊กการลงบัญชี </span>
      {children}{" "}
      <Link href={`${base}/reports/trial-balance`} className="underline">
        ตรวจงบทดลอง
      </Link>
    </div>
  );
}

// ─────────── ตัวช่วยตาราง B&W (scroll แนวนอน + sticky หัวแถว) ───────────

export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  );
}
