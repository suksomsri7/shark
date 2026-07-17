import { resolveQueueUnit, listOnlineTypes, getPublicOverview } from "@/lib/modules/queue/service";
import { AutoRefresh } from "@/components/queue-auto-refresh";
import { QueuePublicForm } from "@/components/queue-public-form";
import { issuePublicTicketAction } from "./actions";

export const dynamic = "force-dynamic";

// หน้ารับบัตรคิว (public · ไม่ต้องล็อกอิน) — ลูกค้าสแกน QR หน้าร้านแล้วกดรับบัตรจากมือถือ
export default async function PublicQueueIntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string }>;
  searchParams: Promise<{ err?: string; typeId?: string }>;
}) {
  const { tenantSlug, unitSlug } = await params;
  const { err, typeId } = await searchParams;

  const resolved = await resolveQueueUnit(tenantSlug, unitSlug);
  if (!resolved) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">ไม่พบร้านนี้</div>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">
          ลิงก์อาจไม่ถูกต้อง หรือร้านปิดรับคิวอยู่ กรุณาสอบถามที่หน้าร้าน
        </p>
      </main>
    );
  }
  const { tenant, unit } = resolved;
  const ctx = { tenantId: tenant.id, unitId: unit.id };

  const [types, overview] = await Promise.all([
    listOnlineTypes(ctx),
    getPublicOverview(ctx),
  ]);

  const closed = !overview.onlineOpen || types.length === 0;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-8">
      <AutoRefresh ms={20000} />

      <header className="text-center">
        <div className="text-xl font-semibold">{unit.name}</div>
        <div className="text-sm text-[color:var(--color-muted)]">{tenant.name}</div>
      </header>

      {/* สถานะคิวตอนนี้ */}
      <section className="card flex items-center justify-around gap-3 text-center">
        <div>
          <div className="text-xs text-[color:var(--color-muted)]">กำลังเรียก</div>
          <div className="text-2xl font-bold tracking-wider">
            {overview.calling.length ? overview.calling.join(" · ") : "—"}
          </div>
        </div>
        <div className="h-10 w-px bg-[color:var(--color-border,#e5e5e5)]" />
        <div>
          <div className="text-xs text-[color:var(--color-muted)]">คนรออยู่</div>
          <div className="text-2xl font-bold">{overview.waitingCount}</div>
        </div>
      </section>

      {/* รับบัตร */}
      {closed ? (
        <div className="rounded-xl border px-4 py-6 text-center text-sm text-[color:var(--color-muted)]">
          {types.length === 0
            ? "ขณะนี้ยังไม่เปิดให้รับบัตรคิวออนไลน์ กรุณารับบัตรที่หน้าร้าน"
            : "ขณะนี้ร้านปิดรับบัตรคิวออนไลน์ กรุณารับบัตรที่หน้าร้าน"}
        </div>
      ) : (
        <QueuePublicForm
          action={issuePublicTicketAction}
          tenantSlug={tenantSlug}
          unitSlug={unitSlug}
          types={types.map((t) => ({
            id: t.id,
            name: t.name,
            prefix: t.prefix,
            requireContact: t.requireContact,
          }))}
          serverError={err}
          presetTypeId={typeId}
        />
      )}

      <p className="text-center text-xs text-[color:var(--color-muted)]">
        รับบัตรแล้วดูสถานะคิวของคุณได้จากหน้าถัดไป ไม่ต้องต่อแถว
      </p>
    </main>
  );
}
