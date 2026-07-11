import { notFound } from "next/navigation";
import { resolveQueueUnit, getDisplaySnapshot } from "@/lib/modules/queue/service";
import { AutoRefresh } from "@/components/queue-auto-refresh";

export const dynamic = "force-dynamic";

// จอแสดงคิวสาธารณะ (TV) — ไม่ต้องล็อกอิน · เลขคิวเท่านั้น ไม่มีชื่อ/เบอร์ลูกค้า
export default async function QueueDisplayPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string; displayToken: string }>;
}) {
  const { tenantSlug, unitSlug, displayToken } = await params;
  const resolved = await resolveQueueUnit(tenantSlug, unitSlug);
  if (!resolved) notFound();
  const snap = await getDisplaySnapshot(resolved.unit.id, displayToken);

  if (!snap) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-black text-white">
        <div className="text-2xl font-semibold">ลิงก์จอไม่ถูกต้องหรือถูกยกเลิก</div>
        <div className="text-sm text-white/60">กรุณาติดต่อร้าน</div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-black text-white">
      <AutoRefresh ms={4000} />
      <header className="flex items-center justify-between px-8 py-5">
        <div className="text-xl font-semibold">{resolved.unit.name}</div>
        <div className="text-sm text-white/50">{resolved.tenant.name}</div>
      </header>

      {/* กำลังเรียก ต่อเคาน์เตอร์ */}
      <section className="flex flex-1 flex-col justify-center px-8">
        {snap.perCounter.length === 0 ? (
          <div className="text-center text-2xl text-white/50">ยังไม่มีเคาน์เตอร์เปิด</div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {snap.perCounter.map((c) => (
              <div
                key={c.counterCode}
                className="flex flex-col items-center justify-center rounded-2xl border border-white/20 py-10"
              >
                <div className="text-lg text-white/60">{c.counterName}</div>
                <div className="mt-2 text-7xl font-bold tracking-widest">{c.number ?? "—"}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* คิวถัดไป */}
      <footer className="border-t border-white/15 px-8 py-6">
        <div className="mb-3 flex items-center justify-between text-sm text-white/50">
          <span>คิวถัดไป</span>
          <span>รอทั้งหมด {snap.waitingCount} คิว</span>
        </div>
        {snap.next.length === 0 ? (
          <div className="text-white/40">— ไม่มีคิวรอ —</div>
        ) : (
          <div className="flex flex-wrap gap-4">
            {snap.next.map((n) => (
              <span key={n} className="rounded-xl border border-white/20 px-5 py-2 text-3xl font-semibold tracking-wider">
                {n}
              </span>
            ))}
          </div>
        )}
      </footer>
    </main>
  );
}
