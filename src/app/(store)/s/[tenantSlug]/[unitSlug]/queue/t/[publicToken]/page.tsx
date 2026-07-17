import Link from "next/link";
import { resolveQueueUnit, getTicketStatus, getPublicOverview } from "@/lib/modules/queue/service";
import { AutoRefresh } from "@/components/queue-auto-refresh";

export const dynamic = "force-dynamic";

// ป้ายสถานะไทย (ครอบคลุมทุกสถานะ รวม cancelled/no_show ที่ label กลางไม่มี)
const STATUS: Record<string, { label: string; tone: "wait" | "call" | "done" | "gone" }> = {
  WAITING: { label: "รอเรียกคิว", tone: "wait" },
  CALLED: { label: "ถึงคิวคุณแล้ว เชิญที่ช่องบริการ", tone: "call" },
  SERVING: { label: "กำลังให้บริการ", tone: "call" },
  DONE: { label: "เสร็จเรียบร้อยแล้ว", tone: "done" },
  SKIPPED: { label: "คิวถูกข้าม กรุณาติดต่อเจ้าหน้าที่", tone: "gone" },
  NO_SHOW: { label: "ไม่ได้มาตามคิว", tone: "gone" },
  CANCELLED: { label: "คิวนี้ถูกยกเลิกแล้ว", tone: "gone" },
};

// หน้าสถานะบัตรคิวของลูกค้า (public จาก publicToken) — ดูอีกกี่คิวถึงตัว, auto-refresh
export default async function PublicTicketStatusPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string; publicToken: string }>;
}) {
  const { tenantSlug, unitSlug, publicToken } = await params;
  const base = `/s/${tenantSlug}/${unitSlug}/queue`;

  const resolved = await resolveQueueUnit(tenantSlug, unitSlug);
  if (!resolved) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">ไม่พบร้านนี้</div>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">
          ลิงก์อาจไม่ถูกต้อง หรือร้านปิดรับคิวอยู่
        </p>
      </main>
    );
  }
  const { tenant, unit } = resolved;
  const ctx = { tenantId: tenant.id, unitId: unit.id };

  const [status, overview] = await Promise.all([
    getTicketStatus(unit.id, publicToken),
    getPublicOverview(ctx),
  ]);

  // ไม่พบบัตร หรือบัตรของ unit อื่น (getTicketStatus กัน cross-tenant ให้แล้ว) → สุภาพ + ปุ่มรับใหม่
  if (!status) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-4 px-5 py-16 text-center">
        <div className="text-lg font-semibold">ไม่พบบัตรคิวนี้</div>
        <p className="text-sm text-[color:var(--color-muted)]">
          บัตรอาจหมดอายุ หรือเป็นของวันก่อนหน้า กรุณารับบัตรใหม่
        </p>
        <Link href={base} className="btn btn-primary min-h-[48px] w-full max-w-xs text-base">
          รับบัตรคิวใหม่
        </Link>
      </main>
    );
  }

  const { ticket, position, estimateMin } = status;
  const meta = STATUS[ticket.status] ?? { label: ticket.status, tone: "gone" as const };
  const active = ticket.status === "WAITING" || ticket.status === "CALLED" || ticket.status === "SERVING";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-8">
      {active && <AutoRefresh ms={18000} />}

      <header className="text-center">
        <div className="text-base font-semibold">{unit.name}</div>
        <div className="text-xs text-[color:var(--color-muted)]">{tenant.name}</div>
      </header>

      {/* บัตรของฉัน */}
      <section className="card flex flex-col items-center gap-2 py-8 text-center">
        <div className="text-sm text-[color:var(--color-muted)]">หมายเลขคิวของคุณ</div>
        <div className="text-6xl font-bold tracking-widest">{ticket.number}</div>
        <div
          className={`mt-1 rounded-full px-4 py-1 text-sm font-medium ${
            meta.tone === "call"
              ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
              : meta.tone === "gone"
                ? "text-[color:var(--color-danger)]"
                : "text-[color:var(--color-muted)]"
          }`}
        >
          {meta.label}
        </div>
      </section>

      {/* เหลืออีกกี่คิว (เฉพาะตอนรอ) */}
      {ticket.status === "WAITING" && (
        <section className="card flex flex-col items-center gap-1 py-6 text-center">
          <div className="text-sm text-[color:var(--color-muted)]">เหลืออีก</div>
          <div className="text-4xl font-bold">
            {position} <span className="text-lg font-medium">คิว</span>
          </div>
          <div className="text-sm text-[color:var(--color-muted)]">ถึงคิวของคุณ</div>
          {estimateMin != null && (
            <div className="mt-1 text-xs text-[color:var(--color-muted)]">
              โดยประมาณ ~{estimateMin} นาที
            </div>
          )}
        </section>
      )}

      {/* กำลังเรียก (บริบทหน้าร้าน) */}
      {active && (
        <section className="flex items-center justify-around gap-3 rounded-xl border px-4 py-3 text-center">
          <div>
            <div className="text-xs text-[color:var(--color-muted)]">กำลังเรียก</div>
            <div className="text-xl font-semibold tracking-wider">
              {overview.calling.length ? overview.calling.join(" · ") : "—"}
            </div>
          </div>
          <div className="h-8 w-px bg-[color:var(--color-border,#e5e5e5)]" />
          <div>
            <div className="text-xs text-[color:var(--color-muted)]">คนรออยู่</div>
            <div className="text-xl font-semibold">{overview.waitingCount}</div>
          </div>
        </section>
      )}

      {active ? (
        <p className="text-center text-xs text-[color:var(--color-muted)]">
          หน้านี้อัปเดตอัตโนมัติ ไม่ต้องรีเฟรช · เก็บลิงก์นี้ไว้ดูสถานะได้ตลอด
        </p>
      ) : (
        <Link href={base} className="btn btn-primary min-h-[48px] w-full text-base">
          รับบัตรคิวใหม่
        </Link>
      )}
    </main>
  );
}
