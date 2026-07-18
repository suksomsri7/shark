import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import { ModuleTabs } from "@/components/module-tabs";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { StatusChip } from "@/components/ui/StatusChip";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatBaht } from "@/lib/ui/money";
import { listCampaigns, previewAudience, type Ctx } from "./service";
import { createCampaignAction, sendCampaignAction } from "./actions";

const muted = "text-[color:var(--color-muted)]";

// แท็บฟังก์ชันย่อยของระบบการตลาด (ใช้ทั้งหน้า hub + ทุกหน้าย่อย ให้ตรงกันเสมอ)
// ⚠️ ต้องตรงกับ childrenFor("MARKETING") ใน src/app/app/layout.tsx (ตรวจโดย qc-nav-functions.mts)
// หมายเหตุ: ระบบการตลาดมีฟังก์ชันจริงเดียว (แคมเปญ = รายการ + สร้าง + ส่ง) — ไม่ฝืนแตกเกินจริง
export function marketingTabs(systemId: string): { href: string; label: string }[] {
  const s = `/app/sys/${systemId}`;
  return [
    { href: s, label: "ภาพรวม" },
    { href: `${s}/marketing/campaigns`, label: "แคมเปญ" },
  ];
}

// สถานะแคมเปญ (ไทย) — DRAFT/SCHEDULED ระหว่างทาง(เทา) · SENT ส่งแล้ว(ดำ) · CANCELLED ยกเลิก(แดง)
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "ฉบับร่าง",
  SCHEDULED: "ตั้งเวลาไว้",
  SENT: "ส่งแล้ว",
  CANCELLED: "ยกเลิก",
};
const statusTone = (v: string): "muted" | "strong" | "danger" =>
  v === "SENT" ? "strong" : v === "CANCELLED" ? "danger" : "muted";

const CHANNEL_LABEL: Record<string, string> = { LINE: "LINE", EMAIL: "อีเมล", SMS: "SMS" };
const TIER_LABEL: Record<string, string> = {
  MEMBER: "ทั่วไป",
  SILVER: "เงิน",
  GOLD: "ทอง",
  PLATINUM: "แพลทินัม",
};
const TIERS = ["MEMBER", "SILVER", "GOLD", "PLATINUM"];

// สรุปเงื่อนไขเซกเมนต์เป็นข้อความไทยอ่านง่าย
function segmentSummary(raw: unknown): string {
  const s = (raw ?? {}) as { tier?: string; minSpentSatang?: number; inactiveDays?: number };
  const parts: string[] = [];
  if (s.tier) parts.push(`ระดับ ${TIER_LABEL[s.tier] ?? s.tier}`);
  if (s.minSpentSatang != null) parts.push(`ยอดซื้อ ≥ ${formatBaht(s.minSpentSatang)}`);
  if (s.inactiveDays != null) parts.push(`ไม่มาเกิน ${s.inactiveDays} วัน`);
  return parts.length ? parts.join(" · ") : "ลูกค้าทุกคน";
}

// ───────────── แคมเปญ (campaigns) — รายการ + สร้าง + ส่ง ─────────────
export async function MarketingCampaignsSection({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };

  const [campaigns, memberSystems] = await Promise.all([
    listCampaigns(ctx),
    // ระบบสมาชิกของร้าน (ปลายทางที่แคมเปญเล็ง) — AppSystem เป็น tenant-scoped
    tenantDb(ctx).appSystem.findMany({
      where: { type: "MEMBER", active: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // preview audience สำหรับแคมเปญที่ยังไม่ส่ง (คำนวณสด) · ส่งแล้วใช้ audienceCount ที่ freeze
  const previews = await Promise.all(
    campaigns.map((c) =>
      c.status === "SENT"
        ? Promise.resolve({ count: c.audienceCount })
        : previewAudience(ctx, c.id).catch(() => ({ count: 0 })),
    ),
  );
  const previewOf = (id: string) => previews[campaigns.findIndex((c) => c.id === id)]?.count ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {/* รายการแคมเปญ */}
      <Section title={`แคมเปญ (${campaigns.length})`}>
        <DataList
          items={campaigns.map((c) => {
            const audience = previewOf(c.id);
            return {
              key: c.id,
              primary: (
                <span className="flex items-center gap-2">
                  {c.name}
                  <span className={`text-xs ${muted}`}>· {CHANNEL_LABEL[c.channel] ?? c.channel}</span>
                </span>
              ),
              secondary: [
                segmentSummary(c.segmentJson),
                c.status === "SENT"
                  ? `ส่งแล้ว ${audience} ราย`
                  : `กลุ่มเป้าหมายตอนนี้ ${audience} ราย`,
                c.couponCode ? `คูปอง ${c.couponCode}` : null,
              ]
                .filter(Boolean)
                .join(" · "),
              trailing: (
                <>
                  <StatusChip value={c.status} map={STATUS_LABEL} tone={statusTone(c.status)} />
                  {c.status === "DRAFT" &&
                    (audience === 0 ? (
                      <button className="btn-sm" disabled title="ยังไม่มีลูกค้าเข้ากลุ่มเป้าหมาย">
                        ส่ง
                      </button>
                    ) : (
                      <ConfirmDialog
                        triggerLabel="ส่ง"
                        triggerClassName="btn-sm"
                        title="ส่งแคมเปญนี้?"
                        detail={`จะส่งถึงลูกค้า ${audience} ราย — ส่งแล้วยกเลิกไม่ได้`}
                        confirmLabel="ยืนยันส่งแคมเปญ"
                        action={sendCampaignAction}
                        fields={{ systemId, campaignId: c.id }}
                      />
                    ))}
                </>
              ),
            };
          })}
          empty="ยังไม่มีแคมเปญ — สร้างแคมเปญแรกเพื่อส่งโปรถึงกลุ่มลูกค้าที่ต้องการ"
        />
      </Section>

      {/* สร้างแคมเปญใหม่ */}
      <Section title="สร้างแคมเปญ" card>
        {memberSystems.length === 0 ? (
          <p className={`text-sm ${muted}`}>
            ยังไม่มีระบบสมาชิก — เปิดระบบ “สมาชิก” ก่อน แล้วจึงเล็งกลุ่มลูกค้าเพื่อส่งแคมเปญได้
          </p>
        ) : (
          <form action={createCampaignAction} className="flex flex-col gap-3">
            <input type="hidden" name="systemId" value={systemId} />

            <div className="flex flex-wrap items-end gap-2">
              <label className={`flex flex-1 flex-col gap-1 text-xs ${muted}`}>
                ชื่อแคมเปญ
                <input name="name" required placeholder="เช่น โปรลูกค้าแพลทินัม" className="input min-w-0" />
              </label>
              <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                กลุ่มสมาชิก
                <select name="memberSystemId" required className="input" defaultValue={memberSystems[0]?.id}>
                  {memberSystems.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                ช่องทาง
                <select name="channel" className="input" defaultValue="LINE">
                  <option value="LINE">LINE</option>
                  <option value="EMAIL">อีเมล</option>
                  <option value="SMS">SMS</option>
                </select>
              </label>
            </div>

            {/* เงื่อนไขเซกเมนต์ (เว้นว่าง = ไม่กรอง) */}
            <div className="flex flex-wrap items-end gap-2">
              <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                ระดับสมาชิก
                <select name="tier" className="input" defaultValue="">
                  <option value="">ทุกระดับ</option>
                  {TIERS.map((t) => (
                    <option key={t} value={t}>
                      {TIER_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                ยอดซื้อขั้นต่ำ (บาท)
                <input name="minSpentBaht" type="number" min={0} step="1" placeholder="ไม่จำกัด" className="input" />
              </label>
              <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                ไม่มาเกิน (วัน)
                <input name="inactiveDays" type="number" min={0} step="1" placeholder="ไม่จำกัด" className="input" />
              </label>
              <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                คูปองแนบ (ถ้ามี)
                <input name="couponCode" placeholder="เช่น SAVE20" className="input" />
              </label>
            </div>

            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              ข้อความ
              <textarea
                name="message"
                rows={2}
                placeholder="เช่น รับส่วนลด 20% เฉพาะสมาชิกแพลทินัม เดือนนี้เท่านั้น"
                className="input min-w-0"
              />
            </label>

            <div>
              <button className="btn btn-primary text-sm">+ สร้างแคมเปญ (ฉบับร่าง)</button>
            </div>
          </form>
        )}
      </Section>
    </div>
  );
}

// ───────────── MarketingHub (หน้าภาพรวม ฝังใน /app/sys/[id]) ─────────────
// การ์ดสรุปสั้น + ลิงก์เข้าฟังก์ชันแคมเปญ (ระบบมีฟังก์ชันเดียว → hub + 1 หน้าย่อย)
export async function MarketingHub({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };

  const campaigns = await listCampaigns(ctx);
  const sent = campaigns.filter((c) => c.status === "SENT").length;

  const cards = [
    {
      href: `/app/sys/${systemId}/marketing/campaigns`,
      label: "แคมเปญ",
      value: `${campaigns.length} รายการ`,
      desc: sent > 0 ? `ส่งแล้ว ${sent} · สร้าง/ส่งโปรถึงกลุ่มลูกค้า` : "สร้าง/ส่งโปรถึงกลุ่มลูกค้า",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <ModuleTabs items={marketingTabs(systemId)} />
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

export default MarketingHub;
