import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { dormAccess, terminationNotice } from "@/lib/modules/dorm";

// SVC D.11 ▸ หนังสือบอกเลิกสัญญาเช่าจากแม่แบบ (พิมพ์ A4 · ไม่ส่งข้อความ) — ด่านเดียวกับหน้าค้างชำระ (requireUnit · DORM · dormAccess(...) board + money)
//   ข้อมูลผ่าน facade `terminationNotice` เท่านั้น (สิทธิ์จัดการสัญญา + ตรวจคำต้องห้ามบนข้อความที่ render แล้วอยู่ใน facade) · ไม่มีเบอร์โทร
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "2026-10" ⇒ "ต.ค. 2569" (L8) */
const thMonth = (p: string): string => {
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  return m ? `${TH_MONTHS[Number(m[2]) - 1] ?? ""} ${Number(m[1]) + 543}` : p;
};
const baht = (satang: number): string => {
  const a = Math.abs(satang);
  return `${Math.trunc(a / 100).toLocaleString("en-US")}.${String(a % 100).padStart(2, "0")}`;
};

export default async function DormTerminationNoticePage({ params }: { params: Promise<{ unitSlug: string; leaseId: string }> }) {
  const { unitSlug, leaseId } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") notFound();
  const membership = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  const access = dormAccess(membership, unit.id);
  if (!access.board || !access.money) notFound();
  const r = await terminationNotice({ tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, { unitId: unit.id, leaseId });
  if (!r.ok && r.code === "NOT_FOUND") notFound();

  if (!r.ok) {
    return (
      <div data-termination-notice="" data-status={r.code} className="mx-auto flex w-full max-w-[210mm] flex-col gap-3 p-6 text-sm">
        <p className="rounded-2xl border border-[color:var(--color-line)] p-4">{r.reason}</p>
        <a href={`/app/u/${unitSlug}/dorm/overdue`} className="underline">
          กลับหน้าค้างชำระ
        </a>
      </div>
    );
  }
  return (
    <div data-termination-notice={leaseId} className="mx-auto flex w-full max-w-[210mm] flex-col gap-4 bg-white p-8 text-[14px] leading-relaxed text-black print:p-0">
      <style>{"@page { size: A4; margin: 18mm }"}</style>
      <div className="whitespace-pre-wrap">{r.textTh}</div>
      <table className="w-full border-t pt-2 text-[13px]">
        <tbody>
          {r.overdue.map((o) => (
            <tr key={o.billId} className="border-b border-dashed">
              <td className="py-1">{`งวด ${thMonth(o.periodKey)}`}</td>
              <td className="py-1 text-right tabular-nums">{`฿${baht(o.outstandingSatang)}`}</td>
            </tr>
          ))}
          <tr className="font-bold">
            <td className="py-1">รวมยอดค้าง</td>
            <td className="py-1 text-right tabular-nums">{`฿${baht(r.totalOutstandingSatang)}`}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-gray-600 print:hidden">พิมพ์จากเบราว์เซอร์ (Ctrl/⌘ + P) — หนังสือนี้ไม่ถูกส่งถึงผู้เช่าทางข้อความ</p>
    </div>
  );
}
