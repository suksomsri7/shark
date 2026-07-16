import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { listNotifications } from "@/lib/automation/service";
import { markReadAction } from "@/lib/automation/actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatThaiDateTime } from "@/lib/ui/date";

// ศูนย์แจ้งเตือนในแอป (WO-0026) — ปลายทางของ action NOTIFY + ปุ่มอ่านแล้ว
export default async function NotificationsPage() {
  const auth = await requireTenant();
  const items = await listNotifications({ tenantId: auth.active.tenantId });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="ศูนย์แจ้งเตือน"
        back={{ href: "/app", label: "หน้าหลัก" }}
        desc="แจ้งเตือนที่เกิดจากกติกาอัตโนมัติของร้าน"
        actions={
          <Link href="/app/settings/automation" className="btn btn-ghost text-sm">
            ตั้งค่ากติกา
          </Link>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          text="ยังไม่มีการแจ้งเตือน — ตั้งกติกาอัตโนมัติเพื่อให้ระบบเตือนคุณเมื่อเกิดเหตุการณ์สำคัญ"
          action={{ href: "/app/settings/automation", label: "+ ตั้งกติกา" }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((n) => (
            <div
              key={n.id}
              className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`truncate ${n.readAt ? "" : "font-medium"}`}>{n.title}</span>
                  {!n.readAt && (
                    <StatusChip value="new" map={{ new: "ใหม่" }} tone="strong" />
                  )}
                </div>
                <div className="truncate text-xs text-[color:var(--color-muted)]">{n.body}</div>
                <div className="text-xs text-[color:var(--color-muted)]">
                  {formatThaiDateTime(n.createdAt)}
                </div>
              </div>
              {!n.readAt && (
                <form action={markReadAction} className="shrink-0">
                  <input type="hidden" name="id" value={n.id} />
                  <button type="submit" className="btn-sm">
                    อ่านแล้ว
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
