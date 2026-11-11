import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { leaseAccess, leaseContract } from "@/lib/modules/dorm";

// SVC D.5 ▸ หน้าพิมพ์สัญญา — HTML ล้วนจากข้อความที่ล็อกไว้ตอนทำสัญญา (leaseContract อ่าน policySnapshot.contract · ไม่ render ใหม่จากค่าตั้งปัจจุบัน)
//   "พิมพ์ PDF" = คำสั่งพิมพ์ของเบราว์เซอร์ (Ctrl+P / ⌘P → บันทึกเป็น PDF) · ไม่มีไลบรารี PDF ในโปรเจกต์
//   ด่าน: requireUnit · หน่วย "DORM" · leaseAccess(...).view ไม่ผ่าน ⇒ 404 · สัญญาไม่ใช่ของหน่วย/ไม่มีข้อความ ⇒ 404
export default async function DormLeasePrintPage({ params }: { params: Promise<{ unitSlug: string; leaseId: string }> }) {
  const { unitSlug, leaseId } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") notFound();
  const membership = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  if (!leaseAccess(membership, unit.id).view) notFound();
  const c = await leaseContract({ tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, { unitId: unit.id, leaseId });
  if (!c.ok) notFound();

  return (
    <article className="mx-auto flex w-full max-w-[210mm] min-w-0 flex-col gap-4 bg-[color:var(--color-surface)] p-6 print:p-0">
      <header className="flex flex-wrap items-baseline justify-between gap-2 print:hidden">
        <a href={`/app/u/${unitSlug}/dorm/tenants?lease=${leaseId}`} className="text-xs text-[color:var(--color-muted)]">← กลับ</a>
        <p className="text-xs text-[color:var(--color-muted)]">กด Ctrl+P (หรือ ⌘P) แล้วเลือก &quot;บันทึกเป็น PDF&quot; เพื่อพิมพ์หรือเก็บเป็นไฟล์</p>
      </header>
      <p className="text-right text-xs">{`เลขที่สัญญา ${c.leaseNo}`}</p>
      <div className="whitespace-pre-wrap break-words text-[15px] leading-7">{c.textTh}</div>
      <footer className="mt-10 grid grid-cols-2 gap-8 text-sm">
        <p className="border-t border-[color:var(--color-ink)] pt-2 text-center">ลงชื่อ ผู้ให้เช่า</p>
        <p className="border-t border-[color:var(--color-ink)] pt-2 text-center">ลงชื่อ ผู้เช่า</p>
      </footer>
    </article>
  );
}
