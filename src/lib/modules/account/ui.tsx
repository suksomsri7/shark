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
  const [stats, settings, recent] = await Promise.all([
    overviewStats(tenantId, systemId),
    getSettings(tenantId, systemId),
    prisma.accountDocument.findMany({
      where: { tenantId, systemId },
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: { contact: true },
    }),
  ]);

  const needsSetup = !settings.orgName;
  const nav = ACCOUNT_NAV(base, settings.vatRegistered);

  return (
    <section className="flex flex-col gap-6">
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

      {/* การ์ดสรุป */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="ค้างรับ" value={<MoneyText satang={stats.receivable} />} />
        <StatCard
          label="พ้นกำหนด"
          value={`${stats.overdueCount} ใบ`}
          sub={<MoneyText satang={stats.overdueAmount} />}
          danger={stats.overdueCount > 0}
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

      {/* การ์ดหมวด 8 ใบ */}
      <div className="grid gap-3 sm:grid-cols-2">
        {nav.map((g) => (
          <div key={g.title} className="card flex flex-col gap-2">
            <h2 className="text-sm font-medium">{g.title}</h2>
            <div className="flex flex-col gap-0.5">
              {g.items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  className="rounded-lg px-2 py-1.5 text-sm text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"
                >
                  {it.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* เอกสารล่าสุด */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">เอกสารล่าสุด</h2>
        <DataList
          items={recent.map((d) => ({
            key: d.id,
            href: `${base}/docs/${d.docType}/${d.id}`,
            primary: `${d.docNo ?? "(ร่าง)"} · ${DOC_LABEL[d.docType] ?? d.docType}`,
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

function StatCard({
  label,
  value,
  sub,
  danger,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border p-3">
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
