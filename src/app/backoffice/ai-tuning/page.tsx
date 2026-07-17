import { requireBackoffice } from "@/lib/platform/actions";
import { listPromptTweaks } from "@/lib/platform/ai-tuning";
import { decidePromptTweakFormAction } from "@/lib/platform/ai-tuning-actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";

// สถานะ → ป้ายไทย
const STATUS_LABEL: Record<string, string> = {
  PENDING: "รอตัดสิน",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ปฏิเสธแล้ว",
};

// หน้าปรับปรุงระบบ AI — แอดมินอนุมัติ/ปฏิเสธคำปรับปรุง prompt ที่ AI เสนอ (ฉีดเข้าทุกร้านเมื่ออนุมัติ)
export default async function AiTuningPage() {
  await requireBackoffice();
  const all = await listPromptTweaks();
  const pending = all.filter((t) => t.status === "PENDING");
  const decided = all.filter((t) => t.status !== "PENDING");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="ปรับปรุงระบบ AI"
        desc="คำปรับปรุงที่ AI เสนอจากบทเรียน — อนุมัติแล้วจะใช้กับผู้ช่วย AI ทุกร้าน"
      />

      <Section title={`รอตัดสิน (${pending.length})`}>
        {pending.length === 0 ? (
          <div className="card py-8 text-center text-sm text-[color:var(--color-muted)]">
            ยังไม่มีคำปรับปรุงที่รอตัดสิน
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pending.map((t) => (
              <div key={t.id} className="card flex flex-col gap-3 p-3">
                <div className="text-sm">{t.content}</div>
                <div className="text-xs text-[color:var(--color-muted)]">เหตุผล: {t.rationale}</div>
                <div className="flex gap-2">
                  <form action={decidePromptTweakFormAction.bind(null, t.id, "APPROVED")}>
                    <button type="submit" className="btn btn-primary text-sm">
                      อนุมัติ
                    </button>
                  </form>
                  <form action={decidePromptTweakFormAction.bind(null, t.id, "REJECTED")}>
                    <button type="submit" className="btn btn-ghost text-sm">
                      ปฏิเสธ
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`ตัดสินแล้ว (${decided.length})`}>
        {decided.length === 0 ? (
          <div className="card py-8 text-center text-sm text-[color:var(--color-muted)]">
            ยังไม่มีรายการที่ตัดสินแล้ว
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {decided.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{t.content}</span>
                <span className="shrink-0 text-xs text-[color:var(--color-muted)]">
                  {STATUS_LABEL[t.status] ?? t.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
