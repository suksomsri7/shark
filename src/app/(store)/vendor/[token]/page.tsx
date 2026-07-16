import { getVendorPortalView } from "@/lib/modules/inventory/procurement";
import { MoneyText } from "@/components/ui/MoneyText";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatThaiDate } from "@/lib/ui/date";

export const dynamic = "force-dynamic";

// สถานะใบสั่งซื้อ (ไทย) + โทนสี — สอดคล้องกับฝั่งร้าน
const PO_STATUS: Record<string, string> = {
  DRAFT: "ร่าง",
  ORDERED: "สั่งซื้อแล้ว",
  RECEIVED: "รับของแล้ว",
  CANCELLED: "ยกเลิก",
};
const poTone = (s: string): "muted" | "strong" | "danger" =>
  s === "CANCELLED" ? "danger" : s === "RECEIVED" || s === "ORDERED" ? "strong" : "muted";

// ลิงก์พกพาผู้ขาย /vendor/<token> — ผู้ขายเปิดดูใบสั่งซื้อของตัวเอง read-only (ไม่ต้องล็อกอิน · มือถือ-first)
export default async function VendorPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await getVendorPortalView(token);

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-[color:var(--color-surface-2)] p-6">
      {children}
    </main>
  );

  if (!view) {
    return shell(
      <div className="my-auto text-center">
        <div className="text-xl font-semibold">ไม่พบลิงก์</div>
        <div className="mt-1 text-sm text-[color:var(--color-muted)]">
          ลิงก์นี้อาจถูกปิดหรือไม่ถูกต้อง กรุณาติดต่อร้านเพื่อขอลิงก์ใหม่
        </div>
      </div>,
    );
  }

  const { supplier, pos } = view;
  return shell(
    <>
      <header>
        <div className="text-xs text-[color:var(--color-muted)]">ใบสั่งซื้อสำหรับผู้ขาย</div>
        <h1 className="mt-0.5 text-xl font-bold">{supplier.name}</h1>
      </header>

      {pos.length === 0 ? (
        <div className="rounded-xl border bg-[color:var(--color-surface)] p-6 text-center text-sm text-[color:var(--color-muted)]">
          ยังไม่มีใบสั่งซื้อ
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {pos.map((po) => (
            <div
              key={po.code}
              className="flex items-center justify-between gap-3 rounded-xl border bg-[color:var(--color-surface)] px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium tabular-nums">{po.code}</span>
                  <StatusChip value={po.status} map={PO_STATUS} tone={poTone(po.status)} />
                </div>
                <div className="mt-0.5 text-xs text-[color:var(--color-muted)]">
                  {formatThaiDate(po.createdAt)}
                </div>
              </div>
              <div className="shrink-0 text-right font-medium tabular-nums">
                <MoneyText satang={po.totalSatang} />
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-auto text-center text-[11px] text-[color:var(--color-muted)]">
        ขับเคลื่อนโดย SHARK
      </p>
    </>,
  );
}
