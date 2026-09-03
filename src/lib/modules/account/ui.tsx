import Link from "next/link";
import type { AccountDocStatus } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { StatusChip } from "@/components/ui/StatusChip";
import { MoneyText } from "@/components/ui/MoneyText";
import { DataList } from "@/components/ui/DataList";
import { ACCOUNT_NAV } from "./nav";
import {
  overviewStats,
  getSettings,
  DOC_LABEL,
  STATUS_LABEL,
  isOverdue,
} from "./service";
import { EXP_DOC_LABEL, EXP_ROUTE, payableStats } from "./expense";

// โทนสีสถานะบัญชี: อยู่ระหว่างทาง=muted · สำเร็จ/มีผล=strong · เสีย/ยกเลิก=danger
export function accountTone(status: string): "muted" | "strong" | "danger" {
  if (status === "REJECTED" || status === "VOIDED" || status === "CANCELLED") return "danger";
  if (
    status === "PAID" ||
    status === "ACCEPTED" ||
    status === "ISSUED" ||
    status === "APPROVED" ||
    status === "RECEIVED" ||
    status === "DEDUCTED"
  )
    return "strong";
  return "muted";
}

// ป้ายสถานะเอกสารบัญชี (ผ่าน StatusChip กลาง) — overdue = แดง "พ้นกำหนด"
export function StatusBadge({
  status,
  overdue,
}: {
  status: AccountDocStatus;
  overdue?: boolean;
}) {
  if (overdue) return <StatusChip value="พ้นกำหนด" tone="danger" />;
  return <StatusChip value={status} map={STATUS_LABEL} toneOf={accountTone} />;
}

// เนื้อหาระบบบัญชี (หน้า hub ใน /app/sys/[id]) — การ์ดสรุป + การ์ดหมวด 8 ใบ + เอกสารล่าสุด
export async function AccountContent({
  systemId,
  tenantId,
}: {
  systemId: string;
  tenantId: string;
}) {
  const base = `/app/sys/${systemId}/account`;
  const [stats, payStats, settings, recent] = await Promise.all([
    overviewStats(tenantId, systemId),
    // WO 1.2: ฝั่งจ่ายมีตัวเลขอยู่แล้วใน expense.payableStats แต่เดิมไม่มีหน้าไหนเรียก (INVENTORY §D.1)
    payableStats(tenantId, systemId),
    getSettings(tenantId, systemId),
    prisma.accountDocument.findMany({
      where: { tenantId, systemId },
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: { contact: true },
    }),
  ]);

  const needsSetup = !settings.orgName;
  // พ้นกำหนดรวมสองฝั่ง: ลูกหนี้ (overviewStats) + เจ้าหนี้ (payableStats)
  const overdueCount = stats.overdueCount + payStats.overdueCount;
  const overdueAmount = stats.overdueAmount + payStats.overdueAmount;
  const nav = ACCOUNT_NAV(base, settings.vatRegistered);

  return (
    <section className="flex flex-col gap-6">
      {/* h1 หน้าหลัก — เดิมหน้านี้ไม่มี h1 เลย (visual QC WO 0.4 รอบ 2 จับได้ว่า probe.h1="") ตาม f1 */}
      <h1 className="text-2xl font-semibold">หน้าหลัก</h1>
      {needsSetup && (
        <div className="card flex items-center justify-between gap-3 text-sm">
          <span className="text-[color:var(--color-muted)]">
            ตั้งค่าข้อมูลกิจการ (ชื่อ / เลขผู้เสียภาษี / VAT) ก่อนออกเอกสารจริง
          </span>
          <Link href={`${base}/settings`} className="btn btn-primary text-sm whitespace-nowrap">
            ตั้งค่ากิจการ
          </Link>
        </div>
      )}

      {/* การ์ดสรุป — "พ้นกำหนด" นับรวมสองฝั่ง (รับ+จ่าย) ตาม WO 1.2 · โครงการ์ดเดิม (WO 2.2 ค่อยออกแบบใหม่) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="ค้างรับ (ลูกหนี้)" value={<MoneyText satang={stats.receivable} />} />
        <StatCard
          testId="kpi-payable"
          label="ค้างจ่าย (เจ้าหนี้)"
          value={`${payStats.openCount} ใบ`}
          sub={<MoneyText satang={payStats.payable} />}
        />
        <StatCard
          testId="kpi-overdue"
          label="พ้นกำหนด (รับ+จ่าย)"
          value={`${overdueCount} ใบ`}
          sub={
            <>
              <MoneyText satang={overdueAmount} /> · รับ {stats.overdueCount} · จ่าย {payStats.overdueCount}
            </>
          }
          danger={overdueCount > 0}
        />
        <StatCard label="เอกสารทั้งหมด" value={`${stats.docCount}`} />
        <StatCard label="ผู้ติดต่อ" value={`${stats.contactCount}`} />
      </div>

      {/* ปุ่มหลัก */}
      <div className="flex flex-wrap gap-2">
        <Link href={`${base}/docs/QUOTATION`} className="btn btn-primary text-sm">
          + สร้างใบเสนอราคา
        </Link>
        <Link href={`${base}/expense`} className="btn btn-ghost text-sm">
          + บันทึกค่าใช้จ่าย
        </Link>
      </div>

      {/* WO 0.4 Shell V2: เมนูทั้งชุด (9 หมวด) อยู่ในแถบเมนูบัญชีเหนือหน้านี้แล้ว (ทั้งเดสก์ท็อป/มือถือ)
          — หน้าแรกไม่ต้องเป็นลิสต์ยาวอีก เหลือไว้เฉพาะทางลัดที่ใช้บ่อยจริง ๆ ให้กดถึงใน 1 ครั้ง */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">ใช้บ่อย</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SHORTCUTS(base).map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className="rounded-xl border p-3 text-sm hover:bg-[color:var(--color-surface-2)]"
            >
              {it.label}
            </Link>
          ))}
        </div>
        <p className="text-xs text-[color:var(--color-muted)]">
          เมนูบัญชีทั้งหมด ({nav.reduce((n, g) => n + g.items.length, 0)} รายการ) อยู่ในแถบเมนูด้านบน
        </p>
      </div>

      {/* เอกสารล่าสุด */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">เอกสารล่าสุด</h2>
        <DataList
          items={recent.map((d) => ({
            key: d.id,
            href: `${base}/${docHref(d.docType, d.id)}`,
            // DOC_LABEL ครอบฝั่งรายรับ (8 ชนิด) · EXP_DOC_LABEL ครอบฝั่งรายจ่าย (PURCHASE/EXPENSE/PO/…)
            // ก่อนแก้ตรงนี้เคยโชว์ enum ดิบ "PURCHASE"/"EXPENSE" ตรง ๆ เมื่อรายการล่าสุดมีเอกสารฝั่งรายจ่าย
            primary: `${d.docNo ?? "(ร่าง)"} · ${DOC_LABEL[d.docType] ?? EXP_DOC_LABEL[d.docType] ?? d.docType}`,
            secondary: d.contact?.name ?? "ไม่ระบุผู้ติดต่อ",
            trailing: (
              <>
                <MoneyText satang={d.grandTotal} />
                <StatusBadge status={d.status} overdue={isOverdue(d)} />
              </>
            ),
          }))}
          empty="ยังไม่มีเอกสาร — เริ่มด้วยการสร้างใบเสนอราคาหรือบันทึกค่าใช้จ่าย"
        />
      </div>
    </section>
  );
}

// route จริงของเอกสารแต่ละชนิด — ฝั่งรายรับ 8 ชนิดอยู่ใต้ docs/<docType>/<id> (generic list route)
// ฝั่งรายจ่ายแยก slug ต่อชนิด (purchase/expense/po/asset-buy) ไม่มี docs/<docType> รองรับ (จะ 404)
// WO 1.2: ทะเบียนกลาง EXPENSE_LIST_TYPES (expense.ts) ที่เดียว
const EXP_SLUG: Partial<Record<string, string>> = EXP_ROUTE;
function docHref(docType: string, id: string): string {
  const slug = EXP_SLUG[docType];
  return slug ? `${slug}/${id}` : `docs/${docType}/${id}`;
}

// ทางลัดบนหน้าแรก — เลือกจาก "งานที่ทำทุกวัน" ไม่ใช่ยกเมนูทั้งชุดมาวาง
function SHORTCUTS(base: string): { href: string; label: string }[] {
  return [
    { href: `${base}/docs/RECEIPT`, label: "ใบเสร็จรับเงิน" },
    { href: `${base}/docs/INVOICE`, label: "ใบแจ้งหนี้" },
    { href: `${base}/expense`, label: "บันทึกค่าใช้จ่าย" },
    { href: `${base}/contacts`, label: "ลูกค้าและผู้ขาย" },
  ];
}

function StatCard({
  label,
  value,
  sub,
  danger,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  danger?: boolean;
  testId?: string;
}) {
  return (
    <div className="rounded-xl border p-3" data-testid={testId}>
      <div className="text-xs text-[color:var(--color-muted)]">{label}</div>
      <div
        className="text-lg font-semibold"
        style={danger ? { color: "var(--color-danger)" } : undefined}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-[color:var(--color-muted)]">{sub}</div>}
    </div>
  );
}
