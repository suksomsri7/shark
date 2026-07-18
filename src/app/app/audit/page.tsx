import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { listAuditLogs, listAuditActions } from "@/lib/modules/account";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataList } from "@/components/ui/DataList";
import { formatThaiDateTime } from "@/lib/ui/date";

// ประวัติการแก้ไข (WO Wave6-B) — เจ้าของ/ผู้จัดการดูว่าใครทำอะไรเมื่อไหร่ (อ่าน AuditLog ของร้านนี้)
// สิทธิ์ (conservative): เห็นได้เฉพาะ OWNER/MANAGER — STAFF ไม่เห็น (ประวัติทั้งร้าน = ข้อมูลอ่อนไหว)
// ไม่มี mutation → ไม่มี server action (F6 authz ไม่เกี่ยว) · scope tenantId บังคับใน service

const PAGE = 50;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; limit?: string }>;
}) {
  const auth = await requireTenant();
  const role = auth.active.role;
  const canView = role === "OWNER" || role === "MANAGER";

  if (!canView) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <PageHeader title="ประวัติการแก้ไข" desc="ดูว่าใครทำอะไรในร้านเมื่อไหร่" />
        <div className="card py-8 text-center text-sm text-[color:var(--color-muted)]">
          เฉพาะเจ้าของร้าน (OWNER) และผู้จัดการ (MANAGER) เท่านั้นที่ดูประวัติการแก้ไขได้
        </div>
      </div>
    );
  }

  const { action, limit } = await searchParams;
  const take = Math.min(Math.max(Number(limit) || PAGE, PAGE), 200);
  const tenantId = auth.active.tenantId;

  const [{ rows, nextCursor }, actions] = await Promise.all([
    listAuditLogs({ tenantId, action: action || undefined, take }),
    listAuditActions(tenantId),
  ]);

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (action) p.set("action", action);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    const s = p.toString();
    return s ? `/app/audit?${s}` : "/app/audit";
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="ประวัติการแก้ไข"
        desc="บันทึกว่าใครทำอะไรในร้านเมื่อไหร่ — ล่าสุดขึ้นก่อน"
      />

      {/* ตัวกรองตามประเภทการกระทำ (dropdown) — GET form, ไม่ต้องใช้ JS */}
      <form className="flex flex-wrap items-end gap-2" method="get">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[color:var(--color-muted)]">ประเภทการกระทำ</span>
          <select name="action" defaultValue={action ?? ""} className="input min-h-[44px]">
            <option value="">ทั้งหมด</option>
            {actions.map((a) => (
              <option key={a.action} value={a.action}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-ghost min-h-[44px] text-sm">
          กรอง
        </button>
        {action && (
          <Link href="/app/audit" className="btn btn-ghost min-h-[44px] text-sm">
            ล้างตัวกรอง
          </Link>
        )}
      </form>

      <DataList
        items={rows.map((r) => ({
          key: r.id,
          primary: <span className="font-medium">{r.actionLabel}</span>,
          secondary: (
            <>
              {formatThaiDateTime(r.createdAt)} · {r.actorName}
              {r.targetType ? ` · ${r.targetType}` : ""}
              {r.targetId ? ` #${r.targetId.slice(0, 8)}` : ""}
            </>
          ),
        }))}
        empty={
          action
            ? "ไม่พบประวัติสำหรับตัวกรองนี้"
            : "ยังไม่มีประวัติการแก้ไข — เมื่อมีการออกเอกสาร รับเงิน อนุมัติเงินเดือน ฯลฯ จะบันทึกไว้ที่นี่"
        }
      />

      {nextCursor && (
        <div className="flex justify-center">
          <Link href={qs({ limit: String(take + PAGE) })} className="btn btn-ghost text-sm">
            โหลดเพิ่ม
          </Link>
        </div>
      )}
    </div>
  );
}
