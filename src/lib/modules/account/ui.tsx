import Link from "next/link";
import type { AccountDocStatus, AccountDocType } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import {
  baht,
  overviewStats,
  getSettings,
  DOC_LABEL,
  STATUS_LABEL,
  isOverdue,
  VISIBLE_DOC_TYPES,
} from "./service";

// QC5-A5: โชว์เฉพาะ docType ที่ flow ครบ (ซ่อนมัดจำ/วางบิล/CN/DN) — ใบกำกับภาษี gate ด้วย vatRegistered
function receivableTabs(vatRegistered: boolean): { code: AccountDocType; label: string }[] {
  return VISIBLE_DOC_TYPES.filter((c) => c !== "TAX_INVOICE" || vatRegistered).map((code) => ({
    code,
    label: DOC_LABEL[code] ?? code,
  }));
}

// ป้ายสถานะ B&W
export function StatusBadge({
  status,
  overdue,
}: {
  status: AccountDocStatus;
  overdue?: boolean;
}) {
  const danger = overdue || status === "REJECTED" || status === "VOIDED" || status === "CANCELLED";
  const strong = status === "PAID" || status === "ACCEPTED" || status === "ISSUED";
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-xs"
      style={{
        color: danger ? "var(--color-danger)" : strong ? "var(--color-ink)" : "var(--color-muted)",
        borderColor: danger ? "var(--color-danger)" : "var(--color-line)",
      }}
    >
      {overdue ? "พ้นกำหนด" : STATUS_LABEL[status]}
    </span>
  );
}

// เนื้อหาระบบบัญชี (แสดงใน /app/sys/[id]) — เลียนแบบ RewardContent
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
      take: 12,
      include: { contact: true },
    }),
  ]);

  const needsSetup = !settings.orgName;

  return (
    <section className="flex flex-col gap-4">
      {needsSetup && (
        <div className="card flex items-center justify-between gap-3 text-sm">
          <span className="text-[color:var(--color-muted)]">
            ตั้งค่าข้อมูลกิจการ (ชื่อ/เลขผู้เสียภาษี/VAT) ก่อนออกเอกสารจริง
          </span>
          <Link href={`${base}/settings`} className="btn btn-primary text-sm whitespace-nowrap">
            ตั้งค่ากิจการ
          </Link>
        </div>
      )}

      {/* การ์ดสรุป */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="ค้างรับ" value={`฿${baht(stats.receivable)}`} />
        <StatCard label="พ้นกำหนด" value={`${stats.overdueCount} ใบ`} sub={`฿${baht(stats.overdueAmount)}`} danger={stats.overdueCount > 0} />
        <StatCard label="เอกสารทั้งหมด" value={`${stats.docCount}`} />
        <StatCard label="ผู้ติดต่อ" value={`${stats.contactCount}`} />
      </div>

      {/* เมนูเอกสารรายรับ */}
      <div className="card flex flex-col gap-3">
        <h2 className="text-sm font-medium">รายรับ</h2>
        <div className="flex flex-wrap gap-1.5">
          {receivableTabs(settings.vatRegistered).map((t) => (
            <Link
              key={t.code}
              href={`${base}/docs/${t.code}`}
              className="rounded-full border px-3 py-1 text-xs hover:bg-[color:var(--color-surface-2)]"
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {/* ทางลัด */}
      <div className="flex flex-wrap gap-2">
        <Link href={`${base}/contacts`} className="btn btn-ghost text-sm">ผู้ติดต่อ</Link>
        <Link href={`${base}/settings`} className="btn btn-ghost text-sm">ตั้งค่าเอกสาร</Link>
        <Link href={`${base}/docs/QUOTATION`} className="btn btn-primary text-sm">+ สร้างใบเสนอราคา</Link>
      </div>

      {/* รายจ่าย (P2) */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">รายจ่าย</h2>
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/purchase`} className="btn btn-ghost text-sm">บันทึกซื้อสินค้า</Link>
          <Link href={`${base}/expense`} className="btn btn-ghost text-sm">บันทึกค่าใช้จ่าย</Link>
          <Link href={`${base}/po`} className="btn btn-ghost text-sm">ใบสั่งซื้อ (PO)</Link>
          <Link href={`${base}/asset-buy`} className="btn btn-ghost text-sm">ซื้อสินทรัพย์/ใบกำกับซื้อ</Link>
        </div>
      </div>

      {/* บัญชี & รายงาน (P2/P3) */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">บัญชี · การเงิน · รายงาน</h2>
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/journal`} className="btn btn-ghost text-sm">บัญชีรายวัน</Link>
          <Link href={`${base}/ledger`} className="btn btn-ghost text-sm">แยกประเภท</Link>
          <Link href={`${base}/reports`} className="btn btn-ghost text-sm">งบการเงิน</Link>
          <Link href={`${base}/finance`} className="btn btn-ghost text-sm">บัญชีเงิน</Link>
          <Link href={`${base}/wht`} className="btn btn-ghost text-sm">หัก ณ ที่จ่าย (50 ทวิ)</Link>
          <Link href={`${base}/tax`} className="btn btn-ghost text-sm">ภาษี (ภ.พ.30/ภ.ง.ด.)</Link>
          <Link href={`${base}/products`} className="btn btn-ghost text-sm">สินค้า/บริการ</Link>
          <Link href={`${base}/goods-issue`} className="btn btn-ghost text-sm">เบิกสินค้า</Link>
          <Link href={`${base}/assets`} className="btn btn-ghost text-sm">สินทรัพย์</Link>
        </div>
      </div>

      {/* เอกสารล่าสุด */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">เอกสารล่าสุด</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">
            ยังไม่มีเอกสาร — เริ่มด้วยการสร้างใบเสนอราคาหรือใบแจ้งหนี้
          </p>
        ) : (
          recent.map((d) => (
            <Link
              key={d.id}
              href={`${base}/docs/${d.docType}/${d.id}`}
              className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-[color:var(--color-surface-2)]"
            >
              <div className="flex flex-col">
                <span>
                  {d.docNo ?? "(ร่าง)"} · {DOC_LABEL[d.docType]}
                </span>
                <span className="text-xs text-[color:var(--color-muted)]">
                  {d.contact?.name ?? "ไม่ระบุผู้ติดต่อ"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span>฿{baht(d.grandTotal)}</span>
                <StatusBadge status={d.status} overdue={isOverdue(d)} />
              </div>
            </Link>
          ))
        )}
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
  value: string;
  sub?: string;
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
