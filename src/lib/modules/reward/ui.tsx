import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { ModuleTabs } from "@/components/module-tabs";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import { SubmitButton } from "@/components/ui/SubmitButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { REWARD_REDEMPTION_STATUS_LABEL } from "@/lib/ui/status-labels";
import {
  listRewards,
  listRedemptions,
  listRewardCustomers,
  resolvePointSystemId,
} from "./service";
import { RedeemForm } from "./forms";
import {
  addRewardAction,
  removeRewardAction,
  fulfillRedemptionAction,
  cancelRedemptionAction,
} from "@/lib/actions/systems";

const muted = "text-[color:var(--color-muted)]";

const fmt = (d: Date) =>
  d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

const statusTone = (s: string): "muted" | "strong" | "danger" =>
  s === "CANCELLED" ? "danger" : s === "FULFILLED" ? "strong" : "muted";

// แท็บฟังก์ชันย่อยของระบบรางวัล (ใช้ทั้งหน้า hub + ทุกหน้าย่อย ให้ตรงกันเสมอ)
// ⚠️ ต้องตรงกับ childrenFor("REWARD") ใน src/app/app/layout.tsx (ตรวจโดย qc-nav-functions.mts)
export function rewardTabs(systemId: string): { href: string; label: string }[] {
  const s = `/app/sys/${systemId}`;
  return [
    { href: s, label: "ภาพรวม" },
    { href: `${s}/reward/rewards`, label: "รายการรางวัล" },
    { href: `${s}/reward/redeem`, label: "แลกรางวัล" },
    { href: `${s}/reward/history`, label: "ประวัติการแลก" },
  ];
}

// ───────────── รายการรางวัล (list + เพิ่ม) ─────────────
export async function RewardListSection({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const allRewards = await listRewards(tenantId, systemId);
  const rewards = allRewards.filter((r) => r.active);

  return (
    <Section title="รายการรางวัล">
      <DataList
        items={rewards.map((r) => ({
          key: r.id,
          primary: `${r.name} · ${r.pointsCost} แต้ม${r.stock !== null ? ` · เหลือ ${r.stock}` : ""}`,
          trailing: (
            <ConfirmDialog
              triggerLabel="ลบ"
              triggerClassName="text-xs text-[color:var(--color-danger)] underline"
              title="ลบรางวัลนี้?"
              detail={`รางวัล "${r.name}" จะถูกลบออกจากระบบแลกแต้ม`}
              confirmLabel="ยืนยันลบ"
              danger
              action={removeRewardAction}
              fields={{ id: r.id, systemId }}
            />
          ),
        }))}
        empty="ยังไม่มีรางวัล — เพิ่มรางวัลด้านล่างให้ลูกค้าแลกแต้ม"
      />
      <form action={addRewardAction} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input type="hidden" name="systemId" value={systemId} />
        <input name="name" required placeholder="ชื่อรางวัล" className="input col-span-2" />
        <input name="pointsCost" type="number" min={1} required placeholder="แต้ม" className="input" />
        <button className="btn btn-ghost text-sm">+ เพิ่ม</button>
      </form>
    </Section>
  );
}

// ───────────── แลกรางวัล (redeem — ฟอร์มแลกอย่างเดียว) ─────────────
export async function RewardRedeemSection({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const [allRewards, customers, pointSystemId] = await Promise.all([
    listRewards(tenantId, systemId),
    listRewardCustomers(tenantId, systemId),
    resolvePointSystemId(tenantId, systemId),
  ]);
  const rewards = allRewards.filter((r) => r.active);
  const canRedeem = rewards.length > 0 && customers.length > 0 && !!pointSystemId;

  return (
    <Section title="แลกรางวัล">
      {canRedeem ? (
        <RedeemForm
          systemId={systemId}
          rewards={rewards.map((r) => ({
            id: r.id,
            name: r.name,
            pointsCost: r.pointsCost,
            stock: r.stock,
          }))}
          customers={customers}
        />
      ) : !pointSystemId ? (
        <EmptyState text="ยังแลกรางวัลไม่ได้ — เชื่อมระบบรางวัลนี้เข้ากับกิจการเดียวกับ 'ระบบแต้ม' ก่อน (ที่การเชื่อมต่อด้านบน)" />
      ) : rewards.length === 0 ? (
        <EmptyState text="ยังไม่มีรางวัลให้แลก — เพิ่มรางวัลที่หน้ารายการรางวัลก่อน" />
      ) : (
        <EmptyState text="ยังไม่มีสมาชิก — ลูกค้าจะเป็นสมาชิกอัตโนมัติเมื่อจอง/ซื้อในกิจการที่เชื่อมไว้ แล้วจึงแลกแต้มได้" />
      )}
    </Section>
  );
}

// ───────────── ประวัติการแลก (history) ─────────────
export async function RewardHistorySection({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const redemptions = await listRedemptions(tenantId, systemId, 30);

  return (
    <Section title="ประวัติการแลก">
        <DataList
          items={redemptions.map((r) => ({
            key: r.id,
            primary: `${r.rewardName} · ${r.customerName}`,
            secondary: `โค้ด ${r.code} · ${r.pointsCost} แต้ม · ${fmt(r.createdAt)}`,
            trailing: (
              <span className="flex flex-col items-end gap-1.5">
                <StatusChip
                  value={r.status}
                  map={REWARD_REDEMPTION_STATUS_LABEL}
                  tone={statusTone(r.status)}
                />
                {r.status === "PENDING" && (
                  <span className="flex items-center gap-2">
                    <form action={fulfillRedemptionAction}>
                      <input type="hidden" name="systemId" value={systemId} />
                      <input type="hidden" name="redemptionId" value={r.id} />
                      <SubmitButton variant="ghost" pendingText="กำลังบันทึก…">
                        รับแล้ว
                      </SubmitButton>
                    </form>
                    <ConfirmDialog
                      triggerLabel="ยกเลิก+คืนแต้ม"
                      triggerClassName="text-xs text-[color:var(--color-danger)] underline"
                      title="ยกเลิกการแลกนี้?"
                      detail={`คืน ${r.pointsCost} แต้มให้ ${r.customerName} และคืนสต็อกรางวัล`}
                      confirmLabel="ยืนยันยกเลิก + คืนแต้ม"
                      danger
                      action={cancelRedemptionAction}
                      fields={{ systemId, redemptionId: r.id }}
                    />
                  </span>
                )}
              </span>
            ),
          }))}
          empty="ยังไม่มีการแลกรางวัล — เมื่อแลกให้สมาชิกแล้ว รายการจะแสดงที่นี่"
        />
    </Section>
  );
}

// ───────────── RewardHub (หน้าภาพรวม ฝังใน /app/sys/[id]) ─────────────
// การ์ดสรุปสั้น + ลิงก์เข้าแต่ละฟังก์ชัน (ไม่ dump ทุก section แล้ว — แตกเป็นหน้าย่อยจริง)
// ⚠️ คง prop เดิม (systemId + tenantId) — dispatch page.tsx ส่ง tenantId มาด้วย
export async function RewardHub({ systemId, tenantId }: { systemId: string; tenantId: string }) {
  const [allRewards, redemptions] = await Promise.all([
    listRewards(tenantId, systemId),
    listRedemptions(tenantId, systemId, 30),
  ]);
  const rewards = allRewards.filter((r) => r.active);

  const cards = [
    {
      href: `/app/sys/${systemId}/reward/rewards`,
      label: "รายการรางวัล",
      value: `${rewards.length} รายการ`,
      desc: "เพิ่ม/ลบรางวัลให้ลูกค้าแลกแต้ม",
    },
    {
      href: `/app/sys/${systemId}/reward/redeem`,
      label: "แลกรางวัล",
      desc: "แลกแต้มให้สมาชิก",
    },
    {
      href: `/app/sys/${systemId}/reward/history`,
      label: "ประวัติการแลก",
      value: `${redemptions.length} รายการ`,
      desc: "รายการแลกล่าสุด + ยืนยันรับของ",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <ModuleTabs items={rewardTabs(systemId)} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card flex min-h-[76px] flex-col gap-1 p-4 transition-colors hover:bg-[color:var(--color-surface-2)]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{c.label}</span>
              {c.value && <span className="text-sm tabular-nums text-[color:var(--color-accent)]">{c.value}</span>}
            </div>
            <span className={`text-xs ${muted}`}>{c.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default RewardHub;
