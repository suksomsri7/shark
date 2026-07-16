import { requireTenant } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { StatusChip } from "@/components/ui/StatusChip";
import { listCampaigns, previewAudience, type Ctx } from "./service";
import { createCampaignAction, sendCampaignAction } from "./actions";

const muted = "text-[color:var(--color-muted)]";

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
  if (s.minSpentSatang != null) parts.push(`ยอดซื้อ ≥ ${(s.minSpentSatang / 100).toLocaleString("th-TH")} บาท`);
  if (s.inactiveDays != null) parts.push(`ไม่มาเกิน ${s.inactiveDays} วัน`);
  return parts.length ? parts.join(" · ") : "ลูกค้าทุกคน";
}

// ───────────── MarketingContent (ฝังในหน้า /app/sys/[id]) ─────────────
export async function MarketingContent({ systemId }: { systemId: string }) {
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
                  {c.status === "DRAFT" && (
                    <form action={sendCampaignAction}>
                      <input type="hidden" name="systemId" value={systemId} />
                      <input type="hidden" name="campaignId" value={c.id} />
                      <button
                        className="btn-sm px-3 text-xs"
                        disabled={audience === 0}
                        title={audience === 0 ? "ยังไม่มีลูกค้าเข้ากลุ่มเป้าหมาย" : "ส่งแคมเปญ"}
                      >
                        ส่ง
                      </button>
                    </form>
                  )}
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

export default MarketingContent;
