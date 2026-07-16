import type { OpsLevel } from "@prisma/client";
import { requireBackoffice, logoutAction } from "@/lib/platform/actions";
import { healthSnapshot } from "@/lib/core/ops";
import { listOpsEvents } from "@/lib/platform/ops";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatThaiDateTime } from "@/lib/ui/date";

export const dynamic = "force-dynamic";

// ป้าย level เป็นไทย + โทนสี
const LEVEL_LABEL: Record<string, string> = {
  ERROR: "ผิดพลาด",
  WARN: "เตือน",
  INFO: "ข้อมูล",
};
const levelTone = (v: string) => (v === "ERROR" ? "danger" : v === "WARN" ? "strong" : "muted");

// ตัวกรอง level (แท็บ)
const FILTERS: { value: OpsLevel | "ALL"; label: string }[] = [
  { value: "ALL", label: "ทั้งหมด" },
  { value: "ERROR", label: "ผิดพลาด" },
  { value: "WARN", label: "เตือน" },
  { value: "INFO", label: "ข้อมูล" },
];

const VALID = new Set<OpsLevel>(["ERROR", "WARN", "INFO"]);

// สุขภาพระบบ + เหตุการณ์ล่าสุด (ข้ามทุกร้าน) — requireBackoffice
export default async function SystemHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>;
}) {
  await requireBackoffice();
  const sp = await searchParams;
  const level = VALID.has(sp.level as OpsLevel) ? (sp.level as OpsLevel) : undefined;
  const active = level ?? "ALL";

  const [health, events] = await Promise.all([
    healthSnapshot(),
    listOpsEvents({ level, take: 100 }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="สุขภาพระบบ"
        back={{ href: "/backoffice", label: "ภาพรวมแพลตฟอร์ม" }}
        desc="สถานะฐานข้อมูล งานค้าง และเหตุการณ์ล่าสุดจากทุกร้าน"
        actions={
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost text-sm">
              ออกจากระบบ
            </button>
          </form>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3">
          <div className="text-xs text-[color:var(--color-muted)]">ฐานข้อมูล</div>
          <div
            className="text-2xl font-semibold"
            style={{ color: health.db ? "var(--color-ink)" : "var(--color-danger)" }}
          >
            {health.db ? "ปกติ" : "ล่ม"}
          </div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-[color:var(--color-muted)]">งาน outbox ค้าง</div>
          <div className="text-2xl font-semibold">
            {health.outboxPending.toLocaleString("th-TH")}
          </div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-[color:var(--color-muted)]">ผิดพลาด 24 ชม.</div>
          <div
            className="text-2xl font-semibold"
            style={health.opsErrors24h > 0 ? { color: "var(--color-danger)" } : undefined}
          >
            {health.opsErrors24h.toLocaleString("th-TH")}
          </div>
        </div>
      </div>

      <Section title="เหตุการณ์ล่าสุด">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const isActive = active === f.value;
            const href =
              f.value === "ALL"
                ? "/backoffice/system-health"
                : `/backoffice/system-health?level=${f.value}`;
            return (
              <a
                key={f.value}
                href={href}
                className="rounded-full border px-3 py-1 text-sm"
                style={
                  isActive
                    ? { borderColor: "var(--color-ink)", color: "var(--color-ink)", fontWeight: 600 }
                    : { color: "var(--color-muted)" }
                }
              >
                {f.label}
              </a>
            );
          })}
        </div>

        {events.length === 0 ? (
          <div className="card py-8 text-center text-sm text-[color:var(--color-muted)]">
            ยังไม่มีเหตุการณ์ที่บันทึกไว้
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {events.map((e) => (
              <div key={e.id} className="card flex flex-col gap-1 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StatusChip value={e.level} map={LEVEL_LABEL} toneOf={levelTone} />
                    <span className="text-xs text-[color:var(--color-muted)]">{e.source}</span>
                  </div>
                  <span className="text-xs text-[color:var(--color-muted)] whitespace-nowrap">
                    {formatThaiDateTime(e.createdAt)}
                  </span>
                </div>
                <div className="text-sm">{e.message}</div>
                {e.detail && (
                  <pre className="overflow-x-auto rounded bg-[color:var(--color-line)]/30 p-2 text-xs whitespace-pre-wrap text-[color:var(--color-muted)]">
                    {e.detail}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
