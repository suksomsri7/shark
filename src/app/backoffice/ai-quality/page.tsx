import Link from "next/link";
import { requireBackoffice } from "@/lib/platform/actions";
import { listCasesForPlatform } from "@/lib/platform/support";
import { formatThaiDateTime } from "@/lib/ui/date";
import { platformFeedbackSummary, platformEvalScore } from "@/lib/platform/ai-quality";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";

// แผงคุณภาพ AI (self-improving item 2) — คะแนนข้อสอบ + สถิติ 👍👎 รวมทุกร้าน
export default async function AiQualityDashboard() {
  const me = await requireBackoffice();
  // SEC S2.16 ▸ เรื่องแจ้ง "เลขาทำผิด" (category secretary_wrong) เข้าคิวคุณภาพอัตโนมัติ — ยังไม่ปิด ใหม่ก่อน ≤ 20 ◂
  const [fb, ev, wrong] = await Promise.all([
    platformFeedbackSummary(),
    platformEvalScore(),
    listCasesForPlatform(me, { category: "secretary_wrong", take: 50 }).then((xs) => xs.filter((c) => c.status !== "RESOLVED").slice(0, 20)),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="คุณภาพผู้ช่วย AI"
        desc="คะแนนข้อสอบเลือกเครื่องมือ + เสียงตอบรับจากทุกร้าน"
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-3">
          <div className="text-xs text-[color:var(--color-muted)]">คะแนนข้อสอบ</div>
          <div className="text-2xl font-semibold">
            {ev.passed.toLocaleString("th-TH")}/{ev.total.toLocaleString("th-TH")}
          </div>
          <div className="text-xs text-[color:var(--color-muted)]">ผ่าน {ev.pct}%</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-[color:var(--color-muted)]">พอใจ (ทุกร้าน)</div>
          <div className="text-2xl font-semibold">{fb.ratePct}%</div>
          <div className="text-xs text-[color:var(--color-muted)]">
            👍 {fb.up.toLocaleString("th-TH")} · 👎 {fb.down.toLocaleString("th-TH")} · รวม{" "}
            {fb.total.toLocaleString("th-TH")}
          </div>
        </div>
      </div>

      <Section title={`เรื่องแจ้ง "เลขาทำผิด" ที่ยังไม่ปิด (${wrong.length})`}>
        {wrong.length === 0 ? (
          <div className="card py-6 text-center text-sm text-[color:var(--color-muted)]">ไม่มีเรื่องค้าง</div>
        ) : (
          <div className="flex flex-col gap-2" data-testid="secretary-wrong-cases">
            {wrong.map((c) => (
              <Link
                key={c.id}
                href={`/backoffice/cases/${c.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate">
                  {c.subject} <span className="text-xs text-[color:var(--color-muted)]">· {c.tenantName}</span>
                </span>
                <span className="shrink-0 text-xs text-[color:var(--color-muted)]">
                  {c.roomId ? "มีห้องงาน · " : ""}
                  {formatThaiDateTime(c.updatedAt)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section title="คำตอบที่ถูกกด 👎 ล่าสุด">
        {fb.recentDown.length === 0 ? (
          <div className="card py-8 text-center text-sm text-[color:var(--color-muted)]">
            ยังไม่มีเสียงตอบรับเชิงลบ — เยี่ยมมาก
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {fb.recentDown.map((d, i) => (
              <div key={i} className="rounded-lg border px-3 py-2 text-sm">
                <div className="font-medium">{d.userText}</div>
                {d.note && (
                  <div className="mt-1 text-xs text-[color:var(--color-muted)]">{d.note}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
