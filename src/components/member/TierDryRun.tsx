// TierDryRun.tsx — "ทดลองรัน" กฎระดับสมาชิกทั้งระบบแบบไม่บันทึกจริง + ปุ่ม "ประเมินทั้งร้านตอนนี้" (M1.10 · ภาพ 04)
// ทดลองรัน: ประเมินสมาชิก ACTIVE ทุกคนด้วยกฎปัจจุบัน (ไม่ต้องรอถึงรอบทบทวน) แล้วแสดงว่าจะเลื่อน/ลด/คง/ใกล้ลด
// ประเมินทั้งร้านตอนนี้: ทำแบบเดียวกันแต่ **บันทึกจริง** — ต้องยืนยันก่อนเสมอ (ConfirmDialog)
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { MemberIcon } from "./MemberIcon";
import { dryRunAction, reviewNowAction } from "@/lib/modules/member/tiers-actions";
import type { ReviewResult } from "@/lib/modules/member/tiers";

const REASON_HINT: Record<string, string> = {
  RULE_UPGRADE: "เลื่อนระดับ",
  RULE_DOWNGRADE: "ลดระดับ",
  RULE_KEEP: "คงระดับ",
  MANUAL: "ตั้งด้วยมือ",
  INITIAL: "เริ่มต้น",
};

function Row({ label, count, tone }: { label: string; count: number; tone: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl border px-3 py-2" style={{ borderColor: "var(--color-line)" }}>
      <span className="text-lg font-semibold" style={{ color: tone }}>
        {count}
      </span>
      <span className="text-xs" style={{ color: "var(--color-muted)" }}>
        {label}
      </span>
    </div>
  );
}

export type TierDryRunProps = { systemId: string };

/** ทดลองรัน/ประเมินทั้งร้าน (`tiers-dryrun` · ปุ่ม `tiers-dryrun-run` · ผล `tiers-dryrun-result`) */
export function TierDryRun({ systemId }: TierDryRunProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const run = () => {
    setErr(null);
    startTransition(async () => {
      const res = await dryRunAction(systemId);
      if (!res.ok) {
        setErr(res.reason);
        return;
      }
      setResult(res.data.result);
      setNames(res.data.names);
      setShowAll(false);
    });
  };

  const rows = result ? [...result.upgraded.map((r) => ({ ...r, kind: "RULE_UPGRADE" as const })), ...result.downgraded.map((r) => ({ ...r, kind: "RULE_DOWNGRADE" as const })), ...result.atRisk.map((r) => ({ ...r, kind: "RULE_KEEP" as const }))].slice(0, 20) : [];

  return (
    <div data-testid="tiers-dryrun" className="flex flex-col gap-3 border-t pt-3" style={{ borderColor: "var(--color-line)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-testid="tiers-dryrun-run" className="btn btn-ghost text-sm" disabled={pending} onClick={run}>
          <MemberIcon name="chart" size="sm" /> {pending ? "กำลังทดลองรัน…" : "ทดลองรันได้"}
        </button>
        <ConfirmDialog
          testId="tiers-review-now"
          triggerLabel={
            <>
              <MemberIcon name="check" size="sm" /> ประเมินทั้งร้านตอนนี้
            </>
          }
          triggerClassName="btn btn-ghost text-sm"
          title="ประเมินระดับสมาชิกทั้งร้านตอนนี้?"
          detail="ระบบจะตรวจกฎเลื่อน/คงระดับของสมาชิกที่ยังใช้งานอยู่ทุกคนทันที และเปลี่ยนระดับจริงตามผล (ไม่ใช่แค่ทดลอง)"
          confirmLabel="ยืนยันประเมินตอนนี้"
          action={() =>
            startTransition(async () => {
              const res = await reviewNowAction(systemId);
              if (!res.ok) {
                setErr(res.reason);
                return;
              }
              setResult(res.data.result);
              setNames(res.data.names);
              setShowAll(false);
              router.refresh();
            })
          }
        />
        {err && <span className="text-xs" style={{ color: "var(--color-danger)" }}>{err}</span>}
      </div>

      {result && (
        <div data-testid="tiers-dryrun-result" className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Row label="จะเลื่อนระดับ" count={result.upgraded.length} tone="var(--color-accent)" />
            <Row label="จะลดระดับ" count={result.downgraded.length} tone="var(--color-danger)" />
            <Row label="คงระดับ" count={result.kept.length} tone="var(--color-ink)" />
            <Row label="ใกล้ลดระดับ" count={result.atRisk.length} tone="var(--color-danger)" />
          </div>
          {rows.length > 0 && (
            <table className="w-full text-left text-xs">
              <thead style={{ color: "var(--color-muted)" }}>
                <tr>
                  <th className="pb-1 font-normal">สมาชิก</th>
                  <th className="pb-1 font-normal">ผล</th>
                  <th className="pb-1 font-normal">จาก → ไป</th>
                </tr>
              </thead>
              <tbody>
                {(showAll ? rows : rows.slice(0, 5)).map((r, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--color-line)" }}>
                    <td className="py-1">{names[r.customerId] ?? r.customerId}</td>
                    <td className="py-1">{REASON_HINT[r.kind]}</td>
                    <td className="py-1">
                      {r.tier} → {r.toTier ?? "—"}
                      {typeof r.shortfall === "number" && r.shortfall > 0 ? ` (ขาด ${r.shortfall.toLocaleString("th-TH")})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {rows.length > 5 && (
            <button type="button" className="self-start text-xs" style={{ color: "var(--color-accent)" }} onClick={() => setShowAll((v) => !v)}>
              {showAll ? "ย่อรายชื่อ" : `ดูรายชื่อทั้งหมด (${rows.length}) ›`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default TierDryRun;
