// CampaignDetail.tsx — ผลของแคมเปญ 1 ใบ (M3.2 · ภาพ 07 ครึ่งล่าง + สถิติต่อ variant)
//
// โครง: การ์ดสรุป → ตารางผลต่อ variant (A / B / กลุ่มเทียบ) + บรรทัด uplift → รายชื่อผู้รับพร้อมสถานะ
// 🔴 กลุ่มเทียบต้องอยู่ในตารางเดียวกับ A/B เสมอ — ตัวเลข "ใช้สิทธิ์ 41%" ไม่มีความหมายถ้าไม่มีเส้นฐานข้าง ๆ
// 🔴 เหตุผลที่คนหนึ่งไม่ได้รับข้อความต้องอ่านออกจากหน้านี้ (คอลัมน์สุดท้าย) ไม่ใช่ต้องไปเปิดบันทึกระบบ
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MemberIcon } from "./MemberIcon";
import { cancelCampaignAction } from "@/lib/modules/marketing/campaigns-actions";

export type VariantRowView = {
  key: string;
  label: string;
  sent: number;
  opened: number;
  used: number;
  usePctLabel: string;
  saleBaht: string;
  costBaht: string;
  roiLabel: string;
};

export type RecipientRowView = {
  id: string;
  name: string;
  variantLabel: string;
  statusLabel: string;
  channelLabel: string;
  error: string | null;
  openedLabel: string;
  usedLabel: string;
};

export type CampaignDetailProps = {
  systemId: string;
  campaignId: string;
  statusLabel: string;
  segmentName: string | null;
  channelsLabel: string;
  canManage: boolean;
  canCancel: boolean;
  variants: VariantRowView[];
  upliftUsePctLabel: string;
  upliftPerHeadLabel: string;
  totals: { audience: number; sent: number; opened: number; used: number; saleBaht: string; costBaht: string; roiLabel: string };
  recipients: RecipientRowView[];
};

export function CampaignDetail(props: CampaignDetailProps) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const cancel = () => {
    setError(null);
    start(async () => {
      const res = await cancelCampaignAction(props.systemId, props.campaignId);
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div data-testid="campaign-detail" className="flex flex-col gap-4">
      <div className="card flex flex-wrap items-center gap-3 p-4 text-sm">
        <span className="rounded-lg border px-2 py-0.5 text-xs" style={{ borderColor: "var(--color-line)" }}>
          {props.statusLabel}
        </span>
        <span style={{ color: "var(--color-muted)" }}>{props.segmentName ?? "กลุ่มเฉพาะกิจ"}</span>
        <span style={{ color: "var(--color-muted)" }}>{props.channelsLabel}</span>
        <span className="flex-1" />
        {props.canManage && props.canCancel && (
          <button type="button" className="btn text-sm" disabled={busy} onClick={cancel}>
            <MemberIcon name="x" size="sm" /> ยกเลิกแคมเปญ
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      <section className="card p-0">
        <div data-testid="campaign-stats" className="flex flex-col">
          <div
            className="hidden gap-3 border-b px-4 py-2 text-xs sm:grid"
            style={{ gridTemplateColumns: "1.6fr repeat(6, 1fr)", borderColor: "var(--color-line)", color: "var(--color-muted)" }}
          >
            <span>กลุ่ม</span>
            <span className="text-right">ส่งเดือนนี้</span>
            <span className="text-right">เปิดอ่าน</span>
            <span className="text-right">ใช้สิทธิ์</span>
            <span className="text-right">ยอดที่เกิด</span>
            <span className="text-right">ต้นทุน</span>
            <span className="text-right">ROI</span>
          </div>
          {props.variants.length === 0 && (
            <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--color-muted)" }}>
              ยังไม่มีผลลัพธ์ — แคมเปญนี้ยังไม่ได้ส่ง
            </p>
          )}
          {props.variants.map((v) => (
            <div
              key={v.key}
              className="grid gap-1 border-t px-4 py-3 text-sm first:border-t-0 sm:gap-3"
              style={{ gridTemplateColumns: "1.6fr repeat(6, 1fr)", borderColor: "var(--color-line)" }}
            >
              <span className="col-span-full font-medium sm:col-span-1">{v.label}</span>
              <span className="text-right tabular-nums">{v.sent.toLocaleString("th-TH")}</span>
              <span className="text-right tabular-nums">{v.opened.toLocaleString("th-TH")}</span>
              <span className="text-right tabular-nums">
                {v.used.toLocaleString("th-TH")} <span style={{ color: "var(--color-muted)" }}>{v.usePctLabel}</span>
              </span>
              <span className="text-right tabular-nums">{v.saleBaht}</span>
              <span className="text-right tabular-nums">{v.costBaht}</span>
              <span className="text-right tabular-nums">{v.roiLabel}</span>
            </div>
          ))}
          <div className="border-t px-4 py-3 text-sm" style={{ borderColor: "var(--color-line)" }}>
            <p>
              <strong>ผลต่างจากกลุ่มเทียบ (uplift)</strong> — ใช้สิทธิ์ต่างกัน {props.upliftUsePctLabel} · ยอดต่อคนต่างกัน {props.upliftPerHeadLabel}
            </p>
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              กลุ่มเป้าหมาย {props.totals.audience.toLocaleString("th-TH")} คน · ส่งแล้ว {props.totals.sent.toLocaleString("th-TH")} · เปิดอ่าน{" "}
              {props.totals.opened.toLocaleString("th-TH")} · ใช้สิทธิ์ {props.totals.used.toLocaleString("th-TH")} · ยอดที่เกิด{" "}
              {props.totals.saleBaht} · ต้นทุน {props.totals.costBaht} · ROI {props.totals.roiLabel}
            </p>
          </div>
        </div>
      </section>

      <section className="card p-0">
        <div data-testid="campaign-recipients" className="flex flex-col">
          <div className="border-b px-4 py-2 text-xs" style={{ borderColor: "var(--color-line)", color: "var(--color-muted)" }}>
            ผู้รับ {props.recipients.length.toLocaleString("th-TH")} คน
          </div>
          {props.recipients.map((r) => (
            <div
              key={r.id}
              className="flex flex-col gap-1 border-t px-4 py-2.5 text-sm first:border-t-0 sm:flex-row sm:items-center sm:gap-4"
              style={{ borderColor: "var(--color-line)" }}
            >
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="flex flex-wrap items-center gap-3 text-xs sm:justify-end" style={{ color: "var(--color-muted)" }}>
                <span>{r.variantLabel}</span>
                <span>{r.channelLabel}</span>
                <span style={{ color: "var(--color-ink)" }}>{r.statusLabel}</span>
                <span>{r.openedLabel}</span>
                <span>{r.usedLabel}</span>
              </span>
              {r.error && (
                <span className="text-xs sm:max-w-[22rem] sm:text-right" style={{ color: "var(--color-muted)" }}>
                  {r.error}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default CampaignDetail;
