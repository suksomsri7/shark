import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBackoffice, logoutAction } from "@/lib/platform/actions";
import {
  listQueue,
  retryJob,
  cancelJob,
  costByTenant,
  tenantsAtAssistCap,
  moneyOfMicro,
} from "@/lib/platform/secretary-ops";
import { thbPerUsd } from "@/lib/ai/topup";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatThaiDateTime } from "@/lib/ui/date";
import AutoRefresh from "./AutoRefresh";

// S2.23 (จอ G5) — คิวเลขาของทุกร้าน: การ์ด กำลังรัน/รอคิว/ล้มเหลว 24 ชม./ต้นทุนวันนี้ · งานค้าง/ล้ม + ลองใหม่/ยกเลิก/เปิดห้อง ·
//   ต้นทุนต่อร้าน วันนี้/7 วัน · ร้านที่ถึงเพดาน assist วันนี้ · รีเฟรชเอง 30 วิ · SUPER_ADMIN/SUPPORT เท่านั้น
export const dynamic = "force-dynamic";

const ROLES = ["SUPER_ADMIN", "SUPPORT"] as const;
const JOB_LABEL: Record<string, string> = { QUEUED: "รอคิว", RUNNING: "lease หมด", FAILED: "ล้มเหลว" };

function Card({ value, label, danger }: { value: string; label: string; danger?: boolean }) {
  return (
    <div className="card p-3">
      <div className="text-2xl font-semibold" style={danger ? { color: "var(--color-danger)" } : undefined}>
        {value}
      </div>
      <div className="text-xs text-[color:var(--color-muted)]">{label}</div>
    </div>
  );
}

export default async function SecretaryQueuePage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const me = await requireBackoffice([...ROLES]);
  const sp = await searchParams;
  const [q, today, week, capped] = await Promise.all([
    listQueue(me),
    costByTenant(me, 1),
    costByTenant(me, 7),
    tenantsAtAssistCap(me),
  ]);
  const rate = thbPerUsd();
  const todayOf = new Map(today.map((r) => [r.tenantId, r.costMicro]));
  const weekTotal = week.reduce((s, r) => s + r.costMicro, 0);
  const rows = week.slice(0, 30);

  async function retryAction(formData: FormData) {
    "use server";
    const pu = await requireBackoffice([...ROLES]);
    const r = await retryJob(pu, String(formData.get("jobId") ?? ""));
    revalidatePath("/backoffice/secretary");
    redirect(`/backoffice/secretary?msg=${encodeURIComponent(r.note)}`);
  }
  async function cancelAction(formData: FormData) {
    "use server";
    const pu = await requireBackoffice([...ROLES]);
    const r = await cancelJob(pu, String(formData.get("jobId") ?? ""));
    revalidatePath("/backoffice/secretary");
    redirect(`/backoffice/secretary?msg=${encodeURIComponent(r.note)}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="คิวเลขา"
        back={{ href: "/backoffice", label: "ภาพรวมแพลตฟอร์ม" }}
        desc={<AutoRefresh seconds={30} />}
        actions={
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost text-sm">
              ออกจากระบบ
            </button>
          </form>
        }
      />
      {sp.msg && (
        <p className="card p-3 text-sm" role="status">
          {String(sp.msg).slice(0, 200)}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3" data-testid="queue-cards">
        <Card value={q.running.toLocaleString("th-TH")} label="กำลังรัน" />
        <Card value={q.queued.toLocaleString("th-TH")} label="รอคิว" />
        <Card value={q.failed.toLocaleString("th-TH")} label="ล้มเหลว 24 ชม." danger={q.failed > 0} />
        <Card value={moneyOfMicro(q.costTodayMicro, rate)} label="ต้นทุนวันนี้ (ทุกร้าน)" />
      </div>

      <Section title={`ค้าง/ล้มเหลว (${q.items.length})`}>
        {q.items.length === 0 ? (
          <div className="card py-8 text-center text-sm text-[color:var(--color-muted)]">ไม่มีงานค้างหรือล้มเหลว</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {q.items.map((j) => (
              <li key={j.id} className="card flex flex-col gap-2 p-3" data-testid={`queue-item-${j.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {j.roomTitle} <span className="text-xs text-[color:var(--color-muted)]">ห้อง #{j.roomId.slice(-4)}</span>
                    </div>
                    <div className="truncate text-xs text-[color:var(--color-muted)]">
                      {j.tenantName} · ค้าง {j.ageMin.toLocaleString("th-TH")} นาที · ลอง {j.attempts} ครั้ง
                      {j.error ? ` · ${j.error}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-[color:var(--color-muted)]">{formatThaiDateTime(j.updatedAt)}</span>
                    <StatusChip value={j.status} map={JOB_LABEL} tone={j.status === "FAILED" ? "danger" : undefined} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {j.status === "FAILED" && (
                    <form action={retryAction}>
                      <input type="hidden" name="jobId" value={j.id} />
                      <button type="submit" className="btn btn-ghost text-sm" data-testid={`queue-retry-${j.id}`}>
                        ลองใหม่
                      </button>
                    </form>
                  )}
                  {j.status === "QUEUED" && (
                    <form action={cancelAction}>
                      <input type="hidden" name="jobId" value={j.id} />
                      <button type="submit" className="btn btn-ghost text-sm" data-testid={`queue-cancel-${j.id}`}>
                        ยกเลิกงาน
                      </button>
                    </form>
                  )}
                  <Link href={`/backoffice/secretary/rooms/${j.roomId}`} className="btn btn-primary text-sm">
                    เปิดห้อง (อ่านอย่างเดียว)
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`ต้นทุนต่อร้าน · วันนี้ / 7 วัน (รวม 7 วัน ${moneyOfMicro(weekTotal, rate)})`}>
        {rows.length === 0 ? (
          <div className="card py-6 text-center text-sm text-[color:var(--color-muted)]">ยังไม่มีการใช้ใน 7 วัน</div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm" data-testid="cost-table">
              <thead>
                <tr className="text-left text-xs text-[color:var(--color-muted)]">
                  <th className="px-3 py-2 font-normal">ร้าน</th>
                  <th className="px-3 py-2 text-right font-normal">งาน 7 วัน</th>
                  <th className="px-3 py-2 text-right font-normal">วันนี้</th>
                  <th className="px-3 py-2 text-right font-normal">7 วัน</th>
                  <th className="px-3 py-2 text-right font-normal">สัดส่วน</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.tenantId} className="border-t border-[color:var(--color-line)]">
                    <td className="px-3 py-2">
                      {r.tenantId.startsWith("__") ? (
                        r.tenantName
                      ) : (
                        <Link href={`/backoffice/tenants/${r.tenantId}`}>{r.tenantName}</Link>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{r.jobs.toLocaleString("th-TH")}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{moneyOfMicro(todayOf.get(r.tenantId) ?? 0, rate)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{moneyOfMicro(r.costMicro, rate)}</td>
                    <td className="px-3 py-2 text-right">
                      {weekTotal > 0 ? Math.round((r.costMicro / weekTotal) * 100) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={`ร้านที่ถึงเพดานผู้ช่วย AI วันนี้ (${capped.length})`}>
        {capped.length === 0 ? (
          <div className="card py-6 text-center text-sm text-[color:var(--color-muted)]">ยังไม่มีร้านถึงเพดานวันนี้</div>
        ) : (
          <div className="flex flex-col gap-2">
            {capped.map((r) => (
              <div key={r.tenantId} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <Link href={`/backoffice/tenants/${r.tenantId}`}>{r.tenantName}</Link>
                <span className="text-xs text-[color:var(--color-muted)]">
                  {moneyOfMicro(r.usedMicro, rate)} / เพดาน {moneyOfMicro(r.capMicro, rate)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
