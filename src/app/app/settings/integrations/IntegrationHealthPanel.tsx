"use client";
// IntegrationHealthPanel.tsx — แผงสุขภาพตัวต่อ (SVC C.3 §4 · ภาพ จอง 10 = หอ 11 ส่วน "สถานะ/ผลเรียกล่าสุด")
// 🔴 client: รับ DTO สุขภาพที่ไม่มีค่าลับผ่าน props · import type เท่านั้น · กราฟเล็กเป็น SVG ล้วน (ไม่ใช้ไลบรารีกราฟ)
// 🔴 ข้อความที่เห็นเป็นไทยทั้งหมด — ไม่แสดงรหัสอังกฤษของผล (หมดเวลา/ผู้ให้บริการขัดข้อง/โควตาหมด/ยังไม่พร้อม)
import type { CallCode, IntegrationHealthCall, IntegrationHealthView } from "@/lib/core/integrations/types";

type Props = { health: IntegrationHealthView; thresholdPercent: number };

const STATUS_TEXT: Record<string, string> = { CONNECTED: "เชื่อมแล้ว", ERROR: "ขัดข้อง", DRAFT: "ยังไม่ทดสอบ", DISABLED: "ถอดแล้ว" };
const CODE_TEXT: Record<CallCode, string> = { TIMEOUT: "หมดเวลา", PROVIDER_ERROR: "ผู้ให้บริการขัดข้อง", QUOTA: "โควตาหมด", NOT_READY: "ยังไม่พร้อม" };
const OP_TEXT: Record<string, string> = { test: "ทดสอบ", quota: "อ่านโควตา", verify: "ตรวจสลิป", send: "ส่งข้อความ" };
const FALLBACK_TEXT: Record<string, string> = { MANUAL: "ส่งเข้าคิวตรวจมือ", REJECT: "ปฏิเสธรายการ" };

const TIME_FMT = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtTime = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : TIME_FMT.format(d);
};
const callText = (c: IntegrationHealthCall) => (c.ok ? "สำเร็จ" : c.code ? CODE_TEXT[c.code] ?? "ไม่สำเร็จ" : "ไม่สำเร็จ");
const opText = (op: string) => OP_TEXT[op] ?? "เรียกผู้ให้บริการ";

const CHART_W = 280;
const CHART_H = 56;

export default function IntegrationHealthPanel({ health, thresholdPercent }: Props) {
  const q = health.quota;
  const max = Math.max(1, ...health.daily.map((d) => d.ok + d.fail));
  const slot = CHART_W / Math.max(1, health.daily.length);
  const barW = Math.max(4, slot - 4);
  const total = health.daily.reduce((a, d) => a + d.ok + d.fail, 0);
  const fails = health.daily.reduce((a, d) => a + d.fail, 0);
  return (
    <section className="flex flex-col gap-4 rounded-2xl border p-4 text-sm" data-testid="integration-health" data-status={health.status}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">สุขภาพการเชื่อมต่อ</h3>
        <span className={`text-xs font-medium ${health.status === "ERROR" ? "text-red-700" : "text-[color:var(--color-muted)]"}`}>{STATUS_TEXT[health.status] ?? "ไม่ทราบสถานะ"}</span>
      </div>
      <div className="text-xs text-[color:var(--color-muted)]">
        เมื่อผู้ให้บริการไม่ตอบ: {FALLBACK_TEXT[health.onFailure] ?? "ส่งเข้าคิวตรวจมือ"} · {health.unitIds.length ? `ใช้กับ ${health.unitIds.length} หน่วย` : "ใช้กับทุกหน่วย"}
      </div>

      {q && (
        <div
          className={`rounded-xl border px-3 py-2 ${q.low ? "border-amber-300 bg-amber-50 text-amber-900" : ""}`}
          data-testid="integration-health-quota"
          data-low={q.low ? "true" : "false"}
        >
          <div className="font-medium">
            โควตา: {q.percent !== null ? `เหลือ ${q.percent}%` : `เหลือ ${q.remaining ?? 0}`}
            {q.percent !== null && q.remaining !== null && q.limit !== null && (
              <span className="font-normal text-[color:var(--color-muted)]">
                {" "}
                ({q.remaining} จาก {q.limit})
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-[color:var(--color-muted)]">
            {q.low ? `ต่ำกว่าเกณฑ์เตือน ${thresholdPercent}% — แจ้งเจ้าของร้านแล้ว` : `เกณฑ์เตือน ${thresholdPercent}%`} · ตรวจล่าสุด {fmtTime(q.checkedAt)}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-[color:var(--color-muted)]">
          <span>การเรียก 14 วันล่าสุด</span>
          <span>
            ทั้งหมด {total} ครั้ง · ไม่สำเร็จ {fails}
          </span>
        </div>
        <svg data-testid="integration-health-chart" viewBox={`0 0 ${CHART_W} ${CHART_H}`} width="100%" height={CHART_H} role="img" aria-label="กราฟจำนวนการเรียกรายวัน">
          {health.daily.map((d, i) => {
            const okH = ((CHART_H - 4) * d.ok) / max;
            const failH = ((CHART_H - 4) * d.fail) / max;
            const x = i * slot + (slot - barW) / 2;
            return (
              <g key={d.day} data-testid="integration-health-bar" data-day={d.day} data-ok={d.ok} data-fail={d.fail}>
                <title>{`${d.day} · สำเร็จ ${d.ok} · ไม่สำเร็จ ${d.fail}${d.avgMs !== null ? ` · เฉลี่ย ${d.avgMs} มิลลิวินาที` : ""}`}</title>
                <rect x={x} y={CHART_H - 2} width={barW} height={2} fill="#e5e7eb" />
                {d.ok > 0 && <rect x={x} y={CHART_H - okH - failH} width={barW} height={okH} fill="#111827" rx={1} />}
                {d.fail > 0 && <rect x={x} y={CHART_H - failH} width={barW} height={failH} fill="#dc2626" rx={1} />}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-xs text-[color:var(--color-muted)]">ผลเรียกล่าสุด</div>
        {health.recent.length === 0 ? (
          <div className="text-xs text-[color:var(--color-muted)]">ยังไม่มีการเรียก</div>
        ) : (
          <ul className="flex flex-col divide-y">
            {health.recent.map((c, i) => (
              <li key={`${c.at}-${i}`} className="flex items-center justify-between gap-2 py-1 text-xs" data-testid="integration-health-call" data-ok={c.ok ? "true" : "false"}>
                <span className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${c.ok ? "bg-[color:var(--color-ink)]" : "bg-red-600"}`} />
                  <span className={c.ok ? "" : "text-red-700"}>{callText(c)}</span>
                  <span className="text-[color:var(--color-muted)]">· {opText(c.op)}</span>
                </span>
                <span className="text-[color:var(--color-muted)]">
                  {c.ms} มิลลิวินาที · {fmtTime(c.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
