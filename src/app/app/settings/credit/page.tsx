import { requireTenant } from "@/lib/core/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { AiCreditPanel } from "@/components/ai-credit-panel";
import { CreditHistory } from "@/components/ai-credit-history";
import { ensureWallet, listTxns, usageBySource } from "@/lib/ai/credit";
import { formatUsd, priceOf } from "@/lib/ai/pricing";
import { topUpPacks, thbPerUsd } from "@/lib/ai/topup";
import { beamEnabled } from "@/lib/payment/beam";

// /app/settings/credit — กระเป๋าเครดิตผู้ช่วย AI: ยอดคงเหลือ · เติมเครดิต · เงินหมดไปกับอะไร · ประวัติ
export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  CHAT: "แชทผู้ช่วย AI",
  SCHEDULED: "งานประจำอัตโนมัติ",
  WEEKLY_REPORT: "รายงานธุรกิจรายสัปดาห์",
  DNA_INTERVIEW: "สัมภาษณ์ธุรกิจ",
  AUTO_TITLE: "ตั้งชื่อห้องแชท",
  SUPPORT_DRAFT: "ร่างคำตอบเคส",
  TOPUP: "เติมเครดิต",
  GRANT: "เครดิตต้อนรับ",
  ADJUST: "ปรับโดยแอดมิน",
};

export default async function CreditPage() {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  // ⚠️ ต้องเปิดกระเป๋าให้เสร็จ **ก่อน** อ่านประวัติ — ขนานกันแล้วรายการเครดิตต้อนรับจะยังไม่เกิด
  // ตอน listTxns อ่าน (เจอจากการเรนเดอร์จริงบน prod: ยอดขึ้น $10 แต่ประวัติว่าง)
  const wallet = await ensureWallet(tenantId);
  const [first, bySource] = await Promise.all([
    listTxns(tenantId, { take: 20 }),
    usageBySource(tenantId, 30),
  ]);

  const spent30 = bySource.reduce((s, r) => s + r.spentMicro, 0);
  const packs = topUpPacks();
  const rate = thbPerUsd();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="เครดิตผู้ช่วย AI"
        back={{ href: "/app", label: "หน้าหลัก" }}
        desc="ผู้ช่วย AI คิดค่าใช้จ่ายตามการใช้งานจริง — เติมไว้ล่วงหน้า ใช้เท่าไหร่หักเท่านั้น ไม่หมดอายุ"
      />

      <AiCreditPanel
        balanceUsd={formatUsd(wallet.balanceMicro)}
        balanceMicro={wallet.balanceMicro}
        packs={packs}
        thbPerUsd={rate}
        payEnabled={beamEnabled()}
        isOwner={auth.active.role === "OWNER"}
      />

      {/* เงินหมดไปกับอะไร — คำถามแรกที่เจ้าของร้านถามเสมอ */}
      <section className="card flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">ใช้ไปกับอะไรบ้าง (30 วันล่าสุด)</h2>
          <span className="text-xs tabular-nums text-[color:var(--color-muted)]">
            รวม {formatUsd(spent30)}
          </span>
        </div>
        {bySource.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีการใช้งานในช่วง 30 วันนี้</p>
        ) : (
          <div className="flex flex-col gap-2">
            {bySource.map((r) => {
              const pct = spent30 > 0 ? Math.round((r.spentMicro / spent30) * 100) : 0;
              return (
                <div key={r.source} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{SOURCE_LABEL[r.source] ?? r.source}</span>
                    <span className="shrink-0 tabular-nums text-xs text-[color:var(--color-muted)]">
                      {formatUsd(r.spentMicro)} · {r.calls} ครั้ง
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-surface-2)]">
                    <div
                      className="h-full rounded-full bg-[color:var(--color-accent)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <CreditHistory
        initialRows={first.rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
        initialCursor={first.nextCursor}
        sourceLabels={SOURCE_LABEL}
      />

      {/* ราคาที่ใช้คิดจริง — โปร่งใส ไม่ให้รู้สึกว่าโดนหักลอย ๆ */}
      <section className="card flex flex-col gap-2">
        <h2 className="text-sm font-semibold">อัตราค่าใช้จ่าย</h2>
        <p className="text-xs text-[color:var(--color-muted)]">
          คิดตามจำนวนคำที่ประมวลผลจริง (token) ต่อ 1 ล้าน token · ระบบเลือกโมเดลให้เองตามความยากของงาน
          คำถามสั้น ๆ ใช้ตัวประหยัด งานที่ต้องคิดเยอะใช้ตัวฉลาด
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-[color:var(--color-muted)]">
              <tr>
                <th className="py-1 text-left font-normal">โมเดล</th>
                <th className="py-1 text-right font-normal">ขาเข้า</th>
                <th className="py-1 text-right font-normal">ขาออก</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: "ประหยัด (Haiku)", id: "haiku" },
                { name: "ฉลาด (Sonnet)", id: "sonnet" },
              ].map((m) => {
                const p = priceOf(m.id);
                return (
                  <tr key={m.id} className="border-t">
                    <td className="py-1.5">{m.name}</td>
                    <td className="py-1.5 text-right tabular-nums">${p.inPerM.toFixed(2)}</td>
                    <td className="py-1.5 text-right tabular-nums">${p.outPerM.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
